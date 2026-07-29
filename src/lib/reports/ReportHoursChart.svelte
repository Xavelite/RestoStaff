<script lang="ts">
  import { formatHours } from '$lib/calendar/date';
  import { t } from '$lib/i18n/i18n.svelte';
  import type { InsightBucket } from '$lib/dashboard/dashboard-model';

  let {
    buckets,
    title = 'Planned and worked hours'
  }: {
    buckets: InsightBucket[];
    title?: string;
  } = $props();

  let scrollElement: HTMLDivElement;
  const ceiling = $derived(
    Math.max(1, ...buckets.flatMap((bucket) => [bucket.planned, bucket.worked]))
  );

  function height(value: number): string {
    if (value <= 0) return '0';
    return `${Math.max(4, Math.round((value / ceiling) * 100))}%`;
  }

  $effect(() => {
    const bucketKey = buckets.map((bucket) => bucket.key).join('|');
    if (!scrollElement || !bucketKey) return;
    const frame = requestAnimationFrame(() => {
      scrollElement.scrollLeft = scrollElement.scrollWidth;
    });
    return () => cancelAnimationFrame(frame);
  });
</script>

<figure class="report-chart">
  <figcaption>
    <strong>{t(title)}</strong>
    <span class="report-chart__legend">
      <i class="is-planned"></i>{t('Planned')}
      <i class="is-worked"></i>{t('Worked')}
    </span>
  </figcaption>
  <div class="report-chart__scroll" bind:this={scrollElement}>
    <div class="report-chart__plot" style={`--buckets:${Math.max(1, buckets.length)}`}>
      {#each buckets as bucket (bucket.key)}
        <div
          class="report-chart__bucket"
          title={`${bucket.label} · ${t('Planned')} ${formatHours(bucket.planned)} · ${t('Worked')} ${formatHours(bucket.worked)}`}
        >
          <div class="report-chart__bars">
            <i class="is-planned" style={`height:${height(bucket.planned)}`}></i>
            <i class="is-worked" style={`height:${height(bucket.worked)}`}></i>
          </div>
          <span>{bucket.shortLabel}</span>
        </div>
      {/each}
    </div>
  </div>
</figure>

<style>
  .report-chart {
    min-width: 0;
    display: grid;
    gap: 14px;
    margin: 0;
    padding: 16px 16px 12px;
    border: 1px solid var(--cl-line);
    border-radius: var(--cl-radius-surface);
    background: var(--cl-surface);
  }
  figcaption {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
  }
  figcaption strong { color: var(--cl-ink); font-size: 13px; }
  .report-chart__legend {
    display: flex;
    align-items: center;
    gap: 6px;
    color: var(--cl-muted);
    font-size: 10px;
  }
  .report-chart__legend i {
    width: 8px;
    height: 8px;
    display: inline-block;
    border-radius: 2px;
  }
  .report-chart__legend i + :global(i) { margin-left: 5px; }
  .is-planned { background: color-mix(in srgb, var(--cl-info) 38%, var(--cl-surface)); }
  .is-worked { background: var(--cl-info); }
  .report-chart__scroll { min-width: 0; overflow-x: auto; }
  .report-chart__plot {
    min-width: max(440px, calc(var(--buckets) * 18px));
    height: 176px;
    display: grid;
    grid-template-columns: repeat(var(--buckets), minmax(34px, 1fr));
    align-items: end;
    gap: clamp(2px, calc(50px / var(--buckets)), 8px);
    padding-top: 5px;
    border-bottom: 1px solid var(--cl-line-strong);
    background:
      linear-gradient(to bottom, transparent 24%, var(--cl-grid-line) 25%, transparent 26%),
      linear-gradient(to bottom, transparent 49%, var(--cl-grid-line) 50%, transparent 51%),
      linear-gradient(to bottom, transparent 74%, var(--cl-grid-line) 75%, transparent 76%);
  }
  .report-chart__bucket {
    min-width: 0;
    height: 100%;
    display: grid;
    grid-template-rows: minmax(0, 1fr) 22px;
    gap: 5px;
  }
  .report-chart__bars {
    min-height: 0;
    display: flex;
    align-items: end;
    justify-content: center;
    gap: 3px;
  }
  .report-chart__bars i {
    width: min(13px, 38%);
    display: block;
    border-radius: 3px 3px 1px 1px;
    transition: height 220ms ease;
  }
  .report-chart__bucket > span {
    overflow: hidden;
    color: var(--cl-muted);
    font-size: 9px;
    text-align: center;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  @media (max-width: 760px) {
    .report-chart { padding: 13px 12px 10px; }
    figcaption { align-items: flex-start; flex-direction: column; gap: 6px; }
    .report-chart__plot { height: 152px; }
  }
</style>
