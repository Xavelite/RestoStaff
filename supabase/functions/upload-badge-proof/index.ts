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

async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

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

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return jsonResponse(appOrigin, { error: 'Invalid proof upload.' }, 400);
  }
  const restaurantId = String(form.get('restaurant_id') ?? '');
  const employeeId = String(form.get('employee_id') ?? '');
  const badgeToken = String(form.get('badge_token') ?? '');
  const file = form.get('proof');
  if (!restaurantId || !employeeId || !badgeToken || !(file instanceof File)) {
    return jsonResponse(appOrigin, { error: 'Employee, token and proof image are required.' }, 400);
  }
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 5_242_880) {
    return jsonResponse(appOrigin, { error: 'Use a JPEG, PNG or WebP image up to 5 MB.' }, 400);
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
    return jsonResponse(appOrigin, { error: 'Access could not be verified.' }, 403);
  }
  const membership = Array.isArray(memberships)
    ? memberships.find((item) => String(item.restaurant_id) === restaurantId)
    : null;
  if (!['owner', 'manager'].includes(String(membership?.role ?? ''))) {
    return jsonResponse(appOrigin, { error: 'Owner or manager access is required.' }, 403);
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
    return jsonResponse(appOrigin, { error: 'Badge verification expired. Enter the PIN again.' }, 403);
  }

  const extension =
    file.type === 'image/png' ? 'png' : file.type === 'image/webp' ? 'webp' : 'jpg';
  const path = `${restaurantId}/${employeeId}/${crypto.randomUUID()}.${extension}`;
  const { error: uploadError } = await admin.storage
    .from('badge-proofs')
    .upload(path, file, { contentType: file.type, upsert: false });
  if (uploadError) return jsonResponse(appOrigin, { error: 'Badge proof could not be stored.' }, 500);
  return jsonResponse(appOrigin, { ok: true, path });
});
