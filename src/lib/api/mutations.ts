import { supabase } from '$lib/supabase/client';
import { PUBLIC_SUPABASE_ANON_KEY, PUBLIC_SUPABASE_URL } from '$env/static/public';
import type { Database, Json } from '$lib/supabase/database.types';
import { apiErrorMessage, toApiError } from './error';
import { asJson } from './json';
import { parseBadgePolicy, type BadgePolicy } from '$lib/badge/badge-policy';

type JsonObject = { [key: string]: Json | undefined };
type OperationalEnums = Database['public']['Enums'];

function object(value: unknown): JsonObject {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as JsonObject)
    : {};
}

type MutationAck = {
  ok: true;
  restaurantId: string;
  workspaceRevision?: number;
  entityId?: string;
  eventId?: string;
  fromStatus?: string | null;
  toStatus?: string | null;
};

function mutationAck(value: Json): MutationAck {
  const result = object(value);
  if (result.ok !== true || typeof result.restaurant_id !== 'string') {
    throw new TypeError('The mutation response is missing its acknowledgement.');
  }
  return {
    ok: true,
    restaurantId: result.restaurant_id,
    workspaceRevision:
      typeof result.workspace_revision === 'number' &&
      Number.isSafeInteger(result.workspace_revision)
        ? result.workspace_revision
        : undefined,
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

type PlannedShiftInput = {
  employee_id: string;
  weekday: number;
  service_key: string;
  area_id: string | null;
  job_function_id: string | null;
  starts_at: string | null;
  ends_at: string | null;
  source: OperationalEnums['planned_shift_source'];
};

type WeeklyNoteInput = {
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

type ActualsAction =
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

type AbsenceAction =
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

type WorkPatternExceptionAction =
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
  expectedRevision: number,
  payload: TeamSavePayload
): Promise<MutationAck> {
  const data = await rpcJson('save_team_workspace_v2', {
    p_restaurant_id: restaurantId,
    p_expected_revision: expectedRevision,
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
  services: Json[];
  jobFunctions: Json[];
  areas: Json[];
  openingHours: Json[];
  areaServiceDefaults: Json[];
  coverageRequirements: Json[];
};

export async function saveRestaurant(
  restaurantId: string,
  expectedRevision: number,
  payload: RestaurantSavePayload
): Promise<MutationAck> {
  const data = await rpcJson('save_restaurant_model_v3', {
    p_restaurant_id: restaurantId,
    p_expected_revision: expectedRevision,
    p_restaurant: payload.restaurant,
    p_settings: payload.settings,
    p_services: payload.services,
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

type OwnerOnboardingDraft = {
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

type OwnerWorkspaceSetup = {
  ownerFirstName: string;
  ownerLastName: string;
  ownerEmail: string;
  restaurantName: string;
  city: string;
  services: Json[];
  openingHours: Json[];
  areas: Json[];
  jobFunctions: Json[];
  coverage: Json[];
  employees: Json[];
};

export async function setupOwnerWorkspace(input: OwnerWorkspaceSetup): Promise<Json> {
  return rpcJson('setup_owner_workspace_v2', {
    p_owner_first_name: input.ownerFirstName,
    p_owner_last_name: input.ownerLastName,
    p_owner_email: input.ownerEmail,
    p_restaurant_name: input.restaurantName,
    p_city: input.city,
    p_services: input.services,
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

export async function setBadgePolicy(
  restaurantId: string,
  policy: Pick<
    BadgePolicy,
    | 'photoClockInRequired'
    | 'photoClockOutRequired'
    | 'locationCaptureEnabled'
    | 'employeeMobileBadgingEnabled'
  >
): Promise<BadgePolicy> {
  const data = object(
    await rpcJson('set_badge_policy', {
      p_restaurant_id: restaurantId,
      p_photo_clock_in_required: policy.photoClockInRequired,
      p_photo_clock_out_required: policy.photoClockOutRequired,
      p_location_capture_enabled: policy.locationCaptureEnabled,
      p_employee_mobile_badging_enabled: policy.employeeMobileBadgingEnabled
    })
  );
  return parseBadgePolicy(data.policy);
}
