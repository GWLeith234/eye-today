# Sprint 20 — Ad units `REVENUE`

**Goal:** Every public page carries ad units; empty units show house ads so the inventory is visible; a clinic can buy a run-of-site campaign, upload its own creative and set its own length, and see what it got; a premium listing is sold the same way. Keep it simple.

**Products (George, 2026-10-10):**
- **Free listing** — unchanged.
- **Premium listing — $240 / year.** The existing featured tier (Sprint 13, Stripe). Pinned top-3 in the directory with a badge, and rotated as a labelled sponsored card on section and article pages.
- **Run-of-site ad — $250 / month.** The advertiser's creatives rotate at random across every unit on every page type, sharing rotation with every other paid campaign. They upload their own creative and pick how many months. No targeting, no exclusivity; anything bigger is "contact us".

**Definition of done:** Home, a section, an article, the directory, an event and the editions archive each show ad units; with no paid campaign live, every unit shows a house ad; a clinic signs in → Advertise → names the campaign, sets months, uploads a creative per size, pays → the campaign is pending → an editor approves → it serves across the site → the clinic sees impressions and clicks in its account. `/advertise` shows the two products and prices.

**Won't change:** No programmatic/network ads. No page-type targeting (random placement is the product). Supporters still never see big boxes.

## Pre-flight (Claude, 2026-10-10): GO WITH CHANGES

Checked against `main` at `f780ad9` (0001–0021 in production, so 0022 is next). Sprint 8 (0010) already provides: slots, campaigns, creatives with weights and editor approval, frequency caps, a cookie-less serve route, impression/click logging with a salted IP hash and a per-minute cap, a campaign report. Sprint 13 provides the premium listing via Stripe subscription. Sprint 16 provides a one-time Stripe Checkout for a fixed term (`apply_posting_payment`) that transplants directly to "N months of ads".

| # | Severity | Area | Finding | Decision |
|---|---|---|---|---|
| 1 | blocker | Inventory | Units render on home and article pages only. | `src/lib/ads/placements.ts` maps page type → units; every public list and detail page carries leaderboard + big box; lists get an in-river unit after the 4th item. |
| 2 | high | Phones | 728×90 is useless at 390px. | New slot `mobile-banner` 320×50, fixed bottom on small screens, dismissable, hidden ≥ `sm`. |
| 3 | high | House ads | Empty units are invisible. | `ad_campaigns.is_house`. `serve_ad` picks a paid creative when one exists for the slot, else a house one. House impressions count but skip the reader frequency cap. Six HTML house creatives seeded. |
| 4 | high | Self-serve | No way for an advertiser to buy. | `ad_campaigns.owner_id`, `months`, `stripe_session_id`, `paid_at`. Account → Advertise: create campaign (advertiser, name, click URL, months 1–12, start date) → upload creatives into the `media` bucket (one per unit size; dimensions checked against the slot by the existing sniffer) → Stripe Checkout at `STRIPE_PRICE_ROS_MONTHLY × months` → webhook runs `apply_ad_payment` (idempotent on session id) which sets `paid_at`, `starts_at`, `ends_at = starts + months` and status `pending`. Editors approve creatives in Admin → Ads as today; approval flips the campaign `active`. Owner RLS: an advertiser reads and edits only their own campaigns and creatives, and only while unpaid or pending. |
| 5 | high | Rotation | "Run of site, random placement". | `serve_ad` ignores page type; weighted random across all paid creatives for the slot, equal weight by default. `ad_events.page_type` is still recorded so the report can show where impressions landed. |
| 6 | medium | Premium listing | Dormant because the Stripe price is unset. | Annual-only: `featuredOffered` accepts the annual price alone; the monthly option disappears from Account → Listings. `serve_sponsored_listing()` rotates one active premium listing into a labelled photo-first card on section and article pages. |
| 7 | medium | Reporting | Daily totals only. | `ad_campaign_breakdown(campaign)` by slot × page type with CTR, in Admin → Ads and in the advertiser's account; CSV export (`no-store`). |
| 8 | medium | Sales page | `/advertise` is a paragraph. | Rate card: the two products with prices, unit sizes with a spec table, what you get (first-party counts, labelled, no tracking, editor review under the ad policy), "Start a campaign" → sign in → Account → Advertise; "contact us" for anything else at `advertise@theeye.today`. |
| 9 | low | Caching | Pages stay static; ads fetch client-side. | Unchanged. |

## Migrations
`0022_ad_units.sql`: `mobile-banner` slot; `is_house`, `owner_id`, `months`, `stripe_session_id`, `paid_at` on campaigns; `ad_events.page_type`; owner RLS; `serve_ad(slot_key, page_type)`, `serve_sponsored_listing()`, `record_ad_event(..., page_type)`, `apply_ad_payment`, `ad_campaign_breakdown`; house campaign + six creatives seeded for `eyetoday`.

## Env vars
`STRIPE_PRICE_ROS_MONTHLY` (one-time price, $250, quantity = months). `STRIPE_PRICE_FEATURED_ANNUAL` ($240/yr subscription) already exists in `.env.example`. Both are no-ops when unset: the buy buttons say "coming soon".

## Build order
1. Migration + SQL test + guarded script. 2. Placements, mobile banner, house ads, serve/event routes with page type (tonight: inventory visible for the demo). 3. Account → Advertise: campaign form, creative uploader, checkout, webhook. 4. Admin approval flips campaign active; breakdown report + CSV in both admin and account. 5. `/advertise` rate card; premium annual-only. 6. E2E: house ads on every page type; advertiser journey with Stripe mock → approve → serve → report.
