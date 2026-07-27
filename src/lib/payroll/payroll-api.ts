import { supabase } from '$lib/supabase/client';
import type { Json } from '$lib/supabase/database.types';
import { toApiError } from '$lib/api/error';
import { parseEmploymentTerms, parsePayrollCatalogue } from './payroll-model';

export async function getEmployeeEmploymentTerms(restaurantId: string) {
  const { data, error } = await supabase.rpc('get_employee_employment_terms', {
    p_restaurant_id: restaurantId
  });
  if (error) throw toApiError(error, 'Employment terms could not be loaded.');
  return parseEmploymentTerms(data);
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

type TimeEntryPayrollEvidence = {
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
