# Sprint 5 — Search, SEO & performance

**Definition of done:** Rich Results Test on an editorial article returns a valid NewsArticle;
/search?q=ibogaine returns results ranked by relevance (title matches above body matches).

**Verify:** an editorial article's JSON-LD is a NewsArticle with headline, datePublished, author,
publisher, and image. A sponsored article's JSON-LD is Article and is absent from news-sitemap.xml.
/search?q=ibogaine (or the fixture word used in 0006) lists a title match above a body-only match,
with a highlighted snippet. An old /{section}/{slug} 308s to the new path. A draft never appears
in search, the sitemap, the news sitemap, or RSS.

Branch: `sprint-5-seo`, from `origin/sprint-4-frontend`.

---

## Build prompt (verbatim)

SPRINT 5 — Search, SEO & performance
SESSION HEADER — Eye Today
You are working on Eye Today — a Next.js 16.3.6 (App Router, TypeScript, Tailwind 4) news portal
on Supabase (Postgres/Auth/Storage), deployed on Railway. Repo: eye-today.
Sprint docs live in docs/sprints/. There is no SPRINT-MASTER-INDEX.md. Do not create one.
Read docs/sprints/sprint-04-frontend.md and supabase/migrations/0001 through 0005 before writing.

Sprints 0–4 are on origin/sprint-4-frontend at 2b34a2e. main does not have Sprint 3 or Sprint 4.
Create sprint-5-seo from that commit, not from main.
If the environment assigns another branch, also push HEAD to sprint-5-seo.

Rules:
- Work only within this sprint. New SQL goes in supabase/migrations/0006_seo.sql only.
  Never edit 0001–0005. 0006 assumes 0005 is already applied.
- articles.search, articles_set_search(), and articles_search_idx already exist.
  Title is weight A, dek is weight B, body_html with tags removed is weight C, config english.
  The trigger runs before insert or update of title, dek, body_html. Leave all three alone.
- Every NEW table has site_id, created_at, updated_at, RLS enabled and forced,
  then REVOKE ALL FROM anon, authenticated, then GRANT only what a policy uses.
  slug_history is written by a trigger and read by a definer function, so it gets no client grant and no anon policy.
- New functions: SECURITY DEFINER, SET search_path = '', schema-qualify every reference.
  REVOKE ALL FROM public, anon, authenticated, then GRANT EXECUTE to anon and authenticated
  only for search_articles, search_article_count, and article_slug_redirect.
  A definer function granted to anon is a public API. It returns live articles only:
  published with published_at <= now(), or scheduled with scheduled_for <= now().
  Call public._live_articles() for that set. Never return drafts, emails, roles, or full body_html.
- Do not grant anon SELECT on public.profiles. That table contains email.
- The service-role client stays in src/lib/supabase/admin.ts. This sprint does not import it.
  Public reads use the cookie-less anon client in src/lib/supabase/anon.ts.
- Never commit secrets. No new env names. Absolute URLs use the existing SITE_URL
  (already metadataBase in src/app/layout.tsx). When SITE_URL is unset, leave canonical paths relative.
- Run npm run lint, npm run typecheck, and npm run build before committing.
  Build with NEXT_PUBLIC_SUPABASE_URL=https://placeholder.supabase.co and
  NEXT_PUBLIC_SUPABASE_ANON_KEY=placeholder-anon-key.
- Do not install TipTap, Resend, Stripe, the Anthropic SDK, @vercel/og, or a font package.
  Do not fetch Google fonts. ImageResponse comes from next/og and uses its built-in font.
- Zod is v4. params and searchParams are async. src/proxy.ts stays the Next 16 middleware.
  Do not add middleware.ts.
- End with what changed, files touched, and how to verify.

Definition of done: Rich Results Test on an editorial article returns a valid NewsArticle;
/search?q=ibogaine returns results ranked by relevance (title matches above body matches).
Branch: sprint-5-seo

1. Search
   supabase/migrations/0006_seo.sql:
   search_articles(q text, section_slug text, page integer)
   returns title, dek, article_slug, section_slug, section_name, published_at,
   is_sponsored, snippet.
   search_article_count(q text, section_slug text) returns integer.
   Blank or null q returns no rows. Use the first 80 characters.
   Parse with websearch_to_tsquery('pg_catalog.english', q). Do not use to_tsquery.
   Keep rows whose search vector matches, and whose id is in public._live_articles().
   A null or blank section_slug searches every section; otherwise match that section slug.
   Order by ts_rank(search, query) desc, then published_at desc, then id.
   Page is an integer. Limit 20, offset (page - 1) * 20. Page below 1 or above 100 yields no rows.
   snippet is ts_headline over the same tag-stripped title, dek, and body text,
   MaxWords 30, MinWords 12, StartSel «, StopSel ». No HTML in the snippet.

   Replace src/app/(public)/search/page.tsx. Keep the labeled form and ?q=.
   Add an optional section select named section, filled from the public sections list,
   skipping reserved slugs (src/lib/public/reserved.ts).
   Validate the page with parsePage from src/lib/public/paging.ts.
   Show the snippet under each result, with « and » rendered as <mark> after escaping the text.
   Keep the Sponsored label. Use the existing Pagination component.
   metadata robots is noindex, follow. The page stays dynamic because it reads searchParams.

   supabase/tests/0006_seo.sql, same style as 0005: one transaction, rolled back.
   A draft with the query in the title is absent. A live title match ranks above a live body match.
   The snippet contains no <script>. Anon select on slug_history raises insufficient_privilege.

2. Sitemap, news sitemap, robots, RSS
   src/app/sitemap.ts returns the static public pages (about, contact, advertise, write-for-us,
   editorial-policy, corrections, privacy, terms, newsletter, support), each section URL,
   and each live article at /{section}/{slug}. lastModified is updated_at.
   Cookie-less anon client, or a definer function that only returns those live paths.
   export const revalidate = 3600.

   src/app/news-sitemap.xml/route.ts returns XML, Content-Type application/xml.
   Namespace news: http://www.google.com/schemas/sitemap-news/0.9.
   Publication name Eye Today, language en. Include live articles whose public date
   (published_at, or scheduled_for when that is the public date) is within the last 48 hours.
   Exclude is_sponsored. Escape title and loc. export const revalidate = 3600.

   src/app/robots.ts allows /, and disallows /admin, /account, /contribute, /login,
   /preview, /api, and /auth. Sitemap lines point at /sitemap.xml and /news-sitemap.xml.
   With SITE_URL set, those sitemap URLs are absolute.

   src/app/rss.xml/route.ts is the site feed, latest 20 live articles.
   src/app/(public)/[section]/rss.xml/route.ts is that section's feed.
   Unknown or reserved section: 404. RSS 2.0, atom self link, guid is the canonical article URL,
   pubDate from the public date, description is the dek escaped as text. Sponsored items stay,
   with the title prefixed by "Sponsored: ". export const revalidate = 3600.
   The proxy matcher already skips paths that contain a dot, so these files do not run the redirect lookup.

3. Metadata and JSON-LD
   Article generateMetadata already sets title and description. Keep the relative canonical
   /{section}/{slug} so metadataBase can make it absolute. Description falls back from
   seo_description, to dek, to the site description "News, research and stories about eye health."
   Add openGraph title, description, and url for the article, the section, and the author.
   Section and author generateMetadata already exist; add a description where the page has one
   (section name, author bio trimmed) and the relative canonical.

   On the article page, emit one application/ld+json script.
   Editorial stories are NewsArticle. Sponsored stories are Article.
   Fields: headline (the title), datePublished and dateModified as ISO timestamps,
   description, mainEntityOfPage as the absolute canonical when SITE_URL is set,
   author as Person entries from article_public_bylines (name, and url /author/{slug} when present).
   When there is no byline, author is the Organization Eye Today.
   publisher is Organization Eye Today. image is the absolute hero URL from mediaUrl,
   otherwise the absolute /{section}/{slug}/opengraph-image URL.
   JSON.stringify the object and escape < as <. Disclosure text stays plain text in the page;
   it is not a JSON-LD field.

4. OG image
   src/app/(public)/[section]/[slug]/opengraph-image.tsx
   ImageResponse from next/og. size 1200×630, contentType image/png.
   params is a Promise. Load the live article with the anon client. Unknown article: notFound().
   Draw the section name, the title, and the words Eye Today. Use the default font.
   export const alt is the article title. The existing revalidatePath(`/${section}/${slug}`)
   in src/lib/public/revalidate.ts covers this image; do not add a second cache.

5. Old addresses
   Table public.slug_history: id, site_id, article_id, section_slug, slug, created_at, updated_at.
   Unique (site_id, section_slug, slug). Index (slug).
   BEFORE UPDATE trigger on articles: when slug or section_id changes, insert the previous
   section slug and article slug. Delete any history row whose (section_slug, slug) equals the
   new public path, so a reused slug belongs to the current article.
   article_slug_redirect(section text, slug text) returns text.
   Return null when a current article already has that slug (any status), or when the
   history row's article is not live. Otherwise return the single current path
   /{currentSection}/{currentSlug}.

   In src/proxy.ts, after the auth redirect decision, for a path of exactly two segments
   whose first segment is not reserved, call that function with the anon-capable client
   already created there. When it returns a path and that path differs from the request,
   respond with NextResponse.redirect(..., 308) and copy any refreshed cookies onto it,
   the same way the auth redirect already does.
   src/app/(public)/articles/[slug]/page.tsx: when the current slug is missing, call the
   same function with section "articles" is wrong — look up history by slug across sections
   by trying the function only for the stored section. Add the slug lookup to the function
   as article_slug_redirect_any(slug text) returning the same canonical path under the same
   live and ownership rules, and use that from the legacy page. One hop, never a chain.

6. Tests
   The SQL file is a local check after supabase db reset. CI does not boot Supabase.
   Also assert: renaming a live article's slug makes article_slug_redirect(old section, old slug)
   return the new path; unpublishing makes it return null; anon cannot execute _live_articles().

Verify: an editorial article's JSON-LD is a NewsArticle with headline, datePublished, author,
publisher, and image. A sponsored article's JSON-LD is Article and is absent from news-sitemap.xml.
/search?q=ibogaine (or the fixture word used in 0006) lists a title match above a body-only match,
with a highlighted snippet. An old /{section}/{slug} 308s to the new path. A draft never appears
in search, the sitemap, the news sitemap, or RSS.
npm run lint, npm run typecheck, and npm run build pass.
Branch: sprint-5-seo
