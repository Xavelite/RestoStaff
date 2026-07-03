-- Reconcile databases that applied the original migration 008, where schedule
-- exceptions were added through a v3 wrapper. Fresh databases already receive
-- this canonical v2 body from 008; this migration is intentionally safe there.

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
as $snapshot_v2$
  select jsonb_build_object(
    'restaurant', to_jsonb(r),
    'restaurant_settings', coalesce((select to_jsonb(rs) from public.restaurant_settings rs where rs.restaurant_id = r.id), '{}'::jsonb),
    'restaurant_onboarding_state', coalesce((select to_jsonb(os) from public.restaurant_onboarding_state os where os.restaurant_id = r.id), '{}'::jsonb),
    'profiles', '[]'::jsonb,
    'restaurant_memberships', case when p_role in ('owner','manager') then coalesce((select jsonb_agg(to_jsonb(m)) from public.restaurant_memberships m where m.restaurant_id = r.id), '[]'::jsonb) else '[]'::jsonb end,
    'employees', coalesce((select jsonb_agg(to_jsonb(e) order by e.sort_order, e.display_name) from public.employees e where e.restaurant_id = r.id and (p_role in ('owner','manager') or e.id = p_employee_id)), '[]'::jsonb),
    'employee_access', case when p_role in ('owner','manager') then coalesce((select jsonb_agg(to_jsonb(ea)) from public.employee_access ea where ea.restaurant_id = r.id), '[]'::jsonb) else '[]'::jsonb end,
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
    'employee_contact_details', coalesce((select jsonb_agg(to_jsonb(c)) from public.employee_contact_details c where c.restaurant_id = r.id and (p_role in ('owner','manager') or c.employee_id = p_employee_id)), '[]'::jsonb),
    'employee_contracts', coalesce((select jsonb_agg(to_jsonb(c)) from public.employee_contracts c where c.restaurant_id = r.id and (p_role in ('owner','manager') or c.employee_id = p_employee_id)), '[]'::jsonb),
    'employee_legal_profiles', case when p_role = 'owner' then coalesce((select jsonb_agg(to_jsonb(l)) from public.employee_legal_profiles l where l.restaurant_id = r.id), '[]'::jsonb) else '[]'::jsonb end,
    'employee_payroll_profiles', case when p_role = 'owner' then coalesce((select jsonb_agg(to_jsonb(p)) from public.employee_payroll_profiles p where p.restaurant_id = r.id), '[]'::jsonb) else '[]'::jsonb end,
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
    'absence_events', case when p_role in ('owner','manager') then coalesce((select jsonb_agg(to_jsonb(ae)) from public.absence_events ae where ae.restaurant_id = r.id), '[]'::jsonb) else '[]'::jsonb end,
    'schedule_exceptions', coalesce((
      select jsonb_agg(to_jsonb(se) order by se.start_date, se.created_at)
      from public.schedule_exceptions se
      where se.restaurant_id = r.id
        and (p_role in ('owner','manager') or se.employee_id = p_employee_id)
        and (p_from_date is null or se.end_date >= p_from_date)
        and (p_to_date is null or se.start_date <= p_to_date)
    ), '[]'::jsonb),
    'schedule_exception_events',
      case when p_role in ('owner','manager') then coalesce((
        select jsonb_agg(to_jsonb(see) order by see.created_at desc)
        from public.schedule_exception_events see
        where see.restaurant_id = r.id
      ), '[]'::jsonb) else '[]'::jsonb end
  )
  from public.restaurants r
  where r.id = p_restaurant_id
$snapshot_v2$;

revoke all on function public.build_workspace_runtime_snapshot_v2(
  uuid, text, uuid, uuid, date, date
) from public, anon, authenticated;
grant execute on function public.build_workspace_runtime_snapshot_v2(
  uuid, text, uuid, uuid, date, date
) to service_role;

-- Recreate only functions that still reference the deployed v3 wrapper. Using
-- their catalog definitions preserves the exact input parameter names and grants.
do $repoint_snapshot_callers$
declare
  v_function record;
  v_definition text;
begin
  for v_function in
    select p.oid
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in (
        'build_workspace_runtime_snapshot',
        'build_workspace_runtime_snapshot_for_role',
        'get_workspace_runtime_snapshot',
        'workspace_runtime_snapshot_for_current_context'
      )
  loop
    v_definition := pg_get_functiondef(v_function.oid);
    if position('build_workspace_runtime_snapshot_v3' in v_definition) > 0 then
      execute replace(
        v_definition,
        'build_workspace_runtime_snapshot_v3',
        'build_workspace_runtime_snapshot_v2'
      );
    end if;
  end loop;
end
$repoint_snapshot_callers$;

drop function if exists public.build_workspace_runtime_snapshot_v3(
  uuid, text, uuid, uuid, date, date
);
