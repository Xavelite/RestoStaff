// Tour scripts, keyed by page and role. Each page resolves to at most one
// script for the current viewer; managers and owners share the manager-side
// scripts (owners additionally get Restaurant). Copy flows through t() so the
// tour speaks the same three languages as the rest of the app.
import { t } from '$lib/i18n/i18n.svelte';
import type { TourScript, TourStep } from './tour.svelte';

type Role = string | null | undefined;

const isManagerSide = (role: Role): boolean => role === 'owner' || role === 'manager';
const isOwner = (role: Role): boolean => role === 'owner';
const isEmployee = (role: Role): boolean => role === 'employee';

// Steps shared by every manager-side page: how to move around, where alerts and
// the account live, and that the tour itself is always here. Placed at the end
// of each page tour so page-specific content leads.
function managerShellSteps(): TourStep[] {
  return [
    {
      target: '[data-tour="communications"]',
      title: t('Reach the team'),
      body: t('Send an operational message to the whole team or just the people who need it.'),
      placement: 'bottom'
    },
    {
      target: '[data-tour="message-composer"]',
      title: t('Messages with a clear outcome'),
      body: t('Choose the people, mark urgency, and ask for a read confirmation when it matters.'),
      how: t('Urgent messages also reach their phone, so nobody misses one while off shift.'),
      placement: 'left',
      enter: { click: '[data-tour="communications"]', waitFor: '[data-tour="message-composer"]' },
      leave: { click: '[data-tour="drawer-close"]' }
    },
    {
      target: '[data-tour="notifications"]',
      title: t('Alerts land here'),
      body: t('Approvals, changes and reminders. You can also install them as phone notifications.'),
      placement: 'bottom'
    },
    {
      target: '.account-menu',
      title: t('You and your workspace'),
      body: t('Switch workspace, change language, set your badge PIN — or reopen this tour anytime.'),
      placement: 'left',
      enter: { click: '.account-button', waitFor: '.account-menu' },
      leave: { click: '.account-button' }
    }
  ];
}

// Shared closing steps for the employee-side pages: their alerts and account.
function employeeShellSteps(): TourStep[] {
  return [
    {
      target: '[data-tour="communications"]',
      title: t('Team messages'),
      body: t('Read updates from your manager and confirm the ones that ask you to.'),
      placement: 'bottom'
    },
    {
      target: '.drawer',
      title: t('Your team updates'),
      body: t('Messages keep their read status, and urgent ones also reach your phone.'),
      placement: 'left',
      enter: { click: '[data-tour="communications"]', waitFor: '.drawer' },
      leave: { click: '[data-tour="drawer-close"]' }
    },
    {
      target: '[data-tour="notifications"]',
      title: t('Your alerts'),
      body: t('Shift changes, approvals and reminders land here — and you can install them as phone notifications.'),
      placement: 'bottom'
    },
    {
      target: '[data-tour="account"]',
      title: t('Your account'),
      body: t('Change your language, set your badge PIN, or reopen this tour anytime.'),
      placement: 'left'
    }
  ];
}

function myServiceEmployeeTour(): TourScript {
  return {
    key: 'my-service:employee',
    label: t('My service tour'),
    steps: [
      {
        title: t('Welcome to My service'),
        body: t('Everything about your shifts lives here — when you work, and how to flag your availability or time off.')
      },
      {
        target: '[data-tour="svc-glance"]',
        title: t('Your week at a glance'),
        body: t('Your shifts, any pending requests, and what is coming up next.'),
        placement: 'left'
      },
      {
        target: '[data-tour="svc-nav"]',
        title: t('Move between weeks'),
        body: t('Look back or ahead, or jump straight back to today.'),
        placement: 'bottom'
      },
      {
        target: '[data-tour="svc-agenda"]',
        title: t('Your shifts'),
        body: t('Each day of the week and the services you are on.'),
        placement: 'top'
      },
      {
        target: '[data-tour="svc-day"]',
        title: t('A day up close'),
        body: t('Tap a shift for its details, or an open slot to give your availability or request time off.'),
        placement: 'bottom'
      },
      ...employeeShellSteps(),
      {
        title: t('That is My service'),
        body: t('You are in control of your week. Reopen this tour anytime from the ? button.')
      }
    ]
  };
}

function myTimeEmployeeTour(): TourScript {
  return {
    key: 'my-time:employee',
    label: t('My time tour'),
    steps: [
      {
        title: t('Welcome to My time'),
        body: t('Your worked hours, badge proof and leave balance — one month at a time.')
      },
      {
        target: '[data-tour="time-balance"]',
        title: t('Your balance and hours'),
        body: t('Leave days remaining, hours worked, and anything still pending.'),
        placement: 'left'
      },
      {
        target: '[data-tour="time-nav"]',
        title: t('Move between months'),
        body: t('Look back over any month of your record.'),
        placement: 'bottom'
      },
      {
        target: '[data-tour="time-calendar"]',
        title: t('Your month'),
        body: t('Every day at a glance — worked hours, published shifts and leave.'),
        how: t('Tap any day to open its detail.'),
        placement: 'top'
      },
      {
        target: '[data-tour="time-day"]',
        title: t('A day up close'),
        body: t('Badge proof, hours and leave for the day you picked.'),
        placement: 'left'
      },
      ...employeeShellSteps(),
      {
        title: t('That is My time'),
        body: t('Your record, always to hand. Reopen this tour anytime from the ? button.')
      }
    ]
  };
}

function homeManagerTour(): TourScript {
  return {
    key: 'home:manager',
    label: t('Home tour'),
    steps: [
      {
        title: t('Welcome to Home'),
        body: t('This is your service command center — the one place to start every shift.')
      },
      {
        target: '[data-tour="nav"]',
        title: t('Move around here'),
        body: t('Home, Schedule, Timesheet, Team and Insights — your whole workspace, one tab away.'),
        placement: 'bottom'
      },
      {
        target: '[data-tour="home-ring"]',
        title: t('Your day at a glance'),
        body: t('How many decisions need you, and who is working, late or upcoming right now.'),
        placement: 'left'
      },
      {
        target: '[data-tour="home-decisions"]',
        title: t('Start with what blocks service'),
        body: t('Leave approvals, schedule conflicts and missing availability gather here.'),
        how: t('Click any row to jump straight to it.'),
        placement: 'right'
      },
      {
        target: '[data-tour="home-weather"]',
        title: t('Service outlook'),
        body: t('Local weather that could change your covers, so you can staff ahead.'),
        placement: 'bottom'
      },
      {
        target: '[data-tour="home-floor"]',
        title: t('Live floor'),
        body: t('See who is clocked in across the day, as it happens.'),
        placement: 'top'
      },
      ...managerShellSteps(),
      {
        title: t('You are all set'),
        body: t('That is Home. Explore on your own, or reopen the tour whenever you need it.')
      }
    ]
  };
}

function scheduleManagerTour(): TourScript {
  return {
    key: 'schedule:manager',
    label: t('Schedule tour'),
    steps: [
      {
        title: t('Welcome to Schedule'),
        body: t('Plan the week here, then publish it when the roster is ready for your team.')
      },
      {
        target: '[data-tour="sch-week"]',
        title: t('The week you are planning'),
        body: t('The dates and their status — Draft while you work, Published once your team can see it.'),
        placement: 'bottom'
      },
      {
        target: '[data-tour="sch-period"]',
        title: t('Jump between weeks'),
        body: t('Step back or forward, or pick any date to plan further ahead.'),
        placement: 'bottom'
      },
      {
        target: '[data-tour="sch-grid"]',
        title: t('Build the roster'),
        body: t('Every person, every day. Click a cell to add, move or clear a shift.'),
        how: t('Lunch and evening services sit side by side, with net hours on the right.'),
        placement: 'top'
      },
      {
        target: '[data-tour="sch-coverage"]',
        title: t('See your coverage'),
        body: t('Open the coverage lens to spot gaps and who is available to fill them.'),
        placement: 'bottom'
      },
      {
        target: '.drawer',
        title: t('Coverage, room by room'),
        body: t('The guide opens the real lens so you can see each service, requirement and person in place.'),
        placement: 'left',
        enter: { click: '[data-tour="sch-coverage"]', waitFor: '.drawer' },
        leave: { click: '[data-tour="drawer-close"]' }
      },
      {
        target: '[data-tour="sch-gate"]',
        title: t('The publish gate'),
        body: t('Conflicts and pending requests are counted here — click any to inspect and resolve it.'),
        placement: 'left'
      },
      {
        target: '[data-tour="sch-publish"]',
        title: t('Publish when ready'),
        body: t('Nothing blocks publishing — unresolved points become visible warnings you can fix later.'),
        how: t('Save draft keeps it private; Publish shares the week with your team.'),
        placement: 'left'
      },
      {
        target: '.dialog',
        title: t('Preview before export'),
        body: t('Choose exactly which columns to share and inspect the result before downloading.'),
        placement: 'left',
        enter: { click: '[data-tour="sch-export"] .primary-action', waitFor: '.dialog' },
        leave: { click: '[data-tour="dialog-close"]' }
      },
      ...managerShellSteps(),
      {
        title: t('That is Schedule'),
        body: t('You are ready to plan. Reopen this tour anytime from the ? button.')
      }
    ]
  };
}

function timesheetManagerTour(): TourScript {
  return {
    key: 'timesheet:manager',
    label: t('Timesheet tour'),
    steps: [
      {
        title: t('Welcome to Timesheet'),
        body: t('This is the payroll evidence for the week — what was actually worked, ready to approve.')
      },
      {
        target: '[data-tour="ts-week"]',
        title: t('The week you are reviewing'),
        body: t('Worked hours for the week and its status — Open, Approved or Locked.'),
        placement: 'bottom'
      },
      {
        target: '[data-tour="ts-period"]',
        title: t('Move between weeks'),
        body: t('Step back or forward, or pick any past week to review.'),
        placement: 'bottom'
      },
      {
        target: '[data-tour="ts-grid"]',
        title: t('Worked time, badge by badge'),
        body: t('Recorded, pending and missing badges for each person, each service.'),
        how: t('Click any cell to correct or confirm what was worked.'),
        placement: 'top'
      },
      {
        target: '[data-tour="ts-coverage"]',
        title: t('Who actually worked'),
        body: t('The coverage lens compares the planned roster against real presence on the floor.'),
        placement: 'bottom'
      },
      {
        target: '.drawer',
        title: t('Compare plan with presence'),
        body: t('The live lens opens on badge evidence, showing who actually covered each room and service.'),
        placement: 'left',
        enter: { click: '[data-tour="ts-coverage"]', waitFor: '.drawer' },
        leave: { click: '[data-tour="drawer-close"]' }
      },
      {
        target: '[data-tour="ts-gate"]',
        title: t('The approval gate'),
        body: t('Conflicts, missing badges and open clock-ins are checked here before payroll.'),
        placement: 'left'
      },
      {
        target: '[data-tour="ts-approve"]',
        title: t('Approve the week'),
        body: t('Approve early and reopen later if needed — only a live, open clock-in blocks approval.'),
        placement: 'left'
      },
      {
        target: '.dialog',
        title: t('A payroll export you can inspect'),
        body: t('The export wizard previews rows, preserves column choices, and labels draft versus official evidence.'),
        placement: 'left',
        enter: { click: '[data-tour="ts-export"] .primary-action', waitFor: '.dialog' },
        leave: { click: '[data-tour="dialog-close"]' }
      },
      ...managerShellSteps(),
      {
        title: t('That is Timesheet'),
        body: t('You can close payroll with confidence. Reopen this tour anytime from the ? button.')
      }
    ]
  };
}

function teamManagerTour(): TourScript {
  return {
    key: 'team:manager',
    label: t('Team tour'),
    steps: [
      {
        title: t('Welcome to Team'),
        body: t('Everyone who works here lives on this page — access, contracts, pay and absences in one place.')
      },
      {
        target: '[data-tour="team-ready"]',
        title: t('Is your crew ready?'),
        body: t('Access, contracts and payroll — when every check is green, scheduling and payroll can run.'),
        how: t('Click a check to fix whatever is missing.'),
        placement: 'bottom'
      },
      {
        target: '[data-tour="team-list"]',
        title: t('Your people'),
        body: t('Everyone on the team, with their role and readiness at a glance.'),
        placement: 'top'
      },
      {
        target: '[data-tour="team-member"]',
        title: t('Open a profile'),
        body: t('Click a card to edit role, contract and wage, manage login access, or record an absence.'),
        placement: 'bottom'
      },
      {
        target: '.drawer',
        title: t('One complete employee record'),
        body: t('The real profile opens here: identity, contract, access, recurring schedule and leave stay together.'),
        placement: 'left',
        enter: { click: '[data-tour="team-member"]', waitFor: '.drawer' },
        leave: { click: '[data-tour="drawer-close"]' }
      },
      {
        target: '[data-tour="team-add"]',
        title: t('Add someone new'),
        body: t('Create an employee here, then complete their contract and access.'),
        placement: 'auto'
      },
      {
        target: '[data-tour="team-radar"]',
        title: t('Who needs attention'),
        body: t('The people radar surfaces anyone with a missing detail before it blocks service or pay.'),
        placement: 'left'
      },
      ...managerShellSteps(),
      {
        title: t('That is Team'),
        body: t('Your crew is under control. Reopen this tour anytime from the ? button.')
      }
    ]
  };
}

function restaurantOwnerTour(): TourScript {
  return {
    key: 'restaurant:owner',
    label: t('Restaurant tour'),
    steps: [
      {
        title: t('Welcome to Restaurant'),
        body: t('This is the blueprint behind everything — identity, areas, positions and hours that Schedule and Timesheet rely on.')
      },
      {
        target: '[data-tour="rest-blueprint"]',
        title: t('Your operating model'),
        body: t('When every section is ready, Coverage and payroll can trust your setup.'),
        placement: 'bottom'
      },
      {
        target: '[data-tour="rest-nav"]',
        title: t('Jump to any section'),
        body: t('Identity, hours, areas, positions and absences — one click away.'),
        placement: 'bottom'
      },
      {
        target: '[data-tour="rest-identity"]',
        title: t('Identity and rhythm'),
        body: t('Your legal details, and which services run on each day of the week.'),
        how: t('Click a card to edit it.'),
        placement: 'top'
      },
      {
        target: '[data-tour="rest-areas"]',
        title: t('Your areas'),
        body: t('The rooms and zones you staff, each with its lunch and evening minimums.'),
        placement: 'top'
      },
      {
        target: '[data-tour="rest-positions"]',
        title: t('Your positions'),
        body: t('The role catalogue — with a badge colour and cost — that employees are assigned to.'),
        placement: 'top'
      },
      {
        target: '[data-tour="rest-devices"]',
        title: t('Badge devices'),
        body: t('Pair a tablet as a dedicated clock-in terminal that never reaches manager data.'),
        placement: 'top'
      },
      ...managerShellSteps(),
      {
        title: t('That is Restaurant'),
        body: t('Your foundation is set. Reopen this tour anytime from the ? button.')
      }
    ]
  };
}

function insightsManagerTour(): TourScript {
  return {
    key: 'insights:manager',
    label: t('Insights tour'),
    steps: [
      {
        title: t('Welcome to Insights'),
        body: t('Explore how the restaurant is really running — compare periods and open the evidence behind every number.')
      },
      {
        target: '[data-tour="ins-tabs"]',
        title: t('Three lenses'),
        body: t('Overview for the restaurant pulse, People for evidence by employee, Operations for services and areas.'),
        placement: 'bottom'
      },
      {
        target: '[data-tour="ins-lens"]',
        title: t('The period you are viewing'),
        body: t('Everything below reflects this period, compared against the one before.'),
        placement: 'left'
      },
      {
        target: '[data-tour="ins-filters"]',
        title: t('Slice the evidence'),
        body: t('Change the period or comparison, or filter by employee, area and service.'),
        placement: 'bottom'
      },
      {
        target: '[data-tour="ins-kpis"]',
        title: t('The headline numbers'),
        body: t('Worked hours, plan adherence, on-time starts and evidence gaps — at a glance.'),
        placement: 'top'
      },
      {
        target: '[data-tour="ins-chart"]',
        title: t('Worked against plan'),
        body: t('See how actual hours tracked the plan across the whole period.'),
        placement: 'top'
      },
      ...managerShellSteps(),
      {
        title: t('That is Insights'),
        body: t('The story behind your numbers. Reopen this tour anytime from the ? button.')
      }
    ]
  };
}

// Resolve the tour for a given route + role. Returns null when no script fits.
export function tourFor(pathname: string, role: Role): TourScript | null {
  const path = pathname.replace(/\/+$/, '') || '/home';

  if (path === '/home' && isManagerSide(role)) return homeManagerTour();
  if (path === '/schedule' && isManagerSide(role)) return scheduleManagerTour();
  if (path === '/timesheet' && isManagerSide(role)) return timesheetManagerTour();
  if (path === '/team' && isManagerSide(role)) return teamManagerTour();
  if (path === '/restaurant' && isOwner(role)) return restaurantOwnerTour();
  if (path === '/dashboard' && isManagerSide(role)) return insightsManagerTour();
  if (path === '/my-service' && isEmployee(role)) return myServiceEmployeeTour();
  if (path === '/my-time' && isEmployee(role)) return myTimeEmployeeTour();

  return null;
}

// Whether any tour exists for this page+role (drives whether the help control
// is offered here).
export function hasTour(pathname: string, role: Role): boolean {
  return tourFor(pathname, role) !== null;
}
