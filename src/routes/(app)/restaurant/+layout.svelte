<script lang="ts">
  import { page } from '$app/state';
  import type { Snippet } from 'svelte';
  import ClassicRestaurantPage from '$lib/classic/ClassicRestaurantPage.svelte';

  let { children: routeChildren }: { children: Snippet } = $props();
</script>

<ClassicRestaurantPage>
  {#snippet children(_context)}
    {#key page.url.pathname}
      {@render routeChildren()}
    {/key}
  {/snippet}
</ClassicRestaurantPage>
