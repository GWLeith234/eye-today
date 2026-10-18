-- Shadow Warriors Project store creatives — run in the SQL editor AFTER migration 0029 (it needs the billboard
-- slot) and after takeover_creatives.sql. Idempotent: re-running adds nothing.
--
-- A second creative per unit in the existing Shadow Warriors campaign, pointing at their own shop
-- (shadowwarriorsproject.org/store) with the real products and prices rather than the donate page. The two
-- sets rotate evenly, so roughly half of Shadow Warriors' impressions now carry merchandise.
--
-- The per-unit lock in 0024 only binds self-serve uploads with a media_id; these are editor-loaded HTML
-- creatives, so a second one per unit is allowed.

insert into public.ad_creatives (site_id, campaign_id, slot_id, click_url, alt, html, status, weight, category)
select g.site_id, g.id, s.id,
       'https://shadowwarriorsproject.org/store/?utm_source=theeye&utm_medium=display&utm_campaign=swp-store&utm_content=' || v.slot,
       'Shadow Warriors Project store',
       '<a href="https://shadowwarriorsproject.org/store/?utm_source=theeye&utm_medium=display&utm_campaign=swp-store&utm_content=' || v.slot ||
         '"><img src="https://theeye.today/advertiser-ads/shadow-warriors-store-' || v.file || '" alt="Shadow Warriors Project store"></a>',
       'approved', 1, 'advocacy'
  from (values
    ('billboard', 'billboard-970x250.png'),
    ('leaderboard', 'leaderboard-728x90.png'),
    ('in-river', 'leaderboard-728x90.png'),
    ('bigbox-1', 'bigbox-300x250.png'),
    ('bigbox-2', 'bigbox-300x250.png'),
    ('in-article', 'bigbox-300x250.png'),
    ('half-page', 'half-page-300x600.png'),
    ('mobile-banner', 'mobile-320x50.png')
  ) as v(slot, file)
  join public.ad_campaigns g on g.name = 'Shadow Warriors Project — run of site'
  join public.ad_slots s on s.site_id = g.site_id and s.key = v.slot
 where not exists (
   select 1 from public.ad_creatives c
    where c.campaign_id = g.id and c.slot_id = s.id and c.click_url like '%utm_campaign=swp-store%'
 );

select s.key, count(*) as creatives
  from public.ad_creatives c
  join public.ad_campaigns g on g.id = c.campaign_id and g.name = 'Shadow Warriors Project — run of site'
  join public.ad_slots s on s.id = c.slot_id
 group by s.key order by s.key;
