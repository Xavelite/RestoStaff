import type { WorkspaceRole } from '$lib/api/workspace';

/**
 * The classic navigation model: one entry per module, each with its own
 * sub-navigation. The shell renders whatever is listed here, including modules
 * that are not built yet (Inventory), so adding a module is a data change.
 */
export type ClassicSubNavItem = {
  href: string;
  label: string;
};

export type ClassicModule = {
  key: string;
  href: string;
  label: string;
  /** One line on the Home tile: what this module is for. */
  summary: string;
  icon: ClassicIcon;
  roles: WorkspaceRole[];
  /** Modules with no screens yet still appear, marked as coming later. */
  placeholder?: boolean;
  /** A full-screen module has no sidebar, no tabs (badge terminal). */
  fullscreen?: boolean;
  subNav?: ClassicSubNavItem[];
};

export type ClassicIcon =
  | 'home'
  | 'schedule'
  | 'time'
  | 'team'
  | 'restaurant'
  | 'inventory'
  | 'payroll'
  | 'badge'
  | 'reports';

const MANAGER: WorkspaceRole[] = ['owner', 'manager'];
const OWNER: WorkspaceRole[] = ['owner'];
const EMPLOYEE: WorkspaceRole[] = ['employee'];

const CLASSIC_MODULES: ClassicModule[] = [
  {
    key: 'home',
    href: '/home',
    label: 'Home',
    summary: 'Your modules and what needs attention today',
    icon: 'home',
    roles: MANAGER
  },
  {
    key: 'schedule',
    href: '/schedule',
    label: 'Schedule',
    summary: 'Weekly planning, coverage and publishing',
    icon: 'schedule',
    roles: MANAGER,
    subNav: [
      { href: '/schedule', label: 'Planning' },
      { href: '/schedule/coverage', label: 'Coverage' },
      { href: '/schedule/publish', label: 'Publish' },
      { href: '/schedule/history', label: 'History' }
    ]
  },
  {
    key: 'time',
    href: '/timesheet',
    label: 'Time & attendance',
    summary: 'Clock-ins, corrections and week approval',
    icon: 'time',
    roles: MANAGER,
    subNav: [
      { href: '/timesheet', label: 'Timesheet' },
      { href: '/timesheet/calendar', label: 'Calendar' },
      { href: '/timesheet/live', label: 'Live monitor' }
    ]
  },
  {
    key: 'team',
    href: '/team',
    label: 'Team',
    summary: 'People, contracts, access and absences',
    icon: 'team',
    roles: MANAGER,
    subNav: [
      { href: '/team', label: 'People' },
      { href: '/team/contracts', label: 'Contracts' },
      { href: '/team/access', label: 'Access' },
      { href: '/team/absences', label: 'Absences' }
    ]
  },
  {
    key: 'restaurant',
    href: '/restaurant',
    label: 'Restaurant',
    summary: 'Identity, opening hours, areas and positions',
    icon: 'restaurant',
    roles: OWNER,
    subNav: [
      { href: '/restaurant', label: 'Identity' },
      { href: '/restaurant/hours', label: 'Hours' },
      { href: '/restaurant/areas', label: 'Areas' },
      { href: '/restaurant/positions', label: 'Positions' },
      { href: '/restaurant/absence-types', label: 'Absence types' },
      { href: '/restaurant/devices', label: 'Badge devices' }
    ]
  },
  {
    key: 'inventory',
    href: '/inventory',
    label: 'Inventory',
    summary: 'Stock counts and item management',
    icon: 'inventory',
    roles: MANAGER,
    placeholder: true
  },
  {
    key: 'payroll',
    href: '/payroll',
    label: 'Payroll',
    summary: 'Employment terms, labour cost and exports',
    icon: 'payroll',
    roles: OWNER,
    subNav: [
      { href: '/payroll', label: 'Employment terms' },
      { href: '/payroll/costs', label: 'Costs' },
      { href: '/payroll/exports', label: 'Exports' }
    ]
  },
  {
    key: 'badge-terminal',
    href: '/badge-terminal',
    label: 'Badge terminal',
    summary: 'Clock in and out on a shared device',
    icon: 'badge',
    roles: MANAGER,
    fullscreen: true
  },
  {
    key: 'reports',
    href: '/reports',
    label: 'Reports',
    summary: 'Hours, cost and operational trends',
    icon: 'reports',
    roles: MANAGER,
    subNav: [
      { href: '/reports', label: 'Overview' },
      { href: '/reports/people', label: 'People' },
      { href: '/reports/operations', label: 'Operations' }
    ]
  },
  // Employees share the same shell; their two screens are simply the only
  // modules their role can see.
  {
    key: 'my-service',
    href: '/my-service',
    label: 'My service',
    summary: 'Your week and your availability',
    icon: 'schedule',
    roles: EMPLOYEE
  },
  {
    key: 'my-time',
    href: '/my-time',
    label: 'My time',
    summary: 'Your hours, time off and balance',
    icon: 'time',
    roles: EMPLOYEE
  }
];

export function modulesForRole(role: WorkspaceRole | null): ClassicModule[] {
  if (!role) return [];
  return CLASSIC_MODULES.filter((module) => module.roles.includes(role));
}

/** The module a pathname belongs to, matching the longest href first. */
export function moduleForPath(pathname: string): ClassicModule | null {
  return (
    CLASSIC_MODULES.filter(
      (module) => pathname === module.href || pathname.startsWith(`${module.href}/`)
    ).sort((left, right) => right.href.length - left.href.length)[0] ?? null
  );
}

/** The sub-nav entry a pathname sits on, so tabs highlight exactly one item. */
export function subNavItemForPath(
  module: ClassicModule,
  pathname: string
): ClassicSubNavItem | null {
  if (!module.subNav) return null;
  return (
    [...module.subNav]
      .sort((left, right) => right.href.length - left.href.length)
      .find((item) => pathname === item.href || pathname.startsWith(`${item.href}/`)) ?? null
  );
}
