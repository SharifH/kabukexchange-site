# Publication-approval checklist

Nothing below is approved yet. Each row must be signed off by the named owner
before public launch. Record approvals in the files indicated.

## 0. October 2026 messaging update — REQUIRES BUSINESS APPROVAL

Copy from `KabuK_Exchange_Website_Copy_Updated.md` is implemented. The items below are claims the codebase cannot verify; each needs a named approver before publication.

| # | Claim (where) | What to confirm | Approver | ☐ |
|---|---|---|---|---|
| 1 | "Connect to directly contracted hotels across Asia" · "Our growing network of directly contracted hotels across Asia" (home hero, Why, For Distributors) | Direct hotel contracts in Asia are live and bookable at publication | Commercial | ☐ |
| 2 | "Direct hotel rates without traditional wholesale markups on eligible direct-contract inventory" (For Distributors) | Pricing practice for direct-contract inventory; definition of "eligible" | Commercial / Legal | ☐ |
| 3 | "Your Brand. Your Relationships." — distributor brand visibility, hotel relationships, exclusive rates for eligible bookings at participating hotels (home, For Distributors) | Operational support for brand visibility; which hotels participate | Commercial / Ops | ☐ |
| 4 | **Transparent Commercial Terms** — exact approved sentence (home, For Distributors) | Wording is verbatim from the copy file; added fine print "Specific commercial terms are agreed individually with each partner." and the eligibility footnote under the benefit lists — approve or remove | Commercial / Legal | ☐ |
| 5 | "Technology Connectivity: Supplier APIs, channel managers, and other supported connectivity methods" (home) and "established travel technology connections" (home) | **Conflicts with the roadmap**: channel-manager and PMS connectivity are mapped as *Planned* in `data/product-roadmap.json`. The Our Network page shows the Planned badge next to Channel Managers; the homepage line does not. Approve as-is, reword, or update the roadmap status | Product | ☑ Resolved 2026-10-17: owner set channel-manager connectivity to **Live** (some direct, some via a technology partner); PMS connectivity stays Planned |
| 6 | "Global accommodation inventory through integrated third-party sources / global supply integrations" | At least one third-party supplier integration is live | Product / Supply | ☐ |
| 7 | For Hotels: "reach participating travel agencies, OTAs, membership platforms, and travel businesses" | Participating distribution partners exist at launch | Commercial | ☐ |
| 8 | Connectivity page capabilities (content & mapping, search & availability, pricing & commercial rules, booking & reservations incl. cancellation workflows, billing/settlement/reconciliation, monitoring) | Each capability is available today, or mark it with a status badge | Product | ☐ |
| 9 | Footer "KabuK Exchange · A KabuK Style Inc. company." (was "a product of KabuK Style Inc.") | Correct legal/brand relationship wording | Legal | ☐ |
| 10 | Removed from For Hotels: "access to KabuK internal channels such as HafH" (unverified, English-only) | Re-add only if approved and translated | Commercial | ☐ |
| 11 | New hidden statistics *Connected Supply Sources* and *Connected Channel Managers* (definitions in `data/network-stats.json`) | Definitions and data source; they stay hidden until approved and `networkStats` is enabled | Data / Product | ☐ |
| 12 | Draft translations of all new copy (ja, ko, zh-TW, ar) incl. the mandatory commercial sentence | Native-speaker review — see `TRANSLATION_REVIEW.md` | Localization | ☐ |

No "success-based pricing", "success fee", "pay only for successful bookings" or free-cancellation promise exists in any page or language; `tests/check_site.py` now fails if one appears, and checks the commercial sentence is verbatim.

## 1. Roadmap and integration statuses (`data/product-roadmap.json`)

Set `approved: true`, `approvedBy`, `approvedOn` per item once confirmed. While
`reviewGate.showUnapprovedStatuses` is `true` (current setting), the suggested
statuses below are **visible on the public site**. Set it to `false` to hide every
unapproved badge at once. The site refuses to render `live`,
`available-to-partners` or `coming-soon` for any unapproved item.

| Product id | Shown as | Where | Source | Owner approval |
|---|---|---|---|---|
| `white-label` | Planned | Home, What’s Next, Partners | Owner review | ☑ Sharif Hadidi, 2026-10-17 |
| `agency-portal` | Planned | Home, What’s Next, Partners | Owner review | ☑ Sharif Hadidi, 2026-10-17 |
| `activities` | Pilot | Home, What’s Next | Owner review | ☑ Sharif Hadidi, 2026-10-17 |
| `ground-transportation` | Coming Soon (flights excluded) | Home, What’s Next | Owner review | ☑ Sharif Hadidi, 2026-10-17 |
| `property-system-connectivity` | Planned | Hotels, Partners diagram, About | Owner review | ☑ Sharif Hadidi, 2026-10-17 |
| `pms-connectivity` | Planned | Partners | Owner review | ☑ Sharif Hadidi, 2026-10-17 |
| `channel-manager-connectivity` | Live | Partners, Our Network | Owner review | ☑ Sharif Hadidi, 2026-10-17 |
| `ai-assisted-operations` | Planned | Partners | Owner review | ☑ Sharif Hadidi, 2026-10-17 |

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
- ☐ Confirm form routing addresses in `site-config.json` (`leadRouting`): all three routes and the footer Contact link now go to hello@kabukexchange.com — confirm the mailbox exists and is monitored, or split partner/hotel routes later.
- ☐ Forms use `mailto:` — the button says “Prepare Email” and the site never claims server-side delivery. For production, connect an API/CRM (`formMode: "api"`, `apiEndpoint`) with server-side validation, consent logging and spam protection (the honeypot is client-side only).
- ☐ Analytics: none is wired; `loadAnalytics()` only runs after cookie consent. Any provider added must respect that gate.
- ☐ Google Fonts (Noto Sans JP) is requested from fonts.googleapis.com; confirm this is acceptable under the privacy policy, or self-host it.

## 5. Hosting

- ☐ GitHub Pages: Source = GitHub Actions; custom domain `www.kabukexchange.com`; domain verified (TXT); Squarespace DNS records per README; **Enforce HTTPS** ticked; `curl -sI http://…` returns a redirect to HTTPS.
- ☐ Decide whether HSTS / anti-framing headers are required. Plain GitHub Pages cannot send them; if required, add a header-capable CDN in front (moves DNS from Squarespace).
- ☐ Before adding analytics, chat widgets, a CRM endpoint or embeds, add their origins to `site-config.json → security` or the Content-Security-Policy will block them.
- ☐ Deploy the **`dist/`** folder from `python3 build.py --production`, never the repository root (the root contains the gated pages’ source files, fixtures and tooling).
- ☐ `dist-preview/` only on an authenticated staging host.
- ☐ `/internal/status-badges/` is `noindex,nofollow`, unlinked and not in the sitemap — **this is not access control**. Protect `/internal/` with authentication at the host if it must be private.
- ☐ `siteUrl` is `https://www.kabukexchange.com` (the build rewrites canonical/OG/sitemap/robots and writes CNAME). Still set `kabukPlatformUrl` (example.com placeholder). `adminConsoleUrl` (Partner Login) is https://backoffice.kabukplatform.com.
