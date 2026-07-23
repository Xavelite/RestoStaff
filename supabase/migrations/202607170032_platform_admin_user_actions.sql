-- Platform administration — user actions. Extends 202607170031 with the two
-- destructive controls the operator console needs over people: suspend a login
-- (reversible) and hard-delete a user (irreversible). Both write auth.users, so
-- both are SECURITY DEFINER (owned by the migration role, which may touch the
-- auth schema) and both self-gate on require_platform_admin. Every action is
-- audited. A platform admin can never suspend or delete themselves, nor another
-- platform admin — de-list them first, in SQL.
begin;

-- Suspend / reactivate a login by toggling auth.users.banned_until. Supabase
-- refuses sign-in while banned_until is in the future; clearing it restores
-- access. Fully reversible — the profile and all data are untouched.
create or replace function public.admin_set_user_suspended(p_profile_id uuid, p_suspended boolean)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin uuid := public.require_platform_admin();
  v_auth uuid;
  v_email text;
begin
  select p.auth_user_id, p.email into v_auth, v_email
  from public.profiles p where p.id = p_profile_id;
  if not found then
    raise exception 'User not found.';
  end if;
  if p_profile_id = v_admin then
    raise exception 'You cannot suspend your own account.';
  end if;
  if public.is_platform_admin(p_profile_id) then
    raise exception 'Remove platform-admin access before suspending this user.';
  end if;
  if v_auth is null then
    raise exception 'This user has no login to suspend.';
  end if;

  update auth.users
     set banned_until = case when p_suspended then 'infinity'::timestamptz else null end
   where id = v_auth;

  insert into public.platform_admin_events (admin_profile_id, action, target_type, target_id, detail)
  values (v_admin, case when p_suspended then 'user_suspended' else 'user_reactivated' end,
          'user', p_profile_id, jsonb_build_object('email', v_email));
  return jsonb_build_object('ok', true);
end;
$$;

-- Hard-delete a user: their profile row and their auth login. On the profile
-- delete, restaurant_memberships + badge_verification_challenges cascade away
-- and ~20 audit references (approvals, invitations, absences) null out, so the
-- history those rows document survives without the person. Two references are
-- protective and cannot be auto-cleared — restaurants.owner_profile_id (a live
-- tenant) and payroll_export_runs.created_by_profile_id (payroll lineage) — so
-- an owner or a payroll author is refused with a clear reason rather than a raw
-- FK error. Deleting auth.users also removes that user's sessions/identities.
create or replace function public.admin_delete_user(p_profile_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin uuid := public.require_platform_admin();
  v_auth uuid;
  v_email text;
  v_owns int;
  v_payroll int;
begin
  select p.auth_user_id, p.email into v_auth, v_email
  from public.profiles p where p.id = p_profile_id;
  if not found then
    raise exception 'User not found.';
  end if;
  if p_profile_id = v_admin then
    raise exception 'You cannot delete your own account.';
  end if;
  if public.is_platform_admin(p_profile_id) then
    raise exception 'Remove platform-admin access before deleting this user.';
  end if;

  select count(*) into v_owns from public.restaurants where owner_profile_id = p_profile_id;
  if v_owns > 0 then
    raise exception 'This user owns % restaurant(s); delete or reassign those first.', v_owns;
  end if;
  select count(*) into v_payroll
  from public.payroll_export_runs where created_by_profile_id = p_profile_id;
  if v_payroll > 0 then
    raise exception 'This user authored % payroll export(s), so their record is retained.', v_payroll;
  end if;

  delete from public.profiles where id = p_profile_id;
  if v_auth is not null then
    delete from auth.users where id = v_auth;
  end if;

  insert into public.platform_admin_events (admin_profile_id, action, target_type, target_id, detail)
  values (v_admin, 'user_deleted', 'user', p_profile_id, jsonb_build_object('email', v_email));
  return jsonb_build_object('ok', true);
end;
$$;

-- Lightweight self-check so the app can reveal the admin entry point only to
-- administrators. Unlike is_platform_admin(uuid) (definer-only, could probe any
-- profile), this answers only for the caller, so it is safe for authenticated.
create or replace function public.am_i_platform_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_platform_admin(public.current_profile_id());
$$;

grant execute on function public.admin_set_user_suspended(uuid, boolean) to authenticated;
grant execute on function public.admin_delete_user(uuid) to authenticated;
grant execute on function public.am_i_platform_admin() to authenticated;

commit;
