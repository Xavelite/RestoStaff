import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

/**
 * This function intentionally uses custom public-channel authentication.
 * `verify_jwt = false` is limited to this one function because website visitors
 * do not have a RestoGogo account. The handler validates the revocable
 * x-restogogo-key + allowed website origin, applies a server-side rate limit,
 * and only calls service-role-only RPCs. The service credential is never sent
 * to the browser.
 */

const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
const secretKey =
  Deno.env.get('SUPABASE_SECRET_KEY') ??
  Deno.env.get('SUPABASE_SECRET_KEYS')?.split(',').map((key) => key.trim()).find(Boolean) ??
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ??
  '';
const rateLimitSalt =
  Deno.env.get('RESERVATION_PUBLIC_RATE_LIMIT_SALT') ?? secretKey;
const embedSecret =
  Deno.env.get('RESERVATION_PUBLIC_EMBED_SECRET') ?? rateLimitSalt;
const widgetOrigin = normalizedOrigin(Deno.env.get('APP_ORIGIN') ?? '');

const CHANNEL_KEY = /^rg_pk_[a-f0-9]{32}$/;
const IDEMPOTENCY_KEY = /^[A-Za-z0-9._~:+/-]{8,120}$/;
const MAX_BODY_BYTES = 16_384;

type Action = 'context' | 'availability' | 'holds' | 'release' | 'confirm';
type RpcError = { message?: string };

const RATE_LIMITS: Record<Action, { bucket: string; limit: number; seconds: number }> = {
  context: { bucket: 'context', limit: 120, seconds: 60 },
  availability: { bucket: 'availability', limit: 60, seconds: 60 },
  holds: { bucket: 'hold', limit: 10, seconds: 60 },
  release: { bucket: 'hold', limit: 10, seconds: 60 },
  confirm: { bucket: 'confirm', limit: 5, seconds: 60 }
};

function responseHeaders(origin: string | null): HeadersInit {
  return {
    'Access-Control-Allow-Origin': origin || '*',
    'Access-Control-Allow-Headers':
      'apikey, content-type, idempotency-key, x-client-info, x-restogogo-key, x-restogogo-origin, x-restogogo-session',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Cache-Control': 'no-store',
    'Content-Type': 'application/json',
    Vary: 'Origin'
  };
}

function json(
  origin: string | null,
  body: unknown,
  status = 200,
  extraHeaders: HeadersInit = {}
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...responseHeaders(origin), ...extraHeaders }
  });
}

function actionFromRequest(request: Request): Action | null {
  const segment = new URL(request.url).pathname.split('/').filter(Boolean).at(-1);
  return segment === 'context' ||
    segment === 'availability' ||
    segment === 'holds' ||
    segment === 'release' ||
    segment === 'confirm'
    ? segment
    : null;
}

function normalizedOrigin(value: string | null): string {
  if (!value) return '';
  try {
    const origin = new URL(value).origin.toLowerCase();
    return origin === 'null' ? '' : origin;
  } catch {
    return '';
  }
}

function clientAddress(request: Request): string {
  return (
    request.headers.get('cf-connecting-ip') ??
    request.headers.get('x-real-ip') ??
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    'unknown'
  ).slice(0, 128);
}

async function sha256(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const hash = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(hash)]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

function base64UrlEncode(value: Uint8Array): string {
  return btoa(String.fromCharCode(...value))
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replace(/=+$/, '');
}

function base64UrlDecode(value: string): Uint8Array<ArrayBuffer> {
  const padded = value.replaceAll('-', '+').replaceAll('_', '/')
    .padEnd(Math.ceil(value.length / 4) * 4, '=');
  const binary = atob(padded);
  const buffer = new ArrayBuffer(binary.length);
  const bytes = new Uint8Array(buffer);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

async function embedHmacKey(): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(embedSecret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify']
  );
}

async function createEmbedSession(publicKey: string, origin: string): Promise<string> {
  const payload = base64UrlEncode(
    new TextEncoder().encode(JSON.stringify({
      key: publicKey,
      origin,
      exp: Math.floor(Date.now() / 1000) + 60 * 60
    }))
  );
  const signature = await crypto.subtle.sign(
    'HMAC',
    await embedHmacKey(),
    new TextEncoder().encode(payload)
  );
  return `${payload}.${base64UrlEncode(new Uint8Array(signature))}`;
}

async function validEmbedSession(
  token: string,
  publicKey: string,
  origin: string
): Promise<boolean> {
  if (!token || token.length > 2048) return false;
  const [payload, signature, extra] = token.split('.');
  if (!payload || !signature || extra) return false;
  try {
    const valid = await crypto.subtle.verify(
      'HMAC',
      await embedHmacKey(),
      base64UrlDecode(signature),
      new TextEncoder().encode(payload)
    );
    if (!valid) return false;
    const claims = JSON.parse(
      new TextDecoder().decode(base64UrlDecode(payload))
    ) as { key?: unknown; origin?: unknown; exp?: unknown };
    return claims.key === publicKey &&
      claims.origin === origin &&
      typeof claims.exp === 'number' &&
      claims.exp >= Math.floor(Date.now() / 1000);
  } catch {
    return false;
  }
}

async function readBody(request: Request): Promise<Record<string, unknown>> {
  const length = Number(request.headers.get('content-length') ?? 0);
  if (Number.isFinite(length) && length > MAX_BODY_BYTES) {
    throw new Error('REQUEST_TOO_LARGE');
  }
  const body = await request.json();
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new Error('INVALID_REQUEST');
  }
  return body as Record<string, unknown>;
}

function publicError(error: RpcError): { status: number; message: string; code: string } {
  const detail = String(error?.message ?? '');
  if (detail.includes('PUBLIC_CHANNEL_UNAVAILABLE')) {
    return { status: 403, code: 'channel_unavailable', message: 'This booking link is unavailable.' };
  }
  if (detail.includes('IDEMPOTENCY_CONFLICT')) {
    return { status: 409, code: 'idempotency_conflict', message: 'This request key was already used.' };
  }
  if (
    detail.includes('RESERVATION_UNAVAILABLE') ||
    detail.includes('HOLD_EXPIRED') ||
    detail.includes('HOLD_ALREADY_CONSUMED') ||
    detail.includes('TABLE_INVENTORY_REQUIRED')
  ) {
    return {
      status: 409,
      code: detail.includes('HOLD_EXPIRED') ? 'hold_expired' : 'unavailable',
      message: detail.includes('HOLD_EXPIRED')
        ? 'Your five-minute hold expired. Please choose a time again.'
        : 'That time is no longer available. Please choose another.'
    };
  }
  if (
    detail.includes('INVALID_') ||
    detail.includes('EMAIL_OR_PHONE_REQUIRED') ||
    detail.includes('SERVICE_UNAVAILABLE')
  ) {
    return { status: 400, code: 'invalid_request', message: 'Please check the booking details.' };
  }
  return { status: 500, code: 'booking_error', message: 'The booking request could not be completed.' };
}

Deno.serve(async (request: Request) => {
  const corsOrigin = request.headers.get('Origin');
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: responseHeaders(corsOrigin) });
  }
  if (request.method !== 'POST') {
    return json(corsOrigin, { error: 'Method not allowed.', code: 'method_not_allowed' }, 405);
  }
  if (!supabaseUrl || !secretKey || !rateLimitSalt || !embedSecret || !widgetOrigin) {
    return json(corsOrigin, { error: 'Booking service is not configured.', code: 'not_configured' }, 500);
  }

  const action = actionFromRequest(request);
  if (!action) {
    return json(corsOrigin, { error: 'Booking endpoint not found.', code: 'not_found' }, 404);
  }

  const publicKey = request.headers.get('x-restogogo-key')?.trim() ?? '';
  const websiteOrigin = normalizedOrigin(request.headers.get('x-restogogo-origin'));
  if (!CHANNEL_KEY.test(publicKey) || !websiteOrigin) {
    return json(corsOrigin, { error: 'Booking channel authentication failed.', code: 'invalid_channel' }, 401);
  }
  const actualOrigin = normalizedOrigin(corsOrigin);
  const embedSession = request.headers.get('x-restogogo-session')?.trim() ?? '';
  const firstPartyRequest = actualOrigin === websiteOrigin;
  const embeddedRequest =
    actualOrigin === widgetOrigin &&
    await validEmbedSession(embedSession, publicKey, websiteOrigin);
  if (!firstPartyRequest && !embeddedRequest) {
    return json(corsOrigin, { error: 'Booking origin verification failed.', code: 'invalid_origin' }, 403);
  }

  const admin = createClient(supabaseUrl, secretKey, {
    auth: { persistSession: false, autoRefreshToken: false }
  });
  const rule = RATE_LIMITS[action];
  const fingerprint = await sha256(
    `${rateLimitSalt}|${publicKey}|${clientAddress(request)}`
  );
  const { data: rate, error: rateError } = await admin.rpc(
    'consume_reservation_public_rate_limit',
    {
      p_public_key: publicKey,
      p_origin: websiteOrigin,
      p_bucket: rule.bucket,
      p_client_hash: fingerprint,
      p_limit: rule.limit,
      p_window_seconds: rule.seconds
    }
  );
  if (rateError) {
    const visible = publicError(rateError);
    return json(corsOrigin, { error: visible.message, code: visible.code }, visible.status);
  }
  const rateResult = (rate ?? {}) as {
    allowed?: boolean;
    remaining?: number;
    retry_after_seconds?: number;
  };
  if (!rateResult.allowed) {
    const retryAfter = Math.max(Number(rateResult.retry_after_seconds ?? 60), 1);
    return json(
      corsOrigin,
      { error: 'Too many booking requests. Please wait a moment.', code: 'rate_limited' },
      429,
      { 'Retry-After': String(retryAfter) }
    );
  }

  let body: Record<string, unknown>;
  try {
    body = await readBody(request);
  } catch (error) {
    const tooLarge = error instanceof Error && error.message === 'REQUEST_TOO_LARGE';
    return json(
      corsOrigin,
      {
        error: tooLarge ? 'Request body is too large.' : 'Invalid request body.',
        code: tooLarge ? 'request_too_large' : 'invalid_request'
      },
      tooLarge ? 413 : 400
    );
  }

  let rpc: string;
  let args: Record<string, unknown>;
  if (action === 'context') {
    rpc = 'reservation_public_context';
    args = { p_public_key: publicKey, p_origin: websiteOrigin };
  } else if (action === 'availability') {
    rpc = 'reservation_public_search_availability';
    args = {
      p_public_key: publicKey,
      p_origin: websiteOrigin,
      p_business_date: body.business_date,
      p_service_key: body.service_key,
      p_party_size: body.party_size,
      p_room_id: body.area_id || undefined
    };
  } else if (action === 'release') {
    rpc = 'reservation_public_release_hold';
    args = {
      p_public_key: publicKey,
      p_origin: websiteOrigin,
      p_hold_token: body.hold_token
    };
  } else {
    const idempotencyKey = request.headers.get('idempotency-key')?.trim() ?? '';
    if (!IDEMPOTENCY_KEY.test(idempotencyKey)) {
      return json(
        corsOrigin,
        { error: 'A valid idempotency key is required.', code: 'invalid_idempotency_key' },
        400
      );
    }
    if (action === 'holds') {
      rpc = 'reservation_public_create_hold';
      args = {
        p_public_key: publicKey,
        p_origin: websiteOrigin,
        p_idempotency_key: idempotencyKey,
        p_request: body
      };
    } else {
      rpc = 'reservation_public_confirm';
      args = {
        p_public_key: publicKey,
        p_origin: websiteOrigin,
        p_idempotency_key: idempotencyKey,
        p_hold_token: body.hold_token,
        p_guest: body.guest
      };
    }
  }

  if (action === 'context' && body.bootstrap === true && !firstPartyRequest) {
    return json(corsOrigin, { error: 'Embed sessions can only be created by the allowed website.', code: 'invalid_origin' }, 403);
  }

  const { data, error } = await admin.rpc(rpc, args);
  if (error) {
    const visible = publicError(error);
    return json(corsOrigin, { error: visible.message, code: visible.code }, visible.status);
  }

  const result = action === 'context' && body.bootstrap === true
    ? {
        ...(data && typeof data === 'object' && !Array.isArray(data) ? data : {}),
        embed_session: await createEmbedSession(publicKey, websiteOrigin)
      }
    : data;

  return json(
    corsOrigin,
    result,
    action === 'holds' ? 201 : action === 'confirm' ? 201 : 200,
    { 'X-RateLimit-Remaining': String(rateResult.remaining ?? 0) }
  );
});
