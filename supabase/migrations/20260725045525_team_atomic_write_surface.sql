-- V584: expose one atomic Team write surface to application clients.
-- Component functions remain service-role-only and are called by the SECURITY DEFINER wrapper.

revoke execute on function public.save_team_model(
  uuid, jsonb, jsonb, jsonb, jsonb, jsonb, jsonb, jsonb, jsonb
) from public, anon, authenticated;
grant execute on function public.save_team_model(
  uuid, jsonb, jsonb, jsonb, jsonb, jsonb, jsonb, jsonb, jsonb
) to service_role;

revoke execute on function public.save_employee_employment_terms(uuid, uuid, jsonb)
  from public, anon, authenticated;
grant execute on function public.save_employee_employment_terms(uuid, uuid, jsonb)
  to service_role;

notify pgrst, 'reload schema';
