-- Payroll export: configurable columns (MVP — one restaurant default).
--
-- Preconditions:
-- - 202606210027_payroll_export_lineage.sql is applied.
-- Product contract:
-- - The export stays an immutable, fingerprinted snapshot of approved Actuals.
-- - Columns come from a fixed server allowlist (the security boundary); the
--   chosen ordered column list is snapshotted into the run payload, so the hash
--   still covers exactly what was downloaded.
-- - One default column configuration per restaurant, stored in
--   restaurant_settings.payroll_export_columns (null = built-in default).
-- Rollback:
-- - Restore create_payroll_export_run from 202606210027 and drop the column /
--   helper / set RPC only if no configured export must be reproduced.
begin;

alter table public.restaurant_settings
  add column if not exists payroll_export_columns jsonb;

alter table public.restaurant_settings
  drop constraint if exists restaurant_settings_payroll_columns_check;
alter table public.restaurant_settings
  add constraint restaurant_settings_payroll_columns_check
  check (
    payroll_export_columns is null
    or (jsonb_typeof(payroll_export_columns) = 'array' and jsonb_array_length(payroll_export_columns) > 0)
  );

-- Allowlist + header labels. NULL label ⇒ the key is not a supported field, so
-- this doubles as the validation gate. Keep in sync with src/lib/payroll/payroll-export-columns.ts.
create or replace function public.payroll_export_field_label(p_key text)
returns text
language sql
immutable
as $payroll_field_label$
  select case p_key
    when 'payroll_id' then 'Employee payroll ID'
    when 'employee_name' then 'Employee name'
    when 'national_registry_number' then 'National registry number'
    when 'date' then 'Date'
    when 'time_range' then 'Time range'
    when 'service' then 'Service'
    when 'contract_type' then 'Contract type'
    when 'entry_type' then 'Entry type'
    when 'worked_hours' then 'Worked hours'
    when 'break_minutes' then 'Break minutes'
    when 'notes' then 'Notes'
    else null
  end
$payroll_field_label$;

revoke all on function public.payroll_export_field_label(text) from public, anon, authenticated;

-- New runs use schema_version 2 (payload now carries the column template).
alter table public.payroll_export_runs
  drop constraint if exists payroll_export_runs_schema_version_check;
alter table public.payroll_export_runs
  add constraint payroll_export_runs_schema_version_check
  check (schema_version in (1, 2));

-- Owner-only: persist the restaurant's default column configuration.
create or replace function public.set_payroll_export_columns(
  p_restaurant_id uuid,
  p_columns jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $set_payroll_columns$
declare
  v_profile_id uuid := public.current_profile_id();
begin
  if v_profile_id is null then
    raise exception 'Authenticated session required.';
  end if;
  if not public.is_owner(p_restaurant_id) then
    raise exception 'Only an owner can configure payroll export columns.';
  end if;
  if jsonb_typeof(p_columns) <> 'array' or jsonb_array_length(p_columns) = 0 then
    raise exception 'At least one export column is required.';
  end if;
  if exists (
    select 1
    from jsonb_array_elements_text(p_columns) as k(key)
    where public.payroll_export_field_label(k.key) is null
  ) then
    raise exception 'Unknown payroll export column requested.';
  end if;

  update public.restaurant_settings
  set payroll_export_columns = p_columns
  where restaurant_id = p_restaurant_id;

  return jsonb_build_object('ok', true, 'restaurant_id', p_restaurant_id, 'columns', p_columns);
end
$set_payroll_columns$;

revoke all on function public.set_payroll_export_columns(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.set_payroll_export_columns(uuid, jsonb) to authenticated;

-- Replace the export RPC: accept an optional ordered column list, fall back to
-- the restaurant default, then the built-in default. Everything else (approval
-- gate, identity completeness, source revisions, hashing, immutability) is
-- preserved from 202606210027.
drop function if exists public.create_payroll_export_run(uuid, date, date);

create function public.create_payroll_export_run(
  p_restaurant_id uuid,
  p_period_start date,
  p_period_end date,
  p_columns jsonb default null
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
  v_columns jsonb;
  v_require_nrn boolean;
  v_headers jsonb;
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

  -- Resolve and validate the column template.
  v_columns := coalesce(
    p_columns,
    (select s.payroll_export_columns from public.restaurant_settings s where s.restaurant_id = p_restaurant_id),
    '["payroll_id","employee_name","national_registry_number","date","time_range","service","entry_type","worked_hours","break_minutes","contract_type"]'::jsonb
  );
  if jsonb_typeof(v_columns) <> 'array' or jsonb_array_length(v_columns) = 0 then
    raise exception 'At least one export column is required.';
  end if;
  if exists (
    select 1
    from jsonb_array_elements_text(v_columns) as k(key)
    where public.payroll_export_field_label(k.key) is null
  ) then
    raise exception 'Unknown payroll export column requested.';
  end if;
  v_require_nrn := v_columns ? 'national_registry_number';

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

  -- Identity completeness: payroll id + legal name always; national number only
  -- when that column is part of the export.
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
      or nullif(btrim(e.first_name), '') is null
      or nullif(btrim(e.last_name), '') is null
      or (v_require_nrn and nullif(btrim(lp.national_registry_number), '') is null)
    );

  if v_missing is not null then
    raise exception 'Complete payroll ID, legal name%s for: %.',
      case when v_require_nrn then ' and national number' else '' end, v_missing;
  end if;

  -- Build the per-entry field object once, then project the chosen columns in
  -- order. No dynamic SQL — keys are validated against the allowlist above.
  with export_entries as (
    select
      t.id,
      t.revision,
      t.business_date,
      greatest(
        0,
        floor(extract(epoch from (t.clock_out_at - t.clock_in_at)) / 60) - t.break_minutes
      )::integer as net_minutes,
      jsonb_build_object(
        'payroll_id', coalesce(pp.payroll_employee_id, ''),
        'employee_name', btrim(coalesce(e.first_name, '') || ' ' || coalesce(e.last_name, '')),
        'national_registry_number', coalesce(lp.national_registry_number, ''),
        'date', t.business_date::text,
        'time_range',
          to_char(t.clock_in_at at time zone v_timezone, 'HH24:MI')
            || '–' || to_char(t.clock_out_at at time zone v_timezone, 'HH24:MI'),
        'service', initcap(t.service_key),
        'contract_type', coalesce(ct.code, ''),
        'entry_type',
          case
            when t.status = 'adjusted' or t.adjusted_at is not null then 'Corrected'
            else 'Worked'
          end,
        'worked_hours', round(
          greatest(0, floor(extract(epoch from (t.clock_out_at - t.clock_in_at)) / 60) - t.break_minutes)::numeric / 60,
          2
        ),
        'break_minutes', t.break_minutes,
        'notes', coalesce(t.adjustment_reason, '')
      ) as fields
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
        (
          select jsonb_agg(ee.fields -> col order by ord)
          from jsonb_array_elements_text(v_columns) with ordinality as c(col, ord)
        )
      ),
      '[]'::jsonb
    ),
    count(*)::integer,
    coalesce(sum(ee.net_minutes), 0)::integer
  into v_rows, v_row_count, v_total_minutes
  from export_entries ee;

  if v_row_count = 0 then
    raise exception 'The approved payroll period contains no worked entries.';
  end if;

  v_headers := (
    select jsonb_agg(public.payroll_export_field_label(col) order by ord)
    from jsonb_array_elements_text(v_columns) with ordinality as c(col, ord)
  );

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
    'schema_version', 2,
    'format', 'generic_csv',
    'restaurant_id', p_restaurant_id,
    'period_start', p_period_start,
    'period_end', p_period_end,
    'timezone', v_timezone,
    'columns', v_columns,
    'headers', v_headers,
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
    schema_version,
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
    2,
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

revoke all on function public.create_payroll_export_run(uuid, date, date, jsonb) from public, anon, authenticated;
grant execute on function public.create_payroll_export_run(uuid, date, date, jsonb) to authenticated;

commit;
