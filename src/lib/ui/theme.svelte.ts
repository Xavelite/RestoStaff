class WorkspaceThemeState {
  initialized = $state(false);

  init(): void {
    if (typeof document === 'undefined') return;
    document.documentElement.dataset.theme = 'tangerine';
    document
      .querySelector<HTMLMetaElement>('meta[name="theme-color"]')
      ?.setAttribute('content', '#101828');
    this.initialized = true;
  }
}

export const workspaceTheme = new WorkspaceThemeState();
