-- Preconditions:
-- - 202606230031_notification_policy_function_grants.sql has been applied.
-- - Notification N1 uses derived notification items and notification_receipts,
--   not a stored public.notifications table.
-- Rollback strategy:
-- - Restore the previous build_employee_operations_read_model definition from
--   202606210023_focused_workspace_read_models.sql if employee planning
--   publish notifications are removed.
-- Product contract:
-- - Employee submitted availability is a manager notification and is on by
--   default for the MVP.
-- - Employee planning-published notifications derive from work_week_events,
--   not just the current work_weeks state.
-- - The employee read model exposes only planning_published week events for
--   weeks where that employee has a published shift in the requested window.

begin;

insert into public.notification_types (
  code,
  audience,
  label,
  description,
  default_action,
  default_target_module,
  default_in_app_enabled,
  default_push_enabled,
  sort_order,
  active
)
values (
  'employee_availability_updated',
  'manager',
  'Employee submitted availability',
  'An employee submitted availability for a future week.',
  'route',
  'planning',
  true,
  false,
  80,
  true
)
on conflict (code) do update set
  audience = excluded.audience,
  label = excluded.label,
  description = excluded.description,
  default_action = excluded.default_action,
  default_target_module = excluded.default_target_module,
  default_in_app_enabled = excluded.default_in_app_enabled,
  default_push_enabled = excluded.default_push_enabled,
  sort_order = excluded.sort_order,
  active = true,
  updated_at = now();

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
          join public.work_weeks w
            on w.restaurant_id = p.restaurant_id
           and w.week_start = p.week_start
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

commit;
