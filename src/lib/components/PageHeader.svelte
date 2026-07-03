<script lang="ts">
  import type { Snippet } from 'svelte';
  import type { FourMetrics } from '$lib/ui/metric';
  import PageHeaderMetrics from './PageHeaderMetrics.svelte';

  let {
    eyebrow = '',
    title,
    subtitle,
    aside,
    metrics,
    metricLabel = 'Page summary',
    variant = 'standard',
    metricDensity = 'standard',
    onmetricaction
  }: {
    eyebrow?: string;
    title: string;
    subtitle: string;
    aside?: Snippet;
    metrics?: FourMetrics;
    metricLabel?: string;
    variant?: 'standard' | 'operational';
    metricDensity?: 'standard' | 'micro';
    onmetricaction?: (actionId: string) => void;
  } = $props();
</script>

<header class="header is-{variant}">
  <div class="header__copy">
    {#if eyebrow}<p>{eyebrow}</p>{/if}
    <h1>{title}</h1>
    <span>{subtitle}</span>
  </div>
  {#if aside}
    <div class="header__aside">
      {@render aside()}
    </div>
  {:else if metrics}
    <div class="header__aside">
      <PageHeaderMetrics
        {metrics}
        label={metricLabel}
        density={metricDensity}
        onaction={onmetricaction}
      />
    </div>
  {/if}
</header>

<style>
  .header {
    min-width: 0;
    display: grid;
    grid-template-columns: minmax(300px, 0.9fr) minmax(420px, 1.1fr);
    align-items: stretch;
    gap: 24px;
    padding: 6px 2px 18px;
  }

  p {
    margin: 0 0 4px;
    color: var(--rst-ui-action);
    font-size: 11px;
    font-weight: var(--rst-fw-bold);
    letter-spacing: 0.07em;
    text-transform: uppercase;
  }

  h1 {
    margin: 0;
    max-width: 980px;
    font-size: clamp(30px, 4vw, 56px);
    font-weight: var(--rst-fw-display);
    line-height: .98;
    letter-spacing: -0.045em;
  }

  span {
    display: block;
    max-width: 820px;
    margin-top: 10px;
    color: var(--rst-ui-action);
    font-weight: var(--rst-fw-bold);
  }

  .header__copy,
  .header__aside {
    min-width: 0;
  }

  .header__copy {
    align-self: center;
  }

  .header.is-operational {
    grid-template-columns: minmax(320px, 0.85fr) minmax(420px, 1.15fr);
    align-items: center;
    gap: 24px;
    padding-bottom: 14px;
  }

  .header.is-operational p {
    margin-bottom: 2px;
  }

  .header.is-operational h1 {
    font-size: clamp(30px, 3.4vw, 46px);
  }

  .header.is-operational span {
    max-width: 100%;
    margin-top: 8px;
  }

  @media (max-width: 1180px) {
    .header {
      grid-template-columns: 1fr;
    }

    .header.is-operational {
      grid-template-columns: 1fr;
      gap: 10px;
    }
  }

  @media (max-width: 760px) {
    .header {
      grid-template-columns: 1fr;
      gap: 14px;
    }

    h1 {
      font-size: clamp(28px, 10vw, 40px);
    }
  }
</style>
