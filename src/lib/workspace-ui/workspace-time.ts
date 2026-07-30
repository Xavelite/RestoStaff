import type { ActualSlot } from '../timesheet/timesheet-model.ts';

/**
 * Presentation vocabulary for a worked-time slot in the workspace design.
 *
 * The state itself is decided by the shared slot projection; this only decides
 * how it is written down — a word, plus a tone that is always paired with a
 * symbol so colour is never the only signal.
 */
type WorkspaceSlotTone = 'info' | 'ok' | 'attention' | 'problem';

const SLOT_LABELS: Record<ActualSlot['status'], string> = {
  empty: 'Scheduled',
  missing: 'Missing badge',
  live: 'Working now',
  recorded: 'Worked',
  adjusted: 'Corrected',
  absence: 'Time off',
  unavailable: 'Not scheduled',
  pending: 'Pending request',
  conflict: 'Conflict'
};

const SLOT_TONES: Record<ActualSlot['status'], WorkspaceSlotTone> = {
  empty: 'info',
  missing: 'problem',
  live: 'ok',
  recorded: 'ok',
  adjusted: 'attention',
  absence: 'ok',
  unavailable: 'ok',
  pending: 'attention',
  conflict: 'problem'
};

export function slotLabel(status: ActualSlot['status']): string {
  return SLOT_LABELS[status];
}

export function slotTone(status: ActualSlot['status']): WorkspaceSlotTone {
  return SLOT_TONES[status];
}

/**
 * The slots worth listing on a timesheet: anything planned or recorded.
 * Empty slots are the majority — every employee has two per day — and listing
 * them would bury the real rows.
 */
export function isTimesheetRow(slot: ActualSlot): boolean {
  return slot.planned || slot.status !== 'empty';
}

/** Rows that stop the week being approved, or that a manager should look at. */
export function needsAttention(slot: ActualSlot): boolean {
  return (
    slot.status === 'missing' ||
    slot.status === 'adjusted' ||
    slot.status === 'pending' ||
    slot.status === 'conflict'
  );
}
