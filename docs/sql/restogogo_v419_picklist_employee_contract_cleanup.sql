-- v419 cleanup: unified picklist front-end + lean employee/position data contract.
-- Run after deploying v419 front-end.

begin;

-- Ensure existing employees have the explicit Restaurant position_id expected by Team.
update public.restogogo_employees e
set position_id = p.id
from public.restogogo_positions p
where e.restaurant_id = p.restaurant_id
  and nullif(trim(coalesce(e.position_id, '')), '') is null
  and trim(lower(e.position)) = trim(lower(p.name));

-- Positions are role masters now. Department grouping is not active in the product.
alter table public.restogogo_positions
  drop column if exists department;

-- Remove dormant Employee fields that were kept for future payroll/HR depth but are not active in v419.
alter table public.restogogo_employees
  drop column if exists preferred_name,
  drop column if exists external_id,
  drop column if exists private_email,
  drop column if exists work_email,
  drop column if exists country,
  drop column if exists language,
  drop column if exists birth_place,
  drop column if exists employment_type,
  drop column if exists worker_category,
  drop column if exists trial_period_end,
  drop column if exists date_of_birth,
  drop column if exists full_time_equivalent,
  drop column if exists default_working_days,
  drop column if exists default_shift_pattern,
  drop column if exists department,
  drop column if exists cost_center,
  drop column if exists legal_entity_id,
  drop column if exists joint_committee,
  drop column if exists tax_status,
  drop column if exists bank_account_holder,
  drop column if exists payroll_company_id,
  drop column if exists payroll_contract_id,
  drop column if exists payroll_status,
  drop column if exists payroll_export_enabled,
  drop column if exists last_exported_at;

-- Current Team contract: position comes from Restaurant positions only.
alter table public.restogogo_employees alter column position_id drop default;

commit;
