-- Keep the catalog label aligned with the submitted-availability event that
-- actually produces this manager notification.

begin;

update public.notification_types
set
  label = 'Employee submitted availability',
  description = 'An employee submitted availability for a future week.',
  updated_at = now()
where code = 'employee_availability_updated';

commit;
