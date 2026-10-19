<!-- ------------------------------------------------------------------ -->
<!-- How this engine is wired into kabukexchange-site (repo-specific).    -->
<!-- ------------------------------------------------------------------ -->

# Localization engine — kabukexchange-site integration

This folder vendors the KBKx localization engine and is wired to translate the
site's i18n locale files in place.

- **Source of truth:** `i18n/en.json` (flat dotted keys, e.g. `hero.title`).
- **Targets:** `i18n/ja.json`, `i18n/zh-TW.json`, `i18n/ko.json`
  (engine language codes `ja`, `tw`, `kr` respectively).
- **Arabic (`i18n/ar.json`) is intentionally NOT handled** — no Arabic glossary
  or engine support. Leave it to native review.
- Config: [`marketing_config.json`](marketing_config.json). All paths in it are
  resolved relative to this folder, so it writes the locale files (plus
  `i18n/en.corrected.json`, `i18n/marketing_copy_map.json`,
  `i18n/marketing_localization_qa.json`) directly into `i18n/`. The translation
  memory lives here at `localization_cache.json`.
- Output stays flat-dotted and key-ordered, so `build.py` (which regenerates
  `i18n-bundle.js` from `i18n/<code>.json`) keeps working unchanged.

## Run it locally

```bash
cd tools/localization
python3 -m venv .venv && . .venv/bin/activate
pip install -r requirements.txt

# Offline CI gate (no API key, no network, no cost):
python3 test_core.py
python3 test_batch.py
python3 loc_validate.py --marketing marketing_config.json

# Actual translation (needs a key; only new/changed English is sent):
cp .env.example .env   # then put your key in .env
python3 localize_marketing_site.py --config marketing_config.json --languages ja tw kr
python3 ../../build.py  # regenerate i18n-bundle.js
```

## Secrets

`OPENAI_API_KEY` is required for the `translate` job (default provider). Set it
as a GitHub Actions secret (**Settings → Secrets and variables → Actions**), and
locally in `tools/localization/.env` (git-ignored — never commit a key). To use
Claude instead, set `"provider": "anthropic"` in `marketing_config.json` and
provide `ANTHROPIC_API_KEY`.

## CI

[`.github/workflows/localization.yml`](../../.github/workflows/localization.yml)
runs a no-key `validate` job on PRs touching `i18n/**` or the glossaries, and a
`translate` job (manual dispatch / push to `main` changing `i18n/en.json`) that
translates and opens a PR with the updated locale files.

> Note: a stale partial `i18n/en.corrected.json` (from an earlier run) currently
> makes `loc_validate` report extra *advisory* `orphan` entries — it prefers the
> corrected file as source when present. These are non-blocking and disappear
> after the first full `translate` run rewrites `en.corrected.json`. Validated
> against `i18n/en.json` directly, the locales are complete: 0 blocking, 0
> missing, 0 orphan (only soft glossary/length advisories).

---

# KBKx Full-Workbook Localization Workflow

This workflow translates the complete localization workbook without manual row-by-row batching.

## What it does

- Reads `key`, `en`, `jp/ja`, `tw`, and `kr/ko` columns.
- Translates only blank target cells by default.
- Runs Japanese, Taiwan Traditional Chinese, Korean, or any combination.
- Saves after every API batch, so it can resume safely after interruption.
- Preserves placeholders, ICU syntax, HTML, `%` tokens, and line breaks.
- Uses the approved KBKx hospitality and distribution glossary.
- Adds a **Localization QA** sheet containing:
  - corrected English recommendations,
  - uncertain translations,
  - missing model responses,
  - placeholder mismatches that were not written into the language column.

## Setup

1. Install Python 3.11 or later.
2. In this folder, run:

```bash
python -m venv .venv
source .venv/bin/activate        # macOS/Linux
# .venv\\Scripts\\activate       # Windows
pip install -r requirements.txt
```

3. Set your API key:

```bash
export OPENAI_API_KEY="your-key"       # macOS/Linux
set OPENAI_API_KEY=your-key            # Windows Command Prompt
$env:OPENAI_API_KEY="your-key"        # Windows PowerShell
```

4. Copy `localization_config.example.json` to `localization_config.json`.
5. Put your master workbook in this folder and update `input_file` in the config.

## Run Japanese only

```bash
python localize_workbook.py --config localization_config.json --languages ja
```

## Run all three languages

```bash
python localize_workbook.py --config localization_config.json --languages ja tw kr
```

## Resume

Run the same command again. Existing translations are skipped, and only blank cells are processed.

## Overwrite existing translations

```bash
python localize_workbook.py --config localization_config.json --languages ja --overwrite
```

Use overwrite only after backing up the workbook.

## Recommended settings

- `batch_size`: 20–40. Start with 30.
- `save_every_batch`: keep enabled.
- Run Japanese first, review the QA sheet and glossary, then run Taiwan Traditional Chinese and Korean.
- Keep `output_file` separate from the source file until final review.

## Source context rules used by the workflow

- **Property** is the generic accommodation entity: Japanese `施設`.
- **Hotel** is used only when explicitly hotel-specific.
- **Property Category**: `施設カテゴリー`.
- **Rate Plan**: `料金プラン`.
- Distribution Channel, Distribution Partner, and Distributor remain distinct concepts.
- Reservation and Booking may both render as `予約` in Japanese, while remaining contextually distinct in English.
- Source is translated by domain: inventory origin, price origin, content origin, supplier, property, or internal/KAOS.
- AI/KAOS uses consistent AI agent/assistant conventions.
- Clearly non-native English is corrected and reported in the QA sheet.

## Safety

The workflow never writes a translation when placeholder validation fails. Those rows are placed in the QA sheet for review.

## Reviewed v2 operational notes

- Close the output workbook in Excel before running. A `~$...xlsx` lock file means Excel has it open and can prevent reliable saves.
- The script now prints before each API request and after each response, so a long request no longer looks silent.
- Requests time out after `request_timeout_seconds` (default in this package: 180 seconds), then retry.
- This package uses `gpt-5.4-mini` in Standard processing. The script does not implement the Batch API.
- The included `UI_translations_localized.xlsx` is the current checkpoint and contains 923 populated Japanese rows.

## Reviewed v3: English correction and multilingual glossaries

- The workflow now creates a `corrected_en` column when it does not already exist.
- Clearly awkward English is written to `corrected_en`; the original `en` column remains unchanged.
- Set `english_review.modify_source_text` to `true` only if you intentionally want to overwrite the English source.
- The glossary now contains approved terms for:
  - Japanese (`ja`)
  - Taiwan Traditional Chinese (`tw`)
  - Korean (`kr`)
- Each language receives only its own approved glossary values.
- Corrected English is validated to ensure placeholders remain identical to the original.

## Reviewed v4: English-first translation and automatic translation review

The pipeline now runs in two phases:

1. **English normalization**
   - Creates or updates `corrected_en`.
   - Stores `english_status` as `changed` or `unchanged`.
   - Stores an `english_fingerprint` so source-English edits are detected on future runs.
   - Preserves the original `en` column by default.

2. **Translation and review**
   - Japanese, Taiwan Traditional Chinese, and Korean are translated from `corrected_en`.
   - Existing translations are automatically re-reviewed when corrected English changes.
   - Revised translations are recorded in `Localization QA`.
   - Blank target cells are still translated normally.
   - Completed unchanged translations are skipped.

Recommended settings:

```json
"english_review": {
  "enabled": true,
  "phase_first": true,
  "write_corrected_column": true,
  "corrected_column": "corrected_en",
  "english_status_column": "english_status",
  "english_fingerprint_column": "english_fingerprint",
  "modify_source_text": false,
  "translate_from_corrected_english": true,
  "review_existing_translations_when_english_changes": true
}
```

Keep `modify_source_text` false until corrected English has been reviewed. The translations still use corrected English automatically.

## Reviewed v5: cost optimization

The workflow now includes:

- Persistent `localization_cache.json`
- English-normalization cache
- Per-language translation memory
- Deduplication of repeated strings before API calls
- Context-aware cache keys based on the first two key segments
- Cache statistics after each run
- Atomic cache saves after every completed batch

This safely reuses strings such as Save, Cancel, Status and Loading while keeping context-sensitive terms such as Source separate between modules.

Example:

- `properties.source` and `pricing.source` do not share a cache entry when `context_depth` is 2.
- Repeated strings within the same module reuse one API result.

Recommended cache settings:

```json
"cache": {
  "enabled": true,
  "file": "localization_cache.json",
  "context_depth": 2,
  "reuse_exact_matches": true,
  "deduplicate_within_run": true,
  "save_after_each_batch": true
}
```

For maximum reuse, set `context_depth` to 1. For more conservative contextual separation, use 2 or 3. The default is 2.


## Marketing-site localization adapter

This package now supports the KBKx marketing site's nested JSON locale files.

Run:

```bash
python3 localize_marketing_site.py --config marketing_config.json
```

Outputs are written under:

```text
examples/marketing-site/localized/
  en.corrected.json
  ja.json
  zh-TW.json
  ko.json
  marketing_localization_qa.json
  marketing_copy_map.json
```

Behavior:

- Corrects and polishes English first.
- Groups copy by section such as `hero`, `about`, `partners`, and `cta`.
- Uses different prompt rules for marketing, SEO, technical, and general copy.
- Translates from corrected English.
- Re-reviews existing locale values when English changes.
- Preserves nested JSON structure, placeholders, HTML, URLs, and product names.
- Uses shared core terminology plus a separate marketing glossary.
- Reuses the same persistent translation-memory cache as the UI workflow.


## v6: shared core, structured outputs, and concurrency

Both pipelines (`localize_workbook.py` and `localize_marketing_site.py`) now sit
on a single shared module, `loc_core.py`, so placeholder handling, caching,
glossary resolution, and the model client can no longer drift apart between the
platform UI and the marketing site.

**Structured outputs.** The model is asked for a JSON Schema–validated response
(`use_structured_output: true`). If the configured model rejects schema or
temperature parameters, the client disables that parameter once and retries, so
a run never dies on an unsupported option. Malformed free-form JSON is still
parsed as a fallback.

**Concurrency.** Batches run in parallel up to `max_workers` (default 4). Only
the network calls run on worker threads; every workbook/JSON write and cache
update happens on the main thread, and the engine still checkpoints after each
completed batch, so runs stay resumable. Tune with `--max-workers N` or the
`max_workers` config key. Set it to `1` to force the old serial behavior.

```bash
python localize_workbook.py --config config.json --languages ja tw kr --max-workers 6
python3 localize_marketing_site.py --config marketing_config.json --max-workers 6
```

**New config keys** (both configs):

- `provider` — model provider (`openai` today; the client is abstracted so this
  is the single place to add another).
- `max_workers` — concurrent batches.
- `use_structured_output` — JSON-schema enforced responses with fallback.
- `send_temperature` — pass `temperature` to the API (off by default because
  some newer models reject a custom temperature).
- `qa.check_glossary_compliance` / `qa.check_length_ratio` (workbook) and the
  top-level `check_glossary_compliance` / `check_length_ratio` (marketing) — add
  advisory QA flags when an approved glossary term is missing from a translation
  or when a translation's length is far from the source (layout-risk signal).

**Marketing output shape.** `nested_json` (default `false`) preserves the locale
files' existing **flat dotted-key** shape (e.g. `"hero.title"`). The earlier
version always re-nested keys on write, which changed the structure the frontend
consumes. Set `nested_json: true` only if your locale files are genuinely nested objects.

**Language codes.** Codes are normalized (`jp`→`ja`, `ko`→`kr`, `zh-TW`→`tw`),
so CLI args, config, and column headers can use any accepted alias.

### Note on the model id

The configs ship with `model: "gpt-5.4-mini"`. Confirm that id is valid for your
account before a production run, or override it with `--model` / the `model`
config key. Because the provider is abstracted in `loc_core.py`, switching model
or provider is a config change, not a code change.

### Offline tests

`loc_core.py` has no third-party imports at module load (the OpenAI SDK is
imported lazily), so its pure logic — placeholder extraction, cache keys,
flatten/unflatten, the concurrency runner, and the client's parameter-fallback
ladder — can be unit-tested without an API key or network.

```bash
python3 test_core.py     # core logic
python3 test_batch.py    # batch builders/parsers + provider selection
```


## v7: CI gate, Batch API, and a Claude provider

### Offline CI gate (`loc_validate.py`)

Validates existing translations against the source **without any API calls** —
fast, deterministic, free, and safe to run on every PR. Exits non-zero on
blocking issues so it can fail a build.

```bash
python3 loc_validate.py --marketing marketing_config.json            # gate marketing locales
python3 loc_validate.py --workbook config.json --require-complete    # gate the UI workbook
python3 loc_validate.py --marketing marketing_config.json --report loc_report.json
```

- **Blocking:** placeholder/token mismatch between source and a non-empty
  translation (the thing that breaks UI at runtime); missing translations only
  when `--require-complete` is passed.
- **Advisory (reported, never fails):** glossary term not applied, extreme
  length ratio (layout risk), and locale keys absent from the source.

### GitHub Actions (`.github/workflows/localization.yml`)

A ready-to-adapt workflow with two jobs:

- **`validate`** runs on every PR: unit tests + the offline gate. No API key,
  no cost. Fails the PR on placeholder mismatches.
- **`translate`** runs on push to `main` (or manual dispatch): runs the engine
  with your `OPENAI_API_KEY` (or `ANTHROPIC_API_KEY`) secret and opens a PR with
  the updated locale files.

**Only changed keys are translated.** The engine is incremental by design: the
English fingerprint column/cache plus per-language translation memory mean an
unchanged string is skipped and a new or edited English string re-translates (or
its existing translation is re-reviewed). No diffing step is required — committing
`localization_cache.json` is what makes CI runs cheap.

### Batch API (`--batch`, optional, ~50% cheaper)

For large, non-urgent rebuilds, submit a whole phase in one asynchronous batch
instead of live calls:

```bash
python localize_workbook.py --config config.json --languages ja tw kr --batch
python3 localize_marketing_site.py --config marketing_config.json --batch
```

Implemented for both OpenAI (Batch API) and Anthropic (Message Batches); toggle
in config with `batch_api`, `batch_poll_interval_seconds`, `batch_timeout_seconds`.
The request builders and result parsers are unit-tested offline, but the async
submit/poll path talks to the provider — **run it once on a small input to
confirm it against your account before relying on it.** Leave `--batch` off for
the fast, resumable concurrent path.

### Claude provider

Set `provider` to `anthropic` (and install `anthropic`, already in
`requirements.txt`) to run on Claude instead of OpenAI:

```json
"provider": "anthropic",
"model": "claude-sonnet-5-5"
```

Claude uses tool-calling with a JSON-Schema `input_schema`, so structured output
is native. Set `ANTHROPIC_API_KEY` instead of `OPENAI_API_KEY`. Everything else —
caching, concurrency, batch, QA, the CI gate — is unchanged. The provider is the
only switch, so you can A/B OpenAI vs. Claude for JA/KO/zh-TW quality with no
other code changes.
