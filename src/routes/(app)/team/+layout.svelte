<script lang="ts">
  import { page } from '$app/state';
  import type { Snippet } from 'svelte';
  import WorkspaceTeamPage from '$lib/workspace-ui/WorkspaceTeamPage.svelte';

  let { children: routeChildren }: { children: Snippet } = $props();
</script>

<WorkspaceTeamPage>
  {#snippet children(_context)}
    {#key page.url.pathname}
      {@render routeChildren()}
    {/key}
  {/snippet}
</WorkspaceTeamPage>
