# Sprint 22 — IAB ad units and the first advertisers `REVENUE`

SESSION HEADER — Eye Today
Next.js 16 (App Router, TypeScript, Tailwind v4) news portal on Supabase, deployed on Railway. Repo: GWLeith234/eye-today.
Branch: `sprint-22-iab-ad-units`, cut from `main` at `449771f` (0001–0025 applied; this sprint adds **0026**).

**Origin:** George, 2026-10-11 late: "The ads need work. Let's use IAB standard sizing. Look at the ads on
evolvedpros.com and create those on theeye.today." Evolved Pros Media runs image units only, all IAB:
728×90 leaderboards between sections, a 300×250 medium rectangle, a 300×600 half page, each labelled
"Advertisement" (or "Sponsored" for its own products).

**Advertisers (George):** Transcend Clinic, EvolveX360 AI Workforce, OZCast (coming to Spotify, YouTube and
Apple Podcasts), Shadow Warriors Project, Evolved Pros Academy. Not AdCellerant.

## Scope
1. **Migration 0026** — `in-river` 640×120 → **728×90** (in-feed leaderboard), `in-article` 640×250 → **300×250**
   (medium rectangle), new **`half-page` 300×600** slot (sidebar, supporter-hidden) with a house creative.
   Nothing uploaded by advertisers exists yet in production, so no stored creative is orphaned.
2. **Code** — `AD_SLOT_NAMES`/`SLOT_SIZES`/`SUPPORTER_HIDDEN` and the rate card; `PLACEMENTS` gets the half page
   in the sidebar on home, section and article pages; the cover's second sidebar unit becomes the half page;
   HTML creatives that carry an `<img>` render it at unit size (block, centred, max-width 100%), so an image
   creative can be hosted anywhere https while uploads are editor-only.
3. **Advertisers** — five campaigns loaded in production after merge (DML, not a migration): image creatives where
   artwork exists on evolvedpros.com (Transcend 728×90 + 300×600, EvolveX360 728×90, Academy 728×90), text
   creatives in the IAB frames for OZCast and Shadow Warriors Project until artwork arrives. Labelled
   "Advertisement"; Transcend's relationship disclosure already lives on its directory listing.

## Not in scope
970×250 billboard and 320×100 large mobile banner (offered; decide later). Uploading the artwork into Eye Today's
own bucket (hotlinked from the Evolved Pros bucket for now; both are George's).

## Definition of done
Every unit on the rate card is an IAB size; `/advertise` lists them; the half page serves in the sidebar and is
hidden for supporters; e2e `ad-units` green; five campaigns live with at least one creative each.

## Rollback
`git revert` the merge commit; a new migration restores the two sizes and deactivates `half-page`.
