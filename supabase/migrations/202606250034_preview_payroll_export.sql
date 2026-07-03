-- Draft payroll export (read-only preview).
--
-- Additive, no existing object is altered.
--
-- Why:
-- - The owner must be able to download a Payroll-format CSV at any time, even
--   before Actuals are approved, for review. That export must be clearly DRAFT
--   and must NOT create official lineage/history (no payroll_export_runs row,
--   no hash). Official, fingerprinted lineage stays exclusive to
--   create_payroll_export_run from approved Actuals (migration 0033).
--
-- Contract:
-- - Same owner-only boundary, same column allowlist, and the *same* per-entry
--   projection as create_payroll_export_run, so DRAFT and APPROVED files share
--   one source of truth (no frontend-only payroll data).
-- - No approval gate. No identity-completeness gate (missing payroll id / legal
--   name / national number export as blanks — it is a draft).
-- - Returns headers + rows + counts + an `approved` flag (true only when every
--   included week is approved/locked), but writes nothing.
--
-- Rollback: drop function public.preview_payroll_export(uuid, date, date, jsonb).
begin;

create or replace function public.preview_payroll_export(
  p_restaurant_id uuid,
  p_period_start date,
  p_period_end date,
  p_columns jsonb default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $preview_payroll_export$
declare
  v_profile_id uuid := public.current_profile_id();
  v_timezone text;
  v_week_count integer;
  v_approved_count integer;
  v_columns jsonb;
  v_headers jsonb;
  v_rows jsonb;
  v_row_count integer;
  v_total_minutes integer;
  v_approved boolean;
begin
  if v_profile_id is null then
    raise exception 'Authenticated session required.';
  end if;
  if not public.is_owner(p_restaurant_id) then
    raise exception 'Only an owner can export payroll.';
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

  -- Resolve and validate the column template (same allowlist as the official run).
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

  v_week_count := ((p_period_end - p_period_start + 1) / 7);
  select count(*)
  into v_approved_count
  from public.work_weeks w
  where w.restaurant_id = p_restaurant_id
    and w.week_start between p_period_start and p_period_end
    and w.actuals_status in ('approved', 'locked');
  v_approved := v_approved_count = v_week_count;

  select coalesce(nullif(btrim(s.timezone), ''), 'Europe/Brussels')
  into v_timezone
  from public.restaurant_settings s
  where s.restaurant_id = p_restaurant_id;
  v_timezone := coalesce(v_timezone, 'Europe/Brussels');

  -- Identical per-entry projection to create_payroll_export_run; chosen columns
  -- projected in order. No identity gate — a draft may have blanks.
  with export_entries as (
    select
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
    raise exception 'This period has no worked entries to export.';
  end if;

  v_headers := (
    select jsonb_agg(public.payroll_export_field_label(col) order by ord)
    from jsonb_array_elements_text(v_columns) with ordinality as c(col, ord)
  );

  return jsonb_build_object(
    'ok', true,
    'approved', v_approved,
    'restaurant_id', p_restaurant_id,
    'period_start', p_period_start,
    'period_end', p_period_end,
    'columns', v_columns,
    'headers', v_headers,
    'rows', v_rows,
    'row_count', v_row_count,
    'total_net_minutes', v_total_minutes
  );
end
$preview_payroll_export$;

revoke all on function public.preview_payroll_export(uuid, date, date, jsonb) from public, anon, authenticated;
grant execute on function public.preview_payroll_export(uuid, date, date, jsonb) to authenticated;

commit;
