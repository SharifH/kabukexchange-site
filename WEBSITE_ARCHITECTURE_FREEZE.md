# KBKx Website Architecture Freeze

> **⚠️ Superseded in part (October 2026).** Product positioning is now defined in
> `PRODUCT_POSITIONING.md`: KabuK Exchange is the distribution **network**; KabuK Platform is
> a separate technology-foundation product. Primary navigation is now **Solutions · Network ·
> Why KBKx · About Us** with **Partner Login** and **Become a Partner**. The `/platform/*` and
> `/developers/*` routes are retained (not deleted) but reframed as network capabilities
> powered by KabuK Platform; "Developer Platform" wording became "Developer Resources".
> Where this document conflicts with `PRODUCT_POSITIONING.md`, the latter wins.


**Version:** 1.0  
**Status:** Approved for launch implementation  
**Date:** 2026-07-16

## 1. Site purpose

The KabuK Exchange website is the enterprise evaluation and partner-acquisition site for the KBKx platform. It must help business, technical, operational, and commercial stakeholders understand the infrastructure, identify the correct partner journey, assess credibility, and begin a qualified conversation.

The KabuK Style corporate website remains the source for leadership, corporate history, investor information, company-wide careers, corporate press, and other group brands.

## 2. Naming standard

- **Official platform name:** KabuK Exchange
- **Official abbreviation:** KBKx
- **First substantive reference on a page:** KabuK Exchange (KBKx)
- **Subsequent references:** KBKx
- **Technical surfaces:** KBKx Developer Platform, KBKx APIs, KBKx documentation
- **Corporate owner:** KabuK Style Inc.
- **Intelligence layer:** KAOS — KabuK Assisted Operations System

## 3. Primary navigation

### Platform
- Overview — `/platform/`
- How It Works — `/platform/how-it-works/`
- Architecture — `/platform/architecture/`
- Security & Reliability — `/platform/security/`
- AI & Automation — `/platform/intelligence/`

### Partner Solutions
- Supply Partners — `/hotels/`
- Connectivity Partners — `/partners/#connectivity-partners`
- Distribution Partners — `/partners/#distribution-partners`

### Developers
- Developer Platform — `/developers/`
- Integration Guides — `/developers/guides/`
- API Overview / Reference Gateway — `/developers/api/`

### Resources
- Resource Center — `/resources/`
- FAQs — `/resources/#faqs`
- Release Notes — `/resources/#release-notes`
- System Status — feature-flagged external destination

### Company
- About KabuK Exchange — `/about/`
- Contact — `/become-a-partner/`
- KabuK Style corporate site — external
- Careers — external corporate destination

### Persistent actions
- Primary CTA: **Become a Partner** — `/become-a-partner/`
- Utility action: **Partner Login** — configured in `site-config.json`

## 4. Launch sitemap

| Page | URL | Primary question answered | Primary conversion |
|---|---|---|---|
| Homepage | `/` | What is KabuK Exchange and why does it matter? | Choose a partner journey |
| Platform Overview | `/platform/` | What does the platform provide? | Explore platform / contact |
| How It Works | `/platform/how-it-works/` | How do inventory, pricing, reservations, operations, and financial flows work? | Technical or commercial discussion |
| Architecture | `/platform/architecture/` | Is the platform designed as credible enterprise infrastructure? | Technical evaluation |
| Security & Reliability | `/platform/security/` | Can we trust the platform with critical operations? | Security review / contact |
| AI & Automation | `/platform/intelligence/` | How will KAOS assist operations without obscuring accountability? | Discuss roadmap / use cases |
| Supply Partners | `/hotels/` | How does this help a hotel, branch, regional team, or property group? | Link property / discuss distribution |
| Partner Solutions | `/partners/` | How does this help connectivity and distribution partners? | Become a partner |
| Developer Platform | `/developers/` | Is integration practical and well supported? | Read guides |
| Integration Guides | `/developers/guides/` | What implementation process should our team expect? | Start technical engagement |
| API Gateway Page | `/developers/api/` | What API families exist and how is detailed access provided? | Request documentation / sandbox |
| Resources | `/resources/` | Where can I learn more and evaluate KBKx? | Read / contact |
| About | `/about/` | Why was KabuK Exchange created and what principles guide it? | Learn about KabuK Style / contact |
| Become a Partner | `/become-a-partner/` | How do I begin a commercial or technical conversation? | Submit inquiry |
| Link Your Property | `/link-your-property/` | How does an individual property express interest? | Submit property inquiry |
| Privacy | `/privacy/` | How is personal information handled? | — |
| Terms | `/terms/` | What terms govern site use? | — |

## 5. Homepage section order

1. Hero: category, promise, primary CTA
2. Travel ecosystem: supply, connectivity, distribution, travelers
3. Operational complexity: why shared infrastructure matters
4. KabuK Exchange introduction
5. Business outcomes
6. Platform capability families
7. Partner journey cards
8. Enterprise trust and reliability
9. KAOS preview, controlled by feature flag
10. Final CTA
11. Hidden future proof modules

The homepage remains general. Detailed persona and KPI messaging belongs on the audience pages.

## 6. Audience-page rule

Every partner page must follow this hierarchy:

1. Buyer business objective
2. Operational challenge
3. Desired outcome
4. How KBKx helps
5. Relevant platform capabilities
6. Implementation and support model
7. Trust signals
8. Audience-specific CTA

### Supply-partner emphasis
The Supply Partners page must explicitly serve:

- Individual hotels and properties
- Regional directors of sales
- Regional revenue and distribution managers
- Area general managers
- Property groups and corporate distribution teams

The copy must not imply that only corporate headquarters can engage with KBKx.

## 7. Developer destination rules

- **How It Works** is a cross-functional business and technical explanation.
- **Developer Platform** is the technical evaluation landing page.
- **Integration Guides** explain onboarding, environments, certification, events, and operating patterns.
- **API Reference** is the endpoint-level documentation destination. At launch, `/developers/api/` is a gateway page; later it may redirect to an external documentation portal.
- All developer URLs must be edited only in `site-config.json` under `developerLinks`.

Recommended future documentation domain:

- `https://developers.kabukexchange.com/` — guides and developer home
- `https://developers.kabukexchange.com/api/` — endpoint reference
- `https://developers.kabukexchange.com/sandbox/` — sandbox access
- `https://developers.kabukexchange.com/changelog/` — change history

## 8. CTA system

### Global
- Become a Partner
- Explore the Platform
- Talk to Sales

### Supply
- Link Your Property
- Discuss Distribution

### Connectivity / distribution
- Discuss an Integration
- Explore a Partnership

### Developers
- Read Integration Guides
- Explore the API
- Request Sandbox Access
- Contact Integration Support

Avoid generic CTAs such as “Learn More” when a specific destination can be named.

## 9. Footer structure

### Platform
- Overview
- How It Works
- Architecture
- Security & Reliability
- AI & Automation

### Partner Solutions
- Supply Partners
- Connectivity Partners
- Distribution Partners

### Developers & Resources
- Developer Platform
- Integration Guides
- API Overview
- Resources
- System Status when enabled

### Company
- About KabuK Exchange
- Contact
- KabuK Style Inc.
- Careers at KabuK Style

### Legal
- Privacy
- Terms
- Cookie settings when implemented

Leadership biographies, investor relations, group history, and company-wide recruiting content do not belong on the KBKx platform site.

## 10. Hidden future modules

All future modules remain in the codebase but hidden through `site-config.json`. They must not be made visible until approved content and evidence exist.

| Flag | Module | Activation condition |
|---|---|---|
| `partnerLogos` | Partner logo wall | Written partner approval and credible set of logos |
| `featuredProperties` | Featured property carousel | Rights-cleared images and active properties |
| `hotelPhotography` | Hotel photography carousel | Rights-cleared editorial-quality assets |
| `successStories` | Partner case studies | Approved measurable outcomes |
| `networkMetrics` | Live or verified network metrics | Auditable production numbers |
| `publicApiDocs` | Public endpoint reference | Documentation approved for public access |
| `knowledgeCenter` | Educational content hub | Minimum viable content library |
| `events` | Events and conferences | Active event calendar |
| `statusPage` | Public status destination | Production monitoring and incident process ready |
| `certifications` | Trust center / certifications | Certifications or formal security statements approved |
| `kaos` | KAOS platform preview | Keep enabled only if wording clearly distinguishes roadmap from generally available capability |

## 11. Explicit exclusions at launch

- Leadership gallery or executive biographies
- Unapproved customer or partner logos
- Unverified scale or uptime claims
- Stock hotel photography presented as partner properties
- Public detailed API reference before commercial and security approval
- Roadmap commitments expressed as guaranteed delivery
- Separate KAOS brand treatment that competes with KabuK Exchange

## 12. Architecture freeze rule

Implementation may refine copy, spacing, accessibility, responsive behavior, and component styling. It must not change the sitemap, navigation groups, URL roles, page purposes, CTA hierarchy, or corporate/platform separation without an explicit architecture decision.
