import type { WorkspaceRole } from '$lib/api/workspace';
import type { ManagerOperationsReadModel } from '$lib/api/workspace-snapshot';
import { serviceLabel } from '../calendar/date.ts';

export type Tone = 'success' | 'warning' | 'danger' | 'info' | 'neutral';


export type HomeLiveRow = {
  employeeId: string;
  name: string;
  role: string;
  range: string;
  status: string;
  tone: Tone;
  startMinutes: number;
  // Full-mode extras: a rich one-line stat (X min late, worked time, starts in)
  // and, when working now, the clock-in instant so the view can tick live.
  detail: string;
  liveSince?: string | null;
};

function liveMinutesLabel(minutes: number): string {
  const total = Math.max(0, Math.round(minutes));
  if (total < 60) return `${total} min`;
  const hours = Math.floor(total / 60);
  const rest = total % 60;
  return rest ? `${hours}h ${rest}m` : `${hours}h`;
}

export type HomeActionRow = {
  key: 'leave' | 'payroll' | 'planning' | 'availability';
  label: string;
  meta: string;
  count: number;
  tone: Tone;
  href: string;
  symbol: string;
  items: Array<{ id: string; label: string; meta: string }>;
};

export type HomePulseRow = {
  label: string;
  value: string;
  meta: string;
  tone: Tone;
  href: string;
};

export type HomeModel = {
  weekLabel: string;
  live: {
    working: number;
    late: number;
    upcoming: number;
    rows: HomeLiveRow[];
    todayRoster: HomeLiveRow[];
  };
  actions: {
    total: number;
    rows: HomeActionRow[];
  };
  pulse: {
    tone: Tone;
    rows: HomePulseRow[];
  };
};

const LATE_THRESHOLD_MINUTES = 45;
const DAY_MS = 86_400_000;

function liveTonePriority(tone: Tone) {
  if (tone === 'danger') return 0;
  if (tone === 'warning') return 1;
  if (tone === 'success') return 2;
  return 3;
}

function combineLiveRowsByEmployee(rows: HomeLiveRow[]): HomeLiveRow[] {
  const groups = new Map<string, HomeLiveRow[]>();
  for (const row of rows) {
    const existing = groups.get(row.employeeId) ?? [];
    existing.push(row);
    groups.set(row.employeeId, existing);
  }

  return [...groups.values()]
    .map((employeeRows) => {
      const sorted = [...employeeRows].sort(
        (a, b) => a.startMinutes - b.startMinutes || liveTonePriority(a.tone) - liveTonePriority(b.tone)
      );
      const lead = [...sorted].sort(
        (a, b) => liveTonePriority(a.tone) - liveTonePriority(b.tone) || a.startMinutes - b.startMinutes
      )[0];
      const statuses = [...new Set(sorted.map((row) => row.status))];
      return {
        ...lead,
        range: sorted.map((row) => row.range).join(' / '),
        status: sorted.length > 1 ? `${sorted.length} shifts / ${statuses.join(', ')}` : lead.status,
        startMinutes: sorted[0].startMinutes
      };
    })
    .sort(
      (a, b) => liveTonePriority(a.tone) - liveTonePriority(b.tone) || a.startMinutes - b.startMinutes
    );
}

function text(value: unknown): string {
  return String(value ?? '').trim();
}

function localDateParts(now: Date, timezone: string) {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23'
  });
  const parts = Object.fromEntries(
    formatter
      .formatToParts(now)
      .filter((part) => part.type !== 'literal')
      .map((part) => [part.type, part.value])
  );
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    minutes: Number(parts.hour) * 60 + Number(parts.minute)
  };
}

function addDays(isoDate: string, days: number): string {
  const date = new Date(`${isoDate}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function mondayFor(isoDate: string): string {
  const date = new Date(`${isoDate}T00:00:00Z`);
  const offset = (date.getUTCDay() + 6) % 7;
  return addDays(isoDate, -offset);
}

function weekdayFor(isoDate: string): number {
  const day = new Date(`${isoDate}T00:00:00Z`).getUTCDay();
  return day === 0 ? 7 : day;
}

function clockMinutes(value: string | null): number | null {
  const match = text(value).match(/^(\d{1,2}):(\d{2})/);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  return hours >= 0 && hours <= 23 && minutes >= 0 && minutes <= 59
    ? hours * 60 + minutes
    : null;
}

function clockLabel(value: string | null): string {
  const minutes = clockMinutes(value);
  if (minutes === null) return '';
  return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
}

function clockRange(start: string | null, end: string | null): string {
  const from = clockLabel(start);
  const to = clockLabel(end);
  return from && to ? `${from}-${to}` : from;
}

function hoursBetweenClocks(start: string | null, end: string | null): number {
  const from = clockMinutes(start);
  const to = clockMinutes(end);
  if (from === null || to === null) return 0;
  const duration = to >= from ? to - from : to + 1440 - from;
  return duration / 60;
}

function hoursBetweenInstants(start: string | null, end: string | null): number {
  if (!start || !end) return 0;
  const duration = new Date(end).getTime() - new Date(start).getTime();
  return Number.isFinite(duration) && duration > 0 ? duration / 3_600_000 : 0;
}

function formatHours(value: number): string {
  const minutes = Math.max(0, Math.round(value * 60));
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return remainder ? `${hours}h${String(remainder).padStart(2, '0')}` : `${hours}h`;
}

function formatWeekRange(weekStart: string): string {
  const start = new Date(`${weekStart}T00:00:00Z`);
  const end = new Date(start.getTime() + 6 * DAY_MS);
  const formatter = new Intl.DateTimeFormat('en-GB', {
    day: '2-digit',
    month: 'short',
    timeZone: 'UTC'
  });
  return `${formatter.format(start)} - ${formatter.format(end)}`;
}

function formatInstant(value: string | null, timezone: string): string {
  if (!value) return '';
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return '';
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: timezone,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23'
  }).format(date);
}

function countLabel(count: number, singular: string, plural = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

export function buildHomeModel(
  snapshot: ManagerOperationsReadModel,
  role: WorkspaceRole,
  now = new Date()
): HomeModel {
  const timezone = text(snapshot.restaurant_settings.timezone) || 'Europe/Brussels';
  const localNow = localDateParts(now, timezone);
  const weekStart = mondayFor(localNow.date);
  const weekEnd = addDays(weekStart, 6);

  const employees = snapshot.employees.filter((employee) => employee.active);
  const employeesById = new Map(employees.map((employee) => [employee.id, employee]));
  const jobFunctionsById = new Map(
    snapshot.job_functions.map((jobFunction) => [jobFunction.id, jobFunction])
  );
  const primaryJobFunctionByEmployee = new Map(
    (snapshot.employee_job_functions ?? [])
      .filter((row) => row.active && row.is_primary)
      .map((row) => [row.employee_id, row.job_function_id])
  );
  const roleForEmployee = (employeeId: string, jobFunctionId?: string | null) => {
    const id = jobFunctionId || primaryJobFunctionByEmployee.get(employeeId);
    return (id && jobFunctionsById.get(id)?.name) || 'Team';
  };

  const planned = snapshot.planned_shifts
    .filter((shift) => shift.week_start === weekStart)
    .map((shift) => ({
      ...shift,
      date: addDays(shift.week_start, shift.weekday - 1),
      startMinutes: clockMinutes(shift.starts_at) ?? 0,
      range: clockRange(shift.starts_at, shift.ends_at)
    }))
    .filter((shift) => employeesById.has(shift.employee_id));

  const actuals = snapshot.time_entries.filter(
    (entry) =>
      entry.status !== 'cancelled' &&
      entry.business_date >= weekStart &&
      entry.business_date <= weekEnd
  );
  const actualsBySlot = new Map(
    actuals.map((entry) => [
      `${entry.employee_id}|${entry.business_date}|${entry.service_key}`,
      entry
    ])
  );
  const plannedBySlot = new Map(
    planned.map((shift) => [
      `${shift.employee_id}|${shift.date}|${shift.service_key}`,
      shift
    ])
  );

  const hasApprovedAbsence = (employeeId: string, date: string, serviceKey: string) =>
    snapshot.absences.some(
      (absence) =>
        absence.employee_id === employeeId &&
        absence.status === 'approved' &&
        absence.start_date <= date &&
        absence.end_date >= date &&
        (!absence.service_key || absence.service_key === serviceKey)
    );

  const liveRows: HomeLiveRow[] = actuals
    .filter(
      (entry) =>
        entry.business_date === localNow.date && Boolean(entry.clock_in_at) && !entry.clock_out_at
    )
    .map((entry) => {
      const employee = employeesById.get(entry.employee_id);
      const plan = plannedBySlot.get(
        `${entry.employee_id}|${entry.business_date}|${entry.service_key}`
      );
      const clockIn = formatInstant(entry.clock_in_at, timezone);
      return {
        employeeId: entry.employee_id,
        name: employee?.display_name || 'Employee',
        role: roleForEmployee(entry.employee_id, plan?.job_function_id),
        range: plan?.range || `${clockIn}-live`,
        status: plan ? 'Working now' : 'Unplanned live',
        tone: plan ? 'success' : 'warning',
        startMinutes: plan?.startMinutes ?? clockMinutes(clockIn) ?? 0,
        detail: plan ? `On the floor | in since ${clockIn}` : `Unplanned | in since ${clockIn}`,
        liveSince: entry.clock_in_at
      };
    });

  const todayPlanned = planned.filter((shift) => shift.date === localNow.date);
  const lateRows: HomeLiveRow[] = todayPlanned
    .filter((shift) => {
      const actual = actualsBySlot.get(
        `${shift.employee_id}|${shift.date}|${shift.service_key}`
      );
      return (
        shift.startMinutes <= localNow.minutes &&
        !actual?.clock_in_at &&
        !hasApprovedAbsence(shift.employee_id, shift.date, shift.service_key)
      );
    })
    .map((shift) => {
      const employee = employeesById.get(shift.employee_id);
      return {
        employeeId: shift.employee_id,
        name: employee?.display_name || 'Employee',
        role: roleForEmployee(shift.employee_id, shift.job_function_id),
        range: shift.range,
        status:
          localNow.minutes - shift.startMinutes > LATE_THRESHOLD_MINUTES ? 'No-show' : 'Late',
        tone: 'danger',
        startMinutes: shift.startMinutes,
        detail:
          localNow.minutes - shift.startMinutes > LATE_THRESHOLD_MINUTES
            ? `No badge | ${liveMinutesLabel(localNow.minutes - shift.startMinutes)} overdue`
            : `${liveMinutesLabel(localNow.minutes - shift.startMinutes)} late`
      };
    });

  const upcomingRows: HomeLiveRow[] = todayPlanned
    .filter((shift) => shift.startMinutes > localNow.minutes)
    .map((shift) => {
      const employee = employeesById.get(shift.employee_id);
      return {
        employeeId: shift.employee_id,
        name: employee?.display_name || 'Employee',
        role: roleForEmployee(shift.employee_id, shift.job_function_id),
        range: shift.range,
        status: 'Upcoming',
        tone: 'neutral' as Tone,
        startMinutes: shift.startMinutes,
        detail: `Starts in ${liveMinutesLabel(shift.startMinutes - localNow.minutes)}`
      };
    })
    .sort((a, b) => a.startMinutes - b.startMinutes || a.name.localeCompare(b.name));

  // Full floor for today: every planned shift with its live state, so the
  // Live Monitor's fullscreen view can show the whole day, not only exceptions.
  const todayRosterRows: HomeLiveRow[] = todayPlanned.map((shift) => {
    const employee = employeesById.get(shift.employee_id);
    const actual = actualsBySlot.get(
      `${shift.employee_id}|${shift.date}|${shift.service_key}`
    );
    const onLeave = hasApprovedAbsence(shift.employee_id, shift.date, shift.service_key);
    let status = 'Upcoming';
    let tone: Tone = 'neutral';
    let detail = `Starts in ${liveMinutesLabel(shift.startMinutes - localNow.minutes)}`;
    let liveSince: string | null = null;
    if (actual?.clock_in_at && !actual.clock_out_at) {
      status = 'Working now';
      tone = 'success';
      detail = `On the floor | in since ${formatInstant(actual.clock_in_at, timezone)}`;
      liveSince = actual.clock_in_at;
    } else if (actual?.clock_out_at) {
      status = 'Done';
      tone = 'info';
      detail = `Worked ${formatInstant(actual.clock_in_at, timezone)}-${formatInstant(actual.clock_out_at, timezone)}`;
    } else if (onLeave) {
      status = 'On leave';
      tone = 'neutral';
      detail = 'On approved leave';
    } else if (shift.startMinutes <= localNow.minutes) {
      const over = localNow.minutes - shift.startMinutes;
      status = over > LATE_THRESHOLD_MINUTES ? 'No-show' : 'Late';
      tone = 'danger';
      detail = over > LATE_THRESHOLD_MINUTES
        ? `No badge | ${liveMinutesLabel(over)} overdue`
        : `${liveMinutesLabel(over)} late`;
    }
    return {
      employeeId: shift.employee_id,
      name: employee?.display_name || 'Employee',
      role: roleForEmployee(shift.employee_id, shift.job_function_id),
      range: shift.range,
      status,
      tone,
      startMinutes: shift.startMinutes,
      detail,
      liveSince
    };
  });

  const missingBadges = planned.filter((shift) => {
    if (shift.date > localNow.date) return false;
    if (shift.date === localNow.date && shift.startMinutes > localNow.minutes) return false;
    const actual = actualsBySlot.get(
      `${shift.employee_id}|${shift.date}|${shift.service_key}`
    );
    return (
      !actual?.clock_in_at &&
      !hasApprovedAbsence(shift.employee_id, shift.date, shift.service_key)
    );
  });

  const pendingAbsences = snapshot.absences.filter(
    (absence) => absence.status === 'pending' && absence.end_date >= localNow.date
  );
  const submittedEmployeeIds = new Set(
    snapshot.employee_availability_submissions
      .filter(
        (submission) =>
          submission.week_start === weekStart && submission.status === 'submitted'
      )
      .map((submission) => submission.employee_id)
  );
  const currentContracts = new Map(
    snapshot.employee_contracts
      .filter((contract) => contract.active && contract.is_current)
      .map((contract) => [contract.employee_id, contract])
  );
  const payrollByEmployee = new Map(
    snapshot.employee_payroll_profiles.map((payroll) => [payroll.employee_id, payroll])
  );
  const legalByEmployee = new Map(
    snapshot.employee_legal_profiles.map((legal) => [legal.employee_id, legal])
  );
  const unsubmittedAvailability = employees.filter((employee) => {
    const contract = currentContracts.get(employee.id);
    return (
      contract?.work_regime === 'weekly_availability' &&
      !submittedEmployeeIds.has(employee.id)
    );
  });
  const missingPayroll = role === 'owner'
    ? employees.filter((employee) => {
        const contract = currentContracts.get(employee.id);
        const payroll = payrollByEmployee.get(employee.id);
        const legal = legalByEmployee.get(employee.id);
        // Leave entitlement is a leave-balance detail, not a payment blocker (0
        // is valid for some regimes), so it is intentionally excluded here to
        // keep this signal consistent with the Team readiness definition.
        return (
          !primaryJobFunctionByEmployee.get(employee.id) ||
          !contract?.contract_type_id ||
          !text(contract.work_regime) ||
          !Number(contract.weekly_contract_hours) ||
          !contract.contract_start ||
          !text(payroll?.payroll_employee_id) ||
          !text(legal?.national_registry_number) ||
          !text(payroll?.iban)
        );
      })
    : [];

  const requirements = snapshot.coverage_requirements.filter(
    (requirement) => requirement.active && requirement.required_count > 0
  );
  const openServices = snapshot.opening_hours.filter((hours) => hours.is_open);
  const coverageIssues: Array<{ weekday: number; serviceKey: string; missing: number }> = [];

  for (const opening of openServices) {
    const requirementKeys = new Set(
      requirements
        .filter((requirement) => requirement.service_key === opening.service_key)
        .map(
          (requirement) =>
            `${requirement.area_id}|${requirement.job_function_id}|${requirement.service_key}`
        )
    );

    for (const requirementKey of requirementKeys) {
      const [areaId, jobFunctionId, serviceKey] = requirementKey.split('|');
      const matching = requirements.filter(
        (requirement) =>
          requirement.area_id === areaId &&
          requirement.job_function_id === jobFunctionId &&
          requirement.service_key === serviceKey
      );
      const requirement =
        matching.find((item) => item.weekday === opening.weekday) ??
        matching.find((item) => item.weekday === null || item.coverage_scope === 'default');
      if (!requirement) continue;

      const plannedCount = planned.filter(
        (shift) =>
          shift.weekday === opening.weekday &&
          shift.service_key === serviceKey &&
          shift.area_id === areaId &&
          (shift.job_function_id ||
            primaryJobFunctionByEmployee.get(shift.employee_id)) === jobFunctionId
      ).length;
      if (plannedCount < requirement.required_count) {
        coverageIssues.push({
          weekday: opening.weekday,
          serviceKey,
          missing: requirement.required_count - plannedCount
        });
      }
    }
  }

  const affectedServices = new Set(
    coverageIssues.map((issue) => `${issue.weekday}|${issue.serviceKey}`)
  ).size;
  const coverage =
    !requirements.length || !openServices.length
      ? {
          tone: 'warning' as Tone,
          label: 'Setup needed',
          detail: !requirements.length
            ? 'No coverage requirements configured'
            : 'No opening schedule configured'
        }
      : coverageIssues.length
        ? {
            tone: 'danger' as Tone,
            label: 'At risk',
            detail: `${affectedServices} service${affectedServices === 1 ? '' : 's'} affected`
          }
        : {
            tone: 'success' as Tone,
            label: 'Good',
            detail: 'Coverage requirements matched'
          };

  const plannedHours = planned.reduce(
    (total, shift) => total + hoursBetweenClocks(shift.starts_at, shift.ends_at),
    0
  );
  const actualHours = actuals.reduce(
    (total, entry) => total + hoursBetweenInstants(entry.clock_in_at, entry.clock_out_at),
    0
  );
  const planningStatus =
    snapshot.work_weeks.find((week) => week.week_start === weekStart)?.planning_status ===
    'published'
      ? 'Published'
      : 'Draft';

  const weekdayShort = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const affectedServiceKeys = [
    ...new Set(coverageIssues.map((issue) => `${issue.weekday}|${issue.serviceKey}`))
  ];

  const actionRows: HomeActionRow[] = [
    {
      key: 'leave',
      label: 'Leave approvals',
      meta: 'This week',
      count: pendingAbsences.length,
      tone: pendingAbsences.length ? 'warning' : 'success',
      href: '/team',
      symbol: 'L',
      items: pendingAbsences.slice(0, 5).map((absence) => ({
        id: absence.id,
        label: employeesById.get(absence.employee_id)?.display_name || 'Employee',
        meta:
          absence.start_date === absence.end_date
            ? absence.start_date
            : `${absence.start_date} to ${absence.end_date}`
      }))
    },
    ...(role === 'owner'
      ? [
          {
            key: 'payroll' as const,
            label: 'Missing payroll info',
            meta: 'Employees',
            count: missingPayroll.length,
            tone: (missingPayroll.length ? 'warning' : 'success') as Tone,
            href: '/team',
            symbol: 'EUR',
            items: missingPayroll.slice(0, 5).map((employee) => ({
              id: employee.id,
              label: employee.display_name,
              meta: 'Needs contract or payroll setup'
            }))
          }
        ]
      : []),
    {
      key: 'planning',
      label: 'Schedule conflicts',
      meta: 'Services affected',
      count: affectedServices,
      tone: affectedServices ? 'danger' : 'success',
      href: '/schedule',
      symbol: '!',
      items: affectedServiceKeys.slice(0, 5).map((key) => {
        const [weekdayNumber, serviceKey] = key.split('|');
        const missing = coverageIssues
          .filter((issue) => `${issue.weekday}|${issue.serviceKey}` === key)
          .reduce((total, issue) => total + issue.missing, 0);
        return {
          id: key,
          label: `${weekdayShort[Number(weekdayNumber) - 1] ?? 'Day'} | ${serviceLabel(serviceKey)}`,
          meta: `${missing} position${missing === 1 ? '' : 's'} short`
        };
      })
    },
    {
      key: 'availability',
      label: 'Unsubmitted availability',
      meta: 'Employees',
      count: unsubmittedAvailability.length,
      tone: unsubmittedAvailability.length ? 'warning' : 'success',
      href: '/schedule',
      symbol: 'A',
      items: unsubmittedAvailability.slice(0, 5).map((employee) => ({
        id: employee.id,
        label: employee.display_name,
        meta: 'Has not submitted this week'
      }))
    }
  ];
  const actionTotal = actionRows.reduce((total, row) => total + row.count, 0);

  const combinedLiveRows = combineLiveRowsByEmployee([...lateRows, ...liveRows, ...upcomingRows]).slice(0, 9);
  const todayRoster = combineLiveRowsByEmployee([...todayRosterRows, ...liveRows]);

  const pulseRows: HomePulseRow[] = [
    {
      label: 'Planned hours',
      value: formatHours(plannedHours),
      meta: planningStatus,
      tone: 'neutral',
      href: '/schedule'
    },
    {
      label: 'Actual hours',
      value: formatHours(actualHours),
      meta: 'Badged so far',
      tone: 'info',
      href: '/timesheet'
    },
    {
      label: 'Coverage status',
      value: coverage.label,
      meta: coverage.detail,
      tone: coverage.tone,
      href: '/schedule'
    },
    {
      label: 'Missing badges',
      value: String(missingBadges.length),
      meta: missingBadges.length ? 'Started planned shifts' : 'No missing badges',
      tone: missingBadges.length ? 'warning' : 'success',
      href: '/timesheet'
    },
    {
      label: 'Schedule status',
      value: planningStatus,
      meta: planningStatus === 'Published' ? 'Published' : 'Not published',
      tone: planningStatus === 'Published' ? 'success' : 'neutral',
      href: '/schedule'
    }
  ];

  return {
    weekLabel: formatWeekRange(weekStart),
    live: {
      working: liveRows.length,
      late: lateRows.length,
      upcoming: upcomingRows.length,
      rows: combinedLiveRows,
      todayRoster
    },
    actions: { total: actionTotal, rows: actionRows },
    pulse: { tone: coverage.tone, rows: pulseRows }
  };
}
