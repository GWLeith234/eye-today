-- Podcast directory seed (Sprint 23). Run in the SQL editor AFTER migration 0028 is applied.
-- Safe to re-run: existing slugs are left alone. Platform links not confirmed from the show's own site are left
-- empty for the editor to add at Admin → Directory (Where to listen: one "platform | url" per line).

do $$
declare
  v_site uuid;
  v_cat uuid;
begin
  select id into v_site from public.sites where slug = 'eyetoday';
  select id into v_cat from public.directory_categories where site_id = v_site and slug = 'podcast';
  if v_cat is null then
    raise exception 'podcast category missing: apply migration 0028 first';
  end if;

  insert into public.directory_listings
    (site_id, category_id, slug, name, country_code, city, website, description, status, verification_level,
     verification_note, relationship_disclosure, host_names, platform_links)
  values
    (v_site, v_cat, 'scientia-prima', 'Scientia Prima', 'MX', 'Rosarito',
     'https://transcendibogaine.com/',
     'Science first: conversations on ibogaine, addiction medicine and the research behind treatment, recorded at Transcend Ibogaine Clinic.',
     'published', 'verified', 'Produced by the publisher''s clinic; episodes appear in the Podcasts section.',
     'Scientia Prima is produced by Transcend Ibogaine Clinic, which is owned by the publisher of Eye Today.',
     null, '[]'::jsonb),

    (v_site, v_cat, 'ozcast', 'OZCast', 'US', null,
     'https://markgeist.com/',
     'Mark "Oz" Geist, Benghazi survivor and co-author of 13 Hours, on service, recovery and what comes after. Coming to Spotify, YouTube and Apple Podcasts.',
     'published', 'verified', 'Advertiser on Eye Today; details confirmed with the host.',
     'OZCast advertises on Eye Today.',
     'Mark "Oz" Geist', '[]'::jsonb),

    (v_site, v_cat, 'evolved-pros', 'Evolved Pros', 'CA', null,
     'https://www.evolvedpros.com/',
     'Conversations with founders and operators on building, selling and growing a business, from the Evolved Pros Academy.',
     'published', 'verified', 'Published by the publisher of Eye Today.',
     'Evolved Pros is owned by the publisher of Eye Today and advertises on the site.',
     'George Leith', '[]'::jsonb),

    (v_site, v_cat, 'conquer-local', 'Conquer Local', 'CA', 'Saskatoon',
     'https://www.conquerlocal.com/',
     'The archive of the Conquer Local podcast: interviews with local-business and agency leaders on sales, marketing and growth.',
     'published', 'listed', 'Archive show; hosted by the publisher for its original run.',
     'The publisher of Eye Today hosted Conquer Local.',
     'George Leith', '[]'::jsonb),

    (v_site, v_cat, 'psychedelic-news-feed', 'The Psychedelic News Feed Podcast', 'GB', null,
     'https://psychedelicalpha.com/',
     'Psychedelic Alpha''s weekly rundown of the news, research and policy shaping the psychedelics field.',
     'published', 'listed', 'Independent show; listed by the newsroom.',
     null, null, '[]'::jsonb)
  on conflict (site_id, slug) do nothing;
end $$;

select slug, name, status from public.directory_listings
 where category_id = (select id from public.directory_categories where slug = 'podcast' limit 1)
 order by name;
