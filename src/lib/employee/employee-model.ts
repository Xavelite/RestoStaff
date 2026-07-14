import type { EmployeeOperationsReadModel } from '../api/workspace-snapshot';
import type { Database } from '../supabase/database.types';
import { buildMonthDays, type CalendarDay, type ServiceSlotPresentation } from '../calendar/calendar-model.ts';
import type { WeekCell, WeekColumn, WeekRow, WeekSlot } from '../calendar/week-grid';
import {
  instantClockLabel,
  resolveWorkspaceServiceSlot,
  projectServiceSlot,
  type ServiceSlotPlan,
  type ServiceSlotState
} from '../calendar/service-slot.ts';
import {
  SERVICES,
  WEEKDAYS,
  addDays,
  clockLabel,
  clockMinutes,
  dateForWeekday,
  formatHours,
  hoursBetweenClocks,
  hoursBetweenInstants,
  mondayFor,
  monthLabel,
  weekLabel,
  type ServiceKey
} from '../calendar/date.ts';
import { workPatternExceptionOverlaps } from '../work-pattern-exceptions/work-pattern-exception.ts';
import type { EmployeeServiceDraft } from './employee-self-service.ts';

type OperationalEnums = Database['public']['Enums'];

export type AvailabilityState = OperationalEnums['service_availability_state'] | '';
export type AvailabilityMode = OperationalEnums['work_regime'];
export type EmployeeSlotState = ServiceSlotState;

export type AvailabilityDraft = {
  date: string;
  serviceKey: ServiceKey;
  state: AvailabilityState;
};

export type SelectableAvailability = 'available' | 'unavailable';

export const SELECTABLE_AVAILABILITY: ReadonlyArray<{
  value: SelectableAvailability;
  label: string;
  icon: string;
}> = [
  { value: 'available', label: 'Available', icon: '✓' },
  { value: 'unavailable', label: 'Unavailable', icon: '✕' }
];

export function availabilityUpdateHint(state: AvailabilityState): string {
  if (state === 'available') return 'Your manager can schedule you for this service.';
  if (state === 'partial') {
    return 'Your saved availability needs updating. Choose available or unavailable.';
  }
  if (state === 'unavailable') return "You've told your manager you can't work this service.";
  return 'Tap a state to tell your manager how this service works for you.';
}

export type EmployeeShift = {
  id: string;
  date: string;
  weekday: number;
  serviceKey: ServiceKey;
  startsAt: string;
  endsAt: string;
  area: string;
  jobFunction: string;
  hours: number;
};

export type EmployeeWeekSlot = {
  key: string;
  date: string;
  serviceKey: ServiceKey;
  shift: EmployeeShift | null;
  entry: EmployeeOperationsReadModel['time_entries'][number] | null;
  availability: AvailabilityState;
  absence: 'pending' | 'approved' | '';
  absenceType: string;
  workPatternException: 'pending' | 'approved' | '';
  workPatternExceptionId: string | null;
  workPatternExceptionReason: string;
  state: EmployeeSlotState;
  truth: import('../calendar/service-slot.ts').ServiceSlotTruth;
  editable: boolean;
  editReason: string;
};

export function nextEmployeeService(
  slots: ReadonlyArray<EmployeeWeekSlot>,
  localNow: { date: string; minutes: number }
): EmployeeWeekSlot | null {
  return (
    slots
      .filter((slot) => {
        if (!slot.shift || slot.date < localNow.date) return false;
        if (slot.date > localNow.date) return true;
        const start = clockMinutes(slot.shift.startsAt);
        return start !== null && start > localNow.minutes;
      })
      .sort(
        (a, b) =>
          `${a.date}-${a.shift?.startsAt ?? ''}`.localeCompare(
            `${b.date}-${b.shift?.startsAt ?? ''}`
          )
      )[0] ?? null
  );
}

export function employeeForId(snapshot: EmployeeOperationsReadModel, employeeId: string | null) {
  return snapshot.employees.find((employee) => employee.id === employeeId) ?? null;
}

export function publishedShiftsForWeek(
  snapshot: EmployeeOperationsReadModel,
  employeeId: string,
  weekStart: string
): EmployeeShift[] {
  const published =
    snapshot.work_weeks.find((week) => week.week_start === weekStart)?.planning_status ===
    'published';
  if (!published) return [];
  return snapshot.planned_shifts
    .filter((shift) => shift.employee_id === employeeId && shift.week_start === weekStart)
    .map((shift) => {
      const serviceKey: ServiceKey =
        shift.service_key === 'evening' ? 'evening' : 'lunch';
      return {
        id: shift.id,
        date: dateForWeekday(weekStart, shift.weekday),
        weekday: shift.weekday,
        serviceKey,
        startsAt: clockLabel(shift.starts_at),
        endsAt: clockLabel(shift.ends_at),
        area:
          (snapshot.work_areas ?? []).find((area) => area.id === shift.area_id)?.name ??
          'Any area',
        jobFunction:
          snapshot.job_functions.find((job) => job.id === shift.job_function_id)?.name ??
          'Team member',
        hours: hoursBetweenClocks(shift.starts_at, shift.ends_at)
      };
    })
    .sort((a, b) => a.date.localeCompare(b.date) || a.serviceKey.localeCompare(b.serviceKey));
}

// CDI/CDD employees plan leave against their recurring contract schedule, which
// exists before the manager publishes a week. Project the active recurring slots
// onto the week's dates so a fixed-schedule employee always has shifts to act on.
// Approved work-pattern changes that drop a slot are honoured, and open slot
// times fall back to the standard service window. See the
// employee-cdi-time-off-basis decision.
function contractShiftsForWeek(
  snapshot: EmployeeOperationsReadModel,
  employeeId: string,
  weekStart: string
): EmployeeShift[] {
  return (snapshot.recurring_schedule_slots ?? [])
    .filter(
      (slot) =>
        slot.active &&
        slot.employee_id === employeeId &&
        (slot.service_key === 'lunch' || slot.service_key === 'evening') &&
        Number.isInteger(slot.weekday) &&
        slot.weekday >= 1 &&
        slot.weekday <= 7
    )
    .flatMap((slot) => {
      const serviceKey: ServiceKey = slot.service_key === 'evening' ? 'evening' : 'lunch';
      const date = dateForWeekday(weekStart, slot.weekday);
      const dropped = (snapshot.work_pattern_exceptions ?? []).some(
        (row) =>
          row.status === 'approved' &&
          workPatternExceptionOverlaps(row, employeeId, date, serviceKey)
      );
      if (dropped) return [];
      const startsAt = clockLabel(slot.starts_at) || (serviceKey === 'lunch' ? '12:00' : '18:00');
      const endsAt = clockLabel(slot.ends_at) || (serviceKey === 'lunch' ? '15:00' : '23:00');
      return [
        {
          id: `contract-${slot.id}`,
          date,
          weekday: slot.weekday,
          serviceKey,
          startsAt,
          endsAt,
          area: 'Fixed schedule',
          jobFunction: 'Recurring shift',
          hours: hoursBetweenClocks(startsAt, endsAt)
        }
      ];
    })
    .sort((a, b) => a.date.localeCompare(b.date) || a.serviceKey.localeCompare(b.serviceKey));
}

export function contractPlanForDate(
  snapshot: EmployeeOperationsReadModel,
  employeeId: string,
  availabilityMode: AvailabilityMode | undefined,
  date: string,
  serviceKey: ServiceKey,
  contractByWeek = new Map<string, EmployeeShift[]>()
): ServiceSlotPlan | null | undefined {
  if (availabilityMode !== 'fixed_schedule') return undefined;
  const weekStart = mondayFor(date);
  const published =
    snapshot.work_weeks.find((week) => week.week_start === weekStart)?.planning_status ===
    'published';
  if (published) return undefined;
  if (!contractByWeek.has(weekStart)) {
    contractByWeek.set(weekStart, contractShiftsForWeek(snapshot, employeeId, weekStart));
  }
  const shift = contractByWeek
    .get(weekStart)!
    .find((item) => item.date === date && item.serviceKey === serviceKey);
  return shift
    ? {
        id: shift.id,
        startsAt: shift.startsAt,
        endsAt: shift.endsAt,
        area: shift.area,
        contractBaseline: true
      }
    : null;
}

export function availabilityForWeek(
  snapshot: EmployeeOperationsReadModel,
  employeeId: string,
  weekStart: string
): AvailabilityDraft[] {
  return Array.from({ length: 7 }, (_, index) => index + 1).flatMap((weekday) =>
    SERVICES.map((serviceKey) => {
      const row = snapshot.employee_availability_slots.find(
        (slot) =>
          slot.employee_id === employeeId &&
          slot.week_start === weekStart &&
          slot.weekday === weekday &&
          slot.service_key === serviceKey
      );
      const state = row?.availability_state ?? '';
      return {
        date: dateForWeekday(weekStart, weekday),
        serviceKey,
        state
      };
    })
  );
}

export function availabilitySubmissionStatus(
  snapshot: EmployeeOperationsReadModel,
  employeeId: string,
  weekStart: string
): OperationalEnums['availability_submission_status'] | 'not submitted' {
  return (
    snapshot.employee_availability_submissions.find(
      (row) => row.employee_id === employeeId && row.week_start === weekStart
    )?.status ?? 'not submitted'
  );
}

function serviceDraftFor(
  drafts: EmployeeServiceDraft[],
  date: string,
  serviceKey: ServiceKey
): EmployeeServiceDraft | null {
  return drafts.find((draft) => draft.date === date && draft.serviceKey === serviceKey) ?? null;
}

function withServiceDraft(
  presentation: ServiceSlotPresentation,
  draft: EmployeeServiceDraft | null
): ServiceSlotPresentation {
  if (!draft) return presentation;
  return {
    background: 'warning',
    card: {
      id: `draft-${draft.date}-${draft.serviceKey}`,
      label: draft.label,
      meta: draft.meta ?? 'Pending submission',
      tone: 'pending',
      serviceKey: draft.serviceKey,
      interaction: 'select'
    },
    attention: presentation.attention
  };
}

export function buildEmployeeWeek(input: {
  snapshot: EmployeeOperationsReadModel;
  employeeId: string;
  weekStart: string;
  today: string;
  availability: AvailabilityDraft[];
  availabilityMode: AvailabilityMode;
  serviceDrafts?: EmployeeServiceDraft[];
}): {
  days: WeekColumn[];
  rows: WeekRow[];
  slotsByKey: Map<string, EmployeeWeekSlot>;
} {
  const employee = employeeForId(input.snapshot, input.employeeId);
  const published =
    input.snapshot.work_weeks.find((week) => week.week_start === input.weekStart)
      ?.planning_status === 'published';
  // Fixed-schedule employees act on their recurring contract shifts before the
  // week is published; everyone else only sees the published plan.
  const shifts =
    input.availabilityMode === 'fixed_schedule' && !published
      ? contractShiftsForWeek(input.snapshot, input.employeeId, input.weekStart)
      : publishedShiftsForWeek(input.snapshot, input.employeeId, input.weekStart);
  const days: WeekColumn[] = WEEKDAYS.map((label, index) => {
    const date = dateForWeekday(input.weekStart, index + 1);
    return { weekday: index + 1, label, date, today: date === input.today, past: date < input.today };
  });
  const slotsByKey = new Map<string, EmployeeWeekSlot>();
  const cells: WeekCell[] = days.map((day) => {
    const slots: WeekSlot[] = SERVICES.map((serviceKey) => {
      const key = `${input.employeeId}|${day.date}|${serviceKey}`;
      const shift =
        shifts.find((item) => item.date === day.date && item.serviceKey === serviceKey) ??
        null;
      const availability =
        input.availabilityMode === 'weekly_availability'
          ? input.availability.find(
              (item) => item.date === day.date && item.serviceKey === serviceKey
            )?.state ?? ''
          : '';
      const truth = resolveWorkspaceServiceSlot({
        snapshot: input.snapshot,
        employeeId: input.employeeId,
        date: day.date,
        serviceKey,
        today: input.today,
        plan: shift
          ? {
              id: shift.id,
              startsAt: shift.startsAt,
              endsAt: shift.endsAt,
              area: shift.area
            }
          : null,
        availability
      });
      const absenceState: EmployeeWeekSlot['absence'] =
        truth.absence?.status === 'approved'
          ? 'approved'
          : truth.absence?.status === 'pending'
            ? 'pending'
            : '';
      const absenceType = truth.absence
        ? input.snapshot.absence_types.find((type) => type.id === truth.absence?.absence_type_id)
            ?.name ?? 'Time off'
        : '';
      const baseSlot: Omit<EmployeeWeekSlot, 'state' | 'truth' | 'editable' | 'editReason'> = {
        key,
        date: day.date,
        serviceKey,
        shift,
        entry: truth.entry,
        availability,
        absence: absenceState,
        absenceType,
        workPatternException:
          truth.workPatternException?.status === 'approved'
            ? 'approved'
            : truth.workPatternException?.status === 'pending'
              ? 'pending'
              : '',
        workPatternExceptionId: truth.workPatternException?.id ?? null,
        workPatternExceptionReason: truth.workPatternException?.reason ?? ''
      };
      // The employee's own time off must stay visible on their schedule even
      // when they are also scheduled: a pending or approved leave request is
      // surfaced here instead of being hidden behind the published plan (which
      // the shared resolver ranks first, correctly, for the manager view). Only
      // a real worked entry outranks it.
      let state = truth.state;
      if (!truth.entry) {
        if (truth.absence?.status === 'approved') state = 'leave_approved';
        else if (truth.absence?.status === 'pending') state = 'leave_pending';
      }
      const editable =
        input.availabilityMode === 'weekly_availability' &&
        day.date >= input.today &&
        !published &&
        !truth.entry &&
        baseSlot.absence !== 'approved' &&
        baseSlot.workPatternException !== 'approved';
      const editReason =
        input.availabilityMode !== 'weekly_availability'
          ? input.availabilityMode === 'fixed_schedule'
            ? shift
              ? 'Tap the shift to request time off.'
              : 'No planned shift.'
            : 'Availability is maintained by your manager.'
          : day.date < input.today
            ? 'Past availability is read-only.'
            : published
              ? 'Availability is locked once the week is published.'
              : truth.entry
                ? 'Worked time cannot be replaced by availability.'
                : baseSlot.absence === 'approved'
                  ? 'Approved leave already covers this service.'
                  : baseSlot.workPatternException === 'approved'
                    ? 'An approved schedule change covers this service.'
                  : '';
      const slot: EmployeeWeekSlot = { ...baseSlot, state, truth, editable, editReason };
      slotsByKey.set(key, slot);
      return {
        key,
        serviceKey,
        presentation: withServiceDraft(
          projectServiceSlot(truth, 'employee'),
          serviceDraftFor(input.serviceDrafts ?? [], day.date, serviceKey)
        )
      };
    });
    return { date: day.date, slots };
  });
  const total = shifts.reduce((sum, shift) => sum + shift.hours, 0);
  return {
    days,
    rows: employee
      ? [
          {
            id: employee.id,
            name: employee.display_name,
            meta: 'Your week',
            total: formatHours(total),
            cells
          }
        ]
      : [],
    slotsByKey
  };
}

function absenceForDate(snapshot: EmployeeOperationsReadModel, employeeId: string, date: string) {
  return snapshot.absences.filter(
    (absence) =>
      absence.employee_id === employeeId &&
      absence.start_date <= date &&
      absence.end_date >= date &&
      ['pending', 'approved'].includes(absence.status)
  );
}

function exceptionsForDate(
  snapshot: EmployeeOperationsReadModel,
  employeeId: string,
  date: string
) {
  return (snapshot.work_pattern_exceptions ?? []).filter(
    (exception) =>
      exception.employee_id === employeeId &&
      exception.start_date <= date &&
      exception.end_date >= date &&
      (exception.status === 'pending' || exception.status === 'approved')
  );
}

export function employeeMonth(
  snapshot: EmployeeOperationsReadModel,
  employeeId: string,
  month: string,
  selectedDate: string,
  today: string,
  availabilityOverrides: AvailabilityDraft[] = [],
  serviceDrafts: EmployeeServiceDraft[] = [],
  availabilityMode?: AvailabilityMode
): CalendarDay[] {
  // Mirror the week view: a fixed-schedule employee sees their recurring
  // contract shifts on unpublished weeks too, so the monthly calendar and the
  // My service page agrees on what is scheduled. Computed once per week.
  const contractByWeek = new Map<string, EmployeeShift[]>();
  return buildMonthDays({
    month,
    selectedDate,
    today,
    slotsForDate: (date) =>
      SERVICES.map((serviceKey) => {
        const presentation = withServiceDraft(
          projectServiceSlot(
            resolveWorkspaceServiceSlot({
              snapshot,
              employeeId,
              date,
              serviceKey,
              today,
              plan: contractPlanForDate(
                snapshot,
                employeeId,
                availabilityMode,
                date,
                serviceKey,
                contractByWeek
              ),
              availability:
                availabilityMode === 'weekly_availability'
                  ? availabilityOverrides.find(
                      (item) => item.date === date && item.serviceKey === serviceKey
                    )?.state
                  : ''
            }),
            'employee'
          ),
          serviceDraftFor(serviceDrafts, date, serviceKey)
        );
        return {
          key: `${employeeId}|${date}|${serviceKey}`,
          serviceKey,
          presentation
        };
      }),
    totalForDate: (date) => {
      const hours = snapshot.time_entries
        .filter(
          (entry) =>
            entry.employee_id === employeeId &&
            entry.business_date === date &&
            entry.status !== 'cancelled'
        )
        .reduce(
          (sum, entry) =>
            sum +
            Math.max(
              0,
              hoursBetweenInstants(entry.clock_in_at, entry.clock_out_at) -
                Number(entry.break_minutes ?? 0) / 60
            ),
          0
        );
      return hours ? formatHours(hours) : '';
    },
    weekTotalForWeek: (weekStart) => {
      const hours = snapshot.time_entries
        .filter(
          (entry) =>
            entry.employee_id === employeeId &&
            entry.business_date >= weekStart &&
            entry.business_date <= addDays(weekStart, 6) &&
            entry.status !== 'cancelled'
        )
        .reduce(
          (sum, entry) =>
            sum +
            Math.max(
              0,
              hoursBetweenInstants(entry.clock_in_at, entry.clock_out_at) -
                Number(entry.break_minutes ?? 0) / 60
            ),
          0
        );
      return hours ? formatHours(hours) : '—';
    }
  });
}

export function employeeDayDetails(
  snapshot: EmployeeOperationsReadModel,
  employeeId: string,
  date: string
) {
  const weekStart = mondayFor(date);
  const weekday = Math.floor((new Date(`${date}T12:00:00Z`).getUTCDay() + 6) % 7) + 1;
  return {
    shifts: publishedShiftsForWeek(snapshot, employeeId, weekStart).filter(
      (shift) => shift.date === date
    ),
    entries: snapshot.time_entries.filter(
      (entry) =>
        entry.employee_id === employeeId &&
        entry.business_date === date &&
        entry.status !== 'cancelled'
    ),
    absences: absenceForDate(snapshot, employeeId, date),
    workPatternExceptions: exceptionsForDate(snapshot, employeeId, date),
    availability: snapshot.employee_availability_slots.filter(
      (row) =>
        row.employee_id === employeeId &&
        dateForWeekday(row.week_start, row.weekday) === date
    ),
    recurring: snapshot.recurring_schedule_slots.filter(
      (row) =>
        row.employee_id === employeeId &&
        row.weekday === weekday &&
        row.active
    )
  };
}
