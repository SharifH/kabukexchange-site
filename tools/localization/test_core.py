"""Offline tests for loc_core (no network, no third-party deps).

Run:  python3 test_core.py
Exits non-zero if any check fails, so it can gate CI.
"""
import json
import sys
import time
from pathlib import Path

PROJ = Path(__file__).resolve().parent
sys.path.insert(0, str(PROJ))

import loc_core as core

ok = 0
fail = 0


def check(name, cond):
    global ok, fail
    if cond:
        ok += 1
        print(f"PASS {name}")
    else:
        fail += 1
        print(f"FAIL {name}")


# --- tokens / placeholder validation ---
check("tokens ICU+html+url+pct+nl",
      core.tokens("Hi {name}, <b>go</b> %s \\n https://x.co/a") ==
      sorted(["{name}", "<b>", "</b>", "%s", "\\n", "https://x.co/a"]))
check("tokens_match reorder", core.tokens_match("{a} {b}", "{b} and {a}"))
check("tokens_match mismatch", not core.tokens_match("{a}", "{a} {b}"))

# --- normalize / fingerprint / cache keys ---
check("normalize collapses ws", core.normalize_text("  a   b\n c ") == "a b c")
check("fingerprint stable", core.fingerprint("x") == core.fingerprint("x"))
check("fingerprint differs", core.fingerprint("x") != core.fingerprint("y"))

check("cache_key separates modules at depth2",
      core.cache_key("Source", "properties.source", 2) != core.cache_key("Source", "pricing.source", 2))
check("cache_key reuses within module at depth1",
      core.cache_key("Source", "properties.source", 1) == core.cache_key("Source", "properties.origin", 1))

# --- canonical language ---
check("canonical jp->ja", core.canonical_language("jp") == "ja")
check("canonical ko->kr", core.canonical_language("ko") == "kr")
check("canonical zh-TW->tw", core.canonical_language("zh-TW") == "tw")
try:
    core.canonical_language("fr")
    check("canonical rejects unknown", False)
except ValueError:
    check("canonical rejects unknown", True)

# --- parse_items (array, object, fenced) ---
check("parse array", core.parse_items('[{"a":1}]') == [{"a": 1}])
check("parse items-object", core.parse_items('{"items":[{"a":1}]}') == [{"a": 1}])
check("parse fenced", core.parse_items('```json\n[{"a":1}]\n```') == [{"a": 1}])
try:
    core.parse_items('{"nope":1}')
    check("parse rejects non-list", False)
except ValueError:
    check("parse rejects non-list", True)

# --- flatten/unflatten ---
nested = {"hero": {"title": "T", "sub": "S"}, "nav": {"home": "H"}}
check("flatten->unflatten roundtrip (nested)", core.unflatten(core.flatten(nested)) == nested)
check("flatten produces dotted", "hero.title" in core.flatten(nested))

en_path = PROJ / "examples/marketing-site/en.json"
if en_path.exists():
    en = json.loads(en_path.read_text())
    flat = core.flatten(en)
    check("flat-dotted source unchanged by flatten", flat == en)
    check("flat source has dotted keys", "hero.title" in flat)

# --- glossary helpers ---
gloss_path = PROJ / "kbkx_glossary.json"
if gloss_path.exists():
    gloss = json.loads(gloss_path.read_text())
    check("glossary_for ja Property", core.glossary_for("ja", gloss).get("Property") == "施設")
    check("glossary_for ko alias", core.glossary_for("ko", gloss).get("Property") == "숙박 시설")
check("glossary_violations flags missing",
      core.glossary_violations("Manage Property settings", "設定を管理", {"Property": "施設"}) == ["Property => 施設"])
check("glossary_violations ok when present",
      core.glossary_violations("Manage Property settings", "施設の設定を管理", {"Property": "施設"}) == [])

# --- length ratio ---
check("length_ratio flags blowup", core.length_ratio_flag("ok", "x" * 20) != "")
check("length_ratio ok normal", core.length_ratio_flag("Hello there", "Bonjour ici") == "")

# --- chunk ---
check("chunk sizes", core.chunk(list(range(10)), 3) == [[0, 1, 2], [3, 4, 5], [6, 7, 8], [9]])
check("chunk size<1 guarded", core.chunk([1, 2], 0) == [[1], [2]])

# --- run_batches concurrency correctness (order-independent mapping) ---
def worker(batch):
    time.sleep(0.01 * (1 + (batch[0] % 3)))  # jitter so completion order != submission order
    return sum(batch)

batches = core.chunk(list(range(1, 21)), 4)
expected = {i: sum(b) for i, b in enumerate(batches)}
got = {}
for i, b, res in core.run_batches(batches, worker, max_workers=4):
    got[i] = res
    assert b == batches[i], "batch index/object mismatch"
check("run_batches maps index->result (concurrent)", got == expected)
check("run_batches serial matches",
      {i: res for i, _b, res in core.run_batches(batches, worker, max_workers=1)} == expected)

# --- provider parameter-degradation ladder (no network) ---
prov = object.__new__(core.LLMProvider)
prov.model = "m"; prov.temperature = 0.2; prov.use_structured_output = True
prov.retries = 3
prov._structured_disabled = False; prov._temperature_disabled = False
calls = []

class FakeResp:
    output_text = '{"items":[{"row":1,"translation":"x","note":""}]}'

class FakeResponses:
    def create(self, **kw):
        calls.append(kw)
        if "text" in kw:
            raise Exception("Unsupported parameter: text.format json_schema")
        if "temperature" in kw:
            raise Exception("temperature is not supported for this model")
        return FakeResp()

class FakeClient:
    responses = FakeResponses()

prov.client = FakeClient()
items = prov.generate_items("inst", [{"row": 1}], core.TRANSLATION_ROW_SCHEMA, "t")
check("provider degrades then succeeds", items == [{"row": 1, "translation": "x", "note": ""}])
check("provider disabled structured", prov._structured_disabled is True)
check("provider disabled temperature", prov._temperature_disabled is True)
calls.clear()
prov.generate_items("inst", [{"row": 1}], core.TRANSLATION_ROW_SCHEMA, "t")
check("provider no longer sends text/temperature",
      all("text" not in c and "temperature" not in c for c in calls))

print(f"\n{ok} passed, {fail} failed")
sys.exit(1 if fail else 0)
