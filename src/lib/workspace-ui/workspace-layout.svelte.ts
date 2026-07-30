/**
 * How this account likes to read its workspaces.
 *
 * Rows are the dense, scannable default — the right shape when someone is
 * comparing many records or editing in place. Cards trade that density for a
 * calmer, more visual read of the same data.
 *
 * It is one account-level preference rather than a per-page toggle: a person
 * has a way they like to read, and it should follow them across every module
 * instead of being re-chosen on each screen. Surfaces whose shape carries real
 * meaning — calendars, rosters, floor plans — deliberately ignore it.
 */

const STORAGE_KEY = 'rst-workspace-layout';

type WorkspaceLayoutMode = 'rows' | 'cards';

class WorkspaceLayoutPreference {
  current = $state<WorkspaceLayoutMode>('rows');

  constructor() {
    if (typeof localStorage === 'undefined') return;
    try {
      if (localStorage.getItem(STORAGE_KEY) === 'cards') this.current = 'cards';
    } catch {
      // A device that refuses storage still reads in the default rows.
    }
  }

  get cards(): boolean {
    return this.current === 'cards';
  }

  set(next: WorkspaceLayoutMode): void {
    this.current = next;
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // The choice still applies until this page is closed.
    }
  }
}

export const workspaceLayout = new WorkspaceLayoutPreference();
