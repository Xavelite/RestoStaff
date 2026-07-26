-- Reservations must remain tenant-scoped, auditable and safe from table
-- double-booking. Fixture writes are always rolled back.
begin;

do $reservation_schema$
declare
  v_table text;
  v_rpc text;
begin
  foreach v_table in array array[
    'reservation_service_settings',
    'reservation_floors',
    'reservation_rooms',
    'reservation_tables',
    'reservation_table_combinations',
    'reservation_table_combination_members',
    'reservation_service_exceptions',
    'reservation_guests',
    'reservations',
    'reservation_table_assignments',
    'reservation_events'
  ]
  loop
    if not exists (
      select 1
      from pg_class relation
      join pg_namespace namespace on namespace.oid = relation.relnamespace
      where namespace.nspname = 'public'
        and relation.relname = v_table
        and relation.relrowsecurity
    ) then
      raise exception 'Reservation table % is missing RLS.', v_table;
    end if;
  end loop;

  foreach v_rpc in array array[
    'get_reservation_workspace(uuid,date)',
    'get_reservation_setup(uuid)',
    'get_reservation_floor_plans(uuid)',
    'save_reservation_setup(uuid,jsonb,jsonb,jsonb,jsonb,jsonb)',
    'save_reservation_floor_plans(uuid,jsonb,jsonb,jsonb,jsonb)',
    'check_reservation_availability(uuid,date,text,time without time zone,integer,uuid,uuid)',
    'save_reservation(uuid,jsonb)',
    'set_reservation_status(uuid,uuid,text,text)',
    'get_reservation_demand(uuid,date,date)'
  ]
  loop
    if has_function_privilege('anon', 'public.' || v_rpc, 'EXECUTE') then
      raise exception 'Anonymous role can execute reservation RPC %.', v_rpc;
    end if;
    if not has_function_privilege('authenticated', 'public.' || v_rpc, 'EXECUTE') then
      raise exception 'Authenticated role cannot execute reservation RPC %.', v_rpc;
    end if;
  end loop;

  if not exists (
    select 1
    from pg_trigger trigger
    join pg_class relation on relation.oid = trigger.tgrelid
    join pg_namespace namespace on namespace.oid = relation.relnamespace
    where namespace.nspname = 'public'
      and relation.relname = 'reservation_events'
      and trigger.tgname = 'reservation_events_immutable'
      and not trigger.tgisinternal
  ) then
    raise exception 'Reservation history is not append-only.';
  end if;
end
$reservation_schema$;

do $reservation_workflow$
declare
  v_auth_user_id uuid := gen_random_uuid();
  v_profile_id uuid;
  v_restaurant_id uuid := gen_random_uuid();
  v_area_id uuid := gen_random_uuid();
  v_floor_id uuid := gen_random_uuid();
  v_room_id uuid := gen_random_uuid();
  v_table_id uuid := gen_random_uuid();
  v_business_date date;
  v_weekday integer;
  v_result jsonb;
  v_reservation_id uuid;
  v_availability jsonb;
  v_event_id uuid;
  v_rejected boolean := false;
begin
  v_business_date := current_date + ((8 - extract(isodow from current_date)::integer) % 7) + 7;
  v_weekday := extract(isodow from v_business_date)::integer;

  insert into auth.users (id, email)
  values (v_auth_user_id, 'reservation-' || v_auth_user_id::text || '@example.test');
  insert into public.profiles (auth_user_id, first_name, last_name, email)
  values (
    v_auth_user_id,
    'Reservation',
    'Fixture',
    'reservation-' || v_auth_user_id::text || '@example.test'
  )
  returning id into v_profile_id;
  insert into public.restaurants (id, workspace_slug, name, owner_profile_id)
  values (
    v_restaurant_id,
    'reservation-' || replace(v_restaurant_id::text, '-', ''),
    'Reservation contract fixture',
    v_profile_id
  );
  insert into public.restaurant_settings (restaurant_id, timezone)
  values (v_restaurant_id, 'Europe/Brussels');
  insert into public.restaurant_memberships (restaurant_id, profile_id, role, status)
  values (v_restaurant_id, v_profile_id, 'owner', 'active');
  insert into public.services (restaurant_id, service_key, name, sort_order)
  values (v_restaurant_id, 'lunch', 'Lunch', 10);
  insert into public.opening_hours (
    restaurant_id, weekday, service_key, is_open, opens_at, closes_at
  )
  values (v_restaurant_id, v_weekday, 'lunch', true, '12:00', '15:00');
  insert into public.work_areas (id, restaurant_id, code, name, active)
  values (v_area_id, v_restaurant_id, 'hall', 'Hall', true);
  insert into public.reservation_floors (
    id, restaurant_id, name, level, canvas_width, canvas_height
  )
  values (v_floor_id, v_restaurant_id, 'Ground floor', 0, 1000, 600);
  insert into public.reservation_service_settings (
    restaurant_id, service_key, booking_enabled, automatic_confirmation,
    slot_interval_minutes, default_duration_minutes,
    minimum_party_size, maximum_party_size
  )
  values (v_restaurant_id, 'lunch', true, true, 15, 120, 1, 8);
  insert into public.reservation_rooms (
    id, restaurant_id, work_area_id, floor_id, active
  )
  values (v_room_id, v_restaurant_id, v_area_id, v_floor_id, true);
  insert into public.reservation_tables (
    id, restaurant_id, room_id, label, minimum_capacity, maximum_capacity
  )
  values (v_table_id, v_restaurant_id, v_room_id, '1', 1, 2);

  perform set_config(
    'request.jwt.claims',
    jsonb_build_object('sub', v_auth_user_id)::text,
    true
  );

  v_result := public.save_reservation(
    v_restaurant_id,
    jsonb_build_object(
      'guest_name', 'First guest',
      'guest_phone', '+32000000001',
      'guest_email', '',
      'business_date', v_business_date,
      'service_key', 'lunch',
      'local_time', '12:00',
      'party_size', 2,
      'room_preference_id', v_room_id,
      'source', 'phone',
      'guest_comment', '',
      'internal_notes', '',
      'language_code', 'fr'
    )
  );
  v_reservation_id := (v_result->>'reservation_id')::uuid;

  if v_result->>'status' <> 'confirmed'
    or not exists (
      select 1
      from public.reservation_table_assignments assignment
      where assignment.restaurant_id = v_restaurant_id
        and assignment.reservation_id = v_reservation_id
        and assignment.table_id = v_table_id
        and assignment.unassigned_at is null
    )
  then
    raise exception 'Automatic confirmation or smallest-table assignment failed.';
  end if;

  v_availability := public.check_reservation_availability(
    v_restaurant_id,
    v_business_date,
    'lunch',
    '12:00',
    2,
    v_room_id,
    null
  );
  if coalesce((v_availability->>'available')::boolean, true)
    or v_availability->>'code' <> 'no_table'
  then
    raise exception 'Overlapping booking was not rejected: %', v_availability;
  end if;

  if not exists (
    select 1
    from public.get_reservation_demand(
      v_restaurant_id,
      v_business_date,
      v_business_date
    ) demand
    where demand.business_date = v_business_date
      and demand.service_key = 'lunch'
      and demand.reservation_count = 1
      and demand.expected_covers = 2
  ) then
    raise exception 'Planning reservation demand aggregate is incorrect.';
  end if;

  select event.id
  into v_event_id
  from public.reservation_events event
  where event.restaurant_id = v_restaurant_id
    and event.reservation_id = v_reservation_id
    and event.event_type = 'created';
  if v_event_id is null then
    raise exception 'Reservation creation did not append an event.';
  end if;

  begin
    update public.reservation_events
    set details = jsonb_build_object('tampered', true)
    where id = v_event_id;
  exception
    when others then
      if position('immutable' in lower(sqlerrm)) > 0 then
        v_rejected := true;
      else
        raise;
      end if;
  end;
  if not v_rejected then
    raise exception 'Reservation event history can be rewritten.';
  end if;

  perform public.set_reservation_status(
    v_restaurant_id,
    v_reservation_id,
    'finished',
    'Contract release check'
  );
  v_availability := public.check_reservation_availability(
    v_restaurant_id,
    v_business_date,
    'lunch',
    '12:00',
    2,
    v_room_id,
    null
  );
  if coalesce((v_availability->>'available')::boolean, false) is not true then
    raise exception 'Finished reservation did not release its table: %', v_availability;
  end if;
end
$reservation_workflow$;

rollback;
