import type { ManagerOperationsReadModel } from '../api/workspace-snapshot';
import type { Tables } from '../supabase/database.types';
import {
  SERVICES,
  WEEKDAYS,
  clockLabel,
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
import type { FourMetrics, MetricDetailRow } from '../ui/metric.ts';

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

export type CoverageIssue = {
  date: string;
  serviceKey: ServiceKey;
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

export function planningDraftForWeek(
  snapshot: ManagerOperationsReadModel,
  weekStart: string
): PlanningShiftDraft[] {
  return snapshot.planned_shifts.flatMap((shift) => {
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

export function defaultServiceTimes(
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
  const primaryJob =
    snapshot.employee_job_functions.find(
      (row) => row.employee_id === slot.employeeId && row.is_primary && row.active
    )?.job_function_id ?? '';
  const assignment =
    assignmentPairs.find((item) => item.jobFunctionId === primaryJob) ??
    assignmentPairs[0];
  if (!assignment) return null;
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
      Boolean(context.absence) ||
      Boolean(context.workPatternException)
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
  const rows: WeekRow[] = input.snapshot.employees
    .filter((employee) => employee.active)
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

// The four headline Planning metrics: planned shifts, coverage gaps,
// conflicts/pending changes and week status. Shaped here from the page's
// already-derived week inputs so the route only renders and routes actions.
export function planningMetrics(input: {
  snapshot: ManagerOperationsReadModel | null;
  grid: ReturnType<typeof buildPlanningWeek>;
  draft: PlanningShiftDraft[];
  issues: CoverageIssue[];
  conflicts: PlanningShiftDraft[];
  pendingExceptions: ManagerOperationsReadModel['work_pattern_exceptions'];
  status: ReturnType<typeof planningStatusForWeek>;
}): FourMetrics {
  const { snapshot, grid, draft, issues, conflicts, pendingExceptions, status } = input;
  const conflictEmployees = new Set(conflicts.map((shift) => shift.employeeId));
  return [
    {
      id: 'planning-planned-shifts',
      label: 'Planned shifts',
      value: String(draft.length),
      meta: 'Selected week',
      tone: 'info',
      symbol: '◫',
      href: '/planning',
      detail: {
        title: 'Planned shifts',
        subtitle: 'Employees scheduled this week',
        empty: 'No shifts planned for this week yet.',
        rows: grid.rows
          .map((row) => ({
            id: row.id,
            title: row.name,
            meta: row.meta ?? '',
            value: String(draft.filter((shift) => shift.employeeId === row.id).length)
          }))
          .filter((row) => row.value !== '0'),
        actions: [{ id: 'open-planning', label: 'Open Planning', href: '/planning', tone: 'primary' }]
      }
    },
    {
      id: 'planning-coverage-gaps',
      label: 'Coverage gaps',
      value: String(issues.length),
      meta: issues.length ? 'Services under target' : 'Requirements met',
      tone: issues.length ? 'warning' : 'success',
      symbol: issues.length ? '!' : '✓',
      href: '/planning',
      detail: {
        title: 'Coverage gaps',
        subtitle: 'Services below their required staffing',
        empty: 'Every required service meets its coverage.',
        rows: issues.map((issue): MetricDetailRow => ({
          id: `${issue.date}-${issue.serviceKey}`,
          title: `${issue.date} · ${issue.serviceKey}`,
          meta: `${issue.planned}/${issue.required} planned`,
          value: `${issue.missing} short`,
          tone: 'warning'
        })),
        actions: [
          { id: 'open-planning', label: 'Open Planning', href: '/planning', tone: 'primary' },
          { id: 'open-coverage-setup', label: 'Review coverage setup', href: '/restaurant' }
        ]
      }
    },
    {
      id: 'planning-conflicts',
      label: 'Conflicts',
      value: String(conflicts.length + pendingExceptions.length),
      meta: conflicts.length
        ? `${conflicts.length} blocking · ${pendingExceptions.length} pending`
        : pendingExceptions.length
          ? `${pendingExceptions.length} schedule change request${pendingExceptions.length === 1 ? '' : 's'}`
          : 'No conflicts or requests',
      tone: conflicts.length ? 'danger' : pendingExceptions.length ? 'warning' : 'success',
      symbol: conflicts.length || pendingExceptions.length ? '!' : '✓',
      href: '/planning',
      detail: {
        title: 'Conflicts and schedule changes',
        subtitle: 'Blocking planned shifts and pending employee decisions',
        empty: 'No availability, leave or fixed-schedule change issues.',
        rows: [
          ...grid.rows
            .filter((row) => conflictEmployees.has(row.id))
            .map((row): MetricDetailRow => ({
              id: `conflict-${row.id}`,
              title: row.name,
              meta: row.meta ?? 'Planned outside availability, leave or a schedule change',
              value: 'Blocking',
              tone: 'danger'
            })),
          ...pendingExceptions.map((item): MetricDetailRow => ({
            id: `exception-${item.id}`,
            title:
              snapshot?.employees.find((employee) => employee.id === item.employee_id)
                ?.display_name ?? 'Employee',
            meta: `${item.start_date}–${item.end_date}${item.service_key ? ` · ${item.service_key}` : ' · full day'} · ${item.reason}`,
            value: 'Pending',
            tone: 'warning'
          }))
        ],
        actions: [
          {
            id: 'show-planning-conflicts',
            label: 'Review in Planning',
            actionId: 'show-planning-conflicts',
            tone: 'primary'
          }
        ]
      }
    },
    {
      id: 'planning-status',
      label: 'Status',
      value: status.planning === 'published' ? 'Published' : 'Draft',
      meta: `Actuals ${status.actuals}`,
      tone: status.planning === 'published' ? 'success' : 'neutral',
      symbol: status.planning === 'published' ? '✓' : '•',
      href: '/planning',
      detail: {
        title: 'Week status',
        subtitle: 'Where this week sits in the workflow',
        rows: [
          {
            id: 'planning',
            title: 'Planning',
            value: status.planning === 'published' ? 'Published' : 'Draft',
            tone: status.planning === 'published' ? 'success' : 'neutral'
          },
          { id: 'actuals', title: 'Actuals', value: status.actuals, tone: 'neutral' }
        ],
        actions: [{ id: 'open-planning', label: 'Open Planning', href: '/planning', tone: 'primary' }]
      }
    }
  ];
}
