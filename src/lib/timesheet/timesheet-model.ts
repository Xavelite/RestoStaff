import type { ManagerOperationsReadModel } from '../api/workspace-snapshot';
import {
  WEEKDAYS,
  dateForWeekday,
  formatHours,
  hoursBetweenClocks,
  hoursBetweenInstants,
  mondayFor,
  serviceLabel,
  serviceKeysWithEvidence,
  weekday,
  type ServiceKey
} from '../calendar/date.ts';
import type { WeekCell, WeekColumn, WeekRow, WeekSlot } from '../calendar/week-grid';
import {
  instantClockLabel,
  projectServiceSlot,
  resolveWorkspaceServiceSlot,
  type ServiceSlotTruth
} from '../calendar/service-slot.ts';
import { areaInstanceLabelMap } from '../restaurant/area-instance.ts';

export type ActualSlot = {
  key: string;
  employeeId: string;
  employeeName: string;
  date: string;
  serviceKey: ServiceKey;
  planned: boolean;
  plannedRange: string;
  entryId: string | null;
  clockInAt: string | null;
  clockOutAt: string | null;
  entryRevision: number | null;
  actualRange: string;
  grossHours: number;
  breakMinutes: number;
  actualJobFunctionId: string;
  actualAreaId: string;
  actualAssignmentSource: string;
  actualHours: number;
  status:
    | 'empty'
    | 'missing'
    | 'live'
    | 'recorded'
    | 'adjusted'
    | 'absence'
    | 'unavailable'
    | 'pending'
    | 'conflict';
  truth: ServiceSlotTruth;
  proof: string;
  proofEdge: 'clock_in' | 'clock_out' | null;
};

function proofLabel(status: string | null): string {
  const labels: Record<string, string> = {
    captured: 'Photo captured',
    denied: 'Camera permission denied',
    unavailable: 'Camera unavailable',
    failed: 'Photo capture failed',
    waived: 'Photo waived',
    not_required: 'Photo not required',
    missing: 'No photo'
  };
  return labels[status ?? ''] ?? '';
}

function grossHours(entry: ManagerOperationsReadModel['time_entries'][number] | undefined): number {
  return hoursBetweenInstants(entry?.clock_in_at, entry?.clock_out_at);
}

function netHours(entry: ManagerOperationsReadModel['time_entries'][number] | undefined): number {
  const gross = grossHours(entry);
  const breakMinutes = Number(entry?.break_minutes ?? 0);
  return Math.max(0, gross - Math.max(0, breakMinutes) / 60);
}

export function actualsStatusForWeek(
  snapshot: ManagerOperationsReadModel,
  weekStart: string
): 'open' | 'approved' | 'locked' {
  const status = snapshot.work_weeks.find(
    (week) => week.week_start === weekStart
  )?.actuals_status;
  return status === 'approved' || status === 'locked' ? status : 'open';
}

export function actualsServiceKeysForWeek(
  snapshot: ManagerOperationsReadModel,
  weekStart: string
): ServiceKey[] {
  const weekEnd = dateForWeekday(weekStart, 7);
  const publishedShifts = snapshot.published_planned_shifts ?? snapshot.planned_shifts;
  return serviceKeysWithEvidence(snapshot.services, [
    ...publishedShifts
      .filter((shift) => shift.week_start === weekStart)
      .map((shift) => shift.service_key),
    ...snapshot.time_entries
      .filter(
        (entry) =>
          entry.business_date >= weekStart &&
          entry.business_date <= weekEnd &&
          entry.status !== 'cancelled'
      )
      .map((entry) => entry.service_key)
  ]);
}

export function actualSlotsForDate(
  snapshot: ManagerOperationsReadModel,
  date: string,
  today: string,
  asOf = new Date()
): ActualSlot[] {
  const areaName = areaInstanceLabelMap(snapshot.work_areas ?? []);
  const timezone = snapshot.restaurant_settings.timezone || 'Europe/Brussels';
  const weekStart = mondayFor(date);
  const day = weekday(date);
  const employees = snapshot.employees.filter((employee) => employee.active);
  // Timesheet follows the canonical employee-visible baseline. Older cached
  // snapshots fall back to their only planning collection until refreshed.
  const publishedShifts = snapshot.published_planned_shifts ?? snapshot.planned_shifts;
  const planned = publishedShifts.filter(
    (shift) => shift.week_start === weekStart && shift.weekday === day
  );
  const entries = snapshot.time_entries.filter(
    (entry) => entry.business_date === date && entry.status !== 'cancelled'
  );
  const serviceKeys = serviceKeysWithEvidence(snapshot.services, [
    ...planned.map((shift) => shift.service_key),
    ...entries.map((entry) => entry.service_key)
  ]);

  return employees.flatMap((employee) =>
    serviceKeys.map((serviceKey) => {
      const plan = planned.find(
        (shift) =>
          shift.employee_id === employee.id && shift.service_key === serviceKey
      );
      const entry = entries.find(
        (item) =>
          item.employee_id === employee.id && item.service_key === serviceKey
      );
      const truth = resolveWorkspaceServiceSlot({
        snapshot,
        employeeId: employee.id,
        date,
        serviceKey,
        today,
        asOf,
        plan: plan
          ? {
              id: plan.id,
              startsAt: String(plan.starts_at).slice(0, 5),
              endsAt: String(plan.ends_at).slice(0, 5),
              contractBaseline: plan.source === 'template',
              area: areaName.get(plan.area_id ?? '') ?? 'Any area'
            }
          : null
      });
      const clockIn = instantClockLabel(entry?.clock_in_at ?? null, timezone);
      const clockOut = instantClockLabel(entry?.clock_out_at ?? null, timezone);
      const entryGrossHours = grossHours(entry);
      const breakMinutes = Number(entry?.break_minutes ?? 0);
      const actualHours = netHours(entry);
      const status: ActualSlot['status'] =
        truth.state === 'conflict'
          ? 'conflict'
          : truth.state === 'leave_approved'
            ? 'absence'
            : truth.state === 'work_pattern_approved' || truth.state === 'unavailable'
              ? 'unavailable'
              : truth.state === 'leave_pending' || truth.state === 'work_pattern_pending'
                ? 'pending'
                : truth.state === 'live'
                  ? 'live'
                  : truth.state === 'corrected'
                    ? 'adjusted'
                    : truth.state === 'worked'
                      ? 'recorded'
                      : truth.state === 'missing_badge'
                        ? 'missing'
                        : 'empty';
      return {
        key: `${employee.id}|${date}|${serviceKey}`,
        employeeId: employee.id,
        employeeName: employee.display_name,
        date,
        serviceKey,
        planned: Boolean(plan),
        plannedRange:
          plan?.starts_at && plan?.ends_at
            ? `${String(plan.starts_at).slice(0, 5)}-${String(plan.ends_at).slice(0, 5)}`
            : '',
        entryId: entry?.id ?? null,
        clockInAt: entry?.clock_in_at ?? null,
        clockOutAt: entry?.clock_out_at ?? null,
        entryRevision: entry ? Number(entry.revision) : null,
        grossHours: entryGrossHours,
        breakMinutes,
        actualJobFunctionId: entry?.actual_job_function_id ?? plan?.job_function_id ?? '',
        actualAreaId: entry?.actual_area_id ?? plan?.area_id ?? '',
        actualAssignmentSource: entry?.actual_assignment_source ?? (plan ? 'planned_shift' : 'unresolved'),
        actualRange: clockIn ? `${clockIn}-${clockOut || 'live'}` : '',
        actualHours,
        status,
        truth,
        proof:
          proofLabel(entry?.clock_out_photo_status ?? null) ||
          proofLabel(entry?.clock_in_photo_status ?? null),
        proofEdge: entry?.clock_out_photo_status
          ? 'clock_out'
          : entry?.clock_in_photo_status
            ? 'clock_in'
            : null
      };
    })
  );
}

export function actualsWeekTotals(
  snapshot: ManagerOperationsReadModel,
  weekStart: string,
  today: string,
  asOf = new Date()
) {
  const dates = Array.from({ length: 7 }, (_, index) =>
    dateForWeekday(weekStart, index + 1)
  );
  const slots = dates.flatMap((date) => actualSlotsForDate(snapshot, date, today, asOf));
  const actualHours = slots.reduce((sum, slot) => sum + slot.actualHours, 0);
  const publishedShifts = snapshot.published_planned_shifts ?? snapshot.planned_shifts;
  const plannedHours = publishedShifts
    .filter((shift) => shift.week_start === weekStart)
    .reduce((sum, shift) => sum + hoursBetweenClocks(shift.starts_at, shift.ends_at), 0);
  return {
    actualHours,
    plannedHours,
    missing: slots.filter((slot) => slot.status === 'missing').length,
    live: slots.filter((slot) => slot.status === 'live').length,
    adjusted: slots.filter((slot) => slot.status === 'adjusted').length,
    conflicts: slots.filter((slot) => slot.status === 'conflict').length
  };
}

// Weekly board for Actuals: employees as rows, Mon-Sun columns, lunch/evening
// service slots. Reuses actualSlotsForDate; returns the grid plus a key-to-slot map
// so the page can open the selected slot's editor.
export function buildActualsWeek(input: {
  snapshot: ManagerOperationsReadModel;
  weekStart: string;
  today: string;
  asOf?: Date;
}): { days: WeekColumn[]; rows: WeekRow[]; slotsByKey: Map<string, ActualSlot> } {
  const dates = Array.from({ length: 7 }, (_, index) =>
    dateForWeekday(input.weekStart, index + 1)
  );
  const days: WeekColumn[] = dates.map((date, index) => ({
    weekday: index + 1,
    label: WEEKDAYS[index],
    date,
    today: date === input.today,
    past: date < input.today
  }));

  const slotsByKey = new Map(
    dates
      .flatMap((date) => actualSlotsForDate(input.snapshot, date, input.today, input.asOf))
      .map((slot) => [slot.key, slot] as const)
  );

  const jobFunctionName = new Map(
    input.snapshot.job_functions.map((job) => [job.id, job.name])
  );
  const serviceKeys = actualsServiceKeysForWeek(input.snapshot, input.weekStart);

  const rows: WeekRow[] = input.snapshot.employees
    .filter((employee) => employee.active)
    .map((employee) => {
      let weekHours = 0;
      const cells: WeekCell[] = dates.map((date) => {
        const slots: WeekSlot[] = serviceKeys.map((serviceKey) => {
          const key = `${employee.id}|${date}|${serviceKey}`;
          const slot = slotsByKey.get(key);
          if (slot) weekHours += slot.actualHours;
          return {
            key,
            serviceKey,
            presentation: slot
              ? projectServiceSlot(slot.truth, 'actuals')
              : { background: 'neutral', card: null }
          };
        });
        return { date, slots };
      });
      return {
        id: employee.id,
        name: employee.display_name,
        meta:
          jobFunctionName.get(
            (input.snapshot.employee_job_functions ?? []).find(
              (row) => row.employee_id === employee.id && row.is_primary && row.active
            )?.job_function_id ?? ''
          ) || '',
        total: formatHours(weekHours),
        cells
      };
    });

  return { days, rows, slotsByKey };
}
