-- Make reservation configuration identities stable across archive/revive cycles.
--
-- Floors are physical levels, not display names. Rooms are the reservation
-- identity of one work area. Tables keep their UUID for history, while an
-- archived label may be reused by a new active table.

begin;

alter table public.reservation_floors
  drop constraint if exists reservation_floors_restaurant_id_name_key;

alter table public.reservation_floors
  add constraint reservation_floors_restaurant_id_level_key
  unique (restaurant_id, level);

alter table public.reservation_tables
  drop constraint if exists reservation_tables_restaurant_id_room_id_label_key;

create unique index reservation_tables_active_room_label_key
  on public.reservation_tables (
    restaurant_id,
    room_id,
    lower(btrim(label))
  )
  where active;

alter table public.reservation_table_combinations
  drop constraint if exists reservation_table_combinations_restaurant_id_room_id_name_key;

create unique index reservation_combinations_active_room_name_key
  on public.reservation_table_combinations (
    restaurant_id,
    room_id,
    lower(btrim(name))
  )
  where active;

create or replace function public.ensure_reservation_service_setting()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.active then
    insert into public.reservation_service_settings (
      restaurant_id,
      service_key,
      booking_enabled
    )
    values (
      new.restaurant_id,
      new.service_key,
      false
    )
    on conflict (restaurant_id, service_key) do nothing;
  end if;
  return new;
end
$$;

drop trigger if exists services_ensure_reservation_setting
  on public.services;
create trigger services_ensure_reservation_setting
  after insert or update of active on public.services
  for each row execute function public.ensure_reservation_service_setting();

insert into public.reservation_service_settings (
  restaurant_id,
  service_key,
  booking_enabled
)
select
  service.restaurant_id,
  service.service_key,
  false
from public.services service
where service.active
on conflict (restaurant_id, service_key) do nothing;

revoke all on function public.ensure_reservation_service_setting()
  from public, anon, authenticated;

create or replace function public.get_reservation_floor_plans(
  p_restaurant_id uuid
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
    'revision', coalesce((
      select revision.venue_revision
      from public.reservation_configuration_revisions revision
      where revision.restaurant_id = p_restaurant_id
    ), 0),
    -- Inactive floors remain visible to the editor as identities. The client
    -- decides which canonical levels to reactivate and display.
    'floors', coalesce((
      select jsonb_agg(
        to_jsonb(floor)
        order by floor.sort_order, floor.level, floor.name
      )
      from public.reservation_floors floor
      where floor.restaurant_id = p_restaurant_id
    ), '[]'::jsonb),
    'areas', coalesce((
      select jsonb_agg(to_jsonb(area) order by area.sort_order, area.name)
      from public.work_areas area
      where area.restaurant_id = p_restaurant_id
        and area.active
    ), '[]'::jsonb),
    -- A room is the stable spatial identity for its work area. Return archived
    -- room identities for active areas so the editor revives rather than
    -- recreates them.
    'rooms', coalesce((
      select jsonb_agg(
        to_jsonb(room) ||
        jsonb_build_object(
          'name', area.name,
          'area_code', area.code,
          'area_color', coalesce(area.color, area.metadata->>'color'),
          'area_icon', area.icon_key
        )
        order by room.sort_order, area.name
      )
      from public.reservation_rooms room
      join public.work_areas area
        on area.restaurant_id = room.restaurant_id
       and area.id = room.work_area_id
      where room.restaurant_id = p_restaurant_id
        and area.active
    ), '[]'::jsonb),
    'tables', coalesce((
      select jsonb_agg(to_jsonb(table_row) order by table_row.sort_order, table_row.label)
      from public.reservation_tables table_row
      where table_row.restaurant_id = p_restaurant_id
        and table_row.active
    ), '[]'::jsonb),
    'combinations', coalesce((
      select jsonb_agg(
        to_jsonb(combination) ||
        jsonb_build_object(
          'table_ids', coalesce((
            select jsonb_agg(member.table_id order by member.sort_order, member.table_id)
            from public.reservation_table_combination_members member
            join public.reservation_tables member_table
              on member_table.restaurant_id = member.restaurant_id
             and member_table.id = member.table_id
             and member_table.active
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
  v_incoming_floor_id uuid;
  v_floor_id uuid;
  v_incoming_room_id uuid;
  v_room_id uuid;
  v_table_id uuid;
  v_combination_id uuid;
  v_current_revision integer;
  v_floor_map jsonb := '{}'::jsonb;
  v_room_map jsonb := '{}'::jsonb;
  v_active boolean;
begin
  perform 1 from public.require_owner_or_manager_context(p_restaurant_id);

  if jsonb_typeof(coalesce(p_floors, '[]'::jsonb)) <> 'array'
    or jsonb_typeof(coalesce(p_rooms, '[]'::jsonb)) <> 'array'
    or jsonb_typeof(coalesce(p_tables, '[]'::jsonb)) <> 'array'
    or jsonb_typeof(coalesce(p_combinations, '[]'::jsonb)) <> 'array' then
    raise exception 'Reservation layout payload is invalid.';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(coalesce(p_floors, '[]'::jsonb)) item
    group by coalesce((item->>'level')::integer, 0)
    having count(*) > 1
  ) then
    raise exception 'Each physical floor level can appear only once.';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(coalesce(p_rooms, '[]'::jsonb)) item
    group by item->>'work_area_id'
    having count(*) > 1
  ) then
    raise exception 'Each restaurant area can have only one reservation room.';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(coalesce(p_tables, '[]'::jsonb)) item
    where coalesce((item->>'active')::boolean, true)
    group by item->>'room_id', lower(btrim(item->>'label'))
    having count(*) > 1
  ) then
    raise exception 'TABLE_LABEL_DUPLICATE: Table labels must be unique inside an area.';
  end if;

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
    select value
    from jsonb_array_elements(coalesce(p_floors, '[]'::jsonb))
  loop
    if nullif(btrim(v_item->>'name'), '') is null then
      raise exception 'A floor name is required.';
    end if;

    v_incoming_floor_id :=
      coalesce(nullif(v_item->>'id', '')::uuid, gen_random_uuid());
    if exists (
      select 1
      from public.reservation_floors foreign_floor
      where foreign_floor.id = v_incoming_floor_id
        and foreign_floor.restaurant_id <> p_restaurant_id
    ) then
      raise exception 'A floor does not belong to this restaurant.';
    end if;

    insert into public.reservation_floors (
      id,
      restaurant_id,
      name,
      level,
      canvas_width,
      canvas_height,
      active,
      sort_order
    )
    values (
      v_incoming_floor_id,
      p_restaurant_id,
      btrim(v_item->>'name'),
      coalesce((v_item->>'level')::integer, 0),
      coalesce((v_item->>'canvas_width')::numeric, 1000),
      coalesce((v_item->>'canvas_height')::numeric, 600),
      coalesce((v_item->>'active')::boolean, true),
      coalesce((v_item->>'sort_order')::integer, 0)
    )
    on conflict (restaurant_id, level) do update set
      name = excluded.name,
      canvas_width = excluded.canvas_width,
      canvas_height = excluded.canvas_height,
      active = excluded.active,
      sort_order = excluded.sort_order
    returning id into v_floor_id;

    v_floor_map := v_floor_map || jsonb_build_object(
      v_incoming_floor_id::text,
      v_floor_id::text
    );
  end loop;

  for v_item in
    select value
    from jsonb_array_elements(coalesce(p_rooms, '[]'::jsonb))
  loop
    v_incoming_room_id :=
      coalesce(nullif(v_item->>'id', '')::uuid, gen_random_uuid());
    if exists (
      select 1
      from public.reservation_rooms foreign_room
      where foreign_room.id = v_incoming_room_id
        and foreign_room.restaurant_id <> p_restaurant_id
    ) then
      raise exception 'An area layout does not belong to this restaurant.';
    end if;
    if not exists (
      select 1
      from public.work_areas area
      where area.restaurant_id = p_restaurant_id
        and area.id = (v_item->>'work_area_id')::uuid
    ) then
      raise exception 'A reservation area is unavailable.';
    end if;
    v_floor_id := nullif(
      coalesce(
        v_floor_map->>(v_item->>'floor_id'),
        nullif(v_item->>'floor_id', '')
      ),
      ''
    )::uuid;

    insert into public.reservation_rooms (
      id,
      restaurant_id,
      work_area_id,
      floor_id,
      position_x,
      position_y,
      width,
      height,
      active,
      sort_order
    )
    values (
      v_incoming_room_id,
      p_restaurant_id,
      (v_item->>'work_area_id')::uuid,
      v_floor_id,
      coalesce((v_item->>'position_x')::numeric, 0),
      coalesce((v_item->>'position_y')::numeric, 0),
      coalesce((v_item->>'width')::numeric, 452),
      coalesce((v_item->>'height')::numeric, 252),
      coalesce((v_item->>'active')::boolean, true),
      coalesce((v_item->>'sort_order')::integer, 0)
    )
    on conflict (restaurant_id, work_area_id) do update set
      floor_id = excluded.floor_id,
      position_x = excluded.position_x,
      position_y = excluded.position_y,
      width = excluded.width,
      height = excluded.height,
      active = excluded.active,
      sort_order = excluded.sort_order
    returning id into v_room_id;

    v_room_map := v_room_map || jsonb_build_object(
      v_incoming_room_id::text,
      v_room_id::text
    );
  end loop;

  -- Deactivate submitted table identities before applying the final snapshot.
  -- This makes label swaps and archive-then-reuse deterministic.
  update public.reservation_tables table_row
  set active = false
  where table_row.restaurant_id = p_restaurant_id
    and table_row.id in (
      select (item->>'id')::uuid
      from jsonb_array_elements(coalesce(p_tables, '[]'::jsonb)) item
      where nullif(item->>'id', '') is not null
    );

  for v_item in
    select value
    from jsonb_array_elements(coalesce(p_tables, '[]'::jsonb))
    order by coalesce((value->>'active')::boolean, true)
  loop
    v_table_id := coalesce(nullif(v_item->>'id', '')::uuid, gen_random_uuid());
    if exists (
      select 1
      from public.reservation_tables foreign_table
      where foreign_table.id = v_table_id
        and foreign_table.restaurant_id <> p_restaurant_id
    ) then
      raise exception 'A table does not belong to this restaurant.';
    end if;
    v_room_id := nullif(
      coalesce(
        v_room_map->>(v_item->>'room_id'),
        nullif(v_item->>'room_id', '')
      ),
      ''
    )::uuid;
    v_active := coalesce((v_item->>'active')::boolean, true);

    if nullif(btrim(v_item->>'label'), '') is null then
      raise exception 'A table label is required.';
    end if;
    if v_room_id is null then
      raise exception 'Every table must belong to an area.';
    end if;
    if v_active and not exists (
      select 1
      from public.reservation_rooms active_room
      where active_room.restaurant_id = p_restaurant_id
        and active_room.id = v_room_id
        and active_room.active
    ) then
      raise exception 'An active table must belong to an active area.';
    end if;
    if v_active and exists (
      select 1
      from public.reservation_tables existing
      where existing.restaurant_id = p_restaurant_id
        and existing.room_id = v_room_id
        and existing.active
        and existing.id <> v_table_id
        and lower(btrim(existing.label)) = lower(btrim(v_item->>'label'))
    ) then
      raise exception 'TABLE_LABEL_DUPLICATE: Table % already exists in this area.',
        btrim(v_item->>'label');
    end if;

    insert into public.reservation_tables (
      id,
      restaurant_id,
      room_id,
      label,
      minimum_capacity,
      maximum_capacity,
      shape,
      position_x,
      position_y,
      width,
      height,
      rotation_degrees,
      active,
      blocked,
      sort_order
    )
    values (
      v_table_id,
      p_restaurant_id,
      v_room_id,
      btrim(v_item->>'label'),
      coalesce((v_item->>'minimum_capacity')::integer, 1),
      coalesce((v_item->>'maximum_capacity')::integer, 2),
      coalesce(nullif(v_item->>'shape', ''), 'square'),
      coalesce((v_item->>'position_x')::numeric, 0),
      coalesce((v_item->>'position_y')::numeric, 0),
      coalesce((v_item->>'width')::numeric, 96),
      coalesce((v_item->>'height')::numeric, 72),
      coalesce((v_item->>'rotation_degrees')::numeric, 0),
      v_active,
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

  update public.reservation_table_combinations combination
  set active = false
  where combination.restaurant_id = p_restaurant_id
    and combination.id in (
      select (item->>'id')::uuid
      from jsonb_array_elements(coalesce(p_combinations, '[]'::jsonb)) item
      where nullif(item->>'id', '') is not null
    );

  for v_item in
    select value
    from jsonb_array_elements(coalesce(p_combinations, '[]'::jsonb))
    order by coalesce((value->>'active')::boolean, true)
  loop
    v_combination_id :=
      coalesce(nullif(v_item->>'id', '')::uuid, gen_random_uuid());
    if exists (
      select 1
      from public.reservation_table_combinations foreign_combination
      where foreign_combination.id = v_combination_id
        and foreign_combination.restaurant_id <> p_restaurant_id
    ) then
      raise exception 'A table combination does not belong to this restaurant.';
    end if;
    v_room_id := nullif(
      coalesce(
        v_room_map->>(v_item->>'room_id'),
        nullif(v_item->>'room_id', '')
      ),
      ''
    )::uuid;
    if coalesce((v_item->>'active')::boolean, true) and not exists (
      select 1
      from public.reservation_rooms active_room
      where active_room.restaurant_id = p_restaurant_id
        and active_room.id = v_room_id
        and active_room.active
    ) then
      raise exception 'An active table combination must belong to an active area.';
    end if;

    insert into public.reservation_table_combinations (
      id,
      restaurant_id,
      room_id,
      name,
      minimum_capacity,
      maximum_capacity,
      active,
      sort_order
    )
    values (
      v_combination_id,
      p_restaurant_id,
      v_room_id,
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

    if coalesce((v_item->>'active')::boolean, true) then
      for v_member in
        select value
        from jsonb_array_elements(coalesce(v_item->'table_ids', '[]'::jsonb))
      loop
        if not exists (
          select 1
          from public.reservation_tables member_table
          where member_table.restaurant_id = p_restaurant_id
            and member_table.id = (v_member #>> '{}')::uuid
        ) then
          raise exception 'A table combination contains an unknown table.';
        end if;

        -- Archived or moved tables simply leave their old combination. This is
        -- normal reconciliation, not a save blocker.
        if exists (
          select 1
          from public.reservation_tables member_table
          where member_table.restaurant_id = p_restaurant_id
            and member_table.id = (v_member #>> '{}')::uuid
            and member_table.room_id = v_room_id
            and member_table.active
        ) then
          insert into public.reservation_table_combination_members (
            restaurant_id,
            combination_id,
            table_id,
            sort_order
          )
          values (
            p_restaurant_id,
            v_combination_id,
            (v_member #>> '{}')::uuid,
            0
          );
        end if;
      end loop;
    end if;
  end loop;

  delete from public.reservation_table_combination_members member
  using public.reservation_tables member_table
  where member.restaurant_id = p_restaurant_id
    and member_table.restaurant_id = member.restaurant_id
    and member_table.id = member.table_id
    and not member_table.active;

  update public.reservation_table_combinations combination
  set active = false
  where combination.restaurant_id = p_restaurant_id
    and combination.active
    and (
      select count(*)
      from public.reservation_table_combination_members member
      join public.reservation_tables member_table
        on member_table.restaurant_id = member.restaurant_id
       and member_table.id = member.table_id
       and member_table.active
       and member_table.room_id = combination.room_id
      where member.restaurant_id = combination.restaurant_id
        and member.combination_id = combination.id
    ) < 2;

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

-- Online channel availability and manager-entered reservations are separate
-- concerns. Keep the online guard for non-operators while allowing an
-- authenticated owner/manager to record phone, walk-in and internal bookings.
do $allow_operator_reservations_when_online_off$
declare
  v_definition text;
  v_next text;
  v_online_guard text := $guard$
  if not v_setting.booking_enabled then
    return jsonb_build_object(
      'available', false,
      'code', 'booking_disabled',
      'reason', 'Bookings are disabled for this service.'
    );
  end if;

$guard$;
  v_operator_guard text := $guard$
  if not v_setting.booking_enabled
    and not public.is_owner_or_manager(p_restaurant_id) then
    return jsonb_build_object(
      'available', false,
      'code', 'booking_disabled',
      'reason', 'Online bookings are disabled for this service.'
    );
  end if;

$guard$;
begin
  select replace(
    pg_get_functiondef(
      'public.reservation_availability_internal(uuid,date,text,time,integer,uuid,uuid)'::regprocedure
    ),
    chr(13),
    ''
  )
  into v_definition;

  v_next := replace(v_definition, v_online_guard, v_operator_guard);
  if v_next = v_definition then
    raise exception 'Reservation online-channel guard contract drifted.';
  end if;

  execute v_next;
end
$allow_operator_reservations_when_online_off$;

revoke all on function public.get_reservation_floor_plans(uuid)
  from public, anon;
grant execute on function public.get_reservation_floor_plans(uuid)
  to authenticated;

revoke all on function public.save_reservation_floor_plans(
  uuid,jsonb,jsonb,jsonb,jsonb,integer
) from public, anon;
grant execute on function public.save_reservation_floor_plans(
  uuid,jsonb,jsonb,jsonb,jsonb,integer
) to authenticated;

notify pgrst, 'reload schema';

commit;
