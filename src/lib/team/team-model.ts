import { asJsonArray } from '../api/json.ts';
import type { TeamReadModel } from '$lib/api/workspace-snapshot';
import type { TeamSavePayload } from '$lib/api/mutations';
import type { WorkspaceRole } from '$lib/api/workspace';
import {
  workRegime,
  type WorkRegime
} from '../domain/operations.ts';
import type { Tables } from '../supabase/database.types.ts';
import { cents, parseHourlyRate } from '../payroll-engine/money.ts';

export type ContractDurationKind = 'indefinite' | 'fixed_term' | 'defined_work' | 'replacement';
export type EmploymentPayrollRegime =
  | 'ordinary'
  | 'flexi'
  | 'student'
  | 'student_reduced'
  | 'student_ordinary'
  | 'horeca_occasional'
  | 'interim'
  | 'self_employed';

export type EmployeeDraft = {
  id: string;
  displayName: string;
  firstName: string;
  lastName: string;
  jobFunctionIds: string[];
  active: boolean;
  email: string;
  phone: string;
  address: string;
  postalCode: string;
  city: string;
  emergencyName: string;
  emergencyRelation: string;
  emergencyPhone: string;
  notes: string;
  birthDate: string;
  nationalRegistryNumber: string;
  sex: string;
  nationality: string;
  language: string;
  contractId: string;
  contractTypeId: string;
  workRegime: WorkRegime;
  workerStatus: 'blue_collar' | 'white_collar' | '';
  recurringSlots: Array<{
    weekday: number;
    serviceKey: 'lunch' | 'evening';
  }>;
  contractStart: string;
  contractEnd: string;
  weeklyContractHours: number;
  contractDays: number;
  annualLeaveEntitlementDays: number;
  employmentTermsId: string;
  employmentTermsVersion: number;
  employmentValidFrom: string;
  employmentValidTo: string;
  contractDurationKind: ContractDurationKind;
  employmentRegime: EmploymentPayrollRegime;
  employmentVolume: 'full_time' | 'part_time';
  weeklyHoursRegime: 'fixed' | 'variable_average';
  legalScheduleType: 'fixed' | 'variable';
  salaryBasis: 'hourly' | 'monthly' | '';
  referenceFullTimeWeeklyMinutes: number;
  referencePeriodWeeks: number;
  cp302ReferenceFunctionCode: string;
  cp302Category: number | '';
  functionSeniorityDate: string;
  companySeniorityDate: string;
  contractualHourlyRate: string;
  contractualMonthlySalary: string;
  employmentSourceStatus: 'recorded' | 'complete' | 'migrated_unverified' | 'verified';
  payrollEmployeeId: string;
  iban: string;
  bic: string;
  hourlyWageRate: number;
  estimatedHourlyCost: number;
  companyCostFormula: string;
  payrollNotes: string;
  profileId: string;
  accessRole: 'owner' | 'manager' | 'employee' | '';
  accessState:
    | 'active'
    | 'disabled'
    | 'invited'
    | 'expired'
    | 'revoked'
    | 'not_invited';
  invitationRole: 'manager' | 'employee';
  invitationExpiresAt: string;
  invitationSentAt: string;
  badgeEnabled: boolean;
  pinStatus: string;
};

function durationFromLegacy(code?: string): ContractDurationKind {
  if (code === 'CDI') return 'indefinite';
  if (code === 'FREELANCE') return 'defined_work';
  return 'fixed_term';
}

function regimeFromLegacy(code?: string): EmploymentPayrollRegime {
  if (code === 'FLEXI') return 'flexi';
  if (code === 'STUDENT') return 'student';
  if (code === 'EXTRA') return 'horeca_occasional';
  if (code === 'FREELANCE') return 'self_employed';
  return 'ordinary';
}

function euroInput(value: string | number | bigint | null | undefined): string {
  const amount = cents(value);
  return `${amount / 100n}.${String(amount % 100n).padStart(2, '0')}`;
}

export function employeeDrafts(
  snapshot: TeamReadModel,
  employmentTerms: Tables<'employee_employment_terms'>[] = []
): EmployeeDraft[] {
  return snapshot.employees.map((employee) => {
    const contact = snapshot.employee_contact_details.find(
      (row) => row.employee_id === employee.id
    );
    const legal = snapshot.employee_legal_profiles.find(
      (row) => row.employee_id === employee.id
    );
    const contract = snapshot.employee_contracts.find(
      (row) => row.employee_id === employee.id && row.is_current && row.active
    );
    const payroll = snapshot.employee_payroll_profiles.find(
      (row) => row.employee_id === employee.id
    );
    const access = snapshot.employee_access.find((row) => row.employee_id === employee.id);
    const invitation = snapshot.employee_invitation_states.find(
      (row) => row.employee_id === employee.id
    );
    const membership = access?.profile_id
      ? snapshot.restaurant_memberships.find(
          (row) => row.profile_id === access.profile_id
        )
      : undefined;
    const pin = snapshot.employee_pin_credentials.find(
      (row) => row.employee_id === employee.id
    );
    const contractType = snapshot.contract_types.find(
      (row) => row.id === contract?.contract_type_id
    );
    const terms = employmentTerms
      .filter((row) => row.employee_id === employee.id && row.active)
      .sort((left, right) => right.valid_from.localeCompare(left.valid_from))[0];
    const jobFunctionIds = (snapshot.employee_job_functions ?? [])
      .filter((row) => row.employee_id === employee.id && row.active)
      .sort((a, b) => Number(b.is_primary) - Number(a.is_primary))
      .map((row) => row.job_function_id);

    return {
      id: employee.id,
      displayName: employee.display_name,
      firstName: employee.first_name ?? '',
      lastName: employee.last_name ?? '',
      jobFunctionIds,
      active: employee.active,
      email: contact?.email ?? '',
      phone: contact?.mobile_phone ?? contact?.phone ?? '',
      address: contact?.address_line1 ?? '',
      postalCode: contact?.postal_code ?? '',
      city: contact?.city ?? '',
      emergencyName: contact?.emergency_name ?? '',
      emergencyRelation: contact?.emergency_relation ?? '',
      emergencyPhone: contact?.emergency_phone ?? '',
      notes: contact?.notes ?? '',
      birthDate: legal?.birth_date ?? '',
      nationalRegistryNumber: legal?.national_registry_number ?? '',
      sex: legal?.sex ?? '',
      nationality: legal?.nationality ?? '',
      language: legal?.language ?? '',
      contractId: contract?.id ?? '',
      contractTypeId: contract?.contract_type_id ?? '',
      workRegime: workRegime(contract?.work_regime, contractType?.code),
      workerStatus: terms?.worker_status ?? contract?.worker_status ?? '',
      recurringSlots: (snapshot.recurring_schedule_slots ?? [])
        .filter((row) => row.employee_id === employee.id && row.active)
        .map((row) => ({
          weekday: row.weekday,
          serviceKey: row.service_key === 'evening' ? 'evening' : 'lunch'
        })),
      contractStart: contract?.contract_start ?? '',
      contractEnd: contract?.contract_end ?? '',
      weeklyContractHours: contract?.weekly_contract_hours ?? 0,
      contractDays: contract?.contract_days ?? 0,
      annualLeaveEntitlementDays: contract?.annual_leave_entitlement_days ?? 0,
      employmentTermsId: terms?.id ?? '',
      employmentTermsVersion: terms?.version_number ?? 0,
      employmentValidFrom: terms?.valid_from ?? contract?.contract_start ?? '',
      employmentValidTo: terms?.valid_to ?? contract?.contract_end ?? '',
      contractDurationKind: terms?.contract_duration_kind ?? durationFromLegacy(contractType?.code),
      employmentRegime: terms?.employment_regime ?? regimeFromLegacy(contractType?.code),
      employmentVolume:
        terms?.employment_volume ?? ((contract?.weekly_contract_hours ?? 0) >= 38 ? 'full_time' : 'part_time'),
      weeklyHoursRegime: terms?.weekly_hours_regime ?? 'fixed',
      legalScheduleType:
        terms?.legal_schedule_type ?? (contract?.work_regime === 'fixed_schedule' ? 'fixed' : 'variable'),
      salaryBasis:
        terms?.salary_basis === 'hourly' || terms?.salary_basis === 'monthly'
          ? terms.salary_basis
          : payroll?.hourly_wage_rate
            ? 'hourly'
            : '',
      referenceFullTimeWeeklyMinutes: terms?.reference_full_time_weekly_minutes ?? 2280,
      referencePeriodWeeks: terms?.reference_period_weeks ?? 1,
      cp302ReferenceFunctionCode: terms?.cp302_reference_function_code ?? '',
      cp302Category: terms?.cp302_category ?? '',
      functionSeniorityDate: terms?.function_seniority_date ?? '',
      companySeniorityDate: terms?.company_seniority_date ?? '',
      contractualHourlyRate:
        terms?.contractual_hourly_rate != null
          ? String(terms.contractual_hourly_rate)
          : payroll?.hourly_wage_rate
            ? parseHourlyRate(String(payroll.hourly_wage_rate)) ?? ''
            : '',
      contractualMonthlySalary: euroInput(terms?.contractual_monthly_salary_cents),
      employmentSourceStatus:
        terms?.source_status === 'verified' ||
        terms?.source_status === 'complete' ||
        terms?.source_status === 'migrated_unverified'
          ? terms.source_status
          : 'recorded',
      payrollEmployeeId: payroll?.payroll_employee_id ?? '',
      iban: payroll?.iban ?? '',
      bic: payroll?.bic ?? '',
      hourlyWageRate: payroll?.hourly_wage_rate ?? 0,
      estimatedHourlyCost: payroll?.estimated_hourly_cost ?? 0,
      companyCostFormula: payroll?.company_cost_formula ?? '',
      payrollNotes: payroll?.payroll_notes ?? '',
      profileId: access?.profile_id ?? '',
      accessRole:
        membership?.role === 'owner' ||
        membership?.role === 'manager' ||
        membership?.role === 'employee'
          ? membership.role
          : '',
      accessState:
        access?.profile_id && access.access_status === 'active'
          ? 'active'
          : access?.profile_id && access.access_status === 'disabled'
            ? 'disabled'
            : invitation?.status === 'pending'
              ? 'invited'
              : invitation?.status === 'expired' || invitation?.status === 'revoked'
                ? invitation.status
                : 'not_invited',
      invitationRole:
        invitation?.invited_role === 'manager' ? 'manager' : 'employee',
      invitationExpiresAt: invitation?.expires_at ?? '',
      invitationSentAt: invitation?.sent_at ?? '',
      badgeEnabled: access?.badge_enabled ?? true,
      pinStatus: pin?.pin_status ?? 'not_set'
    };
  });
}
export function newEmployeeDraft(id: string): EmployeeDraft {
  return {
    id,
    displayName: '',
    firstName: '',
    lastName: '',
    jobFunctionIds: [],
    active: true,
    email: '',
    phone: '',
    address: '',
    postalCode: '',
    city: '',
    emergencyName: '',
    emergencyRelation: '',
    emergencyPhone: '',
    notes: '',
    birthDate: '',
    nationalRegistryNumber: '',
    sex: '',
    nationality: '',
    language: '',
    contractId: '',
    contractTypeId: '',
    workRegime: 'weekly_availability',
    workerStatus: '',
    recurringSlots: [],
    contractStart: '',
    contractEnd: '',
    weeklyContractHours: 0,
    contractDays: 0,
    annualLeaveEntitlementDays: 0,
    employmentTermsId: '',
    employmentTermsVersion: 0,
    employmentValidFrom: '',
    employmentValidTo: '',
    contractDurationKind: 'fixed_term',
    employmentRegime: 'ordinary',
    employmentVolume: 'part_time',
    weeklyHoursRegime: 'fixed',
    legalScheduleType: 'variable',
    salaryBasis: '',
    referenceFullTimeWeeklyMinutes: 2280,
    referencePeriodWeeks: 1,
    cp302ReferenceFunctionCode: '',
    cp302Category: '',
    functionSeniorityDate: '',
    companySeniorityDate: '',
    contractualHourlyRate: '',
    contractualMonthlySalary: '0.00',
    employmentSourceStatus: 'recorded',
    payrollEmployeeId: '',
    iban: '',
    bic: '',
    hourlyWageRate: 0,
    estimatedHourlyCost: 0,
    companyCostFormula: '',
    payrollNotes: '',
    profileId: '',
    accessRole: '',
    accessState: 'not_invited',
    invitationRole: 'employee',
    invitationExpiresAt: '',
    invitationSentAt: '',
    badgeEnabled: true,
    pinStatus: 'not_set'
  };
}


export function teamDraftValidationError(drafts: EmployeeDraft[]): string | null {
  // A blank row is how you add several people at once and fill them in — it is
  // dropped on save (see teamSavePayload), never a reason to block it. Only rows
  // that carry a name reach the server, so the date checks run against those.
  for (const employee of drafts) {
    if (!employee.displayName.trim()) continue;
    if (employee.contractEnd && employee.contractStart && employee.contractEnd < employee.contractStart) {
      return 'Contract end date must be after the start date.';
    }
    if (
      employee.employmentValidTo &&
      employee.employmentValidFrom &&
      employee.employmentValidTo < employee.employmentValidFrom
    ) {
      return 'Employment end date must be after the effective date.';
    }
  }
  return null;
}

export function employmentTermsPayload(employee: EmployeeDraft) {
  const monthly = employee.contractualMonthlySalary.trim().replace(',', '.');
  const [whole = '0', fraction = ''] = monthly.split('.');
  const monthlySalaryCents = /^\d+$/.test(whole) && /^\d{0,2}$/.test(fraction)
    ? String(BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0') || '0'))
    : null;
  return {
    contract_id: employee.contractId || null,
    valid_from: employee.employmentValidFrom || employee.contractStart || null,
    weekly_hours_regime: employee.weeklyHoursRegime,
    salary_basis: employee.salaryBasis || null,
    reference_period_weeks: employee.referencePeriodWeeks,
    cp302_reference_function_code: employee.cp302ReferenceFunctionCode.trim() || null,
    function_seniority_date: employee.functionSeniorityDate || null,
    company_seniority_date: employee.companySeniorityDate || null,
    contractual_hourly_rate: employee.contractualHourlyRate.trim().replace(',', '.') || null,
    contractual_monthly_salary_cents: employee.salaryBasis === 'monthly' ? monthlySalaryCents : null,
    annual_leave_entitlement_days: Math.max(0, employee.annualLeaveEntitlementDays),
    source_notes: 'Recorded by the restaurant owner in Team.'
  };
}

const nullable = (input: string) => input.trim() || null;

export function teamSavePayload(
  restaurantId: string,
  drafts: EmployeeDraft[],
  role: WorkspaceRole,
  employmentTermDrafts: EmployeeDraft[] = []
): TeamSavePayload {
  const includedDrafts = drafts.filter((employee) => {
    const displayName = employee.displayName.trim() || `${employee.firstName} ${employee.lastName}`.trim();
    return Boolean(displayName);
  });


  const employees = asJsonArray(
    includedDrafts.map((employee, index) => ({
      id: employee.id,
      restaurant_id: restaurantId,
      display_name:
        employee.displayName.trim() ||
        `${employee.firstName} ${employee.lastName}`.trim(),
      first_name: nullable(employee.firstName),
      last_name: nullable(employee.lastName),
      active: employee.active,
      sort_order: index
    }))
  );

  const contacts = asJsonArray(
    includedDrafts.map((employee) => ({
      restaurant_id: restaurantId,
      employee_id: employee.id,
      email: nullable(employee.email),
      phone: nullable(employee.phone),
      mobile_phone: nullable(employee.phone),
      address_line1: nullable(employee.address),
      postal_code: nullable(employee.postalCode),
      city: nullable(employee.city),
      emergency_name: nullable(employee.emergencyName),
      emergency_relation: nullable(employee.emergencyRelation),
      emergency_phone: nullable(employee.emergencyPhone),
      notes: nullable(employee.notes)
    }))
  );

  const access = asJsonArray(
    includedDrafts.map((employee) => ({
      restaurant_id: restaurantId,
      employee_id: employee.id,
      badge_enabled: employee.active && employee.badgeEnabled
    }))
  );

  const employeeJobFunctions = asJsonArray(
    includedDrafts.flatMap((employee) =>
      employee.jobFunctionIds.map((jobFunctionId, index) => ({
        restaurant_id: restaurantId,
        employee_id: employee.id,
        job_function_id: jobFunctionId,
        is_primary: index === 0,
        active: employee.active
      }))
    )
  );
  const recurringScheduleSlots = asJsonArray(
    includedDrafts
      .filter((employee) => employee.active && employee.workRegime === 'fixed_schedule')
      .flatMap((employee) =>
        employee.recurringSlots.map((slot) => ({
          restaurant_id: restaurantId,
          employee_id: employee.id,
          weekday: slot.weekday,
          service_key: slot.serviceKey,
          active: true
        }))
      )
  );

  const legalProfiles = asJsonArray(
    includedDrafts.map((employee) => ({
      restaurant_id: restaurantId,
      employee_id: employee.id,
      birth_date: nullable(employee.birthDate),
      national_registry_number: nullable(employee.nationalRegistryNumber),
      sex: nullable(employee.sex),
      nationality: nullable(employee.nationality),
      language: nullable(employee.language)
    }))
  );

  const contracts = asJsonArray(
    includedDrafts
      .filter(
        (employee) =>
          employee.contractId ||
          employee.contractTypeId ||
          employee.contractStart ||
          employee.contractEnd ||
          employee.weeklyContractHours ||
          employee.contractDays
      )
      .map((employee) => ({
        contract_id: nullable(employee.contractId),
        restaurant_id: restaurantId,
        employee_id: employee.id,
        contract_type_id: nullable(employee.contractTypeId),
        work_regime: employee.workRegime,
        worker_status: nullable(employee.workerStatus),
        contract_start: nullable(employee.contractStart),
        contract_end: nullable(employee.contractEnd),
        weekly_contract_hours: Math.max(0, Number(employee.weeklyContractHours) || 0),
        contract_days: Math.max(0, Number(employee.contractDays) || 0),
        annual_leave_entitlement_days: Math.max(
          0,
          Number(employee.annualLeaveEntitlementDays) || 0
        ),
        active: true
      }))
  );

  const employmentTerms = asJsonArray(
    (role === 'owner' ? employmentTermDrafts : [])
      .filter((employee) => includedDrafts.some((included) => included.id === employee.id))
      .map((employee) => ({
        employee_id: employee.id,
        ...employmentTermsPayload(employee)
      }))
  );

  const payrollProfiles = asJsonArray(
    (role === 'owner' ? includedDrafts : []).map((employee) => ({
      restaurant_id: restaurantId,
      employee_id: employee.id,
      payroll_employee_id: nullable(employee.payrollEmployeeId),
      iban: nullable(employee.iban),
      bic: nullable(employee.bic),
      hourly_wage_rate: Math.max(0, Number(employee.hourlyWageRate) || 0),
      estimated_hourly_cost: Math.max(0, Number(employee.estimatedHourlyCost) || 0),
      company_cost_formula: nullable(employee.companyCostFormula),
      payroll_notes: nullable(employee.payrollNotes)
    }))
  );

  return {
    employees,
    employeeJobFunctions,
    recurringScheduleSlots,
    contacts,
    legalProfiles,
    contracts,
    payrollProfiles,
    access,
    employmentTerms
  };
}

// Team readiness checklist for the Readiness tab. Pure shaping; tab navigation
// is delegated back to the route through a single onSelectTab callback so the
// model stays free of view state.
export function teamSetupSteps(input: {
  owner: boolean;
  activeEmployees: EmployeeDraft[];
  payrollReady: number;
  onSelect: () => void;
}): Array<{
  label: string;
  detail: string;
  values?: Record<string, string | number>;
  complete: boolean;
  href: string;
  onselect: () => void;
}> {
  const { owner, activeEmployees, payrollReady, onSelect } = input;
  const sharedSteps = [
    {
      label: 'Active employees',
      detail: activeEmployees.length ? '{count} active' : 'Add the first employee',
      values: activeEmployees.length ? { count: activeEmployees.length } : undefined,
      complete: activeEmployees.length > 0,
      href: '#staff-grid',
      onselect: onSelect
    },
    {
      label: 'Job assignments',
      detail: activeEmployees.every((employee) => employee.jobFunctionIds.length)
        ? 'Assigned'
        : 'Some employees need a job function',
      complete:
        activeEmployees.length > 0 &&
        activeEmployees.every((employee) => employee.jobFunctionIds.length),
      href: '#staff-grid',
      onselect: onSelect
    },
    {
      label: 'Workspace access',
      detail: 'Accounts ready',
      complete:
        activeEmployees.length > 0 &&
        activeEmployees.every(
          (employee) =>
            employee.email &&
            !['not_invited', 'expired', 'revoked'].includes(employee.accessState)
        ),
      href: '#staff-grid',
      onselect: onSelect
    },
  ];
  if (!owner) return sharedSteps;
  return [
    ...sharedSteps,
    {
      label: 'Employment contracts',
      detail: 'Contracts ready',
      complete:
        activeEmployees.length > 0 &&
        activeEmployees.every(
          (employee) => employee.contractTypeId && employee.contractStart
        ),
      href: '#staff-grid',
      onselect: onSelect
    },
    {
      label: 'Payroll readiness',
      detail: '{ready}/{total} ready',
      values: { ready: payrollReady, total: activeEmployees.length },
      complete:
        activeEmployees.length > 0 && payrollReady === activeEmployees.length,
      href: '#staff-grid',
      onselect: onSelect
    }
  ];
}
