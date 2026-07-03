-- Phase 5 follow-up: complete two legitimate module-owned relationships.
--
-- Preconditions:
-- - Migration 202606210023 is applied.
--
-- Rollback:
-- - Restore both builder definitions from the pre-deployment schema snapshot.
-- - No rows, public signatures or grants change.
begin;

do $complete_read_model_ownership$
declare
  v_definition text;
  v_before text;
begin
  select pg_get_functiondef(
    'public.build_employee_operations_read_model(uuid,uuid,date,date)'::regprocedure
  ) into v_definition;
  v_before := v_definition;
  if position('''work_areas''' in v_definition) = 0 then
    v_definition := replace(
      v_definition,
      '    ''contract_types'', coalesce((select jsonb_agg(to_jsonb(ct) order by ct.sort_order) from public.contract_types ct where ct.restaurant_id = r.id and ct.active), ''[]''::jsonb),
    ''services''',
      '    ''contract_types'', coalesce((select jsonb_agg(to_jsonb(ct) order by ct.sort_order) from public.contract_types ct where ct.restaurant_id = r.id and ct.active), ''[]''::jsonb),
    ''work_areas'', coalesce((select jsonb_agg(to_jsonb(a) order by a.sort_order, a.name) from public.work_areas a where a.restaurant_id = r.id), ''[]''::jsonb),
    ''services'''
    );
    if v_definition = v_before then
      raise exception 'Employee work-area read contract drifted.';
    end if;
    execute v_definition;
  end if;

  select pg_get_functiondef(
    'public.build_team_read_model(uuid,text)'::regprocedure
  ) into v_definition;
  v_before := v_definition;
  if position('''restaurant_memberships''' in v_definition) = 0 then
    v_definition := replace(
      v_definition,
      '    ''restaurant_settings'', coalesce((select to_jsonb(s) from public.restaurant_settings s where s.restaurant_id = r.id), ''{}''::jsonb),
    ''employees''',
      '    ''restaurant_settings'', coalesce((select to_jsonb(s) from public.restaurant_settings s where s.restaurant_id = r.id), ''{}''::jsonb),
    ''restaurant_memberships'', coalesce((select jsonb_agg(to_jsonb(m)) from public.restaurant_memberships m where m.restaurant_id = r.id), ''[]''::jsonb),
    ''employees'''
    );
    if v_definition = v_before then
      raise exception 'Team membership read contract drifted.';
    end if;
    execute v_definition;
  end if;
end
$complete_read_model_ownership$;

revoke all on function public.build_employee_operations_read_model(uuid,uuid,date,date)
  from public, anon, authenticated;
revoke all on function public.build_team_read_model(uuid,text)
  from public, anon, authenticated;

commit;
