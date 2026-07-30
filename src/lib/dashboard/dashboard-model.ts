import type { ManagerOperationsReadModel } from '../api/workspace-snapshot.ts';
import { personInitials } from '../ui/person.ts';
import { areaInstanceLabelMap } from '../restaurant/area-instance.ts';
import {
  addDays,
  addMonths,
  clockLabel,
  dateForWeekday,
  hoursBetweenClocks,
  instantToLocalInput,
  localInputToInstant,
  mondayFor,
  monthStart,
  serviceLabel,
} from '../calendar/date.ts';

export type InsightPeriod = 'week' | 'month' | 'year';
export type ComparisonMode = 'previous' | 'year';
export type Regime = 'flexi' | 'fixed' | 'manager';
export type WorkforceFilter = 'all' | Regime;

export type InsightFilters = {
  workforce: WorkforceFilter;
  employeeId: string;
  areaId: string;
  serviceKey: string;
};

export type DateRange = {
  from: string;
  to: string;
  label: string;
};

export type InsightBucket = {
  key: string;
  label: string;
  shortLabel: string;
  planned: number;
  worked: number;
  comparisonPlanned: number;
  comparisonWorked: number;
  lateCount: number;
  missingCount: number;
  correctionCount: number;
};

export type InsightTotals = {
  planned: number;
  worked: number;
  adherence: number | null;
  headcount: number;
  evaluatedStarts: number;
  lateCount: number;
  lateRate: number | null;
  missingBadges: number;
  corrections: number;
  approvedLeaveDays: number;
};

type ShiftEvidence = {
  id: string;
  employeeId: string;
  date: string;
  serviceKey: string;
  serviceLabel: string;
  areaName: string;
  plannedLabel: string;
  actualLabel: string;
  status: 'planned' | 'worked' | 'late' | 'missing' | 'corrected' | 'open' | 'unplanned' | 'excused';
  lateMinutes: number | null;
};

export type EmployeeInsight = {
  id: string;
  name: string;
  initials: string;
  role: string;
  regime: Regime;
  planned: number;
  worked: number;
  comparisonWorked: number;
  adherence: number | null;
  shifts: number;
  evaluatedStarts: number;
  lateCount: number;
  lateRate: number | null;
  missingBadges: number;
  corrections: number;
  approvedLeaveDays: number;
  tenureMonths: number | null;
  plannedByBucket: number[];
  workedByBucket: number[];
  shiftsEvidence: ShiftEvidence[];
};

export type AreaInsight = {
  id: string;
  name: string;
  planned: number;
  worked: number;
  adherence: number | null;
  issues: number;
};

export type ServiceInsight = {
  key: string;
  label: string;
  planned: number;
  worked: number;
  adherence: number | null;
  lateCount: number;
  missingCount: number;
};

export type PulseCell = {
  weekday: number;
  weekdayLabel: string;
  serviceKey: string;
  serviceLabel: string;
  planned: number;
  worked: number;
  issues: number;
  intensity: number;
};

export type InsightEvent = {
  id: string;
  date: string;
  employeeId: string;
  employeeName: string;
  title: string;
  detail: string;
  tone: 'danger' | 'warning' | 'success' | 'neutral';
};

export type InsightView = {
  period: InsightPeriod;
  currentRange: DateRange;
  comparisonRange: DateRange;
  comparisonMode: ComparisonMode;
  buckets: InsightBucket[];
  current: InsightTotals;
  comparison: InsightTotals;
  employees: EmployeeInsight[];
  areas: AreaInsight[];
  services: ServiceInsight[];
  pulse: PulseCell[];
  events: InsightEvent[];
  flexiHours: number;
  fixedHours: number;
  managerHours: number;
  hasData: boolean;
};

type EmployeeAccumulator = {
  planned: number;
  worked: number;
  shifts: number;
  evaluatedStarts: number;
  lateCount: number;
  missingBadges: number;
  corrections: number;
  approvedLeaveDays: number;
  plannedByBucket: number[];
  workedByBucket: number[];
};

type MutableArea = Omit<AreaInsight, 'adherence'>;
type MutableService = Omit<ServiceInsight, 'adherence'>;

type PeriodAnalysis = {
  bucketKeys: string[];
  bucketLabels: string[];
  bucketShortLabels: string[];
  bucketPlanned: number[];
  bucketWorked: number[];
  bucketLate: number[];
  bucketMissing: number[];
  bucketCorrections: number[];
  totals: InsightTotals;
  employees: Map<string, EmployeeAccumulator>;
  areas: Map<string, MutableArea>;
  services: Map<string, MutableService>;
  evidence: ShiftEvidence[];
  events: InsightEvent[];
  pulse: PulseCell[];
  regimeHours: Record<Regime, number>;
};

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const WORKED_STATUSES = new Set(['closed', 'adjusted']);
const LATE_THRESHOLD_MINUTES = 5;
const HOUR_MS = 3_600_000;

export const regimeLabel: Record<Regime, string> = {
  flexi: 'Flexi',
  fixed: 'Fixed contract',
  manager: 'Management'
};

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

function dateValue(value: string): number {
  return new Date(`${value.slice(0, 10)}T00:00:00Z`).getTime();
}

function dayDifference(from: string, to: string): number {
  return Math.round((dateValue(to) - dateValue(from)) / 86_400_000);
}

function minDate(a: string, b: string): string {
  return a < b ? a : b;
}

function maxDate(a: string, b: string): string {
  return a > b ? a : b;
}

function endOfMonth(value: string): string {
  return addDays(addMonths(monthStart(value), 1), -1);
}

function formatCalendarDate(value: string, locale: string, options: Intl.DateTimeFormatOptions): string {
  return new Intl.DateTimeFormat(locale, { ...options, timeZone: 'UTC' }).format(
    new Date(`${value}T00:00:00Z`)
  );
}

function periodLabel(
  range: Pick<DateRange, 'from' | 'to'>,
  period: InsightPeriod,
  locale: string
): string {
  if (period === 'week') {
    const from = formatCalendarDate(range.from, locale, { day: '2-digit', month: 'short' });
    const to = formatCalendarDate(range.to, locale, { day: '2-digit', month: 'short' });
    return `${from} – ${to}`;
  }
  if (period === 'month') {
    return formatCalendarDate(range.from, locale, { month: 'long', year: 'numeric' });
  }
  return range.from.slice(0, 4);
}

export function insightPeriodRange(
  anchor: string,
  period: InsightPeriod,
  locale = 'en-GB'
): DateRange {
  let from = anchor;
  let to = anchor;
  if (period === 'week') {
    from = mondayFor(anchor);
    to = addDays(from, 6);
  } else if (period === 'month') {
    from = monthStart(anchor);
    to = endOfMonth(anchor);
  } else {
    from = `${anchor.slice(0, 4)}-01-01`;
    to = `${anchor.slice(0, 4)}-12-31`;
  }
  return { from, to, label: periodLabel({ from, to }, period, locale) };
}

export function insightComparisonRange(
  anchor: string,
  period: InsightPeriod,
  mode: ComparisonMode,
  locale = 'en-GB'
): DateRange {
  const current = insightPeriodRange(anchor, period, locale);
  let comparisonAnchor: string;
  if (mode === 'year') comparisonAnchor = addMonths(anchor, -12);
  else if (period === 'week') comparisonAnchor = addDays(anchor, -7);
  else comparisonAnchor = addMonths(anchor, period === 'month' ? -1 : -12);
  const range = insightPeriodRange(comparisonAnchor, period, locale);
  return { ...range, label: range.label || current.label };
}

export function insightReadRanges(
  anchor: string,
  period: InsightPeriod,
  mode: ComparisonMode
): { from: string; to: string }[] {
  const current = insightPeriodRange(anchor, period);
  const comparison = insightComparisonRange(anchor, period, mode);
  const spans = [
    { from: current.from, to: current.to },
    { from: comparison.from, to: comparison.to }
  ].sort((left, right) => left.from.localeCompare(right.from));
  const merged: { from: string; to: string }[] = [];
  for (const span of spans) {
    const previous = merged.at(-1);
    if (previous && span.from <= addDays(previous.to, 1)) {
      previous.to = maxDate(previous.to, span.to);
    } else {
      merged.push({ ...span });
    }
  }
  return merged.flatMap((span) => dashboardReadRanges(span.from, span.to));
}

function dashboardReadRanges(from: string, to: string): { from: string; to: string }[] {
  const ranges: { from: string; to: string }[] = [];
  let cursor = from;
  while (cursor <= to) {
    const chunkTo = addDays(cursor, 62);
    const end = chunkTo < to ? chunkTo : to;
    ranges.push({ from: cursor, to: end });
    cursor = addDays(end, 1);
  }
  return ranges;
}

function rowIdentity(row: object): string {
  return 'id' in row && typeof row.id === 'string' ? row.id : JSON.stringify(row);
}

function mergeRows<T extends object>(models: ManagerOperationsReadModel[], key: keyof ManagerOperationsReadModel): T[] {
  const rows = new Map<string, T>();
  for (const model of models) {
    for (const row of (model[key] as T[] | undefined) ?? []) rows.set(rowIdentity(row), row);
  }
  return [...rows.values()];
}

export function mergeDashboardReadModels(models: ManagerOperationsReadModel[]): ManagerOperationsReadModel {
  const first = models[0];
  if (!first) throw new TypeError('Insights require at least one operations read model.');
  return {
    ...first,
    employees: mergeRows<ManagerOperationsReadModel['employees'][number]>(models, 'employees'),
    employee_contracts: mergeRows<ManagerOperationsReadModel['employee_contracts'][number]>(models, 'employee_contracts'),
    employee_job_functions: mergeRows<ManagerOperationsReadModel['employee_job_functions'][number]>(models, 'employee_job_functions'),
    job_functions: mergeRows<ManagerOperationsReadModel['job_functions'][number]>(models, 'job_functions'),
    planned_shifts: mergeRows<ManagerOperationsReadModel['planned_shifts'][number]>(models, 'planned_shifts'),
    published_planned_shifts: mergeRows<ManagerOperationsReadModel['published_planned_shifts'][number]>(
      models.map((model) => ({
        ...model,
        published_planned_shifts: model.published_planned_shifts ?? model.planned_shifts
      })),
      'published_planned_shifts'
    ),
    time_entries: mergeRows<ManagerOperationsReadModel['time_entries'][number]>(models, 'time_entries'),
    absences: mergeRows<ManagerOperationsReadModel['absences'][number]>(models, 'absences'),
    work_pattern_exceptions: mergeRows<ManagerOperationsReadModel['work_pattern_exceptions'][number]>(
      models,
      'work_pattern_exceptions'
    )
  };
}

function regimeOf(workRegime: string | null | undefined): Regime {
  if (workRegime === 'weekly_availability') return 'flexi';
  if (workRegime === 'manager_only') return 'manager';
  return 'fixed';
}

function currentRegimes(model: ManagerOperationsReadModel): Map<string, Regime> {
  const regimes = new Map<string, Regime>();
  for (const contract of model.employee_contracts) {
    if (contract.is_current) regimes.set(contract.employee_id, regimeOf(contract.work_regime));
  }
  return regimes;
}

function plannedShiftDate(shift: ManagerOperationsReadModel['planned_shifts'][number]): string {
  return shift.weekday >= 1 && shift.weekday <= 7
    ? dateForWeekday(shift.week_start, shift.weekday)
    : shift.week_start;
}

function plannedShiftStartInstant(
  shift: ManagerOperationsReadModel['planned_shifts'][number],
  timezone: string
): number | null {
  if (!shift.starts_at) return null;
  const instant = localInputToInstant(
    `${plannedShiftDate(shift)}T${String(shift.starts_at).slice(0, 5)}`,
    timezone
  );
  const value = new Date(instant).getTime();
  return Number.isFinite(value) ? value : null;
}

function workedHours(entry: ManagerOperationsReadModel['time_entries'][number]): number {
  if (!entry.clock_in_at || !entry.clock_out_at || !WORKED_STATUSES.has(entry.status)) return 0;
  const duration =
    (new Date(entry.clock_out_at).getTime() - new Date(entry.clock_in_at).getTime()) / HOUR_MS -
    (entry.break_minutes ?? 0) / 60;
  return Number.isFinite(duration) && duration > 0 && duration <= 24 ? duration : 0;
}

function monthsSince(start: string, anchor: string): number {
  const a = new Date(`${start.slice(0, 10)}T00:00:00Z`);
  const b = new Date(`${anchor.slice(0, 10)}T00:00:00Z`);
  return Math.max(0, (b.getUTCFullYear() - a.getUTCFullYear()) * 12 + b.getUTCMonth() - a.getUTCMonth());
}

function roleFor(employeeId: string, model: ManagerOperationsReadModel): string {
  const link = model.employee_job_functions.find((row) => row.employee_id === employeeId && row.active);
  return model.job_functions.find((row) => row.id === link?.job_function_id)?.name ?? '';
}

function bucketSpine(
  range: DateRange,
  period: InsightPeriod,
  locale: string
): { key: string; label: string; short: string }[] {
  if (period === 'year') {
    return Array.from({ length: 12 }, (_, index) => {
      const key = addMonths(range.from, index);
      const label = formatCalendarDate(key, locale, { month: 'long' });
      return { key, label, short: formatCalendarDate(key, locale, { month: 'short' }) };
    });
  }
  const days = dayDifference(range.from, range.to) + 1;
  return Array.from({ length: days }, (_, index) => {
    const key = addDays(range.from, index);
    const date = new Date(`${key}T00:00:00Z`);
    const weekday = new Intl.DateTimeFormat(locale, { weekday: 'short', timeZone: 'UTC' }).format(date);
    return {
      key,
      label: `${weekday} ${key.slice(8, 10)}`,
      short: period === 'week' ? weekday : key.slice(8, 10)
    };
  });
}

function bucketIndex(date: string, range: DateRange, period: InsightPeriod): number {
  if (period === 'year') return Number(date.slice(5, 7)) - 1;
  return dayDifference(range.from, date);
}

function inRange(date: string, range: DateRange): boolean {
  return date >= range.from && date <= range.to;
}

function approvedScheduleExceptionLabel(
  model: ManagerOperationsReadModel,
  employeeId: string,
  date: string,
  serviceKey: string
): string | null {
  const matchesSlot = (row: { employee_id: string; start_date: string; end_date: string; service_key: string | null }) =>
    row.employee_id === employeeId &&
    row.start_date <= date &&
    row.end_date >= date &&
    (!row.service_key || row.service_key === serviceKey);

  if (model.absences.some((row) => row.status === 'approved' && matchesSlot(row))) {
    return 'Approved leave';
  }
  if (model.work_pattern_exceptions.some((row) => row.status === 'approved' && matchesSlot(row))) {
    return 'Approved schedule change';
  }
  return null;
}

function overlapDays(from: string, to: string, range: DateRange): number {
  const start = maxDate(from, range.from);
  const end = minDate(to, range.to);
  return start <= end ? dayDifference(start, end) + 1 : 0;
}

function emptyEmployee(bucketCount: number): EmployeeAccumulator {
  return {
    planned: 0,
    worked: 0,
    shifts: 0,
    evaluatedStarts: 0,
    lateCount: 0,
    missingBadges: 0,
    corrections: 0,
    approvedLeaveDays: 0,
    plannedByBucket: Array(bucketCount).fill(0),
    workedByBucket: Array(bucketCount).fill(0)
  };
}

function insightFiltersMatch(
  employeeId: string,
  areaId: string | null,
  serviceKey: string,
  regimes: Map<string, Regime>,
  filters: InsightFilters
): boolean {
  if (filters.employeeId && filters.employeeId !== employeeId) return false;
  if (filters.workforce !== 'all' && regimes.get(employeeId) !== filters.workforce) return false;
  if (filters.areaId && filters.areaId !== areaId) return false;
  if (filters.serviceKey && filters.serviceKey !== serviceKey) return false;
  return true;
}

function analysePeriod(
  model: ManagerOperationsReadModel,
  range: DateRange,
  period: InsightPeriod,
  filters: InsightFilters,
  today: string,
  locale: string
): PeriodAnalysis {
  const spine = bucketSpine(range, period, locale);
  const bucketCount = spine.length;
  const bucketPlanned = Array(bucketCount).fill(0) as number[];
  const bucketWorked = Array(bucketCount).fill(0) as number[];
  const bucketLate = Array(bucketCount).fill(0) as number[];
  const bucketMissing = Array(bucketCount).fill(0) as number[];
  const bucketCorrections = Array(bucketCount).fill(0) as number[];
  const regimes = currentRegimes(model);
  const employees = new Map<string, EmployeeAccumulator>();
  const areas = new Map<string, MutableArea>();
  const services = new Map<string, MutableService>();
  const evidence: ShiftEvidence[] = [];
  const events: InsightEvent[] = [];
  const regimeHours: Record<Regime, number> = { flexi: 0, fixed: 0, manager: 0 };
  const timezone = model.restaurant_settings.timezone || 'Europe/Brussels';
  const employeeNames = new Map(model.employees.map((employee) => [employee.id, employee.display_name]));
  const areaNames = areaInstanceLabelMap(model.work_areas);
  const serviceNames = new Map(
    model.services.map((service) => [service.service_key, service.name])
  );
  const publishedShifts = model.published_planned_shifts ?? model.planned_shifts;
  const plannedById = new Map(publishedShifts.map((shift) => [shift.id, shift]));
  const entriesByPlan = new Map<string, ManagerOperationsReadModel['time_entries'][number]>();

  for (const employee of model.employees) {
    if (!employee.active) continue;
    if (filters.employeeId && filters.employeeId !== employee.id) continue;
    if (filters.workforce !== 'all' && filters.workforce !== (regimes.get(employee.id) ?? 'fixed')) continue;
    employees.set(employee.id, emptyEmployee(bucketCount));
  }

  for (const entry of model.time_entries) {
    if (entry.planned_shift_id && entry.status !== 'cancelled') entriesByPlan.set(entry.planned_shift_id, entry);
  }

  const ensureArea = (id: string | null): MutableArea => {
    const key = id || 'unassigned';
    let row = areas.get(key);
    if (!row) {
      row = { id: key, name: areaNames.get(key) ?? 'Unassigned', planned: 0, worked: 0, issues: 0 };
      areas.set(key, row);
    }
    return row;
  };
  const ensureService = (key: string): MutableService => {
    let row = services.get(key);
    if (!row) {
      row = {
        key,
        label: serviceNames.get(key) ?? serviceLabel(key),
        planned: 0,
        worked: 0,
        lateCount: 0,
        missingCount: 0
      };
      services.set(key, row);
    }
    return row;
  };

  for (const shift of publishedShifts) {
    const date = plannedShiftDate(shift);
    if (!inRange(date, range)) continue;
    if (!insightFiltersMatch(shift.employee_id, shift.area_id, shift.service_key, regimes, filters)) continue;
    const index = bucketIndex(date, range, period);
    if (index < 0 || index >= bucketCount) continue;
    const hours = hoursBetweenClocks(shift.starts_at, shift.ends_at);
    bucketPlanned[index] += hours;
    const employee = employees.get(shift.employee_id);
    if (employee) {
      employee.planned += hours;
      employee.plannedByBucket[index] += hours;
    }
    ensureArea(shift.area_id).planned += hours;
    ensureService(shift.service_key).planned += hours;

    const entry = entriesByPlan.get(shift.id);
    const employeeName = employeeNames.get(shift.employee_id) ?? 'Employee';
    const approvedException = approvedScheduleExceptionLabel(
      model,
      shift.employee_id,
      date,
      shift.service_key
    );
    let status: ShiftEvidence['status'] = 'planned';
    let actualLabel = 'No worked time';
    let lateMinutes: number | null = null;
    if (entry) {
      if (entry.clock_in_at) {
        const localIn = instantToLocalInput(entry.clock_in_at, timezone).slice(11, 16);
        const localOut = entry.clock_out_at
          ? instantToLocalInput(entry.clock_out_at, timezone).slice(11, 16)
          : 'open';
        actualLabel = `${localIn}-${localOut}`;
      }
      if (entry.status === 'open') status = 'open';
      else if (entry.status === 'adjusted') status = 'corrected';
      else if (WORKED_STATUSES.has(entry.status)) status = 'worked';
      const plannedStart = plannedShiftStartInstant(shift, timezone);
      if (plannedStart !== null && entry.clock_in_at) {
        lateMinutes = Math.max(0, Math.round((new Date(entry.clock_in_at).getTime() - plannedStart) / 60_000));
        if (lateMinutes > LATE_THRESHOLD_MINUTES && status === 'worked') status = 'late';
      }
    } else if (date < today) {
      if (approvedException) {
        status = 'excused';
        actualLabel = approvedException;
      } else {
        status = 'missing';
      }
    }
    evidence.push({
      id: shift.id,
      employeeId: shift.employee_id,
      date,
      serviceKey: shift.service_key,
      serviceLabel: serviceLabel(shift.service_key),
      areaName: areaNames.get(shift.area_id ?? '') ?? 'Unassigned',
      plannedLabel: `${clockLabel(shift.starts_at)}-${clockLabel(shift.ends_at)}`,
      actualLabel,
      status,
      lateMinutes
    });

    if (status === 'missing') {
      bucketMissing[index] += 1;
      if (employee) employee.missingBadges += 1;
      ensureArea(shift.area_id).issues += 1;
      ensureService(shift.service_key).missingCount += 1;
      events.push({
        id: `missing-${shift.id}`,
        date,
        employeeId: shift.employee_id,
        employeeName,
        title: 'Missing badge',
        detail: `${serviceLabel(shift.service_key)} - ${areaNames.get(shift.area_id ?? '') ?? 'Unassigned'}`,
        tone: 'danger'
      });
    }
  }

  for (const entry of model.time_entries) {
    const date = entry.business_date;
    if (!inRange(date, range)) continue;
    const plan = entry.planned_shift_id ? plannedById.get(entry.planned_shift_id) : undefined;
    const areaId = plan?.area_id ?? null;
    if (!insightFiltersMatch(entry.employee_id, areaId, entry.service_key, regimes, filters)) continue;
    const index = bucketIndex(date, range, period);
    if (index < 0 || index >= bucketCount) continue;
    const hours = workedHours(entry);
    const employee = employees.get(entry.employee_id);
    if (hours > 0) {
      bucketWorked[index] += hours;
      if (employee) {
        employee.worked += hours;
        employee.workedByBucket[index] += hours;
        employee.shifts += 1;
      }
      ensureArea(areaId).worked += hours;
      ensureService(entry.service_key).worked += hours;
      regimeHours[regimes.get(entry.employee_id) ?? 'fixed'] += hours;
    }
    const employeeName = employeeNames.get(entry.employee_id) ?? 'Employee';
    if (entry.status === 'adjusted') {
      bucketCorrections[index] += 1;
      if (employee) employee.corrections += 1;
      events.push({
        id: `adjusted-${entry.id}`,
        date,
        employeeId: entry.employee_id,
        employeeName,
        title: 'Manager correction',
        detail: entry.adjustment_reason || `${serviceLabel(entry.service_key)} entry adjusted`,
        tone: 'warning'
      });
    }
    if (plan?.starts_at && entry.clock_in_at) {
      const plannedStart = plannedShiftStartInstant(plan, timezone);
      if (plannedStart !== null) {
        const lateMinutes = Math.max(0, Math.round((new Date(entry.clock_in_at).getTime() - plannedStart) / 60_000));
        if (employee) employee.evaluatedStarts += 1;
        if (lateMinutes > LATE_THRESHOLD_MINUTES) {
          bucketLate[index] += 1;
          if (employee) employee.lateCount += 1;
          ensureArea(areaId).issues += 1;
          ensureService(entry.service_key).lateCount += 1;
          events.push({
            id: `late-${entry.id}`,
            date,
            employeeId: entry.employee_id,
            employeeName,
            title: `${lateMinutes} min late`,
            detail: `${serviceLabel(entry.service_key)} - scheduled ${clockLabel(plan.starts_at)}`,
            tone: 'warning'
          });
        }
      }
    }
    if (!plan && hours > 0) {
      evidence.push({
        id: entry.id,
        employeeId: entry.employee_id,
        date,
        serviceKey: entry.service_key,
        serviceLabel: serviceLabel(entry.service_key),
        areaName: 'Unassigned',
        plannedLabel: 'Not scheduled',
        actualLabel: entry.clock_in_at
          ? `${instantToLocalInput(entry.clock_in_at, timezone).slice(11, 16)}-${entry.clock_out_at ? instantToLocalInput(entry.clock_out_at, timezone).slice(11, 16) : 'open'}`
          : 'No badge time',
        status: 'unplanned',
        lateMinutes: null
      });
    }
    if (entry.status === 'open') {
      events.push({
        id: `open-${entry.id}`,
        date,
        employeeId: entry.employee_id,
        employeeName,
        title: 'Open badge entry',
        detail: `${serviceLabel(entry.service_key)} has no clock-out yet`,
        tone: 'danger'
      });
    }
  }

  for (const absence of model.absences) {
    if (absence.status !== 'approved' || !inRange(maxDate(absence.start_date, range.from), range)) continue;
    if (filters.employeeId && filters.employeeId !== absence.employee_id) continue;
    if (filters.workforce !== 'all' && filters.workforce !== (regimes.get(absence.employee_id) ?? 'fixed')) continue;
    if (filters.areaId) continue;
    if (filters.serviceKey && absence.service_key && filters.serviceKey !== absence.service_key) continue;
    const days = overlapDays(absence.start_date, absence.end_date, range) * (absence.service_key ? 0.5 : 1);
    const employee = employees.get(absence.employee_id);
    if (employee) employee.approvedLeaveDays += days;
  }

  const heads = new Set<string>();
  for (const [employeeId, employee] of employees) if (employee.worked > 0) heads.add(employeeId);
  const planned = round1(bucketPlanned.reduce((sum, value) => sum + value, 0));
  const worked = round1(bucketWorked.reduce((sum, value) => sum + value, 0));
  const evaluatedStarts = [...employees.values()].reduce((sum, value) => sum + value.evaluatedStarts, 0);
  const lateCount = bucketLate.reduce((sum, value) => sum + value, 0);
  const totals: InsightTotals = {
    planned,
    worked,
    adherence: planned > 0 ? worked / planned : null,
    headcount: heads.size,
    evaluatedStarts,
    lateCount,
    lateRate: evaluatedStarts > 0 ? lateCount / evaluatedStarts : null,
    missingBadges: bucketMissing.reduce((sum, value) => sum + value, 0),
    corrections: bucketCorrections.reduce((sum, value) => sum + value, 0),
    approvedLeaveDays: round1([...employees.values()].reduce((sum, value) => sum + value.approvedLeaveDays, 0))
  };

  const pulseServiceKeys = model.services
    .filter(
      (service) =>
        service.active &&
        (!filters.serviceKey || service.service_key === filters.serviceKey)
    )
    .sort(
      (left, right) =>
        left.sort_order - right.sort_order ||
        left.name.localeCompare(right.name)
    )
    .map((service) => service.service_key);
  const pulse = Array.from({ length: 7 }, (_, index) => index + 1)
    .flatMap((weekday) =>
      pulseServiceKeys.map((serviceKey): PulseCell => {
        const rows = evidence.filter(
          (row) =>
            Number(new Date(`${row.date}T00:00:00Z`).getUTCDay() || 7) ===
              weekday &&
            row.serviceKey === serviceKey
        );
        const plannedRows = rows.filter(
          (row) => row.plannedLabel !== 'Not scheduled'
        );
        const workedRows = rows.filter((row) =>
          ['worked', 'late', 'corrected', 'unplanned'].includes(row.status)
        );
        const issues = rows.filter((row) =>
          ['late', 'missing', 'corrected', 'open'].includes(row.status)
        ).length;
        return {
          weekday,
          weekdayLabel: WEEKDAYS[weekday - 1],
          serviceKey,
          serviceLabel: serviceNames.get(serviceKey) ?? serviceLabel(serviceKey),
          planned: plannedRows.length,
          worked: workedRows.length,
          issues,
          intensity: plannedRows.length
            ? Math.min(1, workedRows.length / plannedRows.length)
            : workedRows.length
              ? 1
              : 0
        };
      })
    );

  return {
    bucketKeys: spine.map((row) => row.key),
    bucketLabels: spine.map((row) => row.label),
    bucketShortLabels: spine.map((row) => row.short),
    bucketPlanned: bucketPlanned.map(round1),
    bucketWorked: bucketWorked.map(round1),
    bucketLate,
    bucketMissing,
    bucketCorrections,
    totals,
    employees,
    areas,
    services,
    evidence: evidence.sort((a, b) => b.date.localeCompare(a.date)),
    events: events.sort((a, b) => b.date.localeCompare(a.date)).slice(0, 24),
    pulse,
    regimeHours: {
      flexi: round1(regimeHours.flexi),
      fixed: round1(regimeHours.fixed),
      manager: round1(regimeHours.manager)
    }
  };
}

export function buildInsights(
  model: ManagerOperationsReadModel,
  anchor: string,
  period: InsightPeriod,
  comparisonMode: ComparisonMode,
  filters: InsightFilters,
  today: string,
  locale = 'en-GB'
): InsightView {
  const currentRange = insightPeriodRange(anchor, period, locale);
  const comparisonRange = insightComparisonRange(anchor, period, comparisonMode, locale);
  const current = analysePeriod(model, currentRange, period, filters, today, locale);
  const comparison = analysePeriod(model, comparisonRange, period, filters, today, locale);
  const regimes = currentRegimes(model);
  const comparisonEmployees = comparison.employees;
  const employees = model.employees
    .filter((employee) => employee.active && current.employees.has(employee.id))
    .map((employee): EmployeeInsight => {
      const row = current.employees.get(employee.id) ?? emptyEmployee(current.bucketKeys.length);
      const previous = comparisonEmployees.get(employee.id);
      const contracts = model.employee_contracts.filter(
        (contract) => contract.employee_id === employee.id && contract.contract_start
      );
      const tenureStart = contracts
        .map((contract) => contract.contract_start as string)
        .sort()[0] ?? employee.created_at?.slice(0, 10) ?? null;
      return {
        id: employee.id,
        name: employee.display_name,
        initials: personInitials(employee.display_name),
        role: roleFor(employee.id, model),
        regime: regimes.get(employee.id) ?? 'fixed',
        planned: round1(row.planned),
        worked: round1(row.worked),
        comparisonWorked: round1(previous?.worked ?? 0),
        adherence: row.planned > 0 ? row.worked / row.planned : null,
        shifts: row.shifts,
        evaluatedStarts: row.evaluatedStarts,
        lateCount: row.lateCount,
        lateRate: row.evaluatedStarts > 0 ? row.lateCount / row.evaluatedStarts : null,
        missingBadges: row.missingBadges,
        corrections: row.corrections,
        approvedLeaveDays: round1(row.approvedLeaveDays),
        tenureMonths: tenureStart ? monthsSince(tenureStart, anchor) : null,
        plannedByBucket: row.plannedByBucket.map(round1),
        workedByBucket: row.workedByBucket.map(round1),
        shiftsEvidence: current.evidence.filter((shift) => shift.employeeId === employee.id).slice(0, 20)
      };
    })
    .filter((employee) => !filters.areaId || employee.planned > 0 || employee.worked > 0)
    .sort((a, b) => b.worked - a.worked || a.name.localeCompare(b.name));

  const buckets = current.bucketKeys.map((key, index): InsightBucket => ({
    key,
    label: current.bucketLabels[index],
    shortLabel: current.bucketShortLabels[index],
    planned: current.bucketPlanned[index] ?? 0,
    worked: current.bucketWorked[index] ?? 0,
    comparisonPlanned: comparison.bucketPlanned[index] ?? 0,
    comparisonWorked: comparison.bucketWorked[index] ?? 0,
    lateCount: current.bucketLate[index] ?? 0,
    missingCount: current.bucketMissing[index] ?? 0,
    correctionCount: current.bucketCorrections[index] ?? 0
  }));

  const areas = [...current.areas.values()]
    .map((area): AreaInsight => ({
      ...area,
      planned: round1(area.planned),
      worked: round1(area.worked),
      adherence: area.planned > 0 ? area.worked / area.planned : null
    }))
    .sort((a, b) => b.planned - a.planned || a.name.localeCompare(b.name));
  const services = [...current.services.values()]
    .map((service): ServiceInsight => ({
      ...service,
      planned: round1(service.planned),
      worked: round1(service.worked),
      adherence: service.planned > 0 ? service.worked / service.planned : null
    }))
    .sort((a, b) => a.key.localeCompare(b.key));

  return {
    period,
    currentRange,
    comparisonRange,
    comparisonMode,
    buckets,
    current: current.totals,
    comparison: comparison.totals,
    employees,
    areas,
    services,
    pulse: current.pulse,
    events: current.events,
    flexiHours: current.regimeHours.flexi,
    fixedHours: current.regimeHours.fixed,
    managerHours: current.regimeHours.manager,
    hasData: current.totals.planned > 0 || current.totals.worked > 0 || current.events.length > 0
  };
}
