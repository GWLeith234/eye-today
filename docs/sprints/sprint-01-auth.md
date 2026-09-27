# Sprint 1 — Auth, roles & RLS

**Goal:** People can sign in (magic link, optional Google), every profile has a role, and the
database enforces what each role may read and write. Proxy and server layouts route people by role.

**Definition of done:** sign in as a contributor and visit `/admin`; the response is a redirect to
`/contribute`. A direct API update of another user's draft does not change that row.

## Build prompt

```
SPRINT 1 — Auth, roles & RLS
SESSION HEADER — Eye Today
You are working on Eye Today — a Next.js 16 (App Router, TypeScript, Tailwind) news portal
on Supabase (Postgres/Auth/Storage), deployed on Railway. Repo: eye-today. Branch main already
has Sprint 0. Read docs/sprints/sprint-01-auth.md if it is present; otherwise use this prompt.
There is no master index. Do not invent later sprints.
Rules:
- Work only within this sprint. Create branch sprint-1-auth before changing anything.
  If the environment assigns another branch, also push HEAD to sprint-1-auth.
- New SQL goes in supabase/migrations/0002_rls.sql only. Never edit 0001_core.sql.
- Every new table has site_id, created_at, updated_at, RLS enabled and forced.
- After each new table: REVOKE ALL FROM anon, authenticated, then GRANT only what the policies use.
- Also run, for objects created later:
  ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON TABLES FROM anon, authenticated;
  and the same for SEQUENCES and FUNCTIONS.
- Never commit secrets. New env names go in .env.example with blank values.
- The service-role key stays in src/lib/supabase/admin.ts. Do not import that module from proxy.ts,
  client components, or the profile-edit action.
- Run npm run lint, npm run typecheck, and npm run build before committing.
- Do not install TipTap, Resend, Stripe, or the Anthropic SDK.
- End with what changed, files touched, and how to verify.

1. Auth UI
   - src/app/login/page.tsx: email magic link (signInWithOtp) and a Google button (signInWithOAuth provider google).
     Redirect target is `${origin}/auth/callback`. Validate with zod.
   - src/app/auth/callback/route.ts: exchangeCodeForSession, then redirect to a relative `next` path.
     Reject values that do not start with a single "/" or that start with "//".
   - src/lib/supabase/server.ts and browser.ts using @supabase/ssr.
     Server cookies() is async. Browser client is the only client component data path.
   - src/proxy.ts next to src/app. Export async function proxy(request: NextRequest).
     Do not export runtime. Use createServerClient, auth.getUser(), and copy refreshed cookies
     onto every NextResponse, including redirects.
     Rank: reader = supporter < contributor < editor < admin.
     Signed-out users hitting /account, /contribute, or /admin go to /login.
     A contributor hitting /admin goes to /contribute.
     A reader or supporter hitting /contribute or /admin goes to /account.
     Editor and admin may open /admin. Anyone signed in may open /account.
     Matcher excludes _next/static, _next/image, and files with an extension. /api/health stays public.
   - Repeat the same checks in the server layouts. Proxy is not the only guard.
   - Google credentials and the hosted redirect allow list are a human dashboard step.
     Magic link must work without Google. Document the callback URLs:
     http://127.0.0.1:3000/auth/callback and the Railway origin + /auth/callback.
     Add http://127.0.0.1:3000 to supabase/config.toml additional_redirect_urls.

2. Signup trigger, in 0002_rls.sql
   - public.handle_new_user() AFTER INSERT ON auth.users, SECURITY DEFINER, SET search_path = ''.
   - Insert profiles (id, site_id, display_name, role) with role 'reader' and site_id of the row
     where slug = 'eyetoday'. Ignore raw_user_meta_data.role. display_name comes from full_name,
     name, or the email local-part.
   - REVOKE ALL on the function FROM public, anon, authenticated.
   - GRANT EXECUTE to supabase_auth_admin. Do not grant it to authenticated.

3. Helpers, same migration
   - public.current_app_role() returns public.app_role, no arguments, SECURITY DEFINER,
     SET search_path = ''. It reads profiles.role for auth.uid() and returns null when there is no user.
   - public.is_article_author(article uuid) returns boolean, same definer settings.
     True only when article_authors has (article, auth.uid()).
   - REVOKE ALL from public and anon. GRANT EXECUTE to authenticated.

4. Article policies. Do not drop "published articles are publicly readable".
   - GRANT SELECT, UPDATE on public.articles to authenticated. No INSERT, no DELETE, no extra grant to anon.
   - Contributors may SELECT and UPDATE a row when status is draft or submitted
     AND is_article_author(id). USING and WITH CHECK both require that status. They cannot publish.
   - Editors and admins may SELECT and UPDATE every article.

5. Related tables
   - ALTER public.media ADD COLUMN owner_id uuid references public.profiles(id) on delete set null.
   - Contributors SELECT/INSERT/UPDATE media they own. Editors and admins SELECT/INSERT/UPDATE all media.
     No public read. No DELETE.
   - article_revisions: contributors SELECT and INSERT rows whose author_id is auth.uid()
     and whose article they author. No UPDATE. Editors and admins SELECT and INSERT any revision.
   - disclosures: a user SELECT/INSERT/UPDATE rows with their profile_id. Editors and admins SELECT/INSERT/UPDATE all.
   - profiles: GRANT SELECT and GRANT UPDATE (display_name, bio, avatar_url) to authenticated.
     Policies: SELECT and UPDATE own row (id = auth.uid()).
     Trigger profiles_lock_role rejects a role change unless current_app_role() is admin.
   - public.set_user_role(target uuid, new_role public.app_role)
     returns void
     language plpgsql
     security definer
     set search_path = ''
     The body must do all of the following, in this order, and raise if any check fails.
     Do not add a boolean argument for "caller is admin". The database decides.
     1. auth.uid() is not null. A service-role call has no uid and must fail.
     2. public.current_app_role() = 'admin'. Contributors, editors, readers, and supporters fail.
     3. target is not null and new_role is not null.
     4. target <> auth.uid(). An admin cannot change their own role, including demoting themselves.
        Another admin has to do it.
     5. The target profile exists. If it does not, raise 'profile not found' and do not insert one.
        Profile creation belongs only to handle_new_user().
     6. If the target's current role is admin and new_role is not admin, count other admins.
        If that count is 0, raise 'last admin'. The project must keep one admin.
     7. If the current role already equals new_role, return without writing.
     8. Update public.profiles.role for that target.
     9. Insert one public.audit_log row:
        site_id = the target profile's site_id,
        actor_id = auth.uid(),
        action = 'role.set',
        entity_type = 'profile',
        entity_id = target,
        metadata = jsonb with old_role and new_role.
        This insert runs as the definer, so it does not need an insert policy.
     REVOKE ALL on the function FROM public, anon, authenticated.
     GRANT EXECUTE ON FUNCTION public.set_user_role(uuid, public.app_role) TO authenticated.
     Do not GRANT INSERT, UPDATE, or SELECT on audit_log to anon or authenticated.
     The profiles_lock_role trigger still rejects a direct UPDATE of profiles.role
     unless current_app_role() is admin. set_user_role is the only supported way to change a role.
     Call it with the admin's user-scoped client, never the service role, so auth.uid() is the admin.
     The service role is only for inviteUserByEmail.

6. Admin and account UI
   - Routes, not the empty src/app/(admin) group:
     src/app/contribute/page.tsx
     src/app/admin/page.tsx
     src/app/admin/users/page.tsx
     src/app/account/page.tsx
   - Server layouts repeat the proxy rules. Proxy is not the only guard.
   - /contribute is a server page for contributor, editor, and admin. It says the contributor desk is not built yet. No article form.
   - /admin is a server page for editor and admin. It links to /admin/users only when the caller is admin.
   - /admin/users is admin only. One query lists id, display_name, and role.
     Invite form: email plus a role. Server action:
       getUser() on the user-scoped client,
       require current role admin on that same client,
       validate email and role with zod (role is one of reader, supporter, contributor, editor, admin),
       inviteUserByEmail from src/lib/supabase/admin.ts (the only service-role call),
       then, still as the signed-in admin, rpc public.set_user_role with the new user's id and the chosen role.
     The signup trigger has already inserted a reader profile. Do not pass a role in invite user_metadata.
     Show the function's raised errors as form text. Do not render raw SQL.
   - /account is any signed-in user. Show display_name, bio, and role. Role is read-only text, not an input.
     Newsletter prefs and membership are placeholders with no tables and no writes.
     Profile-edit server action: getUser(), then update only that caller's display_name and bio
     through the user-scoped client. It must not send a role column.
     Avatar: storage bucket avatars, path {userId}/avatar, jpeg png or webp, max 2 MB, no SVG.
     Create the bucket in 0002 as public read.
     storage.objects INSERT, UPDATE, and DELETE policies: bucket_id = 'avatars'
     and the first folder equals auth.uid()::text.

7. Test
   - supabase/tests/0002_rls.sql, run after supabase db reset on the local stack.
   - Create two auth users. The trigger makes reader profiles. Set both roles to contributor
     by updating as the table owner (the trigger allows the owner; the test is not going through set_user_role).
   - Insert two drafts. Add each user as the only author of one draft.
   - Set the JWT subject to contributor A and the role to authenticated.
     Update B's draft title. As the table owner, assert B's title is unchanged.
     Update A's own draft and assert it changed.
   - Assert A cannot set A's draft status to published.
   - Assert A calling set_user_role raises because A is not an admin.
   - As an admin session, assert set_user_role(admin's own id, 'reader') raises,
     and assert set_user_role on the other admin raises when that would leave zero admins.
   - npm run lint, npm run typecheck, and npm run build must pass with the CI placeholder env.
     CI does not need to boot Supabase in this sprint. Commit the SQL file and document
     `supabase db reset` then `psql` of that file as the local RLS check.

Verify: a contributor opening /admin lands on /contribute.
The SQL test shows the other contributor's draft is unchanged, and set_user_role refuses
non-admins, self-changes, and removal of the last admin.
npm run lint, npm run typecheck, and npm run build pass.
Branch: sprint-1-auth
```
