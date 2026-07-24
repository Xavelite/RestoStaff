import { goto } from '$app/navigation';
import { auth } from '$lib/auth/session.svelte';
import { kiosk } from '$lib/kiosk/kiosk.svelte';
import { unsavedChanges } from '$lib/navigation/unsaved-changes.svelte';
import { toasts } from '$lib/ui/toast.svelte';
import { workspace } from '$lib/workspace/workspace.svelte';

/** Leaving the app: both shells and the kiosk exit share this one path. */
export async function signOutOfApp(): Promise<void> {
  try {
    await unsavedChanges.runOrRequest(async () => {
      kiosk.unlock();
      await auth.signOut();
      workspace.reset();
      toasts.clear();
      await goto('/login');
    });
  } catch (error) {
    toasts.show(error instanceof Error ? error.message : String(error), 'danger');
  }
}

/** Return from a read-only employee or persona preview to where it started. */
export async function exitPreviewSession(): Promise<void> {
  try {
    await unsavedChanges.runOrRequest(async () => {
      const returnPath = await workspace.stopPreview();
      await goto(returnPath);
    });
  } catch (error) {
    toasts.show(error instanceof Error ? error.message : String(error), 'danger');
  }
}
