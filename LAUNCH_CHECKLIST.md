# Launch checklist — network & partner features

Six features are implemented but **off** (`site-config.json` → `featureFlags`, all `false`).
Enable each one **independently**, only after its section below is complete. If a
section lacks enough approved content, leave the feature off — do not publish
“Coming Soon” placeholders to fill space.

Record every sign-off (name, role, date, evidence link) in the “Sign-off” rows.

---

## 0. Applies to every feature

| Item | Owner (assign) | Done |
|---|---|---|
| Data comes from a named system of record; source + export date recorded | Data / Ops | ☐ |
| Every named organization has **written** permission for public disclosure (`publicDisclosureApproved`) | Partnerships / Legal | ☐ |
| Every logo has **written** logo-use permission and is the approved file (`logoUseApproved`, stored in `assets/logos/`) | Partnerships / Brand | ☐ |
| No prospect is described as a partner; no confidential terms, owners or escalation routes in `data/` (use `_private/`) | Partnerships | ☐ |
| New copy reviewed by native speakers (ja, ko, zh-TW, ar) — strings in `i18n/*.json` (`net.*`, `cx.*`, `pe.*`, `fc.*`, `fh.*`) are draft/machine-assisted | Localization | ☐ |
| `python3 build.py --production` succeeds; `dist/` reviewed locally (`python3 -m http.server 8080 -d dist`) | Web | ☐ |
| Tests pass: `tests/check_site.py`, `tests/test_publish.py`, `tests/browser_smoke.js`, `tests/launch_gates.js` | Web | ☐ |
| Keyboard, screen-reader spot check and 375px mobile check of the enabled feature | Web / QA | ☐ |
| All links from the feature work (nav, footer, CTAs, sitemap entry) | Web | ☐ |

---

## 1. `networkStats` — Network Statistics (`/network/` metrics)

| Item | Owner | Done |
|---|---|---|
| Canonical property export produced (one row per property per source, `canonical_property_id` filled) | Supply Ops / Data | ☐ |
| Values generated with `tools/compute_network_stats.py` (never typed by hand); disabled sources excluded with `--exclude-source` | Data | ☐ |
| **Directly Contracted** counts only active direct commercial agreements (not inventory via Bakuun / wholesalers) — confirmed by Commercial | Commercial | ☐ |
| **Available Properties** deduplicated across sources; spot-check 20 properties offered by >1 source | Data | ☐ |
| Each metric: `approvedForPublication: true`, `verifiedAt`, `source`; file-level `approvedForPublication`, `approvedBy` | Owner | ☐ |
| Refresh cadence agreed (default proposed: monthly) and owner named; stale figures (> 1 cycle) trigger rollback | Data | ☐ |
| Sign-off: | | |

## 2. `networkCoverageMap` — Coverage Map (`/network/#coverage`)

| Item | Owner | Done |
|---|---|---|
| `coverage.direct` = markets with ≥1 directly contracted property (ISO-2) | Supply Ops | ☐ |
| `coverage.connected` = markets reachable **only** via connected suppliers (no overlap with direct) | Data | ☐ |
| Coverage generated from the same export as the metrics (same `verifiedAt`) | Data | ☐ |
| Commercial confirms the map copy (“coverage does not necessarily indicate a direct commercial relationship”) is sufficient | Commercial / Legal | ☐ |
| `coverage.approvedForPublication: true` | Owner | ☐ |
| Sign-off: | | |

## 3. `connectivityDirectory` — Connectivity & Suppliers (`/network/connectivity/`)

| Item | Owner | Done |
|---|---|---|
| Each listed provider authorized public listing (`publicDisclosureApproved`) | Partnerships | ☐ |
| Each **status** is the KBKx-specific state, not the provider’s status elsewhere; operational statuses (Live, Available to Partners, Pilot, Beta) verified **end-to-end** and **commercially enabled** (`verifiedEndToEnd`, `commerciallyEnabled`) | Product / Integrations | ☐ |
| Bakuun-routed records: written authorization to name Bakuun **site-wide** (`disclosure.bakuunNameApproved`) **and** per provider (`connectionProviderDisclosureApproved`); otherwise they show “Via Technology Partner” | Partnerships / Legal | ☐ |
| `lastVerified` set on every record; `lastReviewed` set on the file (shown as “last verified” line) | Integrations | ☐ |
| `publishedAt` set on every record only if “Recently Added” sorting is wanted (option appears only when all records have trustworthy dates) | Web | ☐ |
| Internal notes/owners moved to `_private/integrations-internal.json` | Integrations | ☐ |
| “Request an Integration” reaches the right mailbox (`leadRouting.partnerEmail`, topic `integration_request`) | Ops | ☐ |
| Sign-off: | | |

## 4. `partnerEcosystem` — Partner Ecosystem (`/partners/ecosystem/`)

| Item | Owner | Done |
|---|---|---|
| Only `signed` or `integrated` relationships listed; prospects stay out (never published even if present) | Partnerships | ☐ |
| Relationship label (Signed partner / Integrated partner) confirmed per record | Partnerships | ☐ |
| Disclosure + logo permissions on file for every record | Partnerships / Legal | ☐ |
| Enough approved listings for a credible page (suggested ≥ 6); the grid is static — no carousel needed | Marketing | ☐ |
| Nav now points to `/partners/ecosystem/` instead of the homepage `#ecosystem` section — confirm | Marketing | ☐ |
| Sign-off: | | |

## 5. `homepageFeaturedConnections` — Featured Connections (homepage)

| Item | Owner | Done |
|---|---|---|
| Each item references an approved integration with an operational status; item `featured` + `verifiedLive` | Integrations | ☐ |
| At least `minItems` (default 3) qualify, otherwise the section is removed automatically (and the production build fails) | Web | ☐ |
| The “Explore Our Connections” button appears only if `connectivityDirectory` is also on — decide whether to enable both together | Marketing | ☐ |
| Sign-off: | | |

## 6. `homepageFeaturedHotels` — Featured Hotels & Hotel Groups (homepage)

| Item | Owner | Done |
|---|---|---|
| Each property/group gave permission to be featured (`publicDisclosureApproved`) | Supply Partnerships | ☐ |
| Relationship verified and labelled correctly (`direct_contract` only for directly contracted; `connected_supplier` for indirect) — `relationshipVerified` | Commercial | ☐ |
| Location verified (`locationVerified`) or omitted; image/logo permission (`logoUseApproved`) with alt text (`imageAlt`) | Supply Partnerships | ☐ |
| At least `minItems` (default 3) qualify | Web | ☐ |
| Consider the alternate heading “Meet Some of the Properties and Groups in Our Network.” only once the network is mature | Marketing | ☐ |
| Sign-off: | | |

---

## Enable procedure (per feature)

1. Complete §0 and the feature’s section above.
2. Add the approved data to `data/…` (not `fixtures/`).
3. Set the flag to `true` in `site-config.json`.
4. `python3 build.py --production` — fix any `ERROR` it prints (it refuses to publish empty, inconsistent or leaking output).
5. Serve `dist/` locally, review in all five languages and at mobile width; run the tests.
6. Deploy **`dist/`**; purge the CDN cache.
7. Check the live route, nav link, footer link and `sitemap.xml`.

## Rollback procedure

1. Set the flag back to `false` in `site-config.json` (or remove/unapprove the offending record).
2. `python3 build.py --production` and deploy `dist/`.
3. Purge the CDN cache; confirm the route now returns 404 and the nav/footer/sitemap entries are gone.
4. Record the reason and date below.

| Date | Feature | Action | By | Reason |
|---|---|---|---|---|
| | | | | |

## Preview / staging

`python3 build.py --preview` → `dist-preview/`: every feature on, **synthetic fixtures only**
(“Test …” names, striped banner, `noindex`, `Disallow: /`). Host it only behind
authentication, never on the production domain. Fixture records include deliberately
ineligible cases (unapproved, prospect, unverified live, future publish date, missing
logo) so reviewers can confirm they do not appear.
