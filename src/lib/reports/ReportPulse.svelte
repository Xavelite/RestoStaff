<script lang="ts">
  import { formatHours, serviceLabel, WEEKDAYS } from '$lib/calendar/date';
  import { t } from '$lib/i18n/i18n.svelte';
  import type { PulseCell } from '$lib/dashboard/dashboard-model';

  let {
    cells,
    title = 'Service pressure by day'
  }: {
    cells: PulseCell[];
    title?: string;
  } = $props();

  function cell(serviceKey: string, weekday: number): PulseCell | undefined {
    return cells.find((item) => item.serviceKey === serviceKey && item.weekday === weekday);
  }

  function configuredServiceLabel(serviceKey: string): string {
    return cells.find((item) => item.serviceKey === serviceKey)?.serviceLabel ??
      serviceLabel(serviceKey);
  }

  function background(intensity: number): string {
    const amount = Math.max(5, Math.min(72, Math.round(intensity * 72)));
    return `color-mix(in srgb, var(--cl-info) ${amount}%, var(--cl-surface-muted))`;
  }

  const services = $derived([...new Set(cells.map((item) => item.serviceKey))]);
</script>

<figure class="report-pulse">
  <figcaption>
    <strong>{t(title)}</strong>
    <span>{t('Darker cells mean more planned hours.')}</span>
  </figcaption>
  <div class="report-pulse__scroll">
    <div class="report-pulse__grid">
      <span></span>
      {#each WEEKDAYS as day (day)}<strong class="report-pulse__day">{t(day).slice(0, 3)}</strong>{/each}
      {#each services as service (service)}
        <strong class="report-pulse__service">{t(configuredServiceLabel(service))}</strong>
        {#each WEEKDAYS as _day, index (_day)}
          {@const item = cell(service, index + 1)}
          <span
            class="report-pulse__cell"
            class:has-issues={Boolean(item?.issues)}
            style={`background:${background(item?.intensity ?? 0)}`}
            title={item
              ? `${item.weekdayLabel} · ${item.serviceLabel} · ${t('Planned')} ${formatHours(item.planned)} · ${t('Worked')} ${formatHours(item.worked)} · ${item.issues} ${t('issues')}`
              : ''}
          >
            {#if item?.issues}<i>{item.issues}</i>{/if}
          </span>
        {/each}
      {/each}
    </div>
  </div>
</figure>

<style>
  .report-pulse {
    min-width: 0;
    display: grid;
    gap: 14px;
    margin: 0;
    padding: 16px;
    border: 1px solid var(--cl-line);
    border-radius: var(--cl-radius-surface);
    background: var(--cl-surface);
  }
  figcaption { display: grid; gap: 3px; }
  figcaption strong { color: var(--cl-ink); font-size: 13px; }
  figcaption span { color: var(--cl-muted); font-size: 10px; }
  .report-pulse__scroll { min-width: 0; overflow-x: auto; }
  .report-pulse__grid {
    min-width: 340px;
    display: grid;
    grid-template-columns: 58px repeat(7, minmax(32px, 1fr));
    gap: 4px;
  }
  .report-pulse__day,
  .report-pulse__service {
    display: flex;
    align-items: center;
    color: var(--cl-muted);
    font-size: 9px;
    font-weight: var(--rst-fw-bold);
  }
  .report-pulse__day { justify-content: center; }
  .report-pulse__cell {
    position: relative;
    height: 39px;
    display: grid;
    place-items: center;
    border: 1px solid color-mix(in srgb, var(--cl-info) 16%, var(--cl-line));
    border-radius: 5px;
  }
  .report-pulse__cell.has-issues { box-shadow: inset 0 -3px 0 var(--cl-attention); }
  .report-pulse__cell i {
    min-width: 18px;
    height: 18px;
    display: grid;
    place-items: center;
    border-radius: 9px;
    background: var(--cl-surface);
    color: var(--cl-attention);
    font-size: 9px;
    font-style: normal;
    font-weight: var(--rst-fw-bold);
  }
  @media (max-width: 760px) {
    .report-pulse { padding: 13px 12px; }
  }
</style>
