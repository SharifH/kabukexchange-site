# Product positioning decision (authoritative — October 2026)

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
