<script lang="ts">
  import type { Snippet } from 'svelte';
  import type { WorkRegime } from '$lib/domain/operations';
  import ActionButton from '$lib/components/ActionButton.svelte';
  import type { EmployeeSelfServiceMode } from './employee-self-service';

  let {
    policy,
    mode,
    requestCount = 0,
    period,
    busy = false,
    canSave = false,
    hasPendingEdits = false,
    onmode,
    onsave,
    ondiscard,
    ondetails
  }: {
    policy: WorkRegime;
    mode: EmployeeSelfServiceMode;
    // Selections in the CURRENT tab's request bucket (time-off or fixed-schedule
    // change). Drives the optional Details affordance for type/comment.
    requestCount?: number;
    period?: Snippet;
    busy?: boolean;
    // Save/discard enablement is owned by the route, which knows the regime and
    // every pending bucket; the editor just renders the decision.
    canSave?: boolean;
    hasPendingEdits?: boolean;
    onmode: (mode: EmployeeSelfServiceMode) => void;
    onsave: () => void;
    ondiscard: () => void;
    ondetails: () => void;
  } = $props();

  const availabilityDisabled = $derived(policy === 'manager_only');
  const availabilityLabel = $derived(
    policy === 'fixed_schedule' ? 'Availability change' : 'Availability'
  );
  const detailsLabel = $derived(requestCount ? `Details (${requestCount})` : 'Details');
</script>

<section class="self-service" aria-label="Employee scheduling actions">
  <div class="mode" role="tablist" aria-label="Choose employee action">
    <button
      type="button"
      role="tab"
      aria-selected={mode === 'availability'}
      disabled={availabilityDisabled}
      onclick={() => onmode('availability')}
    >
      {availabilityLabel}
    </button>
    <button
      type="button"
      role="tab"
      aria-selected={mode === 'time_off'}
      onclick={() => onmode('time_off')}
    >
      Time off
    </button>
  </div>

  {#if period}
    <div class="period">{@render period()}</div>
  {/if}

  <div class="actions">
    {#if requestCount > 0}
      <ActionButton label={detailsLabel} disabled={busy} onclick={ondetails} />
    {/if}
    <ActionButton label="Discard" disabled={!hasPendingEdits || busy} onclick={ondiscard} />
    <ActionButton label={busy ? 'Saving…' : 'Save changes'} tone="primary" disabled={!canSave} onclick={onsave} />
  </div>
</section>

<style>
  .self-service {
    min-width: 0;
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr);
    align-items: center;
    gap: 12px;
  }

  .mode {
    justify-self: start;
    display: flex;
    gap: 4px;
    padding: 3px;
    border-radius: var(--rst-ui-radius-md);
    background: var(--rst-ui-surface-field);
  }

  .mode button {
    min-height: 34px;
    padding: 7px 11px;
    border: 1px solid transparent;
    border-radius: var(--rst-ui-radius-sm);
    color: var(--rst-ui-muted);
    background: transparent;
    font: inherit;
    font-size: 11px;
    font-weight: var(--rst-fw-bold);
    cursor: pointer;
  }

  .mode button[aria-selected='true'] {
    border-color: var(--rst-state-selected-border);
    color: var(--rst-ui-text);
    background: var(--rst-state-selected-bg);
  }

  .mode button:disabled { cursor: default; opacity: .5; }
  .period { min-width: 0; display: flex; justify-content: center; }
  .actions { justify-self: end; display: flex; flex-wrap: wrap; justify-content: flex-end; gap: 6px; }

  @media (max-width: 760px) {
    .self-service { grid-template-columns: 1fr; }
    .period { justify-content: stretch; }
    .period :global(.period-navigator) { width: 100%; }
    .mode, .actions { width: 100%; justify-self: stretch; }
    .mode { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); }
    .actions { display: grid; grid-template-columns: repeat(auto-fill, minmax(100px, 1fr)); }
  }
</style>
