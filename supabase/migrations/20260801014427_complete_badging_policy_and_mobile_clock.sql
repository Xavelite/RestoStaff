-- Complete the badge boundary without weakening the existing PIN and station
-- credential model. Policy is explicit restaurant data, evidence is attached
-- to the time entry, and employee phones receive a self-only authenticated
-- path. A paired station remains the preferred shared-device mode because it
-- holds no manager session at all.
begin;

set local lock_timeout = '5s';
set local statement_timeout = '2min';
select pg_advisory_xact_lock(
  hashtextextended('restogogo:20260801014427:complete-badging', 0)
);

alter table public.restaurant_settings
  add column if not exists badge_photo_clock_in_required boolean not null default false,
  add column if not exists badge_photo_clock_out_required boolean not null default false,
  add column if not exists badge_location_capture_enabled boolean not null default false,
  add column if not exists employee_mobile_badging_enabled boolean not null default false,
  add column if not exists badge_policy_revision bigint not null default 0;

alter table public.restaurant_settings
  drop constraint if exists restaurant_settings_badge_policy_revision_check;
alter table public.restaurant_settings
  add constraint restaurant_settings_badge_policy_revision_check
  check (badge_policy_revision >= 0);

alter table public.time_entries
  add column if not exists clock_in_latitude numeric(9,6),
  add column if not exists clock_in_longitude numeric(9,6),
  add column if not exists clock_in_accuracy_meters numeric(10,2),
  add column if not exists clock_out_latitude numeric(9,6),
  add column if not exists clock_out_longitude numeric(9,6),
  add column if not exists clock_out_accuracy_meters numeric(10,2);

alter table public.time_entries
  drop constraint if exists time_entries_clock_in_location_check,
  drop constraint if exists time_entries_clock_out_location_check;
alter table public.time_entries
  add constraint time_entries_clock_in_location_check check (
    (clock_in_latitude is null and clock_in_longitude is null and clock_in_accuracy_meters is null)
    or (
      clock_in_latitude between -90 and 90
      and clock_in_longitude between -180 and 180
      and clock_in_accuracy_meters between 0 and 100000
    )
  ),
  add constraint time_entries_clock_out_location_check check (
    (clock_out_latitude is null and clock_out_longitude is null and clock_out_accuracy_meters is null)
    or (
      clock_out_latitude between -90 and 90
      and clock_out_longitude between -180 and 180
      and clock_out_accuracy_meters between 0 and 100000
    )
  );

comment on column public.restaurant_settings.badge_photo_clock_in_required is
  'When true, every badge-in path must attach private image proof.';
comment on column public.restaurant_settings.badge_photo_clock_out_required is
  'When true, every badge-out path must attach private image proof.';
comment on column public.restaurant_settings.badge_location_capture_enabled is
  'When true, badge clients must capture coordinates as evidence. This is not a geofence.';
comment on column public.restaurant_settings.employee_mobile_badging_enabled is
  'Allows an authenticated employee to clock only themselves from their Restogogo app.';
comment on column public.time_entries.clock_in_latitude is
  'Optional badge-in location evidence, retained with the worked-time record.';
comment on column public.time_entries.clock_out_latitude is
  'Optional badge-out location evidence, retained with the worked-time record.';

create or replace function public.badge_policy_json(p_restaurant_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $badge_policy$
  select jsonb_build_object(
    'photo_clock_in_required', coalesce(rs.badge_photo_clock_in_required, false),
    'photo_clock_out_required', coalesce(rs.badge_photo_clock_out_required, false),
    'location_capture_enabled', coalesce(rs.badge_location_capture_enabled, false),
    'employee_mobile_badging_enabled', coalesce(rs.employee_mobile_badging_enabled, false),
    'revision', coalesce(rs.badge_policy_revision, 0)
  )
  from (select p_restaurant_id as restaurant_id) requested
  left join public.restaurant_settings rs using (restaurant_id)
$badge_policy$;

create or replace function public.set_badge_policy(
  p_restaurant_id uuid,
  p_photo_clock_in_required boolean,
  p_photo_clock_out_required boolean,
  p_location_capture_enabled boolean,
  p_employee_mobile_badging_enabled boolean
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $set_badge_policy$
begin
  if not public.is_owner(p_restaurant_id) then
    raise exception 'Owner access is required to change badging policy.' using errcode = '42501';
  end if;

  update public.restaurant_settings
  set badge_photo_clock_in_required = coalesce(p_photo_clock_in_required, false),
      badge_photo_clock_out_required = coalesce(p_photo_clock_out_required, false),
      badge_location_capture_enabled = coalesce(p_location_capture_enabled, false),
      employee_mobile_badging_enabled = coalesce(p_employee_mobile_badging_enabled, false),
      badge_policy_revision = badge_policy_revision + 1,
      updated_at = now()
  where restaurant_id = p_restaurant_id;

  if not found then
    raise exception 'Restaurant settings were not found.';
  end if;

  return jsonb_build_object('ok', true, 'policy', public.badge_policy_json(p_restaurant_id));
end
$set_badge_policy$;

create or replace function public._badge_apply_evidence(
  p_restaurant_id uuid,
  p_result jsonb,
  p_photo_url text,
  p_latitude double precision,
  p_longitude double precision,
  p_accuracy_meters double precision
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $badge_apply_evidence$
declare
  v_action text := p_result->>'action';
  v_entry_id uuid := nullif(p_result#>>'{time_entry,id}', '')::uuid;
  v_policy jsonb := public.badge_policy_json(p_restaurant_id);
  v_photo_required boolean;
  v_location_required boolean := coalesce((v_policy->>'location_capture_enabled')::boolean, false);
  v_has_photo boolean := nullif(btrim(coalesce(p_photo_url, '')), '') is not null;
  v_has_location boolean := p_latitude is not null and p_longitude is not null;
  v_accuracy numeric(10,2);
begin
  if coalesce((p_result->>'ok')::boolean, false) is not true
      or v_action not in ('in', 'out')
      or v_entry_id is null then
    raise exception 'Badge evidence could not be attached to an invalid result.';
  end if;

  v_photo_required := case v_action
    when 'in' then coalesce((v_policy->>'photo_clock_in_required')::boolean, false)
    else coalesce((v_policy->>'photo_clock_out_required')::boolean, false)
  end;

  if v_photo_required and not v_has_photo then
    raise exception 'A photo is required to clock %.', v_action;
  end if;

  if v_location_required then
    if not v_has_location
        or p_latitude < -90 or p_latitude > 90
        or p_longitude < -180 or p_longitude > 180 then
      raise exception 'Location is required for this badge.';
    end if;
    v_accuracy := least(100000, greatest(0, coalesce(p_accuracy_meters, 0)))::numeric(10,2);
  end if;

  if v_action = 'in' then
    update public.time_entries
    set clock_in_latitude = case when v_location_required then round(p_latitude::numeric, 6) else null end,
        clock_in_longitude = case when v_location_required then round(p_longitude::numeric, 6) else null end,
        clock_in_accuracy_meters = case when v_location_required then v_accuracy else null end
    where id = v_entry_id and restaurant_id = p_restaurant_id;
  else
    update public.time_entries
    set clock_out_latitude = case when v_location_required then round(p_latitude::numeric, 6) else null end,
        clock_out_longitude = case when v_location_required then round(p_longitude::numeric, 6) else null end,
        clock_out_accuracy_meters = case when v_location_required then v_accuracy else null end
    where id = v_entry_id and restaurant_id = p_restaurant_id;
  end if;

  if not found then
    raise exception 'Badge time entry was not found.';
  end if;

  return p_result || jsonb_build_object(
    'badge_policy', v_policy,
    'photo_recorded', v_has_photo,
    'location_recorded', v_location_required and v_has_location
  );
end
$badge_apply_evidence$;

-- Both roster entry points expose the same policy contract. The station result
-- remains scoped to the restaurant resolved by its opaque device token.
create or replace function public.list_badge_roster(p_restaurant_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $list_badge_roster$
begin
  perform 1 from public.require_owner_or_manager_context(p_restaurant_id);
  return public._badge_roster_core(p_restaurant_id)
    || jsonb_build_object('badge_policy', public.badge_policy_json(p_restaurant_id));
end
$list_badge_roster$;

create or replace function public.list_badge_roster_station(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $list_badge_roster_station$
declare
  v_ctx record;
begin
  select * into v_ctx from public.resolve_station_token(p_token) limit 1;
  return public._badge_roster_core(v_ctx.restaurant_id)
    || jsonb_build_object('badge_policy', public.badge_policy_json(v_ctx.restaurant_id));
end
$list_badge_roster_station$;

create or replace function public.record_badge_entry_v2(
  p_restaurant_id uuid,
  p_employee_id uuid,
  p_badge_token uuid,
  p_service_key text default null,
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
as $record_badge_entry_v2$
declare
  v_actor record;
  v_result jsonb;
begin
  select * into v_actor from public.require_owner_or_manager_context(p_restaurant_id) limit 1;
  v_result := public._badge_record_core(
    p_restaurant_id, p_employee_id, p_badge_token, v_actor.profile_id, null,
    p_service_key, p_photo_url, p_photo_status
  );
  return public._badge_apply_evidence(
    p_restaurant_id, v_result, p_photo_url, p_latitude, p_longitude, p_accuracy_meters
  );
end
$record_badge_entry_v2$;

create or replace function public.record_badge_entry_station_v2(
  p_token text,
  p_employee_id uuid,
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
as $record_badge_entry_station_v2$
declare
  v_ctx record;
  v_result jsonb;
begin
  select * into v_ctx from public.resolve_station_token(p_token) limit 1;
  v_result := public._badge_record_core(
    v_ctx.restaurant_id, p_employee_id, p_badge_token, null, v_ctx.station_id,
    null, p_photo_url, p_photo_status
  );
  return public._badge_apply_evidence(
    v_ctx.restaurant_id, v_result, p_photo_url, p_latitude, p_longitude, p_accuracy_meters
  );
end
$record_badge_entry_station_v2$;

-- Keep the established RPC names during a rolling client deployment, but do
-- not let them become an evidence-policy bypass. They can still be used while
-- every policy option is off; a required location deliberately makes an old
-- client fail closed because it cannot supply coordinates.
create or replace function public.record_badge_entry(
  p_restaurant_id uuid,
  p_employee_id uuid,
  p_badge_token uuid,
  p_service_key text default null,
  p_photo_url text default null,
  p_photo_status text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $record_badge_entry_legacy$
declare
  v_actor record;
  v_result jsonb;
begin
  select * into v_actor from public.require_owner_or_manager_context(p_restaurant_id) limit 1;
  v_result := public._badge_record_core(
    p_restaurant_id, p_employee_id, p_badge_token, v_actor.profile_id, null,
    p_service_key, p_photo_url, p_photo_status
  );
  return public._badge_apply_evidence(
    p_restaurant_id, v_result, p_photo_url, null, null, null
  );
end
$record_badge_entry_legacy$;

create or replace function public.record_badge_entry_station(
  p_token text,
  p_employee_id uuid,
  p_badge_token uuid,
  p_photo_url text default null,
  p_photo_status text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $record_badge_entry_station_legacy$
declare
  v_ctx record;
  v_result jsonb;
begin
  select * into v_ctx from public.resolve_station_token(p_token) limit 1;
  v_result := public._badge_record_core(
    v_ctx.restaurant_id, p_employee_id, p_badge_token, null, v_ctx.station_id,
    null, p_photo_url, p_photo_status
  );
  return public._badge_apply_evidence(
    v_ctx.restaurant_id, v_result, p_photo_url, null, null, null
  );
end
$record_badge_entry_station_legacy$;

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

  select e.id, e.display_name
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
  ) then
    raise exception 'Employee badge access is not active.' using errcode = '42501';
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

  v_result := public._badge_record_core(
    p_restaurant_id, v_actor.employee_id, p_badge_token, v_actor.profile_id, null,
    null, p_photo_url, p_photo_status
  );
  return public._badge_apply_evidence(
    p_restaurant_id, v_result, p_photo_url, p_latitude, p_longitude, p_accuracy_meters
  );
end
$record_own_badge_entry$;

revoke all on function public.badge_policy_json(uuid) from public, anon, authenticated;
revoke all on function public._badge_apply_evidence(uuid, jsonb, text, double precision, double precision, double precision) from public, anon, authenticated;

revoke all on function public.set_badge_policy(uuid, boolean, boolean, boolean, boolean) from public, anon, authenticated;
grant execute on function public.set_badge_policy(uuid, boolean, boolean, boolean, boolean) to authenticated;

revoke all on function public.record_badge_entry_v2(uuid, uuid, uuid, text, text, text, double precision, double precision, double precision) from public, anon, authenticated;
grant execute on function public.record_badge_entry_v2(uuid, uuid, uuid, text, text, text, double precision, double precision, double precision) to authenticated;

revoke all on function public.record_badge_entry_station_v2(text, uuid, uuid, text, text, double precision, double precision, double precision) from public;
grant execute on function public.record_badge_entry_station_v2(text, uuid, uuid, text, text, double precision, double precision, double precision) to anon, authenticated;

revoke all on function public.record_badge_entry(uuid, uuid, uuid, text, text, text) from public, anon, authenticated;
grant execute on function public.record_badge_entry(uuid, uuid, uuid, text, text, text) to authenticated;
revoke all on function public.record_badge_entry_station(text, uuid, uuid, text, text) from public;
grant execute on function public.record_badge_entry_station(text, uuid, uuid, text, text) to anon, authenticated;

revoke all on function public.get_own_badge_context(uuid) from public, anon, authenticated;
revoke all on function public.begin_own_badge(uuid) from public, anon, authenticated;
revoke all on function public.record_own_badge_entry(uuid, uuid, text, text, double precision, double precision, double precision) from public, anon, authenticated;
grant execute on function public.get_own_badge_context(uuid) to authenticated;
grant execute on function public.begin_own_badge(uuid) to authenticated;
grant execute on function public.record_own_badge_entry(uuid, uuid, text, text, double precision, double precision, double precision) to authenticated;

notify pgrst, 'reload schema';
commit;
