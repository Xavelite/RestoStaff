-- Reservation tables belong only in guest-facing, reservable areas.
--
-- The application catalogue writes this capability into area metadata so the
-- database can enforce it without duplicating presentation vocabulary in the
-- booking engine. Existing custom areas remain reservable by default.
begin;

with area_contract(catalogue_key, reservable) as (
  values
    ('dining_room', true),
    ('bar', true),
    ('terrace', true),
    ('reception', false),
    ('private_room', true),
    ('counter', true),
    ('lounge', true),
    ('event_space', true),
    ('takeaway', false),
    ('drive_through', false),
    ('kitchen', false),
    ('hot_kitchen', false),
    ('cold_kitchen', false),
    ('prep_kitchen', false),
    ('pastry', false),
    ('bakery', false),
    ('dishwashing', false),
    ('cellar', false),
    ('storage', false),
    ('receiving', false),
    ('delivery', false),
    ('office', false),
    ('staff_room', false),
    ('cloakroom', false),
    ('outdoor', false)
)
update public.work_areas as area
set metadata = jsonb_set(
  coalesce(area.metadata, '{}'::jsonb),
  '{reservable}',
  to_jsonb(contract.reservable),
  true
)
from area_contract as contract
where area.catalogue_key = contract.catalogue_key;

update public.reservation_tables as reservation_table
set
  active = false,
  blocked = true,
  updated_at = now()
from public.reservation_rooms as room
join public.work_areas as area
  on area.restaurant_id = room.restaurant_id
 and area.id = room.work_area_id
where reservation_table.restaurant_id = room.restaurant_id
  and reservation_table.room_id = room.id
  and reservation_table.active
  and coalesce(area.metadata->'reservable', 'true'::jsonb) = 'false'::jsonb;

update public.reservation_table_combinations as combination
set
  active = false,
  updated_at = now()
where combination.active
  and exists (
    select 1
    from public.reservation_table_combination_members as member
    join public.reservation_tables as reservation_table
      on reservation_table.restaurant_id = member.restaurant_id
     and reservation_table.id = member.table_id
    where member.restaurant_id = combination.restaurant_id
      and member.combination_id = combination.id
      and not reservation_table.active
  );

create or replace function public.guard_reservation_table_area()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
declare
  v_reservable boolean;
begin
  if not new.active then
    return new;
  end if;

  select coalesce((area.metadata->>'reservable')::boolean, true)
  into v_reservable
  from public.reservation_rooms as room
  join public.work_areas as area
    on area.restaurant_id = room.restaurant_id
   and area.id = room.work_area_id
  where room.restaurant_id = new.restaurant_id
    and room.id = new.room_id;

  if v_reservable is false then
    raise exception 'Reservation tables require a reservable guest area.'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

revoke all on function public.guard_reservation_table_area() from public;
revoke all on function public.guard_reservation_table_area() from anon, authenticated;

drop trigger if exists reservation_tables_guard_area
  on public.reservation_tables;
create trigger reservation_tables_guard_area
before insert or update of restaurant_id, room_id, active
on public.reservation_tables
for each row
execute function public.guard_reservation_table_area();

commit;
