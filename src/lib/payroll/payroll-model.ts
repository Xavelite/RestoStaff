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
