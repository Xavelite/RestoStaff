-- An employee showing up must always be able to badge. When neither the
-- planned shift nor an active service resolves a lunch/evening service, fall
-- back to a time-of-day default (lunch before 16:00, evening after) instead of
-- raising 'No active service is available for this badge.'. The service_key is
-- a categorisation of worked time, never a gate on clocking in.
begin;

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
    if v_service_key = '' then
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

    if v_service_key = '' then
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

    -- Never block a badge on service configuration: if nothing resolved a
    -- lunch/evening service, categorise by time of day so the clock-in always
    -- succeeds.
    if v_service_key not in ('lunch', 'evening') then
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

revoke all on function public.record_badge_entry(uuid, uuid, uuid, text, text, text) from public, anon, authenticated;
grant execute on function public.record_badge_entry(uuid, uuid, uuid, text, text, text) to authenticated;

commit;
