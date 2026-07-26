<script lang="ts">
  import { t } from '$lib/i18n/i18n.svelte';
  import { reservationStatusMeta } from './reservation-status';
  import type { ReservationStatus } from './reservation-types';

  let { status }: { status: ReservationStatus } = $props();
  const meta = $derived(reservationStatusMeta(status));
</script>

<span class="reservation-status is-{meta.tone}">
  <i aria-hidden="true">{meta.symbol}</i>
  {t(meta.label)}
</span>

<style>
  .reservation-status {
    display: inline-flex;
    min-height: 22px;
    align-items: center;
    gap: 5px;
    padding: 2px 8px 2px 5px;
    border: 1px solid var(--cl-line-strong);
    border-radius: 999px;
    background: var(--cl-surface);
    color: var(--cl-muted);
    font-size: 11px;
    font-weight: var(--rst-fw-bold);
    line-height: 1;
    white-space: nowrap;
  }
  i {
    width: 14px;
    height: 14px;
    display: grid;
    place-items: center;
    border-radius: 50%;
    background: var(--cl-surface-muted);
    font-size: 9px;
    font-style: normal;
  }
  .is-pending { border-color: color-mix(in srgb, var(--cl-attention) 45%, var(--cl-line)); color: var(--cl-attention); }
  .is-pending i { background: color-mix(in srgb, var(--cl-attention) 16%, white); }
  .is-confirmed { border-color: color-mix(in srgb, var(--cl-info) 48%, var(--cl-line)); color: var(--cl-info); }
  .is-confirmed i { background: color-mix(in srgb, var(--cl-info) 14%, white); }
  .is-live { border-color: color-mix(in srgb, var(--cl-ok) 50%, var(--cl-line)); color: var(--cl-ok); }
  .is-live i { background: color-mix(in srgb, var(--cl-ok) 14%, white); }
  .is-done { color: var(--cl-muted); }
  .is-problem { border-color: color-mix(in srgb, var(--cl-problem) 50%, var(--cl-line)); color: var(--cl-problem); }
  .is-problem i { background: color-mix(in srgb, var(--cl-problem) 14%, white); }
</style>
