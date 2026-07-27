export type WorkspaceTheme = 'cobalt' | 'tangerine';

const STORAGE_KEY = 'rst-workspace-theme';
const DEFAULT_THEME: WorkspaceTheme = 'cobalt';
const THEME_COLORS: Record<WorkspaceTheme, string> = {
  cobalt: '#101828',
  tangerine: '#101828'
};

function isWorkspaceTheme(value: string | null): value is WorkspaceTheme {
  return value === 'cobalt' || value === 'tangerine';
}

class WorkspaceThemeState {
  value = $state<WorkspaceTheme>(DEFAULT_THEME);
  initialized = $state(false);

  init(): void {
    if (typeof document === 'undefined') return;
    let stored: string | null = null;
    try {
      stored = localStorage.getItem(STORAGE_KEY);
    } catch {
      // Storage is optional; the recommended theme remains the safe default.
    }
    this.value = isWorkspaceTheme(stored) ? stored : DEFAULT_THEME;
    this.apply();
    this.initialized = true;
  }

  set(next: WorkspaceTheme): void {
    this.value = next;
    this.apply();
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // The theme still changes for this session when storage is unavailable.
    }
  }

  private apply(): void {
    if (typeof document === 'undefined') return;
    document.documentElement.dataset.theme = this.value;
    document
      .querySelector<HTMLMetaElement>('meta[name="theme-color"]')
      ?.setAttribute('content', THEME_COLORS[this.value]);
  }
}

export const workspaceTheme = new WorkspaceThemeState();
