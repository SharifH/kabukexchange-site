# Changelog

## 2026-10-14 — Network, directory and partner features (built, launch-gated OFF)
Editorial reference: KABUK_EXCHANGE_NETWORK_AND_LAUNCH_COPY.md. Base: the Asia-first build (c) below, applied on top of the uploaded repository (its history is kept).

**Launch gates**
- `site-config.json` → `featureFlags` with six independent flags, all `false`: `networkStats`, `networkCoverageMap`, `connectivityDirectory`, `partnerEcosystem`, `homepageFeaturedConnections`, `homepageFeaturedHotels`. Flags control components, nav/footer links, CTAs and sitemap entries.
- New publish step (`publish.py`, via `python3 build.py --production` → `dist/`): disabled routes and data are left out entirely; records filtered through publication rules with non-public fields stripped; approved logos only; refuses empty features, inconsistent figures, fixture leaks and unapproved Bakuun naming. `--preview` → `dist-preview/` with synthetic fixtures, banner, noindex and Disallow-all. No URL/query override.
- `disclosure.bakuunNameApproved` (false): without it, production never names Bakuun; routes show “Via Technology Partner”.
- Runtime guard in `script.js` (removes gated elements, “Page not found” + noindex on gated pages in the un-built tree).

**Features (all built, all off)**
- `/network/`: four metrics (Directly Contracted Properties, Direct Supply Countries, Available Properties, Countries Covered) with accessible count-up (final value announced once; reduced motion shows final values), null-hiding and consistency guards; direct vs connected explainer; Asia-Pacific tile coverage map + rest-of-world groups + accessible country lists (LTR geography in RTL).
- `/network/connectivity/`: search, category / status / connection-method / region filters, Recommended (operational first, Asia relevance, name) / A–Z / Z–A / Recently Added (only with trustworthy dates), result count, clear-all, empty state, URL state, operational vs in-progress groups, method explainer, “Connected Through Technology Partners”, “Request an Integration” CTA.
- `/partners/ecosystem/`: search, category chips, A–Z, logo cards with monogram fallback, signed/integrated labels (prospects never published), approved-listings empty state.
- Homepage: Featured Hotels & Hotel Groups and Featured Connections components (per-item flags, ordering, `minItems` suppression, static grids — no carousel). The superseded placeholder modules (partner logos, featured properties, network metrics) were removed.
- Become a Partner: optional “Inquiry topic” (preselected by `?interest=integration_request`, also `sandbox`, `technical-integration`, `future`) and conditional “Requested system” field; routing unchanged; hidden conditional fields are not sent.

**Data & tooling**
- `data/network-stats.json`, `integrations.json`, `partners-ecosystem.json`, `featured-connections.json`, `featured-properties.json` — shipped empty (no real records exist yet). `data/connection-methods.json` badge family. `fixtures/` synthetic data + test logos. `_private/` for internal notes. `tools/compute_network_stats.py` (canonical-id deduplication, source exclusion).
- Homepage “Partner Ecosystem” (`partners.json`) now lists partner *types* (localized) instead of invented sample company names.

**Badge gallery**: connection-method badges (light/dark, contrast), combination rules (valid/invalid pairings), labels by language; Bakuun-specific examples appear only with naming approval.

**i18n**: 147 new keys in en/ja/ko/zh-TW/ar (draft translations, native review pending).

**Tests**: `check_site.py` launch-gate markup rules; new `test_publish.py` (12 tests); new `launch_gates.js` (181 browser checks across production, preview and source). Docs: README “Launch gates”, `LAUNCH_CHECKLIST.md`, publication checklist.

## 2026-10-13 (c) — Asia-first positioning, status badges, future capabilities, design system
**Positioning & copy** (from KABUK_EXCHANGE_COMPLETE_COPY_RECOMMENDATIONS.md)
- Homepage: hero “Direct Connections in Asia. Broader Inventory Worldwide.”, CTAs Become a Partner / Explore Our Network; new “Local Depth in Asia. Global Breadth Through Connectivity.” section; Why KBKx pillars (Regional Supply Focus · Broader Inventory Connectivity · Unified Distribution Workflows · Room to Expand); “Building Beyond Accommodation.” roadmap section; Powered-by-Platform section rewritten; SEO title/description and JSON-LD updated.
- Network diagram: two visually distinct supply streams (solid = Direct Asian Accommodation Supply: hotels, ryokan, hotel groups; dashed = Connected Global Inventory: wholesalers, bedbanks, supplier OTAs) → KabuK Exchange → distribution; KabuK Platform foundation below; OTAs labelled by role on both sides. Partners diagram split the same way.
- Hotels, Partners (incl. new “More Ways to Access the Network.” section and connectivity copy), About and Platform pages updated; header/footer copy and SEO titles per the copy doc.
- New `/whats-next/` page (in Network menu, footer and sitemap): future directions with scope chips, explicit flight exclusion, access models, disclaimer, CTA.
- Become a Partner form: optional “Which future capability are you interested in?” field (localized labels, English values); `?interest=future#future-interest` deep link focuses it.

**Status badge system**
- `data/statuses.json` (12 statuses, 5 languages), `data/product-roadmap.json` (mapping + owner approval + review gate), renderer in `script.js` with approval guards; all previous ad-hoc “Planned/Roadmap” badges converted.
- Hidden reference gallery `/internal/status-badges/` (noindex/nofollow, unlinked, not in sitemap) with live contrast checks — all 12 statuses pass WCAG AA on light and navy surfaces.

**Design system (hybrid, from the “KabuK Exchange” Design System artifact)**
- Tokens: KabuK Blue identity, Deep Blue actions/links/focus, Ink/Warm White neutrals, semantic success/warning/critical/info; Inter (self-hosted) + Noto Sans JP; type scale display 48 · h1 36 · h2 28; radii 4–12px, 6px buttons (no pills); borders over shadows; 120/200ms motion; KabuK Bar on section eyebrows; flat navy bands (no decorative gradients). Exchange navy kept for dark bands/diagram stage; red limited to the logo and the dual-role marker.

**Tests & docs**
- `tests/check_site.py` (stdlib) and `tests/browser_smoke.js` (Playwright). `PUBLICATION_CHECKLIST.md`, README (design system, status badges, testing), positioning/copy docs and translation review list updated.
- Verified: static checks 0 errors; browser smoke 300 page loads (20 pages × 5 languages × 3 widths) with 0 console errors, failed requests, overflow or broken images; review-gate and approval-guard tests pass.

## 2026-10-13 (b) — Page-specific network diagrams
- Diagram engine generalized: declarative `data-eco-node` direction (in/out/both/none),
  `data-eco-style` (rail/found/tree), `data-eco-to` targets, automatic horizontal/vertical
  connectors, per-diagram breakpoint (`data-eco-min`). `build.py` injects named partials
  (`<!-- eco:start NAME -->`).
- New compositions: Hotels fan-out (`eco-hotels`), Demand fan-in (`eco-demand`),
  Connectivity two-way integration on `/partners/#connectivity-partners` (`eco-connectivity`,
  labelled Planned), About product-family stack (`eco-stack`), Platform foundation-first stack
  (`eco-platform`). Homepage keeps the full network.
- About hero now pairs copy with the product-family diagram (redundant logo lockup removed).
- 39 new strings translated into ja, ko, zh-TW, ar (draft).
- Re-verified: 270 page loads (18 pages × 5 languages × 3 widths), 0 errors/overflow;
  reduced motion = static wires, no pulses, on every diagram.

## 2026-10-13 — Visual refinement & product-separation pass

### Architecture (unchanged by design)
Static HTML/CSS/vanilla JS + JSON config. No framework, no new dependencies. `build.py`
remains the only (optional) tool; it now also injects the ecosystem partial and regenerates
`i18n-bundle.js`. Clean folder URLs and `/` homepage preserved; all 18 pages kept.

### Signature ecosystem visual (new, reusable)
- `partials/ecosystem.html` + `.eco` styles + `setupEco()` in `script.js`.
- SUPPLY → KABUK EXCHANGE → DISTRIBUTION, with **KabuK Platform as a foundation slab below**
  the hub, connectivity partners (PMS · Channel Managers · CRS) as a dashed integration rail,
  OTAs deliberately on both sides with a "can play both roles" marker.
- Animated SVG connectors that draw in, staggered node entry, traveling pulses; hover
  highlights a node's connector; animation pauses off-screen.
- Mobile: stacked chip layout with CSS pulse lines. Reduced motion: static connectors, no
  pulses. No JS: readable HTML lists with CSS chevrons. RTL: mirrors automatically.
- Used on: homepage (full), `/hotels/` (compact, supply focus), `/partners/` (compact, demand focus).

### Homepage (`index.html`)
New structure: light hero (editorial headline + CTAs + hotel "Link Your Property" path) flowing
into the network stage → Find Your Place in the Network (3 segments + hotel strip) → Why KBKx
(sticky intro + 4 numbered pillars) → How KBKx Works (4-step journey) → Powered by KabuK
Platform → Partner ecosystem directory (`partners.json`, labelled illustrative) → CTA.
Removed the old radial hero diagram and the second `kx-*` diagram (replaced by the reusable
component). Fixed duplicate `#ecosystem` id. New SEO title/description and JSON-LD
(KabuK Style Inc. as organization, KabuK Exchange as brand).

### Design system (`styles.css`, rewritten)
- One token set: colors sampled from the official logo (navy `#1E3376`, red `#C01717`) +
  KabuK blue `#38C3E2`; 4px spacing scale; radius/shadow/motion tokens.
- Light, translucent sticky header so the navy logo is legible (previously near-invisible on
  navy); logo sits on a white plate in the footer and a white hub card in the diagram — never
  recoloured. Web-sized logo copies `-480.png` / `-960.png` (resampled only) via `srcset`.
- One mobile-nav breakpoint (1100px) replacing three contradictory ones; animated
  hamburger; full-width mobile panel.
- Consistent buttons (navy primary on light, KabuK-blue primary on navy), cards, eyebrows,
  check lists, steps, forms (48px fields, focus rings, selected states), footer.
- Interior heroes unified to the light hero treatment; navy sections kept for rhythm.
- `prefers-reduced-motion` respected globally; `.reveal` content no longer hidden without JS.

### Navigation & behavior (`partials/header.html`, `script.js`)
- Nav: Solutions · Network · Why KBKx · About Us + Partner Login + Become a Partner.
  Solutions menu includes a "Link Your Property" prompt.
- Dropdowns use the disclosure pattern (removed `role="menu"` that lacked arrow-key support);
  Escape/outside click/tab-out close; mobile Escape closes the panel.
- Hash links no longer mis-marked `aria-current` (e.g. "Why KBKx" on the homepage).
- Header gains a border/shadow once scrolled. Current year auto-filled.
- Removed dead theme-switcher code (it recoloured the brand and was not called).

### Positioning & copy
- Applied `KABUK_EXCHANGE_COPY_RECOMMENDATIONS.md` to homepage, hotels, partners, about and
  forms. KBKx now leads with network/distribution value; Platform shown as the foundation.
- `/platform/*` pages retained but reframed ("Distribution Powered by KabuK Platform") with a
  separation notice; "KBKx Platform"/"Developer Platform" wording removed.
- New `PRODUCT_POSITIONING.md` (authoritative). Supersede notices added to
  `WEBSITE_ARCHITECTURE_FREEZE.md` and relevant `website-copy/` files; `CANONICAL_ENGLISH_COPY.md`
  and `website-copy/01-homepage.md` rewritten; README updated.
- KabuK Platform link is config-driven (`kabukPlatformUrl`): while it is a placeholder, links
  render as non-clickable "Learn more soon".

### Forms
- Titles/intros per copy recommendations; new required **Partner type** selector
  (Supply / Demand / Connectivity / Other) on Become a Partner.
- Submit label is honest: **Prepare Email** in `mailto` mode (with an explanatory note),
  **Send Inquiry** only in `api` mode. Status messages localized.
- Routing (`leadRouting`, `data-route`), honeypot, consent and API mode unchanged.
  Honeypot repositioned so it no longer causes horizontal scroll in RTL.

### Localization
- `i18n-bundle.js` (which overrides the JSON files at runtime) had drifted and was showing
  old copy; it is now generated from `i18n/*.json`. JSON files normalized to flat keys
  (nested still accepted). Form pages now load the bundle (they were English-only).
- ~180 new/changed keys translated into ja, ko, zh-TW, ar; 78 pre-existing Arabic gaps filled.
  All strings are draft — see `TRANSLATION_REVIEW.md`.

### Favicons
Official supplied icons added (`favicon-16x16.png`, `favicon-32x32.png`, `favicon.ico`) on all
pages; off-brand `favicon.svg` removed.

### Verification
Served over HTTP; 18 pages × 5 languages × 375/768/1440 = 270 loads with 0 console errors,
0 failed requests, 0 horizontal overflow, 0 broken images; Arabic `dir="rtl"` confirmed;
internal links/anchors/srcsets and all JSON validated; keyboard dropdown, reduced motion,
no-JS rendering and mailto form payload tested.

## Unverified assumptions & placeholders
- `kabukPlatformUrl`, `adminConsoleUrl`, `leadRouting` emails, `apiEndpoint`, canonical domain
  and sitemap domain are still PLACEHOLDER values from the original build.
- `partners.json` entries are sample data (labelled "illustrative" on the page).
- Capability statements retained from the previous build on interior pages (e.g. booking/search
  APIs, settlement coordination, Japan-focused supply, developer API families) were not
  re-verified against actual product maturity; roadmap badges were kept as-is.
- No apple-touch-icon: only 16/32px favicon sources were supplied.
- `404.html` uses relative asset paths (pre-existing); on hosts that serve it at deep paths,
  set the host's 404 to the root or use root-absolute paths.
