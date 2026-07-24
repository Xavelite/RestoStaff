<script lang="ts">
  import { onDestroy } from 'svelte';
  import type { Snippet } from 'svelte';
  import { page } from '$app/state';
  import { moduleForPath, subNavItemForPath } from './classic-nav';
  import { classicChrome } from './classic-chrome.svelte';

  let {
    actions,
    children
  }: {
    actions?: Snippet;
    children: Snippet;
  } = $props();

  const owner = crypto.randomUUID();
  const module = $derived(moduleForPath(page.url.pathname));
  const subNav = $derived(module?.subNav ?? []);
  const activeSubNav = $derived(module ? subNavItemForPath(module, page.url.pathname) : null);

  $effect(() => {
    classicChrome.set(owner, subNav, activeSubNav?.href ?? '', actions);
  });

  onDestroy(() => classicChrome.clear(owner));
</script>

<div class="cl-page">
  {@render children()}
</div>
