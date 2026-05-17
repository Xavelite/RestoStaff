-- restogogo v418 cleanup
-- Purpose: make Zones -> default_positions the only source of truth.
-- Run after deploying the v418 front-end, because v418 no longer reads/writes
-- restogogo_positions.default_zone or metadata.defaultZones.

begin;

-- 1) Optional one-time bridge for legacy data:
-- If the old default_zone column still exists, copy its links into the matching
-- zone.default_positions array before the column is removed.
do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'restogogo_positions'
      and column_name = 'default_zone'
  ) then
    execute $sql$
      with legacy_links as (
        select
          p.restaurant_id,
          p.name as position_name,
          nullif(trim(p.default_zone), '') as zone_name
        from public.restogogo_positions p
        where nullif(trim(p.default_zone), '') is not null
      ), merged as (
        select
          z.restaurant_id,
          z.id,
          coalesce(z.default_positions, '[]'::jsonb)
            || coalesce(jsonb_agg(to_jsonb(l.position_name)) filter (where l.position_name is not null), '[]'::jsonb) as merged_positions
        from public.restogogo_zones z
        left join legacy_links l
          on l.restaurant_id = z.restaurant_id
         and lower(l.zone_name) = lower(z.name)
        group by z.restaurant_id, z.id, z.default_positions
      ), deduped as (
        select
          restaurant_id,
          id,
          coalesce(jsonb_agg(distinct value) filter (where value <> '""'::jsonb), '[]'::jsonb) as default_positions
        from merged
        cross join lateral jsonb_array_elements(merged_positions) as items(value)
        group by restaurant_id, id
      )
      update public.restogogo_zones z
      set default_positions = d.default_positions,
          updated_at = now()
      from deduped d
      where z.restaurant_id = d.restaurant_id
        and z.id = d.id
    $sql$;
  end if;
end $$;

-- 2) Remove obsolete defaultZones metadata from positions.
update public.restogogo_positions
set metadata = coalesce(metadata, '{}'::jsonb) - 'defaultZones',
    updated_at = now()
where coalesce(metadata, '{}'::jsonb) ? 'defaultZones';

-- 3) Drop the obsolete reverse mapping column.
alter table public.restogogo_positions
  drop column if exists default_zone;

commit;
