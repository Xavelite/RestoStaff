import type { ManagerOperationsReadModel } from '../api/workspace-snapshot';
import {
  SERVICES,
  WEEKDAYS,
  dateForWeekday,
  formatHours,
  hoursBetweenClocks,
  hoursBetweenInstants,
  mondayFor,
  serviceLabel,
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
import type { FourMetrics, MetricDetailRow } from '../ui/metric.ts';

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

function isService(value: string): value is ServiceKey {
  return value === 'lunch' || value === 'evening';
}

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

export function actualSlotsForDate(
  snapshot: ManagerOperationsReadModel,
  date: string,
  today: string
): ActualSlot[] {
  const timezone = snapshot.restaurant_settings.timezone || 'Europe/Brussels';
  const weekStart = mondayFor(date);
  const day = weekday(date);
  const employees = snapshot.employees.filter((employee) => employee.active);
  const published =
    snapshot.work_weeks.find((week) => week.week_start === weekStart)?.planning_status ===
    'published';
  const planned = published
    ? snapshot.planned_shifts.filter(
        (shift) => shift.week_start === weekStart && shift.weekday === day
      )
    : [];
  const entries = snapshot.time_entries.filter(
    (entry) => entry.business_date === date && entry.status !== 'cancelled'
  );

  return employees.flatMap((employee) =>
    SERVICES.map((serviceKey) => {
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
        plan: plan
          ? {
              id: plan.id,
              startsAt: String(plan.starts_at).slice(0, 5),
              endsAt: String(plan.ends_at).slice(0, 5),
              area:
                (snapshot.work_areas ?? []).find((area) => area.id === plan.area_id)?.name ??
                'Any area'
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
            ? `${String(plan.starts_at).slice(0, 5)}–${String(plan.ends_at).slice(0, 5)}`
            : '',
        entryId: entry?.id ?? null,
        clockInAt: entry?.clock_in_at ?? null,
        clockOutAt: entry?.clock_out_at ?? null,
        entryRevision: entry ? Number(entry.revision) : null,
        grossHours: entryGrossHours,
        breakMinutes,
        actualRange: clockIn ? `${clockIn}–${clockOut || 'live'}` : '',
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
  today: string
) {
  const dates = Array.from({ length: 7 }, (_, index) =>
    dateForWeekday(weekStart, index + 1)
  );
  const slots = dates.flatMap((date) => actualSlotsForDate(snapshot, date, today));
  const actualHours = slots.reduce((sum, slot) => sum + slot.actualHours, 0);
  const published =
    snapshot.work_weeks.find((week) => week.week_start === weekStart)?.planning_status ===
    'published';
  const plannedHours = published
    ? snapshot.planned_shifts
        .filter((shift) => shift.week_start === weekStart)
        .reduce(
          (sum, shift) => sum + hoursBetweenClocks(shift.starts_at, shift.ends_at),
          0
        )
    : 0;
  return {
    actualHours,
    plannedHours,
    missing: slots.filter((slot) => slot.status === 'missing').length,
    live: slots.filter((slot) => slot.status === 'live').length,
    adjusted: slots.filter((slot) => slot.status === 'adjusted').length,
    conflicts: slots.filter((slot) => slot.status === 'conflict').length
  };
}

// Weekly board for Actuals: employees as rows, Mon–Sun columns, lunch/evening
// service slots. Reuses actualSlotsForDate; returns the grid plus a key→slot map
// so the page can open the selected slot's editor.
export function buildActualsWeek(input: {
  snapshot: ManagerOperationsReadModel;
  weekStart: string;
  today: string;
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
      .flatMap((date) => actualSlotsForDate(input.snapshot, date, input.today))
      .map((slot) => [slot.key, slot] as const)
  );

  const jobFunctionName = new Map(
    input.snapshot.job_functions.map((job) => [job.id, job.name])
  );

  const rows: WeekRow[] = input.snapshot.employees
    .filter((employee) => employee.active)
    .map((employee) => {
      let weekHours = 0;
      const cells: WeekCell[] = dates.map((date) => {
        const slots: WeekSlot[] = SERVICES.map((serviceKey) => {
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

// The four headline Actuals metrics (CONTRACTS.md §3): badge truth, actual
// hours, planned-vs-actual variance and missing clock-outs. Shaped here from
// the week grid + totals so the route only renders them.
export function actualsMetrics(input: {
  grid: ReturnType<typeof buildActualsWeek>;
  totals: ReturnType<typeof actualsWeekTotals>;
}): FourMetrics {
  const { grid, totals } = input;
  const variance = totals.actualHours - totals.plannedHours;
  return [
    {
      id: 'actuals-hours',
      label: 'Actual hours',
      value: `${totals.actualHours.toFixed(1)}h`,
      meta: `vs ${totals.plannedHours.toFixed(1)}h planned`,
      tone: 'info',
      symbol: '⏱',
      href: '/actuals',
      detail: {
        title: 'Actual hours',
        subtitle: 'Badged time versus the published plan',
        rows: [
          { id: 'actual', title: 'Actual hours', value: `${totals.actualHours.toFixed(1)}h`, tone: 'info' },
          { id: 'planned', title: 'Planned hours', value: `${totals.plannedHours.toFixed(1)}h`, tone: 'neutral' },
          {
            id: 'variance',
            title: 'Variance',
            value: `${variance >= 0 ? '+' : ''}${variance.toFixed(1)}h`,
            tone: Math.abs(variance) > 0.25 ? 'warning' : 'success'
          }
        ],
        actions: [{ id: 'open-actuals', label: 'Open Actuals', href: '/actuals', tone: 'primary' }]
      }
    },
    {
      id: 'actuals-variance',
      label: 'Variance',
      value: `${variance >= 0 ? '+' : ''}${variance.toFixed(1)}h`,
      meta: totals.conflicts
        ? `${totals.conflicts} conflict${totals.conflicts === 1 ? '' : 's'} to resolve`
        : totals.adjusted
          ? `${totals.adjusted} correction${totals.adjusted === 1 ? '' : 's'}`
          : 'Planned vs actual',
      tone: totals.conflicts ? 'danger' : Math.abs(variance) > 0.25 ? 'warning' : 'success',
      symbol: '±',
      href: '/actuals',
      detail: {
        title: 'Variance & corrections',
        subtitle: 'Manager-adjusted entries this week',
        empty: 'No corrections recorded this week.',
        rows: [...grid.slotsByKey.values()]
          .filter((slot) => slot.status === 'adjusted' || slot.status === 'conflict')
          .map((slot): MetricDetailRow => ({
            id: slot.key,
            title: grid.rows.find((row) => row.id === slot.employeeId)?.name ?? 'Employee',
            meta: `${slot.date} · ${serviceLabel(slot.serviceKey)}`,
            value: slot.status === 'conflict' ? 'Conflict' : 'Adjusted',
            tone: slot.status === 'conflict' ? 'danger' : 'warning'
          })),
        actions: [{ id: 'open-actuals', label: 'Open Actuals', href: '/actuals', tone: 'primary' }]
      }
    },
    {
      id: 'actuals-missing-badges',
      label: 'Missing badges',
      value: String(totals.missing),
      meta: totals.missing ? 'Started shifts, no clock-in' : 'All planned shifts badged',
      tone: totals.missing ? 'warning' : 'success',
      symbol: totals.missing ? '!' : '✓',
      href: '/actuals',
      detail: {
        title: 'Missing badges',
        subtitle: 'Planned shifts with no clock-in',
        empty: 'Every planned shift has a badge.',
        rows: [...grid.slotsByKey.values()]
          .filter((slot) => slot.status === 'missing')
          .map((slot): MetricDetailRow => ({
            id: slot.key,
            title: grid.rows.find((row) => row.id === slot.employeeId)?.name ?? 'Employee',
            meta: `${slot.date} · ${serviceLabel(slot.serviceKey)}`,
            tone: 'warning'
          })),
        actions: [{ id: 'open-actuals', label: 'Open Actuals', href: '/actuals', tone: 'primary' }]
      }
    },
    {
      id: 'actuals-live-badges',
      label: 'Live badges',
      value: String(totals.live),
      meta: totals.live ? 'Currently clocked in' : 'No open clock-ins',
      tone: totals.live ? 'info' : 'neutral',
      symbol: '●',
      href: '/actuals',
      detail: {
        title: 'Live badges',
        subtitle: 'Employees currently clocked in',
        empty: 'No one is clocked in right now.',
        rows: [...grid.slotsByKey.values()]
          .filter((slot) => slot.status === 'live')
          .map((slot): MetricDetailRow => ({
            id: slot.key,
            title: grid.rows.find((row) => row.id === slot.employeeId)?.name ?? 'Employee',
            meta: `${slot.date} · ${serviceLabel(slot.serviceKey)}`,
            value: 'Live',
            tone: 'info'
          })),
        actions: [{ id: 'open-actuals', label: 'Open Actuals', href: '/actuals', tone: 'primary' }]
      }
    }
  ];
}
