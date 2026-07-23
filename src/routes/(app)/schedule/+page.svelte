<script lang="ts">
  import { tick } from 'svelte';
  import { page } from '$app/state';
  import {
    saveAbsence,
    saveWorkPatternException
  } from '$lib/api/mutations';
  import { invalidPlanningShift, saveSchedule } from '$lib/schedule/schedule-actions';
  import {
    SERVICES,
    addDays,
    addMonths,
    formatHours,
    hoursBetweenClocks,
    mondayFor,
    monthDates,
    monthLabel,
    serviceDisplay,
    serviceLabel,
    todayInTimezone,
    weekdayDateLabel,
    weekdayLabel,
    weekLabel,
    type ServiceKey
  } from '$lib/calendar/date';
  import Drawer from '$lib/components/Drawer.svelte';
  import Dialog from '$lib/components/Dialog.svelte';
  import ExportDialog from '$lib/components/ExportDialog.svelte';
  import RailExportCard from '$lib/operations/RailExportCard.svelte';
  import {
    PLANNING_EXPORT_FIELDS,
    DEFAULT_PLANNING_EXPORT_COLUMNS,
    planningFieldLabel
  } from '$lib/schedule/schedule-export-columns';
  import FeedbackBanner from '$lib/components/FeedbackBanner.svelte';
  import PageScaffold from '$lib/components/PageScaffold.svelte';
  import PageHero from '$lib/components/PageHero.svelte';
  import { workWeekHistoryItems } from '$lib/calendar/week-history';
  import RevisionConflictDialog from '$lib/operations/RevisionConflictDialog.svelte';
  import { downloadCsv } from '$lib/export/csv';
  import OperationsBoard, {
    type BoardChip,
    type BoardServiceCoverageRow,
    type BoardColumn,
    type BoardDayRail,
    type BoardFooterCell,
    type BoardMonthDay,
    type BoardRow,
    type BoardServiceCard,
    type BoardSlot,
    type BoardTone
  } from '$lib/operations/OperationsBoard.svelte';
  import BoardFocus from '$lib/operations/BoardFocus.svelte';
  import CoverageLensFrame from '$lib/operations/CoverageLensFrame.svelte';
  import ScheduleSlotEditor from '$lib/schedule/ScheduleSlotEditor.svelte';
  import {
    buildPlanningWeek,
    coverageIssues,
    defaultPlanningShift,
    planningConflicts,
    planningDraftForWeek,
    planningNotesForWeek,
    planningRequestIdentity,
    planningStatusForWeek,
    type PlanningGridSlot,
    type PlanningNoteDraft,
    type PlanningShiftDraft
  } from '$lib/schedule/schedule-model';
  import { planningCsv } from '$lib/schedule/schedule-export';
  import { friendlyError } from '$lib/api/error-messages';
  import { buildEmployeeColorMap } from '$lib/ui/position-color';
  import { personInitials, shortPersonName } from '$lib/ui/person';
  import { workspaceRealtime } from '$lib/realtime/workspace-realtime.svelte';
  import { workspace } from '$lib/workspace/workspace.svelte';
  import { i18n, t } from '$lib/i18n/i18n.svelte';
  import { restaurantWeather } from '$lib/weather/restaurant-weather.svelte';

  type SchedulePeriod = 'week' | 'month';

  const snapshot = $derived(workspace.operations);
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
  const timezone = $derived(
    snapshot?.restaurant_settings.timezone ||
      workspace.bootstrap?.restaurant_settings.timezone ||
      'Europe/Brussels'
  );
  const today = $derived(todayInTimezone(timezone));
  let weekStart = $state('');
  let lastWeekParam = $state<string | null>(null);
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
  let boardExpanded = $state(false);
  let boardPeriod = $state<SchedulePeriod>('week');
  let selectedDate = $state('');
  let conflictOpen = $state(false);
  let coverageConfirmOpen = $state(false);
  let slotDetailsOpen = $state(false);
  let exportCsvOpen = $state(false);
  let coverageLensOpen = $state(false);
  let coverageLensDate = $state('');
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

  // Honour ?week= deep links (from Home / notifications) on every navigation,
  // reacting only when the param itself changes so manual week stepping stays.
  // The default-week assignment must run unconditionally (not behind an early
  // return) or weekStart stays empty when there is no param at all.
  $effect(() => {
    const requested = page.url.searchParams.get('week');
    if (requested !== lastWeekParam) {
      lastWeekParam = requested;
      if (requested && /^\d{4}-\d{2}-\d{2}$/.test(requested)) {
        weekStart = mondayFor(requested);
      }
    }
    if (!weekStart) weekStart = mondayFor(today);
  });
  $effect(() => {
    if (workspace.activeId && operationsStart && operationsEnd) {
      void workspace.loadOperations(operationsStart, operationsEnd, true).catch(() => undefined);
    }
  });
  $effect(() => {
    if (weatherLocation?.city) void restaurantWeather.load(weatherLocation);
  });

  const status = $derived(
    snapshot
      ? planningStatusForWeek(snapshot, activeWeek)
      : { planning: 'draft' as const, actuals: 'open', revision: 0 }
  );
  // Dirty = the planned *content* differs from what we loaded, independent of
  // object identity, array order, the internal `source` marker, or blank note
  // rows. This is why adding a shift and removing it again returns to clean.
  function planningSignature(shifts: PlanningShiftDraft[], noteList: PlanningNoteDraft[]) {
    const s = shifts
      .map(
        (x) =>
          `${x.employeeId}|${x.weekday}|${x.serviceKey}|${x.areaId}|${x.jobFunctionId}|${x.startsAt}|${x.endsAt}`
      )
      .sort();
    const n = noteList
      .filter((x) => x.note.trim().length > 0)
      .map((x) => `${x.weekday}|${x.serviceKey}|${x.note.trim()}`)
      .sort();
    return JSON.stringify({ s, n });
  }
  const dirty = $derived(planningSignature(draft, notes) !== baseline);
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

  // ---- Week/month browsing ------------------------------------------
  // Publishing and coverage checks always stay scoped to `activeWeek` (see
  // `persist()`/`issues`/`conflicts` above). Month mode only widens what the
  // board *displays* — neighbouring weeks render their committed shifts
  // read-only (via `planningDraftForWeek`, bypassing the live `draft`), the
  // active week keeps its normal editable slots. The service view always shows
  // the whole week (no 5-day "lens").
  const periodDates = $derived.by(() =>
    boardExpanded && boardPeriod === 'month' ? activeMonthDates : grid.days.map((day) => day.date)
  );
  const periodLabel = $derived(
    boardExpanded && boardPeriod === 'month' ? monthLabel(activeWeek, i18n.intlLocale) : weekLabel(activeWeek, i18n.intlLocale)
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

  const periodColumns: BoardColumn[] = $derived(
    periodDates.map((date) => ({
      date,
      label: weekdayLabel(date, i18n.intlLocale),
      day: date.slice(8),
      month: date.slice(5, 7),
      today: date === today,
      future: date > today
    }))
  );
  const periodRosterSlots = $derived(
    Array.from(periodWeekGrids.values())
      .flatMap((periodGrid) => Array.from(periodGrid.slotsByKey.values()))
      .filter((slot) => periodDates.includes(slot.date))
  );
  const periodPlannedShiftCount = $derived(periodRosterSlots.filter((slot) => slot.shift).length);
  const periodAvailableSlotCount = $derived(
    periodRosterSlots.filter((slot) => slot.context.availability === 'available').length
  );
  const publishBlockerCount = $derived(conflicts.length + pendingExceptions.length);
  const publishCheckCount = $derived(publishBlockerCount + issues.length);
  const publishState = $derived(
    publishCheckCount
      ? t(publishCheckCount === 1 ? '{count} check' : '{count} checks', { count: publishCheckCount })
      : dirty
        ? 'Draft changed'
        : status.planning === 'published'
          ? 'Published'
          : 'Draft ready'
  );
  const heroTitle = $derived(
    publishBlockerCount
      ? t(publishBlockerCount === 1 ? '{count} blocker before publish.' : '{count} blockers before publish.', { count: publishBlockerCount })
      : issues.length
        ? t(issues.length === 1 ? '{count} coverage warning.' : '{count} coverage warnings.', { count: issues.length })
      : dirty
        ? t('Unsaved schedule changes.')
        : status.planning === 'published'
          ? t('Schedule is published.')
          : t('Build a clean week.')
  );
  const heroLead = $derived(
    publishBlockerCount
      ? t('Resolve unsafe conflicts and pending schedule requests before employees see the week.')
      : issues.length
        ? t('Coverage gaps stay visible, but you can publish after confirming the risk.')
      : status.planning === 'published'
        ? t('Employees can see the week. Reopen it only when service reality changes.')
        : t('Use confirmed availability as your bench, then commit the right people to Lunch and Evening.')
  );
  const activeFilterCount = $derived(
    (search.trim() ? 1 : 0) + (scope === 'all' ? 0 : 1) + (positionId ? 1 : 0)
  );
  const publishTone = $derived(
    publishBlockerCount
      ? 'blocked'
      : issues.length || dirty || status.actuals === 'open'
        ? 'warning'
        : 'ready'
  );
  const publishSummary = $derived(
    publishBlockerCount
      ? t('Resolve conflicts and schedule requests before employees see the week.')
      : issues.length
        ? t('Coverage gaps will be published as a visible warning.')
      : dirty
        ? t('Save the current draft before publishing.')
        : status.actuals === 'open'
          ? t('Coverage is clean. Timesheet is still open for last week.')
          : t('All coverage checks are green.')
  );
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
          columns: planningColumns,
          translate: t
        })
      : { headers: planningColumns.map(planningFieldLabel), rows: [], filename: '' }
  );
  const planningPreviewTable = $derived(
    exportCsvOpen
      ? {
          headers: planningPreview.headers,
          rows: planningPreview.rows,
          rowCount: planningPreview.rows.length,
          note: t(planningPreview.rows.length === 1 ? '{count} planned shift' : '{count} planned shifts', {
            count: planningPreview.rows.length
          })
        }
      : null
  );

  // ---- Board adapters -------------------------------------------------
  // Maps PlanningGridSlot-shaped data onto the plain BoardX types the shared
  // OperationsBoard renders. Publish/coverage logic above never touches this
  // section; this only decides how things look.

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
    if (slot.shift) return `${slot.shift.startsAt}–${slot.shift.endsAt}`;
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

  // Everyone eligible to be placed on this service: unplanned employees who are
  // not blocked (no approved leave, no approved schedule change, not marked
  // unavailable). Fixed-schedule employees with no availability record are
  // included, so the manager always sees who they can add.
  function benchSlotsFor(date: string, serviceKey: ServiceKey) {
    return serviceSlotsFor(date, serviceKey).filter(
      (slot) =>
        !slot.shift &&
        slot.context.absence !== 'approved' &&
        slot.context.workPatternException !== 'approved' &&
        slot.context.availability !== 'unavailable'
    );
  }

  function coverageIssueFor(date: string, serviceKey: ServiceKey) {
    return issues.find((issue) => issue.date === date && issue.serviceKey === serviceKey);
  }

  // The Service board's core: for a service, break coverage down by area × role
  // so a manager reads exactly which requirement is short and who fills it.
  function serviceCoverageFor(date: string, serviceKey: ServiceKey): BoardServiceCoverageRow[] {
    if (!snapshot) return [];
    const weekdayNumber = (() => {
      const day = new Date(`${date}T12:00:00Z`).getUTCDay();
      return day === 0 ? 7 : day;
    })();
    const requirements = snapshot.coverage_requirements.filter(
      (requirement) =>
        requirement.active &&
        requirement.service_key === serviceKey &&
        Number(requirement.required_count) > 0
    );
    const planned = plannedSlotsFor(date, serviceKey);
    const activeDate = mondayFor(date) === activeWeek;
    const keys = [...new Set(requirements.map((r) => `${r.area_id}|${r.job_function_id}`))];
    const rows = keys.flatMap((key) => {
      const [areaId, jobFunctionId] = key.split('|');
      const matching = requirements.filter(
        (r) => r.area_id === areaId && r.job_function_id === jobFunctionId
      );
      const requirement =
        matching.find((r) => r.weekday === weekdayNumber) ??
        matching.find((r) => r.weekday === null || r.coverage_scope === 'default');
      if (!requirement) return [];
      const required = Number(requirement.required_count);
      const assigned = planned.filter(
        (slot) => slot.shift?.areaId === areaId && slot.shift?.jobFunctionId === jobFunctionId
      );
      const chips: BoardChip[] = assigned.map((slot) => ({
        key: slot.key,
        initials: personInitials(slot.employeeName),
        tone: slotToneOf(slot),
        name: slot.employeeName,
        detail: slotCaptionOf(slot),
        color: employeeColor.get(slot.employeeId),
        onclick: activeDate ? () => openChip(date, slot.key) : () => jumpToWeek(date),
        ariaLabel: `${date} ${slot.employeeName} ${t(serviceLabel(slot.serviceKey))} ${t(slotCaptionOf(slot))}`
      }));
      return [
        {
          key,
          areaLabel: areaNameOf(areaId),
          roleLabel: jobNameOf(jobFunctionId),
          planned: assigned.length,
          required,
          tone: (assigned.length < required ? 'short' : 'ok') as 'short' | 'ok',
          chips,
          // Coverage is a read-only lens: clicking a row jumps to the Roster for
          // that day, where staff are actually placed.
          onLocate: activeDate
            ? () => {
                selectedDate = date;
              }
            : () => jumpToWeek(date)
        }
      ];
    });
    return rows.sort((a, b) =>
      a.tone === b.tone ? a.areaLabel.localeCompare(b.areaLabel) : a.tone === 'short' ? -1 : 1
    );
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

  function employeePeriodHours(employeeId: string) {
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
    const slot = grid.slotsByKey.get(key);
    if (slot?.shift) slotDetailsOpen = true;
  }

  // Open one deliberate action surface for planning, editing, request review,
  // and removal. A roster tap must never delete a shift directly.
  function openRosterEditor(date: string, key: string) {
    selectedDate = date;
    selectedKey = key;
    slotDetailsOpen = true;
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

  // Publish-gate breakdown: turn the abstract counts into a specific, clickable
  // list so a manager sees exactly which area/role/service is short or in
  // conflict, and can jump straight to it.
  let gateExpanded = $state<'' | 'gaps' | 'conflicts'>('');
  function toggleGate(panel: 'gaps' | 'conflicts') {
    gateExpanded = gateExpanded === panel ? '' : panel;
  }
  function areaNameOf(id: string) {
    return snapshot?.work_areas.find((area) => area.id === id)?.name ?? 'Any area';
  }
  function jobNameOf(id: string) {
    return snapshot?.job_functions.find((job) => job.id === id)?.name ?? 'Any role';
  }
  function employeeNameOf(id: string) {
    return snapshot?.employees.find((employee) => employee.id === id)?.display_name ?? 'Employee';
  }
  function conflictShiftDate(shift: PlanningShiftDraft) {
    return addDays(activeWeek, shift.weekday - 1);
  }
  function conflictReasonOf(shift: PlanningShiftDraft): string {
    const context = grid.slotsByKey.get(
      `${shift.employeeId}|${conflictShiftDate(shift)}|${shift.serviceKey}`
    )?.context;
    if (context?.absence === 'approved') return 'On approved leave';
    if (context?.absence === 'pending') return 'Leave requested';
    if (context?.workPatternException === 'approved') return 'Schedule change approved';
    if (context?.workPatternException === 'pending') return 'Schedule change requested';
    if (context?.availability === 'unavailable') return 'Marked unavailable';
    return 'Conflict';
  }

  const employeeColor = $derived(
    snapshot
      ? buildEmployeeColorMap(snapshot.job_functions, snapshot.employee_job_functions)
      : new Map<string, string>()
  );

  // Coverage lens: per-area coverage for one day, both services, in the same
  // slot language as Home's floor card — and you can fill gaps from here. Reads
  // the live draft so placements and removals show immediately.
  const coverageLensWeekday = $derived.by(() => {
    const day = new Date(`${coverageLensDate || activeWeek}T00:00:00Z`).getUTCDay();
    return ((day + 6) % 7) + 1; // Mon = 1 … Sun = 7
  });
  const coverageLensAreas = $derived.by(() => {
    if (!snapshot) return [];
    const weekday = coverageLensWeekday;
    return snapshot.work_areas
      .filter((area) => area.active)
      .sort((left, right) => left.sort_order - right.sort_order || left.name.localeCompare(right.name))
      .map((area) => {
        const services = (['lunch', 'evening'] as const).map((serviceKey) => {
          const required = snapshot.coverage_requirements
            .filter(
              (requirement) =>
                requirement.active &&
                requirement.area_id === area.id &&
                requirement.service_key === serviceKey &&
                Number(requirement.required_count) > 0 &&
                (requirement.weekday === weekday ||
                  requirement.weekday === null ||
                  requirement.coverage_scope === 'default')
            )
            .reduce((total, requirement) => total + Number(requirement.required_count ?? 0), 0);
          const people = draft
            .filter(
              (shift) =>
                shift.weekday === weekday && shift.areaId === area.id && shift.serviceKey === serviceKey
            )
            .map((shift) => ({
              id: shift.employeeId,
              name: snapshot.employees.find((employee) => employee.id === shift.employeeId)?.display_name ?? ''
            }))
            .filter((person) => person.name);
          const planned = people.length;
          const status = (required === 0
            ? planned > 0
              ? 'covered'
              : 'none'
            : planned < required
              ? 'under'
              : planned > required
                ? 'over'
                : 'covered') as 'under' | 'covered' | 'over' | 'none';
          return {
            serviceKey,
            icon: serviceKey === 'evening' ? '☾' : '☀',
            required,
            planned,
            people,
            gaps: Math.max(0, required - planned),
            status
          };
        });
        return { id: area.id, name: area.name, services };
      });
  });

  let coverageLensPicker = $state<{ areaId: string; serviceKey: ServiceKey } | null>(null);

  type LensCandidate = {
    id: string;
    name: string;
    status: 'available' | 'partial' | 'nopref' | 'pending' | 'unavailable' | 'off';
    label: string;
    blocked: boolean;
    otherService: '' | 'lunch' | 'evening';
    rank: number;
  };

  // The lens picker ranks who you can add by real availability that day, so the
  // decision is informed: available first, soft "no preference" next, then
  // pending requests, and hard blocks (unavailable / time off) last and locked.
  function availableForLens(serviceKey: ServiceKey): LensCandidate[] {
    if (!snapshot) return [];
    const date = coverageLensDate || activeWeek;
    const placed = new Set(
      draft
        .filter((shift) => shift.weekday === coverageLensWeekday && shift.serviceKey === serviceKey)
        .map((shift) => shift.employeeId)
    );
    const otherKey: ServiceKey = serviceKey === 'evening' ? 'lunch' : 'evening';
    const onOther = new Set(
      draft
        .filter((shift) => shift.weekday === coverageLensWeekday && shift.serviceKey === otherKey)
        .map((shift) => shift.employeeId)
    );
    return snapshot.employees
      .filter((employee) => employee.active && !placed.has(employee.id))
      .map((employee) => {
        const context = grid.slotsByKey.get(`${employee.id}|${date}|${serviceKey}`)?.context;
        let status: LensCandidate['status'] = 'nopref';
        let label = 'No preference';
        let rank = 2;
        let blocked = false;
        if (context?.absence === 'approved') {
          status = 'off';
          label = 'Time off';
          rank = 5;
          blocked = true;
        } else if (context?.workPatternException === 'approved') {
          status = 'off';
          label = 'Schedule change';
          rank = 5;
          blocked = true;
        } else if (context?.availability === 'unavailable') {
          status = 'unavailable';
          label = 'Unavailable';
          rank = 4;
          blocked = true;
        } else if (context?.absence === 'pending') {
          status = 'pending';
          label = 'Leave pending';
          rank = 3;
        } else if (context?.workPatternException === 'pending') {
          status = 'pending';
          label = 'Change pending';
          rank = 3;
        } else if (context?.availability === 'available') {
          status = 'available';
          label = 'Available';
          rank = 0;
        } else if (context?.availability === 'partial') {
          status = 'partial';
          label = 'Partly available';
          rank = 1;
        }
        return {
          id: employee.id,
          name: employee.display_name,
          status,
          label,
          blocked,
          otherService: (onOther.has(employee.id) ? otherKey : '') as LensCandidate['otherService'],
          rank
        };
      })
      .sort((left, right) => left.rank - right.rank || left.name.localeCompare(right.name));
  }

  function toggleLensPicker(areaId: string, serviceKey: ServiceKey) {
    coverageLensPicker =
      coverageLensPicker?.areaId === areaId && coverageLensPicker?.serviceKey === serviceKey
        ? null
        : { areaId, serviceKey };
  }

  function placeInLens(areaId: string, serviceKey: ServiceKey, employeeId: string) {
    coverageLensPicker = null;
    if (!snapshot || !editable) return;
    const base = defaultPlanningShift(snapshot, {
      employeeId,
      weekday: coverageLensWeekday,
      date: coverageLensDate || activeWeek,
      serviceKey
    });
    if (!base) return;
    draft = [...draft, { ...base, areaId }];
    feedback = 'Shift added from the coverage lens.';
    feedbackTone = 'success';
  }

  function removeFromLens(areaId: string, serviceKey: ServiceKey, employeeId: string) {
    if (!editable) return;
    let removed = false;
    draft = draft.filter((shift) => {
      if (
        !removed &&
        shift.weekday === coverageLensWeekday &&
        shift.serviceKey === serviceKey &&
        shift.areaId === areaId &&
        shift.employeeId === employeeId
      ) {
        removed = true;
        return false;
      }
      return true;
    });
  }

  function openCoverageLens() {
    coverageLensDate =
      selectedDate || grid.days.find((day) => day.today)?.date || grid.days[0]?.date || activeWeek;
    coverageLensPicker = null;
    coverageLensOpen = true;
  }

  const boardRows: BoardRow[] = $derived(
    visibleRows.map((row) => ({
      id: row.id,
      name: shortPersonName(row.name),
      meta: row.meta || 'Staff',
      color: employeeColor.get(row.id),
      avatarTone: attentionEmployees.has(row.id) ? 'danger' : 'neutral',
      totalLabel: formatHours(employeePeriodHours(row.id))
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
      color: slot.shift ? employeeColor.get(slot.employeeId) : undefined,
      selected: selectedKey === slot.key,
      onclick: isActiveWeekDate ? () => openRosterEditor(date, slot.key) : () => jumpToWeek(date),
      ariaLabel: `${date} ${slot.employeeName} ${t(serviceLabel(slot.serviceKey))} ${t(slotCaptionOf(slot))}`
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
      const chips: BoardChip[] = planned.map((slot) => ({
        key: slot.key,
        initials: personInitials(slot.employeeName),
        tone: slotToneOf(slot),
        name: slot.employeeName,
        detail: slotCaptionOf(slot),
        area: slot.truth.plan?.area,
        color: employeeColor.get(slot.employeeId),
        selected: selectedKey === slot.key,
        onclick: isActiveWeekDate ? () => openChip(date, slot.key) : () => jumpToWeek(date),
        ariaLabel: `${date} ${slot.employeeName} ${service.label} ${slotCaptionOf(slot)}`
      }));
      // Service is a read-only coverage lens: no bench / fill here — placement
      // happens in the Roster (a coverage row click jumps there).
      return {
        id: `svc-${date}-${serviceKey}`,
        serviceKey,
        icon: service.icon,
        label: service.label,
        tone: serviceToneFor(date, serviceKey),
        summaryValue: serviceStatusTextFor(date, serviceKey),
        onHeaderClick: isActiveWeekDate
          ? () => {
              selectedDate = date;
            }
          : () => jumpToWeek(date),
        chips,
        coverage: serviceCoverageFor(date, serviceKey)
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
    const key = [
      weekStart,
      week.revision,
      snapshot.planned_shifts.length,
      snapshot.weekly_notes.length,
      snapshot.recurring_schedule_slots.length,
      snapshot.absences.length,
      snapshot.work_pattern_exceptions.length
    ].join('|');
    if (key === loadedKey) return;
    draft = planningDraftForWeek(snapshot, weekStart);
    notes = planningNotesForWeek(snapshot, weekStart);
    baseline = planningSignature(draft, notes);
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

  function chooseWeek(value: string) {
    if (!value) return;
    if (dirty) {
      feedback = 'Save or cancel this week before choosing another week.';
      feedbackTone = 'warning';
      return;
    }
    weekStart = mondayFor(value);
    selectedDate = value;
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
      slot.context.absence !== 'pending' &&
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

  function cancelChanges() {
    if (!snapshot) return;
    draft = planningDraftForWeek(snapshot, weekStart);
    notes = planningNotesForWeek(snapshot, weekStart);
    baseline = planningSignature(draft, notes);
    feedback = 'Unsaved schedule changes were discarded.';
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
    return new Intl.DateTimeFormat(i18n.intlLocale, {
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    }).format(new Date(value));
  }

  async function cancelSelectedLeave(): Promise<boolean> {
    if (!snapshot || !workspace.activeId || !selectedSlot) return false;
    const absenceId = planningRequestIdentity(selectedSlot.context, 'absence');
    const absence = snapshot.absences.find(
      (item) =>
        item.id === absenceId &&
        item.employee_id === selectedSlot.employeeId &&
        item.start_date <= selectedSlot.date &&
        item.end_date >= selectedSlot.date &&
        (!item.service_key || item.service_key === selectedSlot.serviceKey) &&
        (item.status === 'pending' || item.status === 'approved')
    );
    if (!absence) {
      feedback = 'The leave request could not be found. Refresh and try again.';
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
          reason: 'Cancelled explicitly while scheduling an overlapping shift.'
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
      feedback = 'Leave cancelled with a schedule audit event.';
      feedbackTone = 'success';
      return true;
    } catch (error) {
      conflictOpen = (error instanceof Error ? error.message : String(error)).includes('CONFLICT:');
      feedback = friendlyError(error);
      feedbackTone = 'danger';
      return false;
    }
  }

  // Approve or reject a pending leave request straight from the roster slot,
  // the same way fixed-schedule changes are resolved — managers should not have
  // to leave Schedule to clear a holiday.
  async function resolveSelectedLeave(action: 'approve' | 'reject'): Promise<boolean> {
    if (!snapshot || !workspace.activeId || !selectedSlot) return false;
    const absenceId = planningRequestIdentity(selectedSlot.context, 'absence');
    const absence = snapshot.absences.find(
      (item) =>
        item.id === absenceId &&
        item.employee_id === selectedSlot.employeeId &&
        item.start_date <= selectedSlot.date &&
        item.end_date >= selectedSlot.date &&
        (!item.service_key || item.service_key === selectedSlot.serviceKey) &&
        item.status === 'pending'
    );
    if (!absence) {
      feedback = 'The leave request could not be found. Refresh and try again.';
      feedbackTone = 'danger';
      return false;
    }
    try {
      await saveAbsence({
        restaurantId: workspace.activeId,
        employeeId: selectedSlot.employeeId,
        absenceId: absence.id,
        action,
        payload: {
          reason: action === 'approve' ? 'Approved from Schedule.' : 'Rejected from Schedule.'
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
      feedback = action === 'approve' ? 'Leave approved.' : 'Leave rejected.';
      feedbackTone = 'success';
      return true;
    } catch (error) {
      feedback = friendlyError(error);
      feedbackTone = 'danger';
      return false;
    }
  }

  async function resolveSelectedException(
    action: 'approve' | 'reject' | 'cancel_for_planning'
  ): Promise<boolean> {
    const exceptionId = selectedSlot
      ? planningRequestIdentity(selectedSlot.context, 'work_pattern_exception')
      : null;
    const exception = snapshot?.work_pattern_exceptions.find(
      (item) =>
        item.id === exceptionId &&
        item.employee_id === selectedSlot?.employeeId &&
        item.start_date <= selectedSlot.date &&
        item.end_date >= selectedSlot.date &&
        (!item.service_key || item.service_key === selectedSlot.serviceKey) &&
        (item.status === 'pending' || item.status === 'approved')
    );
    if (!workspace.activeId || !selectedSlot || !exception) {
      feedback = 'The fixed-schedule change could not be found. Refresh and try again.';
      feedbackTone = 'danger';
      return false;
    }
    try {
      await saveWorkPatternException({
        restaurantId: workspace.activeId,
        employeeId: selectedSlot.employeeId,
        workPatternExceptionId: exception.id,
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
      await workspaceRealtime.publish('planning-saved', {
        restaurantId: workspace.activeId,
        revision: workspace.operations
          ? planningStatusForWeek(workspace.operations, activeWeek).revision
          : null,
        source: 'planning'
      });
      feedback =
        action === 'approve'
          ? 'Fixed-schedule change approved.'
          : action === 'reject'
            ? 'Fixed-schedule change rejected.'
            : 'Fixed-schedule change cancelled with a schedule audit event.';
      feedbackTone = 'success';
      return true;
    } catch (error) {
      feedback = friendlyError(error);
      feedbackTone = 'danger';
      return false;
    }
  }

  async function persist(
    targetStatus: 'draft' | 'published',
    options: { allowCoverageGaps?: boolean; allowConflicts?: boolean } = {}
  ) {
    if (!snapshot || !workspace.activeId || saving) return;
    // Publishing is never hard-blocked by coverage gaps or availability/leave
    // conflicts — they are surfaced as confirmable warnings so the manager
    // stays in control. Only genuinely invalid shift times stop a publish.
    if (invalidPlanningShift(draft)) {
      feedback = 'Every planned shift needs a valid start and end time.';
      feedbackTone = 'danger';
      return;
    }
    saving = true;
    feedback = '';
    try {
      await saveSchedule({
        restaurantId: workspace.activeId,
        weekStart: activeWeek,
        status: targetStatus,
        shifts: draft,
        notes,
        expectedRevision: status.revision,
        wasPublished: status.planning === 'published',
        allowCoverageGaps: options.allowCoverageGaps,
        allowConflicts: options.allowConflicts
      });
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
        coverageConfirmOpen = false;
        setTimeout(() => (justPublished = false), 1500);
      }
    } catch (error) {
      conflictOpen = (error instanceof Error ? error.message : String(error)).includes('CONFLICT:');
      feedback = friendlyError(error);
      feedbackTone = 'danger';
    } finally {
      saving = false;
    }
  }

  function requestPublish() {
    // Coverage gaps, availability/leave conflicts and pending requests never
    // block publishing — they route through one clear confirm. A clean week
    // publishes straight away.
    if (issues.length || conflicts.length || pendingExceptions.length) {
      coverageConfirmOpen = true;
      return;
    }
    void persist('published', { allowCoverageGaps: true, allowConflicts: conflicts.length > 0 });
  }

  const publishWarnings = $derived([
    ...(conflicts.length
      ? [
          t(conflicts.length === 1 ? '{count} availability or leave conflict' : '{count} availability or leave conflicts', {
            count: conflicts.length
          })
        ]
      : []),
    ...(pendingExceptions.length
      ? [
          t(pendingExceptions.length === 1 ? '{count} pending time-off request' : '{count} pending time-off requests', {
            count: pendingExceptions.length
          })
        ]
      : []),
    ...(issues.length
      ? [t(issues.length === 1 ? '{count} coverage gap' : '{count} coverage gaps', { count: issues.length })]
      : [])
  ]);
</script>

<svelte:head><title>{t('Schedule')} · restogogo</title></svelte:head>

{#if snapshot}
  {#snippet pageHeader()}
    {#if !boardExpanded}
      <PageHero
        heroClass="is-wide-command"
        eyebrow={`${weekLabel(activeWeek, i18n.intlLocale)} · ${status.planning === 'published' ? t('Published schedule') : t('Draft schedule')}`}
        titleId="planning-title"
        title={heroTitle}
        subtitle={heroLead}
      >
        {#snippet command()}
          <div class="page-hero__command" aria-label={t('Schedule command signal')}>
            <div class={`planning-hero__publish is-${publishTone}`} class:is-blocked={publishBlockerCount > 0} class:is-dirty={dirty}>
              <div class="publish-dial">
                <span><i></i> {t('Publish gate')}</span>
                <strong>{t(publishState)}</strong>
                <small>{t(publishSummary)}</small>
              </div>
            </div>
          </div>
        {/snippet}
      </PageHero>
      <FeedbackBanner message={feedback} tone={feedbackTone} />
    {/if}
  {/snippet}
  {#snippet boardSection()}
        <header class="cockpit-console" aria-label={t('Schedule cockpit controls')}>
          <div class="cockpit-console__context">
            <span class="planning-kicker">{t('Schedule cockpit')} · {t('Roster grid')}</span>
            <div class="cockpit-console__title" data-tour="sch-week">
              <strong>{periodLabel}</strong>
              <span class={`week-status is-${status.planning === 'published' ? 'published' : 'draft'}`}>
                {status.planning === 'published' ? t('Published') : t('Draft')}
              </span>
              <small>{visibleRows.length} {t('people')} · {periodPlannedShiftCount} {t('shifts')} · {periodAvailableSlotCount} {t('open')}</small>
            </div>
          </div>

          <div class="cockpit-console__controls">
            <button type="button" class="cockpit-coverage" onclick={openCoverageLens} data-tour="sch-coverage">
              <span aria-hidden="true"><svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="2.5" width="5" height="5" rx="1"/><rect x="9" y="2.5" width="5" height="5" rx="1"/><rect x="2" y="9" width="5" height="5" rx="1"/><rect x="9" y="9" width="5" height="5" rx="1"/></svg></span>
              <b>{t('Coverage')}</b>
            </button>

            {#if boardExpanded}
              <div class="period-switch" aria-label={t('Schedule period')}>
                <button
                  type="button"
                  class:is-active={boardPeriod === 'week'}
                  aria-pressed={boardPeriod === 'week'}
                  onclick={() => (boardPeriod = 'week')}
                >{t('Week')}</button>
                <button
                  type="button"
                  class:is-active={boardPeriod === 'month'}
                  aria-pressed={boardPeriod === 'month'}
                  onclick={() => (boardPeriod = 'month')}
                >{t('Month')}</button>
              </div>
            {/if}

            <div class="cockpit-week" aria-label={t('Choose period')} data-tour="sch-period">
              <button type="button" aria-label={t('Previous period')} onclick={() => changePeriod(-1)}>
                &lsaquo;
              </button>
              <label class="week-picker" aria-label={t('Week starting')}>
                <input type="date" value={activeWeek} onchange={(event) => chooseWeek(event.currentTarget.value)} />
              </label>
              <button type="button" aria-label={t('Next period')} onclick={() => changePeriod(1)}>
                &rsaquo;
              </button>
            </div>

            {#if boardExpanded || activeFilterCount}
              <details class="cockpit-staff-tools">
                <summary>
                  {t('Staff tools')}{activeFilterCount ? ` · ${activeFilterCount}` : ''}
                </summary>
                <div class="cockpit-staff-tools__panel">
                  <label class="cockpit-search">
                    <span>{t('Find staff')}</span>
                    <input bind:value={search} placeholder={t('Name, role, station...')} />
                  </label>
                  <label>
                    <span>{t('Show')}</span>
                    <select bind:value={scope}>
                      <option value="all">{t('All employees')}</option>
                      <option value="scheduled">{t('Scheduled only')}</option>
                      <option value="conflicts">{t('Needs attention')}</option>
                    </select>
                  </label>
                  <label>
                    <span>{t('Position')}</span>
                    <select bind:value={positionId}>
                      <option value="">{t('All positions')}</option>
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
              aria-label={t(boardExpanded ? 'Exit full screen' : 'Expand to full screen')}
              title={t(boardExpanded ? 'Exit full screen' : 'Expand to full screen')}
            >{boardExpanded ? '✕' : '⤢'}</button>
          </div>
        </header>

        <OperationsBoard
          view="roster"
          periodMode={boardExpanded ? boardPeriod : 'week'}
          expanded={boardExpanded}
          columns={periodColumns}
          weatherFor={(date) => restaurantWeather.dailyFor(date)}
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
            {t('Monthly focus is a review lens only. Publish and coverage checks still apply to {week}.', { week: weekLabel(activeWeek, i18n.intlLocale) })}
          </p>
        {/if}
    {/snippet}

  <PageScaffold header={pageHeader} label={t('Schedule workspace')}>
    {#if boardExpanded}
      <BoardFocus label="Schedule focus" onclose={() => { boardExpanded = false; boardPeriod = 'week'; }}>
        <div class="schedule-board">
          {@render boardSection()}
        </div>
      </BoardFocus>
    {:else}
      <div class="planning-workspace">
        <section class="schedule-board" aria-label={t('Weekly service board')} data-tour="sch-grid">
          {@render boardSection()}
        </section>

        <aside class="schedule-rail" aria-label={t('Schedule inspector')}>
          <section class={`week-actions is-${publishTone}`} class:is-celebrating={justPublished} aria-label={t('Schedule publish gate')} data-tour="sch-gate">
            <span class="planning-kicker">{t('Publish gate')}</span>
            <h2>{status.planning === 'published' ? t('Published week') : publishCheckCount ? t('{count} checks', { count: publishCheckCount }) : dirty ? t('Save changes first') : t('Ready when you are')}</h2>
            <p>{publishSummary}</p>
            <div class="rail-checks" aria-label={t('Publish checks')}>
              <button type="button" class:needs-attention={issues.length > 0} class:is-open={gateExpanded === 'gaps'} style="--rst-i:0" disabled={!issues.length} onclick={() => toggleGate('gaps')}>
                <strong>{issues.length}</strong>
                <span>{t('coverage gaps')}{issues.length ? ` · ${t('click to inspect')}` : ''}</span>
                <em class:is-clear={!issues.length}>{issues.length ? '!' : '✓'}</em>
              </button>
              <button type="button" class:needs-danger={conflicts.length > 0} class:is-open={gateExpanded === 'conflicts'} style="--rst-i:1" disabled={!conflicts.length} onclick={() => toggleGate('conflicts')}>
                <strong>{conflicts.length}</strong>
                <span>{t('slot conflicts')}{conflicts.length ? ` · ${t('click to inspect')}` : ''}</span>
                <em class:is-clear={!conflicts.length}>{conflicts.length ? '!' : '✓'}</em>
              </button>
              <article class:needs-attention={pendingExceptions.length > 0} style="--rst-i:2">
                <strong>{pendingExceptions.length}</strong>
                <span>{t('schedule requests')}</span>
                <em class:is-clear={!pendingExceptions.length}>{pendingExceptions.length ? '!' : '✓'}</em>
              </article>
            </div>

            {#if gateExpanded === 'gaps' && issues.length}
              <ul class="gate-issues" aria-label={t('Coverage gaps')}>
                {#each issues as issue (`${issue.date}-${issue.serviceKey}-${issue.areaId}-${issue.jobFunctionId}`)}
                  <li>
                    <button type="button" onclick={() => scrollToService(issue.date, issue.serviceKey)}>
                      <span class="gate-issue__where">{areaNameOf(issue.areaId)} · {jobNameOf(issue.jobFunctionId)}</span>
                      <span class="gate-issue__when">{weekdayDateLabel(issue.date, i18n.intlLocale)} · {t(serviceLabel(issue.serviceKey))}</span>
                      <em class="is-short">{issue.planned}/{issue.required}</em>
                    </button>
                  </li>
                {/each}
              </ul>
            {/if}
            {#if gateExpanded === 'conflicts' && conflicts.length}
              <ul class="gate-issues" aria-label={t('Slot conflicts')}>
                {#each conflicts as shift (`${shift.employeeId}-${shift.weekday}-${shift.serviceKey}`)}
                  <li>
                    <button type="button" onclick={() => scrollToService(conflictShiftDate(shift), shift.serviceKey)}>
                      <span class="gate-issue__where">{employeeNameOf(shift.employeeId)}</span>
                      <span class="gate-issue__when">{weekdayDateLabel(conflictShiftDate(shift), i18n.intlLocale)} · {t(serviceLabel(shift.serviceKey))}</span>
                      <em class="is-danger">{conflictReasonOf(shift)}</em>
                    </button>
                  </li>
                {/each}
              </ul>
            {/if}
            <div class="gate-actions" data-tour="sch-publish">
              {#if status.planning === 'published'}
                <button
                  type="button"
                  class="is-danger"
                  disabled={saving}
                  onclick={() => persist('draft')}
                >
                  {t(saving ? 'Reverting…' : 'Revert to draft')}
                </button>
              {:else}
                <button type="button" disabled={!dirty || saving} onclick={cancelChanges}>{t('Cancel')}</button>
                <button
                  type="button"
                  disabled={!dirty || !editable || saving}
                  onclick={() => persist('draft')}
                >
                  {t(saving ? 'Saving…' : 'Save draft')}
                </button>
                <button
                  type="button"
                  class="is-primary"
                  class:is-celebrating={justPublished}
                  disabled={!editable || saving}
                  onclick={requestPublish}
                >
                  {t(saving ? 'Publishing…' : justPublished ? 'Published ✓' : 'Publish schedule')}
                </button>
              {/if}
            </div>
            {#if status.planning !== 'published'}
              <div class="gate-tools">
                <button type="button" disabled={!editable || saving} onclick={copyPreviousWeek}>
                  {t('Copy previous week')}
                </button>
              </div>
            {/if}
          </section>

          <RailExportCard
            dataTour="sch-export"
            eyebrow="Schedule export"
            title="Preview before sharing."
            description="Column order, draft preview and shared handoff stay in the export wizard."
            primaryLabel="Schedule CSV"
            ariaLabel="Schedule exports"
            onprimary={() => (exportCsvOpen = true)}
          />
        </aside>

        <section class="schedule-lower schedule-lower--history" aria-label={t('Schedule history')}>
          <section class="week-trail" aria-label={t('Schedule week trail')}>
            <div class="week-trail__head">
              <span class="planning-kicker">{t('Week trail')}</span>
              <strong>{t('Schedule story')}</strong>
            </div>
            <div class="trail-line">
              {#each historyItems.slice(0, 4) as item (item.id)}
                <article>
                  <i></i>
                  <div>
                    <strong>{t(item.title)}</strong>
                    {#if item.detail}
                      <p>{t(item.detail)}</p>
                    {/if}
                    <time datetime={item.when}>{formatTrailTime(item.when)}</time>
                  </div>
                </article>
              {:else}
                <p class="trail-empty">{t('No schedule decisions yet. Publish, reopen, or finalize the week to create the audit trail.')}</p>
              {/each}
            </div>
          </section>
        </section>
      </div>
    {/if}

  <Drawer
    open={slotDetailsOpen && Boolean(selectedSlot)}
    title={selectedSlot ? `${selectedSlot.employeeName} · ${t(serviceLabel(selectedSlot.serviceKey))}` : t('Schedule details')}
    description={selectedSlot ? `${selectedSlot.date} · ${t(editable ? 'Draft editing' : 'Read only')}` : ''}
    onclose={() => (slotDetailsOpen = false)}
  >
    {#if selectedSlot}
      <ScheduleSlotEditor
        {snapshot}
        slot={selectedSlot}
        {draft}
        {notes}
        {editable}
        onchange={(value) => (draft = value)}
        onnotes={(value) => (notes = value)}
        oncancelleave={cancelSelectedLeave}
        onresolveleave={resolveSelectedLeave}
        onresolveexception={resolveSelectedException}
      />
    {/if}
  </Drawer>

  <CoverageLensFrame
    open={coverageLensOpen}
    description={coverageLensDate ? weekdayLabel(coverageLensDate, i18n.intlLocale) : ''}
    days={grid.days}
    activeDate={coverageLensDate}
    onselect={(date) => (coverageLensDate = date)}
    onclose={() => (coverageLensOpen = false)}
  >
    <div class="lens-rooms">
        {#each coverageLensAreas as area (area.id)}
          <div class="lens-room">
            <div class="lens-room__head">
              <strong>{area.name}</strong>
              {#if area.services.some((service) => service.status === 'under')}
                <span class="lens-flag is-under">{t('Short')}</span>
              {:else}
                <span class="lens-flag is-ok">{t('Covered')}</span>
              {/if}
            </div>
            {#each area.services as service (service.serviceKey)}
              <div class={`lens-srow is-${service.status}`}>
                <span class="lens-srow__lead">
                  <b class={`lens-srow__icon is-${service.serviceKey}`}>{service.icon}</b>
                  <span class="lens-srow__count">{service.planned}/{service.required || service.planned}</span>
                </span>
                <span class="lens-srow__slots">
                  {#each service.people as person (person.id)}
                    {#if editable}
                      <button
                        type="button"
                        class="lens-slot is-filled is-removable"
                        style={employeeColor.get(person.id) ? `--avatar-color:${employeeColor.get(person.id)};` : undefined}
                        title={`${person.name} — ${t('Remove')}`}
                        onclick={() => removeFromLens(area.id, service.serviceKey, person.id)}
                      >{personInitials(person.name)}</button>
                    {:else}
                      <span
                        class="lens-slot is-filled"
                        style={employeeColor.get(person.id) ? `--avatar-color:${employeeColor.get(person.id)};` : undefined}
                        title={person.name}
                      >{personInitials(person.name)}</span>
                    {/if}
                  {/each}
                  {#if editable}
                    {#each Array(service.gaps) as _, gapIndex (gapIndex)}
                      <button type="button" class="lens-slot is-add" aria-label={t('Add')} onclick={() => toggleLensPicker(area.id, service.serviceKey)}>+</button>
                    {/each}
                    {#if service.gaps === 0}
                      <button type="button" class="lens-slot is-add is-extra" aria-label={t('Add')} onclick={() => toggleLensPicker(area.id, service.serviceKey)}>+</button>
                    {/if}
                  {:else}
                    {#each Array(service.gaps) as _, gapIndex (gapIndex)}
                      <span class="lens-slot is-empty" aria-hidden="true"></span>
                    {/each}
                  {/if}

                  {#if coverageLensPicker?.areaId === area.id && coverageLensPicker?.serviceKey === service.serviceKey}
                    <div class="lens-picker">
                      {#each availableForLens(service.serviceKey) as candidate (candidate.id)}
                        <button
                          type="button"
                          class={`is-${candidate.status}`}
                          disabled={candidate.blocked}
                          onclick={() => placeInLens(area.id, service.serviceKey, candidate.id)}
                        >
                          <span class="lens-picker__avatar" style={employeeColor.get(candidate.id) ? `--avatar-color:${employeeColor.get(candidate.id)};` : undefined}>{personInitials(candidate.name)}</span>
                          <span class="lens-picker__name">{candidate.name}</span>
                          {#if candidate.otherService}
                            <span class="lens-picker__also" title={t('Already on the other service')}>{candidate.otherService === 'evening' ? '☾' : '☀'}</span>
                          {/if}
                          <span class={`lens-picker__status is-${candidate.status}`}>{t(candidate.label)}</span>
                        </button>
                      {:else}
                        <span class="lens-picker__empty">{t('Everyone is placed')}</span>
                      {/each}
                    </div>
                  {/if}
                </span>
              </div>
            {/each}
          </div>
        {:else}
          <p class="lens-empty">{t('No active work areas yet')}</p>
        {/each}
    </div>
  </CoverageLensFrame>

  <Dialog
    open={coverageConfirmOpen}
    title="Publish this week?"
    description="Employees will see their shifts. These points stay flagged so you can fix them later — nothing is hidden."
    size="small"
    onclose={() => (coverageConfirmOpen = false)}
  >
    <ul class="publish-warnings">
      {#each publishWarnings as warning}
        <li>{warning}</li>
      {/each}
    </ul>
    <p class="publish-warnings__note">{t('You can publish now and resolve these from the board or the coverage lens afterwards.')}</p>
    {#snippet footer()}
      <button type="button" class="dialog-btn" disabled={saving} onclick={() => (coverageConfirmOpen = false)}>{t('Keep editing')}</button>
      <button
        type="button"
        class="dialog-btn is-primary"
        disabled={saving}
        onclick={() => {
          coverageConfirmOpen = false;
          void persist('published', { allowCoverageGaps: true, allowConflicts: conflicts.length > 0 });
        }}
      >{saving ? t('Publishing…') : t('Publish anyway')}</button>
    {/snippet}
  </Dialog>

  <ExportDialog
    open={exportCsvOpen}
    title="Export CSV"
    description={t('Planned schedule for week of {week}', { week: weekLabel(activeWeek, i18n.intlLocale) })}
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
  <p class="empty">{t('Loading Schedule…')}</p>
{/if}

<style>
  :global(.app__content[data-atmosphere='schedule'] .page-scaffold) {
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

  .planning-kicker {
    color: var(--rst-ui-action);
    font-size: 11px;
    font-weight: var(--rst-fw-display);
    letter-spacing: 0;
    text-transform: uppercase;
  }

  .schedule-rail h2 {
    margin: 0;
    letter-spacing: 0;
  }

  .schedule-lower p {
    margin: 0;
    line-height: 1.45;
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
    letter-spacing: 0;
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
    letter-spacing: 0;
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

  .rail-checks button.is-open {
    box-shadow: inset 0 -2px 0 var(--rst-ui-action);
  }

  .gate-issues {
    display: grid;
    gap: 6px;
    margin: 10px 0 0;
    max-height: 240px;
    padding: 0;
    overflow-y: auto;
    list-style: none;
  }

  .gate-issues button {
    width: 100%;
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: center;
    gap: 2px 10px;
    padding: 8px 10px;
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: var(--rst-ui-radius-md);
    color: #fffaf2;
    background: rgba(255, 255, 255, 0.05);
    font: inherit;
    text-align: left;
    cursor: pointer;
    transition: transform 0.14s var(--rst-ease-out), background-color 0.14s ease;
  }

  .gate-issues button:hover {
    transform: translateY(-1px);
    background: rgba(255, 255, 255, 0.09);
  }

  .gate-issue__where {
    grid-column: 1;
    min-width: 0;
    overflow: hidden;
    font-size: 12px;
    font-weight: var(--rst-fw-display);
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .gate-issue__when {
    grid-column: 1;
    color: rgba(255, 250, 242, 0.6);
    font-size: 11px;
  }

  .gate-issues em {
    grid-column: 2;
    grid-row: 1 / span 2;
    align-self: center;
    padding: 3px 8px;
    border-radius: var(--rst-ui-radius-pill);
    font-size: 11px;
    font-style: normal;
    font-weight: var(--rst-fw-display);
    white-space: nowrap;
  }

  .gate-issues em.is-short {
    color: #3c2a06;
    background: var(--rst-gold);
  }

  .gate-issues em.is-danger {
    color: #fff4ef;
    background: rgba(240, 100, 35, 0.9);
  }

  .planning-workspace {
    min-width: 0;
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(300px, 352px);
    gap: 16px;
    align-items: start;
    padding: clamp(20px, 4vw, 38px);
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

  .week-status {
    align-self: center;
    flex: 0 0 auto;
    padding: 3px 11px;
    border-radius: 999px;
    font-size: 11px;
    font-weight: var(--rst-fw-display);
    text-transform: uppercase;
    letter-spacing: 0;
  }

  .week-status.is-draft {
    color: rgba(255, 250, 242, 0.82);
    background: rgba(255, 255, 255, 0.1);
    border: 1px solid rgba(255, 255, 255, 0.18);
  }

  .week-status.is-published {
    color: #0e2f1c;
    background: #59d98a;
  }

  .cockpit-console__context strong {
    min-width: 0;
    overflow: hidden;
    font-size: clamp(24px, 2.4vw, 34px);
    line-height: 0.95;
    letter-spacing: 0;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .cockpit-console__context small,
  .cockpit-search span,
  .cockpit-staff-tools label span {
    color: rgba(255, 250, 242, 0.62);
    font-size: 10px;
    font-weight: var(--rst-fw-display);
    letter-spacing: 0;
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

  .period-switch {
    align-items: center;
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

  .cockpit-week button,
  .cockpit-week .week-picker,
  .period-switch button,
  .cockpit-staff-tools summary {
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

  .week-picker {
    position: relative;
    min-width: 120px;
    padding-inline: 10px;
  }

  .week-picker input {
    width: 100%;
    border: 0;
    color: #fffaf2;
    background: transparent;
    font: inherit;
    font-size: 12px;
    outline: none;
    color-scheme: dark;
  }

  /* Clean segmented control: borderless segments inside the pill, active reads
     as a calm fill with a crisp orange underline (not a loud gradient block). */
  .period-switch button {
    min-height: 32px;
    padding: 6px 12px;
    border-color: transparent;
    background: transparent;
  }

  .period-switch button.is-active {
    color: #fffaf2;
    background: rgba(255, 255, 255, 0.14);
    box-shadow: inset 0 -2px 0 var(--rst-ui-action);
  }

  .period-switch button:not(.is-active) {
    color: rgba(255, 250, 242, 0.62);
  }

  .period-switch button:not(.is-active):hover {
    color: #fffaf2;
  }

  .cockpit-week button {
    min-width: 40px;
  }

  .cockpit-week button:hover,
  .cockpit-staff-tools summary:hover,
  .cockpit-expand:hover {
    transform: translateY(-1px);
    box-shadow: 0 10px 22px rgba(0, 0, 0, 0.14);
  }

  /* Same expand affordance as the Home live monitor: a quiet glass square with
     the ⤢ glyph, not a loud labelled button. */
  .cockpit-expand {
    width: 38px;
    height: 38px;
    display: grid;
    place-items: center;
    border: 1px solid rgba(255, 255, 255, 0.16);
    border-radius: var(--rst-ui-radius-md);
    color: #fffaf2;
    background: rgba(255, 255, 255, 0.06);
    font-size: 16px;
    line-height: 1;
    cursor: pointer;
  }

  .cockpit-expand:hover {
    border-color: rgba(255, 255, 255, 0.32);
    background: rgba(255, 255, 255, 0.12);
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

  /* Gate cards share Timesheet's rail-card language: soft dark gradient,
     26px radius, tone-tinted gate (green ready / orange blocked). */
  .schedule-rail > .week-actions {
    border: 1px solid var(--rst-command-border);
    border-radius: var(--rst-command-radius);
    box-shadow: var(--rst-command-shadow);
    color: var(--rst-command-text);
    background:
      radial-gradient(circle at 100% 0%, rgba(240, 100, 35, 0.18), transparent 36%),
      var(--rst-command-bg);
  }

  .schedule-rail > .week-actions.is-ready {
    background:
      radial-gradient(circle at 100% 0%, rgba(66, 216, 132, 0.22), transparent 36%),
      var(--rst-command-bg-ready);
  }

  .schedule-rail > .week-actions.is-blocked {
    background:
      radial-gradient(circle at 100% 0%, rgba(240, 100, 35, 0.24), transparent 36%),
      var(--rst-command-bg-blocked);
  }

  .week-actions .planning-kicker {
    margin: 0;
    color: var(--rst-ui-action);
    font-size: 11px;
    font-weight: var(--rst-fw-display);
    letter-spacing: 0;
    text-transform: uppercase;
  }

  .publish-warnings {
    margin: 0 0 12px;
    padding: 0;
    display: grid;
    gap: 7px;
    list-style: none;
  }

  .publish-warnings li {
    position: relative;
    padding: 9px 12px 9px 34px;
    border: 1px solid var(--rst-ui-line);
    border-radius: var(--rst-ui-radius-md);
    background: var(--rst-ui-bg-2);
    color: var(--rst-ui-text);
    font-size: 13px;
    font-weight: var(--rst-fw-bold);
  }

  .publish-warnings li::before {
    content: '!';
    position: absolute;
    left: 10px;
    top: 50%;
    transform: translateY(-50%);
    width: 16px;
    height: 16px;
    display: grid;
    place-items: center;
    border-radius: 50%;
    color: #fff;
    background: var(--rst-ui-action);
    font-size: 11px;
    font-weight: var(--rst-fw-display);
  }

  .publish-warnings__note {
    margin: 0;
    color: var(--rst-ui-muted);
    font-size: 12px;
  }

  .dialog-btn {
    min-height: 40px;
    padding: 0 16px;
    border: 1px solid var(--rst-ui-line);
    border-radius: var(--rst-ui-radius-md);
    color: var(--rst-ui-text);
    background: var(--rst-ui-surface-field);
    font: inherit;
    font-weight: var(--rst-fw-bold);
    cursor: pointer;
  }

  .dialog-btn.is-primary {
    color: #fff;
    border-color: transparent;
    background: var(--rst-ui-action);
  }

  .dialog-btn:disabled {
    opacity: 0.6;
    cursor: default;
  }

  .schedule-rail p {
    margin: 0;
    line-height: 1.42;
  }

  .gate-actions {
    display: grid;
    gap: 8px;
  }

  .gate-actions {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }

  .gate-tools {
    display: flex;
    justify-content: flex-end;
  }

  .gate-tools button {
    min-height: 36px;
    padding: 8px 11px;
    border: 1px solid rgba(255, 255, 255, 0.12);
    border-radius: 12px;
    color: rgba(255, 250, 242, 0.82);
    background: rgba(255, 255, 255, 0.06);
    font: inherit;
    font-size: 12px;
    font-weight: var(--rst-fw-display);
    cursor: pointer;
  }

  .gate-tools button:disabled {
    cursor: default;
    opacity: 0.48;
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
    letter-spacing: 0;
    text-transform: uppercase;
  }

  /* ---- coverage lens ---- */
  .cockpit-coverage {
    display: inline-flex;
    align-items: center;
    gap: 7px;
    min-height: 32px;
    padding: 6px 13px;
    border: 1px solid var(--rst-topbar-active-border, rgba(255, 255, 255, 0.16));
    border-radius: 999px;
    color: #fffaf2;
    background: rgba(255, 255, 255, 0.06);
    font: inherit;
    font-size: 13px;
    font-weight: var(--rst-fw-bold);
    cursor: pointer;
    transition: background-color 0.16s ease, border-color 0.16s ease;
  }

  .cockpit-coverage:hover {
    background: rgba(255, 255, 255, 0.12);
  }

  .cockpit-coverage span {
    display: grid;
    place-items: center;
    line-height: 0;
    color: var(--rst-ui-action);
  }

  button.lens-slot.is-removable {
    cursor: pointer;
    transition: filter 0.14s ease, transform 0.14s ease;
  }

  button.lens-slot.is-removable:hover {
    filter: brightness(0.9) saturate(0.9);
    transform: translateY(-1px);
  }

  .lens-slot.is-add {
    border: 1.5px dashed var(--rst-ui-action);
    color: var(--rst-ui-action);
    background: transparent;
    font-size: 16px;
    line-height: 0;
    cursor: pointer;
    transition: background-color 0.14s ease;
  }

  .lens-slot.is-add.is-extra {
    border-style: dotted;
    opacity: 0.7;
  }

  .lens-slot.is-add:hover {
    background: var(--rst-ui-action-soft, rgba(240, 100, 35, 0.12));
  }

  .lens-picker {
    position: absolute;
    z-index: 5;
    top: calc(100% + 4px);
    left: 62px;
    width: min(300px, 78vw);
    max-height: 248px;
    overflow-y: auto;
    display: grid;
    gap: 2px;
    padding: 6px;
    border: 1px solid var(--rst-ui-line);
    border-radius: var(--rst-ui-radius-md);
    background: var(--rst-ui-bg-2);
    box-shadow: 0 18px 40px rgba(4, 11, 20, 0.18);
  }

  .lens-picker button {
    display: flex;
    align-items: center;
    gap: 8px;
    width: 100%;
    padding: 6px 8px;
    border: 0;
    border-left: 2px solid transparent;
    border-radius: var(--rst-ui-radius-md);
    color: var(--rst-ui-text);
    background: transparent;
    font: inherit;
    font-size: 13px;
    text-align: left;
    cursor: pointer;
    transition: background-color 0.14s ease;
  }

  .lens-picker button.is-available { border-left-color: var(--rst-green); }
  .lens-picker button.is-partial { border-left-color: #7bbf8a; }
  .lens-picker button.is-pending { border-left-color: var(--rst-ui-action); }

  .lens-picker button:hover:not(:disabled) {
    background: var(--rst-ui-bg);
  }

  .lens-picker button:disabled {
    cursor: not-allowed;
    opacity: 0.55;
  }

  .lens-picker button:disabled .lens-picker__avatar {
    filter: grayscale(0.7);
  }

  .lens-picker__also {
    flex: 0 0 auto;
    color: var(--rst-ui-muted);
    font-size: 12px;
    line-height: 1;
  }

  .lens-picker__status {
    flex: 0 0 auto;
    padding: 2px 8px;
    border-radius: 999px;
    font-size: 10px;
    font-weight: var(--rst-fw-display);
    text-transform: uppercase;
    letter-spacing: 0;
    white-space: nowrap;
    color: var(--rst-ui-muted);
    background: var(--rst-ui-bg);
  }

  .lens-picker__status.is-available { color: #1f7a4d; background: rgba(64, 200, 120, 0.16); }
  .lens-picker__status.is-partial { color: #2f7d57; background: rgba(64, 200, 120, 0.1); }
  .lens-picker__status.is-pending { color: #9a3d1a; background: rgba(240, 100, 35, 0.14); }
  .lens-picker__status.is-unavailable,
  .lens-picker__status.is-off { color: #a23b2a; background: rgba(214, 74, 52, 0.14); }

  .lens-picker__avatar {
    width: 24px;
    height: 24px;
    flex: 0 0 auto;
    display: grid;
    place-items: center;
    border-radius: var(--rst-ui-radius-round);
    color: #fffaf2;
    background: var(--avatar-color, #35507a);
    font-size: 9px;
    font-weight: var(--rst-fw-display);
  }

  .lens-picker__name {
    flex: 1 1 auto;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .lens-picker__empty {
    padding: 8px;
    color: var(--rst-ui-muted);
    font-size: 12px;
  }

  .lens-empty {
    margin: 8px 0;
    color: var(--rst-ui-muted);
    font-size: 13px;
  }

  @media (max-width: 1180px) {
    .planning-workspace {
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
    .cockpit-console {
      grid-template-columns: 1fr;
      gap: 12px;
      padding: 18px 16px 14px;
    }

    .cockpit-console__controls {
      justify-content: flex-start;
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
