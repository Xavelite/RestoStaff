<script lang="ts">
  import { AlertTriangle, HelpCircle } from '@lucide/svelte';
  import ActionButton from '$lib/components/ActionButton.svelte';
  import Dialog from '$lib/components/Dialog.svelte';
  import { t } from '$lib/i18n/i18n.svelte';
  import { confirmer } from '$lib/ui/confirm.svelte';

  // Mounted once in the app shell, beside ToastHost. Renders whatever question
  // confirmAction() is currently waiting on; Escape and the backdrop both count
  // as declining, so a destructive action never proceeds by accident.
</script>

{#if confirmer.pending}
  {@const request = confirmer.pending}
  <Dialog
    open
    size="small"
    title={request.title}
    onclose={() => confirmer.dismiss()}
  >
    <div class="confirm-message" class:is-danger={(request.tone ?? 'danger') === 'danger'}>
      <span class="confirm-icon" aria-hidden="true">
        {#if (request.tone ?? 'danger') === 'danger'}
          <AlertTriangle size={19} />
        {:else}
          <HelpCircle size={19} />
        {/if}
      </span>
      <div>
        <strong>{t((request.tone ?? 'danger') === 'danger' ? 'This action needs confirmation' : 'Confirm this action')}</strong>
        {#if request.body}<p class="confirm-body">{t(request.body)}</p>{/if}
      </div>
    </div>

    {#snippet footer()}
      <ActionButton label={request.cancelLabel ?? 'Cancel'} onclick={() => confirmer.dismiss()} />
      <ActionButton
        label={request.confirmLabel ?? 'Confirm'}
        tone={request.tone ?? 'danger'}
        onclick={() => confirmer.accept()}
      />
    {/snippet}
  </Dialog>
{/if}

<style>
  .confirm-message {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr);
    align-items: start;
    gap: 12px;
  }
  .confirm-icon {
    width: 38px;
    height: 38px;
    display: grid;
    place-items: center;
    border-radius: 7px;
    color: var(--rst-ui-action);
    background: rgba(var(--rst-ui-action-rgb), .1);
  }
  .confirm-message.is-danger .confirm-icon {
    color: var(--rst-state-danger-text);
    background: var(--rst-state-danger-bg);
  }
  .confirm-message strong {
    color: var(--rst-ui-text);
    font-size: 13px;
  }
  .confirm-body {
    margin: 4px 0 0;
    color: var(--rst-ui-muted);
    font-size: 12.5px;
    line-height: 1.55;
  }
</style>
