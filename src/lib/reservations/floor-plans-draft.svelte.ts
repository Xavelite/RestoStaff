import type {
  ReservationFloorPlans,
  ReservationFloorPlansDraft
} from './reservation-types';

/**
 * The floor-plan draft, held outside the workspace component.
 *
 * Every other editable surface keeps its draft in a store — Restaurant, Team,
 * Schedule — so the work survives a tab change and one scoped guard can decide
 * when leaving really costs something. This was the last surface holding its
 * draft in component state, which meant a hop to a sibling tab silently threw
 * away an area's floor placement, and the guard had to block every navigation
 * to compensate.
 *
 * Areas and Tables read the same plan from the same endpoint, so one draft
 * serves both; whoever saves sends the whole plan.
 */
class FloorPlansDraft {
  source = $state<ReservationFloorPlans | null>(null);
  draft = $state<ReservationFloorPlansDraft | null>(null);
  dirty = $state(false);

  /** True once this restaurant's plan is loaded, so a remount does not refetch. */
  holds(restaurantId: string): boolean {
    return Boolean(restaurantId) && this.source?.restaurantId === restaurantId;
  }

  /** Take a freshly loaded plan as the new clean baseline. */
  adopt(source: ReservationFloorPlans, draft: ReservationFloorPlansDraft): void {
    this.source = source;
    this.draft = draft;
    this.dirty = false;
  }

  /** Go back to the last loaded plan. */
  restore(draft: ReservationFloorPlansDraft): void {
    this.draft = draft;
    this.dirty = false;
  }

  touch(): void {
    this.dirty = true;
  }
}

export const floorPlansDraft = new FloorPlansDraft();
