"""Offline tests for loc_batch and the provider abstraction (no network)."""
import json
import sys
import types
from pathlib import Path

PROJ = Path(__file__).resolve().parent
sys.path.insert(0, str(PROJ))

import loc_core as core
import loc_batch as b

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


SCHEMA = core.TRANSLATION_ROW_SCHEMA
SPECS = [
    {"instructions": "inst-A", "payload": [{"row": 1}], "schema": SCHEMA, "schema_name": "translation"},
    {"instructions": "inst-B", "payload": [{"row": 2}], "schema": SCHEMA, "schema_name": "translation"},
]

# --- OpenAI JSONL builder ---
oai_stub = types.SimpleNamespace(model="gpt-x", use_structured_output=True, temperature=None)
jsonl = b.build_openai_jsonl(oai_stub, SPECS)
lines = [json.loads(x) for x in jsonl.splitlines()]
check("jsonl one line per spec", len(lines) == 2)
check("jsonl custom_id", lines[0]["custom_id"] == "req-0" and lines[1]["custom_id"] == "req-1")
check("jsonl url", lines[0]["url"] == "/v1/responses")
check("jsonl body model", lines[0]["body"]["model"] == "gpt-x")
check("jsonl schema embedded", lines[0]["body"]["text"]["format"]["schema"] == SCHEMA)
check("jsonl input is json string", json.loads(lines[0]["body"]["input"]) == [{"row": 1}])
check("jsonl omits temperature when None", "temperature" not in lines[0]["body"])

oai_stub2 = types.SimpleNamespace(model="gpt-x", use_structured_output=False, temperature=0.2)
line2 = json.loads(b.build_openai_jsonl(oai_stub2, SPECS[:1]).splitlines()[0])
check("jsonl no schema when disabled", "text" not in line2["body"])
check("jsonl temperature when set", line2["body"]["temperature"] == 0.2)

# --- OpenAI output-text extraction ---
body_nested = {"output": [{"content": [{"type": "output_text", "text": '{"items":[{"row":1,"translation":"x","note":""}]}'}]}]}
check("extract nested output_text", b.extract_openai_output_text(body_nested).startswith('{"items"'))
check("extract direct output_text", b.extract_openai_output_text({"output_text": "hi"}) == "hi")
check("extract empty", b.extract_openai_output_text({}) == "")

# --- OpenAI batch output parsing (out of order + missing) ---
rec0 = {"custom_id": "req-1", "response": {"body": {"output_text": '[{"row":2,"translation":"b"}]'}}}
rec1 = {"custom_id": "req-0", "response": {"body": {"output_text": '{"items":[{"row":1,"translation":"a"}]}'}}}
out = b.parse_openai_batch_output("\n".join(json.dumps(r) for r in [rec0, rec1]), 3)
check("batch parse aligns by custom_id", out[0] == [{"row": 1, "translation": "a"}] and out[1] == [{"row": 2, "translation": "b"}])
check("batch parse missing -> empty", out[2] == [])

# --- Anthropic request builder + params ---
ap = object.__new__(core.AnthropicProvider)
ap.model = "claude-x"; ap.max_tokens = 1234; ap.temperature = None; ap.use_structured_output = True
params = ap.build_params("inst", [{"row": 1}], SCHEMA, "translation")
check("anthropic params model", params["model"] == "claude-x")
check("anthropic params max_tokens", params["max_tokens"] == 1234)
check("anthropic params system", params["system"] == "inst")
check("anthropic params tool", params["tools"][0]["input_schema"] == SCHEMA)
check("anthropic params tool_choice", params["tool_choice"] == {"type": "tool", "name": "translation"})
check("anthropic params user content", json.loads(params["messages"][0]["content"]) == [{"row": 1}])

reqs = b.build_anthropic_requests(ap, SPECS)
check("anthropic requests custom_ids", [r["custom_id"] for r in reqs] == ["req-0", "req-1"])

ap2 = object.__new__(core.AnthropicProvider)
ap2.model = "c"; ap2.max_tokens = 10; ap2.temperature = 0.3; ap2.use_structured_output = False
params2 = ap2.build_params("i", [{"a": 1}], SCHEMA, "t")
check("anthropic no tool when disabled", "tools" not in params2)
check("anthropic temperature when set", params2["temperature"] == 0.3)

# --- extract_items from message shapes ---
class Blk:
    def __init__(self, **kw): self.__dict__.update(kw)

msg_tool = Blk(content=[Blk(type="tool_use", input={"items": [{"row": 1, "translation": "x"}]})])
check("extract_items tool_use object", core.AnthropicProvider.extract_items(msg_tool) == [{"row": 1, "translation": "x"}])
msg_tool_d = {"content": [{"type": "tool_use", "input": {"items": [{"row": 2}]}}]}
msg_tool_d = types.SimpleNamespace(content=[{"type": "tool_use", "input": {"items": [{"row": 2}]}}])
check("extract_items tool_use dict block", core.AnthropicProvider.extract_items(msg_tool_d) == [{"row": 2}])
msg_text = types.SimpleNamespace(content=[types.SimpleNamespace(type="text", text='[{"row":3}]')])
check("extract_items text fallback", core.AnthropicProvider.extract_items(msg_text) == [{"row": 3}])

# --- Anthropic results parsing ---
entries = [
    types.SimpleNamespace(custom_id="req-1",
                          result=types.SimpleNamespace(type="succeeded",
                              message=types.SimpleNamespace(content=[Blk(type="tool_use", input={"items": [{"row": 2}]})]))),
    types.SimpleNamespace(custom_id="req-0",
                          result=types.SimpleNamespace(type="errored", message=None)),
]
res = b.parse_anthropic_results(entries, 2)
check("anthropic results aligns", res[1] == [{"row": 2}])
check("anthropic results errored -> empty", res[0] == [])

# --- dispatch: concurrent vs batch ---
class FakeProvider:
    def generate_one(self, spec):
        return [{"echo": spec["instructions"]}]
    def generate_items_batch(self, specs, **kw):
        return [[{"batch": s["instructions"]}] for s in specs]

fp = FakeProvider()
conc = {i: r for i, r in core.dispatch(fp, SPECS, max_workers=2, use_batch=False)}
check("dispatch concurrent maps all", conc == {0: [{"echo": "inst-A"}], 1: [{"echo": "inst-B"}]})
bat = {i: r for i, r in core.dispatch(fp, SPECS, max_workers=2, use_batch=True)}
check("dispatch batch maps all", bat == {0: [{"batch": "inst-A"}], 1: [{"batch": "inst-B"}]})
check("dispatch empty specs", list(core.dispatch(fp, [], 2, False)) == [])

# --- build_provider selects backend (without constructing network clients) ---
import os
saved_oai = os.environ.get("OPENAI_API_KEY")
saved_ant = os.environ.get("ANTHROPIC_API_KEY")
os.environ.pop("OPENAI_API_KEY", None)
os.environ.pop("ANTHROPIC_API_KEY", None)
try:
    core.build_provider({"provider": "openai"})
    check("build_provider openai requires key", False)
except RuntimeError:
    check("build_provider openai requires key", True)
try:
    core.build_provider({"provider": "anthropic"})
    check("build_provider anthropic requires key", False)
except RuntimeError:
    check("build_provider anthropic requires key", True)
finally:
    if saved_oai is not None:
        os.environ["OPENAI_API_KEY"] = saved_oai
    if saved_ant is not None:
        os.environ["ANTHROPIC_API_KEY"] = saved_ant

print(f"\n{ok} passed, {fail} failed")
sys.exit(1 if fail else 0)
