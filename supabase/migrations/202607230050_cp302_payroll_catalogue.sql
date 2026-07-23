-- V569: versioned CP 302 legal catalogue and restaurant/employee evidence.
begin;

create table public.payroll_legal_sources (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  authority text not null,
  title text not null,
  url text not null,
  published_on date,
  retrieved_on date not null,
  content_hash text,
  verification_notes text,
  created_at timestamptz not null default now(),
  constraint payroll_legal_sources_code_check check (code ~ '^[A-Z0-9_]+$'),
  constraint payroll_legal_sources_url_check check (url ~ '^https://')
);

create table public.payroll_rule_sets (
  id uuid primary key default gen_random_uuid(),
  jurisdiction text not null,
  sector_code text not null,
  version text not null,
  valid_from date not null,
  valid_to date,
  status text not null,
  published_at timestamptz,
  source_hash text,
  approved_by_profile_id uuid,
  created_at timestamptz not null default now(),
  constraint payroll_rule_sets_version_key unique (jurisdiction, sector_code, version),
  constraint payroll_rule_sets_validity_check check (valid_to is null or valid_to >= valid_from),
  constraint payroll_rule_sets_status_check
    check (status in ('draft', 'verified', 'published', 'effective', 'retired')),
  constraint payroll_rule_sets_approver_fk
    foreign key (approved_by_profile_id) references public.profiles(id) on delete restrict
);

create table public.payroll_rules (
  id uuid primary key default gen_random_uuid(),
  rule_set_id uuid not null references public.payroll_rule_sets(id) on delete restrict,
  code text not null,
  handler_type text not null,
  priority integer not null default 100,
  effective_from date not null,
  effective_to date,
  conditions_json jsonb not null default '{}'::jsonb,
  parameters_json jsonb not null default '{}'::jsonb,
  cumulation_group text,
  legal_source_id uuid not null references public.payroll_legal_sources(id) on delete restrict,
  status text not null,
  verification_notes text,
  created_at timestamptz not null default now(),
  constraint payroll_rules_rule_set_code_key unique (rule_set_id, code),
  constraint payroll_rules_code_check check (code ~ '^[A-Z0-9_]+$'),
  constraint payroll_rules_handler_check check (handler_type in (
    'percentage', 'percentage_on_adjusted_base', 'hourly_scale_floor',
    'hourly_premium', 'overtime_multiplier', 'manual_evidence'
  )),
  constraint payroll_rules_validity_check check (effective_to is null or effective_to >= effective_from),
  constraint payroll_rules_status_check
    check (status in ('draft', 'verified', 'effective', 'retired')),
  constraint payroll_rules_conditions_object check (jsonb_typeof(conditions_json) = 'object'),
  constraint payroll_rules_parameters_object check (jsonb_typeof(parameters_json) = 'object')
);

create table public.cp302_reference_functions (
  id uuid primary key default gen_random_uuid(),
  code text not null,
  name_fr text not null,
  name_nl text not null,
  category smallint not null,
  valid_from date not null,
  valid_to date,
  legal_source_id uuid not null references public.payroll_legal_sources(id) on delete restrict,
  status text not null default 'verified',
  created_at timestamptz not null default now(),
  constraint cp302_reference_functions_code_validity_key unique (code, valid_from),
  constraint cp302_reference_functions_category_check check (category between 1 and 9),
  constraint cp302_reference_functions_validity_check check (valid_to is null or valid_to >= valid_from),
  constraint cp302_reference_functions_status_check
    check (status in ('draft', 'verified', 'effective', 'retired'))
);

create table public.cp302_salary_scales (
  id uuid primary key default gen_random_uuid(),
  rule_set_id uuid not null references public.payroll_rule_sets(id) on delete restrict,
  category smallint not null,
  function_years smallint not null,
  hourly_rate numeric(12,4) not null,
  monthly_rate_cents bigint not null,
  valid_from date not null,
  valid_to date,
  legal_source_id uuid not null references public.payroll_legal_sources(id) on delete restrict,
  created_at timestamptz not null default now(),
  constraint cp302_salary_scales_key unique (rule_set_id, category, function_years, valid_from),
  constraint cp302_salary_scales_category_check check (category between 1 and 9),
  constraint cp302_salary_scales_years_check check (function_years between 0 and 60),
  constraint cp302_salary_scales_rate_check check (hourly_rate > 0 and monthly_rate_cents > 0),
  constraint cp302_salary_scales_validity_check check (valid_to is null or valid_to >= valid_from)
);

create table public.payroll_components (
  code text primary key,
  label text not null,
  section text not null,
  unit text not null,
  taxable_default boolean not null,
  social_security_default boolean not null,
  employer_cost_default boolean not null,
  created_at timestamptz not null default now(),
  constraint payroll_components_code_check check (code ~ '^[A-Z0-9_]+$'),
  constraint payroll_components_section_check
    check (section in ('gross', 'employee_deduction', 'net', 'employer_cost', 'benefit', 'adjustment')),
  constraint payroll_components_unit_check check (unit in ('minutes', 'hours', 'amount', 'percentage'))
);

create table public.restaurant_payroll_configurations (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete restrict,
  valid_from date not null,
  valid_to date,
  version_number integer not null,
  rule_set_id uuid not null references public.payroll_rule_sets(id) on delete restrict,
  reference_full_time_weekly_minutes integer not null default 2280,
  ordinary_daily_limit_minutes integer,
  reference_period_weeks integer not null default 13,
  gks_registered boolean,
  employer_category_code text,
  default_provider_id uuid,
  withholding_mode text not null default 'not_configured',
  cost_assumptions jsonb not null default '{}'::jsonb,
  status text not null default 'draft',
  active boolean not null default true,
  created_by_profile_id uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  constraint restaurant_payroll_configurations_version_key
    unique (restaurant_id, version_number),
  constraint restaurant_payroll_configurations_validity_check
    check (valid_to is null or valid_to >= valid_from),
  constraint restaurant_payroll_configurations_weekly_check
    check (reference_full_time_weekly_minutes between 60 and 10080),
  constraint restaurant_payroll_configurations_daily_check
    check (ordinary_daily_limit_minutes is null or ordinary_daily_limit_minutes between 60 and 1440),
  constraint restaurant_payroll_configurations_reference_check
    check (reference_period_weeks between 1 and 52),
  constraint restaurant_payroll_configurations_withholding_check
    check (withholding_mode in ('not_configured', 'manual_estimate', 'official_formula')),
  constraint restaurant_payroll_configurations_status_check
    check (status in ('draft', 'verified')),
  constraint restaurant_payroll_configurations_cost_object
    check (jsonb_typeof(cost_assumptions) = 'object')
);

create unique index restaurant_payroll_configurations_one_open_active
  on public.restaurant_payroll_configurations (restaurant_id)
  where active and valid_to is null;

create table public.employee_tax_profiles (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null,
  employee_id uuid not null,
  valid_from date not null,
  valid_to date,
  version_number integer not null,
  resident_status text,
  civil_status text,
  partner_income_category text,
  dependent_children integer not null default 0,
  other_dependants integer not null default 0,
  disability_status text,
  withholding_treatment text,
  manual_withholding_basis_points integer,
  evidence_status text not null default 'recorded',
  active boolean not null default true,
  created_by_profile_id uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  constraint employee_tax_profiles_employee_fk
    foreign key (restaurant_id, employee_id)
      references public.employees(restaurant_id, id) on delete restrict,
  constraint employee_tax_profiles_version_key unique (restaurant_id, employee_id, version_number),
  constraint employee_tax_profiles_validity_check check (valid_to is null or valid_to >= valid_from),
  constraint employee_tax_profiles_dependants_check
    check (dependent_children between 0 and 30 and other_dependants between 0 and 30),
  constraint employee_tax_profiles_withholding_check
    check (manual_withholding_basis_points is null or manual_withholding_basis_points between 0 and 10000),
  constraint employee_tax_profiles_evidence_check
    check (evidence_status in ('recorded', 'verified'))
);

create unique index employee_tax_profiles_one_open_active
  on public.employee_tax_profiles (restaurant_id, employee_id)
  where active and valid_to is null;

create table public.employee_regime_evidence (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null,
  employee_id uuid not null,
  evidence_type text not null,
  valid_from date not null,
  valid_to date,
  status text not null,
  reference text,
  quota_minutes integer,
  used_minutes integer not null default 0,
  metadata jsonb not null default '{}'::jsonb,
  created_by_profile_id uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  constraint employee_regime_evidence_employee_fk
    foreign key (restaurant_id, employee_id)
      references public.employees(restaurant_id, id) on delete restrict,
  constraint employee_regime_evidence_validity_check check (valid_to is null or valid_to >= valid_from),
  constraint employee_regime_evidence_type_check check (evidence_type in (
    'flexi_eligibility', 'student_quota', 'occasional_quota', 'dimona',
    'voluntary_overtime_agreement', 'gks_eligibility', 'interim_invoice'
  )),
  constraint employee_regime_evidence_status_check
    check (status in ('draft', 'verified', 'expired', 'rejected')),
  constraint employee_regime_evidence_quota_check
    check (quota_minutes is null or quota_minutes >= 0),
  constraint employee_regime_evidence_used_check check (used_minutes >= 0),
  constraint employee_regime_evidence_metadata_object check (jsonb_typeof(metadata) = 'object')
);

create table public.employee_payroll_benefits (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null,
  employee_id uuid not null,
  component_code text not null references public.payroll_components(code) on delete restrict,
  valid_from date not null,
  valid_to date,
  amount_cents bigint,
  quantity numeric(12,4),
  employer_share_cents bigint,
  employee_share_cents bigint,
  taxable boolean not null,
  social_security boolean not null,
  evidence_status text not null default 'recorded',
  notes text,
  active boolean not null default true,
  created_by_profile_id uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  constraint employee_payroll_benefits_employee_fk
    foreign key (restaurant_id, employee_id)
      references public.employees(restaurant_id, id) on delete restrict,
  constraint employee_payroll_benefits_validity_check check (valid_to is null or valid_to >= valid_from),
  constraint employee_payroll_benefits_amount_check check (amount_cents is null or amount_cents >= 0),
  constraint employee_payroll_benefits_shares_check check (
    (employer_share_cents is null or employer_share_cents >= 0)
    and (employee_share_cents is null or employee_share_cents >= 0)
  ),
  constraint employee_payroll_benefits_evidence_check
    check (evidence_status in ('recorded', 'verified'))
);

insert into public.payroll_legal_sources (
  code, authority, title, url, published_on, retrieved_on, verification_notes
) values
  ('CP302_MINIMUM_WAGES_2026', 'FPS Employment', 'CP 302 minimum wages effective 1 January 2026',
   'https://minimumlonen.be/document.html?date=01%2F01%2F2026&jcId=ceaa4cb322cc4933bdb1b933335760ee',
   '2026-01-20', '2026-07-23', 'Official minimum-wage database; 38-hour week; hourly and monthly scales.'),
  ('ONSS_CONTRIBUTIONS_2026_Q2', 'Belgian Social Security / ONSS', 'Social-security contributions 2026/2',
   'https://www.socialsecurity.be/employer/instructions/dmfa/fr/latest/instructions/socialsecuritycontributions/contributions.html',
   '2026-06-01', '2026-07-23', 'Employee 13.07%; private employer base 24.92%; blue-collar 108% base and vacation contributions.'),
  ('ONSS_FLEXI_2026_Q2', 'Belgian Social Security / ONSS', 'Flexi salary and horeca overtime 2026/2',
   'https://www.socialsecurity.be/employer/instructions/dmfa/fr/latest/instructions/socialsecuritycontributions/calculationbase/flexi/flexi_and_overtime_horeca.html',
   '2026-06-01', '2026-07-23', 'Flexi holiday pay 7.67%; employer contribution 28%; gross equals net under this regime.'),
  ('ONSS_STUDENT_2026_Q2', 'Belgian Social Security / ONSS', 'Student solidarity contribution 2026/2',
   'https://www.socialsecurity.be/employer/instructions/dmfa/fr/latest/instructions/special_contributions/students.html',
   '2026-06-01', '2026-07-23', '8.13% total: 2.71% employee and 5.42% employer, subject to verified eligibility/quota.'),
  ('FPS_EMPLOYMENT_OVERTIME', 'FPS Employment', 'Working time and overtime',
   'https://employment.belgium.be/en/node/3860', null, '2026-07-23',
   'General overtime surcharge 50%; Sunday/public-holiday overtime 100%; eligibility depends on legal evidence.'),
  ('FPS_FINANCE_WITHHOLDING_2026', 'FPS Finance', 'Professional withholding calculation 2026',
   'https://finances.belgium.be/fr/entreprises/personnel_et_remuneration/precompte_professionnel/calcul',
   null, '2026-07-23', 'Official rules, key formula and simulator are linked; handler remains unverified until golden fixtures pass.')
on conflict (code) do nothing;

insert into public.payroll_rule_sets (
  jurisdiction, sector_code, version, valid_from, status, published_at, source_hash
) values ('BE', 'CP302', '2026.1', '2026-01-01', 'effective', '2026-01-20 00:00:00+00',
  'official-cp302-onss-2026-verified-2026-07-23')
on conflict (jurisdiction, sector_code, version) do nothing;

insert into public.payroll_rules (
  rule_set_id, code, handler_type, priority, effective_from,
  conditions_json, parameters_json, legal_source_id, status, verification_notes
)
select rs.id, v.code, v.handler_type, v.priority, v.effective_from,
       v.conditions_json, v.parameters_json, s.id, v.status, v.notes
from public.payroll_rule_sets rs
cross join (values
  ('ORDINARY_EMPLOYEE_ONSS', 'percentage', 100, '2026-01-01'::date,
   '{"employment_regimes":["ordinary","student_ordinary","horeca_occasional"]}'::jsonb,
   '{"basis_points":1307}'::jsonb, 'ONSS_CONTRIBUTIONS_2026_Q2', 'effective', 'Ordinary employee contribution before work-bonus reductions.'),
  ('ORDINARY_EMPLOYER_BASE', 'percentage', 100, '2026-01-01'::date,
   '{"employment_regimes":["ordinary","student_ordinary","horeca_occasional"]}'::jsonb,
   '{"basis_points":2492}'::jsonb, 'ONSS_CONTRIBUTIONS_2026_Q2', 'effective', 'Base private-sector employer rate only; category additions/reductions remain configurable.'),
  ('BLUE_COLLAR_ONSS_BASE', 'percentage_on_adjusted_base', 90, '2026-01-01'::date,
   '{"worker_status":"blue_collar"}'::jsonb,
   '{"base_multiplier_basis_points":10800}'::jsonb, 'ONSS_CONTRIBUTIONS_2026_Q2', 'effective', 'ONSS calculation base is gross remuneration increased by 8%.'),
  ('BLUE_COLLAR_VACATION_QUARTERLY', 'percentage', 110, '2026-01-01'::date,
   '{"worker_status":"blue_collar"}'::jsonb,
   '{"basis_points":557}'::jsonb, 'ONSS_CONTRIBUTIONS_2026_Q2', 'effective', 'Quarterly vacation contribution on the 108% base.'),
  ('BLUE_COLLAR_VACATION_ANNUAL', 'percentage', 111, '2026-01-01'::date,
   '{"worker_status":"blue_collar"}'::jsonb,
   '{"basis_points":1027}'::jsonb, 'ONSS_CONTRIBUTIONS_2026_Q2', 'effective', 'Annual debit provision on the 108% base.'),
  ('FLEXI_HOLIDAY_PAY', 'percentage', 100, '2026-01-01'::date,
   '{"employment_regimes":["flexi"]}'::jsonb,
   '{"basis_points":767}'::jsonb, 'ONSS_FLEXI_2026_Q2', 'effective', 'Paid together with flexi salary.'),
  ('FLEXI_EMPLOYER_CONTRIBUTION', 'percentage', 100, '2026-01-01'::date,
   '{"employment_regimes":["flexi"]}'::jsonb,
   '{"basis_points":2800}'::jsonb, 'ONSS_FLEXI_2026_Q2', 'effective', 'Applied to complete flexi salary including holiday pay.'),
  ('STUDENT_EMPLOYEE_SOLIDARITY', 'percentage', 100, '2026-01-01'::date,
   '{"employment_regimes":["student_reduced"]}'::jsonb,
   '{"basis_points":271}'::jsonb, 'ONSS_STUDENT_2026_Q2', 'effective', 'Requires verified reduced-contribution eligibility and quota.'),
  ('STUDENT_EMPLOYER_SOLIDARITY', 'percentage', 100, '2026-01-01'::date,
   '{"employment_regimes":["student_reduced"]}'::jsonb,
   '{"basis_points":542}'::jsonb, 'ONSS_STUDENT_2026_Q2', 'effective', 'Excludes separately applicable asbestos-fund quarter handling.'),
  ('OVERTIME_WEEKDAY_SURCHARGE', 'overtime_multiplier', 200, '2026-01-01'::date,
   '{"day_types":["weekday","saturday"]}'::jsonb,
   '{"premium_basis_points":5000}'::jsonb, 'FPS_EMPLOYMENT_OVERTIME', 'verified', 'Only apply after overtime eligibility is proven.'),
  ('OVERTIME_SUNDAY_HOLIDAY_SURCHARGE', 'overtime_multiplier', 200, '2026-01-01'::date,
   '{"day_types":["sunday","public_holiday"]}'::jsonb,
   '{"premium_basis_points":10000}'::jsonb, 'FPS_EMPLOYMENT_OVERTIME', 'verified', 'Only apply after overtime eligibility is proven.'),
  ('PROFESSIONAL_WITHHOLDING_2026', 'manual_evidence', 300, '2026-01-01'::date,
   '{}'::jsonb, '{"authoritative":false}'::jsonb, 'FPS_FINANCE_WITHHOLDING_2026', 'draft',
   'Official formula handler is intentionally inactive until simulator fixtures are implemented and reconciled.')
) as v(code, handler_type, priority, effective_from, conditions_json, parameters_json, source_code, status, notes)
join public.payroll_legal_sources s on s.code = v.source_code
where rs.jurisdiction = 'BE' and rs.sector_code = 'CP302' and rs.version = '2026.1'
on conflict (rule_set_id, code) do nothing;

insert into public.payroll_components (
  code, label, section, unit, taxable_default,
  social_security_default, employer_cost_default
) values
  ('BASE_PAY', 'Base remuneration', 'gross', 'minutes', true, true, true),
  ('FLEXI_BASE', 'Flexi base remuneration', 'gross', 'minutes', false, false, true),
  ('FLEXI_HOLIDAY_PAY', 'Flexi holiday pay', 'gross', 'percentage', false, false, true),
  ('STUDENT_PAY', 'Student remuneration', 'gross', 'minutes', true, true, true),
  ('OVERTIME_50', 'Overtime surcharge 50%', 'gross', 'minutes', true, true, true),
  ('OVERTIME_100', 'Overtime surcharge 100%', 'gross', 'minutes', true, true, true),
  ('EMPLOYEE_ONSS', 'Employee social-security contribution', 'employee_deduction', 'percentage', false, false, false),
  ('STUDENT_SOLIDARITY', 'Student solidarity contribution', 'employee_deduction', 'percentage', false, false, false),
  ('PROFESSIONAL_WITHHOLDING', 'Professional withholding', 'employee_deduction', 'amount', false, false, false),
  ('EMPLOYER_ONSS_BASE', 'Employer base social-security contribution', 'employer_cost', 'percentage', false, false, true),
  ('FLEXI_EMPLOYER_CONTRIBUTION', 'Flexi employer contribution', 'employer_cost', 'percentage', false, false, true),
  ('STUDENT_EMPLOYER_SOLIDARITY', 'Student employer solidarity contribution', 'employer_cost', 'percentage', false, false, true),
  ('BLUE_COLLAR_VACATION_QUARTERLY', 'Blue-collar quarterly vacation contribution', 'employer_cost', 'percentage', false, false, true),
  ('BLUE_COLLAR_VACATION_ANNUAL_PROVISION', 'Blue-collar annual vacation debit provision', 'employer_cost', 'percentage', false, false, true),
  ('MEAL_VOUCHER', 'Meal voucher', 'benefit', 'amount', false, false, true),
  ('TRANSPORT_REIMBURSEMENT', 'Transport reimbursement', 'benefit', 'amount', false, false, true),
  ('CLOTHING_ALLOWANCE', 'Clothing allowance', 'benefit', 'amount', false, false, true),
  ('TAXABLE_BENEFIT', 'Taxable benefit', 'benefit', 'amount', true, true, true),
  ('NET_REIMBURSEMENT', 'Net reimbursement', 'benefit', 'amount', false, false, true),
  ('MANUAL_ADJUSTMENT', 'Manual payroll adjustment', 'adjustment', 'amount', true, true, true)
on conflict (code) do nothing;

-- Official 2026 CP 302 scale. Each row is one function-year and contains
-- categories I..IX. Monthly cents are derived from the official monthly table
-- relationship (hourly x 164.666...) and are not used as legal evidence; the
-- authoritative monthly values are added only where supplied below.
with scale(function_years, rates) as (values
  (0, array[15.2097,15.2097,15.2977,15.9698,16.8849,17.3317,19.7061,21.2302,22.5781]::numeric[]),
  (1, array[15.8915,15.8915,16.0385,16.7065,17.4923,18.0099,19.9511,21.4830,22.8409]::numeric[]),
  (2, array[16.2059,16.2059,16.3560,17.0980,17.8544,18.4408,20.1838,21.7258,23.0896]::numeric[]),
  (3, array[16.5019,16.5019,16.7081,17.4076,18.1364,18.7845,20.4182,21.9650,23.3337]::numeric[]),
  (4, array[16.7139,16.7139,16.9831,17.5671,18.3359,19.0501,20.6482,22.2062,23.5855]::numeric[]),
  (5, array[16.7139,16.7139,17.0981,17.7978,18.4521,19.2225,20.8844,22.4511,23.8373]::numeric[]),
  (6, array[16.7139,16.7139,17.2162,17.7978,18.5684,19.4010,21.1161,22.6914,24.0849]::numeric[]),
  (7, array[16.7139,16.7139,17.2162,18.0284,18.6841,19.5786,21.3547,22.9379,24.3391]::numeric[]),
  (8, array[16.7139,16.7139,17.2162,18.0284,18.8001,19.7520,21.5943,23.1862,24.5913]::numeric[]),
  (9, array[16.8646,16.8646,17.3674,18.1877,18.9644,19.9223,21.7870,23.3936,24.8121]::numeric[]),
  (10,array[16.8646,16.8646,17.3674,18.1925,18.9688,19.9299,21.7976,23.4048,24.8224]::numeric[]),
  (11,array[16.8646,16.8646,17.3674,18.1980,18.9739,19.9371,21.8083,23.4144,24.8332]::numeric[]),
  (12,array[16.8646,16.8646,17.3674,18.2025,18.9785,19.9443,21.8186,23.4252,24.8431]::numeric[]),
  (13,array[16.8646,16.8646,17.3674,18.2073,18.9833,19.9514,21.8232,23.4295,24.8479]::numeric[]),
  (14,array[17.0152,17.0152,17.5187,18.3624,19.1475,20.1220,22.0174,23.6395,25.0703]::numeric[]),
  (15,array[17.0152,17.0152,17.5187,18.3677,19.1520,20.1297,22.0293,23.6518,25.0830]::numeric[]),
  (16,array[17.0152,17.0152,17.5187,18.3677,19.1520,20.1297,22.0361,23.6586,25.0905]::numeric[]),
  (17,array[17.0152,17.0152,17.5187,18.3677,19.1520,20.1297,22.0430,23.6666,25.0975]::numeric[]),
  (18,array[17.0152,17.0152,17.5187,18.3677,19.1520,20.1297,22.0430,23.6666,25.0975]::numeric[]),
  (19,array[17.1660,17.1660,17.6700,18.5179,19.3114,20.2930,22.2262,23.8631,25.3082]::numeric[]),
  (20,array[17.1660,17.1660,17.6700,18.5179,19.3114,20.2930,22.2262,23.8631,25.3082]::numeric[]),
  (21,array[17.1660,17.1660,17.6700,18.5252,19.3195,20.3014,22.2316,23.8695,25.3146]::numeric[]),
  (22,array[17.1660,17.1660,17.6700,18.5252,19.3195,20.3014,22.2316,23.8695,25.3146]::numeric[]),
  (23,array[17.1660,17.1660,17.6700,18.5252,19.3195,20.3014,22.2383,23.8771,25.3221]::numeric[]),
  (24,array[17.3157,17.3157,17.8213,18.6760,19.4788,20.4648,22.4213,24.0743,25.5327]::numeric[]),
  (25,array[17.3157,17.3157,17.8213,18.6760,19.4788,20.4648,22.4213,24.0743,25.5327]::numeric[]),
  (26,array[17.3157,17.3157,17.8213,18.6834,19.4869,20.4725,22.4271,24.0801,25.5391]::numeric[]),
  (27,array[17.3157,17.3157,17.8213,18.6834,19.4869,20.4725,22.4271,24.0801,25.5391]::numeric[]),
  (28,array[17.3157,17.3157,17.8213,18.6834,19.4869,20.4725,22.4344,24.0871,25.5464]::numeric[]),
  (29,array[17.4669,17.4669,17.9727,18.8333,19.6461,20.6366,22.6162,24.2855,25.7568]::numeric[]),
  (30,array[17.4669,17.4669,17.9727,18.8333,19.6461,20.6366,22.6162,24.2855,25.7568]::numeric[]),
  (31,array[17.4669,17.4669,17.9727,18.8418,19.6538,20.6444,22.6222,24.2909,25.7637]::numeric[]),
  (32,array[17.4669,17.4669,17.9727,18.8418,19.6538,20.6444,22.6222,24.2909,25.7637]::numeric[]),
  (33,array[17.4669,17.4669,17.9727,18.8418,19.6538,20.6444,22.6295,24.2978,25.7708]::numeric[]),
  (34,array[17.6175,17.6175,18.1239,18.9918,19.8135,20.8076,22.8127,24.4954,25.9816]::numeric[]),
  (35,array[17.6175,17.6175,18.1239,18.9918,19.8135,20.8076,22.8127,24.4954,25.9816]::numeric[]),
  (36,array[17.6175,17.6175,18.1239,18.9998,19.8213,20.8165,22.8184,24.5018,25.9871]::numeric[]),
  (37,array[17.6175,17.6175,18.1239,18.9998,19.8213,20.8165,22.8184,24.5018,25.9871]::numeric[]),
  (38,array[17.6175,17.6175,18.1239,18.9998,19.8213,20.8165,22.8247,24.5086,25.9949]::numeric[]),
  (39,array[17.7677,17.7677,18.2753,19.1497,19.9804,20.9800,23.0076,24.7065,26.2057]::numeric[]),
  (40,array[17.7677,17.7677,18.2753,19.1497,19.9804,20.9800,23.0076,24.7065,26.2057]::numeric[]),
  (41,array[17.7677,17.7677,18.2753,19.1581,19.9887,20.9881,23.0135,24.7124,26.2113]::numeric[]),
  (42,array[17.7677,17.7677,18.2753,19.1581,19.9887,20.9881,23.0135,24.7124,26.2113]::numeric[]),
  (43,array[17.7677,17.7677,18.2753,19.1581,19.9887,20.9881,23.0199,24.7193,26.2189]::numeric[]),
  (44,array[17.9181,17.9181,18.4267,19.3079,20.1476,21.1510,23.2031,24.9173,26.4301]::numeric[]),
  (45,array[17.9181,17.9181,18.4267,19.3079,20.1476,21.1510,23.2031,24.9173,26.4301]::numeric[])
), expanded as (
  select s.function_years, u.category::smallint, u.hourly_rate
  from scale s
  cross join lateral unnest(s.rates) with ordinality u(hourly_rate, category)
)
insert into public.cp302_salary_scales (
  rule_set_id, category, function_years, hourly_rate, monthly_rate_cents,
  valid_from, legal_source_id
)
select rs.id, e.category, e.function_years, e.hourly_rate,
       round(e.hourly_rate * (38::numeric * 52 / 12) * 100)::bigint,
       '2026-01-01', src.id
from expanded e
join public.payroll_rule_sets rs
  on rs.jurisdiction = 'BE' and rs.sector_code = 'CP302' and rs.version = '2026.1'
join public.payroll_legal_sources src on src.code = 'CP302_MINIMUM_WAGES_2026'
on conflict (rule_set_id, category, function_years, valid_from) do nothing;

create function public.guard_effective_payroll_evidence()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    raise exception '% is historical payroll evidence and cannot be deleted.', tg_table_name;
  end if;
  if old.active = false and new.active is distinct from old.active then
    raise exception 'A superseded payroll version cannot be reactivated.';
  end if;
  if old.valid_to is not null and new.valid_to is distinct from old.valid_to then
    raise exception 'A closed payroll period cannot be changed.';
  end if;
  return new;
end
$$;

create trigger restaurant_payroll_configurations_history_guard
before update or delete on public.restaurant_payroll_configurations
for each row execute function public.guard_effective_payroll_evidence();
create trigger employee_tax_profiles_history_guard
before update or delete on public.employee_tax_profiles
for each row execute function public.guard_effective_payroll_evidence();

create function public.get_payroll_catalogue(p_restaurant_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_owner(p_restaurant_id) then
    raise exception 'Only an owner can view payroll configuration.';
  end if;
  return jsonb_build_object(
    'configurations', coalesce((select jsonb_agg(to_jsonb(c) order by c.valid_from desc) from public.restaurant_payroll_configurations c where c.restaurant_id = p_restaurant_id), '[]'::jsonb),
    'rule_sets', coalesce((select jsonb_agg(to_jsonb(r) order by r.valid_from desc) from public.payroll_rule_sets r where r.jurisdiction = 'BE' and r.sector_code = 'CP302'), '[]'::jsonb),
    'rules', coalesce((select jsonb_agg(to_jsonb(r) order by r.priority, r.code) from public.payroll_rules r join public.payroll_rule_sets s on s.id = r.rule_set_id where s.jurisdiction = 'BE' and s.sector_code = 'CP302'), '[]'::jsonb),
    'legal_sources', coalesce((select jsonb_agg(to_jsonb(s) order by s.code) from public.payroll_legal_sources s), '[]'::jsonb),
    'salary_scales', coalesce((select jsonb_agg(to_jsonb(s) order by s.function_years, s.category) from public.cp302_salary_scales s join public.payroll_rule_sets r on r.id = s.rule_set_id where r.jurisdiction = 'BE' and r.sector_code = 'CP302'), '[]'::jsonb),
    'reference_functions', coalesce((select jsonb_agg(to_jsonb(f) order by f.code) from public.cp302_reference_functions f), '[]'::jsonb),
    'components', coalesce((select jsonb_agg(to_jsonb(c) order by c.section, c.code) from public.payroll_components c), '[]'::jsonb),
    'tax_profiles', coalesce((select jsonb_agg(to_jsonb(t) order by t.employee_id, t.valid_from desc) from public.employee_tax_profiles t where t.restaurant_id = p_restaurant_id), '[]'::jsonb),
    'regime_evidence', coalesce((select jsonb_agg(to_jsonb(e) order by e.employee_id, e.valid_from desc) from public.employee_regime_evidence e where e.restaurant_id = p_restaurant_id), '[]'::jsonb),
    'benefits', coalesce((select jsonb_agg(to_jsonb(b) order by b.employee_id, b.valid_from desc) from public.employee_payroll_benefits b where b.restaurant_id = p_restaurant_id), '[]'::jsonb)
  );
end
$$;

create function public.save_restaurant_payroll_configuration(
  p_restaurant_id uuid,
  p_configuration jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_from date := nullif(p_configuration->>'valid_from', '')::date;
  v_previous public.restaurant_payroll_configurations%rowtype;
  v_version integer;
  v_id uuid;
begin
  if not public.is_owner(p_restaurant_id) then
    raise exception 'Only an owner can change payroll configuration.';
  end if;
  if v_from is null then raise exception 'An effective date is required.'; end if;
  select * into v_previous
  from public.restaurant_payroll_configurations c
  where c.restaurant_id = p_restaurant_id and c.active
    and c.valid_from <= v_from and (c.valid_to is null or c.valid_to >= v_from)
  order by c.valid_from desc limit 1 for update;
  if v_previous.id is not null then
    update public.restaurant_payroll_configurations
    set active = false,
        valid_to = case when v_previous.valid_from < v_from then v_from - 1 else v_previous.valid_to end
    where id = v_previous.id;
  end if;
  select coalesce(max(version_number), 0) + 1 into v_version
  from public.restaurant_payroll_configurations where restaurant_id = p_restaurant_id;
  insert into public.restaurant_payroll_configurations (
    restaurant_id, valid_from, valid_to, version_number, rule_set_id,
    reference_full_time_weekly_minutes, ordinary_daily_limit_minutes,
    reference_period_weeks, gks_registered, employer_category_code,
    withholding_mode, cost_assumptions, status, created_by_profile_id
  ) values (
    p_restaurant_id, v_from, nullif(p_configuration->>'valid_to', '')::date,
    v_version, (p_configuration->>'rule_set_id')::uuid,
    coalesce(nullif(p_configuration->>'reference_full_time_weekly_minutes', '')::integer, 2280),
    nullif(p_configuration->>'ordinary_daily_limit_minutes', '')::integer,
    coalesce(nullif(p_configuration->>'reference_period_weeks', '')::integer, 13),
    nullif(p_configuration->>'gks_registered', '')::boolean,
    nullif(btrim(p_configuration->>'employer_category_code'), ''),
    coalesce(nullif(p_configuration->>'withholding_mode', ''), 'not_configured'),
    coalesce(p_configuration->'cost_assumptions', '{}'::jsonb),
    coalesce(nullif(p_configuration->>'status', ''), 'draft'),
    public.current_profile_id()
  ) returning id into v_id;
  return jsonb_build_object('ok', true, 'configuration_id', v_id, 'version_number', v_version);
end
$$;

do $$
declare t text;
begin
  foreach t in array array[
    'payroll_legal_sources','payroll_rule_sets','payroll_rules','cp302_reference_functions',
    'cp302_salary_scales','payroll_components','restaurant_payroll_configurations',
    'employee_tax_profiles','employee_regime_evidence','employee_payroll_benefits'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on table public.%I from public, anon, authenticated', t);
    execute format('grant all on table public.%I to service_role', t);
  end loop;
end
$$;

revoke all on function public.guard_effective_payroll_evidence() from public, anon, authenticated;
revoke all on function public.get_payroll_catalogue(uuid) from public, anon, authenticated;
revoke all on function public.save_restaurant_payroll_configuration(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.get_payroll_catalogue(uuid) to authenticated;
grant execute on function public.save_restaurant_payroll_configuration(uuid, jsonb) to authenticated;

commit;
