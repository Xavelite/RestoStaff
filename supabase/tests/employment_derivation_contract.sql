-- Fact-driven employment derivation contract. All fixture writes roll back.
begin;

do $employment_derivation$
declare
  v_owner_profile_id uuid;
  v_owner_auth_user_id uuid;
  v_anchor_restaurant_id uuid;
  v_restaurant_id uuid := gen_random_uuid();
  v_rule_set_id uuid;
  v_cdi_type uuid := gen_random_uuid();
  v_cdd_type uuid := gen_random_uuid();
  v_flexi_type uuid := gen_random_uuid();
  v_student_type uuid := gen_random_uuid();
  v_extra_type uuid := gen_random_uuid();
  v_freelance_type uuid := gen_random_uuid();
  v_cdi_employee uuid := gen_random_uuid();
  v_cdd_employee uuid := gen_random_uuid();
  v_flexi_employee uuid := gen_random_uuid();
  v_student_employee uuid := gen_random_uuid();
  v_extra_employee uuid := gen_random_uuid();
  v_freelance_employee uuid := gen_random_uuid();
  v_cdi_contract uuid := gen_random_uuid();
  v_cdd_contract uuid := gen_random_uuid();
  v_flexi_contract uuid := gen_random_uuid();
  v_student_contract uuid := gen_random_uuid();
  v_extra_contract uuid := gen_random_uuid();
  v_freelance_contract uuid := gen_random_uuid();
  v_terms_id uuid;
  v_first_terms_id uuid;
  v_value jsonb;
begin
  select p.id, p.auth_user_id into v_owner_profile_id, v_owner_auth_user_id
  from public.profiles p
  join public.restaurant_memberships m on m.profile_id = p.id
  where p.auth_user_id is not null and m.role = 'owner' and m.status = 'active'
  order by m.created_at limit 1;
  if v_owner_profile_id is null then
    v_owner_auth_user_id := gen_random_uuid();
    insert into auth.users (id, email)
    values (v_owner_auth_user_id, 'employment-owner-' || v_owner_auth_user_id || '@example.test');
    insert into public.profiles (auth_user_id, first_name, last_name, email)
    values (v_owner_auth_user_id, 'Employment', 'Owner', 'employment-owner-' || v_owner_auth_user_id || '@example.test')
    returning id into v_owner_profile_id;
    insert into public.restaurants (workspace_slug, name, owner_profile_id)
    values ('employment-anchor-' || replace(gen_random_uuid()::text, '-', ''), 'Employment auth anchor', v_owner_profile_id)
    returning id into v_anchor_restaurant_id;
    insert into public.restaurant_memberships (restaurant_id, profile_id, role, status)
    values (v_anchor_restaurant_id, v_owner_profile_id, 'owner', 'active');
  end if;
  perform set_config('request.jwt.claims', jsonb_build_object('sub', v_owner_auth_user_id)::text, true);

  select id into v_rule_set_id from public.payroll_rule_sets
  where jurisdiction = 'BE' and sector_code = 'CP302' and version = '2026.1';
  insert into public.restaurants (id, workspace_slug, name, owner_profile_id)
  values (v_restaurant_id, 'employment-' || replace(v_restaurant_id::text, '-', ''), 'Employment derivation fixture', v_owner_profile_id);
  insert into public.restaurant_memberships (restaurant_id, profile_id, role, status)
  values (v_restaurant_id, v_owner_profile_id, 'owner', 'active');
  insert into public.contract_types (id, restaurant_id, code, name, category, sort_order)
  values
    (v_cdi_type, v_restaurant_id, 'CDI', 'CDI', 'permanent', 1),
    (v_cdd_type, v_restaurant_id, 'CDD', 'CDD', 'fixed_term', 2),
    (v_flexi_type, v_restaurant_id, 'FLEXI', 'Flexi-job', 'flexi', 3),
    (v_student_type, v_restaurant_id, 'STUDENT', 'Student', 'student', 4),
    (v_extra_type, v_restaurant_id, 'EXTRA', 'Extra', 'extra', 5),
    (v_freelance_type, v_restaurant_id, 'FREELANCE', 'Freelancer', 'self_employed', 6);
  insert into public.employees (id, restaurant_id, display_name, sort_order)
  values
    (v_cdi_employee, v_restaurant_id, 'CDI employee', 1),
    (v_cdd_employee, v_restaurant_id, 'CDD employee', 2),
    (v_flexi_employee, v_restaurant_id, 'Flexi employee', 3),
    (v_student_employee, v_restaurant_id, 'Student employee', 4),
    (v_extra_employee, v_restaurant_id, 'Extra employee', 5),
    (v_freelance_employee, v_restaurant_id, 'Freelancer', 6);
  insert into public.employee_contracts (
    id, restaurant_id, employee_id, contract_type_id, work_regime,
    contract_start, contract_end, weekly_contract_hours, contract_days,
    annual_leave_entitlement_days, is_current, active
  ) values
    (v_cdi_contract, v_restaurant_id, v_cdi_employee, v_cdi_type, 'fixed_schedule', '2026-01-01', null, 38, 5, 20, true, true),
    (v_cdd_contract, v_restaurant_id, v_cdd_employee, v_cdd_type, 'manager_only', '2026-01-01', '2026-12-31', 24, 3, 12, true, true),
    (v_flexi_contract, v_restaurant_id, v_flexi_employee, v_flexi_type, 'weekly_availability', '2026-01-01', '2026-12-31', 16, 2, 0, true, true),
    (v_student_contract, v_restaurant_id, v_student_employee, v_student_type, 'weekly_availability', '2026-01-01', '2026-12-31', 12, 2, 0, true, true),
    (v_extra_contract, v_restaurant_id, v_extra_employee, v_extra_type, 'manager_only', '2026-01-01', '2026-12-31', 8, 1, 0, true, true),
    (v_freelance_contract, v_restaurant_id, v_freelance_employee, v_freelance_type, 'manager_only', '2026-01-01', null, 20, 3, 0, true, true);
  insert into public.restaurant_payroll_configurations (
    restaurant_id, valid_from, version_number, rule_set_id,
    reference_full_time_weekly_minutes, reference_period_weeks,
    withholding_mode, status, created_by_profile_id
  ) values (
    v_restaurant_id, '2026-01-01', 1, v_rule_set_id,
    2280, 13, 'not_configured', 'verified', v_owner_profile_id
  );

  v_value := public.derive_employee_employment_terms(v_restaurant_id, v_cdi_employee, jsonb_build_object(
    'contract_id', v_cdi_contract, 'valid_from', '2026-01-01',
    'weekly_hours_regime', 'fixed', 'salary_basis', 'hourly',
    'contractual_hourly_rate', '20.0000', 'cp302_reference_function_code', '206B'
  ));
  if v_value->>'contract_duration_kind' <> 'indefinite'
      or v_value->>'employment_regime' <> 'ordinary'
      or v_value->>'employment_volume' <> 'full_time'
      or v_value->>'legal_schedule_type' <> 'fixed'
      or v_value->>'cp302_category' <> '5'
      or v_value->>'worker_status' <> 'blue_collar' then
    raise exception 'CDI or CP 302 derivation is wrong: %', v_value;
  end if;

  v_value := public.derive_employee_employment_terms(v_restaurant_id, v_cdd_employee, jsonb_build_object(
    'contract_id', v_cdd_contract, 'weekly_hours_regime', 'variable_average',
    'reference_period_weeks', 13
  ));
  if v_value->>'contract_duration_kind' <> 'fixed_term'
      or v_value->>'employment_regime' <> 'ordinary'
      or v_value->>'employment_volume' <> 'part_time'
      or v_value->>'legal_schedule_type' <> 'variable'
      or v_value->>'valid_to' <> '2026-12-31' then
    raise exception 'CDD derivation is wrong: %', v_value;
  end if;

  if public.derive_employee_employment_terms(v_restaurant_id, v_flexi_employee, jsonb_build_object('contract_id', v_flexi_contract))->>'employment_regime' <> 'flexi'
      or public.derive_employee_employment_terms(v_restaurant_id, v_student_employee, jsonb_build_object('contract_id', v_student_contract))->>'employment_regime' <> 'student'
      or public.derive_employee_employment_terms(v_restaurant_id, v_extra_employee, jsonb_build_object('contract_id', v_extra_contract))->>'employment_regime' <> 'horeca_occasional'
      or public.derive_employee_employment_terms(v_restaurant_id, v_freelance_employee, jsonb_build_object('contract_id', v_freelance_contract))->>'employment_regime' <> 'self_employed' then
    raise exception 'Special employment type derivation is wrong.';
  end if;

  begin
    perform public.derive_employee_employment_terms(v_restaurant_id, v_cdi_employee, jsonb_build_object('contract_id', v_cdd_contract));
    raise exception 'Another employee''s contract was accepted.';
  exception when others then
    if sqlerrm not like 'Select an active contract belonging to this employee.%' then raise; end if;
  end;
  begin
    perform public.derive_employee_employment_terms(v_restaurant_id, v_cdd_employee, jsonb_build_object(
      'contract_id', v_cdd_contract, 'weekly_hours_regime', 'variable_average', 'reference_period_weeks', 1
    ));
    raise exception 'An invalid variable-average reference period was accepted.';
  exception when others then
    if sqlerrm not like 'Average contract hours require%' then raise; end if;
  end;
  begin
    perform public.derive_employee_employment_terms(v_restaurant_id, v_cdd_employee, jsonb_build_object(
      'contract_id', v_cdd_contract, 'salary_basis', 'service_percentage'
    ));
    raise exception 'An unsupported salary basis was accepted.';
  exception when others then
    if sqlerrm not like 'Only hourly and monthly salary bases are supported.%' then raise; end if;
  end;

  v_first_terms_id := (public.save_employee_employment_terms(v_restaurant_id, v_cdi_employee, jsonb_build_object(
    'contract_id', v_cdi_contract, 'valid_from', '2026-01-01',
    'weekly_hours_regime', 'fixed', 'salary_basis', 'hourly',
    'contractual_hourly_rate', '20.0000', 'cp302_reference_function_code', '206B'
  ))->>'employment_terms_id')::uuid;
  if not exists (
    select 1 from public.employee_employment_terms t
    where t.id = v_first_terms_id and t.source_status = 'recorded'
      and t.contract_duration_kind = 'indefinite' and t.employment_regime = 'ordinary'
      and t.cp302_category = 5 and t.worker_status = 'blue_collar'
  ) then
    raise exception 'Normal save did not preserve recorded, server-derived terms.';
  end if;

  v_terms_id := (public.save_employee_employment_terms(v_restaurant_id, v_cdi_employee, jsonb_build_object(
    'contract_id', v_cdi_contract, 'valid_from', '2026-07-01',
    'weekly_hours_regime', 'fixed', 'salary_basis', 'hourly',
    'contractual_hourly_rate', '21.0000', 'cp302_reference_function_code', '206B'
  ))->>'employment_terms_id')::uuid;
  if not exists (select 1 from public.employee_employment_terms where id = v_first_terms_id and valid_to = '2026-06-30')
      or not exists (select 1 from public.employee_employment_terms where id = v_terms_id and version_number = 2 and valid_to is null) then
    raise exception 'A new terms version did not close the previous period.';
  end if;

  v_terms_id := (public.save_employee_employment_terms(v_restaurant_id, v_cdd_employee, jsonb_build_object(
    'contract_id', v_cdd_contract, 'valid_from', '2026-01-01',
    'weekly_hours_regime', 'variable_average', 'reference_period_weeks', 13,
    'salary_basis', 'hourly', 'contractual_hourly_rate', '18.0000',
    'cp302_reference_function_code', '206B'
  ))->>'employment_terms_id')::uuid;
  if not exists (select 1 from public.employee_employment_terms where id = v_terms_id and valid_to = '2026-12-31') then
    raise exception 'CDD employment terms did not inherit the contract end date.';
  end if;
end
$employment_derivation$;

rollback;
