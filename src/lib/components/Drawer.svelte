<script lang="ts">
  import { tick } from 'svelte';
  import type { Snippet } from 'svelte';
  import { portal } from '$lib/actions/portal';
  import { t } from '$lib/i18n/i18n.svelte';

  // A slide-over variant of Dialog for entity detail/edit surfaces where a
  // centered modal feels too heavy (e.g. Team's employee editor) — same
  // focus-trap/escape/backdrop behavior, different container geometry.
  let {
    open,
    title,
    description = '',
    onclose,
    children,
    tabs,
    actions
  }: {
    open: boolean;
    title: string;
    description?: string;
    onclose: () => void;
    children: Snippet;
    tabs?: Snippet;
    actions?: Snippet;
  } = $props();
  let panelElement = $state<HTMLElement>();
  let returnFocus: HTMLElement | null = null;

  function handleKeydown(event: KeyboardEvent) {
    if (!open) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      onclose();
      return;
    }
    if (event.key !== 'Tab' || !panelElement) return;
    const focusable = Array.from(
      panelElement.querySelectorAll<HTMLElement>(
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
      panelElement
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
  <div class="drawer-backdrop" use:portal role="presentation" onclick={(event) => event.target === event.currentTarget && onclose()}>
    <div bind:this={panelElement} class="drawer" role="dialog" aria-modal="true" aria-labelledby="drawer-title">
      <header>
        <div>
          <h2 id="drawer-title">{t(title)}</h2>
          {#if description}<p>{t(description)}</p>{/if}
        </div>
        <button type="button" aria-label={t('Close panel')} onclick={onclose}>×</button>
      </header>
      {#if tabs}<div class="drawer-tabs">{@render tabs()}</div>{/if}
      <div class="drawer-body">{@render children()}</div>
      {#if actions}<footer>{@render actions()}</footer>{/if}
    </div>
  </div>
{/if}

<style>
  .drawer-backdrop {
    position: fixed;
    z-index: var(--rst-z-overlay);
    inset: 0;
    min-height: 100dvh;
    display: flex;
    justify-content: flex-end;
    background: var(--rst-overlay-bg);
    backdrop-filter: blur(3px);
    animation: rst-drawer-fade 0.18s ease backwards;
  }

  .drawer {
    position: relative;
    width: min(720px, 94vw);
    height: 100dvh;
    max-height: 100dvh;
    display: grid;
    grid-template-rows: auto auto minmax(0, 1fr) auto;
    overflow: hidden;
    background: var(--rst-ui-surface-panel);
    box-shadow: -24px 0 60px rgba(0, 0, 0, 0.32);
    animation: rst-drawer-in 0.24s cubic-bezier(0.16, 1, 0.3, 1) backwards;
  }

  @keyframes rst-drawer-fade {
    from { opacity: 0; }
    to { opacity: 1; }
  }

  @keyframes rst-drawer-in {
    from { transform: translateX(24px); opacity: 0; }
    to { transform: translateX(0); opacity: 1; }
  }

  header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 20px;
    padding: 18px 22px;
    border-bottom: 1px solid var(--rst-ui-divider-soft);
    background: var(--rst-ui-surface-panel-head);
  }

  h2, p { margin: 0; }
  h2 { font-size: 20px; }
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

  .drawer-tabs {
    padding: 0 22px;
    border-bottom: 1px solid var(--rst-ui-divider-soft);
    background: var(--rst-ui-surface-panel-head);
  }

  .drawer-body {
    min-height: 0;
    overflow: auto;
    padding: 18px 22px;
  }

  footer {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    padding: 12px 22px;
    padding-bottom: max(12px, env(safe-area-inset-bottom));
    border-top: 1px solid var(--rst-ui-divider-soft);
    background: var(--rst-ui-surface-panel-head);
  }

  @media (max-width: 760px) {
    .drawer {
      width: 100%;
    }
  }
</style>
