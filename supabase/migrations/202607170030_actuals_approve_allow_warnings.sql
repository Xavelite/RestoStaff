-- Approving a Timesheet week is never hard-blocked by a manager decision.
-- Conflicts, missing badges and an unfinished week become confirmable warnings
-- (mirroring the Schedule publish gate): when save_actuals_lifecycle is called
-- with allow_warnings, it sets a transaction-local flag that the approval guard
-- honours to skip those raises. A live clock-in and missing audit evidence stay
-- hard — you cannot finalise pay while someone is on the clock, and audit
-- completeness is a system invariant, not a manager choice.
begin;

create or replace function public.guard_actuals_approval()
returns trigger
language plpgsql
set search_path = public
as $actuals_approval_guard$
declare
  v_week_end date := new.week_start + 6;
  v_timezone text;
  v_local_today date;
  v_allow boolean := coalesce(current_setting('app.allow_actuals_warnings', true), 'off') = 'on';
begin
  if new.actuals_status not in ('approved', 'locked')
      or new.actuals_status is not distinct from old.actuals_status then
    return new;
  end if;

  select coalesce(nullif(btrim(s.timezone), ''), 'Europe/Brussels')
  into v_timezone
  from public.restaurant_settings s
  where s.restaurant_id = new.restaurant_id;
  v_local_today := (
    now() at time zone coalesce(v_timezone, 'Europe/Brussels')
  )::date;

  if not v_allow and v_local_today <= v_week_end then
    raise exception 'Actuals can be approved only after the week has ended.';
  end if;

  -- Auto-finalize a missing Planning baseline instead of dead-ending approval.
  -- This is not a bypass: the missing-badge guard below reads NEW, so it also
  -- applies to a baseline finalized inside this same trigger execution.
  if old.planning_status = 'draft'
      and exists (
        select 1
        from public.planned_shifts p
        where p.restaurant_id = new.restaurant_id
          and p.week_start = new.week_start
      ) then
    new.planning_status := 'published';
    new.published_at := coalesce(new.published_at, now());
    new.published_by_profile_id := coalesce(
      new.published_by_profile_id, new.actuals_approved_by_profile_id
    );
    new.planning_revision := coalesce(new.planning_revision, 0) + 1;

    insert into public.work_week_events (
      restaurant_id, week_start, event_type, actor_profile_id,
      actor_employee_id, actor_role, reason, previous_values, new_values, metadata
    )
    values (
      new.restaurant_id, new.week_start, 'planning_finalized',
      new.actuals_approved_by_profile_id, null,
      public.active_membership_role(new.restaurant_id, new.actuals_approved_by_profile_id),
      'Planning baseline finalized automatically on Actuals approval.',
      jsonb_build_object('planning_status', 'draft'),
      jsonb_build_object(
        'planning_status', 'published',
        'planning', public.planning_snapshot_for_week(new.restaurant_id, new.week_start)
      ),
      jsonb_build_object('auto', true)
    );
  end if;

  -- A live clock-in still blocks: their hours are not yet known.
  if exists (
    select 1
    from public.time_entries t
    where t.restaurant_id = new.restaurant_id
      and t.business_date between new.week_start and v_week_end
      and t.status = 'open'
  ) then
    raise exception 'Resolve live badges before approving Actuals.';
  end if;

  if not v_allow and exists (
    select 1
    from public.planned_shifts p
    where p.restaurant_id = new.restaurant_id
      and p.week_start = new.week_start
      and new.planning_status = 'published'
      and not exists (
        select 1
        from public.time_entries t
        where t.restaurant_id = p.restaurant_id
          and t.employee_id = p.employee_id
          and t.business_date = p.week_start + (p.weekday - 1)
          and t.service_key = p.service_key
          and t.status <> 'cancelled'
      )
  ) then
    raise exception 'Resolve missing badges before approving Actuals.';
  end if;

  if not v_allow and exists (
    select 1
    from public.time_entries t
    where t.restaurant_id = new.restaurant_id
      and t.business_date between new.week_start and v_week_end
      and t.status <> 'cancelled'
      and (
        exists (
          select 1
          from public.absences a
          where a.restaurant_id = t.restaurant_id
            and a.employee_id = t.employee_id
            and a.status = 'approved'
            and t.business_date between a.start_date and a.end_date
            and (a.service_key is null or a.service_key = t.service_key)
        )
        or exists (
          select 1
          from public.work_pattern_exceptions e
          where e.restaurant_id = t.restaurant_id
            and e.employee_id = t.employee_id
            and e.status = 'approved'
            and t.business_date between e.start_date and e.end_date
            and (e.service_key is null or e.service_key = t.service_key)
        )
        or exists (
          select 1
          from public.employee_availability_slots a
          where a.restaurant_id = t.restaurant_id
            and a.employee_id = t.employee_id
            and a.week_start = new.week_start
            and a.weekday = extract(isodow from t.business_date)
            and a.service_key = t.service_key
            and a.availability_state = 'unavailable'
        )
      )
  ) then
    raise exception 'Resolve worked-time conflicts before approving Actuals.';
  end if;

  -- Audit completeness is a system invariant, never a manager override.
  if exists (
    select 1
    from public.time_entries t
    where t.restaurant_id = new.restaurant_id
      and t.business_date between new.week_start and v_week_end
      and (
        (
          t.source = 'manager_manual'
          and not exists (
            select 1
            from public.time_entry_adjustments a
            where a.restaurant_id = t.restaurant_id
              and a.time_entry_id = t.id
              and a.action = 'manual_entry'
          )
        )
        or (
          t.status in ('adjusted', 'cancelled')
          and not exists (
            select 1
            from public.time_entry_adjustments a
            where a.restaurant_id = t.restaurant_id
              and a.time_entry_id = t.id
          )
        )
      )
  ) then
    raise exception 'Resolve missing time-entry audit evidence before approving Actuals.';
  end if;

  return new;
end
$actuals_approval_guard$;

-- Set the transaction-local override inside save_actuals_lifecycle when the
-- approve_week call passes allow_warnings, right before the work_weeks update
-- that fires the guard.
do $patch_actuals_lifecycle$
declare
  v_def text;
  v_new text;
begin
  select replace(
    pg_get_functiondef('public.save_actuals_lifecycle(uuid,text,jsonb)'::regprocedure),
    chr(13),
    ''
  )
  into v_def;

  v_new := replace(
    v_def,
    $old$    if v_action = 'approve_week' then
      if v_week.actuals_status <> 'open' then$old$,
    $new$    if v_action = 'approve_week' then
      if coalesce(p_payload->>'allow_warnings', 'false') = 'true' then
        perform set_config('app.allow_actuals_warnings', 'on', true);
      end if;
      if v_week.actuals_status <> 'open' then$new$
  );

  if v_new = v_def then
    raise exception 'save_actuals_lifecycle approve_week anchor drifted.';
  end if;

  execute v_new;
end
$patch_actuals_lifecycle$;

commit;
