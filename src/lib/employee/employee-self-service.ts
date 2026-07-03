import { addDays, mondayFor, type ServiceKey } from '../calendar/date.ts';
import type { ServiceSlotTruth } from '../calendar/service-slot.ts';
import type { WorkRegime } from '../domain/operations.ts';

export type EmployeeSelfServiceMode = 'availability' | 'time_off';

export type EmployeeSlotSelection = {
  key: string;
  date: string;
  serviceKey: ServiceKey;
};

export type EmployeeServiceDraft = {
  date: string;
  serviceKey: ServiceKey;
  label: string;
  meta?: string;
};

export function timeOffServiceDrafts(
  selected: EmployeeSlotSelection[]
): EmployeeServiceDraft[] {
  return selected.map((slot) => ({
    date: slot.date,
    serviceKey: slot.serviceKey,
    label: 'Time off draft',
    meta: 'Pending request'
  }));
}

export type SimpleAvailabilityDraft = {
  date: string;
  serviceKey: ServiceKey;
  state: 'available' | 'partial' | 'unavailable' | '';
};

export function toggleSimpleAvailability(
  state: SimpleAvailabilityDraft['state']
): 'available' | '' {
  return state === 'available' ? '' : 'available';
}

export function availabilityChanges(
  baseline: SimpleAvailabilityDraft[],
  current: SimpleAvailabilityDraft[],
  employeeId: string
): EmployeeSlotSelection[] {
  return current
    .filter((item) => {
      const before = baseline.find(
        (row) => row.date === item.date && row.serviceKey === item.serviceKey
      );
      return before?.state !== item.state;
    })
    .map((item) => ({
      key: `${employeeId}|${item.date}|${item.serviceKey}`,
      date: item.date,
      serviceKey: item.serviceKey
    }));
}

export function toggleAvailabilityOverride(
  overrides: SimpleAvailabilityDraft[],
  slot: Omit<SimpleAvailabilityDraft, 'state'>,
  sourceState: SimpleAvailabilityDraft['state']
): SimpleAvailabilityDraft[] {
  const current =
    overrides.find(
      (item) => item.date === slot.date && item.serviceKey === slot.serviceKey
    )?.state ?? sourceState;
  const nextState = toggleSimpleAvailability(current);
  return setAvailabilityOverride(overrides, slot, nextState, sourceState);
}

// Force a slot to a specific availability state (relative to its saved truth):
// used to keep one effective state per slot — e.g. clearing availability to
// neutral when a time-off draft is added, or setting available when a draft is
// removed. Dropping the override when target === truth keeps the draft minimal.
export function setAvailabilityOverride(
  overrides: SimpleAvailabilityDraft[],
  slot: Omit<SimpleAvailabilityDraft, 'state'>,
  targetState: SimpleAvailabilityDraft['state'],
  sourceState: SimpleAvailabilityDraft['state']
): SimpleAvailabilityDraft[] {
  const remaining = overrides.filter(
    (item) => item.date !== slot.date || item.serviceKey !== slot.serviceKey
  );
  return targetState === sourceState
    ? remaining
    : [...remaining, { ...slot, state: targetState }];
}

// One slot, one action: the current tab + the employee's regime decide whether
// a click sets weekly availability, requests time off (absence), or requests a
// fixed-schedule availability change (work-pattern exception). The three never
// share a bucket, so a save is never ambiguous about what it submits.
export type EmployeeSlotAction = 'set_availability' | 'request_time_off' | 'request_change';

export function employeeSlotAction(
  mode: EmployeeSelfServiceMode,
  policy: WorkRegime
): EmployeeSlotAction {
  if (mode === 'time_off') return 'request_time_off';
  if (policy === 'fixed_schedule') return 'request_change';
  return 'set_availability';
}

export function defaultEmployeeTimeOffType<
  T extends { id: string; name: string; code?: string; category?: string; active?: boolean }
>(types: T[]): T | null {
  const active = employeeTimeOffTypes(types);
  return (
    active.find((type) =>
      `${type.code ?? ''} ${type.category ?? ''} ${type.name}`
        .toLowerCase()
        .match(/holiday|vacation|annual|congé|conge/)
    ) ??
    active.find((type) => type.category?.toLowerCase() === 'holiday') ??
    active[0] ??
    null
  );
}

export function employeeTimeOffTypes<
  T extends { id: string; name: string; code?: string; category?: string; active?: boolean }
>(types: T[]): T[] {
  return types.filter((type) => {
    if (type.active === false) return false;
    const identity = `${type.code ?? ''} ${type.category ?? ''} ${type.name}`.toLowerCase();
    return !identity.match(/public[\s_-]*holiday|bank[\s_-]*holiday|jour f[ée]ri[ée]/);
  });
}

export function toggleEmployeeSlotSelection(
  selected: EmployeeSlotSelection[],
  slot: EmployeeSlotSelection
): EmployeeSlotSelection[] {
  return selected.some((item) => item.key === slot.key)
    ? selected.filter((item) => item.key !== slot.key)
    : [...selected, slot].sort(
        (a, b) => a.date.localeCompare(b.date) || a.serviceKey.localeCompare(b.serviceKey)
      );
}

export function employeeSlotActionReason(input: {
  truth: ServiceSlotTruth;
  policy: WorkRegime;
  mode: EmployeeSelfServiceMode;
  today: string;
  planningPublished: boolean;
}): string {
  const { truth, policy, mode, today, planningPublished } = input;
  if (truth.date < today) return 'Past services are read-only.';
  if (truth.entry) return 'Worked time cannot be changed through employee self-service.';
  if (truth.absence?.status === 'approved') return 'Approved leave already covers this service.';
  if (truth.absence?.status === 'pending') return 'A time-off request is already pending for this service.';
  if (truth.workPatternException?.status === 'approved') {
    return 'An approved availability change already covers this service.';
  }
  if (truth.workPatternException?.status === 'pending') {
    return 'An availability change is already pending for this service.';
  }
  if (mode === 'time_off') return '';
  if (policy === 'manager_only') return 'Availability is maintained by your manager.';
  if (policy === 'fixed_schedule') return '';
  if (planningPublished) return 'Availability is locked once the week is published.';
  return '';
}

export type TimeOffRange = {
  startDate: string;
  endDate: string;
  serviceKey: ServiceKey | '';
};

// Group an arbitrary slot selection into the fewest absence ranges that cover
// it: a day with both services becomes a full-day ('') range, single-service
// days stay on their own lane, and consecutive same-lane days merge. This lets
// time off accept any selection the board allows — the same freedom as
// availability — instead of silently dropping anything that is not one tidy
// contiguous range.
export function groupTimeOffRanges(selected: EmployeeSlotSelection[]): TimeOffRange[] {
  const servicesByDate = new Map<string, Set<ServiceKey>>();
  for (const slot of selected) {
    const set = servicesByDate.get(slot.date) ?? new Set<ServiceKey>();
    set.add(slot.serviceKey);
    servicesByDate.set(slot.date, set);
  }
  const lanes = new Map<ServiceKey | '', string[]>();
  for (const [date, set] of servicesByDate) {
    const lane: ServiceKey | '' = set.has('lunch') && set.has('evening') ? '' : [...set][0];
    lanes.set(lane, [...(lanes.get(lane) ?? []), date]);
  }
  const ranges: TimeOffRange[] = [];
  for (const [serviceKey, dates] of lanes) {
    const sorted = [...dates].sort();
    let start = sorted[0];
    let prev = sorted[0];
    for (const date of sorted.slice(1)) {
      if (date === addDays(prev, 1)) {
        prev = date;
        continue;
      }
      ranges.push({ startDate: start, endDate: prev, serviceKey });
      start = date;
      prev = date;
    }
    ranges.push({ startDate: start, endDate: prev, serviceKey });
  }
  return ranges.sort(
    (a, b) =>
      a.startDate.localeCompare(b.startDate) || `${a.serviceKey}`.localeCompare(`${b.serviceKey}`)
  );
}

export function selectionWeekStarts(selected: EmployeeSlotSelection[]): string[] {
  return [...new Set(selected.map((item) => mondayFor(item.date)))].sort();
}
