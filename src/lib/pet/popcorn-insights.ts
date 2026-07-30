import type { WorkspaceRole } from '$lib/api/workspace';
import type {
  EmployeeOperationsReadModel,
  ManagerOperationsReadModel,
  RestaurantReadModel,
  TeamReadModel,
  WorkspaceBootstrap
} from '$lib/api/workspace-snapshot';
import { addDays, mondayFor, todayInTimezone } from '$lib/calendar/date';
import { planningStatusForWeek } from '$lib/schedule/schedule-model';
import { actualsWeekTotals } from '$lib/timesheet/timesheet-model';

export type PopcornInsightTone = 'info' | 'success' | 'attention';

export type PopcornInsight = {
  id: string;
  tone: PopcornInsightTone;
  title: string;
  message: string;
  params?: Record<string, string | number>;
};

type PopcornInsightInput = {
  pathname: string;
  role: WorkspaceRole | null;
  employeeId: string | null;
  bootstrap: WorkspaceBootstrap | null;
  operations: ManagerOperationsReadModel | null;
  employeeOperations: EmployeeOperationsReadModel | null;
  team: TeamReadModel | null;
  restaurant: RestaurantReadModel | null;
  preview: boolean;
  now?: Date;
};

function note(
  id: string,
  tone: PopcornInsightTone,
  title: string,
  message: string,
  params?: Record<string, string | number>
): PopcornInsight {
  return { id, tone, title, message, params };
}

function routeIs(pathname: string, route: string): boolean {
  return pathname === route || pathname.startsWith(`${route}/`);
}

function roundedHours(value: number): number {
  return Math.round(value * 10) / 10;
}

function managerOperationsInsights(
  pathname: string,
  snapshot: ManagerOperationsReadModel,
  role: WorkspaceRole | null,
  now: Date
): PopcornInsight[] {
  const timezone = snapshot.restaurant_settings.timezone || 'Europe/Brussels';
  const today = todayInTimezone(timezone, now);
  const weekStart = mondayFor(today);
  const weekEnd = addDays(weekStart, 6);
  const insights: PopcornInsight[] = [];

  if (pathname === '/home') {
    const workingNow = snapshot.time_entries.filter(
      (entry) =>
        entry.business_date === today &&
        entry.status !== 'cancelled' &&
        Boolean(entry.clock_in_at) &&
        !entry.clock_out_at
    ).length;
    const pendingLeave = snapshot.absences.filter(
      (absence) =>
        absence.status === 'pending' &&
        absence.start_date <= weekEnd &&
        absence.end_date >= weekStart
    ).length;

    insights.push(
      workingNow
        ? note(
            'home-working',
            'success',
            'Live right now',
            '{count} people are clocked in.',
            { count: workingNow }
          )
        : note(
            'home-quiet',
            'info',
            'Live right now',
            'Nobody is clocked in at this moment.'
          )
    );
    if (pendingLeave) {
      insights.push(
        note(
          'home-leave',
          'attention',
          'Worth a look',
          '{count} time-off requests may affect this week.',
          { count: pendingLeave }
        )
      );
    }
    insights.push(
      note(
        'home-modules',
        'info',
        'Quick tip',
        'Home is your module map; open a tile for the working detail.'
      )
    );
    return insights;
  }

  if (pathname === '/schedule') {
    const status = planningStatusForWeek(snapshot, weekStart);
    const planned = snapshot.planned_shifts.filter(
      (shift) => shift.week_start === weekStart
    ).length;
    const pendingLeave = snapshot.absences.filter(
      (absence) =>
        absence.status === 'pending' &&
        absence.start_date <= weekEnd &&
        absence.end_date >= weekStart
    ).length;

    if (status.hasUnpublishedChanges) {
      insights.push(
        note(
          'schedule-unpublished',
          'attention',
          'Worth a look',
          "This week's schedule has unpublished changes."
        )
      );
    }
    insights.push(
      status.planning === 'published'
        ? note(
            'schedule-status',
            'success',
            'Schedule published',
            'Employees can see {count} planned services this week.',
            { count: planned }
          )
        : note(
            'schedule-status',
            'info',
            'Schedule in draft',
            '{count} planned services are still private this week.',
            { count: planned }
          )
    );
    if (pendingLeave) {
      insights.push(
        note(
          'schedule-leave',
          'attention',
          'Planning signal',
          '{count} time-off requests are waiting and may affect the schedule.',
          { count: pendingLeave }
        )
      );
    }
    insights.push(
      note(
        'schedule-publish',
        'info',
        'Quick tip',
        'Employees only see the published plan, never your private draft.'
      )
    );
    return insights;
  }

  if (pathname === '/schedule/calendar') {
    return [
      note(
        'schedule-calendar',
        'info',
        'Calendar lens',
        'Open a day to inspect and edit its schedule without leaving the calendar.'
      ),
      note(
        'schedule-calendar-publish',
        'info',
        'Quick tip',
        'Calendar edits still follow the same draft and publish rules as the roster.'
      )
    ];
  }

  if (pathname === '/schedule/history') {
    return [
      note(
        'schedule-history',
        'info',
        'Audit trail',
        'History records saved, published and reverted schedule decisions.'
      )
    ];
  }

  if (pathname === '/timesheet') {
    const totals = actualsWeekTotals(snapshot, weekStart, today, now);
    const toReview = totals.missing + totals.conflicts;
    if (toReview) {
      insights.push(
        note(
          'time-review',
          'attention',
          'Worth a look',
          '{count} time records need review this week.',
          { count: toReview }
        )
      );
    }
    if (totals.live) {
      insights.push(
        note(
          'time-live',
          'success',
          'Live right now',
          '{count} people are still clocked in.',
          { count: totals.live }
        )
      );
    }
    insights.push(
      note(
        'time-hours',
        toReview ? 'info' : 'success',
        'Week in hours',
        '{actual} worked hours are recorded against {planned} planned.',
        {
          actual: roundedHours(totals.actualHours),
          planned: roundedHours(totals.plannedHours)
        }
      ),
      note(
        'time-evidence',
        'info',
        'Quick tip',
        'Open a card to review badge times, breaks and corrections together.'
      )
    );
    return insights;
  }

  if (pathname === '/timesheet/live') {
    const openClockIns = snapshot.time_entries.filter(
      (entry) =>
        entry.business_date === today &&
        entry.status !== 'cancelled' &&
        Boolean(entry.clock_in_at) &&
        !entry.clock_out_at
    ).length;
    return [
      openClockIns
        ? note(
            'time-live-count',
            'success',
            'Service is live',
            '{count} people are clocked in right now.',
            { count: openClockIns }
          )
        : note(
            'time-live-empty',
            'info',
            'Live monitor',
            'No clock-in is open right now.'
          ),
      note(
        'time-live-open',
        'info',
        'Quick tip',
        "Open a person here to inspect today's evidence without leaving Live."
      )
    ];
  }

  if (pathname === '/timesheet/calendar') {
    return [
      note(
        'time-calendar',
        'info',
        'Calendar lens',
        'Open a day to compare planned work, badges and corrections in place.'
      ),
      note(
        'time-calendar-focus',
        'info',
        'Quick tip',
        'Attention badges count records that still need a manager decision.'
      )
    ];
  }

  if (pathname === '/badge-terminal') {
    const activeEmployees = snapshot.employees.filter(
      (employee) => employee.active
    ).length;
    return [
      note(
        'badge-ready',
        'info',
        'Terminal roster',
        '{count} active people belong to this workspace.',
        { count: activeEmployees }
      ),
      note(
        'badge-security',
        'info',
        'Quick tip',
        'A badge PIN authorizes terminal actions; it never signs someone into the app.'
      )
    ];
  }

  if (routeIs(pathname, '/reports')) {
    return [
      note(
        'reports-source',
        'info',
        'Evidence first',
        'Reports explain patterns; Schedule and Time remain the source for operational changes.'
      )
    ];
  }

  if (role === 'owner' && routeIs(pathname, '/payroll')) {
    const activeEmployees = snapshot.employees.filter((employee) => employee.active);
    const payrollIds = new Set(
      snapshot.employee_payroll_profiles.map((profile) => profile.employee_id)
    );
    const withPayroll = activeEmployees.filter((employee) => payrollIds.has(employee.id)).length;
    return [
      note(
        'payroll-profiles',
        withPayroll === activeEmployees.length ? 'success' : 'attention',
        'Payroll setup',
        '{ready} of {total} active people have payroll details.',
        { ready: withPayroll, total: activeEmployees.length }
      ),
      note(
        'payroll-handoff',
        'info',
        'Quick tip',
        'Approve worked time before preparing the social-secretariat handoff.'
      )
    ];
  }

  return [];
}

function teamInsights(pathname: string, snapshot: TeamReadModel): PopcornInsight[] {
  const activeEmployees = snapshot.employees.filter((employee) => employee.active);
  const activeIds = new Set(activeEmployees.map((employee) => employee.id));
  const pendingInvites = snapshot.employee_invitation_states.filter(
    (invitation) =>
      activeIds.has(invitation.employee_id) && invitation.status === 'pending'
  ).length;
  const currentContractIds = new Set(
    snapshot.employee_contracts
      .filter((contract) => contract.active && contract.is_current)
      .map((contract) => contract.employee_id)
  );
  const currentContracts = activeEmployees.filter((employee) =>
    currentContractIds.has(employee.id)
  ).length;
  const activeAccess = snapshot.employee_access.filter(
    (access) =>
      activeIds.has(access.employee_id) &&
      access.access_status === 'active' &&
      Boolean(access.profile_id)
  ).length;
  const payrollIds = new Set(
    snapshot.employee_payroll_profiles.map((profile) => profile.employee_id)
  );
  const payrollProfiles = activeEmployees.filter((employee) =>
    payrollIds.has(employee.id)
  ).length;
  const pendingAbsences = snapshot.absences.filter(
    (absence) => activeIds.has(absence.employee_id) && absence.status === 'pending'
  ).length;

  if (pathname === '/team/contracts') {
    return [
      note(
        'team-contracts',
        currentContracts === activeEmployees.length ? 'success' : 'attention',
        'Contract setup',
        '{ready} of {total} active people have a current contract.',
        { ready: currentContracts, total: activeEmployees.length }
      ),
      note(
        'team-contracts-edit',
        'info',
        'Quick tip',
        'Click anywhere in an editable cell, not only its text, to update it.'
      )
    ];
  }

  if (pathname === '/team/access') {
    return [
      note(
        'team-access',
        pendingInvites ? 'attention' : 'success',
        'App access',
        '{active} people can sign in; {pending} invitations are pending.',
        { active: activeAccess, pending: pendingInvites }
      ),
      note(
        'team-access-history',
        'info',
        'Quick tip',
        'Disabling access preserves employee history and badge records.'
      )
    ];
  }

  if (pathname === '/team/payroll') {
    return [
      note(
        'team-payroll',
        payrollProfiles === activeEmployees.length ? 'success' : 'attention',
        'Payroll details',
        '{ready} of {total} active people have a payroll profile.',
        { ready: payrollProfiles, total: activeEmployees.length }
      )
    ];
  }

  if (pathname === '/team/absences') {
    return [
      pendingAbsences
        ? note(
            'team-absences',
            'attention',
            'Decision waiting',
            '{count} time-off requests are waiting for a decision.',
            { count: pendingAbsences }
          )
        : note(
            'team-absences',
            'success',
            'Time off',
            'No time-off request is waiting for a decision.'
          )
    ];
  }

  return [
    note(
      'team-people',
      pendingInvites ? 'attention' : 'success',
      'Team pulse',
      '{active} active people; {pending} invitations are pending.',
      { active: activeEmployees.length, pending: pendingInvites }
    ),
    note(
      'team-save',
      'info',
      'Quick tip',
      'New rows stay highlighted until the shared Team workspace is saved.'
    )
  ];
}

function restaurantInsights(
  pathname: string,
  snapshot: RestaurantReadModel,
  bootstrap: WorkspaceBootstrap | null
): PopcornInsight[] {
  const areas = snapshot.work_areas.filter((area) => area.active);
  const positions = snapshot.job_functions.filter((position) => position.active);
  const services = snapshot.services.filter((service) => service.active);
  const floorLevels = new Set(
    areas.map((area) => area.floor_level ?? 0)
  ).size;
  const coverageRules = snapshot.coverage_requirements.filter(
    (requirement) => requirement.active && requirement.required_count > 0
  ).length;
  const readiness = bootstrap?.readiness;
  const incompleteChecks = readiness
    ? Object.values(readiness).filter((ready) => !ready).length
    : 0;

  if (pathname === '/restaurant/areas') {
    return [
      note(
        'restaurant-areas',
        areas.length ? 'success' : 'attention',
        'Area map',
        '{areas} active areas span {floors} floor levels.',
        { areas: areas.length, floors: floorLevels }
      ),
      note(
        'restaurant-areas-plan',
        'info',
        'Quick tip',
        'Floor levels group the list and keep operational areas separate from reservation rooms.'
      )
    ];
  }

  if (pathname === '/restaurant/positions') {
    const linkedPositionIds = new Set(
      snapshot.job_function_areas
        .filter((link) => link.active)
        .map((link) => link.job_function_id)
    );
    const linked = positions.filter((position) => linkedPositionIds.has(position.id)).length;
    return [
      note(
        'restaurant-positions',
        linked === positions.length ? 'success' : 'attention',
        'Position map',
        '{linked} of {total} active positions are linked to an area.',
        { linked, total: positions.length }
      ),
      note(
        'restaurant-positions-default',
        'info',
        'Quick tip',
        'Area links guide planning defaults while still allowing another assignment.'
      )
    ];
  }

  if (pathname === '/restaurant/coverage') {
    return [
      note(
        'restaurant-coverage',
        coverageRules ? 'success' : 'attention',
        'Staffing rules',
        '{count} active rules define minimum service cover.',
        { count: coverageRules }
      ),
      note(
        'restaurant-coverage-fallback',
        'info',
        'Quick tip',
        'A weekday-specific staffing rule wins over the Every day fallback.'
      )
    ];
  }

  const summary = note(
    'restaurant-summary',
    incompleteChecks ? 'attention' : 'success',
    'Restaurant setup',
    '{areas} areas, {positions} positions and {services} service periods are active.',
    { areas: areas.length, positions: positions.length, services: services.length }
  );
  if (incompleteChecks) {
    return [
      note(
        'restaurant-readiness',
        'attention',
        'Worth a look',
        '{count} restaurant setup checks are still incomplete.',
        { count: incompleteChecks }
      ),
      summary,
      note(
        'restaurant-address',
        'info',
        'Quick tip',
        'Address suggestions appear while you type; opening hours define when services can run.'
      )
    ];
  }
  return [
    summary,
    note(
      'restaurant-address',
      'info',
      'Quick tip',
      'Address suggestions appear while you type; opening hours define when services can run.'
    )
  ];
}

function employeeInsights(input: PopcornInsightInput, now: Date): PopcornInsight[] {
  const snapshot = input.employeeOperations;
  const employeeId = input.employeeId;
  if (!snapshot || !employeeId) return [];
  const timezone = snapshot.restaurant_settings.timezone || 'Europe/Brussels';
  const today = todayInTimezone(timezone, now);
  const weekStart = mondayFor(today);

  if (input.pathname === '/my-service') {
    const planned = snapshot.planned_shifts.filter(
      (shift) => shift.employee_id === employeeId && shift.week_start === weekStart
    ).length;
    const approvedLeave = snapshot.absences.filter(
      (absence) =>
        absence.employee_id === employeeId &&
        absence.status === 'approved' &&
        absence.end_date >= weekStart &&
        absence.start_date <= addDays(weekStart, 6)
    ).length;
    return [
      note(
        'my-service-plan',
        planned ? 'success' : 'info',
        'Your week',
        'You have {count} published services this week.',
        { count: planned }
      ),
      ...(approvedLeave
        ? [
            note(
              'my-service-leave',
              'info' as const,
              'Time off',
              '{count} approved time-off periods overlap this week.',
              { count: approvedLeave }
            )
          ]
        : []),
      note(
        'my-service-truth',
        'info',
        'Quick tip',
        'Your published schedule, availability and approved time off stay together here.'
      )
    ];
  }

  if (input.pathname === '/my-time') {
    const entries = snapshot.time_entries.filter(
      (entry) => entry.employee_id === employeeId && entry.status !== 'cancelled'
    );
    const open = entries.filter((entry) => entry.clock_in_at && !entry.clock_out_at).length;
    return [
      open
        ? note(
            'my-time-open',
            'attention',
            'Clock still open',
            '{count} clock-ins do not have a clock-out yet.',
            { count: open }
          )
        : note(
            'my-time-records',
            'success',
            'Your time',
            '{count} worked entries are recorded in this view.',
            { count: entries.length }
          ),
      note(
        'my-time-detail',
        'info',
        'Quick tip',
        'Open a day to inspect badge times, breaks and any correction.'
      )
    ];
  }

  return [];
}

function staticInsights(pathname: string): PopcornInsight[] {
  if (pathname === '/home') {
    return [
      note(
        'home-modules',
        'info',
        'Quick tip',
        'Home is your module map; open a tile for the working detail.'
      )
    ];
  }

  if (routeIs(pathname, '/schedule')) {
    return [
      note(
        'schedule-publish',
        'info',
        'Quick tip',
        'Employees only see the published plan, never your private draft.'
      )
    ];
  }

  if (routeIs(pathname, '/timesheet')) {
    return [
      note(
        'time-evidence',
        'info',
        'Quick tip',
        'Open a card to review badge times, breaks and corrections together.'
      )
    ];
  }

  if (routeIs(pathname, '/team')) {
    return [
      note(
        'team-save',
        'info',
        'Quick tip',
        'New rows stay highlighted until the shared Team workspace is saved.'
      )
    ];
  }

  if (routeIs(pathname, '/restaurant')) {
    return [
      note(
        'restaurant-address',
        'info',
        'Quick tip',
        'Address suggestions appear while you type; opening hours define when services can run.'
      )
    ];
  }

  if (routeIs(pathname, '/reservations')) {
    if (pathname === '/reservations/floor-plans') {
      return [
        note(
          'reservations-floor-plan',
          'info',
          'Floor plans',
          'Reservation rooms and tables stay separate from operational work areas.'
        )
      ];
    }
    if (pathname === '/reservations/setup') {
      return [
        note(
          'reservations-setup',
          'info',
          'Reservation mode',
          'Choose table assignment or a simple cover limit to match how the restaurant seats guests.'
        )
      ];
    }
    if (pathname === '/reservations/api') {
      return [
        note(
          'reservations-api',
          'info',
          'Online booking',
          'Public availability still follows the restaurant reservation settings.'
        )
      ];
    }
    return [
      note(
        'reservations-live',
        'info',
        'Service flow',
        "Live follows today's arrivals; Bookings keeps the complete reservation list."
      ),
      note(
        'reservations-covers',
        'info',
        'Quick tip',
        'Cover-based mode works when tables are assigned only as guests arrive.'
      )
    ];
  }

  if (pathname === '/documents') {
    return [
      note(
        'documents-expiry',
        'info',
        'Document watch',
        'Expiry attention catches files due within 30 days.'
      ),
      note(
        'documents-archive',
        'info',
        'Quick tip',
        'Archived records stay in the audit trail after their stored file is removed.'
      )
    ];
  }

  if (pathname === '/exports') {
    return [
      note(
        'exports-preview',
        'info',
        'Export preview',
        'Choose the period, format and columns together; drag preview headers to reorder them.'
      ),
      note(
        'exports-purpose',
        'info',
        'Quick tip',
        'Schedule, worked time and payroll handoff each use their own file layout.'
      )
    ];
  }

  if (routeIs(pathname, '/payroll')) {
    return [
      note(
        'payroll-handoff',
        'info',
        'Quick tip',
        'Approve worked time before preparing the social-secretariat handoff.'
      )
    ];
  }

  if (pathname === '/badge-terminal') {
    return [
      note(
        'badge-security',
        'info',
        'Quick tip',
        'A badge PIN authorizes terminal actions; it never signs someone into the app.'
      )
    ];
  }

  if (routeIs(pathname, '/reports')) {
    return [
      note(
        'reports-source',
        'info',
        'Evidence first',
        'Reports explain patterns; Schedule and Time remain the source for operational changes.'
      )
    ];
  }

  if (pathname === '/my-service') {
    return [
      note(
        'my-service-truth',
        'info',
        'Quick tip',
        'Your published schedule, availability and approved time off stay together here.'
      )
    ];
  }

  if (pathname === '/my-time') {
    return [
      note(
        'my-time-detail',
        'info',
        'Quick tip',
        'Open a day to inspect badge times, breaks and any correction.'
      )
    ];
  }

  if (routeIs(pathname, '/settings')) {
    return [
      note(
        'settings-time-off',
        'info',
        'Time-off policy',
        'These types define what employees can request; archive only options no longer in use.'
      )
    ];
  }

  return [
    note(
      'fallback',
      'info',
      'Popcorn is listening',
      'Open a workspace module and I will surface its useful signals here.'
    )
  ];
}

export function buildPopcornInsights(input: PopcornInsightInput): PopcornInsight[] {
  const now = input.now ?? new Date();
  let insights: PopcornInsight[] = [];

  if (input.role === 'employee') {
    insights = employeeInsights(input, now);
  } else {
    if (routeIs(input.pathname, '/team') && input.team) {
      insights = teamInsights(input.pathname, input.team);
    } else if (routeIs(input.pathname, '/payroll') && input.team) {
      insights = teamInsights('/team/payroll', input.team);
    } else if (routeIs(input.pathname, '/restaurant') && input.restaurant) {
      insights = restaurantInsights(input.pathname, input.restaurant, input.bootstrap);
    } else if (input.operations) {
      insights = managerOperationsInsights(input.pathname, input.operations, input.role, now);
    }
  }

  if (!insights.length) insights = staticInsights(input.pathname);
  if (input.preview) {
    insights.unshift(
      note(
        'preview',
        'info',
        'Preview mode',
        'Explore this role freely; changes stay disabled while preview is active.'
      )
    );
  }
  return insights;
}
