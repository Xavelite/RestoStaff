<script lang="ts">
  import { onMount } from 'svelte';
  import { page } from '$app/state';
  import {
    saveAbsence,
    saveEmployeeAvailability,
    saveWorkPatternException
  } from '$lib/api/mutations';
  import {
    activeServiceKeys,
    addDays,
    formatHours,
    localDateTimeParts,
    mondayFor,
    serviceDisplay,
    serviceLabel,
    weekLabel
  } from '$lib/calendar/date';
  import FeedbackBanner from '$lib/components/FeedbackBanner.svelte';
  import WorkspacePage from '$lib/workspace-ui/WorkspacePage.svelte';
  import EmployeeSlotDialog from '$lib/employee/EmployeeSlotDialog.svelte';
  import {
    employeeSlotActionReason,
    defaultEmployeeTimeOffType,
    availabilityChanges,
    groupTimeOffRanges,
    removeEmployeeSlotSelection,
    toggleEmployeeSlotSelection,
    toggleSimpleAvailability,
    type EmployeeSelfServiceMode,
    type EmployeeSlotSelection
  } from '$lib/employee/employee-self-service';
  import {
    availabilityForWeek,
    availabilitySubmissionStatus,
    buildEmployeeWeek,
    employeeForId,
    nextEmployeeService,
    publishedShiftsForWeek,
    type AvailabilityDraft,
    type AvailabilityMode,
    type EmployeeWeekSlot
  } from '$lib/employee/employee-model';
  import { workRegime } from '$lib/domain/operations';
  import { friendlyError } from '$lib/api/error-messages';
  import { workspaceRealtime } from '$lib/realtime/workspace-realtime.svelte';
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
  let currentInstant = $state(new Date());
  const localNow = $derived(localDateTimeParts(currentInstant, timezone));
  const today = $derived(localNow.date);
  $effect(() => {
    const timer = setInterval(() => (currentInstant = new Date()), 60_000);
    return () => clearInterval(timer);
  });
  let weekStart = $state('');
  let lastWeekParam = $state<string | null>(null);
  let selectedKey = $state('');
  let selectedAvailabilitySlots = $state<EmployeeSlotSelection[]>([]);
  let selectedTimeOffSlots = $state<EmployeeSlotSelection[]>([]);
  let absenceTypeId = $state('');
  let actionComment = $state('');
  let availability = $state<AvailabilityDraft[]>([]);
  let baseline = $state<AvailabilityDraft[] | null>(null);
  let loadedKey = $state('');
  let saving = $state(false);
  let feedback = $state('');
  let feedbackTone = $state<'info' | 'success' | 'warning' | 'danger'>('info');
  let slotDetailsOpen = $state(false);

  const activeWeek = $derived(weekStart || mondayFor(today));
  $effect(() => {
    if (workspace.activeId && employeeId && activeWeek) {
      void workspace
        .loadEmployeeOperations(activeWeek, addDays(activeWeek, 6), true)
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
  const shifts = $derived(
    snapshot && employeeId ? publishedShiftsForWeek(snapshot, employeeId, activeWeek) : []
  );
  const submission = $derived(
    snapshot && employeeId
      ? availabilitySubmissionStatus(snapshot, employeeId, activeWeek)
      : 'not submitted'
  );
  const grid = $derived(
    snapshot && employeeId
      ? buildEmployeeWeek({
          snapshot,
          employeeId,
          weekStart: activeWeek,
          today,
          availability,
          availabilityMode
        })
      : { days: [], slotsByKey: new Map<string, EmployeeWeekSlot>() }
  );
  const slots = $derived([...grid.slotsByKey.values()]);
  const selectedSlot = $derived(grid.slotsByKey.get(selectedKey) ?? null);
  const timeOffRanges = $derived(
    groupTimeOffRanges(selectedTimeOffSlots, activeServiceKeys(snapshot?.services))
  );

  function serviceName(serviceKey: string): string {
    return serviceLabel(serviceKey, snapshot?.services);
  }
  const defaultTimeOffType = $derived(
    snapshot ? defaultEmployeeTimeOffType(snapshot.absence_types) : null
  );
  const dirty = $derived(
    baseline !== null && JSON.stringify(availability) !== JSON.stringify(baseline)
  );
  const hasPendingEdits = $derived(dirty || selectedTimeOffSlots.length > 0);
  const canSave = $derived(
    !saving &&
      ((availabilityMode === 'weekly_availability' && dirty) ||
        selectedTimeOffSlots.length > 0)
  );
  const availabilitySelectedKeySet = $derived(new Set(selectedAvailabilitySlots.map((slot) => slot.key)));
  const timeOffSelectedKeySet = $derived(new Set(selectedTimeOffSlots.map((slot) => slot.key)));
  const plannedSlots = $derived(slots.filter((slot) => slot.shift));
  const pendingRequestSlots = $derived(
    slots.filter(
      (slot) =>
        slot.absence === 'pending' ||
        slot.workPatternException === 'pending' ||
        timeOffSelectedKeySet.has(slot.key)
    )
  );
  const nextService = $derived(nextEmployeeService(plannedSlots, localNow));
  const weekGlanceSummary = $derived(
    availabilityMode === 'weekly_availability'
      ? { label: 'Availability', value: submission }
      : availabilityMode === 'fixed_schedule'
        ? {
            label: t('Fixed schedule'),
            value: pendingRequestSlots.length
              ? t(pendingRequestSlots.length === 1 ? '{count} request' : '{count} requests', { count: pendingRequestSlots.length })
              : t('Manager planned')
          }
        : {
            label: t('Schedule'),
            value: pendingRequestSlots.length
              ? t(pendingRequestSlots.length === 1 ? '{count} request' : '{count} requests', { count: pendingRequestSlots.length })
              : t('Manager planned')
          }
  );
  // Follow the ?week= param on every navigation, not just first mount: a deep
  // link that arrives while the page is already open must still move the week.
  // We only react when the param itself changes so manual week stepping isn't
  // stomped back by this effect.
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
    if (!snapshot || !employeeId || !weekStart) return;
    const key = `${weekStart}|${snapshot.employee_availability_slots.map((row) => row.updated_at).join()}`;
    if (key === loadedKey) return;
    const loadedAvailability = availabilityForWeek(snapshot, employeeId, activeWeek);
    availability = loadedAvailability;
    baseline = loadedAvailability.map((slot) => ({ ...slot }));
    loadedKey = key;
    selectedKey = '';
    selectedAvailabilitySlots = [];
    selectedTimeOffSlots = [];
    slotDetailsOpen = false;
  });

  function changeWeek(amount: number) {
    void unsavedChanges.runOrRequest(() => {
      weekStart = addDays(activeWeek, amount * 7);
      feedback = '';
    });
  }


  function goToCurrentWeek() {
    void unsavedChanges.runOrRequest(() => {
      weekStart = mondayFor(today);
      feedback = '';
    });
  }

  function setAvailability(slot: EmployeeWeekSlot, state: AvailabilityDraft['state']) {
    availability = availability.map((item) =>
      item.date === slot.date && item.serviceKey === slot.serviceKey
        ? { ...item, state }
        : item
    );
    selectedAvailabilitySlots = availabilityChanges(
      baseline ?? [],
      availability,
      employeeId
    );
  }

  function blockReasonFor(slot: EmployeeWeekSlot, mode: EmployeeSelfServiceMode): string {
    if (mode === 'availability' && !activeServiceKeySet.has(slot.serviceKey)) {
      const reason = t('This service is archived.');
      feedback = reason;
      feedbackTone = 'warning';
      return reason;
    }
    const reason = employeeSlotActionReason({
      truth: slot.truth,
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

  // Shared by the direct-tap fast path and the slot dialog, so both entry
  // points always agree on what is possible.
  function toggleAvailabilityFor(slot: EmployeeWeekSlot) {
    if (blockReasonFor(slot, 'availability')) return;
    // A direct availability tap owns the slot: drop any draft time-off request
    // so tapping can never get stuck in absence mode.
    selectedTimeOffSlots = removeEmployeeSlotSelection(selectedTimeOffSlots, slot.key);
    const current = availability.find(
      (item) => item.date === slot.date && item.serviceKey === slot.serviceKey
    )?.state;
    setAvailability(slot, toggleSimpleAvailability(current ?? ''));
    feedback = '';
  }

  // The dialog uses the same two explicit availability choices as the quick
  // tap, so every employee update is operationally unambiguous.
  function chooseAvailabilityFor(slot: EmployeeWeekSlot, state: AvailabilityDraft['state']) {
    if (blockReasonFor(slot, 'availability')) return;
    selectedTimeOffSlots = removeEmployeeSlotSelection(selectedTimeOffSlots, slot.key);
    setAvailability(slot, state);
    feedback = '';
  }

  function requestTimeOffFor(slot: EmployeeWeekSlot) {
    if (blockReasonFor(slot, 'time_off')) return;
    if (availabilityMode === 'weekly_availability') setAvailability(slot, '');
    const selection = { key: slot.key, date: slot.date, serviceKey: slot.serviceKey };
    selectedTimeOffSlots = toggleEmployeeSlotSelection(selectedTimeOffSlots, selection);
    feedback = '';
  }

  // One tap, no sticky mode: a pending submitted request on this slot cancels
  // it; a draft time-off / change on this slot toggles that draft off; otherwise
  // a weekly-availability slot toggles its availability instantly. Fixed-schedule
  // employees only request time off against planned shifts.
  function primaryTap(key: string) {
    const slot = grid.slotsByKey.get(key);
    if (!slot) return;
    const future = slot.date >= today;

    if (future && slot.truth.absence?.status === 'pending') {
      void cancelAbsence(slot.truth.absence.id);
      return;
    }
    if (future && slot.truth.workPatternException?.status === 'pending') {
      void cancelWorkPatternException(slot.truth.workPatternException.id);
      return;
    }
    if (timeOffSelectedKeySet.has(key)) {
      requestTimeOffFor(slot);
      return;
    }
    if (availabilityMode === 'weekly_availability' && slot.editable) {
      toggleAvailabilityFor(slot);
      return;
    }
    // Fixed-schedule (CDI/CDD): tapping a shift opens the dialog where the
    // employee sets the leave type + note and confirms — no accidental
    // one-tap request.
    openSlotDetails(key);
  }

  function openSlotDetails(key: string) {
    selectedKey = key;
    slotDetailsOpen = true;
  }

  function toggleDialogTimeOff() {
    if (!selectedSlot) return;
    // Confirming from the dialog stages the request (with the chosen type +
    // note) and closes; the page action bar then submits it. Tapping again on a
    // still-staged slot simply removes it and closes.
    requestTimeOffFor(selectedSlot);
    slotDetailsOpen = false;
    selectedKey = '';
  }

  function clearAvailabilitySelection(revertAvailability = false) {
    if (revertAvailability && baseline && availabilityMode === 'weekly_availability') {
      availability = baseline.map((slot) => ({ ...slot }));
    }
    selectedAvailabilitySlots = [];
  }

  function clearTimeOffSelection() {
    selectedTimeOffSlots = [];
    absenceTypeId = '';
    actionComment = '';
  }

  async function saveChanges() {
    if (saving || !workspace.activeId || !employeeId) return;
    saving = true;
    const messages: string[] = [];
    let hasError = false;
    let changed = false;

    // Each bucket submits by its own kind, independent of what triggered it,
    // so a pending time-off draft is never stranded or wiped by another edit.
    if (availabilityMode === 'weekly_availability' && dirty) {
      try {
        await saveEmployeeAvailability({
          restaurantId: workspace.activeId,
          employeeId,
          availability: availability
            .filter((slot) => slot.date >= today)
            .map((slot) => ({
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
                employee_comment: actionComment.trim() || null
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
      clearAvailabilitySelection(false);
      clearTimeOffSelection();
      slotDetailsOpen = false;
      selectedKey = '';
      loadedKey = '';
      feedback = refreshFailed
        ? `${messages.join(' · ')} · Refresh to see the latest data.`
        : messages.join(' · ');
      feedbackTone = refreshFailed ? 'warning' : 'success';
    }
    saving = false;
  }

  function discardChanges() {
    clearAvailabilitySelection(true);
    clearTimeOffSelection();
    slotDetailsOpen = false;
    selectedKey = '';
    feedback = '';
  }


  onMount(() =>
    unsavedChanges.register({
      id: 'employee-my-service',
      label: 'My service',
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
        payload: { employee_comment: 'Cancelled by employee', cancellation_reason: 'Cancelled by employee' }
      });
      await workspace.reloadEmployeeOperations();
      await workspaceRealtime.publish('notification-refresh', {
        restaurantId: workspace.activeId,
        source: 'system'
      });
      slotDetailsOpen = false;
      selectedKey = '';
      feedback = 'Time-off request cancelled.';
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
        payload: { reason: 'Cancelled by employee', cancellation_reason: 'Cancelled by employee' }
      });
      await workspace.reloadEmployeeOperations();
      await workspaceRealtime.publish('planning-saved', {
        restaurantId: workspace.activeId,
        source: 'planning'
      });
      slotDetailsOpen = false;
      selectedKey = '';
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
    return new Intl.DateTimeFormat(i18n.intlLocale, { day: '2-digit', month: '2-digit' }).format(
      new Date(`${date}T12:00:00Z`)
    );
  }

  function slotTime(slot: EmployeeWeekSlot) {
    if (slot.shift) return `${slot.shift.startsAt}–${slot.shift.endsAt}`;
    return t(serviceName(slot.serviceKey));
  }

  function slotTitle(slot: EmployeeWeekSlot) {
    if (timeOffSelectedKeySet.has(slot.key)) return t('Time off selected');
    if (slot.state === 'available') return t('Available');
    if (slot.state === 'partial') return t('Availability needs update');
    if (slot.state === 'unavailable') return t('Availability needs update');
    if (slot.state === 'leave_pending') return t('Time off pending');
    if (slot.state === 'leave_approved') return t('Time off approved');
    if (slot.state === 'work_pattern_pending') return t('Change pending');
    if (slot.state === 'work_pattern_approved') return t('Unavailable');
    if (slot.state === 'worked') return t('Worked');
    if (slot.state === 'live') return t('Working now');
    if (slot.state === 'missing_badge') return t('Missing badge');
    if (slot.state === 'corrected') return t('Corrected');
    if (slot.shift) return `${slot.shift.area}`;
    return slot.editable ? t('Tap to mark available') : t('No service');
  }

  function slotMeta(slot: EmployeeWeekSlot) {
    // Time off keeps its holiday type visible even on a scheduled shift, so a
    // published leave request still reads as e.g. "Holiday" rather than the shift.
    if (slot.state === 'leave_pending' || slot.state === 'leave_approved') {
      return slot.absenceType || t('Time off');
    }
    if (slot.shift) return `${slot.shift.jobFunction} · ${formatHours(slot.shift.hours)}`;
    if (slot.state === 'partial' || slot.state === 'unavailable') return t('Mark available or request time off');
    if (slot.editReason === 'Past availability is read-only.') return '';
    if (slot.editReason) return t(slot.editReason);
    if (slot.availability === 'available') return t('You can work');
    return slot.editable ? t('Tap to mark available') : (slot.editReason || t('Tap ⋯ for options'));
  }

  function slotAriaLabel(slot: EmployeeWeekSlot) {
    const meta = slotMeta(slot);
    return `${dayName(slot.date)} ${slot.date}, ${t(serviceName(slot.serviceKey))}: ${slotTitle(slot)}, ${slotTime(slot)}${meta ? `, ${meta}` : ''}`;
  }

  function slotVisual(slot: EmployeeWeekSlot) {
    if (timeOffSelectedKeySet.has(slot.key)) return 'selected-leave';
    if (slot.state === 'available') return 'available';
    if (slot.state === 'partial') return 'warning';
    if (slot.state === 'unavailable') return 'unavailable';
    if (slot.state === 'planned') return 'planned';
    if (slot.state === 'worked' || slot.state === 'live') return 'worked';
    if (slot.state === 'leave_pending' || slot.state === 'leave_approved') return 'leave';
    if (slot.state === 'work_pattern_pending' || slot.state === 'work_pattern_approved')
      return 'change';
    if (slot.state === 'missing_badge' || slot.state === 'conflict') return 'danger';
    if (slot.state === 'corrected') return 'warning';
    return 'neutral';
  }

  function isSlotDirty(key: string) {
    return availabilitySelectedKeySet.has(key) || timeOffSelectedKeySet.has(key);
  }

  function dayHasSignal(date: string) {
    return slots.some(
      (slot) =>
        slot.date === date &&
        (slot.state === 'available' || slot.state === 'planned' || slot.state === 'worked' || slot.state === 'live')
    );
  }

  function slotsForDay(date: string) {
    return slots.filter((slot) => slot.date === date);
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
</script>

<svelte:head><title>{t('My service')} · restogogo</title></svelte:head>

{#snippet pageActions()}
  <button class="cl-btn is-icon" type="button" onclick={() => changeWeek(-1)} aria-label={t('Previous week')}>&lsaquo;</button>
  <strong class="period-label">{weekLabel(activeWeek, i18n.intlLocale)}</strong>
  <button class="cl-btn is-icon" type="button" onclick={() => changeWeek(1)} aria-label={t('Next week')}>&rsaquo;</button>
  {#if activeWeek !== mondayFor(today)}
    <button class="cl-btn" type="button" onclick={goToCurrentWeek}>{t('Today')}</button>
  {/if}
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
      <div class="cl-stat"><span class="cl-stat__label">{t('Planned shifts')}</span><span class="cl-stat__value">{plannedSlots.length}</span></div>
      <div class="cl-stat"><span class="cl-stat__label">{t('Pending requests')}</span><span class="cl-stat__value">{pendingRequestSlots.length}</span></div>
      <div class="cl-stat summary-stat">
        <span class="cl-stat__label">{t(nextService ? 'Next service' : weekGlanceSummary.label)}</span>
        <span class="summary-stat__value">{nextService ? `${dayName(nextService.date)} · ${t(serviceName(nextService.serviceKey))} ${nextService.shift?.startsAt ?? ''}` : t(weekGlanceSummary.value)}</span>
      </div>
    </div>

    <div class="employee-workspace">
      <FeedbackBanner message={feedback} tone={feedbackTone} />

      <section class="agenda" aria-label={t('Weekly agenda')}>
        {#each grid.days as day (day.date)}
          <article class="agenda-day" class:is-today={day.today} class:is-past={day.past}>
            <div class="agenda-day__date">
              <span>{dayName(day.date)}</span>
              <strong>{dayNumber(day.date)}</strong>
              {#if day.today}<em>{t('Today')}</em>{/if}
            </div>
            <div class="agenda-day__services">
              {#each slotsForDay(day.date) as slot (slot.key)}
                <div class={`agenda-slot is-${slotVisual(slot)}`} class:is-selected={isSlotDirty(slot.key)}>
                  <button type="button" class="agenda-slot__tap" aria-label={slotAriaLabel(slot)} onclick={() => primaryTap(slot.key)}>
                    <b>{serviceDisplay(slot.serviceKey, snapshot?.services).icon}</b>
                    <span>
                      <strong>{slotTitle(slot)}</strong>
                      <small>{slotTime(slot)}{#if slotMeta(slot)} · {slotMeta(slot)}{/if}</small>
                    </span>
                  </button>
                  {#if availabilityMode === 'weekly_availability'}
                    <button
                      type="button"
                      class="agenda-slot__more"
                      aria-label={t('More options for {service} on {date}', { service: t(serviceName(slot.serviceKey)), date: slot.date })}
                      onclick={() => openSlotDetails(slot.key)}
                    >⋯</button>
                  {/if}
                </div>
              {/each}
            </div>
          </article>
        {/each}
      </section>
    </div>

    <EmployeeSlotDialog
      open={slotDetailsOpen}
      truth={selectedSlot?.truth ?? null}
      policy={availabilityMode}
      {today}
      {timezone}
      availabilityState={selectedSlot?.availability ?? ''}
      isTimeOffSelected={selectedSlot ? timeOffSelectedKeySet.has(selectedSlot.key) : false}
      isChangeSelected={false}
      services={snapshot?.services ?? []}
      absenceTypes={snapshot.absence_types}
      bind:absenceTypeId
      bind:comment={actionComment}
      {saving}
      onclose={() => (slotDetailsOpen = false)}
      onSetAvailability={(state) => selectedSlot && chooseAvailabilityFor(selectedSlot, state)}
      onRequestTimeOff={toggleDialogTimeOff}
      onCancelAbsence={cancelAbsence}
      onCancelChange={cancelWorkPatternException}
    />
  </WorkspacePage>
{/if}

<style>
  .period-label { min-width: 180px; text-align: center; font-size: 13px; }
  .pending-copy { color: var(--cl-attention); font-size: 12px; font-weight: var(--rst-fw-bold); }
  .employee-workspace { display: grid; gap: 16px; }
  .employee-stats { grid-template-columns: repeat(3, minmax(0, 1fr)); }
  .summary-stat__value { color: var(--cl-ink); font-size: 14px; font-weight: var(--rst-fw-bold); line-height: 1.35; }

  .agenda { display: grid; gap: 8px; }
  .agenda-day {
    display: grid;
    grid-template-columns: 84px minmax(0, 1fr);
    gap: 16px;
    align-items: center;
    padding: 12px 14px;
    border: 1px solid var(--cl-line);
    border-left: 3px solid transparent;
    border-radius: var(--cl-radius);
    background: var(--cl-surface);
  }
  .agenda-day.is-today { border-left-color: var(--cl-accent); background: var(--cl-accent-wash); }
  .agenda-day.is-past { opacity: .68; }
  .agenda-day__date { display: grid; gap: 2px; justify-items: start; }
  .agenda-day__date span { color: var(--cl-muted); font-size: 10px; font-weight: var(--rst-fw-bold); text-transform: uppercase; }
  .agenda-day__date strong { font-size: 20px; }
  .agenda-day__date em { padding: 2px 7px; border-radius: 999px; color: var(--cl-accent); background: var(--cl-surface); font-size: 9px; font-style: normal; font-weight: var(--rst-fw-bold); text-transform: uppercase; }
  .agenda-day__services { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 8px; }
  .agenda-slot { position: relative; display: flex; align-items: stretch; border-radius: var(--cl-radius); overflow: hidden; }
  .agenda-slot__tap { flex: 1; display: flex; align-items: center; gap: 10px; min-width: 0; padding: 9px 34px 9px 10px; border: 1px solid var(--cl-line); border-radius: var(--cl-radius); color: var(--cl-ink); text-align: left; background: var(--cl-surface); font: inherit; cursor: pointer; }
  .agenda-slot__tap:hover { border-color: var(--cl-line-strong); background: var(--cl-surface-muted); }
  .agenda-slot__tap b { display: grid; flex: 0 0 auto; width: 26px; height: 26px; place-items: center; border-radius: 999px; background: var(--cl-accent-wash); font-size: 13px; }
  .agenda-slot__tap span { display: grid; min-width: 0; gap: 1px; }
  .agenda-slot__tap strong { overflow: hidden; font-size: 13px; text-overflow: ellipsis; white-space: nowrap; }
  .agenda-slot__tap small { overflow: hidden; color: var(--cl-muted); font-size: 11px; text-overflow: ellipsis; white-space: nowrap; }
  .agenda-slot__more { position: absolute; top: 6px; right: 6px; z-index: 1; width: 26px; height: 26px; display: grid; place-items: center; border: 0; border-radius: 999px; color: var(--cl-muted); background: transparent; font-size: 15px; line-height: 1; cursor: pointer; }
  .agenda-slot.is-available .agenda-slot__tap { border-color: var(--cl-ok-line); background: var(--cl-ok-wash); }
  .agenda-slot.is-warning .agenda-slot__tap,
  .agenda-slot.is-change .agenda-slot__tap,
  .agenda-slot.is-selected-change .agenda-slot__tap { border-color: var(--cl-attention-line); background: var(--cl-attention-wash); }
  .agenda-slot.is-unavailable .agenda-slot__tap,
  .agenda-slot.is-danger .agenda-slot__tap { border-color: var(--cl-problem-line); background: var(--cl-problem-wash); }
  .agenda-slot.is-planned .agenda-slot__tap { border-color: var(--cl-info-line); background: var(--cl-info-wash); }
  .agenda-slot.is-worked .agenda-slot__tap { border-color: var(--cl-ok-line); background: var(--cl-ok-wash); }
  .agenda-slot.is-leave .agenda-slot__tap,
  .agenda-slot.is-selected-leave .agenda-slot__tap { border-color: var(--rst-state-absence-border); background: var(--rst-state-absence-bg); }
  .agenda-slot.is-selected .agenda-slot__tap { box-shadow: inset 0 0 0 2px rgba(var(--cl-attention-rgb), .28); }

  @media (max-width: 760px) {
    .employee-stats {
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 6px;
    }
    .employee-stats .cl-stat {
      min-width: 0;
      gap: 3px;
      padding: 10px 8px 10px 11px;
    }
    .employee-stats .cl-stat__label {
      overflow: hidden;
      font-size: 9px;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .employee-stats .cl-stat__value {
      font-size: 18px;
    }
    .summary-stat__value {
      display: -webkit-box;
      overflow: hidden;
      font-size: 10px;
      -webkit-box-orient: vertical;
      -webkit-line-clamp: 2;
      line-clamp: 2;
    }
    .agenda-day { grid-template-columns: 1fr; gap: 10px; }
    .agenda-day__date { grid-auto-flow: column; align-items: baseline; justify-content: start; gap: 8px; }
    .pending-copy { display: none; }
  }
</style>
