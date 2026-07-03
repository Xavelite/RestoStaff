-- Actuals approval auto-finalize missing-badge guard.
--
-- Preconditions:
-- - 202606250035_actuals_approval_auto_finalize.sql has been applied.
-- Rollback strategy:
-- - Restore guard_actuals_approval() from 202606250035 only if the product
--   intentionally allows approving Actuals for an auto-finalized draft plan
--   while planned shifts have no worked/cancelled entry.
-- Product contract:
-- - Auto-finalizing a past draft Planning baseline removes the deadlock, but
--   it must not weaken payroll truth.
-- - Once the trigger promotes NEW.planning_status to published, the same
--   approval transaction must enforce the missing-badge guard against that
--   finalized baseline.

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

  if v_local_today <= v_week_end then
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

  if exists (
    select 1
    from public.time_entries t
    where t.restaurant_id = new.restaurant_id
      and t.business_date between new.week_start and v_week_end
      and t.status = 'open'
  ) then
    raise exception 'Resolve live badges before approving Actuals.';
  end if;

  if exists (
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

  if exists (
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

do $verify_actuals_guard$
declare
  v_definition text := pg_get_functiondef(
    'public.guard_actuals_approval()'::regprocedure
  );
begin
  if position('and new.planning_status = ''published''' in v_definition) = 0 then
    raise exception 'Actuals approval must check missing badges against finalized NEW planning status.';
  end if;
end
$verify_actuals_guard$;

commit;
