-- Seed for local development (applied by `supabase db reset`).
-- Fixed UUIDs + ON CONFLICT DO NOTHING so repeated runs are safe.

insert into public.sites (id, name, slug)
values ('00000000-0000-4000-8000-000000000001', 'Eye Today', 'eyetoday')
on conflict do nothing;

insert into public.sections (id, site_id, slug, name, sort, color, icon)
values
  ('00000000-0000-4000-8000-000000000101', '00000000-0000-4000-8000-000000000001', 'news', 'News', 10, '#1E5B4A', 'news'),
  ('00000000-0000-4000-8000-000000000102', '00000000-0000-4000-8000-000000000001', 'research-science', 'Research & Science', 20, '#2F6FA3', 'research'),
  ('00000000-0000-4000-8000-000000000103', '00000000-0000-4000-8000-000000000001', 'policy-law', 'Policy & Law', 30, '#6B4C9A', 'policy'),
  ('00000000-0000-4000-8000-000000000104', '00000000-0000-4000-8000-000000000001', 'treatment-clinics', 'Treatment & Clinics', 40, '#A9472F', 'treatment'),
  ('00000000-0000-4000-8000-000000000105', '00000000-0000-4000-8000-000000000001', 'stories', 'Stories', 50, '#976912', 'stories'),
  ('00000000-0000-4000-8000-000000000106', '00000000-0000-4000-8000-000000000001', 'opinion', 'Opinion', 60, '#3F3F46', 'opinion')
on conflict do nothing;

-- The site row is inserted above, after migrations, so 0012's update matches nothing on a fresh reset.
update public.sections set color = '#1E5B4A', icon = 'news' where id = '00000000-0000-4000-8000-000000000101' and color is null;
update public.sections set color = '#2F6FA3', icon = 'research' where id = '00000000-0000-4000-8000-000000000102' and color is null;
update public.sections set color = '#6B4C9A', icon = 'policy' where id = '00000000-0000-4000-8000-000000000103' and color is null;
update public.sections set color = '#A9472F', icon = 'treatment' where id = '00000000-0000-4000-8000-000000000104' and color is null;
update public.sections set color = '#976912', icon = 'stories' where id = '00000000-0000-4000-8000-000000000105' and color is null;
update public.sections set color = '#3F3F46', icon = 'opinion' where id = '00000000-0000-4000-8000-000000000106' and color is null;

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

-- Newsletter lists. 0008 seeds these for sites that already exist; on a fresh reset the
-- site above is created after the migrations run, so seed them here too.
insert into public.newsletter_lists (site_id, slug, name, description)
values
  ('00000000-0000-4000-8000-000000000001', 'daily', 'Daily Brief', 'The day''s stories, once a day.'),
  ('00000000-0000-4000-8000-000000000001', 'weekly', 'Weekly Roundup', 'The week''s best reading, once a week.')
on conflict (site_id, slug) do nothing;

-- Ad slots. 0010 seeds these for sites that already exist; on a fresh reset the site above
-- is created after the migrations run, so seed them here too.
insert into public.ad_slots (site_id, key, name, width, height)
values
  ('00000000-0000-4000-8000-000000000001', 'leaderboard', 'Leaderboard', 728, 90),
  ('00000000-0000-4000-8000-000000000001', 'bigbox-1', 'Big box 1', 300, 250),
  ('00000000-0000-4000-8000-000000000001', 'bigbox-2', 'Big box 2', 300, 250),
  ('00000000-0000-4000-8000-000000000001', 'in-river', 'In river', 640, 120),
  ('00000000-0000-4000-8000-000000000001', 'in-article', 'In article', 640, 250)
on conflict (site_id, key) do nothing;

-- Membership. 0009 seeds these for sites that already exist; on a fresh reset the site above is
-- created after the migrations run, so seed them here too. Amounts are CAD cents.
insert into public.newsletter_lists (site_id, slug, name, description)
values ('00000000-0000-4000-8000-000000000001', 'supporters', 'Supporters newsletter', 'A note for readers who fund Eye Today.')
on conflict (site_id, slug) do nothing;

insert into public.membership_tiers (site_id, slug, name, description, price_cents, interval)
values
  ('00000000-0000-4000-8000-000000000001', 'monthly', 'Monthly supporter', 'Keeps reporting on addiction and recovery free for everyone to read.', 800, 'month'),
  ('00000000-0000-4000-8000-000000000001', 'annual', 'Annual supporter', 'A full year of support, and two months free compared with monthly.', 8000, 'year'),
  ('00000000-0000-4000-8000-000000000001', 'once', 'One-time gift', 'A single contribution toward the next investigation.', 2500, 'once')
on conflict (site_id, slug) do nothing;

-- Directory. 0013 seeds these for sites that already exist; on a fresh reset the site
-- above is created after the migrations run, so seed them here too. Legal rows are
-- empty drafts: do not write a summary.
insert into public.directory_categories (site_id, slug, name, sort)
values
  ('00000000-0000-4000-8000-000000000001', 'treatment-clinic', 'Treatment clinic / retreat', 10),
  ('00000000-0000-4000-8000-000000000001', 'medical-practitioner', 'Medical practitioner', 20),
  ('00000000-0000-4000-8000-000000000001', 'integration-coach', 'Integration coach / therapist', 30),
  ('00000000-0000-4000-8000-000000000001', 'harm-reduction', 'Harm-reduction service', 40),
  ('00000000-0000-4000-8000-000000000001', 'peer-support', 'Peer support group', 50),
  ('00000000-0000-4000-8000-000000000001', 'research-organisation', 'Research organisation', 60),
  ('00000000-0000-4000-8000-000000000001', 'advocacy-group', 'Advocacy group', 70)
on conflict (site_id, slug) do nothing;

insert into public.country_legal_status (site_id, country_code, title, summary_html, sources, status)
values
  ('00000000-0000-4000-8000-000000000001', 'MX', '', '', '[]'::jsonb, 'draft'),
  ('00000000-0000-4000-8000-000000000001', 'CR', '', '', '[]'::jsonb, 'draft'),
  ('00000000-0000-4000-8000-000000000001', 'PT', '', '', '[]'::jsonb, 'draft'),
  ('00000000-0000-4000-8000-000000000001', 'NL', '', '', '[]'::jsonb, 'draft'),
  ('00000000-0000-4000-8000-000000000001', 'BR', '', '', '[]'::jsonb, 'draft'),
  ('00000000-0000-4000-8000-000000000001', 'CA', '', '', '[]'::jsonb, 'draft'),
  ('00000000-0000-4000-8000-000000000001', 'US', '', '', '[]'::jsonb, 'draft'),
  ('00000000-0000-4000-8000-000000000001', 'ZA', '', '', '[]'::jsonb, 'draft'),
  ('00000000-0000-4000-8000-000000000001', 'NZ', '', '', '[]'::jsonb, 'draft'),
  ('00000000-0000-4000-8000-000000000001', 'GB', '', '', '[]'::jsonb, 'draft')
on conflict (site_id, country_code) do nothing;
