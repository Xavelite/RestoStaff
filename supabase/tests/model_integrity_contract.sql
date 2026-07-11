-- Phase 7 final schema/model closure verification.
-- Safe to run repeatedly; fixture writes are rolled back.
begin;

do $phase7_schema$
declare
  v_access_default text;
  v_membership_default text;
  v_routine regprocedure;
begin
  select column_default
  into v_access_default
  from information_schema.columns
  where table_schema = 'public'
    and table_name = 'employee_access'
    and column_name = 'access_status';

  select column_default
  into v_membership_default
  from information_schema.columns
  where table_schema = 'public'
    and table_name = 'restaurant_memberships'
    and column_name = 'status';

  if v_access_default <> '''disabled''::text'
      or v_membership_default <> '''disabled''::text' then
    raise exception 'Access lifecycle defaults are not constraint-safe.';
  end if;

  if exists (
    select 1
    from pg_constraint c
    where c.conname in (
      'employee_contracts_employee_fk',
      'absences_employee_fk',
      'absence_events_absence_fk',
      'work_pattern_exceptions_employee_fk',
      'work_pattern_exception_events_exception_fk',
      'work_pattern_exception_events_employee_fk'
    )
      and c.confdeltype <> 'r'
  ) or (
    select count(*)
    from pg_constraint c
    where c.conname in (
      'employee_contracts_employee_fk',
      'absences_employee_fk',
      'absence_events_absence_fk',
      'work_pattern_exceptions_employee_fk',
      'work_pattern_exception_events_exception_fk',
      'work_pattern_exception_events_employee_fk'
    )
  ) <> 6 then
    raise exception 'Important employee history can still cascade away.';
  end if;

  if (
    select count(*)
    from pg_trigger t
    where not t.tgisinternal
      and t.tgname in (
        'absence_events_append_only',
        'work_pattern_exception_events_append_only',
        'employee_contracts_history_guard'
      )
  ) <> 3 then
    raise exception 'Append-only/history triggers are incomplete.';
  end if;

  if not exists (
    select 1
    from pg_indexes i
    where i.schemaname = 'public'
      and i.indexname = 'employee_contracts_employee_history_idx'
  ) then
    raise exception 'Contract history lookup index is missing.';
  end if;

  for v_routine in
    select p.oid::regprocedure
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    join pg_language l on l.oid = p.prolang
    where n.nspname = 'public'
      and l.lanname in ('sql', 'plpgsql')
      and not exists (
        select 1
        from pg_depend d
        where d.classid = 'pg_proc'::regclass
          and d.objid = p.oid
          and d.deptype = 'e'
      )
  loop
    if not exists (
      select 1
      from unnest(coalesce(
        (select p2.proconfig from pg_proc p2 where p2.oid = v_routine),
        array[]::text[]
      )) setting
      where setting like 'search_path=%'
    ) then
      raise exception 'Routine has no explicit search_path: %', v_routine;
    end if;
  end loop;
end
$phase7_schema$;

do $phase7_contract_history$
declare
  v_current_contract_id uuid;
  v_contract_id uuid;
  v_absence_event_id uuid;
begin
  select c.id
  into v_current_contract_id
  from public.employee_contracts c
  where c.active and c.is_current
  order by c.created_at
  limit 1;

  if v_current_contract_id is not null then
    update public.employee_contracts
    set annual_leave_entitlement_days =
      annual_leave_entitlement_days + 0.25
    where id = v_current_contract_id;

    begin
      delete from public.employee_contracts
      where id = v_current_contract_id;
      raise exception 'Current contract deletion was not blocked.';
    exception
      when others then
        if sqlerrm not like
            'Employment contracts are retained as operational history.%'
        then
          raise;
        end if;
    end;

    update public.employee_contracts
    set active = false, is_current = false
    where id = v_current_contract_id;

    begin
      update public.employee_contracts
      set annual_leave_entitlement_days =
        annual_leave_entitlement_days + 0.25
      where id = v_current_contract_id;
      raise exception 'Newly historical contract mutation was not blocked.';
    exception
      when others then
        if sqlerrm not like 'Historical employment contracts are immutable.%'
        then
          raise;
        end if;
    end;
  end if;

  select c.id
  into v_contract_id
  from public.employee_contracts c
  where not c.active or not c.is_current
  order by c.created_at
  limit 1;

  if v_contract_id is not null then
    begin
      update public.employee_contracts
      set annual_leave_entitlement_days =
        annual_leave_entitlement_days + 1
      where id = v_contract_id;
      raise exception 'Historical contract mutation was not blocked.';
    exception
      when others then
        if sqlerrm not like 'Historical employment contracts are immutable.%'
        then
          raise;
      end if;
    end;
  end if;

  select e.id
  into v_absence_event_id
  from public.absence_events e
  order by e.created_at
  limit 1;

  if v_absence_event_id is not null then
    begin
      update public.absence_events
      set event_type = event_type
      where id = v_absence_event_id;
      raise exception 'Absence event mutation was not blocked.';
    exception
      when others then
        if sqlerrm not like
            'absence_events is append-only operational evidence.%'
        then
          raise;
        end if;
    end;
  end if;
end
$phase7_contract_history$;

rollback;
