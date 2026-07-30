<script lang="ts">
  import { onMount, untrack } from 'svelte';
  import type { ManagerOperationsReadModel } from '$lib/api/workspace-snapshot';
  import type { ActualSlot } from '$lib/timesheet/timesheet-model';
  import {
    instantToLocalInput,
    localInputToInstant,
    serviceDefaultHours
  } from '$lib/calendar/date';
  import ActionButton from '$lib/components/ActionButton.svelte';
  import FeedbackBanner from '$lib/components/FeedbackBanner.svelte';
  import { i18n, t } from '$lib/i18n/i18n.svelte';
  import { unsavedChanges } from '$lib/navigation/unsaved-changes.svelte';
  import { getTimeEntryPayrollEvidence } from '$lib/payroll/payroll-api';
  import { areaInstanceLabelMap } from '$lib/restaurant/area-instance';

  type FeedbackTone = 'info' | 'success' | 'warning' | 'danger';
  type ActualsEntrySave = {
    clockInAt: string;
    clockOutAt: string;
    breakMinutes: number;
    actualJobFunctionId: string;
    actualAreaId: string;
    breakIntervals: Array<{ started_at: string; ended_at: string }>;
    reason: string;
    isCorrection: boolean;
  };

  type EditorState = {
    clockIn: string;
    clockOut: string;
    breakMinutes: number;
    actualJobFunctionId: string;
    actualAreaId: string;
    breaks: Array<{ id: string; startedAt: string; endedAt: string }>;
    aggregateBreakNeedsPosition: boolean;
    reason: string;
  };

  // Content of the Time entry dialog. Owns the manual/correction form, its
  // client-side validation and the badge-proof view; the shared dialog
  // shell and performs the audited Timesheet mutation through the callbacks.
  let {
    slot,
    restaurantId,
    timezone,
    editable,
    jobFunctions,
    workAreas,
    services,
    adjustments,
    onsave,
    oncancel,
    onproof,
    onresolveleave,
    onfeedback
  }: {
    slot: ActualSlot;
    restaurantId: string;
    timezone: string;
    editable: boolean;
    jobFunctions: Array<{ id: string; name: string; active: boolean }>;
    workAreas: ManagerOperationsReadModel['work_areas'];
    services: ManagerOperationsReadModel['services'];
    adjustments: ManagerOperationsReadModel['time_entry_adjustments'];
    onsave: (values: ActualsEntrySave) => Promise<boolean>;
    oncancel: (values: { reason: string }) => Promise<boolean>;
    onproof: () => Promise<string>;
    onresolveleave: (action: 'approve' | 'reject') => Promise<boolean>;
    onfeedback: (message: string, tone: FeedbackTone) => void;
  } = $props();

  let clockIn = $state('');
  let clockOut = $state('');
  let breakMinutes = $state(0);
  let actualJobFunctionId = $state('');
  let actualAreaId = $state('');
  let breaks = $state<Array<{ id: string; startedAt: string; endedAt: string }>>([]);
  let aggregateBreakNeedsPosition = $state(false);
  let evidenceLoading = $state(false);
  let reason = $state('');
  let busy = $state(false);
  let proofUrl = $state('');
  let proofLoading = $state(false);
  let baseline = $state<EditorState | null>(null);
  const areaName = $derived(areaInstanceLabelMap(workAreas));

  function currentState(): EditorState {
    return {
      clockIn,
      clockOut,
      breakMinutes,
      actualJobFunctionId,
      actualAreaId,
      breaks: breaks.map((item) => ({ ...item })),
      aggregateBreakNeedsPosition,
      reason
    };
  }

  function stateKey(value: EditorState | null): string {
    return value ? JSON.stringify(value) : '';
  }

  const dirty = $derived(Boolean(baseline && stateKey(currentState()) !== stateKey(baseline)));

  const enteredGrossHours = $derived(
    clockIn && clockOut
      ? Math.max(0, (new Date(clockOut).getTime() - new Date(clockIn).getTime()) / 3_600_000)
      : 0
  );
  const exactBreakMinutes = $derived.by(() => breaks.reduce((total, item) => {
    const start = new Date(item.startedAt).getTime();
    const end = new Date(item.endedAt).getTime();
    return total + (Number.isFinite(start) && Number.isFinite(end) && end > start
      ? Math.round((end - start) / 60_000)
      : 0);
  }, 0));
  const enteredNetHours = $derived(
    Math.max(0, enteredGrossHours - Math.max(0, exactBreakMinutes || Number(breakMinutes) || 0) / 60)
  );
  const unresolvedConflict = $derived(slot.status === 'conflict' && !slot.entryId);
  const pendingLeave = $derived(slot.truth.absence?.status === 'pending');
  let resolvingLeave = $state(false);

  async function resolveLeave(action: 'approve' | 'reject') {
    if (resolvingLeave) return;
    resolvingLeave = true;
    try {
      await onresolveleave(action);
    } finally {
      resolvingLeave = false;
    }
  }

  $effect(() => {
    const defaults = serviceDefaultHours(slot.serviceKey, services);
    clockIn =
      instantToLocalInput(slot.clockInAt, timezone) ||
      `${slot.date}T${defaults.start}`;
    clockOut =
      instantToLocalInput(slot.clockOutAt, timezone) ||
      (slot.plannedRange ? `${slot.date}T${slot.plannedRange.slice(-5)}` : '');
    breakMinutes = slot.breakMinutes;
    actualJobFunctionId = slot.actualJobFunctionId;
    actualAreaId = slot.actualAreaId;
    breaks = [];
    aggregateBreakNeedsPosition = slot.breakMinutes > 0;
    reason = untrack(() => t(slot.entryId ? 'Manager correction' : 'Unplanned manual entry'));
    proofUrl = '';
    baseline = untrack(() => currentState());
    if (slot.entryId) void loadPayrollEvidence(slot.entryId);
  });

  onMount(() =>
    unsavedChanges.register({
      id: 'timesheet-entry-editor',
      label: 'Timesheet entry',
      priority: 20,
      isDirty: () => dirty,
      save: saveNow,
      discard: discardNow
    })
  );

  async function loadPayrollEvidence(timeEntryId: string) {
    evidenceLoading = true;
    try {
      const evidence = await getTimeEntryPayrollEvidence(restaurantId, timeEntryId);
      if (slot.entryId !== timeEntryId) return;
      actualJobFunctionId = evidence.actualJobFunctionId || slot.actualJobFunctionId;
      actualAreaId = evidence.actualAreaId || slot.actualAreaId;
      const exact = evidence.breakIntervals.filter(
        (item) => item.evidence_kind === 'exact' && item.break_started_at && item.break_ended_at
      );
      breaks = exact.map((item) => ({
        id: item.id,
        startedAt: instantToLocalInput(item.break_started_at, timezone),
        endedAt: instantToLocalInput(item.break_ended_at, timezone)
      }));
      aggregateBreakNeedsPosition = evidence.breakIntervals.some(
        (item) => item.evidence_kind === 'aggregate_only' && item.duration_seconds > 0
      );
      // Payroll evidence is server truth loaded after the dialog opens. Fold
      // only those evidence fields into the baseline, preserving any clock or
      // reason edits the manager may already have made while it was loading.
      if (baseline) {
        baseline = {
          ...baseline,
          actualJobFunctionId,
          actualAreaId,
          breaks: breaks.map((item) => ({ ...item })),
          aggregateBreakNeedsPosition
        };
      }
    } catch (error) {
      onfeedback(error instanceof Error ? error.message : String(error), 'danger');
    } finally {
      evidenceLoading = false;
    }
  }

  function addBreak() {
    breaks = [...breaks, { id: crypto.randomUUID(), startedAt: '', endedAt: '' }];
    aggregateBreakNeedsPosition = false;
  }

  function updateBreak(id: string, field: 'startedAt' | 'endedAt', value: string) {
    breaks = breaks.map((item) => item.id === id ? { ...item, [field]: value } : item);
  }

  function removeBreak(id: string) {
    breaks = breaks.filter((item) => item.id !== id);
  }

  function valuesToSave(): ActualsEntrySave {
    if (!clockIn || reason.trim().length < 3) {
      throw new Error(t('Clock-in and a manager reason are required.'));
    }
    const clockInAt = localInputToInstant(clockIn, timezone);
    const clockOutAt = clockOut ? localInputToInstant(clockOut, timezone) : '';
    if (!clockInAt || (clockOut && !clockOutAt)) {
      throw new Error(t('Enter valid restaurant-local times.'));
    }
    if (clockOutAt && new Date(clockOutAt) <= new Date(clockInAt)) {
      throw new Error(t('Clock-out must be after clock-in.'));
    }
    if (!actualJobFunctionId || !actualAreaId) {
      throw new Error(t('Confirm the actual function and work area.'));
    }
    if (aggregateBreakNeedsPosition) {
      throw new Error(t('Position the existing break with an exact start and end.'));
    }
    const breakIntervals = breaks.map((item) => ({
      started_at: localInputToInstant(item.startedAt, timezone),
      ended_at: localInputToInstant(item.endedAt, timezone)
    }));
    if (breakIntervals.some((item) => !item.started_at || !item.ended_at)) {
      throw new Error(t('Every break needs an exact start and end.'));
    }
    if (!clockOutAt && breaks.length > 0) {
      throw new Error(t('Add a clock-out before recording a break.'));
    }
    if (clockOutAt && exactBreakMinutes >= enteredGrossHours * 60) {
      throw new Error(t('Break must be shorter than the worked interval.'));
    }
    return {
      clockInAt,
      clockOutAt,
      breakMinutes: exactBreakMinutes,
      actualJobFunctionId,
      actualAreaId,
      breakIntervals: breakIntervals as Array<{ started_at: string; ended_at: string }>,
      reason: reason.trim(),
      isCorrection: Boolean(slot.entryId)
    };
  }

  async function saveNow(): Promise<void> {
    if (busy || !editable) return;
    const values = valuesToSave();
    busy = true;
    try {
      const saved = await onsave(values);
      if (!saved) throw new Error(t('The timesheet entry could not be saved.'));
      baseline = currentState();
    } finally {
      busy = false;
    }
  }

  function discardNow(): void {
    if (!baseline) return;
    clockIn = baseline.clockIn;
    clockOut = baseline.clockOut;
    breakMinutes = baseline.breakMinutes;
    actualJobFunctionId = baseline.actualJobFunctionId;
    actualAreaId = baseline.actualAreaId;
    breaks = baseline.breaks.map((item) => ({ ...item }));
    aggregateBreakNeedsPosition = baseline.aggregateBreakNeedsPosition;
    reason = baseline.reason;
  }

  async function submit() {
    try {
      await saveNow();
    } catch (error) {
      onfeedback(error instanceof Error ? error.message : String(error), 'danger');
    }
  }

  async function cancel() {
    if (busy || !slot.entryId || !editable) return;
    if (reason.trim().length < 3) {
      onfeedback(t('A cancellation reason is required.'), 'danger');
      return;
    }
    busy = true;
    try {
      await oncancel({ reason: reason.trim() });
    } finally {
      busy = false;
    }
  }

  async function openProof() {
    if (proofLoading) return;
    proofLoading = true;
    try {
      proofUrl = await onproof();
    } catch (error) {
      onfeedback(error instanceof Error ? error.message : String(error), 'danger');
    } finally {
      proofLoading = false;
    }
  }
</script>

{#if pendingLeave}
  <div class="leave-decision">
    <div>
      <span>{t('Pending time-off request')}</span>
      <strong>{t('Approve or reject this leave without leaving Timesheet.')}</strong>
    </div>
    <div class="leave-decision__actions">
      <ActionButton
        label={resolvingLeave ? t('Approving…') : t('Approve leave')}
        disabled={resolvingLeave}
        onclick={() => resolveLeave('approve')}
      />
      <ActionButton
        label={t('Reject leave')}
        tone="danger"
        disabled={resolvingLeave}
        onclick={() => resolveLeave('reject')}
      />
    </div>
  </div>
{/if}
{#if unresolvedConflict}
  <FeedbackBanner
    tone="warning"
    message={t('Resolve {reasons} before recording worked time. This prevents payroll from carrying two contradictory truths.', { reasons: slot.truth.conflictReasons.map((reason) => t(reason)).join(` ${t('and')} `) })}
  />
{/if}
<div class="hours-summary" aria-live="polite">
  <span class="hours-summary__kicker">{t('Worked time')}</span>
  <div class="hours-summary__stats">
    <div><span>{t('Gross')}</span><strong>{enteredGrossHours.toFixed(2)}h</strong></div>
    <div><span>{t('Net for payroll')}</span><strong>{enteredNetHours.toFixed(2)}h</strong></div>
  </div>
</div>
<form onsubmit={(event) => { event.preventDefault(); submit(); }}>
  <label><span>{t('Clock in')}</span><input type="datetime-local" bind:value={clockIn} disabled={!editable || busy} /></label>
  <label><span>{t('Clock out')}</span><input type="datetime-local" bind:value={clockOut} disabled={!editable || busy} /></label>
  <fieldset class="payroll-evidence" disabled={!editable || busy || evidenceLoading}>
    <legend>{t('Payroll evidence')}</legend>
    <div class="assignment-grid">
      <label><span>{t('Actual function')}</span><select bind:value={actualJobFunctionId}><option value="">{t('Select function')}</option>{#each jobFunctions.filter((item) => item.active) as item (item.id)}<option value={item.id}>{item.name}</option>{/each}</select></label>
      <label><span>{t('Actual work area')}</span><select bind:value={actualAreaId}><option value="">{t('Select area')}</option>{#each workAreas.filter((item) => item.active) as item (item.id)}<option value={item.id}>{areaName.get(item.id) ?? item.name}</option>{/each}</select></label>
    </div>
    <div class="break-head">
      <div><strong>{t('Exact unpaid breaks')}</strong><small>{t('{minutes} minutes positioned', { minutes: exactBreakMinutes })}</small></div>
      <button type="button" onclick={addBreak}>{t('Add break')}</button>
    </div>
    {#if aggregateBreakNeedsPosition}
      <FeedbackBanner tone="warning" message={t('This entry has {minutes} aggregate break minutes. Add the exact start and end before payroll.', { minutes: breakMinutes })} />
    {/if}
    <div class="break-list">
      {#each breaks as item (item.id)}
        <div class="break-row">
          <label><span>{t('Break start')}</span><input type="datetime-local" value={item.startedAt} oninput={(event) => updateBreak(item.id, 'startedAt', event.currentTarget.value)} /></label>
          <label><span>{t('Break end')}</span><input type="datetime-local" value={item.endedAt} oninput={(event) => updateBreak(item.id, 'endedAt', event.currentTarget.value)} /></label>
          <button type="button" aria-label={t('Remove break')} onclick={() => removeBreak(item.id)}>×</button>
        </div>
      {/each}
    </div>
  </fieldset>
  <label class="reason"><span>{t('Manager reason')}</span><input bind:value={reason} disabled={!editable || busy} /></label>
  {#if slot.proof}
    <div class="proof">
      <span>{t('Proof status')}: <strong>{t(slot.proof)}</strong></span>
      {#if slot.proof === 'Photo captured'}
        {#if proofUrl}
          <ActionButton label={t('Hide proof')} disabled={proofLoading} onclick={() => (proofUrl = '')} />
        {:else}
          <ActionButton label={proofLoading ? t('Opening...') : t('View proof')} disabled={proofLoading} onclick={openProof} />
        {/if}
      {/if}
    </div>
  {/if}
  <div class="form-actions">
    {#if slot.entryId}
      <ActionButton label={t('Cancel entry')} tone="danger" disabled={!editable || busy} onclick={cancel} />
    {/if}
    <ActionButton
      type="submit"
      label={busy ? t('Saving…') : slot.entryId ? t('Save correction') : t('Add entry')}
      tone="primary"
      disabled={!editable || busy}
    />
  </div>
</form>
{#if proofUrl}
  <figure class="proof-preview">
    <figcaption>{t('Private badge proof. This short-lived image link expires automatically.')}</figcaption>
    <img class="proof-image" src={proofUrl} alt={t('Badge proof for {name}', { name: slot.employeeName })} />
  </figure>
{/if}
{#if adjustments.length}
  <div class="adjustments">
    <strong>{t('Correction history')}</strong>
    <div class="trail-line">
      {#each adjustments as adjustment (adjustment.id)}
        {@const previous = adjustment.previous_values as Record<string, unknown>}
        {@const next = adjustment.new_values as Record<string, unknown>}
        <article>
          <i></i>
          <div>
            <strong>{t(adjustment.action.replaceAll('_', ' '))}</strong>
            <p>{adjustment.reason}</p>
            {#if next.clock_in_at}
              <p>
                {instantToLocalInput(String(previous.clock_in_at ?? ''), timezone).replace('T', ' ') || t('No entry')}
                →
                {instantToLocalInput(String(next.clock_in_at), timezone).replace('T', ' ')}
                {#if next.clock_out_at}
                  – {instantToLocalInput(String(next.clock_out_at), timezone).slice(11)}
                {/if}
                · {t('{minutes} min break', { minutes: Number(next.break_minutes ?? 0) })}
              </p>
            {/if}
            <time datetime={adjustment.created_at}>{new Date(adjustment.created_at).toLocaleString(i18n.intlLocale)}</time>
          </div>
        </article>
      {/each}
    </div>
  </div>
{/if}

<style>
  .leave-decision {
    display: grid;
    gap: 10px;
    margin-bottom: 14px;
    padding: 14px 16px;
    border: 1px solid var(--rst-state-warning-border);
    border-radius: var(--rst-ui-radius-md);
    background: var(--rst-state-warning-bg);
  }

  .leave-decision span {
    color: var(--rst-state-warning-text);
    font-size: 10px;
    font-weight: var(--rst-fw-display);
    letter-spacing: 0;
    text-transform: uppercase;
  }

  .leave-decision strong {
    display: block;
    margin-top: 3px;
    color: var(--rst-ui-text);
    font-size: 14px;
  }

  .leave-decision__actions {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }

  /* Reads through the summary-surface tokens rather than raw colours, so a
     design that forbids gradients can flatten it without forking the editor. */
  .hours-summary {
    margin: 14px 14px 0;
    padding: 14px;
    border: 1px solid var(--rst-summary-border);
    border-radius: var(--rst-ui-radius-xl);
    color: var(--rst-summary-text);
    background: var(--rst-summary-bg);
    animation: rst-fade-up .3s var(--rst-ease-out) backwards;
  }
  .hours-summary__kicker { color: var(--rst-summary-kicker); font-size: 10px; font-weight: var(--rst-fw-display); letter-spacing: 0; text-transform: uppercase; }
  .hours-summary__stats { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; margin-top: 8px; }
  .hours-summary__stats div { display: grid; gap: 3px; padding: 10px; border-radius: var(--rst-ui-radius-md); background: var(--rst-summary-tile); }
  .hours-summary__stats span { color: var(--rst-summary-quiet); font-size: 10px; font-weight: var(--rst-fw-bold); text-transform: uppercase; }
  .hours-summary__stats strong { font-size: 18px; }

  form {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 10px;
    padding: 14px;
  }
  form label { display: grid; gap: 5px; }
  form label span {
    color: var(--rst-ui-muted);
    font-size: 10px;
    font-weight: var(--rst-fw-bold);
    text-transform: uppercase;
  }
  form .reason { grid-column: 1 / -1; }
  .payroll-evidence { grid-column: 1 / -1; display: grid; gap: 12px; margin: 2px 0; padding: 13px; border: 1px solid var(--rst-ui-line); border-radius: var(--rst-ui-radius-lg); }
  .payroll-evidence legend { padding: 0 6px; color: var(--rst-ui-text); font-size: 11px; font-weight: var(--rst-fw-display); text-transform: uppercase; }
  .assignment-grid, .break-row { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; }
  .payroll-evidence select { min-height: 39px; padding: 7px 9px; border: 1px solid var(--rst-ui-line); border-radius: var(--rst-ui-radius-md); color: var(--rst-ui-text); background: var(--rst-ui-surface-field-strong); font: inherit; }
  .break-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
  .break-head div { display: grid; gap: 2px; }
  .break-head small { color: var(--rst-ui-muted); }
  .break-head button, .break-row > button { border: 1px solid var(--rst-ui-line); border-radius: var(--rst-ui-radius-md); color: var(--rst-ui-text); background: var(--rst-ui-surface-field-strong); cursor: pointer; }
  .break-head button { min-height: 36px; padding: 7px 11px; }
  .break-list { display: grid; gap: 8px; }
  .break-row { grid-template-columns: repeat(2, minmax(0, 1fr)) 36px; align-items: end; }
  .break-row > button { width: 36px; height: 36px; font-size: 18px; }
  .proof { grid-column: 1 / -1; display: flex; align-items: center; justify-content: space-between; gap: 12px; color: var(--rst-ui-muted); font-size: 11px; }
  .proof-preview {
    margin: 0 14px 14px;
    display: grid;
    gap: 10px;
    padding: 12px;
    border: 1px solid var(--rst-ui-line);
    border-radius: var(--rst-ui-radius-lg);
    background: var(--rst-ui-surface-field);
  }
  .proof-preview figcaption {
    color: var(--rst-ui-muted);
    font-size: 12px;
    line-height: 1.45;
  }
  .proof-image { display: block; width: 100%; max-height: 52vh; object-fit: contain; border-radius: var(--rst-ui-radius-md); background: #000; }

  .adjustments { padding: 4px 14px 14px; border-top: 1px solid var(--rst-ui-divider-soft); }
  .adjustments > strong { display: block; padding: 10px 0; font-size: 11px; text-transform: uppercase; }
  .trail-line { position: relative; display: grid; gap: 10px; padding-left: 8px; }
  .trail-line::before {
    content: '';
    position: absolute;
    top: 8px;
    bottom: 8px;
    left: 17px;
    width: 2px;
    border-radius: var(--rst-ui-radius-pill);
    background: linear-gradient(180deg, var(--rst-ui-action), rgba(240, 100, 35, 0.08));
  }
  .trail-line article { position: relative; display: grid; grid-template-columns: 20px minmax(0, 1fr); gap: 10px; align-items: start; }
  .trail-line article i {
    position: relative;
    z-index: 1;
    width: 20px;
    height: 20px;
    margin-top: 2px;
    border: 3px solid var(--rst-ui-surface-panel);
    border-radius: var(--rst-ui-radius-round);
    background: var(--rst-ui-action);
    box-shadow: 0 0 0 1px rgba(240, 100, 35, 0.32);
  }
  .trail-line article div { padding: 10px; border: 1px solid var(--rst-ui-line); border-radius: var(--rst-ui-radius-lg); background: var(--rst-ui-surface-field); }
  .trail-line article strong { display: block; color: var(--rst-ui-text); font-size: 12px; text-transform: capitalize; }
  .trail-line article p { margin: 3px 0 0; color: var(--rst-ui-muted); font-size: 11px; line-height: 1.4; }
  .trail-line article time { display: block; margin-top: 6px; color: var(--rst-ui-action); font-size: 10px; font-weight: var(--rst-fw-display); letter-spacing: 0; text-transform: uppercase; }

  form input {
    padding: 7px 2px;
    border: 0;
    border-bottom: 1.5px solid var(--rst-ui-line);
    border-radius: 0;
    color: var(--rst-ui-text);
    background: transparent;
    font: inherit;
    transition: border-color .15s ease, box-shadow .15s ease;
  }

  form input:focus-visible {
    border-bottom-color: var(--rst-ui-action);
    outline: none;
    box-shadow: 0 1.5px 0 0 var(--rst-ui-action);
  }
  .form-actions {
    grid-column: 1 / -1;
    display: flex;
    justify-content: flex-end;
    gap: 8px;
  }
  @media (max-width: 760px) {
    form {
      grid-template-columns: 1fr;
    }
    .hours-summary__stats {
      grid-template-columns: 1fr;
    }
    .assignment-grid, .break-row { grid-template-columns: 1fr; }
    .break-row > button { justify-self: end; }
  }
</style>
