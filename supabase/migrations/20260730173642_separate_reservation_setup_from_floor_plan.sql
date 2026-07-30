-- Reservation Settings owns booking rules and service exceptions. Floor-plan
-- rooms, tables and combinations are owned exclusively by the Floor plan
-- workspace. Keeping those writes separate prevents a service toggle from
-- replaying stale venue geometry or tripping floor integrity guards.

begin;

-- Repair layouts created before active-room parent validation was introduced.
insert into public.reservation_floors (
  restaurant_id,
  name,
  level,
  canvas_width,
  canvas_height,
  active,
  sort_order
)
select distinct
  room.restaurant_id,
  'Ground floor',
  0,
  1000,
  600,
  true,
  0
from public.reservation_rooms room
left join public.reservation_floors floor
  on floor.restaurant_id = room.restaurant_id
 and floor.id = room.floor_id
where room.active
  and (room.floor_id is null or floor.id is null)
on conflict (restaurant_id, level) do update
set active = true;

update public.reservation_floors floor
set active = true
where not floor.active
  and exists (
    select 1
    from public.reservation_rooms room
    where room.restaurant_id = floor.restaurant_id
      and room.floor_id = floor.id
      and room.active
  );

update public.reservation_rooms room
set floor_id = floor.id
from public.reservation_floors floor
where room.active
  and floor.restaurant_id = room.restaurant_id
  and floor.level = 0
  and (
    room.floor_id is null
    or not exists (
      select 1
      from public.reservation_floors current_floor
      where current_floor.restaurant_id = room.restaurant_id
        and current_floor.id = room.floor_id
    )
  );

update public.reservation_rooms room
set active = false
where room.active
  and not exists (
    select 1
    from public.work_areas area
    where area.restaurant_id = room.restaurant_id
      and area.id = room.work_area_id
      and area.active
  );

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
as $save_reservation_setup$
declare
  v_actor record;
  v_item jsonb;
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
      capacity_mode,
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
      coalesce(nullif(v_item->>'capacity_mode', ''), 'tables'),
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
      capacity_mode = excluded.capacity_mode,
      maximum_covers = excluded.maximum_covers,
      booking_cutoff_minutes = excluded.booking_cutoff_minutes,
      advance_booking_days = excluded.advance_booking_days;
  end loop;

  for v_item in
    select value from jsonb_array_elements(coalesce(p_exceptions, '[]'::jsonb))
  loop
    insert into public.reservation_service_exceptions (
      id,
      restaurant_id,
      service_key,
      business_date,
      availability,
      opens_at,
      closes_at,
      reason,
      created_by_profile_id
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
      updated_at = now()
  where restaurant_id = p_restaurant_id
  returning setup_revision into v_current_revision;

  return jsonb_build_object(
    'ok', true,
    'restaurant_id', p_restaurant_id,
    'revision', v_current_revision
  );
end
$save_reservation_setup$;

comment on function public.save_reservation_setup(
  uuid,
  jsonb,
  jsonb,
  jsonb,
  jsonb,
  jsonb,
  integer
) is
  'Saves reservation service rules and exceptions. Venue geometry is owned by save_reservation_floor_plans.';

commit;
