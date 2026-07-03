-- Preconditions:
-- - Migration 013 has been applied.
-- - time_entries and save_actuals_lifecycle(uuid, text, jsonb) exist.
--
-- Rollback:
-- - Restore the prior check constraint and RPC definition from the
--   pre-deployment schema backup. No historical source value is rewritten.
--
-- Historical databases used more than one vocabulary for time-entry origin.
-- Preserve values already stored for audit truth, while making all new
-- application writes use one of two explicit canonical origins:
-- badge_terminal or manager_manual.

begin;

do $canonical_time_entry_source$
declare
  v_historical_sources text;
  v_allowed_sources text;
  v_definition text;
  v_repaired text;
begin
  select string_agg(quote_literal(source_value), ', ' order by source_value)
  into v_historical_sources
  from (
    select distinct t.source as source_value
    from public.time_entries t
    where nullif(btrim(t.source), '') is not null
      and t.source not in ('badge_terminal', 'manager_manual')
  ) historical;

  v_allowed_sources := concat_ws(
    ', ',
    quote_literal('badge_terminal'),
    quote_literal('manager_manual'),
    v_historical_sources
  );

  alter table public.time_entries
    drop constraint if exists time_entries_source_check;

  execute format(
    'alter table public.time_entries add constraint time_entries_source_check check (source in (%s))',
    v_allowed_sources
  );

  select pg_get_functiondef(
    'public.save_actuals_lifecycle(uuid,text,jsonb)'::regprocedure
  )
  into v_definition;

  v_repaired := replace(
    v_definition,
    '''manual'', v_new_status',
    '''manager_manual'', v_new_status'
  );

  if v_repaired = v_definition
      and position('''manager_manual'', v_new_status' in v_definition) = 0 then
    raise exception 'Actuals lifecycle does not contain the expected manual-entry source assignment.';
  end if;

  if v_repaired <> v_definition then
    execute v_repaired;
  end if;
end
$canonical_time_entry_source$;

commit;
