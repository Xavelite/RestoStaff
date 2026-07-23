<script lang="ts">
  import { goto } from '$app/navigation';
  import { page } from '$app/state';
  import { onMount, untrack } from 'svelte';
  import { saveAbsence } from '$lib/api/mutations';
  import ActionButton from '$lib/components/ActionButton.svelte';
  import Dialog from '$lib/components/Dialog.svelte';
  import {
    dismissNotification,
    loadNotificationFeed,
    loadNotificationSettings,
    markPushNotificationOpened,
    markNotificationRead,
    setNotificationTypeChannels,
    type NotificationSettings
  } from '$lib/notifications/notification-feed';
  import type { NotificationFeed, NotificationItem, NotificationType } from '$lib/notifications/notification-model';
  import { sound } from '$lib/sound/sound.svelte';
  import { toasts } from '$lib/ui/toast.svelte';
  import type { WorkspaceRole } from '$lib/api/workspace';
  import { workspaceRealtime } from '$lib/realtime/workspace-realtime.svelte';
  import { i18n, t } from '$lib/i18n/i18n.svelte';
  import { serviceLabel } from '$lib/calendar/date';
  import {
    disablePhonePush,
    enablePhonePush,
    phonePushStatus,
    syncPhonePush,
    type PhonePushStatus
  } from '$lib/push/push-client';
  import { isNotificationTypeCode } from '$lib/notifications/notification-model';

  type SetupNotification = { label: string; href: string };

  let {
    restaurantId,
    role,
    employeeId = null,
    timezone = 'Europe/Brussels',
    setupNotifications = [],
    settingsRequest = 0
  }: {
    restaurantId: string | null;
    role: WorkspaceRole | null;
    employeeId?: string | null;
    timezone?: string;
    setupNotifications?: SetupNotification[];
    settingsRequest?: number;
  } = $props();

  let open = $state(false);
  let settingsOpen = $state(false);
  let detailOpen = $state(false);
  let detailItem = $state<NotificationItem | null>(null);
  let loading = $state(false);
  let settingsLoading = $state(false);
  let saving = $state(false);
  let error = $state('');
  let settingsError = $state('');
  let settings = $state<NotificationSettings | null>(null);
  let feed = $state<NotificationFeed>({ items: [], unreadCount: 0 });
  let requestId = 0;
  let settingsRequestId = 0;
  let loadedContextKey = '';
  let observedRealtimeSequence = 0;
  let pushStatus = $state<PhonePushStatus | null>(null);
  let pushBusy = $state(false);
  let pushError = $state('');
  let handledPushKey = '';
  let handledSettingsRequest = 0;

  $effect(() => {
    if (!settingsRequest || settingsRequest === handledSettingsRequest) return;
    handledSettingsRequest = settingsRequest;
    untrack(() => void openSettings());
  });

  const visibleTypes = $derived.by(() => {
    if (!settings || !role) return [];
    return settings.types.filter((type) => type.audience === 'both' || (role === 'employee' ? type.audience === 'employee' : type.audience === 'manager'));
  });
  const totalCount = $derived(feed.unreadCount + setupNotifications.length);
  const feedSummary = $derived.by(() => {
    if (feed.unreadCount && setupNotifications.length) {
      return t('{newCount} new · {setupCount} setup', { newCount: feed.unreadCount, setupCount: setupNotifications.length });
    }
    if (feed.unreadCount) return t('{count} new', { count: feed.unreadCount });
    if (setupNotifications.length) return t('{count} setup', { count: setupNotifications.length });
    if (feed.items.length > 0) return t(feed.items.length === 1 ? '{count} recent item' : '{count} recent items', { count: feed.items.length });
    return t('No notifications');
  });

  function contextKey(): string {
    return `${restaurantId ?? ''}|${role ?? ''}|${employeeId ?? ''}|${timezone}`;
  }

  function notificationTitle(item: NotificationItem): string {
    return t(item.title, item.titleParams);
  }

  function notificationBody(item: NotificationItem): string {
    const params = item.serviceKey
      ? { ...item.bodyParams, service: t(serviceLabel(item.serviceKey)) }
      : item.bodyParams;
    return t(item.body, params);
  }

  function notificationTypeLabel(item: NotificationItem): string {
    return t(settings?.types.find((type) => type.code === item.type)?.label ?? 'Notification');
  }

  async function refreshSettings(force = false): Promise<NotificationSettings | null> {
    if (!restaurantId) {
      settings = null;
      return null;
    }
    if (settings && !force) return settings;
    const id = ++settingsRequestId;
    const requestedContext = contextKey();
    settingsLoading = true;
    settingsError = '';
    try {
      const result = await loadNotificationSettings({ restaurantId });
      if (id !== settingsRequestId || requestedContext !== contextKey()) return null;
      settings = result;
      return result;
    } catch (reason) {
      if (id !== settingsRequestId || requestedContext !== contextKey()) return null;
      settingsError = reason instanceof Error ? reason.message : String(reason);
      return null;
    } finally {
      if (id === settingsRequestId && requestedContext === contextKey()) settingsLoading = false;
    }
  }

  async function refresh() {
    if (!restaurantId || !role) {
      settings = null;
      feed = { items: [], unreadCount: 0 };
      return;
    }
    const id = ++requestId;
    loading = true;
    error = '';
    const currentSettings = await refreshSettings();
    if (id !== requestId) return;
    if (!currentSettings) {
      feed = { items: [], unreadCount: 0 };
      loading = false;
      return;
    }
    try {
      const result = await loadNotificationFeed({ restaurantId, role, employeeId, timezone }, currentSettings);
      if (id !== requestId) return;
      // Chime only when the unread count actually grows for the same context —
      // never on first load, a workspace switch, or a quiet re-poll.
      const hadFeed = feed.items.length > 0 || feed.unreadCount > 0;
      if (hadFeed && result.unreadCount > feed.unreadCount) sound.play('notification');
      feed = result;
    } catch (reason) {
      if (id !== requestId) return;
      error = reason instanceof Error ? reason.message : String(reason);
      feed = { items: [], unreadCount: 0 };
    } finally {
      if (id === requestId) loading = false;
    }
  }

  $effect(() => {
    const nextContextKey = contextKey();

    untrack(() => {
      if (nextContextKey === loadedContextKey) return;
      loadedContextKey = nextContextKey;
      requestId += 1;
      settingsRequestId += 1;
      settings = null;
      feed = { items: [], unreadCount: 0 };
      error = '';
      settingsError = '';

      if (!restaurantId || !role) {
        loading = false;
        settingsLoading = false;
        return;
      }

      void refresh();
    });
  });

  $effect(() => {
    const sequence = workspaceRealtime.eventSequence;
    untrack(() => {
      if (!sequence || sequence === observedRealtimeSequence) return;
      observedRealtimeSequence = sequence;
      if (restaurantId && role) void refresh();
    });
  });

  onMount(() => {
    const refreshVisible = () => {
      if (document.visibilityState === 'visible') void refresh();
    };
    const timer = window.setInterval(refreshVisible, 300_000);
    window.addEventListener('focus', refreshVisible);
    document.addEventListener('visibilitychange', refreshVisible);
    void refreshPushStatus();
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('focus', refreshVisible);
      document.removeEventListener('visibilitychange', refreshVisible);
    };
  });

  async function toggleOpen() {
    open = !open;
    if (open) await refresh();
  }

  async function openSettings() {
    open = false;
    settingsOpen = true;
    await refreshSettings();
    await refreshPushStatus();
  }

  function inAppEnabled(type: NotificationType): boolean {
    return (
      settings?.preferences.find((preference) => preference.notification_type === type.code)?.in_app_enabled ??
      type.default_in_app_enabled
    );
  }

  function pushEnabled(type: NotificationType): boolean {
    return (
      settings?.preferences.find((preference) => preference.notification_type === type.code)?.push_enabled ??
      type.default_push_enabled
    );
  }

  async function refreshPushStatus(): Promise<void> {
    try {
      pushStatus = await phonePushStatus();
      pushError = '';
    } catch (reason) {
      pushStatus = null;
      pushError = reason instanceof Error ? reason.message : String(reason);
    }
  }

  async function connectPhone(): Promise<void> {
    if (!restaurantId || pushBusy) return;
    pushBusy = true;
    pushError = '';
    try {
      await enablePhonePush({ restaurantId, locale: i18n.locale });
      await refreshPushStatus();
      toasts.show(t('Phone notifications enabled.'), 'success');
    } catch (reason) {
      pushError = reason instanceof Error ? reason.message : String(reason);
    } finally {
      pushBusy = false;
    }
  }

  async function disconnectPhone(): Promise<void> {
    if (pushBusy) return;
    pushBusy = true;
    pushError = '';
    try {
      await disablePhonePush();
      await refreshPushStatus();
      toasts.show(t('Phone notifications disabled.'), 'success');
    } catch (reason) {
      pushError = reason instanceof Error ? reason.message : String(reason);
    } finally {
      pushBusy = false;
    }
  }

  function markLocalRead(item: NotificationItem): void {
    feed = {
      items: feed.items.map((candidate) =>
        candidate.key === item.key
          ? { ...candidate, readAt: candidate.readAt ?? new Date().toISOString() }
          : candidate
      ),
      unreadCount: Math.max(0, feed.unreadCount - (item.readAt ? 0 : 1))
    };
  }

  async function read(item: NotificationItem) {
    if (!restaurantId || !settings || item.readAt) return;
    try {
      await markNotificationRead({ restaurantId, profileId: settings.profileId, item });
      markLocalRead(item);
    } catch (reason) {
      toasts.show(reason instanceof Error ? reason.message : String(reason), 'danger');
    }
  }

  async function openItem(item: NotificationItem) {
    await read(item);
    if (item.actionMode === 'route') {
      open = false;
      await goto(item.targetUrl);
      return;
    }
    open = false;
    detailItem = item;
    detailOpen = true;
  }

  async function dismiss(item: NotificationItem) {
    if (!restaurantId || !settings) return;
    try {
      await dismissNotification({ restaurantId, profileId: settings.profileId, item });
      feed = {
        items: feed.items.filter((candidate) => candidate.key !== item.key),
        unreadCount: feed.items.filter((candidate) => candidate.key !== item.key && !candidate.readAt).length
      };
    } catch (reason) {
      toasts.show(reason instanceof Error ? reason.message : String(reason), 'danger');
    }
  }

  function closeSettings() {
    if (!saving) settingsOpen = false;
  }

  function closeDetail() {
    if (!saving) detailOpen = false;
  }

  async function toggleType(type: NotificationType, channel: 'in-app' | 'push') {
    if (!restaurantId || !settings || saving) return;
    saving = true;
    try {
      await setNotificationTypeChannels({
        restaurantId,
        profileId: settings.profileId,
        notificationType: type.code,
        inAppEnabled: channel === 'in-app' ? !inAppEnabled(type) : inAppEnabled(type),
        pushEnabled: channel === 'push' ? !pushEnabled(type) : pushEnabled(type)
      });
      await refreshSettings(true);
      await refresh();
    } catch (reason) {
      toasts.show(reason instanceof Error ? reason.message : String(reason), 'danger');
    } finally {
      saving = false;
    }
  }

  $effect(() => {
    if (!restaurantId || !settings || !pushStatus?.subscribed) return;
    const locale = i18n.locale;
    untrack(() => void syncPhonePush({ restaurantId: restaurantId!, locale }).catch(() => undefined));
  });

  $effect(() => {
    const notificationKey = page.url.searchParams.get('push_key') ?? '';
    const notificationType = page.url.searchParams.get('push_type') ?? '';
    const notificationRestaurant = page.url.searchParams.get('push_restaurant') ?? '';
    if (
      !settings ||
      !restaurantId ||
      !notificationKey ||
      handledPushKey === notificationKey ||
      notificationRestaurant !== restaurantId ||
      !isNotificationTypeCode(notificationType)
    ) return;

    handledPushKey = notificationKey;
    untrack(() => void (async () => {
      try {
        await markPushNotificationOpened({
          restaurantId: restaurantId!,
          profileId: settings!.profileId,
          notificationKey,
          notificationType
        });
        const target = new URL(page.url);
        target.searchParams.delete('push_key');
        target.searchParams.delete('push_type');
        target.searchParams.delete('push_restaurant');
        await goto(`${target.pathname}${target.search}`, {
          replaceState: true,
          keepFocus: true,
          noScroll: true
        });
        await refresh();
      } catch (reason) {
        toasts.show(reason instanceof Error ? reason.message : String(reason), 'danger');
      }
    })());
  });

  async function decideAbsence(action: 'approve' | 'reject') {
    if (!restaurantId || !detailItem?.employeeId || detailItem.source.table !== 'absences' || saving) return;
    saving = true;
    try {
      await saveAbsence({
        restaurantId,
        employeeId: detailItem.employeeId,
        absenceId: detailItem.source.id,
        action,
        payload: {}
      });
      toasts.show(action === 'approve' ? t('Absence approved.') : t('Absence refused.'), 'success');
      await dismiss(detailItem);
      await workspaceRealtime.publish('notification-refresh', {
        restaurantId,
        source: 'system'
      });
      detailOpen = false;
      detailItem = null;
      await refresh();
    } catch (reason) {
      toasts.show(reason instanceof Error ? reason.message : String(reason), 'danger');
    } finally {
      saving = false;
    }
  }

  async function openTarget(item: NotificationItem) {
    detailOpen = false;
    open = false;
    await goto(item.targetUrl);
  }
</script>

<div class="notifications-shell" data-tour="notifications">
  <button
    class="notification-button"
    class:has-alerts={totalCount > 0}
    type="button"
    aria-label={totalCount > 0 ? t('Notifications, {count} new or setup', { count: totalCount }) : t('Notifications')}
    aria-expanded={open}
    onclick={toggleOpen}
  >
    <span aria-hidden="true">🔔</span>
    {#if totalCount > 0}<b>{totalCount}</b>{/if}
  </button>

  {#if open}
    <section class="notification-menu" aria-label={t('Notifications')}>
      <header>
        <div>
          <strong>{t('Notifications')}</strong>
          <small>{feedSummary}</small>
        </div>
        <button class="notification-settings-trigger" type="button" onclick={openSettings}>{t('Settings')}</button>
      </header>

      {#if loading}
        <p class="notification-empty">{t('Loading notifications…')}</p>
      {:else if error}
        <div class="notification-error" role="alert">
          <p>{error}</p>
          <button type="button" onclick={refresh}>{t('Retry')}</button>
        </div>
      {:else}
        {#if setupNotifications.length}
          <div class="notification-group">
            <span>{t('Setup')}</span>
            {#each setupNotifications as item (item.label)}
              <a class="notification-row is-setup" href={item.href} onclick={() => (open = false)}>
                <strong>{t(item.label)}</strong>
                <small>{t('Open setup →')}</small>
              </a>
            {/each}
          </div>
        {/if}

        {#if feed.items.length}
          <div class="notification-group">
            <span>{t('Recent')}</span>
            {#each feed.items as item (item.key)}
              <article class="notification-row" class:is-unread={!item.readAt} class:is-critical={item.severity === 'critical'}>
                <button type="button" onclick={() => openItem(item)}>
                  <strong>{notificationTitle(item)}</strong>
                  <small>{notificationBody(item)}</small>
                </button>
                <button class="dismiss" type="button" aria-label={t('Dismiss notification')} onclick={() => dismiss(item)}>×</button>
              </article>
            {/each}
          </div>
        {:else if !setupNotifications.length}
          <p class="notification-empty">{t('Nothing needs your attention.')}</p>
        {/if}
      {/if}
    </section>
  {/if}
</div>

{#snippet detailFooter()}
  {#if detailItem?.type === 'absence_request_submitted'}
    <ActionButton label={t('Open Schedule')} disabled={saving} onclick={() => openTarget(detailItem!)} />
    <ActionButton label={t('Refuse')} tone="danger" disabled={saving} onclick={() => decideAbsence('reject')} />
    <ActionButton label={t('Approve')} tone="primary" disabled={saving} onclick={() => decideAbsence('approve')} />
  {:else if detailItem}
    <ActionButton label={t('Dismiss')} disabled={saving} onclick={() => dismiss(detailItem!)} />
    <ActionButton label={t('Open page')} tone="primary" disabled={saving} onclick={() => openTarget(detailItem!)} />
  {/if}
{/snippet}

<Dialog
  open={detailOpen && Boolean(detailItem)}
  title={detailItem ? notificationTitle(detailItem) : t('Notification')}
  description={detailItem ? notificationBody(detailItem) : ''}
  size="small"
  onclose={closeDetail}
  footer={detailFooter}
>
  {#if detailItem}
    <div class="notification-detail">
      <span class="detail-pill is-{detailItem.severity}">{notificationTypeLabel(detailItem)}</span>
      <p>{t('This notification points to the live operational source. The source data remains the business truth.')}</p>
      {#if detailItem.type === 'absence_request_submitted'}
        <p>{t('Approve or refuse the request here, or open Schedule for the full context.')}</p>
      {/if}
    </div>
  {/if}
</Dialog>

{#snippet settingsFooter()}
  <ActionButton label={t('Done')} tone="primary" disabled={saving} onclick={closeSettings} />
{/snippet}

<Dialog
  open={settingsOpen}
  title={t('Notification settings')}
  description={t('Choose where each notification can reach you.')}
  size="medium"
  onclose={closeSettings}
  footer={settingsFooter}
>
  <div class="notification-settings">
    {#if !settings && settingsLoading}
      <p>{t('Loading settings…')}</p>
    {:else if settingsError}
      <p>{settingsError}</p>
    {:else}
      <section class="phone-channel" class:is-connected={pushStatus?.subscribed}>
        <div class="phone-channel__icon" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="6" y="2.5" width="12" height="19" rx="2.5"/><path d="M10 5h4M11 18.5h2"/></svg>
        </div>
        <div>
          <strong>{t('Phone notifications')}</strong>
          <small>
            {#if pushStatus?.subscribed}
              {t('This device is connected.')}
            {:else if pushStatus?.requiresInstall}
              {t('Add Restogogo to your Home Screen first.')}
            {:else if pushStatus?.permission === 'denied'}
              {t('Notifications are blocked in your browser settings.')}
            {:else if pushStatus && (!pushStatus.configured || !pushStatus.supported)}
              {t('Phone notifications are unavailable in this environment.')}
            {:else}
              {t('Connect this device to receive alerts when Restogogo is closed.')}
            {/if}
          </small>
        </div>
        {#if pushStatus?.subscribed}
          <ActionButton label={pushBusy ? t('Disconnecting…') : t('Disconnect')} disabled={pushBusy} onclick={disconnectPhone} />
        {:else}
          <ActionButton
            label={pushBusy ? t('Connecting…') : t('Connect')}
            tone="primary"
            disabled={pushBusy || Boolean(pushStatus && (!pushStatus.configured || !pushStatus.supported || pushStatus.requiresInstall || pushStatus.permission === 'denied'))}
            onclick={connectPhone}
          />
        {/if}
      </section>
      {#if pushError}<p class="phone-channel__error" role="alert">{t(pushError)}</p>{/if}

      {#if !visibleTypes.length}
        <p>{t('No notification settings are available for this role yet.')}</p>
      {/if}
      {#if visibleTypes.length}
        <div class="notification-settings__head" aria-hidden="true">
          <span>{t('Notification')}</span><span>{t('In app')}</span><span>{t('Phone')}</span>
        </div>
      {/if}
      {#each visibleTypes as type (type.code)}
        <div class="notification-setting">
          <span class="notification-setting__copy">
            <strong>{t(type.label)}</strong>
            <small>{t(type.description)}</small>
          </span>
          <label class="channel-check">
            <span class="sr-only">{t('In app')}: {t(type.label)}</span>
            <input type="checkbox" checked={inAppEnabled(type)} disabled={saving} onchange={() => toggleType(type, 'in-app')} />
          </label>
          <label class="channel-check">
            <span class="sr-only">{t('Phone')}: {t(type.label)}</span>
            <input type="checkbox" checked={pushEnabled(type)} disabled={saving || !pushStatus?.subscribed} onchange={() => toggleType(type, 'push')} />
          </label>
        </div>
      {/each}
    {/if}
  </div>
</Dialog>

<style>
  .notifications-shell { position: relative; }
  .notification-button {
    position: relative;
    width: 38px;
    min-height: 38px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border: 0;
    border-radius: 50%;
    color: var(--rst-ui-muted);
    background: transparent;
    font: inherit;
    cursor: pointer;
  }
  .notification-button:hover { background: var(--rst-ui-surface-field-strong); transform: translateY(-1px); }
  .notification-button.has-alerts { color: var(--rst-state-warning-text); }
  .notification-button > span {
    display: inline-block;
    font-size: 17px;
    transition: transform .22s var(--rst-ease-spring);
  }
  .notification-button:hover > span {
    transform: scale(1.12);
  }
  .notification-button.has-alerts > span {
    animation: rst-wiggle 2.4s ease-in-out infinite;
    animation-delay: 1s;
  }
  .notification-button b {
    position: absolute;
    right: -5px;
    top: -5px;
    min-width: 18px;
    height: 18px;
    display: grid;
    place-items: center;
    border-radius: var(--rst-ui-radius-pill);
    color: var(--rst-on-accent-text);
    background: var(--rst-state-danger);
    font-size: 9px;
    animation: rst-pop-in .32s var(--rst-ease-spring) backwards;
  }
  .notification-menu {
    position: absolute;
    z-index: var(--rst-z-menu);
    top: calc(100% + 8px);
    right: 0;
    width: min(380px, calc(100vw - 24px));
    max-height: min(72vh, 620px);
    overflow: auto;
    border: 1px solid var(--rst-ui-line-strong);
    border-radius: var(--rst-ui-radius-lg);
    background: var(--rst-ui-bg-2);
    box-shadow: 0 16px 50px rgba(0,0,0,.38);
    transform-origin: top right;
    animation: rst-menu-pop .16s cubic-bezier(.16,1,.3,1) backwards;
  }
  @keyframes rst-menu-pop {
    from { opacity: 0; transform: scale(.92) translateY(-4px); }
    to { opacity: 1; transform: scale(1) translateY(0); }
  }
  .notification-menu header {
    position: sticky;
    top: 0;
    z-index: 1;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 12px 14px;
    border-bottom: 1px solid var(--rst-ui-divider-soft);
    background: var(--rst-ui-bg-2);
  }
  .notification-menu header div,
  .notification-group,
  .notification-detail,
  .notification-setting__copy {
    display: grid;
    gap: 3px;
  }
  .notification-menu small,
  .notification-group > span,
  .notification-empty,
  .notification-detail p,
  .notification-settings small {
    color: var(--rst-ui-muted);
    font-size: 12px;
  }
  .notification-settings-trigger,
  .notification-error button {
    min-height: 32px;
    padding: 6px 10px;
    border: 1px solid var(--rst-ui-line);
    border-radius: var(--rst-ui-radius-sm);
    color: var(--rst-ui-text);
    background: var(--rst-ui-surface-field-strong);
    font: inherit;
    font-size: 12px;
    cursor: pointer;
  }
  .notification-group > span {
    padding: 10px 14px 4px;
    font-weight: var(--rst-fw-bold);
    letter-spacing: 0;
    text-transform: uppercase;
  }
  .notification-row {
    position: relative;
    border-bottom: 1px solid var(--rst-ui-divider-soft);
    background: transparent;
  }
  .notification-row.is-unread { background: var(--rst-state-selected-bg); }
  .notification-row.is-critical { box-shadow: inset 3px 0 0 var(--rst-state-danger); }
  .notification-row > button:first-child,
  .notification-row.is-setup {
    width: 100%;
    min-height: 58px;
    display: grid;
    gap: 4px;
    padding: 10px 42px 10px 14px;
    border: 0;
    color: var(--rst-ui-text);
    background: transparent;
    font: inherit;
    text-align: left;
    text-decoration: none;
    cursor: pointer;
  }
  .notification-row > button:first-child:hover,
  .notification-row.is-setup:hover { background: var(--rst-ui-section-row-hover); }
  .notification-row strong { font-size: 13px; }
  .dismiss {
    position: absolute;
    top: 9px;
    right: 9px;
    width: 26px;
    height: 26px;
    border: 1px solid transparent;
    border-radius: var(--rst-ui-radius-round);
    color: var(--rst-ui-muted);
    background: transparent;
    cursor: pointer;
  }
  .dismiss:hover { color: var(--rst-ui-text); background: var(--rst-ui-hover-bg); }
  .notification-empty,
  .notification-error { margin: 0; padding: 18px 14px; }
  .notification-error { display: grid; gap: 8px; }
  .notification-error p { margin: 0; color: var(--rst-state-danger-text); }
  .notification-detail { gap: 10px; }
  .notification-detail p { margin: 0; }
  .detail-pill {
    width: fit-content;
    padding: 5px 8px;
    border-radius: var(--rst-ui-radius-pill);
    color: var(--rst-ui-muted);
    background: var(--rst-ui-surface-field-strong);
    font-size: 11px;
    font-weight: var(--rst-fw-bold);
    text-transform: capitalize;
  }
  .detail-pill.is-critical { color: var(--rst-state-danger-text); background: var(--rst-state-danger-bg); }
  .detail-pill.is-attention { color: var(--rst-state-warning-text); background: var(--rst-state-warning-bg); }
  .detail-pill.is-success { color: var(--rst-state-success-text); background: var(--rst-state-success-bg); }
  .notification-settings { display: grid; gap: 8px; }
  .notification-settings > p { margin: 0; color: var(--rst-ui-muted); font-size: 13px; }
  .phone-channel {
    display: grid;
    grid-template-columns: 38px minmax(0, 1fr) auto;
    gap: 12px;
    align-items: center;
    padding: 12px;
    border: 1px solid var(--rst-ui-line);
    border-radius: var(--rst-ui-radius-md);
    background: var(--rst-ui-section-row);
  }
  .phone-channel.is-connected { border-color: var(--rst-state-success-border); background: var(--rst-state-success-bg); }
  .phone-channel__icon {
    width: 38px;
    height: 38px;
    display: grid;
    place-items: center;
    border-radius: var(--rst-ui-radius-round);
    color: var(--rst-ui-action);
    background: var(--rst-ui-action-soft, rgba(var(--rst-ui-action-rgb), .12));
  }
  .phone-channel__icon svg { width: 21px; height: 21px; }
  .phone-channel > div:nth-child(2) { display: grid; gap: 3px; }
  .phone-channel strong { font-size: 13px; }
  .phone-channel__error { color: var(--rst-state-danger-text) !important; }
  .notification-settings__head,
  .notification-setting {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 56px 56px;
    gap: 10px;
    align-items: center;
  }
  .notification-settings__head {
    padding: 4px 12px 0;
    color: var(--rst-ui-muted);
    font-size: 10px;
    font-weight: var(--rst-fw-bold);
    text-transform: uppercase;
  }
  .notification-settings__head span:not(:first-child) { text-align: center; }
  .notification-setting {
    padding: 11px 12px;
    border: 1px solid var(--rst-ui-line);
    border-radius: var(--rst-ui-radius-md);
    background: var(--rst-ui-section-row);
  }
  .notification-setting:hover { background: var(--rst-ui-section-row-hover); }
  .channel-check { min-height: 32px; display: grid; place-items: center; cursor: pointer; }
  .channel-check input { width: 17px; height: 17px; margin: 0; accent-color: var(--rst-ui-action); }
  .channel-check input:disabled { cursor: not-allowed; opacity: .45; }
  .notification-settings strong { font-size: 13px; }
  .sr-only { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0, 0, 0, 0); white-space: nowrap; border: 0; }
  @media (max-width: 520px) {
    .notifications-shell { position: static; }
    .notification-menu {
      position: fixed;
      top: 62px;
      bottom: auto;
      right: 12px;
      left: 12px;
      width: auto;
      height: calc(100dvh - 138px - env(safe-area-inset-bottom, 0px));
      max-height: none;
    }
    .phone-channel { grid-template-columns: 34px minmax(0, 1fr); }
    .phone-channel > :global(button) { grid-column: 1 / -1; width: 100%; }
    .notification-settings__head,
    .notification-setting { grid-template-columns: minmax(0, 1fr) 46px 46px; gap: 6px; }
  }
</style>
