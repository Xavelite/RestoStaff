import type { SchedulingReadModel } from '../api/workspace-snapshot.ts';
import type { Database } from '../supabase/database.types';
import { workPatternExceptionOverlaps } from '../work-pattern-exceptions/work-pattern-exception.ts';
import type {
  CalendarItem,
  CalendarTone,
  ServiceSlotPresentation,
  SlotBackground
} from './calendar-model.ts';
import {
  clockLabel,
  dateForWeekday,
  formatHours,
  hoursBetweenInstants,
  mondayFor,
  weekday,
  type ServiceKey
} from './date.ts';

export type ServiceSlotAvailability =
  | Database['public']['Enums']['service_availability_state']
  | '';

export type ServiceSlotState =
  | 'empty'
  | 'available'
  | 'partial'
  | 'unavailable'
  | 'leave_pending'
  | 'leave_approved'
  | 'work_pattern_pending'
  | 'work_pattern_approved'
  | 'planned'
  | 'missing_badge'
  | 'live'
  | 'worked'
  | 'corrected'
  | 'conflict';

export type ServiceSlotPlan = {
  id: string;
  startsAt: string;
  endsAt: string;
  area?: string;
  contractBaseline?: boolean;
};

export type ServiceSlotTruth = {
  key: string;
  employeeId: string;
  date: string;
  serviceKey: ServiceKey;
  state: ServiceSlotState;
  plan: ServiceSlotPlan | null;
  entry: SchedulingReadModel['time_entries'][number] | null;
  absence: SchedulingReadModel['absences'][number] | null;
  workPatternException: SchedulingReadModel['work_pattern_exceptions'][number] | null;
  availability: ServiceSlotAvailability;
  conflictReasons: string[];
  attention: 'leave_pending' | 'work_pattern_pending' | 'partial' | '';
  actualHours: number;
  clockIn: string;
  clockOut: string;
};

type ResolveWorkspaceServiceSlotInput = {
  snapshot: SchedulingReadModel;
  employeeId: string;
  date: string;
  serviceKey: ServiceKey;
  today: string;
  plan?: ServiceSlotPlan | null;
  availability?: ServiceSlotAvailability;
  publishedPlanOnly?: boolean;
  includeActual?: boolean;
};

function planFromSnapshot(
  input: ResolveWorkspaceServiceSlotInput
): ServiceSlotPlan | null {
  const weekStart = mondayFor(input.date);
  if (
    input.publishedPlanOnly !== false &&
    input.snapshot.work_weeks.find((week) => week.week_start === weekStart)
      ?.planning_status !== 'published'
  ) {
    return null;
  }
  const shift = input.snapshot.planned_shifts.find(
    (row) =>
      row.employee_id === input.employeeId &&
      row.week_start === weekStart &&
      row.weekday === weekday(input.date) &&
      row.service_key === input.serviceKey
  );
  if (!shift) return null;
  return {
    id: shift.id,
    startsAt: clockLabel(shift.starts_at),
    endsAt: clockLabel(shift.ends_at),
    contractBaseline: shift.source === 'template',
    area:
      (input.snapshot.work_areas ?? []).find((area) => area.id === shift.area_id)?.name ??
      'Any area'
  };
}

function availabilityFromSnapshot(
  input: ResolveWorkspaceServiceSlotInput
): ServiceSlotAvailability {
  const weekStart = mondayFor(input.date);
  const explicit = input.snapshot.employee_availability_slots.find(
    (row) =>
      row.employee_id === input.employeeId &&
      row.week_start === weekStart &&
      row.weekday === weekday(input.date) &&
      row.service_key === input.serviceKey
  )?.availability_state;
  if (explicit === 'available' || explicit === 'partial' || explicit === 'unavailable') {
    return explicit;
  }
  return '';
}

export function instantClockLabel(value: string | null, timezone: string): string {
  if (!value) return '';
  const instant = new Date(value);
  if (!Number.isFinite(instant.getTime())) return '';
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: timezone,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23'
  }).format(instant);
}

export function resolveWorkspaceServiceSlot(
  input: ResolveWorkspaceServiceSlotInput
): ServiceSlotTruth {
  const plan = input.plan === undefined ? planFromSnapshot(input) : input.plan;
  const availability =
    input.availability === undefined ? availabilityFromSnapshot(input) : input.availability;
  const absence =
    input.snapshot.absences.find(
      (row) =>
        row.employee_id === input.employeeId &&
        (row.status === 'pending' || row.status === 'approved') &&
        row.start_date <= input.date &&
        row.end_date >= input.date &&
        (!row.service_key || row.service_key === input.serviceKey)
    ) ?? null;
  const workPatternException =
    (input.snapshot.work_pattern_exceptions ?? []).find((row) =>
      workPatternExceptionOverlaps(row, input.employeeId, input.date, input.serviceKey)
    ) ?? null;
  const entry =
    input.includeActual === false
      ? null
      : input.snapshot.time_entries.find(
          (row) =>
            row.employee_id === input.employeeId &&
            row.business_date === input.date &&
            row.service_key === input.serviceKey &&
            row.status !== 'cancelled'
        ) ?? null;
  const conflictReasons: string[] = [];
  if (absence?.status === 'approved') conflictReasons.push('approved leave');
  if (workPatternException?.status === 'approved') {
    conflictReasons.push('approved fixed-schedule change');
  }
  if (availability === 'unavailable') conflictReasons.push('unavailable');

  let state: ServiceSlotState;
  if (entry && conflictReasons.length) state = 'conflict';
  else if (entry?.status === 'open') state = 'live';
  else if (entry?.status === 'adjusted' || entry?.adjusted_at) state = 'corrected';
  else if (entry) state = 'worked';
  else if (plan && conflictReasons.length) state = 'conflict';
  else if (plan && input.date < input.today) state = 'missing_badge';
  else if (plan) state = 'planned';
  else if (absence?.status === 'approved') state = 'leave_approved';
  else if (workPatternException?.status === 'approved') state = 'work_pattern_approved';
  else if (absence?.status === 'pending') state = 'leave_pending';
  else if (workPatternException?.status === 'pending') state = 'work_pattern_pending';
  else if (availability) state = availability;
  else state = 'empty';

  const attention =
    absence?.status === 'pending'
      ? 'leave_pending'
      : workPatternException?.status === 'pending'
        ? 'work_pattern_pending'
        : availability === 'partial'
          ? 'partial'
          : '';
  const actualHours = entry
    ? Math.max(
        0,
        hoursBetweenInstants(entry.clock_in_at, entry.clock_out_at) -
          Number(entry.break_minutes ?? 0) / 60
      )
    : 0;
  const timezone = input.snapshot.restaurant_settings.timezone || 'Europe/Brussels';

  return {
    key: `${input.employeeId}|${input.date}|${input.serviceKey}`,
    employeeId: input.employeeId,
    date: input.date,
    serviceKey: input.serviceKey,
    state,
    plan,
    entry,
    absence,
    workPatternException,
    availability,
    conflictReasons,
    attention,
    actualHours,
    clockIn: instantClockLabel(entry?.clock_in_at ?? null, timezone),
    clockOut: instantClockLabel(entry?.clock_out_at ?? null, timezone)
  };
}

function availabilityBackground(truth: ServiceSlotTruth): SlotBackground {
  if (truth.state === 'conflict') return 'conflict';
  if (
    truth.absence?.status === 'approved' ||
    truth.workPatternException?.status === 'approved'
  ) {
    return 'unavailable';
  }
  if (
    truth.absence?.status === 'pending' ||
    truth.workPatternException?.status === 'pending'
  ) {
    return 'neutral';
  }
  if (truth.availability === 'available') return 'available';
  if (truth.availability === 'partial') return 'partial';
  if (truth.availability === 'unavailable') return 'unavailable';
  return 'neutral';
}

// Actuals reads the half-cell as the legitimacy of worked time against context,
// not as planning availability: green = worked while available, yellow = needs a
// look (worked without confirmed availability, partial, or a planned no-show),
// red = worked against approved leave / explicit unavailable (already `conflict`).
function actualsBackground(truth: ServiceSlotTruth): SlotBackground {
  if (truth.entry) {
    if (truth.state === 'conflict') return 'conflict';
    return truth.availability === 'available' || truth.plan?.contractBaseline
      ? 'available'
      : 'warning';
  }
  if (truth.state === 'missing_badge') return 'warning';
  return availabilityBackground(truth);
}

// Planning reads the half-cell as the legitimacy of a planned shift against
// context, the same way Actuals reads worked time: green = planned where the
// employee is available, yellow = needs a look (planned on not-set/partial
// availability or a pending request), red = planned against approved leave /
// explicit unavailable (already `conflict`). With no plan, fall back to the
// plain availability context so the manager can read who is free.
function planningBackground(truth: ServiceSlotTruth): SlotBackground {
  if (truth.plan) {
    if (truth.state === 'conflict') return 'conflict';
    return truth.availability === 'available' || truth.plan.contractBaseline
      ? 'available'
      : 'warning';
  }
  return availabilityBackground(truth);
}

function leaveCard(truth: ServiceSlotTruth): CalendarItem | null {
  if (truth.absence) {
    return {
      id: truth.key,
      label: truth.absence.status === 'approved' ? 'Approved leave' : 'Leave pending',
      tone: truth.absence.status === 'approved' ? 'absence' : 'pending',
      serviceKey: truth.serviceKey
    };
  }
  if (truth.workPatternException) {
    return {
      id: truth.key,
      label:
        truth.workPatternException.status === 'approved'
          ? 'Fixed-schedule change'
          : 'Schedule change pending',
      meta: truth.workPatternException.reason,
      tone: truth.workPatternException.status === 'approved' ? 'absence' : 'pending',
      serviceKey: truth.serviceKey
    };
  }
  return null;
}

function planCard(truth: ServiceSlotTruth, tone: CalendarTone = 'planned'): CalendarItem | null {
  if (!truth.plan) return null;
  return {
    id: truth.key,
    label: `${truth.plan.startsAt}–${truth.plan.endsAt}`,
    meta:
      truth.conflictReasons.length
        ? `Conflict · ${truth.conflictReasons.join(', ')}`
        : truth.plan.area,
    tone: truth.conflictReasons.length ? 'conflict' : tone,
    serviceKey: truth.serviceKey
  };
}

function actualCard(truth: ServiceSlotTruth): CalendarItem | null {
  if (!truth.entry) return null;
  const corrected = truth.entry.status === 'adjusted' || Boolean(truth.entry.adjusted_at);
  return {
    id: truth.key,
    label:
      truth.entry.status === 'open'
        ? `${truth.clockIn}–live`
        : `${truth.clockIn}–${truth.clockOut}`,
    meta:
      truth.state === 'conflict'
        ? truth.conflictReasons.join(', ')
        : truth.entry.status === 'open'
          ? 'Working now'
          : corrected
          ? `Corrected · ${formatHours(truth.actualHours)}`
          : formatHours(truth.actualHours),
    tone:
      truth.state === 'conflict'
        ? 'conflict'
        : truth.entry.status === 'open'
          ? 'live'
          : corrected
            ? 'correction'
            : 'actual',
    serviceKey: truth.serviceKey
  };
}

export type ServiceSlotProjection = 'employee' | 'planning' | 'actuals';

export function projectServiceSlot(
  truth: ServiceSlotTruth,
  projection: ServiceSlotProjection
): ServiceSlotPresentation {
  const background = availabilityBackground(truth);

  if (projection === 'planning') {
    return {
      background: planningBackground(truth),
      card: planCard(truth) ?? leaveCard(truth),
      attention: truth.conflictReasons.join(', ') || undefined
    };
  }

  if (projection === 'actuals') {
    const actualsBg = actualsBackground(truth);
    const worked = actualCard(truth);
    if (worked) return { background: actualsBg, card: worked };
    if (truth.plan && truth.state === 'missing_badge') {
      return {
        background: actualsBg,
        card: {
          id: truth.key,
          label: 'Missing badge',
          meta: `Planned ${truth.plan.startsAt}–${truth.plan.endsAt}`,
          tone: 'missing',
          serviceKey: truth.serviceKey
        }
      };
    }
    return {
      background: actualsBg,
      card:
        leaveCard(truth) ??
        (truth.plan
          ? {
              id: truth.key,
              label: 'Planned',
              meta: `${truth.plan.startsAt}–${truth.plan.endsAt}`,
              tone: 'expected',
              serviceKey: truth.serviceKey
            }
          : null)
    };
  }

  // The employee's own time off stays visible on their calendar even when they
  // are also scheduled, so a published leave request is not hidden behind the
  // plan card. A real worked entry still takes precedence.
  const ownLeaveFirst = !truth.entry && truth.absence ? leaveCard(truth) : null;
  return {
    background,
    card: actualCard(truth) ?? ownLeaveFirst ?? planCard(truth) ?? leaveCard(truth),
    attention: truth.conflictReasons.join(', ') || undefined
  };
}
