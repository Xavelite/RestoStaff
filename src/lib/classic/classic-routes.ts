/**
 * Route mapping between the two designs.
 *
 * "Modern" is the original operations cockpit; "classic" is the calmer,
 * table-first admin layout under /classic. Both serve the same modules, so
 * every classic route can name the modern route that shows the same thing —
 * that is what makes the design switch a switch and not a reset.
 */
export type AppDesign = 'modern' | 'classic';

const CLASSIC_PREFIX = '/classic';

/**
 * Only manager and owner surfaces are paired for now. The classic employee
 * pages come later, so an employee has no counterpart and stays on modern.
 */
const MODERN_TO_CLASSIC: Record<string, string> = {
  '/home': '/classic/home',
  '/schedule': '/classic/schedule',
  '/timesheet': '/classic/time',
  '/team': '/classic/team',
  '/restaurant': '/classic/restaurant',
  '/dashboard': '/classic/reports',
  '/badge-terminal': '/classic/badge-terminal'
};

const CLASSIC_MODULE_TO_MODERN: Record<string, string> = {
  home: '/home',
  schedule: '/schedule',
  time: '/timesheet',
  team: '/team',
  restaurant: '/restaurant',
  payroll: '/timesheet',
  reports: '/dashboard',
  inventory: '/home',
  'badge-terminal': '/badge-terminal'
};

function isClassicPath(pathname: string): boolean {
  return pathname === CLASSIC_PREFIX || pathname.startsWith(`${CLASSIC_PREFIX}/`);
}

export function designForPath(pathname: string): AppDesign {
  return isClassicPath(pathname) ? 'classic' : 'modern';
}

/** First path segment after /classic — the module a classic route belongs to. */
function classicModule(pathname: string): string {
  if (!isClassicPath(pathname)) return '';
  return pathname.slice(CLASSIC_PREFIX.length).split('/').filter(Boolean)[0] ?? '';
}

/**
 * Reduce any route to its modern equivalent, so shared code that keys off
 * modern route names (data loading, guards) works for both designs.
 */
export function canonicalPath(pathname: string): string {
  if (!isClassicPath(pathname)) return pathname;
  return CLASSIC_MODULE_TO_MODERN[classicModule(pathname)] ?? '/home';
}

/** The classic route that shows the same thing as this modern route. */
function classicPathFor(pathname: string): string | null {
  if (isClassicPath(pathname)) return pathname;
  return MODERN_TO_CLASSIC[pathname] ?? null;
}

/** Where "switch design" should take someone standing on this page. */
export function counterpartPath(pathname: string): string | null {
  return isClassicPath(pathname) ? canonicalPath(pathname) : classicPathFor(pathname);
}

/** Apply the remembered design to a landing route chosen by role. */
export function designedHome(roleHomePath: string, preferred: AppDesign): string {
  if (preferred !== 'classic') return roleHomePath;
  return classicPathFor(roleHomePath) ?? roleHomePath;
}
