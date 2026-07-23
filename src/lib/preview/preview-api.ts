import { supabase } from '$lib/supabase/client';
import { toApiError } from '$lib/api/error';
import type { Json } from '$lib/supabase/database.types';
import type { WorkspaceRole } from '$lib/api/workspace';
import {
  parseEmployeeOperationsReadModel,
  parseManagerOperationsReadModel,
  parseRestaurantReadModel,
  parseTeamReadModel,
  parseWorkspaceBootstrap
} from '$lib/api/workspace-snapshot';

export type PreviewPersona = {
  key: string;
  role: WorkspaceRole;
  employeeId: string | null;
  displayName: string;
  detail: string;
};

type UnknownRecord = Record<string, unknown>;

export async function getPreviewPersonas(restaurantId: string): Promise<PreviewPersona[]> {
  const { data, error } = await supabase.rpc('get_preview_personas', {
    p_restaurant_id: restaurantId
  });
  if (error) throw toApiError(error, 'Preview choices could not be loaded.');
  if (!Array.isArray(data)) return [];
  return data.flatMap((value) => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return [];
    const row = value as UnknownRecord;
    const role = String(row.role ?? '');
    if (role !== 'owner' && role !== 'manager' && role !== 'employee') return [];
    return [{
      key: String(row.key ?? ''),
      role,
      employeeId: typeof row.employee_id === 'string' ? row.employee_id : null,
      displayName: String(row.display_name ?? 'Preview'),
      detail: String(row.detail ?? '')
    }];
  });
}

export async function getPreviewBootstrap(
  restaurantId: string,
  role: WorkspaceRole,
  employeeId: string | null
) {
  const { data, error } = await supabase.rpc('get_preview_bootstrap', {
    p_restaurant_id: restaurantId,
    p_role: role,
    p_employee_id: employeeId as string
  });
  if (error) throw toApiError(error, 'Preview could not be opened.');
  return parseWorkspaceBootstrap(data);
}

export async function getPreviewOperations(
  restaurantId: string,
  role: WorkspaceRole,
  employeeId: string | null,
  from: string,
  to: string
) {
  const { data, error } = await supabase.rpc('get_preview_operations', {
    p_restaurant_id: restaurantId,
    p_role: role,
    p_employee_id: employeeId as string,
    p_from_date: from,
    p_to_date: to
  });
  if (error) throw toApiError(error, 'Preview data could not be loaded.');
  return role === 'employee'
    ? parseEmployeeOperationsReadModel(data as Json)
    : parseManagerOperationsReadModel(data as Json);
}

export function getPreviewModule(
  restaurantId: string,
  role: WorkspaceRole,
  employeeId: string | null,
  module: 'team'
): Promise<ReturnType<typeof parseTeamReadModel>>;
export function getPreviewModule(
  restaurantId: string,
  role: WorkspaceRole,
  employeeId: string | null,
  module: 'restaurant'
): Promise<ReturnType<typeof parseRestaurantReadModel>>;
export async function getPreviewModule(
  restaurantId: string,
  role: WorkspaceRole,
  employeeId: string | null,
  module: 'team' | 'restaurant'
) {
  const { data, error } = await supabase.rpc('get_preview_module', {
    p_restaurant_id: restaurantId,
    p_role: role,
    p_employee_id: employeeId as string,
    p_module: module
  });
  if (error) throw toApiError(error, 'Preview data could not be loaded.');
  return module === 'team'
    ? parseTeamReadModel(data as Json)
    : parseRestaurantReadModel(data as Json);
}
