import { PUBLIC_SUPABASE_ANON_KEY, PUBLIC_SUPABASE_URL } from '$env/static/public';
import type {
  BadgeRosterEmployee,
  BadgeResult,
  BadgeTerminalApi,
  BadgeVerification
} from '$lib/badge/badge-api';

type JsonRecord = Record<string, unknown>;

// A paired station is signed OUT — every call authenticates with the public
// anon key plus its opaque station token, which the server resolves to exactly
// one restaurant. No manager session is ever involved.
async function stationRpc(name: string, payload: JsonRecord): Promise<JsonRecord> {
  const response = await fetch(`${PUBLIC_SUPABASE_URL}/rest/v1/rpc/${name}`, {
    method: 'POST',
    headers: {
      apikey: PUBLIC_SUPABASE_ANON_KEY,
      Authorization: `Bearer ${PUBLIC_SUPABASE_ANON_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  });
  const result = (await response.json().catch(() => ({}))) as JsonRecord;
  if (!response.ok) {
    throw new Error(String(result.message ?? result.error ?? 'Station request failed.'));
  }
  return result;
}

function parseRoster(result: JsonRecord): BadgeRosterEmployee[] {
  const employees = Array.isArray(result.employees) ? result.employees : [];
  return employees.flatMap((item) => {
    if (!item || typeof item !== 'object') return [];
    const row = item as JsonRecord;
    const employeeId = String(row.employee_id ?? '');
    const displayName = String(row.display_name ?? '');
    const serviceKey =
      row.service_key === 'evening' ? 'evening' : row.service_key === 'lunch' ? 'lunch' : undefined;
    const lastAction = row.last_action === 'in' ? 'in' : row.last_action === 'out' ? 'out' : undefined;
    return employeeId && displayName
      ? [
          {
            employeeId,
            displayName,
            clockedIn: row.clocked_in === true,
            serviceKey,
            lastAction,
            lastLocalTime: row.last_local_time ? String(row.last_local_time) : undefined
          }
        ]
      : [];
  });
}

async function listStationRoster(token: string): Promise<BadgeRosterEmployee[]> {
  return parseRoster(await stationRpc('list_badge_roster_station', { p_token: token }));
}

export type StationContext = {
  restaurantName: string;
  logoPath: string;
  timezone: string;
  roster: BadgeRosterEmployee[];
};

// One call that both validates the token (throws if unpaired/revoked) and
// returns the header identity the terminal needs.
export async function getStationContext(token: string): Promise<StationContext> {
  const result = await stationRpc('list_badge_roster_station', { p_token: token });
  return {
    restaurantName: String(result.restaurant_name ?? ''),
    logoPath: String(result.logo_path ?? ''),
    timezone: String(result.timezone ?? 'Europe/Brussels'),
    roster: parseRoster(result)
  };
}

async function verifyStationPin(
  token: string,
  employeeId: string,
  pin: string
): Promise<BadgeVerification> {
  const result = await stationRpc('verify_badge_pin_station', {
    p_token: token,
    p_employee_id: employeeId,
    p_pin: pin
  });
  if (result.ok !== true) throw new Error(String(result.message ?? 'PIN verification failed.'));
  const badgeToken = String(result.badge_token ?? '');
  if (!badgeToken) throw new Error('The server did not issue a badge authorization token.');
  return { token: badgeToken, expiresAt: String(result.expires_at ?? '') };
}

async function recordStationBadge(input: {
  token: string;
  employeeId: string;
  badgeToken: string;
}): Promise<BadgeResult> {
  const result = await stationRpc('record_badge_entry_station', {
    p_token: input.token,
    p_employee_id: input.employeeId,
    p_badge_token: input.badgeToken,
    p_photo_url: null,
    p_photo_status: 'not_required'
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

// Bind a station token to the BadgeTerminal surface. No uploadProof: a station
// has no manager session to authorise a photo upload, so proof is skipped.
export function createStationBadgeApi(token: string): BadgeTerminalApi {
  return {
    listRoster: () => listStationRoster(token),
    verifyPin: (employeeId, pin) => verifyStationPin(token, employeeId, pin),
    recordBadge: (input) =>
      recordStationBadge({ token, employeeId: input.employeeId, badgeToken: input.token })
  };
}
