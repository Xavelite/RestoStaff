-- restogogo Supabase relational schema v1
-- Run this once in the Supabase SQL Editor before deploying the v350 app build.
-- This is a pilot-friendly schema: core business data is relational; flexible
-- rules/preferences remain JSONB. Policies are open for the anon key during the
-- prototype and must be tightened before a real multi-tenant launch.

begin;

create table if not exists public.restogogo_restaurants (
  id text primary key,
  name text not null,
  owner_name text default '',
  city text default '',
  logo_url text default '',
  accent_color text default '',
  theme text default 'modern-dark',
  legal_name text default '',
  company_number text default '',
  address text default '',
  phone text default '',
  email text default '',
  workspace_initialized boolean not null default false,
  active_week_start date,
  settings jsonb not null default '{}'::jsonb,
  payroll_rules jsonb not null default '{}'::jsonb,
  ui_preferences jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.restogogo_restaurants alter column workspace_initialized set default false;

create table if not exists public.restogogo_positions (
  restaurant_id text not null references public.restogogo_restaurants(id) on delete cascade,
  id text not null,
  name text not null,
  department text default '',
  active boolean not null default true,
  default_zone text default '',
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
  capacity integer not null default 0 check (capacity >= 0),
  active boolean not null default true,
  services jsonb not null default '{}'::jsonb,
  default_positions jsonb not null default '[]'::jsonb,
  notes text default '',
  sort_order integer not null default 0,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (restaurant_id, id),
  unique (restaurant_id, name)
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
  position text not null default '',
  rate numeric(10,2) not null default 0,
  active boolean not null default true,
  manager_access boolean not null default false,
  pin_code text default '',
  payroll_id text default '',
  external_id text default '',
  employee_number text default '',
  email text default '',
  phone text default '',
  address text default '',
  nationality text default '',
  language text default '',
  contract_type text default '',
  contract_start date,
  contract_end date,
  document_folder text default '',
  photo_url text default '',
  date_of_birth date,
  tax_status text default '',
  social_security_no text default '',
  iban text default '',
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

create table if not exists public.restogogo_employee_absences (
  restaurant_id text not null,
  employee_id text not null,
  id text not null,
  start_date date not null,
  end_date date not null,
  shift_name text not null default 'Full day',
  reason text not null default 'Absence',
  status text not null default 'Approved',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (restaurant_id, employee_id, id),
  foreign key (restaurant_id, employee_id) references public.restogogo_employees(restaurant_id, id) on delete cascade
);

create table if not exists public.restogogo_employee_documents (
  restaurant_id text not null,
  employee_id text not null,
  id text not null,
  name text not null,
  type text default 'File',
  uploaded_at timestamptz not null default now(),
  status text not null default 'Uploaded',
  size_label text default '',
  storage_path text default '',
  sort_order integer not null default 0,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (restaurant_id, employee_id, id),
  foreign key (restaurant_id, employee_id) references public.restogogo_employees(restaurant_id, id) on delete cascade
);

create table if not exists public.restogogo_restaurant_documents (
  restaurant_id text not null references public.restogogo_restaurants(id) on delete cascade,
  id text not null,
  name text not null,
  type text default 'File',
  uploaded_at timestamptz not null default now(),
  status text not null default 'Uploaded',
  size_label text default '',
  storage_path text default '',
  sort_order integer not null default 0,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (restaurant_id, id)
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
  zone_name text default '',
  time_range text default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (restaurant_id, week_start, employee_id, day_name, shift_name),
  foreign key (restaurant_id, week_start) references public.restogogo_weekly_status(restaurant_id, week_start) on delete cascade,
  foreign key (restaurant_id, employee_id) references public.restogogo_employees(restaurant_id, id) on delete cascade
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

create index if not exists idx_restogogo_employees_restaurant_active on public.restogogo_employees (restaurant_id, active, sort_order);
create index if not exists idx_restogogo_absences_restaurant_dates on public.restogogo_employee_absences (restaurant_id, start_date, end_date);
create index if not exists idx_restogogo_planned_shifts_week on public.restogogo_planned_shifts (restaurant_id, week_start);
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

drop trigger if exists trg_restogogo_employee_absences_updated_at on public.restogogo_employee_absences;
create trigger trg_restogogo_employee_absences_updated_at before update on public.restogogo_employee_absences for each row execute function public.restogogo_set_updated_at();

drop trigger if exists trg_restogogo_employee_documents_updated_at on public.restogogo_employee_documents;
create trigger trg_restogogo_employee_documents_updated_at before update on public.restogogo_employee_documents for each row execute function public.restogogo_set_updated_at();

drop trigger if exists trg_restogogo_restaurant_documents_updated_at on public.restogogo_restaurant_documents;
create trigger trg_restogogo_restaurant_documents_updated_at before update on public.restogogo_restaurant_documents for each row execute function public.restogogo_set_updated_at();

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
alter table public.restogogo_employee_absences enable row level security;
alter table public.restogogo_employee_documents enable row level security;
alter table public.restogogo_restaurant_documents enable row level security;
alter table public.restogogo_weekly_status enable row level security;
alter table public.restogogo_availability_slots enable row level security;
alter table public.restogogo_planned_shifts enable row level security;
alter table public.restogogo_employee_week_submissions enable row level security;
alter table public.restogogo_weekly_notes enable row level security;
alter table public.restogogo_actual_shift_entries enable row level security;

-- Prototype policy: public anon CRUD. Tighten this before production by linking
-- restaurants to Supabase Auth users and replacing these policies with tenant RLS.
do $$
declare
  v_table_name text;
  v_policy_name text;
begin
  foreach v_table_name in array array[
    'restogogo_restaurants','restogogo_positions','restogogo_zones','restogogo_opening_hours','restogogo_employees',
    'restogogo_employee_absences','restogogo_employee_documents','restogogo_restaurant_documents','restogogo_weekly_status',
    'restogogo_availability_slots','restogogo_planned_shifts','restogogo_employee_week_submissions','restogogo_weekly_notes','restogogo_actual_shift_entries'
  ] loop
    v_policy_name := v_table_name || '_pilot_anon_crud';
    if not exists (
      select 1 from pg_policies where schemaname = 'public' and tablename = v_table_name and policyname = v_policy_name
    ) then
      execute format('create policy %I on public.%I for all to anon using (true) with check (true)', v_policy_name, v_table_name);
    end if;
  end loop;
end $$;


alter table public.restogogo_restaurants alter column owner_name set default '';
alter table public.restogogo_restaurants alter column accent_color set default '';
alter table public.restogogo_positions alter column department set default '';
alter table public.restogogo_zones alter column services set default '{}'::jsonb;
alter table public.restogogo_opening_hours alter column is_open set default false;
alter table public.restogogo_opening_hours alter column lunch_range set default '';
alter table public.restogogo_opening_hours alter column evening_range set default '';
alter table public.restogogo_employees alter column position set default '';
alter table public.restogogo_employees alter column rate set default 0;
alter table public.restogogo_employees alter column pin_code set default '';
alter table public.restogogo_employees alter column contract_type set default '';
alter table public.restogogo_employees alter column contract_hours set default 0;
alter table public.restogogo_employees alter column hourly_cost set default 0;

commit;
