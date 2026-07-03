-- Phase 5 focused read-model verification.
begin;

do $phase5_contract$
declare
  v_restaurant_id uuid;
  v_bootstrap jsonb;
  v_manager jsonb;
  v_employee jsonb;
  v_team jsonb;
  v_restaurant jsonb;
  v_routine regprocedure;
begin
  if to_regprocedure('public.get_workspace_bootstrap(uuid)') is null
     or to_regprocedure(
       'public.get_manager_operations_read_model(uuid,date,date)'
     ) is null
     or to_regprocedure(
       'public.get_employee_operations_read_model(uuid,date,date)'
     ) is null
     or to_regprocedure('public.get_team_read_model(uuid)') is null
     or to_regprocedure('public.get_restaurant_read_model(uuid)') is null then
    raise exception 'Focused public read-model contracts are incomplete.';
  end if;

  if to_regprocedure('public.get_workspace_runtime_snapshot(uuid,date,date)') is not null
     or to_regprocedure(
       'public.build_workspace_runtime_snapshot_v2(uuid,text,uuid,uuid,date,date)'
     ) is not null
     or to_regprocedure(
       'public.build_workspace_runtime_snapshot_for_role(uuid,text,uuid,uuid,date,date)'
     ) is not null then
    raise exception 'Broad runtime snapshot compatibility paths remain.';
  end if;

  foreach v_routine in array array[
    'public.get_workspace_bootstrap(uuid)'::regprocedure,
    'public.get_manager_operations_read_model(uuid,date,date)'::regprocedure,
    'public.get_employee_operations_read_model(uuid,date,date)'::regprocedure,
    'public.get_team_read_model(uuid)'::regprocedure,
    'public.get_restaurant_read_model(uuid)'::regprocedure
  ]
  loop
    if not has_function_privilege('authenticated', v_routine, 'EXECUTE')
       or has_function_privilege('anon', v_routine, 'EXECUTE') then
      raise exception 'Invalid browser grant for %.', v_routine;
    end if;
  end loop;

  if has_function_privilege(
    'authenticated',
    'public.build_team_read_model(uuid,text)',
    'EXECUTE'
  ) or has_function_privilege(
    'authenticated',
    'public.require_workspace_read_context(uuid)',
    'EXECUTE'
  ) then
    raise exception 'Internal read-model helpers are browser-exposed.';
  end if;

  if position(
    'Owner or manager access required.'
    in pg_get_functiondef(
      'public.get_manager_operations_read_model(uuid,date,date)'::regprocedure
    )
  ) = 0 or position(
    'Employee access required.'
    in pg_get_functiondef(
      'public.get_employee_operations_read_model(uuid,date,date)'::regprocedure
    )
  ) = 0 or position(
    'Owner access required.'
    in pg_get_functiondef(
      'public.get_restaurant_read_model(uuid)'::regprocedure
    )
  ) = 0 then
    raise exception 'Focused read-model role guards are incomplete.';
  end if;

  select id into v_restaurant_id
  from public.restaurants
  order by created_at
  limit 1;

  if v_restaurant_id is not null then
    v_bootstrap := public.build_workspace_bootstrap_read_model(
      v_restaurant_id, null
    );
    v_manager := public.build_manager_operations_read_model(
      v_restaurant_id, 'manager', current_date - 7, current_date + 7
    );
    v_employee := public.build_employee_operations_read_model(
      v_restaurant_id,
      (
        select id from public.employees
        where restaurant_id = v_restaurant_id
        order by created_at
        limit 1
      ),
      current_date - 7,
      current_date + 7
    );
    v_team := public.build_team_read_model(v_restaurant_id, 'manager');
    v_restaurant := public.build_restaurant_read_model(v_restaurant_id);

    if not (v_bootstrap ? 'readiness')
       or v_bootstrap ? 'employees'
       or v_bootstrap ? 'time_entries' then
      raise exception 'Bootstrap is not lightweight.';
    end if;
    if v_manager ? 'employee_contact_details'
       or v_manager ? 'employee_access'
       or v_manager ? 'restaurant_onboarding_state' then
      raise exception 'Manager operations leaks unrelated module data.';
    end if;
    if v_employee ? 'employee_payroll_profiles'
       or v_employee ? 'employee_legal_profiles'
       or v_employee ? 'work_week_events'
       or v_employee ? 'time_entry_adjustments' then
      raise exception 'Employee operations leaks manager/private data.';
    end if;
    if jsonb_array_length(v_team->'employee_legal_profiles') <> 0
       or jsonb_array_length(v_team->'employee_payroll_profiles') <> 0 then
      raise exception 'Manager Team read exposes owner-private data.';
    end if;
    if v_restaurant ? 'employees'
       or v_restaurant ? 'time_entries'
       or v_restaurant ? 'employee_payroll_profiles' then
      raise exception 'Restaurant setup read contains unrelated domains.';
    end if;
  end if;

  foreach v_routine in array array[
    'public.revoke_employee_invitation(uuid,uuid,text)'::regprocedure,
    'public.save_absence_lifecycle(uuid,uuid,uuid,text,jsonb)'::regprocedure,
    'public.save_actuals_lifecycle(uuid,text,jsonb)'::regprocedure,
    'public.save_employee_availability(uuid,uuid,jsonb)'::regprocedure,
    'public.save_manager_planning(uuid,date,text,jsonb,jsonb,bigint,text)'::regprocedure,
    'public.save_restaurant_model(uuid,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb)'::regprocedure,
    'public.save_team_model(uuid,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb)'::regprocedure,
    'public.save_work_pattern_exception_lifecycle(uuid,uuid,uuid,text,jsonb)'::regprocedure,
    'public.set_employee_access_state(uuid,uuid,text)'::regprocedure
  ]
  loop
    if position('runtime_snapshot' in pg_get_functiondef(v_routine)) > 0 then
      raise exception 'Mutation still returns broad workspace data: %.', v_routine;
    end if;
    if position(
      '''restaurant_id'', p_restaurant_id'
      in pg_get_functiondef(v_routine)
    ) = 0 then
      raise exception 'Mutation acknowledgement lacks restaurant identity: %.', v_routine;
    end if;
  end loop;
end
$phase5_contract$;

rollback;
