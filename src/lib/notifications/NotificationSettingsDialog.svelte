<script lang="ts">
  import ActionButton from '$lib/components/ActionButton.svelte';
  import Dialog from '$lib/components/Dialog.svelte';
  import { t } from '$lib/i18n/i18n.svelte';
  import type { NotificationSettings } from '$lib/notifications/notification-feed';
  import type { NotificationType } from '$lib/notifications/notification-model';
  import type { PhonePushStatus } from '$lib/push/push-client';

  let {
    open,
    settings,
    loading,
    error,
    visibleTypes,
    pushStatus,
    pushBusy,
    pushError,
    saving,
    onclose,
    onconnect,
    ondisconnect,
    inAppEnabled,
    pushEnabled,
    ontoggle
  }: {
    open: boolean;
    settings: NotificationSettings | null;
    loading: boolean;
    error: string;
    visibleTypes: NotificationType[];
    pushStatus: PhonePushStatus | null;
    pushBusy: boolean;
    pushError: string;
    saving: boolean;
    onclose: () => void;
    onconnect: () => void | Promise<void>;
    ondisconnect: () => void | Promise<void>;
    inAppEnabled: (type: NotificationType) => boolean;
    pushEnabled: (type: NotificationType) => boolean;
    ontoggle: (type: NotificationType, channel: 'in-app' | 'push') => void | Promise<void>;
  } = $props();
</script>

{#snippet footer()}
  <ActionButton label={t('Done')} tone="primary" disabled={saving} onclick={onclose} />
{/snippet}

<Dialog
  {open}
  title={t('Notification settings')}
  description={t('Choose where each notification can reach you.')}
  size="medium"
  {onclose}
  {footer}
>
  <div class="notification-settings">
    {#if !settings && loading}
      <p>{t('Loading settings…')}</p>
    {:else if error}
      <p>{error}</p>
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
          <ActionButton label={pushBusy ? t('Disconnecting…') : t('Disconnect')} disabled={pushBusy} onclick={ondisconnect} />
        {:else}
          <ActionButton
            label={pushBusy ? t('Connecting…') : t('Connect')}
            tone="primary"
            disabled={pushBusy || Boolean(pushStatus && (!pushStatus.configured || !pushStatus.supported || pushStatus.requiresInstall || pushStatus.permission === 'denied'))}
            onclick={onconnect}
          />
        {/if}
      </section>
      {#if pushError}<p class="phone-channel__error" role="alert">{t(pushError)}</p>{/if}

      {#if !visibleTypes.length}
        <p>{t('No notification settings are available for this role yet.')}</p>
      {:else}
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
            <input type="checkbox" checked={inAppEnabled(type)} disabled={saving} onchange={() => ontoggle(type, 'in-app')} />
          </label>
          <label class="channel-check">
            <span class="sr-only">{t('Phone')}: {t(type.label)}</span>
            <input type="checkbox" checked={pushEnabled(type)} disabled={saving || !pushStatus?.subscribed} onchange={() => ontoggle(type, 'push')} />
          </label>
        </div>
      {/each}
    {/if}
  </div>
</Dialog>

<style>
  .notification-settings { display: grid; gap: 8px; }
  .notification-settings > p { margin: 0; color: var(--rst-ui-muted); font-size: var(--rst-fs-body); }
  .notification-settings small { color: var(--rst-ui-muted); font-size: var(--rst-fs-control); }
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
  .phone-channel > div:nth-child(2),
  .notification-setting__copy { display: grid; gap: 3px; }
  .phone-channel strong,
  .notification-settings strong { font-size: var(--rst-fs-body); }
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
    font-size: var(--rst-fs-caption);
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

  @media (max-width: 520px) {
    .phone-channel { grid-template-columns: 34px minmax(0, 1fr); }
    .phone-channel > :global(button) { grid-column: 1 / -1; width: 100%; }
    .notification-settings__head,
    .notification-setting { grid-template-columns: minmax(0, 1fr) 46px 46px; gap: 6px; }
  }
</style>
