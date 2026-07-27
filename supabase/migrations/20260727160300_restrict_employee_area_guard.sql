-- Trigger helpers execute through their owning table mutations and must not
-- remain directly callable, including by the service role.
begin;

revoke execute on function public.guard_employee_position_default_area()
  from service_role;

commit;
