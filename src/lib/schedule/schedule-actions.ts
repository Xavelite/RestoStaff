import { saveAbsence, savePlanning, saveWorkPatternException } from '$lib/api/mutations';
import { clockMinutes, mondayFor } from '$lib/calendar/date';
import { workspaceRealtime } from '$lib/realtime/workspace-realtime.svelte';
import { workspace } from '$lib/workspace/workspace.svelte';
import {
  planningRequestIdentity,
  planningStatusForWeek,
  type PlanningGridSlot,
  type PlanningNoteDraft,
  type PlanningShiftDraft
} from './schedule-model.ts';

/**
 * The audited Schedule mutations, in one place.
 *
 * Both designs save the same week and resolve the same blocking requests, so
 * the payload shapes and the publish semantics live here rather than being
 * copied per shell. Callers own their own feedback; errors propagate.
 */

async function refreshSchedule(restaurantId: string, weekStart: string): Promise<void> {
  await workspace.reloadOperations();
  await workspaceRealtime.publish('planning-saved', {
    restaurantId,
    revision: workspace.operations
      ? planningStatusForWeek(workspace.operations, weekStart).revision
      : null,
    source: 'planning'
  });
}

/**
 * The one thing that genuinely stops a save: a shift without an employee or
 * with unusable times. Coverage gaps and conflicts never block — they are
 * confirmable warnings, so the manager stays in control.
 */
export function invalidPlanningShift(
  shifts: PlanningShiftDraft[]
): PlanningShiftDraft | undefined {
  return shifts.find((shift) => {
    const start = clockMinutes(shift.startsAt);
    const end = clockMinutes(shift.endsAt);
    return !shift.employeeId || start === null || end === null || start === end;
  });
}

export async function saveSchedule(input: {
  restaurantId: string;
  weekStart: string;
  status: 'draft' | 'published';
  shifts: PlanningShiftDraft[];
  notes: PlanningNoteDraft[];
  expectedRevision: number;
  /** Whether the week was already published, which changes the audit reason. */
  wasPublished: boolean;
  allowCoverageGaps?: boolean;
  allowConflicts?: boolean;
}): Promise<void> {
  const publishing = input.status === 'published';
  await savePlanning({
    restaurantId: input.restaurantId,
    weekStart: input.weekStart,
    status: input.status,
    shifts: input.shifts.map((shift) => ({
      employee_id: shift.employeeId,
      weekday: shift.weekday,
      service_key: shift.serviceKey,
      area_id: shift.areaId || null,
      job_function_id: shift.jobFunctionId || null,
      starts_at: shift.startsAt || null,
      ends_at: shift.endsAt || null,
      source: shift.source
    })),
    notes: input.notes.map((note) => ({
      weekday: note.weekday,
      service_key: note.serviceKey,
      note: note.note
    })),
    expectedRevision: input.expectedRevision,
    allowCoverageGaps: publishing && input.allowCoverageGaps,
    allowConflicts: publishing && input.allowConflicts,
    reason: publishing
      ? 'Weekly schedule reviewed and published.'
      : input.wasPublished
        ? 'Published schedule reopened for changes.'
        : 'Draft schedule saved.'
  });
  await refreshSchedule(input.restaurantId, input.weekStart);
}

/** The leave request covering this slot, if one is still open. */
export function leaveForSlot(
  slot: PlanningGridSlot,
  absences: Array<{
    id: string;
    employee_id: string;
    start_date: string;
    end_date: string;
    service_key: string | null;
    status: string;
  }>,
  statuses: string[]
) {
  const absenceId = planningRequestIdentity(slot.context, 'absence');
  return absences.find(
    (item) =>
      item.id === absenceId &&
      item.employee_id === slot.employeeId &&
      item.start_date <= slot.date &&
      item.end_date >= slot.date &&
      (!item.service_key || item.service_key === slot.serviceKey) &&
      statuses.includes(item.status)
  );
}

/** The fixed-schedule change covering this slot, if one is still open. */
export function exceptionForSlot(
  slot: PlanningGridSlot,
  exceptions: Array<{
    id: string;
    employee_id: string;
    start_date: string;
    end_date: string;
    service_key: string | null;
    status: string;
  }>
) {
  const exceptionId = planningRequestIdentity(slot.context, 'work_pattern_exception');
  return exceptions.find(
    (item) =>
      item.id === exceptionId &&
      item.employee_id === slot.employeeId &&
      item.start_date <= slot.date &&
      item.end_date >= slot.date &&
      (!item.service_key || item.service_key === slot.serviceKey) &&
      (item.status === 'pending' || item.status === 'approved')
  );
}

export async function resolveScheduleLeave(input: {
  restaurantId: string;
  slot: PlanningGridSlot;
  absenceId: string;
  action: 'approve' | 'reject' | 'cancel_for_planning';
}): Promise<void> {
  const cancelling = input.action === 'cancel_for_planning';
  await saveAbsence({
    restaurantId: input.restaurantId,
    employeeId: input.slot.employeeId,
    absenceId: input.absenceId,
    action: input.action,
    payload: cancelling
      ? {
          business_date: input.slot.date,
          service_key: input.slot.serviceKey,
          reason: 'Cancelled explicitly while scheduling an overlapping shift.'
        }
      : {
          reason:
            input.action === 'approve' ? 'Approved from Schedule.' : 'Rejected from Schedule.'
        }
  });
  await refreshSchedule(input.restaurantId, mondayFor(input.slot.date));
}

export async function resolveScheduleException(input: {
  restaurantId: string;
  slot: PlanningGridSlot;
  exceptionId: string;
  action: 'approve' | 'reject' | 'cancel_for_planning';
}): Promise<void> {
  await saveWorkPatternException({
    restaurantId: input.restaurantId,
    employeeId: input.slot.employeeId,
    workPatternExceptionId: input.exceptionId,
    action: input.action,
    payload: {
      reason:
        input.action === 'approve'
          ? 'Approved from Schedule.'
          : input.action === 'reject'
            ? 'Rejected from Schedule.'
            : 'Cancelled explicitly while scheduling an overlapping shift.',
      manager_comment:
        input.action === 'approve'
          ? 'Approved from Schedule.'
          : input.action === 'reject'
            ? 'Rejected from Schedule.'
            : undefined
    }
  });
  await refreshSchedule(input.restaurantId, mondayFor(input.slot.date));
}
