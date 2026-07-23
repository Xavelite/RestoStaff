<script lang="ts">
  import { t } from '$lib/i18n/i18n.svelte';

  let {
    label,
    params,
    tone = 'ok'
  }: {
    label: string;
    /** Values for a label with {placeholders}, e.g. "{count} short". */
    params?: Record<string, string | number>;
    /** ok = nothing to do, attention = needs a look, problem = blocks work. */
    tone?: 'ok' | 'attention' | 'problem';
  } = $props();

  const SYMBOL = { ok: '✓', attention: '!', problem: '✕' } as const;
</script>

<!-- Symbol first, then the word. Colour is never the only signal. -->
<span class="cl-status is-{tone}">
  <span class="cl-status__symbol" aria-hidden="true">{SYMBOL[tone]}</span>
  {t(label, params ?? {})}
</span>
