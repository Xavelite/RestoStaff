<script lang="ts">
  import type { Snippet } from 'svelte';

  let {
    tabs,
    actions,
    label = 'Workbench navigation'
  }: {
    tabs: Snippet;
    actions?: Snippet;
    label?: string;
  } = $props();
</script>

<div class="workbench-header" aria-label={label}>
  <div class="workbench-header__tabs">
    {@render tabs()}
  </div>

  {#if actions}
    <div class="workbench-header__actions">
      {@render actions()}
    </div>
  {/if}
</div>

<style>
  .workbench-header {
    min-width: 0;
    min-height: 52px;
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: center;
    gap: 12px;
    padding: 4px;
    border: 1px solid var(--rst-ui-line);
    border-radius: var(--rst-ui-radius-lg);
    background: var(--rst-ui-surface-panel);
  }

  .workbench-header__tabs,
  .workbench-header__actions {
    min-width: 0;
  }

  .workbench-header__actions {
    justify-self: end;
  }

  @media (max-width: 760px) {
    .workbench-header {
      grid-template-columns: 1fr;
      align-items: stretch;
      gap: 8px;
    }

    .workbench-header__actions {
      justify-self: stretch;
    }
  }
</style>
