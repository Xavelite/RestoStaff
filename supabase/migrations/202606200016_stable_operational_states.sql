-- Phase 1: stable operational state typing and fixed service-key contract.
--
-- Preconditions:
-- - Migration 202606200015 is applied.
-- - Existing values satisfy the canonical sets asserted below.
-- - The canonical mutation RPCs exist with their Phase 0 signatures.
--
-- Rollback:
-- - Convert enum-backed columns to text with `using column::text`.
-- - Restore the named checks and canonical RPC definitions from source.
-- - Do not drop enum types until no column depends on them.
begin;

create type public.service_availability_state as enum (
  'available',
  'partial',
  'unavailable'
);

create type public.planning_status as enum (
  'draft',
  'published'
);

create type public.actuals_status as enum (
  'open',
  'approved',
  'locked'
);

create type public.operational_request_status as enum (
  'pending',
  'approved',
  'rejected',
  'cancelled'
);

create type public.time_entry_status as enum (
  'open',
  'closed',
  'adjusted',
  'cancelled'
);

create type public.time_entry_source as enum (
  'badge_terminal',
  'manager_manual'
);

create type public.planned_shift_source as enum (
  'manual',
  'copied',
  'template'
);

create type public.availability_submission_status as enum (
  'draft',
  'submitted'
);

do $phase1_preflight$
begin
  if exists (
    select 1 from public.services
    where service_key not in ('lunch', 'evening')
  ) then
    raise exception 'Non-canonical service keys must be resolved before Phase 1.';
  end if;
  if exists (
    select 1
    from public.restaurants r
    where not exists (
      select 1 from public.services s
      where s.restaurant_id = r.id and s.service_key = 'lunch'
    )
    or not exists (
      select 1 from public.services s
      where s.restaurant_id = r.id and s.service_key = 'evening'
    )
  ) then
    raise exception 'Every restaurant must own Lunch and Evening service metadata.';
  end if;
  if exists (
    select 1 from public.employee_availability_slots
    where availability_state not in ('available', 'partial', 'unavailable')
  ) or exists (
    select 1 from public.recurring_work_patterns
    where availability_state not in ('available', 'partial', 'unavailable')
  ) then
    raise exception 'Invalid availability state exists.';
  end if;
  if exists (
    select 1 from public.work_weeks
    where planning_status not in ('draft', 'published')
       or actuals_status not in ('open', 'approved', 'locked')
  ) then
    raise exception 'Invalid work-week state exists.';
  end if;
  if exists (
    select 1 from public.absences
    where status not in ('pending', 'approved', 'rejected', 'cancelled')
  ) or exists (
    select 1 from public.schedule_exceptions
    where status not in ('pending', 'approved', 'rejected', 'cancelled')
  ) or exists (
    select 1 from public.absence_events
    where (from_status is not null and from_status not in (
      'pending', 'approved', 'rejected', 'cancelled'
    ))
    or (to_status is not null and to_status not in (
      'pending', 'approved', 'rejected', 'cancelled'
    ))
  ) then
    raise exception 'Invalid operational request state exists.';
  end if;
  if exists (
    select 1 from public.time_entries
    where status not in ('open', 'closed', 'adjusted', 'cancelled')
       or source not in ('badge_terminal', 'manager_manual')
  ) then
    raise exception 'Invalid time-entry state or source exists.';
  end if;
  if exists (
    select 1 from public.planned_shifts
    where source not in ('manual', 'copied', 'template')
  ) then
    raise exception 'Invalid planned-shift source exists.';
  end if;
  if exists (
    select 1 from public.employee_availability_submissions
    where status not in ('draft', 'submitted')
  ) then
    raise exception 'Invalid availability-submission state exists.';
  end if;
end
$phase1_preflight$;

alter table public.services
  drop constraint services_service_key_check,
  add constraint services_service_key_check
    check (service_key in ('lunch', 'evening'));

alter table public.employee_availability_slots
  drop constraint employee_availability_state_check;
alter table public.employee_availability_slots
  alter column availability_state type public.service_availability_state
  using availability_state::public.service_availability_state;

alter table public.recurring_work_patterns
  drop constraint recurring_work_patterns_availability_check,
  alter column availability_state drop default;
alter table public.recurring_work_patterns
  alter column availability_state type public.service_availability_state
  using availability_state::public.service_availability_state,
  alter column availability_state
    set default 'available'::public.service_availability_state;

drop trigger work_weeks_actuals_approval_guard on public.work_weeks;

alter table public.work_weeks
  drop constraint work_weeks_status_check,
  drop constraint work_weeks_actuals_status_check,
  alter column planning_status drop default,
  alter column actuals_status drop default;
alter table public.work_weeks
  alter column planning_status type public.planning_status
    using planning_status::public.planning_status,
  alter column actuals_status type public.actuals_status
    using actuals_status::public.actuals_status,
  alter column planning_status set default 'draft'::public.planning_status,
  alter column actuals_status set default 'open'::public.actuals_status;

create trigger work_weeks_actuals_approval_guard
before update of actuals_status on public.work_weeks
for each row execute function public.guard_actuals_approval();

drop index public.absences_active_overlap_lookup_idx;

alter table public.absences
  drop constraint absences_status_check,
  alter column status drop default;
alter table public.absences
  alter column status type public.operational_request_status
    using status::public.operational_request_status,
  alter column status
    set default 'pending'::public.operational_request_status;

create index absences_active_overlap_lookup_idx
  on public.absences (
    restaurant_id,
    employee_id,
    status,
    start_date,
    end_date,
    service_key
  )
  where status in ('pending', 'approved');

alter table public.schedule_exceptions
  drop constraint schedule_exceptions_status_check,
  alter column status drop default;
alter table public.schedule_exceptions
  alter column status type public.operational_request_status
    using status::public.operational_request_status,
  alter column status
    set default 'pending'::public.operational_request_status;

alter table public.absence_events
  drop constraint absence_events_status_check;
alter table public.absence_events
  alter column from_status type public.operational_request_status
    using from_status::public.operational_request_status,
  alter column to_status type public.operational_request_status
    using to_status::public.operational_request_status;

drop index public.time_entries_one_non_cancelled_per_employee_service_day;
drop index public.time_entries_one_open_per_employee;

alter table public.time_entries
  drop constraint time_entries_status_check,
  drop constraint time_entries_status_clock_check,
  drop constraint time_entries_source_check,
  alter column status drop default,
  alter column source drop default;
alter table public.time_entries
  alter column status type public.time_entry_status
    using status::public.time_entry_status,
  alter column source type public.time_entry_source
    using source::public.time_entry_source,
  alter column status set default 'open'::public.time_entry_status,
  alter column source set default 'badge_terminal'::public.time_entry_source,
  add constraint time_entries_status_clock_check check (
    (status = 'open' and clock_in_at is not null and clock_out_at is null)
    or (
      status in ('closed', 'adjusted')
      and clock_in_at is not null
      and clock_out_at is not null
      and clock_out_at >= clock_in_at
    )
    or status = 'cancelled'
  );

create unique index time_entries_one_non_cancelled_per_employee_service_day
  on public.time_entries (
    restaurant_id,
    employee_id,
    business_date,
    service_key
  )
  where status <> 'cancelled';

create unique index time_entries_one_open_per_employee
  on public.time_entries (restaurant_id, employee_id)
  where status = 'open';

alter table public.planned_shifts
  drop constraint planned_shifts_source_check,
  alter column source drop default;
alter table public.planned_shifts
  alter column source type public.planned_shift_source
    using source::public.planned_shift_source,
  alter column source set default 'manual'::public.planned_shift_source;

alter table public.employee_availability_submissions
  drop constraint employee_availability_submissions_status_check,
  alter column status drop default;
alter table public.employee_availability_submissions
  alter column status type public.availability_submission_status
    using status::public.availability_submission_status,
  alter column status
    set default 'submitted'::public.availability_submission_status;

alter table public.schedule_exception_events
  add constraint schedule_exception_events_event_type_check check (
    event_type in (
      'requested',
      'created_approved',
      'approved',
      'rejected',
      'cancelled',
      'cancelled_for_planning',
      'manager_comment_updated'
    )
  ),
  add constraint schedule_exception_events_actor_role_check check (
    actor_role in ('owner', 'manager', 'employee')
  );

-- Recompile the few mutation boundaries that normalize text input before
-- writing enum-backed columns. Every replacement is asserted so schema drift
-- aborts the migration instead of silently producing a partial contract.
do $repair_phase1_rpcs$
declare
  v_definition text;
  v_before text;
begin
  select pg_get_functiondef(
    'public.save_manager_planning(uuid,date,text,jsonb,jsonb,timestamptz)'::regprocedure
  ) into v_definition;
  v_before := v_definition;
  v_definition := replace(
    v_definition,
    'v_status text := lower(btrim(coalesce(p_planning_status, ''draft'')));',
    'v_status_text text := lower(btrim(coalesce(p_planning_status, ''draft'')));' ||
      chr(10) || '  v_status public.planning_status;'
  );
  if v_definition = v_before then
    raise exception 'Planning status declaration contract drifted.';
  end if;
  v_before := v_definition;
  v_definition := replace(
    v_definition,
    'if v_status not in (''draft'',''published'') then raise exception ''Invalid planning status.''; end if;',
    'if v_status_text not in (''draft'',''published'') then raise exception ''Invalid planning status.''; end if;' ||
      chr(10) || '  v_status := v_status_text::public.planning_status;'
  );
  if v_definition = v_before then
    raise exception 'Planning status validation contract drifted.';
  end if;
  v_before := v_definition;
  v_definition := replace(
    v_definition,
    'coalesce(nullif(value->>''source'', ''''), ''manual'')',
    'coalesce(nullif(value->>''source'', ''''), ''manual'')::public.planned_shift_source'
  );
  if v_definition = v_before then
    raise exception 'Planned-shift source contract drifted.';
  end if;
  execute v_definition;

  select pg_get_functiondef(
    'public.save_actuals_lifecycle(uuid,text,jsonb)'::regprocedure
  ) into v_definition;
  v_before := v_definition;
  v_definition := replace(
    v_definition,
    'v_new_status text;',
    'v_new_status public.time_entry_status;'
  );
  if v_definition = v_before then
    raise exception 'Actuals status declaration contract drifted.';
  end if;
  execute v_definition;

  select pg_get_functiondef(
    'public.save_absence_lifecycle(uuid,uuid,uuid,text,jsonb)'::regprocedure
  ) into v_definition;
  v_before := v_definition;
  v_definition := replace(
    v_definition,
    'v_from_status         text;',
    'v_from_status         public.operational_request_status;'
  );
  v_definition := replace(
    v_definition,
    'v_to_status           text;',
    'v_to_status           public.operational_request_status;'
  );
  if v_definition = v_before then
    raise exception 'Absence status declarations drifted.';
  end if;
  v_before := v_definition;
  v_definition := replace(
    v_definition,
    'v_to_status := lower(trim(coalesce(nullif(p_payload->>''status'', ''''), ''approved'')));',
    'v_to_status := lower(trim(coalesce(nullif(p_payload->>''status'', ''''), ''approved'')))::public.operational_request_status;'
  );
  if v_definition = v_before then
    raise exception 'Manager-created absence status normalization drifted.';
  end if;
  execute v_definition;

  select pg_get_functiondef(
    'public.save_employee_availability(uuid,uuid,jsonb)'::regprocedure
  ) into v_definition;
  v_before := v_definition;
  v_definition := replace(
    v_definition,
    'availability_state text not null,',
    'availability_state public.service_availability_state,'
  );
  v_definition := replace(
    v_definition,
    'insert into pg_temp.availability_input values (v_date, v_service_key, v_state)',
    'insert into pg_temp.availability_input values (' ||
      'v_date, v_service_key, nullif(v_state, '''')::public.service_availability_state)'
  );
  v_definition := replace(
    v_definition,
    'where availability_state <> '''';',
    'where availability_state is not null;'
  );
  if v_definition = v_before then
    raise exception 'Employee availability enum boundary drifted.';
  end if;
  execute v_definition;

  select pg_get_functiondef(
    'public.save_team_model(uuid,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb)'::regprocedure
  ) into v_definition;
  v_before := v_definition;
  v_definition := replace(
    v_definition,
    'coalesce(nullif(value->>''availability_state'', ''''), ''available'')',
    'coalesce(nullif(value->>''availability_state'', ''''), ''available'')::public.service_availability_state'
  );
  if v_definition = v_before then
    raise exception 'Recurring work-pattern availability contract drifted.';
  end if;
  execute v_definition;
end
$repair_phase1_rpcs$;

commit;
