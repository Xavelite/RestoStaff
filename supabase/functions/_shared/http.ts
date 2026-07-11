const ALLOWED_HEADERS = 'authorization, x-client-info, apikey, content-type';

export function corsHeaders(appOrigin: string): HeadersInit {
  return {
    'Access-Control-Allow-Origin': appOrigin,
    'Access-Control-Allow-Headers': ALLOWED_HEADERS,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    Vary: 'Origin'
  };
}

export function jsonResponse(
  appOrigin: string,
  body: unknown,
  status = 200
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(appOrigin), 'Content-Type': 'application/json' }
  });
}

export function originAllowed(
  origin: string | null,
  appOrigin: string,
  allowMissingOrigin = false
): boolean {
  return origin === appOrigin || (allowMissingOrigin && origin === null);
}

export function bearerAuthorization(request: Request): string | null {
  const authorization = request.headers.get('Authorization') ?? '';
  return authorization.toLowerCase().startsWith('bearer ') ? authorization : null;
}
