-- V591: availability remains employee-owned after planning publication.
-- Changing availability never mutates a planned shift; published conflicts are
-- surfaced to managers by the shared schedule/notification conflict model.

begin;

create or replace function public.save_employee_availability(
  p_restaurant_id uuid,
  p_employee_id uuid,
  p_availability jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $employee_availability$
declare
  v_profile_id uuid := public.current_profile_id();
  v_mode public.work_regime;
  v_today date;
  v_from_date date;
  v_week_start date;
  v_item jsonb;
  v_date date;
  v_service_key text;
  v_state text;
  v_slot_key text;
  v_slots jsonb := '{}'::jsonb;
begin
  if v_profile_id is null then
    raise exception 'Authenticated session required.';
  end if;
  if jsonb_typeof(coalesce(p_availability, '[]'::jsonb)) <> 'array' then
    raise exception 'Availability must be a JSON array.';
  end if;
  if not exists (
    select 1
    from public.employee_access ea
    join public.restaurant_memberships m
      on m.restaurant_id = ea.restaurant_id
     and m.profile_id = ea.profile_id
     and m.status = 'active'
    where ea.restaurant_id = p_restaurant_id
      and ea.employee_id = p_employee_id
      and ea.profile_id = v_profile_id
      and ea.access_status = 'active'
  ) then
    raise exception 'Employee self-service access required.';
  end if;

  select coalesce(c.work_regime, 'weekly_availability'::public.work_regime)
  into v_mode
  from public.employee_contracts c
  where c.restaurant_id = p_restaurant_id
    and c.employee_id = p_employee_id
    and c.active
    and c.is_current
  order by c.created_at desc
  limit 1;

  v_mode := coalesce(v_mode, 'weekly_availability'::public.work_regime);
  if v_mode <> 'weekly_availability'::public.work_regime then
    raise exception 'Weekly availability is not enabled for this employee.';
  end if;

  select (now() at time zone coalesce(rs.timezone, 'Europe/Brussels'))::date
  into v_today
  from public.restaurant_settings rs
  where rs.restaurant_id = p_restaurant_id;
  v_today := coalesce(v_today, current_date);

  for v_item in
    select value
    from jsonb_array_elements(coalesce(p_availability, '[]'::jsonb))
  loop
    v_date := nullif(v_item->>'date', '')::date;
    v_service_key := lower(btrim(coalesce(v_item->>'service_key', '')));
    v_state := lower(btrim(coalesce(v_item->>'availability_state', '')));

    if v_date is null then raise exception 'Availability date is required.'; end if;
    if v_date < v_today then raise exception 'Past availability is read-only.'; end if;
    if v_service_key not in ('lunch', 'evening') then
      raise exception 'Invalid service.';
    end if;
    if v_state not in ('', 'available', 'partial', 'unavailable') then
      raise exception 'Invalid availability state.';
    end if;

    v_slot_key := v_date::text || '|' || v_service_key;
    v_slots := jsonb_set(
      v_slots,
      array[v_slot_key],
      jsonb_build_object(
        'date', v_date,
        'service_key', v_service_key,
        'availability_state', nullif(v_state, '')
      ),
      true
    );
  end loop;

  select
    min((slot.value->>'date')::date)
  into v_from_date
  from jsonb_each(v_slots) slot;

  if v_from_date is null then
    raise exception 'Choose at least one availability slot.';
  end if;

  for v_week_start in
    select distinct public.week_start_for_date((slot.value->>'date')::date)
    from jsonb_each(v_slots) slot
  loop
    insert into public.work_weeks (restaurant_id, week_start)
    values (p_restaurant_id, v_week_start)
    on conflict (restaurant_id, week_start) do nothing;

    delete from public.employee_availability_slots av
    where av.restaurant_id = p_restaurant_id
      and av.employee_id = p_employee_id
      and av.week_start = v_week_start
      and av.week_start + (av.weekday::integer - 1) >= v_today;
  end loop;

  insert into public.employee_availability_slots (
    restaurant_id,
    employee_id,
    week_start,
    weekday,
    service_key,
    availability_state
  )
  select
    p_restaurant_id,
    p_employee_id,
    public.week_start_for_date((slot.value->>'date')::date),
    extract(isodow from (slot.value->>'date')::date)::smallint,
    slot.value->>'service_key',
    (slot.value->>'availability_state')::public.service_availability_state
  from jsonb_each(v_slots) slot
  where nullif(slot.value->>'availability_state', '') is not null;

  insert into public.employee_availability_submissions (
    restaurant_id,
    employee_id,
    week_start,
    status,
    submitted_at
  )
  select distinct
    p_restaurant_id,
    p_employee_id,
    public.week_start_for_date((slot.value->>'date')::date),
    'submitted'::public.availability_submission_status,
    now()
  from jsonb_each(v_slots) slot
  on conflict (restaurant_id, employee_id, week_start) do update
    set status = excluded.status,
        submitted_at = excluded.submitted_at,
        updated_at = now();

  return jsonb_build_object(
    'ok', true,
    'restaurant_id', p_restaurant_id
  );
end
$employee_availability$;

revoke all on function public.save_employee_availability(uuid,uuid,jsonb)
  from public, anon, authenticated;
grant execute on function public.save_employee_availability(uuid,uuid,jsonb)
  to authenticated;

notify pgrst, 'reload schema';

commit;
