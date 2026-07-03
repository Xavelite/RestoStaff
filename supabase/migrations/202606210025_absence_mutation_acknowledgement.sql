-- Phase 5 follow-up: complete the absence mutation acknowledgement.
--
-- Preconditions:
-- - Migration 202606210023 is applied.
--
-- Rollback:
-- - Restore save_absence_lifecycle from the pre-deployment schema snapshot.
-- - No rows or public signatures change.
begin;

do $absence_acknowledgement$
declare
  v_definition text;
  v_before text;
begin
  select replace(
    pg_get_functiondef(
      'public.save_absence_lifecycle(uuid,uuid,uuid,text,jsonb)'::regprocedure
    ),
    chr(13),
    ''
  ) into v_definition;
  v_before := v_definition;

  if position('''restaurant_id'', p_restaurant_id' in v_definition) = 0 then
    v_definition := replace(
      v_definition,
      '    ''ok'', true,
    ''absence_id''',
      '    ''ok'', true,
    ''restaurant_id'', p_restaurant_id,
    ''absence_id'''
    );
    if v_definition = v_before then
      raise exception 'Absence acknowledgement contract drifted.';
    end if;
    execute v_definition;
  end if;
end
$absence_acknowledgement$;

revoke all on function public.save_absence_lifecycle(uuid,uuid,uuid,text,jsonb)
  from public, anon, authenticated;
grant execute on function public.save_absence_lifecycle(uuid,uuid,uuid,text,jsonb)
  to authenticated;

commit;
