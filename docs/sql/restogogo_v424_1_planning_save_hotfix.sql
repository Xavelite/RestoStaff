-- restogogo v424.1 — Planning save DB alignment hotfix
-- Purpose:
--   Fix live databases where the v423 ID contract did not fully land.
--   v424 writes planned shifts with zone_id and zones with default_position_ids.
--   The DB must expose those columns before Planning / Restaurant setup can save reliably.
--
-- Run after v418, v419, v420 and v423 migrations.
-- Safe to re-run: all structural changes are guarded with IF NOT EXISTS / IF EXISTS.

begin;

-- 1) Bring zones to the v423+ contract without deleting legacy columns yet.
alter table public.restogogo_zones
  add column if not exists default_position_ids jsonb not null default '[]'::jsonb;

-- Copy old default_positions values into default_position_ids.
-- This supports both old values stored as position names and accidental values stored as IDs.
do $$
begin
  if exists (
    select 1
      from information_schema.columns
     where table_schema = 'public'
       and table_name = 'restogogo_zones'
       and column_name = 'default_positions'
  ) then
    with expanded as (
      select
        z.restaurant_id,
        z.id as zone_id,
        value.position_value
      from public.restogogo_zones z
      cross join lateral jsonb_array_elements_text(coalesce(z.default_positions, '[]'::jsonb)) as value(position_value)
    ), matched as (
      select distinct
        e.restaurant_id,
        e.zone_id,
        p.id as position_id
      from expanded e
      join public.restogogo_positions p
        on p.restaurant_id = e.restaurant_id
       and (
          lower(trim(p.id)) = lower(trim(e.position_value))
          or lower(trim(p.name)) = lower(trim(e.position_value))
       )
    ), grouped as (
      select
        restaurant_id,
        zone_id,
        coalesce(jsonb_agg(position_id order by position_id), '[]'::jsonb) as position_ids
      from matched
      group by restaurant_id, zone_id
    )
    update public.restogogo_zones z
       set default_position_ids = case
             when jsonb_array_length(coalesce(z.default_position_ids, '[]'::jsonb)) > 0 then z.default_position_ids
             else g.position_ids
           end,
           updated_at = now()
      from grouped g
     where g.restaurant_id = z.restaurant_id
       and g.zone_id = z.id;
  end if;
end $$;

-- Remove stale position IDs from default_position_ids.
with normalized as (
  select
    z.restaurant_id,
    z.id,
    coalesce(jsonb_agg(distinct value.position_id) filter (where p.id is not null), '[]'::jsonb) as clean_ids
  from public.restogogo_zones z
  left join lateral jsonb_array_elements_text(coalesce(z.default_position_ids, '[]'::jsonb)) as value(position_id) on true
  left join public.restogogo_positions p
    on p.restaurant_id = z.restaurant_id
   and p.id = value.position_id
  group by z.restaurant_id, z.id
)
update public.restogogo_zones z
   set default_position_ids = n.clean_ids,
       updated_at = now()
  from normalized n
 where n.restaurant_id = z.restaurant_id
   and n.id = z.id;

-- 2) Bring planned shifts to the v423+ contract without deleting legacy zone_name yet.
alter table public.restogogo_planned_shifts
  add column if not exists zone_id text;

-- Migrate old zone_name values to zone_id. Supports zone_name values that are actually IDs too.
do $$
begin
  if exists (
    select 1
      from information_schema.columns
     where table_schema = 'public'
       and table_name = 'restogogo_planned_shifts'
       and column_name = 'zone_name'
  ) then
    update public.restogogo_planned_shifts ps
       set zone_id = z.id,
           updated_at = now()
      from public.restogogo_zones z
     where z.restaurant_id = ps.restaurant_id
       and nullif(trim(coalesce(ps.zone_name, '')), '') is not null
       and (
          lower(trim(z.id)) = lower(trim(ps.zone_name))
          or lower(trim(z.name)) = lower(trim(ps.zone_name))
       )
       and (ps.zone_id is null or ps.zone_id = '');
  end if;
end $$;

-- Clear zone IDs that do not point to a current zone.
update public.restogogo_planned_shifts ps
   set zone_id = null,
       updated_at = now()
 where zone_id is not null
   and not exists (
     select 1
       from public.restogogo_zones z
      where z.restaurant_id = ps.restaurant_id
        and z.id = ps.zone_id
   );

-- 3) Rebuild the optional zone FK only now that zone_id exists.
alter table public.restogogo_planned_shifts
  drop constraint if exists restogogo_planned_shifts_zone_fk;

alter table public.restogogo_planned_shifts
  add constraint restogogo_planned_shifts_zone_fk
  foreign key (restaurant_id, zone_id)
  references public.restogogo_zones(restaurant_id, id)
  on update cascade
  on delete restrict;

create index if not exists idx_restogogo_planned_shifts_zone
  on public.restogogo_planned_shifts (restaurant_id, zone_id);

-- 4) Ask Supabase/PostgREST to refresh its schema cache so REST writes see the new columns.
notify pgrst, 'reload schema';

commit;

-- 5) Verification. Expected:
--    restogogo_planned_shifts has zone_id
--    restogogo_zones has default_position_ids
--    stale_planned_zone_ids = 0
select
  table_name,
  column_name,
  data_type
from information_schema.columns
where table_schema = 'public'
  and (
    (table_name = 'restogogo_planned_shifts' and column_name in ('zone_id', 'zone_name'))
    or (table_name = 'restogogo_zones' and column_name in ('default_position_ids', 'default_positions'))
  )
order by table_name, column_name;

select count(*) as stale_planned_zone_ids
from public.restogogo_planned_shifts ps
left join public.restogogo_zones z
  on z.restaurant_id = ps.restaurant_id
 and z.id = ps.zone_id
where ps.zone_id is not null
  and z.id is null;
