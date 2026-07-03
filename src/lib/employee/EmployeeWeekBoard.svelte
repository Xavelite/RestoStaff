<script lang="ts">
  import type { WeekColumn, WeekRow } from '$lib/calendar/week-grid';
  import { serviceDisplay, type ServiceKey } from '$lib/calendar/date';
  import ServiceSlotSurface from '$lib/components/ServiceSlotSurface.svelte';

  // Employee-native weekly board: one employee, days as rows, services as columns.
  // It reuses the shared slot truth/presentation surface, but does not force the
  // manager grid layout on self-service pages.
  let {
    rows,
    days,
    selectedKeys = [],
    emptySelectable = true,
    onselect,
    ondetails,
    label
  }: {
    rows: WeekRow[];
    days: WeekColumn[];
    selectedKeys?: string[];
    emptySelectable?: boolean;
    onselect: (key: string) => void;
    ondetails?: (key: string) => void;
    label: string;
  } = $props();

  const row = $derived(rows[0]);
  const services = $derived(['lunch', 'evening'] as ServiceKey[]);
</script>

<section class="employee-week" aria-label={label}>
  <div class="employee-week__scroll">
    <div class="employee-week__head">
      <span>Day</span>
      {#each services as serviceKey (serviceKey)}
        <span>{serviceDisplay(serviceKey).label}</span>
      {/each}
    </div>

    {#if row}
      {#each days as day, dayIndex (day.date)}
        {@const cell = row.cells.find((item) => item.date === day.date)}
        <article
          class="employee-week__row"
          class:is-today={day.today}
          class:is-past={day.past}
          class:is-day-alternate={dayIndex % 2 === 1}
        >
          <header class="employee-week__day">
            <strong>{day.label}</strong>
            <span>{day.date.slice(8)}/{day.date.slice(5, 7)}</span>
            {#if day.today}<small>Today</small>{/if}
          </header>

          {#each services as serviceKey (serviceKey)}
            {@const slot = cell?.slots.find((item) => item.serviceKey === serviceKey)}
            <div class="employee-week__slot">
              {#if slot}
                <ServiceSlotSurface
                  presentation={slot.presentation}
                  {serviceKey}
                  selected={selectedKeys.includes(slot.key)}
                  past={day.past}
                  dayRhythm={dayIndex % 2 === 1 ? 'alternate' : 'base'}
                  disabled={!slot.presentation.card && !emptySelectable}
                  onclick={() => {
                    if (slot.presentation.card || emptySelectable) onselect(slot.key);
                  }}
                  ondetails={ondetails ? () => ondetails(slot.key) : undefined}
                  ariaLabel={`${day.label} ${day.date} · ${serviceDisplay(serviceKey).label}`}
                />
              {/if}
            </div>
          {/each}
        </article>
      {/each}
    {/if}
  </div>
</section>

<style>
  .employee-week {
    min-width: 0;
    overflow: hidden;
    border: 1px solid var(--rst-ui-line);
    border-radius: var(--rst-ui-radius-xl);
    background: var(--rst-calendar-board-bg);
  }

  .employee-week__scroll {
    min-width: 0;
    overflow: auto;
  }

  .employee-week__head,
  .employee-week__row {
    min-width: 720px;
    display: grid;
    grid-template-columns: 140px repeat(2, minmax(220px, 1fr));
  }

  .employee-week__head {
    position: sticky;
    top: 0;
    z-index: 2;
    background: var(--rst-calendar-header-bg);
    border-bottom: 1px solid var(--rst-ui-line);
  }

  .employee-week__head span {
    padding: 9px 10px;
    color: var(--rst-ui-muted);
    font-size: 11px;
    font-weight: var(--rst-fw-bold);
    letter-spacing: 0.04em;
    text-transform: uppercase;
  }

  .employee-week__head span:not(:first-child) {
    text-align: center;
  }

  .employee-week__row {
    min-height: 64px;
    border-bottom: 1px solid var(--rst-ui-divider-soft);
  }

  .employee-week__row:last-child {
    border-bottom: 0;
  }

  .employee-week__row.is-day-alternate {
    background: rgba(255, 255, 255, 0.012);
  }

  .employee-week__day {
    display: grid;
    align-content: center;
    gap: 2px;
    padding: 10px 12px;
    border-right: 1px solid var(--rst-ui-divider-soft);
    background: var(--rst-calendar-person-bg);
  }

  .employee-week__day strong {
    color: var(--rst-ui-text);
    font-size: 14px;
  }

  .employee-week__day span,
  .employee-week__day small {
    color: var(--rst-ui-muted);
    font-size: 10px;
    font-weight: var(--rst-fw-bold);
  }

  .employee-week__row.is-today .employee-week__day strong {
    color: var(--rst-state-info-text);
  }

  .employee-week__row.is-past .employee-week__day {
    color: color-mix(in srgb, var(--rst-ui-text) 84%, var(--rst-ui-muted));
  }

  .employee-week__slot {
    min-height: 64px;
    border-right: 1px solid var(--rst-ui-divider-soft);
  }

  .employee-week__slot:last-child {
    border-right: 0;
  }

  @media (max-width: 760px) {
    .employee-week__head,
    .employee-week__row {
      min-width: 0;
      grid-template-columns: 1fr;
    }

    .employee-week__head {
      display: none;
    }

    .employee-week__row {
      gap: 0;
      padding: 0;
    }

    .employee-week__day,
    .employee-week__slot {
      border-right: 0;
      border-bottom: 1px solid var(--rst-ui-divider-soft);
    }
  }
</style>
