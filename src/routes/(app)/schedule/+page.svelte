<script lang="ts">
  import { onMount } from 'svelte';
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
    planningNotesForWeek
  } from '$lib/schedule/schedule-model';
  import { buildAreaColorMap, buildEmployeeColorMap } from '$lib/ui/position-color';
  import { personInitials } from '$lib/ui/person';
  import ClassicPage from '$lib/classic/ClassicPage.svelte';
  import ClassicScheduleWeek from '$lib/classic/ClassicScheduleWeek.svelte';
  import ClassicTablePanel from '$lib/classic/ClassicTablePanel.svelte';
  import ClassicPeriodNav from '$lib/classic/ClassicPeriodNav.svelte';
  import ClassicColMenu from '$lib/classic/ClassicColMenu.svelte';
  import { scheduleDraft } from '$lib/classic/classic-schedule.svelte';
  import { downloadCsv } from '$lib/export/csv';
  import { planningCsv } from '$lib/schedule/schedule-export';
  import { DEFAULT_PLANNING_EXPORT_COLUMNS } from '$lib/schedule/schedule-export-columns';

  type Density = 'compact' | 'detailed';
  const SERVICES: ServiceKey[] = ['lunch', 'evening'];

  const snapshot = $derived(workspace.operations);
  const employeeColor = $derived(
    snapshot
      ? buildEmployeeColorMap(snapshot.job_functions, snapshot.employee_job_functions)
      : new Map<string, string>()
  );
  const areaColor = $derived(
    snapshot ? buildAreaColorMap(snapshot.work_areas) : new Map<string, string>()
  );
  const areaName = $derived(
    new Map((snapshot?.work_areas ?? []).map((area) => [area.id, area.name]))
  );
  const positionName = $derived(
    new Map((snapshot?.job_functions ?? []).map((position) => [position.id, position.name]))
  );
  const positionCost = $derived(
    new Map((snapshot?.job_functions ?? []).map((position) => [position.id, Number(position.estimated_hourly_cost) || 0]))
  );
  const employeeCost = $derived(
    new Map((snapshot?.employee_payroll_profiles ?? []).map((profile) => [profile.employee_id, Number(profile.estimated_hourly_cost) || 0]))
  );
  const employeeActive = $derived(
    new Map((snapshot?.employees ?? []).map((employee) => [employee.id, employee.active]))
  );
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
  let pendingAdd = $state('');
  let density = $state<Density>('compact');
  let draggingKey = $state('');
  let dropKey = $state('');

  onMount(() => {
    try {
      density = localStorage.getItem('rst-schedule-density') === 'detailed' ? 'detailed' : 'compact';
    } catch {
      density = 'compact';
    }
  });

  function setDensity(next: Density) {
    density = next;
    try {
      localStorage.setItem('rst-schedule-density', next);
    } catch {
      // Session-only preference on devices without storage.
    }
  }

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
      if (needle && !`${row.name} ${row.meta}`.toLocaleLowerCase(i18n.intlLocale).includes(needle)) return false;
      if (positionId && employeePosition.get(row.id) !== positionId) return false;
      if (
        onlyConflicts &&
        ![...grid.slotsByKey.values()].some(
          (slot) => slot.employeeId === row.id && slot.truth.state === 'conflict'
        )
      ) return false;
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

  function money(value: number): string {
    const currency = snapshot?.restaurant_settings.currency_code || 'EUR';
    return new Intl.NumberFormat(i18n.intlLocale, {
      style: 'currency',
      currency,
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(value);
  }

  function slotKey(employeeId: string, date: string, service: ServiceKey): string {
    return `${employeeId}|${date}|${service}`;
  }

  function dayShifts(
    grid: ReturnType<typeof buildPlanningWeek>,
    employeeId: string,
    date: string
  ) {
    return SERVICES.flatMap((service) => {
      const slot = grid.slotsByKey.get(slotKey(employeeId, date, service));
      if (!slot?.shift) return [];
      const hours = hoursBetweenClocks(slot.shift.startsAt, slot.shift.endsAt);
      const hourlyCost = employeeCost.get(employeeId) || positionCost.get(slot.shift.jobFunctionId) || 0;
      return [{
        key: slot.key,
        service,
        label: `${compact(slot.shift.startsAt)}–${compact(slot.shift.endsAt)}`,
        hours: formatHours(hours),
        area: areaName.get(slot.shift.areaId) ?? t('No area'),
        position: positionName.get(slot.shift.jobFunctionId) ?? t('Not assigned'),
        color: areaColor.get(slot.shift.areaId) ?? 'var(--cl-muted)',
        conflict: slot.truth.state === 'conflict',
        source: slot.shift.source,
        estimatedCost: hourlyCost > 0 ? money(hours * hourlyCost) : ''
      }];
    });
  }

  function freeServices(
    grid: ReturnType<typeof buildPlanningWeek>,
    employeeId: string,
    date: string
  ): ServiceKey[] {
    return SERVICES.filter((service) => !grid.slotsByKey.get(slotKey(employeeId, date, service))?.shift);
  }

  function dayState(grid: ReturnType<typeof buildPlanningWeek>, employeeId: string, date: string) {
    const slots = SERVICES.map((service) => grid.slotsByKey.get(slotKey(employeeId, date, service))).filter(Boolean);
    if (slots.some((slot) => slot?.context.absence === 'approved')) return { label: 'Absence', tone: 'leave' };
    if (slots.some((slot) => slot?.context.absence === 'pending')) return { label: 'Pending absence', tone: 'pending' };
    if (slots.some((slot) => slot?.context.workPatternException === 'approved')) return { label: 'Schedule exception', tone: 'leave' };
    if (slots.length && slots.every((slot) => slot?.context.availability === 'unavailable')) return { label: 'Unavailable', tone: 'unavailable' };
    return null;
  }

  function employeeHours(employeeId: string): number {
    return scheduleDraft.shifts
      .filter((shift) => shift.employeeId === employeeId)
      .reduce((total, shift) => total + hoursBetweenClocks(shift.startsAt, shift.endsAt), 0);
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

  function beginDrag(key: string) {
    draggingKey = key;
  }

  function canDrop(grid: ReturnType<typeof buildPlanningWeek>, employeeId: string, date: string, today: string): boolean {
    if (!draggingKey || date < today || employeeActive.get(employeeId) === false) return false;
    const source = grid.slotsByKey.get(draggingKey);
    if (!source?.shift) return false;
    const target = grid.slotsByKey.get(slotKey(employeeId, date, source.serviceKey));
    return Boolean(target && !target.shift && target.key !== source.key);
  }

  function dropShift(grid: ReturnType<typeof buildPlanningWeek>, employeeId: string, date: string, today: string) {
    if (!canDrop(grid, employeeId, date, today)) return;
    const source = grid.slotsByKey.get(draggingKey);
    const target = source ? grid.slotsByKey.get(slotKey(employeeId, date, source.serviceKey)) : null;
    if (!source?.shift || !target) return;
    scheduleDraft.replace(
      scheduleDraft.shifts.map((shift) =>
        shift === source.shift
          ? { ...shift, employeeId, weekday: target.weekday }
          : shift
      )
    );
    draggingKey = '';
    dropKey = '';
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

<ClassicPage>
  <ClassicScheduleWeek showHeader={false}>
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
        {@const rows = visibleRows(grid)}
        <ClassicTablePanel
          dirty={scheduleDraft.dirty}
          saving={saving || scheduleDraft.saving}
          canSave={week.editable}
          onsave={() => void persist(week.weekStart, week.revision, week.published)}
          ondiscard={() => snapshot && scheduleDraft.reset(snapshot, week.weekStart)}
        >
          {#snippet meta()}
            <ClassicPeriodNav
              label={week.label}
              onprevious={week.previous}
              onnext={week.next}
              ontoday={week.todayAction}
              todayLabel="This week"
            />
            <span class="week-status" class:is-published={week.published}><i></i>{t(week.published ? 'Published' : 'Draft')}</span>
          {/snippet}
          {#snippet actions()}
            <div class="density" role="group" aria-label={t('Schedule detail')}>
              <button type="button" class:is-active={density === 'compact'} onclick={() => setDensity('compact')}>{t('Compact')}</button>
              <button type="button" class:is-active={density === 'detailed'} onclick={() => setDensity('detailed')}>{t('Detailed')}</button>
            </div>
            <a class="cl-btn" href="/schedule/publish">{t('Review & publish')}</a>
            <details class="more-menu">
              <summary class="cl-btn is-icon" aria-label={t('More actions')} title={t('More actions')}>•••</summary>
              <div class="more-menu__body">
                <button type="button" disabled={saving || !week.editable} onclick={() => copyPreviousWeek(week.weekStart)}>{t('Copy previous week')}</button>
                <button type="button" disabled={!snapshot} onclick={() => exportWeek(week.weekStart)}>{t('Export CSV')}</button>
              </div>
            </details>
          {/snippet}
          {#snippet children()}
            <div class="cl-tablewrap schedule-wrap" class:is-detailed={density === 'detailed'}>
              <table class="cl-table board">
                <thead>
                  <tr>
                    <th class="board__staff has-menu">
                      <div class="employee-head">
                        <ClassicColMenu label={t('Employee')} filterKind="text" searchValue={search} onsearch={(value) => (search = value)} />
                        <details class="filter-menu">
                          <summary aria-label={t('More filters')} title={t('More filters')} class:is-active={Boolean(positionId || onlyConflicts)}>
                            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M4 6h16M7 12h10M10 18h4" /></svg>
                          </summary>
                          <div class="filter-menu__body">
                            <label><span>{t('Position')}</span><select class="cl-field" bind:value={positionId}><option value="">{t('All positions')}</option>{#each snapshot?.job_functions.filter((item) => item.active).toSorted((a, b) => a.name.localeCompare(b.name)) ?? [] as item (item.id)}<option value={item.id}>{item.name}</option>{/each}</select></label>
                            <label class="check"><input type="checkbox" bind:checked={onlyConflicts} />{t('Only conflicts')}</label>
                            {#if positionId || onlyConflicts}<button type="button" onclick={() => { positionId = ''; onlyConflicts = false; }}>{t('Clear filters')}</button>{/if}
                          </div>
                        </details>
                      </div>
                    </th>
                    {#each grid.days as day (day.date)}
                      {@const total = scheduleDraft.shifts.filter((shift) => shift.weekday === day.weekday).reduce((sum, shift) => sum + hoursBetweenClocks(shift.startsAt, shift.endsAt), 0)}
                      {@const count = scheduleDraft.shifts.filter((shift) => shift.weekday === day.weekday).length}
                      <th class="board__day" class:is-today={day.today}>
                        <span><b>{t(day.label)}</b> {Number(day.date.slice(-2))}</span>
                        <small>{total ? `${formatHours(total)} · ${count} ${t(count === 1 ? 'shift' : 'shifts')}` : t('No shifts')}</small>
                      </th>
                    {/each}
                  </tr>
                </thead>
                <tbody>
                  {#if !rows.length}
                    <tr><td colspan={grid.days.length + 1}><div class="cl-empty"><strong>{t('No employees match these filters')}</strong><span>{t('Clear a filter to show the full planning team.')}</span></div></td></tr>
                  {:else}
                    {#each rows as row (row.id)}
                      {@const target = contractHours.get(row.id) ?? 0}
                      {@const planned = employeeHours(row.id)}
                      {@const progress = target ? Math.min(100, Math.round((planned / target) * 100)) : 0}
                      {@const active = employeeActive.get(row.id) !== false}
                      <tr class:is-archived={!active}>
                        <td class="board__staff">
                          <span class="staff">
                            <span class="cl-avatar" style="--avatar-color:{employeeColor.get(row.id) ?? 'var(--cl-muted)'}">{personInitials(row.name)}</span>
                            <span class="staff__id">
                              <span class="staff__name"><strong>{row.name}</strong>{#if !active}<em>{t('Archived')}</em>{/if}</span>
                              <span class="staff__hours"><b>{formatHours(planned)}</b>{#if target}<span> / {formatHours(target)}</span>{/if}</span>
                              {#if target}<span class="staff__meter"><i style={`width:${progress}%`}></i></span>{/if}
                            </span>
                          </span>
                        </td>
                        {#each row.cells as cell (cell.date)}
                          {@const shifts = dayShifts(grid, row.id, cell.date)}
                          {@const free = freeServices(grid, row.id, cell.date)}
                          {@const past = cell.date < week.today}
                          {@const state = shifts.length ? null : dayState(grid, row.id, cell.date)}
                          {@const cellKey = `${row.id}|${cell.date}`}
                          <td
                            class="board__cell"
                            class:is-past={past}
                            class:is-drop-target={dropKey === cellKey}
                            ondragover={(event) => { if (canDrop(grid, row.id, cell.date, week.today)) { event.preventDefault(); dropKey = cellKey; } }}
                            ondragleave={() => { if (dropKey === cellKey) dropKey = ''; }}
                            ondrop={(event) => { event.preventDefault(); dropShift(grid, row.id, cell.date, week.today); }}
                          >
                            {#each shifts as chip (chip.key)}
                              <button
                                class="shift-card"
                                class:is-conflict={chip.conflict}
                                class:is-detailed={density === 'detailed'}
                                style={`--shift-color:${chip.color}`}
                                type="button"
                                draggable={week.editable && !past && active}
                                ondragstart={() => beginDrag(chip.key)}
                                ondragend={() => { draggingKey = ''; dropKey = ''; }}
                                onclick={() => (selectedKey = chip.key)}
                              >
                                <span class="shift-card__top"><strong>{chip.label}</strong><span>{chip.hours}</span></span>
                                {#if density === 'detailed'}
                                  <span class="shift-card__tags"><em>{chip.area}</em><em>{chip.position}</em></span>
                                  <span class="shift-card__bottom"><span>{t(chip.service === 'evening' ? 'Evening' : 'Lunch')}</span>{#if chip.estimatedCost}<span title={t('Estimated cost')}>~{chip.estimatedCost}</span>{/if}</span>
                                {:else}
                                  <span class="shift-card__area">{chip.area}</span>
                                {/if}
                                {#if chip.conflict}<span class="shift-card__warning" aria-label={t('Conflict')} title={t('Conflict')}>!</span>{/if}
                              </button>
                            {/each}
                            {#if state}<span class="day-state is-{state.tone}">{t(state.label)}</span>{/if}
                            {#if week.editable && !past && active && free.length}
                              {#if pendingAdd === cellKey}
                                <span class="addpick">
                                  {#each free as service (service)}
                                    <button class="addpick__opt" type="button" onclick={() => addAt(row.id, cell.date, service)}>{service === 'evening' ? '☾' : '☀'} {t(service === 'evening' ? 'Evening' : 'Lunch')}</button>
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
              <span><i class="is-area"></i>{t('Area colour')}</span>
              <span><i class="is-conflict"></i>{t('Conflict')}</span>
              <span><i class="is-absence"></i>{t('Absence or unavailable')}</span>
              <span class="legend__hint">{t('Drag a shift to another free employee/day cell. Click it for all details.')}</span>
            </div>
          {/snippet}
        </ClassicTablePanel>
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
                await resolveScheduleLeave({ restaurantId: workspace.activeId, slot: selectedSlot, absenceId: absence.id, action: 'cancel_for_planning' });
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
                await resolveScheduleLeave({ restaurantId: workspace.activeId, slot: selectedSlot, absenceId: absence.id, action });
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
                await resolveScheduleException({ restaurantId: workspace.activeId, slot: selectedSlot, exceptionId: exception.id, action });
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
  .week-status { display: inline-flex; align-items: center; gap: 7px; min-height: 30px; padding: 4px 10px; border: 1px solid var(--cl-line); border-radius: 999px; color: var(--cl-muted); font-size: 12px; font-weight: var(--rst-fw-bold); }
  .week-status i { width: 7px; height: 7px; border-radius: 50%; background: var(--cl-line-strong); }
  .week-status.is-published { color: var(--cl-ok); border-color: var(--cl-ok-line); background: var(--cl-ok-wash); }
  .week-status.is-published i { background: var(--cl-ok); }
  .density { display: inline-flex; padding: 2px; border: 1px solid var(--cl-line); border-radius: var(--cl-radius); background: var(--cl-surface-muted); }
  .density button { min-height: 30px; padding: 4px 10px; border: 0; border-radius: 4px; background: transparent; color: var(--cl-muted); font: inherit; font-size: 12px; font-weight: var(--rst-fw-medium); cursor: pointer; }
  .density button.is-active { background: var(--cl-surface); color: var(--cl-ink); box-shadow: 0 1px 2px rgb(0 0 0 / .06); }
  .more-menu, .filter-menu { position: relative; }
  .more-menu > summary, .filter-menu > summary { list-style: none; cursor: pointer; }
  .more-menu > summary::-webkit-details-marker, .filter-menu > summary::-webkit-details-marker { display: none; }
  .more-menu__body, .filter-menu__body { position: absolute; z-index: 150; top: calc(100% + 5px); right: 0; display: grid; gap: 5px; min-width: 220px; padding: 8px; border: 1px solid var(--cl-line-strong); border-radius: var(--cl-radius); background: var(--cl-surface); box-shadow: 0 10px 28px rgb(0 0 0 / .14); }
  .more-menu__body button, .filter-menu__body > button { min-height: 34px; padding: 6px 9px; border: 0; border-radius: 4px; background: transparent; color: var(--cl-ink); font: inherit; font-size: 13px; text-align: left; cursor: pointer; }
  .more-menu__body button:hover, .filter-menu__body > button:hover { background: var(--cl-surface-muted); }
  .more-menu__body button:disabled { opacity: .45; cursor: default; }

  .schedule-wrap { max-height: calc(100vh - 210px); overflow: auto; border: 1px solid var(--cl-line); border-radius: var(--cl-radius); }
  .board { min-width: 1120px; table-layout: fixed; border: 0; }
  .board thead { position: sticky; top: 0; z-index: 5; }
  .board th { background: var(--cl-thead); }
  .board__staff { width: 230px; position: sticky; left: 0; z-index: 3; background: var(--cl-surface) !important; }
  thead .board__staff { z-index: 7; background: var(--cl-thead) !important; }
  .employee-head { display: flex; align-items: center; justify-content: space-between; gap: 4px; }
  .filter-menu > summary { display: grid; place-items: center; width: 28px; height: 28px; border-radius: 4px; color: var(--cl-muted); }
  .filter-menu > summary:hover, .filter-menu > summary.is-active { color: var(--cl-accent); background: var(--cl-accent-wash); }
  .filter-menu__body { left: 0; right: auto; min-width: 260px; }
  .filter-menu__body label { display: grid; gap: 5px; color: var(--cl-muted); font-size: 12px; font-weight: var(--rst-fw-medium); }
  .filter-menu__body label.check { display: flex; align-items: center; gap: 8px; padding: 7px 3px; color: var(--cl-ink); }
  .filter-menu__body input[type='checkbox'] { width: 15px; height: 15px; accent-color: var(--cl-accent); }
  .board__day { text-align: center; border-left: 1px solid var(--cl-grid-line); }
  .board__day > span { display: block; font-size: 13px; }
  .board__day > span b { font-weight: var(--rst-fw-bold); }
  .board__day small { display: block; margin-top: 3px; color: var(--cl-muted); font-size: 10px; font-weight: var(--rst-fw-medium); text-transform: none; letter-spacing: 0; }
  .board__day.is-today { color: var(--cl-accent); background: var(--cl-accent-wash); }
  .board__cell { position: relative; min-height: 82px; padding: 6px; border-left: 1px solid var(--cl-grid-line); vertical-align: top; background: var(--cl-surface); transition: background-color var(--cl-dur) var(--cl-ease); }
  .is-detailed .board__cell { min-height: 126px; }
  .board__cell.is-past { background: color-mix(in srgb, var(--cl-surface-muted) 70%, var(--cl-surface)); }
  .board__cell.is-drop-target { background: color-mix(in srgb, var(--cl-ok) 9%, var(--cl-surface)); box-shadow: inset 0 0 0 2px color-mix(in srgb, var(--cl-ok) 60%, transparent); }
  tr.is-archived { opacity: .72; }

  .staff { display: flex; align-items: center; gap: 10px; }
  .staff__id { display: grid; gap: 3px; min-width: 0; flex: 1; }
  .staff__name { display: flex; align-items: center; gap: 7px; min-width: 0; }
  .staff__name strong { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 13px; font-weight: var(--rst-fw-bold); }
  .staff__name em { padding: 2px 5px; border: 1px solid var(--cl-line); border-radius: 999px; color: var(--cl-muted); font-size: 9px; font-style: normal; text-transform: uppercase; }
  .staff__hours { color: var(--cl-muted); font-size: 11px; font-variant-numeric: tabular-nums; }
  .staff__hours b { color: var(--cl-ink); }
  .staff__meter { width: 100%; height: 4px; overflow: hidden; border-radius: 999px; background: var(--cl-line); }
  .staff__meter i { display: block; height: 100%; border-radius: inherit; background: var(--cl-accent); }

  .shift-card { --shift-color: var(--cl-muted); position: relative; width: 100%; display: grid; gap: 4px; margin-bottom: 5px; padding: 8px 9px; border: 1px solid color-mix(in srgb, var(--shift-color) 28%, var(--cl-line)); border-left: 3px solid var(--shift-color); border-radius: 4px; background: color-mix(in srgb, var(--shift-color) 8%, var(--cl-surface)); color: var(--cl-ink); font: inherit; text-align: left; cursor: pointer; transition: border-color var(--cl-dur) var(--cl-ease), transform var(--cl-dur) var(--cl-ease), box-shadow var(--cl-dur) var(--cl-ease); }
  .shift-card:hover { border-color: color-mix(in srgb, var(--shift-color) 58%, var(--cl-line)); box-shadow: 0 2px 6px rgb(0 0 0 / .06); transform: translateY(-1px); }
  .shift-card[draggable='true'] { cursor: grab; }
  .shift-card__top, .shift-card__bottom { display: flex; align-items: baseline; justify-content: space-between; gap: 8px; }
  .shift-card__top strong { font-size: 12px; font-weight: var(--rst-fw-bold); font-variant-numeric: tabular-nums; }
  .shift-card__top > span, .shift-card__bottom { color: var(--cl-muted); font-size: 10px; }
  .shift-card__area { overflow: hidden; color: color-mix(in srgb, var(--shift-color) 80%, var(--cl-ink)); font-size: 10px; font-weight: var(--rst-fw-medium); text-overflow: ellipsis; white-space: nowrap; }
  .shift-card__tags { display: flex; flex-wrap: wrap; gap: 4px; }
  .shift-card__tags em { padding: 2px 5px; border: 1px solid color-mix(in srgb, var(--shift-color) 20%, var(--cl-line)); border-radius: 3px; background: color-mix(in srgb, var(--shift-color) 5%, var(--cl-surface)); color: color-mix(in srgb, var(--shift-color) 78%, var(--cl-ink)); font-size: 9px; font-style: normal; }
  .shift-card__warning { position: absolute; top: 5px; right: 5px; display: grid; place-items: center; width: 16px; height: 16px; border-radius: 50%; background: var(--cl-problem); color: white; font-size: 10px; font-weight: var(--rst-fw-bold); }
  .shift-card.is-conflict { border-color: var(--cl-problem-line); box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--cl-problem) 34%, transparent); }
  .shift-card.is-conflict .shift-card__top { padding-right: 16px; }

  .day-state { display: block; min-height: 42px; padding: 9px; border: 1px dashed var(--cl-line-strong); border-radius: 4px; color: var(--cl-muted); background: repeating-linear-gradient(-45deg, var(--cl-surface-muted), var(--cl-surface-muted) 7px, var(--cl-surface) 7px, var(--cl-surface) 14px); font-size: 10px; font-weight: var(--rst-fw-medium); }
  .day-state.is-pending { color: var(--cl-attention); border-color: var(--cl-attention-line); }
  .day-state.is-unavailable { opacity: .72; }

  .addcell { width: 100%; min-height: 28px; border: 1px dashed transparent; border-radius: 4px; color: transparent; background: transparent; font-size: 15px; font-weight: var(--rst-fw-bold); cursor: pointer; }
  .board__cell:hover .addcell { color: var(--cl-accent); border-color: color-mix(in srgb, var(--cl-accent) 35%, var(--cl-line)); }
  .addpick { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 4px; }
  .addpick__opt { min-height: 30px; padding: 5px; border: 1px solid var(--cl-line); border-radius: 4px; background: var(--cl-surface); color: var(--cl-ink); font: inherit; font-size: 10px; cursor: pointer; }
  .addpick__opt:hover { border-color: var(--cl-accent); }

  .legend { display: flex; flex-wrap: wrap; align-items: center; gap: 14px; padding: 10px 2px 0; color: var(--cl-muted); font-size: 11px; }
  .legend > span { display: inline-flex; align-items: center; gap: 6px; }
  .legend i { width: 12px; height: 12px; border: 1px solid var(--cl-line); border-radius: 3px; background: var(--cl-surface-muted); }
  .legend i.is-area { border-left: 3px solid var(--cl-info); background: var(--cl-info-wash); }
  .legend i.is-conflict { border-color: var(--cl-problem-line); box-shadow: inset 0 0 0 1px var(--cl-problem); }
  .legend i.is-absence { background: repeating-linear-gradient(-45deg, var(--cl-surface-muted), var(--cl-surface-muted) 3px, var(--cl-surface) 3px, var(--cl-surface) 6px); }
  .legend__hint { margin-left: auto; }

  @media (max-width: 760px) {
    .schedule-wrap { max-height: none; }
    .density button { padding-inline: 7px; }
    .legend__hint { width: 100%; margin-left: 0; }
  }
</style>
