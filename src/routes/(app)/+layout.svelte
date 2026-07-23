<script lang="ts">
  import { page } from '$app/state';
  import { goto } from '$app/navigation';
  import { auth } from '$lib/auth/session.svelte';
  import ActionButton from '$lib/components/ActionButton.svelte';
  import Dialog from '$lib/components/Dialog.svelte';
  import NotificationBell from '$lib/components/NotificationBell.svelte';
  import ConfirmHost from '$lib/components/ConfirmHost.svelte';
  import ToastHost from '$lib/components/ToastHost.svelte';
  import { t } from '$lib/i18n/i18n.svelte';
  import { toasts } from '$lib/ui/toast.svelte';
  import { workspace } from '$lib/workspace/workspace.svelte';
  import { supabase } from '$lib/supabase/client';
  import { kiosk } from '$lib/kiosk/kiosk.svelte';
  import { verifyBadgePin } from '$lib/badge/badge-api';
  import TourOverlay from '$lib/tour/TourOverlay.svelte';
  import { tour } from '$lib/tour/tour.svelte';
  import { tourFor, hasTour } from '$lib/tour/tour-registry';
  import CommunicationCenter from '$lib/communications/CommunicationCenter.svelte';
  import AccountMenu from '$lib/app-shell/AccountMenu.svelte';
  import { useAppSession } from '$lib/app-shell/app-session.svelte';
  import { exitPreviewSession, signOutOfApp } from '$lib/app-shell/app-actions';

  let { children } = $props();
  const session = useAppSession();
  let contentEl = $state<HTMLElement | undefined>();
  let kioskExitOpen = $state(false);
  let kioskPin = $state('');
  let kioskError = $state('');
  let kioskVerifying = $state(false);
  let mobileMoreOpen = $state(false);
  let sendingVerification = $state(false);
  let verificationSent = $state(false);
  let notificationSettingsRequest = $state(0);

  $effect(() => {
    void page.url.pathname;
    mobileMoreOpen = false;
    if (!contentEl) return;
    contentEl.classList.remove('is-entering');
    void contentEl.offsetWidth;
    contentEl.classList.add('is-entering');
  });

  // The badge terminal is intentionally not a nav tab: it is launched as a
  // locked kiosk (see AccountMenu) so an employee on the shared device can't
  // wander into manager screens.
  type NavItem = { href: string; label: string; mobileLabel?: string };

  const ownerNav: NavItem[] = [
    { href: '/home', label: 'Home' },
    { href: '/schedule', label: 'Schedule' },
    { href: '/timesheet', label: 'Timesheet', mobileLabel: 'Hours' },
    { href: '/team', label: 'Team' },
    { href: '/restaurant', label: 'Restaurant' },
    { href: '/dashboard', label: 'Insights' }
  ];
  const managerNav = ownerNav.filter((item) => item.href !== '/restaurant');
  const employeeNav: NavItem[] = [
    { href: '/my-service', label: 'My service' },
    { href: '/my-time', label: 'My time' }
  ];
  const navItems = $derived(
    workspace.effectiveRole === 'owner'
      ? ownerNav
      : workspace.effectiveRole === 'manager'
        ? managerNav
        : workspace.effectiveRole === 'employee'
          ? employeeNav
          : []
  );
  const mobileNavItems = $derived(
    workspace.effectiveRole === 'owner' ? ownerNav.slice(0, 4) : navItems
  );
  const mobileMoreItems = $derived(
    workspace.effectiveRole === 'owner' ? ownerNav.slice(4) : []
  );
  const mobileMoreActive = $derived(
    mobileMoreItems.some((item) => item.href === page.url.pathname)
  );
  const pageTour = $derived(hasTour(page.url.pathname, workspace.effectiveRole));
  function startPageTour() {
    const script = tourFor(page.url.pathname, workspace.effectiveRole);
    if (script) tour.start(script);
  }

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
    if (!bootstrap || workspace.isPreview || workspace.effectiveRole === 'employee') return [];
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

  // Role boundaries are duplicated in navigation and routing: hidden links are
  // not a security control, so direct URL access is redirected as well.
  $effect(() => {
    if (!workspace.loaded || !workspace.active) return;
    const requestedRestaurant = page.url.searchParams.get('push_restaurant');
    if (
      session.switchingWorkspace ||
      (requestedRestaurant &&
        requestedRestaurant !== workspace.activeId &&
        workspace.memberships.some((item) => item.restaurant_id === requestedRestaurant))
    ) return;
    const role = workspace.effectiveRole;
    if (!role) return;
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

  // While the kiosk is locked, the terminal is the only reachable screen — any
  // stray navigation (typed URL, back button, the terminal's own close link)
  // bounces straight back. Leaving requires a manager PIN or sign-out.
  $effect(() => {
    if (kiosk.locked && page.url.pathname !== '/badge-terminal') {
      goto('/badge-terminal', { replaceState: true });
    }
  });

  // Unlock with the signed-in manager's own badge PIN — an employee at the
  // terminal will not know it. Sign-out is the always-available safety valve so
  // a manager can never be locked out (e.g. if no PIN is set).
  async function exitKiosk() {
    if (kioskVerifying) return;
    kioskError = '';
    if (!/^\d{4}$/.test(kioskPin)) {
      kioskError = t('Enter your four-digit badge PIN.');
      return;
    }
    if (!workspace.activeId || !workspace.active?.employee_id) {
      kioskError = t('Sign out to leave the kiosk.');
      return;
    }
    kioskVerifying = true;
    try {
      await verifyBadgePin(workspace.activeId, workspace.active.employee_id, kioskPin);
      kiosk.unlock();
      kioskExitOpen = false;
      kioskPin = '';
      await goto('/home');
    } catch {
      kioskError = t('That PIN did not match. Try again or sign out.');
    } finally {
      kioskVerifying = false;
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
</script>

{#if auth.session}
  <div class="app" class:is-kiosk={kiosk.locked}>
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
      {:else if href === 'more'}
        <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="5" cy="12" r="1.8"/><circle cx="12" cy="12" r="1.8"/><circle cx="19" cy="12" r="1.8"/></svg>
      {:else}
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="4" y="4" width="16" height="13" rx="1.6"/><path d="M9 20h6M12 17v3"/></svg>
      {/if}
    {/snippet}
    {#if !kiosk.locked}
    <header class="topbar">
      <span class="topbar__brand" aria-label="restogogo">
        <img src="/brand/restogogo-mark.png" alt="" width="26" height="26" />
        <b aria-hidden="true"><i>esto</i><i>gogo</i></b>
      </span>

      {#if navItems.length}
        <nav class="topbar__nav rst-scroll-strip" aria-label={t('Main')} data-tour="nav">
          {#each navItems as item (item.href)}
            <a
              class="topbar__link"
              class:is-active={page.url.pathname === item.href}
              href={item.href}>{@render tabIcon(item.href)}<span>{t(item.label)}</span></a>
          {/each}
        </nav>
      {:else}
        <span class="topbar__spacer"></span>
      {/if}

      <div class="topbar__user">
        {#if pageTour}
          <button
            class="topbar__help"
            type="button"
            data-tour="help"
            aria-label={t('Take a tour of this page')}
            title={t('Take a tour of this page')}
            onclick={startPageTour}
          ><span aria-hidden="true">💡</span></button>
        {/if}

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
            setupNotifications={setupNotifications}
            settingsRequest={notificationSettingsRequest}
          />
        {/if}

        <AccountMenu
          isPlatformAdmin={session.isPlatformAdmin}
          onnotificationsettings={() => (notificationSettingsRequest += 1)}
          onstarttour={pageTour ? startPageTour : undefined}
        />
      </div>
    </header>
    {/if}

    {#if navItems.length && !kiosk.locked && page.url.pathname !== '/badge-terminal'}
      {#if mobileMoreOpen && mobileMoreItems.length}
        <button class="mobile-more-backdrop" type="button" aria-label={t('Close')} onclick={() => (mobileMoreOpen = false)}></button>
        <section class="mobile-more-menu" aria-label={t('More')}>
          <span>{t('More')}</span>
          {#each mobileMoreItems as item (item.href)}
            <a class:is-active={page.url.pathname === item.href} href={item.href}>
              {@render tabIcon(item.href)}
              <strong>{t(item.label)}</strong>
            </a>
          {/each}
        </section>
      {/if}
      <nav class="bottomnav" aria-label={t('Main')}>
        {#each mobileNavItems as item (item.href)}
          <a
            class="bottomnav__link"
            class:is-active={page.url.pathname === item.href}
            aria-current={page.url.pathname === item.href ? 'page' : undefined}
            href={item.href}
          >
            {@render tabIcon(item.href)}
            <span>{t(item.mobileLabel ?? item.label)}</span>
          </a>
        {/each}
        {#if mobileMoreItems.length}
          <button
            class="bottomnav__link"
            class:is-active={mobileMoreActive || mobileMoreOpen}
            type="button"
            aria-expanded={mobileMoreOpen}
            onclick={() => (mobileMoreOpen = !mobileMoreOpen)}
          >
            {@render tabIcon('more')}
            <span>{t('More')}</span>
          </button>
        {/if}
      </nav>
    {/if}

    {#if workspace.preview && !kiosk.locked}
      <aside class="preview-banner" role="status">
        <div>
          <strong>{t('Previewing {name}', { name: workspace.preview.displayName })}</strong>
          <span>{workspace.preview.restaurantName} · {t(workspace.preview.role)} · {t('Read only')}</span>
        </div>
        <button type="button" onclick={exitPreviewSession}>{t('Exit preview')}</button>
      </aside>
    {/if}

    <main class="app__content" class:is-preview={workspace.isPreview} data-atmosphere={pageAtmosphere} bind:this={contentEl}>
      {#if !session.online}
        <aside class="offline" role="status">
          {t('You are offline. Existing information remains visible; reconnect before saving changes.')}
        </aside>
      {/if}
      {#if !session.emailVerified}
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
            <button class="workspace-state__secondary" type="button" onclick={signOutOfApp}>
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
    {#if kiosk.locked}
      <button
        type="button"
        class="kiosk-exit"
        onclick={() => { kioskPin = ''; kioskError = ''; kioskExitOpen = true; }}
      >
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="4" y="10" width="16" height="10" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/></svg>
        {t('Exit kiosk')}
      </button>
    {/if}
    <ConfirmHost />
    <ToastHost />
  </div>
{/if}

{#if !kiosk.locked}
  <TourOverlay />
{/if}

{#snippet kioskExitFooter()}
  <ActionButton label={t('Sign out')} disabled={kioskVerifying} onclick={signOutOfApp} />
  <ActionButton label={kioskVerifying ? t('Checking…') : t('Unlock')} tone="primary" disabled={kioskVerifying} onclick={exitKiosk} />
{/snippet}

<Dialog
  open={kioskExitOpen}
  title={t('Exit kiosk')}
  description={t('Enter a manager badge PIN to return to the app. Employees stay on the terminal.')}
  size="small"
  onclose={() => !kioskVerifying && (kioskExitOpen = false)}
  footer={kioskExitFooter}
>
  <div class="pin-form">
    <label>
      <span>{t('Manager badge PIN')}</span>
      <input
        type="password"
        inputmode="numeric"
        maxlength="4"
        bind:value={kioskPin}
        onkeydown={(event) => event.key === 'Enter' && exitKiosk()}
      />
    </label>
    {#if kioskError}<p class="kiosk-exit__error">{kioskError}</p>{/if}
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
    display: inline-flex;
    align-items: center;
    gap: 0;
    color: var(--rst-topbar-text);
    font-weight: var(--rst-fw-display);
    font-size: 18px;
  }
  .topbar__brand img {
    width: 26px;
    height: 26px;
    display: block;
  }
  .topbar__brand b { display: inline-flex; align-items: baseline; letter-spacing: 0; }
  .topbar__brand i { color: var(--rst-ui-action); font-style: normal; }
  .topbar__brand i + i { color: var(--rst-topbar-text); }
  /* The wordmark is the first thing to go when space is tight; the mark alone
     still identifies the product. */
  @media (max-width: 760px) {
    .topbar__brand b {
      display: none;
    }
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
    display: inline-flex;
    align-items: center;
    gap: 7px;
    padding: 8px 13px;
    border: 1px solid transparent;
    border-radius: var(--rst-ui-radius-md);
    color: var(--rst-topbar-muted);
    text-decoration: none;
    font-weight: var(--rst-fw-bold);
    font-size: 14px;
    white-space: nowrap;
    transition: color .18s ease, background-color .18s ease, border-color .18s ease, transform .18s var(--rst-ease-out);
  }
  .topbar__link :global(svg) {
    width: 17px;
    height: 17px;
    flex: 0 0 auto;
    opacity: 0.85;
  }
  .topbar__link.is-active :global(svg) {
    opacity: 1;
    color: var(--rst-ui-action);
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
  .preview-banner {
    position: sticky;
    top: var(--rst-topbar-h);
    z-index: calc(var(--rst-z-topbar) - 1);
    min-height: 48px;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 24px;
    padding: 7px var(--rst-gutter);
    color: #2f1b0e;
    background: #ffd7ad;
    border-bottom: 1px solid #efb476;
  }
  .preview-banner > div { min-width: 0; display: grid; gap: 1px; }
  .preview-banner strong { font-size: 12px; }
  .preview-banner span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 10px; }
  .preview-banner button { min-height: 30px; padding: 5px 10px; border: 1px solid #b86b31; border-radius: 5px; color: #542b10; background: rgba(255,255,255,.36); font: inherit; font-size: 11px; font-weight: 800; cursor: pointer; }
  .app__content.is-preview :global(button),
  .app__content.is-preview :global(input),
  .app__content.is-preview :global(select),
  .app__content.is-preview :global(textarea) { pointer-events: none; }
  /* Bare glyph, like the notification bell: no filled disc, just the icon and
     a light hover surface shared with the rest of the topbar controls. */
  .topbar__help {
    position: relative;
    width: 38px;
    min-height: 38px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border: 0;
    border-radius: 50%;
    color: var(--rst-topbar-muted);
    background: transparent;
    font-size: 17px;
    line-height: 1;
    cursor: pointer;
    transition:
      background 0.18s ease,
      transform 0.18s ease;
  }
  .topbar__help:hover {
    background: var(--rst-topbar-control-hover);
    transform: translateY(-1px);
  }
  .topbar__help span {
    display: inline-block;
    font-size: 19px;
    transition: transform 0.22s var(--rst-ease-spring);
  }
  .topbar__help:hover span {
    transform: scale(1.12) rotate(-8deg);
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
    border: 0;
    background: transparent;
    font-family: inherit;
    cursor: pointer;
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
  .mobile-more-backdrop,
  .mobile-more-menu {
    display: none;
  }
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
  }
  .pin-form input[type='password'] { letter-spacing: 0; }
  .kiosk-exit {
    position: fixed;
    z-index: var(--rst-z-topbar);
    left: 16px;
    bottom: 16px;
    display: inline-flex;
    align-items: center;
    gap: 7px;
    padding: 9px 14px;
    border: 1px solid var(--rst-ui-line);
    border-radius: 999px;
    color: var(--rst-ui-text);
    background: var(--rst-ui-surface-panel);
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.18);
    font: inherit;
    font-size: 12px;
    font-weight: var(--rst-fw-bold);
    cursor: pointer;
    opacity: 0.55;
    transition: opacity .16s ease, transform .16s ease;
  }
  .kiosk-exit:hover { opacity: 1; transform: translateY(-1px); }
  .kiosk-exit__error { margin: 0; color: var(--rst-state-danger-text); font-size: 12px; }
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
    letter-spacing: 0;
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

    .mobile-more-backdrop {
      display: block;
      position: fixed;
      inset: 0;
      z-index: calc(var(--rst-z-panel) - 1);
      border: 0;
      background: rgba(15, 18, 23, .38);
      backdrop-filter: blur(2px);
    }

    .mobile-more-menu {
      display: grid;
      position: fixed;
      right: 12px;
      bottom: calc(76px + env(safe-area-inset-bottom, 0px));
      left: 12px;
      z-index: var(--rst-z-panel);
      gap: 6px;
      padding: 12px;
      border: 1px solid var(--rst-ui-line);
      border-radius: var(--rst-ui-radius-lg);
      background: var(--rst-ui-surface-panel);
      box-shadow: 0 18px 50px rgba(0, 0, 0, .28);
    }

    .mobile-more-menu > span {
      padding: 2px 8px 6px;
      color: var(--rst-ui-muted);
      font-size: 11px;
      font-weight: var(--rst-fw-bold);
      text-transform: uppercase;
    }

    .mobile-more-menu a {
      display: grid;
      grid-template-columns: 24px minmax(0, 1fr);
      align-items: center;
      gap: 10px;
      min-height: 48px;
      padding: 8px 10px;
      border-radius: var(--rst-ui-radius-md);
      color: var(--rst-ui-text);
      text-decoration: none;
    }

    .mobile-more-menu a.is-active {
      color: var(--rst-ui-action);
      background: var(--rst-state-selected-bg);
    }

    .mobile-more-menu svg {
      width: 21px;
      height: 21px;
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
