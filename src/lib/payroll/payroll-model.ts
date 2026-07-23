import type { Json, Tables } from '$lib/supabase/database.types';

type RecordValue = Record<string, unknown>;

function record(value: Json): RecordValue {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as RecordValue)
    : {};
}

function rows<T>(value: RecordValue, key: string): T[] {
  return Array.isArray(value[key]) ? (value[key] as T[]) : [];
}

export type PayrollIssue = {
  code: string;
  employee_id: string | null;
  evidence: string;
  message: string;
  accepted?: boolean;
};

export type PayrollReadiness = {
  restaurant_id: string;
  period_start: string;
  period_end: string;
  ready: boolean;
  blockers: PayrollIssue[];
  warnings: PayrollIssue[];
};

export type PayrollCatalogue = {
  configurations: Tables<'restaurant_payroll_configurations'>[];
  ruleSets: Tables<'payroll_rule_sets'>[];
  rules: Tables<'payroll_rules'>[];
  legalSources: Tables<'payroll_legal_sources'>[];
  salaryScales: Tables<'cp302_salary_scales'>[];
  referenceFunctions: Tables<'cp302_reference_functions'>[];
  components: Tables<'payroll_components'>[];
  taxProfiles: Tables<'employee_tax_profiles'>[];
  regimeEvidence: Tables<'employee_regime_evidence'>[];
  benefits: Tables<'employee_payroll_benefits'>[];
  providers: Tables<'payroll_providers'>[];
  providerComponents: Tables<'payroll_provider_components'>[];
  providerEmployeeMappings: Tables<'payroll_provider_employee_mappings'>[];
};

export type PayrollWorkspace = {
  readiness: PayrollReadiness;
  periods: Tables<'payroll_periods'>[];
  runs: Tables<'payroll_runs'>[];
  employeeResults: Tables<'payroll_employee_results'>[];
  componentLines: Tables<'payroll_component_lines'>[];
  componentSources: Tables<'payroll_component_sources'>[];
  employmentTerms: Tables<'employee_employment_terms'>[];
  rules: Tables<'payroll_rules'>[];
  legalSources: Tables<'payroll_legal_sources'>[];
  providers: Tables<'payroll_providers'>[];
  providerComponents: Tables<'payroll_provider_components'>[];
  providerEmployeeMappings: Tables<'payroll_provider_employee_mappings'>[];
  providerExports: Tables<'payroll_provider_exports'>[];
  reconciliations: Tables<'payroll_reconciliations'>[];
};

export function parseEmploymentTerms(value: Json): Tables<'employee_employment_terms'>[] {
  return Array.isArray(value) ? (value as Tables<'employee_employment_terms'>[]) : [];
}

export function parsePayrollCatalogue(value: Json): PayrollCatalogue {
  const data = record(value);
  return {
    configurations: rows(data, 'configurations'),
    ruleSets: rows(data, 'rule_sets'),
    rules: rows(data, 'rules'),
    legalSources: rows(data, 'legal_sources'),
    salaryScales: rows(data, 'salary_scales'),
    referenceFunctions: rows(data, 'reference_functions'),
    components: rows(data, 'components'),
    taxProfiles: rows(data, 'tax_profiles'),
    regimeEvidence: rows(data, 'regime_evidence'),
    benefits: rows(data, 'benefits'),
    providers: rows(data, 'providers'),
    providerComponents: rows(data, 'provider_components'),
    providerEmployeeMappings: rows(data, 'provider_employee_mappings')
  };
}

export function parsePayrollWorkspace(value: Json): PayrollWorkspace {
  const data = record(value);
  const readiness = record((data.readiness ?? {}) as Json);
  return {
    readiness: {
      restaurant_id: String(readiness.restaurant_id ?? ''),
      period_start: String(readiness.period_start ?? ''),
      period_end: String(readiness.period_end ?? ''),
      ready: readiness.ready === true,
      blockers: rows(readiness, 'blockers'),
      warnings: rows(readiness, 'warnings')
    },
    periods: rows(data, 'periods'),
    runs: rows(data, 'runs'),
    employeeResults: rows(data, 'employee_results'),
    componentLines: rows(data, 'component_lines'),
    componentSources: rows(data, 'component_sources'),
    employmentTerms: rows(data, 'employment_terms'),
    rules: rows(data, 'rules'),
    legalSources: rows(data, 'legal_sources'),
    providers: rows(data, 'providers'),
    providerComponents: rows(data, 'provider_components'),
    providerEmployeeMappings: rows(data, 'provider_employee_mappings'),
    providerExports: rows(data, 'provider_exports'),
    reconciliations: rows(data, 'reconciliations')
  };
}
