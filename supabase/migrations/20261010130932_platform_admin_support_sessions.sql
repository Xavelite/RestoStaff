-- A platform administrator may temporarily work through the exact permissions
-- of an existing restaurant account without taking over that person's Auth
-- session or learning their password. The delegation is bound to the admin's
-- current Supabase Auth session, requires AAL2, expires automatically, and is
-- visible in the immutable platform-admin event stream.
begin;

set local lock_timeout = '5s';
set local statement_timeout = '2min';
select pg_advisory_xact_lock(
  hashtextextended('restogogo:20261010130932:platform-admin-support-sessions', 0)
);

create table public.platform_admin_support_sessions (
  id uuid primary key default gen_random_uuid(),
  admin_profile_id uuid not null references public.profiles(id) on delete cascade,
  auth_session_id uuid not null,
  target_profile_id uuid not null references public.profiles(id) on delete cascade,
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  target_role text not null check (target_role in ('owner', 'manager', 'employee')),
  target_employee_id uuid,
  started_at timestamptz not null default now(),
  expires_at timestamptz not null,
  ended_at timestamptz,
  end_reason text,
  check (target_profile_id <> admin_profile_id),
  check (expires_at > started_at)
);

create unique index platform_admin_support_sessions_one_active_per_auth_session
  on public.platform_admin_support_sessions (admin_profile_id, auth_session_id)
  where ended_at is null;

create index platform_admin_support_sessions_active_lookup
  on public.platform_admin_support_sessions (admin_profile_id, auth_session_id, expires_at desc)
  where ended_at is null;

alter table public.platform_admin_support_sessions enable row level security;
revoke all on table public.platform_admin_support_sessions from public, anon, authenticated;

comment on table public.platform_admin_support_sessions is
  'Short-lived, AAL2 platform support delegations. No direct table access; audited RPCs own the lifecycle.';

-- The real signed-in profile never changes. Operational helpers may resolve a
-- separate effective profile while a support session is active.
create or replace function public.authenticated_profile_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $authenticated_profile$
  select p.id
  from public.profiles p
  where p.auth_user_id = auth.uid()
  limit 1
$authenticated_profile$;

create or replace function public.current_auth_session_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $auth_session$
  select nullif(auth.jwt()->>'session_id', '')::uuid
$auth_session$;

revoke all on function public.authenticated_profile_id() from public, anon, authenticated;
revoke all on function public.current_auth_session_id() from public, anon, authenticated;

-- Platform administration must always authorize the real operator, even while
-- restaurant APIs are resolving the delegated profile.
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

  if coalesce(auth.jwt()->>'aal', 'aal1') <> 'aal2' then
    raise exception 'Two-step verification is required for platform administration.'
      using errcode = '42501',
            detail = 'MFA_REQUIRED',
            hint = 'Open Account settings and verify an authenticator code.';
  end if;

  return v_profile;
end
$require_admin$;

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
    and coalesce(auth.jwt()->>'aal', 'aal1') = 'aal2'
    and public.is_platform_admin(session.admin_profile_id)
  order by session.started_at desc
  limit 1
$active_support$;

revoke all on function public.active_platform_support_session()
  from public, anon, authenticated;

create or replace function public.current_profile_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $current_profile$
  select coalesce(
    (
      select session.target_profile_id
      from public.active_platform_support_session() session
      limit 1
    ),
    public.authenticated_profile_id()
  )
$current_profile$;

comment on function public.current_profile_id() is
  'Returns the effective profile for normal operations: the signed-in profile, or an active AAL2 platform-support target.';

-- This check intentionally ignores the effective profile so the platform-admin
-- entry point and support-session exit remain available to the operator.
create or replace function public.am_i_platform_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $am_i_admin$
  select public.is_platform_admin(public.authenticated_profile_id())
$am_i_admin$;

create or replace function public.start_platform_support_session(
  p_restaurant_id uuid,
  p_target_profile_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $start_support$
declare
  v_admin_profile_id uuid := public.require_platform_admin();
  v_auth_session_id uuid := public.current_auth_session_id();
  v_target record;
  v_support_session public.platform_admin_support_sessions%rowtype;
begin
  if p_restaurant_id is null or p_target_profile_id is null then
    raise exception 'Restaurant and user are required.' using errcode = '22023';
  end if;
  if v_auth_session_id is null then
    raise exception 'A current Auth session is required.' using errcode = '42501';
  end if;
  if p_target_profile_id = v_admin_profile_id then
    raise exception 'Choose another account.' using errcode = '22023';
  end if;
  if public.is_platform_admin(p_target_profile_id) then
    raise exception 'Platform administrator accounts cannot be support targets.' using errcode = '22023';
  end if;

  select
    profile.id as profile_id,
    profile.email::text as email,
    coalesce(
      nullif(btrim(coalesce(profile.first_name, '') || ' ' || coalesce(profile.last_name, '')), ''),
      profile.email::text
    ) as display_name,
    membership.role::text as role,
    employee_access.employee_id,
    restaurant.name as restaurant_name
  into v_target
  from public.profiles profile
  join auth.users auth_user
    on auth_user.id = profile.auth_user_id
   and coalesce(auth_user.banned_until, '-infinity'::timestamptz) <= now()
  join public.restaurant_memberships membership
    on membership.profile_id = profile.id
   and membership.restaurant_id = p_restaurant_id
   and membership.status = 'active'
  join public.restaurants restaurant
    on restaurant.id = membership.restaurant_id
   and restaurant.active
  left join public.employee_access employee_access
    on employee_access.restaurant_id = membership.restaurant_id
   and employee_access.profile_id = membership.profile_id
   and employee_access.access_status = 'active'
  where profile.id = p_target_profile_id
    and membership.role in ('owner', 'manager', 'employee')
  limit 1;

  if v_target.profile_id is null then
    raise exception 'That account does not have active access to this restaurant.'
      using errcode = '42501';
  end if;
  if v_target.role = 'employee' and v_target.employee_id is null then
    raise exception 'That employee account is not linked to an active employee.'
      using errcode = '22023';
  end if;

  update public.platform_admin_support_sessions
  set ended_at = now(), end_reason = 'replaced'
  where admin_profile_id = v_admin_profile_id
    and auth_session_id = v_auth_session_id
    and ended_at is null;

  insert into public.platform_admin_support_sessions (
    admin_profile_id,
    auth_session_id,
    target_profile_id,
    restaurant_id,
    target_role,
    target_employee_id,
    expires_at
  ) values (
    v_admin_profile_id,
    v_auth_session_id,
    v_target.profile_id,
    p_restaurant_id,
    v_target.role,
    v_target.employee_id,
    now() + interval '2 hours'
  )
  returning * into v_support_session;

  insert into public.platform_admin_events (
    admin_profile_id,
    action,
    target_type,
    target_id,
    detail
  ) values (
    v_admin_profile_id,
    'support_session_started',
    'user',
    v_target.profile_id,
    jsonb_build_object(
      'support_session_id', v_support_session.id,
      'restaurant_id', p_restaurant_id,
      'restaurant_name', v_target.restaurant_name,
      'target_email', v_target.email,
      'target_role', v_target.role,
      'expires_at', v_support_session.expires_at
    )
  );

  return jsonb_build_object(
    'id', v_support_session.id,
    'target_profile_id', v_target.profile_id,
    'restaurant_id', p_restaurant_id,
    'restaurant_name', v_target.restaurant_name,
    'role', v_target.role,
    'employee_id', v_target.employee_id,
    'display_name', v_target.display_name,
    'email', v_target.email,
    'started_at', v_support_session.started_at,
    'expires_at', v_support_session.expires_at
  );
end
$start_support$;

create or replace function public.get_active_platform_support_session()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $get_support$
declare
  v_operator uuid := public.authenticated_profile_id();
  v_support record;
begin
  if v_operator is null or not public.is_platform_admin(v_operator) then
    return null;
  end if;

  select
    session.support_session_id as id,
    session.target_profile_id,
    session.restaurant_id,
    restaurant.name as restaurant_name,
    session.target_role as role,
    session.target_employee_id as employee_id,
    coalesce(
      nullif(btrim(coalesce(profile.first_name, '') || ' ' || coalesce(profile.last_name, '')), ''),
      profile.email::text
    ) as display_name,
    profile.email::text as email,
    session.started_at,
    session.expires_at
  into v_support
  from public.active_platform_support_session() session
  join public.profiles profile on profile.id = session.target_profile_id
  join public.restaurants restaurant on restaurant.id = session.restaurant_id
  limit 1;

  if v_support.id is null then
    return null;
  end if;

  return jsonb_build_object(
    'id', v_support.id,
    'target_profile_id', v_support.target_profile_id,
    'restaurant_id', v_support.restaurant_id,
    'restaurant_name', v_support.restaurant_name,
    'role', v_support.role,
    'employee_id', v_support.employee_id,
    'display_name', v_support.display_name,
    'email', v_support.email,
    'started_at', v_support.started_at,
    'expires_at', v_support.expires_at
  );
end
$get_support$;

create or replace function public.end_platform_support_session()
returns jsonb
language plpgsql
security definer
set search_path = public
as $end_support$
declare
  v_admin_profile_id uuid := public.authenticated_profile_id();
  v_auth_session_id uuid := public.current_auth_session_id();
  v_support public.platform_admin_support_sessions%rowtype;
begin
  if v_admin_profile_id is null
      or not public.is_platform_admin(v_admin_profile_id)
      or v_auth_session_id is null then
    raise exception 'Platform administrator access required.' using errcode = '42501';
  end if;

  select *
  into v_support
  from public.platform_admin_support_sessions session
  where session.admin_profile_id = v_admin_profile_id
    and session.auth_session_id = v_auth_session_id
    and session.ended_at is null
  order by session.started_at desc
  limit 1
  for update;

  if v_support.id is null then
    return jsonb_build_object('ok', true, 'ended', false);
  end if;

  update public.platform_admin_support_sessions
  set ended_at = now(), end_reason = 'operator_exit'
  where id = v_support.id;

  insert into public.platform_admin_events (
    admin_profile_id,
    action,
    target_type,
    target_id,
    detail
  ) values (
    v_admin_profile_id,
    'support_session_ended',
    'user',
    v_support.target_profile_id,
    jsonb_build_object(
      'support_session_id', v_support.id,
      'restaurant_id', v_support.restaurant_id,
      'target_role', v_support.target_role,
      'started_at', v_support.started_at,
      'ended_at', now()
    )
  );

  return jsonb_build_object('ok', true, 'ended', true);
end
$end_support$;

revoke all on function public.start_platform_support_session(uuid, uuid)
  from public, anon, authenticated;
revoke all on function public.get_active_platform_support_session()
  from public, anon, authenticated;
revoke all on function public.end_platform_support_session()
  from public, anon, authenticated;

grant execute on function public.start_platform_support_session(uuid, uuid) to authenticated;
grant execute on function public.get_active_platform_support_session() to authenticated;
grant execute on function public.end_platform_support_session() to authenticated;

-- Standard app reads now resolve memberships through the effective profile.
-- Outside a support session this is behaviorally identical to the old query.
create or replace function public.get_current_memberships()
returns table (
  restaurant_id uuid,
  workspace_slug text,
  restaurant_name text,
  role text,
  employee_id uuid,
  status text
)
language sql
stable
security definer
set search_path = public
as $memberships$
  select
    restaurant.id,
    restaurant.workspace_slug,
    restaurant.name,
    membership.role::text,
    employee_access.employee_id,
    membership.status::text
  from public.restaurant_memberships membership
  join public.restaurants restaurant
    on restaurant.id = membership.restaurant_id
  left join public.employee_access employee_access
    on employee_access.restaurant_id = membership.restaurant_id
   and employee_access.profile_id = membership.profile_id
   and employee_access.access_status = 'active'
  where membership.profile_id = public.current_profile_id()
    and membership.status = 'active'
    and restaurant.active
  order by restaurant.name asc
$memberships$;

create or replace function public.is_owner(target_restaurant_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $is_owner$
  select exists (
    select 1
    from public.restaurant_memberships membership
    join public.restaurants restaurant
      on restaurant.id = membership.restaurant_id
     and restaurant.active
    where membership.restaurant_id = target_restaurant_id
      and membership.profile_id = public.current_profile_id()
      and membership.role = 'owner'
      and membership.status = 'active'
  )
$is_owner$;

-- Storage policies need the same effective identity as database mutations or
-- a support owner could create a document record but not upload its object.
create or replace function public.document_storage_object_access(
  p_object_path text,
  p_operation text,
  p_size_bytes bigint default null,
  p_mime_type text default null
)
returns boolean
language plpgsql
stable
security definer
set search_path = public, storage
as $document_access$
declare
  v_document public.restaurant_documents%rowtype;
  v_profile_id uuid := public.current_profile_id();
  v_role text;
begin
  if p_operation not in ('read', 'upload', 'delete')
      or auth.uid() is null
      or v_profile_id is null then
    return false;
  end if;

  select *
  into v_document
  from public.restaurant_documents document
  where document.object_path = p_object_path
  limit 1;

  if not found then
    return false;
  end if;

  select membership.role::text
  into v_role
  from public.restaurant_memberships membership
  join public.restaurants restaurant
    on restaurant.id = membership.restaurant_id
   and restaurant.active
  where membership.restaurant_id = v_document.restaurant_id
    and membership.profile_id = v_profile_id
    and membership.status = 'active'
    and membership.role in ('owner', 'manager')
  limit 1;

  if not found
      or (v_document.access_scope = 'owner' and v_role <> 'owner') then
    return false;
  end if;

  if p_operation = 'read' then
    return v_document.status = 'ready'
      or (
        v_document.status = 'uploading'
        and v_document.created_by_profile_id = v_profile_id
      );
  end if;

  if p_operation = 'delete' then
    return v_document.status in ('uploading', 'ready', 'archived');
  end if;

  return v_document.status = 'uploading'
    and v_document.created_by_profile_id = v_profile_id
    and (p_size_bytes is null or p_size_bytes = v_document.size_bytes)
    and (
      nullif(lower(split_part(coalesce(p_mime_type, ''), ';', 1)), '') is null
      or lower(split_part(p_mime_type, ';', 1)) = v_document.mime_type
    );
end
$document_access$;

-- Preview choices now state which rows have a real account. Read-only previews
-- still support account-less employees; real support mode does not.
create or replace function public.get_preview_personas(p_restaurant_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $preview_personas$
declare
  v_profile_id uuid := public.authenticated_profile_id();
  v_is_admin boolean;
  v_is_manager boolean;
begin
  if v_profile_id is null then
    raise exception 'Authenticated session required.' using errcode = '42501';
  end if;
  v_is_admin := public.is_platform_admin(v_profile_id);
  select exists (
    select 1 from public.restaurant_memberships membership
    where membership.restaurant_id = p_restaurant_id
      and membership.profile_id = v_profile_id
      and membership.status = 'active'
      and membership.role in ('owner', 'manager')
  ) into v_is_manager;
  if not v_is_admin and not v_is_manager then
    raise exception 'Preview access denied.' using errcode = '42501';
  end if;

  return coalesce((
    select jsonb_agg(persona order by persona->>'role', lower(persona->>'display_name'))
    from (
      select jsonb_build_object(
        'key', 'employee:' || employee.id,
        'role', 'employee',
        'employee_id', employee.id,
        'profile_id', employee_access.profile_id,
        'can_act_as', employee_access.profile_id is not null,
        'display_name', employee.display_name,
        'detail', case when employee_access.profile_id is null then 'No account yet' else 'Employee account' end
      ) persona
      from public.employees employee
      left join public.employee_access employee_access
        on employee_access.restaurant_id = employee.restaurant_id
       and employee_access.employee_id = employee.id
       and employee_access.access_status = 'active'
      where employee.restaurant_id = p_restaurant_id
        and employee.active

      union all

      select jsonb_build_object(
        'key', membership.role || ':' || membership.profile_id,
        'role', membership.role,
        'employee_id', employee_access.employee_id,
        'profile_id', membership.profile_id,
        'can_act_as', true,
        'display_name', coalesce(
          nullif(btrim(coalesce(profile.first_name, '') || ' ' || coalesce(profile.last_name, '')), ''),
          profile.email::text
        ),
        'detail', profile.email::text
      ) persona
      from public.restaurant_memberships membership
      join public.profiles profile on profile.id = membership.profile_id
      left join public.employee_access employee_access
        on employee_access.restaurant_id = membership.restaurant_id
       and employee_access.profile_id = membership.profile_id
       and employee_access.access_status = 'active'
      where v_is_admin
        and membership.restaurant_id = p_restaurant_id
        and membership.status = 'active'
        and membership.role in ('owner', 'manager')
    ) personas
  ), '[]'::jsonb);
end
$preview_personas$;

notify pgrst, 'reload schema';
commit;
