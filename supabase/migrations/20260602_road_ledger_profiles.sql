create extension if not exists pgcrypto;

create or replace function public.set_road_ledger_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = timezone('utc'::text, now());
  return new;
end;
$$;

create table if not exists public.road_ledger_profiles (
  id uuid primary key default gen_random_uuid(),
  nickname text not null,
  nickname_normalized text not null unique,
  profile_key text not null,
  settings jsonb not null default '{}'::jsonb,
  vehicles jsonb not null default '[]'::jsonb,
  fill_ups jsonb not null default '[]'::jsonb,
  trips jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now()),
  last_seen_at timestamptz not null default timezone('utc'::text, now()),
  constraint road_ledger_profiles_settings_object check (jsonb_typeof(settings) = 'object'),
  constraint road_ledger_profiles_vehicles_array check (jsonb_typeof(vehicles) = 'array'),
  constraint road_ledger_profiles_fill_ups_array check (jsonb_typeof(fill_ups) = 'array'),
  constraint road_ledger_profiles_trips_array check (jsonb_typeof(trips) = 'array')
);

drop trigger if exists road_ledger_profiles_set_updated_at on public.road_ledger_profiles;
create trigger road_ledger_profiles_set_updated_at
before update on public.road_ledger_profiles
for each row
execute function public.set_road_ledger_updated_at();

alter table public.road_ledger_profiles enable row level security;

revoke all on public.road_ledger_profiles from anon;
revoke all on public.road_ledger_profiles from authenticated;
