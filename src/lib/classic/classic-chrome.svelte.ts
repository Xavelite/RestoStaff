import type { ClassicSubNavItem } from './classic-nav';

/**
 * Route-owned tabs rendered by the application top bar.
 *
 * Page controls intentionally stay inside the page work area. Keeping this
 * store tab-only prevents page-local snippets and mutations from being moved
 * across the layout boundary.
 */
class ClassicChrome {
  tabs = $state<ClassicSubNavItem[]>([]);
  activeHref = $state('');
  #owner = '';

  set(owner: string, tabs: ClassicSubNavItem[], activeHref: string): void {
    this.#owner = owner;
    this.tabs = tabs;
    this.activeHref = activeHref;
  }

  clear(owner: string): void {
    if (this.#owner !== owner) return;
    this.#owner = '';
    this.tabs = [];
    this.activeHref = '';
  }
}

export const classicChrome = new ClassicChrome();
