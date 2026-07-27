-- Floor is operational context for a physical work-area instance, not a
-- reservation-only concern. Keeping the resolved level on work_areas lets Team,
-- Staffing and Planning show an unambiguous Bar (0.A) / Bar (+2.B) label without
-- loading the spatial editor. The floor plan remains the source of truth and
-- save_venue_model synchronizes this column atomically.
begin;

alter table public.work_areas
  add column floor_level smallint,
  add constraint work_areas_floor_level_reasonable
    check (floor_level is null or floor_level between -20 and 100);

update public.work_areas area
set floor_level = floor.level
from public.reservation_rooms room
join public.reservation_floors floor
  on floor.restaurant_id = room.restaurant_id
 and floor.id = room.floor_id
where room.restaurant_id = area.restaurant_id
  and room.work_area_id = area.id
  and room.active
  and floor.active;

do $work_area_floor_write_model$
declare
  v_definition text;
  v_next text;
  v_old_area text := $old_area$
    insert into public.work_areas (
      id, restaurant_id, code, name, notes, active, sort_order,
      catalogue_key, color, icon_key, instance_number, metadata
    ) values (
      v_id, p_restaurant_id,
      coalesce(nullif(btrim(v_item->>'code'), ''), public.slugify_workspace(v_name)),
      v_name,
      nullif(btrim(v_item->>'notes'), ''),
      coalesce((v_item->>'active')::boolean, true),
      coalesce(nullif(v_item->>'sort_order', '')::integer, 0),
      nullif(btrim(v_item->>'catalogue_key'), ''),
      nullif(btrim(v_item->>'color'), ''),
      nullif(btrim(v_item->>'icon_key'), ''),
      nullif(v_item->>'instance_number', '')::integer,
      coalesce(v_item->'metadata', '{}'::jsonb)
    )
    on conflict (restaurant_id, id) do update set
      code = excluded.code, name = excluded.name, notes = excluded.notes,
      active = excluded.active, sort_order = excluded.sort_order,
      catalogue_key = excluded.catalogue_key,
      color = excluded.color,
      icon_key = excluded.icon_key,
      instance_number = excluded.instance_number,
      metadata = excluded.metadata, updated_at = now();
$old_area$;
  v_new_area text := $new_area$
    insert into public.work_areas (
      id, restaurant_id, code, name, notes, active, sort_order,
      catalogue_key, color, icon_key, instance_number, floor_level, metadata
    ) values (
      v_id, p_restaurant_id,
      coalesce(nullif(btrim(v_item->>'code'), ''), public.slugify_workspace(v_name)),
      v_name,
      nullif(btrim(v_item->>'notes'), ''),
      coalesce((v_item->>'active')::boolean, true),
      coalesce(nullif(v_item->>'sort_order', '')::integer, 0),
      nullif(btrim(v_item->>'catalogue_key'), ''),
      nullif(btrim(v_item->>'color'), ''),
      nullif(btrim(v_item->>'icon_key'), ''),
      nullif(v_item->>'instance_number', '')::integer,
      nullif(v_item->>'floor_level', '')::smallint,
      coalesce(v_item->'metadata', '{}'::jsonb)
    )
    on conflict (restaurant_id, id) do update set
      code = excluded.code, name = excluded.name, notes = excluded.notes,
      active = excluded.active, sort_order = excluded.sort_order,
      catalogue_key = excluded.catalogue_key,
      color = excluded.color,
      icon_key = excluded.icon_key,
      instance_number = excluded.instance_number,
      floor_level = excluded.floor_level,
      metadata = excluded.metadata, updated_at = now();
$new_area$;
begin
  select replace(
    pg_get_functiondef(
      'public.save_restaurant_model(uuid,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb)'::regprocedure
    ),
    chr(13),
    ''
  )
  into v_definition;

  v_next := replace(v_definition, v_old_area, v_new_area);
  if v_next = v_definition
      or position('floor_level = excluded.floor_level' in v_next) = 0 then
    raise exception 'Restaurant work-area floor contract drifted.';
  end if;
  execute v_next;
end
$work_area_floor_write_model$;

do $venue_floor_context$
declare
  v_definition text;
  v_next text;
  v_anchor text := $anchor$
  return v_result || jsonb_build_object('venue_saved', true);
$anchor$;
  v_sync text := $sync$
  update public.work_areas
  set floor_level = null,
      updated_at = now()
  where restaurant_id = p_restaurant_id
    and active;

  with room_input as (
    select value as room
    from jsonb_array_elements(coalesce(p_rooms, '[]'::jsonb))
    where coalesce((value->>'active')::boolean, true)
      and nullif(value->>'floor_id', '') is not null
      and nullif(value->>'work_area_id', '') is not null
  ),
  floor_input as (
    select value as floor
    from jsonb_array_elements(coalesce(p_floors, '[]'::jsonb))
    where coalesce((value->>'active')::boolean, true)
  )
  update public.work_areas area
  set floor_level = (floor_input.floor->>'level')::smallint,
      updated_at = now()
  from room_input
  join floor_input
    on floor_input.floor->>'id' = room_input.room->>'floor_id'
  where area.restaurant_id = p_restaurant_id
    and area.id = (room_input.room->>'work_area_id')::uuid;

  return v_result || jsonb_build_object('venue_saved', true);
$sync$;
begin
  select replace(
    pg_get_functiondef(
      'public.save_venue_model(uuid,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,integer)'::regprocedure
    ),
    chr(13),
    ''
  )
  into v_definition;
  v_next := replace(v_definition, v_anchor, v_sync);
  if v_next = v_definition
      or position('floor_level = (floor_input.floor->>''level'')::smallint' in v_next) = 0 then
    raise exception 'Venue floor-context contract drifted.';
  end if;
  execute v_next;
end
$venue_floor_context$;

notify pgrst, 'reload schema';

commit;
