-- Employee scheduling policy must be explicit and safe by default.
-- Preconditions: migrations 001-009 are applied.
-- Rollback: restore the previous column/trigger defaults. Existing employee
-- availability and leave data is preserved by this migration.

update public.employee_contracts
set work_regime = 'weekly_availability'::public.work_regime
where contract_type_id is null
  and work_regime = 'manager_only'::public.work_regime;

alter table public.employee_contracts
  alter column work_regime set default 'weekly_availability'::public.work_regime;

create or replace function public.enforce_employee_availability_mode()
returns trigger
language plpgsql
security definer
set search_path = public
as $availability_mode_guard$
declare
  v_mode public.work_regime;
begin
  if public.is_owner_or_manager(new.restaurant_id) then return new; end if;

  select c.work_regime into v_mode
  from public.employee_contracts c
  where c.restaurant_id = new.restaurant_id
    and c.employee_id = new.employee_id
    and c.active
    and c.is_current
  order by c.created_at desc
  limit 1;

  if coalesce(v_mode, 'weekly_availability'::public.work_regime)
      <> 'weekly_availability'::public.work_regime then
    raise exception 'Weekly availability is not enabled for this employee.';
  end if;
  return new;
end
$availability_mode_guard$;

comment on column public.employee_contracts.work_regime is
  'Scheduling policy. Missing employment configuration defaults to weekly employee self-service; manager_only must be chosen explicitly.';

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
  v_to_date date;
  v_week_start date;
  v_item jsonb;
  v_date date;
  v_service_key text;
  v_state text;
begin
  if v_profile_id is null then raise exception 'Authenticated session required.'; end if;
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

  create temporary table if not exists pg_temp.availability_input (
    slot_date date not null,
    service_key text not null,
    availability_state text not null,
    primary key (slot_date, service_key)
  ) on commit drop;
  truncate pg_temp.availability_input;

  for v_item in select value from jsonb_array_elements(coalesce(p_availability, '[]')) loop
    v_date := (v_item->>'date')::date;
    v_service_key := v_item->>'service_key';
    v_state := coalesce(v_item->>'availability_state', '');
    if v_date < v_today then raise exception 'Past availability is read-only.'; end if;
    if v_service_key not in ('lunch', 'evening') then raise exception 'Invalid service.'; end if;
    if v_state not in ('', 'available', 'partial', 'unavailable') then
      raise exception 'Invalid availability state.';
    end if;
    insert into pg_temp.availability_input values (v_date, v_service_key, v_state)
    on conflict (slot_date, service_key) do update
      set availability_state = excluded.availability_state;
  end loop;

  select min(slot_date), max(slot_date) into v_from_date, v_to_date
  from pg_temp.availability_input;
  if v_from_date is null then raise exception 'Choose at least one availability slot.'; end if;

  for v_week_start in
    select distinct public.week_start_for_date(slot_date)
    from pg_temp.availability_input
  loop
    if exists (
      select 1 from public.work_weeks ww
      where ww.restaurant_id = p_restaurant_id
        and ww.week_start = v_week_start
        and ww.planning_status = 'published'
    ) then
      raise exception 'Availability is locked once the week is published.';
    end if;
    insert into public.work_weeks (restaurant_id, week_start)
    values (p_restaurant_id, v_week_start)
    on conflict (restaurant_id, week_start) do nothing;

    delete from public.employee_availability_slots av
    where av.restaurant_id = p_restaurant_id
      and av.employee_id = p_employee_id
      and av.week_start = v_week_start;
  end loop;

  insert into public.employee_availability_slots (
    restaurant_id, employee_id, week_start, weekday, service_key, availability_state
  )
  select
    p_restaurant_id,
    p_employee_id,
    public.week_start_for_date(slot_date),
    extract(isodow from slot_date)::smallint,
    service_key,
    availability_state
  from pg_temp.availability_input
  where availability_state <> '';

  insert into public.employee_availability_submissions (
    restaurant_id, employee_id, week_start, status, submitted_at
  )
  select distinct
    p_restaurant_id,
    p_employee_id,
    public.week_start_for_date(slot_date),
    'submitted',
    now()
  from pg_temp.availability_input
  on conflict (restaurant_id, employee_id, week_start) do update set
    status = excluded.status,
    submitted_at = excluded.submitted_at,
    updated_at = now();

  return jsonb_build_object(
    'runtime_snapshot',
    public.build_workspace_runtime_snapshot(
      p_restaurant_id,
      v_from_date - 7,
      v_to_date + 7
    )
  );
end
$employee_availability$;

revoke all on function public.save_employee_availability(uuid, uuid, jsonb)
  from public, anon;
grant execute on function public.save_employee_availability(uuid, uuid, jsonb)
  to authenticated;

create or replace function public.guard_actuals_approval()
returns trigger
language plpgsql
set search_path = public
as $actuals_approval_guard$
declare
  v_week_end date := new.week_start + 6;
begin
  if new.actuals_status not in ('approved', 'locked')
      or new.actuals_status is not distinct from old.actuals_status then
    return new;
  end if;

  if exists (
    select 1 from public.time_entries t
    where t.restaurant_id = new.restaurant_id
      and t.business_date between new.week_start and v_week_end
      and t.status = 'open'
  ) then
    raise exception 'Resolve live badges before approving actuals.';
  end if;

  if exists (
    select 1
    from public.planned_shifts ps
    where ps.restaurant_id = new.restaurant_id
      and ps.week_start = new.week_start
      and not exists (
        select 1 from public.time_entries t
        where t.restaurant_id = ps.restaurant_id
          and t.employee_id = ps.employee_id
          and t.business_date = ps.week_start + (ps.weekday - 1)
          and t.service_key = ps.service_key
          and t.status <> 'cancelled'
      )
  ) then
    raise exception 'Resolve missing badges before approving actuals.';
  end if;

  if exists (
    select 1
    from public.time_entries t
    where t.restaurant_id = new.restaurant_id
      and t.business_date between new.week_start and v_week_end
      and t.status <> 'cancelled'
      and (
        exists (
          select 1 from public.absences a
          where a.restaurant_id = t.restaurant_id
            and a.employee_id = t.employee_id
            and a.status = 'approved'
            and t.business_date between a.start_date and a.end_date
            and (a.service_key is null or a.service_key = t.service_key)
        )
        or exists (
          select 1 from public.schedule_exceptions se
          where se.restaurant_id = t.restaurant_id
            and se.employee_id = t.employee_id
            and se.status = 'approved'
            and t.business_date between se.start_date and se.end_date
            and (se.service_key is null or se.service_key = t.service_key)
        )
        or exists (
          select 1 from public.employee_availability_slots av
          where av.restaurant_id = t.restaurant_id
            and av.employee_id = t.employee_id
            and av.week_start = new.week_start
            and av.weekday = extract(isodow from t.business_date)
            and av.service_key = t.service_key
            and av.availability_state = 'unavailable'
        )
      )
  ) then
    raise exception 'Resolve worked-time conflicts before approving actuals.';
  end if;

  return new;
end
$actuals_approval_guard$;

drop trigger if exists work_weeks_actuals_approval_guard on public.work_weeks;
create trigger work_weeks_actuals_approval_guard
before update of actuals_status on public.work_weeks
for each row execute function public.guard_actuals_approval();
