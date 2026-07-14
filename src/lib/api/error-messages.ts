// One place to turn raw Supabase/Postgres errors into human messages, so no
// screen ever shows database guts like "duplicate key value violates unique
// constraint ...". Server-raised business messages (which are already written
// for people) pass through unchanged.

export type FriendlyErrorContext = 'badge' | 'planning' | 'actuals' | 'absence' | undefined;

export function friendlyError(error: unknown, context?: FriendlyErrorContext): string {
  const raw = (error instanceof Error ? error.message : String(error ?? '')).trim();
  const lower = raw.toLowerCase();

  // Server business rules are raised as readable sentences — keep them, only
  // strip the internal CONFLICT: marker the revision guard uses.
  if (raw.startsWith('CONFLICT:')) return raw.slice('CONFLICT:'.length).trim();

  if (lower.includes('duplicate key') || lower.includes('already exists')) {
    if (context === 'badge') return 'This shift has already been completed today.';
    if (context === 'absence') return 'A request already exists for those dates.';
    return 'That record already exists.';
  }

  // Any remaining low-level Postgres noise: don't expose it.
  if (
    lower.includes('violates') ||
    lower.includes('constraint') ||
    lower.includes('sqlstate') ||
    lower.includes('null value in column') ||
    lower.startsWith('pgrst') ||
    lower.includes('jwt')
  ) {
    return 'That action could not be completed. Please refresh and try again.';
  }

  return raw || 'Something went wrong. Please try again.';
}
