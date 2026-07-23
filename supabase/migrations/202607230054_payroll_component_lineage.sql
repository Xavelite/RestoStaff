-- V573: preserve the complete evidence graph behind every calculated component.
begin;

do $$
declare
  v_oid oid := 'public.calculate_payroll_run(uuid,date,date)'::regprocedure::oid;
  v_definition text;
  v_next text;
  v_anchor text := '  -- Final employee and run totals from component evidence.';
begin
  v_definition := pg_get_functiondef(v_oid);
  v_next := replace(v_definition, v_anchor, $lineage$
  insert into public.payroll_component_sources (
    payroll_component_line_id, source_type, source_id, source_revision,
    source_date, source_snapshot
  )
  select l.id, 'break_interval', b.id, b.entry_revision, t.business_date,
    jsonb_build_object(
      'break_started_at', b.break_started_at,
      'break_ended_at', b.break_ended_at,
      'duration_seconds', b.duration_seconds,
      'evidence_kind', b.evidence_kind,
      'source', b.source
    )
  from public.payroll_component_lines l
  join public.time_entries t
    on l.source_hash = encode(digest(convert_to(t.id::text || ':' || t.revision::text, 'UTF8'), 'sha256'), 'hex')
  join public.time_entry_break_intervals b
    on b.restaurant_id = t.restaurant_id and b.time_entry_id = t.id and b.active
  where l.payroll_run_id = v_run_id;

  insert into public.payroll_component_sources (
    payroll_component_line_id, source_type, source_id, source_revision,
    source_date, source_snapshot
  )
  select l.id, 'employment_terms', et.id, et.version_number, et.valid_from,
    jsonb_build_object(
      'valid_from', et.valid_from, 'valid_to', et.valid_to,
      'employment_regime', et.employment_regime,
      'worker_status', et.worker_status, 'salary_basis', et.salary_basis,
      'cp302_category', et.cp302_category,
      'contractual_hourly_rate', et.contractual_hourly_rate,
      'contractual_monthly_salary_cents', et.contractual_monthly_salary_cents
    )
  from public.payroll_component_lines l
  join public.employee_employment_terms et on et.id = l.employment_terms_id
  where l.payroll_run_id = v_run_id;

  insert into public.payroll_component_sources (
    payroll_component_line_id, source_type, source_id, source_date, source_snapshot
  )
  select l.id, 'benefit', b.id, b.valid_from,
    jsonb_build_object(
      'component_code', b.component_code, 'amount_cents', b.amount_cents,
      'quantity', b.quantity, 'employer_share_cents', b.employer_share_cents,
      'employee_share_cents', b.employee_share_cents,
      'taxable', b.taxable, 'social_security', b.social_security,
      'evidence_status', b.evidence_status
    )
  from public.payroll_component_lines l
  join public.employee_payroll_benefits b
    on l.source_hash = encode(digest(convert_to(b.id::text, 'UTF8'), 'sha256'), 'hex')
  where l.payroll_run_id = v_run_id;

  insert into public.payroll_component_sources (
    payroll_component_line_id, source_type, source_id, source_date, source_snapshot
  )
  select l.id, 'adjustment', a.id, a.effective_date,
    jsonb_build_object(
      'component_code', a.component_code, 'amount_cents', a.amount_cents,
      'taxable_amount_cents', a.taxable_amount_cents,
      'social_security_base_cents', a.social_security_base_cents,
      'net_impact_cents', a.net_impact_cents,
      'employer_cost_impact_cents', a.employer_cost_impact_cents,
      'reason', a.reason
    )
  from public.payroll_component_lines l
  join public.employee_payroll_adjustments a
    on l.source_hash = encode(digest(convert_to(a.id::text, 'UTF8'), 'sha256'), 'hex')
  where l.payroll_run_id = v_run_id;

  insert into public.payroll_component_sources (
    payroll_component_line_id, source_type, source_id, source_revision,
    source_date, source_snapshot
  )
  select l.id, 'tax_profile', tp.id, tp.version_number, tp.valid_from,
    jsonb_build_object(
      'valid_from', tp.valid_from, 'valid_to', tp.valid_to,
      'resident_status', tp.resident_status,
      'civil_status', tp.civil_status,
      'partner_income_category', tp.partner_income_category,
      'dependent_children', tp.dependent_children,
      'other_dependants', tp.other_dependants,
      'disability_status', tp.disability_status,
      'withholding_treatment', tp.withholding_treatment,
      'manual_withholding_basis_points', tp.manual_withholding_basis_points,
      'evidence_status', tp.evidence_status
    )
  from public.payroll_component_lines l
  join public.payroll_employee_results er on er.id = l.payroll_employee_result_id
  join public.employee_tax_profiles tp
    on l.source_hash = encode(digest(convert_to(tp.id::text || ':' || er.id::text, 'UTF8'), 'sha256'), 'hex')
  where l.payroll_run_id = v_run_id;

$lineage$ || v_anchor);
  if v_next = v_definition then
    raise exception 'calculate_payroll_run lineage anchor no longer matches.';
  end if;
  execute v_next;
end
$$;

commit;
