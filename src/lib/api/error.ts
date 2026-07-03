type ErrorRecord = Record<string, unknown>;

function record(value: unknown): ErrorRecord | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as ErrorRecord)
    : null;
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

export function apiErrorMessage(
  value: unknown,
  fallback = 'The operation could not be completed.'
): string {
  if (value instanceof Error && value.message.trim()) return value.message.trim();
  if (typeof value === 'string' && value.trim()) return value.trim();

  const error = record(value);
  if (!error) return fallback;

  const message =
    text(error.message) ||
    text(error.error_description) ||
    text(error.error) ||
    text(error.details);
  if (!message) return fallback;

  const detail = text(error.details);
  const hint = text(error.hint);
  return [message, detail !== message ? detail : '', hint]
    .filter(Boolean)
    .join(' ');
}

export function toApiError(value: unknown, fallback?: string): Error {
  return value instanceof Error
    ? value
    : new Error(apiErrorMessage(value, fallback));
}
