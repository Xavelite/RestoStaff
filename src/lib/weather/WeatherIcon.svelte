<script lang="ts">
  import Cloud from '@lucide/svelte/icons/cloud';
  import CloudDrizzle from '@lucide/svelte/icons/cloud-drizzle';
  import CloudFog from '@lucide/svelte/icons/cloud-fog';
  import CloudLightning from '@lucide/svelte/icons/cloud-lightning';
  import CloudMoon from '@lucide/svelte/icons/cloud-moon';
  import CloudRain from '@lucide/svelte/icons/cloud-rain';
  import CloudSnow from '@lucide/svelte/icons/cloud-snow';
  import CloudSun from '@lucide/svelte/icons/cloud-sun';
  import Moon from '@lucide/svelte/icons/moon';
  import Sun from '@lucide/svelte/icons/sun';

  let { code, isDay = true, size = 18 }: { code: number; isDay?: boolean; size?: number } = $props();

  // Each condition gets its own weather-true colour so a sun and a cloud never
  // read as the same glyph. Colours are set directly on the icon, so they are
  // not flattened by the badge's text colour.
  const color = $derived.by(() => {
    if (code === 0) return isDay ? '#ffd23f' : '#cdd7fb'; // clear sky
    if (code === 1 || code === 2) return isDay ? '#ffce54' : '#c3cef0'; // mostly / partly
    if (code === 3) return '#c6d3e0'; // overcast
    if (code === 45 || code === 48) return '#b7c3cf'; // fog
    if ([51, 53, 55, 56, 57].includes(code)) return '#8fd0ff'; // drizzle
    if ([61, 63, 65, 66, 67, 80, 81, 82].includes(code)) return '#48a7ff'; // rain
    if ([71, 73, 75, 77, 85, 86].includes(code)) return '#dcf2ff'; // snow
    if ([95, 96, 99].includes(code)) return '#b79cff'; // thunderstorm
    return '#c6d3e0';
  });
</script>

{#if code === 0}
  {#if isDay}<Sun {size} {color} strokeWidth={2.25} />{:else}<Moon {size} {color} strokeWidth={2.25} />{/if}
{:else if code === 1}
  {#if isDay}<CloudSun {size} {color} strokeWidth={2.25} />{:else}<CloudMoon {size} {color} strokeWidth={2.25} />{/if}
{:else if code === 2}
  <CloudSun {size} {color} strokeWidth={2.25} />
{:else if code === 3}
  <Cloud {size} {color} strokeWidth={2.25} />
{:else if code === 45 || code === 48}
  <CloudFog {size} {color} strokeWidth={2.25} />
{:else if [51, 53, 55, 56, 57].includes(code)}
  <CloudDrizzle {size} {color} strokeWidth={2.25} />
{:else if [61, 63, 65, 66, 67, 80, 81, 82].includes(code)}
  <CloudRain {size} {color} strokeWidth={2.25} />
{:else if [71, 73, 75, 77, 85, 86].includes(code)}
  <CloudSnow {size} {color} strokeWidth={2.25} />
{:else if [95, 96, 99].includes(code)}
  <CloudLightning {size} {color} strokeWidth={2.25} />
{:else}
  <CloudSun {size} {color} strokeWidth={2.25} />
{/if}
