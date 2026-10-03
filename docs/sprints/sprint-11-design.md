# Sprint 11 — Design system and Pique-style cover

Eye Today should look like a magazine: a bold masthead, an image-led cover, coloured sections and polished article pages, on a token system so the brand can change in one file.

Branch: `sprint-11-design`.

## Will work when done

- Brand tokens in `src/app/globals.css` `@theme`: paper `#FAF8F3`, ink `#14201B`, brand green `#1E5B4A`, accent amber `#D98E2B`, rule `#E3DED3`, muted `#5B625E`, and one colour per section.
- Section colours: News `#1E5B4A`, Research & Science `#2F6FA3`, Policy & Law `#6B4C9A`, Treatment & Clinics `#A9472F`, Stories `#976912`, Opinion `#3F3F46`.
- Stories was proposed as `#9A6B12`. That is 4.41:1 on paper, short of WCAG AA for small text, so the token is `#976912` (4.55:1). Amber stays `#D98E2B` and is only a button fill with ink text (6.27:1). It is not used as text on paper (2.52:1).
- Type: Fraunces (headlines), Source Serif 4 (article body), Inter (UI), self-hosted with `next/font/google`. CSS variables `--font-display`, `--font-serif`, `--font-sans`. No runtime font requests.
- SVG wordmark with a circular iris in `src/components/public/wordmark.tsx`, accessible name "Eye Today". The same iris is the favicon, the Apple icon and the share card.
- Masthead: today's date in `America/Vancouver` (Pique's region), wordmark, desktop section nav with section colours, mobile slide-out (focus-trapped, Escape closes), Search, Newsletter, Support (amber button, ink label) and Sign in. Sticky compact header. The header stays a server fetch; scroll and the menu are a client island that does not read cookies.
- Cover: full-width lead, four secondary image cards, The Latest with thumbnails, leaderboard and big-box slots, a coloured rail per section, an Opinion rail with author photos, numbered Most Read, a newsletter band, and a three-column footer ("Published by EvolveX360").
- Section, tag and author fronts: coloured header band, lead plus card grid, pagination kept.
- Article page: wider hero with credit, byline with author photo, styled disclosure and disclaimer, related-story row, inline newsletter. JSON-LD and the medical disclaimer stay.
- Stories without a photo get a section-coloured tile with the iris.
- `sections.color` and `sections.icon` are nullable, seeded, and editable in `/admin/sections`. Public pages use the stored colour when it is a hex value, otherwise the token. An editor colour that fails AA for small text on paper is drawn in ink.

## Won't change

No new data features beyond section colour, icon, and the author photo already stored on profiles. CMS screens get the new tokens and the two fields, not a redesign.

## Definition of done

The cover, a section front and an article page match this design on mobile and desktop. Lighthouse mobile performance is at least 85 and accessibility at least 95 on all three. Images reserve their space. The old placeholder palette is gone.

## Pre-flight (applied)

Verdict: **GO WITH CHANGES**.

| # | Severity | Area | Issue | Fix applied |
| --- | --- | --- | --- | --- |
| 1 | high | Contrast | Amber and Stories `#9A6B12` fail AA as small text on paper | Darken Stories to `#976912`. Amber is a fill with ink text. Links use brand green. |
| 2 | high | Header | Sticky state and a focus trap need a client component; the header must not read cookies | `Masthead` is the client island. Sections and the date are server props. |
| 3 | high | Schema | A migration `UPDATE` runs before seed inserts the site, so a fresh reset would stay uncoloured | `0012` updates existing rows. `seed.sql` sets colour and icon too. |
| 4 | high | Photos | Cards and bylines do not include `avatar_url` | New migration replaces `article_public_bylines` and adds `section_author_faces`. One query, not one per card. |
| 5 | low | Migration number | `0012` is free. `0001`–`0011` stay untouched | `0012_section_brand.sql` plus a rollback test. |

## Rollback

Revert the merge commit. If `0012` was applied, add a new migration that drops the columns and restores the previous byline function. Do not edit `0012`.
