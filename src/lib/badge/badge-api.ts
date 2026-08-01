import { PUBLIC_SUPABASE_ANON_KEY, PUBLIC_SUPABASE_URL } from '$env/static/public';
import { supabase } from '$lib/supabase/client';
import { serviceLabel, type ServiceKey } from '$lib/calendar/date';
import type { BadgeLocation } from './badge-policy';

type JsonRecord = Record<string, unknown>;

export async function authenticatedBadgeRpc(
  name: string,
  payload: JsonRecord
): Promise<JsonRecord> {
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
  const result = (await response.json().catch(() => ({}))) as JsonRecord;
  if (!response.ok) throw new Error(String(result.message ?? result.error ?? 'Badge request failed.'));
  return result;
}

export type BadgeRosterEmployee = {
  employeeId: string;
  displayName: string;
  clockedIn: boolean;
  serviceKey?: ServiceKey;
  lastAction?: 'in' | 'out';
  lastLocalTime?: string;
};

// The badge terminal UI runs against this restaurant-agnostic surface. Its
// implementation is the signed-out paired station, never a manager session.
export type BadgeTerminalApi = {
  listRoster: () => Promise<BadgeRosterEmployee[]>;
  verifyPin: (employeeId: string, pin: string) => Promise<BadgeVerification>;
  recordBadge: (input: {
    employeeId: string;
    token: string;
    photoUrl?: string;
    photoStatus?: string;
    location?: BadgeLocation;
  }) => Promise<BadgeResult>;
  // Proof remains private; the implementation authenticates either the user
  // session or the paired station challenge at the Edge boundary.
  uploadProof?: (input: { employeeId: string; token: string; file: File }) => Promise<string>;
};
export type BadgeVerification = { token: string; expiresAt: string };
export type BadgeResult = {
  action: 'in' | 'out';
  localTime: string;
  timezone: string;
  serviceKey: ServiceKey;
  serviceName: string;
  resumed: boolean;
  breakMinutesAdded: number;
  totalBreakMinutes: number;
};

export function parseBadgeRoster(result: JsonRecord): BadgeRosterEmployee[] {
  const employees = Array.isArray(result.employees) ? result.employees : [];
  return employees.flatMap((item) => {
    if (!item || typeof item !== 'object') return [];
    const row = item as JsonRecord;
    const employeeId = String(row.employee_id ?? '');
    const displayName = String(row.display_name ?? '');
    const serviceKey = typeof row.service_key === 'string' && row.service_key
      ? row.service_key
      : undefined;
    const lastAction = row.last_action === 'in' ? 'in' : row.last_action === 'out' ? 'out' : undefined;
    return employeeId && displayName
      ? [{
          employeeId,
          displayName,
          clockedIn: row.clocked_in === true,
          serviceKey,
          lastAction,
          lastLocalTime: row.last_local_time ? String(row.last_local_time) : undefined
        }]
      : [];
  });
}

export function parseBadgeResult(result: JsonRecord): BadgeResult {
  if (result.ok !== true) throw new Error(String(result.message ?? 'Badge entry failed.'));
  return {
    action: result.action === 'out' ? 'out' : 'in',
    localTime: String(result.local_time ?? ''),
    timezone: String(result.timezone ?? ''),
    serviceKey: String(result.service_key ?? ''),
    serviceName: String(result.service_name ?? serviceLabel(String(result.service_key ?? ''))),
    resumed: result.resumed === true,
    breakMinutesAdded: Math.max(0, Number(result.break_minutes_added ?? 0)),
    totalBreakMinutes: Math.max(0, Number(result.total_break_minutes ?? 0))
  };
}

export async function uploadBadgeProof(input: {
  restaurantId: string;
  employeeId: string;
  token: string;
  file: File;
  stationToken?: string;
}): Promise<string> {
  const accessToken = input.stationToken
    ? PUBLIC_SUPABASE_ANON_KEY
    : (await supabase.auth.getSession()).data.session?.access_token;
  if (!accessToken) throw new Error('An authenticated session or paired station is required.');
  const body = new FormData();
  body.set('restaurant_id', input.restaurantId);
  body.set('employee_id', input.employeeId);
  body.set('badge_token', input.token);
  body.set('proof', input.file);
  if (input.stationToken) body.set('station_token', input.stationToken);
  const response = await fetch(`${PUBLIC_SUPABASE_URL}/functions/v1/upload-badge-proof`, {
    method: 'POST',
    headers: {
      apikey: PUBLIC_SUPABASE_ANON_KEY,
      Authorization: `Bearer ${accessToken}`
    },
    body
  });
  const result = (await response.json().catch(() => ({}))) as JsonRecord;
  if (!response.ok || result.ok !== true) {
    throw new Error(String(result.error ?? 'Badge proof upload failed.'));
  }
  const path = String(result.path ?? '');
  if (!path) throw new Error('Badge proof path is missing.');
  return path;
}
