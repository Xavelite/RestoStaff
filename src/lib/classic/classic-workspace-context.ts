import { getContext } from 'svelte';
import type { RestaurantDraft } from '$lib/restaurant/restaurant-model';
import type { EmployeeDraft } from '$lib/team/team-model';
import type { ReservationFloorPlansDraft } from '$lib/reservations/reservation-types';

export type ClassicTeamContext = {
  employees: EmployeeDraft[];
  jobName: Map<string, string>;
  contractName: Map<string, string>;
  editable: boolean;
  owner: boolean;
  saving: boolean;
  dirty: boolean;
  canSave: boolean;
  save: () => Promise<void>;
  discard: () => void;
  saveEmployee: (employee: EmployeeDraft) => Promise<void>;
};

export type ClassicRestaurantContext = {
  draft: RestaurantDraft;
  dirty: boolean;
  saving: boolean;
  canSave: boolean;
  save: () => Promise<void>;
  saveVenue: (floorPlans: ReservationFloorPlansDraft, expectedRevision: number) => Promise<void>;
  discard: () => void;
};

export const CLASSIC_TEAM_CONTEXT = Symbol('classic-team-context');
export const CLASSIC_RESTAURANT_CONTEXT = Symbol('classic-restaurant-context');

export function useClassicTeamContext(): () => ClassicTeamContext {
  const read = getContext<() => ClassicTeamContext>(CLASSIC_TEAM_CONTEXT);
  if (!read) throw new Error('Classic Team context is only available inside the Team workspace.');
  return read;
}

export function useClassicRestaurantContext(): () => ClassicRestaurantContext {
  const read = getContext<() => ClassicRestaurantContext>(CLASSIC_RESTAURANT_CONTEXT);
  if (!read) throw new Error('Classic Restaurant context is only available inside the Restaurant workspace.');
  return read;
}
