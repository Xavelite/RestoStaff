<script lang="ts">
  import type { ManagerOperationsReadModel } from '$lib/api/workspace-snapshot';
  import { formatHours, hoursBetweenClocks, serviceLabel } from '$lib/calendar/date';
  import WorkspaceServiceIcon from '$lib/workspace-ui/WorkspaceServiceIcon.svelte';
  import { i18n, t } from '$lib/i18n/i18n.svelte';
  import { workspace } from '$lib/workspace/workspace.svelte';
  import { areaInstanceLabelMap } from '$lib/restaurant/area-instance';
  import {
    blocksPlanningAssignment,
    defaultPlanningShift,
    planningAssignmentOptions,
    type PlanningGridSlot,
    type PlanningNoteDraft,
    type PlanningShiftDraft
  } from './schedule-model';

  let {
    snapshot,
    slot,
    draft,
    notes,
    editable,
    onchange,
    onnotes,
    oncancelleave,
    onresolveleave,
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
    onresolveleave: (action: 'approve' | 'reject') => Promise<boolean>;
    onresolveexception: (
      action: 'approve' | 'reject' | 'cancel_for_planning'
    ) => Promise<boolean>;
  } = $props();
  let resolvingLeave = $state(false);
  let resolvingException = $state(false);
  const hasLeaveBlocker = $derived(
    slot.context.absence === 'approved' || slot.context.absence === 'pending'
  );
  const hasExceptionBlocker = $derived(
    slot.context.workPatternException === 'approved' ||
      slot.context.workPatternException === 'pending'
  );
  const leaveStateLabel = $derived(
    t(slot.context.absence === 'pending' ? 'pending leave request' : 'approved leave')
  );
  const exceptionStateLabel = $derived(
    t(slot.context.workPatternException === 'pending'
      ? 'pending schedule change'
      : 'approved schedule change')
  );
  const planningBlockerLabel = $derived(
    hasLeaveBlocker
      ? leaveStateLabel
      : hasExceptionBlocker
        ? exceptionStateLabel
        : ''
  );
  const addShiftLabel = $derived(
    t(hasLeaveBlocker
      ? 'Review leave before scheduling'
      : hasExceptionBlocker
        ? 'Review schedule change before scheduling'
        : 'Plan shift')
  );

  const assignmentPairs = $derived(
    planningAssignmentOptions(snapshot, slot.employeeId, slot.serviceKey)
  );
  const emptySlotCopy = $derived(
    !assignmentPairs.length
      ? t('Create at least one active area and position before scheduling.')
      : planningBlockerLabel
        ? t('This slot has {blocker}. Review it before scheduling.', { blocker: planningBlockerLabel })
        : t('No shift is planned for this slot.')
  );
  const areas = $derived(
    snapshot.work_areas.filter(
      (area) =>
        area.active &&
        assignmentPairs.some((assignment) => assignment.areaId === area.id)
    )
  );
  const areaName = $derived(areaInstanceLabelMap(snapshot.work_areas));
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
  const shiftHours = $derived(
    slot.shift ? hoursBetweenClocks(slot.shift.startsAt, slot.shift.endsAt) : 0
  );
  const hourlyCost = $derived(
    Number(
      snapshot.employee_payroll_profiles.find((item) => item.employee_id === slot.employeeId)
        ?.estimated_hourly_cost
    ) ||
      Number(
        snapshot.job_functions.find((item) => item.id === slot.shift?.jobFunctionId)
          ?.estimated_hourly_cost
      ) ||
      0
  );
  const estimatedCost = $derived(shiftHours * hourlyCost);

  function money(value: number): string {
    return new Intl.NumberFormat(i18n.intlLocale, {
      style: 'currency',
      currency: snapshot.restaurant_settings.currency_code || 'EUR',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(value);
  }

  function insertShift() {
    if (!editable || slot.shift) return;
    const next = defaultPlanningShift(snapshot, slot);
    if (next) onchange([...draft, next]);
  }

  function addShift() {
    if (blocksPlanningAssignment(slot.context)) return;
    insertShift();
  }

  async function cancelLeaveAndPlan() {
    resolvingLeave = true;
    try {
      if (await oncancelleave()) {
        insertShift();
      }
    } finally {
      resolvingLeave = false;
    }
  }

  async function resolveLeave(action: 'approve' | 'reject') {
    resolvingLeave = true;
    try {
      await onresolveleave(action);
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
  <section class="context-strip" aria-label={t('Schedule details')}>
    <div class="context-item is-{slot.context.availability}">
      <i></i>
      <span>{t('Availability')}</span>
      <strong>{t(slot.context.availability)}</strong>
    </div>
    <div class="context-item is-{slot.context.absence || 'none'}">
      <i></i>
      <span>{t('Leave')}</span>
      <strong>{t(slot.context.absence || 'none')}</strong>
    </div>
    <div class="context-item is-{slot.context.workPatternException || 'none'}">
      <i></i>
      <span>{t('Schedule change')}</span>
      <strong>{t(slot.context.workPatternException || 'none')}</strong>
    </div>
  </section>

  {#if slot.context.absence === 'pending'}
    <div class="context-actions">
      <button class="editor-btn" type="button" disabled={resolvingLeave} onclick={() => resolveLeave('approve')}>
        {t(resolvingLeave ? 'Approving…' : 'Approve leave')}
      </button>
      <button class="editor-btn is-danger" type="button" disabled={resolvingLeave} onclick={() => resolveLeave('reject')}>
        {t('Reject leave')}
      </button>
    </div>
  {/if}
  {#if slot.context.workPatternException === 'pending'}
    <div class="context-actions">
      <button class="editor-btn" type="button" disabled={resolvingException} onclick={() => resolveException('approve')}>
        {t('Approve exception')}
      </button>
      <button class="editor-btn is-danger" type="button" disabled={resolvingException} onclick={() => resolveException('reject')}>
        {t('Reject exception')}
      </button>
    </div>
  {/if}

  {#if slot.shift}
    <section class="shift-editor">
      <header class="shift-summary">
        <span class="shift-summary__icon is-{slot.serviceKey}">
          <WorkspaceServiceIcon service={slot.serviceKey} size={18} />
        </span>
        <span class="shift-summary__range">
          <small>{t(serviceLabel(slot.serviceKey))}</small>
          <strong>{slot.shift.startsAt}–{slot.shift.endsAt}</strong>
        </span>
        <span class="shift-summary__metric">
          <small>{t('Planned hours')}</small>
          <strong>{formatHours(shiftHours)}</strong>
        </span>
        {#if workspace.canViewFinancials}
          <span class="shift-summary__metric">
            <small>{t('Estimated cost')}</small>
            <strong>{estimatedCost > 0 ? `~${money(estimatedCost)}` : '—'}</strong>
          </span>
        {/if}
      </header>

      <div class="fields">
        <label>
          <span>{t('Area')}</span>
          <select disabled={!editable} value={slot.shift.areaId} onchange={(event) => updateShift('areaId', event.currentTarget.value)}>
            <option value="">{t('No area')}</option>
            {#each areas as area (area.id)}<option value={area.id}>{areaName.get(area.id) ?? area.name}</option>{/each}
          </select>
        </label>
        <label>
          <span>{t('Job function')}</span>
          <select disabled={!editable} value={slot.shift.jobFunctionId} onchange={(event) => updateShift('jobFunctionId', event.currentTarget.value)}>
            <option value="">{t('Not assigned')}</option>
            {#each jobFunctions as job (job.id)}<option value={job.id}>{job.name}</option>{/each}
          </select>
        </label>
        <label>
          <span>{t('Starts')}</span>
          <input type="time" disabled={!editable} value={slot.shift.startsAt} onchange={(event) => updateShift('startsAt', event.currentTarget.value)} />
        </label>
        <label>
          <span>{t('Ends')}</span>
          <input type="time" disabled={!editable} value={slot.shift.endsAt} onchange={(event) => updateShift('endsAt', event.currentTarget.value)} />
        </label>
      </div>

      <label class="note">
        <span>{t('Service note')}</span>
        <input disabled={!editable} value={note} oninput={(event) => updateNote(event.currentTarget.value)} placeholder={t('Optional note for this service')} />
      </label>

      <div class="editor-actions">
        <button class="editor-btn is-danger is-quiet" type="button" disabled={!editable} onclick={removeShift}>{t('Remove shift')}</button>
      </div>
    </section>
  {:else}
    <section class="empty">
      <p>{emptySlotCopy}</p>
      {#if hasLeaveBlocker}
        <div class="decision-card is-leave">
          <span>{leaveStateLabel}</span>
          <strong>{t('Leave stays unless you cancel it for scheduling.')}</strong>
          <p>{t('Cancelling records an audited scheduling decision before the shift is added, so Schedule never silently overlaps requested or approved time off.')}</p>
          <button class="editor-btn is-danger" type="button" disabled={!editable || resolvingLeave} onclick={cancelLeaveAndPlan}>
            {t(resolvingLeave ? 'Cancelling...' : 'Cancel leave and plan')}
          </button>
        </div>
      {:else if hasExceptionBlocker}
        <div class="decision-card is-exception">
          <span>{exceptionStateLabel}</span>
          <strong>{t('Schedule change stays unless you cancel it for scheduling.')}</strong>
          <p>{t('Cancelling records an audited scheduling decision before the shift is added, so Schedule never silently overlaps a schedule-change request.')}</p>
          <button class="editor-btn is-danger" type="button" disabled={!editable || resolvingException} onclick={() => resolveException('cancel_for_planning')}>
            {t(resolvingException ? 'Cancelling...' : 'Cancel change and plan')}
          </button>
        </div>
      {:else}
        <button class="editor-btn is-primary" type="button" disabled={!editable || !assignmentPairs.length} onclick={addShift}>{addShiftLabel}</button>
      {/if}
      <label class="note">
        <span>{t('Service note')}</span>
        <input disabled={!editable} value={note} oninput={(event) => updateNote(event.currentTarget.value)} placeholder={t('Optional note for this service')} />
      </label>
    </section>
  {/if}
</div>

<style>
  .editor { display: grid; color: var(--cl-ink); background: var(--cl-surface); }
  .context-strip { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); border-bottom: 1px solid var(--cl-line); background: var(--cl-thead); }
  .context-item { --context-tone: var(--cl-muted); min-width: 0; display: grid; grid-template-columns: 8px minmax(0, 1fr); align-items: center; gap: 2px 6px; padding: 9px 12px; border-right: 1px solid var(--cl-line); }
  .context-item:last-child { border-right: 0; }
  .context-item i { grid-row: 1 / 3; width: 7px; height: 7px; border-radius: 50%; background: var(--context-tone); box-shadow: 0 0 0 3px color-mix(in srgb, var(--context-tone) 12%, transparent); }
  .context-item span { overflow: hidden; color: var(--cl-muted); font-size: 8.5px; font-weight: var(--rst-fw-bold); text-overflow: ellipsis; text-transform: uppercase; white-space: nowrap; }
  .context-item strong { overflow: hidden; color: var(--context-tone); font-size: 11px; font-weight: var(--rst-fw-bold); text-overflow: ellipsis; text-transform: capitalize; white-space: nowrap; }
  .context-item.is-available,
  .context-item.is-none { --context-tone: var(--cl-ok); }
  .context-item.is-partial,
  .context-item.is-pending { --context-tone: var(--cl-attention); }
  .context-item.is-unavailable,
  .context-item.is-approved,
  .context-item.is-missing { --context-tone: var(--cl-problem); }
  .context-actions { display: flex; justify-content: flex-end; gap: 7px; padding: 9px 14px; border-bottom: 1px solid var(--cl-line); background: color-mix(in srgb, var(--cl-attention) 6%, var(--cl-surface)); }

  .shift-editor { display: grid; gap: 15px; padding: 15px 16px 14px; }
  .shift-summary { display: grid; grid-template-columns: 36px minmax(0, 1fr) auto auto; align-items: center; gap: 12px; padding: 10px 12px; border: 1px solid var(--cl-line); border-radius: 5px; background: var(--cl-surface-muted); }
  .shift-summary__icon { width: 34px; height: 34px; display: grid; place-items: center; border-radius: 50%; }
  .shift-summary__icon.is-lunch { color: var(--cl-lunch); background: var(--cl-lunch-wash); }
  .shift-summary__icon.is-evening { color: var(--cl-evening); background: var(--cl-evening-wash); }
  .shift-summary__range,
  .shift-summary__metric { display: grid; gap: 2px; }
  .shift-summary small { color: var(--cl-muted); font-size: 8.5px; font-weight: var(--rst-fw-bold); text-transform: uppercase; }
  .shift-summary strong { color: var(--cl-ink); font-size: 12px; font-variant-numeric: tabular-nums; }
  .shift-summary__metric { min-width: 72px; padding-left: 12px; border-left: 1px solid var(--cl-line); }
  .shift-summary__metric strong { text-align: right; }

  .fields { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 11px 12px; }
  label { min-width: 0; display: grid; gap: 5px; color: var(--cl-muted); font-size: 9.5px; font-weight: var(--rst-fw-bold); text-transform: uppercase; }
  input, select { min-width: 0; min-height: 37px; padding: 7px 9px; border: 1px solid var(--cl-line-strong); border-radius: 4px; color: var(--cl-ink); background: var(--cl-surface); font: inherit; font-size: 12px; transition: border-color var(--cl-dur) var(--cl-ease), box-shadow var(--cl-dur) var(--cl-ease); }
  input:focus-visible, select:focus-visible { border-color: var(--cl-accent); outline: none; box-shadow: 0 0 0 2px color-mix(in srgb, var(--cl-accent) 13%, transparent); }
  input:disabled, select:disabled { color: var(--cl-muted); background: var(--cl-surface-muted); }
  .note { padding-top: 2px; }
  .editor-actions { display: flex; justify-content: flex-start; padding-top: 2px; border-top: 1px solid var(--cl-line); }

  .editor-btn { min-height: 34px; display: inline-flex; align-items: center; justify-content: center; justify-self: start; padding: 7px 12px; border: 1px solid var(--cl-line-strong); border-radius: 5px; color: var(--cl-ink); background: var(--cl-surface); font: inherit; font-size: 11.5px; font-weight: var(--rst-fw-bold); cursor: pointer; }
  .editor-btn:hover:not(:disabled) { border-color: var(--cl-ink); background: var(--cl-surface-muted); }
  .editor-btn.is-primary { border-color: var(--cl-accent); color: white; background: var(--cl-accent); }
  .editor-btn.is-danger { border-color: color-mix(in srgb, var(--cl-problem) 31%, var(--cl-line)); color: var(--cl-problem); background: var(--cl-problem-wash); }
  .editor-btn.is-quiet { border-color: transparent; background: transparent; }
  .editor-btn:disabled { opacity: .48; cursor: default; }

  .empty { display: grid; gap: 13px; padding: 16px; }
  .empty > p { margin: 0; color: var(--cl-muted); font-size: 12px; line-height: 1.5; }
  .decision-card { display: grid; gap: 7px; padding: 12px; border: 1px solid var(--cl-attention-line); border-radius: 5px; background: var(--cl-attention-wash); }
  .decision-card.is-leave { border-color: var(--cl-problem-line); background: var(--cl-problem-wash); }
  .decision-card > span { color: var(--cl-muted); font-size: 9px; font-weight: var(--rst-fw-bold); text-transform: uppercase; }
  .decision-card strong { font-size: 12px; }
  .decision-card p { margin: 0; color: var(--cl-muted); font-size: 11.5px; line-height: 1.45; }
  .decision-card .editor-btn { justify-self: end; margin-top: 2px; }

  @media (max-width: 520px) {
    .context-strip { grid-template-columns: 1fr; }
    .context-item { border-right: 0; border-bottom: 1px solid var(--cl-line); }
    .context-item:last-child { border-bottom: 0; }
    .shift-summary { grid-template-columns: 34px minmax(0, 1fr); }
    .shift-summary__metric { padding-left: 0; border-left: 0; }
    .shift-summary__metric strong { text-align: left; }
    .fields { grid-template-columns: 1fr; }
  }
</style>
