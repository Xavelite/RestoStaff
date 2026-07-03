<script lang="ts">
  import Panel from '$lib/components/Panel.svelte';
  import type { HomeModel } from './home-model';

  let { live }: { live: HomeModel['live'] } = $props();
</script>

{#snippet trailing()}
  <span class="live-indicator"><i></i> Live</span>
{/snippet}

{#snippet footer()}
  <a href="/actuals">Open Actuals <span>→</span></a>
{/snippet}

<Panel title="Today live" eyebrow="Service timeline" {trailing} {footer}>
  <div class="live-summary" aria-label="Today live summary">
    <span><b>{live.working}</b><small>Working</small></span>
    <span class:has-risk={live.late > 0}><b>{live.late}</b><small>Late / no-show</small></span>
    <span><b>{live.upcoming}</b><small>Upcoming</small></span>
  </div>

  <div class="timeline">
    {#if live.rows.length}
      {#each live.rows as row (`${row.employeeId}-${row.status}-${row.range}`)}
        <article class="live-row is-{row.tone}">
          <span class="rail" aria-hidden="true"><i></i></span>
          <span class="time">{row.range}</span>
          <span class="person">
            <strong>{row.name}</strong>
            <small>{row.role}</small>
          </span>
          <span class="status"><i></i>{row.status}</span>
        </article>
      {/each}
    {:else}
      <div class="empty">
        <span aria-hidden="true">✓</span>
        <strong>All set for today</strong>
        <p>No live exceptions or upcoming shifts need attention.</p>
      </div>
    {/if}
  </div>
</Panel>

<style>
  .live-indicator {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 5px 8px;
    border-radius: var(--rst-ui-radius-pill);
    color: var(--rst-state-success-text);
    background: var(--rst-state-success-bg);
    border: 1px solid var(--rst-state-success-border);
    font-size: 11px;
    font-weight: var(--rst-fw-bold);
  }

  .live-indicator i,
  .status i {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: currentColor;
  }

  .live-summary {
    min-height: 86px;
    display: flex;
    flex-wrap: wrap;
    align-content: center;
    gap: 8px;
    padding: 12px 14px;
    border-bottom: 1px solid var(--rst-ui-divider-soft);
  }

  .live-summary span {
    min-width: 92px;
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 8px;
    padding: 8px 10px;
    border-radius: var(--rst-ui-radius-lg);
    background: var(--rst-ui-surface-field);
    border: 1px solid var(--rst-ui-divider-soft);
  }

  .live-summary .has-risk {
    color: var(--rst-state-danger-text);
    background: var(--rst-state-danger-bg);
    border-color: var(--rst-state-danger-border);
  }

  .live-summary b {
    font-size: 20px;
    font-weight: var(--rst-fw-display);
  }

  small {
    color: var(--rst-ui-muted);
    font-size: 11px;
  }

  .has-risk small {
    color: currentColor;
    opacity: 0.78;
  }

  .timeline {
    min-height: 210px;
    display: grid;
    align-content: start;
    padding: 10px 14px 14px;
  }

  .live-row {
    --row-rgb: var(--rst-state-neutral-rgb);
    position: relative;
    display: grid;
    grid-template-columns: 22px 82px minmax(0, 1fr);
    align-items: center;
    gap: 10px;
    min-height: 60px;
    padding: 9px 0;
  }

  .live-row + .live-row {
    border-top: 1px solid var(--rst-ui-divider-soft);
  }

  .live-row.is-success {
    --row-rgb: var(--rst-state-success-rgb);
  }

  .live-row.is-warning {
    --row-rgb: var(--rst-state-warning-rgb);
  }

  .live-row.is-danger {
    --row-rgb: var(--rst-state-danger-rgb);
  }

  .rail {
    height: 100%;
    display: grid;
    place-items: center;
  }

  .rail::before {
    content: '';
    position: absolute;
    left: 10px;
    top: 0;
    bottom: 0;
    width: 2px;
    background: rgba(var(--row-rgb), 0.22);
  }

  .rail i {
    position: relative;
    z-index: 1;
    width: 12px;
    height: 12px;
    border-radius: 50%;
    background: rgb(var(--row-rgb));
    box-shadow: 0 0 0 4px rgba(var(--row-rgb), 0.14);
  }

  .person {
    min-width: 0;
    display: grid;
    gap: 2px;
  }

  .person strong {
    overflow: hidden;
    font-size: 13px;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .time {
    color: var(--rst-ui-text);
    font-size: 12px;
    font-weight: var(--rst-fw-display);
  }

  .status {
    grid-column: 3;
    width: max-content;
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 4px 8px;
    border-radius: var(--rst-ui-radius-pill);
    color: rgb(var(--row-rgb));
    background: rgba(var(--row-rgb), 0.08);
    border: 1px solid rgba(var(--row-rgb), 0.2);
    font-size: 11px;
    font-weight: var(--rst-fw-bold);
  }

  .empty {
    min-height: 210px;
    display: grid;
    place-content: center;
    justify-items: center;
    padding: 28px;
    text-align: center;
  }

  .empty > span {
    width: 42px;
    height: 42px;
    display: grid;
    place-items: center;
    margin-bottom: 10px;
    border-radius: 50%;
    color: var(--rst-state-success-text);
    background: var(--rst-state-success-bg);
    border: 1px solid var(--rst-state-success-border);
  }

  .empty p {
    max-width: 320px;
    margin: 5px 0 0;
    color: var(--rst-ui-muted);
    font-size: 12px;
  }

  :global(.panel__foot a) {
    color: var(--rst-ui-panel-title);
    font-size: 12px;
    font-weight: var(--rst-fw-bold);
    text-decoration: none;
  }

  @media (max-width: 520px) {
    .live-row {
      grid-template-columns: 22px minmax(0, 1fr);
    }

    .time,
    .status {
      grid-column: 2;
    }
  }
</style>
