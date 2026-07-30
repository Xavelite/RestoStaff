<script lang="ts">
  import {
    formatHours,
    hoursBetweenClocks,
    serviceLabel,
    type ServicePeriod
  } from '$lib/calendar/date';
  import { t } from '$lib/i18n/i18n.svelte';
  import { isTimesheetRow, slotLabel } from '$lib/workspace-ui/workspace-time';
  import type { ActualSlot } from './timesheet-model';
  import WorkspaceServiceIcon from '$lib/workspace-ui/WorkspaceServiceIcon.svelte';

  let {
    slots,
    areaName = new Map<string, string>(),
    areaColor = new Map<string, string>(),
    positionName = new Map<string, string>(),
    services = [],
    compact = false,
    onopen
  }: {
    slots: ActualSlot[];
    areaName?: Map<string, string>;
    areaColor?: Map<string, string>;
    positionName?: Map<string, string>;
    services?: ServicePeriod[];
    compact?: boolean;
    onopen: (key: string) => void;
  } = $props();

  const visible = $derived(slots.filter(isTimesheetRow));
  const priority: Record<ActualSlot['status'], number> = {
    conflict: 9,
    missing: 8,
    pending: 7,
    live: 6,
    adjusted: 5,
    recorded: 4,
    absence: 3,
    unavailable: 2,
    empty: 1
  };
  const primary = $derived(
    [...visible].sort((left, right) => priority[right.status] - priority[left.status])[0] ?? null
  );
  const actualHours = $derived(visible.reduce((sum, slot) => sum + slot.actualHours, 0));
  const plannedHours = $derived(
    visible.reduce(
      (sum, slot) =>
        sum +
        (slot.truth.plan
          ? hoursBetweenClocks(slot.truth.plan.startsAt, slot.truth.plan.endsAt)
          : 0),
      0
    )
  );
  const breakMinutes = $derived(visible.reduce((sum, slot) => sum + slot.breakMinutes, 0));
  const actualRange = $derived(combinedRange(visible.map((slot) => slot.actualRange).filter(Boolean)));
  const plannedRange = $derived(combinedRange(visible.map((slot) => slot.plannedRange).filter(Boolean)));
  const hasActual = $derived(Boolean(actualRange));
  const noShow = $derived(!hasActual && visible.some((slot) => slot.status === 'missing'));
  const conflict = $derived(visible.some((slot) => slot.status === 'conflict'));
  const adjusted = $derived(visible.some((slot) => slot.status === 'adjusted'));
  const pending = $derived(visible.some((slot) => slot.status === 'pending'));
  const live = $derived(visible.some((slot) => slot.status === 'live'));
  const signalLabel = $derived(
    noShow
      ? t('Missing badge')
      : conflict
        ? t('Conflict')
        : adjusted
          ? t('Corrected')
          : pending
            ? t('Pending request')
            : live
              ? t('Working now')
              : ''
  );
  const cardColor = $derived(
    hasActual
      ? areaColor.get(
          visible.find((slot) => slot.actualRange && slot.actualAreaId)?.actualAreaId ??
            primary?.actualAreaId ??
            ''
        ) ?? 'var(--cl-info)'
      : 'var(--cl-muted)'
  );
  const mainRange = $derived(actualRange || plannedRange || (primary ? t(slotLabel(primary.status)) : ''));
  const primaryLabel = $derived(
    !hasActual && primary?.truth.plan
      ? t('Planned')
      : primary
        ? t(slotLabel(primary.status))
        : ''
  );

  function combinedRange(ranges: string[]): string {
    if (!ranges.length) return '';
    const starts = ranges.map((range) => range.slice(0, 5)).filter(Boolean).sort();
    const live = ranges.some((range) => range.endsWith('live'));
    const ends = ranges
      .map((range) => range.slice(6))
      .filter((value) => value && value !== 'live')
      .sort();
    return `${starts[0]}–${live ? t('live') : ends.at(-1) ?? starts[0]}`;
  }

  function displayRange(slot: ActualSlot): string {
    return (slot.actualRange || slot.plannedRange || t(slotLabel(slot.status))).replace('-', '–');
  }

  function assignment(slot: ActualSlot): string {
    const area = areaName.get(slot.actualAreaId) ?? '';
    const position = positionName.get(slot.actualJobFunctionId) ?? '';
    return [area, position].filter(Boolean).join(' · ');
  }

  function serviceHours(slot: ActualSlot): string {
    if (slot.actualHours) return formatHours(slot.actualHours);
    if (slot.truth.plan) {
      return formatHours(hoursBetweenClocks(slot.truth.plan.startsAt, slot.truth.plan.endsAt));
    }
    return '';
  }
</script>

{#if primary}
  <button
    class="attendance-card"
    class:is-actual={hasActual}
    class:is-planned={!hasActual && plannedHours > 0}
    class:is-compact={compact}
    style={`--card-color:${cardColor}`}
    type="button"
    onclick={() => onopen(primary.key)}
  >
    {#if signalLabel}
      <span
        class="attendance-card__signal"
        class:is-problem={noShow || conflict}
        class:is-attention={adjusted || pending}
        class:is-live={live}
        title={signalLabel}
        aria-label={signalLabel}
      ></span>
    {/if}
    <span class="attendance-card__top">
      <strong>{mainRange}</strong>
      <b>{actualHours ? formatHours(actualHours) : plannedHours ? formatHours(plannedHours) : '—'}</b>
    </span>
    <span class="attendance-card__summary">
      <span>{primaryLabel}</span>
      {#if breakMinutes}
        <i></i><span>{t('{minutes}m break', { minutes: breakMinutes })}</span>
      {:else if actualHours}
        <i></i><span>{t('No break')}</span>
      {/if}
      {#if actualHours && plannedHours && Math.abs(actualHours - plannedHours) >= 0.01}
        <i></i><span>{t('Planned')} {formatHours(plannedHours)}</span>
      {/if}
    </span>
    <span class="attendance-card__services">
      {#each visible as slot (slot.key)}
        <span class="service-row is-{slot.serviceKey}">
          <span class="service-row__icon" title={t(serviceLabel(slot.serviceKey, services))}>
            <WorkspaceServiceIcon service={slot.serviceKey} size={12} />
          </span>
          <span class="service-row__range">{displayRange(slot)}</span>
          <span class="service-row__assignment">{assignment(slot) || t(serviceLabel(slot.serviceKey, services))}</span>
          <b>{serviceHours(slot)}</b>
        </span>
      {/each}
    </span>
  </button>
{/if}

<style>
  .attendance-card {
    width: calc(100% - 8px);
    min-height: 76px;
    display: grid;
    align-content: start;
    gap: 3px;
    position: relative;
    margin: 4px;
    padding: 7px 9px 6px;
    overflow: hidden;
    isolation: isolate;
    border: 1px solid color-mix(in srgb, var(--card-color) 68%, var(--cl-line-strong));
    border-radius: 3px;
    background: var(--cl-surface);
    color: var(--cl-ink);
    font: inherit;
    font-variant-numeric: tabular-nums;
    text-align: left;
    cursor: pointer;
    box-shadow: 0 1px 2px rgb(15 23 42 / .035);
    transition: border-color var(--cl-dur) var(--cl-ease), box-shadow var(--cl-dur) var(--cl-ease), transform var(--cl-dur) var(--cl-ease);
    --card-color: var(--cl-info);
  }
  .attendance-card::before {
    content: '';
    position: absolute;
    z-index: 1;
    top: 0;
    right: 0;
    left: 0;
    height: 2px;
    background: var(--card-color);
    opacity: .92;
    pointer-events: none;
  }
  .attendance-card:hover {
    border-color: color-mix(in srgb, var(--card-color) 84%, var(--cl-line-strong));
    box-shadow: 0 3px 9px rgb(15 23 42 / .12);
    transform: translateY(-1px);
  }
  .attendance-card:focus-visible { outline: 2px solid color-mix(in srgb, var(--card-color) 32%, transparent); outline-offset: 1px; }
  .attendance-card.is-planned {
    border-color: color-mix(in srgb, var(--cl-muted) 28%, var(--cl-line));
    border-style: dashed;
    box-shadow: none;
  }
  .attendance-card.is-planned::before { display: none; }
  .attendance-card__signal {
    width: 7px;
    height: 7px;
    position: absolute;
    z-index: 3;
    top: 6px;
    right: 6px;
    border-radius: 50%;
    background: var(--cl-attention);
    box-shadow: 0 0 0 3px color-mix(in srgb, var(--cl-attention) 12%, transparent);
  }
  .attendance-card__signal.is-problem {
    background: var(--cl-problem);
    box-shadow: 0 0 0 3px color-mix(in srgb, var(--cl-problem) 12%, transparent);
  }
  .attendance-card__signal.is-live {
    background: var(--cl-ok);
    box-shadow: 0 0 0 3px color-mix(in srgb, var(--cl-ok) 12%, transparent);
    animation: live-pulse 1.8s var(--cl-ease) infinite;
  }
  .attendance-card__top {
    min-width: 0;
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 8px;
    padding-right: 8px;
  }
  .attendance-card__top strong { overflow: hidden; color: var(--cl-ink); font-size: 12px; line-height: 1.1; text-overflow: ellipsis; white-space: nowrap; }
  .attendance-card__top b { flex: 0 0 auto; color: color-mix(in srgb, var(--card-color) 78%, var(--cl-ink)); font-size: 10px; }
  .attendance-card__summary {
    min-width: 0;
    display: flex;
    align-items: center;
    gap: 4px;
    overflow: hidden;
    color: var(--cl-muted);
    font-size: 8.5px;
    line-height: 1.2;
    white-space: nowrap;
  }
  .attendance-card__summary > span { overflow: hidden; text-overflow: ellipsis; }
  .attendance-card__summary i { width: 2px; height: 2px; flex: 0 0 auto; border-radius: 50%; background: var(--cl-line-strong); }
  .attendance-card__services { min-width: 0; display: grid; gap: 1px; margin-top: 1px; }
  .service-row {
    min-width: 0;
    display: grid;
    grid-template-columns: 13px auto minmax(0, 1fr) auto;
    align-items: center;
    gap: 4px;
    color: var(--cl-muted);
    font-size: 8.5px;
    line-height: 1.3;
  }
  .service-row__icon { display: grid; place-items: center; color: var(--cl-lunch); }
  .service-row.is-evening .service-row__icon { color: var(--cl-evening); }
  .service-row__range { color: color-mix(in srgb, var(--cl-ink) 78%, var(--cl-muted)); font-weight: var(--rst-fw-bold); white-space: nowrap; }
  .service-row__assignment { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .service-row b { color: color-mix(in srgb, var(--card-color) 72%, var(--cl-ink)); font-size: 8.5px; white-space: nowrap; }
  .attendance-card.is-planned .attendance-card__top b,
  .attendance-card.is-planned .service-row__range,
  .attendance-card.is-planned .service-row b { color: var(--cl-muted); }
  .attendance-card.is-planned .service-row__icon { color: var(--cl-muted); opacity: .58; }
  .attendance-card.is-compact {
    min-height: 60px;
    align-content: center;
    gap: 5px;
  }
  .attendance-card.is-compact .attendance-card__services { display: none; }
  .attendance-card.is-compact .attendance-card__summary {
    font-size: 9px;
  }
  @media (max-width: 1180px) {
    .attendance-card {
      width: calc(100% - 4px);
      margin: 2px;
      padding: 6px;
    }
    .attendance-card__top {
      gap: 2px;
      padding-right: 6px;
    }
    .attendance-card__top strong { font-size: 10px; }
    .attendance-card__top b { font-size: 8px; }
    .attendance-card__summary { font-size: 8px; }
    .service-row { grid-template-columns: 13px minmax(0, 1fr); gap: 3px; }
    .service-row__range,
    .service-row > b { display: none; }
  }
  @keyframes live-pulse {
    50% { opacity: .55; box-shadow: 0 0 0 6px color-mix(in srgb, var(--cl-ok) 0%, transparent); }
  }
</style>
