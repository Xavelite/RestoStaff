-- Phase 6 generic payroll export lineage verification.
-- All fixture writes are rolled back.
begin;

do $phase6_schema$
declare
  v_definition text;
begin
  if to_regclass('public.payroll_export_runs') is null then
    raise exception 'Payroll export lineage table is missing.';
  end if;
  if not (
    select c.relrowsecurity
    from pg_class c
    where c.oid = 'public.payroll_export_runs'::regclass
  ) then
    raise exception 'Payroll export runs must have RLS enabled.';
  end if;
  if has_table_privilege(
    'authenticated',
    'public.payroll_export_runs',
    'SELECT'
  ) then
    raise exception 'Payroll export evidence must remain RPC-only.';
  end if;
  if to_regprocedure(
    'public.create_payroll_export_run(uuid,date,date,jsonb)'
  ) is null or to_regprocedure(
    'public.get_payroll_export_run(uuid,uuid)'
  ) is null then
    raise exception 'Payroll export RPC contract is incomplete.';
  end if;
  if to_regprocedure(
    'public.create_payroll_export_run(uuid,date,date)'
  ) is not null then
    raise exception 'Legacy three-argument payroll export RPC still exists.';
  end if;
  if not has_function_privilege(
    'authenticated',
    'public.create_payroll_export_run(uuid,date,date,jsonb)',
    'EXECUTE'
  ) or not has_function_privilege(
    'authenticated',
    'public.get_payroll_export_run(uuid,uuid)',
    'EXECUTE'
  ) then
    raise exception 'Payroll export browser grants are missing.';
  end if;
  if has_function_privilege(
    'authenticated',
    'public.payroll_export_run_summaries(uuid,date,date)',
    'EXECUTE'
  ) then
    raise exception 'Payroll export summary helper is browser-exposed.';
  end if;

  select pg_get_functiondef(
    'public.create_payroll_export_run(uuid,date,date,jsonb)'::regprocedure
  ) into v_definition;
  if position('Every included Actuals week must be approved' in v_definition) = 0
      or position('Only an owner can create a payroll export' in v_definition) = 0
      or position('extensions.digest' in v_definition) = 0 then
    raise exception 'Payroll export readiness or fingerprint guard is missing.';
  end if;
end
$phase6_schema$;

do $phase6_behavior$
declare
  v_owner_profile_id uuid;
  v_owner_auth_user_id uuid;
  v_restaurant_id uuid := gen_random_uuid();
  v_employee_id uuid := gen_random_uuid();
  v_week_start date := public.week_start_for_date(current_date) - 14;
  v_entry_id uuid;
  v_entry_revision bigint;
  v_actuals_revision bigint;
  v_run jsonb;
  v_run_id uuid;
  v_stored public.payroll_export_runs%rowtype;
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
    raise exception 'Phase 6 requires an authenticated owner fixture.';
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
    'phase6-' || replace(v_restaurant_id::text, '-', ''),
    'Phase 6 payroll fixture',
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
  insert into public.employees (
    id, restaurant_id, display_name, first_name, last_name, active
  )
  values (
    v_employee_id,
    v_restaurant_id,
    'Payroll Employee',
    'Payroll',
    'Employee',
    true
  );
  insert into public.employee_payroll_profiles (
    restaurant_id, employee_id, payroll_employee_id
  )
  values (v_restaurant_id, v_employee_id, 'PAY-001');
  insert into public.employee_legal_profiles (
    restaurant_id, employee_id, national_registry_number
  )
  values (v_restaurant_id, v_employee_id, '00.00.00-000.00');

  perform public.save_actuals_lifecycle(
    v_restaurant_id,
    'manual_entry',
    jsonb_build_object(
      'employee_id', v_employee_id,
      'business_date', v_week_start,
      'service_key', 'lunch',
      'clock_in_at', (v_week_start::text || ' 12:00+01')::timestamptz,
      'clock_out_at', (v_week_start::text || ' 16:00+01')::timestamptz,
      'break_minutes', 30,
      'reason', 'Phase 6 payroll fixture'
    )
  );

  select id, revision
  into v_entry_id, v_entry_revision
  from public.time_entries
  where restaurant_id = v_restaurant_id
    and employee_id = v_employee_id;
  select actuals_revision into v_actuals_revision
  from public.work_weeks
  where restaurant_id = v_restaurant_id
    and week_start = v_week_start;

  perform public.save_actuals_lifecycle(
    v_restaurant_id,
    'approve_week',
    jsonb_build_object(
      'week_start', v_week_start,
      'expected_revision', v_actuals_revision,
      'reason', 'Approved for payroll export'
    )
  );

  v_run := public.create_payroll_export_run(
    v_restaurant_id,
    v_week_start,
    v_week_start + 6
  );
  v_run_id := (v_run->>'run_id')::uuid;

  select * into v_stored
  from public.payroll_export_runs
  where id = v_run_id;

  if v_stored.row_count <> 1
      or v_stored.total_net_minutes <> 210
      or length(v_stored.payload_sha256) <> 64
      or jsonb_array_length(v_stored.payload->'rows') <> 1 then
    raise exception 'Payroll export snapshot or totals are incorrect.';
  end if;
  if (v_stored.payload->'entry_sources'->0->>'time_entry_id')::uuid <> v_entry_id
      or (v_stored.payload->'entry_sources'->0->>'time_entry_revision')::bigint
        <> v_entry_revision then
    raise exception 'Payroll export source lineage is incomplete.';
  end if;

  begin
    update public.payroll_export_runs
    set filename = 'changed.csv'
    where id = v_run_id;
    raise exception 'Payroll export evidence update was not blocked.';
  exception
    when others then
      if sqlerrm not like
          'Payroll export runs are immutable operational evidence.%'
      then
        raise;
      end if;
  end;

  if (public.get_payroll_export_run(v_restaurant_id, v_run_id)->>'payload_sha256')
      <> v_stored.payload_sha256 then
    raise exception 'Recorded payroll export cannot be reproduced.';
  end if;
end
$phase6_behavior$;

rollback;
