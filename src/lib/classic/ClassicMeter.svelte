<script lang="ts">
  let {
    value,
    label,
    tone
  }: {
    /** 0..1 fill. Clamped. */
    value: number | null;
    /** The text shown beside the bar, e.g. "82%". */
    label: string;
    /** Colours the fill; when absent it derives from the value (an adherence
        meter reads green when close to full, amber mid, red when low). */
    tone?: 'ok' | 'attention' | 'problem';
  } = $props();

  const pct = $derived(Math.round(Math.min(1, Math.max(0, value ?? 0)) * 100));
  const derivedTone = $derived(
    tone ?? (value === null ? 'none' : value >= 0.9 ? 'ok' : value >= 0.7 ? 'attention' : 'problem')
  );
</script>

<span class="meter is-{derivedTone}">
  <span class="meter__track"><span class="meter__fill" style="width:{pct}%"></span></span>
  <span class="meter__label">{label}</span>
</span>

<style>
  .meter {
    display: inline-grid;
    grid-template-columns: minmax(56px, 1fr) auto;
    align-items: center;
    gap: 8px;
    width: 100%;
    min-width: 96px;
  }
  .meter__track {
    height: 6px;
    border-radius: 999px;
    background: var(--cl-line);
    overflow: hidden;
  }
  .meter__fill {
    display: block;
    height: 100%;
    border-radius: 999px;
    background: var(--cl-line-strong);
    transition: width var(--cl-dur-slow) var(--cl-ease);
  }
  .meter__label {
    font-size: 13px;
    font-variant-numeric: tabular-nums;
    color: var(--cl-ink);
  }
  .is-ok .meter__fill { background: var(--cl-ok); }
  .is-attention .meter__fill { background: var(--cl-attention); }
  .is-problem .meter__fill { background: var(--cl-problem); }
  .is-none .meter__label { color: var(--cl-muted); }
</style>
