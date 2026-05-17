-- restogogo v428.2.1 — Coverage RLS / API access hotfix
-- Purpose:
--   Fix HTTP 401 on POST /restogogo_zone_coverage_requirements.
--   The coverage table was introduced after the original prototype RLS policy loop,
--   so the anon API role could not write coverage rows.
--
-- Safe to run multiple times.

-- Ensure the table exists in case this hotfix is run on a partially migrated DB.
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

-- Match the current prototype access model used by the other restogogo tables.
-- NOTE: This is intentionally open for the prototype. Tighten before production.
grant select, insert, update, delete on public.restogogo_zone_coverage_requirements to anon;
grant select, insert, update, delete on public.restogogo_zone_coverage_requirements to authenticated;

alter table public.restogogo_zone_coverage_requirements enable row level security;

drop policy if exists restogogo_zone_coverage_requirements_pilot_anon_crud on public.restogogo_zone_coverage_requirements;
create policy restogogo_zone_coverage_requirements_pilot_anon_crud
  on public.restogogo_zone_coverage_requirements
  for all
  to anon
  using (true)
  with check (true);

drop policy if exists restogogo_zone_coverage_requirements_pilot_authenticated_crud on public.restogogo_zone_coverage_requirements;
create policy restogogo_zone_coverage_requirements_pilot_authenticated_crud
  on public.restogogo_zone_coverage_requirements
  for all
  to authenticated
  using (true)
  with check (true);

-- Keep FK integrity aligned with v425+ migrations.
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

create index if not exists idx_restogogo_zone_coverage_zone
  on public.restogogo_zone_coverage_requirements (restaurant_id, zone_id);

notify pgrst, 'reload schema';

-- Sanity check: permissions + existing matrix rows.
select
  'restogogo_zone_coverage_requirements' as table_name,
  has_table_privilege('anon', 'public.restogogo_zone_coverage_requirements', 'select') as anon_select,
  has_table_privilege('anon', 'public.restogogo_zone_coverage_requirements', 'insert') as anon_insert,
  has_table_privilege('anon', 'public.restogogo_zone_coverage_requirements', 'update') as anon_update,
  has_table_privilege('anon', 'public.restogogo_zone_coverage_requirements', 'delete') as anon_delete;

select
  restaurant_id,
  count(*) as coverage_matrix_rows,
  count(*) filter (where required_count > 0) as active_required_rows,
  coalesce(sum(required_count), 0) as total_required_people
from public.restogogo_zone_coverage_requirements
group by restaurant_id
order by restaurant_id;
