// One confirmation surface for the whole product. Anything destructive asks
// through here rather than inventing its own dialog, so the wording, the
// keyboard behaviour and the "danger" styling are identical everywhere:
//
//   if (!(await confirmAction({ title: 'Revoke this device?', ... }))) return;
//
// Labels are plain English and translated at render time, like the rest of the
// UI copy.

type ConfirmRequest = {
  title: string;
  /** One sentence on what happens, and whether it can be undone. */
  body?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** 'danger' for anything that destroys or cuts off access. */
  tone?: 'danger' | 'primary';
};

type PendingConfirm = ConfirmRequest & { resolve: (accepted: boolean) => void };

class ConfirmStore {
  pending = $state<PendingConfirm | null>(null);

  ask(request: ConfirmRequest): Promise<boolean> {
    // Only one question at a time. A second request supersedes the first, which
    // resolves as declined so its caller never silently proceeds.
    this.pending?.resolve(false);
    return new Promise<boolean>((resolve) => {
      this.pending = { ...request, resolve };
    });
  }

  #settle(accepted: boolean): void {
    const current = this.pending;
    this.pending = null;
    current?.resolve(accepted);
  }

  accept(): void {
    this.#settle(true);
  }

  dismiss(): void {
    this.#settle(false);
  }
}

export const confirmer = new ConfirmStore();

export function confirmAction(request: ConfirmRequest): Promise<boolean> {
  return confirmer.ask(request);
}
