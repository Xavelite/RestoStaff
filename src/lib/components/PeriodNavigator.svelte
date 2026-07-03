<script lang="ts">
  let {
    label,
    previousLabel,
    nextLabel,
    currentLabel,
    currentDisabled = false,
    onprevious,
    onnext,
    oncurrent
  }: {
    label: string;
    previousLabel: string;
    nextLabel: string;
    currentLabel?: string;
    currentDisabled?: boolean;
    onprevious: () => void;
    onnext: () => void;
    oncurrent?: () => void;
  } = $props();
</script>

<nav class="period-navigator" aria-label="Period navigation">
  <button type="button" class="period-navigator__step" aria-label={previousLabel} title={previousLabel} onclick={onprevious}>
    ‹
  </button>

  {#if oncurrent}
    <button
      type="button"
      class="period-navigator__current"
      aria-label={currentLabel ?? label}
      title={currentLabel ?? label}
      disabled={currentDisabled}
      onclick={oncurrent}
    >
      {label}
    </button>
  {:else}
    <span class="period-navigator__current" aria-current="date">{label}</span>
  {/if}

  <button type="button" class="period-navigator__step" aria-label={nextLabel} title={nextLabel} onclick={onnext}>
    ›
  </button>
</nav>

<style>
  .period-navigator {
    min-width: 0;
    display: inline-flex;
    align-items: center;
    gap: 6px;
  }

  .period-navigator__step,
  .period-navigator__current {
    min-height: 38px;
    border: 1px solid var(--rst-ui-line);
    border-radius: var(--rst-ui-radius-md);
    color: var(--rst-ui-text);
    background: var(--rst-ui-surface-field-strong);
    font: inherit;
    font-weight: var(--rst-fw-bold);
  }

  .period-navigator__step {
    width: 38px;
    display: grid;
    place-items: center;
    padding: 0;
    font-size: 22px;
    line-height: 1;
    cursor: pointer;
  }

  .period-navigator__current {
    min-width: clamp(142px, 18vw, 220px);
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding: 8px 12px;
    font-size: 12px;
    white-space: nowrap;
  }

  button.period-navigator__current {
    cursor: pointer;
  }

  button:hover:not(:disabled) {
    border-color: var(--rst-ui-line-strong);
    background: var(--rst-ui-hover-bg);
  }

  button:focus-visible {
    outline: 2px solid var(--rst-state-info);
    outline-offset: 2px;
  }

  button:disabled {
    opacity: 0.52;
    cursor: default;
  }

  @media (max-width: 520px) {
    .period-navigator {
      width: 100%;
    }

    .period-navigator__current {
      flex: 1 1 auto;
      min-width: 0;
    }
  }
</style>
