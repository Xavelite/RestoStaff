<script lang="ts">
  import type { Snippet } from 'svelte';

  let {
    actions,
    children
  }: {
    actions?: Snippet;
    children: Snippet;
  } = $props();
</script>

<div class="cl-page">
  {#if actions}
    <div class="cl-page__toolbar" aria-label="Page controls">
      {@render actions()}
    </div>
  {/if}

  {@render children()}
</div>
