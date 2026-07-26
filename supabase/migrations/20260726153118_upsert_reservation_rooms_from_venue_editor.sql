-- The visual Restaurant editor creates a work area and its reservation-room
-- geometry in one draft. The original floor-plan RPC assumed every room
-- already existed, so a first save failed with "Reservation room not found."
-- Upsert the canonical room before tables/combinations are processed.

create or replace function public.save_reservation_floor_plans(
  p_restaurant_id uuid,
  p_floors jsonb,
  p_rooms jsonb,
  p_tables jsonb,
  p_combinations jsonb default '[]'::jsonb
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
begin
  perform 1 from public.require_owner_or_manager_context(p_restaurant_id);

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

  return jsonb_build_object('ok', true, 'restaurant_id', p_restaurant_id);
end
$$;

revoke all on function public.save_reservation_floor_plans(
  uuid,jsonb,jsonb,jsonb,jsonb
) from public, anon, authenticated;

grant execute on function public.save_reservation_floor_plans(
  uuid,jsonb,jsonb,jsonb,jsonb
) to authenticated;

notify pgrst, 'reload schema';
