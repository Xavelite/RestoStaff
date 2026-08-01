/**
 * How this account likes to read its workspaces.
 *
 * Grid is the dense, scannable default: the right shape when someone is
 * comparing many records or editing in place. Visual lets each module choose
 * the clearest second representation: entity tiles, a matrix, a lifecycle
 * board, a timeline, or another domain-specific view.
 *
 * It is one account-level preference rather than a per-page toggle: a person
 * has a way they like to read, and it should follow them across every module
 * instead of being re-chosen on each screen. Surfaces whose shape carries real
 * meaning — calendars, rosters, floor plans — deliberately ignore it.
 */

const STORAGE_KEY = 'rst-workspace-layout';

type WorkspaceLayoutMode = 'grid' | 'visual';

class WorkspaceLayoutPreference {
  current = $state<WorkspaceLayoutMode>('grid');

  constructor() {
    if (typeof localStorage === 'undefined') return;
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      // Keep the preference saved before the layout contract was renamed.
      if (stored === 'visual' || stored === 'cards') this.current = 'visual';
    } catch {
      // A device that refuses storage still reads in the default rows.
    }
  }

  get visual(): boolean {
    return this.current === 'visual';
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
