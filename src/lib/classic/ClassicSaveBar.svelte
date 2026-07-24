<script lang="ts">
  import { t } from '$lib/i18n/i18n.svelte';

  /**
   * A contextual save affordance. It exists only while there are unsaved
   * changes, so no page carries a dedicated toolbar line for a Save button that
   * has nothing to do. Sticks just below the top bar so it stays reachable down
   * a long table.
   */
  let {
    dirty,
    saving = false,
    canSave = true,
    onsave,
    ondiscard
  }: {
    dirty: boolean;
    saving?: boolean;
    canSave?: boolean;
    onsave: () => void;
    ondiscard: () => void;
  } = $props();
</script>

{#if dirty}
  <div class="cl-savebar" role="status" aria-live="polite">
    <span class="cl-savebar__label">
      <span class="cl-savebar__dot" aria-hidden="true"></span>{t('Unsaved changes')}
    </span>
    <div class="cl-savebar__actions">
      <button
        class="cl-btn is-icon"
        type="button"
        disabled={saving}
        title={t('Discard')}
        aria-label={t('Discard')}
        onclick={ondiscard}
      ><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 12a8 8 0 1 0 2.3-5.7L4 8.6"/><path d="M4 4v4.6h4.6"/></svg></button>
      <button
        class="cl-btn is-primary"
        type="button"
        disabled={saving || !canSave}
        onclick={onsave}
      >{#if saving}<span aria-hidden="true">…</span>{:else}<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" aria-hidden="true"><path d="M5 4h12l2 2v14H5z"/><path d="M8 4v6h8V4M8 20v-6h8v6"/></svg>{/if}<span>{t(saving ? 'Saving…' : 'Save')}</span></button>
    </div>
  </div>
{/if}
