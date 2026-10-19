#!/usr/bin/env python3
"""Async Batch API support for the KBKx localization engine.

Both OpenAI (Batch API) and Anthropic (Message Batches) offer ~50% cheaper,
asynchronous processing for large non-urgent jobs. This module submits every
request spec of a phase in a single batch, polls to completion, and returns one
result list per spec, aligned by position.

The request builders and the result parsers are pure functions (unit-tested
offline). Only ``run_openai_batch`` / ``run_anthropic_batch`` touch the network;
they are opt-in (``--batch``) and should be smoke-tested against your account
before production use.
"""
from __future__ import annotations

import io
import json
import time
from typing import Any

import loc_core as core

CUSTOM_ID_PREFIX = "req-"


def _custom_id(index: int) -> str:
    return f"{CUSTOM_ID_PREFIX}{index}"


def _index_of(custom_id: str) -> int:
    return int(str(custom_id).split(CUSTOM_ID_PREFIX, 1)[-1])


# --------------------------------------------------------------------------- #
# OpenAI Batch API
# --------------------------------------------------------------------------- #
def build_openai_jsonl(provider: Any, specs: list[dict[str, Any]]) -> str:
    """One JSONL line per spec for the ``/v1/responses`` batch endpoint."""
    lines = []
    for i, spec in enumerate(specs):
        body: dict[str, Any] = {
            "model": provider.model,
            "instructions": spec["instructions"],
            "input": json.dumps(spec["payload"], ensure_ascii=False),
        }
        schema = spec.get("schema")
        if schema is not None and getattr(provider, "use_structured_output", True):
            body["text"] = {
                "format": {
                    "type": "json_schema",
                    "name": spec.get("schema_name", "localization_result"),
                    "strict": True,
                    "schema": schema,
                }
            }
        if getattr(provider, "temperature", None) is not None:
            body["temperature"] = provider.temperature
        lines.append(json.dumps({
            "custom_id": _custom_id(i),
            "method": "POST",
            "url": "/v1/responses",
            "body": body,
        }, ensure_ascii=False))
    return "\n".join(lines)


def extract_openai_output_text(body: dict[str, Any]) -> str:
    """Concatenate the text parts of a raw Responses API body."""
    if not isinstance(body, dict):
        return ""
    if isinstance(body.get("output_text"), str):
        return body["output_text"]
    parts = []
    for item in body.get("output", []) or []:
        for block in item.get("content", []) or []:
            text = block.get("text")
            if isinstance(text, str):
                parts.append(text)
    return "".join(parts)


def parse_openai_batch_output(text: str, n: int) -> list[list[dict[str, Any]]]:
    """Parse the batch output JSONL into ``n`` aligned result lists."""
    results: list[list[dict[str, Any]]] = [[] for _ in range(n)]
    for line in (text or "").splitlines():
        line = line.strip()
        if not line:
            continue
        record = json.loads(line)
        try:
            idx = _index_of(record.get("custom_id", ""))
        except (ValueError, TypeError):
            continue
        if not (0 <= idx < n):
            continue
        response = record.get("response") or {}
        body = response.get("body") or {}
        out = extract_openai_output_text(body)
        if out:
            try:
                results[idx] = core.parse_items(out)
            except Exception:  # noqa: BLE001
                results[idx] = []
    return results


def run_openai_batch(provider: Any, specs: list[dict[str, Any]], *,
                     poll_interval: float = 15.0, timeout: float = 86400.0) -> list[list[dict[str, Any]]]:
    client = provider.client
    jsonl = build_openai_jsonl(provider, specs)
    upload = client.files.create(
        file=("batch_input.jsonl", io.BytesIO(jsonl.encode("utf-8"))),
        purpose="batch",
    )
    batch = client.batches.create(
        input_file_id=upload.id,
        endpoint="/v1/responses",
        completion_window="24h",
    )
    print(f"  Submitted OpenAI batch {batch.id} ({len(specs)} requests); polling...", flush=True)

    deadline = time.time() + timeout
    while True:
        batch = client.batches.retrieve(batch.id)
        status = getattr(batch, "status", None)
        if status == "completed":
            break
        if status in ("failed", "expired", "cancelled", "cancelling"):
            raise RuntimeError(f"OpenAI batch {batch.id} ended with status {status}")
        if time.time() > deadline:
            raise TimeoutError(f"OpenAI batch {batch.id} did not complete within {timeout}s")
        time.sleep(poll_interval)

    output_file_id = getattr(batch, "output_file_id", None)
    if not output_file_id:
        raise RuntimeError(f"OpenAI batch {batch.id} completed without an output file")
    content = client.files.content(output_file_id)
    text = content.text if hasattr(content, "text") else content.read().decode("utf-8")
    return parse_openai_batch_output(text, len(specs))


# --------------------------------------------------------------------------- #
# Anthropic Message Batches
# --------------------------------------------------------------------------- #
def build_anthropic_requests(provider: Any, specs: list[dict[str, Any]]) -> list[dict[str, Any]]:
    requests = []
    for i, spec in enumerate(specs):
        params = provider.build_params(
            spec["instructions"], spec["payload"],
            spec.get("schema"), spec.get("schema_name", "localization_result"),
        )
        requests.append({"custom_id": _custom_id(i), "params": params})
    return requests


def parse_anthropic_results(entries: Any, n: int) -> list[list[dict[str, Any]]]:
    """Map Message Batches results (iterable of entries) to aligned lists."""
    results: list[list[dict[str, Any]]] = [[] for _ in range(n)]
    for entry in entries:
        custom_id = getattr(entry, "custom_id", None) or (
            entry.get("custom_id") if isinstance(entry, dict) else None)
        try:
            idx = _index_of(custom_id)
        except (ValueError, TypeError):
            continue
        if not (0 <= idx < n):
            continue
        result = getattr(entry, "result", None) or (
            entry.get("result") if isinstance(entry, dict) else None)
        rtype = getattr(result, "type", None) or (
            result.get("type") if isinstance(result, dict) else None)
        if rtype != "succeeded":
            continue
        message = getattr(result, "message", None) or (
            result.get("message") if isinstance(result, dict) else None)
        try:
            results[idx] = core.AnthropicProvider.extract_items(message)
        except Exception:  # noqa: BLE001
            results[idx] = []
    return results


def run_anthropic_batch(provider: Any, specs: list[dict[str, Any]], *,
                        poll_interval: float = 15.0, timeout: float = 86400.0) -> list[list[dict[str, Any]]]:
    client = provider.client
    requests = build_anthropic_requests(provider, specs)
    batch = client.messages.batches.create(requests=requests)
    print(f"  Submitted Anthropic batch {batch.id} ({len(specs)} requests); polling...", flush=True)

    deadline = time.time() + timeout
    while True:
        batch = client.messages.batches.retrieve(batch.id)
        status = getattr(batch, "processing_status", None)
        if status == "ended":
            break
        if status in ("canceling", "cancelled"):
            raise RuntimeError(f"Anthropic batch {batch.id} ended with status {status}")
        if time.time() > deadline:
            raise TimeoutError(f"Anthropic batch {batch.id} did not complete within {timeout}s")
        time.sleep(poll_interval)

    entries = client.messages.batches.results(batch.id)
    return parse_anthropic_results(entries, len(specs))
