import { supabase } from '$lib/supabase/client';
import { toApiError } from '$lib/api/error';

export type PlatformSupportSession = {
  id: string;
  targetProfileId: string;
  restaurantId: string;
  restaurantName: string;
  role: 'owner' | 'manager' | 'employee';
  employeeId: string | null;
  displayName: string;
  email: string;
  startedAt: string;
  expiresAt: string;
};

type UnknownRecord = Record<string, unknown>;

function parseSupportSession(value: unknown): PlatformSupportSession | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const row = value as UnknownRecord;
  const role = String(row.role ?? '');
  if (role !== 'owner' && role !== 'manager' && role !== 'employee') return null;

  const id = String(row.id ?? '');
  const targetProfileId = String(row.target_profile_id ?? '');
  const restaurantId = String(row.restaurant_id ?? '');
  if (!id || !targetProfileId || !restaurantId) return null;

  return {
    id,
    targetProfileId,
    restaurantId,
    restaurantName: String(row.restaurant_name ?? ''),
    role,
    employeeId: typeof row.employee_id === 'string' ? row.employee_id : null,
    displayName: String(row.display_name ?? row.email ?? 'User'),
    email: String(row.email ?? ''),
    startedAt: String(row.started_at ?? ''),
    expiresAt: String(row.expires_at ?? '')
  };
}

export async function getActivePlatformSupportSession(): Promise<PlatformSupportSession | null> {
  const { data, error } = await supabase.rpc('get_active_platform_support_session');
  if (error) throw toApiError(error, 'Admin support status could not be loaded.');
  return parseSupportSession(data);
}

export async function startPlatformSupportSession(
  restaurantId: string,
  targetProfileId: string
): Promise<PlatformSupportSession> {
  const { data, error } = await supabase.rpc('start_platform_support_session', {
    p_restaurant_id: restaurantId,
    p_target_profile_id: targetProfileId
  });
  if (error) throw toApiError(error, 'The support session could not be started.');
  const session = parseSupportSession(data);
  if (!session) throw new TypeError('The support session response is incomplete.');
  return session;
}

export async function endPlatformSupportSession(): Promise<void> {
  const { error } = await supabase.rpc('end_platform_support_session');
  if (error) throw toApiError(error, 'The support session could not be closed.');
}
