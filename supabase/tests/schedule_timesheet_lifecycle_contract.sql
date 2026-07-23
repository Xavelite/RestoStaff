-- Canonical Phase 4 Planning/Actuals lifecycle verification.
-- All fixture mutations roll back.
begin;

do $routine_lint_contract$
declare
  v_actuals_definition text;
  v_availability_definition text;
  v_team_definition text;
begin
  select pg_get_functiondef(
    'public.save_actuals_lifecycle(uuid,text,jsonb)'::regprocedure
  ) into v_actuals_definition;
  select pg_get_functiondef(
    'public.save_employee_availability(uuid,uuid,jsonb)'::regprocedure
  ) into v_availability_definition;
  select pg_get_functiondef(
    'public.save_team_model(uuid,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb)'::regprocedure
  ) into v_team_definition;

  if position(
    '''open''::public.time_entry_status'
    in v_actuals_definition
  ) = 0 then
    raise exception 'Actuals enum assignment is not explicit.';
  end if;
  if position('v_to_date' in v_availability_definition) > 0 then
    raise exception 'Availability routine retains obsolete range state.';
  end if;
  if position('v_actor record' in v_team_definition) > 0
      or position('into v_actor' in v_team_definition) > 0 then
    raise exception 'Team routine retains obsolete actor state.';
  end if;
end
$routine_lint_contract$;

do $phase4_schema$
begin
  if to_regprocedure(
    'public.save_manager_planning(uuid,date,text,jsonb,jsonb,bigint,text,boolean,boolean)'
  ) is null then
    raise exception 'Revision-backed Planning RPC is missing';
  end if;
  if to_regprocedure(
    'public.save_manager_planning(uuid,date,text,jsonb,jsonb,timestamptz)'
  ) is not null then
    raise exception 'Timestamp-backed Planning RPC remains';
  end if;

  if (
    select count(*)
    from information_schema.columns
    where table_schema = 'public'
      and (
        (table_name = 'work_weeks' and column_name in (
          'planning_revision', 'actuals_revision'
        ))
        or (table_name = 'time_entries' and column_name = 'revision')
      )
  ) <> 3 then
    raise exception 'Operational revision columns are incomplete';
  end if;

  if (
    select count(*)
    from pg_trigger
    where not tgisinternal
      and tgname in (
        'time_entries_revision_guard',
        'time_entries_history_guard',
        'time_entries_actuals_revision',
        'work_week_events_append_only',
        'time_entry_adjustments_append_only'
      )
  ) <> 5 then
    raise exception 'Operational integrity triggers are incomplete';
  end if;

  if position(
    'ON DELETE RESTRICT'
    in pg_get_constraintdef(
      (
        select oid from pg_constraint
        where conname = 'work_week_events_week_fk'
      )
    )
  ) = 0 then
    raise exception 'Work-week audit evidence can still cascade away';
  end if;
end
$phase4_schema$;

do $phase4_behavior$
declare
  v_owner_profile_id uuid;
  v_owner_auth_user_id uuid;
  v_restaurant_id uuid := gen_random_uuid();
  v_employee_id uuid := gen_random_uuid();
  v_area_id uuid := gen_random_uuid();
  v_job_id uuid := gen_random_uuid();
  v_planning_week date :=
    public.week_start_for_date(current_date) + 7;
  v_actuals_date date :=
    public.week_start_for_date(current_date) - 14;
  v_actuals_week date :=
    public.week_start_for_date(current_date) - 14;
  v_shift jsonb;
  v_plan_result jsonb;
  v_plan_revision bigint;
  v_shift_id uuid;
  v_time_entry_id uuid;
  v_entry_revision bigint;
  v_actuals_revision bigint;
  v_adjustment_id uuid;
  v_anchor_restaurant_id uuid;
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
    values (v_owner_auth_user_id, 'phase4-owner-' || v_owner_auth_user_id::text || '@example.test');
    insert into public.profiles (auth_user_id, first_name, last_name, email)
    values (
      v_owner_auth_user_id,
      'Phase 4',
      'Owner',
      'phase4-owner-' || v_owner_auth_user_id::text || '@example.test'
    )
    returning id into v_owner_profile_id;
    insert into public.restaurants (workspace_slug, name, owner_profile_id)
    values (
      'phase4-anchor-' || replace(gen_random_uuid()::text, '-', ''),
      'Phase 4 authentication anchor',
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
    jsonb_build_object(
      'sub', v_owner_auth_user_id,
      'email', (
        select email from public.profiles where id = v_owner_profile_id
      )
    )::text,
    true
  );

  insert into public.restaurants (
    id, workspace_slug, name, owner_profile_id
  )
  values (
    v_restaurant_id,
    'phase4-' || replace(v_restaurant_id::text, '-', ''),
    'Phase 4 lifecycle fixture',
    v_owner_profile_id
  );
  insert into public.restaurant_settings (restaurant_id, timezone)
  values (v_restaurant_id, 'Europe/Brussels');
  insert into public.restaurant_memberships (
    restaurant_id, profile_id, role, status
  )
  values (v_restaurant_id, v_owner_profile_id, 'owner', 'active');
  insert into public.services (
    restaurant_id, service_key, name, sort_order
  )
  values
    (v_restaurant_id, 'lunch', 'Lunch', 10),
    (v_restaurant_id, 'evening', 'Evening', 20);

  insert into public.work_areas (
    id, restaurant_id, code, name, active
  )
  values (
    v_area_id, v_restaurant_id, 'floor', 'Floor', true
  );
  insert into public.job_functions (
    id, restaurant_id, code, name, active
  )
  values (
    v_job_id, v_restaurant_id, 'server', 'Server', true
  );
  insert into public.employees (
    id, restaurant_id, display_name, active
  )
  values (
    v_employee_id, v_restaurant_id, 'Phase 4 employee', true
  );
  insert into public.employee_access (
    restaurant_id, employee_id, profile_id, access_status, badge_enabled
  )
  values (
    v_restaurant_id, v_employee_id, v_owner_profile_id, 'active', true
  );
  insert into public.employee_job_functions (
    restaurant_id, employee_id, job_function_id, is_primary, active
  )
  values (
    v_restaurant_id, v_employee_id, v_job_id, true, true
  );
  insert into public.opening_hours (
    restaurant_id, weekday, service_key, is_open, opens_at, closes_at
  )
  values (
    v_restaurant_id, 1, 'lunch', true, '12:00', '15:00'
  );
  insert into public.coverage_requirements (
    restaurant_id, area_id, job_function_id, service_key,
    coverage_scope, weekday, required_count, active
  )
  values (
    v_restaurant_id, v_area_id, v_job_id, 'lunch',
    'weekday', 1, 1, true
  );

  v_shift := jsonb_build_array(jsonb_build_object(
    'employee_id', v_employee_id,
    'weekday', 1,
    'service_key', 'lunch',
    'area_id', v_area_id,
    'job_function_id', v_job_id,
    'starts_at', '12:00',
    'ends_at', '15:00',
    'source', 'manual'
  ));

  v_plan_result := public.save_manager_planning(
    v_restaurant_id,
    v_planning_week,
    'draft',
    v_shift,
    '[]'::jsonb,
    0,
    'Initial draft'
  );
  select planning_revision into v_plan_revision
  from public.work_weeks
  where restaurant_id = v_restaurant_id
    and week_start = v_planning_week;
  if v_plan_revision <> 1 then
    raise exception 'Initial Planning save did not advance revision';
  end if;
  select id into v_shift_id
  from public.planned_shifts
  where restaurant_id = v_restaurant_id
    and week_start = v_planning_week;

  begin
    perform public.save_manager_planning(
      v_restaurant_id, v_planning_week, 'draft',
      v_shift, '[]'::jsonb, 0, 'Stale save'
    );
    raise exception 'Stale Planning revision was accepted';
  exception
    when others then
      if sqlerrm not like 'CONFLICT:%' then raise; end if;
  end;

  perform public.save_manager_planning(
    v_restaurant_id,
    v_planning_week,
    'draft',
    jsonb_set(v_shift, '{0,ends_at}', '"15:30"'),
    '[]'::jsonb,
    1,
    'Draft time update'
  );
  if not exists (
    select 1 from public.planned_shifts
    where id = v_shift_id and ends_at = '15:30'::time
  ) then
    raise exception 'Draft Planning save replaced a stable shift identity';
  end if;

  perform public.save_manager_planning(
    v_restaurant_id,
    v_planning_week,
    'published',
    jsonb_set(v_shift, '{0,ends_at}', '"15:30"'),
    '[]'::jsonb,
    2,
    'Fixture planning reviewed'
  );
  if not exists (
    select 1
    from public.work_week_events e
    where e.restaurant_id = v_restaurant_id
      and e.week_start = v_planning_week
      and e.event_type = 'planning_published'
      and jsonb_array_length(e.new_values->'planning'->'shifts') = 1
  ) then
    raise exception 'Planning publication did not preserve its snapshot';
  end if;

  begin
    perform public.save_manager_planning(
      v_restaurant_id,
      v_planning_week,
      'published',
      v_shift,
      '[]'::jsonb,
      3,
      'Silent overwrite attempt'
    );
    raise exception 'Published Planning was overwritten';
  exception
    when others then
      if sqlerrm not like 'Revert the published plan%' then raise; end if;
  end;

  perform public.save_manager_planning(
    v_restaurant_id,
    v_planning_week,
    'draft',
    '[]'::jsonb,
    '[]'::jsonb,
    3,
    'Reopened for fixture correction'
  );
  if not exists (
    select 1 from public.planned_shifts
    where id = v_shift_id and ends_at = '15:30'::time
  ) then
    raise exception 'Reverting Planning altered the published shift set';
  end if;

  insert into public.time_entries (
    restaurant_id, employee_id, business_date, service_key,
    clock_in_at, clock_out_at, break_minutes, source, status
  )
  values (
    v_restaurant_id,
    v_employee_id,
    v_actuals_date,
    'lunch',
    (v_actuals_date::text || ' 12:00+01')::timestamptz,
    (v_actuals_date::text || ' 15:00+01')::timestamptz,
    15,
    'badge_terminal',
    'closed'
  )
  returning id, revision into v_time_entry_id, v_entry_revision;

  select actuals_revision into v_actuals_revision
  from public.work_weeks
  where restaurant_id = v_restaurant_id
    and week_start = v_actuals_week;
  if v_actuals_revision <> 1 then
    raise exception 'Time entry did not advance Actuals revision';
  end if;

  perform public.save_actuals_lifecycle(
    v_restaurant_id,
    'approve_week',
    jsonb_build_object(
      'week_start', v_actuals_week,
      'expected_revision', v_actuals_revision,
      'reason', 'Fixture Actuals reviewed'
    )
  );
  if not exists (
    select 1
    from public.work_week_events e
    where e.restaurant_id = v_restaurant_id
      and e.week_start = v_actuals_week
      and e.event_type = 'actuals_approved'
      and jsonb_array_length(e.new_values->'actuals'->'entries') = 1
  ) then
    raise exception 'Actuals approval did not preserve its snapshot';
  end if;

  begin
    update public.time_entries
    set break_minutes = 20
    where id = v_time_entry_id;
    raise exception 'Approved Actuals entry was changed';
  exception
    when others then
      if sqlerrm not like 'Reopen this Timesheet week%' then raise; end if;
  end;

  begin
    perform public.save_actuals_lifecycle(
      v_restaurant_id,
      'reopen_week',
      jsonb_build_object(
        'week_start', v_actuals_week,
        'expected_revision', 1,
        'reason', 'Stale reopen'
      )
    );
    raise exception 'Stale Actuals revision was accepted';
  exception
    when others then
      if sqlerrm not like 'CONFLICT:%' then raise; end if;
  end;

  perform public.save_actuals_lifecycle(
    v_restaurant_id,
    'reopen_week',
    jsonb_build_object(
      'week_start', v_actuals_week,
      'expected_revision', 2,
      'reason', 'Reopened for fixture correction'
    )
  );

  perform public.save_actuals_lifecycle(
    v_restaurant_id,
    'adjust_entry',
    jsonb_build_object(
      'time_entry_id', v_time_entry_id,
      'clock_in_at', (v_actuals_date::text || ' 12:00+01')::timestamptz,
      'clock_out_at', (v_actuals_date::text || ' 15:00+01')::timestamptz,
      'break_minutes', 20,
      'expected_revision', v_entry_revision,
      'reason', 'Fixture break correction'
    )
  );
  select id into v_adjustment_id
  from public.time_entry_adjustments
  where restaurant_id = v_restaurant_id
    and time_entry_id = v_time_entry_id
  order by created_at desc
  limit 1;

  begin
    update public.time_entry_adjustments
    set reason = 'Tampered'
    where id = v_adjustment_id;
    raise exception 'Audit adjustment was mutable';
  exception
    when others then
      if sqlerrm not like '%append-only operational evidence%' then raise; end if;
  end;

  begin
    delete from public.time_entries where id = v_time_entry_id;
    raise exception 'Time-entry history was deletable';
  exception
    when others then
      if sqlerrm not like 'Time entries are historical evidence%' then raise; end if;
  end;
end
$phase4_behavior$;

rollback;
