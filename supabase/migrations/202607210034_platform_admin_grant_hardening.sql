-- Platform administration is authenticated-only at the SQL grant boundary;
-- every RPC still performs its own platform-admin entitlement check.
begin;

revoke all on function public.am_i_platform_admin() from public, anon, authenticated;
revoke all on function public.claim_platform_admin() from public, anon, authenticated;
revoke all on function public.platform_admin_access_state() from public, anon, authenticated;
revoke all on function public.admin_dashboard() from public, anon, authenticated;
revoke all on function public.admin_set_restaurant_active(uuid, boolean) from public, anon, authenticated;
revoke all on function public.admin_delete_restaurant(uuid) from public, anon, authenticated;
revoke all on function public.admin_set_user_suspended(uuid, boolean) from public, anon, authenticated;
revoke all on function public.admin_delete_user(uuid) from public, anon, authenticated;

grant execute on function public.am_i_platform_admin() to authenticated;
grant execute on function public.claim_platform_admin() to authenticated;
grant execute on function public.platform_admin_access_state() to authenticated;
grant execute on function public.admin_dashboard() to authenticated;
grant execute on function public.admin_set_restaurant_active(uuid, boolean) to authenticated;
grant execute on function public.admin_delete_restaurant(uuid) to authenticated;
grant execute on function public.admin_set_user_suspended(uuid, boolean) to authenticated;
grant execute on function public.admin_delete_user(uuid) to authenticated;

commit;
