#!/usr/bin/env python3
"""
Static checks for the KabuK Exchange site (Python 3 standard library only).

    python3 tests/check_site.py

Checks: JSON validity · internal links, anchors and srcsets · duplicate ids ·
i18n coverage and HTML/en.json sync · i18n-bundle.js freshness · status
catalog + roadmap rules (approval guard) · hidden gallery is noindex,
unlinked and absent from the sitemap · every page loads the bundle + script ·
sitemap pages are indexable with canonical + og:image · JSON-LD parses.
Launch gates: featureFlags shape · every data-gate element sits inside a
matching gate block · with all flags off no gated link/attribute survives ·
gated routes carry data-gate-page · public data files hold no fixture or
internal fields · fixtures are marked synthetic · languageUrls config shape.
Exit code 1 if any ERROR is reported; WARN lines are informational.
"""
import glob, html, json, os, re, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
LANGS = ["en", "ja", "ko", "zh-TW", "ar"]
REQUIRED_STATUSES = ["live", "available-to-partners", "pilot", "beta", "in-development",
                     "integration-in-progress", "coming-soon", "planned", "exploring",
                     "temporarily-unavailable", "deprecated", "retired"]
NEEDS_APPROVAL = {"live", "available-to-partners", "coming-soon"}
errors, warns = [], []


def err(msg): errors.append(msg)
def warn(msg): warns.append(msg)
def rel(p): return os.path.relpath(p, ROOT)


def flatten(o, p=""):
    out = {}
    for k, v in o.items():
        kk = p + "." + k if p else k
        if isinstance(v, dict): out.update(flatten(v, kk))
        elif isinstance(v, str): out[kk] = v
    return out


NOT_SOURCE = {"partials", "tests", "dist", "dist-preview", "fixtures", "_private", "node_modules"}
def is_source(p): return not (set(os.path.relpath(p, ROOT).split(os.sep)[:-1]) & NOT_SOURCE)
pages = sorted(p for p in glob.glob(os.path.join(ROOT, "**", "*.html"), recursive=True) if is_source(p))

# 1. JSON
for f in glob.glob(os.path.join(ROOT, "**", "*.json"), recursive=True):
    if os.path.getsize(f) == 0 or not (is_source(f) or os.sep + "fixtures" + os.sep in f): continue
    try: json.load(open(f, encoding="utf-8"))
    except Exception as e: err("JSON %s: %s" % (rel(f), e))

# 2. Links / anchors / ids
ids = {p: set(re.findall(r'\sid="([^"]+)"', open(p, encoding="utf-8").read())) for p in pages}
for p in pages:
    s = open(p, encoding="utf-8").read()
    for attr, u in re.findall(r'\s(href|src)="([^"]*)"', s):
        if not u or re.match(r"(https?:|mailto:|tel:|data:|//)", u): continue
        path, _, frag = u.partition("#")
        if path.startswith("/"):
            err("%s: root-absolute %s=\"%s\" (run python3 build.py)" % (rel(p), attr, u)); continue
        tgt = p
        if path:
            t = os.path.normpath(os.path.join(os.path.dirname(p), path.split("?")[0]))
            if os.path.isdir(t): t = os.path.join(t, "index.html")
            if not os.path.exists(t): err("%s: broken link %s" % (rel(p), u)); continue
            tgt = t
        if frag and tgt.endswith(".html") and frag not in ids.get(tgt, set()):
            err("%s: missing anchor #%s in %s" % (rel(p), frag, rel(tgt)))
    for ss in re.findall(r'srcset="([^"]*)"', s):
        for c in ss.split(","):
            f = c.strip().split(" ")[0]
            if not os.path.exists(os.path.normpath(os.path.join(os.path.dirname(p), f))):
                err("%s: srcset file missing %s" % (rel(p), f))
    seen = re.findall(r'\sid="([^"]+)"', s)
    for i in set(seen):
        if seen.count(i) > 1: err("%s: duplicate id \"%s\"" % (rel(p), i))
    if "i18n-bundle.js" not in s or "script.js" not in s:
        err("%s: must load i18n-bundle.js and script.js" % rel(p))

# 3. i18n
dicts = {}
for lang in LANGS:
    dicts[lang] = flatten(json.load(open(os.path.join(ROOT, "i18n", lang + ".json"), encoding="utf-8")))
en = dicts["en"]
used = {}
for p in pages + glob.glob(os.path.join(ROOT, "partials", "*.html")):
    s = open(p, encoding="utf-8").read()
    for m in re.finditer(r'<([a-z0-9]+)\b[^>]*\sdata-i18n="([^"]+)"[^>]*>(.*?)</\1>', s, re.S):
        txt = re.sub(r"\s+", " ", html.unescape(re.sub("<[^>]+>", "", m.group(3)))).strip()
        used.setdefault(m.group(2), set()).add(txt)
    for k in re.findall(r'data-i18n-(?:aria-label|placeholder)="([^"]+)"', s): used.setdefault(k, set())
for k, texts in used.items():
    if k not in en: err("i18n: key %s used in HTML but missing from i18n/en.json" % k); continue
    if texts and en[k] not in texts: err("i18n: en.json \"%s\" differs from HTML default text %r" % (k, sorted(texts)[0][:60]))
    if len(texts) > 1: err("i18n: key %s has different default texts in HTML" % k)
    for lang in ["ja", "ko", "zh-TW"]:
        if not dicts[lang].get(k): err("i18n: %s missing %s" % (lang, k))
    if not dicts["ar"].get(k): warn("i18n: ar falls back to English for %s" % k)

# 4. Bundle freshness
b = open(os.path.join(ROOT, "i18n-bundle.js"), encoding="utf-8").read()
bundle = json.loads(b[b.index("{"):].rstrip().rstrip(";"))
for lang in LANGS:
    want = {k: v for k, v in dicts[lang].items() if not k.startswith("_")}
    if bundle["translations"].get(lang) != want:
        err("i18n-bundle.js is stale for %s — run python3 build.py" % lang)

# 5. Status catalog + roadmap
cat = json.load(open(os.path.join(ROOT, "data", "statuses.json"), encoding="utf-8"))
road = json.load(open(os.path.join(ROOT, "data", "product-roadmap.json"), encoding="utf-8"))
for k in REQUIRED_STATUSES:
    st = cat["statuses"].get(k)
    if not st: err("statuses.json: missing status %s" % k); continue
    for lang in LANGS:
        if not st.get("label", {}).get(lang): err("statuses.json: %s has no %s label" % (k, lang))
    for f in ("tone", "icon", "definition", "use", "avoid"):
        if not st.get(f): err("statuses.json: %s missing %s" % (k, f))
for pid, p in road["products"].items():
    if p["status"] not in cat["statuses"]: err("product-roadmap.json: %s has unknown status %s" % (pid, p["status"]))
    if p["status"] in NEEDS_APPROVAL and not p.get("approved"):
        err("product-roadmap.json: %s is '%s' without owner approval" % (pid, p["status"]))
    if not p.get("approved"): warn("roadmap: %s (%s) awaiting owner approval" % (pid, p["status"]))
for p in pages:
    s = open(p, encoding="utf-8").read()
    for pid in re.findall(r'data-product-status="([^"]+)"', s):
        if pid not in road["products"]: err("%s: data-product-status=\"%s\" not in product-roadmap.json" % (rel(p), pid))
    for key in re.findall(r'\sdata-status="([^"]+)"', s):
        if key not in cat["statuses"]: err("%s: data-status=\"%s\" not in statuses.json" % (rel(p), key))
if "flights are not part" not in en.get("fut.gt.noflights", "").lower():
    err("Ground transportation must state that flights are excluded (fut.gt.noflights)")

# 6. Hidden gallery
gal = os.path.join(ROOT, "internal", "status-badges", "index.html")
if not os.path.exists(gal): err("missing /internal/status-badges/")
else:
    g = open(gal, encoding="utf-8").read()
    if not re.search(r'<meta content="noindex[^"]*nofollow[^"]*" name="robots"', g): err("gallery must be noindex,nofollow")
    if "internal/status-badges" in open(os.path.join(ROOT, "sitemap.xml"), encoding="utf-8").read(): err("gallery listed in sitemap.xml")
    for p in pages:
        if p != gal and "status-badges" in open(p, encoding="utf-8").read(): err("%s links to the hidden gallery" % rel(p))

# 6b. SEO: sitemap pages are indexable and shareable; structured data parses
sm_text = open(os.path.join(ROOT, "sitemap.xml"), encoding="utf-8").read()
for loc in re.findall(r"<loc>https?://[^/]+/([^<]*)</loc>", sm_text):
    sp = os.path.join(ROOT, loc, "index.html") if (loc == "" or loc.endswith("/")) else os.path.join(ROOT, loc)
    if not os.path.exists(sp): err("sitemap.xml lists missing page /%s" % loc); continue
    t = open(sp, encoding="utf-8").read()
    if re.search(r'<meta[^>]*noindex[^>]*>', t): err("sitemap.xml lists noindex page /%s" % loc)
    if 'rel="canonical"' not in t: err("/%s: missing canonical link" % loc)
    if 'property="og:image"' not in t: err("/%s: missing og:image (social share preview)" % loc)
for p in pages:
    for body in re.findall(r'<script type="application/ld\+json">(.*?)</script>', open(p, encoding="utf-8").read(), re.S):
        try: json.loads(body)
        except ValueError as e: err("%s: invalid JSON-LD (%s)" % (rel(p), e))

# 6c. Deploy workflows publish only the production export
for wf in glob.glob(os.path.join(ROOT, ".github", "workflows", "*.y*ml")):
    w = open(wf, encoding="utf-8").read()
    if "upload-pages-artifact" in w:
        paths = re.findall(r"upload-pages-artifact@[^\n]*\n(?:\s+with:\s*\n)?(?:\s+[a-z_-]+:.*\n)*?\s+path:\s*['\"]?([^'\"\s#]+)", w)
        if not paths or any(p.strip("./") != "dist" for p in paths):
            err("%s: Pages artifact must be dist/ (python3 build.py --production), got %s" % (rel(wf), paths or "no path"))
        if "build.py --production" not in w:
            err("%s: uploads a Pages artifact without running python3 build.py --production" % rel(wf))

# 7. Launch gates
sys.path.insert(0, ROOT)
import publish as PUB
cfg = json.load(open(os.path.join(ROOT, "site-config.json"), encoding="utf-8"))
ff = cfg.get("featureFlags")
if not isinstance(ff, dict): err("site-config.json: featureFlags missing")
else:
    for k in PUB.FLAGS:
        if not isinstance(ff.get(k), bool): err("featureFlags.%s must be true/false" % k)
    on = [k for k in PUB.FLAGS if ff.get(k) is True]
    print("INFO  featureFlags on: %s" % (", ".join(on) or "none (all launch-gated features withheld)"))
lu = cfg.get("languageUrls")
if not isinstance(lu, dict) or not isinstance(lu.get("enabled"), bool):
    err("site-config.json: languageUrls.enabled must be true or false")
else:
    langs_known = [l["code"] for l in json.load(open(os.path.join(ROOT, "i18n", "languages.json"), encoding="utf-8"))]
    for c in lu.get("languages") or []:
        if c == "en" or c not in langs_known: err("site-config.json: languageUrls.languages has unknown language %r" % c)
    for r_ in lu.get("pages") or []:
        f_ = os.path.join(ROOT, (r_.strip("/") + "/index.html").lstrip("/"))
        if not os.path.exists(f_): err("site-config.json: languageUrls.pages lists %s, which is not a page" % r_)
        elif "noindex" in open(f_, encoding="utf-8").read(): err("site-config.json: languageUrls.pages lists noindex page %s" % r_)
    print("INFO  languageUrls: %s" % ("ON — /<lang>/ pages + hreflang are published" if lu["enabled"]
                                     else "off (language versions are client-side only; needs owner approval)"))
if cfg.get("buildTarget"): err("site-config.json must not set buildTarget (the publish step writes it)")
gated_hrefs = [r.replace("index.html", "") for r in PUB.ROUTE_GATES]
off = {k: False for k in PUB.FLAGS}
def strip_all_off(text):
    def repl(m):
        if not PUB.gate_on(m.group("expr"), off): return ""
        return m.group("ws") + PUB.GATE_RE.sub(repl, m.group("body")) + m.group("nl")
    return PUB.GATE_RE.sub(repl, text)
for p in pages + glob.glob(os.path.join(ROOT, "partials", "*.html")) + [os.path.join(ROOT, "sitemap.xml")]:
    r = rel(p).replace(os.sep, "/")
    if r in PUB.ROUTE_GATES:
        s_ = open(p, encoding="utf-8").read()
        m = re.search(r'<body[^>]*data-gate-page="([^"]+)"', s_)
        if not m or m.group(1) != PUB.ROUTE_GATES[r]: err("%s: body needs data-gate-page=\"%s\"" % (r, PUB.ROUTE_GATES[r]))
        continue
    s_ = open(p, encoding="utf-8").read()
    for m in PUB.GATE_RE.finditer(s_):
        expr = m.group("expr")
        for g in re.findall(r'data-gate="([^"]+)"', m.group("body")):
            if g != expr and not re.search(r"<!-- gate:start %s -->" % re.escape(g), m.group("body")):
                err("%s: data-gate=\"%s\" inside gate block %s" % (r, g, expr))
    stripped = strip_all_off(s_)
    if 'data-gate="' in stripped.replace('data-gate="!', ""):
        err("%s: data-gate element outside a <!-- gate:start --> block (would ship in production)" % r)
    for h in gated_hrefs:
        if re.search(r'(href="|<loc>)[^"<]*?(?<![\w-])%s(?:#[^"<]*)?(?=["<])' % re.escape(h), stripped):
            err("%s: link to launch-gated route %s outside its gate block" % (r, h))
for f in PUB.DATA_GATES:
    t_ = open(os.path.join(ROOT, f), encoding="utf-8").read()
    for bad in ("_fixture", "internalNotes", "MUST NOT RENDER"):
        if bad in t_: err("%s contains %s — keep fixtures in fixtures/ and notes in _private/" % (f, bad))
for f in glob.glob(os.path.join(ROOT, "fixtures", "data", "*.json")):
    if json.load(open(f, encoding="utf-8")).get("_fixture") is not True: err("%s must set \"_fixture\": true" % rel(f))

# 8. Commercial wording (Oct-2026 positioning): exact approved sentence, no success-based pricing.
REQUIRED_TERMS = {"cm.terms.t": "Transparent Commercial Terms",
                  "cm.terms.d": "No setup or recurring integration fees. Straightforward, transaction-based commercial arrangements designed around your business."}
for k, v in REQUIRED_TERMS.items():
    if en.get(k) != v: err("i18n/en.json %s must be exactly: %s" % (k, v))
    for lang in LANGS:
        if not json.load(open(os.path.join(ROOT, "i18n", lang + ".json"), encoding="utf-8")).get(k):
            err("i18n/%s.json is missing %s" % (lang, k))
FORBIDDEN = re.compile(r"success[- ]based|success fee|pay only for successful|only (?:pay|charged) for (?:successful|confirmed) bookings|free cancellation", re.I)
for f in pages + glob.glob(os.path.join(ROOT, "i18n", "*.json")) + glob.glob(os.path.join(ROOT, "partials", "*.html")):
    if FORBIDDEN.search(open(f, encoding="utf-8").read()):
        err("%s: forbidden commercial wording (success-based pricing / fee or cancellation promise)" % rel(f))

for w in warns: print("WARN ", w)
for e in errors: print("ERROR", e)
print("\n%d page(s), %d i18n key(s) checked — %d error(s), %d warning(s)" % (len(pages), len(used), len(errors), len(warns)))
sys.exit(1 if errors else 0)
