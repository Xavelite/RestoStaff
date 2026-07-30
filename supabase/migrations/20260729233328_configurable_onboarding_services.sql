begin;

set local lock_timeout = '5s';
set local statement_timeout = '2min';
select pg_advisory_xact_lock(
  hashtextextended('restogogo:20260730000100:configurable-onboarding-services', 0)
);

create function public.setup_owner_workspace_v2(
  p_owner_first_name text,
  p_owner_last_name text,
  p_owner_email citext,
  p_restaurant_name text,
  p_city text default '',
  p_services jsonb default '[]'::jsonb,
  p_employees jsonb default '[]'::jsonb,
  p_opening_hours jsonb default '[]'::jsonb,
  p_areas jsonb default '[]'::jsonb,
  p_job_functions jsonb default '[]'::jsonb,
  p_coverage jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $setup$
declare
  v_result jsonb;
  v_restaurant_id uuid;
begin
  if jsonb_typeof(coalesce(p_services, '[]'::jsonb)) <> 'array'
      or jsonb_array_length(coalesce(p_services, '[]'::jsonb)) = 0 then
    raise exception 'At least one service period is required.';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_services) item
    where public.service_key_from_display(item->>'service_key') is null
      or nullif(btrim(item->>'name'), '') is null
      or nullif(item->>'start_time', '') is null
      or nullif(item->>'end_time', '') is null
  ) then
    raise exception 'Every service needs a valid key, name, start and end time.';
  end if;

  if exists (
    select 1
    from (
      select lower(item->>'service_key') as service_key
      from jsonb_array_elements(p_services) item
      group by lower(item->>'service_key')
      having count(*) > 1
    ) duplicate
  ) then
    raise exception 'Service keys must be unique.';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(coalesce(p_opening_hours, '[]'::jsonb)) item
    where not exists (
      select 1
      from jsonb_array_elements(p_services) service
      where lower(service->>'service_key') = lower(item->>'service_key')
    )
  ) then
    raise exception 'Opening hours contain an unknown service.';
  end if;

  -- The proven constructor owns identity, tenant, catalogue and starter-team
  -- creation. Service rows are replaced below before this transaction commits.
  v_result := public.setup_owner_workspace(
    p_owner_first_name,
    p_owner_last_name,
    p_owner_email,
    p_restaurant_name,
    p_city,
    p_employees,
    '[]'::jsonb,
    p_areas,
    p_job_functions,
    p_coverage
  );
  v_restaurant_id := nullif(v_result->>'restaurant_id', '')::uuid;

  if v_restaurant_id is null then
    raise exception 'Workspace setup did not return a restaurant.';
  end if;

  delete from public.area_service_defaults
  where restaurant_id = v_restaurant_id;
  delete from public.opening_hours
  where restaurant_id = v_restaurant_id;
  delete from public.services
  where restaurant_id = v_restaurant_id;

  insert into public.services (
    restaurant_id,
    service_key,
    name,
    sort_order,
    active
  )
  select
    v_restaurant_id,
    lower(item.value->>'service_key'),
    btrim(item.value->>'name'),
    coalesce(nullif(item.value->>'sort_order', '')::integer, item.ordinality::integer * 10),
    coalesce(nullif(item.value->>'active', '')::boolean, true)
  from jsonb_array_elements(p_services) with ordinality item(value, ordinality);

  insert into public.opening_hours (
    restaurant_id,
    weekday,
    service_key,
    is_open,
    opens_at,
    closes_at
  )
  select
    v_restaurant_id,
    (item->>'weekday')::smallint,
    lower(item->>'service_key'),
    coalesce((item->>'is_open')::boolean, false),
    nullif(item->>'opens_at', '')::time,
    nullif(item->>'closes_at', '')::time
  from jsonb_array_elements(coalesce(p_opening_hours, '[]'::jsonb)) item;

  insert into public.area_service_defaults (
    restaurant_id,
    area_id,
    service_key,
    start_time,
    end_time
  )
  select
    v_restaurant_id,
    area.id,
    service.service_key,
    nullif(item.value->>'start_time', '')::time,
    nullif(item.value->>'end_time', '')::time
  from public.work_areas area
  cross join jsonb_array_elements(p_services) item(value)
  join public.services service
    on service.restaurant_id = v_restaurant_id
   and service.service_key = lower(item.value->>'service_key')
  where area.restaurant_id = v_restaurant_id
    and area.active
    and service.active;

  return v_result || jsonb_build_object(
    'service_count',
    jsonb_array_length(p_services)
  );
end
$setup$;

alter function public.setup_owner_workspace_v2(
  text,text,citext,text,text,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb
) owner to postgres;

revoke all on function public.setup_owner_workspace_v2(
  text,text,citext,text,text,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb
) from public, anon, authenticated;
grant execute on function public.setup_owner_workspace_v2(
  text,text,citext,text,text,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb
) to authenticated;

revoke all on function public.setup_owner_workspace(
  text,text,citext,text,text,jsonb,jsonb,jsonb,jsonb,jsonb
) from authenticated;

comment on function public.setup_owner_workspace_v2(
  text,text,citext,text,text,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb
) is
  'Creates one pilot venue with validated configurable service periods in one transaction.';

notify pgrst, 'reload schema';
commit;
