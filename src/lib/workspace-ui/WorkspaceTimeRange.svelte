<script lang="ts">
  import { t } from '$lib/i18n/i18n.svelte';

  let {
    start = $bindable(''),
    end = $bindable(''),
    startLabel = '',
    endLabel = '',
    startAriaLabel = '',
    endAriaLabel = '',
    disabled = false,
    compact = false,
    onchange
  }: {
    start?: string;
    end?: string;
    startLabel?: string;
    endLabel?: string;
    startAriaLabel?: string;
    endAriaLabel?: string;
    disabled?: boolean;
    compact?: boolean;
    onchange?: () => void;
  } = $props();
</script>

<span class="time-range" class:is-compact={compact} class:has-labels={startLabel || endLabel}>
  <label>
    {#if startLabel}<span>{startLabel}</span>{/if}
    <input
      class="cl-field"
      type="time"
      aria-label={startAriaLabel || startLabel || t('Start')}
      {disabled}
      bind:value={start}
      oninput={onchange}
    />
  </label>
  <i aria-hidden="true">&ndash;</i>
  <label>
    {#if endLabel}<span>{endLabel}</span>{/if}
    <input
      class="cl-field"
      type="time"
      aria-label={endAriaLabel || endLabel || t('End')}
      {disabled}
      bind:value={end}
      oninput={onchange}
    />
  </label>
</span>

<style>
  .time-range {
    --time-field-width: 78px;
    min-width: 0;
    display: inline-grid;
    grid-template-columns: minmax(0, var(--time-field-width)) 8px minmax(0, var(--time-field-width));
    align-items: center;
    gap: 5px;
  }
  .time-range.is-compact { --time-field-width: 64px; }
  .time-range.has-labels { align-items: end; }
  label {
    min-width: 0;
    display: grid;
    gap: 4px;
  }
  label > span {
    overflow: hidden;
    color: var(--cl-muted);
    font-size: var(--rst-fs-caption);
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  input.cl-field {
    width: 100%;
    min-width: 0;
    min-height: 32px;
    padding: 4px;
    border-color: transparent;
    color: var(--cl-ink);
    background: color-mix(in srgb, var(--cl-surface-muted) 76%, var(--cl-surface));
    font-size: var(--rst-fs-label);
    font-weight: var(--rst-fw-medium);
    font-variant-numeric: tabular-nums;
    text-align: center;
  }
  input:hover:not(:disabled),
  input:focus {
    border-color: color-mix(in srgb, var(--cl-accent) 40%, var(--cl-line-strong));
    background: var(--cl-surface);
  }
  .is-compact input[type='time']::-webkit-calendar-picker-indicator {
    display: none;
    -webkit-appearance: none;
  }
  .is-compact input[type='time']::-webkit-datetime-edit {
    padding: 0;
  }
  i {
    padding-bottom: 1px;
    color: var(--cl-muted);
    font-style: normal;
    text-align: center;
  }
  .has-labels i { padding-bottom: 9px; }
</style>
