<script lang="ts" module>
  // The one shared board for every manager weekly/monthly operations grid
  // (Schedule + Timesheet). Owns grid geometry, sticky staff/total columns,
  // the today-highlight, the tone/gradient vocabulary and week/month
  // compaction. Each page maps its own domain model (planned shifts, time
  // entries) into this plain-data shape — no page-specific markup crosses
  // the boundary, so the two boards can never visually drift apart again.
  export type BoardTone =
    | 'planned'
    | 'expected'
    | 'available'
    | 'partial'
    | 'unavailable'
    | 'blocked'
    | 'pending'
    | 'conflict'
    | 'neutral'
    | 'live'
    | 'missing'
    | 'recorded'
    | 'adjusted'
    | 'absence'
    | 'empty'
    | 'danger'
    | 'warning'
    | 'ready'
    | 'bench'
    | 'short'
    | 'attention'
    | 'quiet'
    | 'future'
    | 'worked'
    | 'review';

  export type BoardColumn = {
    date: string;
    label: string;
    day: string;
    month?: string;
    today: boolean;
    future?: boolean;
  };

  export type BoardChip = {
    key: string;
    initials: string;
    tone: BoardTone;
    name: string;
    detail: string;
    area?: string;
    color?: string;
    selected?: boolean;
    liveSince?: string | null;
    onclick: () => void;
    ariaLabel: string;
  };

  export type BoardSlot = {
    key: string;
    tone: BoardTone;
    icon: string;
    main: string;
    detail: string;
    area?: string;
    color?: string;
    selected?: boolean;
    disabled?: boolean;
    liveSince?: string | null;
    onclick: () => void;
    onmore?: () => void;
    moreLabel?: string;
    ariaLabel: string;
  };

  export type BoardRow = {
    id: string;
    name: string;
    meta?: string;
    color?: string;
    avatarTone?: 'neutral' | 'live' | 'danger' | 'warning';
    reviewCount?: number;
    totalLabel: string;
    totalMeta?: string;
  };

  // One coverage requirement (area × role) for a service, with who is filling
  // it and how it stands against the required count.
  export type BoardServiceCoverageRow = {
    key: string;
    areaLabel: string;
    roleLabel: string;
    planned: number;
    required: number;
    tone: 'ok' | 'short';
    chips: BoardChip[];
    onLocate?: () => void;
  };

  export type BoardServiceCard = {
    id?: string;
    serviceKey: string;
    icon: string;
    label: string;
    tone: BoardTone;
    summaryValue: string;
    onHeaderClick?: () => void;
    chips: BoardChip[];
    coverage?: BoardServiceCoverageRow[];
    emptyLabel?: string;
    fillLabel?: string;
    onFillClick?: () => void;
    secondaryLabel?: string;
    secondaryChips?: BoardChip[];
    secondaryOverflow?: number;
  };

  export type BoardDayRail = {
    date: string;
    label: string;
    value: string;
    meta: string;
    hasGap?: boolean;
    onclick?: () => void;
  };

  export type BoardLane = {
    serviceKey: string;
    icon: string;
    tone: BoardTone;
    value: string;
    reviewCount?: number;
    onclick: () => void;
    ariaLabel: string;
  };

  export type BoardMonthDay = {
    date: string;
    dayNumber: string;
    today: boolean;
    outside?: boolean;
    tone: BoardTone;
    totalLabel?: string;
    reviewCount?: number;
    lanes: BoardLane[];
  };

  export type BoardFooterCell = { value: string; tone?: 'ok' | 'gap' | 'neutral' };
</script>

<script lang="ts">
  import { tick } from 'svelte';
  import { t } from '$lib/i18n/i18n.svelte';
  import { SERVICES, serviceLabel } from '$lib/calendar/date';
  import { weatherCondition, type DailyWeather } from '$lib/weather/weather';
  import WeatherIcon from '$lib/weather/WeatherIcon.svelte';
  import LiveDuration from '$lib/components/LiveDuration.svelte';
  import { personInitials } from '$lib/ui/person';
  import StaffChip from './StaffChip.svelte';

  let {
    view,
    periodMode = 'week',
    expanded = false,
    columns,
    weatherFor,
    rows,
    slotsFor,
    dayRails = [],
    serviceCardsFor,
    monthDays = [],
    footerLabel = '',
    footerCells = [],
    emptyMessage = 'No employees match this lens.',
    label
  }: {
    view: 'service' | 'roster';
    periodMode?: 'week' | 'month';
    expanded?: boolean;
    columns: BoardColumn[];
    weatherFor?: (date: string) => DailyWeather | null;
    rows: BoardRow[];
    slotsFor?: (rowId: string, date: string) => BoardSlot[];
    dayRails?: BoardDayRail[];
    serviceCardsFor?: (date: string) => BoardServiceCard[];
    monthDays?: BoardMonthDay[];
    footerLabel?: string;
    footerCells?: BoardFooterCell[];
    emptyMessage?: string;
    label: string;
  } = $props();

  const isMonth = $derived(periodMode === 'month');
  let mobileDate = $state('');
  let mobileDaysElement = $state<HTMLElement>();
  const mobileColumn = $derived(
    columns.find((column) => column.date === mobileDate) ??
      columns.find((column) => column.today) ??
      columns[0]
  );
  const mobileColumnIndex = $derived(
    mobileColumn ? columns.findIndex((column) => column.date === mobileColumn.date) : -1
  );

  $effect(() => {
    if (!columns.length) {
      mobileDate = '';
      return;
    }
    if (!columns.some((column) => column.date === mobileDate)) {
      mobileDate = columns.find((column) => column.today)?.date ?? columns[0].date;
    }
  });

  $effect(() => {
    if (!mobileDate || !mobileDaysElement) return;
    let cancelled = false;
    void tick().then(() => {
      if (cancelled) return;
      mobileDaysElement
        ?.querySelector<HTMLElement>('[aria-pressed="true"]')
        ?.scrollIntoView({ block: 'nearest', inline: 'center' });
    });
    return () => {
      cancelled = true;
    };
  });

  function weatherTone(weather: DailyWeather): 'fair' | 'cloud' | 'wet' | 'frost' | 'storm' {
    if ([95, 96, 99].includes(weather.code)) return 'storm';
    if ([71, 73, 75, 77, 85, 86].includes(weather.code)) return 'frost';
    if (weather.rainChance >= 55 || [51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82].includes(weather.code)) {
      return 'wet';
    }
    if ([2, 3, 45, 48].includes(weather.code)) return 'cloud';
    return 'fair';
  }

  // Toggle at-start/at-end classes so the pinned staff/NET columns only cast an
  // inward shadow while there are more days to scroll toward.
  function scrollShadows(node: HTMLElement) {
    const update = () => {
      node.classList.toggle('at-start', node.scrollLeft <= 1);
      node.classList.toggle('at-end', node.scrollLeft + node.clientWidth >= node.scrollWidth - 1);
    };
    update();
    node.addEventListener('scroll', update, { passive: true });
    const observer = new ResizeObserver(update);
    observer.observe(node);
    return {
      destroy() {
        node.removeEventListener('scroll', update);
        observer.disconnect();
      }
    };
  }
</script>

<section
  class={`operations-board is-${view}`}
  class:is-expanded={expanded}
  class:is-month={isMonth}
  aria-label={t(label)}
>
  {#if view === 'roster'}
    <div class="mobile-roster">
      <nav bind:this={mobileDaysElement} class="mobile-roster__days" aria-label={t('Choose roster day')}>
        {#each columns as column (column.date)}
          {@const weather = weatherFor?.(column.date)}
          <button
            type="button"
            class:is-current={mobileColumn?.date === column.date}
            class:is-today={column.today}
            aria-pressed={mobileColumn?.date === column.date}
            onclick={() => (mobileDate = column.date)}
          >
            <span>{column.label}</span>
            <strong>{column.day}</strong>
            {#if weather}
              <i class={`is-${weatherTone(weather)}`} aria-hidden="true">
                <WeatherIcon code={weather.code} size={18} />
              </i>
            {/if}
          </button>
        {/each}
      </nav>

      {#if mobileColumn}
        {@const selectedWeather = weatherFor?.(mobileColumn.date)}
        <header class="mobile-roster__summary">
          <div>
            <span>{t('Roster day')}</span>
            <strong>{mobileColumn.label} {mobileColumn.day}</strong>
            {#if selectedWeather}
              <small>{t(weatherCondition(selectedWeather.code))} · {Math.round(selectedWeather.lowC)}–{Math.round(selectedWeather.highC)}° · {selectedWeather.rainChance}% {t('rain')}</small>
            {/if}
          </div>
          {#if footerLabel && mobileColumnIndex >= 0 && footerCells[mobileColumnIndex]}
            <div class={`mobile-roster__day-total is-${footerCells[mobileColumnIndex].tone ?? 'neutral'}`}>
              <span>{t(footerLabel)}</span>
              <strong>{footerCells[mobileColumnIndex].value}</strong>
            </div>
          {/if}
        </header>

        <div class="mobile-roster__people">
          {#each rows as row (row.id)}
            {@const mobileSlots = slotsFor?.(row.id, mobileColumn.date) ?? []}
            <article class={`mobile-person is-${row.avatarTone ?? 'neutral'}`} style={row.color ? `--person-color:${row.color};` : undefined}>
              <header>
                <span class="mobile-person__avatar">{personInitials(row.name)}</span>
                <div class="mobile-person__identity">
                  <strong>{row.name}</strong>
                  <small>{t(row.meta || 'Staff')}</small>
                </div>
                {#if row.reviewCount}<em class="mobile-person__review">{row.reviewCount}</em>{/if}
                <div class="mobile-person__net">
                  <span>{t('Net')}</span>
                  <strong>{row.totalLabel}</strong>
                  {#if row.totalMeta}<small>{t(row.totalMeta)}</small>{/if}
                </div>
              </header>

              <div class="mobile-person__services">
                {#each mobileSlots as slot, slotIndex (slot.key)}
                  <section class="mobile-service">
                    <span class="mobile-service__label"><i>{slot.icon}</i>{t(serviceLabel(SERVICES[slotIndex] ?? SERVICES[0]))}</span>
                    <div
                      class={`roster-slot is-${slot.tone}`}
                      class:is-selected={slot.selected}
                      class:is-disabled={slot.disabled}
                      style={slot.color ? `--slot-accent:${slot.color};` : undefined}
                    >
                      <button
                        type="button"
                        class="roster-slot__tap"
                        disabled={slot.disabled}
                        onclick={slot.onclick}
                        aria-label={slot.ariaLabel}
                      >
                        <strong>{t(slot.main)}</strong>
                        {#if slot.liveSince}
                          <small><LiveDuration since={slot.liveSince} /></small>
                        {:else if slot.detail}
                          <small>{t(slot.detail)}</small>
                        {/if}
                        {#if slot.area}<em>{t(slot.area)}</em>{/if}
                      </button>
                      {#if slot.onmore && !slot.disabled}
                        <button type="button" class="roster-slot__more" onclick={slot.onmore} aria-label={t(slot.moreLabel ?? 'More actions')}>⋯</button>
                      {/if}
                    </div>
                  </section>
                {/each}
              </div>
            </article>
          {:else}
            <p class="mobile-roster__empty">{t(emptyMessage)}</p>
          {/each}
        </div>
      {/if}
    </div>

    <div class="roster-ledger" class:is-month={isMonth} use:scrollShadows>
      <div class="roster-grid" style={`--day-count:${columns.length}`}>
        <div class="roster-head roster-head--staff">{t('Staff')}</div>
        {#each columns as column (column.date)}
          {@const weather = weatherFor?.(column.date)}
          <div class="roster-head roster-head--day" class:is-today={column.today}>
            <div class="roster-head__line">
              <span class="roster-head__date">
                <span>{column.label}</span>
                <strong>{column.day}</strong>
                {#if isMonth && column.month}
                  <small>{column.month}</small>
                {/if}
              </span>
              {#if weather}
                <div
                  class={`board-weather is-${weatherTone(weather)}`}
                  aria-label={`${t(weatherCondition(weather.code))} · ${Math.round(weather.lowC)}–${Math.round(weather.highC)}° · ${weather.rainChance}% ${t('rain')}`}
                  title={`${t(weatherCondition(weather.code))} · ${Math.round(weather.lowC)}–${Math.round(weather.highC)}° · ${weather.rainChance}% ${t('rain')}`}
                >
                  <WeatherIcon code={weather.code} size={18} />
                  <span class="board-weather__temp">{Math.round(weather.highC)}°</span>
                </div>
              {/if}
            </div>
          </div>
        {/each}
        <div class="roster-head roster-head--total">{t('Net')}</div>

        {#each rows as row (row.id)}
          <article
            class={`roster-person is-${row.avatarTone ?? 'neutral'}`}
            style={row.color ? `--person-color:${row.color};` : undefined}
          >
            <span>{personInitials(row.name)}</span>
            <div>
              <strong>{row.name}</strong>
              <small>{t(row.meta || 'Staff')}</small>
            </div>
            {#if row.reviewCount}
              <em>{row.reviewCount}</em>
            {/if}
          </article>

          {#each columns as column (column.date)}
            <div class="roster-day" class:is-today={column.today} class:is-future={column.future}>
              {#each slotsFor?.(row.id, column.date) ?? [] as slot (slot.key)}
                <div
                  class={`roster-slot is-${slot.tone}`}
                  class:is-selected={slot.selected}
                  class:is-disabled={slot.disabled}
                  style={slot.color ? `--slot-accent:${slot.color};` : undefined}
                >
                  <button
                    type="button"
                    class="roster-slot__tap"
                    disabled={slot.disabled}
                    onclick={slot.onclick}
                    aria-label={slot.ariaLabel}
                    title={slot.ariaLabel}
                  >
                    <span>{slot.icon}</span>
                    <strong>{t(slot.main)}</strong>
                    {#if slot.liveSince}
                      <small><LiveDuration since={slot.liveSince} /></small>
                    {:else if slot.detail}
                      <small>{t(slot.detail)}</small>
                    {/if}
                    {#if expanded && slot.area}
                      <em>{t(slot.area)}</em>
                    {/if}
                  </button>
                  {#if slot.onmore && !slot.disabled}
                    <button
                      type="button"
                      class="roster-slot__more"
                      onclick={slot.onmore}
                      aria-label={t(slot.moreLabel ?? 'More actions')}
                    >⋯</button>
                  {/if}
                </div>
              {/each}
            </div>
          {/each}

          <div class="roster-total">
            <strong>{row.totalLabel}</strong>
            {#if row.totalMeta}<small>{t(row.totalMeta)}</small>{/if}
          </div>
        {:else}
          <p class="roster-empty">{t(emptyMessage)}</p>
        {/each}

        {#if footerLabel && footerCells.length}
          <div class="roster-footer">
            <span>{t(footerLabel)}</span>
            {#each footerCells as cell, index (index)}
              <strong class={`is-${cell.tone ?? 'neutral'}`}>{cell.value}</strong>
            {/each}
            <span></span>
          </div>
        {/if}
      </div>
    </div>
  {:else if isMonth}
    <div class="board-month" aria-label={t(label)}>
      <div class="board-month__weekdays" aria-hidden="true">
        {#each columns.slice(0, 7) as column (column.date)}
          <span>{column.label}</span>
        {/each}
      </div>
      {#each Array.from({ length: Math.ceil(monthDays.length / 7) }, (_, index) => monthDays.slice(index * 7, index * 7 + 7)) as week, weekIndex (weekIndex)}
        <div class="board-month__week">
          {#each week as day (day.date)}
            {@const weather = weatherFor?.(day.date)}
            <article
              class={`board-month__day is-${day.tone}`}
              class:is-today={day.today}
              class:is-outside={day.outside}
            >
              <header>
                <span>{day.dayNumber}</span>
                {#if day.totalLabel}<strong>{day.totalLabel}</strong>{/if}
                {#if weather}
                  <div
                    class={`board-weather is-${weatherTone(weather)}`}
                    aria-label={`${t(weatherCondition(weather.code))} · ${Math.round(weather.lowC)}–${Math.round(weather.highC)}° · ${weather.rainChance}% ${t('rain')}`}
                    title={`${t(weatherCondition(weather.code))} · ${Math.round(weather.lowC)}–${Math.round(weather.highC)}° · ${weather.rainChance}% ${t('rain')}`}
                  >
                    <WeatherIcon code={weather.code} size={18} />
                    <span class="board-weather__temp">{Math.round(weather.highC)}°</span>
                  </div>
                {/if}
                {#if day.reviewCount}<em>{day.reviewCount}</em>{/if}
              </header>
              <div class="board-month__lanes">
                {#each day.lanes as lane (lane.serviceKey)}
                  <button
                    type="button"
                    class={`board-lane is-${lane.serviceKey} is-${lane.tone}`}
                    onclick={lane.onclick}
                    aria-label={lane.ariaLabel}
                  >
                    <span>{lane.icon}</span>
                    <strong>{lane.value}</strong>
                    {#if lane.reviewCount}<em>{lane.reviewCount}</em>{/if}
                  </button>
                {/each}
              </div>
            </article>
          {/each}
        </div>
      {/each}
    </div>
  {:else}
    <div class="board-service">
      {#each dayRails as rail (rail.date)}
        {@const weather = weatherFor?.(rail.date)}
        <article class="service-day" class:is-today={columns.find((c) => c.date === rail.date)?.today}>
          <button type="button" class="service-day__rail" onclick={rail.onclick}>
            <span class="service-day__date-line">
              <span class="service-day__weekday">{rail.label}</span>
              <strong>{rail.value}</strong>
              {#if weather}
                <span
                  class={`service-day__weather is-${weatherTone(weather)}`}
                  aria-label={`${t(weatherCondition(weather.code))} · ${Math.round(weather.lowC)}–${Math.round(weather.highC)}° · ${weather.rainChance}% ${t('rain')}`}
                  title={`${t(weatherCondition(weather.code))} · ${Math.round(weather.lowC)}–${Math.round(weather.highC)}° · ${weather.rainChance}% ${t('rain')}`}
                >
                  <WeatherIcon code={weather.code} size={17} />
                </span>
              {/if}
            </span>
            <small>{t(rail.meta)}</small>
          </button>

          {#each serviceCardsFor?.(rail.date) ?? [] as card (card.serviceKey)}
            <section id={card.id} class={`service-card is-${card.serviceKey} is-${card.tone}`}>
              <header>
                <button type="button" onclick={card.onHeaderClick} disabled={!card.onHeaderClick}>
                  <i>{card.icon}</i>{t(card.label)}
                </button>
                <strong>{card.summaryValue}</strong>
              </header>

              {#if card.coverage}
                <!-- Coverage breakdown: one row per area × role so gaps read as
                     "Hall · Server 1/2", not an abstract total. -->
                <div class="service-card__coverage">
                  {#each card.coverage as row (row.key)}
                    <button
                      type="button"
                      class={`coverage-row is-${row.tone}`}
                      onclick={row.onLocate}
                      disabled={!row.onLocate}
                      aria-label={`${row.areaLabel} ${row.roleLabel}: ${row.planned} of ${row.required} — open in roster`}
                    >
                      <div class="coverage-row__where">
                        <strong>{row.areaLabel}</strong>
                        <span>{row.roleLabel}</span>
                      </div>
                      <div class="coverage-row__crew">
                        {#each row.chips as chip (chip.key)}
                          <span class="coverage-row__avatar" style={chip.color ? `--avatar-color:${chip.color};` : undefined} title={chip.name}>{chip.initials}</span>
                        {/each}
                      </div>
                      <em class="coverage-row__count">{row.planned}/{row.required}</em>
                    </button>
                  {:else}
                    <span class="service-card__empty">{t('No coverage rules for this service.')}</span>
                  {/each}
                </div>
              {:else}
                <div class="service-card__chips">
                  {#each card.chips as chip (chip.key)}
                    <StaffChip {...chip} />
                  {:else}
                    <span class="service-card__empty">{t(card.emptyLabel ?? 'No one here yet')}</span>
                  {/each}
                  {#if card.fillLabel}
                    <button type="button" class="service-card__fill" onclick={card.onFillClick}>
                      {t(card.fillLabel)}
                    </button>
                  {/if}
                </div>
              {/if}

              {#if card.secondaryChips?.length}
                <footer>
                  <span>{t(card.secondaryLabel ?? '')}</span>
                  <div>
                    {#each card.secondaryChips as chip (chip.key)}
                      <StaffChip {...chip} compact />
                    {/each}
                    {#if card.secondaryOverflow}
                      <small>+{card.secondaryOverflow}</small>
                    {/if}
                  </div>
                </footer>
              {/if}
            </section>
          {/each}
        </article>
      {/each}
    </div>
  {/if}
</section>

<style>
  .operations-board {
    min-width: 0;
    color: #f8fbff;
    background: transparent;
  }

  button {
    font: inherit;
  }

  /* ---- Roster grid ------------------------------------------------- */

  .mobile-roster {
    display: none;
  }

  .roster-ledger {
    --roster-staff-column: 200px;
    --roster-day-column: 236px;
    --roster-total-column: 84px;
    min-width: 0;
    overflow: auto;
    padding: 0 0 2px;
  }

  /* Focus uses fixed-width day columns too, so the whole week shows on a wide
     desktop but the cards keep their size and scroll on a smaller window
     (rather than shrinking 7 days to fit). */
  .operations-board.is-expanded .roster-ledger {
    --roster-day-column: 202px;
    --roster-total-column: 90px;
  }

  .roster-ledger.is-month {
    --roster-staff-column: 190px;
    --roster-day-column: 92px;
    --roster-total-column: 86px;
  }

  .roster-grid {
    width: max-content;
    min-width: 100%;
    display: grid;
    grid-template-columns:
      var(--roster-staff-column)
      repeat(var(--day-count), var(--roster-day-column))
      var(--roster-total-column);
  }

  .roster-head,
  .roster-person,
  .roster-day,
  .roster-total {
    min-width: 0;
    border-right: 1px solid rgba(255, 255, 255, 0.075);
    border-bottom: 1px solid rgba(255, 255, 255, 0.075);
  }

  .roster-head {
    min-height: 58px;
    display: grid;
    align-content: center;
    gap: 0;
    padding: 10px 12px;
    color: rgba(255, 250, 242, 0.62);
    background: rgba(255, 255, 255, 0.035);
    font-size: 10px;
    font-weight: var(--rst-fw-display);
    letter-spacing: 0;
    text-transform: uppercase;
  }

  .roster-head--staff,
  .roster-person {
    position: sticky;
    left: 0;
    z-index: 3;
    background: #132235;
    transition: background-color 0.18s ease;
  }

  .roster-head--staff {
    z-index: 4;
  }

  .roster-head--total,
  .roster-total {
    position: sticky;
    right: 0;
    z-index: 2;
    background: #132235;
  }

  .roster-total {
    pointer-events: none;
  }

  .roster-head--total {
    z-index: 4;
  }

  /* Scroll affordance: the pinned columns cast an inward shadow only while more
     days remain to scroll toward, so the hidden part of the week is discoverable. */
  .roster-ledger:not(.at-start) .roster-head--staff,
  .roster-ledger:not(.at-start) .roster-person {
    box-shadow: 13px 0 18px -12px rgba(2, 8, 16, 0.7);
  }

  .roster-ledger:not(.at-end) .roster-head--total,
  .roster-ledger:not(.at-end) .roster-total {
    box-shadow: -13px 0 18px -12px rgba(2, 8, 16, 0.7);
  }

  .roster-head--day {
    position: relative;
    text-align: center;
  }

  .roster-head__line {
    position: relative;
    width: 100%;
    min-width: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
  }

  .roster-head--day .board-weather {
    position: absolute;
    right: 2px;
    top: 50%;
    transform: translateY(-50%);
  }

  .roster-head__date {
    min-width: 0;
    display: inline-flex;
    align-items: baseline;
    gap: 7px;
    white-space: nowrap;
  }

  .roster-head--day strong {
    color: #fff;
    font-size: 18px;
    line-height: 1;
    letter-spacing: 0;
  }

  .roster-head__date small {
    color: #8fa5bd;
    font-size: 8px;
    letter-spacing: 0;
  }

  .roster-ledger.is-month .roster-head__date > span {
    display: none;
  }

  .roster-head--day.is-today {
    color: #fff;
    background: rgba(240, 100, 35, 0.18);
  }

  /* Weather sits in the header like part of the date — no filled badge, just a
     colour-coded icon, the day high, and a hairline frame. */
  .board-weather {
    min-width: 0;
    flex: 0 0 auto;
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 2px 6px;
    border: 1px solid rgba(255, 255, 255, 0.16);
    border-radius: 7px;
    color: #c8d4e2;
    background: transparent;
    letter-spacing: 0;
  }

  .board-weather__temp {
    font-size: 12px;
    font-weight: var(--rst-fw-display);
    line-height: 1;
  }

  .roster-person {
    min-height: 80px;
    display: grid;
    grid-template-columns: 38px minmax(0, 1fr) auto;
    gap: 9px;
    align-items: center;
    padding: 12px 14px;
  }

  .roster-person > span {
    width: 38px;
    height: 38px;
    display: grid;
    place-items: center;
    border-radius: var(--rst-ui-radius-round);
    color: #eaf1ff;
    /* Fill = the person's position colour; ring = attention state. */
    background: var(--person-color, #1f4a7a);
    box-shadow: 0 0 0 2px var(--person-ring, rgba(255, 255, 255, 0));
    font-size: 11px;
    font-weight: var(--rst-fw-display);
    transition:
      transform 0.18s var(--rst-ease-spring),
      box-shadow 0.18s var(--rst-ease-out);
  }

  .roster-person:hover {
    background: #172a40;
  }

  .roster-person:hover > span {
    transform: scale(1.06);
    box-shadow:
      0 0 0 2px var(--person-ring, rgba(255, 255, 255, 0)),
      0 0 0 4px rgba(255, 255, 255, 0.08),
      0 12px 26px rgba(0, 0, 0, 0.2);
  }

  .roster-person.is-live > span {
    --person-ring: #42d884;
  }

  .roster-person.is-danger > span {
    --person-ring: #ff6b4a;
  }

  .roster-person.is-warning > span {
    --person-ring: #f7b733;
  }

  .roster-person strong,
  .roster-person small,
  .roster-slot strong,
  .roster-slot small,
  .roster-slot em {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .roster-person strong {
    display: block;
    color: #fff;
    font-size: 14px;
  }

  .roster-person small,
  .roster-total small {
    color: #8fa4bf;
    font-size: 11px;
  }

  .roster-person em {
    min-width: 24px;
    height: 24px;
    display: grid;
    place-items: center;
    border-radius: var(--rst-ui-radius-round);
    color: #fff;
    background: #f06423;
    font-style: normal;
    font-size: 11px;
    font-weight: var(--rst-fw-display);
  }

  .roster-day {
    min-height: 80px;
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 7px;
    padding: 9px;
    background: rgba(255, 255, 255, 0.025);
    transition: background-color 0.18s ease;
  }

  .roster-day:hover {
    background: rgba(255, 255, 255, 0.052);
  }

  .roster-day.is-today {
    background: rgba(240, 100, 35, 0.08);
  }

  .roster-day.is-future {
    opacity: 0.72;
  }

  /* The tile is a container so a hover-reveal ⋯ (edit) can sit inside the tap
     target without nesting buttons. Tone/colour live on the container; the grid
     content lives on the tap button. */
  .roster-slot {
    position: relative;
    min-width: 0;
    min-height: 62px;
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-left: 3px solid var(--slot-accent, rgba(255, 255, 255, 0.12));
    border-radius: 12px;
    color: #19304b;
    background: rgba(255, 255, 255, 0.74);
    transition:
      transform 0.16s var(--rst-ease-out),
      box-shadow 0.16s var(--rst-ease-out),
      border-color 0.16s ease,
      filter 0.16s ease;
  }

  .roster-slot__tap {
    width: 100%;
    min-height: 60px;
    display: grid;
    grid-template-columns: 14px minmax(0, 1fr);
    gap: 1px 5px;
    align-content: center;
    padding: 8px 9px;
    border: 0;
    border-radius: inherit;
    color: inherit;
    background: transparent;
    font: inherit;
    text-align: left;
    cursor: pointer;
  }

  .roster-slot__more {
    position: absolute;
    top: 4px;
    right: 4px;
    z-index: 2;
    width: 22px;
    height: 20px;
    display: grid;
    place-items: center;
    border: 0;
    border-radius: 7px;
    color: #19304b;
    background: rgba(255, 255, 255, 0.6);
    box-shadow: 0 2px 6px rgba(4, 11, 20, 0.18);
    font-size: 14px;
    line-height: 0.6;
    cursor: pointer;
    opacity: 0;
    transition: opacity 0.14s ease, background-color 0.14s ease;
  }

  .roster-slot:hover .roster-slot__more,
  .roster-slot:focus-within .roster-slot__more {
    opacity: 1;
  }

  .roster-slot__more:hover {
    background: rgba(255, 255, 255, 0.9);
  }

  /* Focus reuses the same fixed-width cards as the cockpit (full time fits and
     cards keep their size); it just shows more days and scrolls when needed. */
  .operations-board.is-expanded:not(.is-month) .roster-day {
    align-content: start;
  }

  /* Focus columns are narrower (to fit the week on a wide desktop). The two
     cards are always lunch (left) / evening (right), so the icon is redundant
     there — drop it and give the full time the whole card width. */
  .operations-board.is-expanded:not(.is-month) .roster-slot__tap {
    grid-template-columns: minmax(0, 1fr);
    gap: 1px 0;
  }

  .operations-board.is-expanded:not(.is-month) .roster-slot__tap > span {
    display: none;
  }

  .operations-board.is-expanded:not(.is-month) .roster-slot strong,
  .operations-board.is-expanded:not(.is-month) .roster-slot small,
  .operations-board.is-expanded:not(.is-month) .roster-slot em {
    grid-column: 1;
  }

  .roster-slot__tap:disabled {
    cursor: default;
  }

  .roster-slot.is-disabled {
    opacity: 0.85;
  }

  .roster-slot:hover:not(.is-disabled),
  .roster-slot:focus-within:not(.is-disabled) {
    z-index: 2;
    transform: translateY(-2px);
    border-color: rgba(255, 255, 255, 0.28);
    filter: brightness(1.05) saturate(1.03);
    box-shadow: 0 16px 34px rgba(4, 11, 20, 0.22);
  }

  .roster-slot__tap > span {
    grid-row: span 2;
    align-self: center;
    justify-self: center;
    font-size: 12px;
    line-height: 1;
  }

  .roster-slot strong {
    font-size: 11px;
    font-weight: var(--rst-fw-display);
    line-height: 1.05;
    letter-spacing: 0;
    white-space: nowrap;
  }

  .roster-slot small,
  .roster-slot em {
    grid-column: 2;
    overflow: hidden;
    color: rgba(25, 48, 75, 0.66);
    font-size: 10px;
    font-style: normal;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  /* Left border = the person's position colour (falls back to committed-green). */
  .roster-slot.is-planned,
  .roster-slot.is-recorded {
    border-color: rgba(80, 168, 132, 0.35);
    border-left-color: var(--slot-accent, rgba(66, 216, 132, 0.72));
    background:
      linear-gradient(145deg, rgba(255, 255, 255, 0.94), rgba(226, 236, 234, 0.96)),
      #edf3f1;
    box-shadow: 0 6px 16px rgba(4, 11, 20, 0.12);
  }

  /* A planned shift that has not been worked yet (Timesheet): stays quiet like
     the board, but a solid (not dashed) border + position accent clearly marks
     it as an expected slot rather than an empty one. */
  .roster-slot.is-expected {
    color: rgba(255, 250, 242, 0.82);
    border-color: rgba(255, 255, 255, 0.2);
    border-left-color: var(--slot-accent, rgba(140, 168, 205, 0.9));
    background: rgba(255, 255, 255, 0.055);
    box-shadow: none;
  }

  .roster-slot.is-expected small,
  .roster-slot.is-expected em {
    color: rgba(255, 250, 242, 0.5);
  }

  .roster-slot.is-available {
    color: #17693a;
    background: #d8f6e3;
  }

  .roster-slot.is-partial,
  .roster-slot.is-pending {
    color: #3c2a06;
    background: #ffe4a3;
  }

  .roster-slot.is-live {
    color: #0d2d1a;
    background: linear-gradient(135deg, #9cf3bd, #d9ffe7);
    box-shadow: 0 0 0 1px rgba(66, 216, 132, 0.32), 0 10px 24px rgba(66, 216, 132, 0.16);
    animation: rst-breathe-glow 2.8s ease-in-out infinite;
  }

  .roster-slot.is-adjusted {
    color: #3c2a06;
    background: linear-gradient(135deg, #ffe4a3, #fff7d6);
    box-shadow: inset 0 -3px 0 rgba(247, 183, 51, 0.5);
  }

  .roster-slot.is-missing,
  .roster-slot.is-conflict,
  .roster-slot.is-blocked {
    color: #fff4ef;
    border-color: rgba(255, 132, 105, 0.5);
    background: linear-gradient(135deg, #8d2b1c, #d74f35);
  }

  .roster-slot.is-missing small,
  .roster-slot.is-conflict small,
  .roster-slot.is-blocked small,
  .roster-slot.is-missing em,
  .roster-slot.is-conflict em,
  .roster-slot.is-blocked em {
    color: rgba(255, 244, 239, 0.82);
  }

  .roster-slot.is-absence,
  .roster-slot.is-unavailable {
    color: #f8fbff;
    background: linear-gradient(135deg, #41445e, #626789);
  }

  .roster-slot.is-empty,
  .roster-slot.is-neutral {
    color: rgba(255, 250, 242, 0.56);
    border-style: dashed;
    border-color: rgba(255, 255, 255, 0.075);
    background: rgba(255, 255, 255, 0.045);
    box-shadow: none;
  }

  .operations-board.is-expanded:not(.is-month) .roster-slot.is-empty,
  .operations-board.is-expanded:not(.is-month) .roster-slot.is-neutral {
    background:
      linear-gradient(145deg, rgba(255, 255, 255, 0.045), rgba(255, 255, 255, 0.02)),
      rgba(255, 255, 255, 0.035);
  }

  .roster-slot.is-selected {
    outline: 2px solid var(--rst-ui-action);
    outline-offset: 2px;
  }

  .operations-board.is-expanded .roster-slot {
    min-height: 74px;
  }

  .roster-ledger.is-month .roster-slot {
    min-height: 52px;
    padding: 7px;
  }

  .roster-ledger.is-month .roster-slot em {
    display: none;
  }

  .roster-total {
    min-height: 80px;
    display: grid;
    place-items: center;
    align-content: center;
    gap: 3px;
    padding: 10px;
    color: #fff;
  }

  .roster-total strong {
    font-size: 18px;
    letter-spacing: 0;
  }

  .roster-empty {
    grid-column: 1 / -1;
    margin: 0;
    padding: 28px;
    color: #90a4bf;
    text-align: center;
  }

  .roster-footer {
    grid-column: 1 / -1;
    display: grid;
    grid-template-columns: subgrid;
    min-height: 40px;
  }

  .roster-footer > span:first-child {
    padding: 10px 14px;
    color: #7890ad;
    font-size: 10px;
    font-weight: var(--rst-fw-display);
    letter-spacing: 0;
    text-transform: uppercase;
    background: rgba(255, 255, 255, 0.025);
  }

  .roster-footer strong {
    display: grid;
    place-items: center;
    padding: 10px;
    color: #3fd086;
    font-size: 12px;
    font-weight: var(--rst-fw-display);
    background: rgba(255, 255, 255, 0.025);
  }

  .roster-footer strong.is-gap {
    color: #f06423;
  }

  .roster-footer strong.is-neutral {
    color: #7890ad;
  }

  /* ---- Service (week) view ------------------------------------------ */

  .board-service {
    min-width: 0;
    display: grid;
    gap: 12px;
    padding: 14px 28px 24px;
  }

  .service-day {
    min-width: 0;
    display: grid;
    grid-template-columns: minmax(112px, 0.13fr) repeat(2, minmax(0, 1fr));
    gap: 14px;
    align-items: stretch;
  }

  .service-day__rail {
    min-width: 0;
    display: grid;
    align-content: center;
    gap: 6px;
    border: 0;
    color: #fffaf2;
    background: transparent;
    text-align: left;
    cursor: pointer;
    transition: color 0.18s ease, transform 0.18s var(--rst-ease-out);
  }

  .service-day__date-line {
    min-width: 0;
    display: flex;
    align-items: center;
    gap: 7px;
  }

  .service-day:hover .service-day__rail {
    transform: translateX(2px);
  }

  .service-day:hover .service-day__rail strong {
    color: #ffffff;
  }

  .service-day__rail span,
  .service-day__rail small {
    color: #7890ad;
    font-size: 10px;
    font-weight: var(--rst-fw-display);
    letter-spacing: 0;
    text-transform: uppercase;
  }

  .service-day__rail strong {
    color: #fff;
    font-size: 19px;
    line-height: 1;
    letter-spacing: 0;
  }

  .service-day__rail .service-day__weather {
    width: 30px;
    height: 30px;
    flex: 0 0 auto;
    margin-left: auto;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 5px;
    padding: 0;
    border: 1px solid #6d8197;
    border-radius: 8px;
    color: #eaf3fb;
    background: #35475a;
    box-shadow: inset 0 1px rgba(255, 255, 255, 0.1), 0 5px 12px rgba(3, 10, 19, 0.2);
    letter-spacing: 0;
    text-transform: none;
  }

  .service-card {
    position: relative;
    overflow: hidden;
    min-width: 0;
    display: grid;
    grid-template-rows: auto minmax(32px, auto) auto;
    gap: 8px;
    min-height: 92px;
    padding: 12px 14px;
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 16px;
    color: #eaf2ff;
    background: rgba(255, 255, 255, 0.045);
    transition:
      transform 0.18s var(--rst-ease-out),
      box-shadow 0.18s var(--rst-ease-out),
      border-color 0.18s ease,
      filter 0.18s ease;
  }

  .service-card::after {
    content: '';
    position: absolute;
    inset: 0;
    pointer-events: none;
    background: linear-gradient(105deg, transparent 0 40%, rgba(255, 255, 255, 0.22) 50%, transparent 60% 100%);
    opacity: 0;
    transform: translateX(-70%);
    transition: opacity 0.18s ease, transform 0.55s var(--rst-ease-out);
  }

  .service-card:hover {
    transform: translateY(-2px);
    filter: saturate(1.05);
    box-shadow: 0 18px 38px rgba(4, 11, 20, 0.22);
  }

  .service-card:hover::after {
    opacity: 1;
    transform: translateX(70%);
  }

  .service-card.is-evening {
    background: rgba(255, 255, 255, 0.03);
  }

  .service-card.is-empty {
    color: rgba(234, 242, 255, 0.66);
    background: rgba(255, 255, 255, 0.022);
  }

  .service-card.is-live,
  .service-card.is-ready {
    border-color: rgba(66, 200, 120, 0.42);
    background: rgba(66, 200, 120, 0.1);
  }

  .service-card.is-danger {
    border-color: rgba(240, 100, 35, 0.5);
    background: rgba(215, 86, 58, 0.16);
  }

  .service-card.is-short {
    border-color: rgba(247, 183, 51, 0.4);
    background: rgba(247, 183, 51, 0.08);
    box-shadow: inset 3px 0 0 rgba(247, 183, 51, 0.85);
  }

  .service-card.is-warning,
  .service-card.is-attention {
    border-color: rgba(247, 183, 51, 0.35);
    background: rgba(247, 183, 51, 0.07);
  }

  .service-card.is-bench {
    box-shadow: inset 0 0 0 1px rgba(66, 216, 132, 0.2);
  }

  .service-card > header {
    min-width: 0;
    display: flex;
    justify-content: space-between;
    gap: 10px;
    align-items: center;
  }

  .service-card > header button {
    display: inline-flex;
    gap: 8px;
    align-items: center;
    border: 0;
    padding: 0;
    color: inherit;
    background: transparent;
    font-size: 12px;
    font-weight: var(--rst-fw-display);
    letter-spacing: 0;
    text-transform: uppercase;
    cursor: pointer;
  }

  .service-card > header button:disabled {
    cursor: default;
  }

  .service-card > header i {
    font-style: normal;
  }

  .service-card > header > strong {
    flex: 0 0 auto;
    max-width: 100%;
    padding: 3px 9px;
    border-radius: 999px;
    background: rgba(255, 255, 255, 0.1);
    color: inherit;
    font-size: 12px;
  }

  .service-card.is-danger > header > strong {
    background: rgba(255, 255, 255, 0.16);
  }

  /* Coverage breakdown: one calm row per area × role. */
  .service-card__coverage {
    display: grid;
    gap: 4px;
  }

  .coverage-row {
    width: 100%;
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto auto;
    align-items: center;
    gap: 8px;
    padding: 6px 8px;
    border: 0;
    border-radius: 10px;
    color: inherit;
    background: rgba(255, 255, 255, 0.04);
    font: inherit;
    text-align: left;
    cursor: pointer;
    transition: transform 0.14s var(--rst-ease-out), background-color 0.14s ease;
  }

  .coverage-row:disabled {
    cursor: default;
  }

  .coverage-row:not(:disabled):hover {
    transform: translateY(-1px);
    background: rgba(255, 255, 255, 0.09);
  }

  .coverage-row.is-short {
    background: rgba(247, 183, 51, 0.12);
    box-shadow: inset 2px 0 0 rgba(247, 183, 51, 0.8);
  }

  .coverage-row.is-short:not(:disabled):hover {
    background: rgba(247, 183, 51, 0.18);
  }

  .coverage-row__where {
    min-width: 0;
    display: grid;
    line-height: 1.15;
  }

  .coverage-row__where strong {
    overflow: hidden;
    font-size: 12px;
    font-weight: var(--rst-fw-display);
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .coverage-row__where span {
    color: rgba(234, 242, 255, 0.6);
    font-size: 10px;
  }

  .coverage-row__crew {
    display: flex;
    align-items: center;
    gap: 4px;
  }

  .coverage-row__avatar {
    width: 20px;
    height: 20px;
    display: grid;
    place-items: center;
    border-radius: var(--rst-ui-radius-round);
    color: #fff;
    background: var(--avatar-color, #35507a);
    box-shadow: 0 1px 4px rgba(4, 11, 20, 0.3);
    font-size: 8px;
    font-weight: var(--rst-fw-display);
    letter-spacing: 0;
  }

  .coverage-row__count {
    font-size: 11px;
    font-style: normal;
    font-weight: var(--rst-fw-display);
    color: rgba(234, 242, 255, 0.66);
  }

  .coverage-row.is-short .coverage-row__count {
    color: var(--rst-gold);
  }

  .service-card.is-short > header > strong {
    color: #6f2e12;
    background: rgba(240, 100, 35, 0.14);
  }

  .service-card__chips {
    min-width: 0;
    display: flex;
    flex-wrap: wrap;
    gap: 7px;
    align-content: center;
  }

  .service-card__empty {
    align-self: center;
    color: rgba(23, 48, 77, 0.55);
    font-size: 12px;
    font-weight: var(--rst-fw-bold);
  }

  .service-card__fill {
    min-height: 31px;
    padding: 0 12px;
    border: 1px dashed rgba(240, 100, 35, 0.52);
    border-radius: 999px;
    color: #f06423;
    background: rgba(240, 100, 35, 0.08);
    font: inherit;
    font-size: 12px;
    cursor: pointer;
    transition:
      transform 0.16s var(--rst-ease-out),
      border-color 0.16s ease,
      background-color 0.16s ease;
  }

  .service-card__fill:hover {
    transform: translateY(-1px);
    border-color: #f06423;
    background: rgba(240, 100, 35, 0.16);
  }

  .service-card.is-empty .service-card__fill {
    border-color: rgba(38, 56, 79, 0.28);
    color: #26384f;
    background: rgba(38, 56, 79, 0.06);
  }

  .service-card.is-empty .service-card__fill:hover {
    border-color: rgba(38, 56, 79, 0.48);
    background: rgba(38, 56, 79, 0.1);
  }

  .service-card.is-danger .service-card__empty {
    color: rgba(255, 244, 239, 0.72);
  }

  .service-card > footer {
    min-width: 0;
    display: flex;
    justify-content: space-between;
    gap: 8px;
    align-items: center;
    padding-top: 8px;
    border-top: 1px solid rgba(20, 35, 52, 0.08);
  }

  .service-card > footer > span {
    color: rgba(23, 48, 77, 0.62);
    font-size: 10px;
    font-weight: var(--rst-fw-display);
    letter-spacing: 0;
    text-transform: uppercase;
  }

  .service-card.is-danger > footer > span {
    color: rgba(255, 244, 239, 0.62);
  }

  .service-card > footer > div {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 4px;
    justify-content: flex-end;
  }

  .service-card > footer small {
    color: rgba(23, 48, 77, 0.62);
    font-size: 10px;
    font-weight: var(--rst-fw-display);
  }

  /* ---- Service (month) view ------------------------------------------ */

  .board-month {
    min-width: 0;
    display: grid;
    gap: 8px;
    padding: 16px 28px 24px;
  }

  .board-month__weekdays,
  .board-month__week {
    display: grid;
    grid-template-columns: repeat(7, minmax(112px, 1fr));
    gap: 8px;
  }

  .board-month__weekdays {
    color: #7890ad;
    font-size: 10px;
    font-weight: var(--rst-fw-display);
    letter-spacing: 0;
    text-transform: uppercase;
  }

  .board-month__weekdays span {
    padding-inline: 4px;
  }

  .board-month__day {
    position: relative;
    min-width: 0;
    display: grid;
    gap: 10px;
    min-height: 128px;
    padding: 11px;
    border: 1px solid rgba(255, 255, 255, 0.075);
    border-radius: 17px;
    background:
      radial-gradient(circle at 100% 0%, rgba(255, 255, 255, 0.08), transparent 42%),
      rgba(255, 255, 255, 0.035);
    transition:
      transform 0.18s var(--rst-ease-out),
      border-color 0.18s ease,
      background-color 0.18s ease,
      box-shadow 0.18s var(--rst-ease-out);
  }

  .board-month__day:hover,
  .board-month__day:focus-within {
    z-index: 1;
    transform: translateY(-2px);
    border-color: rgba(var(--rst-ui-action-rgb), 0.34);
    box-shadow: 0 18px 38px rgba(4, 11, 20, 0.2);
  }

  .board-month__day.is-outside {
    opacity: 0.42;
  }

  .board-month__day.is-today {
    border-color: rgba(240, 100, 35, 0.48);
    box-shadow: inset 0 0 0 1px rgba(240, 100, 35, 0.18);
  }

  .board-month__day.is-worked,
  .board-month__day.is-ready {
    background:
      linear-gradient(135deg, rgba(66, 216, 132, 0.13), transparent 52%),
      rgba(255, 255, 255, 0.04);
  }

  .board-month__day.is-review,
  .board-month__day.is-short,
  .board-month__day.is-attention {
    background:
      linear-gradient(135deg, rgba(240, 100, 35, 0.18), transparent 56%),
      rgba(255, 255, 255, 0.045);
  }

  .board-month__day > header {
    min-width: 0;
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto auto;
    gap: 8px;
    align-items: center;
  }

  .board-month__day > header span {
    width: 30px;
    height: 30px;
    display: grid;
    place-items: center;
    border-radius: 999px;
    color: #17304f;
    background: #fff4dc;
    font-weight: var(--rst-fw-display);
  }

  .board-month__day > header strong {
    min-width: 0;
    overflow: hidden;
    color: #fffaf2;
    font-size: 16px;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .board-month__day > header em {
    min-width: 24px;
    height: 24px;
    display: grid;
    place-items: center;
    border-radius: 999px;
    color: #fff;
    background: #f06423;
    font-style: normal;
    font-size: 11px;
    font-weight: var(--rst-fw-display);
  }

  .board-month__day > header .board-weather {
    margin: 0;
  }

  .board-month__lanes {
    min-width: 0;
    display: grid;
    gap: 7px;
  }

  .board-lane {
    min-width: 0;
    min-height: 35px;
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto;
    gap: 6px;
    align-items: center;
    padding: 7px 8px;
    border: 1px solid rgba(255, 255, 255, 0.075);
    border-radius: 11px;
    color: #19304b;
    background: #fff4dc;
    font: inherit;
    cursor: pointer;
    transition:
      transform 0.16s var(--rst-ease-out),
      box-shadow 0.16s var(--rst-ease-out),
      filter 0.16s ease;
  }

  .board-lane:hover,
  .board-lane:focus-visible {
    transform: translateY(-1px);
    filter: brightness(1.05);
    box-shadow: 0 12px 24px rgba(4, 11, 20, 0.18);
  }

  .board-lane.is-evening {
    background: #e5eefb;
  }

  .board-lane.is-live,
  .board-lane.is-ready,
  .board-lane.is-planned {
    color: #0d2d1a;
    background: #c9f8d9;
  }

  .board-lane.is-warning,
  .board-lane.is-attention,
  .board-lane.is-bench {
    color: #3c2a06;
    background: #ffe4a3;
  }

  .board-lane.is-danger,
  .board-lane.is-short {
    color: #fff4ef;
    background: linear-gradient(135deg, #8d2b1c, #d74f35);
  }

  .board-lane.is-empty,
  .board-lane.is-future,
  .board-lane.is-quiet {
    color: rgba(255, 250, 242, 0.64);
    background: rgba(255, 255, 255, 0.055);
  }

  .board-lane strong {
    min-width: 0;
    overflow: hidden;
    font-size: 11px;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .board-lane em {
    min-width: 20px;
    height: 20px;
    display: grid;
    place-items: center;
    border-radius: 999px;
    color: inherit;
    background: rgba(0, 0, 0, 0.12);
    font-style: normal;
    font-size: 10px;
    font-weight: var(--rst-fw-display);
  }

  @media (max-width: 980px) {
    .board-service {
      padding: 14px 16px 24px;
    }
  }

  @media (max-width: 760px) {
    .roster-ledger {
      display: none;
    }

    .mobile-roster {
      min-width: 0;
      display: grid;
      color: #f8fbff;
      background: #132235;
    }

    .mobile-roster__days {
      position: sticky;
      top: 0;
      z-index: 5;
      min-width: 0;
      display: grid;
      grid-auto-flow: column;
      grid-auto-columns: minmax(56px, 1fr);
      gap: 5px;
      overflow-x: auto;
      overscroll-behavior-inline: contain;
      padding: 9px 12px 10px;
      border-bottom: 1px solid rgba(255, 255, 255, 0.08);
      background: rgba(19, 34, 53, 0.98);
      scrollbar-width: none;
      scroll-snap-type: inline proximity;
    }

    .mobile-roster__days::-webkit-scrollbar {
      display: none;
    }

    .mobile-roster__days button {
      position: relative;
      min-width: 0;
      min-height: 62px;
      display: grid;
      grid-template-rows: auto auto 20px;
      place-items: center;
      align-content: center;
      gap: 1px;
      padding: 5px 4px;
      border: 1px solid transparent;
      border-radius: 8px;
      color: #8fa5bd;
      background: transparent;
      cursor: pointer;
      scroll-snap-align: center;
      transition: color 0.16s ease, background-color 0.16s ease, border-color 0.16s ease;
    }

    .mobile-roster__days button span {
      max-width: 100%;
      overflow: hidden;
      font-size: 9px;
      font-weight: var(--rst-fw-display);
      line-height: 1.1;
      text-overflow: ellipsis;
      text-transform: uppercase;
      white-space: nowrap;
    }

    .mobile-roster__days button strong {
      color: #eaf1fb;
      font-size: 17px;
      line-height: 1.1;
    }

    .mobile-roster__days button i {
      width: 24px;
      height: 20px;
      display: grid;
      place-items: center;
      border-radius: 7px;
      background: rgba(255, 255, 255, 0.04);
    }

    .mobile-roster__days button i.is-fair {
      background: rgba(255, 197, 49, 0.11);
    }

    .mobile-roster__days button i.is-wet,
    .mobile-roster__days button i.is-frost {
      background: rgba(74, 163, 255, 0.12);
    }

    .mobile-roster__days button i.is-storm {
      background: rgba(247, 183, 51, 0.14);
    }

    .mobile-roster__days button.is-today::after {
      position: absolute;
      bottom: 3px;
      width: 4px;
      height: 4px;
      border-radius: var(--rst-ui-radius-round);
      background: #f06423;
      content: '';
    }

    .mobile-roster__days button.is-current {
      border-color: rgba(240, 100, 35, 0.5);
      color: #ffc39f;
      background: rgba(240, 100, 35, 0.16);
    }

    .mobile-roster__days button.is-current strong {
      color: #fff;
    }

    .mobile-roster__summary {
      min-width: 0;
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      gap: 14px;
      align-items: center;
      padding: 13px 14px 14px;
      border-bottom: 1px solid rgba(255, 255, 255, 0.08);
      background: rgba(255, 255, 255, 0.025);
    }

    .mobile-roster__summary > div:first-child {
      min-width: 0;
      display: grid;
      gap: 2px;
    }

    .mobile-roster__summary span,
    .mobile-person__net span {
      color: #7890ad;
      font-size: 9px;
      font-weight: var(--rst-fw-display);
      text-transform: uppercase;
    }

    .mobile-roster__summary > div:first-child > strong {
      overflow: hidden;
      color: #fff;
      font-size: 16px;
      line-height: 1.2;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .mobile-roster__summary small {
      overflow: hidden;
      color: #9db0c6;
      font-size: 11px;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .mobile-roster__day-total {
      min-width: 58px;
      display: grid;
      justify-items: end;
      gap: 2px;
      padding-left: 12px;
      border-left: 1px solid rgba(255, 255, 255, 0.1);
    }

    .mobile-roster__day-total strong {
      color: #42d884;
      font-size: 17px;
      line-height: 1.1;
    }

    .mobile-roster__day-total.is-gap strong {
      color: #ff8a61;
    }

    .mobile-roster__day-total.is-neutral strong {
      color: #b7c5d6;
    }

    .mobile-roster__people {
      min-width: 0;
      display: grid;
    }

    .mobile-person {
      --person-ring: rgba(255, 255, 255, 0);
      min-width: 0;
      display: grid;
      gap: 11px;
      padding: 13px 14px 15px;
      border-bottom: 1px solid rgba(255, 255, 255, 0.085);
      background: transparent;
    }

    .mobile-person > header {
      min-width: 0;
      display: grid;
      grid-template-columns: 36px minmax(0, 1fr) auto auto;
      gap: 9px;
      align-items: center;
    }

    .mobile-person__avatar {
      width: 36px;
      height: 36px;
      display: grid;
      place-items: center;
      border-radius: var(--rst-ui-radius-round);
      color: #eef5ff;
      background: var(--person-color, #1f4a7a);
      box-shadow: 0 0 0 2px var(--person-ring);
      font-size: 10px;
      font-weight: var(--rst-fw-display);
    }

    .mobile-person.is-live {
      --person-ring: #42d884;
    }

    .mobile-person.is-danger {
      --person-ring: #ff6b4a;
    }

    .mobile-person.is-warning {
      --person-ring: #f7b733;
    }

    .mobile-person__identity {
      min-width: 0;
      display: grid;
      gap: 1px;
    }

    .mobile-person__identity strong,
    .mobile-person__identity small {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .mobile-person__identity strong {
      color: #fff;
      font-size: 13px;
      line-height: 1.2;
    }

    .mobile-person__identity small {
      color: #8fa4bf;
      font-size: 10px;
    }

    .mobile-person__review {
      min-width: 22px;
      height: 22px;
      display: grid;
      place-items: center;
      border-radius: var(--rst-ui-radius-round);
      color: #fff;
      background: #d85824;
      font-size: 10px;
      font-style: normal;
      font-weight: var(--rst-fw-display);
    }

    .mobile-person__net {
      min-width: 46px;
      display: grid;
      justify-items: end;
      gap: 0;
    }

    .mobile-person__net strong {
      color: #fff;
      font-size: 14px;
      line-height: 1.2;
    }

    .mobile-person__net small {
      max-width: 72px;
      overflow: hidden;
      color: #7890ad;
      font-size: 9px;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .mobile-person__services {
      min-width: 0;
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 8px;
    }

    .mobile-service {
      min-width: 0;
      display: grid;
      gap: 5px;
    }

    .mobile-service__label {
      min-width: 0;
      display: flex;
      align-items: center;
      gap: 5px;
      color: #8fa5bd;
      font-size: 9px;
      font-weight: var(--rst-fw-display);
      text-transform: uppercase;
    }

    .mobile-service__label i {
      color: #f2b667;
      font-style: normal;
    }

    .mobile-service:nth-child(2) .mobile-service__label i {
      color: #9bb8ef;
    }

    .mobile-service .roster-slot {
      min-height: 68px;
      border-radius: 8px;
    }

    .mobile-service .roster-slot__tap {
      min-height: 66px;
      grid-template-columns: minmax(0, 1fr);
      gap: 2px;
      padding: 9px 26px 9px 10px;
    }

    .mobile-service .roster-slot strong,
    .mobile-service .roster-slot small,
    .mobile-service .roster-slot em {
      grid-column: 1;
      min-width: 0;
    }

    .mobile-service .roster-slot strong {
      font-size: 11px;
      line-height: 1.15;
    }

    .mobile-service .roster-slot small,
    .mobile-service .roster-slot em {
      font-size: 9px;
    }

    .mobile-service .roster-slot__more {
      width: 24px;
      height: 24px;
      opacity: 1;
    }

    .mobile-service .roster-slot:hover:not(.is-disabled),
    .mobile-service .roster-slot:focus-within:not(.is-disabled) {
      transform: none;
    }

    .mobile-roster__empty {
      margin: 0;
      padding: 34px 18px;
      color: #8fa5bd;
      font-size: 12px;
      text-align: center;
    }

    .board-month {
      padding: 14px 16px 22px;
    }

    .board-month__weekdays,
    .board-month__week {
      grid-template-columns: repeat(7, minmax(84px, 1fr));
    }
  }
</style>
