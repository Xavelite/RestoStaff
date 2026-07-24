<script lang="ts">
  import { serviceLabel, type ServiceKey } from '$lib/calendar/date';
  import { t } from '$lib/i18n/i18n.svelte';

  let {
    service,
    variant = 'chip'
  }: {
    service: ServiceKey;
    /** chip = tinted pill with icon; text = coloured icon + plain label. */
    variant?: 'chip' | 'text';
  } = $props();

  // Lunch is daytime gold (☀), evening is indigo (☾). The colour is the
  // service's identity throughout the workspace.
  const glyph = $derived(service === 'evening' ? '☾' : '☀');
</script>

<span class="svc is-{service} is-{variant}">
  <span class="svc__glyph" aria-hidden="true">{glyph}</span>
  {t(serviceLabel(service))}
</span>

<style>
  .svc {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    font-size: 13px;
    font-weight: var(--rst-fw-medium);
    white-space: nowrap;
  }
  .svc__glyph {
    font-size: 13px;
    line-height: 1;
  }
  .svc.is-lunch .svc__glyph { color: var(--cl-lunch); }
  .svc.is-evening .svc__glyph { color: var(--cl-evening); }

  .svc.is-chip {
    padding: 3px 9px 3px 7px;
    border-radius: 999px;
  }
  .svc.is-chip.is-lunch {
    color: color-mix(in srgb, var(--cl-lunch) 80%, var(--cl-ink));
    background: var(--cl-lunch-wash);
  }
  .svc.is-chip.is-evening {
    color: color-mix(in srgb, var(--cl-evening) 78%, var(--cl-ink));
    background: var(--cl-evening-wash);
  }
</style>
