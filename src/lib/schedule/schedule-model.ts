import type { ManagerOperationsReadModel } from '../api/workspace-snapshot';
import type { Tables } from '../supabase/database.types';
import {
  SERVICES,
  WEEKDAYS,
  clockLabel,
  clockMinutes,
  dateForWeekday,
  formatHours,
  hoursBetweenClocks,
  weekday,
  type ServiceKey
} from '../calendar/date.ts';
import type { WeekCell, WeekColumn, WeekRow, WeekSlot } from '../calendar/week-grid';
import {
  resolveWorkspaceServiceSlot,
  projectServiceSlot,
  type ServiceSlotTruth
} from '../calendar/service-slot.ts';

export type PlanningShiftDraft = {
  employeeId: string;
  weekday: number;
  serviceKey: ServiceKey;
  areaId: string;
  jobFunctionId: string;
  startsAt: string;
  endsAt: string;
  source: Tables<'planned_shifts'>['source'];
};

export type PlanningNoteDraft = {
  weekday: number;
  serviceKey: ServiceKey;
  note: string;
};

export type SlotContext = {
  availability: 'available' | 'partial' | 'unavailable' | 'missing';
  absence: 'approved' | 'pending' | '';
  absenceId: string | null;
  workPatternException: 'approved' | 'pending' | '';
  workPatternExceptionId: string | null;
  workPatternExceptionReason: string;
};

export type PlanningRequestKind = 'absence' | 'work_pattern_exception';

export type PlanningOverlap = {
  employeeId: string;
  weekday: number;
  first: PlanningShiftDraft;
  second: PlanningShiftDraft;
};

function shiftInterval(shift: Pick<PlanningShiftDraft, 'startsAt' | 'endsAt'>): [number, number] | null {
  const start = clockMinutes(shift.startsAt);
  const rawEnd = clockMinutes(shift.endsAt);
  if (start === null || rawEnd === null || start === rawEnd) return null;
  return [start, rawEnd <= start ? rawEnd + 24 * 60 : rawEnd];
}

/**
 * Cross-service overlap is a structural planning issue. The database limits an
 * employee to one shift per service, but lunch and evening can still overlap;
 * this helper is the single source of truth used by the grid and publish gate.
 */
export function planningOverlaps(shifts: PlanningShiftDraft[]): PlanningOverlap[] {
  const overlaps: PlanningOverlap[] = [];
  const groups = new Map<string, PlanningShiftDraft[]>();
  for (const shift of shifts) {
    const key = `${shift.employeeId}|${shift.weekday}`;
    groups.set(key, [...(groups.get(key) ?? []), shift]);
  }
  for (const group of groups.values()) {
    for (let left = 0; left < group.length; left += 1) {
      const leftInterval = shiftInterval(group[left]);
      if (!leftInterval) continue;
      for (let right = left + 1; right < group.length; right += 1) {
        const rightInterval = shiftInterval(group[right]);
        if (!rightInterval) continue;
        if (leftInterval[0] < rightInterval[1] && rightInterval[0] < leftInterval[1]) {
          overlaps.push({
            employeeId: group[left].employeeId,
            weekday: group[left].weekday,
            first: group[left],
            second: group[right]
          });
        }
      }
    }
  }
  return overlaps;
}

export function planningOverlapKeys(shifts: PlanningShiftDraft[]): Set<string> {
  const keys = new Set<string>();
  for (const overlap of planningOverlaps(shifts)) {
    keys.add(draftKey(overlap.first));
    keys.add(draftKey(overlap.second));
  }
  return keys;
}

export function blocksPlanningAssignment(context: SlotContext): boolean {
  return (
    context.absence === 'pending' ||
    context.absence === 'approved' ||
    context.workPatternException === 'pending' ||
    context.workPatternException === 'approved'
  );
}

export function planningRequestIdentity(
  context: SlotContext,
  kind: PlanningRequestKind
): string | null {
  if (kind === 'absence') return context.absence ? context.absenceId : null;
  return context.workPatternException ? context.workPatternExceptionId : null;
}

export type CoverageIssue = {
  date: string;
  serviceKey: ServiceKey;
  areaId: string;
  jobFunctionId: string;
  missing: number;
  required: number;
  planned: number;
};

export type PlanningGridSlot = {
  key: string;
  employeeId: string;
  employeeName: string;
  date: string;
  weekday: number;
  serviceKey: ServiceKey;
  shift: PlanningShiftDraft | null;
  context: SlotContext;
  truth: ServiceSlotTruth;
};

function isService(value: string): value is ServiceKey {
  return value === 'lunch' || value === 'evening';
}

function draftKey(shift: Pick<PlanningShiftDraft, 'employeeId' | 'weekday' | 'serviceKey'>): string {
  return `${shift.employeeId}|${shift.weekday}|${shift.serviceKey}`;
}

function hasApprovedRecurringOverride(
  snapshot: ManagerOperationsReadModel,
  employeeId: string,
  date: string,
  serviceKey: ServiceKey
): boolean {
  const context = slotContext(snapshot, employeeId, date, serviceKey);
  return context.absence === 'approved' || context.workPatternException === 'approved';
}

export function planningDraftForWeek(
  snapshot: ManagerOperationsReadModel,
  weekStart: string
): PlanningShiftDraft[] {
  const explicit = snapshot.planned_shifts.flatMap((shift) => {
    if (shift.week_start !== weekStart || !isService(shift.service_key)) return [];
    return [{
      employeeId: shift.employee_id,
      weekday: shift.weekday,
      serviceKey: shift.service_key,
      areaId: shift.area_id ?? '',
      jobFunctionId: shift.job_function_id ?? '',
      startsAt: clockLabel(shift.starts_at),
      endsAt: clockLabel(shift.ends_at),
      source: shift.source
    }];
  });
  const occupied = new Set(explicit.map(draftKey));
  const employeeIds = new Set(
    snapshot.employees.filter((employee) => employee.active).map((employee) => employee.id)
  );
  const recurring = (snapshot.recurring_schedule_slots ?? []).flatMap((slot) => {
    if (
      !slot.active ||
      !isService(slot.service_key) ||
      !employeeIds.has(slot.employee_id) ||
      !Number.isInteger(slot.weekday) ||
      slot.weekday < 1 ||
      slot.weekday > 7
    ) {
      // A recurring slot with a missing/out-of-range weekday would make
      // dateForWeekday produce an invalid date and throw, which previously
      // aborted the whole draft build (leaving the week permanently "dirty").
      return [];
    }
    const date = dateForWeekday(weekStart, slot.weekday);
    if (hasApprovedRecurringOverride(snapshot, slot.employee_id, date, slot.service_key)) {
      return [];
    }
    const key = `${slot.employee_id}|${slot.weekday}|${slot.service_key}`;
    if (occupied.has(key)) return [];
    const shift = defaultPlanningShift(snapshot, {
      employeeId: slot.employee_id,
      weekday: slot.weekday,
      date,
      serviceKey: slot.service_key
    });
    if (!shift) return [];
    occupied.add(key);
    return [{ ...shift, source: 'template' as const }];
  });
  return [...explicit, ...recurring];
}

export function planningNotesForWeek(
  snapshot: ManagerOperationsReadModel,
  weekStart: string
): PlanningNoteDraft[] {
  return snapshot.weekly_notes.flatMap((note) => {
    if (note.week_start !== weekStart || !isService(note.service_key)) return [];
    return [{
      weekday: note.weekday,
      serviceKey: note.service_key,
      note: note.note
    }];
  });
}

export function slotContext(
  snapshot: ManagerOperationsReadModel,
  employeeId: string,
  date: string,
  serviceKey: ServiceKey
): SlotContext {
  const truth = resolveWorkspaceServiceSlot({
    snapshot,
    employeeId,
    date,
    serviceKey,
    today: date,
    plan: null,
    includeActual: false
  });
  return {
    availability: truth.availability || 'missing',
    absence:
      truth.absence?.status === 'approved'
        ? 'approved'
        : truth.absence?.status === 'pending'
          ? 'pending'
          : '',
    absenceId: truth.absence?.id ?? null,
    workPatternException:
      truth.workPatternException?.status === 'approved'
        ? 'approved'
        : truth.workPatternException?.status === 'pending'
          ? 'pending'
          : '',
    workPatternExceptionId: truth.workPatternException?.id ?? null,
    workPatternExceptionReason: truth.workPatternException?.reason ?? ''
  };
}

function defaultServiceTimes(
  snapshot: ManagerOperationsReadModel,
  date: string,
  serviceKey: ServiceKey
): { start: string; end: string } {
  const row = snapshot.opening_hours.find(
    (hours) => hours.weekday === weekday(date) && hours.service_key === serviceKey
  );
  return {
    start: clockLabel(row?.opens_at) || (serviceKey === 'lunch' ? '12:00' : '18:00'),
    end: clockLabel(row?.closes_at) || (serviceKey === 'lunch' ? '15:00' : '23:00')
  };
}

export function defaultPlanningShift(
  snapshot: ManagerOperationsReadModel,
  slot: Pick<
    PlanningGridSlot,
    'employeeId' | 'weekday' | 'date' | 'serviceKey'
  >
): PlanningShiftDraft | null {
  const assignmentPairs = snapshot.coverage_requirements
    .filter((item) => item.active && item.service_key === slot.serviceKey)
    .map((item) => ({
      areaId: item.area_id,
      jobFunctionId: item.job_function_id
    }))
    .filter(
      (item, index, all) =>
        item.areaId &&
        item.jobFunctionId &&
        all.findIndex(
          (candidate) =>
            candidate.areaId === item.areaId &&
            candidate.jobFunctionId === item.jobFunctionId
        ) === index
    );
  // A planned shift always carries the employee's own position: their primary
  // job function, else their first active assignment. We never inherit another
  // role from an unrelated coverage requirement.
  const employeeJob =
    snapshot.employee_job_functions.find(
      (row) => row.employee_id === slot.employeeId && row.is_primary && row.active
    )?.job_function_id ??
    snapshot.employee_job_functions.find(
      (row) => row.employee_id === slot.employeeId && row.active
    )?.job_function_id ??
    '';
  // Prefer the coverage area defined for that position, then any area for the
  // service, then the first active area.
  const assignment = {
    jobFunctionId: employeeJob,
    areaId:
      assignmentPairs.find((item) => item.jobFunctionId === employeeJob)?.areaId ??
      assignmentPairs[0]?.areaId ??
      snapshot.work_areas.find((area) => area.active)?.id ??
      ''
  };
  const times = defaultServiceTimes(snapshot, slot.date, slot.serviceKey);
  return {
    employeeId: slot.employeeId,
    weekday: slot.weekday,
    serviceKey: slot.serviceKey,
    areaId: assignment.areaId,
    jobFunctionId: assignment.jobFunctionId,
    startsAt: times.start,
    endsAt: times.end,
    source: 'manual'
  };
}

export function planningStatusForWeek(
  snapshot: ManagerOperationsReadModel,
  weekStart: string
): { planning: 'draft' | 'published'; actuals: string; revision: number } {
  const week = snapshot.work_weeks.find((item) => item.week_start === weekStart);
  return {
    planning: week?.planning_status === 'published' ? 'published' : 'draft',
    actuals: week?.actuals_status ?? 'open',
    revision: Number(week?.planning_revision ?? 0)
  };
}

export function coverageIssues(
  snapshot: ManagerOperationsReadModel,
  shifts: PlanningShiftDraft[],
  weekStart: string
): CoverageIssue[] {
  const issues: CoverageIssue[] = [];
  const requirements = snapshot.coverage_requirements.filter(
    (requirement) => requirement.active && requirement.required_count > 0
  );
  const openHours = snapshot.opening_hours.filter((hours) => hours.is_open);

  for (const opening of openHours) {
    const date = dateForWeekday(weekStart, opening.weekday);
    const keys = new Set(
      requirements
        .filter((requirement) => requirement.service_key === opening.service_key)
        .map((requirement) => {
          return `${requirement.area_id}|${requirement.job_function_id}`;
        })
    );
    for (const key of keys) {
      const [areaId, jobFunctionId] = key.split('|');
      const matching = requirements.filter(
        (requirement) =>
          requirement.service_key === opening.service_key &&
          requirement.area_id === areaId &&
          requirement.job_function_id === jobFunctionId
      );
      const requirement =
        matching.find((item) => item.weekday === opening.weekday) ??
        matching.find((item) => item.weekday === null || item.coverage_scope === 'default');
      if (!requirement || !isService(opening.service_key)) continue;
      const planned = shifts.filter(
        (shift) =>
          shift.weekday === opening.weekday &&
          shift.serviceKey === opening.service_key &&
          shift.areaId === areaId &&
          shift.jobFunctionId === jobFunctionId
      ).length;
      if (planned < requirement.required_count) {
        issues.push({
          date,
          serviceKey: opening.service_key,
          areaId,
          jobFunctionId,
          missing: requirement.required_count - planned,
          required: requirement.required_count,
          planned
        });
      }
    }
  }
  return issues;
}

export function planningConflicts(
  snapshot: ManagerOperationsReadModel,
  shifts: PlanningShiftDraft[],
  weekStart: string
): PlanningShiftDraft[] {
  return shifts.filter((shift) => {
    const date = dateForWeekday(weekStart, shift.weekday);
    const context = slotContext(snapshot, shift.employeeId, date, shift.serviceKey);
    return (
      context.availability === 'unavailable' ||
      blocksPlanningAssignment(context)
    );
  });
}

export function buildPlanningWeek(input: {
  snapshot: ManagerOperationsReadModel;
  weekStart: string;
  today: string;
  draft: PlanningShiftDraft[];
}): {
  days: WeekColumn[];
  rows: WeekRow[];
  slotsByKey: Map<string, PlanningGridSlot>;
} {
  const days: WeekColumn[] = WEEKDAYS.map((label, index) => {
    const date = dateForWeekday(input.weekStart, index + 1);
    return { weekday: index + 1, label, date, today: date === input.today, past: date < input.today };
  });
  const jobFunctionName = new Map(
    input.snapshot.job_functions.map((job) => [job.id, job.name])
  );
  const slotsByKey = new Map<string, PlanningGridSlot>();
  const scheduledEmployeeIds = new Set(input.draft.map((shift) => shift.employeeId));
  const rows: WeekRow[] = input.snapshot.employees
    // Archived people are excluded from new planning, but remain visible in a
    // week that already contains their shifts so published/history data never
    // disappears merely because the employment relationship ended.
    .filter((employee) => employee.active || scheduledEmployeeIds.has(employee.id))
    .map((employee) => {
      let weekHours = 0;
      const cells: WeekCell[] = days.map((day) => {
        const slots: WeekSlot[] = SERVICES.map((serviceKey) => {
          const key = `${employee.id}|${day.date}|${serviceKey}`;
          const shift =
            input.draft.find(
              (item) =>
                item.employeeId === employee.id &&
                item.weekday === day.weekday &&
                item.serviceKey === serviceKey
            ) ?? null;
          const truth = resolveWorkspaceServiceSlot({
            snapshot: input.snapshot,
            employeeId: employee.id,
            date: day.date,
            serviceKey,
            today: input.today,
            includeActual: false,
            plan: shift
              ? {
                  id: key,
                  startsAt: shift.startsAt,
                  endsAt: shift.endsAt,
                  contractBaseline: shift.source === 'template',
                  area:
                    (input.snapshot.work_areas ?? []).find(
                      (item) => item.id === shift.areaId
                    )?.name ?? 'No area'
                }
              : null
          });
          const slot: PlanningGridSlot = {
            key,
            employeeId: employee.id,
            employeeName: employee.display_name,
            date: day.date,
            weekday: day.weekday,
            serviceKey,
            shift,
            context: slotContext(input.snapshot, employee.id, day.date, serviceKey),
            truth
          };
          slotsByKey.set(key, slot);
          if (shift) weekHours += hoursBetweenClocks(shift.startsAt, shift.endsAt);
          return {
            key,
            serviceKey,
            presentation: projectServiceSlot(slot.truth, 'planning')
          };
        });
        return { date: day.date, slots };
      });
      return {
        id: employee.id,
        name: employee.display_name,
        meta:
          (input.snapshot.employee_job_functions ?? [])
            .filter((row) => row.employee_id === employee.id && row.active)
            .map((row) => jobFunctionName.get(row.job_function_id))
            .filter(Boolean)
            .join(', '),
        total: formatHours(weekHours),
        cells
      };
    });
  return { days, rows, slotsByKey };
}
