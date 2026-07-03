<script lang="ts">
  import {
    createPayrollExportRun,
    getBadgeProofUrl,
    getPayrollExportRun,
    previewPayrollExport,
    saveActuals,
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
  import OperationsBoard, {
    type BoardChip,
    type BoardColumn,
    type BoardDayRail,
    type BoardMonthDay,
    type BoardRow,
    type BoardServiceCard,
    type BoardSlot,
    type BoardTone
  } from '$lib/components/OperationsBoard.svelte';
  import {
    actualSlotsForDate,
    actualsStatusForWeek,
    actualsWeekTotals,
    buildActualsWeek,
    type ActualSlot
  } from '$lib/actuals/actuals-model';
  import {
    SERVICES,
    addDays,
    addMonths,
    formatHours,
    mondayFor,
    monthDates,
    monthLabel,
    serviceLabel,
    todayInTimezone,
    weekLabel,
    type ServiceKey
  } from '$lib/calendar/date';
  import ActualsEntryEditor from '$lib/actuals/ActualsEntryEditor.svelte';
  import ActionButton from '$lib/components/ActionButton.svelte';
  import LiveDuration from '$lib/components/LiveDuration.svelte';
  import Dialog from '$lib/components/Dialog.svelte';
  import Drawer from '$lib/components/Drawer.svelte';
  import FeedbackBanner from '$lib/components/FeedbackBanner.svelte';
  import PageScaffold from '$lib/components/PageScaffold.svelte';
  import WeekHistory from '$lib/components/WeekHistory.svelte';
  import { workWeekHistoryItems } from '$lib/calendar/week-history';
  import RevisionConflictDialog from '$lib/components/RevisionConflictDialog.svelte';
  import { downloadCsv } from '$lib/export/csv';
  import { workspaceRealtime } from '$lib/realtime/workspace-realtime.svelte';
  import { workspace } from '$lib/workspace/workspace.svelte';

  type TimesheetPeriod = 'week' | 'month';
  type TimesheetView = 'roster' | 'service';

  const snapshot = $derived(workspace.operations);
  const timezone = $derived(
    snapshot?.restaurant_settings.timezone ||
      workspace.bootstrap?.restaurant_settings.timezone ||
      'Europe/Brussels'
  );
  const today = $derived(todayInTimezone(timezone));
  let weekStart = $state('');
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
  let timesheetView = $state<TimesheetView>('roster');
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

  $effect(() => {
    if (!weekStart) weekStart = mondayFor(today);
  });
  $effect(() => {
    if (workspace.activeId && operationsStart && operationsEnd) {
      void workspace.loadOperations(operationsStart, operationsEnd).catch(() => undefined);
    }
  });

  const weekStatus = $derived(snapshot ? actualsStatusForWeek(snapshot, activeWeek) : 'open');
  const grid = $derived(
    snapshot
      ? buildActualsWeek({ snapshot, weekStart: activeWeek, today })
      : { days: [], rows: [], slotsByKey: new Map() }
  );
  const periodDates = $derived(
    boardExpanded && boardPeriod === 'month'
      ? activeMonthDates
      : grid.days.map((day) => day.date)
  );
  const periodLabel = $derived(
    boardExpanded && boardPeriod === 'month' ? monthLabel(activeWeek) : weekLabel(activeWeek)
  );
  const timesheetModeLabel = $derived(
    timesheetView === 'roster'
      ? 'roster ledger'
      : boardExpanded && boardPeriod === 'month'
        ? 'monthly proof calendar'
        : 'service proof'
  );
  const periodColumns = $derived(
    periodDates.map((date) => ({
      date,
      label: weekdayLabel(date),
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
            .flatMap((date) => actualSlotsForDate(snapshot, date, today))
            .map((slot) => [slot.key, slot] as const)
        )
      : new Map<string, ActualSlot>()
  );
  const selectedSlot = $derived(periodSlotsByKey.get(selectedKey) ?? null);
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
      ? actualsWeekTotals(snapshot, activeWeek, today)
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
  const conflictSlots = $derived(reviewSlots.filter((slot) => slot.status === 'conflict'));
  const missingSlots = $derived(reviewSlots.filter((slot) => slot.status === 'missing'));
  const liveSlots = $derived(reviewSlots.filter((slot) => slot.status === 'live'));
  const approvalTitle = $derived(
    weekStatus === 'approved' || weekStatus === 'locked'
      ? 'Payroll proof locked.'
      : blockedCount
        ? `${blockedCount} payroll blocker${blockedCount === 1 ? '' : 's'}.`
        : weekComplete
          ? 'Ready for payroll approval.'
          : 'Week still in service.'
  );
  const approvalLead = $derived(
    weekStatus === 'approved' || weekStatus === 'locked'
      ? 'This week has an audited approval trail and can be exported as official payroll evidence.'
      : totals.conflicts
        ? 'Resolve worked-time conflicts before approving payroll.'
        : totals.missing
          ? 'Missing badges must be corrected or cancelled before payroll can trust this week.'
          : totals.live
            ? 'Someone is still clocked in. Approval waits until the live badge is closed.'
            : weekComplete
              ? 'Every blocking badge issue is clear. Review corrections, then approve.'
              : 'Keep watching the badges as service happens. Approval opens once the week is complete.'
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
            ? `${payrollPreview.approved ? 'Approved' : 'Draft'} · ${payrollPreview.rowCount} rows · ${(payrollPreview.totalNetMinutes / 60).toFixed(2)}h`
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

  function openEntry(key: string) {
    selectedKey = key;
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
      feedback = error instanceof Error ? error.message : String(error);
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
      feedback = error instanceof Error ? error.message : String(error);
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
      feedback = error instanceof Error ? error.message : String(error);
      feedbackTone = 'danger';
    } finally {
      payrollExporting = false;
    }
  }

  async function saveEntry(values: {
    clockInAt: string;
    clockOutAt: string;
    breakMinutes: number;
    reason: string;
    isCorrection: boolean;
  }): Promise<boolean> {
    if (!workspace.activeId || !selectedSlot || saving) return false;
    saving = true;
    try {
      await saveActuals({
        restaurantId: workspace.activeId,
        action: values.isCorrection ? 'adjust_entry' : 'manual_entry',
        payload: {
          employee_id: selectedSlot.employeeId,
          business_date: selectedSlot.date,
          service_key: selectedSlot.serviceKey,
          time_entry_id: selectedSlot.entryId ?? undefined,
          clock_in_at: values.clockInAt,
          clock_out_at: values.clockOutAt || undefined,
          break_minutes: values.breakMinutes,
          expected_revision: selectedSlot.entryRevision ?? undefined,
          reason: values.reason
        }
      });
      await workspace.reloadOperations();
      await workspaceRealtime.publish('actuals-updated', {
        restaurantId: workspace.activeId,
        source: 'actuals'
      });
      feedback = values.isCorrection ? 'Actual entry corrected.' : 'Manual actual entry added.';
      feedbackTone = 'success';
      return true;
    } catch (error) {
      feedback = error instanceof Error ? error.message : String(error);
      conflictOpen = feedback.includes('CONFLICT:');
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
      await saveActuals({
        restaurantId: workspace.activeId,
        action: 'cancel_entry',
        payload: {
          employee_id: selectedSlot.employeeId,
          business_date: selectedSlot.date,
          service_key: selectedSlot.serviceKey,
          time_entry_id: selectedSlot.entryId,
          expected_revision: selectedSlot.entryRevision ?? undefined,
          reason: values.reason
        }
      });
      await workspace.reloadOperations();
      await workspaceRealtime.publish('actuals-updated', {
        restaurantId: workspace.activeId,
        source: 'actuals'
      });
      feedback = 'Actual entry cancelled and retained in the audit trail.';
      feedbackTone = 'success';
      selectedKey = '';
      entryDialogOpen = false;
      return true;
    } catch (error) {
      feedback = error instanceof Error ? error.message : String(error);
      conflictOpen = feedback.includes('CONFLICT:');
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
      await saveActuals({
        restaurantId: workspace.activeId,
        action,
        payload: {
          week_start: activeWeek,
          expected_revision: Number(activeWorkWeek?.actuals_revision ?? 0),
          reason: weekReason.trim()
        }
      });
      await workspace.reloadOperations();
      await workspaceRealtime.publish('actuals-updated', {
        restaurantId: workspace.activeId,
        source: 'actuals'
      });
      feedback = action === 'approve_week' ? 'Actuals week approved.' : 'Actuals week reopened.';
      feedbackTone = 'success';
      weekAction = null;
      weekReason = '';
    } catch (error) {
      feedback = error instanceof Error ? error.message : String(error);
      conflictOpen = feedback.includes('CONFLICT:');
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

  function weekdayLabel(date: string) {
    return new Intl.DateTimeFormat('en-GB', {
      weekday: 'short',
      timeZone: 'UTC'
    }).format(new Date(`${date}T00:00:00Z`));
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

  function initials(name: string) {
    return name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0])
      .join('')
      .toUpperCase();
  }

  function shortName(name: string) {
    const parts = name.split(/\s+/).filter(Boolean);
    if (parts.length <= 1) return name;
    return `${parts[0]} ${parts[1][0].toUpperCase()}.`;
  }

  function serviceIcon(serviceKey: ServiceKey) {
    return serviceKey === 'lunch' ? '☀' : '☾';
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
    if (slot.plannedRange) return `planned ${slot.plannedRange}`;
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
        ? 'Actuals reviewed and approved'
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
        name: shortName(row.name),
        meta: row.meta || 'Staff',
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
        tone: slot.status as BoardTone,
        icon: serviceIcon(slot.serviceKey),
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
        selected: selectedKey === slot.key,
        liveSince: slot.status === 'live' ? slot.clockInAt : undefined,
        onclick: () => openEntry(slot.key),
        ariaLabel: `${slot.employeeName} · ${serviceLabel(slot.serviceKey)} · ${date}: ${slotStateLabel(slot)}`
      }));
  }

  const dayRailsBoard: BoardDayRail[] = $derived(
    periodColumns.map((column) => ({
      date: column.date,
      label: column.label,
      value: `${column.day}/${column.month}`,
      meta: `${formatHours(dayNetHours(column.date))} · ${dayReviewCount(column.date)} review`,
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
        initials: initials(slot.employeeName),
        tone: slot.status as BoardTone,
        name: slot.employeeName,
        detail: slotStateLabel(slot),
        selected: selectedKey === slot.key,
        liveSince: slot.status === 'live' ? slot.clockInAt : undefined,
        onclick: () => openEntry(slot.key),
        ariaLabel: `${slot.employeeName} ${serviceLabel(serviceKey)} ${slotStateLabel(slot)}`
      }));
      const secondaryChips: BoardChip[] = manualSlots.slice(0, manualCap).map((slot) => ({
        key: slot.key,
        initials: initials(slot.employeeName),
        tone: 'empty' as BoardTone,
        name: slot.employeeName,
        detail: 'Add manually',
        onclick: () => openEntry(slot.key),
        ariaLabel: `Add manual entry for ${slot.employeeName}`
      }));
      return {
        serviceKey,
        icon: serviceIcon(serviceKey),
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
            icon: serviceIcon(serviceKey),
            tone: serviceTone(column.date, serviceKey) as BoardTone,
            value: laneValueFor(column.date, serviceKey),
            reviewCount: serviceReviewCount(column.date, serviceKey) || undefined,
            onclick: () => openServiceEvidence(column.date, serviceKey),
            ariaLabel: `${column.date} ${serviceLabel(serviceKey)}: ${formatHours(serviceNetHours(column.date, serviceKey))}, ${serviceReviewCount(column.date, serviceKey)} review item${serviceReviewCount(column.date, serviceKey) === 1 ? '' : 's'}`
          }))
        }))
      : []
  );
</script>

<svelte:head><title>Timesheet · restogogo</title></svelte:head>

{#if snapshot}
  {#snippet exportPeriod()}
    <div class="payroll-period">
      <label>
        <span>First Monday</span>
        <input type="date" bind:value={payrollPeriodStart} disabled={payrollExporting} />
      </label>
      <label>
        <span>Last Sunday</span>
        <input type="date" bind:value={payrollPeriodEnd} disabled={payrollExporting} />
      </label>
      <small>Approved weeks export as official, fingerprinted payroll lineage. Unapproved weeks download as a DRAFT with no lineage.</small>
    </div>
  {/snippet}
  {#snippet weekFooter()}
    <ActionButton label="Cancel" disabled={saving} onclick={() => (weekAction = null)} />
    <ActionButton
      label={saving ? 'Saving…' : weekAction === 'approve_week' ? 'Approve week' : 'Reopen week'}
      tone={weekAction === 'reopen_week' ? 'danger' : 'primary'}
      disabled={saving}
      onclick={() => weekAction && setWeekStatus(weekAction)}
    />
  {/snippet}

  {#snippet pageHeader()}
    {#if !boardExpanded}
      <header class={`timesheet-hero is-${approvalTone}`} aria-labelledby="timesheet-title">
        <div class="timesheet-hero__copy">
          <span class="timesheet-kicker">Payroll evidence · {weekLabel(activeWeek)} · {weekStatus}</span>
          <h1 id="timesheet-title">{approvalTitle}</h1>
          <p>{approvalLead}</p>
        </div>
        <div class="timesheet-hero__command" aria-label="Payroll proof summary">
          <div class="proof-dial" style={`--proof:${proofProgress}%`}>
            <strong>{formatHours(totals.actualHours)}</strong>
            <span>badged</span>
          </div>
          <dl>
            <div><dt>Planned</dt><dd>{formatHours(totals.plannedHours)}</dd></div>
            <div><dt>Missing</dt><dd>{totals.missing}</dd></div>
            <div><dt>Live</dt><dd>{totals.live}</dd></div>
            <div><dt>Corrected</dt><dd>{totals.adjusted}</dd></div>
          </dl>
        </div>
      </header>
      <FeedbackBanner message={feedback} tone={feedbackTone} />
    {/if}
  {/snippet}

  <PageScaffold header={pageHeader} label="Timesheet payroll cockpit">
    <div class="timesheet-workspace" class:is-expanded={boardExpanded}>
      <section class="timesheet-board" aria-label="Payroll roster ledger">
        <header class="timesheet-console" aria-label="Timesheet cockpit controls">
          <div class="timesheet-console__context">
            <span class="timesheet-kicker">Timesheet cockpit · {timesheetModeLabel}</span>
            <div class="timesheet-console__title">
              <strong>{periodLabel}</strong>
              <small>
                {visibleRows.length} people · {formatHours([...periodSlotsByKey.values()].reduce((sum, slot) => sum + slot.actualHours, 0))} badged ·
                {reviewSlots.length} review item{reviewSlots.length === 1 ? '' : 's'}
              </small>
            </div>
          </div>

          <div class="timesheet-console__controls">
            <div class="timesheet-view-switch" aria-label="Timesheet view">
              <span>View</span>
              <button
                type="button"
                class:is-active={timesheetView === 'roster'}
                aria-pressed={timesheetView === 'roster'}
                onclick={() => (timesheetView = 'roster')}
              >Roster</button>
              <button
                type="button"
                class:is-active={timesheetView === 'service'}
                aria-pressed={timesheetView === 'service'}
                onclick={() => (timesheetView = 'service')}
              >Service</button>
            </div>

            {#if boardExpanded}
              <div class="period-switch" aria-label="Timesheet period">
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

            <div class="timesheet-period-nav" aria-label="Choose period">
              <button type="button" aria-label="Previous period" onclick={() => changePeriod(-1)}>Prev</button>
              <button type="button" aria-label="Next period" onclick={() => changePeriod(1)}>Next</button>
            </div>

            {#if boardExpanded || activeFilterCount}
              <details class="timesheet-staff-tools">
                <summary>Staff tools{activeFilterCount ? ` · ${activeFilterCount}` : ''}</summary>
                <div class="timesheet-staff-tools__panel">
                  <label>
                    <span>Find staff</span>
                    <input bind:value={search} placeholder="Name, role, station..." />
                  </label>
                  <label>
                    <span>Show</span>
                    <select bind:value={scope}>
                      <option value="all">All employees</option>
                      <option value="exceptions">Needs review</option>
                      <option value="live">Working now</option>
                      <option value="adjusted">Corrected only</option>
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
              class="timesheet-focus"
              onclick={() => {
                boardExpanded = !boardExpanded;
                if (!boardExpanded) boardPeriod = 'week';
              }}
            >
              {boardExpanded ? 'Exit focus' : 'Focus ledger'}
            </button>
          </div>
        </header>

        <OperationsBoard
          view={timesheetView === 'roster' ? 'roster' : 'service'}
          periodMode={boardExpanded ? boardPeriod : 'week'}
          expanded={boardExpanded}
          columns={periodColumns}
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
            Monthly focus is a review lens only. Payroll approval still happens week by week, so the current approval gate remains tied to {weekLabel(activeWeek)}.
          </p>
        {/if}
      </section>

      {#if !boardExpanded}
      <aside class="timesheet-rail" aria-label="Payroll actions">
        <section class={`approval-card is-${approvalTone}`}>
          <p>Approval gate</p>
          <h2>{weekStatus === 'approved' ? 'Approved week' : blockedCount ? 'Not ready yet' : 'Ready to approve'}</h2>
          <div class="approval-checks">
            <span style="--rst-i:0">
              <b>{totals.conflicts}</b> conflicts <i class:is-clear={!totals.conflicts}>{totals.conflicts ? '!' : '✓'}</i>
              {#if conflictSlots.length}
                <span class="check-flyout" role="tooltip">
                  {#each conflictSlots.slice(0, 5) as slot (slot.key)}
                    <button type="button" onclick={() => openEntry(slot.key)}><b>{shortName(slot.employeeName)}</b><small>{slot.date.slice(5)} · {serviceLabel(slot.serviceKey)}</small></button>
                  {/each}
                </span>
              {/if}
            </span>
            <span style="--rst-i:1">
              <b>{totals.missing}</b> missing badges <i class:is-clear={!totals.missing}>{totals.missing ? '!' : '✓'}</i>
              {#if missingSlots.length}
                <span class="check-flyout" role="tooltip">
                  {#each missingSlots.slice(0, 5) as slot (slot.key)}
                    <button type="button" onclick={() => openEntry(slot.key)}><b>{shortName(slot.employeeName)}</b><small>{slot.date.slice(5)} · {serviceLabel(slot.serviceKey)}</small></button>
                  {/each}
                </span>
              {/if}
            </span>
            <span style="--rst-i:2">
              <b>{totals.live}</b> live clock-ins <i class:is-clear={!totals.live}>{totals.live ? '!' : '✓'}</i>
              {#if liveSlots.length}
                <span class="check-flyout" role="tooltip">
                  {#each liveSlots.slice(0, 5) as slot (slot.key)}
                    <button type="button" onclick={() => openEntry(slot.key)}>
                      <b>{shortName(slot.employeeName)}</b>
                      <small>{#if slot.clockInAt}<LiveDuration since={slot.clockInAt} />{:else}Working now{/if}</small>
                    </button>
                  {/each}
                </span>
              {/if}
            </span>
          </div>
          <div class="approval-actions">
            {#if weekStatus === 'approved'}
              <button type="button" class="danger-action" disabled={saving} onclick={() => beginWeekAction('reopen_week')}>{saving ? 'Reopening…' : 'Reopen week'}</button>
            {:else if weekStatus === 'open'}
              <button
                type="button"
                class="primary-action"
                disabled={saving || !weekComplete || totals.live > 0 || totals.missing > 0 || totals.conflicts > 0}
                onclick={() => beginWeekAction('approve_week')}
              >{saving ? 'Approving…' : 'Approve week'}</button>
            {/if}
          </div>
        </section>

        <section class="export-card">
          <p>Payroll export</p>
          <h2>{isOwner ? 'Preview before sending.' : 'Owner only'}</h2>
          <span>Column order, draft preview and official lineage stay in the export wizard.</span>
          <div class="export-actions">
            <button type="button" onclick={() => window.print()}>Export PDF</button>
            {#if isOwner}
              <button type="button" class="primary-action" onclick={openExportCsv}>Payroll CSV</button>
            {/if}
          </div>
        </section>

        <section class="review-card">
          <p>Proof stack</p>
          <h2>{reviewSlots.length ? 'Needs a look' : 'Clean ledger'}</h2>
          <div class="review-list">
            {#each reviewSlots.slice(0, 6) as slot (slot.key)}
              <button type="button" class={`review-item is-${slot.status}`} onclick={() => openEntry(slot.key)}>
                <span>{initials(slot.employeeName)}</span>
                <strong>{shortName(slot.employeeName)}</strong>
                {#if slot.status === 'live' && slot.clockInAt}
                  <small>{slot.date.slice(5)} · {serviceLabel(slot.serviceKey)} · <LiveDuration since={slot.clockInAt} /></small>
                {:else}
                  <small>{slot.date.slice(5)} · {serviceLabel(slot.serviceKey)} · {slotStateLabel(slot)}</small>
                {/if}
              </button>
            {:else}
              <span class="review-empty">No missing badges, live entries or corrections blocking the story.</span>
            {/each}
          </div>
        </section>

        <WeekHistory items={historyItems}
          title="Payroll trail"
          eyebrow="Audited evidence"
          variant="rail"
          limit={8}
          emptyMessage="No approval or export history yet."
        />
      </aside>
      {/if}
    </div>
  </PageScaffold>

  <Drawer
    open={entryDialogOpen && Boolean(selectedSlot)}
    title={selectedSlot ? `${selectedSlot.employeeName} · ${serviceLabel(selectedSlot.serviceKey)}` : 'Actual entry'}
    description={selectedSlot?.entryId ? 'Correct worked time with an audited manager reason.' : 'Add worked time manually for this service.'}
    onclose={() => !saving && (entryDialogOpen = false)}
  >
    {#if selectedSlot}
      <ActualsEntryEditor
        slot={selectedSlot}
        {timezone}
        {editable}
        adjustments={selectedAdjustments}
        onsave={saveEntry}
        oncancel={cancelEntryAction}
        onproof={loadProof}
        onfeedback={(message, tone) => { feedback = message; feedbackTone = tone; }}
      />
    {/if}
  </Drawer>
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

  <Dialog
    open={weekAction !== null}
    title={weekAction === 'approve_week' ? 'Approve actuals week' : 'Reopen actuals week'}
    description={weekAction === 'approve_week'
      ? 'Approval closes manager editing until the week is deliberately reopened.'
      : 'Reopening restores manager corrections and records an audit event.'}
    size="small"
    onclose={() => !saving && (weekAction = null)}
    footer={weekFooter}
  >
    <label class="week-reason"><span>Manager reason</span><input bind:value={weekReason} /></label>
  </Dialog>
  <RevisionConflictDialog
    open={conflictOpen}
    title="Actuals changed elsewhere"
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
  <p>Loading Actuals…</p>
{/if}

<style>
  :global(.app__content[data-atmosphere='actuals']) {
    padding-top: 0;
  }

  .timesheet {
    min-width: 0;
    display: grid;
    gap: 18px;
  }

  .timesheet-hero {
    position: relative;
    min-width: 0;
    min-height: 210px;
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(320px, 480px);
    gap: clamp(18px, 3vw, 42px);
    align-items: center;
    padding: clamp(24px, 3.4vw, 38px) clamp(24px, 4vw, 46px);
    overflow: hidden;
    color: #fffaf2;
    background:
      radial-gradient(circle at 84% 16%, rgba(74, 222, 128, 0.18), transparent 24%),
      radial-gradient(circle at 95% 88%, rgba(59, 130, 246, 0.24), transparent 30%),
      linear-gradient(105deg, rgba(8, 13, 20, 0.98) 0%, rgba(11, 22, 32, 0.94) 54%, rgba(46, 32, 20, 0.76) 100%),
      url('/module-backgrounds/actuals.webp') center / cover;
    border-bottom: 1px solid rgba(var(--rst-ui-action-rgb), 0.26);
  }

  .timesheet-hero::after {
    content: '';
    position: absolute;
    inset: auto 0 0;
    height: 5px;
    background: linear-gradient(90deg, var(--rst-ui-action), #38bdf8, #42d884, var(--rst-gold));
  }

  .timesheet-hero__copy,
  .timesheet-proof {
    position: relative;
    z-index: 1;
  }

  .timesheet-hero__copy {
    display: grid;
    gap: 10px;
  }

  .timesheet-hero p,
  .evidence-board__head p,
  .approval-card p,
  .review-card p,
  .export-card p {
    margin: 0;
    color: var(--rst-ui-action);
    font-size: 11px;
    font-weight: var(--rst-fw-display);
    letter-spacing: 0.1em;
    text-transform: uppercase;
  }

  .timesheet-hero h1 {
    margin: 0;
    max-width: 980px;
    overflow: hidden;
    font-size: clamp(34px, 4.35vw, 62px);
    line-height: 0.92;
    letter-spacing: -0.058em;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .timesheet-hero__copy > span {
    max-width: 760px;
    color: rgba(255, 250, 242, 0.78);
    font-size: clamp(14px, 1.28vw, 17px);
    line-height: 1.45;
  }

  .timesheet-proof {
    justify-self: end;
    width: min(460px, 100%);
    display: grid;
    grid-template-columns: 156px minmax(0, 1fr);
    gap: 14px;
    align-items: stretch;
    padding: 14px;
    border: 1px solid rgba(255, 255, 255, 0.16);
    border-radius: 24px;
    background: rgba(7, 13, 21, 0.52);
    box-shadow: 0 18px 46px rgba(0, 0, 0, 0.22);
    backdrop-filter: blur(16px);
  }

  .proof-orb {
    --proof: 0%;
    min-height: 150px;
    display: grid;
    place-items: center;
    align-content: center;
    border-radius: 22px;
    background:
      conic-gradient(from -90deg, #42d884 0 var(--proof), rgba(255, 255, 255, 0.12) var(--proof) 100%),
      rgba(12, 23, 35, 0.8);
    box-shadow: inset 0 0 0 10px rgba(8, 14, 22, 0.82);
  }

  .proof-orb strong {
    font-size: 42px;
    line-height: 0.9;
    letter-spacing: -0.06em;
  }

  .proof-orb span {
    color: rgba(255, 250, 242, 0.72);
    font-size: 11px;
    font-weight: var(--rst-fw-bold);
    text-transform: uppercase;
  }

  .proof-facts {
    display: grid;
    gap: 8px;
  }

  .proof-facts span {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 11px 12px;
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 14px;
    color: rgba(255, 250, 242, 0.76);
    background: rgba(255, 255, 255, 0.055);
    font-size: 12px;
  }

  .proof-facts b {
    color: #fffaf2;
    font-size: 18px;
  }

  .timesheet-layout {
    min-width: 0;
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(320px, 0.32fr);
    gap: 18px;
    align-items: start;
    padding: 0 clamp(18px, 3vw, 44px) 34px;
  }

  .evidence-board,
  .timesheet-rail > section,
  .timesheet-rail :global(.panel) {
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 26px;
    box-shadow: 0 22px 60px rgba(29, 20, 10, 0.14);
  }

  .evidence-board {
    min-width: 0;
    overflow: hidden;
    color: #f8fbff;
    background:
      radial-gradient(circle at 96% 0%, rgba(56, 189, 248, 0.16), transparent 30%),
      linear-gradient(145deg, #111a27 0%, #0c1825 55%, #0a1320 100%);
  }

  .evidence-board__head {
    min-width: 0;
    display: flex;
    justify-content: space-between;
    gap: 18px;
    align-items: center;
    padding: 24px 28px 18px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  }

  .evidence-board__head h2,
  .approval-card h2,
  .review-card h2,
  .export-card h2 {
    margin: 0;
    color: #fffaf2;
    font-size: clamp(24px, 2.4vw, 36px);
    line-height: 0.98;
    letter-spacing: -0.055em;
  }

  .evidence-board__head span,
  .export-card > span,
  .review-empty {
    color: #90a4bf;
    font-size: 12px;
  }

  .export-actions button,
  .approval-actions button {
    font: inherit;
  }

  .export-actions button,
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
  .review-card,
  .export-card {
    min-width: 0;
    display: grid;
    gap: 14px;
    padding: 20px;
    color: #fffaf2;
    background:
      radial-gradient(circle at 100% 0%, rgba(240, 100, 35, 0.18), transparent 36%),
      linear-gradient(145deg, #211b18, #15191f);
  }

  .approval-card.is-ready,
  .approval-card.is-approved {
    background:
      radial-gradient(circle at 100% 0%, rgba(66, 216, 132, 0.22), transparent 36%),
      linear-gradient(145deg, #172018, #11191f);
  }

  .approval-card.is-blocked {
    background:
      radial-gradient(circle at 100% 0%, rgba(240, 100, 35, 0.24), transparent 36%),
      linear-gradient(145deg, #241915, #15191f);
  }

  .approval-checks {
    display: grid;
    gap: 8px;
  }

  .approval-checks span {
    position: relative;
    display: grid;
    grid-template-columns: 34px minmax(0, 1fr) 24px;
    gap: 10px;
    align-items: center;
    padding: 10px;
    border: 1px solid rgba(255, 255, 255, 0.09);
    border-radius: 14px;
    color: #c7d3e2;
    background: rgba(255, 255, 255, 0.045);
    font-size: 12px;
    font-weight: var(--rst-fw-bold);
    animation: rst-fade-up .4s var(--rst-ease-out) backwards;
    animation-delay: calc(var(--rst-i, 0) * 90ms);
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

  .approval-checks .check-flyout {
    position: absolute;
    z-index: 20;
    top: calc(100% + 6px);
    left: 0;
    right: 0;
    display: grid;
    gap: 5px;
    padding: 8px;
    border: 1px solid rgba(255, 255, 255, 0.14);
    border-radius: var(--rst-ui-radius-lg);
    background: #12181f;
    box-shadow: 0 18px 40px rgba(0, 0, 0, 0.5);
    opacity: 0;
    pointer-events: none;
    transform: translateY(-4px);
    transition: opacity .16s ease, transform .16s var(--rst-ease-out);
  }

  .approval-checks span:hover .check-flyout,
  .approval-checks span:focus-within .check-flyout {
    opacity: 1;
    transform: translateY(0);
    pointer-events: auto;
  }

  .check-flyout button {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    padding: 7px 9px;
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: var(--rst-ui-radius-md);
    background: rgba(255, 255, 255, 0.06);
    color: #fffaf2;
    font: inherit;
    text-align: left;
    cursor: pointer;
  }

  .check-flyout button:hover {
    background: rgba(255, 255, 255, 0.12);
  }

  .approval-checks .check-flyout b {
    color: #fffaf2;
    font-size: 12px;
    font-weight: var(--rst-fw-bold);
  }

  .approval-checks .check-flyout small {
    color: rgba(255, 250, 242, 0.6);
    font-size: 10px;
    font-weight: var(--rst-fw-regular);
  }

  @keyframes rst-check-ring {
    0% { box-shadow: 0 0 0 0 rgba(66, 216, 132, .5); }
    100% { box-shadow: 0 0 0 8px rgba(66, 216, 132, 0); }
  }

  .approval-actions,
  .export-actions {
    display: flex;
    gap: 10px;
    flex-wrap: wrap;
  }

  .approval-actions button,
  .export-actions button {
    flex: 1 1 120px;
    padding: 0 14px;
  }

  .primary-action {
    color: #160c06 !important;
    border-color: rgba(240, 100, 35, 0.7) !important;
    background: var(--rst-ui-action) !important;
  }

  .approval-actions button:disabled,
  .export-actions button:disabled,
  .primary-action:disabled {
    cursor: not-allowed;
    opacity: 0.48;
    filter: grayscale(0.45);
  }

  .danger-action {
    border-color: rgba(240, 100, 35, 0.35) !important;
    color: #ffd8cf !important;
  }

  .review-card {
    background:
      radial-gradient(circle at 100% 0%, rgba(56, 189, 248, 0.16), transparent 36%),
      linear-gradient(145deg, #111a27, #0c1622);
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

  .export-card {
    background:
      radial-gradient(circle at 100% 0%, rgba(247, 183, 51, 0.16), transparent 36%),
      linear-gradient(145deg, #1b1c1d, #101820);
  }

  .payroll-period { display: grid; gap: 12px; }
  .payroll-period input { min-height: 40px; padding: 8px 10px; border: 1px solid var(--rst-ui-line); border-radius: var(--rst-ui-radius-md); color: var(--rst-ui-text); background: var(--rst-ui-surface-field-strong); font: inherit; }
  .payroll-period small { color: var(--rst-ui-muted); }
  .week-reason input { min-height: 40px; padding: 8px 10px; border: 1px solid var(--rst-ui-line); border-radius: var(--rst-ui-radius-md); color: var(--rst-ui-text); background: var(--rst-ui-surface-field-strong); font: inherit; }

  @media (max-width: 1180px) {
    .timesheet-hero,
    .timesheet-layout {
      grid-template-columns: 1fr;
    }

    .timesheet-proof {
      justify-self: stretch;
    }
  }

  @media (max-width: 760px) {
    .timesheet-hero {
      min-height: auto;
      padding: 24px 18px;
    }

    .timesheet-hero h1 {
      white-space: normal;
    }

    .timesheet-proof,
    .evidence-board__head {
      grid-template-columns: 1fr;
    }

    .evidence-board__head {
      display: grid;
    }

    .timesheet-layout {
      padding-inline: 12px;
    }
  }

  @media print {
    .timesheet-hero,
    .timesheet-rail,
    .timesheet-view-switch,
    .timesheet-focus-switch {
      display: none !important;
    }
  }

  /* Timesheet v2: roster-first payroll cockpit. */
  :global(.app__content[data-atmosphere='actuals'] .page-scaffold) {
    gap: 0;
  }

  .timesheet-hero {
    min-height: 188px;
    grid-template-columns: minmax(0, 1fr) minmax(300px, 460px);
    gap: clamp(18px, 3vw, 42px);
    padding: clamp(22px, 3.2vw, 34px) clamp(24px, 4vw, 44px);
    background:
      radial-gradient(circle at 74% 18%, rgba(66, 216, 132, 0.15), transparent 25%),
      radial-gradient(circle at 96% 82%, rgba(56, 189, 248, 0.28), transparent 28%),
      linear-gradient(100deg, rgba(9, 14, 22, 0.98) 0%, rgba(11, 22, 32, 0.93) 50%, rgba(48, 33, 22, 0.78) 100%),
      url('/module-backgrounds/actuals.webp') center / cover;
  }

  .timesheet-hero__copy {
    max-width: 860px;
    align-content: center;
    gap: 9px;
  }

  .timesheet-kicker {
    color: var(--rst-ui-action);
    font-size: 11px;
    font-weight: var(--rst-fw-display);
    letter-spacing: 0.1em;
    text-transform: uppercase;
  }

  .timesheet-hero h1 {
    max-width: 100%;
    font-size: clamp(34px, 4.15vw, 58px);
    line-height: 0.92;
  }

  .timesheet-hero p {
    max-width: 720px;
    color: rgba(255, 250, 242, 0.8);
    font-size: clamp(14px, 1.28vw, 17px);
    line-height: 1.45;
    letter-spacing: normal;
    text-transform: none;
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
    letter-spacing: -0.06em;
  }

  .proof-dial span,
  .timesheet-hero__command dt {
    color: rgba(255, 250, 242, 0.62);
    font-size: 10px;
    font-weight: var(--rst-fw-display);
    letter-spacing: 0.08em;
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

  .timesheet-workspace.is-expanded {
    grid-template-columns: minmax(0, 1fr);
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

  .timesheet-console__title strong {
    min-width: 0;
    overflow: hidden;
    color: #fff;
    font-size: clamp(24px, 2.4vw, 34px);
    line-height: 0.95;
    letter-spacing: -0.055em;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .timesheet-console__title small,
  .timesheet-staff-tools label span {
    color: rgba(255, 250, 242, 0.62);
    font-size: 10px;
    font-weight: var(--rst-fw-display);
    letter-spacing: 0.08em;
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

  .timesheet-view-switch,
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

  .timesheet-view-switch > span,
  .period-switch > span {
    padding: 0 7px;
    color: rgba(255, 250, 242, 0.5);
    font-size: 10px;
    font-weight: var(--rst-fw-display);
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }

  .timesheet-view-switch button,
  .period-switch button,
  .timesheet-period-nav button,
  .timesheet-staff-tools summary,
  .timesheet-focus {
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

  .timesheet-view-switch button.is-active,
  .period-switch button.is-active,
  .timesheet-focus {
    border-color: rgba(240, 100, 35, 0.64);
    color: #fff;
    background: linear-gradient(135deg, #f06423, #f7a733);
    box-shadow: 0 10px 28px rgba(240, 100, 35, 0.18);
  }

  .timesheet-period-nav button:hover,
  .timesheet-view-switch button:hover,
  .period-switch button:hover,
  .timesheet-staff-tools summary:hover,
  .timesheet-focus:hover {
    color: #fff;
    transform: translateY(-1px);
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
    .timesheet-hero,
    .timesheet-workspace,
    .timesheet-workspace.is-expanded {
      grid-template-columns: 1fr;
    }

    .timesheet-hero__command {
      justify-self: stretch;
    }
  }

  @media (max-width: 760px) {
    .timesheet-hero {
      min-height: auto;
      padding: 24px 18px;
    }

    .timesheet-hero h1 {
      white-space: normal;
    }

    .timesheet-hero__command,
    .timesheet-console {
      grid-template-columns: 1fr;
    }

    .timesheet-workspace {
      padding: 16px 12px;
    }
  }

  @media print {
    .timesheet-hero,
    .timesheet-rail,
    .timesheet-console__controls {
      display: none !important;
    }
  }
</style>
