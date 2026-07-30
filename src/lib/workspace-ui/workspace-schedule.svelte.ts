import { untrack } from 'svelte';
import type { ManagerOperationsReadModel } from '$lib/api/workspace-snapshot';
import {
  planningDraftForWeek,
  planningNotesForWeek,
  planningStatusForWeek,
  type PlanningNoteDraft,
  type PlanningShiftDraft
} from '$lib/schedule/schedule-model';
import { StableDraftPlacement } from './stable-draft-placement';

/** What WorkspaceScheduleWeek hands each Schedule page about the active week. */
export type ScheduleWeekContext = {
  weekStart: string;
  today: string;
  label: string;
  published: boolean;
  hasUnpublishedChanges: boolean;
  revision: number;
  editable: boolean;
  previous: () => void;
  next: () => void;
  todayAction: () => void;
  selectDate: (date: string) => void;
};

export type ScheduleRowPlacement = {
  id: string;
  conflict: boolean;
  contractLabel: string;
  positionLabel: string;
  positionAreaId: string | null;
  areaLabel: string;
  areaId: string | null;
  statusLabel: string;
};

/**
 * The week being edited in the workspace Schedule module.
 *
 * In this design the coverage lens and the publish gate are pages, not
 * overlays, so the draft has to survive navigation between them — it lives
 * here rather than inside one route component. Planning, Coverage and Publish
 * all read and write this single draft; Save on any of them persists it.
 */
class WorkspaceScheduleDraft {
  /** Weeks from the current one; negative is the past. */
  weekOffset = $state(0);
  shifts = $state<PlanningShiftDraft[]>([]);
  /** Last successfully loaded/saved shifts, used only to keep row membership stable. */
  placementShifts = $state<PlanningShiftDraft[]>([]);
  notes = $state<PlanningNoteDraft[]>([]);
  dirty = $state(false);
  saving = $state(false);

  /** Week + revision the draft was built from; plain, so sync() is not reactive. */
  #loadedKey = '';
  #rowPlacement = new StableDraftPlacement<ScheduleRowPlacement>(structuredClone);

  /**
   * Rebuild the draft from the snapshot when the week changes, or when the
   * server revision moves under us and there is nothing unsaved to lose.
   * Safe to call from an $effect: it reads its guards untracked, so it never
   * re-triggers itself.
   */
  sync(snapshot: ManagerOperationsReadModel, weekStart: string): void {
    const key = `${weekStart}|${planningStatusForWeek(snapshot, weekStart).revision}`;
    const stale = untrack(() => this.#loadedKey !== key);
    if (!stale) return;
    const weekChanged = untrack(() => !this.#loadedKey.startsWith(`${weekStart}|`));
    if (!weekChanged && untrack(() => this.dirty)) return;
    this.#loadedKey = key;
    const shifts = planningDraftForWeek(snapshot, weekStart);
    this.shifts = shifts;
    this.placementShifts = shifts.map((shift) => ({ ...shift }));
    this.notes = planningNotesForWeek(snapshot, weekStart);
    this.#rowPlacement.reset([]);
    this.dirty = false;
  }

  /** Discard local edits and take the server's version of the week again. */
  reset(snapshot: ManagerOperationsReadModel, weekStart: string): void {
    this.#loadedKey = '';
    this.dirty = false;
    this.sync(snapshot, weekStart);
  }

  /** Accept a whole new shift list (the slot editor hands one back). */
  replace(shifts: PlanningShiftDraft[]): void {
    this.shifts = shifts;
    this.dirty = true;
  }

  replaceNotes(notes: PlanningNoteDraft[]): void {
    this.notes = notes;
    this.dirty = true;
  }

  add(shift: PlanningShiftDraft): void {
    this.replace([...this.shifts, shift]);
  }

  remove(employeeId: string, weekday: number, serviceKey: string): void {
    this.replace(
      this.shifts.filter(
        (shift) =>
          !(
            shift.employeeId === employeeId &&
            shift.weekday === weekday &&
            shift.serviceKey === serviceKey
          )
      )
    );
  }

  /**
   * Filtering and grouping use the first state seen for the committed week.
   * Cards and totals still render from the live shift draft; only the employee
   * row's location is held until save/discard succeeds.
   */
  placement(row: ScheduleRowPlacement): ScheduleRowPlacement {
    return this.#rowPlacement.snapshotFor(row);
  }

  /** After a successful save the server is the truth again. */
  settle(): void {
    this.#loadedKey = '';
    this.placementShifts = this.shifts.map((shift) => ({ ...shift }));
    this.#rowPlacement.reset([]);
    this.dirty = false;
  }
}

export const scheduleDraft = new WorkspaceScheduleDraft();
