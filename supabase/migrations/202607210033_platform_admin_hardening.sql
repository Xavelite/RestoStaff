-- Make platform suspension a complete tenant boundary and give the operator
-- console an honest, auditable read model.
begin;

create or replace function public.active_membership_role(
  p_restaurant_id uuid,
  p_profile_id uuid
)
returns text
language sql
stable
security definer
set search_path = public
as $active_membership_role$
  select m.role::text
  from public.restaurant_memberships m
  join public.restaurants r on r.id = m.restaurant_id and r.active
  where m.restaurant_id = p_restaurant_id
    and m.profile_id = p_profile_id
    and m.status = 'active'
    and m.role in ('owner', 'manager')
  limit 1
$active_membership_role$;

create or replace function public.is_owner(target_restaurant_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.restaurant_memberships m
    join public.profiles p on p.id = m.profile_id
    join public.restaurants r on r.id = m.restaurant_id and r.active
    where m.restaurant_id = target_restaurant_id
      and p.auth_user_id = auth.uid()
      and m.role = 'owner'
      and m.status = 'active'
  );
$$;

create or replace function public.is_owner_or_manager(target_restaurant_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.restaurant_memberships m
    join public.restaurants r on r.id = m.restaurant_id and r.active
    where m.restaurant_id = target_restaurant_id
      and m.profile_id = public.current_profile_id()
      and m.role in ('owner', 'manager')
      and m.status = 'active'
  );
$$;

create or replace function public.is_restaurant_member(target_restaurant_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.restaurant_memberships m
    join public.restaurants r on r.id = m.restaurant_id and r.active
    where m.restaurant_id = target_restaurant_id
      and m.profile_id = public.current_profile_id()
      and m.status = 'active'
  );
$$;

create or replace function public.is_own_employee(
  target_restaurant_id uuid,
  target_employee_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.employee_access ea
    join public.restaurants r
      on r.id = ea.restaurant_id
     and r.active
    join public.employees e
      on e.restaurant_id = ea.restaurant_id
     and e.id = ea.employee_id
     and e.active
    join public.restaurant_memberships m
      on m.restaurant_id = ea.restaurant_id
     and m.profile_id = ea.profile_id
     and m.status = 'active'
    where ea.restaurant_id = target_restaurant_id
      and ea.employee_id = target_employee_id
      and ea.profile_id = public.current_profile_id()
      and ea.access_status = 'active'
  );
$$;

create or replace function public.set_own_pin(
  p_new_pin text,
  p_restaurant_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile_id uuid := public.current_profile_id();
  v_pin text := trim(coalesce(p_new_pin, ''));
  v_restaurant_id uuid := p_restaurant_id;
  v_access record;
begin
  if v_profile_id is null then raise exception 'Authenticated session required.'; end if;
  if v_pin !~ '^[0-9]{4}$' then raise exception 'Choose a 4-digit PIN.'; end if;

  if v_restaurant_id is null then
    select ea.restaurant_id into v_restaurant_id
    from public.employee_access ea
    join public.restaurant_memberships m
      on m.restaurant_id = ea.restaurant_id
     and m.profile_id = ea.profile_id
     and m.status = 'active'
    join public.restaurants r
      on r.id = ea.restaurant_id
     and r.active
    where ea.profile_id = v_profile_id
      and ea.access_status = 'active'
    order by ea.created_at
    limit 1;
  end if;
  if v_restaurant_id is null then raise exception 'Workspace access denied.'; end if;

  select ea.restaurant_id, ea.employee_id, ea.access_status
  into v_access
  from public.employee_access ea
  join public.restaurant_memberships m
    on m.restaurant_id = ea.restaurant_id
   and m.profile_id = ea.profile_id
   and m.status = 'active'
  join public.restaurants r
    on r.id = ea.restaurant_id
   and r.active
  join public.employees e
    on e.restaurant_id = ea.restaurant_id
   and e.id = ea.employee_id
   and e.active
  where ea.restaurant_id = v_restaurant_id
    and ea.profile_id = v_profile_id
    and ea.access_status = 'active'
  limit 1;
  if v_access.employee_id is null then
    raise exception 'Active employee access required to set a badge PIN.';
  end if;

  insert into public.employee_pin_credentials (
    restaurant_id, employee_id, pin_hash, pin_status,
    failed_attempts, locked_until, last_rotated_at
  )
  values (
    v_access.restaurant_id, v_access.employee_id,
    crypt(v_pin, gen_salt('bf')), 'active', 0, null, now()
  )
  on conflict (restaurant_id, employee_id)
  do update set
    pin_hash = excluded.pin_hash,
    pin_status = 'active',
    failed_attempts = 0,
    locked_until = null,
    last_rotated_at = now(),
    updated_at = now();

  update public.employee_access
  set badge_enabled = true, updated_at = now()
  where restaurant_id = v_access.restaurant_id
    and employee_id = v_access.employee_id;

  return jsonb_build_object(
    'ok', true,
    'restaurant_id', v_access.restaurant_id,
    'employee_id', v_access.employee_id
  );
end;
$$;

create or replace function public.resolve_station_token(p_token text)
returns table(station_id uuid, restaurant_id uuid)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_station_id uuid;
  v_restaurant_id uuid;
begin
  if p_token is null or length(trim(p_token)) < 24 then
    raise exception 'This device is not paired.';
  end if;

  select s.id, s.restaurant_id
  into v_station_id, v_restaurant_id
  from public.restaurant_stations s
  join public.restaurants r on r.id = s.restaurant_id and r.active
  where s.token_hash = encode(extensions.digest(trim(p_token), 'sha256'), 'hex')
    and s.revoked_at is null
  limit 1;

  if v_station_id is null then
    raise exception 'This device is no longer paired or its restaurant is suspended.';
  end if;

  update public.restaurant_stations set last_used_at = now() where id = v_station_id;
  station_id := v_station_id;
  restaurant_id := v_restaurant_id;
  return next;
end;
$$;

create or replace function public.platform_admin_access_state()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'is_admin', public.is_platform_admin(public.current_profile_id()),
    'claim_available',
      not exists (select 1 from public.platform_admins)
      and exists (
        select 1
        from public.restaurant_memberships m
        join public.restaurants r on r.id = m.restaurant_id and r.active
        where m.profile_id = public.current_profile_id()
          and m.role = 'owner'
          and m.status = 'active'
      )
  );
$$;

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
  v_events jsonb;
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
      'shift_count', (select count(*) from public.planned_shifts ps where ps.restaurant_id = r.id),
      'time_entry_count', (select count(*) from public.time_entries te where te.restaurant_id = r.id),
      'absence_count', (select count(*) from public.absences a where a.restaurant_id = r.id),
      'payroll_export_count', (select count(*) from public.payroll_export_runs pe where pe.restaurant_id = r.id),
      'last_activity', greatest(
        (select max(e.updated_at) from public.employees e where e.restaurant_id = r.id),
        (select max(ps.updated_at) from public.planned_shifts ps where ps.restaurant_id = r.id),
        (select max(te.updated_at) from public.time_entries te where te.restaurant_id = r.id),
        (select max(a.updated_at) from public.absences a where a.restaurant_id = r.id),
        r.created_at
      )
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
            jsonb_build_object(
              'restaurant_id', r2.id,
              'restaurant', r2.name,
              'restaurant_active', r2.active,
              'role', m.role,
              'status', m.status
            ) order by r2.name
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

  select coalesce(jsonb_agg(row order by row->>'created_at' desc), '[]'::jsonb)
  into v_events
  from (
    select jsonb_build_object(
      'id', e.id,
      'action', e.action,
      'target_type', e.target_type,
      'target_id', e.target_id,
      'detail', e.detail,
      'created_at', e.created_at,
      'admin_name', nullif(btrim(coalesce(p.first_name, '') || ' ' || coalesce(p.last_name, '')), ''),
      'admin_email', p.email
    ) as row
    from public.platform_admin_events e
    left join public.profiles p on p.id = e.admin_profile_id
    order by e.created_at desc
    limit 50
  ) recent;

  return jsonb_build_object(
    'restaurants', v_restaurants,
    'users', v_users,
    'events', v_events,
    'stats', jsonb_build_object(
      'restaurant_count', (select count(*) from public.restaurants),
      'active_restaurant_count', (select count(*) from public.restaurants where active),
      'user_count', (select count(*) from public.profiles),
      'active_7d', (select count(*) from auth.users where last_sign_in_at > now() - interval '7 days'),
      'suspended_user_count', (
        select count(*) from auth.users where banned_until is not null and banned_until > now()
      ),
      'unassigned_user_count', (
        select count(*)
        from public.profiles p
        where not exists (
          select 1 from public.restaurant_memberships m
          where m.profile_id = p.id and m.status = 'active'
        )
      )
    )
  );
end;
$$;

create or replace function public.admin_set_restaurant_active(
  p_restaurant_id uuid,
  p_active boolean
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin uuid := public.require_platform_admin();
  v_name text;
begin
  update public.restaurants
  set active = p_active, updated_at = now()
  where id = p_restaurant_id
  returning name into v_name;

  if v_name is null then raise exception 'Restaurant not found.'; end if;

  insert into public.platform_admin_events (
    admin_profile_id, action, target_type, target_id, detail
  ) values (
    v_admin,
    case when p_active then 'restaurant_reactivated' else 'restaurant_suspended' end,
    'restaurant',
    p_restaurant_id,
    jsonb_build_object('name', v_name, 'active', p_active)
  );
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
  v_detail jsonb;
begin
  select jsonb_build_object(
    'name', r.name,
    'employee_count', (select count(*) from public.employees e where e.restaurant_id = r.id),
    'member_count', (select count(*) from public.restaurant_memberships m where m.restaurant_id = r.id),
    'shift_count', (select count(*) from public.planned_shifts ps where ps.restaurant_id = r.id),
    'time_entry_count', (select count(*) from public.time_entries te where te.restaurant_id = r.id),
    'absence_count', (select count(*) from public.absences a where a.restaurant_id = r.id),
    'payroll_export_count', (select count(*) from public.payroll_export_runs pe where pe.restaurant_id = r.id)
  )
  into v_detail
  from public.restaurants r
  where r.id = p_restaurant_id;

  if v_detail is null then raise exception 'Restaurant not found.'; end if;

  delete from public.payroll_export_runs where restaurant_id = p_restaurant_id;
  delete from public.restaurants where id = p_restaurant_id;

  insert into public.platform_admin_events (
    admin_profile_id, action, target_type, target_id, detail
  ) values (v_admin, 'restaurant_deleted', 'restaurant', p_restaurant_id, v_detail);

  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function public.platform_admin_access_state() from public, anon, authenticated;
grant execute on function public.platform_admin_access_state() to authenticated;

revoke all on function public.active_membership_role(uuid, uuid) from public, anon, authenticated;
revoke all on function public.resolve_station_token(text) from public, anon, authenticated;
grant execute on function public.is_owner(uuid) to authenticated;
grant execute on function public.is_owner_or_manager(uuid) to authenticated;
grant execute on function public.is_restaurant_member(uuid) to authenticated;
grant execute on function public.is_own_employee(uuid, uuid) to authenticated;
grant execute on function public.set_own_pin(text, uuid) to authenticated;
grant execute on function public.admin_dashboard() to authenticated;
grant execute on function public.admin_set_restaurant_active(uuid, boolean) to authenticated;
grant execute on function public.admin_delete_restaurant(uuid) to authenticated;

commit;
