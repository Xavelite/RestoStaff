-- V578: make treatment lineage effective-dated and distinguish estimates from final payroll.
begin;

alter table public.payroll_runs drop constraint payroll_runs_status_check;
alter table public.payroll_runs add constraint payroll_runs_status_check check (status in (
  'draft', 'calculated', 'reviewed', 'locked_estimate',
  'reconciled', 'finalized', 'superseded'
));

alter table public.payroll_component_lines
  add column contribution_treatment text;
alter table public.payroll_component_lines
  add constraint payroll_component_lines_contribution_treatment_check check (
    contribution_treatment is null or contribution_treatment in (
      'ordinary', 'flexi', 'student_reduced', 'student_ordinary',
      'extra_ordinary', 'extra_special'
    )
  );

do $$
declare
  v_oid oid := 'public.payroll_readiness_report(uuid,date,date)'::regprocedure::oid;
  v_def text;
  v_next text;
  v_anchor text := '  return jsonb_build_object(';
begin
  v_def := pg_get_functiondef(v_oid);
  v_next := replace(v_def, v_anchor, $patch$
  v_blockers := v_blockers || coalesce((
    select jsonb_agg(distinct jsonb_build_object(
      'code', 'MONTHLY_SALARY_NOT_SUPPORTED',
      'employee_id', t.employee_id,
      'evidence', et.id,
      'message', 'Monthly salary proration is not implemented yet; this employee cannot be calculated or finalized.'
    ))
    from public.time_entries t
    join lateral (
      select x.* from public.employee_employment_terms x
      where x.restaurant_id = t.restaurant_id and x.employee_id = t.employee_id
        and x.active and x.valid_from <= t.business_date
        and (x.valid_to is null or x.valid_to >= t.business_date)
      order by x.valid_from desc, x.version_number desc limit 1
    ) et on true
    where t.restaurant_id = p_restaurant_id
      and t.business_date between p_period_start and p_period_end
      and t.status <> 'cancelled' and et.salary_basis = 'monthly'
  ), '[]'::jsonb);

$patch$ || v_anchor);
  if v_next = v_def then
    raise exception 'payroll_readiness_report return anchor no longer matches.';
  end if;
  execute v_next;
end
$$;

do $$
declare
  v_oid oid := 'public.calculate_payroll_run(uuid,date,date)'::regprocedure::oid;
  v_def text;
  v_next text;
  v_anchor text := '  -- Flexi holiday pay is a separate explainable component.';
begin
  v_def := pg_get_functiondef(v_oid);
  v_next := replace(v_def, v_anchor, $patch$
  -- Treatment belongs to the worked period, not permanently to the person.
  update public.payroll_component_lines l
  set contribution_treatment = case
    when et.employment_regime = 'flexi' then 'flexi'
    when et.employment_regime in ('student', 'student_reduced', 'student_ordinary') then
      case when et.employment_regime = 'student_reduced' or (
        et.employment_regime = 'student'
        and exists (
          select 1 from public.employee_regime_evidence quota
          where quota.restaurant_id = l.restaurant_id and quota.employee_id = l.employee_id
            and quota.evidence_type = 'student_quota' and quota.status = 'verified'
            and quota.valid_from <= p_period_start and (quota.valid_to is null or quota.valid_to >= p_period_end)
            and coalesce(quota.quota_minutes - quota.used_minutes, 0) >= (
              select coalesce(sum(x.quantity), 0)::integer
              from public.payroll_component_lines x
              join public.employee_employment_terms xt on xt.id = x.employment_terms_id
              where x.payroll_run_id = v_run_id and x.employee_id = l.employee_id
                and xt.employment_regime in ('student', 'student_reduced', 'student_ordinary')
                and x.component_code in ('BASE_PAY','STUDENT_PAY')
            )
        )
        and not exists (
          select 1 from public.time_entries te
          where te.restaurant_id = l.restaurant_id and te.employee_id = l.employee_id
            and te.business_date between p_period_start and p_period_end
            and te.status <> 'cancelled' and te.clock_out_at is not null
            and not exists (
              select 1 from public.employee_regime_evidence dimona
              where dimona.restaurant_id = te.restaurant_id and dimona.employee_id = te.employee_id
                and dimona.evidence_type = 'dimona' and dimona.status = 'verified'
                and dimona.valid_from <= te.business_date
                and (dimona.valid_to is null or dimona.valid_to >= te.business_date)
            )
        )
      ) then 'student_reduced' else 'student_ordinary' end
    when et.employment_regime = 'horeca_occasional' then 'extra_ordinary'
    else 'ordinary'
  end
  from public.employee_employment_terms et
  where l.payroll_run_id = v_run_id and l.employment_terms_id = et.id
    and l.component_code in ('BASE_PAY','FLEXI_BASE','STUDENT_PAY');

  insert into public.payroll_quota_movements (
    payroll_run_id, restaurant_id, employee_id, quota_type,
    movement_minutes, evidence_id
  )
  select v_run_id, l.restaurant_id, l.employee_id, 'student',
    sum(l.quantity)::integer, evidence.id
  from public.payroll_component_lines l
  join lateral (
    select e.id from public.employee_regime_evidence e
    where e.restaurant_id = l.restaurant_id and e.employee_id = l.employee_id
      and e.evidence_type = 'student_quota' and e.status = 'verified'
      and e.valid_from <= p_period_start and (e.valid_to is null or e.valid_to >= p_period_end)
    order by e.valid_from desc limit 1
  ) evidence on true
  where l.payroll_run_id = v_run_id and l.contribution_treatment = 'student_reduced'
    and l.component_code in ('BASE_PAY','STUDENT_PAY')
  group by l.restaurant_id, l.employee_id, evidence.id;

$patch$ || v_anchor);
  if v_next = v_def then
    raise exception 'calculate_payroll_run treatment anchor no longer matches.';
  end if;
  execute v_next;
end
$$;

do $$
declare
  v_oid oid := 'public.calculate_payroll_run(uuid,date,date)'::regprocedure::oid;
  v_def text;
  v_next text;
  v_start integer;
  v_finish integer;
  v_start_anchor text := '  -- Social contributions by effective regime.';
  v_end_anchor text := '  -- Manual withholding is an estimate, never an official formula claim.';
begin
  v_def := pg_get_functiondef(v_oid);
  v_start := position(v_start_anchor in v_def);
  v_finish := position(v_end_anchor in v_def);
  if v_start = 0 or v_finish <= v_start then
    raise exception 'calculate_payroll_run contribution anchors no longer match.';
  end if;
  v_next := substring(v_def from 1 for v_start - 1) || $replacement$
  -- Social contributions grouped by the exact effective terms and treatment.
  with bases as (
    select er.id as result_id, l.restaurant_id, l.employee_id,
      l.employment_terms_id, l.contribution_treatment, et.worker_status,
      sum(l.social_security_base_cents)::bigint as social_base_cents,
      sum(l.gross_amount_cents)::bigint as gross_cents
    from public.payroll_component_lines l
    join public.payroll_employee_results er
      on er.payroll_run_id = l.payroll_run_id and er.employee_id = l.employee_id
    join public.employee_employment_terms et on et.id = l.employment_terms_id
    where l.payroll_run_id = v_run_id
      and l.component_code in ('BASE_PAY','FLEXI_BASE','STUDENT_PAY')
    group by er.id, l.restaurant_id, l.employee_id, l.employment_terms_id,
      l.contribution_treatment, et.worker_status
  )
  insert into public.payroll_component_lines (
    payroll_run_id, payroll_employee_result_id, restaurant_id, employee_id,
    component_code, quantity, unit, rate, multiplier_basis_points,
    employee_contribution_cents, net_impact_cents, rule_id,
    employment_terms_id, contribution_treatment, source_hash, explanation
  )
  select v_run_id, b.result_id, b.restaurant_id, b.employee_id,
    case when b.contribution_treatment = 'student_reduced' then 'STUDENT_SOLIDARITY' else 'EMPLOYEE_ONSS' end,
    b.social_base_cents, 'amount',
    case when b.contribution_treatment = 'student_reduced' then 0.0271
         when b.contribution_treatment = 'flexi' then 0 else 0.1307 end,
    case when b.contribution_treatment = 'student_reduced' then 271
         when b.contribution_treatment = 'flexi' then 0 else 1307 end,
    case when b.contribution_treatment = 'student_reduced' then round(b.social_base_cents * 0.0271)::bigint
         when b.contribution_treatment = 'flexi' then 0
         else round(b.social_base_cents * 0.1307)::bigint end,
    case when b.contribution_treatment = 'student_reduced' then -round(b.social_base_cents * 0.0271)::bigint
         when b.contribution_treatment = 'flexi' then 0
         else -round(b.social_base_cents * 0.1307)::bigint end,
    pr.id, b.employment_terms_id, b.contribution_treatment,
    encode(digest(convert_to(b.employee_id::text || ':' || b.employment_terms_id::text || ':' || b.contribution_treatment || ':employee-social', 'UTF8'), 'sha256'), 'hex'),
    case when b.contribution_treatment = 'student_reduced' then '2.71% student solidarity contribution for this evidenced period.'
         when b.contribution_treatment = 'flexi' then 'No employee social deduction for this evidenced flexi period.'
         else '13.07% ordinary employee ONSS before any verified work bonus.' end
  from bases b
  left join public.payroll_rules pr on pr.rule_set_id = v_configuration.rule_set_id
    and pr.code = case when b.contribution_treatment = 'student_reduced' then 'STUDENT_EMPLOYEE_SOLIDARITY'
      when b.contribution_treatment = 'flexi' then 'FLEXI_HOLIDAY_PAY' else 'ORDINARY_EMPLOYEE_ONSS' end;

  with bases as (
    select er.id as result_id, l.restaurant_id, l.employee_id,
      l.employment_terms_id, l.contribution_treatment,
      sum(l.social_security_base_cents)::bigint as social_base_cents,
      sum(l.gross_amount_cents)::bigint as gross_cents
    from public.payroll_component_lines l
    join public.payroll_employee_results er
      on er.payroll_run_id = l.payroll_run_id and er.employee_id = l.employee_id
    where l.payroll_run_id = v_run_id
      and l.component_code in ('BASE_PAY','FLEXI_BASE','STUDENT_PAY')
    group by er.id, l.restaurant_id, l.employee_id, l.employment_terms_id,
      l.contribution_treatment
  )
  insert into public.payroll_component_lines (
    payroll_run_id, payroll_employee_result_id, restaurant_id, employee_id,
    component_code, quantity, unit, rate, multiplier_basis_points,
    employer_contribution_cents, employer_cost_impact_cents, rule_id,
    employment_terms_id, contribution_treatment, source_hash, explanation
  )
  select v_run_id, b.result_id, b.restaurant_id, b.employee_id,
    case when b.contribution_treatment = 'flexi' then 'FLEXI_EMPLOYER_CONTRIBUTION'
         when b.contribution_treatment = 'student_reduced' then 'STUDENT_EMPLOYER_SOLIDARITY'
         else 'EMPLOYER_ONSS_BASE' end,
    case when b.contribution_treatment = 'flexi' then b.gross_cents else b.social_base_cents end,
    'amount',
    case when b.contribution_treatment = 'flexi' then 0.28
         when b.contribution_treatment = 'student_reduced' then 0.0542 else 0.2492 end,
    case when b.contribution_treatment = 'flexi' then 2800
         when b.contribution_treatment = 'student_reduced' then 542 else 2492 end,
    case when b.contribution_treatment = 'flexi' then round(b.gross_cents * 0.28)::bigint
         when b.contribution_treatment = 'student_reduced' then round(b.social_base_cents * 0.0542)::bigint
         else round(b.social_base_cents * 0.2492)::bigint end,
    case when b.contribution_treatment = 'flexi' then round(b.gross_cents * 0.28)::bigint
         when b.contribution_treatment = 'student_reduced' then round(b.social_base_cents * 0.0542)::bigint
         else round(b.social_base_cents * 0.2492)::bigint end,
    pr.id, b.employment_terms_id, b.contribution_treatment,
    encode(digest(convert_to(b.employee_id::text || ':' || b.employment_terms_id::text || ':' || b.contribution_treatment || ':employer-social', 'UTF8'), 'sha256'), 'hex'),
    case when b.contribution_treatment = 'flexi' then '28% employer flexi contribution for this evidenced period.'
         when b.contribution_treatment = 'student_reduced' then '5.42% employer student solidarity contribution for this evidenced period.'
         else '24.92% private-sector employer base contribution before category additions and reductions.' end
  from bases b
  join public.payroll_rules pr on pr.rule_set_id = v_configuration.rule_set_id
    and pr.code = case when b.contribution_treatment = 'flexi' then 'FLEXI_EMPLOYER_CONTRIBUTION'
      when b.contribution_treatment = 'student_reduced' then 'STUDENT_EMPLOYER_SOLIDARITY'
      else 'ORDINARY_EMPLOYER_BASE' end;

  with bases as (
    select er.id as result_id, l.restaurant_id, l.employee_id,
      l.employment_terms_id, l.contribution_treatment,
      sum(l.social_security_base_cents)::bigint as social_base_cents
    from public.payroll_component_lines l
    join public.payroll_employee_results er
      on er.payroll_run_id = l.payroll_run_id and er.employee_id = l.employee_id
    join public.employee_employment_terms et on et.id = l.employment_terms_id
    where l.payroll_run_id = v_run_id and et.worker_status = 'blue_collar'
      and l.contribution_treatment not in ('flexi','student_reduced')
      and l.component_code in ('BASE_PAY','STUDENT_PAY')
    group by er.id, l.restaurant_id, l.employee_id, l.employment_terms_id,
      l.contribution_treatment
  )
  insert into public.payroll_component_lines (
    payroll_run_id, payroll_employee_result_id, restaurant_id, employee_id,
    component_code, quantity, unit, rate, multiplier_basis_points,
    employer_contribution_cents, employer_cost_impact_cents, rule_id,
    employment_terms_id, contribution_treatment, source_hash, explanation
  )
  select v_run_id, b.result_id, b.restaurant_id, b.employee_id, v.component_code,
    b.social_base_cents, 'amount', v.rate, v.bps,
    round(b.social_base_cents * v.rate)::bigint,
    round(b.social_base_cents * v.rate)::bigint,
    pr.id, b.employment_terms_id, b.contribution_treatment,
    encode(digest(convert_to(b.employee_id::text || ':' || b.employment_terms_id::text || ':' || v.component_code, 'UTF8'), 'sha256'), 'hex'),
    v.explanation
  from bases b
  cross join (values
    ('BLUE_COLLAR_VACATION_QUARTERLY', 0.0557::numeric, 557, '5.57% quarterly vacation contribution on this term version''s 108% base.'),
    ('BLUE_COLLAR_VACATION_ANNUAL_PROVISION', 0.1027::numeric, 1027, '10.27% annual vacation debit provision on this term version''s 108% base.')
  ) v(component_code, rate, bps, explanation)
  join public.payroll_rules pr on pr.rule_set_id = v_configuration.rule_set_id
    and pr.code = case v.component_code
      when 'BLUE_COLLAR_VACATION_QUARTERLY' then 'BLUE_COLLAR_VACATION_QUARTERLY'
      else 'BLUE_COLLAR_VACATION_ANNUAL' end;

$replacement$ || substring(v_def from v_finish);
  execute v_next;
end
$$;

create or replace function public.set_payroll_run_status(
  p_restaurant_id uuid,
  p_payroll_run_id uuid,
  p_status text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_run public.payroll_runs%rowtype;
begin
  if not public.is_owner(p_restaurant_id) then
    raise exception 'Only an owner can change payroll status.';
  end if;
  select * into v_run from public.payroll_runs
  where restaurant_id = p_restaurant_id and id = p_payroll_run_id for update;
  if v_run.id is null then raise exception 'Payroll run not found.'; end if;

  if v_run.status = 'calculated' and p_status = 'reviewed' then
    update public.payroll_runs set status = 'reviewed', reviewed_at = now(),
      reviewed_by_profile_id = public.current_profile_id() where id = v_run.id;
  elsif v_run.status = 'reviewed' and p_status = 'locked_estimate' then
    update public.payroll_runs set status = 'locked_estimate' where id = v_run.id;
  elsif v_run.status in ('reviewed','locked_estimate') and p_status = 'reconciled' then
    if not exists (
      select 1 from public.payroll_reconciliations r where r.payroll_run_id = v_run.id
    ) then
      raise exception 'Import and reconcile authoritative provider results first.';
    end if;
    if exists (
      select 1 from public.payroll_reconciliations r
      where r.payroll_run_id = v_run.id and r.status <> 'resolved'
    ) then
      raise exception 'Resolve every provider variance before reconciliation.';
    end if;
    update public.payroll_runs set status = 'reconciled', calculation_quality = 'reconciled',
      reconciled_at = now(), reconciled_by_profile_id = public.current_profile_id()
    where id = v_run.id;
  elsif v_run.status = 'reconciled' and p_status = 'finalized' then
    update public.payroll_runs set status = 'finalized', finalized_at = now(),
      finalized_by_profile_id = public.current_profile_id() where id = v_run.id;
    update public.payroll_periods set status = 'closed' where id = v_run.payroll_period_id;
  else
    raise exception 'Unsupported payroll status transition from % to %.', v_run.status, p_status;
  end if;
  return jsonb_build_object('ok', true, 'status', p_status);
end
$$;

comment on column public.payroll_component_lines.contribution_treatment is
  'Period-specific payroll treatment determined from effective terms and verified evidence; not a permanent employee identity.';

commit;
