<script lang="ts">
  import { Settings } from '@lucide/svelte';
  import type { WorkspaceIcon } from './workspace-nav';

  let { name, size = 20 }: { name: WorkspaceIcon; size?: number } = $props();
</script>

<!-- One line-drawn set, single stroke weight, no fills: the icons identify a
     module without adding colour or decoration. -->
{#if name === 'settings'}
  <Settings {size} strokeWidth={1.6} aria-hidden="true" />
{:else}
<svg
  viewBox="0 0 24 24"
  width={size}
  height={size}
  fill="none"
  stroke="currentColor"
  stroke-width="1.6"
  stroke-linecap="round"
  stroke-linejoin="round"
  aria-hidden="true"
>
  {#if name === 'home'}
    <path d="M4 11 12 4l8 7" />
    <path d="M6 10v9h12v-9" />
  {:else if name === 'schedule'}
    <rect x="4" y="5" width="16" height="15" rx="2" />
    <path d="M4 9.5h16M9 3v4M15 3v4" />
    <path d="M8.5 13h.01M12 13h.01M15.5 13h.01M8.5 16.5h.01M12 16.5h.01" />
  {:else if name === 'time'}
    <circle cx="12" cy="12" r="8" />
    <path d="M12 7.5V12l3 1.8" />
  {:else if name === 'team'}
    <circle cx="9" cy="8" r="3.2" />
    <path d="M3.6 19a5.4 5.4 0 0 1 10.8 0" />
    <path d="M16.2 5.6a3.2 3.2 0 0 1 0 4.8M17.4 13.4a5.4 5.4 0 0 1 3 5" />
  {:else if name === 'documents'}
    <path d="M7 3.5h7l4 4V20H7z" />
    <path d="M14 3.5V8h4M4 7v13h10M10 12h5M10 15.5h5" />
  {:else if name === 'restaurant'}
    <path d="M4 9h16l-1.2-4H5.2z" />
    <path d="M5 9v10h14V9" />
    <path d="M9.5 19v-5h5v5" />
  {:else if name === 'reservations'}
    <path d="M4 19h16M6 19v-7a6 6 0 0 1 12 0v7" />
    <path d="M12 4v2M9 4h6M4 15h16" />
  {:else if name === 'inventory'}
    <path d="m12 3 8 4.2v9.6L12 21l-8-4.2V7.2z" />
    <path d="m4 7.2 8 4.3 8-4.3M12 11.5V21" />
  {:else if name === 'payroll'}
    <circle cx="12" cy="12" r="8" />
    <path d="M12 7.5v9M14.4 9.6a2.6 2.6 0 0 0-2.4-1.3c-1.5 0-2.4.8-2.4 1.9 0 2.6 4.8 1.4 4.8 4 0 1.2-1 2-2.4 2a2.7 2.7 0 0 1-2.5-1.4" />
  {:else if name === 'badge'}
    <rect x="4" y="4" width="16" height="16" rx="2" />
    <circle cx="10" cy="10" r="2.1" />
    <path d="M7 16.2a3.4 3.4 0 0 1 6 0M15 9.5h3M15 13h3" />
  {:else if name === 'reports'}
    <path d="M4 20V4M4 20h16" />
    <path d="M8.5 17v-5M13 17V8M17.5 17v-7" />
  {:else if name === 'exports'}
    <path d="M12 3v11M8 10l4 4 4-4" />
    <path d="M5 14v6h14v-6" />
  {/if}
</svg>
{/if}

<style>
  svg {
    flex: 0 0 auto;
    display: block;
  }
</style>
