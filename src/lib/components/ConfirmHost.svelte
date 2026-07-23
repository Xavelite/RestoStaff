<script lang="ts">
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
    {#if request.body}
      <p class="confirm-body">{t(request.body)}</p>
    {/if}

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
  .confirm-body {
    margin: 0;
    color: var(--rst-ui-muted);
    font-size: 13px;
    line-height: 1.5;
  }
</style>
