import type { ManagerOperationsReadModel } from '../api/workspace-snapshot.ts';
import {
  dateForWeekday,
  hoursBetweenClocks,
  hoursBetweenInstants,
  serviceLabel
} from '../calendar/date.ts';
import { instantClockLabel } from '../calendar/service-slot.ts';
import { areaInstanceLabelMap } from '../restaurant/area-instance.ts';
import { planningFieldLabel } from '../schedule/schedule-export-columns.ts';

export type ExportFile = {
  filename: string;
  headers: string[];
  rows: Array<Array<string | number>>;
};

type ExportRange = {
  from: string;
  to: string;
};

type Translate = (value: string) => string;

function inRange(value: string, range: ExportRange): boolean {
  return value >= range.from && value <= range.to;
}

function decimalHours(value: number): string {
  return value.toFixed(2);
}

function plannedDate(shift: ManagerOperationsReadModel['planned_shifts'][number]): string {
  return dateForWeekday(shift.week_start, shift.weekday);
}

/**
 * The saved manager planning is the source for this operational file. That
 * deliberately includes saved, unpublished changes; the employee-visible
 * publication snapshot remains available separately in the schedule model.
 */
export function planningPeriodCsv(input: {
  snapshot: ManagerOperationsReadModel;
  range: ExportRange;
  translate?: Translate;
}): ExportFile {
  const translate = input.translate ?? ((value: string) => value);
  const employeeName = new Map(
    input.snapshot.employees.map((employee) => [employee.id, employee.display_name])
  );
  const areaName = areaInstanceLabelMap(input.snapshot.work_areas);
  const positionName = new Map(
    input.snapshot.job_functions.map((position) => [position.id, position.name])
  );
  const columns = ['employee', 'date', 'service', 'start', 'end', 'hours', 'area', 'position'];
  const shifts = input.snapshot.planned_shifts
    .map((shift) => ({ shift, date: plannedDate(shift) }))
    .filter(({ date }) => inRange(date, input.range))
    .sort(
      (left, right) =>
        left.date.localeCompare(right.date) ||
        (employeeName.get(left.shift.employee_id) ?? '').localeCompare(
          employeeName.get(right.shift.employee_id) ?? ''
        ) ||
        left.shift.service_key.localeCompare(right.shift.service_key)
    );

  return {
    filename: `planning-${input.range.from}-${input.range.to}.csv`,
    headers: columns.map((column) => translate(planningFieldLabel(column))),
    rows: shifts.map(({ shift, date }) => [
      employeeName.get(shift.employee_id) ?? shift.employee_id,
      date,
      translate(serviceLabel(shift.service_key)),
      String(shift.starts_at ?? '').slice(0, 5),
      String(shift.ends_at ?? '').slice(0, 5),
      decimalHours(hoursBetweenClocks(shift.starts_at, shift.ends_at)),
      areaName.get(shift.area_id ?? '') ?? '',
      positionName.get(shift.job_function_id ?? '') ?? ''
    ])
  };
}

function statusLabel(status: string): string {
  if (status === 'closed') return 'Worked';
  if (status === 'adjusted') return 'Corrected';
  if (status === 'open') return 'Open';
  return status.replaceAll('_', ' ');
}

/**
 * A transparent operational timesheet file: open rows remain visible and
 * therefore have blank duration cells instead of silently disappearing.
 */
export function workedTimeCsv(input: {
  snapshot: ManagerOperationsReadModel;
  range: ExportRange;
  timezone: string;
  translate?: Translate;
}): ExportFile {
  const translate = input.translate ?? ((value: string) => value);
  const employeeName = new Map(
    input.snapshot.employees.map((employee) => [employee.id, employee.display_name])
  );
  const areaName = areaInstanceLabelMap(input.snapshot.work_areas);
  const positionName = new Map(
    input.snapshot.job_functions.map((position) => [position.id, position.name])
  );
  const planById = new Map(
    input.snapshot.planned_shifts.map((shift) => [shift.id, shift])
  );
  const entries = input.snapshot.time_entries
    .filter(
      (entry) =>
        entry.status !== 'cancelled' &&
        inRange(entry.business_date, input.range)
    )
    .sort(
      (left, right) =>
        left.business_date.localeCompare(right.business_date) ||
        (employeeName.get(left.employee_id) ?? '').localeCompare(
          employeeName.get(right.employee_id) ?? ''
        ) ||
        left.service_key.localeCompare(right.service_key)
    );

  return {
    filename: `worked-time-${input.range.from}-${input.range.to}.csv`,
    headers: [
      'Employee',
      'Date',
      'Service',
      'Clock in',
      'Clock out',
      'Gross hours',
      'Break minutes',
      'Worked hours',
      'Area',
      'Position',
      'Status'
    ].map(translate),
    rows: entries.map((entry) => {
      const plan = entry.planned_shift_id ? planById.get(entry.planned_shift_id) : undefined;
      const complete = Boolean(entry.clock_in_at && entry.clock_out_at);
      const gross = complete ? hoursBetweenInstants(entry.clock_in_at, entry.clock_out_at) : 0;
      const worked = Math.max(0, gross - Math.max(0, entry.break_minutes) / 60);
      return [
        employeeName.get(entry.employee_id) ?? entry.employee_id,
        entry.business_date,
        translate(serviceLabel(entry.service_key)),
        instantClockLabel(entry.clock_in_at, input.timezone),
        instantClockLabel(entry.clock_out_at, input.timezone),
        complete ? decimalHours(gross) : '',
        entry.break_minutes,
        complete ? decimalHours(worked) : '',
        areaName.get(entry.actual_area_id ?? plan?.area_id ?? '') ?? '',
        positionName.get(entry.actual_job_function_id ?? plan?.job_function_id ?? '') ?? '',
        translate(statusLabel(entry.status))
      ];
    })
  };
}
