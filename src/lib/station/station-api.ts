import { PUBLIC_SUPABASE_ANON_KEY, PUBLIC_SUPABASE_URL } from '$env/static/public';
import type {
  BadgeRosterEmployee,
  BadgeResult,
  BadgeTerminalApi,
  BadgeVerification
} from '$lib/badge/badge-api';
import { parseBadgeResult, parseBadgeRoster, uploadBadgeProof } from '$lib/badge/badge-api';
import { parseBadgePolicy, type BadgeLocation, type BadgePolicy } from '$lib/badge/badge-policy';

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

async function listStationRoster(token: string): Promise<BadgeRosterEmployee[]> {
  return parseBadgeRoster(await stationRpc('list_badge_roster_station', { p_token: token }));
}

type StationContext = {
  restaurantId: string;
  restaurantName: string;
  logoPath: string;
  timezone: string;
  roster: BadgeRosterEmployee[];
  policy: BadgePolicy;
};

// One call that both validates the token (throws if unpaired/revoked) and
// returns the header identity the terminal needs.
export async function getStationContext(token: string): Promise<StationContext> {
  const result = await stationRpc('list_badge_roster_station', { p_token: token });
  return {
    restaurantId: String(result.restaurant_id ?? ''),
    restaurantName: String(result.restaurant_name ?? ''),
    logoPath: String(result.logo_path ?? ''),
    timezone: String(result.timezone ?? 'Europe/Brussels'),
    roster: parseBadgeRoster(result),
    policy: parseBadgePolicy(result.badge_policy)
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
  photoUrl?: string;
  photoStatus?: string;
  location?: BadgeLocation;
}): Promise<BadgeResult> {
  const result = await stationRpc('record_badge_entry_station_v2', {
    p_token: input.token,
    p_employee_id: input.employeeId,
    p_badge_token: input.badgeToken,
    p_photo_url: input.photoUrl ?? null,
    p_photo_status: input.photoStatus ?? 'not_required',
    p_latitude: input.location?.latitude ?? null,
    p_longitude: input.location?.longitude ?? null,
    p_accuracy_meters: input.location?.accuracyMeters ?? null
  });
  return parseBadgeResult(result);
}

export function createStationBadgeApi(token: string, restaurantId: string): BadgeTerminalApi {
  return {
    listRoster: () => listStationRoster(token),
    verifyPin: (employeeId, pin) => verifyStationPin(token, employeeId, pin),
    recordBadge: (input) =>
      recordStationBadge({
        token,
        employeeId: input.employeeId,
        badgeToken: input.token,
        photoUrl: input.photoUrl,
        photoStatus: input.photoStatus,
        location: input.location
      }),
    uploadProof: (input) =>
      uploadBadgeProof({ restaurantId, stationToken: token, ...input })
  };
}
