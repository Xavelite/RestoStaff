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
  let savingAccount = $state(false);
  let sendingVerification = $state(false);
  let verificationSent = $state(false);
  let online = $state(true);
  let contentEl = $state<HTMLElement | undefined>();

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
    { href: '/planning', label: 'Schedule' },
    { href: '/actuals', label: 'Timesheet' },
    { href: '/badge-terminal', label: 'Time clock' },
    { href: '/team', label: 'Team' },
    { href: '/restaurant', label: 'Restaurant' },
    { href: '/coverage', label: 'Coverage' }
  ];
  const managerNav = ownerNav.filter((item) => item.href !== '/restaurant' && item.href !== '/coverage');
  const employeeNav = [
    { href: '/shifts', label: 'My service' },
    { href: '/calendar', label: 'My time' }
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
    if (pathname === '/planning') return 'planning';
    if (pathname === '/actuals') return 'actuals';
    if (pathname === '/badge-terminal') return 'badge';
    if (pathname === '/team') return 'team';
    if (pathname === '/restaurant') return 'restaurant';
    if (pathname === '/coverage') return 'restaurant';
    if (pathname === '/shifts') return 'shifts';
    if (pathname === '/calendar') return 'calendar';
    return 'none';
  });
  const setupNotifications = $derived.by(() => {
    const bootstrap = workspace.bootstrap;
    if (!bootstrap || workspace.active?.role === 'employee') return [];
    const notifications: Array<{ label: string; href: string }> = [];
    if (!bootstrap.readiness.has_active_employees) {
      notifications.push({ label: 'Add your first active employee', href: '/team' });
    }
    if (!bootstrap.readiness.has_active_areas) {
      notifications.push({ label: 'Configure restaurant areas', href: '/restaurant' });
    }
    if (!bootstrap.readiness.has_active_job_functions) {
      notifications.push({ label: 'Configure job functions', href: '/restaurant' });
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
    const employeeRoute = ['/shifts', '/calendar'].includes(page.url.pathname);
    if (role === 'employee' && !employeeRoute) {
      goto('/shifts', { replaceState: true });
    } else if (
      role === 'manager' &&
      (page.url.pathname === '/restaurant' || page.url.pathname === '/coverage' || employeeRoute)
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
          ? 'Planning changed in another session.'
          : event === 'actuals-updated'
            ? 'Actuals received a live update.'
            : 'Workspace data changed.';
      toasts.show(`${label} Refreshing…`, 'info', 3000);
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
      toasts.show('Verification email sent.', 'success');
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
      toasts.show('Enter a four-digit badge PIN.', 'warning');
      return;
    }
    if (pin !== pinConfirm) {
      toasts.show('PIN confirmation does not match.', 'warning');
      return;
    }
    savingPin = true;
    try {
      await setOwnBadgePin(pin, workspace.activeId ?? undefined);
      pin = '';
      pinConfirm = '';
      pinDialogOpen = false;
      toasts.show('Badge PIN updated.', 'success');
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
    accountOpen = false;
    accountDialogOpen = true;
  }

  async function saveAccount() {
    if (!accountFirstName.trim() || !accountLastName.trim()) {
      toasts.show('First and last name are required.', 'warning');
      return;
    }
    if (accountPassword && accountPassword.length < 8) {
      toasts.show('Use at least eight characters for the app password.', 'warning');
      return;
    }
    if (accountPassword !== accountPasswordConfirm) {
      toasts.show('Password confirmation does not match.', 'warning');
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
          last_name: accountLastName.trim()
        }
      });
      if (error) throw error;
      accountDialogOpen = false;
      await workspace.reloadBootstrap();
      toasts.show('Account updated.', 'success');
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
        <nav class="topbar__nav rst-scroll-strip" aria-label="Main">
          {#each navItems as item (item.href)}
            <a
              class="topbar__link"
              class:is-active={page.url.pathname === item.href}
              href={item.href}>{item.label}</a>
          {/each}
        </nav>
      {:else}
        <span class="topbar__spacer"></span>
      {/if}

      <div class="topbar__user">
        <span
          class="theme-indicator"
          role="status"
          aria-label="Visual style"
          title="Visual style"
        >
          <span aria-hidden="true"></span>
          <strong>Aa</strong>
        </span>

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
                <small>{workspace.active?.restaurant_name} · {workspace.active?.role ?? 'Account'}</small>
              </header>
              {#if workspaceOptions.length > 1}
                <div class="workspace-switcher" aria-label="Workspaces">
                  <span>Workspace</span>
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
              <button type="button" onclick={openAccount}>Account settings</button>
              <button type="button" onclick={() => { accountOpen = false; pinDialogOpen = true; }}>Change badge PIN</button>
              <button class="danger" type="button" onclick={signOut}>Sign out</button>
            </section>
          {/if}
        </div>
      </div>
    </header>

    <main class="app__content" data-atmosphere={pageAtmosphere} bind:this={contentEl}>
      {#if !online}
        <aside class="offline" role="status">
          You are offline. Existing information remains visible; reconnect before saving changes.
        </aside>
      {/if}
      {#if !emailVerified}
        <section class="workspace-state verify-state" role="status">
          <p class="workspace-state__eyebrow">Email verification</p>
          <h1>Verify your owner email</h1>
          <p>
            We sent the verification link to {auth.user?.email}. Confirm it before opening
            restaurant operations.
          </p>
          {#if verificationSent}
            <small>Check your inbox, then reload this page after confirming.</small>
          {/if}
          <div class="workspace-state__actions">
            <button type="button" disabled={sendingVerification} onclick={resendVerification}>
              {sendingVerification ? 'Sending…' : 'Resend verification'}
            </button>
            <button class="workspace-state__secondary" type="button" onclick={signOut}>
              Sign out
            </button>
          </div>
        </section>
      {:else if workspace.loading && !workspace.bootstrap}
        <section class="workspace-state" aria-live="polite">
          <span class="spinner" aria-hidden="true"></span>
          <h1>Loading your workspace</h1>
          <p>Fetching the latest restaurant operations data.</p>
        </section>
      {:else if workspace.error && !workspace.bootstrap}
        <section class="workspace-state" role="alert">
          <h1>Workspace unavailable</h1>
          <p>{workspace.error}</p>
          <button type="button" onclick={() => workspace.load()}>Try again</button>
        </section>
      {:else if workspace.loaded && !workspace.active}
        <section class="workspace-state">
          <h1>No active workspace</h1>
          <p>Your account is not linked to an active restaurant. Create one if this is a new owner account.</p>
          <a class="workspace-state__action" href="/onboarding">Set up a restaurant</a>
        </section>
      {:else}
        {@render children()}
      {/if}
    </main>
    <ToastHost />
  </div>
{/if}

{#snippet pinFooter()}
  <ActionButton label="Cancel" disabled={savingPin} onclick={() => (pinDialogOpen = false)} />
  <ActionButton label={savingPin ? 'Saving…' : 'Save PIN'} tone="primary" disabled={savingPin} onclick={savePin} />
{/snippet}

<Dialog
  open={pinDialogOpen}
  title="Change badge PIN"
  description="This PIN authorizes badge-terminal actions. It never signs you into restogogo."
  size="small"
  onclose={() => !savingPin && (pinDialogOpen = false)}
  footer={pinFooter}
>
  <div class="pin-form">
    <label><span>New four-digit PIN</span><input type="password" inputmode="numeric" maxlength="4" bind:value={pin} /></label>
    <label><span>Confirm PIN</span><input type="password" inputmode="numeric" maxlength="4" bind:value={pinConfirm} /></label>
  </div>
</Dialog>

{#snippet accountFooter()}
  <ActionButton label="Cancel" disabled={savingAccount} onclick={() => (accountDialogOpen = false)} />
  <ActionButton label={savingAccount ? 'Saving…' : 'Save account'} tone="primary" disabled={savingAccount} onclick={saveAccount} />
{/snippet}

<Dialog
  open={accountDialogOpen}
  title="Account settings"
  description="Update your personal profile and optionally choose a new app password."
  size="small"
  onclose={() => !savingAccount && (accountDialogOpen = false)}
  footer={accountFooter}
>
  <div class="pin-form">
    <label><span>Email</span><input value={auth.user?.email ?? ''} disabled /></label>
    <label><span>First name</span><input autocomplete="given-name" bind:value={accountFirstName} /></label>
    <label><span>Last name</span><input autocomplete="family-name" bind:value={accountLastName} /></label>
    <label><span>New app password (optional)</span><input type="password" minlength="8" autocomplete="new-password" bind:value={accountPassword} /></label>
    <label><span>Confirm new password</span><input type="password" minlength="8" autocomplete="new-password" bind:value={accountPasswordConfirm} /></label>
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
  .account-button,
  .theme-indicator {
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
  .theme-indicator {
    gap: 9px;
    padding-inline: 13px;
    font-size: 13px;
    font-weight: var(--rst-fw-bold);
    white-space: nowrap;
    cursor: default;
  }
  .theme-indicator > span {
    width: 10px;
    height: 10px;
    border-radius: var(--rst-ui-radius-round);
    background: var(--rst-ui-action);
    box-shadow: 0 0 0 4px rgba(var(--rst-ui-action-rgb), .14);
  }
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
  .pin-form input {
    min-height: 42px;
    padding: 9px 11px;
    border: 1px solid var(--rst-ui-line);
    border-radius: var(--rst-ui-radius-md);
    color: var(--rst-ui-text);
    background: var(--rst-ui-surface-field-strong);
    font: inherit;
    letter-spacing: .24em;
  }
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
  .app__content[data-atmosphere='planning'] { --rst-atmosphere-image: url('/module-backgrounds/planning.webp'); }
  .app__content[data-atmosphere='actuals'] { --rst-atmosphere-image: url('/module-backgrounds/actuals.webp'); }
  .app__content[data-atmosphere='badge'] { --rst-atmosphere-image: url('/module-backgrounds/badge.webp'); }
  .app__content[data-atmosphere='team'] { --rst-atmosphere-image: url('/module-backgrounds/team.webp'); }
  .app__content[data-atmosphere='restaurant'] { --rst-atmosphere-image: url('/module-backgrounds/restaurant.webp'); }
  .app__content[data-atmosphere='shifts'] { --rst-atmosphere-image: url('/module-backgrounds/shifts.webp'); }
  .app__content[data-atmosphere='calendar'] { --rst-atmosphere-image: url('/module-backgrounds/calendar.webp'); }

  .app__content[data-atmosphere='home'],
  .app__content[data-atmosphere='planning'],
  .app__content[data-atmosphere='actuals'],
  .app__content[data-atmosphere='team'],
  .app__content[data-atmosphere='restaurant'],
  .app__content[data-atmosphere='shifts'],
  .app__content[data-atmosphere='calendar'] {
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
      order: 3;
      width: 100%;
      overflow-x: auto;
    }

    .topbar__user {
      margin-left: auto;
    }
  }
</style>
