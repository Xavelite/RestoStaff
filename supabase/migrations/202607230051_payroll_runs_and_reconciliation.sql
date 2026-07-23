-- V570: immutable monthly payroll runs, component lineage and provider reconciliation.
begin;

insert into public.payroll_rules (
  rule_set_id, code, handler_type, priority, effective_from,
  conditions_json, parameters_json, legal_source_id, status, verification_notes
)
select rs.id, 'FLEXI_MINIMUM_HORECA', 'hourly_scale_floor', 80, '2026-03-01',
  '{"employment_regimes":["flexi"],"sector_code":"CP302"}'::jsonb,
  '{"hourly_rate":"11.8700","holiday_pay_hourly_rate":"0.9100","combined_hourly_rate":"12.7800"}'::jsonb,
  src.id, 'effective', 'Official ONSS indexed minimum effective 1 March 2026.'
from public.payroll_rule_sets rs
join public.payroll_legal_sources src on src.code = 'ONSS_FLEXI_2026_Q2'
where rs.jurisdiction = 'BE' and rs.sector_code = 'CP302' and rs.version = '2026.1'
on conflict (rule_set_id, code) do nothing;

create table public.employee_payroll_adjustments (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null,
  employee_id uuid not null,
  effective_date date not null,
  component_code text not null references public.payroll_components(code) on delete restrict,
  amount_cents bigint not null,
  taxable_amount_cents bigint not null default 0,
  social_security_base_cents bigint not null default 0,
  net_impact_cents bigint not null default 0,
  employer_cost_impact_cents bigint not null default 0,
  reason text not null,
  evidence_reference text,
  created_by_profile_id uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  constraint employee_payroll_adjustments_employee_fk
    foreign key (restaurant_id, employee_id)
      references public.employees(restaurant_id, id) on delete restrict,
  constraint employee_payroll_adjustments_reason_check check (length(btrim(reason)) >= 8)
);

create trigger employee_payroll_adjustments_append_only
before update or delete on public.employee_payroll_adjustments
for each row execute function public.reject_audit_evidence_mutation();

create table public.payroll_periods (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete restrict,
  period_start date not null,
  period_end date not null,
  status text not null default 'open',
  created_by_profile_id uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  constraint payroll_periods_restaurant_dates_key unique (restaurant_id, period_start, period_end),
  constraint payroll_periods_dates_check check (period_end >= period_start and period_end - period_start <= 370),
  constraint payroll_periods_status_check check (status in ('open', 'closed'))
);

create table public.payroll_runs (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete restrict,
  payroll_period_id uuid not null references public.payroll_periods(id) on delete restrict,
  version_number integer not null,
  status text not null default 'draft',
  calculation_quality text not null default 'estimated',
  rule_set_id uuid not null references public.payroll_rule_sets(id) on delete restrict,
  configuration_id uuid not null references public.restaurant_payroll_configurations(id) on delete restrict,
  input_snapshot jsonb not null,
  input_sha256 text not null,
  warning_count integer not null default 0,
  total_payable_minutes integer not null default 0,
  total_gross_cents bigint not null default 0,
  total_employee_deductions_cents bigint not null default 0,
  total_estimated_net_cents bigint not null default 0,
  total_employer_contributions_cents bigint not null default 0,
  total_employer_cost_cents bigint not null default 0,
  created_by_profile_id uuid not null references public.profiles(id) on delete restrict,
  calculated_at timestamptz,
  reviewed_at timestamptz,
  reviewed_by_profile_id uuid references public.profiles(id) on delete restrict,
  reconciled_at timestamptz,
  reconciled_by_profile_id uuid references public.profiles(id) on delete restrict,
  finalized_at timestamptz,
  finalized_by_profile_id uuid references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  constraint payroll_runs_period_version_key unique (payroll_period_id, version_number),
  constraint payroll_runs_status_check check (status in (
    'draft', 'calculated', 'reviewed', 'reconciled', 'finalized', 'superseded'
  )),
  constraint payroll_runs_quality_check check (calculation_quality in ('estimated', 'calculated', 'reconciled')),
  constraint payroll_runs_sha_check check (input_sha256 ~ '^[0-9a-f]{64}$'),
  constraint payroll_runs_snapshot_object check (jsonb_typeof(input_snapshot) = 'object'),
  constraint payroll_runs_totals_check check (
    warning_count >= 0 and total_payable_minutes >= 0
    and total_gross_cents >= 0 and total_employee_deductions_cents >= 0
    and total_estimated_net_cents >= 0 and total_employer_contributions_cents >= 0
    and total_employer_cost_cents >= 0
  )
);

create index payroll_runs_restaurant_period_idx
  on public.payroll_runs (restaurant_id, payroll_period_id, version_number desc);

create table public.payroll_employee_results (
  id uuid primary key default gen_random_uuid(),
  payroll_run_id uuid not null references public.payroll_runs(id) on delete restrict,
  restaurant_id uuid not null,
  employee_id uuid not null,
  payable_minutes integer not null,
  gross_cents bigint not null,
  taxable_cents bigint not null,
  social_security_base_cents bigint not null,
  employee_contributions_cents bigint not null,
  professional_withholding_cents bigint not null,
  other_employee_deductions_cents bigint not null default 0,
  estimated_net_cents bigint not null,
  employer_contributions_cents bigint not null,
  employer_cost_cents bigint not null,
  calculation_quality text not null,
  warnings jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  constraint payroll_employee_results_employee_fk
    foreign key (restaurant_id, employee_id)
      references public.employees(restaurant_id, id) on delete restrict,
  constraint payroll_employee_results_run_employee_key unique (payroll_run_id, employee_id),
  constraint payroll_employee_results_minutes_check check (payable_minutes >= 0),
  constraint payroll_employee_results_money_check check (
    gross_cents >= 0 and taxable_cents >= 0 and social_security_base_cents >= 0
    and employee_contributions_cents >= 0 and professional_withholding_cents >= 0
    and other_employee_deductions_cents >= 0 and estimated_net_cents >= 0
    and employer_contributions_cents >= 0 and employer_cost_cents >= 0
  ),
  constraint payroll_employee_results_quality_check
    check (calculation_quality in ('estimated', 'calculated', 'reconciled')),
  constraint payroll_employee_results_warnings_array check (jsonb_typeof(warnings) = 'array')
);

create table public.payroll_component_lines (
  id uuid primary key default gen_random_uuid(),
  payroll_run_id uuid not null references public.payroll_runs(id) on delete restrict,
  payroll_employee_result_id uuid,
  restaurant_id uuid not null,
  employee_id uuid not null,
  component_code text not null references public.payroll_components(code) on delete restrict,
  quantity numeric(16,4) not null,
  unit text not null,
  rate numeric(16,4),
  multiplier_basis_points integer,
  gross_amount_cents bigint not null default 0,
  taxable_amount_cents bigint not null default 0,
  social_security_base_cents bigint not null default 0,
  employee_contribution_cents bigint not null default 0,
  professional_withholding_cents bigint not null default 0,
  employer_contribution_cents bigint not null default 0,
  net_impact_cents bigint not null default 0,
  employer_cost_impact_cents bigint not null default 0,
  rule_id uuid references public.payroll_rules(id) on delete restrict,
  employment_terms_id uuid references public.employee_employment_terms(id) on delete restrict,
  source_hash text not null,
  explanation text not null,
  rounding_method text not null default 'half_up_cent',
  created_at timestamptz not null default now(),
  constraint payroll_component_lines_employee_fk
    foreign key (restaurant_id, employee_id)
      references public.employees(restaurant_id, id) on delete restrict,
  constraint payroll_component_lines_result_fk
    foreign key (payroll_employee_result_id)
      references public.payroll_employee_results(id) on delete restrict,
  constraint payroll_component_lines_unit_check
    check (unit in ('minutes', 'hours', 'amount', 'percentage')),
  constraint payroll_component_lines_source_hash_check check (source_hash ~ '^[0-9a-f]{64}$')
);

create index payroll_component_lines_result_idx
  on public.payroll_component_lines (payroll_run_id, employee_id, component_code);

create table public.payroll_component_sources (
  id uuid primary key default gen_random_uuid(),
  payroll_component_line_id uuid not null references public.payroll_component_lines(id) on delete restrict,
  source_type text not null,
  source_id uuid not null,
  source_revision bigint,
  source_date date,
  source_snapshot jsonb not null,
  created_at timestamptz not null default now(),
  constraint payroll_component_sources_line_type_source_key
    unique (payroll_component_line_id, source_type, source_id),
  constraint payroll_component_sources_type_check check (source_type in (
    'time_entry', 'break_interval', 'planned_shift', 'work_week',
    'employment_terms', 'benefit', 'adjustment', 'tax_profile'
  )),
  constraint payroll_component_sources_snapshot_object check (jsonb_typeof(source_snapshot) = 'object')
);

create table public.payroll_quota_movements (
  id uuid primary key default gen_random_uuid(),
  payroll_run_id uuid not null references public.payroll_runs(id) on delete restrict,
  restaurant_id uuid not null,
  employee_id uuid not null,
  quota_type text not null,
  movement_minutes integer not null,
  evidence_id uuid references public.employee_regime_evidence(id) on delete restrict,
  created_at timestamptz not null default now(),
  constraint payroll_quota_movements_employee_fk
    foreign key (restaurant_id, employee_id)
      references public.employees(restaurant_id, id) on delete restrict,
  constraint payroll_quota_movements_type_check
    check (quota_type in ('student', 'horeca_occasional', 'voluntary_overtime', 'special_horeca_overtime'))
);

create table public.payroll_providers (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  constraint payroll_providers_code_check check (code ~ '^[A-Z0-9_]+$')
);

alter table public.restaurant_payroll_configurations
  add constraint restaurant_payroll_configurations_provider_fk
  foreign key (default_provider_id) references public.payroll_providers(id) on delete restrict;

create table public.payroll_provider_components (
  id uuid primary key default gen_random_uuid(),
  provider_id uuid not null references public.payroll_providers(id) on delete restrict,
  component_code text not null references public.payroll_components(code) on delete restrict,
  provider_code text not null,
  provider_label text not null,
  valid_from date not null,
  valid_to date,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  constraint payroll_provider_components_key unique (provider_id, component_code, valid_from),
  constraint payroll_provider_components_validity_check check (valid_to is null or valid_to >= valid_from)
);

create table public.payroll_provider_employee_mappings (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null,
  provider_id uuid not null references public.payroll_providers(id) on delete restrict,
  employee_id uuid not null,
  external_employee_id text not null,
  valid_from date not null,
  valid_to date,
  active boolean not null default true,
  created_by_profile_id uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  constraint payroll_provider_employee_mappings_employee_fk
    foreign key (restaurant_id, employee_id)
      references public.employees(restaurant_id, id) on delete restrict,
  constraint payroll_provider_employee_mappings_key
    unique (restaurant_id, provider_id, external_employee_id, valid_from),
  constraint payroll_provider_employee_mappings_validity_check check (valid_to is null or valid_to >= valid_from)
);

create table public.payroll_provider_exports (
  id uuid primary key default gen_random_uuid(),
  payroll_run_id uuid not null references public.payroll_runs(id) on delete restrict,
  restaurant_id uuid not null references public.restaurants(id) on delete restrict,
  provider_id uuid not null references public.payroll_providers(id) on delete restrict,
  schema_version integer not null default 1,
  payload jsonb not null,
  payload_sha256 text not null,
  created_by_profile_id uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  constraint payroll_provider_exports_sha_check check (payload_sha256 ~ '^[0-9a-f]{64}$'),
  constraint payroll_provider_exports_payload_object check (jsonb_typeof(payload) = 'object')
);

create table public.payroll_provider_return_files (
  id uuid primary key default gen_random_uuid(),
  payroll_run_id uuid not null references public.payroll_runs(id) on delete restrict,
  restaurant_id uuid not null references public.restaurants(id) on delete restrict,
  provider_id uuid not null references public.payroll_providers(id) on delete restrict,
  original_filename text not null,
  payload jsonb not null,
  payload_sha256 text not null,
  imported_by_profile_id uuid not null references public.profiles(id) on delete restrict,
  imported_at timestamptz not null default now(),
  constraint payroll_provider_return_files_sha_check check (payload_sha256 ~ '^[0-9a-f]{64}$'),
  constraint payroll_provider_return_files_payload_object check (jsonb_typeof(payload) = 'object')
);

create table public.payroll_reconciliations (
  id uuid primary key default gen_random_uuid(),
  payroll_run_id uuid not null references public.payroll_runs(id) on delete restrict,
  payroll_provider_return_file_id uuid not null references public.payroll_provider_return_files(id) on delete restrict,
  restaurant_id uuid not null,
  employee_id uuid not null,
  component_code text not null references public.payroll_components(code) on delete restrict,
  restogogo_amount_cents bigint not null,
  provider_amount_cents bigint not null,
  variance_cents bigint not null,
  status text not null default 'open',
  explanation text,
  resolved_by_profile_id uuid references public.profiles(id) on delete restrict,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  constraint payroll_reconciliations_employee_fk
    foreign key (restaurant_id, employee_id)
      references public.employees(restaurant_id, id) on delete restrict,
  constraint payroll_reconciliations_status_check
    check (status in ('open', 'matched', 'explained', 'accepted')),
  constraint payroll_reconciliations_resolution_check check (
    (status in ('open', 'matched') and resolved_at is null and resolved_by_profile_id is null)
    or (status in ('explained', 'accepted') and resolved_at is not null and resolved_by_profile_id is not null)
  )
);

insert into public.payroll_providers (code, name)
values ('GENERIC', 'Generic payroll provider')
on conflict (code) do nothing;

create function public.reject_payroll_calculation_evidence_mutation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_run_id uuid;
  v_status text;
begin
  if tg_table_name in ('payroll_employee_results', 'payroll_component_lines') then
    v_run_id := case when tg_op = 'DELETE' then old.payroll_run_id else new.payroll_run_id end;
  elsif tg_table_name = 'payroll_component_sources' then
    select l.payroll_run_id into v_run_id
    from public.payroll_component_lines l
    where l.id = case when tg_op = 'DELETE' then old.payroll_component_line_id else new.payroll_component_line_id end;
  elsif tg_table_name = 'payroll_quota_movements' then
    v_run_id := case when tg_op = 'DELETE' then old.payroll_run_id else new.payroll_run_id end;
  end if;
  if v_run_id is not null then
    select r.status into v_status from public.payroll_runs r where r.id = v_run_id;
    if v_status = 'draft' then
      if tg_op = 'DELETE' then return old; end if;
      return new;
    end if;
  end if;
  raise exception '% is immutable payroll calculation evidence.', tg_table_name;
end
$$;

create trigger payroll_employee_results_append_only
before update or delete on public.payroll_employee_results
for each row execute function public.reject_payroll_calculation_evidence_mutation();
create trigger payroll_component_lines_append_only
before update or delete on public.payroll_component_lines
for each row execute function public.reject_payroll_calculation_evidence_mutation();
create trigger payroll_component_sources_append_only
before update or delete on public.payroll_component_sources
for each row execute function public.reject_payroll_calculation_evidence_mutation();
create trigger payroll_quota_movements_append_only
before update or delete on public.payroll_quota_movements
for each row execute function public.reject_payroll_calculation_evidence_mutation();
create trigger payroll_provider_exports_append_only
before update or delete on public.payroll_provider_exports
for each row execute function public.reject_payroll_calculation_evidence_mutation();
create trigger payroll_provider_return_files_append_only
before update or delete on public.payroll_provider_return_files
for each row execute function public.reject_payroll_calculation_evidence_mutation();

create function public.guard_payroll_run_status()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'Payroll runs cannot be deleted.';
  end if;
  if old.status = 'finalized' then
    raise exception 'A finalized payroll run is immutable.';
  end if;
  if new.id <> old.id or new.restaurant_id <> old.restaurant_id
      or new.payroll_period_id <> old.payroll_period_id
      or new.version_number <> old.version_number
      or new.rule_set_id <> old.rule_set_id
      or new.configuration_id <> old.configuration_id
      or new.input_snapshot <> old.input_snapshot
      or new.input_sha256 <> old.input_sha256
      or new.created_by_profile_id <> old.created_by_profile_id
      or new.created_at <> old.created_at then
    raise exception 'Payroll run inputs are immutable; calculate a new version.';
  end if;
  return new;
end
$$;

create trigger payroll_runs_status_guard
before update or delete on public.payroll_runs
for each row execute function public.guard_payroll_run_status();

create function public.payroll_money_cents(p_amount numeric)
returns bigint
language sql
immutable
set search_path = public
as $$ select round(coalesce(p_amount, 0) * 100)::bigint $$;

create function public.calculate_payroll_run(
  p_restaurant_id uuid,
  p_period_start date,
  p_period_end date
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_actor uuid := public.current_profile_id();
  v_readiness jsonb;
  v_configuration public.restaurant_payroll_configurations%rowtype;
  v_period_id uuid;
  v_run_id uuid := gen_random_uuid();
  v_version integer;
  v_snapshot jsonb;
  v_hash text;
  v_warning_count integer;
begin
  if not public.is_owner(p_restaurant_id) then
    raise exception 'Only an owner can calculate payroll.';
  end if;
  if p_period_start is null or p_period_end is null or p_period_end < p_period_start
      or p_period_end - p_period_start > 370 then
    raise exception 'A valid payroll period of at most 371 days is required.';
  end if;

  v_readiness := public.payroll_readiness_report(p_restaurant_id, p_period_start, p_period_end);
  if coalesce((v_readiness->>'ready')::boolean, false) = false then
    raise exception 'Payroll readiness has unresolved blockers or warnings.';
  end if;

  select * into v_configuration
  from public.restaurant_payroll_configurations c
  where c.restaurant_id = p_restaurant_id and c.active
    and c.valid_from <= p_period_start
    and (c.valid_to is null or c.valid_to >= p_period_end)
  order by c.valid_from desc, c.version_number desc limit 1;
  if v_configuration.id is null then
    raise exception 'Record a payroll configuration covering this period.';
  end if;
  if v_configuration.status <> 'verified' then
    raise exception 'Verify the restaurant payroll configuration before calculation.';
  end if;

  insert into public.payroll_periods (
    restaurant_id, period_start, period_end, created_by_profile_id
  ) values (p_restaurant_id, p_period_start, p_period_end, v_actor)
  on conflict (restaurant_id, period_start, period_end) do update
    set restaurant_id = excluded.restaurant_id
  returning id into v_period_id;

  select coalesce(max(version_number), 0) + 1 into v_version
  from public.payroll_runs where payroll_period_id = v_period_id;

  update public.payroll_runs
  set status = 'superseded'
  where payroll_period_id = v_period_id
    and status not in ('finalized', 'superseded');

  select jsonb_build_object(
    'restaurant_id', p_restaurant_id,
    'period_start', p_period_start,
    'period_end', p_period_end,
    'configuration', to_jsonb(v_configuration),
    'rule_set', (select to_jsonb(r) from public.payroll_rule_sets r where r.id = v_configuration.rule_set_id),
    'work_weeks', coalesce((
      select jsonb_agg(jsonb_build_object(
        'week_start', w.week_start, 'actuals_status', w.actuals_status,
        'actuals_revision', w.actuals_revision, 'planning_revision', w.planning_revision
      ) order by w.week_start)
      from public.work_weeks w
      where w.restaurant_id = p_restaurant_id
        and w.week_start between public.week_start_for_date(p_period_start)
          and public.week_start_for_date(p_period_end)
    ), '[]'::jsonb),
    'time_entries', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', t.id, 'revision', t.revision, 'business_date', t.business_date,
        'clock_in_at', t.clock_in_at, 'clock_out_at', t.clock_out_at,
        'break_minutes', t.break_minutes, 'actual_job_function_id', t.actual_job_function_id,
        'actual_area_id', t.actual_area_id
      ) order by t.business_date, t.id)
      from public.time_entries t
      where t.restaurant_id = p_restaurant_id
        and t.business_date between p_period_start and p_period_end
        and t.status <> 'cancelled'
    ), '[]'::jsonb),
    'employment_terms', coalesce((
      select jsonb_agg(to_jsonb(et) order by et.employee_id, et.valid_from)
      from public.employee_employment_terms et
      where et.restaurant_id = p_restaurant_id and et.active
        and et.valid_from <= p_period_end and (et.valid_to is null or et.valid_to >= p_period_start)
    ), '[]'::jsonb),
    'rules', coalesce((
      select jsonb_agg(to_jsonb(r) order by r.priority, r.code)
      from public.payroll_rules r where r.rule_set_id = v_configuration.rule_set_id
        and r.status in ('verified', 'effective')
    ), '[]'::jsonb),
    'benefits', coalesce((
      select jsonb_agg(to_jsonb(b) order by b.employee_id, b.component_code)
      from public.employee_payroll_benefits b
      where b.restaurant_id = p_restaurant_id and b.active
        and b.valid_from <= p_period_end and (b.valid_to is null or b.valid_to >= p_period_start)
    ), '[]'::jsonb),
    'adjustments', coalesce((
      select jsonb_agg(to_jsonb(a) order by a.employee_id, a.effective_date, a.id)
      from public.employee_payroll_adjustments a
      where a.restaurant_id = p_restaurant_id and a.effective_date between p_period_start and p_period_end
    ), '[]'::jsonb)
  ) into v_snapshot;

  v_hash := encode(digest(convert_to(v_snapshot::text, 'UTF8'), 'sha256'), 'hex');

  insert into public.payroll_runs (
    id, restaurant_id, payroll_period_id, version_number, status,
    calculation_quality, rule_set_id, configuration_id,
    input_snapshot, input_sha256, created_by_profile_id
  ) values (
    v_run_id, p_restaurant_id, v_period_id, v_version, 'draft',
    'estimated', v_configuration.rule_set_id, v_configuration.id,
    v_snapshot, v_hash, v_actor
  );

  -- Base remuneration: one line per source entry and employment-term version.
  with entry_evidence as (
    select
      t.*,
      greatest(0, floor(extract(epoch from (t.clock_out_at - t.clock_in_at)) / 60)::integer - t.break_minutes) as net_minutes,
      et.id as employment_terms_id,
      et.employment_regime,
      et.worker_status,
      et.salary_basis,
      et.contractual_hourly_rate,
      et.contractual_monthly_salary_cents,
      et.reference_full_time_weekly_minutes,
      et.cp302_category,
      least(45, greatest(0, extract(year from age(t.business_date, coalesce(et.function_seniority_date, et.company_seniority_date, et.valid_from)))::integer)) as function_years
    from public.time_entries t
    join lateral (
      select x.* from public.employee_employment_terms x
      where x.restaurant_id = t.restaurant_id and x.employee_id = t.employee_id
        and x.active and x.valid_from <= t.business_date
        and (x.valid_to is null or x.valid_to >= t.business_date)
      order by x.valid_from desc, x.version_number desc limit 1
    ) et on true
    where t.restaurant_id = p_restaurant_id
      and t.business_date between p_period_start and p_period_end
      and t.status <> 'cancelled' and t.clock_out_at is not null
      and et.employment_regime <> 'self_employed'
  ), rated as (
    select e.*,
      s.hourly_rate as scale_rate,
      case
        when e.employment_regime = 'flexi' and e.business_date >= date '2026-03-01'
          then greatest(coalesce(e.contractual_hourly_rate, 0), 11.8700::numeric)
        when e.salary_basis = 'hourly'
          then greatest(coalesce(e.contractual_hourly_rate, 0), coalesce(s.hourly_rate, 0))
        when e.salary_basis = 'monthly'
          then greatest(
            e.contractual_monthly_salary_cents::numeric / 100
              / ((e.reference_full_time_weekly_minutes::numeric / 60) * 52 / 12),
            coalesce(s.hourly_rate, 0)
          )
        else coalesce(e.contractual_hourly_rate, s.hourly_rate, 0)
      end as applied_rate
    from entry_evidence e
    left join public.cp302_salary_scales s
      on s.rule_set_id = v_configuration.rule_set_id
      and s.category = e.cp302_category
      and s.function_years = e.function_years
      and s.valid_from <= e.business_date
      and (s.valid_to is null or s.valid_to >= e.business_date)
  )
  insert into public.payroll_component_lines (
    payroll_run_id, restaurant_id, employee_id, component_code,
    quantity, unit, rate, multiplier_basis_points,
    gross_amount_cents, taxable_amount_cents, social_security_base_cents,
    net_impact_cents, employer_cost_impact_cents, employment_terms_id,
    source_hash, explanation
  )
  select
    v_run_id, r.restaurant_id, r.employee_id,
    case when r.employment_regime = 'flexi' then 'FLEXI_BASE'
         when r.employment_regime = 'student_reduced' then 'STUDENT_PAY'
         else 'BASE_PAY' end,
    r.net_minutes, 'minutes', r.applied_rate, 10000,
    public.payroll_money_cents(r.net_minutes::numeric * r.applied_rate / 60),
    case when r.employment_regime = 'flexi' then 0
         else public.payroll_money_cents(r.net_minutes::numeric * r.applied_rate / 60) end,
    case when r.employment_regime = 'flexi' then 0
         when r.worker_status = 'blue_collar' then round(public.payroll_money_cents(r.net_minutes::numeric * r.applied_rate / 60) * 1.08)::bigint
         else public.payroll_money_cents(r.net_minutes::numeric * r.applied_rate / 60) end,
    public.payroll_money_cents(r.net_minutes::numeric * r.applied_rate / 60),
    public.payroll_money_cents(r.net_minutes::numeric * r.applied_rate / 60),
    r.employment_terms_id,
    encode(digest(convert_to(r.id::text || ':' || r.revision::text, 'UTF8'), 'sha256'), 'hex'),
    format('%s minutes x EUR %s/hour; employment terms v%s; CP302 category %s year %s.',
      r.net_minutes, r.applied_rate, r.employment_terms_id, r.cp302_category, r.function_years)
  from rated r
  where r.net_minutes > 0 and r.applied_rate > 0;

  -- Flexi holiday pay is a separate explainable component.
  insert into public.payroll_component_lines (
    payroll_run_id, restaurant_id, employee_id, component_code,
    quantity, unit, rate, multiplier_basis_points, gross_amount_cents,
    net_impact_cents, employer_cost_impact_cents, rule_id,
    employment_terms_id, source_hash, explanation
  )
  select
    l.payroll_run_id, l.restaurant_id, l.employee_id, 'FLEXI_HOLIDAY_PAY',
    l.gross_amount_cents, 'amount', 0.0767, 767,
    round(l.gross_amount_cents * 0.0767)::bigint,
    round(l.gross_amount_cents * 0.0767)::bigint,
    round(l.gross_amount_cents * 0.0767)::bigint,
    r.id, l.employment_terms_id,
    encode(digest(convert_to(l.source_hash || ':flexi-holiday', 'UTF8'), 'sha256'), 'hex'),
    format('7.67%% flexi holiday pay on EUR %s.', (l.gross_amount_cents::numeric / 100))
  from public.payroll_component_lines l
  join public.employee_employment_terms et on et.id = l.employment_terms_id
  join public.payroll_rules r on r.rule_set_id = v_configuration.rule_set_id and r.code = 'FLEXI_HOLIDAY_PAY'
  where l.payroll_run_id = v_run_id and et.employment_regime = 'flexi'
    and l.component_code = 'FLEXI_BASE';

  -- Effective benefits and explicit adjustments are additive evidence lines.
  insert into public.payroll_component_lines (
    payroll_run_id, restaurant_id, employee_id, component_code,
    quantity, unit, rate, gross_amount_cents, taxable_amount_cents,
    social_security_base_cents, employee_contribution_cents,
    net_impact_cents, employer_cost_impact_cents, source_hash, explanation
  )
  select
    v_run_id, b.restaurant_id, b.employee_id, b.component_code,
    coalesce(b.quantity, 1), 'amount', b.amount_cents::numeric / 100,
    case when b.taxable then coalesce(b.amount_cents, 0) else 0 end,
    case when b.taxable then coalesce(b.amount_cents, 0) else 0 end,
    case when b.social_security then coalesce(b.amount_cents, 0) else 0 end,
    coalesce(b.employee_share_cents, 0),
    coalesce(b.amount_cents, 0) - coalesce(b.employee_share_cents, 0),
    coalesce(b.employer_share_cents, b.amount_cents, 0),
    encode(digest(convert_to(b.id::text, 'UTF8'), 'sha256'), 'hex'),
    coalesce(b.notes, 'Effective-dated payroll benefit.')
  from public.employee_payroll_benefits b
  where b.restaurant_id = p_restaurant_id and b.active
    and b.evidence_status = 'verified'
    and b.valid_from <= p_period_end and (b.valid_to is null or b.valid_to >= p_period_start);

  insert into public.payroll_component_lines (
    payroll_run_id, restaurant_id, employee_id, component_code,
    quantity, unit, gross_amount_cents, taxable_amount_cents,
    social_security_base_cents, net_impact_cents, employer_cost_impact_cents,
    source_hash, explanation
  )
  select v_run_id, a.restaurant_id, a.employee_id, a.component_code,
    1, 'amount', a.amount_cents, a.taxable_amount_cents,
    a.social_security_base_cents, a.net_impact_cents, a.employer_cost_impact_cents,
    encode(digest(convert_to(a.id::text, 'UTF8'), 'sha256'), 'hex'), a.reason
  from public.employee_payroll_adjustments a
  where a.restaurant_id = p_restaurant_id
    and a.effective_date between p_period_start and p_period_end;

  -- Create employee result shells before aggregate deduction/cost components.
  insert into public.payroll_employee_results (
    payroll_run_id, restaurant_id, employee_id, payable_minutes,
    gross_cents, taxable_cents, social_security_base_cents,
    employee_contributions_cents, professional_withholding_cents,
    estimated_net_cents, employer_contributions_cents, employer_cost_cents,
    calculation_quality, warnings
  )
  select
    v_run_id, p_restaurant_id, l.employee_id,
    coalesce(sum(l.quantity) filter (where l.unit = 'minutes'), 0)::integer,
    sum(l.gross_amount_cents), sum(l.taxable_amount_cents), sum(l.social_security_base_cents),
    0, 0, greatest(0, sum(l.net_impact_cents)), 0, greatest(0, sum(l.employer_cost_impact_cents)),
    'estimated',
    jsonb_build_array(jsonb_build_object(
      'code', 'NET_ESTIMATE',
      'message', 'Professional withholding and work bonus are not authoritative until reconciled.'
    ))
  from public.payroll_component_lines l
  where l.payroll_run_id = v_run_id
  group by l.employee_id;

  update public.payroll_component_lines l
  set payroll_employee_result_id = r.id
  from public.payroll_employee_results r
  where r.payroll_run_id = v_run_id and l.payroll_run_id = v_run_id
    and r.employee_id = l.employee_id;

  -- Social contributions by effective regime. Ordinary blue-collar bases were
  -- already increased to 108% on the source lines.
  insert into public.payroll_component_lines (
    payroll_run_id, payroll_employee_result_id, restaurant_id, employee_id,
    component_code, quantity, unit, rate, multiplier_basis_points,
    employee_contribution_cents, net_impact_cents, rule_id,
    source_hash, explanation
  )
  select v_run_id, er.id, er.restaurant_id, er.employee_id,
    case when et.employment_regime = 'student_reduced' then 'STUDENT_SOLIDARITY' else 'EMPLOYEE_ONSS' end,
    er.social_security_base_cents, 'amount',
    case when et.employment_regime = 'student_reduced' then 0.0271 else 0.1307 end,
    case when et.employment_regime = 'student_reduced' then 271 else 1307 end,
    case when et.employment_regime = 'flexi' then 0
         when et.employment_regime = 'student_reduced' then round(er.social_security_base_cents * 0.0271)::bigint
         else round(er.social_security_base_cents * 0.1307)::bigint end,
    case when et.employment_regime = 'flexi' then 0
         when et.employment_regime = 'student_reduced' then -round(er.social_security_base_cents * 0.0271)::bigint
         else -round(er.social_security_base_cents * 0.1307)::bigint end,
    pr.id,
    encode(digest(convert_to(er.id::text || ':employee-social', 'UTF8'), 'sha256'), 'hex'),
    case when et.employment_regime = 'student_reduced'
      then '2.71% student solidarity contribution.'
      when et.employment_regime = 'flexi' then 'No employee social deduction under the verified flexi regime.'
      else '13.07% ordinary employee ONSS before any verified work bonus.' end
  from public.payroll_employee_results er
  join lateral (
    select x.* from public.employee_employment_terms x
    where x.restaurant_id = er.restaurant_id and x.employee_id = er.employee_id
      and x.active and x.valid_from <= p_period_end
      and (x.valid_to is null or x.valid_to >= p_period_start)
    order by x.valid_from desc limit 1
  ) et on true
  left join public.payroll_rules pr
    on pr.rule_set_id = v_configuration.rule_set_id and pr.code = case
      when et.employment_regime = 'student_reduced' then 'STUDENT_EMPLOYEE_SOLIDARITY'
      when et.employment_regime = 'flexi' then 'FLEXI_HOLIDAY_PAY'
      else 'ORDINARY_EMPLOYEE_ONSS' end
  where er.payroll_run_id = v_run_id;

  insert into public.payroll_component_lines (
    payroll_run_id, payroll_employee_result_id, restaurant_id, employee_id,
    component_code, quantity, unit, rate, multiplier_basis_points,
    employer_contribution_cents, employer_cost_impact_cents, rule_id,
    source_hash, explanation
  )
  select v_run_id, er.id, er.restaurant_id, er.employee_id,
    case when et.employment_regime = 'flexi' then 'FLEXI_EMPLOYER_CONTRIBUTION'
         when et.employment_regime = 'student_reduced' then 'STUDENT_EMPLOYER_SOLIDARITY'
         else 'EMPLOYER_ONSS_BASE' end,
    case when et.employment_regime = 'flexi' then er.gross_cents else er.social_security_base_cents end,
    'amount',
    case when et.employment_regime = 'flexi' then 0.28
         when et.employment_regime = 'student_reduced' then 0.0542 else 0.2492 end,
    case when et.employment_regime = 'flexi' then 2800
         when et.employment_regime = 'student_reduced' then 542 else 2492 end,
    case when et.employment_regime = 'flexi' then round(er.gross_cents * 0.28)::bigint
         when et.employment_regime = 'student_reduced' then round(er.social_security_base_cents * 0.0542)::bigint
         else round(er.social_security_base_cents * 0.2492)::bigint end,
    case when et.employment_regime = 'flexi' then round(er.gross_cents * 0.28)::bigint
         when et.employment_regime = 'student_reduced' then round(er.social_security_base_cents * 0.0542)::bigint
         else round(er.social_security_base_cents * 0.2492)::bigint end,
    pr.id,
    encode(digest(convert_to(er.id::text || ':employer-social', 'UTF8'), 'sha256'), 'hex'),
    case when et.employment_regime = 'flexi' then '28% employer flexi contribution on complete flexi salary.'
         when et.employment_regime = 'student_reduced' then '5.42% employer student solidarity contribution.'
         else '24.92% private-sector employer base contribution before category additions and reductions.' end
  from public.payroll_employee_results er
  join lateral (
    select x.* from public.employee_employment_terms x
    where x.restaurant_id = er.restaurant_id and x.employee_id = er.employee_id
      and x.active and x.valid_from <= p_period_end
      and (x.valid_to is null or x.valid_to >= p_period_start)
    order by x.valid_from desc limit 1
  ) et on true
  join public.payroll_rules pr
    on pr.rule_set_id = v_configuration.rule_set_id and pr.code = case
      when et.employment_regime = 'flexi' then 'FLEXI_EMPLOYER_CONTRIBUTION'
      when et.employment_regime = 'student_reduced' then 'STUDENT_EMPLOYER_SOLIDARITY'
      else 'ORDINARY_EMPLOYER_BASE' end
  where er.payroll_run_id = v_run_id;

  insert into public.payroll_component_lines (
    payroll_run_id, payroll_employee_result_id, restaurant_id, employee_id,
    component_code, quantity, unit, rate, multiplier_basis_points,
    employer_contribution_cents, employer_cost_impact_cents, rule_id,
    source_hash, explanation
  )
  select v_run_id, er.id, er.restaurant_id, er.employee_id, v.component_code,
    er.social_security_base_cents, 'amount', v.rate, v.bps,
    round(er.social_security_base_cents * v.rate)::bigint,
    round(er.social_security_base_cents * v.rate)::bigint,
    pr.id,
    encode(digest(convert_to(er.id::text || ':' || v.component_code, 'UTF8'), 'sha256'), 'hex'),
    v.explanation
  from public.payroll_employee_results er
  join lateral (
    select x.* from public.employee_employment_terms x
    where x.restaurant_id = er.restaurant_id and x.employee_id = er.employee_id
      and x.active and x.worker_status = 'blue_collar'
      and x.valid_from <= p_period_end and (x.valid_to is null or x.valid_to >= p_period_start)
    order by x.valid_from desc limit 1
  ) et on true
  cross join (values
    ('BLUE_COLLAR_VACATION_QUARTERLY', 0.0557::numeric, 557, '5.57% quarterly vacation contribution on the 108% base.'),
    ('BLUE_COLLAR_VACATION_ANNUAL_PROVISION', 0.1027::numeric, 1027, '10.27% annual vacation debit provision on the 108% base.')
  ) v(component_code, rate, bps, explanation)
  join public.payroll_rules pr on pr.rule_set_id = v_configuration.rule_set_id
    and pr.code = case v.component_code
      when 'BLUE_COLLAR_VACATION_QUARTERLY' then 'BLUE_COLLAR_VACATION_QUARTERLY'
      else 'BLUE_COLLAR_VACATION_ANNUAL' end
  where er.payroll_run_id = v_run_id;

  -- Manual withholding is an estimate, never an official formula claim.
  insert into public.payroll_component_lines (
    payroll_run_id, payroll_employee_result_id, restaurant_id, employee_id,
    component_code, quantity, unit, rate, multiplier_basis_points,
    professional_withholding_cents, net_impact_cents, source_hash, explanation
  )
  select v_run_id, er.id, er.restaurant_id, er.employee_id,
    'PROFESSIONAL_WITHHOLDING', er.taxable_cents, 'amount',
    tp.manual_withholding_basis_points::numeric / 10000,
    tp.manual_withholding_basis_points,
    round(er.taxable_cents * tp.manual_withholding_basis_points::numeric / 10000)::bigint,
    -round(er.taxable_cents * tp.manual_withholding_basis_points::numeric / 10000)::bigint,
    encode(digest(convert_to(tp.id::text || ':' || er.id::text, 'UTF8'), 'sha256'), 'hex'),
    'Owner-recorded withholding estimate; reconcile with the official payroll provider.'
  from public.payroll_employee_results er
  join lateral (
    select x.* from public.employee_tax_profiles x
    where x.restaurant_id = er.restaurant_id and x.employee_id = er.employee_id
      and x.active and x.manual_withholding_basis_points is not null
      and x.valid_from <= p_period_end and (x.valid_to is null or x.valid_to >= p_period_start)
    order by x.valid_from desc limit 1
  ) tp on true
  where er.payroll_run_id = v_run_id;

  -- Source lineage for every time-entry-derived line.
  insert into public.payroll_component_sources (
    payroll_component_line_id, source_type, source_id, source_revision,
    source_date, source_snapshot
  )
  select l.id, 'time_entry', t.id, t.revision, t.business_date,
    jsonb_build_object(
      'clock_in_at', t.clock_in_at, 'clock_out_at', t.clock_out_at,
      'break_minutes', t.break_minutes, 'status', t.status,
      'actual_job_function_id', t.actual_job_function_id,
      'actual_area_id', t.actual_area_id
    )
  from public.payroll_component_lines l
  join public.time_entries t
    on l.source_hash = encode(digest(convert_to(t.id::text || ':' || t.revision::text, 'UTF8'), 'sha256'), 'hex')
  where l.payroll_run_id = v_run_id;

  -- Final employee and run totals from component evidence.
  update public.payroll_employee_results er
  set employee_contributions_cents = x.employee_contributions,
      professional_withholding_cents = x.withholding,
      estimated_net_cents = greatest(0, x.net_total),
      employer_contributions_cents = x.employer_contributions,
      employer_cost_cents = greatest(0, x.employer_cost_total)
  from (
    select l.payroll_employee_result_id,
      coalesce(sum(l.employee_contribution_cents), 0)::bigint as employee_contributions,
      coalesce(sum(l.professional_withholding_cents), 0)::bigint as withholding,
      coalesce(sum(l.net_impact_cents), 0)::bigint as net_total,
      coalesce(sum(l.employer_contribution_cents), 0)::bigint as employer_contributions,
      coalesce(sum(l.employer_cost_impact_cents), 0)::bigint as employer_cost_total
    from public.payroll_component_lines l
    where l.payroll_run_id = v_run_id
    group by l.payroll_employee_result_id
  ) x
  where er.id = x.payroll_employee_result_id and er.payroll_run_id = v_run_id;

  select coalesce(sum(jsonb_array_length(warnings)), 0)::integer into v_warning_count
  from public.payroll_employee_results where payroll_run_id = v_run_id;

  update public.payroll_runs r
  set status = 'calculated', calculation_quality = 'estimated',
      warning_count = v_warning_count,
      total_payable_minutes = x.payable_minutes,
      total_gross_cents = x.gross_cents,
      total_employee_deductions_cents = x.employee_deductions,
      total_estimated_net_cents = x.estimated_net,
      total_employer_contributions_cents = x.employer_contributions,
      total_employer_cost_cents = x.employer_cost,
      calculated_at = now()
  from (
    select coalesce(sum(payable_minutes), 0)::integer as payable_minutes,
      coalesce(sum(gross_cents), 0)::bigint as gross_cents,
      coalesce(sum(employee_contributions_cents + professional_withholding_cents + other_employee_deductions_cents), 0)::bigint as employee_deductions,
      coalesce(sum(estimated_net_cents), 0)::bigint as estimated_net,
      coalesce(sum(employer_contributions_cents), 0)::bigint as employer_contributions,
      coalesce(sum(employer_cost_cents), 0)::bigint as employer_cost
    from public.payroll_employee_results where payroll_run_id = v_run_id
  ) x
  where r.id = v_run_id;

  return jsonb_build_object('ok', true, 'payroll_run_id', v_run_id, 'version_number', v_version, 'input_sha256', v_hash);
end
$$;

create function public.get_payroll_workspace(
  p_restaurant_id uuid,
  p_from_date date,
  p_to_date date
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_owner(p_restaurant_id) then
    raise exception 'Only an owner can view payroll calculations.';
  end if;
  return jsonb_build_object(
    'readiness', public.payroll_readiness_report(p_restaurant_id, p_from_date, p_to_date),
    'periods', coalesce((select jsonb_agg(to_jsonb(p) order by p.period_start desc) from public.payroll_periods p where p.restaurant_id = p_restaurant_id and p.period_start <= p_to_date and p.period_end >= p_from_date), '[]'::jsonb),
    'runs', coalesce((select jsonb_agg(to_jsonb(r) order by r.created_at desc) from public.payroll_runs r join public.payroll_periods p on p.id = r.payroll_period_id where r.restaurant_id = p_restaurant_id and p.period_start <= p_to_date and p.period_end >= p_from_date), '[]'::jsonb),
    'employee_results', coalesce((select jsonb_agg(to_jsonb(e) order by e.employee_id) from public.payroll_employee_results e join public.payroll_runs r on r.id = e.payroll_run_id join public.payroll_periods p on p.id = r.payroll_period_id where e.restaurant_id = p_restaurant_id and p.period_start <= p_to_date and p.period_end >= p_from_date), '[]'::jsonb),
    'component_lines', coalesce((select jsonb_agg(to_jsonb(l) order by l.employee_id, l.component_code, l.created_at) from public.payroll_component_lines l join public.payroll_runs r on r.id = l.payroll_run_id join public.payroll_periods p on p.id = r.payroll_period_id where l.restaurant_id = p_restaurant_id and p.period_start <= p_to_date and p.period_end >= p_from_date), '[]'::jsonb),
    'providers', coalesce((select jsonb_agg(to_jsonb(p) order by p.name) from public.payroll_providers p where p.active), '[]'::jsonb),
    'provider_components', coalesce((select jsonb_agg(to_jsonb(m) order by m.provider_id, m.provider_code) from public.payroll_provider_components m where m.active), '[]'::jsonb),
    'provider_employee_mappings', coalesce((select jsonb_agg(to_jsonb(m) order by m.employee_id) from public.payroll_provider_employee_mappings m where m.restaurant_id = p_restaurant_id and m.active), '[]'::jsonb),
    'provider_exports', coalesce((select jsonb_agg(to_jsonb(e) order by e.created_at desc) from public.payroll_provider_exports e where e.restaurant_id = p_restaurant_id), '[]'::jsonb),
    'reconciliations', coalesce((select jsonb_agg(to_jsonb(r) order by r.created_at desc) from public.payroll_reconciliations r where r.restaurant_id = p_restaurant_id), '[]'::jsonb)
  );
end
$$;

create function public.set_payroll_run_status(
  p_restaurant_id uuid,
  p_payroll_run_id uuid,
  p_status text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare v_run public.payroll_runs%rowtype;
begin
  if not public.is_owner(p_restaurant_id) then raise exception 'Only an owner can change payroll status.'; end if;
  select * into v_run from public.payroll_runs where restaurant_id = p_restaurant_id and id = p_payroll_run_id for update;
  if v_run.id is null then raise exception 'Payroll run not found.'; end if;
  if (v_run.status = 'calculated' and p_status = 'reviewed') then
    update public.payroll_runs set status = 'reviewed', reviewed_at = now(), reviewed_by_profile_id = public.current_profile_id() where id = v_run.id;
  elsif (v_run.status = 'reviewed' and p_status = 'reconciled') then
    if exists (select 1 from public.payroll_reconciliations where payroll_run_id = v_run.id and status = 'open') then
      raise exception 'Resolve every provider variance before reconciliation.';
    end if;
    update public.payroll_runs set status = 'reconciled', calculation_quality = 'reconciled', reconciled_at = now(), reconciled_by_profile_id = public.current_profile_id() where id = v_run.id;
  elsif (v_run.status in ('reviewed','reconciled') and p_status = 'finalized') then
    update public.payroll_runs set status = 'finalized', finalized_at = now(), finalized_by_profile_id = public.current_profile_id() where id = v_run.id;
    update public.payroll_periods set status = 'closed' where id = v_run.payroll_period_id;
  else
    raise exception 'Unsupported payroll status transition from % to %.', v_run.status, p_status;
  end if;
  return jsonb_build_object('ok', true, 'status', p_status);
end
$$;

do $$
declare t text;
begin
  foreach t in array array[
    'employee_payroll_adjustments','payroll_periods','payroll_runs',
    'payroll_employee_results','payroll_component_lines','payroll_component_sources',
    'payroll_quota_movements','payroll_providers','payroll_provider_components',
    'payroll_provider_employee_mappings','payroll_provider_exports',
    'payroll_provider_return_files','payroll_reconciliations'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on table public.%I from public, anon, authenticated', t);
    execute format('grant all on table public.%I to service_role', t);
  end loop;
end
$$;

revoke all on function public.reject_payroll_calculation_evidence_mutation() from public, anon, authenticated;
revoke all on function public.guard_payroll_run_status() from public, anon, authenticated;
revoke all on function public.payroll_money_cents(numeric) from public, anon, authenticated;
revoke all on function public.calculate_payroll_run(uuid, date, date) from public, anon, authenticated;
revoke all on function public.get_payroll_workspace(uuid, date, date) from public, anon, authenticated;
revoke all on function public.set_payroll_run_status(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.calculate_payroll_run(uuid, date, date) to authenticated;
grant execute on function public.get_payroll_workspace(uuid, date, date) to authenticated;
grant execute on function public.set_payroll_run_status(uuid, uuid, text) to authenticated;

commit;
