-- Device-bound station credential for the badge terminal.
--
-- A shared tablet can pair once and hold only an opaque, revocable token that
-- can call badge RPCs for exactly one restaurant — never a manager session,
-- never manager data. The three badge operations are refactored into auth-thin
-- wrappers over shared cores so a manager JWT and a station token reach the same
-- clock logic. The station wrappers are the only new anon-callable surface; they
-- expose just what a wall-mounted clock needs (employee names + clocked-in state
-- for one restaurant) and inherit the existing 5-attempt/10-minute PIN lockout.
begin;

-- 1. Paired devices ---------------------------------------------------------
create table if not exists public.restaurant_stations (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  label text not null,
  token_hash text not null unique,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  last_used_at timestamptz,
  revoked_at timestamptz
);

create index if not exists restaurant_stations_active_idx
  on public.restaurant_stations (restaurant_id)
  where revoked_at is null;

alter table public.restaurant_stations enable row level security;

-- Only owners/managers of the restaurant can see or manage its stations; anon
-- never touches the table directly (station RPCs are SECURITY DEFINER).
drop policy if exists restaurant_stations_read on public.restaurant_stations;
create policy restaurant_stations_read on public.restaurant_stations
  for select to authenticated
  using (public.is_owner_or_manager(restaurant_id));

drop policy if exists restaurant_stations_write on public.restaurant_stations;
create policy restaurant_stations_write on public.restaurant_stations
  for all to authenticated
  using (public.is_owner_or_manager(restaurant_id))
  with check (public.is_owner_or_manager(restaurant_id));

-- 2. Let a verify->record handshake belong to a station, not just a manager ---
alter table public.badge_verification_challenges
  add column if not exists station_id uuid references public.restaurant_stations(id) on delete cascade;
alter table public.badge_verification_challenges
  alter column actor_profile_id drop not null;
alter table public.badge_verification_challenges
  drop constraint if exists badge_verification_challenges_actor_or_station;
alter table public.badge_verification_challenges
  add constraint badge_verification_challenges_actor_or_station
  check (num_nonnulls(actor_profile_id, station_id) = 1);

create index if not exists badge_verification_challenges_station_lookup_idx
  on public.badge_verification_challenges (restaurant_id, employee_id, station_id, token_hash)
  where used_at is null;

-- 3. Shared cores (no caller auth inside) -----------------------------------

create or replace function public._badge_roster_core(p_restaurant_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rows jsonb;
begin
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'employee_id', e.id,
        'display_name', e.display_name,
        'clocked_in', coalesce(latest_badge.status = 'open', false),
        'service_key', latest_badge.service_key,
        'last_action', case
          when latest_badge.status = 'open' then 'in'
          when latest_badge.id is not null then 'out'
          else null
        end,
        'last_local_time', case
          when latest_badge.id is null then null
          else to_char(latest_badge.badged_at at time zone latest_badge.timezone, 'HH24:MI')
        end
      )
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
  left join lateral (
    select
      t.id,
      t.service_key,
      t.status,
      coalesce(t.clock_out_at, t.clock_in_at, t.updated_at) as badged_at,
      coalesce(nullif(trim(rs.timezone), ''), 'Europe/Brussels') as timezone
    from public.time_entries t
    left join public.restaurant_settings rs on rs.restaurant_id = t.restaurant_id
    where t.restaurant_id = e.restaurant_id
      and t.employee_id = e.id
      and (
        t.status = 'open'
        or t.business_date = (
          now() at time zone coalesce(nullif(trim(rs.timezone), ''), 'Europe/Brussels')
        )::date
      )
    order by (t.status = 'open') desc, coalesce(t.clock_out_at, t.clock_in_at, t.updated_at) desc
    limit 1
  ) latest_badge on true
  where e.restaurant_id = p_restaurant_id
    and e.active
    and ea.access_status = 'active'
    and ea.badge_enabled
    and pc.pin_status = 'active';

  return jsonb_build_object(
    'restaurant_id', p_restaurant_id,
    'restaurant_name', (select r.name from public.restaurants r where r.id = p_restaurant_id),
    'timezone', coalesce(
      (select nullif(trim(rs.timezone), '') from public.restaurant_settings rs where rs.restaurant_id = p_restaurant_id),
      'Europe/Brussels'
    ),
    'employees', v_rows
  );
end;
$$;

create or replace function public._badge_verify_core(
  p_restaurant_id uuid,
  p_employee_id uuid,
  p_pin text,
  p_actor_profile_id uuid,
  p_station_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $_$
declare
  v_credential record;
  v_failed integer;
  v_locked_until timestamptz;
  v_token uuid;
  v_expires timestamptz;
begin
  if trim(coalesce(p_pin, '')) !~ '^[0-9]{4}$' then
    raise exception 'Enter your 4-digit PIN.';
  end if;

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
    restaurant_id, employee_id, actor_profile_id, station_id, token_hash, expires_at
  )
  values (
    p_restaurant_id,
    p_employee_id,
    p_actor_profile_id,
    p_station_id,
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
$_$;

create or replace function public._badge_record_core(
  p_restaurant_id uuid,
  p_employee_id uuid,
  p_badge_token uuid,
  p_actor_profile_id uuid,
  p_station_id uuid,
  p_service_key text,
  p_photo_url text,
  p_photo_status text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_challenge record;
  v_open_entry record;
  v_existing_entry record;
  v_badged_at timestamptz := now();
  v_timezone text;
  v_business_date date;
  v_local_time time;
  v_service_key text := lower(trim(coalesce(p_service_key, '')));
  v_service_name text;
  v_photo_status text := public.badge_photo_status_to_db(p_photo_status, p_photo_url);
  v_entry_id uuid;
  v_action text;
  v_resumed boolean := false;
  v_break_minutes_added integer := 0;
  v_total_break_minutes integer := 0;
begin
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
    and (
      (p_station_id is not null and c.station_id = p_station_id)
      or (p_station_id is null and c.actor_profile_id = p_actor_profile_id)
    )
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
  v_local_time := (v_badged_at at time zone v_timezone)::time;

  perform pg_advisory_xact_lock(
    hashtextextended(p_restaurant_id::text || ':badge:' || p_employee_id::text, 0)
  );

  select * into v_open_entry
  from public.time_entries t
  where t.restaurant_id = p_restaurant_id
    and t.employee_id = p_employee_id
    and t.status = 'open'
  order by t.clock_in_at desc
  limit 1
  for update;

  if v_open_entry.id is not null then
    v_service_key := v_open_entry.service_key;
    update public.time_entries
    set clock_out_at = v_badged_at,
        clock_out_photo_url = nullif(trim(coalesce(p_photo_url, '')), ''),
        clock_out_photo_status = v_photo_status,
        clock_out_photo_captured_at = case when nullif(trim(coalesce(p_photo_url, '')), '') is null then null else v_badged_at end,
        status = 'closed',
        updated_at = v_badged_at
    where id = v_open_entry.id
    returning id, break_minutes into v_entry_id, v_total_break_minutes;
    v_action := 'out';
  else
    if coalesce(v_service_key, '') = '' then
      select ps.service_key
      into v_service_key
      from public.planned_shifts ps
      join public.services s
        on s.restaurant_id = ps.restaurant_id
       and s.service_key = ps.service_key
       and s.active
      where ps.restaurant_id = p_restaurant_id
        and ps.employee_id = p_employee_id
        and ps.week_start + (ps.weekday - 1) = v_business_date
      order by
        case
          when ps.starts_at is not null and ps.ends_at is not null and (
            (ps.starts_at <= ps.ends_at and v_local_time between ps.starts_at and ps.ends_at)
            or (ps.starts_at > ps.ends_at and (v_local_time >= ps.starts_at or v_local_time <= ps.ends_at))
          ) then 0
          else 1
        end,
        least(
          abs(extract(epoch from (
            coalesce(ps.starts_at, case ps.service_key when 'evening' then time '18:00' else time '11:00' end)
            - v_local_time
          ))),
          86400 - abs(extract(epoch from (
            coalesce(ps.starts_at, case ps.service_key when 'evening' then time '18:00' else time '11:00' end)
            - v_local_time
          )))
        ),
        s.sort_order
      limit 1;
    end if;

    if coalesce(v_service_key, '') = '' then
      select s.service_key
      into v_service_key
      from public.services s
      left join lateral (
        select min(d.start_time) as start_time, max(d.end_time) as end_time
        from public.area_service_defaults d
        where d.restaurant_id = s.restaurant_id
          and d.service_key = s.service_key
      ) defaults on true
      where s.restaurant_id = p_restaurant_id
        and s.active
      order by
        case
          when defaults.start_time is not null and defaults.end_time is not null and (
            (defaults.start_time <= defaults.end_time and v_local_time between defaults.start_time and defaults.end_time)
            or (defaults.start_time > defaults.end_time and (v_local_time >= defaults.start_time or v_local_time <= defaults.end_time))
          ) then 0
          else 1
        end,
        least(
          abs(extract(epoch from (
            coalesce(defaults.start_time, case s.service_key when 'evening' then time '18:00' else time '11:00' end)
            - v_local_time
          ))),
          86400 - abs(extract(epoch from (
            coalesce(defaults.start_time, case s.service_key when 'evening' then time '18:00' else time '11:00' end)
            - v_local_time
          )))
        ),
        s.sort_order
      limit 1;
    end if;

    if coalesce(v_service_key, '') not in ('lunch', 'evening') then
      v_service_key := case when v_local_time < time '16:00' then 'lunch' else 'evening' end;
    end if;

    select * into v_existing_entry
    from public.time_entries t
    where t.restaurant_id = p_restaurant_id
      and t.employee_id = p_employee_id
      and t.business_date = v_business_date
      and t.service_key = v_service_key
      and t.status <> 'cancelled'
    limit 1
    for update;

    if v_existing_entry.id is not null then
      if v_existing_entry.status <> 'closed'
          or v_existing_entry.source <> 'badge_terminal'
          or v_existing_entry.clock_out_at is null then
        raise exception 'This worked-time entry cannot be resumed from the Badge terminal.';
      end if;

      v_break_minutes_added := greatest(
        0,
        floor(extract(epoch from (v_badged_at - v_existing_entry.clock_out_at)) / 60)::integer
      );
      update public.time_entries
      set break_minutes = break_minutes + v_break_minutes_added,
          clock_out_at = null,
          clock_out_photo_url = null,
          clock_out_photo_status = null,
          clock_out_photo_captured_at = null,
          clock_in_photo_url = coalesce(
            nullif(trim(coalesce(p_photo_url, '')), ''),
            clock_in_photo_url
          ),
          clock_in_photo_status = case
            when nullif(trim(coalesce(p_photo_url, '')), '') is null then clock_in_photo_status
            else v_photo_status
          end,
          clock_in_photo_captured_at = case
            when nullif(trim(coalesce(p_photo_url, '')), '') is null then clock_in_photo_captured_at
            else v_badged_at
          end,
          status = 'open',
          updated_at = v_badged_at
      where id = v_existing_entry.id
      returning id, break_minutes into v_entry_id, v_total_break_minutes;
      v_action := 'in';
      v_resumed := true;
    else
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
      returning id, break_minutes into v_entry_id, v_total_break_minutes;
      v_action := 'in';
    end if;
  end if;

  select s.name into v_service_name
  from public.services s
  where s.restaurant_id = p_restaurant_id
    and s.service_key = v_service_key;

  return jsonb_build_object(
    'ok', true,
    'action', v_action,
    'resumed', v_resumed,
    'break_minutes_added', v_break_minutes_added,
    'total_break_minutes', v_total_break_minutes,
    'badged_at', v_badged_at,
    'local_time', to_char(v_badged_at at time zone v_timezone, 'HH24:MI'),
    'timezone', v_timezone,
    'service_key', v_service_key,
    'service_name', coalesce(v_service_name, initcap(v_service_key)),
    'time_entry', (select to_jsonb(t) from public.time_entries t where t.id = v_entry_id)
  );
end;
$$;

-- 4. Resolve a station token to its (station, restaurant) -------------------
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
  where s.token_hash = encode(extensions.digest(trim(p_token), 'sha256'), 'hex')
    and s.revoked_at is null
  limit 1;
  if v_station_id is null then
    raise exception 'This device is no longer paired.';
  end if;
  update public.restaurant_stations set last_used_at = now() where id = v_station_id;
  station_id := v_station_id;
  restaurant_id := v_restaurant_id;
  return next;
end;
$$;

-- 5. Manager wrappers (unchanged behaviour for the app) ---------------------
create or replace function public.list_badge_roster(p_restaurant_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  perform 1 from public.require_owner_or_manager_context(p_restaurant_id);
  return public._badge_roster_core(p_restaurant_id);
end;
$$;

create or replace function public.verify_badge_pin(p_restaurant_id uuid, p_employee_id uuid, p_pin text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor record;
begin
  select * into v_actor from public.require_owner_or_manager_context(p_restaurant_id) limit 1;
  return public._badge_verify_core(p_restaurant_id, p_employee_id, p_pin, v_actor.profile_id, null);
end;
$$;

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
as $$
declare
  v_actor record;
begin
  select * into v_actor from public.require_owner_or_manager_context(p_restaurant_id) limit 1;
  return public._badge_record_core(
    p_restaurant_id, p_employee_id, p_badge_token, v_actor.profile_id, null,
    p_service_key, p_photo_url, p_photo_status
  );
end;
$$;

-- 6. Station wrappers (anon-callable, scoped by the token) ------------------
create or replace function public.list_badge_roster_station(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ctx record;
begin
  select * into v_ctx from public.resolve_station_token(p_token) limit 1;
  return public._badge_roster_core(v_ctx.restaurant_id);
end;
$$;

create or replace function public.verify_badge_pin_station(p_token text, p_employee_id uuid, p_pin text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ctx record;
begin
  select * into v_ctx from public.resolve_station_token(p_token) limit 1;
  return public._badge_verify_core(v_ctx.restaurant_id, p_employee_id, p_pin, null, v_ctx.station_id);
end;
$$;

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
as $$
declare
  v_ctx record;
begin
  select * into v_ctx from public.resolve_station_token(p_token) limit 1;
  return public._badge_record_core(
    v_ctx.restaurant_id, p_employee_id, p_badge_token, null, v_ctx.station_id,
    null, p_photo_url, p_photo_status
  );
end;
$$;

-- 7. Station management (owner/manager only) --------------------------------
create or replace function public.create_restaurant_station(p_restaurant_id uuid, p_label text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_token text;
  v_id uuid;
begin
  perform 1 from public.require_owner_or_manager_context(p_restaurant_id);
  v_token := encode(extensions.gen_random_bytes(24), 'hex');
  insert into public.restaurant_stations (restaurant_id, label, token_hash, created_by)
  values (
    p_restaurant_id,
    coalesce(nullif(trim(p_label), ''), 'Badge device'),
    encode(extensions.digest(v_token, 'sha256'), 'hex'),
    public.current_profile_id()
  )
  returning id into v_id;
  return jsonb_build_object('ok', true, 'station_id', v_id, 'token', v_token);
end;
$$;

create or replace function public.revoke_restaurant_station(p_restaurant_id uuid, p_station_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  perform 1 from public.require_owner_or_manager_context(p_restaurant_id);
  update public.restaurant_stations
  set revoked_at = now()
  where id = p_station_id and restaurant_id = p_restaurant_id and revoked_at is null;
  return jsonb_build_object('ok', true);
end;
$$;

-- 8. Grants -----------------------------------------------------------------
-- Cores + resolver are internal: only the SECURITY DEFINER wrappers (running as
-- owner) may call them, never a client role directly.
revoke all on function public._badge_roster_core(uuid) from public, anon, authenticated;
revoke all on function public._badge_verify_core(uuid, uuid, text, uuid, uuid) from public, anon, authenticated;
revoke all on function public._badge_record_core(uuid, uuid, uuid, uuid, uuid, text, text, text) from public, anon, authenticated;
revoke all on function public.resolve_station_token(text) from public, anon, authenticated;

revoke all on function public.list_badge_roster(uuid) from public, anon, authenticated;
revoke all on function public.verify_badge_pin(uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.record_badge_entry(uuid, uuid, uuid, text, text, text) from public, anon, authenticated;
grant execute on function public.list_badge_roster(uuid) to authenticated;
grant execute on function public.verify_badge_pin(uuid, uuid, text) to authenticated;
grant execute on function public.record_badge_entry(uuid, uuid, uuid, text, text, text) to authenticated;

revoke all on function public.list_badge_roster_station(text) from public;
revoke all on function public.verify_badge_pin_station(text, uuid, text) from public;
revoke all on function public.record_badge_entry_station(text, uuid, uuid, text, text) from public;
grant execute on function public.list_badge_roster_station(text) to anon, authenticated;
grant execute on function public.verify_badge_pin_station(text, uuid, text) to anon, authenticated;
grant execute on function public.record_badge_entry_station(text, uuid, uuid, text, text) to anon, authenticated;

revoke all on function public.create_restaurant_station(uuid, text) from public, anon, authenticated;
revoke all on function public.revoke_restaurant_station(uuid, uuid) from public, anon, authenticated;
grant execute on function public.create_restaurant_station(uuid, text) to authenticated;
grant execute on function public.revoke_restaurant_station(uuid, uuid) to authenticated;

commit;
