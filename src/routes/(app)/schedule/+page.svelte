<script lang="ts">
  import { onMount } from 'svelte';
  import {
    addDays,
    clockLabel,
    clockMinutes,
    formatHours,
    hoursBetweenClocks,
    mondayFor,
    type ServiceKey
  } from '$lib/calendar/date';
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
    blocksPlanningAssignment,
    buildPlanningWeek,
    coverageIssues,
    defaultPlanningShift,
    planningConflicts,
    planningDraftForWeek,
    planningNotesForWeek,
    planningOverlapKeys,
    planningOverlaps,
    type PlanningGridSlot,
    type PlanningShiftDraft
  } from '$lib/schedule/schedule-model';
  import { buildAreaColorMap, buildEmployeeColorMap } from '$lib/ui/position-color';
  import { personInitials } from '$lib/ui/person';
  import ClassicPage from '$lib/classic/ClassicPage.svelte';
  import ClassicScheduleWeek from '$lib/classic/ClassicScheduleWeek.svelte';
  import ClassicPrimaryColMenu from '$lib/classic/ClassicPrimaryColMenu.svelte';
  import ClassicGroupRow from '$lib/classic/ClassicGroupRow.svelte';
  import { scheduleDraft } from '$lib/classic/classic-schedule.svelte';
  import { downloadCsv } from '$lib/export/csv';
  import { planningCsv } from '$lib/schedule/schedule-export';
  import { DEFAULT_PLANNING_EXPORT_COLUMNS } from '$lib/schedule/schedule-export-columns';

  type GroupMode = 'none' | 'contract' | 'position' | 'area';
  type PlanningGrid = ReturnType<typeof buildPlanningWeek>;
  type PlanningRow = PlanningGrid['rows'][number];
  type RowGroup = { key: string; label: string; rows: PlanningRow[]; hours: number };
  type DayShiftView = {
    key: string;
    service: ServiceKey;
    startsAt: string;
    endsAt: string;
    label: string;
    hours: string;
    hoursValue: number;
    area: string;
    position: string;
    showPosition: boolean;
    color: string;
    conflict: boolean;
    overlap: boolean;
    spansDay: boolean;
    estimatedCost: string;
    estimatedCostValue: number;
  };
  type DayCardView = {
    timeLabel: string;
    hours: string;
    breakLabel: string;
    hasBreak: boolean;
    estimatedCost: string;
    shifts: DayShiftView[];
  };

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
  const contractTypeName = $derived(
    new Map((snapshot?.contract_types ?? []).map((contract) => [contract.id, contract.name]))
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
  let publishing = $state(false);
  let showPublishConfirm = $state(false);
  let search = $state('');
  let positionId = $state('');
  let onlyConflicts = $state(false);
  let groupMode = $state<GroupMode>('none');
  let employeeSort = $state<'asc' | 'desc' | null>(null);
  let collapsedGroups = $state<string[]>([]);
  let draggingKey = $state('');
  let dropKey = $state('');
  let weekPicker = $state<HTMLInputElement | null>(null);

  onMount(() => {
    try {
      const storedGroup = localStorage.getItem('rst-schedule-group');
      groupMode =
        storedGroup === 'contract' || storedGroup === 'position' || storedGroup === 'area'
          ? storedGroup
          : 'none';
    } catch {
      groupMode = 'none';
    }
  });

  function setGroupMode(next: GroupMode): void {
    groupMode = next;
    collapsedGroups = [];
    try {
      localStorage.setItem('rst-schedule-group', next);
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

  const employeeContract = $derived.by(() => {
    const current = new Map<string, string>();
    for (const contract of snapshot?.employee_contracts ?? []) {
      if (!contract.active || !contract.is_current || !contract.contract_type_id) continue;
      current.set(contract.employee_id, contract.contract_type_id);
    }
    return current;
  });

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

  function draftKey(shift: Pick<PlanningShiftDraft, 'employeeId' | 'weekday' | 'serviceKey'>): string {
    return `${shift.employeeId}|${shift.weekday}|${shift.serviceKey}`;
  }

  function employeeHours(employeeId: string): number {
    return scheduleDraft.shifts
      .filter((shift) => shift.employeeId === employeeId)
      .reduce((total, shift) => total + hoursBetweenClocks(shift.startsAt, shift.endsAt), 0);
  }

  function hasEmployeeConflict(grid: PlanningGrid, employeeId: string): boolean {
    const overlapKeys = planningOverlapKeys(scheduleDraft.shifts);
    return [...grid.slotsByKey.values()].some(
      (slot) =>
        slot.employeeId === employeeId &&
        (slot.truth.state === 'conflict' || (slot.shift && overlapKeys.has(draftKey(slot.shift))))
    );
  }

  function visibleRows(grid: PlanningGrid): PlanningRow[] {
    const needle = search.trim().toLocaleLowerCase(i18n.intlLocale);
    const rows = grid.rows.filter((row) => {
      if (needle && !`${row.name} ${row.meta}`.toLocaleLowerCase(i18n.intlLocale).includes(needle)) {
        return false;
      }
      if (positionId && employeePosition.get(row.id) !== positionId) return false;
      if (onlyConflicts && !hasEmployeeConflict(grid, row.id)) return false;
      return true;
    });
    if (!employeeSort) return rows;
    const factor = employeeSort === 'desc' ? -1 : 1;
    return [...rows].sort((left, right) => factor * left.name.localeCompare(right.name, i18n.intlLocale));
  }

  function employeeAreaLabel(employeeId: string): string {
    const scheduledAreas = new Set(
      scheduleDraft.shifts
        .filter((shift) => shift.employeeId === employeeId && shift.areaId)
        .map((shift) => areaName.get(shift.areaId))
        .filter((value): value is string => Boolean(value))
    );
    if (scheduledAreas.size === 1) return [...scheduledAreas][0];
    if (scheduledAreas.size > 1) return t('Multiple areas');

    const primaryPosition = employeePosition.get(employeeId);
    const defaults = (snapshot?.coverage_requirements ?? [])
      .filter((requirement) => requirement.active && requirement.job_function_id === primaryPosition)
      .map((requirement) => areaName.get(requirement.area_id))
      .filter((value): value is string => Boolean(value));
    return defaults[0] ?? t('No area');
  }

  function groupLabel(row: PlanningRow): string {
    if (groupMode === 'contract') {
      return contractTypeName.get(employeeContract.get(row.id) ?? '') ?? t('No contract');
    }
    if (groupMode === 'position') {
      return positionName.get(employeePosition.get(row.id) ?? '') ?? t('No position');
    }
    if (groupMode === 'area') return employeeAreaLabel(row.id);
    return '';
  }

  function groupedRows(grid: PlanningGrid): RowGroup[] {
    const rows = visibleRows(grid);
    if (groupMode === 'none') {
      return [{
        key: 'all',
        label: '',
        rows,
        hours: rows.reduce((total, row) => total + employeeHours(row.id), 0)
      }];
    }
    const groups = new Map<string, PlanningRow[]>();
    for (const row of rows) {
      const label = groupLabel(row);
      groups.set(label, [...(groups.get(label) ?? []), row]);
    }
    return [...groups.entries()]
      .sort(([left], [right]) => left.localeCompare(right, i18n.intlLocale))
      .map(([label, groupRows]) => ({
        key: `${groupMode}:${label}`,
        label,
        rows: groupRows,
        hours: groupRows.reduce((total, row) => total + employeeHours(row.id), 0)
      }));
  }

  function toggleGroup(key: string): void {
    collapsedGroups = collapsedGroups.includes(key)
      ? collapsedGroups.filter((item) => item !== key)
      : [...collapsedGroups, key];
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

  function serviceBoundary(weekday: number): number {
    const boundary = snapshot?.opening_hours.find(
      (hours) => hours.weekday === weekday && hours.service_key === 'evening' && hours.is_open
    )?.opens_at;
    return clockMinutes(boundary) ?? 18 * 60;
  }

  function spansServiceBoundary(shift: PlanningShiftDraft): boolean {
    const start = clockMinutes(shift.startsAt);
    const rawEnd = clockMinutes(shift.endsAt);
    if (start === null || rawEnd === null || start === rawEnd) return false;
    const end = rawEnd <= start ? rawEnd + 24 * 60 : rawEnd;
    const boundary = serviceBoundary(shift.weekday);
    return start < boundary && end > boundary;
  }

  function shiftCostValue(shift: PlanningShiftDraft): number {
    const hours = hoursBetweenClocks(shift.startsAt, shift.endsAt);
    const hourlyCost = employeeCost.get(shift.employeeId) || positionCost.get(shift.jobFunctionId) || 0;
    return hourlyCost > 0 ? hours * hourlyCost : 0;
  }

  function shiftsCost(shifts: PlanningShiftDraft[]): number {
    return shifts.reduce((sum, shift) => sum + shiftCostValue(shift), 0);
  }

  function dayShifts(grid: PlanningGrid, employeeId: string, date: string): DayShiftView[] {
    const overlapKeys = planningOverlapKeys(scheduleDraft.shifts);
    return SERVICES.flatMap((service) => {
      const slot = grid.slotsByKey.get(slotKey(employeeId, date, service));
      if (!slot?.shift) return [];
      const hours = hoursBetweenClocks(slot.shift.startsAt, slot.shift.endsAt);
      const estimatedCostValue = shiftCostValue(slot.shift);
      return [{
        key: slot.key,
        service,
        startsAt: slot.shift.startsAt,
        endsAt: slot.shift.endsAt,
        label: `${clockLabel(slot.shift.startsAt)}–${clockLabel(slot.shift.endsAt)}`,
        hours: formatHours(hours),
        hoursValue: hours,
        area: areaName.get(slot.shift.areaId) ?? t('No area'),
        position: positionName.get(slot.shift.jobFunctionId) ?? t('Not assigned'),
        showPosition: Boolean(slot.shift.jobFunctionId) &&
          slot.shift.jobFunctionId !== employeePosition.get(employeeId),
        color: areaColor.get(slot.shift.areaId) ?? 'var(--cl-muted)',
        conflict: slot.truth.state === 'conflict' || overlapKeys.has(draftKey(slot.shift)),
        overlap: overlapKeys.has(draftKey(slot.shift)),
        spansDay: spansServiceBoundary(slot.shift),
        estimatedCost: estimatedCostValue > 0 ? money(estimatedCostValue) : '',
        estimatedCostValue
      }];
    });
  }

  function dayCardView(shifts: DayShiftView[]): DayCardView {
    const ordered = shifts.toSorted((left, right) =>
      (clockMinutes(left.startsAt) ?? 0) - (clockMinutes(right.startsAt) ?? 0)
    );
    const first = ordered[0];
    const last = ordered[ordered.length - 1];
    const totalHours = ordered.reduce((sum, shift) => sum + shift.hoursValue, 0);
    const totalCost = ordered.reduce((sum, shift) => sum + shift.estimatedCostValue, 0);
    let breakLabel = t('No break');
    let hasBreak = false;

    if (ordered.length > 1) {
      const firstStart = clockMinutes(first.startsAt) ?? 0;
      let firstEnd = clockMinutes(first.endsAt) ?? firstStart;
      let nextStart = clockMinutes(ordered[1].startsAt) ?? firstEnd;
      if (firstEnd <= firstStart) firstEnd += 24 * 60;
      while (nextStart < firstStart) nextStart += 24 * 60;
      if (nextStart > firstEnd) {
        breakLabel = t('{hours} break', { hours: formatHours((nextStart - firstEnd) / 60) });
        hasBreak = true;
      }
    }

    return {
      timeLabel: ordered.length === 1
        ? first.label
        : `${clockLabel(first.startsAt)}–${clockLabel(last.endsAt)}`,
      hours: formatHours(totalHours),
      breakLabel,
      hasBreak,
      estimatedCost: totalCost > 0 ? money(totalCost) : '',
      shifts: ordered
    };
  }

  function zoneTone(slot: PlanningGridSlot | undefined): string {
    if (!slot) return 'neutral';
    if (slot.context.absence === 'approved' || slot.context.workPatternException === 'approved') return 'leave';
    if (slot.context.absence === 'pending' || slot.context.workPatternException === 'pending') return 'pending';
    if (slot.context.availability === 'available') return 'available';
    if (slot.context.availability === 'partial') return 'partial';
    if (slot.context.availability === 'unavailable') return 'unavailable';
    return 'neutral';
  }

  function zoneLabel(slot: PlanningGridSlot | undefined): string {
    if (!slot) return '';
    if (slot.context.absence === 'approved') return t('Absence');
    if (slot.context.absence === 'pending') return t('Pending absence');
    if (slot.context.workPatternException === 'approved') return t('Schedule exception');
    if (slot.context.workPatternException === 'pending') return t('Change pending');
    if (slot.context.availability === 'unavailable') return t('Unavailable');
    if (slot.context.availability === 'partial') return t('Partly available');
    return '';
  }

  function quickPlan(grid: PlanningGrid, employeeId: string, date: string, service: ServiceKey): void {
    if (!snapshot) return;
    const slot = grid.slotsByKey.get(slotKey(employeeId, date, service));
    if (!slot) return;
    if (slot.shift || blocksPlanningAssignment(slot.context)) {
      selectedKey = slot.key;
      return;
    }
    const next = defaultPlanningShift(snapshot, slot);
    if (!next?.areaId || !next.jobFunctionId) {
      selectedKey = slot.key;
      return;
    }
    scheduleDraft.add(next);
  }

  function beginDrag(key: string): void {
    draggingKey = key;
  }

  function canDrop(
    grid: PlanningGrid,
    employeeId: string,
    date: string,
    service: ServiceKey,
    today: string
  ): boolean {
    if (!draggingKey || date < today || employeeActive.get(employeeId) === false) return false;
    const source = grid.slotsByKey.get(draggingKey);
    if (!source?.shift) return false;
    const target = grid.slotsByKey.get(slotKey(employeeId, date, service));
    return Boolean(target && !target.shift && target.key !== source.key);
  }

  function dropShift(
    grid: PlanningGrid,
    employeeId: string,
    date: string,
    service: ServiceKey,
    today: string
  ): void {
    if (!snapshot || !canDrop(grid, employeeId, date, service, today)) return;
    const source = grid.slotsByKey.get(draggingKey);
    const target = grid.slotsByKey.get(slotKey(employeeId, date, service));
    if (!source?.shift || !target) return;
    const defaults = defaultPlanningShift(snapshot, target);
    scheduleDraft.replace(
      scheduleDraft.shifts.map((shift) =>
        shift === source.shift
          ? {
              ...shift,
              employeeId,
              weekday: target.weekday,
              serviceKey: service,
              startsAt: service === source.serviceKey ? shift.startsAt : defaults?.startsAt ?? shift.startsAt,
              endsAt: service === source.serviceKey ? shift.endsAt : defaults?.endsAt ?? shift.endsAt
            }
          : shift
      )
    );
    draggingKey = '';
    dropKey = '';
  }

  async function persistDraft(weekStart: string, revision: number): Promise<void> {
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
        wasPublished: false
      });
      scheduleDraft.settle();
      toasts.show(t('Schedule saved.'), 'success');
    } catch (error) {
      toasts.show(friendlyError(error), 'danger');
    } finally {
      saving = false;
      scheduleDraft.saving = false;
    }
  }

  function pendingRequestCount(grid: PlanningGrid): number {
    return [...grid.slotsByKey.values()].filter(
      (slot) =>
        slot.shift &&
        (slot.context.absence === 'pending' || slot.context.workPatternException === 'pending')
    ).length;
  }

  async function publishWeek(
    weekStart: string,
    revision: number,
    wasPublished: boolean,
    conflictCount: number
  ): Promise<void> {
    if (!workspace.activeId || publishing || scheduleDraft.saving) return;
    publishing = true;
    scheduleDraft.saving = true;
    try {
      await saveSchedule({
        restaurantId: workspace.activeId,
        weekStart,
        status: 'published',
        shifts: scheduleDraft.shifts,
        notes: scheduleDraft.notes,
        expectedRevision: revision,
        wasPublished,
        allowCoverageGaps: true,
        allowConflicts: conflictCount > 0
      });
      scheduleDraft.settle();
      showPublishConfirm = false;
      toasts.show(
        t(wasPublished ? 'Schedule republished.' : 'Schedule published. Employees can now see their shifts.'),
        'success'
      );
    } catch (error) {
      toasts.show(friendlyError(error), 'danger');
    } finally {
      publishing = false;
      scheduleDraft.saving = false;
    }
  }

  function requestPublish(grid: PlanningGrid, weekStart: string, revision: number, wasPublished: boolean): void {
    if (invalidPlanningShift(scheduleDraft.shifts)) {
      toasts.show(t('Every planned shift needs a valid start and end time.'), 'danger');
      return;
    }
    const overlaps = planningOverlaps(scheduleDraft.shifts);
    if (overlaps.length) {
      toasts.show(t('Overlapping shifts must be resolved before publishing.'), 'danger');
      return;
    }
    const gaps = snapshot ? coverageIssues(snapshot, scheduleDraft.shifts, weekStart) : [];
    const conflicts = snapshot ? planningConflicts(snapshot, scheduleDraft.shifts, weekStart) : [];
    const pending = pendingRequestCount(grid);
    if (gaps.length || conflicts.length || pending) {
      showPublishConfirm = true;
      return;
    }
    void publishWeek(weekStart, revision, wasPublished, conflicts.length);
  }

  function openWeekPicker(): void {
    if (!weekPicker) return;
    if ('showPicker' in weekPicker) weekPicker.showPicker();
    else weekPicker.click();
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
        {@const groups = groupedRows(grid)}
        {@const visibleEmployeeIds = new Set(groups.flatMap((group) => group.rows.map((row) => row.id)))}
        {@const visibleWeekEntries = scheduleDraft.shifts.filter((shift) => visibleEmployeeIds.has(shift.employeeId))}
        {@const visibleWeekHours = visibleWeekEntries.reduce((sum, shift) => sum + hoursBetweenClocks(shift.startsAt, shift.endsAt), 0)}
        {@const visibleWeekCost = shiftsCost(visibleWeekEntries)}
        {@const publishGaps = snapshot ? coverageIssues(snapshot, scheduleDraft.shifts, week.weekStart) : []}
        {@const publishConflicts = snapshot ? planningConflicts(snapshot, scheduleDraft.shifts, week.weekStart) : []}
        {@const publishPending = pendingRequestCount(grid)}
        <section class="schedule-panel">
          <header class="schedule-head">
            <div class="schedule-head__left"></div>

            <div class="week-nav" aria-label={t('Week')}>
              <button class="icon-btn" type="button" aria-label={t('Previous')} onclick={week.previous}>
                <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m15 6-6 6 6 6" /></svg>
              </button>
              <button class="week-nav__date" type="button" onclick={openWeekPicker}>
                <span>{week.label}</span>
                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 2v3M18 2v3M3 9h18"/><rect x="3" y="4" width="18" height="17" rx="2"/></svg>
              </button>
              <input
                class="week-nav__picker"
                bind:this={weekPicker}
                type="date"
                value={week.weekStart}
                aria-label={t('Choose week')}
                onchange={(event) => week.selectDate(event.currentTarget.value)}
              />
              <button class="icon-btn" type="button" aria-label={t('Next')} onclick={week.next}>
                <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m9 6 6 6-6 6" /></svg>
              </button>
              {#if week.weekStart !== mondayFor(week.today)}
                <button class="today-link" type="button" onclick={week.todayAction}>{t('Today')}</button>
              {/if}
            </div>

            <div class="schedule-head__right">
              <button class="icon-btn" type="button" disabled={saving || !week.editable} aria-label={t('Copy previous week')} title={t('Copy previous week')} onclick={() => copyPreviousWeek(week.weekStart)}>
                <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/></svg>
              </button>
              <button class="icon-btn" type="button" disabled={!snapshot} aria-label={t('Export CSV')} title={t('Export CSV')} onclick={() => exportWeek(week.weekStart)}>
                <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3v12M7 10l5 5 5-5"/><path d="M5 21h14"/></svg>
              </button>
              <button
                class="publish-btn"
                class:is-published={week.published && !scheduleDraft.dirty}
                class:is-republish={week.published && scheduleDraft.dirty}
                type="button"
                disabled={publishing || !week.editable || (week.published && !scheduleDraft.dirty)}
                onclick={() => requestPublish(grid, week.weekStart, week.revision, week.published)}
              >
                {#if publishing}
                  {t('Publishing…')}
                {:else if week.published && scheduleDraft.dirty}
                  {t('Republish')}
                {:else if week.published}
                  <span class="publish-btn__dot"></span>{t('Published')}
                {:else}
                  {t('Publish')}
                {/if}
              </button>
            </div>
          </header>

          {#if week.published && scheduleDraft.dirty}
            <div class="republish-note">{t('Your changes are private until you republish this week.')}</div>
          {/if}

          <div class="schedule-wrap">
            <table class="board">
              <thead>
                <tr>
                  <th class="board__staff has-menu">
                    <ClassicPrimaryColMenu
                      label={t('Employee')}
                      meta={`${t('{count} employees', { count: visibleEmployeeIds.size })} · ${formatHours(visibleWeekHours)} · ${visibleWeekCost > 0 ? `~${money(visibleWeekCost)}` : '—'}`}
                      sortable
                      sortDir={employeeSort}
                      onsort={(dir) => (employeeSort = dir)}
                      filterKind="text"
                      searchValue={search}
                      onsearch={(value) => (search = value)}
                      extraActive={Boolean(positionId || onlyConflicts)}
                      groupValue={groupMode}
                      groupOptions={[
                        { value: 'none', label: t('No grouping') },
                        { value: 'contract', label: t('Contract type') },
                        { value: 'position', label: t('Position') },
                        { value: 'area', label: t('Area') }
                      ]}
                      ongroupchange={(value) => setGroupMode(value as GroupMode)}
                    >
                      {#snippet extra()}
                        <label><span>{t('Position')}</span><select class="cl-field" bind:value={positionId}><option value="">{t('All positions')}</option>{#each snapshot?.job_functions.filter((item) => item.active).toSorted((a, b) => a.name.localeCompare(b.name)) ?? [] as item (item.id)}<option value={item.id}>{item.name}</option>{/each}</select></label>
                        <label class="check"><input type="checkbox" bind:checked={onlyConflicts} />{t('Only conflicts')}</label>
                      {/snippet}
                    </ClassicPrimaryColMenu>
                  </th>
                  {#each grid.days as day (day.date)}
                    {@const dayEntries = scheduleDraft.shifts.filter((shift) => shift.weekday === day.weekday)}
                    {@const total = dayEntries.reduce((sum, shift) => sum + hoursBetweenClocks(shift.startsAt, shift.endsAt), 0)}
                    {@const totalCost = shiftsCost(dayEntries)}
                    <th class="board__day" class:is-today={day.today}>
                      <span><b>{t(day.label)}</b> {Number(day.date.slice(-2))}</span>
                      <small>{total ? `${formatHours(total)} · ${totalCost > 0 ? money(totalCost) : '—'}` : t('No shifts')}</small>
                    </th>
                  {/each}
                </tr>
              </thead>
              <tbody>
                {#if !groups.some((group) => group.rows.length)}
                  <tr><td colspan={grid.days.length + 1}><div class="cl-empty"><strong>{t('No employees match these filters')}</strong><span>{t('Clear a filter to show the full planning team.')}</span></div></td></tr>
                {:else}
                  {#each groups as group (group.key)}
                    {#if groupMode !== 'none'}
                      <ClassicGroupRow
                        colspan={grid.days.length + 1}
                        label={group.label}
                        meta={`${t('{count} employees', { count: group.rows.length })} · ${formatHours(group.hours)}`}
                        collapsed={collapsedGroups.includes(group.key)}
                        ontoggle={() => toggleGroup(group.key)}
                      />
                    {/if}
                    {#if !collapsedGroups.includes(group.key)}
                      {#each group.rows as row (row.id)}
                        {@const target = contractHours.get(row.id) ?? 0}
                        {@const planned = employeeHours(row.id)}
                        {@const plannedCost = shiftsCost(scheduleDraft.shifts.filter((shift) => shift.employeeId === row.id))}
                        {@const progress = target ? Math.min(100, Math.round((planned / target) * 100)) : 0}
                        {@const active = employeeActive.get(row.id) !== false}
                        <tr class:is-archived={!active}>
                          <td class="board__staff">
                            <span class="staff">
                              <span class="cl-avatar" style="--avatar-color:{employeeColor.get(row.id) ?? 'var(--cl-muted)'}">{personInitials(row.name)}</span>
                              <span class="staff__id">
                                <span class="staff__name"><strong>{row.name}</strong>{#if !active}<em>{t('Archived')}</em>{/if}</span>
                                <span class="staff__hours">
                                  <span><b>{formatHours(planned)}</b>{#if target} / {formatHours(target)}{/if}</span>
                                  <em>{plannedCost > 0 ? `~${money(plannedCost)}` : '—'}</em>
                                </span>
                                {#if target}<span class="staff__meter"><i style={`width:${progress}%`}></i></span>{/if}
                              </span>
                            </span>
                          </td>
                          {#each row.cells as cell (cell.date)}
                            {@const shifts = dayShifts(grid, row.id, cell.date)}
                            {@const lunchShift = shifts.find((shift) => shift.service === 'lunch') ?? null}
                            {@const eveningShift = shifts.find((shift) => shift.service === 'evening') ?? null}
                            {@const spanningShift = shifts.length === 1 && shifts[0].spansDay ? shifts[0] : null}
                            {@const lunchColor = lunchShift?.color ?? spanningShift?.color ?? 'var(--cl-muted)'}
                            {@const eveningColor = eveningShift?.color ?? spanningShift?.color ?? 'var(--cl-muted)'}
                            {@const dayConflict = shifts.some((shift) => shift.conflict)}
                            {@const dayOverlap = shifts.some((shift) => shift.overlap)}
                            {@const past = cell.date < week.today}
                            {@const cellKey = `${row.id}|${cell.date}`}
                            <td class="board__cell" class:is-past={past} class:is-drop-target={dropKey.startsWith(cellKey)}>
                              <div class="service-canvas" class:has-card={shifts.length > 0}>
                                {#each SERVICES as service (service)}
                                  {@const slot = grid.slotsByKey.get(slotKey(row.id, cell.date, service))}
                                  {@const tone = zoneTone(slot)}
                                  {@const label = zoneLabel(slot)}
                                  {@const targetKey = `${cellKey}|${service}`}
                                  <button
                                    class="service-zone is-{service} is-{tone}"
                                    type="button"
                                    disabled={!week.editable || past || !active || Boolean(slot?.shift)}
                                    aria-label={t(service === 'evening' ? 'Plan evening shift' : 'Plan lunch shift')}
                                    ondragover={(event) => { if (canDrop(grid, row.id, cell.date, service, week.today)) { event.preventDefault(); dropKey = targetKey; } }}
                                    ondragleave={() => { if (dropKey === targetKey) dropKey = ''; }}
                                    ondrop={(event) => { event.preventDefault(); dropShift(grid, row.id, cell.date, service, week.today); }}
                                    onclick={() => quickPlan(grid, row.id, cell.date, service)}
                                  >
                                    <span class="service-zone__cue" aria-hidden="true">{service === 'evening' ? '☾' : '☀'}</span>
                                    {#if label}<span class="service-zone__state">{label}</span>{/if}
                                  </button>
                                {/each}

                                {#if shifts.length}
                                  {@const card = dayCardView(shifts)}
                                  <div
                                    class="day-card"
                                    class:is-lunch-only={Boolean(lunchShift && !eveningShift && !spanningShift)}
                                    class:is-evening-only={Boolean(eveningShift && !lunchShift && !spanningShift)}
                                    class:is-full-day={Boolean(spanningShift)}
                                    class:is-conflict={dayConflict}
                                    class:is-published-conflict={dayConflict && week.published}
                                    class:is-readonly={past || !week.editable || !active}
                                    style={`--lunch-color:${lunchColor};--evening-color:${eveningColor}`}
                                  >
                                    <span class="day-card__surface" aria-hidden="true">
                                      <span class="day-card__fill is-lunch" class:is-active={Boolean(lunchShift || spanningShift)}></span>
                                      <span class="day-card__fill is-evening" class:is-active={Boolean(eveningShift || spanningShift)}></span>
                                      <span class="day-card__divider"></span>
                                    </span>

                                    {#if spanningShift}
                                      <button
                                        class="day-card__hit is-span"
                                        type="button"
                                        draggable={week.editable && !past && active}
                                        aria-label={`${spanningShift.label}, ${spanningShift.area}, ${spanningShift.position}`}
                                        ondragstart={() => beginDrag(spanningShift.key)}
                                        ondragend={() => { draggingKey = ''; dropKey = ''; }}
                                        onclick={() => (selectedKey = spanningShift.key)}
                                      ></button>
                                    {:else}
                                      {#each SERVICES as service (service)}
                                        {@const chip = service === 'lunch' ? lunchShift : eveningShift}
                                        {@const targetKey = `${cellKey}|${service}`}
                                        {#if chip}
                                          <button
                                            class="day-card__hit is-{service}"
                                            type="button"
                                            draggable={week.editable && !past && active}
                                            aria-label={`${chip.label}, ${chip.area}, ${chip.position}`}
                                            ondragstart={() => beginDrag(chip.key)}
                                            ondragend={() => { draggingKey = ''; dropKey = ''; }}
                                            onclick={() => (selectedKey = chip.key)}
                                          ></button>
                                        {:else}
                                          <button
                                            class="day-card__add is-{service}"
                                            type="button"
                                            disabled={!week.editable || past || !active}
                                            aria-label={t(service === 'evening' ? 'Plan evening shift' : 'Plan lunch shift')}
                                            ondragover={(event) => { if (canDrop(grid, row.id, cell.date, service, week.today)) { event.preventDefault(); dropKey = targetKey; } }}
                                            ondragleave={() => { if (dropKey === targetKey) dropKey = ''; }}
                                            ondrop={(event) => { event.preventDefault(); dropShift(grid, row.id, cell.date, service, week.today); }}
                                            onclick={() => quickPlan(grid, row.id, cell.date, service)}
                                          ><span>+ {t(service === 'evening' ? 'Evening' : 'Lunch')}</span></button>
                                        {/if}
                                      {/each}
                                    {/if}

                                    <span class="day-card__content">
                                      <span class="day-card__top">
                                        <strong>{card.timeLabel}</strong>
                                        <span class="day-card__metrics">
                                          <b title={t('Planned hours')}>{card.hours}</b>
                                          <b title={t('Estimated cost')}>{card.estimatedCost || '—'}</b>
                                        </span>
                                        {#if dayConflict}
                                          <span
                                            class="day-card__conflict-dot"
                                            role="img"
                                            aria-label={t(dayOverlap ? 'Overlapping shifts' : 'Conflict')}
                                            title={t(dayOverlap ? 'Overlapping shifts' : 'Conflict')}
                                          >!</span>
                                        {:else}
                                          <span class="day-card__status-slot" aria-hidden="true"></span>
                                        {/if}
                                      </span>
                                      <span class="day-card__break" class:is-empty={!card.hasBreak}>
                                        <span class="day-card__coffee" aria-hidden="true">☕</span>
                                        <b>{card.breakLabel}</b>
                                      </span>
                                      <span class="day-card__services">
                                        {#each SERVICES as service (service)}
                                          {@const chip = card.shifts.find((shift) => shift.service === service)}
                                          {#if chip}
                                            <span class="day-card__service-row is-{chip.service}">
                                              <span class="day-card__service-icon" aria-hidden="true">{chip.spansDay ? '↔' : chip.service === 'evening' ? '☾' : '☀'}</span>
                                              <span class="day-card__service-name">
                                                <b>{chip.area}</b>
                                                {#if chip.showPosition}<small>· {chip.position}</small>{/if}
                                              </span>
                                              <em>{chip.hours}{#if chip.estimatedCost} · ~{chip.estimatedCost}{/if}</em>
                                            </span>
                                          {:else}
                                            <span class="day-card__service-row is-empty">
                                              <span class="day-card__service-icon" aria-hidden="true">{service === 'evening' ? '☾' : '☀'}</span>
                                              <span class="day-card__service-name">
                                                <b>{t(service === 'evening' ? 'Evening' : 'Lunch')}</b>
                                                <small>{t('No shifts')}</small>
                                              </span>
                                              <em>—</em>
                                            </span>
                                          {/if}
                                        {/each}
                                      </span>
                                    </span>
                                  </div>
                                {/if}
                              </div>
                            </td>
                          {/each}
                        </tr>
                      {/each}
                    {/if}
                  {/each}
                {/if}
              </tbody>
            </table>
          </div>

          <div class="legend">
            <span><i class="is-available"></i>{t('Available')}</span>
            <span><i class="is-area"></i>{t('Area colour')}</span>
            <span><i class="is-conflict"></i>{t('Conflict')}</span>
            <span><i class="is-absence"></i>{t('Absence or unavailable')}</span>
            <span class="legend__hint">{t('Click a free day or evening half to plan instantly. Drag a shift between halves to move it.')}</span>
          </div>

          {#if scheduleDraft.dirty && !week.published}
            <div class="draft-save">
              <span><i></i>{t('Unsaved changes')}</span>
              <button class="icon-btn" type="button" disabled={saving} aria-label={t('Discard')} title={t('Discard')} onclick={() => snapshot && scheduleDraft.reset(snapshot, week.weekStart)}>
                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 12a8 8 0 1 0 2.3-5.7L4 8.6"/><path d="M4 4v4.6h4.6"/></svg>
              </button>
              <button class="publish-btn is-save" type="button" disabled={saving || !week.editable} onclick={() => void persistDraft(week.weekStart, week.revision)}>{t(saving ? 'Saving…' : 'Save draft')}</button>
            </div>
          {/if}
        </section>

        <Dialog
          open={showPublishConfirm}
          title={t(week.published ? 'Republish this week?' : 'Publish this week?')}
          description={t('Publishing keeps the manager in control: warnings remain visible but do not silently change the planning.')}
          onclose={() => (showPublishConfirm = false)}
        >
          <div class="publish-review">
            <div class="publish-review__stats">
              <span><b>{publishConflicts.length}</b>{t('Conflicts')}</span>
              <span><b>{publishGaps.length}</b>{t('Coverage gaps')}</span>
              <span><b>{publishPending}</b>{t('Pending requests')}</span>
            </div>
            <p>{t('These points do not block publication. Employees will see the schedule exactly as shown after you confirm.')}</p>
            <div class="publish-review__actions">
              <button class="cl-btn" type="button" onclick={() => (showPublishConfirm = false)}>{t('Cancel')}</button>
              <button class="publish-btn" type="button" disabled={publishing} onclick={() => void publishWeek(week.weekStart, week.revision, week.published, publishConflicts.length)}>{t(publishing ? 'Publishing…' : week.published ? 'Republish' : 'Publish')}</button>
            </div>
          </div>
        </Dialog>
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
            editable={week.editable && selectedSlot.date >= week.today}
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
  .schedule-panel { position: relative; display: grid; gap: 0; }
  .schedule-head { position: relative; display: grid; grid-template-columns: minmax(180px, 1fr) auto minmax(250px, 1fr); align-items: center; gap: 18px; min-height: 50px; padding: 4px 0 6px; }
  .schedule-head__left { justify-self: start; }
  .schedule-head__right { justify-self: end; display: flex; align-items: center; gap: 7px; }

  .week-nav { position: relative; display: flex; align-items: center; justify-content: center; gap: 4px; }
  .week-nav__date { display: inline-flex; align-items: center; justify-content: center; gap: 8px; min-width: 188px; min-height: 34px; padding: 5px 12px; border: 1px solid transparent; border-radius: 6px; background: transparent; color: var(--cl-ink); font: inherit; font-size: 14px; font-weight: var(--rst-fw-bold); cursor: pointer; }
  .week-nav__date:hover { border-color: var(--cl-line); background: var(--cl-surface-muted); }
  .week-nav__date svg { color: var(--cl-muted); }
  .week-nav__picker { position: absolute; width: 1px; height: 1px; opacity: 0; pointer-events: none; }
  .today-link { min-height: 28px; margin-left: 4px; padding: 3px 7px; border: 0; background: transparent; color: var(--cl-accent); font: inherit; font-size: 11px; font-weight: var(--rst-fw-bold); cursor: pointer; }

  .icon-btn { display: grid; place-items: center; width: 34px; height: 34px; padding: 0; border: 1px solid var(--cl-line); border-radius: 6px; background: var(--cl-surface); color: var(--cl-muted); cursor: pointer; transition: border-color var(--cl-dur) var(--cl-ease), color var(--cl-dur) var(--cl-ease), background var(--cl-dur) var(--cl-ease); }
  .icon-btn:hover:not(:disabled) { border-color: var(--cl-line-strong); color: var(--cl-ink); background: var(--cl-surface-muted); }
  .icon-btn:disabled { opacity: .42; cursor: default; }
  .publish-btn { display: inline-flex; align-items: center; justify-content: center; gap: 7px; min-height: 36px; padding: 7px 15px; border: 1px solid var(--cl-accent); border-radius: 6px; background: var(--cl-accent); color: white; font: inherit; font-size: 13px; font-weight: var(--rst-fw-bold); cursor: pointer; }
  .publish-btn:hover:not(:disabled) { filter: brightness(.97); box-shadow: 0 4px 12px color-mix(in srgb, var(--cl-accent) 22%, transparent); }
  .publish-btn:disabled { cursor: default; }
  .publish-btn.is-published { border-color: var(--cl-ok-line); background: var(--cl-ok-wash); color: var(--cl-ok); opacity: 1; }
  .publish-btn.is-republish { border-color: var(--cl-accent); background: var(--cl-accent); }
  .publish-btn.is-save { min-height: 34px; padding-inline: 12px; }
  .publish-btn__dot { width: 7px; height: 7px; border-radius: 50%; background: var(--cl-ok); }
  .republish-note { justify-self: end; margin: -5px 2px 8px 0; color: var(--cl-attention); font-size: 11px; font-weight: var(--rst-fw-medium); }

  .schedule-wrap { max-height: calc(100vh - 188px); overflow: auto; border: 1px solid color-mix(in srgb, var(--cl-ink) 12%, var(--cl-line-strong)); border-radius: 5px; background: var(--cl-surface); box-shadow: 0 1px 2px rgb(0 0 0 / .035); }
  .board { width: 100%; min-width: 1270px; border-spacing: 0; table-layout: fixed; border-collapse: separate; color: var(--cl-ink); font-size: 13px; }
  .board thead { position: sticky; top: 0; z-index: 8; }
  .board th { height: 54px; padding: 6px 10px; border-bottom: 1px solid color-mix(in srgb, var(--cl-accent) 65%, var(--cl-line)); background: var(--cl-thead); text-align: left; }
  .board th.has-menu { padding: 0; }
  .board td { height: 90px; padding: 0; border-bottom: 1px solid color-mix(in srgb, var(--cl-ink) 14%, var(--cl-grid-line)); background: var(--cl-surface); background-clip: padding-box; vertical-align: middle; }
  .board__staff { position: sticky; left: 0; z-index: 4; width: 230px; border-right: 1px solid var(--cl-grid-line); background: var(--cl-surface) !important; }
  thead .board__staff { z-index: 10; background: var(--cl-thead) !important; }
  .board__day { border-left: 1px solid var(--cl-grid-line); text-align: center !important; }
  .board__day > span { display: block; font-size: 13px; }
  .board__day > span b { font-weight: var(--rst-fw-bold); }
  .board__day small { display: block; margin-top: 2px; color: var(--cl-muted); font-size: 9px; font-weight: var(--rst-fw-medium); line-height: 1.1; text-transform: none; letter-spacing: 0; }
  .board__day.is-today { color: var(--cl-accent); background: var(--cl-accent-wash); }
  .board__cell { position: relative; border-left: 1px solid var(--cl-grid-line); }
  .board__cell.is-past { background: color-mix(in srgb, var(--cl-surface-muted) 68%, var(--cl-surface)); }
  .board__cell.is-drop-target { box-shadow: inset 0 0 0 2px color-mix(in srgb, var(--cl-ok) 62%, transparent); }
  tr.is-archived { opacity: .72; }



  .staff { display: flex; align-items: center; gap: 10px; padding: 10px 14px; }
  .staff__id { display: grid; gap: 3px; min-width: 0; flex: 1; }
  .staff__name { display: flex; align-items: center; gap: 7px; min-width: 0; }
  .staff__name strong { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 13px; font-weight: var(--rst-fw-bold); }
  .staff__name em { padding: 2px 5px; border: 1px solid var(--cl-line); border-radius: 999px; color: var(--cl-muted); font-size: 9px; font-style: normal; text-transform: uppercase; }
  .staff__hours { display: flex; align-items: baseline; justify-content: space-between; gap: 8px; color: var(--cl-muted); font-size: 11px; font-variant-numeric: tabular-nums; }
  .staff__hours b { color: var(--cl-ink); }
  .staff__hours em { flex: 0 0 auto; color: color-mix(in srgb, var(--cl-accent) 58%, var(--cl-muted)); font-size: 10px; font-style: normal; font-weight: var(--rst-fw-medium); }
  .staff__meter { width: 100%; height: 4px; overflow: hidden; border-radius: 999px; background: var(--cl-line); }
  .staff__meter i { display: block; height: 100%; border-radius: inherit; background: var(--cl-accent); }

  .service-canvas { position: relative; min-height: 89px; display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); overflow: hidden; }
  .service-zone { position: relative; min-width: 0; min-height: inherit; padding: 0; border: 0; background: transparent; color: var(--cl-muted); cursor: pointer; transition: box-shadow var(--cl-dur) var(--cl-ease), background var(--cl-dur) var(--cl-ease); }
  .service-zone + .service-zone { border-left: 1px dashed color-mix(in srgb, var(--cl-grid-line) 82%, transparent); }
  .service-zone:disabled { cursor: default; }
  .service-zone.is-available { background: color-mix(in srgb, var(--cl-ok) 11%, var(--cl-surface)); }
  .service-zone.is-partial { background: color-mix(in srgb, var(--cl-attention) 10%, var(--cl-surface)); }
  .service-zone.is-unavailable { background: color-mix(in srgb, var(--cl-line-strong) 32%, var(--cl-surface)); }
  .service-zone.is-leave { background: repeating-linear-gradient(-45deg, color-mix(in srgb, var(--cl-line) 48%, var(--cl-surface)), color-mix(in srgb, var(--cl-line) 48%, var(--cl-surface)) 7px, var(--cl-surface) 7px, var(--cl-surface) 14px); }
  .service-zone.is-pending { background: repeating-linear-gradient(-45deg, color-mix(in srgb, var(--cl-attention) 9%, var(--cl-surface)), color-mix(in srgb, var(--cl-attention) 9%, var(--cl-surface)) 7px, var(--cl-surface) 7px, var(--cl-surface) 14px); }
  .service-zone:not(:disabled):hover { box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--cl-accent) 38%, transparent); }
  .service-zone__cue { position: absolute; inset: 0; display: grid; place-items: center; color: transparent; font-size: 15px; transition: color var(--cl-dur) var(--cl-ease); }
  .service-zone:not(:disabled):hover .service-zone__cue { color: color-mix(in srgb, var(--cl-accent) 76%, var(--cl-muted)); }
  .service-zone__state { position: absolute; left: 6px; right: 6px; bottom: 6px; overflow: hidden; color: var(--cl-muted); font-size: 9px; font-weight: var(--rst-fw-medium); text-align: center; text-overflow: ellipsis; white-space: nowrap; }
  .service-canvas.has-card > .service-zone { pointer-events: none; }

  /* One fixed compact card per employee/day. Colour remains a quiet service
     tint; the card itself uses one crisp neutral outline on every side. */
  .day-card { --lunch-color: var(--cl-muted); --evening-color: var(--cl-muted); position: absolute; z-index: 3; inset: 6px; overflow: hidden; border: 1px solid color-mix(in srgb, var(--cl-ink) 30%, var(--cl-line-strong)); border-radius: 3px; background: var(--cl-surface); box-shadow: 0 1px 2px rgb(0 0 0 / .05); isolation: isolate; transition: border-color var(--cl-dur) var(--cl-ease), box-shadow var(--cl-dur) var(--cl-ease); }
  .day-card:hover { border-color: color-mix(in srgb, var(--cl-ink) 46%, var(--cl-line-strong)); box-shadow: 0 2px 7px rgb(0 0 0 / .09); }
  .day-card.is-readonly { box-shadow: none; }
  .day-card__surface { position: absolute; z-index: 0; inset: 0; display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); pointer-events: none; }
  .day-card__fill { opacity: 1; background: color-mix(in srgb, var(--cl-surface-muted) 62%, var(--cl-surface)); transition: background var(--cl-dur) var(--cl-ease); }
  .day-card__fill.is-lunch.is-active { background: linear-gradient(180deg, color-mix(in srgb, var(--lunch-color) 12%, var(--cl-surface)), color-mix(in srgb, var(--lunch-color) 7%, var(--cl-surface))); }
  .day-card__fill.is-evening.is-active { background: linear-gradient(180deg, color-mix(in srgb, var(--evening-color) 12%, var(--cl-surface)), color-mix(in srgb, var(--evening-color) 7%, var(--cl-surface))); }
  .day-card.is-lunch-only .day-card__fill.is-evening { background: color-mix(in srgb, var(--lunch-color) 3%, var(--cl-surface)); }
  .day-card.is-evening-only .day-card__fill.is-lunch { background: color-mix(in srgb, var(--evening-color) 3%, var(--cl-surface)); }
  .day-card.is-full-day .day-card__fill { background: color-mix(in srgb, var(--lunch-color) 11%, var(--cl-surface)); }
  .day-card__divider { position: absolute; top: 5px; bottom: 5px; left: 50%; width: 1px; background: color-mix(in srgb, var(--cl-line-strong) 72%, transparent); }
  .day-card.is-full-day .day-card__divider { opacity: .3; }

  .day-card__hit { position: absolute; z-index: 4; top: 0; bottom: 0; width: 50%; padding: 0; border: 0; background: transparent; cursor: pointer; }
  .day-card__hit.is-lunch { left: 0; }
  .day-card__hit.is-evening { right: 0; }
  .day-card__hit.is-span { left: 0; width: 100%; }
  .day-card__hit[draggable='true'] { cursor: grab; }
  .day-card__hit:hover { background: color-mix(in srgb, var(--cl-surface) 10%, transparent); }
  .day-card__hit:focus-visible, .day-card__add:focus-visible { outline: 2px solid var(--cl-accent); outline-offset: -3px; }

  .day-card__add { position: absolute; z-index: 5; top: 0; bottom: 0; display: flex; align-items: flex-end; justify-content: center; width: 50%; padding: 0 5px 6px; border: 0; background: transparent; color: transparent; font: inherit; cursor: pointer; transition: color var(--cl-dur) var(--cl-ease), background var(--cl-dur) var(--cl-ease), box-shadow var(--cl-dur) var(--cl-ease); }
  .day-card__add.is-lunch { left: 0; }
  .day-card__add.is-evening { right: 0; }
  .day-card__add:not(:disabled):hover, .day-card__add:not(:disabled):focus-visible { color: color-mix(in srgb, var(--cl-accent) 82%, var(--cl-muted)); background: linear-gradient(180deg, transparent 28%, color-mix(in srgb, var(--cl-accent) 7%, var(--cl-surface)) 100%); box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--cl-accent) 34%, transparent); }
  .day-card__add span { opacity: 0; max-width: 100%; overflow: hidden; padding: 2px 6px; border-radius: 999px; background: color-mix(in srgb, var(--cl-surface) 90%, transparent); font-size: 8px; font-weight: var(--rst-fw-bold); text-overflow: ellipsis; white-space: nowrap; transform: translateY(2px); transition: opacity var(--cl-dur) var(--cl-ease), transform var(--cl-dur) var(--cl-ease); }
  .day-card__add:not(:disabled):hover span, .day-card__add:not(:disabled):focus-visible span { opacity: 1; transform: translateY(0); }
  .day-card__add:disabled { cursor: default; }

  .day-card__content { position: absolute; z-index: 2; inset: 0; display: grid; align-content: center; gap: 2px; min-width: 0; padding: 5px 7px; pointer-events: none; }
  .day-card__top { display: grid; grid-template-columns: minmax(0, 1fr) auto 13px; align-items: center; gap: 4px; min-width: 0; }
  .day-card__top strong { overflow: hidden; color: color-mix(in srgb, var(--cl-ink) 86%, #475569); font-size: 11px; font-weight: var(--rst-fw-bold); font-variant-numeric: tabular-nums; text-overflow: ellipsis; white-space: nowrap; }
  .day-card__metrics { display: inline-flex; align-items: center; gap: 4px; min-width: 0; color: color-mix(in srgb, var(--cl-ink) 64%, var(--cl-muted)); font-size: 8px; font-variant-numeric: tabular-nums; line-height: 1; white-space: nowrap; }
  .day-card__metrics b { font-weight: var(--rst-fw-bold); }
  .day-card__break { display: inline-flex; align-items: center; gap: 3px; min-width: 0; overflow: hidden; color: color-mix(in srgb, var(--cl-ink) 58%, var(--cl-muted)); font-size: 8px; font-variant-numeric: tabular-nums; line-height: 1; white-space: nowrap; }
  .day-card__break b { overflow: hidden; font-weight: var(--rst-fw-medium); text-overflow: ellipsis; }
  .day-card__break.is-empty { color: var(--cl-muted); }
  .day-card__coffee { font-size: 8px; line-height: 1; filter: grayscale(1); }
  .day-card__status-slot { width: 13px; height: 13px; }
  .day-card__conflict-dot { width: 13px; height: 13px; display: grid; place-items: center; border: 1px solid color-mix(in srgb, var(--cl-problem) 76%, white); border-radius: 3px; background: var(--cl-problem); color: white; font-size: 8px; font-weight: var(--rst-fw-bold); line-height: 1; box-shadow: 0 1px 3px color-mix(in srgb, var(--cl-problem) 26%, transparent); pointer-events: none; }
  .day-card__services { display: grid; gap: 1px; min-width: 0; }
  .day-card__service-row { display: grid; grid-template-columns: 11px minmax(0, 1fr) auto; align-items: center; gap: 4px; min-width: 0; line-height: 1.15; }
  .day-card__service-icon { color: color-mix(in srgb, var(--cl-muted) 76%, var(--cl-ink)); font-size: 9px; text-align: center; }
  .day-card__service-row.is-lunch .day-card__service-icon,
  .day-card__service-row.is-lunch b { color: color-mix(in srgb, var(--lunch-color) 76%, var(--cl-ink)); }
  .day-card__service-row.is-evening .day-card__service-icon,
  .day-card__service-row.is-evening b { color: color-mix(in srgb, var(--evening-color) 76%, var(--cl-ink)); }
  .day-card__service-name { display: flex; align-items: baseline; gap: 3px; min-width: 0; overflow: hidden; white-space: nowrap; }
  .day-card__service-row b, .day-card__service-row small, .day-card__service-row em { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .day-card__service-row b { color: color-mix(in srgb, var(--cl-ink) 82%, #475569); font-size: 9px; font-weight: var(--rst-fw-bold); }
  .day-card__service-row small { color: var(--cl-muted); font-size: 8px; font-weight: var(--rst-fw-medium); }
  .day-card__service-row em { color: var(--cl-muted); font-size: 8px; font-style: normal; font-variant-numeric: tabular-nums; }
  .day-card__service-row.is-empty b,
  .day-card__service-row.is-empty small,
  .day-card__service-row.is-empty em { color: color-mix(in srgb, var(--cl-muted) 78%, var(--cl-line-strong)); font-weight: var(--rst-fw-regular); }

  .day-card.is-conflict { border-color: color-mix(in srgb, var(--cl-problem) 76%, var(--cl-line-strong)); box-shadow: 0 0 0 1px color-mix(in srgb, var(--cl-problem) 18%, transparent), 0 4px 10px color-mix(in srgb, var(--cl-problem) 10%, transparent); }
  .day-card.is-published-conflict { border-color: var(--cl-problem); box-shadow: 0 0 0 1px color-mix(in srgb, var(--cl-problem) 22%, transparent), 0 4px 12px color-mix(in srgb, var(--cl-problem) 13%, transparent); }


  .legend { display: flex; flex-wrap: wrap; align-items: center; gap: 14px; padding: 10px 2px 0; color: var(--cl-muted); font-size: 11px; }
  .legend > span { display: inline-flex; align-items: center; gap: 6px; }
  .legend i { width: 12px; height: 12px; border: 1px solid var(--cl-line); border-radius: 3px; background: var(--cl-surface-muted); }
  .legend i.is-available { border-color: color-mix(in srgb, var(--cl-ok) 22%, var(--cl-line)); background: color-mix(in srgb, var(--cl-ok) 12%, var(--cl-surface)); }
  .legend i.is-area { border-left: 3px solid var(--cl-info); background: var(--cl-info-wash); }
  .legend i.is-conflict { border-color: var(--cl-problem-line); box-shadow: inset 0 0 0 1px var(--cl-problem); }
  .legend i.is-absence { background: repeating-linear-gradient(-45deg, var(--cl-surface-muted), var(--cl-surface-muted) 3px, var(--cl-surface) 3px, var(--cl-surface) 6px); }
  .legend__hint { margin-left: auto; }

  .draft-save { position: sticky; z-index: 30; bottom: 14px; justify-self: end; display: flex; align-items: center; gap: 7px; margin-top: -38px; margin-right: 12px; padding: 6px; border: 1px solid var(--cl-line-strong); border-radius: 8px; background: color-mix(in srgb, var(--cl-surface) 94%, transparent); box-shadow: 0 10px 28px rgb(0 0 0 / .14); backdrop-filter: blur(8px); }
  .draft-save > span { display: inline-flex; align-items: center; gap: 6px; padding: 0 5px; color: var(--cl-attention); font-size: 11px; font-weight: var(--rst-fw-bold); }
  .draft-save > span i { width: 6px; height: 6px; border-radius: 50%; background: var(--cl-attention); }

  .publish-review { display: grid; gap: 16px; padding: 16px; }
  .publish-review__stats { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px; }
  .publish-review__stats span { display: grid; gap: 4px; padding: 12px; border: 1px solid var(--cl-line); border-radius: 6px; background: var(--cl-surface-muted); color: var(--cl-muted); font-size: 11px; }
  .publish-review__stats b { color: var(--cl-ink); font-size: 20px; }
  .publish-review p { margin: 0; color: var(--cl-muted); font-size: 13px; line-height: 1.55; }
  .publish-review__actions { display: flex; justify-content: flex-end; gap: 8px; }

  @media (max-width: 980px) {
    .schedule-head { grid-template-columns: 1fr auto; }
    .week-nav { grid-column: 1 / -1; grid-row: 1; }
    .schedule-head__left { grid-row: 2; }
    .schedule-head__right { grid-row: 2; }
    .schedule-wrap { max-height: none; }
  }
  @media (max-width: 520px) {
    .schedule-head { display: flex; flex-wrap: wrap; justify-content: center; }
    .schedule-head__left, .schedule-head__right { justify-self: auto; }
    .week-nav { order: -1; width: 100%; }
    .publish-review__stats { grid-template-columns: 1fr; }
    .legend__hint { width: 100%; margin-left: 0; }
  }
</style>
