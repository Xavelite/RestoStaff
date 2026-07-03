<script lang="ts">
  import { tick } from 'svelte';
  import {
    saveAbsence,
    savePlanning,
    saveWorkPatternException
  } from '$lib/api/mutations';
  import {
    SERVICES,
    addDays,
    addMonths,
    clockMinutes,
    formatHours,
    hoursBetweenClocks,
    mondayFor,
    monthDates,
    monthLabel,
    serviceDisplay,
    serviceLabel,
    todayInTimezone,
    weekLabel,
    type ServiceKey
  } from '$lib/calendar/date';
  import ActionButton from '$lib/components/ActionButton.svelte';
  import Drawer from '$lib/components/Drawer.svelte';
  import ExportDialog from '$lib/components/ExportDialog.svelte';
  import {
    PLANNING_EXPORT_FIELDS,
    DEFAULT_PLANNING_EXPORT_COLUMNS,
    planningFieldLabel
  } from '$lib/planning/planning-export-columns';
  import FeedbackBanner from '$lib/components/FeedbackBanner.svelte';
  import PageScaffold from '$lib/components/PageScaffold.svelte';
  import { workWeekHistoryItems } from '$lib/calendar/week-history';
  import RevisionConflictDialog from '$lib/components/RevisionConflictDialog.svelte';
  import { downloadCsv } from '$lib/export/csv';
  import OperationsBoard, {
    type BoardChip,
    type BoardColumn,
    type BoardDayRail,
    type BoardFooterCell,
    type BoardMonthDay,
    type BoardRow,
    type BoardServiceCard,
    type BoardSlot,
    type BoardTone
  } from '$lib/components/OperationsBoard.svelte';
  import PlanningSlotEditor from '$lib/planning/PlanningSlotEditor.svelte';
  import {
    buildPlanningWeek,
    coverageIssues,
    defaultPlanningShift,
    planningConflicts,
    planningDraftForWeek,
    planningNotesForWeek,
    planningStatusForWeek,
    type PlanningGridSlot,
    type PlanningNoteDraft,
    type PlanningShiftDraft
  } from '$lib/planning/planning-model';
  import { planningCsv } from '$lib/planning/planning-export';
  import { workspaceRealtime } from '$lib/realtime/workspace-realtime.svelte';
  import { workspace } from '$lib/workspace/workspace.svelte';

  type ScheduleCockpitView = 'service' | 'roster';
  type SchedulePeriod = 'week' | 'month';
  const cockpitViewLabels: Record<ScheduleCockpitView, string> = {
    service: 'Service board',
    roster: 'Roster grid'
  };

  const snapshot = $derived(workspace.operations);
  const timezone = $derived(
    snapshot?.restaurant_settings.timezone ||
      workspace.bootstrap?.restaurant_settings.timezone ||
      'Europe/Brussels'
  );
  const today = $derived(todayInTimezone(timezone));
  let weekStart = $state('');
  let selectedKey = $state('');
  let draft = $state<PlanningShiftDraft[]>([]);
  let notes = $state<PlanningNoteDraft[]>([]);
  let baseline = $state('');
  let loadedKey = $state('');
  let saving = $state(false);
  let justPublished = $state(false);
  let feedback = $state('');
  let feedbackTone = $state<'info' | 'success' | 'warning' | 'danger'>('info');
  let search = $state('');
  let scope = $state<'all' | 'conflicts' | 'scheduled'>('all');
  let positionId = $state('');
  let cockpitView = $state<ScheduleCockpitView>('service');
  let boardExpanded = $state(false);
  let boardPeriod = $state<SchedulePeriod>('week');
  let selectedDate = $state('');
  let conflictOpen = $state(false);
  let slotDetailsOpen = $state(false);
  let exportCsvOpen = $state(false);
  let planningColumns = $state<string[]>([...DEFAULT_PLANNING_EXPORT_COLUMNS]);
  const activeWeek = $derived(weekStart || mondayFor(today));
  const activeMonthDates = $derived(monthDates(activeWeek));
  const operationsStart = $derived(
    boardExpanded && boardPeriod === 'month' ? activeMonthDates[0] : activeWeek
  );
  const operationsEnd = $derived(
    boardExpanded && boardPeriod === 'month'
      ? activeMonthDates[activeMonthDates.length - 1]
      : addDays(activeWeek, 6)
  );

  $effect(() => {
    if (!weekStart) weekStart = mondayFor(today);
  });
  $effect(() => {
    if (workspace.activeId && operationsStart && operationsEnd) {
      void workspace.loadOperations(operationsStart, operationsEnd, true).catch(() => undefined);
    }
  });

  const status = $derived(
    snapshot
      ? planningStatusForWeek(snapshot, activeWeek)
      : { planning: 'draft' as const, actuals: 'open', revision: 0 }
  );
  const dirty = $derived(JSON.stringify({ draft, notes }) !== baseline);
  const issues = $derived(snapshot ? coverageIssues(snapshot, draft, activeWeek) : []);
  const conflicts = $derived(snapshot ? planningConflicts(snapshot, draft, activeWeek) : []);
  const pendingExceptions = $derived(
    snapshot?.work_pattern_exceptions.filter(
      (item) =>
        item.status === 'pending' &&
        item.start_date <= addDays(activeWeek, 6) &&
        item.end_date >= activeWeek
    ) ?? []
  );
  const currentWeek = $derived(mondayFor(today));
  const editable = $derived(
    activeWeek >= currentWeek &&
      status.planning === 'draft' &&
      !['approved', 'locked'].includes(status.actuals)
  );
  const grid = $derived(
    snapshot
      ? buildPlanningWeek({ snapshot, weekStart: activeWeek, today, draft })
      : { days: [], rows: [], slotsByKey: new Map() }
  );
  $effect(() => {
    const fallback =
      grid.days.find((day) => day.today)?.date || grid.days[0]?.date || activeWeek;
    if (!selectedDate || !grid.days.some((day) => day.date === selectedDate)) {
      selectedDate = fallback;
    }
  });
  const selectedSlot = $derived(grid.slotsByKey.get(selectedKey) ?? null);

  // ---- Week/month browsing lens ------------------------------------
  // Publishing and coverage checks always stay scoped to `activeWeek` (see
  // `persist()`/`issues`/`conflicts` above). Month mode only widens what the
  // board *displays* — neighbouring weeks render their committed shifts
  // read-only (via `planningDraftForWeek`, bypassing the live `draft`), the
  // active week keeps its normal editable slots.
  function focusDates(dates: string[]): string[] {
    if (dates.length <= 5) return dates;
    const anchorIndex =
      selectedDate && dates.includes(selectedDate)
        ? dates.indexOf(selectedDate)
        : dates.findIndex((date) => date === today);
    const preferredStart = Math.max(0, (anchorIndex >= 0 ? anchorIndex : 0) - 1);
    const start = Math.min(preferredStart, Math.max(0, dates.length - 5));
    return dates.slice(start, start + 5);
  }

  const periodDates = $derived.by(() => {
    const base = boardExpanded && boardPeriod === 'month' ? activeMonthDates : grid.days.map((day) => day.date);
    return cockpitView === 'service' && !boardExpanded ? focusDates(base) : base;
  });
  const periodLabel = $derived(
    boardExpanded && boardPeriod === 'month' ? monthLabel(activeWeek) : weekLabel(activeWeek)
  );
  const periodWeekGrids = $derived.by(() => {
    const map = new Map<string, ReturnType<typeof buildPlanningWeek>>();
    if (!snapshot) return map;
    const weekStarts = new Set(periodDates.map((date) => mondayFor(date)));
    for (const ws of weekStarts) {
      const weekDraft = ws === activeWeek ? draft : planningDraftForWeek(snapshot, ws);
      map.set(ws, buildPlanningWeek({ snapshot, weekStart: ws, today, draft: weekDraft }));
    }
    return map;
  });

  function periodSlotFor(rowId: string, date: string, serviceKey: ServiceKey): PlanningGridSlot | null {
    return periodWeekGrids.get(mondayFor(date))?.slotsByKey.get(`${rowId}|${date}|${serviceKey}`) ?? null;
  }

  function weekdayLabel(date: string) {
    return new Intl.DateTimeFormat('en-GB', { weekday: 'short', timeZone: 'UTC' }).format(
      new Date(`${date}T00:00:00Z`)
    );
  }

  const periodColumns: BoardColumn[] = $derived(
    periodDates.map((date) => ({
      date,
      label: weekdayLabel(date),
      day: date.slice(8),
      month: date.slice(5, 7),
      today: date === today,
      future: date > today
    }))
  );
  const planningSlots = $derived(Array.from(grid.slotsByKey.values()));
  const plannedShiftCount = $derived(draft.length);
  const scheduledEmployeeCount = $derived(new Set(draft.map((shift) => shift.employeeId)).size);
  const availableSlotCount = $derived(
    planningSlots.filter((slot) => slot.context.availability === 'available').length
  );
  const selectedServiceSlots = $derived(
    selectedSlot
      ? planningSlots.filter(
          (slot) => slot.date === selectedSlot.date && slot.serviceKey === selectedSlot.serviceKey
        )
      : []
  );
  const selectedPlannedCount = $derived(
    selectedServiceSlots.filter((slot) => Boolean(slot.shift)).length
  );
  const selectedAvailableCount = $derived(
    selectedServiceSlots.filter((slot) => slot.context.availability === 'available').length
  );
  const selectedLeaveCount = $derived(
    selectedServiceSlots.filter((slot) => Boolean(slot.context.absence)).length
  );
  const publishBlockerCount = $derived(conflicts.length + issues.length + pendingExceptions.length);
  const publishState = $derived(
    publishBlockerCount
      ? `${publishBlockerCount} check${publishBlockerCount === 1 ? '' : 's'}`
      : dirty
        ? 'Draft changed'
        : status.planning === 'published'
          ? 'Published'
          : 'Draft ready'
  );
  const heroTitle = $derived(
    publishBlockerCount
      ? `${publishBlockerCount} blockers before publish.`
      : dirty
        ? 'Unsaved schedule changes.'
        : status.planning === 'published'
          ? 'Schedule is published.'
          : 'Build a clean week.'
  );
  const heroLead = $derived(
    publishBlockerCount
      ? 'Start with the unsafe slots, then publish only when coverage and leave conflicts are clear.'
      : status.planning === 'published'
        ? 'Employees can see the week. Reopen it only when service reality changes.'
        : 'Use confirmed availability as your bench, then commit the right people to Lunch and Evening.'
  );
  const activeFilterCount = $derived(
    (search.trim() ? 1 : 0) + (scope === 'all' ? 0 : 1) + (positionId ? 1 : 0)
  );
  const publishTone = $derived(
    publishBlockerCount ? 'blocked' : dirty || status.actuals === 'open' ? 'warning' : 'ready'
  );
  const publishSummary = $derived(
    publishBlockerCount
      ? 'Resolve blockers before employees see the week.'
      : dirty
        ? 'Save the current draft before publishing.'
        : status.actuals === 'open'
          ? 'Coverage is clean. Timesheet is still open for last week.'
          : 'All coverage checks are green.'
  );
  const cockpitViewLabel = $derived(cockpitViewLabels[cockpitView]);
  // Rolling planning lifecycle log across all weeks (newest first, capped in the
  // component). Each entry shows which week it belongs to.
  const historyItems = $derived(workWeekHistoryItems(snapshot?.work_week_events, 'planning_'));
  const attentionEmployees = $derived(
    new Set([
      ...conflicts.map((shift) => shift.employeeId),
      ...pendingExceptions.map((item) => item.employee_id)
    ])
  );
  const visibleRows = $derived(
    grid.rows.filter((row) => {
      const matchesSearch = `${row.name} ${row.meta ?? ''}`.toLowerCase().includes(search.trim().toLowerCase());
      const hasShift = draft.some((shift) => shift.employeeId === row.id);
      const matchesScope =
        scope === 'all' ||
        (scope === 'conflicts' && attentionEmployees.has(row.id)) ||
        (scope === 'scheduled' && hasShift);
      const matchesPosition =
        !positionId ||
        snapshot?.employee_job_functions.some(
          (assignment) =>
            assignment.employee_id === row.id &&
            assignment.job_function_id === positionId &&
            assignment.active
        );
      return matchesSearch && matchesScope && matchesPosition;
    })
  );
  const planningPreview = $derived(
    snapshot
      ? planningCsv({
          snapshot,
          activeWeek,
          draft,
          notes,
          columns: planningColumns
        })
      : { headers: planningColumns.map(planningFieldLabel), rows: [], filename: '' }
  );
  const planningPreviewTable = $derived(
    exportCsvOpen
      ? {
          headers: planningPreview.headers,
          rows: planningPreview.rows,
          rowCount: planningPreview.rows.length,
          note: `${planningPreview.rows.length} planned shifts`
        }
      : null
  );

  // ---- Board adapters -------------------------------------------------
  // Maps PlanningGridSlot-shaped data onto the plain BoardX types the shared
  // OperationsBoard renders. Publish/coverage logic above never touches this
  // section; this only decides how things look.

  function initials(name: string) {
    return name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join('').toUpperCase();
  }

  function shortName(name: string) {
    const parts = name.split(/\s+/).filter(Boolean);
    if (parts.length <= 1) return name;
    return `${parts[0]} ${parts[1][0].toUpperCase()}.`;
  }

  function compactClock(value: string) {
    return value.replace(/:00$/, '');
  }

  function slotToneOf(slot: PlanningGridSlot): BoardTone {
    if (slot.truth.state === 'conflict') return 'conflict';
    if (slot.shift) return 'planned';
    if (slot.context.absence === 'approved' || slot.context.workPatternException === 'approved') return 'blocked';
    if (slot.context.absence === 'pending' || slot.context.workPatternException === 'pending') return 'pending';
    if (slot.context.availability === 'available') return 'available';
    if (slot.context.availability === 'partial') return 'partial';
    if (slot.context.availability === 'unavailable') return 'unavailable';
    return 'neutral';
  }

  function slotCaptionOf(slot: PlanningGridSlot) {
    if (slot.shift) return `${slot.shift.startsAt}-${slot.shift.endsAt}`;
    if (slot.context.absence === 'approved') return 'Leave';
    if (slot.context.absence === 'pending') return 'Leave pending';
    if (slot.context.workPatternException === 'approved') return 'Pattern change';
    if (slot.context.workPatternException === 'pending') return 'Change pending';
    if (slot.context.availability === 'available') return 'Bench';
    if (slot.context.availability === 'partial') return 'Partial';
    if (slot.context.availability === 'unavailable') return 'Unavailable';
    return '';
  }

  function rosterSlotLabelOf(slot: PlanningGridSlot) {
    if (slot.shift) return `${compactClock(slot.shift.startsAt)}–${compactClock(slot.shift.endsAt)}`;
    if (slot.context.absence === 'approved') return 'Leave';
    if (slot.context.absence === 'pending') return 'Leave pending';
    if (slot.context.workPatternException === 'approved') return 'Pattern';
    if (slot.context.workPatternException === 'pending') return 'Pending';
    if (slot.context.availability === 'available') return 'Bench';
    if (slot.context.availability === 'partial') return 'Partial';
    if (slot.context.availability === 'unavailable') return 'Unavail';
    return '—';
  }

  function rosterSlotMetaOf(slot: PlanningGridSlot) {
    if (slot.shift) return slot.truth.plan?.area ?? 'No area';
    if (slot.context.availability === 'available') return 'available';
    if (slot.context.absence) return 'time off';
    if (slot.context.workPatternException) return 'exception';
    return '';
  }

  const visibleRowIds = $derived(visibleRows.map((row) => row.id));

  function serviceSlotsFor(date: string, serviceKey: ServiceKey) {
    return visibleRowIds
      .map((rowId) => periodSlotFor(rowId, date, serviceKey))
      .filter((slot): slot is PlanningGridSlot => Boolean(slot));
  }

  function plannedSlotsFor(date: string, serviceKey: ServiceKey) {
    return serviceSlotsFor(date, serviceKey).filter((slot) => slot.shift);
  }

  function benchSlotsFor(date: string, serviceKey: ServiceKey) {
    return serviceSlotsFor(date, serviceKey).filter(
      (slot) =>
        !slot.shift &&
        (slot.context.availability === 'available' ||
          slot.context.availability === 'partial' ||
          slot.context.availability === 'unavailable' ||
          Boolean(slot.context.absence) ||
          Boolean(slot.context.workPatternException) ||
          slot.truth.state === 'conflict')
    );
  }

  function coverageIssueFor(date: string, serviceKey: ServiceKey) {
    return issues.find((issue) => issue.date === date && issue.serviceKey === serviceKey);
  }

  function serviceSummaryFor(date: string, serviceKey: ServiceKey) {
    const service = serviceSlotsFor(date, serviceKey);
    const planned = service.filter((slot) => slot.shift).length;
    const bench = service.filter((slot) => !slot.shift && slot.context.availability === 'available').length;
    const issue = coverageIssueFor(date, serviceKey);
    const required = issue?.required ?? planned;
    const missing = issue?.missing ?? Math.max(0, required - planned);
    const attention = service.filter(
      (slot) =>
        slot.truth.state === 'conflict' ||
        Boolean(slot.context.absence) ||
        Boolean(slot.context.workPatternException) ||
        slot.context.availability === 'unavailable'
    ).length;
    return { planned, bench, attention, required, missing };
  }

  function daySummaryFor(date: string) {
    const planned = SERVICES.reduce((sum, serviceKey) => sum + plannedSlotsFor(date, serviceKey).length, 0);
    const bench = SERVICES.reduce(
      (sum, serviceKey) =>
        sum + serviceSlotsFor(date, serviceKey).filter((slot) => !slot.shift && slot.context.availability === 'available').length,
      0
    );
    const missing = SERVICES.reduce((sum, serviceKey) => sum + serviceSummaryFor(date, serviceKey).missing, 0);
    return { planned, bench, missing };
  }

  function serviceToneFor(date: string, serviceKey: ServiceKey): BoardTone {
    const summary = serviceSummaryFor(date, serviceKey);
    if (summary.missing) return 'short';
    if (summary.attention) return 'attention';
    if (summary.planned) return 'ready';
    if (summary.bench) return 'bench';
    return 'empty';
  }

  function serviceStatusTextFor(date: string, serviceKey: ServiceKey) {
    const summary = serviceSummaryFor(date, serviceKey);
    if (summary.missing) return `${summary.planned}/${summary.required} short`;
    if (summary.required) return `${summary.planned}/${summary.required}`;
    if (summary.planned) return `${summary.planned} on`;
    if (summary.bench) return `${summary.bench} bench`;
    return 'Open';
  }

  function dayStatusTextFor(date: string) {
    const summary = daySummaryFor(date);
    if (summary.missing) return `${summary.missing} gap${summary.missing === 1 ? '' : 's'} to fill`;
    if (summary.planned) return 'Fully staffed';
    if (summary.bench) return 'Bench ready';
    return 'Quiet day';
  }

  function rowSlotsFor(rowId: string, date: string) {
    return SERVICES.map((serviceKey) => periodSlotFor(rowId, date, serviceKey)).filter(
      (slot): slot is PlanningGridSlot => Boolean(slot)
    );
  }

  function employeeMonthHours(employeeId: string) {
    let total = 0;
    for (const date of periodDates) {
      for (const serviceKey of SERVICES) {
        const slot = periodSlotFor(employeeId, date, serviceKey);
        if (slot?.shift) total += hoursBetweenClocks(slot.shift.startsAt, slot.shift.endsAt);
      }
    }
    return total;
  }

  function jumpToWeek(date: string) {
    if (dirty) {
      feedback = 'Save or cancel this week before jumping to another week.';
      feedbackTone = 'warning';
      return;
    }
    weekStart = mondayFor(date);
    selectedDate = date;
    selectedKey = '';
    feedback = '';
  }

  function openChip(date: string, key: string) {
    selectedDate = date;
    selectPlanningSlot(key);
  }

  function primarySlotFor(date: string, serviceKey: ServiceKey): PlanningGridSlot | null {
    const service = serviceSlotsFor(date, serviceKey);
    return (
      service.find(
        (slot) =>
          !slot.shift &&
          slot.context.availability === 'available' &&
          !slot.context.absence &&
          !slot.context.workPatternException
      ) ??
      service.find((slot) => !slot.shift) ??
      service[0] ??
      null
    );
  }

  function openServiceCard(date: string, serviceKey: ServiceKey) {
    const slot = primarySlotFor(date, serviceKey);
    selectedDate = date;
    if (slot) selectPlanningSlot(slot.key);
  }

  function locateIssue() {
    const first = issues[0];
    if (!first) return;
    scrollToService(first.date, first.serviceKey);
  }

  function locateConflict() {
    const first = conflicts[0];
    if (!first) return;
    scrollToService(addDays(activeWeek, first.weekday - 1), first.serviceKey);
  }

  function scrollToService(date: string, serviceKey: ServiceKey) {
    cockpitView = 'service';
    selectedDate = date;
    void tick().then(() => {
      requestAnimationFrame(() => {
        const el = document.getElementById(`svc-${date}-${serviceKey}`);
        if (!el) return;
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        el.classList.remove('rst-locate-pulse');
        void el.offsetWidth;
        el.classList.add('rst-locate-pulse');
        setTimeout(() => el.classList.remove('rst-locate-pulse'), 1600);
      });
    });
  }

  const boardRows: BoardRow[] = $derived(
    visibleRows.map((row) => ({
      id: row.id,
      name: shortName(row.name),
      meta: row.meta || 'Staff',
      avatarTone: attentionEmployees.has(row.id) ? 'danger' : 'neutral',
      totalLabel: formatHours(employeeMonthHours(row.id))
    }))
  );

  function rosterSlotsFor(rowId: string, date: string): BoardSlot[] {
    const isActiveWeekDate = mondayFor(date) === activeWeek;
    return rowSlotsFor(rowId, date).map((slot) => ({
      key: slot.key,
      tone: slotToneOf(slot),
      icon: serviceDisplay(slot.serviceKey).icon,
      main: rosterSlotLabelOf(slot),
      detail: rosterSlotMetaOf(slot),
      selected: selectedKey === slot.key,
      onclick: isActiveWeekDate ? () => openChip(date, slot.key) : () => jumpToWeek(date),
      ariaLabel: `${slot.employeeName} ${serviceLabel(slot.serviceKey)} ${slotCaptionOf(slot)}`
    }));
  }

  const footerCellsBoard: BoardFooterCell[] = $derived(
    periodColumns.map((column) => {
      const summary = daySummaryFor(column.date);
      return {
        value: summary.missing ? `-${summary.missing}` : summary.planned ? 'OK' : '—',
        tone: summary.missing ? 'gap' : summary.planned ? 'ok' : 'neutral'
      };
    })
  );

  const dayRailsBoard: BoardDayRail[] = $derived(
    periodColumns.map((column) => ({
      date: column.date,
      label: column.label,
      value: `${column.day}/${column.month}`,
      meta: dayStatusTextFor(column.date),
      hasGap: daySummaryFor(column.date).missing > 0,
      onclick: () => (selectedDate = column.date)
    }))
  );

  function serviceCardsForDate(date: string): BoardServiceCard[] {
    const isActiveWeekDate = mondayFor(date) === activeWeek;
    return SERVICES.map((serviceKey) => {
      const service = serviceDisplay(serviceKey);
      const planned = plannedSlotsFor(date, serviceKey);
      const bench = benchSlotsFor(date, serviceKey);
      const stats = serviceSummaryFor(date, serviceKey);
      const benchCap = boardExpanded ? 8 : 5;
      const chips: BoardChip[] = planned.map((slot) => ({
        key: slot.key,
        initials: initials(slot.employeeName),
        tone: slotToneOf(slot),
        name: slot.employeeName,
        detail: slotCaptionOf(slot),
        area: slot.truth.plan?.area,
        selected: selectedKey === slot.key,
        onclick: isActiveWeekDate ? () => openChip(date, slot.key) : () => jumpToWeek(date),
        ariaLabel: `${slot.employeeName} ${service.label} ${slotCaptionOf(slot)}`
      }));
      const secondaryChips: BoardChip[] = bench.slice(0, benchCap).map((slot) => ({
        key: slot.key,
        initials: initials(slot.employeeName),
        tone: slotToneOf(slot),
        name: slot.employeeName,
        detail: slotCaptionOf(slot),
        onclick: isActiveWeekDate ? () => openChip(date, slot.key) : () => jumpToWeek(date),
        ariaLabel: `${slot.employeeName} ${service.label}: ${slotCaptionOf(slot)}`
      }));
      return {
        id: `svc-${date}-${serviceKey}`,
        serviceKey,
        icon: service.icon,
        label: service.label,
        tone: serviceToneFor(date, serviceKey),
        summaryValue: serviceStatusTextFor(date, serviceKey),
        onHeaderClick: isActiveWeekDate ? () => openServiceCard(date, serviceKey) : () => jumpToWeek(date),
        chips,
        emptyLabel: 'Place staff',
        fillLabel: stats.missing ? `+ Fill ${stats.missing}` : undefined,
        onFillClick: isActiveWeekDate ? () => openServiceCard(date, serviceKey) : () => jumpToWeek(date),
        secondaryLabel: bench.length ? 'Bench' : 'No bench',
        secondaryChips,
        secondaryOverflow: bench.length > benchCap ? bench.length - benchCap : 0
      };
    });
  }

  const monthDaysBoard: BoardMonthDay[] = $derived(
    boardExpanded && boardPeriod === 'month'
      ? periodColumns.map((column) => {
          const summary = daySummaryFor(column.date);
          const tone: BoardTone = summary.missing
            ? 'short'
            : summary.planned
              ? 'ready'
              : column.future
                ? 'future'
                : 'quiet';
          return {
            date: column.date,
            dayNumber: column.day,
            today: column.today,
            outside: column.date.slice(0, 7) !== activeWeek.slice(0, 7),
            tone,
            totalLabel: summary.planned ? `${summary.planned} on` : undefined,
            reviewCount: summary.missing || undefined,
            lanes: SERVICES.map((serviceKey) => {
              const service = serviceDisplay(serviceKey);
              const stats = serviceSummaryFor(column.date, serviceKey);
              const isActiveWeekDate = mondayFor(column.date) === activeWeek;
              return {
                serviceKey,
                icon: service.icon,
                tone: serviceToneFor(column.date, serviceKey),
                value: serviceStatusTextFor(column.date, serviceKey),
                reviewCount: stats.missing || undefined,
                onclick: isActiveWeekDate
                  ? () => {
                      selectedDate = column.date;
                      cockpitView = 'service';
                    }
                  : () => jumpToWeek(column.date),
                ariaLabel: `${column.date} ${service.label}: ${serviceStatusTextFor(column.date, serviceKey)}`
              };
            })
          };
        })
      : []
  );

  $effect(() => {
    if (!snapshot || !weekStart) return;
    const week = planningStatusForWeek(snapshot, weekStart);
    const key = `${weekStart}|${week.revision}|${snapshot.planned_shifts.length}|${snapshot.weekly_notes.length}`;
    if (key === loadedKey) return;
    draft = planningDraftForWeek(snapshot, weekStart);
    notes = planningNotesForWeek(snapshot, weekStart);
    baseline = JSON.stringify({ draft, notes });
    selectedKey = '';
    loadedKey = key;
    feedback = '';
  });

  function changePeriod(delta: number) {
    if (dirty) {
      feedback = 'Save or cancel this week before changing week.';
      feedbackTone = 'warning';
      return;
    }
    if (boardExpanded && boardPeriod === 'month') {
      weekStart = mondayFor(addMonths(activeWeek, delta));
    } else {
      weekStart = addDays(weekStart || today, delta * 7);
    }
    selectedKey = '';
    feedback = '';
  }

  function selectPlanningSlot(key: string) {
    const slot = grid.slotsByKey.get(key);
    if (!slot || !snapshot) return;
    if (
      editable &&
      !slot.shift &&
      slot.context.absence !== 'approved' &&
      !slot.context.workPatternException
    ) {
      const next = defaultPlanningShift(snapshot, slot);
      if (next) {
        draft = [...draft, next];
        selectedKey = key;
        feedback = 'Shift added with the restaurant default service time.';
        feedbackTone = 'success';
        return;
      }
    }
    selectedKey = key;
  }

  function openPlanningDetails(key: string) {
    selectedKey = key;
    slotDetailsOpen = true;
  }

  function cancelChanges() {
    if (!snapshot) return;
    draft = planningDraftForWeek(snapshot, weekStart);
    notes = planningNotesForWeek(snapshot, weekStart);
    baseline = JSON.stringify({ draft, notes });
    feedback = 'Unsaved planning changes were discarded.';
    feedbackTone = 'info';
  }

  function copyPreviousWeek() {
    if (!snapshot || !editable) return;
    const previous = planningDraftForWeek(snapshot, addDays(activeWeek, -7));
    const employeeIds = new Set(
      snapshot.employees.filter((employee) => employee.active).map((employee) => employee.id)
    );
    const areaIds = new Set(snapshot.work_areas.filter((area) => area.active).map((area) => area.id));
    const jobFunctionIds = new Set(
      snapshot.job_functions.filter((job) => job.active).map((job) => job.id)
    );
    draft = previous
      .filter(
        (shift) =>
          employeeIds.has(shift.employeeId) &&
          (!shift.areaId || areaIds.has(shift.areaId)) &&
          (!shift.jobFunctionId || jobFunctionIds.has(shift.jobFunctionId))
      )
      .map((shift) => ({ ...shift, source: 'copied' }));
    feedback = draft.length
      ? `${draft.length} shifts copied from the previous week.`
      : 'The previous week has no eligible shifts to copy.';
    feedbackTone = draft.length ? 'success' : 'info';
  }

  // Planned-schedule CSV. Every column is real planned data (planned_shifts +
  // lookups) — no worked-time or payroll truth lives here.
  function runExportCsv() {
    if (!snapshot) return;
    downloadCsv(planningPreview.filename, planningPreview.headers, planningPreview.rows);
    exportCsvOpen = false;
  }

  function formatTrailTime(value: string) {
    return new Intl.DateTimeFormat('en-GB', {
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    }).format(new Date(value));
  }

  async function cancelSelectedLeave(): Promise<boolean> {
    if (!snapshot || !workspace.activeId || !selectedSlot) return false;
    const absence = snapshot.absences.find(
      (item) =>
        item.employee_id === selectedSlot.employeeId &&
        item.status === 'approved' &&
        item.start_date <= selectedSlot.date &&
        item.end_date >= selectedSlot.date &&
        (!item.service_key || item.service_key === selectedSlot.serviceKey)
    );
    if (!absence) {
      feedback = 'The approved leave could not be found. Refresh and try again.';
      feedbackTone = 'danger';
      return false;
    }
    try {
      await saveAbsence({
        restaurantId: workspace.activeId,
        employeeId: selectedSlot.employeeId,
        absenceId: absence.id,
        action: 'cancel_for_planning',
        payload: {
          business_date: selectedSlot.date,
          service_key: selectedSlot.serviceKey,
          reason: 'Cancelled explicitly while planning an overlapping shift.'
        }
      });
      await workspace.reloadOperations();
      await workspaceRealtime.publish('planning-saved', {
        restaurantId: workspace.activeId,
        revision: workspace.operations
          ? planningStatusForWeek(workspace.operations, activeWeek).revision
          : null,
        source: 'planning'
      });
      feedback = 'Approved leave cancelled with a planning audit event.';
      feedbackTone = 'success';
      return true;
    } catch (error) {
      feedback = error instanceof Error ? error.message : String(error);
      conflictOpen = feedback.includes('CONFLICT:');
      feedbackTone = 'danger';
      return false;
    }
  }

  async function resolveSelectedException(
    action: 'approve' | 'reject' | 'cancel_for_planning'
  ): Promise<boolean> {
    if (!workspace.activeId || !selectedSlot?.context.workPatternExceptionId) {
      feedback = 'The fixed-schedule change could not be found. Refresh and try again.';
      feedbackTone = 'danger';
      return false;
    }
    try {
      await saveWorkPatternException({
        restaurantId: workspace.activeId,
        employeeId: selectedSlot.employeeId,
        workPatternExceptionId: selectedSlot.context.workPatternExceptionId,
        action,
        payload: {
          reason:
            action === 'approve'
              ? 'Approved from Schedule.'
              : action === 'reject'
                ? 'Rejected from Schedule.'
                : 'Cancelled explicitly while scheduling an overlapping shift.',
          manager_comment:
            action === 'approve'
              ? 'Approved from Schedule.'
              : action === 'reject'
                ? 'Rejected from Schedule.'
                : undefined
        }
      });
      await workspace.reloadOperations();
      feedback =
        action === 'approve'
          ? 'Fixed-schedule change approved.'
          : action === 'reject'
            ? 'Fixed-schedule change rejected.'
            : 'Fixed-schedule change cancelled with a planning audit event.';
      feedbackTone = 'success';
      return true;
    } catch (error) {
      feedback = error instanceof Error ? error.message : String(error);
      feedbackTone = 'danger';
      return false;
    }
  }

  async function persist(targetStatus: 'draft' | 'published') {
    if (!snapshot || !workspace.activeId || saving) return;
    if (targetStatus === 'published' && conflicts.length) {
      feedback = `Resolve ${conflicts.length} availability, leave or fixed-schedule change conflict${conflicts.length === 1 ? '' : 's'} before publishing.`;
      feedbackTone = 'danger';
      return;
    }
    if (targetStatus === 'published' && issues.length) {
      feedback = `Resolve ${issues.length} coverage gap${issues.length === 1 ? '' : 's'} before publishing.`;
      feedbackTone = 'danger';
      return;
    }
    const invalid = draft.find((shift) => {
      const start = clockMinutes(shift.startsAt);
      const end = clockMinutes(shift.endsAt);
      return !shift.employeeId || start === null || end === null || start === end;
    });
    if (invalid) {
      feedback = 'Every planned shift needs a valid start and end time.';
      feedbackTone = 'danger';
      return;
    }
    saving = true;
    feedback = '';
    try {
      await savePlanning({
        restaurantId: workspace.activeId,
        weekStart: activeWeek,
        status: targetStatus,
        shifts: draft.map((shift) => ({
          employee_id: shift.employeeId,
          weekday: shift.weekday,
          service_key: shift.serviceKey,
          area_id: shift.areaId || null,
          job_function_id: shift.jobFunctionId || null,
          starts_at: shift.startsAt || null,
          ends_at: shift.endsAt || null,
          source: shift.source
        })),
        notes: notes.map((note) => ({
          weekday: note.weekday,
          service_key: note.serviceKey,
          note: note.note
        })),
        expectedRevision: status.revision,
        reason:
          targetStatus === 'published'
            ? 'Weekly planning reviewed and published.'
            : status.planning === 'published'
              ? 'Published planning reopened for changes.'
              : 'Draft planning saved.'
      });
      await workspace.reloadOperations();
      loadedKey = '';
      feedback =
        targetStatus === 'published'
          ? 'Schedule published. Employees can now see their shifts.'
          : status.planning === 'published'
            ? 'Schedule reverted to draft.'
            : 'Schedule saved.';
      feedbackTone = 'success';
      if (targetStatus === 'published') {
        justPublished = true;
        setTimeout(() => (justPublished = false), 1500);
      }
    } catch (error) {
      feedback = error instanceof Error ? error.message : String(error);
      conflictOpen = feedback.includes('CONFLICT:');
      feedbackTone = 'danger';
    } finally {
      saving = false;
    }
  }
</script>

<svelte:head><title>Schedule · restogogo</title></svelte:head>

{#if snapshot}
  {#snippet pageHeader()}
    {#if !boardExpanded}
      <header class="planning-hero" aria-labelledby="planning-title">
        <div class="planning-hero__copy">
          <span class="planning-kicker">{weekLabel(activeWeek)} · {status.planning === 'published' ? 'Published schedule' : 'Draft schedule'}</span>
          <h1 id="planning-title">{heroTitle}</h1>
          <p>{heroLead}</p>
        </div>
        <div class="planning-hero__command" aria-label="Planning command signal">
          <div class={`planning-hero__publish is-${publishTone}`} class:is-blocked={publishBlockerCount > 0} class:is-dirty={dirty}>
            <div class="publish-dial">
              <span><i></i> Publish gate</span>
              <strong>{publishState}</strong>
              <small>{publishSummary}</small>
            </div>
          </div>
        </div>
      </header>
      <FeedbackBanner message={feedback} tone={feedbackTone} />
    {/if}
  {/snippet}
  <PageScaffold header={pageHeader} label="Schedule workspace">
    <div class="planning-workspace" class:is-expanded={boardExpanded}>
      <section class="schedule-board" aria-label="Weekly service board">
        <header class="cockpit-console" aria-label="Schedule cockpit controls">
          <div class="cockpit-console__context">
            <span class="planning-kicker">Schedule cockpit · {cockpitViewLabel}</span>
            <div class="cockpit-console__title">
              <strong>{weekLabel(activeWeek)}</strong>
              <small>{visibleRows.length} people · {plannedShiftCount} shifts · {availableSlotCount} open</small>
            </div>
          </div>

          <div class="cockpit-console__controls">
            <div class="cockpit-view-switch" aria-label="Schedule cockpit view">
              <span>View</span>
              <button
                type="button"
                class:is-active={cockpitView === 'service'}
                aria-pressed={cockpitView === 'service'}
                onclick={() => (cockpitView = 'service')}
              >Service</button>
              <button
                type="button"
                class:is-active={cockpitView === 'roster'}
                aria-pressed={cockpitView === 'roster'}
                onclick={() => (cockpitView = 'roster')}
              >Roster</button>
            </div>

            {#if boardExpanded}
              <div class="period-switch" aria-label="Schedule period">
                <span>Period</span>
                <button
                  type="button"
                  class:is-active={boardPeriod === 'week'}
                  aria-pressed={boardPeriod === 'week'}
                  onclick={() => (boardPeriod = 'week')}
                >Week</button>
                <button
                  type="button"
                  class:is-active={boardPeriod === 'month'}
                  aria-pressed={boardPeriod === 'month'}
                  onclick={() => (boardPeriod = 'month')}
                >Month</button>
              </div>
            {/if}

            <div class="cockpit-week" aria-label="Choose period">
              <button type="button" aria-label="Previous period" onclick={() => changePeriod(-1)}>
                Prev
              </button>
              <button type="button" aria-label="Next period" onclick={() => changePeriod(1)}>
                Next
              </button>
            </div>

            {#if boardExpanded || activeFilterCount}
              <details class="cockpit-staff-tools">
                <summary>
                  Staff tools{activeFilterCount ? ` · ${activeFilterCount}` : ''}
                </summary>
                <div class="cockpit-staff-tools__panel">
                  <label class="cockpit-search">
                    <span>Find staff</span>
                    <input bind:value={search} placeholder="Name, role, station..." />
                  </label>
                  <label>
                    <span>Show</span>
                    <select bind:value={scope}>
                      <option value="all">All employees</option>
                      <option value="scheduled">Scheduled only</option>
                      <option value="conflicts">Needs attention</option>
                    </select>
                  </label>
                  <label>
                    <span>Position</span>
                    <select bind:value={positionId}>
                      <option value="">All positions</option>
                      {#each snapshot.job_functions.filter((item) => item.active) as item}
                        <option value={item.id}>{item.name}</option>
                      {/each}
                    </select>
                  </label>
                </div>
              </details>
            {/if}

            <button
              type="button"
              class="cockpit-expand"
              onclick={() => {
                boardExpanded = !boardExpanded;
                if (!boardExpanded) boardPeriod = 'week';
              }}
            >
              {boardExpanded ? 'Exit focus' : 'Focus week'}
            </button>
          </div>
        </header>

        <OperationsBoard
          view={cockpitView}
          periodMode={boardExpanded ? boardPeriod : 'week'}
          expanded={boardExpanded}
          columns={periodColumns}
          rows={boardRows}
          slotsFor={rosterSlotsFor}
          dayRails={dayRailsBoard}
          serviceCardsFor={serviceCardsForDate}
          monthDays={monthDaysBoard}
          footerLabel="Coverage"
          footerCells={footerCellsBoard}
          emptyMessage="No employees match this Schedule lens."
          label="Weekly schedule service map"
        />

        {#if boardExpanded && boardPeriod === 'month'}
          <p class="month-note">
            Monthly focus is a review lens only. Publish and coverage checks still apply to {weekLabel(activeWeek)}.
          </p>
        {/if}
      </section>

      {#if !boardExpanded}
        <aside class="schedule-rail" aria-label="Schedule inspector">
          <section class={`week-actions is-${publishTone}`} class:is-celebrating={justPublished} aria-label="Schedule publish gate">
            <span class="planning-kicker">Publish gate</span>
            <h2>{status.planning === 'published' ? 'Published week' : publishBlockerCount ? `${publishBlockerCount} checks` : dirty ? 'Save changes first' : 'Ready when you are'}</h2>
            <p>{publishSummary}</p>
            <div class="rail-checks" aria-label="Publish checks">
              <button type="button" class:needs-attention={issues.length > 0} style="--rst-i:0" disabled={!issues.length} onclick={locateIssue}>
                <strong>{issues.length}</strong>
                <span>coverage gaps{issues.length ? ' · click to find' : ''}</span>
                <em class:is-clear={!issues.length}>{issues.length ? '!' : '✓'}</em>
              </button>
              <button type="button" class:needs-danger={conflicts.length > 0} style="--rst-i:1" disabled={!conflicts.length} onclick={locateConflict}>
                <strong>{conflicts.length}</strong>
                <span>slot conflicts{conflicts.length ? ' · click to find' : ''}</span>
                <em class:is-clear={!conflicts.length}>{conflicts.length ? '!' : '✓'}</em>
              </button>
              <article class:needs-attention={pendingExceptions.length > 0} style="--rst-i:2">
                <strong>{pendingExceptions.length}</strong>
                <span>pending exceptions</span>
                <em class:is-clear={!pendingExceptions.length}>{pendingExceptions.length ? '!' : '✓'}</em>
              </article>
            </div>
            <div class="gate-actions">
              {#if status.planning === 'published'}
                <button
                  type="button"
                  class="is-danger"
                  disabled={saving}
                  onclick={() => persist('draft')}
                >
                  {saving ? 'Reverting…' : 'Revert to draft'}
                </button>
              {:else}
                <button type="button" disabled={!dirty || saving} onclick={cancelChanges}>Cancel</button>
                <button
                  type="button"
                  disabled={!dirty || !editable || saving}
                  onclick={() => persist('draft')}
                >
                  {saving ? 'Saving…' : 'Save draft'}
                </button>
                <button
                  type="button"
                  class="is-primary"
                  class:is-celebrating={justPublished}
                  disabled={!editable || saving}
                  onclick={() => persist('published')}
                >
                  {saving ? 'Publishing…' : justPublished ? 'Published ✓' : 'Publish schedule'}
                </button>
              {/if}
            </div>
          </section>

          <section class="export-card" aria-label="Schedule exports">
            <span class="planning-kicker">Export</span>
            <h2>Share the week</h2>
            <div class="rail-actions">
              <button type="button" disabled={!editable || saving} onclick={copyPreviousWeek}>
                Copy previous week
              </button>
              <button type="button" onclick={() => window.print()}>Export PDF</button>
              <button type="button" onclick={() => (exportCsvOpen = true)}>Export CSV</button>
            </div>
          </section>

          <section class="service-lens">
            <span class="planning-kicker">Service lens</span>
            {#if selectedSlot}
              <h2>{selectedSlot.employeeName}</h2>
              <p>{selectedSlot.date} · {serviceLabel(selectedSlot.serviceKey)}</p>
              <div class="lens-counts">
                <div><span>Planned</span><strong>{selectedPlannedCount}</strong></div>
                <div><span>Available</span><strong>{selectedAvailableCount}</strong></div>
                <div><span>Leave</span><strong>{selectedLeaveCount}</strong></div>
              </div>
              <ActionButton label="Open slot details" disabled={!selectedSlot} onclick={() => selectedSlot && openPlanningDetails(selectedSlot.key)} />
            {:else}
              <h2>Pick a service lane.</h2>
              <p>Select a planned card or an available bench chip to inspect the service and edit the commitment.</p>
            {/if}
          </section>

        </aside>

        <section class="schedule-lower schedule-lower--history" aria-label="Schedule history">
          <section class="week-trail" aria-label="Schedule week trail">
            <div class="week-trail__head">
              <span class="planning-kicker">Week trail</span>
              <strong>Schedule story</strong>
            </div>
            <div class="trail-line">
              {#each historyItems.slice(0, 4) as item (item.id)}
                <article>
                  <i></i>
                  <div>
                    <strong>{item.title}</strong>
                    {#if item.detail}
                      <p>{item.detail}</p>
                    {/if}
                    <time datetime={item.when}>{formatTrailTime(item.when)}</time>
                  </div>
                </article>
              {:else}
                <p class="trail-empty">No schedule decisions yet. Publish, reopen, or finalize the week to create the audit trail.</p>
              {/each}
            </div>
          </section>
        </section>
      {/if}
    </div>

  <Drawer
    open={slotDetailsOpen && Boolean(selectedSlot)}
    title={selectedSlot ? `${selectedSlot.employeeName} · ${serviceLabel(selectedSlot.serviceKey)}` : 'Schedule details'}
    description={selectedSlot ? `${selectedSlot.date} · ${editable ? 'Draft editing' : 'Read only'}` : ''}
    onclose={() => (slotDetailsOpen = false)}
  >
    {#if selectedSlot}
      <PlanningSlotEditor
        {snapshot}
        slot={selectedSlot}
        {draft}
        {notes}
        {editable}
        onchange={(value) => (draft = value)}
        onnotes={(value) => (notes = value)}
        oncancelleave={cancelSelectedLeave}
        onresolveexception={resolveSelectedException}
      />
    {/if}
  </Drawer>

  <ExportDialog
    open={exportCsvOpen}
    title="Export CSV"
    description="Planned schedule for week of {weekLabel(activeWeek)}."
    formatLabel="Schedule"
    fields={PLANNING_EXPORT_FIELDS}
    bind:columns={planningColumns}
    fieldLabel={planningFieldLabel}
    preview={planningPreviewTable}
    exportLabel="Export CSV"
    onexport={runExportCsv}
    onclose={() => (exportCsvOpen = false)}
  />

  <RevisionConflictDialog
    open={conflictOpen}
    title="Schedule changed elsewhere"
    description="Another session saved this week after you loaded it. Your draft has not overwritten their work."
    onkeep={() => (conflictOpen = false)}
    onreload={async () => {
      conflictOpen = false;
      await workspace.reloadOperations();
      loadedKey = '';
    }}
  />
  </PageScaffold>
{:else}
  <p class="empty">Loading Schedule…</p>
{/if}

<style>
  :global(.app__content[data-atmosphere='planning'] .page-scaffold) {
    gap: 0;
  }

  .empty { color: var(--rst-ui-muted); }

  .month-note {
    margin: 0;
    padding: 14px 28px 20px;
    color: rgba(255, 250, 242, 0.64);
    font-size: 12px;
    line-height: 1.45;
  }

  .planning-hero {
    position: relative;
    min-width: 0;
    min-height: 188px;
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(300px, 460px);
    gap: clamp(18px, 3vw, 42px);
    align-items: center;
    padding: clamp(22px, 3.2vw, 34px) clamp(24px, 4vw, 44px);
    overflow: hidden;
    color: #fffaf2;
    background:
      radial-gradient(circle at 74% 18%, rgba(163, 255, 63, 0.14), transparent 25%),
      radial-gradient(circle at 96% 82%, rgba(240, 100, 35, 0.36), transparent 28%),
      linear-gradient(100deg, rgba(10, 15, 22, 0.98) 0%, rgba(13, 23, 32, 0.92) 50%, rgba(69, 38, 23, 0.76) 100%),
      url('/module-backgrounds/planning.webp') center / cover;
    border-bottom: 1px solid rgba(var(--rst-ui-action-rgb), 0.28);
  }

  .planning-hero::after {
    content: '';
    position: absolute;
    inset: auto 0 0;
    height: 5px;
    background: linear-gradient(90deg, var(--rst-ui-action), var(--rst-gold), var(--rst-green), var(--rst-state-info));
    opacity: 0.94;
  }

  .planning-hero__copy,
  .planning-hero__command {
    position: relative;
    z-index: 1;
  }

  .planning-hero__copy {
    display: grid;
    gap: 9px;
    align-content: center;
    max-width: 860px;
  }

  .planning-kicker {
    color: var(--rst-ui-action);
    font-size: 11px;
    font-weight: var(--rst-fw-display);
    letter-spacing: 0.1em;
    text-transform: uppercase;
  }

  .planning-hero h1,
  .schedule-rail h2 {
    margin: 0;
    letter-spacing: -0.055em;
  }

  .planning-hero h1 {
    max-width: 100%;
    overflow: hidden;
    font-size: clamp(34px, 4.15vw, 58px);
    line-height: 0.92;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .planning-hero p,
  .schedule-lower p {
    margin: 0;
    line-height: 1.45;
  }

  .planning-hero p {
    max-width: 720px;
    color: rgba(255, 250, 242, 0.8);
    font-size: clamp(14px, 1.28vw, 17px);
  }

  .planning-hero__command {
    width: min(380px, 100%);
    justify-self: end;
    display: grid;
  }

  .planning-hero__publish {
    display: grid;
    gap: 8px;
    padding: 13px 14px;
    border: 1px solid rgba(255, 255, 255, 0.16);
    border-radius: var(--rst-ui-radius-xl);
    background:
      radial-gradient(circle at 98% 10%, rgba(64, 200, 120, 0.2), transparent 34%),
      rgba(8, 15, 23, 0.48);
    box-shadow: 0 14px 36px rgba(0, 0, 0, 0.18);
    backdrop-filter: blur(16px);
  }

  .planning-hero__publish.is-ready {
    border-color: rgba(61, 187, 115, 0.34);
  }

  .planning-hero__publish.is-warning {
    border-color: rgba(247, 183, 51, 0.36);
  }

  .planning-hero__publish.is-blocked {
    border-color: rgba(240, 100, 35, 0.36);
    background:
      radial-gradient(circle at 98% 10%, rgba(240, 100, 35, 0.26), transparent 34%),
      rgba(8, 15, 23, 0.52);
  }

  .planning-hero__publish.is-dirty:not(.is-blocked) {
    background:
      radial-gradient(circle at 98% 10%, rgba(247, 183, 51, 0.24), transparent 34%),
      rgba(8, 15, 23, 0.5);
  }

  .publish-dial {
    display: grid;
    gap: 7px;
  }

  .publish-dial span,
  .rail-checks span {
    color: rgba(255, 250, 242, 0.62);
    font-size: 10px;
    font-weight: var(--rst-fw-display);
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }

  .publish-dial span {
    display: inline-flex;
    align-items: center;
    gap: 8px;
  }

  .publish-dial span i {
    width: 9px;
    height: 9px;
    display: inline-block;
    border-radius: var(--rst-ui-radius-round);
    background: #3dbb73;
    box-shadow: 0 0 0 4px rgba(61, 187, 115, 0.16);
    animation: rst-pulse-soft 2.4s ease-in-out infinite;
  }

  .planning-hero__publish.is-warning .publish-dial span i {
    background: #f7b733;
    box-shadow: 0 0 0 4px rgba(247, 183, 51, 0.16);
  }

  .planning-hero__publish.is-blocked .publish-dial span i {
    background: #f06423;
    box-shadow: 0 0 0 4px rgba(240, 100, 35, 0.16);
  }

  .publish-dial strong {
    color: #fff;
    font-size: clamp(20px, 1.55vw, 26px);
    line-height: 1;
    letter-spacing: -0.045em;
  }

  .publish-dial small {
    max-width: 30ch;
    color: rgba(255, 250, 242, 0.68);
    font-size: 12px;
    line-height: 1.34;
  }

  .rail-checks {
    display: grid;
    gap: 8px;
  }

  .rail-checks article,
  .rail-checks button {
    min-width: 0;
    width: 100%;
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto;
    align-items: center;
    gap: 7px;
    padding: 9px;
    border: 1px solid rgba(255, 255, 255, 0.12);
    border-radius: var(--rst-ui-radius-lg);
    background: rgba(61, 187, 115, 0.11);
    color: inherit;
    font: inherit;
    text-align: left;
    animation: rst-fade-up .4s var(--rst-ease-out) backwards;
    animation-delay: calc(var(--rst-i, 0) * 90ms);
    transition: background-color .2s ease, border-color .2s ease, transform .15s var(--rst-ease-out);
  }

  .rail-checks button:not(:disabled) {
    cursor: pointer;
  }

  .rail-checks button:not(:disabled):hover {
    transform: translateX(2px);
    border-color: rgba(255, 255, 255, 0.3);
  }

  .rail-checks button:disabled {
    cursor: default;
  }

  .rail-checks article.needs-attention,
  .rail-checks button.needs-attention {
    background: rgba(247, 183, 51, 0.13);
    border-color: rgba(247, 183, 51, 0.24);
  }

  .rail-checks button.needs-danger {
    background: rgba(240, 100, 35, 0.13);
    border-color: rgba(240, 100, 35, 0.28);
  }

  .rail-checks strong {
    color: #fff;
    font-size: 20px;
    line-height: 1;
  }

  .rail-checks em {
    width: 22px;
    height: 22px;
    display: grid;
    place-items: center;
    border-radius: var(--rst-ui-radius-round);
    color: #bff6d2;
    background: rgba(61, 187, 115, 0.16);
    font-style: normal;
    font-size: 12px;
    font-weight: var(--rst-fw-display);
    animation: rst-check-pop .4s var(--rst-ease-spring) backwards;
    animation-delay: calc(var(--rst-i, 0) * 90ms + 150ms);
  }

  .rail-checks em.is-clear {
    animation: rst-check-pop .4s var(--rst-ease-spring) backwards, rst-check-ring-green 2.2s ease-out 1.5s 2;
  }

  @keyframes rst-check-ring-green {
    0% { box-shadow: 0 0 0 0 rgba(61, 187, 115, .5); }
    100% { box-shadow: 0 0 0 8px rgba(61, 187, 115, 0); }
  }

  .rail-checks article.needs-attention em,
  .rail-checks button.needs-attention em,
  .rail-checks button.needs-danger em {
    color: #fffaf2;
    background: rgba(240, 100, 35, 0.28);
  }

  .planning-workspace {
    min-width: 0;
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(300px, 352px);
    gap: 16px;
    align-items: start;
    padding: clamp(20px, 4vw, 38px);
  }

  .planning-workspace.is-expanded {
    grid-template-columns: minmax(0, 1fr);
  }

  .schedule-board,
  .schedule-rail > section,
  .schedule-lower > section {
    min-width: 0;
    border: 1px solid var(--rst-ui-surface-panel-border);
    border-radius: var(--rst-ui-radius-2xl);
    box-shadow: var(--rst-ui-shadow-card);
  }

  .schedule-board {
    overflow: hidden;
    background:
      radial-gradient(circle at 0% 0%, rgba(240, 100, 35, 0.16), transparent 34%),
      radial-gradient(circle at 100% 0%, rgba(122, 167, 255, 0.12), transparent 38%),
      linear-gradient(180deg, #132235, #0d1724);
  }

  .cockpit-console {
    min-width: 0;
    display: grid;
    grid-template-columns: minmax(280px, 1fr) auto;
    gap: 18px;
    align-items: center;
    padding: 24px 28px 18px;
    color: #fffaf2;
    border-bottom: 1px solid rgba(255, 255, 255, 0.1);
  }

  .cockpit-console__context {
    min-width: 0;
    display: grid;
    gap: 8px;
  }

  .cockpit-console__title {
    min-width: 0;
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: 10px 14px;
  }

  .cockpit-console__context strong {
    min-width: 0;
    overflow: hidden;
    font-size: clamp(24px, 2.4vw, 34px);
    line-height: 0.95;
    letter-spacing: -0.055em;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .cockpit-console__context small,
  .cockpit-search span,
  .cockpit-staff-tools label span {
    color: rgba(255, 250, 242, 0.62);
    font-size: 10px;
    font-weight: var(--rst-fw-display);
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }

  .cockpit-console__controls {
    min-width: 0;
    display: flex;
    flex-wrap: wrap;
    gap: 9px;
    align-items: center;
    justify-content: flex-end;
  }

  .cockpit-view-switch,
  .cockpit-week,
  .period-switch {
    min-width: 0;
    display: inline-flex;
    gap: 6px;
    padding: 4px;
    border: 1px solid rgba(255, 255, 255, 0.12);
    border-radius: var(--rst-ui-radius-xl);
    background: rgba(255, 255, 255, 0.06);
  }

  .cockpit-view-switch,
  .period-switch {
    align-items: center;
  }

  .cockpit-view-switch > span,
  .period-switch > span {
    padding: 0 7px;
    color: rgba(255, 250, 242, 0.5);
    font-size: 10px;
    font-weight: var(--rst-fw-display);
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }

  .cockpit-search {
    min-width: 168px;
    display: grid;
    gap: 4px;
  }

  .cockpit-search input,
  .cockpit-staff-tools select {
    min-height: 38px;
    width: 100%;
    padding: 8px 10px;
    border: 1px solid rgba(255, 255, 255, 0.13);
    border-radius: var(--rst-ui-radius-lg);
    color: #fffaf2;
    background: rgba(255, 255, 255, 0.075);
    font: inherit;
  }

  .cockpit-search input::placeholder {
    color: rgba(255, 250, 242, 0.45);
  }

  .cockpit-staff-tools {
    position: relative;
  }

  .cockpit-staff-tools summary {
    list-style: none;
  }

  .cockpit-staff-tools summary::-webkit-details-marker {
    display: none;
  }

  .cockpit-staff-tools__panel {
    position: absolute;
    z-index: 24;
    top: calc(100% + 8px);
    right: 0;
    width: min(330px, calc(100vw - 28px));
    display: grid;
    gap: 10px;
    padding: 12px;
    border: 1px solid rgba(255, 255, 255, 0.12);
    border-radius: var(--rst-ui-radius-xl);
    background: #142033;
    box-shadow: 0 18px 56px rgba(0, 0, 0, 0.34);
  }

  .cockpit-staff-tools label {
    display: grid;
    gap: 6px;
  }

  .cockpit-view-switch button,
  .cockpit-week button,
  .period-switch button,
  .cockpit-staff-tools summary,
  .cockpit-expand,
  .rail-actions button {
    min-height: 38px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 7px;
    padding: 8px 10px;
    border: 1px solid rgba(255, 255, 255, 0.13);
    border-radius: var(--rst-ui-radius-lg);
    color: inherit;
    background: rgba(255, 255, 255, 0.075);
    font: inherit;
    font-size: 12px;
    font-weight: var(--rst-fw-display);
    cursor: pointer;
  }

  .cockpit-view-switch button.is-active,
  .period-switch button.is-active {
    border-color: rgba(240, 100, 35, 0.64);
    color: #fff;
    background: linear-gradient(135deg, #f06423, #f7a733);
    box-shadow: 0 10px 28px rgba(240, 100, 35, 0.18);
  }

  .cockpit-view-switch button:not(.is-active),
  .period-switch button:not(.is-active) {
    color: rgba(255, 250, 242, 0.68);
  }

  .cockpit-view-switch button:not(.is-active):hover,
  .period-switch button:not(.is-active):hover {
    color: #fffaf2;
  }

  .cockpit-week button {
    min-width: 66px;
  }

  .cockpit-week button:hover,
  .cockpit-view-switch button:hover,
  .cockpit-staff-tools summary:hover,
  .cockpit-expand:hover,
  .rail-actions button:hover {
    transform: translateY(-1px);
    box-shadow: 0 10px 22px rgba(0, 0, 0, 0.14);
  }

  .cockpit-expand {
    border-color: rgba(240, 100, 35, 0.42);
    color: #fff;
    background: linear-gradient(135deg, #f06423, #f7a733);
  }

  .schedule-rail h2 {
    font-size: clamp(24px, 2.6vw, 38px);
    line-height: 0.98;
  }

  .schedule-rail {
    min-width: 0;
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: 14px;
    align-items: start;
  }

  .planning-workspace.is-expanded .schedule-rail {
    grid-template-columns: repeat(2, minmax(260px, 1fr));
  }

  .schedule-rail > section,
  .schedule-lower > section {
    display: grid;
    gap: 12px;
    padding: 16px;
    animation: rst-fade-up 0.5s var(--rst-ease-out) backwards;
  }

  .schedule-rail > section:nth-child(1) { animation-delay: 0.05s; }
  .schedule-rail > section:nth-child(2) { animation-delay: 0.12s; }
  .schedule-rail > section:nth-child(3) { animation-delay: 0.19s; }

  .schedule-lower {
    grid-column: 1 / -1;
    min-width: 0;
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: 16px;
    align-items: start;
  }

  /* Gate + export cards share Timesheet's rail-card language: soft dark
     gradient, 26px radius, tone-tinted gate (green ready / orange blocked). */
  .schedule-rail > .week-actions,
  .schedule-rail > .export-card {
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 26px;
    box-shadow: 0 22px 60px rgba(29, 20, 10, 0.14);
    color: #fffaf2;
    background:
      radial-gradient(circle at 100% 0%, rgba(240, 100, 35, 0.18), transparent 36%),
      linear-gradient(145deg, #211b18, #15191f);
  }

  .schedule-rail > .week-actions.is-ready {
    background:
      radial-gradient(circle at 100% 0%, rgba(66, 216, 132, 0.22), transparent 36%),
      linear-gradient(145deg, #172018, #11191f);
  }

  .schedule-rail > .week-actions.is-blocked {
    background:
      radial-gradient(circle at 100% 0%, rgba(240, 100, 35, 0.24), transparent 36%),
      linear-gradient(145deg, #241915, #15191f);
  }

  .week-actions .planning-kicker,
  .export-card .planning-kicker {
    color: var(--rst-ui-action);
  }

  .export-card h2 {
    color: #fffaf2;
  }

  .export-card .rail-actions button {
    border-color: rgba(255, 255, 255, 0.1);
    color: #fffaf2;
    background: rgba(255, 255, 255, 0.07);
  }

  .rail-actions {
    min-width: 0;
    display: grid;
    gap: 8px;
  }

  .rail-actions {
    grid-template-columns: 1fr;
  }

  .rail-actions button {
    justify-content: flex-start;
    border-color: rgba(255, 255, 255, 0.14);
    color: #fffaf2;
    background: rgba(255, 255, 255, 0.09);
  }

  .rail-actions button:disabled {
    cursor: default;
    opacity: 0.5;
    transform: none;
    box-shadow: none;
  }

  .schedule-rail > .service-lens {
    color: #f8fbff;
    background-color: #0d1b2a;
    background-image:
      radial-gradient(circle at 100% 0%, rgba(122, 167, 255, 0.28), transparent 40%),
      linear-gradient(155deg, rgba(12, 25, 42, 0.98), rgba(18, 31, 48, 0.92));
  }

  .service-lens .planning-kicker {
    color: #f06423;
  }

  .schedule-rail p,
  .service-lens p {
    margin: 0;
    line-height: 1.42;
  }

  .service-lens p {
    color: rgba(255, 250, 242, 0.72);
  }

  .lens-counts,
  .gate-actions {
    display: grid;
    gap: 8px;
  }

  .lens-counts {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }

  .lens-counts div {
    min-width: 0;
    padding: 10px;
    border: 1px solid var(--rst-ui-line);
    border-radius: var(--rst-ui-radius-md);
    background: var(--rst-ui-surface-field-strong);
  }

  .service-lens .lens-counts div {
    border-color: rgba(255, 255, 255, 0.14);
    background: rgba(255, 255, 255, 0.075);
  }

  .lens-counts span {
    color: rgba(255, 250, 242, 0.62);
    font-size: 10px;
    font-weight: var(--rst-fw-display);
    text-transform: uppercase;
  }

  .lens-counts strong {
    display: block;
    font-size: 22px;
  }

  .gate-actions {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }

  .gate-actions button:only-child {
    grid-column: 1 / -1;
  }

  .gate-actions button {
    min-height: 40px;
    padding: 9px 11px;
    border: 1px solid var(--rst-ui-line);
    border-radius: var(--rst-ui-radius-md);
    color: #fffaf2;
    background: rgba(255, 255, 255, 0.09);
    font: inherit;
    font-size: 12px;
    font-weight: var(--rst-fw-display);
    cursor: pointer;
  }

  .gate-actions button:hover {
    background: rgba(255, 255, 255, 0.14);
  }

  .gate-actions button:disabled {
    cursor: default;
    opacity: 0.48;
  }

  .gate-actions button.is-primary {
    border-color: rgba(var(--rst-ui-action-rgb), 0.44);
    color: #fff;
    background: var(--rst-ui-action);
  }

  .gate-actions button.is-primary:hover:not(:disabled) {
    box-shadow: 0 6px 20px rgba(var(--rst-ui-action-rgb), .45);
  }

  .gate-actions button.is-celebrating {
    background: var(--rst-green);
    border-color: var(--rst-green);
    animation: rst-publish-glow .8s ease-out;
  }

  @keyframes rst-publish-glow {
    0% { box-shadow: 0 0 0 0 rgba(64, 200, 120, .6); transform: scale(1); }
    35% { box-shadow: 0 0 0 14px rgba(64, 200, 120, 0); transform: scale(1.04); }
    100% { box-shadow: 0 0 0 14px rgba(64, 200, 120, 0); transform: scale(1); }
  }

  .week-actions.is-celebrating .rail-checks article,
  .week-actions.is-celebrating .rail-checks button {
    border-color: rgba(64, 200, 120, 0.4);
  }

  .gate-actions button.is-danger {
    border-color: rgba(248, 113, 113, 0.42);
    color: #fecaca;
    background: rgba(127, 29, 29, 0.8);
  }

  .schedule-lower > .week-trail {
    color: #19130d;
    background-color: #fff7e8;
    background-image:
      radial-gradient(circle at 100% 0%, rgba(240, 100, 35, 0.18), transparent 40%),
      linear-gradient(160deg, #fff7e8, #efd9b8);
  }

  .week-trail__head {
    display: flex;
    align-items: end;
    justify-content: space-between;
    gap: 12px;
  }

  .week-trail__head strong {
    color: #19130d;
    font-size: 20px;
    line-height: 1;
  }

  .trail-line {
    position: relative;
    display: grid;
    gap: 10px;
    padding-left: 8px;
  }

  .trail-line::before {
    content: '';
    position: absolute;
    top: 8px;
    bottom: 8px;
    left: 17px;
    width: 2px;
    border-radius: var(--rst-ui-radius-pill);
    background: linear-gradient(180deg, #f06423, rgba(240, 100, 35, 0.08));
  }

  .trail-line article {
    position: relative;
    display: grid;
    grid-template-columns: 20px minmax(0, 1fr);
    gap: 10px;
    align-items: start;
  }

  .trail-line article i {
    position: relative;
    z-index: 1;
    width: 20px;
    height: 20px;
    margin-top: 2px;
    border: 3px solid #fff7e8;
    border-radius: var(--rst-ui-radius-round);
    background: #f06423;
    box-shadow: 0 0 0 1px rgba(240, 100, 35, 0.32);
  }

  .trail-line article div,
  .trail-empty {
    padding: 10px;
    border: 1px solid rgba(82, 49, 25, 0.12);
    border-radius: var(--rst-ui-radius-lg);
    background: rgba(255, 255, 255, 0.46);
  }

  .trail-line article strong {
    color: #19130d;
    font-size: 13px;
  }

  .trail-line article p,
  .trail-empty {
    margin: 3px 0 0;
    color: rgba(25, 19, 13, 0.62);
    font-size: 12px;
    line-height: 1.35;
  }

  .trail-line article time {
    display: block;
    margin-top: 7px;
    color: #f06423;
    font-size: 10px;
    font-weight: var(--rst-fw-display);
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }

  @media (max-width: 1180px) {
    .planning-workspace,
    .planning-workspace.is-expanded,
    .planning-workspace.is-expanded .schedule-rail {
      grid-template-columns: 1fr;
    }

    .schedule-rail {
      grid-template-columns: 1fr;
    }

    .schedule-lower {
      grid-template-columns: 1fr;
    }

  }

  @media (max-width: 760px) {
    .planning-hero {
      min-height: auto;
      grid-template-columns: 1fr;
      padding: 22px;
    }

    .planning-hero h1 {
      font-size: clamp(38px, 12vw, 58px);
      white-space: normal;
    }

    .lens-counts {
      grid-template-columns: 1fr;
    }
  }

  @media (max-width: 520px) {
    .planning-workspace {
      padding: 14px;
    }

    .gate-actions {
      grid-template-columns: 1fr;
    }
  }
</style>
