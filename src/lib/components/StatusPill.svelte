<script lang="ts">
  import { t } from '$lib/i18n/i18n.svelte';
  let {
    label,
    tone = 'neutral'
  }: {
    label: string;
    tone?: 'neutral' | 'info' | 'success' | 'warning' | 'danger' | 'absence';
  } = $props();
</script>

<span class="pill is-{tone}">{t(label)}</span>

<style>
  .pill {
    --pill-rgb: var(--rst-state-neutral-rgb);
    --pill-text: var(--rst-state-neutral-text);
    display: inline-flex;
    align-items: center;
    gap: 6px;
    min-height: 26px;
    padding: 3px 9px 3px 7px;
    border: 1px solid rgba(var(--pill-rgb), .28);
    border-radius: var(--rst-ui-radius-md);
    color: var(--pill-text);
    background: rgba(var(--pill-rgb), .1);
    font-size: 11px;
    font-weight: var(--rst-fw-bold);
    line-height: 1;
    white-space: nowrap;
  }
  .pill::before {
    content: '';
    width: 6px;
    height: 6px;
    flex: 0 0 auto;
    border-radius: 50%;
    background: rgb(var(--pill-rgb));
  }
  .is-info { --pill-rgb: var(--rst-state-info-rgb); --pill-text: var(--rst-state-info-text); }
  .is-success { --pill-rgb: var(--rst-state-success-rgb); --pill-text: var(--rst-state-success-text); }
  .is-warning { --pill-rgb: var(--rst-state-warning-rgb); --pill-text: var(--rst-state-warning-text); }
  .is-danger { --pill-rgb: var(--rst-state-danger-rgb); --pill-text: var(--rst-state-danger-text); }
  .is-absence { --pill-rgb: var(--rst-state-absence-rgb); --pill-text: var(--rst-state-absence-text); }
</style>
