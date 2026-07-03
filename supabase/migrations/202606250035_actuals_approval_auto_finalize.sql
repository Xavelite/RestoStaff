-- Lifecycle deadlock fix: Actuals approval auto-finalizes a missing planning
-- baseline instead of dead-ending.
--
-- Replaces only the guard_actuals_approval() trigger body from 202606210021.
-- Every other check is reproduced verbatim.
--
-- The trap this removes:
-- - save_manager_planning hard-locks past weeks ('Past planning weeks are
--   locked.'), so a past week whose plan stayed draft can never be published.
-- - guard_actuals_approval then refused approval of a draft-plan week
--   ('Publish or remove the draft plan before approving Actuals.').
-- → A past draft-plan week could neither be published nor approved.
--
-- The fix (matches the agreed model — never silently mark old weeks published):
-- - This is a BEFORE UPDATE OF actuals_status trigger, so writing NEW folds the
--   finalize into the same approval UPDATE: no second write, no recursion.
-- - When the plan is still draft (and shifts exist), promote it to published and
--   record an audited `planning_finalized` event. No employee notification:
--   notifications key off `planning_published`, never `planning_finalized`.
-- - OLD.planning_status stays 'draft', so the published-only missing-badge check
--   below is intentionally skipped — auto-finalizing must not re-introduce a
--   block. All other approval guards (week ended, live badges, conflicts, audit
--   evidence) still apply unchanged.
-- - actor_employee_id is left null: this is a system/auto event keyed to the
--   approving profile.
--
-- Still open for a later Codex change (not required to clear the deadlock):
--   a manual "Finalize past week" path in save_manager_planning for owners who
--   want to finalize a baseline without approving Actuals yet.
--
-- Rollback: restore guard_actuals_approval() from 202606210021.
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

  -- Auto-finalize a missing planning baseline instead of dead-ending approval.
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
      and old.planning_status = 'published'
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

commit;
