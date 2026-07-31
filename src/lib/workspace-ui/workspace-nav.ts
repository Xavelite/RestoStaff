import type { WorkspaceRole } from '$lib/api/workspace';
import type { ModuleEntitlements } from '$lib/api/workspace-snapshot';

/**
 * The workspace navigation model: one entry per module, each with its own
 * sub-navigation. Pilot surfaces show only completed modules; future modules can
 * stay registered here without leaking into Home or the everyday sidebar.
 */
export type WorkspaceSubNavItem = {
  href: string;
  label: string;
  roles?: WorkspaceRole[];
};

export type WorkspaceModule = {
  key: string;
  href: string;
  /** Legacy or transitional URLs that should still resolve to this module. */
  aliases?: string[];
  label: string;
  /** One line on the Home tile: what this module is for. */
  summary: string;
  icon: WorkspaceIcon;
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
  navSection?: 'home' | 'setup' | 'operations' | 'payroll' | 'records' | 'reports' | 'employee';
  subNav?: WorkspaceSubNavItem[];
};

export type WorkspaceIcon =
  | 'home'
  | 'schedule'
  | 'time'
  | 'team'
  | 'documents'
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

const WORKSPACE_MODULES: WorkspaceModule[] = [
  {
    key: 'home',
    href: '/home',
    label: 'Home',
    summary: 'Every restaurant module in one place',
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
      { href: '/schedule/calendar', label: 'Calendar' },
      { href: '/schedule/history', label: 'History' }
    ]
  },
  {
    key: 'time',
    href: '/timesheet',
    label: 'Time',
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
      { href: '/team/payroll', label: 'Payroll', roles: OWNER },
      { href: '/team/access', label: 'Access' },
      { href: '/team/absences', label: 'Time off' },
      { href: '/team/time-off-types', label: 'Time-off types' }
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
      { href: '/restaurant/floor-plan', label: 'Floor plan' },
      { href: '/restaurant/positions', label: 'Positions' },
      { href: '/restaurant/coverage', label: 'Staffing' }
    ]
  },
  {
    key: 'documents',
    href: '/documents',
    label: 'Documents',
    summary: 'Contracts, certificates and restaurant records',
    icon: 'documents',
    roles: MANAGER,
    navSection: 'records'
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
    navSection: 'operations',
    subNav: [
      { href: '/reservations', label: 'Live' },
      { href: '/reservations/bookings', label: 'Bookings' },
      { href: '/reservations/setup', label: 'Settings' },
      { href: '/reservations/api', label: 'Online booking' }
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
    aliases: ['/payroll/employees'],
    label: 'Payroll',
    summary: 'Employment data and social-secretariat readiness',
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
    navSection: 'records'
  },
  {
    key: 'settings',
    href: '/settings',
    label: 'Settings',
    summary: 'Your workspace appearance and behaviour',
    icon: 'settings',
    roles: [...MANAGER, ...EMPLOYEE],
    utility: true,
    navSection: 'employee'
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
  'reservations',
  'badge-terminal',
  'payroll',
  'documents',
  'exports',
  'reports',
  'inventory',
  'recipes',
  'purchasing',
  'menu-costing',
  'tasks',
  'food-safety',
  'settings',
  'my-service',
  'my-time'
] as const;
const moduleOrder = new Map<string, number>(MODULE_ORDER.map((key, index) => [key, index]));

export function moduleIsEntitled(
  moduleKey: string,
  entitlements?: ModuleEntitlements
): boolean {
  if (moduleKey === 'settings') return true;
  if (WORKSPACE_MODULES.some((module) => module.key === moduleKey && module.placeholder)) {
    return true;
  }
  if (!entitlements) return true;
  const state = entitlements[moduleKey];
  return state === 'enabled' || state === 'preview';
}

export function modulesForRole(
  role: WorkspaceRole | null,
  entitlements?: ModuleEntitlements
): WorkspaceModule[] {
  if (!role) return [];
  return WORKSPACE_MODULES
    .filter(
      (module) =>
        module.roles.includes(role) &&
        moduleIsEntitled(module.key, entitlements)
    )
    .sort((left, right) => (moduleOrder.get(left.key) ?? 999) - (moduleOrder.get(right.key) ?? 999));
}

/** The module a pathname belongs to, matching the longest href first. */
export function moduleForPath(pathname: string): WorkspaceModule | null {
  return (
    WORKSPACE_MODULES.filter((module) =>
      [module.href, ...(module.aliases ?? []), ...(module.subNav?.map((item) => item.href) ?? [])].some(
        (href) => pathname === href || pathname.startsWith(`${href}/`)
      )
    ).sort((left, right) => {
      const matchLength = (module: WorkspaceModule) =>
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
  module: WorkspaceModule,
  pathname: string
): WorkspaceSubNavItem | null {
  if (!module.subNav) return null;
  return (
    [...module.subNav]
      .sort((left, right) => right.href.length - left.href.length)
      .find((item) => pathname === item.href || pathname.startsWith(`${item.href}/`)) ?? null
  );
}
