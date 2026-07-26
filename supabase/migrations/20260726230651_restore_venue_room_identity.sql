-- A work area has one stable reservation-room identity, even when the area or
-- room was previously archived. The venue editor must revive that identity
-- instead of fabricating a second room and colliding with the semantic unique
-- key (restaurant_id, work_area_id).

begin;

do $restore_room_read_identity$
declare
  v_definition text;
  v_next text;
  v_old_filter text := $old_filter$
      where room.restaurant_id = p_restaurant_id
        and room.active
$old_filter$;
  v_new_filter text := $new_filter$
      where room.restaurant_id = p_restaurant_id
        and area.active
$new_filter$;
begin
  select replace(
    pg_get_functiondef('public.get_reservation_floor_plans(uuid)'::regprocedure),
    chr(13),
    ''
  )
  into v_definition;

  v_next := replace(v_definition, v_old_filter, v_new_filter);
  if v_next = v_definition then
    raise exception 'Reservation floor-plan room visibility contract drifted.';
  end if;

  execute v_next;
end
$restore_room_read_identity$;

do $restore_room_write_identity$
declare
  v_definition text;
  v_next text;
  v_old_conflict text := $old_conflict$
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
$old_conflict$;
  v_new_conflict text := $new_conflict$
    on conflict (restaurant_id, work_area_id) do update set
      floor_id = excluded.floor_id,
      position_x = excluded.position_x,
      position_y = excluded.position_y,
      width = excluded.width,
      height = excluded.height,
      active = excluded.active,
      sort_order = excluded.sort_order;
$new_conflict$;
begin
  select replace(
    pg_get_functiondef(
      'public.save_reservation_floor_plans(uuid,jsonb,jsonb,jsonb,jsonb,integer)'::regprocedure
    ),
    chr(13),
    ''
  )
  into v_definition;

  v_next := replace(v_definition, v_old_conflict, v_new_conflict);
  if v_next = v_definition then
    raise exception 'Reservation floor-plan room upsert contract drifted.';
  end if;

  execute v_next;
end
$restore_room_write_identity$;

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
