-- Behavioral verification for Phase 1 operational state and service contracts.
-- Every mutation is contained in a rolled-back transaction.
begin;

do $verify_configurable_services$
declare
  v_restaurant_id uuid;
  v_owner_profile_id uuid;
begin
  select p.id
  into v_owner_profile_id
  from public.profiles p
  limit 1;

  if v_owner_profile_id is null then
    raise exception 'No profile fixture is available.';
  end if;

  insert into public.restaurants (
    workspace_slug,
    name,
    owner_profile_id
  )
  values (
    'phase1-contract-' || replace(gen_random_uuid()::text, '-', ''),
    'Phase 1 contract verification',
    v_owner_profile_id
  )
  returning id into v_restaurant_id;

  insert into public.services (
    restaurant_id,
    service_key,
    name,
    sort_order
  )
  values
    (v_restaurant_id, 'breakfast', 'Breakfast', 1),
    (v_restaurant_id, 'late-night', 'Late night', 2);

  delete from public.services
  where restaurant_id = v_restaurant_id
    and service_key = 'breakfast';

  if not exists (
    select 1
    from public.services
    where restaurant_id = v_restaurant_id
      and service_key = 'late-night'
  ) then
    raise exception 'Configurable service periods were not retained independently.';
  end if;

  begin
    insert into public.services (restaurant_id, service_key, name, sort_order)
    values (v_restaurant_id, 'Invalid key', 'Invalid', 3);
    raise exception 'Invalid service key was accepted.';
  exception
    when check_violation then null;
  end;
end
$verify_configurable_services$;

do $verify_enum_columns$
begin
  if (
    select count(*)
    from information_schema.columns c
    where c.table_schema = 'public'
      and (c.table_name, c.column_name, c.udt_name) in (
        ('employee_availability_slots', 'availability_state', 'service_availability_state'),
        ('work_weeks', 'planning_status', 'planning_status'),
        ('work_weeks', 'actuals_status', 'actuals_status'),
        ('absences', 'status', 'operational_request_status'),
        ('work_pattern_exceptions', 'status', 'operational_request_status'),
        ('time_entries', 'status', 'time_entry_status'),
        ('time_entries', 'source', 'time_entry_source'),
        ('planned_shifts', 'source', 'planned_shift_source'),
        ('employee_availability_submissions', 'status', 'availability_submission_status')
      )
  ) <> 9 then
    raise exception 'One or more operational columns are not enum-backed.';
  end if;
end
$verify_enum_columns$;

rollback;
