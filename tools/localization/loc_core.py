#!/usr/bin/env python3
"""Shared core for the KBKx localization engine.

This module holds everything the workbook and marketing-site pipelines have in
common so the two entry points cannot drift apart:

- Token / placeholder extraction and validation.
- Fingerprinting, text normalization and context-aware cache keys.
- JSON load/save/parse helpers.
- Glossary loading and per-language resolution.
- An LLM provider abstraction that uses structured (JSON-schema) outputs when
  the model supports them and falls back to prompt-only JSON parsing otherwise.
- A concurrent batch runner that keeps all file writes on the main thread.
"""
from __future__ import annotations

import hashlib
import json
import os
import re
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path
from typing import Any, Callable, Iterable, Sequence

# Placeholders we must never let the model alter: ICU/`{...}` (incl. one level of
# nesting), HTML tags, printf-style `%s`/`%1$d`, literal `\n`, and bare URLs.
TOKEN_RE = re.compile(
    r"\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\}"
    r"|<\/?[A-Za-z][^>]*>"
    r"|%\d*\$?[sdif]"
    r"|\\n"
    r"|https?://\S+"
)

LANGUAGE_NAMES = {
    "ja": "Japanese",
    "tw": "Traditional Chinese used in Taiwan",
    "kr": "Korean",
    "ko": "Korean",
}

# Canonical language codes the engine understands, with the aliases that may
# appear as CLI args, config values or column headers.
LANGUAGE_ALIASES = {
    "ja": "ja", "jp": "ja", "japanese": "ja",
    "tw": "tw", "zh-tw": "tw", "zh_tw": "tw",
    "kr": "kr", "ko": "kr", "korean": "kr",
}


# --------------------------------------------------------------------------- #
# Text / placeholder utilities
# --------------------------------------------------------------------------- #
def tokens(text: str | None) -> list[str]:
    """Sorted list of placeholder tokens found in ``text``."""
    return sorted(TOKEN_RE.findall(text or ""))


def tokens_match(a: str | None, b: str | None) -> bool:
    return tokens(a) == tokens(b)


def fingerprint(text: str | None) -> str:
    return hashlib.sha256((text or "").encode("utf-8")).hexdigest()[:16]


def normalize_text(text: str | None) -> str:
    return re.sub(r"\s+", " ", (text or "").strip())


def context_signature(key: str | None, depth: int) -> str:
    parts = [p for p in (key or "").split(".") if p]
    return ".".join(parts[:depth]) if parts else "_global"


def cache_key(text: str | None, context: str, depth: int) -> str:
    """Context-aware cache key.

    ``context`` is a dotted key (e.g. ``properties.source``); only its first
    ``depth`` segments participate, so identical copy in unrelated modules stays
    separate while repeated copy inside one module is reused.
    """
    payload = f"{context_signature(context, depth)}\n{normalize_text(text)}"
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()


def canonical_language(code: str) -> str:
    key = str(code).strip().lower()
    if key in LANGUAGE_ALIASES:
        return LANGUAGE_ALIASES[key]
    raise ValueError(f"Unsupported language code: {code!r}")


# --------------------------------------------------------------------------- #
# JSON helpers
# --------------------------------------------------------------------------- #
def load_json(path: Path, default: Any = None) -> Any:
    if not path.exists():
        return {} if default is None else default
    return json.loads(path.read_text(encoding="utf-8"))


def save_json_atomic(path: Path, data: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix + ".tmp")
    tmp.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
    tmp.replace(path)


def load_env_file(path: Path) -> None:
    """Load ``KEY=VALUE`` lines from a ``.env`` file into ``os.environ`` without
    overriding variables already set in the environment. Dependency-free and
    silent when the file is absent. Keep ``.env`` git-ignored; never commit keys.
    """
    try:
        if not path.exists():
            return
        for raw in path.read_text(encoding="utf-8").splitlines():
            line = raw.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            if line.lower().startswith("export "):
                line = line[7:].lstrip()
            key, _, value = line.partition("=")
            key = key.strip()
            value = value.strip().strip('"').strip("'")
            if key and key not in os.environ:
                os.environ[key] = value
    except Exception:  # noqa: BLE001 - env loading must never crash a run
        return


def clean_json(text: str) -> Any:
    value = (text or "").strip()
    if value.startswith("```"):
        value = re.sub(r"^```(?:json)?\s*|\s*```$", "", value, flags=re.S)
    return json.loads(value)


def parse_items(text: str) -> list[dict[str, Any]]:
    """Parse a model response into a list of item objects.

    Accepts either a bare JSON array (prompt-only mode) or a ``{"items": [...]}``
    object (structured-output mode).
    """
    data = clean_json(text)
    if isinstance(data, dict) and "items" in data:
        data = data["items"]
    if not isinstance(data, list):
        raise ValueError("Expected a JSON array or an object with an 'items' array")
    return data


def flatten(obj: Any, prefix: str = "") -> dict[str, Any]:
    out: dict[str, Any] = {}
    if isinstance(obj, dict):
        for k, v in obj.items():
            key = f"{prefix}.{k}" if prefix else k
            out.update(flatten(v, key))
    else:
        out[prefix] = obj
    return out


def unflatten(flat: dict[str, Any]) -> dict[str, Any]:
    root: dict[str, Any] = {}
    for dotted, val in flat.items():
        cur = root
        parts = dotted.split(".")
        for p in parts[:-1]:
            cur = cur.setdefault(p, {})
        cur[parts[-1]] = val
    return root


# --------------------------------------------------------------------------- #
# Glossary helpers
# --------------------------------------------------------------------------- #
def load_glossary(path: Path | None) -> dict[str, Any]:
    return load_json(path, {}) if path else {}


def glossary_for(language: str, *glossaries: dict[str, Any]) -> dict[str, str]:
    """Resolve approved terms for ``language`` across one or more glossaries."""
    lang = canonical_language(language)
    out: dict[str, str] = {}
    for glossary in glossaries:
        for concept, value in glossary.items():
            if not isinstance(value, dict):
                continue
            term = value.get(lang) or value.get(language)
            if term:
                out[concept] = str(term)
    return out


def glossary_violations(source_en: str, translation: str, terms: dict[str, str]) -> list[str]:
    """Approved terms whose English concept appears in the source but whose
    target rendering is missing from the translation. Advisory only."""
    missing = []
    low = (source_en or "").lower()
    for concept, target in terms.items():
        if concept.lower() in low and target and target not in (translation or ""):
            missing.append(f"{concept} => {target}")
    return missing


def length_ratio_flag(source: str, translation: str, low: float = 0.4, high: float = 3.0) -> str:
    """Flag translations whose length is far from the source (layout risk)."""
    s = len((source or "").strip())
    t = len((translation or "").strip())
    if s == 0 or t == 0:
        return ""
    ratio = t / s
    if ratio < low or ratio > high:
        return f"Length ratio {ratio:.2f} (source={s}, target={t})"
    return ""


# --------------------------------------------------------------------------- #
# JSON schemas for structured outputs
# --------------------------------------------------------------------------- #
def _items_schema(item_properties: dict[str, Any]) -> dict[str, Any]:
    return {
        "type": "object",
        "additionalProperties": False,
        "properties": {
            "items": {
                "type": "array",
                "items": {
                    "type": "object",
                    "additionalProperties": False,
                    "properties": item_properties,
                    "required": list(item_properties.keys()),
                },
            }
        },
        "required": ["items"],
    }


ENGLISH_ROW_SCHEMA = _items_schema({
    "row": {"type": "integer"},
    "corrected_english": {"type": "string"},
    "changed": {"type": "boolean"},
    "note": {"type": "string"},
})

TRANSLATION_ROW_SCHEMA = _items_schema({
    "row": {"type": "integer"},
    "translation": {"type": "string"},
    "note": {"type": "string"},
})

ENGLISH_KEY_SCHEMA = _items_schema({
    "key": {"type": "string"},
    "corrected_english": {"type": "string"},
    "changed": {"type": "boolean"},
    "note": {"type": "string"},
})

TRANSLATION_KEY_SCHEMA = _items_schema({
    "key": {"type": "string"},
    "translation": {"type": "string"},
    "note": {"type": "string"},
})


# --------------------------------------------------------------------------- #
# LLM provider abstraction
# --------------------------------------------------------------------------- #
class LLMProvider:
    """Thin wrapper around a chat/completions provider.

    Only the OpenAI Responses API is implemented today, but every pipeline goes
    through ``generate_items`` so swapping providers is a one-place change.
    The call tries structured (JSON-schema) output first and transparently
    falls back to prompt-only JSON if the model rejects the parameters.
    """

    def __init__(
        self,
        model: str,
        *,
        provider: str = "openai",
        timeout: float = 180.0,
        sdk_max_retries: int = 2,
        retries: int = 3,
        temperature: float | None = None,
        use_structured_output: bool = True,
    ) -> None:
        self.model = model
        self.provider = provider
        self.timeout = float(timeout)
        self.retries = max(1, int(retries))
        self.temperature = temperature
        self.use_structured_output = use_structured_output
        # Capabilities we disable permanently once the model rejects them, so we
        # do not pay the failed-attempt tax on every subsequent batch.
        self._structured_disabled = False
        self._temperature_disabled = False

        if provider != "openai":
            raise ValueError(f"Unsupported provider: {provider!r}")
        if not os.environ.get("OPENAI_API_KEY"):
            raise RuntimeError("OPENAI_API_KEY is not set")
        from openai import OpenAI  # imported lazily so --help works without the SDK

        self.client = OpenAI(timeout=timeout, max_retries=int(sdk_max_retries))

    def _create_once(self, instructions: str, prompt: str, schema: dict[str, Any] | None,
                     schema_name: str) -> str:
        kwargs: dict[str, Any] = {
            "model": self.model,
            "instructions": instructions,
            "input": prompt,
        }
        use_schema = schema is not None and self.use_structured_output and not self._structured_disabled
        if use_schema:
            kwargs["text"] = {
                "format": {
                    "type": "json_schema",
                    "name": schema_name,
                    "strict": True,
                    "schema": schema,
                }
            }
        if self.temperature is not None and not self._temperature_disabled:
            kwargs["temperature"] = self.temperature

        try:
            response = self.client.responses.create(**kwargs)
            return response.output_text
        except Exception as exc:  # noqa: BLE001
            message = str(exc).lower()
            # Degrade unsupported parameters once, then let the retry loop reissue.
            degraded = False
            if use_schema and ("response_format" in message or "json_schema" in message
                               or "text.format" in message or "unsupported" in message
                               or "schema" in message):
                self._structured_disabled = True
                degraded = True
            if (self.temperature is not None and not self._temperature_disabled
                    and "temperature" in message):
                self._temperature_disabled = True
                degraded = True
            if degraded:
                # Retry immediately with the reduced parameter set.
                return self._create_once(instructions, prompt, schema, schema_name)
            raise

    def generate_items(
        self,
        instructions: str,
        payload: list[dict[str, Any]],
        schema: dict[str, Any] | None = None,
        schema_name: str = "localization_result",
    ) -> list[dict[str, Any]]:
        prompt = json.dumps(payload, ensure_ascii=False)
        last_error: Exception | None = None
        for attempt in range(1, self.retries + 1):
            try:
                text = self._create_once(instructions, prompt, schema, schema_name)
                return parse_items(text)
            except Exception as exc:  # noqa: BLE001
                last_error = exc
                if attempt < self.retries:
                    time.sleep(2 ** attempt)
        raise RuntimeError(f"Request failed after {self.retries} attempts: {last_error}")

    def generate_one(self, spec: dict[str, Any]) -> list[dict[str, Any]]:
        return self.generate_items(
            spec["instructions"], spec["payload"],
            spec.get("schema"), spec.get("schema_name", "localization_result"),
        )

    def generate_items_batch(self, specs: list[dict[str, Any]], **batch_opts) -> list[list[dict[str, Any]]]:
        """Submit all ``specs`` through the OpenAI Batch API (~50% cheaper, async)
        and return one result list per spec, aligned by position.

        NOTE: exercises the async Batch endpoint; verify against your account on a
        small run before relying on it in production.
        """
        import loc_batch
        return loc_batch.run_openai_batch(self, specs, **batch_opts)


class AnthropicProvider:
    """Claude backend. Uses tool-use with a JSON-Schema ``input_schema`` to get
    schema-validated structured output natively, falling back to text JSON."""

    def __init__(
        self,
        model: str,
        *,
        timeout: float = 180.0,
        sdk_max_retries: int = 2,
        retries: int = 3,
        temperature: float | None = None,
        use_structured_output: bool = True,
        max_tokens: int = 8000,
    ) -> None:
        self.model = model
        self.provider = "anthropic"
        self.timeout = float(timeout)
        self.retries = max(1, int(retries))
        self.temperature = temperature
        self.use_structured_output = use_structured_output
        self.max_tokens = int(max_tokens)

        if not os.environ.get("ANTHROPIC_API_KEY"):
            raise RuntimeError("ANTHROPIC_API_KEY is not set")
        from anthropic import Anthropic  # imported lazily

        self.client = Anthropic(timeout=timeout, max_retries=int(sdk_max_retries))

    def build_params(self, instructions: str, payload: list[dict[str, Any]],
                     schema: dict[str, Any] | None, schema_name: str) -> dict[str, Any]:
        prompt = json.dumps(payload, ensure_ascii=False)
        params: dict[str, Any] = {
            "model": self.model,
            "max_tokens": self.max_tokens,
            "system": instructions,
            "messages": [{"role": "user", "content": prompt}],
        }
        if self.temperature is not None:
            params["temperature"] = self.temperature
        if schema is not None and self.use_structured_output:
            params["tools"] = [{
                "name": schema_name,
                "description": "Return the localization items.",
                "input_schema": schema,
            }]
            params["tool_choice"] = {"type": "tool", "name": schema_name}
        return params

    @staticmethod
    def extract_items(message: Any) -> list[dict[str, Any]]:
        """Pull items out of a Claude message (tool_use input, else text JSON)."""
        content = getattr(message, "content", None) or []
        for block in content:
            btype = getattr(block, "type", None) or (block.get("type") if isinstance(block, dict) else None)
            if btype == "tool_use":
                data = getattr(block, "input", None)
                if data is None and isinstance(block, dict):
                    data = block.get("input")
                if isinstance(data, dict) and "items" in data:
                    return data["items"]
                if isinstance(data, list):
                    return data
        for block in content:
            text = getattr(block, "text", None) or (block.get("text") if isinstance(block, dict) else None)
            if text:
                return parse_items(text)
        raise ValueError("No tool_use or text content in Claude response")

    def generate_items(
        self,
        instructions: str,
        payload: list[dict[str, Any]],
        schema: dict[str, Any] | None = None,
        schema_name: str = "localization_result",
    ) -> list[dict[str, Any]]:
        params = self.build_params(instructions, payload, schema, schema_name)
        last_error: Exception | None = None
        for attempt in range(1, self.retries + 1):
            try:
                message = self.client.messages.create(**params)
                return self.extract_items(message)
            except Exception as exc:  # noqa: BLE001
                last_error = exc
                if attempt < self.retries:
                    time.sleep(2 ** attempt)
        raise RuntimeError(f"Request failed after {self.retries} attempts: {last_error}")

    def generate_one(self, spec: dict[str, Any]) -> list[dict[str, Any]]:
        return self.generate_items(
            spec["instructions"], spec["payload"],
            spec.get("schema"), spec.get("schema_name", "localization_result"),
        )

    def generate_items_batch(self, specs: list[dict[str, Any]], **batch_opts) -> list[list[dict[str, Any]]]:
        """Submit all ``specs`` through the Anthropic Message Batches API.

        NOTE: exercises the async Batches endpoint; verify on a small run first.
        """
        import loc_batch
        return loc_batch.run_anthropic_batch(self, specs, **batch_opts)


# --------------------------------------------------------------------------- #
# Concurrency
# --------------------------------------------------------------------------- #
def chunk(items: Sequence[Any], size: int) -> list[list[Any]]:
    size = max(1, int(size))
    return [list(items[i:i + size]) for i in range(0, len(items), size)]


def run_batches(
    batches: Sequence[list[Any]],
    worker: Callable[[list[Any]], Any],
    max_workers: int,
) -> Iterable[tuple[int, list[Any], Any]]:
    """Run ``worker`` over each batch concurrently and yield results as they
    complete, as ``(index, batch, result)``.

    Workers must be side-effect free with respect to shared mutable state
    (workbook cells, caches): the caller applies results and checkpoints on the
    main thread, in the order results are yielded here.
    """
    workers = max(1, int(max_workers))
    if workers == 1 or len(batches) <= 1:
        for i, batch in enumerate(batches):
            yield i, batch, worker(batch)
        return

    with ThreadPoolExecutor(max_workers=workers) as pool:
        future_to_index = {pool.submit(worker, batch): i for i, batch in enumerate(batches)}
        for future in as_completed(future_to_index):
            i = future_to_index[future]
            yield i, batches[i], future.result()


def dispatch(
    provider: Any,
    specs: list[dict[str, Any]],
    max_workers: int,
    use_batch: bool = False,
    **batch_opts,
) -> Iterable[tuple[int, list[dict[str, Any]]]]:
    """Run request ``specs`` and yield ``(index, items)`` for each.

    A spec is ``{"instructions", "payload", "schema", "schema_name"}``.
    ``use_batch`` routes everything through the provider's async Batch API in a
    single submission (cheaper, no per-batch streaming); otherwise specs run
    concurrently and are yielded as they complete.
    """
    if not specs:
        return
    if use_batch:
        results = provider.generate_items_batch(specs, **batch_opts)
        for i, items in enumerate(results):
            yield i, items
        return
    for i, _spec, items in run_batches(specs, provider.generate_one, max_workers):
        yield i, items


def build_provider(config: dict[str, Any], model_override: str | None = None):
    """Construct the configured provider backend from a config dict."""
    temperature = config.get("temperature")
    send_temp = bool(config.get("send_temperature", False))
    temp_value = float(temperature) if (temperature is not None and send_temp) else None
    name = str(config.get("provider", "openai")).lower()

    if name in ("anthropic", "claude"):
        return AnthropicProvider(
            model=model_override or config.get("model", "claude-sonnet-5-5"),
            timeout=float(config.get("request_timeout_seconds", 180)),
            sdk_max_retries=int(config.get("sdk_max_retries", 2)),
            retries=int(config.get("max_retries", 3)),
            temperature=temp_value,
            use_structured_output=bool(config.get("use_structured_output", True)),
            max_tokens=int(config.get("max_tokens", 8000)),
        )

    return LLMProvider(
        model=model_override or config.get("model", "gpt-5.4-mini"),
        provider="openai",
        timeout=float(config.get("request_timeout_seconds", 180)),
        sdk_max_retries=int(config.get("sdk_max_retries", 2)),
        retries=int(config.get("max_retries", 3)),
        temperature=float(temperature) if (temperature is not None
                                           and config.get("send_temperature", False)) else None,
        use_structured_output=bool(config.get("use_structured_output", True)),
    )
