type SidebarMode = 'pinned' | 'auto';

const SIDEBAR_MODE_KEY = 'rst-sidebar-mode';

class WorkspaceShellPreferences {
  sidebarMode = $state<SidebarMode>('pinned');
  initialized = $state(false);

  init(): void {
    if (this.initialized || typeof localStorage === 'undefined') return;
    try {
      this.sidebarMode = localStorage.getItem(SIDEBAR_MODE_KEY) === 'auto' ? 'auto' : 'pinned';
    } catch {
      this.sidebarMode = 'pinned';
    }
    this.initialized = true;
  }

  setSidebarMode(mode: SidebarMode): void {
    this.sidebarMode = mode;
    try {
      localStorage.setItem(SIDEBAR_MODE_KEY, mode);
    } catch {
      // The preference still applies for this session.
    }
  }
}

export const workspaceShellPreferences = new WorkspaceShellPreferences();
