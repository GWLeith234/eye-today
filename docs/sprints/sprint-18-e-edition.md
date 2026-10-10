# Sprint 18 — E-edition (monthly issue) `PRODUCT`

**Goal:** A designed monthly issue assembled from published stories, readable as a web edition and downloadable as a PDF.

**Definition of done:** Build an issue from 6 published stories → publish → it appears in /editions, pages through correctly on mobile, and the PDF downloads with the cover, contents and stories.

**Won't change:** No print production, no paid single-issue sales.

## Pre-flight (Claude, 2026-10-10): GO WITH CHANGES

Checked against `main` at `897d00b` (0001–0018 in production, so 0019 is next).

| # | Severity | Area | Finding | Decision |
|---|---|---|---|---|
| 1 | blocker | Schema | The brief assumes 0001–0011. | Migration `0019_editions.sql`. |
| 2 | blocker | PDF fonts | Brand fonts come from `next/font/google` (woff2, fetched at build). `@react-pdf/renderer` can't embed woff2, and fetching Google Fonts at runtime adds an outside dependency. | Bundle `@fontsource/{fraunces,source-serif-4,inter}` (`.woff`) from npm and register them by path. Verified: react-pdf 4.9 renders a PDF with them. |
| 3 | high | PDF content | react-pdf can't render article HTML. | Convert the sanitised `body_html` into blocks (headings, paragraphs, list items, quotes, plain text with entities decoded) in `src/lib/editions/blocks.ts`, unit tested. Images: cover and story hero only, via Supabase public URLs. |
| 4 | high | Storage | A private `editions` bucket needs a writer and a reader. | Bucket `editions` (private, PDF only, 30 MB). Editors upload through their own client (storage policy, editors only). Downloads go through `/editions/[slug]/pdf`, which checks access with `edition_by_slug` (definer, role-aware) and then streams the file using the service role. No public URL. |
| 5 | high | Early access | "Supporters N days early" needs a role check that the public can't bypass. | `supporters_from` and `public_from` on each edition. Definer reads return an edition when it's published and `public_from` has passed, or `supporters_from` has passed and `current_app_role()` is supporter, editor or admin. Items return only articles that are still published. |
| 6 | medium | Status | A separate `scheduled` status duplicates `public_from`. | Status is `draft` or `published`. Scheduling is done with the dates. |
| 7 | medium | Reader | Paging must work with keyboard, swipe, deep links and screen readers. | A client reader with one page per section (cover, contents, letter, each story), ←/→ keys, touch swipe, prev/next buttons, a `#story-slug` hash, `aria-live` page position, and the table of contents as real links. |
| 8 | medium | Routes | `/editions` would be caught by `/[section]`. | Reserve `editions`. |

## Env vars
None new.
