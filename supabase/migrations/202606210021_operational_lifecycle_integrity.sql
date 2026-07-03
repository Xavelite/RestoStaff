-- Phase 4: Planning and Actuals lifecycle integrity.
--
-- Preconditions:
-- - Phase 3 migration 020 is applied.
-- - Planning and Actuals mutations are RPC-only.
-- - Existing work-week and time-entry data satisfies current lifecycle guards.
--
-- Rollback:
-- - Restore the prior RPC definitions and remove the new revision columns and
--   triggers only from a reviewed schema backup. Audit snapshots written after
--   this migration are historical evidence and must not be discarded.
begin;

set local lock_timeout = '5s';
set local statement_timeout = '2min';
select pg_advisory_xact_lock(
  hashtextextended('restogogo:202606210021:operational-lifecycle-integrity', 0)
);

do $phase4_preflight$
begin
  if exists (
    select 1
    from public.work_weeks w
    where w.actuals_status in ('approved', 'locked')
      and exists (
        select 1
        from public.time_entries t
        where t.restaurant_id = w.restaurant_id
          and t.business_date between w.week_start and w.week_start + 6
          and t.status = 'open'
      )
  ) then
    raise exception 'Approved Actuals contains open entries and must be repaired first.';
  end if;

  if exists (
    select 1
    from public.time_entries t
    where t.source = 'manager_manual'
      and not exists (
        select 1
        from public.time_entry_adjustments a
        where a.restaurant_id = t.restaurant_id
          and a.time_entry_id = t.id
          and a.action = 'manual_entry'
      )
  ) then
    raise exception 'A manager-created entry is missing its audit record.';
  end if;
end
$phase4_preflight$;

alter table public.work_weeks
  add column planning_revision bigint not null default 0,
  add column actuals_revision bigint not null default 0,
  add constraint work_weeks_planning_revision_nonnegative
    check (planning_revision >= 0),
  add constraint work_weeks_actuals_revision_nonnegative
    check (actuals_revision >= 0);

alter table public.time_entries
  add column revision bigint not null default 1,
  add constraint time_entries_revision_positive check (revision >= 1);

-- Keep stable row identities so linked Actuals entries survive ordinary draft
-- edits. Existing rows become revision 1; future mutations increment.
create or replace function public.advance_time_entry_revision()
returns trigger
language plpgsql
set search_path = public
as $advance_time_entry_revision$
begin
  if tg_op = 'UPDATE' then
    if new.restaurant_id is distinct from old.restaurant_id
        or new.employee_id is distinct from old.employee_id
        or new.business_date is distinct from old.business_date
        or new.service_key is distinct from old.service_key then
      raise exception 'Time-entry identity fields cannot be changed.';
    end if;
    new.revision := old.revision + 1;
  end if;
  return new;
end
$advance_time_entry_revision$;

create trigger time_entries_revision_guard
before update on public.time_entries
for each row execute function public.advance_time_entry_revision();

create or replace function public.guard_time_entry_history()
returns trigger
language plpgsql
set search_path = public
as $guard_time_entry_history$
declare
  v_restaurant_id uuid := case when tg_op = 'DELETE' then old.restaurant_id else new.restaurant_id end;
  v_business_date date := case when tg_op = 'DELETE' then old.business_date else new.business_date end;
  v_status public.actuals_status;
begin
  if tg_op = 'DELETE' then
    raise exception 'Time entries are historical evidence and cannot be deleted.';
  end if;

  select w.actuals_status into v_status
  from public.work_weeks w
  where w.restaurant_id = v_restaurant_id
    and w.week_start = public.week_start_for_date(v_business_date);

  if v_status in ('approved', 'locked') then
    raise exception 'Reopen this Actuals week before changing worked time.';
  end if;
  return new;
end
$guard_time_entry_history$;

create trigger time_entries_history_guard
before insert or update or delete on public.time_entries
for each row execute function public.guard_time_entry_history();

create or replace function public.bump_actuals_revision_for_entry()
returns trigger
language plpgsql
set search_path = public
as $bump_actuals_revision$
declare
  v_restaurant_id uuid := case when tg_op = 'DELETE' then old.restaurant_id else new.restaurant_id end;
  v_business_date date := case when tg_op = 'DELETE' then old.business_date else new.business_date end;
begin
  insert into public.work_weeks (
    restaurant_id,
    week_start,
    planning_status,
    actuals_status,
    actuals_revision
  )
  values (
    v_restaurant_id,
    public.week_start_for_date(v_business_date),
    'draft',
    'open',
    1
  )
  on conflict (restaurant_id, week_start) do update set
    actuals_revision = public.work_weeks.actuals_revision + 1,
    updated_at = now();
  return null;
end
$bump_actuals_revision$;

create trigger time_entries_actuals_revision
after insert or update or delete on public.time_entries
for each row execute function public.bump_actuals_revision_for_entry();

create or replace function public.reject_audit_evidence_mutation()
returns trigger
language plpgsql
set search_path = public
as $reject_audit_evidence_mutation$
begin
  raise exception '% is append-only operational evidence.', tg_table_name;
end
$reject_audit_evidence_mutation$;

create trigger work_week_events_append_only
before update or delete on public.work_week_events
for each row execute function public.reject_audit_evidence_mutation();

create trigger time_entry_adjustments_append_only
before update or delete on public.time_entry_adjustments
for each row execute function public.reject_audit_evidence_mutation();

-- Removing an employee or week must not cascade away payroll/planning truth.
alter table public.planned_shifts
  drop constraint planned_shifts_employee_fk,
  drop constraint planned_shifts_week_fk,
  add constraint planned_shifts_employee_fk
    foreign key (restaurant_id, employee_id)
    references public.employees(restaurant_id, id) on delete restrict,
  add constraint planned_shifts_week_fk
    foreign key (restaurant_id, week_start)
    references public.work_weeks(restaurant_id, week_start) on delete restrict;

alter table public.weekly_notes
  drop constraint weekly_notes_week_fk,
  add constraint weekly_notes_week_fk
    foreign key (restaurant_id, week_start)
    references public.work_weeks(restaurant_id, week_start) on delete restrict;

alter table public.work_week_events
  drop constraint work_week_events_week_fk,
  add constraint work_week_events_week_fk
    foreign key (restaurant_id, week_start)
    references public.work_weeks(restaurant_id, week_start) on delete restrict;

alter table public.time_entries
  drop constraint time_entries_employee_fk,
  add constraint time_entries_employee_fk
    foreign key (restaurant_id, employee_id)
    references public.employees(restaurant_id, id) on delete restrict;

alter table public.time_entry_adjustments
  drop constraint time_entry_adjustments_employee_fk,
  add constraint time_entry_adjustments_employee_fk
    foreign key (restaurant_id, employee_id)
    references public.employees(restaurant_id, id) on delete restrict;

create or replace function public.planning_snapshot_for_week(
  p_restaurant_id uuid,
  p_week_start date
)
returns jsonb
language sql
stable
security definer
set search_path = public
as $planning_snapshot$
  select jsonb_build_object(
    'shifts',
    coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'id', p.id,
            'employee_id', p.employee_id,
            'weekday', p.weekday,
            'service_key', p.service_key,
            'area_id', p.area_id,
            'job_function_id', p.job_function_id,
            'starts_at', p.starts_at,
            'ends_at', p.ends_at,
            'source', p.source
          )
          order by p.weekday, p.service_key, p.employee_id
        )
        from public.planned_shifts p
        where p.restaurant_id = p_restaurant_id
          and p.week_start = p_week_start
      ),
      '[]'::jsonb
    ),
    'notes',
    coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'weekday', n.weekday,
            'service_key', n.service_key,
            'note', n.note
          )
          order by n.weekday, n.service_key
        )
        from public.weekly_notes n
        where n.restaurant_id = p_restaurant_id
          and n.week_start = p_week_start
      ),
      '[]'::jsonb
    )
  )
$planning_snapshot$;

create or replace function public.actuals_snapshot_for_week(
  p_restaurant_id uuid,
  p_week_start date
)
returns jsonb
language sql
stable
security definer
set search_path = public
as $actuals_snapshot$
  select jsonb_build_object(
    'entries',
    coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'id', t.id,
            'revision', t.revision,
            'employee_id', t.employee_id,
            'business_date', t.business_date,
            'service_key', t.service_key,
            'planned_shift_id', t.planned_shift_id,
            'clock_in_at', t.clock_in_at,
            'clock_out_at', t.clock_out_at,
            'break_minutes', t.break_minutes,
            'source', t.source,
            'status', t.status,
            'adjusted_at', t.adjusted_at,
            'adjustment_reason', t.adjustment_reason,
            'cancelled_at', t.cancelled_at,
            'cancellation_reason', t.cancellation_reason
          )
          order by t.business_date, t.service_key, t.employee_id, t.created_at
        )
        from public.time_entries t
        where t.restaurant_id = p_restaurant_id
          and t.business_date between p_week_start and p_week_start + 6
      ),
      '[]'::jsonb
    ),
    'entry_count',
    (
      select count(*)
      from public.time_entries t
      where t.restaurant_id = p_restaurant_id
        and t.business_date between p_week_start and p_week_start + 6
        and t.status <> 'cancelled'
    ),
    'worked_minutes',
    coalesce(
      (
        select sum(
          greatest(
            0,
            extract(epoch from (t.clock_out_at - t.clock_in_at)) / 60
              - t.break_minutes
          )
        )::bigint
        from public.time_entries t
        where t.restaurant_id = p_restaurant_id
          and t.business_date between p_week_start and p_week_start + 6
          and t.status in ('closed', 'adjusted')
      ),
      0
    )
  )
$actuals_snapshot$;

create or replace function public.planning_publish_issues(
  p_restaurant_id uuid,
  p_week_start date,
  p_planned_shifts jsonb
)
returns jsonb
language sql
stable
security definer
set search_path = public
as $planning_publish_issues$
  with shifts as (
    select
      nullif(value->>'employee_id', '')::uuid as employee_id,
      nullif(value->>'weekday', '')::smallint as weekday,
      lower(btrim(value->>'service_key')) as service_key,
      nullif(value->>'area_id', '')::uuid as area_id,
      nullif(value->>'job_function_id', '')::uuid as job_function_id
    from jsonb_array_elements(coalesce(p_planned_shifts, '[]'::jsonb))
  ),
  shift_conflicts as (
    select jsonb_build_object(
      'kind', 'employee_conflict',
      'employee_id', s.employee_id,
      'date', p_week_start + (s.weekday - 1),
      'service_key', s.service_key
    ) as issue
    from shifts s
    where exists (
      select 1
      from public.absences a
      where a.restaurant_id = p_restaurant_id
        and a.employee_id = s.employee_id
        and a.status in ('pending', 'approved')
        and p_week_start + (s.weekday - 1) between a.start_date and a.end_date
        and (a.service_key is null or a.service_key = s.service_key)
    )
    or exists (
      select 1
      from public.work_pattern_exceptions e
      where e.restaurant_id = p_restaurant_id
        and e.employee_id = s.employee_id
        and e.status in ('pending', 'approved')
        and p_week_start + (s.weekday - 1) between e.start_date and e.end_date
        and (e.service_key is null or e.service_key = s.service_key)
    )
    or exists (
      select 1
      from public.employee_availability_slots a
      where a.restaurant_id = p_restaurant_id
        and a.employee_id = s.employee_id
        and a.week_start = p_week_start
        and a.weekday = s.weekday
        and a.service_key = s.service_key
        and a.availability_state = 'unavailable'
    )
  ),
  applicable_requirements as (
    select
      o.weekday,
      o.service_key,
      r.area_id,
      r.job_function_id,
      r.required_count
    from public.opening_hours o
    cross join lateral (
      select distinct on (c.area_id, c.job_function_id)
        c.area_id,
        c.job_function_id,
        c.required_count
      from public.coverage_requirements c
      where c.restaurant_id = o.restaurant_id
        and c.service_key = o.service_key
        and c.active
        and c.required_count > 0
        and (c.weekday = o.weekday or c.weekday is null)
      order by
        c.area_id,
        c.job_function_id,
        (c.weekday = o.weekday) desc,
        c.sort_order,
        c.id
    ) r
    where o.restaurant_id = p_restaurant_id
      and o.is_open
  ),
  coverage_gaps as (
    select jsonb_build_object(
      'kind', 'coverage_gap',
      'date', p_week_start + (r.weekday - 1),
      'service_key', r.service_key,
      'area_id', r.area_id,
      'job_function_id', r.job_function_id,
      'required', r.required_count,
      'planned', count(s.employee_id),
      'missing', r.required_count - count(s.employee_id)
    ) as issue
    from applicable_requirements r
    left join shifts s
      on s.weekday = r.weekday
     and s.service_key = r.service_key
     and s.area_id = r.area_id
     and s.job_function_id = r.job_function_id
    group by
      r.weekday,
      r.service_key,
      r.area_id,
      r.job_function_id,
      r.required_count
    having count(s.employee_id) < r.required_count
  )
  select coalesce(
    jsonb_agg(issue),
    '[]'::jsonb
  )
  from (
    select issue from shift_conflicts
    union all
    select issue from coverage_gaps
  ) all_issues
$planning_publish_issues$;

drop function public.save_manager_planning(
  uuid,date,text,jsonb,jsonb,timestamptz
);

create function public.save_manager_planning(
  p_restaurant_id uuid,
  p_week_start date,
  p_planning_status text default 'draft',
  p_planned_shifts jsonb default '[]'::jsonb,
  p_weekly_notes jsonb default '[]'::jsonb,
  p_expected_revision bigint default null,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $planning_lifecycle$
declare
  v_actor record;
  v_current public.work_weeks%rowtype;
  v_status_text text := lower(btrim(coalesce(p_planning_status, 'draft')));
  v_status public.planning_status;
  v_reason text := btrim(coalesce(p_reason, ''));
  v_timezone text;
  v_local_week date;
  v_previous_snapshot jsonb;
  v_new_snapshot jsonb;
  v_issues jsonb;
  v_next_revision bigint;
begin
  select * into v_actor
  from public.require_owner_or_manager_context(p_restaurant_id)
  limit 1;

  if p_week_start is null or extract(isodow from p_week_start) <> 1 then
    raise exception 'Planning week must start on Monday.';
  end if;
  if jsonb_typeof(coalesce(p_planned_shifts, '[]'::jsonb)) <> 'array'
      or jsonb_typeof(coalesce(p_weekly_notes, '[]'::jsonb)) <> 'array' then
    raise exception 'Planning shifts and notes must be arrays.';
  end if;
  if v_status_text not in ('draft', 'published') then
    raise exception 'Invalid planning status.';
  end if;
  v_status := v_status_text::public.planning_status;

  select coalesce(nullif(btrim(s.timezone), ''), 'Europe/Brussels')
  into v_timezone
  from public.restaurant_settings s
  where s.restaurant_id = p_restaurant_id;
  v_local_week := public.week_start_for_date(
    (now() at time zone coalesce(v_timezone, 'Europe/Brussels'))::date
  );
  if p_week_start < v_local_week then
    raise exception 'Past planning weeks are locked.';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(
      p_restaurant_id::text || ':planning:' || p_week_start::text,
      0
    )
  );

  select * into v_current
  from public.work_weeks w
  where w.restaurant_id = p_restaurant_id
    and w.week_start = p_week_start
  for update;

  if v_current.restaurant_id is not null then
    if p_expected_revision is null then
      raise exception 'CONFLICT: Planning revision is required. Reload before saving.';
    end if;
    if v_current.planning_revision <> p_expected_revision then
      raise exception 'CONFLICT: This planning week changed in another session. Reload before saving.';
    end if;
    if v_current.actuals_status in ('approved', 'locked') then
      raise exception 'Planning is locked because Actuals are %.', v_current.actuals_status;
    end if;
    if v_current.planning_status = 'published' and v_status = 'published' then
      raise exception 'Revert the published plan to draft before changing it.';
    end if;
  elsif p_expected_revision is not null and p_expected_revision <> 0 then
    raise exception 'CONFLICT: This planning week no longer matches the current state.';
  end if;

  if exists (
    select 1
    from (
      select
        nullif(value->>'employee_id', '')::uuid as employee_id,
        nullif(value->>'weekday', '')::smallint as weekday,
        lower(btrim(value->>'service_key')) as service_key,
        count(*) as duplicates
      from jsonb_array_elements(coalesce(p_planned_shifts, '[]'::jsonb))
      group by 1, 2, 3
      having count(*) > 1
    ) duplicate_slots
  ) then
    raise exception 'An employee can have only one shift per service slot.';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(coalesce(p_planned_shifts, '[]'::jsonb)) item
    left join public.employees e
      on e.restaurant_id = p_restaurant_id
     and e.id = nullif(item->>'employee_id', '')::uuid
     and e.active
    left join public.services s
      on s.restaurant_id = p_restaurant_id
     and s.service_key = lower(btrim(item->>'service_key'))
     and s.active
    where e.id is null
       or s.service_key is null
       or nullif(item->>'weekday', '')::smallint not between 1 and 7
  ) then
    raise exception 'Planning contains an invalid employee, weekday or service.';
  end if;

  if v_status = 'published' then
    if length(v_reason) < 3 then
      raise exception 'A publication reason of at least 3 characters is required.';
    end if;
    if exists (
      select 1
      from jsonb_array_elements(coalesce(p_planned_shifts, '[]'::jsonb)) item
      left join public.work_areas a
        on a.restaurant_id = p_restaurant_id
       and a.id = nullif(item->>'area_id', '')::uuid
       and a.active
      left join public.job_functions j
        on j.restaurant_id = p_restaurant_id
       and j.id = nullif(item->>'job_function_id', '')::uuid
       and j.active
      left join public.employee_job_functions assignment
        on assignment.restaurant_id = p_restaurant_id
       and assignment.employee_id = nullif(item->>'employee_id', '')::uuid
       and assignment.job_function_id = nullif(item->>'job_function_id', '')::uuid
       and assignment.active
      left join public.opening_hours o
        on o.restaurant_id = p_restaurant_id
       and o.weekday = nullif(item->>'weekday', '')::smallint
       and o.service_key = lower(btrim(item->>'service_key'))
       and o.is_open
      where a.id is null
         or j.id is null
         or assignment.employee_id is null
         or o.id is null
         or nullif(item->>'starts_at', '')::time is null
         or nullif(item->>'ends_at', '')::time is null
         or nullif(item->>'starts_at', '')::time
              = nullif(item->>'ends_at', '')::time
    ) then
      raise exception 'Published shifts require an open service, active area, assigned position and valid times.';
    end if;

    v_issues := public.planning_publish_issues(
      p_restaurant_id,
      p_week_start,
      p_planned_shifts
    );
    if jsonb_array_length(v_issues) > 0 then
      raise exception 'Resolve planning conflicts and coverage gaps before publishing.';
    end if;
  elsif v_current.planning_status = 'published' and length(v_reason) < 3 then
    raise exception 'A revert reason of at least 3 characters is required.';
  end if;

  v_previous_snapshot := case
    when v_current.restaurant_id is null then
      jsonb_build_object('shifts', '[]'::jsonb, 'notes', '[]'::jsonb)
    else public.planning_snapshot_for_week(p_restaurant_id, p_week_start)
  end;
  v_next_revision := coalesce(v_current.planning_revision, 0) + 1;

  insert into public.work_weeks (
    restaurant_id,
    week_start,
    planning_status,
    published_at,
    published_by_profile_id,
    planning_revision
  )
  values (
    p_restaurant_id,
    p_week_start,
    v_status,
    case when v_status = 'published' then now() end,
    case when v_status = 'published' then v_actor.profile_id end,
    v_next_revision
  )
  on conflict (restaurant_id, week_start) do update set
    planning_status = excluded.planning_status,
    published_at = case
      when excluded.planning_status = 'published' then excluded.published_at
      when public.work_weeks.planning_status = 'published' then null
      else public.work_weeks.published_at
    end,
    published_by_profile_id = case
      when excluded.planning_status = 'published'
        then excluded.published_by_profile_id
      when public.work_weeks.planning_status = 'published' then null
      else public.work_weeks.published_by_profile_id
    end,
    planning_revision = excluded.planning_revision,
    updated_at = now();

  -- Reverting changes lifecycle state only. The published plan remains intact
  -- until the next explicit draft save.
  if not (
    v_current.restaurant_id is not null
    and v_current.planning_status = 'published'
    and v_status = 'draft'
  ) then
    insert into public.planned_shifts (
      restaurant_id,
      week_start,
      employee_id,
      weekday,
      service_key,
      area_id,
      job_function_id,
      starts_at,
      ends_at,
      source
    )
    select
      p_restaurant_id,
      p_week_start,
      nullif(value->>'employee_id', '')::uuid,
      nullif(value->>'weekday', '')::smallint,
      lower(btrim(value->>'service_key')),
      nullif(value->>'area_id', '')::uuid,
      nullif(value->>'job_function_id', '')::uuid,
      nullif(value->>'starts_at', '')::time,
      nullif(value->>'ends_at', '')::time,
      coalesce(
        nullif(value->>'source', ''),
        'manual'
      )::public.planned_shift_source
    from jsonb_array_elements(coalesce(p_planned_shifts, '[]'::jsonb))
    on conflict (
      restaurant_id, week_start, employee_id, weekday, service_key
    ) do update set
      area_id = excluded.area_id,
      job_function_id = excluded.job_function_id,
      starts_at = excluded.starts_at,
      ends_at = excluded.ends_at,
      source = excluded.source,
      updated_at = now();

    delete from public.planned_shifts existing
    where existing.restaurant_id = p_restaurant_id
      and existing.week_start = p_week_start
      and not exists (
        select 1
        from jsonb_array_elements(coalesce(p_planned_shifts, '[]'::jsonb)) item
        where nullif(item->>'employee_id', '')::uuid = existing.employee_id
          and nullif(item->>'weekday', '')::smallint = existing.weekday
          and lower(btrim(item->>'service_key')) = existing.service_key
      );

    insert into public.weekly_notes (
      restaurant_id,
      week_start,
      weekday,
      service_key,
      note
    )
    select
      p_restaurant_id,
      p_week_start,
      nullif(value->>'weekday', '')::smallint,
      lower(btrim(value->>'service_key')),
      btrim(value->>'note')
    from jsonb_array_elements(coalesce(p_weekly_notes, '[]'::jsonb))
    where nullif(btrim(value->>'note'), '') is not null
    on conflict (
      restaurant_id, week_start, weekday, service_key
    ) do update set
      note = excluded.note,
      updated_at = now();

    delete from public.weekly_notes existing
    where existing.restaurant_id = p_restaurant_id
      and existing.week_start = p_week_start
      and not exists (
        select 1
        from jsonb_array_elements(coalesce(p_weekly_notes, '[]'::jsonb)) item
        where nullif(item->>'weekday', '')::smallint = existing.weekday
          and lower(btrim(item->>'service_key')) = existing.service_key
          and nullif(btrim(item->>'note'), '') is not null
      );
  end if;

  v_new_snapshot := public.planning_snapshot_for_week(
    p_restaurant_id,
    p_week_start
  );

  if coalesce(v_current.planning_status, 'draft') <> v_status then
    insert into public.work_week_events (
      restaurant_id,
      week_start,
      event_type,
      actor_profile_id,
      actor_employee_id,
      actor_role,
      reason,
      previous_values,
      new_values,
      metadata
    )
    values (
      p_restaurant_id,
      p_week_start,
      case
        when v_status = 'published' then 'planning_published'
        else 'planning_reverted'
      end,
      v_actor.profile_id,
      v_actor.employee_id,
      public.active_membership_role(p_restaurant_id, v_actor.profile_id),
      v_reason,
      jsonb_build_object(
        'planning_status', coalesce(v_current.planning_status, 'draft'),
        'planning_revision', coalesce(v_current.planning_revision, 0),
        'planning', v_previous_snapshot
      ),
      jsonb_build_object(
        'planning_status', v_status,
        'planning_revision', v_next_revision,
        'planning', v_new_snapshot
      ),
      jsonb_build_object(
        'shift_count', jsonb_array_length(v_new_snapshot->'shifts'),
        'note_count', jsonb_array_length(v_new_snapshot->'notes')
      )
    );
  end if;

  return jsonb_build_object(
    'runtime_snapshot',
    public.workspace_runtime_snapshot_for_current_context(p_restaurant_id)
  );
end
$planning_lifecycle$;

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

  if old.planning_status = 'draft'
      and exists (
        select 1
        from public.planned_shifts p
        where p.restaurant_id = new.restaurant_id
          and p.week_start = new.week_start
      ) then
    raise exception 'Publish or remove the draft plan before approving Actuals.';
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
  v_actor_role text;
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
  v_expected_revision bigint;
  v_entry public.time_entries%rowtype;
  v_after public.time_entries%rowtype;
  v_week public.work_weeks%rowtype;
  v_after_week public.work_weeks%rowtype;
  v_local_today date;
  v_timezone text;
  v_planned_shift_id uuid;
  v_new_status public.time_entry_status;
  v_actuals_snapshot jsonb;
begin
  select * into v_actor
  from public.require_owner_or_manager_context(p_restaurant_id)
  limit 1;
  v_actor_role := public.active_membership_role(
    p_restaurant_id,
    v_actor.profile_id
  );

  if v_action not in (
    'manual_entry', 'adjust_entry', 'cancel_entry',
    'approve_week', 'reopen_week'
  ) then
    raise exception 'Unsupported Actuals action.';
  end if;
  if jsonb_typeof(coalesce(p_payload, '{}'::jsonb)) <> 'object' then
    raise exception 'Actuals payload must be an object.';
  end if;
  if length(v_reason) < 3 then
    raise exception 'A manager reason of at least 3 characters is required.';
  end if;

  select coalesce(nullif(btrim(s.timezone), ''), 'Europe/Brussels')
  into v_timezone
  from public.restaurant_settings s
  where s.restaurant_id = p_restaurant_id;
  v_timezone := coalesce(v_timezone, 'Europe/Brussels');
  v_local_today := (now() at time zone v_timezone)::date;

  if v_action in ('manual_entry', 'adjust_entry', 'cancel_entry') then
    v_entry_id := nullif(p_payload->>'time_entry_id', '')::uuid;

    if v_action in ('adjust_entry', 'cancel_entry') then
      if v_entry_id is null then
        raise exception 'A time entry is required.';
      end if;
      v_expected_revision := nullif(p_payload->>'expected_revision', '')::bigint;
      if v_expected_revision is null then
        raise exception 'CONFLICT: Time-entry revision is required. Reload before saving.';
      end if;

      select * into v_entry
      from public.time_entries t
      where t.restaurant_id = p_restaurant_id
        and t.id = v_entry_id
      for update;

      if v_entry.id is null then raise exception 'Time entry not found.'; end if;
      if v_entry.status = 'cancelled' then
        raise exception 'Cancelled time entries cannot be changed.';
      end if;
      if v_entry.revision <> v_expected_revision then
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
        select 1
        from public.employees e
        where e.restaurant_id = p_restaurant_id
          and e.id = v_employee_id
          and e.active
      ) then
        raise exception 'Active employee required.';
      end if;
      if not exists (
        select 1
        from public.services s
        where s.restaurant_id = p_restaurant_id
          and s.service_key = v_service_key
          and s.active
      ) then
        raise exception 'Select an active service.';
      end if;
      if exists (
        select 1
        from public.time_entries t
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
    perform pg_advisory_xact_lock(
      hashtextextended(
        p_restaurant_id::text || ':actuals:' || v_week_start::text,
        0
      )
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
          'revision', v_entry.revision,
          'clock_in_at', v_entry.clock_in_at,
          'clock_out_at', v_entry.clock_out_at,
          'break_minutes', v_entry.break_minutes,
          'status', v_entry.status,
          'updated_at', v_entry.updated_at
        ),
        jsonb_build_object(
          'revision', v_after.revision,
          'clock_in_at', v_after.clock_in_at,
          'clock_out_at', v_after.clock_out_at,
          'break_minutes', v_after.break_minutes,
          'status', v_after.status,
          'updated_at', v_after.updated_at
        ),
        v_reason,
        v_actor.profile_id, v_actor.employee_id, v_actor_role
      );
    else
      v_clock_in := nullif(p_payload->>'clock_in_at', '')::timestamptz;
      v_clock_out := nullif(p_payload->>'clock_out_at', '')::timestamptz;
      v_break_minutes := coalesce(
        nullif(p_payload->>'break_minutes', '')::integer,
        case when v_action = 'adjust_entry' then v_entry.break_minutes else 0 end
      );

      if v_clock_in is null then raise exception 'Clock-in is required.'; end if;
      if v_clock_out is not null and v_clock_out <= v_clock_in then
        raise exception 'Clock-out must be after clock-in.';
      end if;
      if v_break_minutes < 0 then raise exception 'Break cannot be negative.'; end if;
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

      v_new_status := case
        when v_clock_out is null then 'open'::public.time_entry_status
        else 'adjusted'::public.time_entry_status
      end;

      if v_action = 'manual_entry' then
        select p.id into v_planned_shift_id
        from public.planned_shifts p
        where p.restaurant_id = p_restaurant_id
          and p.week_start = v_week_start
          and p.employee_id = v_employee_id
          and p.weekday = extract(isodow from v_business_date)
          and p.service_key = v_service_key
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
          'manager_manual', v_new_status, now(), v_actor.profile_id, v_reason
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
            'revision', v_after.revision,
            'clock_in_at', v_after.clock_in_at,
            'clock_out_at', v_after.clock_out_at,
            'break_minutes', v_after.break_minutes,
            'status', v_after.status,
            'source', v_after.source,
            'updated_at', v_after.updated_at
          ),
          v_reason,
          v_actor.profile_id, v_actor.employee_id, v_actor_role
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
            'revision', v_entry.revision,
            'clock_in_at', v_entry.clock_in_at,
            'clock_out_at', v_entry.clock_out_at,
            'break_minutes', v_entry.break_minutes,
            'status', v_entry.status,
            'updated_at', v_entry.updated_at
          ),
          jsonb_build_object(
            'revision', v_after.revision,
            'clock_in_at', v_after.clock_in_at,
            'clock_out_at', v_after.clock_out_at,
            'break_minutes', v_after.break_minutes,
            'status', v_after.status,
            'updated_at', v_after.updated_at
          ),
          v_reason,
          v_actor.profile_id, v_actor.employee_id, v_actor_role
        );
      end if;
    end if;
  else
    v_week_start := nullif(p_payload->>'week_start', '')::date;
    if v_week_start is null or extract(isodow from v_week_start) <> 1 then
      raise exception 'Actuals week must start on Monday.';
    end if;
    v_expected_revision := nullif(p_payload->>'expected_revision', '')::bigint;
    if v_expected_revision is null then
      raise exception 'CONFLICT: Actuals revision is required. Reload before continuing.';
    end if;

    perform pg_advisory_xact_lock(
      hashtextextended(
        p_restaurant_id::text || ':actuals:' || v_week_start::text,
        0
      )
    );

    select * into v_week
    from public.work_weeks w
    where w.restaurant_id = p_restaurant_id
      and w.week_start = v_week_start
    for update;

    if v_week.restaurant_id is null then
      if v_expected_revision <> 0 then
        raise exception 'CONFLICT: This Actuals week no longer matches the current state.';
      end if;
      insert into public.work_weeks (
        restaurant_id, week_start, planning_status, actuals_status
      )
      values (p_restaurant_id, v_week_start, 'draft', 'open')
      returning * into v_week;
    elsif v_week.actuals_revision <> v_expected_revision then
      raise exception 'CONFLICT: This Actuals week changed in another session. Reload before continuing.';
    end if;

    if v_action = 'approve_week' then
      if v_week.actuals_status <> 'open' then
        raise exception 'Only an open Actuals week can be approved.';
      end if;
      v_actuals_snapshot := public.actuals_snapshot_for_week(
        p_restaurant_id,
        v_week_start
      );

      update public.work_weeks
      set actuals_status = 'approved',
          actuals_approved_at = now(),
          actuals_approved_by_profile_id = v_actor.profile_id,
          actuals_reopened_at = null,
          actuals_reopened_by_profile_id = null,
          actuals_revision = actuals_revision + 1,
          updated_at = now()
      where restaurant_id = p_restaurant_id
        and week_start = v_week_start
      returning * into v_after_week;

      insert into public.work_week_events (
        restaurant_id, week_start, event_type, actor_profile_id,
        actor_employee_id, actor_role, reason, previous_values,
        new_values, metadata
      )
      values (
        p_restaurant_id, v_week_start, 'actuals_approved',
        v_actor.profile_id, v_actor.employee_id, v_actor_role, v_reason,
        jsonb_build_object(
          'actuals_status', v_week.actuals_status,
          'actuals_revision', v_week.actuals_revision
        ),
        jsonb_build_object(
          'actuals_status', 'approved',
          'actuals_revision', v_after_week.actuals_revision,
          'actuals', v_actuals_snapshot
        ),
        jsonb_build_object(
          'entry_count', v_actuals_snapshot->'entry_count',
          'worked_minutes', v_actuals_snapshot->'worked_minutes'
        )
      );
    else
      if v_week.actuals_status <> 'approved' then
        raise exception 'Only an approved Actuals week can be reopened.';
      end if;
      v_actuals_snapshot := public.actuals_snapshot_for_week(
        p_restaurant_id,
        v_week_start
      );

      update public.work_weeks
      set actuals_status = 'open',
          actuals_reopened_at = now(),
          actuals_reopened_by_profile_id = v_actor.profile_id,
          actuals_revision = actuals_revision + 1,
          updated_at = now()
      where restaurant_id = p_restaurant_id
        and week_start = v_week_start
      returning * into v_after_week;

      insert into public.work_week_events (
        restaurant_id, week_start, event_type, actor_profile_id,
        actor_employee_id, actor_role, reason, previous_values,
        new_values, metadata
      )
      values (
        p_restaurant_id, v_week_start, 'actuals_reopened',
        v_actor.profile_id, v_actor.employee_id, v_actor_role, v_reason,
        jsonb_build_object(
          'actuals_status', v_week.actuals_status,
          'actuals_revision', v_week.actuals_revision,
          'approved_actuals', v_actuals_snapshot
        ),
        jsonb_build_object(
          'actuals_status', 'open',
          'actuals_revision', v_after_week.actuals_revision
        ),
        '{}'::jsonb
      );
    end if;
  end if;

  return jsonb_build_object(
    'runtime_snapshot',
    public.workspace_runtime_snapshot_for_current_context(p_restaurant_id)
  );
end
$actuals_lifecycle$;

revoke all on function public.advance_time_entry_revision()
  from public, anon, authenticated;
revoke all on function public.guard_time_entry_history()
  from public, anon, authenticated;
revoke all on function public.bump_actuals_revision_for_entry()
  from public, anon, authenticated;
revoke all on function public.reject_audit_evidence_mutation()
  from public, anon, authenticated;
revoke all on function public.planning_snapshot_for_week(uuid,date)
  from public, anon, authenticated;
revoke all on function public.actuals_snapshot_for_week(uuid,date)
  from public, anon, authenticated;
revoke all on function public.planning_publish_issues(uuid,date,jsonb)
  from public, anon, authenticated;

revoke all on function public.save_manager_planning(
  uuid,date,text,jsonb,jsonb,bigint,text
) from public, anon, authenticated;
grant execute on function public.save_manager_planning(
  uuid,date,text,jsonb,jsonb,bigint,text
) to authenticated;

revoke all on function public.save_actuals_lifecycle(uuid,text,jsonb)
  from public, anon, authenticated;
grant execute on function public.save_actuals_lifecycle(uuid,text,jsonb)
  to authenticated;

commit;
