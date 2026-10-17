-- Takeover creatives for the launch advertisers, run in the SQL editor AFTER migration 0029 (it needs the
-- billboard and skin slots). Idempotent: a creative that already exists for the campaign and slot is skipped.
--
-- Billboards for OZCast and Shadow Warriors Project (rendered by scripts/advertiser-ads/render.mjs); the
-- Shadow Warriors skin makes them the launch takeover. The house billboard (0029) fills the band whenever
-- neither is picked.

insert into public.ad_creatives (site_id, campaign_id, slot_id, click_url, alt, html, status, weight, category)
select g.site_id, g.id, s.id, v.click_url, v.alt,
       '<a href="' || v.click_url || '"><img src="https://theeye.today/advertiser-ads/' || v.file || '" alt="' || v.alt || '"></a>',
       'approved', 1, v.category
  from (values
    ('Shadow Warriors Project — run of site', 'billboard', 'shadow-warriors-billboard-970x250.png',
     'https://shadowwarriorsproject.org/?utm_source=theeye&utm_medium=display&utm_campaign=swp&utm_content=billboard',
     'Shadow Warriors Project — help a warrior', 'advocacy'),
    ('Shadow Warriors Project — run of site', 'skin', 'shadow-warriors-skin-1920x1400.jpg',
     'https://shadowwarriorsproject.org/?utm_source=theeye&utm_medium=display&utm_campaign=swp&utm_content=skin',
     'Shadow Warriors Project — help a warrior', 'advocacy'),
    ('OZCast launch — run of site', 'billboard', 'ozcast-billboard-970x250.png',
     'https://markgeist.com/?utm_source=theeye&utm_medium=display&utm_campaign=ozcast&utm_content=billboard',
     'OZCast with Mark “Oz” Geist — coming soon', 'other')
  ) as v(campaign, slot, file, click_url, alt, category)
  join public.ad_campaigns g on g.name = v.campaign
  join public.ad_slots s on s.site_id = g.site_id and s.key = v.slot
 where not exists (select 1 from public.ad_creatives c where c.campaign_id = g.id and c.slot_id = s.id);

select g.name, s.key, c.status from public.ad_creatives c join public.ad_campaigns g on g.id = c.campaign_id join public.ad_slots s on s.id = c.slot_id
 where s.key in ('billboard', 'skin') order by g.name, s.key;
