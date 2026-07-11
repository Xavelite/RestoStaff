<script lang="ts">
  import { goto } from '$app/navigation';
  import { untrack } from 'svelte';
  import { saveAbsence } from '$lib/api/mutations';
  import ActionButton from '$lib/components/ActionButton.svelte';
  import Dialog from '$lib/components/Dialog.svelte';
  import {
    dismissNotification,
    loadNotificationFeed,
    loadNotificationSettings,
    markNotificationRead,
    setNotificationTypeEnabled,
    type NotificationSettings
  } from '$lib/notifications/notification-feed';
  import type { NotificationFeed, NotificationItem, NotificationType } from '$lib/notifications/notification-model';
  import { toasts } from '$lib/ui/toast.svelte';
  import type { WorkspaceRole } from '$lib/api/workspace';

  type SetupNotification = { label: string; href: string };

  let {
    restaurantId,
    role,
    employeeId = null,
    timezone = 'Europe/Brussels',
    setupNotifications = []
  }: {
    restaurantId: string | null;
    role: WorkspaceRole | null;
    employeeId?: string | null;
    timezone?: string;
    setupNotifications?: SetupNotification[];
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

  const visibleTypes = $derived.by(() => {
    if (!settings || !role) return [];
    return settings.types.filter((type) => type.audience === 'both' || (role === 'employee' ? type.audience === 'employee' : type.audience === 'manager'));
  });
  const totalCount = $derived(feed.unreadCount + setupNotifications.length);
  const feedSummary = $derived.by(() => {
    if (totalCount > 0) return `${totalCount} open item${totalCount === 1 ? '' : 's'}`;
    if (feed.items.length > 0) return `${feed.items.length} recent item${feed.items.length === 1 ? '' : 's'}`;
    return 'Nothing open';
  });

  function contextKey(): string {
    return `${restaurantId ?? ''}|${role ?? ''}|${employeeId ?? ''}|${timezone}`;
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

  async function toggleOpen() {
    open = !open;
    if (open) await refresh();
  }

  async function openSettings() {
    open = false;
    settingsOpen = true;
    await refreshSettings();
  }

  function enabled(type: NotificationType): boolean {
    return (
      settings?.preferences.find((preference) => preference.notification_type === type.code)?.in_app_enabled ??
      type.default_in_app_enabled
    );
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
    markLocalRead(item);
    await markNotificationRead({ restaurantId, profileId: settings.profileId, item }).catch(() => undefined);
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
    feed = {
      items: feed.items.filter((candidate) => candidate.key !== item.key),
      unreadCount: feed.items.filter((candidate) => candidate.key !== item.key && !candidate.readAt).length
    };
    await dismissNotification({ restaurantId, profileId: settings.profileId, item }).catch((reason) => {
      toasts.show(reason instanceof Error ? reason.message : String(reason), 'danger');
    });
  }

  function closeSettings() {
    if (!saving) settingsOpen = false;
  }

  function closeDetail() {
    if (!saving) detailOpen = false;
  }

  async function toggleType(type: NotificationType) {
    if (!restaurantId || !settings || saving) return;
    saving = true;
    try {
      const next = !enabled(type);
      await setNotificationTypeEnabled({
        restaurantId,
        profileId: settings.profileId,
        notificationType: type.code,
        enabled: next
      });
      await refreshSettings(true);
      await refresh();
    } catch (reason) {
      toasts.show(reason instanceof Error ? reason.message : String(reason), 'danger');
    } finally {
      saving = false;
    }
  }

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
      toasts.show(action === 'approve' ? 'Absence approved.' : 'Absence refused.', 'success');
      await dismiss(detailItem);
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

<div class="notifications-shell">
  <button
    class="notification-button"
    class:has-alerts={totalCount > 0}
    type="button"
    aria-label={totalCount > 0 ? `Notifications, ${totalCount} unread or open` : 'Notifications'}
    aria-expanded={open}
    onclick={toggleOpen}
  >
    <span aria-hidden="true">🔔</span>
    {#if totalCount > 0}<b>{totalCount}</b>{/if}
  </button>

  {#if open}
    <section class="notification-menu" aria-label="Notifications">
      <header>
        <div>
          <strong>Notifications</strong>
          <small>{feedSummary}</small>
        </div>
        <button class="notification-settings-trigger" type="button" onclick={openSettings}>Settings</button>
      </header>

      {#if loading}
        <p class="notification-empty">Loading notifications…</p>
      {:else if error}
        <div class="notification-error" role="alert">
          <p>{error}</p>
          <button type="button" onclick={refresh}>Retry</button>
        </div>
      {:else}
        {#if setupNotifications.length}
          <div class="notification-group">
            <span>Setup</span>
            {#each setupNotifications as item (item.label)}
              <a class="notification-row is-setup" href={item.href} onclick={() => (open = false)}>
                <strong>{item.label}</strong>
                <small>Open setup →</small>
              </a>
            {/each}
          </div>
        {/if}

        {#if feed.items.length}
          <div class="notification-group">
            <span>{feed.unreadCount ? 'New' : 'Recent'}</span>
            {#each feed.items as item (item.key)}
              <article class="notification-row" class:is-unread={!item.readAt} class:is-critical={item.severity === 'critical'}>
                <button type="button" onclick={() => openItem(item)}>
                  <strong>{item.title}</strong>
                  <small>{item.body}</small>
                </button>
                <button class="dismiss" type="button" aria-label="Dismiss notification" onclick={() => dismiss(item)}>×</button>
              </article>
            {/each}
          </div>
        {:else if !setupNotifications.length}
          <p class="notification-empty">Nothing needs your attention.</p>
        {/if}
      {/if}
    </section>
  {/if}
</div>

{#snippet detailFooter()}
  {#if detailItem?.type === 'absence_request_submitted'}
    <ActionButton label="Refuse" tone="danger" disabled={saving} onclick={() => decideAbsence('reject')} />
    <ActionButton label="Approve" tone="primary" disabled={saving} onclick={() => decideAbsence('approve')} />
  {:else if detailItem}
    <ActionButton label="Dismiss" disabled={saving} onclick={() => dismiss(detailItem!)} />
    <ActionButton label="Open page" tone="primary" disabled={saving} onclick={() => openTarget(detailItem!)} />
  {/if}
{/snippet}

<Dialog
  open={detailOpen && Boolean(detailItem)}
  title={detailItem?.title ?? 'Notification'}
  description={detailItem?.body ?? ''}
  size="small"
  onclose={closeDetail}
  footer={detailFooter}
>
  {#if detailItem}
    <div class="notification-detail">
      <span class="detail-pill is-{detailItem.severity}">{detailItem.type.replaceAll('_', ' ')}</span>
      <p>This notification points to the live operational source. The source data remains the business truth.</p>
      {#if detailItem.type === 'absence_request_submitted'}
        <p>Approve or refuse the request here, or open My time for the full context.</p>
      {/if}
    </div>
  {/if}
</Dialog>

{#snippet settingsFooter()}
  <ActionButton label="Done" tone="primary" disabled={saving} onclick={closeSettings} />
{/snippet}

<Dialog
  open={settingsOpen}
  title="Notification settings"
  description="Choose which in-app notifications you want to receive. Push is prepared for later, but not active yet."
  size="medium"
  onclose={closeSettings}
  footer={settingsFooter}
>
  <div class="notification-settings">
    {#if !settings && settingsLoading}
      <p>Loading settings…</p>
    {:else if settingsError}
      <p>{settingsError}</p>
    {:else}
      {#if !visibleTypes.length}
        <p>No notification settings are available for this role yet.</p>
      {/if}
      {#each visibleTypes as type (type.code)}
        <label>
          <input type="checkbox" checked={enabled(type)} disabled={saving} onchange={() => toggleType(type)} />
          <span>
            <strong>{type.label}</strong>
            <small>{type.description}</small>
          </span>
        </label>
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
    border: 1px solid var(--rst-ui-line);
    border-radius: var(--rst-ui-radius-md);
    color: var(--rst-ui-muted);
    background: transparent;
    font: inherit;
    cursor: pointer;
  }
  .notification-button:hover { background: var(--rst-ui-surface-field-strong); transform: translateY(-1px); }
  .notification-button.has-alerts { color: var(--rst-state-warning-text); }
  .notification-button.has-alerts span {
    display: inline-block;
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
  .notification-settings label span {
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
    letter-spacing: .06em;
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
  .notification-settings label {
    display: grid;
    grid-template-columns: auto 1fr;
    gap: 10px;
    align-items: flex-start;
    padding: 11px 12px;
    border: 1px solid var(--rst-ui-line);
    border-radius: var(--rst-ui-radius-md);
    background: var(--rst-ui-section-row);
  }
  .notification-settings label:hover { background: var(--rst-ui-section-row-hover); }
  .notification-settings input { margin-top: 3px; }
  .notification-settings strong { font-size: 13px; }
  @media (max-width: 520px) {
    .notifications-shell { position: static; }
    .notification-menu {
      position: fixed;
      top: 62px;
      right: 12px;
      left: 12px;
      width: auto;
      max-height: calc(100vh - 86px);
    }
  }
</style>
