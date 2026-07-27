import type { WorkspaceRole } from '$lib/api/workspace';

/**
 * The classic navigation model: one entry per module, each with its own
 * sub-navigation. Pilot surfaces show only completed modules; future modules can
 * stay registered here without leaking into Home or the everyday sidebar.
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
  /** Marks a module as unfinished so pilot surfaces can exclude it. */
  placeholder?: boolean;
  /** Future modules stay out of the everyday sidebar and pilot Home. */
  homeOnly?: boolean;
  /** A full-screen module has no sidebar, no tabs (badge terminal). */
  fullscreen?: boolean;
  /** Utility modules are separated from the everyday operational navigation. */
  utility?: boolean;
  subNav?: ClassicSubNavItem[];
};

export type ClassicIcon =
  | 'home'
  | 'schedule'
  | 'time'
  | 'team'
  | 'restaurant'
  | 'reservations'
  | 'inventory'
  | 'payroll'
  | 'badge'
  | 'reports'
  | 'settings';

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
    roles: MANAGER,
    subNav: [
      { href: '/restaurant', label: 'Profile' },
      { href: '/restaurant/areas', label: 'Areas' },
      { href: '/restaurant/positions', label: 'Positions' },
      { href: '/restaurant/coverage', label: 'Staffing' }
    ]
  },
  {
    key: 'inventory',
    href: '/inventory',
    label: 'Inventory',
    summary: 'Stock counts and item management',
    icon: 'inventory',
    roles: MANAGER,
    placeholder: true,
    homeOnly: true
  },
  {
    key: 'reservations',
    href: '/reservations',
    label: 'Reservations',
    summary: 'Bookings, covers, tables and service demand',
    icon: 'reservations',
    roles: MANAGER,
    subNav: [
      { href: '/reservations', label: 'Live' },
      { href: '/reservations/bookings', label: 'Bookings' },
      { href: '/reservations/floor-plans', label: 'Tables' },
      { href: '/reservations/setup', label: 'Settings' }
    ]
  },
  {
    key: 'recipes',
    href: '/coming-soon/recipes',
    label: 'Recipes',
    summary: 'Recipe cards, allergens, yields and preparation',
    icon: 'restaurant',
    roles: MANAGER,
    placeholder: true,
    homeOnly: true
  },
  {
    key: 'purchasing',
    href: '/coming-soon/purchasing',
    label: 'Purchasing & suppliers',
    summary: 'Orders, deliveries, supplier prices and invoices',
    icon: 'inventory',
    roles: MANAGER,
    placeholder: true,
    homeOnly: true
  },
  {
    key: 'menu-costing',
    href: '/coming-soon/menu-costing',
    label: 'Menu costing',
    summary: 'Food cost, margins and selling-price guidance',
    icon: 'payroll',
    roles: MANAGER,
    placeholder: true,
    homeOnly: true
  },
  {
    key: 'tasks',
    href: '/coming-soon/tasks',
    label: 'Tasks & checklists',
    summary: 'Opening, closing and recurring team checklists',
    icon: 'reports',
    roles: MANAGER,
    placeholder: true,
    homeOnly: true
  },
  {
    key: 'food-safety',
    href: '/coming-soon/food-safety',
    label: 'Food safety',
    summary: 'HACCP logs, temperatures and compliance records',
    icon: 'badge',
    roles: MANAGER,
    placeholder: true,
    homeOnly: true
  },
  {
    key: 'payroll',
    href: '/payroll',
    label: 'Payroll preparation',
    summary: 'Employment data, cost estimates and secretariat exports',
    icon: 'payroll',
    roles: OWNER,
    subNav: [
      { href: '/payroll', label: 'Overview' },
      { href: '/payroll/employees', label: 'Employees' },
      { href: '/payroll/exports', label: 'Exports' },
      { href: '/payroll/configuration', label: 'Scope & settings' }
    ]
  },
  {
    key: 'badge-terminal',
    href: '/badge-terminal',
    label: 'Badge terminal',
    summary: 'Paired devices and the clock-in terminal',
    icon: 'badge',
    roles: MANAGER
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
  {
    key: 'settings',
    href: '/settings/connections',
    label: 'Settings',
    summary: 'Organization, connections and workforce policies',
    icon: 'settings',
    roles: MANAGER,
    utility: true,
    subNav: [
      { href: '/settings/connections', label: 'Connections' },
      { href: '/settings/absence-types', label: 'Time-off policies' }
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
    CLASSIC_MODULES.filter((module) =>
      [module.href, ...(module.subNav?.map((item) => item.href) ?? [])].some(
        (href) => pathname === href || pathname.startsWith(`${href}/`)
      )
    ).sort((left, right) => {
      const matchLength = (module: ClassicModule) =>
        Math.max(
          ...[module.href, ...(module.subNav?.map((item) => item.href) ?? [])]
            .filter((href) => pathname === href || pathname.startsWith(`${href}/`))
            .map((href) => href.length)
        );
      return matchLength(right) - matchLength(left);
    })[0] ?? null
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
