<script lang="ts">
  import '../app.css';
  import { onMount } from 'svelte';
  import { auth } from '$lib/auth/session.svelte';
  import { startClientMonitoring } from '$lib/monitoring/client';
  import favicon from '$lib/assets/favicon.svg';

  let { children } = $props();

  onMount(() => {
    const stopMonitoring = startClientMonitoring();
    auth.init();
    return () => {
      stopMonitoring();
      auth.destroy();
    };
  });
</script>

<svelte:head>
  <link rel="icon" href={favicon} />
</svelte:head>

{#if auth.ready}
  {#if auth.error}
    <main class="fatal" role="alert">
      <h1>Unable to start restogogo</h1>
      <p>{auth.error}</p>
      <button type="button" onclick={() => location.reload()}>Try again</button>
    </main>
  {:else}
    {@render children()}
  {/if}
{/if}

<style>
  .fatal {
    min-height: 100vh;
    display: grid;
    place-content: center;
    justify-items: start;
    gap: 10px;
    padding: 24px;
  }
  .fatal h1,
  .fatal p {
    margin: 0;
  }
  .fatal p {
    color: var(--rst-ui-muted);
  }
  .fatal button {
    padding: 9px 14px;
    border: 0;
    border-radius: var(--rst-ui-radius-md);
    color: var(--rst-on-accent-text);
    background: var(--rst-ui-action);
    font: inherit;
    font-weight: var(--rst-fw-bold);
    cursor: pointer;
  }
</style>
