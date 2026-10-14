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
ROUTES = {"network/index.html": ("networkStats", "networkCoverageMap"),
          "network/connectivity/index.html": ("connectivityDirectory",),
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
        self.assertEqual([m["value"] for m in s["metrics"]], [12, 3, 340, 9])
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


if __name__ == "__main__":
    unittest.main(verbosity=1)
