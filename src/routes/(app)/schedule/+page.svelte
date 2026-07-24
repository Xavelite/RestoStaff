<script lang="ts">
  import { addDays, clockLabel, formatHours, hoursBetweenClocks, type ServiceKey } from '$lib/calendar/date';
  import Dialog from '$lib/components/Dialog.svelte';
  import { friendlyError } from '$lib/api/error-messages';
  import { i18n, t } from '$lib/i18n/i18n.svelte';
  import { toasts } from '$lib/ui/toast.svelte';
  import { workspace } from '$lib/workspace/workspace.svelte';
  import ScheduleSlotEditor from '$lib/schedule/ScheduleSlotEditor.svelte';
  import {
    exceptionForSlot,
    invalidPlanningShift,
    leaveForSlot,
    resolveScheduleException,
    resolveScheduleLeave,
    saveSchedule
  } from '$lib/schedule/schedule-actions';
  import {
    buildPlanningWeek,
    planningDraftForWeek,
    planningNotesForWeek,
    type PlanningGridSlot
  } from '$lib/schedule/schedule-model';
  import { buildEmployeeColorMap } from '$lib/ui/position-color';
  import { personInitials } from '$lib/ui/person';
  import ClassicPage from '$lib/classic/ClassicPage.svelte';
  import ClassicScheduleWeek from '$lib/classic/ClassicScheduleWeek.svelte';
  import { scheduleDraft } from '$lib/classic/classic-schedule.svelte';
  import { downloadCsv } from '$lib/export/csv';
  import { planningCsv } from '$lib/schedule/schedule-export';
  import { DEFAULT_PLANNING_EXPORT_COLUMNS } from '$lib/schedule/schedule-export-columns';

  const SERVICES: ServiceKey[] = ['lunch', 'evening'];

  const snapshot = $derived(workspace.operations);
  const employeeColor = $derived(
    snapshot
      ? buildEmployeeColorMap(snapshot.job_functions, snapshot.employee_job_functions)
      : new Map<string, string>()
  );
  // Each employee's contract target, shown under their name against the hours
  // planned so far this week.
  const contractHours = $derived(
    new Map(
      (snapshot?.employee_contracts ?? [])
        .filter((contract) => contract.active && contract.is_current)
        .map((contract) => [contract.employee_id, Number(contract.weekly_contract_hours) || 0])
    )
  );

  let selectedKey = $state('');
  let saving = $state(false);
  let search = $state('');
  let positionId = $state('');
  let onlyConflicts = $state(false);
  // Which empty day cell is choosing a service to add (key = employeeId|date).
  let pendingAdd = $state('');



  const employeePosition = $derived.by(() => {
    const primary = new Map<string, string>();
    for (const assignment of snapshot?.employee_job_functions ?? []) {
      if (!assignment.active) continue;
      if (assignment.is_primary || !primary.has(assignment.employee_id)) {
        primary.set(assignment.employee_id, assignment.job_function_id);
      }
    }
    return primary;
  });

  function visibleRows(grid: ReturnType<typeof buildPlanningWeek>) {
    const needle = search.trim().toLocaleLowerCase(i18n.intlLocale);
    return grid.rows.filter((row) => {
      if (needle && !`${row.name} ${row.meta}`.toLocaleLowerCase(i18n.intlLocale).includes(needle)) {
        return false;
      }
      if (positionId && employeePosition.get(row.id) !== positionId) return false;
      if (
        onlyConflicts &&
        ![...grid.slotsByKey.values()].some(
          (slot) => slot.employeeId === row.id && slot.truth.state === 'conflict'
        )
      ) {
        return false;
      }
      return true;
    });
  }

  function copyPreviousWeek(weekStart: string): void {
    if (!snapshot) return;
    const previousWeek = addDays(weekStart, -7);
    const employeeIds = new Set(snapshot.employees.filter((item) => item.active).map((item) => item.id));
    const areaIds = new Set(snapshot.work_areas.filter((item) => item.active).map((item) => item.id));
    const positionIds = new Set(snapshot.job_functions.filter((item) => item.active).map((item) => item.id));
    const copied = planningDraftForWeek(snapshot, previousWeek)
      .filter(
        (shift) =>
          employeeIds.has(shift.employeeId) &&
          (!shift.areaId || areaIds.has(shift.areaId)) &&
          (!shift.jobFunctionId || positionIds.has(shift.jobFunctionId))
      )
      .map((shift) => ({ ...shift, source: 'copied' as const }));
    scheduleDraft.replace(copied);
    scheduleDraft.replaceNotes(planningNotesForWeek(snapshot, previousWeek));
    toasts.show(
      copied.length
        ? t('{count} shifts copied from the previous week.', { count: copied.length })
        : t('The previous week has no shifts to copy.'),
      copied.length ? 'success' : 'warning'
    );
  }

  function exportWeek(weekStart: string): void {
    if (!snapshot) return;
    const file = planningCsv({
      snapshot,
      activeWeek: weekStart,
      draft: scheduleDraft.shifts,
      notes: scheduleDraft.notes,
      columns: DEFAULT_PLANNING_EXPORT_COLUMNS,
      translate: t
    });
    downloadCsv(file.filename, file.headers, file.rows);
  }

  function compact(value: string): string {
    const label = clockLabel(value);
    if (!label) return '';
    return label.endsWith(':00') ? label.slice(0, 2).replace(/^0/, '') : label;
  }

  function slotKey(employeeId: string, date: string, service: ServiceKey): string {
    return `${employeeId}|${date}|${service}`;
  }

  // The shifts a person has that day, in service order, as coloured chips.
  function dayShifts(
    grid: ReturnType<typeof buildPlanningWeek>,
    employeeId: string,
    date: string
  ): Array<{ key: string; service: ServiceKey; label: string; hours: string; conflict: boolean }> {
    return SERVICES.flatMap((service) => {
      const slot = grid.slotsByKey.get(slotKey(employeeId, date, service));
      if (!slot?.shift) return [];
      return [
        {
          key: slot.key,
          service,
          label: `${compact(slot.shift.startsAt)}–${compact(slot.shift.endsAt)}`,
          hours: formatHours(hoursBetweenClocks(slot.shift.startsAt, slot.shift.endsAt)),
          conflict: slot.truth.state === 'conflict'
        }
      ];
    });
  }

  // Services still free that day — what "＋" can add.
  function freeServices(
    grid: ReturnType<typeof buildPlanningWeek>,
    employeeId: string,
    date: string
  ): ServiceKey[] {
    return SERVICES.filter((service) => !grid.slotsByKey.get(slotKey(employeeId, date, service))?.shift);
  }

  function addAt(employeeId: string, date: string, service: ServiceKey) {
    pendingAdd = '';
    selectedKey = slotKey(employeeId, date, service);
  }

  function onAddClick(grid: ReturnType<typeof buildPlanningWeek>, employeeId: string, date: string) {
    const free = freeServices(grid, employeeId, date);
    if (free.length === 1) addAt(employeeId, date, free[0]);
    else pendingAdd = `${employeeId}|${date}`;
  }

  async function persist(weekStart: string, revision: number, published: boolean) {
    if (!workspace.activeId || saving || scheduleDraft.saving) return;
    if (invalidPlanningShift(scheduleDraft.shifts)) {
      toasts.show(t('Every planned shift needs a valid start and end time.'), 'danger');
      return;
    }
    saving = true;
    scheduleDraft.saving = true;
    try {
      await saveSchedule({
        restaurantId: workspace.activeId,
        weekStart,
        status: 'draft',
        shifts: scheduleDraft.shifts,
        notes: scheduleDraft.notes,
        expectedRevision: revision,
        wasPublished: published
      });
      scheduleDraft.settle();
      toasts.show(t(published ? 'Schedule reverted to draft.' : 'Schedule saved.'), 'success');
    } catch (error) {
      toasts.show(friendlyError(error), 'danger');
    } finally {
      saving = false;
      scheduleDraft.saving = false;
    }
  }
</script>

<svelte:head><title>{t('Schedule')} &middot; restogogo</title></svelte:head>

{#snippet pageActions()}
  <label class="cl-search">
    <span class="sr-only">{t('Search employees')}</span>
    <input class="cl-field" type="search" placeholder={t('Search employees…')} bind:value={search} />
  </label>
  <label class="toolbar-select">
    <span class="sr-only">{t('Position')}</span>
    <select class="cl-field" bind:value={positionId}>
      <option value="">{t('All positions')}</option>
      {#each snapshot?.job_functions.filter((item) => item.active).toSorted((left, right) => left.name.localeCompare(right.name)) ?? [] as position (position.id)}
        <option value={position.id}>{position.name}</option>
      {/each}
    </select>
  </label>
  <label class="toggle toolbar-toggle">
    <input type="checkbox" bind:checked={onlyConflicts} />
    <span class="cl-action-label">{t('Only conflicts')}</span>
  </label>
{/snippet}

<ClassicPage actions={pageActions}>
  <ClassicScheduleWeek>
    {#snippet actions(week)}
      <button class="cl-btn" type="button" disabled={saving || !week.editable} onclick={() => copyPreviousWeek(week.weekStart)}>{t('Copy previous week')}</button>
      <button class="cl-btn" type="button" disabled={!snapshot} onclick={() => exportWeek(week.weekStart)}>{t('Export CSV')}</button>
      <button
        class="cl-btn"
        type="button"
        disabled={saving || !scheduleDraft.dirty}
        onclick={() => snapshot && scheduleDraft.reset(snapshot, week.weekStart)}
      >{t('Discard')}</button>
      <button
        class="cl-btn is-primary"
        type="button"
        disabled={saving || !week.editable}
        onclick={() => persist(week.weekStart, week.revision, week.published)}
      >{t(saving ? 'Saving…' : 'Save draft')}</button>
    {/snippet}

    {#snippet children(week)}
      {@const grid = snapshot
        ? buildPlanningWeek({
            snapshot,
            weekStart: week.weekStart,
            today: week.today,
            draft: scheduleDraft.shifts
          })
        : null}
      {@const selectedSlot = grid?.slotsByKey.get(selectedKey) ?? null}

      {#if grid}
        {@const dayTotals = grid.days.map((day) =>
          scheduleDraft.shifts
            .filter((shift) => shift.weekday === day.weekday)
            .reduce((sum, shift) => sum + hoursBetweenClocks(shift.startsAt, shift.endsAt), 0)
        )}
        {@const rows = visibleRows(grid)}
        <div class="cl-tablewrap">
          <table class="cl-table board">
            <thead>
              <tr>
                <th class="board__staff">{t('Employee')}</th>
                {#each grid.days as day (day.date)}
                  <th class="board__day" class:is-today={day.today}>
                    <span class="board__dow">{t(day.label)}</span>
                    <span class="board__num">{Number(day.date.slice(-2))}</span>
                  </th>
                {/each}
              </tr>
              <tr class="board__summary">
                <th>{t('Planned')}</th>
                {#each grid.days as day, index (day.date)}
                  <th class:is-empty={!dayTotals[index]}>{dayTotals[index] ? formatHours(dayTotals[index]) : '—'}</th>
                {/each}
              </tr>
            </thead>
            <tbody>
              {#if !rows.length}
                <tr><td colspan={grid.days.length + 1}><div class="cl-empty"><strong>{t('No employees match these filters')}</strong><span>{t('Clear a filter to show the full planning team.')}</span></div></td></tr>
              {:else}
              {#each rows as row (row.id)}
                {@const target = contractHours.get(row.id) ?? 0}
                <tr>
                  <td class="board__staff">
                    <span class="staff">
                      <span class="cl-avatar" style="--avatar-color:{employeeColor.get(row.id) ?? 'var(--cl-muted)'}">{personInitials(row.name)}</span>
                      <span class="staff__id">
                        <strong>{row.name}</strong>
                        <span class="staff__hours">
                          <b>{row.total}</b>{#if target}<span class="staff__target"> / {formatHours(target)}</span>{/if}
                        </span>
                      </span>
                    </span>
                  </td>
                  {#each row.cells as cell (cell.date)}
                    {@const shifts = dayShifts(grid, row.id, cell.date)}
                    {@const free = freeServices(grid, row.id, cell.date)}
                    {@const past = cell.date < week.today}
                    <td class="board__cell" class:is-past={past}>
                      {#each shifts as chip (chip.key)}
                        <button
                          class="chip is-{chip.service}"
                          class:is-conflict={chip.conflict}
                          type="button"
                          onclick={() => (selectedKey = chip.key)}
                        >
                          <span class="chip__time">{chip.label}</span>
                          <span class="chip__hours">{chip.hours}</span>
                        </button>
                      {/each}
                      {#if week.editable && !past && free.length}
                        {#if pendingAdd === `${row.id}|${cell.date}`}
                          <span class="addpick">
                            {#each free as service (service)}
                              <button class="addpick__opt is-{service}" type="button" onclick={() => addAt(row.id, cell.date, service)}>
                                {service === 'evening' ? '☾' : '☀'} {t(service === 'evening' ? 'Evening' : 'Lunch')}
                              </button>
                            {/each}
                          </span>
                        {:else}
                          <button class="addcell" type="button" aria-label={t('Add shift')} onclick={() => onAddClick(grid, row.id, cell.date)}>＋</button>
                        {/if}
                      {/if}
                    </td>
                  {/each}
                </tr>
              {/each}
              {/if}
            </tbody>
          </table>
        </div>

        <div class="legend">
          <span class="legend__item"><span class="legend__swatch is-lunch"></span>{t('Lunch')}</span>
          <span class="legend__item"><span class="legend__swatch is-evening"></span>{t('Evening')}</span>
          <span class="legend__item"><span class="legend__swatch is-conflict"></span>{t('Conflict')}</span>
        </div>
      {/if}

      <Dialog
        open={Boolean(selectedSlot)}
        title={selectedSlot ? selectedSlot.employeeName : t('Schedule')}
        description={selectedSlot
          ? `${new Intl.DateTimeFormat(i18n.intlLocale, { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' }).format(new Date(`${selectedSlot.date}T00:00:00Z`))} · ${t(selectedSlot.serviceKey === 'evening' ? 'Evening' : 'Lunch')}`
          : ''}
        onclose={() => (selectedKey = '')}
      >
        {#if selectedSlot && snapshot && workspace.activeId}
          <ScheduleSlotEditor
            {snapshot}
            slot={selectedSlot}
            draft={scheduleDraft.shifts}
            notes={scheduleDraft.notes}
            editable={week.editable}
            onchange={(next) => scheduleDraft.replace(next)}
            onnotes={(next) => scheduleDraft.replaceNotes(next)}
            oncancelleave={async () => {
              const absence = leaveForSlot(selectedSlot, snapshot.absences, ['pending', 'approved']);
              if (!absence || !workspace.activeId) {
                toasts.show(t('The leave request could not be found. Refresh and try again.'), 'danger');
                return false;
              }
              try {
                await resolveScheduleLeave({
                  restaurantId: workspace.activeId,
                  slot: selectedSlot,
                  absenceId: absence.id,
                  action: 'cancel_for_planning'
                });
                return true;
              } catch (error) {
                toasts.show(friendlyError(error), 'danger');
                return false;
              }
            }}
            onresolveleave={async (action) => {
              const absence = leaveForSlot(selectedSlot, snapshot.absences, ['pending']);
              if (!absence || !workspace.activeId) {
                toasts.show(t('The leave request could not be found. Refresh and try again.'), 'danger');
                return false;
              }
              try {
                await resolveScheduleLeave({
                  restaurantId: workspace.activeId,
                  slot: selectedSlot,
                  absenceId: absence.id,
                  action
                });
                toasts.show(action === 'approve' ? t('Leave approved.') : t('Leave rejected.'), 'success');
                return true;
              } catch (error) {
                toasts.show(friendlyError(error), 'danger');
                return false;
              }
            }}
            onresolveexception={async (action) => {
              const exception = exceptionForSlot(selectedSlot, snapshot.work_pattern_exceptions);
              if (!exception || !workspace.activeId) {
                toasts.show(t('The fixed-schedule change could not be found. Refresh and try again.'), 'danger');
                return false;
              }
              try {
                await resolveScheduleException({
                  restaurantId: workspace.activeId,
                  slot: selectedSlot,
                  exceptionId: exception.id,
                  action
                });
                return true;
              } catch (error) {
                toasts.show(friendlyError(error), 'danger');
                return false;
              }
            }}
          />
        {/if}
      </Dialog>
    {/snippet}
  </ClassicScheduleWeek>
</ClassicPage>

<style>
  .board {
    min-width: 940px;
    table-layout: fixed;
  }
  .board__staff {
    width: 210px;
    position: sticky;
    left: 0;
    z-index: 1;
    background: var(--cl-surface);
  }
  th.board__staff {
    background: var(--cl-surface-muted);
  }
  .staff {
    display: flex;
    align-items: center;
    gap: 10px;
  }
  .staff__id {
    display: grid;
    gap: 1px;
    min-width: 0;
  }
  .staff__id strong {
    font-weight: var(--rst-fw-medium);
  }
  .staff__hours {
    font-size: 12px;
    color: var(--cl-muted);
    font-variant-numeric: tabular-nums;
  }
  .staff__hours b {
    color: var(--cl-ink);
    font-weight: var(--rst-fw-bold);
  }
  .board__day {
    text-align: center;
    border-left: 1px solid var(--cl-line);
  }
  .board__dow { font-weight: var(--rst-fw-bold); }
  .board__num {
    margin-left: 5px;
    color: var(--cl-muted);
    font-variant-numeric: tabular-nums;
  }
  .board__day.is-today {
    color: var(--cl-accent);
  }
  /* A quiet per-day planned-hours strip — the only "coverage" summary the board
     needs, right where the day is. */
  .board__summary th {
    padding-top: 5px;
    padding-bottom: 8px;
    border-left: 1px solid var(--cl-line);
    color: var(--cl-muted);
    font-size: 12px;
    font-weight: var(--rst-fw-bold);
    text-align: center;
    font-variant-numeric: tabular-nums;
  }
  .board__summary th:first-child {
    border-left: 0;
    text-align: left;
    text-transform: uppercase;
    letter-spacing: 0.02em;
  }
  .board__summary th.is-empty {
    color: var(--cl-line-strong);
  }
  .board__cell {
    position: relative;
    padding: 6px;
    border-left: 1px solid var(--cl-line);
    vertical-align: top;
  }
  .board__cell.is-past {
    background: color-mix(in srgb, var(--cl-surface-muted) 60%, transparent);
  }
  /* One chip per real shift, service-coloured, placed top (lunch) to bottom
     (evening) — no empty placeholder card when a service is unplanned. */
  .chip {
    width: 100%;
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 6px;
    margin-bottom: 4px;
    padding: 6px 9px;
    border: 1px solid transparent;
    border-radius: var(--cl-radius);
    font: inherit;
    font-variant-numeric: tabular-nums;
    text-align: left;
    cursor: pointer;
    transition: border-color var(--cl-dur) var(--cl-ease);
  }
  .chip__time { font-size: 13px; font-weight: var(--rst-fw-bold); }
  .chip__hours { font-size: 12px; opacity: 0.75; }
  .chip.is-lunch {
    color: color-mix(in srgb, var(--cl-lunch) 82%, var(--cl-ink));
    background: var(--cl-lunch-wash);
    border-color: color-mix(in srgb, var(--cl-lunch) 24%, var(--cl-line));
  }
  .chip.is-evening {
    color: color-mix(in srgb, var(--cl-evening) 80%, var(--cl-ink));
    background: var(--cl-evening-wash);
    border-color: color-mix(in srgb, var(--cl-evening) 24%, var(--cl-line));
  }
  .chip.is-conflict {
    color: var(--cl-problem);
    background: var(--cl-problem-wash);
    border-color: var(--cl-problem-line);
  }
  .chip:hover { border-color: currentColor; }
  /* An empty future cell stays clean; the dashed add target only appears when
     you hover the cell, so the board is not a field of dashed boxes. */
  .addcell {
    width: 100%;
    min-height: 34px;
    border: 1px dashed transparent;
    border-radius: var(--cl-radius);
    color: transparent;
    background: transparent;
    font-size: 16px;
    font-weight: var(--rst-fw-bold);
    cursor: pointer;
    transition: color var(--cl-dur) var(--cl-ease), border-color var(--cl-dur) var(--cl-ease);
  }
  .board__cell:hover .addcell {
    color: var(--cl-accent);
    border-color: color-mix(in srgb, var(--cl-accent) 45%, var(--cl-line));
  }
  .addpick {
    display: grid;
    gap: 4px;
  }
  .addpick__opt {
    padding: 6px 8px;
    border: 1px solid var(--cl-line-strong);
    border-radius: var(--cl-radius);
    background: var(--cl-surface);
    font: inherit;
    font-size: 12px;
    font-weight: var(--rst-fw-bold);
    cursor: pointer;
  }
  .addpick__opt.is-lunch { color: color-mix(in srgb, var(--cl-lunch) 80%, var(--cl-ink)); }
  .addpick__opt.is-evening { color: color-mix(in srgb, var(--cl-evening) 78%, var(--cl-ink)); }
  .addpick__opt:hover { border-color: var(--cl-accent); }

  .legend {
    display: flex;
    flex-wrap: wrap;
    gap: 16px;
    padding: 0 2px;
    color: var(--cl-muted);
    font-size: 13px;
  }
  .legend__item { display: inline-flex; align-items: center; gap: 7px; }
  .legend__swatch {
    width: 14px;
    height: 14px;
    border-radius: 4px;
    border: 1px solid var(--cl-line);
  }
  .legend__swatch.is-lunch { background: var(--cl-lunch-wash); border-color: color-mix(in srgb, var(--cl-lunch) 26%, var(--cl-line)); }
  .legend__swatch.is-evening { background: var(--cl-evening-wash); border-color: color-mix(in srgb, var(--cl-evening) 26%, var(--cl-line)); }
  .legend__swatch.is-conflict { background: var(--cl-problem-wash); border-color: var(--cl-problem-line); }

  .cl-search { min-width: min(260px, 100%); }
  .cl-search .cl-field { width: 100%; }
  .toolbar-select { min-width: 170px; }
  .toolbar-select .cl-field { width: 100%; }
  .toolbar-toggle { white-space: nowrap; }
  .sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
    border: 0;
  }

</style>
