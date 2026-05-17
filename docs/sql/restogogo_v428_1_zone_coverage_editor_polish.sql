-- restogogo v428.1 — zone coverage editor polish / persistence sanity
-- Purpose:
--   Ensure the coverage table and planned-shift columns required by the compact zone coverage editor exist.
--   Safe to rerun. This does not remove data.

begin;

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

alter table public.restogogo_planned_shifts
  add column if not exists zone_id text,
  add column if not exists position_id text;

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

alter table public.restogogo_planned_shifts
  drop constraint if exists restogogo_planned_shifts_zone_fk;
alter table public.restogogo_planned_shifts
  add constraint restogogo_planned_shifts_zone_fk
  foreign key (restaurant_id, zone_id)
  references public.restogogo_zones(restaurant_id, id)
  on update cascade
  on delete set null;

alter table public.restogogo_planned_shifts
  drop constraint if exists restogogo_planned_shifts_position_fk;
alter table public.restogogo_planned_shifts
  add constraint restogogo_planned_shifts_position_fk
  foreign key (restaurant_id, position_id)
  references public.restogogo_positions(restaurant_id, id)
  on update cascade
  on delete restrict;

create index if not exists idx_restogogo_zone_coverage
  on public.restogogo_zone_coverage_requirements (restaurant_id, service_key, position_id);

create index if not exists idx_restogogo_zone_coverage_zone
  on public.restogogo_zone_coverage_requirements (restaurant_id, zone_id);

update public.restogogo_restaurants
   set settings = coalesce(settings, '{}'::jsonb) || '{"schemaVersion":35}'::jsonb,
       updated_at = now();

notify pgrst, 'reload schema';

commit;

-- Sanity checks after running:
select 'coverage_table_rows' as check_name, count(*) as value
from public.restogogo_zone_coverage_requirements;

select restaurant_id, zone_id, service_key, position_id, required_count
from public.restogogo_zone_coverage_requirements
order by restaurant_id, zone_id, service_key, position_id
limit 50;
