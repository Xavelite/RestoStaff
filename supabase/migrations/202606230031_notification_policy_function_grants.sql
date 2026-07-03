-- Preconditions:
-- - 202606230030_notification_receipts_foundation.sql has been applied.
-- - Notification RLS policies depend on the existing public.current_profile_id()
--   and public.is_restaurant_member(uuid) helper functions.
-- Rollback strategy:
-- - Do not revoke these grants while notification_preferences or
--   notification_receipts RLS policies depend on these helpers.
-- Product contract:
-- - Keep notification table grants narrow.
-- - Do not grant broad SELECT on profiles or restaurant_memberships.
-- - Allow authenticated users to execute only the membership/profile helper
--   functions required for their own notification settings and receipts.

begin;

grant execute on function public.current_profile_id() to authenticated;
grant execute on function public.is_restaurant_member(uuid) to authenticated;

commit;
