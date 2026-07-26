-- Reservations foundation.
--
-- Preconditions:
-- - restaurants, restaurant_settings, restaurant_memberships, profiles,
--   services, opening_hours and work_areas are canonical.
-- - current_profile_id(), is_owner_or_manager(),
--   require_owner_or_manager_context() and set_updated_at() exist.
--
-- Rollback:
-- - revoke/drop the reservation RPCs, then drop the reservation tables in
--   reverse dependency order. Existing restaurant, planning and team data is
--   not rewritten by this migration.

create table public.reservation_service_settings (
  restaurant_id uuid not null,
  service_key text not null,
  booking_enabled boolean not null default true,
  automatic_confirmation boolean not null default true,
  slot_interval_minutes integer not null default 15
    check (slot_interval_minutes between 5 and 120),
  default_duration_minutes integer not null default 120
    check (default_duration_minutes between 15 and 720),
  turn_time_minutes integer not null default 0
    check (turn_time_minutes between 0 and 180),
  minimum_party_size integer not null default 1
    check (minimum_party_size between 1 and 100),
  maximum_party_size integer not null default 12
    check (maximum_party_size between 1 and 500),
  maximum_covers integer
    check (maximum_covers is null or maximum_covers between 1 and 10000),
  booking_cutoff_minutes integer not null default 0
    check (booking_cutoff_minutes between 0 and 10080),
  advance_booking_days integer not null default 180
    check (advance_booking_days between 0 and 1095),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (restaurant_id, service_key),
  foreign key (restaurant_id) references public.restaurants(id) on delete cascade,
  foreign key (restaurant_id, service_key)
    references public.services(restaurant_id, service_key) on delete cascade,
  check (maximum_party_size >= minimum_party_size)
);

create table public.reservation_rooms (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null,
  work_area_id uuid not null,
  active boolean not null default true,
  sort_order integer not null default 0,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (restaurant_id, id),
  unique (restaurant_id, work_area_id),
  foreign key (restaurant_id) references public.restaurants(id) on delete cascade,
  foreign key (restaurant_id, work_area_id)
    references public.work_areas(restaurant_id, id) on delete cascade
);

create table public.reservation_tables (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null,
  room_id uuid not null,
  label text not null check (length(btrim(label)) between 1 and 40),
  minimum_capacity integer not null default 1
    check (minimum_capacity between 1 and 100),
  maximum_capacity integer not null default 2
    check (maximum_capacity between 1 and 500),
  shape text not null default 'square'
    check (shape in ('round', 'square', 'rectangle')),
  position_x numeric(8,3) not null default 0,
  position_y numeric(8,3) not null default 0,
  width numeric(8,3) not null default 96 check (width > 0),
  height numeric(8,3) not null default 72 check (height > 0),
  rotation_degrees numeric(6,2) not null default 0,
  active boolean not null default true,
  blocked boolean not null default false,
  sort_order integer not null default 0,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (restaurant_id, id),
  unique (restaurant_id, room_id, label),
  foreign key (restaurant_id) references public.restaurants(id) on delete cascade,
  foreign key (restaurant_id, room_id)
    references public.reservation_rooms(restaurant_id, id) on delete cascade,
  check (maximum_capacity >= minimum_capacity)
);

create table public.reservation_table_combinations (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null,
  room_id uuid not null,
  name text not null check (length(btrim(name)) between 1 and 80),
  minimum_capacity integer not null check (minimum_capacity between 1 and 100),
  maximum_capacity integer not null check (maximum_capacity between 1 and 500),
  active boolean not null default true,
  sort_order integer not null default 0,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (restaurant_id, id),
  unique (restaurant_id, room_id, name),
  foreign key (restaurant_id) references public.restaurants(id) on delete cascade,
  foreign key (restaurant_id, room_id)
    references public.reservation_rooms(restaurant_id, id) on delete cascade,
  check (maximum_capacity >= minimum_capacity)
);

create table public.reservation_table_combination_members (
  restaurant_id uuid not null,
  combination_id uuid not null,
  table_id uuid not null,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  primary key (restaurant_id, combination_id, table_id),
  foreign key (restaurant_id) references public.restaurants(id) on delete cascade,
  foreign key (restaurant_id, combination_id)
    references public.reservation_table_combinations(restaurant_id, id) on delete cascade,
  foreign key (restaurant_id, table_id)
    references public.reservation_tables(restaurant_id, id) on delete cascade
);

create table public.reservation_service_exceptions (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null,
  service_key text not null,
  business_date date not null,
  availability text not null check (availability in ('closed', 'open')),
  opens_at time,
  closes_at time,
  reason text,
  created_by_profile_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (restaurant_id, id),
  unique (restaurant_id, service_key, business_date),
  foreign key (restaurant_id) references public.restaurants(id) on delete cascade,
  foreign key (restaurant_id, service_key)
    references public.services(restaurant_id, service_key) on delete cascade,
  foreign key (created_by_profile_id) references public.profiles(id) on delete set null,
  check (
    availability = 'closed'
    or (opens_at is not null and closes_at is not null and closes_at > opens_at)
  )
);

create table public.reservation_guests (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null,
  display_name text not null check (length(btrim(display_name)) between 1 and 160),
  email citext,
  normalized_email text,
  phone text,
  normalized_phone text,
  language_code text not null default 'fr'
    check (length(language_code) between 2 and 12),
  preferences text,
  allergies text,
  internal_notes text,
  marketing_email_consent boolean not null default false,
  marketing_sms_consent boolean not null default false,
  preferred_room_id uuid,
  preferred_table_id uuid,
  anonymized_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (restaurant_id, id),
  foreign key (restaurant_id) references public.restaurants(id) on delete cascade,
  foreign key (restaurant_id, preferred_room_id)
    references public.reservation_rooms(restaurant_id, id) on delete set null,
  foreign key (restaurant_id, preferred_table_id)
    references public.reservation_tables(restaurant_id, id) on delete set null
);

create table public.reservations (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null,
  guest_id uuid not null,
  business_date date not null,
  service_key text not null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  party_size integer not null check (party_size between 1 and 500),
  status text not null default 'pending'
    check (status in (
      'pending', 'confirmed', 'arrived', 'waiting', 'seated',
      'finished', 'cancelled', 'no_show'
    )),
  source text not null default 'internal'
    check (source in ('internal', 'phone', 'walk_in', 'widget', 'integration')),
  room_preference_id uuid,
  guest_comment text,
  internal_notes text,
  assignment_locked boolean not null default false,
  created_by_profile_id uuid,
  updated_by_profile_id uuid,
  revision integer not null default 1 check (revision > 0),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (restaurant_id, id),
  foreign key (restaurant_id) references public.restaurants(id) on delete cascade,
  foreign key (restaurant_id, guest_id)
    references public.reservation_guests(restaurant_id, id) on delete restrict,
  foreign key (restaurant_id, service_key)
    references public.services(restaurant_id, service_key) on delete restrict,
  foreign key (restaurant_id, room_preference_id)
    references public.reservation_rooms(restaurant_id, id) on delete set null,
  foreign key (created_by_profile_id) references public.profiles(id) on delete set null,
  foreign key (updated_by_profile_id) references public.profiles(id) on delete set null,
  check (ends_at > starts_at)
);

create table public.reservation_table_assignments (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null,
  reservation_id uuid not null,
  table_id uuid not null,
  assignment_group_id uuid not null default gen_random_uuid(),
  assigned_by_profile_id uuid,
  assigned_at timestamptz not null default now(),
  unassigned_at timestamptz,
  explanation text,
  metadata jsonb not null default '{}'::jsonb,
  unique (restaurant_id, id),
  foreign key (restaurant_id) references public.restaurants(id) on delete cascade,
  foreign key (restaurant_id, reservation_id)
    references public.reservations(restaurant_id, id) on delete cascade,
  foreign key (restaurant_id, table_id)
    references public.reservation_tables(restaurant_id, id) on delete restrict,
  foreign key (assigned_by_profile_id) references public.profiles(id) on delete set null,
  check (unassigned_at is null or unassigned_at >= assigned_at)
);

create unique index reservation_table_assignments_one_current
  on public.reservation_table_assignments (restaurant_id, reservation_id, table_id)
  where unassigned_at is null;

create table public.reservation_events (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null,
  reservation_id uuid not null,
  event_type text not null,
  from_status text,
  to_status text,
  actor_profile_id uuid,
  occurred_at timestamptz not null default now(),
  details jsonb not null default '{}'::jsonb,
  unique (restaurant_id, id),
  foreign key (restaurant_id) references public.restaurants(id) on delete cascade,
  foreign key (restaurant_id, reservation_id)
    references public.reservations(restaurant_id, id) on delete cascade,
  foreign key (actor_profile_id) references public.profiles(id) on delete set null
);

create index reservation_tables_room_idx
  on public.reservation_tables (restaurant_id, room_id, active, blocked);
create index reservation_guests_email_idx
  on public.reservation_guests (restaurant_id, normalized_email)
  where normalized_email is not null;
create index reservation_guests_phone_idx
  on public.reservation_guests (restaurant_id, normalized_phone)
  where normalized_phone is not null;
create index reservations_service_time_idx
  on public.reservations (restaurant_id, business_date, service_key, starts_at);
create index reservations_active_time_idx
  on public.reservations (restaurant_id, starts_at, ends_at)
  where status not in ('cancelled', 'no_show', 'finished');
create index reservation_assignments_table_idx
  on public.reservation_table_assignments (restaurant_id, table_id, unassigned_at);
create index reservation_events_history_idx
  on public.reservation_events (restaurant_id, reservation_id, occurred_at);

create trigger reservation_service_settings_set_updated_at
  before update on public.reservation_service_settings
  for each row execute function public.set_updated_at();
create trigger reservation_rooms_set_updated_at
  before update on public.reservation_rooms
  for each row execute function public.set_updated_at();
create trigger reservation_tables_set_updated_at
  before update on public.reservation_tables
  for each row execute function public.set_updated_at();
create trigger reservation_table_combinations_set_updated_at
  before update on public.reservation_table_combinations
  for each row execute function public.set_updated_at();
create trigger reservation_service_exceptions_set_updated_at
  before update on public.reservation_service_exceptions
  for each row execute function public.set_updated_at();
create trigger reservation_guests_set_updated_at
  before update on public.reservation_guests
  for each row execute function public.set_updated_at();
create trigger reservations_set_updated_at
  before update on public.reservations
  for each row execute function public.set_updated_at();

create function public.guard_reservation_event_history()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  raise exception 'Reservation event history is immutable.';
end
$$;

create trigger reservation_events_immutable
  before update or delete on public.reservation_events
  for each row execute function public.guard_reservation_event_history();

create function public.reservation_local_timestamp(
  p_restaurant_id uuid,
  p_business_date date,
  p_local_time time
)
returns timestamptz
language sql
stable
security invoker
set search_path = public
as $$
  select (p_business_date + p_local_time)
    at time zone coalesce(
      (
        select nullif(rs.timezone, '')
        from public.restaurant_settings rs
        where rs.restaurant_id = p_restaurant_id
      ),
      'Europe/Brussels'
    )
$$;

create function public.reservation_assignment_candidate(
  p_restaurant_id uuid,
  p_starts_at timestamptz,
  p_ends_at timestamptz,
  p_party_size integer,
  p_room_id uuid default null,
  p_exclude_reservation_id uuid default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_table record;
  v_combination record;
  v_table_ids uuid[];
begin
  select t.id, t.label, t.room_id
  into v_table
  from public.reservation_tables t
  join public.reservation_rooms room
    on room.restaurant_id = t.restaurant_id
   and room.id = t.room_id
   and room.active
  where t.restaurant_id = p_restaurant_id
    and t.active
    and not t.blocked
    and (p_room_id is null or t.room_id = p_room_id)
    and p_party_size between t.minimum_capacity and t.maximum_capacity
    and not exists (
      select 1
      from public.reservation_table_assignments a
      join public.reservations r
        on r.restaurant_id = a.restaurant_id
       and r.id = a.reservation_id
      where a.restaurant_id = t.restaurant_id
        and a.table_id = t.id
        and a.unassigned_at is null
        and r.id is distinct from p_exclude_reservation_id
        and r.status not in ('cancelled', 'no_show', 'finished')
        and tstzrange(r.starts_at, r.ends_at, '[)')
          && tstzrange(p_starts_at, p_ends_at, '[)')
    )
  order by t.maximum_capacity, t.minimum_capacity desc, t.sort_order, t.label
  limit 1;

  if v_table.id is not null then
    return jsonb_build_object(
      'available', true,
      'kind', 'table',
      'room_id', v_table.room_id,
      'table_ids', jsonb_build_array(v_table.id),
      'explanation', format(
        'Table %s is the smallest suitable available table.',
        v_table.label
      )
    );
  end if;

  select combination.id, combination.name, combination.room_id,
    array_agg(member.table_id order by member.sort_order, member.table_id) as table_ids
  into v_combination
  from public.reservation_table_combinations combination
  join public.reservation_table_combination_members member
    on member.restaurant_id = combination.restaurant_id
   and member.combination_id = combination.id
  join public.reservation_rooms room
    on room.restaurant_id = combination.restaurant_id
   and room.id = combination.room_id
   and room.active
  where combination.restaurant_id = p_restaurant_id
    and combination.active
    and (p_room_id is null or combination.room_id = p_room_id)
    and p_party_size between combination.minimum_capacity and combination.maximum_capacity
  group by combination.id, combination.name, combination.room_id,
    combination.maximum_capacity, combination.sort_order
  having bool_and(
    exists (
      select 1
      from public.reservation_tables t
      where t.restaurant_id = p_restaurant_id
        and t.id = member.table_id
        and t.active
        and not t.blocked
    )
    and not exists (
      select 1
      from public.reservation_table_assignments a
      join public.reservations r
        on r.restaurant_id = a.restaurant_id
       and r.id = a.reservation_id
      where a.restaurant_id = p_restaurant_id
        and a.table_id = member.table_id
        and a.unassigned_at is null
        and r.id is distinct from p_exclude_reservation_id
        and r.status not in ('cancelled', 'no_show', 'finished')
        and tstzrange(r.starts_at, r.ends_at, '[)')
          && tstzrange(p_starts_at, p_ends_at, '[)')
    )
  )
  order by combination.maximum_capacity, combination.sort_order, combination.name
  limit 1;

  v_table_ids := v_combination.table_ids;
  if coalesce(array_length(v_table_ids, 1), 0) > 0 then
    return jsonb_build_object(
      'available', true,
      'kind', 'combination',
      'room_id', v_combination.room_id,
      'table_ids', to_jsonb(v_table_ids),
      'explanation', format(
        '%s is the smallest suitable available table combination.',
        v_combination.name
      )
    );
  end if;

  return jsonb_build_object(
    'available', false,
    'code', 'no_table',
    'reason', case
      when p_room_id is null then 'No suitable table is available for this time.'
      else 'No suitable table is available in the preferred room for this time.'
    end
  );
end
$$;

create function public.reservation_availability_internal(
  p_restaurant_id uuid,
  p_business_date date,
  p_service_key text,
  p_local_time time,
  p_party_size integer,
  p_room_id uuid default null,
  p_exclude_reservation_id uuid default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_setting public.reservation_service_settings%rowtype;
  v_exception public.reservation_service_exceptions%rowtype;
  v_opening public.opening_hours%rowtype;
  v_opens_at time;
  v_closes_at time;
  v_starts_at timestamptz;
  v_ends_at timestamptz;
  v_existing_covers integer;
  v_has_tables boolean;
  v_assignment jsonb;
  v_slot_offset integer;
begin
  select *
  into v_setting
  from public.reservation_service_settings s
  where s.restaurant_id = p_restaurant_id
    and s.service_key = p_service_key;

  if not found then
    return jsonb_build_object(
      'available', false,
      'code', 'service_not_configured',
      'reason', 'Reservations are not configured for this service.'
    );
  end if;

  if not v_setting.booking_enabled then
    return jsonb_build_object(
      'available', false,
      'code', 'booking_disabled',
      'reason', 'Bookings are disabled for this service.'
    );
  end if;

  if p_party_size < v_setting.minimum_party_size
    or p_party_size > v_setting.maximum_party_size then
    return jsonb_build_object(
      'available', false,
      'code', 'party_size',
      'reason', format(
        'Party size must be between %s and %s guests.',
        v_setting.minimum_party_size,
        v_setting.maximum_party_size
      )
    );
  end if;

  select *
  into v_exception
  from public.reservation_service_exceptions exception
  where exception.restaurant_id = p_restaurant_id
    and exception.service_key = p_service_key
    and exception.business_date = p_business_date;

  if found and v_exception.availability = 'closed' then
    return jsonb_build_object(
      'available', false,
      'code', 'closed',
      'reason', coalesce(nullif(v_exception.reason, ''), 'This service is closed.')
    );
  end if;

  if found and v_exception.availability = 'open' then
    v_opens_at := v_exception.opens_at;
    v_closes_at := v_exception.closes_at;
  else
    select *
    into v_opening
    from public.opening_hours opening
    where opening.restaurant_id = p_restaurant_id
      and opening.service_key = p_service_key
      and opening.weekday = extract(isodow from p_business_date)::integer;

    if not found or not v_opening.is_open then
      return jsonb_build_object(
        'available', false,
        'code', 'closed',
        'reason', 'The restaurant is closed for this service.'
      );
    end if;
    v_opens_at := v_opening.opens_at;
    v_closes_at := v_opening.closes_at;
  end if;

  if v_opens_at is null or v_closes_at is null
    or p_local_time < v_opens_at or p_local_time >= v_closes_at then
    return jsonb_build_object(
      'available', false,
      'code', 'outside_service',
      'reason', 'The requested time is outside this service.'
    );
  end if;

  v_slot_offset :=
    floor(extract(epoch from (p_local_time - v_opens_at)) / 60)::integer;
  if mod(v_slot_offset, v_setting.slot_interval_minutes) <> 0 then
    return jsonb_build_object(
      'available', false,
      'code', 'slot_interval',
      'reason', format(
        'Choose a time on a %s-minute booking interval.',
        v_setting.slot_interval_minutes
      )
    );
  end if;

  v_starts_at := public.reservation_local_timestamp(
    p_restaurant_id,
    p_business_date,
    p_local_time
  );
  v_ends_at := v_starts_at
    + make_interval(mins => v_setting.default_duration_minutes + v_setting.turn_time_minutes);

  if v_ends_at > public.reservation_local_timestamp(
    p_restaurant_id,
    p_business_date,
    v_closes_at
  ) then
    return jsonb_build_object(
      'available', false,
      'code', 'duration',
      'reason', 'The meal duration would continue beyond the end of service.'
    );
  end if;

  if p_business_date > current_date + v_setting.advance_booking_days then
    return jsonb_build_object(
      'available', false,
      'code', 'advance_window',
      'reason', format(
        'Bookings open up to %s days in advance.',
        v_setting.advance_booking_days
      )
    );
  end if;

  if v_starts_at < now() + make_interval(mins => v_setting.booking_cutoff_minutes) then
    return jsonb_build_object(
      'available', false,
      'code', 'cutoff',
      'reason', 'This time is inside the booking cut-off window.'
    );
  end if;

  select coalesce(sum(r.party_size), 0)::integer
  into v_existing_covers
  from public.reservations r
  where r.restaurant_id = p_restaurant_id
    and r.business_date = p_business_date
    and r.service_key = p_service_key
    and r.id is distinct from p_exclude_reservation_id
    and r.status not in ('cancelled', 'no_show');

  if v_setting.maximum_covers is not null
    and v_existing_covers + p_party_size > v_setting.maximum_covers then
    return jsonb_build_object(
      'available', false,
      'code', 'service_capacity',
      'reason', format(
        'This booking would exceed the %s-cover service limit.',
        v_setting.maximum_covers
      ),
      'booked_covers', v_existing_covers,
      'maximum_covers', v_setting.maximum_covers
    );
  end if;

  select exists (
    select 1
    from public.reservation_tables t
    join public.reservation_rooms room
      on room.restaurant_id = t.restaurant_id
     and room.id = t.room_id
     and room.active
    where t.restaurant_id = p_restaurant_id
      and t.active
      and not t.blocked
  ) into v_has_tables;

  if v_has_tables then
    v_assignment := public.reservation_assignment_candidate(
      p_restaurant_id,
      v_starts_at,
      v_ends_at,
      p_party_size,
      p_room_id,
      p_exclude_reservation_id
    );
    if coalesce((v_assignment->>'available')::boolean, false) is not true then
      return v_assignment;
    end if;
  else
    v_assignment := jsonb_build_object(
      'available', true,
      'kind', 'capacity_only',
      'room_id', p_room_id,
      'table_ids', '[]'::jsonb,
      'explanation', 'Accepted against service capacity; no tables are configured yet.'
    );
  end if;

  return jsonb_build_object(
    'available', true,
    'code', 'available',
    'starts_at', v_starts_at,
    'ends_at', v_ends_at,
    'booked_covers', v_existing_covers,
    'maximum_covers', v_setting.maximum_covers,
    'automatic_confirmation', v_setting.automatic_confirmation,
    'assignment', v_assignment
  );
end
$$;

create function public.get_reservation_workspace(
  p_restaurant_id uuid,
  p_business_date date
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  perform 1 from public.require_owner_or_manager_context(p_restaurant_id);
  return jsonb_build_object(
    'restaurant_id', p_restaurant_id,
    'business_date', p_business_date,
    'timezone', coalesce(
      (
        select rs.timezone
        from public.restaurant_settings rs
        where rs.restaurant_id = p_restaurant_id
      ),
      'Europe/Brussels'
    ),
    'services', coalesce((
      select jsonb_agg(
        to_jsonb(service) ||
        jsonb_build_object(
          'setting', to_jsonb(setting),
          'opening', to_jsonb(opening),
          'exception', to_jsonb(exception)
        )
        order by service.sort_order, service.name
      )
      from public.services service
      left join public.reservation_service_settings setting
        on setting.restaurant_id = service.restaurant_id
       and setting.service_key = service.service_key
      left join public.opening_hours opening
        on opening.restaurant_id = service.restaurant_id
       and opening.service_key = service.service_key
       and opening.weekday = extract(isodow from p_business_date)::integer
      left join public.reservation_service_exceptions exception
        on exception.restaurant_id = service.restaurant_id
       and exception.service_key = service.service_key
       and exception.business_date = p_business_date
      where service.restaurant_id = p_restaurant_id
        and service.active
    ), '[]'::jsonb),
    'rooms', coalesce((
      select jsonb_agg(
        to_jsonb(room) || jsonb_build_object(
          'name', area.name,
          'area_code', area.code,
          'area_color', area.metadata->>'color'
        )
        order by room.sort_order, area.name
      )
      from public.reservation_rooms room
      join public.work_areas area
        on area.restaurant_id = room.restaurant_id
       and area.id = room.work_area_id
      where room.restaurant_id = p_restaurant_id
        and room.active
    ), '[]'::jsonb),
    'tables', coalesce((
      select jsonb_agg(to_jsonb(t) order by t.sort_order, t.label)
      from public.reservation_tables t
      where t.restaurant_id = p_restaurant_id
        and t.active
    ), '[]'::jsonb),
    'reservations', coalesce((
      select jsonb_agg(
        to_jsonb(r) ||
        jsonb_build_object(
          'guest', to_jsonb(g),
          'table_ids', coalesce((
            select jsonb_agg(a.table_id order by a.assigned_at, a.table_id)
            from public.reservation_table_assignments a
            where a.restaurant_id = r.restaurant_id
              and a.reservation_id = r.id
              and a.unassigned_at is null
          ), '[]'::jsonb),
          'table_labels', coalesce((
            select jsonb_agg(t.label order by t.label)
            from public.reservation_table_assignments a
            join public.reservation_tables t
              on t.restaurant_id = a.restaurant_id
             and t.id = a.table_id
            where a.restaurant_id = r.restaurant_id
              and a.reservation_id = r.id
              and a.unassigned_at is null
          ), '[]'::jsonb)
        )
        order by r.starts_at, g.display_name
      )
      from public.reservations r
      join public.reservation_guests g
        on g.restaurant_id = r.restaurant_id
       and g.id = r.guest_id
      where r.restaurant_id = p_restaurant_id
        and r.business_date = p_business_date
    ), '[]'::jsonb)
  );
end
$$;

create function public.get_reservation_setup(p_restaurant_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  perform 1 from public.require_owner_or_manager_context(p_restaurant_id);
  return jsonb_build_object(
    'restaurant_id', p_restaurant_id,
    'services', coalesce((
      select jsonb_agg(
        to_jsonb(service) ||
        jsonb_build_object(
          'setting', to_jsonb(setting),
          'opening_hours', coalesce((
            select jsonb_agg(to_jsonb(opening) order by opening.weekday)
            from public.opening_hours opening
            where opening.restaurant_id = service.restaurant_id
              and opening.service_key = service.service_key
          ), '[]'::jsonb)
        )
        order by service.sort_order, service.name
      )
      from public.services service
      left join public.reservation_service_settings setting
        on setting.restaurant_id = service.restaurant_id
       and setting.service_key = service.service_key
      where service.restaurant_id = p_restaurant_id
        and service.active
    ), '[]'::jsonb),
    'areas', coalesce((
      select jsonb_agg(to_jsonb(area) order by area.sort_order, area.name)
      from public.work_areas area
      where area.restaurant_id = p_restaurant_id
        and area.active
    ), '[]'::jsonb),
    'rooms', coalesce((
      select jsonb_agg(
        to_jsonb(room) ||
        jsonb_build_object(
          'name', area.name,
          'area_code', area.code,
          'area_color', area.metadata->>'color'
        )
        order by room.sort_order, area.name
      )
      from public.reservation_rooms room
      join public.work_areas area
        on area.restaurant_id = room.restaurant_id
       and area.id = room.work_area_id
      where room.restaurant_id = p_restaurant_id
    ), '[]'::jsonb),
    'tables', coalesce((
      select jsonb_agg(to_jsonb(t) order by t.sort_order, t.label)
      from public.reservation_tables t
      where t.restaurant_id = p_restaurant_id
    ), '[]'::jsonb),
    'combinations', coalesce((
      select jsonb_agg(
        to_jsonb(combination) ||
        jsonb_build_object(
          'table_ids', coalesce((
            select jsonb_agg(member.table_id order by member.sort_order, member.table_id)
            from public.reservation_table_combination_members member
            where member.restaurant_id = combination.restaurant_id
              and member.combination_id = combination.id
          ), '[]'::jsonb)
        )
        order by combination.sort_order, combination.name
      )
      from public.reservation_table_combinations combination
      where combination.restaurant_id = p_restaurant_id
    ), '[]'::jsonb),
    'exceptions', coalesce((
      select jsonb_agg(to_jsonb(exception) order by exception.business_date, exception.service_key)
      from public.reservation_service_exceptions exception
      where exception.restaurant_id = p_restaurant_id
        and exception.business_date >= current_date - 30
    ), '[]'::jsonb)
  );
end
$$;

create function public.save_reservation_setup(
  p_restaurant_id uuid,
  p_services jsonb,
  p_rooms jsonb,
  p_tables jsonb,
  p_combinations jsonb default '[]'::jsonb,
  p_exceptions jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor record;
  v_item jsonb;
  v_member jsonb;
begin
  select *
  into v_actor
  from public.require_owner_or_manager_context(p_restaurant_id)
  limit 1;

  for v_item in
    select value from jsonb_array_elements(coalesce(p_services, '[]'::jsonb))
  loop
    insert into public.reservation_service_settings (
      restaurant_id,
      service_key,
      booking_enabled,
      automatic_confirmation,
      slot_interval_minutes,
      default_duration_minutes,
      turn_time_minutes,
      minimum_party_size,
      maximum_party_size,
      maximum_covers,
      booking_cutoff_minutes,
      advance_booking_days
    )
    values (
      p_restaurant_id,
      v_item->>'service_key',
      coalesce((v_item->>'booking_enabled')::boolean, true),
      coalesce((v_item->>'automatic_confirmation')::boolean, true),
      coalesce((v_item->>'slot_interval_minutes')::integer, 15),
      coalesce((v_item->>'default_duration_minutes')::integer, 120),
      coalesce((v_item->>'turn_time_minutes')::integer, 0),
      coalesce((v_item->>'minimum_party_size')::integer, 1),
      coalesce((v_item->>'maximum_party_size')::integer, 12),
      nullif(v_item->>'maximum_covers', '')::integer,
      coalesce((v_item->>'booking_cutoff_minutes')::integer, 0),
      coalesce((v_item->>'advance_booking_days')::integer, 180)
    )
    on conflict (restaurant_id, service_key) do update set
      booking_enabled = excluded.booking_enabled,
      automatic_confirmation = excluded.automatic_confirmation,
      slot_interval_minutes = excluded.slot_interval_minutes,
      default_duration_minutes = excluded.default_duration_minutes,
      turn_time_minutes = excluded.turn_time_minutes,
      minimum_party_size = excluded.minimum_party_size,
      maximum_party_size = excluded.maximum_party_size,
      maximum_covers = excluded.maximum_covers,
      booking_cutoff_minutes = excluded.booking_cutoff_minutes,
      advance_booking_days = excluded.advance_booking_days;
  end loop;

  for v_item in
    select value from jsonb_array_elements(coalesce(p_rooms, '[]'::jsonb))
  loop
    insert into public.reservation_rooms (
      id, restaurant_id, work_area_id, active, sort_order
    )
    values (
      coalesce((v_item->>'id')::uuid, gen_random_uuid()),
      p_restaurant_id,
      (v_item->>'work_area_id')::uuid,
      coalesce((v_item->>'active')::boolean, true),
      coalesce((v_item->>'sort_order')::integer, 0)
    )
    on conflict (restaurant_id, work_area_id) do update set
      active = excluded.active,
      sort_order = excluded.sort_order;
  end loop;

  for v_item in
    select value from jsonb_array_elements(coalesce(p_tables, '[]'::jsonb))
  loop
    insert into public.reservation_tables (
      id, restaurant_id, room_id, label, minimum_capacity, maximum_capacity,
      shape, position_x, position_y, width, height, rotation_degrees,
      active, blocked, sort_order
    )
    values (
      coalesce((v_item->>'id')::uuid, gen_random_uuid()),
      p_restaurant_id,
      (v_item->>'room_id')::uuid,
      btrim(v_item->>'label'),
      coalesce((v_item->>'minimum_capacity')::integer, 1),
      coalesce((v_item->>'maximum_capacity')::integer, 2),
      coalesce(nullif(v_item->>'shape', ''), 'square'),
      coalesce((v_item->>'position_x')::numeric, 0),
      coalesce((v_item->>'position_y')::numeric, 0),
      coalesce((v_item->>'width')::numeric, 96),
      coalesce((v_item->>'height')::numeric, 72),
      coalesce((v_item->>'rotation_degrees')::numeric, 0),
      coalesce((v_item->>'active')::boolean, true),
      coalesce((v_item->>'blocked')::boolean, false),
      coalesce((v_item->>'sort_order')::integer, 0)
    )
    on conflict (id) do update set
      room_id = excluded.room_id,
      label = excluded.label,
      minimum_capacity = excluded.minimum_capacity,
      maximum_capacity = excluded.maximum_capacity,
      shape = excluded.shape,
      position_x = excluded.position_x,
      position_y = excluded.position_y,
      width = excluded.width,
      height = excluded.height,
      rotation_degrees = excluded.rotation_degrees,
      active = excluded.active,
      blocked = excluded.blocked,
      sort_order = excluded.sort_order
    where reservation_tables.restaurant_id = p_restaurant_id;
  end loop;

  for v_item in
    select value from jsonb_array_elements(coalesce(p_combinations, '[]'::jsonb))
  loop
    insert into public.reservation_table_combinations (
      id, restaurant_id, room_id, name, minimum_capacity, maximum_capacity,
      active, sort_order
    )
    values (
      coalesce((v_item->>'id')::uuid, gen_random_uuid()),
      p_restaurant_id,
      (v_item->>'room_id')::uuid,
      btrim(v_item->>'name'),
      (v_item->>'minimum_capacity')::integer,
      (v_item->>'maximum_capacity')::integer,
      coalesce((v_item->>'active')::boolean, true),
      coalesce((v_item->>'sort_order')::integer, 0)
    )
    on conflict (id) do update set
      room_id = excluded.room_id,
      name = excluded.name,
      minimum_capacity = excluded.minimum_capacity,
      maximum_capacity = excluded.maximum_capacity,
      active = excluded.active,
      sort_order = excluded.sort_order
    where reservation_table_combinations.restaurant_id = p_restaurant_id;

    delete from public.reservation_table_combination_members
    where restaurant_id = p_restaurant_id
      and combination_id = (v_item->>'id')::uuid;

    for v_member in
      select value
      from jsonb_array_elements(coalesce(v_item->'table_ids', '[]'::jsonb))
    loop
      insert into public.reservation_table_combination_members (
        restaurant_id, combination_id, table_id, sort_order
      )
      values (
        p_restaurant_id,
        (v_item->>'id')::uuid,
        (v_member #>> '{}')::uuid,
        0
      );
    end loop;
  end loop;

  for v_item in
    select value from jsonb_array_elements(coalesce(p_exceptions, '[]'::jsonb))
  loop
    insert into public.reservation_service_exceptions (
      id, restaurant_id, service_key, business_date, availability,
      opens_at, closes_at, reason, created_by_profile_id
    )
    values (
      coalesce((v_item->>'id')::uuid, gen_random_uuid()),
      p_restaurant_id,
      v_item->>'service_key',
      (v_item->>'business_date')::date,
      v_item->>'availability',
      nullif(v_item->>'opens_at', '')::time,
      nullif(v_item->>'closes_at', '')::time,
      nullif(btrim(v_item->>'reason'), ''),
      v_actor.profile_id
    )
    on conflict (restaurant_id, service_key, business_date) do update set
      availability = excluded.availability,
      opens_at = excluded.opens_at,
      closes_at = excluded.closes_at,
      reason = excluded.reason;
  end loop;

  return jsonb_build_object('ok', true, 'restaurant_id', p_restaurant_id);
end
$$;

create function public.check_reservation_availability(
  p_restaurant_id uuid,
  p_business_date date,
  p_service_key text,
  p_local_time time,
  p_party_size integer,
  p_room_id uuid default null,
  p_exclude_reservation_id uuid default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  perform 1 from public.require_owner_or_manager_context(p_restaurant_id);
  return public.reservation_availability_internal(
    p_restaurant_id,
    p_business_date,
    p_service_key,
    p_local_time,
    p_party_size,
    p_room_id,
    p_exclude_reservation_id
  );
end
$$;

create function public.save_reservation(
  p_restaurant_id uuid,
  p_reservation jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor record;
  v_id uuid;
  v_existing public.reservations%rowtype;
  v_guest_id uuid;
  v_guest_name text;
  v_email citext;
  v_normalized_email text;
  v_phone text;
  v_normalized_phone text;
  v_business_date date;
  v_service_key text;
  v_local_time time;
  v_party_size integer;
  v_room_id uuid;
  v_status text;
  v_source text;
  v_availability jsonb;
  v_assignment jsonb;
  v_table_id jsonb;
begin
  select *
  into v_actor
  from public.require_owner_or_manager_context(p_restaurant_id)
  limit 1;

  v_id := nullif(p_reservation->>'id', '')::uuid;
  if v_id is not null then
    select *
    into v_existing
    from public.reservations r
    where r.restaurant_id = p_restaurant_id
      and r.id = v_id
    for update;
    if not found then
      raise exception 'Reservation not found.';
    end if;
  else
    v_id := gen_random_uuid();
  end if;

  v_business_date := (p_reservation->>'business_date')::date;
  v_service_key := p_reservation->>'service_key';
  v_local_time := (p_reservation->>'local_time')::time;
  v_party_size := (p_reservation->>'party_size')::integer;
  v_room_id := nullif(p_reservation->>'room_preference_id', '')::uuid;
  v_source := coalesce(nullif(p_reservation->>'source', ''), 'internal');

  perform pg_advisory_xact_lock(
    hashtextextended(p_restaurant_id::text || '|' || v_business_date::text, 0)
  );

  v_availability := public.reservation_availability_internal(
    p_restaurant_id,
    v_business_date,
    v_service_key,
    v_local_time,
    v_party_size,
    v_room_id,
    case when v_existing.id is null then null else v_existing.id end
  );
  if coalesce((v_availability->>'available')::boolean, false) is not true then
    raise exception '%', coalesce(v_availability->>'reason', 'Reservation is unavailable.')
      using errcode = 'P0001';
  end if;

  v_guest_name := btrim(p_reservation->>'guest_name');
  if v_guest_name = '' then raise exception 'Guest name is required.'; end if;
  v_email := nullif(btrim(p_reservation->>'guest_email'), '')::citext;
  v_normalized_email := case
    when v_email is null then null
    else lower(v_email::text)
  end;
  v_phone := nullif(btrim(p_reservation->>'guest_phone'), '');
  v_normalized_phone := case
    when v_phone is null then null
    else nullif(regexp_replace(v_phone, '[^0-9+]', '', 'g'), '')
  end;

  v_guest_id := nullif(p_reservation->>'guest_id', '')::uuid;
  if v_guest_id is null then
    select g.id
    into v_guest_id
    from public.reservation_guests g
    where g.restaurant_id = p_restaurant_id
      and g.anonymized_at is null
      and (
        (v_normalized_email is not null and g.normalized_email = v_normalized_email)
        or (v_normalized_phone is not null and g.normalized_phone = v_normalized_phone)
      )
    order by
      case when v_normalized_email is not null
        and g.normalized_email = v_normalized_email then 0 else 1 end,
      g.updated_at desc
    limit 1;
  end if;

  if v_guest_id is null then
    insert into public.reservation_guests (
      restaurant_id, display_name, email, normalized_email,
      phone, normalized_phone, language_code
    )
    values (
      p_restaurant_id, v_guest_name, v_email, v_normalized_email,
      v_phone, v_normalized_phone,
      coalesce(nullif(p_reservation->>'language_code', ''), 'fr')
    )
    returning id into v_guest_id;
  else
    update public.reservation_guests
    set display_name = v_guest_name,
      email = coalesce(v_email, email),
      normalized_email = coalesce(v_normalized_email, normalized_email),
      phone = coalesce(v_phone, phone),
      normalized_phone = coalesce(v_normalized_phone, normalized_phone)
    where restaurant_id = p_restaurant_id
      and id = v_guest_id;
  end if;

  v_status := case
    when v_existing.id is not null then v_existing.status
    when coalesce((v_availability->>'automatic_confirmation')::boolean, false)
      then 'confirmed'
    else 'pending'
  end;

  insert into public.reservations (
    id, restaurant_id, guest_id, business_date, service_key,
    starts_at, ends_at, party_size, status, source,
    room_preference_id, guest_comment, internal_notes,
    created_by_profile_id, updated_by_profile_id
  )
  values (
    v_id, p_restaurant_id, v_guest_id, v_business_date, v_service_key,
    (v_availability->>'starts_at')::timestamptz,
    (v_availability->>'ends_at')::timestamptz,
    v_party_size, v_status, v_source, v_room_id,
    nullif(btrim(p_reservation->>'guest_comment'), ''),
    nullif(btrim(p_reservation->>'internal_notes'), ''),
    v_actor.profile_id, v_actor.profile_id
  )
  on conflict (id) do update set
    guest_id = excluded.guest_id,
    business_date = excluded.business_date,
    service_key = excluded.service_key,
    starts_at = excluded.starts_at,
    ends_at = excluded.ends_at,
    party_size = excluded.party_size,
    source = excluded.source,
    room_preference_id = excluded.room_preference_id,
    guest_comment = excluded.guest_comment,
    internal_notes = excluded.internal_notes,
    updated_by_profile_id = excluded.updated_by_profile_id,
    revision = reservations.revision + 1
  where reservations.restaurant_id = p_restaurant_id;

  if v_existing.id is not null and not v_existing.assignment_locked then
    update public.reservation_table_assignments
    set unassigned_at = now()
    where restaurant_id = p_restaurant_id
      and reservation_id = v_id
      and unassigned_at is null;
  end if;

  v_assignment := v_availability->'assignment';
  if v_existing.id is null or not v_existing.assignment_locked then
    for v_table_id in
      select value from jsonb_array_elements(
        coalesce(v_assignment->'table_ids', '[]'::jsonb)
      )
    loop
      insert into public.reservation_table_assignments (
        restaurant_id, reservation_id, table_id, assigned_by_profile_id,
        explanation
      )
      values (
        p_restaurant_id,
        v_id,
        (v_table_id #>> '{}')::uuid,
        v_actor.profile_id,
        v_assignment->>'explanation'
      );
    end loop;
  end if;

  insert into public.reservation_events (
    restaurant_id, reservation_id, event_type, from_status, to_status,
    actor_profile_id, details
  )
  values (
    p_restaurant_id,
    v_id,
    case when v_existing.id is null then 'created' else 'updated' end,
    case when v_existing.id is null then null else v_existing.status end,
    v_status,
    v_actor.profile_id,
    jsonb_build_object(
      'business_date', v_business_date,
      'service_key', v_service_key,
      'party_size', v_party_size,
      'assignment', v_assignment
    )
  );

  return jsonb_build_object(
    'ok', true,
    'restaurant_id', p_restaurant_id,
    'reservation_id', v_id,
    'status', v_status,
    'availability', v_availability
  );
end
$$;

create function public.set_reservation_status(
  p_restaurant_id uuid,
  p_reservation_id uuid,
  p_status text,
  p_comment text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor record;
  v_reservation public.reservations%rowtype;
begin
  select *
  into v_actor
  from public.require_owner_or_manager_context(p_restaurant_id)
  limit 1;

  if p_status not in (
    'pending', 'confirmed', 'arrived', 'waiting', 'seated',
    'finished', 'cancelled', 'no_show'
  ) then
    raise exception 'Unsupported reservation status.';
  end if;

  select *
  into v_reservation
  from public.reservations r
  where r.restaurant_id = p_restaurant_id
    and r.id = p_reservation_id
  for update;
  if not found then raise exception 'Reservation not found.'; end if;

  if v_reservation.status = p_status then
    return jsonb_build_object(
      'ok', true,
      'restaurant_id', p_restaurant_id,
      'reservation_id', p_reservation_id,
      'status', p_status
    );
  end if;

  update public.reservations
  set status = p_status,
    updated_by_profile_id = v_actor.profile_id,
    revision = revision + 1
  where restaurant_id = p_restaurant_id
    and id = p_reservation_id;

  if p_status in ('cancelled', 'no_show', 'finished') then
    update public.reservation_table_assignments
    set unassigned_at = now()
    where restaurant_id = p_restaurant_id
      and reservation_id = p_reservation_id
      and unassigned_at is null;
  end if;

  insert into public.reservation_events (
    restaurant_id, reservation_id, event_type, from_status, to_status,
    actor_profile_id, details
  )
  values (
    p_restaurant_id,
    p_reservation_id,
    'status_changed',
    v_reservation.status,
    p_status,
    v_actor.profile_id,
    jsonb_build_object('comment', nullif(btrim(p_comment), ''))
  );

  return jsonb_build_object(
    'ok', true,
    'restaurant_id', p_restaurant_id,
    'reservation_id', p_reservation_id,
    'from_status', v_reservation.status,
    'status', p_status
  );
end
$$;

create function public.get_reservation_demand(
  p_restaurant_id uuid,
  p_from_date date,
  p_to_date date
)
returns table (
  business_date date,
  service_key text,
  reservation_count bigint,
  expected_covers bigint,
  first_arrival time,
  last_arrival time
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  perform 1 from public.require_owner_or_manager_context(p_restaurant_id);
  return query
  select
    r.business_date,
    r.service_key,
    count(*)::bigint,
    coalesce(sum(r.party_size), 0)::bigint,
    min((r.starts_at at time zone coalesce(settings.timezone, 'Europe/Brussels'))::time),
    max((r.starts_at at time zone coalesce(settings.timezone, 'Europe/Brussels'))::time)
  from public.reservations r
  left join public.restaurant_settings settings
    on settings.restaurant_id = r.restaurant_id
  where r.restaurant_id = p_restaurant_id
    and r.business_date between p_from_date and p_to_date
    and r.status not in ('cancelled', 'no_show')
  group by r.business_date, r.service_key
  order by r.business_date, r.service_key;
end
$$;

insert into public.reservation_service_settings (
  restaurant_id,
  service_key,
  booking_enabled,
  automatic_confirmation,
  slot_interval_minutes,
  default_duration_minutes,
  minimum_party_size,
  maximum_party_size,
  maximum_covers
)
select
  service.restaurant_id,
  service.service_key,
  false,
  true,
  15,
  120,
  1,
  12,
  null
from public.services service
where service.active
on conflict (restaurant_id, service_key) do nothing;

insert into public.reservation_rooms (
  restaurant_id,
  work_area_id,
  active,
  sort_order
)
select
  area.restaurant_id,
  area.id,
  false,
  area.sort_order
from public.work_areas area
where area.active
on conflict (restaurant_id, work_area_id) do nothing;

do $$
declare
  v_table text;
begin
  foreach v_table in array array[
    'reservation_service_settings',
    'reservation_rooms',
    'reservation_tables',
    'reservation_table_combinations',
    'reservation_table_combination_members',
    'reservation_service_exceptions',
    'reservation_guests',
    'reservations',
    'reservation_table_assignments',
    'reservation_events'
  ]
  loop
    execute format('alter table public.%I enable row level security', v_table);
    execute format(
      'revoke all on table public.%I from public, anon, authenticated',
      v_table
    );
    execute format('grant all on table public.%I to service_role', v_table);
  end loop;
end
$$;

revoke all on function public.guard_reservation_event_history()
  from public, anon, authenticated;
revoke all on function public.reservation_local_timestamp(uuid,date,time)
  from public, anon, authenticated;
revoke all on function public.reservation_assignment_candidate(
  uuid,timestamptz,timestamptz,integer,uuid,uuid
) from public, anon, authenticated;
revoke all on function public.reservation_availability_internal(
  uuid,date,text,time,integer,uuid,uuid
) from public, anon, authenticated;
revoke all on function public.get_reservation_workspace(uuid,date)
  from public, anon, authenticated;
revoke all on function public.get_reservation_setup(uuid)
  from public, anon, authenticated;
revoke all on function public.save_reservation_setup(
  uuid,jsonb,jsonb,jsonb,jsonb,jsonb
) from public, anon, authenticated;
revoke all on function public.check_reservation_availability(
  uuid,date,text,time,integer,uuid,uuid
) from public, anon, authenticated;
revoke all on function public.save_reservation(uuid,jsonb)
  from public, anon, authenticated;
revoke all on function public.set_reservation_status(uuid,uuid,text,text)
  from public, anon, authenticated;
revoke all on function public.get_reservation_demand(uuid,date,date)
  from public, anon, authenticated;

grant execute on function public.get_reservation_workspace(uuid,date)
  to authenticated;
grant execute on function public.get_reservation_setup(uuid)
  to authenticated;
grant execute on function public.save_reservation_setup(
  uuid,jsonb,jsonb,jsonb,jsonb,jsonb
) to authenticated;
grant execute on function public.check_reservation_availability(
  uuid,date,text,time,integer,uuid,uuid
) to authenticated;
grant execute on function public.save_reservation(uuid,jsonb)
  to authenticated;
grant execute on function public.set_reservation_status(uuid,uuid,text,text)
  to authenticated;
grant execute on function public.get_reservation_demand(uuid,date,date)
  to authenticated;

notify pgrst, 'reload schema';
