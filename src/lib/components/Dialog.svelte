<script lang="ts">
  import { X } from '@lucide/svelte';
  import { tick } from 'svelte';
  import type { Snippet } from 'svelte';
  import { portal } from '$lib/actions/portal';
  import { t } from '$lib/i18n/i18n.svelte';

  let {
    open,
    title,
    description = '',
    size = 'medium',
    flush = false,
    onclose,
    children,
    footer
  }: {
    open: boolean;
    title: string;
    description?: string;
    size?: 'small' | 'medium' | 'large';
    /** Lets structured workplace editors own their internal section spacing. */
    flush?: boolean;
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
    let focusFrame = 0;
    const previousDocumentOverflow = document.documentElement.style.overflow;
    const previousBodyOverflow = document.body.style.overflow;
    document.documentElement.style.overflow = 'hidden';
    document.body.style.overflow = 'hidden';
    returnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    void tick().then(async () => {
      await tick();
      if (cancelled) return;
      focusFrame = requestAnimationFrame(() => {
        focusFrame = requestAnimationFrame(() => {
          if (cancelled) return;
          dialogElement
            ?.querySelector<HTMLElement>(
              '.body input:not([disabled]), .body select:not([disabled]), .body textarea:not([disabled]), footer button:not([disabled]), header button:not([disabled]), .body button:not([disabled]), a[href]'
            )
            ?.focus();
        });
      });
    });
    return () => {
      cancelled = true;
      cancelAnimationFrame(focusFrame);
      document.documentElement.style.overflow = previousDocumentOverflow;
      document.body.style.overflow = previousBodyOverflow;
      returnFocus?.focus();
      returnFocus = null;
    };
  });
</script>

<svelte:window onkeydown={handleKeydown} />

{#if open}
  <div class="backdrop" use:portal role="presentation" onclick={(event) => event.target === event.currentTarget && onclose()}>
    <dialog bind:this={dialogElement} class="dialog is-{size}" class:is-flush={flush} open aria-modal="true" aria-labelledby="dialog-title">
      <header>
        <div>
          <h2 id="dialog-title">{t(title)}</h2>
          {#if description}<p>{t(description)}</p>{/if}
        </div>
        <button type="button" aria-label={t('Close dialog')} title={t('Close dialog')} onclick={onclose}>
          <X size={18} strokeWidth={1.8} aria-hidden="true" />
        </button>
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
    padding: max(16px, env(safe-area-inset-top)) max(16px, env(safe-area-inset-right))
      max(16px, env(safe-area-inset-bottom)) max(16px, env(safe-area-inset-left));
    background: var(--rst-overlay-bg);
    background: color-mix(in srgb, var(--rst-overlay-bg) 92%, transparent);
    backdrop-filter: blur(4px);
    animation: rst-dialog-backdrop-in 160ms ease-out backwards;
  }
  .dialog {
    position: static;
    margin: 0;
    padding: 0;
    width: min(100%, 620px);
    max-height: min(90dvh, 900px);
    display: grid;
    grid-template-rows: auto minmax(0, 1fr) auto;
    overflow: hidden;
    border: 1px solid var(--cl-line-strong, var(--rst-ui-line-strong));
    border-radius: 8px;
    background: var(--cl-surface, var(--rst-ui-surface-panel));
    box-shadow: 0 30px 80px rgb(15 23 42 / .28), 0 3px 12px rgb(15 23 42 / .12);
    animation: rst-dialog-in 190ms cubic-bezier(.16, 1, .3, 1) backwards;
  }
  .dialog.is-small { width: min(100%, 440px); }
  .dialog.is-large { width: min(100%, 1040px); }
  header {
    min-height: 64px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 20px;
    padding: 16px 20px;
    border-bottom: 1px solid var(--cl-line, var(--rst-ui-divider-soft));
    background: var(--cl-surface, var(--rst-ui-surface-panel));
  }
  h2, p { margin: 0; }
  h2 {
    color: var(--cl-ink, var(--rst-ui-text));
    font-size: var(--rst-fs-title);
    font-weight: var(--rst-fw-display);
    line-height: 1.2;
  }
  p {
    margin-top: 4px;
    color: var(--cl-muted, var(--rst-ui-muted));
    font-size: var(--rst-fs-control);
    line-height: 1.4;
  }
  header button {
    width: 32px;
    height: 32px;
    flex: 0 0 auto;
    display: grid;
    place-items: center;
    padding: 0;
    border: 0;
    border-radius: 6px;
    color: var(--cl-muted, var(--rst-ui-text));
    background: transparent;
    font: inherit;
    cursor: pointer;
  }
  header button:hover {
    color: var(--cl-ink, var(--rst-ui-text));
    background: var(--cl-surface-muted, var(--rst-ui-hover-bg));
  }
  header button:focus-visible {
    border-color: var(--cl-accent, var(--rst-ui-action));
    outline: 2px solid color-mix(in srgb, var(--cl-accent, var(--rst-ui-action)) 18%, transparent);
    outline-offset: 1px;
  }
  .body {
    min-height: 0;
    overflow: auto;
    overscroll-behavior: contain;
    padding: 20px;
    scrollbar-gutter: stable;
  }
  .dialog.is-flush .body { padding: 0; }
  footer {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    padding: 12px 20px;
    padding-bottom: max(12px, env(safe-area-inset-bottom));
    border-top: 1px solid var(--cl-line, var(--rst-ui-divider-soft));
    background: var(--cl-surface, var(--rst-ui-surface-panel));
  }
  @keyframes rst-dialog-backdrop-in {
    from { opacity: 0; }
    to { opacity: 1; }
  }
  @keyframes rst-dialog-in {
    from { opacity: 0; transform: translateY(8px) scale(.985); }
    to { opacity: 1; transform: none; }
  }
  @media (max-width: 760px) {
    .backdrop {
      place-items: end center;
      padding: max(12px, env(safe-area-inset-top)) 0 0;
    }
    .dialog,
    .dialog.is-small,
    .dialog.is-large {
      width: 100%;
      max-height: calc(100dvh - max(12px, env(safe-area-inset-top)));
      border-right: 0;
      border-bottom: 0;
      border-left: 0;
      border-radius: 8px 8px 0 0;
    }
    header { padding: 14px 16px; }
    .body { padding: 16px; scrollbar-gutter: auto; }
    footer { padding-inline: 16px; }
  }
</style>
