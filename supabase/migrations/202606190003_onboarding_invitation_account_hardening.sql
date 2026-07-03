-- Phase 8: resumable onboarding, auditable expiring invitations and account profile.
begin;

set local lock_timeout = '5s';
set local statement_timeout = '2min';
select pg_advisory_xact_lock(
  hashtextextended('restogogo:202606190003:onboarding-invitation-account', 0)
);

create table public.owner_onboarding_drafts (
  auth_user_id uuid primary key references auth.users(id) on delete cascade,
  step smallint not null default 0,
  draft jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint owner_onboarding_drafts_step_check check (step between 0 and 7),
  constraint owner_onboarding_drafts_object_check
    check (jsonb_typeof(draft) = 'object')
);

alter table public.owner_onboarding_drafts enable row level security;
revoke all on public.owner_onboarding_drafts from public, anon, authenticated;
grant all on public.owner_onboarding_drafts to service_role;

create table public.employee_invitations (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  employee_id uuid not null,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  email citext not null,
  invited_role text not null,
  token_hash text not null unique,
  status text not null default 'pending',
  expires_at timestamptz not null,
  sent_at timestamptz not null default now(),
  accepted_at timestamptz,
  revoked_at timestamptz,
  invited_by_profile_id uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint employee_invitations_employee_fk
    foreign key (restaurant_id, employee_id)
    references public.employees(restaurant_id, id) on delete cascade,
  constraint employee_invitations_role_check
    check (invited_role in ('manager', 'employee')),
  constraint employee_invitations_status_check
    check (status in ('pending', 'accepted', 'expired', 'revoked')),
  constraint employee_invitations_expiry_check check (expires_at > sent_at)
);

create index employee_invitations_lookup_idx
  on public.employee_invitations (restaurant_id, profile_id, status, expires_at);
create unique index employee_invitations_one_pending_idx
  on public.employee_invitations (restaurant_id, employee_id)
  where status = 'pending';

alter table public.employee_invitations enable row level security;
revoke all on public.employee_invitations from public, anon, authenticated;
grant all on public.employee_invitations to service_role;

insert into storage.buckets (
  id, name, public, file_size_limit, allowed_mime_types
)
values (
  'badge-proofs',
  'badge-proofs',
  false,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create or replace function public.save_owner_onboarding_draft(
  p_step smallint,
  p_draft jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_auth_user_id uuid := auth.uid();
begin
  if v_auth_user_id is null then raise exception 'Authentication required.'; end if;
  if p_step not between 0 and 7 then raise exception 'Invalid onboarding step.'; end if;
  if jsonb_typeof(coalesce(p_draft, '{}'::jsonb)) <> 'object' then
    raise exception 'Onboarding draft must be an object.';
  end if;

  insert into public.owner_onboarding_drafts (auth_user_id, step, draft)
  values (v_auth_user_id, p_step, p_draft)
  on conflict (auth_user_id) do update set
    step = excluded.step,
    draft = excluded.draft,
    updated_at = now();

  return jsonb_build_object('ok', true, 'step', p_step, 'updated_at', now());
end;
$$;

create or replace function public.get_owner_onboarding_draft()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (
      select jsonb_build_object(
        'step', d.step,
        'draft', d.draft,
        'updated_at', d.updated_at
      )
      from public.owner_onboarding_drafts d
      where d.auth_user_id = auth.uid()
    ),
    '{}'::jsonb
  )
$$;

create or replace function public.clear_owner_onboarding_draft()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then raise exception 'Authentication required.'; end if;
  delete from public.owner_onboarding_drafts where auth_user_id = auth.uid();
  return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.register_employee_invitation(
  p_restaurant_id uuid,
  p_employee_id uuid,
  p_profile_id uuid,
  p_email citext,
  p_role text,
  p_token text,
  p_expires_at timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_invitation_id uuid;
begin
  if coalesce(btrim(p_token), '') = '' then raise exception 'Invitation token is required.'; end if;
  if p_expires_at <= now() then raise exception 'Invitation expiry must be in the future.'; end if;
  if p_role not in ('manager', 'employee') then raise exception 'Invalid invitation role.'; end if;
  if not exists (
    select 1 from public.employee_access ea
    where ea.restaurant_id = p_restaurant_id
      and ea.employee_id = p_employee_id
      and ea.profile_id = p_profile_id
  ) then
    raise exception 'Employee access must be linked before registering an invitation.';
  end if;

  update public.employee_invitations
  set status = 'revoked', revoked_at = now(), updated_at = now()
  where restaurant_id = p_restaurant_id
    and employee_id = p_employee_id
    and status = 'pending';

  insert into public.employee_invitations (
    restaurant_id, employee_id, profile_id, email, invited_role,
    token_hash, expires_at, invited_by_profile_id
  )
  values (
    p_restaurant_id, p_employee_id, p_profile_id, lower(p_email::text)::citext,
    p_role, encode(extensions.digest(p_token, 'sha256'), 'hex'), p_expires_at,
    null
  )
  returning id into v_invitation_id;

  update public.employee_access
  set access_status = 'invited',
      temporary_access_expires_at = p_expires_at,
      updated_at = now()
  where restaurant_id = p_restaurant_id and employee_id = p_employee_id;

  return jsonb_build_object(
    'ok', true,
    'invitation_id', v_invitation_id,
    'expires_at', p_expires_at
  );
end;
$$;

create or replace function public.accept_employee_invite_v2(
  p_restaurant_id uuid,
  p_invitation_token text,
  p_pin text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile_id uuid := public.current_profile_id();
  v_invitation public.employee_invitations%rowtype;
begin
  if v_profile_id is null then raise exception 'Authenticated profile required.'; end if;
  if btrim(coalesce(p_invitation_token, '')) = '' then
    raise exception 'Invitation token is missing.';
  end if;
  if btrim(coalesce(p_pin, '')) !~ '^[0-9]{4}$' then
    raise exception 'Enter a four-digit badge PIN.';
  end if;

  update public.employee_invitations
  set status = 'expired', updated_at = now()
  where status = 'pending' and expires_at <= now();

  select * into v_invitation
  from public.employee_invitations i
  where i.restaurant_id = p_restaurant_id
    and i.profile_id = v_profile_id
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

  insert into public.restaurant_memberships (
    restaurant_id, profile_id, role, status
  )
  values (
    p_restaurant_id, v_profile_id, v_invitation.invited_role, 'active'
  )
  on conflict (restaurant_id, profile_id) do update set
    role = case
      when restaurant_memberships.role = 'owner' then 'owner'
      else excluded.role
    end,
    status = 'active',
    updated_at = now();

  update public.employee_access
  set profile_id = v_profile_id,
      access_status = 'active',
      temporary_access_expires_at = null,
      must_change_password = false,
      updated_at = now()
  where restaurant_id = p_restaurant_id
    and employee_id = v_invitation.employee_id;

  insert into public.employee_pin_credentials (
    restaurant_id, employee_id, pin_hash, pin_status,
    failed_attempts, locked_until, last_rotated_at
  )
  values (
    p_restaurant_id, v_invitation.employee_id,
    public.crypt(btrim(p_pin), public.gen_salt('bf')),
    'active', 0, null, now()
  )
  on conflict (restaurant_id, employee_id) do update set
    pin_hash = excluded.pin_hash,
    pin_status = 'active',
    failed_attempts = 0,
    locked_until = null,
    last_rotated_at = now(),
    updated_at = now();

  update public.employee_invitations
  set status = 'accepted', accepted_at = now(), updated_at = now()
  where id = v_invitation.id;

  return jsonb_build_object(
    'ok', true,
    'restaurant_id', p_restaurant_id,
    'employee_id', v_invitation.employee_id,
    'role', v_invitation.invited_role
  );
end;
$$;

create or replace function public.update_own_profile(
  p_first_name text,
  p_last_name text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile_id uuid := public.current_profile_id();
begin
  if v_profile_id is null then raise exception 'Authenticated profile required.'; end if;
  if nullif(btrim(p_first_name), '') is null
     or nullif(btrim(p_last_name), '') is null then
    raise exception 'First and last name are required.';
  end if;

  update public.profiles
  set first_name = btrim(p_first_name),
      last_name = btrim(p_last_name),
      updated_at = now()
  where id = v_profile_id;

  return jsonb_build_object(
    'ok', true,
    'profile_id', v_profile_id,
    'first_name', btrim(p_first_name),
    'last_name', btrim(p_last_name)
  );
end;
$$;

revoke all on function public.save_owner_onboarding_draft(smallint,jsonb) from public, anon, authenticated;
revoke all on function public.get_owner_onboarding_draft() from public, anon, authenticated;
revoke all on function public.clear_owner_onboarding_draft() from public, anon, authenticated;
revoke all on function public.register_employee_invitation(uuid,uuid,uuid,citext,text,text,timestamptz) from public, anon, authenticated;
revoke all on function public.accept_employee_invite_v2(uuid,text,text) from public, anon, authenticated;
revoke all on function public.update_own_profile(text,text) from public, anon, authenticated;
revoke all on function public.accept_employee_invite(uuid,text) from public, anon, authenticated;

grant execute on function public.save_owner_onboarding_draft(smallint,jsonb) to authenticated;
grant execute on function public.get_owner_onboarding_draft() to authenticated;
grant execute on function public.clear_owner_onboarding_draft() to authenticated;
grant execute on function public.register_employee_invitation(uuid,uuid,uuid,citext,text,text,timestamptz) to service_role;
grant execute on function public.accept_employee_invite_v2(uuid,text,text) to authenticated;
grant execute on function public.update_own_profile(text,text) to authenticated;

commit;
