-- Travel Companion schema (Supabase / Postgres)
-- Run in Supabase: SQL Editor -> New query -> paste -> Run. Safe to re-run.

create extension if not exists "pgcrypto";

-- ── Core tables ─────────────────────────────────────────────────────────────
create table if not exists public.trips (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null,
  start_date date,
  end_date date,
  travelers int not null default 2,
  base_currency text not null default 'AUD',
  created_at timestamptz not null default now()
);

create table if not exists public.bookings (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips(id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  title text not null,
  category text,
  date text,
  status text not null default 'TO BOOK',
  amount numeric,
  currency text not null default 'AUD',
  paid boolean not null default false,
  link text,
  notes text,
  created_at timestamptz not null default now()
);

create table if not exists public.budget_items (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips(id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  category text,
  item text,
  qty numeric not null default 1,
  unit_price numeric not null default 0,
  currency text not null default 'AUD',
  notes text,
  created_at timestamptz not null default now()
);

-- ── Phase 1: booking detail fields ──────────────────────────────────────────
alter table public.bookings add column if not exists vendor text;
alter table public.bookings add column if not exists confirmation_no text;
alter table public.bookings add column if not exists starts_at timestamptz;
alter table public.bookings add column if not exists ends_at timestamptz;

-- ── Phase 1: attachment vault ───────────────────────────────────────────────
create table if not exists public.attachments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  booking_id uuid references public.bookings(id) on delete cascade,
  trip_id uuid not null references public.trips(id) on delete cascade,
  file_path text not null,          -- {user_id}/{trip_id}/{uuid}.ext
  file_name text not null,
  mime_type text,
  size_bytes bigint,
  created_at timestamptz not null default now()
);

-- ── Phase 2: AI planner — saved place ideas ─────────────────────────────────
create table if not exists public.saved_places (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  trip_id uuid not null references public.trips(id) on delete cascade,
  google_place_id text,
  name text not null,
  category text,                       -- sight | food | activity | accommodation
  lat double precision, lng double precision,
  rating numeric, user_ratings_total int,
  price_level text,
  photo_ref text, maps_url text, why text,
  source text not null default 'google_places',
  fetched_at timestamptz not null default now(),
  status text not null default 'idea', -- idea | shortlisted | added_to_itinerary
  created_at timestamptz not null default now()
);

-- ── Phase 3: link a converted idea back to its booking (recall) ──────────────
alter table public.bookings add column if not exists saved_place_id uuid
  references public.saved_places(id) on delete set null;

-- ── Phase 5: price comparison — saved quotes (never cached as "live") ────────
create table if not exists public.price_quotes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  trip_id uuid not null references public.trips(id) on delete cascade,
  kind text not null default 'flight',     -- flight | stay
  source text not null,                    -- e.g. duffel
  title text,                              -- "LHR→CDG · British Airways"
  origin text, destination text,
  depart_date text, return_date text,
  price numeric, currency text,
  deep_link text,
  params_hash text,
  fetched_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

-- ── Row Level Security: each user sees only their own rows ───────────────────
alter table public.trips enable row level security;
alter table public.bookings enable row level security;
alter table public.budget_items enable row level security;
alter table public.attachments enable row level security;
alter table public.saved_places enable row level security;
alter table public.price_quotes enable row level security;

drop policy if exists "own trips" on public.trips;
create policy "own trips" on public.trips
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "own bookings" on public.bookings;
create policy "own bookings" on public.bookings
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "own budget" on public.budget_items;
create policy "own budget" on public.budget_items
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "own attachments" on public.attachments;
create policy "own attachments" on public.attachments
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "own places" on public.saved_places;
create policy "own places" on public.saved_places
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "own quotes" on public.price_quotes;
create policy "own quotes" on public.price_quotes
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create index if not exists idx_bookings_trip on public.bookings(trip_id);
create index if not exists idx_budget_trip on public.budget_items(trip_id);
create index if not exists idx_attachments_booking on public.attachments(booking_id);
create index if not exists idx_attachments_trip on public.attachments(trip_id);
create index if not exists idx_saved_places_trip on public.saved_places(trip_id);
create index if not exists idx_price_quotes_trip on public.price_quotes(trip_id);

-- ── Grants: the PostgREST "authenticated" role needs table privileges. RLS
-- (above) still restricts which ROWS each user sees; these grants just allow
-- access to the tables at all. Without them you get "permission denied". ───────
grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on all tables in schema public to anon, authenticated;
grant usage, select on all sequences in schema public to anon, authenticated;

-- ── Phase 1: private Storage bucket for attachments ─────────────────────────
insert into storage.buckets (id, name, public)
  values ('attachments', 'attachments', false)
  on conflict (id) do nothing;

-- Storage RLS: a user may only touch objects whose path begins with their own
-- uid, i.e. "{auth.uid()}/...". (storage.foldername(name))[1] is the top folder.
drop policy if exists "own attachment objects - select" on storage.objects;
create policy "own attachment objects - select" on storage.objects
  for select to authenticated
  using (bucket_id = 'attachments' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "own attachment objects - insert" on storage.objects;
create policy "own attachment objects - insert" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'attachments' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "own attachment objects - update" on storage.objects;
create policy "own attachment objects - update" on storage.objects
  for update to authenticated
  using (bucket_id = 'attachments' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "own attachment objects - delete" on storage.objects;
create policy "own attachment objects - delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'attachments' and (storage.foldername(name))[1] = auth.uid()::text);

-- ── Launch hardening: per-user rate limiting for paid Edge Functions ─────────
-- Each paid function logs a call here and is gated by check_rate_limit() below.
create table if not exists public.api_usage (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  fn text not null,
  created_at timestamptz not null default now()
);
alter table public.api_usage enable row level security;
drop policy if exists "own usage" on public.api_usage;
create policy "own usage" on public.api_usage
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create index if not exists idx_api_usage_lookup on public.api_usage(user_id, fn, created_at);

-- Atomic gate: rejects anonymous callers, enforces per-minute + per-day caps, and
-- logs the call — all as the authenticated caller (auth.uid()). SECURITY DEFINER so
-- it can read the user's own usage rows regardless of table grants.
create or replace function public.check_rate_limit(p_fn text, p_per_minute int, p_per_day int)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_min int;
  v_day int;
begin
  if v_uid is null then
    return jsonb_build_object('allowed', false, 'reason', 'unauthenticated');
  end if;
  select count(*) into v_min from public.api_usage
    where user_id = v_uid and fn = p_fn and created_at > now() - interval '1 minute';
  if v_min >= p_per_minute then
    return jsonb_build_object('allowed', false, 'reason', 'rate', 'retry_after', 60);
  end if;
  select count(*) into v_day from public.api_usage
    where user_id = v_uid and fn = p_fn and created_at > now() - interval '1 day';
  if v_day >= p_per_day then
    return jsonb_build_object('allowed', false, 'reason', 'daily', 'retry_after', 3600);
  end if;
  insert into public.api_usage (user_id, fn) values (v_uid, p_fn);
  return jsonb_build_object('allowed', true, 'minute', v_min + 1, 'day', v_day + 1);
end;
$$;
revoke all on function public.check_rate_limit(text, int, int) from public, anon;
grant execute on function public.check_rate_limit(text, int, int) to authenticated;
