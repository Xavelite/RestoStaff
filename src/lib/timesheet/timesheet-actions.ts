import { saveAbsence, saveActuals } from '$lib/api/mutations';
import { saveTimeEntryPayrollEvidence } from '$lib/payroll/payroll-api';
import { workspaceRealtime } from '$lib/realtime/workspace-realtime.svelte';
import { workspace } from '$lib/workspace/workspace.svelte';
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

export async function saveTimesheetEntry(input: {
  restaurantId: string;
  slot: ActualSlot;
  values: TimesheetEntryValues;
}): Promise<void> {
  const { restaurantId, slot, values } = input;
  const acknowledgement = await saveActuals({
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
      expected_revision: slot.entryRevision ?? undefined,
      reason: values.reason
    }
  });
  // Payroll evidence only exists once the shift is closed; an open clock-in has
  // no worked position or break intervals to record yet.
  const timeEntryId = slot.entryId ?? acknowledgement.entityId;
  if (values.clockOutAt && timeEntryId) {
    await saveTimeEntryPayrollEvidence({
      restaurantId,
      timeEntryId,
      actualJobFunctionId: values.actualJobFunctionId,
      actualAreaId: values.actualAreaId,
      breakIntervals: values.breakIntervals,
      reason: values.reason
    });
  }
  await refreshTimesheet(restaurantId);
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
