-- GO Pilot closure verification.
-- Focuses the postponed hardening areas that changed after Phase 7:
-- notification RLS, payroll export preview/config/lineage, and Actuals
-- approval auto-finalize completeness.
-- All fixture writes are rolled back.
begin;

create temp table phase8_context (
  key text primary key,
  value text not null
) on commit drop;
grant select on phase8_context to authenticated;

do $phase8_fixture$
declare
  v_owner_profile_id uuid;
  v_owner_auth_user_id uuid;
  v_second_profile_id uuid;
  v_second_auth_user_id uuid;
  v_restaurant_id uuid := gen_random_uuid();
begin
  select p.id, p.auth_user_id
  into v_owner_profile_id, v_owner_auth_user_id
  from public.profiles p
  where p.auth_user_id is not null
  order by p.created_at
  limit 1;

  select p.id, p.auth_user_id
  into v_second_profile_id, v_second_auth_user_id
  from public.profiles p
  where p.auth_user_id is not null
    and p.id <> v_owner_profile_id
  order by p.created_at
  limit 1;

  if v_owner_profile_id is null then
    v_owner_auth_user_id := gen_random_uuid();
    insert into auth.users (id, email)
    values (v_owner_auth_user_id, 'phase8-owner-' || v_owner_auth_user_id::text || '@example.test');
    insert into public.profiles (auth_user_id, first_name, last_name, email)
    values (
      v_owner_auth_user_id,
      'Phase 8',
      'Owner',
      'phase8-owner-' || v_owner_auth_user_id::text || '@example.test'
    )
    returning id into v_owner_profile_id;
  end if;

  if v_second_profile_id is null then
    v_second_auth_user_id := gen_random_uuid();
    insert into auth.users (id, email)
    values (v_second_auth_user_id, 'phase8-manager-' || v_second_auth_user_id::text || '@example.test');
    insert into public.profiles (auth_user_id, first_name, last_name, email)
    values (
      v_second_auth_user_id,
      'Phase 8',
      'Manager',
      'phase8-manager-' || v_second_auth_user_id::text || '@example.test'
    )
    returning id into v_second_profile_id;
  end if;

  insert into public.restaurants (
    id, workspace_slug, name, owner_profile_id
  )
  values (
    v_restaurant_id,
    'phase8-notifications-' || replace(v_restaurant_id::text, '-', ''),
    'Phase 8 notification fixture',
    v_owner_profile_id
  );
  insert into public.restaurant_settings (restaurant_id, timezone)
  values (v_restaurant_id, 'Europe/Brussels');
  insert into public.restaurant_memberships (
    restaurant_id, profile_id, role, status
  )
  values
    (v_restaurant_id, v_owner_profile_id, 'owner', 'active'),
    (v_restaurant_id, v_second_profile_id, 'manager', 'active');

  insert into public.notification_preferences (
    restaurant_id, profile_id, notification_type, in_app_enabled, push_enabled
  )
  values
    (v_restaurant_id, v_owner_profile_id, 'shift_soon', true, false),
    (v_restaurant_id, v_second_profile_id, 'shift_soon', false, false);

  insert into public.notification_receipts (
    restaurant_id, profile_id, notification_key, notification_type, read_at
  )
  values
    (v_restaurant_id, v_owner_profile_id, 'phase8-owner-key', 'shift_soon', now()),
    (v_restaurant_id, v_second_profile_id, 'phase8-second-key', 'shift_soon', now());

  insert into phase8_context (key, value)
  values
    ('notification_restaurant_id', v_restaurant_id::text),
    ('owner_profile_id', v_owner_profile_id::text),
    ('owner_auth_user_id', v_owner_auth_user_id::text),
    ('second_profile_id', v_second_profile_id::text),
    ('second_auth_user_id', v_second_auth_user_id::text);
end
$phase8_fixture$;

do $phase8_owner_claims$
begin
  perform set_config(
    'request.jwt.claims',
    jsonb_build_object(
      'sub', (select value from phase8_context where key = 'owner_auth_user_id')
    )::text,
    true
  );
end
$phase8_owner_claims$;
set local role authenticated;

do $notification_rls$
declare
  v_restaurant_id uuid := (
    select value::uuid from phase8_context where key = 'notification_restaurant_id'
  );
  v_owner_profile_id uuid := (
    select value::uuid from phase8_context where key = 'owner_profile_id'
  );
  v_second_profile_id uuid := (
    select value::uuid from phase8_context where key = 'second_profile_id'
  );
begin
  if public.current_profile_id() <> v_owner_profile_id then
    raise exception 'Authenticated notification fixture did not resolve the expected profile.';
  end if;

  if (
    select count(*)
    from public.notification_preferences
    where restaurant_id = v_restaurant_id
  ) <> 1 then
    raise exception 'Notification preferences RLS must expose only the current profile.';
  end if;

  if (
    select count(*)
    from public.notification_receipts
    where restaurant_id = v_restaurant_id
  ) <> 1 then
    raise exception 'Notification receipts RLS must expose only the current profile.';
  end if;

  insert into public.notification_preferences (
    restaurant_id, profile_id, notification_type, in_app_enabled, push_enabled
  )
  values (
    v_restaurant_id, v_owner_profile_id,
    'absence_request_decided', true, false
  );

  begin
    insert into public.notification_preferences (
      restaurant_id, profile_id, notification_type, in_app_enabled, push_enabled
    )
    values (
      v_restaurant_id, v_second_profile_id,
      'absence_request_decided', true, false
    );
    raise exception 'Cross-profile notification preference insert succeeded.';
  exception
    when others then
      if sqlerrm not like '%row-level security%' then
        raise;
      end if;
  end;

  update public.notification_receipts
  set dismissed_at = now()
  where restaurant_id = v_restaurant_id
    and profile_id = v_second_profile_id;
  if found then
    raise exception 'Cross-profile notification receipt update succeeded.';
  end if;
end
$notification_rls$;

reset role;

do $payroll_preview_and_lineage$
declare
  v_owner_profile_id uuid := (
    select value::uuid from phase8_context where key = 'owner_profile_id'
  );
  v_owner_auth_user_id uuid := (
    select value::uuid from phase8_context where key = 'owner_auth_user_id'
  );
  v_manager_profile_id uuid := (
    select value::uuid from phase8_context where key = 'second_profile_id'
  );
  v_manager_auth_user_id uuid := (
    select value::uuid from phase8_context where key = 'second_auth_user_id'
  );
  v_restaurant_id uuid := gen_random_uuid();
  v_employee_id uuid := gen_random_uuid();
  v_week_start date := public.week_start_for_date(current_date) - 21;
  v_actuals_revision bigint;
  v_preview jsonb;
  v_run jsonb;
  v_run_id uuid;
  v_runs_before integer;
begin
  perform set_config(
    'request.jwt.claims',
    jsonb_build_object('sub', v_owner_auth_user_id)::text,
    true
  );

  insert into public.restaurants (
    id, workspace_slug, name, owner_profile_id
  )
  values (
    v_restaurant_id,
    'phase8-payroll-' || replace(v_restaurant_id::text, '-', ''),
    'Phase 8 payroll fixture',
    v_owner_profile_id
  );
  insert into public.restaurant_settings (restaurant_id, timezone)
  values (v_restaurant_id, 'Europe/Brussels');
  insert into public.restaurant_memberships (
    restaurant_id, profile_id, role, status
  )
  values
    (v_restaurant_id, v_owner_profile_id, 'owner', 'active'),
    (v_restaurant_id, v_manager_profile_id, 'manager', 'active');
  insert into public.services (
    restaurant_id, service_key, name, sort_order
  )
  values
    (v_restaurant_id, 'lunch', 'Lunch', 10),
    (v_restaurant_id, 'evening', 'Evening', 20);
  insert into public.employees (
    id, restaurant_id, display_name, first_name, last_name, active
  )
  values (
    v_employee_id,
    v_restaurant_id,
    'Payroll Closure',
    'Payroll',
    'Closure',
    true
  );

  perform public.save_actuals_lifecycle(
    v_restaurant_id,
    'manual_entry',
    jsonb_build_object(
      'employee_id', v_employee_id,
      'business_date', v_week_start,
      'service_key', 'lunch',
      'clock_in_at', (v_week_start::text || ' 10:00+01')::timestamptz,
      'clock_out_at', (v_week_start::text || ' 14:00+01')::timestamptz,
      'break_minutes', 30,
      'reason', 'Phase 8 payroll preview fixture'
    )
  );

  perform public.set_payroll_export_columns(
    v_restaurant_id,
    '["employee_name","date","worked_hours","notes"]'::jsonb
  );
  if (
    select payroll_export_columns
    from public.restaurant_settings
    where restaurant_id = v_restaurant_id
  ) <> '["employee_name","date","worked_hours","notes"]'::jsonb then
    raise exception 'Payroll column default was not persisted exactly.';
  end if;

  select count(*) into v_runs_before
  from public.payroll_export_runs
  where restaurant_id = v_restaurant_id;

  v_preview := public.preview_payroll_export(
    v_restaurant_id,
    v_week_start,
    v_week_start + 6,
    '["employee_name","date","worked_hours"]'::jsonb
  );
  if v_preview->>'approved' <> 'false'
      or jsonb_array_length(v_preview->'rows') <> 1
      or (v_preview->'headers'->>0) <> 'Employee name'
      or (
        select count(*)
        from public.payroll_export_runs
        where restaurant_id = v_restaurant_id
      ) <> v_runs_before then
    raise exception 'Draft payroll preview must be read-only, unapproved and projected by the server.';
  end if;

  begin
    perform public.create_payroll_export_run(
      v_restaurant_id,
      v_week_start,
      v_week_start + 6,
      '["employee_name","date","worked_hours"]'::jsonb
    );
    raise exception 'Official payroll export was created before approval.';
  exception
    when others then
      if sqlerrm not like 'Every included Timesheet week must be approved%' then
        raise;
      end if;
  end;

  insert into public.employee_payroll_profiles (
    restaurant_id, employee_id, payroll_employee_id
  )
  values (v_restaurant_id, v_employee_id, 'PHASE8-PAY-001');

  select actuals_revision
  into v_actuals_revision
  from public.work_weeks
  where restaurant_id = v_restaurant_id
    and week_start = v_week_start;

  perform public.save_actuals_lifecycle(
    v_restaurant_id,
    'approve_week',
    jsonb_build_object(
      'week_start', v_week_start,
      'expected_revision', v_actuals_revision,
      'reason', 'Phase 8 payroll approval fixture'
    )
  );

  v_run := public.create_payroll_export_run(
    v_restaurant_id,
    v_week_start,
    v_week_start + 6,
    '["employee_name","date","worked_hours"]'::jsonb
  );
  v_run_id := (v_run->>'run_id')::uuid;
  if (v_run->'payload'->'columns') <> '["employee_name","date","worked_hours"]'::jsonb
      or (v_run->>'schema_version')::integer <> 2
      or length(v_run->>'payload_sha256') <> 64 then
    raise exception 'Official payroll export did not preserve the chosen server column template.';
  end if;
  if (public.get_payroll_export_run(v_restaurant_id, v_run_id)->>'payload_sha256')
      <> (v_run->>'payload_sha256') then
    raise exception 'Official payroll export re-download does not match stored evidence.';
  end if;

  perform set_config(
    'request.jwt.claims',
    jsonb_build_object('sub', v_manager_auth_user_id)::text,
    true
  );
  begin
    perform public.set_payroll_export_columns(
      v_restaurant_id,
      '["employee_name"]'::jsonb
    );
    raise exception 'Manager changed owner-only payroll export columns.';
  exception
    when others then
      if sqlerrm not like 'Only an owner can configure payroll export columns%' then
        raise;
      end if;
  end;
end
$payroll_preview_and_lineage$;

do $actuals_auto_finalize_guard$
declare
  v_owner_profile_id uuid := (
    select value::uuid from phase8_context where key = 'owner_profile_id'
  );
  v_owner_auth_user_id uuid := (
    select value::uuid from phase8_context where key = 'owner_auth_user_id'
  );
  v_restaurant_id uuid := gen_random_uuid();
  v_employee_id uuid := gen_random_uuid();
  v_area_id uuid := gen_random_uuid();
  v_job_id uuid := gen_random_uuid();
  v_week_start date := public.week_start_for_date(current_date) - 35;
  v_missing_week date := public.week_start_for_date(current_date) - 42;
  v_actuals_revision bigint;
begin
  perform set_config(
    'request.jwt.claims',
    jsonb_build_object('sub', v_owner_auth_user_id)::text,
    true
  );

  insert into public.restaurants (
    id, workspace_slug, name, owner_profile_id
  )
  values (
    v_restaurant_id,
    'phase8-actuals-' || replace(v_restaurant_id::text, '-', ''),
    'Phase 8 Actuals fixture',
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
  values (v_area_id, v_restaurant_id, 'floor', 'Floor', true);
  insert into public.job_functions (
    id, restaurant_id, code, name, active
  )
  values (v_job_id, v_restaurant_id, 'server', 'Server', true);
  insert into public.employees (
    id, restaurant_id, display_name, active
  )
  values (v_employee_id, v_restaurant_id, 'Phase 8 Actuals employee', true);

  insert into public.work_weeks (
    restaurant_id, week_start, planning_status, actuals_status, planning_revision
  )
  values (v_restaurant_id, v_week_start, 'draft', 'open', 1);
  insert into public.planned_shifts (
    restaurant_id, week_start, employee_id, weekday, service_key,
    area_id, job_function_id, starts_at, ends_at, source
  )
  values (
    v_restaurant_id, v_week_start, v_employee_id, 1, 'lunch',
    v_area_id, v_job_id, '10:00', '14:00', 'manual'
  );
  insert into public.time_entries (
    restaurant_id, employee_id, business_date, service_key,
    clock_in_at, clock_out_at, break_minutes, source, status
  )
  values (
    v_restaurant_id, v_employee_id, v_week_start, 'lunch',
    (v_week_start::text || ' 10:00+01')::timestamptz,
    (v_week_start::text || ' 14:00+01')::timestamptz,
    30, 'badge_terminal', 'closed'
  );

  select actuals_revision
  into v_actuals_revision
  from public.work_weeks
  where restaurant_id = v_restaurant_id
    and week_start = v_week_start;

  perform public.save_actuals_lifecycle(
    v_restaurant_id,
    'approve_week',
    jsonb_build_object(
      'week_start', v_week_start,
      'expected_revision', v_actuals_revision,
      'reason', 'Phase 8 auto-finalize approval fixture'
    )
  );
  if not exists (
    select 1
    from public.work_weeks
    where restaurant_id = v_restaurant_id
      and week_start = v_week_start
      and planning_status = 'published'
      and actuals_status = 'approved'
  ) or not exists (
    select 1
    from public.work_week_events
    where restaurant_id = v_restaurant_id
      and week_start = v_week_start
      and event_type = 'planning_finalized'
  ) then
    raise exception 'Actuals approval did not auto-finalize and audit the draft Planning baseline.';
  end if;

  insert into public.work_weeks (
    restaurant_id, week_start, planning_status, actuals_status, planning_revision
  )
  values (v_restaurant_id, v_missing_week, 'draft', 'open', 1);
  insert into public.planned_shifts (
    restaurant_id, week_start, employee_id, weekday, service_key,
    area_id, job_function_id, starts_at, ends_at, source
  )
  values (
    v_restaurant_id, v_missing_week, v_employee_id, 1, 'lunch',
    v_area_id, v_job_id, '10:00', '14:00', 'manual'
  );

  begin
    perform public.save_actuals_lifecycle(
      v_restaurant_id,
      'approve_week',
      jsonb_build_object(
        'week_start', v_missing_week,
        'expected_revision', 0,
        'reason', 'Phase 8 missing badge guard fixture'
      )
    );
    raise exception 'Actuals approval skipped missing badges on an auto-finalized draft plan.';
  exception
    when others then
      if sqlerrm not like 'Resolve missing badges before approving Timesheet%' then
        raise;
      end if;
  end;
end
$actuals_auto_finalize_guard$;

rollback;
