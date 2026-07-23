import { supabase } from '$lib/supabase/client';
import type { Json } from '$lib/supabase/database.types';
import { toApiError } from '$lib/api/error';
import {
  parseEmploymentTerms,
  parsePayrollCatalogue,
  parsePayrollWorkspace
} from './payroll-model';

export async function getEmployeeEmploymentTerms(restaurantId: string) {
  const { data, error } = await supabase.rpc('get_employee_employment_terms', {
    p_restaurant_id: restaurantId
  });
  if (error) throw toApiError(error, 'Employment terms could not be loaded.');
  return parseEmploymentTerms(data);
}

export async function saveEmployeeEmploymentTerms(input: {
  restaurantId: string;
  employeeId: string;
  terms: Json;
}) {
  const { data, error } = await supabase.rpc('save_employee_employment_terms', {
    p_restaurant_id: input.restaurantId,
    p_employee_id: input.employeeId,
    p_terms: input.terms
  });
  if (error) throw toApiError(error, 'Employment terms could not be saved.');
  return data;
}

export async function validateEmployeeEmploymentTerms(input: {
  restaurantId: string;
  employeeId: string;
  employmentTermsId: string;
}) {
  const { data, error } = await supabase.rpc('validate_employee_employment_terms', {
    p_restaurant_id: input.restaurantId,
    p_employee_id: input.employeeId,
    p_employment_terms_id: input.employmentTermsId
  });
  if (error) throw toApiError(error, 'Employment terms could not be validated.');
  return data;
}

export async function getPayrollCatalogue(restaurantId: string) {
  const { data, error } = await supabase.rpc('get_payroll_catalogue', {
    p_restaurant_id: restaurantId
  });
  if (error) throw toApiError(error, 'Payroll configuration could not be loaded.');
  return parsePayrollCatalogue(data);
}

export async function saveRestaurantPayrollConfiguration(
  restaurantId: string,
  configuration: Json
) {
  const { data, error } = await supabase.rpc('save_restaurant_payroll_configuration', {
    p_restaurant_id: restaurantId,
    p_configuration: configuration
  });
  if (error) throw toApiError(error, 'Payroll configuration could not be saved.');
  return data;
}

export async function validateRestaurantPayrollConfiguration(
  restaurantId: string,
  configurationId: string
) {
  const { data, error } = await supabase.rpc('validate_restaurant_payroll_configuration', {
    p_restaurant_id: restaurantId,
    p_configuration_id: configurationId
  });
  if (error) throw toApiError(error, 'Payroll configuration could not be validated.');
  return data;
}

export async function getPayrollWorkspace(
  restaurantId: string,
  fromDate: string,
  toDate: string
) {
  const { data, error } = await supabase.rpc('get_payroll_workspace', {
    p_restaurant_id: restaurantId,
    p_from_date: fromDate,
    p_to_date: toDate
  });
  if (error) throw toApiError(error, 'Payroll calculations could not be loaded.');
  return parsePayrollWorkspace(data);
}

export async function calculatePayrollRun(
  restaurantId: string,
  periodStart: string,
  periodEnd: string
) {
  const { data, error } = await supabase.rpc('calculate_payroll_run', {
    p_restaurant_id: restaurantId,
    p_period_start: periodStart,
    p_period_end: periodEnd
  });
  if (error) throw toApiError(error, 'Payroll could not be calculated.');
  return data;
}

export async function setPayrollRunStatus(
  restaurantId: string,
  payrollRunId: string,
  status: 'reviewed' | 'locked_estimate' | 'reconciled' | 'finalized'
) {
  const { data, error } = await supabase.rpc('set_payroll_run_status', {
    p_restaurant_id: restaurantId,
    p_payroll_run_id: payrollRunId,
    p_status: status
  });
  if (error) throw toApiError(error, 'Payroll status could not be changed.');
  return data;
}

export type InsightsCostRate = {
  employee_id: string;
  estimated_hourly_cost_cents: number | null;
  has_rate: boolean;
  employment_type: string;
};

export type InsightsCostRates = {
  source: 'estimated_profile_rate';
  rates: InsightsCostRate[];
  missing_active_employee_count: number;
};

export async function getInsightsCostRates(restaurantId: string): Promise<InsightsCostRates> {
  const { data, error } = await supabase.rpc('get_insights_cost_rates', {
    p_restaurant_id: restaurantId
  });
  if (error) throw toApiError(error, 'Estimated labour-cost rates could not be loaded.');
  const value = data && typeof data === 'object' && !Array.isArray(data)
    ? (data as Record<string, Json>)
    : {};
  return {
    source: 'estimated_profile_rate',
    rates: Array.isArray(value.rates) ? (value.rates as unknown as InsightsCostRate[]) : [],
    missing_active_employee_count: Number(value.missing_active_employee_count ?? 0)
  };
}

export type TimeEntryPayrollEvidence = {
  timeEntryId: string;
  actualJobFunctionId: string;
  actualAreaId: string;
  actualAssignmentSource: string;
  breakIntervals: Array<{
    id: string;
    break_started_at: string | null;
    break_ended_at: string | null;
    duration_seconds: number;
    evidence_kind: string;
    source: string;
  }>;
};

export async function getTimeEntryPayrollEvidence(
  restaurantId: string,
  timeEntryId: string
): Promise<TimeEntryPayrollEvidence> {
  const { data, error } = await supabase.rpc('get_time_entry_payroll_evidence', {
    p_restaurant_id: restaurantId,
    p_time_entry_id: timeEntryId
  });
  if (error) throw toApiError(error, 'Payroll evidence could not be loaded.');
  const value = data && typeof data === 'object' && !Array.isArray(data)
    ? (data as Record<string, Json>)
    : {};
  return {
    timeEntryId: String(value.time_entry_id ?? ''),
    actualJobFunctionId: String(value.actual_job_function_id ?? ''),
    actualAreaId: String(value.actual_area_id ?? ''),
    actualAssignmentSource: String(value.actual_assignment_source ?? 'unresolved'),
    breakIntervals: Array.isArray(value.break_intervals)
      ? (value.break_intervals as TimeEntryPayrollEvidence['breakIntervals'])
      : []
  };
}

export async function saveTimeEntryPayrollEvidence(input: {
  restaurantId: string;
  timeEntryId: string;
  actualJobFunctionId: string;
  actualAreaId: string;
  breakIntervals: Json;
  reason: string;
}) {
  const { data, error } = await supabase.rpc('save_time_entry_payroll_evidence', {
    p_restaurant_id: input.restaurantId,
    p_time_entry_id: input.timeEntryId,
    p_actual_job_function_id: input.actualJobFunctionId,
    p_actual_area_id: input.actualAreaId,
    p_break_intervals: input.breakIntervals,
    p_reason: input.reason
  });
  if (error) throw toApiError(error, 'Payroll evidence could not be saved.');
  return data;
}

export async function saveEmployeeTaxProfile(input: {
  restaurantId: string;
  employeeId: string;
  profile: Json;
}) {
  const { data, error } = await supabase.rpc('save_employee_tax_profile', {
    p_restaurant_id: input.restaurantId,
    p_employee_id: input.employeeId,
    p_profile: input.profile
  });
  if (error) throw toApiError(error, 'Tax profile could not be saved.');
  return data;
}

export async function recordEmployeeRegimeEvidence(input: {
  restaurantId: string;
  employeeId: string;
  evidence: Json;
}) {
  const { data, error } = await supabase.rpc('record_employee_regime_evidence', {
    p_restaurant_id: input.restaurantId,
    p_employee_id: input.employeeId,
    p_evidence: input.evidence
  });
  if (error) throw toApiError(error, 'Payroll evidence could not be recorded.');
  return data;
}

export async function saveEmployeePayrollBenefit(input: {
  restaurantId: string;
  employeeId: string;
  benefit: Json;
}) {
  const { data, error } = await supabase.rpc('save_employee_payroll_benefit', {
    p_restaurant_id: input.restaurantId,
    p_employee_id: input.employeeId,
    p_benefit: input.benefit
  });
  if (error) throw toApiError(error, 'Payroll benefit could not be saved.');
  return data;
}
