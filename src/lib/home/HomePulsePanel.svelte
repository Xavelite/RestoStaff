<script lang="ts">
  import Panel from '$lib/components/Panel.svelte';
  import type { HomeModel, Tone } from './home-model';

  let { pulse, weekLabel }: { pulse: HomeModel['pulse']; weekLabel: string } = $props();

  function toneLabel(tone: Tone): string {
    return tone === 'danger'
      ? 'Needs attention'
      : tone === 'warning'
        ? 'Review'
        : tone === 'success'
          ? 'Clear'
          : 'Status';
  }
</script>

{#snippet trailing()}
  <span class="tone is-{pulse.tone}">{toneLabel(pulse.tone)}</span>
{/snippet}

<Panel title="Week pulse" eyebrow={weekLabel} {trailing}>
  <div class="overview is-{pulse.tone}">
    <span>Operational health</span>
    <strong>{toneLabel(pulse.tone)}</strong>
    <small>Planning, coverage and actuals signals for the current week.</small>
  </div>

  <div class="checks" aria-label="Weekly health checks">
    {#each pulse.rows as row (row.label)}
      <a class="check is-{row.tone}" href={row.href}>
        <span class="dot" aria-hidden="true"></span>
        <span class="copy">
          <small>{row.label}</small>
          <strong>{row.value}</strong>
        </span>
        <em>{row.meta}</em>
      </a>
    {/each}
  </div>
</Panel>

<style>
  .tone {
    display: inline-flex;
    padding: 5px 8px;
    border-radius: var(--rst-ui-radius-pill);
    color: var(--rst-state-info-text);
    background: var(--rst-state-info-bg);
    border: 1px solid var(--rst-state-info-border);
    font-size: 11px;
    font-weight: var(--rst-fw-bold);
  }

  .tone.is-success {
    color: var(--rst-state-success-text);
    background: var(--rst-state-success-bg);
    border-color: var(--rst-state-success-border);
  }

  .tone.is-warning {
    color: var(--rst-state-warning-text);
    background: var(--rst-state-warning-bg);
    border-color: var(--rst-state-warning-border);
  }

  .tone.is-danger {
    color: var(--rst-state-danger-text);
    background: var(--rst-state-danger-bg);
    border-color: var(--rst-state-danger-border);
  }

  .overview {
    --pulse-rgb: var(--rst-state-info-rgb);
    min-height: 86px;
    display: grid;
    align-content: center;
    gap: 4px;
    padding: 14px;
    background:
      linear-gradient(135deg, rgba(var(--pulse-rgb), 0.14), transparent 62%),
      var(--rst-ui-surface-field);
    border-bottom: 1px solid var(--rst-ui-divider-soft);
  }

  .overview.is-success {
    --pulse-rgb: var(--rst-state-success-rgb);
  }

  .overview.is-warning {
    --pulse-rgb: var(--rst-state-warning-rgb);
  }

  .overview.is-danger {
    --pulse-rgb: var(--rst-state-danger-rgb);
  }

  .overview span {
    color: var(--rst-ui-muted);
    font-size: 11px;
    font-weight: var(--rst-fw-bold);
    letter-spacing: 0.06em;
    text-transform: uppercase;
  }

  .overview strong {
    color: rgb(var(--pulse-rgb));
    font-size: 22px;
    font-weight: var(--rst-fw-display);
  }

  .overview small {
    max-width: 320px;
    line-height: 1.35;
  }

  .checks {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 8px;
    padding: 12px;
  }

  .check {
    --row-rgb: var(--rst-state-neutral-rgb);
    min-height: 78px;
    display: grid;
    grid-template-columns: auto minmax(0, 1fr);
    align-content: start;
    gap: 5px 8px;
    padding: 10px;
    color: var(--rst-ui-text);
    text-decoration: none;
    border: 1px solid var(--rst-ui-divider-soft);
    border-radius: var(--rst-ui-radius-lg);
    background: var(--rst-ui-surface-panel);
  }

  .check:hover {
    background: rgba(var(--row-rgb), 0.055);
    border-color: rgba(var(--row-rgb), 0.25);
  }

  .check.is-success {
    --row-rgb: var(--rst-state-success-rgb);
  }

  .check.is-warning {
    --row-rgb: var(--rst-state-warning-rgb);
  }

  .check.is-danger {
    --row-rgb: var(--rst-state-danger-rgb);
  }

  .check.is-info {
    --row-rgb: var(--rst-state-info-rgb);
  }

  .dot {
    width: 9px;
    height: 9px;
    margin-top: 4px;
    border-radius: 50%;
    background: rgb(var(--row-rgb));
    box-shadow: 0 0 0 4px rgba(var(--row-rgb), 0.12);
  }

  .copy {
    min-width: 0;
    display: grid;
    gap: 2px;
  }

  small {
    color: var(--rst-ui-muted);
    font-size: 11px;
  }

  .copy strong {
    color: rgb(var(--row-rgb));
    font-size: 15px;
  }

  .check em {
    grid-column: 1 / -1;
    color: var(--rst-ui-muted);
    font-size: 11px;
    font-style: normal;
    line-height: 1.35;
  }

  @media (max-width: 520px) {
    .checks {
      grid-template-columns: 1fr;
    }
  }
</style>
