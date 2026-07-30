import { supabase } from '$lib/supabase/client';
import type { Json } from '$lib/supabase/database.types';
import { toApiError } from '$lib/api/error';

export type PilotAccessStatus = 'not_requested' | 'pending' | 'approved' | 'declined';

export type PilotAccessState = {
  status: PilotAccessStatus;
  requestedAt: string | null;
  reviewedAt: string | null;
  canCreateWorkspace: boolean;
};

function record(value: Json): Record<string, Json | undefined> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, Json | undefined>
    : {};
}

export async function getPilotAccessState(): Promise<PilotAccessState> {
  const { data, error } = await supabase.rpc('get_pilot_access_state');
  if (error) throw toApiError(error, 'Pilot access could not be checked.');
  const result = record(data);
  const status =
    result.status === 'pending' ||
    result.status === 'approved' ||
    result.status === 'declined'
      ? result.status
      : 'not_requested';
  return {
    status,
    requestedAt: typeof result.requested_at === 'string' ? result.requested_at : null,
    reviewedAt: typeof result.reviewed_at === 'string' ? result.reviewed_at : null,
    canCreateWorkspace: result.can_create_workspace === true
  };
}

export async function requestPilotAccess(note = ''): Promise<PilotAccessStatus> {
  const { data, error } = await supabase.rpc('request_pilot_access', {
    p_note: note.trim() || undefined
  });
  if (error) throw toApiError(error, 'Pilot access could not be requested.');
  const status = record(data).status;
  return status === 'approved' ? 'approved' : 'pending';
}
