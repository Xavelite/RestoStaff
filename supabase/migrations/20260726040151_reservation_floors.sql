-- Physical floor hierarchy and visual area placement for Reservations.
--
-- A Restaurant work area remains the operational source of truth. A
-- reservation room links that area to one physical floor and stores its visual
-- bounds. Tables use the same logical floor coordinates.

create table public.reservation_floors (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null,
  name text not null check (length(btrim(name)) between 1 and 100),
  level integer not null default 0 check (level between -20 and 200),
  canvas_width numeric(8,2) not null default 1000
    check (canvas_width between 400 and 4000),
  canvas_height numeric(8,2) not null default 600
    check (canvas_height between 300 and 3000),
  active boolean not null default true,
  sort_order integer not null default 0,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (restaurant_id, id),
  unique (restaurant_id, name),
  foreign key (restaurant_id) references public.restaurants(id) on delete cascade
);

alter table public.reservation_rooms
  add column floor_id uuid,
  add column position_x numeric(8,2) not null default 24,
  add column position_y numeric(8,2) not null default 24,
  add column width numeric(8,2) not null default 952 check (width between 120 and 4000),
  add column height numeric(8,2) not null default 552 check (height between 100 and 3000),
  add constraint reservation_rooms_floor_fk
    foreign key (restaurant_id, floor_id)
    references public.reservation_floors(restaurant_id, id)
    on delete set null;

create index reservation_rooms_floor_idx
  on public.reservation_rooms (restaurant_id, floor_id, active, sort_order);

create trigger reservation_floors_set_updated_at
  before update on public.reservation_floors
  for each row execute function public.set_updated_at();

insert into public.reservation_floors (
  id, restaurant_id, name, level, canvas_width, canvas_height, active, sort_order
)
select
  gen_random_uuid(),
  room.restaurant_id,
  'Ground floor',
  0,
  1000,
  600,
  true,
  0
from public.reservation_rooms room
group by room.restaurant_id
on conflict (restaurant_id, name) do nothing;

update public.reservation_rooms room
set floor_id = floor.id
from public.reservation_floors floor
where floor.restaurant_id = room.restaurant_id
  and floor.name = 'Ground floor'
  and room.floor_id is null;

alter table public.reservation_floors enable row level security;
revoke all on table public.reservation_floors from public, anon, authenticated;
grant all on table public.reservation_floors to service_role;

create function public.get_reservation_floor_plans(p_restaurant_id uuid)
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

create function public.save_reservation_floor_plans(
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
    v_room_id := nullif(v_item->>'id', '')::uuid;
    update public.reservation_rooms
    set floor_id = nullif(v_item->>'floor_id', '')::uuid,
      position_x = coalesce((v_item->>'position_x')::numeric, position_x),
      position_y = coalesce((v_item->>'position_y')::numeric, position_y),
      width = coalesce((v_item->>'width')::numeric, width),
      height = coalesce((v_item->>'height')::numeric, height),
      sort_order = coalesce((v_item->>'sort_order')::integer, sort_order)
    where restaurant_id = p_restaurant_id
      and id = v_room_id;
    if not found then raise exception 'Reservation room not found.'; end if;
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

revoke all on function public.get_reservation_floor_plans(uuid)
  from public, anon, authenticated;
revoke all on function public.save_reservation_floor_plans(
  uuid,jsonb,jsonb,jsonb,jsonb
) from public, anon, authenticated;

grant execute on function public.get_reservation_floor_plans(uuid)
  to authenticated;
grant execute on function public.save_reservation_floor_plans(
  uuid,jsonb,jsonb,jsonb,jsonb
) to authenticated;

notify pgrst, 'reload schema';
