# Translation review inventory

All non-English strings are **machine/draft quality** and need native-speaker review
before publication (ja, ko, zh-TW, ar). Brand names (KabuK Exchange, KBKx, KabuK Platform,
KabuK Style Inc., HafH) are intentionally untranslated.

## Priority 1 — new in this pass (all 4 languages)
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
