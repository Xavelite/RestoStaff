<script lang="ts">
  let {
    items,
    hint = ''
  }: {
    items: Array<{ tone: string; label: string }>;
    hint?: string;
  } = $props();
</script>

<div class="roster-legend">
  {#each items as item (`${item.tone}:${item.label}`)}
    <span class="roster-legend__item">
      <i class="roster-legend__swatch is-{item.tone}" aria-hidden="true"></i>
      {item.label}
    </span>
  {/each}
  {#if hint}<span class="roster-legend__hint">{hint}</span>{/if}
</div>

<style>
  .roster-legend {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 14px;
    padding: 10px 68px 0 2px;
    color: var(--cl-muted);
    font-size: var(--rst-fs-label);
  }

  .roster-legend__item {
    display: inline-flex;
    align-items: center;
    gap: 6px;
  }

  .roster-legend__swatch {
    width: 12px;
    height: 12px;
    position: relative;
    flex: 0 0 auto;
    border: 1px solid var(--cl-line);
    border-radius: 3px;
    background: var(--cl-surface-muted);
  }

  .roster-legend__swatch.is-available {
    border-color: color-mix(in srgb, var(--cl-ok) 22%, var(--cl-line));
    background: color-mix(in srgb, var(--cl-ok) 12%, var(--cl-surface));
  }

  .roster-legend__swatch.is-area {
    border-left: 3px solid var(--cl-info);
    background: var(--cl-info-wash);
  }

  .roster-legend__swatch.is-conflict {
    border-color: var(--cl-problem-line);
    box-shadow: inset 0 0 0 1px var(--cl-problem);
  }

  .roster-legend__swatch.is-absence {
    background: repeating-linear-gradient(
      -45deg,
      var(--cl-surface-muted),
      var(--cl-surface-muted) 3px,
      var(--cl-surface) 3px,
      var(--cl-surface) 6px
    );
  }

  .roster-legend__swatch.is-planned {
    border-style: dashed;
    border-color: color-mix(in srgb, var(--cl-muted) 42%, var(--cl-line));
    background: var(--cl-surface);
  }

  .roster-legend__swatch:is(.is-live, .is-attention, .is-problem) {
    border-color: transparent;
    background: transparent;
  }

  .roster-legend__swatch:is(.is-live, .is-attention, .is-problem)::after {
    content: '';
    width: 7px;
    height: 7px;
    position: absolute;
    inset: 50% auto auto 50%;
    border-radius: 50%;
    background: var(--legend-signal);
    box-shadow: 0 0 0 3px color-mix(in srgb, var(--legend-signal) 12%, transparent);
    transform: translate(-50%, -50%);
  }

  .roster-legend__swatch.is-live { --legend-signal: var(--cl-ok); }
  .roster-legend__swatch.is-attention { --legend-signal: var(--cl-attention); }
  .roster-legend__swatch.is-problem { --legend-signal: var(--cl-problem); }

  .roster-legend__hint {
    margin-left: auto;
  }

  @media (max-width: 760px) {
    .roster-legend { display: none; }
  }
</style>
