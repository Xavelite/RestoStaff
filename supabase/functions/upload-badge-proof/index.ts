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

async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
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

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return response(origin, { error: 'Invalid proof upload.' }, 400);
  }
  const restaurantId = String(form.get('restaurant_id') ?? '');
  const employeeId = String(form.get('employee_id') ?? '');
  const badgeToken = String(form.get('badge_token') ?? '');
  const file = form.get('proof');
  if (!restaurantId || !employeeId || !badgeToken || !(file instanceof File)) {
    return response(origin, { error: 'Employee, token and proof image are required.' }, 400);
  }
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 5_242_880) {
    return response(origin, { error: 'Use a JPEG, PNG or WebP image up to 5 MB.' }, 400);
  }

  const caller = createClient(url, anonKey, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false }
  });
  const [{ data: memberships, error: membershipError }, { data: profileId, error: profileError }] =
    await Promise.all([
      caller.rpc('get_current_memberships'),
      caller.rpc('current_profile_id')
    ]);
  if (membershipError || profileError) {
    return response(origin, { error: 'Access could not be verified.' }, 403);
  }
  const membership = Array.isArray(memberships)
    ? memberships.find((item) => String(item.restaurant_id) === restaurantId)
    : null;
  if (!['owner', 'manager'].includes(String(membership?.role ?? ''))) {
    return response(origin, { error: 'Owner or manager access is required.' }, 403);
  }

  const admin = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false }
  });
  const tokenHash = await sha256(badgeToken);
  const { data: challenge, error: challengeError } = await admin
    .from('badge_verification_challenges')
    .select('id')
    .eq('restaurant_id', restaurantId)
    .eq('employee_id', employeeId)
    .eq('actor_profile_id', profileId)
    .eq('token_hash', tokenHash)
    .is('used_at', null)
    .gt('expires_at', new Date().toISOString())
    .maybeSingle();
  if (challengeError || !challenge) {
    return response(origin, { error: 'Badge verification expired. Enter the PIN again.' }, 403);
  }

  const extension =
    file.type === 'image/png' ? 'png' : file.type === 'image/webp' ? 'webp' : 'jpg';
  const path = `${restaurantId}/${employeeId}/${crypto.randomUUID()}.${extension}`;
  const { error: uploadError } = await admin.storage
    .from('badge-proofs')
    .upload(path, file, { contentType: file.type, upsert: false });
  if (uploadError) return response(origin, { error: uploadError.message }, 500);
  return response(origin, { ok: true, path });
});
