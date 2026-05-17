-- restogogo v423 — ID contract hardening
-- Purpose:
--   1) Make Zone -> default positions use position IDs instead of position names.
--   2) Make planned shifts store zone_id instead of zone_name.
--   3) Remove old name-based columns after values are migrated.
--
-- Run after v418, v419 and v420 migrations.

begin;

alter table public.restogogo_zones
  add column if not exists default_position_ids jsonb not null default '[]'::jsonb;

alter table public.restogogo_planned_shifts
  add column if not exists zone_id text;

-- Migrate zone default positions from names -> position IDs.
-- Only needed for databases still carrying the pre-v423 default_positions column.
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'restogogo_zones'
      and column_name = 'default_positions'
  ) then
    with expanded as (
      select
        z.restaurant_id,
        z.id as zone_id,
        p.id as position_id
      from public.restogogo_zones z
      cross join lateral jsonb_array_elements_text(coalesce(z.default_positions, '[]'::jsonb)) as value(position_name)
      join public.restogogo_positions p
        on p.restaurant_id = z.restaurant_id
       and lower(trim(p.name)) = lower(trim(value.position_name))
    ), grouped as (
      select
        restaurant_id,
        zone_id,
        coalesce(jsonb_agg(distinct position_id) filter (where position_id is not null), '[]'::jsonb) as position_ids
      from expanded
      group by restaurant_id, zone_id
    )
    update public.restogogo_zones z
       set default_position_ids = g.position_ids,
           updated_at = now()
      from grouped g
     where g.restaurant_id = z.restaurant_id
       and g.zone_id = z.id;
  end if;
end $$;

-- Migrate planned shift assignments from zone names -> zone IDs.
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'restogogo_planned_shifts'
      and column_name = 'zone_name'
  ) then
    update public.restogogo_planned_shifts ps
       set zone_id = z.id,
           updated_at = now()
      from public.restogogo_zones z
     where z.restaurant_id = ps.restaurant_id
       and lower(trim(z.name)) = lower(trim(ps.zone_name))
       and nullif(trim(coalesce(ps.zone_name, '')), '') is not null;
  end if;
end $$;

-- Remove stale IDs that no longer point to a live zone.
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

-- Remove stale position IDs inside zone default_position_ids.
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

alter table public.restogogo_zones
  drop column if exists default_positions;

alter table public.restogogo_planned_shifts
  drop column if exists zone_name;

commit;
