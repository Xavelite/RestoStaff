<script lang="ts">
  import { onMount } from 'svelte';
  import { page } from '$app/state';
  import { beforeNavigate, goto } from '$app/navigation';
  import { auth } from '$lib/auth/session.svelte';
  import ConfirmHost from '$lib/components/ConfirmHost.svelte';
  import UnsavedChangesHost from '$lib/navigation/UnsavedChangesHost.svelte';
  import ToastHost from '$lib/components/ToastHost.svelte';
  import NotificationBell from '$lib/components/NotificationBell.svelte';
  import CommunicationCenter from '$lib/communications/CommunicationCenter.svelte';
  import AccountMenu from '$lib/app-shell/AccountMenu.svelte';
  import { useAppSession } from '$lib/app-shell/app-session.svelte';
  import { exitPreviewSession, signOutOfApp } from '$lib/app-shell/app-actions';
  import { t } from '$lib/i18n/i18n.svelte';
  import { kiosk } from '$lib/kiosk/kiosk.svelte';
  import { workspace } from '$lib/workspace/workspace.svelte';
  import { supabase } from '$lib/supabase/client';
  import { toasts } from '$lib/ui/toast.svelte';
  import ClassicIcon from '$lib/classic/ClassicIcon.svelte';
  
  import { moduleForPath, modulesForRole, subNavItemForPath } from '$lib/classic/classic-nav';
  import { roleHome } from '$lib/workspace/workspace-selection';
  import { unsavedChanges } from '$lib/navigation/unsaved-changes.svelte';
  import '$lib/classic/classic.css';

  let { children } = $props();
  const session = useAppSession();
  let sidebarOpen = $state(false);
  // Desktop rail: the sidebar collapses to an icon-only strip, remembered per
  // device so a manager who likes the wide list keeps it and one who wants the
  // room keeps the rail.
  let sidebarCollapsed = $state(false);
  let sendingVerification = $state(false);
  let verificationSent = $state(false);
  let notificationSettingsRequest = $state(0);

  beforeNavigate((navigation) => {
    if (unsavedChanges.consumeNavigationBypass() || !unsavedChanges.shouldBlockNavigation(navigation.to?.url ?? null)) return;
    // External navigation and browser close use the browser's native protection;
    // an async custom dialog cannot safely hold an unloading document open.
    if (!navigation.to || navigation.willUnload) return;
    navigation.cancel();
    unsavedChanges.requestNavigation(navigation.to.url);
  });

  onMount(() => {
    const protectUnload = (event: BeforeUnloadEvent) => {
      if (!unsavedChanges.hasDirty) return;
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', protectUnload);
    return () => window.removeEventListener('beforeunload', protectUnload);
  });

  onMount(() => {
    try {
      sidebarCollapsed = localStorage.getItem('rst-classic-rail') === 'on';
    } catch {
      sidebarCollapsed = false;
    }
  });

  function toggleRail() {
    sidebarCollapsed = !sidebarCollapsed;
    try {
      localStorage.setItem('rst-classic-rail', sidebarCollapsed ? 'on' : 'off');
    } catch {
      // A device that refuses storage still toggles for this session.
    }
  }

  const modules = $derived(modulesForRole(workspace.effectiveRole).filter((module) => !module.homeOnly));
  const activeModule = $derived(moduleForPath(page.url.pathname));
  const activeTabs = $derived(activeModule?.subNav ?? []);
  const activeTabHref = $derived(activeModule ? subNavItemForPath(activeModule, page.url.pathname)?.href ?? '' : '');
  // Only the terminal screen itself fills the screen — no sidebar, nothing to
  // wander into while a shared device is on the pass. Its module page, which
  // lists the paired devices, is an ordinary page.
  const fullscreen = $derived(
    page.url.pathname === '/badge-terminal/terminal' || kiosk.locked
  );

  // The palette is scoped under [data-design='classic'] so that dialogs and
  // toasts, which portal to <body>, inherit it too.
  onMount(() => {
    document.documentElement.dataset.design = 'classic';
    return () => delete document.documentElement.dataset.design;
  });

  // Role boundaries are enforced by route, not by hidden links: a module the
  // role cannot open sends them back to their own home.
  $effect(() => {
    if (!workspace.loaded || !workspace.active || session.switchingWorkspace) return;
    const role = workspace.effectiveRole;
    if (!role) return;
    const module = moduleForPath(page.url.pathname);
    if (module && !module.roles.includes(role)) {
      goto(roleHome(role), { replaceState: true });
    }
  });

  $effect(() => {
    if (kiosk.locked && page.url.pathname !== '/badge-terminal/terminal') {
      goto('/badge-terminal/terminal', { replaceState: true });
    }
  });

  $effect(() => {
    void page.url.pathname;
    sidebarOpen = false;
  });

  async function resendVerification() {
    const email = auth.user?.email;
    if (!email || sendingVerification) return;
    sendingVerification = true;
    verificationSent = false;
    try {
      const { error } = await supabase.auth.resend({
        type: 'signup',
        email,
        options: { emailRedirectTo: `${location.origin}/home` }
      });
      if (error) throw error;
      verificationSent = true;
      toasts.show(t('Verification email sent.'), 'success');
    } catch (error) {
      toasts.show(error instanceof Error ? error.message : String(error), 'danger');
    } finally {
      sendingVerification = false;
    }
  }
</script>

{#snippet moduleNav()}
  <nav class="cl-sidebar__nav" aria-label={t('Main')} data-tour="nav">
    {#each modules as module (module.key)}
      <a
        class="cl-sidebar__link"
        class:is-active={module.key === activeModule?.key}
        aria-current={module.key === activeModule?.key ? 'page' : undefined}
        title={t(module.label)}
        href={module.href}
      >
        <ClassicIcon name={module.icon} />
        <span>{t(module.label)}</span>
      </a>
    {/each}
  </nav>
{/snippet}

{#if auth.session}
  {#if fullscreen}
    <div class="cl-fullscreen">
      {@render children()}
    </div>
  {:else}
    <div class="cl-app" class:is-rail={sidebarCollapsed}>
      <a class="cl-brand" href="/home" aria-label="Restogogo">
        <img src="/brand/restogogo-mark.png" alt="" width="26" height="26" />
        <span class="cl-brand__word" aria-hidden="true"><i>esto</i><i>gogo</i></span>
      </a>

      <header class="cl-topbar">
        <button
          class="cl-btn is-icon cl-menu-toggle"
          type="button"
          aria-label={t('Main')}
          aria-expanded={sidebarOpen}
          onclick={() => (sidebarOpen = !sidebarOpen)}
        >
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16" /></svg>
        </button>

        {#if activeModule}
          <h1 class="cl-pagetitle">{t(activeModule.label)}</h1>
        {/if}

        {#if activeTabs.length}
          <nav class="cl-topbar__tabs" aria-label={t('Sections')}>
            {#each activeTabs as item (item.href)}
              <a
                class="cl-topbar__tab"
                class:is-active={item.href === activeTabHref}
                aria-current={item.href === activeTabHref ? 'page' : undefined}
                href={item.href}
              >{t(item.label)}</a>
            {/each}
          </nav>
        {/if}

        <span class="cl-topbar__spacer"></span>


        {#if !workspace.isPreview}
          <CommunicationCenter
            restaurantId={workspace.activeId}
            role={workspace.effectiveRole}
            employeeId={workspace.effectiveEmployeeId}
          />
          <NotificationBell
            restaurantId={workspace.activeId}
            role={workspace.effectiveRole}
            employeeId={workspace.effectiveEmployeeId}
            timezone={workspace.bootstrap?.restaurant_settings.timezone || 'Europe/Brussels'}
            setupNotifications={[]}
            settingsRequest={notificationSettingsRequest}
          />
        {/if}

        <AccountMenu
          isPlatformAdmin={session.isPlatformAdmin}
          onnotificationsettings={() => (notificationSettingsRequest += 1)}
        />
      </header>

      <aside class="cl-sidebar">
        {@render moduleNav()}
        <button
          class="cl-rail-toggle"
          type="button"
          aria-label={sidebarCollapsed ? t('Expand menu') : t('Collapse menu')}
          title={sidebarCollapsed ? t('Expand menu') : t('Collapse menu')}
          aria-pressed={sidebarCollapsed}
          onclick={toggleRail}
        >
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 6l-6 6 6 6" /></svg>
          <span>{t('Collapse')}</span>
        </button>
      </aside>

      {#if sidebarOpen}
        <button class="cl-scrim" type="button" aria-label={t('Close')} onclick={() => (sidebarOpen = false)}></button>
        <aside class="cl-drawer">
          {@render moduleNav()}
        </aside>
      {/if}

      <main class="cl-main" class:is-preview={workspace.isPreview}>
        {#if workspace.preview}
          <div class="cl-notice" role="status">
            <span>{t('Previewing {name}', { name: workspace.preview.displayName })} · {t('Read only')}</span>
            <button class="cl-btn" type="button" onclick={exitPreviewSession}>{t('Exit preview')}</button>
          </div>
        {/if}
        {#if !session.online}
          <div class="cl-notice" role="status">
            <span>{t('You are offline. Existing information remains visible; reconnect before saving changes.')}</span>
          </div>
        {/if}

        {#if !session.emailVerified}
          <section class="cl-state" role="status">
            <h1>{t('Verify your owner email')}</h1>
            <p>{t('We sent the verification link to {email}. Confirm it before opening restaurant operations.', { email: auth.user?.email ?? '' })}</p>
            {#if verificationSent}<p>{t('Check your inbox, then reload this page after confirming.')}</p>{/if}
            <div class="cl-state__actions">
              <button class="cl-btn is-primary" type="button" disabled={sendingVerification} onclick={resendVerification}>
                {sendingVerification ? t('Sending…') : t('Resend verification')}
              </button>
              <button class="cl-btn" type="button" onclick={signOutOfApp}>{t('Sign out')}</button>
            </div>
          </section>
        {:else if workspace.loading && !workspace.bootstrap}
          <section class="cl-state" aria-live="polite">
            <h1>{t('Loading your workspace')}</h1>
            <p>{t('Fetching the latest restaurant operations data.')}</p>
          </section>
        {:else if workspace.error && !workspace.bootstrap}
          <section class="cl-state" role="alert">
            <h1>{t('Workspace unavailable')}</h1>
            <p>{workspace.error}</p>
            <div class="cl-state__actions">
              <button class="cl-btn is-primary" type="button" onclick={() => workspace.load()}>{t('Try again')}</button>
            </div>
          </section>
        {:else if workspace.loaded && !workspace.active}
          <section class="cl-state">
            <h1>{t('No active workspace')}</h1>
            <p>{t('Your account is not linked to an active restaurant. Create one if this is a new owner account.')}</p>
            <div class="cl-state__actions">
              <a class="cl-btn is-primary" href="/onboarding">{t('Set up a restaurant')}</a>
            </div>
          </section>
        {:else}
          {#key `${page.url.pathname}${page.url.search}`}
            {@render children()}
          {/key}
        {/if}
      </main>
    </div>
  {/if}
  <ConfirmHost />
  <UnsavedChangesHost />
  <ToastHost />
{/if}

<style>
  .cl-fullscreen {
    min-height: 100vh;
    background: var(--rst-ui-bg);
  }
  .cl-menu-toggle {
    display: none;
    border-color: var(--cl-shell-line);
    background: transparent;
    color: var(--cl-shell-text);
  }
  .cl-menu-toggle:hover {
    border-color: var(--cl-shell-muted);
    background: var(--cl-shell-hover);
    color: var(--cl-shell-text);
  }
  .cl-notice {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    margin-bottom: 20px;
    padding: 10px 16px;
    border: 1px solid var(--cl-line);
    border-radius: var(--cl-radius);
    background: var(--cl-surface);
    font-size: 13px;
  }
  .cl-state {
    display: grid;
    gap: 8px;
    max-width: 560px;
    padding: 48px 0;
  }
  .cl-state h1 {
    margin: 0;
    font-size: 22px;
    font-weight: var(--rst-fw-display);
  }
  .cl-state p {
    margin: 0;
    color: var(--cl-muted);
    font-size: 14px;
    line-height: 1.55;
  }
  .cl-state__actions {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    margin-top: 8px;
  }
  .cl-main.is-preview :global(button),
  .cl-main.is-preview :global(input),
  .cl-main.is-preview :global(select),
  .cl-main.is-preview :global(textarea) {
    pointer-events: none;
  }
  .cl-scrim,
  .cl-drawer {
    display: none;
  }

  @media (max-width: 980px) {
    .cl-menu-toggle {
      display: inline-flex;
    }
    .cl-scrim {
      display: block;
      position: fixed;
      inset: 0;
      z-index: calc(var(--rst-z-panel) - 1);
      border: 0;
      background: var(--rst-overlay-bg);
    }
    .cl-drawer {
      display: block;
      position: fixed;
      top: 0;
      bottom: 0;
      left: 0;
      z-index: var(--rst-z-panel);
      width: min(280px, 84vw);
      padding-top: 12px;
      overflow-y: auto;
      border-right: 1px solid var(--cl-rail-line);
      background: var(--cl-rail-bg);
      box-shadow: 12px 0 28px rgb(15 23 42 / 12%);
    }
  }
</style>
