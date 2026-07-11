-- Restore the runtime contract for private workspace broadcasts and align the
-- notification catalog with current product terminology. Broadcast messages
-- are refresh hints only; application writes remain authoritative RPC calls.

begin;

alter table realtime.messages enable row level security;

drop policy if exists "workspace members can receive broadcasts" on realtime.messages;
create policy "workspace members can receive broadcasts"
on realtime.messages
for select
to authenticated
using (
  realtime.messages.extension = 'broadcast'
  and case
    when (select realtime.topic()) ~ '^workspace:[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      then public.is_restaurant_member(substring((select realtime.topic()) from 11)::uuid)
    else false
  end
);

drop policy if exists "workspace members can send broadcasts" on realtime.messages;
create policy "workspace members can send broadcasts"
on realtime.messages
for insert
to authenticated
with check (
  realtime.messages.extension = 'broadcast'
  and case
    when (select realtime.topic()) ~ '^workspace:[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      then public.is_restaurant_member(substring((select realtime.topic()) from 11)::uuid)
    else false
  end
);

update public.notification_types
set
  label = case code
    when 'employee_unavailable_on_planned_shift' then 'Employee unavailable on scheduled shift'
    when 'published_planning_changed' then 'Published schedule changed'
    when 'planning_published' then 'New schedule published'
    else label
  end,
  description = case code
    when 'employee_unavailable_on_planned_shift' then 'An employee is unavailable for a scheduled shift.'
    when 'published_planning_changed' then 'A published schedule was changed.'
    when 'planning_published' then 'A new schedule was published.'
    else description
  end,
  default_target_module = case code
    when 'absence_request_submitted' then 'team'
    when 'employee_unavailable_on_planned_shift' then 'schedule'
    when 'employee_forgot_badge_out' then 'timesheet'
    when 'employee_badged_late' then 'timesheet'
    when 'employee_no_show' then 'timesheet'
    when 'worked_during_approved_absence' then 'timesheet'
    when 'employee_invite_accepted' then 'team'
    when 'employee_availability_updated' then 'schedule'
    when 'published_planning_changed' then 'schedule'
    when 'payroll_export_created' then 'timesheet'
    when 'planning_published' then 'my-service'
    when 'absence_request_decided' then 'my-time'
    when 'own_forgot_badge_out' then 'badge-terminal'
    when 'shift_soon' then 'my-service'
    when 'shift_changed_after_publication' then 'my-service'
    else default_target_module
  end,
  default_in_app_enabled = case
    when code = 'employee_availability_updated' then true
    else default_in_app_enabled
  end,
  sort_order = case
    when code = 'employee_availability_updated' then 80
    else sort_order
  end,
  updated_at = now()
where code in (
  'absence_request_submitted',
  'employee_unavailable_on_planned_shift',
  'employee_forgot_badge_out',
  'employee_badged_late',
  'employee_no_show',
  'worked_during_approved_absence',
  'employee_invite_accepted',
  'employee_availability_updated',
  'published_planning_changed',
  'payroll_export_created',
  'planning_published',
  'absence_request_decided',
  'own_forgot_badge_out',
  'shift_soon',
  'shift_changed_after_publication'
);

commit;
