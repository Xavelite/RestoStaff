import type {
  EmployeeOperationsReadModel,
  ManagerOperationsReadModel,
  TeamReadModel
} from '../api/workspace-snapshot.ts';
import {
  clockMinutes,
  dateForWeekday,
  instantToLocalInput,
  localInputToInstant,
  mondayFor,
  type ServiceKey
} from '../calendar/date.ts';
import type { NotificationItem } from './notification-model.ts';

type Role = 'owner' | 'manager' | 'employee';

type BaseInput = {
  restaurantId: string;
  role: Role;
  employeeId: string | null;
  today: string;
  now: Date;
  timezone: string;
};

export type ManagerNotificationInput = BaseInput & {
  role: 'owner' | 'manager';
  operations: ManagerOperationsReadModel;
  team: TeamReadModel | null;
};

export type EmployeeNotificationInput = BaseInput & {
  role: 'employee';
  operations: EmployeeOperationsReadModel;
};

export type NotificationInput = ManagerNotificationInput | EmployeeNotificationInput;

type EmployeeLookup = Pick<ManagerOperationsReadModel, 'employees'> | Pick<EmployeeOperationsReadModel, 'employees'>;
type PlannedShift = ManagerOperationsReadModel['planned_shifts'][number];
type TimeEntry = ManagerOperationsReadModel['time_entries'][number];
type Absence = ManagerOperationsReadModel['absences'][number];
type AvailabilitySubmission = ManagerOperationsReadModel['employee_availability_submissions'][number];

const LATE_GRACE_MINUTES = 10;
const RECENT_ACCEPTED_DAYS = 30;
const RECENT_DECIDED_DAYS = 30;
const SHIFT_SOON_HOURS = 24;
// No-shows are only actionable while the week is still being reconciled.
// Bounding them to recent days stops a retroactive publish of an old week from
// spamming weeks-old historical no-shows.
const NO_SHOW_LOOKBACK_DAYS = 10;

function employeeName(snapshot: EmployeeLookup, employeeId: string): string {
  return snapshot.employees.find((employee) => employee.id === employeeId)?.display_name ?? 'Employee';
}

function sortNotifications(items: NotificationItem[]): NotificationItem[] {
  return items.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

function dateTimeForShift(shift: PlannedShift): string {
  return dateForWeekday(shift.week_start, shift.weekday);
}

function shiftMessage(
  shift: PlannedShift
): Pick<NotificationItem, 'body' | 'bodyParams' | 'serviceKey'> {
  const date = dateTimeForShift(shift);
  const time = shift.starts_at && shift.ends_at
    ? ` · ${shift.starts_at.slice(0, 5)}–${shift.ends_at.slice(0, 5)}`
    : '';
  return {
    body: '{date} {service}{time}',
    bodyParams: { date, time },
    serviceKey: shift.service_key as ServiceKey
  };
}

function serviceMessage(
  date: string,
  serviceKey: string
): Pick<NotificationItem, 'body' | 'bodyParams' | 'serviceKey'> {
  return {
    body: '{date} {service}',
    bodyParams: { date },
    serviceKey: serviceKey as ServiceKey
  };
}

function availabilitySubmissionCreatedAt(submission: AvailabilitySubmission): string {
  return submission.submitted_at ?? submission.updated_at ?? submission.created_at;
}

function routeWithWeek(route: '/schedule' | '/timesheet' | '/my-service', weekStart: string): string {
  return `${route}?week=${weekStart}`;
}

function calendarRoute(date: string, serviceKey?: string | null): string {
  const query = new URLSearchParams({ date });
  if (serviceKey) query.set('service', serviceKey);
  return `/my-time?${query.toString()}`;
}

function isPastDate(date: string, today: string): boolean {
  return date < today;
}

function isWithinPastDays(value: string | null | undefined, now: Date, days: number): boolean {
  if (!value) return false;
  const time = new Date(value).getTime();
  if (!Number.isFinite(time)) return false;
  const age = now.getTime() - time;
  return age >= 0 && age <= days * 86_400_000;
}

function shiftStartsAt(shift: PlannedShift, timezone: string): Date | null {
  const date = dateTimeForShift(shift);
  const start = shift.starts_at?.slice(0, 5);
  if (!start) return null;
  // The app stores service clocks separately from dates. For sorting/soon logic,
  // treat the restaurant-local clock as the intended shift instant.
  const local = `${date}T${start}`;
  const instant = new Date(localInputToInstant(local, timezone));
  return Number.isFinite(instant.getTime()) ? instant : null;
}

function hasEntryForShift(entries: TimeEntry[], shift: PlannedShift): boolean {
  const date = dateTimeForShift(shift);
  return entries.some(
    (entry) =>
      entry.status !== 'cancelled' &&
      entry.employee_id === shift.employee_id &&
      entry.business_date === date &&
      entry.service_key === shift.service_key
  );
}

function isOpenEntry(entry: TimeEntry): boolean {
  return entry.status === 'open' || (Boolean(entry.clock_in_at) && !entry.clock_out_at && entry.status !== 'cancelled');
}

function matchingApprovedAbsence(absences: Absence[], entryOrShift: TimeEntry | PlannedShift, date: string): Absence | null {
  return (
    absences.find(
      (absence) =>
        absence.employee_id === entryOrShift.employee_id &&
        absence.status === 'approved' &&
        absence.start_date <= date &&
        absence.end_date >= date &&
        (!absence.service_key || absence.service_key === entryOrShift.service_key)
    ) ?? null
  );
}

function unavailableAvailability(
  operations: ManagerOperationsReadModel,
  shift: PlannedShift
): boolean {
  return operations.employee_availability_slots.some(
    (slot) =>
      slot.employee_id === shift.employee_id &&
      slot.week_start === shift.week_start &&
      slot.weekday === shift.weekday &&
      slot.service_key === shift.service_key &&
      slot.availability_state === 'unavailable'
  );
}

function lateEntry(
  entry: TimeEntry,
  shift: PlannedShift | undefined,
  timezone: string
): boolean {
  if (!entry.clock_in_at || !shift?.starts_at) return false;
  const planned = clockMinutes(shift.starts_at);
  const local = instantToLocalInput(entry.clock_in_at, timezone);
  const actual = clockMinutes(local.slice(11, 16));
  return planned !== null && actual !== null && actual - planned > LATE_GRACE_MINUTES;
}

function shiftForEntry(shifts: PlannedShift[], entry: TimeEntry): PlannedShift | undefined {
  if (entry.planned_shift_id) {
    const direct = shifts.find((shift) => shift.id === entry.planned_shift_id);
    if (direct) return direct;
  }
  const weekStart = mondayFor(entry.business_date);
  return shifts.find(
    (shift) =>
      shift.employee_id === entry.employee_id &&
      shift.week_start === weekStart &&
      dateTimeForShift(shift) === entry.business_date &&
      shift.service_key === entry.service_key
  );
}

function managerNotifications(input: ManagerNotificationInput): NotificationItem[] {
  const items: NotificationItem[] = [];
  const { operations, team, today, now, timezone } = input;
  const availabilityEmployeeIds = new Set(
    operations.employee_contracts
      .filter(
        (contract) =>
          contract.active &&
          contract.is_current &&
          contract.work_regime === 'weekly_availability'
      )
      .map((contract) => contract.employee_id)
  );

  for (const absence of operations.absences) {
    if (absence.status !== 'pending') continue;
    const name = employeeName(operations, absence.employee_id);
    items.push({
      key: `absence-request:${absence.id}`,
      type: 'absence_request_submitted',
      audience: 'manager',
      severity: 'attention',
      title: '{name} requested absence',
      titleParams: { name },
      body: `${absence.start_date}${absence.end_date !== absence.start_date ? ` – ${absence.end_date}` : ''}`,
      createdAt: absence.created_at,
      actionMode: 'popup',
      targetUrl: routeWithWeek('/schedule', mondayFor(absence.start_date)),
      source: { table: 'absences', id: absence.id },
      employeeId: absence.employee_id
    });
  }

  for (const submission of operations.employee_availability_submissions) {
    if (
      submission.status !== 'submitted' ||
      !submission.submitted_at ||
      !availabilityEmployeeIds.has(submission.employee_id)
    ) continue;
    const name = employeeName(operations, submission.employee_id);
    const createdAt = availabilitySubmissionCreatedAt(submission);
    items.push({
      key: `availability-submitted:${submission.employee_id}:${submission.week_start}:${createdAt}`,
      type: 'employee_availability_updated',
      audience: 'manager',
      severity: 'info',
      title: '{name} submitted availability',
      titleParams: { name },
      body: 'Week of {week}',
      bodyParams: { week: submission.week_start },
      createdAt,
      actionMode: 'route',
      targetUrl: routeWithWeek('/schedule', submission.week_start),
      source: { table: 'employee_availability_submissions', id: `${submission.employee_id}:${submission.week_start}` },
      employeeId: submission.employee_id
    });
  }

  for (const shift of operations.planned_shifts) {
    const shiftDate = dateTimeForShift(shift);
    const approvedAbsence = matchingApprovedAbsence(operations.absences, shift, shiftDate);
    const explicitlyUnavailable = unavailableAvailability(operations, shift);
    if (!approvedAbsence && !explicitlyUnavailable) continue;
    const name = employeeName(operations, shift.employee_id);
    items.push({
      key: `unavailable-planned:${shift.id}`,
      type: 'employee_unavailable_on_planned_shift',
      audience: 'manager',
      severity: approvedAbsence ? 'critical' : 'attention',
      title: '{name} is unavailable on a planned shift',
      titleParams: { name },
      ...shiftMessage(shift),
      createdAt: shift.updated_at,
      actionMode: 'route',
      targetUrl: routeWithWeek('/schedule', shift.week_start),
      source: { table: 'planned_shifts', id: shift.id }
    });
  }

  for (const entry of operations.time_entries.filter((row) => row.status !== 'cancelled')) {
    const name = employeeName(operations, entry.employee_id);
    if (isOpenEntry(entry)) {
      items.push({
        key: `forgot-badge-out:${entry.id}`,
        type: 'employee_forgot_badge_out',
        audience: 'manager',
        severity: 'attention',
        title: '{name} forgot to badge out',
        titleParams: { name },
        ...serviceMessage(entry.business_date, entry.service_key),
        createdAt: entry.updated_at,
        actionMode: 'popup',
        targetUrl: routeWithWeek('/timesheet', mondayFor(entry.business_date)),
        source: { table: 'time_entries', id: entry.id }
      });
    }

    const absence = matchingApprovedAbsence(operations.absences, entry, entry.business_date);
    if (absence) {
      items.push({
        key: `worked-approved-absence:${entry.id}:${absence.id}`,
        type: 'worked_during_approved_absence',
        audience: 'manager',
        severity: 'critical',
        title: '{name} worked during approved absence',
        titleParams: { name },
        ...serviceMessage(entry.business_date, entry.service_key),
        createdAt: entry.updated_at,
        actionMode: 'route',
        targetUrl: routeWithWeek('/timesheet', mondayFor(entry.business_date)),
        source: { table: 'time_entries', id: entry.id }
      });
    }

    const shift = shiftForEntry(operations.planned_shifts, entry);
    if (lateEntry(entry, shift, timezone)) {
      items.push({
        key: `late-badge-in:${entry.id}`,
        type: 'employee_badged_late',
        audience: 'manager',
        severity: 'info',
        title: '{name} badged in late',
        titleParams: { name },
        ...serviceMessage(entry.business_date, entry.service_key),
        createdAt: entry.clock_in_at ?? entry.updated_at,
        actionMode: 'route',
        targetUrl: routeWithWeek('/timesheet', mondayFor(entry.business_date)),
        source: { table: 'time_entries', id: entry.id }
      });
    }
  }

  for (const shift of operations.planned_shifts) {
    const week = operations.work_weeks.find((row) => row.week_start === shift.week_start);
    if (week?.planning_status !== 'published') continue;
    const date = dateTimeForShift(shift);
    if (!isPastDate(date, today) || hasEntryForShift(operations.time_entries, shift)) continue;
    // Skip historical no-shows so publishing an old week doesn't flood the bell.
    if (!isWithinPastDays(`${date}T23:59:59.000Z`, now, NO_SHOW_LOOKBACK_DAYS)) continue;
    const name = employeeName(operations, shift.employee_id);
    items.push({
      key: `no-show:${shift.id}`,
      type: 'employee_no_show',
      audience: 'manager',
      severity: 'critical',
      title: '{name} did not show up',
      titleParams: { name },
      ...shiftMessage(shift),
      createdAt: `${date}T23:59:00.000Z`,
      actionMode: 'route',
      targetUrl: routeWithWeek('/timesheet', shift.week_start),
      source: { table: 'planned_shifts', id: shift.id }
    });
  }

  for (const invitation of team?.employee_invitation_states ?? []) {
    if (invitation.status !== 'accepted' || !isWithinPastDays(invitation.accepted_at, now, RECENT_ACCEPTED_DAYS)) continue;
    const name = employeeName(operations, invitation.employee_id);
    items.push({
      key: `invite-accepted:${invitation.id}`,
      type: 'employee_invite_accepted',
      audience: 'manager',
      severity: 'success',
      title: '{name} accepted the invite',
      titleParams: { name },
      body: invitation.email,
      createdAt: invitation.accepted_at ?? invitation.sent_at,
      actionMode: 'route',
      targetUrl: '/team',
      source: { table: 'employee_invitations', id: invitation.id }
    });
  }

  return sortNotifications(items);
}

function employeeNotifications(input: EmployeeNotificationInput): NotificationItem[] {
  const items: NotificationItem[] = [];
  const { operations, employeeId, today, now, timezone } = input;
  if (!employeeId) return items;

  for (const week of operations.work_weeks) {
    if (week.planning_status !== 'published' || !week.published_at) continue;
    const hasOwnShift = operations.planned_shifts.some(
      (shift) => shift.employee_id === employeeId && shift.week_start === week.week_start
    );
    // Also notify employees who submitted availability for the week — they want
    // to know the outcome even if they were not scheduled.
    const submittedAvailability = operations.employee_availability_submissions.some(
      (submission) =>
        submission.employee_id === employeeId &&
        submission.week_start === week.week_start &&
        submission.status === 'submitted'
    );
    if (!(hasOwnShift || submittedAvailability)) continue;
    items.push({
      key: `planning-published:${week.week_start}:${week.planning_revision}`,
      type: 'planning_published',
      audience: 'employee',
      severity: 'info',
      title: hasOwnShift ? 'Your shifts are published' : 'Schedule published',
      body: hasOwnShift
        ? 'Week of {week} - see your shifts'
        : "Week of {week} - you're not scheduled",
      bodyParams: { week: week.week_start },
      createdAt: week.published_at,
      actionMode: 'route',
      targetUrl: routeWithWeek('/my-service', week.week_start),
      source: { table: 'work_weeks', id: `${input.restaurantId}:${week.week_start}` }
    });
  }

  for (const absence of operations.absences) {
    if (absence.employee_id !== employeeId || (absence.status !== 'approved' && absence.status !== 'rejected')) continue;
    const decidedAt = absence.approved_at ?? absence.rejected_at ?? absence.updated_at;
    if (!isWithinPastDays(decidedAt, now, RECENT_DECIDED_DAYS)) continue;
    const approved = absence.status === 'approved';
    items.push({
      key: `absence-decided:${absence.id}:${absence.status}`,
      type: 'absence_request_decided',
      audience: 'employee',
      severity: approved ? 'success' : 'attention',
      title: approved ? 'Absence approved' : 'Absence refused',
      body: `${absence.start_date}${absence.end_date !== absence.start_date ? ` – ${absence.end_date}` : ''}`,
      createdAt: decidedAt,
      actionMode: 'popup',
      targetUrl: calendarRoute(absence.start_date, absence.service_key),
      source: { table: 'absences', id: absence.id }
    });
  }

  for (const entry of operations.time_entries.filter((row) => row.employee_id === employeeId && row.status !== 'cancelled')) {
    if (!isOpenEntry(entry)) continue;
    items.push({
      key: `own-forgot-badge-out:${entry.id}`,
      type: 'own_forgot_badge_out',
      audience: 'employee',
      severity: 'attention',
      title: 'You forgot to badge out',
      ...serviceMessage(entry.business_date, entry.service_key),
      createdAt: entry.updated_at,
      actionMode: 'popup',
      targetUrl: routeWithWeek('/my-service', mondayFor(entry.business_date)),
      source: { table: 'time_entries', id: entry.id }
    });
  }

  for (const shift of operations.planned_shifts.filter((row) => row.employee_id === employeeId)) {
    const week = operations.work_weeks.find((row) => row.week_start === shift.week_start);
    if (week?.planning_status !== 'published') continue;
    const startsAt = shiftStartsAt(shift, timezone);
    if (!startsAt) continue;
    const untilShift = startsAt.getTime() - now.getTime();
    if (untilShift < 0 || untilShift > SHIFT_SOON_HOURS * 3_600_000) continue;
    items.push({
      key: `shift-soon:${shift.id}`,
      type: 'shift_soon',
      audience: 'employee',
      severity: 'info',
      title: 'Shift soon',
      ...shiftMessage(shift),
      createdAt: startsAt.toISOString(),
      actionMode: 'popup',
      targetUrl: routeWithWeek('/my-service', shift.week_start),
      source: { table: 'planned_shifts', id: shift.id }
    });
  }

  return sortNotifications(items);
}

export function deriveNotifications(input: NotificationInput): NotificationItem[] {
  return input.role === 'employee' ? employeeNotifications(input) : managerNotifications(input);
}
