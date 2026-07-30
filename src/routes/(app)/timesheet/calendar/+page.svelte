<script lang="ts">
  import {
    addMonths,
    formatHours,
    isSameMonth,
    monthDates,
    monthLabel,
    monthStart,
    todayInTimezone,
    WEEKDAYS
  } from '$lib/calendar/date';
  import { i18n, t } from '$lib/i18n/i18n.svelte';
  import { workspace } from '$lib/workspace/workspace.svelte';
  import { actualSlotsForDate } from '$lib/timesheet/timesheet-model';
  import WorkspacePage from '$lib/workspace-ui/WorkspacePage.svelte';
  import WorkspacePeriodNav from '$lib/workspace-ui/WorkspacePeriodNav.svelte';
  import WorkspaceStat from '$lib/workspace-ui/WorkspaceStat.svelte';
  import { isTimesheetRow, needsAttention } from '$lib/workspace-ui/workspace-time';

  const snapshot = $derived(workspace.operations);
  const role = $derived(workspace.effectiveRole);
  const timezone = $derived(
    snapshot?.restaurant_settings.timezone ||
      workspace.bootstrap?.restaurant_settings.timezone ||
      'Europe/Brussels'
  );

  const today = $derived(todayInTimezone(timezone, new Date()));
  let monthOffset = $state(0);
  const activeMonth = $derived(addMonths(monthStart(today), monthOffset));
  const dates = $derived(monthDates(activeMonth));

  // The grid always shows whole weeks, so the read model is loaded for the
  // whole visible span rather than the calendar month.
  $effect(() => {
    if (workspace.activeId && role && role !== 'employee' && dates.length) {
      void workspace
        .loadOperations(dates[0], dates[dates.length - 1])
        .catch(() => undefined);
    }
  });

  type CalendarDay = {
    date: string;
    dayNumber: number;
    inMonth: boolean;
    isToday: boolean;
    hours: number;
    scheduled: number;
    issues: number;
  };

  const days = $derived<CalendarDay[]>(
    dates.map((date) => {
      const slots = snapshot
        ? actualSlotsForDate(snapshot, date, today).filter(isTimesheetRow)
        : [];
      return {
        date,
        dayNumber: Number(date.slice(-2)),
        inMonth: isSameMonth(date, activeMonth),
        isToday: date === today,
        hours: slots.reduce((total, slot) => total + slot.actualHours, 0),
        scheduled: slots.filter((slot) => slot.planned).length,
        issues: slots.filter(needsAttention).length
      };
    })
  );
  const monthHours = $derived(
    days.filter((day) => day.inMonth).reduce((total, day) => total + day.hours, 0)
  );
  const monthIssues = $derived(
    days.filter((day) => day.inMonth).reduce((total, day) => total + day.issues, 0)
  );
  // The busiest day sets the scale for every day's intensity bar, so the month
  // reads as a heat strip without any day being off the chart.
  const peakHours = $derived(Math.max(1, ...days.map((day) => day.hours)));
</script>

<svelte:head><title>{t('Calendar')} &middot; restogogo</title></svelte:head>

{#snippet pageActions()}
  <WorkspacePeriodNav
    label={monthLabel(activeMonth, i18n.intlLocale)}
    onprevious={() => (monthOffset -= 1)}
    onnext={() => (monthOffset += 1)}
    ontoday={() => (monthOffset = 0)}
    todayLabel="This month"
  />
{/snippet}

<WorkspacePage actions={pageActions}>

  <div class="cl-stats">
    <WorkspaceStat label="Worked hours" value={monthHours} format={formatHours} accent="var(--cl-ok)" mutedZero={false} />
    <WorkspaceStat label="Rows needing attention" value={monthIssues} tone={monthIssues ? 'attention' : undefined} />
  </div>

  <div class="monthwrap">
    <div class="month" role="grid" aria-label={monthLabel(activeMonth, i18n.intlLocale)}>
      {#each WEEKDAYS as weekdayName (weekdayName)}
        <div class="month__head" role="columnheader">{t(weekdayName)}</div>
      {/each}
      {#each days as day (day.date)}
        <a class="month__day" class:is-out={!day.inMonth} class:is-today={day.isToday} role="gridcell" href={`/timesheet?date=${day.date}`}>
          <div class="month__top">
            <span class="month__num">{day.dayNumber}</span>
            {#if day.issues}
              <span class="month__flag" title={t('{count} to review', { count: day.issues })}>! {day.issues}</span>
            {/if}
          </div>
          {#if day.hours}
            <span class="month__hours">{formatHours(day.hours)}</span>
          {/if}
          {#if day.scheduled}
            <span class="month__meta">{t('{count} scheduled', { count: day.scheduled })}</span>
          {/if}
          {#if day.hours}
            <span class="month__bar" style="--fill:{Math.round((day.hours / peakHours) * 100)}%"></span>
          {/if}
        </a>
      {/each}
    </div>
  </div>
</WorkspacePage>

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
    padding: 12px 14px;
    border-bottom: 1px solid var(--cl-line);
    border-left: 1px solid var(--cl-line);
    background: var(--cl-surface-muted);
    font-size: 13px;
    font-weight: var(--rst-fw-bold);
  }
  .month__day {
    position: relative;
    display: grid;
    align-content: start;
    gap: 3px;
    min-height: 108px;
    padding: 10px 14px 16px;
    border-bottom: 1px solid var(--cl-line);
    border-left: 1px solid var(--cl-line);
    color: inherit;
    text-decoration: none;
    transition: background var(--cl-dur) var(--cl-ease), box-shadow var(--cl-dur) var(--cl-ease);
  }
  .month__day:hover {
    background: color-mix(in srgb, var(--cl-accent) 5%, var(--cl-surface));
    box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--cl-accent) 28%, transparent);
  }
  .month__head:nth-child(7n + 1),
  .month__day:nth-child(7n + 1) {
    border-left: 0;
  }
  /* Days from the neighbouring months stay readable but recede. */
  .month__day.is-out {
    background: var(--cl-surface-muted);
    color: var(--cl-muted);
  }
  .month__top {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 6px;
  }
  .month__num {
    font-size: 14px;
    font-weight: var(--rst-fw-bold);
    font-variant-numeric: tabular-nums;
  }
  /* Today's date is a filled orange chip — the one place orange marks state. */
  .month__day.is-today .month__num {
    display: inline-grid;
    place-items: center;
    min-width: 24px;
    height: 24px;
    margin: -3px 0;
    padding: 0 6px;
    border-radius: 999px;
    color: #fff;
    background: var(--cl-accent);
  }
  .month__hours {
    font-size: 14px;
    font-weight: var(--rst-fw-medium);
    font-variant-numeric: tabular-nums;
  }
  .month__meta {
    color: var(--cl-muted);
    font-size: 13px;
  }
  .month__flag {
    display: inline-flex;
    align-items: center;
    gap: 3px;
    padding: 1px 7px;
    border-radius: 999px;
    color: var(--cl-attention);
    background: var(--cl-attention-wash);
    font-size: 12px;
    font-weight: var(--rst-fw-bold);
    font-variant-numeric: tabular-nums;
  }
  /* A worked-hours heat bar along the bottom edge, scaled to the busiest day. */
  .month__bar {
    position: absolute;
    left: 0;
    bottom: 0;
    height: 4px;
    width: var(--fill);
    background: var(--cl-ok);
    opacity: 0.7;
    border-top-right-radius: 2px;
  }

  @media (max-width: 760px) {
    .monthwrap {
      overflow: hidden;
    }
    .month {
      min-width: 0;
    }
    .month__head {
      min-width: 0;
      padding: 8px 1px;
      font-size: 9px;
      text-align: center;
    }
    .month__day {
      min-width: 0;
      min-height: 62px;
      gap: 2px;
      padding: 7px 3px 10px;
      text-align: center;
    }
    .month__top {
      justify-content: center;
    }
    .month__num {
      font-size: 12px;
    }
    .month__hours {
      font-size: 9px;
    }
    .month__meta {
      display: none;
    }
    .month__flag {
      position: absolute;
      top: 4px;
      right: 3px;
      width: 7px;
      height: 7px;
      overflow: hidden;
      padding: 0;
      border-radius: 50%;
      color: transparent;
      background: var(--cl-attention);
    }
    .month__day.is-today .month__num {
      min-width: 21px;
      height: 21px;
      padding-inline: 4px;
    }
    .month__bar {
      height: 3px;
    }
  }
</style>
