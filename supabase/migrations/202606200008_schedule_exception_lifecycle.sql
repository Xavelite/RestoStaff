begin;

set local lock_timeout = '5s';
set local statement_timeout = '60s';

-- Preconditions: migrations 001-007 are applied and the canonical employee,
-- contract, service and runtime-snapshot functions exist.
-- Rollback before commit is automatic. After deployment, retain the tables and
-- data; a reviewed forward migration must remove the feature if ever required.

-- A schedule exception is not leave. It temporarily overrides a recurring
-- fixed schedule, does not consume leave balance and has no payroll meaning.
create table public.schedule_exceptions (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  employee_id uuid not null,
  start_date date not null,
  end_date date not null,
  service_key text null,
  status text not null default 'pending',
  reason text not null,
  employee_comment text null,
  manager_comment text null,
  requested_by_profile_id uuid null references public.profiles(id) on delete set null,
  decided_by_profile_id uuid null references public.profiles(id) on delete set null,
  decided_at timestamptz null,
  cancelled_by_profile_id uuid null references public.profiles(id) on delete set null,
  cancelled_at timestamptz null,
  cancellation_reason text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint schedule_exceptions_restaurant_id_id_key unique (restaurant_id, id),
  constraint schedule_exceptions_employee_fk
    foreign key (restaurant_id, employee_id)
    references public.employees(restaurant_id, id) on delete cascade,
  constraint schedule_exceptions_service_fk
    foreign key (restaurant_id, service_key)
    references public.services(restaurant_id, service_key),
  constraint schedule_exceptions_dates_check check (end_date >= start_date),
  constraint schedule_exceptions_service_check
    check (service_key is null or service_key in ('lunch', 'evening')),
  constraint schedule_exceptions_status_check
    check (status in ('pending', 'approved', 'rejected', 'cancelled')),
  constraint schedule_exceptions_reason_check check (length(btrim(reason)) between 2 and 500)
);

create index schedule_exceptions_restaurant_dates_idx
  on public.schedule_exceptions (restaurant_id, start_date, end_date);
create index schedule_exceptions_employee_status_idx
  on public.schedule_exceptions (restaurant_id, employee_id, status);

create table public.schedule_exception_events (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  schedule_exception_id uuid not null,
  employee_id uuid not null,
  event_type text not null,
  actor_profile_id uuid null references public.profiles(id) on delete set null,
  actor_employee_id uuid null,
  actor_role text not null,
  reason text not null,
  previous_values jsonb not null default '{}'::jsonb,
  new_values jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint schedule_exception_events_exception_fk
    foreign key (restaurant_id, schedule_exception_id)
    references public.schedule_exceptions(restaurant_id, id) on delete cascade,
  constraint schedule_exception_events_employee_fk
    foreign key (restaurant_id, employee_id)
    references public.employees(restaurant_id, id) on delete cascade,
  constraint schedule_exception_events_actor_employee_fk
    foreign key (restaurant_id, actor_employee_id)
    references public.employees(restaurant_id, id)
);

create index schedule_exception_events_exception_idx
  on public.schedule_exception_events (restaurant_id, schedule_exception_id, created_at);

alter table public.schedule_exceptions enable row level security;
alter table public.schedule_exception_events enable row level security;

revoke all on public.schedule_exceptions from public, anon, authenticated;
revoke all on public.schedule_exception_events from public, anon, authenticated;
grant all on public.schedule_exceptions, public.schedule_exception_events to service_role;

-- One runtime snapshot builder. Migration 002's build_workspace_runtime_snapshot_v2
-- is the single role-aware builder that every public entry point already calls,
-- so the schedule-exception domain is folded in here directly rather than behind
-- a wrapper/_v3 layer. The entry points need no change.
create or replace function public.build_workspace_runtime_snapshot_v2(
  p_restaurant_id uuid,
  p_role text,
  p_profile_id uuid,
  p_employee_id uuid,
  p_from_date date default null,
  p_to_date date default null
)
returns jsonb
language sql
stable
security definer
set search_path = public
as $snapshot_v2$
  select jsonb_build_object(
    'restaurant', to_jsonb(r),
    'restaurant_settings', coalesce((select to_jsonb(rs) from public.restaurant_settings rs where rs.restaurant_id = r.id), '{}'::jsonb),
    'restaurant_onboarding_state', coalesce((select to_jsonb(os) from public.restaurant_onboarding_state os where os.restaurant_id = r.id), '{}'::jsonb),
    'profiles', '[]'::jsonb,
    'restaurant_memberships',
      case when p_role in ('owner','manager') then
        coalesce((select jsonb_agg(to_jsonb(m)) from public.restaurant_memberships m where m.restaurant_id = r.id), '[]'::jsonb)
      else '[]'::jsonb end,
    'employees',
      coalesce((select jsonb_agg(to_jsonb(e) order by e.sort_order, e.display_name)
        from public.employees e
        where e.restaurant_id = r.id and (p_role in ('owner','manager') or e.id = p_employee_id)), '[]'::jsonb),
    'employee_access',
      case when p_role in ('owner','manager') then
        coalesce((select jsonb_agg(to_jsonb(ea)) from public.employee_access ea where ea.restaurant_id = r.id), '[]'::jsonb)
      else '[]'::jsonb end,
    'employee_pin_credentials',
      case when p_role in ('owner','manager') then
        coalesce((select jsonb_agg(jsonb_build_object(
          'restaurant_id', pc.restaurant_id,
          'employee_id', pc.employee_id,
          'pin_status', pc.pin_status,
          'locked_until', pc.locked_until,
          'last_used_at', pc.last_used_at,
          'last_rotated_at', pc.last_rotated_at
        )) from public.employee_pin_credentials pc where pc.restaurant_id = r.id), '[]'::jsonb)
      else '[]'::jsonb end,
    'employee_contact_details',
      coalesce((select jsonb_agg(to_jsonb(c))
        from public.employee_contact_details c
        where c.restaurant_id = r.id and (p_role in ('owner','manager') or c.employee_id = p_employee_id)), '[]'::jsonb),
    'employee_contracts',
      coalesce((select jsonb_agg(to_jsonb(c))
        from public.employee_contracts c
        where c.restaurant_id = r.id and (p_role in ('owner','manager') or c.employee_id = p_employee_id)), '[]'::jsonb),
    'employee_legal_profiles',
      case when p_role = 'owner' then coalesce((select jsonb_agg(to_jsonb(l)) from public.employee_legal_profiles l where l.restaurant_id = r.id), '[]'::jsonb) else '[]'::jsonb end,
    'employee_payroll_profiles',
      case when p_role = 'owner' then coalesce((select jsonb_agg(to_jsonb(p)) from public.employee_payroll_profiles p where p.restaurant_id = r.id), '[]'::jsonb) else '[]'::jsonb end,
    'job_functions', coalesce((select jsonb_agg(to_jsonb(j) order by j.sort_order, j.name) from public.job_functions j where j.restaurant_id = r.id), '[]'::jsonb),
    'employee_job_functions', coalesce((select jsonb_agg(to_jsonb(ej)) from public.employee_job_functions ej where ej.restaurant_id = r.id and (p_role in ('owner','manager') or ej.employee_id = p_employee_id)), '[]'::jsonb),
    'recurring_work_patterns', coalesce((select jsonb_agg(to_jsonb(rp)) from public.recurring_work_patterns rp where rp.restaurant_id = r.id and (p_role in ('owner','manager') or rp.employee_id = p_employee_id)), '[]'::jsonb),
    'contract_types', coalesce((select jsonb_agg(to_jsonb(ct) order by ct.sort_order) from public.contract_types ct where ct.restaurant_id = r.id and ct.active), '[]'::jsonb),
    'work_areas', coalesce((select jsonb_agg(to_jsonb(a) order by a.sort_order, a.name) from public.work_areas a where a.restaurant_id = r.id), '[]'::jsonb),
    'services', coalesce((select jsonb_agg(to_jsonb(s) order by s.sort_order) from public.services s where s.restaurant_id = r.id), '[]'::jsonb),
    'area_service_defaults', coalesce((select jsonb_agg(to_jsonb(ad)) from public.area_service_defaults ad where ad.restaurant_id = r.id), '[]'::jsonb),
    'coverage_requirements', coalesce((select jsonb_agg(to_jsonb(cr)) from public.coverage_requirements cr where cr.restaurant_id = r.id), '[]'::jsonb),
    'opening_hours', coalesce((select jsonb_agg(to_jsonb(oh)) from public.opening_hours oh where oh.restaurant_id = r.id), '[]'::jsonb),
    'absence_types', coalesce((select jsonb_agg(to_jsonb(at) order by at.sort_order) from public.absence_types at where at.restaurant_id = r.id and at.active), '[]'::jsonb),
    'work_weeks', coalesce((select jsonb_agg(to_jsonb(ww)) from public.work_weeks ww where ww.restaurant_id = r.id and (p_from_date is null or ww.week_start >= public.week_start_for_date(p_from_date)) and (p_to_date is null or ww.week_start <= public.week_start_for_date(p_to_date))), '[]'::jsonb),
    'work_week_events', case when p_role in ('owner','manager') then coalesce((select jsonb_agg(to_jsonb(we)) from public.work_week_events we where we.restaurant_id = r.id), '[]'::jsonb) else '[]'::jsonb end,
    'planned_shifts', coalesce((select jsonb_agg(to_jsonb(ps)) from public.planned_shifts ps join public.work_weeks ww on ww.restaurant_id = ps.restaurant_id and ww.week_start = ps.week_start where ps.restaurant_id = r.id and (p_role in ('owner','manager') or (ps.employee_id = p_employee_id and ww.planning_status = 'published')) and (p_from_date is null or ps.week_start + (ps.weekday - 1) >= p_from_date) and (p_to_date is null or ps.week_start + (ps.weekday - 1) <= p_to_date)), '[]'::jsonb),
    'employee_availability_slots', coalesce((select jsonb_agg(to_jsonb(av)) from public.employee_availability_slots av where av.restaurant_id = r.id and (p_role in ('owner','manager') or av.employee_id = p_employee_id)), '[]'::jsonb),
    'employee_availability_submissions', coalesce((select jsonb_agg(to_jsonb(sub)) from public.employee_availability_submissions sub where sub.restaurant_id = r.id and (p_role in ('owner','manager') or sub.employee_id = p_employee_id)), '[]'::jsonb),
    'weekly_notes', coalesce((select jsonb_agg(to_jsonb(n)) from public.weekly_notes n join public.work_weeks ww on ww.restaurant_id = n.restaurant_id and ww.week_start = n.week_start where n.restaurant_id = r.id and (p_role in ('owner','manager') or ww.planning_status = 'published')), '[]'::jsonb),
    'time_entries', coalesce((select jsonb_agg(to_jsonb(t)) from public.time_entries t where t.restaurant_id = r.id and (p_role in ('owner','manager') or t.employee_id = p_employee_id) and (p_from_date is null or t.business_date >= p_from_date) and (p_to_date is null or t.business_date <= p_to_date)), '[]'::jsonb),
    'time_entry_adjustments', case when p_role in ('owner','manager') then coalesce((select jsonb_agg(to_jsonb(ta)) from public.time_entry_adjustments ta where ta.restaurant_id = r.id), '[]'::jsonb) else '[]'::jsonb end,
    'absences', coalesce((select jsonb_agg(to_jsonb(a)) from public.absences a where a.restaurant_id = r.id and (p_role in ('owner','manager') or a.employee_id = p_employee_id)), '[]'::jsonb),
    'absence_events', case when p_role in ('owner','manager') then coalesce((select jsonb_agg(to_jsonb(ae)) from public.absence_events ae where ae.restaurant_id = r.id), '[]'::jsonb) else '[]'::jsonb end,
    'schedule_exceptions',
      coalesce((
        select jsonb_agg(to_jsonb(se) order by se.start_date, se.created_at)
        from public.schedule_exceptions se
        where se.restaurant_id = r.id
          and (p_role in ('owner','manager') or se.employee_id = p_employee_id)
          and (p_from_date is null or se.end_date >= p_from_date)
          and (p_to_date is null or se.start_date <= p_to_date)
      ), '[]'::jsonb),
    'schedule_exception_events',
      case when p_role in ('owner','manager') then
        coalesce((
          select jsonb_agg(to_jsonb(see) order by see.created_at desc)
          from public.schedule_exception_events see
          where see.restaurant_id = r.id
        ), '[]'::jsonb)
      else '[]'::jsonb end
  )
  from public.restaurants r
  where r.id = p_restaurant_id
$snapshot_v2$;

-- The role-aware builder stays service-role only; the app reaches it through the
-- session-scoped get_workspace_runtime_snapshot entry point (security definer).
revoke all on function public.build_workspace_runtime_snapshot_v2(
  uuid, text, uuid, uuid, date, date
) from public, anon, authenticated;

create or replace function public.save_schedule_exception_lifecycle(
  p_restaurant_id uuid,
  p_employee_id uuid,
  p_schedule_exception_id uuid default null,
  p_action text default 'create_by_employee',
  p_payload jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $schedule_exception_lifecycle$
declare
  v_profile_id uuid := public.current_profile_id();
  v_actor record;
  v_actor_employee_id uuid;
  v_actor_role text;
  v_exception public.schedule_exceptions%rowtype;
  v_previous jsonb := '{}'::jsonb;
  v_start_date date;
  v_end_date date;
  v_service_key text;
  v_reason text;
  v_local_today date;
  v_work_regime text;
  v_event_type text;
begin
  if v_profile_id is null then raise exception 'Authenticated session required.'; end if;
  p_action := lower(btrim(coalesce(p_action, '')));

  select (now() at time zone coalesce(rs.timezone, 'Europe/Brussels'))::date
  into v_local_today
  from public.restaurant_settings rs
  where rs.restaurant_id = p_restaurant_id;
  v_local_today := coalesce(v_local_today, current_date);

  if p_action in ('create_by_manager', 'approve', 'reject', 'cancel_by_manager',
                  'cancel_for_planning', 'update_manager_comment') then
    select * into v_actor
    from public.require_owner_or_manager_context(p_restaurant_id)
    limit 1;
    v_actor_employee_id := v_actor.employee_id;
    v_actor_role := v_actor.role;
  else
    select ea.employee_id, m.role
    into v_actor_employee_id, v_actor_role
    from public.restaurant_memberships m
    join public.employee_access ea
      on ea.restaurant_id = m.restaurant_id
      and ea.profile_id = m.profile_id
      and ea.access_status = 'active'
    where m.restaurant_id = p_restaurant_id
      and m.profile_id = v_profile_id
      and m.status = 'active'
      and ea.employee_id = p_employee_id
    limit 1;
    if v_actor_employee_id is null then
      raise exception 'Employees may only manage their own schedule exceptions.';
    end if;
  end if;

  if p_action in ('create_by_employee', 'create_by_manager') then
    perform 1 from public.employees
    where restaurant_id = p_restaurant_id and id = p_employee_id and active;
    if not found then raise exception 'Active employee required.'; end if;

    v_start_date := nullif(p_payload->>'start_date', '')::date;
    v_end_date := nullif(p_payload->>'end_date', '')::date;
    v_service_key := nullif(lower(btrim(p_payload->>'service_key')), '');
    v_reason := btrim(coalesce(p_payload->>'reason', p_payload->>'employee_comment', ''));
    if v_start_date is null or v_end_date is null or v_end_date < v_start_date then
      raise exception 'A valid exception date range is required.';
    end if;
    if p_action = 'create_by_employee' and v_start_date < v_local_today then
      raise exception 'Employees cannot request schedule exceptions in the past.';
    end if;
    if v_service_key is not null and v_service_key not in ('lunch', 'evening') then
      raise exception 'Invalid service.';
    end if;
    if length(v_reason) < 2 then raise exception 'An exception reason is required.'; end if;

    select c.work_regime::text into v_work_regime
    from public.employee_contracts c
    where c.restaurant_id = p_restaurant_id
      and c.employee_id = p_employee_id
      and c.active and c.is_current
    order by c.created_at desc
    limit 1;
    if coalesce(v_work_regime, 'manager_only') <> 'fixed_schedule' then
      raise exception 'Schedule exceptions are only available for fixed-schedule employees.';
    end if;

    if exists (
      select 1 from public.schedule_exceptions se
      where se.restaurant_id = p_restaurant_id
        and se.employee_id = p_employee_id
        and se.status in ('pending', 'approved')
        and se.start_date <= v_end_date
        and se.end_date >= v_start_date
        and (se.service_key is null or v_service_key is null or se.service_key = v_service_key)
    ) then
      raise exception 'An active schedule exception already overlaps this period.';
    end if;

    insert into public.schedule_exceptions (
      restaurant_id, employee_id, start_date, end_date, service_key, status,
      reason, employee_comment, manager_comment, requested_by_profile_id,
      decided_by_profile_id, decided_at
    )
    values (
      p_restaurant_id, p_employee_id, v_start_date, v_end_date, v_service_key,
      case when p_action = 'create_by_manager' then
        case when coalesce((p_payload->>'approve_immediately')::boolean, false)
          then 'approved' else 'pending' end
      else 'pending' end,
      v_reason,
      nullif(btrim(p_payload->>'employee_comment'), ''),
      nullif(btrim(p_payload->>'manager_comment'), ''),
      v_profile_id,
      case when p_action = 'create_by_manager'
             and coalesce((p_payload->>'approve_immediately')::boolean, false)
        then v_profile_id end,
      case when p_action = 'create_by_manager'
             and coalesce((p_payload->>'approve_immediately')::boolean, false)
        then now() end
    )
    returning * into v_exception;
    v_event_type := case when v_exception.status = 'approved'
      then 'created_approved' else 'requested' end;
  else
    select * into v_exception
    from public.schedule_exceptions
    where restaurant_id = p_restaurant_id
      and id = p_schedule_exception_id
      and employee_id = p_employee_id
    for update;
    if not found then raise exception 'Schedule exception not found.'; end if;
    v_previous := to_jsonb(v_exception);

    if p_action = 'approve' then
      if v_exception.status <> 'pending' then raise exception 'Only pending exceptions can be approved.'; end if;
      update public.schedule_exceptions set
        status = 'approved',
        manager_comment = coalesce(nullif(btrim(p_payload->>'manager_comment'), ''), manager_comment),
        decided_by_profile_id = v_profile_id,
        decided_at = now(),
        updated_at = now()
      where id = v_exception.id returning * into v_exception;
      v_event_type := 'approved';
    elsif p_action = 'reject' then
      if v_exception.status <> 'pending' then raise exception 'Only pending exceptions can be rejected.'; end if;
      v_reason := btrim(coalesce(p_payload->>'reason', p_payload->>'manager_comment', ''));
      if length(v_reason) < 2 then raise exception 'A rejection reason is required.'; end if;
      update public.schedule_exceptions set
        status = 'rejected',
        manager_comment = v_reason,
        decided_by_profile_id = v_profile_id,
        decided_at = now(),
        updated_at = now()
      where id = v_exception.id returning * into v_exception;
      v_event_type := 'rejected';
    elsif p_action in ('cancel_by_employee', 'cancel_by_manager', 'cancel_for_planning') then
      if v_exception.status not in ('pending', 'approved') then
        raise exception 'Only active exceptions can be cancelled.';
      end if;
      if p_action = 'cancel_by_employee' and v_exception.employee_id <> v_actor_employee_id then
        raise exception 'Employees may only cancel their own schedule exceptions.';
      end if;
      v_reason := btrim(coalesce(p_payload->>'reason', p_payload->>'cancellation_reason', ''));
      if length(v_reason) < 2 then raise exception 'A cancellation reason is required.'; end if;
      update public.schedule_exceptions set
        status = 'cancelled',
        cancelled_by_profile_id = v_profile_id,
        cancelled_at = now(),
        cancellation_reason = v_reason,
        updated_at = now()
      where id = v_exception.id returning * into v_exception;
      v_event_type := case when p_action = 'cancel_for_planning'
        then 'cancelled_for_planning' else 'cancelled' end;
    elsif p_action = 'update_manager_comment' then
      update public.schedule_exceptions set
        manager_comment = nullif(btrim(p_payload->>'manager_comment'), ''),
        updated_at = now()
      where id = v_exception.id returning * into v_exception;
      v_event_type := 'manager_comment_updated';
    else
      raise exception 'Unsupported schedule exception action.';
    end if;
  end if;

  insert into public.schedule_exception_events (
    restaurant_id, schedule_exception_id, employee_id, event_type,
    actor_profile_id, actor_employee_id, actor_role, reason,
    previous_values, new_values
  )
  values (
    p_restaurant_id, v_exception.id, v_exception.employee_id, v_event_type,
    v_profile_id, v_actor_employee_id, coalesce(v_actor_role, 'employee'),
    coalesce(nullif(v_reason, ''), v_exception.reason, v_event_type),
    v_previous, to_jsonb(v_exception)
  );

  return jsonb_build_object(
    'runtime_snapshot',
    public.workspace_runtime_snapshot_for_current_context(p_restaurant_id)
  );
end;
$schedule_exception_lifecycle$;

revoke all on function public.save_schedule_exception_lifecycle(
  uuid, uuid, uuid, text, jsonb
) from public, anon;
grant execute on function public.save_schedule_exception_lifecycle(
  uuid, uuid, uuid, text, jsonb
) to authenticated, service_role;

commit;
