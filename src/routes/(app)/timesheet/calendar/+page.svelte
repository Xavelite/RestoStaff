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
  import WorkspaceServiceIcon from '$lib/workspace-ui/WorkspaceServiceIcon.svelte';
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
  let detailed = $state(false);
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
      secondary: day.scheduled || day.hours
        ? detailed
          ? `${formatHours(day.plannedHours)} ${t('planned')} · ${formatDelta(day.hours - day.plannedHours)}`
          : t('{count} people', { count: day.people.length })
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
  const selectedWorked = $derived(
    selectedSlots.reduce((total, slot) => total + slot.actualHours, 0)
  );
  const selectedPlanned = $derived(
    selectedSlots.reduce(
      (total, slot) =>
        total +
        (slot.truth.plan
          ? hoursBetweenClocks(slot.truth.plan.startsAt, slot.truth.plan.endsAt)
          : 0),
      0
    )
  );
  const selectedPeople = $derived(new Set(selectedSlots.map((slot) => slot.employeeId)).size);
  const selectedIssues = $derived(selectedSlots.filter(needsAttention).length);
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

  function formatDelta(value: number): string {
    if (Math.abs(value) < 0.01) return t('on plan');
    return `${value > 0 ? '+' : '−'}${formatHours(Math.abs(value))}`;
  }
</script>

<svelte:head><title>{t('Calendar')} &middot; restogogo</title></svelte:head>

{#snippet pageActions()}
  <div class="calendar-toolbar">
    <WorkspacePeriodNav
      label={monthLabel(activeMonth, i18n.intlLocale)}
      onprevious={() => (monthOffset -= 1)}
      onnext={() => (monthOffset += 1)}
      ontoday={() => (monthOffset = 0)}
      todayLabel="This month"
    />
    <label class="calendar-detail">
      <input type="checkbox" bind:checked={detailed} />
      <span>{t('Plan comparison')}</span>
    </label>
  </div>
{/snippet}

<WorkspacePage actions={pageActions} actionsAlign="center">
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
      <div class="day-summary">
        <span><b>{selectedPeople}</b>{t('people')}</span>
        <span><b>{formatHours(selectedPlanned)}</b>{t('planned')}</span>
        <span><b>{formatHours(selectedWorked)}</b>{t('worked')}</span>
        <span class:is-problem={selectedIssues > 0}><b>{selectedIssues}</b>{t('to review')}</span>
      </div>
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
              <WorkspaceServiceIcon service={slot.serviceKey} size={13} />
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
  .calendar-toolbar {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 14px;
  }
  .calendar-detail {
    display: inline-flex;
    align-items: center;
    gap: 7px;
    color: var(--cl-muted);
    font-size: 11px;
    font-weight: var(--rst-fw-bold);
    cursor: pointer;
  }
  .calendar-detail input { accent-color: var(--cl-accent); }
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
  .day-inspector small { display: flex; align-items: center; gap: 4px; color: var(--cl-muted); }
  .day-inspector b { font-variant-numeric: tabular-nums; }
  .day-summary {
    display: flex;
    align-items: center;
    gap: 20px;
    padding: 10px 12px;
    border-bottom: 1px solid var(--cl-line);
    background: var(--cl-surface-muted);
  }
  .day-summary span {
    display: grid;
    gap: 1px;
    color: var(--cl-muted);
    font-size: 9px;
    text-transform: uppercase;
  }
  .day-summary span.is-problem,
  .day-summary span.is-problem b { color: var(--cl-problem); }
  .day-summary b { color: var(--cl-ink); font-size: 13px; text-transform: none; }
  @media (max-width: 760px) {
    .calendar-toolbar { width: 100%; flex-wrap: wrap; }
    .day-summary { gap: 12px; overflow-x: auto; }
  }
</style>
