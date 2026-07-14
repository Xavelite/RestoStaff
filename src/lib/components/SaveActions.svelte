<script lang="ts">
  import ActionButton from './ActionButton.svelte';
  import { t } from '$lib/i18n/i18n.svelte';

  let {
    dirty,
    busy = false,
    saveLabel = 'Save changes',
    busyLabel = 'Saving…',
    embedded = false,
    showCleanActions = true,
    oncancel,
    onsave
  }: {
    dirty: boolean;
    busy?: boolean;
    saveLabel?: string;
    busyLabel?: string;
    embedded?: boolean;
    showCleanActions?: boolean;
    oncancel: () => void;
    onsave: () => void;
  } = $props();
</script>

<div class="save-actions" class:is-embedded={embedded} aria-label={t('Workspace changes')}>
  <span aria-live="polite">{dirty ? t('Unsaved changes') : t('All changes saved')}</span>
  {#if dirty || busy || showCleanActions}
    <div class="save-actions__buttons">
      <ActionButton label={t('Cancel changes')} disabled={!dirty || busy} onclick={oncancel} />
      <ActionButton
        label={t(busy ? busyLabel : saveLabel)}
        tone="primary"
        disabled={!dirty || busy}
        onclick={onsave}
      />
    </div>
  {/if}
</div>

<style>
  .save-actions {
    min-height: 44px;
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 10px;
    padding: 4px;
    border: 1px solid var(--rst-ui-line);
    border-radius: var(--rst-ui-radius-lg);
    background: var(--rst-ui-surface-panel);
  }

  .save-actions.is-embedded {
    min-height: 0;
    padding: 0;
    border: 0;
    border-radius: 0;
    background: transparent;
  }

  span {
    padding-left: 7px;
    color: var(--rst-ui-muted);
    font-size: 11px;
    white-space: nowrap;
  }

  .save-actions__buttons {
    display: flex;
    gap: 6px;
  }

  @media (max-width: 520px) {
    .save-actions {
      align-items: stretch;
      flex-direction: column;
    }

    span {
      padding-left: 0;
    }

    .save-actions__buttons {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }
</style>
