-- V571: owner evidence mutations and provider export/reconciliation workflows.
begin;

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
    select jsonb_agg(jsonb_build_object(
      'code', 'MISSING_REGIME_EVIDENCE',
      'employee_id', q.employee_id,
      'evidence', q.employment_terms_id,
      'message', q.message
    ))
    from (
      select distinct t.employee_id, et.id as employment_terms_id,
        case et.employment_regime
          when 'flexi' then 'Verify flexi eligibility and Dimona evidence for this period.'
          when 'student_reduced' then 'Verify the student reduced-contribution quota for this period.'
          when 'horeca_occasional' then 'Verify the horeca occasional-worker quota and Dimona evidence.'
        end as message,
        case et.employment_regime
          when 'flexi' then 'flexi_eligibility'
          when 'student_reduced' then 'student_quota'
          when 'horeca_occasional' then 'occasional_quota'
        end as required_evidence
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
        and t.status <> 'cancelled'
        and et.employment_regime in ('flexi', 'student_reduced', 'horeca_occasional')
    ) q
    where not exists (
      select 1 from public.employee_regime_evidence e
      where e.restaurant_id = p_restaurant_id and e.employee_id = q.employee_id
        and e.evidence_type = q.required_evidence and e.status = 'verified'
        and e.valid_from <= p_period_start and (e.valid_to is null or e.valid_to >= p_period_end)
        and (e.quota_minutes is null or e.used_minutes < e.quota_minutes)
    )
  ), '[]'::jsonb);

  v_warnings := v_warnings || coalesce((
    select jsonb_agg(jsonb_build_object(
      'code', 'TAX_PROFILE_NOT_VERIFIED',
      'employee_id', e.employee_id,
      'evidence', e.employee_id,
      'message', 'Net salary will remain an estimate until the tax profile and official withholding are verified.',
      'accepted', false
    ))
    from (
      select distinct t.employee_id
      from public.time_entries t
      where t.restaurant_id = p_restaurant_id
        and t.business_date between p_period_start and p_period_end
        and t.status <> 'cancelled'
    ) e
    where not exists (
      select 1 from public.employee_tax_profiles tp
      where tp.restaurant_id = p_restaurant_id and tp.employee_id = e.employee_id
        and tp.active and tp.evidence_status = 'verified'
        and tp.valid_from <= p_period_start and (tp.valid_to is null or tp.valid_to >= p_period_end)
    )
  ), '[]'::jsonb);

$patch$ || v_anchor);
  if v_next = v_def then
    raise exception 'payroll_readiness_report return anchor no longer matches.';
  end if;
  execute v_next;
end
$$;

create function public.save_employee_tax_profile(
  p_restaurant_id uuid,
  p_employee_id uuid,
  p_profile jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_from date := nullif(p_profile->>'valid_from', '')::date;
  v_previous public.employee_tax_profiles%rowtype;
  v_version integer;
  v_id uuid;
begin
  if not public.is_owner(p_restaurant_id) then raise exception 'Only an owner can change tax profiles.'; end if;
  if v_from is null then raise exception 'A tax-profile effective date is required.'; end if;
  select * into v_previous from public.employee_tax_profiles t
  where t.restaurant_id = p_restaurant_id and t.employee_id = p_employee_id
    and t.active and t.valid_from <= v_from and (t.valid_to is null or t.valid_to >= v_from)
  order by t.valid_from desc limit 1 for update;
  if v_previous.id is not null then
    update public.employee_tax_profiles set active = false,
      valid_to = case when v_previous.valid_from < v_from then v_from - 1 else v_previous.valid_to end
    where id = v_previous.id;
  end if;
  select coalesce(max(version_number), 0) + 1 into v_version
  from public.employee_tax_profiles where restaurant_id = p_restaurant_id and employee_id = p_employee_id;
  insert into public.employee_tax_profiles (
    restaurant_id, employee_id, valid_from, valid_to, version_number,
    resident_status, civil_status, partner_income_category,
    dependent_children, other_dependants, disability_status,
    withholding_treatment, manual_withholding_basis_points,
    evidence_status, created_by_profile_id
  ) values (
    p_restaurant_id, p_employee_id, v_from, nullif(p_profile->>'valid_to', '')::date, v_version,
    nullif(btrim(p_profile->>'resident_status'), ''),
    nullif(btrim(p_profile->>'civil_status'), ''),
    nullif(btrim(p_profile->>'partner_income_category'), ''),
    coalesce(nullif(p_profile->>'dependent_children', '')::integer, 0),
    coalesce(nullif(p_profile->>'other_dependants', '')::integer, 0),
    nullif(btrim(p_profile->>'disability_status'), ''),
    nullif(btrim(p_profile->>'withholding_treatment'), ''),
    nullif(p_profile->>'manual_withholding_basis_points', '')::integer,
    coalesce(nullif(p_profile->>'evidence_status', ''), 'recorded'),
    public.current_profile_id()
  ) returning id into v_id;
  return jsonb_build_object('ok', true, 'tax_profile_id', v_id, 'version_number', v_version);
end
$$;

create function public.record_employee_regime_evidence(
  p_restaurant_id uuid,
  p_employee_id uuid,
  p_evidence jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare v_id uuid;
begin
  if not public.is_owner(p_restaurant_id) then raise exception 'Only an owner can record payroll evidence.'; end if;
  insert into public.employee_regime_evidence (
    restaurant_id, employee_id, evidence_type, valid_from, valid_to,
    status, reference, quota_minutes, used_minutes, metadata,
    created_by_profile_id
  ) values (
    p_restaurant_id, p_employee_id,
    p_evidence->>'evidence_type', (p_evidence->>'valid_from')::date,
    nullif(p_evidence->>'valid_to', '')::date,
    coalesce(nullif(p_evidence->>'status', ''), 'draft'),
    nullif(btrim(p_evidence->>'reference'), ''),
    nullif(p_evidence->>'quota_minutes', '')::integer,
    coalesce(nullif(p_evidence->>'used_minutes', '')::integer, 0),
    coalesce(p_evidence->'metadata', '{}'::jsonb),
    public.current_profile_id()
  ) returning id into v_id;
  return jsonb_build_object('ok', true, 'evidence_id', v_id);
end
$$;

create function public.save_employee_payroll_benefit(
  p_restaurant_id uuid,
  p_employee_id uuid,
  p_benefit jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare v_id uuid;
begin
  if not public.is_owner(p_restaurant_id) then raise exception 'Only an owner can change payroll benefits.'; end if;
  update public.employee_payroll_benefits set active = false
  where restaurant_id = p_restaurant_id and employee_id = p_employee_id
    and component_code = p_benefit->>'component_code' and active;
  insert into public.employee_payroll_benefits (
    restaurant_id, employee_id, component_code, valid_from, valid_to,
    amount_cents, quantity, employer_share_cents, employee_share_cents,
    taxable, social_security, evidence_status, notes,
    created_by_profile_id
  ) values (
    p_restaurant_id, p_employee_id, p_benefit->>'component_code',
    (p_benefit->>'valid_from')::date, nullif(p_benefit->>'valid_to', '')::date,
    nullif(p_benefit->>'amount_cents', '')::bigint,
    nullif(p_benefit->>'quantity', '')::numeric,
    nullif(p_benefit->>'employer_share_cents', '')::bigint,
    nullif(p_benefit->>'employee_share_cents', '')::bigint,
    coalesce((p_benefit->>'taxable')::boolean, false),
    coalesce((p_benefit->>'social_security')::boolean, false),
    coalesce(nullif(p_benefit->>'evidence_status', ''), 'recorded'),
    nullif(btrim(p_benefit->>'notes'), ''), public.current_profile_id()
  ) returning id into v_id;
  return jsonb_build_object('ok', true, 'benefit_id', v_id);
end
$$;

create function public.save_payroll_provider_mapping(
  p_restaurant_id uuid,
  p_provider_id uuid,
  p_mapping_type text,
  p_payload jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare v_id uuid;
begin
  if not public.is_owner(p_restaurant_id) then raise exception 'Only an owner can configure payroll providers.'; end if;
  if p_mapping_type = 'component' then
    insert into public.payroll_provider_components (
      provider_id, component_code, provider_code, provider_label, valid_from
    ) values (
      p_provider_id, p_payload->>'component_code', btrim(p_payload->>'provider_code'),
      btrim(p_payload->>'provider_label'), (p_payload->>'valid_from')::date
    ) returning id into v_id;
  elsif p_mapping_type = 'employee' then
    insert into public.payroll_provider_employee_mappings (
      restaurant_id, provider_id, employee_id, external_employee_id,
      valid_from, created_by_profile_id
    ) values (
      p_restaurant_id, p_provider_id, (p_payload->>'employee_id')::uuid,
      btrim(p_payload->>'external_employee_id'), (p_payload->>'valid_from')::date,
      public.current_profile_id()
    ) returning id into v_id;
  else
    raise exception 'Unsupported provider mapping type.';
  end if;
  return jsonb_build_object('ok', true, 'mapping_id', v_id);
end
$$;

create function public.create_payroll_provider_export(
  p_restaurant_id uuid,
  p_payroll_run_id uuid,
  p_provider_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_run public.payroll_runs%rowtype;
  v_missing text;
  v_payload jsonb;
  v_hash text;
  v_id uuid;
begin
  if not public.is_owner(p_restaurant_id) then raise exception 'Only an owner can export payroll.'; end if;
  select * into v_run from public.payroll_runs where id = p_payroll_run_id and restaurant_id = p_restaurant_id;
  if v_run.status not in ('reviewed', 'reconciled', 'finalized') then
    raise exception 'Review the payroll run before provider export.';
  end if;
  select string_agg(distinct l.component_code, ', ' order by l.component_code) into v_missing
  from public.payroll_component_lines l
  where l.payroll_run_id = v_run.id
    and not exists (
      select 1 from public.payroll_provider_components m
      where m.provider_id = p_provider_id and m.component_code = l.component_code and m.active
    );
  if v_missing is not null then raise exception 'Missing provider component mappings: %.', v_missing; end if;
  select string_agg(distinct e.display_name, ', ' order by e.display_name) into v_missing
  from public.payroll_employee_results r
  join public.employees e on e.restaurant_id = r.restaurant_id and e.id = r.employee_id
  where r.payroll_run_id = v_run.id
    and not exists (
      select 1 from public.payroll_provider_employee_mappings m
      where m.restaurant_id = p_restaurant_id and m.provider_id = p_provider_id
        and m.employee_id = r.employee_id and m.active
    );
  if v_missing is not null then raise exception 'Missing provider employee mappings: %.', v_missing; end if;
  select jsonb_build_object(
    'schema_version', 1,
    'payroll_run_id', v_run.id,
    'input_sha256', v_run.input_sha256,
    'provider_id', p_provider_id,
    'rows', coalesce(jsonb_agg(jsonb_build_object(
      'external_employee_id', em.external_employee_id,
      'provider_code', cm.provider_code,
      'provider_label', cm.provider_label,
      'component_code', l.component_code,
      'quantity', l.quantity,
      'unit', l.unit,
      'amount_cents', l.gross_amount_cents + l.employee_contribution_cents
        + l.professional_withholding_cents + l.employer_contribution_cents
    ) order by em.external_employee_id, cm.provider_code), '[]'::jsonb)
  ) into v_payload
  from public.payroll_component_lines l
  join public.payroll_provider_components cm
    on cm.provider_id = p_provider_id and cm.component_code = l.component_code and cm.active
  join public.payroll_provider_employee_mappings em
    on em.restaurant_id = p_restaurant_id and em.provider_id = p_provider_id
    and em.employee_id = l.employee_id and em.active
  where l.payroll_run_id = v_run.id;
  v_hash := encode(digest(convert_to(v_payload::text, 'UTF8'), 'sha256'), 'hex');
  insert into public.payroll_provider_exports (
    payroll_run_id, restaurant_id, provider_id, payload, payload_sha256,
    created_by_profile_id
  ) values (v_run.id, p_restaurant_id, p_provider_id, v_payload, v_hash, public.current_profile_id())
  returning id into v_id;
  return jsonb_build_object('ok', true, 'provider_export_id', v_id, 'payload_sha256', v_hash, 'payload', v_payload);
end
$$;

create function public.import_payroll_provider_return(
  p_restaurant_id uuid,
  p_payroll_run_id uuid,
  p_provider_id uuid,
  p_filename text,
  p_payload jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare v_file_id uuid; v_hash text;
begin
  if not public.is_owner(p_restaurant_id) then raise exception 'Only an owner can import provider results.'; end if;
  if jsonb_typeof(p_payload->'rows') <> 'array' then raise exception 'Provider return rows are required.'; end if;
  v_hash := encode(digest(convert_to(p_payload::text, 'UTF8'), 'sha256'), 'hex');
  insert into public.payroll_provider_return_files (
    payroll_run_id, restaurant_id, provider_id, original_filename,
    payload, payload_sha256, imported_by_profile_id
  ) values (
    p_payroll_run_id, p_restaurant_id, p_provider_id, btrim(p_filename),
    p_payload, v_hash, public.current_profile_id()
  ) returning id into v_file_id;
  insert into public.payroll_reconciliations (
    payroll_run_id, payroll_provider_return_file_id, restaurant_id,
    employee_id, component_code, restogogo_amount_cents,
    provider_amount_cents, variance_cents, status
  )
  select p_payroll_run_id, v_file_id, p_restaurant_id,
    em.employee_id, cm.component_code,
    coalesce((select sum(l.gross_amount_cents + l.employee_contribution_cents
      + l.professional_withholding_cents + l.employer_contribution_cents)
      from public.payroll_component_lines l
      where l.payroll_run_id = p_payroll_run_id and l.employee_id = em.employee_id
        and l.component_code = cm.component_code), 0)::bigint,
    (row->>'amount_cents')::bigint,
    (row->>'amount_cents')::bigint - coalesce((select sum(l.gross_amount_cents + l.employee_contribution_cents
      + l.professional_withholding_cents + l.employer_contribution_cents)
      from public.payroll_component_lines l
      where l.payroll_run_id = p_payroll_run_id and l.employee_id = em.employee_id
        and l.component_code = cm.component_code), 0)::bigint,
    case when (row->>'amount_cents')::bigint = coalesce((select sum(l.gross_amount_cents + l.employee_contribution_cents
      + l.professional_withholding_cents + l.employer_contribution_cents)
      from public.payroll_component_lines l
      where l.payroll_run_id = p_payroll_run_id and l.employee_id = em.employee_id
        and l.component_code = cm.component_code), 0)::bigint then 'matched' else 'open' end
  from jsonb_array_elements(p_payload->'rows') row
  join public.payroll_provider_employee_mappings em
    on em.restaurant_id = p_restaurant_id and em.provider_id = p_provider_id
    and em.external_employee_id = row->>'external_employee_id' and em.active
  join public.payroll_provider_components cm
    on cm.provider_id = p_provider_id and cm.provider_code = row->>'provider_code' and cm.active;
  return jsonb_build_object('ok', true, 'return_file_id', v_file_id, 'payload_sha256', v_hash);
end
$$;

create function public.resolve_payroll_reconciliation(
  p_restaurant_id uuid,
  p_reconciliation_id uuid,
  p_status text,
  p_explanation text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_owner(p_restaurant_id) then raise exception 'Only an owner can resolve payroll variances.'; end if;
  if p_status not in ('explained', 'accepted') or length(btrim(coalesce(p_explanation, ''))) < 8 then
    raise exception 'Resolve the variance with an explanation.';
  end if;
  update public.payroll_reconciliations set status = p_status,
    explanation = btrim(p_explanation), resolved_by_profile_id = public.current_profile_id(),
    resolved_at = now()
  where id = p_reconciliation_id and restaurant_id = p_restaurant_id and status = 'open';
  if not found then raise exception 'Open payroll variance not found.'; end if;
  return jsonb_build_object('ok', true);
end
$$;

revoke all on function public.save_employee_tax_profile(uuid, uuid, jsonb) from public, anon, authenticated;
revoke all on function public.record_employee_regime_evidence(uuid, uuid, jsonb) from public, anon, authenticated;
revoke all on function public.save_employee_payroll_benefit(uuid, uuid, jsonb) from public, anon, authenticated;
revoke all on function public.save_payroll_provider_mapping(uuid, uuid, text, jsonb) from public, anon, authenticated;
revoke all on function public.create_payroll_provider_export(uuid, uuid, uuid) from public, anon, authenticated;
revoke all on function public.import_payroll_provider_return(uuid, uuid, uuid, text, jsonb) from public, anon, authenticated;
revoke all on function public.resolve_payroll_reconciliation(uuid, uuid, text, text) from public, anon, authenticated;
grant execute on function public.save_employee_tax_profile(uuid, uuid, jsonb) to authenticated;
grant execute on function public.record_employee_regime_evidence(uuid, uuid, jsonb) to authenticated;
grant execute on function public.save_employee_payroll_benefit(uuid, uuid, jsonb) to authenticated;
grant execute on function public.save_payroll_provider_mapping(uuid, uuid, text, jsonb) to authenticated;
grant execute on function public.create_payroll_provider_export(uuid, uuid, uuid) to authenticated;
grant execute on function public.import_payroll_provider_return(uuid, uuid, uuid, text, jsonb) to authenticated;
grant execute on function public.resolve_payroll_reconciliation(uuid, uuid, text, text) to authenticated;

commit;
