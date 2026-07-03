-- Phase 6: generic payroll export lineage.
--
-- Preconditions:
-- - Migrations through 202606210026 are applied.
-- - Actuals approval is the authoritative payroll-readiness gate.
--
-- Rollback:
-- - Drop the two payroll export RPCs, helper, trigger and tables only if no
--   export evidence must be retained.
-- - This migration never changes time entries or approved Actuals.
begin;

create table public.payroll_export_runs (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null,
  period_start date not null,
  period_end date not null,
  format text not null default 'generic_csv',
  schema_version smallint not null default 1,
  filename text not null,
  row_count integer not null,
  total_net_minutes integer not null,
  source_revisions jsonb not null,
  payload jsonb not null,
  payload_sha256 text not null,
  created_by_profile_id uuid not null,
  created_at timestamptz not null default now(),
  constraint payroll_export_runs_restaurant_fk
    foreign key (restaurant_id) references public.restaurants(id)
    on delete restrict,
  constraint payroll_export_runs_actor_fk
    foreign key (created_by_profile_id) references public.profiles(id)
    on delete restrict,
  constraint payroll_export_runs_period_check
    check (
      period_start <= period_end
      and extract(isodow from period_start) = 1
      and extract(isodow from period_end) = 7
      and period_end - period_start <= 370
    ),
  constraint payroll_export_runs_format_check
    check (format = 'generic_csv'),
  constraint payroll_export_runs_schema_version_check
    check (schema_version = 1),
  constraint payroll_export_runs_row_count_check
    check (row_count > 0),
  constraint payroll_export_runs_minutes_check
    check (total_net_minutes >= 0),
  constraint payroll_export_runs_payload_object_check
    check (jsonb_typeof(payload) = 'object'),
  constraint payroll_export_runs_revisions_array_check
    check (jsonb_typeof(source_revisions) = 'array'),
  constraint payroll_export_runs_sha256_check
    check (payload_sha256 ~ '^[0-9a-f]{64}$')
);

create index payroll_export_runs_restaurant_period_idx
  on public.payroll_export_runs (
    restaurant_id,
    period_start desc,
    period_end desc,
    created_at desc
  );

alter table public.payroll_export_runs enable row level security;
revoke all on table public.payroll_export_runs from public, anon, authenticated;
grant all on table public.payroll_export_runs to service_role;

create function public.reject_payroll_export_evidence_mutation()
returns trigger
language plpgsql
security definer
set search_path = public
as $reject_payroll_export_mutation$
begin
  raise exception 'Payroll export runs are immutable operational evidence.';
end
$reject_payroll_export_mutation$;

create trigger payroll_export_runs_append_only
before update or delete on public.payroll_export_runs
for each row execute function public.reject_payroll_export_evidence_mutation();

create function public.payroll_export_run_summaries(
  p_restaurant_id uuid,
  p_from_date date,
  p_to_date date
)
returns jsonb
language sql
stable
security definer
set search_path = public
as $payroll_export_summaries$
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', r.id,
        'restaurant_id', r.restaurant_id,
        'period_start', r.period_start,
        'period_end', r.period_end,
        'format', r.format,
        'schema_version', r.schema_version,
        'filename', r.filename,
        'row_count', r.row_count,
        'total_net_minutes', r.total_net_minutes,
        'payload_sha256', r.payload_sha256,
        'created_by_profile_id', r.created_by_profile_id,
        'created_at', r.created_at
      )
      order by r.created_at desc
    ),
    '[]'::jsonb
  )
  from public.payroll_export_runs r
  where r.restaurant_id = p_restaurant_id
    and r.period_start <= p_to_date
    and r.period_end >= p_from_date
$payroll_export_summaries$;

create function public.create_payroll_export_run(
  p_restaurant_id uuid,
  p_period_start date,
  p_period_end date
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $create_payroll_export$
declare
  v_profile_id uuid := public.current_profile_id();
  v_run_id uuid := gen_random_uuid();
  v_timezone text;
  v_week_count integer;
  v_approved_count integer;
  v_rows jsonb;
  v_sources jsonb;
  v_payload jsonb;
  v_row_count integer;
  v_total_minutes integer;
  v_filename text;
  v_sha256 text;
  v_missing text;
begin
  if v_profile_id is null then
    raise exception 'Authenticated session required.';
  end if;
  if not public.is_owner(p_restaurant_id) then
    raise exception 'Only an owner can create a payroll export.';
  end if;
  if p_period_start is null
      or p_period_end is null
      or p_period_end < p_period_start
      or extract(isodow from p_period_start) <> 1
      or extract(isodow from p_period_end) <> 7 then
    raise exception 'Payroll export periods must cover complete Monday-to-Sunday weeks.';
  end if;
  if p_period_end - p_period_start > 370 then
    raise exception 'Payroll export periods cannot exceed 53 weeks.';
  end if;

  v_week_count := ((p_period_end - p_period_start + 1) / 7);
  select count(*)
  into v_approved_count
  from public.work_weeks w
  where w.restaurant_id = p_restaurant_id
    and w.week_start between p_period_start and p_period_end
    and w.actuals_status in ('approved', 'locked');

  if v_approved_count <> v_week_count then
    raise exception 'Every included Actuals week must be approved before payroll export.';
  end if;

  select coalesce(nullif(btrim(s.timezone), ''), 'Europe/Brussels')
  into v_timezone
  from public.restaurant_settings s
  where s.restaurant_id = p_restaurant_id;
  v_timezone := coalesce(v_timezone, 'Europe/Brussels');

  select string_agg(e.display_name, ', ' order by e.display_name)
  into v_missing
  from public.time_entries t
  join public.employees e
    on e.restaurant_id = t.restaurant_id
   and e.id = t.employee_id
  left join public.employee_payroll_profiles pp
    on pp.restaurant_id = t.restaurant_id
   and pp.employee_id = t.employee_id
  left join public.employee_legal_profiles lp
    on lp.restaurant_id = t.restaurant_id
   and lp.employee_id = t.employee_id
  where t.restaurant_id = p_restaurant_id
    and t.business_date between p_period_start and p_period_end
    and t.status <> 'cancelled'
    and (
      nullif(btrim(pp.payroll_employee_id), '') is null
      or nullif(btrim(lp.national_registry_number), '') is null
      or nullif(btrim(e.first_name), '') is null
      or nullif(btrim(e.last_name), '') is null
    );

  if v_missing is not null then
    raise exception 'Complete payroll ID, legal name and national number for: %.', v_missing;
  end if;

  with export_entries as (
    select
      t.id,
      t.revision,
      pp.payroll_employee_id,
      e.first_name,
      e.last_name,
      lp.national_registry_number,
      t.business_date,
      to_char(t.clock_in_at at time zone v_timezone, 'HH24:MI') as start_time,
      to_char(t.clock_out_at at time zone v_timezone, 'HH24:MI') as end_time,
      t.break_minutes,
      greatest(
        0,
        floor(extract(epoch from (t.clock_out_at - t.clock_in_at)) / 60)
          - t.break_minutes
      )::integer as net_minutes,
      coalesce(ct.code, '') as contract_type
    from public.time_entries t
    join public.employees e
      on e.restaurant_id = t.restaurant_id
     and e.id = t.employee_id
    join public.employee_payroll_profiles pp
      on pp.restaurant_id = t.restaurant_id
     and pp.employee_id = t.employee_id
    join public.employee_legal_profiles lp
      on lp.restaurant_id = t.restaurant_id
     and lp.employee_id = t.employee_id
    left join lateral (
      select c.contract_type_id
      from public.employee_contracts c
      where c.restaurant_id = t.restaurant_id
        and c.employee_id = t.employee_id
        and (c.contract_start is null or c.contract_start <= t.business_date)
        and (c.contract_end is null or c.contract_end >= t.business_date)
      order by c.contract_start desc nulls last, c.created_at desc
      limit 1
    ) contract on true
    left join public.contract_types ct
      on ct.restaurant_id = t.restaurant_id
     and ct.id = contract.contract_type_id
    where t.restaurant_id = p_restaurant_id
      and t.business_date between p_period_start and p_period_end
      and t.status <> 'cancelled'
      and t.clock_out_at is not null
    order by t.business_date, e.last_name, e.first_name, t.service_key
  )
  select
    coalesce(
      jsonb_agg(
        jsonb_build_array(
          payroll_employee_id,
          first_name,
          last_name,
          national_registry_number,
          business_date,
          start_time,
          end_time,
          break_minutes,
          round(net_minutes::numeric / 60, 2),
          contract_type
        )
      ),
      '[]'::jsonb
    ),
    coalesce(
      jsonb_agg(
        jsonb_build_object(
          'time_entry_id', id,
          'time_entry_revision', revision,
          'business_date', business_date,
          'net_minutes', net_minutes
        )
      ),
      '[]'::jsonb
    ),
    count(*)::integer,
    coalesce(sum(net_minutes), 0)::integer
  into v_rows, v_sources, v_row_count, v_total_minutes
  from export_entries;

  if v_row_count = 0 then
    raise exception 'The approved payroll period contains no worked entries.';
  end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'week_start', w.week_start,
        'actuals_status', w.actuals_status,
        'actuals_revision', w.actuals_revision,
        'approved_at', w.actuals_approved_at
      )
      order by w.week_start
    ),
    '[]'::jsonb
  )
  into v_sources
  from public.work_weeks w
  where w.restaurant_id = p_restaurant_id
    and w.week_start between p_period_start and p_period_end;

  v_filename := format(
    'payroll-%s-%s-%s.csv',
    p_period_start,
    p_period_end,
    left(v_run_id::text, 8)
  );
  v_payload := jsonb_build_object(
    'schema_version', 1,
    'format', 'generic_csv',
    'restaurant_id', p_restaurant_id,
    'period_start', p_period_start,
    'period_end', p_period_end,
    'timezone', v_timezone,
    'headers', jsonb_build_array(
      'Matricule',
      'First name',
      'Last name',
      'National registration number',
      'Date',
      'Start time',
      'End time',
      'Break minutes',
      'Total worked hours',
      'Contract type'
    ),
    'rows', v_rows,
    'entry_sources', (
      select coalesce(
        jsonb_agg(
          jsonb_build_object(
            'time_entry_id', t.id,
            'time_entry_revision', t.revision,
            'business_date', t.business_date
          )
          order by t.business_date, t.id
        ),
        '[]'::jsonb
      )
      from public.time_entries t
      where t.restaurant_id = p_restaurant_id
        and t.business_date between p_period_start and p_period_end
        and t.status <> 'cancelled'
        and t.clock_out_at is not null
    )
  );
  v_sha256 := encode(
    extensions.digest(convert_to(v_payload::text, 'UTF8'), 'sha256'),
    'hex'
  );

  insert into public.payroll_export_runs (
    id,
    restaurant_id,
    period_start,
    period_end,
    filename,
    row_count,
    total_net_minutes,
    source_revisions,
    payload,
    payload_sha256,
    created_by_profile_id
  )
  values (
    v_run_id,
    p_restaurant_id,
    p_period_start,
    p_period_end,
    v_filename,
    v_row_count,
    v_total_minutes,
    v_sources,
    v_payload,
    v_sha256,
    v_profile_id
  );

  return jsonb_build_object(
    'ok', true,
    'restaurant_id', p_restaurant_id,
    'run_id', v_run_id,
    'filename', v_filename,
    'row_count', v_row_count,
    'total_net_minutes', v_total_minutes,
    'payload_sha256', v_sha256,
    'payload', v_payload,
    'created_at', now()
  );
end
$create_payroll_export$;

create function public.get_payroll_export_run(
  p_restaurant_id uuid,
  p_run_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $get_payroll_export$
declare
  v_run public.payroll_export_runs%rowtype;
begin
  if not public.is_owner(p_restaurant_id) then
    raise exception 'Only an owner can access payroll exports.';
  end if;

  select * into v_run
  from public.payroll_export_runs r
  where r.restaurant_id = p_restaurant_id
    and r.id = p_run_id;

  if v_run.id is null then
    raise exception 'Payroll export run not found.';
  end if;

  return jsonb_build_object(
    'id', v_run.id,
    'restaurant_id', v_run.restaurant_id,
    'period_start', v_run.period_start,
    'period_end', v_run.period_end,
    'filename', v_run.filename,
    'row_count', v_run.row_count,
    'total_net_minutes', v_run.total_net_minutes,
    'payload_sha256', v_run.payload_sha256,
    'payload', v_run.payload,
    'created_by_profile_id', v_run.created_by_profile_id,
    'created_at', v_run.created_at
  );
end
$get_payroll_export$;

-- Add owner-only export history to the focused manager operations read model.
do $extend_operations_read_model$
declare
  v_definition text;
  v_before text;
begin
  select pg_get_functiondef(
    'public.build_manager_operations_read_model(uuid,text,date,date)'::regprocedure
  ) into v_definition;
  v_before := v_definition;
  v_definition := replace(
    v_definition,
    '    ''work_pattern_exception_events'',',
    '    ''payroll_export_runs'', case when p_role = ''owner'' then public.payroll_export_run_summaries(p_restaurant_id, p_from_date, p_to_date) else ''[]''::jsonb end,
    ''work_pattern_exception_events'','
  );
  if v_definition = v_before
      or position('''payroll_export_runs''' in v_definition) = 0 then
    raise exception 'Manager operations payroll lineage contract drifted.';
  end if;
  execute v_definition;
end
$extend_operations_read_model$;

revoke all on function public.reject_payroll_export_evidence_mutation()
  from public, anon, authenticated;
revoke all on function public.payroll_export_run_summaries(uuid,date,date)
  from public, anon, authenticated;
revoke all on function public.create_payroll_export_run(uuid,date,date)
  from public, anon, authenticated;
revoke all on function public.get_payroll_export_run(uuid,uuid)
  from public, anon, authenticated;

grant execute on function public.create_payroll_export_run(uuid,date,date)
  to authenticated;
grant execute on function public.get_payroll_export_run(uuid,uuid)
  to authenticated;

commit;
