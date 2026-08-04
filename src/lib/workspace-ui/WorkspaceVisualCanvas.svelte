<script lang="ts">
  import type { Snippet } from 'svelte';

  let {
    label = null,
    variant = 'flow',
    children
  }: {
    label?: string | null;
    variant?: 'flow' | 'board' | 'flush';
    children: Snippet;
  } = $props();
</script>

<!-- Visual mode has one outer rhythm. Domain components decide what belongs
     inside it; this component only prevents every route inventing its own
     padding, spacing and mobile collapse. -->
<div class="visual-canvas is-{variant}" aria-label={label ?? undefined}>
  {@render children()}
</div>

<style>
  .visual-canvas {
    min-width: 0;
    display: grid;
    align-content: start;
    gap: 20px;
    padding: 18px;
  }

  .visual-canvas.is-board {
    overflow-x: auto;
    align-items: start;
  }

  .visual-canvas.is-flush {
    gap: 0;
    padding: 0;
  }

  @media (max-width: 760px) {
    .visual-canvas {
      gap: 14px;
      padding: 12px 10px 18px;
    }

    .visual-canvas.is-flush {
      padding: 0;
    }
  }
</style>
