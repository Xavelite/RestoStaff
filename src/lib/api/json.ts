import type { Json } from '$lib/supabase/database.types';

// The single sanctioned boundary cast from a strongly-typed frontend draft to the
// generic `Json` an RPC parameter expects. Frontend models build typed objects and
// the database validates them; keeping the unavoidable cast here means there is
// exactly one auditable place instead of scattered `as unknown as Json`.
export function asJson<T>(value: T): Json {
  return value as unknown as Json;
}

export function asJsonArray<T>(value: T[]): Json[] {
  return value as unknown as Json[];
}
