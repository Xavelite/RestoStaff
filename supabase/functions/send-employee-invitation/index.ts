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

function normalizedEmail(value: unknown): string {
  return String(value ?? '').trim().toLowerCase();
}

Deno.serve(async (request: Request) => {
  const origin = request.headers.get('Origin');
  if (request.method === 'OPTIONS') {
    return originAllowed(origin, appOrigin)
      ? new Response('ok', { headers: corsHeaders(appOrigin) })
      : jsonResponse(appOrigin, { error: 'Origin is not allowed.' }, 403);
  }
  if (request.method !== 'POST') return jsonResponse(appOrigin, { error: 'Method not allowed.' }, 405);
  if (!url || !serviceKey || !anonKey || !appOrigin) {
    return jsonResponse(appOrigin, { error: 'Invitation service is not configured.' }, 500);
  }
  if (!originAllowed(origin, appOrigin)) {
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
  const employeeId = String(payload.employee_id ?? '').trim();
  const targetEmail = normalizedEmail(payload.email);
  const invitedRole = String(payload.role ?? '').trim().toLowerCase();

  if (!restaurantId || !employeeId) {
    return jsonResponse(appOrigin, { error: 'Restaurant and employee are required.' }, 400);
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(targetEmail)) {
    return jsonResponse(appOrigin, { error: 'Save a valid employee email first.' }, 400);
  }
  if (!['employee', 'manager'].includes(invitedRole)) {
    return jsonResponse(appOrigin, { error: 'Role must be employee or manager.' }, 400);
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

  if (membershipError || profileError || !profileId) {
    return jsonResponse(appOrigin, { error: 'Access could not be verified.' }, 403);
  }
  const membership = Array.isArray(memberships)
    ? memberships.find((item) => String(item.restaurant_id) === restaurantId)
    : null;
  const callerRole = String(membership?.role ?? '');
  if (!['owner', 'manager'].includes(callerRole)) {
    return jsonResponse(appOrigin, { error: 'Owner or manager access is required.' }, 403);
  }
  if (invitedRole === 'manager' && callerRole !== 'owner') {
    return jsonResponse(appOrigin, { error: 'Only an owner can invite a manager.' }, 403);
  }

  const invitationToken = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
  const redirect = new URL('/accept-invite', appOrigin);
  redirect.searchParams.set('restaurant', restaurantId);
  redirect.searchParams.set('invitation', invitationToken);

  const admin = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false }
  });
  const { data: registration, error: registrationError } = await admin.rpc(
    'register_employee_invitation',
    {
      p_restaurant_id: restaurantId,
      p_employee_id: employeeId,
      p_email: targetEmail,
      p_role: invitedRole,
      p_token: invitationToken,
      p_expires_at: expiresAt,
      p_invited_by_profile_id: profileId
    }
  );
  if (registrationError) {
    return jsonResponse(appOrigin, { error: 'The invitation could not be registered.' }, 400);
  }

  const invitationId = String(registration?.invitation_id ?? '');
  if (!invitationId) {
    return jsonResponse(appOrigin, { error: 'Invitation registration failed.' }, 500);
  }

  const mailer = createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false }
  });
  const { error: deliveryError } = await mailer.auth.signInWithOtp({
    email: targetEmail,
    options: {
      emailRedirectTo: redirect.toString(),
      shouldCreateUser: true
    }
  });

  if (deliveryError) {
    await admin.rpc('revoke_employee_invitation_delivery', {
      p_invitation_id: invitationId,
      p_reason: 'Authentication email delivery failed'
    });
    return jsonResponse(appOrigin, { error: 'The invitation email could not be sent.' }, 400);
  }

  return jsonResponse(appOrigin, {
    ok: true,
    status: 'sent',
    expires_at: expiresAt
  });
});
