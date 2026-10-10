-- Platform administration uses the same authenticated email/password session
-- as the rest of the application. TOTP remains available as an optional
-- account protection, but it is not a separate platform-admin gate.
begin;

set local lock_timeout = '5s';
set local statement_timeout = '2min';
select pg_advisory_xact_lock(
  hashtextextended('restogogo:20261010143000:simplify-platform-admin-access', 0)
);

create or replace function public.require_platform_admin()
returns uuid
language plpgsql
stable
security definer
set search_path = public
as $require_admin$
declare
  v_profile uuid := public.authenticated_profile_id();
begin
  if v_profile is null or not public.is_platform_admin(v_profile) then
    raise exception 'Platform administrator access required.'
      using errcode = '42501', detail = 'PLATFORM_ADMIN_REQUIRED';
  end if;

  return v_profile;
end
$require_admin$;

comment on function public.require_platform_admin() is
  'Requires an authenticated profile on the explicit platform-admin allowlist.';

create or replace function public.active_platform_support_session()
returns table (
  support_session_id uuid,
  admin_profile_id uuid,
  target_profile_id uuid,
  restaurant_id uuid,
  target_role text,
  target_employee_id uuid,
  started_at timestamptz,
  expires_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $active_support$
  select
    session.id,
    session.admin_profile_id,
    session.target_profile_id,
    session.restaurant_id,
    session.target_role,
    session.target_employee_id,
    session.started_at,
    session.expires_at
  from public.platform_admin_support_sessions session
  where session.admin_profile_id = public.authenticated_profile_id()
    and session.auth_session_id = public.current_auth_session_id()
    and session.ended_at is null
    and session.expires_at > now()
    and public.is_platform_admin(session.admin_profile_id)
  order by session.started_at desc
  limit 1
$active_support$;

revoke all on function public.require_platform_admin()
  from public, anon, authenticated;
revoke all on function public.active_platform_support_session()
  from public, anon, authenticated;

notify pgrst, 'reload schema';
commit;
