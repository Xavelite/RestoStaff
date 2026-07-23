-- Trigger execution follows the table write and does not require callers to
-- execute the trigger function directly. Keep this implementation helper out
-- of every API role, including service_role.
revoke all on function public.ensure_workspace_item_code_unique()
  from public, anon, authenticated, service_role;
