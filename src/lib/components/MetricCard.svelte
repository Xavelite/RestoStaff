<script lang="ts">
  import type { MetricTone as Tone } from '$lib/ui/metric';

  // A metric renders as a popup trigger when the page attached a `detail`
  // (via `ondetail`), a navigation link when it only has an `href`, or a static
  // card otherwise. Same visual either way.
  let {
    label,
    value,
    meta,
    tone = 'neutral',
    symbol,
    href,
    ondetail,
    compact = false,
    micro = false
  }: {
    label: string;
    value: string;
    meta: string;
    tone?: Tone;
    symbol: string;
    href?: string;
    ondetail?: () => void;
    compact?: boolean;
    micro?: boolean;
  } = $props();
</script>

{#snippet body()}
  <span class="metric__icon" aria-hidden="true">{symbol}</span>
  <span class="metric__copy">
    <span class="metric__label">{label}</span>
    <strong>{value}</strong>
    <small>{meta}</small>
  </span>
{/snippet}

{#if ondetail}
  <button
    type="button"
    class="metric is-{tone}"
    class:is-compact={compact}
    class:is-micro={micro}
    aria-haspopup="dialog"
    aria-label="{label} details"
    onclick={ondetail}>
    {@render body()}
  </button>
{:else if href}
  <a class="metric is-{tone}" class:is-compact={compact} class:is-micro={micro} {href} aria-label="{label} details">
    {@render body()}
  </a>
{:else}
  <div class="metric is-{tone} is-static" class:is-compact={compact} class:is-micro={micro}>
    {@render body()}
  </div>
{/if}

<style>
  .metric {
    --tone-rgb: var(--rst-state-neutral-rgb);
    --tone-text: var(--rst-state-neutral-text);
    min-width: 0;
    width: 100%;
    display: flex;
    align-items: center;
    gap: 12px;
    min-height: 88px;
    padding: 15px 16px;
    color: var(--rst-ui-metric-text);
    text-align: left;
    text-decoration: none;
    appearance: none;
    background: var(--rst-ui-metric-card);
    border: 1px solid var(--rst-ui-metric-border);
    border-radius: var(--rst-ui-radius-xl);
    box-shadow: inset 3px 0 0 rgba(var(--tone-rgb), 0.85);
    font: inherit;
    cursor: pointer;
    transition:
      border-color 140ms ease,
      background 140ms ease,
      transform 140ms ease;
  }

  .metric.is-static {
    cursor: default;
  }

  .metric:not(.is-static):hover {
    transform: translateY(-1px);
    border-color: rgba(var(--tone-rgb), 0.38);
    background: rgba(var(--tone-rgb), 0.055);
  }

  .metric.is-success {
    --tone-rgb: var(--rst-state-success-rgb);
    --tone-text: var(--rst-state-success-text);
  }

  .metric.is-warning {
    --tone-rgb: var(--rst-state-warning-rgb);
    --tone-text: var(--rst-state-warning-text);
  }

  .metric.is-danger {
    --tone-rgb: var(--rst-state-danger-rgb);
    --tone-text: var(--rst-state-danger-text);
  }

  .metric.is-info {
    --tone-rgb: var(--rst-state-info-rgb);
    --tone-text: var(--rst-state-info-text);
  }

  .metric__icon {
    flex: 0 0 38px;
    width: 38px;
    height: 38px;
    display: grid;
    place-items: center;
    border-radius: var(--rst-ui-radius-lg);
    color: var(--tone-text);
    background: rgba(var(--tone-rgb), 0.13);
    border: 1px solid rgba(var(--tone-rgb), 0.25);
    font-weight: var(--rst-fw-display);
  }

  .metric__copy {
    min-width: 0;
    display: grid;
    gap: 2px;
  }

  .metric__label {
    color: var(--rst-ui-metric-muted);
    font-size: 11px;
    font-weight: var(--rst-fw-bold);
    letter-spacing: 0.055em;
    text-transform: uppercase;
  }

  strong {
    overflow: hidden;
    color: var(--rst-ui-metric-value);
    font-size: 20px;
    font-weight: var(--rst-fw-display);
    line-height: 1.15;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  small {
    overflow: hidden;
    color: var(--rst-ui-metric-muted);
    font-size: 12px;
    line-height: 1.25;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .metric.is-compact {
    min-height: 68px;
    gap: 8px;
    padding: 9px 10px;
    border-radius: var(--rst-ui-radius-lg);
  }

  .metric.is-compact .metric__icon {
    flex-basis: 30px;
    width: 30px;
    height: 30px;
    border-radius: var(--rst-ui-radius-md);
    font-size: 12px;
  }

  .metric.is-compact .metric__label {
    font-size: 9px;
  }

  .metric.is-compact strong {
    font-size: 16px;
  }

  .metric.is-compact small {
    font-size: 10px;
  }

  .metric.is-micro {
    min-height: 52px;
    gap: 8px;
    padding: 8px 10px;
    border-radius: var(--rst-ui-radius-lg);
    box-shadow: inset 2px 0 0 rgba(var(--tone-rgb), 0.85);
  }

  .metric.is-micro .metric__icon {
    flex-basis: 26px;
    width: 26px;
    height: 26px;
    border-radius: var(--rst-ui-radius-md);
    font-size: 11px;
  }

  .metric.is-micro .metric__copy {
    gap: 0;
  }

  .metric.is-micro .metric__label {
    font-size: 8px;
    letter-spacing: 0.065em;
  }

  .metric.is-micro strong {
    font-size: 15px;
  }

  .metric.is-micro small {
    font-size: 10px;
    line-height: 1.15;
  }
</style>
