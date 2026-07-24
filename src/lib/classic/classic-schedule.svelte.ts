import { untrack } from 'svelte';
import type { ManagerOperationsReadModel } from '$lib/api/workspace-snapshot';
import {
  planningDraftForWeek,
  planningNotesForWeek,
  planningStatusForWeek,
  type PlanningNoteDraft,
  type PlanningShiftDraft
} from '$lib/schedule/schedule-model';

/** What ClassicScheduleWeek hands each Schedule page about the active week. */
export type ScheduleWeekContext = {
  weekStart: string;
  today: string;
  published: boolean;
  revision: number;
  editable: boolean;
};

/**
 * The week being edited in the classic Schedule module.
 *
 * In this design the coverage lens and the publish gate are pages, not
 * overlays, so the draft has to survive navigation between them — it lives
 * here rather than inside one route component. Planning, Coverage and Publish
 * all read and write this single draft; Save on any of them persists it.
 */
class ClassicScheduleDraft {
  /** Weeks from the current one; negative is the past. */
  weekOffset = $state(0);
  shifts = $state<PlanningShiftDraft[]>([]);
  notes = $state<PlanningNoteDraft[]>([]);
  dirty = $state(false);
  saving = $state(false);

  /** Week + revision the draft was built from; plain, so sync() is not reactive. */
  #loadedKey = '';

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
    this.shifts = planningDraftForWeek(snapshot, weekStart);
    this.notes = planningNotesForWeek(snapshot, weekStart);
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

  /** After a successful save the server is the truth again. */
  settle(): void {
    this.#loadedKey = '';
    this.dirty = false;
  }
}

export const scheduleDraft = new ClassicScheduleDraft();
