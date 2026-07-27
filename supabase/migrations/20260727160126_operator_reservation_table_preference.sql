-- Manager bookings can intentionally target one physical table. Automatic
-- assignment remains the default and an exact preference is never silently
-- replaced by another table.

alter table public.reservations
  add column preferred_table_id uuid;

alter table public.reservations
  add constraint reservations_restaurant_id_preferred_table_id_fkey
  foreign key (restaurant_id, preferred_table_id)
  references public.reservation_tables(restaurant_id, id)
  on delete restrict;

create index reservations_preferred_table_idx
  on public.reservations (restaurant_id, preferred_table_id)
  where preferred_table_id is not null;

comment on column public.reservations.preferred_table_id is
  'Optional exact physical table requested by a manager. Null means best available.';

-- The authenticated workspace function was rebuilt by an earlier migration
-- from its stored definition. Make the new field explicit in that response so
-- opening an existing booking retains manager intent even if row serialization
-- changes later.
do $reservation_workspace_table_preference$
declare
  v_definition text;
  v_next text;
begin
  select replace(
    pg_get_functiondef(
      'public.get_reservation_workspace(uuid,date)'::regprocedure
    ),
    chr(13),
    ''
  )
  into v_definition;

  v_next := replace(
    v_definition,
    $old$'guest', to_jsonb(g),$old$,
    $new$'guest', to_jsonb(g),
          'preferred_table_id', r.preferred_table_id,$new$
  );

  if v_next = v_definition then
    raise exception 'Reservation workspace preference contract drifted.';
  end if;
  execute v_next;
end
$reservation_workspace_table_preference$;

revoke all on function public.get_reservation_workspace(uuid,date)
  from public, anon;
grant execute on function public.get_reservation_workspace(uuid,date)
  to authenticated;

create function public.reservation_exact_table_candidate(
  p_restaurant_id uuid,
  p_starts_at timestamptz,
  p_ends_at timestamptz,
  p_party_size integer,
  p_room_id uuid,
  p_preferred_table_id uuid,
  p_exclude_reservation_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_table record;
begin
  select
    table_row.id,
    table_row.label,
    table_row.room_id,
    table_row.minimum_capacity,
    table_row.maximum_capacity,
    table_row.active,
    table_row.blocked,
    room.active as room_active
  into v_table
  from public.reservation_tables table_row
  join public.reservation_rooms room
    on room.restaurant_id = table_row.restaurant_id
   and room.id = table_row.room_id
  where table_row.restaurant_id = p_restaurant_id
    and table_row.id = p_preferred_table_id;

  if not found then
    return jsonb_build_object(
      'available', false,
      'code', 'preferred_table_missing',
      'reason', 'The selected table no longer exists.'
    );
  end if;

  if not v_table.active or not v_table.room_active then
    return jsonb_build_object(
      'available', false,
      'code', 'preferred_table_inactive',
      'reason', 'The selected table is not active.'
    );
  end if;

  if v_table.blocked then
    return jsonb_build_object(
      'available', false,
      'code', 'preferred_table_blocked',
      'reason', 'The selected table is blocked.'
    );
  end if;

  if p_room_id is not null and v_table.room_id <> p_room_id then
    return jsonb_build_object(
      'available', false,
      'code', 'preferred_table_room',
      'reason', 'The selected table is not in the preferred area.'
    );
  end if;

  if p_party_size < v_table.minimum_capacity
    or p_party_size > v_table.maximum_capacity
  then
    return jsonb_build_object(
      'available', false,
      'code', 'preferred_table_capacity',
      'reason', format(
        'Table %s accepts %s to %s guests.',
        v_table.label,
        v_table.minimum_capacity,
        v_table.maximum_capacity
      )
    );
  end if;

  if exists (
    select 1
    from public.reservation_table_assignments assignment
    join public.reservations reservation
      on reservation.restaurant_id = assignment.restaurant_id
     and reservation.id = assignment.reservation_id
    where assignment.restaurant_id = p_restaurant_id
      and assignment.table_id = p_preferred_table_id
      and assignment.unassigned_at is null
      and reservation.id is distinct from p_exclude_reservation_id
      and reservation.status not in ('cancelled', 'no_show', 'finished')
      and assignment.occupied_at
        && tstzrange(p_starts_at, p_ends_at, '[)')
  ) or exists (
    select 1
    from public.reservation_public_hold_tables hold_table
    join public.reservation_public_holds hold
      on hold.restaurant_id = hold_table.restaurant_id
     and hold.id = hold_table.hold_id
    where hold_table.restaurant_id = p_restaurant_id
      and hold_table.table_id = p_preferred_table_id
      and hold.consumed_at is null
      and hold.released_at is null
      and hold.expires_at > now()
      and tstzrange(hold.starts_at, hold.ends_at, '[)')
        && tstzrange(p_starts_at, p_ends_at, '[)')
  ) then
    return jsonb_build_object(
      'available', false,
      'code', 'preferred_table_unavailable',
      'reason', format('Table %s is not available for this time.', v_table.label)
    );
  end if;

  return jsonb_build_object(
    'available', true,
    'kind', 'preferred_table',
    'room_id', v_table.room_id,
    'table_ids', jsonb_build_array(v_table.id),
    'explanation', format('Table %s was selected by the manager.', v_table.label)
  );
end
$$;

create function public.reservation_operator_availability_internal(
  p_restaurant_id uuid,
  p_business_date date,
  p_service_key text,
  p_local_time time,
  p_party_size integer,
  p_room_id uuid,
  p_exclude_reservation_id uuid,
  p_preferred_table_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_result jsonb;
  v_exact_table jsonb;
begin
  v_result := public.reservation_availability_internal(
    p_restaurant_id,
    p_business_date,
    p_service_key,
    p_local_time,
    p_party_size,
    p_room_id,
    p_exclude_reservation_id
  );

  if p_preferred_table_id is null then
    return v_result;
  end if;

  if coalesce((v_result->>'available')::boolean, false) is not true then
    if v_result->>'code' = 'no_table' then
      return v_result || jsonb_build_object(
        'code', 'preferred_table_unavailable',
        'reason', 'The selected table is not available for this time.'
      );
    end if;
    return v_result;
  end if;

  v_exact_table := public.reservation_exact_table_candidate(
    p_restaurant_id,
    (v_result->>'starts_at')::timestamptz,
    (v_result->>'ends_at')::timestamptz,
    p_party_size,
    p_room_id,
    p_preferred_table_id,
    p_exclude_reservation_id
  );

  if coalesce((v_exact_table->>'available')::boolean, false) is not true then
    return v_exact_table;
  end if;

  return jsonb_set(v_result, '{assignment}', v_exact_table, true);
end
$$;

create function public.resolve_operator_reservation_guest(
  p_restaurant_id uuid,
  p_guest_id uuid,
  p_normalized_email text,
  p_normalized_phone text
)
returns uuid
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_guest_id uuid;
  v_match_count integer;
  v_current_email text;
  v_current_phone text;
begin
  if p_guest_id is not null then
    select guest.id, guest.normalized_email, guest.normalized_phone
    into v_guest_id, v_current_email, v_current_phone
    from public.reservation_guests guest
    where guest.restaurant_id = p_restaurant_id
      and guest.id = p_guest_id
      and guest.anonymized_at is null;

    if not found then
      raise exception 'Guest not found.';
    end if;

    if (
      p_normalized_email is not null
      and p_normalized_email is distinct from v_current_email
      and exists (
        select 1
        from public.reservation_guests other_guest
        where other_guest.restaurant_id = p_restaurant_id
          and other_guest.id <> v_guest_id
          and other_guest.anonymized_at is null
          and other_guest.normalized_email = p_normalized_email
      )
    ) or (
      p_normalized_phone is not null
      and p_normalized_phone is distinct from v_current_phone
      and exists (
        select 1
        from public.reservation_guests other_guest
        where other_guest.restaurant_id = p_restaurant_id
          and other_guest.id <> v_guest_id
          and other_guest.anonymized_at is null
          and other_guest.normalized_phone = p_normalized_phone
      )
    ) then
      raise exception
        'Guest contact collision: this email or phone belongs to another guest.';
    end if;

    return v_guest_id;
  end if;

  if p_normalized_email is not null and p_normalized_phone is not null then
    select
      count(*)::integer,
      (array_agg(guest.id order by guest.updated_at desc, guest.id))[1]
    into v_match_count, v_guest_id
    from public.reservation_guests guest
    where guest.restaurant_id = p_restaurant_id
      and guest.anonymized_at is null
      and guest.normalized_email = p_normalized_email
      and guest.normalized_phone = p_normalized_phone;

    if v_match_count > 1 then
      raise exception
        'Guest contact collision: several guests have these contact details.';
    end if;
    if v_match_count = 1 then
      return v_guest_id;
    end if;

    if exists (
      select 1
      from public.reservation_guests guest
      where guest.restaurant_id = p_restaurant_id
        and guest.anonymized_at is null
        and (
          guest.normalized_email = p_normalized_email
          or guest.normalized_phone = p_normalized_phone
        )
    ) then
      raise exception
        'Guest contact collision: email and phone point to different guest records.';
    end if;

    return null;
  end if;

  if p_normalized_email is not null then
    select
      count(*)::integer,
      (array_agg(guest.id order by guest.updated_at desc, guest.id))[1]
    into v_match_count, v_guest_id
    from public.reservation_guests guest
    where guest.restaurant_id = p_restaurant_id
      and guest.anonymized_at is null
      and guest.normalized_email = p_normalized_email;
  elsif p_normalized_phone is not null then
    select
      count(*)::integer,
      (array_agg(guest.id order by guest.updated_at desc, guest.id))[1]
    into v_match_count, v_guest_id
    from public.reservation_guests guest
    where guest.restaurant_id = p_restaurant_id
      and guest.anonymized_at is null
      and guest.normalized_phone = p_normalized_phone;
  else
    return null;
  end if;

  if v_match_count > 1 then
    raise exception
      'Guest contact collision: the contact detail matches several guests.';
  end if;

  return case when v_match_count = 1 then v_guest_id else null end;
end
$$;

drop function public.check_reservation_availability(
  uuid,date,text,time,integer,uuid,uuid
);

create function public.check_reservation_availability(
  p_restaurant_id uuid,
  p_business_date date,
  p_service_key text,
  p_local_time time,
  p_party_size integer,
  p_room_id uuid default null,
  p_exclude_reservation_id uuid default null,
  p_preferred_table_id uuid default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  perform 1 from public.require_owner_or_manager_context(p_restaurant_id);
  return public.reservation_operator_availability_internal(
    p_restaurant_id,
    p_business_date,
    p_service_key,
    p_local_time,
    p_party_size,
    p_room_id,
    p_exclude_reservation_id,
    p_preferred_table_id
  );
end
$$;

create or replace function public.save_reservation(
  p_restaurant_id uuid,
  p_reservation jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor record;
  v_id uuid;
  v_existing public.reservations%rowtype;
  v_guest_id uuid;
  v_guest_name text;
  v_email citext;
  v_normalized_email text;
  v_phone text;
  v_normalized_phone text;
  v_business_date date;
  v_service_key text;
  v_local_time time;
  v_party_size integer;
  v_room_id uuid;
  v_preferred_table_id uuid;
  v_preferred_table_room_id uuid;
  v_status text;
  v_source text;
  v_availability jsonb;
  v_assignment jsonb;
  v_table_id jsonb;
  v_expected_revision integer;
  v_assignment_group_id uuid;
begin
  select *
  into v_actor
  from public.require_owner_or_manager_context(p_restaurant_id)
  limit 1;

  v_id := nullif(p_reservation->>'id', '')::uuid;
  if v_id is not null then
    select *
    into v_existing
    from public.reservations reservation
    where reservation.restaurant_id = p_restaurant_id
      and reservation.id = v_id
    for update;
    if not found then
      raise exception 'Reservation not found.';
    end if;

    v_expected_revision := nullif(p_reservation->>'expected_revision', '')::integer;
    if v_expected_revision is null then
      raise exception 'CONFLICT: Reservation revision is required. Reload before saving.';
    end if;
    if v_existing.revision <> v_expected_revision then
      raise exception 'CONFLICT: Reservation changed since it was loaded. Reload before saving.';
    end if;
    if v_existing.status in ('finished', 'cancelled', 'no_show') then
      raise exception 'Finished, cancelled and no-show reservations cannot be edited.';
    end if;
  else
    v_id := gen_random_uuid();
  end if;

  v_business_date := (p_reservation->>'business_date')::date;
  v_service_key := p_reservation->>'service_key';
  v_local_time := (p_reservation->>'local_time')::time;
  v_party_size := (p_reservation->>'party_size')::integer;
  v_room_id := nullif(p_reservation->>'room_preference_id', '')::uuid;
  v_preferred_table_id := nullif(p_reservation->>'preferred_table_id', '')::uuid;
  v_source := coalesce(nullif(p_reservation->>'source', ''), 'internal');

  if v_preferred_table_id is not null then
    select table_row.room_id
    into v_preferred_table_room_id
    from public.reservation_tables table_row
    where table_row.restaurant_id = p_restaurant_id
      and table_row.id = v_preferred_table_id;
    if not found then
      raise exception 'The selected table no longer exists.';
    end if;
    if v_room_id is null then
      v_room_id := v_preferred_table_room_id;
    elsif v_room_id <> v_preferred_table_room_id then
      raise exception 'The selected table is not in the preferred area.';
    end if;
  end if;

  if v_existing.id is not null
    and v_existing.assignment_locked
    and v_preferred_table_id is distinct from v_existing.preferred_table_id
  then
    raise exception 'Unlock the table assignment before changing the selected table.';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(p_restaurant_id::text || '|' || v_business_date::text, 0)
  );

  v_availability := public.reservation_operator_availability_internal(
    p_restaurant_id,
    v_business_date,
    v_service_key,
    v_local_time,
    v_party_size,
    v_room_id,
    case when v_existing.id is null then null else v_existing.id end,
    v_preferred_table_id
  );
  if coalesce((v_availability->>'available')::boolean, false) is not true then
    raise exception '%', coalesce(v_availability->>'reason', 'Reservation is unavailable.')
      using errcode = 'P0001';
  end if;

  v_guest_name := btrim(p_reservation->>'guest_name');
  if v_guest_name = '' then
    raise exception 'Guest name is required.';
  end if;
  v_email := nullif(btrim(p_reservation->>'guest_email'), '')::citext;
  v_normalized_email := case
    when v_email is null then null
    else lower(v_email::text)
  end;
  v_phone := nullif(btrim(p_reservation->>'guest_phone'), '');
  v_normalized_phone := case
    when v_phone is null then null
    else nullif(regexp_replace(v_phone, '[^0-9+]', '', 'g'), '')
  end;

  perform pg_advisory_xact_lock(
    hashtextextended(p_restaurant_id::text || '|reservation-guests', 0)
  );
  v_guest_id := public.resolve_operator_reservation_guest(
    p_restaurant_id,
    nullif(p_reservation->>'guest_id', '')::uuid,
    v_normalized_email,
    v_normalized_phone
  );

  if v_guest_id is null then
    insert into public.reservation_guests (
      restaurant_id,
      display_name,
      email,
      normalized_email,
      phone,
      normalized_phone,
      language_code
    )
    values (
      p_restaurant_id,
      v_guest_name,
      v_email,
      v_normalized_email,
      v_phone,
      v_normalized_phone,
      coalesce(nullif(p_reservation->>'language_code', ''), 'fr')
    )
    returning id into v_guest_id;
  else
    update public.reservation_guests
    set display_name = v_guest_name,
      email = coalesce(v_email, email),
      normalized_email = coalesce(v_normalized_email, normalized_email),
      phone = coalesce(v_phone, phone),
      normalized_phone = coalesce(v_normalized_phone, normalized_phone)
    where restaurant_id = p_restaurant_id
      and id = v_guest_id;
  end if;

  v_status := case
    when v_existing.id is not null then v_existing.status
    when coalesce((v_availability->>'automatic_confirmation')::boolean, false)
      then 'confirmed'
    else 'pending'
  end;

  insert into public.reservations (
    id,
    restaurant_id,
    guest_id,
    business_date,
    service_key,
    starts_at,
    ends_at,
    party_size,
    status,
    source,
    room_preference_id,
    preferred_table_id,
    guest_comment,
    internal_notes,
    created_by_profile_id,
    updated_by_profile_id
  )
  values (
    v_id,
    p_restaurant_id,
    v_guest_id,
    v_business_date,
    v_service_key,
    (v_availability->>'starts_at')::timestamptz,
    (v_availability->>'ends_at')::timestamptz,
    v_party_size,
    v_status,
    v_source,
    v_room_id,
    v_preferred_table_id,
    nullif(btrim(p_reservation->>'guest_comment'), ''),
    nullif(btrim(p_reservation->>'internal_notes'), ''),
    v_actor.profile_id,
    v_actor.profile_id
  )
  on conflict (id) do update set
    guest_id = excluded.guest_id,
    business_date = excluded.business_date,
    service_key = excluded.service_key,
    starts_at = excluded.starts_at,
    ends_at = excluded.ends_at,
    party_size = excluded.party_size,
    source = excluded.source,
    room_preference_id = excluded.room_preference_id,
    preferred_table_id = excluded.preferred_table_id,
    guest_comment = excluded.guest_comment,
    internal_notes = excluded.internal_notes,
    updated_by_profile_id = excluded.updated_by_profile_id,
    revision = reservations.revision + 1
  where reservations.restaurant_id = p_restaurant_id;

  if v_existing.id is not null and not v_existing.assignment_locked then
    update public.reservation_table_assignments
    set unassigned_at = now()
    where restaurant_id = p_restaurant_id
      and reservation_id = v_id
      and unassigned_at is null;
  end if;

  v_assignment := v_availability->'assignment';
  v_assignment_group_id := gen_random_uuid();
  if v_existing.id is null or not v_existing.assignment_locked then
    for v_table_id in
      select value
      from jsonb_array_elements(
        coalesce(v_assignment->'table_ids', '[]'::jsonb)
      )
    loop
      insert into public.reservation_table_assignments (
        restaurant_id,
        reservation_id,
        table_id,
        assignment_group_id,
        assigned_by_profile_id,
        explanation
      )
      values (
        p_restaurant_id,
        v_id,
        (v_table_id #>> '{}')::uuid,
        v_assignment_group_id,
        v_actor.profile_id,
        v_assignment->>'explanation'
      );
    end loop;
  end if;

  insert into public.reservation_events (
    restaurant_id,
    reservation_id,
    event_type,
    from_status,
    to_status,
    actor_profile_id,
    details
  )
  values (
    p_restaurant_id,
    v_id,
    case when v_existing.id is null then 'created' else 'updated' end,
    case when v_existing.id is null then null else v_existing.status end,
    v_status,
    v_actor.profile_id,
    jsonb_build_object(
      'business_date', v_business_date,
      'service_key', v_service_key,
      'party_size', v_party_size,
      'preferred_table_id', v_preferred_table_id,
      'assignment', v_assignment
    )
  );

  return jsonb_build_object(
    'ok', true,
    'restaurant_id', p_restaurant_id,
    'reservation_id', v_id,
    'status', v_status,
    'availability', v_availability
  );
end
$$;

revoke all on function public.reservation_exact_table_candidate(
  uuid,timestamptz,timestamptz,integer,uuid,uuid,uuid
) from public, anon, authenticated, service_role;
revoke all on function public.reservation_operator_availability_internal(
  uuid,date,text,time,integer,uuid,uuid,uuid
) from public, anon, authenticated, service_role;
revoke all on function public.resolve_operator_reservation_guest(
  uuid,uuid,text,text
) from public, anon, authenticated, service_role;

revoke all on function public.check_reservation_availability(
  uuid,date,text,time,integer,uuid,uuid,uuid
) from public, anon, authenticated, service_role;
grant execute on function public.check_reservation_availability(
  uuid,date,text,time,integer,uuid,uuid,uuid
) to authenticated;

revoke all on function public.save_reservation(uuid,jsonb)
  from public, anon, service_role;
grant execute on function public.save_reservation(uuid,jsonb)
  to authenticated;

notify pgrst, 'reload schema';
