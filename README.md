# KabuK Exchange — Marketing Website

A static marketing website for **KabuK Exchange (KBKx)**, the B2B travel distribution network by **KabuK Style Inc.**, powered by **KabuK Platform** (a separate technology-foundation product — see [`PRODUCT_POSITIONING.md`](PRODUCT_POSITIONING.md)). It explains the network, who it serves, and gives hotels and partners a way to get in touch.

Built with **plain HTML, CSS, and vanilla JavaScript** plus a couple of **JSON config files**. No framework, no build step, no npm.

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
| `partners.json` | Editable ecosystem directory shown on the homepage |
| `site-config.json` | Editable settings: login URL, form emails, footer/company links |
| `favicon.ico`, `favicon-16x16.png`, `favicon-32x32.png` | Official KabuK Exchange browser-tab icons (supplied artwork) |
| `og-image.png` / `og-image.svg` | Social share image (1200×630) + its editable source |
| `robots.txt` / `sitemap.xml` | Search-engine hints (PLACEHOLDER domain) |
| `partials/header.html`, `partials/footer.html` | Single source of truth for the shared header & footer |
| `partials/ecosystem.html` | Markup for the signature Supply → KabuK Exchange → Distribution visual (synced between `<!-- eco:start -->` / `<!-- eco:end -->` markers) |
| `i18n-bundle.js` | **Generated** by `build.py` from `i18n/*.json` — the runtime copy of all translations. Do not edit by hand. |
| `build.py` | Syncs partials into every page, relativizes paths, regenerates `i18n-bundle.js` (see below) |

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

### Partner / hotel / connection cards (ecosystem section)

Edit **`partners.json`**.

- `categories` — the filter buttons. Each has an `id` and a `label`. Keep `all` first.
- `entries` — one object per card:
  ```json
  {
    "name": "Sample City Hotels KK",
    "category": "hotel-group",     // must match a category id above
    "region": "Japan",
    "description": "Short description shown on the card.",
    "tag": "Supply"                 // small pill label
  }
  ```
Add, remove, or reorder entries freely. The homepage rebuilds the directory and filters automatically.

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

The site uses a deliberate **native system-font stack** (see `--font` in `styles.css`)
with CJK and Arabic fallbacks — no web font is downloaded, so there are zero external
requests and text paints instantly. To adopt a brand web font later, self-host the
files (to keep the project asset-free) and prepend the family to `--font`.

## Brand colors

The site uses one fixed brand system (the old user-selectable color themes were removed — they recoloured the brand). Tokens live at the top of `styles.css`: KabuK blue `--kabuk-blue #38C3E2` (parent-brand connective cue), Exchange navy `--exchange-navy #1E3376` and Exchange red `--exchange-red #C01717` (both sampled from the official logo). The header and hero are light so the navy logo is always legible; navy sections are used for rhythm.

## Lead forms: honest submit labels

In `formMode: "mailto"` the submit button reads **Prepare Email** and the note explains that the visitor's email app will open; in `"api"` mode (with `apiEndpoint`) it reads **Send Inquiry**. This is set at runtime from `site-config.json`.

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
| Homepage `#network` | `partials/ecosystem.html` | Full network: Supply → KabuK Exchange → Distribution, connectivity rail, KabuK Platform foundation, OTAs on both sides |
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

All hosts below serve static files. There is no build command — but **run
`python3 build.py` before you commit/deploy** so the shared header/footer are synced
and paths are compiled to portable relative URLs (see "Portable paths" below).

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
