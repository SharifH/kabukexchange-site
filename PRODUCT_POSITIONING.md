# Product positioning decision (authoritative — updated October 2026)

## Asia-first update (supersedes the earlier "network" wording where they differ)
- **KabuK Exchange is building an Asia-first accommodation distribution network**: priority on developing *direct* accommodation relationships across Asia (hotels, ryokan, hotel groups), complemented by **connected global inventory** sourced through integrated third-party suppliers (wholesalers, bedbanks, supplier OTAs).
- "Asia-first" describes the **supply strategy**, not a limit on distribution reach. Never imply global inventory is directly contracted.
- Do not say: "all inventory directly contracted", "the largest Asian network", "global direct inventory", "instant worldwide access", partner counts, countries, or launch dates.
- Message hierarchy: (1) direct Asia supply + connected global inventory → distribution partners; (2) access models — API where confirmed, future white-label and travel agency portal; (3) future categories — Activities & Experiences and non-flight Ground Transportation. **Flights are out of scope.**
- Future capabilities always carry a catalog status badge (`data/statuses.json` + `data/product-roadmap.json`) and the roadmap disclaimer. Statuses need owner approval — see `PUBLICATION_CHECKLIST.md`.
- White-label storefronts powered by Exchange supply are an Exchange offering; reusable white-label technology underneath belongs to KabuK Platform.


This decision **supersedes** any older wording in this repository (including
`WEBSITE_ARCHITECTURE_FREEZE.md`, `website-copy/`, and earlier i18n strings) that
describes KabuK Exchange as "the platform" or "infrastructure for the full
distribution lifecycle". Do not revert to that positioning.

| | Role | How the Exchange site talks about it |
|---|---|---|
| **KabuK Exchange (KBKx)** | B2B travel distribution **network** and commercial product connecting accommodation/travel supply to distribution partners. | Lead with distribution and network value. "KabuK Exchange (KBKx)" on first substantive mention, then "KBKx". |
| **KabuK Platform** | Separate product: the underlying **technology foundation** (pricing, booking, reservations, financial and operational services). Will have its own website. | Shown *beneath* KBKx as "Powered by KabuK Platform" — never as a peer node and never with its own feature sales narrative on this site. Link via `site-config.json → kabukPlatformUrl`; until a real URL is set, links render as a non-clickable "Learn more soon". |
| **KabuK Style Inc.** | Parent company. | "A product of KabuK Style Inc." / "by KabuK Style" (not "a KabuK Style company"). |

## Audience taxonomy
Supply Partners · Demand Partners · Connectivity Partners. OTAs and wholesalers can play
both supply and demand roles — the signature diagram shows OTAs on both sides on purpose.
Connectivity partners (PMS, channel managers, CRS) are **integration rails**, not
inventory sellers.

## Network processes
Content & mapping, availability, pricing, booking and settlement may be named as
processes coordinated by KBKx and **powered by KabuK Platform** — not as separately
sold Exchange software modules.

## Claim rules
No unverified partner counts, logos, testimonials, certifications, SLAs, geographic
reach ("global"), guaranteed rates/revenue, or "instant" onboarding. Roadmap items are
labelled Planned/Roadmap. Forms in `mailto` mode say "Prepare Email", not "Send".

## Visual rules
Official logo (`assets/brand/kabuk-exchange-logo.png`, web copies `-480/-960.png`) is
never recoloured or distorted; it always sits on a light surface (white header, white
plate in the footer, white hub card in the diagram). KabuK blue `#38C3E2` = parent-brand
connective cue; Exchange navy `#1E3376` and red `#C01717` are sampled from the logo. Red
is a small accent only.
