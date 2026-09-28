# Sprint 4 — Public front end (Pique layout)

**Definition of done:** on a phone-width viewport, / shows a lead story; tapping it opens the article
with a byline, a disclosure, and the medical disclaimer; tapping that section opens a paginated list.
Sponsored stories show the word Sponsored. npm run lint, npm run typecheck, and npm run build pass.

**Verify:** phone-width / → lead story → article shows byline, disclosure, and the disclaimer →
its section link → a list of 20 with a next page when more than 20 exist.
A draft in a homepage slot does not appear for a signed-out reader.
/articles/{slug} redirects to the section URL.

Reference: piquenewsmagazine.com for information architecture only. No copied branding, logo or CSS.

## Build prompt

```
SPRINT 4 — Public front end (Pique layout)
SESSION HEADER — Eye Today
You are working on Eye Today — a Next.js 16 (App Router, TypeScript, Tailwind 4) news portal
on Supabase (Postgres/Auth/Storage), deployed on Railway. Repo: eye-today.
Sprint docs live in docs/sprints/. There is no SPRINT-MASTER-INDEX.md. Do not create one.
Sprints 0–3 are on branch sprint-3-contributors at 373f19b. main does not have Sprint 3.
Create sprint-4-frontend from that commit, not from main.
If the environment assigns another branch, also push HEAD to sprint-4-frontend.
Read docs/sprints/sprint-02-cms.md, docs/sprints/sprint-03-contributors.md, and
supabase/migrations/0001 through 0004 before writing.

Rules:
- Work only within this sprint. New SQL goes in supabase/migrations/0005_frontend.sql only.
  Never edit 0001–0004.
- Every NEW table has site_id, created_at, updated_at, RLS enabled and forced,
  then REVOKE ALL FROM anon, authenticated, then GRANT only what the policies use.
- New functions: SECURITY DEFINER, SET search_path = '', schema-qualify every reference.
  REVOKE ALL FROM public, anon, authenticated, then GRANT only the roles named below.
  A definer function granted to anon is a public API. It must never return drafts,
  emails, roles, or unpublished hero metadata.
- Do not grant anon SELECT on public.profiles. That table contains email.
- The service-role client stays in src/lib/supabase/admin.ts. This sprint does not import it.
- Never commit secrets. New env names go in .env.example with blank values.
- Run npm run lint, npm run typecheck, and npm run build before committing.
- Do not install TipTap, Resend, Stripe, the Anthropic SDK, or a font package.
- Do not fetch Google fonts. Railway builds fail when next/font/google downloads fonts.
- Zod is v4. params and searchParams are async. proxy.ts stays the Next 16 middleware.
- End with what changed, files touched, and how to verify.

Definition of done: on a phone-width viewport, / shows a lead story; tapping it opens the article
with a byline, a disclosure, and the medical disclaimer; tapping that section opens a paginated list.
Sponsored stories show the word Sponsored. npm run lint, npm run typecheck, and npm run build pass.
Branch: sprint-4-frontend

Reference: piquenewsmagazine.com for information architecture only. Do not copy its branding,
logo, or CSS. Eye Today stays the name.

1. Migration 0005_frontend.sql

   profiles.slug text. Unique (site_id, slug). Backfill from the display name, lowercased,
   non-alphanumerics to hyphens, empty names become "author". On collision append the
   first 8 characters of the profile id. Do not change the slug when display_name changes.
   New profiles with a null slug get one from the same rule via a BEFORE INSERT trigger
   that only fills slug when it is null. Slug is not on the profile-edit form.

   homepage_slots (
     id, site_id, slot text check (slot in ('lead','secondary')),
     position int check (position between 0 and 3),
     article_id uuid references articles(id) on delete cascade,
     created_at, updated_at,
     unique (site_id, slot, position)
   ). Lead uses position 0 only. Secondary uses 0–3.
   RLS on. GRANT SELECT, INSERT, UPDATE, DELETE to authenticated.
   Editor/admin policies for all four commands. No anon policies.
   The public homepage reads through the function below, not through a public SELECT,
   so a slot pointing at a draft does not leak that article id.

   article_view_days (
     article_id uuid references articles(id) on delete cascade,
     day date not null,
     views integer not null default 0 check (views >= 0),
     primary key (article_id, day)
   ) plus site_id, created_at, updated_at.
   RLS on. No grants to anon or authenticated. Only record_article_view and most_read write and read it.

   article_view_seen (
     article_id uuid, day date, ip_hash text,
     primary key (article_id, day, ip_hash)
   ). No grants to anon or authenticated. Stores a hash, never an IP.

   Public media metadata, so hero credit and dimensions can render:
   GRANT SELECT on public.media to anon, authenticated.
   Policy "live heroes are publicly readable": the media row is the hero_media_id of an article
   that is published with published_at <= now(), or scheduled with scheduled_for <= now().
   Do not make every media row public.

   Functions, all SECURITY DEFINER, search_path ''. Grant EXECUTE to anon and authenticated
   unless noted. Each one returns only publicly readable articles
   (published and published_at <= now(), or scheduled and scheduled_for <= now()).

   - homepage_public(): lead (1) and secondary (up to 4). Use homepage_slots whose article
     is public. If a position is empty or points at a non-public article, fill from the
     newest public articles not already used. Return title, dek, article slug, section slug,
     section name, published_at, hero storage_path, hero alt, hero credit, hero width,
     hero height, is_sponsored, first byline display_name.
   - latest_articles(lim int, off int): newest public articles. Cap lim at 20.
   - section_articles(section_slug text, lim int, off int) and section_article_count(section_slug text).
   - tag_articles(tag_slug text, lim int, off int) and tag_article_count(tag_slug text).
     Tags are already publicly readable. article_tags is not. Use the function, do not
     open article_tags to anon.
   - author_public(author_slug text): display_name, bio, disclosure text, slug.
     Return no row unless that profile has at least one public article. Never return email or role.
   - author_articles(author_slug text, lim int, off int) and author_article_count(author_slug text).
   - most_read(lim int): top public articles by summed article_view_days.views over the last 7 days.
     Cap lim at 5. If fewer than 1 row, return newest public articles so the rail is not empty.
   - record_article_view(article uuid, ip_hash text): returns void.
     If the article is not publicly readable, return without writing.
     If ip_hash is null or longer than 64 chars, return without writing.
     Insert article_view_seen. If that pair already exists, return.
     Otherwise insert or increment article_view_days for current_date.
     GRANT EXECUTE to anon, authenticated.

   supabase/tests/0005_frontend.sql, one transaction, rolled back, same style as 0004:
   - anon homepage_public does not return a draft even if a slot points at it
   - anon cannot select profiles
   - author_public returns bio and disclosure for an author of a published article and no row for a draft-only author
   - author_public's result columns do not include email
   - record_article_view on a draft does not insert a view row
   - record_article_view on a published article increments once per ip_hash per day
   - a second call with the same hash does not increment again

2. Design
   Tailwind 4. Put tokens in src/app/globals.css under @theme. Do not add tailwind.config.
   Neutral placeholders: --color-paper, --color-ink, --color-muted, --color-rule, --color-accent.
   Delete the prefers-color-scheme block that sets a black background. The public site is light.
   Headlines: ui-serif, Georgia, "Times New Roman", serif.
   Body and UI: ui-sans-serif, system-ui, sans-serif.
   No remote font requests.

   Header on every public page: masthead "Eye Today" linking to /, section nav from public.sections
   ordered by sort (anon can already read sections), a search link to /search, a Newsletter link
   to /newsletter, a Support us link to /support, and Sign in linking to /login.
   When a session exists, Sign in points at /account. Read the session with the existing server helper.
   The header is a server component. Mobile: section nav wraps or becomes a <details> named Sections.
   Do not build a client-only menu that hides the links from the first HTML.

   Footer: About, Contact, Advertise, Write for us (/write-for-us), Editorial policy, Corrections,
   Privacy, Terms. Those routes are short static server pages, one paragraph each, except Write for us
   which already exists. /newsletter says signup is not open yet and has no form action.
   /support says payments are not open yet and has no checkout.

   <AdSlot name="leaderboard|bigbox-1|bigbox-2|in-river"> is a labelled placeholder
   ("Advertisement") with a fixed min-height. Do not read ad_slots, ad_campaigns, ad_creatives, or ad_events.

3. Homepage, src/app/(public)/page.tsx
   Replace the coming-soon page. export const revalidate = 60.
   One call to homepage_public(), one to latest_articles(10, 0), one section_articles(slug, 4, 0)
   per section, one most_read(5). Do not query bylines per card.
   Regions: lead plus 4 secondary, The Latest, a rail of 4 for each section, Opinion called out
   from the opinion section, Most Read, and the four AdSlot placeholders.
   Each card links to /{sectionSlug}/{articleSlug}. Sponsored cards say Sponsored.
   Hero images use next/image and mediaUrl() from src/lib/media/url.ts. Pass width and height
   when the function returned them; otherwise fill a sized frame. Alt text comes from the hero
   alt or the headline.

   next.config.ts images.remotePatterns:
   - https hostname *.supabase.co pathname /storage/v1/object/public/media/**
   - https hostname *.supabase.co pathname /storage/v1/render/image/public/media/**
   - http hostname 127.0.0.1 pathname /storage/v1/object/public/media/**
   - http hostname 127.0.0.1 pathname /storage/v1/render/image/public/media/**

4. Lists
   /[section] is the section page, 20 per page, ?page= . Validate page as an integer from 1 to 100.
   Unknown section slug: 404. Unknown or empty page: page 1.
   /tag/[slug] and /author/[slug] use the same pagination.
   Author page shows display name, bio, disclosure (plain text), and their articles.
   Reserved section slugs, rejected in the section create/rename action and treated as 404
   if a row somehow has one: account, admin, api, articles, auth, author, contribute, login,
   preview, search, tag, write-for-us, about, contact, advertise, newsletter, support,
   editorial-policy, corrections, privacy, terms.
   Seed slugs (news, research-science, policy-law, treatment-clinics, stories, opinion) are fine.

5. Article
   Canonical URL is /[section]/[slug]. Load the public article with the anon client
   (RLS already returns published and due scheduled rows). If the article's section slug
   does not match the first segment, 404. Do not serve it under the wrong section.
   src/app/articles/[slug]/page.tsx stays as a redirect to /{sectionSlug}/{articleSlug}.
   Keep using article_bylines() for the disclosure text. Bylines link to /author/{slug}
   using author_public or a slug returned beside the byline. If you need the slug,
   extend the read inside a NEW function in 0005, article_public_bylines(article uuid),
   returning display_name, disclosure, author_slug. Do not change article_bylines().
   Show published time and updated time (articles.updated_at).
   Hero with credit and alt. Share row: copy link (small client component), and links only
   for X, Facebook, and email. No share SDK.
   Body is the stored HTML passed through the existing sanitizeArticleHtml. Do not render
   unsanitized HTML.
   Disclosure box: the disclosure text as plain text, or "No disclosure on file."
   Disclaimer, this exact sentence: "Information only — not medical advice. Ibogaine and psychedelics carry serious medical and legal risks."
   Related: up to 4 other public articles that share a tag, via a function related_articles(article uuid)
   in 0005. If there are no tags, show nothing.
   Sponsored label is the word Sponsored, plus the existing sponsor name.
   export const revalidate = 60.
   After paint, a client component sends POST /api/view with the article id once.
   That route reads the anon server client, hashes the first x-forwarded-for address with
   sha256 and VIEW_HASH_SALT (blank in .env.example; if unset, hash with the fixed prefix
   "eye-today-view" so a missing salt still avoids storing the IP), then calls
   record_article_view. No service role. Invalid id returns 204. Always 204 on success
   so the route is not a probe for drafts.

6. Search
   /search reads ?q= . Trim, max 80 characters. Empty q shows the field and no results.
   Use the anon client and .textSearch("search", q, { config: "english", type: "websearch" })
   so the existing RLS hides drafts. 20 results, no pagination this sprint. The search
   input has a visible label.

7. Admin homepage
   /admin/homepage, editor and admin, behind the existing admin layout. Add a Homepage sidebar link.
   Server actions: getEditorContext(), zod, write homepage_slots with that same user-scoped client.
   Lead: one article. Secondary: up to 4. The article must already be published or scheduled;
   reject drafts with a form error. Saving calls revalidatePath("/").

8. Cache
   In the existing editor saveArticle, call revalidatePath("/") and revalidatePath("/articles", "layout")
   when the intent is publish, schedule, or unpublish. Do the same in review publishNow,
   approveAndSchedule, and the cron publish route. Also revalidatePath for the article's
   section when you have the section slug. A scheduled story becomes visible by the existing
   RLS rule; the 60 second revalidate is the bound for the homepage.

9. Tests
   The SQL file is a local check after supabase db reset. CI does not boot Supabase.
   npm run lint, npm run typecheck, npm run build with the CI placeholder Supabase env.

Verify: phone-width / → lead story → article shows byline, disclosure, and the disclaimer →
its section link → a list of 20 with a next page when more than 20 exist.
A draft in a homepage slot does not appear for a signed-out reader.
/articles/{slug} redirects to the section URL.
npm run lint, npm run typecheck, and npm run build pass.
Branch: sprint-4-frontend
```
