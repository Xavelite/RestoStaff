-- Phase 2: separate employee availability from fixed recurring work patterns.
--
-- Canonical meanings:
-- - employee_availability_* = employee-submitted weekly availability.
-- - recurring_schedule_slots = manager-owned fixed recurring schedule baseline.
-- - work_pattern_exceptions = audited one-off deviations from that baseline.
--
-- Preconditions:
-- - Migrations through 202606200018 are applied.
-- - Every active recurring row belongs to a fixed-schedule employee.
-- - recurring_work_patterns.availability_state contains only `available`.
--
-- Rollback:
-- - Restore function definitions and names from the pre-deployment schema.
-- - Rename the tables/constraints/indexes back and re-add availability_state.
-- - No operational or audit rows are deleted by this migration.
begin;

do $phase2_preflight$
begin
  if exists (
    select 1
    from public.recurring_work_patterns
    where availability_state <> 'available'
  ) then
    raise exception
      'Recurring work patterns contain availability semantics that must be resolved first.';
  end if;

  if exists (
    select 1
    from public.recurring_work_patterns rp
    where rp.active
      and not exists (
        select 1
        from public.employee_contracts c
        where c.restaurant_id = rp.restaurant_id
          and c.employee_id = rp.employee_id
          and c.active
          and c.is_current
          and c.work_regime = 'fixed_schedule'
      )
  ) then
    raise exception
      'Active recurring schedule rows must belong to fixed-schedule employees.';
  end if;
end
$phase2_preflight$;

alter table public.recurring_work_patterns
  rename to recurring_schedule_slots;
alter table public.recurring_schedule_slots
  drop column availability_state;

alter table public.recurring_schedule_slots
  rename constraint recurring_work_patterns_pkey
  to recurring_schedule_slots_pkey;
alter table public.recurring_schedule_slots
  rename constraint recurring_work_patterns_restaurant_id_fkey
  to recurring_schedule_slots_restaurant_id_fkey;
alter table public.recurring_schedule_slots
  rename constraint recurring_work_patterns_employee_fk
  to recurring_schedule_slots_employee_fk;
alter table public.recurring_schedule_slots
  rename constraint recurring_work_patterns_service_fk
  to recurring_schedule_slots_service_fk;
alter table public.recurring_schedule_slots
  rename constraint recurring_work_patterns_employee_day_service_key
  to recurring_schedule_slots_employee_day_service_key;
alter table public.recurring_schedule_slots
  rename constraint recurring_work_patterns_weekday_check
  to recurring_schedule_slots_weekday_check;
alter table public.recurring_schedule_slots
  rename constraint recurring_work_patterns_time_check
  to recurring_schedule_slots_time_check;

alter table public.schedule_exceptions
  rename to work_pattern_exceptions;
alter table public.schedule_exception_events
  rename to work_pattern_exception_events;
alter table public.work_pattern_exception_events
  rename column schedule_exception_id to work_pattern_exception_id;

alter table public.work_pattern_exceptions
  rename constraint schedule_exceptions_pkey
  to work_pattern_exceptions_pkey;
alter table public.work_pattern_exceptions
  rename constraint schedule_exceptions_restaurant_id_fkey
  to work_pattern_exceptions_restaurant_id_fkey;
alter table public.work_pattern_exceptions
  rename constraint schedule_exceptions_restaurant_id_id_key
  to work_pattern_exceptions_restaurant_id_id_key;
alter table public.work_pattern_exceptions
  rename constraint schedule_exceptions_employee_fk
  to work_pattern_exceptions_employee_fk;
alter table public.work_pattern_exceptions
  rename constraint schedule_exceptions_service_fk
  to work_pattern_exceptions_service_fk;
alter table public.work_pattern_exceptions
  rename constraint schedule_exceptions_dates_check
  to work_pattern_exceptions_dates_check;
alter table public.work_pattern_exceptions
  rename constraint schedule_exceptions_service_check
  to work_pattern_exceptions_service_check;
alter table public.work_pattern_exceptions
  rename constraint schedule_exceptions_reason_check
  to work_pattern_exceptions_reason_check;
alter table public.work_pattern_exceptions
  rename constraint schedule_exceptions_requested_by_profile_id_fkey
  to work_pattern_exceptions_requested_by_profile_id_fkey;
alter table public.work_pattern_exceptions
  rename constraint schedule_exceptions_decided_by_profile_id_fkey
  to work_pattern_exceptions_decided_by_profile_id_fkey;
alter table public.work_pattern_exceptions
  rename constraint schedule_exceptions_cancelled_by_profile_id_fkey
  to work_pattern_exceptions_cancelled_by_profile_id_fkey;

alter table public.work_pattern_exception_events
  rename constraint schedule_exception_events_pkey
  to work_pattern_exception_events_pkey;
alter table public.work_pattern_exception_events
  rename constraint schedule_exception_events_restaurant_id_fkey
  to work_pattern_exception_events_restaurant_id_fkey;
alter table public.work_pattern_exception_events
  rename constraint schedule_exception_events_exception_fk
  to work_pattern_exception_events_exception_fk;
alter table public.work_pattern_exception_events
  rename constraint schedule_exception_events_employee_fk
  to work_pattern_exception_events_employee_fk;
alter table public.work_pattern_exception_events
  rename constraint schedule_exception_events_actor_profile_id_fkey
  to work_pattern_exception_events_actor_profile_id_fkey;
alter table public.work_pattern_exception_events
  rename constraint schedule_exception_events_actor_employee_fk
  to work_pattern_exception_events_actor_employee_fk;
alter table public.work_pattern_exception_events
  rename constraint schedule_exception_events_event_type_check
  to work_pattern_exception_events_event_type_check;
alter table public.work_pattern_exception_events
  rename constraint schedule_exception_events_actor_role_check
  to work_pattern_exception_events_actor_role_check;

alter index public.schedule_exceptions_restaurant_dates_idx
  rename to work_pattern_exceptions_restaurant_dates_idx;
alter index public.schedule_exceptions_employee_status_idx
  rename to work_pattern_exceptions_employee_status_idx;
alter index public.schedule_exception_events_exception_idx
  rename to work_pattern_exception_events_exception_idx;

create or replace function public.enforce_fixed_schedule_domain()
returns trigger
language plpgsql
set search_path = public
as $fixed_schedule_domain$
declare
  v_restaurant_id uuid := new.restaurant_id;
  v_employee_id uuid := new.employee_id;
begin
  if tg_table_name = 'recurring_schedule_slots'
      and not coalesce(new.active, true) then
    return new;
  end if;

  if not exists (
    select 1
    from public.employee_contracts c
    where c.restaurant_id = v_restaurant_id
      and c.employee_id = v_employee_id
      and c.active
      and c.is_current
      and c.work_regime = 'fixed_schedule'
  ) then
    raise exception
      'Recurring schedule slots and work-pattern exceptions require a fixed-schedule employee.';
  end if;

  return new;
end
$fixed_schedule_domain$;

revoke all on function public.enforce_fixed_schedule_domain()
  from public, anon, authenticated;

create constraint trigger recurring_schedule_slots_regime_guard
after insert or update on public.recurring_schedule_slots
deferrable initially deferred
for each row execute function public.enforce_fixed_schedule_domain();

create constraint trigger work_pattern_exceptions_regime_guard
after insert or update on public.work_pattern_exceptions
deferrable initially deferred
for each row execute function public.enforce_fixed_schedule_domain();

do $rewrite_phase2_functions$
declare
  v_definition text;
  v_before text;
begin
  select pg_get_functiondef(
    'public.build_workspace_runtime_snapshot_v2(uuid,text,uuid,uuid,date,date)'::regprocedure
  ) into v_definition;
  v_before := v_definition;
  v_definition := replace(
    replace(
      replace(
        replace(
          v_definition,
          '''recurring_work_patterns''',
          '''recurring_schedule_slots'''
        ),
        'public.recurring_work_patterns',
        'public.recurring_schedule_slots'
      ),
      '''schedule_exceptions''',
      '''work_pattern_exceptions'''
    ),
    'public.schedule_exceptions',
    'public.work_pattern_exceptions'
  );
  v_definition := replace(
    replace(
      v_definition,
      '''schedule_exception_events''',
      '''work_pattern_exception_events'''
    ),
    'public.schedule_exception_events',
    'public.work_pattern_exception_events'
  );
  if v_definition = v_before then
    raise exception 'Runtime snapshot scheduling contract drifted.';
  end if;
  execute v_definition;

  select pg_get_functiondef(
    'public.guard_actuals_approval()'::regprocedure
  ) into v_definition;
  v_before := v_definition;
  v_definition := replace(
    v_definition,
    'public.schedule_exceptions',
    'public.work_pattern_exceptions'
  );
  if v_definition = v_before then
    raise exception 'Actuals work-pattern guard contract drifted.';
  end if;
  execute v_definition;

  select pg_get_functiondef(
    'public.save_team_model(uuid,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb)'::regprocedure
  ) into v_definition;
  v_before := v_definition;
  v_definition := replace(
    v_definition,
    'p_recurring_work_patterns',
    'p_recurring_schedule_slots'
  );
  v_definition := replace(
    v_definition,
    'public.recurring_work_patterns',
    'public.recurring_schedule_slots'
  );
  v_definition := regexp_replace(
    v_definition,
    'service_key,\s*availability_state,\s*starts_at',
    'service_key, starts_at'
  );
  v_definition := regexp_replace(
    v_definition,
    '\s*coalesce\(nullif\(value->>''availability_state'', ''''\), ''available''\)::public\.service_availability_state,',
    ''
  );
  if v_definition = v_before
      or position('availability_state' in v_definition) > 0
      or position('p_recurring_schedule_slots' in v_definition) = 0 then
    raise exception 'Team recurring schedule contract drifted.';
  end if;
  drop function public.save_team_model(
    uuid,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb
  );
  execute v_definition;

  select pg_get_functiondef(
    'public.save_schedule_exception_lifecycle(uuid,uuid,uuid,text,jsonb)'::regprocedure
  ) into v_definition;
  v_before := v_definition;
  v_definition := replace(
    v_definition,
    'save_schedule_exception_lifecycle',
    'save_work_pattern_exception_lifecycle'
  );
  v_definition := replace(
    v_definition,
    'p_schedule_exception_id',
    'p_work_pattern_exception_id'
  );
  v_definition := replace(
    v_definition,
    'schedule_exception_events',
    'work_pattern_exception_events'
  );
  v_definition := replace(
    v_definition,
    'schedule_exception_id',
    'work_pattern_exception_id'
  );
  v_definition := replace(
    v_definition,
    'schedule_exceptions',
    'work_pattern_exceptions'
  );
  v_definition := replace(
    replace(v_definition, 'Schedule exception', 'Fixed-schedule change'),
    'schedule exception',
    'fixed-schedule change'
  );
  if v_definition = v_before
      or position('schedule_exception' in v_definition) > 0
      or position('save_work_pattern_exception_lifecycle' in v_definition) = 0 then
    raise exception 'Work-pattern exception lifecycle contract drifted.';
  end if;
  drop function public.save_schedule_exception_lifecycle(
    uuid,uuid,uuid,text,jsonb
  );
  execute v_definition;
end
$rewrite_phase2_functions$;

revoke all on table public.recurring_schedule_slots
  from public, anon, authenticated;
revoke all on table public.work_pattern_exceptions
  from public, anon, authenticated;
revoke all on table public.work_pattern_exception_events
  from public, anon, authenticated;

grant all on table public.recurring_schedule_slots to service_role;
grant all on table public.work_pattern_exceptions to service_role;
grant all on table public.work_pattern_exception_events to service_role;

revoke all on function public.save_team_model(
  uuid,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb
) from public, anon, authenticated;
grant execute on function public.save_team_model(
  uuid,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb
) to authenticated;

revoke all on function public.save_work_pattern_exception_lifecycle(
  uuid,uuid,uuid,text,jsonb
) from public, anon, authenticated;
grant execute on function public.save_work_pattern_exception_lifecycle(
  uuid,uuid,uuid,text,jsonb
) to authenticated;

commit;
