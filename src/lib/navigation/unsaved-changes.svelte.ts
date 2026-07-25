import { goto } from '$app/navigation';

export type UnsavedChangeSource = {
  id: string;
  label: string;
  /** Child editors save before their parent page draft. */
  priority?: number;
  /** Route prefixes that share this draft and may be navigated without prompting. */
  navigationScopes?: string[];
  isDirty: () => boolean;
  save: () => void | Promise<void>;
  discard: () => void | Promise<void>;
};

type PendingAction = () => void | Promise<void>;

/**
 * One route-leave contract for the whole application.
 *
 * Editable screens register their draft here. Navigation, workspace changes,
 * preview, kiosk entry and sign-out all pass through the same Save / Discard /
 * Stay decision before they are allowed to mutate application context.
 */
class UnsavedChanges {
  #sources = new Map<string, UnsavedChangeSource>();
  #version = $state(0);
  #bypassNextNavigation = false;
  #pendingAction: PendingAction | null = null;

  open = $state(false);
  busy = $state(false);
  error = $state('');
  target = $state('');

  register(source: UnsavedChangeSource): () => void {
    this.#sources.set(source.id, source);
    this.#version += 1;
    return () => {
      if (this.#sources.get(source.id) !== source) return;
      this.#sources.delete(source.id);
      this.#version += 1;
    };
  }

  get dirtySources(): UnsavedChangeSource[] {
    void this.#version;
    return [...this.#sources.values()]
      .filter((source) => {
        try {
          return source.isDirty();
        } catch {
          return false;
        }
      })
      .sort((left, right) => (right.priority ?? 0) - (left.priority ?? 0));
  }

  get hasDirty(): boolean {
    return this.dirtySources.length > 0;
  }


  shouldBlockNavigation(target: URL | null): boolean {
    if (!target) return this.hasDirty;
    const dirty = this.dirtySources;
    if (!dirty.length) return false;
    return dirty.some((source) => {
      const scopes = source.navigationScopes ?? [];
      if (!scopes.length) return true;
      return !scopes.some((prefix) =>
        target.pathname === prefix || target.pathname.startsWith(`${prefix}/`)
      );
    });
  }

  /** The programmatic navigation used after a decision must pass once. */
  consumeNavigationBypass(): boolean {
    if (!this.#bypassNextNavigation) return false;
    this.#bypassNextNavigation = false;
    return true;
  }

  requestNavigation(target: URL): void {
    const path = `${target.pathname}${target.search}${target.hash}`;
    this.target = path;
    this.#pendingAction = async () => {
      this.#bypassNextNavigation = true;
      await goto(path);
    };
    this.error = '';
    this.open = true;
  }

  /**
   * Use for actions that change context before routing (workspace, preview,
   * kiosk or sign-out). The action runs immediately only when nothing is dirty.
   */
  async runOrRequest(action: PendingAction): Promise<boolean> {
    if (!this.hasDirty) {
      await action();
      return true;
    }
    this.target = '';
    this.#pendingAction = action;
    this.error = '';
    this.open = true;
    return false;
  }

  stay(): void {
    if (this.busy) return;
    this.open = false;
    this.target = '';
    this.error = '';
    this.#pendingAction = null;
  }

  async saveAndContinue(): Promise<void> {
    await this.#resolve('save');
  }

  async discardAndContinue(): Promise<void> {
    await this.#resolve('discard');
  }

  async #resolve(action: 'save' | 'discard'): Promise<void> {
    if (this.busy) return;
    this.busy = true;
    this.error = '';
    try {
      // Re-evaluate after every source. A child editor can stage data into a
      // parent draft (for example a new Coverage row), while another child can
      // save the parent itself (Employee details). Work from the live registry
      // until every source that became dirty during this decision has had one
      // chance to resolve.
      const attempted = new Set<string>();
      while (true) {
        const source = this.dirtySources.find((item) => !attempted.has(item.id));
        if (!source) break;
        attempted.add(source.id);
        if (!source.isDirty()) continue;
        await source[action]();
      }
      if (this.hasDirty) {
        throw new Error(
          action === 'save'
            ? 'Some changes could not be saved. Stay on this page and review them.'
            : 'Some changes could not be discarded. Stay on this page and review them.'
        );
      }
      const pending = this.#pendingAction;
      if (!pending) throw new Error('The requested action is no longer available.');
      await pending();
      this.open = false;
      this.target = '';
      this.#pendingAction = null;
    } catch (error) {
      this.#bypassNextNavigation = false;
      this.error = error instanceof Error ? error.message : String(error);
    } finally {
      this.busy = false;
    }
  }
}

export const unsavedChanges = new UnsavedChanges();
