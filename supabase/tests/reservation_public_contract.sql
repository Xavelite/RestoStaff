-- Public website bookings must remain an RPC-only, capacity-safe boundary.
-- Fixture writes are always rolled back.
begin;

do $public_booking_schema$
declare
  v_table text;
  v_manager_rpc text;
  v_service_rpc text;
begin
  foreach v_table in array array[
    'reservation_public_channels',
    'reservation_public_holds',
    'reservation_public_hold_tables',
    'reservation_public_idempotency',
    'reservation_public_rate_limits'
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
      raise exception 'Public-booking table % is missing RLS.', v_table;
    end if;
    if has_table_privilege('anon', 'public.' || v_table, 'SELECT')
      or has_table_privilege('authenticated', 'public.' || v_table, 'SELECT')
      or has_table_privilege('anon', 'public.' || v_table, 'INSERT')
      or has_table_privilege('authenticated', 'public.' || v_table, 'INSERT')
    then
      raise exception 'Public-booking table % is directly exposed.', v_table;
    end if;
  end loop;

  foreach v_manager_rpc in array array[
    'get_reservation_public_channel(uuid)',
    'ensure_reservation_public_channel(uuid,text)',
    'save_reservation_public_channel(uuid,boolean,text[])',
    'rotate_reservation_public_channel(uuid)'
  ]
  loop
    if has_function_privilege('anon', 'public.' || v_manager_rpc, 'EXECUTE')
      or not has_function_privilege('authenticated', 'public.' || v_manager_rpc, 'EXECUTE')
    then
      raise exception 'Manager public-channel RPC grant is invalid: %.', v_manager_rpc;
    end if;
  end loop;

  foreach v_service_rpc in array array[
    'consume_reservation_public_rate_limit(text,text,text,text,integer,integer)',
    'reservation_public_context(text,text)',
    'reservation_public_search_availability(text,text,date,text,integer,uuid)',
    'reservation_public_create_hold(text,text,text,jsonb)',
    'reservation_public_release_hold(text,text,text)',
    'reservation_public_confirm(text,text,text,text,jsonb)'
  ]
  loop
    if has_function_privilege('anon', 'public.' || v_service_rpc, 'EXECUTE')
      or has_function_privilege('authenticated', 'public.' || v_service_rpc, 'EXECUTE')
      or not has_function_privilege('service_role', 'public.' || v_service_rpc, 'EXECUTE')
    then
      raise exception 'Service-only public booking RPC grant is invalid: %.', v_service_rpc;
    end if;
  end loop;

  if not exists (
    select 1
    from pg_constraint constraint_row
    where constraint_row.conrelid = 'public.reservation_table_assignments'::regclass
      and constraint_row.conname = 'reservation_table_assignments_no_overlap'
      and constraint_row.contype = 'x'
  ) then
    raise exception 'Physical table assignment exclusion constraint is missing.';
  end if;
end
$public_booking_schema$;

do $public_booking_workflow$
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
  v_table_three_id uuid := gen_random_uuid();
  v_trusted_guest_id uuid := gen_random_uuid();
  v_business_date date;
  v_weekday integer;
  v_channel jsonb;
  v_public_key text;
  v_context jsonb;
  v_search jsonb;
  v_local_time text;
  v_request jsonb;
  v_hold jsonb;
  v_hold_replay jsonb;
  v_confirmation jsonb;
  v_confirmation_replay jsonb;
  v_rejected boolean := false;
begin
  v_business_date :=
    current_date + ((8 - extract(isodow from current_date)::integer) % 7) + 7;
  v_weekday := extract(isodow from v_business_date)::integer;

  insert into auth.users (id, email)
  values (v_auth_user_id, 'public-booking-' || v_auth_user_id::text || '@example.test');
  insert into public.profiles (auth_user_id, first_name, last_name, email)
  values (
    v_auth_user_id,
    'Public booking',
    'Fixture',
    'public-booking-' || v_auth_user_id::text || '@example.test'
  )
  returning id into v_profile_id;
  insert into public.restaurants (id, workspace_slug, name, owner_profile_id)
  values (
    v_restaurant_id,
    'public-booking-' || replace(v_restaurant_id::text, '-', ''),
    'Public booking fixture',
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
  values
    (v_area_id, v_restaurant_id, 'dining-room-a', 'Dining room', true),
    (v_area_two_id, v_restaurant_id, 'dining-room-b', 'Dining room', true);
  insert into public.reservation_floors (
    id, restaurant_id, name, level, canvas_width, canvas_height
  )
  values (v_floor_id, v_restaurant_id, 'Ground floor', 0, 1000, 600);
  insert into public.reservation_service_settings (
    restaurant_id,
    service_key,
    booking_enabled,
    automatic_confirmation,
    slot_interval_minutes,
    default_duration_minutes,
    minimum_party_size,
    maximum_party_size,
    maximum_covers
  )
  values (v_restaurant_id, 'lunch', true, true, 15, 90, 1, 4, 4)
  on conflict (restaurant_id, service_key) do update set
    booking_enabled = excluded.booking_enabled,
    automatic_confirmation = excluded.automatic_confirmation,
    slot_interval_minutes = excluded.slot_interval_minutes,
    default_duration_minutes = excluded.default_duration_minutes,
    minimum_party_size = excluded.minimum_party_size,
    maximum_party_size = excluded.maximum_party_size,
    maximum_covers = excluded.maximum_covers;
  insert into public.reservation_rooms (
    id, restaurant_id, work_area_id, floor_id, active
  )
  values (v_room_id, v_restaurant_id, v_area_id, v_floor_id, true);
  insert into public.reservation_rooms (
    id, restaurant_id, work_area_id, floor_id, active
  )
  values (v_room_two_id, v_restaurant_id, v_area_two_id, v_floor_id, true);
  insert into public.reservation_tables (
    id, restaurant_id, room_id, label, minimum_capacity, maximum_capacity
  )
  values
    (v_table_id, v_restaurant_id, v_room_id, '1', 1, 4),
    (v_table_two_id, v_restaurant_id, v_room_id, '2', 1, 4),
    (v_table_three_id, v_restaurant_id, v_room_two_id, '3', 1, 4);
  insert into public.reservation_guests (
    id,
    restaurant_id,
    display_name,
    email,
    normalized_email,
    phone,
    normalized_phone,
    language_code
  )
  values (
    v_trusted_guest_id,
    v_restaurant_id,
    'Trusted guest',
    'Trusted.Guest@Example.Test',
    'trusted.guest@example.test',
    '+32 2 555 00 00',
    '+3225550000',
    'fr'
  );

  perform set_config(
    'request.jwt.claims',
    jsonb_build_object('sub', v_auth_user_id)::text,
    true
  );
  v_channel := public.ensure_reservation_public_channel(
    v_restaurant_id,
    'https://booking.example'
  );
  v_public_key := v_channel->>'public_key';
  if v_public_key !~ '^rg_pk_[a-f0-9]{32}$' then
    raise exception 'Website channel did not return a valid revocable key.';
  end if;

  v_context := public.reservation_public_context(
    v_public_key,
    'https://booking.example'
  );
  if v_context->'restaurant'->>'name' <> 'Public booking fixture'
    or jsonb_array_length(v_context->'services') <> 1
    or jsonb_array_length(v_context->'areas') <> 2
    or exists (
      select 1
      from jsonb_array_elements(v_context->'areas') area
      where area->>'name' !~ '^Dining room \(0\.[AB]\)$'
    )
  then
    raise exception 'Public context leaked or omitted its reviewed booking data.';
  end if;

  v_search := public.reservation_public_search_availability(
    v_public_key,
    'https://booking.example',
    v_business_date,
    'lunch',
    2,
    null
  );
  if jsonb_array_length(v_search->'slots') = 0 then
    raise exception 'Public availability returned no usable table slots.';
  end if;
  v_local_time := v_search->'slots'->0->>'local_time';
  v_request := jsonb_build_object(
    'business_date', v_business_date,
    'service_key', 'lunch',
    'local_time', v_local_time,
    'party_size', 2
  );

  v_hold := public.reservation_public_create_hold(
    v_public_key,
    'https://booking.example',
    'hold-fixture-0001',
    v_request
  );
  v_hold_replay := public.reservation_public_create_hold(
    v_public_key,
    'https://booking.example',
    'hold-fixture-0001',
    v_request
  );
  if v_hold->>'hold_token' <> v_hold_replay->>'hold_token'
    or (v_hold->>'expires_at')::timestamptz > now() + interval '5 minutes 1 second'
  then
    raise exception 'Five-minute hold or idempotent replay contract failed.';
  end if;

  begin
    perform public.save_reservation(
      v_restaurant_id,
      jsonb_build_object(
        'guest_name', 'Operator overlap',
        'guest_email', 'operator.overlap@example.test',
        'guest_phone', '',
        'business_date', v_business_date,
        'service_key', 'lunch',
        'local_time', v_local_time,
        'party_size', 3,
        'source', 'phone',
        'language_code', 'en'
      )
    );
  exception when others then
    if position('cover limit' in lower(sqlerrm)) > 0 then
      v_rejected := true;
    else
      raise;
    end if;
  end;
  if not v_rejected then
    raise exception 'Operator booking ignored covers protected by a public hold.';
  end if;

  v_confirmation := public.reservation_public_confirm(
    v_public_key,
    'https://booking.example',
    'confirm-fixture-0001',
    v_hold->>'hold_token',
    jsonb_build_object(
      'name', 'Anonymous overwrite attempt',
      'email', 'trusted.guest@example.test',
      'phone', '+3225550000',
      'language_code', 'en'
    )
  );
  v_confirmation_replay := public.reservation_public_confirm(
    v_public_key,
    'https://booking.example',
    'confirm-fixture-0001',
    v_hold->>'hold_token',
    jsonb_build_object(
      'name', 'Anonymous overwrite attempt',
      'email', 'trusted.guest@example.test',
      'phone', '+3225550000',
      'language_code', 'en'
    )
  );

  if v_confirmation->>'reservation_id'
      <> v_confirmation_replay->>'reservation_id'
    or v_confirmation->>'status' <> 'confirmed'
    or not exists (
      select 1
      from public.reservations reservation
      join public.reservation_table_assignments assignment
        on assignment.restaurant_id = reservation.restaurant_id
       and assignment.reservation_id = reservation.id
       and assignment.unassigned_at is null
      where reservation.restaurant_id = v_restaurant_id
        and reservation.id = (v_confirmation->>'reservation_id')::uuid
        and reservation.source = 'widget'
        and assignment.table_id = v_table_id
    )
  then
    raise exception 'Public hold confirmation did not create one allocated booking.';
  end if;

  if not exists (
    select 1
    from public.reservation_guests guest
    where guest.restaurant_id = v_restaurant_id
      and guest.id = v_trusted_guest_id
      and guest.display_name = 'Trusted guest'
      and guest.email::text = 'Trusted.Guest@Example.Test'
      and guest.normalized_email = 'trusted.guest@example.test'
      and guest.phone = '+32 2 555 00 00'
      and guest.normalized_phone = '+3225550000'
      and guest.language_code = 'fr'
  ) then
    raise exception 'Anonymous confirmation overwrote trusted guest identity.';
  end if;

  if not exists (
    select 1
    from public.reservations reservation
    where reservation.restaurant_id = v_restaurant_id
      and reservation.id = (v_confirmation->>'reservation_id')::uuid
      and reservation.guest_id = v_trusted_guest_id
      and reservation.metadata
        #>> '{booking_guest_snapshot,display_name}'
          = 'Anonymous overwrite attempt'
      and reservation.metadata
        #>> '{booking_guest_snapshot,email}'
          = 'trusted.guest@example.test'
      and reservation.metadata
        #>> '{booking_guest_snapshot,phone}'
          = '+3225550000'
  ) then
    raise exception
      'Public booking did not retain its guest link and submitted snapshot.';
  end if;
end
$public_booking_workflow$;

rollback;
