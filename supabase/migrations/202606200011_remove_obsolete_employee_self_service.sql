-- The canonical employee mutation is save_employee_availability plus the
-- audited absence/schedule-exception lifecycle RPCs. Remove the superseded
-- mixed mutation so future clients cannot bypass the explicit action model.

revoke all on function public.save_employee_self_service(
  uuid, uuid, jsonb, jsonb, boolean
) from public, anon, authenticated;

drop function public.save_employee_self_service(
  uuid, uuid, jsonb, jsonb, boolean
);
