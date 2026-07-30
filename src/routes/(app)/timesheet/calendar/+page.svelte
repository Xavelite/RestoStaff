<script lang="ts">
  import {
    addMonths,
    formatHours,
    hoursBetweenClocks,
    isSameMonth,
    monthDates,
    monthLabel,
    monthStart,
    todayInTimezone
  } from '$lib/calendar/date';
  import Dialog from '$lib/components/Dialog.svelte';
  import { i18n, t } from '$lib/i18n/i18n.svelte';
  import { actualSlotsForDate } from '$lib/timesheet/timesheet-model';
  import type { ActualSlot } from '$lib/timesheet/timesheet-model';
  import TimesheetEntryDialog from '$lib/timesheet/TimesheetEntryDialog.svelte';
  import { workspace } from '$lib/workspace/workspace.svelte';
  import WorkspaceMonthGrid, {
    type WorkspaceCalendarDay
  } from '$lib/workspace-ui/WorkspaceMonthGrid.svelte';
  import WorkspacePage from '$lib/workspace-ui/WorkspacePage.svelte';
  import WorkspacePeriodNav from '$lib/workspace-ui/WorkspacePeriodNav.svelte';
  import WorkspaceStat from '$lib/workspace-ui/WorkspaceStat.svelte';
  import { isTimesheetRow, needsAttention, slotLabel } from '$lib/workspace-ui/workspace-time';

  const snapshot = $derived(workspace.operations);
  const role = $derived(workspace.effectiveRole);
  const timezone = $derived(
    snapshot?.restaurant_settings.timezone ||
      workspace.bootstrap?.restaurant_settings.timezone ||
      'Europe/Brussels'
  );
  const today = $derived(todayInTimezone(timezone, new Date()));
  let monthOffset = $state(0);
  let selectedDate = $state('');
  let selectedSlotKey = $state('');
  let selectedSlotDate = $state('');
  const activeMonth = $derived(addMonths(monthStart(today), monthOffset));
  const dates = $derived(monthDates(activeMonth));

  $effect(() => {
    if (workspace.activeId && role && role !== 'employee' && dates.length) {
      void workspace.loadOperations(dates[0], dates.at(-1) ?? dates[0]).catch(() => undefined);
    }
  });

  const days = $derived(
    dates.map((date) => {
      const slots = snapshot
        ? actualSlotsForDate(snapshot, date, today).filter(isTimesheetRow)
        : [];
      return {
        date,
        dayNumber: Number(date.slice(-2)),
        inMonth: isSameMonth(date, activeMonth),
        isToday: date === today,
        isPast: date < today,
        hours: slots.reduce((total, slot) => total + slot.actualHours, 0),
        plannedHours: slots.reduce(
          (total, slot) =>
            total +
            (slot.truth.plan
              ? hoursBetweenClocks(slot.truth.plan.startsAt, slot.truth.plan.endsAt)
              : 0),
          0
        ),
        scheduled: slots.filter((slot) => slot.planned).length,
        issues: slots.filter(needsAttention).length,
        people: Array.from(
          new Map(
            slots.map((slot) => [
              slot.employeeId,
              { id: slot.employeeId, name: slot.employeeName }
            ])
          ).values()
        )
      };
    })
  );
  const monthHours = $derived(
    days.filter((day) => day.inMonth).reduce((total, day) => total + day.hours, 0)
  );
  const monthIssues = $derived(
    days.filter((day) => day.inMonth).reduce((total, day) => total + day.issues, 0)
  );
  const peakHours = $derived(Math.max(1, ...days.map((day) => day.hours)));
  const calendarDays = $derived<WorkspaceCalendarDay[]>(
    days.map((day) => ({
      date: day.date,
      dayNumber: day.dayNumber,
      inMonth: day.inMonth,
      isToday: day.isToday,
      isPast: day.isPast,
      primary:
        day.scheduled || day.hours
          ? t('{hours} worked', { hours: formatHours(day.hours) })
          : '',
      secondary: day.scheduled
        ? t('{hours} planned · {count} people', {
            hours: formatHours(day.plannedHours),
            count: day.people.length
          })
        : '',
      badge: day.issues ? t('{count} to review', { count: day.issues }) : '',
      badgeTone: 'attention',
      people: day.people,
      intensity: Math.round((day.hours / peakHours) * 100)
    }))
  );
  const selectedSlots = $derived(
    selectedDate && snapshot
      ? actualSlotsForDate(snapshot, selectedDate, today).filter(isTimesheetRow)
      : []
  );
  const selectedSlot = $derived(
    selectedSlotDate && snapshot
      ? actualSlotsForDate(snapshot, selectedSlotDate, today)
          .filter(isTimesheetRow)
          .find((slot) => slot.key === selectedSlotKey) ?? null
      : null
  );
  const editable = $derived(
    !workspace.isPreview && Boolean(selectedSlot && selectedSlot.date <= today)
  );

  function selectSlot(slot: ActualSlot): void {
    if (slot.date > today) return;
    selectedSlotDate = slot.date;
    selectedSlotKey = slot.key;
    selectedDate = '';
  }
  const areaName = $derived(
    new Map(snapshot?.work_areas.map((area) => [area.id, area.name]) ?? [])
  );
  const positionName = $derived(
    new Map(snapshot?.job_functions.map((position) => [position.id, position.name]) ?? [])
  );
  const selectedLabel = $derived(
    selectedDate
      ? new Intl.DateTimeFormat(i18n.intlLocale, {
          weekday: 'long',
          day: 'numeric',
          month: 'long',
          timeZone: 'UTC'
        }).format(new Date(`${selectedDate}T00:00:00Z`))
      : ''
  );
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

  <WorkspaceMonthGrid
    label={monthLabel(activeMonth, i18n.intlLocale)}
    days={calendarDays}
    onselect={(day) => (selectedDate = day.date)}
  />
</WorkspacePage>

<Dialog
  open={Boolean(selectedDate)}
  title={selectedLabel}
  description={t('Worked time, planned presence and exceptions for this day.')}
  size="large"
  onclose={() => (selectedDate = '')}
>
  <div class="day-inspector">
    {#if selectedSlots.length}
      {#each selectedSlots as slot (slot.key)}
        <button
          type="button"
          class:has-attention={needsAttention(slot)}
          disabled={slot.date > today}
          aria-label={`${slot.employeeName} · ${t(slotLabel(slot.status))}`}
          onclick={() => selectSlot(slot)}
        >
          <span class="cl-avatar">{slot.employeeName.slice(0, 2).toUpperCase()}</span>
          <span>
            <strong>{slot.employeeName}</strong>
            <small>
              {t(slotLabel(slot.status))} · {slot.actualRange || slot.plannedRange || t('No time recorded')}
              {#if areaName.get(slot.actualAreaId)} · {areaName.get(slot.actualAreaId)}{/if}
              {#if positionName.get(slot.actualJobFunctionId)} · {positionName.get(slot.actualJobFunctionId)}{/if}
            </small>
          </span>
          <b>{slot.actualHours ? formatHours(slot.actualHours) : '—'}</b>
        </button>
      {/each}
    {:else}
      <div class="cl-empty">
        <strong>{t('No activity on this day')}</strong>
        <span>{t('Scheduled and worked rows will appear here.')}</span>
      </div>
    {/if}
  </div>
</Dialog>

<TimesheetEntryDialog
  slot={selectedSlot}
  {snapshot}
  {timezone}
  {editable}
  onclose={() => {
    selectedSlotKey = '';
    selectedSlotDate = '';
  }}
/>

<style>
  .day-inspector {
    display: grid;
    border: 1px solid var(--cl-line);
    border-radius: var(--cl-radius);
    overflow: hidden;
  }
  .day-inspector > button {
    min-width: 0;
    min-height: 54px;
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto;
    align-items: center;
    gap: 10px;
    padding: 8px 11px;
    border: 0;
    border-bottom: 1px solid var(--cl-grid-line);
    color: inherit;
    background: var(--cl-surface);
    font: inherit;
    text-align: left;
    text-decoration: none;
    cursor: pointer;
  }
  .day-inspector > button:hover:not(:disabled) { background: var(--cl-surface-muted); }
  .day-inspector > button:disabled { cursor: default; }
  .day-inspector > button:last-child { border-bottom: 0; }
  .day-inspector > button.has-attention { box-shadow: inset 3px 0 0 var(--cl-attention); }
  .day-inspector > button > span:nth-child(2) {
    min-width: 0;
    display: grid;
    gap: 3px;
  }
  .day-inspector strong,
  .day-inspector small {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .day-inspector small { color: var(--cl-muted); }
  .day-inspector b { font-variant-numeric: tabular-nums; }
</style>
