-- Phase 4 follow-up: canonical routine typing and lint integrity.
--
-- Preconditions:
-- - Migration 202606210021 is applied.
-- - The three canonical RPC signatures below exist.
--
-- Rollback:
-- - Restore the routine definitions captured before this migration.
-- - No tables, rows, public signatures or privileges are changed.
begin;

do $routine_lint_integrity$
declare
  v_definition text;
  v_before text;
begin
  select pg_get_functiondef(
    'public.save_actuals_lifecycle(uuid,text,jsonb)'::regprocedure
  ) into v_definition;
  v_before := v_definition;

  if position(
    '''open''::public.time_entry_status'
    in v_definition
  ) = 0 then
    v_definition := replace(
      v_definition,
      'when v_clock_out is null then ''open''
        else ''adjusted''',
      'when v_clock_out is null then ''open''::public.time_entry_status
        else ''adjusted''::public.time_entry_status'
    );
    if v_definition = v_before then
      raise exception 'Actuals status assignment contract drifted.';
    end if;
    execute v_definition;
  end if;

  select pg_get_functiondef(
    'public.save_employee_availability(uuid,uuid,jsonb)'::regprocedure
  ) into v_definition;
  v_before := v_definition;
  v_definition := regexp_replace(
    v_definition,
    E'\\s+v_to_date date;\\r?\\n',
    E'\n'
  );
  v_definition := regexp_replace(
    v_definition,
    E'\\s+min\\(\\(slot\\.value->>''date''\\)::date\\),\\r?\\n'
      || E'\\s+max\\(\\(slot\\.value->>''date''\\)::date\\)\\r?\\n'
      || E'\\s+into v_from_date, v_to_date',
    '    min((slot.value->>''date'')::date)
  into v_from_date',
    'n'
  );
  if v_definition = v_before
      or position('v_to_date' in v_definition) > 0 then
    raise exception 'Availability range lint contract drifted.';
  end if;
  execute v_definition;

  select pg_get_functiondef(
    'public.save_team_model(uuid,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb)'::regprocedure
  ) into v_definition;
  v_before := v_definition;
  v_definition := regexp_replace(
    v_definition,
    E'\\s+v_actor record;\\r?\\n',
    E'\n'
  );
  v_definition := regexp_replace(
    v_definition,
    E'\\s+select \\* into v_actor from public\\.require_owner_or_manager_context'
      || E'\\(p_restaurant_id\\) limit 1;',
    E'\n  perform 1 from public.require_owner_or_manager_context(p_restaurant_id);',
    'n'
  );
  if v_definition = v_before
      or position('v_actor record' in v_definition) > 0
      or position('into v_actor' in v_definition) > 0 then
    raise exception 'Team authorization lint contract drifted.';
  end if;
  execute v_definition;
end
$routine_lint_integrity$;

revoke all on function public.save_actuals_lifecycle(uuid,text,jsonb)
  from public, anon, authenticated;
grant execute on function public.save_actuals_lifecycle(uuid,text,jsonb)
  to authenticated;

revoke all on function public.save_employee_availability(uuid,uuid,jsonb)
  from public, anon, authenticated;
grant execute on function public.save_employee_availability(uuid,uuid,jsonb)
  to authenticated;

revoke all on function public.save_team_model(
  uuid,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb
) from public, anon, authenticated;
grant execute on function public.save_team_model(
  uuid,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb
) to authenticated;

commit;
