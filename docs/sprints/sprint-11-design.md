# Sprint 11 — Design system & Pique-style cover

**Goal:** Eye Today looks like a real magazine: a bold masthead, image-led cover, coloured sections and polished article pages, built on a token system so the brand can change in one file.

**Definition of done:** The cover, a section front and an article page match the new design on mobile and desktop; Lighthouse mobile performance ≥ 85 and accessibility ≥ 95 on all three; no layout shift from images; the old placeholder palette is gone.

Branch: `sprint-11-design` (built on `claude/exciting-planck-gvvnbs`). Reference layout: piquenewsmagazine.com. Match its information architecture and density, not its branding.

## Will work when done

- **Brand tokens** in `src/app/globals.css` `@theme`: paper `#FAF8F3`, ink `#14201B`, brand green `#1E5B4A`, accent amber `#D98E2B`, rule `#E3DED3`, muted `#5B625E`, plus one colour per section (News `#1E5B4A`, Research & Science `#2F6FA3`, Policy & Law `#6B4C9A`, Treatment & Clinics `#A9472F`, Stories `#966810` (darkened from the proposed `#9A6B12`, which was 4.4:1 on paper), Opinion `#3F3F46`). Every text/background pair passes WCAG AA; any that did not were darkened.
- **Type:** Fraunces (headlines), Source Serif 4 (article body), Inter (UI), self-hosted through `next/font/google`, so there are no runtime font requests.
- **Wordmark:** inline SVG "Eye Today" with a circular iris mark in `src/components/public/wordmark.tsx`, also used for the favicon and the OG image.
- **Masthead:** date strip, wordmark, horizontal section nav with section colours (desktop), slide-out menu (mobile), Search, Newsletter, Support (accent button), Sign in. Sticky compact header on scroll.
- **Cover:** full-width lead with large photo; 4 secondary image cards; "The Latest" river with thumbnails; leaderboard and big-box ads; one rail per section with a coloured label; Opinion rail with author headshots; numbered Most Read; newsletter band; redesigned footer.
- **Section fronts:** coloured header band, lead story + card grid, pagination.
- **Article page:** wider hero with credit, byline block with author photo, styled disclosure and disclaimer boxes, related row, inline newsletter promo.
- **Fallback art:** stories without a photo get a section-coloured tile with the iris mark.
- **Section colour and icon** stored on `sections` (new nullable `color`, `icon`) and editable in `/admin/sections`.

**Won't change:** no new data features beyond section colour/icon (and the two read-only author-photo fields below). CMS screens get the new tokens only.

## How it was built

- Migration `0012_section_design.sql`: `sections.color` (hex check), `sections.icon` (slug check), the six colours seeded, `article_public_bylines` and `author_public` return the author's `avatar_url`, and a new definer function `card_authors(slugs[])` gives the Opinion rail its headshots in one query.
- Tokens live only in `globals.css`. `src/lib/design/contrast.ts` computes WCAG ratios; a unit test reads the CSS and fails the build if any text/background pair drops below 4.5:1 (3:1 for large type). The admin section form uses the same function to refuse a colour that would fail on paper.
- Section colours reach components as a `--sec` CSS variable, so a card or band needs no per-section class.

## Verify

`npm run lint`, `npm run typecheck`, `npm test`, `npm run build`, `npx playwright test`. Apply `0012` and run `supabase/tests/0012_section_design.sql`. Lighthouse (mobile) on `/`, a section front and an article page.
