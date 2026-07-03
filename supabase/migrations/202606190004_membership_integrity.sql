begin;

set local lock_timeout = '5s';
set local statement_timeout = '60s';

-- Invitation acceptance must never demote an existing owner. Re-declare the
-- function here so already-provisioned development databases receive the same
-- invariant even if migration 003 was previously applied.
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
    and i.token_hash = encode(extensions.digest(p_invitation_token, 'sha256'), 'hex')
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
    'role', (
      select role
      from public.restaurant_memberships
      where restaurant_id = p_restaurant_id and profile_id = v_profile_id
    )
  );
end;
$$;

revoke all on function public.accept_employee_invite_v2(uuid,text,text)
  from public, anon, authenticated;
grant execute on function public.accept_employee_invite_v2(uuid,text,text)
  to authenticated;

-- Conservative repair for the historical demotion bug. A restaurant is
-- repaired only when it has no active owner and its public contact email maps
-- to exactly one authenticated profile that already has an active membership.
with repair_candidates as (
  select
    r.id as restaurant_id,
    (array_agg(p.id order by p.id))[1] as profile_id
  from public.restaurants r
  join public.profiles p
    on lower(p.email::text) = lower(r.email::text)
   and p.auth_user_id is not null
  join public.restaurant_memberships candidate
    on candidate.restaurant_id = r.id
   and candidate.profile_id = p.id
   and candidate.status = 'active'
  where r.email is not null
    and not exists (
      select 1
      from public.restaurant_memberships owner_membership
      where owner_membership.restaurant_id = r.id
        and owner_membership.role = 'owner'
        and owner_membership.status = 'active'
    )
  group by r.id
  having count(distinct p.id) = 1
)
update public.restaurant_memberships membership
set role = 'owner',
    status = 'active',
    updated_at = now()
from repair_candidates candidate
where membership.restaurant_id = candidate.restaurant_id
  and membership.profile_id = candidate.profile_id;

commit;
