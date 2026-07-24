<script lang="ts">
  import ActionButton from '$lib/components/ActionButton.svelte';
  import Dialog from '$lib/components/Dialog.svelte';
  import { t } from '$lib/i18n/i18n.svelte';
  import { unsavedChanges } from './unsaved-changes.svelte';

  const labels = $derived(
    [...new Set(unsavedChanges.dirtySources.map((source) => t(source.label)))].join(', ')
  );
</script>

{#if unsavedChanges.open}
  <Dialog
    open
    size="small"
    title="Save changes before leaving?"
    description="You have unsaved work on this page."
    onclose={() => unsavedChanges.stay()}
  >
    <div class="leave-copy">
      {#if labels}<p>{t('Unsaved sections')}: <strong>{labels}</strong></p>{/if}
      <p>{t('Save keeps your changes. Discard restores the last saved version. Stay returns to editing.')}</p>
      {#if unsavedChanges.error}<p class="leave-error" role="alert">{unsavedChanges.error}</p>{/if}
    </div>

    {#snippet footer()}
      <ActionButton label="Stay" disabled={unsavedChanges.busy} onclick={() => unsavedChanges.stay()} />
      <ActionButton label="Discard" tone="danger" disabled={unsavedChanges.busy} onclick={() => void unsavedChanges.discardAndContinue()} />
      <ActionButton label={unsavedChanges.busy ? 'Saving…' : 'Save and leave'} tone="primary" disabled={unsavedChanges.busy} onclick={() => void unsavedChanges.saveAndContinue()} />
    {/snippet}
  </Dialog>
{/if}

<style>
  .leave-copy { display: grid; gap: 8px; }
  .leave-copy p { margin: 0; color: var(--rst-ui-muted); font-size: 13px; line-height: 1.5; }
  .leave-copy strong { color: var(--rst-ui-text); }
  .leave-error { padding: 9px 10px; border: 1px solid var(--rst-state-danger-border); border-radius: var(--rst-ui-radius-md); color: var(--rst-state-danger-text) !important; background: var(--rst-state-danger-bg); }
</style>
