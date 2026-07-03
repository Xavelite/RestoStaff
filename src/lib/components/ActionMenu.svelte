<script lang="ts">
  export type ActionMenuItem = {
    id: string;
    label: string;
    description?: string;
    onclick: () => void;
  };

  let {
    label,
    items
  }: {
    label: string;
    items: ActionMenuItem[];
  } = $props();

  let open = $state(false);

  function run(item: ActionMenuItem) {
    open = false;
    item.onclick();
  }
</script>

<div class="menu">
  <button
    type="button"
    class="menu__trigger"
    aria-haspopup="menu"
    aria-expanded={open}
    onclick={() => (open = !open)}
  >
    {label}<span aria-hidden="true">⌄</span>
  </button>
  {#if open}
  <div class="menu__items" role="menu" aria-label={label}>
    {#each items as item (item.id)}
      <button type="button" class="menu__item" role="menuitem" onclick={() => run(item)}>
        <strong>{item.label}</strong>
        {#if item.description}<small>{item.description}</small>{/if}
      </button>
    {/each}
  </div>
  {/if}
</div>

<style>
  .menu {
    position: relative;
  }

  .menu__trigger {
    min-height: 36px;
    display: flex;
    align-items: center;
    gap: 7px;
    padding: 7px 11px;
    border: 1px solid var(--rst-ui-line);
    border-radius: var(--rst-ui-radius-md);
    color: var(--rst-ui-text);
    background: var(--rst-ui-surface-field);
    font-size: 12px;
    font-weight: var(--rst-fw-bold);
    cursor: pointer;
  }

  .menu__trigger:focus-visible {
    outline: 2px solid var(--rst-state-info);
    outline-offset: 2px;
  }

  .menu__items {
    position: absolute;
    top: calc(100% + 6px);
    right: 0;
    z-index: 20;
    width: min(290px, calc(100vw - 32px));
    display: grid;
    padding: 6px;
    border: 1px solid var(--rst-ui-line);
    border-radius: var(--rst-ui-radius-lg);
    background: var(--rst-ui-surface-panel);
    box-shadow: var(--rst-ui-shadow-floating);
  }

  .menu__item {
    display: grid;
    gap: 2px;
    padding: 9px 10px;
    border: 0;
    border-radius: var(--rst-ui-radius-md);
    color: var(--rst-ui-text);
    background: transparent;
    font: inherit;
    text-align: left;
    cursor: pointer;
  }

  .menu__item:hover,
  .menu__item:focus-visible {
    background: var(--rst-ui-section-row-hover);
    outline: none;
  }

  strong {
    font-size: 12px;
  }

  small {
    color: var(--rst-ui-muted);
    font-size: 10px;
  }
</style>
