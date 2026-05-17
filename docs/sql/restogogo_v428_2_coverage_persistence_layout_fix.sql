-- restogogo v428.2 — Coverage persistence + zone editor layout fix
-- Purpose:
--   - Keep coverage requirements as a complete small matrix so 0-count rows are valid saved state.
--   - Ensure the Supabase table/constraints exist for Zone × Service × Position coverage.
--   - Backfill 0 rows for active position/service combinations so refreshes stay deterministic.

create table if not exists public.restogogo_zone_coverage_requirements (
  restaurant_id text not null,
  zone_id text not null,
  service_key text not null check (service_key in ('Lunch','Evening')),
  position_id text not null,
  required_count integer not null default 0 check (required_count >= 0),
  sort_order integer not null default 0,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (restaurant_id, zone_id, service_key, position_id)
);

alter table public.restogogo_zone_coverage_requirements
  add column if not exists sort_order integer not null default 0,
  add column if not exists metadata jsonb not null default '{}'::jsonb,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

alter table public.restogogo_zone_coverage_requirements
  drop constraint if exists restogogo_zone_coverage_zone_fk;
alter table public.restogogo_zone_coverage_requirements
  add constraint restogogo_zone_coverage_zone_fk
  foreign key (restaurant_id, zone_id)
  references public.restogogo_zones(restaurant_id, id)
  on update cascade
  on delete cascade;

alter table public.restogogo_zone_coverage_requirements
  drop constraint if exists restogogo_zone_coverage_position_fk;
alter table public.restogogo_zone_coverage_requirements
  add constraint restogogo_zone_coverage_position_fk
  foreign key (restaurant_id, position_id)
  references public.restogogo_positions(restaurant_id, id)
  on update cascade
  on delete restrict;

-- Backfill a complete coverage matrix for existing zones and active positions.
-- Existing non-zero counts are preserved. Missing rows become explicit 0-count rows.
with service_keys(service_key, service_sort) as (
  values ('Lunch'::text, 0), ('Evening'::text, 1)
), matrix as (
  select
    z.restaurant_id,
    z.id as zone_id,
    s.service_key,
    p.id as position_id,
    coalesce(existing.required_count, 0) as required_count,
    ((coalesce(z.sort_order, 0) * 1000) + (s.service_sort * 100) + coalesce(p.sort_order, 0))::integer as sort_order,
    coalesce(existing.metadata, '{}'::jsonb) as metadata
  from public.restogogo_zones z
  join service_keys s on coalesce(z.services ->> s.service_key, 'true') <> 'false'
  join public.restogogo_positions p on p.restaurant_id = z.restaurant_id and p.active is not false
  left join public.restogogo_zone_coverage_requirements existing
    on existing.restaurant_id = z.restaurant_id
   and existing.zone_id = z.id
   and existing.service_key = s.service_key
   and existing.position_id = p.id
)
insert into public.restogogo_zone_coverage_requirements (
  restaurant_id, zone_id, service_key, position_id, required_count, sort_order, metadata
)
select restaurant_id, zone_id, service_key, position_id, required_count, sort_order, metadata
from matrix
on conflict (restaurant_id, zone_id, service_key, position_id)
do update set
  required_count = excluded.required_count,
  sort_order = excluded.sort_order,
  metadata = excluded.metadata,
  updated_at = now();

create index if not exists idx_restogogo_zone_coverage
  on public.restogogo_zone_coverage_requirements (restaurant_id, service_key, position_id);

create index if not exists idx_restogogo_zone_coverage_zone
  on public.restogogo_zone_coverage_requirements (restaurant_id, zone_id);

-- Refresh PostgREST/Supabase schema cache.
notify pgrst, 'reload schema';

-- Sanity check: should show total matrix rows and non-zero rows per restaurant.
select
  restaurant_id,
  count(*) as coverage_matrix_rows,
  count(*) filter (where required_count > 0) as active_required_rows,
  sum(required_count) as total_required_people
from public.restogogo_zone_coverage_requirements
group by restaurant_id
order by restaurant_id;
