-- Belgian employment law splits staff into ouvrier (arbeider, blue-collar) and
-- employé (bediende, white-collar). The distinction drives payroll treatment,
-- notice periods and guaranteed pay, and it belongs to the contract rather than
-- the person: the same individual can hold a different status under a later
-- contract. It is deliberately independent of contract type (CDI/CDD/student/
-- extra) and of how someone is scheduled.
begin;

do $$
begin
  if not exists (select 1 from pg_type where typname = 'worker_status') then
    create type public.worker_status as enum ('blue_collar', 'white_collar');
  end if;
end
$$;

-- Nullable on purpose: existing contracts have no recorded status and we will
-- not invent one. The app shows it as "Not set" until someone chooses.
alter table public.employee_contracts
  add column if not exists worker_status public.worker_status;

comment on column public.employee_contracts.worker_status is
  'Belgian worker status: blue_collar (ouvrier/arbeider) or white_collar (employe/bediende). Null when not yet recorded.';

-- Teach save_team_model to persist it. The function is long and owned
-- elsewhere, so patch its definition textually rather than restating it, and
-- fail loudly if an anchor ever stops matching.
do $$
declare
  v_oid oid;
  v_def text;
  v_next text;
begin
  select p.oid into v_oid
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'save_team_model';

  if v_oid is null then
    raise exception 'save_team_model was not found; contract status cannot be persisted.';
  end if;

  v_def := pg_get_functiondef(v_oid);

  -- 1. Insert column list.
  v_next := replace(
    v_def,
    'annual_leave_entitlement_days, is_current, active',
    'annual_leave_entitlement_days, is_current, active, worker_status'
  );
  if v_next = v_def then
    raise exception 'save_team_model: contract insert column list no longer matches.';
  end if;
  v_def := v_next;

  -- 2. Matching value, appended last so it lines up with the column list.
  v_next := replace(
    v_def,
    '        true, true
      )',
    '        true, true, nullif(v_item->>''worker_status'', '''')::public.worker_status
      )'
  );
  if v_next = v_def then
    raise exception 'save_team_model: contract insert values no longer match.';
  end if;
  v_def := v_next;

  -- 3. Keep it updated on conflict too.
  v_next := replace(
    v_def,
    'annual_leave_entitlement_days = excluded.annual_leave_entitlement_days,',
    'annual_leave_entitlement_days = excluded.annual_leave_entitlement_days,
        worker_status = excluded.worker_status,'
  );
  if v_next = v_def then
    raise exception 'save_team_model: contract conflict clause no longer matches.';
  end if;

  execute v_next;
end
$$;

commit;
