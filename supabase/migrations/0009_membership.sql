-- 0009_membership.sql — supporter membership (Stripe).
--
-- membership_tiers and memberships already exist (0001) with no client grants. Nothing here lets a
-- user write a membership or change profiles.role: the Stripe webhook writes memberships through the
-- service role, and the only path to a role change is sync_supporter_role(), a definer function that
-- only service_role may run. The column UPDATE grant on profiles is untouched.

-- A single payment is not a monthly interval. The new value cannot be used in the transaction that
-- adds it, so end that transaction here; everything below runs in the next one. If a later statement
-- fails, this line is safe to run again (if not exists) and nothing else was applied.
alter type public.membership_interval add value if not exists 'once';
commit;

-- ---------------------------------------------------------------------------
-- Columns
-- ---------------------------------------------------------------------------

alter table public.membership_tiers add column stripe_price_id text;

-- Not added to the user's column UPDATE grant: users cannot set their own Stripe customer.
alter table public.profiles add column stripe_customer_id text unique;

alter table public.memberships
  add column stripe_subscription_id text unique,
  add column stripe_checkout_session_id text unique,
  add column amount_cents integer check (amount_cents is null or amount_cents >= 0);

-- ---------------------------------------------------------------------------
-- Processed webhook events. No client grants: the webhook inserts with the service role.
-- ---------------------------------------------------------------------------

create table public.stripe_events (
  id text primary key,
  type text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger set_updated_at
  before update on public.stripe_events
  for each row execute function public.set_updated_at();
alter table public.stripe_events enable row level security;
alter table public.stripe_events force row level security;
revoke all on table public.stripe_events from anon, authenticated;

-- ---------------------------------------------------------------------------
-- Seed data: the Supporters newsletter list and three tiers for every existing site.
-- Amounts are CAD cents and match scripts/stripe-seed.mjs. stripe_price_id stays null until
-- a person copies the ids that script prints.
-- ---------------------------------------------------------------------------

insert into public.newsletter_lists (site_id, slug, name, description)
select s.id, 'supporters', 'Supporters newsletter', 'A note for readers who fund Eye Today.'
  from public.sites s
on conflict (site_id, slug) do nothing;

insert into public.membership_tiers (site_id, slug, name, description, price_cents, interval)
select s.id, v.slug, v.name, v.description, v.price_cents, v.interval::public.membership_interval
  from public.sites s
 cross join (values
   ('monthly', 'Monthly supporter', 'Keeps reporting on addiction and recovery free for everyone to read.', 800, 'month'),
   ('annual', 'Annual supporter', 'A full year of support, and two months free compared with monthly.', 8000, 'year'),
   ('once', 'One-time gift', 'A single contribution toward the next investigation.', 2500, 'once')
 ) as v (slug, name, description, price_cents, interval)
on conflict (site_id, slug) do nothing;

-- ---------------------------------------------------------------------------
-- Access. Tiers are public, without their Stripe price ids (a column grant, not a table grant).
-- A reader sees only their own membership and cannot write one.
-- ---------------------------------------------------------------------------

grant select (id, site_id, slug, name, description, price_cents, interval, is_active)
  on table public.membership_tiers to anon, authenticated;
create policy "active tiers are publicly readable"
  on public.membership_tiers for select to anon, authenticated
  using (is_active);

grant select on table public.memberships to authenticated;
create policy "readers see their own membership"
  on public.memberships for select to authenticated
  using (profile_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- Functions
-- ---------------------------------------------------------------------------

-- Remember the Stripe customer for the signed-in user, once. Never overwrites.
create function public.attach_stripe_customer(customer text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  n integer;
begin
  if (select auth.uid()) is null
     or attach_stripe_customer.customer is null
     or attach_stripe_customer.customer !~ '^cus_[A-Za-z0-9_]{6,64}$' then
    return false;
  end if;

  update public.profiles p
     set stripe_customer_id = attach_stripe_customer.customer
   where p.id = (select auth.uid())
     and p.stripe_customer_id is null;
  get diagnostics n = row_count;
  return n > 0;
end;
$$;

-- Makes profiles.role match memberships. src/lib/membership/roles.ts (nextRole) states the same rules.
--   role reader    + an active membership, or a past_due one still inside its period -> supporter
--   role supporter + no such membership                                              -> reader
--   contributor, editor and admin never change.
create function public.sync_supporter_role(profile uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role public.app_role;
  v_has boolean;
begin
  select p.role into v_role from public.profiles p where p.id = sync_supporter_role.profile for update;
  if not found then
    return null;
  end if;

  select exists (
    select 1
      from public.memberships m
     where m.profile_id = sync_supporter_role.profile
       and (
         m.status = 'active'
         or (m.status = 'past_due' and (m.current_period_end is null or m.current_period_end > pg_catalog.now()))
       )
  ) into v_has;

  if v_role = 'reader' and v_has then
    update public.profiles p set role = 'supporter' where p.id = sync_supporter_role.profile;
    return 'supporter';
  elsif v_role = 'supporter' and not v_has then
    update public.profiles p set role = 'reader' where p.id = sync_supporter_role.profile;
    return 'reader';
  end if;
  return v_role::text;
end;
$$;

revoke all on function public.attach_stripe_customer(text) from public, anon, authenticated;
grant execute on function public.attach_stripe_customer(text) to authenticated;
revoke all on function public.sync_supporter_role(uuid) from public, anon, authenticated;
grant execute on function public.sync_supporter_role(uuid) to service_role;
