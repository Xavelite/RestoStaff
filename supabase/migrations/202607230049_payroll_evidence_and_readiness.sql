-- V568: exact payroll evidence and server-side readiness checks.
begin;

alter table public.time_entries
  add column actual_job_function_id uuid,
  add column actual_area_id uuid,
  add column actual_assignment_source text not null default 'unresolved',
  add constraint time_entries_actual_job_function_fk
    foreign key (restaurant_id, actual_job_function_id)
      references public.job_functions(restaurant_id, id) on delete restrict,
  add constraint time_entries_actual_area_fk
    foreign key (restaurant_id, actual_area_id)
      references public.work_areas(restaurant_id, id) on delete restrict,
  add constraint time_entries_actual_assignment_source_check check (
    actual_assignment_source in ('planned_shift', 'manager', 'unresolved')
  );

update public.time_entries t
set actual_job_function_id = p.job_function_id,
    actual_area_id = p.area_id,
    actual_assignment_source = case
      when p.job_function_id is not null or p.area_id is not null then 'planned_shift'
      else 'unresolved'
    end
from public.planned_shifts p
where p.restaurant_id = t.restaurant_id
  and p.id = t.planned_shift_id;

create function public.enrich_time_entry_actual_assignment()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_shift public.planned_shifts%rowtype;
begin
  if new.actual_assignment_source = 'manager' then
    return new;
  end if;
  if new.planned_shift_id is not null then
    select * into v_shift
    from public.planned_shifts p
    where p.restaurant_id = new.restaurant_id and p.id = new.planned_shift_id;
    if v_shift.id is not null then
      new.actual_job_function_id := coalesce(new.actual_job_function_id, v_shift.job_function_id);
      new.actual_area_id := coalesce(new.actual_area_id, v_shift.area_id);
      if new.actual_job_function_id is not null or new.actual_area_id is not null then
        new.actual_assignment_source := 'planned_shift';
      end if;
    end if;
  end if;
  return new;
end
$$;

create trigger time_entries_actual_assignment
before insert or update of planned_shift_id, actual_job_function_id, actual_area_id
on public.time_entries
for each row execute function public.enrich_time_entry_actual_assignment();

create table public.time_entry_break_intervals (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null,
  time_entry_id uuid not null,
  entry_revision bigint not null,
  break_started_at timestamptz,
  break_ended_at timestamptz,
  duration_seconds integer not null,
  evidence_kind text not null,
  source text not null,
  active boolean not null default true,
  superseded_at timestamptz,
  created_by_profile_id uuid,
  created_at timestamptz not null default now(),
  constraint time_entry_break_intervals_entry_fk
    foreign key (restaurant_id, time_entry_id)
      references public.time_entries(restaurant_id, id) on delete restrict,
  constraint time_entry_break_intervals_actor_fk
    foreign key (created_by_profile_id) references public.profiles(id) on delete restrict,
  constraint time_entry_break_intervals_restaurant_id_id_key unique (restaurant_id, id),
  constraint time_entry_break_intervals_duration_check check (duration_seconds >= 0),
  constraint time_entry_break_intervals_kind_check
    check (evidence_kind in ('exact', 'aggregate_only')),
  constraint time_entry_break_intervals_source_check
    check (source in ('badge_terminal', 'manager_adjustment', 'legacy')),
  constraint time_entry_break_intervals_timestamp_check check (
    (evidence_kind = 'exact'
      and break_started_at is not null
      and break_ended_at is not null
      and break_ended_at > break_started_at
      and duration_seconds = floor(extract(epoch from (break_ended_at - break_started_at)))::integer)
    or
    (evidence_kind = 'aggregate_only'
      and break_started_at is null
      and break_ended_at is null)
  )
);

create index time_entry_break_intervals_entry_idx
  on public.time_entry_break_intervals (restaurant_id, time_entry_id, active, created_at);

insert into public.time_entry_break_intervals (
  restaurant_id, time_entry_id, entry_revision, duration_seconds,
  evidence_kind, source, active, created_at
)
select
  t.restaurant_id, t.id, t.revision, t.break_minutes * 60,
  'aggregate_only', 'legacy', true, t.updated_at
from public.time_entries t
where t.break_minutes > 0;

create function public.guard_time_entry_break_history()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'Break evidence is append-only.';
  end if;
  if row(new.active, new.superseded_at) is distinct from row(old.active, old.superseded_at)
      and row(
        new.id, new.restaurant_id, new.time_entry_id, new.entry_revision,
        new.break_started_at, new.break_ended_at, new.duration_seconds,
        new.evidence_kind, new.source, new.created_by_profile_id, new.created_at
      ) is not distinct from row(
        old.id, old.restaurant_id, old.time_entry_id, old.entry_revision,
        old.break_started_at, old.break_ended_at, old.duration_seconds,
        old.evidence_kind, old.source, old.created_by_profile_id, old.created_at
      ) then
    if old.active = false and new.active then
      raise exception 'Superseded break evidence cannot be reactivated.';
    end if;
    return new;
  end if;
  raise exception 'Break evidence is immutable; supersede it with a new record.';
end
$$;

create trigger time_entry_break_intervals_history_guard
before update or delete on public.time_entry_break_intervals
for each row execute function public.guard_time_entry_break_history();

create function public.capture_time_entry_break_evidence()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := public.current_profile_id();
  v_exact_resume boolean := false;
begin
  if tg_op = 'INSERT' then
    if new.break_minutes > 0 then
      insert into public.time_entry_break_intervals (
        restaurant_id, time_entry_id, entry_revision, duration_seconds,
        evidence_kind, source, created_by_profile_id
      ) values (
        new.restaurant_id, new.id, new.revision, new.break_minutes * 60,
        'aggregate_only', 'manager_adjustment', v_actor
      );
    end if;
    return null;
  end if;

  v_exact_resume := old.status = 'closed'
    and new.status = 'open'
    and old.clock_out_at is not null
    and new.clock_out_at is null
    and new.source = 'badge_terminal'
    and new.updated_at > old.clock_out_at;

  if v_exact_resume then
    insert into public.time_entry_break_intervals (
      restaurant_id, time_entry_id, entry_revision,
      break_started_at, break_ended_at, duration_seconds,
      evidence_kind, source, created_by_profile_id
    ) values (
      new.restaurant_id,
      new.id,
      new.revision,
      old.clock_out_at,
      new.updated_at,
      floor(extract(epoch from (new.updated_at - old.clock_out_at)))::integer,
      'exact',
      'badge_terminal',
      v_actor
    );
  elsif new.break_minutes is distinct from old.break_minutes then
    update public.time_entry_break_intervals
    set active = false, superseded_at = now()
    where restaurant_id = new.restaurant_id
      and time_entry_id = new.id
      and active;
    if new.break_minutes > 0 then
      insert into public.time_entry_break_intervals (
        restaurant_id, time_entry_id, entry_revision, duration_seconds,
        evidence_kind, source, created_by_profile_id
      ) values (
        new.restaurant_id, new.id, new.revision, new.break_minutes * 60,
        'aggregate_only', 'manager_adjustment', v_actor
      );
    end if;
  end if;
  return null;
end
$$;

create trigger time_entries_break_evidence
after insert or update of break_minutes, clock_out_at, status on public.time_entries
for each row execute function public.capture_time_entry_break_evidence();

create table public.payroll_readiness_acceptances (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null,
  period_start date not null,
  period_end date not null,
  employee_id uuid,
  warning_code text not null,
  reason text not null,
  accepted_by_profile_id uuid not null,
  accepted_at timestamptz not null default now(),
  constraint payroll_readiness_acceptances_restaurant_fk
    foreign key (restaurant_id) references public.restaurants(id) on delete restrict,
  constraint payroll_readiness_acceptances_employee_fk
    foreign key (restaurant_id, employee_id)
      references public.employees(restaurant_id, id) on delete restrict,
  constraint payroll_readiness_acceptances_actor_fk
    foreign key (accepted_by_profile_id) references public.profiles(id) on delete restrict,
  constraint payroll_readiness_acceptances_period_check
    check (period_end >= period_start),
  constraint payroll_readiness_acceptances_reason_check
    check (length(btrim(reason)) >= 8)
);

create trigger payroll_readiness_acceptances_append_only
before update or delete on public.payroll_readiness_acceptances
for each row execute function public.reject_audit_evidence_mutation();

create function public.payroll_readiness_report(
  p_restaurant_id uuid,
  p_period_start date,
  p_period_end date
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_blockers jsonb;
  v_warnings jsonb;
begin
  if not public.is_owner(p_restaurant_id) then
    raise exception 'Only an owner can review payroll readiness.';
  end if;
  if p_period_start is null or p_period_end is null or p_period_end < p_period_start
      or p_period_end - p_period_start > 370 then
    raise exception 'A valid payroll period of at most 371 days is required.';
  end if;

  with issues as (
    select
      'WEEK_NOT_APPROVED'::text as code,
      null::uuid as employee_id,
      w.week_start::text as evidence,
      'Approve every Timesheet week touching this payroll period.'::text as message
    from generate_series(
      public.week_start_for_date(p_period_start)::timestamp,
      public.week_start_for_date(p_period_end)::timestamp,
      interval '7 days'
    ) d
    left join public.work_weeks w
      on w.restaurant_id = p_restaurant_id and w.week_start = d::date
    where w.week_start is null or w.actuals_status not in ('approved', 'locked')

    union all
    select 'OPEN_TIME_ENTRY', t.employee_id, t.id::text,
      'Close or cancel every live time entry before payroll.'
    from public.time_entries t
    where t.restaurant_id = p_restaurant_id
      and t.business_date between p_period_start and p_period_end
      and t.status = 'open'

    union all
    select 'MISSING_EMPLOYMENT_TERMS', t.employee_id, t.id::text,
      'Record employment terms effective on the worked date.'
    from public.time_entries t
    where t.restaurant_id = p_restaurant_id
      and t.business_date between p_period_start and p_period_end
      and t.status <> 'cancelled'
      and not exists (
        select 1 from public.employee_employment_terms et
        where et.restaurant_id = t.restaurant_id
          and et.employee_id = t.employee_id
          and et.active
          and et.valid_from <= t.business_date
          and (et.valid_to is null or et.valid_to >= t.business_date)
      )

    union all
    select 'UNVERIFIED_EMPLOYMENT_TERMS', t.employee_id, et.id::text,
      'Review and save the migrated employment and salary terms.'
    from public.time_entries t
    join lateral (
      select x.* from public.employee_employment_terms x
      where x.restaurant_id = t.restaurant_id
        and x.employee_id = t.employee_id and x.active
        and x.valid_from <= t.business_date
        and (x.valid_to is null or x.valid_to >= t.business_date)
      order by x.valid_from desc, x.version_number desc limit 1
    ) et on true
    where t.restaurant_id = p_restaurant_id
      and t.business_date between p_period_start and p_period_end
      and t.status <> 'cancelled'
      and et.source_status <> 'verified'

    union all
    select 'INCOMPLETE_PAYROLL_CLASSIFICATION', t.employee_id, et.id::text,
      'Complete worker status, salary basis and CP 302 category.'
    from public.time_entries t
    join lateral (
      select x.* from public.employee_employment_terms x
      where x.restaurant_id = t.restaurant_id
        and x.employee_id = t.employee_id and x.active
        and x.valid_from <= t.business_date
        and (x.valid_to is null or x.valid_to >= t.business_date)
      order by x.valid_from desc, x.version_number desc limit 1
    ) et on true
    where t.restaurant_id = p_restaurant_id
      and t.business_date between p_period_start and p_period_end
      and t.status <> 'cancelled'
      and et.employment_regime <> 'self_employed'
      and (et.worker_status is null or et.salary_basis is null or et.cp302_category is null)

    union all
    select 'AGGREGATE_BREAK_ONLY', t.employee_id, t.id::text,
      'This entry has only a total break duration; record exact break times.'
    from public.time_entries t
    where t.restaurant_id = p_restaurant_id
      and t.business_date between p_period_start and p_period_end
      and t.status <> 'cancelled'
      and t.break_minutes > 0
      and exists (
        select 1 from public.time_entry_break_intervals b
        where b.restaurant_id = t.restaurant_id and b.time_entry_id = t.id
          and b.active and b.evidence_kind = 'aggregate_only'
      )
  )
  select coalesce(jsonb_agg(distinct jsonb_build_object(
    'code', code, 'employee_id', employee_id, 'evidence', evidence, 'message', message
  )), '[]'::jsonb)
  into v_blockers
  from issues;

  with warnings as (
    select distinct
      'ACTUAL_FUNCTION_UNRESOLVED'::text as code,
      t.employee_id,
      t.id::text as evidence,
      'Confirm the actual CP 302 function performed.'::text as message
    from public.time_entries t
    where t.restaurant_id = p_restaurant_id
      and t.business_date between p_period_start and p_period_end
      and t.status <> 'cancelled'
      and t.actual_job_function_id is null
    union all
    select distinct
      'ACTUAL_AREA_UNRESOLVED', t.employee_id, t.id::text,
      'Confirm the actual work area for complete operational evidence.'
    from public.time_entries t
    where t.restaurant_id = p_restaurant_id
      and t.business_date between p_period_start and p_period_end
      and t.status <> 'cancelled'
      and t.actual_area_id is null
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'code', code,
    'employee_id', employee_id,
    'evidence', evidence,
    'message', message,
    'accepted', exists (
      select 1 from public.payroll_readiness_acceptances a
      where a.restaurant_id = p_restaurant_id
        and a.period_start = p_period_start
        and a.period_end = p_period_end
        and a.warning_code = warnings.code
        and a.employee_id is not distinct from warnings.employee_id
    )
  )), '[]'::jsonb)
  into v_warnings
  from warnings;

  return jsonb_build_object(
    'restaurant_id', p_restaurant_id,
    'period_start', p_period_start,
    'period_end', p_period_end,
    'ready', jsonb_array_length(v_blockers) = 0
      and not exists (
        select 1 from jsonb_array_elements(v_warnings) w
        where coalesce((w->>'accepted')::boolean, false) = false
      ),
    'blockers', v_blockers,
    'warnings', v_warnings
  );
end
$$;

create function public.accept_payroll_readiness_warning(
  p_restaurant_id uuid,
  p_period_start date,
  p_period_end date,
  p_employee_id uuid,
  p_warning_code text,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_owner(p_restaurant_id) then
    raise exception 'Only an owner can accept payroll warnings.';
  end if;
  if length(btrim(coalesce(p_reason, ''))) < 8 then
    raise exception 'Explain why this payroll warning is accepted.';
  end if;
  insert into public.payroll_readiness_acceptances (
    restaurant_id, period_start, period_end, employee_id,
    warning_code, reason, accepted_by_profile_id
  ) values (
    p_restaurant_id, p_period_start, p_period_end, p_employee_id,
    upper(btrim(p_warning_code)), btrim(p_reason), public.current_profile_id()
  );
  return jsonb_build_object('ok', true);
end
$$;

alter table public.time_entry_break_intervals enable row level security;
alter table public.payroll_readiness_acceptances enable row level security;
revoke all on table public.time_entry_break_intervals from public, anon, authenticated;
revoke all on table public.payroll_readiness_acceptances from public, anon, authenticated;
grant all on table public.time_entry_break_intervals to service_role;
grant all on table public.payroll_readiness_acceptances to service_role;

revoke all on function public.enrich_time_entry_actual_assignment() from public, anon, authenticated;
revoke all on function public.guard_time_entry_break_history() from public, anon, authenticated;
revoke all on function public.capture_time_entry_break_evidence() from public, anon, authenticated;
revoke all on function public.payroll_readiness_report(uuid, date, date) from public, anon, authenticated;
revoke all on function public.accept_payroll_readiness_warning(uuid, date, date, uuid, text, text) from public, anon, authenticated;
grant execute on function public.payroll_readiness_report(uuid, date, date) to authenticated;
grant execute on function public.accept_payroll_readiness_warning(uuid, date, date, uuid, text, text) to authenticated;

commit;
