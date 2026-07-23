-- V577: derive normalized employment terms from owner-recorded facts.
begin;

alter table public.employee_regime_evidence
  drop constraint employee_regime_evidence_type_check;
alter table public.employee_regime_evidence
  add constraint employee_regime_evidence_type_check check (evidence_type in (
    'flexi_eligibility', 'flexi_agreement', 'student_quota', 'occasional_quota',
    'dimona', 'voluntary_overtime_agreement', 'gks_eligibility', 'interim_invoice'
  ));

create table public.employee_employment_term_validations (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete restrict,
  employee_id uuid not null,
  employment_terms_id uuid not null,
  result_status text not null,
  blockers jsonb not null default '[]'::jsonb,
  validated_by_profile_id uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  constraint employee_employment_term_validations_employee_fk
    foreign key (restaurant_id, employee_id)
      references public.employees(restaurant_id, id) on delete restrict,
  constraint employee_employment_term_validations_terms_fk
    foreign key (restaurant_id, employment_terms_id)
      references public.employee_employment_terms(restaurant_id, id) on delete restrict,
  constraint employee_employment_term_validations_status_check
    check (result_status in ('complete', 'verified')),
  constraint employee_employment_term_validations_blockers_array
    check (jsonb_typeof(blockers) = 'array')
);

create table public.restaurant_payroll_configuration_validations (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete restrict,
  configuration_id uuid not null references public.restaurant_payroll_configurations(id) on delete restrict,
  result_status text not null,
  blockers jsonb not null default '[]'::jsonb,
  validated_by_profile_id uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  constraint restaurant_payroll_configuration_validations_status_check
    check (result_status in ('draft', 'verified')),
  constraint restaurant_payroll_configuration_validations_blockers_array
    check (jsonb_typeof(blockers) = 'array')
);

create or replace function public.guard_employee_employment_terms_history()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'Employment-term history is append-only.';
  end if;
  if row(
    new.id, new.restaurant_id, new.employee_id, new.contract_id, new.valid_from,
    new.version_number, new.supersedes_id, new.contract_duration_kind,
    new.employment_regime, new.worker_status, new.employment_volume,
    new.weekly_hours_regime, new.legal_schedule_type, new.scheduling_policy,
    new.salary_basis, new.contract_weekly_minutes,
    new.reference_full_time_weekly_minutes, new.reference_period_weeks,
    new.working_days_per_week, new.cp302_reference_function_code,
    new.cp302_category, new.function_seniority_date, new.company_seniority_date,
    new.contractual_hourly_rate, new.contractual_monthly_salary_cents,
    new.service_percentage_basis_points, new.annual_leave_entitlement_days,
    new.source_notes, new.created_by_profile_id, new.created_at,
    new.employment_type_code, new.worker_status_override_reason
  ) is distinct from row(
    old.id, old.restaurant_id, old.employee_id, old.contract_id, old.valid_from,
    old.version_number, old.supersedes_id, old.contract_duration_kind,
    old.employment_regime, old.worker_status, old.employment_volume,
    old.weekly_hours_regime, old.legal_schedule_type, old.scheduling_policy,
    old.salary_basis, old.contract_weekly_minutes,
    old.reference_full_time_weekly_minutes, old.reference_period_weeks,
    old.working_days_per_week, old.cp302_reference_function_code,
    old.cp302_category, old.function_seniority_date, old.company_seniority_date,
    old.contractual_hourly_rate, old.contractual_monthly_salary_cents,
    old.service_percentage_basis_points, old.annual_leave_entitlement_days,
    old.source_notes, old.created_by_profile_id, old.created_at,
    old.employment_type_code, old.worker_status_override_reason
  ) then
    raise exception 'Recorded employment terms are immutable; create a new effective-dated version.';
  end if;
  if new.valid_to is not null and new.valid_to < new.valid_from then
    raise exception 'Employment terms cannot end before they start.';
  end if;
  if old.valid_to is not null and new.valid_to is distinct from old.valid_to then
    raise exception 'A closed employment-term period cannot be changed.';
  end if;
  if old.active = false and new.active is distinct from old.active then
    raise exception 'A superseded employment-term version cannot be reactivated.';
  end if;
  if new.source_status is distinct from old.source_status and not (
    (old.source_status in ('recorded', 'migrated_unverified') and new.source_status in ('complete', 'verified'))
    or (old.source_status = 'complete' and new.source_status = 'verified')
  ) then
    raise exception 'Employment validation status cannot be downgraded.';
  end if;
  return new;
end
$$;

create or replace function public.derive_employee_employment_terms(
  p_restaurant_id uuid,
  p_employee_id uuid,
  p_facts jsonb
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_contract public.employee_contracts%rowtype;
  v_type_code text;
  v_from date;
  v_to date;
  v_duration public.contract_duration_kind;
  v_regime public.employment_payroll_regime;
  v_volume public.employment_volume;
  v_weekly_regime public.weekly_hours_regime;
  v_legal_schedule public.legal_schedule_type;
  v_full_time_minutes integer;
  v_contract_minutes integer;
  v_reference_weeks integer;
  v_salary_basis public.salary_basis;
  v_function public.cp302_reference_functions%rowtype;
  v_worker_status public.worker_status;
  v_override public.worker_status;
  v_override_reason text;
  v_blockers jsonb := '[]'::jsonb;
begin
  if not public.is_owner(p_restaurant_id) then
    raise exception 'Only an owner can derive payroll employment terms.';
  end if;

  select c.* into v_contract
  from public.employee_contracts c
  where c.id = nullif(p_facts->>'contract_id', '')::uuid
    and c.restaurant_id = p_restaurant_id
    and c.employee_id = p_employee_id
    and c.active;
  if v_contract.id is null then
    raise exception 'Select an active contract belonging to this employee.';
  end if;

  select upper(ct.code) into v_type_code
  from public.contract_types ct
  where ct.id = v_contract.contract_type_id and ct.restaurant_id = p_restaurant_id;
  v_type_code := coalesce(nullif(v_type_code, ''), 'CUSTOM');
  v_from := coalesce(nullif(p_facts->>'valid_from', '')::date, v_contract.contract_start);
  if v_from is null then
    raise exception 'A contract start date is required.';
  end if;
  if v_contract.contract_start is not null and v_from < v_contract.contract_start then
    raise exception 'Employment terms cannot start before the contract.';
  end if;
  if v_contract.contract_end is not null and v_contract.contract_end < v_from then
    raise exception 'Employment terms cannot start after the contract ends.';
  end if;

  case v_type_code
    when 'CDI' then
      v_duration := 'indefinite'; v_regime := 'ordinary'; v_to := null;
      if v_contract.contract_end is not null then
        raise exception 'A CDI cannot have a contractual end date.';
      end if;
    when 'CDD' then
      v_duration := 'fixed_term'; v_regime := 'ordinary'; v_to := v_contract.contract_end;
    when 'FLEXI' then
      v_duration := 'fixed_term'; v_regime := 'flexi'; v_to := v_contract.contract_end;
    when 'STUDENT' then
      v_duration := 'fixed_term'; v_regime := 'student'; v_to := v_contract.contract_end;
    when 'EXTRA' then
      v_duration := 'fixed_term'; v_regime := 'horeca_occasional'; v_to := v_contract.contract_end;
    when 'FREELANCE' then
      v_duration := 'defined_work'; v_regime := 'self_employed'; v_to := v_contract.contract_end;
    else
      v_duration := case when v_contract.contract_end is null then 'indefinite'::public.contract_duration_kind else 'fixed_term'::public.contract_duration_kind end;
      v_regime := 'ordinary'; v_to := v_contract.contract_end;
  end case;

  if v_type_code in ('CDD', 'FLEXI', 'STUDENT', 'EXTRA') and v_contract.contract_end is null then
    v_blockers := v_blockers || jsonb_build_array(jsonb_build_object(
      'code', 'CONTRACT_END_REQUIRED', 'message', format('%s requires a contract end date.', v_type_code)
    ));
  end if;
  if v_contract.contract_end is not null and v_contract.contract_start is not null
      and v_contract.contract_end < v_contract.contract_start then
    raise exception 'The contract end date cannot be before its start date.';
  end if;

  select c.reference_full_time_weekly_minutes into v_full_time_minutes
  from public.restaurant_payroll_configurations c
  where c.restaurant_id = p_restaurant_id and c.active
    and c.valid_from <= v_from and (c.valid_to is null or c.valid_to >= v_from)
  order by c.valid_from desc, c.version_number desc limit 1;
  if v_full_time_minutes is null then
    v_full_time_minutes := 2280;
    v_blockers := v_blockers || jsonb_build_array(jsonb_build_object(
      'code', 'PAYROLL_CONFIGURATION_REQUIRED',
      'message', 'Record and validate the restaurant payroll configuration.'
    ));
  end if;
  v_contract_minutes := round(coalesce(v_contract.weekly_contract_hours, 0) * 60)::integer;
  if v_contract_minutes > v_full_time_minutes then
    raise exception 'Contract hours exceed the restaurant full-time reference.';
  end if;
  v_volume := case when v_contract_minutes = v_full_time_minutes then 'full_time'::public.employment_volume else 'part_time'::public.employment_volume end;

  v_weekly_regime := coalesce(nullif(p_facts->>'weekly_hours_regime', '')::public.weekly_hours_regime, 'fixed');
  v_reference_weeks := case when v_weekly_regime = 'fixed' then 1 else coalesce(nullif(p_facts->>'reference_period_weeks', '')::integer, 0) end;
  if v_weekly_regime = 'variable_average' and v_reference_weeks not between 2 and 52 then
    raise exception 'Average contract hours require a reference period between 2 and 52 weeks.';
  end if;
  v_legal_schedule := case when v_contract.work_regime = 'fixed_schedule' then 'fixed'::public.legal_schedule_type else 'variable'::public.legal_schedule_type end;

  if nullif(p_facts->>'salary_basis', '') is not null
      and p_facts->>'salary_basis' not in ('hourly', 'monthly') then
    raise exception 'Only hourly and monthly salary bases are supported.';
  end if;
  v_salary_basis := nullif(p_facts->>'salary_basis', '')::public.salary_basis;

  if nullif(btrim(p_facts->>'cp302_reference_function_code'), '') is not null then
    select f.* into v_function
    from public.cp302_reference_functions f
    where f.code = btrim(p_facts->>'cp302_reference_function_code')
      and f.status in ('verified', 'effective')
      and f.valid_from <= v_from and (f.valid_to is null or f.valid_to >= v_from)
    order by f.valid_from desc limit 1;
    if v_function.id is null then
      raise exception 'The selected CP 302 function is not effective on the employment-term start date.';
    end if;
    v_worker_status := v_function.default_worker_status;
  else
    v_blockers := v_blockers || jsonb_build_array(jsonb_build_object(
      'code', 'CP302_FUNCTION_REQUIRED', 'message', 'Select the employee''s official CP 302 function.'
    ));
  end if;

  v_override := nullif(p_facts->>'worker_status_override', '')::public.worker_status;
  v_override_reason := nullif(btrim(p_facts->>'worker_status_override_reason'), '');
  if v_override is not null and v_override is distinct from v_worker_status then
    if v_override_reason is null then
      raise exception 'A worker-status override requires a reason.';
    end if;
    v_worker_status := v_override;
  else
    v_override_reason := null;
  end if;

  return jsonb_build_object(
    'contract_id', v_contract.id,
    'employment_type_code', v_type_code,
    'valid_from', v_from,
    'valid_to', v_to,
    'contract_duration_kind', v_duration,
    'employment_regime', v_regime,
    'worker_status', v_worker_status,
    'worker_status_override_reason', v_override_reason,
    'employment_volume', v_volume,
    'weekly_hours_regime', v_weekly_regime,
    'legal_schedule_type', v_legal_schedule,
    'scheduling_policy', v_contract.work_regime,
    'salary_basis', v_salary_basis,
    'contract_weekly_minutes', v_contract_minutes,
    'reference_full_time_weekly_minutes', v_full_time_minutes,
    'reference_period_weeks', greatest(v_reference_weeks, 1),
    'working_days_per_week', nullif(v_contract.contract_days, 0),
    'cp302_reference_function_code', v_function.code,
    'cp302_category', v_function.category,
    'function_seniority_date', nullif(p_facts->>'function_seniority_date', '')::date,
    'company_seniority_date', nullif(p_facts->>'company_seniority_date', '')::date,
    'contractual_hourly_rate', nullif(p_facts->>'contractual_hourly_rate', '')::numeric,
    'contractual_monthly_salary_cents', nullif(p_facts->>'contractual_monthly_salary_cents', '')::bigint,
    'annual_leave_entitlement_days', greatest(0, coalesce(nullif(p_facts->>'annual_leave_entitlement_days', '')::numeric, v_contract.annual_leave_entitlement_days, 0)),
    'source_status', 'recorded',
    'source_notes', nullif(btrim(p_facts->>'source_notes'), ''),
    'validation_blockers', v_blockers
  );
end
$$;

create or replace function public.save_employee_employment_terms(
  p_restaurant_id uuid,
  p_employee_id uuid,
  p_terms jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := public.current_profile_id();
  v_terms jsonb;
  v_from date;
  v_previous public.employee_employment_terms%rowtype;
  v_version integer;
  v_id uuid;
  v_latest_finalized date;
begin
  if not public.is_owner(p_restaurant_id) then
    raise exception 'Only an owner can change payroll employment terms.';
  end if;
  v_terms := public.derive_employee_employment_terms(p_restaurant_id, p_employee_id, p_terms);
  v_from := (v_terms->>'valid_from')::date;

  select max(p.period_end) into v_latest_finalized
  from public.payroll_runs r
  join public.payroll_periods p on p.id = r.payroll_period_id
  join public.payroll_employee_results er on er.payroll_run_id = r.id and er.employee_id = p_employee_id
  where r.restaurant_id = p_restaurant_id and r.status = 'finalized';
  if v_latest_finalized is not null and v_from <= v_latest_finalized then
    raise exception 'Employment terms cannot change a finalized payroll period. Use a future effective date.';
  end if;

  select * into v_previous
  from public.employee_employment_terms t
  where t.restaurant_id = p_restaurant_id and t.employee_id = p_employee_id
    and t.active
  order by t.valid_from desc, t.version_number desc
  limit 1 for update;
  if v_previous.id is not null and v_from < v_previous.valid_from then
    raise exception 'Create employment-term versions in chronological order.';
  end if;
  if v_previous.id is not null then
    if v_previous.valid_from = v_from then
      update public.employee_employment_terms
      set active = false, superseded_at = now()
      where id = v_previous.id;
    else
      update public.employee_employment_terms
      set valid_to = least(coalesce(valid_to, v_from - 1), v_from - 1), superseded_at = now()
      where id = v_previous.id;
    end if;
  end if;

  select coalesce(max(t.version_number), 0) + 1 into v_version
  from public.employee_employment_terms t
  where t.restaurant_id = p_restaurant_id and t.employee_id = p_employee_id;

  insert into public.employee_employment_terms (
    restaurant_id, employee_id, contract_id, employment_type_code,
    valid_from, valid_to, version_number, supersedes_id,
    contract_duration_kind, employment_regime, worker_status,
    worker_status_override_reason, employment_volume, weekly_hours_regime,
    legal_schedule_type, scheduling_policy, salary_basis,
    contract_weekly_minutes, reference_full_time_weekly_minutes,
    reference_period_weeks, working_days_per_week,
    cp302_reference_function_code, cp302_category,
    function_seniority_date, company_seniority_date,
    contractual_hourly_rate, contractual_monthly_salary_cents,
    service_percentage_basis_points, annual_leave_entitlement_days,
    active, source_status, source_notes, validation_blockers,
    created_by_profile_id
  ) values (
    p_restaurant_id, p_employee_id, (v_terms->>'contract_id')::uuid,
    v_terms->>'employment_type_code', (v_terms->>'valid_from')::date,
    nullif(v_terms->>'valid_to', '')::date, v_version, v_previous.id,
    (v_terms->>'contract_duration_kind')::public.contract_duration_kind,
    (v_terms->>'employment_regime')::public.employment_payroll_regime,
    nullif(v_terms->>'worker_status', '')::public.worker_status,
    nullif(v_terms->>'worker_status_override_reason', ''),
    (v_terms->>'employment_volume')::public.employment_volume,
    (v_terms->>'weekly_hours_regime')::public.weekly_hours_regime,
    (v_terms->>'legal_schedule_type')::public.legal_schedule_type,
    (v_terms->>'scheduling_policy')::public.work_regime,
    nullif(v_terms->>'salary_basis', '')::public.salary_basis,
    (v_terms->>'contract_weekly_minutes')::integer,
    (v_terms->>'reference_full_time_weekly_minutes')::integer,
    (v_terms->>'reference_period_weeks')::integer,
    nullif(v_terms->>'working_days_per_week', '')::numeric,
    nullif(v_terms->>'cp302_reference_function_code', ''),
    nullif(v_terms->>'cp302_category', '')::smallint,
    nullif(v_terms->>'function_seniority_date', '')::date,
    nullif(v_terms->>'company_seniority_date', '')::date,
    nullif(v_terms->>'contractual_hourly_rate', '')::numeric,
    nullif(v_terms->>'contractual_monthly_salary_cents', '')::bigint,
    null, (v_terms->>'annual_leave_entitlement_days')::numeric,
    true, 'recorded', nullif(v_terms->>'source_notes', ''),
    coalesce(v_terms->'validation_blockers', '[]'::jsonb), v_actor
  ) returning id into v_id;

  return jsonb_build_object(
    'ok', true, 'employment_terms_id', v_id,
    'version_number', v_version, 'source_status', 'recorded',
    'derived', v_terms
  );
end
$$;

create function public.validate_employee_employment_terms(
  p_restaurant_id uuid,
  p_employee_id uuid,
  p_employment_terms_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_terms public.employee_employment_terms%rowtype;
  v_blockers jsonb := '[]'::jsonb;
  v_status text;
  v_required text;
begin
  if not public.is_owner(p_restaurant_id) then
    raise exception 'Only an owner can validate payroll employment terms.';
  end if;
  select * into v_terms from public.employee_employment_terms t
  where t.id = p_employment_terms_id and t.restaurant_id = p_restaurant_id
    and t.employee_id = p_employee_id and t.active for update;
  if v_terms.id is null then raise exception 'Active employment terms not found.'; end if;

  v_blockers := coalesce(v_terms.validation_blockers, '[]'::jsonb);
  if v_terms.contract_duration_kind = 'fixed_term' and v_terms.valid_to is null then
    v_blockers := v_blockers || jsonb_build_array(jsonb_build_object('code','CONTRACT_END_REQUIRED','message','A fixed-term contract needs an end date.'));
  end if;
  if v_terms.cp302_reference_function_code is null or v_terms.cp302_category is null or v_terms.worker_status is null then
    v_blockers := v_blockers || jsonb_build_array(jsonb_build_object('code','CP302_CLASSIFICATION_REQUIRED','message','Select an effective CP 302 function.'));
  elsif not exists (
    select 1 from public.cp302_reference_functions f
    where f.code = v_terms.cp302_reference_function_code
      and f.category = v_terms.cp302_category
      and (f.default_worker_status = v_terms.worker_status or v_terms.worker_status_override_reason is not null)
      and f.valid_from <= v_terms.valid_from
      and (f.valid_to is null or f.valid_to >= v_terms.valid_from)
      and f.status in ('verified','effective')
  ) then
    v_blockers := v_blockers || jsonb_build_array(jsonb_build_object('code','CP302_CLASSIFICATION_INVALID','message','The CP 302 function, category and worker status do not agree.'));
  end if;
  if v_terms.salary_basis is null then
    v_blockers := v_blockers || jsonb_build_array(jsonb_build_object('code','SALARY_BASIS_REQUIRED','message','Select hourly or monthly salary.'));
  elsif v_terms.salary_basis = 'hourly' and coalesce(v_terms.contractual_hourly_rate, 0) <= 0 then
    v_blockers := v_blockers || jsonb_build_array(jsonb_build_object('code','HOURLY_RATE_REQUIRED','message','Record a contractual hourly rate.'));
  elsif v_terms.salary_basis = 'monthly' and coalesce(v_terms.contractual_monthly_salary_cents, 0) <= 0 then
    v_blockers := v_blockers || jsonb_build_array(jsonb_build_object('code','MONTHLY_SALARY_REQUIRED','message','Record a contractual monthly salary.'));
  elsif v_terms.salary_basis not in ('hourly','monthly') then
    v_blockers := v_blockers || jsonb_build_array(jsonb_build_object('code','SALARY_BASIS_UNSUPPORTED','message','This salary basis is not supported by the pilot payroll engine.'));
  end if;
  if not exists (
    select 1 from public.restaurant_payroll_configurations c
    where c.restaurant_id = p_restaurant_id and c.active and c.status = 'verified'
      and c.valid_from <= v_terms.valid_from
      and (c.valid_to is null or c.valid_to >= v_terms.valid_from)
  ) then
    v_blockers := v_blockers || jsonb_build_array(jsonb_build_object('code','PAYROLL_CONFIGURATION_NOT_VERIFIED','message','Validate the restaurant payroll configuration first.'));
  end if;

  v_required := case v_terms.employment_regime
    when 'flexi' then 'flexi_eligibility'
    when 'student' then 'student_quota'
    when 'horeca_occasional' then 'occasional_quota'
    else null end;
  if v_required is not null and not exists (
    select 1 from public.employee_regime_evidence e
    where e.restaurant_id = p_restaurant_id and e.employee_id = p_employee_id
      and e.evidence_type = v_required and e.status = 'verified'
      and e.valid_from <= v_terms.valid_from
      and (e.valid_to is null or e.valid_to >= v_terms.valid_from)
  ) then
    v_blockers := v_blockers || jsonb_build_array(jsonb_build_object('code','REGIME_EVIDENCE_REQUIRED','message',format('Verify %s evidence.', replace(v_required, '_', ' '))));
  end if;
  if v_terms.employment_regime = 'flexi' and not exists (
    select 1 from public.employee_regime_evidence e
    where e.restaurant_id = p_restaurant_id and e.employee_id = p_employee_id
      and e.evidence_type = 'flexi_agreement' and e.status = 'verified'
      and e.valid_from <= v_terms.valid_from
      and (e.valid_to is null or e.valid_to >= v_terms.valid_from)
  ) then
    v_blockers := v_blockers || jsonb_build_array(jsonb_build_object('code','FLEXI_AGREEMENT_REQUIRED','message','Verify the flexi employment agreement.'));
  end if;

  select coalesce(jsonb_agg(value), '[]'::jsonb) into v_blockers
  from (select distinct value from jsonb_array_elements(v_blockers)) dedup;
  v_status := case when jsonb_array_length(v_blockers) = 0 then 'verified' else 'complete' end;
  update public.employee_employment_terms
  set source_status = v_status, validation_blockers = v_blockers
  where id = v_terms.id;
  insert into public.employee_employment_term_validations (
    restaurant_id, employee_id, employment_terms_id, result_status,
    blockers, validated_by_profile_id
  ) values (
    p_restaurant_id, p_employee_id, v_terms.id, v_status,
    v_blockers, public.current_profile_id()
  );
  return jsonb_build_object('ok', jsonb_array_length(v_blockers) = 0, 'status', v_status, 'blockers', v_blockers);
end
$$;

create function public.validate_restaurant_payroll_configuration(
  p_restaurant_id uuid,
  p_configuration_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_configuration public.restaurant_payroll_configurations%rowtype;
  v_blockers jsonb := '[]'::jsonb;
  v_status text;
begin
  if not public.is_owner(p_restaurant_id) then
    raise exception 'Only an owner can validate payroll configuration.';
  end if;
  select * into v_configuration
  from public.restaurant_payroll_configurations c
  where c.id = p_configuration_id and c.restaurant_id = p_restaurant_id and c.active
  for update;
  if v_configuration.id is null then raise exception 'Active payroll configuration not found.'; end if;
  if not exists (
    select 1 from public.payroll_rule_sets r
    where r.id = v_configuration.rule_set_id and r.status in ('verified','effective')
      and r.valid_from <= v_configuration.valid_from
      and (r.valid_to is null or r.valid_to >= v_configuration.valid_from)
  ) then
    v_blockers := v_blockers || jsonb_build_array(jsonb_build_object('code','RULE_SET_NOT_EFFECTIVE','message','Select an effective Belgian CP 302 rule set.'));
  end if;
  if v_configuration.reference_full_time_weekly_minutes <= 0 then
    v_blockers := v_blockers || jsonb_build_array(jsonb_build_object('code','FULL_TIME_REFERENCE_REQUIRED','message','Record the full-time weekly-hours reference.'));
  end if;
  if v_configuration.withholding_mode = 'official_formula' then
    v_blockers := v_blockers || jsonb_build_array(jsonb_build_object('code','OFFICIAL_WITHHOLDING_NOT_IMPLEMENTED','message','Official withholding formulas are not implemented; use manual estimate or not configured.'));
  end if;
  v_status := case when jsonb_array_length(v_blockers) = 0 then 'verified' else 'draft' end;
  update public.restaurant_payroll_configurations set status = v_status where id = v_configuration.id;
  insert into public.restaurant_payroll_configuration_validations (
    restaurant_id, configuration_id, result_status, blockers, validated_by_profile_id
  ) values (
    p_restaurant_id, v_configuration.id, v_status, v_blockers, public.current_profile_id()
  );
  return jsonb_build_object('ok', jsonb_array_length(v_blockers) = 0, 'status', v_status, 'blockers', v_blockers);
end
$$;

-- Normal saves are drafts. Validation is a distinct, audited operation.
do $$
declare
  v_oid oid := 'public.save_restaurant_payroll_configuration(uuid,jsonb)'::regprocedure::oid;
  v_def text;
  v_next text;
begin
  v_def := pg_get_functiondef(v_oid);
  v_next := replace(
    v_def,
    $anchor$coalesce(nullif(p_configuration->>'status', ''), 'draft')$anchor$,
    $replacement$'draft'$replacement$
  );
  if v_next = v_def then
    raise exception 'save_restaurant_payroll_configuration status anchor no longer matches.';
  end if;
  execute v_next;
end
$$;

alter table public.employee_employment_term_validations enable row level security;
alter table public.restaurant_payroll_configuration_validations enable row level security;
revoke all on table public.employee_employment_term_validations from public, anon, authenticated;
revoke all on table public.restaurant_payroll_configuration_validations from public, anon, authenticated;
grant all on table public.employee_employment_term_validations to service_role;
grant all on table public.restaurant_payroll_configuration_validations to service_role;

revoke all on function public.derive_employee_employment_terms(uuid,uuid,jsonb) from public, anon, authenticated;
revoke all on function public.validate_employee_employment_terms(uuid,uuid,uuid) from public, anon, authenticated;
revoke all on function public.validate_restaurant_payroll_configuration(uuid,uuid) from public, anon, authenticated;
grant execute on function public.validate_employee_employment_terms(uuid,uuid,uuid) to authenticated;
grant execute on function public.validate_restaurant_payroll_configuration(uuid,uuid) to authenticated;

commit;
