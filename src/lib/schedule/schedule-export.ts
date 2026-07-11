import type { ManagerOperationsReadModel } from '$lib/api/workspace-snapshot';
import { addDays, clockMinutes, serviceLabel } from '$lib/calendar/date';
import { planningFieldLabel } from './schedule-export-columns';
import type { PlanningNoteDraft, PlanningShiftDraft } from './schedule-model';

export type PlanningCsv = {
  filename: string;
  headers: string[];
  rows: string[][];
};

// Planned-schedule CSV. Every column is real planned data (planned_shifts +
// lookups) — no worked-time or payroll truth lives here.
export function planningCsv(input: {
  snapshot: ManagerOperationsReadModel;
  activeWeek: string;
  draft: PlanningShiftDraft[];
  notes: PlanningNoteDraft[];
  columns: string[];
}): PlanningCsv {
  const employeeName = new Map(
    input.snapshot.employees.map((employee) => [employee.id, employee.display_name])
  );
  const areaName = new Map(input.snapshot.work_areas.map((area) => [area.id, area.name]));
  const jobName = new Map(input.snapshot.job_functions.map((job) => [job.id, job.name]));
  const noteFor = new Map(input.notes.map((note) => [`${note.weekday}|${note.serviceKey}`, note.note]));

  const value = (shift: PlanningShiftDraft, column: string): string => {
    switch (column) {
      case 'employee':
        return employeeName.get(shift.employeeId) ?? shift.employeeId;
      case 'date':
        return addDays(input.activeWeek, shift.weekday - 1);
      case 'service':
        return serviceLabel(shift.serviceKey);
      case 'start':
        return shift.startsAt ?? '';
      case 'end':
        return shift.endsAt ?? '';
      case 'hours': {
        const start = clockMinutes(shift.startsAt);
        const end = clockMinutes(shift.endsAt);
        if (start === null || end === null) return '';
        const minutes = (end - start + 1440) % 1440;
        return (minutes / 60).toFixed(2);
      }
      case 'area':
        return areaName.get(shift.areaId) ?? '';
      case 'position':
        return jobName.get(shift.jobFunctionId) ?? '';
      case 'note':
        return noteFor.get(`${shift.weekday}|${shift.serviceKey}`) ?? '';
      default:
        return '';
    }
  };

  return {
    filename: `planning-${input.activeWeek}.csv`,
    headers: input.columns.map((column) => planningFieldLabel(column)),
    rows: input.draft.map((shift) => input.columns.map((column) => value(shift, column)))
  };
}
