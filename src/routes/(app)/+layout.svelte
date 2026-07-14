<script lang="ts">
  import { page } from '$app/state';
  import { goto } from '$app/navigation';
  import { onMount } from 'svelte';
  import { setOwnBadgePin, updateOwnProfile } from '$lib/api/mutations';
  import { auth } from '$lib/auth/session.svelte';
  import ActionButton from '$lib/components/ActionButton.svelte';
  import Dialog from '$lib/components/Dialog.svelte';
  import NotificationBell from '$lib/components/NotificationBell.svelte';
  import ToastHost from '$lib/components/ToastHost.svelte';
  import {
    ACCOUNT_LOCALE_METADATA_KEY,
    i18n,
    languageOptions,
    normalizeLocale,
    t,
    type AppLocale
  } from '$lib/i18n/i18n.svelte';
  import { workspaceRealtime } from '$lib/realtime/workspace-realtime.svelte';
  import { toasts } from '$lib/ui/toast.svelte';
  import { workspace } from '$lib/workspace/workspace.svelte';
  import { orderedMemberships, roleHome } from '$lib/workspace/workspace-selection';
  import { supabase } from '$lib/supabase/client';

  let { children } = $props();
  let accountOpen = $state(false);
  let pinDialogOpen = $state(false);
  let accountDialogOpen = $state(false);
  let pin = $state('');
  let pinConfirm = $state('');
  let savingPin = $state(false);
  let accountFirstName = $state('');
  let accountLastName = $state('');
  let accountPassword = $state('');
  let accountPasswordConfirm = $state('');
  let accountLanguage = $state<AppLocale>('en');
  let savingAccount = $state(false);
  let sendingVerification = $state(false);
  let verificationSent = $state(false);
  let online = $state(true);
  let contentEl = $state<HTMLElement | undefined>();

  $effect(() => {
    const preferredLanguage = auth.user?.user_metadata?.[ACCOUNT_LOCALE_METADATA_KEY];
    i18n.setLocale(preferredLanguage);
    if (typeof document !== 'undefined') document.documentElement.lang = i18n.locale;
  });

  $effect(() => {
    void page.url.pathname;
    if (!contentEl) return;
    contentEl.classList.remove('is-entering');
    void contentEl.offsetWidth;
    contentEl.classList.add('is-entering');
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
    return () => {
      window.removeEventListener('offline', wentOffline);
      window.removeEventListener('online', wentOnline);
    };
  });

  const ownerNav = [
    { href: '/home', label: 'Home' },
    { href: '/schedule', label: 'Schedule' },
    { href: '/timesheet', label: 'Timesheet' },
    { href: '/badge-terminal', label: 'Badge' },
    { href: '/team', label: 'Team' },
    { href: '/restaurant', label: 'Restaurant' },
    { href: '/dashboard', label: 'Insights' }
  ];
  const managerNav = ownerNav.filter((item) => item.href !== '/restaurant');
  const employeeNav = [
    { href: '/my-service', label: 'My service' },
    { href: '/my-time', label: 'My time' }
  ];
  const navItems = $derived(
    workspace.active?.role === 'owner'
      ? ownerNav
      : workspace.active?.role === 'manager'
        ? managerNav
        : workspace.active?.role === 'employee'
          ? employeeNav
          : []
  );
  const workspaceOptions = $derived(orderedMemberships(workspace.memberships));
  const emailVerified = $derived(Boolean(auth.user?.email_confirmed_at));
  const pageAtmosphere = $derived.by(() => {
    const pathname = page.url.pathname;
    if (pathname === '/home') return 'home';
    if (pathname === '/schedule') return 'schedule';
    if (pathname === '/timesheet') return 'timesheet';
    if (pathname === '/badge-terminal') return 'badge';
    if (pathname === '/team') return 'team';
    if (pathname === '/restaurant') return 'restaurant';
    if (pathname === '/my-service') return 'my-service';
    if (pathname === '/my-time') return 'my-time';
    if (pathname === '/dashboard') return 'dashboard';
    return 'none';
  });
  const setupNotifications = $derived.by(() => {
    const bootstrap = workspace.bootstrap;
    if (!bootstrap || workspace.active?.role === 'employee') return [];
    const notifications: Array<{ label: string; href: string }> = [];
    if (!bootstrap.readiness.has_active_employees) {
      notifications.push({ label: t('Add your first active employee'), href: '/team' });
    }
    if (!bootstrap.readiness.has_active_areas) {
      notifications.push({ label: t('Configure restaurant areas'), href: '/restaurant' });
    }
    if (!bootstrap.readiness.has_active_job_functions) {
      notifications.push({ label: t('Configure job functions'), href: '/restaurant' });
    }
    if (workspace.error) notifications.unshift({ label: workspace.error, href: page.url.pathname });
    return notifications;
  });

  // Guard for every authenticated screen: no session → login.
  $effect(() => {
    if (auth.ready && !auth.session) {
      const target = `${page.url.pathname}${page.url.search}`;
      goto(`/login?next=${encodeURIComponent(target)}`, { replaceState: true });
    }
  });

  // Role boundaries are duplicated in navigation and routing: hidden links are
  // not a security control, so direct URL access is redirected as well.
  $effect(() => {
    if (!workspace.loaded || !workspace.active) return;
    const role = workspace.active.role;
    const employeeRoute = ['/my-service', '/my-time'].includes(page.url.pathname);
    if (role === 'employee' && !employeeRoute) {
      goto('/my-service', { replaceState: true });
    } else if (
      role === 'manager' &&
      (page.url.pathname === '/restaurant' || employeeRoute)
    ) {
      goto('/home', { replaceState: true });
    } else if (role === 'owner' && employeeRoute) {
      goto('/home', { replaceState: true });
    }
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
    if (!workspace.activeId) {
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

  async function signOut() {
    try {
      await auth.signOut();
      workspace.reset();
      toasts.clear();
      await goto('/login');
    } catch (error) {
      toasts.show(error instanceof Error ? error.message : String(error), 'danger');
    }
  }

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

  async function selectWorkspace(restaurantId: string) {
    const membership = workspace.memberships.find(
      (item) => item.restaurant_id === restaurantId
    );
    if (!membership || membership.restaurant_id === workspace.activeId) {
      accountOpen = false;
      return;
    }
    try {
      await workspace.select(restaurantId);
      accountOpen = false;
      await goto(roleHome(membership.role));
    } catch (error) {
      toasts.show(error instanceof Error ? error.message : String(error), 'danger');
    }
  }

  async function savePin() {
    if (!/^\d{4}$/.test(pin)) {
      toasts.show(t('Enter a four-digit badge PIN.'), 'warning');
      return;
    }
    if (pin !== pinConfirm) {
      toasts.show(t('PIN confirmation does not match.'), 'warning');
      return;
    }
    savingPin = true;
    try {
      await setOwnBadgePin(pin, workspace.activeId ?? undefined);
      pin = '';
      pinConfirm = '';
      pinDialogOpen = false;
      toasts.show(t('Badge PIN updated.'), 'success');
    } catch (error) {
      toasts.show(error instanceof Error ? error.message : String(error), 'danger');
    } finally {
      savingPin = false;
    }
  }

  function openAccount() {
    const employee = workspace.bootstrap?.current_employee;
    accountFirstName = employee?.first_name ?? '';
    accountLastName = employee?.last_name ?? '';
    accountPassword = '';
    accountPasswordConfirm = '';
    accountLanguage = normalizeLocale(auth.user?.user_metadata?.[ACCOUNT_LOCALE_METADATA_KEY]);
    accountOpen = false;
    accountDialogOpen = true;
  }

  async function saveAccount() {
    if (!accountFirstName.trim() || !accountLastName.trim()) {
      toasts.show(t('First and last name are required.'), 'warning');
      return;
    }
    if (accountPassword && accountPassword.length < 8) {
      toasts.show(t('Use at least eight characters for the app password.'), 'warning');
      return;
    }
    if (accountPassword !== accountPasswordConfirm) {
      toasts.show(t('Password confirmation does not match.'), 'warning');
      return;
    }
    savingAccount = true;
    try {
      await updateOwnProfile(accountFirstName.trim(), accountLastName.trim());
      const { error } = await supabase.auth.updateUser({
        ...(accountPassword ? { password: accountPassword } : {}),
        data: {
          ...auth.user?.user_metadata,
          first_name: accountFirstName.trim(),
          last_name: accountLastName.trim(),
          [ACCOUNT_LOCALE_METADATA_KEY]: accountLanguage
        }
      });
      if (error) throw error;
      i18n.setLocale(accountLanguage);
      accountDialogOpen = false;
      await workspace.reloadBootstrap();
      toasts.show(t('Account updated.'), 'success');
    } catch (error) {
      toasts.show(error instanceof Error ? error.message : String(error), 'danger');
    } finally {
      savingAccount = false;
    }
  }
</script>

{#if auth.session}
  <div class="app">
    <header class="topbar">
      <span class="topbar__brand">restogogo</span>

      {#if navItems.length}
        <nav class="topbar__nav rst-scroll-strip" aria-label={t('Main')}>
          {#each navItems as item (item.href)}
            <a
              class="topbar__link"
              class:is-active={page.url.pathname === item.href}
              href={item.href}>{t(item.label)}</a>
          {/each}
        </nav>
      {:else}
        <span class="topbar__spacer"></span>
      {/if}

      <div class="topbar__user">
        <NotificationBell
          restaurantId={workspace.activeId}
          role={workspace.active?.role ?? null}
          employeeId={workspace.active?.employee_id ?? null}
          timezone={workspace.bootstrap?.restaurant_settings.timezone || 'Europe/Brussels'}
          setupNotifications={setupNotifications}
        />

        <div class="menu-wrap">
          <button
            class="account-button"
            type="button"
            aria-label={t('Account menu')}
            aria-expanded={accountOpen}
            onclick={() => (accountOpen = !accountOpen)}
          >
            <span>{(auth.user?.email ?? 'U').charAt(0).toUpperCase()}</span>
            <i class="topbar__email">{auth.user?.email}</i>
          </button>
          {#if accountOpen}
            <section class="menu account-menu">
              <header>
                <strong>{auth.user?.email}</strong>
                <small>{workspace.active?.restaurant_name} · {workspace.active?.role ?? t('Account')}</small>
              </header>
              {#if workspaceOptions.length > 1}
                <div class="workspace-switcher" aria-label="Workspaces">
                  <span>{t('Workspace')}</span>
                  {#each workspaceOptions as membership (membership.restaurant_id)}
                    <button
                      type="button"
                      class:is-active={membership.restaurant_id === workspace.activeId}
                      aria-current={membership.restaurant_id === workspace.activeId ? 'true' : undefined}
                      onclick={() => selectWorkspace(membership.restaurant_id)}
                    >
                      <strong>{membership.restaurant_name}</strong>
                      <small>{membership.role}</small>
                    </button>
                  {/each}
                </div>
              {/if}
              <button type="button" onclick={openAccount}>{t('Account settings')}</button>
              <button type="button" onclick={() => { accountOpen = false; pinDialogOpen = true; }}>{t('Change badge PIN')}</button>
              <button class="danger" type="button" onclick={signOut}>{t('Sign out')}</button>
            </section>
          {/if}
        </div>
      </div>
    </header>

    {#if navItems.length && page.url.pathname !== '/badge-terminal'}
      {#snippet tabIcon(href: string)}
        {#if href === '/home'}
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 11 12 4l8 7"/><path d="M6 10v9h4v-5h4v5h4v-9"/></svg>
        {:else if href === '/schedule' || href === '/my-service'}
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="4" y="5" width="16" height="15" rx="1.6"/><path d="M4 9.5h16M9 3v4M15 3v4"/></svg>
        {:else if href === '/timesheet' || href === '/my-time'}
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="8"/><path d="M12 8v4.3l3 1.8"/></svg>
        {:else if href === '/team'}
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="9" cy="8" r="3.2"/><path d="M3.6 19a5.4 5.4 0 0 1 10.8 0"/><path d="M16.2 5.6a3.2 3.2 0 0 1 0 4.8M17.4 13.4A5.4 5.4 0 0 1 20.4 18.4"/></svg>
        {:else if href === '/restaurant'}
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 9h16l-1.2-4H5.2z"/><path d="M5 9v10h14V9"/><path d="M10 19v-5h4v5"/></svg>
        {:else if href === '/dashboard'}
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 20V4M4 20h16"/><rect x="8" y="11" width="3" height="6"/><rect x="14" y="7" width="3" height="10"/></svg>
        {:else}
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="4" y="4" width="16" height="13" rx="1.6"/><path d="M9 20h6M12 17v3"/></svg>
        {/if}
      {/snippet}

      <nav class="bottomnav" aria-label={t('Main')}>
        {#each navItems as item (item.href)}
          <a
            class="bottomnav__link"
            class:is-active={page.url.pathname === item.href}
            aria-current={page.url.pathname === item.href ? 'page' : undefined}
            href={item.href}
          >
            {@render tabIcon(item.href)}
            <span>{t(item.label)}</span>
          </a>
        {/each}
      </nav>
    {/if}

    <main class="app__content" data-atmosphere={pageAtmosphere} bind:this={contentEl}>
      {#if !online}
        <aside class="offline" role="status">
          {t('You are offline. Existing information remains visible; reconnect before saving changes.')}
        </aside>
      {/if}
      {#if !emailVerified}
        <section class="workspace-state verify-state" role="status">
          <p class="workspace-state__eyebrow">{t('Email verification')}</p>
          <h1>{t('Verify your owner email')}</h1>
          <p>
            {t('We sent the verification link to {email}. Confirm it before opening restaurant operations.', { email: auth.user?.email ?? '' })}
          </p>
          {#if verificationSent}
            <small>{t('Check your inbox, then reload this page after confirming.')}</small>
          {/if}
          <div class="workspace-state__actions">
            <button type="button" disabled={sendingVerification} onclick={resendVerification}>
              {sendingVerification ? t('Sending…') : t('Resend verification')}
            </button>
            <button class="workspace-state__secondary" type="button" onclick={signOut}>
              {t('Sign out')}
            </button>
          </div>
        </section>
      {:else if workspace.loading && !workspace.bootstrap}
        <section class="workspace-state" aria-live="polite">
          <span class="spinner" aria-hidden="true"></span>
          <h1>{t('Loading your workspace')}</h1>
          <p>{t('Fetching the latest restaurant operations data.')}</p>
        </section>
      {:else if workspace.error && !workspace.bootstrap}
        <section class="workspace-state" role="alert">
          <h1>{t('Workspace unavailable')}</h1>
          <p>{workspace.error}</p>
          <button type="button" onclick={() => workspace.load()}>{t('Try again')}</button>
        </section>
      {:else if workspace.loaded && !workspace.active}
        <section class="workspace-state">
          <h1>{t('No active workspace')}</h1>
          <p>{t('Your account is not linked to an active restaurant. Create one if this is a new owner account.')}</p>
          <a class="workspace-state__action" href="/onboarding">{t('Set up a restaurant')}</a>
        </section>
      {:else}
        {@render children()}
      {/if}
    </main>
    <ToastHost />
  </div>
{/if}

{#snippet pinFooter()}
  <ActionButton label={t('Cancel')} disabled={savingPin} onclick={() => (pinDialogOpen = false)} />
  <ActionButton label={savingPin ? t('Saving…') : t('Save PIN')} tone="primary" disabled={savingPin} onclick={savePin} />
{/snippet}

<Dialog
  open={pinDialogOpen}
  title={t('Change badge PIN')}
  description={t('This PIN authorizes badge-terminal actions. It never signs you into restogogo.')}
  size="small"
  onclose={() => !savingPin && (pinDialogOpen = false)}
  footer={pinFooter}
>
  <div class="pin-form">
    <label><span>{t('New four-digit PIN')}</span><input type="password" inputmode="numeric" maxlength="4" bind:value={pin} /></label>
    <label><span>{t('Confirm PIN')}</span><input type="password" inputmode="numeric" maxlength="4" bind:value={pinConfirm} /></label>
  </div>
</Dialog>

{#snippet accountFooter()}
  <ActionButton label={t('Cancel')} disabled={savingAccount} onclick={() => (accountDialogOpen = false)} />
  <ActionButton label={savingAccount ? t('Saving…') : t('Save account')} tone="primary" disabled={savingAccount} onclick={saveAccount} />
{/snippet}

<Dialog
  open={accountDialogOpen}
  title={t('Account settings')}
  description={t('Update your personal profile, language and optionally choose a new app password.')}
  size="small"
  onclose={() => !savingAccount && (accountDialogOpen = false)}
  footer={accountFooter}
>
  <div class="pin-form">
    <label><span>{t('Email')}</span><input value={auth.user?.email ?? ''} disabled /></label>
    <label><span>{t('First name')}</span><input autocomplete="given-name" bind:value={accountFirstName} /></label>
    <label><span>{t('Last name')}</span><input autocomplete="family-name" bind:value={accountLastName} /></label>
    <label>
      <span>{t('Language')}</span>
      <select bind:value={accountLanguage}>
        {#each languageOptions as option (option.value)}
          <option value={option.value}>{option.nativeLabel}</option>
        {/each}
      </select>
    </label>
    <label><span>{t('New app password (optional)')}</span><input type="password" minlength="8" autocomplete="new-password" bind:value={accountPassword} /></label>
    <label><span>{t('Confirm new password')}</span><input type="password" minlength="8" autocomplete="new-password" bind:value={accountPasswordConfirm} /></label>
  </div>
</Dialog>

<style>
  .app {
    min-height: 100vh;
    display: flex;
    flex-direction: column;
  }
  .topbar {
    position: sticky;
    top: 0;
    z-index: var(--rst-z-topbar);
    display: flex;
    align-items: center;
    gap: 24px;
    height: var(--rst-topbar-h);
    padding: 0 var(--rst-gutter);
    background: var(--rst-topbar-bg);
    border-bottom: 1px solid var(--rst-topbar-line);
    backdrop-filter: blur(8px);
  }
  .topbar__brand {
    color: var(--rst-topbar-text);
    font-weight: var(--rst-fw-display);
    font-size: 18px;
  }
  .topbar__nav {
    display: flex;
    gap: 4px;
    margin-right: auto;
  }
  .topbar__spacer {
    margin-right: auto;
  }
  .topbar__link {
    padding: 8px 14px;
    border: 1px solid transparent;
    border-radius: var(--rst-ui-radius-md);
    color: var(--rst-topbar-muted);
    text-decoration: none;
    font-weight: var(--rst-fw-bold);
    font-size: 14px;
    transition: color .18s ease, background-color .18s ease, border-color .18s ease, transform .18s var(--rst-ease-out);
  }
  .topbar__link:hover {
    color: var(--rst-topbar-text);
    background: var(--rst-topbar-control-hover);
    transform: translateY(-1px);
  }
  .topbar__link.is-active {
    color: var(--rst-topbar-text);
    border: 1px solid var(--rst-topbar-active-border);
    background: var(--rst-topbar-active-bg);
    animation: rst-pop-in .28s var(--rst-ease-spring) backwards;
  }
  .topbar__user {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .bottomnav {
    display: none;
    position: fixed;
    left: 0;
    right: 0;
    bottom: 0;
    z-index: var(--rst-z-topbar);
    align-items: stretch;
    gap: 2px;
    padding: 6px 4px calc(6px + env(safe-area-inset-bottom, 0px));
    background: var(--rst-topbar-bg);
    border-top: 1px solid var(--rst-topbar-line);
    backdrop-filter: blur(8px);
  }
  .bottomnav__link {
    flex: 1 1 0;
    min-width: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 3px;
    padding: 4px 2px;
    border-radius: var(--rst-ui-radius-md);
    color: var(--rst-topbar-muted);
    text-decoration: none;
    min-height: 50px;
    font-size: 11px;
    font-weight: var(--rst-fw-bold);
  }
  .bottomnav__link svg {
    width: 22px;
    height: 22px;
  }
  .bottomnav__link span {
    max-width: 100%;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .bottomnav__link.is-active {
    color: var(--rst-topbar-text);
    background: rgba(var(--rst-ui-action-rgb), 0.16);
    box-shadow: inset 0 2px 0 var(--rst-ui-action);
  }
  .workspace-switcher {
    display: grid;
    gap: 4px;
    padding: 10px;
    border-bottom: 1px solid var(--rst-ui-divider-soft);
  }
  .workspace-switcher > span {
    padding: 0 4px 4px;
    color: var(--rst-ui-muted);
    font-size: 10px;
    font-weight: var(--rst-fw-bold);
    letter-spacing: .06em;
    text-transform: uppercase;
  }
  .workspace-switcher button {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    padding: 9px 10px;
    border: 1px solid transparent;
    border-radius: var(--rst-ui-radius-sm);
    color: var(--rst-ui-text);
    background: transparent;
    text-align: left;
  }
  .workspace-switcher button.is-active {
    border-color: var(--rst-state-selected-border);
    background: var(--rst-state-selected-bg);
  }
  .workspace-switcher small {
    color: var(--rst-ui-muted);
    text-transform: capitalize;
  }
  .topbar__email {
    color: var(--rst-topbar-muted);
    font-size: 13px;
    font-style: normal;
  }
  .menu-wrap { position: relative; }
  .account-button {
    min-height: 38px;
    display: inline-flex;
    align-items: center;
    gap: 8px;
    padding: 5px 9px;
    border-radius: var(--rst-ui-radius-md);
    border: 1px solid var(--rst-topbar-control-line);
    background: var(--rst-topbar-control-bg);
    color: var(--rst-topbar-text);
    font: inherit;
  }
  .account-button { cursor: pointer; }
  .account-button > span {
    width: 26px;
    height: 26px;
    display: grid;
    place-items: center;
    border-radius: var(--rst-ui-radius-round);
    color: var(--rst-on-accent-text);
    background: var(--rst-ui-action);
    font-size: 11px;
    font-weight: var(--rst-fw-display);
  }
  .account-button:hover { background: var(--rst-topbar-control-hover); }
  .menu {
    position: absolute;
    z-index: var(--rst-z-menu);
    top: calc(100% + 8px);
    right: 0;
    width: min(340px, calc(100vw - 24px));
    overflow: hidden;
    border: 1px solid var(--rst-ui-line-strong);
    border-radius: var(--rst-ui-radius-lg);
    background: var(--rst-ui-bg-2);
    box-shadow: 0 16px 50px rgba(0,0,0,.38);
    transform-origin: top right;
    animation: rst-menu-in .16s var(--rst-ease-out) backwards;
  }
  @keyframes rst-menu-in {
    from { opacity: 0; transform: scale(.92) translateY(-4px); }
    to { opacity: 1; transform: scale(1) translateY(0); }
  }
  .menu header {
    display: grid;
    gap: 3px;
    padding: 12px 14px;
    border-bottom: 1px solid var(--rst-ui-divider-soft);
  }
  .menu small { color: var(--rst-ui-muted); text-transform: capitalize; }
  .menu > button {
    width: 100%;
    min-height: 44px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 10px 14px;
    border: 0;
    border-bottom: 1px solid var(--rst-ui-divider-soft);
    color: var(--rst-ui-text);
    background: transparent;
    font: inherit;
    font-size: 12px;
    text-align: left;
    text-decoration: none;
    cursor: pointer;
  }
  .menu > button:hover { background: var(--rst-ui-section-row-hover); }
  .menu > button.danger { color: var(--rst-state-danger-text); }
  .pin-form { display: grid; gap: 12px; }
  .pin-form label { display: grid; gap: 6px; }
  .pin-form span { color: var(--rst-ui-muted); font-size: 11px; font-weight: var(--rst-fw-bold); }
  .pin-form input,
  .pin-form select {
    min-height: 42px;
    padding: 9px 11px;
    border: 1px solid var(--rst-ui-line);
    border-radius: var(--rst-ui-radius-md);
    color: var(--rst-ui-text);
    background: var(--rst-ui-surface-field-strong);
    font: inherit;
  }
  .pin-form input[type='password'] { letter-spacing: .24em; }
  .app__content {
    flex: 1;
    padding: var(--rst-gutter);
    background-color: var(--rst-ui-bg);
    background-image: var(--rst-atmosphere-fade), var(--rst-atmosphere-tint), var(--rst-atmosphere-image);
    background-repeat: no-repeat;
    background-position: top center, top center, top center;
    background-size: 100% 760px, 100% 760px, min(100%, 1680px) auto;
  }
  .app__content:global(.is-entering) {
    animation: rst-content-in .32s var(--rst-ease-out) backwards;
  }
  @keyframes rst-content-in {
    from { opacity: 0; transform: translateY(6px); }
    to { opacity: 1; transform: translateY(0); }
  }
  .app__content[data-atmosphere='home'] { --rst-atmosphere-image: url('/module-backgrounds/home.webp'); }
  .app__content[data-atmosphere='schedule'] { --rst-atmosphere-image: url('/module-backgrounds/schedule.webp'); }
  .app__content[data-atmosphere='timesheet'] { --rst-atmosphere-image: url('/module-backgrounds/timesheet.webp'); }
  .app__content[data-atmosphere='badge'] { --rst-atmosphere-image: url('/module-backgrounds/badge.webp'); }
  .app__content[data-atmosphere='team'] { --rst-atmosphere-image: url('/module-backgrounds/team.webp'); }
  .app__content[data-atmosphere='restaurant'] { --rst-atmosphere-image: url('/module-backgrounds/restaurant.webp'); }
  .app__content[data-atmosphere='my-service'] { --rst-atmosphere-image: url('/module-backgrounds/my-service.webp'); }
  .app__content[data-atmosphere='my-time'] { --rst-atmosphere-image: url('/module-backgrounds/my-time.webp'); }
  .app__content[data-atmosphere='dashboard'] { --rst-atmosphere-image: url('/module-backgrounds/home.webp'); }

  .app__content[data-atmosphere='home'],
  .app__content[data-atmosphere='schedule'],
  .app__content[data-atmosphere='timesheet'],
  .app__content[data-atmosphere='team'],
  .app__content[data-atmosphere='restaurant'],
  .app__content[data-atmosphere='my-service'],
  .app__content[data-atmosphere='my-time'],
  .app__content[data-atmosphere='dashboard'] {
    padding: 0;
  }
  .offline {
    margin-bottom: 12px;
    padding: 10px 12px;
    border: 1px solid var(--rst-state-warning-border);
    border-radius: var(--rst-ui-radius-md);
    color: var(--rst-state-warning-text);
    background: var(--rst-state-warning-bg);
    font-size: 12px;
  }
  .workspace-state {
    min-height: 62vh;
    display: grid;
    place-content: center;
    justify-items: center;
    gap: 8px;
    text-align: center;
  }
  .workspace-state h1,
  .workspace-state p {
    margin: 0;
  }
  .workspace-state p {
    color: var(--rst-ui-muted);
  }
  .workspace-state small {
    color: var(--rst-state-success-text);
    font-size: 13px;
  }
  .workspace-state__eyebrow {
    color: var(--rst-ui-muted);
    font-size: 11px;
    font-weight: var(--rst-fw-bold);
    letter-spacing: .08em;
    text-transform: uppercase;
  }
  .workspace-state__actions {
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    gap: 8px;
    margin-top: 8px;
  }
  .workspace-state button {
    padding: 9px 14px;
    border: 0;
    border-radius: var(--rst-ui-radius-md);
    color: var(--rst-on-accent-text);
    background: var(--rst-ui-action);
    font: inherit;
    font-weight: var(--rst-fw-bold);
    cursor: pointer;
  }
  .workspace-state button:disabled {
    opacity: .6;
    cursor: default;
  }
  .workspace-state button.workspace-state__secondary {
    color: var(--rst-ui-text);
    background: var(--rst-ui-surface-panel);
    border: 1px solid var(--rst-ui-line);
  }
  .workspace-state__action {
    margin-top: 8px;
    padding: 9px 14px;
    border-radius: var(--rst-ui-radius-md);
    color: var(--rst-on-accent-text);
    background: var(--rst-ui-action);
    font-size: 13px;
    font-weight: var(--rst-fw-bold);
    text-decoration: none;
  }
  @media (max-width: 1180px) {
    .topbar__email {
      display: none;
    }
  }

  @media (max-width: 980px) {
    .topbar {
      gap: 12px;
      padding-inline: 20px;
    }

    .app__content {
      padding: 28px 20px;
    }
  }

  @media (max-width: 760px) {
    .topbar {
      height: auto;
      min-height: var(--rst-topbar-h);
      flex-wrap: wrap;
      padding-block: 10px;
    }

    .topbar__nav {
      display: none;
    }

    .topbar__user {
      margin-left: auto;
    }

    .bottomnav {
      display: flex;
    }

    .app__content,
    .app__content[data-atmosphere] {
      padding-bottom: 80px;
    }

    .app__content[data-atmosphere='badge'] {
      padding-bottom: 0;
    }
  }
</style>
