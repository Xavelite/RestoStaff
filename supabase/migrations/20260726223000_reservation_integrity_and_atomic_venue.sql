-- Phase 1 + 2 stabilization: migration parity, atomic venue writes and
-- reservation integrity. This migration is additive against the reconciled
-- DEV ledger and must be applied before deploying the matching frontend.

create table public.reservation_configuration_revisions (
  restaurant_id uuid primary key
    references public.restaurants(id) on delete cascade,
  venue_revision integer not null default 0 check (venue_revision >= 0),
  setup_revision integer not null default 0 check (setup_revision >= 0),
  updated_at timestamptz not null default now()
);

insert into public.reservation_configuration_revisions (restaurant_id)
select restaurant.id
from public.restaurants restaurant
on conflict (restaurant_id) do nothing;

alter table public.reservation_configuration_revisions enable row level security;
revoke all on table public.reservation_configuration_revisions
  from public, anon, authenticated;
grant all on table public.reservation_configuration_revisions to service_role;

alter table public.reservation_service_exceptions
  drop constraint if exists reservation_service_exceptions_check;
alter table public.reservation_service_exceptions
  add constraint reservation_service_exceptions_open_window_check
  check (
    availability = 'closed'
    or (
      opens_at is not null
      and closes_at is not null
      and opens_at <> closes_at
    )
  );

create or replace function public.guard_reservation_combination_member_room()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_combination_room_id uuid;
  v_table_room_id uuid;
begin
  select combination.room_id
  into v_combination_room_id
  from public.reservation_table_combinations combination
  where combination.restaurant_id = new.restaurant_id
    and combination.id = new.combination_id;

  select reservation_table.room_id
  into v_table_room_id
  from public.reservation_tables reservation_table
  where reservation_table.restaurant_id = new.restaurant_id
    and reservation_table.id = new.table_id;

  if v_combination_room_id is null or v_table_room_id is null then
    raise exception 'Reservation combination or table not found.';
  end if;
  if v_combination_room_id <> v_table_room_id then
    raise exception 'Every table in a combination must belong to the combination room.';
  end if;
  return new;
end
$$;

drop trigger if exists reservation_combination_member_room_guard
  on public.reservation_table_combination_members;
create trigger reservation_combination_member_room_guard
  before insert or update
  on public.reservation_table_combination_members
  for each row execute function public.guard_reservation_combination_member_room();

revoke all on function public.guard_reservation_combination_member_room()
  from public, anon, authenticated;




drop function if exists public.save_reservation_floor_plans(
  uuid,jsonb,jsonb,jsonb,jsonb
);
drop function if exists public.save_reservation_setup(
  uuid,jsonb,jsonb,jsonb,jsonb,jsonb
);
drop function if exists public.set_reservation_status(
  uuid,uuid,text,text
);


create or replace function public.get_reservation_floor_plans(p_restaurant_id uuid)
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
    'revision', coalesce((
      select revision.venue_revision
      from public.reservation_configuration_revisions revision
      where revision.restaurant_id = p_restaurant_id
    ), 0),
    'floors', coalesce((
      select jsonb_agg(to_jsonb(floor) order by floor.sort_order, floor.level, floor.name)
      from public.reservation_floors floor
      where floor.restaurant_id = p_restaurant_id
        and floor.active
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
        and room.active
    ), '[]'::jsonb),
    'tables', coalesce((
      select jsonb_agg(to_jsonb(t) order by t.sort_order, t.label)
      from public.reservation_tables t
      where t.restaurant_id = p_restaurant_id
        and t.active
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
        and combination.active
    ), '[]'::jsonb)
  );
end
$$;

create or replace function public.get_reservation_setup(p_restaurant_id uuid)
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
    'revision', coalesce((
      select revision.setup_revision
      from public.reservation_configuration_revisions revision
      where revision.restaurant_id = p_restaurant_id
    ), 0),
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

create or replace function public.save_reservation_floor_plans(
  p_restaurant_id uuid,
  p_floors jsonb,
  p_rooms jsonb,
  p_tables jsonb,
  p_combinations jsonb default '[]'::jsonb,
  p_expected_revision integer default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_item jsonb;
  v_member jsonb;
  v_floor_id uuid;
  v_room_id uuid;
  v_table_id uuid;
  v_combination_id uuid;
  v_current_revision integer;
begin
  perform 1 from public.require_owner_or_manager_context(p_restaurant_id);

  insert into public.reservation_configuration_revisions (restaurant_id)
  values (p_restaurant_id)
  on conflict (restaurant_id) do nothing;

  select revision.venue_revision
  into v_current_revision
  from public.reservation_configuration_revisions revision
  where revision.restaurant_id = p_restaurant_id
  for update;

  if p_expected_revision is null then
    raise exception 'CONFLICT: Venue revision is required. Reload before saving.';
  end if;
  if v_current_revision <> p_expected_revision then
    raise exception 'CONFLICT: Venue changed since it was loaded. Reload before saving.';
  end if;

  for v_item in
    select value from jsonb_array_elements(coalesce(p_floors, '[]'::jsonb))
  loop
    v_floor_id := coalesce(nullif(v_item->>'id', '')::uuid, gen_random_uuid());
    insert into public.reservation_floors (
      id, restaurant_id, name, level, canvas_width, canvas_height,
      active, sort_order
    )
    values (
      v_floor_id,
      p_restaurant_id,
      btrim(v_item->>'name'),
      coalesce((v_item->>'level')::integer, 0),
      coalesce((v_item->>'canvas_width')::numeric, 1000),
      coalesce((v_item->>'canvas_height')::numeric, 600),
      coalesce((v_item->>'active')::boolean, true),
      coalesce((v_item->>'sort_order')::integer, 0)
    )
    on conflict (id) do update set
      name = excluded.name,
      level = excluded.level,
      canvas_width = excluded.canvas_width,
      canvas_height = excluded.canvas_height,
      active = excluded.active,
      sort_order = excluded.sort_order
    where reservation_floors.restaurant_id = p_restaurant_id;
  end loop;

  for v_item in
    select value from jsonb_array_elements(coalesce(p_rooms, '[]'::jsonb))
  loop
    v_room_id := coalesce(nullif(v_item->>'id', '')::uuid, gen_random_uuid());
    insert into public.reservation_rooms (
      id, restaurant_id, work_area_id, floor_id,
      position_x, position_y, width, height, active, sort_order
    )
    values (
      v_room_id,
      p_restaurant_id,
      (v_item->>'work_area_id')::uuid,
      nullif(v_item->>'floor_id', '')::uuid,
      coalesce((v_item->>'position_x')::numeric, 0),
      coalesce((v_item->>'position_y')::numeric, 0),
      coalesce((v_item->>'width')::numeric, 452),
      coalesce((v_item->>'height')::numeric, 252),
      coalesce((v_item->>'active')::boolean, true),
      coalesce((v_item->>'sort_order')::integer, 0)
    )
    on conflict (id) do update set
      work_area_id = excluded.work_area_id,
      floor_id = excluded.floor_id,
      position_x = excluded.position_x,
      position_y = excluded.position_y,
      width = excluded.width,
      height = excluded.height,
      active = excluded.active,
      sort_order = excluded.sort_order
    where reservation_rooms.restaurant_id = p_restaurant_id;
  end loop;

  for v_item in
    select value from jsonb_array_elements(coalesce(p_tables, '[]'::jsonb))
  loop
    v_table_id := coalesce(nullif(v_item->>'id', '')::uuid, gen_random_uuid());
    insert into public.reservation_tables (
      id, restaurant_id, room_id, label, minimum_capacity, maximum_capacity,
      shape, position_x, position_y, width, height, rotation_degrees,
      active, blocked, sort_order
    )
    values (
      v_table_id,
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
    v_combination_id := coalesce(nullif(v_item->>'id', '')::uuid, gen_random_uuid());
    insert into public.reservation_table_combinations (
      id, restaurant_id, room_id, name, minimum_capacity, maximum_capacity,
      active, sort_order
    )
    values (
      v_combination_id,
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
      and combination_id = v_combination_id;

    for v_member in
      select value
      from jsonb_array_elements(coalesce(v_item->'table_ids', '[]'::jsonb))
    loop
      insert into public.reservation_table_combination_members (
        restaurant_id, combination_id, table_id, sort_order
      )
      values (
        p_restaurant_id,
        v_combination_id,
        (v_member #>> '{}')::uuid,
        0
      );
    end loop;
  end loop;

  update public.reservation_configuration_revisions
  set venue_revision = venue_revision + 1,
    setup_revision = setup_revision + 1,
    updated_at = now()
  where restaurant_id = p_restaurant_id
  returning venue_revision into v_current_revision;

  return jsonb_build_object(
    'ok', true,
    'restaurant_id', p_restaurant_id,
    'revision', v_current_revision
  );
end
$$;

create or replace function public.save_reservation_setup(
  p_restaurant_id uuid,
  p_services jsonb,
  p_rooms jsonb,
  p_tables jsonb,
  p_combinations jsonb default '[]'::jsonb,
  p_exceptions jsonb default '[]'::jsonb,
  p_expected_revision integer default null
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
  v_combination_id uuid;
  v_current_revision integer;
begin
  select *
  into v_actor
  from public.require_owner_or_manager_context(p_restaurant_id)
  limit 1;

  insert into public.reservation_configuration_revisions (restaurant_id)
  values (p_restaurant_id)
  on conflict (restaurant_id) do nothing;

  select revision.setup_revision
  into v_current_revision
  from public.reservation_configuration_revisions revision
  where revision.restaurant_id = p_restaurant_id
  for update;

  if p_expected_revision is null then
    raise exception 'CONFLICT: Reservation setup revision is required. Reload before saving.';
  end if;
  if v_current_revision <> p_expected_revision then
    raise exception 'CONFLICT: Reservation setup changed since it was loaded. Reload before saving.';
  end if;

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
    v_combination_id := coalesce(nullif(v_item->>'id', '')::uuid, gen_random_uuid());
    insert into public.reservation_table_combinations (
      id, restaurant_id, room_id, name, minimum_capacity, maximum_capacity,
      active, sort_order
    )
    values (
      v_combination_id,
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
      and combination_id = v_combination_id;

    for v_member in
      select value
      from jsonb_array_elements(coalesce(v_item->'table_ids', '[]'::jsonb))
    loop
      insert into public.reservation_table_combination_members (
        restaurant_id, combination_id, table_id, sort_order
      )
      values (
        p_restaurant_id,
        v_combination_id,
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

  update public.reservation_configuration_revisions
  set setup_revision = setup_revision + 1,
    venue_revision = venue_revision + 1,
    updated_at = now()
  where restaurant_id = p_restaurant_id
  returning setup_revision into v_current_revision;

  return jsonb_build_object(
    'ok', true,
    'restaurant_id', p_restaurant_id,
    'revision', v_current_revision
  );
end
$$;

create or replace function public.reservation_availability_internal(
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
  v_timezone text;
  v_today date;
  v_service_opens_at timestamptz;
  v_service_closes_at timestamptz;
  v_overnight boolean;
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

  if v_opens_at is null or v_closes_at is null or v_opens_at = v_closes_at then
    return jsonb_build_object(
      'available', false,
      'code', 'outside_service',
      'reason', 'The requested time is outside this service.'
    );
  end if;

  v_overnight := v_closes_at < v_opens_at;
  if (
    not v_overnight
    and (p_local_time < v_opens_at or p_local_time >= v_closes_at)
  ) or (
    v_overnight
    and p_local_time < v_opens_at
    and p_local_time >= v_closes_at
  ) then
    return jsonb_build_object(
      'available', false,
      'code', 'outside_service',
      'reason', 'The requested time is outside this service.'
    );
  end if;

  select coalesce(nullif(settings.timezone, ''), 'Europe/Brussels')
  into v_timezone
  from public.restaurant_settings settings
  where settings.restaurant_id = p_restaurant_id;
  v_timezone := coalesce(v_timezone, 'Europe/Brussels');
  v_today := (now() at time zone v_timezone)::date;

  v_service_opens_at := public.reservation_local_timestamp(
    p_restaurant_id,
    p_business_date,
    v_opens_at
  );
  v_service_closes_at := public.reservation_local_timestamp(
    p_restaurant_id,
    p_business_date + case when v_overnight then 1 else 0 end,
    v_closes_at
  );
  v_starts_at := public.reservation_local_timestamp(
    p_restaurant_id,
    p_business_date + case
      when v_overnight and p_local_time < v_closes_at then 1
      else 0
    end,
    p_local_time
  );

  v_slot_offset :=
    floor(extract(epoch from (v_starts_at - v_service_opens_at)) / 60)::integer;
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

  v_ends_at := v_starts_at
    + make_interval(mins => v_setting.default_duration_minutes + v_setting.turn_time_minutes);

  if v_ends_at > v_service_closes_at then
    return jsonb_build_object(
      'available', false,
      'code', 'duration',
      'reason', 'The meal duration would continue beyond the end of service.'
    );
  end if;

  if p_business_date > v_today + v_setting.advance_booking_days then
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

create or replace function public.save_reservation(
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
  v_expected_revision integer;
  v_assignment_group_id uuid;
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

    v_expected_revision := nullif(p_reservation->>'expected_revision', '')::integer;
    if v_expected_revision is null then
      raise exception 'CONFLICT: Reservation revision is required. Reload before saving.';
    end if;
    if v_existing.revision <> v_expected_revision then
      raise exception 'CONFLICT: Reservation changed since it was loaded. Reload before saving.';
    end if;
    if v_existing.status in ('finished', 'cancelled', 'no_show') then
      raise exception 'Finished, cancelled and no-show reservations cannot be edited.';
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
  v_assignment_group_id := gen_random_uuid();
  if v_existing.id is null or not v_existing.assignment_locked then
    for v_table_id in
      select value from jsonb_array_elements(
        coalesce(v_assignment->'table_ids', '[]'::jsonb)
      )
    loop
      insert into public.reservation_table_assignments (
        restaurant_id, reservation_id, table_id, assignment_group_id,
        assigned_by_profile_id, explanation
      )
      values (
        p_restaurant_id,
        v_id,
        (v_table_id #>> '{}')::uuid,
        v_assignment_group_id,
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

create or replace function public.set_reservation_status(
  p_restaurant_id uuid,
  p_reservation_id uuid,
  p_status text,
  p_comment text default null,
  p_expected_revision integer default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor record;
  v_reservation public.reservations%rowtype;
  v_next_revision integer;
  v_allowed boolean := false;
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
  from public.reservations reservation
  where reservation.restaurant_id = p_restaurant_id
    and reservation.id = p_reservation_id
  for update;
  if not found then raise exception 'Reservation not found.'; end if;

  if p_expected_revision is null then
    raise exception 'CONFLICT: Reservation revision is required. Reload before changing status.';
  end if;
  if v_reservation.revision <> p_expected_revision then
    raise exception 'CONFLICT: Reservation changed since it was loaded. Reload before changing status.';
  end if;

  if v_reservation.status = p_status then
    return jsonb_build_object(
      'ok', true,
      'restaurant_id', p_restaurant_id,
      'reservation_id', p_reservation_id,
      'status', p_status,
      'revision', v_reservation.revision
    );
  end if;

  v_allowed := case v_reservation.status
    when 'pending' then p_status in ('confirmed', 'arrived', 'waiting', 'seated', 'cancelled', 'no_show')
    when 'confirmed' then p_status in ('arrived', 'waiting', 'seated', 'cancelled', 'no_show')
    when 'arrived' then p_status in ('waiting', 'seated', 'cancelled', 'no_show')
    when 'waiting' then p_status in ('seated', 'cancelled', 'no_show')
    when 'seated' then p_status = 'finished'
    else false
  end;

  if not v_allowed then
    raise exception 'Reservation status cannot move from % to %.',
      v_reservation.status, p_status;
  end if;

  update public.reservations
  set status = p_status,
    updated_by_profile_id = v_actor.profile_id,
    revision = revision + 1
  where restaurant_id = p_restaurant_id
    and id = p_reservation_id
  returning revision into v_next_revision;

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
    'status', p_status,
    'revision', v_next_revision
  );
end
$$;

create function public.save_venue_model(
  p_restaurant_id uuid,
  p_restaurant jsonb,
  p_settings jsonb,
  p_job_functions jsonb,
  p_areas jsonb,
  p_opening_hours jsonb,
  p_area_service_defaults jsonb,
  p_coverage_requirements jsonb,
  p_floors jsonb,
  p_rooms jsonb,
  p_tables jsonb,
  p_combinations jsonb default '[]'::jsonb,
  p_expected_revision integer default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_result jsonb;
begin
  perform 1 from public.require_owner_or_manager_context(p_restaurant_id);

  perform public.save_restaurant_model(
    p_restaurant_id,
    p_restaurant,
    p_settings,
    p_job_functions,
    p_areas,
    p_opening_hours,
    p_area_service_defaults,
    p_coverage_requirements
  );

  v_result := public.save_reservation_floor_plans(
    p_restaurant_id,
    p_floors,
    p_rooms,
    p_tables,
    p_combinations,
    p_expected_revision
  );

  return v_result || jsonb_build_object('venue_saved', true);
end
$$;



revoke all on function public.get_reservation_floor_plans(uuid)
  from public, anon;
grant execute on function public.get_reservation_floor_plans(uuid)
  to authenticated;

revoke all on function public.get_reservation_setup(uuid)
  from public, anon;
grant execute on function public.get_reservation_setup(uuid)
  to authenticated;

revoke all on function public.save_reservation_floor_plans(
  uuid,jsonb,jsonb,jsonb,jsonb,integer
) from public, anon;
grant execute on function public.save_reservation_floor_plans(
  uuid,jsonb,jsonb,jsonb,jsonb,integer
) to authenticated;

revoke all on function public.save_reservation_setup(
  uuid,jsonb,jsonb,jsonb,jsonb,jsonb,integer
) from public, anon;
grant execute on function public.save_reservation_setup(
  uuid,jsonb,jsonb,jsonb,jsonb,jsonb,integer
) to authenticated;

revoke all on function public.save_venue_model(
  uuid,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,integer
) from public, anon;
grant execute on function public.save_venue_model(
  uuid,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,integer
) to authenticated;

revoke all on function public.save_reservation(uuid,jsonb)
  from public, anon;
grant execute on function public.save_reservation(uuid,jsonb)
  to authenticated;

revoke all on function public.set_reservation_status(
  uuid,uuid,text,text,integer
) from public, anon;
grant execute on function public.set_reservation_status(
  uuid,uuid,text,text,integer
) to authenticated;

notify pgrst, 'reload schema';
