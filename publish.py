#!/usr/bin/env python3
"""
Launch-gated publish step for the KabuK Exchange static site.

Called by `python3 build.py --production` / `--preview` (after the normal
in-place page assembly). Writes a self-contained, deployable copy of the site:

  production -> dist/          flags from site-config.json -> featureFlags
  preview    -> dist-preview/  every flag on + SYNTHETIC fixtures + banner

Why a publish step: this is a static site. A runtime JSON flag can hide a
component, but it cannot stop a web server from serving /network/ if that
file is deployed. So disabled routes are simply not copied into dist/.

The publication rules below mirror script.js (search "PUBLICATION RULES").
tests/check_site.py verifies the two stay in agreement.
Standard library only.
"""
import base64
import datetime
import hashlib
import json
import os
import re
import shutil
import subprocess
import sys

import language_pages

ROOT = os.path.dirname(os.path.abspath(__file__))

FLAGS = ["networkStats", "networkCoverageMap", "connectivityDirectory",
         "partnerEcosystem", "homepageFeaturedConnections", "homepageFeaturedHotels"]

# Page routes that exist only when their gate expression is on ("a|b" = any).
# (/network/ is a public page since the Oct-2026 messaging update; only its
#  statistics, coverage map and directory links are gated inside the page.)
ROUTE_GATES = {
    "network/connectivity/index.html": "connectivityDirectory",
    "partners/ecosystem/index.html": "partnerEcosystem",
}
# Data files published only when a feature that reads them is on.
DATA_GATES = {
    "data/network-stats.json": "networkStats|networkCoverageMap",
    "data/integrations.json": "connectivityDirectory|homepageFeaturedConnections",
    "data/featured-connections.json": "homepageFeaturedConnections",
    "data/partners-ecosystem.json": "partnerEcosystem",
    "data/featured-properties.json": "homepageFeaturedHotels",
}

# Never deployed, in either target.
EXCLUDE_DIRS = {".git", "dist", "dist-preview", "tests", "fixtures", "_private", "tools",
                "screens", "website-copy", "partials", "node_modules", "__pycache__", "shots"}
EXCLUDE_FILES = {"requirements.txt", "serve.command", "localization_cache.json",
                 "marketing_config.json", "marketing_glossary.json", "kbkx_glossary.json",
                 ".DS_Store", "_template.json",
                 # localization tooling, not read by the site at runtime
                 "en.corrected.json", "marketing_copy_map.json", "marketing_localization_qa.json"}
EXCLUDE_EXT = {".md", ".py", ".pyc", ".command"}
LOGO_DIR = "assets/logos"          # copied per approved reference only

# Strings that must never reach production output.
LEAK_MARKERS = ["_fixture", "SYNTHETIC", "MUST NOT RENDER", "preview-banner",
                "internalNotes", "TEST LOGO", "Test Channel Manager"]

GATE_RE = re.compile(r'(?P<ws>[ \t]*)<!-- gate:start (?P<expr>!?[A-Za-z|]+) -->(?P<body>.*?)<!-- gate:end (?P=expr) -->(?P<nl>[ \t]*\n?)', re.S)

# Domains used as placeholders in canonical/OG tags, JSON-LD, sitemap and robots.
PLACEHOLDER_ORIGINS = ["https://www.kbkx.example.com", "https://kabukexchange.com"]
INLINE_SCRIPT_RE = re.compile(r"<script(?![^>]*\bsrc=)(?![^>]*application/ld\+json)[^>]*>(.*?)</script>", re.S)


def origin_of(url):
    m = re.match(r"^(https://[^/?#]+)", url or "")
    return m.group(1) if m else None


def build_csp(cfg, inline_hashes):
    """Content-Security-Policy for a static site on GitHub Pages (sent as a
    <meta> tag, so frame-ancestors / report-uri are not available there)."""
    sec = cfg.get("security") or {}
    def extra(key):
        return [o for o in (origin_of(u) for u in sec.get(key, [])) if o]
    connect = ["'self'"] + extra("extraConnectSrc")
    if (cfg.get("formMode") == "api") and origin_of(cfg.get("apiEndpoint")):
        connect.append(origin_of(cfg["apiEndpoint"]))
    directives = [
        ("default-src", ["'self'"]),
        ("script-src", ["'self'"] + ["'sha256-%s'" % h for h in sorted(inline_hashes)] + extra("extraScriptSrc")),
        ("style-src", ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"]),
        ("font-src", ["'self'", "https://fonts.gstatic.com"]),
        ("img-src", ["'self'", "data:"] + extra("extraImgSrc")),
        ("connect-src", connect),
        ("frame-src", extra("extraFrameSrc") or ["'none'"]),
        ("object-src", ["'none'"]),
        ("base-uri", ["'self'"]),
        ("form-action", ["'self'"]),
        ("upgrade-insecure-requests", []),
    ]
    return "; ".join((k + " " + " ".join(dict.fromkeys(v))).strip() for k, v in directives)


# ---- PUBLICATION RULES (keep in sync with script.js) -----------------------
OPERATIONAL = {"live", "available-to-partners", "pilot", "beta"}
INTEGRATION_CATEGORIES = {"channel_manager", "pms", "crs", "global_supplier", "technology"}
CONNECTION_METHODS = {"direct", "bakuun", "other_partner"}
PARTNER_CATEGORIES = {"accommodation", "supply", "distribution", "connectivity", "technology"}
PARTNER_RELATIONSHIPS = {"signed", "integrated"}          # 'prospective' is never public
PROPERTY_RELATIONSHIPS = {"direct_contract", "connected_supplier", "other_verified"}
METRIC_IDS = ["directProperties", "directCountries", "availableProperties", "countriesCovered",
              "connectedSupplySources", "connectedChannelManagers"]
ISO2 = re.compile(r"^[A-Z]{2}$")


def gate_on(expr, flags):
    """'a|b' = on when any flag is on; '!a|b' = on only when ALL of them are off."""
    if expr.startswith("!"):
        return not gate_on(expr[1:], flags)
    return any(flags.get(name) is True for name in expr.split("|"))


def read_text(p):
    with open(p, encoding="utf-8") as f:
        return f.read()


def write_text(p, s):
    with open(p, "w", encoding="utf-8") as f:
        f.write(s)


def load(rel):
    with open(os.path.join(ROOT, rel), encoding="utf-8") as f:
        return json.load(f)


def status_keys():
    return set(load("data/statuses.json")["statuses"].keys())


def integration_ok(r, today, statuses):
    if r.get("publicDisclosureApproved") is not True: return False
    if not r.get("displayName") or not r.get("id"): return False
    if r.get("status") not in statuses: return False
    if r.get("category") not in INTEGRATION_CATEGORIES: return False
    if r.get("connectionMethod") not in CONNECTION_METHODS: return False
    if not r.get("lastVerified"): return False
    if r.get("publishedAt") and str(r["publishedAt"]) > today: return False
    if r["status"] in OPERATIONAL and not (r.get("verifiedEndToEnd") is True and r.get("commerciallyEnabled") is True):
        return False
    return True


def public_integration(r, bakuun_ok=False):
    method = r["connectionMethod"]
    provider = None
    if method == "bakuun":
        if bakuun_ok and r.get("connectionProviderDisclosureApproved") is True:
            provider = "Bakuun"
        else:
            method = "other_partner"          # do not leak the Bakuun association
    out = {"id": r["id"], "displayName": r["displayName"], "category": r["category"],
           "connectionMethod": method, "status": r["status"],
           "regions": [x for x in (r.get("regions") or []) if isinstance(x, str)],
           "featured": r.get("featured") is True, "lastVerified": r["lastVerified"]}
    if provider: out["connectionProvider"] = provider
    if r.get("publishedAt"): out["publishedAt"] = r["publishedAt"]
    if r.get("logo") and r.get("logoUseApproved") is True: out["logo"] = r["logo"]
    return out


def partner_ok(r):
    return (r.get("publicDisclosureApproved") is True and bool(r.get("name")) and bool(r.get("id"))
            and r.get("relationship") in PARTNER_RELATIONSHIPS and r.get("category") in PARTNER_CATEGORIES)


def public_partner(r):
    out = {k: r[k] for k in ("id", "name", "category", "relationship", "region") if r.get(k)}
    if r.get("logo") and r.get("logoUseApproved") is True: out["logo"] = r["logo"]
    if r.get("url") and str(r["url"]).startswith("https://"): out["url"] = r["url"]
    return out


def property_ok(r):
    return (r.get("featured") is True and r.get("publicDisclosureApproved") is True
            and r.get("relationshipVerified") is True and bool(r.get("name"))
            and r.get("relationship") in PROPERTY_RELATIONSHIPS)


def public_property(r):
    out = {k: r[k] for k in ("id", "name", "type", "relationship", "order") if r.get(k) is not None}
    if r.get("location") and r.get("locationVerified") is True: out["location"] = r["location"]
    if r.get("logo") and r.get("logoUseApproved") is True:
        out["logo"] = r["logo"]
        if r.get("imageAlt"): out["imageAlt"] = r["imageAlt"]
    return out


def metric_ok(doc, m):
    v = m.get("value")
    return (doc.get("approvedForPublication") is True and m.get("approvedForPublication") is True
            and isinstance(v, int) and not isinstance(v, bool) and v > 0
            and bool(m.get("verifiedAt")) and bool(m.get("source")))


def sanitize(rel, doc, flags, today, statuses, problems):
    """Return the public version of a data file (or None to omit it)."""
    if rel == "data/integrations.json":
        recs = [r for r in doc.get("records", []) if integration_ok(r, today, statuses)]
        if not flags.get("connectivityDirectory"):
            # Only the homepage showcase is on: publish just the featured subset.
            fc = doc.get("_featured_ids", set())
            recs = [r for r in recs if r["id"] in fc]
        out = {"lastReviewed": doc.get("lastReviewed"), "records": [public_integration(r, flags.get("bakuunNameApproved")) for r in recs]}
        if flags.get("connectivityDirectory") and not out["records"]:
            problems.append("connectivityDirectory is on but data/integrations.json has no publishable records")
        return out
    if rel == "data/featured-connections.json":
        return doc  # resolved in export() once integrations are known
    if rel == "data/partners-ecosystem.json":
        recs = [public_partner(r) for r in doc.get("records", []) if partner_ok(r)]
        if not recs: problems.append("partnerEcosystem is on but data/partners-ecosystem.json has no publishable records")
        return {"lastReviewed": doc.get("lastReviewed"), "records": recs}
    if rel == "data/featured-properties.json":
        items = sorted((public_property(r) for r in doc.get("items", []) if property_ok(r)),
                       key=lambda x: (x.get("order") or 9999, x["name"]))
        if len(items) < int(doc.get("minItems", 1)):
            problems.append("homepageFeaturedHotels is on but only %d featured properties qualify (minItems %s)"
                            % (len(items), doc.get("minItems", 1)))
        return {"minItems": doc.get("minItems", 1), "items": items}
    if rel == "data/network-stats.json":
        out = {k: doc.get(k) for k in ("verifiedAt", "source", "refreshCadence", "definitions")}
        out["approvedForPublication"] = doc.get("approvedForPublication") is True
        metrics = []
        for m in doc.get("metrics", []):
            ok = flags.get("networkStats") and m.get("id") in METRIC_IDS and metric_ok(doc, m)
            metrics.append({"id": m.get("id"), "value": m["value"] if ok else None,
                            "approvedForPublication": bool(ok),
                            "verifiedAt": m.get("verifiedAt") if ok else None,
                            "source": m.get("source") if ok else None})
        vals = {m["id"]: m["value"] for m in metrics}
        for small, big in (("directProperties", "availableProperties"), ("directCountries", "countriesCovered")):
            if vals.get(small) and vals.get(big) and vals[small] > vals[big]:
                problems.append("network-stats: %s (%s) exceeds %s (%s)" % (small, vals[small], big, vals[big]))
        out["metrics"] = metrics
        if flags.get("networkStats") and not any(vals.values()):
            problems.append("networkStats is on but no metric is approved with a verified positive value")
        cov = doc.get("coverage") or {}
        direct = [c for c in cov.get("direct", []) if ISO2.match(str(c))]
        connected = [c for c in cov.get("connected", []) if ISO2.match(str(c))]
        overlap = set(direct) & set(connected)
        if overlap: problems.append("network-stats coverage lists %s as both direct and connected" % sorted(overlap))
        cov_ok = (flags.get("networkCoverageMap") and cov.get("approvedForPublication") is True
                  and bool(cov.get("verifiedAt")) and bool(direct or connected))
        if flags.get("networkCoverageMap") and not cov_ok:
            problems.append("networkCoverageMap is on but coverage data is not approved/verified or is empty")
        out["coverage"] = {"approvedForPublication": bool(cov_ok),
                           "verifiedAt": cov.get("verifiedAt") if cov_ok else None,
                           "direct": direct if cov_ok else [], "connected": connected if cov_ok else []}
        return out
    return doc


# ---- export ----------------------------------------------------------------
def page_lastmod(rel):
    """YYYY-MM-DD of the last commit touching a source page, or None (no git / untracked)."""
    try:
        out = subprocess.run(["git", "log", "-1", "--format=%cs", "--", rel], cwd=ROOT,
                             capture_output=True, text=True, timeout=10).stdout.strip()
    except (OSError, subprocess.SubprocessError):
        return None
    return out if re.match(r"^\d{4}-\d{2}-\d{2}$", out) else None


def finalize_sitemap(out_dir, site_url):
    """Production sitemap: drop pages marked noindex (Search Console flags them as
    'submitted URL marked noindex') and add <lastmod> from git history."""
    sm = os.path.join(out_dir, "sitemap.xml")
    if not os.path.exists(sm): return
    def entry(m):
        loc = m.group(1)
        if not loc.startswith(site_url + "/"): return m.group(0)
        rel = loc[len(site_url) + 1:] + "index.html" if loc.endswith("/") else loc[len(site_url) + 1:]
        page = os.path.join(out_dir, rel)
        if os.path.exists(page) and re.search(r'<meta[^>]*name="robots"[^>]*noindex|<meta[^>]*noindex[^>]*name="robots"', read_text(page)):
            print("  sitemap: dropped noindex page", loc)
            return ""
        mod = page_lastmod(rel)
        return "  <url><loc>%s</loc>%s</url>\n" % (loc, "<lastmod>%s</lastmod>" % mod if mod else "")
    write_text(sm, re.sub(r"[ \t]*<url><loc>([^<]+)</loc>(?:<lastmod>[^<]*</lastmod>)?</url>\n?", entry, read_text(sm)))


def export(target):
    preview = target == "preview"
    out_dir = os.path.join(ROOT, "dist-preview" if preview else "dist")
    cfg = load("site-config.json")
    flags = cfg.get("featureFlags") or {}
    for k in flags:
        if k not in FLAGS: print("  WARN unknown featureFlags key:", k)
    for k in FLAGS:
        if not isinstance(flags.get(k, False), bool):
            print("  ERROR featureFlags.%s must be true or false" % k); return 1
    if cfg.get("buildTarget") == "preview" and not preview:
        print("  ERROR site-config.json says buildTarget=preview; refusing production export"); return 1
    if preview:
        flags = {k: True for k in FLAGS}
    else:
        flags = {k: flags.get(k) is True for k in FLAGS}
    # Disclosure approvals behave like gates too (gallery blocks, method labels).
    flags["bakuunNameApproved"] = preview or (cfg.get("disclosure") or {}).get("bakuunNameApproved") is True

    today = datetime.date.today().isoformat()
    statuses = status_keys()
    problems = []

    if os.path.isdir(out_dir): shutil.rmtree(out_dir)

    # 1. Copy the site, skipping tooling, docs and disabled routes/data/logos.
    skipped_routes = []
    for dirpath, dirnames, filenames in os.walk(ROOT):
        rel_dir = os.path.relpath(dirpath, ROOT)
        rel_dir = "" if rel_dir == "." else rel_dir.replace(os.sep, "/")
        dirnames[:] = [d for d in dirnames if d not in EXCLUDE_DIRS and not d.startswith(".")
                       and (rel_dir + "/" + d).strip("/") != LOGO_DIR]
        for fn in filenames:
            rel = (rel_dir + "/" + fn).strip("/")
            if fn in EXCLUDE_FILES or os.path.splitext(fn)[1] in EXCLUDE_EXT or (fn.startswith(".") and fn != ".nojekyll"):
                continue
            if rel in ROUTE_GATES and not gate_on(ROUTE_GATES[rel], flags):
                skipped_routes.append(rel); continue
            if rel in DATA_GATES:
                continue                                   # written below, sanitized
            dst = os.path.join(out_dir, rel)
            os.makedirs(os.path.dirname(dst), exist_ok=True)
            shutil.copy2(os.path.join(dirpath, fn), dst)

    # 2. Data files: source (production) or fixtures (preview), then sanitize.
    def source_doc(rel):
        fx = os.path.join(ROOT, "fixtures", rel)
        return load(os.path.relpath(fx, ROOT)) if preview and os.path.exists(fx) else load(rel)

    docs = {rel: source_doc(rel) for rel in DATA_GATES if gate_on(DATA_GATES[rel], flags)}
    integ_src = source_doc("data/integrations.json")
    integ_ok = {r["id"]: r for r in integ_src.get("records", []) if integration_ok(r, today, statuses)}
    if "data/featured-connections.json" in docs:
        fc = docs["data/featured-connections.json"]
        items = sorted((i for i in fc.get("items", [])
                        if i.get("featured") is True and i.get("verifiedLive") is True
                        and i.get("id") in integ_ok and integ_ok[i["id"]]["status"] in OPERATIONAL),
                       key=lambda i: (i.get("order") or 9999))
        if len(items) < int(fc.get("minItems", 1)):
            problems.append("homepageFeaturedConnections is on but only %d connections qualify (minItems %s)"
                            % (len(items), fc.get("minItems", 1)))
        docs["data/featured-connections.json"] = {"minItems": fc.get("minItems", 1),
                                                  "items": [{"id": i["id"], "order": i.get("order")} for i in items]}
        if "data/integrations.json" in docs:
            docs["data/integrations.json"]["_featured_ids"] = {i["id"] for i in items}

    logos = set()
    for rel, doc in docs.items():
        pub = sanitize(rel, doc, flags, today, statuses, problems)
        if isinstance(pub, dict): pub.pop("_featured_ids", None)
        for coll in ("records", "items"):
            for r in (pub or {}).get(coll, []):
                if r.get("logo"): logos.add(r["logo"])
        dst = os.path.join(out_dir, rel)
        os.makedirs(os.path.dirname(dst), exist_ok=True)
        with open(dst, "w", encoding="utf-8") as f:
            json.dump(pub, f, ensure_ascii=False, indent=1); f.write("\n")

    # 3. Approved logos only (missing files are allowed — the UI falls back to text).
    for logo in sorted(logos):
        if ".." in logo or logo.startswith("/") or re.match(r"^[a-z]+:", logo):
            problems.append("logo path must be site-relative: %s" % logo); continue
        src = os.path.join(ROOT, logo)
        if os.path.isfile(src):
            dst = os.path.join(out_dir, logo)
            os.makedirs(os.path.dirname(dst), exist_ok=True)
            shutil.copy2(src, dst)
        else:
            print("  note: logo file not found, text fallback will render:", logo)

    # 4. HTML + sitemap: strip disabled gate blocks; open enabled ones for no-JS.
    banner = ('<div class="preview-banner" role="note" style="position:relative;z-index:1000;'
              'background:repeating-linear-gradient(45deg,#FEF3C7 0 14px,#FDE68A 14px 28px);color:#78350F;'
              'font:600 13px/1.4 Inter,system-ui,sans-serif;padding:8px 16px;text-align:center;'
              'border-bottom:1px solid #F59E0B"><strong>Preview build</strong> — synthetic test data '
              'and every launch-gated feature switched on. Not for publication.</div>')
    for dirpath, _, filenames in os.walk(out_dir):
        for fn in filenames:
            if not fn.endswith((".html", ".xml")): continue
            p = os.path.join(dirpath, fn)
            s = read_text(p)
            def repl(m):
                expr = m.group("expr")
                if not gate_on(expr, flags): return ""
                inner = GATE_RE.sub(repl, m.group("body"))       # nested gates
                inner = inner.replace(' data-gate="%s"' % expr, ' data-gated="%s"' % expr)
                return "%s<!-- gate:start %s -->%s<!-- gate:end %s -->%s" % (m.group("ws"), expr, inner, expr, m.group("nl"))
            s = GATE_RE.sub(repl, s)
            if preview and fn.endswith(".html"):
                s = re.sub(r'<meta[^>]*name="robots"[^>]*/?>\s*', "", s)
                s = s.replace("<head>", '<head>\n<meta content="noindex,nofollow" name="robots"/>', 1)
                s = re.sub(r"(<body[^>]*>)", lambda m: m.group(1) + "\n" + banner, s, count=1)
            write_text(p, s)

    # 4b. Without Bakuun naming approval, the public method catalog omits it.
    cm = os.path.join(out_dir, "data", "connection-methods.json")
    if os.path.exists(cm) and not flags["bakuunNameApproved"]:
        doc = json.loads(read_text(cm))
        doc["methods"].pop("bakuun", None)
        doc["order"] = [k for k in doc["order"] if k != "bakuun"]
        doc.pop("_comment", None)
        write_text(cm, json.dumps(doc, ensure_ascii=False, indent=1) + "\n")

    # 4b2. Indexable language URLs (/ja/hotels/ …) + hreflang — only with
    #      site-config.json -> languageUrls.enabled (off until the draft
    #      translations are approved). Runs after the gates so withheld
    #      routes and links never get language copies.
    gated_out = {rel for rel, expr in ROUTE_GATES.items() if not gate_on(expr, flags)}
    localized, localized_langs = language_pages.generate(ROOT, out_dir, cfg, gated_out, problems)

    # 4c. HTTPS hardening: real domain, CNAME, CSP + referrer policy.
    site_url = (cfg.get("siteUrl") or "").rstrip("/")
    if not re.match(r"^https://[a-z0-9.-]+\.[a-z]{2,}$", site_url):
        problems.append("site-config.json siteUrl must be an https:// origin (got %r)" % cfg.get("siteUrl"))
        site_url = None
    html_files = []
    for dirpath, _, filenames in os.walk(out_dir):
        for fn in filenames:
            if fn.endswith((".html", ".xml", ".txt")):
                html_files.append(os.path.join(dirpath, fn))
    hashes = set()
    for p in html_files:
        if p.endswith(".html"):
            for body in INLINE_SCRIPT_RE.findall(read_text(p)):
                hashes.add(base64.b64encode(hashlib.sha256(body.encode("utf-8")).digest()).decode())
    csp = build_csp(cfg, hashes) if (cfg.get("security") or {}).get("contentSecurityPolicy", True) else None
    for p in html_files:
        s = read_text(p)
        if site_url and not preview:
            for o in PLACEHOLDER_ORIGINS:
                s = s.replace(o + "/", site_url + "/").replace(o + '"', site_url + '"').replace(o + "<", site_url + "<")
        if p.endswith(".html"):
            s = re.sub(r'\s*<meta[^>]*http-equiv="Content-Security-Policy"[^>]*>', "", s)
            tags = '<meta name="referrer" content="strict-origin-when-cross-origin"/>'
            if csp:
                tags = '<meta http-equiv="Content-Security-Policy" content="%s"/>\n' % csp + tags
            if 'name="referrer"' not in s:
                s = re.sub(r'(<meta charset="utf-8"/?>)', lambda m: m.group(1) + "\n" + tags, s, count=1)
            elif csp:
                s = re.sub(r'(<meta charset="utf-8"/?>)', lambda m: m.group(1) + "\n" + tags.split("\n")[0], s, count=1)
        write_text(p, s)
    if site_url and not preview:
        write_text(os.path.join(out_dir, "CNAME"), site_url.split("://", 1)[1] + "\n")
        finalize_sitemap(out_dir, site_url)

    # 5. Config + robots for the target.
    out_cfg = {k: v for k, v in cfg.items() if not k.startswith("_")}   # editor notes stay out of dist/
    out_cfg["featureFlags"] = {k: flags[k] for k in FLAGS}
    out_cfg["disclosure"] = dict(cfg.get("disclosure") or {}, bakuunNameApproved=flags["bakuunNameApproved"])
    out_cfg["languageUrls"] = {"enabled": bool(localized), "languages": localized_langs, "pages": localized}
    out_cfg["buildTarget"] = target
    with open(os.path.join(out_dir, "site-config.json"), "w", encoding="utf-8") as f:
        json.dump(out_cfg, f, ensure_ascii=False, indent=2); f.write("\n")
    if preview:
        write_text(os.path.join(out_dir, "robots.txt"), "# PREVIEW BUILD — do not index\nUser-agent: *\nDisallow: /\n")

    # 6. Production guards.
    if not preview:
        for rel, expr in ROUTE_GATES.items():
            if not gate_on(expr, flags) and os.path.exists(os.path.join(out_dir, rel)):
                problems.append("disabled route present in dist: " + rel)
        disabled_hrefs = [r.replace("index.html", "") for r, e in ROUTE_GATES.items() if not gate_on(e, flags)]
        for dirpath, _, filenames in os.walk(out_dir):
            for fn in filenames:
                p = os.path.join(dirpath, fn)
                if not fn.endswith((".html", ".js", ".json", ".xml", ".css", ".txt")): continue
                s = read_text(p)
                for marker in LEAK_MARKERS:
                    if marker in s:
                        problems.append("leak marker %r in %s" % (marker, os.path.relpath(p, out_dir)))
                if fn.endswith((".html", ".xml")):
                    for h in disabled_hrefs:
                        if re.search(r'(href="|<loc>)[^"<]*?(?<![\w-])%s(?:#[^"<]*)?(?=["<])' % re.escape(h), s):
                            problems.append("link to disabled route %s in %s" % (h, os.path.relpath(p, out_dir)))
        if not flags["bakuunNameApproved"]:
            for dirpath, _, filenames in os.walk(out_dir):
                for fn in filenames:
                    if fn.endswith((".html", ".json", ".xml", ".txt")):
                        if re.search(r"bakuun(?!NameApproved)", read_text(os.path.join(dirpath, fn)), re.I):
                            problems.append("Bakuun named in %s without disclosure.bakuunNameApproved"
                                            % os.path.relpath(os.path.join(dirpath, fn), out_dir))
        for p in html_files:
            t = read_text(p)
            for o in PLACEHOLDER_ORIGINS:
                if o in t and o != site_url:
                    problems.append("placeholder domain %s left in %s" % (o, os.path.relpath(p, out_dir)))
            if re.search(r'(src|href|action)="http://', t):
                problems.append("insecure http:// reference in %s" % os.path.relpath(p, out_dir))
            if p.endswith(".html") and re.search(r"\son[a-z]+=\"", t):
                problems.append("inline event handler (blocked by CSP) in %s" % os.path.relpath(p, out_dir))
        for d in ("fixtures", "_private", "tests", "tools"):
            if os.path.exists(os.path.join(out_dir, d)): problems.append("non-public folder in dist: " + d)

    on = [k for k in FLAGS if flags[k]]
    print("  %s export -> %s" % (target, os.path.relpath(out_dir, ROOT)))
    print("  features on: %s" % (", ".join(on) or "none"))
    if localized: print("  language URLs: %s × %d page(s)" % (", ".join(localized_langs), len(localized)))
    if skipped_routes: print("  routes withheld: %s" % ", ".join(r.replace("index.html", "") for r in skipped_routes))
    if problems:
        for p in problems: print("  ERROR", p)
        if not preview:
            print("  Production export FAILED — nothing in dist/ should be deployed.")
            shutil.rmtree(out_dir, ignore_errors=True)
            return 1
    return 0


if __name__ == "__main__":
    sys.exit(export("preview" if "--preview" in sys.argv else "production"))
