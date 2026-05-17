-- restogogo v428.3 — Coverage contract hardening
-- Purpose:
--   Make coverage requirements the only service/staffing source of truth.
--   Zones are locations; default_times are timing helpers; coverage rows define Lunch/Evening needs.
-- Safe to rerun.

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
  primary key (restaurant_id, zone_id, service_key, position_id),
  foreign key (restaurant_id, zone_id) references public.restogogo_zones(restaurant_id, id) on update cascade on delete cascade,
  foreign key (restaurant_id, position_id) references public.restogogo_positions(restaurant_id, id) on update cascade on delete restrict
);

alter table public.restogogo_zone_coverage_requirements enable row level security;

drop policy if exists "prototype_select_zone_coverage_requirements" on public.restogogo_zone_coverage_requirements;
drop policy if exists "prototype_insert_zone_coverage_requirements" on public.restogogo_zone_coverage_requirements;
drop policy if exists "prototype_update_zone_coverage_requirements" on public.restogogo_zone_coverage_requirements;
drop policy if exists "prototype_delete_zone_coverage_requirements" on public.restogogo_zone_coverage_requirements;
drop policy if exists restogogo_zone_coverage_requirements_pilot_anon_crud on public.restogogo_zone_coverage_requirements;

create policy restogogo_zone_coverage_requirements_pilot_anon_crud
on public.restogogo_zone_coverage_requirements
for all
to anon, authenticated
using (true)
with check (true);

grant select, insert, update, delete on public.restogogo_zone_coverage_requirements to anon;
grant select, insert, update, delete on public.restogogo_zone_coverage_requirements to authenticated;

-- Remove orphan coverage rows before refreshing the full matrix.
delete from public.restogogo_zone_coverage_requirements c
where not exists (
  select 1 from public.restogogo_zones z
  where z.restaurant_id = c.restaurant_id and z.id = c.zone_id
)
or not exists (
  select 1 from public.restogogo_positions p
  where p.restaurant_id = c.restaurant_id and p.id = c.position_id
);

-- Coverage is now the only service/staffing source of truth.
-- Persist a complete matrix so 0 is an explicit saved setup value.
with service_keys(service_key, service_sort) as (
  values ('Lunch'::text, 1), ('Evening'::text, 2)
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
  cross join service_keys s
  join public.restogogo_positions p
    on p.restaurant_id = z.restaurant_id
   and p.active is true
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
on conflict (restaurant_id, zone_id, service_key, position_id) do update set
  required_count = excluded.required_count,
  sort_order = excluded.sort_order,
  metadata = excluded.metadata,
  updated_at = now();

-- Remove legacy zone service/position columns after the matrix is safely materialized.
alter table public.restogogo_zones
  drop column if exists services,
  drop column if exists default_positions,
  drop column if exists default_position_ids,
  drop column if exists capacity;

update public.restogogo_restaurants
   set settings = coalesce(settings, '{}'::jsonb) || '{"schemaVersion":37}'::jsonb,
       updated_at = now();

notify pgrst, 'reload schema';

commit;

select
  restaurant_id,
  count(*) as coverage_rows,
  count(*) filter (where required_count > 0) as active_required_rows,
  coalesce(sum(required_count), 0) as total_required_people
from public.restogogo_zone_coverage_requirements
group by restaurant_id
order by restaurant_id;
