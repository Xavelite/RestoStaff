<script lang="ts">
  import Drawer from '$lib/components/Drawer.svelte';
  import StatusPill from '$lib/components/StatusPill.svelte';
  import ActionButton from '$lib/components/ActionButton.svelte';
  import { serviceLabel } from '$lib/calendar/date';
  import { instantClockLabel, type ServiceSlotTruth } from '$lib/calendar/service-slot';
  import { employeeSlotActionReason } from '$lib/employee/employee-self-service';
  import type { AvailabilityMode } from '$lib/employee/employee-model';

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
    planningPublished,
    availabilityState,
    isTimeOffSelected,
    isChangeSelected,
    saving = false,
    onclose,
    onToggleAvailability,
    onRequestTimeOff,
    onRequestChange,
    onCancelAbsence,
    onCancelChange
  }: {
    open: boolean;
    truth: ServiceSlotTruth | null;
    policy: AvailabilityMode;
    today: string;
    timezone: string;
    planningPublished: boolean;
    availabilityState: '' | 'available' | 'partial' | 'unavailable';
    isTimeOffSelected: boolean;
    isChangeSelected: boolean;
    saving?: boolean;
    onclose: () => void;
    onToggleAvailability: () => void;
    onRequestTimeOff: () => void;
    onRequestChange: () => void;
    onCancelAbsence: (absenceId: string) => void;
    onCancelChange: (workPatternExceptionId: string) => void;
  } = $props();

  const availabilityBlocked = $derived(
    truth ? employeeSlotActionReason({ truth, policy, mode: 'availability', today, planningPublished }) : ''
  );
  const timeOffBlocked = $derived(
    truth ? employeeSlotActionReason({ truth, policy, mode: 'time_off', today, planningPublished }) : ''
  );
  const pendingAbsence = $derived(truth?.absence?.status === 'pending' ? truth.absence : null);
  const pendingChange = $derived(
    truth?.workPatternException?.status === 'pending' ? truth.workPatternException : null
  );
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

<Drawer
  open={open && Boolean(truth)}
  title={truth ? `${serviceLabel(truth.serviceKey)} · ${truth.date}` : 'Service details'}
  description="Published schedule, worked time and your requests for this service."
  {onclose}
>
  {#if truth}
    <div class="slot-drawer">
      <div class="slot-summary">
        <StatusPill label={truth.state.replaceAll('_', ' ')} tone={stateTone} />
        {#if truth.plan}
          <div class="fact">
            <strong>{truth.plan.startsAt}–{truth.plan.endsAt}</strong>
            <span>{truth.plan.area}</span>
          </div>
        {:else}
          <p class="muted">No published shift for this service.</p>
        {/if}
        {#if truth.entry}
          <div class="fact">
            <strong>{truth.entry.status === 'open' ? 'Working now' : 'Worked time'}</strong>
            <span>
              {instantClockLabel(truth.entry.clock_in_at, timezone)}–{instantClockLabel(truth.entry.clock_out_at, timezone) || 'open'}
              · {truth.entry.break_minutes || 0} min break
            </span>
            {#if truth.entry.adjustment_reason}<small>Correction: {truth.entry.adjustment_reason}</small>{/if}
          </div>
        {/if}
        {#if pendingAbsence}
          <div class="fact is-pending">
            <strong>Time off pending</strong>
            {#if pendingAbsence.employee_comment}<span>{pendingAbsence.employee_comment}</span>{/if}
          </div>
        {:else if truth.absence?.status === 'approved'}
          <div class="fact is-approved"><strong>Approved leave</strong></div>
        {/if}
        {#if pendingChange}
          <div class="fact is-pending">
            <strong>Change pending</strong>
            {#if pendingChange.reason}<span>{pendingChange.reason}</span>{/if}
          </div>
        {:else if truth.workPatternException?.status === 'approved'}
          <div class="fact is-approved">
            <strong>Approved schedule change</strong>
            {#if truth.workPatternException.reason}<span>{truth.workPatternException.reason}</span>{/if}
          </div>
        {/if}
      </div>

      <div class="slot-actions">
        <strong>What would you like to do?</strong>

        {#if pendingAbsence}
          <ActionButton label="Cancel time-off request" tone="danger" disabled={saving} onclick={() => onCancelAbsence(pendingAbsence.id)} />
        {/if}
        {#if pendingChange}
          <ActionButton label="Cancel change request" tone="danger" disabled={saving} onclick={() => onCancelChange(pendingChange.id)} />
        {/if}

        {#if policy === 'weekly_availability' && !availabilityBlocked}
          <ActionButton
            label={availabilityState === 'available' ? 'Remove availability' : 'Mark available'}
            tone="primary"
            onclick={onToggleAvailability}
          />
        {:else if policy === 'fixed_schedule' && !availabilityBlocked}
          <ActionButton
            label={isChangeSelected ? 'Remove from change request' : 'Request a schedule change'}
            tone="primary"
            onclick={onRequestChange}
          />
        {/if}

        {#if !timeOffBlocked}
          <ActionButton
            label={isTimeOffSelected ? 'Remove from time-off request' : 'Request time off'}
            onclick={onRequestTimeOff}
          />
        {/if}

        {#if availabilityBlocked && timeOffBlocked && !pendingAbsence && !pendingChange}
          <p class="muted">{availabilityBlocked || timeOffBlocked}</p>
        {/if}
      </div>
    </div>
  {/if}
</Drawer>

<style>
  .slot-drawer {
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
</style>
