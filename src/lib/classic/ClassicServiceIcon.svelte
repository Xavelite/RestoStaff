<script lang="ts">
  import type { ServiceKey } from '$lib/calendar/date';

  let {
    service = 'lunch',
    name,
    size = 12
  }: {
    service?: ServiceKey;
    name?: 'break' | 'span';
    size?: number;
  } = $props();

  const kind = $derived(name ?? service);
</script>

<svg
  class="service-icon is-{kind}"
  width={size}
  height={size}
  viewBox="0 0 24 24"
  fill="none"
  stroke="currentColor"
  stroke-width="1.8"
  stroke-linecap="round"
  stroke-linejoin="round"
  aria-hidden="true"
>
  {#if kind === 'lunch'}
    <circle cx="12" cy="12" r="3.4" fill="currentColor" stroke="none" />
    <path d="M12 2.5v2.2M12 19.3v2.2M2.5 12h2.2M19.3 12h2.2M5.3 5.3l1.6 1.6M17.1 17.1l1.6 1.6M18.7 5.3l-1.6 1.6M6.9 17.1l-1.6 1.6" />
  {:else if kind === 'evening'}
    <path d="M20.1 15.2A8.3 8.3 0 0 1 8.8 3.9a8.4 8.4 0 1 0 11.3 11.3Z" fill="currentColor" stroke="none" />
  {:else if kind === 'break'}
    <path d="M5 9h11v6.2A3.8 3.8 0 0 1 12.2 19H8.8A3.8 3.8 0 0 1 5 15.2V9Z" />
    <path d="M16 11h1.3a2.2 2.2 0 0 1 0 4.4H16M8 5.2c0 1.1 1 1.2 1 2.3M12 5.2c0 1.1 1 1.2 1 2.3" />
  {:else}
    <path d="M4 8h16M4 8l3-3M4 8l3 3M20 16H4M20 16l-3-3M20 16l-3 3" />
  {/if}
</svg>

<style>
  .service-icon {
    display: block;
    flex: 0 0 auto;
    overflow: visible;
  }
</style>
