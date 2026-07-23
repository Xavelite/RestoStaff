import type { Json, Tables } from '../supabase/database.types.ts';
import type {
  AreaServiceDefault,
  EmployeeJobFunction,
  RecurringScheduleSlot,
  WorkArea
} from '../domain/operations.ts';
import { ABSENCE_TYPE_CODES, CONTRACT_TYPE_CODES } from '../domain/operations.ts';
import type {
  WorkPatternException,
  WorkPatternExceptionEvent
} from '../work-pattern-exceptions/work-pattern-exception.ts';

type RestaurantSettings = Partial<Tables<'restaurant_settings'>>;
type RestaurantOnboardingState = Partial<Tables<'restaurant_onboarding_state'>>;

export type EmployeeInvitationState = {
  id: string;
  restaurant_id: string;
  employee_id: string;
  email: string;
  invited_role: 'employee' | 'manager';
  status: 'pending' | 'accepted' | 'expired' | 'revoked';
  expires_at: string;
  sent_at: string;
  accepted_at: string | null;
  revoked_at: string | null;
  revoked_reason: string | null;
};

export type WorkspaceReadiness = {
  has_active_employees: boolean;
  has_active_areas: boolean;
  has_active_job_functions: boolean;
  has_open_services: boolean;
  has_coverage_rules: boolean;
  has_absence_policy: boolean;
};

export type PayrollExportRunSummary = {
  id: string;
  restaurant_id: string;
  period_start: string;
  period_end: string;
  format: 'generic_csv';
  schema_version: 1 | 2;
  filename: string;
  row_count: number;
  total_net_minutes: number;
  payload_sha256: string;
  created_by_profile_id: string;
  created_at: string;
};

type WorkspaceBase = {
  restaurant: Tables<'restaurants'>;
  restaurant_settings: RestaurantSettings;
};

export type WorkspaceBootstrap = WorkspaceBase & {
  current_employee: Tables<'employees'> | null;
  readiness: WorkspaceReadiness;
};

export type ManagerOperationsReadModel = WorkspaceBase & {
  employees: Tables<'employees'>[];
  employee_contracts: Tables<'employee_contracts'>[];
  employee_legal_profiles: Tables<'employee_legal_profiles'>[];
  employee_payroll_profiles: Tables<'employee_payroll_profiles'>[];
  job_functions: Tables<'job_functions'>[];
  employee_job_functions: EmployeeJobFunction[];
  recurring_schedule_slots: RecurringScheduleSlot[];
  contract_types: Tables<'contract_types'>[];
  work_areas: WorkArea[];
  services: Tables<'services'>[];
  area_service_defaults: AreaServiceDefault[];
  coverage_requirements: Tables<'coverage_requirements'>[];
  opening_hours: Tables<'opening_hours'>[];
  absence_types: Tables<'absence_types'>[];
  work_weeks: Tables<'work_weeks'>[];
  work_week_events: Tables<'work_week_events'>[];
  planned_shifts: Tables<'planned_shifts'>[];
  employee_availability_slots: Tables<'employee_availability_slots'>[];
  employee_availability_submissions: Tables<'employee_availability_submissions'>[];
  weekly_notes: Tables<'weekly_notes'>[];
  time_entries: Tables<'time_entries'>[];
  time_entry_adjustments: Tables<'time_entry_adjustments'>[];
  absences: Tables<'absences'>[];
  absence_events: Tables<'absence_events'>[];
  work_pattern_exceptions: WorkPatternException[];
  work_pattern_exception_events: WorkPatternExceptionEvent[];
  payroll_export_runs: PayrollExportRunSummary[];
};

export type EmployeeOperationsReadModel = WorkspaceBase & {
  employees: Tables<'employees'>[];
  employee_contracts: Tables<'employee_contracts'>[];
  job_functions: Tables<'job_functions'>[];
  employee_job_functions: EmployeeJobFunction[];
  recurring_schedule_slots: RecurringScheduleSlot[];
  contract_types: Tables<'contract_types'>[];
  work_areas: WorkArea[];
  services: Tables<'services'>[];
  absence_types: Tables<'absence_types'>[];
  work_weeks: Tables<'work_weeks'>[];
  work_week_events: Tables<'work_week_events'>[];
  planned_shifts: Tables<'planned_shifts'>[];
  employee_availability_slots: Tables<'employee_availability_slots'>[];
  employee_availability_submissions: Tables<'employee_availability_submissions'>[];
  time_entries: Tables<'time_entries'>[];
  absences: Tables<'absences'>[];
  work_pattern_exceptions: WorkPatternException[];
};

export type TeamReadModel = WorkspaceBase & {
  restaurant_memberships: Tables<'restaurant_memberships'>[];
  employees: Tables<'employees'>[];
  employee_access: Tables<'employee_access'>[];
  employee_invitation_states: EmployeeInvitationState[];
  employee_pin_credentials: Tables<'employee_pin_credentials'>[];
  employee_contact_details: Tables<'employee_contact_details'>[];
  employee_contracts: Tables<'employee_contracts'>[];
  employee_legal_profiles: Tables<'employee_legal_profiles'>[];
  employee_payroll_profiles: Tables<'employee_payroll_profiles'>[];
  job_functions: Tables<'job_functions'>[];
  employee_job_functions: EmployeeJobFunction[];
  recurring_schedule_slots: RecurringScheduleSlot[];
  contract_types: Tables<'contract_types'>[];
  absence_types: Tables<'absence_types'>[];
  absences: Tables<'absences'>[];
  absence_events: Tables<'absence_events'>[];
  work_pattern_exceptions: WorkPatternException[];
  work_pattern_exception_events: WorkPatternExceptionEvent[];
};

export type RestaurantReadModel = WorkspaceBase & {
  restaurant_onboarding_state: RestaurantOnboardingState;
  job_functions: Tables<'job_functions'>[];
  work_areas: WorkArea[];
  services: Tables<'services'>[];
  area_service_defaults: AreaServiceDefault[];
  coverage_requirements: Tables<'coverage_requirements'>[];
  opening_hours: Tables<'opening_hours'>[];
  absence_types: Tables<'absence_types'>[];
};

export type SchedulingReadModel =
  | ManagerOperationsReadModel
  | EmployeeOperationsReadModel;

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function source(value: Json): UnknownRecord {
  if (!isRecord(value) || !isRecord(value.restaurant) || typeof value.restaurant.id !== 'string') {
    throw new TypeError('The read model is missing a valid restaurant.');
  }
  return value;
}

function rows<T>(value: UnknownRecord, key: string): T[] {
  return Array.isArray(value[key]) ? (value[key] as T[]) : [];
}

function base(value: UnknownRecord): WorkspaceBase {
  return {
    restaurant: value.restaurant as Tables<'restaurants'>,
    restaurant_settings: isRecord(value.restaurant_settings)
      ? (value.restaurant_settings as RestaurantSettings)
      : {}
  };
}

function contractTypes(value: UnknownRecord) {
  return rows<Tables<'contract_types'>>(value, 'contract_types').filter((row) =>
    (CONTRACT_TYPE_CODES as readonly string[]).includes(row.code.toUpperCase())
  );
}

function absenceTypes(value: UnknownRecord) {
  return rows<Tables<'absence_types'>>(value, 'absence_types').filter((row) =>
    (ABSENCE_TYPE_CODES as readonly string[]).includes(row.code.toUpperCase())
  );
}

export function parseWorkspaceBootstrap(value: Json): WorkspaceBootstrap {
  const data = source(value);
  const readiness = isRecord(data.readiness) ? data.readiness : {};
  return {
    ...base(data),
    current_employee: isRecord(data.current_employee)
      ? (data.current_employee as Tables<'employees'>)
      : null,
    readiness: {
      has_active_employees: readiness.has_active_employees === true,
      has_active_areas: readiness.has_active_areas === true,
      has_active_job_functions: readiness.has_active_job_functions === true,
      has_open_services: readiness.has_open_services === true,
      has_coverage_rules: readiness.has_coverage_rules === true,
      has_absence_policy: readiness.has_absence_policy === true
    }
  };
}

export function parseManagerOperationsReadModel(value: Json): ManagerOperationsReadModel {
  const data = source(value);
  return {
    ...base(data),
    employees: rows(data, 'employees'),
    employee_contracts: rows(data, 'employee_contracts'),
    employee_legal_profiles: rows(data, 'employee_legal_profiles'),
    employee_payroll_profiles: rows(data, 'employee_payroll_profiles'),
    job_functions: rows(data, 'job_functions'),
    employee_job_functions: rows(data, 'employee_job_functions'),
    recurring_schedule_slots: rows(data, 'recurring_schedule_slots'),
    contract_types: contractTypes(data),
    work_areas: rows(data, 'work_areas'),
    services: rows(data, 'services'),
    area_service_defaults: rows(data, 'area_service_defaults'),
    coverage_requirements: rows(data, 'coverage_requirements'),
    opening_hours: rows(data, 'opening_hours'),
    absence_types: absenceTypes(data),
    work_weeks: rows(data, 'work_weeks'),
    work_week_events: rows(data, 'work_week_events'),
    planned_shifts: rows(data, 'planned_shifts'),
    employee_availability_slots: rows(data, 'employee_availability_slots'),
    employee_availability_submissions: rows(data, 'employee_availability_submissions'),
    weekly_notes: rows(data, 'weekly_notes'),
    time_entries: rows(data, 'time_entries'),
    time_entry_adjustments: rows(data, 'time_entry_adjustments'),
    absences: rows(data, 'absences'),
    absence_events: rows(data, 'absence_events'),
    work_pattern_exceptions: rows(data, 'work_pattern_exceptions'),
    work_pattern_exception_events: rows(data, 'work_pattern_exception_events'),
    payroll_export_runs: rows(data, 'payroll_export_runs')
  };
}

export function parseEmployeeOperationsReadModel(value: Json): EmployeeOperationsReadModel {
  const data = source(value);
  return {
    ...base(data),
    employees: rows(data, 'employees'),
    employee_contracts: rows(data, 'employee_contracts'),
    job_functions: rows(data, 'job_functions'),
    employee_job_functions: rows(data, 'employee_job_functions'),
    recurring_schedule_slots: rows(data, 'recurring_schedule_slots'),
    contract_types: contractTypes(data),
    work_areas: rows(data, 'work_areas'),
    services: rows(data, 'services'),
    absence_types: absenceTypes(data),
    work_weeks: rows(data, 'work_weeks'),
    work_week_events: rows(data, 'work_week_events'),
    planned_shifts: rows(data, 'planned_shifts'),
    employee_availability_slots: rows(data, 'employee_availability_slots'),
    employee_availability_submissions: rows(data, 'employee_availability_submissions'),
    time_entries: rows(data, 'time_entries'),
    absences: rows(data, 'absences'),
    work_pattern_exceptions: rows(data, 'work_pattern_exceptions')
  };
}

export function parseTeamReadModel(value: Json): TeamReadModel {
  const data = source(value);
  return {
    ...base(data),
    restaurant_memberships: rows(data, 'restaurant_memberships'),
    employees: rows(data, 'employees'),
    employee_access: rows(data, 'employee_access'),
    employee_invitation_states: rows(data, 'employee_invitation_states'),
    employee_pin_credentials: rows(data, 'employee_pin_credentials'),
    employee_contact_details: rows(data, 'employee_contact_details'),
    employee_contracts: rows(data, 'employee_contracts'),
    employee_legal_profiles: rows(data, 'employee_legal_profiles'),
    employee_payroll_profiles: rows(data, 'employee_payroll_profiles'),
    job_functions: rows(data, 'job_functions'),
    employee_job_functions: rows(data, 'employee_job_functions'),
    recurring_schedule_slots: rows(data, 'recurring_schedule_slots'),
    contract_types: contractTypes(data),
    absence_types: absenceTypes(data),
    absences: rows(data, 'absences'),
    absence_events: rows(data, 'absence_events'),
    work_pattern_exceptions: rows(data, 'work_pattern_exceptions'),
    work_pattern_exception_events: rows(data, 'work_pattern_exception_events')
  };
}

export function parseRestaurantReadModel(value: Json): RestaurantReadModel {
  const data = source(value);
  return {
    ...base(data),
    restaurant_onboarding_state: isRecord(data.restaurant_onboarding_state)
      ? (data.restaurant_onboarding_state as RestaurantOnboardingState)
      : {},
    job_functions: rows(data, 'job_functions'),
    work_areas: rows(data, 'work_areas'),
    services: rows(data, 'services'),
    area_service_defaults: rows(data, 'area_service_defaults'),
    coverage_requirements: rows(data, 'coverage_requirements'),
    opening_hours: rows(data, 'opening_hours'),
    absence_types: absenceTypes(data)
  };
}
