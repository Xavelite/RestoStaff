-- V572: make exact payroll evidence editable through the audited Timesheet workflow.
begin;

create function public.get_time_entry_payroll_evidence(
  p_restaurant_id uuid,
  p_time_entry_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare v_entry public.time_entries%rowtype;
begin
  if not public.is_owner_or_manager(p_restaurant_id) then
    raise exception 'Owner or manager access required.';
  end if;
  select * into v_entry
  from public.time_entries t
  where t.restaurant_id = p_restaurant_id and t.id = p_time_entry_id;
  if v_entry.id is null then raise exception 'Time entry not found.'; end if;
  return jsonb_build_object(
    'time_entry_id', v_entry.id,
    'actual_job_function_id', v_entry.actual_job_function_id,
    'actual_area_id', v_entry.actual_area_id,
    'actual_assignment_source', v_entry.actual_assignment_source,
    'break_intervals', coalesce((
      select jsonb_agg(to_jsonb(b) order by b.break_started_at, b.created_at)
      from public.time_entry_break_intervals b
      where b.restaurant_id = p_restaurant_id
        and b.time_entry_id = p_time_entry_id and b.active
    ), '[]'::jsonb)
  );
end
$$;

create function public.save_time_entry_payroll_evidence(
  p_restaurant_id uuid,
  p_time_entry_id uuid,
  p_actual_job_function_id uuid,
  p_actual_area_id uuid,
  p_break_intervals jsonb,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_entry public.time_entries%rowtype;
  v_after public.time_entries%rowtype;
  v_actor uuid := public.current_profile_id();
  v_break jsonb;
  v_start timestamptz;
  v_end timestamptz;
  v_previous_end timestamptz;
  v_total_seconds bigint := 0;
begin
  if not public.is_owner_or_manager(p_restaurant_id) then
    raise exception 'Owner or manager access required.';
  end if;
  if length(btrim(coalesce(p_reason, ''))) < 3 then
    raise exception 'A manager reason is required.';
  end if;
  if p_break_intervals is null or jsonb_typeof(p_break_intervals) <> 'array' then
    raise exception 'Break intervals must be an array.';
  end if;

  select * into v_entry
  from public.time_entries t
  where t.restaurant_id = p_restaurant_id and t.id = p_time_entry_id
  for update;
  if v_entry.id is null then raise exception 'Time entry not found.'; end if;
  if v_entry.status in ('open', 'cancelled') or v_entry.clock_out_at is null then
    raise exception 'Close the time entry before confirming payroll evidence.';
  end if;
  if p_actual_job_function_id is null or p_actual_area_id is null then
    raise exception 'Confirm the actual function and work area.';
  end if;
  if not exists (
    select 1 from public.job_functions j
    where j.restaurant_id = p_restaurant_id and j.id = p_actual_job_function_id and j.active
  ) then raise exception 'Active job function not found.'; end if;
  if not exists (
    select 1 from public.work_areas a
    where a.restaurant_id = p_restaurant_id and a.id = p_actual_area_id and a.active
  ) then raise exception 'Active work area not found.'; end if;

  for v_break in
    select value from jsonb_array_elements(p_break_intervals)
    order by (value->>'started_at')::timestamptz
  loop
    v_start := nullif(v_break->>'started_at', '')::timestamptz;
    v_end := nullif(v_break->>'ended_at', '')::timestamptz;
    if v_start is null or v_end is null or v_end <= v_start then
      raise exception 'Every break needs an exact start and end.';
    end if;
    if v_start < v_entry.clock_in_at or v_end > v_entry.clock_out_at then
      raise exception 'Breaks must stay inside the worked interval.';
    end if;
    if v_previous_end is not null and v_start < v_previous_end then
      raise exception 'Break intervals cannot overlap.';
    end if;
    v_total_seconds := v_total_seconds + floor(extract(epoch from (v_end - v_start)))::bigint;
    v_previous_end := v_end;
  end loop;
  if mod(v_total_seconds, 60) <> 0 then
    raise exception 'Break evidence must use whole minutes.';
  end if;
  if v_total_seconds >= floor(extract(epoch from (v_entry.clock_out_at - v_entry.clock_in_at))) then
    raise exception 'Breaks must be shorter than the worked interval.';
  end if;

  update public.time_entries
  set actual_job_function_id = p_actual_job_function_id,
      actual_area_id = p_actual_area_id,
      actual_assignment_source = 'manager',
      break_minutes = (v_total_seconds / 60)::integer,
      adjusted_at = now(),
      adjusted_by_profile_id = v_actor,
      adjustment_reason = btrim(p_reason),
      updated_at = now()
  where restaurant_id = p_restaurant_id and id = p_time_entry_id
  returning * into v_after;

  -- The aggregate compatibility trigger runs with the time-entry update above.
  -- Supersede its record and preserve the exact manager-confirmed intervals.
  update public.time_entry_break_intervals
  set active = false, superseded_at = now()
  where restaurant_id = p_restaurant_id and time_entry_id = p_time_entry_id and active;

  for v_break in
    select value from jsonb_array_elements(p_break_intervals)
    order by (value->>'started_at')::timestamptz
  loop
    v_start := (v_break->>'started_at')::timestamptz;
    v_end := (v_break->>'ended_at')::timestamptz;
    insert into public.time_entry_break_intervals (
      restaurant_id, time_entry_id, entry_revision,
      break_started_at, break_ended_at, duration_seconds,
      evidence_kind, source, created_by_profile_id
    ) values (
      p_restaurant_id, p_time_entry_id, v_after.revision,
      v_start, v_end, floor(extract(epoch from (v_end - v_start)))::integer,
      'exact', 'manager_adjustment', v_actor
    );
  end loop;

  insert into public.time_entry_adjustments (
    restaurant_id, time_entry_id, employee_id, business_date, service_key,
    action, previous_values, new_values, reason,
    actor_profile_id, actor_employee_id, actor_role
  ) values (
    p_restaurant_id, v_entry.id, v_entry.employee_id, v_entry.business_date,
    v_entry.service_key, 'adjust_entry',
    jsonb_build_object(
      'revision', v_entry.revision,
      'actual_job_function_id', v_entry.actual_job_function_id,
      'actual_area_id', v_entry.actual_area_id,
      'actual_assignment_source', v_entry.actual_assignment_source,
      'break_minutes', v_entry.break_minutes
    ),
    jsonb_build_object(
      'revision', v_after.revision,
      'actual_job_function_id', v_after.actual_job_function_id,
      'actual_area_id', v_after.actual_area_id,
      'actual_assignment_source', v_after.actual_assignment_source,
      'break_minutes', v_after.break_minutes,
      'exact_break_intervals', jsonb_array_length(p_break_intervals)
    ),
    btrim(p_reason), v_actor, null,
    coalesce(public.active_membership_role(p_restaurant_id, v_actor), 'manager')
  );

  return jsonb_build_object(
    'ok', true,
    'restaurant_id', p_restaurant_id,
    'entity_id', p_time_entry_id,
    'revision', v_after.revision
  );
end
$$;

revoke all on function public.get_time_entry_payroll_evidence(uuid, uuid) from public, anon, authenticated;
revoke all on function public.save_time_entry_payroll_evidence(uuid, uuid, uuid, uuid, jsonb, text) from public, anon, authenticated;
grant execute on function public.get_time_entry_payroll_evidence(uuid, uuid) to authenticated;
grant execute on function public.save_time_entry_payroll_evidence(uuid, uuid, uuid, uuid, jsonb, text) to authenticated;

commit;
