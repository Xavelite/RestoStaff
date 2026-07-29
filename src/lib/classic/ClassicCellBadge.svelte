<script lang="ts">
  import { t } from '$lib/i18n/i18n.svelte';

  export type ClassicCellBadgeIcon =
    | 'check'
    | 'clock'
    | 'contract'
    | 'key'
    | 'lock'
    | 'minus'
    | 'user'
    | 'warning';

  let {
    label,
    params,
    tone = 'neutral',
    icon = 'minus'
  }: {
    label: string;
    params?: Record<string, string | number>;
    tone?: 'neutral' | 'info' | 'success' | 'warning' | 'danger';
    icon?: ClassicCellBadgeIcon;
  } = $props();
</script>

<span class="cell-badge is-{tone}">
  <span class="cell-badge__icon" aria-hidden="true">
    <svg
      viewBox="0 0 20 20"
      width="14"
      height="14"
      fill="none"
      stroke="currentColor"
      stroke-width="1.7"
      stroke-linecap="round"
      stroke-linejoin="round"
    >
      {#if icon === 'check'}
        <path d="m5.2 10.2 3 3 6.6-6.6" />
      {:else if icon === 'clock'}
        <circle cx="10" cy="10" r="6.2" />
        <path d="M10 6.5v3.8l2.5 1.5" />
      {:else if icon === 'contract'}
        <path d="M5.2 3.5h6.2l3.4 3.4v9.6H5.2z" />
        <path d="M11.4 3.5v3.4h3.4M7.7 10h4.8M7.7 13h4.8" />
      {:else if icon === 'key'}
        <circle cx="7.1" cy="10.2" r="3.1" />
        <path d="m10 9.2 5-5M12.4 6.8l1.5 1.5M14 5.2l1.5 1.5" />
      {:else if icon === 'lock'}
        <rect x="4.8" y="8.6" width="10.4" height="7.6" rx="1.8" />
        <path d="M7.2 8.6V6.7a2.8 2.8 0 0 1 5.6 0v1.9" />
      {:else if icon === 'user'}
        <circle cx="10" cy="7" r="2.8" />
        <path d="M4.8 16a5.2 5.2 0 0 1 10.4 0" />
      {:else if icon === 'warning'}
        <path d="M10 3.5 17 16H3z" />
        <path d="M10 7.4v4M10 14h.01" />
      {:else}
        <path d="M6 10h8" />
      {/if}
    </svg>
  </span>
  <span>{t(label, params ?? {})}</span>
</span>

<style>
  .cell-badge {
    --badge-color: var(--cl-muted);
    --badge-wash: var(--cl-surface-muted);
    --badge-line: var(--cl-line);
    display: inline-flex;
    align-items: center;
    gap: 6px;
    min-height: 26px;
    padding: 3px 9px 3px 7px;
    border: 1px solid var(--badge-line);
    border-radius: 6px;
    color: color-mix(in srgb, var(--badge-color) 76%, var(--cl-ink));
    background: var(--badge-wash);
    font-size: 12px;
    font-weight: var(--rst-fw-bold);
    line-height: 1.2;
    white-space: nowrap;
  }

  .cell-badge__icon {
    width: 16px;
    height: 16px;
    flex: 0 0 auto;
    display: grid;
    place-items: center;
    color: var(--badge-color);
  }

  .cell-badge.is-info {
    --badge-color: color-mix(in srgb, var(--cl-info) 83%, #183b63);
    --badge-wash: color-mix(in srgb, var(--cl-info) 9%, var(--cl-surface));
    --badge-line: color-mix(in srgb, var(--cl-info) 26%, var(--cl-line));
  }

  .cell-badge.is-success {
    --badge-color: color-mix(in srgb, var(--cl-ok) 85%, #123b2d);
    --badge-wash: color-mix(in srgb, var(--cl-ok) 10%, var(--cl-surface));
    --badge-line: color-mix(in srgb, var(--cl-ok) 28%, var(--cl-line));
  }

  .cell-badge.is-warning {
    --badge-color: color-mix(in srgb, var(--cl-attention) 86%, #5f3500);
    --badge-wash: color-mix(in srgb, var(--cl-attention) 10%, var(--cl-surface));
    --badge-line: color-mix(in srgb, var(--cl-attention) 28%, var(--cl-line));
  }

  .cell-badge.is-danger {
    --badge-color: color-mix(in srgb, var(--cl-problem) 86%, #5e1e1e);
    --badge-wash: color-mix(in srgb, var(--cl-problem) 9%, var(--cl-surface));
    --badge-line: color-mix(in srgb, var(--cl-problem) 26%, var(--cl-line));
  }
</style>
