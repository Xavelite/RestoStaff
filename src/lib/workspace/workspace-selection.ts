import type { Membership, WorkspaceRole } from '$lib/api/workspace';

const ROLE_PRIORITY: Record<WorkspaceRole, number> = {
  owner: 0,
  manager: 1,
  employee: 2
};

export function orderedMemberships(memberships: Membership[]): Membership[] {
  return [...memberships].sort(
    (left, right) =>
      ROLE_PRIORITY[left.role] - ROLE_PRIORITY[right.role] ||
      left.restaurant_name.localeCompare(right.restaurant_name) ||
      left.restaurant_id.localeCompare(right.restaurant_id)
  );
}

export function preferredMembership(
  memberships: Membership[],
  preferredRestaurantId: string | null
): Membership | null {
  if (!memberships.length) return null;
  return (
    memberships.find((membership) => membership.restaurant_id === preferredRestaurantId) ??
    orderedMemberships(memberships)[0] ??
    null
  );
}

export function roleHome(role: WorkspaceRole): '/home' | '/shifts' {
  return role === 'employee' ? '/shifts' : '/home';
}
