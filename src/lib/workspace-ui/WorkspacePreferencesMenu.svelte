<script lang="ts">
  import {
    Check,
    LayoutGrid,
    List,
    PanelLeft,
    PanelLeftClose,
    SlidersHorizontal,
    Volume2,
    VolumeX
  } from '@lucide/svelte';
  import { t } from '$lib/i18n/i18n.svelte';
  import { sound } from '$lib/sound/sound.svelte';
  import { workspaceTheme } from '$lib/ui/theme.svelte';
  import { workspaceLayout } from './workspace-layout.svelte';

  let {
    sidebarMode,
    onsidebarmode
  }: {
    sidebarMode: 'pinned' | 'auto';
    onsidebarmode: (mode: 'pinned' | 'auto') => void;
  } = $props();

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

      <fieldset>
        <legend>{t('Layout')}</legend>
        <div class="preferences__options">
          <button
            type="button"
            class:is-active={!workspaceLayout.cards}
            aria-pressed={!workspaceLayout.cards}
            onclick={() => workspaceLayout.set('rows')}
          >
            <List size={16} aria-hidden="true" />
            <span>{t('Rows')}</span>
            {#if !workspaceLayout.cards}<Check class="check" size={14} aria-hidden="true" />{/if}
          </button>
          <button
            type="button"
            class:is-active={workspaceLayout.cards}
            aria-pressed={workspaceLayout.cards}
            onclick={() => workspaceLayout.set('cards')}
          >
            <LayoutGrid size={16} aria-hidden="true" />
            <span>{t('Cards')}</span>
            {#if workspaceLayout.cards}<Check class="check" size={14} aria-hidden="true" />{/if}
          </button>
        </div>
      </fieldset>

      <fieldset>
        <legend>{t('Theme')}</legend>
        <div class="preferences__options">
          <button
            type="button"
            class:is-active={workspaceTheme.current === 'cobalt'}
            aria-pressed={workspaceTheme.current === 'cobalt'}
            onclick={() => workspaceTheme.set('cobalt')}
          >
            <i class="swatch is-cobalt" aria-hidden="true"></i>
            <span>{t('Blue')}</span>
            {#if workspaceTheme.current === 'cobalt'}<Check class="check" size={14} aria-hidden="true" />{/if}
          </button>
          <button
            type="button"
            class:is-active={workspaceTheme.current === 'tangerine'}
            aria-pressed={workspaceTheme.current === 'tangerine'}
            onclick={() => workspaceTheme.set('tangerine')}
          >
            <i class="swatch is-tangerine" aria-hidden="true"></i>
            <span>{t('Orange')}</span>
            {#if workspaceTheme.current === 'tangerine'}<Check class="check" size={14} aria-hidden="true" />{/if}
          </button>
        </div>
      </fieldset>

      <fieldset>
        <legend>{t('Sidebar')}</legend>
        <div class="preferences__options">
          <button
            type="button"
            class:is-active={sidebarMode === 'pinned'}
            aria-pressed={sidebarMode === 'pinned'}
            onclick={() => onsidebarmode('pinned')}
          >
            <PanelLeft size={16} aria-hidden="true" />
            <span>{t('Pinned')}</span>
            {#if sidebarMode === 'pinned'}<Check class="check" size={14} aria-hidden="true" />{/if}
          </button>
          <button
            type="button"
            class:is-active={sidebarMode === 'auto'}
            aria-pressed={sidebarMode === 'auto'}
            onclick={() => onsidebarmode('auto')}
          >
            <PanelLeftClose size={16} aria-hidden="true" />
            <span>{t('Auto-hide')}</span>
            {#if sidebarMode === 'auto'}<Check class="check" size={14} aria-hidden="true" />{/if}
          </button>
        </div>
      </fieldset>

      <button
        class="preferences__sound"
        type="button"
        role="switch"
        aria-checked={sound.enabled}
        onclick={() => sound.toggle()}
      >
        {#if sound.enabled}<Volume2 size={17} aria-hidden="true" />{:else}<VolumeX size={17} aria-hidden="true" />{/if}
        <span>{t('App sounds')}</span>
        <i class:is-on={sound.enabled} aria-hidden="true"><b></b></i>
      </button>
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
  .preferences__trigger:focus-visible,
  .preferences__menu button:focus-visible {
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
  fieldset {
    display: grid;
    gap: 7px;
    margin: 0;
    padding: 9px 12px 11px;
    border: 0;
    border-bottom: 1px solid var(--rst-ui-divider-soft);
  }
  legend {
    padding: 0;
    color: var(--rst-ui-muted);
    font-size: var(--rst-fs-caption);
    font-weight: var(--rst-fw-bold);
    text-transform: uppercase;
  }
  .preferences__options {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 6px;
  }
  .preferences__options button {
    min-width: 0;
    min-height: 36px;
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) 14px;
    align-items: center;
    gap: 7px;
    padding: 7px 8px;
    border: 1px solid var(--rst-ui-line);
    border-radius: var(--rst-ui-radius-sm);
    color: var(--rst-ui-text);
    background: var(--rst-ui-surface-field);
    font: inherit;
    font-size: var(--rst-fs-label);
    text-align: left;
    cursor: pointer;
  }
  .preferences__options button:hover,
  .preferences__options button.is-active {
    border-color: var(--rst-ui-action);
    background: var(--rst-state-selected-bg);
  }
  .preferences__options button > :global(svg:first-child) { color: var(--rst-ui-muted); }
  .preferences__options button.is-active > :global(svg:first-child),
  .preferences__options :global(svg.check) { color: var(--rst-ui-action); }
  .swatch {
    width: 14px;
    height: 14px;
    border: 2px solid #fff;
    border-radius: 50%;
    box-shadow: 0 0 0 1px var(--rst-ui-line-strong);
  }
  .swatch.is-cobalt { background: #315efb; }
  .swatch.is-tangerine { background: #ff5a1f; }
  .preferences__sound {
    width: 100%;
    min-height: 46px;
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto;
    align-items: center;
    gap: 8px;
    padding: 9px 13px;
    border: 0;
    color: var(--rst-ui-text);
    background: transparent;
    font: inherit;
    font-size: var(--rst-fs-label);
    text-align: left;
    cursor: pointer;
  }
  .preferences__sound:hover { background: var(--rst-ui-section-row-hover); }
  .preferences__sound > :global(svg) { color: var(--rst-ui-muted); }
  .preferences__sound > i {
    width: 30px;
    height: 18px;
    display: flex;
    align-items: center;
    padding: 2px;
    border-radius: 999px;
    background: var(--rst-ui-line-strong);
    transition: background .16s ease;
  }
  .preferences__sound > i b {
    width: 14px;
    height: 14px;
    border-radius: 50%;
    background: #fff;
    box-shadow: 0 1px 3px rgb(15 23 42 / .24);
    transition: transform .16s ease;
  }
  .preferences__sound > i.is-on { background: var(--rst-ui-action); }
  .preferences__sound > i.is-on b { transform: translateX(12px); }
</style>
