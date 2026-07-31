<script lang="ts">
  import { SlidersHorizontal } from '@lucide/svelte';
  import { t } from '$lib/i18n/i18n.svelte';
  import WorkspacePreferencesControls from './WorkspacePreferencesControls.svelte';

  let open = $state(false);
  let root = $state<HTMLElement | null>(null);

  $effect(() => {
    if (!open) return;
    const closeOutside = (event: PointerEvent) => {
      if (root && !root.contains(event.target as Node)) open = false;
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') open = false;
    };
    window.addEventListener('pointerdown', closeOutside, true);
    window.addEventListener('keydown', closeOnEscape);
    return () => {
      window.removeEventListener('pointerdown', closeOutside, true);
      window.removeEventListener('keydown', closeOnEscape);
    };
  });
</script>

<div class="preferences" bind:this={root}>
  <button
    class="preferences__trigger"
    class:is-open={open}
    type="button"
    aria-label={t('Workspace layout')}
    title={t('Workspace layout')}
    aria-expanded={open}
    onclick={() => (open = !open)}
  >
    <SlidersHorizontal size={17} strokeWidth={1.8} aria-hidden="true" />
  </button>

  {#if open}
    <section class="preferences__menu" aria-label={t('Workspace layout')}>
      <header>
        <SlidersHorizontal size={16} strokeWidth={1.8} aria-hidden="true" />
        <strong>{t('Workspace layout')}</strong>
      </header>
      <WorkspacePreferencesControls />
    </section>
  {/if}
</div>

<style>
  .preferences { position: relative; flex: none; }
  .preferences__trigger {
    width: 34px;
    height: 34px;
    display: grid;
    place-items: center;
    padding: 0;
    border: 1px solid var(--rst-topbar-line, transparent);
    border-radius: var(--rst-ui-radius-round);
    color: var(--rst-topbar-text, var(--rst-ui-text));
    background: var(--rst-topbar-control-bg, transparent);
    cursor: pointer;
    transition: background .16s ease, color .16s ease, border-color .16s ease;
  }
  .preferences__trigger:hover,
  .preferences__trigger.is-open { background: var(--rst-topbar-control-hover, var(--rst-ui-hover-bg)); }
  .preferences__trigger:focus-visible {
    outline: 2px solid color-mix(in srgb, var(--cl-accent) 55%, transparent);
    outline-offset: 2px;
  }
  .preferences__menu {
    position: absolute;
    z-index: var(--rst-z-menu);
    top: calc(100% + 9px);
    right: 0;
    width: min(326px, calc(100vw - 24px));
    overflow: hidden;
    border: 1px solid var(--rst-ui-line-strong);
    border-radius: var(--rst-ui-radius-lg);
    color: var(--rst-ui-text);
    background: var(--rst-ui-bg-2);
    box-shadow: 0 16px 42px rgb(15 23 42 / .16);
    transform-origin: top right;
    animation: preferences-in .16s var(--rst-ease-out) backwards;
  }
  @keyframes preferences-in {
    from { opacity: 0; transform: scale(.96) translateY(-3px); }
  }
  .preferences__menu header {
    display: flex;
    align-items: center;
    gap: 8px;
    min-height: 45px;
    padding: 10px 13px;
    border-bottom: 1px solid var(--rst-ui-divider-soft);
  }
  .preferences__menu header :global(svg) { color: var(--rst-ui-action); }
  .preferences__menu header strong { font-size: var(--rst-fs-control); }
</style>
