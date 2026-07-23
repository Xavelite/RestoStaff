<script lang="ts">
  import { tick } from 'svelte';
  import type { Snippet } from 'svelte';
  import { portal } from '$lib/actions/portal';
  import { t } from '$lib/i18n/i18n.svelte';

  let {
    open,
    title,
    description = '',
    size = 'medium',
    onclose,
    children,
    footer
  }: {
    open: boolean;
    title: string;
    description?: string;
    size?: 'small' | 'medium' | 'large';
    onclose: () => void;
    children: Snippet;
    footer?: Snippet;
  } = $props();
  let dialogElement = $state<HTMLDialogElement>();
  let returnFocus: HTMLElement | null = null;

  function handleKeydown(event: KeyboardEvent) {
    if (!open) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      onclose();
      return;
    }
    if (event.key !== 'Tab' || !dialogElement) return;
    const focusable = Array.from(
      dialogElement.querySelectorAll<HTMLElement>(
        'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
      )
    ).filter((element) => !element.hasAttribute('hidden'));
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  $effect(() => {
    if (!open) return;
    let cancelled = false;
    returnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    void tick().then(() => {
      if (cancelled) return;
      dialogElement
        ?.querySelector<HTMLElement>(
          'input:not([disabled]), select:not([disabled]), textarea:not([disabled]), button:not([disabled]), a[href]'
        )
        ?.focus();
    });
    return () => {
      cancelled = true;
      returnFocus?.focus();
      returnFocus = null;
    };
  });
</script>

<svelte:window onkeydown={handleKeydown} />

{#if open}
  <div class="backdrop" use:portal role="presentation" onclick={(event) => event.target === event.currentTarget && onclose()}>
    <dialog bind:this={dialogElement} class="dialog is-{size}" open aria-modal="true" aria-labelledby="dialog-title">
      <header>
        <div>
          <h2 id="dialog-title">{t(title)}</h2>
          {#if description}<p>{t(description)}</p>{/if}
        </div>
        <button type="button" data-tour="dialog-close" aria-label={t('Close dialog')} onclick={onclose}>×</button>
      </header>
      <div class="body">{@render children()}</div>
      {#if footer}<footer>{@render footer()}</footer>{/if}
    </dialog>
  </div>
{/if}

<style>
  .backdrop {
    position: fixed;
    z-index: var(--rst-z-overlay);
    inset: 0;
    display: grid;
    place-items: center;
    padding: 20px;
    background: var(--rst-overlay-bg);
    backdrop-filter: blur(5px);
  }
  .dialog {
    position: static;
    margin: 0;
    padding: 0;
    width: min(100%, 620px);
    max-height: min(88vh, 900px);
    overflow: auto;
    border: 1px solid var(--rst-ui-line-strong);
    border-radius: var(--rst-ui-radius-xl);
    background: var(--rst-ui-surface-panel);
  }
  .dialog.is-small { width: min(100%, 440px); }
  .dialog.is-large { width: min(100%, 1040px); }
  header {
    position: sticky;
    top: 0;
    z-index: 1;
    min-height: 64px;
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 20px;
    padding: 14px 16px;
    border-bottom: 1px solid var(--rst-ui-divider-soft);
    background: var(--rst-ui-surface-panel-head);
  }
  h2, p { margin: 0; }
  h2 { font-size: 18px; }
  p { margin-top: 4px; color: var(--rst-ui-muted); font-size: 12px; }
  header button {
    width: 34px;
    height: 34px;
    flex: 0 0 auto;
    border: 1px solid var(--rst-ui-line);
    border-radius: var(--rst-ui-radius-md);
    color: var(--rst-ui-text);
    background: transparent;
    font: inherit;
    font-size: 22px;
    cursor: pointer;
  }
  .body { padding: 16px; }
  footer {
    position: sticky;
    bottom: 0;
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    padding: 12px 16px;
    border-top: 1px solid var(--rst-ui-divider-soft);
    background: var(--rst-ui-surface-panel-head);
  }
</style>
