import { getContext } from 'svelte';
import type { RestaurantDraft } from '$lib/restaurant/restaurant-model';
import type { EmployeeDraft } from '$lib/team/team-model';

export type WorkspaceTeamContext = {
  employees: EmployeeDraft[];
  jobName: Map<string, string>;
  contractName: Map<string, string>;
  editable: boolean;
  canManageOperations: boolean;
  canViewFinancials: boolean;
  saving: boolean;
  dirty: boolean;
  canSave: boolean;
  save: () => Promise<void>;
  discard: () => void;
  saveEmployee: (employee: EmployeeDraft) => Promise<void>;
};

export type WorkspaceRestaurantContext = {
  draft: RestaurantDraft;
  dirty: boolean;
  saving: boolean;
  canSave: boolean;
  save: () => Promise<void>;
  discard: () => void;
};

export const WORKSPACE_TEAM_CONTEXT = Symbol('workspace-team-context');
export const WORKSPACE_RESTAURANT_CONTEXT = Symbol('workspace-restaurant-context');

export function useWorkspaceTeamContext(): () => WorkspaceTeamContext {
  const read = getContext<() => WorkspaceTeamContext>(WORKSPACE_TEAM_CONTEXT);
  if (!read) throw new Error('Workspace Team context is only available inside the Team workspace.');
  return read;
}

export function useWorkspaceRestaurantContext(): () => WorkspaceRestaurantContext {
  const read = getContext<() => WorkspaceRestaurantContext>(WORKSPACE_RESTAURANT_CONTEXT);
  if (!read) throw new Error('Workspace Restaurant context is only available inside the Restaurant workspace.');
  return read;
}
