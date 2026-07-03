<script lang="ts">
  import { page } from '$app/state';
</script>

<svelte:head><title>Something went wrong · restogogo</title></svelte:head>

<main>
  <p class="brand">restogogo</p>
  <h1>We could not load this page</h1>
  <p>{page.error?.message ?? 'An unexpected error occurred.'}</p>
  <div>
    <button type="button" onclick={() => location.reload()}>Try again</button>
    <a href="/home">Return home</a>
  </div>
</main>

<style>
  main { min-height: 100vh; display: grid; place-content: center; justify-items: start; gap: 10px; padding: 24px; }
  .brand { color: var(--rst-ui-panel-title); font-weight: var(--rst-fw-display); }
  h1, p { margin: 0; }
  main > p:not(.brand) { max-width: 520px; color: var(--rst-ui-muted); line-height: 1.5; }
  div { display: flex; gap: 8px; margin-top: 8px; }
  button, a { padding: 9px 13px; border: 1px solid var(--rst-ui-line); border-radius: var(--rst-ui-radius-md); color: var(--rst-ui-text); background: var(--rst-ui-surface-field-strong); font: inherit; font-weight: var(--rst-fw-bold); text-decoration: none; cursor: pointer; }
</style>
