<script lang="ts">
  import { page } from '$app/state';
  import type { Snippet } from 'svelte';
  import ClassicTeamPage from '$lib/classic/ClassicTeamPage.svelte';

  let { children }: { children: Snippet } = $props();
</script>

<ClassicTeamPage>
  {#snippet children(_context)}
    {#key page.url.pathname}
      {@render children()}
    {/key}
  {/snippet}
</ClassicTeamPage>
