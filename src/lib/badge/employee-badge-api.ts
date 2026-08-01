import type { ServiceKey } from '$lib/calendar/date';
import {
  authenticatedBadgeRpc,
  parseBadgeResult,
  uploadBadgeProof,
  type BadgeResult
} from './badge-api';
import {
  parseBadgePolicy,
  type BadgeLocation,
  type BadgePolicy
} from './badge-policy';

export type OwnBadgeContext = {
  restaurantId: string;
  restaurantName: string;
  logoPath: string;
  timezone: string;
  employeeId: string;
  displayName: string;
  mobileBadgingEnabled: boolean;
  clockedIn: boolean;
  serviceKey?: ServiceKey;
  lastAction?: 'in' | 'out';
  lastLocalTime?: string;
  policy: BadgePolicy;
};

type JsonRecord = Record<string, unknown>;

export async function getOwnBadgeContext(restaurantId: string): Promise<OwnBadgeContext> {
  const result = await authenticatedBadgeRpc('get_own_badge_context', {
    p_restaurant_id: restaurantId
  });
  const employeeId = String(result.employee_id ?? '');
  if (!employeeId) throw new Error('Your employee badge profile was not found.');
  return {
    restaurantId: String(result.restaurant_id ?? restaurantId),
    restaurantName: String(result.restaurant_name ?? ''),
    logoPath: String(result.logo_path ?? ''),
    timezone: String(result.timezone ?? 'Europe/Brussels'),
    employeeId,
    displayName: String(result.display_name ?? ''),
    mobileBadgingEnabled: result.mobile_badging_enabled === true,
    clockedIn: result.clocked_in === true,
    serviceKey: typeof result.service_key === 'string' ? result.service_key : undefined,
    lastAction: result.last_action === 'in' ? 'in' : result.last_action === 'out' ? 'out' : undefined,
    lastLocalTime: result.last_local_time ? String(result.last_local_time) : undefined,
    policy: parseBadgePolicy(result.badge_policy)
  };
}

export async function beginOwnBadge(restaurantId: string): Promise<string> {
  const result = await authenticatedBadgeRpc('begin_own_badge', {
    p_restaurant_id: restaurantId
  });
  const token = String(result.badge_token ?? '');
  if (!token) throw new Error('The badge authorization could not be created.');
  return token;
}

export async function uploadOwnBadgeProof(input: {
  context: OwnBadgeContext;
  token: string;
  file: File;
}): Promise<string> {
  return uploadBadgeProof({
    restaurantId: input.context.restaurantId,
    employeeId: input.context.employeeId,
    token: input.token,
    file: input.file
  });
}

export async function recordOwnBadge(input: {
  restaurantId: string;
  token: string;
  photoUrl?: string;
  location?: BadgeLocation;
}): Promise<BadgeResult> {
  const result = await authenticatedBadgeRpc('record_own_badge_entry', {
    p_restaurant_id: input.restaurantId,
    p_badge_token: input.token,
    p_photo_url: input.photoUrl ?? null,
    p_photo_status: input.photoUrl ? 'captured' : 'not_required',
    p_latitude: input.location?.latitude ?? null,
    p_longitude: input.location?.longitude ?? null,
    p_accuracy_meters: input.location?.accuracyMeters ?? null
  });
  return parseBadgeResult(result as JsonRecord);
}
