<script lang="ts">
  let {
    label,
    tone = 'neutral'
  }: {
    label: string;
    tone?: 'neutral' | 'info' | 'success' | 'warning' | 'danger' | 'absence';
  } = $props();
</script>

<span class="pill is-{tone}">{label}</span>

<style>
  .pill {
    --pill-rgb: var(--rst-state-neutral-rgb);
    --pill-text: var(--rst-state-neutral-text);
    display: inline-flex;
    align-items: center;
    min-height: 24px;
    padding: 3px 8px;
    border: 1px solid rgba(var(--pill-rgb), .28);
    border-radius: var(--rst-ui-radius-pill);
    color: var(--pill-text);
    background: rgba(var(--pill-rgb), .1);
    font-size: 10px;
    font-weight: var(--rst-fw-bold);
    line-height: 1;
    white-space: nowrap;
  }
  .is-info { --pill-rgb: var(--rst-state-info-rgb); --pill-text: var(--rst-state-info-text); }
  .is-success { --pill-rgb: var(--rst-state-success-rgb); --pill-text: var(--rst-state-success-text); }
  .is-warning { --pill-rgb: var(--rst-state-warning-rgb); --pill-text: var(--rst-state-warning-text); }
  .is-danger { --pill-rgb: var(--rst-state-danger-rgb); --pill-text: var(--rst-state-danger-text); }
  .is-absence { --pill-rgb: var(--rst-state-absence-rgb); --pill-text: var(--rst-state-absence-text); }
</style>
