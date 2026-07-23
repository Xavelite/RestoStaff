<script lang="ts">
  // Purpose-built weather glyphs mapped from open-meteo's WMO weather code (the
  // same source as the temperature). Natural colours — golden sun, soft grey
  // cloud, blue rain — so each condition reads at a glance, unlike a single-tone
  // line icon.
  let { code, isDay = true, size = 18 }: { code: number; isDay?: boolean; size?: number } = $props();

  type Kind = 'clear' | 'partly' | 'overcast' | 'fog' | 'drizzle' | 'rain' | 'snow' | 'storm';
  const kind = $derived.by<Kind>(() => {
    if (code === 0) return 'clear';
    if (code === 1 || code === 2) return 'partly';
    if (code === 3) return 'overcast';
    if (code === 45 || code === 48) return 'fog';
    if ([51, 53, 55, 56, 57].includes(code)) return 'drizzle';
    if ([61, 63, 65, 66, 67, 80, 81, 82].includes(code)) return 'rain';
    if ([71, 73, 75, 77, 85, 86].includes(code)) return 'snow';
    if ([95, 96, 99].includes(code)) return 'storm';
    return 'overcast';
  });
</script>

<svg viewBox="0 0 24 24" width={size} height={size} fill="none" aria-hidden="true">
  {#if kind === 'clear' && isDay}
    <circle cx="12" cy="12" r="5" fill="#ffc531" />
    <g stroke="#ffc531" stroke-width="2" stroke-linecap="round">
      <line x1="12" y1="1.6" x2="12" y2="3.9" />
      <line x1="12" y1="20.1" x2="12" y2="22.4" />
      <line x1="1.6" y1="12" x2="3.9" y2="12" />
      <line x1="20.1" y1="12" x2="22.4" y2="12" />
      <line x1="4.5" y1="4.5" x2="6.1" y2="6.1" />
      <line x1="17.9" y1="17.9" x2="19.5" y2="19.5" />
      <line x1="19.5" y1="4.5" x2="17.9" y2="6.1" />
      <line x1="6.1" y1="17.9" x2="4.5" y2="19.5" />
    </g>
  {:else if kind === 'clear'}
    <path d="M13.5 3.2a7.2 7.2 0 1 0 7.3 9.6 5.9 5.9 0 0 1-7.3-9.6Z" fill="#dfe6ff" />
  {:else if kind === 'partly'}
    {#if isDay}
      <circle cx="8.4" cy="8" r="3.3" fill="#ffc531" />
      <g stroke="#ffc531" stroke-width="1.7" stroke-linecap="round">
        <line x1="8.4" y1="1.9" x2="8.4" y2="3.3" />
        <line x1="2.5" y1="8" x2="3.9" y2="8" />
        <line x1="4.2" y1="3.8" x2="5.2" y2="4.8" />
        <line x1="12.6" y1="3.8" x2="11.6" y2="4.8" />
        <line x1="4.2" y1="12.2" x2="5.2" y2="11.2" />
      </g>
    {:else}
      <path d="M9 3.6a5.4 5.4 0 1 0 5.5 7.2 4.4 4.4 0 0 1-5.5-7.2Z" fill="#dfe6ff" />
    {/if}
    <g fill="#c6d3e2">
      <circle cx="10.6" cy="15" r="3.1" />
      <circle cx="14.2" cy="12.9" r="4" />
      <circle cx="17.2" cy="15.3" r="2.8" />
      <rect x="9" y="14.4" width="9.7" height="4.2" rx="2.1" />
    </g>
  {:else if kind === 'overcast'}
    <g fill="#d6dfe9">
      <circle cx="7.5" cy="9.5" r="2.7" />
      <circle cx="11" cy="8" r="3.4" />
      <circle cx="14" cy="9.8" r="2.5" />
      <rect x="6" y="9" width="9.3" height="3.6" rx="1.8" />
    </g>
    <g fill="#b9c6d6">
      <circle cx="9.5" cy="15" r="3.1" />
      <circle cx="13.2" cy="12.9" r="4" />
      <circle cx="16.4" cy="15.3" r="2.9" />
      <rect x="8" y="14.4" width="9.9" height="4.2" rx="2.1" />
    </g>
  {:else if kind === 'fog'}
    <g fill="#cad4df">
      <circle cx="8.5" cy="10.5" r="3.1" />
      <circle cx="12.2" cy="8.6" r="4" />
      <circle cx="15.4" cy="10.8" r="2.9" />
      <rect x="7" y="10" width="9.9" height="3.8" rx="1.9" />
    </g>
    <g stroke="#b7c3cf" stroke-width="1.9" stroke-linecap="round">
      <line x1="6.5" y1="17.6" x2="15.5" y2="17.6" />
      <line x1="8.5" y1="20.6" x2="17.5" y2="20.6" />
    </g>
  {:else if kind === 'drizzle' || kind === 'rain'}
    <g fill="#c6d3e2">
      <circle cx="8.6" cy="10.5" r="3.1" />
      <circle cx="12.3" cy="8.6" r="4" />
      <circle cx="15.5" cy="10.8" r="2.9" />
      <rect x="7.1" y="10" width="9.9" height="3.8" rx="1.9" />
    </g>
    <g stroke={kind === 'rain' ? '#4aa3ff' : '#8fd0ff'} stroke-width={kind === 'rain' ? 2.1 : 1.8} stroke-linecap="round">
      <line x1="9" y1="16.4" x2="7.8" y2="19.6" />
      <line x1="12.4" y1="16.6" x2="11.2" y2="20.4" />
      <line x1="15.6" y1="16.4" x2="14.4" y2="19.6" />
    </g>
  {:else if kind === 'snow'}
    <g fill="#c6d3e2">
      <circle cx="8.6" cy="10.5" r="3.1" />
      <circle cx="12.3" cy="8.6" r="4" />
      <circle cx="15.5" cy="10.8" r="2.9" />
      <rect x="7.1" y="10" width="9.9" height="3.8" rx="1.9" />
    </g>
    <g fill="#dcf0ff">
      <circle cx="8.6" cy="18" r="1.15" />
      <circle cx="12.2" cy="19" r="1.15" />
      <circle cx="15.6" cy="18" r="1.15" />
    </g>
  {:else if kind === 'storm'}
    <g fill="#b6c3d3">
      <circle cx="8.6" cy="10" r="3.1" />
      <circle cx="12.3" cy="8.1" r="4" />
      <circle cx="15.5" cy="10.3" r="2.9" />
      <rect x="7.1" y="9.5" width="9.9" height="3.8" rx="1.9" />
    </g>
    <path d="M12.8 14.5 8.6 20h2.6l-1 3.4 4.4-5.6h-2.7l1.4-3.3z" fill="#ffca28" />
  {/if}
</svg>
