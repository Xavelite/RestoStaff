<script lang="ts">
  import { onMount } from 'svelte';
  import { page } from '$app/state';
  import {
    saveAbsence,
    saveEmployeeAvailability,
    saveWorkPatternException
  } from '$lib/api/mutations';
  import { friendlyError } from '$lib/api/error-messages';
  import { workspaceRealtime } from '$lib/realtime/workspace-realtime.svelte';
  import { leaveBalanceForEmployee } from '$lib/absence/leave-balance';
  import {
    addDays,
    addMonths,
    activeServiceKeys,
    formatHours,
    hoursBetweenInstants,
    mondayFor,
    monthLabel,
    monthStart,
    serviceDisplay,
    serviceLabel,
    todayInTimezone,
    type ServiceKey
  } from '$lib/calendar/date';
  import type { CalendarDay } from '$lib/calendar/calendar-model';
  import { instantClockLabel, resolveWorkspaceServiceSlot, type ServiceSlotTruth } from '$lib/calendar/service-slot';
  import ActionButton from '$lib/components/ActionButton.svelte';
  import FeedbackBanner from '$lib/components/FeedbackBanner.svelte';
  import WorkspacePage from '$lib/workspace-ui/WorkspacePage.svelte';
  import StatusPill from '$lib/components/StatusPill.svelte';
  import EmployeeSlotDialog from '$lib/employee/EmployeeSlotDialog.svelte';
  import {
    employeeSlotActionReason,
    defaultEmployeeTimeOffType,
    groupTimeOffRanges,
    removeEmployeeSlotSelection,
    selectionWeekStarts,
    setAvailabilityOverride,
    timeOffServiceDrafts,
    toggleEmployeeSlotSelection,
    toggleAvailabilityOverride,
    type EmployeeSelfServiceMode,
    type EmployeeSlotSelection
  } from '$lib/employee/employee-self-service';
  import {
    availabilityForWeek,
    contractPlanForDate,
    employeeDayDetails,
    employeeForId,
    employeeMonth,
    type AvailabilityDraft,
    type AvailabilityMode,
    type EmployeeShift,
  } from '$lib/employee/employee-model';
  import { workRegime } from '$lib/domain/operations';
  import { confirmAction } from '$lib/ui/confirm.svelte';
  import { workspace } from '$lib/workspace/workspace.svelte';
  import { i18n, t } from '$lib/i18n/i18n.svelte';
  import { unsavedChanges } from '$lib/navigation/unsaved-changes.svelte';

  const snapshot = $derived(workspace.employeeOperations);
  const activeServiceKeySet = $derived(new Set(activeServiceKeys(snapshot?.services)));
  const employeeId = $derived(workspace.active?.employee_id ?? '');
  const timezone = $derived(
    snapshot?.restaurant_settings.timezone ||
      workspace.bootstrap?.restaurant_settings.timezone ||
      'Europe/Brussels'
  );
  const today = $derived(todayInTimezone(timezone));
  let selectedDate = $state('');
  let month = $state('');
  let selectedAvailabilitySlots = $state<EmployeeSlotSelection[]>([]);
  let selectedTimeOffSlots = $state<EmployeeSlotSelection[]>([]);
  let availabilityOverrides = $state<AvailabilityDraft[]>([]);
  let absenceTypeId = $state('');
  let comment = $state('');
  let saving = $state(false);
  let feedback = $state('');
  let feedbackTone = $state<'info' | 'success' | 'warning' | 'danger'>('info');
  let slotDetailsOpen = $state(false);
  let dialogDate = $state('');
  let dialogService = $state<ServiceKey | ''>('');

  const activeMonth = $derived(month || monthStart(today));
  const visibleFrom = $derived(mondayFor(activeMonth));
  const visibleTo = $derived(addDays(visibleFrom, 41));
  const contractByWeek = new Map<string, EmployeeShift[]>();
  $effect(() => {
    if (workspace.activeId && employeeId && visibleFrom) {
      void workspace
        .loadEmployeeOperations(visibleFrom, visibleTo, true)
        .catch(() => undefined);
    }
  });
  const employee = $derived(snapshot ? employeeForId(snapshot, employeeId) : null);
  const contract = $derived(
    snapshot?.employee_contracts.find(
      (item) => item.employee_id === employeeId && item.active && item.is_current
    ) ?? null
  );
  const contractType = $derived(
    snapshot?.contract_types.find((item) => item.id === contract?.contract_type_id)
  );
  const availabilityMode = $derived<AvailabilityMode>(
    workRegime(contract?.work_regime, contractType?.code)
  );
  const serviceDrafts = $derived(timeOffServiceDrafts(selectedTimeOffSlots));
  const days = $derived(
    snapshot && employeeId
      ? employeeMonth(
          snapshot,
          employeeId,
          activeMonth,
          selectedDate || today,
          today,
          availabilityOverrides,
          serviceDrafts,
          availabilityMode
        )
      : []
  );
  const details = $derived(
    snapshot && employeeId
      ? employeeDayDetails(snapshot, employeeId, selectedDate || today)
      : {
          shifts: [],
          entries: [],
          absences: [],
          workPatternExceptions: [],
          availability: [],
          recurring: []
        }
  );
  const dialogTruth = $derived<ServiceSlotTruth | null>(
    snapshot && employeeId && dialogDate && dialogService
      ? resolveCalendarTruth(dialogDate, dialogService)
      : null
  );
  const timeOffRanges = $derived(
    groupTimeOffRanges(selectedTimeOffSlots, activeServiceKeys(snapshot?.services))
  );
  const defaultTimeOffType = $derived(
    snapshot ? defaultEmployeeTimeOffType(snapshot.absence_types) : null
  );
  const availabilityChanged = $derived(availabilityOverrides.length > 0);
  const hasPendingEdits = $derived(
    availabilityChanged || selectedTimeOffSlots.length > 0
  );
  const canSave = $derived(
    !saving &&
      ((availabilityMode === 'weekly_availability' && availabilityChanged) ||
        selectedTimeOffSlots.length > 0)
  );
  const leaveBalance = $derived(
    snapshot && employeeId
      ? leaveBalanceForEmployee(snapshot, employeeId, today)
      : { entitlement: 0, approved: 0, pending: 0, remaining: 0 }
  );
  const leaveBalancePercent = $derived(
    leaveBalance.entitlement > 0
      ? Math.max(0, Math.min(100, Math.round((leaveBalance.remaining / leaveBalance.entitlement) * 100)))
      : 100
  );
  const availabilitySelectedKeySet = $derived(new Set(selectedAvailabilitySlots.map((slot) => slot.key)));
  const timeOffSelectedKeySet = $derived(new Set(selectedTimeOffSlots.map((slot) => slot.key)));
  const selectedDay = $derived(days.find((day) => day.date === (selectedDate || today)) ?? null);
  const monthWeeks = $derived.by(() => {
    const rows = [];
    for (let index = 0; index < days.length; index += 7) rows.push(days.slice(index, index + 7));
    return rows;
  });
  const monthEntries = $derived(
    snapshot
      ? snapshot.time_entries.filter(
          (entry) =>
            entry.employee_id === employeeId &&
            entry.business_date >= activeMonth &&
            entry.business_date < addMonths(activeMonth, 1) &&
            entry.status !== 'cancelled'
        )
      : []
  );
  const workedHours = $derived(
    monthEntries.reduce(
      (sum, entry) =>
        sum +
        Math.max(
          0,
          hoursBetweenInstants(entry.clock_in_at, entry.clock_out_at) -
            Number(entry.break_minutes ?? 0) / 60
        ),
      0
    )
  );

  function serviceName(serviceKey: ServiceKey): string {
    return serviceLabel(serviceKey, snapshot?.services);
  }

  $effect(() => {
    if (selectedDate) return;
    const requested = page.url.searchParams.get('date');
    const initial = requested && /^\d{4}-\d{2}-\d{2}$/.test(requested) ? requested : today;
    selectedDate = initial;
    month = monthStart(initial);
    const service = page.url.searchParams.get('service');
    if (service && /^[a-z][a-z0-9-]{0,39}$/.test(service)) {
      selectedTimeOffSlots = [
        { key: `${employeeId}|${initial}|${service}`, date: initial, serviceKey: service }
      ];
    }
  });

  function selectDate(date: string) {
    const select = () => {
      selectedDate = date;
      month = monthStart(date);
      feedback = '';
    };
    if (monthStart(date) !== activeMonth) void unsavedChanges.runOrRequest(select);
    else select();
  }

  function changeMonth(amount: number) {
    void unsavedChanges.runOrRequest(() => {
      month = addMonths(activeMonth, amount);
      selectedDate = month;
      clearAllSelections();
      feedback = '';
    });
  }

  function syncAvailabilityHighlight() {
    selectedAvailabilitySlots = availabilityOverrides.map((item) => ({
      key: `${employeeId}|${item.date}|${item.serviceKey}`,
      date: item.date,
      serviceKey: item.serviceKey
    }));
  }

  function blockReasonFor(truth: ServiceSlotTruth, date: string, mode: EmployeeSelfServiceMode): string {
    if (mode === 'availability' && !activeServiceKeySet.has(truth.serviceKey)) {
      const reason = t('This service is archived.');
      feedback = reason;
      feedbackTone = 'warning';
      return reason;
    }
    const reason = employeeSlotActionReason({
      truth,
      policy: availabilityMode,
      mode,
      today,
    });
    if (reason) {
      feedback = reason;
      feedbackTone = 'warning';
    }
    return reason;
  }

  function resolveCalendarTruth(date: string, serviceKey: ServiceKey) {
    if (!snapshot) return null;
    return resolveWorkspaceServiceSlot({
      snapshot,
      employeeId,
      date,
      serviceKey,
      today,
      plan: contractPlanForDate(
        snapshot,
        employeeId,
        availabilityMode,
        date,
        serviceKey,
        contractByWeek
      ),
      availability:
        availabilityMode === 'weekly_availability'
          ? availabilityOverrides.find(
              (item) => item.date === date && item.serviceKey === serviceKey
            )?.state
          : ''
    });
  }

  // Shared by the direct-tap fast path and the slot dialog, so both
  // entry points always agree on what this service allows right now.
  function toggleAvailabilityFor(date: string, serviceKey: ServiceKey, truth: ServiceSlotTruth) {
    if (blockReasonFor(truth, date, 'availability')) return;
    selectedTimeOffSlots = removeEmployeeSlotSelection(selectedTimeOffSlots, truth.key);
    availabilityOverrides = toggleAvailabilityOverride(
      availabilityOverrides,
      { date, serviceKey },
      truth.availability
    );
    syncAvailabilityHighlight();
    feedback = '';
  }

  // Dialog path: set available or clear it; leave remains a separate request.
  function chooseAvailabilityFor(
    date: string,
    serviceKey: ServiceKey,
    truth: ServiceSlotTruth,
    state: AvailabilityDraft['state']
  ) {
    if (blockReasonFor(truth, date, 'availability')) return;
    selectedTimeOffSlots = removeEmployeeSlotSelection(selectedTimeOffSlots, truth.key);
    availabilityOverrides = setAvailabilityOverride(
      availabilityOverrides,
      { date, serviceKey },
      state,
      truth.availability
    );
    syncAvailabilityHighlight();
    feedback = '';
  }

  function requestTimeOffFor(date: string, serviceKey: ServiceKey, truth: ServiceSlotTruth) {
    if (blockReasonFor(truth, date, 'time_off')) return;
    if (availabilityMode === 'weekly_availability') {
      availabilityOverrides = setAvailabilityOverride(
        availabilityOverrides,
        { date, serviceKey },
        '',
        truth.availability
      );
      syncAvailabilityHighlight();
    }
    const key = `${employeeId}|${date}|${serviceKey}`;
    const selection = { key, date, serviceKey };
    selectedTimeOffSlots = toggleEmployeeSlotSelection(selectedTimeOffSlots, selection);
    feedback = '';
  }

  // One tap, no page-level mode: a pending request on this slot cancels it, an
  // in-progress time-off/change basket keeps extending itself, otherwise a
  // weekly-availability slot toggles instantly and everything else opens the
  // dialog, which is also where every action lives explicitly.
  function primaryTap(date: string, serviceKey: ServiceKey) {
    if (!snapshot) return;
    const future = date >= today;
    const truth = resolveCalendarTruth(date, serviceKey);
    if (!truth) return;

    if (future && truth.absence?.status === 'pending') {
      void cancelAbsence(truth.absence.id);
      return;
    }
    if (future && truth.workPatternException?.status === 'pending') {
      void cancelWorkPatternException(truth.workPatternException.id);
      return;
    }
    if (selectedTimeOffSlots.length > 0) {
      requestTimeOffFor(date, serviceKey, truth);
      return;
    }
    if (
      availabilityMode === 'weekly_availability' &&
      activeServiceKeySet.has(serviceKey)
    ) {
      toggleAvailabilityFor(date, serviceKey, truth);
      return;
    }
    if (availabilityMode === 'fixed_schedule') {
      requestTimeOffFor(date, serviceKey, truth);
    }
    openSlotDetails(date, serviceKey);
  }

  function openSlotDetails(date: string, serviceKey: ServiceKey) {
    selectedDate = date;
    month = monthStart(date);
    dialogDate = date;
    dialogService = serviceKey;
    slotDetailsOpen = true;
  }

  function toggleDialogTimeOff() {
    if (!dialogTruth) return;
    const wasSelected = timeOffSelectedKeySet.has(dialogTruth.key);
    requestTimeOffFor(dialogDate, dialogTruth.serviceKey, dialogTruth);
    if (wasSelected) {
      slotDetailsOpen = false;
      dialogDate = '';
      dialogService = '';
    }
  }

  function clearAvailabilitySelection() {
    selectedAvailabilitySlots = [];
    availabilityOverrides = [];
  }

  function clearTimeOffSelection() {
    selectedTimeOffSlots = [];
    absenceTypeId = '';
    comment = '';
  }

  function clearAllSelections() {
    clearAvailabilitySelection();
    clearTimeOffSelection();
  }


  async function saveChanges() {
    if (saving || !workspace.activeId || !employeeId || !snapshot) return;
    saving = true;
    const messages: string[] = [];
    let hasError = false;
    let changed = false;

    // Each bucket submits by its own kind, independent of what triggered it,
    // so a pending time-off draft is never stranded or wiped by another edit.
    if (availabilityMode === 'weekly_availability' && availabilityOverrides.length > 0) {
      const weeks = selectionWeekStarts(selectedAvailabilitySlots);
      const rows = weeks.flatMap((weekStart) =>
        availabilityForWeek(snapshot, employeeId, weekStart)
          .filter((slot) => slot.date >= today)
          .map((slot) => ({
            ...slot,
            state:
              availabilityOverrides.find(
                (override) => override.date === slot.date && override.serviceKey === slot.serviceKey
              )?.state ?? slot.state
          }))
      );
      try {
        await saveEmployeeAvailability({
          restaurantId: workspace.activeId,
          employeeId,
          availability: rows.map((slot) => ({
            date: slot.date,
            service_key: slot.serviceKey,
              availability_state: slot.state === 'available' ? 'available' : ''
          }))
        });
        changed = true;
        messages.push('Availability saved');
      } catch (err) {
        hasError = true;
        messages.push(err instanceof Error ? err.message : 'Availability save failed');
      }
    }

    if (selectedTimeOffSlots.length > 0) {
      const typeId = absenceTypeId || defaultTimeOffType?.id || '';
      if (!typeId) {
        hasError = true;
        messages.push('Add a leave type before requesting time off');
      } else {
        let ok = 0;
        for (const range of timeOffRanges) {
          try {
            await saveAbsence({
              restaurantId: workspace.activeId,
              employeeId,
              action: 'create_by_employee',
              payload: {
                absence_type_id: typeId,
                start_date: range.startDate,
                end_date: range.endDate,
                service_key: range.serviceKey || null,
                employee_comment: comment.trim()
              }
            });
            changed = true;
            ok += 1;
          } catch (err) {
            hasError = true;
            messages.push(err instanceof Error ? err.message : 'Time-off request failed');
          }
        }
        if (ok) messages.push(ok === 1 ? 'Time-off submitted' : `Time-off submitted (${ok})`);
      }
    }

    if (!messages.length) {
      saving = false;
      return;
    }
    let refreshFailed = false;
    if (changed) {
      try {
        await workspace.reloadEmployeeOperations();
      } catch {
        refreshFailed = true;
      }
      await workspaceRealtime.publish('notification-refresh', {
        restaurantId: workspace.activeId,
        source: 'system'
      });
    }
    if (hasError) {
      // Keep every draft so the employee can retry the part that failed.
      feedback = messages.join(' · ');
      feedbackTone = 'danger';
    } else {
      clearAllSelections();
      slotDetailsOpen = false;
      dialogDate = '';
      dialogService = '';
      feedback = refreshFailed
        ? `${messages.join(' · ')} · Refresh to see the latest data.`
        : messages.join(' · ');
      feedbackTone = refreshFailed ? 'warning' : 'success';
    }
    saving = false;
  }

  function discardChanges() {
    clearAllSelections();
    slotDetailsOpen = false;
    dialogDate = '';
    dialogService = '';
    feedback = '';
  }


  onMount(() =>
    unsavedChanges.register({
      id: 'employee-my-time',
      label: 'My time',
      isDirty: () => hasPendingEdits,
      save: saveChanges,
      discard: discardChanges
    })
  );

  async function cancelAbsence(absenceId: string) {
    if (!workspace.activeId || !employeeId || saving) return;
    const confirmed = await confirmAction({
      title: 'Cancel this time-off request?',
      body: 'Your manager will no longer see it. You can request the same days again afterwards.',
      confirmLabel: 'Cancel request',
      cancelLabel: 'Keep it'
    });
    if (!confirmed) return;
    saving = true;
    try {
      await saveAbsence({
        restaurantId: workspace.activeId,
        employeeId,
        absenceId,
        action: 'cancel_by_employee',
        payload: {
          employee_comment: comment.trim() || 'Cancelled by employee',
          cancellation_reason: comment.trim() || 'Cancelled by employee'
        }
      });
      await workspace.reloadEmployeeOperations();
      await workspaceRealtime.publish('notification-refresh', {
        restaurantId: workspace.activeId,
        source: 'system'
      });
      slotDetailsOpen = false;
      dialogDate = '';
      dialogService = '';
      feedback = 'Time off cancelled.';
      feedbackTone = 'success';
    } catch (error) {
      feedback = friendlyError(error, 'absence');
      feedbackTone = 'danger';
    } finally {
      saving = false;
    }
  }

  async function cancelWorkPatternException(workPatternExceptionId: string) {
    if (!workspace.activeId || !employeeId || saving) return;
    const confirmed = await confirmAction({
      title: 'Cancel this schedule change request?',
      body: 'Your manager will no longer see it. You can ask again afterwards.',
      confirmLabel: 'Cancel request',
      cancelLabel: 'Keep it'
    });
    if (!confirmed) return;
    saving = true;
    try {
      await saveWorkPatternException({
        restaurantId: workspace.activeId,
        employeeId,
        workPatternExceptionId,
        action: 'cancel_by_employee',
        payload: {
          reason: comment.trim() || 'Cancelled by employee',
          cancellation_reason: comment.trim() || 'Cancelled by employee'
        }
      });
      await workspace.reloadEmployeeOperations();
      await workspaceRealtime.publish('planning-saved', {
        restaurantId: workspace.activeId,
        source: 'planning'
      });
      slotDetailsOpen = false;
      dialogDate = '';
      dialogService = '';
      feedback = 'Schedule change cancelled.';
      feedbackTone = 'success';
    } catch (error) {
      feedback = friendlyError(error, 'absence');
      feedbackTone = 'danger';
    } finally {
      saving = false;
    }
  }

  function dayName(date: string) {
    return new Intl.DateTimeFormat(i18n.intlLocale, { weekday: 'short' }).format(new Date(`${date}T12:00:00Z`));
  }

  function dayNumber(date: string) {
    return new Intl.DateTimeFormat('en-GB', { day: '2-digit' }).format(new Date(`${date}T12:00:00Z`));
  }

  function requestCopy() {
    if (!hasPendingEdits) return t('Nothing waiting');
    const parts: string[] = [];
    if (selectedAvailabilitySlots.length) {
      parts.push(t(selectedAvailabilitySlots.length === 1 ? '{count} availability edit' : '{count} availability edits', { count: selectedAvailabilitySlots.length }));
    }
    if (selectedTimeOffSlots.length) {
      parts.push(t(selectedTimeOffSlots.length === 1 ? '{count} time-off service' : '{count} time-off services', { count: selectedTimeOffSlots.length }));
    }
    return parts.join(' · ');
  }

  function isSlotDirty(key: string) {
    return availabilitySelectedKeySet.has(key) || timeOffSelectedKeySet.has(key);
  }

  function slotTone(slot: CalendarDay['slots'][number]) {
    if (timeOffSelectedKeySet.has(slot.key)) return 'leave';
    if (slot.presentation.card?.tone === 'actual' || slot.presentation.card?.tone === 'live') return 'worked';
    if (slot.presentation.card?.tone === 'planned' || slot.presentation.card?.tone === 'expected') return 'planned';
    if (slot.presentation.card?.tone === 'absence') return 'leave';
    if (slot.presentation.card?.tone === 'conflict' || slot.presentation.card?.tone === 'danger') return 'danger';
    if (slot.presentation.card?.tone === 'warning' || slot.presentation.card?.tone === 'pending') return 'change';
    if (slot.presentation.background === 'available') return 'available';
    if (slot.presentation.background === 'unavailable' || slot.presentation.background === 'conflict') return 'danger';
    return 'neutral';
  }

  function slotLabel(slot: CalendarDay['slots'][number]) {
    if (timeOffSelectedKeySet.has(slot.key)) return t('Time off');
    if (slot.presentation.card) return t(slot.presentation.card.label);
    if (slot.presentation.background === 'available') return t('Available');
    return t(serviceName(slot.serviceKey));
  }

  function slotTitle(slot: CalendarDay['slots'][number]) {
    const service = t(serviceName(slot.serviceKey));
    const label = slotLabel(slot);
    return label === service ? service : `${service} · ${label}`;
  }

  function slotMeta(slot: CalendarDay['slots'][number]) {
    if (slot.presentation.card?.meta) return t(slot.presentation.card.meta);
    if (slot.presentation.background === 'available') return t('Can work');
    return t('Tap ⋯ for options');
  }

  function dayAriaLabel(day: CalendarDay) {
    const date = new Intl.DateTimeFormat(i18n.intlLocale, {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      timeZone: 'UTC'
    }).format(new Date(`${day.date}T12:00:00Z`));
    const services = day.slots.map((slot) => slotTitle(slot)).join('; ');
    return `${date}: ${services}${day.total ? `; ${day.total} worked` : ''}`;
  }

  function workedEntryHours(entry: (typeof monthEntries)[number]) {
    return Math.max(
      0,
      hoursBetweenInstants(entry.clock_in_at, entry.clock_out_at) - Number(entry.break_minutes ?? 0) / 60
    );
  }
</script>

<svelte:head><title>{t('My time')} · restogogo</title></svelte:head>

{#snippet pageActions()}
  <button class="cl-btn is-icon" type="button" onclick={() => changeMonth(-1)} aria-label={t('Previous month')}>&lsaquo;</button>
  <strong class="period-label">{monthLabel(activeMonth, i18n.intlLocale)}</strong>
  <button class="cl-btn is-icon" type="button" onclick={() => changeMonth(1)} aria-label={t('Next month')}>&rsaquo;</button>
  <span class="toolbar-grow"></span>
  {#if hasPendingEdits}
    <span class="pending-copy">{requestCopy()}</span>
    <button class="cl-btn" type="button" disabled={saving} onclick={discardChanges}>{t('Discard')}</button>
    <button class="cl-btn is-primary" type="button" disabled={!canSave} onclick={saveChanges}>{t(saving ? 'Submitting…' : 'Submit')}</button>
  {/if}
{/snippet}

{#if snapshot && employee}
  <WorkspacePage actions={pageActions}>
    <div class="cl-stats employee-stats">
      <div class="cl-stat"><span class="cl-stat__label">{t('Worked')}</span><span class="cl-stat__value">{formatHours(workedHours)}</span></div>
      <div class="cl-stat"><span class="cl-stat__label">{t('Leave remaining')}</span><span class="cl-stat__value has-unit">{leaveBalance.remaining}<small>{t('days')}</small></span></div>
      <div class="cl-stat"><span class="cl-stat__label">{t('Pending')}</span><span class="cl-stat__value has-unit">{leaveBalance.pending}<small>{t('requests')}</small></span></div>
    </div>

    <div class="employee-workspace">
      <FeedbackBanner message={feedback} tone={feedbackTone} />

      <div class="time-layout">
        <section class="time-month" aria-label={t('Monthly calendar for {month}', { month: monthLabel(activeMonth, i18n.intlLocale) })}>
          <div class="weekday-row" aria-hidden="true">
            {#each Array.from({ length: 7 }, (_, index) => new Intl.DateTimeFormat(i18n.intlLocale, { weekday: 'short', timeZone: 'UTC' }).format(new Date(Date.UTC(2026, 0, 5 + index)))) as weekday}<span>{weekday}</span>{/each}
          </div>

          <div class="month-grid">
            {#each monthWeeks as week}
              {#each week as day (day.date)}
                <button
                  type="button"
                  class="month-day"
                  class:is-selected={day.date === selectedDate}
                  class:is-today={day.today}
                  class:is-outside={!day.inMonth}
                  aria-label={dayAriaLabel(day)}
                  onclick={() => selectDate(day.date)}
                >
                  <span class="month-day__number">{day.dayNumber}</span>
                  <span class="month-day__dots">
                    {#each day.slots as slot (slot.key)}
                      <i class={`is-${slotTone(slot)}`} class:is-selected={isSlotDirty(slot.key)} title={slotTitle(slot)}></i>
                    {/each}
                  </span>
                  {#if day.total}<span class="month-day__hours">{day.total}</span>{/if}
                </button>
              {/each}
            {/each}
          </div>
          <div class="calendar-legend" aria-label={t('Calendar legend')}>
            <span><i class="is-available"></i>{t('Available')}</span>
            <span><i class="is-planned"></i>{t('Planned')}</span>
            <span><i class="is-worked"></i>{t('Worked')}</span>
            <span><i class="is-leave"></i>{t('Time off')}</span>
            <span><i class="is-danger"></i>{t('Needs review')}</span>
          </div>
        </section>

        <aside class="time-side-panel" aria-label={t('Selected day')}>
          <section class="day-panel">
            <div class="day-panel__head">
              <div>
                <span class="page-kicker">{t('Selected day')}</span>
                <strong>{selectedDay ? `${dayName(selectedDay.date)} ${dayNumber(selectedDay.date)}` : t('Pick a day')}</strong>
              </div>
              <div class="day-panel__proof">
                <strong>{details.entries.reduce((sum, entry) => sum + workedEntryHours(entry), 0) ? formatHours(details.entries.reduce((sum, entry) => sum + workedEntryHours(entry), 0)) : '0h'}</strong>
                <span>{t('worked')}</span>
              </div>
            </div>

            {#if selectedDay}
              <div class="day-panel__services">
                {#each selectedDay.slots as slot (slot.key)}
                  <div class={`day-service is-${slotTone(slot)}`} class:is-selected={isSlotDirty(slot.key)}>
                    <button
                      type="button"
                      class="day-service__tap"
                      aria-label={`${selectedDay.date}, ${slotTitle(slot)}: ${slotMeta(slot)}`}
                      onclick={() => primaryTap(selectedDay.date, slot.serviceKey)}
                    >
                      <b>{serviceDisplay(slot.serviceKey, snapshot?.services).icon}</b>
                      <span>
                        <strong>{slotLabel(slot)}</strong>
                        <small>{slotMeta(slot)}</small>
                      </span>
                    </button>
                    <button
                      type="button"
                      class="day-service__more"
                      aria-label={t('More options for {service} on {date}', { service: t(serviceName(slot.serviceKey)), date: selectedDay.date })}
                      onclick={() => openSlotDetails(selectedDay.date, slot.serviceKey)}
                    >
                      ⋯
                    </button>
                  </div>
                {/each}
              </div>
            {/if}
          </section>

          <section class="day-list">
        {#each details.shifts as shift (shift.id)}
          <article>
            <div>
              <StatusPill label="Published shift" tone="info" />
              <strong>{t(serviceName(shift.serviceKey))} · {shift.startsAt}–{shift.endsAt}</strong>
              <span>{shift.area} · {shift.jobFunction}</span>
            </div>
            <ActionButton
              label="Details"
              onclick={() => openSlotDetails(selectedDate, shift.serviceKey)}
            />
          </article>
        {/each}

        {#each details.entries as entry (entry.id)}
          {@const corrected = entry.status === 'adjusted' || Boolean(entry.adjusted_at)}
          {@const hours = Math.max(0, hoursBetweenInstants(entry.clock_in_at, entry.clock_out_at) - Number(entry.break_minutes ?? 0) / 60)}
          <article>
            <div>
              <StatusPill
                label={entry.status === 'open' ? 'Working now' : corrected ? 'Corrected' : 'Worked'}
                tone={entry.status === 'open' ? 'success' : corrected ? 'warning' : 'info'}
              />
              <strong>{t(serviceName(entry.service_key))} · {formatHours(hours)}</strong>
              <span>{instantClockLabel(entry.clock_in_at, timezone)}–{instantClockLabel(entry.clock_out_at, timezone) || 'open'} · {entry.break_minutes || 0} min break</span>
              {#if entry.adjustment_reason}<small>Correction: {entry.adjustment_reason}</small>{/if}
              {#if entry.clock_in_photo_status || entry.clock_out_photo_status}
                <small>
                  Badge proof: in {entry.clock_in_photo_status || 'none'} · out {entry.clock_out_photo_status || 'none'}
                </small>
              {/if}
            </div>
          </article>
        {/each}

        {#if availabilityMode === 'weekly_availability'}
          {#each details.availability as slot (`${slot.week_start}-${slot.service_key}`)}
            <article>
              <div>
                <StatusPill
                  label={slot.availability_state === 'available' ? 'Available' : 'Needs update'}
                  tone={slot.availability_state === 'available' ? 'success' : 'warning'}
                />
                <strong>{t(serviceName(slot.service_key))} {t('availability')}</strong>
                {#if slot.note}<span>{slot.note}</span>{/if}
              </div>
              <ActionButton
                label="Details"
                onclick={() => openSlotDetails(selectedDate, slot.service_key)}
              />
            </article>
          {/each}
        {/if}

        {#if !details.availability.length && availabilityMode === 'fixed_schedule'}
          {#each details.recurring as slot (slot.id)}
            <article>
              <div>
                <StatusPill label="Recurring" tone="success" />
                <strong>{t(serviceName(slot.service_key))} · {t('Scheduled')}</strong>
                <span>{t('From your fixed contract schedule')}</span>
              </div>
            </article>
          {/each}
        {/if}

        {#each details.workPatternExceptions as exception (exception.id)}
          <article>
            <div>
              <StatusPill
                label={exception.status === 'approved' ? 'Schedule change' : 'Change pending'}
                tone={exception.status === 'approved' ? 'danger' : 'warning'}
              />
              <strong>{exception.service_key ? t(serviceName(exception.service_key)) : t('Full day')}</strong>
              <span>{exception.start_date}–{exception.end_date} · {exception.reason}</span>
              {#if exception.manager_comment}<small>Manager: {exception.manager_comment}</small>{/if}
            </div>
            <ActionButton
              label="Cancel change"
              tone="danger"
              disabled={saving}
              onclick={() => cancelWorkPatternException(exception.id)}
            />
          </article>
        {/each}

        {#each details.absences as absence (absence.id)}
          <article class="absence">
            <div>
              <StatusPill
                label={absence.status}
                tone={absence.status === 'approved' ? 'absence' : 'warning'}
              />
              <strong>{t(snapshot.absence_types.find((item) => item.id === absence.absence_type_id)?.name || 'Leave')}</strong>
              <span>{absence.start_date}–{absence.end_date}{absence.service_key ? ` · ${absence.service_key}` : ' · Full day'}</span>
              {#if absence.employee_comment}<small>{absence.employee_comment}</small>{/if}
            </div>
            {#if absence.status === 'pending'}
              <ActionButton
                label="Cancel request"
                tone="danger"
                disabled={saving}
                onclick={() => cancelAbsence(absence.id)}
              />
            {:else if absence.status === 'approved'}
              <small>{t('Contact your manager to change approved leave.')}</small>
            {/if}
          </article>
        {/each}

        {#if !details.shifts.length && !details.entries.length && (availabilityMode !== 'weekly_availability' || !details.availability.length) && !details.recurring.length && !details.workPatternExceptions.length && !details.absences.length}
          <p>{t('Nothing recorded for this day.')}</p>
        {/if}
          </section>
        </aside>
      </div>
    </div>

  <EmployeeSlotDialog
    open={slotDetailsOpen}
    truth={dialogTruth}
    policy={availabilityMode}
    {today}
    {timezone}
    availabilityState={dialogTruth?.availability ?? ''}
    isTimeOffSelected={dialogTruth ? timeOffSelectedKeySet.has(dialogTruth.key) : false}
    isChangeSelected={false}
    services={snapshot?.services ?? []}
    absenceTypes={snapshot.absence_types}
    bind:absenceTypeId
    bind:comment
    {saving}
    onclose={() => (slotDetailsOpen = false)}
    onSetAvailability={(state) => dialogTruth && chooseAvailabilityFor(dialogDate, dialogTruth.serviceKey, dialogTruth, state)}
    onRequestTimeOff={toggleDialogTimeOff}
    onCancelAbsence={cancelAbsence}
    onCancelChange={cancelWorkPatternException}
  />

  </WorkspacePage>
{/if}

<style>
  .period-label { min-width: 180px; text-align: center; font-size: var(--rst-fs-body); }
  .pending-copy { color: var(--cl-attention); font-size: var(--rst-fs-control); font-weight: var(--rst-fw-bold); }
  .employee-workspace { display: grid; gap: 16px; }
  .employee-stats { grid-template-columns: repeat(3, minmax(0, 1fr)); }
  .has-unit { display: flex; align-items: baseline; gap: 5px; }
  .has-unit small { color: var(--cl-muted); font-size: var(--rst-fs-caption); font-weight: var(--rst-fw-medium); }

  .time-layout {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(320px, 400px);
    gap: 16px;
    align-items: start;
  }

  .time-month {
    border: 1px solid var(--rst-ui-line);
    border-radius: var(--cl-radius);
    overflow: hidden;
    background: var(--cl-surface);
    box-shadow: none;
  }

  .weekday-row,
  .month-grid {
    display: grid;
    grid-template-columns: repeat(7, minmax(0, 1fr));
  }

  .weekday-row {
    border-bottom: 1px solid var(--rst-ui-divider-soft);
    background: var(--rst-ui-surface-panel-head);
  }

  .weekday-row span {
    padding: 10px 8px;
    color: var(--cl-muted);
    font-size: var(--rst-fs-caption);
    font-weight: var(--rst-fw-display);
    letter-spacing: 0;
    text-align: center;
    text-transform: uppercase;
  }

  .month-day {
    display: grid;
    align-content: start;
    justify-items: center;
    gap: 6px;
    min-height: 68px;
    padding: 10px 6px;
    border: 0;
    border-right: 1px solid var(--rst-ui-divider-soft);
    border-bottom: 1px solid var(--rst-ui-divider-soft);
    color: var(--rst-ui-text);
    background: transparent;
    font: inherit;
    cursor: pointer;
    transition: background-color 0.15s ease;
  }

  .month-day:hover {
    background: var(--rst-ui-surface-field);
  }

  .month-day.is-outside {
    opacity: 0.4;
  }

  .month-day.is-today .month-day__number {
    color: #fff;
    background: var(--rst-ui-action);
  }

  .month-day.is-selected {
    background: var(--cl-accent-wash);
    box-shadow: inset 0 0 0 2px rgba(var(--cl-attention-rgb), 0.25);
  }

  .month-day__number {
    display: grid;
    width: 24px;
    height: 24px;
    place-items: center;
    border-radius: 999px;
    font-size: var(--rst-fs-body);
    font-weight: var(--rst-fw-bold);
  }

  .month-day__dots {
    display: flex;
    gap: 4px;
    min-height: 8px;
  }

  .month-day__dots i {
    width: 7px;
    height: 7px;
    border-radius: 999px;
    background: var(--rst-ui-quiet);
  }

  .month-day__dots i.is-available { background: var(--rst-state-success); }
  .month-day__dots i.is-planned { background: var(--rst-state-info); }
  .month-day__dots i.is-worked { background: var(--rst-green); }
  .month-day__dots i.is-leave { background: var(--rst-state-absence); }
  .month-day__dots i.is-change { background: var(--rst-state-warning); }
  .month-day__dots i.is-danger { background: var(--rst-state-danger); }
  .month-day__dots i.is-selected { box-shadow: 0 0 0 2px rgba(var(--cl-attention-rgb), 0.28); }

  .month-day__hours {
    padding: 1px 6px;
    border-radius: var(--rst-ui-radius-pill);
    color: var(--rst-ui-muted);
    background: var(--rst-state-neutral-bg);
    font-size: var(--rst-fs-micro);
    font-weight: var(--rst-fw-bold);
  }

  .calendar-legend {
    display: flex;
    flex-wrap: wrap;
    gap: 8px 14px;
    padding: 9px 12px;
    border-top: 1px solid var(--rst-ui-divider-soft);
    color: var(--cl-muted);
    font-size: var(--rst-fs-micro);
  }
  .calendar-legend span { display: inline-flex; align-items: center; gap: 5px; }
  .calendar-legend i { width: 7px; height: 7px; border-radius: 50%; background: var(--rst-ui-quiet); }
  .calendar-legend i.is-available { background: var(--rst-state-success); }
  .calendar-legend i.is-planned { background: var(--rst-state-info); }
  .calendar-legend i.is-worked { background: var(--rst-green); }
  .calendar-legend i.is-leave { background: var(--rst-state-absence); }
  .calendar-legend i.is-danger { background: var(--rst-state-danger); }

  .time-side-panel {
    display: grid;
    gap: 14px;
  }

  .day-panel {
    display: grid;
    gap: 12px;
    padding: 18px;
    border: 1px solid var(--cl-line);
    border-radius: var(--cl-radius);
    color: var(--cl-ink);
    background: var(--cl-surface);
    box-shadow: none;
  }

  .day-panel__head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
  }

  .day-panel__head > div {
    display: grid;
    gap: 2px;
  }

  .day-panel__head strong {
    font-size: var(--rst-fs-title);
  }

  .day-panel__proof {
    display: grid;
    justify-items: end;
    gap: 1px;
  }

  .day-panel__proof strong {
    font-size: var(--rst-fs-title-lg);
  }

  .day-panel__proof span {
    color: var(--cl-muted);
    font-size: var(--rst-fs-caption);
    font-weight: var(--rst-fw-bold);
    text-transform: uppercase;
  }

  .day-panel__services {
    display: grid;
    gap: 8px;
  }

  .day-service {
    position: relative;
    border-radius: var(--rst-ui-radius-lg);
    overflow: hidden;
  }

  .day-service__tap {
    display: flex;
    align-items: center;
    gap: 10px;
    width: 100%;
    padding: 11px 34px 11px 12px;
    border: 1px solid var(--cl-line);
    border-radius: var(--rst-ui-radius-lg);
    color: var(--cl-ink);
    text-align: left;
    background: var(--cl-surface-muted);
    font: inherit;
    cursor: pointer;
  }

  .day-service__tap b {
    display: grid;
    flex: 0 0 auto;
    width: 24px;
    height: 24px;
    place-items: center;
    border-radius: 999px;
    background: var(--cl-accent-wash);
    font-size: var(--rst-fs-control);
  }

  .day-service__tap span {
    display: grid;
    min-width: 0;
    gap: 1px;
  }

  .day-service__tap strong {
    overflow: hidden;
    font-size: var(--rst-fs-control);
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .day-service__tap small {
    overflow: hidden;
    color: var(--cl-muted);
    font-size: var(--rst-fs-label);
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .day-service__more {
    position: absolute;
    top: 6px;
    right: 6px;
    width: 24px;
    height: 24px;
    display: grid;
    place-items: center;
    border: 0;
    border-radius: 999px;
    color: var(--cl-muted);
    background: transparent;
    font-size: var(--rst-fs-body-lg);
    line-height: 1;
    cursor: pointer;
  }

  .day-service.is-available .day-service__tap { background: var(--cl-ok-wash); }
  .day-service.is-planned .day-service__tap { background: var(--cl-info-wash); }
  .day-service.is-worked .day-service__tap { background: var(--cl-ok-wash); }
  .day-service.is-leave .day-service__tap { background: var(--rst-state-absence-bg); }
  .day-service.is-change .day-service__tap { background: var(--cl-attention-wash); }
  .day-service.is-danger .day-service__tap { background: var(--cl-problem-wash); }
  .day-service.is-selected .day-service__tap { box-shadow: inset 0 0 0 2px rgba(var(--cl-attention-rgb), .28); }

  .day-list {
    display: grid;
    padding: 0;
    border: 1px solid var(--rst-ui-line);
    border-radius: var(--cl-radius);
    overflow: hidden;
    background: var(--cl-surface);
    box-shadow: none;
  }

  .day-list article {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 11px 14px;
    border-bottom: 1px solid var(--rst-ui-divider-soft);
  }
  .day-list article:last-child { border-bottom: 0; }
  .day-list article > div { display: grid; justify-items: start; gap: 4px; }
  .day-list span, .day-list small, .day-list p { color: var(--rst-ui-muted); font-size: var(--rst-fs-control); }
  .day-list p { margin: 0; padding: 18px 14px; }

  @media (max-width: 1180px) {
    .time-layout {
      grid-template-columns: 1fr;
    }
  }

  @media (max-width: 520px) {
    .employee-stats {
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 6px;
    }
    .employee-stats .cl-stat {
      min-width: 0;
      gap: 3px;
      padding: 10px 7px 10px 10px;
    }
    .employee-stats .cl-stat__label {
      overflow: hidden;
      font-size: var(--rst-fs-micro);
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .employee-stats .cl-stat__value {
      font-size: var(--rst-fs-title);
    }
    .has-unit {
      display: grid;
      gap: 0;
    }
    .has-unit small {
      font-size: var(--rst-fs-micro);
    }
    .calendar-legend {
      gap: 6px 10px;
    }
  }
</style>
