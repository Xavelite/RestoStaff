-- restogogo v425 coverage data model
-- Purpose:
--   Replace generic zone capacity as the operational staffing rule with precise coverage requirements:
--   Zone x Service x Position = required count.
-- Safe to rerun.

begin;

-- 0) Ensure v423/v424.1 helper columns exist for safe upgrades.
alter table public.restogogo_zones
  add column if not exists default_position_ids jsonb not null default '[]'::jsonb;

alter table public.restogogo_planned_shifts
  add column if not exists zone_id text;

-- 1) Expected coverage setup table.
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

-- Remove invalid existing rows before rebuilding FKs.
delete from public.restogogo_zone_coverage_requirements r
where not exists (
  select 1 from public.restogogo_zones z
  where z.restaurant_id = r.restaurant_id and z.id = r.zone_id
)
or not exists (
  select 1 from public.restogogo_positions p
  where p.restaurant_id = r.restaurant_id and p.id = r.position_id
);

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

create index if not exists idx_restogogo_zone_coverage
  on public.restogogo_zone_coverage_requirements (restaurant_id, service_key, position_id);

-- 2) Planned shifts now remember the planned role as well as the zone.
alter table public.restogogo_planned_shifts
  add column if not exists position_id text;

update public.restogogo_planned_shifts ps
   set position_id = e.position_id,
       updated_at = now()
  from public.restogogo_employees e
 where e.restaurant_id = ps.restaurant_id
   and e.id = ps.employee_id
   and nullif(trim(coalesce(ps.position_id, '')), '') is null
   and nullif(trim(coalesce(e.position_id, '')), '') is not null;

alter table public.restogogo_planned_shifts
  drop constraint if exists restogogo_planned_shifts_position_fk;
alter table public.restogogo_planned_shifts
  add constraint restogogo_planned_shifts_position_fk
  foreign key (restaurant_id, position_id)
  references public.restogogo_positions(restaurant_id, id)
  on update cascade
  on delete restrict;

create index if not exists idx_restogogo_planned_shifts_position
  on public.restogogo_planned_shifts (restaurant_id, position_id);

-- 3) One-time migration: derive initial coverage from old zone default_position_ids.
--    This is a bridge from v424.1 data. From v425 onward, coverage requirements are the staffing source of truth.
with enabled_zone_services as (
  select
    z.restaurant_id,
    z.id as zone_id,
    service.service_key,
    z.sort_order
  from public.restogogo_zones z
  cross join lateral (values ('Lunch'), ('Evening')) as service(service_key)
  where z.active is distinct from false
    and coalesce((z.services ->> service.service_key)::boolean, true) is true
), zone_positions as (
  select
    z.restaurant_id,
    z.id as zone_id,
    p.position_id,
    z.sort_order
  from public.restogogo_zones z
  cross join lateral jsonb_array_elements_text(coalesce(z.default_position_ids, '[]'::jsonb)) as p(position_id)
  join public.restogogo_positions pos
    on pos.restaurant_id = z.restaurant_id
   and pos.id = p.position_id
)
insert into public.restogogo_zone_coverage_requirements (
  restaurant_id, zone_id, service_key, position_id, required_count, sort_order, metadata
)
select
  z.restaurant_id,
  z.zone_id,
  z.service_key,
  p.position_id,
  1 as required_count,
  coalesce(z.sort_order,0) * 100 + case when z.service_key = 'Lunch' then 1 else 2 end as sort_order,
  '{"migratedFrom":"zone.default_position_ids"}'::jsonb as metadata
from enabled_zone_services z
join zone_positions p
  on p.restaurant_id = z.restaurant_id
 and p.zone_id = z.zone_id
where not exists (
  select 1
  from public.restogogo_zone_coverage_requirements existing
  where existing.restaurant_id = z.restaurant_id
    and existing.zone_id = z.zone_id
    and existing.service_key = z.service_key
    and existing.position_id = p.position_id
)
on conflict (restaurant_id, zone_id, service_key, position_id) do nothing;

-- Bouillon pilot cleanup: Extra/flexi people can be assigned freely, but they are not a required coverage role.
update public.restogogo_zones
   set default_position_ids = '["runner"]'::jsonb,
       updated_at = now()
 where restaurant_id = 'bouillon-bruxelles'
   and id in ('pass-1','pass-b-1')
   and default_position_ids ? 'extra-flexi-student';

delete from public.restogogo_zone_coverage_requirements
 where restaurant_id = 'bouillon-bruxelles'
   and zone_id in ('pass-1','pass-b-1')
   and position_id = 'extra-flexi-student';

-- 4) Clean invalid coverage rows after migrations/renames.
delete from public.restogogo_zone_coverage_requirements r
where not exists (
  select 1 from public.restogogo_zones z
  where z.restaurant_id = r.restaurant_id and z.id = r.zone_id
)
or not exists (
  select 1 from public.restogogo_positions p
  where p.restaurant_id = r.restaurant_id and p.id = r.position_id
);

-- 5) Bump app schema marker.
update public.restogogo_restaurants
   set settings = coalesce(settings, '{}'::jsonb) || '{"schemaVersion":33}'::jsonb,
       updated_at = now();

commit;

notify pgrst, 'reload schema';

-- Sanity checks
select 'coverage_rows' as check_name, count(*) as value
from public.restogogo_zone_coverage_requirements;

select 'planned_shifts_missing_position' as check_name, count(*) as value
from public.restogogo_planned_shifts ps
where ps.planned is true
  and ps.position_id is null;
