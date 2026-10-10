-- Platform support resolves ordinary restaurant calls through the target
-- account while retaining the real operator for exit and audit.
begin;

create temp table support_context(key text primary key, value text not null) on commit drop;
grant select on support_context to authenticated;

do $fixtures$
declare
  v_admin_auth uuid := gen_random_uuid();
  v_owner_auth uuid := gen_random_uuid();
  v_admin_profile uuid;
  v_owner_profile uuid;
  v_restaurant uuid := gen_random_uuid();
  v_auth_session uuid := gen_random_uuid();
begin
  insert into auth.users(id, email) values
    (v_admin_auth, 'support-admin-' || v_admin_auth || '@example.test'),
    (v_owner_auth, 'support-owner-' || v_owner_auth || '@example.test');

  insert into public.profiles(auth_user_id, first_name, last_name, email)
  values (v_admin_auth, 'Support', 'Admin', 'support-admin-' || v_admin_auth || '@example.test')
  returning id into v_admin_profile;

  insert into public.profiles(auth_user_id, first_name, last_name, email)
  values (v_owner_auth, 'Support', 'Owner', 'support-owner-' || v_owner_auth || '@example.test')
  returning id into v_owner_profile;

  insert into public.platform_admins(profile_id, note)
  values (v_admin_profile, 'Support-session contract fixture');

  insert into public.restaurants(id, workspace_slug, name, owner_profile_id)
  values (
    v_restaurant,
    'support-' || replace(v_restaurant::text, '-', ''),
    'Support session fixture',
    v_owner_profile
  );
  insert into public.restaurant_settings(restaurant_id, timezone)
  values (v_restaurant, 'Europe/Brussels');
  insert into public.restaurant_memberships(restaurant_id, profile_id, role, status)
  values (v_restaurant, v_owner_profile, 'owner', 'active');

  insert into support_context values
    ('admin_auth', v_admin_auth::text),
    ('admin_profile', v_admin_profile::text),
    ('owner_profile', v_owner_profile::text),
    ('restaurant', v_restaurant::text),
    ('auth_session', v_auth_session::text);
end
$fixtures$;

select set_config(
  'request.jwt.claims',
  jsonb_build_object(
    'sub', (select value from support_context where key = 'admin_auth'),
    'session_id', (select value from support_context where key = 'auth_session')
  )::text,
  true
);
set local role authenticated;

select public.start_platform_support_session(
  (select value::uuid from support_context where key = 'restaurant'),
  (select value::uuid from support_context where key = 'owner_profile')
);

do $delegated_identity$
begin
  if public.current_profile_id() <>
      (select value::uuid from support_context where key = 'owner_profile') then
    raise exception 'Support session did not resolve the target profile';
  end if;
  if not public.is_owner(
    (select value::uuid from support_context where key = 'restaurant')
  ) then
    raise exception 'Support session did not inherit the target owner role';
  end if;
  if not exists (
    select 1
    from public.get_current_memberships() membership
    where membership.restaurant_id =
      (select value::uuid from support_context where key = 'restaurant')
      and membership.role = 'owner'
  ) then
    raise exception 'Support session did not expose the target membership';
  end if;
end
$delegated_identity$;

select public.end_platform_support_session();

do $restored_identity$
begin
  if public.current_profile_id() <>
      (select value::uuid from support_context where key = 'admin_profile') then
    raise exception 'Ending support did not restore the real operator';
  end if;
end
$restored_identity$;

reset role;

do $audit$
begin
  if not exists (
    select 1 from public.platform_admin_events
    where action = 'support_session_started'
      and target_id = (select value::uuid from support_context where key = 'owner_profile')
  ) then
    raise exception 'Support-session start was not audited';
  end if;
  if not exists (
    select 1 from public.platform_admin_events
    where action = 'support_session_ended'
      and target_id = (select value::uuid from support_context where key = 'owner_profile')
  ) then
    raise exception 'Support-session end was not audited';
  end if;
end
$audit$;

rollback;
