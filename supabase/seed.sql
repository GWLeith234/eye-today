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
  ('00000000-0000-4000-8000-000000000001', 'mobile-banner', 'Mobile banner', 320, 50),
  ('00000000-0000-4000-8000-000000000001', 'bigbox-1', 'Big box 1', 300, 250),
  ('00000000-0000-4000-8000-000000000001', 'bigbox-2', 'Big box 2', 300, 250),
  ('00000000-0000-4000-8000-000000000001', 'in-river', 'In-feed leaderboard', 728, 90),
  ('00000000-0000-4000-8000-000000000001', 'in-article', 'In-article rectangle', 300, 250),
  ('00000000-0000-4000-8000-000000000001', 'half-page', 'Half page', 300, 600)
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

-- One published listing so the public listing page can be opened in local checks.
-- NZ keeps it out of the MX search assertions in supabase/tests/0013_directory.sql.
insert into public.directory_listings (
  id, site_id, category_id, slug, name, country_code, city, services, description,
  status, verification_level, verification_note
)
select
  '00000000-0000-4000-8000-000000000301',
  '00000000-0000-4000-8000-000000000001',
  c.id,
  'zed-clinic',
  'Zed Clinic',
  'NZ',
  'Wellington',
  array['retreat'],
  'A seeded clinic so the listing page can be opened.',
  'published',
  'listed',
  'Seeded for local checks.'
from public.directory_categories c
where c.site_id = '00000000-0000-4000-8000-000000000001'
  and c.slug = 'treatment-clinic'
on conflict (id) do nothing;

-- House ads (0023 seeds these for existing sites; on a fresh reset the site is created above, so seed them here too).
with site as (select id from public.sites where slug = 'eyetoday'),
camp as (
  insert into public.ad_campaigns (site_id, advertiser_name, name, status, is_house)
  select site.id, 'Eye Today', 'House ads', 'active', true from site
   where not exists (select 1 from public.ad_campaigns h where h.site_id = site.id and h.is_house)
  returning id, site_id
),
slot as (select id, key, width, height from public.ad_slots where site_id = (select id from site))
insert into public.ad_creatives (site_id, campaign_id, slot_id, click_url, alt, html, status, weight)
select camp.site_id, camp.id, slot.id, v.click_url, v.alt,
       '<a href="' || v.click_url || '"><img src="https://theeye.today/house-ads/' || slot.key || '-' || slot.width || 'x' || slot.height || '.png" alt="' || v.alt || '"></a>',
       'approved', 1
  from camp
  cross join (values
    ('leaderboard', 'https://theeye.today/editions', 'Read the monthly edition'),
    ('mobile-banner', 'https://theeye.today/newsletter', 'Get the newsletter'),
    ('bigbox-1', 'https://theeye.today/directory/submit', 'List your clinic in the directory'),
    ('bigbox-2', 'https://theeye.today/support', 'Support independent reporting'),
    ('in-river', 'https://theeye.today/advertise', 'Advertise with Eye Today'),
    ('in-article', 'https://theeye.today/newsletter', 'Get the newsletter'),
    ('half-page', 'https://theeye.today/tracker', 'Trials & Funding Tracker')
  ) as v(slot_key, click_url, alt)
  join slot on slot.key = v.slot_key;

-- Tracker (0025 seeds these for existing sites; on a fresh reset the site is created above, so seed them here too).
insert into public.tracker_entries (site_id, slug, kind, title, sponsor, stage, amount, jurisdiction, key_dates, links, notes, last_reviewed, status, sort)
select s.id, v.slug, v.kind, v.title, v.sponsor, v.stage, v.amount, v.jurisdiction, v.key_dates::jsonb, v.links::jsonb, v.notes, v.last_reviewed::date, 'published', v.sort
  from public.sites s
  cross join (values
    ('stanford-veterans-ibogaine-study', 'trial', 'Stanford veterans ibogaine study (MISTIC)', 'Stanford Medicine', 'Published; follow-up ongoing', '', 'United States / Mexico',
     '[{"label":"Results published","date":"2024-01-05"}]',
     '[{"title":"Nature Medicine paper","url":"https://www.nature.com/articles/s41591-023-02705-w"}]',
     'Thirty special-operations veterans treated with magnesium-ibogaine at a clinic in Mexico; the study reported improvements in disability, PTSD, depression and anxiety at one month.', '2026-10-11', 10),
    ('texas-sb-2308-ibogaine-programme', 'funding', 'Texas SB 2308 ibogaine clinical-trial programme', 'State of Texas', 'Enacted; grants in progress', 'USD 50 million', 'Texas, United States',
     '[{"label":"Signed into law","date":"2025-06-11"}]',
     '[{"title":"Texas Legislature Online","url":"https://capitol.texas.gov/BillLookup/History.aspx?LegSess=89R&Bill=SB2308"}]',
     'State funding for FDA-regulated ibogaine trials run with Texas institutions, matched by private money. The state keeps a share of any drug-development revenue.', '2026-10-11', 10),
    ('arpa-h-ascent-ibo', 'funding', 'ARPA-H ASCENT-IBO', 'ARPA-H', 'Programme announced', '', 'United States',
     '[]',
     '[{"title":"ARPA-H","url":"https://arpa-h.gov/"}]',
     'Federal programme aimed at ibogaine-based treatments for addiction and traumatic brain injury.', '2026-10-11', 20),
    ('fda-ibogaine-rfi-2026', 'regulatory', 'FDA request for information on ibogaine trial design', 'U.S. Food and Drug Administration', 'Open for comment', '', 'United States',
     '[{"label":"Comments close","date":"2026-11-20"}]',
     '[{"title":"Docket FDA-2026-N-10429","url":"https://www.regulations.gov/docket/FDA-2026-N-10429"}]',
     'The agency is asking how ibogaine trials should be designed and monitored, including cardiac safety.', '2026-10-11', 10),
    ('nimh-rapids-forecast', 'funding', 'NIMH RAPIDs funding opportunity (forecast)', 'National Institute of Mental Health', 'Forecast', '', 'United States',
     '[]',
     '[{"title":"NIMH funding","url":"https://www.nimh.nih.gov/funding"}]',
     'Rapid-acting psychedelic and dissociative treatments research; ibogaine-relevant work expected to be eligible.', '2026-10-11', 30),
    ('nida-oud-funding', 'funding', 'NIDA opioid-use-disorder medication development funding', 'National Institute on Drug Abuse', 'Open', '', 'United States',
     '[]',
     '[{"title":"NIDA funding","url":"https://nida.nih.gov/funding"}]',
     'Standing programmes for new OUD medications under which ibogaine analogues have been funded.', '2026-10-11', 40),
    ('noribogaine-ind-alcohol-use-disorder', 'trial', 'Noribogaine IND — alcohol use disorder', 'DemeRx / industry', 'IND stage', '', 'United States',
     '[]',
     '[{"title":"ClinicalTrials.gov","url":"https://clinicaltrials.gov/"}]',
     'Noribogaine, the main metabolite of ibogaine, being developed for alcohol use disorder.', '2026-10-11', 20)
  ) as v (slug, kind, title, sponsor, stage, amount, jurisdiction, key_dates, links, notes, last_reviewed, sort)
on conflict (site_id, slug) do nothing;
