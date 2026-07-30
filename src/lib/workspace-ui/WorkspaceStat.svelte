<script lang="ts">
  import { t } from '$lib/i18n/i18n.svelte';

  let {
    label,
    value = 0,
    format = (n: number) => String(n),
    text,
    tone,
    accent,
    mutedZero = true
  }: {
    label: string;
    /** The number this stat counts up to. Ignored when `text` is given. */
    value?: number;
    /** Renders each animation frame's number (hours, money, percent…). */
    format?: (n: number) => string;
    /** A stat that is inherently a string ("3 / 6"): shown as-is, no count. */
    text?: string;
    /** Ties the rail and value to a meaning. */
    tone?: 'ok' | 'attention' | 'problem';
    /** A module-identity colour for the rail when there is no tone. */
    accent?: string;
    mutedZero?: boolean;
  } = $props();

  const isZero = $derived(text === undefined && value === 0);

  // Count from the previous value to the new one, formatting each frame, so a
  // stat that changes (period switch, live refresh) rolls rather than jumps.
  // The effect below sets the first frame, so display starts empty.
  let display = $state('');
  let from = 0;

  $effect(() => {
    if (text !== undefined) {
      display = text;
      return;
    }
    const to = value;
    const start = from;
    from = to;
    if (typeof window === 'undefined' ||
        window.matchMedia('(prefers-reduced-motion: reduce)').matches ||
        start === to) {
      display = format(to);
      return;
    }
    const t0 = performance.now();
    let raf = 0;
    const step = (now: number) => {
      const p = Math.min(1, (now - t0) / 600);
      const eased = 1 - Math.pow(1 - p, 3);
      const frame = start + (to - start) * eased;
      // Integer counters should still tick through whole values, while hours,
      // money and percentages must retain their real precision.
      display = format(
        p === 1 ? to : Number.isInteger(start) && Number.isInteger(to) ? Math.round(frame) : frame
      );
      if (p < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  });
</script>

<div class="cl-stat" class:is-ok={tone === 'ok'} class:is-attention={tone === 'attention'} class:is-problem={tone === 'problem'} style={accent && !tone ? `--stat-accent:${accent}` : undefined}>
  <span class="cl-stat__label">{t(label)}</span>
  <span class="cl-stat__value" class:is-word={text !== undefined} class:is-zero={mutedZero && isZero}>{display}</span>
</div>
