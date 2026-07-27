-- Trigger helpers execute through their owning trigger and are never an RPC
-- surface, including for service-role maintenance clients.
revoke all on function public.apply_employee_archive_side_effects()
  from public, anon, authenticated, service_role;
