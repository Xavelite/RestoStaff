begin;

-- Keep reserved catalog codes for forward compatibility, but do not advertise
-- notifications that have no derived product implementation yet.
update public.notification_types
set active = false
where code in (
  'published_planning_changed',
  'payroll_export_created',
  'shift_changed_after_publication'
);

commit;
