<script lang="ts">
  import type { Snippet } from 'svelte';

  let { children, min = 152 }: { children: Snippet; min?: number } = $props();
</script>

<!-- Tighter than the card grid on purpose: tiles are meant to be swept, so more
     of them belong on screen at once. -->
<div class="tile-grid" style={`--tile-min:${min}px`}>{@render children()}</div>

<style>
  .tile-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(var(--tile-min), 1fr));
    align-content: start;
    gap: 10px;
    padding: 14px;
  }

  @media (max-width: 520px) {
    .tile-grid {
      grid-template-columns: repeat(auto-fill, minmax(128px, 1fr));
      gap: 8px;
      padding: 10px;
    }
  }
</style>
