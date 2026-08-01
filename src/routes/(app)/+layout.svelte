<script lang="ts">
  import { onMount, tick } from 'svelte';
  import { page } from '$app/state';
  import { beforeNavigate, goto } from '$app/navigation';
  import { auth } from '$lib/auth/session.svelte';
  import ConfirmHost from '$lib/components/ConfirmHost.svelte';
  import UnsavedChangesHost from '$lib/navigation/UnsavedChangesHost.svelte';
  import ToastHost from '$lib/components/ToastHost.svelte';
  import NotificationBell from '$lib/components/NotificationBell.svelte';
  import WorkspacePreferencesMenu from '$lib/workspace-ui/WorkspacePreferencesMenu.svelte';
  import CommunicationCenter from '$lib/communications/CommunicationCenter.svelte';
  import PopcornPet from '$lib/pet/PopcornPet.svelte';
  import AccountMenu from '$lib/app-shell/AccountMenu.svelte';
  import { useAppSession } from '$lib/app-shell/app-session.svelte';
  import { exitPreviewSession, signOutOfApp } from '$lib/app-shell/app-actions';
  import { t } from '$lib/i18n/i18n.svelte';
  import { workspace } from '$lib/workspace/workspace.svelte';
  import { supabase } from '$lib/supabase/client';
  import { toasts } from '$lib/ui/toast.svelte';
  import { workspaceTheme } from '$lib/ui/theme.svelte';
  import WorkspaceIcon from '$lib/workspace-ui/WorkspaceIcon.svelte';
  import { workspaceShellPreferences } from '$lib/workspace-ui/workspace-shell-preferences.svelte';
  import { installWorkspaceColumnOrdering } from '$lib/workspace-ui/workspace-column-order';
  
  import {
    moduleForPath,
    moduleIsEntitled,
    modulesForRole,
    subNavItemForPath,
    type WorkspaceModule
  } from '$lib/workspace-ui/workspace-nav';
  import { roleHome } from '$lib/workspace/workspace-selection';
  import { unsavedChanges } from '$lib/navigation/unsaved-changes.svelte';
  import '$lib/workspace-ui/workspace.css';

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
      sidebarCollapsed = localStorage.getItem('rst-workspace-rail') === 'on';
    } catch {
      sidebarCollapsed = false;
    }
    workspaceShellPreferences.init();
  });

  onMount(installWorkspaceColumnOrdering);

  function toggleRail() {
    if (workspaceShellPreferences.sidebarMode === 'auto') {
      workspaceShellPreferences.setSidebarMode('pinned');
      sidebarCollapsed = false;
      try {
        localStorage.setItem('rst-workspace-rail', 'off');
      } catch {
        // Keep the pinned menu for this session.
      }
      return;
    }
    sidebarCollapsed = !sidebarCollapsed;
    try {
      localStorage.setItem('rst-workspace-rail', sidebarCollapsed ? 'on' : 'off');
    } catch {
      // A device that refuses storage still toggles for this session.
    }
  }

  const modules = $derived(
    modulesForRole(workspace.effectiveRole, workspace.moduleEntitlements)
      .filter((module) => !module.homeOnly)
  );
  const primaryModules = $derived(modules.filter((module) => !module.utility));
  const utilityModules = $derived(modules.filter((module) => module.utility));
  const activeModule = $derived(moduleForPath(page.url.pathname));
  const activeTabs = $derived(
    (activeModule?.subNav ?? []).filter(
      (item) =>
        !item.roles ||
        (workspace.effectiveRole ? item.roles.includes(workspace.effectiveRole) : false)
    )
  );
  const activeTabHref = $derived(activeModule ? subNavItemForPath(activeModule, page.url.pathname)?.href ?? '' : '');
  // `data-design` now lives on the document in app.html so every route shares
  // the palette from first paint; only the theme choice is read here.
  onMount(() => {
    workspaceTheme.init();
    return () => {
      delete document.documentElement.dataset.theme;
    };
  });

  // Role boundaries are enforced by route, not by hidden links: a module the
  // role cannot open sends them back to their own home.
  $effect(() => {
    if (!workspace.loaded || !workspace.active || session.switchingWorkspace) return;
    const role = workspace.effectiveRole;
    if (!role) return;
    const module = moduleForPath(page.url.pathname);
    if (
      module &&
      (
        !module.roles.includes(role) ||
        !moduleIsEntitled(module.key, workspace.moduleEntitlements)
      )
    ) {
      goto(roleHome(role), { replaceState: true });
      return;
    }
    const activeSubNav = module ? subNavItemForPath(module, page.url.pathname) : null;
    if (activeSubNav?.roles && !activeSubNav.roles.includes(role)) {
      goto(module?.href ?? roleHome(role), { replaceState: true });
    }
  });

  $effect(() => {
    void page.url.pathname;
    sidebarOpen = false;
  });

  $effect(() => {
    const href = activeTabHref;
    if (!href) return;
    void tick().then(() => {
      const activeTab = [...document.querySelectorAll<HTMLAnchorElement>('.cl-topbar__tab')]
        .find((tab) => tab.getAttribute('href') === href);
      activeTab?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    });
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

{#snippet moduleNav(items: WorkspaceModule[], label: string)}
  <nav class="cl-sidebar__nav" aria-label={t(label)}>
    {#each items as module, index (module.key)}
      {#if index > 0 && module.navSection !== items[index - 1]?.navSection}
        <span class="cl-sidebar__divider" aria-hidden="true"></span>
      {/if}
      <a
        class="cl-sidebar__link"
        class:is-active={module.key === activeModule?.key}
        data-module-key={module.key}
        aria-current={module.key === activeModule?.key ? 'page' : undefined}
        title={t(module.label)}
        href={module.href}
      >
        <WorkspaceIcon name={module.icon} />
        <span>{t(module.label)}</span>
      </a>
    {/each}
  </nav>
{/snippet}

{#if auth.session}
  <div
      class="cl-app"
      class:is-rail={sidebarCollapsed || workspaceShellPreferences.sidebarMode === 'auto'}
      class:is-auto-rail={workspaceShellPreferences.sidebarMode === 'auto'}
      data-module={activeModule?.key ?? 'home'}
    >
      <a class="cl-brand" href="/home" aria-label="Restogogo">
        <span class="cl-brand__mark" style="--brand-mark:url('/brand/restogogo-mark.png')" aria-hidden="true"></span>
        <span class="cl-brand__word" aria-hidden="true"><i>esto</i><i>gogo</i></span>
      </a>

      <header class="cl-topbar" class:has-tabs={activeTabs.length > 0}>
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
          <h1 class="cl-pagetitle">
            <span class="cl-pagetitle__icon" aria-hidden="true">
              <WorkspaceIcon name={activeModule.icon} size={17} />
            </span>
            <span>{t(activeModule.label)}</span>
          </h1>
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


        <WorkspacePreferencesMenu />

        {#if !workspace.isPreview}
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
        {@render moduleNav(primaryModules, 'Main')}
        {#if utilityModules.length}
          <div class="cl-sidebar__utility">
            {@render moduleNav(utilityModules, 'Settings')}
          </div>
        {/if}
        <button
          class="cl-rail-toggle"
          type="button"
          aria-label={workspaceShellPreferences.sidebarMode === 'auto' ? t('Pin menu') : sidebarCollapsed ? t('Expand menu') : t('Collapse menu')}
          title={workspaceShellPreferences.sidebarMode === 'auto' ? t('Pin menu') : sidebarCollapsed ? t('Expand menu') : t('Collapse menu')}
          aria-pressed={sidebarCollapsed || workspaceShellPreferences.sidebarMode === 'auto'}
          onclick={toggleRail}
        >
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 6l-6 6 6 6" /></svg>
          <span>{t('Collapse')}</span>
        </button>
      </aside>

      {#if sidebarOpen}
        <button class="cl-scrim" type="button" aria-label={t('Close')} onclick={() => (sidebarOpen = false)}></button>
        <aside class="cl-drawer">
          {@render moduleNav(primaryModules, 'Main')}
          {#if utilityModules.length}
            <div class="cl-sidebar__utility">
              {@render moduleNav(utilityModules, 'Settings')}
            </div>
          {/if}
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
          {@render children()}
        {/if}
      </main>

      <PopcornPet />

      {#if !workspace.isPreview}
        <CommunicationCenter
          restaurantId={workspace.activeId}
          role={workspace.effectiveRole}
          employeeId={workspace.effectiveEmployeeId}
        />
      {/if}
  </div>
  <ConfirmHost />
  <UnsavedChangesHost />
  <ToastHost />
{/if}

<style>
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
    font-size: var(--rst-fs-body);
  }
  .cl-state {
    display: grid;
    gap: 8px;
    max-width: 560px;
    padding: 48px 0;
  }
  .cl-state h1 {
    margin: 0;
    font-size: var(--rst-fs-heading);
    font-weight: var(--rst-fw-display);
  }
  .cl-state p {
    margin: 0;
    color: var(--cl-muted);
    font-size: var(--rst-fs-body-lg);
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
  .cl-main.is-preview .cl-notice button {
    pointer-events: auto;
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
