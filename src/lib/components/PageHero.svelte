<script lang="ts">
  import type { Snippet } from 'svelte';
  import { t } from '$lib/i18n/i18n.svelte';

  // The single cinematic page hero used across every page. The band (gradient,
  // atmosphere image, glow, rainbow underline) lives in the shared `.page-hero`
  // styles; each page only supplies its own copy and an optional command aside.
  let {
    eyebrow,
    title,
    titleId,
    subtitle,
    nav,
    command,
    heroClass = ''
  }: {
    eyebrow?: string;
    title: string;
    titleId?: string;
    subtitle?: string;
    nav?: Snippet;
    command?: Snippet;
    heroClass?: string;
  } = $props();
</script>

<header class={`page-hero ${heroClass}`} aria-label={t(title)}>
  <div class="page-hero__copy">
    {#if nav}{@render nav()}{/if}
  </div>
  {#if command}
    {@render command()}
  {/if}
</header>
