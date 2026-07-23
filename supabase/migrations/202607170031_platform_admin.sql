-- Platform administration — a cross-tenant operator surface for the project
-- owner. This is the ONE place that reads/acts across all restaurants, so it is
-- never exposed through RLS: a dedicated platform_admins allowlist is checked
-- explicitly by every admin RPC (SECURITY DEFINER). Bootstrap-claimed once by an
-- owner, then locked. Every mutating action writes an audit event.
begin;

create table if not exists public.platform_admins (
  profile_id uuid primary key references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  note text
);
alter table public.platform_admins enable row level security;
-- No policies on purpose: only SECURITY DEFINER functions ever touch this table.

create table if not exists public.platform_admin_events (
  id uuid primary key default gen_random_uuid(),
  admin_profile_id uuid references public.profiles(id) on delete set null,
  action text not null,
  target_type text not null,
  target_id uuid,
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
alter table public.platform_admin_events enable row level security;

-- Identity helpers -----------------------------------------------------------
create or replace function public.is_platform_admin(p_profile_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.platform_admins a where a.profile_id = p_profile_id);
$$;

create or replace function public.require_platform_admin()
returns uuid
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_profile uuid := public.current_profile_id();
begin
  if v_profile is null or not public.is_platform_admin(v_profile) then
    raise exception 'Platform administrator access required.';
  end if;
  return v_profile;
end;
$$;

-- One-time bootstrap: the first restaurant owner may claim platform admin while
-- the allowlist is empty. After that it is locked (manage rows directly in SQL).
create or replace function public.claim_platform_admin()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile uuid := public.current_profile_id();
begin
  if v_profile is null then
    raise exception 'Sign in first.';
  end if;
  if exists (select 1 from public.platform_admins) then
    raise exception 'A platform administrator already exists.';
  end if;
  if not exists (
    select 1 from public.restaurant_memberships m
    where m.profile_id = v_profile and m.role = 'owner'
  ) then
    raise exception 'Only a restaurant owner can claim platform admin.';
  end if;
  insert into public.platform_admins (profile_id, note) values (v_profile, 'Bootstrap claim.');
  return jsonb_build_object('ok', true);
end;
$$;

-- Read model -----------------------------------------------------------------
create or replace function public.admin_dashboard()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_restaurants jsonb;
  v_users jsonb;
begin
  perform public.require_platform_admin();

  select coalesce(jsonb_agg(row order by lower(row->>'name')), '[]'::jsonb)
  into v_restaurants
  from (
    select jsonb_build_object(
      'id', r.id,
      'name', r.name,
      'city', r.city,
      'active', r.active,
      'created_at', r.created_at,
      'owner_name', nullif(btrim(coalesce(op.first_name, '') || ' ' || coalesce(op.last_name, '')), ''),
      'owner_email', op.email,
      'employee_count', (select count(*) from public.employees e where e.restaurant_id = r.id and e.active),
      'member_count', (select count(*) from public.restaurant_memberships m where m.restaurant_id = r.id and m.status = 'active'),
      'last_activity', (select max(t.updated_at) from public.time_entries t where t.restaurant_id = r.id)
    ) as row
    from public.restaurants r
    left join public.profiles op on op.id = r.owner_profile_id
  ) s;

  select coalesce(jsonb_agg(row order by lower(row->>'email')), '[]'::jsonb)
  into v_users
  from (
    select jsonb_build_object(
      'id', p.id,
      'email', p.email,
      'name', nullif(btrim(coalesce(p.first_name, '') || ' ' || coalesce(p.last_name, '')), ''),
      'created_at', p.created_at,
      'last_sign_in_at', au.last_sign_in_at,
      'email_confirmed_at', au.email_confirmed_at,
      'suspended', (au.banned_until is not null and au.banned_until > now()),
      'is_admin', public.is_platform_admin(p.id),
      'memberships', (
        select coalesce(
          jsonb_agg(
            jsonb_build_object('restaurant', r2.name, 'role', m.role, 'status', m.status)
            order by r2.name
          ),
          '[]'::jsonb
        )
        from public.restaurant_memberships m
        join public.restaurants r2 on r2.id = m.restaurant_id
        where m.profile_id = p.id
      )
    ) as row
    from public.profiles p
    left join auth.users au on au.id = p.auth_user_id
  ) s;

  return jsonb_build_object(
    'restaurants', v_restaurants,
    'users', v_users,
    'stats', jsonb_build_object(
      'restaurant_count', (select count(*) from public.restaurants),
      'active_restaurant_count', (select count(*) from public.restaurants where active),
      'user_count', (select count(*) from public.profiles),
      'active_7d', (
        select count(*) from auth.users au where au.last_sign_in_at > now() - interval '7 days'
      )
    )
  );
end;
$$;

-- Restaurant actions ---------------------------------------------------------
create or replace function public.admin_set_restaurant_active(p_restaurant_id uuid, p_active boolean)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin uuid := public.require_platform_admin();
begin
  update public.restaurants set active = p_active, updated_at = now() where id = p_restaurant_id;
  if not found then
    raise exception 'Restaurant not found.';
  end if;
  insert into public.platform_admin_events (admin_profile_id, action, target_type, target_id, detail)
  values (v_admin, case when p_active then 'restaurant_reactivated' else 'restaurant_suspended' end,
          'restaurant', p_restaurant_id, jsonb_build_object('active', p_active));
  return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.admin_delete_restaurant(p_restaurant_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin uuid := public.require_platform_admin();
  v_name text;
begin
  select name into v_name from public.restaurants where id = p_restaurant_id;
  if v_name is null then
    raise exception 'Restaurant not found.';
  end if;
  -- payroll_export_runs is ON DELETE RESTRICT to protect payroll lineage; an
  -- explicit admin delete clears it first, then the restaurant cascades the rest.
  delete from public.payroll_export_runs where restaurant_id = p_restaurant_id;
  delete from public.restaurants where id = p_restaurant_id;
  insert into public.platform_admin_events (admin_profile_id, action, target_type, target_id, detail)
  values (v_admin, 'restaurant_deleted', 'restaurant', p_restaurant_id, jsonb_build_object('name', v_name));
  return jsonb_build_object('ok', true);
end;
$$;

-- Grants: helpers are internal (definer-only); the dashboard + actions are
-- callable by any authenticated user but self-gate via require_platform_admin.
revoke all on function public.is_platform_admin(uuid) from public, anon, authenticated;
revoke all on function public.require_platform_admin() from public, anon, authenticated;
grant execute on function public.claim_platform_admin() to authenticated;
grant execute on function public.admin_dashboard() to authenticated;
grant execute on function public.admin_set_restaurant_active(uuid, boolean) to authenticated;
grant execute on function public.admin_delete_restaurant(uuid) to authenticated;

commit;
