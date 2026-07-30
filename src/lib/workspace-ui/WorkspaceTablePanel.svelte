<script lang="ts">
  import type { Snippet } from 'svelte';
  import { t } from '$lib/i18n/i18n.svelte';

  let {
    meta,
    actions,
    children,
    dirty = false,
    saving = false,
    canSave = true,
    onsave,
    ondiscard
  }: {
    meta?: Snippet;
    actions?: Snippet;
    children: Snippet;
    dirty?: boolean;
    saving?: boolean;
    canSave?: boolean;
    onsave?: () => void;
    ondiscard?: () => void;
  } = $props();

  const hasSaveContract = $derived(Boolean(onsave && ondiscard));
</script>

<section class="cl-tablepanel">
  <div class="cl-tablepanel__head">
    <div class="cl-tablepanel__meta">
      {#if meta}{@render meta()}{/if}
    </div>
    <div class="cl-tablepanel__actions">
      {#if hasSaveContract}
        <span class="cl-inline-save" class:is-visible={dirty} aria-hidden={!dirty}>
          <span class="cl-inline-save__state"><i></i>{t('Unsaved changes')}</span>
          <button class="cl-btn is-icon" type="button" disabled={!dirty || saving} title={t('Discard')} aria-label={t('Discard')} onclick={ondiscard}>
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 12a8 8 0 1 0 2.3-5.7L4 8.6"/><path d="M4 4v4.6h4.6"/></svg>
          </button>
          <button class="cl-btn is-primary" type="button" disabled={!dirty || saving || !canSave} onclick={onsave}>
            {#if saving}<span aria-hidden="true">…</span>{:else}<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" aria-hidden="true"><path d="M5 4h12l2 2v14H5z"/><path d="M8 4v6h8V4M8 20v-6h8v6"/></svg>{/if}
            <span>{t(saving ? 'Saving…' : 'Save')}</span>
          </button>
        </span>
      {/if}
      {#if actions}{@render actions()}{/if}
    </div>
  </div>
  {@render children()}
</section>
