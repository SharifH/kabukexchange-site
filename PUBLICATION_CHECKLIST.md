# Publication-approval checklist

Nothing below is approved yet. Each row must be signed off by the named owner
before public launch. Record approvals in the files indicated.

## 1. Roadmap and integration statuses (`data/product-roadmap.json`)

Set `approved: true`, `approvedBy`, `approvedOn` per item once confirmed. While
`reviewGate.showUnapprovedStatuses` is `true` (current setting), the suggested
statuses below are **visible on the public site**. Set it to `false` to hide every
unapproved badge at once. The site refuses to render `live`,
`available-to-partners` or `coming-soon` for any unapproved item.

| Product id | Shown as | Where | Source | Owner approval |
|---|---|---|---|---|
| `white-label` | Planned | Home, What’s Next, Partners | Copy recommendations (suggested) | ☐ |
| `agency-portal` | Planned | Home, What’s Next, Partners | Copy recommendations (suggested) | ☐ |
| `activities` | Planned | Home, What’s Next | Copy recommendations (suggested) | ☐ |
| `ground-transportation` | Exploring (flights excluded) | Home, What’s Next | Copy recommendations (suggested) | ☐ |
| `property-system-connectivity` | Planned | Hotels, Partners diagram, About | Carried over from previous build | ☐ |
| `pms-connectivity` | Planned | Partners | Carried over from previous build | ☐ |
| `channel-manager-connectivity` | Planned | Partners | Carried over from previous build | ☐ |
| `ai-assisted-operations` | Planned (was “Roadmap”) | Partners | Carried over from previous build | ☐ |

Rules: use **Exploring** or no badge when approval is uncertain; never use
Coming Soon as a synonym for Planned; no dates next to Planned/Exploring.

## 2. Positioning and integration claims

- ☐ Commercial team confirms the direct (Asia) vs. connected (global, third-party) inventory wording.
- ☐ Confirm whether API distribution is live for partners today; the site currently says scope/availability are “confirmed with each partner during onboarding” and shows no status badge for it.
- ☐ Confirm retained interior-page capability statements (booking/search APIs, settlement coordination, developer API families, KAOS) against current maturity.
- ☐ Homepage “Partner Ecosystem” now shows partner *types* only (`partners.json`) — confirm wording. Named partners belong to the launch-gated `/partners/ecosystem/` (see `LAUNCH_CHECKLIST.md`).
- ☐ Network statistics, coverage map, connectivity directory, partner ecosystem and homepage showcases are **off** (`featureFlags`). Each needs its `LAUNCH_CHECKLIST.md` section signed off before it is enabled.
- ☐ Bakuun: `disclosure.bakuunNameApproved` stays `false` until written authorization to name Bakuun publicly exists.
- ☐ No partner counts, countries, logos, testimonials, certifications or launch dates are published (checked in this build — keep it that way).

## 3. Copy and translations

- ☐ Native-speaker review of ja, ko, zh-TW and ar (all non-English strings are draft/machine-assisted). See `TRANSLATION_REVIEW.md`.
- ☐ Native review of status labels in `data/statuses.json`.
- ☐ Form `<option>` *values* remain English on purpose (email payload); labels are localized.

## 4. Privacy, forms and analytics

- ☐ Legal review of `/privacy/` and `/terms/` (placeholders).
- ☐ Confirm form routing addresses in `site-config.json` (`leadRouting`, still example.com).
- ☐ Forms use `mailto:` — the button says “Prepare Email” and the site never claims server-side delivery. For production, connect an API/CRM (`formMode: "api"`, `apiEndpoint`) with server-side validation, consent logging and spam protection (the honeypot is client-side only).
- ☐ Analytics: none is wired; `loadAnalytics()` only runs after cookie consent. Any provider added must respect that gate.
- ☐ Google Fonts (Noto Sans JP) is requested from fonts.googleapis.com; confirm this is acceptable under the privacy policy, or self-host it.

## 5. Hosting

- ☐ Deploy the **`dist/`** folder from `python3 build.py --production`, never the repository root (the root contains the gated pages’ source files, fixtures and tooling).
- ☐ `dist-preview/` only on an authenticated staging host.
- ☐ `/internal/status-badges/` is `noindex,nofollow`, unlinked and not in the sitemap — **this is not access control**. Protect `/internal/` with authentication at the host if it must be private.
- ☐ Replace placeholder domains (canonical uses kabukexchange.com; sitemap/robots use www.kbkx.example.com) and set `kabukPlatformUrl`, `adminConsoleUrl`.
