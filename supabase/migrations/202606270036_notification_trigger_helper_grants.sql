-- Notification trigger-helper grant closure.
--
-- Preconditions:
-- - 202606230030_notification_receipts_foundation.sql has been applied.
-- - Notification tables already use the set_notification_updated_at() trigger.
-- Rollback strategy:
-- - None expected. Browser/service clients never need to call this trigger
--   helper directly; table triggers continue to execute it.
-- Product contract:
-- - Notification preferences/receipts are the only intentional direct RLS
--   table-write surface.
-- - Trigger helpers are never browser-callable routines.

begin;

revoke all on function public.set_notification_updated_at()
  from public, anon, authenticated, service_role;

do $notification_trigger_grants$
begin
  if has_function_privilege('public', 'public.set_notification_updated_at()', 'EXECUTE')
     or has_function_privilege('anon', 'public.set_notification_updated_at()', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.set_notification_updated_at()', 'EXECUTE')
     or has_function_privilege('service_role', 'public.set_notification_updated_at()', 'EXECUTE') then
    raise exception 'Notification trigger helper must not be directly executable.';
  end if;
end
$notification_trigger_grants$;

commit;
