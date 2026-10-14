# KabuK Exchange — Marketing Website

A static marketing website for **KabuK Exchange (KBKx)**, the Asia-first accommodation distribution network by **KabuK Style Inc.** (direct accommodation relationships across Asia, complemented by connected global inventory), powered by **KabuK Platform** (a separate technology-foundation product — see [`PRODUCT_POSITIONING.md`](PRODUCT_POSITIONING.md)). It explains the network, who it serves, and gives hotels and partners a way to get in touch.

Built with **plain HTML, CSS, and vanilla JavaScript** plus a couple of **JSON config files**. No framework, no npm. One small Python script (`build.py`, standard library only) assembles pages and produces the deployable `dist/` folder — see **[Launch gates](#launch-gates--activating-the-network-features)**.

> ⚠️ **Internal review build.** URLs, emails, and partner data marked `PLACEHOLDER` are examples. Replace them before any public launch. This site is *inspired by* enterprise travel-tech sites for tone and structure only — it contains no copied text, assets, code, or branding from any third party.

---

## Contents

| File | Purpose |
|------|---------|
| `index.html` | Homepage → served at `/` |
| `hotels/index.html` | For Hotels → `/hotels/` |
| `partners/index.html` | For Partners → `/partners/` (anchored: `#demand-partners`, `#connectivity-partners`, `#supply-partners`) |
| `platform/index.html` | Platform → `/platform/` (anchored sections for each capability) |
| `about/index.html` | About Us → `/about/` |
| `become-a-partner/index.html` | Lead form for OTAs, agencies, wholesalers, suppliers, tech partners → `/become-a-partner/` |
| `link-your-property/index.html` | Lead form for hotels and hotel groups → `/link-your-property/` |
| `privacy/index.html` / `terms/index.html` | Placeholder legal pages → `/privacy/`, `/terms/` |
| `404.html` | Styled not-found page |
| `styles.css` | All styling and animations |
| `script.js` | Behavior: config loading, i18n, nav, animations, ecosystem filter, forms |
| `i18n/` | Copy for each language as separate JSON files + `languages.json` manifest (see `i18n/README.md`) |
| `partners.json` | Homepage “Partner Ecosystem” section: the *types* of businesses the network serves (no organization names) |
| `site-config.json` | Editable settings: login URL, form emails, footer/company links |
| `favicon.ico`, `favicon-16x16.png`, `favicon-32x32.png` | Official KabuK Exchange browser-tab icons (supplied artwork) |
| `og-image.png` / `og-image.svg` | Social share image (1200×630) + its editable source |
| `robots.txt` / `sitemap.xml` | Search-engine hints (PLACEHOLDER domain) |
| `partials/header.html`, `partials/footer.html` | Single source of truth for the shared header & footer |
| `whats-next/index.html` | Future directions (roadmap with status badges) → `/whats-next/` |
| `data/statuses.json`, `data/product-roadmap.json` | Status badge catalog and product-to-status mapping (see “Status badges”) |
| `internal/status-badges/` | Hidden design-system reference for badges (noindex, unlinked) |
| `tests/` | `check_site.py` (static checks), `test_publish.py` (publish-step unit tests), `browser_smoke.js` and `launch_gates.js` (Playwright) |
| `partials/ecosystem.html` | Markup for the signature Supply → KabuK Exchange → Distribution visual (synced between `<!-- eco:start -->` / `<!-- eco:end -->` markers) |
| `i18n-bundle.js` | **Generated** by `build.py` from `i18n/*.json` — the runtime copy of all translations. Do not edit by hand. |
| `build.py` | Syncs partials into every page, relativizes paths, regenerates `i18n-bundle.js`; `--production` / `--preview` export the site (see “Launch gates”) |
| `publish.py` | The launch-gated export used by `build.py --production` / `--preview` (publication rules, route/data exclusion, leak guards) |
| `network/`, `network/connectivity/`, `partners/ecosystem/` | **Launch-gated** pages: network statistics + coverage map, connectivity directory, partner ecosystem. Not in `dist/` until enabled |
| `data/network-stats.json`, `data/integrations.json`, `data/partners-ecosystem.json`, `data/featured-connections.json`, `data/featured-properties.json` | Launch-gated data (ship **empty** — no real records yet) |
| `data/connection-methods.json` | Connection-method badge family (Direct Integration · Via Bakuun · Via Technology Partner) |
| `fixtures/` | **Synthetic** test data + test logos for preview builds only (never deployed) |
| `_private/` | Internal notes (owners, escalation, contract notes) — never deployed |
| `tools/compute_network_stats.py` | Computes the four deduplicated network metrics from a canonical property export |
| `LAUNCH_CHECKLIST.md` | Per-feature verification, permissions, enable and rollback procedure |

---

## Clean URLs (no `.html`)

Each page lives in its own folder as `index.html`, so it's served at a clean path with
no file extension:

| Folder | URL |
|--------|-----|
| `index.html` | `/` |
| `hotels/index.html` | `/hotels/` |
| `about/index.html` | `/about/` |
| … | … |

This works on any static host (and the local server below) with no configuration.

### Portable paths (works at a domain root OR a subpath)

You **author** links and assets with easy root-absolute paths (`/styles.css`,
`/hotels/`). When you run `python3 build.py`, it **compiles them to relative paths
correct for each page's depth** (e.g. `styles.css` at the root, `../styles.css` one
folder deep). `script.js` similarly resolves its data files (`site-config.json`,
`partners.json`, `i18n/…`) and any config-driven links from **its own URL**.

The result: the site runs unchanged whether it's served from a **domain root**
(`https://kbkx.com/`) or a **subpath** (`https://<user>.github.io/<repo>/`) — no base-path
config needed. (This is why you must run `build.py` before deploying, and why you should
serve the site rather than open files via `file://`.)

If you want to drop the trailing slash too (`/hotels` instead of `/hotels/`),
Netlify/Vercel/Cloudflare each have a "pretty URLs / trailing slash" toggle.

To **add a page**: create `your-page/index.html` (copy an existing page as a starting
point), link to it as `/your-page/`, and run `python3 build.py` (it drops in the shared
header/footer and fixes the paths). Add it to `sitemap.xml` and, if it should appear in
the footer, to `site-config.json`.

## Run it locally

> **⚠️ Do not open the `.html` files by double-clicking them (`file://`).** The pages
> reference `/styles.css`, `/script.js`, and fetch the JSON config/translations using
> **root-absolute paths**, and use clean folder URLs (`/hotels/`, `/platform/`). These
> only resolve when the site is served over HTTP with **this folder (`kbkx-site`) as the
> web root**. Opened as a file, the page will appear **unstyled** and data won't load.

**Easiest (macOS):** double-click **`serve.command`** in this folder. It serves from the
correct root and opens your browser at <http://localhost:8080/>.

**Or run one of these from *inside* this `kbkx-site` folder** (the current directory
must be this folder, so `/styles.css` maps to `kbkx-site/styles.css`):

```bash
# Python 3 (pre-installed on macOS/Linux)
python3 -m http.server 8080

# Node.js
npx serve .

# PHP
php -S localhost:8080
```

Then open <http://localhost:8080/>.

If the page loads but is **unstyled**, the server's root is wrong — you're serving a
parent directory. `cd` into `kbkx-site` first (so `http://localhost:8080/styles.css`
returns the CSS, not a 404), or just use `serve.command`.

> If you open a page directly as `file://`, the layout still renders, but the footer link lists, the Partner Login URL, and the ecosystem directory will be empty because the JSON files can't be fetched.

---

## How to edit content (no coding required)

### Partner types (homepage ecosystem section)

Edit **`partners.json`**. It describes the *types* of businesses the network serves — no organization names (named, approved partners belong in the launch-gated `data/partners-ecosystem.json`).

- `categories` — the filter buttons (`id`, English `label`, `i18n` key). Keep `all` first.
- `entries` — one card each:
  ```json
  { "i18n": "hp.eco.t1", "name": "Independent Hotels & Ryokan", "category": "supply",
    "tag": "Direct supply", "tagI18n": "hp.eco.tag.direct",
    "description": "Properties across Asia exploring direct distribution relationships." }
  ```
  `name` / `description` are the English fallback; translations live in `i18n/*.json` under `<i18n>.t` / `<i18n>.d`.

### Footer links

Edit **`site-config.json`**:

- `footerLinks` — the **KabuK Exchange** column (internal pages).
- `companyLinks` — the **KabuK Style Inc.** column (KabuK Style, HafH, News, Contact, Careers).

Each link is `{ "label": "...", "href": "..." }`. Links starting with `http` open in a new tab automatically.

**Footer icon variant (A/B):** the KabuK Style Inc. column can render as icon buttons
instead of text links. Set `"footerCompanyStyle": "icons"` (default is `"text"`) in
`site-config.json`. Each `companyLinks` entry takes an optional `"icon"` key
(`building`, `bed`, `newspaper`, `mail`, `briefcase`, or any key in `ICON_PATHS`);
the label is used as the accessible tooltip/aria-label.

### Partner Login URL (admin console)

Edit **`site-config.json`** → `adminConsoleUrl`. Every "Partner Login" button on every page points there.

### Form email targets

Edit **`site-config.json`** → `leadRouting`:

```json
"leadRouting": {
  "partnerEmail": "partnerships@kbkx.example.com",  // Become a Partner form
  "hotelEmail":   "supply@kbkx.example.com",        // Link Your Property form
  "generalEmail": "hello@kbkx.example.com"          // fallback
}
```

No JavaScript editing needed. Each form declares which mailbox it uses via a `data-route` attribute (`partnerEmail` / `hotelEmail`) that maps to these keys.

### Switching forms from email to an API later

Edit **`site-config.json`**:

```json
"formMode": "api",
"apiEndpoint": "https://api.kbkx.example.com/v1/leads"
```

- `"mailto"` (default) — the form opens the user's email client with the details pre-filled.
- `"api"` — the form POSTs JSON (`{ form, fields }`) to `apiEndpoint` instead.

The form-handling code already supports both paths, so this is a config-only change.

---

## Header navigation

Defined in `partials/header.html` (run `python3 build.py` after editing):

- **Solutions** (dropdown: Supply / Demand / Connectivity Partners, plus a "Link Your Property" prompt for hotels)
- **Network** (dropdown: The KBKx Network `/#network`, How KBKx Works `/#how-it-works`, Partner Ecosystem `/#ecosystem`, Integration `/developers/`)
- **Why KBKx** (`/#why-kbkx`) and **About Us** (`/about/`)
- Right side: **Partner Login** (→ `adminConsoleUrl`) and **Become a Partner**; language selector.

Dropdowns follow the **disclosure** pattern (`initDropdowns` in `script.js`): a `<button aria-expanded>` toggles the panel on click/Enter/Space, hover opens on desktop pointers, `Escape` closes and returns focus, tabbing out or clicking outside closes. Below 1100px everything collapses into one mobile panel. Hash links (e.g. `/#why-kbkx`) are never marked `aria-current`.

## Editing the shared header & footer

The header and footer are identical on every page. Their single source of truth is
`partials/header.html` and `partials/footer.html`. After editing either partial, run:

```bash
python3 build.py
```

This copies the partials into every `*.html` page (idempotent, safe to re-run). The
site still ships as plain static HTML — `build.py` is the *only* optional tooling and
is **not** required to run or deploy the site; it just saves you editing the same
markup in nine files. The active nav link is highlighted at runtime by `script.js`
(`markActiveNav`), so the header markup can stay identical everywhere.

New top-level pages automatically pick up the shared header/footer the next time you
run `build.py`, as long as they contain a `<header class="site-header">…</header>` and
`<footer class="site-footer">…</footer>` block for it to replace.

## Fonts

Inter is self-hosted (`assets/fonts/`, SIL OFL). Noto Sans JP loads from Google Fonts per the design system; Korean, Traditional Chinese and Arabic use system fonts. Self-host Noto Sans JP too if third-party font requests must be avoided.

## Design system

Styling follows the **KabuK design system** (Design System artifact "KabuK Exchange"), applied as a hybrid for Exchange:

- **Colour:** KabuK Blue `#38C3E2` for identity (KabuK Bar, markers, flows — never text on white); Deep Blue `#176B87` for links, primary buttons and focus rings; Ink `#111827` text; Warm White `#FAFAF8` / white surfaces; borders over shadows. Exchange navy (from the logo) is kept for dark bands and the network stage; Exchange red appears only in the logo and the small “can play both roles” marker.
- **Type:** Inter (self-hosted variable font in `assets/fonts/`, OFL) + Noto Sans JP (Google Fonts). Weights 400/500/600. Scale: display 48/56 · h1 36/44 · h2 28/36 · h3 22/30.
- **Shape and motion:** radii 4/6/8/12px (buttons 6px — never pills; pills only for status chips and tags), 120/200ms motion, no bounce.
- **The KabuK Bar:** the 3px KabuK Blue rule before each section eyebrow — once per section.

Tokens live at the top of `styles.css`.

## Status badges

One catalog drives every maturity badge on the site.

| File | Purpose |
|---|---|
| `data/statuses.json` | 12 stable keys (`live`, `available-to-partners`, `pilot`, `beta`, `in-development`, `integration-in-progress`, `coming-soon`, `planned`, `exploring`, `temporarily-unavailable`, `deprecated`, `retired`) with tone, icon, definitions and labels in en/ja/ko/zh-TW/ar |
| `data/product-roadmap.json` | Product id → status, plus owner approval (`approved`, `approvedBy`, `approvedOn`) and the `reviewGate.showUnapprovedStatuses` switch |
| `/internal/status-badges/` | Unlinked, `noindex` reference gallery: light/dark examples, definitions, contrast results, card examples, current mapping, labels by language, do/don’t |

Markup: `<span class="status" data-product-status="agency-portal">Planned</span>` (or `data-status="beta"` for a fixed key). The text inside is the no-JS fallback; `renderStatuses()` in `script.js` renders the chip (shape marker + text, never colour alone) and re-renders on language change. Guards: unapproved items are hidden when the review gate is off, and `live` / `available-to-partners` / `coming-soon` are never rendered for unapproved items. **Approvals:** see `PUBLICATION_CHECKLIST.md`. An unlinked URL is not access control — protect `/internal/` at the host if needed.

## Launch gates — activating the network features

Six features are **built, tested and switched off**. They stay out of the public
site until you turn each one on, independently, in `site-config.json`:

```json
"featureFlags": {
  "networkStats": false,
  "networkCoverageMap": false,
  "connectivityDirectory": false,
  "partnerEcosystem": false,
  "homepageFeaturedConnections": false,
  "homepageFeaturedHotels": false
}
```

| Flag (internal label) | What it publishes | Data it reads | Route / location |
|---|---|---|---|
| `networkStats` — *Enable Network Statistics* | Four metrics with count-up: Directly Contracted Properties, Direct Supply Countries, Available Properties (deduplicated), Countries Covered | `data/network-stats.json` → `metrics` | `/network/` (page appears when this **or** the map is on) |
| `networkCoverageMap` — *Enable Coverage Map* | Asia-Pacific tile map + rest-of-world groups + accessible country lists, direct vs connected | `data/network-stats.json` → `coverage` | `/network/#coverage` |
| `connectivityDirectory` — *Publish Connectivity Directory* | Searchable directory: keyword search, category / status / connection / region filters, sort, URL state, “Request an Integration” | `data/integrations.json` | `/network/connectivity/` |
| `partnerEcosystem` — *Publish Partner Ecosystem* | Partner directory with search, category chips, A–Z, logo cards | `data/partners-ecosystem.json` | `/partners/ecosystem/` (replaces the homepage `#ecosystem` link in the nav) |
| `homepageFeaturedConnections` — *Show Featured Connections* | Homepage grid of verified, operational connections with status + method badges | `data/featured-connections.json` (+ `integrations.json`) | Homepage, before the ecosystem section |
| `homepageFeaturedHotels` — *Show Featured Properties* | Homepage grid of approved hotels / groups with relationship labels | `data/featured-properties.json` | Homepage, after the supply strategy |

Each flag also controls its **nav links, footer links, CTAs and sitemap entry**.
While a flag is off, nothing about that feature is published: no empty
sections, no “coming soon” blocks, no dead links, no data files.

### How it works (and why a publish step)

This is a static site, so a JSON flag read in the browser can hide a component
but **cannot stop a server from serving `/network/`** if the file is deployed.
So the flags are enforced when you build the deployable folder:

```bash
python3 build.py --production    # → dist/          deploy THIS folder
python3 build.py --preview       # → dist-preview/  staging / internal review only
```

`--production`:
- leaves disabled routes **out of `dist/`** (they 404 on any host), strips their nav/footer/CTA/sitemap entries (`<!-- gate:start FLAG -->…<!-- gate:end FLAG -->` blocks), and omits their data files;
- passes every record through the publication rules below and **drops non-public fields** (approval flags, verification flags, internal notes); copies only approved logos;
- never reads `fixtures/` or `_private/`, and never ships docs, tests or tooling;
- **fails** (and deletes `dist/`) if an enabled feature has nothing publishable, if figures are inconsistent (direct > total), if a fixture/test marker leaks, or if Bakuun is named without approval.

`--preview` turns every flag on, uses the **synthetic fixtures** (clearly named “Test …”, with a striped “Preview build” banner on every page), sets `noindex,nofollow` on every page and a `Disallow: /` robots.txt. **Never deploy `dist-preview/` to the production host** — put it behind authentication on a staging host.

There is **no query-string or URL override** in either build. In the un-built source tree the browser also honours the flags (gated elements are removed and gated pages show “Page not found” + `noindex`), but that is only a development convenience — **always deploy `dist/`**, never the repository root.

### Publication rules (enforced in `publish.py` and again in `script.js`)

| Data | Renders only when |
|---|---|
| Integration | `publicDisclosureApproved: true`, known `status` / `category` / `connectionMethod`, `lastVerified` set, `publishedAt` not in the future. `live`, `available-to-partners`, `pilot`, `beta` also need `verifiedEndToEnd: true` **and** `commerciallyEnabled: true` (KBKx-specific, not the provider’s status elsewhere). Logo only with `logoUseApproved`. |
| Bakuun route | Shows **“Via Bakuun”** only with `disclosure.bakuunNameApproved: true` in `site-config.json` **and** the record’s `connectionProviderDisclosureApproved: true`; otherwise **“Via Technology Partner”**, and production output never contains the name. |
| Partner | `publicDisclosureApproved: true` and `relationship` is `signed` or `integrated`. **`prospective` is never published.** Logo only with `logoUseApproved`. |
| Featured connection | item `featured` + `verifiedLive`, its integration is publishable **and** operational. Section removed below `minItems` (default 3). |
| Featured property | `featured`, `publicDisclosureApproved`, `relationshipVerified`; relationship labelled *Directly contracted* / *Available via a connected supplier* / *Verified relationship*; location only with `locationVerified`; image only with `logoUseApproved`. Removed below `minItems`. |
| Metric | file **and** metric `approvedForPublication`, positive integer `value`, `verifiedAt`, `source`. `null` hides the metric (never shown as 0 or “—”). |
| Coverage | `coverage.approvedForPublication`, `verifiedAt`, ISO-2 codes; a market is never both direct and connected. |

Status and connection method are **independent badge families** (`data/statuses.json`, `data/connection-methods.json`); see `/internal/status-badges/` for combination rules.

### Activating a feature — example

1. Complete that feature’s section of **`LAUNCH_CHECKLIST.md`** (verified data, written disclosure/logo permissions, translations, accessibility check, named approver).
2. Add the approved records, e.g. `data/integrations.json`:
   ```json
   { "id": "acme-cm", "displayName": "Acme Channel Manager", "category": "channel_manager",
     "connectionMethod": "direct", "status": "live", "regions": ["japan", "asia-pacific"],
     "featured": true, "logo": "assets/logos/acme-cm.svg", "logoUseApproved": true,
     "publicDisclosureApproved": true, "verifiedEndToEnd": true, "commerciallyEnabled": true,
     "lastVerified": "2026-11-02", "publishedAt": "2026-11-05" }
   ```
   (Internal notes go in `_private/integrations-internal.json`, keyed by `id`.)
3. Flip the flag: `"connectivityDirectory": true`.
4. Check it: `python3 build.py --preview` is fixtures-only, so review real data with `python3 build.py --production` and serve `dist/` locally (`python3 -m http.server 8080 -d dist`). Run the tests (below).
5. Deploy `dist/`.

**Network statistics:** generate values from a canonical property export, never by hand:
```bash
python3 tools/compute_network_stats.py export.csv --as-of 2026-11-30 \
  --source "Supply ops canonical export 2026-11-30" --out data/network-stats.json
```
Each property is counted once by `canonical_property_id`; inventory via Bakuun or a wholesaler never counts as directly contracted; `--exclude-source` removes sources that are not currently enabled. The output always has `approvedForPublication: false` — the owner sets it to `true` (and `approvedBy`) after review.

**Rollback:** set the flag back to `false`, rebuild with `--production`, redeploy. The route, links, sitemap entry and data disappear from `dist/` (purge the CDN cache if you use one).

### Hosting notes for launch gates

- Point the host at **`dist/`**, with `python3 build.py --production` as the build command (Netlify, Cloudflare Pages and Vercel images include Python 3), or upload `dist/` yourself.
- GitHub Pages: deploy with a GitHub Actions workflow that runs the build and uploads `dist/` (`actions/upload-pages-artifact` + `actions/deploy-pages`), or push `dist/` to a `gh-pages` branch. `dist/` is in `.gitignore`.
- Disabled routes are simply absent from `dist/`, so every host returns its normal 404 — no rewrite rules are needed. If a host has an older deploy cached, invalidate it after disabling a feature.
- The preview build must live on a separate, authenticated staging host (Netlify/Cloudflare/Vercel password protection or basic auth). `noindex` is not security.
- `/internal/status-badges/` is deployed but unlinked and `noindex` — not private. Protect `/internal/` at the host if it must be private.

## Testing

```bash
python3 build.py && python3 build.py --production && python3 build.py --preview
python3 tests/check_site.py      # stdlib: links, JSON, i18n sync, bundle freshness, status rules, gallery, launch-gate markup
python3 tests/test_publish.py    # stdlib: each flag alone, empty-feature refusal, sanitizing, leaks, Bakuun naming, dedup tool

# Browser tests (Node + Playwright):
python3 -m http.server 8091 &  python3 -m http.server 8093 -d dist &  python3 -m http.server 8092 -d dist-preview &
NODE_PATH=$(npm root -g) node tests/browser_smoke.js http://localhost:8091     # every page × 5 languages × 3 widths
NODE_PATH=$(npm root -g) node tests/browser_smoke.js http://localhost:8093     # same, against the production export
NODE_PATH=$(npm root -g) node tests/launch_gates.js http://localhost:8093 http://localhost:8092 http://localhost:8091
```
`launch_gates.js` checks that production has no gated routes, data, links, showcases or numbers (also with query strings), and exercises the preview components: search, filters (alone and combined), sorts, empty state, clear-all, URL state, keyboard use, missing logos, unapproved and prospective records, unknown and inconsistent metrics, deduplicated figures, reduced motion, RTL and overflow at 375/768/1440px. It also confirms the browser and `publish.py` apply identical publication rules.

## Cookie / analytics consent

A lightweight consent banner appears on first visit. Analytics only load **after** the
visitor clicks Accept; the choice is stored in `localStorage` (`kbkx-cookie-consent`).
There is no analytics provider wired in yet — drop your snippet inside the
`loadAnalytics()` function in `script.js` and it will run only with consent.

## Structured data

`index.html` and `about.html` include JSON-LD (`Organization` + `WebSite`) for richer
search results. Update the URLs there (and the PLACEHOLDER domain) before launch.

## Network diagrams (one engine, page-specific stories)

| Page | Partial | Story |
|---|---|---|
| Homepage `#network` | `whats-next/index.html` | Future directions (roadmap with status badges) → `/whats-next/` |
| `data/statuses.json`, `data/product-roadmap.json` | Status badge catalog and product-to-status mapping (see “Status badges”) |
| `internal/status-badges/` | Hidden design-system reference for badges (noindex, unlinked) |
| `tests/` | `check_site.py` (static checks), `test_publish.py` (publish-step unit tests), `browser_smoke.js` and `launch_gates.js` (Playwright) |
| `partials/ecosystem.html` | Full network: Supply → KabuK Exchange → Distribution, connectivity rail, KabuK Platform foundation, OTAs on both sides |
| `/hotels/` | `partials/eco-hotels.html` | Fan-out: *your property* → KBKx → the channels you approve (+ planned PMS/channel-manager rail) |
| `/partners/` hero | `partials/eco-demand.html` | Fan-in: many supply sources → KBKx → *your platform* |
| `/partners/#connectivity-partners` | `partials/eco-connectivity.html` | Two-way: PMS / channel managers / CRS ⇄ KBKx → channels (marked Planned) |
| `/about/` | `partials/eco-stack.html` | Product family: KabuK Style Inc. → KabuK Exchange (+ HafH), KabuK Platform beneath |
| `/platform/` | `partials/eco-platform.html` | Foundation-first: KabuK Exchange on KabuK Platform, with the network processes on the Platform slab |

- **Placement:** put `<div class="eco [eco--compact] [variant]" data-eco>` with `<!-- eco:start NAME -->` / `<!-- eco:end -->` inside (no name = homepage partial) and run `python3 build.py`.
- **Wiring is declarative** (`setupEco()` in `script.js`): each connected element sets `data-eco-node="in|out|both|none"` (flow direction relative to its target), optional `data-eco-style="rail|found|tree"`, and optional `data-eco-to="id"` (defaults to the `[data-eco-hub]` element). The engine measures the layout, picks horizontal or vertical connectors, fans wires along the hub edge, and adds traveling pulses. It redraws on resize and language change, works in RTL, and pauses off-screen.
- **Breakpoint:** three-column diagrams draw SVG wires from 901px (`data-eco-min` overrides; the stack diagrams use `0`). Below that they stack with CSS pulse lines.
- **Reduced motion:** static connectors, no pulses. **No JS:** plain HTML lists with CSS chevrons. All labels use `data-i18n` keys (`eco.*`, `ecoH.*`, `ecoD.*`, `ecoC.*`, `ecoS.*`, `ecoP.*`).

## Icons, forms, and social/SEO

- **Icons** — card icons are inline SVGs injected by `script.js` from the `ICON_PATHS` map. In the HTML a card just declares `<div class="card-icon" data-icon="globe"></div>`. To change an icon, edit the `data-icon` value; to add one, add a new entry to `ICON_PATHS`.
- **Spam protection** — both forms include a hidden honeypot field (`name="_hp"`). If it's filled (bots do this), the submission is silently dropped and the field is never included in the email. Field names starting with `_` are treated as internal and excluded from the payload.
- **Consent** — both forms have a required consent checkbox linking to `privacy.html`. Replace that placeholder page with a legally reviewed policy before collecting real data.
- **Social share & SEO** — every page sets the official favicon (`favicon-32x32.png`, `favicon-16x16.png`, `favicon.ico`), Open Graph / Twitter tags, and a canonical URL. The share image is `og-image.png` (1200×630). To regenerate it after editing `og-image.svg`, use any SVG→PNG tool, e.g. `rsvg-convert -w 1200 -h 630 og-image.svg -o og-image.png` or `cairosvg og-image.svg -o og-image.png -W 1200 -H 630`. **Update the PLACEHOLDER domain** (`www.kbkx.example.com`) in every page's canonical/OG tags, in `sitemap.xml`, and in `robots.txt` before launch.

## Localization

Supported languages: **English, Japanese, Korean, Traditional Chinese (Taiwan), Arabic**.

All copy lives in **separate JSON files, one per language, in the [`i18n/`](i18n/) folder** —
so content teams can edit each language independently without touching code. See
[`i18n/README.md`](i18n/README.md) for the full editor guide.

```
i18n/
  languages.json    ← the list of languages (edit to add/remove one)
  en.json           ← English (source of truth)
  ja.json ko.json zh-TW.json ar.json
  _template.json    ← copy this to start a new language
```

How it works:

- The language selector lives in the header on every page.
- The chosen language is saved in `localStorage` (`kbkx-lang`) and restored on the next visit. If none is saved, the browser language is matched where possible.
- `script.js` fetches `i18n/languages.json`, then the JSON for the active language (plus English as a fallback), and swaps text via `data-i18n` attributes:
  - `data-i18n="key"` → replaces text content
  - `data-i18n-placeholder="key"` → replaces an input placeholder
  - `data-i18n-aria-label="key"` → replaces an aria-label
- **Missing/blank keys fall back to English**, so a partially translated language never breaks the page — it just shows English for the gaps.
- **Arabic** switches the whole page to right-to-left via `dir="rtl"` on `<html>`; the CSS uses logical properties so the layout mirrors correctly.

### Editing copy

Open the relevant `i18n/<code>.json` file and change the **values** (never the keys), then
run `python3 build.py`, which regenerates `i18n-bundle.js` (the runtime copy every page
loads). Nested or flat JSON both work. See `TRANSLATION_REVIEW.md` for strings that still
need native-speaker review.

### Adding a language

1. Copy `i18n/_template.json` → `i18n/<code>.json` (e.g. `fr.json`).
2. Translate the values.
3. Add one line to `i18n/languages.json`: `{ "code": "fr", "label": "Français", "dir": "ltr" }`
   (use `"dir": "rtl"` for right-to-left languages).

That's the whole process — no code changes. Full details in [`i18n/README.md`](i18n/README.md).

### Coverage & quality

All `data-i18n` strings on the homepage, header, footer, ecosystem visual, hotels, partners,
about and both lead forms are translated in all five languages. Developer/platform subpages,
legal pages and form `<option>` values remain English (listed in `TRANSLATION_REVIEW.md`).
Non-English text is **draft quality** and must be reviewed by native speakers.

---

## Accessibility & performance notes

- Semantic HTML (`header`, `nav`, `main`, `section`, `footer`), skip link, visible focus styles, `aria-current` on the active nav item, `aria-live` on the ecosystem grid and form status.
- Animations respect `prefers-reduced-motion` — connection-line motion, hub pulses, and scroll reveals are disabled for users who ask for reduced motion.
- No external fonts, scripts, or assets — everything is local, so there are no third-party requests and the site works offline once served.

---

## Deploying

All hosts below serve static files. **Deploy the `dist/` folder produced by
`python3 build.py --production`** — not the repository root. That step syncs the
shared header/footer, compiles portable relative paths and applies the launch gates
(see “Launch gates”). The host-specific notes below predate the launch gates: where
they say “this folder”, use `dist/`; where they say “build command empty”, use
`python3 build.py --production` with output directory `dist`.

### GitHub Pages
Works out of the box, including **project sites served under a subpath**
(`https://<user>.github.io/<repo>/`).

1. Put the contents of this folder at the root of the branch/folder Pages serves
   (e.g. `main` → `/`, or the `/docs` folder). The included **`.nojekyll`** file tells
   Pages to serve every file as-is (so nothing under `i18n/`, including `_template.json`,
   gets stripped by Jekyll).
2. Run `python3 build.py` and commit before pushing.
3. Enable Pages in the repo settings.

Because all internal links/assets are **relative** and `script.js` resolves its data
files from its own URL, the site works whether Pages serves it at a subpath or (with a
custom domain / a `<user>.github.io` user-site repo) at the domain root — no config
needed. *(One caveat: the `canonical`/OG tags still use the PLACEHOLDER production domain;
update them to your real Pages/custom-domain URL for correct SEO.)*

### Netlify
- Drag-and-drop this folder onto <https://app.netlify.com/drop>, **or** connect the repo with:
  - **Build command:** *(leave empty)*
  - **Publish directory:** `.` (this folder)

### Vercel
- Import the repo. Framework preset: **Other**. Build command empty, output directory `.`
- Or run `npx vercel` from this folder and accept the defaults.

### Cloudflare Pages
- Create a Pages project from the repo.
  - **Build command:** *(empty)*
  - **Build output directory:** `/` (this folder)

### AWS S3 + CloudFront
```bash
aws s3 sync . s3://YOUR_BUCKET --delete
# Enable static website hosting on the bucket, index document = index.html
# Put CloudFront in front for HTTPS + caching, then invalidate on deploy:
aws cloudfront create-invalidation --distribution-id YOUR_DIST_ID --paths "/*"
```
Make sure `.json` files are served with `Content-Type: application/json` (S3 does this by extension automatically).

**Clean-URL note for S3/CloudFront:** the folder structure means requests like `/hotels/`
must resolve to `/hotels/index.html`. The S3 *website* endpoint does this automatically
(it appends `index.html` to any path ending in `/`). If you serve S3 through CloudFront via
the REST/OAC origin instead, add a small CloudFront Function (viewer-request) that appends
`index.html` to directory paths. Netlify, Vercel, and Cloudflare Pages handle this for you.

---

## Why this does **not** need React

- The site is **content-first and mostly static** — marketing copy, a few cards, two forms. There is no logged-in state, no client-side routing, no shared realtime data.
- Vanilla JS handles the only interactive bits (language switch, nav toggle, scroll reveals, ecosystem filter, form submission) in a small, dependency-free file.
- **Benefits:** near-instant load, no build pipeline to maintain, trivial hosting, and config files a non-engineer can edit directly. Fewer moving parts means fewer things to break.

## When it *would* make sense to move to React / Next.js later

Consider a framework once the site grows past a brochure:

- **Many pages sharing layout** — duplicating the header/footer across files becomes error-prone; components/partials fix that. (Today the shared markup is copied into each HTML file.)
- **A real CMS or dynamic content** — partner directories, blog/news, or localized content pulled from an API or headless CMS.
- **Authenticated or personalized areas** — a partner dashboard, gated content, account state.
- **SEO at scale with dynamic data** — Next.js gives server rendering / static generation per route.
- **A component library and design system** shared with the product app.

A reasonable migration path: keep this content, move shared header/footer into components, port `translations.js` to an i18n library (e.g. `next-intl`), and read `site-config.json` / `partners.json` at build time or from a CMS.

## Approved website architecture

The launch information architecture is frozen in [`WEBSITE_ARCHITECTURE_FREEZE.md`](WEBSITE_ARCHITECTURE_FREEZE.md). Future modules and activation stages are documented in [`WEBSITE_ROADMAP.md`](WEBSITE_ROADMAP.md). Structural changes should be reviewed against those documents before implementation.


## Canonical website copy

Production English copy and messaging notes are maintained in `website-copy/`.


## KabuK Exchange brand implementation

This build uses the official KabuK Exchange product logo at `assets/brand/kabuk-exchange-logo.png`. The visual system is fixed to the KabuK Exchange brand rather than exposing user-selectable color themes. KabuK Blue `#38C3E2` is retained as the parent/master brand connector, while Exchange navy and Exchange red are used as product-specific colors. Do not recolor or distort the supplied logo.
