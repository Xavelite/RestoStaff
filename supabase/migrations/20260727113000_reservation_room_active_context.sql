-- Keep every active reservation room attached to an active restaurant area
-- and floor. Archiving either parent retires its booking layout atomically.

begin;

create or replace function public.validate_reservation_room_active_context()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if not new.active then
    return new;
  end if;

  if not exists (
    select 1
    from public.work_areas area
    where area.restaurant_id = new.restaurant_id
      and area.id = new.work_area_id
      and area.active
  ) then
    raise exception 'RESERVATION_ROOM_AREA_INACTIVE: An active reservation room requires an active area.';
  end if;

  if new.floor_id is null or not exists (
    select 1
    from public.reservation_floors floor
    where floor.restaurant_id = new.restaurant_id
      and floor.id = new.floor_id
      and floor.active
  ) then
    raise exception 'RESERVATION_ROOM_FLOOR_INACTIVE: An active reservation room requires an active floor.';
  end if;

  return new;
end
$$;

drop trigger if exists reservation_rooms_active_context
  on public.reservation_rooms;
create trigger reservation_rooms_active_context
  before insert or update of restaurant_id, work_area_id, floor_id, active
  on public.reservation_rooms
  for each row execute function public.validate_reservation_room_active_context();

create or replace function public.archive_reservation_layout_for_area()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  update public.reservation_table_combinations combination
  set active = false
  where combination.restaurant_id = new.restaurant_id
    and combination.room_id in (
      select room.id
      from public.reservation_rooms room
      where room.restaurant_id = new.restaurant_id
        and room.work_area_id = new.id
    );

  update public.reservation_tables table_row
  set active = false
  where table_row.restaurant_id = new.restaurant_id
    and table_row.room_id in (
      select room.id
      from public.reservation_rooms room
      where room.restaurant_id = new.restaurant_id
        and room.work_area_id = new.id
    );

  update public.reservation_rooms room
  set active = false
  where room.restaurant_id = new.restaurant_id
    and room.work_area_id = new.id;

  return new;
end
$$;

drop trigger if exists work_areas_archive_reservation_layout
  on public.work_areas;
create trigger work_areas_archive_reservation_layout
  after update of active on public.work_areas
  for each row
  when (old.active and not new.active)
  execute function public.archive_reservation_layout_for_area();

create or replace function public.archive_reservation_layout_for_floor()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  update public.reservation_table_combinations combination
  set active = false
  where combination.restaurant_id = new.restaurant_id
    and combination.room_id in (
      select room.id
      from public.reservation_rooms room
      where room.restaurant_id = new.restaurant_id
        and room.floor_id = new.id
    );

  update public.reservation_tables table_row
  set active = false
  where table_row.restaurant_id = new.restaurant_id
    and table_row.room_id in (
      select room.id
      from public.reservation_rooms room
      where room.restaurant_id = new.restaurant_id
        and room.floor_id = new.id
    );

  update public.reservation_rooms room
  set active = false
  where room.restaurant_id = new.restaurant_id
    and room.floor_id = new.id;

  return new;
end
$$;

drop trigger if exists reservation_floors_archive_layout
  on public.reservation_floors;
create trigger reservation_floors_archive_layout
  after update of active on public.reservation_floors
  for each row
  when (old.active and not new.active)
  execute function public.archive_reservation_layout_for_floor();

revoke all on function public.validate_reservation_room_active_context()
  from public, anon, authenticated, service_role;
revoke all on function public.archive_reservation_layout_for_area()
  from public, anon, authenticated, service_role;
revoke all on function public.archive_reservation_layout_for_floor()
  from public, anon, authenticated, service_role;

commit;
