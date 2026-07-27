-- Reconcile legacy layout rows once, then ensure archiving a room always
-- retires its tables and table combinations as the same operation.

begin;

update public.reservation_rooms room
set active = false
where room.active
  and (
    not exists (
      select 1
      from public.work_areas area
      where area.restaurant_id = room.restaurant_id
        and area.id = room.work_area_id
        and area.active
    )
    or not exists (
      select 1
      from public.reservation_floors floor
      where floor.restaurant_id = room.restaurant_id
        and floor.id = room.floor_id
        and floor.active
    )
  );

update public.reservation_table_combinations combination
set active = false
where combination.active
  and not exists (
    select 1
    from public.reservation_rooms room
    where room.restaurant_id = combination.restaurant_id
      and room.id = combination.room_id
      and room.active
  );

update public.reservation_tables table_row
set active = false
where table_row.active
  and not exists (
    select 1
    from public.reservation_rooms room
    where room.restaurant_id = table_row.restaurant_id
      and room.id = table_row.room_id
      and room.active
  );

create or replace function public.archive_reservation_layout_for_room()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  update public.reservation_table_combinations combination
  set active = false
  where combination.restaurant_id = new.restaurant_id
    and combination.room_id = new.id;

  update public.reservation_tables table_row
  set active = false
  where table_row.restaurant_id = new.restaurant_id
    and table_row.room_id = new.id;

  return new;
end
$$;

drop trigger if exists reservation_rooms_archive_layout
  on public.reservation_rooms;
create trigger reservation_rooms_archive_layout
  after update of active on public.reservation_rooms
  for each row
  when (old.active and not new.active)
  execute function public.archive_reservation_layout_for_room();

revoke all on function public.archive_reservation_layout_for_room()
  from public, anon, authenticated, service_role;

commit;
