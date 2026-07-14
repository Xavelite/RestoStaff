-- Global catalog rows. Restaurant-scoped contract, absence, service, area,
-- position, and coverage rows are created by setup_owner_workspace.

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
values
  ('absence_request_submitted', 'manager', 'Absence request submitted', 'An employee submitted an absence request.', 'popup', 'team', true, false, 10, true),
  ('employee_unavailable_on_planned_shift', 'manager', 'Employee unavailable on scheduled shift', 'An employee is unavailable for a scheduled shift.', 'route', 'schedule', true, false, 20, true),
  ('employee_forgot_badge_out', 'manager', 'Employee forgot to badge out', 'An employee has an open or incomplete time entry.', 'popup', 'timesheet', true, false, 30, true),
  ('employee_badged_late', 'manager', 'Employee badged late', 'An employee badged in later than the scheduled shift start.', 'route', 'timesheet', true, false, 40, true),
  ('employee_no_show', 'manager', 'Employee did not show up', 'A scheduled employee has no matching worked time.', 'route', 'timesheet', true, false, 50, true),
  ('worked_during_approved_absence', 'manager', 'Worked during approved absence', 'Worked time overlaps an approved absence.', 'route', 'timesheet', true, false, 60, true),
  ('employee_invite_accepted', 'manager', 'Employee accepted invite', 'An invited employee accepted access to the restaurant.', 'route', 'team', true, false, 70, true),
  ('employee_availability_updated', 'manager', 'Employee submitted availability', 'An employee submitted availability for a future week.', 'route', 'schedule', true, false, 80, true),
  ('published_planning_changed', 'manager', 'Published schedule changed', 'A published schedule was changed.', 'route', 'schedule', false, false, 120, false),
  ('payroll_export_created', 'manager', 'Payroll export created', 'A payroll export was created.', 'route', 'timesheet', false, false, 130, false),
  ('planning_published', 'employee', 'New schedule published', 'A new schedule was published.', 'route', 'my-service', true, false, 210, true),
  ('absence_request_decided', 'employee', 'Absence request approved or refused', 'A manager approved or refused an absence request.', 'popup', 'my-time', true, false, 220, true),
  ('own_forgot_badge_out', 'employee', 'Forgot to badge out', 'Your time entry is missing a badge-out time.', 'popup', 'badge-terminal', true, false, 230, true),
  ('shift_soon', 'employee', 'Shift soon', 'You have an upcoming shift.', 'popup', 'my-service', true, false, 240, true),
  ('shift_changed_after_publication', 'employee', 'Shift changed after publication', 'A published shift was changed.', 'route', 'my-service', false, false, 260, false)
on conflict (code) do update set
  audience = excluded.audience,
  label = excluded.label,
  description = excluded.description,
  default_action = excluded.default_action,
  default_target_module = excluded.default_target_module,
  default_in_app_enabled = excluded.default_in_app_enabled,
  default_push_enabled = excluded.default_push_enabled,
  sort_order = excluded.sort_order,
  active = excluded.active,
  updated_at = now();
