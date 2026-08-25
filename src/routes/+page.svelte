<script lang="ts">
  import { goto } from '$app/navigation';
  import { auth } from '$lib/auth/session.svelte';

  $effect(() => {
    if (auth.ready && auth.session) goto('/home', { replaceState: true });
  });
</script>

<svelte:head>
  <title>xbesnard.com</title>
  <meta name="robots" content="noindex, nofollow, noarchive" />
</svelte:head>

<div class="holding" aria-hidden="true"></div>

<style>
  :global(html),
  :global(body) {
    min-height: 100%;
    margin: 0;
    background: #ffffff;
  }

  .holding {
    position: fixed;
    inset: 0;
    z-index: 2147483647;
    background: #ffffff;
  }
</style>
