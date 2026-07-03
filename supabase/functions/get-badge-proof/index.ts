import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const url = Deno.env.get('SUPABASE_URL') ?? '';
const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
const appOrigin = (Deno.env.get('APP_ORIGIN') ?? '').replace(/\/$/, '');

function cors(origin: string | null): HeadersInit {
  const allowed = appOrigin && origin === appOrigin ? appOrigin : appOrigin || origin || '';
  return {
    'Access-Control-Allow-Origin': allowed,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    Vary: 'Origin'
  };
}

function response(origin: string | null, body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors(origin), 'Content-Type': 'application/json' }
  });
}

Deno.serve(async (request: Request) => {
  const origin = request.headers.get('Origin');
  if (request.method === 'OPTIONS') return new Response('ok', { headers: cors(origin) });
  if (request.method !== 'POST') return response(origin, { error: 'Method not allowed.' }, 405);
  if (!url || !serviceKey || !anonKey || !appOrigin) {
    return response(origin, { error: 'Badge proof service is not configured.' }, 500);
  }
  if (origin && origin !== appOrigin) {
    return response(origin, { error: 'Origin is not allowed.' }, 403);
  }

  const authorization = request.headers.get('Authorization') ?? '';
  if (!authorization.toLowerCase().startsWith('bearer ')) {
    return response(origin, { error: 'Authentication is required.' }, 401);
  }

  let payload: Record<string, unknown>;
  try {
    payload = await request.json();
  } catch {
    return response(origin, { error: 'Invalid request body.' }, 400);
  }
  const restaurantId = String(payload.restaurant_id ?? '').trim();
  const timeEntryId = String(payload.time_entry_id ?? '').trim();
  const edge = payload.edge === 'clock_in' ? 'clock_in' : 'clock_out';
  if (!restaurantId || !timeEntryId) {
    return response(origin, { error: 'Restaurant and time entry are required.' }, 400);
  }

  const caller = createClient(url, anonKey, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false }
  });
  const { data: memberships, error: membershipError } =
    await caller.rpc('get_current_memberships');
  if (membershipError) return response(origin, { error: 'Access could not be verified.' }, 403);
  const membership = Array.isArray(memberships)
    ? memberships.find((item) => String(item.restaurant_id) === restaurantId)
    : null;
  if (!['owner', 'manager'].includes(String(membership?.role ?? ''))) {
    return response(origin, { error: 'Owner or manager access is required.' }, 403);
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
    return response(origin, { error: 'Badge proof was not found.' }, 404);
  }
  const path =
    edge === 'clock_in' ? entry.clock_in_photo_url : entry.clock_out_photo_url;
  if (!path || /^https?:\/\//i.test(path)) {
    return response(origin, { error: 'No private proof is available for this badge.' }, 404);
  }

  const { data: signed, error: signedError } = await admin.storage
    .from('badge-proofs')
    .createSignedUrl(path, 60);
  if (signedError || !signed?.signedUrl) {
    return response(origin, { error: 'Badge proof could not be opened.' }, 500);
  }
  return response(origin, {
    url: signed.signedUrl,
    expires_in: 60,
    edge
  });
});
