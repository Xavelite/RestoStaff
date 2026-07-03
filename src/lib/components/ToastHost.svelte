<script lang="ts">
  import { toasts } from '$lib/ui/toast.svelte';
</script>

<aside class="host" aria-label="Notifications">
  {#each toasts.messages as toast (toast.id)}
    <div class="toast is-{toast.tone}" role={toast.tone === 'danger' ? 'alert' : 'status'}>
      <span>{toast.message}</span>
      <button type="button" aria-label="Dismiss notification" onclick={() => toasts.dismiss(toast.id)}>×</button>
    </div>
  {/each}
</aside>

<style>
  .host {
    position: fixed;
    z-index: var(--rst-z-toast);
    right: 18px;
    bottom: 18px;
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
    font-size: 13px;
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
    font-size: 20px;
    cursor: pointer;
  }
  button:hover { color: var(--rst-ui-text); background: var(--rst-ui-surface-field-strong); }
</style>
