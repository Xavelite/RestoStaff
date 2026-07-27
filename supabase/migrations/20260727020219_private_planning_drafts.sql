-- A published schedule remains employee-visible while managers prepare and
-- persist a private next revision. Republish is the only action that replaces
-- the employee-visible rows.
begin;

alter table public.work_weeks
  add column if not exists planning_has_unpublished_changes boolean not null default false,
  add column if not exists planning_draft_updated_at timestamptz,
  add column if not exists planning_draft_updated_by_profile_id uuid
    references public.profiles(id) on delete set null;

create table public.planning_draft_shifts (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  week_start date not null,
  employee_id uuid not null,
  weekday smallint not null check (weekday between 1 and 7),
  service_key text not null,
  job_function_id uuid,
  starts_at time,
  ends_at time,
  source public.planned_shift_source not null default 'manual',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  area_id uuid,
  constraint planning_draft_shifts_week_fk
    foreign key (restaurant_id, week_start)
    references public.work_weeks(restaurant_id, week_start) on delete cascade,
  constraint planning_draft_shifts_employee_fk
    foreign key (restaurant_id, employee_id)
    references public.employees(restaurant_id, id) on delete restrict,
  constraint planning_draft_shifts_service_fk
    foreign key (restaurant_id, service_key)
    references public.services(restaurant_id, service_key),
  constraint planning_draft_shifts_area_fk
    foreign key (restaurant_id, area_id)
    references public.work_areas(restaurant_id, id),
  constraint planning_draft_shifts_job_function_fk
    foreign key (restaurant_id, job_function_id)
    references public.job_functions(restaurant_id, id),
  unique (restaurant_id, week_start, employee_id, weekday, service_key)
);

create index planning_draft_shifts_week_idx
  on public.planning_draft_shifts (restaurant_id, week_start);

create trigger planning_draft_shifts_set_updated_at
  before update on public.planning_draft_shifts
  for each row execute function public.set_updated_at();

create table public.planning_draft_notes (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  week_start date not null,
  weekday smallint not null check (weekday between 1 and 7),
  service_key text not null,
  note text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint planning_draft_notes_week_fk
    foreign key (restaurant_id, week_start)
    references public.work_weeks(restaurant_id, week_start) on delete cascade,
  constraint planning_draft_notes_service_fk
    foreign key (restaurant_id, service_key)
    references public.services(restaurant_id, service_key),
  unique (restaurant_id, week_start, weekday, service_key)
);

create index planning_draft_notes_week_idx
  on public.planning_draft_notes (restaurant_id, week_start);

create trigger planning_draft_notes_set_updated_at
  before update on public.planning_draft_notes
  for each row execute function public.set_updated_at();

alter table public.planning_draft_shifts enable row level security;
alter table public.planning_draft_notes enable row level security;
revoke all on table public.planning_draft_shifts from public, anon, authenticated;
revoke all on table public.planning_draft_notes from public, anon, authenticated;
grant all on table public.planning_draft_shifts to service_role;
grant all on table public.planning_draft_notes to service_role;

-- The manager scheduling snapshot exposes the private draft when it exists and
-- also carries the canonical publication for Timesheet/report comparisons.
do $manager_private_snapshot$
declare
  v_oid oid;
  v_definition text;
  v_next text;
begin
  select p.oid into v_oid
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'build_manager_operations_read_model';

  if v_oid is null then
    raise exception 'build_manager_operations_read_model was not found.';
  end if;

  v_definition := pg_get_functiondef(v_oid);
  v_next := replace(
    v_definition,
    E'''planned_shifts'', coalesce((select jsonb_agg(to_jsonb(p)) from public.planned_shifts p where p.restaurant_id = r.id and p.week_start + (p.weekday - 1) between p_from_date and p_to_date), ''[]''::jsonb),',
    E'''planned_shifts'', coalesce((
      select jsonb_agg(to_jsonb(effective) order by effective.week_start, effective.weekday, effective.employee_id, effective.service_key)
      from (
        select p.*
        from public.planned_shifts p
        left join public.work_weeks w
          on w.restaurant_id = p.restaurant_id and w.week_start = p.week_start
        where p.restaurant_id = r.id
          and p.week_start + (p.weekday - 1) between p_from_date and p_to_date
          and not (
            w.planning_status = ''published''
            and w.planning_has_unpublished_changes
          )
        union all
        select d.*
        from public.planning_draft_shifts d
        join public.work_weeks w
          on w.restaurant_id = d.restaurant_id and w.week_start = d.week_start
        where d.restaurant_id = r.id
          and d.week_start + (d.weekday - 1) between p_from_date and p_to_date
          and w.planning_status = ''published''
          and w.planning_has_unpublished_changes
      ) effective
    ), ''[]''::jsonb),
    ''published_planned_shifts'', coalesce((
      select jsonb_agg(to_jsonb(p) order by p.week_start, p.weekday, p.employee_id, p.service_key)
      from public.planned_shifts p
      where p.restaurant_id = r.id
        and p.week_start + (p.weekday - 1) between p_from_date and p_to_date
    ), ''[]''::jsonb),'
  );
  if v_next = v_definition then
    raise exception 'Manager planned-shift snapshot anchor drifted.';
  end if;
  v_definition := v_next;

  v_next := replace(
    v_definition,
    E'''weekly_notes'', coalesce((select jsonb_agg(to_jsonb(n)) from public.weekly_notes n where n.restaurant_id = r.id and n.week_start + (n.weekday - 1) between p_from_date and p_to_date), ''[]''::jsonb),',
    E'''weekly_notes'', coalesce((
      select jsonb_agg(to_jsonb(effective) order by effective.week_start, effective.weekday, effective.service_key)
      from (
        select n.*
        from public.weekly_notes n
        left join public.work_weeks w
          on w.restaurant_id = n.restaurant_id and w.week_start = n.week_start
        where n.restaurant_id = r.id
          and n.week_start + (n.weekday - 1) between p_from_date and p_to_date
          and not (
            w.planning_status = ''published''
            and w.planning_has_unpublished_changes
          )
        union all
        select d.*
        from public.planning_draft_notes d
        join public.work_weeks w
          on w.restaurant_id = d.restaurant_id and w.week_start = d.week_start
        where d.restaurant_id = r.id
          and d.week_start + (d.weekday - 1) between p_from_date and p_to_date
          and w.planning_status = ''published''
          and w.planning_has_unpublished_changes
      ) effective
    ), ''[]''::jsonb),'
  );
  if v_next = v_definition then
    raise exception 'Manager weekly-note snapshot anchor drifted.';
  end if;
  execute v_next;
end
$manager_private_snapshot$;

-- Add a private-draft branch to the existing audited planner mutation. The
-- published branch remains unchanged except for clearing its superseded draft.
do $private_planning_save$
declare
  v_oid oid;
  v_definition text;
  v_next text;
  v_branch text;
begin
  select p.oid into v_oid
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'save_manager_planning';

  if v_oid is null then
    raise exception 'save_manager_planning was not found.';
  end if;

  v_definition := pg_get_functiondef(v_oid);
  v_branch := $branch$
  if v_current.restaurant_id is not null
      and v_current.planning_status = 'published'
      and v_status = 'draft' then
    insert into public.planning_draft_shifts (
      restaurant_id, week_start, employee_id, weekday, service_key,
      area_id, job_function_id, starts_at, ends_at, source
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
      coalesce(nullif(value->>'source', ''), 'manual')::public.planned_shift_source
    from jsonb_array_elements(coalesce(p_planned_shifts, '[]'::jsonb))
    on conflict (restaurant_id, week_start, employee_id, weekday, service_key)
    do update set
      area_id = excluded.area_id,
      job_function_id = excluded.job_function_id,
      starts_at = excluded.starts_at,
      ends_at = excluded.ends_at,
      source = excluded.source,
      updated_at = now();

    delete from public.planning_draft_shifts existing
    where existing.restaurant_id = p_restaurant_id
      and existing.week_start = p_week_start
      and not exists (
        select 1
        from jsonb_array_elements(coalesce(p_planned_shifts, '[]'::jsonb)) item
        where nullif(item->>'employee_id', '')::uuid = existing.employee_id
          and nullif(item->>'weekday', '')::smallint = existing.weekday
          and lower(btrim(item->>'service_key')) = existing.service_key
      );

    insert into public.planning_draft_notes (
      restaurant_id, week_start, weekday, service_key, note
    )
    select
      p_restaurant_id,
      p_week_start,
      nullif(value->>'weekday', '')::smallint,
      lower(btrim(value->>'service_key')),
      btrim(value->>'note')
    from jsonb_array_elements(coalesce(p_weekly_notes, '[]'::jsonb))
    where nullif(btrim(value->>'note'), '') is not null
    on conflict (restaurant_id, week_start, weekday, service_key)
    do update set note = excluded.note, updated_at = now();

    delete from public.planning_draft_notes existing
    where existing.restaurant_id = p_restaurant_id
      and existing.week_start = p_week_start
      and not exists (
        select 1
        from jsonb_array_elements(coalesce(p_weekly_notes, '[]'::jsonb)) item
        where nullif(item->>'weekday', '')::smallint = existing.weekday
          and lower(btrim(item->>'service_key')) = existing.service_key
          and nullif(btrim(item->>'note'), '') is not null
      );

    v_next_revision := coalesce(v_current.planning_revision, 0) + 1;
    update public.work_weeks
    set planning_revision = v_next_revision,
        planning_has_unpublished_changes = true,
        planning_draft_updated_at = now(),
        planning_draft_updated_by_profile_id = v_actor.profile_id,
        updated_at = now()
    where restaurant_id = p_restaurant_id and week_start = p_week_start;

    return jsonb_build_object(
      'ok', true,
      'restaurant_id', p_restaurant_id,
      'planning_status', 'published',
      'planning_revision', v_next_revision,
      'has_unpublished_changes', true
    );
  end if;

$branch$;

  v_next := replace(
    v_definition,
    E'  if v_status = ''published'' and exists (\n',
    v_branch || E'  if v_status = ''published'' and exists (\n'
  );
  if v_next = v_definition then
    raise exception 'save_manager_planning private-draft branch anchor drifted.';
  end if;
  v_definition := v_next;

  v_next := replace(
    v_definition,
    E'  v_new_snapshot := public.planning_snapshot_for_week(\n',
    E'  if v_status = ''published'' then\n'
    || E'    delete from public.planning_draft_shifts where restaurant_id = p_restaurant_id and week_start = p_week_start;\n'
    || E'    delete from public.planning_draft_notes where restaurant_id = p_restaurant_id and week_start = p_week_start;\n'
    || E'    update public.work_weeks\n'
    || E'    set planning_has_unpublished_changes = false,\n'
    || E'        planning_draft_updated_at = null,\n'
    || E'        planning_draft_updated_by_profile_id = null,\n'
    || E'        updated_at = now()\n'
    || E'    where restaurant_id = p_restaurant_id and week_start = p_week_start;\n'
    || E'  end if;\n\n'
    || E'  v_new_snapshot := public.planning_snapshot_for_week(\n'
  );
  if v_next = v_definition then
    raise exception 'save_manager_planning publication cleanup anchor drifted.';
  end if;
  execute v_next;
end
$private_planning_save$;

create or replace function public.discard_manager_planning_draft(
  p_restaurant_id uuid,
  p_week_start date,
  p_expected_revision bigint
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $discard_planning_draft$
declare
  v_actor record;
  v_week public.work_weeks%rowtype;
  v_next_revision bigint;
begin
  select * into v_actor
  from public.require_owner_or_manager_context(p_restaurant_id)
  limit 1;

  perform pg_advisory_xact_lock(
    hashtextextended(p_restaurant_id::text || ':planning:' || p_week_start::text, 0)
  );

  select * into v_week
  from public.work_weeks
  where restaurant_id = p_restaurant_id and week_start = p_week_start
  for update;

  if v_week.restaurant_id is null
      or v_week.planning_status <> 'published'
      or not v_week.planning_has_unpublished_changes then
    raise exception 'No private planning draft exists for this week.';
  end if;
  if p_expected_revision is null or v_week.planning_revision <> p_expected_revision then
    raise exception 'CONFLICT: This planning week changed in another session. Reload before discarding.';
  end if;
  if v_week.actuals_status in ('approved', 'locked') then
    raise exception 'Schedule is locked because Timesheet are %.', v_week.actuals_status;
  end if;

  delete from public.planning_draft_shifts
  where restaurant_id = p_restaurant_id and week_start = p_week_start;
  delete from public.planning_draft_notes
  where restaurant_id = p_restaurant_id and week_start = p_week_start;

  v_next_revision := v_week.planning_revision + 1;
  update public.work_weeks
  set planning_revision = v_next_revision,
      planning_has_unpublished_changes = false,
      planning_draft_updated_at = null,
      planning_draft_updated_by_profile_id = null,
      updated_at = now()
  where restaurant_id = p_restaurant_id and week_start = p_week_start;

  return jsonb_build_object(
    'ok', true,
    'restaurant_id', p_restaurant_id,
    'planning_revision', v_next_revision
  );
end
$discard_planning_draft$;

revoke all on function public.discard_manager_planning_draft(uuid, date, bigint)
  from public, anon;
grant execute on function public.discard_manager_planning_draft(uuid, date, bigint)
  to authenticated;

notify pgrst, 'reload schema';
commit;
