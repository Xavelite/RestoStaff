<script lang="ts">
  import type { ServiceSlotPresentation } from '$lib/calendar/calendar-model';
  import { serviceDisplay, type ServiceKey } from '$lib/calendar/date';

  let {
    presentation,
    serviceKey,
    selected = false,
    disabled = false,
    compact = false,
    past = false,
    dayRhythm = 'base',
    onclick,
    ondetails,
    ariaLabel
  }: {
    presentation: ServiceSlotPresentation;
    serviceKey: ServiceKey;
    selected?: boolean;
    disabled?: boolean;
    compact?: boolean;
    past?: boolean;
    dayRhythm?: 'base' | 'alternate';
    onclick: () => void;
    ondetails?: () => void;
    ariaLabel: string;
  } = $props();

  const service = $derived(serviceDisplay(serviceKey));
  const surfaceDisabled = $derived(disabled || (past && !presentation.card));
</script>

<div
  class="slot is-bg-{presentation.background}"
  class:is-selected={selected}
  class:is-compact={compact}
  class:is-past={past}
  class:is-day-alternate={dayRhythm === 'alternate'}
>
  <button
    type="button"
    class="slot__surface"
    disabled={surfaceDisabled}
    {onclick}
    aria-label={ariaLabel}
    title={ariaLabel}
  >
    {#if !presentation.card}
      <span class="slot__empty" class:is-actionable={!surfaceDisabled} aria-hidden="true">
        {#if !surfaceDisabled}<strong class="slot__empty-action">Add</strong>{/if}
        <span class="service service--icon-only">{service.icon}</span>
      </span>
    {/if}
    {#if presentation.attention && !presentation.card}<small>{presentation.attention}</small>{/if}
  </button>
  {#if presentation.card}
    <button
      type="button"
      class="slot__card is-{presentation.card.tone}"
      disabled={disabled && !ondetails}
      onclick={(event) => {
        event.stopPropagation();
        if (presentation.card?.interaction === 'select') {
          onclick();
          return;
        }
        (ondetails ?? onclick)();
      }}
      aria-label={`${ariaLabel} details`}
    >
      <span class="service"><span aria-hidden="true">{service.icon}</span><span>{service.label}</span></span>
      <strong>{presentation.card.label}</strong>
      {#if presentation.card.meta}<small>{presentation.card.meta}</small>{/if}
    </button>
  {/if}
</div>

<style>
  .slot {
    --slot-bg: var(--rst-op-empty-bg);
    /* The Lunch/Evening half-cell IS the surface: the availability/conflict tone
       fills it flush, edge to edge. No border/radius here — it must not read as a
       floating tile. Operational events render as the inset .slot__card on top. */
    position: relative;
    min-width: 0;
    min-height: 56px;
    height: 100%;
    display: grid;
    background: var(--slot-bg);
    overflow: hidden;
    transition:
      filter 0.16s ease,
      box-shadow 0.16s var(--rst-ease-out),
      transform 0.16s var(--rst-ease-out);
  }

  .slot::before,
  .slot::after {
    content: '';
    position: absolute;
    inset: 0;
    pointer-events: none;
  }

  .slot::before {
    z-index: 0;
    background: transparent;
  }

  .slot::after {
    z-index: 3;
    background: transparent;
  }

  .slot.is-day-alternate::before {
    background: rgba(255, 255, 255, 0.008);
  }

  .slot.is-past::after {
    background: repeating-linear-gradient(
      135deg,
      rgba(255, 255, 255, 0.026) 0,
      rgba(255, 255, 255, 0.026) 1px,
      transparent 1px,
      transparent 9px
    );
  }

  .slot:hover,
  .slot:focus-within {
    filter: brightness(1.04);
    box-shadow: inset 0 0 0 1px rgba(var(--rst-ui-action-rgb), 0.2);
  }

  .slot.is-selected {
    outline: 2px solid var(--rst-ui-action);
    outline-offset: -2px;
  }

  .slot__surface,
  .slot__card {
    min-width: 0;
    border: 0;
    color: var(--rst-ui-text);
    background: transparent;
    font: inherit;
    text-align: left;
    cursor: pointer;
  }

  .slot__surface {
    position: relative;
    z-index: 2;
    min-height: 54px;
    display: grid;
    align-content: center;
    justify-items: center;
    gap: 2px;
    padding: 6px 7px;
  }

  .slot__surface:focus-visible,
  .slot__card:focus-visible {
    outline: 2px solid var(--rst-ui-action);
    outline-offset: -2px;
  }

  .slot__surface:disabled,
  .slot__card:disabled {
    cursor: default;
    opacity: 0.68;
  }

  .slot.is-compact {
    min-height: 48px;
  }

  .slot.is-compact .slot__surface {
    min-height: 46px;
    padding: 4px 5px;
  }

  .service {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    color: var(--rst-ui-muted);
    font-size: 8px;
    font-weight: var(--rst-fw-bold);
    letter-spacing: 0.04em;
    text-transform: uppercase;
  }

  .service span[aria-hidden='true'] {
    width: 1em;
    color: color-mix(in srgb, currentColor 85%, var(--rst-ui-text));
    font-size: 10px;
    line-height: 1;
    text-align: center;
  }

  .slot strong,
  .slot small {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .slot__surface strong {
    color: var(--rst-ui-muted);
    font-size: 10px;
  }

  .slot__empty {
    justify-self: center;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 5px;
    min-width: 0;
    color: color-mix(in srgb, var(--rst-ui-muted) 86%, var(--rst-ui-text));
  }

  .slot__empty.is-actionable {
    color: var(--rst-state-info-text);
  }

  .service--icon-only {
    font-size: 12px;
    line-height: 1;
  }

  .slot__empty-action {
    color: currentColor;
    font-size: 11px;
    font-weight: var(--rst-fw-bold);
    letter-spacing: 0.01em;
    line-height: 1;
    transition: transform 0.16s var(--rst-ease-out), color 0.16s ease;
  }

  .slot:hover .slot__empty-action {
    color: var(--rst-ui-action);
    transform: translateY(-1px);
  }

  .slot small {
    color: var(--rst-ui-muted);
    font-size: 8px;
  }

  .is-bg-available { --slot-bg: rgba(var(--rst-state-success-rgb), 0.2); }
  .is-bg-partial, .is-bg-warning { --slot-bg: var(--rst-state-warning-bg); }
  .is-bg-unavailable { --slot-bg: var(--rst-op-unavailable-bg); }
  .is-bg-conflict { --slot-bg: var(--rst-op-conflict-card-bg); }

  .slot__card {
    --card-bg: var(--rst-ui-surface-panel);
    --card-border: var(--rst-ui-line);
    --card-accent: var(--rst-ui-text);
    position: absolute;
    z-index: 2;
    inset: 3px;
    display: grid;
    align-content: center;
    gap: 2px;
    padding: 5px 6px;
    border: 1px solid var(--card-border);
    border-radius: calc(var(--rst-ui-radius-sm) - 2px);
    background: var(--card-bg);
    transition:
      transform 0.16s var(--rst-ease-out),
      box-shadow 0.16s var(--rst-ease-out),
      filter 0.16s ease;
  }

  .slot:hover .slot__card,
  .slot__card:focus-visible {
    transform: translateY(-1px);
    filter: saturate(1.04);
    box-shadow: 0 10px 22px rgba(31, 22, 15, 0.14);
  }

  .slot__card .service {
    color: color-mix(in srgb, var(--card-accent) 68%, var(--rst-ui-muted));
  }

  .slot__card strong { color: var(--card-accent); font-size: 10px; }

  .slot.is-compact .slot__card {
    padding: 4px;
  }

  .slot.is-compact .slot__card strong {
    font-size: 9px;
  }

  .slot.is-compact .slot__card small {
    font-size: 7px;
  }
  .slot__card.is-planned { --card-bg: var(--rst-op-planned-card-bg); --card-border: var(--rst-op-planned-border); --card-accent: var(--rst-op-planned-accent); }
  /* Subtle "was expected" placeholder for Actuals: dashed, no fill, muted — a
     quiet expectation, clearly not a solid Planning card or a worked card. */
  .slot__card.is-expected { --card-bg: transparent; --card-border: var(--rst-ui-line-strong); --card-accent: var(--rst-ui-muted); border-style: dashed; }
  .slot__card.is-actual { --card-bg: var(--rst-op-actual-card-bg); --card-border: var(--rst-op-actual-border); --card-accent: var(--rst-op-actual-accent); }
  .slot__card.is-live { --card-bg: var(--rst-op-live-card-bg); --card-border: var(--rst-op-live-border); --card-accent: var(--rst-op-live-accent); animation: rst-breathe-glow 2.8s ease-in-out infinite; }
  .slot__card.is-absence { --card-bg: var(--rst-op-absence-card-bg); --card-border: var(--rst-op-absence-border); --card-accent: var(--rst-op-absence-accent); }
  .slot__card.is-conflict { --card-bg: var(--rst-op-conflict-card-bg); --card-border: var(--rst-op-conflict-border); --card-accent: var(--rst-op-conflict-accent); }
  .slot__card.is-correction { --card-bg: var(--rst-op-correction-bg); --card-border: var(--rst-op-correction-border); --card-accent: var(--rst-op-correction-accent); }
  .slot__card.is-missing, .slot__card.is-warning { --card-bg: var(--rst-state-warning-bg); --card-border: var(--rst-state-warning-border); --card-accent: var(--rst-state-warning-text); }
  .slot__card.is-pending { --card-bg: var(--rst-op-pending-card-bg); --card-border: var(--rst-op-pending-border); --card-accent: var(--rst-op-pending-accent); }
  .slot__card.is-danger, .slot__card.is-payroll { --card-bg: var(--rst-state-danger-bg); --card-border: var(--rst-state-danger-border); --card-accent: var(--rst-state-danger-text); }
</style>
