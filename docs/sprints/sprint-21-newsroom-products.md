# Sprint 21 — Newsroom products `EDITORIAL + BUILD`

SESSION HEADER — Eye Today
Next.js 16 (App Router, TypeScript, Tailwind v4) news portal covering ibogaine and the psychedelic community, on
Supabase (Postgres/Auth/Storage), deployed on Railway. Repo: GWLeith234/eye-today. Publisher: EvolveX360.
Branch: `sprint-21-newsroom-products`, cut from `main` at `d4505d8` (0001–0024 applied; this sprint adds **0025**).

**Origin:** George reviewed Psychedelic Alpha's weekly newsletter (2026-10-11) and decided six takeaways. Four are
built here; the editor's note is editorial (the newsletter intro field and the Opinion column already exist); events
as a revenue line is held until April 2027.

## Decisions (George, 2026-10-11)

| # | Takeaway | Decision | Type |
|---|---|---|---|
| 1 | Editor's note at the top of every newsletter, also a weekly column on the site | Yes — Jeff owns it | Editorial, no build |
| 2 | Curated "Ibogaine in the news" link feed — other outlets' coverage, dated, source-credited | Yes — sweep and give credit | Build |
| 3 | Trackers as named products: Legal Map + Trials & Funding Tracker | Yes | Build |
| 4 | Numbered flagship: edition "Issue No. 1", newsletter "Week N" | Do it | Build (small) |
| 5 | Audience-segmented sales pages on /advertise and /support | Yes | Build (content + layout) |
| 6 | Events as a revenue line (one-day Ibogaine Treatment Forum) | Hold 6 months | Deferred |

## Pre-flight findings (Claude, against `main` d4505d8)

- `country_legal_status` has `as_of` and `sources` but **no status category** — 0025 adds `legal_category`
  (unregulated / permitted / decriminalised / prohibited / unclear). "Last reviewed" on the Legal Map is `as_of`.
- No public function lists published legal pages; 0025 adds `legal_map_public()`.
- `editions` and `newsletter_issues` have no `issue_number`; 0025 adds both, assigned by trigger under an advisory
  lock, with editions backfilled by `issue_month` (2026-10 = No. 1).
- `editions_public()` and `edition_by_slug()` must be dropped and recreated to return `issue_number`.
- New top-level routes must be added to `RESERVED_SECTION_SLUGS`, the sitemap `STATIC_PAGES`, the smoke `PAGES` list
  and the ads `RESERVED` set in `src/lib/ads/placements.ts` (they serve as page type `other`).
- No OpenGraph/fetch helper exists; the link-preview action follows `geocodeListing` (editor-only, 8 s timeout,
  rate-limited, https only). Remote images are not fetched (CSP img-src), so the feed is text-only.
- Newsletter block follows the Sprint 18 `include_edition` shape exactly: column, loader, template prop, builder toggle.

## Build scope

1. **Migration 0025_newsroom_products** — `news_links`, `tracker_entries` (with seed), `legal_category`,
   `legal_map_public()`, `news_links_public()`, `tracker_public()`, `issue_number` on editions and
   newsletter_issues (+ triggers, backfill), `newsletter_issues.include_news`, editions functions recreated.
   SQL test `supabase/tests/0025_newsroom_products.sql`.
2. **News feed** — Admin → News feed (paste URL → "Fetch details" prefills title/source → blurb ≤ 280 chars in our
   words → publish). Public `/news-feed` (dated list, outlet credited with ↗, "via" line, paginated), a 5-item
   "Ibogaine in the news" block on the cover, and "This week in the news" in the newsletter (`include_news`).
3. **Legal Map** — `/legal-map`: published countries grouped by category, each with "Last reviewed" and source
   count, linking to the existing `/directory/[country]` page. Category select in the legal editor.
4. **Trials & Funding Tracker** — Admin → Tracker CRUD; public `/tracker` with kind filter (trial / funding /
   regulatory); each row links to our story when `article_id` is set. Seeded with the seven entries from the brief.
5. **Numbering** — "Issue No. N" on the editions archive, reader, cover, PDF and admin list; newsletter subject
   and header "Eye Today · Week N" (weekly list) or "No. N" (other lists).
6. **Segmented sales pages** — `/advertise` and `/support` open with four audience panels: Clinics & practitioners,
   Families & patients, Researchers & funders, Policy & press.
7. **Tests** — unit (labels, link-preview parsing, blurb limit), SQL (0025), e2e flow (feed + tracker + legal map +
   Issue No. on the edition). Lint, typecheck, unit tests green locally; build proven in CI.

## Not in scope
Events revenue (held). Paid analysis tier (revisit with the supporter tier). Sweep writing directly to the feed
(a later "suggested" status). Remote OpenGraph images.

## Definition of done
`/news-feed` live with ≥10 credited items (content loaded after merge); cover and newsletter blocks render;
`/legal-map` and `/tracker` live with the seed; "Issue No. 1" shows on the October edition; `/advertise` and
`/support` segmented; e2e for the feed and trackers; migration via guarded script.

## Rollback
`git revert` the merge commit. If 0025 was applied, write a new migration that undoes it — never edit the applied one.
