begin;

set local lock_timeout = '5s';
set local statement_timeout = '2min';
select pg_advisory_xact_lock(
  hashtextextended('restogogo:20260729234700:platform-admin-mfa', 0)
);

create or replace function public.require_platform_admin()
returns uuid
language plpgsql
stable
security definer
set search_path = public
as $require_admin$
declare
  v_profile uuid := public.current_profile_id();
begin
  if v_profile is null or not public.is_platform_admin(v_profile) then
    raise exception 'Platform administrator access required.'
      using errcode = '42501', detail = 'PLATFORM_ADMIN_REQUIRED';
  end if;

  if coalesce(auth.jwt()->>'aal', 'aal1') <> 'aal2' then
    raise exception 'Two-step verification is required for platform administration.'
      using errcode = '42501',
            detail = 'MFA_REQUIRED',
            hint = 'Open Account settings and verify an authenticator code.';
  end if;

  return v_profile;
end
$require_admin$;

revoke all on function public.require_platform_admin()
  from public, anon, authenticated;

comment on function public.require_platform_admin() is
  'Central platform-admin allowlist and AAL2 session gate used by every administrative RPC.';

notify pgrst, 'reload schema';
commit;
