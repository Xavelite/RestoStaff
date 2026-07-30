<script lang="ts">
  import type { Snippet } from 'svelte';

  let {
    actions,
    actionsAlign = 'start',
    children
  }: {
    actions?: Snippet;
    actionsAlign?: 'start' | 'center' | 'between';
    children: Snippet;
  } = $props();
</script>

<div class="cl-page">
  {#if actions}
    <div
      class="cl-page__toolbar"
      class:is-centered={actionsAlign === 'center'}
      class:is-between={actionsAlign === 'between'}
      aria-label="Page controls"
    >
      {@render actions()}
    </div>
  {/if}

  {@render children()}
</div>
