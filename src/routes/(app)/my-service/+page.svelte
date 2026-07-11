<script lang="ts">
  import { page } from '$app/state';
  import {
    saveAbsence,
    saveEmployeeAvailability,
    saveWorkPatternException
  } from '$lib/api/mutations';
  import {
    addDays,
    formatHours,
    mondayFor,
    serviceLabel,
    todayInTimezone,
    weekLabel
  } from '$lib/calendar/date';
  import ActionButton from '$lib/components/ActionButton.svelte';
  import FeedbackBanner from '$lib/components/FeedbackBanner.svelte';
  import PageHero from '$lib/components/PageHero.svelte';
  import EmployeeSlotDrawer from '$lib/employee/EmployeeSlotDrawer.svelte';
  import {
    employeeSlotActionReason,
    defaultEmployeeTimeOffType,
    availabilityChanges,
    groupTimeOffRanges,
    timeOffServiceDrafts,
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
    publishedShiftsForWeek,
    type AvailabilityDraft,
    type AvailabilityMode,
    type EmployeeWeekSlot
  } from '$lib/employee/employee-model';
  import { workRegime } from '$lib/domain/operations';
  import { friendlyError } from '$lib/api/error-messages';
  import { workspace } from '$lib/workspace/workspace.svelte';

  const snapshot = $derived(workspace.employeeOperations);
  const employeeId = $derived(workspace.active?.employee_id ?? '');
  const timezone = $derived(
    snapshot?.restaurant_settings.timezone ||
      workspace.bootstrap?.restaurant_settings.timezone ||
      'Europe/Brussels'
  );
  const today = $derived(todayInTimezone(timezone));
  let weekStart = $state('');
  let lastWeekParam = $state<string | null>(null);
  let selectedKey = $state('');
  let selectedAvailabilitySlots = $state<EmployeeSlotSelection[]>([]);
  let selectedTimeOffSlots = $state<EmployeeSlotSelection[]>([]);
  let absenceTypeId = $state('');
  let actionComment = $state('');
  let availability = $state<AvailabilityDraft[]>([]);
  let baseline = $state('');
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
  const planningPublished = $derived(
    snapshot?.work_weeks.find((week) => week.week_start === activeWeek)?.planning_status ===
      'published'
  );
  const serviceDrafts = $derived(timeOffServiceDrafts(selectedTimeOffSlots));
  const grid = $derived(
    snapshot && employeeId
      ? buildEmployeeWeek({
          snapshot,
          employeeId,
          weekStart: activeWeek,
          today,
          availability,
          availabilityMode,
          serviceDrafts
        })
      : { days: [], rows: [], slotsByKey: new Map<string, EmployeeWeekSlot>() }
  );
  const slots = $derived([...grid.slotsByKey.values()]);
  const selectedSlot = $derived(grid.slotsByKey.get(selectedKey) ?? null);
  const timeOffRanges = $derived(groupTimeOffRanges(selectedTimeOffSlots));
  const defaultTimeOffType = $derived(
    snapshot ? defaultEmployeeTimeOffType(snapshot.absence_types) : null
  );
  const dirty = $derived(JSON.stringify(availability) !== baseline);
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
  const nextService = $derived(
    plannedSlots
      .filter((slot) => slot.date >= today)
      .sort(
        (a, b) =>
          `${a.date}-${a.shift?.startsAt ?? ''}`.localeCompare(`${b.date}-${b.shift?.startsAt ?? ''}`)
      )[0] ?? null
  );
  const weekGlanceSummary = $derived(
    availabilityMode === 'weekly_availability'
      ? { label: 'Availability', value: submission }
      : availabilityMode === 'fixed_schedule'
        ? {
            label: 'Fixed schedule',
            value: pendingRequestSlots.length
              ? `${pendingRequestSlots.length} request${pendingRequestSlots.length > 1 ? 's' : ''}`
              : 'Manager planned'
          }
        : {
            label: 'Schedule',
            value: pendingRequestSlots.length
              ? `${pendingRequestSlots.length} request${pendingRequestSlots.length > 1 ? 's' : ''}`
              : 'Manager planned'
          }
  );
  const heroTitle = $derived(
    hasPendingEdits
      ? 'Ready to send your update.'
      : nextService
        ? `Next service: ${serviceLabel(nextService.serviceKey)} ${nextService.shift?.startsAt ?? ''}.`
        : plannedSlots.length
          ? 'Your published week is ready.'
          : availabilityMode === 'fixed_schedule'
            ? 'Your schedule is clear.'
            : 'Tell the restaurant when you can work.'
  );
  const heroSubtitle = $derived(
    availabilityMode === 'weekly_availability'
      ? planningPublished
        ? 'This week is published, so availability is locked. Use the menu for time off or details.'
        : 'Tap today or any future service to mark yourself available. Past services stay read-only.'
      : availabilityMode === 'fixed_schedule'
        ? 'Your manager publishes your shifts. Tap a scheduled shift to request time off.'
        : 'Your manager sets your schedule. Tap a service to request time off.'
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
    availability = availabilityForWeek(snapshot, employeeId, activeWeek);
    baseline = JSON.stringify(availability);
    loadedKey = key;
    selectedKey = '';
    selectedAvailabilitySlots = [];
    selectedTimeOffSlots = [];
    slotDetailsOpen = false;
  });

  function changeWeek(amount: number) {
    if (hasPendingEdits) {
      feedback = 'Submit or undo your pending changes before changing week.';
      feedbackTone = 'warning';
      return;
    }
    weekStart = addDays(activeWeek, amount * 7);
    feedback = '';
  }

  function setAvailability(slot: EmployeeWeekSlot, state: AvailabilityDraft['state']) {
    availability = availability.map((item) =>
      item.date === slot.date && item.serviceKey === slot.serviceKey
        ? { ...item, state }
        : item
    );
    selectedAvailabilitySlots = availabilityChanges(
      JSON.parse(baseline) as AvailabilityDraft[],
      availability,
      employeeId
    );
  }

  function blockReasonFor(slot: EmployeeWeekSlot, mode: EmployeeSelfServiceMode): string {
    const reason = employeeSlotActionReason({
      truth: slot.truth,
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

  // Shared by the direct-tap fast path and the slot Drawer's buttons, so
  // tapping and opening the Drawer always agree on what is possible.
  function toggleAvailabilityFor(slot: EmployeeWeekSlot) {
    if (blockReasonFor(slot, 'availability')) return;
    // A direct availability tap owns the slot: drop any draft time-off request
    // so tapping can never get stuck in absence mode.
    selectedTimeOffSlots = selectedTimeOffSlots.filter((item) => item.key !== slot.key);
    const current = availability.find(
      (item) => item.date === slot.date && item.serviceKey === slot.serviceKey
    )?.state;
    setAvailability(slot, toggleSimpleAvailability(current ?? ''));
    feedback = '';
  }

  // The Drawer uses the same two explicit availability choices as the quick
  // tap, so every employee update is operationally unambiguous.
  function chooseAvailabilityFor(slot: EmployeeWeekSlot, state: AvailabilityDraft['state']) {
    if (blockReasonFor(slot, 'availability')) return;
    selectedTimeOffSlots = selectedTimeOffSlots.filter((item) => item.key !== slot.key);
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
    if (availabilityMode === 'weekly_availability') {
      toggleAvailabilityFor(slot);
      return;
    }
    // Fixed-schedule (CDI/CDD): tapping a shift opens the drawer where the
    // employee sets the leave type + note and confirms — no accidental
    // one-tap request.
    openSlotDetails(key);
  }

  function openSlotDetails(key: string) {
    selectedKey = key;
    slotDetailsOpen = true;
  }

  function toggleDrawerTimeOff() {
    if (!selectedSlot) return;
    // Confirming from the drawer stages the request (with the chosen type +
    // note) and closes; the page action bar then submits it. Tapping again on a
    // still-staged slot simply removes it and closes.
    requestTimeOffFor(selectedSlot);
    slotDetailsOpen = false;
    selectedKey = '';
  }

  function clearAvailabilitySelection(revertAvailability = false) {
    if (revertAvailability && baseline && availabilityMode === 'weekly_availability') {
      availability = JSON.parse(baseline) as AvailabilityDraft[];
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

    // Each bucket submits by its own kind, independent of what triggered it,
    // so a pending time-off draft is never stranded or wiped by another edit.
    if (availabilityMode === 'weekly_availability' && dirty) {
      try {
        await saveEmployeeAvailability({
          restaurantId: workspace.activeId,
          employeeId,
          availability: availability.map((slot) => ({
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
      clearAvailabilitySelection(false);
      clearTimeOffSelection();
      slotDetailsOpen = false;
      selectedKey = '';
      try { await workspace.reloadEmployeeOperations(); } catch { /* non-critical */ }
      loadedKey = '';
      feedback = messages.join(' · ');
      feedbackTone = 'success';
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

  async function cancelAbsence(absenceId: string) {
    if (!workspace.activeId || !employeeId || saving) return;
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
    return new Intl.DateTimeFormat('en-GB', { weekday: 'short' }).format(new Date(`${date}T12:00:00Z`));
  }

  function dayNumber(date: string) {
    return new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: '2-digit' }).format(
      new Date(`${date}T12:00:00Z`)
    );
  }

  function serviceIcon(serviceKey: 'lunch' | 'evening') {
    return serviceKey === 'lunch' ? '☀' : '☾';
  }

  function slotTime(slot: EmployeeWeekSlot) {
    if (slot.shift) return `${slot.shift.startsAt}–${slot.shift.endsAt}`;
    return serviceLabel(slot.serviceKey);
  }

  function slotTitle(slot: EmployeeWeekSlot) {
    if (timeOffSelectedKeySet.has(slot.key)) return 'Time off selected';
    if (slot.state === 'available') return 'Available';
    if (slot.state === 'partial') return 'Availability needs update';
    if (slot.state === 'unavailable') return 'Unavailable';
    if (slot.state === 'leave_pending') return 'Time off pending';
    if (slot.state === 'leave_approved') return 'Time off approved';
    if (slot.state === 'work_pattern_pending') return 'Change pending';
    if (slot.state === 'work_pattern_approved') return 'Unavailable';
    if (slot.state === 'worked') return 'Worked';
    if (slot.state === 'live') return 'Working now';
    if (slot.state === 'missing_badge') return 'Missing badge';
    if (slot.state === 'corrected') return 'Corrected';
    if (slot.shift) return `${slot.shift.area}`;
    return slot.editable ? 'Tap to mark available' : 'No service';
  }

  function slotMeta(slot: EmployeeWeekSlot) {
    // Time off keeps its holiday type visible even on a scheduled shift, so a
    // published leave request still reads as e.g. "Holiday" rather than the shift.
    if (slot.state === 'leave_pending' || slot.state === 'leave_approved') {
      return slot.absenceType || 'Time off';
    }
    if (slot.shift) return `${slot.shift.jobFunction} · ${formatHours(slot.shift.hours)}`;
    if (slot.state === 'partial') return 'Choose available or unavailable';
    if (slot.state === 'unavailable') return "You can't work this service";
    if (slot.editReason) return slot.editReason;
    if (slot.availability === 'available') return 'You can work';
    return slot.editable ? 'Tap to mark available' : (slot.editReason || 'Tap ⋯ for options');
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
    if (!hasPendingEdits) return 'Nothing waiting';
    const parts: string[] = [];
    if (selectedAvailabilitySlots.length) {
      parts.push(`${selectedAvailabilitySlots.length} availability edit${selectedAvailabilitySlots.length > 1 ? 's' : ''}`);
    }
    if (selectedTimeOffSlots.length) {
      parts.push(`${selectedTimeOffSlots.length} time-off service${selectedTimeOffSlots.length > 1 ? 's' : ''}`);
    }
    return parts.join(' · ');
  }
</script>

<svelte:head><title>My service · restogogo</title></svelte:head>

{#if snapshot && employee}
  <section class="page-shell employee-page service-page">
    <PageHero heroClass="hero-service" eyebrow="My service" title={heroTitle} subtitle={heroSubtitle}>
      {#snippet nav()}
        <div class="page-nav">
          <button type="button" onclick={() => changeWeek(-1)} aria-label="Previous week">&lsaquo;</button>
          <strong>{weekLabel(activeWeek)}</strong>
          <button type="button" onclick={() => changeWeek(1)} aria-label="Next week">&rsaquo;</button>
          {#if activeWeek !== mondayFor(today)}
            <button
              type="button"
              class="page-nav__accent"
              disabled={hasPendingEdits}
              onclick={() => {
                weekStart = mondayFor(today);
                feedback = '';
              }}
            >
              Today
            </button>
          {/if}
        </div>
      {/snippet}
      {#snippet command()}
        <aside class="glass-card week-glance" aria-label="Week glance">
          <span class="week-glance__kicker">Week glance</span>
          <div class="week-glance__dots">
            {#each grid.days as day (day.date)}
              <span class:is-active={dayHasSignal(day.date)} class:is-today={day.today} title={dayName(day.date)}>
                {dayName(day.date).slice(0, 2)}
              </span>
            {/each}
          </div>
          <div class="week-glance__stats">
            <div><strong>{plannedSlots.length}</strong><span>shifts</span></div>
            <div><strong>{pendingRequestSlots.length}</strong><span>requests</span></div>
          </div>
          {#if nextService}
            <p class="week-glance__next"><b>Next</b> {dayName(nextService.date)} · {serviceLabel(nextService.serviceKey)} {nextService.shift?.startsAt ?? ''}</p>
          {:else}
            <p class="week-glance__next"><b>{weekGlanceSummary.label}</b> {weekGlanceSummary.value}</p>
          {/if}
        </aside>
      {/snippet}
    </PageHero>

    <div class="page-body has-tray">
      <FeedbackBanner message={feedback} tone={feedbackTone} />

      <section class="agenda" aria-label="Weekly agenda">
        {#each grid.days as day (day.date)}
          <article class="agenda-day" class:is-today={day.today} class:is-past={day.past}>
            <div class="agenda-day__date">
              <span>{dayName(day.date)}</span>
              <strong>{dayNumber(day.date)}</strong>
              {#if day.today}<em>Today</em>{/if}
            </div>
            <div class="agenda-day__services">
              {#each slotsForDay(day.date) as slot (slot.key)}
                <div class={`agenda-slot is-${slotVisual(slot)}`} class:is-selected={isSlotDirty(slot.key)}>
                  <button type="button" class="agenda-slot__tap" onclick={() => primaryTap(slot.key)}>
                    <b>{serviceIcon(slot.serviceKey)}</b>
                    <span>
                      <strong>{slotTitle(slot)}</strong>
                      <small>{slotTime(slot)} · {slotMeta(slot)}</small>
                    </span>
                  </button>
                  {#if availabilityMode === 'weekly_availability'}
                    <button
                      type="button"
                      class="agenda-slot__more"
                      aria-label={`More options for ${serviceLabel(slot.serviceKey)} on ${slot.date}`}
                      onclick={() => openSlotDetails(slot.key)}
                    >
                      ⋯
                    </button>
                  {/if}
                </div>
              {/each}
            </div>
          </article>
        {/each}
      </section>
    </div>

    {#if hasPendingEdits}
      <div class="request-tray" role="status">
        <span>{requestCopy()}</span>
        <div>
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
    truth={selectedSlot?.truth ?? null}
    policy={availabilityMode}
    {today}
    {timezone}
    {planningPublished}
    availabilityState={selectedSlot?.availability ?? ''}
    isTimeOffSelected={selectedSlot ? timeOffSelectedKeySet.has(selectedSlot.key) : false}
    isChangeSelected={false}
    absenceTypes={snapshot.absence_types}
    bind:absenceTypeId
    bind:comment={actionComment}
    {saving}
    onclose={() => (slotDetailsOpen = false)}
    onSetAvailability={(state) => selectedSlot && chooseAvailabilityFor(selectedSlot, state)}
    onRequestTimeOff={toggleDrawerTimeOff}
    onCancelAbsence={cancelAbsence}
    onCancelChange={cancelWorkPatternException}
  />
  </section>
{/if}

<style>
  .week-glance {
    align-content: center;
  }

  .week-glance__kicker {
    color: #ffb26f;
    font-size: 10px;
    font-weight: var(--rst-fw-display);
    letter-spacing: 0.1em;
    text-transform: uppercase;
  }

  .week-glance__dots {
    display: flex;
    gap: 6px;
  }

  .week-glance__dots span {
    flex: 1;
    display: grid;
    place-items: center;
    height: 30px;
    border-radius: var(--rst-ui-radius-md);
    color: rgba(255, 250, 242, 0.5);
    background: rgba(255, 255, 255, 0.08);
    font-size: 9px;
    font-weight: var(--rst-fw-display);
    text-transform: uppercase;
  }

  .week-glance__dots span.is-active {
    color: #13321f;
    background: var(--rst-green);
  }

  .week-glance__dots span.is-today {
    box-shadow: 0 0 0 2px var(--rst-ui-action);
  }

  .week-glance__stats {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 8px;
  }

  .week-glance__stats div {
    display: grid;
    gap: 2px;
    padding: 10px;
    border-radius: var(--rst-ui-radius-md);
    background: rgba(255, 255, 255, 0.08);
  }

  .week-glance__stats strong {
    font-size: 20px;
    font-weight: var(--rst-fw-display);
  }

  .week-glance__stats span {
    color: rgba(255, 250, 242, 0.6);
    font-size: 10px;
    font-weight: var(--rst-fw-bold);
    text-transform: uppercase;
  }

  .week-glance__next {
    margin: 0;
    color: rgba(255, 250, 242, 0.78);
    font-size: 12px;
  }

  .week-glance__next b {
    color: #ffb26f;
    margin-right: 4px;
  }

  .agenda {
    display: grid;
    gap: 10px;
  }

  .agenda-day {
    display: grid;
    grid-template-columns: 84px minmax(0, 1fr);
    gap: 16px;
    align-items: center;
    padding: 14px 18px;
    border: 1px solid var(--rst-ui-line);
    border-left: 4px solid transparent;
    border-radius: var(--rst-ui-radius-xl);
    background: #fff;
    box-shadow: 0 2px 4px rgba(31, 22, 15, 0.05), 0 12px 26px rgba(31, 22, 15, 0.07);
    transition: box-shadow 0.18s var(--rst-ease-out);
    animation: rst-fade-up 0.5s var(--rst-ease-out) backwards;
  }

  .agenda-day:nth-child(1) { animation-delay: 0.04s; }
  .agenda-day:nth-child(2) { animation-delay: 0.09s; }
  .agenda-day:nth-child(3) { animation-delay: 0.14s; }
  .agenda-day:nth-child(4) { animation-delay: 0.19s; }
  .agenda-day:nth-child(5) { animation-delay: 0.24s; }
  .agenda-day:nth-child(6) { animation-delay: 0.29s; }
  .agenda-day:nth-child(7) { animation-delay: 0.34s; }

  .agenda-day.is-today {
    border-left-color: var(--rst-ui-action);
    background: linear-gradient(90deg, rgba(240, 100, 35, 0.06), transparent 30%), #fff;
  }

  .agenda-day.is-past {
    opacity: 0.68;
  }

  .agenda-day__date {
    display: grid;
    gap: 2px;
    justify-items: start;
  }

  .agenda-day__date span {
    color: var(--rst-ui-muted);
    font-size: 10px;
    font-weight: var(--rst-fw-display);
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }

  .agenda-day__date strong {
    font-size: 20px;
    letter-spacing: -0.02em;
  }

  .agenda-day__date em {
    padding: 2px 7px;
    border-radius: var(--rst-ui-radius-pill);
    color: #fff;
    background: var(--rst-ui-action);
    font-size: 9px;
    font-style: normal;
    font-weight: var(--rst-fw-bold);
    text-transform: uppercase;
  }

  .agenda-day__services {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
    gap: 8px;
  }

  .agenda-slot {
    position: relative;
    display: flex;
    align-items: stretch;
    min-height: 0;
    border-radius: var(--rst-ui-radius-lg);
    overflow: hidden;
  }

  .agenda-slot__tap {
    flex: 1;
    display: flex;
    align-items: center;
    gap: 10px;
    min-width: 0;
    padding: 10px 34px 10px 12px;
    border: 1px solid var(--rst-ui-line);
    border-radius: var(--rst-ui-radius-lg);
    color: var(--rst-ui-text);
    text-align: left;
    background: var(--rst-ui-surface-field);
    font: inherit;
    cursor: pointer;
    transition: transform 0.15s ease, border-color 0.15s ease, background-color 0.15s ease;
  }

  .agenda-slot__tap:hover {
    transform: translateY(-1px);
    border-color: color-mix(in srgb, var(--rst-ui-action) 45%, var(--rst-ui-line));
  }

  .agenda-slot__tap b {
    display: grid;
    flex: 0 0 auto;
    width: 26px;
    height: 26px;
    place-items: center;
    border-radius: 999px;
    background: rgba(240, 100, 35, 0.14);
    font-size: 13px;
  }

  .agenda-slot__tap span {
    display: grid;
    min-width: 0;
    gap: 1px;
  }

  .agenda-slot__tap strong {
    overflow: hidden;
    font-size: 13px;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .agenda-slot__tap small {
    overflow: hidden;
    color: var(--rst-ui-muted);
    font-size: 11px;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .agenda-slot__more {
    position: absolute;
    top: 6px;
    right: 6px;
    z-index: 1;
    width: 26px;
    height: 26px;
    display: grid;
    place-items: center;
    border: 0;
    border-radius: 999px;
    color: var(--rst-ui-muted);
    background: transparent;
    font-size: 15px;
    line-height: 1;
    cursor: pointer;
  }

  .agenda-slot.is-available .agenda-slot__tap {
    border-color: rgba(42, 154, 98, 0.44);
    background: linear-gradient(135deg, rgba(51, 170, 107, 0.2), rgba(51, 170, 107, 0.06));
  }

  .agenda-slot.is-warning .agenda-slot__tap {
    border-color: rgba(234, 179, 8, 0.5);
    background: linear-gradient(135deg, rgba(234, 179, 8, 0.18), rgba(234, 179, 8, 0.05));
  }

  .agenda-slot.is-unavailable .agenda-slot__tap {
    border-color: rgba(239, 68, 68, 0.44);
    background: linear-gradient(135deg, rgba(239, 68, 68, 0.14), rgba(239, 68, 68, 0.04));
  }

  .agenda-slot.is-planned .agenda-slot__tap {
    border-color: rgba(66, 104, 161, 0.38);
    background: linear-gradient(135deg, rgba(76, 118, 179, 0.2), rgba(76, 118, 179, 0.06));
  }

  .agenda-slot.is-worked .agenda-slot__tap {
    border-color: rgba(52, 211, 153, 0.48);
    background: linear-gradient(135deg, rgba(16, 185, 129, 0.2), rgba(7, 30, 40, 0.04));
  }

  .agenda-slot.is-leave .agenda-slot__tap,
  .agenda-slot.is-selected-leave .agenda-slot__tap {
    border-color: rgba(135, 92, 198, 0.48);
    background: linear-gradient(135deg, rgba(135, 92, 198, 0.2), rgba(135, 92, 198, 0.06));
  }

  .agenda-slot.is-change .agenda-slot__tap,
  .agenda-slot.is-selected-change .agenda-slot__tap,
  .agenda-slot.is-warning .agenda-slot__tap {
    border-color: rgba(234, 179, 8, 0.52);
    background: linear-gradient(135deg, rgba(234, 179, 8, 0.18), rgba(234, 179, 8, 0.05));
  }

  .agenda-slot.is-danger .agenda-slot__tap {
    border-color: rgba(239, 68, 68, 0.52);
    background: linear-gradient(135deg, rgba(239, 68, 68, 0.16), rgba(239, 68, 68, 0.05));
  }

  .agenda-slot.is-selected .agenda-slot__tap {
    box-shadow: 0 0 0 3px rgba(240, 100, 35, 0.18);
  }

  @media (max-width: 760px) {
    .agenda-day {
      grid-template-columns: 1fr;
      gap: 10px;
    }

    .agenda-day__date {
      grid-auto-flow: column;
      align-items: baseline;
      justify-content: start;
      gap: 8px;
    }

  }
</style>
