<script lang="ts">
  import Dialog from '$lib/components/Dialog.svelte';
  import StatusPill from '$lib/components/StatusPill.svelte';
  import ActionButton from '$lib/components/ActionButton.svelte';
  import { serviceLabel } from '$lib/calendar/date';
  import {
    instantClockLabel,
    serviceSlotStateLabel,
    type ServiceSlotTruth
  } from '$lib/calendar/service-slot';
  import {
    defaultEmployeeTimeOffType,
    employeeSlotActionReason,
    employeeTimeOffTypes
  } from '$lib/employee/employee-self-service';
  import type { EmployeeOperationsReadModel } from '$lib/api/workspace-snapshot';
  import {
    SELECTABLE_AVAILABILITY,
    availabilityUpdateHint,
    type AvailabilityMode
  } from '$lib/employee/employee-model';
  import { t } from '$lib/i18n/i18n.svelte';

  // One surface for viewing a service's truth and acting on it — replaces the
  // old split between a read-only details dialog and a page-level mode toggle
  // that decided what a tap meant. Every action offered here is exactly what
  // employeeSlotAction/employeeSlotActionReason already allow for this slot.
  let {
    open,
    truth,
    policy,
    today,
    timezone,
    availabilityState,
    isTimeOffSelected,
    isChangeSelected,
    services = [],
    absenceTypes = [],
    absenceTypeId = $bindable(),
    comment = $bindable(),
    saving = false,
    onclose,
    onSetAvailability,
    onRequestTimeOff,
    onCancelAbsence,
    onCancelChange
  }: {
    open: boolean;
    truth: ServiceSlotTruth | null;
    policy: AvailabilityMode;
    today: string;
    timezone: string;
    availabilityState: '' | 'available' | 'partial' | 'unavailable';
    isTimeOffSelected: boolean;
    isChangeSelected: boolean;
    services?: EmployeeOperationsReadModel['services'];
    absenceTypes?: EmployeeOperationsReadModel['absence_types'];
    absenceTypeId: string;
    comment: string;
    saving?: boolean;
    onclose: () => void;
    onSetAvailability: (state: '' | 'available' | 'partial' | 'unavailable') => void;
    onRequestTimeOff: () => void;
    onCancelAbsence: (absenceId: string) => void;
    onCancelChange: (workPatternExceptionId: string) => void;
  } = $props();

  // Employees positively declare availability. Leaving a service unselected
  // is neutral; time off remains a separate, audited request.
  const availabilityHint = $derived(availabilityUpdateHint(availabilityState));

  const availabilityBlocked = $derived(
    truth ? employeeSlotActionReason({ truth, policy, mode: 'availability', today }) : ''
  );
  const timeOffBlocked = $derived(
    truth ? employeeSlotActionReason({ truth, policy, mode: 'time_off', today }) : ''
  );
  const pendingAbsence = $derived(truth?.absence?.status === 'pending' ? truth.absence : null);
  const pendingChange = $derived(
    truth?.workPatternException?.status === 'pending' ? truth.workPatternException : null
  );
  const defaultType = $derived(defaultEmployeeTimeOffType(absenceTypes));
  const timeOffTypes = $derived(employeeTimeOffTypes(absenceTypes));
  $effect(() => {
    if (open && defaultType && !absenceTypeId) absenceTypeId = defaultType.id;
  });
  const stateTone = $derived.by(() => {
    if (!truth) return 'neutral' as const;
    if (truth.state === 'worked' || truth.state === 'live' || truth.state === 'available') return 'success' as const;
    if (truth.state === 'planned') return 'info' as const;
    if (truth.state === 'leave_approved') return 'absence' as const;
    if (truth.state === 'work_pattern_approved') return 'danger' as const;
    if (['missing_badge', 'corrected', 'leave_pending', 'work_pattern_pending'].includes(truth.state)) return 'warning' as const;
    if (truth.state === 'conflict') return 'danger' as const;
    return 'neutral' as const;
  });
</script>

<Dialog
  open={open && Boolean(truth)}
  title={truth ? `${t(serviceLabel(truth.serviceKey, services))} · ${truth.date}` : t('Service details')}
  description={t('Your schedule, worked time and requests for this service.')}
  size="large"
  {onclose}
>
  {#if truth}
    <div class="slot-dialog">
      <div class="slot-summary">
        <StatusPill label={serviceSlotStateLabel(truth.state)} tone={stateTone} />
        {#if truth.plan}
          <div class="fact">
            <strong>{truth.plan.startsAt}–{truth.plan.endsAt}</strong>
            <span>{truth.plan.area}</span>
          </div>
        {:else}
          <p class="muted">{t('No published shift for this service.')}</p>
        {/if}
        {#if truth.entry}
          <div class="fact">
            <strong>{truth.entry.status === 'open' ? t('Working now') : t('Worked time')}</strong>
            <span>
              {instantClockLabel(truth.entry.clock_in_at, timezone)}–{instantClockLabel(truth.entry.clock_out_at, timezone) || t('open')}
              · {t('{minutes} min break', { minutes: truth.entry.break_minutes || 0 })}
            </span>
            {#if truth.entry.adjustment_reason}<small>{t('Correction: {reason}', { reason: truth.entry.adjustment_reason })}</small>{/if}
          </div>
        {/if}
        {#if pendingAbsence}
          <div class="fact is-pending">
            <strong>{t('Time off pending')}</strong>
            {#if pendingAbsence.employee_comment}<span>{pendingAbsence.employee_comment}</span>{/if}
          </div>
        {:else if truth.absence?.status === 'approved'}
          <div class="fact is-approved"><strong>{t('Approved leave')}</strong></div>
        {/if}
        {#if pendingChange}
          <div class="fact is-pending">
            <strong>{t('Change pending')}</strong>
            {#if pendingChange.reason}<span>{pendingChange.reason}</span>{/if}
          </div>
        {:else if truth.workPatternException?.status === 'approved'}
          <div class="fact is-approved">
            <strong>{t('Approved schedule change')}</strong>
            {#if truth.workPatternException.reason}<span>{truth.workPatternException.reason}</span>{/if}
          </div>
        {/if}
      </div>

      <div class="slot-actions">
        <strong>{t('What would you like to do?')}</strong>

        {#if pendingAbsence}
          <ActionButton label={t('Cancel time-off request')} tone="danger" disabled={saving} onclick={() => onCancelAbsence(pendingAbsence.id)} />
        {/if}
        {#if pendingChange}
          <ActionButton label={t('Cancel change request')} tone="danger" disabled={saving} onclick={() => onCancelChange(pendingChange.id)} />
        {/if}

        {#if policy === 'weekly_availability' && !availabilityBlocked}
          <div class="availability-picker" role="group" aria-label={t('Your availability for this service')}>
            {#each SELECTABLE_AVAILABILITY as option (option.value)}
              <button
                type="button"
                class={`availability-option is-${option.value}`}
                class:is-active={availabilityState === option.value}
                aria-pressed={availabilityState === option.value}
                disabled={saving}
                onclick={() => onSetAvailability(availabilityState === option.value ? '' : option.value)}
              >
                <b aria-hidden="true">{option.icon}</b>
                <span>{t(option.label)}</span>
              </button>
            {/each}
            {#if availabilityState === 'partial'}
              <button
                type="button"
                class="availability-option is-clear"
                disabled={saving}
                onclick={() => onSetAvailability('')}
              >
                <b aria-hidden="true">−</b>
                <span>{t('Clear availability')}</span>
              </button>
            {/if}
          </div>
          <p class="availability-hint">{t(availabilityHint)}</p>
        {/if}

        {#if !timeOffBlocked && !pendingAbsence && (policy !== 'weekly_availability' || availabilityState !== 'available')}
          <!-- Set the leave type and an optional note, then request. The button
               stages the request and closes the dialog; the page's action bar
               submits it. -->
          <div class="request-details">
            <label>
              {t('Leave type')}
              <select bind:value={absenceTypeId}>
                <option value={defaultType?.id ?? ''}>{t(defaultType?.name ?? 'Default holiday')}</option>
                {#each timeOffTypes.filter((item) => item.id !== defaultType?.id) as type (type.id)}
                  <option value={type.id}>{t(type.name)}</option>
                {/each}
              </select>
            </label>
            <label>
              {t('Comment')}
              <input bind:value={comment} placeholder={t('Optional context for your manager')} />
            </label>
          </div>
          <ActionButton
            label={isTimeOffSelected ? t('Remove time-off request') : t('Request time off')}
            tone={isTimeOffSelected ? 'secondary' : 'primary'}
            disabled={saving}
            onclick={onRequestTimeOff}
          />
        {/if}

        {#if availabilityBlocked && timeOffBlocked && !pendingAbsence && !pendingChange}
          <p class="muted">{t(availabilityBlocked || timeOffBlocked)}</p>
        {/if}
      </div>
    </div>
  {/if}
</Dialog>

<style>
  .slot-dialog {
    display: grid;
    gap: 20px;
  }
  .slot-summary {
    display: grid;
    gap: 10px;
    justify-items: start;
  }
  .fact {
    display: grid;
    gap: 3px;
    padding: 12px;
    border: 1px solid var(--rst-ui-line);
    border-radius: var(--rst-ui-radius-lg);
    background: var(--rst-ui-surface-field);
  }
  .fact span,
  .fact small {
    color: var(--rst-ui-muted);
    font-size: 12px;
  }
  .fact.is-pending {
    border-color: var(--rst-state-warning-border);
    background: var(--rst-state-warning-bg);
  }
  .fact.is-approved {
    border-color: var(--rst-state-absence-border);
    background: var(--rst-state-absence-bg);
  }
  .muted {
    margin: 0;
    color: var(--rst-ui-muted);
    font-size: 13px;
  }
  .slot-actions {
    display: grid;
    gap: 10px;
    padding-top: 16px;
    border-top: 1px solid var(--rst-ui-divider-soft);
  }
  .slot-actions > strong {
    font-size: 13px;
  }
  .availability-picker {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
    gap: 8px;
  }
  .availability-option {
    display: grid;
    justify-items: center;
    gap: 6px;
    padding: 12px 8px;
    border: 1px solid var(--rst-ui-line);
    border-radius: var(--rst-ui-radius-lg);
    background: var(--rst-ui-surface-field);
    color: var(--rst-ui-muted);
    font: inherit;
    font-size: 12px;
    font-weight: var(--rst-fw-bold);
    cursor: pointer;
    transition: border-color .16s ease, background .16s ease, color .16s ease, transform .16s ease;
  }
  .availability-option b {
    font-size: 17px;
    line-height: 1;
  }
  .availability-option:hover:not(:disabled) {
    transform: translateY(-1px);
    color: var(--rst-ui-text);
  }
  .availability-option:disabled {
    opacity: 0.55;
    cursor: default;
  }
  .availability-option.is-active {
    color: var(--rst-ui-text);
  }
  .availability-option.is-available.is-active {
    border-color: rgba(42, 154, 98, 0.6);
    background: linear-gradient(135deg, rgba(51, 170, 107, 0.24), rgba(51, 170, 107, 0.08));
  }
  .availability-option.is-unavailable.is-active {
    border-color: rgba(var(--rst-state-danger-rgb), 0.55);
    background: linear-gradient(
      135deg,
      rgba(var(--rst-state-danger-rgb), 0.2),
      rgba(var(--rst-state-danger-rgb), 0.07)
    );
  }
  .availability-hint {
    margin: 0;
    color: var(--rst-ui-muted);
    font-size: 12px;
  }
  .request-details {
    display: grid;
    gap: 12px;
    padding-top: 16px;
    border-top: 1px solid var(--rst-ui-divider-soft);
  }
  .request-details label {
    display: grid;
    gap: 6px;
    color: var(--rst-ui-muted);
    font-size: 11px;
    font-weight: var(--rst-fw-bold);
  }
  .request-details input,
  .request-details select {
    min-height: 40px;
    padding: 8px 10px;
    border: 1px solid var(--rst-ui-line);
    border-radius: var(--rst-ui-radius-md);
    color: var(--rst-ui-text);
    background: var(--rst-ui-surface-field-strong);
    font: inherit;
  }
</style>
