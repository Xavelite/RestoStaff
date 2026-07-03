-- Read-only proof that migrations 012-014 are already represented by the
-- deployed schema before their migration-history entries are repaired.
begin;

do $phase0_ledger_proof$
declare
  v_definition text;
  v_source_constraint text;
begin
  if to_regprocedure('public.save_actuals_lifecycle(uuid,text,jsonb)') is null then
    raise exception 'Migration 012 contract is missing: save_actuals_lifecycle.';
  end if;

  select pg_get_functiondef(
    'public.save_actuals_lifecycle(uuid,text,jsonb)'::regprocedure
  )
  into v_definition;

  if position('expected_updated_at' in v_definition) = 0
      or position('time_entry_adjustments' in v_definition) = 0
      or position('actuals_approved' in v_definition) = 0
      or position('actuals_reopened' in v_definition) = 0 then
    raise exception 'Migration 012 Actuals lifecycle does not match the canonical contract.';
  end if;

  if to_regprocedure('public.active_membership_role(uuid,uuid)') is null then
    raise exception 'Migration 013 contract is missing: active_membership_role.';
  end if;

  foreach v_definition in array array[
    pg_get_functiondef('public.save_actuals_lifecycle(uuid,text,jsonb)'::regprocedure),
    pg_get_functiondef(
      'public.save_schedule_exception_lifecycle(uuid,uuid,uuid,text,jsonb)'::regprocedure
    ),
    pg_get_functiondef(
      'public.save_manager_planning(uuid,date,text,jsonb,jsonb,timestamptz)'::regprocedure
    )
  ]
  loop
    if position('active_membership_role(p_restaurant_id' in v_definition) = 0 then
      raise exception 'Migration 013 actor-role repair is missing from a manager mutation.';
    end if;
  end loop;

  select pg_get_constraintdef(c.oid)
  into v_source_constraint
  from pg_constraint c
  where c.conrelid = 'public.time_entries'::regclass
    and c.conname = 'time_entries_source_check';

  if v_source_constraint is null
      or position('badge_terminal' in v_source_constraint) = 0
      or position('manager_manual' in v_source_constraint) = 0 then
    raise exception 'Migration 014 canonical time-entry source constraint is missing.';
  end if;

  select pg_get_functiondef(
    'public.save_actuals_lifecycle(uuid,text,jsonb)'::regprocedure
  )
  into v_definition;

  if position('''manager_manual'', v_new_status' in v_definition) = 0 then
    raise exception 'Migration 014 manager_manual write contract is missing.';
  end if;
end
$phase0_ledger_proof$;

rollback;
