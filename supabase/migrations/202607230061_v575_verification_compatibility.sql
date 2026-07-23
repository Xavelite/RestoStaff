-- V581: V575 owner-saved terms were not server-validated. Preserve their facts,
-- but require the new explicit validation operation before payroll calculation.
begin;

alter table public.employee_employment_terms
  disable trigger employee_employment_terms_history_guard;

update public.employee_employment_terms t
set source_status = 'complete',
    validation_blockers = jsonb_build_array(jsonb_build_object(
      'code', 'V575_SERVER_VALIDATION_REQUIRED',
      'message', 'Validate this preserved V575 employment-term version with the authoritative server checks.'
    ))
where t.source_status = 'verified'
  and t.employment_type_code is not null
  and not exists (
    select 1 from public.employee_employment_term_validations v
    where v.employment_terms_id = t.id and v.result_status = 'verified'
  );

alter table public.employee_employment_terms
  enable trigger employee_employment_terms_history_guard;

commit;
