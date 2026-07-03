-- Behavioral verification for the Phase 2 scheduling model.
-- Any attempted mutation is rolled back.
begin;

do $verify_work_pattern_names$
declare
  v_manager_read regprocedure :=
    'public.build_manager_operations_read_model(uuid,text,date,date)'::regprocedure;
  v_employee_read regprocedure :=
    'public.build_employee_operations_read_model(uuid,uuid,date,date)'::regprocedure;
  v_team_read regprocedure :=
    'public.build_team_read_model(uuid,text)'::regprocedure;
begin
  if to_regclass('public.recurring_work_patterns') is not null
      or to_regclass('public.schedule_exceptions') is not null
      or to_regclass('public.schedule_exception_events') is not null then
    raise exception 'Legacy scheduling objects still exist.';
  end if;

  if to_regprocedure(
    'public.save_schedule_exception_lifecycle(uuid,uuid,uuid,text,jsonb)'
  ) is not null then
    raise exception 'Legacy scheduling RPC still exists.';
  end if;

  if position(
    '''recurring_schedule_slots'''
    in pg_get_functiondef(v_manager_read)
  ) = 0 or position(
    '''work_pattern_exceptions'''
    in pg_get_functiondef(v_manager_read)
  ) = 0 or position(
    '''recurring_schedule_slots'''
    in pg_get_functiondef(v_employee_read)
  ) = 0 or position(
    '''work_pattern_exceptions'''
    in pg_get_functiondef(v_employee_read)
  ) = 0 or position(
    '''recurring_schedule_slots'''
    in pg_get_functiondef(v_team_read)
  ) = 0 then
    raise exception 'Focused read models do not expose canonical scheduling keys.';
  end if;

  if position(
    'p_recurring_schedule_slots'
    in pg_get_functiondef(
      'public.save_team_model(uuid,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb)'::regprocedure
    )
  ) = 0 then
    raise exception 'Team mutation does not own recurring schedule slots.';
  end if;
end
$verify_work_pattern_names$;

do $verify_fixed_regime_guard$
declare
  v_restaurant_id uuid;
  v_employee_id uuid;
begin
  select c.restaurant_id, c.employee_id
  into v_restaurant_id, v_employee_id
  from public.employee_contracts c
  where c.active
    and c.is_current
    and c.work_regime = 'weekly_availability'
  limit 1;

  if v_employee_id is null then
    raise exception 'A weekly-availability fixture is required.';
  end if;

  begin
    insert into public.recurring_schedule_slots (
      restaurant_id,
      employee_id,
      weekday,
      service_key,
      active
    )
    values (
      v_restaurant_id,
      v_employee_id,
      7,
      'evening',
      true
    );

    set constraints recurring_schedule_slots_regime_guard immediate;
    raise exception 'Fixed-schedule regime guard did not reject the row.';
  exception
    when others then
      if sqlerrm not like
          'Recurring schedule slots and work-pattern exceptions require a fixed-schedule employee.%'
      then
        raise;
      end if;
  end;
end
$verify_fixed_regime_guard$;

rollback;
