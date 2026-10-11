-- supabase/tests/0021_directory_card_photo.sql — directory cards carry the listing's first photo.
--
--   psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -f supabase/tests/0021_directory_card_photo.sql
--
-- One transaction, rolled back.

\set ON_ERROR_STOP on
begin;

insert into public.media (id, site_id, storage_path, alt, width, height) values
  ('d2100000-0000-4000-8000-000000000a01', '00000000-0000-4000-8000-000000000001', 'test/logo.png', 'Logo', 100, 100),
  ('d2100000-0000-4000-8000-000000000a02', '00000000-0000-4000-8000-000000000001', 'test/photo-1.jpg', 'First photo', 700, 466),
  ('d2100000-0000-4000-8000-000000000a03', '00000000-0000-4000-8000-000000000001', 'test/photo-2.jpg', 'Second photo', 700, 466);

insert into public.directory_listings (id, site_id, category_id, slug, name, country_code, city, description, status, verification_level, verification_note, logo_media_id, photo_media_ids) values
  ('d2100000-0000-4000-8000-000000000b01', '00000000-0000-4000-8000-000000000001',
   (select id from public.directory_categories where slug = 'treatment-clinic' limit 1),
   'card-photo-clinic', 'Card Photo Clinic', 'MX', 'Cancún', 'A clinic with photos.', 'published', 'listed', 'test',
   'd2100000-0000-4000-8000-000000000a01', array['d2100000-0000-4000-8000-000000000a02', 'd2100000-0000-4000-8000-000000000a03']::uuid[]),
  ('d2100000-0000-4000-8000-000000000b02', '00000000-0000-4000-8000-000000000001',
   (select id from public.directory_categories where slug = 'treatment-clinic' limit 1),
   'card-no-photo-clinic', 'Card No Photo Clinic', 'MX', 'Tijuana', 'A clinic without photos.', 'published', 'listed', 'test',
   null, '{}'::uuid[]);

set local request.jwt.claims = '{"role": "anon"}';
set local role anon;
do $$
declare
  r public.directory_card;
begin
  select * into r from public.directory_search(null, 'MX', null, null, null, 1) where slug = 'card-photo-clinic';
  assert r.photo_storage_path = 'test/photo-1.jpg', format('first photo in listing order, got %s', r.photo_storage_path);
  assert r.photo_alt = 'First photo', 'photo alt';
  assert r.logo_storage_path = 'test/logo.png', 'logo still present';
  select * into r from public.directory_search(null, 'MX', null, null, null, 1) where slug = 'card-no-photo-clinic';
  assert r.photo_storage_path is null, 'no photo gives null';
  assert r.name = 'Card No Photo Clinic', 'the rest of the card is unchanged';
end $$;
reset role;

rollback;
