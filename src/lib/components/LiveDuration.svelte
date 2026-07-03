<script lang="ts">
  import { onMount } from 'svelte';

  let { since }: { since: string | null } = $props();

  let elapsedMs = $state(0);

  onMount(() => {
    if (!since) return;
    const start = new Date(since).getTime();
    if (!Number.isFinite(start)) return;
    const tick = () => (elapsedMs = Date.now() - start);
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  });

  const label = $derived.by(() => {
    if (elapsedMs <= 0) return '—';
    const totalSeconds = Math.floor(elapsedMs / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    return hours
      ? `${hours}h ${String(minutes).padStart(2, '0')}m`
      : `${minutes}m ${String(seconds).padStart(2, '0')}s`;
  });
</script>

<span class="live-duration">
  <i aria-hidden="true"></i>
  {label}
</span>

<style>
  .live-duration {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    font-variant-numeric: tabular-nums;
  }

  .live-duration i {
    width: 6px;
    height: 6px;
    border-radius: 999px;
    background: currentColor;
    animation: live-duration-pulse 1.6s ease-in-out infinite;
  }

  @keyframes live-duration-pulse {
    0%, 100% { opacity: 1; transform: scale(1); }
    50% { opacity: .4; transform: scale(.7); }
  }
</style>
