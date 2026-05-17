-- restogogo Supabase relational schema v1
-- Run this once in the Supabase SQL Editor before deploying the v428.4 app build.
-- This is a pilot-friendly schema: core business data is relational; flexible
-- rules/preferences remain JSONB. Policies are open for the anon key during the
-- prototype and must be tightened before a real multi-tenant launch.

begin;

create table if not exists public.restogogo_restaurants (
  id text primary key,
  name text not null,
  owner_name text default '',
  city text default '',
  legal_name text default '',
  company_number text default '',
  address text default '',
  phone text default '',
  email text default '',
  workspace_initialized boolean not null default false,
  active_week_start date,
  settings jsonb not null default '{}'::jsonb,
  payroll_rules jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.restogogo_restaurants alter column workspace_initialized set default false;

create table if not exists public.restogogo_positions (
  restaurant_id text not null references public.restogogo_restaurants(id) on delete cascade,
  id text not null,
  name text not null,
  active boolean not null default true,
  hourly_cost numeric(10,2) not null default 0,
  sort_order integer not null default 0,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (restaurant_id, id),
  unique (restaurant_id, name)
);

create table if not exists public.restogogo_zones (
  restaurant_id text not null references public.restogogo_restaurants(id) on delete cascade,
  id text not null,
  name text not null,
  active boolean not null default true,
  default_times jsonb not null default '{"Lunch":"","Evening":""}'::jsonb,
  notes text default '',
  sort_order integer not null default 0,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (restaurant_id, id),
  unique (restaurant_id, name)
);


create table if not exists public.restogogo_zone_coverage_requirements (
  restaurant_id text not null,
  zone_id text not null,
  service_key text not null check (service_key in ('Lunch','Evening')),
  position_id text not null,
  required_count integer not null default 0 check (required_count >= 0),
  sort_order integer not null default 0,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (restaurant_id, zone_id, service_key, position_id),
  foreign key (restaurant_id, zone_id) references public.restogogo_zones(restaurant_id, id) on update cascade on delete cascade,
  foreign key (restaurant_id, position_id) references public.restogogo_positions(restaurant_id, id) on update cascade on delete restrict
);

create table if not exists public.restogogo_opening_hours (
  restaurant_id text not null references public.restogogo_restaurants(id) on delete cascade,
  day_name text not null check (day_name in ('Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday')),
  is_open boolean not null default false,
  lunch_range text not null default '',
  evening_range text not null default '',
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (restaurant_id, day_name)
);

create table if not exists public.restogogo_employees (
  restaurant_id text not null references public.restogogo_restaurants(id) on delete cascade,
  id text not null,
  name text not null,
  first_name text default '',
  last_name text default '',
  active boolean not null default true,
  manager_access boolean not null default false,
  pin_code text default '',
  payroll_id text default '',
  employee_number text default '',
  email text default '',
  phone text default '',
  address text default '',
  postal_code text default '',
  city text default '',
  nationality text default '',
  contract_type text default '',
  contract_start date,
  contract_end date,
  work_regime text default '',
  annual_leave_entitlement_days numeric(6,2) not null default 0,
  position_id text,
  social_security_no text default '',
  iban text default '',
  bic text default '',
  payroll_provider text default '',
  payroll_notes text default '',
  emergency_name text default '',
  emergency_relation text default '',
  emergency_phone text default '',
  notes text default '',
  contract_hours numeric(10,2) not null default 0,
  hourly_cost numeric(10,2) not null default 0,
  payroll_ready boolean not null default false,
  sort_order integer not null default 0,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (restaurant_id, id)
);


create table if not exists public.restogogo_absence_types (
  restaurant_id text not null references public.restogogo_restaurants(id) on delete cascade,
  id text not null,
  name text not null,
  code text not null default '',
  category text not null default 'other',
  paid_policy text not null default 'neutral' check (paid_policy in ('paid','unpaid','neutral')),
  requires_approval boolean not null default true,
  affects_planning boolean not null default true,
  affects_payroll boolean not null default true,
  payroll_code text not null default '',
  color text not null default '#94a3b8',
  active boolean not null default true,
  sort_order integer not null default 0,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (restaurant_id, id),
  unique (restaurant_id, name)
);

create table if not exists public.restogogo_employee_absences (
  restaurant_id text not null,
  employee_id text not null,
  id text not null,
  absence_type_id text,
  start_date date not null,
  end_date date not null,
  shift_name text not null default 'Full day' check (shift_name in ('Full day','Lunch','Evening')),
  reason text not null default 'Absence',
  status text not null default 'Approved' check (status in ('Pending','Approved','Rejected','Cancelled')),
  requested_by text not null default '',
  approved_by text not null default '',
  approved_at timestamptz,
  rejected_by text not null default '',
  rejected_at timestamptz,
  cancelled_at timestamptz,
  employee_comment text not null default '',
  manager_comment text not null default '',
  duration_days numeric(10,2) not null default 0,
  duration_hours numeric(10,2) not null default 0,
  payroll_export_status text not null default 'Not exported' check (payroll_export_status in ('Not exported','Ready','Exported','Blocked')),
  payroll_export_id text not null default '',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (restaurant_id, employee_id, id),
  foreign key (restaurant_id, employee_id) references public.restogogo_employees(restaurant_id, id) on delete cascade,
  foreign key (restaurant_id, absence_type_id) references public.restogogo_absence_types(restaurant_id, id) on update cascade on delete restrict
);



create table if not exists public.restogogo_weekly_status (
  restaurant_id text not null references public.restogogo_restaurants(id) on delete cascade,
  week_start date not null,
  status text not null default 'Draft' check (status in ('Draft','Published')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (restaurant_id, week_start)
);

create table if not exists public.restogogo_availability_slots (
  restaurant_id text not null,
  week_start date not null,
  employee_id text not null,
  day_name text not null check (day_name in ('Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday')),
  shift_name text not null check (shift_name in ('Lunch','Evening')),
  availability_state text not null check (availability_state in ('available','partial')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (restaurant_id, week_start, employee_id, day_name, shift_name),
  foreign key (restaurant_id, week_start) references public.restogogo_weekly_status(restaurant_id, week_start) on delete cascade,
  foreign key (restaurant_id, employee_id) references public.restogogo_employees(restaurant_id, id) on delete cascade
);

create table if not exists public.restogogo_planned_shifts (
  restaurant_id text not null,
  week_start date not null,
  employee_id text not null,
  day_name text not null check (day_name in ('Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday')),
  shift_name text not null check (shift_name in ('Lunch','Evening')),
  planned boolean not null default true,
  zone_id text,
  position_id text,
  time_range text default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (restaurant_id, week_start, employee_id, day_name, shift_name),
  foreign key (restaurant_id, week_start) references public.restogogo_weekly_status(restaurant_id, week_start) on delete cascade,
  foreign key (restaurant_id, employee_id) references public.restogogo_employees(restaurant_id, id) on delete cascade,
  foreign key (restaurant_id, zone_id) references public.restogogo_zones(restaurant_id, id) on update cascade on delete set null,
  foreign key (restaurant_id, position_id) references public.restogogo_positions(restaurant_id, id) on update cascade on delete restrict
);

create table if not exists public.restogogo_employee_week_submissions (
  restaurant_id text not null,
  week_start date not null,
  employee_id text not null,
  submitted boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (restaurant_id, week_start, employee_id),
  foreign key (restaurant_id, week_start) references public.restogogo_weekly_status(restaurant_id, week_start) on delete cascade,
  foreign key (restaurant_id, employee_id) references public.restogogo_employees(restaurant_id, id) on delete cascade
);

create table if not exists public.restogogo_weekly_notes (
  restaurant_id text not null,
  week_start date not null,
  day_name text not null check (day_name in ('Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday')),
  shift_name text not null check (shift_name in ('Lunch','Evening')),
  note text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (restaurant_id, week_start, day_name, shift_name),
  foreign key (restaurant_id, week_start) references public.restogogo_weekly_status(restaurant_id, week_start) on delete cascade
);

create table if not exists public.restogogo_actual_shift_entries (
  restaurant_id text not null,
  week_start date not null,
  employee_id text not null,
  day_name text not null check (day_name in ('Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday')),
  shift_name text not null check (shift_name in ('Lunch','Evening')),
  clock_in text default '',
  clock_out text default '',
  clock_in_at timestamptz,
  clock_out_at timestamptz,
  clock_in_photo text default '',
  clock_out_photo text default '',
  clock_in_photo_status text default '',
  clock_out_photo_status text default '',
  clock_in_photo_captured_at timestamptz,
  clock_out_photo_captured_at timestamptz,
  source text default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (restaurant_id, week_start, employee_id, day_name, shift_name),
  foreign key (restaurant_id, week_start) references public.restogogo_weekly_status(restaurant_id, week_start) on delete cascade,
  foreign key (restaurant_id, employee_id) references public.restogogo_employees(restaurant_id, id) on delete cascade
);

create index if not exists idx_restogogo_zone_coverage on public.restogogo_zone_coverage_requirements (restaurant_id, service_key, position_id);
create index if not exists idx_restogogo_planned_shifts_position on public.restogogo_planned_shifts (restaurant_id, position_id);

create index if not exists idx_restogogo_employees_restaurant_active on public.restogogo_employees (restaurant_id, active, sort_order);
create index if not exists idx_restogogo_employees_position on public.restogogo_employees (restaurant_id, position_id);

alter table public.restogogo_employees drop constraint if exists restogogo_employees_position_fk;
alter table public.restogogo_employees
  add constraint restogogo_employees_position_fk
  foreign key (restaurant_id, position_id) references public.restogogo_positions(restaurant_id, id)
  on update cascade
  on delete restrict;
create index if not exists idx_restogogo_absence_types_restaurant_active on public.restogogo_absence_types (restaurant_id, active, sort_order);
create index if not exists idx_restogogo_absences_restaurant_dates on public.restogogo_employee_absences (restaurant_id, start_date, end_date);
create index if not exists idx_restogogo_employee_absences_type on public.restogogo_employee_absences (restaurant_id, absence_type_id, status, start_date);
create index if not exists idx_restogogo_planned_shifts_week on public.restogogo_planned_shifts (restaurant_id, week_start);
create index if not exists idx_restogogo_planned_shifts_zone on public.restogogo_planned_shifts (restaurant_id, zone_id);
create index if not exists idx_restogogo_actual_entries_week on public.restogogo_actual_shift_entries (restaurant_id, week_start);
create index if not exists idx_restogogo_availability_week on public.restogogo_availability_slots (restaurant_id, week_start);

create or replace function public.restogogo_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_restogogo_restaurants_updated_at on public.restogogo_restaurants;
create trigger trg_restogogo_restaurants_updated_at before update on public.restogogo_restaurants for each row execute function public.restogogo_set_updated_at();

drop trigger if exists trg_restogogo_positions_updated_at on public.restogogo_positions;
create trigger trg_restogogo_positions_updated_at before update on public.restogogo_positions for each row execute function public.restogogo_set_updated_at();

drop trigger if exists trg_restogogo_zones_updated_at on public.restogogo_zones;
create trigger trg_restogogo_zones_updated_at before update on public.restogogo_zones for each row execute function public.restogogo_set_updated_at();

drop trigger if exists trg_restogogo_opening_hours_updated_at on public.restogogo_opening_hours;
create trigger trg_restogogo_opening_hours_updated_at before update on public.restogogo_opening_hours for each row execute function public.restogogo_set_updated_at();

drop trigger if exists trg_restogogo_employees_updated_at on public.restogogo_employees;
create trigger trg_restogogo_employees_updated_at before update on public.restogogo_employees for each row execute function public.restogogo_set_updated_at();

drop trigger if exists trg_restogogo_absence_types_updated_at on public.restogogo_absence_types;
create trigger trg_restogogo_absence_types_updated_at before update on public.restogogo_absence_types for each row execute function public.restogogo_set_updated_at();

drop trigger if exists trg_restogogo_employee_absences_updated_at on public.restogogo_employee_absences;
create trigger trg_restogogo_employee_absences_updated_at before update on public.restogogo_employee_absences for each row execute function public.restogogo_set_updated_at();

drop trigger if exists trg_restogogo_weekly_status_updated_at on public.restogogo_weekly_status;
create trigger trg_restogogo_weekly_status_updated_at before update on public.restogogo_weekly_status for each row execute function public.restogogo_set_updated_at();

drop trigger if exists trg_restogogo_availability_slots_updated_at on public.restogogo_availability_slots;
create trigger trg_restogogo_availability_slots_updated_at before update on public.restogogo_availability_slots for each row execute function public.restogogo_set_updated_at();

drop trigger if exists trg_restogogo_planned_shifts_updated_at on public.restogogo_planned_shifts;
create trigger trg_restogogo_planned_shifts_updated_at before update on public.restogogo_planned_shifts for each row execute function public.restogogo_set_updated_at();

drop trigger if exists trg_restogogo_employee_week_submissions_updated_at on public.restogogo_employee_week_submissions;
create trigger trg_restogogo_employee_week_submissions_updated_at before update on public.restogogo_employee_week_submissions for each row execute function public.restogogo_set_updated_at();

drop trigger if exists trg_restogogo_weekly_notes_updated_at on public.restogogo_weekly_notes;
create trigger trg_restogogo_weekly_notes_updated_at before update on public.restogogo_weekly_notes for each row execute function public.restogogo_set_updated_at();

drop trigger if exists trg_restogogo_actual_shift_entries_updated_at on public.restogogo_actual_shift_entries;
create trigger trg_restogogo_actual_shift_entries_updated_at before update on public.restogogo_actual_shift_entries for each row execute function public.restogogo_set_updated_at();

alter table public.restogogo_restaurants enable row level security;
alter table public.restogogo_positions enable row level security;
alter table public.restogogo_zones enable row level security;
alter table public.restogogo_opening_hours enable row level security;
alter table public.restogogo_employees enable row level security;
alter table public.restogogo_absence_types enable row level security;
alter table public.restogogo_employee_absences enable row level security;
alter table public.restogogo_weekly_status enable row level security;
alter table public.restogogo_availability_slots enable row level security;
alter table public.restogogo_planned_shifts enable row level security;
alter table public.restogogo_employee_week_submissions enable row level security;
alter table public.restogogo_weekly_notes enable row level security;
alter table public.restogogo_actual_shift_entries enable row level security;
alter table public.restogogo_zone_coverage_requirements enable row level security;

-- Prototype policy: public anon CRUD. Tighten this before production by linking
-- restaurants to Supabase Auth users and replacing these policies with tenant RLS.
do $$
declare
  v_table_name text;
  v_policy_name text;
begin
  foreach v_table_name in array array[
    'restogogo_restaurants','restogogo_positions','restogogo_zones','restogogo_opening_hours','restogogo_employees',
    'restogogo_absence_types','restogogo_employee_absences','restogogo_weekly_status',
    'restogogo_availability_slots','restogogo_planned_shifts','restogogo_employee_week_submissions','restogogo_weekly_notes','restogogo_actual_shift_entries','restogogo_zone_coverage_requirements'
  ] loop
    v_policy_name := v_table_name || '_pilot_anon_crud';
    if not exists (
      select 1 from pg_policies where schemaname = 'public' and tablename = v_table_name and policyname = v_policy_name
    ) then
      execute format('create policy %I on public.%I for all to anon using (true) with check (true)', v_policy_name, v_table_name);
    end if;
  end loop;
end $$;

grant select, insert, update, delete on public.restogogo_zone_coverage_requirements to anon;
grant select, insert, update, delete on public.restogogo_zone_coverage_requirements to authenticated;


alter table public.restogogo_restaurants alter column owner_name set default '';
alter table public.restogogo_opening_hours alter column is_open set default false;
alter table public.restogogo_opening_hours alter column lunch_range set default '';
alter table public.restogogo_opening_hours alter column evening_range set default '';
alter table public.restogogo_employees alter column position set default '';
alter table public.restogogo_employees alter column pin_code set default '';
alter table public.restogogo_employees alter column contract_type set default '';
alter table public.restogogo_employees alter column contract_hours set default 0;
alter table public.restogogo_employees alter column hourly_cost set default 0;

alter table public.restogogo_employees alter column first_name set default '';
alter table public.restogogo_employees alter column last_name set default '';
alter table public.restogogo_employees alter column postal_code set default '';
alter table public.restogogo_employees alter column city set default '';
alter table public.restogogo_employees alter column work_regime set default '';
alter table public.restogogo_employees alter column position_id drop default;
alter table public.restogogo_employees alter column bic set default '';
alter table public.restogogo_employees alter column payroll_provider set default '';
alter table public.restogogo_employees alter column payroll_notes set default '';

commit;
