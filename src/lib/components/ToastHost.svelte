<script lang="ts">
  import { t } from '$lib/i18n/i18n.svelte';
  import { toasts } from '$lib/ui/toast.svelte';
</script>

<aside class="host" aria-label={t('Notifications')}>
  {#each toasts.messages as toast (toast.id)}
    <div class="toast is-{toast.tone}" role={toast.tone === 'danger' ? 'alert' : 'status'}>
      <span>{toast.message}</span>
      <button type="button" aria-label={t('Dismiss notification')} onclick={() => toasts.dismiss(toast.id)}>×</button>
    </div>
  {/each}
</aside>

<style>
  .host {
    position: fixed;
    z-index: var(--rst-z-toast);
    right: 18px;
    bottom: calc(86px + env(safe-area-inset-bottom, 0px));
    width: min(390px, calc(100vw - 28px));
    display: grid;
    gap: 8px;
    pointer-events: none;
  }
  .toast {
    --toast-rgb: var(--rst-state-info-rgb);
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 14px;
    padding: 12px 14px;
    border: 1px solid rgba(var(--toast-rgb), .34);
    border-radius: var(--rst-ui-radius-lg);
    color: var(--rst-ui-text);
    background: color-mix(in srgb, var(--rst-ui-bg-2) 90%, rgb(var(--toast-rgb)));
    box-shadow: 0 14px 40px rgba(0, 0, 0, .32);
    font-size: var(--rst-fs-body);
    pointer-events: auto;
  }
  .toast.is-success { --toast-rgb: var(--rst-state-success-rgb); }
  .toast.is-warning { --toast-rgb: var(--rst-state-warning-rgb); }
  .toast.is-danger { --toast-rgb: var(--rst-state-danger-rgb); }
  button {
    width: 28px;
    height: 28px;
    border: 0;
    border-radius: var(--rst-ui-radius-round);
    color: var(--rst-ui-muted);
    background: transparent;
    font: inherit;
    font-size: var(--rst-fs-title-lg);
    cursor: pointer;
  }
  button:hover { color: var(--rst-ui-text); background: var(--rst-ui-surface-field-strong); }
  @media (max-width: 760px) {
    .host {
      right: 12px;
      bottom: calc(76px + env(safe-area-inset-bottom, 0px));
      width: calc(100vw - 24px);
    }
  }
</style>
