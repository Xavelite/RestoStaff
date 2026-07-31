<script lang="ts">
  import { serviceLabel, type ServiceKey } from '$lib/calendar/date';
  import { t } from '$lib/i18n/i18n.svelte';
  import WorkspaceServiceIcon from './WorkspaceServiceIcon.svelte';

  let {
    service,
    label,
    variant = 'chip'
  }: {
    service: ServiceKey;
    label?: string;
    /** chip = tinted pill with icon; text = coloured icon + plain label. */
    variant?: 'chip' | 'text';
  } = $props();

</script>

<span class="svc is-{service} is-{variant}">
  <span class="svc__glyph"><WorkspaceServiceIcon {service} size={13} /></span>
  {t(label || serviceLabel(service))}
</span>

<style>
  .svc {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    font-size: var(--rst-fs-body);
    font-weight: var(--rst-fw-medium);
    white-space: nowrap;
  }
  .svc__glyph {
    font-size: var(--rst-fs-body);
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
