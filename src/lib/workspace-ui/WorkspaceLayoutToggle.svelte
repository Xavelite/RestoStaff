<script lang="ts">
  import { t } from '$lib/i18n/i18n.svelte';
  import { workspaceLayout } from './workspace-layout.svelte';

  // A view mode is flipped, not configured, so it lives one click from the work
  // rather than inside the account menu.
  const label = $derived(workspaceLayout.cards ? t('Rows') : t('Cards'));
</script>

<button
  class="layout-toggle"
  type="button"
  aria-label={`${t('Layout')}: ${label}`}
  title={`${t('Layout')}: ${label}`}
  aria-pressed={workspaceLayout.cards}
  onclick={() => workspaceLayout.set(workspaceLayout.cards ? 'rows' : 'cards')}
>
  {#if workspaceLayout.cards}
    <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path d="M4 6h16M4 12h16M4 18h16" />
    </svg>
  {:else}
    <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <rect x="4" y="4" width="7" height="7" rx="1.6" />
      <rect x="13" y="4" width="7" height="7" rx="1.6" />
      <rect x="4" y="13" width="7" height="7" rx="1.6" />
      <rect x="13" y="13" width="7" height="7" rx="1.6" />
    </svg>
  {/if}
</button>

<style>
  /* Same circular chrome as the other topbar controls, so it reads as one family. */
  .layout-toggle {
    flex: none;
    width: 34px;
    height: 34px;
    display: grid;
    place-items: center;
    padding: 0;
    border: 1px solid var(--rst-topbar-line, transparent);
    border-radius: var(--rst-ui-radius-round, 50%);
    color: var(--rst-topbar-text, var(--rst-ui-text));
    background: var(--rst-topbar-control-bg, transparent);
    cursor: pointer;
    transition: background .16s ease, color .16s ease, border-color .16s ease;
  }

  .layout-toggle:hover {
    color: var(--rst-topbar-text, var(--rst-ui-text));
    background: var(--rst-topbar-control-hover, var(--rst-ui-hover-bg));
  }

  .layout-toggle:focus-visible {
    outline: 2px solid color-mix(in srgb, var(--cl-accent) 55%, transparent);
    outline-offset: 2px;
  }

  .layout-toggle > svg { display: block; }
</style>
