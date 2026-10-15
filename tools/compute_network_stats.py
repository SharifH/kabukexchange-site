#!/usr/bin/env python3
"""
Compute the four /network/ metrics from a canonical property export.

    python3 tools/compute_network_stats.py export.csv \
        --as-of 2026-01-31 --source "Supply ops export 2026-01-31" \
        [--exclude-source bakuun] [--out data/network-stats.json]

Input CSV (header row required, one row per property *per supply source*):

    canonical_property_id  stable id from canonical property mapping (REQUIRED;
                           rows without it are rejected — they cannot be deduplicated)
    source                 e.g. direct, bakuun, wholesaler:acme
    country                ISO 3166-1 alpha-2 (e.g. JP)
    direct_contract_active true/false — active direct commercial agreement with KBKx
    bookable               true/false — currently bookable through this source

Rules (match the definitions in data/network-stats.json):
  * Directly Contracted Properties = distinct canonical ids with ANY row where
    direct_contract_active is true. Being reachable via Bakuun or a wholesaler
    never makes a property "direct".
  * Direct Supply Countries = distinct countries of those properties.
  * Total Available Properties = distinct canonical ids with ANY bookable row
    from an enabled source (a hotel offered by three sources counts ONCE).
  * Countries Covered = distinct countries of available properties.
  * coverage.direct = direct supply countries; coverage.connected = covered
    countries that are NOT direct (so a market is never double-listed).

Output always has approvedForPublication=false unless --approved is passed;
--approved is for synthetic fixtures or after recorded owner sign-off only.
Standard library only.
"""
import argparse, csv, json, sys
from collections import Counter, defaultdict

TRUE = {"true", "1", "yes", "y"}


def compute(rows, exclude_sources=()):
    excluded = {s.lower() for s in exclude_sources}
    problems = []
    countries = defaultdict(Counter)
    direct, available = set(), set()
    for i, r in enumerate(rows, start=2):
        cid = (r.get("canonical_property_id") or "").strip()
        if not cid:
            problems.append("row %d: missing canonical_property_id — skipped" % i)
            continue
        src = (r.get("source") or "").strip().lower()
        cc = (r.get("country") or "").strip().upper()
        if len(cc) != 2 or not cc.isalpha():
            problems.append("row %d: invalid country %r for %s" % (i, cc, cid))
        else:
            countries[cid][cc] += 1
        if (r.get("direct_contract_active") or "").strip().lower() in TRUE:
            direct.add(cid)
        if src.split(":")[0] not in excluded and src not in excluded \
                and (r.get("bookable") or "").strip().lower() in TRUE:
            available.add(cid)

    def country_of(cid):
        c = countries.get(cid)
        if not c:
            return None
        if len(c) > 1:
            problems.append("%s: conflicting countries %s — using most frequent" % (cid, dict(c)))
        return c.most_common(1)[0][0]

    direct_cc = sorted({country_of(c) for c in direct} - {None})
    covered_cc = sorted({country_of(c) for c in available} - {None})
    return {
        "directProperties": len(direct),
        "directCountries": len(direct_cc),
        "availableProperties": len(available),
        "countriesCovered": len(covered_cc),
        "coverage": {"direct": direct_cc, "connected": [c for c in covered_cc if c not in direct_cc]},
    }, problems


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("csv")
    ap.add_argument("--as-of", required=True, help="verification date, YYYY-MM-DD")
    ap.add_argument("--source", required=True, help="human-readable data source")
    ap.add_argument("--exclude-source", action="append", default=[], help="source not currently enabled")
    ap.add_argument("--template", default="data/network-stats.json", help="file to take definitions from")
    ap.add_argument("--out", default="-")
    ap.add_argument("--approved", action="store_true", help="fixtures / recorded owner sign-off ONLY")
    a = ap.parse_args(argv)

    with open(a.csv, newline="", encoding="utf-8") as f:
        rows = list(csv.DictReader(f))
    result, problems = compute(rows, a.exclude_source)
    for p in problems:
        print("WARN", p, file=sys.stderr)

    doc = json.load(open(a.template, encoding="utf-8"))
    doc["approvedForPublication"] = bool(a.approved)
    doc["verifiedAt"], doc["source"] = a.as_of, a.source
    for m in doc["metrics"]:
        if m["id"] not in result:
            continue    # e.g. connectedSupplySources / connectedChannelManagers: maintained separately
        m.update(value=result[m["id"]], verifiedAt=a.as_of, source=a.source, approvedForPublication=bool(a.approved))
    doc["coverage"].update(result["coverage"], verifiedAt=a.as_of, source=a.source, approvedForPublication=bool(a.approved))
    text = json.dumps(doc, indent=2, ensure_ascii=False) + "\n"
    if a.out == "-":
        sys.stdout.write(text)
    else:
        open(a.out, "w", encoding="utf-8").write(text)
        print("wrote", a.out, {k: v for k, v in result.items() if k != "coverage"}, file=sys.stderr)


if __name__ == "__main__":
    main()
