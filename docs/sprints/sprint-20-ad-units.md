# Sprint 20 — Ad units `REVENUE`

**Goal:** Every public page carries the right ad units, empty slots show house ads so the inventory is visible, an advertiser can target page types and see what they bought, and `/advertise` shows what is for sale.

**Definition of done:** Open the home, a section, an article, the directory, an event and the editions archive → each shows its units; with no campaign live, every unit shows a house ad; a premium (featured) listing appears as a labelled sponsored card on section and article pages; Admin → Ads reports impressions and clicks by slot × page type with a CSV; `/advertise` shows sizes, placements and "contact us".

**Won't change:** No programmatic or network ads (LegitScript gating makes network fill low-value in this category). No self-serve checkout yet. Supporters still never see big boxes.

## Pre-flight (Claude, 2026-10-10): GO WITH CHANGES

Checked against `main` at `f780ad9` (0001–0021 in production, so 0022 is next). Sprint 8 (0010) already provides slots, campaigns, creatives with weights, approval, frequency caps, a cookie-less serve route, impression/click logging with a salted IP hash and a per-minute cap, and a campaign report. This sprint is inventory, targeting and sales surface, not a new engine.

| # | Severity | Area | Finding | Decision |
|---|---|---|---|---|
| 1 | blocker | Inventory | Units render on two page types only (home, article). Directory, events, jobs, sections, editions carry nothing. | Add units per page type through one declarative map (`src/lib/ads/placements.ts`) so placement is data, not scattered JSX. |
| 2 | high | Phones | The 728×90 leaderboard is useless at 390px; nothing serves on mobile above the fold. | New slot `mobile-banner` 320×50, fixed to the bottom of the viewport on small screens, dismissable, hidden on `sm:` and up. |
| 3 | high | Directory revenue | The unit a clinic actually buys is a promoted listing, not a banner. Sprint 13 already sells this: `listing_features` via Stripe, pinned top-3 with a Featured badge, dormant because the Stripe prices are unset. | Premium listing = the existing featured tier at **$240/year** (George, 2026-10-10); free listings stay free. The sponsored-listing unit is what premium buys: `serve_sponsored_listing()` rotates one active featured listing into a labelled photo-first card on every directory, section and article page (not only the directory list, where it is already pinned). No creative, no new slot row: it is sold through Account → Listings, not Admin → Ads. George creates the Stripe annual price and sets `STRIPE_PRICE_FEATURED_ANNUAL`; the monthly price stays unset so only the annual plan is offered. |
| 4 | high | House ads | Empty slots are invisible, so the inventory can't be seen or sold. | `ad_campaigns.is_house`. `serve_ad` prefers any paid servable creative; a house creative serves only when no paid one is servable for that slot and page. House impressions are counted but excluded from the per-reader frequency cap. Seed four HTML house creatives on brand. |
| 5 | high | Targeting | Campaigns can't be sold per page type. | `ad_creatives.page_types text[]` (`home`, `section`, `article`, `directory`, `events`, `jobs`, `editions`, `other`); empty = all. The serve route takes `page` alongside `slot`; `ad_events.page_type` records it. |
| 6 | medium | Reporting | Daily totals only. | `ad_campaign_breakdown(campaign)` by slot × page type with CTR; CSV export route (editor-only, `no-store`). |
| 7 | medium | Sales | `/advertise` is a paragraph. | Rate card page: units with sizes and placements, what a buyer gets (first-party counts, labelled, no tracking), "contact us" (no prices yet, George's call), form to `advertise@theeye.today` via the existing contact pattern. |
| 8 | low | Caching | Pages stay static; ads fetch client-side. | Unchanged. `page` is a query param like `slot`; no cookies read on the page. |

## Migrations
`0022_ad_units.sql`: `mobile-banner` slot, `is_house`, `page_types`, `ad_events.page_type`, `serve_ad(slot_key, page_type)`, `serve_sponsored_listing()`, `record_ad_event(..., page_type)`, `ad_campaign_breakdown`, house campaign + six creatives seeded for the `eyetoday` site.

## Env vars
None new.
