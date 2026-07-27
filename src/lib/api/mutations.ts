import { supabase } from '$lib/supabase/client';
import { PUBLIC_SUPABASE_ANON_KEY, PUBLIC_SUPABASE_URL } from '$env/static/public';
import type { Database, Json } from '$lib/supabase/database.types';
import { apiErrorMessage, toApiError } from './error';
import { asJson } from './json';

type JsonObject = { [key: string]: Json | undefined };
type OperationalEnums = Database['public']['Enums'];

function object(value: unknown): JsonObject {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as JsonObject)
    : {};
}

export type MutationAck = {
  ok: true;
  restaurantId: string;
  entityId?: string;
  eventId?: string;
  fromStatus?: string | null;
  toStatus?: string | null;
};

export type PayrollExportRun = {
  id: string;
  restaurantId: string;
  periodStart: string;
  periodEnd: string;
  filename: string;
  rowCount: number;
  totalNetMinutes: number;
  payloadSha256: string;
  headers: string[];
  rows: Array<Array<string | number | boolean | null>>;
  createdAt: string;
};

export type PayrollExportPreview = {
  approved: boolean;
  filename: string;
  headers: string[];
  rows: Array<Array<string | number | boolean | null>>;
  rowCount: number;
  totalNetMinutes: number;
};

function mutationAck(value: Json): MutationAck {
  const result = object(value);
  if (result.ok !== true || typeof result.restaurant_id !== 'string') {
    throw new TypeError('The mutation response is missing its acknowledgement.');
  }
  return {
    ok: true,
    restaurantId: result.restaurant_id,
    entityId:
      typeof result.absence_id === 'string'
        ? result.absence_id
        : typeof result.entity_id === 'string'
          ? result.entity_id
          : undefined,
    eventId: typeof result.event_id === 'string' ? result.event_id : undefined,
    fromStatus: typeof result.from_status === 'string' ? result.from_status : null,
    toStatus: typeof result.to_status === 'string' ? result.to_status : null
  };
}

async function rpcJson(name: string, payload: JsonObject): Promise<Json> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error('Authenticated session required.');
  const response = await fetch(`${PUBLIC_SUPABASE_URL}/rest/v1/rpc/${name}`, {
    method: 'POST',
    headers: {
      apikey: PUBLIC_SUPABASE_ANON_KEY,
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  });
  const result = (await response.json().catch(() => ({}))) as Json;
  if (!response.ok) {
    throw new Error(apiErrorMessage(result, `${name} failed.`));
  }
  return result;
}

function payrollExportRun(value: Json): PayrollExportRun {
  const result = object(value);
  const payload = object(result.payload);
  const headers = Array.isArray(payload.headers)
    ? payload.headers.map((header) => String(header))
    : [];
  const rows = Array.isArray(payload.rows)
    ? payload.rows.map((row) =>
        Array.isArray(row)
          ? row.map((cell) =>
              typeof cell === 'string' ||
              typeof cell === 'number' ||
              typeof cell === 'boolean' ||
              cell === null
                ? cell
                : String(cell ?? '')
            )
          : []
      )
    : [];
  const id = String(result.run_id ?? result.id ?? '');
  const restaurantId = String(result.restaurant_id ?? '');
  if (!id || !restaurantId || !headers.length) {
    throw new TypeError('The payroll export response is incomplete.');
  }
  return {
    id,
    restaurantId,
    periodStart: String(result.period_start ?? payload.period_start ?? ''),
    periodEnd: String(result.period_end ?? payload.period_end ?? ''),
    filename: String(result.filename ?? ''),
    rowCount: Number(result.row_count ?? rows.length),
    totalNetMinutes: Number(result.total_net_minutes ?? 0),
    payloadSha256: String(result.payload_sha256 ?? ''),
    headers,
    rows,
    createdAt: String(result.created_at ?? '')
  };
}

export async function createPayrollExportRun(input: {
  restaurantId: string;
  periodStart: string;
  periodEnd: string;
  columns?: string[];
}): Promise<PayrollExportRun> {
  const { data, error } = await supabase.rpc('create_payroll_export_run', {
    p_restaurant_id: input.restaurantId,
    p_period_start: input.periodStart,
    p_period_end: input.periodEnd,
    p_columns: input.columns ?? null
  });
  if (error) throw toApiError(error, 'Payroll export could not be created.');
  return payrollExportRun(data);
}

export async function setPayrollExportColumns(
  restaurantId: string,
  columns: string[]
): Promise<void> {
  const { error } = await supabase.rpc('set_payroll_export_columns', {
    p_restaurant_id: restaurantId,
    p_columns: columns
  });
  if (error) throw toApiError(error, 'Payroll export columns could not be saved.');
}

export async function getPayrollExportRun(
  restaurantId: string,
  runId: string
): Promise<PayrollExportRun> {
  const { data, error } = await supabase.rpc('get_payroll_export_run', {
    p_restaurant_id: restaurantId,
    p_run_id: runId
  });
  if (error) throw toApiError(error, 'Payroll export could not be opened.');
  return payrollExportRun(data);
}

// Draft payroll export — reads the same server projection as the official run
// but records no lineage. Used when the chosen period is not fully approved.
export async function previewPayrollExport(input: {
  restaurantId: string;
  periodStart: string;
  periodEnd: string;
  columns?: string[];
}): Promise<PayrollExportPreview> {
  const { data, error } = await supabase.rpc('preview_payroll_export', {
    p_restaurant_id: input.restaurantId,
    p_period_start: input.periodStart,
    p_period_end: input.periodEnd,
    p_columns: input.columns ?? null
  });
  if (error) throw toApiError(error, 'Payroll export could not be prepared.');
  const result = object(data);
  const headers = Array.isArray(result.headers) ? result.headers.map((header) => String(header)) : [];
  const rows = Array.isArray(result.rows)
    ? result.rows.map((row) =>
        Array.isArray(row)
          ? row.map((cell) =>
              typeof cell === 'string' || typeof cell === 'number' || typeof cell === 'boolean' || cell === null
                ? cell
                : String(cell ?? '')
            )
          : []
      )
    : [];
  const approved = result.approved === true;
  const suffix = approved ? 'APPROVED' : 'DRAFT';
  return {
    approved,
    filename: `payroll-${input.periodStart}-${input.periodEnd}-${suffix}.csv`,
    headers,
    rows,
    rowCount: Number(result.row_count ?? rows.length),
    totalNetMinutes: Number(result.total_net_minutes ?? 0)
  };
}

export type PlannedShiftInput = {
  employee_id: string;
  weekday: number;
  service_key: string;
  area_id: string | null;
  job_function_id: string | null;
  starts_at: string | null;
  ends_at: string | null;
  source: OperationalEnums['planned_shift_source'];
};

export type WeeklyNoteInput = {
  weekday: number;
  service_key: string;
  note: string;
};

export async function savePlanning(input: {
  restaurantId: string;
  weekStart: string;
  status: OperationalEnums['planning_status'];
  shifts: PlannedShiftInput[];
  notes?: WeeklyNoteInput[];
  expectedRevision?: number | null;
  reason?: string;
  allowCoverageGaps?: boolean;
  allowConflicts?: boolean;
}): Promise<MutationAck> {
  const data = await rpcJson('save_manager_planning', {
    p_restaurant_id: input.restaurantId,
    p_week_start: input.weekStart,
    p_planning_status: input.status,
    p_planned_shifts: asJson(input.shifts),
    p_weekly_notes: asJson(input.notes ?? []),
    p_expected_revision: input.expectedRevision ?? undefined,
    p_reason: input.reason?.trim() || undefined,
    p_allow_coverage_gaps: input.allowCoverageGaps || undefined,
    p_allow_conflicts: input.allowConflicts || undefined
  });
  return mutationAck(data);
}

export async function discardPlanningDraft(input: {
  restaurantId: string;
  weekStart: string;
  expectedRevision: number;
}): Promise<MutationAck> {
  const data = await rpcJson('discard_manager_planning_draft', {
    p_restaurant_id: input.restaurantId,
    p_week_start: input.weekStart,
    p_expected_revision: input.expectedRevision
  });
  return mutationAck(data);
}

export type ActualsAction =
  | 'manual_entry'
  | 'adjust_entry'
  | 'cancel_entry'
  | 'approve_week'
  | 'reopen_week';

export async function saveActuals(input: {
  restaurantId: string;
  action: ActualsAction;
  payload: JsonObject;
}): Promise<MutationAck> {
  const data = await rpcJson('save_actuals_lifecycle', {
    p_restaurant_id: input.restaurantId,
    p_action: input.action,
    p_payload: input.payload
  });
  return mutationAck(data);
}

export type AbsenceAction =
  | 'create_by_employee'
  | 'create_by_manager'
  | 'approve'
  | 'reject'
  | 'cancel_by_employee'
  | 'cancel_by_manager'
  | 'cancel_for_planning'
  | 'update_manager_comment';

export async function saveAbsence(input: {
  restaurantId: string;
  employeeId: string;
  absenceId?: string | null;
  action: AbsenceAction;
  payload?: JsonObject;
}): Promise<MutationAck> {
  const { data, error } = await supabase.rpc('save_absence_lifecycle', {
    p_restaurant_id: input.restaurantId,
    p_employee_id: input.employeeId,
    p_absence_id: input.absenceId ?? undefined,
    p_action: input.action,
    p_payload: input.payload ?? {}
  });
  if (error) throw toApiError(error, 'Time off could not be saved.');
  return mutationAck(data);
}

export type WorkPatternExceptionAction =
  | 'create_by_employee'
  | 'create_by_manager'
  | 'approve'
  | 'reject'
  | 'cancel_by_employee'
  | 'cancel_by_manager'
  | 'cancel_for_planning'
  | 'update_manager_comment';

export async function saveWorkPatternException(input: {
  restaurantId: string;
  employeeId: string;
  workPatternExceptionId?: string | null;
  action: WorkPatternExceptionAction;
  payload?: JsonObject;
}): Promise<MutationAck> {
  const data = await rpcJson('save_work_pattern_exception_lifecycle', {
    p_restaurant_id: input.restaurantId,
    p_employee_id: input.employeeId,
    p_work_pattern_exception_id: input.workPatternExceptionId ?? undefined,
    p_action: input.action,
    p_payload: input.payload ?? {}
  });
  return mutationAck(data);
}

export async function saveEmployeeAvailability(input: {
  restaurantId: string;
  employeeId: string;
  availability: Array<{
    date: string;
    service_key: string;
    availability_state: '' | OperationalEnums['service_availability_state'];
  }>;
}): Promise<MutationAck> {
  const data = await rpcJson('save_employee_availability', {
    p_restaurant_id: input.restaurantId,
    p_employee_id: input.employeeId,
    p_availability: asJson(input.availability)
  });
  return mutationAck(data);
}

export type TeamSavePayload = {
  employees: Json[];
  employeeJobFunctions: Json[];
  recurringScheduleSlots: Json[];
  contacts: Json[];
  legalProfiles: Json[];
  contracts: Json[];
  payrollProfiles: Json[];
  access: Json[];
  employmentTerms: Json[];
};

export async function saveTeam(
  restaurantId: string,
  payload: TeamSavePayload
): Promise<MutationAck> {
  const data = await rpcJson('save_team_workspace', {
    p_restaurant_id: restaurantId,
    p_employees: payload.employees,
    p_contacts: payload.contacts,
    p_legal_profiles: payload.legalProfiles,
    p_contracts: payload.contracts,
    p_payroll_profiles: payload.payrollProfiles,
    p_access: payload.access,
    p_employee_job_functions: payload.employeeJobFunctions,
    p_recurring_schedule_slots: payload.recurringScheduleSlots,
    p_employment_terms: payload.employmentTerms
  });
  return mutationAck(data);
}

export type RestaurantSavePayload = {
  restaurant: JsonObject;
  settings: JsonObject;
  jobFunctions: Json[];
  areas: Json[];
  openingHours: Json[];
  areaServiceDefaults: Json[];
  coverageRequirements: Json[];
};

export async function saveRestaurant(
  restaurantId: string,
  payload: RestaurantSavePayload
): Promise<MutationAck> {
  const data = await rpcJson('save_restaurant_model', {
    p_restaurant_id: restaurantId,
    p_restaurant: payload.restaurant,
    p_settings: payload.settings,
    p_job_functions: payload.jobFunctions,
    p_areas: payload.areas,
    p_opening_hours: payload.openingHours,
    p_area_service_defaults: payload.areaServiceDefaults,
    p_coverage_requirements: payload.coverageRequirements
  });
  return mutationAck(data);
}

/** Change the signed-in user's badge PIN. App authentication remains email/password. */
export async function setOwnBadgePin(newPin: string, restaurantId?: string): Promise<void> {
  const { error } = await supabase.rpc('set_own_pin', {
    p_new_pin: newPin,
    p_restaurant_id: restaurantId
  });
  if (error) throw toApiError(error, 'Badge PIN could not be changed.');
}

export async function inviteEmployee(input: {
  restaurantId: string;
  employeeId: string;
  email: string;
  role: 'manager' | 'employee';
}): Promise<void> {
  const { data, error } = await supabase.functions.invoke('send-employee-invitation', {
    body: {
      restaurant_id: input.restaurantId,
      employee_id: input.employeeId,
      email: input.email,
      role: input.role
    }
  });
  if (error) throw toApiError(error, 'The invitation could not be sent.');
  if (data?.error) throw new Error(String(data.error));
}

export async function revokeEmployeeInvitation(
  restaurantId: string,
  employeeId: string,
  reason?: string
): Promise<MutationAck> {
  const data = await rpcJson('revoke_employee_invitation', {
    p_restaurant_id: restaurantId,
    p_employee_id: employeeId,
    p_reason: reason?.trim() || undefined
  });
  return mutationAck(data);
}

export async function setEmployeeAccessState(
  restaurantId: string,
  employeeId: string,
  action: 'disable' | 'restore'
): Promise<MutationAck> {
  const data = await rpcJson('set_employee_access_state', {
    p_restaurant_id: restaurantId,
    p_employee_id: employeeId,
    p_action: action
  });
  return mutationAck(data);
}

export type EmployeeInvitationContext = {
  restaurantName: string;
  employeeName: string;
  role: 'employee' | 'manager';
  expiresAt: string;
};

export async function getEmployeeInvitationContext(
  restaurantId: string,
  invitationToken: string
): Promise<EmployeeInvitationContext> {
  const data = object(
    await rpcJson('get_employee_invitation_context', {
      p_restaurant_id: restaurantId,
      p_invitation_token: invitationToken
    })
  );
  const role = data.role === 'manager' ? 'manager' : 'employee';
  return {
    restaurantName: String(data.restaurant_name ?? ''),
    employeeName: String(data.employee_name ?? ''),
    role,
    expiresAt: String(data.expires_at ?? '')
  };
}

export async function acceptEmployeeInvite(
  restaurantId: string,
  invitationToken: string,
  pin: string
): Promise<void> {
  const data = await rpcJson('accept_employee_invite', {
    p_restaurant_id: restaurantId,
    p_invitation_token: invitationToken,
    p_pin: pin
  });
  const result = object(data);
  if (result.ok === false) throw new Error(String(result.error ?? 'Invitation could not be accepted.'));
}

export async function getBadgeProofUrl(input: {
  restaurantId: string;
  timeEntryId: string;
  edge?: 'clock_in' | 'clock_out';
}): Promise<string> {
  const { data, error } = await supabase.functions.invoke('get-badge-proof', {
    body: {
      restaurant_id: input.restaurantId,
      time_entry_id: input.timeEntryId,
      edge: input.edge ?? 'clock_out'
    }
  });
  if (error) throw toApiError(error, 'Badge proof could not be opened.');
  if (data?.error) throw new Error(String(data.error));
  const url = String(data?.url ?? '');
  if (!url) throw new Error('Badge proof could not be opened.');
  return url;
}

export type OwnerOnboardingDraft = {
  step: number;
  draft: JsonObject;
  updatedAt: string;
};

export async function getOwnerOnboardingDraft(): Promise<OwnerOnboardingDraft | null> {
  const data = await rpcJson('get_owner_onboarding_draft', {});
  const result = object(data);
  if (!Object.keys(result).length) return null;
  return {
    step: Number(result.step ?? 0),
    draft: object(result.draft),
    updatedAt: String(result.updated_at ?? '')
  };
}

export async function saveOwnerOnboardingDraft(
  step: number,
  draft: JsonObject
): Promise<void> {
  await rpcJson('save_owner_onboarding_draft', {
    p_step: step,
    p_draft: draft
  });
}

export async function clearOwnerOnboardingDraft(): Promise<void> {
  await rpcJson('clear_owner_onboarding_draft', {});
}

export async function updateOwnProfile(firstName: string, lastName: string): Promise<void> {
  await rpcJson('update_own_profile', {
    p_first_name: firstName,
    p_last_name: lastName
  });
}

export type OwnerWorkspaceSetup = {
  ownerFirstName: string;
  ownerLastName: string;
  ownerEmail: string;
  restaurantName: string;
  city: string;
  openingHours: Json[];
  areas: Json[];
  jobFunctions: Json[];
  coverage: Json[];
  employees: Json[];
};

export async function setupOwnerWorkspace(input: OwnerWorkspaceSetup): Promise<Json> {
  return rpcJson('setup_owner_workspace', {
    p_owner_first_name: input.ownerFirstName,
    p_owner_last_name: input.ownerLastName,
    p_owner_email: input.ownerEmail,
    p_restaurant_name: input.restaurantName,
    p_city: input.city,
    p_opening_hours: input.openingHours,
    p_areas: input.areas,
    p_job_functions: input.jobFunctions,
    p_coverage: input.coverage,
    p_employees: input.employees
  });
}

// Paired badge devices (station credentials). ------------------------------
export type RestaurantStation = {
  id: string;
  label: string;
  createdAt: string;
  lastUsedAt: string | null;
};

export async function createRestaurantStation(
  restaurantId: string,
  label: string
): Promise<{ stationId: string; token: string }> {
  const data = object(
    await rpcJson('create_restaurant_station', { p_restaurant_id: restaurantId, p_label: label })
  );
  return { stationId: String(data.station_id ?? ''), token: String(data.token ?? '') };
}

export async function revokeRestaurantStation(
  restaurantId: string,
  stationId: string
): Promise<void> {
  await rpcJson('revoke_restaurant_station', {
    p_restaurant_id: restaurantId,
    p_station_id: stationId
  });
}

export async function listRestaurantStations(restaurantId: string): Promise<RestaurantStation[]> {
  const data = object(await rpcJson('list_restaurant_stations', { p_restaurant_id: restaurantId }));
  const rows = Array.isArray(data.stations) ? data.stations : [];
  return rows.flatMap((row) => {
    if (!row || typeof row !== 'object') return [];
    const record = row as Record<string, unknown>;
    return [
      {
        id: String(record.id),
        label: String(record.label ?? ''),
        createdAt: String(record.created_at ?? ''),
        lastUsedAt: record.last_used_at ? String(record.last_used_at) : null
      }
    ];
  });
}
