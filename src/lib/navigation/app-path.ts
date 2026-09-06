import { base } from '$app/paths';

/**
 * Resolve one of Restogogo's logical root routes inside the deployment mount.
 * Locally `base` is empty; xbesnard.com builds use `/restogogo`.
 */
export function appPath(path: string): string {
  if (!path.startsWith('/') || path.startsWith('//')) return path;
  if (base && (path === base || path.startsWith(`${base}/`))) return path;
  return `${base}${path}`;
}

/** Strip the deployment mount before matching routes against product models. */
export function logicalPath(pathname: string): string {
  if (!base) return pathname;
  if (pathname === base) return '/';
  return pathname.startsWith(`${base}/`) ? pathname.slice(base.length) : pathname;
}

/** Build an absolute callback or share URL without losing the deployment mount. */
export function appUrl(path: string, origin: string): string {
  return new URL(appPath(path), origin).toString();
}
