-- Finish the badge-device workflow without weakening the station credential
-- boundary. Phone badging is granted per employee, while camera and location
-- policy remains restaurant-wide and server enforced.
begin;

set local lock_timeout = '5s';
set local statement_timeout = '2min';
select pg_advisory_xact_lock(
  hashtextextended('restogogo:20260801023104:complete-badging-device-access', 0)
);

alter table public.employee_access
  add column if not exists mobile_badging_enabled boolean not null default false;

comment on column public.employee_access.mobile_badging_enabled is
  'Allows this employee to use the authenticated self-only phone clock when the restaurant policy is enabled.';

create or replace function public.set_employee_mobile_badging(
  p_restaurant_id uuid,
  p_employee_id uuid,
  p_enabled boolean
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $set_employee_mobile_badging$
declare
  v_enabled boolean := coalesce(p_enabled, false);
begin
  if not public.is_owner(p_restaurant_id) then
    raise exception 'Owner access is required to change phone badging access.' using errcode = '42501';
  end if;

  update public.employee_access ea
  set mobile_badging_enabled = v_enabled,
      updated_at = now()
  where ea.restaurant_id = p_restaurant_id
    and ea.employee_id = p_employee_id
    and exists (
      select 1
      from public.employees e
      where e.restaurant_id = ea.restaurant_id
        and e.id = ea.employee_id
    );

  if not found then
    raise exception 'Employee access was not found.';
  end if;

  return jsonb_build_object(
    'ok', true,
    'restaurant_id', p_restaurant_id,
    'employee_id', p_employee_id,
    'mobile_badging_enabled', v_enabled
  );
end
$set_employee_mobile_badging$;

-- A pairing secret remains unreadable after creation. If a newly-created
-- device has not connected yet, a manager may replace that unused secret
-- instead of storing plaintext credentials in the database.
create or replace function public.rotate_unused_restaurant_station_token(
  p_restaurant_id uuid,
  p_station_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $rotate_unused_station$
declare
  v_token text;
begin
  perform 1 from public.require_owner_or_manager_context(p_restaurant_id);
  v_token := encode(extensions.gen_random_bytes(24), 'hex');

  update public.restaurant_stations s
  set token_hash = encode(extensions.digest(v_token, 'sha256'), 'hex')
  where s.restaurant_id = p_restaurant_id
    and s.id = p_station_id
    and s.revoked_at is null
    and s.last_used_at is null;

  if not found then
    raise exception 'Only a device that has not connected can receive a new pairing code.';
  end if;

  return jsonb_build_object(
    'ok', true,
    'station_id', p_station_id,
    'token', v_token
  );
end
$rotate_unused_station$;

create or replace function public.get_own_badge_context(p_restaurant_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $own_badge_context$
declare
  v_actor record;
  v_employee record;
  v_latest record;
  v_policy jsonb;
  v_timezone text;
begin
  select * into v_actor from public.require_workspace_read_context(p_restaurant_id) limit 1;
  if v_actor.actor_role <> 'employee' or v_actor.employee_id is null then
    raise exception 'Employee access is required for mobile badging.' using errcode = '42501';
  end if;

  select e.id, e.display_name, ea.mobile_badging_enabled
  into v_employee
  from public.employees e
  join public.employee_access ea
    on ea.restaurant_id = e.restaurant_id and ea.employee_id = e.id
  where e.restaurant_id = p_restaurant_id
    and e.id = v_actor.employee_id
    and e.active
    and ea.profile_id = v_actor.profile_id
    and ea.access_status = 'active'
    and ea.badge_enabled;
  if v_employee.id is null then
    raise exception 'Employee badge access is not active.' using errcode = '42501';
  end if;

  v_policy := public.badge_policy_json(p_restaurant_id);
  select coalesce(nullif(btrim(rs.timezone), ''), 'Europe/Brussels')
  into v_timezone
  from public.restaurant_settings rs where rs.restaurant_id = p_restaurant_id;
  v_timezone := coalesce(v_timezone, 'Europe/Brussels');

  select t.status, t.service_key,
         coalesce(t.clock_out_at, t.clock_in_at, t.updated_at) as badged_at
  into v_latest
  from public.time_entries t
  where t.restaurant_id = p_restaurant_id
    and t.employee_id = v_employee.id
    and (
      t.status = 'open'
      or t.business_date = (now() at time zone v_timezone)::date
    )
  order by (t.status = 'open') desc,
           coalesce(t.clock_out_at, t.clock_in_at, t.updated_at) desc
  limit 1;

  return jsonb_build_object(
    'ok', true,
    'restaurant_id', p_restaurant_id,
    'restaurant_name', (select r.name from public.restaurants r where r.id = p_restaurant_id),
    'logo_path', (select r.logo_path from public.restaurants r where r.id = p_restaurant_id),
    'timezone', v_timezone,
    'employee_id', v_employee.id,
    'display_name', v_employee.display_name,
    'mobile_badging_enabled', coalesce(v_employee.mobile_badging_enabled, false),
    'clocked_in', coalesce(v_latest.status = 'open', false),
    'service_key', v_latest.service_key,
    'last_action', case when v_latest.status = 'open' then 'in' when v_latest.badged_at is not null then 'out' end,
    'last_local_time', case when v_latest.badged_at is null then null else to_char(v_latest.badged_at at time zone v_timezone, 'HH24:MI') end,
    'badge_policy', v_policy
  );
end
$own_badge_context$;

create or replace function public.begin_own_badge(p_restaurant_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $begin_own_badge$
declare
  v_actor record;
  v_token uuid;
  v_expires timestamptz;
  v_policy jsonb;
begin
  select * into v_actor from public.require_workspace_read_context(p_restaurant_id) limit 1;
  if v_actor.actor_role <> 'employee' or v_actor.employee_id is null then
    raise exception 'Employee access is required for mobile badging.' using errcode = '42501';
  end if;
  v_policy := public.badge_policy_json(p_restaurant_id);
  if coalesce((v_policy->>'employee_mobile_badging_enabled')::boolean, false) is not true then
    raise exception 'Mobile badging is not enabled for this restaurant.' using errcode = '42501';
  end if;
  if not exists (
    select 1
    from public.employees e
    join public.employee_access ea
      on ea.restaurant_id = e.restaurant_id and ea.employee_id = e.id
    where e.restaurant_id = p_restaurant_id
      and e.id = v_actor.employee_id
      and e.active
      and ea.profile_id = v_actor.profile_id
      and ea.access_status = 'active'
      and ea.badge_enabled
      and ea.mobile_badging_enabled
  ) then
    raise exception 'Phone badging is not enabled for this employee.' using errcode = '42501';
  end if;

  delete from public.badge_verification_challenges
  where expires_at < now() - interval '1 hour'
     or used_at < now() - interval '1 hour';

  v_token := gen_random_uuid();
  v_expires := now() + interval '2 minutes';
  insert into public.badge_verification_challenges (
    restaurant_id, employee_id, actor_profile_id, station_id, token_hash, expires_at
  ) values (
    p_restaurant_id,
    v_actor.employee_id,
    v_actor.profile_id,
    null,
    encode(extensions.digest(v_token::text, 'sha256'), 'hex'),
    v_expires
  );

  return jsonb_build_object(
    'ok', true,
    'employee_id', v_actor.employee_id,
    'badge_token', v_token,
    'expires_at', v_expires,
    'badge_policy', v_policy
  );
end
$begin_own_badge$;

create or replace function public.record_own_badge_entry(
  p_restaurant_id uuid,
  p_badge_token uuid,
  p_photo_url text default null,
  p_photo_status text default null,
  p_latitude double precision default null,
  p_longitude double precision default null,
  p_accuracy_meters double precision default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $record_own_badge_entry$
declare
  v_actor record;
  v_policy jsonb;
  v_result jsonb;
begin
  select * into v_actor from public.require_workspace_read_context(p_restaurant_id) limit 1;
  if v_actor.actor_role <> 'employee' or v_actor.employee_id is null then
    raise exception 'Employee access is required for mobile badging.' using errcode = '42501';
  end if;
  v_policy := public.badge_policy_json(p_restaurant_id);
  if coalesce((v_policy->>'employee_mobile_badging_enabled')::boolean, false) is not true then
    raise exception 'Mobile badging is not enabled for this restaurant.' using errcode = '42501';
  end if;
  if not exists (
    select 1
    from public.employees e
    join public.employee_access ea
      on ea.restaurant_id = e.restaurant_id and ea.employee_id = e.id
    where e.restaurant_id = p_restaurant_id
      and e.id = v_actor.employee_id
      and e.active
      and ea.profile_id = v_actor.profile_id
      and ea.access_status = 'active'
      and ea.badge_enabled
      and ea.mobile_badging_enabled
  ) then
    raise exception 'Phone badging is not enabled for this employee.' using errcode = '42501';
  end if;

  v_result := public._badge_record_core(
    p_restaurant_id, v_actor.employee_id, p_badge_token, v_actor.profile_id, null,
    null, p_photo_url, p_photo_status
  );
  return public._badge_apply_evidence(
    p_restaurant_id, v_result, p_photo_url, p_latitude, p_longitude, p_accuracy_meters
  );
end
$record_own_badge_entry$;

revoke all on function public.set_employee_mobile_badging(uuid, uuid, boolean) from public, anon, authenticated;
grant execute on function public.set_employee_mobile_badging(uuid, uuid, boolean) to authenticated;

revoke all on function public.rotate_unused_restaurant_station_token(uuid, uuid) from public, anon, authenticated;
grant execute on function public.rotate_unused_restaurant_station_token(uuid, uuid) to authenticated;

commit;
