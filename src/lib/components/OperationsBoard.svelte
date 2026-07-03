<script lang="ts" module>
  // The one shared board for every manager weekly/monthly operations grid
  // (Schedule + Timesheet). Owns grid geometry, sticky staff/total columns,
  // the today-highlight, the tone/gradient vocabulary and week/month
  // compaction. Each page maps its own domain model (planned shifts, time
  // entries) into this plain-data shape — no page-specific markup crosses
  // the boundary, so the two boards can never visually drift apart again.
  export type BoardTone =
    | 'planned'
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
    selected?: boolean;
    disabled?: boolean;
    liveSince?: string | null;
    onclick: () => void;
    ariaLabel: string;
  };

  export type BoardRow = {
    id: string;
    name: string;
    meta?: string;
    avatarTone?: 'neutral' | 'live' | 'danger' | 'warning';
    reviewCount?: number;
    totalLabel: string;
    totalMeta?: string;
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
  import LiveDuration from './LiveDuration.svelte';
  import StaffChip from './StaffChip.svelte';

  let {
    view,
    periodMode = 'week',
    expanded = false,
    columns,
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
</script>

<section
  class={`operations-board is-${view}`}
  class:is-expanded={expanded}
  class:is-month={isMonth}
  aria-label={label}
>
  {#if view === 'roster'}
    <div class="roster-ledger" class:is-month={isMonth}>
      <div class="roster-grid" style={`--day-count:${columns.length}`}>
        <div class="roster-head roster-head--staff">Staff</div>
        {#each columns as column (column.date)}
          <div class="roster-head roster-head--day" class:is-today={column.today}>
            <span>{column.label}</span>
            <strong>{column.day}</strong>
            {#if isMonth && column.month}
              <small>{column.month}</small>
            {/if}
          </div>
        {/each}
        <div class="roster-head roster-head--total">Net</div>

        {#each rows as row (row.id)}
          <article class={`roster-person is-${row.avatarTone ?? 'neutral'}`}>
            <span>{row.name.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]).join('').toUpperCase()}</span>
            <div>
              <strong>{row.name}</strong>
              <small>{row.meta || 'Staff'}</small>
            </div>
            {#if row.reviewCount}
              <em>{row.reviewCount}</em>
            {/if}
          </article>

          {#each columns as column (column.date)}
            <div class="roster-day" class:is-today={column.today} class:is-future={column.future}>
              {#each slotsFor?.(row.id, column.date) ?? [] as slot (slot.key)}
                <button
                  type="button"
                  class={`roster-slot is-${slot.tone}`}
                  class:is-selected={slot.selected}
                  disabled={slot.disabled}
                  onclick={slot.onclick}
                  aria-label={slot.ariaLabel}
                >
                  <span>{slot.icon}</span>
                  <strong>{slot.main}</strong>
                  {#if slot.liveSince}
                    <small><LiveDuration since={slot.liveSince} /></small>
                  {:else if slot.detail}
                    <small>{slot.detail}</small>
                  {/if}
                  {#if expanded && slot.area}
                    <em>{slot.area}</em>
                  {/if}
                </button>
              {/each}
            </div>
          {/each}

          <div class="roster-total">
            <strong>{row.totalLabel}</strong>
            {#if row.totalMeta}<small>{row.totalMeta}</small>{/if}
          </div>
        {:else}
          <p class="roster-empty">{emptyMessage}</p>
        {/each}

        {#if footerLabel && footerCells.length}
          <div class="roster-footer">
            <span>{footerLabel}</span>
            {#each footerCells as cell, index (index)}
              <strong class={`is-${cell.tone ?? 'neutral'}`}>{cell.value}</strong>
            {/each}
            <span></span>
          </div>
        {/if}
      </div>
    </div>
  {:else if isMonth}
    <div class="board-month" aria-label={label}>
      <div class="board-month__weekdays" aria-hidden="true">
        {#each columns.slice(0, 7) as column (column.date)}
          <span>{column.label}</span>
        {/each}
      </div>
      {#each Array.from({ length: Math.ceil(monthDays.length / 7) }, (_, index) => monthDays.slice(index * 7, index * 7 + 7)) as week, weekIndex (weekIndex)}
        <div class="board-month__week">
          {#each week as day (day.date)}
            <article
              class={`board-month__day is-${day.tone}`}
              class:is-today={day.today}
              class:is-outside={day.outside}
            >
              <header>
                <span>{day.dayNumber}</span>
                {#if day.totalLabel}<strong>{day.totalLabel}</strong>{/if}
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
        <article class="service-day" class:is-today={columns.find((c) => c.date === rail.date)?.today}>
          <button type="button" class="service-day__rail" onclick={rail.onclick}>
            <span>{rail.label}</span>
            <strong>{rail.value}</strong>
            <small>{rail.meta}</small>
          </button>

          {#each serviceCardsFor?.(rail.date) ?? [] as card (card.serviceKey)}
            <section id={card.id} class={`service-card is-${card.serviceKey} is-${card.tone}`}>
              <header>
                <button type="button" onclick={card.onHeaderClick} disabled={!card.onHeaderClick}>
                  <i>{card.icon}</i>{card.label}
                </button>
                <strong>{card.summaryValue}</strong>
              </header>

              <div class="service-card__chips">
                {#each card.chips as chip (chip.key)}
                  <StaffChip {...chip} />
                {:else}
                  <span class="service-card__empty">{card.emptyLabel ?? 'No one here yet'}</span>
                {/each}
                {#if card.fillLabel}
                  <button type="button" class="service-card__fill" onclick={card.onFillClick}>
                    {card.fillLabel}
                  </button>
                {/if}
              </div>

              {#if card.secondaryChips?.length}
                <footer>
                  <span>{card.secondaryLabel}</span>
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

  .roster-ledger {
    --roster-staff-column: 210px;
    --roster-day-column: 216px;
    --roster-total-column: 86px;
    min-width: 0;
    overflow: auto;
    padding: 0 0 2px;
  }

  .operations-board.is-expanded .roster-ledger {
    --roster-day-column: 190px;
    --roster-total-column: 92px;
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
    min-height: 66px;
    display: grid;
    align-content: center;
    gap: 3px;
    padding: 12px;
    color: rgba(255, 250, 242, 0.62);
    background: rgba(255, 255, 255, 0.035);
    font-size: 10px;
    font-weight: var(--rst-fw-display);
    letter-spacing: 0.08em;
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

  .roster-head--total {
    z-index: 4;
  }

  .roster-head--day {
    text-align: center;
  }

  .roster-head--day strong {
    color: #fff;
    font-size: 20px;
    line-height: 1;
    letter-spacing: -0.04em;
  }

  .roster-head--day.is-today {
    color: #fff;
    background: rgba(240, 100, 35, 0.18);
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
    color: #cfe0ff;
    background: #1f4a7a;
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
    box-shadow: 0 0 0 4px rgba(255, 255, 255, 0.06), 0 12px 26px rgba(0, 0, 0, 0.2);
  }

  .roster-person.is-live > span {
    color: #12301f;
    background: #9cf3bd;
  }

  .roster-person.is-danger > span {
    background: #8d2b1c;
  }

  .roster-person.is-warning > span {
    color: #3d2904;
    background: #f7d36d;
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

  .roster-slot {
    position: relative;
    min-width: 0;
    min-height: 60px;
    display: grid;
    grid-template-columns: auto minmax(0, 1fr);
    gap: 2px 6px;
    align-content: center;
    padding: 8px;
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 12px;
    color: #19304b;
    background: rgba(255, 255, 255, 0.76);
    font: inherit;
    text-align: left;
    cursor: pointer;
    transition:
      transform 0.16s var(--rst-ease-out),
      box-shadow 0.16s var(--rst-ease-out),
      border-color 0.16s ease,
      filter 0.16s ease;
  }

  .roster-slot:disabled {
    cursor: default;
    opacity: 0.85;
  }

  .roster-slot:hover:not(:disabled),
  .roster-slot:focus-visible:not(:disabled) {
    z-index: 2;
    transform: translateY(-2px);
    border-color: rgba(255, 255, 255, 0.28);
    filter: brightness(1.05) saturate(1.03);
    box-shadow: 0 16px 34px rgba(4, 11, 20, 0.22);
  }

  .roster-slot > span {
    grid-row: span 2;
    font-size: 12px;
    line-height: 1;
  }

  .roster-slot strong {
    font-size: 12px;
    line-height: 1.05;
  }

  .roster-slot small,
  .roster-slot em {
    grid-column: 2;
    color: rgba(25, 48, 75, 0.7);
    font-size: 10px;
    font-style: normal;
  }

  .roster-slot.is-planned,
  .roster-slot.is-recorded {
    border-color: rgba(66, 216, 132, 0.32);
    box-shadow: inset 0 -3px 0 rgba(66, 216, 132, 0.42);
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
    color: rgba(255, 250, 242, 0.72);
    border-style: dashed;
    background: rgba(255, 255, 255, 0.07);
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
    letter-spacing: -0.04em;
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
    letter-spacing: 0.08em;
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
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }

  .service-day__rail strong {
    font-size: 22px;
    line-height: 0.9;
  }

  .service-card {
    position: relative;
    overflow: hidden;
    min-width: 0;
    display: grid;
    grid-template-rows: auto minmax(46px, 1fr) auto;
    gap: 8px;
    min-height: 112px;
    padding: 12px;
    border-radius: 17px;
    color: #17304f;
    background:
      linear-gradient(90deg, rgba(66, 216, 132, 0.1), transparent 30%),
      #f5eedf;
    transition:
      transform 0.18s var(--rst-ease-out),
      box-shadow 0.18s var(--rst-ease-out),
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
    background:
      linear-gradient(90deg, rgba(66, 216, 132, 0.07), transparent 30%),
      #e6eef8;
  }

  .service-card.is-live,
  .service-card.is-ready {
    background: linear-gradient(135deg, #c8f8d8, #e8fff0);
    animation: rst-breathe-glow 2.9s ease-in-out infinite;
  }

  .service-card.is-danger,
  .service-card.is-short {
    color: #fff4ef;
    background: linear-gradient(135deg, #7b2519, #d8563a);
  }

  .service-card.is-warning,
  .service-card.is-attention {
    background: linear-gradient(135deg, #ffe4a3, #fff7d6);
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
    letter-spacing: 0.06em;
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
    background: rgba(255, 255, 255, 0.52);
    color: inherit;
    font-size: 12px;
  }

  .service-card.is-danger > header > strong,
  .service-card.is-short > header > strong {
    background: rgba(255, 255, 255, 0.22);
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
    letter-spacing: 0.08em;
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
    letter-spacing: 0.08em;
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
    grid-template-columns: auto minmax(0, 1fr) auto;
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
</style>
