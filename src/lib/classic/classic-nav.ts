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
  /** Legacy or transitional URLs that should still resolve to this module. */
  aliases?: string[];
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
  /** Visual grouping for the manager sidebar. */
  navSection?: 'home' | 'setup' | 'operations' | 'reservations' | 'payroll' | 'reports' | 'employee';
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
  | 'exports'
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
    roles: MANAGER,
    navSection: 'home'
  },
  {
    key: 'schedule',
    href: '/schedule',
    label: 'Schedule',
    summary: 'Weekly shifts, conflicts and publishing',
    icon: 'schedule',
    roles: MANAGER,
    navSection: 'operations',
    subNav: [
      { href: '/schedule', label: 'Roster' },
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
    navSection: 'operations',
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
    navSection: 'setup',
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
    navSection: 'setup',
    subNav: [
      { href: '/restaurant', label: 'Profile' },
      { href: '/restaurant/areas', label: 'Areas' },
      { href: '/restaurant/positions', label: 'Positions' },
      { href: '/restaurant/coverage', label: 'Staffing' }
    ]
  },
  {
    key: 'inventory',
    href: '/coming-soon/inventory',
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
    navSection: 'reservations',
    subNav: [
      { href: '/reservations', label: 'Live' },
      { href: '/reservations/bookings', label: 'Bookings' },
      { href: '/reservations/floor-plans', label: 'Tables' },
      { href: '/reservations/setup', label: 'Settings' },
      { href: '/reservations/api', label: 'API' }
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
    href: '/payroll/employees',
    aliases: ['/payroll'],
    label: 'Payroll',
    summary: 'Employee payroll data and readiness checks',
    icon: 'payroll',
    roles: OWNER,
    navSection: 'payroll'
  },
  {
    key: 'badge-terminal',
    href: '/badge-terminal',
    // The page manages the devices; the terminal is what you open from one.
    label: 'Badge devices',
    summary: 'Paired devices and the clock-in terminal',
    icon: 'badge',
    roles: MANAGER,
    navSection: 'operations'
  },
  {
    key: 'reports',
    href: '/reports',
    label: 'Reports',
    summary: 'Hours, attendance and operational trends',
    icon: 'reports',
    roles: MANAGER,
    navSection: 'reports',
    subNav: [
      { href: '/reports', label: 'Overview' },
      { href: '/reports/people', label: 'People' },
      { href: '/reports/operations', label: 'Operations' }
    ]
  },
  {
    key: 'exports',
    href: '/exports',
    label: 'Exports',
    summary: 'Operational files for planning, worked time and payroll handoff',
    icon: 'exports',
    roles: MANAGER,
    navSection: 'reports'
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
      { href: '/settings/connections', label: 'Payroll setup' },
      { href: '/settings/absence-types', label: 'Time-off types' }
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
    roles: EMPLOYEE,
    navSection: 'employee'
  },
  {
    key: 'my-time',
    href: '/my-time',
    label: 'My time',
    summary: 'Your hours, time off and balance',
    icon: 'time',
    roles: EMPLOYEE,
    navSection: 'employee'
  }
];

const MODULE_ORDER = [
  'home',
  'restaurant',
  'team',
  'schedule',
  'time',
  'badge-terminal',
  'reservations',
  'payroll',
  'reports',
  'exports',
  'settings',
  'inventory',
  'recipes',
  'purchasing',
  'menu-costing',
  'tasks',
  'food-safety',
  'my-service',
  'my-time'
] as const;
const moduleOrder = new Map<string, number>(MODULE_ORDER.map((key, index) => [key, index]));

export function modulesForRole(role: WorkspaceRole | null): ClassicModule[] {
  if (!role) return [];
  return CLASSIC_MODULES
    .filter((module) => module.roles.includes(role))
    .sort((left, right) => (moduleOrder.get(left.key) ?? 999) - (moduleOrder.get(right.key) ?? 999));
}

/** The module a pathname belongs to, matching the longest href first. */
export function moduleForPath(pathname: string): ClassicModule | null {
  return (
    CLASSIC_MODULES.filter((module) =>
      [module.href, ...(module.aliases ?? []), ...(module.subNav?.map((item) => item.href) ?? [])].some(
        (href) => pathname === href || pathname.startsWith(`${href}/`)
      )
    ).sort((left, right) => {
      const matchLength = (module: ClassicModule) =>
        Math.max(
          ...[module.href, ...(module.aliases ?? []), ...(module.subNav?.map((item) => item.href) ?? [])]
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
