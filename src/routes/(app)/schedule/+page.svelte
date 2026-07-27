<script lang="ts">
  import { onMount } from 'svelte';
  import {
    addDays,
    clockLabel,
    clockMinutes,
    formatHours,
    hoursBetweenClocks,
    mondayFor,
    todayInTimezone,
    weekLabel,
    type ServiceKey
  } from '$lib/calendar/date';
  import Dialog from '$lib/components/Dialog.svelte';
  import { friendlyError } from '$lib/api/error-messages';
  import { i18n, t } from '$lib/i18n/i18n.svelte';
  import { confirmAction } from '$lib/ui/confirm.svelte';
  import { toasts } from '$lib/ui/toast.svelte';
  import { workspace } from '$lib/workspace/workspace.svelte';
  import ScheduleSlotEditor from '$lib/schedule/ScheduleSlotEditor.svelte';
  import {
    exceptionForSlot,
    discardPrivateScheduleDraft,
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
    planningContractOverages,
    planningNotesForWeek,
    planningOperationalWarnings,
    planningOverlapKeys,
    planningOverlaps,
    type PlanningGridSlot,
    type PlanningOperationalWarningKind,
    type PlanningShiftDraft
  } from '$lib/schedule/schedule-model';
  import { buildAreaColorMap, buildEmployeeColorMap } from '$lib/ui/position-color';
  import { personInitials } from '$lib/ui/person';
  import { restaurantWeather } from '$lib/weather/restaurant-weather.svelte';
  import { weatherCondition } from '$lib/weather/weather';
  import WeatherIcon from '$lib/weather/WeatherIcon.svelte';
  import ClassicPage from '$lib/classic/ClassicPage.svelte';
  import ClassicScheduleWeek from '$lib/classic/ClassicScheduleWeek.svelte';
  import ClassicPrimaryColMenu from '$lib/classic/ClassicPrimaryColMenu.svelte';
  import ClassicGroupRow from '$lib/classic/ClassicGroupRow.svelte';
  import ClassicServiceIcon from '$lib/classic/ClassicServiceIcon.svelte';
  import {
    scheduleDraft,
    type ScheduleRowPlacement
  } from '$lib/classic/classic-schedule.svelte';
  import { downloadCsv } from '$lib/export/csv';
  import { planningCsv } from '$lib/schedule/schedule-export';
  import { DEFAULT_PLANNING_EXPORT_COLUMNS } from '$lib/schedule/schedule-export-columns';
  import { getReservationDemand } from '$lib/reservations/reservation-api';
  import type { ReservationDemand } from '$lib/reservations/reservation-types';
  import WorkspaceAreaIcon from '$lib/restaurant/WorkspaceAreaIcon.svelte';
  import { workspaceAreaByKey } from '$lib/restaurant/workspace-catalogue';
  import { areaInstanceLabelMap } from '$lib/restaurant/area-instance';

  type GroupMode = 'none' | 'contract' | 'position' | 'area' | 'status';
  type PlanningGrid = ReturnType<typeof buildPlanningWeek>;
  type PlanningRow = PlanningGrid['rows'][number];
  type RowGroup = {
    key: string;
    label: string;
    rows: PlanningRow[];
    hours: number;
    color: string;
    icon: string;
  };
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
    icon: string;
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
    breakValue: string;
    hasBreak: boolean;
    estimatedCost: string;
    shifts: DayShiftView[];
  };
  type ContractOverage = {
    employeeId: string;
    employeeName: string;
    planned: number;
    target: number;
    excess: number;
  };

  const SERVICES: ServiceKey[] = ['lunch', 'evening'];

  const snapshot = $derived(workspace.operations);
  const canViewFinancials = $derived(workspace.canViewFinancials);
  const weatherLocation = $derived(
    snapshot
      ? {
          city: snapshot.restaurant.city ?? '',
          postalCode: snapshot.restaurant.postal_code ?? '',
          countryCode: snapshot.restaurant.country_code,
          timezone: snapshot.restaurant_settings.timezone ?? undefined
        }
      : null
  );
  const employeeColor = $derived(
    snapshot
      ? buildEmployeeColorMap(snapshot.job_functions, snapshot.employee_job_functions, snapshot.work_areas)
      : new Map<string, string>()
  );
  const areaColor = $derived(
    snapshot ? buildAreaColorMap(snapshot.work_areas) : new Map<string, string>()
  );
  const areaName = $derived(
    areaInstanceLabelMap(snapshot?.work_areas ?? [])
  );
  const areaIcon = $derived(
    new Map(
      (snapshot?.work_areas ?? []).map((area) => [
        area.id,
        area.icon_key || workspaceAreaByKey.get(area.catalogue_key ?? '')?.icon || ''
      ])
    )
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
  const employeeName = $derived(
    new Map(
      (snapshot?.employees ?? []).map((employee) => [
        employee.id,
        employee.display_name || t('Employee')
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
  let compactCards = $state(false);
  let reservationDemand = $state<ReservationDemand[]>([]);
  let demandRequestId = 0;

  onMount(() => {
    try {
      const storedGroup = localStorage.getItem('rst-schedule-group');
      groupMode =
        storedGroup === 'contract' ||
        storedGroup === 'position' ||
        storedGroup === 'area' ||
        storedGroup === 'status'
          ? storedGroup
          : 'none';
      compactCards = localStorage.getItem('rst-schedule-card-density') === 'compact';
    } catch {
      groupMode = 'none';
      compactCards = false;
    }
  });

  $effect(() => {
    if (weatherLocation?.city) void restaurantWeather.load(weatherLocation);
  });

  const planningTimezone = $derived(
    snapshot?.restaurant_settings.timezone ||
      workspace.bootstrap?.restaurant_settings.timezone ||
      'Europe/Brussels'
  );
  const demandWeekStart = $derived(
    addDays(
      mondayFor(todayInTimezone(planningTimezone)),
      scheduleDraft.weekOffset * 7
    )
  );
  const reservationDemandByDay = $derived.by(() => {
    const map = new Map<string, number>();
    for (const row of reservationDemand) {
      map.set(
        row.business_date,
        (map.get(row.business_date) ?? 0) + Number(row.expected_covers)
      );
    }
    return map;
  });

  $effect(() => {
    const restaurantId = workspace.activeId;
    const from = demandWeekStart;
    if (!restaurantId || !from || workspace.isPreview) {
      reservationDemand = [];
      return;
    }
    const current = ++demandRequestId;
    void getReservationDemand(restaurantId, from, addDays(from, 6))
      .then((rows) => {
        if (current === demandRequestId) reservationDemand = rows;
      })
      .catch(() => {
        if (current === demandRequestId) reservationDemand = [];
      });
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

  function toggleCardDensity(): void {
    compactCards = !compactCards;
    try {
      localStorage.setItem('rst-schedule-card-density', compactCards ? 'compact' : 'detailed');
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
    return employeeHoursIn(scheduleDraft.shifts, employeeId);
  }

  function employeeHoursIn(shifts: PlanningShiftDraft[], employeeId: string): number {
    return shifts
      .filter((shift) => shift.employeeId === employeeId)
      .reduce((total, shift) => total + hoursBetweenClocks(shift.startsAt, shift.endsAt), 0);
  }

  function hasEmployeeConflict(grid: PlanningGrid, employeeId: string): boolean {
    const overlapKeys = planningOverlapKeys(scheduleDraft.shifts);
    const target = contractHours.get(employeeId) ?? 0;
    if (target > 0 && employeeHours(employeeId) > target) return true;
    return [...grid.slotsByKey.values()].some(
      (slot) =>
        slot.employeeId === employeeId &&
        (slot.truth.state === 'conflict' || (slot.shift && overlapKeys.has(draftKey(slot.shift))))
    );
  }

  function placementForRow(row: PlanningRow, grid: PlanningGrid): ScheduleRowPlacement {
    const positionId = employeePosition.get(row.id) ?? '';
    const linkedPositionAreaId = positionId
      ? (snapshot?.job_function_areas ?? [])
          .filter((link) => link.active && link.job_function_id === positionId)
          .toSorted((left, right) => Number(right.is_primary) - Number(left.is_primary))[0]?.area_id ?? null
      : null;
    const areaId = employeeAreaId(row.id);
    const planned = employeeHours(row.id);
    const target = contractHours.get(row.id) ?? 0;
    const conflict = hasEmployeeConflict(grid, row.id);
    const statusLabel =
      employeeActive.get(row.id) === false
        ? t('Archived')
        : conflict
          ? t('Conflict')
          : planned <= 0
            ? t('Unplanned')
            : target > 0 && planned >= target
              ? t('Complete')
              : t('Planned');

    return scheduleDraft.placement({
      id: row.id,
      conflict,
      contractLabel:
        contractTypeName.get(employeeContract.get(row.id) ?? '') ?? t('No contract'),
      positionLabel: positionName.get(positionId) ?? t('No position'),
      positionAreaId: linkedPositionAreaId,
      areaLabel: employeeAreaLabel(row.id),
      areaId,
      statusLabel
    });
  }

  function visibleRows(grid: PlanningGrid): PlanningRow[] {
    const needle = search.trim().toLocaleLowerCase(i18n.intlLocale);
    const rows = grid.rows.filter((row) => {
      const placement = placementForRow(row, grid);
      if (needle && !`${row.name} ${row.meta}`.toLocaleLowerCase(i18n.intlLocale).includes(needle)) {
        return false;
      }
      if (positionId && employeePosition.get(row.id) !== positionId) return false;
      if (onlyConflicts && !placement.conflict) return false;
      return true;
    });
    if (!employeeSort) return rows;
    const factor = employeeSort === 'desc' ? -1 : 1;
    return [...rows].sort((left, right) => factor * left.name.localeCompare(right.name, i18n.intlLocale));
  }

  function employeeAreaId(employeeId: string): string | null {
    const scheduledAreas = new Set(
      scheduleDraft.shifts
        .filter((shift) => shift.employeeId === employeeId && shift.areaId)
        .map((shift) => shift.areaId)
    );
    if (scheduledAreas.size === 1) return [...scheduledAreas][0];
    if (scheduledAreas.size > 1) return null;

    const primaryPosition = employeePosition.get(employeeId);
    const linkedAreas = (snapshot?.job_function_areas ?? [])
      .filter((link) => link.active && link.job_function_id === primaryPosition)
      .toSorted((left, right) => Number(right.is_primary) - Number(left.is_primary));
    if (linkedAreas[0]?.area_id) return linkedAreas[0].area_id;

    return (snapshot?.coverage_requirements ?? [])
      .find((requirement) => requirement.active && requirement.job_function_id === primaryPosition)
      ?.area_id ?? null;
  }

  function employeeAreaLabel(employeeId: string): string {
    const scheduledAreaIds = new Set(
      scheduleDraft.shifts
        .filter((shift) => shift.employeeId === employeeId && shift.areaId)
        .map((shift) => shift.areaId)
    );
    if (scheduledAreaIds.size > 1) return t('Multiple areas');
    const areaId = employeeAreaId(employeeId);
    return areaId ? areaName.get(areaId) ?? t('No area') : t('No area');
  }

  function groupLabel(row: PlanningRow, grid: PlanningGrid): string {
    const placement = placementForRow(row, grid);
    if (groupMode === 'contract') return placement.contractLabel;
    if (groupMode === 'position') return placement.positionLabel;
    if (groupMode === 'area') return placement.areaLabel;
    if (groupMode === 'status') return placement.statusLabel;
    return '';
  }

  function groupedRows(grid: PlanningGrid): RowGroup[] {
    const rows = visibleRows(grid);
    if (groupMode === 'none') {
      return [{
        key: 'all',
        label: '',
        rows,
        hours: rows.reduce((total, row) => total + employeeHours(row.id), 0),
        color: '',
        icon: ''
      }];
    }
    const groups = new Map<string, PlanningRow[]>();
    for (const row of rows) {
      const label = groupLabel(row, grid);
      groups.set(label, [...(groups.get(label) ?? []), row]);
    }
    return [...groups.entries()]
      .sort(([left], [right]) => left.localeCompare(right, i18n.intlLocale))
      .map(([label, groupRows]) => {
        const firstPlacement = groupRows[0]
          ? placementForRow(groupRows[0], grid)
          : null;
        const groupAreaId = groupMode === 'area'
          ? firstPlacement?.areaId ?? null
          : groupMode === 'position'
            ? firstPlacement?.positionAreaId ?? null
            : null;
        return {
          key: `${groupMode}:${label}`,
          label,
          rows: groupRows,
          hours: groupRows.reduce((total, row) => total + employeeHours(row.id), 0),
          color: groupAreaId ? areaColor.get(groupAreaId) ?? '' : '',
          icon: groupAreaId ? areaIcon.get(groupAreaId) ?? '' : ''
        };
      });
  }

  function toggleGroup(key: string): void {
    collapsedGroups = collapsedGroups.includes(key)
      ? collapsedGroups.filter((item) => item !== key)
      : [...collapsedGroups, key];
  }

  function contractOverages(shifts: PlanningShiftDraft[]): ContractOverage[] {
    return planningContractOverages(shifts, contractHours).map((overage) => ({
      ...overage,
      employeeName: employeeName.get(overage.employeeId) ?? t('Employee')
    }));
  }

  async function replaceDraftWithHoursGuard(next: PlanningShiftDraft[]): Promise<boolean> {
    const currentHours = new Map(
      [...new Set(scheduleDraft.shifts.map((shift) => shift.employeeId))]
        .map((employeeId) => [employeeId, employeeHoursIn(scheduleDraft.shifts, employeeId)])
    );
    const newlyIncreasedOverages = contractOverages(next).filter(
      (overage) => overage.planned > (currentHours.get(overage.employeeId) ?? 0)
    );

    if (newlyIncreasedOverages.length) {
      const first = newlyIncreasedOverages[0];
      const confirmed = await confirmAction({
        title: t(newlyIncreasedOverages.length === 1
          ? 'Exceed contracted hours?'
          : 'Exceed contracted hours for multiple employees?'),
        body: newlyIncreasedOverages.length === 1
          ? t('{name} would have {planned} planned against {target} contracted ({excess} over). The schedule can continue, but this employee will be marked as an hours conflict.', {
              name: first.employeeName,
              planned: formatHours(first.planned),
              target: formatHours(first.target),
              excess: formatHours(first.excess)
            })
          : t('{count} employees would exceed their contracted weekly hours: {names}. The schedule can continue, but each overage will be marked as a conflict.', {
              count: newlyIncreasedOverages.length,
              names: newlyIncreasedOverages
                .slice(0, 3)
                .map((item) => `${item.employeeName} (+${formatHours(item.excess)})`)
                .join(', ')
            }),
        confirmLabel: t('Plan anyway'),
        cancelLabel: t('Keep within contract'),
        tone: 'danger'
      });
      if (!confirmed) return false;
    }

    scheduleDraft.replace(next);
    return true;
  }

  async function copyPreviousWeek(weekStart: string): Promise<void> {
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

    if (!copied.length) {
      toasts.show(t('The previous week has no shifts to copy.'), 'warning');
      return;
    }

    const occupied = new Set(scheduleDraft.shifts.map(draftKey));
    const additions = copied.filter((shift) => !occupied.has(draftKey(shift)));
    const noteKeys = new Set(scheduleDraft.notes.map((note) => `${note.weekday}|${note.serviceKey}`));
    const copiedNotes = planningNotesForWeek(snapshot, previousWeek)
      .filter((note) => !noteKeys.has(`${note.weekday}|${note.serviceKey}`));
    const existingCount = scheduleDraft.shifts.length;
    const confirmed = await confirmAction({
      title: t('Copy previous week?'),
      body: existingCount
        ? t(additions.length === 1
          ? '{source} has {count} shifts. {added} empty slot will be filled in {target}; your {existing} existing shifts will stay unchanged.'
          : '{source} has {count} shifts. {added} empty slots will be filled in {target}; your {existing} existing shifts will stay unchanged.', {
            source: weekLabel(previousWeek, i18n.intlLocale),
            count: copied.length,
            added: additions.length,
            target: weekLabel(weekStart, i18n.intlLocale),
            existing: existingCount
          })
        : t('{count} shifts from {source} will be added to {target} as a private draft.', {
            count: copied.length,
            source: weekLabel(previousWeek, i18n.intlLocale),
            target: weekLabel(weekStart, i18n.intlLocale)
          }),
      confirmLabel: t('Copy shifts'),
      cancelLabel: t('Cancel'),
      tone: 'primary'
    });
    if (!confirmed) return;

    if (additions.length) {
      const applied = await replaceDraftWithHoursGuard([...scheduleDraft.shifts, ...additions]);
      if (!applied) return;
    }
    if (copiedNotes.length) scheduleDraft.replaceNotes([...scheduleDraft.notes, ...copiedNotes]);
    toasts.show(
      additions.length
        ? t('{count} shifts copied from the previous week.', { count: additions.length })
        : copiedNotes.length
          ? t('Weekly notes copied; all matching shift slots were already filled.')
          : t('All matching slots already contain shifts. Nothing was changed.'),
      additions.length || copiedNotes.length ? 'success' : 'warning'
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
        icon: areaIcon.get(slot.shift.areaId) ?? '',
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
    let breakValue = '—';
    let hasBreak = false;

    if (ordered.length > 1) {
      const firstStart = clockMinutes(first.startsAt) ?? 0;
      let firstEnd = clockMinutes(first.endsAt) ?? firstStart;
      let nextStart = clockMinutes(ordered[1].startsAt) ?? firstEnd;
      if (firstEnd <= firstStart) firstEnd += 24 * 60;
      while (nextStart < firstStart) nextStart += 24 * 60;
      if (nextStart > firstEnd) {
        breakValue = formatHours((nextStart - firstEnd) / 60);
        breakLabel = t('{hours} break', { hours: breakValue });
        hasBreak = true;
      }
    }

    return {
      timeLabel: ordered.length === 1
        ? first.label
        : `${clockLabel(first.startsAt)}–${clockLabel(last.endsAt)}`,
      hours: formatHours(totalHours),
      breakLabel,
      breakValue,
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

  async function quickPlan(grid: PlanningGrid, employeeId: string, date: string, service: ServiceKey): Promise<void> {
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
    await replaceDraftWithHoursGuard([...scheduleDraft.shifts, next]);
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

  async function dropShift(
    grid: PlanningGrid,
    employeeId: string,
    date: string,
    service: ServiceKey,
    today: string
  ): Promise<void> {
    if (!snapshot || !canDrop(grid, employeeId, date, service, today)) return;
    const source = grid.slotsByKey.get(draggingKey);
    const target = grid.slotsByKey.get(slotKey(employeeId, date, service));
    if (!source?.shift || !target) return;
    const defaults = defaultPlanningShift(snapshot, target);
    const next = scheduleDraft.shifts.map((shift) =>
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
      );
    if (!await replaceDraftWithHoursGuard(next)) {
      draggingKey = '';
      dropKey = '';
      return;
    }
    draggingKey = '';
    dropKey = '';
  }

  async function persistDraft(
    weekStart: string,
    revision: number,
    wasPublished: boolean
  ): Promise<void> {
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
        wasPublished
      });
      scheduleDraft.settle();
      toasts.show(
        t(wasPublished ? 'Private schedule draft saved.' : 'Schedule saved.'),
        'success'
      );
    } catch (error) {
      toasts.show(friendlyError(error), 'danger');
    } finally {
      saving = false;
      scheduleDraft.saving = false;
    }
  }

  async function discardSavedDraft(weekStart: string, revision: number): Promise<void> {
    if (!workspace.activeId || saving || scheduleDraft.saving) return;
    const confirmed = await confirmAction({
      title: t('Discard private schedule draft?'),
      body: t('The last published schedule stays visible to employees. Your unpublished changes will be removed.'),
      confirmLabel: t('Discard draft')
    });
    if (!confirmed) return;
    saving = true;
    scheduleDraft.saving = true;
    try {
      await discardPrivateScheduleDraft({
        restaurantId: workspace.activeId,
        weekStart,
        expectedRevision: revision
      });
      scheduleDraft.settle();
      toasts.show(t('Private schedule draft discarded.'), 'success');
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

  function operationalWarningLabel(kind: PlanningOperationalWarningKind): string {
    if (kind === 'missing_area') return t('Missing area');
    if (kind === 'inactive_area') return t('Archived area');
    if (kind === 'missing_position') return t('Missing position');
    if (kind === 'inactive_position') return t('Archived position');
    if (kind === 'unassigned_position') return t('Position not assigned to employee');
    return t('Closed service');
  }

  function operationalWarningCounts(
    warnings: ReturnType<typeof planningOperationalWarnings>
  ): Array<[PlanningOperationalWarningKind, number]> {
    const counts = new Map<PlanningOperationalWarningKind, number>();
    for (const warning of warnings) {
      counts.set(warning.kind, (counts.get(warning.kind) ?? 0) + 1);
    }
    return [...counts];
  }

  async function publishWeek(
    weekStart: string,
    revision: number,
    wasPublished: boolean,
    conflictCount: number,
    operationalWarningCount: number
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
        allowConflicts: conflictCount > 0,
        operationalWarningCount
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
    const operationalWarnings = snapshot
      ? planningOperationalWarnings(snapshot, scheduleDraft.shifts)
      : [];
    const pending = pendingRequestCount(grid);
    if (
      gaps.length ||
      conflicts.length ||
      operationalWarnings.length ||
      pending ||
      contractOverages(scheduleDraft.shifts).length
    ) {
      showPublishConfirm = true;
      return;
    }
    void publishWeek(weekStart, revision, wasPublished, conflicts.length, 0);
  }

  function openWeekPicker(): void {
    if (!weekPicker) return;
    const picker = weekPicker as HTMLInputElement & { showPicker?: () => void };
    if (typeof picker.showPicker === 'function') picker.showPicker();
    else picker.click();
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
            draft: scheduleDraft.shifts,
            placementDraft: scheduleDraft.placementShifts
          })
        : null}
      {@const selectedSlot = grid?.slotsByKey.get(selectedKey) ?? null}

      {#if grid}
        {@const groups = groupedRows(grid)}
        {@const totalEmployeeIds = new Set(grid.rows.filter((row) => employeeActive.get(row.id) !== false).map((row) => row.id))}
        {@const weekEntries = scheduleDraft.shifts.filter((shift) => totalEmployeeIds.has(shift.employeeId))}
        {@const plannedEmployeeIds = new Set(weekEntries.map((shift) => shift.employeeId))}
        {@const weekHours = weekEntries.reduce((sum, shift) => sum + hoursBetweenClocks(shift.startsAt, shift.endsAt), 0)}
        {@const weekCost = shiftsCost(weekEntries)}
        {@const publishGaps = snapshot ? coverageIssues(snapshot, scheduleDraft.shifts, week.weekStart) : []}
        {@const publishConflicts = snapshot ? planningConflicts(snapshot, scheduleDraft.shifts, week.weekStart) : []}
        {@const publishOperationalWarnings = snapshot ? planningOperationalWarnings(snapshot, scheduleDraft.shifts) : []}
        {@const publishOperationalGroups = operationalWarningCounts(publishOperationalWarnings)}
        {@const publishPending = pendingRequestCount(grid)}
        {@const publishContractOverages = contractOverages(scheduleDraft.shifts)}
        <section class="schedule-panel" class:is-compact={compactCards}>
          <header class="schedule-head">
            <div class="schedule-head__left">
              <label class="details-switch" title={t(compactCards ? 'Show detailed cards' : 'Show compact cards')}>
                <span>{t('Details')}</span>
                <input
                  type="checkbox"
                  role="switch"
                  checked={!compactCards}
                  aria-label={t('Show detailed planning information')}
                  onchange={toggleCardDensity}
                />
                <i aria-hidden="true"><b></b></i>
              </label>
            </div>

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
            </div>

            <div class="schedule-head__right">
              {#if scheduleDraft.dirty}
                <span class="cl-inline-save is-visible">
                  <span class="cl-inline-save__state"><i></i>{t('Unsaved changes')}</span>
                  <button
                    class="cl-btn is-icon"
                    type="button"
                    disabled={saving}
                    title={t('Discard')}
                    aria-label={t('Discard')}
                    onclick={() => snapshot && scheduleDraft.reset(snapshot, week.weekStart)}
                  >
                    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 12a8 8 0 1 0 2.3-5.7L4 8.6"/><path d="M4 4v4.6h4.6"/></svg>
                  </button>
                  <button
                    class="cl-btn is-primary"
                    type="button"
                    disabled={saving || !week.editable}
                    onclick={() => void persistDraft(week.weekStart, week.revision, week.published)}
                  >
                    {#if saving}
                      <span aria-hidden="true">…</span>
                    {:else}
                      <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" aria-hidden="true"><path d="M5 4h12l2 2v14H5z"/><path d="M8 4v6h8V4M8 20v-6h8v6"/></svg>
                    {/if}
                    <span>{t(saving ? 'Saving…' : 'Save draft')}</span>
                  </button>
                </span>
              {/if}
              {#if week.published && week.hasUnpublishedChanges && !scheduleDraft.dirty}
                <button
                  class="icon-btn"
                  type="button"
                  disabled={saving || !week.editable}
                  aria-label={t('Discard private draft')}
                  title={t('Discard private draft')}
                  onclick={() => void discardSavedDraft(week.weekStart, week.revision)}
                >
                  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 12a8 8 0 1 0 2.3-5.7L4 8.6"/><path d="M4 4v4.6h4.6"/></svg>
                </button>
              {/if}
              <button class="icon-btn" type="button" disabled={saving || !week.editable} aria-label={t('Copy previous week')} title={t('Copy previous week')} onclick={() => void copyPreviousWeek(week.weekStart)}>
                <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/></svg>
              </button>
              <button class="icon-btn" type="button" disabled={!snapshot} aria-label={t('Export CSV')} title={t('Export CSV')} onclick={() => exportWeek(week.weekStart)}>
                <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3v12M7 10l5 5 5-5"/><path d="M5 21h14"/></svg>
              </button>
              <button
                class="publish-btn"
                class:is-published={week.published && !scheduleDraft.dirty && !week.hasUnpublishedChanges}
                class:is-republish={week.published && (scheduleDraft.dirty || week.hasUnpublishedChanges)}
                type="button"
                disabled={publishing || !week.editable || (week.published && !scheduleDraft.dirty && !week.hasUnpublishedChanges)}
                onclick={() => requestPublish(grid, week.weekStart, week.revision, week.published)}
              >
                {#if publishing}
                  {t('Publishing…')}
                {:else if week.published && (scheduleDraft.dirty || week.hasUnpublishedChanges)}
                  {t('Republish')}
                {:else if week.published}
                  <span class="publish-btn__dot"></span>{t('Published')}
                {:else}
                  {t('Publish')}
                {/if}
              </button>
            </div>
          </header>

          {#if week.published && (scheduleDraft.dirty || week.hasUnpublishedChanges)}
            <div class="republish-note">
              {t(
                scheduleDraft.dirty
                  ? 'Your changes are private until you save and republish this week.'
                  : 'Private draft saved. Employees still see the last published schedule.'
              )}
            </div>
          {/if}

          <div class="schedule-wrap">
            <table class="board">
              <thead>
                <tr>
                  <th class="board__staff has-menu" scope="col">
                    <ClassicPrimaryColMenu
                      label={`${plannedEmployeeIds.size}/${totalEmployeeIds.size}`}
                      labelIcon="people"
                      metaParts={
                        compactCards || !canViewFinancials
                          ? [formatHours(weekHours)]
                          : [formatHours(weekHours), weekCost > 0 ? `~${money(weekCost)}` : '—']
                      }
                      align="center"
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
                        { value: 'area', label: t('Area') },
                        { value: 'status', label: t('Status') }
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
                    {@const dayEmployees = new Set(dayEntries.map((shift) => shift.employeeId)).size}
                    {@const total = dayEntries.reduce((sum, shift) => sum + hoursBetweenClocks(shift.startsAt, shift.endsAt), 0)}
                    {@const totalCost = shiftsCost(dayEntries)}
                    {@const dayCovers = reservationDemandByDay.get(day.date) ?? 0}
                    {@const weather = restaurantWeather.dailyFor(day.date)}
                    <th class="board__day" scope="col" class:is-today={day.today} class:is-weekend={day.weekday >= 6}>
                      <div class="board__day-date"><b>{t(day.label)}</b> {Number(day.date.slice(-2))}</div>
                      <div class="board__day-lower">
                        <div class="board__day-stat board__day-operations">
                          <span class="board__day-signal">
                            <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="9" cy="8" r="3"/><path d="M3.5 19c.4-3.2 2.2-5 5.5-5s5.1 1.8 5.5 5M16 5.5a3 3 0 0 1 0 5.8M16 14c2.8.2 4.2 1.8 4.5 4.5"/></svg>
                            {dayEmployees}
                            {#if dayCovers}
                              <i class="board__day-separator"></i>
                              <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 17h14M7 17v-5a5 5 0 0 1 10 0v5M12 5v2M9.5 5h5"/></svg>
                              {dayCovers}
                            {/if}
                          </span>
                          <b class="board__day-metric">
                            {formatHours(total)}
                            {#if !compactCards && canViewFinancials}<i>·</i>{totalCost > 0 ? `~${money(totalCost)}` : '—'}{/if}
                          </b>
                        </div>
                        {#if weather}
                          <div
                            class="board__day-stat board__weather"
                            title={`${t(weatherCondition(weather.code))} · ${Math.round(weather.lowC)}–${Math.round(weather.highC)}°C · ${t('{chance}% rain', { chance: Math.round(weather.rainChance) })}`}
                          >
                            <span class="board__day-signal"><WeatherIcon code={weather.code} size={21} /></span>
                            <b class="board__day-metric board__weather-metric">
                              <span>{Math.round(weather.highC)}°</span>
                              <svg viewBox="0 0 16 16" width="8" height="8" fill="currentColor" aria-hidden="true"><path d="M8 1.2S3.4 6.5 3.4 10A4.6 4.6 0 0 0 8 14.6 4.6 4.6 0 0 0 12.6 10C12.6 6.5 8 1.2 8 1.2Z"/></svg>
                              <span>{Math.round(weather.rainChance)}%</span>
                            </b>
                          </div>
                        {:else}
                          <div class="board__day-stat board__weather is-unavailable" aria-label={t('Weather unavailable')}>
                            <span class="board__day-signal">—</span>
                            <b class="board__day-metric">—</b>
                          </div>
                        {/if}
                      </div>
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
                      {#snippet groupIcon()}
                        <WorkspaceAreaIcon icon={group.icon} color={group.color} size={13} compact />
                      {/snippet}
                      <ClassicGroupRow
                        colspan={grid.days.length + 1}
                        label={group.label}
                        meta={`${t('{count} employees', { count: group.rows.length })} · ${formatHours(group.hours)}`}
                        color={group.color}
                        icon={group.icon ? groupIcon : undefined}
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
                        {@const hoursState = target > 0 && planned > target ? 'over' : target > 0 && planned >= target ? 'complete' : 'under'}
                        {@const active = employeeActive.get(row.id) !== false}
                        <tr class:is-archived={!active} class:is-hours-over={hoursState === 'over'}>
                          <td class="board__staff">
                            <span class="staff">
                              <span class="cl-avatar" style="--avatar-color:{employeeColor.get(row.id) ?? 'var(--cl-muted)'}">{personInitials(row.name)}</span>
                              <span class="staff__id">
                                <span class="staff__name"><strong>{row.name}</strong>{#if !active}<em>{t('Archived')}</em>{/if}</span>
                                <span class="staff__hours is-{hoursState}">
                                  <span><b>{formatHours(planned)}</b>{#if target} / {formatHours(target)}{/if}</span>
                                  {#if hoursState === 'over'}<strong class="staff__overage" title={t('Contracted hours exceeded')}>+{formatHours(planned - target)}</strong>{/if}
                                  {#if !compactCards && canViewFinancials}<em>{plannedCost > 0 ? `~${money(plannedCost)}` : '—'}</em>{/if}
                                </span>
                                {#if target}<span class="staff__meter is-{hoursState}" aria-label={`${formatHours(planned)} / ${formatHours(target)}`}><i style={`width:${progress}%`}></i></span>{/if}
                              </span>
                            </span>
                          </td>
                          {#each row.cells as cell (cell.date)}
                            {@const shifts = dayShifts(grid, row.id, cell.date)}
                            {@const lunchShift = shifts.find((shift) => shift.service === 'lunch') ?? null}
                            {@const eveningShift = shifts.find((shift) => shift.service === 'evening') ?? null}
                            {@const spanningShift = shifts.length === 1 && shifts[0].spansDay ? shifts[0] : null}
                            {@const lunchColor = lunchShift?.color ?? spanningShift?.color ?? eveningShift?.color ?? 'var(--cl-muted)'}
                            {@const eveningColor = eveningShift?.color ?? spanningShift?.color ?? lunchShift?.color ?? 'var(--cl-muted)'}
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
                                    ondrop={(event) => { event.preventDefault(); void dropShift(grid, row.id, cell.date, service, week.today); }}
                                    onclick={() => void quickPlan(grid, row.id, cell.date, service)}
                                  >
                                    <span class="service-zone__cue"><ClassicServiceIcon {service} size={14} /></span>
                                    {#if label}<span class="service-zone__state">{label}</span>{/if}
                                  </button>
                                {/each}

                                {#if shifts.length}
                                  {@const card = dayCardView(shifts)}
                                  {@const compactSpan = card.shifts.find((shift) => shift.spansDay) ?? null}
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
                                            ondrop={(event) => { event.preventDefault(); void dropShift(grid, row.id, cell.date, service, week.today); }}
                                            onclick={() => void quickPlan(grid, row.id, cell.date, service)}
                                          ><span>+ {t(service === 'evening' ? 'Evening' : 'Lunch')}</span></button>
                                        {/if}
                                      {/each}
                                    {/if}

                                    <span class="day-card__content">
                                      <span class="day-card__top" class:has-conflict={dayConflict}>
                                        <strong>{card.timeLabel}</strong>
                                        {#if !compactCards}
                                          <span class="day-card__metrics">
                                            <b title={t('Planned hours')}>{card.hours}</b>
                                            {#if canViewFinancials}
                                              <i>·</i>
                                              <b title={t('Estimated cost')}>{card.estimatedCost ? `~${card.estimatedCost}` : '—'}</b>
                                            {/if}
                                          </span>
                                        {/if}
                                      </span>
                                      {#if dayConflict}
                                        <span
                                          class="day-card__conflict-dot"
                                          role="img"
                                          aria-label={t(dayOverlap ? 'Overlapping shifts' : 'Conflict')}
                                          title={t(dayOverlap ? 'Overlapping shifts' : 'Conflict')}
                                        ></span>
                                      {/if}
                                      {#if compactCards}
                                        <span class="day-card__compact-metrics">
                                          <span class="day-card__compact-break" title={card.breakLabel} class:is-empty={!card.hasBreak}><i><ClassicServiceIcon name="break" size={13} /></i>{card.breakValue}</span>
                                          <span class="day-card__compact-hours" title={t('Planned hours')}>
                                            <i>
                                              <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="8"/><path d="M12 7.5V12l3 1.8"/></svg>
                                            </i>
                                            <b>{card.hours}</b>
                                          </span>
                                        </span>
                                        <span class="day-card__compact-areas">
                                          {#if compactSpan}
                                            <span class="is-{compactSpan.service} is-span" title={`${t('Full day')} · ${compactSpan.area}`}>
                                              <i><ClassicServiceIcon name="span" size={12} /></i>
                                              <b>{compactSpan.area}</b>
                                            </span>
                                          {:else}
                                            {#each SERVICES as service (service)}
                                              {@const chip = card.shifts.find((shift) => shift.service === service)}
                                              {#if chip}
                                                <span class="is-{service}" title={`${t(service === 'evening' ? 'Evening' : 'Lunch')} · ${chip.area}`}>
                                                  <i><ClassicServiceIcon {service} size={12} /></i>
                                                  <b>{chip.area}</b>
                                                </span>
                                              {:else}
                                                <span class="is-{service} is-empty" aria-hidden="true"></span>
                                              {/if}
                                            {/each}
                                          {/if}
                                        </span>
                                      {:else}
                                        <span class="day-card__break" class:is-empty={!card.hasBreak}>
                                          <span class="day-card__coffee"><ClassicServiceIcon name="break" size={12} /></span>
                                          <b>{card.breakLabel}</b>
                                        </span>
                                        <span class="day-card__services">
                                          {#each SERVICES as service (service)}
                                            {@const chip = card.shifts.find((shift) => shift.service === service)}
                                            {#if chip}
                                              <span class="day-card__service-row is-{chip.service}">
                                                <span class="day-card__service-icon">{#if chip.spansDay}<ClassicServiceIcon name="span" size={11} />{:else}<ClassicServiceIcon service={chip.service} size={11} />{/if}</span>
                                                <span class="day-card__service-name">
                                                  {#if chip.icon}
                                                    <i class="day-card__area-icon">
                                                      <WorkspaceAreaIcon icon={chip.icon} color={chip.color} size={10} compact />
                                                    </i>
                                                  {:else}
                                                    <i class="day-card__area-dot" style={`--area-color:${chip.color}`}></i>
                                                  {/if}
                                                  <b>{chip.area}</b>
                                                  {#if chip.showPosition}<small>· {chip.position}</small>{/if}
                                                </span>
                                                <em>{chip.hours}{#if canViewFinancials && chip.estimatedCost} · ~{chip.estimatedCost}{/if}</em>
                                              </span>
                                            {:else}
                                              <span class="day-card__service-row is-{service} is-empty">
                                                <span class="day-card__service-icon"><ClassicServiceIcon {service} size={11} /></span>
                                                <span class="day-card__service-name">
                                                  <b>{t('No shift')}</b>
                                                </span>
                                                <em>—</em>
                                              </span>
                                            {/if}
                                          {/each}
                                        </span>
                                      {/if}
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
              <span><b>{publishContractOverages.length}</b>{t('Contract overages')}</span>
              <span><b>{publishOperationalWarnings.length}</b>{t('Setup warnings')}</span>
            </div>
            {#if publishOperationalWarnings.length}
              <div class="publish-review__warnings">
                {#each publishOperationalGroups as [kind, count]}
                  <span><b>{count}</b>{operationalWarningLabel(kind)}</span>
                {/each}
              </div>
            {/if}
            <p>{t('These points do not block publication. Employees will see the schedule exactly as shown after you confirm.')}</p>
            <div class="publish-review__actions">
              <button class="cl-btn" type="button" onclick={() => (showPublishConfirm = false)}>{t('Cancel')}</button>
              <button class="publish-btn" type="button" disabled={publishing} onclick={() => void publishWeek(week.weekStart, week.revision, week.published, publishConflicts.length, publishOperationalWarnings.length)}>{t(publishing ? 'Publishing…' : week.published ? 'Republish' : 'Publish')}</button>
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
        flush
        onclose={() => (selectedKey = '')}
      >
        {#if selectedSlot && snapshot && workspace.activeId}
          <ScheduleSlotEditor
            {snapshot}
            slot={selectedSlot}
            draft={scheduleDraft.shifts}
            notes={scheduleDraft.notes}
            editable={week.editable && selectedSlot.date >= week.today}
            onchange={(next) => void replaceDraftWithHoursGuard(next)}
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
        {#snippet footer()}
          <span class="shift-dialog__hint">{t('Draft editing')}</span>
          <button class="cl-btn is-primary" type="button" onclick={() => (selectedKey = '')}>{t('Done')}</button>
        {/snippet}
      </Dialog>
    {/snippet}
  </ClassicScheduleWeek>
</ClassicPage>

<style>
  .schedule-panel { position: relative; display: grid; gap: 0; }
  .schedule-head { position: relative; display: grid; grid-template-columns: minmax(180px, 1fr) auto minmax(250px, 1fr); align-items: center; gap: 18px; min-height: 54px; padding: 5px 0 7px; }
  .schedule-head__left { justify-self: start; display: flex; align-items: center; }
  .schedule-head__right { justify-self: end; display: flex; align-items: center; gap: 7px; }
  .schedule-head__right :global(.cl-inline-save) { min-width: 0; margin-right: 3px; }
  .schedule-head__right :global(.cl-inline-save__state) { font-size: 11px; }

  .week-nav { position: relative; display: flex; align-items: stretch; justify-content: center; gap: 0; overflow: hidden; border: 1px solid var(--cl-line-strong); border-radius: 6px; background: var(--cl-surface); box-shadow: 0 1px 2px rgb(15 23 42 / .035); }
  .week-nav__date { display: inline-flex; align-items: center; justify-content: center; gap: 7px; min-width: 176px; min-height: 34px; padding: 4px 12px; border: 0; border-right: 1px solid var(--cl-line); border-left: 1px solid var(--cl-line); border-radius: 0; background: var(--cl-surface); color: var(--cl-ink); font: inherit; font-size: 13px; font-weight: var(--rst-fw-bold); cursor: pointer; }
  .week-nav__date:hover { background: var(--cl-surface-muted); }
  .week-nav__date svg { color: var(--cl-muted); }
  .week-nav__picker { position: absolute; width: 1px; height: 1px; opacity: 0; pointer-events: none; }

  .icon-btn { display: grid; place-items: center; width: 34px; height: 34px; padding: 0; border: 1px solid var(--cl-line); border-radius: 6px; background: var(--cl-surface); color: var(--cl-muted); cursor: pointer; transition: border-color var(--cl-dur) var(--cl-ease), color var(--cl-dur) var(--cl-ease), background var(--cl-dur) var(--cl-ease); }
  .icon-btn:hover:not(:disabled) { border-color: var(--cl-line-strong); color: var(--cl-ink); background: var(--cl-surface-muted); }
  .icon-btn:disabled { opacity: .42; cursor: default; }
  .week-nav > .icon-btn { width: 34px; height: 34px; border: 0; border-radius: 0; background: var(--cl-surface); }
  .week-nav > .icon-btn:hover:not(:disabled) { border-color: transparent; color: var(--cl-ink); background: var(--cl-surface-muted); }
  .details-switch { display: inline-flex; align-items: center; gap: 8px; min-height: 30px; color: var(--cl-muted); font-size: 11.5px; font-weight: var(--rst-fw-bold); cursor: pointer; user-select: none; }
  .details-switch input { position: absolute; width: 1px; height: 1px; opacity: 0; pointer-events: none; }
  .details-switch > i { position: relative; width: 32px; height: 18px; flex: 0 0 auto; border: 1px solid var(--cl-line-strong); border-radius: 999px; background: var(--cl-surface-muted); box-shadow: inset 0 1px 2px rgb(15 23 42 / .06); transition: border-color var(--cl-dur) var(--cl-ease), background var(--cl-dur) var(--cl-ease); }
  .details-switch > i b { position: absolute; top: 2px; left: 2px; width: 12px; height: 12px; border-radius: 50%; background: var(--cl-muted); box-shadow: 0 1px 2px rgb(15 23 42 / .2); transition: transform var(--cl-dur) var(--cl-ease), background var(--cl-dur) var(--cl-ease); }
  .details-switch input:checked + i { border-color: color-mix(in srgb, var(--cl-accent) 54%, var(--cl-line)); background: color-mix(in srgb, var(--cl-accent) 18%, var(--cl-surface)); }
  .details-switch input:checked + i b { background: var(--cl-accent); transform: translateX(14px); }
  .details-switch:has(input:checked) { color: var(--cl-ink); }
  .details-switch:has(input:focus-visible) > i { outline: 2px solid color-mix(in srgb, var(--cl-accent) 28%, transparent); outline-offset: 2px; }
  .publish-btn { display: inline-flex; align-items: center; justify-content: center; gap: 7px; min-height: 36px; padding: 7px 15px; border: 1px solid var(--cl-accent); border-radius: 6px; background: var(--cl-accent); color: white; font: inherit; font-size: 13px; font-weight: var(--rst-fw-bold); cursor: pointer; }
  .publish-btn:hover:not(:disabled) { filter: brightness(.97); box-shadow: 0 4px 12px color-mix(in srgb, var(--cl-accent) 22%, transparent); }
  .publish-btn:disabled { cursor: default; }
  .publish-btn.is-published { border-color: var(--cl-ok-line); background: var(--cl-ok-wash); color: var(--cl-ok); opacity: 1; }
  .publish-btn.is-republish { border-color: var(--cl-accent); background: var(--cl-accent); }
  .publish-btn__dot { width: 7px; height: 7px; border-radius: 50%; background: var(--cl-ok); }
  .republish-note { justify-self: end; margin: -5px 2px 8px 0; color: var(--cl-attention); font-size: 11px; font-weight: var(--rst-fw-medium); }

  .schedule-wrap { max-height: calc(100vh - 188px); overflow: auto; border: 1px solid color-mix(in srgb, var(--cl-ink) 12%, var(--cl-line-strong)); border-radius: 5px; background: var(--cl-surface); box-shadow: 0 1px 2px rgb(0 0 0 / .035); }
  .board { width: 100%; min-width: 1270px; border-spacing: 0; table-layout: fixed; border-collapse: separate; color: var(--cl-ink); font-size: 13px; }
  .schedule-panel:not(.is-compact) .board { min-width: 1470px; }
  .board thead { position: sticky; top: 0; z-index: 8; }
  .board th { height: 72px; padding: 6px 10px; border-bottom: 1px solid color-mix(in srgb, var(--cl-accent) 65%, var(--cl-line)); background: var(--cl-thead); text-align: left; }
  .board th.has-menu { padding: 0; }
  thead .board__staff .colhead { min-height: 72px; }
  .board td { height: 96px; padding: 0; border-bottom: 1px solid color-mix(in srgb, var(--cl-ink) 14%, var(--cl-grid-line)); background: var(--cl-surface); background-clip: padding-box; vertical-align: middle; }
  .board__staff { position: sticky; left: 0; z-index: 4; width: 230px; border-right: 1px solid var(--cl-grid-line); background: var(--cl-surface) !important; }
  thead .board__staff { z-index: 10; background: var(--cl-thead) !important; }
  thead .board__staff :global(.cl-primary-head) { position: relative; }
  thead .board__staff :global(.cl-primary-head > .colhead) { width: 100%; padding-inline: 0; }
  thead .board__staff :global(.colhead__label) { justify-content: center; padding-inline: 0; }
  thead .board__staff :global(.colhead__copy) { width: auto; justify-items: center; }
  thead .board__staff :global(.colhead__meta) { width: auto; justify-content: center; }
  thead .board__staff :global(.colhead__copy > span) { font-size: 13px; line-height: 1.15; }
  thead .board__staff :global(.colhead__copy small) { font-size: 10.5px; line-height: 1.2; }
  thead .board__staff :global(.colhead__trigger) { position: absolute; top: 50%; right: 31px; transform: translateY(-50%); }
  thead .board__staff :global(.groupmenu) { position: absolute; top: 0; right: 0; bottom: 0; padding-right: 6px; }
  .board__day { border-left: 1px solid var(--cl-grid-line); text-align: center !important; }
  .board__day-date { color: var(--cl-ink); font-size: 12.5px; line-height: 1.1; letter-spacing: -.01em; text-align: center; white-space: nowrap; }
  .board__day-date b { font-weight: var(--rst-fw-bold); }
  .board__day-lower { min-height: 42px; display: grid; grid-template-columns: minmax(0, 1fr) minmax(52px, .72fr); align-items: stretch; gap: 0; margin-top: 4px; }
  .board__day-stat { min-width: 0; display: grid; grid-template-rows: 25px 13px; place-items: center; color: var(--cl-muted); font-size: 9px; font-variant-numeric: tabular-nums; line-height: 1; white-space: nowrap; }
  .board__weather { position: relative; padding-left: 7px; }
  .board__weather::before { content: ''; position: absolute; top: 5px; bottom: 4px; left: 0; width: 1px; background: color-mix(in srgb, var(--cl-grid-line) 82%, transparent); }
  .board__day-signal { min-width: 0; max-width: 100%; display: inline-flex; align-items: center; justify-content: center; gap: 3px; overflow: hidden; text-overflow: ellipsis; }
  .board__day-signal > svg { flex: 0 0 auto; }
  .board__day-separator { width: 1px; height: 9px; margin-inline: 1px; background: var(--cl-line-strong); }
  .board__day-metric { min-width: 0; display: inline-flex; align-items: center; justify-content: center; gap: 3px; overflow: hidden; color: color-mix(in srgb, var(--cl-ink) 82%, var(--cl-muted)); font-size: 9.5px; font-weight: var(--rst-fw-bold); text-overflow: ellipsis; }
  .board__day-metric i { margin: 0 1px; color: var(--cl-line-strong); font-style: normal; }
  .board__weather-metric svg { color: #3287b8; }
  .board__weather.is-unavailable { opacity: .5; }
  .board__day.is-today { color: var(--cl-accent); background: var(--cl-accent-wash); }
  .board__day.is-weekend:not(.is-today) { background: color-mix(in srgb, var(--cl-surface-muted) 58%, var(--cl-thead)); }
  .board__cell { position: relative; border-left: 1px solid var(--cl-grid-line); }
  .board__cell.is-past { background: color-mix(in srgb, var(--cl-surface-muted) 68%, var(--cl-surface)); }
  .board__cell.is-drop-target { box-shadow: inset 0 0 0 2px color-mix(in srgb, var(--cl-ok) 62%, transparent); }
  tr.is-archived { opacity: .72; }



  .staff { display: flex; align-items: center; gap: 10px; padding: 10px 14px; }
  .staff__id { display: grid; gap: 3px; min-width: 0; flex: 1; }
  .staff__name { display: flex; align-items: center; gap: 7px; min-width: 0; }
  .staff__name strong { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 13px; font-weight: var(--rst-fw-bold); }
  .staff__name em { padding: 2px 5px; border: 1px solid var(--cl-line); border-radius: 999px; color: var(--cl-muted); font-size: 9px; font-style: normal; text-transform: uppercase; }
  .staff__hours { display: flex; align-items: baseline; justify-content: flex-start; gap: 5px; color: var(--cl-muted); font-size: 11px; font-variant-numeric: tabular-nums; }
  .staff__hours b { color: var(--cl-ink); }
  .staff__hours em { flex: 0 0 auto; color: color-mix(in srgb, var(--cl-accent) 64%, var(--cl-muted)); font-size: 10px; font-style: normal; font-weight: var(--rst-fw-medium); }
  .staff__hours em::before { content: '·'; margin-right: 5px; color: var(--cl-line-strong); }
  .staff__hours.is-complete b { color: var(--cl-ok); }
  .staff__hours.is-over b { color: var(--cl-problem); }
  .staff__overage { padding: 1px 4px; border: 1px solid var(--cl-problem-line); border-radius: 999px; color: var(--cl-problem); background: var(--cl-problem-wash); font-size: 8.5px; line-height: 1.2; }
  .staff__meter { width: 100%; height: 4px; overflow: hidden; border-radius: 999px; background: var(--cl-line); }
  .staff__meter i { display: block; height: 100%; border-radius: inherit; background: var(--cl-info); transition: width var(--cl-dur-slow) var(--cl-ease), background var(--cl-dur) var(--cl-ease); }
  .staff__meter.is-complete i { background: var(--cl-ok); }
  .staff__meter.is-over { background: color-mix(in srgb, var(--cl-problem) 14%, var(--cl-line)); box-shadow: 0 0 0 1px color-mix(in srgb, var(--cl-problem) 18%, transparent); }
  .staff__meter.is-over i { background: var(--cl-problem); }
  tr.is-hours-over > td.board__staff { background: color-mix(in srgb, var(--cl-problem) 3%, var(--cl-surface)) !important; }

  .service-canvas { position: relative; min-height: 95px; display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); overflow: hidden; }
  .schedule-panel.is-compact .board td { height: 70px; }
  .schedule-panel.is-compact .service-canvas { min-height: 69px; }
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

  /* Area colour owns the card surface and border. Service colour is semantic:
     warm for lunch, cool for evening, orange for breaks. */
  .day-card { --lunch-color: var(--cl-muted); --evening-color: var(--cl-muted); --day-tone: var(--cl-lunch); --night-tone: var(--cl-evening); --break-tone: var(--cl-attention); position: absolute; z-index: 3; inset: 4px; overflow: hidden; border: 1px solid color-mix(in srgb, var(--lunch-color) 72%, var(--cl-line-strong)); border-radius: 3px; background: var(--cl-surface); box-shadow: 0 1px 3px rgb(15 23 42 / .075), inset 0 0 0 1px rgb(255 255 255 / .5); isolation: isolate; transition: border-color var(--cl-dur) var(--cl-ease), box-shadow var(--cl-dur) var(--cl-ease); }
  .day-card::before { content: ''; position: absolute; z-index: 1; top: 0; right: 0; left: 0; height: 2px; background: linear-gradient(90deg, var(--lunch-color) 0 50%, var(--evening-color) 50% 100%); opacity: .92; pointer-events: none; }
  .day-card.is-lunch-only { border-color: color-mix(in srgb, var(--lunch-color) 72%, var(--cl-line-strong)); }
  .day-card.is-evening-only { border-color: color-mix(in srgb, var(--evening-color) 72%, var(--cl-line-strong)); }
  .day-card.is-full-day { border-color: color-mix(in srgb, var(--lunch-color) 72%, var(--cl-line-strong)); }
  .day-card:hover { border-color: color-mix(in srgb, var(--lunch-color) 84%, var(--cl-line-strong)); box-shadow: 0 3px 9px rgb(15 23 42 / .12), inset 0 0 0 1px rgb(255 255 255 / .58); }
  .day-card.is-evening-only:hover { border-color: color-mix(in srgb, var(--evening-color) 84%, var(--cl-line-strong)); }
  .day-card.is-readonly { box-shadow: none; }
  .day-card__surface { position: absolute; z-index: 0; inset: 0; display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); pointer-events: none; }
  .day-card__fill { opacity: 1; background: var(--cl-surface); transition: background var(--cl-dur) var(--cl-ease); }
  .day-card__fill.is-lunch.is-active { background: linear-gradient(180deg, color-mix(in srgb, var(--lunch-color) 8%, var(--cl-surface)), color-mix(in srgb, var(--lunch-color) 5%, var(--cl-surface))); }
  .day-card__fill.is-evening.is-active { background: linear-gradient(180deg, color-mix(in srgb, var(--evening-color) 8%, var(--cl-surface)), color-mix(in srgb, var(--evening-color) 5%, var(--cl-surface))); }
  .day-card.is-lunch-only .day-card__fill.is-evening { background: color-mix(in srgb, var(--lunch-color) 1.5%, var(--cl-surface)); }
  .day-card.is-evening-only .day-card__fill.is-lunch { background: color-mix(in srgb, var(--evening-color) 1.5%, var(--cl-surface)); }
  .day-card.is-full-day .day-card__fill { background: color-mix(in srgb, var(--lunch-color) 6%, var(--cl-surface)); }
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

  .day-card__content { position: absolute; z-index: 2; inset: 0; display: grid; align-content: center; gap: 4px; min-width: 0; padding: 8px; pointer-events: none; }
  .day-card__top { display: grid; grid-template-columns: minmax(70px, 1fr) auto; align-items: center; gap: 6px; min-width: 0; }
  .day-card__top.has-conflict { padding-right: 9px; }
  .day-card__top strong { overflow: hidden; color: color-mix(in srgb, var(--cl-ink) 88%, #475569); font-size: 11px; font-weight: var(--rst-fw-bold); font-variant-numeric: tabular-nums; text-overflow: ellipsis; white-space: nowrap; }
  .day-card__metrics { min-width: 0; display: inline-flex; align-items: center; justify-content: flex-end; gap: 4px; color: color-mix(in srgb, var(--cl-ink) 72%, var(--cl-muted)); font-size: 8.5px; font-variant-numeric: tabular-nums; line-height: 1; text-align: right; white-space: nowrap; }
  .day-card__metrics b { font-weight: var(--rst-fw-bold); }
  .day-card__metrics i { color: color-mix(in srgb, var(--cl-muted) 70%, var(--cl-line-strong)); font-style: normal; }
  .day-card__break { display: inline-flex; align-items: center; gap: 3px; min-width: 0; overflow: hidden; color: var(--break-tone); font-size: 8px; font-variant-numeric: tabular-nums; line-height: 1; white-space: nowrap; }
  .day-card__break b { overflow: hidden; font-weight: var(--rst-fw-medium); text-overflow: ellipsis; }
  .day-card__break.is-empty { color: color-mix(in srgb, var(--break-tone) 42%, var(--cl-muted)); }
  .day-card__coffee { display: inline-flex; color: currentColor; line-height: 1; }
  .day-card__conflict-dot { position: absolute; z-index: 3; top: 3px; right: 3px; width: 7px; height: 7px; border: 1px solid color-mix(in srgb, var(--cl-problem) 76%, white); border-radius: 50%; background: var(--cl-problem); box-shadow: 0 0 0 2px color-mix(in srgb, var(--cl-surface) 86%, transparent), 0 1px 3px color-mix(in srgb, var(--cl-problem) 28%, transparent); pointer-events: none; }
  .day-card__services { display: grid; gap: 2px; min-width: 0; }
  .day-card__service-row { display: grid; grid-template-columns: 12px minmax(0, 1fr) 62px; align-items: center; gap: 4px; min-width: 0; color: var(--cl-muted); line-height: 1.15; }
  .day-card__service-icon { display: grid; place-items: center; text-align: center; }
  .day-card__service-row.is-lunch { color: var(--day-tone); }
  .day-card__service-row.is-evening { color: var(--night-tone); }
  .day-card__service-name { display: flex; align-items: baseline; gap: 3px; min-width: 0; overflow: hidden; white-space: nowrap; }
  .day-card__area-icon { display: inline-flex; flex: 0 0 auto; align-self: center; color: currentColor; font-style: normal; }
  .day-card__area-dot { width: 5px; height: 5px; flex: 0 0 auto; align-self: center; border-radius: 50%; background: var(--area-color); }
  .day-card__service-row b, .day-card__service-row small, .day-card__service-row em { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .day-card__service-row b { color: currentColor; font-size: 9.5px; font-weight: var(--rst-fw-bold); }
  .day-card__service-row small { color: color-mix(in srgb, currentColor 58%, var(--cl-muted)); font-size: 8.5px; font-weight: var(--rst-fw-medium); }
  .day-card__service-row em { color: currentColor; font-size: 8.5px; font-style: normal; font-variant-numeric: tabular-nums; text-align: right; }
  .day-card__service-row.is-empty b,
  .day-card__service-row.is-empty small,
  .day-card__service-row.is-empty em { color: color-mix(in srgb, var(--cl-muted) 78%, var(--cl-line-strong)); font-weight: var(--rst-fw-regular); }
  .day-card__service-row.is-empty .day-card__service-icon { opacity: .48; }

  .day-card__compact-metrics { display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: center; gap: 8px; min-width: 0; color: color-mix(in srgb, var(--cl-ink) 68%, var(--cl-muted)); font-size: 9px; font-variant-numeric: tabular-nums; line-height: 1.05; }
  .day-card__compact-metrics > span { display: inline-flex; align-items: center; gap: 3px; min-width: 0; white-space: nowrap; }
  .day-card__compact-metrics i { display: inline-flex; color: currentColor; font-style: normal; }
  .day-card__compact-break { overflow: hidden; color: color-mix(in srgb, var(--break-tone) 88%, var(--cl-ink)); font-weight: var(--rst-fw-bold); text-overflow: ellipsis; }
  .day-card__compact-break.is-empty { color: var(--cl-muted); }
  .day-card__compact-hours { justify-self: end; color: color-mix(in srgb, var(--cl-ink) 84%, var(--cl-muted)); font-size: 10px; font-weight: var(--rst-fw-bold); text-align: right; }
  .day-card__compact-hours b { font-weight: inherit; }
  .day-card__compact-areas { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); align-items: center; gap: 9px; min-width: 0; overflow: hidden; }
  .day-card__compact-areas > span { display: inline-flex; align-items: center; gap: 3px; min-width: 0; overflow: hidden; }
  .day-card__compact-areas > span.is-lunch { color: var(--day-tone); }
  .day-card__compact-areas > span.is-evening { justify-content: flex-end; color: var(--night-tone); text-align: right; }
  .day-card__compact-areas > span.is-span { grid-column: 1 / -1; justify-content: flex-start; }
  .day-card__compact-areas > span.is-empty { min-height: 12px; }
  .day-card__compact-areas i { flex: 0 0 auto; color: currentColor; }
  .day-card__compact-areas b { overflow: hidden; font-size: 8.5px; font-weight: var(--rst-fw-bold); text-overflow: ellipsis; white-space: nowrap; }
  .schedule-panel.is-compact .day-card__content { align-content: center; gap: 4px; padding: 6px 8px; }
  .schedule-panel.is-compact .day-card__top { grid-template-columns: minmax(0, 1fr); }
  .schedule-panel.is-compact .day-card__top strong { font-size: 11.5px; }

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

  .publish-review { display: grid; gap: 16px; padding: 16px; }
  .publish-review__stats { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 8px; }
  .publish-review__stats span { display: grid; gap: 4px; padding: 12px; border: 1px solid var(--cl-line); border-radius: 6px; background: var(--cl-surface-muted); color: var(--cl-muted); font-size: 11px; }
  .publish-review__stats b { color: var(--cl-ink); font-size: 20px; }
  .publish-review__warnings { display: flex; flex-wrap: wrap; gap: 6px; padding: 10px; border: 1px solid color-mix(in srgb, var(--cl-attention) 28%, var(--cl-line)); border-radius: 6px; background: color-mix(in srgb, var(--cl-attention) 6%, var(--cl-surface)); }
  .publish-review__warnings span { display: inline-flex; align-items: center; gap: 5px; padding: 4px 8px; border: 1px solid color-mix(in srgb, var(--cl-attention) 25%, var(--cl-line)); border-radius: 999px; background: var(--cl-surface); color: var(--cl-muted); font-size: 11px; }
  .publish-review__warnings b { color: var(--cl-attention); }
  .publish-review p { margin: 0; color: var(--cl-muted); font-size: 13px; line-height: 1.55; }
  .publish-review__actions { display: flex; justify-content: flex-end; gap: 8px; }
  .shift-dialog__hint { margin-right: auto; align-self: center; color: var(--cl-muted); font-size: 11px; }

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
