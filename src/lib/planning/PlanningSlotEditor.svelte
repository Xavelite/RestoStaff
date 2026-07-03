<script lang="ts">
  import type { ManagerOperationsReadModel } from '$lib/api/workspace-snapshot';
  import ActionButton from '$lib/components/ActionButton.svelte';
  import Dialog from '$lib/components/Dialog.svelte';
  import {
    defaultPlanningShift,
    type PlanningGridSlot,
    type PlanningNoteDraft,
    type PlanningShiftDraft
  } from './planning-model';

  let {
    snapshot,
    slot,
    draft,
    notes,
    editable,
    onchange,
    onnotes,
    oncancelleave,
    onresolveexception
  }: {
    snapshot: ManagerOperationsReadModel;
    slot: PlanningGridSlot;
    draft: PlanningShiftDraft[];
    notes: PlanningNoteDraft[];
    editable: boolean;
    onchange: (draft: PlanningShiftDraft[]) => void;
    onnotes: (notes: PlanningNoteDraft[]) => void;
    oncancelleave: () => Promise<boolean>;
    onresolveexception: (
      action: 'approve' | 'reject' | 'cancel_for_planning'
    ) => Promise<boolean>;
  } = $props();
  let leaveDialogOpen = $state(false);
  let exceptionDialogOpen = $state(false);
  let resolvingLeave = $state(false);
  let resolvingException = $state(false);

  const assignmentPairs = $derived(
    snapshot.coverage_requirements
      .filter((item) => item.active && item.service_key === slot.serviceKey)
      .map((item) => ({
        areaId: item.area_id,
        jobFunctionId: item.job_function_id
      }))
      .filter(
        (item, index, all) =>
          item.areaId &&
          item.jobFunctionId &&
          all.findIndex(
            (candidate) =>
              candidate.areaId === item.areaId &&
              candidate.jobFunctionId === item.jobFunctionId
          ) === index
      )
  );
  const areas = $derived(
    snapshot.work_areas.filter(
      (area) =>
        area.active &&
        assignmentPairs.some((assignment) => assignment.areaId === area.id)
    )
  );
  const jobFunctions = $derived(
    snapshot.job_functions.filter(
      (job) =>
        job.active &&
        assignmentPairs.some(
          (assignment) =>
            assignment.jobFunctionId === job.id &&
            (!slot.shift?.areaId || assignment.areaId === slot.shift.areaId)
        )
    )
  );
  const note = $derived(
    notes.find(
      (item) => item.weekday === slot.weekday && item.serviceKey === slot.serviceKey
    )?.note ?? ''
  );

  function insertShift() {
    if (!editable || slot.shift) return;
    const next = defaultPlanningShift(snapshot, slot);
    if (next) onchange([...draft, next]);
  }

  function addShift() {
    if (slot.context.absence === 'approved') {
      leaveDialogOpen = true;
      return;
    }
    if (slot.context.workPatternException === 'approved') {
      exceptionDialogOpen = true;
      return;
    }
    insertShift();
  }

  async function cancelLeaveAndPlan() {
    resolvingLeave = true;
    try {
      if (await oncancelleave()) {
        leaveDialogOpen = false;
        insertShift();
      }
    } finally {
      resolvingLeave = false;
    }
  }

  async function resolveException(
    action: 'approve' | 'reject' | 'cancel_for_planning'
  ) {
    resolvingException = true;
    try {
      const resolved = await onresolveexception(action);
      if (resolved && action === 'cancel_for_planning') {
        exceptionDialogOpen = false;
        insertShift();
      }
    } finally {
      resolvingException = false;
    }
  }

  function removeShift() {
    if (!editable || !slot.shift) return;
    onchange(draft.filter((shift) => shift !== slot.shift));
  }

  function updateShift(
    field: 'areaId' | 'jobFunctionId' | 'startsAt' | 'endsAt',
    value: string
  ) {
    const nextValue =
      field === 'areaId'
        ? {
            areaId: value,
            jobFunctionId:
              assignmentPairs.find(
                (assignment) =>
                  assignment.areaId === value &&
                  assignment.jobFunctionId === slot.shift?.jobFunctionId
              )?.jobFunctionId ??
              assignmentPairs.find((assignment) => assignment.areaId === value)
                ?.jobFunctionId ??
              ''
          }
        : { [field]: value };
    onchange(
      draft.map((shift) =>
        shift === slot.shift ? { ...shift, ...nextValue } : shift
      )
    );
  }

  function updateNote(value: string) {
    const remaining = notes.filter(
      (item) => !(item.weekday === slot.weekday && item.serviceKey === slot.serviceKey)
    );
    onnotes(
      value.trim()
        ? [
            ...remaining,
            { weekday: slot.weekday, serviceKey: slot.serviceKey, note: value }
          ]
        : remaining
    );
  }
</script>

<div class="editor">
    <div class="context-chips">
      <div class={`context-chip is-${slot.context.availability}`}>
        <span>Availability</span>
        <strong>{slot.context.availability}</strong>
      </div>
      <div class={`context-chip is-${slot.context.absence || 'none'}`}>
        <span>Leave</span>
        <strong>{slot.context.absence || 'none'}</strong>
      </div>
      <div class={`context-chip is-${slot.context.workPatternException || 'none'}`}>
        <span>Schedule change</span>
        <strong>{slot.context.workPatternException || 'none'}</strong>
      </div>
    </div>
    {#if slot.context.workPatternException === 'pending'}
      <div class="context-actions">
        <ActionButton
          label="Approve exception"
          disabled={resolvingException}
          onclick={() => resolveException('approve')}
        />
        <ActionButton
          label="Reject exception"
          tone="danger"
          disabled={resolvingException}
          onclick={() => resolveException('reject')}
        />
      </div>
    {/if}

    {#if slot.shift}
      <div class="fields">
        <label>Area<select disabled={!editable} value={slot.shift.areaId} onchange={(event) => updateShift('areaId', event.currentTarget.value)}><option value="">No area</option>{#each areas as area (area.id)}<option value={area.id}>{area.name}</option>{/each}</select></label>
        <label>Job function<select disabled={!editable} value={slot.shift.jobFunctionId} onchange={(event) => updateShift('jobFunctionId', event.currentTarget.value)}><option value="">Not assigned</option>{#each jobFunctions as job (job.id)}<option value={job.id}>{job.name}</option>{/each}</select></label>
        <label>Starts<input type="time" disabled={!editable} value={slot.shift.startsAt} onchange={(event) => updateShift('startsAt', event.currentTarget.value)} /></label>
        <label>Ends<input type="time" disabled={!editable} value={slot.shift.endsAt} onchange={(event) => updateShift('endsAt', event.currentTarget.value)} /></label>
      </div>
      <div class="actions"><ActionButton label="Remove shift" tone="danger" disabled={!editable} onclick={removeShift} /></div>
    {:else}
      <div class="empty">
        <p>{assignmentPairs.length ? 'No shift is planned for this slot.' : 'Configure an area-position assignment for this service before planning.'}</p>
        <ActionButton label="Plan shift" tone="primary" disabled={!editable || !assignmentPairs.length} onclick={addShift} />
      </div>
    {/if}

    <label class="note">Service note<input disabled={!editable} value={note} oninput={(event) => updateNote(event.currentTarget.value)} placeholder="Optional note for this service" /></label>
</div>

{#snippet leaveFooter()}
  <ActionButton label="Keep leave" disabled={resolvingLeave} onclick={() => (leaveDialogOpen = false)} />
  <ActionButton label="Plan as conflict" disabled={resolvingLeave} onclick={() => { leaveDialogOpen = false; insertShift(); }} />
  <ActionButton label={resolvingLeave ? 'Cancelling…' : 'Cancel leave and plan'} tone="danger" disabled={resolvingLeave} onclick={cancelLeaveAndPlan} />
{/snippet}

<Dialog
  open={leaveDialogOpen}
  title="Approved leave overlaps this shift"
  description="Choose explicitly how Planning should handle the employee's approved leave."
  size="small"
  onclose={() => !resolvingLeave && (leaveDialogOpen = false)}
  footer={leaveFooter}
>
  <p class="leave-copy">
    Keeping the leave makes no planning change. Planning as a conflict is visible
    in the draft but cannot be published. Cancelling the leave records an audited
    planning cancellation before adding the shift.
  </p>
</Dialog>

{#snippet exceptionFooter()}
  <ActionButton
    label="Keep exception"
    disabled={resolvingException}
    onclick={() => (exceptionDialogOpen = false)}
  />
  <ActionButton
    label="Plan as conflict"
    disabled={resolvingException}
    onclick={() => {
      exceptionDialogOpen = false;
      insertShift();
    }}
  />
  <ActionButton
    label={resolvingException ? 'Cancelling…' : 'Cancel exception and plan'}
    tone="danger"
    disabled={resolvingException}
    onclick={() => resolveException('cancel_for_planning')}
  />
{/snippet}

<Dialog
  open={exceptionDialogOpen}
  title="Approved fixed-schedule change overlaps this shift"
  description="Choose explicitly how Planning should handle this one-off unavailability."
  size="small"
  onclose={() => !resolvingException && (exceptionDialogOpen = false)}
  footer={exceptionFooter}
>
  <p class="leave-copy">
    Keeping the exception makes no planning change. Planning as a conflict
    remains visible but cannot be published. Cancelling the exception records
    an audited planning decision before adding the shift.
  </p>
</Dialog>

<style>
  .editor { display: grid; gap: 14px; padding: 14px; }
  .context-chips { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px; }
  .context-chip {
    display: grid;
    gap: 3px;
    padding: 10px;
    border: 1px solid var(--rst-ui-line);
    border-radius: var(--rst-ui-radius-lg);
    background: var(--rst-ui-surface-field);
    animation: rst-fade-up .3s var(--rst-ease-out) backwards;
  }
  .context-chip span { color: var(--rst-ui-muted); font-size: 9px; font-weight: var(--rst-fw-bold); letter-spacing: .04em; text-transform: uppercase; }
  .context-chip strong { font-size: 13px; text-transform: capitalize; }
  .context-chip.is-available,
  .context-chip.is-none {
    border-color: rgba(var(--rst-state-success-rgb), .28);
    background: linear-gradient(135deg, rgba(var(--rst-state-success-rgb), .12), transparent 60%), var(--rst-ui-surface-field);
  }
  .context-chip.is-available strong, .context-chip.is-none strong { color: var(--rst-state-success-text); }
  .context-chip.is-partial,
  .context-chip.is-pending {
    border-color: rgba(var(--rst-state-warning-rgb), .28);
    background: linear-gradient(135deg, rgba(var(--rst-state-warning-rgb), .12), transparent 60%), var(--rst-ui-surface-field);
  }
  .context-chip.is-partial strong, .context-chip.is-pending strong { color: var(--rst-state-warning-text); }
  .context-chip.is-unavailable,
  .context-chip.is-approved {
    border-color: rgba(var(--rst-state-danger-rgb), .28);
    background: linear-gradient(135deg, rgba(var(--rst-state-danger-rgb), .12), transparent 60%), var(--rst-ui-surface-field);
  }
  .context-chip.is-unavailable strong, .context-chip.is-approved strong { color: var(--rst-state-danger-text); }
  .context-actions { display: flex; justify-content: flex-end; gap: 6px; }
  .fields { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 10px; }
  label { display: grid; gap: 5px; color: var(--rst-ui-muted); font-size: 10px; font-weight: var(--rst-fw-bold); text-transform: uppercase; }
  input, select { min-width: 0; min-height: 36px; padding: 6px 2px; border: 0; border-bottom: 1.5px solid var(--rst-ui-line); border-radius: 0; color: var(--rst-ui-text); background: transparent; font: inherit; font-size: 12px; transition: border-color .15s ease, box-shadow .15s ease; }
  input:focus-visible, select:focus-visible { border-bottom-color: var(--rst-ui-action); outline: none; box-shadow: 0 1.5px 0 0 var(--rst-ui-action); }
  .actions { display: flex; justify-content: flex-end; }
  .empty { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 12px; border: 1px dashed var(--rst-ui-line); border-radius: var(--rst-ui-radius-md); }
  .empty p { margin: 0; color: var(--rst-ui-muted); }
  .leave-copy { margin: 0; color: var(--rst-ui-muted); font-size: 13px; line-height: 1.55; }
  @media (max-width: 980px) { .fields { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
  @media (max-width: 520px) { .fields { grid-template-columns: 1fr; } .empty { align-items: stretch; flex-direction: column; } .context-chips { grid-template-columns: 1fr; } }
</style>
