# QA sweep, 18 October 2026 — what is still open

Written after the sweep that produced PR #39. Everything fixed there is out of this file; what is
left is what needs either a person or a local reproduction. Read this before re-auditing, so the
ruled-out ground is not covered twice.

State when this was written: `main` carries PRs #36 (ad chrome), #37 (PWA), #38 (events, stories,
podcasts) and the production database is on migration 0029. `npx tsc --noEmit`, `npx eslint src/ e2e/`
and `npm test` (173) are clean, and were clean through every defect found.

---

## 1. The directory serves one listing out of four — unresolved

**This is the one worth a local reproduction, and it is the reason to point a second agent at the
repo: it needs a dev server and a browser, which the cloud session has neither of.**

### Symptom, confirmed on production

- `/directory` reports `1 listing` and shows only Transcend Ibogaine Clinic.
- `/directory?category=podcast` returns the identical page — including the clinic, which is not a
  podcast. The category filter does nothing.
- `/podcasts`, which calls the same `searchDirectory()` with `category: "podcast"`, correctly shows
  three shows, freshly rendered (checked with a cache-busting query string).

So the same helper, in the same deployment, in the same minutes, returns 3 rows for one caller and
1 row for another.

### Ruled out — do not re-check these

- **The data.** `directory_listings` holds 4 published rows (3 podcasts + 1 clinic).
- **The SQL.** `directory_search` and `_directory_match` were read in full. Both are `STABLE
  SECURITY DEFINER` with `search_path = ''`, and neither depends on the caller, the request, the
  clock or a site id. Filtering is `status = 'published'`, a non-hidden category join, and the five
  optional predicates — all deterministic.
- **The arguments.** Called as `anon` with the exact named arguments the app sends
  (`q`, `country_code`, `category_slug`, `service`, `verification`, `page`), empty strings and nulls
  both return 4 unfiltered and 3 for `podcast`. `directory_search_count` returns 4.
- **Overloads.** There is exactly one `directory_search` and one `directory_search_count`.
- **Hidden categories.** All 8 categories have `hidden = false`, `podcast` included.
- **A wrong project.** The live site serves avatars from `zlvxynrtijexxryinirw.supabase.co`, which
  is the project inspected above. `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` are
  both set on the Railway service.
- **The 4-second timeout.** Railway's HTTP logs put `/directory` at 4–189 ms.
- **An error being swallowed.** No `public read … failed` line since 4 October.

### What has been added to help

`src/lib/directory/public.ts` now logs when `within()` takes a fallback, when there is no Supabase
client, and — temporarily — the filters and row count of every `directory_search`. Read one real
request in the Railway deploy logs and the answer should fall out. **Delete that `console.log` once
it has been read.**

### Where to look next

1. Run the app locally against the production Supabase and open `/directory`. If it is correct
   locally, the bug is in the deployment or a cache, not the code.
2. If it reproduces locally, log the raw PostgREST response (not the mapped rows) inside
   `loadSearch`, and compare the request body against a hand-rolled `curl` of the same RPC.
3. Check response headers on the live `/directory` for an age or cache header. `export const dynamic
   = "force-dynamic"` is set on the page, so a cached render should not be possible — if one is
   being served anyway, that is the bug and it will be affecting more than the directory.

### Why it matters more than it looks

The directory is the product's spine — it is what a reader in trouble actually came for. "No
listings match" is not an error message; it is a false claim that Eye Today lists no clinics.

---

## 2. Three stories have no byline — needs a decision

`a-year-on-the-veterans-were-still-better`, `ibogaine-has-gone-national-what-the-networks-are-saying`
and `fifty-million-dollars-and-a-schedule-i-problem` have no `article_authors` row, so they publish
unbylined. The other seven published stories are bylined **George Leith**, while `/about` names
**Jeff Davis** as Editor and Publisher.

Attribution is a claim about a real person, so this is not an agent's call to make. Someone has to
say who wrote them before a row is inserted.

---

## 3. Still carrying TODOs in public

`src/content/contact.md` — the Durban postal address. `src/content/terms.md` — governing law and
venue, which the file itself says a lawyer must confirm. Both are genuinely blocked on a human; the
disclaimer's crisis-resources TODO was the urgent one and is fixed in #39, with the final wording
still Jeff's.

---

## 4. Smaller, confirmed, not yet done

- **Supabase leaked-password protection is off.** One toggle in Auth settings; the advisor flags it.
- **`/legal-map` files Mexico as `unclear`** while its own headline says unregulated. Waiting on the
  `prescription` category decision (migration 0030, scoped in the Sprint 25 brief).
- **Five landmarks named "Advertisement"** on the cover at desktop width (axe `landmark-unique`,
  moderate). The a11y gate filters to serious and critical, so it will never see this.
- **The a11y gate cannot see the ad chrome at all**: `e2e/a11y/pages.spec.ts` runs with no seeded
  house campaign, so every `AdSlot` returns null and axe audits a page with no ad units.
  `e2e/flows/ad-units.spec.ts` is skipped unless `E2E_FULL=1`.
- **The masthead covers the top ~90 px of the skin.** `SiteHeader` is `sticky top-0` at full width,
  outside the paper column, over a `fixed inset-0` wallpaper — so the top of what the advertiser
  bought is never visible. Product call: move the header inside the column, or write the dead strip
  into the skin spec.
- **No navigation preload** in the service worker. Installed readers pay worker startup on every
  navigation to get what the network would have given. `navigationPreload.enable()` in `activate`.
- **`img-src` disagrees with the ad model.** `sanitizeAdHtml` accepts any `https://` image host;
  the CSP `img-src` lists only self, data, blob, Supabase, ytimg and OSM. CSP is report-only, so
  nothing breaks today and everything breaks the day it is enforced.

---

## 5. Dead code worth deleting

`HeroImage` (`story-card.tsx`, exported, unused, launders a `Pick<…>` through an unchecked cast);
`Creative.html` (`ad-slot.tsx`, declared, never read — `serve/route.ts` hardcodes `html: null`);
`pointLinksAt` (`lib/ads/sanitize.ts`, referenced only by its own test); `AdSlot`'s `className`,
accepted and ignored on the mobile-banner branch; and `placements.ts RESERVED`, which duplicates
`lib/public/reserved.ts` with different membership — they agree today, and a route added to one and
not the other will mislabel ad impressions silently rather than failing.
