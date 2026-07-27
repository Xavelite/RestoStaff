<script lang="ts">
  import { goto } from '$app/navigation';
  import { page } from '$app/state';
  import { setOwnBadgePin, updateOwnProfile } from '$lib/api/mutations';
  import { auth } from '$lib/auth/session.svelte';
  import ActionButton from '$lib/components/ActionButton.svelte';
  import Dialog from '$lib/components/Dialog.svelte';
  import FeedbackDialog from '$lib/feedback/FeedbackDialog.svelte';
  import PreviewDialog from '$lib/preview/PreviewDialog.svelte';
  import {
    ACCOUNT_LOCALE_METADATA_KEY,
    i18n,
    languageOptions,
    normalizeLocale,
    t,
    type AppLocale
  } from '$lib/i18n/i18n.svelte';
  import { kiosk } from '$lib/kiosk/kiosk.svelte';
  import { unsavedChanges } from '$lib/navigation/unsaved-changes.svelte';
  import { appInstall } from '$lib/pwa/app-install.svelte';
  import { enablePhonePush, phonePushStatus } from '$lib/push/push-client';
  import { sound } from '$lib/sound/sound.svelte';
  import { supabase } from '$lib/supabase/client';
  import { confirmAction } from '$lib/ui/confirm.svelte';
  import { workspaceTheme, type WorkspaceTheme } from '$lib/ui/theme.svelte';
  import { toasts } from '$lib/ui/toast.svelte';
  import { workspace } from '$lib/workspace/workspace.svelte';
  import { orderedMemberships, roleHome } from '$lib/workspace/workspace-selection';
  import { exitPreviewSession, signOutOfApp } from './app-actions';

  let {
    isPlatformAdmin = false,
    onnotificationsettings,
    onstarttour
  }: {
    isPlatformAdmin?: boolean;
    onnotificationsettings: () => void;
    /** Present only when the current page has a guided tour. */
    onstarttour?: () => void;
  } = $props();

  let open = $state(false);
  let pinDialogOpen = $state(false);
  let accountDialogOpen = $state(false);
  let installDialogOpen = $state(false);
  let previewPickerOpen = $state(false);
  let feedbackOpen = $state(false);
  let pin = $state('');
  let pinConfirm = $state('');
  let savingPin = $state(false);
  let accountFirstName = $state('');
  let accountLastName = $state('');
  let accountPassword = $state('');
  let accountPasswordConfirm = $state('');
  let accountLanguage = $state<AppLocale>('en');
  let savingAccount = $state(false);

  const workspaceOptions = $derived(orderedMemberships(workspace.memberships));
  const canPreviewEmployees = $derived(
    !workspace.isPreview &&
      workspace.memberships.some(
        (membership) =>
          membership.restaurant_id === workspace.activeId &&
          membership.status === 'active' &&
          (membership.role === 'owner' || membership.role === 'manager')
      )
  );
  const canCreateRestaurant = $derived(
    !workspace.isPreview &&
      workspace.memberships.some(
        (membership) => membership.status === 'active' && membership.role === 'owner'
      )
  );

  async function selectWorkspace(restaurantId: string) {
    const membership = workspace.memberships.find((item) => item.restaurant_id === restaurantId);
    if (!membership || membership.restaurant_id === workspace.activeId) {
      open = false;
      return;
    }
    open = false;
    try {
      await unsavedChanges.runOrRequest(async () => {
        await workspace.select(restaurantId);
        await goto(roleHome(membership.role));
      });
    } catch (error) {
      toasts.show(error instanceof Error ? error.message : String(error), 'danger');
    }
  }

  function createRestaurant() {
    open = false;
    void unsavedChanges
      .runOrRequest(() => goto('/onboarding?new=1'))
      .catch((error) =>
        toasts.show(error instanceof Error ? error.message : String(error), 'danger')
      );
  }

  function launchKiosk() {
    open = false;
    void unsavedChanges.runOrRequest(async () => {
      kiosk.lock();
      await goto('/badge-terminal/terminal');
    }).catch((error) => toasts.show(error instanceof Error ? error.message : String(error), 'danger'));
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
    accountFirstName =
      employee?.first_name ?? String(auth.user?.user_metadata?.first_name ?? '');
    accountLastName =
      employee?.last_name ?? String(auth.user?.user_metadata?.last_name ?? '');
    accountPassword = '';
    accountPasswordConfirm = '';
    accountLanguage = normalizeLocale(auth.user?.user_metadata?.[ACCOUNT_LOCALE_METADATA_KEY]);
    open = false;
    accountDialogOpen = true;
  }

  function openNotificationSettings() {
    open = false;
    accountDialogOpen = false;
    onnotificationsettings();
  }

  async function installApp() {
    open = false;
    if (!appInstall.promptAvailable) {
      installDialogOpen = true;
      return;
    }
    const confirmed = await confirmAction({
      title: 'Install Restogogo?',
      body: 'Restogogo will be added to this device and open like an app.',
      confirmLabel: 'Install app',
      tone: 'primary'
    });
    if (!confirmed) return;
    const outcome = await appInstall.prompt();
    if (outcome === 'accepted') {
      toasts.show(
        t('Restogogo is installed. Open it from your home screen to finish setup.'),
        'success'
      );
    }
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

  // Someone can arrive already installed — from the browser menu, or from a
  // previous visit — and never be asked about alerts. Offer once, in our own
  // dialog: browsers penalise an unprompted permission request, and a plain
  // browser tab cannot receive push reliably anyway.
  const NOTIFY_INVITE_KEY = 'rst-notify-invited';
  let notifyInviteOpen = $state(false);
  let notifyInviteBusy = $state(false);
  let notifyInviteChecked = false;

  $effect(() => {
    if (!workspace.activeId || !appInstall.standalone || kiosk.locked) return;
    if (notifyInviteChecked) return;
    notifyInviteChecked = true;
    try {
      if (localStorage.getItem(NOTIFY_INVITE_KEY)) return;
    } catch {
      return;
    }
    void phonePushStatus()
      .then((status) => {
        if (
          status.configured &&
          status.supported &&
          !status.subscribed &&
          status.permission === 'default'
        ) {
          notifyInviteOpen = true;
        }
      })
      .catch(() => undefined);
  });

  function closeNotifyInvite() {
    try {
      localStorage.setItem(NOTIFY_INVITE_KEY, 'asked');
    } catch {
      // Asking again next time is better than failing here.
    }
    notifyInviteOpen = false;
  }

  async function acceptNotifyInvite() {
    if (!workspace.activeId || notifyInviteBusy) return;
    notifyInviteBusy = true;
    try {
      await enablePhonePush({ restaurantId: workspace.activeId, locale: i18n.locale });
      toasts.show(t('Phone alerts are on for this device.'), 'success');
      closeNotifyInvite();
    } catch (error) {
      toasts.show(error instanceof Error ? error.message : String(error), 'danger');
      closeNotifyInvite();
    } finally {
      notifyInviteBusy = false;
    }
  }
</script>

<div class="menu-wrap" data-tour="account">
  <button
    class="account-button"
    type="button"
    aria-label={t('Account menu')}
    aria-expanded={open}
    onclick={() => (open = !open)}
  >
    <span>{(auth.user?.email ?? 'U').charAt(0).toUpperCase()}</span>
    <i class="account-button__email">{auth.user?.email}</i>
  </button>
  {#if open}
    <section class="menu account-menu">
      <header>
        <strong>{auth.user?.email}</strong>
        <small>{workspace.active?.restaurant_name} · {workspace.effectiveRole ?? t('Account')}</small>
      </header>
      <div class="appearance-switcher" aria-label={t('Appearance')}>
        <span>{t('Appearance')}</span>
        <div>
          {#each [
            { value: 'cobalt' as WorkspaceTheme, label: t('Cobalt'), color: '#315efb' },
            { value: 'tangerine' as WorkspaceTheme, label: t('Tangerine'), color: '#ff5a1f' }
          ] as theme (theme.value)}
            <button
              type="button"
              class:is-active={workspaceTheme.value === theme.value}
              aria-pressed={workspaceTheme.value === theme.value}
              onclick={() => workspaceTheme.set(theme.value)}
            >
              <i style={`--theme-swatch:${theme.color}`} aria-hidden="true"></i>
              <span>{theme.label}</span>
              {#if workspaceTheme.value === theme.value}
                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m5 12 4 4 10-10" /></svg>
              {/if}
            </button>
          {/each}
        </div>
      </div>
      {#if workspace.isPreview}
        <button type="button" onclick={() => { open = false; void exitPreviewSession(); }}>{t('Exit preview')}</button>
      {:else}
        {#if workspaceOptions.length > 1}
          <div class="workspace-switcher" aria-label={t('Workspace')}>
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
        {#if canCreateRestaurant}
          <button type="button" onclick={createRestaurant}>{t('Add restaurant')}</button>
        {/if}
        <button type="button" onclick={openAccount}>{t('Account settings')}</button>
        {#if !appInstall.installed}
          <button type="button" onclick={installApp}>{t('Install app')}</button>
        {/if}
        <button type="button" onclick={() => { open = false; pinDialogOpen = true; }}>{t('Change badge PIN')}</button>
        {#if canPreviewEmployees}
          <button type="button" onclick={() => { open = false; previewPickerOpen = true; }}>{t('Preview as employee')}</button>
        {/if}
        {#if onstarttour}
          <button type="button" onclick={() => { open = false; onstarttour(); }}>{t('Show me around')}</button>
        {/if}
        <button type="button" onclick={() => sound.toggle()}>
          {sound.enabled ? t('Sound on') : t('Sound off')}
        </button>
        {#if workspace.effectiveRole !== 'employee'}
          <button type="button" onclick={launchKiosk}>{t('Open badge terminal')}</button>
        {/if}
      {/if}
      {#if isPlatformAdmin}
        <a class="account-menu__admin" href="/admin" onclick={() => (open = false)}>{t('Platform admin')}</a>
      {/if}
      <button type="button" onclick={() => { open = false; feedbackOpen = true; }}>{t('Send pilot feedback')}</button>
      <button class="danger" type="button" onclick={signOutOfApp}>{t('Sign out')}</button>
    </section>
  {/if}
</div>

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
    <section class="account-device" aria-label={t('App and notifications')}>
      <img src="/brand/restogogo-mark.png" alt="" width="34" height="34" />
      <div>
        <strong>{t(appInstall.installed ? 'Restogogo is installed' : 'Install Restogogo')}</strong>
        <small>{t(appInstall.installed
          ? 'This device opens Restogogo like an app.'
          : 'Add Restogogo to this device for faster access and phone alerts.')}</small>
      </div>
      {#if !appInstall.installed}
        <ActionButton label="Install app" tone="primary" onclick={installApp} />
      {/if}
      <ActionButton label="Notification settings" onclick={openNotificationSettings} />
    </section>
    <label class="account-toggle">
      <span><strong>{t('App sounds')}</strong><small>{t('Play short cues for messages and completed actions.')}</small></span>
      <input type="checkbox" checked={sound.enabled} onchange={(event) => sound.setEnabled(event.currentTarget.checked)} />
    </label>
  </div>
</Dialog>

<Dialog
  open={installDialogOpen}
  title={t('Install Restogogo')}
  description={t('Keep Restogogo on your home screen for quick, app-like access.')}
  size="small"
  onclose={() => (installDialogOpen = false)}
>
  <div class="install-guide">
    <img src="/brand/restogogo-mark.png" alt="" width="52" height="52" />
    {#if appInstall.ios}
      <strong>{t('On iPhone or iPad')}</strong>
      <p>{t('Tap Share in Safari, then choose Add to Home Screen and confirm Add.')}</p>
    {:else}
      <strong>{t('Install from your browser')}</strong>
      <p>{t('Open the browser menu and choose Install app or Add to Home screen.')}</p>
    {/if}
    <small>{t('Open the installed app afterwards. Restogogo will offer to connect phone alerts.')}</small>
  </div>
</Dialog>

<Dialog
  open={notifyInviteOpen}
  title={t('Get alerts on this phone?')}
  description={t('Shift changes, approvals and urgent messages reach you even when Restogogo is closed.')}
  size="small"
  onclose={closeNotifyInvite}
>
  <div class="install-guide">
    <img src="/brand/restogogo-mark.png" alt="" width="52" height="52" />
    <p>{t('You can change this any time in notification settings.')}</p>
  </div>

  {#snippet footer()}
    <ActionButton label="Not now" disabled={notifyInviteBusy} onclick={closeNotifyInvite} />
    <ActionButton
      label={notifyInviteBusy ? 'Turning on…' : 'Turn on alerts'}
      tone="primary"
      disabled={notifyInviteBusy}
      onclick={acceptNotifyInvite}
    />
  {/snippet}
</Dialog>

<FeedbackDialog
  open={feedbackOpen}
  restaurantId={workspace.activeId}
  role={isPlatformAdmin && !workspace.activeId ? 'platform_admin' : workspace.effectiveRole}
  onclose={() => (feedbackOpen = false)}
/>

<PreviewDialog
  open={previewPickerOpen}
  restaurantId={workspace.activeId}
  restaurantName={workspace.active?.restaurant_name ?? ''}
  source="manager"
  returnPath={page.url.pathname}
  onclose={() => (previewPickerOpen = false)}
/>

<style>
  .menu-wrap {
    position: relative;
    --account-text: var(--rst-topbar-text, var(--rst-ui-text));
    --account-muted: var(--rst-topbar-muted, var(--rst-ui-muted));
    --account-bg: transparent;
    --account-line: var(--rst-topbar-line, var(--rst-ui-line-strong));
    --account-hover: var(--rst-topbar-control-hover, var(--rst-ui-hover-bg));
  }
  .account-button {
    min-height: 36px;
    display: inline-flex;
    align-items: center;
    gap: 8px;
    padding: 4px 8px 4px 5px;
    border-radius: var(--rst-ui-radius-md);
    border: 1px solid var(--account-line);
    background: var(--rst-topbar-control-bg, var(--account-bg));
    color: var(--account-text);
    font: inherit;
    cursor: pointer;
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
  .account-button:hover { background: var(--account-hover); }
  .account-button:active { transform: none; }
  .account-button__email {
    color: var(--account-muted);
    font-size: 13px;
    font-style: normal;
  }
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
  .menu-wrap .menu {
    box-shadow: 0 16px 42px rgb(15 23 42 / .16);
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
  .menu header strong { color: var(--rst-ui-text); }
  .menu small { color: var(--rst-ui-muted); text-transform: capitalize; }
  .menu > button,
  .menu > a {
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
  .menu > button:hover,
  .menu > a:hover { background: var(--rst-ui-section-row-hover); }
  .menu > button.danger { color: var(--rst-state-danger-text); }
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
    letter-spacing: 0;
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
    font: inherit;
    text-align: left;
    cursor: pointer;
  }
  .workspace-switcher button.is-active {
    border-color: var(--rst-state-selected-border);
    background: var(--rst-state-selected-bg);
  }
  .workspace-switcher small { color: var(--rst-ui-muted); text-transform: capitalize; }
  .appearance-switcher {
    display: grid;
    gap: 7px;
    padding: 10px;
    border-bottom: 1px solid var(--rst-ui-divider-soft);
  }
  .appearance-switcher > span {
    padding: 0 4px;
    color: var(--rst-ui-muted);
    font-size: 10px;
    font-weight: var(--rst-fw-bold);
    letter-spacing: .04em;
    text-transform: uppercase;
  }
  .appearance-switcher > div {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 5px;
  }
  .appearance-switcher button {
    min-width: 0;
    min-height: 34px;
    display: grid;
    grid-template-columns: 10px minmax(0, 1fr) 14px;
    align-items: center;
    gap: 7px;
    padding: 6px 8px;
    border: 1px solid var(--rst-ui-line);
    border-radius: var(--rst-ui-radius-md);
    color: var(--rst-ui-muted);
    background: var(--rst-ui-surface-panel);
    font: inherit;
    font-size: 11px;
    font-weight: var(--rst-fw-medium);
    text-align: left;
    cursor: pointer;
  }
  .appearance-switcher button:hover {
    border-color: var(--rst-ui-line-strong);
    color: var(--rst-ui-text);
    background: var(--rst-ui-hover-bg);
  }
  .appearance-switcher button:active {
    transform: none;
  }
  .appearance-switcher button.is-active {
    border-color: var(--rst-state-selected-border);
    color: var(--rst-ui-text);
    background: var(--rst-state-selected-bg);
    font-weight: var(--rst-fw-bold);
  }
  .appearance-switcher button i {
    width: 9px;
    height: 9px;
    border-radius: 50%;
    background: var(--theme-swatch);
    box-shadow: 0 0 0 3px color-mix(in srgb, var(--theme-swatch) 13%, transparent);
  }
  .appearance-switcher button svg {
    color: var(--rst-ui-action);
  }
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
  .pin-form input[type='password'] { letter-spacing: 0; }
  .account-device {
    display: grid;
    grid-template-columns: 38px minmax(0, 1fr);
    gap: 6px 10px;
    align-items: center;
    padding-top: 14px;
    border-top: 1px solid var(--rst-ui-line);
  }
  .account-device img { width: 34px; height: 34px; }
  .account-device > div { display: grid; gap: 2px; }
  .account-device strong { font-size: 13px; }
  .account-device small,
  .account-toggle small,
  .install-guide small { color: var(--rst-ui-muted); font-size: 11px; line-height: 1.45; }
  .account-device > :global(button) { grid-column: 1 / -1; width: 100%; }
  .account-toggle {
    grid-template-columns: minmax(0, 1fr) auto !important;
    align-items: center;
    padding-top: 12px;
    border-top: 1px solid var(--rst-ui-line);
  }
  .account-toggle > span { display: grid; gap: 2px; }
  .account-toggle strong { color: var(--rst-ui-text); font-size: 13px; }
  .account-toggle input { width: 18px; min-height: 18px; accent-color: var(--rst-ui-action); }
  .install-guide { display: grid; justify-items: start; gap: 10px; }
  .install-guide img { width: 52px; height: 52px; }
  .install-guide strong { font-size: 16px; }
  .install-guide p { margin: 0; line-height: 1.55; }

  @media (max-width: 1180px) {
    .account-button__email { display: none; }
  }
</style>
