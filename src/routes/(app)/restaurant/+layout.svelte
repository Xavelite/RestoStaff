<script lang="ts">
  import { page } from '$app/state';
  import type { Snippet } from 'svelte';
  import WorkspaceRestaurantPage from '$lib/workspace-ui/WorkspaceRestaurantPage.svelte';

  let { children: routeChildren }: { children: Snippet } = $props();
</script>

<WorkspaceRestaurantPage>
  {#snippet children(_context)}
    {#key page.url.pathname}
      {@render routeChildren()}
    {/key}
  {/snippet}
</WorkspaceRestaurantPage>
