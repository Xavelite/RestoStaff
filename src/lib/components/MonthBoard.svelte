<script lang="ts">
  import type { CalendarDay } from '$lib/calendar/calendar-model';
  import { serviceDisplay, WEEKDAYS, type ServiceKey } from '$lib/calendar/date';
  import ServiceSlotSurface from './ServiceSlotSurface.svelte';

  let {
    days,
    label,
    selectedKeys = [],
    onselect,
    onselectslot,
    ondetails
  }: {
    days: CalendarDay[];
    label: string;
    selectedKeys?: string[];
    onselect: (date: string) => void;
    onselectslot: (date: string, serviceKey: ServiceKey) => void;
    ondetails?: (date: string, serviceKey: ServiceKey) => void;
  } = $props();

  const selectedDay = $derived(days.find((day) => day.selected) ?? days.find((day) => day.today) ?? days[0]);
  const selectedDayIndex = $derived(
    selectedDay ? days.findIndex((day) => day.date === selectedDay.date) : -1
  );
</script>

<section class="calendar" aria-label={label}>
  <div class="calendar__weekdays">
    {#each WEEKDAYS as weekday}<span>{weekday}</span>{/each}
    <span>Week</span>
  </div>

  <div class="calendar__grid">
    {#each days as day, index (day.date)}
      <article
        class="day"
        class:is-outside={!day.inMonth}
        class:is-selected={day.selected}
        class:is-today={day.today}
        class:is-past={day.past}
        class:is-day-alternate={index % 2 === 1}
      >
        <header>
          <button type="button" onclick={() => onselect(day.date)} aria-label={day.date}>
            <strong>{day.dayNumber}</strong>
          </button>
          {#if day.total}<small>{day.total}</small>{/if}
        </header>
        <div class="day__items">
          {#each day.slots as slot (slot.key)}
            <ServiceSlotSurface
              presentation={slot.presentation}
              serviceKey={slot.serviceKey}
              selected={selectedKeys.includes(slot.key)}
              past={day.past}
              dayRhythm={index % 2 === 1 ? 'alternate' : 'base'}
              compact
              onclick={() => onselectslot(day.date, slot.serviceKey)}
              ondetails={ondetails ? () => ondetails(day.date, slot.serviceKey) : undefined}
              ariaLabel={`${day.date} · ${serviceDisplay(slot.serviceKey).label}`}
            />
          {/each}
        </div>
      </article>

      {#if (index + 1) % 7 === 0}
        <div class="week-total">
          <span>Week</span>
          <b>{day.weekTotal || '—'}</b>
        </div>
      {/if}
    {/each}
  </div>

  <div class="mobile-month">
    <div class="mobile-weekdays">
      {#each WEEKDAYS as weekday}<span>{weekday.slice(0, 2)}</span>{/each}
    </div>
    <div class="mobile-dates">
      {#each days as day (day.date)}
        <button
          type="button"
          class:is-outside={!day.inMonth}
          class:is-selected={day.selected}
          class:is-today={day.today}
          class:is-past={day.past}
          class:has-items={day.slots.some((slot) => Boolean(slot.presentation.card))}
          onclick={() => onselect(day.date)}
          aria-label={day.date}
        >
          {day.dayNumber}
        </button>
      {/each}
    </div>
    {#if selectedDay}
      <section class="mobile-detail">
        <header><strong>{selectedDay.date}</strong><span>{selectedDay.total || 'No activity'}</span></header>
        <div>
          {#each selectedDay.slots as slot (slot.key)}
            <ServiceSlotSurface
              presentation={slot.presentation}
              serviceKey={slot.serviceKey}
              selected={selectedKeys.includes(slot.key)}
              past={selectedDay.past}
              dayRhythm={selectedDayIndex % 2 === 1 ? 'alternate' : 'base'}
              onclick={() => onselectslot(selectedDay.date, slot.serviceKey)}
              ondetails={ondetails ? () => ondetails(selectedDay.date, slot.serviceKey) : undefined}
              ariaLabel={`${selectedDay.date} · ${serviceDisplay(slot.serviceKey).label}`}
            />
          {/each}
        </div>
      </section>
    {/if}
  </div>
</section>

<style>
  .calendar {
    overflow: auto;
    background: var(--rst-calendar-board-bg);
    border: 1px solid var(--rst-ui-line);
    border-radius: var(--rst-ui-radius-xl);
  }

  .calendar__weekdays,
  .calendar__grid {
    min-width: 980px;
    display: grid;
    grid-template-columns: repeat(7, minmax(122px, 1fr)) 68px;
  }

  .mobile-month {
    display: none;
  }

  .calendar__weekdays {
    position: sticky;
    top: 0;
    z-index: 2;
    background: var(--rst-calendar-header-bg);
    border-bottom: 1px solid var(--rst-ui-line);
  }

  .calendar__weekdays span {
    padding: 10px;
    color: var(--rst-ui-muted);
    font-size: 11px;
    font-weight: var(--rst-fw-bold);
    letter-spacing: 0.05em;
    text-align: center;
    text-transform: uppercase;
  }

  .day {
    position: relative;
    min-height: 126px;
    display: flex;
    flex-direction: column;
    gap: 7px;
    padding: 9px;
    border: 0;
    border-right: 1px solid var(--rst-ui-divider-soft);
    border-bottom: 1px solid var(--rst-ui-divider-soft);
    color: var(--rst-ui-text);
    background: var(--rst-calendar-cell-bg);
    font: inherit;
    text-align: left;
  }

  .day.is-outside {
    opacity: 0.42;
  }

  .day.is-day-alternate {
    background: color-mix(in srgb, var(--rst-calendar-cell-bg) 98%, white);
  }

  .day.is-past {
    color: color-mix(in srgb, var(--rst-ui-text) 84%, var(--rst-ui-muted));
  }

  .day.is-selected {
    box-shadow: inset 0 0 0 2px var(--rst-ui-action);
  }

  .day.is-today header strong {
    color: var(--rst-state-info-text);
  }

  .day header {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .day header button {
    padding: 0;
    border: 0;
    color: inherit;
    background: transparent;
    font: inherit;
    cursor: pointer;
  }

  .day header strong {
    font-size: 13px;
  }

  .day header small {
    color: var(--rst-ui-muted);
    font-size: 10px;
    font-style: normal;
  }

  .day__items {
    flex: 1;
    min-height: 0;
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 1px;
    /* The two Lunch/Evening half-cell surfaces tile flush; the 1px gap shows this
       divider, matching the weekly grid. */
    background: var(--rst-ui-divider-soft);
  }

  .week-total {
    min-height: 126px;
    display: grid;
    place-content: center;
    gap: 3px;
    border-bottom: 1px solid var(--rst-ui-divider-soft);
    color: var(--rst-ui-muted);
    background: var(--rst-calendar-total-bg);
    text-align: center;
  }

  .week-total span {
    font-size: 9px;
    font-weight: var(--rst-fw-bold);
    text-transform: uppercase;
  }

  .week-total b {
    color: var(--rst-ui-text);
    font-size: 12px;
  }

  @media (max-width: 760px) {
    .calendar__weekdays,
    .calendar__grid {
      display: none;
    }

    .mobile-month {
      display: block;
    }

    .mobile-weekdays,
    .mobile-dates {
      display: grid;
      grid-template-columns: repeat(7, minmax(0, 1fr));
    }

    .mobile-weekdays {
      padding: 8px 8px 4px;
      color: var(--rst-ui-muted);
      font-size: 9px;
      font-weight: var(--rst-fw-bold);
      text-align: center;
      text-transform: uppercase;
    }

    .mobile-dates {
      gap: 3px;
      padding: 4px 8px 10px;
      border-bottom: 1px solid var(--rst-ui-divider-soft);
    }

    .mobile-dates button {
      position: relative;
      aspect-ratio: 1;
      min-height: 38px;
      border: 1px solid transparent;
      border-radius: var(--rst-ui-radius-md);
      color: var(--rst-ui-text);
      background: transparent;
      font: inherit;
      font-size: 12px;
      cursor: pointer;
    }

    .mobile-dates button.is-outside {
      opacity: .35;
    }

    .mobile-dates button.is-today {
      color: var(--rst-state-info-text);
    }

    .mobile-dates button.is-past {
      background-image: repeating-linear-gradient(
        135deg,
        rgba(255, 255, 255, 0.055) 0,
        rgba(255, 255, 255, 0.055) 1px,
        transparent 1px,
        transparent 7px
      );
    }

    .mobile-dates button.is-selected {
      border-color: var(--rst-state-selected-border);
      background: var(--rst-state-selected-bg);
    }

    .mobile-dates button.has-items::after {
      content: '';
      position: absolute;
      left: 50%;
      bottom: 4px;
      width: 4px;
      height: 4px;
      border-radius: 50%;
      background: var(--rst-state-info);
      transform: translateX(-50%);
    }

    .mobile-detail > header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      padding: 10px 12px;
      border-bottom: 1px solid var(--rst-ui-divider-soft);
      font-size: 11px;
    }

    .mobile-detail > header span {
      color: var(--rst-ui-muted);
    }

    .mobile-detail > div {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 1px;
      padding: 10px;
      background: var(--rst-ui-divider-soft);
    }

  }

  @media (max-width: 520px) {
    .mobile-detail > div {
      grid-template-columns: 1fr;
    }
  }
</style>
