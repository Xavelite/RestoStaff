-- Reservations must remain tenant-scoped, auditable and safe from table
-- double-booking. Fixture writes are always rolled back.
begin;

do $reservation_schema$
declare
  v_table text;
  v_rpc text;
begin
  foreach v_table in array array[
    'reservation_configuration_revisions',
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
    'get_reservation_workspace_v2(uuid,date)',
    'get_reservation_setup_v2(uuid)',
    'get_reservation_floor_plans_v2(uuid)',
    'save_reservation_setup_v2(uuid,jsonb,jsonb,jsonb,jsonb,jsonb,integer)',
    'save_reservation_floor_plans_v2(uuid,jsonb,jsonb,jsonb,jsonb,integer)',
    'check_reservation_availability_v2(uuid,date,text,time without time zone,integer,uuid,uuid,uuid)',
    'save_reservation_v2(uuid,jsonb)',
    'set_reservation_status_v2(uuid,uuid,text,text,integer)',
    'get_reservation_demand_v2(uuid,date,date)'
  ]
  loop
    if has_function_privilege('anon', 'public.' || v_rpc, 'EXECUTE') then
      raise exception 'Anonymous role can execute reservation RPC %.', v_rpc;
    end if;
    if not has_function_privilege('authenticated', 'public.' || v_rpc, 'EXECUTE') then
      raise exception 'Authenticated role cannot execute reservation RPC %.', v_rpc;
    end if;
  end loop;

  v_rpc := 'save_venue_model_v2(uuid,bigint,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,integer)';
  if has_function_privilege('authenticated', 'public.' || v_rpc, 'EXECUTE') then
    raise exception 'Retired combined venue save remains browser-exposed.';
  end if;
  if not has_function_privilege('service_role', 'public.' || v_rpc, 'EXECUTE') then
    raise exception 'Retired combined venue save is unavailable to trusted maintenance.';
  end if;

  foreach v_rpc in array array[
    'get_reservation_workspace(uuid,date)',
    'get_reservation_setup(uuid)',
    'get_reservation_floor_plans(uuid)',
    'save_reservation_setup(uuid,jsonb,jsonb,jsonb,jsonb,jsonb,integer)',
    'save_reservation_floor_plans(uuid,jsonb,jsonb,jsonb,jsonb,integer)',
    'check_reservation_availability(uuid,date,text,time without time zone,integer,uuid,uuid,uuid)',
    'save_reservation(uuid,jsonb)',
    'set_reservation_status(uuid,uuid,text,text,integer)',
    'save_venue_model(uuid,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,integer)',
    'get_reservation_demand(uuid,date,date)'
  ]
  loop
    if has_function_privilege('authenticated', 'public.' || v_rpc, 'EXECUTE') then
      raise exception 'Legacy reservation RPC remains browser-exposed: %.', v_rpc;
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

  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'work_areas'
      and column_name = 'instance_number'
      and is_nullable = 'NO'
  ) then
    raise exception 'Work areas do not expose a stable instance number.';
  end if;

  if not exists (
    select 1
    from pg_indexes
    where schemaname = 'public'
      and tablename = 'work_areas'
      and indexname = 'work_areas_restaurant_type_instance_idx'
  ) then
    raise exception 'Work-area type instances are not uniquely indexed.';
  end if;

  if has_function_privilege(
    'authenticated',
    'public.assign_work_area_instance_number()',
    'EXECUTE'
  ) then
    raise exception 'Area instance trigger helper is directly executable.';
  end if;

  if has_function_privilege(
    'authenticated',
    'public.reservation_area_instance_label(uuid,uuid,uuid)',
    'EXECUTE'
  ) then
    raise exception 'Reservation area-label helper is directly executable.';
  end if;

  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'reservations'
      and column_name = 'preferred_table_id'
      and is_nullable = 'YES'
  ) then
    raise exception 'Reservations do not preserve an optional exact table preference.';
  end if;

  if has_function_privilege(
    'authenticated',
    'public.reservation_exact_table_candidate(uuid,timestamptz,timestamptz,integer,uuid,uuid,uuid)',
    'EXECUTE'
  ) or has_function_privilege(
    'authenticated',
    'public.resolve_operator_reservation_guest(uuid,uuid,text,text)',
    'EXECUTE'
  ) then
    raise exception 'Reservation integrity helpers are directly executable.';
  end if;
end
$reservation_schema$;

do $reservation_workflow$
declare
  v_auth_user_id uuid := gen_random_uuid();
  v_profile_id uuid;
  v_restaurant_id uuid := gen_random_uuid();
  v_area_id uuid := gen_random_uuid();
  v_area_two_id uuid := gen_random_uuid();
  v_floor_id uuid := gen_random_uuid();
  v_room_id uuid := gen_random_uuid();
  v_room_two_id uuid := gen_random_uuid();
  v_table_id uuid := gen_random_uuid();
  v_table_two_id uuid := gen_random_uuid();
  v_table_other_room_id uuid := gen_random_uuid();
  v_combination_id uuid := gen_random_uuid();
  v_business_date date;
  v_weekday integer;
  v_result jsonb;
  v_reservation_id uuid;
  v_exact_reservation_id uuid;
  v_guest_one_id uuid := gen_random_uuid();
  v_guest_two_id uuid := gen_random_uuid();
  v_availability jsonb;
  v_event_id uuid;
  v_revision integer;
  v_assignment_count integer;
  v_assignment_group_count integer;
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
  insert into public.work_areas (
    id, restaurant_id, code, name, active, catalogue_key, instance_number,
    floor_level
  )
  values
    (v_area_id, v_restaurant_id, 'bar-a', 'Bar', true, 'bar', 1, 0),
    (v_area_two_id, v_restaurant_id, 'bar-b', 'Bar', true, 'bar', 2, 0);
  insert into public.reservation_floors (
    id, restaurant_id, name, level, canvas_width, canvas_height
  )
  values (v_floor_id, v_restaurant_id, 'Ground floor', 0, 1000, 600);
  insert into public.reservation_service_settings (
    restaurant_id, service_key, booking_enabled, automatic_confirmation,
    slot_interval_minutes, default_duration_minutes,
    minimum_party_size, maximum_party_size
  )
  values (v_restaurant_id, 'lunch', true, true, 15, 120, 1, 8)
  on conflict (restaurant_id, service_key) do update set
    booking_enabled = excluded.booking_enabled,
    automatic_confirmation = excluded.automatic_confirmation,
    slot_interval_minutes = excluded.slot_interval_minutes,
    default_duration_minutes = excluded.default_duration_minutes,
    minimum_party_size = excluded.minimum_party_size,
    maximum_party_size = excluded.maximum_party_size;
  insert into public.reservation_rooms (
    id, restaurant_id, work_area_id, floor_id, active
  )
  values
    (v_room_id, v_restaurant_id, v_area_id, v_floor_id, true),
    (v_room_two_id, v_restaurant_id, v_area_two_id, v_floor_id, true);
  insert into public.reservation_tables (
    id, restaurant_id, room_id, label, minimum_capacity, maximum_capacity
  )
  values
    (v_table_id, v_restaurant_id, v_room_id, '1', 1, 2),
    (v_table_two_id, v_restaurant_id, v_room_id, '2', 1, 2),
    (v_table_other_room_id, v_restaurant_id, v_room_two_id, 'T1', 1, 2);
  insert into public.reservation_table_combinations (
    id, restaurant_id, room_id, name, minimum_capacity, maximum_capacity
  )
  values (v_combination_id, v_restaurant_id, v_room_id, '1 + 2', 3, 4);
  insert into public.reservation_table_combination_members (
    restaurant_id, combination_id, table_id, sort_order
  )
  values
    (v_restaurant_id, v_combination_id, v_table_id, 0),
    (v_restaurant_id, v_combination_id, v_table_two_id, 1);

  begin
    insert into public.reservation_table_combination_members (
      restaurant_id, combination_id, table_id, sort_order
    ) values (v_restaurant_id, v_combination_id, v_table_other_room_id, 2);
  exception
    when others then
      if position('combination room' in lower(sqlerrm)) > 0 then
        v_rejected := true;
      else
        raise;
      end if;
  end;
  if not v_rejected then
    raise exception 'A cross-room table was accepted into a combination.';
  end if;
  v_rejected := false;

  perform set_config(
    'request.jwt.claims',
    jsonb_build_object('sub', v_auth_user_id)::text,
    true
  );

  v_result := public.get_reservation_workspace(
    v_restaurant_id,
    v_business_date
  );
  if not exists (
    select 1
    from jsonb_array_elements(v_result->'rooms') room
    where room->>'name' = 'Bar (0.A)'
  ) or not exists (
    select 1
    from jsonb_array_elements(v_result->'rooms') room
    where room->>'name' = 'Bar (0.B)'
  ) then
    raise exception 'Reservation workspace did not label duplicate physical areas: %',
      v_result->'rooms';
  end if;

  v_result := public.get_reservation_setup(v_restaurant_id);
  if not exists (
    select 1
    from jsonb_array_elements(v_result->'rooms') room
    where room->>'name' = 'Bar (0.A)'
  ) or not exists (
    select 1
    from jsonb_array_elements(v_result->'rooms') room
    where room->>'name' = 'Bar (0.B)'
  ) then
    raise exception 'Reservation setup did not label duplicate physical areas: %',
      v_result->'rooms';
  end if;

  v_result := public.save_reservation(
    v_restaurant_id,
    jsonb_build_object(
      'guest_name', 'First guest',
      'guest_phone', '+32000000001',
      'guest_email', '',
      'business_date', v_business_date,
      'service_key', 'lunch',
      'local_time', '12:00',
      'party_size', 4,
      'room_preference_id', v_room_id,
      'source', 'phone',
      'guest_comment', '',
      'internal_notes', '',
      'language_code', 'fr'
    )
  );
  v_reservation_id := (v_result->>'reservation_id')::uuid;

  select count(*), count(distinct assignment.assignment_group_id)
  into v_assignment_count, v_assignment_group_count
  from public.reservation_table_assignments assignment
  where assignment.restaurant_id = v_restaurant_id
    and assignment.reservation_id = v_reservation_id
    and assignment.unassigned_at is null;

  if v_result->>'status' <> 'confirmed'
    or v_assignment_count <> 2
    or v_assignment_group_count <> 1
  then
    raise exception 'Automatic confirmation or grouped combination assignment failed.';
  end if;

  select reservation.revision
  into v_revision
  from public.reservations reservation
  where reservation.restaurant_id = v_restaurant_id
    and reservation.id = v_reservation_id;

  begin
    perform public.save_reservation(
      v_restaurant_id,
      jsonb_build_object(
        'id', v_reservation_id,
        'expected_revision', 0,
        'guest_name', 'First guest',
        'guest_phone', '+32000000001',
        'guest_email', '',
        'business_date', v_business_date,
        'service_key', 'lunch',
        'local_time', '12:00',
        'party_size', 4,
        'room_preference_id', v_room_id,
        'source', 'phone',
        'guest_comment', '',
        'internal_notes', '',
        'language_code', 'fr'
      )
    );
  exception
    when others then
      if position('conflict:' in lower(sqlerrm)) > 0 then
        v_rejected := true;
      else
        raise;
      end if;
  end;
  if not v_rejected then
    raise exception 'A stale reservation revision was accepted.';
  end if;
  v_rejected := false;

  v_availability := public.check_reservation_availability(
    v_restaurant_id,
    v_business_date,
    'lunch',
    '12:00',
    4,
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
      and demand.expected_covers = 4
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
    'seated',
    'Contract transition check',
    v_revision
  );
  select reservation.revision
  into v_revision
  from public.reservations reservation
  where reservation.restaurant_id = v_restaurant_id
    and reservation.id = v_reservation_id;

  begin
    perform public.set_reservation_status(
      v_restaurant_id,
      v_reservation_id,
      'confirmed',
      'Invalid backwards transition',
      v_revision
    );
  exception
    when others then
      if position('cannot move' in lower(sqlerrm)) > 0 then
        v_rejected := true;
      else
        raise;
      end if;
  end;
  if not v_rejected then
    raise exception 'A backwards reservation status transition was accepted.';
  end if;
  v_rejected := false;

  perform public.set_reservation_status(
    v_restaurant_id,
    v_reservation_id,
    'finished',
    'Contract release check',
    v_revision
  );
  select reservation.revision
  into v_revision
  from public.reservations reservation
  where reservation.restaurant_id = v_restaurant_id
    and reservation.id = v_reservation_id;

  begin
    perform public.save_reservation(
      v_restaurant_id,
      jsonb_build_object(
        'id', v_reservation_id,
        'expected_revision', v_revision,
        'guest_name', 'First guest',
        'guest_phone', '+32000000001',
        'guest_email', '',
        'business_date', v_business_date,
        'service_key', 'lunch',
        'local_time', '12:00',
        'party_size', 4,
        'room_preference_id', v_room_id,
        'source', 'phone',
        'guest_comment', '',
        'internal_notes', '',
        'language_code', 'fr'
      )
    );
  exception
    when others then
      if position('cannot be edited' in lower(sqlerrm)) > 0 then
        v_rejected := true;
      else
        raise;
      end if;
  end;
  if not v_rejected then
    raise exception 'A terminal reservation was editable.';
  end if;
  v_rejected := false;
  v_availability := public.check_reservation_availability(
    v_restaurant_id,
    v_business_date,
    'lunch',
    '12:00',
    4,
    v_room_id,
    null
  );
  if coalesce((v_availability->>'available')::boolean, false) is not true then
    raise exception 'Finished reservation did not release its table: %', v_availability;
  end if;

  v_availability := public.check_reservation_availability(
    v_restaurant_id,
    v_business_date,
    'lunch',
    '12:00',
    2,
    v_room_id,
    null,
    v_table_two_id
  );
  if coalesce((v_availability->>'available')::boolean, false) is not true
    or v_availability->'assignment'->>'kind' <> 'preferred_table'
    or v_availability->'assignment'->'table_ids'
      <> jsonb_build_array(v_table_two_id)
  then
    raise exception 'Exact-table availability was not preserved: %', v_availability;
  end if;

  v_result := public.save_reservation(
    v_restaurant_id,
    jsonb_build_object(
      'guest_name', 'Exact table guest',
      'guest_phone', '+32000000002',
      'guest_email', 'exact-table@example.test',
      'business_date', v_business_date,
      'service_key', 'lunch',
      'local_time', '12:00',
      'party_size', 2,
      'room_preference_id', v_room_id,
      'preferred_table_id', v_table_two_id,
      'source', 'phone',
      'guest_comment', '',
      'internal_notes', '',
      'language_code', 'fr'
    )
  );
  v_exact_reservation_id := (v_result->>'reservation_id')::uuid;

  if not exists (
    select 1
    from public.reservations reservation
    join public.reservation_table_assignments assignment
      on assignment.restaurant_id = reservation.restaurant_id
     and assignment.reservation_id = reservation.id
     and assignment.unassigned_at is null
    where reservation.restaurant_id = v_restaurant_id
      and reservation.id = v_exact_reservation_id
      and reservation.preferred_table_id = v_table_two_id
      and assignment.table_id = v_table_two_id
  ) then
    raise exception 'Exact table preference was not persisted and assigned.';
  end if;

  v_result := public.get_reservation_workspace(
    v_restaurant_id,
    v_business_date
  );
  if not exists (
    select 1
    from jsonb_array_elements(v_result->'reservations') reservation
    where (reservation->>'id')::uuid = v_exact_reservation_id
      and (reservation->>'preferred_table_id')::uuid = v_table_two_id
  ) then
    raise exception
      'Authenticated reservation workspace lost the exact table preference.';
  end if;

  v_availability := public.check_reservation_availability(
    v_restaurant_id,
    v_business_date,
    'lunch',
    '12:00',
    2,
    v_room_id,
    null,
    v_table_two_id
  );
  if coalesce((v_availability->>'available')::boolean, true)
    or v_availability->>'code' <> 'preferred_table_unavailable'
  then
    raise exception 'An occupied exact table was offered again: %', v_availability;
  end if;

  insert into public.reservation_guests (
    id,
    restaurant_id,
    display_name,
    email,
    normalized_email,
    phone,
    normalized_phone
  )
  values
    (
      v_guest_one_id,
      v_restaurant_id,
      'Email owner',
      'email-owner@example.test',
      'email-owner@example.test',
      '+32000000011',
      '+32000000011'
    ),
    (
      v_guest_two_id,
      v_restaurant_id,
      'Phone owner',
      'phone-owner@example.test',
      'phone-owner@example.test',
      '+32000000012',
      '+32000000012'
    );

  begin
    perform public.save_reservation(
      v_restaurant_id,
      jsonb_build_object(
        'guest_name', 'Collision attempt',
        'guest_phone', '+32000000012',
        'guest_email', 'email-owner@example.test',
        'business_date', v_business_date,
        'service_key', 'lunch',
        'local_time', '12:00',
        'party_size', 1,
        'room_preference_id', v_room_id,
        'preferred_table_id', v_table_id,
        'source', 'phone',
        'guest_comment', '',
        'internal_notes', '',
        'language_code', 'fr'
      )
    );
  exception
    when others then
      if position('contact collision' in lower(sqlerrm)) > 0 then
        v_rejected := true;
      else
        raise;
      end if;
  end;
  if not v_rejected then
    raise exception 'Conflicting guest contact details were auto-merged.';
  end if;
  v_rejected := false;

  if not exists (
    select 1
    from public.reservation_guests guest
    where guest.restaurant_id = v_restaurant_id
      and guest.id = v_guest_one_id
      and guest.display_name = 'Email owner'
      and guest.normalized_phone = '+32000000011'
  ) or not exists (
    select 1
    from public.reservation_guests guest
    where guest.restaurant_id = v_restaurant_id
      and guest.id = v_guest_two_id
      and guest.display_name = 'Phone owner'
      and guest.normalized_email = 'phone-owner@example.test'
  ) then
    raise exception 'A contact collision overwrote the wrong guest.';
  end if;

  update public.opening_hours
  set opens_at = '18:00', closes_at = '02:00'
  where restaurant_id = v_restaurant_id
    and weekday = v_weekday
    and service_key = 'lunch';
  update public.reservation_service_settings
  set default_duration_minutes = 60, turn_time_minutes = 0
  where restaurant_id = v_restaurant_id
    and service_key = 'lunch';

  v_availability := public.check_reservation_availability(
    v_restaurant_id,
    v_business_date,
    'lunch',
    '00:30',
    4,
    v_room_id,
    null
  );
  if coalesce((v_availability->>'available')::boolean, false) is not true then
    raise exception 'Overnight service booking was rejected: %', v_availability;
  end if;

  update public.work_areas
  set active = false
  where restaurant_id = v_restaurant_id
    and id = v_area_id;
  if exists (
    select 1
    from public.reservation_rooms
    where restaurant_id = v_restaurant_id
      and work_area_id = v_area_id
      and active
  ) or exists (
    select 1
    from public.reservation_tables
    where restaurant_id = v_restaurant_id
      and room_id = v_room_id
      and active
  ) or exists (
    select 1
    from public.reservation_table_combinations
    where restaurant_id = v_restaurant_id
      and room_id = v_room_id
      and active
  ) then
    raise exception 'Archiving an area did not retire its reservation layout.';
  end if;

  begin
    update public.reservation_rooms
    set active = true
    where restaurant_id = v_restaurant_id
      and id = v_room_id;
  exception
    when others then
      if position('reservation_room_area_inactive' in lower(sqlerrm)) > 0 then
        v_rejected := true;
      else
        raise;
      end if;
  end;
  if not v_rejected then
    raise exception 'An active room was accepted for an archived area.';
  end if;
  v_rejected := false;

  update public.reservation_rooms
  set active = false
  where restaurant_id = v_restaurant_id
    and id = v_room_two_id;
  if exists (
    select 1
    from public.reservation_tables
    where restaurant_id = v_restaurant_id
      and room_id = v_room_two_id
      and active
  ) then
    raise exception 'Archiving a room did not retire its active tables.';
  end if;
  update public.reservation_rooms
  set active = true
  where restaurant_id = v_restaurant_id
    and id = v_room_two_id;
  update public.reservation_tables
  set active = true
  where restaurant_id = v_restaurant_id
    and id = v_table_other_room_id;

  update public.reservation_floors
  set active = false
  where restaurant_id = v_restaurant_id
    and id = v_floor_id;
  if exists (
    select 1
    from public.reservation_rooms
    where restaurant_id = v_restaurant_id
      and floor_id = v_floor_id
      and active
  ) or exists (
    select 1
    from public.reservation_tables
    where restaurant_id = v_restaurant_id
      and room_id = v_room_two_id
      and active
  ) then
    raise exception 'Archiving a floor did not retire its reservation layout.';
  end if;
end
$reservation_workflow$;

rollback;
