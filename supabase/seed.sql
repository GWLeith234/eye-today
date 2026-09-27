-- Seed for local development (applied by `supabase db reset`).
-- Fixed UUIDs + ON CONFLICT DO NOTHING so repeated runs are safe.

insert into public.sites (id, name, slug)
values ('00000000-0000-4000-8000-000000000001', 'Eye Today', 'eyetoday')
on conflict do nothing;

insert into public.sections (id, site_id, slug, name, sort)
values
  ('00000000-0000-4000-8000-000000000101', '00000000-0000-4000-8000-000000000001', 'news', 'News', 10),
  ('00000000-0000-4000-8000-000000000102', '00000000-0000-4000-8000-000000000001', 'research-science', 'Research & Science', 20),
  ('00000000-0000-4000-8000-000000000103', '00000000-0000-4000-8000-000000000001', 'policy-law', 'Policy & Law', 30),
  ('00000000-0000-4000-8000-000000000104', '00000000-0000-4000-8000-000000000001', 'treatment-clinics', 'Treatment & Clinics', 40),
  ('00000000-0000-4000-8000-000000000105', '00000000-0000-4000-8000-000000000001', 'stories', 'Stories', 50),
  ('00000000-0000-4000-8000-000000000106', '00000000-0000-4000-8000-000000000001', 'opinion', 'Opinion', 60)
on conflict do nothing;

insert into public.articles (
  id, site_id, section_id, slug, title, dek, body_html, status, published_at
)
values (
  '00000000-0000-4000-8000-000000000201',
  '00000000-0000-4000-8000-000000000001',
  '00000000-0000-4000-8000-000000000101',
  'welcome-to-eye-today',
  'Welcome to Eye Today',
  'A new home for news, research and stories about eye health.',
  '<p>Eye Today covers the research, policy, treatment and people shaping how the world sees.</p>',
  'published',
  now() - interval '1 hour'
)
on conflict do nothing;
