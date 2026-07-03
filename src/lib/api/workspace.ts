import { supabase } from '$lib/supabase/client';
import type { Database } from '$lib/supabase/database.types';
import { toApiError } from './error';
import {
  parseEmployeeOperationsReadModel,
  parseManagerOperationsReadModel,
  parseRestaurantReadModel,
  parseTeamReadModel,
  parseWorkspaceBootstrap
} from './workspace-snapshot';

// Read side of the workspace API. Each function is a thin, named wrapper over one
// database RPC. The RPC name and its parameters are type-checked against the real
// schema (database.types.ts) — a wrong name or param fails the build, not runtime.
// Optional params are omitted (undefined) to let the database apply its own default.

export type WorkspaceRole = 'owner' | 'manager' | 'employee';

type MembershipRow =
  Database['public']['Functions']['get_current_memberships']['Returns'][number];

/** One restaurant the signed-in user belongs to, with their normalized runtime role. */
export type Membership = Omit<MembershipRow, 'role'> & { role: WorkspaceRole };

function isWorkspaceRole(value: string): value is WorkspaceRole {
  return value === 'owner' || value === 'manager' || value === 'employee';
}

/** The signed-in user's active restaurant memberships (which workspaces + role). */
export async function getCurrentMemberships(): Promise<Membership[]> {
  const { data, error } = await supabase.rpc('get_current_memberships');
  if (error) throw toApiError(error, 'Workspaces could not be loaded.');
  return (data ?? []).map((membership) => {
    if (!isWorkspaceRole(membership.role)) {
      throw new TypeError(`Unsupported workspace role: ${membership.role}`);
    }
    return { ...membership, role: membership.role };
  });
}

export async function getWorkspaceBootstrap(restaurantId: string) {
  const { data, error } = await supabase.rpc('get_workspace_bootstrap', {
    p_restaurant_id: restaurantId
  });
  if (error) throw toApiError(error, 'Workspace context could not be loaded.');
  return parseWorkspaceBootstrap(data);
}

export async function getManagerOperationsReadModel(
  restaurantId: string,
  fromDate: string,
  toDate: string
) {
  const { data, error } = await supabase.rpc('get_manager_operations_read_model', {
    p_restaurant_id: restaurantId,
    p_from_date: fromDate,
    p_to_date: toDate
  });
  if (error) throw toApiError(error, 'Restaurant operations could not be loaded.');
  return parseManagerOperationsReadModel(data);
}

export async function getEmployeeOperationsReadModel(
  restaurantId: string,
  fromDate: string,
  toDate: string
) {
  const { data, error } = await supabase.rpc('get_employee_operations_read_model', {
    p_restaurant_id: restaurantId,
    p_from_date: fromDate,
    p_to_date: toDate
  });
  if (error) throw toApiError(error, 'Your schedule could not be loaded.');
  return parseEmployeeOperationsReadModel(data);
}

export async function getTeamReadModel(restaurantId: string) {
  const { data, error } = await supabase.rpc('get_team_read_model', {
    p_restaurant_id: restaurantId
  });
  if (error) throw toApiError(error, 'Team data could not be loaded.');
  return parseTeamReadModel(data);
}

export async function getRestaurantReadModel(restaurantId: string) {
  const { data, error } = await supabase.rpc('get_restaurant_read_model', {
    p_restaurant_id: restaurantId
  });
  if (error) throw toApiError(error, 'Restaurant setup could not be loaded.');
  return parseRestaurantReadModel(data);
}
