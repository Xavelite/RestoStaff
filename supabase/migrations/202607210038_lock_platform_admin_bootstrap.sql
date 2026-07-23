-- Platform administration is provisioned explicitly by the deployment
-- operator. Restaurant ownership must never grant cross-tenant authority.
begin;

revoke all on function public.claim_platform_admin() from public, anon, authenticated, service_role;
drop function public.claim_platform_admin();

revoke all on function public.platform_admin_access_state() from public, anon, authenticated, service_role;
drop function public.platform_admin_access_state();

commit;

