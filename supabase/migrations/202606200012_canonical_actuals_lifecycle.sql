-- Preconditions:
-- - Core work_weeks, time_entries, time_entry_adjustments and work_week_events
--   tables already exist.
-- - require_owner_or_manager_context(), week_start_for_date() and
--   workspace_runtime_snapshot_for_current_context() already exist.
--
-- Rollback:
-- - Restore the previous save_actuals_lifecycle(uuid, text, jsonb) function
--   from the pre-deployment schema backup. This migration does not delete data.
--
-- This migration brings the Actuals lifecycle under source control. The
-- deployed development database previously contained this RPC without a
-- matching versioned definition.

begin;

create or replace function public.save_actuals_lifecycle(
  p_restaurant_id uuid,
  p_action text,
  p_payload jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $actuals_lifecycle$
declare
  v_actor record;
  v_action text := lower(btrim(coalesce(p_action, '')));
  v_reason text := btrim(coalesce(p_payload->>'reason', ''));
  v_employee_id uuid;
  v_entry_id uuid;
  v_business_date date;
  v_week_start date;
  v_service_key text;
  v_clock_in timestamptz;
  v_clock_out timestamptz;
  v_break_minutes integer;
  v_expected_updated_at timestamptz;
  v_entry public.time_entries%rowtype;
  v_after public.time_entries%rowtype;
  v_week public.work_weeks%rowtype;
  v_local_today date;
  v_timezone text;
  v_planned_shift_id uuid;
  v_new_status text;
begin
  select * into v_actor
  from public.require_owner_or_manager_context(p_restaurant_id)
  limit 1;

  if v_action not in (
    'manual_entry', 'adjust_entry', 'cancel_entry',
    'approve_week', 'reopen_week'
  ) then
    raise exception 'Unsupported Actuals action.';
  end if;

  if length(v_reason) < 3 then
    raise exception 'A manager reason of at least 3 characters is required.';
  end if;

  select coalesce(nullif(btrim(rs.timezone), ''), 'Europe/Brussels')
  into v_timezone
  from public.restaurant_settings rs
  where rs.restaurant_id = p_restaurant_id;
  v_timezone := coalesce(v_timezone, 'Europe/Brussels');
  v_local_today := (now() at time zone v_timezone)::date;

  if v_action in ('manual_entry', 'adjust_entry', 'cancel_entry') then
    v_entry_id := nullif(p_payload->>'time_entry_id', '')::uuid;

    if v_action in ('adjust_entry', 'cancel_entry') then
      if v_entry_id is null then
        raise exception 'A time entry is required.';
      end if;

      select * into v_entry
      from public.time_entries t
      where t.restaurant_id = p_restaurant_id
        and t.id = v_entry_id
      for update;

      if v_entry.id is null then
        raise exception 'Time entry not found.';
      end if;
      if v_entry.status = 'cancelled' then
        raise exception 'Cancelled time entries cannot be changed.';
      end if;

      v_expected_updated_at :=
        nullif(p_payload->>'expected_updated_at', '')::timestamptz;
      if v_expected_updated_at is not null
          and date_trunc('milliseconds', v_entry.updated_at)
            <> date_trunc('milliseconds', v_expected_updated_at) then
        raise exception 'CONFLICT: This time entry changed in another session. Reload before saving.';
      end if;

      v_employee_id := v_entry.employee_id;
      v_business_date := v_entry.business_date;
      v_service_key := v_entry.service_key;
    else
      v_employee_id := nullif(p_payload->>'employee_id', '')::uuid;
      v_business_date := nullif(p_payload->>'business_date', '')::date;
      v_service_key := lower(btrim(coalesce(p_payload->>'service_key', '')));

      if v_employee_id is null or v_business_date is null then
        raise exception 'Employee and business date are required.';
      end if;
      if not exists (
        select 1 from public.employees e
        where e.restaurant_id = p_restaurant_id
          and e.id = v_employee_id
          and e.active
      ) then
        raise exception 'Active employee required.';
      end if;
      if not exists (
        select 1 from public.services s
        where s.restaurant_id = p_restaurant_id
          and s.service_key = v_service_key
          and s.active
      ) then
        raise exception 'Select an active service.';
      end if;
      if exists (
        select 1 from public.time_entries t
        where t.restaurant_id = p_restaurant_id
          and t.employee_id = v_employee_id
          and t.business_date = v_business_date
          and t.service_key = v_service_key
          and t.status <> 'cancelled'
      ) then
        raise exception 'An active time entry already exists for this employee and service.';
      end if;
    end if;

    if v_business_date > v_local_today then
      raise exception 'Worked time cannot be recorded in the future.';
    end if;

    v_week_start := public.week_start_for_date(v_business_date);
    insert into public.work_weeks (
      restaurant_id, week_start, planning_status, actuals_status
    )
    values (p_restaurant_id, v_week_start, 'draft', 'open')
    on conflict (restaurant_id, week_start) do nothing;

    select * into v_week
    from public.work_weeks w
    where w.restaurant_id = p_restaurant_id
      and w.week_start = v_week_start
    for update;

    if v_week.actuals_status in ('approved', 'locked') then
      raise exception 'Reopen this Actuals week before changing worked time.';
    end if;

    if v_action = 'cancel_entry' then
      update public.time_entries
      set status = 'cancelled',
          cancellation_reason = v_reason,
          cancelled_at = now(),
          cancelled_by_profile_id = v_actor.profile_id,
          updated_at = now()
      where restaurant_id = p_restaurant_id and id = v_entry.id
      returning * into v_after;

      insert into public.time_entry_adjustments (
        restaurant_id, time_entry_id, employee_id, business_date,
        service_key, action, previous_values, new_values, reason,
        actor_profile_id, actor_employee_id, actor_role
      )
      values (
        p_restaurant_id, v_entry.id, v_entry.employee_id,
        v_entry.business_date, v_entry.service_key, 'cancel_entry',
        jsonb_build_object(
          'clock_in_at', v_entry.clock_in_at,
          'clock_out_at', v_entry.clock_out_at,
          'break_minutes', v_entry.break_minutes,
          'status', v_entry.status,
          'updated_at', v_entry.updated_at
        ),
        jsonb_build_object(
          'clock_in_at', v_after.clock_in_at,
          'clock_out_at', v_after.clock_out_at,
          'break_minutes', v_after.break_minutes,
          'status', v_after.status,
          'updated_at', v_after.updated_at
        ),
        v_reason,
        v_actor.profile_id, v_actor.employee_id, v_actor.role
      );
    else
      v_clock_in := nullif(p_payload->>'clock_in_at', '')::timestamptz;
      v_clock_out := nullif(p_payload->>'clock_out_at', '')::timestamptz;
      v_break_minutes := coalesce(
        nullif(p_payload->>'break_minutes', '')::integer,
        case when v_action = 'adjust_entry' then v_entry.break_minutes else 0 end
      );

      if v_clock_in is null then
        raise exception 'Clock-in is required.';
      end if;
      if v_clock_out is not null and v_clock_out <= v_clock_in then
        raise exception 'Clock-out must be after clock-in.';
      end if;
      if v_break_minutes < 0 then
        raise exception 'Break cannot be negative.';
      end if;
      if v_clock_out is null and v_break_minutes > 0 then
        raise exception 'A break can only be recorded after clock-out.';
      end if;
      if v_clock_out is not null
          and v_clock_out - v_clock_in > interval '36 hours' then
        raise exception 'A time entry cannot exceed 36 hours.';
      end if;
      if v_clock_out is not null
          and v_break_minutes >= extract(epoch from (v_clock_out - v_clock_in)) / 60 then
        raise exception 'Break must be shorter than the worked interval.';
      end if;

      v_new_status := case when v_clock_out is null then 'open' else 'adjusted' end;

      if v_action = 'manual_entry' then
        select ps.id into v_planned_shift_id
        from public.planned_shifts ps
        where ps.restaurant_id = p_restaurant_id
          and ps.week_start = v_week_start
          and ps.employee_id = v_employee_id
          and ps.weekday = extract(isodow from v_business_date)
          and ps.service_key = v_service_key
        limit 1;

        insert into public.time_entries (
          restaurant_id, employee_id, business_date, service_key,
          planned_shift_id, clock_in_at, clock_out_at, break_minutes,
          source, status, adjusted_at, adjusted_by_profile_id,
          adjustment_reason
        )
        values (
          p_restaurant_id, v_employee_id, v_business_date, v_service_key,
          v_planned_shift_id, v_clock_in, v_clock_out, v_break_minutes,
          'manual', v_new_status, now(), v_actor.profile_id, v_reason
        )
        returning * into v_after;

        insert into public.time_entry_adjustments (
          restaurant_id, time_entry_id, employee_id, business_date,
          service_key, action, previous_values, new_values, reason,
          actor_profile_id, actor_employee_id, actor_role
        )
        values (
          p_restaurant_id, v_after.id, v_after.employee_id,
          v_after.business_date, v_after.service_key, 'manual_entry',
          '{}'::jsonb,
          jsonb_build_object(
            'clock_in_at', v_after.clock_in_at,
            'clock_out_at', v_after.clock_out_at,
            'break_minutes', v_after.break_minutes,
            'status', v_after.status,
            'source', v_after.source,
            'updated_at', v_after.updated_at
          ),
          v_reason,
          v_actor.profile_id, v_actor.employee_id, v_actor.role
        );
      else
        update public.time_entries
        set clock_in_at = v_clock_in,
            clock_out_at = v_clock_out,
            break_minutes = v_break_minutes,
            status = v_new_status,
            adjusted_at = now(),
            adjusted_by_profile_id = v_actor.profile_id,
            adjustment_reason = v_reason,
            updated_at = now()
        where restaurant_id = p_restaurant_id and id = v_entry.id
        returning * into v_after;

        insert into public.time_entry_adjustments (
          restaurant_id, time_entry_id, employee_id, business_date,
          service_key, action, previous_values, new_values, reason,
          actor_profile_id, actor_employee_id, actor_role
        )
        values (
          p_restaurant_id, v_entry.id, v_entry.employee_id,
          v_entry.business_date, v_entry.service_key, 'adjust_entry',
          jsonb_build_object(
            'clock_in_at', v_entry.clock_in_at,
            'clock_out_at', v_entry.clock_out_at,
            'break_minutes', v_entry.break_minutes,
            'status', v_entry.status,
            'updated_at', v_entry.updated_at
          ),
          jsonb_build_object(
            'clock_in_at', v_after.clock_in_at,
            'clock_out_at', v_after.clock_out_at,
            'break_minutes', v_after.break_minutes,
            'status', v_after.status,
            'updated_at', v_after.updated_at
          ),
          v_reason,
          v_actor.profile_id, v_actor.employee_id, v_actor.role
        );
      end if;
    end if;
  else
    v_week_start := nullif(p_payload->>'week_start', '')::date;
    if v_week_start is null or extract(isodow from v_week_start) <> 1 then
      raise exception 'Actuals week must start on Monday.';
    end if;

    perform pg_advisory_xact_lock(
      hashtextextended(p_restaurant_id::text || ':actuals:' || v_week_start::text, 0)
    );

    insert into public.work_weeks (
      restaurant_id, week_start, planning_status, actuals_status
    )
    values (p_restaurant_id, v_week_start, 'draft', 'open')
    on conflict (restaurant_id, week_start) do nothing;

    select * into v_week
    from public.work_weeks w
    where w.restaurant_id = p_restaurant_id
      and w.week_start = v_week_start
    for update;

    v_expected_updated_at :=
      nullif(p_payload->>'expected_updated_at', '')::timestamptz;
    if v_expected_updated_at is not null
        and date_trunc('milliseconds', v_week.updated_at)
          <> date_trunc('milliseconds', v_expected_updated_at) then
      raise exception 'CONFLICT: This Actuals week changed in another session. Reload before continuing.';
    end if;

    if v_action = 'approve_week' then
      if v_week.actuals_status <> 'open' then
        raise exception 'Only an open Actuals week can be approved.';
      end if;

      update public.work_weeks
      set actuals_status = 'approved',
          actuals_approved_at = now(),
          actuals_approved_by_profile_id = v_actor.profile_id,
          actuals_reopened_at = null,
          actuals_reopened_by_profile_id = null,
          updated_at = now()
      where restaurant_id = p_restaurant_id and week_start = v_week_start;

      insert into public.work_week_events (
        restaurant_id, week_start, event_type, actor_profile_id,
        actor_employee_id, actor_role, reason, previous_values, new_values
      )
      values (
        p_restaurant_id, v_week_start, 'actuals_approved',
        v_actor.profile_id, v_actor.employee_id, v_actor.role, v_reason,
        jsonb_build_object('actuals_status', v_week.actuals_status),
        jsonb_build_object('actuals_status', 'approved')
      );
    else
      if v_week.actuals_status <> 'approved' then
        raise exception 'Only an approved Actuals week can be reopened.';
      end if;

      update public.work_weeks
      set actuals_status = 'open',
          actuals_reopened_at = now(),
          actuals_reopened_by_profile_id = v_actor.profile_id,
          updated_at = now()
      where restaurant_id = p_restaurant_id and week_start = v_week_start;

      insert into public.work_week_events (
        restaurant_id, week_start, event_type, actor_profile_id,
        actor_employee_id, actor_role, reason, previous_values, new_values
      )
      values (
        p_restaurant_id, v_week_start, 'actuals_reopened',
        v_actor.profile_id, v_actor.employee_id, v_actor.role, v_reason,
        jsonb_build_object('actuals_status', v_week.actuals_status),
        jsonb_build_object('actuals_status', 'open')
      );
    end if;
  end if;

  return jsonb_build_object(
    'runtime_snapshot',
    public.workspace_runtime_snapshot_for_current_context(p_restaurant_id)
  );
end
$actuals_lifecycle$;

revoke all on function public.save_actuals_lifecycle(uuid, text, jsonb)
  from public, anon;
grant execute on function public.save_actuals_lifecycle(uuid, text, jsonb)
  to authenticated;

commit;
