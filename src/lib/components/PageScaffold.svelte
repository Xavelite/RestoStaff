<script lang="ts">
  import type { Snippet } from 'svelte';
  import { t } from '$lib/i18n/i18n.svelte';

  let {
    header,
    chrome,
    children,
    label = 'Page workspace'
  }: {
    header: Snippet;
    chrome?: Snippet;
    children: Snippet;
    label?: string;
  } = $props();
</script>

<section class="page-scaffold" aria-label={t(label)}>
  <div class="page-scaffold__header">
    {@render header()}
  </div>

  {#if chrome}
    <div class="page-scaffold__chrome">
      {@render chrome()}
    </div>
  {/if}

  <div class="page-scaffold__body">
    {@render children()}
  </div>
</section>

<style>
  .page-scaffold {
    min-width: 0;
    min-height: 0;
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .page-scaffold__header,
  .page-scaffold__chrome {
    min-width: 0;
    flex: 0 0 auto;
  }

  .page-scaffold__body {
    min-width: 0;
    min-height: 0;
  }


</style>
