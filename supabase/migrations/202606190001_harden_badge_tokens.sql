-- Preconditions:
-- - badge_verification_challenges and employee_pin_credentials exist.
-- - require_owner_or_manager_context() and badge_photo_status_to_db() exist.
-- - pgcrypto is installed in the extensions schema.
--
-- Rollback: restore the previous functions from the pre-deployment backup.
-- Never restore the deprecated record_badge_entry signature in production.
begin;

drop function if exists public.list_badge_roster(uuid);
create function public.list_badge_roster(p_restaurant_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rows jsonb;
begin
  perform 1 from public.require_owner_or_manager_context(p_restaurant_id);
  select coalesce(
    jsonb_agg(
      jsonb_build_object('employee_id', e.id, 'display_name', e.display_name)
      order by e.display_name
    ),
    '[]'::jsonb
  )
  into v_rows
  from public.employees e
  join public.employee_access ea
    on ea.restaurant_id = e.restaurant_id and ea.employee_id = e.id
  join public.employee_pin_credentials pc
    on pc.restaurant_id = e.restaurant_id and pc.employee_id = e.id
  where e.restaurant_id = p_restaurant_id
    and e.active
    and ea.access_status = 'active'
    and ea.badge_enabled
    and pc.pin_status = 'active';

  return jsonb_build_object('restaurant_id', p_restaurant_id, 'employees', v_rows);
end;
$$;

create or replace function public.verify_badge_pin(
  p_restaurant_id uuid,
  p_employee_id uuid,
  p_pin text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor record;
  v_credential record;
  v_failed integer;
  v_locked_until timestamptz;
  v_token uuid;
  v_expires timestamptz;
begin
  if trim(coalesce(p_pin, '')) !~ '^[0-9]{4}$' then
    raise exception 'Enter your 4-digit PIN.';
  end if;
  select * into v_actor
  from public.require_owner_or_manager_context(p_restaurant_id)
  limit 1;

  if not exists (
    select 1
    from public.employees e
    join public.employee_access ea
      on ea.restaurant_id = e.restaurant_id and ea.employee_id = e.id
    where e.restaurant_id = p_restaurant_id
      and e.id = p_employee_id
      and e.active
      and ea.access_status = 'active'
      and ea.badge_enabled
  ) then
    raise exception 'Employee badge access is not active.';
  end if;

  select * into v_credential
  from public.employee_pin_credentials pc
  where pc.restaurant_id = p_restaurant_id and pc.employee_id = p_employee_id
  limit 1
  for update;

  if v_credential.employee_id is null or v_credential.pin_status <> 'active' then
    raise exception 'PIN credential is not active for this employee.';
  end if;
  if v_credential.locked_until is not null and v_credential.locked_until > now() then
    return jsonb_build_object(
      'ok', false,
      'code', 'pin_locked',
      'message', 'PIN is temporarily locked. Try again later.',
      'locked_until', v_credential.locked_until
    );
  end if;

  if v_credential.pin_hash <> public.crypt(trim(p_pin), v_credential.pin_hash) then
    v_failed := coalesce(v_credential.failed_attempts, 0) + 1;
    v_locked_until := case when v_failed >= 5 then now() + interval '10 minutes' end;
    update public.employee_pin_credentials
    set failed_attempts = v_failed,
        locked_until = v_locked_until,
        updated_at = now()
    where restaurant_id = p_restaurant_id and employee_id = p_employee_id;
    return jsonb_build_object(
      'ok', false,
      'code', case when v_locked_until is null then 'wrong_pin' else 'pin_locked' end,
      'message', case when v_locked_until is null
        then 'Wrong PIN. Please try again.'
        else 'PIN is temporarily locked. Try again later.'
      end,
      'attempts_remaining', greatest(0, 5 - v_failed),
      'locked_until', v_locked_until
    );
  end if;

  update public.employee_pin_credentials
  set failed_attempts = 0, locked_until = null, updated_at = now()
  where restaurant_id = p_restaurant_id and employee_id = p_employee_id;

  delete from public.badge_verification_challenges
  where expires_at < now() - interval '1 hour'
     or used_at < now() - interval '1 hour';

  v_token := gen_random_uuid();
  v_expires := now() + interval '2 minutes';
  insert into public.badge_verification_challenges (
    restaurant_id, employee_id, actor_profile_id, token_hash, expires_at
  )
  values (
    p_restaurant_id,
    p_employee_id,
    v_actor.profile_id,
    encode(extensions.digest(v_token::text, 'sha256'), 'hex'),
    v_expires
  );

  return jsonb_build_object(
    'ok', true,
    'employee_id', p_employee_id,
    'badge_token', v_token,
    'expires_at', v_expires
  );
end;
$$;

drop function if exists public.record_badge_entry(uuid, uuid, text, date, text, text, text, timestamptz);
drop function if exists public.record_badge_entry(uuid, uuid, uuid, text, text, text);
create function public.record_badge_entry(
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
as $$
declare
  v_actor record;
  v_challenge record;
  v_open_entry record;
  v_badged_at timestamptz := now();
  v_timezone text;
  v_business_date date;
  v_service_key text := lower(trim(coalesce(p_service_key, '')));
  v_photo_status text := public.badge_photo_status_to_db(p_photo_status, p_photo_url);
  v_entry_id uuid;
  v_action text;
begin
  select * into v_actor
  from public.require_owner_or_manager_context(p_restaurant_id)
  limit 1;

  if not exists (
    select 1
    from public.employees e
    join public.employee_access ea
      on ea.restaurant_id = e.restaurant_id and ea.employee_id = e.id
    where e.restaurant_id = p_restaurant_id
      and e.id = p_employee_id
      and e.active
      and ea.access_status = 'active'
      and ea.badge_enabled
  ) then
    raise exception 'Employee badge access is not active.';
  end if;

  select * into v_challenge
  from public.badge_verification_challenges c
  where c.restaurant_id = p_restaurant_id
    and c.employee_id = p_employee_id
    and c.actor_profile_id = v_actor.profile_id
    and c.token_hash = encode(extensions.digest(p_badge_token::text, 'sha256'), 'hex')
    and c.used_at is null
    and c.expires_at >= v_badged_at
  limit 1
  for update;

  if v_challenge.id is null then
    raise exception 'Badge verification expired or was already used. Enter the PIN again.';
  end if;
  update public.badge_verification_challenges set used_at = v_badged_at where id = v_challenge.id;
  update public.employee_pin_credentials
  set last_used_at = v_badged_at, updated_at = v_badged_at
  where restaurant_id = p_restaurant_id and employee_id = p_employee_id;

  select coalesce(nullif(trim(rs.timezone), ''), 'Europe/Brussels')
  into v_timezone
  from public.restaurant_settings rs
  where rs.restaurant_id = p_restaurant_id;
  v_timezone := coalesce(v_timezone, 'Europe/Brussels');
  v_business_date := (v_badged_at at time zone v_timezone)::date;

  select * into v_open_entry
  from public.time_entries t
  where t.restaurant_id = p_restaurant_id
    and t.employee_id = p_employee_id
    and t.status = 'open'
  order by t.clock_in_at desc
  limit 1
  for update;

  if v_open_entry.id is not null then
    update public.time_entries
    set clock_out_at = v_badged_at,
        clock_out_photo_url = nullif(trim(coalesce(p_photo_url, '')), ''),
        clock_out_photo_status = v_photo_status,
        clock_out_photo_captured_at = case when nullif(trim(coalesce(p_photo_url, '')), '') is null then null else v_badged_at end,
        status = 'closed',
        updated_at = v_badged_at
    where id = v_open_entry.id
    returning id into v_entry_id;
    v_action := 'out';
  else
    if v_service_key not in ('lunch', 'evening') or not exists (
      select 1 from public.services s
      where s.restaurant_id = p_restaurant_id
        and s.service_key = v_service_key
        and s.active
    ) then
      raise exception 'Select an active service before clocking in.';
    end if;
    insert into public.time_entries (
      restaurant_id, employee_id, business_date, service_key,
      clock_in_at, clock_in_photo_url, clock_in_photo_status,
      clock_in_photo_captured_at, source, status
    )
    values (
      p_restaurant_id, p_employee_id, v_business_date, v_service_key,
      v_badged_at, nullif(trim(coalesce(p_photo_url, '')), ''), v_photo_status,
      case when nullif(trim(coalesce(p_photo_url, '')), '') is null then null else v_badged_at end,
      'badge_terminal', 'open'
    )
    returning id into v_entry_id;
    v_action := 'in';
  end if;

  return jsonb_build_object(
    'ok', true,
    'action', v_action,
    'badged_at', v_badged_at,
    'local_time', to_char(v_badged_at at time zone v_timezone, 'HH24:MI'),
    'timezone', v_timezone,
    'time_entry', (select to_jsonb(t) from public.time_entries t where t.id = v_entry_id)
  );
end;
$$;

revoke all on function public.list_badge_roster(uuid) from public, anon, authenticated;
revoke all on function public.verify_badge_pin(uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.record_badge_entry(uuid, uuid, uuid, text, text, text) from public, anon, authenticated;
grant execute on function public.list_badge_roster(uuid) to authenticated;
grant execute on function public.verify_badge_pin(uuid, uuid, text) to authenticated;
grant execute on function public.record_badge_entry(uuid, uuid, uuid, text, text, text) to authenticated;

commit;
