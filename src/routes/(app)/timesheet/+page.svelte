<script lang="ts">
  import { page } from '$app/state';
  import { onMount } from 'svelte';
  import {
    createPayrollExportRun,
    getBadgeProofUrl,
    getPayrollExportRun,
    previewPayrollExport,
    setPayrollExportColumns
  } from '$lib/api/mutations';
  import type { PayrollExportPreview } from '$lib/api/mutations';
  import {
    PAYROLL_EXPORT_FIELDS,
    payrollFieldLabel
  } from '$lib/payroll/payroll-export-columns';
  import {
    isCompletePayrollPeriod,
    payrollApprovedMessage,
    payrollColumnsFromSettings,
    payrollDraftMessage,
    payrollRunHistoryItems
  } from '$lib/payroll/payroll-export';
  import ExportDialog from '$lib/components/ExportDialog.svelte';
  import RailExportCard from '$lib/operations/RailExportCard.svelte';
  import OperationsBoard, {
    type BoardChip,
    type BoardColumn,
    type BoardDayRail,
    type BoardMonthDay,
    type BoardRow,
    type BoardServiceCard,
    type BoardSlot,
    type BoardTone
  } from '$lib/operations/OperationsBoard.svelte';
  import BoardFocus from '$lib/operations/BoardFocus.svelte';
  import CoverageLensFrame from '$lib/operations/CoverageLensFrame.svelte';
  import {
    actualSlotsForDate,
    actualsStatusForWeek,
    actualsWeekTotals,
    buildActualsWeek,
    type ActualSlot
  } from '$lib/timesheet/timesheet-model';
  import {
    SERVICES,
    addDays,
    addMonths,
    formatHours,
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
  import TimesheetEntryEditor from '$lib/timesheet/TimesheetEntryEditor.svelte';
  import {
    cancelTimesheetEntry,
    resolveTimesheetLeave,
    saveTimesheetEntry,
    setTimesheetWeekStatus
  } from '$lib/timesheet/timesheet-actions';
  import LiveDuration from '$lib/components/LiveDuration.svelte';
  import Drawer from '$lib/components/Drawer.svelte';
  import FeedbackBanner from '$lib/components/FeedbackBanner.svelte';
  import PageScaffold from '$lib/components/PageScaffold.svelte';
  import PageHero from '$lib/components/PageHero.svelte';
  import WeekHistory from '$lib/timesheet/WeekHistory.svelte';
  import PayrollWorkspace from '$lib/payroll/PayrollWorkspace.svelte';
  import { workWeekHistoryItems } from '$lib/calendar/week-history';
  import RevisionConflictDialog from '$lib/operations/RevisionConflictDialog.svelte';
  import { downloadCsv } from '$lib/export/csv';
  import { friendlyError } from '$lib/api/error-messages';
  import { buildEmployeeColorMap } from '$lib/ui/position-color';
  import { personInitials, shortPersonName } from '$lib/ui/person';
  import { workspace } from '$lib/workspace/workspace.svelte';
  import { i18n, t } from '$lib/i18n/i18n.svelte';
  import { restaurantWeather } from '$lib/weather/restaurant-weather.svelte';

  type TimesheetPeriod = 'week' | 'month';

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
  const employeeColor = $derived(
    snapshot
      ? buildEmployeeColorMap(snapshot.job_functions, snapshot.employee_job_functions)
      : new Map<string, string>()
  );
  const timezone = $derived(
    snapshot?.restaurant_settings.timezone ||
      workspace.bootstrap?.restaurant_settings.timezone ||
      'Europe/Brussels'
  );
  let now = $state(new Date());
  const today = $derived(todayInTimezone(timezone, now));
  let weekStart = $state('');
  let lastWeekParam = $state<string | null>(null);
  let selectedKey = $state('');
  let saving = $state(false);
  let feedback = $state('');
  let feedbackTone = $state<'info' | 'success' | 'warning' | 'danger'>('info');
  let search = $state('');
  let scope = $state<'all' | 'exceptions' | 'live' | 'adjusted'>('all');
  let positionId = $state('');
  let weekAction = $state<'approve_week' | 'reopen_week' | null>(null);
  let weekReason = $state('');
  let entryDialogOpen = $state(false);
  let conflictOpen = $state(false);
  let payrollExporting = $state(false);
  let exportCsvOpen = $state(false);
  let payrollPeriodStart = $state('');
  let payrollPeriodEnd = $state('');
  let payrollColumns = $state<string[]>([]);
  let payrollColumnsSaving = $state(false);
  let payrollPreview = $state<PayrollExportPreview | null>(null);
  let payrollPreviewLoading = $state(false);
  let payrollPreviewError = $state('');
  let boardExpanded = $state(false);
  let boardPeriod = $state<TimesheetPeriod>('week');
  let coverageLensOpen = $state(false);
  let coverageLensDate = $state('');

  onMount(() => {
    const timer = window.setInterval(() => (now = new Date()), 60_000);
    return () => window.clearInterval(timer);
  });
  const activeWeek = $derived(weekStart || mondayFor(today));
  const weekComplete = $derived(addDays(activeWeek, 6) < today);
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
  // return) or weekStart stays empty when there is no ?week param at all.
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
      void workspace.loadOperations(operationsStart, operationsEnd).catch(() => undefined);
    }
  });
  $effect(() => {
    if (weatherLocation?.city) void restaurantWeather.load(weatherLocation);
  });

  const weekStatus = $derived(snapshot ? actualsStatusForWeek(snapshot, activeWeek) : 'open');
  const grid = $derived(
    snapshot
      ? buildActualsWeek({ snapshot, weekStart: activeWeek, today, asOf: now })
      : { days: [], rows: [], slotsByKey: new Map() }
  );
  const periodDates = $derived(
    boardExpanded && boardPeriod === 'month'
      ? activeMonthDates
      : grid.days.map((day) => day.date)
  );
  const periodLabel = $derived(
    boardExpanded && boardPeriod === 'month' ? monthLabel(activeWeek, i18n.intlLocale) : weekLabel(activeWeek, i18n.intlLocale)
  );
  const periodColumns = $derived(
    periodDates.map((date) => ({
      date,
      label: weekdayLabel(date, i18n.intlLocale),
      day: date.slice(8),
      month: date.slice(5, 7),
      today: date === today,
      future: date > today
    }))
  );
  const periodSlotsByKey = $derived(
    snapshot
      ? new Map(
          periodDates
            .flatMap((date) => actualSlotsForDate(snapshot, date, today, now))
            .map((slot) => [slot.key, slot] as const)
        )
      : new Map<string, ActualSlot>()
  );
  const selectedSlot = $derived(periodSlotsByKey.get(selectedKey) ?? null);

  // Coverage lens (Timesheet): the same room-floor view as Schedule, but read
  // from ACTUALS — who actually badged per room/service — so a manager can see
  // whether a service was really covered, not just planned. A planned person is
  // "present" if they worked (or are live) or the service hasn't happened yet;
  // a no-show (planned, service past, never badged) is shown amber and does not
  // count toward coverage. Area comes from the planned shift the badge belongs to.
  const coverageLensWeekday = $derived.by(() => {
    const day = new Date(`${coverageLensDate || activeWeek}T00:00:00Z`).getUTCDay();
    return ((day + 6) % 7) + 1; // Mon = 1 … Sun = 7
  });
  const coverageLensSlots = $derived.by(() => {
    const map = new Map<string, ActualSlot>();
    if (!snapshot || !coverageLensDate) return map;
    for (const slot of actualSlotsForDate(snapshot, coverageLensDate, today, now)) {
      map.set(`${slot.employeeId}|${slot.serviceKey}`, slot);
    }
    return map;
  });
  const coverageLensAreas = $derived.by(() => {
    if (!snapshot || !coverageLensDate) return [];
    const weekday = coverageLensWeekday;
    const weekStartOf = mondayFor(coverageLensDate);
    const slots = coverageLensSlots;
    return snapshot.work_areas
      .filter((area) => area.active)
      .sort((left, right) => left.sort_order - right.sort_order || left.name.localeCompare(right.name))
      .map((area) => {
        const services = SERVICES.map((serviceKey) => {
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
          const people = snapshot.planned_shifts
            .filter(
              (shift) =>
                shift.week_start === weekStartOf &&
                shift.weekday === weekday &&
                shift.area_id === area.id &&
                shift.service_key === serviceKey
            )
            .map((shift) => {
              const slot = slots.get(`${shift.employee_id}|${serviceKey}`);
              const status = slot?.status ?? 'empty';
              const worked = status === 'recorded' || status === 'adjusted' || status === 'live';
              const missing = status === 'missing';
              const absent = status === 'absence' || status === 'unavailable';
              const pending = !worked && !missing && !absent;
              return {
                id: shift.employee_id,
                name:
                  snapshot.employees.find((employee) => employee.id === shift.employee_id)?.display_name ?? '',
                worked,
                live: status === 'live',
                missing,
                absent,
                pending,
                range: slot?.actualRange || slot?.plannedRange || ''
              };
            })
            .filter((person) => person.name);
          const covered = people.filter((person) => person.worked || person.pending).length;
          const status = (required === 0
            ? covered > 0
              ? 'covered'
              : 'none'
            : covered < required
              ? 'under'
              : covered > required
                ? 'over'
                : 'covered') as 'under' | 'covered' | 'over' | 'none';
          return {
            serviceKey,
            icon: serviceKey === 'evening' ? '☾' : '☀',
            required,
            covered,
            people,
            gaps: Math.max(0, required - people.length),
            status
          };
        });
        return { id: area.id, name: area.name, services };
      });
  });

  function openCoverageLens() {
    coverageLensDate = grid.days.find((day) => day.today)?.date || grid.days[0]?.date || activeWeek;
    coverageLensOpen = true;
  }
  const selectedAdjustments = $derived(
    selectedSlot?.entryId
      ? snapshot?.time_entry_adjustments
          .filter((item) => item.time_entry_id === selectedSlot.entryId)
          .sort((a, b) => b.created_at.localeCompare(a.created_at)) ?? []
      : []
  );
  const activeWorkWeek = $derived(
    snapshot?.work_weeks.find((week) => week.week_start === activeWeek) ?? null
  );
  const payrollRuns = $derived(snapshot?.payroll_export_runs ?? []);
  const visibleRows = $derived(
    grid.rows.filter((row) => {
      const matchesSearch = `${row.name} ${row.meta ?? ''}`.toLowerCase().includes(search.trim().toLowerCase());
      const statuses = [...periodSlotsByKey.values()]
        .filter((slot) => slot.employeeId === row.id)
        .map((slot) => slot.status);
      const matchesScope =
        scope === 'all' ||
        (scope === 'exceptions' && statuses.some((status) => status === 'missing' || status === 'adjusted' || status === 'conflict')) ||
        (scope === 'live' && statuses.includes('live')) ||
        (scope === 'adjusted' && statuses.includes('adjusted'));
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
  const totals = $derived(
    snapshot
      ? actualsWeekTotals(snapshot, activeWeek, today, now)
      : { actualHours: 0, plannedHours: 0, missing: 0, live: 0, adjusted: 0, conflicts: 0 }
  );
  const unresolvedConflict = $derived(
    selectedSlot?.status === 'conflict' && !selectedSlot.entryId
  );
  const editable = $derived(
    weekStatus === 'open' &&
      Boolean(selectedSlot) &&
      !unresolvedConflict &&
      (selectedSlot?.date ?? '') <= today
  );
  const selectedBlockedReason = $derived(
    selectedSlot && !editable ? actualsBlockedReason(selectedSlot) : ''
  );

  const isOwner = $derived(workspace.active?.role === 'owner');
  const allSlots = $derived([...periodSlotsByKey.values()]);
  const reviewSlots = $derived(
    allSlots
      .filter((slot) => ['missing', 'live', 'adjusted', 'conflict'].includes(slot.status))
      .sort((left, right) => {
        const weight = { conflict: 0, missing: 1, live: 2, adjusted: 3 } as Record<string, number>;
        return (weight[left.status] ?? 9) - (weight[right.status] ?? 9) || left.date.localeCompare(right.date);
      })
  );
  const blockedCount = $derived(totals.conflicts + totals.missing + totals.live);
  // Approving is never hard-blocked by a manager decision: conflicts, missing
  // badges and an unfinished week are confirmable warnings (like the Schedule
  // publish gate). Only a live clock-in still blocks — you can't finalise pay
  // while someone is actively on the clock.
  const approveWarnings = $derived([
    ...(totals.conflicts > 0
      ? [t(totals.conflicts === 1 ? '{count} unresolved conflict' : '{count} unresolved conflicts', { count: totals.conflicts })]
      : []),
    ...(totals.missing > 0
      ? [t(totals.missing === 1 ? '{count} missing badge (counted as not worked)' : '{count} missing badges (counted as not worked)', { count: totals.missing })]
      : []),
    ...(!weekComplete ? [t('The week is not over yet')] : [])
  ]);
  // Approval-gate breakdown mirrors the Schedule publish gate: click a check to
  // expand a clean, clickable list of the exact entries (no messy hover flyout).
  let gateExpanded = $state<'' | 'conflicts' | 'missing' | 'live'>('');
  function toggleGate(panel: 'conflicts' | 'missing' | 'live') {
    gateExpanded = gateExpanded === panel ? '' : panel;
  }
  const conflictSlots = $derived(reviewSlots.filter((slot) => slot.status === 'conflict'));
  const missingSlots = $derived(reviewSlots.filter((slot) => slot.status === 'missing'));
  const liveSlots = $derived(reviewSlots.filter((slot) => slot.status === 'live'));
  const approvalTitle = $derived(
    weekStatus === 'approved' || weekStatus === 'locked'
      ? t('Payroll proof locked.')
      : blockedCount
        ? t(blockedCount === 1 ? '{count} payroll blocker.' : '{count} payroll blockers.', { count: blockedCount })
        : weekComplete
          ? t('Ready for payroll approval.')
          : t('Week still in service.')
  );
  const approvalLead = $derived(
    weekStatus === 'approved' || weekStatus === 'locked'
      ? t('This week has an audited approval trail and can be exported as official payroll evidence.')
      : totals.conflicts
        ? t('Resolve worked-time conflicts before approving payroll.')
      : totals.missing
          ? t('Missing badges must be corrected or cancelled before payroll can trust this week.')
        : totals.live
            ? t('Someone is still clocked in. Approval waits until the live badge is closed.')
          : weekComplete
              ? t('Every blocking badge issue is clear. Review corrections, then approve.')
              : t('The week is still in progress — you can approve early and reopen it later if needed.')
  );
  const approvalTone = $derived(
    weekStatus === 'approved' || weekStatus === 'locked'
      ? 'approved'
      : blockedCount
        ? 'blocked'
        : weekComplete
          ? 'ready'
          : 'open'
  );
  const approvalGateTitle = $derived(
    weekStatus === 'approved' || weekStatus === 'locked'
      ? 'Approved week'
      : blockedCount
        ? 'Not ready yet'
        : weekComplete
          ? 'Ready to approve'
          : 'Week still in service'
  );
  const proofProgress = $derived(
    Math.max(0, Math.min(100, Math.round((totals.actualHours / Math.max(1, totals.plannedHours || totals.actualHours || 1)) * 100)))
  );
  const activeFilterCount = $derived(
    (search.trim() ? 1 : 0) + (scope === 'all' ? 0 : 1) + (positionId ? 1 : 0)
  );
  // Show the active week's approval state in the wizard when the period still
  // covers exactly that week (the default). The official approved-vs-draft call
  // is always made server-side at export time regardless.
  const exportStatus = $derived(
    payrollPeriodStart === activeWeek && payrollPeriodEnd === addDays(activeWeek, 6)
      ? weekStatus === 'approved' || weekStatus === 'locked'
        ? ({ tone: 'success', text: 'Approved' } as const)
        : ({ tone: 'warning', text: 'Draft' } as const)
      : null
  );
  const payrollPreviewTable = $derived(
    exportCsvOpen
      ? {
          headers: payrollPreview?.headers ?? payrollColumns.map(payrollFieldLabel),
          rows: payrollPreview?.rows ?? [],
          rowCount: payrollPreview?.rowCount ?? 0,
          loading: payrollPreviewLoading,
          error: payrollPreviewError,
          note: payrollPreview
            ? t(payrollPreview.rowCount === 1 ? '{status} · {count} row · {hours}h' : '{status} · {count} rows · {hours}h', {
                status: t(payrollPreview.approved ? 'Approved' : 'Draft'),
                count: payrollPreview.rowCount,
                hours: (payrollPreview.totalNetMinutes / 60).toFixed(2)
              })
            : undefined
        }
      : null
  );
  // One audited timeline: lifecycle events plus owner-visible payroll exports.
  const historyItems = $derived([
    ...workWeekHistoryItems(snapshot?.work_week_events, 'actuals_'),
    ...(isOwner
      ? payrollRunHistoryItems({
          runs: payrollRuns,
          actionDisabled: payrollExporting,
          onDownload: downloadPayrollRun
        })
      : [])
  ]);

  function changePeriod(delta: number) {
    if (boardExpanded && boardPeriod === 'month') {
      weekStart = mondayFor(addMonths(activeWeek, delta));
    } else {
      weekStart = mondayFor(addDays(weekStart || today, delta * 7));
    }
    selectedKey = '';
    feedback = '';
  }

  function chooseWeek(value: string) {
    if (!value) return;
    weekStart = mondayFor(value);
    selectedKey = '';
    feedback = '';
  }

  function actualsBlockedReason(slot: ActualSlot) {
    if (weekStatus !== 'open') {
      return 'This payroll week is approved or locked. Reopen it before editing worked time.';
    }
    if (slot.status === 'conflict' && !slot.entryId) {
      return 'This service has a worked-time conflict. Resolve the duplicate evidence before editing.';
    }
    if (slot.date > today) {
      return 'Future services cannot be timesheeted yet. Timesheet opens on the service date.';
    }
    return '';
  }

  function openEntry(key: string) {
    selectedKey = key;
    const slot = periodSlotsByKey.get(key);
    const reason = slot ? actualsBlockedReason(slot) : '';
    if (reason) {
      feedback = reason;
      feedbackTone = 'warning';
    }
    entryDialogOpen = true;
  }

  function openExportCsv() {
    payrollPeriodStart = activeWeek;
    payrollPeriodEnd = addDays(activeWeek, 6);
    payrollColumns = payrollColumnsFromSettings(snapshot?.restaurant_settings);
    payrollPreview = null;
    payrollPreviewError = '';
    exportCsvOpen = true;
  }

  $effect(() => {
    const open = exportCsvOpen;
    const restaurantId = workspace.activeId;
    const periodStart = payrollPeriodStart;
    const periodEnd = payrollPeriodEnd;
    const selectedColumns = [...payrollColumns];

    if (!open) {
      payrollPreview = null;
      payrollPreviewError = '';
      payrollPreviewLoading = false;
      return;
    }

    if (!restaurantId || !isOwner || !periodStart || !periodEnd || !selectedColumns.length) {
      payrollPreview = null;
      payrollPreviewError = '';
      payrollPreviewLoading = false;
      return;
    }

    if (!isCompletePayrollPeriod(periodStart, periodEnd)) {
      payrollPreview = null;
      payrollPreviewError = 'Payroll periods must start on Monday and end on Sunday.';
      payrollPreviewLoading = false;
      return;
    }

    let cancelled = false;
    payrollPreviewLoading = true;
    payrollPreviewError = '';
    const timer = window.setTimeout(() => {
      void previewPayrollExport({
        restaurantId,
        periodStart,
        periodEnd,
        columns: selectedColumns
      })
        .then((preview) => {
          if (cancelled) return;
          payrollPreview = preview;
        })
        .catch((error) => {
          if (cancelled) return;
          const message = error instanceof Error ? error.message : String(error);
          if (message.toLowerCase().includes('no worked entries')) {
            payrollPreview = {
              approved: false,
              filename: `payroll-${periodStart}-${periodEnd}-DRAFT.csv`,
              headers: selectedColumns.map(payrollFieldLabel),
              rows: [],
              rowCount: 0,
              totalNetMinutes: 0
            };
            payrollPreviewError = '';
            return;
          }
          payrollPreview = null;
          payrollPreviewError = message;
        })
        .finally(() => {
          if (!cancelled) payrollPreviewLoading = false;
        });
    }, 250);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  });

  // Single Payroll-format export. The server decides approved vs draft: an
  // approved period records official, fingerprinted lineage; an unapproved one
  // downloads a clearly-marked DRAFT with no lineage.
  async function runExportCsv() {
    if (!workspace.activeId || !isOwner || !payrollPeriodStart || !payrollPeriodEnd || payrollExporting) {
      return;
    }
    if (!isCompletePayrollPeriod(payrollPeriodStart, payrollPeriodEnd)) {
      feedback = 'Payroll periods must start on Monday and end on Sunday.';
      feedbackTone = 'danger';
      return;
    }
    payrollExporting = true;
    feedback = '';
    try {
      const preview = await previewPayrollExport({
        restaurantId: workspace.activeId,
        periodStart: payrollPeriodStart,
        periodEnd: payrollPeriodEnd,
        columns: payrollColumns
      });
      if (preview.approved) {
        // Period is fully approved → record the official immutable run.
        const run = await createPayrollExportRun({
          restaurantId: workspace.activeId,
          periodStart: payrollPeriodStart,
          periodEnd: payrollPeriodEnd,
          columns: payrollColumns
        });
        downloadCsv(run.filename, run.headers, run.rows);
        await workspace.reloadOperations();
        feedback = payrollApprovedMessage(run.rowCount, run.totalNetMinutes);
        feedbackTone = 'success';
      } else {
        downloadCsv(preview.filename, preview.headers, preview.rows);
        feedback = payrollDraftMessage(preview.rowCount);
        feedbackTone = 'info';
      }
      exportCsvOpen = false;
    } catch (error) {
      feedback = friendlyError(error, 'actuals');
      feedbackTone = 'danger';
    } finally {
      payrollExporting = false;
    }
  }

  async function savePayrollColumnsDefault() {
    if (!workspace.activeId || payrollColumnsSaving || !payrollColumns.length) return;
    payrollColumnsSaving = true;
    try {
      await setPayrollExportColumns(workspace.activeId, payrollColumns);
      await workspace.reloadOperations();
      feedback = 'Saved as this restaurant’s default export layout.';
      feedbackTone = 'success';
    } catch (error) {
      feedback = friendlyError(error, 'actuals');
      feedbackTone = 'danger';
    } finally {
      payrollColumnsSaving = false;
    }
  }

  async function downloadPayrollRun(runId: string) {
    if (!workspace.activeId || payrollExporting) return;
    payrollExporting = true;
    try {
      const run = await getPayrollExportRun(workspace.activeId, runId);
      downloadCsv(run.filename, run.headers, run.rows);
      feedback = `Downloaded recorded payroll export ${run.filename}.`;
      feedbackTone = 'success';
    } catch (error) {
      feedback = friendlyError(error, 'actuals');
      feedbackTone = 'danger';
    } finally {
      payrollExporting = false;
    }
  }

  // Approve/reject a pending leave straight from the Timesheet entry drawer,
  // mirroring Schedule — a manager reviewing worked time can clear a holiday
  // in place instead of switching pages.
  async function resolveSelectedLeave(action: 'approve' | 'reject'): Promise<boolean> {
    const absence = selectedSlot?.truth.absence;
    if (!workspace.activeId || !selectedSlot || !absence || absence.status !== 'pending' || saving) {
      return false;
    }
    saving = true;
    try {
      await resolveTimesheetLeave({
        restaurantId: workspace.activeId,
        slot: selectedSlot,
        action
      });
      feedback = action === 'approve' ? 'Leave approved.' : 'Leave rejected.';
      feedbackTone = 'success';
      selectedKey = '';
      entryDialogOpen = false;
      return true;
    } catch (error) {
      feedback = friendlyError(error);
      feedbackTone = 'danger';
      return false;
    } finally {
      saving = false;
    }
  }

  async function saveEntry(values: {
    clockInAt: string;
    clockOutAt: string;
    breakMinutes: number;
    actualJobFunctionId: string;
    actualAreaId: string;
    breakIntervals: Array<{ started_at: string; ended_at: string }>;
    reason: string;
    isCorrection: boolean;
  }): Promise<boolean> {
    if (!workspace.activeId || !selectedSlot || saving) return false;
    saving = true;
    try {
      await saveTimesheetEntry({
        restaurantId: workspace.activeId,
        slot: selectedSlot,
        values
      });
      feedback = values.isCorrection ? 'Timesheet entry corrected.' : 'Manual timesheet entry added.';
      feedbackTone = 'success';
      // Saving is a completed action: close the drawer so the board (with the
      // updated entry) is back in view, consistent with the cancel-entry flow.
      selectedKey = '';
      entryDialogOpen = false;
      return true;
    } catch (error) {
      conflictOpen = (error instanceof Error ? error.message : String(error)).includes('CONFLICT:');
      feedback = friendlyError(error);
      feedbackTone = 'danger';
      return false;
    } finally {
      saving = false;
    }
  }

  async function cancelEntryAction(values: { reason: string }): Promise<boolean> {
    if (!workspace.activeId || !selectedSlot?.entryId || saving) return false;
    saving = true;
    try {
      await cancelTimesheetEntry({
        restaurantId: workspace.activeId,
        slot: selectedSlot,
        reason: values.reason
      });
      feedback = 'Timesheet entry cancelled and retained in the audit trail.';
      feedbackTone = 'success';
      selectedKey = '';
      entryDialogOpen = false;
      return true;
    } catch (error) {
      conflictOpen = (error instanceof Error ? error.message : String(error)).includes('CONFLICT:');
      feedback = friendlyError(error);
      feedbackTone = 'danger';
      return false;
    } finally {
      saving = false;
    }
  }

  async function setWeekStatus(action: 'approve_week' | 'reopen_week') {
    if (!workspace.activeId || saving) return;
    if (weekReason.trim().length < 3) {
      feedback = 'Enter a reason for this week lifecycle change.';
      feedbackTone = 'warning';
      return;
    }
    saving = true;
    try {
      await setTimesheetWeekStatus({
        restaurantId: workspace.activeId,
        weekStart: activeWeek,
        action,
        expectedRevision: Number(activeWorkWeek?.actuals_revision ?? 0),
        reason: weekReason.trim(),
        allowWarnings: approveWarnings.length > 0
      });
      feedback = action === 'approve_week' ? 'Timesheet week approved.' : 'Timesheet week reopened.';
      feedbackTone = 'success';
      weekAction = null;
      weekReason = '';
    } catch (error) {
      conflictOpen = (error instanceof Error ? error.message : String(error)).includes('CONFLICT:');
      feedback = friendlyError(error);
      feedbackTone = 'danger';
    } finally {
      saving = false;
    }
  }

  async function loadProof(): Promise<string> {
    if (!workspace.activeId || !selectedSlot?.entryId) return '';
    return getBadgeProofUrl({
      restaurantId: workspace.activeId,
      timeEntryId: selectedSlot.entryId,
      edge: selectedSlot.proofEdge ?? 'clock_out'
    });
  }

  function slotFor(rowId: string, date: string, serviceKey: ServiceKey) {
    return periodSlotsByKey.get(`${rowId}|${date}|${serviceKey}`) ?? null;
  }

  function slotsForService(date: string, serviceKey: ServiceKey) {
    return visibleRows
      .map((row) => slotFor(row.id, date, serviceKey))
      .filter((slot): slot is ActualSlot => Boolean(slot));
  }

  function serviceEvidenceSlots(date: string, serviceKey: ServiceKey) {
    return slotsForService(date, serviceKey)
      .filter((slot) => ['recorded', 'adjusted', 'live', 'missing', 'conflict', 'absence'].includes(slot.status))
      .sort((left, right) => {
        const weight = { conflict: 0, missing: 1, live: 2, adjusted: 3, recorded: 4, absence: 5 } as Record<string, number>;
        return (weight[left.status] ?? 9) - (weight[right.status] ?? 9) || left.employeeName.localeCompare(right.employeeName);
      });
  }

  function serviceManualSlots(date: string, serviceKey: ServiceKey) {
    if (date > today || weekStatus !== 'open') return [];
    return slotsForService(date, serviceKey).filter((slot) => slot.status === 'empty');
  }

  function serviceNetHours(date: string, serviceKey: ServiceKey) {
    return slotsForService(date, serviceKey).reduce((sum, slot) => sum + slot.actualHours, 0);
  }

  function serviceReviewCount(date: string, serviceKey: ServiceKey) {
    return slotsForService(date, serviceKey).filter((slot) =>
      ['conflict', 'missing', 'live', 'adjusted'].includes(slot.status)
    ).length;
  }

  function serviceTone(date: string, serviceKey: ServiceKey) {
    const slots = slotsForService(date, serviceKey);
    if (slots.some((slot) => slot.status === 'conflict' || slot.status === 'missing')) return 'danger';
    if (slots.some((slot) => slot.status === 'live')) return 'live';
    if (slots.some((slot) => slot.status === 'adjusted')) return 'warning';
    if (slots.some((slot) => slot.status === 'recorded')) return 'ready';
    return date > today ? 'future' : 'empty';
  }

  function openServiceEvidence(date: string, serviceKey: ServiceKey) {
    const firstSlot = serviceEvidenceSlots(date, serviceKey)[0] ?? serviceManualSlots(date, serviceKey)[0];
    if (firstSlot) openEntry(firstSlot.key);
  }

  function dayNetHours(date: string) {
    return SERVICES.reduce((sum, serviceKey) => sum + serviceNetHours(date, serviceKey), 0);
  }

  function dayReviewCount(date: string) {
    return SERVICES.reduce((sum, serviceKey) => sum + serviceReviewCount(date, serviceKey), 0);
  }

  function dayTone(date: string) {
    if (dayReviewCount(date)) return 'review';
    if (dayNetHours(date)) return 'worked';
    return date > today ? 'future' : 'quiet';
  }

  function outsideActiveMonth(date: string) {
    return date.slice(0, 7) !== activeWeek.slice(0, 7);
  }

  function employeePeriodHours(employeeId: string) {
    return [...periodSlotsByKey.values()]
      .filter((slot) => slot.employeeId === employeeId)
      .reduce((sum, slot) => sum + slot.actualHours, 0);
  }

  function employeeReviewCount(employeeId: string) {
    return [...periodSlotsByKey.values()].filter(
      (slot) =>
        slot.employeeId === employeeId &&
        ['conflict', 'missing', 'live', 'adjusted'].includes(slot.status)
    ).length;
  }

  function rowTone(employeeId: string) {
    const slots = [...periodSlotsByKey.values()].filter((slot) => slot.employeeId === employeeId);
    if (slots.some((slot) => slot.status === 'conflict' || slot.status === 'missing')) return 'danger';
    if (slots.some((slot) => slot.status === 'live')) return 'live';
    if (slots.some((slot) => slot.status === 'adjusted')) return 'warning';
    if (slots.some((slot) => slot.status === 'recorded')) return 'ready';
    return 'quiet';
  }

  function slotStateLabel(slot: ActualSlot) {
    if (slot.status === 'conflict') return 'Conflict';
    if (slot.status === 'missing') return 'Missing badge';
    if (slot.status === 'live') return 'Working now';
    if (slot.status === 'adjusted') return 'Corrected';
    if (slot.status === 'recorded') return 'Recorded';
    if (slot.status === 'absence') return 'Leave';
    if (slot.status === 'unavailable') return 'Unavailable';
    if (slot.status === 'pending') return 'Pending';
    if (slot.planned) return 'Planned';
    return slot.date <= today ? 'Add time' : 'Future';
  }

  function slotMainLabel(slot: ActualSlot) {
    if (slot.status === 'conflict') return 'Conflict';
    if (slot.status === 'missing') return 'Missing';
    if (slot.status === 'live') return 'Live';
    if (slot.actualHours) return formatHours(slot.actualHours);
    if (slot.plannedRange) return slot.plannedRange;
    // Empty slots read as a quiet em-dash (matching Schedule); the slot stays
    // clickable to add a manual entry, and the detail line carries the cue.
    return '—';
  }

  function slotDetailLabel(slot: ActualSlot) {
    if (slot.actualRange) return slot.actualRange;
    // The planned time already shows as the card's main label, so the detail row
    // just names the state rather than repeating the range.
    if (slot.plannedRange) return 'Planned';
    if (slot.proof) return slot.proof;
    return slotStateLabel(slot);
  }

  function slotAreaLabel(slot: ActualSlot) {
    return slot.truth.plan?.area ?? (slot.planned ? 'Planned shift' : '');
  }

  function beginWeekAction(action: 'approve_week' | 'reopen_week') {
    weekAction = action;
    weekReason =
      action === 'approve_week'
        ? 'Timesheet reviewed and approved'
        : 'Reopened for manager correction';
  }

  // ---- Board adapters -------------------------------------------------
  // Maps ActualSlot-shaped data onto the plain BoardX types the shared
  // OperationsBoard renders. Status names already match the shared tone
  // vocabulary (live/missing/recorded/adjusted/absence/...), so no remapping
  // is needed here the way Schedule's tones needed one.

  function avatarToneOf(tone: string): 'neutral' | 'live' | 'danger' | 'warning' {
    return tone === 'live' || tone === 'danger' || tone === 'warning' ? tone : 'neutral';
  }

  const boardRows: BoardRow[] = $derived(
    visibleRows.map((row) => {
      const reviewCount = employeeReviewCount(row.id);
      return {
        id: row.id,
        name: shortPersonName(row.name),
        meta: row.meta || 'Staff',
        color: employeeColor.get(row.id),
        avatarTone: avatarToneOf(rowTone(row.id)),
        reviewCount: reviewCount || undefined,
        totalLabel: formatHours(employeePeriodHours(row.id)),
        totalMeta: reviewCount ? `${reviewCount} review` : 'clean'
      };
    })
  );

  function rosterSlotsFor(rowId: string, date: string): BoardSlot[] {
    return SERVICES.map((serviceKey) => slotFor(rowId, date, serviceKey))
      .filter((slot): slot is ActualSlot => Boolean(slot))
      .map((slot) => ({
        key: slot.key,
        // A planned shift with no entry yet reads as "expected" (clear card),
        // not "empty" (faint), so awaited work is visible on the ledger.
        tone: (slot.planned && slot.status === 'empty' ? 'expected' : slot.status) as BoardTone,
        icon: serviceDisplay(slot.serviceKey).icon,
        main: slotMainLabel(slot),
        detail:
          slot.status === 'empty' && slot.date <= today
            ? boardExpanded
              ? 'Manual entry'
              : ''
            : boardExpanded
              ? slotDetailLabel(slot)
              : slotStateLabel(slot),
        area: slotAreaLabel(slot) || undefined,
        color: slot.status === 'empty' ? undefined : employeeColor.get(slot.employeeId),
        selected: selectedKey === slot.key,
        liveSince: slot.status === 'live' ? slot.clockInAt : undefined,
        onclick: () => openEntry(slot.key),
        ariaLabel: `${slot.employeeName} · ${t(serviceLabel(slot.serviceKey))} · ${date}: ${t(slotStateLabel(slot))}`
      }));
  }

  const dayRailsBoard: BoardDayRail[] = $derived(
    periodColumns.map((column) => ({
      date: column.date,
      label: column.label,
      value: `${column.day}/${column.month}`,
      meta: `${formatHours(dayNetHours(column.date))} · ${t(dayReviewCount(column.date) === 1 ? '{count} review' : '{count} reviews', { count: dayReviewCount(column.date) })}`,
      onclick: () => (selectedKey = '')
    }))
  );

  function serviceCardsForDate(date: string): BoardServiceCard[] {
    return SERVICES.map((serviceKey) => {
      const proofSlots = serviceEvidenceSlots(date, serviceKey);
      const manualSlots = serviceManualSlots(date, serviceKey);
      const cap = boardExpanded ? 8 : 5;
      const manualCap = boardExpanded ? 10 : 6;
      const chips: BoardChip[] = proofSlots.slice(0, cap).map((slot) => ({
        key: slot.key,
        initials: personInitials(slot.employeeName),
        tone: slot.status as BoardTone,
        name: slot.employeeName,
        detail: slotStateLabel(slot),
        color: employeeColor.get(slot.employeeId),
        selected: selectedKey === slot.key,
        liveSince: slot.status === 'live' ? slot.clockInAt : undefined,
        onclick: () => openEntry(slot.key),
        ariaLabel: `${slot.employeeName} ${t(serviceLabel(serviceKey))} ${t(slotStateLabel(slot))}`
      }));
      const secondaryChips: BoardChip[] = manualSlots.slice(0, manualCap).map((slot) => ({
        key: slot.key,
        initials: personInitials(slot.employeeName),
        tone: 'empty' as BoardTone,
        name: slot.employeeName,
        detail: 'Add manually',
        color: employeeColor.get(slot.employeeId),
        onclick: () => openEntry(slot.key),
        ariaLabel: t('Add manual entry for {name}', { name: slot.employeeName })
      }));
      return {
        serviceKey,
        icon: serviceDisplay(serviceKey).icon,
        label: serviceLabel(serviceKey),
        tone: serviceTone(date, serviceKey) as BoardTone,
        summaryValue: formatHours(serviceNetHours(date, serviceKey)),
        chips,
        emptyLabel: date > today ? 'Future service' : 'No badge evidence',
        secondaryLabel: manualSlots.length ? 'Add manually' : undefined,
        secondaryChips: manualSlots.length ? secondaryChips : undefined,
        secondaryOverflow: manualSlots.length > manualCap ? manualSlots.length - manualCap : 0
      };
    });
  }

  function laneValueFor(date: string, serviceKey: ServiceKey) {
    const hours = serviceNetHours(date, serviceKey);
    if (hours) return formatHours(hours);
    return serviceTone(date, serviceKey) === 'future' ? 'Future' : '—';
  }

  const monthDaysBoard: BoardMonthDay[] = $derived(
    boardExpanded && boardPeriod === 'month'
      ? periodColumns.map((column) => ({
          date: column.date,
          dayNumber: column.day,
          today: column.today,
          outside: outsideActiveMonth(column.date),
          tone: dayTone(column.date) as BoardTone,
          totalLabel: formatHours(dayNetHours(column.date)),
          reviewCount: dayReviewCount(column.date) || undefined,
          lanes: SERVICES.map((serviceKey) => ({
            serviceKey,
            icon: serviceDisplay(serviceKey).icon,
            tone: serviceTone(column.date, serviceKey) as BoardTone,
            value: laneValueFor(column.date, serviceKey),
            reviewCount: serviceReviewCount(column.date, serviceKey) || undefined,
            onclick: () => openServiceEvidence(column.date, serviceKey),
            ariaLabel: t('{date} {service}: {hours}, {count} review items', {
              date: column.date,
              service: t(serviceLabel(serviceKey)),
              hours: formatHours(serviceNetHours(column.date, serviceKey)),
              count: serviceReviewCount(column.date, serviceKey)
            })
          }))
        }))
      : []
  );
</script>

<svelte:head><title>{t('Timesheet')} · restogogo</title></svelte:head>

{#if snapshot}
  {#snippet exportPeriod()}
    <div class="payroll-period">
      <label>
        <span>{t('First Monday')}</span>
        <input type="date" bind:value={payrollPeriodStart} disabled={payrollExporting} />
      </label>
      <label>
        <span>{t('Last Sunday')}</span>
        <input type="date" bind:value={payrollPeriodEnd} disabled={payrollExporting} />
      </label>
      <small>{t('Approved weeks export as official, fingerprinted payroll lineage. Unapproved weeks download as a DRAFT with no lineage.')}</small>
    </div>
  {/snippet}
  {#snippet pageHeader()}
    {#if !boardExpanded}
      <PageHero
        heroClass="is-wide-command"
        eyebrow={`${t('Payroll evidence')} · ${weekLabel(activeWeek, i18n.intlLocale)} · ${t(weekStatus)}`}
        titleId="timesheet-title"
        title={approvalTitle}
        subtitle={approvalLead}
      >
        {#snippet command()}
          <div class="timesheet-hero__command" aria-label={t('Payroll proof summary')}>
            <div class="proof-dial" style={`--proof:${proofProgress}%`}>
              <strong>{formatHours(totals.actualHours)}</strong>
              <span>{t('badged')}</span>
            </div>
            <dl>
              <div><dt>{t('Planned')}</dt><dd>{formatHours(totals.plannedHours)}</dd></div>
              <div><dt>{t('Missing')}</dt><dd>{totals.missing}</dd></div>
              <div><dt>{t('Live')}</dt><dd>{totals.live}</dd></div>
              <div><dt>{t('Corrected')}</dt><dd>{totals.adjusted}</dd></div>
            </dl>
          </div>
        {/snippet}
      </PageHero>
      <FeedbackBanner message={feedback} tone={feedbackTone} />
    {/if}
  {/snippet}

  {#snippet boardSection()}
        <header class="timesheet-console" aria-label={t('Timesheet cockpit controls')}>
          <div class="timesheet-console__context">
            <span class="timesheet-kicker">{t('Timesheet cockpit')} · {t('roster ledger')}</span>
            <div class="timesheet-console__title" data-tour="ts-week">
              <strong>{periodLabel}</strong>
              <span class={`week-status is-${weekStatus === 'open' ? 'open' : 'approved'}`}>
                {weekStatus === 'approved' ? t('Approved') : weekStatus === 'locked' ? t('Locked') : t('Open')}
              </span>
              <small>{visibleRows.length} {t('people')} · {formatHours([...periodSlotsByKey.values()].reduce((sum, slot) => sum + slot.actualHours, 0))} {t('badged')} · {reviewSlots.length} {t('review items')}</small>
            </div>
          </div>

          <div class="timesheet-console__controls">
            {#if boardExpanded}
              <div class="period-switch" aria-label={t('Timesheet period')}>
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

            <div class="timesheet-period-nav" aria-label={t('Choose period')} data-tour="ts-period">
              <button type="button" aria-label={t('Previous period')} onclick={() => changePeriod(-1)}>&lsaquo;</button>
              <label class="week-picker" aria-label={t('Week starting')}>
                <input type="date" value={activeWeek} onchange={(event) => chooseWeek(event.currentTarget.value)} />
              </label>
              <button type="button" aria-label={t('Next period')} onclick={() => changePeriod(1)}>&rsaquo;</button>
            </div>

            {#if boardExpanded || activeFilterCount}
              <details class="timesheet-staff-tools">
                <summary>{t('Staff tools')}{activeFilterCount ? ` · ${activeFilterCount}` : ''}</summary>
                <div class="timesheet-staff-tools__panel">
                  <label>
                    <span>{t('Find staff')}</span>
                    <input bind:value={search} placeholder={t('Name, role, station...')} />
                  </label>
                  <label>
                    <span>{t('Show')}</span>
                    <select bind:value={scope}>
                      <option value="all">{t('All employees')}</option>
                      <option value="exceptions">{t('Needs review')}</option>
                      <option value="live">{t('Working now')}</option>
                      <option value="adjusted">{t('Corrected only')}</option>
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

            <button type="button" class="cockpit-coverage" onclick={openCoverageLens} data-tour="ts-coverage">
              <span aria-hidden="true"><svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="2.5" width="5" height="5" rx="1"/><rect x="9" y="2.5" width="5" height="5" rx="1"/><rect x="2" y="9" width="5" height="5" rx="1"/><rect x="9" y="9" width="5" height="5" rx="1"/></svg></span>
              <b>{t('Coverage')}</b>
            </button>

            <button
              type="button"
              class="timesheet-focus"
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
          emptyMessage="No employees match this Timesheet lens."
          label="Weekly payroll roster ledger"
        />

        {#if boardExpanded && boardPeriod === 'month'}
          <p class="month-note">
            {t('Monthly focus is a review lens only. Payroll approval still happens week by week, so the current approval gate remains tied to {week}.', { week: weekLabel(activeWeek, i18n.intlLocale) })}
          </p>
        {/if}
    {/snippet}

  <PageScaffold header={pageHeader} label={t('Timesheet payroll cockpit')}>
    {#if boardExpanded}
      <BoardFocus label="Timesheet focus" onclose={() => { boardExpanded = false; boardPeriod = 'week'; }}>
        <div class="timesheet-board">
          {@render boardSection()}
        </div>
      </BoardFocus>
    {:else}
      <div class="timesheet-workspace">
        <section class="timesheet-board" aria-label={t('Payroll roster ledger')} data-tour="ts-grid">
          {@render boardSection()}
        </section>

      <aside class="timesheet-rail" aria-label={t('Payroll actions')}>
        <section class={`approval-card is-${approvalTone}`} data-tour="ts-gate">
          <p>{t('Approval gate')}</p>
          <h2>{t(approvalGateTitle)}</h2>
          <div class="approval-checks">
            <button type="button" class:is-open={gateExpanded === 'conflicts'} disabled={!conflictSlots.length} onclick={() => toggleGate('conflicts')} style="--rst-i:0">
              <b>{totals.conflicts}</b> {t('conflicts')} <i class:is-clear={!totals.conflicts}>{totals.conflicts ? '!' : '✓'}</i>
            </button>
            <button type="button" class:is-open={gateExpanded === 'missing'} disabled={!missingSlots.length} onclick={() => toggleGate('missing')} style="--rst-i:1">
              <b>{totals.missing}</b> {t('missing badges')} <i class:is-clear={!totals.missing}>{totals.missing ? '!' : '✓'}</i>
            </button>
            <button type="button" class:is-open={gateExpanded === 'live'} disabled={!liveSlots.length} onclick={() => toggleGate('live')} style="--rst-i:2">
              <b>{totals.live}</b> {t('live clock-ins')} <i class:is-clear={!totals.live}>{totals.live ? '!' : '✓'}</i>
            </button>
          </div>

          {#if gateExpanded === 'conflicts' && conflictSlots.length}
            <ul class="gate-issues" aria-label={t('Worked-time conflicts')}>
              {#each conflictSlots as slot (slot.key)}
                <li><button type="button" onclick={() => openEntry(slot.key)}>
                  <span class="gate-issue__where">{slot.employeeName}</span>
                  <span class="gate-issue__when">{weekdayDateLabel(slot.date, i18n.intlLocale)} · {t(serviceLabel(slot.serviceKey))}</span>
                  <em class="is-danger">{t('Conflict')}</em>
                </button></li>
              {/each}
            </ul>
          {/if}
          {#if gateExpanded === 'missing' && missingSlots.length}
            <ul class="gate-issues" aria-label={t('Missing badges')}>
              {#each missingSlots as slot (slot.key)}
                <li><button type="button" onclick={() => openEntry(slot.key)}>
                  <span class="gate-issue__where">{slot.employeeName}</span>
                  <span class="gate-issue__when">{weekdayDateLabel(slot.date, i18n.intlLocale)} · {t(serviceLabel(slot.serviceKey))}</span>
                  <em class="is-short">{t('Missing')}</em>
                </button></li>
              {/each}
            </ul>
          {/if}
          {#if gateExpanded === 'live' && liveSlots.length}
            <ul class="gate-issues" aria-label={t('Live clock-ins')}>
              {#each liveSlots as slot (slot.key)}
                <li><button type="button" onclick={() => openEntry(slot.key)}>
                  <span class="gate-issue__where">{slot.employeeName}</span>
                  <span class="gate-issue__when">{weekdayDateLabel(slot.date, i18n.intlLocale)} · {t(serviceLabel(slot.serviceKey))}</span>
                  <em class="is-live">{#if slot.clockInAt}<LiveDuration since={slot.clockInAt} />{:else}{t('Working')}{/if}</em>
                </button></li>
              {/each}
            </ul>
          {/if}
          <div class="approval-actions" data-tour="ts-approve">
            {#if weekStatus === 'approved'}
              <button type="button" class="danger-action" disabled={saving} onclick={() => beginWeekAction('reopen_week')}>{t(saving ? 'Reopening...' : 'Reopen week')}</button>
            {:else if weekStatus === 'open'}
              <button
                type="button"
                class="primary-action"
                disabled={saving || totals.live > 0}
                onclick={() => beginWeekAction('approve_week')}
              >{t(saving ? 'Approving...' : 'Approve week')}</button>
            {/if}
          </div>
          {#if weekStatus === 'open' && totals.live > 0}
            <p class="approval-block">{t('Resolve to approve')}: {t(totals.live === 1 ? '{count} shift still open' : '{count} shifts still open', { count: totals.live })}</p>
          {:else if weekStatus === 'open' && approveWarnings.length > 0}
            <p class="approval-note">{t('You can approve now and confirm the flagged points, then reopen the week later if needed.')}</p>
          {/if}
          {#if weekAction}
            <div class="week-inline-action">
              <span>{t(weekAction === 'approve_week' ? 'Approve payroll week' : 'Reopen payroll week')}</span>
              <p>
                {t(weekAction === 'approve_week'
                  ? 'Approval closes manager editing until the week is deliberately reopened.'
                  : 'Reopening restores manager corrections and records an audit event.')}
              </p>
              {#if weekAction === 'approve_week' && approveWarnings.length > 0}
                <ul class="approve-warnings">
                  {#each approveWarnings as warning}<li>{warning}</li>{/each}
                </ul>
              {/if}
              <label>
                <span>{t('Manager reason')}</span>
                <input bind:value={weekReason} disabled={saving} />
              </label>
              <div class="week-inline-action__buttons">
                <button type="button" disabled={saving} onclick={() => (weekAction = null)}>{t('Cancel')}</button>
                <button
                  type="button"
                  class={weekAction === 'reopen_week' ? 'danger-action' : 'primary-action'}
                  disabled={saving}
                  onclick={() => weekAction && setWeekStatus(weekAction)}
                >
                  {t(saving ? 'Saving...' : weekAction === 'reopen_week' ? 'Reopen week' : approveWarnings.length > 0 ? 'Approve anyway' : 'Approve week')}
                </button>
              </div>
            </div>
          {/if}
        </section>

        {#if isOwner}
          <RailExportCard
            dataTour="ts-export"
            eyebrow="Payroll export"
            title="Preview before sending."
            description="Column order, draft preview and official lineage stay in the export wizard."
            primaryLabel="Payroll CSV"
            onprimary={openExportCsv}
          />
        {/if}

        <section class="review-card">
          <p>{t('Proof stack')}</p>
          <h2>{t(reviewSlots.length ? 'Needs a look' : 'Clean ledger')}</h2>
          <div class="review-list">
            {#each reviewSlots.slice(0, 6) as slot (slot.key)}
              <button type="button" class={`review-item is-${slot.status}`} onclick={() => openEntry(slot.key)}>
                <span>{personInitials(slot.employeeName)}</span>
                <strong>{shortPersonName(slot.employeeName)}</strong>
                {#if slot.status === 'live' && slot.clockInAt}
                  <small>{slot.date.slice(5)} · {t(serviceLabel(slot.serviceKey))} · <LiveDuration since={slot.clockInAt} /></small>
                {:else}
                  <small>{slot.date.slice(5)} · {t(serviceLabel(slot.serviceKey))} · {t(slotStateLabel(slot))}</small>
                {/if}
              </button>
            {:else}
              <span class="review-empty">{t('No missing badges, live entries or corrections blocking the story.')}</span>
            {/each}
          </div>
        </section>
      </aside>

      <section class="timesheet-lower" aria-label={t('Payroll trail')}>
        <WeekHistory items={historyItems}
          title="Payroll trail"
          eyebrow="Audited evidence"
          variant="panel"
          limit={8}
          emptyMessage="No approval or export history yet."
        />
      </section>
      {#if isOwner && workspace.activeId}
        <PayrollWorkspace
          restaurantId={workspace.activeId}
          employees={snapshot.employees}
          initialDate={activeWeek}
          locale={i18n.intlLocale}
        />
      {/if}
      </div>
    {/if}
  </PageScaffold>

  <Drawer
    open={entryDialogOpen && Boolean(selectedSlot)}
    title={selectedSlot ? `${selectedSlot.employeeName} · ${t(serviceLabel(selectedSlot.serviceKey))}` : t('Timesheet entry')}
    description={selectedBlockedReason ? t(selectedBlockedReason) : t(selectedSlot?.entryId ? 'Correct worked time with an audited manager reason.' : 'Add worked time manually for this service.')}
    onclose={() => !saving && (entryDialogOpen = false)}
  >
    {#if selectedSlot}
      <TimesheetEntryEditor
        slot={selectedSlot}
        restaurantId={workspace.activeId ?? ''}
        {timezone}
        {editable}
        jobFunctions={snapshot.job_functions}
        workAreas={snapshot.work_areas}
        adjustments={selectedAdjustments}
        onsave={saveEntry}
        oncancel={cancelEntryAction}
        onproof={loadProof}
        onresolveleave={resolveSelectedLeave}
        onfeedback={(message, tone) => { feedback = message; feedbackTone = tone; }}
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
    <p class="lens-legend">
        <span class="lens-legend__dot is-worked"></span>{t('Worked')}
        <span class="lens-legend__dot is-missing"></span>{t('No show')}
        <span class="lens-legend__dot is-pending"></span>{t('Scheduled')}
      </p>
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
                  <span class="lens-srow__count">{service.covered}/{service.required || service.people.length}</span>
                </span>
                <span class="lens-srow__slots">
                  {#each service.people as person (person.id)}
                    <span
                      class="lens-slot is-filled"
                      class:is-worked={person.worked}
                      class:is-missing={person.missing}
                      class:is-pending={person.pending}
                      class:is-absent={person.absent}
                      class:is-live={person.live}
                      style={!person.missing && employeeColor.get(person.id) ? `--avatar-color:${employeeColor.get(person.id)};` : undefined}
                      title={`${person.name}${person.missing ? ` — ${t('No badge')}` : person.range ? ` — ${person.range}` : ''}`}
                    >{personInitials(person.name)}</span>
                  {/each}
                  {#each Array(service.gaps) as _, gapIndex (gapIndex)}
                    <span class="lens-slot is-empty" aria-hidden="true"></span>
                  {/each}
                  {#if service.people.length === 0 && service.gaps === 0}
                    <span class="lens-srow__none">{t('No cover set')}</span>
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

  <ExportDialog
    open={exportCsvOpen}
    title="Export CSV"
    description="Payroll-format worked time. Draft any time; official once the period is approved."
    formatLabel="Payroll"
    status={exportStatus}
    controls={exportPeriod}
    fields={PAYROLL_EXPORT_FIELDS}
    bind:columns={payrollColumns}
    fieldLabel={payrollFieldLabel}
    preview={payrollPreviewTable}
    exporting={payrollExporting}
    exportLabel="Export CSV"
    onexport={runExportCsv}
    onclose={() => !payrollExporting && (exportCsvOpen = false)}
    canSaveDefault={isOwner}
    savingDefault={payrollColumnsSaving}
    onsavedefault={savePayrollColumnsDefault}
  />

  <RevisionConflictDialog
    open={conflictOpen}
    title="Timesheet changed elsewhere"
    description="Another session changed this entry or week after you loaded it. Your update was not applied."
    onkeep={() => (conflictOpen = false)}
    onreload={async () => {
      conflictOpen = false;
      entryDialogOpen = false;
      weekAction = null;
      await workspace.reloadOperations();
    }}
  />
{:else}
  <p>{t('Loading Timesheet...')}</p>
{/if}

<style>
  :global(.app__content[data-atmosphere='timesheet']) {
    padding-top: 0;
  }

  .timesheet {
    min-width: 0;
    display: grid;
    gap: 18px;
  }

  .approval-card p,
  .review-card p {
    margin: 0;
    color: var(--rst-ui-action);
    font-size: 11px;
    font-weight: var(--rst-fw-display);
    letter-spacing: 0;
    text-transform: uppercase;
  }

  .timesheet-rail > section,
  .timesheet-rail :global(.panel) {
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 26px;
    box-shadow: 0 22px 60px rgba(29, 20, 10, 0.14);
  }

  .approval-card h2,
  .review-card h2 {
    margin: 0;
    color: #fffaf2;
    font-size: clamp(24px, 2.4vw, 36px);
    line-height: 0.98;
    letter-spacing: 0;
  }

  .review-empty {
    color: #90a4bf;
    font-size: 12px;
  }

  .approval-actions button {
    font: inherit;
  }

  .approval-actions button {
    min-height: 38px;
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 12px;
    color: #fffaf2;
    background: rgba(255, 255, 255, 0.07);
    font-weight: var(--rst-fw-display);
    cursor: pointer;
  }

  .timesheet-rail {
    min-width: 0;
    display: grid;
    gap: 14px;
  }

  .approval-card,
  .review-card {
    min-width: 0;
    display: grid;
    gap: 14px;
    padding: 20px;
    border: 1px solid var(--rst-command-border);
    border-radius: var(--rst-command-radius);
    color: var(--rst-command-text);
    background:
      radial-gradient(circle at 100% 0%, rgba(240, 100, 35, 0.18), transparent 36%),
      var(--rst-command-bg);
    box-shadow: var(--rst-command-shadow);
  }

  .approval-card.is-ready,
  .approval-card.is-approved {
    background:
      radial-gradient(circle at 100% 0%, rgba(66, 216, 132, 0.22), transparent 36%),
      var(--rst-command-bg-ready);
  }

  .approval-card.is-blocked {
    background:
      radial-gradient(circle at 100% 0%, rgba(240, 100, 35, 0.24), transparent 36%),
      var(--rst-command-bg-blocked);
  }

  .approval-checks {
    display: grid;
    gap: 8px;
  }

  .approval-checks button {
    position: relative;
    width: 100%;
    display: grid;
    grid-template-columns: 34px minmax(0, 1fr) 24px;
    gap: 10px;
    align-items: center;
    padding: 10px;
    border: 1px solid rgba(255, 255, 255, 0.09);
    border-radius: 14px;
    color: #c7d3e2;
    background: rgba(255, 255, 255, 0.045);
    font: inherit;
    font-size: 12px;
    font-weight: var(--rst-fw-bold);
    text-align: left;
    cursor: pointer;
    animation: rst-fade-up .4s var(--rst-ease-out) backwards;
    animation-delay: calc(var(--rst-i, 0) * 90ms);
  }

  .approval-checks button:disabled {
    cursor: default;
  }

  .approval-checks button:not(:disabled):hover {
    border-color: rgba(255, 255, 255, 0.22);
    background: rgba(255, 255, 255, 0.075);
  }

  .approval-checks button.is-open {
    border-color: rgba(240, 100, 35, 0.5);
    box-shadow: inset 0 -2px 0 var(--rst-ui-action);
  }

  .approval-checks b {
    color: #42d884;
    font-size: 22px;
  }

  .approval-checks i {
    color: #42d884;
    font-style: normal;
    text-align: right;
    display: inline-block;
    animation: rst-check-pop .4s var(--rst-ease-spring) backwards;
    animation-delay: calc(var(--rst-i, 0) * 90ms + 150ms);
  }

  .approval-checks i.is-clear {
    animation: rst-check-pop .4s var(--rst-ease-spring) backwards, rst-check-ring 2.2s ease-out 1.5s 2;
  }

  /* Shared with the Schedule publish gate: a clean, clickable issue list. */
  .gate-issues {
    display: grid;
    gap: 6px;
    margin: 8px 0 0;
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

  .gate-issues em.is-live {
    color: #0d2d1a;
    background: #9cf3bd;
  }

  @keyframes rst-check-ring {
    0% { box-shadow: 0 0 0 0 rgba(66, 216, 132, .5); }
    100% { box-shadow: 0 0 0 8px rgba(66, 216, 132, 0); }
  }

  .approval-actions {
    display: flex;
    gap: 10px;
    flex-wrap: wrap;
  }

  .approval-actions button {
    flex: 1 1 120px;
    padding: 0 14px;
  }

  .primary-action {
    color: var(--rst-on-accent-text) !important;
    border-color: rgba(var(--rst-ui-action-rgb), 0.7) !important;
    background: var(--rst-ui-action) !important;
  }

  .approval-actions button:disabled,
  .primary-action:disabled {
    cursor: not-allowed;
    opacity: 0.48;
    filter: grayscale(0.45);
  }

  .approval-block,
  .approval-note {
    margin: 10px 0 0;
    font-size: 12px;
    line-height: 1.4;
  }

  .approval-block {
    color: var(--rst-state-warning-text);
    font-weight: var(--rst-fw-bold);
  }

  .approval-note {
    color: rgba(255, 250, 242, 0.62);
  }

  .approve-warnings {
    margin: 0;
    padding: 0;
    display: grid;
    gap: 6px;
    list-style: none;
  }

  .approve-warnings li {
    position: relative;
    padding: 8px 10px 8px 30px;
    border: 1px solid rgba(var(--rst-state-warning-rgb), 0.35);
    border-radius: var(--rst-ui-radius-md);
    background: rgba(var(--rst-state-warning-rgb), 0.1);
    color: #fff6ee;
    font-size: 12px;
    font-weight: var(--rst-fw-bold);
  }

  .approve-warnings li::before {
    content: '!';
    position: absolute;
    left: 9px;
    top: 50%;
    transform: translateY(-50%);
    width: 15px;
    height: 15px;
    display: grid;
    place-items: center;
    border-radius: 50%;
    color: #160c06;
    background: var(--rst-state-warning);
    font-size: 10px;
    font-weight: var(--rst-fw-display);
  }

  .danger-action {
    border-color: rgba(240, 100, 35, 0.35) !important;
    color: #ffd8cf !important;
  }

  .week-inline-action {
    display: grid;
    gap: 10px;
    padding: 12px;
    border: 1px solid rgba(var(--rst-ui-action-rgb), 0.28);
    border-radius: 18px;
    background:
      radial-gradient(circle at 100% 0%, rgba(var(--rst-ui-action-rgb), 0.16), transparent 42%),
      rgba(255, 255, 255, 0.06);
  }

  .week-inline-action > span {
    color: #fffaf2;
    font-size: 13px;
    font-weight: var(--rst-fw-display);
  }

  .week-inline-action p {
    color: rgba(255, 250, 242, 0.68);
    font-size: 12px;
    line-height: 1.45;
  }

  .week-inline-action label {
    display: grid;
    gap: 6px;
  }

  .week-inline-action label span {
    color: rgba(255, 250, 242, 0.64);
    font-size: 10px;
    font-weight: var(--rst-fw-bold);
    letter-spacing: 0;
    text-transform: uppercase;
  }

  .week-inline-action input {
    min-height: 40px;
    padding: 8px 10px;
    border: 1px solid rgba(255, 255, 255, 0.12);
    border-radius: 12px;
    color: #fffaf2;
    background: rgba(255, 255, 255, 0.08);
    font: inherit;
  }

  .week-inline-action__buttons {
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
  }

  .week-inline-action__buttons button {
    flex: 1 1 120px;
    min-height: 38px;
    padding: 0 14px;
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 12px;
    color: #fffaf2;
    background: rgba(255, 255, 255, 0.07);
    font: inherit;
    font-weight: var(--rst-fw-display);
    cursor: pointer;
  }

  .review-card {
    background:
      radial-gradient(circle at 100% 0%, rgba(56, 189, 248, 0.16), transparent 36%),
      var(--rst-command-bg-info);
  }

  .review-list {
    display: grid;
    gap: 8px;
  }

  .review-item {
    min-width: 0;
    display: grid;
    grid-template-columns: 34px minmax(0, 1fr);
    gap: 2px 10px;
    align-items: center;
    padding: 9px;
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 14px;
    color: #fffaf2;
    background: rgba(255, 255, 255, 0.055);
    text-align: left;
    cursor: pointer;
    transition: transform .15s cubic-bezier(.16,1,.3,1), background-color .15s ease;
  }

  .review-item:hover {
    transform: translateX(2px);
    background: rgba(255, 255, 255, 0.09);
  }

  .review-item span {
    grid-row: span 2;
    width: 34px;
    height: 34px;
    display: grid;
    place-items: center;
    border-radius: 999px;
    background: #1f4a7a;
    color: #cfe0ff;
    font-size: 10px;
    font-weight: var(--rst-fw-display);
  }

  .review-item small {
    color: #90a4bf;
  }

  .review-item.is-missing span,
  .review-item.is-conflict span {
    background: #8d2b1c;
  }

  .review-item.is-live span {
    color: #12301f;
    background: #9cf3bd;
    animation: rst-pulse-ring-green 2s ease-out infinite;
  }

  @keyframes rst-pulse-ring-green {
    0% { box-shadow: 0 0 0 0 rgba(156, 243, 189, .55); }
    70% { box-shadow: 0 0 0 8px rgba(156, 243, 189, 0); }
    100% { box-shadow: 0 0 0 0 rgba(156, 243, 189, 0); }
  }

  .payroll-period { display: grid; gap: 12px; }
  .payroll-period input { min-height: 40px; padding: 8px 10px; border: 1px solid var(--rst-ui-line); border-radius: var(--rst-ui-radius-md); color: var(--rst-ui-text); background: var(--rst-ui-surface-field-strong); font: inherit; }
  .payroll-period small { color: var(--rst-ui-muted); }

  @media print {
    .timesheet-rail {
      display: none !important;
    }
  }

  /* Timesheet v2: roster-first payroll cockpit. */
  :global(.app__content[data-atmosphere='timesheet'] .page-scaffold) {
    gap: 0;
  }

  .timesheet-kicker {
    color: var(--rst-ui-action);
    font-size: 11px;
    font-weight: var(--rst-fw-display);
    letter-spacing: 0;
    text-transform: uppercase;
  }

  .timesheet-hero__command {
    position: relative;
    z-index: 1;
    justify-self: end;
    width: min(420px, 100%);
    display: grid;
    grid-template-columns: 122px minmax(0, 1fr);
    gap: 12px;
    padding: 13px;
    border: 1px solid rgba(255, 255, 255, 0.16);
    border-radius: var(--rst-ui-radius-xl);
    background: rgba(8, 15, 23, 0.5);
    box-shadow: 0 14px 36px rgba(0, 0, 0, 0.18);
    backdrop-filter: blur(16px);
  }

  .proof-dial {
    --proof: 0%;
    min-height: 116px;
    display: grid;
    place-items: center;
    align-content: center;
    border-radius: 20px;
    color: #fff;
    background:
      conic-gradient(from -90deg, #42d884 0 var(--proof), rgba(255, 255, 255, 0.12) var(--proof) 100%),
      rgba(12, 23, 35, 0.82);
    box-shadow: inset 0 0 0 9px rgba(8, 14, 22, 0.82);
  }

  .proof-dial strong {
    font-size: 34px;
    line-height: 0.9;
    letter-spacing: 0;
  }

  .proof-dial span,
  .timesheet-hero__command dt {
    color: rgba(255, 250, 242, 0.62);
    font-size: 10px;
    font-weight: var(--rst-fw-display);
    letter-spacing: 0;
    text-transform: uppercase;
  }

  .timesheet-hero__command dl {
    margin: 0;
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 7px;
  }

  .timesheet-hero__command dl div {
    min-width: 0;
    display: grid;
    gap: 2px;
    align-content: center;
    padding: 9px;
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: var(--rst-ui-radius-lg);
    background: rgba(255, 255, 255, 0.06);
  }

  .timesheet-hero__command dt,
  .timesheet-hero__command dd {
    margin: 0;
  }

  .timesheet-hero__command dd {
    color: #fff;
    font-size: 17px;
    font-weight: var(--rst-fw-display);
  }

  .timesheet-workspace {
    min-width: 0;
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(300px, 352px);
    gap: 16px;
    align-items: start;
    padding: clamp(20px, 4vw, 38px);
  }

  /* Audited payroll trail sits full-width below the ledger, like the Schedule
     week trail below its board. */
  .timesheet-lower {
    grid-column: 1 / -1;
    min-width: 0;
  }

  .timesheet-board,
  .timesheet-rail > section,
  .timesheet-rail :global(.panel) {
    min-width: 0;
    border: 1px solid var(--rst-ui-surface-panel-border);
    border-radius: var(--rst-ui-radius-2xl);
    box-shadow: var(--rst-ui-shadow-card);
  }

  .timesheet-board {
    overflow: hidden;
    color: #fffaf2;
    background:
      radial-gradient(circle at 0% 0%, rgba(56, 189, 248, 0.14), transparent 34%),
      radial-gradient(circle at 100% 0%, rgba(240, 100, 35, 0.12), transparent 38%),
      linear-gradient(180deg, #132235, #0d1724);
  }

  .timesheet-console {
    min-width: 0;
    display: grid;
    grid-template-columns: minmax(280px, 1fr) auto;
    gap: 18px;
    align-items: center;
    padding: 24px 28px 18px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.1);
  }

  .timesheet-console__context {
    min-width: 0;
    display: grid;
    gap: 8px;
  }

  .timesheet-console__title {
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

  .week-status.is-open {
    color: rgba(255, 250, 242, 0.82);
    background: rgba(255, 255, 255, 0.1);
    border: 1px solid rgba(255, 255, 255, 0.18);
  }

  .week-status.is-approved {
    color: #0e2f1c;
    background: #59d98a;
  }

  .timesheet-console__title strong {
    min-width: 0;
    overflow: hidden;
    color: #fff;
    font-size: clamp(24px, 2.4vw, 34px);
    line-height: 0.95;
    letter-spacing: 0;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .timesheet-console__title small,
  .timesheet-staff-tools label span {
    color: rgba(255, 250, 242, 0.62);
    font-size: 10px;
    font-weight: var(--rst-fw-display);
    letter-spacing: 0;
    text-transform: uppercase;
  }

  .timesheet-console__controls {
    min-width: 0;
    display: flex;
    flex-wrap: wrap;
    gap: 9px;
    align-items: center;
    justify-content: flex-end;
  }

  .period-switch,
  .timesheet-period-nav {
    min-width: 0;
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 4px;
    border: 1px solid rgba(255, 255, 255, 0.12);
    border-radius: var(--rst-ui-radius-xl);
    background: rgba(255, 255, 255, 0.06);
  }

  .period-switch button,
  .timesheet-period-nav button,
  .timesheet-period-nav .week-picker,
  .timesheet-staff-tools summary {
    min-height: 38px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 7px;
    padding: 8px 10px;
    border: 1px solid rgba(255, 255, 255, 0.13);
    border-radius: var(--rst-ui-radius-lg);
    color: rgba(255, 250, 242, 0.72);
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

  /* Clean segmented control: borderless segments, active reads as a calm fill
     with a crisp orange underline (not a loud gradient block). */
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

  .timesheet-period-nav button:hover,
  .period-switch button:hover,
  .timesheet-staff-tools summary:hover {
    color: #fff;
    transform: translateY(-1px);
  }

  /* Same expand affordance as the Home live monitor: a quiet glass square with
     the ⤢ glyph, not a loud labelled button. */
  .timesheet-focus {
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

  .timesheet-focus:hover {
    transform: translateY(-1px);
    border-color: rgba(255, 255, 255, 0.32);
    background: rgba(255, 255, 255, 0.12);
  }

  .cockpit-coverage {
    display: inline-flex;
    align-items: center;
    gap: 7px;
    min-height: 38px;
    padding: 8px 14px;
    border: 1px solid rgba(255, 255, 255, 0.16);
    border-radius: var(--rst-ui-radius-lg);
    color: #fffaf2;
    background: rgba(255, 255, 255, 0.06);
    font: inherit;
    font-size: 12px;
    font-weight: var(--rst-fw-display);
    cursor: pointer;
    transition: background-color 0.16s ease, border-color 0.16s ease, transform 0.16s ease;
  }

  .cockpit-coverage:hover {
    transform: translateY(-1px);
    border-color: rgba(255, 255, 255, 0.32);
    background: rgba(255, 255, 255, 0.12);
  }

  .cockpit-coverage span {
    display: grid;
    place-items: center;
    line-height: 0;
    color: var(--rst-ui-action);
  }

  /* Coverage lens (actuals) — mirrors the Schedule lens and Home floor card so
     the whole app speaks one coverage language. Read-only: it reports who
     actually badged per room/service. */
  .lens-legend {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 6px 8px;
    margin: 0 0 14px;
    color: var(--rst-ui-muted);
    font-size: 11px;
    font-weight: var(--rst-fw-bold);
  }

  .lens-legend__dot {
    width: 10px;
    height: 10px;
    border-radius: 50%;
  }

  .lens-legend__dot:not(:first-child) {
    margin-left: 8px;
  }

  .lens-legend__dot.is-worked { background: var(--rst-green); }
  .lens-legend__dot.is-missing { background: rgba(240, 150, 35, 0.9); }
  .lens-legend__dot.is-pending {
    background: transparent;
    border: 1.5px dashed var(--rst-ui-line-strong, rgba(76, 48, 26, 0.4));
  }

  .lens-srow__none {
    color: var(--rst-ui-muted);
    font-size: 12px;
  }

  /* worked = confirmed present (badged): a green ring around their avatar. */
  .lens-slot.is-worked {
    box-shadow: 0 0 0 2px var(--rst-green), 0 2px 6px rgba(4, 11, 20, 0.22);
  }

  .lens-slot.is-live {
    box-shadow: 0 0 0 2px var(--rst-green);
    animation: lens-pulse 1.7s ease-in-out infinite;
  }

  /* scheduled, service not over yet — dimmed, "expected but not confirmed". */
  .lens-slot.is-pending {
    opacity: 0.5;
    box-shadow: none;
    border: 1.5px dashed rgba(255, 255, 255, 0.4);
  }

  .lens-slot.is-absent {
    opacity: 0.4;
    filter: grayscale(0.6);
    box-shadow: none;
  }

  /* no-show — planned, service past, never badged. Reads amber, not their tone. */
  .lens-slot.is-missing {
    color: #7a3d12;
    background: rgba(240, 150, 35, 0.24);
    box-shadow: none;
    border: 1.5px solid rgba(240, 150, 35, 0.75);
  }

  @keyframes lens-pulse {
    0%, 100% { box-shadow: 0 0 0 2px var(--rst-green); }
    50% { box-shadow: 0 0 0 4px rgba(64, 200, 120, 0.35); }
  }

  .lens-empty {
    margin: 8px 0;
    color: var(--rst-ui-muted);
    font-size: 13px;
  }

  .timesheet-staff-tools {
    position: relative;
  }

  .timesheet-staff-tools summary {
    list-style: none;
  }

  .timesheet-staff-tools summary::-webkit-details-marker {
    display: none;
  }

  .timesheet-staff-tools__panel {
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

  .timesheet-staff-tools label {
    display: grid;
    gap: 6px;
  }

  .timesheet-staff-tools input,
  .timesheet-staff-tools select {
    min-height: 38px;
    width: 100%;
    padding: 8px 10px;
    border: 1px solid rgba(255, 255, 255, 0.13);
    border-radius: var(--rst-ui-radius-lg);
    color: #fffaf2;
    background: rgba(255, 255, 255, 0.075);
    font: inherit;
  }

  @media (max-width: 1180px) {
    .timesheet-workspace {
      grid-template-columns: 1fr;
    }

    .timesheet-hero__command {
      justify-self: stretch;
    }
  }

  @media (max-width: 760px) {
    .timesheet-hero__command,
    .timesheet-console {
      grid-template-columns: 1fr;
    }

    .timesheet-workspace {
      padding: 16px 12px;
    }
  }

  @media print {
    .timesheet-rail,
    .timesheet-console__controls {
      display: none !important;
    }
  }
</style>
