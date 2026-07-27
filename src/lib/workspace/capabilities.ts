import type { WorkspaceRole } from '$lib/api/workspace';

/**
 * Product capabilities live here instead of being inferred ad hoc in pages.
 *
 * Owners and managers run the same restaurant operations. Financial values,
 * payroll preparation and money-bearing exports remain owner-only.
 */
export function canManageOperations(role: WorkspaceRole | null): boolean {
  return role === 'owner' || role === 'manager';
}

export function canViewFinancials(role: WorkspaceRole | null): boolean {
  return role === 'owner';
}
