-- restogogo v428 — naming / redundancy cleanup
-- Purpose:
--   Remove columns that are no longer part of the active runtime contract after the coverage model.
--   Source of truth after this migration:
--     - Employee role: restogogo_employees.position_id -> restogogo_positions.id
--     - Employee cost: restogogo_employees.hourly_cost
--     - Zone staffing need: restogogo_zone_coverage_requirements
--     - Zone service times: restogogo_zones.default_times

begin;

-- 1) Preserve any old employee values before dropping redundant columns.
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'restogogo_employees' and column_name = 'rate'
  ) then
    update public.restogogo_employees
       set hourly_cost = rate
     where coalesce(hourly_cost, 0) = 0
       and coalesce(rate, 0) > 0;
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'restogogo_employees' and column_name = 'position'
  ) then
    update public.restogogo_employees e
       set position_id = p.id
      from public.restogogo_positions p
     where e.restaurant_id = p.restaurant_id
       and nullif(e.position_id, '') is null
       and lower(trim(e.position)) = lower(trim(p.name));
  end if;
end $$;

-- 2) Final safety bridge: convert any remaining zone helper positions into coverage rows.
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'restogogo_zones' and column_name = 'default_position_ids'
  ) then
    insert into public.restogogo_zone_coverage_requirements (
      restaurant_id, zone_id, service_key, position_id, required_count, sort_order, metadata
    )
    select
      z.restaurant_id,
      z.id as zone_id,
      service.service_key,
      position_id.value as position_id,
      1 as required_count,
      coalesce(z.sort_order, 0) * 100 + case when service.service_key = 'Lunch' then 1 else 2 end,
      '{"migratedFrom":"v428.default_position_ids.final_bridge"}'::jsonb
    from public.restogogo_zones z
    cross join lateral (values ('Lunch'), ('Evening')) as service(service_key)
    cross join lateral jsonb_array_elements_text(coalesce(z.default_position_ids, '[]'::jsonb)) as position_id(value)
    where z.active is true
      and coalesce((z.services ->> service.service_key)::boolean, true) is true
      and exists (
        select 1 from public.restogogo_positions p
        where p.restaurant_id = z.restaurant_id and p.id = position_id.value
      )
    on conflict (restaurant_id, zone_id, service_key, position_id) do nothing;
  end if;
end $$;

-- 3) Drop redundant columns from the active relational contract.
alter table if exists public.restogogo_zones
  drop column if exists capacity,
  drop column if exists default_position_ids;

alter table if exists public.restogogo_employees
  drop column if exists position,
  drop column if exists rate;

-- 4) Refresh PostgREST/Supabase schema cache.
notify pgrst, 'reload schema';

commit;
