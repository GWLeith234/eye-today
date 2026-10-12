-- 0026_iab_ad_units.sql — every unit an IAB standard size, plus the half page.
--
-- The in-river and in-article units were house-made sizes (640×120, 640×250) that no advertiser has artwork for.
-- They become the in-feed leaderboard (728×90) and the medium rectangle (300×250). A half page (300×600) joins the
-- sidebar. No self-serve creative has been uploaded yet, so no stored artwork is left at the wrong size; the
-- house creatives are HTML and reflow.

update public.ad_slots set width = 728, height = 90, name = 'In-feed leaderboard' where key = 'in-river';
update public.ad_slots set width = 300, height = 250, name = 'In-article rectangle' where key = 'in-article';

insert into public.ad_slots (site_id, key, name, width, height)
select s.id, 'half-page', 'Half page', 300, 600 from public.sites s
on conflict (site_id, key) do nothing;

-- House creative for the new unit, for sites that have a house campaign. supabase/seed.sql repeats it for a
-- fresh reset.
insert into public.ad_creatives (site_id, campaign_id, slot_id, click_url, alt, html, status, weight)
select g.site_id, g.id, s.id, 'https://theeye.today/tracker', 'Trials & Funding Tracker',
       '<p><strong>Every ibogaine trial, grant and ruling, in one place.</strong> The Trials &amp; Funding Tracker is kept current by the newsroom. <a href="https://theeye.today/tracker">Open the tracker</a></p>',
       'approved', 1
  from public.ad_campaigns g
  join public.ad_slots s on s.site_id = g.site_id and s.key = 'half-page'
 where g.is_house and g.name = 'House ads'
   and not exists (select 1 from public.ad_creatives c where c.campaign_id = g.id and c.slot_id = s.id);
