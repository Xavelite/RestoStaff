<script lang="ts">
  import ClassicCellBadge, { type ClassicCellBadgeIcon } from './ClassicCellBadge.svelte';

  let {
    label,
    params,
    tone = 'ok',
    icon
  }: {
    label: string;
    /** Values for a label with {placeholders}, e.g. "{count} short". */
    params?: Record<string, string | number>;
    /** info = expected state, ok = complete, attention = needs a look, problem = blocks work. */
    tone?: 'neutral' | 'info' | 'ok' | 'attention' | 'problem';
    /** Override the default semantic icon when a domain needs a more specific signal. */
    icon?: ClassicCellBadgeIcon;
  } = $props();

  const BADGE_TONE = {
    neutral: 'neutral',
    info: 'info',
    ok: 'success',
    attention: 'warning',
    problem: 'danger'
  } as const;

  const BADGE_ICON = {
    neutral: 'minus',
    info: 'clock',
    ok: 'check',
    attention: 'clock',
    problem: 'warning'
  } as const satisfies Record<'neutral' | 'info' | 'ok' | 'attention' | 'problem', ClassicCellBadgeIcon>;
</script>

<!-- Backward-compatible semantic adapter for the shared workspace cell badge. -->
<ClassicCellBadge {label} {params} tone={BADGE_TONE[tone]} icon={icon ?? BADGE_ICON[tone]} />
