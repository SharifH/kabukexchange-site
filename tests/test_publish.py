#!/usr/bin/env python3
"""
Unit tests for the launch-gated publish step (publish.py). Standard library only.

    python3 tests/test_publish.py

Each test copies the site into a temporary folder, edits site-config.json and
data/*.json there, runs the production export and inspects dist/. Nothing in
the real working tree is modified.
"""
import contextlib, io, json, os, shutil, sys, tempfile, unittest

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SKIP = shutil.ignore_patterns(".git", "dist", "dist-preview", "node_modules", "__pycache__")
FLAGS = ["networkStats", "networkCoverageMap", "connectivityDirectory",
         "partnerEcosystem", "homepageFeaturedConnections", "homepageFeaturedHotels"]
ROUTES = {"network/connectivity/index.html": ("connectivityDirectory",),
          "partners/ecosystem/index.html": ("partnerEcosystem",)}

# Neutral, clearly-not-fixture sample data used only inside the temp copy.
def rec(i, **kw):
    r = {"id": "c%d" % i, "displayName": "Acme System %d" % i, "category": "channel_manager",
         "connectionMethod": "direct", "status": "live", "regions": ["japan"], "featured": True,
         "logo": "assets/logos/c%d.svg" % i, "logoUseApproved": True, "publicDisclosureApproved": True,
         "verifiedEndToEnd": True, "commerciallyEnabled": True, "lastVerified": "2026-01-01"}
    r.update(kw); return r

DATA = {
    "integrations.json": {"lastReviewed": "2026-01-02", "records": [
        rec(1), rec(2, connectionMethod="bakuun", connectionProvider="Bakuun", connectionProviderDisclosureApproved=False),
        rec(3, logoUseApproved=False), rec(4, status="planned", featured=False),
        rec(5, publicDisclosureApproved=False, displayName="Secret Prospect"),
        rec(6, verifiedEndToEnd=False, displayName="Unverified Live"),
        rec(7, internalNotes="escalate to ops lead", status="beta"),
    ]},
    "featured-connections.json": {"minItems": 3, "items": [
        {"id": "c1", "order": 1, "featured": True, "verifiedLive": True},
        {"id": "c2", "order": 2, "featured": True, "verifiedLive": True},
        {"id": "c3", "order": 3, "featured": True, "verifiedLive": True},
        {"id": "c5", "order": 0, "featured": True, "verifiedLive": True},
        {"id": "c4", "order": 4, "featured": True, "verifiedLive": True}]},
    "partners-ecosystem.json": {"records": [
        {"id": "p1", "name": "Acme Hotels", "category": "accommodation", "relationship": "signed", "publicDisclosureApproved": True, "logoUseApproved": False, "logo": "assets/logos/p1.svg"},
        {"id": "p2", "name": "Maybe Corp", "category": "distribution", "relationship": "prospective", "publicDisclosureApproved": True, "logoUseApproved": True}]},
    "featured-properties.json": {"minItems": 1, "items": [
        {"id": "h1", "name": "Acme Inn", "type": "hotel", "relationship": "direct_contract", "relationshipVerified": True, "publicDisclosureApproved": True, "featured": True, "location": "Nara", "locationVerified": False},
        {"id": "h2", "name": "Unverified Inn", "type": "hotel", "relationship": "direct_contract", "relationshipVerified": False, "publicDisclosureApproved": True, "featured": True}]},
}


class PublishTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.mkdtemp()
        self.site = os.path.join(self.tmp, "site")
        shutil.copytree(ROOT, self.site, ignore=SKIP)
        sys.path.insert(0, self.site)
        import importlib, publish
        self.P = importlib.reload(publish)
        self.P.ROOT = self.site

    def tearDown(self):
        sys.path.remove(self.site)
        shutil.rmtree(self.tmp, ignore_errors=True)

    # helpers
    def set_flags(self, **on):
        p = os.path.join(self.site, "site-config.json")
        cfg = json.load(open(p))
        cfg["featureFlags"] = {k: on.get(k, False) for k in FLAGS}
        json.dump(cfg, open(p, "w"))

    def put_data(self, approved_stats=True):
        os.makedirs(os.path.join(self.site, "assets/logos"), exist_ok=True)
        for n in ("c1", "c2", "c3", "p1"):
            open(os.path.join(self.site, "assets/logos/%s.svg" % n), "w").write("<svg xmlns='http://www.w3.org/2000/svg'/>")
        for name, doc in DATA.items():
            json.dump(doc, open(os.path.join(self.site, "data", name), "w"))
        stats = json.load(open(os.path.join(self.site, "data/network-stats.json")))
        for m, v in zip(stats["metrics"], [12, 3, 340, 9]):
            m.update(value=v, approvedForPublication=approved_stats, verifiedAt="2026-01-31", source="ops export")
        stats.update(approvedForPublication=approved_stats, verifiedAt="2026-01-31", source="ops export")
        stats["coverage"].update(direct=["JP", "TH"], connected=["SG", "FR"], approvedForPublication=approved_stats, verifiedAt="2026-01-31")
        json.dump(stats, open(os.path.join(self.site, "data/network-stats.json"), "w"))

    def export(self):
        buf = io.StringIO()
        with contextlib.redirect_stdout(buf):
            code = self.P.export("production")
        self.log = buf.getvalue()
        return code

    def dist(self, rel):
        return os.path.join(self.site, "dist", rel)

    def read(self, rel):
        return open(self.dist(rel), encoding="utf-8").read()

    def all_text(self):
        out = ""
        for d, _, fs in os.walk(os.path.join(self.site, "dist")):
            if os.sep + "internal" in d: continue          # the badge gallery documents field names
            for f in fs:
                # script.js legitimately names the approval fields it checks.
                if f.endswith((".html", ".json", ".xml", ".js", ".txt")) and f != "script.js":
                    out += open(os.path.join(d, f), encoding="utf-8").read()
        return out

    # tests
    def test_default_all_off(self):
        self.assertEqual(self.export(), 0, self.log)
        for r in ROUTES: self.assertFalse(os.path.exists(self.dist(r)), r)
        net = self.read("network/index.html")                                  # public since Oct 2026
        for gated in ('data-net-metrics', 'data-net-map', 'network/connectivity/', 'partners/ecosystem/'):
            self.assertNotIn(gated, net)
        self.assertTrue(os.path.exists(self.dist("connectivity/index.html")))
        for f in DATA: self.assertFalse(os.path.exists(self.dist("data/" + f)), f)
        self.assertFalse(os.path.exists(self.dist("data/network-stats.json")))
        for d in ("fixtures", "_private", "tests", "tools", "partials"): self.assertFalse(os.path.exists(self.dist(d)), d)
        home = self.read("index.html")
        self.assertNotIn("featured-hotels", home); self.assertNotIn("featured-connections", home)
        self.assertNotIn('data-gate="', home)
        self.assertFalse(any(f.endswith(".md") or f.endswith(".py") for f in os.listdir(self.dist(""))))

    def test_each_flag_enables_only_itself(self):
        self.put_data()
        for flag in FLAGS:
            with self.subTest(flag=flag):
                self.set_flags(**{flag: True})
                self.assertEqual(self.export(), 0, self.log)
                for route, needs in ROUTES.items():
                    self.assertEqual(os.path.exists(self.dist(route)), flag in needs, (flag, route))
                home = self.read("index.html")
                self.assertEqual("featured-connections" in home, flag == "homepageFeaturedConnections")
                self.assertEqual("featured-hotels" in home, flag == "homepageFeaturedHotels")
                sm = self.read("sitemap.xml")
                self.assertEqual("/network/connectivity/" in sm, flag == "connectivityDirectory")
                self.assertEqual("/partners/ecosystem/" in sm, flag == "partnerEcosystem")
                header = self.read("about/index.html")
                self.assertEqual('network/connectivity/"' in header, flag == "connectivityDirectory")

    def test_sanitized_integrations(self):
        self.put_data(); self.set_flags(connectivityDirectory=True)
        self.assertEqual(self.export(), 0, self.log)
        recs = {r["id"]: r for r in json.load(open(self.dist("data/integrations.json")))["records"]}
        self.assertEqual(sorted(recs), ["c1", "c2", "c3", "c4", "c7"])        # c5 unapproved, c6 unverified live
        self.assertEqual(recs["c2"]["connectionMethod"], "other_partner")      # Bakuun not authorized
        self.assertNotIn("connectionProvider", recs["c2"])
        self.assertNotIn("logo", recs["c3"])                                   # logo not approved
        text = self.all_text()
        for leaked in ("escalate to ops lead", "Secret Prospect", "Unverified Live", "internalNotes", "publicDisclosureApproved", "verifiedEndToEnd"):
            self.assertFalse(leaked in text, "leaked: " + leaked)
        self.assertTrue(os.path.exists(self.dist("assets/logos/c1.svg")))
        self.assertFalse(os.path.exists(self.dist("assets/logos/p1.svg")))    # unapproved logo not copied

    def test_featured_connections_only_subset(self):
        self.put_data(); self.set_flags(homepageFeaturedConnections=True)
        self.assertEqual(self.export(), 0, self.log)
        fc = json.load(open(self.dist("data/featured-connections.json")))
        self.assertEqual([i["id"] for i in fc["items"]], ["c1", "c2", "c3"])   # c4 planned, c5 unapproved
        integ = json.load(open(self.dist("data/integrations.json")))["records"]
        self.assertEqual(sorted(r["id"] for r in integ), ["c1", "c2", "c3"])   # directory off → featured subset only

    def test_partners_and_properties(self):
        self.put_data(); self.set_flags(partnerEcosystem=True, homepageFeaturedHotels=True)
        self.assertEqual(self.export(), 0, self.log)
        pe = json.load(open(self.dist("data/partners-ecosystem.json")))["records"]
        self.assertEqual([p["id"] for p in pe], ["p1"]); self.assertNotIn("logo", pe[0])
        fp = json.load(open(self.dist("data/featured-properties.json")))["items"]
        self.assertEqual([p["id"] for p in fp], ["h1"]); self.assertNotIn("location", fp[0])
        self.assertNotIn("Maybe Corp", self.all_text())

    def test_stats_need_approval_and_consistency(self):
        self.put_data(approved_stats=False); self.set_flags(networkStats=True)
        self.assertEqual(self.export(), 1, "unapproved stats must not publish")
        self.assertFalse(os.path.exists(self.dist("")), "failed export must leave no dist/")
        self.put_data(approved_stats=True)
        stats = json.load(open(os.path.join(self.site, "data/network-stats.json")))
        stats["metrics"][0]["value"] = 999                                     # direct > available
        json.dump(stats, open(os.path.join(self.site, "data/network-stats.json"), "w"))
        self.assertEqual(self.export(), 1)
        self.assertIn("exceeds", self.log)

    def test_stats_published_without_map(self):
        self.put_data(); self.set_flags(networkStats=True)
        self.assertEqual(self.export(), 0, self.log)
        s = json.load(open(self.dist("data/network-stats.json")))
        self.assertEqual([m["value"] for m in s["metrics"]][:4], [12, 3, 340, 9])
        self.assertEqual(s["coverage"]["direct"], [])                          # map flag off → no coverage data

    def test_empty_feature_refused(self):
        for flag in FLAGS:
            with self.subTest(flag=flag):
                self.set_flags(**{flag: True})
                self.assertEqual(self.export(), 1, "%s with no publishable data must fail\n%s" % (flag, self.log))

    def test_bad_config_refused(self):
        p = os.path.join(self.site, "site-config.json")
        cfg = json.load(open(p)); cfg["featureFlags"]["networkStats"] = "yes"; json.dump(cfg, open(p, "w"))
        self.assertEqual(self.export(), 1)
        cfg["featureFlags"]["networkStats"] = False; cfg["buildTarget"] = "preview"; json.dump(cfg, open(p, "w"))
        self.assertEqual(self.export(), 1)

    def test_fixture_leak_blocked(self):
        # Copying the synthetic fixtures into data/ must never produce a deployable dist/.
        for f in os.listdir(os.path.join(self.site, "fixtures/data")):
            shutil.copy(os.path.join(self.site, "fixtures/data", f), os.path.join(self.site, "data", f))
        self.set_flags(connectivityDirectory=True)
        self.assertEqual(self.export(), 1)
        self.assertIn("leak marker", self.log)

    def test_bakuun_name_requires_both_approvals(self):
        self.put_data()
        d = json.load(open(os.path.join(self.site, "data/integrations.json")))
        d["records"][1]["connectionProviderDisclosureApproved"] = True
        json.dump(d, open(os.path.join(self.site, "data/integrations.json"), "w"))
        self.set_flags(connectivityDirectory=True)
        self.assertEqual(self.export(), 0, self.log)                          # global approval off
        recs = {r["id"]: r for r in json.load(open(self.dist("data/integrations.json")))["records"]}
        self.assertEqual(recs["c2"]["connectionMethod"], "other_partner")
        self.assertNotIn("bakuun", json.load(open(self.dist("data/connection-methods.json")))["methods"])
        self.assertNotIn("Via Bakuun", self.read("internal/status-badges/index.html"))
        p = os.path.join(self.site, "site-config.json"); cfg = json.load(open(p))
        cfg["disclosure"] = {"bakuunNameApproved": True}; json.dump(cfg, open(p, "w"))
        self.set_flags(connectivityDirectory=True)
        cfg = json.load(open(p)); cfg["disclosure"] = {"bakuunNameApproved": True}; json.dump(cfg, open(p, "w"))
        self.assertEqual(self.export(), 0, self.log)
        recs = {r["id"]: r for r in json.load(open(self.dist("data/integrations.json")))["records"]}
        self.assertEqual((recs["c2"]["connectionMethod"], recs["c2"].get("connectionProvider")), ("bakuun", "Bakuun"))
        self.assertIn("Via Bakuun", self.read("internal/status-badges/index.html"))

    def test_https_hardening(self):
        self.assertEqual(self.export(), 0, self.log)
        self.assertEqual(self.read("CNAME").strip(), "www.kabukexchange.com")
        home = self.read("index.html")
        self.assertIn('http-equiv="Content-Security-Policy"', home)
        self.assertIn("upgrade-insecure-requests", home)
        self.assertIn("object-src 'none'", home)
        self.assertIn('name="referrer" content="strict-origin-when-cross-origin"', home)
        self.assertIn('href="https://www.kabukexchange.com/" rel="canonical"', home)
        self.assertIn("<loc>https://www.kabukexchange.com/</loc>", self.read("sitemap.xml"))
        self.assertIn("Sitemap: https://www.kabukexchange.com/sitemap.xml", self.read("robots.txt"))
        text = self.all_text()
        for o in ("https://www.kbkx.example.com", "https://kabukexchange.com/"):
            self.assertNotIn(o, text)
        self.assertNotRegex(text, r'(src|href|action)="http://')

    def test_csp_hashes_inline_script_and_allows_configured_origins(self):
        import base64, hashlib, re
        p = os.path.join(self.site, "site-config.json"); cfg = json.load(open(p))
        cfg["security"]["extraScriptSrc"] = ["https://analytics.example.org/js/x.js"]
        cfg["formMode"] = "api"; cfg["apiEndpoint"] = "https://api.example.net/v1/leads"
        json.dump(cfg, open(p, "w"))
        self.assertEqual(self.export(), 0, self.log)
        home = self.read("index.html")
        csp = re.search(r'http-equiv="Content-Security-Policy" content="([^"]+)"', home).group(1)
        body = 'document.documentElement.classList.add("js");'
        h = base64.b64encode(hashlib.sha256(body.encode()).digest()).decode()
        self.assertIn("'sha256-%s'" % h, csp)
        self.assertIn("https://analytics.example.org", csp)
        self.assertIn("connect-src 'self' https://api.example.net", csp)

    def test_site_url_must_be_https(self):
        p = os.path.join(self.site, "site-config.json"); cfg = json.load(open(p))
        cfg["siteUrl"] = "http://www.kabukexchange.com"; json.dump(cfg, open(p, "w"))
        self.assertEqual(self.export(), 1)
        self.assertIn("siteUrl must be an https://", self.log)

    def test_dedup_tool(self):
        sys.path.insert(0, os.path.join(self.site, "tools"))
        import compute_network_stats as C
        rows = [
            {"canonical_property_id": "A", "source": "direct", "country": "JP", "direct_contract_active": "true", "bookable": "true"},
            {"canonical_property_id": "A", "source": "bakuun", "country": "JP", "direct_contract_active": "false", "bookable": "true"},
            {"canonical_property_id": "B", "source": "bakuun", "country": "TH", "direct_contract_active": "false", "bookable": "true"},
            {"canonical_property_id": "B", "source": "wholesaler:x", "country": "TH", "direct_contract_active": "false", "bookable": "true"},
            {"canonical_property_id": "C", "source": "direct", "country": "KR", "direct_contract_active": "true", "bookable": "false"},
            {"canonical_property_id": "", "source": "bakuun", "country": "JP", "direct_contract_active": "false", "bookable": "true"},
        ]
        r, problems = C.compute(rows)
        self.assertEqual((r["directProperties"], r["directCountries"], r["availableProperties"], r["countriesCovered"]), (2, 2, 2, 2))
        self.assertEqual(r["coverage"], {"direct": ["JP", "KR"], "connected": ["TH"]})
        self.assertTrue(any("canonical" in p for p in problems))
        r2, _ = C.compute(rows, exclude_sources=["bakuun"])                    # a disabled source no longer counts
        self.assertEqual(r2["availableProperties"], 2)
        r3, _ = C.compute(rows, exclude_sources=["bakuun", "wholesaler"])
        self.assertEqual(r3["availableProperties"], 1)


class LanguageUrlTests(unittest.TestCase):
    """site-config.json -> languageUrls: static /<lang>/ pages + hreflang."""
    LANGS = ["en", "ja", "ko", "zh-TW", "ar"]
    setUp, tearDown, export, dist, read, all_text, set_flags, put_data = (
        PublishTests.setUp, PublishTests.tearDown, PublishTests.export, PublishTests.dist,
        PublishTests.read, PublishTests.all_text, PublishTests.set_flags, PublishTests.put_data)

    def enable(self, **over):
        p = os.path.join(self.site, "site-config.json"); cfg = json.load(open(p))
        cfg["languageUrls"] = dict(cfg["languageUrls"], enabled=True, **over)
        json.dump(cfg, open(p, "w"))
        return cfg["languageUrls"]

    def i18n(self, code):
        sys.path.insert(0, self.site)
        import language_pages
        return language_pages.flatten(json.load(open(os.path.join(self.site, "i18n", code + ".json"), encoding="utf-8")))

    @staticmethod
    def url(code, route):
        return "https://www.kabukexchange.com" + ("" if code == "en" else "/" + code) + route

    def head_links(self, doc):
        import re
        canon = re.findall(r'<link href="([^"]+)" rel="canonical"/>', doc)
        alts = dict((h, u) for u, h in re.findall(r'<link href="([^"]+)" hreflang="([^"]+)" rel="alternate"/>', doc))
        return canon, alts

    def page_file(self, code, route):
        return ("" if code == "en" else code + "/") + (route.strip("/") + "/index.html").lstrip("/")

    def test_off_by_default_and_english_unchanged(self):
        cfg = json.load(open(os.path.join(ROOT, "site-config.json")))
        self.assertIs(cfg["languageUrls"]["enabled"], False, "languageUrls must ship disabled")
        self.assertEqual(self.export(), 0, self.log)
        for code in self.LANGS[1:]: self.assertFalse(os.path.exists(self.dist(code)), code)
        text = self.all_text()
        self.assertNotIn("hreflang", text); self.assertNotIn("data-lang-urls", text)
        self.assertEqual(json.load(open(self.dist("site-config.json")))["languageUrls"], {"enabled": False, "languages": [], "pages": []})

    def test_language_pages_canonical_and_hreflang(self):
        import re
        lu = self.enable()
        self.assertEqual(self.export(), 0, self.log)
        routes = [r for r in lu["pages"] if r not in ("/network/connectivity/", "/partners/ecosystem/")]
        dicts = {c: self.i18n(c) for c in self.LANGS}
        for route in routes:
            want = {c: self.url(c, route) for c in self.LANGS}
            want["x-default"] = self.url("en", route)
            for code in self.LANGS:
                doc = self.read(self.page_file(code, route))
                canon, alts = self.head_links(doc)
                self.assertEqual(canon, [self.url(code, route)], "%s %s: self-referencing canonical" % (code, route))
                self.assertEqual(alts, want, "%s %s: full, reciprocal hreflang set" % (code, route))
                if 'property="og:url"' in doc:
                    self.assertIn('<meta content="%s" property="og:url"/>' % self.url(code, route), doc)
                html_tag = re.search(r"<html[^>]*>", doc).group(0)
                self.assertIn('lang="%s"' % code, html_tag)
                self.assertIn('dir="%s"' % ("rtl" if code == "ar" else "ltr"), html_tag)
                self.assertIn("data-lang-urls", html_tag)
                h1 = re.search(r'<h1[^>]*data-i18n="([^"]+)"[^>]*>(.*?)</h1>', doc, re.S)
                import html as H
                self.assertEqual(H.unescape(h1.group(2)), dicts[code].get(h1.group(1)) or dicts["en"][h1.group(1)], "%s %s h1" % (code, route))
                if code != "en":
                    self.assertIn("<title>%s | KabuK Exchange</title>" % h1.group(2), doc)
                self.assertIn('http-equiv="Content-Security-Policy"', doc)
                self.assertNotRegex(doc, r'\son[a-z]+="')
        # titles and descriptions stay unique across the whole export
        titles, descs = {}, {}
        for d, _, fs in os.walk(self.dist("")):
            for f in fs:
                if not f.endswith(".html") or "internal" in d or f == "404.html": continue
                doc = open(os.path.join(d, f), encoding="utf-8").read()
                if 'name="robots"' in doc and "noindex" in doc: continue
                rel = os.path.relpath(os.path.join(d, f), self.dist(""))
                titles.setdefault(re.search(r"<title>(.*?)</title>", doc, re.S).group(1), []).append(rel)
                descs.setdefault(re.search(r'<meta content="([^"]*)" name="description"', doc).group(1), []).append(rel)
        self.assertEqual({t: v for t, v in titles.items() if len(v) > 1}, {}, "duplicate <title>")
        self.assertEqual({t: v for t, v in descs.items() if len(v) > 1}, {}, "duplicate description")
        # English-only pages keep a single URL and no hreflang
        dev = self.read("developers/index.html")
        self.assertNotIn("hreflang", dev); self.assertFalse(os.path.exists(self.dist("ja/developers")))

    def test_links_and_assets_resolve(self):
        import re
        self.enable()
        self.assertEqual(self.export(), 0, self.log)
        out = self.dist("")
        for code in self.LANGS[1:]:
            for d, _, fs in os.walk(os.path.join(out, code)):
                for f in fs:
                    p = os.path.join(d, f); doc = open(p, encoding="utf-8").read()
                    urls = re.findall(r'\s(?:href|src)="([^"]*)"', doc)
                    urls += [c.strip().split(" ")[0] for ss in re.findall(r'srcset="([^"]*)"', doc) for c in ss.split(",")]
                    for u in urls:
                        if not u or re.match(r"(https?:|mailto:|tel:|data:|#|//)", u): continue
                        t = os.path.normpath(os.path.join(d, u.split("#")[0].split("?")[0]))
                        if os.path.isdir(t): t = os.path.join(t, "index.html")
                        self.assertTrue(os.path.exists(t), "%s: broken %s" % (os.path.relpath(p, out), u))
        ja_home = self.read("ja/index.html")
        self.assertIn('href="hotels/"', ja_home)                 # stays in /ja/
        self.assertIn('href="../developers/"', ja_home)          # English-only page
        self.assertIn('href="../styles.css"', ja_home)
        self.assertIn('src="../script.js"', ja_home)
        ja_hotels = self.read("ja/hotels/index.html")
        self.assertIn('href="../"', ja_hotels)                   # /ja/ home
        self.assertIn('href="../../styles.css"', ja_hotels)

    def test_sitemap_lists_every_language_url(self):
        import re
        lu = self.enable()
        self.assertEqual(self.export(), 0, self.log)
        sm = self.read("sitemap.xml")
        self.assertIn('xmlns:xhtml="http://www.w3.org/1999/xhtml"', sm)
        locs = re.findall(r"<loc>([^<]+)</loc>", sm)
        self.assertEqual(len(locs), len(set(locs)), "duplicate sitemap entries")
        for route in lu["pages"]:
            gated = route in ("/network/connectivity/", "/partners/ecosystem/")
            for code in self.LANGS:
                self.assertEqual(self.url(code, route) in locs, not gated, "%s %s in sitemap" % (code, route))
            if gated: continue
            entry = re.search(r"<url><loc>%s</loc>(.*?)</url>" % re.escape(self.url("ja", route)), sm).group(1)
            alts = dict(re.findall(r'hreflang="([^"]+)" href="([^"]+)"', entry))
            self.assertEqual(alts, dict({c: self.url(c, route) for c in self.LANGS}, **{"x-default": self.url("en", route)}))
        self.assertIn("<loc>https://www.kabukexchange.com/developers/</loc>", sm)
        self.assertNotIn("/ja/developers/", sm)
        cfg = json.load(open(self.dist("site-config.json")))["languageUrls"]
        self.assertEqual(cfg["languages"], ["ja", "ko", "zh-TW", "ar"])
        self.assertNotIn("/partners/ecosystem/", cfg["pages"])

    def test_gated_routes_follow_their_flag(self):
        self.put_data(); self.set_flags(partnerEcosystem=True); self.enable()
        self.assertEqual(self.export(), 0, self.log)
        self.assertTrue(os.path.exists(self.dist("ja/partners/ecosystem/index.html")))
        self.assertFalse(os.path.exists(self.dist("ja/network/connectivity")))
        self.assertNotIn("network/connectivity/", self.read("ja/index.html"))

    def test_bad_language_config_refused(self):
        self.enable(languages=["ja", "fr"])
        self.assertEqual(self.export(), 1); self.assertIn("'fr' is not a non-English language", self.log)
        self.enable(languages=["ja"], pages=["/", "/privacy/"])
        self.assertEqual(self.export(), 1); self.assertIn("/privacy/ is noindex", self.log)
        self.enable(languages=["ja"], pages=["/nope/"])
        self.assertEqual(self.export(), 1); self.assertIn("/nope/ is not a page", self.log)


if __name__ == "__main__":
    unittest.main(verbosity=1)
