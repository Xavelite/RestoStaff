<script lang="ts">
  import type { Snippet } from 'svelte';

  let { children }: { children: Snippet } = $props();
</script>

<!-- One grid for every card surface, so a person moving between Team, Positions
     and Areas meets the same rhythm rather than a per-page guess at a width. -->
<div class="card-grid">{@render children()}</div>

<style>
  .card-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(268px, 1fr));
    align-content: start;
    /* Each card sizes to its own content. Without this a short record is
       stretched to match the tallest card in its row, which left large dead
       gaps wherever one card wrapped its tags onto a second line. */
    align-items: start;
    gap: 12px;
    padding: 14px;
  }

  @media (max-width: 520px) {
    .card-grid {
      grid-template-columns: 1fr;
      gap: 10px;
      padding: 10px;
    }
  }
</style>
