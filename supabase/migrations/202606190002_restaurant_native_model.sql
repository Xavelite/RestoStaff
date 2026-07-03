-- restogogo restaurant-native model
--
-- Preserves without modification:
--   auth.users, public.profiles, profile/auth links,
--   restaurant_memberships, employee_access and every restaurant/employee UUID.
--
-- Existing zone UUIDs become work-area UUIDs. Existing employee and contract
-- job functions become rows in employee_job_functions before legacy columns
-- are removed.
begin;

set local lock_timeout = '5s';
set local statement_timeout = '2min';
select pg_advisory_xact_lock(
  hashtextextended('restogogo:202606190002:restaurant-native-model', 0)
);

do $$
declare
  v_required_table text;
begin
  foreach v_required_table in array array[
    'restaurants',
    'profiles',
    'restaurant_memberships',
    'employee_access',
    'employees',
    'employee_contracts',
    'employee_payroll_profiles',
    'job_functions',
    'contract_types',
    'absence_types',
    'absences',
    'departments',
    'teams',
    'zones',
    'zone_service_defaults',
    'coverage_requirements',
    'planned_shifts',
    'payroll_period_lines'
  ] loop
    if to_regclass('public.' || v_required_table) is null then
      raise exception 'Migration precondition failed: public.% is missing', v_required_table;
    end if;
  end loop;
  if to_regclass('public.work_areas') is not null
     or to_regclass('public.employee_job_functions') is not null then
    raise exception 'Migration precondition failed: restaurant-native tables already exist';
  end if;
end
$$;

-- ---------------------------------------------------------------------------
-- Stable domain vocabulary
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_type where typname = 'work_regime') then
    create type public.work_regime as enum (
      'fixed_schedule',
      'weekly_availability',
      'manager_only'
    );
  end if;
end
$$;

-- ---------------------------------------------------------------------------
-- Areas replace departments + teams + zones
-- ---------------------------------------------------------------------------
create table public.work_areas (
  id            uuid        primary key default gen_random_uuid(),
  restaurant_id uuid        not null references public.restaurants(id) on delete cascade,
  code          text        not null,
  name          text        not null,
  notes         text,
  sort_order    integer     not null default 0,
  active        boolean     not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint work_areas_restaurant_id_id_key unique (restaurant_id, id),
  constraint work_areas_restaurant_code_key unique (restaurant_id, code),
  constraint work_areas_code_not_blank check (btrim(code) <> ''),
  constraint work_areas_name_not_blank check (btrim(name) <> '')
);

do $$
declare
  v_zone public.zones%rowtype;
begin
  for v_zone in select * from public.zones loop
    insert into public.work_areas (
      id, restaurant_id, code, name, notes, sort_order, active, created_at, updated_at
    )
    values (
      v_zone.id,
      v_zone.restaurant_id,
      coalesce(
        nullif(regexp_replace(lower(v_zone.name), '[^a-z0-9]+', '-', 'g'), ''),
        'area'
      ) || '-' || left(v_zone.id::text, 8),
      v_zone.name,
      v_zone.notes,
      v_zone.sort_order,
      v_zone.active,
      v_zone.created_at,
      v_zone.updated_at
    )
    on conflict (id) do nothing;
  end loop;
end;
$$;

create table public.area_service_defaults (
  id            uuid        primary key default gen_random_uuid(),
  restaurant_id uuid        not null references public.restaurants(id) on delete cascade,
  area_id       uuid        not null,
  service_key   text        not null,
  start_time    time,
  end_time      time,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint area_service_defaults_area_fk foreign key (restaurant_id, area_id)
    references public.work_areas(restaurant_id, id) on delete cascade,
  constraint area_service_defaults_service_fk foreign key (restaurant_id, service_key)
    references public.services(restaurant_id, service_key),
  constraint area_service_defaults_restaurant_area_service_key
    unique (restaurant_id, area_id, service_key)
);

insert into public.area_service_defaults (
  id, restaurant_id, area_id, service_key, start_time, end_time, created_at, updated_at
)
select
  id, restaurant_id, zone_id, service_key, start_time, end_time, created_at, updated_at
from public.zone_service_defaults
on conflict (id) do nothing;

alter table public.coverage_requirements add column area_id uuid;
update public.coverage_requirements set area_id = zone_id;
alter table public.coverage_requirements alter column area_id set not null;
alter table public.coverage_requirements
  add constraint coverage_requirements_area_fk
  foreign key (restaurant_id, area_id)
  references public.work_areas(restaurant_id, id) on delete cascade;

alter table public.planned_shifts add column area_id uuid;
update public.planned_shifts set area_id = zone_id;
alter table public.planned_shifts
  add constraint planned_shifts_area_fk
  foreign key (restaurant_id, area_id)
  references public.work_areas(restaurant_id, id);

-- ---------------------------------------------------------------------------
-- Employees can hold multiple positions
-- ---------------------------------------------------------------------------
create table public.employee_job_functions (
  restaurant_id   uuid        not null references public.restaurants(id) on delete cascade,
  employee_id     uuid        not null,
  job_function_id uuid        not null,
  is_primary      boolean     not null default false,
  active          boolean     not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  primary key (restaurant_id, employee_id, job_function_id),
  constraint employee_job_functions_employee_fk foreign key (restaurant_id, employee_id)
    references public.employees(restaurant_id, id) on delete cascade,
  constraint employee_job_functions_job_function_fk foreign key (restaurant_id, job_function_id)
    references public.job_functions(restaurant_id, id) on delete cascade
);

insert into public.employee_job_functions (
  restaurant_id, employee_id, job_function_id, is_primary, active
)
select restaurant_id, id, job_function_id, true, active
from public.employees
where job_function_id is not null
on conflict do nothing;

insert into public.employee_job_functions (
  restaurant_id, employee_id, job_function_id, is_primary, active
)
select c.restaurant_id, c.employee_id, c.job_function_id, true, c.active
from public.employee_contracts c
where c.job_function_id is not null
on conflict (restaurant_id, employee_id, job_function_id)
do update set is_primary = true, active = excluded.active, updated_at = now();

with ranked as (
  select
    restaurant_id,
    employee_id,
    job_function_id,
    row_number() over (
      partition by restaurant_id, employee_id
      order by is_primary desc, active desc, created_at, job_function_id
    ) as position_rank
  from public.employee_job_functions
)
update public.employee_job_functions ej
set is_primary = ranked.position_rank = 1,
    updated_at = now()
from ranked
where ej.restaurant_id = ranked.restaurant_id
  and ej.employee_id = ranked.employee_id
  and ej.job_function_id = ranked.job_function_id
  and ej.is_primary is distinct from (ranked.position_rank = 1);

create unique index employee_job_functions_one_primary_idx
  on public.employee_job_functions (restaurant_id, employee_id)
  where is_primary and active;

create table public.recurring_work_patterns (
  id                 uuid        primary key default gen_random_uuid(),
  restaurant_id      uuid        not null references public.restaurants(id) on delete cascade,
  employee_id        uuid        not null,
  weekday            smallint    not null,
  service_key        text        not null,
  availability_state text        not null default 'available',
  starts_at          time,
  ends_at            time,
  active             boolean     not null default true,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  constraint recurring_work_patterns_employee_fk foreign key (restaurant_id, employee_id)
    references public.employees(restaurant_id, id) on delete cascade,
  constraint recurring_work_patterns_service_fk foreign key (restaurant_id, service_key)
    references public.services(restaurant_id, service_key),
  constraint recurring_work_patterns_employee_day_service_key
    unique (restaurant_id, employee_id, weekday, service_key),
  constraint recurring_work_patterns_weekday_check check (weekday between 1 and 7),
  constraint recurring_work_patterns_availability_check
    check (availability_state in ('available','partial','unavailable')),
  constraint recurring_work_patterns_time_check
    check (starts_at is null or ends_at is null or starts_at <> ends_at)
);

-- ---------------------------------------------------------------------------
-- Fixed contract types and explicit availability mode
-- ---------------------------------------------------------------------------
with canonical(code, name, category, sort_order) as (
  values
    ('CDI', 'CDI', 'permanent', 10),
    ('CDD', 'CDD', 'fixed_term', 20),
    ('FLEXI', 'Flexi', 'flexi', 30),
    ('STUDENT', 'Student', 'student', 40),
    ('EXTRA', 'Extra', 'extra', 50),
    ('FREELANCE', 'Freelance', 'self_employed', 60)
)
insert into public.contract_types (
  restaurant_id, code, name, category, sort_order, active, metadata
)
select r.id, c.code, c.name, c.category, c.sort_order, true, '{"system":true}'::jsonb
from public.restaurants r cross join canonical c
on conflict (restaurant_id, code) do update set
  name = excluded.name,
  category = excluded.category,
  sort_order = excluded.sort_order,
  active = true,
  metadata = excluded.metadata,
  updated_at = now();

update public.employee_contracts ec
set contract_type_id = target.id
from public.contract_types old_type
join lateral (
  select canonical.id
  from public.contract_types canonical
  where canonical.restaurant_id = old_type.restaurant_id
    and canonical.code = case
      when upper(old_type.code) in ('CDI','PERMANENT') or old_type.category = 'permanent' then 'CDI'
      when upper(old_type.code) in ('CDD','FIXED_TERM') or old_type.category = 'fixed_term' then 'CDD'
      when upper(old_type.code) like '%FLEXI%' or old_type.category = 'flexi' then 'FLEXI'
      when upper(old_type.code) like '%STUDENT%' or old_type.category = 'student' then 'STUDENT'
      when upper(old_type.code) like '%FREELANCE%' or old_type.category = 'self_employed' then 'FREELANCE'
      else 'EXTRA'
    end
  limit 1
) target on true
where ec.contract_type_id = old_type.id
  and old_type.code not in ('CDI','CDD','FLEXI','STUDENT','EXTRA','FREELANCE');

delete from public.contract_types
where code not in ('CDI','CDD','FLEXI','STUDENT','EXTRA','FREELANCE');

alter table public.employee_contracts add column work_regime_v2 public.work_regime;
update public.employee_contracts ec
set work_regime_v2 = case
  when ec.work_regime in ('fixed_schedule','weekly_availability','manager_only')
    then ec.work_regime::public.work_regime
  when ct.code in ('CDI','CDD') then 'fixed_schedule'::public.work_regime
  when ct.code in ('FLEXI','STUDENT','EXTRA') then 'weekly_availability'::public.work_regime
  else 'manager_only'::public.work_regime
end
from public.contract_types ct
where ct.id = ec.contract_type_id;
update public.employee_contracts
set work_regime_v2 = 'manager_only'
where work_regime_v2 is null;
alter table public.employee_contracts alter column work_regime_v2 set not null;
alter table public.employee_contracts alter column work_regime_v2 set default 'manager_only';

-- ---------------------------------------------------------------------------
-- Generic payroll and canonical absences
-- ---------------------------------------------------------------------------
alter table public.restaurant_settings drop column if exists payroll_provider;
alter table public.employee_payroll_profiles drop column if exists payroll_provider;
alter table public.time_entries
  add column break_minutes integer not null default 0,
  add constraint time_entries_break_minutes_nonnegative check (break_minutes >= 0);

create or replace function public.enforce_employee_availability_mode()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_mode public.work_regime;
begin
  if public.is_owner_or_manager(new.restaurant_id) then return new; end if;
  select c.work_regime into v_mode
  from public.employee_contracts c
  where c.restaurant_id = new.restaurant_id
    and c.employee_id = new.employee_id
    and c.active and c.is_current
  order by c.created_at desc
  limit 1;
  if coalesce(v_mode, 'manager_only'::public.work_regime)
      <> 'weekly_availability'::public.work_regime then
    raise exception 'Weekly availability is not enabled for this employee.';
  end if;
  return new;
end;
$$;

drop trigger if exists employee_availability_mode_guard
  on public.employee_availability_slots;
create trigger employee_availability_mode_guard
before insert or update on public.employee_availability_slots
for each row execute function public.enforce_employee_availability_mode();

with canonical(code, name, category, paid_policy, color, sort_order) as (
  values
    ('HOLIDAY', 'Holiday', 'holiday', 'paid', '#22c55e', 10),
    ('SICK', 'Sick leave', 'sick', 'paid', '#ef4444', 20),
    ('UNPAID', 'Unpaid leave', 'unpaid', 'unpaid', '#f59e0b', 30),
    ('PUBLIC_HOLIDAY', 'Public holiday', 'other', 'paid', '#38bdf8', 40),
    ('OTHER', 'Other', 'other', 'neutral', '#94a3b8', 50)
)
insert into public.absence_types (
  restaurant_id, code, name, category, paid_policy, color,
  requires_approval, affects_planning, affects_payroll, sort_order, active, metadata
)
select
  r.id, c.code, c.name, c.category, c.paid_policy, c.color,
  c.code <> 'PUBLIC_HOLIDAY', true, true, c.sort_order, true, '{"system":true}'::jsonb
from public.restaurants r cross join canonical c
on conflict (restaurant_id, code) do update set
  name = excluded.name,
  category = excluded.category,
  paid_policy = excluded.paid_policy,
  color = excluded.color,
  requires_approval = excluded.requires_approval,
  affects_planning = true,
  affects_payroll = true,
  sort_order = excluded.sort_order,
  active = true,
  metadata = excluded.metadata,
  updated_at = now();

update public.absences a
set absence_type_id = target.id
from public.absence_types old_type
join lateral (
  select canonical.id
  from public.absence_types canonical
  where canonical.restaurant_id = old_type.restaurant_id
    and canonical.code = case
      when upper(old_type.code) like '%PUBLIC%' then 'PUBLIC_HOLIDAY'
      when upper(old_type.code) like '%HOLIDAY%' then 'HOLIDAY'
      when old_type.category = 'holiday' then 'HOLIDAY'
      when upper(old_type.code) like '%SICK%' or old_type.category = 'sick' then 'SICK'
      when upper(old_type.code) like '%UNPAID%' or old_type.category = 'unpaid' then 'UNPAID'
      else 'OTHER'
    end
  limit 1
) target on true
where a.absence_type_id = old_type.id
  and old_type.code not in ('HOLIDAY','SICK','UNPAID','PUBLIC_HOLIDAY','OTHER');

delete from public.absence_types
where code not in ('HOLIDAY','SICK','UNPAID','PUBLIC_HOLIDAY','OTHER');

alter table public.absence_types drop constraint if exists absence_types_category_check;
alter table public.absence_types
  add constraint absence_types_category_check
  check (category in ('holiday','sick','unpaid','other'));

-- ---------------------------------------------------------------------------
-- Remove redundant columns and tables after data is safely copied
-- ---------------------------------------------------------------------------
alter table public.coverage_requirements
  drop constraint if exists coverage_requirements_zone_fk,
  drop column zone_id;
alter table public.planned_shifts
  drop constraint if exists planned_shifts_zone_fk,
  drop column zone_id;
alter table public.employees
  drop constraint if exists employees_job_function_fk,
  drop column job_function_id;
alter table public.job_functions
  drop constraint if exists job_functions_department_fk,
  drop constraint if exists job_functions_team_fk,
  drop column department_id,
  drop column team_id;
alter table public.employee_contracts
  drop constraint if exists employee_contracts_department_fk,
  drop constraint if exists employee_contracts_team_fk,
  drop constraint if exists employee_contracts_job_function_fk,
  drop column department_id,
  drop column team_id,
  drop column job_function_id,
  drop column profession_label,
  drop column work_regime;
alter table public.employee_contracts rename column work_regime_v2 to work_regime;
alter table public.payroll_period_lines
  drop constraint if exists payroll_period_lines_department_fk,
  drop constraint if exists payroll_period_lines_team_fk,
  drop column department_id,
  drop column team_id;

drop table public.zone_service_defaults;
drop table public.zones;
drop table public.teams;
drop table public.departments;

-- ---------------------------------------------------------------------------
-- RLS/grants for new direct tables: RPC-only
-- ---------------------------------------------------------------------------
alter table public.work_areas enable row level security;
alter table public.area_service_defaults enable row level security;
alter table public.employee_job_functions enable row level security;
alter table public.recurring_work_patterns enable row level security;
revoke all on public.work_areas, public.area_service_defaults,
  public.employee_job_functions, public.recurring_work_patterns
  from anon, authenticated;

-- ---------------------------------------------------------------------------
-- Role-filtered runtime snapshot v2
-- ---------------------------------------------------------------------------
create or replace function public.build_workspace_runtime_snapshot_v2(
  p_restaurant_id uuid,
  p_role text,
  p_profile_id uuid,
  p_employee_id uuid,
  p_from_date date default null,
  p_to_date date default null
)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'restaurant', to_jsonb(r),
    'restaurant_settings', coalesce((select to_jsonb(rs) from public.restaurant_settings rs where rs.restaurant_id = r.id), '{}'::jsonb),
    'restaurant_onboarding_state', coalesce((select to_jsonb(os) from public.restaurant_onboarding_state os where os.restaurant_id = r.id), '{}'::jsonb),
    'profiles', '[]'::jsonb,
    'restaurant_memberships',
      case when p_role in ('owner','manager') then
        coalesce((select jsonb_agg(to_jsonb(m)) from public.restaurant_memberships m where m.restaurant_id = r.id), '[]'::jsonb)
      else '[]'::jsonb end,
    'employees',
      coalesce((select jsonb_agg(to_jsonb(e) order by e.sort_order, e.display_name)
        from public.employees e
        where e.restaurant_id = r.id and (p_role in ('owner','manager') or e.id = p_employee_id)), '[]'::jsonb),
    'employee_access',
      case when p_role in ('owner','manager') then
        coalesce((select jsonb_agg(to_jsonb(ea)) from public.employee_access ea where ea.restaurant_id = r.id), '[]'::jsonb)
      else '[]'::jsonb end,
    'employee_pin_credentials',
      case when p_role in ('owner','manager') then
        coalesce((select jsonb_agg(jsonb_build_object(
          'restaurant_id', pc.restaurant_id,
          'employee_id', pc.employee_id,
          'pin_status', pc.pin_status,
          'locked_until', pc.locked_until,
          'last_used_at', pc.last_used_at,
          'last_rotated_at', pc.last_rotated_at
        )) from public.employee_pin_credentials pc where pc.restaurant_id = r.id), '[]'::jsonb)
      else '[]'::jsonb end,
    'employee_contact_details',
      coalesce((select jsonb_agg(to_jsonb(c))
        from public.employee_contact_details c
        where c.restaurant_id = r.id and (p_role in ('owner','manager') or c.employee_id = p_employee_id)), '[]'::jsonb),
    'employee_contracts',
      coalesce((select jsonb_agg(to_jsonb(c))
        from public.employee_contracts c
        where c.restaurant_id = r.id and (p_role in ('owner','manager') or c.employee_id = p_employee_id)), '[]'::jsonb),
    'employee_legal_profiles',
      case when p_role = 'owner' then coalesce((select jsonb_agg(to_jsonb(l)) from public.employee_legal_profiles l where l.restaurant_id = r.id), '[]'::jsonb) else '[]'::jsonb end,
    'employee_payroll_profiles',
      case when p_role = 'owner' then coalesce((select jsonb_agg(to_jsonb(p)) from public.employee_payroll_profiles p where p.restaurant_id = r.id), '[]'::jsonb) else '[]'::jsonb end,
    'job_functions', coalesce((select jsonb_agg(to_jsonb(j) order by j.sort_order, j.name) from public.job_functions j where j.restaurant_id = r.id), '[]'::jsonb),
    'employee_job_functions', coalesce((select jsonb_agg(to_jsonb(ej)) from public.employee_job_functions ej where ej.restaurant_id = r.id and (p_role in ('owner','manager') or ej.employee_id = p_employee_id)), '[]'::jsonb),
    'recurring_work_patterns', coalesce((select jsonb_agg(to_jsonb(rp)) from public.recurring_work_patterns rp where rp.restaurant_id = r.id and (p_role in ('owner','manager') or rp.employee_id = p_employee_id)), '[]'::jsonb),
    'contract_types', coalesce((select jsonb_agg(to_jsonb(ct) order by ct.sort_order) from public.contract_types ct where ct.restaurant_id = r.id and ct.active), '[]'::jsonb),
    'work_areas', coalesce((select jsonb_agg(to_jsonb(a) order by a.sort_order, a.name) from public.work_areas a where a.restaurant_id = r.id), '[]'::jsonb),
    'services', coalesce((select jsonb_agg(to_jsonb(s) order by s.sort_order) from public.services s where s.restaurant_id = r.id), '[]'::jsonb),
    'area_service_defaults', coalesce((select jsonb_agg(to_jsonb(ad)) from public.area_service_defaults ad where ad.restaurant_id = r.id), '[]'::jsonb),
    'coverage_requirements', coalesce((select jsonb_agg(to_jsonb(cr)) from public.coverage_requirements cr where cr.restaurant_id = r.id), '[]'::jsonb),
    'opening_hours', coalesce((select jsonb_agg(to_jsonb(oh)) from public.opening_hours oh where oh.restaurant_id = r.id), '[]'::jsonb),
    'absence_types', coalesce((select jsonb_agg(to_jsonb(at) order by at.sort_order) from public.absence_types at where at.restaurant_id = r.id and at.active), '[]'::jsonb),
    'work_weeks', coalesce((select jsonb_agg(to_jsonb(ww)) from public.work_weeks ww where ww.restaurant_id = r.id and (p_from_date is null or ww.week_start >= public.week_start_for_date(p_from_date)) and (p_to_date is null or ww.week_start <= public.week_start_for_date(p_to_date))), '[]'::jsonb),
    'work_week_events', case when p_role in ('owner','manager') then coalesce((select jsonb_agg(to_jsonb(we)) from public.work_week_events we where we.restaurant_id = r.id), '[]'::jsonb) else '[]'::jsonb end,
    'planned_shifts', coalesce((select jsonb_agg(to_jsonb(ps)) from public.planned_shifts ps join public.work_weeks ww on ww.restaurant_id = ps.restaurant_id and ww.week_start = ps.week_start where ps.restaurant_id = r.id and (p_role in ('owner','manager') or (ps.employee_id = p_employee_id and ww.planning_status = 'published')) and (p_from_date is null or ps.week_start + (ps.weekday - 1) >= p_from_date) and (p_to_date is null or ps.week_start + (ps.weekday - 1) <= p_to_date)), '[]'::jsonb),
    'employee_availability_slots', coalesce((select jsonb_agg(to_jsonb(av)) from public.employee_availability_slots av where av.restaurant_id = r.id and (p_role in ('owner','manager') or av.employee_id = p_employee_id)), '[]'::jsonb),
    'employee_availability_submissions', coalesce((select jsonb_agg(to_jsonb(sub)) from public.employee_availability_submissions sub where sub.restaurant_id = r.id and (p_role in ('owner','manager') or sub.employee_id = p_employee_id)), '[]'::jsonb),
    'weekly_notes', coalesce((select jsonb_agg(to_jsonb(n)) from public.weekly_notes n join public.work_weeks ww on ww.restaurant_id = n.restaurant_id and ww.week_start = n.week_start where n.restaurant_id = r.id and (p_role in ('owner','manager') or ww.planning_status = 'published')), '[]'::jsonb),
    'time_entries', coalesce((select jsonb_agg(to_jsonb(t)) from public.time_entries t where t.restaurant_id = r.id and (p_role in ('owner','manager') or t.employee_id = p_employee_id) and (p_from_date is null or t.business_date >= p_from_date) and (p_to_date is null or t.business_date <= p_to_date)), '[]'::jsonb),
    'time_entry_adjustments', case when p_role in ('owner','manager') then coalesce((select jsonb_agg(to_jsonb(ta)) from public.time_entry_adjustments ta where ta.restaurant_id = r.id), '[]'::jsonb) else '[]'::jsonb end,
    'absences', coalesce((select jsonb_agg(to_jsonb(a)) from public.absences a where a.restaurant_id = r.id and (p_role in ('owner','manager') or a.employee_id = p_employee_id)), '[]'::jsonb),
    'absence_events', case when p_role in ('owner','manager') then coalesce((select jsonb_agg(to_jsonb(ae)) from public.absence_events ae where ae.restaurant_id = r.id), '[]'::jsonb) else '[]'::jsonb end
  )
  from public.restaurants r
  where r.id = p_restaurant_id
$$;

create or replace function public.build_workspace_runtime_snapshot(
  p_restaurant_id uuid,
  p_from_date date default null,
  p_to_date date default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_profile_id uuid := public.current_profile_id();
  v_role text;
  v_employee_id uuid;
begin
  select m.role, ea.employee_id
  into v_role, v_employee_id
  from public.restaurant_memberships m
  left join public.employee_access ea
    on ea.restaurant_id = m.restaurant_id and ea.profile_id = m.profile_id
  where m.restaurant_id = p_restaurant_id
    and m.profile_id = v_profile_id
    and m.status = 'active'
  limit 1;
  if v_role is null then raise exception 'Active membership required.'; end if;
  return public.build_workspace_runtime_snapshot_v2(
    p_restaurant_id, v_role, v_profile_id, v_employee_id, p_from_date, p_to_date
  );
end;
$$;

create or replace function public.build_workspace_runtime_snapshot_for_role(
  p_restaurant_id uuid,
  p_actor_role text default 'employee',
  p_profile_id uuid default null,
  p_employee_id uuid default null,
  p_from_date date default null,
  p_to_date date default null
)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select public.build_workspace_runtime_snapshot_v2(
    p_restaurant_id, p_actor_role, p_profile_id, p_employee_id, p_from_date, p_to_date
  )
$$;

create or replace function public.get_workspace_runtime_snapshot(
  p_restaurant_id uuid default null,
  p_from_date date default null,
  p_to_date date default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_profile_id uuid := public.current_profile_id();
  v_restaurant_id uuid;
  v_role text;
  v_employee_id uuid;
begin
  if v_profile_id is null then raise exception 'Authenticated session required.'; end if;
  select m.restaurant_id, m.role, ea.employee_id
  into v_restaurant_id, v_role, v_employee_id
  from public.restaurant_memberships m
  left join public.employee_access ea
    on ea.restaurant_id = m.restaurant_id and ea.profile_id = m.profile_id
  join public.restaurants r on r.id = m.restaurant_id and r.active
  where m.profile_id = v_profile_id
    and m.status = 'active'
    and (p_restaurant_id is null or m.restaurant_id = p_restaurant_id)
  order by r.name
  limit 1;
  if v_restaurant_id is null then raise exception 'No active restaurant membership.'; end if;
  return public.build_workspace_runtime_snapshot_v2(
    v_restaurant_id, v_role, v_profile_id, v_employee_id, p_from_date, p_to_date
  );
end;
$$;

create or replace function public.workspace_runtime_snapshot_for_current_context(
  p_restaurant_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_profile_id uuid := public.current_profile_id();
  v_role text;
  v_employee_id uuid;
begin
  select m.role, ea.employee_id into v_role, v_employee_id
  from public.restaurant_memberships m
  left join public.employee_access ea
    on ea.restaurant_id = m.restaurant_id and ea.profile_id = m.profile_id
  where m.restaurant_id = p_restaurant_id
    and m.profile_id = v_profile_id
    and m.status = 'active'
  limit 1;
  if v_role is null then raise exception 'Active membership required.'; end if;
  return public.build_workspace_runtime_snapshot_v2(
    p_restaurant_id, v_role, v_profile_id, v_employee_id, null, null
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Clean restaurant save boundary
-- ---------------------------------------------------------------------------
create or replace function public.save_restaurant_model(
  p_restaurant_id uuid,
  p_restaurant jsonb default '{}'::jsonb,
  p_settings jsonb default '{}'::jsonb,
  p_job_functions jsonb default '[]'::jsonb,
  p_areas jsonb default '[]'::jsonb,
  p_opening_hours jsonb default '[]'::jsonb,
  p_area_service_defaults jsonb default '[]'::jsonb,
  p_coverage_requirements jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_item jsonb;
  v_id uuid;
  v_name text;
begin
  perform 1 from public.require_owner_context(p_restaurant_id);

  update public.restaurants set
    name = nullif(btrim(coalesce(p_restaurant->>'legal_name', p_restaurant->>'name', name)), ''),
    legal_name = nullif(btrim(coalesce(p_restaurant->>'legal_name', legal_name)), ''),
    company_number = nullif(btrim(p_restaurant->>'company_number'), ''),
    email = nullif(btrim(p_restaurant->>'email'), '')::citext,
    phone = nullif(btrim(p_restaurant->>'phone'), ''),
    address_line1 = nullif(btrim(p_restaurant->>'address_line1'), ''),
    postal_code = nullif(btrim(p_restaurant->>'postal_code'), ''),
    city = nullif(btrim(p_restaurant->>'city'), ''),
    country_code = 'BE',
    updated_at = now()
  where id = p_restaurant_id;

  insert into public.restaurant_settings (
    restaurant_id, timezone, locale, currency_code, active_week_start,
    week_start_weekday, settings, payroll_settings
  )
  values (
    p_restaurant_id, 'Europe/Brussels', 'fr-BE', 'EUR',
    nullif(p_settings->>'active_week_start', '')::date,
    1, coalesce(p_settings->'settings', '{}'::jsonb),
    coalesce(p_settings->'payroll_settings', '{}'::jsonb)
  )
  on conflict (restaurant_id) do update set
    timezone = 'Europe/Brussels', locale = 'fr-BE', currency_code = 'EUR',
    active_week_start = excluded.active_week_start,
    week_start_weekday = 1,
    settings = excluded.settings,
    payroll_settings = excluded.payroll_settings,
    updated_at = now();

  for v_item in select value from jsonb_array_elements(coalesce(p_job_functions, '[]')) loop
    v_id := (v_item->>'id')::uuid;
    v_name := nullif(btrim(v_item->>'name'), '');
    if v_id is null or v_name is null then raise exception 'Every position requires id and name.'; end if;
    insert into public.job_functions (
      id, restaurant_id, code, name, estimated_hourly_cost, active, sort_order, metadata
    )
    values (
      v_id, p_restaurant_id,
      coalesce(nullif(btrim(v_item->>'code'), ''), public.slugify_workspace(v_name)),
      v_name,
      greatest(0, coalesce(nullif(v_item->>'estimated_hourly_cost', '')::numeric, 0)),
      coalesce((v_item->>'active')::boolean, true),
      coalesce(nullif(v_item->>'sort_order', '')::integer, 0),
      coalesce(v_item->'metadata', '{}')
    )
    on conflict (restaurant_id, id) do update set
      code = excluded.code, name = excluded.name,
      estimated_hourly_cost = excluded.estimated_hourly_cost,
      active = excluded.active, sort_order = excluded.sort_order,
      metadata = excluded.metadata, updated_at = now();
  end loop;
  update public.job_functions set active = false, updated_at = now()
  where restaurant_id = p_restaurant_id
    and id not in (
      select (value->>'id')::uuid
      from jsonb_array_elements(coalesce(p_job_functions, '[]'))
    );

  for v_item in select value from jsonb_array_elements(coalesce(p_areas, '[]')) loop
    v_id := (v_item->>'id')::uuid;
    v_name := nullif(btrim(v_item->>'name'), '');
    if v_id is null or v_name is null then raise exception 'Every area requires id and name.'; end if;
    insert into public.work_areas (
      id, restaurant_id, code, name, notes, active, sort_order
    )
    values (
      v_id, p_restaurant_id,
      coalesce(nullif(btrim(v_item->>'code'), ''), public.slugify_workspace(v_name)),
      v_name,
      nullif(btrim(v_item->>'notes'), ''),
      coalesce((v_item->>'active')::boolean, true),
      coalesce(nullif(v_item->>'sort_order', '')::integer, 0)
    )
    on conflict (restaurant_id, id) do update set
      code = excluded.code, name = excluded.name, notes = excluded.notes,
      active = excluded.active, sort_order = excluded.sort_order, updated_at = now();
  end loop;
  update public.work_areas set active = false, updated_at = now()
  where restaurant_id = p_restaurant_id
    and id not in (
      select (value->>'id')::uuid
      from jsonb_array_elements(coalesce(p_areas, '[]'))
    );

  delete from public.opening_hours where restaurant_id = p_restaurant_id;
  insert into public.opening_hours (
    restaurant_id, weekday, service_key, is_open, opens_at, closes_at
  )
  select
    p_restaurant_id,
    (value->>'weekday')::smallint,
    value->>'service_key',
    coalesce((value->>'is_open')::boolean, false),
    nullif(value->>'opens_at', '')::time,
    nullif(value->>'closes_at', '')::time
  from jsonb_array_elements(coalesce(p_opening_hours, '[]'));

  delete from public.area_service_defaults where restaurant_id = p_restaurant_id;
  insert into public.area_service_defaults (
    restaurant_id, area_id, service_key, start_time, end_time
  )
  select
    p_restaurant_id,
    (value->>'area_id')::uuid,
    value->>'service_key',
    nullif(value->>'start_time', '')::time,
    nullif(value->>'end_time', '')::time
  from jsonb_array_elements(coalesce(p_area_service_defaults, '[]'));

  delete from public.coverage_requirements where restaurant_id = p_restaurant_id;
  insert into public.coverage_requirements (
    restaurant_id, area_id, job_function_id, service_key,
    coverage_scope, weekday, required_count, active, sort_order
  )
  select
    p_restaurant_id,
    (value->>'area_id')::uuid,
    (value->>'job_function_id')::uuid,
    value->>'service_key',
    coalesce(nullif(value->>'coverage_scope', ''), 'default'),
    nullif(value->>'weekday', '')::smallint,
    greatest(0, coalesce(nullif(value->>'required_count', '')::integer, 0)),
    coalesce((value->>'active')::boolean, true),
    coalesce(nullif(value->>'sort_order', '')::integer, 0)
  from jsonb_array_elements(coalesce(p_coverage_requirements, '[]'));

  return jsonb_build_object(
    'runtime_snapshot',
    public.workspace_runtime_snapshot_for_current_context(p_restaurant_id)
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Clean team save boundary with contract history
-- ---------------------------------------------------------------------------
create or replace function public.save_team_model(
  p_restaurant_id uuid,
  p_employees jsonb default '[]'::jsonb,
  p_employee_job_functions jsonb default '[]'::jsonb,
  p_recurring_work_patterns jsonb default '[]'::jsonb,
  p_contacts jsonb default '[]'::jsonb,
  p_legal_profiles jsonb default '[]'::jsonb,
  p_contracts jsonb default '[]'::jsonb,
  p_payroll_profiles jsonb default '[]'::jsonb,
  p_access jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor record;
  v_item jsonb;
  v_employee_id uuid;
  v_contract_id uuid;
  v_existing public.employee_contracts%rowtype;
  v_owner boolean;
begin
  select * into v_actor from public.require_owner_or_manager_context(p_restaurant_id) limit 1;
  v_owner := public.is_owner(p_restaurant_id);

  for v_item in select value from jsonb_array_elements(coalesce(p_employees, '[]')) loop
    v_employee_id := (v_item->>'id')::uuid;
    insert into public.employees (
      id, restaurant_id, display_name, first_name, last_name, active, sort_order
    )
    values (
      v_employee_id, p_restaurant_id, btrim(v_item->>'display_name'),
      nullif(btrim(v_item->>'first_name'), ''), nullif(btrim(v_item->>'last_name'), ''),
      coalesce((v_item->>'active')::boolean, true),
      coalesce(nullif(v_item->>'sort_order', '')::integer, 0)
    )
    on conflict (restaurant_id, id) do update set
      display_name = excluded.display_name, first_name = excluded.first_name,
      last_name = excluded.last_name, active = excluded.active,
      sort_order = excluded.sort_order, updated_at = now();
  end loop;

  delete from public.employee_job_functions where restaurant_id = p_restaurant_id;
  insert into public.employee_job_functions (
    restaurant_id, employee_id, job_function_id, is_primary, active
  )
  select
    p_restaurant_id, (value->>'employee_id')::uuid,
    (value->>'job_function_id')::uuid,
    coalesce((value->>'is_primary')::boolean, false),
    coalesce((value->>'active')::boolean, true)
  from jsonb_array_elements(coalesce(p_employee_job_functions, '[]'));

  delete from public.recurring_work_patterns where restaurant_id = p_restaurant_id;
  insert into public.recurring_work_patterns (
    restaurant_id, employee_id, weekday, service_key,
    availability_state, starts_at, ends_at, active
  )
  select
    p_restaurant_id, (value->>'employee_id')::uuid,
    (value->>'weekday')::smallint, value->>'service_key',
    coalesce(nullif(value->>'availability_state', ''), 'available'),
    nullif(value->>'starts_at', '')::time,
    nullif(value->>'ends_at', '')::time,
    coalesce((value->>'active')::boolean, true)
  from jsonb_array_elements(coalesce(p_recurring_work_patterns, '[]'));

  for v_item in select value from jsonb_array_elements(coalesce(p_contacts, '[]')) loop
    v_employee_id := (v_item->>'employee_id')::uuid;
    insert into public.employee_contact_details (
      restaurant_id, employee_id, email, phone, mobile_phone, address_line1,
      postal_code, city, emergency_name, emergency_relation, emergency_phone, notes
    )
    values (
      p_restaurant_id, v_employee_id,
      nullif(btrim(v_item->>'email'), '')::citext,
      nullif(btrim(v_item->>'phone'), ''), nullif(btrim(v_item->>'mobile_phone'), ''),
      nullif(btrim(v_item->>'address_line1'), ''), nullif(btrim(v_item->>'postal_code'), ''),
      nullif(btrim(v_item->>'city'), ''), nullif(btrim(v_item->>'emergency_name'), ''),
      nullif(btrim(v_item->>'emergency_relation'), ''), nullif(btrim(v_item->>'emergency_phone'), ''),
      nullif(btrim(v_item->>'notes'), '')
    )
    on conflict (restaurant_id, employee_id) do update set
      email = excluded.email, phone = excluded.phone, mobile_phone = excluded.mobile_phone,
      address_line1 = excluded.address_line1, postal_code = excluded.postal_code,
      city = excluded.city, emergency_name = excluded.emergency_name,
      emergency_relation = excluded.emergency_relation,
      emergency_phone = excluded.emergency_phone, notes = excluded.notes,
      updated_at = now();
  end loop;

  for v_item in select value from jsonb_array_elements(coalesce(p_access, '[]')) loop
    v_employee_id := (v_item->>'employee_id')::uuid;
    insert into public.employee_access (
      restaurant_id, employee_id, access_status, badge_enabled
    )
    values (
      p_restaurant_id, v_employee_id, 'not_invited',
      coalesce((v_item->>'badge_enabled')::boolean, false)
    )
    on conflict (restaurant_id, employee_id) do update set
      badge_enabled = excluded.badge_enabled,
      updated_at = now();
  end loop;

  if v_owner then
    for v_item in select value from jsonb_array_elements(coalesce(p_legal_profiles, '[]')) loop
      v_employee_id := (v_item->>'employee_id')::uuid;
      insert into public.employee_legal_profiles (
        restaurant_id, employee_id, birth_date, national_registry_number,
        sex, nationality, language
      )
      values (
        p_restaurant_id, v_employee_id,
        nullif(v_item->>'birth_date', '')::date,
        nullif(btrim(v_item->>'national_registry_number'), ''),
        nullif(btrim(v_item->>'sex'), ''), nullif(btrim(v_item->>'nationality'), ''),
        nullif(btrim(v_item->>'language'), '')
      )
      on conflict (restaurant_id, employee_id) do update set
        birth_date = excluded.birth_date,
        national_registry_number = excluded.national_registry_number,
        sex = excluded.sex, nationality = excluded.nationality,
        language = excluded.language, updated_at = now();
    end loop;

    for v_item in select value from jsonb_array_elements(coalesce(p_contracts, '[]')) loop
      v_employee_id := (v_item->>'employee_id')::uuid;
      v_contract_id := nullif(v_item->>'contract_id', '')::uuid;
      select * into v_existing from public.employee_contracts
      where restaurant_id = p_restaurant_id and id = v_contract_id;

      if v_existing.id is not null and (
        v_existing.contract_type_id is distinct from nullif(v_item->>'contract_type_id', '')::uuid or
        v_existing.work_regime is distinct from (v_item->>'work_regime')::public.work_regime or
        v_existing.contract_start is distinct from nullif(v_item->>'contract_start', '')::date or
        v_existing.contract_end is distinct from nullif(v_item->>'contract_end', '')::date or
        v_existing.weekly_contract_hours is distinct from greatest(0, coalesce(nullif(v_item->>'weekly_contract_hours', '')::numeric, 0)) or
        v_existing.contract_days is distinct from greatest(0, coalesce(nullif(v_item->>'contract_days', '')::numeric, 0))
      ) then
        update public.employee_contracts
        set is_current = false, active = false, updated_at = now()
        where id = v_existing.id;
        v_contract_id := null;
      end if;

      insert into public.employee_contracts (
        id, restaurant_id, employee_id, contract_type_id, work_regime,
        contract_start, contract_end, weekly_contract_hours, contract_days,
        annual_leave_entitlement_days, is_current, active
      )
      values (
        coalesce(v_contract_id, gen_random_uuid()), p_restaurant_id, v_employee_id,
        nullif(v_item->>'contract_type_id', '')::uuid,
        (v_item->>'work_regime')::public.work_regime,
        nullif(v_item->>'contract_start', '')::date,
        nullif(v_item->>'contract_end', '')::date,
        greatest(0, coalesce(nullif(v_item->>'weekly_contract_hours', '')::numeric, 0)),
        greatest(0, coalesce(nullif(v_item->>'contract_days', '')::numeric, 0)),
        greatest(0, coalesce(nullif(v_item->>'annual_leave_entitlement_days', '')::numeric, 0)),
        true, true
      )
      on conflict (id) do update set
        contract_type_id = excluded.contract_type_id,
        work_regime = excluded.work_regime,
        contract_start = excluded.contract_start,
        contract_end = excluded.contract_end,
        weekly_contract_hours = excluded.weekly_contract_hours,
        contract_days = excluded.contract_days,
        annual_leave_entitlement_days = excluded.annual_leave_entitlement_days,
        is_current = true, active = true, updated_at = now();
    end loop;

    for v_item in select value from jsonb_array_elements(coalesce(p_payroll_profiles, '[]')) loop
      v_employee_id := (v_item->>'employee_id')::uuid;
      insert into public.employee_payroll_profiles (
        restaurant_id, employee_id, external_employee_id, payroll_employee_id,
        iban, bic, hourly_wage_rate, estimated_hourly_cost,
        company_cost_formula, payroll_notes
      )
      values (
        p_restaurant_id, v_employee_id,
        nullif(btrim(v_item->>'external_employee_id'), ''),
        nullif(btrim(v_item->>'payroll_employee_id'), ''),
        nullif(btrim(v_item->>'iban'), ''), nullif(btrim(v_item->>'bic'), ''),
        greatest(0, coalesce(nullif(v_item->>'hourly_wage_rate', '')::numeric, 0)),
        greatest(0, coalesce(nullif(v_item->>'estimated_hourly_cost', '')::numeric, 0)),
        nullif(btrim(v_item->>'company_cost_formula'), ''),
        nullif(btrim(v_item->>'payroll_notes'), '')
      )
      on conflict (restaurant_id, employee_id) do update set
        external_employee_id = excluded.external_employee_id,
        payroll_employee_id = excluded.payroll_employee_id,
        iban = excluded.iban, bic = excluded.bic,
        hourly_wage_rate = excluded.hourly_wage_rate,
        estimated_hourly_cost = excluded.estimated_hourly_cost,
        company_cost_formula = excluded.company_cost_formula,
        payroll_notes = excluded.payroll_notes,
        updated_at = now();
    end loop;
  end if;

  return jsonb_build_object(
    'runtime_snapshot',
    public.workspace_runtime_snapshot_for_current_context(p_restaurant_id)
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Planning v2 uses area_id
-- ---------------------------------------------------------------------------
create or replace function public.save_manager_planning_v2(
  p_restaurant_id uuid,
  p_week_start date,
  p_planning_status text default 'draft',
  p_planned_shifts jsonb default '[]'::jsonb,
  p_weekly_notes jsonb default '[]'::jsonb,
  p_work_week_updated_at timestamptz default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor record;
  v_current public.work_weeks%rowtype;
  v_item jsonb;
  v_status text := lower(btrim(coalesce(p_planning_status, 'draft')));
begin
  select * into v_actor from public.require_owner_or_manager_context(p_restaurant_id) limit 1;
  if extract(isodow from p_week_start) <> 1 then raise exception 'Planning week must start on Monday.'; end if;
  if p_week_start < public.week_start_for_date(current_date) then raise exception 'Past planning weeks are locked.'; end if;
  if v_status not in ('draft','published') then raise exception 'Invalid planning status.'; end if;

  select * into v_current from public.work_weeks
  where restaurant_id = p_restaurant_id and week_start = p_week_start;
  if v_current.actuals_status in ('approved','locked') then
    raise exception 'Planning is locked because actuals are %.', v_current.actuals_status;
  end if;
  if p_work_week_updated_at is not null and v_current.updated_at is not null
     and date_trunc('milliseconds', v_current.updated_at)
       <> date_trunc('milliseconds', p_work_week_updated_at) then
    raise exception 'CONFLICT: The planning week was modified by another session. Reload to get the latest version.';
  end if;

  insert into public.work_weeks (
    restaurant_id, week_start, planning_status, published_at, published_by_profile_id
  )
  values (
    p_restaurant_id, p_week_start, v_status,
    case when v_status = 'published' then now() end,
    case when v_status = 'published' then v_actor.profile_id end
  )
  on conflict (restaurant_id, week_start) do update set
    planning_status = excluded.planning_status,
    published_at = excluded.published_at,
    published_by_profile_id = excluded.published_by_profile_id,
    updated_at = now();

  if coalesce(v_current.planning_status, 'draft') <> v_status then
    insert into public.work_week_events (
      restaurant_id, week_start, event_type, actor_profile_id,
      actor_employee_id, actor_role, reason
    )
    values (
      p_restaurant_id, p_week_start,
      case when v_status = 'published' then 'planning_published' else 'planning_reverted' end,
      v_actor.profile_id, v_actor.employee_id, v_actor.role,
      case when v_status = 'published' then 'Weekly planning published' else 'Weekly planning reverted to draft' end
    );
  end if;

  delete from public.planned_shifts
  where restaurant_id = p_restaurant_id and week_start = p_week_start;
  insert into public.planned_shifts (
    restaurant_id, week_start, employee_id, weekday, service_key,
    area_id, job_function_id, starts_at, ends_at, source
  )
  select
    p_restaurant_id, p_week_start,
    (value->>'employee_id')::uuid,
    (value->>'weekday')::smallint,
    value->>'service_key',
    nullif(value->>'area_id', '')::uuid,
    nullif(value->>'job_function_id', '')::uuid,
    nullif(value->>'starts_at', '')::time,
    nullif(value->>'ends_at', '')::time,
    coalesce(nullif(value->>'source', ''), 'manual')
  from jsonb_array_elements(coalesce(p_planned_shifts, '[]'));

  delete from public.weekly_notes
  where restaurant_id = p_restaurant_id and week_start = p_week_start;
  insert into public.weekly_notes (
    restaurant_id, week_start, weekday, service_key, note
  )
  select
    p_restaurant_id, p_week_start, (value->>'weekday')::smallint,
    value->>'service_key', btrim(value->>'note')
  from jsonb_array_elements(coalesce(p_weekly_notes, '[]'))
  where nullif(btrim(value->>'note'), '') is not null;

  return jsonb_build_object(
    'runtime_snapshot',
    public.workspace_runtime_snapshot_for_current_context(p_restaurant_id)
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Owner onboarding v2
-- ---------------------------------------------------------------------------
create or replace function public.setup_owner_workspace_v2(
  p_owner_first_name text,
  p_owner_last_name text,
  p_owner_email citext,
  p_restaurant_name text,
  p_city text default '',
  p_employees jsonb default '[]'::jsonb,
  p_opening_hours jsonb default '[]'::jsonb,
  p_areas jsonb default '[]'::jsonb,
  p_job_functions jsonb default '[]'::jsonb,
  p_coverage jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_auth_user uuid := auth.uid();
  v_profile_id uuid;
  v_restaurant_id uuid;
  v_item jsonb;
  v_employee_id uuid;
  v_owner_employee_id uuid;
  v_area_id uuid;
  v_job_id uuid;
begin
  if v_auth_user is null then raise exception 'Authentication required.'; end if;
  if lower(coalesce(auth.jwt()->>'email', '')) <> lower(p_owner_email::text) then
    raise exception 'Owner email must match the authenticated account.';
  end if;

  insert into public.profiles (auth_user_id, first_name, last_name, email)
  values (v_auth_user, btrim(p_owner_first_name), btrim(p_owner_last_name), p_owner_email)
  on conflict (email) do update set
    auth_user_id = excluded.auth_user_id,
    first_name = excluded.first_name,
    last_name = excluded.last_name,
    updated_at = now()
  returning id into v_profile_id;

  insert into public.restaurants (
    workspace_slug, name, legal_name, city, email, country_code
  )
  values (
    public.unique_workspace_slug(p_restaurant_name),
    btrim(p_restaurant_name), btrim(p_restaurant_name),
    nullif(btrim(p_city), ''), p_owner_email, 'BE'
  )
  returning id into v_restaurant_id;

  insert into public.restaurant_settings (
    restaurant_id, timezone, locale, currency_code, week_start_weekday
  )
  values (v_restaurant_id, 'Europe/Brussels', 'fr-BE', 'EUR', 1);
  insert into public.restaurant_onboarding_state (
    restaurant_id, state, last_step, workspace_created_at
  )
  values (v_restaurant_id, 'workspace_created', 'workspace_created', now());
  insert into public.restaurant_memberships (
    restaurant_id, profile_id, role, status
  )
  values (v_restaurant_id, v_profile_id, 'owner', 'active');
  insert into public.services (restaurant_id, service_key, name, sort_order)
  values
    (v_restaurant_id, 'lunch', 'Lunch', 10),
    (v_restaurant_id, 'evening', 'Evening', 20);

  for v_item in select value from jsonb_array_elements(coalesce(p_job_functions, '[]')) loop
    insert into public.job_functions (
      restaurant_id, code, name, estimated_hourly_cost, sort_order
    )
    values (
      v_restaurant_id,
      public.slugify_workspace(v_item #>> '{}'),
      v_item #>> '{}', 0, 10
    )
    returning id into v_job_id;
  end loop;
  if not exists (select 1 from public.job_functions where restaurant_id = v_restaurant_id) then
    insert into public.job_functions (restaurant_id, code, name, sort_order)
    values (v_restaurant_id, 'staff', 'Staff', 10);
  end if;

  insert into public.contract_types (
    restaurant_id, code, name, category, sort_order, active, metadata
  )
  values
    (v_restaurant_id, 'CDI', 'CDI', 'permanent', 10, true, '{"system":true}'),
    (v_restaurant_id, 'CDD', 'CDD', 'fixed_term', 20, true, '{"system":true}'),
    (v_restaurant_id, 'FLEXI', 'Flexi', 'flexi', 30, true, '{"system":true}'),
    (v_restaurant_id, 'STUDENT', 'Student', 'student', 40, true, '{"system":true}'),
    (v_restaurant_id, 'EXTRA', 'Extra', 'extra', 50, true, '{"system":true}'),
    (v_restaurant_id, 'FREELANCE', 'Freelance', 'self_employed', 60, true, '{"system":true}');

  insert into public.absence_types (
    restaurant_id, code, name, category, paid_policy, color,
    requires_approval, affects_planning, affects_payroll, sort_order, active, metadata
  )
  values
    (v_restaurant_id, 'HOLIDAY', 'Holiday', 'holiday', 'paid', '#22c55e', true, true, true, 10, true, '{"system":true}'),
    (v_restaurant_id, 'SICK', 'Sick leave', 'sick', 'paid', '#ef4444', true, true, true, 20, true, '{"system":true}'),
    (v_restaurant_id, 'UNPAID', 'Unpaid leave', 'unpaid', 'unpaid', '#f59e0b', true, true, true, 30, true, '{"system":true}'),
    (v_restaurant_id, 'PUBLIC_HOLIDAY', 'Public holiday', 'other', 'paid', '#38bdf8', false, true, true, 40, true, '{"system":true}'),
    (v_restaurant_id, 'OTHER', 'Other', 'other', 'neutral', '#94a3b8', true, true, true, 50, true, '{"system":true}');

  insert into public.employees (
    restaurant_id, display_name, first_name, last_name, sort_order
  )
  values (
    v_restaurant_id,
    btrim(p_owner_first_name || ' ' || p_owner_last_name),
    btrim(p_owner_first_name), btrim(p_owner_last_name), 0
  )
  returning id into v_owner_employee_id;
  insert into public.employee_access (
    restaurant_id, employee_id, profile_id, access_status, badge_enabled
  )
  values (v_restaurant_id, v_owner_employee_id, v_profile_id, 'active', true);
  select id into v_job_id from public.job_functions
  where restaurant_id = v_restaurant_id order by sort_order, name limit 1;
  insert into public.employee_job_functions (
    restaurant_id, employee_id, job_function_id, is_primary
  )
  values (v_restaurant_id, v_owner_employee_id, v_job_id, true);

  for v_item in select value from jsonb_array_elements(coalesce(p_areas, '[]')) loop
    insert into public.work_areas (
      restaurant_id, code, name, sort_order
    )
    values (
      v_restaurant_id,
      public.slugify_workspace(v_item->>'name'),
      v_item->>'name', 10
    )
    returning id into v_area_id;
    insert into public.area_service_defaults (
      restaurant_id, area_id, service_key, start_time, end_time
    )
    values
      (v_restaurant_id, v_area_id, 'lunch', nullif(v_item->>'lunch_start', '')::time, nullif(v_item->>'lunch_end', '')::time),
      (v_restaurant_id, v_area_id, 'evening', nullif(v_item->>'evening_start', '')::time, nullif(v_item->>'evening_end', '')::time);
  end loop;

  insert into public.opening_hours (
    restaurant_id, weekday, service_key, is_open, opens_at, closes_at
  )
  select
    v_restaurant_id, (value->>'weekday')::smallint, value->>'service_key',
    coalesce((value->>'is_open')::boolean, false),
    nullif(value->>'opens_at', '')::time,
    nullif(value->>'closes_at', '')::time
  from jsonb_array_elements(coalesce(p_opening_hours, '[]'));

  for v_item in select value from jsonb_array_elements(coalesce(p_coverage, '[]')) loop
    select id into v_area_id from public.work_areas
    where restaurant_id = v_restaurant_id and name = v_item->>'area' limit 1;
    select id into v_job_id from public.job_functions
    where restaurant_id = v_restaurant_id and name = v_item->>'job_function' limit 1;
    if v_area_id is not null and v_job_id is not null then
      insert into public.coverage_requirements (
        restaurant_id, area_id, job_function_id, service_key,
        coverage_scope, required_count
      )
      values
        (v_restaurant_id, v_area_id, v_job_id, 'lunch', 'default', 1),
        (v_restaurant_id, v_area_id, v_job_id, 'evening', 'default', 1);
    end if;
  end loop;

  for v_item in select value from jsonb_array_elements(coalesce(p_employees, '[]')) loop
    insert into public.employees (
      restaurant_id, display_name, first_name, last_name
    )
    values (
      v_restaurant_id, btrim(v_item->>'display_name'),
      nullif(btrim(v_item->>'first_name'), ''),
      nullif(btrim(v_item->>'last_name'), '')
    )
    returning id into v_employee_id;
    insert into public.employee_contact_details (
      restaurant_id, employee_id, email, phone, mobile_phone
    )
    values (
      v_restaurant_id, v_employee_id,
      nullif(btrim(v_item->>'email'), '')::citext,
      nullif(btrim(v_item->>'phone'), ''),
      nullif(btrim(v_item->>'phone'), '')
    );
    select id into v_job_id from public.job_functions
    where restaurant_id = v_restaurant_id
      and name = coalesce(nullif(v_item->>'job_function', ''), 'Staff')
    limit 1;
    if v_job_id is null then
      select id into v_job_id from public.job_functions
      where restaurant_id = v_restaurant_id order by sort_order, name limit 1;
    end if;
    insert into public.employee_job_functions (
      restaurant_id, employee_id, job_function_id, is_primary
    )
    values (v_restaurant_id, v_employee_id, v_job_id, true);
    insert into public.employee_access (
      restaurant_id, employee_id, access_status, badge_enabled
    )
    values (v_restaurant_id, v_employee_id, 'not_invited', false);
  end loop;

  return jsonb_build_object(
    'ok', true,
    'restaurant_id', v_restaurant_id,
    'profile_id', v_profile_id,
    'role', 'owner'
  );
end;
$$;

-- Old model RPCs must not remain callable.
revoke all on function public.save_restaurant_setup(uuid,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb) from public, anon, authenticated;
revoke all on function public.save_team_setup(uuid,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb) from public, anon, authenticated;
revoke all on function public.save_manager_planning(uuid,date,text,jsonb,jsonb,jsonb,timestamptz) from public, anon, authenticated;
revoke all on function public.setup_owner_workspace(text,text,citext,text,text,jsonb,text,text,jsonb,jsonb,jsonb,jsonb) from public, anon, authenticated;

revoke all on function public.build_workspace_runtime_snapshot_v2(uuid,text,uuid,uuid,date,date) from public, anon, authenticated;
revoke all on function public.build_workspace_runtime_snapshot(uuid,date,date) from public, anon, authenticated;
revoke all on function public.build_workspace_runtime_snapshot_for_role(uuid,text,uuid,uuid,date,date) from public, anon, authenticated;
revoke all on function public.workspace_runtime_snapshot_for_current_context(uuid) from public, anon, authenticated;
revoke all on function public.save_restaurant_model(uuid,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb) from public, anon, authenticated;
revoke all on function public.save_team_model(uuid,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb) from public, anon, authenticated;
revoke all on function public.save_manager_planning_v2(uuid,date,text,jsonb,jsonb,timestamptz) from public, anon, authenticated;
revoke all on function public.setup_owner_workspace_v2(text,text,citext,text,text,jsonb,jsonb,jsonb,jsonb,jsonb) from public, anon, authenticated;
grant execute on function public.get_workspace_runtime_snapshot(uuid,date,date) to authenticated;
grant execute on function public.save_restaurant_model(uuid,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb) to authenticated;
grant execute on function public.save_team_model(uuid,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb) to authenticated;
grant execute on function public.save_manager_planning_v2(uuid,date,text,jsonb,jsonb,timestamptz) to authenticated;
grant execute on function public.setup_owner_workspace_v2(text,text,citext,text,text,jsonb,jsonb,jsonb,jsonb,jsonb) to authenticated;
grant all on public.work_areas, public.area_service_defaults,
  public.employee_job_functions, public.recurring_work_patterns to service_role;

commit;
