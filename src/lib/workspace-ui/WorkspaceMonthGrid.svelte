<script lang="ts">
  import { WEEKDAYS } from '$lib/calendar/date';
  import { t } from '$lib/i18n/i18n.svelte';
  import WorkspacePeopleStack, {
    type WorkspacePerson
  } from '$lib/workspace-ui/WorkspacePeopleStack.svelte';

  export type WorkspaceCalendarDay = {
    date: string;
    dayNumber: number;
    inMonth: boolean;
    isToday: boolean;
    isPast?: boolean;
    primary?: string;
    secondary?: string;
    badge?: string;
    badgeTone?: 'attention' | 'problem' | 'ok';
    people?: WorkspacePerson[];
    intensity?: number;
  };

  let {
    label,
    days,
    onselect
  }: {
    label: string;
    days: WorkspaceCalendarDay[];
    onselect?: (day: WorkspaceCalendarDay) => void;
  } = $props();

  function choose(day: WorkspaceCalendarDay): void {
    onselect?.(day);
  }
</script>

<div class="monthwrap">
  <div class="month" role="grid" aria-label={label}>
    {#each WEEKDAYS as weekdayName (weekdayName)}
      <div class="month__head" role="columnheader">{t(weekdayName)}</div>
    {/each}
    {#each days as day (day.date)}
      <button
        class="month__day"
        class:is-out={!day.inMonth}
        class:is-today={day.isToday}
        class:is-past={day.isPast && !day.isToday}
        type="button"
        role="gridcell"
        onclick={() => choose(day)}
      >
        <div class="month__top">
          <span class="month__num">{day.dayNumber}</span>
          {#if day.badge}
            <span class="month__flag is-{day.badgeTone ?? 'attention'}">{day.badge}</span>
          {/if}
        </div>
        {#if day.primary}<span class="month__primary">{day.primary}</span>{/if}
        {#if day.secondary}<span class="month__meta">{day.secondary}</span>{/if}
        {#if day.people?.length}
          <WorkspacePeopleStack people={day.people} max={4} />
        {/if}
        {#if day.intensity}
          <span class="month__bar" style={`--fill:${Math.max(0, Math.min(100, day.intensity))}%`}></span>
        {/if}
      </button>
    {/each}
  </div>
</div>

<style>
  .monthwrap {
    overflow-x: auto;
    border: 1px solid var(--cl-line);
    border-radius: var(--cl-radius);
    background: var(--cl-surface);
  }
  .month {
    min-width: 720px;
    display: grid;
    grid-template-columns: repeat(7, minmax(0, 1fr));
  }
  .month__head {
    padding: 11px 13px;
    border-bottom: 1px solid var(--cl-line);
    background: color-mix(in srgb, var(--cl-accent) 4%, var(--cl-surface-muted));
    color: var(--cl-muted);
    font-size: 11px;
    font-weight: var(--rst-fw-bold);
    text-transform: uppercase;
  }
  .month__head + .month__head,
  .month__day:not(:nth-child(7n + 1)) {
    border-left: 1px solid var(--cl-grid-line);
  }
  .month__day {
    position: relative;
    min-width: 0;
    min-height: 116px;
    display: grid;
    align-content: start;
    gap: 4px;
    padding: 10px 12px 14px;
    border-bottom: 1px solid var(--cl-grid-line);
    border-top: 0;
    border-right: 0;
    border-left: 0;
    color: inherit;
    background: var(--cl-surface);
    font: inherit;
    text-align: left;
    text-decoration: none;
    cursor: pointer;
    transition:
      background var(--cl-dur) var(--cl-ease),
      box-shadow var(--cl-dur) var(--cl-ease);
  }
  .month__day:hover {
    z-index: 1;
    background: color-mix(in srgb, var(--cl-accent) 5%, var(--cl-surface));
    box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--cl-accent) 30%, transparent);
  }
  .month__day.is-out {
    color: var(--cl-muted);
    background: color-mix(in srgb, var(--cl-surface-muted) 72%, var(--cl-surface));
  }
  .month__day.is-past:not(.is-out) {
    background-color: color-mix(in srgb, var(--cl-surface-muted) 54%, var(--cl-surface));
    background-image: repeating-linear-gradient(
      135deg,
      transparent 0 8px,
      color-mix(in srgb, var(--cl-muted) 7%, transparent) 8px 9px
    );
  }
  .month__top {
    min-width: 0;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 6px;
  }
  .month__num {
    min-width: 24px;
    height: 24px;
    display: inline-grid;
    place-items: center;
    justify-self: start;
    border-radius: 50%;
    font-size: 12px;
    font-weight: var(--rst-fw-bold);
    font-variant-numeric: tabular-nums;
  }
  .month__day.is-today .month__num {
    color: var(--rst-on-accent-text);
    background: var(--cl-accent);
    box-shadow: 0 2px 6px color-mix(in srgb, var(--cl-accent) 26%, transparent);
  }
  .month__primary {
    overflow: hidden;
    color: var(--cl-ink);
    font-size: 13px;
    font-weight: var(--rst-fw-bold);
    font-variant-numeric: tabular-nums;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .month__meta {
    overflow: hidden;
    color: var(--cl-muted);
    font-size: 10px;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .month__flag {
    max-width: 90px;
    overflow: hidden;
    padding: 2px 6px;
    border-radius: 999px;
    color: var(--cl-attention);
    background: var(--cl-attention-wash);
    font-size: 9px;
    font-weight: var(--rst-fw-bold);
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .month__flag.is-problem {
    color: var(--cl-problem);
    background: var(--cl-problem-wash);
  }
  .month__flag.is-ok {
    color: var(--cl-ok);
    background: var(--cl-ok-wash);
  }
  .month__day :global(.people-stack) {
    margin-top: auto;
    padding-top: 5px;
  }
  .month__day :global(.people-stack__avatar),
  .month__day :global(.people-stack__more) {
    width: 23px;
    height: 23px;
    font-size: 8px;
  }
  .month__bar {
    position: absolute;
    bottom: 0;
    left: 0;
    width: var(--fill);
    height: 3px;
    border-top-right-radius: 2px;
    background: var(--cl-info);
    opacity: .72;
  }

  @media (max-width: 760px) {
    .monthwrap { overflow: hidden; }
    .month { min-width: 0; }
    .month__head {
      min-width: 0;
      padding: 8px 1px;
      font-size: 8px;
      text-align: center;
    }
    .month__day {
      min-height: 68px;
      gap: 2px;
      padding: 6px 3px 9px;
      text-align: center;
    }
    .month__top { justify-content: center; }
    .month__num {
      min-width: 21px;
      height: 21px;
      font-size: 11px;
    }
    .month__primary { font-size: 9px; }
    .month__meta,
    .month__day :global(.people-stack) { display: none; }
    .month__flag {
      position: absolute;
      top: 4px;
      right: 3px;
      width: 7px;
      height: 7px;
      padding: 0;
      color: transparent;
      background: currentColor;
    }
  }
</style>
