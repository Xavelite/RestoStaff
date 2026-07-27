import { onMount } from 'svelte';
import { goto } from '$app/navigation';
import { page } from '$app/state';
import { auth } from '$lib/auth/session.svelte';
import { amIPlatformAdmin } from '$lib/admin/admin-api';
import { ACCOUNT_LOCALE_METADATA_KEY, i18n, t } from '$lib/i18n/i18n.svelte';
import { appInstall } from '$lib/pwa/app-install.svelte';
import { workspaceRealtime } from '$lib/realtime/workspace-realtime.svelte';
import { sound } from '$lib/sound/sound.svelte';
import { toasts } from '$lib/ui/toast.svelte';
import { workspace } from '$lib/workspace/workspace.svelte';

type AppSession = {
  /** False while the browser reports no connection. */
  readonly online: boolean;
  /** An unverified owner sees the verification screen instead of the app. */
  readonly emailVerified: boolean;
  /** True while a push deep link is switching to another restaurant. */
  readonly switchingWorkspace: boolean;
  /** Reveals the platform-operator entry point only to administrators. */
  readonly isPlatformAdmin: boolean;
};

/**
 * Everything an authenticated shell needs before it can render a page:
 * language, session guard, workspace loading, realtime refresh and the
 * connection banner.
 *
 * Both designs run the same wiring — only the chrome around it differs — so
 * this lives here rather than being copied into each layout. Must be called
 * during component initialisation.
 */
export function useAppSession(): AppSession {
  let online = $state(true);
  let switchingWorkspace = $state(false);
  let isPlatformAdmin = $state(false);

  const emailVerified = $derived(Boolean(auth.user?.email_confirmed_at));

  $effect(() => {
    const preferredLanguage = auth.user?.user_metadata?.[ACCOUNT_LOCALE_METADATA_KEY];
    i18n.setLocale(preferredLanguage);
    if (typeof document !== 'undefined') document.documentElement.lang = i18n.locale;
  });

  onMount(() => {
    online = navigator.onLine;
    const wentOffline = () => (online = false);
    const wentOnline = () => {
      online = true;
      if (workspace.activeId) {
        void workspace.reloadForRoute(page.url.pathname).catch(() => undefined);
      }
    };
    window.addEventListener('offline', wentOffline);
    window.addEventListener('online', wentOnline);
    void amIPlatformAdmin().then((value) => (isPlatformAdmin = value));
    // Browsers keep audio suspended until the page has been interacted with;
    // the first real gesture is our chance to make later cues audible.
    const unlockSound = () => sound.unlock();
    window.addEventListener('pointerdown', unlockSound, { once: true });
    window.addEventListener('keydown', unlockSound, { once: true });
    const stopInstallTracking = appInstall.start();
    return () => {
      window.removeEventListener('offline', wentOffline);
      window.removeEventListener('online', wentOnline);
      window.removeEventListener('pointerdown', unlockSound);
      window.removeEventListener('keydown', unlockSound);
      stopInstallTracking();
    };
  });

  // Guard for every authenticated screen: no session → login.
  $effect(() => {
    if (auth.ready && !auth.session) {
      const target = `${page.url.pathname}${page.url.search}`;
      goto(`/login?next=${encodeURIComponent(target)}`, { replaceState: true });
    }
  });

  // A phone notification can belong to another restaurant membership. Switch
  // context before role routing so the target is evaluated with the correct
  // Owner, Manager, or Employee boundary.
  $effect(() => {
    const requestedRestaurant = page.url.searchParams.get('push_restaurant');
    if (!requestedRestaurant || !workspace.loaded || switchingWorkspace) return;
    const membership = workspace.memberships.find(
      (item) => item.restaurant_id === requestedRestaurant
    );
    if (!membership || workspace.activeId === requestedRestaurant) return;

    switchingWorkspace = true;
    void workspace
      .select(requestedRestaurant)
      .catch((error) => {
        toasts.show(error instanceof Error ? error.message : String(error), 'danger');
      })
      .finally(() => (switchingWorkspace = false));
  });

  // React to a session that appears after navigation as well as one restored on
  // initial load. The loading guard prevents duplicate RPC calls.
  $effect(() => {
    if (!auth.session) return;
    if (!emailVerified) {
      if (workspace.loaded || workspace.activeId) workspace.reset();
      return;
    }
    if (!workspace.loaded && !workspace.loading) workspace.load();
  });

  $effect(() => {
    if (!workspace.activeId || workspace.isPreview) {
      workspaceRealtime.disconnect();
      return;
    }
    workspaceRealtime.connect(workspace.activeId, (event) => {
      const label =
        event === 'planning-saved'
          ? t('Schedule changed in another session.')
          : event === 'actuals-updated'
            ? t('Timesheet received a live update.')
            : t('Workspace data changed.');
      toasts.show(t('{label} Refreshing…', { label }), 'info', 3000);
      void workspace.reloadForRoute(page.url.pathname).catch(() => undefined);
    });
    return () => workspaceRealtime.disconnect();
  });

  return {
    get online() {
      return online;
    },
    get emailVerified() {
      return emailVerified;
    },
    get switchingWorkspace() {
      return switchingWorkspace;
    },
    get isPlatformAdmin() {
      return isPlatformAdmin;
    }
  };
}
