import { saveAbsence, saveActuals } from '$lib/api/mutations';
import { workspaceRealtime } from '$lib/realtime/workspace-realtime.svelte';
import { workspace } from '$lib/workspace/workspace.svelte';
import { addDays, localInputToInstant } from '$lib/calendar/date';
import type { ActualSlot } from './timesheet-model.ts';

/**
 * The audited Timesheet mutations, in one place.
 *
 * Both designs drive the same worked-time corrections, so the payload shapes —
 * expected_revision, reason, payroll evidence — are defined once rather than
 * copied per shell, where they could drift out of sync with the RPC contract.
 * Callers own their own feedback and dialog handling; errors propagate.
 */
export type TimesheetEntryValues = {
  clockInAt: string;
  clockOutAt: string;
  breakMinutes: number;
  actualJobFunctionId: string;
  actualAreaId: string;
  breakIntervals: Array<{ started_at: string; ended_at: string }>;
  reason: string;
  isCorrection: boolean;
};

async function refreshTimesheet(restaurantId: string): Promise<void> {
  await workspace.reloadOperations();
  await workspaceRealtime.publish('actuals-updated', { restaurantId, source: 'actuals' });
}

async function persistTimesheetEntry(input: {
  restaurantId: string;
  slot: ActualSlot;
  values: TimesheetEntryValues;
}): Promise<void> {
  const { restaurantId, slot, values } = input;
  await saveActuals({
    restaurantId,
    action: values.isCorrection ? 'adjust_entry' : 'manual_entry',
    payload: {
      employee_id: slot.employeeId,
      business_date: slot.date,
      service_key: slot.serviceKey,
      time_entry_id: slot.entryId ?? undefined,
      clock_in_at: values.clockInAt,
      clock_out_at: values.clockOutAt || undefined,
      break_minutes: values.breakMinutes,
      actual_job_function_id: values.actualJobFunctionId,
      actual_area_id: values.actualAreaId,
      break_intervals: values.breakIntervals,
      expected_revision: slot.entryRevision ?? undefined,
      reason: values.reason
    }
  });
}

export async function saveTimesheetEntry(input: {
  restaurantId: string;
  slot: ActualSlot;
  values: TimesheetEntryValues;
}): Promise<void> {
  await persistTimesheetEntry(input);
  await refreshTimesheet(input.restaurantId);
}

/**
 * Record every missing planned service for one employee/day in one action.
 * Each service remains its own audited entry, so time between services is not
 * accidentally counted as work.
 */
export async function recordPlannedTimesheetDay(input: {
  restaurantId: string;
  slots: ActualSlot[];
  timezone: string;
}): Promise<number> {
  const candidates = input.slots.filter(
    (slot) =>
      slot.status === 'missing' &&
      slot.planned &&
      !slot.entryId &&
      Boolean(slot.plannedRange)
  );
  let recorded = 0;
  for (const slot of candidates) {
    const [start = '', end = ''] = slot.plannedRange.split('-');
    if (!start || !end || !slot.actualJobFunctionId || !slot.actualAreaId) continue;
    const nextDay = end <= start ? addDays(slot.date, 1) : slot.date;
    const clockInAt = localInputToInstant(`${slot.date}T${start}`, input.timezone);
    const clockOutAt = localInputToInstant(`${nextDay}T${end}`, input.timezone);
    if (!clockInAt || !clockOutAt) continue;
    await persistTimesheetEntry({
      restaurantId: input.restaurantId,
      slot,
      values: {
        clockInAt,
        clockOutAt,
        breakMinutes: 0,
        actualJobFunctionId: slot.actualJobFunctionId,
        actualAreaId: slot.actualAreaId,
        breakIntervals: [],
        reason: 'Recorded from the published schedule.',
        isCorrection: false
      }
    });
    recorded += 1;
  }
  if (recorded) await refreshTimesheet(input.restaurantId);
  return recorded;
}

export async function cancelTimesheetEntry(input: {
  restaurantId: string;
  slot: ActualSlot;
  reason: string;
}): Promise<void> {
  const { restaurantId, slot, reason } = input;
  if (!slot.entryId) return;
  await saveActuals({
    restaurantId,
    action: 'cancel_entry',
    payload: {
      employee_id: slot.employeeId,
      business_date: slot.date,
      service_key: slot.serviceKey,
      time_entry_id: slot.entryId,
      expected_revision: slot.entryRevision ?? undefined,
      reason
    }
  });
  await refreshTimesheet(restaurantId);
}

export async function setTimesheetWeekStatus(input: {
  restaurantId: string;
  weekStart: string;
  action: 'approve_week' | 'reopen_week';
  expectedRevision: number;
  reason: string;
  /** Conflicts, missing badges and an unfinished week are confirmable
      warnings, not hard blocks (a live clock-in still is, server-side). */
  allowWarnings: boolean;
}): Promise<void> {
  await saveActuals({
    restaurantId: input.restaurantId,
    action: input.action,
    payload: {
      week_start: input.weekStart,
      expected_revision: input.expectedRevision,
      reason: input.reason,
      allow_warnings: input.action === 'approve_week' && input.allowWarnings
    }
  });
  await refreshTimesheet(input.restaurantId);
}

export async function resolveTimesheetLeave(input: {
  restaurantId: string;
  slot: ActualSlot;
  action: 'approve' | 'reject';
}): Promise<void> {
  const absence = input.slot.truth.absence;
  if (!absence || absence.status !== 'pending') return;
  await saveAbsence({
    restaurantId: input.restaurantId,
    employeeId: input.slot.employeeId,
    absenceId: absence.id,
    action: input.action,
    payload: {
      reason: input.action === 'approve' ? 'Approved from Timesheet.' : 'Rejected from Timesheet.'
    }
  });
  await refreshTimesheet(input.restaurantId);
}
