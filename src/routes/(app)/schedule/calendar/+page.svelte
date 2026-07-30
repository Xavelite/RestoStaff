<script lang="ts">
  import { onMount } from 'svelte';
  import {
    addDays,
    addMonths,
    formatHours,
    hoursBetweenClocks,
    isSameMonth,
    mondayFor,
    monthDates,
    monthLabel,
    monthStart,
    serviceLabel,
    todayInTimezone
  } from '$lib/calendar/date';
  import { friendlyError } from '$lib/api/error-messages';
  import Dialog from '$lib/components/Dialog.svelte';
  import { i18n, t } from '$lib/i18n/i18n.svelte';
  import { unsavedChanges } from '$lib/navigation/unsaved-changes.svelte';
  import {
    exceptionForSlot,
    invalidPlanningShift,
    leaveForSlot,
    resolveScheduleException,
    resolveScheduleLeave,
    saveSchedule
  } from '$lib/schedule/schedule-actions';
  import ScheduleSlotEditor from '$lib/schedule/ScheduleSlotEditor.svelte';
  import {
    buildPlanningWeek,
    coverageIssues,
    planningContractOverages,
    planningDraftForWeek,
    planningNotesForWeek,
    planningStatusForWeek,
    type PlanningNoteDraft,
    type PlanningShiftDraft
  } from '$lib/schedule/schedule-model';
  import { confirmAction } from '$lib/ui/confirm.svelte';
  import { buildAreaColorMap } from '$lib/ui/position-color';
  import { toasts } from '$lib/ui/toast.svelte';
  import { workspace } from '$lib/workspace/workspace.svelte';
  import WorkspaceMonthGrid, {
    type WorkspaceCalendarDay
  } from '$lib/workspace-ui/WorkspaceMonthGrid.svelte';
  import WorkspacePage from '$lib/workspace-ui/WorkspacePage.svelte';
  import WorkspacePeriodNav from '$lib/workspace-ui/WorkspacePeriodNav.svelte';
  import WorkspaceServiceIcon from '$lib/workspace-ui/WorkspaceServiceIcon.svelte';

  type DatedShift = PlanningShiftDraft & { date: string; weekStart: string };

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
  let editorWeekStart = $state('');
  let editorSlotKey = $state('');
  let editorDraft = $state<PlanningShiftDraft[]>([]);
  let editorNotes = $state<PlanningNoteDraft[]>([]);
  let editorBaseline = $state('');
  let editorSaving = $state(false);
  let detailed = $state(false);
  const activeMonth = $derived(addMonths(monthStart(today), monthOffset));
  const dates = $derived(monthDates(activeMonth));
  const weeks = $derived(Array.from(new Set(dates.map(mondayFor))));

  $effect(() => {
    if (workspace.activeId && role && role !== 'employee' && dates.length) {
      void workspace.loadOperations(dates[0], dates.at(-1) ?? dates[0]).catch(() => undefined);
    }
  });

  const datedShifts = $derived<DatedShift[]>(
    snapshot
      ? weeks.flatMap((weekStart) =>
          planningDraftForWeek(snapshot, weekStart).map((shift) => ({
            ...shift,
            weekStart,
            date: addDays(weekStart, shift.weekday - 1)
          }))
        )
      : []
  );
  const gaps = $derived(
    snapshot
      ? weeks.flatMap((weekStart) =>
          coverageIssues(snapshot, planningDraftForWeek(snapshot, weekStart), weekStart)
        )
      : []
  );
  const employeeName = $derived(
    new Map(snapshot?.employees.map((employee) => [employee.id, employee.display_name]) ?? [])
  );
  const areaName = $derived(
    new Map(snapshot?.work_areas.map((area) => [area.id, area.name]) ?? [])
  );
  const positionName = $derived(
    new Map(snapshot?.job_functions.map((position) => [position.id, position.name]) ?? [])
  );
  const areaColor = $derived(
    snapshot ? buildAreaColorMap(snapshot.work_areas) : new Map<string, string>()
  );
  const positionCost = $derived(
    new Map(
      (snapshot?.job_functions ?? []).map((position) => [
        position.id,
        Number(position.estimated_hourly_cost) || 0
      ])
    )
  );
  const employeeCost = $derived(
    new Map(
      (snapshot?.employee_payroll_profiles ?? []).map((profile) => [
        profile.employee_id,
        Number(profile.estimated_hourly_cost) || 0
      ])
    )
  );
  const contractHours = $derived(
    new Map(
      (snapshot?.employee_contracts ?? [])
        .filter((contract) => contract.active && contract.is_current)
        .map((contract) => [contract.employee_id, Number(contract.weekly_contract_hours) || 0])
    )
  );
  const editorGrid = $derived(
    snapshot && editorWeekStart
      ? buildPlanningWeek({
          snapshot,
          weekStart: editorWeekStart,
          today,
          draft: editorDraft
        })
      : null
  );
  const editorSlot = $derived(editorGrid?.slotsByKey.get(editorSlotKey) ?? null);
  const editorDirty = $derived(
    Boolean(
      editorBaseline &&
        editorBaseline !== JSON.stringify({ shifts: editorDraft, notes: editorNotes })
    )
  );

  const dayData = $derived(
    dates.map((date) => {
      const shifts = datedShifts.filter((shift) => shift.date === date);
      const people = Array.from(
        new Map(
          shifts.map((shift) => [
            shift.employeeId,
            {
              id: shift.employeeId,
              name: employeeName.get(shift.employeeId) ?? t('Unknown employee')
            }
          ])
        ).values()
      );
      const hours = shifts.reduce(
        (total, shift) => total + hoursBetweenClocks(shift.startsAt, shift.endsAt),
        0
      );
      const cost = shifts.reduce((total, shift) => {
        const hourly =
          employeeCost.get(shift.employeeId) ??
          positionCost.get(shift.jobFunctionId) ??
          0;
        return total + hourly * hoursBetweenClocks(shift.startsAt, shift.endsAt);
      }, 0);
      return {
        date,
        dayNumber: Number(date.slice(-2)),
        inMonth: isSameMonth(date, activeMonth),
        isToday: date === today,
        isPast: date < today,
        shifts,
        people,
        hours,
        cost,
        services: new Set(shifts.map((shift) => shift.serviceKey)).size,
        gaps: gaps.filter((gap) => gap.date === date).reduce((total, gap) => total + gap.missing, 0)
      };
    })
  );
  const peakHours = $derived(Math.max(1, ...dayData.map((day) => day.hours)));
  const calendarDays = $derived<WorkspaceCalendarDay[]>(
    dayData.map((day) => ({
      date: day.date,
      dayNumber: day.dayNumber,
      inMonth: day.inMonth,
      isToday: day.isToday,
      isPast: day.isPast,
      primary: day.hours ? t('{hours} planned', { hours: formatHours(day.hours) }) : '',
      secondary: day.people.length
        ? detailed
          ? day.cost > 0 && workspace.canViewFinancials
            ? `${t('{count} people', { count: day.people.length })} · ~${formatMoney(day.cost)}`
            : `${t('{count} people', { count: day.people.length })} · ${t('{count} services', { count: day.services })}`
          : t('{count} people', { count: day.people.length })
        : '',
      badge: day.gaps ? t('{count} gaps', { count: day.gaps }) : '',
      badgeTone: 'problem',
      people: day.people,
      intensity: Math.round((day.hours / peakHours) * 100)
    }))
  );
  const selectedDay = $derived(dayData.find((day) => day.date === selectedDate) ?? null);
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

  function formatMoney(value: number): string {
    return new Intl.NumberFormat(i18n.intlLocale, {
      style: 'currency',
      currency: snapshot?.restaurant_settings.currency_code || 'EUR',
      maximumFractionDigits: 0
    }).format(value);
  }

  function openShiftEditor(shift: DatedShift): void {
    if (!snapshot) return;
    const shifts = planningDraftForWeek(snapshot, shift.weekStart);
    const notes = planningNotesForWeek(snapshot, shift.weekStart);
    editorWeekStart = shift.weekStart;
    editorSlotKey = `${shift.employeeId}|${shift.date}|${shift.serviceKey}`;
    editorDraft = shifts;
    editorNotes = notes;
    editorBaseline = JSON.stringify({ shifts, notes });
    selectedDate = '';
  }

  function closeEditor(): void {
    editorWeekStart = '';
    editorSlotKey = '';
    editorDraft = [];
    editorNotes = [];
    editorBaseline = '';
  }

  function requestCloseEditor(): void {
    if (editorSaving) return;
    void unsavedChanges.runOrRequest(closeEditor);
  }

  function employeeHours(shifts: PlanningShiftDraft[], employeeId: string): number {
    return shifts
      .filter((shift) => shift.employeeId === employeeId)
      .reduce(
        (total, shift) =>
          total + hoursBetweenClocks(shift.startsAt, shift.endsAt),
        0
      );
  }

  async function updateEditorDraft(next: PlanningShiftDraft[]): Promise<void> {
    const currentHours = new Map(
      [...new Set(editorDraft.map((shift) => shift.employeeId))].map((employeeId) => [
        employeeId,
        employeeHours(editorDraft, employeeId)
      ])
    );
    const increased = planningContractOverages(next, contractHours).filter(
      (overage) => overage.planned > (currentHours.get(overage.employeeId) ?? 0)
    );
    if (increased.length) {
      const first = increased[0];
      const confirmed = await confirmAction({
        title: t(increased.length === 1
          ? 'Exceed contracted hours?'
          : 'Exceed contracted hours for multiple employees?'),
        body: increased.length === 1
          ? t('{name} would have {planned} planned against {target} contracted ({excess} over). The schedule can continue, but this employee will be marked as an hours conflict.', {
              name: employeeName.get(first.employeeId) ?? t('Employee'),
              planned: formatHours(first.planned),
              target: formatHours(first.target),
              excess: formatHours(first.excess)
            })
          : t('{count} employees would exceed their contracted weekly hours: {names}. The schedule can continue, but each overage will be marked as a conflict.', {
              count: increased.length,
              names: increased
                .slice(0, 3)
                .map((item) => `${employeeName.get(item.employeeId) ?? t('Employee')} (+${formatHours(item.excess)})`)
                .join(', ')
            }),
        confirmLabel: t('Plan anyway'),
        cancelLabel: t('Keep within contract'),
        tone: 'danger'
      });
      if (!confirmed) return;
    }
    editorDraft = next;
  }

  async function saveEditor(): Promise<void> {
    if (!snapshot || !workspace.activeId || !editorWeekStart) {
      throw new Error(t('Schedule data is not loaded.'));
    }
    if (invalidPlanningShift(editorDraft)) {
      throw new Error(t('Every planned shift needs a valid start and end time.'));
    }
    const status = planningStatusForWeek(snapshot, editorWeekStart);
    editorSaving = true;
    try {
      await saveSchedule({
        restaurantId: workspace.activeId,
        weekStart: editorWeekStart,
        status: 'draft',
        shifts: editorDraft,
        notes: editorNotes,
        expectedRevision: status.revision,
        wasPublished: status.planning === 'published'
      });
      await workspace.loadOperations(dates[0], dates.at(-1) ?? dates[0], true);
      toasts.show(
        t(status.planning === 'published' ? 'Private schedule draft saved.' : 'Schedule saved.'),
        'success'
      );
      closeEditor();
    } catch (error) {
      toasts.show(friendlyError(error), 'danger');
      throw error;
    } finally {
      editorSaving = false;
    }
  }

  async function reloadEditorContext(): Promise<void> {
    await workspace.loadOperations(dates[0], dates.at(-1) ?? dates[0], true);
  }

  onMount(() =>
    unsavedChanges.register({
      id: 'schedule-calendar-entry',
      label: 'Schedule shift',
      isDirty: () => editorDirty,
      save: saveEditor,
      discard: closeEditor
    })
  );
</script>

<svelte:head><title>{t('Schedule calendar')} &middot; restogogo</title></svelte:head>

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
      <span>{t('Costs & services')}</span>
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
  open={Boolean(selectedDay)}
  title={selectedLabel}
  description={selectedDay
    ? t('{count} scheduled · {hours}', {
        count: selectedDay.people.length,
        hours: formatHours(selectedDay.hours)
      })
    : ''}
  size="large"
  onclose={() => (selectedDate = '')}
>
  <div class="day-inspector">
    {#if selectedDay?.shifts.length}
      <div class="day-summary">
        <span><b>{selectedDay.people.length}</b>{t('people')}</span>
        <span><b>{formatHours(selectedDay.hours)}</b>{t('planned')}</span>
        <span><b>{selectedDay.services}</b>{t('services')}</span>
        {#if workspace.canViewFinancials && selectedDay.cost > 0}
          <span><b>~{formatMoney(selectedDay.cost)}</b>{t('estimated cost')}</span>
        {/if}
      </div>
      {#each selectedDay.shifts as shift (`${shift.employeeId}|${shift.serviceKey}`)}
        <button
          type="button"
          style={`--row-color:${areaColor.get(shift.areaId) ?? 'var(--cl-info)'}`}
          onclick={() => openShiftEditor(shift)}
        >
          <span class="cl-avatar">{(employeeName.get(shift.employeeId) ?? '?').slice(0, 2).toUpperCase()}</span>
          <span>
            <strong>{employeeName.get(shift.employeeId) ?? t('Unknown employee')}</strong>
            <small>
              <WorkspaceServiceIcon service={shift.serviceKey} size={13} />
              {shift.startsAt}–{shift.endsAt} ·
              {t(serviceLabel(shift.serviceKey, snapshot?.services))}
            </small>
            <em>{areaName.get(shift.areaId) ?? t('No area')} · {positionName.get(shift.jobFunctionId) ?? t('No position')}</em>
          </span>
          <b>{formatHours(hoursBetweenClocks(shift.startsAt, shift.endsAt))}</b>
        </button>
      {/each}
    {:else}
      <div class="cl-empty">
        <strong>{t('No scheduled shifts')}</strong>
        <span>{t('Open the roster to plan this day.')}</span>
      </div>
    {/if}
  </div>
</Dialog>

<Dialog
  open={Boolean(editorSlot)}
  title={editorSlot?.employeeName ?? t('Schedule')}
  description={editorSlot
    ? `${new Intl.DateTimeFormat(i18n.intlLocale, { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' }).format(new Date(`${editorSlot.date}T00:00:00Z`))} · ${t(serviceLabel(editorSlot.serviceKey, snapshot?.services))}`
    : ''}
  flush
  onclose={requestCloseEditor}
>
  {#if editorSlot && snapshot && workspace.activeId}
    <ScheduleSlotEditor
      {snapshot}
      slot={editorSlot}
      draft={editorDraft}
      notes={editorNotes}
      editable={!workspace.isPreview && editorSlot.date >= today}
      onchange={(next) => void updateEditorDraft(next)}
      onnotes={(next) => (editorNotes = next)}
      oncancelleave={async () => {
        const absence = leaveForSlot(editorSlot, snapshot.absences, ['pending', 'approved']);
        if (!absence || !workspace.activeId) return false;
        try {
          await resolveScheduleLeave({
            restaurantId: workspace.activeId,
            slot: editorSlot,
            absenceId: absence.id,
            action: 'cancel_for_planning'
          });
          await reloadEditorContext();
          return true;
        } catch (error) {
          toasts.show(friendlyError(error), 'danger');
          return false;
        }
      }}
      onresolveleave={async (action) => {
        const absence = leaveForSlot(editorSlot, snapshot.absences, ['pending']);
        if (!absence || !workspace.activeId) return false;
        try {
          await resolveScheduleLeave({
            restaurantId: workspace.activeId,
            slot: editorSlot,
            absenceId: absence.id,
            action
          });
          await reloadEditorContext();
          toasts.show(action === 'approve' ? t('Leave approved.') : t('Leave rejected.'), 'success');
          return true;
        } catch (error) {
          toasts.show(friendlyError(error), 'danger');
          return false;
        }
      }}
      onresolveexception={async (action) => {
        const exception = exceptionForSlot(editorSlot, snapshot.work_pattern_exceptions);
        if (!exception || !workspace.activeId) return false;
        try {
          await resolveScheduleException({
            restaurantId: workspace.activeId,
            slot: editorSlot,
            exceptionId: exception.id,
            action
          });
          await reloadEditorContext();
          return true;
        } catch (error) {
          toasts.show(friendlyError(error), 'danger');
          return false;
        }
      }}
    />
  {/if}
  {#snippet footer()}
    <span class="shift-dialog__hint">{t(editorDirty ? 'Unsaved changes' : 'Schedule details')}</span>
    <button class="cl-btn" type="button" disabled={editorSaving} onclick={requestCloseEditor}>{t('Cancel')}</button>
    <button class="cl-btn is-primary" type="button" disabled={!editorDirty || editorSaving} onclick={() => void saveEditor().catch(() => undefined)}>
      {t(editorSaving ? 'Saving…' : 'Save')}
    </button>
  {/snippet}
</Dialog>

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
    min-height: 64px;
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto;
    align-items: center;
    gap: 10px;
    padding: 9px 11px;
    border: 0;
    border-bottom: 1px solid var(--cl-grid-line);
    color: inherit;
    background: var(--cl-surface);
    font: inherit;
    text-align: left;
    text-decoration: none;
    cursor: pointer;
    box-shadow: inset 3px 0 0 var(--row-color, var(--cl-info));
  }
  .day-inspector > button:hover {
    background: color-mix(in srgb, var(--cl-accent) 5%, var(--cl-surface));
  }
  .day-inspector > button:last-child { border-bottom: 0; }
  .day-inspector > button > span:nth-child(2) {
    min-width: 0;
    display: grid;
    gap: 2px;
  }
  .day-inspector strong,
  .day-inspector small,
  .day-inspector em {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .day-inspector small,
  .day-inspector em { color: var(--cl-muted); }
  .day-inspector small { display: flex; align-items: center; gap: 4px; }
  .day-inspector em { font-size: 10px; font-style: normal; }
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
  .day-summary b { color: var(--cl-ink); font-size: 13px; text-transform: none; }
  .shift-dialog__hint { margin-right: auto; align-self: center; color: var(--cl-muted); font-size: 11px; }
  @media (max-width: 760px) {
    .calendar-toolbar { width: 100%; flex-wrap: wrap; }
    .day-summary { gap: 12px; overflow-x: auto; }
  }
</style>
