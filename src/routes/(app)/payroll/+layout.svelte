<script lang="ts">
  import type { Snippet } from 'svelte';
  import WorkspaceRestaurantPage from '$lib/workspace-ui/WorkspaceRestaurantPage.svelte';

  let { children: routeChildren }: { children: Snippet } = $props();
</script>

<WorkspaceRestaurantPage>
  {#snippet children(_context)}
    {@render routeChildren()}
  {/snippet}
</WorkspaceRestaurantPage>
