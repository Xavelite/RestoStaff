-- Canonical Phase 3 invitation/access contract.
-- Safe to run against development or staging; all fixtures roll back.
begin;

do $phase3_schema$
declare
  v_required_function text;
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'employee_invitations'
      and column_name = 'profile_id'
  ) then
    raise exception 'Invitations must be email-first, not profile-first';
  end if;

  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'employee_access'
      and column_name in (
        'temporary_access_expires_at',
        'must_change_password',
        'last_login_at'
      )
  ) then
    raise exception 'Obsolete employee-access lifecycle columns remain';
  end if;

  if exists (
    select 1
    from public.employee_access
    where access_status not in ('active', 'disabled')
       or (access_status = 'active' and profile_id is null)
  ) then
    raise exception 'Employee access contains an invalid durable state';
  end if;

  if exists (
    select 1
    from public.restaurant_memberships
    where status not in ('active', 'disabled')
  ) then
    raise exception 'Memberships still contain invitation state';
  end if;

  foreach v_required_function in array array[
    'public.accept_employee_invite(uuid,text,text)',
    'public.get_employee_invitation_context(uuid,text)',
    'public.register_employee_invitation(uuid,uuid,citext,text,text,timestamptz,uuid)',
    'public.revoke_employee_invitation(uuid,uuid,text)',
    'public.revoke_employee_invitation_delivery(uuid,text)',
    'public.set_employee_access_state(uuid,uuid,text)'
  ] loop
    if to_regprocedure(v_required_function) is null then
      raise exception 'Missing Phase 3 routine: %', v_required_function;
    end if;
  end loop;

  if to_regprocedure(
    'public.link_invited_employee(uuid,uuid,uuid,text,text)'
  ) is not null
     or to_regprocedure(
       'public.register_employee_invitation(uuid,uuid,uuid,citext,text,text,timestamptz)'
     ) is not null then
    raise exception 'A profile-first invitation routine remains';
  end if;

  if has_function_privilege(
    'authenticated',
    'public.register_employee_invitation(uuid,uuid,citext,text,text,timestamptz,uuid)',
    'EXECUTE'
  ) or has_function_privilege(
    'authenticated',
    'public.revoke_employee_invitation_delivery(uuid,text)',
    'EXECUTE'
  ) then
    raise exception 'Service-only invitation routines are exposed to clients';
  end if;

  if not has_function_privilege(
    'authenticated',
    'public.accept_employee_invite(uuid,text,text)',
    'EXECUTE'
  ) or not has_function_privilege(
    'authenticated',
    'public.get_employee_invitation_context(uuid,text)',
    'EXECUTE'
  ) or not has_function_privilege(
    'authenticated',
    'public.revoke_employee_invitation(uuid,uuid,text)',
    'EXECUTE'
  ) or not has_function_privilege(
    'authenticated',
    'public.set_employee_access_state(uuid,uuid,text)',
    'EXECUTE'
  ) then
    raise exception 'Authenticated invitation/access grants are incomplete';
  end if;
end
$phase3_schema$;

do $phase3_behavior$
declare
  v_restaurant_id uuid;
  v_owner_profile_id uuid;
  v_owner_auth_user_id uuid;
  v_employee_id uuid := gen_random_uuid();
  v_active_employee_id uuid;
  v_email citext := (
    'phase3-' || replace(gen_random_uuid()::text, '-', '') || '@example.invalid'
  )::citext;
  v_token text := gen_random_uuid()::text;
  v_result jsonb;
  v_invitation_id uuid;
begin
  select m.restaurant_id, m.profile_id, p.auth_user_id
  into v_restaurant_id, v_owner_profile_id, v_owner_auth_user_id
  from public.restaurant_memberships m
  join public.profiles p on p.id = m.profile_id
  where m.role = 'owner'
    and m.status = 'active'
    and p.auth_user_id is not null
  order by m.created_at
  limit 1;

  if v_restaurant_id is null then
    raise exception 'Phase 3 behavior test requires an active owner fixture';
  end if;

  perform set_config(
    'request.jwt.claims',
    jsonb_build_object(
      'sub', v_owner_auth_user_id,
      'email', (
        select email from public.profiles where id = v_owner_profile_id
      )
    )::text,
    true
  );

  insert into public.employees (
    id, restaurant_id, display_name, active, sort_order
  )
  values (
    v_employee_id, v_restaurant_id, 'Phase 3 invitation fixture', true, 9999
  );

  insert into public.employee_contact_details (
    restaurant_id, employee_id, email
  )
  values (v_restaurant_id, v_employee_id, v_email);

  insert into public.employee_access (
    restaurant_id, employee_id, access_status, badge_enabled
  )
  values (v_restaurant_id, v_employee_id, 'disabled', false);

  v_result := public.register_employee_invitation(
    v_restaurant_id,
    v_employee_id,
    v_email,
    'employee',
    v_token,
    now() + interval '7 days',
    v_owner_profile_id
  );
  v_invitation_id := nullif(v_result->>'invitation_id', '')::uuid;

  if v_invitation_id is null then
    raise exception 'Invitation registration returned no invitation id';
  end if;
  if exists (
    select 1
    from public.employee_access
    where restaurant_id = v_restaurant_id
      and employee_id = v_employee_id
      and profile_id is not null
  ) then
    raise exception 'Registration linked a profile before acceptance';
  end if;
  if exists (
    select 1
    from public.restaurant_memberships m
    join public.employee_access ea
      on ea.restaurant_id = m.restaurant_id
     and ea.profile_id = m.profile_id
    where ea.restaurant_id = v_restaurant_id
      and ea.employee_id = v_employee_id
  ) then
    raise exception 'Registration created a membership before acceptance';
  end if;
  if (
    public.employee_invitation_states_for_restaurant(v_restaurant_id)::text
    like '%token_hash%'
  ) then
    raise exception 'Invitation state projection leaks token hashes';
  end if;

  perform public.revoke_employee_invitation(
    v_restaurant_id,
    v_employee_id,
    'Phase 3 authenticated revocation test'
  );

  if not exists (
    select 1
    from public.employee_invitations
    where id = v_invitation_id
      and status = 'revoked'
      and revoked_at is not null
      and revoked_by_profile_id = v_owner_profile_id
  ) then
    raise exception 'Authenticated revocation did not preserve its actor';
  end if;

  select ea.employee_id into v_active_employee_id
  from public.employee_access ea
  join public.restaurant_memberships m
    on m.restaurant_id = ea.restaurant_id
   and m.profile_id = ea.profile_id
  where ea.restaurant_id = v_restaurant_id
    and ea.access_status = 'active'
    and m.status = 'active'
    and m.role = 'employee'
  limit 1;

  if v_active_employee_id is not null then
    perform public.set_employee_access_state(
      v_restaurant_id,
      v_active_employee_id,
      'disable'
    );
    if not exists (
      select 1
      from public.employee_access ea
      join public.restaurant_memberships m
        on m.restaurant_id = ea.restaurant_id
       and m.profile_id = ea.profile_id
      where ea.restaurant_id = v_restaurant_id
        and ea.employee_id = v_active_employee_id
        and ea.access_status = 'disabled'
        and m.status = 'disabled'
    ) then
      raise exception 'Disable did not update access and membership together';
    end if;

    perform public.set_employee_access_state(
      v_restaurant_id,
      v_active_employee_id,
      'restore'
    );
    if not exists (
      select 1
      from public.employee_access ea
      join public.restaurant_memberships m
        on m.restaurant_id = ea.restaurant_id
       and m.profile_id = ea.profile_id
      where ea.restaurant_id = v_restaurant_id
        and ea.employee_id = v_active_employee_id
        and ea.access_status = 'active'
        and m.status = 'active'
    ) then
      raise exception 'Restore did not update access and membership together';
    end if;
  end if;
end
$phase3_behavior$;

rollback;
