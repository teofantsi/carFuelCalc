alter table public.road_ledger_profiles
add column if not exists ownership_costs jsonb not null default '[]'::jsonb;

alter table public.road_ledger_profiles
drop constraint if exists road_ledger_profiles_ownership_costs_array;

alter table public.road_ledger_profiles
add constraint road_ledger_profiles_ownership_costs_array
check (jsonb_typeof(ownership_costs) = 'array');
