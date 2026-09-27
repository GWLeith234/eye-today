# Sprint 2 — Newsroom CMS

**Goal:** Editors write, schedule and publish articles with a rich-text editor; scheduled articles
appear on time for signed-out readers; every save is revisioned and restorable.

**Verify:**
- As an editor, open /admin/articles/new, write, add an image, schedule it 5 minutes ahead.
  At that time, /articles/[slug] shows it while signed out.
- Restore a revision and confirm the title and body return.
- A script in the editor JSON is absent from the stored body_html.
- npm run lint, npm run typecheck, and npm run build pass.

## Build prompt

```
SPRINT 2 — Newsroom CMS
SESSION HEADER — Eye Today
You are working on Eye Today — a Next.js 16 (App Router, TypeScript, Tailwind) news portal
on Supabase (Postgres/Auth/Storage), deployed on Railway. Repo: eye-today. Branch main is Sprint 0 + Sprint 1.
Read docs/sprints/sprint-01-auth.md and the current schema before writing. There is no master index. Do not invent later sprints.
Rules:
- Work only within this sprint. Create branch sprint-2-cms before changing anything.
  If the environment assigns another branch, also push HEAD to sprint-2-cms.
- New SQL goes in supabase/migrations/0003_cms.sql only. Never edit 0001_core.sql or 0002_rls.sql.
- Do not create a table unless this prompt names it. New columns are allowed on article_revisions and media only as written below.
- Every new table has site_id, created_at, updated_at, RLS enabled and forced, then
  REVOKE ALL FROM anon, authenticated, then GRANT only what the policies use.
- 0002 already revoked future default privileges from anon and authenticated. Keep that.
- Never commit secrets. New env names go in .env.example with blank values.
- The service-role client stays in src/lib/supabase/admin.ts.
  This sprint may import it from exactly one new place: the cron route, and only after CRON_SECRET matches.
  Do not import it from the editor, the preview, the profile action, or a client component.
- Run npm run lint, npm run typecheck, and npm run build before committing.
- Do not install Resend, Stripe, or the Anthropic SDK. No contributor desk. No AI. No public-site redesign.
- End with what changed, files touched, and how to verify.

1. Migration 0003_cms.sql
   - Editors and admins (current_app_role() in ('editor','admin')):
     INSERT on public.articles. WITH CHECK: status in ('draft','scheduled','published').
     The existing editor UPDATE policy stays. Do not grant DELETE on articles.
     SELECT, INSERT, DELETE on public.article_authors and public.article_tags.
     INSERT and UPDATE on public.sections and public.tags. No DELETE on sections
     (articles reference them). SELECT on public.tags for anon and authenticated.
   - Editors and admins can SELECT profiles (id, display_name, role) so the author
     picker works. Do not let an editor update profiles.role. set_user_role stays the only role change.
   - Public visibility, in addition to the existing "published articles are publicly readable" policy:
     a scheduled row is publicly readable when scheduled_for is not null and scheduled_for <= now().
     Do not drop or edit the 0001 policy.
   - public.publish_due_articles() returns integer, SECURITY DEFINER, search_path ''.
     It updates rows where status = 'scheduled' and scheduled_for <= now() to
     status = 'published' and published_at = scheduled_for.
     It takes no article id. REVOKE ALL FROM public, anon, authenticated.
     GRANT EXECUTE TO service_role only.
   - article_revisions: add snapshot jsonb. Editors already insert revisions. Restore does not UPDATE a revision.
   - Storage bucket media: public read, file_size_limit 8388608,
     allowed mime image/jpeg, image/png, image/webp, image/gif.
     Editor and admin INSERT, UPDATE, SELECT, DELETE on storage.objects for bucket_id = 'media'.
     Reject SVG in the app by sniffing bytes, same idea as avatars.
   - supabase/tests/0003_cms.sql, one transaction, rolled back:
     an editor can insert a draft; anon cannot see it;
     anon can see a scheduled article only after scheduled_for;
     a contributor cannot insert an article;
     publish_due_articles() flips only due scheduled rows and sets published_at.

2. Admin shell
   - src/app/admin/layout.tsx already calls requireArea("admin"). Add a sidebar:
     Articles, Media, Sections, Tags, and Users.
     Users is shown only when the profile role is admin. Keep the existing /admin/users redirect.
   - Every new server action: getUser() on the user-scoped client, require role editor or admin
     (admin only for anything that changes a user), validate with zod, then write through that same client.

3. Articles
   - /admin/articles: server-paginated table. Filters: status, section, author. Text search uses the
     existing articles.search column (english), not raw SQL.
   - /admin/articles/new and /admin/articles/[id]:
     Client editor, "use client", immediatelyRender: false.
     Packages: @tiptap/react, @tiptap/pm, @tiptap/starter-kit, @tiptap/extension-image, @tiptap/extension-youtube.
     StarterKit already includes Link. Configure that link. Do not register a second Link extension.
     Custom nodes: PullQuote, and Embed for X and Instagram only.
     Embed stores { provider, url }. Accept only URLs on x.com, twitter.com, or instagram.com.
     YouTube goes through the YouTube extension.
   - On save, the server action builds HTML with generateHTML from the same extensions, then sanitizes
     with isomorphic-dompurify in a server-only module. Store that string in body_html and the JSON in body_json.
     Never store the browser's HTML.
     Allowlist the marks and nodes the editor can produce. Strip script, style, and event handlers.
     Allow iframe only when src is https://www.youtube.com/embed/..., https://www.youtube-nocookie.com/embed/...,
     or an official X or Instagram embed URL. Drop every other iframe.
   - Side panel: section, tags, authors (multi), hero image, dek, slug, sponsored + sponsor name, SEO title and description.
     Slug starts from the title and stays editable. Unique (site_id, slug): on conflict, show a form error.
     Sponsored without a sponsor name fails the existing check constraint; show that as a form error.
     Schedule sets status = 'scheduled' and scheduled_for. Publish sets status = 'published' and published_at = now().
     Unpublish sets status = 'draft'. Draft does not clear published_at.
   - Every successful save inserts article_revisions (author_id = auth.uid(), body_json, body_html, snapshot).
     snapshot holds title, dek, slug, section_id, hero_media_id, seo fields, tag ids, and author ids.
     The revision drawer restores that snapshot onto the article and inserts a new revision. It does not edit the old row.

4. Public article and preview
   - /articles/[slug] is a plain server page, force-dynamic. Select with the anon client and no status filter.
     RLS returns published articles and scheduled articles whose time has arrived.
     Render the stored sanitized HTML. No new visual design. The homepage placeholder stays.
   - /preview/[id] requires a signed-in editor. The editor page mints an HMAC token
     (PREVIEW_SECRET, article id, expiry) and the preview checks it.
     Load the article with the editor's user-scoped client. A bad or expired token returns 404.
     Do not use the service role here.

5. Media, sections, tags
   - /admin/media: the browser uploads to the media bucket with the user session (src/lib/supabase/browser.ts).
     Do not send the file through a server action. After upload, a server action checks the object's real bytes,
     rejects anything that is not jpeg, png, webp, or gif, reads width and height, and inserts public.media
     with storage_path, width, height, alt, credit, and caption. All three text fields are required and non-empty.
     Renditions: a helper may build a Supabase render/image URL. If transforms are disabled, use the original public URL.
   - /admin/sections and /admin/tags: list, create, rename. Editors only. No section delete.

6. Cron
   - POST /api/cron/publish reads Authorization: Bearer <CRON_SECRET> and compares it with timingSafeEqual.
     On a match it calls publish_due_articles() with the service-role client, then revalidatePath('/articles', 'layout').
     Any other caller gets 401. The route publishes nothing itself.
   - Do not put a cron schedule on the web service. railway.toml stays a long-running server.
     Document a separate Railway cron, no more often than every 5 minutes, posting to that URL.
     The public scheduled policy is what makes a 5-minute-ahead article appear on time. The cron only changes its status.

7. Env
   - .env.example: CRON_SECRET= and PREVIEW_SECRET=. Neither is NEXT_PUBLIC_.
   - CI keeps building with the placeholder Supabase URL and anon key. It does not boot Supabase.
   - Add a node:test for the sanitizer: a body_json that would render <script> stores HTML with that script removed.
     Wire it so npm test runs it. The SQL file stays a local psql check, same as 0002.

Verify:
- As an editor, open /admin/articles/new, write, add an image, schedule it 5 minutes ahead.
  At that time, /articles/[slug] shows it while signed out.
- Restore a revision and confirm the title and body return.
- A script in the editor JSON is absent from the stored body_html.
- npm run lint, npm run typecheck, and npm run build pass.
Branch: sprint-2-cms
```
