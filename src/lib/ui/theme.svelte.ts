type WorkspaceTheme = 'classic';

const THEME_STORAGE_KEY = 'rst-workspace-theme';

class WorkspaceThemeState {
  initialized = $state(false);
  current = $state<WorkspaceTheme>('classic');

  init(): void {
    if (typeof document === 'undefined') return;
    try {
      this.current = 'classic';
      localStorage.setItem(THEME_STORAGE_KEY, this.current);
    } catch {
      this.current = 'classic';
    }
    this.apply();
    this.initialized = true;
  }

  set(theme: WorkspaceTheme): void {
    this.current = theme;
    if (typeof document === 'undefined') return;
    try {
      localStorage.setItem(THEME_STORAGE_KEY, theme);
    } catch {
      // A private browser can still use the theme for this session.
    }
    this.apply();
  }

  private apply(): void {
    document.documentElement.dataset.theme = this.current;
    document
      .querySelector<HTMLMetaElement>('meta[name="theme-color"]')
      ?.setAttribute('content', '#101828');
  }
}

export const workspaceTheme = new WorkspaceThemeState();
