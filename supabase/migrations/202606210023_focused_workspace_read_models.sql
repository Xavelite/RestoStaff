-- Phase 5: focused workspace read models.
--
-- Preconditions:
-- - Migrations through 202606210022 are applied.
-- - All browser writes use the canonical mutation RPCs rewritten below.
--
-- Rollback:
-- - Restore the broad snapshot routines and mutation definitions from the
--   pre-deployment schema snapshot.
-- - No business rows are rewritten or deleted by this migration.
begin;

create function public.require_workspace_read_context(p_restaurant_id uuid)
returns table (
  profile_id uuid,
  actor_role text,
  employee_id uuid
)
language plpgsql
stable
security definer
set search_path = public
as $read_context$
declare
  v_profile_id uuid := public.current_profile_id();
begin
  if v_profile_id is null then
    raise exception 'Authenticated session required.';
  end if;

  return query
  select m.profile_id, m.role, ea.employee_id
  from public.restaurant_memberships m
  join public.restaurants r
    on r.id = m.restaurant_id
   and r.active
  left join public.employee_access ea
    on ea.restaurant_id = m.restaurant_id
   and ea.profile_id = m.profile_id
   and ea.access_status = 'active'
  where m.restaurant_id = p_restaurant_id
    and m.profile_id = v_profile_id
    and m.status = 'active'
  limit 1;

  if not found then
    raise exception 'Active workspace membership required.';
  end if;
end
$read_context$;

create function public.build_workspace_bootstrap_read_model(
  p_restaurant_id uuid,
  p_employee_id uuid
)
returns jsonb
language sql
stable
security definer
set search_path = public
as $bootstrap$
  select jsonb_build_object(
    'restaurant', to_jsonb(r),
    'restaurant_settings', coalesce(
      (
        select to_jsonb(s)
        from public.restaurant_settings s
        where s.restaurant_id = r.id
      ),
      '{}'::jsonb
    ),
    'current_employee', coalesce(
      (
        select to_jsonb(e)
        from public.employees e
        where e.restaurant_id = r.id
          and e.id = p_employee_id
      ),
      'null'::jsonb
    ),
    'readiness', jsonb_build_object(
      'has_active_employees', exists (
        select 1 from public.employees e
        where e.restaurant_id = r.id and e.active
      ),
      'has_active_areas', exists (
        select 1 from public.work_areas a
        where a.restaurant_id = r.id and a.active
      ),
      'has_active_job_functions', exists (
        select 1 from public.job_functions j
        where j.restaurant_id = r.id and j.active
      ),
      'has_open_services', exists (
        select 1 from public.opening_hours h
        where h.restaurant_id = r.id and h.is_open
      ),
      'has_coverage_rules', exists (
        select 1 from public.coverage_requirements c
        where c.restaurant_id = r.id and c.active
      ),
      'has_absence_policy', exists (
        select 1 from public.absence_types a
        where a.restaurant_id = r.id and a.active
      )
    )
  )
  from public.restaurants r
  where r.id = p_restaurant_id
$bootstrap$;

create function public.build_manager_operations_read_model(
  p_restaurant_id uuid,
  p_role text,
  p_from_date date,
  p_to_date date
)
returns jsonb
language sql
stable
security definer
set search_path = public
as $manager_operations$
  select jsonb_build_object(
    'restaurant', to_jsonb(r),
    'restaurant_settings', coalesce((select to_jsonb(s) from public.restaurant_settings s where s.restaurant_id = r.id), '{}'::jsonb),
    'employees', coalesce((select jsonb_agg(to_jsonb(e) order by e.sort_order, e.display_name) from public.employees e where e.restaurant_id = r.id), '[]'::jsonb),
    'employee_contracts', coalesce((select jsonb_agg(to_jsonb(c)) from public.employee_contracts c where c.restaurant_id = r.id), '[]'::jsonb),
    'employee_legal_profiles', case when p_role = 'owner' then coalesce((select jsonb_agg(to_jsonb(l)) from public.employee_legal_profiles l where l.restaurant_id = r.id), '[]'::jsonb) else '[]'::jsonb end,
    'employee_payroll_profiles', case when p_role = 'owner' then coalesce((select jsonb_agg(to_jsonb(p)) from public.employee_payroll_profiles p where p.restaurant_id = r.id), '[]'::jsonb) else '[]'::jsonb end,
    'job_functions', coalesce((select jsonb_agg(to_jsonb(j) order by j.sort_order, j.name) from public.job_functions j where j.restaurant_id = r.id), '[]'::jsonb),
    'employee_job_functions', coalesce((select jsonb_agg(to_jsonb(ej)) from public.employee_job_functions ej where ej.restaurant_id = r.id), '[]'::jsonb),
    'recurring_schedule_slots', coalesce((select jsonb_agg(to_jsonb(rs)) from public.recurring_schedule_slots rs where rs.restaurant_id = r.id), '[]'::jsonb),
    'contract_types', coalesce((select jsonb_agg(to_jsonb(ct) order by ct.sort_order) from public.contract_types ct where ct.restaurant_id = r.id and ct.active), '[]'::jsonb),
    'work_areas', coalesce((select jsonb_agg(to_jsonb(a) order by a.sort_order, a.name) from public.work_areas a where a.restaurant_id = r.id), '[]'::jsonb),
    'services', coalesce((select jsonb_agg(to_jsonb(s) order by s.sort_order) from public.services s where s.restaurant_id = r.id), '[]'::jsonb),
    'area_service_defaults', coalesce((select jsonb_agg(to_jsonb(d)) from public.area_service_defaults d where d.restaurant_id = r.id), '[]'::jsonb),
    'coverage_requirements', coalesce((select jsonb_agg(to_jsonb(c)) from public.coverage_requirements c where c.restaurant_id = r.id), '[]'::jsonb),
    'opening_hours', coalesce((select jsonb_agg(to_jsonb(h)) from public.opening_hours h where h.restaurant_id = r.id), '[]'::jsonb),
    'absence_types', coalesce((select jsonb_agg(to_jsonb(t) order by t.sort_order) from public.absence_types t where t.restaurant_id = r.id and t.active), '[]'::jsonb),
    'work_weeks', coalesce((select jsonb_agg(to_jsonb(w)) from public.work_weeks w where w.restaurant_id = r.id and w.week_start >= public.week_start_for_date(p_from_date) and w.week_start <= public.week_start_for_date(p_to_date)), '[]'::jsonb),
    'work_week_events', coalesce((select jsonb_agg(to_jsonb(e) order by e.created_at) from public.work_week_events e where e.restaurant_id = r.id and e.week_start >= public.week_start_for_date(p_from_date) and e.week_start <= public.week_start_for_date(p_to_date)), '[]'::jsonb),
    'planned_shifts', coalesce((select jsonb_agg(to_jsonb(p)) from public.planned_shifts p where p.restaurant_id = r.id and p.week_start + (p.weekday - 1) between p_from_date and p_to_date), '[]'::jsonb),
    'employee_availability_slots', coalesce((select jsonb_agg(to_jsonb(a)) from public.employee_availability_slots a where a.restaurant_id = r.id and a.week_start + (a.weekday - 1) between p_from_date and p_to_date), '[]'::jsonb),
    'employee_availability_submissions', coalesce((select jsonb_agg(to_jsonb(s)) from public.employee_availability_submissions s where s.restaurant_id = r.id and s.week_start between public.week_start_for_date(p_from_date) and public.week_start_for_date(p_to_date)), '[]'::jsonb),
    'weekly_notes', coalesce((select jsonb_agg(to_jsonb(n)) from public.weekly_notes n where n.restaurant_id = r.id and n.week_start + (n.weekday - 1) between p_from_date and p_to_date), '[]'::jsonb),
    'time_entries', coalesce((select jsonb_agg(to_jsonb(t)) from public.time_entries t where t.restaurant_id = r.id and t.business_date between p_from_date and p_to_date), '[]'::jsonb),
    'time_entry_adjustments', coalesce((select jsonb_agg(to_jsonb(a) order by a.created_at) from public.time_entry_adjustments a where a.restaurant_id = r.id and a.business_date between p_from_date and p_to_date), '[]'::jsonb),
    'absences', coalesce((select jsonb_agg(to_jsonb(a)) from public.absences a where a.restaurant_id = r.id and a.start_date <= p_to_date and a.end_date >= p_from_date), '[]'::jsonb),
    'absence_events', coalesce((select jsonb_agg(to_jsonb(e) order by e.created_at) from public.absence_events e join public.absences a on a.id = e.absence_id and a.restaurant_id = e.restaurant_id where e.restaurant_id = r.id and a.start_date <= p_to_date and a.end_date >= p_from_date), '[]'::jsonb),
    'work_pattern_exceptions', coalesce((select jsonb_agg(to_jsonb(x)) from public.work_pattern_exceptions x where x.restaurant_id = r.id and x.start_date <= p_to_date and x.end_date >= p_from_date), '[]'::jsonb),
    'work_pattern_exception_events', coalesce((select jsonb_agg(to_jsonb(e) order by e.created_at) from public.work_pattern_exception_events e join public.work_pattern_exceptions x on x.id = e.work_pattern_exception_id and x.restaurant_id = e.restaurant_id where e.restaurant_id = r.id and x.start_date <= p_to_date and x.end_date >= p_from_date), '[]'::jsonb)
  )
  from public.restaurants r
  where r.id = p_restaurant_id
$manager_operations$;

create function public.build_employee_operations_read_model(
  p_restaurant_id uuid,
  p_employee_id uuid,
  p_from_date date,
  p_to_date date
)
returns jsonb
language sql
stable
security definer
set search_path = public
as $employee_operations$
  select jsonb_build_object(
    'restaurant', to_jsonb(r),
    'restaurant_settings', coalesce((select to_jsonb(s) from public.restaurant_settings s where s.restaurant_id = r.id), '{}'::jsonb),
    'employees', coalesce((select jsonb_agg(to_jsonb(e)) from public.employees e where e.restaurant_id = r.id and e.id = p_employee_id), '[]'::jsonb),
    'employee_contracts', coalesce((select jsonb_agg(to_jsonb(c)) from public.employee_contracts c where c.restaurant_id = r.id and c.employee_id = p_employee_id), '[]'::jsonb),
    'job_functions', coalesce((select jsonb_agg(to_jsonb(j) order by j.sort_order, j.name) from public.job_functions j where j.restaurant_id = r.id), '[]'::jsonb),
    'employee_job_functions', coalesce((select jsonb_agg(to_jsonb(ej)) from public.employee_job_functions ej where ej.restaurant_id = r.id and ej.employee_id = p_employee_id), '[]'::jsonb),
    'recurring_schedule_slots', coalesce((select jsonb_agg(to_jsonb(rs)) from public.recurring_schedule_slots rs where rs.restaurant_id = r.id and rs.employee_id = p_employee_id), '[]'::jsonb),
    'contract_types', coalesce((select jsonb_agg(to_jsonb(ct) order by ct.sort_order) from public.contract_types ct where ct.restaurant_id = r.id and ct.active), '[]'::jsonb),
    'work_areas', coalesce((select jsonb_agg(to_jsonb(a) order by a.sort_order, a.name) from public.work_areas a where a.restaurant_id = r.id), '[]'::jsonb),
    'services', coalesce((select jsonb_agg(to_jsonb(s) order by s.sort_order) from public.services s where s.restaurant_id = r.id), '[]'::jsonb),
    'absence_types', coalesce((select jsonb_agg(to_jsonb(t) order by t.sort_order) from public.absence_types t where t.restaurant_id = r.id and t.active), '[]'::jsonb),
    'work_weeks', coalesce((select jsonb_agg(to_jsonb(w)) from public.work_weeks w where w.restaurant_id = r.id and w.week_start >= public.week_start_for_date(p_from_date) and w.week_start <= public.week_start_for_date(p_to_date)), '[]'::jsonb),
    'planned_shifts', coalesce((select jsonb_agg(to_jsonb(p)) from public.planned_shifts p join public.work_weeks w on w.restaurant_id = p.restaurant_id and w.week_start = p.week_start where p.restaurant_id = r.id and p.employee_id = p_employee_id and w.planning_status = 'published' and p.week_start + (p.weekday - 1) between p_from_date and p_to_date), '[]'::jsonb),
    'employee_availability_slots', coalesce((select jsonb_agg(to_jsonb(a)) from public.employee_availability_slots a where a.restaurant_id = r.id and a.employee_id = p_employee_id and a.week_start + (a.weekday - 1) between p_from_date and p_to_date), '[]'::jsonb),
    'employee_availability_submissions', coalesce((select jsonb_agg(to_jsonb(s)) from public.employee_availability_submissions s where s.restaurant_id = r.id and s.employee_id = p_employee_id and s.week_start between public.week_start_for_date(p_from_date) and public.week_start_for_date(p_to_date)), '[]'::jsonb),
    'time_entries', coalesce((select jsonb_agg(to_jsonb(t)) from public.time_entries t where t.restaurant_id = r.id and t.employee_id = p_employee_id and t.business_date between p_from_date and p_to_date), '[]'::jsonb),
    'absences', coalesce((select jsonb_agg(to_jsonb(a)) from public.absences a where a.restaurant_id = r.id and a.employee_id = p_employee_id and a.start_date <= p_to_date and a.end_date >= p_from_date), '[]'::jsonb),
    'work_pattern_exceptions', coalesce((select jsonb_agg(to_jsonb(x)) from public.work_pattern_exceptions x where x.restaurant_id = r.id and x.employee_id = p_employee_id and x.start_date <= p_to_date and x.end_date >= p_from_date), '[]'::jsonb)
  )
  from public.restaurants r
  where r.id = p_restaurant_id
$employee_operations$;

create function public.build_team_read_model(
  p_restaurant_id uuid,
  p_role text
)
returns jsonb
language sql
stable
security definer
set search_path = public
as $team$
  select jsonb_build_object(
    'restaurant', to_jsonb(r),
    'restaurant_settings', coalesce((select to_jsonb(s) from public.restaurant_settings s where s.restaurant_id = r.id), '{}'::jsonb),
    'restaurant_memberships', coalesce((select jsonb_agg(to_jsonb(m)) from public.restaurant_memberships m where m.restaurant_id = r.id), '[]'::jsonb),
    'employees', coalesce((select jsonb_agg(to_jsonb(e) order by e.sort_order, e.display_name) from public.employees e where e.restaurant_id = r.id), '[]'::jsonb),
    'employee_access', coalesce((select jsonb_agg(to_jsonb(a)) from public.employee_access a where a.restaurant_id = r.id), '[]'::jsonb),
    'employee_invitation_states', public.employee_invitation_states_for_restaurant(r.id),
    'employee_pin_credentials', coalesce((select jsonb_agg(jsonb_build_object('restaurant_id', p.restaurant_id, 'employee_id', p.employee_id, 'pin_status', p.pin_status, 'locked_until', p.locked_until, 'last_used_at', p.last_used_at, 'last_rotated_at', p.last_rotated_at)) from public.employee_pin_credentials p where p.restaurant_id = r.id), '[]'::jsonb),
    'employee_contact_details', coalesce((select jsonb_agg(to_jsonb(c)) from public.employee_contact_details c where c.restaurant_id = r.id), '[]'::jsonb),
    'employee_contracts', coalesce((select jsonb_agg(to_jsonb(c)) from public.employee_contracts c where c.restaurant_id = r.id), '[]'::jsonb),
    'employee_legal_profiles', case when p_role = 'owner' then coalesce((select jsonb_agg(to_jsonb(l)) from public.employee_legal_profiles l where l.restaurant_id = r.id), '[]'::jsonb) else '[]'::jsonb end,
    'employee_payroll_profiles', case when p_role = 'owner' then coalesce((select jsonb_agg(to_jsonb(p)) from public.employee_payroll_profiles p where p.restaurant_id = r.id), '[]'::jsonb) else '[]'::jsonb end,
    'job_functions', coalesce((select jsonb_agg(to_jsonb(j) order by j.sort_order, j.name) from public.job_functions j where j.restaurant_id = r.id), '[]'::jsonb),
    'employee_job_functions', coalesce((select jsonb_agg(to_jsonb(ej)) from public.employee_job_functions ej where ej.restaurant_id = r.id), '[]'::jsonb),
    'recurring_schedule_slots', coalesce((select jsonb_agg(to_jsonb(rs)) from public.recurring_schedule_slots rs where rs.restaurant_id = r.id), '[]'::jsonb),
    'contract_types', coalesce((select jsonb_agg(to_jsonb(ct) order by ct.sort_order) from public.contract_types ct where ct.restaurant_id = r.id and ct.active), '[]'::jsonb),
    'absence_types', coalesce((select jsonb_agg(to_jsonb(t) order by t.sort_order) from public.absence_types t where t.restaurant_id = r.id and t.active), '[]'::jsonb),
    'absences', coalesce((select jsonb_agg(to_jsonb(a)) from public.absences a where a.restaurant_id = r.id), '[]'::jsonb),
    'absence_events', coalesce((select jsonb_agg(to_jsonb(e) order by e.created_at) from public.absence_events e where e.restaurant_id = r.id), '[]'::jsonb),
    'work_pattern_exceptions', coalesce((select jsonb_agg(to_jsonb(x)) from public.work_pattern_exceptions x where x.restaurant_id = r.id), '[]'::jsonb),
    'work_pattern_exception_events', coalesce((select jsonb_agg(to_jsonb(e) order by e.created_at) from public.work_pattern_exception_events e where e.restaurant_id = r.id), '[]'::jsonb)
  )
  from public.restaurants r
  where r.id = p_restaurant_id
$team$;

create function public.build_restaurant_read_model(p_restaurant_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $restaurant$
  select jsonb_build_object(
    'restaurant', to_jsonb(r),
    'restaurant_settings', coalesce((select to_jsonb(s) from public.restaurant_settings s where s.restaurant_id = r.id), '{}'::jsonb),
    'restaurant_onboarding_state', coalesce((select to_jsonb(o) from public.restaurant_onboarding_state o where o.restaurant_id = r.id), '{}'::jsonb),
    'job_functions', coalesce((select jsonb_agg(to_jsonb(j) order by j.sort_order, j.name) from public.job_functions j where j.restaurant_id = r.id), '[]'::jsonb),
    'work_areas', coalesce((select jsonb_agg(to_jsonb(a) order by a.sort_order, a.name) from public.work_areas a where a.restaurant_id = r.id), '[]'::jsonb),
    'services', coalesce((select jsonb_agg(to_jsonb(s) order by s.sort_order) from public.services s where s.restaurant_id = r.id), '[]'::jsonb),
    'area_service_defaults', coalesce((select jsonb_agg(to_jsonb(d)) from public.area_service_defaults d where d.restaurant_id = r.id), '[]'::jsonb),
    'coverage_requirements', coalesce((select jsonb_agg(to_jsonb(c)) from public.coverage_requirements c where c.restaurant_id = r.id), '[]'::jsonb),
    'opening_hours', coalesce((select jsonb_agg(to_jsonb(h)) from public.opening_hours h where h.restaurant_id = r.id), '[]'::jsonb),
    'absence_types', coalesce((select jsonb_agg(to_jsonb(t) order by t.sort_order) from public.absence_types t where t.restaurant_id = r.id and t.active), '[]'::jsonb)
  )
  from public.restaurants r
  where r.id = p_restaurant_id
$restaurant$;

create function public.get_workspace_bootstrap(p_restaurant_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $get_bootstrap$
declare
  v_context record;
begin
  select * into v_context from public.require_workspace_read_context(p_restaurant_id);
  return public.build_workspace_bootstrap_read_model(
    p_restaurant_id, v_context.employee_id
  );
end
$get_bootstrap$;

create function public.get_manager_operations_read_model(
  p_restaurant_id uuid,
  p_from_date date,
  p_to_date date
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $get_manager_operations$
declare
  v_context record;
begin
  if p_from_date is null or p_to_date is null or p_to_date < p_from_date then
    raise exception 'A valid operations date range is required.';
  end if;
  if p_to_date - p_from_date > 62 then
    raise exception 'Manager operations reads are limited to 63 days.';
  end if;
  select * into v_context from public.require_workspace_read_context(p_restaurant_id);
  if v_context.actor_role not in ('owner', 'manager') then
    raise exception 'Owner or manager access required.';
  end if;
  return public.build_manager_operations_read_model(
    p_restaurant_id, v_context.actor_role, p_from_date, p_to_date
  );
end
$get_manager_operations$;

create function public.get_employee_operations_read_model(
  p_restaurant_id uuid,
  p_from_date date,
  p_to_date date
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $get_employee_operations$
declare
  v_context record;
begin
  if p_from_date is null or p_to_date is null or p_to_date < p_from_date then
    raise exception 'A valid employee date range is required.';
  end if;
  if p_to_date - p_from_date > 62 then
    raise exception 'Employee operations reads are limited to 63 days.';
  end if;
  select * into v_context from public.require_workspace_read_context(p_restaurant_id);
  if v_context.actor_role <> 'employee' or v_context.employee_id is null then
    raise exception 'Employee access required.';
  end if;
  return public.build_employee_operations_read_model(
    p_restaurant_id, v_context.employee_id, p_from_date, p_to_date
  );
end
$get_employee_operations$;

create function public.get_team_read_model(p_restaurant_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $get_team$
declare
  v_context record;
begin
  select * into v_context from public.require_workspace_read_context(p_restaurant_id);
  if v_context.actor_role not in ('owner', 'manager') then
    raise exception 'Owner or manager access required.';
  end if;
  return public.build_team_read_model(p_restaurant_id, v_context.actor_role);
end
$get_team$;

create function public.get_restaurant_read_model(p_restaurant_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $get_restaurant$
declare
  v_context record;
begin
  select * into v_context from public.require_workspace_read_context(p_restaurant_id);
  if v_context.actor_role <> 'owner' then
    raise exception 'Owner access required.';
  end if;
  return public.build_restaurant_read_model(p_restaurant_id);
end
$get_restaurant$;

-- Mutations acknowledge the committed action. The owning route performs one
-- focused authoritative read instead of receiving every workspace domain.
do $compact_mutation_results$
declare
  v_signature regprocedure;
  v_definition text;
  v_before text;
begin
  foreach v_signature in array array[
    'public.revoke_employee_invitation(uuid,uuid,text)'::regprocedure,
    'public.save_actuals_lifecycle(uuid,text,jsonb)'::regprocedure,
    'public.save_employee_availability(uuid,uuid,jsonb)'::regprocedure,
    'public.save_manager_planning(uuid,date,text,jsonb,jsonb,bigint,text)'::regprocedure,
    'public.save_restaurant_model(uuid,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb)'::regprocedure,
    'public.save_team_model(uuid,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb)'::regprocedure,
    'public.save_work_pattern_exception_lifecycle(uuid,uuid,uuid,text,jsonb)'::regprocedure,
    'public.set_employee_access_state(uuid,uuid,text)'::regprocedure
  ]
  loop
    select replace(pg_get_functiondef(v_signature), chr(13), '')
    into v_definition;
    v_before := v_definition;
    v_definition := replace(
      v_definition,
      'return jsonb_build_object(
    ''runtime_snapshot'',
    public.workspace_runtime_snapshot_for_current_context(p_restaurant_id)
  );',
      'return jsonb_build_object(
    ''ok'', true,
    ''restaurant_id'', p_restaurant_id
  );'
    );
    if v_definition = v_before
        or position('runtime_snapshot' in v_definition) > 0 then
      raise exception 'Mutation result contract drifted for %.', v_signature;
    end if;
    execute v_definition;
  end loop;

  select replace(
    pg_get_functiondef(
      'public.save_absence_lifecycle(uuid,uuid,uuid,text,jsonb)'::regprocedure
    ),
    chr(13),
    ''
  ) into v_definition;
  v_before := v_definition;
  v_definition := regexp_replace(
    v_definition,
    E'  v_result_snapshot\\s+jsonb;\\n',
    '',
    'n'
  );
  v_definition := replace(
    v_definition,
    '  v_result_snapshot := public.build_workspace_runtime_snapshot_for_role(
    p_restaurant_id,
    v_actor_role,
    v_actor_profile_id,
    case when v_actor_role = ''employee'' then v_actor_employee_id else null end
  );
',
    ''
  );
  v_definition := replace(
    v_definition,
    ',
    ''runtime_snapshot'', v_result_snapshot',
    ''
  );
  v_definition := replace(
    v_definition,
    '    ''ok'', true,
    ''absence_id''',
    '    ''ok'', true,
    ''restaurant_id'', p_restaurant_id,
    ''absence_id'''
  );
  if v_definition = v_before
      or position('runtime_snapshot' in v_definition) > 0
      or position('v_result_snapshot' in v_definition) > 0 then
    raise exception 'Absence mutation result contract drifted.';
  end if;
  execute v_definition;
end
$compact_mutation_results$;

drop function public.get_workspace_runtime_snapshot(uuid,date,date);
drop function public.workspace_runtime_snapshot_for_current_context(uuid);
drop function public.build_workspace_runtime_snapshot_for_role(uuid,text,uuid,uuid,date,date);
drop function public.build_workspace_runtime_snapshot(uuid,date,date);
drop function public.build_workspace_runtime_snapshot_v2(uuid,text,uuid,uuid,date,date);
drop function public.build_workspace_runtime_snapshot_core(uuid,text,uuid,uuid,date,date);

revoke all on function public.require_workspace_read_context(uuid)
  from public, anon, authenticated;
revoke all on function public.build_workspace_bootstrap_read_model(uuid,uuid)
  from public, anon, authenticated;
revoke all on function public.build_manager_operations_read_model(uuid,text,date,date)
  from public, anon, authenticated;
revoke all on function public.build_employee_operations_read_model(uuid,uuid,date,date)
  from public, anon, authenticated;
revoke all on function public.build_team_read_model(uuid,text)
  from public, anon, authenticated;
revoke all on function public.build_restaurant_read_model(uuid)
  from public, anon, authenticated;

revoke all on function public.get_workspace_bootstrap(uuid)
  from public, anon, authenticated;
revoke all on function public.get_manager_operations_read_model(uuid,date,date)
  from public, anon, authenticated;
revoke all on function public.get_employee_operations_read_model(uuid,date,date)
  from public, anon, authenticated;
revoke all on function public.get_team_read_model(uuid)
  from public, anon, authenticated;
revoke all on function public.get_restaurant_read_model(uuid)
  from public, anon, authenticated;

grant execute on function public.get_workspace_bootstrap(uuid) to authenticated;
grant execute on function public.get_manager_operations_read_model(uuid,date,date)
  to authenticated;
grant execute on function public.get_employee_operations_read_model(uuid,date,date)
  to authenticated;
grant execute on function public.get_team_read_model(uuid) to authenticated;
grant execute on function public.get_restaurant_read_model(uuid) to authenticated;

commit;
