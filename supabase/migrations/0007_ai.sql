-- 0007_ai.sql — AI assistant suggestions.
--
-- ai_suggestions is the audit record for the assistant: which model and prompt
-- version produced what, who asked, and who accepted it. Editors and admins
-- only. Rows hold draft text, so anon has no access. There is no delete policy.
-- Accepting a suggestion never edits the article; the editor still saves it.

create table public.ai_suggestions (
  id uuid primary key default gen_random_uuid(),
  site_id uuid not null references public.sites (id) on delete cascade,
  article_id uuid not null references public.articles (id) on delete cascade,
  kind text not null check (kind in ('headlines', 'dek', 'seo', 'tags', 'copy_edit', 'claims', 'summary')),
  prompt_version text not null,
  model text not null,
  input_hash text not null,
  output_json jsonb not null,
  requested_by uuid not null references public.profiles (id) on delete restrict,
  accepted_by uuid references public.profiles (id) on delete set null,
  accepted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (accepted_at is null or accepted_by is not null)
);
create index ai_suggestions_requested_by_idx on public.ai_suggestions (requested_by, created_at desc);
create index ai_suggestions_article_id_idx on public.ai_suggestions (article_id, created_at desc);
create index ai_suggestions_site_id_idx on public.ai_suggestions (site_id);

create trigger set_updated_at
  before update on public.ai_suggestions
  for each row execute function public.set_updated_at();

alter table public.ai_suggestions enable row level security;
alter table public.ai_suggestions force row level security;
revoke all on table public.ai_suggestions from anon, authenticated;
grant select, insert on table public.ai_suggestions to authenticated;
grant update (accepted_by, accepted_at) on table public.ai_suggestions to authenticated;

create policy "editors read ai suggestions"
  on public.ai_suggestions for select to authenticated
  using ((select public.current_app_role()) in ('editor', 'admin'));

create policy "editors insert own ai suggestions"
  on public.ai_suggestions for insert to authenticated
  with check (
    (select public.current_app_role()) in ('editor', 'admin')
    and requested_by = (select auth.uid())
  );

-- A suggestion can be accepted once, by the editor doing the accepting.
create policy "editors accept ai suggestions"
  on public.ai_suggestions for update to authenticated
  using (
    (select public.current_app_role()) in ('editor', 'admin')
    and accepted_by is null
  )
  with check (
    (select public.current_app_role()) in ('editor', 'admin')
    and accepted_by = (select auth.uid())
    and accepted_at is not null
  );
