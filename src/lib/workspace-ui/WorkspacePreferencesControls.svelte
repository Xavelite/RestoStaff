<script lang="ts">
  import { onMount } from 'svelte';
  import {
    Check,
    LayoutGrid,
    List,
    Monitor,
    Moon,
    PanelLeft,
    PanelLeftClose,
    Sun,
    Volume2,
    VolumeX
  } from '@lucide/svelte';
  import { t } from '$lib/i18n/i18n.svelte';
  import { sound } from '$lib/sound/sound.svelte';
  import { workspaceTheme } from '$lib/ui/theme.svelte';
  import { workspaceLayout } from './workspace-layout.svelte';
  import { workspaceShellPreferences } from './workspace-shell-preferences.svelte';

  onMount(() => workspaceShellPreferences.init());
</script>

<div class="preference-controls">
  <fieldset>
    <legend>{t('Layout')}</legend>
    <div class="preference-options">
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
    <div class="preference-options is-theme">
      <button
        type="button"
        disabled
        aria-disabled="true"
        aria-label={`${t('Light')} · ${t('Coming soon')}`}
        title={t('Coming soon')}
      >
        <Sun size={16} aria-hidden="true" />
        <span>{t('Light')}</span>
        <i class="theme-soon" aria-hidden="true"></i>
      </button>
      <button
        type="button"
        class:is-active={workspaceTheme.current === 'classic'}
        aria-pressed={workspaceTheme.current === 'classic'}
        onclick={() => workspaceTheme.set('classic')}
      >
        <Monitor size={16} aria-hidden="true" />
        <span>{t('Classic')}</span>
        {#if workspaceTheme.current === 'classic'}<Check class="check" size={14} aria-hidden="true" />{/if}
      </button>
      <button
        type="button"
        disabled
        aria-disabled="true"
        aria-label={`${t('Dark')} · ${t('Coming soon')}`}
        title={t('Coming soon')}
      >
        <Moon size={16} aria-hidden="true" />
        <span>{t('Dark')}</span>
        <i class="theme-soon" aria-hidden="true"></i>
      </button>
    </div>
  </fieldset>

  <fieldset>
    <legend>{t('Sidebar')}</legend>
    <div class="preference-options">
      <button
        type="button"
        class:is-active={workspaceShellPreferences.sidebarMode === 'pinned'}
        aria-pressed={workspaceShellPreferences.sidebarMode === 'pinned'}
        onclick={() => workspaceShellPreferences.setSidebarMode('pinned')}
      >
        <PanelLeft size={16} aria-hidden="true" />
        <span>{t('Pinned')}</span>
        {#if workspaceShellPreferences.sidebarMode === 'pinned'}<Check class="check" size={14} aria-hidden="true" />{/if}
      </button>
      <button
        type="button"
        class:is-active={workspaceShellPreferences.sidebarMode === 'auto'}
        aria-pressed={workspaceShellPreferences.sidebarMode === 'auto'}
        onclick={() => workspaceShellPreferences.setSidebarMode('auto')}
      >
        <PanelLeftClose size={16} aria-hidden="true" />
        <span>{t('Auto-hide')}</span>
        {#if workspaceShellPreferences.sidebarMode === 'auto'}<Check class="check" size={14} aria-hidden="true" />{/if}
      </button>
    </div>
  </fieldset>

  <button
    class="preference-sound"
    type="button"
    role="switch"
    aria-checked={sound.enabled}
    onclick={() => sound.toggle()}
  >
    {#if sound.enabled}<Volume2 size={17} aria-hidden="true" />{:else}<VolumeX size={17} aria-hidden="true" />{/if}
    <span>{t('App sounds')}</span>
    <i class:is-on={sound.enabled} aria-hidden="true"><b></b></i>
  </button>
</div>

<style>
  .preference-controls { display: grid; }
  fieldset {
    display: grid;
    gap: 7px;
    margin: 0;
    padding: 10px 12px 12px;
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
  .preference-options {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 6px;
  }
  .preference-options.is-theme { grid-template-columns: repeat(3, minmax(0, 1fr)); }
  .preference-options button {
    min-width: 0;
    min-height: 38px;
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) 14px;
    align-items: center;
    gap: 7px;
    padding: 7px 9px;
    border: 1px solid var(--rst-ui-line);
    border-radius: var(--rst-ui-radius-sm);
    color: var(--rst-ui-text);
    background: var(--rst-ui-surface-field);
    font: inherit;
    font-size: var(--rst-fs-label);
    text-align: left;
    cursor: pointer;
  }
  .preference-options button:hover,
  .preference-options button.is-active {
    border-color: var(--rst-ui-action);
    background: var(--rst-state-selected-bg);
  }
  .preference-options button:disabled {
    color: var(--rst-ui-muted);
    background: var(--rst-ui-surface-field);
    opacity: .62;
    cursor: not-allowed;
  }
  .preference-options button:disabled:hover { border-color: var(--rst-ui-line); }
  .preference-options button > :global(svg:first-child) { color: var(--rst-ui-muted); }
  .preference-options button.is-active > :global(svg:first-child),
  .preference-options :global(svg.check) { color: var(--rst-ui-action); }
  .preference-options button:focus-visible,
  .preference-sound:focus-visible {
    outline: 2px solid color-mix(in srgb, var(--cl-accent) 55%, transparent);
    outline-offset: 2px;
  }
  .theme-soon {
    width: 5px;
    height: 5px;
    justify-self: center;
    border-radius: 50%;
    background: var(--rst-ui-line-strong);
  }
  .preference-sound {
    width: 100%;
    min-height: 48px;
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
  .preference-sound:hover { background: var(--rst-ui-section-row-hover); }
  .preference-sound > :global(svg) { color: var(--rst-ui-muted); }
  .preference-sound > i {
    width: 30px;
    height: 18px;
    display: flex;
    align-items: center;
    padding: 2px;
    border-radius: 999px;
    background: var(--rst-ui-line-strong);
    transition: background .16s ease;
  }
  .preference-sound > i b {
    width: 14px;
    height: 14px;
    border-radius: 50%;
    background: #fff;
    box-shadow: 0 1px 3px rgb(15 23 42 / .24);
    transition: transform .16s ease;
  }
  .preference-sound > i.is-on { background: var(--rst-ui-action); }
  .preference-sound > i.is-on b { transform: translateX(12px); }
</style>
