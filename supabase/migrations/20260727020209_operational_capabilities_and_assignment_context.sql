-- Owners and managers share the operational workspace. Money-bearing fields
-- remain owner-only, and position-to-area relations are available everywhere
-- scheduling needs to choose a sensible default.
begin;

create or replace function public.build_manager_operations_read_model(
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
    'restaurant_settings', coalesce((
      select case
        when p_role = 'owner' then to_jsonb(s)
        else to_jsonb(s) - 'payroll_settings'
      end
      from public.restaurant_settings s
      where s.restaurant_id = r.id
    ), '{}'::jsonb),
    'employees', coalesce((select jsonb_agg(to_jsonb(e) order by e.sort_order, e.display_name) from public.employees e where e.restaurant_id = r.id), '[]'::jsonb),
    'employee_contracts', coalesce((select jsonb_agg(to_jsonb(c)) from public.employee_contracts c where c.restaurant_id = r.id), '[]'::jsonb),
    'employee_legal_profiles', coalesce((select jsonb_agg(to_jsonb(l)) from public.employee_legal_profiles l where l.restaurant_id = r.id), '[]'::jsonb),
    'employee_payroll_profiles', case when p_role = 'owner' then coalesce((select jsonb_agg(to_jsonb(p)) from public.employee_payroll_profiles p where p.restaurant_id = r.id), '[]'::jsonb) else '[]'::jsonb end,
    'job_functions', coalesce((
      select jsonb_agg(
        case when p_role = 'owner' then to_jsonb(j) else to_jsonb(j) - 'estimated_hourly_cost' end
        order by j.sort_order, j.name
      )
      from public.job_functions j
      where j.restaurant_id = r.id
    ), '[]'::jsonb),
    'job_function_areas', coalesce((select jsonb_agg(to_jsonb(link) order by link.job_function_id, link.is_primary desc, link.area_id) from public.job_function_areas link where link.restaurant_id = r.id and link.active), '[]'::jsonb),
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
    'payroll_export_runs', case when p_role = 'owner' then public.payroll_export_run_summaries(p_restaurant_id, p_from_date, p_to_date) else '[]'::jsonb end,
    'work_pattern_exception_events', coalesce((select jsonb_agg(to_jsonb(e) order by e.created_at) from public.work_pattern_exception_events e join public.work_pattern_exceptions x on x.id = e.work_pattern_exception_id and x.restaurant_id = e.restaurant_id where e.restaurant_id = r.id and x.start_date <= p_to_date and x.end_date >= p_from_date), '[]'::jsonb)
  )
  from public.restaurants r
  where r.id = p_restaurant_id
$manager_operations$;

create or replace function public.build_employee_operations_read_model(
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
    'restaurant_settings', coalesce((select to_jsonb(s) - 'payroll_settings' from public.restaurant_settings s where s.restaurant_id = r.id), '{}'::jsonb),
    'employees', coalesce((select jsonb_agg(to_jsonb(e)) from public.employees e where e.restaurant_id = r.id and e.id = p_employee_id), '[]'::jsonb),
    'employee_contracts', coalesce((select jsonb_agg(to_jsonb(c)) from public.employee_contracts c where c.restaurant_id = r.id and c.employee_id = p_employee_id), '[]'::jsonb),
    'job_functions', coalesce((select jsonb_agg((to_jsonb(j) - 'estimated_hourly_cost') order by j.sort_order, j.name) from public.job_functions j where j.restaurant_id = r.id), '[]'::jsonb),
    'job_function_areas', coalesce((select jsonb_agg(to_jsonb(link) order by link.job_function_id, link.is_primary desc, link.area_id) from public.job_function_areas link where link.restaurant_id = r.id and link.active), '[]'::jsonb),
    'employee_job_functions', coalesce((select jsonb_agg(to_jsonb(ej)) from public.employee_job_functions ej where ej.restaurant_id = r.id and ej.employee_id = p_employee_id), '[]'::jsonb),
    'recurring_schedule_slots', coalesce((select jsonb_agg(to_jsonb(rs)) from public.recurring_schedule_slots rs where rs.restaurant_id = r.id and rs.employee_id = p_employee_id), '[]'::jsonb),
    'contract_types', coalesce((select jsonb_agg(to_jsonb(ct) order by ct.sort_order) from public.contract_types ct where ct.restaurant_id = r.id and ct.active), '[]'::jsonb),
    'work_areas', coalesce((select jsonb_agg(to_jsonb(a) order by a.sort_order, a.name) from public.work_areas a where a.restaurant_id = r.id), '[]'::jsonb),
    'services', coalesce((select jsonb_agg(to_jsonb(s) order by s.sort_order) from public.services s where s.restaurant_id = r.id), '[]'::jsonb),
    'absence_types', coalesce((select jsonb_agg(to_jsonb(t) order by t.sort_order) from public.absence_types t where t.restaurant_id = r.id and t.active), '[]'::jsonb),
    'work_weeks', coalesce((select jsonb_agg(to_jsonb(w)) from public.work_weeks w where w.restaurant_id = r.id and w.week_start >= public.week_start_for_date(p_from_date) and w.week_start <= public.week_start_for_date(p_to_date)), '[]'::jsonb),
    'work_week_events', coalesce((
      select jsonb_agg(to_jsonb(e) order by e.created_at)
      from public.work_week_events e
      where e.restaurant_id = r.id
        and e.event_type = 'planning_published'
        and e.week_start >= public.week_start_for_date(p_from_date)
        and e.week_start <= public.week_start_for_date(p_to_date)
        and exists (
          select 1
          from public.planned_shifts p
          join public.work_weeks w on w.restaurant_id = p.restaurant_id and w.week_start = p.week_start
          where p.restaurant_id = r.id
            and p.employee_id = p_employee_id
            and p.week_start = e.week_start
            and w.planning_status = 'published'
            and p.week_start + (p.weekday - 1) between p_from_date and p_to_date
        )
    ), '[]'::jsonb),
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

create or replace function public.build_team_read_model(
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
    'restaurant_settings', coalesce((
      select case when p_role = 'owner' then to_jsonb(s) else to_jsonb(s) - 'payroll_settings' end
      from public.restaurant_settings s where s.restaurant_id = r.id
    ), '{}'::jsonb),
    'restaurant_memberships', coalesce((select jsonb_agg(to_jsonb(m)) from public.restaurant_memberships m where m.restaurant_id = r.id), '[]'::jsonb),
    'employees', coalesce((select jsonb_agg(to_jsonb(e) order by e.sort_order, e.display_name) from public.employees e where e.restaurant_id = r.id), '[]'::jsonb),
    'employee_access', coalesce((select jsonb_agg(to_jsonb(a)) from public.employee_access a where a.restaurant_id = r.id), '[]'::jsonb),
    'employee_invitation_states', public.employee_invitation_states_for_restaurant(r.id),
    'employee_pin_credentials', coalesce((select jsonb_agg(jsonb_build_object('restaurant_id', p.restaurant_id, 'employee_id', p.employee_id, 'pin_status', p.pin_status, 'locked_until', p.locked_until, 'last_used_at', p.last_used_at, 'last_rotated_at', p.last_rotated_at)) from public.employee_pin_credentials p where p.restaurant_id = r.id), '[]'::jsonb),
    'employee_contact_details', coalesce((select jsonb_agg(to_jsonb(c)) from public.employee_contact_details c where c.restaurant_id = r.id), '[]'::jsonb),
    'employee_contracts', coalesce((select jsonb_agg(to_jsonb(c)) from public.employee_contracts c where c.restaurant_id = r.id), '[]'::jsonb),
    'employee_legal_profiles', coalesce((select jsonb_agg(to_jsonb(l)) from public.employee_legal_profiles l where l.restaurant_id = r.id), '[]'::jsonb),
    'employee_payroll_profiles', case when p_role = 'owner' then coalesce((select jsonb_agg(to_jsonb(p)) from public.employee_payroll_profiles p where p.restaurant_id = r.id), '[]'::jsonb) else '[]'::jsonb end,
    'job_functions', coalesce((
      select jsonb_agg(case when p_role = 'owner' then to_jsonb(j) else to_jsonb(j) - 'estimated_hourly_cost' end order by j.sort_order, j.name)
      from public.job_functions j where j.restaurant_id = r.id
    ), '[]'::jsonb),
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

create or replace function public.build_restaurant_read_model(p_restaurant_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $restaurant$
  select jsonb_build_object(
    'restaurant', to_jsonb(r),
    'restaurant_settings', coalesce((
      select case when public.is_owner(r.id) then to_jsonb(s) else to_jsonb(s) - 'payroll_settings' end
      from public.restaurant_settings s where s.restaurant_id = r.id
    ), '{}'::jsonb),
    'restaurant_employment_settings', case
      when public.is_owner_or_manager(r.id) then coalesce((select to_jsonb(s) from public.restaurant_employment_settings s where s.restaurant_id = r.id), '{}'::jsonb)
      else '{}'::jsonb
    end,
    'restaurant_onboarding_state', coalesce((select to_jsonb(o) from public.restaurant_onboarding_state o where o.restaurant_id = r.id), '{}'::jsonb),
    'job_functions', coalesce((
      select jsonb_agg(case when public.is_owner(r.id) then to_jsonb(j) else to_jsonb(j) - 'estimated_hourly_cost' end order by j.sort_order, j.name)
      from public.job_functions j where j.restaurant_id = r.id
    ), '[]'::jsonb),
    'job_function_areas', coalesce((select jsonb_agg(to_jsonb(link) order by link.job_function_id, link.is_primary desc, link.area_id) from public.job_function_areas link where link.restaurant_id = r.id), '[]'::jsonb),
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

-- Let managers persist operational legal identity and contract facts, but keep
-- the payroll profile loop inside the owner-only block.
do $team_capabilities$
declare
  v_oid oid;
  v_definition text;
  v_next text;
begin
  select p.oid into v_oid
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'save_team_model';

  if v_oid is null then
    raise exception 'save_team_model was not found.';
  end if;

  v_definition := pg_get_functiondef(v_oid);
  v_next := replace(
    v_definition,
    E'  if v_owner then\n    for v_item in select value from jsonb_array_elements(coalesce(p_legal_profiles, ''[]'')) loop',
    E'  for v_item in select value from jsonb_array_elements(coalesce(p_legal_profiles, ''[]'')) loop'
  );
  if v_next = v_definition then
    raise exception 'save_team_model legal-profile capability anchor drifted.';
  end if;
  v_definition := v_next;

  v_next := replace(
    v_definition,
    E'    for v_item in select value from jsonb_array_elements(coalesce(p_payroll_profiles, ''[]'')) loop',
    E'    if v_owner then\n      for v_item in select value from jsonb_array_elements(coalesce(p_payroll_profiles, ''[]'')) loop'
  );
  if v_next = v_definition then
    raise exception 'save_team_model payroll capability anchor drifted.';
  end if;
  execute v_next;
end
$team_capabilities$;

-- Managers may edit positions and general settings, but never replace a hidden
-- cost or payroll-settings value with an empty/redacted client value.
do $restaurant_capabilities$
declare
  v_oid oid;
  v_definition text;
  v_next text;
begin
  select p.oid into v_oid
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'save_restaurant_model';

  if v_oid is null then
    raise exception 'save_restaurant_model was not found.';
  end if;

  v_definition := pg_get_functiondef(v_oid);
  v_next := replace(
    v_definition,
    E'  v_employment jsonb := coalesce(p_restaurant->''employment_settings'', ''{}''::jsonb);\n',
    E'  v_employment jsonb := coalesce(p_restaurant->''employment_settings'', ''{}''::jsonb);\n  v_owner boolean;\n'
  );
  if v_next = v_definition then
    raise exception 'save_restaurant_model owner declaration anchor drifted.';
  end if;
  v_definition := v_next;

  v_next := replace(
    v_definition,
    E'  perform 1 from public.require_owner_or_manager_context(p_restaurant_id);\n',
    E'  perform 1 from public.require_owner_or_manager_context(p_restaurant_id);\n  v_owner := public.is_owner(p_restaurant_id);\n'
  );
  if v_next = v_definition then
    raise exception 'save_restaurant_model owner assignment anchor drifted.';
  end if;
  v_definition := v_next;

  v_next := replace(
    v_definition,
    'payroll_settings = excluded.payroll_settings,',
    'payroll_settings = case when v_owner then excluded.payroll_settings else restaurant_settings.payroll_settings end,'
  );
  if v_next = v_definition then
    raise exception 'save_restaurant_model payroll settings anchor drifted.';
  end if;
  v_definition := v_next;

  v_next := replace(
    v_definition,
    'estimated_hourly_cost = excluded.estimated_hourly_cost,',
    'estimated_hourly_cost = case when v_owner then excluded.estimated_hourly_cost else job_functions.estimated_hourly_cost end,'
  );
  if v_next = v_definition then
    raise exception 'save_restaurant_model position cost anchor drifted.';
  end if;
  execute v_next;
end
$restaurant_capabilities$;

-- Logos are operational restaurant identity, so managers can maintain them.
drop policy if exists "owners upload their restaurant logo" on storage.objects;
drop policy if exists "owners replace their restaurant logo" on storage.objects;
drop policy if exists "owners remove their restaurant logo" on storage.objects;
drop policy if exists "operators upload their restaurant logo" on storage.objects;
drop policy if exists "operators replace their restaurant logo" on storage.objects;
drop policy if exists "operators remove their restaurant logo" on storage.objects;

create policy "operators upload their restaurant logo"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'restaurant-logos'
    and public.is_owner_or_manager(((storage.foldername(name))[1])::uuid)
  );

create policy "operators replace their restaurant logo"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'restaurant-logos'
    and public.is_owner_or_manager(((storage.foldername(name))[1])::uuid)
  )
  with check (
    bucket_id = 'restaurant-logos'
    and public.is_owner_or_manager(((storage.foldername(name))[1])::uuid)
  );

create policy "operators remove their restaurant logo"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'restaurant-logos'
    and public.is_owner_or_manager(((storage.foldername(name))[1])::uuid)
  );

create or replace function public.set_restaurant_logo(
  p_restaurant_id uuid,
  p_logo_path text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $set_logo$
begin
  perform 1 from public.require_owner_or_manager_context(p_restaurant_id);

  if nullif(btrim(coalesce(p_logo_path, '')), '') is not null
      and p_logo_path not like p_restaurant_id::text || '/%' then
    raise exception 'Restaurant logo path does not belong to this restaurant.';
  end if;

  update public.restaurants
  set logo_path = nullif(btrim(coalesce(p_logo_path, '')), ''),
      updated_at = now()
  where id = p_restaurant_id;

  if not found then
    raise exception 'Restaurant not found.';
  end if;

  return jsonb_build_object('ok', true);
end
$set_logo$;

-- A catalogue key classifies an area; the same type may appear on multiple
-- floors. Position catalogue entries remain unique inside one restaurant.
drop index if exists public.work_areas_restaurant_catalogue_key_idx;

notify pgrst, 'reload schema';
commit;
