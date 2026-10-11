<script lang="ts">
  import { RotateCcw, Save } from '@lucide/svelte';
  import { t } from '$lib/i18n/i18n.svelte';

  let {
    visible,
    status = '',
    primaryLabel = 'Save',
    busyLabel = 'Saving…',
    saving = false,
    canSubmit = true,
    ondiscard,
    onsubmit
  }: {
    visible: boolean;
    status?: string;
    primaryLabel?: string;
    busyLabel?: string;
    saving?: boolean;
    canSubmit?: boolean;
    ondiscard: () => void;
    onsubmit: () => void;
  } = $props();

  const statusLabel = $derived(status || t('Unsaved changes'));
</script>

{#if visible}
  <div class="mobile-action-dock__space" aria-hidden="true"></div>
  <section class="mobile-action-dock" aria-label={t('Pending changes')}>
    <span class="mobile-action-dock__status"><i></i>{statusLabel}</span>
    <div class="mobile-action-dock__buttons">
      <button class="cl-btn" type="button" disabled={saving} onclick={ondiscard}>
        <RotateCcw size={15} aria-hidden="true" />
        <span>{t('Discard')}</span>
      </button>
      <button class="cl-btn is-primary" type="button" disabled={saving || !canSubmit} onclick={onsubmit}>
        <Save size={15} aria-hidden="true" />
        <span>{t(saving ? busyLabel : primaryLabel)}</span>
      </button>
    </div>
  </section>
{/if}

<style>
  .mobile-action-dock,
  .mobile-action-dock__space {
    display: none;
  }

  @media (max-width: 760px) {
    .mobile-action-dock__space {
      display: block;
      height: 94px;
    }

    .mobile-action-dock {
      position: fixed;
      z-index: var(--rst-z-panel);
      right: 14px;
      bottom: calc(70px + env(safe-area-inset-bottom, 0px));
      left: 14px;
      display: grid;
      grid-template-columns: minmax(70px, 1fr) auto;
      gap: 10px;
      align-items: center;
      min-height: 60px;
      padding: 9px 10px;
      border: 1px solid var(--cl-line-strong);
      border-radius: var(--cl-radius);
      background: color-mix(in srgb, var(--cl-surface) 95%, transparent);
      box-shadow: 0 14px 34px rgba(15, 23, 42, .16);
      backdrop-filter: blur(14px);
    }

    .mobile-action-dock__status {
      min-width: 0;
      display: flex;
      align-items: center;
      gap: 7px;
      overflow: hidden;
      color: var(--cl-muted);
      font-size: var(--rst-fs-label);
      font-weight: var(--rst-fw-bold);
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .mobile-action-dock__status i {
      width: 7px;
      height: 7px;
      flex: 0 0 auto;
      border-radius: 50%;
      background: var(--cl-accent);
    }

    .mobile-action-dock__buttons {
      display: flex;
      gap: 6px;
    }

    .mobile-action-dock :global(.cl-btn) {
      min-height: 40px;
    }
  }

  @media (max-width: 520px) {
    .mobile-action-dock {
      right: 10px;
      left: 10px;
      gap: 7px;
      padding-inline: 8px;
    }

    .mobile-action-dock :global(.cl-btn) {
      gap: 5px;
      padding-inline: 9px;
    }
  }
</style>
