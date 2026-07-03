<script lang="ts">
  import MetricCard from './MetricCard.svelte';
  import MetricDetail from './MetricDetail.svelte';
  import type { FourMetrics } from '$lib/ui/metric';

  let {
    metrics,
    label = 'Page summary',
    density = 'standard',
    onaction
  }: {
    metrics: FourMetrics;
    label?: string;
    density?: 'standard' | 'micro';
    onaction?: (actionId: string) => void;
  } = $props();

  const safeMetrics = $derived.by(() => {
    if (metrics.length !== 4) {
      throw new Error(`PageHeaderMetrics requires exactly four metrics; received ${metrics.length}.`);
    }
    return metrics;
  });

  let openMetricId = $state<string | null>(null);
  const openDetail = $derived(
    (openMetricId ? safeMetrics.find((metric) => metric.id === openMetricId)?.detail : null) ?? null
  );
</script>

<div class="metrics is-{density}" aria-label={label}>
  {#each safeMetrics as metric (metric.id)}
    <MetricCard
      {...metric}
      compact={density === 'standard'}
      micro={density === 'micro'}
      ondetail={metric.detail ? () => (openMetricId = metric.id) : undefined}
    />
  {/each}
</div>

<MetricDetail
  detail={openDetail}
  onclose={() => (openMetricId = null)}
  onaction={(actionId) => {
    openMetricId = null;
    onaction?.(actionId);
  }}
/>

<style>
  .metrics {
    min-width: 0;
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 8px;
  }

  .metrics.is-micro {
    gap: 7px;
  }

  @media (max-width: 1180px) {
    .metrics {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }

  @media (min-width: 1181px) {
    .metrics.is-micro {
      grid-template-columns: repeat(4, minmax(0, 1fr));
    }
  }
</style>
