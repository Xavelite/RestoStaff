<script lang="ts">
  import Panel from '$lib/components/Panel.svelte';
  import type { HomeModel } from './home-model';

  let {
    actions,
    onselect
  }: {
    actions: HomeModel['actions'];
    onselect?: (row: HomeModel['actions']['rows'][number]) => void;
  } = $props();
</script>

{#snippet trailing()}
  <strong class="count">{actions.total}</strong>
{/snippet}

<Panel title="Action required" eyebrow="Operational review" {trailing}>
  <div class="intro">
    <strong>Start here.</strong>
    <span>Clear the items that can block today, payroll or next week’s planning.</span>
  </div>

  <div class="list" aria-label="Operational tasks">
    {#each actions.rows as row (row.key)}
      {#snippet content()}
        <span class="marker" aria-hidden="true"><i>{row.symbol}</i></span>
        <span class="copy">
          <strong>{row.label}</strong>
          <small>{row.meta}</small>
        </span>
        <span class="row-count">{row.count}</span>
        <span class="arrow" aria-hidden="true">→</span>
      {/snippet}
      {#if onselect && row.count > 0}
        <button class="row is-{row.tone}" type="button" onclick={() => onselect(row)}>
          {@render content()}
        </button>
      {:else}
        <a class="row is-{row.tone}" href={row.href}>
          {@render content()}
        </a>
      {/if}
    {/each}
  </div>
</Panel>

<style>
  .count {
    min-width: 32px;
    height: 32px;
    display: grid;
    place-items: center;
    border-radius: var(--rst-ui-radius-pill);
    color: var(--rst-state-warning-text);
    background: var(--rst-state-warning-bg);
    border: 1px solid var(--rst-state-warning-border);
  }

  .intro {
    min-height: 86px;
    display: grid;
    align-content: center;
    gap: 3px;
    padding: 12px 14px 10px;
    border-bottom: 1px solid var(--rst-ui-divider-soft);
  }

  .intro strong {
    color: var(--rst-ui-text);
    font-size: 13px;
  }

  .intro span {
    color: var(--rst-ui-muted);
    font-size: 12px;
    line-height: 1.35;
  }

  .list {
    display: grid;
    gap: 8px;
    padding: 12px;
  }

  .row {
    --row-rgb: var(--rst-state-neutral-rgb);
    width: 100%;
    min-height: 64px;
    display: grid;
    grid-template-columns: 34px minmax(0, 1fr) auto 14px;
    align-items: center;
    gap: 12px;
    padding: 0 12px 0 0;
    color: var(--rst-ui-text);
    background: rgba(var(--row-rgb), 0.045);
    border: 1px solid rgba(var(--row-rgb), 0.14);
    border-radius: var(--rst-ui-radius-lg);
    font: inherit;
    text-align: left;
    text-decoration: none;
    cursor: pointer;
  }

  .row:hover {
    background: rgba(var(--row-rgb), 0.075);
    border-color: rgba(var(--row-rgb), 0.26);
  }

  .row.is-success {
    --row-rgb: var(--rst-state-success-rgb);
  }

  .row.is-warning {
    --row-rgb: var(--rst-state-warning-rgb);
  }

  .row.is-danger {
    --row-rgb: var(--rst-state-danger-rgb);
  }

  .marker {
    height: 100%;
    min-height: 64px;
    display: grid;
    place-items: center;
    align-self: stretch;
    border-radius: var(--rst-ui-radius-lg) 0 0 var(--rst-ui-radius-lg);
    color: var(--rst-ui-surface-panel);
    background: rgb(var(--row-rgb));
  }

  .marker i {
    width: 18px;
    height: 18px;
    display: grid;
    place-items: center;
    border-radius: 50%;
    background: rgba(255, 255, 255, 0.18);
    font-size: 11px;
    font-weight: var(--rst-fw-display);
    font-style: normal;
  }

  .copy {
    min-width: 0;
    display: grid;
    gap: 2px;
  }

  .copy strong {
    font-size: 13px;
  }

  small {
    color: var(--rst-ui-muted);
    font-size: 11px;
  }

  .row-count {
    min-width: 28px;
    height: 28px;
    display: grid;
    place-items: center;
    border-radius: var(--rst-ui-radius-pill);
    color: rgb(var(--row-rgb));
    background: var(--rst-ui-surface-panel);
    border: 1px solid rgba(var(--row-rgb), 0.24);
    font-size: 16px;
    font-weight: var(--rst-fw-display);
  }

  .arrow {
    color: var(--rst-ui-muted);
    font-size: 14px;
  }
</style>
