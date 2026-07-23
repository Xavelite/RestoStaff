import { PUBLIC_SUPABASE_ANON_KEY, PUBLIC_SUPABASE_URL } from '$env/static/public';
import { supabase } from '$lib/supabase/client';

type JsonRecord = Record<string, unknown>;

async function rpc(name: string, payload: JsonRecord): Promise<JsonRecord> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error('Authenticated manager session required.');
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
  serviceKey?: 'lunch' | 'evening';
  lastAction?: 'in' | 'out';
  lastLocalTime?: string;
};

// The badge terminal UI (BadgeTerminal.svelte) runs against this small,
// restaurant-agnostic surface. A manager session and a paired station provide
// two different implementations; the component never knows which.
export type BadgeTerminalApi = {
  listRoster: () => Promise<BadgeRosterEmployee[]>;
  verifyPin: (employeeId: string, pin: string) => Promise<BadgeVerification>;
  recordBadge: (input: {
    employeeId: string;
    token: string;
    photoUrl?: string;
    photoStatus?: string;
  }) => Promise<BadgeResult>;
  // Optional: paired stations skip photo proof (no manager upload session).
  uploadProof?: (input: { employeeId: string; token: string; file: File }) => Promise<string>;
};
export type BadgeVerification = { token: string; expiresAt: string };
export type BadgeResult = {
  action: 'in' | 'out';
  localTime: string;
  timezone: string;
  serviceKey: 'lunch' | 'evening';
  serviceName: string;
  resumed: boolean;
  breakMinutesAdded: number;
  totalBreakMinutes: number;
};

async function listBadgeRoster(restaurantId: string): Promise<BadgeRosterEmployee[]> {
  const result = await rpc('list_badge_roster', { p_restaurant_id: restaurantId });
  const employees = Array.isArray(result.employees) ? result.employees : [];
  return employees.flatMap((item) => {
    if (!item || typeof item !== 'object') return [];
    const row = item as JsonRecord;
    const employeeId = String(row.employee_id ?? '');
    const displayName = String(row.display_name ?? '');
    const serviceKey = row.service_key === 'evening' ? 'evening' : row.service_key === 'lunch' ? 'lunch' : undefined;
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

export async function verifyBadgePin(
  restaurantId: string,
  employeeId: string,
  pin: string
): Promise<BadgeVerification> {
  const result = await rpc('verify_badge_pin', {
    p_restaurant_id: restaurantId,
    p_employee_id: employeeId,
    p_pin: pin
  });
  if (result.ok !== true) throw new Error(String(result.message ?? 'PIN verification failed.'));
  const token = String(result.badge_token ?? '');
  if (!token) throw new Error('The server did not issue a badge authorization token.');
  return { token, expiresAt: String(result.expires_at ?? '') };
}

async function recordBadge(input: {
  restaurantId: string;
  employeeId: string;
  token: string;
  photoUrl?: string;
  photoStatus?: string;
}): Promise<BadgeResult> {
  const result = await rpc('record_badge_entry', {
    p_restaurant_id: input.restaurantId,
    p_employee_id: input.employeeId,
    p_badge_token: input.token,
    p_service_key: null,
    p_photo_url: input.photoUrl ?? null,
    p_photo_status: input.photoStatus ?? 'not_required'
  });
  if (result.ok !== true) throw new Error(String(result.message ?? 'Badge entry failed.'));
  return {
    action: result.action === 'out' ? 'out' : 'in',
    localTime: String(result.local_time ?? ''),
    timezone: String(result.timezone ?? ''),
    serviceKey: result.service_key === 'evening' ? 'evening' : 'lunch',
    serviceName: String(result.service_name ?? (result.service_key === 'evening' ? 'Evening' : 'Lunch')),
    resumed: result.resumed === true,
    breakMinutesAdded: Math.max(0, Number(result.break_minutes_added ?? 0)),
    totalBreakMinutes: Math.max(0, Number(result.total_break_minutes ?? 0))
  };
}

async function uploadBadgeProof(input: {
  restaurantId: string;
  employeeId: string;
  token: string;
  file: File;
}): Promise<string> {
  const { data } = await supabase.auth.getSession();
  const accessToken = data.session?.access_token;
  if (!accessToken) throw new Error('Authenticated manager session required.');
  const body = new FormData();
  body.set('restaurant_id', input.restaurantId);
  body.set('employee_id', input.employeeId);
  body.set('badge_token', input.token);
  body.set('proof', input.file);
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

// Bind the manager (JWT) badge calls to one restaurant for BadgeTerminal.
export function createManagerBadgeApi(restaurantId: string): BadgeTerminalApi {
  return {
    listRoster: () => listBadgeRoster(restaurantId),
    verifyPin: (employeeId, pin) => verifyBadgePin(restaurantId, employeeId, pin),
    recordBadge: (input) => recordBadge({ restaurantId, ...input }),
    uploadProof: (input) => uploadBadgeProof({ restaurantId, ...input })
  };
}
