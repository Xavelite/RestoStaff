import type { Snippet } from 'svelte';
import type { ClassicSubNavItem } from './classic-nav';

/**
 * Shared page chrome rendered by the application top bar.
 *
 * ClassicPage publishes the active module tabs and page actions here so the
 * main content starts directly with the work surface instead of repeating a
 * second header row on every route.
 */
class ClassicChrome {
  tabs = $state<ClassicSubNavItem[]>([]);
  activeHref = $state('');
  actions = $state<Snippet | undefined>(undefined);
  #owner = '';

  set(owner: string, tabs: ClassicSubNavItem[], activeHref: string, actions?: Snippet): void {
    this.#owner = owner;
    this.tabs = tabs;
    this.activeHref = activeHref;
    this.actions = actions;
  }

  clear(owner: string): void {
    if (this.#owner !== owner) return;
    this.#owner = '';
    this.tabs = [];
    this.activeHref = '';
    this.actions = undefined;
  }
}

export const classicChrome = new ClassicChrome();
