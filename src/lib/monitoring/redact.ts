const EMAIL = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;
const BELGIAN_IBAN = /\bBE(?:[\s-]*\d){14}\b/gi;
const JWT = /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g;
const LONG_IDENTIFIER = /\b\d(?:[\s./-]*\d){9,}\b/g;

export function redactMonitoringMessage(value: unknown): string {
  const raw =
    value instanceof Error
      ? value.message
      : typeof value === 'string'
        ? value
        : 'Unknown client error';

  return raw
    .replace(EMAIL, '[email]')
    .replace(BELGIAN_IBAN, '[bank-account]')
    .replace(JWT, '[token]')
    .replace(LONG_IDENTIFIER, '[identifier]')
    .slice(0, 500);
}
