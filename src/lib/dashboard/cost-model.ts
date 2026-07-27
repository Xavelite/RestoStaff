import type { ManagerOperationsReadModel } from '../api/workspace-snapshot.ts';
import type { InsightsCostRates } from '../payroll/payroll-api.ts';
import { dateForWeekday, serviceLabel } from '../calendar/date.ts';
import { areaInstanceLabelMap } from '../restaurant/area-instance.ts';
import type { DateRange, InsightFilters, InsightPeriod, Regime } from './dashboard-model';

type CostSource = 'estimated_profile_rate' | 'calculated_payroll' | 'reconciled_provider';

type CostRow = {
  id: string;
  label: string;
  workedMinutes: number;
  plannedMinutes: number;
  hourlyCostCents: bigint | null;
  workedCostCents: bigint;
  plannedCostCents: bigint;
  varianceCents: bigint;
};

type CostBucket = {
  key: string;
  plannedCostCents: bigint;
  workedCostCents: bigint;
  comparisonWorkedCostCents: bigint;
};

type CostInsights = {
  source: CostSource;
  plannedCostCents: bigint;
  workedCostCents: bigint;
  comparisonWorkedCostCents: bigint;
  varianceCents: bigint;
  averageWorkedHourlyCostCents: bigint | null;
  coveredWorkedMinutes: number;
  eligibleWorkedMinutes: number;
  coverage: number | null;
  missingActiveEmployeeCount: number;
  excludedEntryCount: number;
  buckets: CostBucket[];
  employees: CostRow[];
  areas: CostRow[];
  services: CostRow[];
  employmentTypes: CostRow[];
};

type Accumulator = {
  workedMinutes: number;
  plannedMinutes: number;
  workedCostCents: bigint;
  plannedCostCents: bigint;
};

const WORKED_STATUSES = new Set(['closed', 'adjusted']);

function regimeOf(workRegime: string | null | undefined): Regime {
  if (workRegime === 'weekly_availability') return 'flexi';
  if (workRegime === 'manager_only') return 'manager';
  return 'fixed';
}

function currentRegimes(model: ManagerOperationsReadModel): Map<string, Regime> {
  return new Map(
    model.employee_contracts
      .filter((contract) => contract.is_current)
      .map((contract) => [contract.employee_id, regimeOf(contract.work_regime)])
  );
}

function plannedDate(shift: ManagerOperationsReadModel['planned_shifts'][number]): string {
  return shift.weekday >= 1 && shift.weekday <= 7
    ? dateForWeekday(shift.week_start, shift.weekday)
    : shift.week_start;
}

function clockMinutes(start: string | null, end: string | null): number {
  if (!start || !end) return 0;
  const [startHour, startMinute] = start.slice(0, 5).split(':').map(Number);
  const [endHour, endMinute] = end.slice(0, 5).split(':').map(Number);
  if (![startHour, startMinute, endHour, endMinute].every(Number.isFinite)) return 0;
  const from = startHour * 60 + startMinute;
  let to = endHour * 60 + endMinute;
  if (to <= from) to += 24 * 60;
  return Math.min(24 * 60, Math.max(0, to - from));
}

function costForMinutes(minutes: number, hourlyCents: bigint): bigint {
  return (BigInt(minutes) * hourlyCents + 30n) / 60n;
}

function inRange(date: string, range: DateRange): boolean {
  return date >= range.from && date <= range.to;
}

function matchesFilters(
  employeeId: string,
  areaId: string | null,
  serviceKey: string,
  regimes: Map<string, Regime>,
  filters: InsightFilters
): boolean {
  if (filters.employeeId && filters.employeeId !== employeeId) return false;
  if (filters.workforce !== 'all' && filters.workforce !== regimes.get(employeeId)) return false;
  if (filters.areaId && filters.areaId !== areaId) return false;
  if (filters.serviceKey && filters.serviceKey !== serviceKey) return false;
  return true;
}

function overlappingEntryIds(model: ManagerOperationsReadModel, range: DateRange): Set<string> {
  const rows = model.time_entries.filter(
    (entry) => inRange(entry.business_date, range) && WORKED_STATUSES.has(entry.status) &&
      entry.clock_in_at && entry.clock_out_at
  );
  const overlaps = new Set<string>();
  for (let index = 0; index < rows.length; index += 1) {
    const left = rows[index];
    for (let otherIndex = index + 1; otherIndex < rows.length; otherIndex += 1) {
      const right = rows[otherIndex];
      if (left.employee_id !== right.employee_id || left.business_date !== right.business_date) continue;
      const leftStart = new Date(left.clock_in_at as string).getTime();
      const leftEnd = new Date(left.clock_out_at as string).getTime();
      const rightStart = new Date(right.clock_in_at as string).getTime();
      const rightEnd = new Date(right.clock_out_at as string).getTime();
      if (leftStart < rightEnd && rightStart < leftEnd) {
        overlaps.add(left.id);
        overlaps.add(right.id);
      }
    }
  }
  return overlaps;
}

function add(map: Map<string, Accumulator>, key: string, field: 'planned' | 'worked', minutes: number, cost: bigint) {
  const row = map.get(key) ?? { workedMinutes: 0, plannedMinutes: 0, workedCostCents: 0n, plannedCostCents: 0n };
  if (field === 'planned') {
    row.plannedMinutes += minutes;
    row.plannedCostCents += cost;
  } else {
    row.workedMinutes += minutes;
    row.workedCostCents += cost;
  }
  map.set(key, row);
}

function analyseRange(
  model: ManagerOperationsReadModel,
  rates: InsightsCostRates,
  range: DateRange,
  filters: InsightFilters
) {
  const rateMap = new Map(
    rates.rates.filter((rate) => rate.has_rate && rate.estimated_hourly_cost_cents != null)
      .map((rate) => [rate.employee_id, BigInt(rate.estimated_hourly_cost_cents as number)])
  );
  const employmentTypes = new Map(rates.rates.map((rate) => [rate.employee_id, rate.employment_type]));
  const regimes = currentRegimes(model);
  // Older cached/test snapshots predate the explicit publication baseline.
  // Treat their canonical planning rows as published until they refresh.
  const publishedShifts = model.published_planned_shifts ?? model.planned_shifts;
  const planById = new Map(publishedShifts.map((shift) => [shift.id, shift]));
  const overlapping = overlappingEntryIds(model, range);
  const employees = new Map<string, Accumulator>();
  const areas = new Map<string, Accumulator>();
  const services = new Map<string, Accumulator>();
  const types = new Map<string, Accumulator>();
  let plannedCostCents = 0n;
  let workedCostCents = 0n;
  let coveredWorkedMinutes = 0;
  let eligibleWorkedMinutes = 0;
  let excludedEntryCount = 0;

  for (const shift of publishedShifts) {
    const date = plannedDate(shift);
    if (!inRange(date, range) || !matchesFilters(shift.employee_id, shift.area_id, shift.service_key, regimes, filters)) continue;
    const rate = rateMap.get(shift.employee_id);
    if (rate == null) continue;
    const minutes = clockMinutes(shift.starts_at, shift.ends_at);
    const cost = costForMinutes(minutes, rate);
    plannedCostCents += cost;
    add(employees, shift.employee_id, 'planned', minutes, cost);
    add(areas, shift.area_id ?? 'unassigned', 'planned', minutes, cost);
    add(services, shift.service_key, 'planned', minutes, cost);
    add(types, employmentTypes.get(shift.employee_id) ?? 'NOT_SET', 'planned', minutes, cost);
  }

  for (const entry of model.time_entries) {
    if (!inRange(entry.business_date, range)) continue;
    const plan = entry.planned_shift_id ? planById.get(entry.planned_shift_id) : undefined;
    const areaId = entry.actual_area_id ?? plan?.area_id ?? null;
    if (!matchesFilters(entry.employee_id, areaId, entry.service_key, regimes, filters)) continue;
    const valid = WORKED_STATUSES.has(entry.status) && entry.clock_in_at && entry.clock_out_at && !overlapping.has(entry.id);
    if (!valid) {
      if (entry.status !== 'cancelled') excludedEntryCount += 1;
      continue;
    }
    const elapsed = Math.round((new Date(entry.clock_out_at as string).getTime() - new Date(entry.clock_in_at as string).getTime()) / 60_000);
    const minutes = Math.max(0, elapsed - Math.max(0, entry.break_minutes ?? 0));
    if (minutes <= 0 || minutes > 24 * 60) {
      excludedEntryCount += 1;
      continue;
    }
    eligibleWorkedMinutes += minutes;
    const rate = rateMap.get(entry.employee_id);
    if (rate == null) continue;
    coveredWorkedMinutes += minutes;
    const cost = costForMinutes(minutes, rate);
    workedCostCents += cost;
    add(employees, entry.employee_id, 'worked', minutes, cost);
    add(areas, areaId ?? 'unassigned', 'worked', minutes, cost);
    add(services, entry.service_key, 'worked', minutes, cost);
    add(types, employmentTypes.get(entry.employee_id) ?? 'NOT_SET', 'worked', minutes, cost);
  }

  return { plannedCostCents, workedCostCents, coveredWorkedMinutes, eligibleWorkedMinutes, excludedEntryCount, employees, areas, services, types };
}

function rows(
  map: Map<string, Accumulator>,
  labels: Map<string, string>,
  rates?: Map<string, bigint>
): CostRow[] {
  return [...map.entries()].map(([id, value]) => ({
    id,
    label: labels.get(id) ?? id.replaceAll('_', ' '),
    workedMinutes: value.workedMinutes,
    plannedMinutes: value.plannedMinutes,
    hourlyCostCents: rates?.get(id) ?? null,
    workedCostCents: value.workedCostCents,
    plannedCostCents: value.plannedCostCents,
    varianceCents: value.workedCostCents - value.plannedCostCents
  })).sort((left, right) => Number(right.workedCostCents - left.workedCostCents));
}

export function buildCostInsights(
  model: ManagerOperationsReadModel,
  rates: InsightsCostRates,
  currentRange: DateRange,
  comparisonRange: DateRange,
  filters: InsightFilters,
  bucketKeys: string[],
  period: InsightPeriod
): CostInsights {
  const current = analyseRange(model, rates, currentRange, filters);
  const comparison = analyseRange(model, rates, comparisonRange, filters);
  const rateMap = new Map(rates.rates.filter((rate) => rate.has_rate && rate.estimated_hourly_cost_cents != null)
    .map((rate) => [rate.employee_id, BigInt(rate.estimated_hourly_cost_cents as number)]));
  const employeeLabels = new Map(model.employees.map((employee) => [employee.id, employee.display_name]));
  const areaLabels = areaInstanceLabelMap(model.work_areas);
  areaLabels.set('unassigned', 'Unassigned');
  const serviceLabels = new Map(model.services.map((service) => [service.service_key, serviceLabel(service.service_key)]));
  const typeLabels = new Map(rates.rates.map((rate) => [rate.employment_type, rate.employment_type.replaceAll('_', ' ')]));
  const buckets = bucketKeys.map((key) => {
    const bucketEnd = period === 'year'
      ? new Date(Date.UTC(Number(key.slice(0, 4)), Number(key.slice(5, 7)), 0)).toISOString().slice(0, 10)
      : key;
    const range = { from: key, to: bucketEnd, label: key };
    const currentDay = analyseRange(model, rates, range, filters);
    const offset = bucketKeys.indexOf(key);
    const comparisonDate = new Date(`${comparisonRange.from}T00:00:00Z`);
    if (period === 'year') comparisonDate.setUTCMonth(comparisonDate.getUTCMonth() + offset);
    else comparisonDate.setUTCDate(comparisonDate.getUTCDate() + offset);
    const comparisonKey = comparisonDate.toISOString().slice(0, 10);
    const comparisonEnd = period === 'year'
      ? new Date(Date.UTC(comparisonDate.getUTCFullYear(), comparisonDate.getUTCMonth() + 1, 0)).toISOString().slice(0, 10)
      : comparisonKey;
    const comparisonDay = analyseRange(model, rates, { from: comparisonKey, to: comparisonEnd, label: comparisonKey }, filters);
    return { key, plannedCostCents: currentDay.plannedCostCents, workedCostCents: currentDay.workedCostCents, comparisonWorkedCostCents: comparisonDay.workedCostCents };
  });
  return {
    source: rates.source,
    plannedCostCents: current.plannedCostCents,
    workedCostCents: current.workedCostCents,
    comparisonWorkedCostCents: comparison.workedCostCents,
    varianceCents: current.workedCostCents - current.plannedCostCents,
    averageWorkedHourlyCostCents: current.coveredWorkedMinutes > 0
      ? (current.workedCostCents * 60n) / BigInt(current.coveredWorkedMinutes)
      : null,
    coveredWorkedMinutes: current.coveredWorkedMinutes,
    eligibleWorkedMinutes: current.eligibleWorkedMinutes,
    coverage: current.eligibleWorkedMinutes > 0 ? current.coveredWorkedMinutes / current.eligibleWorkedMinutes : null,
    missingActiveEmployeeCount: rates.missing_active_employee_count,
    excludedEntryCount: current.excludedEntryCount,
    buckets,
    employees: rows(current.employees, employeeLabels, rateMap),
    areas: rows(current.areas, areaLabels),
    services: rows(current.services, serviceLabels),
    employmentTypes: rows(current.types, typeLabels)
  };
}
