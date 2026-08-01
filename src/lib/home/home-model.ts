import type { WorkspaceRole } from '$lib/api/workspace';
import type { ManagerOperationsReadModel } from '$lib/api/workspace-snapshot';
import { isValidBelgianNiss } from '../validation/belgian-identifiers.ts';

type Tone = 'success' | 'warning' | 'danger' | 'info' | 'neutral';


type HomeLiveRow = {
  employeeId: string;
  name: string;
  role: string;
  range: string;
  status: string;
  tone: Tone;
  startMinutes: number;
  liveSince?: string | null;
};

type HomeActionRow = {
  key: 'leave' | 'payroll' | 'planning' | 'availability';
  label: string;
  meta: string;
  count: number;
  tone: Tone;
  href: string;
  symbol: string;
  items: Array<{
    id: string;
    label: string;
    meta: string;
    metaParams?: Record<string, string | number>;
    weekday?: number;
    serviceKey?: string;
  }>;
};

type HomeModel = {
  live: {
    working: number;
    late: number;
    upcoming: number;
    rows: HomeLiveRow[];
    todayRoster: HomeLiveRow[];
  };
  actions: {
    rows: HomeActionRow[];
  };
};

const LATE_THRESHOLD_MINUTES = 45;
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

  const normalizedPlan = (
    shifts: ManagerOperationsReadModel['planned_shifts']
  ) =>
    shifts
      .filter((shift) => shift.week_start === weekStart)
      .map((shift) => ({
        ...shift,
        date: addDays(shift.week_start, shift.weekday - 1),
        startMinutes: clockMinutes(shift.starts_at) ?? 0,
        range: clockRange(shift.starts_at, shift.ends_at)
      }))
      .filter((shift) => employeesById.has(shift.employee_id));
  // Draft planning drives manager decisions such as coverage. Live operations
  // follow the published employee-visible baseline, matching Timesheet.
  const planned = normalizedPlan(snapshot.planned_shifts);
  const operationalPlanned = normalizedPlan(
    snapshot.published_planned_shifts ?? snapshot.planned_shifts
  );

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
    operationalPlanned.map((shift) => [
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
        liveSince: entry.clock_in_at
      };
    });

  const todayPlanned = operationalPlanned.filter((shift) => shift.date === localNow.date);
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
        startMinutes: shift.startMinutes
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
        startMinutes: shift.startMinutes
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
    let liveSince: string | null = null;
    if (actual?.clock_in_at && !actual.clock_out_at) {
      status = 'Working now';
      tone = 'success';
      liveSince = actual.clock_in_at;
    } else if (actual?.clock_out_at) {
      status = 'Done';
      tone = 'info';
    } else if (onLeave) {
      status = 'On leave';
      tone = 'neutral';
    } else if (shift.startMinutes <= localNow.minutes) {
      const over = localNow.minutes - shift.startMinutes;
      status = over > LATE_THRESHOLD_MINUTES ? 'No-show' : 'Late';
      tone = 'danger';
    }
    return {
      employeeId: shift.employee_id,
      name: employee?.display_name || 'Employee',
      role: roleForEmployee(shift.employee_id, shift.job_function_id),
      range: shift.range,
      status,
      tone,
      startMinutes: shift.startMinutes,
      liveSince
    };
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
          !isValidBelgianNiss(legal?.national_registry_number) ||
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
            : '{start} to {end}',
        metaParams:
          absence.start_date === absence.end_date
            ? undefined
            : { start: absence.start_date, end: absence.end_date }
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
          label: '',
          weekday: Number(weekdayNumber),
          serviceKey,
          meta: missing === 1 ? '{count} position short' : '{count} positions short',
          metaParams: { count: missing }
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
  const combinedLiveRows = combineLiveRowsByEmployee([...lateRows, ...liveRows, ...upcomingRows]).slice(0, 9);
  const todayRoster = combineLiveRowsByEmployee([...todayRosterRows, ...liveRows]);

  return {
    live: {
      working: liveRows.length,
      late: lateRows.length,
      upcoming: upcomingRows.length,
      rows: combinedLiveRows,
      todayRoster
    },
    actions: { rows: actionRows }
  };
}
