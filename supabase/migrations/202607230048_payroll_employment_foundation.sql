-- V567: effective-dated payroll employment foundation.
--
-- This migration is additive. Legacy contract labels and payroll profiles stay
-- available to existing screens and exports, while payroll calculations gain a
-- normalized, effective-dated source of truth.
begin;

do $$
begin
  if not exists (select 1 from pg_type where typname = 'contract_duration_kind') then
    create type public.contract_duration_kind as enum (
      'indefinite', 'fixed_term', 'defined_work', 'replacement'
    );
  end if;
  if not exists (select 1 from pg_type where typname = 'employment_payroll_regime') then
    create type public.employment_payroll_regime as enum (
      'ordinary', 'flexi', 'student_reduced', 'student_ordinary',
      'horeca_occasional', 'interim', 'self_employed'
    );
  end if;
  if not exists (select 1 from pg_type where typname = 'employment_volume') then
    create type public.employment_volume as enum ('full_time', 'part_time');
  end if;
  if not exists (select 1 from pg_type where typname = 'weekly_hours_regime') then
    create type public.weekly_hours_regime as enum ('fixed', 'variable_average');
  end if;
  if not exists (select 1 from pg_type where typname = 'legal_schedule_type') then
    create type public.legal_schedule_type as enum ('fixed', 'variable');
  end if;
  if not exists (select 1 from pg_type where typname = 'salary_basis') then
    create type public.salary_basis as enum (
      'hourly', 'monthly', 'service_percentage', 'tip_or_service_forfait'
    );
  end if;
end
$$;

create table public.employee_employment_terms (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null,
  employee_id uuid not null,
  contract_id uuid,
  valid_from date not null,
  valid_to date,
  version_number integer not null,
  supersedes_id uuid,
  superseded_at timestamptz,
  contract_duration_kind public.contract_duration_kind not null,
  employment_regime public.employment_payroll_regime not null,
  worker_status public.worker_status,
  employment_volume public.employment_volume not null,
  weekly_hours_regime public.weekly_hours_regime not null,
  legal_schedule_type public.legal_schedule_type not null,
  scheduling_policy public.work_regime not null,
  salary_basis public.salary_basis,
  contract_weekly_minutes integer not null,
  reference_full_time_weekly_minutes integer not null default 2280,
  reference_period_weeks integer not null default 1,
  working_days_per_week numeric(4,2),
  cp302_reference_function_code text,
  cp302_category smallint,
  function_seniority_date date,
  company_seniority_date date,
  contractual_hourly_rate numeric(12,4),
  contractual_monthly_salary_cents bigint,
  service_percentage_basis_points integer,
  annual_leave_entitlement_days numeric(6,2) not null default 0,
  active boolean not null default true,
  source_status text not null default 'recorded',
  source_notes text,
  created_by_profile_id uuid,
  created_at timestamptz not null default now(),
  constraint employee_employment_terms_restaurant_fk
    foreign key (restaurant_id) references public.restaurants(id) on delete restrict,
  constraint employee_employment_terms_employee_fk
    foreign key (restaurant_id, employee_id)
      references public.employees(restaurant_id, id) on delete restrict,
  constraint employee_employment_terms_contract_fk
    foreign key (restaurant_id, contract_id)
      references public.employee_contracts(restaurant_id, id) on delete restrict,
  constraint employee_employment_terms_supersedes_fk
    foreign key (supersedes_id) references public.employee_employment_terms(id) on delete restrict,
  constraint employee_employment_terms_actor_fk
    foreign key (created_by_profile_id) references public.profiles(id) on delete restrict,
  constraint employee_employment_terms_restaurant_id_id_key unique (restaurant_id, id),
  constraint employee_employment_terms_employee_version_key
    unique (restaurant_id, employee_id, version_number),
  constraint employee_employment_terms_validity_check
    check (valid_to is null or valid_to >= valid_from),
  constraint employee_employment_terms_minutes_check
    check (
      contract_weekly_minutes between 0 and 10080
      and reference_full_time_weekly_minutes between 60 and 10080
    ),
  constraint employee_employment_terms_reference_period_check
    check (reference_period_weeks between 1 and 52),
  constraint employee_employment_terms_working_days_check
    check (working_days_per_week is null or working_days_per_week between 0 and 7),
  constraint employee_employment_terms_category_check
    check (cp302_category is null or cp302_category between 1 and 9),
  constraint employee_employment_terms_hourly_rate_check
    check (contractual_hourly_rate is null or contractual_hourly_rate >= 0),
  constraint employee_employment_terms_monthly_salary_check
    check (contractual_monthly_salary_cents is null or contractual_monthly_salary_cents >= 0),
  constraint employee_employment_terms_service_percentage_check
    check (service_percentage_basis_points is null or service_percentage_basis_points between 0 and 10000),
  constraint employee_employment_terms_leave_check
    check (annual_leave_entitlement_days >= 0),
  constraint employee_employment_terms_source_status_check
    check (source_status in ('recorded', 'migrated_unverified', 'verified')),
  constraint employee_employment_terms_salary_value_check check (
    salary_basis is null
    or (salary_basis = 'hourly' and contractual_hourly_rate is not null)
    or (salary_basis = 'monthly' and contractual_monthly_salary_cents is not null)
    or (salary_basis = 'service_percentage' and service_percentage_basis_points is not null)
    or salary_basis = 'tip_or_service_forfait'
  )
);

create index employee_employment_terms_lookup_idx
  on public.employee_employment_terms (
    restaurant_id, employee_id, valid_from desc, version_number desc
  );
create unique index employee_employment_terms_one_open_active
  on public.employee_employment_terms (restaurant_id, employee_id)
  where active and valid_to is null;

comment on table public.employee_employment_terms is
  'Immutable effective-dated legal and salary terms used by payroll calculations. Legacy employee_contracts remain the operational contract record.';
comment on column public.employee_employment_terms.source_status is
  'migrated_unverified means legacy data was mapped mechanically and must be reviewed before payroll finalization.';

create function public.guard_employee_employment_terms_history()
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
    new.source_status, new.source_notes, new.created_by_profile_id, new.created_at
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
    old.source_status, old.source_notes, old.created_by_profile_id, old.created_at
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
  return new;
end
$$;

create trigger employee_employment_terms_history_guard
before update or delete on public.employee_employment_terms
for each row execute function public.guard_employee_employment_terms_history();

create function public.prevent_employee_employment_terms_overlap()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.active and exists (
    select 1
    from public.employee_employment_terms t
    where t.restaurant_id = new.restaurant_id
      and t.employee_id = new.employee_id
      and t.active
      and t.id <> new.id
      and daterange(t.valid_from, coalesce(t.valid_to + 1, 'infinity'::date), '[)')
          && daterange(new.valid_from, coalesce(new.valid_to + 1, 'infinity'::date), '[)')
  ) then
    raise exception 'Active employment-term periods cannot overlap.';
  end if;
  return new;
end
$$;

create trigger employee_employment_terms_no_overlap
before insert or update on public.employee_employment_terms
for each row execute function public.prevent_employee_employment_terms_overlap();

-- Preserve every legacy contract row. A mutable legacy wage cannot prove what
-- an old wage was, so migrated rows are explicitly marked for owner review.
with legacy as (
  select
    c.*,
    ct.code as contract_code,
    p.hourly_wage_rate,
    row_number() over (
      partition by c.restaurant_id, c.employee_id
      order by coalesce(c.contract_start, c.created_at::date), c.created_at, c.id
    )::integer as version_number,
    lead(coalesce(c.contract_start, c.created_at::date)) over (
      partition by c.restaurant_id, c.employee_id
      order by coalesce(c.contract_start, c.created_at::date), c.created_at, c.id
    ) as next_start
  from public.employee_contracts c
  left join public.contract_types ct
    on ct.restaurant_id = c.restaurant_id and ct.id = c.contract_type_id
  left join public.employee_payroll_profiles p
    on p.restaurant_id = c.restaurant_id and p.employee_id = c.employee_id
), mapped as (
  select
    l.*,
    coalesce(l.contract_start, l.created_at::date) as mapped_from,
    case
      when l.contract_end is not null
        and l.contract_end >= coalesce(l.contract_start, l.created_at::date)
        then l.contract_end
      when l.next_start is not null
        and l.next_start > coalesce(l.contract_start, l.created_at::date)
        then l.next_start - 1
      when not (l.active and l.is_current)
        then coalesce(l.contract_start, l.created_at::date)
      else null
    end as mapped_to
  from legacy l
)
insert into public.employee_employment_terms (
  restaurant_id, employee_id, contract_id, valid_from, valid_to,
  version_number, contract_duration_kind, employment_regime, worker_status,
  employment_volume, weekly_hours_regime, legal_schedule_type,
  scheduling_policy, salary_basis, contract_weekly_minutes,
  reference_full_time_weekly_minutes, reference_period_weeks,
  working_days_per_week, contractual_hourly_rate,
  annual_leave_entitlement_days, active, source_status, source_notes, created_at
)
select
  m.restaurant_id,
  m.employee_id,
  m.id,
  m.mapped_from,
  m.mapped_to,
  m.version_number,
  case upper(coalesce(m.contract_code, ''))
    when 'CDI' then 'indefinite'::public.contract_duration_kind
    when 'FREELANCE' then 'defined_work'::public.contract_duration_kind
    else 'fixed_term'::public.contract_duration_kind
  end,
  case upper(coalesce(m.contract_code, ''))
    when 'FLEXI' then 'flexi'::public.employment_payroll_regime
    when 'STUDENT' then 'student_reduced'::public.employment_payroll_regime
    when 'EXTRA' then 'horeca_occasional'::public.employment_payroll_regime
    when 'FREELANCE' then 'self_employed'::public.employment_payroll_regime
    else 'ordinary'::public.employment_payroll_regime
  end,
  m.worker_status,
  case when m.weekly_contract_hours >= 38 then 'full_time'::public.employment_volume
       else 'part_time'::public.employment_volume end,
  'fixed'::public.weekly_hours_regime,
  case when m.work_regime = 'fixed_schedule' then 'fixed'::public.legal_schedule_type
       else 'variable'::public.legal_schedule_type end,
  m.work_regime,
  case when coalesce(m.hourly_wage_rate, 0) > 0 then 'hourly'::public.salary_basis else null end,
  round(coalesce(m.weekly_contract_hours, 0) * 60)::integer,
  2280,
  1,
  nullif(m.contract_days, 0),
  nullif(m.hourly_wage_rate, 0),
  m.annual_leave_entitlement_days,
  m.active and m.is_current,
  'migrated_unverified',
  'Mapped from legacy contract/profile data; confirm legal axes and salary before final payroll.',
  m.created_at
from mapped m
order by m.restaurant_id, m.employee_id, m.version_number;

-- The legacy save boundary must create a new operational contract version when
-- worker status or annual leave changes. Previously those fields rewrote history.
do $$
declare
  v_oid oid;
  v_def text;
  v_next text;
  v_anchor text := 'v_existing.contract_days is distinct from greatest(0, coalesce(nullif(v_item->>''contract_days'', '''')::numeric, 0))';
begin
  select 'public.save_team_model(uuid,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb)'::regprocedure::oid into v_oid;
  v_def := pg_get_functiondef(v_oid);
  v_next := replace(
    v_def,
    v_anchor,
    v_anchor || ' or
        v_existing.annual_leave_entitlement_days is distinct from greatest(0, coalesce(nullif(v_item->>''annual_leave_entitlement_days'', '''')::numeric, 0)) or
        v_existing.worker_status is distinct from nullif(v_item->>''worker_status'', '''')::public.worker_status'
  );
  if v_next = v_def then
    raise exception 'save_team_model: contract history split anchor no longer matches.';
  end if;
  execute v_next;
end
$$;

create function public.get_employee_employment_terms(p_restaurant_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_owner(p_restaurant_id) then
    raise exception 'Only an owner can view payroll employment terms.';
  end if;
  return coalesce((
    select jsonb_agg(to_jsonb(t) order by t.employee_id, t.valid_from desc, t.version_number desc)
    from public.employee_employment_terms t
    where t.restaurant_id = p_restaurant_id
  ), '[]'::jsonb);
end
$$;

create function public.save_employee_employment_terms(
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
  v_from date := nullif(p_terms->>'valid_from', '')::date;
  v_to date := nullif(p_terms->>'valid_to', '')::date;
  v_previous public.employee_employment_terms%rowtype;
  v_version integer;
  v_id uuid;
begin
  if not public.is_owner(p_restaurant_id) then
    raise exception 'Only an owner can change payroll employment terms.';
  end if;
  if not exists (
    select 1 from public.employees e
    where e.restaurant_id = p_restaurant_id and e.id = p_employee_id
  ) then
    raise exception 'Employee not found in this restaurant.';
  end if;
  if v_from is null then
    raise exception 'An effective date is required.';
  end if;
  if v_to is not null and v_to < v_from then
    raise exception 'The end date cannot be before the effective date.';
  end if;

  select * into v_previous
  from public.employee_employment_terms t
  where t.restaurant_id = p_restaurant_id
    and t.employee_id = p_employee_id
    and t.active
    and t.valid_from <= v_from
    and (t.valid_to is null or t.valid_to >= v_from)
  order by t.valid_from desc, t.version_number desc
  limit 1
  for update;

  if v_previous.id is not null then
    if v_previous.valid_from = v_from then
      update public.employee_employment_terms
      set active = false, superseded_at = now()
      where id = v_previous.id;
    else
      update public.employee_employment_terms
      set valid_to = v_from - 1, superseded_at = now()
      where id = v_previous.id;
    end if;
  end if;

  select coalesce(max(t.version_number), 0) + 1
  into v_version
  from public.employee_employment_terms t
  where t.restaurant_id = p_restaurant_id and t.employee_id = p_employee_id;

  insert into public.employee_employment_terms (
    restaurant_id, employee_id, contract_id, valid_from, valid_to,
    version_number, supersedes_id, contract_duration_kind, employment_regime,
    worker_status, employment_volume, weekly_hours_regime, legal_schedule_type,
    scheduling_policy, salary_basis, contract_weekly_minutes,
    reference_full_time_weekly_minutes, reference_period_weeks,
    working_days_per_week, cp302_reference_function_code, cp302_category,
    function_seniority_date, company_seniority_date, contractual_hourly_rate,
    contractual_monthly_salary_cents, service_percentage_basis_points,
    annual_leave_entitlement_days, active, source_status, source_notes,
    created_by_profile_id
  ) values (
    p_restaurant_id,
    p_employee_id,
    nullif(p_terms->>'contract_id', '')::uuid,
    v_from,
    v_to,
    v_version,
    v_previous.id,
    (p_terms->>'contract_duration_kind')::public.contract_duration_kind,
    (p_terms->>'employment_regime')::public.employment_payroll_regime,
    nullif(p_terms->>'worker_status', '')::public.worker_status,
    (p_terms->>'employment_volume')::public.employment_volume,
    (p_terms->>'weekly_hours_regime')::public.weekly_hours_regime,
    (p_terms->>'legal_schedule_type')::public.legal_schedule_type,
    (p_terms->>'scheduling_policy')::public.work_regime,
    nullif(p_terms->>'salary_basis', '')::public.salary_basis,
    greatest(0, coalesce(nullif(p_terms->>'contract_weekly_minutes', '')::integer, 0)),
    greatest(60, coalesce(nullif(p_terms->>'reference_full_time_weekly_minutes', '')::integer, 2280)),
    greatest(1, coalesce(nullif(p_terms->>'reference_period_weeks', '')::integer, 1)),
    nullif(p_terms->>'working_days_per_week', '')::numeric,
    nullif(btrim(p_terms->>'cp302_reference_function_code'), ''),
    nullif(p_terms->>'cp302_category', '')::smallint,
    nullif(p_terms->>'function_seniority_date', '')::date,
    nullif(p_terms->>'company_seniority_date', '')::date,
    nullif(p_terms->>'contractual_hourly_rate', '')::numeric,
    nullif(p_terms->>'contractual_monthly_salary_cents', '')::bigint,
    nullif(p_terms->>'service_percentage_basis_points', '')::integer,
    greatest(0, coalesce(nullif(p_terms->>'annual_leave_entitlement_days', '')::numeric, 0)),
    true,
    coalesce(nullif(p_terms->>'source_status', ''), 'recorded'),
    nullif(btrim(p_terms->>'source_notes'), ''),
    v_actor
  )
  returning id into v_id;

  return jsonb_build_object(
    'ok', true,
    'employment_terms_id', v_id,
    'version_number', v_version
  );
end
$$;

alter table public.employee_employment_terms enable row level security;
revoke all on table public.employee_employment_terms from public, anon, authenticated;
grant all on table public.employee_employment_terms to service_role;

revoke all on function public.guard_employee_employment_terms_history() from public, anon, authenticated;
revoke all on function public.prevent_employee_employment_terms_overlap() from public, anon, authenticated;
revoke all on function public.get_employee_employment_terms(uuid) from public, anon, authenticated;
revoke all on function public.save_employee_employment_terms(uuid, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.get_employee_employment_terms(uuid) to authenticated;
grant execute on function public.save_employee_employment_terms(uuid, uuid, jsonb) to authenticated;

commit;
