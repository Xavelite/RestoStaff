<script lang="ts">
  import { goto } from '$app/navigation';
  import { page } from '$app/state';
  import {
    saveAbsence,
    saveEmployeeAvailability,
    saveWorkPatternException
  } from '$lib/api/mutations';
  import { leaveBalanceForEmployee } from '$lib/absence/leave-balance';
  import {
    addDays,
    addMonths,
    formatHours,
    hoursBetweenInstants,
    mondayFor,
    monthLabel,
    monthStart,
    serviceLabel,
    todayInTimezone
  } from '$lib/calendar/date';
  import type { CalendarDay } from '$lib/calendar/calendar-model';
  import { instantClockLabel, resolveWorkspaceServiceSlot, type ServiceSlotTruth } from '$lib/calendar/service-slot';
  import ActionButton from '$lib/components/ActionButton.svelte';
  import FeedbackBanner from '$lib/components/FeedbackBanner.svelte';
  import StatusPill from '$lib/components/StatusPill.svelte';
  import EmployeeRequestDetailsDialog from '$lib/employee/EmployeeRequestDetailsDialog.svelte';
  import EmployeeSlotDrawer from '$lib/employee/EmployeeSlotDrawer.svelte';
  import {
    employeeSlotActionReason,
    defaultEmployeeTimeOffType,
    groupTimeOffRanges,
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
    employeeDayDetails,
    employeeForId,
    employeeMonth,
    type AvailabilityDraft,
    type AvailabilityMode,
  } from '$lib/employee/employee-model';
  import { workRegime } from '$lib/domain/operations';
  import { workspace } from '$lib/workspace/workspace.svelte';

  const snapshot = $derived(workspace.employeeOperations);
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
  let selectedChangeSlots = $state<EmployeeSlotSelection[]>([]);
  let availabilityOverrides = $state<AvailabilityDraft[]>([]);
  let absenceTypeId = $state('');
  let comment = $state('');
  let saving = $state(false);
  let feedback = $state('');
  let feedbackTone = $state<'info' | 'success' | 'warning' | 'danger'>('info');
  let actionDetailsOpen = $state(false);
  let slotDetailsOpen = $state(false);
  let drawerDate = $state('');
  let drawerService = $state<'lunch' | 'evening' | ''>('');

  const activeMonth = $derived(month || monthStart(today));
  const visibleFrom = $derived(mondayFor(activeMonth));
  const visibleTo = $derived(addDays(visibleFrom, 41));
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
          serviceDrafts
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
  const drawerTruth = $derived<ServiceSlotTruth | null>(
    snapshot && employeeId && drawerDate && drawerService
      ? resolveWorkspaceServiceSlot({
          snapshot,
          employeeId,
          date: drawerDate,
          serviceKey: drawerService,
          today,
          availability: availabilityOverrides.find(
            (item) => item.date === drawerDate && item.serviceKey === drawerService
          )?.state
        })
      : null
  );
  const drawerPlanningPublished = $derived(
    drawerDate
      ? snapshot?.work_weeks.find((week) => week.week_start === mondayFor(drawerDate))
          ?.planning_status === 'published'
      : false
  );
  const timeOffRanges = $derived(groupTimeOffRanges(selectedTimeOffSlots));
  const changeRanges = $derived(groupTimeOffRanges(selectedChangeSlots));
  const defaultTimeOffType = $derived(
    snapshot ? defaultEmployeeTimeOffType(snapshot.absence_types) : null
  );
  const availabilityChanged = $derived(availabilityOverrides.length > 0);
  const hasPendingEdits = $derived(
    availabilityChanged || selectedTimeOffSlots.length > 0 || selectedChangeSlots.length > 0
  );
  const canSave = $derived(
    !saving &&
      ((availabilityMode === 'weekly_availability' && availabilityChanged) ||
        selectedTimeOffSlots.length > 0 ||
        selectedChangeSlots.length > 0)
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
  const changeSelectedKeySet = $derived(new Set(selectedChangeSlots.map((slot) => slot.key)));
  const detailsMode = $derived<EmployeeSelfServiceMode>(
    selectedTimeOffSlots.length > 0 ? 'time_off' : 'availability'
  );
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

  $effect(() => {
    if (selectedDate) return;
    const requested = page.url.searchParams.get('date');
    const initial = requested && /^\d{4}-\d{2}-\d{2}$/.test(requested) ? requested : today;
    selectedDate = initial;
    month = monthStart(initial);
    const service = page.url.searchParams.get('service');
    if (service === 'lunch' || service === 'evening') {
      selectedTimeOffSlots = [
        { key: `${employeeId}|${initial}|${service}`, date: initial, serviceKey: service }
      ];
    }
  });

  function selectDate(date: string) {
    selectedDate = date;
    month = monthStart(date);
    feedback = '';
  }

  function changeMonth(amount: number) {
    if (hasPendingEdits) {
      feedback = 'Submit or undo your pending changes before changing month.';
      feedbackTone = 'warning';
      return;
    }
    month = addMonths(activeMonth, amount);
    selectedDate = month;
    clearAllSelections();
  }

  function syncAvailabilityHighlight() {
    selectedAvailabilitySlots = availabilityOverrides.map((item) => ({
      key: `${employeeId}|${item.date}|${item.serviceKey}`,
      date: item.date,
      serviceKey: item.serviceKey
    }));
  }

  function blockReasonFor(truth: ServiceSlotTruth, date: string, mode: EmployeeSelfServiceMode): string {
    const planningPublished =
      snapshot?.work_weeks.find((week) => week.week_start === mondayFor(date))?.planning_status ===
      'published';
    const reason = employeeSlotActionReason({
      truth,
      policy: availabilityMode,
      mode,
      today,
      planningPublished
    });
    if (reason) {
      feedback = reason;
      feedbackTone = 'warning';
    }
    return reason;
  }

  // Shared by the direct-tap fast path and the slot Drawer's buttons, so both
  // entry points always agree on what this service allows right now.
  function toggleAvailabilityFor(date: string, serviceKey: 'lunch' | 'evening', truth: ServiceSlotTruth) {
    if (blockReasonFor(truth, date, 'availability')) return;
    availabilityOverrides = toggleAvailabilityOverride(
      availabilityOverrides,
      { date, serviceKey },
      truth.availability
    );
    syncAvailabilityHighlight();
    feedback = '';
  }

  function requestTimeOffFor(date: string, serviceKey: 'lunch' | 'evening', truth: ServiceSlotTruth) {
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
    selectedChangeSlots = selectedChangeSlots.filter((item) => item.key !== key);
    selectedTimeOffSlots = toggleEmployeeSlotSelection(selectedTimeOffSlots, selection);
    feedback = '';
  }

  function requestChangeFor(date: string, serviceKey: 'lunch' | 'evening', truth: ServiceSlotTruth) {
    if (blockReasonFor(truth, date, 'availability')) return;
    const key = `${employeeId}|${date}|${serviceKey}`;
    const selection = { key, date, serviceKey };
    selectedTimeOffSlots = selectedTimeOffSlots.filter((item) => item.key !== key);
    selectedChangeSlots = toggleEmployeeSlotSelection(selectedChangeSlots, selection);
    feedback = '';
  }

  // One tap, no page-level mode: a pending request on this slot cancels it, an
  // in-progress time-off/change basket keeps extending itself, otherwise a
  // weekly-availability slot toggles instantly and everything else opens the
  // Drawer, which is also where every action lives explicitly.
  function primaryTap(date: string, serviceKey: 'lunch' | 'evening') {
    if (!snapshot) return;
    const future = date >= today;
    const truth = resolveWorkspaceServiceSlot({ snapshot, employeeId, date, serviceKey, today });

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
    if (selectedChangeSlots.length > 0) {
      requestChangeFor(date, serviceKey, truth);
      return;
    }
    if (availabilityMode === 'weekly_availability') {
      toggleAvailabilityFor(date, serviceKey, truth);
      return;
    }
    openSlotDetails(date, serviceKey);
  }

  function openSlotDetails(date: string, serviceKey: 'lunch' | 'evening') {
    selectedDate = date;
    month = monthStart(date);
    drawerDate = date;
    drawerService = serviceKey;
    slotDetailsOpen = true;
  }

  function clearAvailabilitySelection() {
    selectedAvailabilitySlots = [];
    availabilityOverrides = [];
  }

  function clearTimeOffSelection() {
    selectedTimeOffSlots = [];
    selectedChangeSlots = [];
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

    // Each bucket submits by its own kind, independent of what triggered it,
    // so a pending time-off draft is never stranded or wiped by another edit.
    if (availabilityMode === 'weekly_availability' && availabilityOverrides.length > 0) {
      const weeks = selectionWeekStarts(selectedAvailabilitySlots);
      const rows = weeks.flatMap((weekStart) =>
        availabilityForWeek(snapshot, employeeId, weekStart).map((slot) => ({
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
            availability_state: slot.state
          }))
        });
        messages.push('Availability saved');
      } catch (err) {
        hasError = true;
        messages.push(err instanceof Error ? err.message : 'Availability save failed');
      }
    }

    if (selectedChangeSlots.length > 0) {
      let ok = 0;
      for (const range of changeRanges) {
        try {
          await saveWorkPatternException({
            restaurantId: workspace.activeId,
            employeeId,
            action: 'create_by_employee',
            payload: {
              start_date: range.startDate,
              end_date: range.endDate,
              service_key: range.serviceKey || null,
              reason: comment.trim() || 'Availability change requested by employee'
            }
          });
          ok += 1;
        } catch (err) {
          hasError = true;
          messages.push(err instanceof Error ? err.message : 'Change submission failed');
        }
      }
      if (ok) messages.push(ok === 1 ? 'Availability change submitted' : `Availability changes submitted (${ok})`);
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
    if (hasError) {
      // Keep every draft so the employee can retry the part that failed.
      feedback = messages.join(' · ');
      feedbackTone = 'danger';
    } else {
      clearAllSelections();
      try { await workspace.reloadEmployeeOperations(); } catch { /* non-critical */ }
      feedback = messages.join(' · ');
      feedbackTone = 'success';
    }
    saving = false;
  }

  function discardChanges() {
    clearAllSelections();
    feedback = '';
  }

  async function cancelAbsence(absenceId: string) {
    if (!workspace.activeId || !employeeId || saving) return;
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
      feedback = 'Time off cancelled.';
      feedbackTone = 'success';
    } catch (error) {
      feedback = error instanceof Error ? error.message : String(error);
      feedbackTone = 'danger';
    } finally {
      saving = false;
    }
  }

  async function cancelWorkPatternException(workPatternExceptionId: string) {
    if (!workspace.activeId || !employeeId || saving) return;
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
      feedback = 'Availability change cancelled.';
      feedbackTone = 'success';
    } catch (error) {
      feedback = error instanceof Error ? error.message : String(error);
      feedbackTone = 'danger';
    } finally {
      saving = false;
    }
  }

  function dayName(date: string) {
    return new Intl.DateTimeFormat('en-GB', { weekday: 'short' }).format(new Date(`${date}T12:00:00Z`));
  }

  function dayNumber(date: string) {
    return new Intl.DateTimeFormat('en-GB', { day: '2-digit' }).format(new Date(`${date}T12:00:00Z`));
  }

  function serviceIcon(serviceKey: 'lunch' | 'evening') {
    return serviceKey === 'lunch' ? '☀' : '☾';
  }

  function requestCopy() {
    if (!hasPendingEdits) return 'Nothing waiting';
    const parts: string[] = [];
    if (selectedAvailabilitySlots.length) {
      parts.push(`${selectedAvailabilitySlots.length} availability change${selectedAvailabilitySlots.length > 1 ? 's' : ''}`);
    }
    if (selectedTimeOffSlots.length) {
      parts.push(`${selectedTimeOffSlots.length} time-off service${selectedTimeOffSlots.length > 1 ? 's' : ''}`);
    }
    if (selectedChangeSlots.length) {
      parts.push(`${selectedChangeSlots.length} change request${selectedChangeSlots.length > 1 ? 's' : ''}`);
    }
    return parts.join(' · ');
  }

  function isSlotDirty(key: string) {
    return availabilitySelectedKeySet.has(key) || timeOffSelectedKeySet.has(key) || changeSelectedKeySet.has(key);
  }

  function slotTone(slot: CalendarDay['slots'][number]) {
    if (timeOffSelectedKeySet.has(slot.key)) return 'leave';
    if (changeSelectedKeySet.has(slot.key)) return 'change';
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
    if (timeOffSelectedKeySet.has(slot.key)) return 'Time off';
    if (changeSelectedKeySet.has(slot.key)) return 'Change';
    if (slot.presentation.card) return slot.presentation.card.label;
    if (slot.presentation.background === 'available') return 'Available';
    return serviceLabel(slot.serviceKey);
  }

  function slotMeta(slot: CalendarDay['slots'][number]) {
    if (slot.presentation.card?.meta) return slot.presentation.card.meta;
    if (slot.presentation.background === 'available') return 'Can work';
    return 'Tap ⋯ for options';
  }

  function workedEntryHours(entry: (typeof monthEntries)[number]) {
    return Math.max(
      0,
      hoursBetweenInstants(entry.clock_in_at, entry.clock_out_at) - Number(entry.break_minutes ?? 0) / 60
    );
  }
</script>

<svelte:head><title>My time · restogogo</title></svelte:head>

{#if snapshot && employee}
  <section class="page-shell employee-page time-page">
    <header class="page-hero time-hero">
      <div class="page-hero__copy">
        <span class="page-kicker">My time</span>
        <h1>{hasPendingEdits ? 'Your month has changes waiting.' : `${formatHours(workedHours)} recorded this month.`}</h1>
        <p>See badge proof, leave balance, published shifts and availability in one monthly rhythm.</p>
        <div class="page-nav">
          <button type="button" onclick={() => changeMonth(-1)} aria-label="Previous month">←</button>
          <strong>{monthLabel(activeMonth)}</strong>
          <button type="button" onclick={() => changeMonth(1)} aria-label="Next month">→</button>
        </div>
      </div>
      <aside class="glass-card glass-card--row time-dial-card" aria-label="Leave balance">
        <div class:has-issues={leaveBalancePercent < 30} class="readiness-dial" style={`--ready:${leaveBalancePercent}%`}>
          <strong>{leaveBalance.remaining}</strong>
          <span>days left</span>
        </div>
        <dl>
          <div><dt>Worked</dt><dd>{formatHours(workedHours)}</dd></div>
          <div><dt>Pending</dt><dd>{leaveBalance.pending}</dd></div>
        </dl>
      </aside>
    </header>

    <div class="page-body has-tray">
      <FeedbackBanner message={feedback} tone={feedbackTone} />

      <div class="time-layout">
        <section class="time-month" aria-label={`Monthly calendar for ${monthLabel(activeMonth)}`}>
          <div class="weekday-row" aria-hidden="true">
            <span>Mon</span><span>Tue</span><span>Wed</span><span>Thu</span><span>Fri</span><span>Sat</span><span>Sun</span>
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
                  onclick={() => selectDate(day.date)}
                >
                  <span class="month-day__number">{day.dayNumber}</span>
                  <span class="month-day__dots">
                    {#each day.slots as slot (slot.key)}
                      <i class={`is-${slotTone(slot)}`} class:is-selected={isSlotDirty(slot.key)} title={`${serviceLabel(slot.serviceKey)} · ${slotLabel(slot)}`}></i>
                    {/each}
                  </span>
                  {#if day.total}<span class="month-day__hours">{day.total}</span>{/if}
                </button>
              {/each}
            {/each}
          </div>
        </section>

        <aside class="time-side-panel" aria-label="Selected day">
          <section class="day-panel">
            <div class="day-panel__head">
              <div>
                <span class="page-kicker">Selected day</span>
                <strong>{selectedDay ? `${dayName(selectedDay.date)} ${dayNumber(selectedDay.date)}` : 'Pick a day'}</strong>
              </div>
              <div class="day-panel__proof">
                <strong>{details.entries.reduce((sum, entry) => sum + workedEntryHours(entry), 0) ? formatHours(details.entries.reduce((sum, entry) => sum + workedEntryHours(entry), 0)) : '0h'}</strong>
                <span>worked</span>
              </div>
            </div>

            {#if selectedDay}
              <div class="day-panel__services">
                {#each selectedDay.slots as slot (slot.key)}
                  <div class={`day-service is-${slotTone(slot)}`} class:is-selected={isSlotDirty(slot.key)}>
                    <button type="button" class="day-service__tap" onclick={() => primaryTap(selectedDay.date, slot.serviceKey)}>
                      <b>{serviceIcon(slot.serviceKey)}</b>
                      <span>
                        <strong>{slotLabel(slot)}</strong>
                        <small>{slotMeta(slot)}</small>
                      </span>
                    </button>
                    <button
                      type="button"
                      class="day-service__more"
                      aria-label={`More options for ${serviceLabel(slot.serviceKey)}`}
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
              <strong>{serviceLabel(shift.serviceKey)} · {shift.startsAt}–{shift.endsAt}</strong>
              <span>{shift.area} · {shift.jobFunction}</span>
            </div>
            <ActionButton
              label="Open week"
              onclick={() => goto(`/shifts?week=${mondayFor(selectedDate)}`)}
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
              <strong>{serviceLabel(entry.service_key)} · {formatHours(hours)}</strong>
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

        {#each details.availability as slot (`${slot.week_start}-${slot.service_key}`)}
          <article>
            <div>
              <StatusPill
                label={slot.availability_state}
                tone={slot.availability_state === 'unavailable' ? 'warning' : 'success'}
              />
              <strong>{serviceLabel(slot.service_key)} availability</strong>
              {#if slot.note}<span>{slot.note}</span>{/if}
            </div>
            <ActionButton
              label="Edit week"
              onclick={() => goto(`/shifts?week=${mondayFor(selectedDate)}`)}
            />
          </article>
        {/each}

        {#if !details.availability.length && availabilityMode === 'fixed_schedule'}
          {#each details.recurring as slot (slot.id)}
            <article>
              <div>
                <StatusPill label="Recurring" tone="success" />
                <strong>{serviceLabel(slot.service_key)} · Scheduled</strong>
                <span>From your fixed contract schedule</span>
              </div>
            </article>
          {/each}
        {/if}

        {#each details.workPatternExceptions as exception (exception.id)}
          <article>
            <div>
              <StatusPill
                label={exception.status === 'approved' ? 'Availability change' : 'Change pending'}
                tone={exception.status === 'approved' ? 'danger' : 'warning'}
              />
              <strong>{exception.service_key ? serviceLabel(exception.service_key) : 'Full day'}</strong>
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
              <strong>{snapshot.absence_types.find((item) => item.id === absence.absence_type_id)?.name || 'Leave'}</strong>
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
              <small>Contact your manager to change approved leave.</small>
            {/if}
          </article>
        {/each}

        {#if !details.shifts.length && !details.entries.length && !details.availability.length && !details.recurring.length && !details.workPatternExceptions.length && !details.absences.length}
          <p>Nothing recorded for this day.</p>
        {/if}
          </section>
        </aside>
      </div>
    </div>

    {#if hasPendingEdits}
      <div class="request-tray" role="status">
        <span>{requestCopy()}</span>
        <div>
          <ActionButton label="Details" onclick={() => (actionDetailsOpen = true)} />
          <ActionButton label="Undo" disabled={saving} onclick={discardChanges} />
          <ActionButton
            label={saving ? 'Submitting…' : 'Submit'}
            tone="primary"
            disabled={!canSave}
            onclick={saveChanges}
          />
        </div>
      </div>
    {/if}

  <EmployeeSlotDrawer
    open={slotDetailsOpen}
    truth={drawerTruth}
    policy={availabilityMode}
    {today}
    {timezone}
    planningPublished={drawerPlanningPublished}
    availabilityState={drawerTruth?.availability ?? ''}
    isTimeOffSelected={drawerTruth ? timeOffSelectedKeySet.has(drawerTruth.key) : false}
    isChangeSelected={drawerTruth ? changeSelectedKeySet.has(drawerTruth.key) : false}
    {saving}
    onclose={() => (slotDetailsOpen = false)}
    onToggleAvailability={() => drawerTruth && toggleAvailabilityFor(drawerDate, drawerTruth.serviceKey, drawerTruth)}
    onRequestTimeOff={() => drawerTruth && requestTimeOffFor(drawerDate, drawerTruth.serviceKey, drawerTruth)}
    onRequestChange={() => drawerTruth && requestChangeFor(drawerDate, drawerTruth.serviceKey, drawerTruth)}
    onCancelAbsence={cancelAbsence}
    onCancelChange={cancelWorkPatternException}
  />

  <EmployeeRequestDetailsDialog
    open={actionDetailsOpen}
    mode={detailsMode}
    description="Optional details. The normal flow uses your restaurant's default holiday type."
    absenceTypes={snapshot.absence_types}
    bind:absenceTypeId
    bind:comment
    onclose={() => (actionDetailsOpen = false)}
  />
  </section>
{/if}

<style>
  .time-hero {
    --hero-tint: rgba(84, 121, 190, 0.3);
    min-height: 240px;
  }

  .time-hero::after {
    background: linear-gradient(90deg, var(--rst-state-info), var(--rst-ui-action), var(--rst-gold));
  }

  .time-dial-card .readiness-dial {
    width: clamp(96px, 9vw, 116px);
    flex: 0 0 auto;
  }

  .time-dial-card dl {
    display: grid;
    gap: 8px;
    margin: 0;
  }

  .time-dial-card dl div {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 14px;
    padding: 6px 0;
    border-bottom: 1px solid rgba(255, 255, 255, 0.16);
  }

  .time-dial-card dt {
    color: rgba(255, 250, 242, 0.64);
    font-size: 10px;
    font-weight: var(--rst-fw-display);
    text-transform: uppercase;
  }

  .time-dial-card dd {
    margin: 0;
    color: #fff;
    font-size: 17px;
    font-weight: var(--rst-fw-display);
  }

  .time-layout {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(320px, 400px);
    gap: 16px;
    align-items: start;
  }

  .time-month {
    border: 1px solid var(--rst-ui-line);
    border-radius: var(--rst-ui-radius-2xl);
    overflow: hidden;
    background: #fff;
    box-shadow: 0 2px 4px rgba(31, 22, 15, 0.05), 0 14px 30px rgba(31, 22, 15, 0.08);
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
    color: var(--rst-ui-action);
    font-size: 10px;
    font-weight: var(--rst-fw-display);
    letter-spacing: 0.1em;
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
    background: rgba(var(--rst-ui-action-rgb), 0.1);
    box-shadow: inset 0 0 0 2px rgba(240, 100, 35, 0.4);
  }

  .month-day__number {
    display: grid;
    width: 24px;
    height: 24px;
    place-items: center;
    border-radius: 999px;
    font-size: 13px;
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
  .month-day__dots i.is-selected { box-shadow: 0 0 0 2px rgba(240, 100, 35, 0.35); }

  .month-day__hours {
    padding: 1px 6px;
    border-radius: var(--rst-ui-radius-pill);
    color: var(--rst-ui-muted);
    background: var(--rst-state-neutral-bg);
    font-size: 9px;
    font-weight: var(--rst-fw-bold);
  }

  .time-side-panel {
    display: grid;
    gap: 14px;
  }

  .day-panel {
    display: grid;
    gap: 12px;
    padding: 18px;
    border-radius: var(--rst-ui-radius-2xl);
    color: #fffaf2;
    background:
      radial-gradient(circle at 100% 0%, rgba(74, 112, 190, 0.28), transparent 34%),
      linear-gradient(145deg, #101a28, #13243a);
    box-shadow: var(--rst-ui-shadow-card);
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
    font-size: 18px;
  }

  .day-panel__proof {
    display: grid;
    justify-items: end;
    gap: 1px;
  }

  .day-panel__proof strong {
    font-size: 20px;
  }

  .day-panel__proof span {
    color: rgba(255, 250, 242, 0.6);
    font-size: 10px;
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
    border: 1px solid rgba(255, 255, 255, 0.14);
    border-radius: var(--rst-ui-radius-lg);
    color: #fffaf2;
    text-align: left;
    background: rgba(255, 255, 255, 0.08);
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
    background: rgba(255, 255, 255, 0.12);
    font-size: 12px;
  }

  .day-service__tap span {
    display: grid;
    min-width: 0;
    gap: 1px;
  }

  .day-service__tap strong {
    overflow: hidden;
    font-size: 12px;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .day-service__tap small {
    overflow: hidden;
    color: rgba(255, 250, 242, 0.6);
    font-size: 11px;
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
    color: rgba(255, 250, 242, 0.6);
    background: transparent;
    font-size: 14px;
    line-height: 1;
    cursor: pointer;
  }

  .day-service.is-available .day-service__tap { background: rgba(51, 170, 107, 0.28); }
  .day-service.is-planned .day-service__tap { background: rgba(76, 118, 179, 0.28); }
  .day-service.is-worked .day-service__tap { background: rgba(16, 185, 129, 0.28); }
  .day-service.is-leave .day-service__tap { background: rgba(135, 92, 198, 0.3); }
  .day-service.is-change .day-service__tap { background: rgba(234, 179, 8, 0.26); }
  .day-service.is-danger .day-service__tap { background: rgba(239, 68, 68, 0.26); }
  .day-service.is-selected .day-service__tap { box-shadow: 0 0 0 2px rgba(240, 100, 35, 0.5); }

  .day-list {
    display: grid;
    padding: 0;
    border: 1px solid var(--rst-ui-line);
    border-radius: var(--rst-ui-radius-2xl);
    overflow: hidden;
    background: #fff;
    box-shadow: 0 2px 4px rgba(31, 22, 15, 0.05), 0 14px 30px rgba(31, 22, 15, 0.07);
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
  .day-list span, .day-list small, .day-list p { color: var(--rst-ui-muted); font-size: 12px; }
  .day-list p { margin: 0; padding: 18px 14px; }

  @media (max-width: 1180px) {
    .time-layout {
      grid-template-columns: 1fr;
    }
  }
</style>
