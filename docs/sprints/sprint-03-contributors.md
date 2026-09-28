# Sprint 3 — Contributor portal & editorial workflow

**Definition of done:** a contributor submits a story, an editor requests changes, the contributor
resubmits, an editor publishes, and that contributor's disclosure is visible on the live article.
A contributor cannot see Publish, Schedule, or Unpublish, and a direct write cannot set
status to published, scheduled, or in_review.

**Verify:** contributor submits → editor requests changes → contributor resubmits → editor publishes;
the disclosure shows on /articles/[slug] while signed out. A contributor session has no Publish button,
and the SQL test shows they cannot set status published.

## Build prompt

```
SPRINT 3 — Contributor portal & editorial workflow
SESSION HEADER — Eye Today
You are working on Eye Today — a Next.js 16 (App Router, TypeScript, Tailwind) news portal
on Supabase (Postgres/Auth/Storage), deployed on Railway. Repo: eye-today.
Sprint docs live in docs/sprints/. There is no SPRINT-MASTER-INDEX.md. Do not create one.
Read docs/sprints/sprint-01-auth.md, docs/sprints/sprint-02-cms.md, and the current
schema (supabase/migrations/0001_core.sql, 0002_rls.sql, 0003_cms.sql) before starting.
Sprints 0, 1, and 2 are already on main.

Rules:
- Work only within this sprint. Create branch sprint-3-contributors before changing anything.
  If the environment assigns another branch, also push HEAD to sprint-3-contributors.
- New SQL goes in supabase/migrations/0004_contributors.sql only. Never edit 0001, 0002, or 0003.
- Dropping a policy by name and creating its replacement in 0004 is allowed.
  Adding a second permissive policy does not restrict the old one: Postgres ORs them.
- Every NEW table has site_id, created_at, updated_at, RLS enabled and forced,
  then REVOKE ALL FROM anon, authenticated, then GRANT only what the policies use.
- New trigger functions use SET search_path = '' and schema-qualify every reference.
- Never commit secrets. New env names go in .env.example with blank values.
- The service-role client stays in src/lib/supabase/admin.ts.
  This sprint may import it from one new place: approving an application, and only for
  auth.admin.inviteUserByEmail. Article writes, review actions, and disclosure writes
  use the user-scoped server client. Do not import admin.ts from a client component.
- Run npm run lint, npm run typecheck, and npm run build before committing.
- Install resend. Do not install Stripe, the Anthropic SDK, hCaptcha, or another editor.
- Zod is v4. Follow the calls already in the repo (z.email(), z.uuid()).
- params, searchParams, and cookies() are async. New pages use the generated PageProps and LayoutProps.
- End with what changed, files touched, and how to verify.

1. Migration 0004_contributors.sql

   articles.created_by uuid references public.profiles(id) on delete set null.
   Backfill from the earliest article_authors row. Leave rows with no author null.
   The app sets created_by to auth.uid() on contributor insert. Default auth.uid() is fine.

   profiles.email text.
   Backfill from auth.users. New trigger on auth.users, AFTER INSERT OR UPDATE OF email,
   SECURITY DEFINER, search_path '', sets profiles.email for that id.
   Do not add email to the profile-edit form or to the column UPDATE grant.
   Users already have table SELECT, so they can read email on rows their policies allow.

   disclosures: unique (profile_id). Check char_length(btrim(text)) > 0.
   "No affiliations" is a valid statement. Blank is not.
   Existing duplicate profile_id rows: keep the newest and delete the older ones before the unique constraint.

   Replace contributor article policies. Drop "contributors read own drafts" and
   "contributors update own drafts", then create:

   - SELECT for contributors where is_article_author(id) OR created_by = auth.uid().
     Any status, so the dashboard can show published work.
   - INSERT for contributors where status = 'draft' AND NOT is_sponsored AND created_by = auth.uid().
   - UPDATE for contributors USING status = 'draft' AND NOT is_sponsored
     AND (is_article_author(id) OR created_by = auth.uid()),
     WITH CHECK status IN ('draft','submitted') AND NOT is_sponsored AND created_by = auth.uid().
     A submitted, in_review, scheduled, or published row cannot be updated by a contributor.

   Do not drop the editor insert/update policies or the public read policies.

   article_authors, contributor INSERT: role is contributor, profile_id = auth.uid(),
   and the article's created_by is auth.uid() and its status is draft.
   Contributor SELECT: is_article_author(article_id) OR the article's created_by is auth.uid().
   No contributor DELETE. The contributor save never changes the author list after create.

   article_tags, contributor SELECT when they author the article or created it.
   INSERT and DELETE only when they author it and the article status is draft.

   Trigger articles_require_disclosure, BEFORE INSERT OR UPDATE on articles,
   when NEW.status = 'submitted' and the old status is distinct:
   raise if any article_authors row for that article lacks a disclosures row.
   This is the API-level gate. The UI check is extra.

   contributor_applications (
     id, site_id, name, email, bio, affiliations, sample_links text,
     status text not null default 'pending' check (status in ('pending','approved','rejected')),
     reject_reason text, reviewed_by uuid references profiles(id),
     created_at, updated_at
   ).
   Index (status, created_at). Partial unique index on lower(email) WHERE status = 'pending'.
   RLS on. REVOKE ALL from anon, authenticated.
   GRANT INSERT to anon, authenticated. GRANT SELECT, UPDATE to authenticated.
   INSERT policy for anon and authenticated: status = 'pending' AND reviewed_by IS NULL.
   SELECT and UPDATE policies: current_app_role() in ('editor','admin').
   No DELETE.

   editorial_notes (
     id, site_id, article_id references articles, author_id references profiles,
     body text not null, resolved boolean not null default false,
     created_at, updated_at
   ).
   author_id is the person who wrote the note. Index (article_id, created_at).
   RLS on. REVOKE ALL. GRANT SELECT, INSERT, UPDATE to authenticated.
   Editors/admins: SELECT all, INSERT with author_id = auth.uid(), UPDATE all.
   Contributors: SELECT where is_article_author(article_id). No contributor INSERT or UPDATE.
   These are editor notes, not public comments.

   public.article_bylines(article uuid) returns table (display_name text, disclosure text).
   LANGUAGE sql, STABLE, SECURITY DEFINER, search_path ''.
   Join article_authors, profiles, and disclosures for that article only when the article
   is publicly readable: status published with published_at <= now(), or status scheduled
   with scheduled_for <= now(). Order by article_authors.sort.
   Return display_name and disclosure text only. Never email.
   REVOKE ALL from public. GRANT EXECUTE to anon, authenticated.

   public.editor_emails() returns setof text.
   SECURITY DEFINER, search_path ''.
   Caller must have current_app_role() in ('contributor','editor','admin'), else return no rows.
   Return profiles.email where role in ('editor','admin') and email is not null.
   REVOKE ALL from public. GRANT EXECUTE to authenticated.

   public.profile_id_for_email(lookup text) returns uuid.
   SECURITY DEFINER, search_path ''.
   Caller must be editor or admin, else raise 'not authorized'.
   Return profiles.id where lower(email) = lower(btrim(lookup)), or null.
   REVOKE ALL from public. GRANT EXECUTE to authenticated.

   public.grant_contributor(target uuid) returns void.
   SECURITY DEFINER, search_path ''. Owned by the migration role so profiles_lock_role allows it.
   In order, raise if a check fails:
   1. auth.uid() is not null.
   2. current_app_role() is editor or admin.
   3. target is not null and the profile exists.
   4. target's role is reader or contributor. If it is already contributor, return.
      supporter, editor, and admin raise 'role not grantable'.
   5. Update profiles.role to contributor.
   6. Insert audit_log: action 'role.contributor', entity_type 'profile', entity_id target,
      metadata old_role and new_role, actor_id auth.uid(), site_id from the target profile.
   REVOKE ALL from public, anon, authenticated. GRANT EXECUTE to authenticated.
   Do not change set_user_role.

   supabase/tests/0004_contributors.sql, one transaction, rolled back, same session style as
   supabase/tests/0002_rls.sql:
   - a contributor inserts a draft with created_by = themselves and an author row for themselves
   - a contributor cannot insert status published
   - a contributor cannot update another person's draft
   - a contributor cannot update their own draft to published, scheduled, or in_review
   - a contributor cannot update a row once its status is submitted
   - moving their draft to submitted raises when they have no disclosure, and succeeds after one exists
   - anon can insert an application with status pending, and cannot select applications
   - anon article_bylines returns the disclosure for a published article and no rows for a draft
   - an editor grant_contributor turns a reader into a contributor and raises for an editor target
   - a contributor calling grant_contributor raises

2. /write-for-us
   Public server page plus a small client widget for the Turnstile token.
   Fields: name, email, bio, affiliations, sample links. Zod limits: name 120, email 254,
   bio 2000, affiliations 2000, sample_links 2000.
   Server action, no session required:
   - Refuse when TURNSTILE_SECRET_KEY is unset.
   - POST the token to https://challenges.cloudflare.com/turnstile/v0/siteverify.
     Reject a failed verification.
   - Reject when this lower(email) already has 3 applications in the last 24 hours,
     or an existing pending row.
   - Insert with the anon server client, status pending, site_id of slug eyetoday.
   - Show a generic success message. Do not echo the database error.

   Env: NEXT_PUBLIC_TURNSTILE_SITE_KEY and TURNSTILE_SECRET_KEY, both blank in .env.example.
   Comment the Cloudflare always-pass test keys for local .env.local only. Do not put those
   test keys in as committed defaults.
   The widget's site key is the only Turnstile value that may reach the browser.

3. /admin/applications
   Editor and admin, behind the existing admin layout. Add an "Applications" sidebar link.
   List pending first. Approve and reject are server actions:
   getUser() on the user-scoped client, require editor or admin on that same client, zod, then write.
   Approve: inviteUserByEmail via createAdminClient(), redirectTo ${origin}/auth/callback?next=%2Fcontribute.
   Do not put a role in user_metadata. The signup trigger still creates a reader profile.
   Then grant_contributor with the new user's id, as the signed-in editor, on the user-scoped client.
   If invite returns email_exists, resolve the id with profile_id_for_email and grant_contributor
   only when that profile is a reader or already a contributor.
   Set the application status to approved and reviewed_by to auth.uid().
   Reject: status rejected, reject_reason required (max 500). No email on reject.
   Map raised errors to short form text. Do not render raw SQL.

4. /contribute
   Replace the placeholder. requireArea("contribute") stays, so readers still go to /account
   and signed-out people still go to /login.
   Contributor actions require role contributor. An editor or admin opening /contribute sees
   a link to /admin and no contributor save button.
   Pages: the dashboard (draft, submitted, in_review, scheduled, published), /contribute/new,
   /contribute/[id], and /contribute/disclosure.
   Dashboard lists only articles the caller authors, through the user-scoped client.
   Show the latest unresolved editorial note on each row.

   Disclosure page: one textarea, upsert on profile_id. "No affiliations" is accepted.
   Empty or whitespace is refused. Store it on disclosures. Do not copy the application affiliations in.

   Reuse ArticleEditor with a mode prop, default "editor", so the admin pages stay as they are.
   Contributor mode hides Publish, Schedule, Unpublish, the sponsored fields, the author picker,
   the hero picker, image insert, and Restore. The author is the signed-in contributor.
   Buttons stay disabled until the editor has loaded. Save and Submit for review call a new
   action in src/app/contribute/actions.ts, intents "save" and "submit" only.
   That action: getUser(), require role contributor, zod, renderArticleHtml from the existing
   server renderer (the browser HTML is never stored), write with the user-scoped client.
   On create, set created_by and insert the single article_authors row. If the author insert
   fails, return an error and do not report success.
   Save keeps status draft. Submit sets status submitted, and only from a current draft.
   Submit loads the caller's disclosure first and returns a field error that links to
   /contribute/disclosure when it is missing. The database trigger is the backstop.
   Slug conflicts use the same form error as the editor (23505).
   Sponsored is always false. Ignore any client attempt to send publish, schedule, or unpublish.
   After a successful submit, call editor_emails() and send the mail described below.
   Keep getEditorContext on saveArticle and restoreRevision.

5. /admin/review
   Editor and admin. Add a "Review" sidebar link.
   Queue: status submitted or in_review, newest first.
   Open a story to read the sanitized body, the byline, the disclosure, and the note thread.
   Actions, each its own server action with getUser() and an editor or admin check:
   - Start review: submitted → in_review.
   - Request changes: submitted or in_review → draft, and insert an editorial_notes row
     with the editor's id, the note body, resolved false. Note body required, max 4000.
   - Approve & schedule: submitted or in_review → scheduled, with a future scheduled_for.
     Same past-time rejection as the editor.
   - Publish: submitted or in_review → published, published_at = now().
   Use the user-scoped client. Do not call publish_due_articles or the service role.
   After publish, revalidatePath('/articles', 'layout').
   Request changes emails the authors. Publish emails the authors. Schedule does not.

6. Live article
   /articles/[slug] stays force-dynamic and keeps the anon client for the article row.
   Also call article_bylines with that client and render each display name and disclosure
   under the dek. An author with no disclosure shows the name and the line "No disclosure on file."
   Escape text. Do not render disclosure HTML.

7. Mail
   src/lib/email/resend.ts, server-only. RESEND_API_KEY and RESEND_FROM in .env.example, blank.
   Send only after the database write has succeeded.
   If the key or from-address is missing, or Resend returns an error, keep the status change
   and include a short warning in the action result. Log the failure without the key.
   Submitted: to editor_emails(), subject that a story was submitted, text body with the title.
   Changes requested: to each author email the editor can read on profiles, including the note text
   as plain text. Published: to those authors, with the title.
   Do not put RESEND_API_KEY or TURNSTILE_SECRET_KEY in a NEXT_PUBLIC_ variable.

8. Tests and checks
   npm run lint, npm run typecheck, npm run build with the CI placeholder Supabase env.
   The SQL file is a local check: supabase db reset, then psql of supabase/tests/0004_contributors.sql.
   CI does not boot Supabase.

Verify: contributor submits → editor requests changes → contributor resubmits → editor publishes;
the disclosure shows on /articles/[slug] while signed out.
A contributor session has no Publish button, and the SQL test shows they cannot set status published.
Branch: sprint-3-contributors
```
