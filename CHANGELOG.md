# Changelog

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
