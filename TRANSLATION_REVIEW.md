# Translation review inventory

All non-English strings are **machine/draft quality** and need native-speaker review
before publication (ja, ko, zh-TW, ar). Brand names (KabuK Exchange, KBKx, KabuK Platform,
KabuK Style Inc., HafH) are intentionally untranslated.

## Priority 0 — Asia-first and roadmap pass (all 4 languages)
Key prefixes: `hp2.*`, `eco2.*`, `ecoD2.*`, `ecoH2.*`, `fut.*`, `wn.*`, `acc.*`, `pf.*`, `pt2.*`, `ht2.*`, `ab2.*`, `hdr2.*`, `ftr2.*`, `fm.future.*`, `cta.exploreOurNetwork`, `hdr.network.next.*`; plus the 12 status labels in `data/statuses.json`.
Check especially: “Asia-first” and “direct vs. connected inventory” (must not imply direct contracts for global inventory), ryokan terminology, “Supplier OTAs”, and the explicit flight exclusion in Ground Transportation.
The `/internal/status-badges/` page body is English by design (internal reference); its badge labels are localized.

## Priority 1 — earlier pass (all 4 languages)
Key prefixes: `hdr.*`, `ftr.*`, `eco.*`, `hp.*`, `ht.*`, `pt.*`, `ab.*`, `fm.*`, `plat.notice`,
`plat2.*`, `cta.linkYourProperty`, `cta.exploreNetwork`, `form.submitMailto`, `form.noteMailto`,
`form.statusMailto`, `form.submit`, `form.noteApi`, `platform.cta.*`, and the page diagrams `ecoH.*`, `ecoD.*`, `ecoC.*`, `ecoS.*`, `ecoP.*`.
Check especially: partner taxonomy consistency (Supply/Demand/Connectivity Partners),
"OTAs as Suppliers", "Bedbanks", "Settlement", and the hero headline rhythm.

## Priority 2 — Arabic filled for the first time
78 interior-page keys (`about.*`, `hotels.step*/use*/roadmap*`, `partners.*`, `form.*.helper`).

## Still English in every language (no i18n hooks yet)
- `<option>` values and checkbox labels in both lead forms (company type, region, volume,
  integration interest, property count, channels). Values are also the email payload, so
  translate labels only if routing teams agree.
- `/platform/*` subpages, `/developers/*`, `/resources/`, `/privacy/`, `/terms/` body copy
  (only shared header/footer and the platform notice are localized).
- `partners.json` directory entries and filter labels.
- Future (feature-flagged, hidden) sections.
- Hidden text "Coming soon" tooltip on disabled footer KabuK Platform link.


## 2026-10-14 additions (launch-gated features — review before each feature is enabled)
Keys: `net.*` (network page, metrics definitions, map), `cx.*` (connectivity directory, categories, regions, filters, counts), `pe.*` (partner ecosystem), `fc.*` / `fh.*` (homepage showcases, property types and relationship labels), `fm.topic.*`, `fm.system.label`, `gate.off.*`, `hp.eco.*` (partner types). Connection-method labels: `data/connection-methods.json`.
Points to check: “directly contracted” vs “connected” must stay legally distinct in every language; count strings (`cx.count`, `pe.count`) for plural forms (Arabic uses a separate singular); metric definitions must not imply direct contracts for connected inventory.
