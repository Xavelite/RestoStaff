import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import {
  bearerAuthorization,
  corsHeaders,
  jsonResponse,
  originAllowed
} from '../_shared/http.ts';

const url = Deno.env.get('SUPABASE_URL') ?? '';
const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
const appOrigin = (Deno.env.get('APP_ORIGIN') ?? '').replace(/\/$/, '');

Deno.serve(async (request: Request) => {
  const origin = request.headers.get('Origin');
  if (request.method === 'OPTIONS') {
    return originAllowed(origin, appOrigin, true)
      ? new Response('ok', { headers: corsHeaders(appOrigin) })
      : jsonResponse(appOrigin, { error: 'Origin is not allowed.' }, 403);
  }
  if (request.method !== 'POST') return jsonResponse(appOrigin, { error: 'Method not allowed.' }, 405);
  if (!url || !serviceKey || !anonKey || !appOrigin) {
    return jsonResponse(appOrigin, { error: 'Badge proof service is not configured.' }, 500);
  }
  if (!originAllowed(origin, appOrigin, true)) {
    return jsonResponse(appOrigin, { error: 'Origin is not allowed.' }, 403);
  }

  const authorization = bearerAuthorization(request);
  if (!authorization) {
    return jsonResponse(appOrigin, { error: 'Authentication is required.' }, 401);
  }

  let payload: Record<string, unknown>;
  try {
    payload = await request.json();
  } catch {
    return jsonResponse(appOrigin, { error: 'Invalid request body.' }, 400);
  }
  const restaurantId = String(payload.restaurant_id ?? '').trim();
  const timeEntryId = String(payload.time_entry_id ?? '').trim();
  const edge = payload.edge === 'clock_in' ? 'clock_in' : 'clock_out';
  if (!restaurantId || !timeEntryId) {
    return jsonResponse(appOrigin, { error: 'Restaurant and time entry are required.' }, 400);
  }

  const caller = createClient(url, anonKey, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false }
  });
  const { data: memberships, error: membershipError } =
    await caller.rpc('get_current_memberships');
  if (membershipError) return jsonResponse(appOrigin, { error: 'Access could not be verified.' }, 403);
  const membership = Array.isArray(memberships)
    ? memberships.find((item) => String(item.restaurant_id) === restaurantId)
    : null;
  if (!['owner', 'manager'].includes(String(membership?.role ?? ''))) {
    return jsonResponse(appOrigin, { error: 'Owner or manager access is required.' }, 403);
  }

  const admin = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false }
  });
  const { data: entry, error: entryError } = await admin
    .from('time_entries')
    .select('restaurant_id,clock_in_photo_url,clock_out_photo_url')
    .eq('id', timeEntryId)
    .eq('restaurant_id', restaurantId)
    .maybeSingle();
  if (entryError || !entry) {
    return jsonResponse(appOrigin, { error: 'Badge proof was not found.' }, 404);
  }
  const path =
    edge === 'clock_in' ? entry.clock_in_photo_url : entry.clock_out_photo_url;
  if (!path || /^https?:\/\//i.test(path)) {
    return jsonResponse(appOrigin, { error: 'No private proof is available for this badge.' }, 404);
  }

  const { data: signed, error: signedError } = await admin.storage
    .from('badge-proofs')
    .createSignedUrl(path, 60);
  if (signedError || !signed?.signedUrl) {
    return jsonResponse(appOrigin, { error: 'Badge proof could not be opened.' }, 500);
  }
  return jsonResponse(appOrigin, {
    url: signed.signedUrl,
    expires_in: 60,
    edge
  });
});
