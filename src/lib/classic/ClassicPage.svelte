<script lang="ts">
  import type { Snippet } from 'svelte';
  import { page } from '$app/state';
  import { t } from '$lib/i18n/i18n.svelte';
  import { moduleForPath, subNavItemForPath } from './classic-nav';

  let {
    title,
    subtitle = '',
    actions,
    children
  }: {
    title: string;
    subtitle?: string;
    actions?: Snippet;
    children: Snippet;
  } = $props();

  // Sub-navigation is derived from the route, so a page never restates its own
  // tabs and the active one can never disagree with the URL.
  const module = $derived(moduleForPath(page.url.pathname));
  const subNav = $derived(module?.subNav ?? []);
  const activeSubNav = $derived(module ? subNavItemForPath(module, page.url.pathname) : null);
</script>

<div class="cl-page">
  <header class="cl-page__head">
    <div class="cl-page__titlerow">
      <div>
        <h1 class="cl-page__title">{t(title)}</h1>
        {#if subtitle}<p class="cl-page__subtitle">{t(subtitle)}</p>{/if}
      </div>
      {#if actions}
        <div class="cl-page__actions">{@render actions()}</div>
      {/if}
    </div>

    {#if subNav.length}
      <nav class="cl-tabs" aria-label={t('Sections')}>
        {#each subNav as item (item.href)}
          <a
            class="cl-tab"
            class:is-active={item.href === activeSubNav?.href}
            aria-current={item.href === activeSubNav?.href ? 'page' : undefined}
            href={item.href}>{t(item.label)}</a>
        {/each}
      </nav>
    {/if}
  </header>

  {@render children()}
</div>
