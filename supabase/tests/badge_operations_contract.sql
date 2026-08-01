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
    insert into public.profiles (first_name, last_name, email)
    values ('Phase 1', 'Fixture', 'phase1-' || gen_random_uuid()::text || '@example.test')
    returning id into v_owner_profile_id;
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

do $verify_automatic_badge_service$
declare
  v_owner_profile_id uuid;
  v_owner_auth_user_id uuid;
  v_anchor_restaurant_id uuid;
  v_restaurant_id uuid := gen_random_uuid();
  v_employee_id uuid := gen_random_uuid();
  v_business_date date := (now() at time zone 'Europe/Brussels')::date;
  v_week_start date;
  v_weekday integer;
  v_local_time time := (now() at time zone 'Europe/Brussels')::time;
  v_verification jsonb;
  v_recorded jsonb;
  v_roster jsonb;
  v_entry_id uuid;
begin
  select p.id, p.auth_user_id
  into v_owner_profile_id, v_owner_auth_user_id
  from public.profiles p
  join public.restaurant_memberships m on m.profile_id = p.id
  where p.auth_user_id is not null
    and m.role = 'owner'
    and m.status = 'active'
  order by m.created_at
  limit 1;

  if v_owner_profile_id is null then
    v_owner_auth_user_id := gen_random_uuid();
    insert into auth.users (id, email)
    values (
      v_owner_auth_user_id,
      'badge-owner-' || v_owner_auth_user_id::text || '@example.test'
    );
    insert into public.profiles (auth_user_id, first_name, last_name, email)
    values (
      v_owner_auth_user_id,
      'Badge',
      'Owner',
      'badge-owner-' || v_owner_auth_user_id::text || '@example.test'
    )
    returning id into v_owner_profile_id;
    insert into public.restaurants (workspace_slug, name, owner_profile_id)
    values (
      'badge-anchor-' || replace(gen_random_uuid()::text, '-', ''),
      'Badge authentication anchor',
      v_owner_profile_id
    )
    returning id into v_anchor_restaurant_id;
    insert into public.restaurant_memberships (restaurant_id, profile_id, role, status)
    values (v_anchor_restaurant_id, v_owner_profile_id, 'owner', 'active');
    insert into public.services (restaurant_id, service_key, name, sort_order)
    values
      (v_anchor_restaurant_id, 'lunch', 'Lunch', 1),
      (v_anchor_restaurant_id, 'evening', 'Evening', 2);
  end if;

  perform set_config(
    'request.jwt.claims',
    jsonb_build_object('sub', v_owner_auth_user_id)::text,
    true
  );

  insert into public.restaurants (id, workspace_slug, name, owner_profile_id)
  values (
    v_restaurant_id,
    'badge-contract-' || replace(v_restaurant_id::text, '-', ''),
    'Automatic badge service contract',
    v_owner_profile_id
  );
  insert into public.restaurant_settings (restaurant_id, timezone)
  values (v_restaurant_id, 'Europe/Brussels');
  insert into public.restaurant_memberships (restaurant_id, profile_id, role, status)
  values (v_restaurant_id, v_owner_profile_id, 'owner', 'active');
  insert into public.services (restaurant_id, service_key, name, sort_order)
  values
    (v_restaurant_id, 'lunch', 'Lunch', 10),
    (v_restaurant_id, 'evening', 'Evening', 20);
  insert into public.employees (id, restaurant_id, display_name, active)
  values (v_employee_id, v_restaurant_id, 'Automatic Badge Employee', true);
  insert into public.employee_access (
    restaurant_id, employee_id, profile_id, access_status, badge_enabled
  )
  values (v_restaurant_id, v_employee_id, v_owner_profile_id, 'active', true);
  insert into public.employee_pin_credentials (
    restaurant_id, employee_id, pin_hash, pin_status
  )
  values (
    v_restaurant_id,
    v_employee_id,
    public.crypt('2468', public.gen_salt('bf')),
    'active'
  );

  v_week_start := public.week_start_for_date(v_business_date);
  v_weekday := (v_business_date - v_week_start) + 1;
  insert into public.work_weeks (restaurant_id, week_start, planning_status)
  values (v_restaurant_id, v_week_start, 'published');
  insert into public.planned_shifts (
    restaurant_id, employee_id, week_start, weekday, service_key, starts_at, ends_at
  )
  values (
    v_restaurant_id,
    v_employee_id,
    v_week_start,
    v_weekday,
    'evening',
    (v_local_time - interval '1 hour')::time,
    (v_local_time + interval '2 hours')::time
  );

  v_verification := public.verify_badge_pin(v_restaurant_id, v_employee_id, '2468');
  v_recorded := public.record_badge_entry(
    v_restaurant_id,
    v_employee_id,
    (v_verification->>'badge_token')::uuid,
    null,
    null,
    'not_required'
  );
  if v_recorded->>'action' <> 'in' or v_recorded->>'service_key' <> 'evening' then
    raise exception 'Clock-in did not infer the employee planned service.';
  end if;

  v_roster := public.list_badge_roster(v_restaurant_id);
  if not exists (
    select 1
    from jsonb_array_elements(v_roster->'employees') employee
    where employee->>'employee_id' = v_employee_id::text
      and (employee->>'clocked_in')::boolean
      and employee->>'service_key' = 'evening'
  ) then
    raise exception 'Badge roster did not expose the open entry state.';
  end if;

  v_verification := public.verify_badge_pin(v_restaurant_id, v_employee_id, '2468');
  v_recorded := public.record_badge_entry(
    v_restaurant_id,
    v_employee_id,
    (v_verification->>'badge_token')::uuid,
    null,
    null,
    'not_required'
  );
  if v_recorded->>'action' <> 'out' or v_recorded->>'service_key' <> 'evening' then
    raise exception 'Clock-out did not preserve the open entry service.';
  end if;

  v_roster := public.list_badge_roster(v_restaurant_id);
  if not exists (
    select 1
    from jsonb_array_elements(v_roster->'employees') employee
    where employee->>'employee_id' = v_employee_id::text
      and not (employee->>'clocked_in')::boolean
      and employee->>'last_action' = 'out'
      and employee->>'last_local_time' is not null
  ) then
    raise exception 'Badge roster did not expose the latest clock-out state.';
  end if;

  select id into v_entry_id
  from public.time_entries
  where restaurant_id = v_restaurant_id
    and employee_id = v_employee_id
    and business_date = v_business_date
    and service_key = 'evening'
    and status = 'closed';
  update public.time_entries
  set clock_in_at = now() - interval '1 hour',
      clock_out_at = now() - interval '15 minutes'
  where id = v_entry_id;

  v_verification := public.verify_badge_pin(v_restaurant_id, v_employee_id, '2468');
  v_recorded := public.record_badge_entry(
    v_restaurant_id,
    v_employee_id,
    (v_verification->>'badge_token')::uuid,
    null,
    null,
    'not_required'
  );
  if v_recorded->>'action' <> 'in'
      or (v_recorded->>'resumed')::boolean is not true
      or (v_recorded->>'break_minutes_added')::integer <> 15
      or (v_recorded->>'total_break_minutes')::integer <> 15 then
    raise exception 'Repeated clock-in did not resume the entry and record the break.';
  end if;

  v_verification := public.verify_badge_pin(v_restaurant_id, v_employee_id, '2468');
  v_recorded := public.record_badge_entry(
    v_restaurant_id,
    v_employee_id,
    (v_verification->>'badge_token')::uuid,
    null,
    null,
    'not_required'
  );
  if v_recorded->>'action' <> 'out'
      or (v_recorded->>'total_break_minutes')::integer <> 15 then
    raise exception 'Clock-out after a resumed break did not preserve total break minutes.';
  end if;

  perform public.set_badge_policy(
    v_restaurant_id,
    true,
    false,
    true,
    true
  );
  v_roster := public.list_badge_roster(v_restaurant_id);
  if (v_roster#>>'{badge_policy,photo_clock_in_required}')::boolean is not true
      or (v_roster#>>'{badge_policy,location_capture_enabled}')::boolean is not true
      or (v_roster#>>'{badge_policy,employee_mobile_badging_enabled}')::boolean is not true then
    raise exception 'Badge roster did not expose the saved evidence policy.';
  end if;

  v_verification := public.verify_badge_pin(v_restaurant_id, v_employee_id, '2468');
  begin
    perform public.record_badge_entry(
      v_restaurant_id,
      v_employee_id,
      (v_verification->>'badge_token')::uuid,
      null,
      null,
      'not_required'
    );
    raise exception 'The legacy badge RPC bypassed the required evidence policy.';
  exception
    when others then
      if sqlerrm not like '%photo is required%' then raise; end if;
  end;

  v_recorded := public.record_badge_entry_v2(
    v_restaurant_id,
    v_employee_id,
    (v_verification->>'badge_token')::uuid,
    null,
    v_restaurant_id::text || '/' || v_employee_id::text || '/fixture.jpg',
    'captured',
    50.8467,
    4.3525,
    18
  );
  if v_recorded->>'action' <> 'in'
      or (v_recorded->>'photo_recorded')::boolean is not true
      or (v_recorded->>'location_recorded')::boolean is not true then
    raise exception 'The evidence-aware badge RPC did not record clock-in evidence.';
  end if;
  select id into v_entry_id
  from public.time_entries
  where restaurant_id = v_restaurant_id
    and employee_id = v_employee_id
    and status = 'open';
  if not exists (
    select 1 from public.time_entries
    where id = v_entry_id
      and clock_in_latitude = 50.846700
      and clock_in_longitude = 4.352500
      and clock_in_accuracy_meters = 18
  ) then
    raise exception 'Clock-in location evidence was not attached to the time entry.';
  end if;

  v_verification := public.verify_badge_pin(v_restaurant_id, v_employee_id, '2468');
  v_recorded := public.record_badge_entry_v2(
    v_restaurant_id,
    v_employee_id,
    (v_verification->>'badge_token')::uuid,
    null,
    null,
    'not_required',
    50.8470,
    4.3530,
    22
  );
  if v_recorded->>'action' <> 'out' then
    raise exception 'The evidence-aware badge RPC did not clock the employee out.';
  end if;
  if not exists (
    select 1 from public.time_entries
    where id = v_entry_id
      and clock_out_latitude = 50.847000
      and clock_out_longitude = 4.353000
      and clock_out_accuracy_meters = 22
  ) then
    raise exception 'Clock-out location evidence was not attached to the time entry.';
  end if;
end
$verify_automatic_badge_service$;

do $verify_phone_access_and_unused_station_rotation$
declare
  v_restaurant_id uuid := gen_random_uuid();
  v_employee_id uuid := gen_random_uuid();
  v_owner_profile_id uuid;
  v_owner_auth_user_id uuid;
  v_created jsonb;
  v_rotated jsonb;
begin
  select p.id, p.auth_user_id
  into v_owner_profile_id, v_owner_auth_user_id
  from public.profiles p
  join public.restaurant_memberships m on m.profile_id = p.id
  where p.auth_user_id is not null
    and m.role = 'owner'
    and m.status = 'active'
  order by m.created_at
  limit 1;

  if v_owner_profile_id is null then
    v_owner_auth_user_id := gen_random_uuid();
    insert into auth.users (id, email)
    values (v_owner_auth_user_id, 'badge-device-' || v_owner_auth_user_id::text || '@example.test');
    insert into public.profiles (auth_user_id, first_name, last_name, email)
    values (
      v_owner_auth_user_id,
      'Badge',
      'Device Owner',
      'badge-device-' || v_owner_auth_user_id::text || '@example.test'
    )
    returning id into v_owner_profile_id;
  end if;

  perform set_config(
    'request.jwt.claims',
    jsonb_build_object('sub', v_owner_auth_user_id)::text,
    true
  );

  insert into public.restaurants (id, workspace_slug, name, owner_profile_id)
  values (
    v_restaurant_id,
    'badge-device-' || replace(v_restaurant_id::text, '-', ''),
    'Badge device access contract',
    v_owner_profile_id
  );
  insert into public.restaurant_settings (restaurant_id, timezone)
  values (v_restaurant_id, 'Europe/Brussels');
  insert into public.restaurant_memberships (restaurant_id, profile_id, role, status)
  values (v_restaurant_id, v_owner_profile_id, 'owner', 'active');
  insert into public.employees (id, restaurant_id, display_name, active)
  values (v_employee_id, v_restaurant_id, 'Phone Badge Employee', true);
  insert into public.employee_access (
    restaurant_id, employee_id, profile_id, access_status, badge_enabled, mobile_badging_enabled
  ) values (
    v_restaurant_id, v_employee_id, v_owner_profile_id, 'active', true, false
  );

  perform public.set_employee_mobile_badging(v_restaurant_id, v_employee_id, true);
  if not exists (
    select 1
    from public.employee_access
    where restaurant_id = v_restaurant_id
      and employee_id = v_employee_id
      and mobile_badging_enabled
  ) then
    raise exception 'Phone badging was not granted to the selected employee.';
  end if;

  v_created := public.create_restaurant_station(v_restaurant_id, 'Unused tablet');
  v_rotated := public.rotate_unused_restaurant_station_token(
    v_restaurant_id,
    (v_created->>'station_id')::uuid
  );
  if nullif(v_rotated->>'token', '') is null
      or v_rotated->>'token' = v_created->>'token' then
    raise exception 'Unused station pairing code was not replaced.';
  end if;

  perform 1 from public.resolve_station_token(v_rotated->>'token');
  begin
    perform public.rotate_unused_restaurant_station_token(
      v_restaurant_id,
      (v_created->>'station_id')::uuid
    );
    raise exception 'A connected station accepted pairing-code rotation.';
  exception
    when others then
      if sqlerrm not like '%has not connected%' then raise; end if;
  end;
end
$verify_phone_access_and_unused_station_rotation$;

rollback;
