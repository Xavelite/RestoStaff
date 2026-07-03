<script lang="ts">
  import type { Snippet } from 'svelte';
  import { portal } from '$lib/actions/portal';

  let {
    label = 'Filters',
    activeCount = 0,
    content
  }: {
    label?: string;
    activeCount?: number;
    content: Snippet;
  } = $props();

  let open = $state(false);
  let trigger = $state<HTMLButtonElement>();
  let menuStyle = $state('');

  // Right-align the menu to the trigger and open downward, computed from the
  // trigger's viewport rect. The menu is portaled to <body>, so it escapes any
  // scrolling/clipping panel (e.g. the Team workbench) instead of being cut off.
  function place() {
    if (!trigger) return;
    const rect = trigger.getBoundingClientRect();
    menuStyle = `top: ${rect.bottom + 6}px; right: ${Math.max(8, window.innerWidth - rect.right)}px;`;
  }

  function toggle() {
    open = !open;
    if (open) place();
  }
</script>

<svelte:window
  onresize={() => open && place()}
  onkeydown={(event) => {
    if (open && event.key === 'Escape') open = false;
  }}
/>

<div class="filters">
  <button
    bind:this={trigger}
    class="filters__trigger"
    type="button"
    aria-label={label}
    title={label}
    aria-expanded={open}
    onclick={toggle}
  >
    <span aria-hidden="true">≡</span>
    {#if activeCount}<strong aria-label={`${activeCount} active filters`}>{activeCount}</strong>{/if}
  </button>

  {#if open}
    <div class="filters__backdrop" use:portal role="presentation" onclick={() => (open = false)}></div>
    <div class="filters__content" use:portal style={menuStyle} role="group" aria-label={label}>
      {@render content()}
    </div>
  {/if}
</div>

<style>
  .filters {
    position: relative;
    display: inline-flex;
  }

  .filters__trigger {
    min-height: 38px;
    display: flex;
    align-items: center;
    gap: 7px;
    padding: 8px 10px;
    border: 1px solid var(--rst-ui-line);
    border-radius: var(--rst-ui-radius-md);
    color: var(--rst-ui-text);
    background: var(--rst-ui-surface-field-strong);
    font: inherit;
    font-size: 12px;
    font-weight: var(--rst-fw-bold);
    cursor: pointer;
  }

  .filters__trigger:focus-visible {
    outline: 2px solid var(--rst-state-info);
    outline-offset: 2px;
  }

  .filters__trigger strong {
    min-width: 20px;
    min-height: 20px;
    display: grid;
    place-items: center;
    border-radius: var(--rst-ui-radius-pill);
    color: var(--rst-state-info-text);
    background: var(--rst-state-info-bg);
    font-size: 10px;
  }

  .filters__backdrop {
    position: fixed;
    inset: 0;
    z-index: var(--rst-z-menu);
  }

  .filters__content {
    position: fixed;
    z-index: calc(var(--rst-z-menu) + 1);
    width: min(300px, calc(100vw - 16px));
    display: grid;
    gap: 10px;
    padding: 12px;
    border: 1px solid var(--rst-ui-line);
    border-radius: var(--rst-ui-radius-lg);
    background: var(--rst-ui-surface-panel);
    box-shadow: var(--rst-ui-shadow-floating);
  }

  .filters__content :global(label) {
    display: grid;
    gap: 5px;
    color: var(--rst-ui-muted);
    font-size: 10px;
    font-weight: var(--rst-fw-bold);
    text-transform: uppercase;
  }

  .filters__content :global(select) {
    min-height: 38px;
    padding: 8px 10px;
    border: 1px solid var(--rst-ui-line);
    border-radius: var(--rst-ui-radius-md);
    color: var(--rst-ui-text);
    background: var(--rst-ui-surface-field-strong);
    font: inherit;
    text-transform: none;
  }
</style>
