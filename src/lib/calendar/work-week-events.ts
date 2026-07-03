// Human labels for the official work-week lifecycle events shown in the audited
// timeline. Only meaningful business events are logged to work_week_events —
// never draft edits, never employee read/seen tracking.
const LABELS: Record<string, string> = {
  planning_published: 'Schedule published',
  planning_finalized: 'Schedule finalized',
  planning_reverted: 'Schedule reverted to draft',
  actuals_approved: 'Timesheet approved',
  actuals_reopened: 'Timesheet reopened for correction'
};

export function workWeekEventLabel(eventType: string): string {
  return LABELS[eventType] ?? eventType.replaceAll('_', ' ');
}
