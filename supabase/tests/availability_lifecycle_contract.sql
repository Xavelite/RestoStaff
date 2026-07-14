-- Employee availability must reject elapsed edits without erasing elapsed
-- rows when the editable remainder of the current week is resubmitted.
begin;

do $availability_lifecycle$
declare
  v_auth_user_id uuid := gen_random_uuid();
  v_profile_id uuid;
  v_restaurant_id uuid := gen_random_uuid();
  v_employee_id uuid := gen_random_uuid();
  v_timezone text;
  v_today date;
  v_past date;
  v_week_start date;
  v_rejected boolean := false;
begin
  v_timezone := case
    when extract(isodow from (now() at time zone 'UTC')::date) = 1
      and extract(hour from now() at time zone 'UTC') < 10
      then 'Pacific/Honolulu'
    when extract(isodow from (now() at time zone 'UTC')::date) = 1
      then 'Pacific/Kiritimati'
    else 'UTC'
  end;
  v_today := (now() at time zone v_timezone)::date;
  v_past := v_today - 1;
  v_week_start := public.week_start_for_date(v_today);

  insert into auth.users (id, email)
  values (v_auth_user_id, 'availability-' || v_auth_user_id::text || '@example.test');
  insert into public.profiles (auth_user_id, first_name, last_name, email)
  values (
    v_auth_user_id,
    'Availability',
    'Fixture',
    'availability-' || v_auth_user_id::text || '@example.test'
  )
  returning id into v_profile_id;
  insert into public.restaurants (id, workspace_slug, name, owner_profile_id)
  values (
    v_restaurant_id,
    'availability-' || replace(v_restaurant_id::text, '-', ''),
    'Availability lifecycle fixture',
    v_profile_id
  );
  insert into public.restaurant_settings (restaurant_id, timezone)
  values (v_restaurant_id, v_timezone);
  insert into public.restaurant_memberships (restaurant_id, profile_id, role, status)
  values (v_restaurant_id, v_profile_id, 'owner', 'active');
  insert into public.services (restaurant_id, service_key, name, sort_order)
  values
    (v_restaurant_id, 'lunch', 'Lunch', 10),
    (v_restaurant_id, 'evening', 'Evening', 20);
  insert into public.employees (id, restaurant_id, display_name, active)
  values (v_employee_id, v_restaurant_id, 'Availability employee', true);
  insert into public.employee_access (
    restaurant_id, employee_id, profile_id, access_status, badge_enabled
  )
  values (v_restaurant_id, v_employee_id, v_profile_id, 'active', false);
  insert into public.work_weeks (restaurant_id, week_start)
  values (v_restaurant_id, v_week_start);
  insert into public.employee_availability_slots (
    restaurant_id, employee_id, week_start, weekday, service_key, availability_state
  )
  values (
    v_restaurant_id,
    v_employee_id,
    v_week_start,
    extract(isodow from v_past)::smallint,
    'lunch',
    'available'
  );

  perform set_config(
    'request.jwt.claims',
    jsonb_build_object('sub', v_auth_user_id)::text,
    true
  );

  perform public.save_employee_availability(
    v_restaurant_id,
    v_employee_id,
    jsonb_build_array(
      jsonb_build_object(
        'date', v_today,
        'service_key', 'lunch',
        'availability_state', 'unavailable'
      ),
      jsonb_build_object(
        'date', v_today,
        'service_key', 'evening',
        'availability_state', ''
      )
    )
  );

  if not exists (
    select 1
    from public.employee_availability_slots av
    where av.restaurant_id = v_restaurant_id
      and av.employee_id = v_employee_id
      and av.week_start = v_week_start
      and av.weekday = extract(isodow from v_past)::smallint
      and av.service_key = 'lunch'
      and av.availability_state = 'available'
  ) then
    raise exception 'Current-week submission erased elapsed availability.';
  end if;
  if not exists (
    select 1
    from public.employee_availability_slots av
    where av.restaurant_id = v_restaurant_id
      and av.employee_id = v_employee_id
      and av.week_start = v_week_start
      and av.weekday = extract(isodow from v_today)::smallint
      and av.service_key = 'lunch'
      and av.availability_state = 'unavailable'
  ) then
    raise exception 'Current availability was not replaced.';
  end if;

  begin
    perform public.save_employee_availability(
      v_restaurant_id,
      v_employee_id,
      jsonb_build_array(jsonb_build_object(
        'date', v_past,
        'service_key', 'lunch',
        'availability_state', 'unavailable'
      ))
    );
  exception
    when others then
      if position('Past availability is read-only.' in sqlerrm) > 0 then
        v_rejected := true;
      else
        raise;
      end if;
  end;
  if not v_rejected then
    raise exception 'Elapsed availability mutation was not rejected.';
  end if;
end
$availability_lifecycle$;

rollback;
