import type { EmployeeOperationsReadModel } from '../api/workspace-snapshot';
import { instantClockLabel } from '../calendar/service-slot.ts';
import {
  clockLabel,
  dateForWeekday,
  formatHours,
  hoursBetweenInstants,
  mondayFor,
  monthLabel,
  serviceLabel,
  weekLabel
} from '../calendar/date.ts';
import type { FourMetrics, MetricDetailRow } from '../ui/metric.ts';
import {
  availabilitySubmissionStatus,
  type AvailabilityDraft,
  type AvailabilityMode,
  type EmployeeShift,
  type EmployeeWeekSlot
} from './employee-model.ts';

// The four headline Shifts metrics for an employee's week: scheduled, worked,
// availability and leave. The route owns selection/actions; this shapes the
// per-week truth (worked/missing/leave/exception slots) from the week grid.
export function shiftsMetrics(input: {
  activeWeek: string;
  timezone: string;
  availabilityMode: AvailabilityMode;
  submission: ReturnType<typeof availabilitySubmissionStatus>;
  shifts: EmployeeShift[];
  slots: EmployeeWeekSlot[];
  availability: AvailabilityDraft[];
}): FourMetrics {
  const { activeWeek, timezone, availabilityMode, submission, shifts, slots, availability } = input;
  const scheduledHours = shifts.reduce((sum, shift) => sum + shift.hours, 0);
  const workedSlots = slots.filter((slot) =>
    ['worked', 'corrected', 'live'].includes(slot.state)
  );
  const workedHours = workedSlots.reduce(
    (sum, slot) =>
      sum +
      Math.max(
        0,
        hoursBetweenInstants(slot.entry?.clock_in_at, slot.entry?.clock_out_at) -
          Number(slot.entry?.break_minutes ?? 0) / 60
      ),
    0
  );
  const missingBadges = slots.filter((slot) => slot.state === 'missing_badge');
  const leaveSlots = slots.filter(
    (slot) => slot.state === 'leave_pending' || slot.state === 'leave_approved'
  );
  const exceptionSlots = slots.filter(
    (slot) => slot.state === 'work_pattern_pending' || slot.state === 'work_pattern_approved'
  );
  const availabilitySet = availability.filter((slot) => slot.state).length;
  return [
    {
      id: 'shifts-scheduled',
      label: 'Scheduled',
      value: formatHours(scheduledHours),
      meta: `${shifts.length} published shift${shifts.length === 1 ? '' : 's'}`,
      tone: shifts.length ? 'info' : 'neutral',
      symbol: 'S',
      detail: {
        title: 'Published schedule',
        subtitle: weekLabel(activeWeek),
        empty: 'No published shifts this week.',
        rows: shifts.map((shift) => ({
          id: shift.id,
          title: `${shift.date} · ${serviceLabel(shift.serviceKey)}`,
          meta: `${shift.area} · ${shift.jobFunction}`,
          value: `${shift.startsAt}–${shift.endsAt}`,
          tone: 'info'
        })),
        actions: [{ id: 'calendar', label: 'Open monthly calendar', href: '/calendar' }]
      }
    },
    {
      id: 'shifts-worked',
      label: 'Worked',
      value: formatHours(workedHours),
      meta: missingBadges.length
        ? `${missingBadges.length} missing badge${missingBadges.length === 1 ? '' : 's'}`
        : `${workedSlots.length} recorded service${workedSlots.length === 1 ? '' : 's'}`,
      tone: missingBadges.length ? 'warning' : workedSlots.length ? 'success' : 'neutral',
      symbol: missingBadges.length ? '!' : 'W',
      detail: {
        title: 'Worked time',
        subtitle: 'Badge truth for this week',
        empty: 'No worked time recorded this week.',
        rows: [...workedSlots, ...missingBadges].map((slot) => ({
          id: slot.key,
          title: `${slot.date} · ${serviceLabel(slot.serviceKey)}`,
          meta:
            slot.state === 'missing_badge'
              ? 'Published shift without a badge'
              : slot.state === 'corrected'
                ? slot.entry?.adjustment_reason || 'Manager correction'
                : slot.state === 'live'
                  ? `Clocked in ${instantClockLabel(slot.entry?.clock_in_at ?? null, timezone)}`
                  : `${instantClockLabel(slot.entry?.clock_in_at ?? null, timezone)}–${instantClockLabel(slot.entry?.clock_out_at ?? null, timezone)}`,
          value:
            slot.state === 'missing_badge'
              ? 'Missing'
              : formatHours(
                  Math.max(
                    0,
                    hoursBetweenInstants(slot.entry?.clock_in_at, slot.entry?.clock_out_at) -
                      Number(slot.entry?.break_minutes ?? 0) / 60
                  )
                ),
          tone:
            slot.state === 'missing_badge'
              ? 'warning'
              : slot.state === 'corrected'
                ? 'warning'
                : slot.state === 'live'
                  ? 'info'
                  : 'success'
        })),
        actions: [{ id: 'calendar', label: 'Open worked-time calendar', href: '/calendar' }]
      }
    },
    {
      id: 'shifts-availability',
      label: 'Availability',
      value:
        availabilityMode === 'manager_only'
          ? 'Managed'
          : availabilityMode === 'fixed_schedule'
            ? 'Fixed'
            : `${availabilitySet}/14`,
      meta:
        availabilityMode === 'fixed_schedule'
          ? exceptionSlots.length
            ? `${exceptionSlots.length} availability change${exceptionSlots.length === 1 ? '' : 's'} this week`
            : 'Select services below for a one-off change'
          : availabilityMode === 'manager_only'
            ? 'Maintained by your manager'
            : submission.replaceAll('_', ' '),
      tone:
        availabilityMode !== 'weekly_availability' || submission === 'submitted'
          ? 'success'
          : 'warning',
      symbol: availabilityMode !== 'weekly_availability' || submission === 'submitted' ? 'A' : '!',
      detail: {
        title: 'Availability',
        subtitle: weekLabel(activeWeek),
        empty:
          availabilityMode === 'weekly_availability'
            ? 'No availability set for this week.'
            : 'Your availability is not submitted as a weekly form.',
        rows: slots
          .filter((slot) => slot.availability || slot.absence || slot.workPatternException)
          .map((slot) => ({
            id: slot.key,
            title: `${slot.date} · ${serviceLabel(slot.serviceKey)}`,
            value: slot.absence
              ? `${slot.absence} leave`
              : slot.workPatternException
                ? `${slot.workPatternException} availability change`
                : slot.availability || 'Not set',
            tone:
              slot.absence === 'approved'
                ? 'info'
                : slot.availability === 'unavailable'
                  ? 'warning'
                  : 'success'
          })),
        actions:
          availabilityMode === 'manager_only'
            ? undefined
            : [
                {
                  id: 'focus-availability',
                  label:
                    availabilityMode === 'fixed_schedule'
                      ? 'Request availability change'
                      : 'Edit availability',
                  actionId: 'focus-availability',
                  tone: 'primary'
                }
              ]
      }
    },
    {
      id: 'shifts-leave',
      label: 'Leave',
      value: String(leaveSlots.length),
      meta: 'Services affected this week',
      tone: leaveSlots.length ? 'info' : 'neutral',
      symbol: 'L',
      detail: {
        title: 'Leave',
        subtitle: weekLabel(activeWeek),
        empty: 'No leave overlaps this week.',
        rows: leaveSlots.map((slot) => ({
          id: slot.key,
          title: `${slot.date} · ${serviceLabel(slot.serviceKey)}`,
          value: slot.absence === 'approved' ? 'Approved' : 'Pending',
          tone: slot.absence === 'approved' ? 'info' : 'warning'
        })),
        actions: [
          {
            id: 'request-leave',
            label: 'Request time off',
            actionId: 'focus-time-off',
            tone: 'primary'
          }
        ]
      }
    }
  ];
}

// The four headline Calendar metrics for an employee's month: worked hours,
// published shifts, availability model and leave. The month-scoped truth
// (entries, shifts, availability rows, absences, exceptions) is shaped here so
// the route only renders the cards and the day dialog.
export function calendarMetrics(input: {
  snapshot: EmployeeOperationsReadModel | null;
  employeeId: string;
  activeMonth: string;
  today: string;
  timezone: string;
  availabilityMode: AvailabilityMode;
  selectedDate: string;
  leaveBalance: { entitlement: number; approved: number; pending: number; remaining: number };
}): FourMetrics {
  const {
    snapshot,
    employeeId,
    activeMonth,
    today,
    timezone,
    availabilityMode,
    selectedDate,
    leaveBalance
  } = input;
  const monthPrefix = activeMonth.slice(0, 7);
  const monthEntries = (snapshot?.time_entries ?? []).filter(
    (entry) =>
      entry.employee_id === employeeId &&
      entry.business_date.startsWith(monthPrefix) &&
      entry.status !== 'cancelled'
  );
  const workedHours = monthEntries.reduce(
    (sum, entry) =>
      sum +
      Math.max(
        0,
        hoursBetweenInstants(entry.clock_in_at, entry.clock_out_at) -
          Number(entry.break_minutes ?? 0) / 60
      ),
    0
  );
  const monthShifts = (snapshot?.planned_shifts ?? [])
    .map((shift) => {
      const date = dateForWeekday(shift.week_start, shift.weekday);
      const published = (snapshot?.work_weeks ?? []).some(
        (week) =>
          week.week_start === shift.week_start && week.planning_status === 'published'
      );
      return { ...shift, date, published };
    })
    .filter(
      (shift) =>
        shift.employee_id === employeeId &&
        shift.published &&
        shift.date.startsWith(monthPrefix)
    );
  const missingBadges = monthShifts.filter(
    (shift) =>
      shift.date < today &&
      !monthEntries.some(
        (entry) =>
          entry.business_date === shift.date && entry.service_key === shift.service_key
      )
  );
  const correctedEntries = monthEntries.filter(
    (entry) => entry.status === 'adjusted' || Boolean(entry.adjusted_at)
  );
  const availabilityRows = (snapshot?.employee_availability_slots ?? []).filter(
    (slot) =>
      slot.employee_id === employeeId &&
      dateForWeekday(slot.week_start, slot.weekday).startsWith(monthPrefix)
  );
  const recurringRows = (snapshot?.recurring_schedule_slots ?? []).filter(
    (pattern) => pattern.employee_id === employeeId && pattern.active
  );
  const monthAbsences = (snapshot?.absences ?? []).filter(
    (absence) =>
      absence.employee_id === employeeId &&
      ['pending', 'approved'].includes(absence.status) &&
      absence.start_date.slice(0, 7) <= monthPrefix &&
      absence.end_date.slice(0, 7) >= monthPrefix
  );
  const monthExceptions = (snapshot?.work_pattern_exceptions ?? []).filter(
    (exception) =>
      exception.employee_id === employeeId &&
      ['pending', 'approved'].includes(exception.status) &&
      exception.start_date.slice(0, 7) <= monthPrefix &&
      exception.end_date.slice(0, 7) >= monthPrefix
  );
  return [
    {
      id: 'calendar-worked-hours',
      label: 'Worked hours',
      value: formatHours(workedHours),
      meta: correctedEntries.length
        ? `${correctedEntries.length} corrected entr${correctedEntries.length === 1 ? 'y' : 'ies'}`
        : `${monthEntries.length} time entr${monthEntries.length === 1 ? 'y' : 'ies'}`,
      tone: correctedEntries.length ? 'warning' : workedHours ? 'info' : 'neutral',
      symbol: 'W',
      detail: {
        title: 'Worked time',
        subtitle: monthLabel(activeMonth),
        empty: 'No worked time recorded this month.',
        rows: monthEntries.map((entry) => {
          const corrected = entry.status === 'adjusted' || Boolean(entry.adjusted_at);
          return {
            id: entry.id,
            title: `${entry.business_date} · ${serviceLabel(entry.service_key)}`,
            meta:
              entry.status === 'open'
                ? `Clocked in ${instantClockLabel(entry.clock_in_at, timezone)}`
                : `${instantClockLabel(entry.clock_in_at, timezone)}–${instantClockLabel(entry.clock_out_at, timezone)} · ${entry.break_minutes || 0} min break`,
            value:
              entry.status === 'open'
                ? 'Live'
                : formatHours(
                    Math.max(
                      0,
                      hoursBetweenInstants(entry.clock_in_at, entry.clock_out_at) -
                        Number(entry.break_minutes ?? 0) / 60
                    )
                  ),
            tone: entry.status === 'open' ? 'info' : corrected ? 'warning' : 'success'
          };
        })
      }
    },
    {
      id: 'calendar-published-shifts',
      label: 'Published shifts',
      value: String(monthShifts.length),
      meta: missingBadges.length
        ? `${missingBadges.length} missing badge${missingBadges.length === 1 ? '' : 's'}`
        : monthLabel(activeMonth),
      tone: missingBadges.length ? 'warning' : monthShifts.length ? 'info' : 'neutral',
      symbol: missingBadges.length ? '!' : 'S',
      detail: {
        title: 'Published shifts',
        subtitle: monthLabel(activeMonth),
        empty: 'No published shifts this month.',
        rows: monthShifts.map((shift) => {
          const missing = missingBadges.some((item) => item.id === shift.id);
          return {
            id: shift.id,
            title: `${shift.date} · ${serviceLabel(shift.service_key)}`,
            meta: `${clockLabel(shift.starts_at)}–${clockLabel(shift.ends_at)}`,
            value: missing ? 'Missing badge' : 'Published',
            tone: missing ? 'warning' : 'info'
          };
        }),
        actions: [
          {
            id: 'open-week',
            label: 'Open weekly shifts',
            href: `/shifts?week=${mondayFor(selectedDate || today)}`,
            tone: 'primary'
          }
        ]
      }
    },
    {
      id: 'calendar-availability',
      label: 'Availability',
      value:
        availabilityMode === 'manager_only'
          ? 'Managed'
          : String(
              availabilityMode === 'fixed_schedule'
                ? monthExceptions.length
                : availabilityRows.length
            ),
      meta:
        availabilityMode === 'fixed_schedule'
          ? `${recurringRows.length} recurring shifts · ${monthExceptions.length} changes`
          : availabilityMode === 'manager_only'
            ? 'Maintained by your manager'
            : 'Monthly declared service slots',
      tone:
        availabilityMode !== 'weekly_availability' || availabilityRows.length
          ? 'success'
          : 'warning',
      symbol: 'A',
      detail: {
        title: 'Availability model',
        subtitle:
          availabilityMode === 'fixed_schedule'
            ? 'Recurring contract schedule'
            : availabilityMode === 'weekly_availability'
              ? 'Weekly availability submissions'
              : 'Manager-maintained availability',
        empty: 'No availability rows for this month.',
        rows:
          availabilityMode === 'fixed_schedule'
            ? [
                ...monthExceptions.map((exception): MetricDetailRow => ({
                  id: `exception-${exception.id}`,
                  title: `${exception.start_date}–${exception.end_date}${exception.service_key ? ` · ${exception.service_key}` : ' · full day'}`,
                  meta: exception.reason,
                  value: exception.status,
                  tone: exception.status === 'pending' ? 'warning' : 'info'
                })),
                ...recurringRows.map((row): MetricDetailRow => ({
                  id: `recurring-${row.id}`,
                  title: `Weekday ${row.weekday} · ${serviceLabel(row.service_key)}`,
                  value: 'Scheduled',
                  tone: 'success'
                }))
              ]
            : availabilityRows.map((row): MetricDetailRow => ({
                id: `${row.week_start}-${row.weekday}-${row.service_key}`,
                title: `${dateForWeekday(row.week_start, row.weekday)} · ${serviceLabel(row.service_key)}`,
                value: row.availability_state,
                tone: row.availability_state === 'unavailable' ? 'warning' : 'success'
              })),
        actions:
          availabilityMode === 'manager_only'
            ? undefined
            : [
                {
                  id: 'focus-availability',
                  label:
                    availabilityMode === 'fixed_schedule'
                      ? 'Request availability change'
                      : 'Edit availability',
                  actionId: 'focus-availability',
                  tone: 'primary'
                }
              ]
      }
    },
    {
      id: 'calendar-leave',
      label: 'Leave',
      value: String(monthAbsences.length),
      meta: `${leaveBalance.remaining}d remaining · ${leaveBalance.pending}d pending`,
      tone: monthAbsences.some((absence) => absence.status === 'pending')
        ? 'warning'
        : monthAbsences.length
          ? 'info'
          : 'neutral',
      symbol: 'L',
      detail: {
        title: 'Leave',
        subtitle: monthLabel(activeMonth),
        empty: 'No leave overlaps this month.',
        rows: monthAbsences.map((absence) => ({
          id: absence.id,
          title:
            snapshot?.absence_types.find((item) => item.id === absence.absence_type_id)?.name ??
            'Leave',
          meta: `${absence.start_date}–${absence.end_date}${absence.service_key ? ` · ${absence.service_key}` : ''}`,
          value: absence.status,
          tone: absence.status === 'pending' ? 'warning' : 'info'
        })),
        actions: [
          {
            id: 'focus-request',
            label: 'Request leave',
            actionId: 'focus-leave',
            tone: 'primary'
          }
        ]
      }
    }
  ];
}
