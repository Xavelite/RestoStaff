<script lang="ts">
  import type { Snippet } from 'svelte';
  let { list, detail }: { list: Snippet; detail: Snippet } = $props();
</script>

<section class="workbench">
  <aside class="workbench__list">{@render list()}</aside>
  <div class="workbench__detail">{@render detail()}</div>
</section>

<style>
  .workbench {
    min-width: 0;
    min-height: 0;
    display: grid;
    grid-template-columns: minmax(250px, 320px) minmax(0, 1fr);
    border: 1px solid var(--rst-ui-line);
    border-radius: var(--rst-ui-radius-xl);
    overflow: hidden;
    background: var(--rst-ui-surface-board);
  }
  .workbench__list {
    min-width: 0;
    min-height: 0;
    border-right: 1px solid var(--rst-ui-divider-soft);
    background: var(--rst-ui-surface-panel-head);
  }
  .workbench__detail {
    min-width: 0;
    min-height: 0;
  }

  @media (max-width: 980px) {
    .workbench { grid-template-columns: 1fr; overflow: visible; }
    .workbench__list { border-right: 0; border-bottom: 1px solid var(--rst-ui-divider-soft); }
  }
</style>
