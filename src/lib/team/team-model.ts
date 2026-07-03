import { asJsonArray } from '../api/json.ts';
import type { TeamReadModel } from '$lib/api/workspace-snapshot';
import type { TeamSavePayload } from '$lib/api/mutations';
import type { WorkspaceRole } from '$lib/api/workspace';
import {
  workRegime,
  type WorkRegime
} from '../domain/operations.ts';
import { addDays } from '../calendar/date.ts';
import type { FourMetrics, MetricDetailRow } from '../ui/metric.ts';

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
  recurringSlots: Array<{
    weekday: number;
    serviceKey: 'lunch' | 'evening';
  }>;
  contractStart: string;
  contractEnd: string;
  weeklyContractHours: number;
  contractDays: number;
  annualLeaveEntitlementDays: number;
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

export function employeeDrafts(snapshot: TeamReadModel): EmployeeDraft[] {
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
    displayName: 'New employee',
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
    recurringSlots: [],
    contractStart: '',
    contractEnd: '',
    weeklyContractHours: 0,
    contractDays: 0,
    annualLeaveEntitlementDays: 0,
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

const nullable = (input: string) => input.trim() || null;

export function teamSavePayload(
  restaurantId: string,
  drafts: EmployeeDraft[],
  role: WorkspaceRole
): TeamSavePayload {
  const employees = asJsonArray(
    drafts
      .map((employee, index) => ({
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
      .filter((employee) => employee.display_name)
  );

  const contacts = asJsonArray(
    drafts.map((employee) => ({
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
    drafts.map((employee) => ({
      restaurant_id: restaurantId,
      employee_id: employee.id,
      badge_enabled: employee.active && employee.badgeEnabled
    }))
  );

  const employeeJobFunctions = asJsonArray(
    drafts.flatMap((employee) =>
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
    drafts
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

  if (role !== 'owner') {
    return {
      employees,
      employeeJobFunctions,
      recurringScheduleSlots,
      contacts,
      access,
      legalProfiles: [],
      contracts: [],
      payrollProfiles: []
    };
  }

  const legalProfiles = asJsonArray(
    drafts.map((employee) => ({
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
    drafts
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

  const payrollProfiles = asJsonArray(
    drafts.map((employee) => ({
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
    access
  };
}

// The four headline Team metrics: active employees, contracts expiring (owner),
// pending absences and payroll readiness (owner). Owner-only cards collapse to a
// restricted summary for managers. Shaped here so the route only renders them.
export function teamMetrics(input: {
  snapshot: TeamReadModel | null;
  drafts: EmployeeDraft[];
  activeEmployees: EmployeeDraft[];
  payrollReady: number;
  owner: boolean;
  today: string;
}): FourMetrics {
  const { snapshot, drafts, activeEmployees, payrollReady, owner, today } = input;
  const employeeName = (id: string) =>
    snapshot?.employees.find((employee) => employee.id === id)?.display_name ?? 'Employee';
  const expiringContracts = (snapshot?.employee_contracts ?? []).filter(
    (contract) =>
      contract.active &&
      contract.is_current &&
      Boolean(contract.contract_end) &&
      contract.contract_end! >= today &&
      contract.contract_end! <= addDays(today, 45)
  );
  const pendingAbsences = (snapshot?.absences ?? []).filter(
    (absence) => absence.status === 'pending'
  );
  return [
    {
      id: 'team-active-employees',
      label: 'Active employees',
      value: String(activeEmployees.length),
      meta: `${drafts.length} total team records`,
      tone: activeEmployees.length ? 'info' : 'warning',
      symbol: '●',
      href: '/team',
      detail: {
        title: 'Active employees',
        subtitle: 'People currently on the team',
        empty: 'No active employees yet.',
        rows: (snapshot?.employees ?? [])
          .filter((employee) => employee.active)
          .map((employee) => ({ id: employee.id, title: employee.display_name })),
        actions: [{ id: 'open-team', label: 'Open Team', href: '/team', tone: 'primary' }]
      }
    },
    {
      id: 'team-expiring-contracts',
      label: 'Contracts expiring',
      value: owner ? String(expiringContracts.length) : 'Restricted',
      meta: owner ? 'Within the next 45 days' : 'Owner-only detail',
      tone: owner && expiringContracts.length ? 'warning' : 'neutral',
      symbol: owner && expiringContracts.length ? '!' : '○',
      href: '/team',
      detail: owner
        ? {
            title: 'Contracts expiring',
            subtitle: 'Current contracts ending within 45 days',
            empty: 'No contracts expiring soon.',
            rows: expiringContracts.map((contract): MetricDetailRow => ({
              id: contract.id,
              title: employeeName(contract.employee_id),
              meta: `Ends ${contract.contract_end}`,
              tone: 'warning'
            })),
            actions: [{ id: 'open-team', label: 'Open Team', href: '/team', tone: 'primary' }]
          }
        : undefined
    },
    {
      id: 'team-pending-absences',
      label: 'Pending absences',
      value: String(pendingAbsences.length),
      meta: pendingAbsences.length ? 'Awaiting a decision' : 'No requests waiting',
      tone: pendingAbsences.length ? 'warning' : 'success',
      symbol: pendingAbsences.length ? '!' : '✓',
      href: '/team',
      detail: {
        title: 'Pending absences',
        subtitle: 'Leave requests awaiting a decision',
        empty: 'No requests waiting.',
        rows: pendingAbsences.map((absence): MetricDetailRow => ({
          id: absence.id,
          title: employeeName(absence.employee_id),
          meta: `${absence.start_date} → ${absence.end_date}`,
          value: absence.service_key ?? 'Full day',
          tone: 'warning'
        })),
        actions: [{ id: 'open-team', label: 'Open Team', href: '/team', tone: 'primary' }]
      }
    },
    {
      id: 'team-payroll-ready',
      label: 'Payroll ready',
      value: owner ? `${payrollReady}/${activeEmployees.length}` : 'Restricted',
      meta: owner ? 'Matricule and national number set' : 'Owner-only detail',
      tone:
        owner && activeEmployees.length && payrollReady === activeEmployees.length
          ? 'success'
          : owner
            ? 'warning'
            : 'neutral',
      symbol: owner && payrollReady === activeEmployees.length ? '✓' : '○',
      href: '/team',
      detail: owner
        ? {
            title: 'Payroll readiness',
            subtitle: 'Matricule and national number per active employee',
            empty: 'No active employees yet.',
            rows: activeEmployees.map((employee): MetricDetailRow => {
              const payroll = snapshot?.employee_payroll_profiles.find(
                (profile) => profile.employee_id === employee.id
              );
              const legal = snapshot?.employee_legal_profiles.find(
                (profile) => profile.employee_id === employee.id
              );
              const ready = Boolean(payroll?.payroll_employee_id && legal?.national_registry_number);
              return {
                id: employee.id,
                title: employeeName(employee.id),
                value: ready ? 'Ready' : 'Incomplete',
                tone: ready ? 'success' : 'warning'
              };
            }),
            actions: [{ id: 'open-team', label: 'Open Team', href: '/team', tone: 'primary' }]
          }
        : undefined
    }
  ];
}

// Team readiness checklist for the Readiness tab. Pure shaping; tab navigation
// is delegated back to the route through a single onSelectTab callback so the
// model stays free of view state.
export function teamSetupSteps(input: {
  owner: boolean;
  activeEmployees: EmployeeDraft[];
  payrollReady: number;
  onSelect: () => void;
}) {
  const { owner, activeEmployees, payrollReady, onSelect } = input;
  return [
    {
      label: 'Active employees',
      detail: activeEmployees.length ? `${activeEmployees.length} active` : 'Add the first employee',
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
      detail: 'Invitation-owned authentication state',
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
    {
      label: 'Employment contracts',
      detail: owner ? 'Owner employment records' : 'Owner-managed',
      complete:
        !owner ||
        activeEmployees.every(
          (employee) => employee.contractTypeId && employee.contractStart
        ),
      href: '#staff-grid',
      onselect: onSelect
    },
    {
      label: 'Payroll readiness',
      detail: owner ? `${payrollReady}/${activeEmployees.length} ready` : 'Owner-managed',
      complete:
        !owner ||
        (activeEmployees.length > 0 && payrollReady === activeEmployees.length),
      href: '#staff-grid',
      onselect: onSelect
    }
  ];
}
