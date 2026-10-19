#!/usr/bin/env python3
"""KBKx marketing-site localization pipeline (v6).

Translates the Kabuk Exchange marketing site's nested i18n JSON locale files
(``en.json`` -> ``ja.json`` / ``zh-TW.json`` / ``ko.json``).

Shares ``loc_core`` with the workbook pipeline: structured model outputs,
concurrent batches, context-aware translation memory, placeholder validation,
and advisory glossary / length QA.
"""
from __future__ import annotations

import argparse
from pathlib import Path
from typing import Any

import loc_core as core

ENGLISH_TONE = {
    "seo": "Optimize for natural, accurate SEO metadata. Keep titles concise and descriptions compelling without keyword stuffing.",
    "marketing": "Use polished enterprise B2B travel-technology marketing language. Preserve positioning, trust, scale, and clarity.",
    "technical": "Use precise developer and integration terminology. Avoid promotional exaggeration.",
    "general": "Use concise, natural website copy.",
}

TRANSLATION_TONE = {
    "seo": "Translate as natural search and social metadata for the target market; keep title and description lengths practical.",
    "marketing": "Transcreate polished enterprise B2B travel-technology copy. Preserve brand positioning rather than translating mechanically.",
    "technical": "Translate precisely using standard travel-tech and API terminology.",
    "general": "Translate naturally and concisely.",
}


def section_of(key: str, depth: int) -> str:
    return ".".join(key.split(".")[:depth])


def prompt_type(key: str, cfg: dict) -> str:
    top = key.split(".")[0]
    if top in cfg.get("seo_prefixes", []):
        return "seo"
    if top in cfg.get("marketing_prefixes", []):
        return "marketing"
    if top in cfg.get("technical_prefixes", []):
        return "technical"
    return "general"


def english_instructions(kind: str) -> str:
    return f"""You are the senior English UX and marketing copy editor for KBKx.
Rewrite the supplied website strings into polished native English before localization.

{ENGLISH_TONE[kind]}

Return the result as items; each item has key, corrected_english, changed, note.
Preserve HTML, placeholders, URLs, product names, punctuation tokens, and meaning.
Do not alter KabuK Exchange, KBKx, KabuK Style, HafH, API names, partner names, or legal meaning.
"""


def translation_instructions(lang: str, kind: str, glossary: dict[str, str]) -> str:
    g = "\n".join(f"- {k} => {v}" for k, v in glossary.items())
    return f"""You are the localization lead for KBKx.
Translate corrected English website copy into {core.LANGUAGE_NAMES[lang]}.

{TRANSLATION_TONE[kind]}

Return the result as items; each item has key, translation, note.
Preserve HTML, placeholders, URLs, line breaks, product names, and technical tokens exactly.
For Taiwan, use Taiwan Traditional Chinese terminology, not Simplified Chinese.
Use the approved glossary when relevant:
{g}
"""


def representatives_by_context(items: list[dict], depth: int):
    """Group items sharing the same (section-context, text) so identical copy is
    sent to the model once and fanned back out to every member key."""
    groups: dict[str, list[dict]] = {}
    for item in items:
        ck = core.cache_key(item["text"], item["key"], depth)
        groups.setdefault(ck, []).append(item)
    reps = [members[0] for members in groups.values()]
    return reps, groups


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--config", default="marketing_config.json")
    ap.add_argument("--languages", nargs="+")
    ap.add_argument("--model")
    ap.add_argument("--batch-size", type=int)
    ap.add_argument("--max-workers", type=int)
    ap.add_argument("--batch", action="store_true", help="Use the async Batch API (cheaper, slower).")
    args = ap.parse_args()

    cp = Path(args.config)
    cfg = core.load_json(cp)
    base = cp.parent
    core.load_env_file(base / ".env")  # optional; never overrides a set env var

    src = base / cfg["source_file"]
    outdir = base / cfg["output_dir"]
    corrected_path = outdir / cfg.get("corrected_english_file", "en.corrected.json")
    qa_path = outdir / cfg.get("qa_report_file", "marketing_localization_qa.json")
    copy_map_path = outdir / cfg.get("site_copy_map_file", "marketing_copy_map.json")
    cache_path = base / cfg.get("translation_memory_file", "localization_cache.json")

    model = args.model or cfg.get("model", "gpt-5.4-mini")
    batch_size = args.batch_size or int(cfg.get("batch_size", 30))
    max_workers = args.max_workers or int(cfg.get("max_workers", 4))
    use_batch = args.batch or bool(cfg.get("batch_api", False))
    batch_opts = {
        "poll_interval": float(cfg.get("batch_poll_interval_seconds", 15)),
        "timeout": float(cfg.get("batch_timeout_seconds", 86400)),
    }
    depth = int(cfg.get("section_depth", 1))
    # The example/live locale files use flat dotted keys (e.g. "hero.title").
    # Preserve that shape by default; set nested_json=true for nested objects.
    nested_json = bool(cfg.get("nested_json", False))
    review_when_changed = bool(cfg.get("review_existing_when_english_changes", True))
    glossary_check = bool(cfg.get("check_glossary_compliance", True))
    length_check = bool(cfg.get("check_length_ratio", True))

    locales = cfg["locales"]
    requested = [core.canonical_language(x) for x in args.languages] if args.languages else None

    source_nested = core.load_json(src, {})
    source = core.flatten(source_nested)
    corrected_existing = core.flatten(core.load_json(corrected_path, {}))

    cache = core.load_json(cache_path, {})
    cache.setdefault("marketing", {}).setdefault("english", {})
    cache["marketing"].setdefault("translations", {})
    for lang in ("ja", "tw", "kr"):
        cache["marketing"]["translations"].setdefault(lang, {})

    core_glossary = core.load_json(base / cfg["core_glossary_file"], {})
    marketing_glossary = core.load_json(base / cfg["marketing_glossary_file"], {})
    provider = core.build_provider(cfg, model_override=model)

    qa: list[dict] = []
    copy_map: dict[str, Any] = {}

    def save_cache():
        core.save_json_atomic(cache_path, cache)

    def write_locale(path: Path, flat: dict[str, Any]) -> None:
        core.save_json_atomic(path, core.unflatten(flat) if nested_json else dict(flat))

    # ------------------------------ English phase ------------------------------ #
    corrected: dict[str, Any] = {}
    changed_keys: set[str] = set()
    english_pending: list[dict] = []

    for key, val in source.items():
        if not isinstance(val, str):
            corrected[key] = val
            continue
        ck = core.cache_key(val, key, depth)
        cached = cache["marketing"]["english"].get(ck)
        if cached:
            corrected[key] = cached["corrected_english"]
            if corrected[key] != val:
                changed_keys.add(key)
            continue
        english_pending.append({"key": key, "text": val, "kind": prompt_type(key, cfg),
                                "section": section_of(key, depth), "cache_key": ck})

    reps, english_groups = representatives_by_context(english_pending, depth)

    # Build one job per (kind, batch) so each job carries the right instructions.
    english_jobs: list[dict] = []
    by_kind: dict[str, list[dict]] = {}
    for rep in reps:
        by_kind.setdefault(rep["kind"], []).append(rep)
    for kind, kind_reps in by_kind.items():
        for batch in core.chunk(kind_reps, batch_size):
            english_jobs.append({
                "kind": kind,
                "instructions": english_instructions(kind),
                "reps": batch,
                "payload": [{"key": r["key"], "english": r["text"]} for r in batch],
                "schema": core.ENGLISH_KEY_SCHEMA,
                "schema_name": "english_normalization",
            })

    print(f"English: {len(english_pending)} pending; {len(reps)} unique; "
          f"{len(english_jobs)} batches (workers={max_workers})", flush=True)

    total = len(english_jobs)
    for i, results in core.dispatch(provider, english_jobs, max_workers, use_batch, **batch_opts):
        job = english_jobs[i]
        by = {str(x.get("key")): x for x in results if "key" in x}
        print(f"  English batch {i + 1}/{total} [{job['kind']}]: {len(job['reps'])} unique", flush=True)
        for rep in job["reps"]:
            r = by.get(rep["key"], {})
            c = str(r.get("corrected_english", rep["text"])).strip() or rep["text"]
            if not core.tokens_match(c, rep["text"]):
                qa.append({"language": "en", "key": rep["key"], "issue": "placeholder mismatch", "suggestion": c})
                c = rep["text"]
            cache["marketing"]["english"][rep["cache_key"]] = {"corrected_english": c}
            for member in english_groups[rep["cache_key"]]:
                corrected[member["key"]] = c
                if c != member["text"]:
                    changed_keys.add(member["key"])
        save_cache()
        write_locale(corrected_path, corrected)

    for key, val in source.items():
        corrected.setdefault(key, corrected_existing.get(key, val))
    write_locale(corrected_path, corrected)

    # ----------------------------- Translation phase ---------------------------- #
    for lang_code, filename in locales.items():
        lang = core.canonical_language(lang_code)
        if requested and lang not in requested:
            continue
        target_path = outdir / filename
        existing = core.flatten(core.load_json(target_path, {}))
        glossary = core.glossary_for(lang, core_glossary, marketing_glossary)

        pending: list[dict] = []
        for key, corr in corrected.items():
            if not isinstance(corr, str):
                continue
            old = existing.get(key)
            needs = old in (None, "") or (review_when_changed and key in changed_keys)
            if not needs:
                continue
            ck = core.cache_key(corr, key, depth)
            cached = cache["marketing"]["translations"][lang].get(ck)
            if cached and core.tokens_match(cached["translation"], corr):
                existing[key] = cached["translation"]
                continue
            pending.append({"key": key, "text": corr, "existing": old or "",
                            "kind": prompt_type(key, cfg), "cache_key": ck})

        reps, trans_groups = representatives_by_context(pending, depth)
        jobs: list[dict] = []
        by_kind = {}
        for rep in reps:
            by_kind.setdefault(rep["kind"], []).append(rep)
        for kind, kind_reps in by_kind.items():
            for batch in core.chunk(kind_reps, batch_size):
                jobs.append({
                    "kind": kind,
                    "instructions": translation_instructions(lang, kind, glossary),
                    "reps": batch,
                    "payload": [{"key": r["key"], "corrected_english": r["text"],
                                 "existing_translation": r["existing"]} for r in batch],
                    "schema": core.TRANSLATION_KEY_SCHEMA,
                    "schema_name": "translation",
                })

        print(f"{core.LANGUAGE_NAMES[lang]}: {len(pending)} pending; {len(reps)} unique; "
              f"{len(jobs)} batches (workers={max_workers})", flush=True)

        total = len(jobs)
        for i, results in core.dispatch(provider, jobs, max_workers, use_batch, **batch_opts):
            job = jobs[i]
            by = {str(x.get("key")): x for x in results if "key" in x}
            print(f"  {core.LANGUAGE_NAMES[lang]} batch {i + 1}/{total} [{job['kind']}]: "
                  f"{len(job['reps'])} unique", flush=True)
            for rep in job["reps"]:
                r = by.get(rep["key"], {})
                t = str(r.get("translation", "")).strip()
                note = str(r.get("note", "")).strip()
                if not t:
                    qa.append({"language": lang, "key": rep["key"], "issue": "missing result"})
                    continue
                if not core.tokens_match(t, rep["text"]):
                    qa.append({"language": lang, "key": rep["key"],
                               "issue": "placeholder mismatch", "translation": t})
                    continue

                advisories = []
                if glossary_check:
                    violations = core.glossary_violations(rep["text"], t, glossary)
                    if violations:
                        advisories.append("Glossary not applied: " + ", ".join(violations))
                if length_check:
                    ratio = core.length_ratio_flag(rep["text"], t)
                    if ratio:
                        advisories.append(ratio)
                combined = "; ".join(p for p in (note, *advisories) if p)
                if combined:
                    qa.append({"language": lang, "key": rep["key"], "issue": "advisory", "note": combined})

                cache["marketing"]["translations"][lang][rep["cache_key"]] = {"translation": t}
                for member in trans_groups[rep["cache_key"]]:
                    existing[member["key"]] = t
                    copy_map[member["key"]] = {
                        "original_en": source.get(member["key"]),
                        "corrected_en": corrected.get(member["key"]),
                    }
            save_cache()
            write_locale(target_path, existing)

        write_locale(target_path, existing)

    core.save_json_atomic(qa_path, qa)
    core.save_json_atomic(copy_map_path, copy_map)
    print(f"Complete. Files written to {outdir}", flush=True)
    return 0


if __name__ == "__main__":
    main()
