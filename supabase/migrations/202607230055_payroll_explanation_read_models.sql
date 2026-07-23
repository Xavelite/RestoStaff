-- V574: expose frozen calculation lineage through owner-only payroll read models.
begin;

do $patch$
declare
  v_oid oid := 'public.get_payroll_workspace(uuid,date,date)'::regprocedure::oid;
  v_definition text;
  v_next text;
  v_anchor text := $$    'component_lines', coalesce((select jsonb_agg(to_jsonb(l) order by l.employee_id, l.component_code, l.created_at) from public.payroll_component_lines l join public.payroll_runs r on r.id = l.payroll_run_id join public.payroll_periods p on p.id = r.payroll_period_id where l.restaurant_id = p_restaurant_id and p.period_start <= p_to_date and p.period_end >= p_from_date), '[]'::jsonb),$$;
begin
  v_definition := pg_get_functiondef(v_oid);
  v_next := replace(v_definition, v_anchor, v_anchor || $workspace$
    'component_sources', coalesce((select jsonb_agg(to_jsonb(s) order by s.payroll_component_line_id, s.source_type, s.created_at) from public.payroll_component_sources s join public.payroll_component_lines l on l.id = s.payroll_component_line_id join public.payroll_runs r on r.id = l.payroll_run_id join public.payroll_periods p on p.id = r.payroll_period_id where l.restaurant_id = p_restaurant_id and p.period_start <= p_to_date and p.period_end >= p_from_date), '[]'::jsonb),
    'employment_terms', coalesce((select jsonb_agg(to_jsonb(e) order by e.employee_id, e.valid_from desc) from public.employee_employment_terms e where e.restaurant_id = p_restaurant_id), '[]'::jsonb),
    'rules', coalesce((select jsonb_agg(to_jsonb(pr) order by pr.code) from public.payroll_rules pr join public.payroll_rule_sets rs on rs.id = pr.rule_set_id where rs.jurisdiction = 'BE' and rs.sector_code = 'CP302'), '[]'::jsonb),
    'legal_sources', coalesce((select jsonb_agg(to_jsonb(ls) order by ls.code) from public.payroll_legal_sources ls), '[]'::jsonb),
$workspace$);
  if v_next = v_definition then
    raise exception 'get_payroll_workspace component-line anchor no longer matches.';
  end if;
  execute v_next;
end
$patch$;

do $patch$
declare
  v_oid oid := 'public.get_payroll_catalogue(uuid)'::regprocedure::oid;
  v_definition text;
  v_next text;
  v_anchor text := $$    'benefits', coalesce((select jsonb_agg(to_jsonb(b) order by b.employee_id, b.valid_from desc) from public.employee_payroll_benefits b where b.restaurant_id = p_restaurant_id), '[]'::jsonb)$$;
begin
  v_definition := pg_get_functiondef(v_oid);
  v_next := replace(v_definition, v_anchor, v_anchor || $catalogue$
    , 'providers', coalesce((select jsonb_agg(to_jsonb(p) order by p.name) from public.payroll_providers p where p.active), '[]'::jsonb)
    , 'provider_components', coalesce((select jsonb_agg(to_jsonb(m) order by m.provider_id, m.provider_code) from public.payroll_provider_components m where m.active), '[]'::jsonb)
    , 'provider_employee_mappings', coalesce((select jsonb_agg(to_jsonb(m) order by m.provider_id, m.employee_id) from public.payroll_provider_employee_mappings m where m.restaurant_id = p_restaurant_id and m.active), '[]'::jsonb)
$catalogue$);
  if v_next = v_definition then
    raise exception 'get_payroll_catalogue benefit anchor no longer matches.';
  end if;
  execute v_next;
end
$patch$;

commit;
