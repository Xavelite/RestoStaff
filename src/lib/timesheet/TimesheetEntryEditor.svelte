<script lang="ts">
  import type { ManagerOperationsReadModel } from '$lib/api/workspace-snapshot';
  import type { ActualSlot } from '$lib/timesheet/timesheet-model';
  import { instantToLocalInput, localInputToInstant } from '$lib/calendar/date';
  import ActionButton from '$lib/components/ActionButton.svelte';
  import FeedbackBanner from '$lib/components/FeedbackBanner.svelte';
  import { i18n, t } from '$lib/i18n/i18n.svelte';

  type FeedbackTone = 'info' | 'success' | 'warning' | 'danger';
  type ActualsEntrySave = {
    clockInAt: string;
    clockOutAt: string;
    breakMinutes: number;
    reason: string;
    isCorrection: boolean;
  };

  // Content of the Timesheet entry drawer. Owns the manual/correction form, its
  // client-side validation and the badge-proof view; the page owns the drawer
  // shell and performs the audited Timesheet mutation through the callbacks.
  let {
    slot,
    timezone,
    editable,
    adjustments,
    onsave,
    oncancel,
    onproof,
    onfeedback
  }: {
    slot: ActualSlot;
    timezone: string;
    editable: boolean;
    adjustments: ManagerOperationsReadModel['time_entry_adjustments'];
    onsave: (values: ActualsEntrySave) => Promise<boolean>;
    oncancel: (values: { reason: string }) => Promise<boolean>;
    onproof: () => Promise<string>;
    onfeedback: (message: string, tone: FeedbackTone) => void;
  } = $props();

  let clockIn = $state('');
  let clockOut = $state('');
  let breakMinutes = $state(0);
  let reason = $state('');
  let busy = $state(false);
  let proofUrl = $state('');
  let proofLoading = $state(false);

  const enteredGrossHours = $derived(
    clockIn && clockOut
      ? Math.max(0, (new Date(clockOut).getTime() - new Date(clockIn).getTime()) / 3_600_000)
      : 0
  );
  const enteredNetHours = $derived(
    Math.max(0, enteredGrossHours - Math.max(0, Number(breakMinutes) || 0) / 60)
  );
  const unresolvedConflict = $derived(slot.status === 'conflict' && !slot.entryId);

  $effect(() => {
    clockIn =
      instantToLocalInput(slot.clockInAt, timezone) ||
      `${slot.date}T${slot.serviceKey === 'lunch' ? '12:00' : '18:00'}`;
    clockOut =
      instantToLocalInput(slot.clockOutAt, timezone) ||
      (slot.plannedRange ? `${slot.date}T${slot.plannedRange.slice(-5)}` : '');
    breakMinutes = slot.breakMinutes;
    reason = slot.entryId ? 'Manager correction' : 'Unplanned manual entry';
  });

  async function submit() {
    if (busy || !editable) return;
    if (!clockIn || reason.trim().length < 3) {
      onfeedback(t('Clock-in and a manager reason are required.'), 'danger');
      return;
    }
    const clockInAt = localInputToInstant(clockIn, timezone);
    const clockOutAt = clockOut ? localInputToInstant(clockOut, timezone) : '';
    if (!clockInAt || (clockOut && !clockOutAt)) {
      onfeedback(t('Enter valid restaurant-local times.'), 'danger');
      return;
    }
    if (clockOutAt && new Date(clockOutAt) <= new Date(clockInAt)) {
      onfeedback(t('Clock-out must be after clock-in.'), 'danger');
      return;
    }
    if (!Number.isInteger(Number(breakMinutes)) || Number(breakMinutes) < 0) {
      onfeedback(t('Break must be a whole number of minutes.'), 'danger');
      return;
    }
    if (!clockOutAt && Number(breakMinutes) > 0) {
      onfeedback(t('Add a clock-out before recording a break.'), 'danger');
      return;
    }
    if (clockOutAt && Number(breakMinutes) >= enteredGrossHours * 60) {
      onfeedback(t('Break must be shorter than the worked interval.'), 'danger');
      return;
    }
    busy = true;
    try {
      await onsave({
        clockInAt,
        clockOutAt,
        breakMinutes: Number(breakMinutes),
        reason: reason.trim(),
        isCorrection: Boolean(slot.entryId)
      });
    } finally {
      busy = false;
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
  <label><span>{t('Unpaid break (minutes)')}</span><input type="number" min="0" step="1" bind:value={breakMinutes} disabled={!editable || busy} /></label>
  <label class="reason"><span>{t('Manager reason')}</span><input bind:value={reason} disabled={!editable || busy} /></label>
  {#if slot.proof}
    <div class="proof">
      <span>{t('Proof status')}: <strong>{t(slot.proof)}</strong></span>
      {#if slot.proof === 'Photo captured'}
        {#if proofUrl}
          <ActionButton label="Hide proof" disabled={proofLoading} onclick={() => (proofUrl = '')} />
        {:else}
          <ActionButton label={proofLoading ? 'Opening...' : 'View proof'} disabled={proofLoading} onclick={openProof} />
        {/if}
      {/if}
    </div>
  {/if}
  <div class="form-actions">
    {#if slot.entryId}
      <ActionButton label="Cancel entry" tone="danger" disabled={!editable || busy} onclick={cancel} />
    {/if}
    <ActionButton
      type="submit"
      label={busy ? 'Saving…' : slot.entryId ? 'Save correction' : 'Add entry'}
      tone="primary"
      disabled={!editable || busy}
    />
  </div>
</form>
{#if proofUrl}
  <figure class="proof-preview">
    <figcaption>{t('Private badge proof. This short-lived image link expires automatically.')}</figcaption>
    <img class="proof-image" src={proofUrl} alt={`Badge proof for ${slot.employeeName}`} />
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
                {instantToLocalInput(String(previous.clock_in_at ?? ''), timezone).replace('T', ' ') || 'No entry'}
                →
                {instantToLocalInput(String(next.clock_in_at), timezone).replace('T', ' ')}
                {#if next.clock_out_at}
                  – {instantToLocalInput(String(next.clock_out_at), timezone).slice(11)}
                {/if}
                · {Number(next.break_minutes ?? 0)} min break
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
  .hours-summary {
    margin: 14px 14px 0;
    padding: 14px;
    border-radius: var(--rst-ui-radius-xl);
    color: #fffaf2;
    background:
      radial-gradient(circle at 92% 10%, rgba(66, 216, 132, 0.28), transparent 36%),
      linear-gradient(145deg, #111b28, #123324);
    animation: rst-fade-up .3s var(--rst-ease-out) backwards;
  }
  .hours-summary__kicker { color: var(--rst-green); font-size: 10px; font-weight: var(--rst-fw-display); letter-spacing: .08em; text-transform: uppercase; }
  .hours-summary__stats { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; margin-top: 8px; }
  .hours-summary__stats div { display: grid; gap: 3px; padding: 10px; border-radius: var(--rst-ui-radius-md); background: rgba(255, 255, 255, .08); }
  .hours-summary__stats span { color: rgba(255, 250, 242, .6); font-size: 10px; font-weight: var(--rst-fw-bold); text-transform: uppercase; }
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
  .trail-line article time { display: block; margin-top: 6px; color: var(--rst-ui-action); font-size: 10px; font-weight: var(--rst-fw-display); letter-spacing: .06em; text-transform: uppercase; }

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
  }
</style>
