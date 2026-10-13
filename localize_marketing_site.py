#!/usr/bin/env python3
from __future__ import annotations
import argparse, hashlib, json, os, re, time
from pathlib import Path
from typing import Any
from openai import OpenAI

TOKEN_RE = re.compile(r"\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\}|<\/?[A-Za-z][^>]*>|%\d*\$?[sdif]|\\n|https?://\S+")

LANG_NAMES = {"ja":"Japanese","tw":"Traditional Chinese for Taiwan","kr":"Korean"}

def load_json(path: Path, default=None):
    if not path.exists():
        return {} if default is None else default
    return json.loads(path.read_text(encoding="utf-8"))

def save_json(path: Path, data: Any):
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix + ".tmp")
    tmp.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
    tmp.replace(path)

def flatten(obj: Any, prefix=""):
    out = {}
    if isinstance(obj, dict):
        for k,v in obj.items():
            key = f"{prefix}.{k}" if prefix else k
            out.update(flatten(v,key))
    else:
        out[prefix]=obj
    return out

def unflatten(flat: dict[str,Any]):
    root={}
    for dotted,val in flat.items():
        cur=root
        parts=dotted.split(".")
        for p in parts[:-1]:
            cur=cur.setdefault(p,{})
        cur[parts[-1]]=val
    return root

def tokens(text: str):
    return sorted(TOKEN_RE.findall(text or ""))

def fp(text: str):
    return hashlib.sha256((text or "").encode()).hexdigest()[:16]

def section_of(key: str, depth: int):
    parts=key.split(".")
    return ".".join(parts[:depth])

def prompt_type(key: str, cfg: dict):
    top=key.split(".")[0]
    if top in cfg.get("seo_prefixes",[]): return "seo"
    if top in cfg.get("marketing_prefixes",[]): return "marketing"
    if top in cfg.get("technical_prefixes",[]): return "technical"
    return "general"

def glossary_for(lang: str, *glossaries):
    out={}
    for glossary in glossaries:
        for term,val in glossary.items():
            if isinstance(val,dict) and val.get(lang):
                out[term]=val[lang]
    return out

def english_instructions(kind: str):
    tone = {
        "seo":"Optimize for natural, accurate SEO metadata. Keep titles concise and descriptions compelling without keyword stuffing.",
        "marketing":"Use polished enterprise B2B travel-technology marketing language. Preserve positioning, trust, scale, and clarity.",
        "technical":"Use precise developer and integration terminology. Avoid promotional exaggeration.",
        "general":"Use concise, natural website copy."
    }[kind]
    return f"""You are the senior English UX and marketing copy editor for KBKx.
Rewrite the supplied website strings into polished native English before localization.

{tone}

Return JSON only: array of objects with key, corrected_english, changed, note.
Preserve HTML, placeholders, URLs, product names, punctuation tokens, and meaning.
Do not alter KabuK Exchange, KBKx, KabuK Style, HafH, API names, partner names, or legal meaning.
"""

def translation_instructions(lang: str, kind: str, glossary: dict[str,str]):
    tone = {
        "seo":"Translate as natural search and social metadata for the target market; keep title and description lengths practical.",
        "marketing":"Transcreate polished enterprise B2B travel-technology copy. Preserve brand positioning rather than translating mechanically.",
        "technical":"Translate precisely using standard travel-tech and API terminology.",
        "general":"Translate naturally and concisely."
    }[kind]
    g="\n".join(f"- {k} => {v}" for k,v in glossary.items())
    return f"""You are the localization lead for KBKx.
Translate corrected English website copy into {LANG_NAMES[lang]}.

{tone}

Return JSON only: array of objects with key, translation, note.
Preserve HTML, placeholders, URLs, line breaks, product names, and technical tokens exactly.
For Taiwan, use Taiwan Traditional Chinese terminology, not Simplified Chinese.
Use the approved glossary when relevant:
{g}
"""

def call(client, model, instructions, payload, retries):
    last=None
    for attempt in range(1,retries+1):
        try:
            r=client.responses.create(model=model,instructions=instructions,input=json.dumps(payload,ensure_ascii=False))
            text=r.output_text.strip()
            if text.startswith("```"):
                text=re.sub(r"^```(?:json)?\s*|\s*```$","",text,flags=re.S)
            data=json.loads(text)
            if not isinstance(data,list): raise ValueError("Expected JSON array")
            return data
        except Exception as e:
            last=e
            if attempt<retries: time.sleep(2**attempt)
    raise RuntimeError(last)

def main():
    ap=argparse.ArgumentParser()
    ap.add_argument("--config",default="marketing_config.json")
    args=ap.parse_args()
    cp=Path(args.config)
    cfg=load_json(cp)
    base=cp.parent

    if not os.getenv("OPENAI_API_KEY"):
        raise RuntimeError("OPENAI_API_KEY is not set")

    src=base/cfg["source_file"]
    outdir=base/cfg["output_dir"]
    corrected_path=outdir/cfg.get("corrected_english_file","en.corrected.json")
    qa_path=outdir/cfg.get("qa_report_file","marketing_localization_qa.json")
    copy_map_path=outdir/cfg.get("site_copy_map_file","marketing_copy_map.json")
    cache_path=base/cfg.get("translation_memory_file","localization_cache.json")

    source_nested=load_json(src)
    source=flatten(source_nested)
    corrected_existing=flatten(load_json(corrected_path,{}))
    cache=load_json(cache_path,{"marketing":{"english":{},"translations":{"ja":{},"tw":{},"kr":{}}}})
    cache.setdefault("marketing",{}).setdefault("english",{})
    cache["marketing"].setdefault("translations",{})
    for lang in ("ja","tw","kr"):
        cache["marketing"]["translations"].setdefault(lang,{})

    core=load_json(base/cfg["core_glossary_file"],{})
    marketing=load_json(base/cfg["marketing_glossary_file"],{})
    client=OpenAI(timeout=cfg.get("request_timeout_seconds",180),max_retries=2)
    model=cfg.get("model","gpt-5.4-mini")
    batch_size=cfg.get("batch_size",30)
    retries=cfg.get("max_retries",3)
    depth=cfg.get("section_depth",1)
    qa=[]
    copy_map={}

    # English-first, grouped by section and prompt type
    corrected={}
    changed_keys=set()
    groups={}
    for key,val in source.items():
        if not isinstance(val,str):
            corrected[key]=val
            continue
        ck=hashlib.sha256(f"{key}\n{val}".encode()).hexdigest()
        cached=cache["marketing"]["english"].get(ck)
        if cached:
            corrected[key]=cached["corrected_english"]
            if corrected[key]!=val: changed_keys.add(key)
            continue
        group=(section_of(key,depth),prompt_type(key,cfg))
        groups.setdefault(group,[]).append({"key":key,"english":val,"cache_key":ck})

    for (section,kind),items in groups.items():
        for i in range(0,len(items),batch_size):
            batch=items[i:i+batch_size]
            print(f"English {section}/{kind}: {i+1}-{i+len(batch)}",flush=True)
            result=call(client,model,english_instructions(kind),
                        [{"key":x["key"],"english":x["english"]} for x in batch],retries)
            by={x["key"]:x for x in result}
            for item in batch:
                r=by.get(item["key"],{})
                c=str(r.get("corrected_english",item["english"])).strip() or item["english"]
                if tokens(c)!=tokens(item["english"]):
                    qa.append({"language":"en","key":item["key"],"issue":"placeholder mismatch","suggestion":c})
                    c=item["english"]
                corrected[item["key"]]=c
                cache["marketing"]["english"][item["cache_key"]]={"corrected_english":c}
                if c!=item["english"]: changed_keys.add(item["key"])
            save_json(cache_path,cache)
            save_json(corrected_path,unflatten(corrected))

    for key,val in source.items():
        corrected.setdefault(key, corrected_existing.get(key,val))

    save_json(corrected_path,unflatten(corrected))

    # Translation
    for lang,filename in cfg["locales"].items():
        target_path=outdir/filename
        existing=flatten(load_json(target_path,{}))
        pending=[]
        for key,corr in corrected.items():
            if not isinstance(corr,str):
                continue
            old=existing.get(key)
            needs=old in (None,"") or (cfg.get("review_existing_when_english_changes",True) and key in changed_keys)
            if not needs:
                continue
            context=section_of(key,depth)
            ck=hashlib.sha256(f"{lang}\n{context}\n{corr}".encode()).hexdigest()
            cached=cache["marketing"]["translations"][lang].get(ck)
            if cached and tokens(cached["translation"])==tokens(corr):
                existing[key]=cached["translation"]
                continue
            pending.append({"key":key,"corrected_english":corr,"existing_translation":old or "","cache_key":ck})

        lang_groups={}
        for item in pending:
            group=(section_of(item["key"],depth),prompt_type(item["key"],cfg))
            lang_groups.setdefault(group,[]).append(item)

        for (section,kind),items in lang_groups.items():
            gloss=glossary_for(lang,core,marketing)
            for i in range(0,len(items),batch_size):
                batch=items[i:i+batch_size]
                print(f"{lang} {section}/{kind}: {i+1}-{i+len(batch)}",flush=True)
                result=call(client,model,translation_instructions(lang,kind,gloss),
                            [{"key":x["key"],"corrected_english":x["corrected_english"],
                              "existing_translation":x["existing_translation"]} for x in batch],retries)
                by={x["key"]:x for x in result}
                for item in batch:
                    r=by.get(item["key"],{})
                    t=str(r.get("translation","")).strip()
                    if not t:
                        qa.append({"language":lang,"key":item["key"],"issue":"missing result"})
                        continue
                    if tokens(t)!=tokens(item["corrected_english"]):
                        qa.append({"language":lang,"key":item["key"],"issue":"placeholder mismatch","translation":t})
                        continue
                    existing[item["key"]]=t
                    cache["marketing"]["translations"][lang][item["cache_key"]]={"translation":t}
                    copy_map[item["key"]]={"original_en":source.get(item["key"]),"corrected_en":corrected.get(item["key"])}
                save_json(cache_path,cache)
                save_json(target_path,unflatten(existing))

        save_json(target_path,unflatten(existing))

    save_json(qa_path,qa)
    save_json(copy_map_path,copy_map)
    print(f"Complete. Files written to {outdir}",flush=True)

if __name__=="__main__":
    main()
