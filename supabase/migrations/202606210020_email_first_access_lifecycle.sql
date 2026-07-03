-- Phase 3: canonical email-first invitation and durable access lifecycle.
--
-- Invitations own pending/resend/expiry/revocation state. Memberships and
-- employee_access are created or activated only after the invited account
-- proves ownership of the invitation email.
begin;

set local lock_timeout = '5s';
set local statement_timeout = '2min';
select pg_advisory_xact_lock(
  hashtextextended('restogogo:202606210020:email-first-access-lifecycle', 0)
);

do $phase3_preflight$
begin
  if exists (
    select 1
    from public.employee_access
    where access_status = 'active'
      and profile_id is null
  ) then
    raise exception 'Active employee access without a profile must be repaired first.';
  end if;

  if exists (
    select 1
    from public.employee_access
    where profile_id is not null
    group by restaurant_id, profile_id
    having count(*) > 1
  ) then
    raise exception 'One profile is linked to multiple employees in a restaurant.';
  end if;

  if exists (
    select 1
    from public.employee_invitations i
    join public.profiles p on p.id = i.profile_id
    where lower(i.email::text) <> lower(p.email::text)
  ) then
    raise exception 'An existing invitation email does not match its linked profile.';
  end if;
end
$phase3_preflight$;

-- Retain lifecycle history, but make expired pending rows truthful before the
-- new one-pending constraints are installed.
update public.employee_invitations
set status = 'expired',
    updated_at = now()
where status = 'pending'
  and expires_at <= now();

alter table public.employee_invitations
  add column accepted_by_profile_id uuid null,
  add column revoked_by_profile_id uuid null,
  add column revoked_reason text null;

update public.employee_invitations
set accepted_by_profile_id = profile_id
where status = 'accepted'
  and accepted_by_profile_id is null;

drop function if exists public.accept_employee_invite(uuid,text,text);
drop function if exists public.register_employee_invitation(
  uuid,uuid,uuid,citext,text,text,timestamptz
);
drop function if exists public.link_invited_employee(uuid,uuid,uuid,text,text);

drop index if exists public.employee_invitations_lookup_idx;
drop index if exists public.employee_invitations_one_pending_idx;

alter table public.employee_invitations
  drop constraint if exists employee_invitations_profile_id_fkey,
  drop constraint if exists employee_invitations_invited_by_profile_id_fkey,
  drop constraint if exists employee_invitations_employee_fk,
  drop column profile_id;

alter table public.employee_invitations
  add constraint employee_invitations_employee_fk
    foreign key (restaurant_id, employee_id)
    references public.employees(restaurant_id, id) on delete restrict,
  add constraint employee_invitations_invited_by_profile_id_fkey
    foreign key (invited_by_profile_id)
    references public.profiles(id) on delete set null,
  add constraint employee_invitations_accepted_by_profile_id_fkey
    foreign key (accepted_by_profile_id)
    references public.profiles(id) on delete set null,
  add constraint employee_invitations_revoked_by_profile_id_fkey
    foreign key (revoked_by_profile_id)
    references public.profiles(id) on delete set null,
  add constraint employee_invitations_email_not_blank
    check (btrim(email::text) <> ''),
  add constraint employee_invitations_email_normalized
    check (email::text = lower(btrim(email::text))),
  add constraint employee_invitations_token_hash_format
    check (token_hash ~ '^[0-9a-f]{64}$'),
  add constraint employee_invitations_lifecycle_check
    check (
      (
        status = 'pending'
        and accepted_at is null
        and accepted_by_profile_id is null
        and revoked_at is null
        and revoked_by_profile_id is null
      )
      or (
        status = 'accepted'
        and accepted_at is not null
        and revoked_at is null
        and revoked_by_profile_id is null
      )
      or (
        status = 'expired'
        and accepted_at is null
        and accepted_by_profile_id is null
        and revoked_at is null
        and revoked_by_profile_id is null
      )
      or (
        status = 'revoked'
        and accepted_at is null
        and accepted_by_profile_id is null
        and revoked_at is not null
      )
    );

create index employee_invitations_employee_history_idx
  on public.employee_invitations (
    restaurant_id, employee_id, sent_at desc
  );
create index employee_invitations_email_history_idx
  on public.employee_invitations (
    lower(email::text), sent_at desc
  );
create unique index employee_invitations_one_pending_employee_idx
  on public.employee_invitations (restaurant_id, employee_id)
  where status = 'pending';
create unique index employee_invitations_one_pending_email_idx
  on public.employee_invitations (restaurant_id, email)
  where status = 'pending';

-- Durable application access has only two states. Pending invitation state is
-- read from employee_invitations and never copied here.
update public.employee_access
set access_status = case
      when access_status = 'active' and profile_id is not null then 'active'
      else 'disabled'
    end,
    updated_at = now()
where access_status not in ('active', 'disabled')
   or (access_status = 'active' and profile_id is null);

alter table public.employee_access
  drop constraint if exists employee_access_status_check,
  drop column if exists temporary_access_expires_at,
  drop column if exists must_change_password,
  drop column if exists last_login_at,
  add constraint employee_access_status_check
    check (access_status in ('active', 'disabled')),
  add constraint employee_access_active_profile_check
    check (access_status <> 'active' or profile_id is not null);

create unique index employee_access_one_profile_per_restaurant_idx
  on public.employee_access (restaurant_id, profile_id)
  where profile_id is not null;

-- A membership is durable access, not an invitation placeholder.
update public.restaurant_memberships
set status = 'disabled',
    updated_at = now()
where status = 'invited';

alter table public.restaurant_memberships
  drop constraint if exists restaurant_memberships_status_check,
  add constraint restaurant_memberships_status_check
    check (status in ('active', 'disabled'));

-- Rewrite the three existing mutation/read boundaries that contained legacy
-- pending-access vocabulary.
do $rewrite_access_boundaries$
declare
  v_definition text;
  v_before text;
begin
  select pg_get_functiondef(
    'public.save_team_model(uuid,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb)'::regprocedure
  ) into v_definition;
  v_before := v_definition;
  v_definition := replace(v_definition, '''not_invited''', '''disabled''');
  if v_definition = v_before then
    raise exception 'Team access initialization contract drifted.';
  end if;
  execute v_definition;

  select pg_get_functiondef(
    'public.setup_owner_workspace(text,text,citext,text,text,jsonb,jsonb,jsonb,jsonb,jsonb)'::regprocedure
  ) into v_definition;
  v_before := v_definition;
  v_definition := replace(v_definition, '''not_invited''', '''disabled''');
  if v_definition = v_before then
    raise exception 'Owner setup access initialization contract drifted.';
  end if;
  execute v_definition;

  select pg_get_functiondef(
    'public.is_own_employee(uuid,uuid)'::regprocedure
  ) into v_definition;
  v_before := v_definition;
  v_definition := replace(
    v_definition,
    'ea.access_status in (''active'', ''temporary'')',
    'ea.access_status = ''active'''
  );
  if v_definition = v_before then
    raise exception 'Employee identity access contract drifted.';
  end if;
  execute v_definition;
end
$rewrite_access_boundaries$;

-- Safe invitation state projection. Token hashes never leave the database.
create or replace function public.employee_invitation_states_for_restaurant(
  p_restaurant_id uuid
)
returns jsonb
language sql
stable
security definer
set search_path = public
as $invitation_states$
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', latest.id,
        'restaurant_id', latest.restaurant_id,
        'employee_id', latest.employee_id,
        'email', latest.email,
        'invited_role', latest.invited_role,
        'status', case
          when latest.status = 'pending' and latest.expires_at <= now()
            then 'expired'
          else latest.status
        end,
        'expires_at', latest.expires_at,
        'sent_at', latest.sent_at,
        'accepted_at', latest.accepted_at,
        'revoked_at', latest.revoked_at,
        'revoked_reason', latest.revoked_reason
      )
      order by latest.employee_id
    ),
    '[]'::jsonb
  )
  from (
    select distinct on (i.employee_id)
      i.id,
      i.restaurant_id,
      i.employee_id,
      i.email,
      i.invited_role,
      i.status,
      i.expires_at,
      i.sent_at,
      i.accepted_at,
      i.revoked_at,
      i.revoked_reason
    from public.employee_invitations i
    where i.restaurant_id = p_restaurant_id
    order by i.employee_id, i.sent_at desc, i.created_at desc
  ) latest
$invitation_states$;

-- Extend the current workspace snapshot without exposing invitation secrets.
alter function public.build_workspace_runtime_snapshot_v2(
  uuid,text,uuid,uuid,date,date
) rename to build_workspace_runtime_snapshot_core;

create function public.build_workspace_runtime_snapshot_v2(
  p_restaurant_id uuid,
  p_role text,
  p_profile_id uuid,
  p_employee_id uuid,
  p_from_date date default null,
  p_to_date date default null
)
returns jsonb
language sql
stable
security definer
set search_path = public
as $snapshot_v2$
  select public.build_workspace_runtime_snapshot_core(
    p_restaurant_id,
    p_role,
    p_profile_id,
    p_employee_id,
    p_from_date,
    p_to_date
  ) || jsonb_build_object(
    'employee_invitation_states',
    case
      when p_role in ('owner', 'manager')
        then public.employee_invitation_states_for_restaurant(p_restaurant_id)
      else '[]'::jsonb
    end
  )
$snapshot_v2$;

do $repoint_snapshot_callers$
declare
  v_function record;
  v_definition text;
begin
  for v_function in
    select p.oid
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in (
        'build_workspace_runtime_snapshot',
        'build_workspace_runtime_snapshot_for_role',
        'get_workspace_runtime_snapshot',
        'workspace_runtime_snapshot_for_current_context'
      )
  loop
    v_definition := pg_get_functiondef(v_function.oid);
    if position('build_workspace_runtime_snapshot_core' in v_definition) > 0 then
      execute replace(
        v_definition,
        'build_workspace_runtime_snapshot_core',
        'build_workspace_runtime_snapshot_v2'
      );
    end if;
  end loop;
end
$repoint_snapshot_callers$;

-- Service-only registration. The employee contact email is the authority and
-- the inviter must be an active owner/manager of the same restaurant.
create function public.register_employee_invitation(
  p_restaurant_id uuid,
  p_employee_id uuid,
  p_email citext,
  p_role text,
  p_token text,
  p_expires_at timestamptz,
  p_invited_by_profile_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $register_invitation$
declare
  v_actor_role text;
  v_email citext := lower(btrim(coalesce(p_email::text, '')))::citext;
  v_contact_email citext;
  v_invitation_id uuid;
begin
  if p_restaurant_id is null or p_employee_id is null then
    raise exception 'Restaurant and employee are required.';
  end if;
  if p_invited_by_profile_id is null then
    raise exception 'Inviting profile is required.';
  end if;
  if v_email::text = '' then raise exception 'Employee email is required.'; end if;
  if p_role not in ('manager', 'employee') then
    raise exception 'Invitation role must be employee or manager.';
  end if;
  if btrim(coalesce(p_token, '')) = '' then
    raise exception 'Invitation token is required.';
  end if;
  if p_expires_at <= now() then
    raise exception 'Invitation expiry must be in the future.';
  end if;

  select m.role into v_actor_role
  from public.restaurant_memberships m
  where m.restaurant_id = p_restaurant_id
    and m.profile_id = p_invited_by_profile_id
    and m.status = 'active'
    and m.role in ('owner', 'manager')
  limit 1;

  if v_actor_role is null then
    raise exception 'Owner or manager access is required.';
  end if;
  if p_role = 'manager' and v_actor_role <> 'owner' then
    raise exception 'Only an owner can invite a manager.';
  end if;

  select c.email into v_contact_email
  from public.employees e
  join public.employee_contact_details c
    on c.restaurant_id = e.restaurant_id
   and c.employee_id = e.id
  where e.restaurant_id = p_restaurant_id
    and e.id = p_employee_id
    and e.active
  limit 1;

  if v_contact_email is null then
    raise exception 'Save an employee email before sending an invitation.';
  end if;
  if lower(v_contact_email::text) <> lower(v_email::text) then
    raise exception 'Invitation email must match the saved employee email.';
  end if;

  if exists (
    select 1
    from public.employee_access ea
    where ea.restaurant_id = p_restaurant_id
      and ea.employee_id = p_employee_id
      and ea.profile_id is not null
  ) then
    raise exception 'This employee already has a linked account. Restore access instead.';
  end if;

  if exists (
    select 1
    from public.profiles p
    join public.employee_access ea
      on ea.profile_id = p.id
     and ea.restaurant_id = p_restaurant_id
    where lower(p.email::text) = lower(v_email::text)
      and ea.employee_id <> p_employee_id
  ) then
    raise exception 'This email is already linked to another employee in the restaurant.';
  end if;

  update public.employee_invitations
  set status = 'expired',
      updated_at = now()
  where status = 'pending'
    and expires_at <= now();

  if exists (
    select 1
    from public.employee_invitations i
    where i.restaurant_id = p_restaurant_id
      and i.email = v_email
      and i.employee_id <> p_employee_id
      and i.status = 'pending'
  ) then
    raise exception 'This email already has a pending invitation for another employee.';
  end if;

  if exists (
    select 1
    from public.employee_invitations i
    where i.restaurant_id = p_restaurant_id
      and i.employee_id = p_employee_id
      and i.status = 'pending'
      and i.sent_at > now() - interval '1 minute'
  ) then
    raise exception 'Wait a minute before resending this invitation.';
  end if;

  update public.employee_invitations
  set status = 'revoked',
      revoked_at = now(),
      revoked_by_profile_id = p_invited_by_profile_id,
      revoked_reason = 'Superseded by a new invitation',
      updated_at = now()
  where restaurant_id = p_restaurant_id
    and employee_id = p_employee_id
    and status = 'pending';

  insert into public.employee_invitations (
    restaurant_id,
    employee_id,
    email,
    invited_role,
    token_hash,
    expires_at,
    invited_by_profile_id
  )
  values (
    p_restaurant_id,
    p_employee_id,
    v_email,
    p_role,
    encode(extensions.digest(p_token, 'sha256'), 'hex'),
    p_expires_at,
    p_invited_by_profile_id
  )
  returning id into v_invitation_id;

  insert into public.employee_access (
    restaurant_id, employee_id, access_status, badge_enabled
  )
  values (p_restaurant_id, p_employee_id, 'disabled', false)
  on conflict (restaurant_id, employee_id) do nothing;

  return jsonb_build_object(
    'ok', true,
    'invitation_id', v_invitation_id,
    'email', v_email,
    'expires_at', p_expires_at
  );
end
$register_invitation$;

create function public.revoke_employee_invitation_delivery(
  p_invitation_id uuid,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $revoke_delivery$
begin
  update public.employee_invitations
  set status = 'revoked',
      revoked_at = now(),
      revoked_reason = coalesce(
        nullif(btrim(p_reason), ''),
        'Invitation email delivery failed'
      ),
      updated_at = now()
  where id = p_invitation_id
    and status = 'pending';

  return jsonb_build_object('ok', found);
end
$revoke_delivery$;

create function public.get_employee_invitation_context(
  p_restaurant_id uuid,
  p_invitation_token text
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $invitation_context$
declare
  v_email citext := lower(btrim(coalesce(auth.jwt()->>'email', '')))::citext;
  v_context record;
begin
  if auth.uid() is null or v_email::text = '' then
    raise exception 'Sign in with the invited email account.';
  end if;
  if btrim(coalesce(p_invitation_token, '')) = '' then
    raise exception 'Invitation token is missing.';
  end if;

  select
    i.id,
    i.email,
    i.invited_role,
    i.expires_at,
    i.status,
    e.display_name,
    r.name as restaurant_name
  into v_context
  from public.employee_invitations i
  join public.employees e
    on e.restaurant_id = i.restaurant_id and e.id = i.employee_id
  join public.restaurants r on r.id = i.restaurant_id
  where i.restaurant_id = p_restaurant_id
    and i.token_hash = encode(
      extensions.digest(p_invitation_token, 'sha256'),
      'hex'
    )
  limit 1;

  if v_context.id is null
      or v_context.status <> 'pending'
      or v_context.expires_at <= now() then
    raise exception 'Invitation is invalid, expired or has already been used.';
  end if;
  if lower(v_context.email::text) <> lower(v_email::text) then
    raise exception 'Sign in with the email address that received this invitation.';
  end if;

  return jsonb_build_object(
    'ok', true,
    'restaurant_name', v_context.restaurant_name,
    'employee_name', v_context.display_name,
    'role', v_context.invited_role,
    'expires_at', v_context.expires_at
  );
end
$invitation_context$;

create function public.accept_employee_invite(
  p_restaurant_id uuid,
  p_invitation_token text,
  p_pin text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $accept_invitation$
declare
  v_auth_user_id uuid := auth.uid();
  v_auth_email citext := lower(btrim(coalesce(auth.jwt()->>'email', '')))::citext;
  v_invitation public.employee_invitations%rowtype;
  v_employee public.employees%rowtype;
  v_profile public.profiles%rowtype;
  v_existing_auth_user_id uuid;
  v_role text;
begin
  if v_auth_user_id is null or v_auth_email::text = '' then
    raise exception 'Sign in with the invited email account.';
  end if;
  if btrim(coalesce(p_invitation_token, '')) = '' then
    raise exception 'Invitation token is missing.';
  end if;
  if btrim(coalesce(p_pin, '')) !~ '^[0-9]{4}$' then
    raise exception 'Enter a four-digit badge PIN.';
  end if;

  update public.employee_invitations
  set status = 'expired',
      updated_at = now()
  where status = 'pending'
    and expires_at <= now();

  select * into v_invitation
  from public.employee_invitations i
  where i.restaurant_id = p_restaurant_id
    and i.token_hash = encode(
      extensions.digest(p_invitation_token, 'sha256'),
      'hex'
    )
    and i.status = 'pending'
    and i.expires_at > now()
  limit 1
  for update;

  if v_invitation.id is null then
    raise exception 'Invitation is invalid, expired or has already been used.';
  end if;
  if lower(v_invitation.email::text) <> lower(v_auth_email::text) then
    raise exception 'Sign in with the email address that received this invitation.';
  end if;

  select * into v_employee
  from public.employees e
  where e.restaurant_id = p_restaurant_id
    and e.id = v_invitation.employee_id
    and e.active
  for update;
  if v_employee.id is null then
    raise exception 'The invited employee is no longer active.';
  end if;

  select * into v_profile
  from public.profiles p
  where p.auth_user_id = v_auth_user_id
  limit 1
  for update;

  if v_profile.id is null then
    select * into v_profile
    from public.profiles p
    where lower(p.email::text) = lower(v_auth_email::text)
    limit 1
    for update;

    if v_profile.id is not null then
      v_existing_auth_user_id := v_profile.auth_user_id;
      if v_existing_auth_user_id is not null
          and v_existing_auth_user_id <> v_auth_user_id then
        raise exception 'This email is already linked to another account.';
      end if;
      update public.profiles
      set auth_user_id = v_auth_user_id,
          email = v_auth_email,
          first_name = coalesce(first_name, v_employee.first_name),
          last_name = coalesce(last_name, v_employee.last_name),
          updated_at = now()
      where id = v_profile.id
      returning * into v_profile;
    else
      insert into public.profiles (
        auth_user_id, email, first_name, last_name
      )
      values (
        v_auth_user_id,
        v_auth_email,
        v_employee.first_name,
        v_employee.last_name
      )
      returning * into v_profile;
    end if;
  elsif lower(v_profile.email::text) <> lower(v_auth_email::text) then
    if exists (
      select 1 from public.profiles p
      where lower(p.email::text) = lower(v_auth_email::text)
        and p.id <> v_profile.id
    ) then
      raise exception 'This email is already linked to another profile.';
    end if;
    update public.profiles
    set email = v_auth_email,
        updated_at = now()
    where id = v_profile.id
    returning * into v_profile;
  end if;

  if exists (
    select 1
    from public.employee_access ea
    where ea.restaurant_id = p_restaurant_id
      and ea.profile_id = v_profile.id
      and ea.employee_id <> v_invitation.employee_id
  ) then
    raise exception 'This account is already linked to another employee in the restaurant.';
  end if;

  insert into public.restaurant_memberships (
    restaurant_id, profile_id, role, status
  )
  values (
    p_restaurant_id, v_profile.id, v_invitation.invited_role, 'active'
  )
  on conflict (restaurant_id, profile_id) do update set
    role = case
      when restaurant_memberships.role = 'owner' then 'owner'
      when restaurant_memberships.role = 'manager' then 'manager'
      else excluded.role
    end,
    status = 'active',
    updated_at = now();

  insert into public.employee_access (
    restaurant_id,
    employee_id,
    profile_id,
    access_status,
    badge_enabled
  )
  values (
    p_restaurant_id,
    v_invitation.employee_id,
    v_profile.id,
    'active',
    true
  )
  on conflict (restaurant_id, employee_id) do update set
    profile_id = excluded.profile_id,
    access_status = 'active',
    updated_at = now();

  insert into public.employee_pin_credentials (
    restaurant_id,
    employee_id,
    pin_hash,
    pin_status,
    failed_attempts,
    locked_until,
    last_rotated_at
  )
  values (
    p_restaurant_id,
    v_invitation.employee_id,
    public.crypt(btrim(p_pin), public.gen_salt('bf')),
    'active',
    0,
    null,
    now()
  )
  on conflict (restaurant_id, employee_id) do update set
    pin_hash = excluded.pin_hash,
    pin_status = 'active',
    failed_attempts = 0,
    locked_until = null,
    last_rotated_at = now(),
    updated_at = now();

  update public.employee_invitations
  set status = 'accepted',
      accepted_at = now(),
      accepted_by_profile_id = v_profile.id,
      updated_at = now()
  where id = v_invitation.id;

  select m.role into v_role
  from public.restaurant_memberships m
  where m.restaurant_id = p_restaurant_id
    and m.profile_id = v_profile.id;

  return jsonb_build_object(
    'ok', true,
    'restaurant_id', p_restaurant_id,
    'employee_id', v_invitation.employee_id,
    'role', v_role
  );
end
$accept_invitation$;

create function public.revoke_employee_invitation(
  p_restaurant_id uuid,
  p_employee_id uuid,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $revoke_invitation$
declare
  v_actor record;
  v_invitation public.employee_invitations%rowtype;
begin
  select * into v_actor
  from public.require_owner_or_manager_context(p_restaurant_id)
  limit 1;

  update public.employee_invitations
  set status = 'expired',
      updated_at = now()
  where status = 'pending'
    and expires_at <= now();

  select * into v_invitation
  from public.employee_invitations i
  where i.restaurant_id = p_restaurant_id
    and i.employee_id = p_employee_id
    and i.status = 'pending'
  order by i.sent_at desc
  limit 1
  for update;

  if v_invitation.id is null then
    raise exception 'No pending invitation exists for this employee.';
  end if;
  if v_invitation.invited_role = 'manager'
      and public.active_membership_role(
        p_restaurant_id,
        v_actor.profile_id
      ) <> 'owner' then
    raise exception 'Only an owner can revoke a manager invitation.';
  end if;

  update public.employee_invitations
  set status = 'revoked',
      revoked_at = now(),
      revoked_by_profile_id = v_actor.profile_id,
      revoked_reason = coalesce(
        nullif(btrim(p_reason), ''),
        'Revoked by a workspace administrator'
      ),
      updated_at = now()
  where id = v_invitation.id;

  return jsonb_build_object(
    'runtime_snapshot',
    public.workspace_runtime_snapshot_for_current_context(p_restaurant_id)
  );
end
$revoke_invitation$;

create function public.set_employee_access_state(
  p_restaurant_id uuid,
  p_employee_id uuid,
  p_action text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $set_access_state$
declare
  v_actor record;
  v_action text := lower(btrim(coalesce(p_action, '')));
  v_access public.employee_access%rowtype;
  v_target_role text;
  v_actor_role text;
begin
  select * into v_actor
  from public.require_owner_or_manager_context(p_restaurant_id)
  limit 1;
  v_actor_role := public.active_membership_role(
    p_restaurant_id,
    v_actor.profile_id
  );

  if v_action not in ('disable', 'restore') then
    raise exception 'Access action must be disable or restore.';
  end if;

  select * into v_access
  from public.employee_access ea
  where ea.restaurant_id = p_restaurant_id
    and ea.employee_id = p_employee_id
  for update;

  if v_access.id is null or v_access.profile_id is null then
    raise exception 'This employee does not have a linked account.';
  end if;

  select m.role into v_target_role
  from public.restaurant_memberships m
  where m.restaurant_id = p_restaurant_id
    and m.profile_id = v_access.profile_id
  for update;

  if v_target_role is null then
    raise exception 'The linked account membership is missing.';
  end if;
  if v_target_role = 'owner' then
    raise exception 'Owner access cannot be changed from Team.';
  end if;
  if v_target_role = 'manager' and v_actor_role <> 'owner' then
    raise exception 'Only an owner can manage manager access.';
  end if;

  update public.employee_access
  set access_status = case
        when v_action = 'restore' then 'active'
        else 'disabled'
      end,
      updated_at = now()
  where id = v_access.id;

  update public.restaurant_memberships
  set status = case
        when v_action = 'restore' then 'active'
        else 'disabled'
      end,
      updated_at = now()
  where restaurant_id = p_restaurant_id
    and profile_id = v_access.profile_id;

  return jsonb_build_object(
    'runtime_snapshot',
    public.workspace_runtime_snapshot_for_current_context(p_restaurant_id)
  );
end
$set_access_state$;

-- RPC-only security contract.
revoke all on table public.employee_invitations
  from public, anon, authenticated;
grant all on table public.employee_invitations to service_role;

revoke all on function public.employee_invitation_states_for_restaurant(uuid)
  from public, anon, authenticated;
revoke all on function public.build_workspace_runtime_snapshot_core(
  uuid,text,uuid,uuid,date,date
) from public, anon, authenticated;
revoke all on function public.build_workspace_runtime_snapshot_v2(
  uuid,text,uuid,uuid,date,date
) from public, anon, authenticated;
grant execute on function public.build_workspace_runtime_snapshot_v2(
  uuid,text,uuid,uuid,date,date
) to service_role;

revoke all on function public.register_employee_invitation(
  uuid,uuid,citext,text,text,timestamptz,uuid
) from public, anon, authenticated;
grant execute on function public.register_employee_invitation(
  uuid,uuid,citext,text,text,timestamptz,uuid
) to service_role;

revoke all on function public.revoke_employee_invitation_delivery(uuid,text)
  from public, anon, authenticated;
grant execute on function public.revoke_employee_invitation_delivery(uuid,text)
  to service_role;

revoke all on function public.get_employee_invitation_context(uuid,text)
  from public, anon, authenticated;
grant execute on function public.get_employee_invitation_context(uuid,text)
  to authenticated;

revoke all on function public.accept_employee_invite(uuid,text,text)
  from public, anon, authenticated;
grant execute on function public.accept_employee_invite(uuid,text,text)
  to authenticated;

revoke all on function public.revoke_employee_invitation(uuid,uuid,text)
  from public, anon, authenticated;
grant execute on function public.revoke_employee_invitation(uuid,uuid,text)
  to authenticated;

revoke all on function public.set_employee_access_state(uuid,uuid,text)
  from public, anon, authenticated;
grant execute on function public.set_employee_access_state(uuid,uuid,text)
  to authenticated;

commit;
