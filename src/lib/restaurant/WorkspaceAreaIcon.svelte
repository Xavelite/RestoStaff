<script lang="ts">
  let {
    icon = '',
    color = 'var(--cl-muted)',
    size = 18,
    compact = false
  }: {
    icon?: string | null;
    color?: string | null;
    size?: number;
    compact?: boolean;
  } = $props();

  const group = $derived(
    ['bar', 'counter', 'cellar'].includes(icon ?? '')
      ? 'bar'
      : ['terrace', 'outdoor'].includes(icon ?? '')
        ? 'outdoor'
        : ['kitchen', 'hot-kitchen', 'cold-kitchen', 'preparation', 'pastry', 'bakery'].includes(icon ?? '')
          ? 'kitchen'
          : icon === 'dishwashing'
            ? 'dishwashing'
            : ['takeaway', 'drive-through', 'delivery'].includes(icon ?? '')
              ? 'takeaway'
              : ['storage', 'receiving'].includes(icon ?? '')
                ? 'storage'
                : ['office', 'staff-room', 'cloakroom'].includes(icon ?? '')
                  ? 'support'
                  : ['reception'].includes(icon ?? '')
                    ? 'reception'
                    : icon === 'contract'
                      ? 'contract'
                      : 'dining'
  );
</script>

<span
  class="area-icon"
  class:is-compact={compact}
  style={`--area-icon-color:${color || 'var(--cl-muted)'};--area-icon-size:${size}px`}
  aria-hidden="true"
>
  <svg
    viewBox="0 0 24 24"
    width={size}
    height={size}
    fill="none"
    stroke="currentColor"
    stroke-width="1.7"
    stroke-linecap="round"
    stroke-linejoin="round"
  >
    {#if group === 'bar'}
      <path d="M6 4h12l-2.1 6.2a4.1 4.1 0 0 1-7.8 0z" />
      <path d="M12 14.2V20M8.5 20h7" />
    {:else if group === 'outdoor'}
      <path d="M12 4v3M12 17v3M4 12h3M17 12h3M6.3 6.3l2.1 2.1M15.6 15.6l2.1 2.1M17.7 6.3l-2.1 2.1M8.4 15.6l-2.1 2.1" />
      <circle cx="12" cy="12" r="3.4" />
    {:else if group === 'kitchen'}
      <path d="M7 11.5a4.5 4.5 0 0 1 1.4-8.8A4.6 4.6 0 0 1 12 4.2a4.6 4.6 0 0 1 3.6-1.5 4.5 4.5 0 0 1 1.4 8.8" />
      <path d="M7 10.5V20h10v-9.5M9.5 16h5" />
    {:else if group === 'dishwashing'}
      <circle cx="12" cy="13" r="6.5" />
      <circle cx="12" cy="13" r="3.2" />
      <path d="M7 4.5 8.2 3l1.2 1.5M14.5 4.5 15.7 3l1.2 1.5" />
    {:else if group === 'takeaway'}
      <path d="M6 8h12l-1 12H7zM9 8a3 3 0 0 1 6 0" />
      <path d="M10 13h4" />
    {:else if group === 'storage'}
      <path d="m4 8 8-4 8 4-8 4zM4 8v8l8 4 8-4V8M12 12v8" />
    {:else if group === 'support'}
      <rect x="5" y="5" width="14" height="15" rx="2" />
      <path d="M9 5V3h6v2M8.5 10h7M8.5 14h7" />
    {:else if group === 'reception'}
      <path d="M5 18h14M7 18v-2a5 5 0 0 1 10 0v2" />
      <path d="M12 7v2M9.5 7h5M4 13h16" />
    {:else if group === 'contract'}
      <!-- Not an area, but the shared glyph the pickers use for a contract. -->
      <path d="M6.2 4.2h7.4l4.1 4.1v11.5H6.2z" />
      <path d="M13.6 4.2v4.1h4.1M9.2 12h5.8M9.2 15.6h5.8" />
    {:else}
      <path d="M5 9h14M7 9v10M17 9v10M4 19h16" />
      <path d="M8 5h8l1 4H7z" />
    {/if}
  </svg>
</span>

<style>
  .area-icon {
    width: 32px;
    height: 32px;
    display: grid;
    flex: 0 0 auto;
    place-items: center;
    border: 1px solid color-mix(in srgb, var(--area-icon-color) 30%, var(--cl-line));
    border-radius: 7px;
    background: color-mix(in srgb, var(--area-icon-color) 10%, var(--cl-surface));
    color: color-mix(in srgb, var(--area-icon-color) 82%, var(--cl-ink));
  }
  .area-icon.is-compact {
    width: var(--area-icon-size);
    height: var(--area-icon-size);
    border: 0;
    border-radius: 0;
    background: transparent;
    color: color-mix(in srgb, var(--area-icon-color) 88%, var(--cl-ink));
  }
</style>
