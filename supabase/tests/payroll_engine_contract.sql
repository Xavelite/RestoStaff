-- CP 302 payroll engine behavioral contract. All fixture writes roll back.
begin;

do $payroll_engine_schema$
declare t text;
begin
  foreach t in array array[
    'employee_employment_terms','time_entry_break_intervals','payroll_rule_sets',
    'payroll_rules','cp302_salary_scales','payroll_periods','payroll_runs',
    'payroll_employee_results','payroll_component_lines','payroll_component_sources',
    'employee_employment_term_validations','restaurant_payroll_configuration_validations',
    'payroll_providers','payroll_reconciliations'
  ] loop
    if to_regclass('public.' || t) is null then
      raise exception 'Payroll engine table % is missing.', t;
    end if;
    if has_table_privilege('authenticated', 'public.' || t, 'SELECT') then
      raise exception 'Payroll table % must remain RPC-only.', t;
    end if;
  end loop;
  if has_function_privilege('authenticated', 'public.calculate_payroll_run(uuid,date,date)', 'EXECUTE')
      or has_function_privilege('authenticated', 'public.get_payroll_workspace(uuid,date,date)', 'EXECUTE')
      or has_function_privilege('authenticated', 'public.set_payroll_run_status(uuid,uuid,text)', 'EXECUTE') then
    raise exception 'Experimental payroll engine must remain quarantined from browser roles.';
  end if;
  if not has_function_privilege('authenticated', 'public.get_insights_cost_rates(uuid)', 'EXECUTE')
      or not has_function_privilege('authenticated', 'public.validate_employee_employment_terms(uuid,uuid,uuid)', 'EXECUTE')
      or not has_function_privilege('authenticated', 'public.get_time_entry_payroll_evidence(uuid,uuid)', 'EXECUTE')
      or not has_function_privilege('authenticated', 'public.save_time_entry_payroll_evidence(uuid,uuid,uuid,uuid,jsonb,text)', 'EXECUTE') then
    raise exception 'Payroll-preparation and evidence RPC grants are incomplete.';
  end if;
  if (select count(*) from public.cp302_salary_scales s join public.payroll_rule_sets r on r.id = s.rule_set_id where r.version = '2026.1') <> 414 then
    raise exception 'The official 2026 CP 302 scale must contain 46 years x 9 categories.';
  end if;
end
$payroll_engine_schema$;

do $payroll_engine_behavior$
declare
  v_owner_profile_id uuid;
  v_owner_auth_user_id uuid;
  v_restaurant_id uuid := gen_random_uuid();
  v_employee_id uuid := gen_random_uuid();
  v_job_id uuid := gen_random_uuid();
  v_area_id uuid := gen_random_uuid();
  v_week_start date := public.week_start_for_date(current_date) - 21;
  v_rule_set_id uuid;
  v_entry_id uuid;
  v_actuals_revision bigint;
  v_run_id uuid;
  v_result public.payroll_employee_results%rowtype;
  v_line_count integer;
  v_workspace jsonb;
  v_anchor_restaurant_id uuid;
begin
  select p.id, p.auth_user_id into v_owner_profile_id, v_owner_auth_user_id
  from public.profiles p
  join public.restaurant_memberships m on m.profile_id = p.id
  where p.auth_user_id is not null and m.role = 'owner' and m.status = 'active'
  order by m.created_at limit 1;
  if v_owner_profile_id is null then
    v_owner_auth_user_id := gen_random_uuid();
    insert into auth.users (id, email) values (v_owner_auth_user_id, 'payroll-owner-' || v_owner_auth_user_id || '@example.test');
    insert into public.profiles (auth_user_id, first_name, last_name, email)
    values (v_owner_auth_user_id, 'Payroll', 'Owner', 'payroll-owner-' || v_owner_auth_user_id || '@example.test')
    returning id into v_owner_profile_id;
    insert into public.restaurants (workspace_slug, name, owner_profile_id)
    values ('payroll-anchor-' || replace(gen_random_uuid()::text, '-', ''), 'Payroll auth anchor', v_owner_profile_id)
    returning id into v_anchor_restaurant_id;
    insert into public.restaurant_memberships (restaurant_id, profile_id, role, status)
    values (v_anchor_restaurant_id, v_owner_profile_id, 'owner', 'active');
  end if;
  perform set_config('request.jwt.claims', jsonb_build_object('sub', v_owner_auth_user_id)::text, true);

  select id into v_rule_set_id from public.payroll_rule_sets
  where jurisdiction = 'BE' and sector_code = 'CP302' and version = '2026.1';
  insert into public.restaurants (id, workspace_slug, name, owner_profile_id)
  values (v_restaurant_id, 'payroll-' || replace(v_restaurant_id::text, '-', ''), 'Payroll engine fixture', v_owner_profile_id);
  insert into public.restaurant_settings (restaurant_id, timezone) values (v_restaurant_id, 'Europe/Brussels');
  insert into public.restaurant_memberships (restaurant_id, profile_id, role, status)
  values (v_restaurant_id, v_owner_profile_id, 'owner', 'active');
  insert into public.services (restaurant_id, service_key, name, sort_order)
  values (v_restaurant_id, 'lunch', 'Lunch', 1), (v_restaurant_id, 'evening', 'Evening', 2);
  insert into public.job_functions (id, restaurant_id, code, name)
  values (v_job_id, v_restaurant_id, 'WAITER', 'Waiter');
  insert into public.work_areas (id, restaurant_id, code, name)
  values (v_area_id, v_restaurant_id, 'ROOM', 'Dining room');
  insert into public.employees (id, restaurant_id, display_name, first_name, last_name)
  values (v_employee_id, v_restaurant_id, 'Payroll Employee', 'Payroll', 'Employee');
  insert into public.employee_employment_terms (
    restaurant_id, employee_id, valid_from, version_number,
    contract_duration_kind, employment_regime, worker_status,
    employment_volume, weekly_hours_regime, legal_schedule_type,
    scheduling_policy, salary_basis, contract_weekly_minutes,
    reference_full_time_weekly_minutes, reference_period_weeks,
    working_days_per_week, cp302_category, function_seniority_date,
    contractual_hourly_rate, source_status, created_by_profile_id
  ) values (
    v_restaurant_id, v_employee_id, v_week_start, 1,
    'indefinite', 'ordinary', 'white_collar', 'full_time', 'fixed', 'fixed',
    'fixed_schedule', 'hourly', 2280, 2280, 1, 5, 1, v_week_start,
    20.0000, 'verified', v_owner_profile_id
  );
  insert into public.restaurant_payroll_configurations (
    restaurant_id, valid_from, version_number, rule_set_id,
    reference_full_time_weekly_minutes, reference_period_weeks,
    withholding_mode, status, created_by_profile_id
  ) values (
    v_restaurant_id, v_week_start, 1, v_rule_set_id,
    2280, 13, 'not_configured', 'verified', v_owner_profile_id
  );
  insert into public.employee_tax_profiles (
    restaurant_id, employee_id, valid_from, version_number,
    resident_status, dependent_children, other_dependants,
    evidence_status, created_by_profile_id
  ) values (
    v_restaurant_id, v_employee_id, v_week_start, 1,
    'resident', 0, 0, 'verified', v_owner_profile_id
  );

  perform public.save_actuals_lifecycle(v_restaurant_id, 'manual_entry', jsonb_build_object(
    'employee_id', v_employee_id,
    'business_date', v_week_start,
    'service_key', 'lunch',
    'clock_in_at', (v_week_start::text || ' 12:00+02')::timestamptz,
    'clock_out_at', (v_week_start::text || ' 16:00+02')::timestamptz,
    'break_minutes', 0,
    'reason', 'Payroll calculation fixture'
  ));
  select id into v_entry_id from public.time_entries
  where restaurant_id = v_restaurant_id and employee_id = v_employee_id;
  perform public.save_time_entry_payroll_evidence(
    v_restaurant_id, v_entry_id, v_job_id, v_area_id,
    jsonb_build_array(jsonb_build_object(
      'started_at', (v_week_start::text || ' 14:00+02')::timestamptz,
      'ended_at', (v_week_start::text || ' 14:15+02')::timestamptz
    )),
    'Confirm exact payroll evidence'
  );
  select actuals_revision into v_actuals_revision from public.work_weeks
  where restaurant_id = v_restaurant_id and week_start = v_week_start;
  perform public.save_actuals_lifecycle(v_restaurant_id, 'approve_week', jsonb_build_object(
    'week_start', v_week_start,
    'expected_revision', v_actuals_revision,
    'reason', 'Approved payroll calculation fixture'
  ));

  v_run_id := (public.calculate_payroll_run(v_restaurant_id, v_week_start, v_week_start + 6)->>'payroll_run_id')::uuid;
  select * into v_result from public.payroll_employee_results
  where payroll_run_id = v_run_id and employee_id = v_employee_id;
  if v_result.payable_minutes <> 225
      or v_result.gross_cents <> 7500
      or v_result.employee_contributions_cents <> 980
      or v_result.estimated_net_cents <> 6520
      or v_result.employer_contributions_cents <> 1869
      or v_result.employer_cost_cents <> 9369 then
    raise exception 'Ordinary payroll result is wrong: %', to_jsonb(v_result);
  end if;
  select count(*) into v_line_count from public.payroll_component_sources s
  join public.payroll_component_lines l on l.id = s.payroll_component_line_id
  where l.payroll_run_id = v_run_id and s.source_type = 'time_entry' and s.source_id = v_entry_id;
  if v_line_count <> 1 then
    raise exception 'Worked-time source lineage is incomplete.';
  end if;
  select count(*) into v_line_count from public.payroll_component_sources s
  join public.payroll_component_lines l on l.id = s.payroll_component_line_id
  where l.payroll_run_id = v_run_id and s.source_type = 'break_interval';
  if v_line_count <> 1 then
    raise exception 'Exact-break source lineage is incomplete.';
  end if;
  if exists (
    select 1 from public.payroll_component_lines l
    where l.payroll_run_id = v_run_id
      and l.component_code in ('EMPLOYEE_ONSS','EMPLOYER_ONSS_BASE')
      and (l.employment_terms_id is null or l.contribution_treatment is null)
  ) then
    raise exception 'Contribution lines must preserve terms and treatment lineage.';
  end if;
  v_workspace := public.get_payroll_workspace(v_restaurant_id, v_week_start, v_week_start + 6);
  if jsonb_array_length(v_workspace->'component_sources') < 3
      or jsonb_array_length(v_workspace->'employment_terms') <> 1
      or jsonb_array_length(v_workspace->'rules') = 0
      or jsonb_array_length(v_workspace->'legal_sources') = 0 then
    raise exception 'Payroll explanation read model is incomplete.';
  end if;
  perform public.set_payroll_run_status(v_restaurant_id, v_run_id, 'reviewed');
  begin
    perform public.set_payroll_run_status(v_restaurant_id, v_run_id, 'finalized');
    raise exception 'An unreconciled estimate was finalized.';
  exception when others then
    if sqlerrm not like 'Unsupported payroll status transition%' then raise; end if;
  end;
  perform public.set_payroll_run_status(v_restaurant_id, v_run_id, 'locked_estimate');
  begin
    perform public.set_payroll_run_status(v_restaurant_id, v_run_id, 'finalized');
    raise exception 'A locked estimate was finalized.';
  exception when others then
    if sqlerrm not like 'Unsupported payroll status transition%' then raise; end if;
  end;
  update public.payroll_runs set status = 'reconciled', calculation_quality = 'reconciled'
  where id = v_run_id;
  perform public.set_payroll_run_status(v_restaurant_id, v_run_id, 'finalized');
  begin
    update public.payroll_runs set warning_count = 0 where id = v_run_id;
    raise exception 'Finalized payroll mutation was not blocked.';
  exception when others then
    if sqlerrm not like 'A finalized payroll run is immutable.%' then raise; end if;
  end;
end
$payroll_engine_behavior$;

rollback;
