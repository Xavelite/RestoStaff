<script lang="ts">
  let {
    code,
    size = 22
  }: {
    code: number;
    size?: number;
  } = $props();

  const clear = $derived(code === 0);
  const mostlyClear = $derived(code === 1);
  const partlyCloudy = $derived(code === 2);
  const overcast = $derived(code === 3);
  const fog = $derived(code === 45 || code === 48);
  const drizzle = $derived([51, 53, 55, 56, 57].includes(code));
  const rain = $derived([61, 63, 65, 66, 67, 80, 81, 82].includes(code));
  const snow = $derived([71, 73, 75, 77, 85, 86].includes(code));
  const thunder = $derived([95, 96, 99].includes(code));
  const cloudy = $derived(overcast || fog || drizzle || rain || snow || thunder);
</script>

<svg
  class="weather-icon"
  class:is-clear={clear}
  class:is-mostly-clear={mostlyClear}
  class:is-partly-cloudy={partlyCloudy}
  class:is-wet={drizzle || rain || thunder}
  class:is-snow={snow}
  width={size}
  height={size}
  viewBox="0 0 32 32"
  fill="none"
  stroke-linecap="round"
  stroke-linejoin="round"
  aria-hidden="true"
>
  {#if clear}
    <circle class="sun-fill" cx="16" cy="16" r="6" />
    <path class="sun-ray" d="M16 3.5v3M16 25.5v3M3.5 16h3M25.5 16h3M7.2 7.2l2.1 2.1M22.7 22.7l2.1 2.1M24.8 7.2l-2.1 2.1M9.3 22.7l-2.1 2.1" />
  {:else}
    {#if mostlyClear}
      <circle class="sun-fill" cx="13" cy="13" r="6" />
      <path class="sun-ray" d="M13 2.5v2.5M2.5 13H5M5.6 5.6l1.8 1.8M20.4 5.6l-1.8 1.8M5.6 20.4l1.8-1.8" />
      <path class="cloud-fill is-light" d="M14.5 25.5h10a3.6 3.6 0 0 0 .1-7.2 5.1 5.1 0 0 0-9.5-1.1 4.2 4.2 0 0 0-.6 8.3Z" />
    {:else if partlyCloudy}
      <circle class="sun-fill" cx="10.5" cy="10.5" r="5" />
      <path class="sun-ray" d="M10.5 2.3v2M2.5 10.5h2M4.9 4.9l1.4 1.4M16.1 4.9l-1.4 1.4" />
    {/if}
    {#if overcast}
      <path class="cloud-back" d="M4.8 20.7h11.7a4.1 4.1 0 0 0 .1-8.2 5.8 5.8 0 0 0-10.9-1.4 4.8 4.8 0 0 0-.9 9.6Z" />
    {/if}
    {#if cloudy || partlyCloudy}
      <path class="cloud-fill" d="M8.7 24.5h14.8a5 5 0 0 0 .2-10 7.4 7.4 0 0 0-14-1.8 5.9 5.9 0 0 0-1 .1 5.9 5.9 0 0 0 0 11.7Z" />
    {/if}
    {#if drizzle}
      <path class="rain-line" d="M11 27l-1 2M17 27l-1 2M23 27l-1 2" />
    {:else if rain}
      <path class="rain-line" d="M10.5 26.5l-1.4 3M17 26.5l-1.4 3M23.5 26.5l-1.4 3" />
    {:else if snow}
      <path class="snow-line" d="M10 27v3M8.7 27.8l2.6 1.5M11.3 27.8l-2.6 1.5M21 27v3M19.7 27.8l2.6 1.5M22.3 27.8l-2.6 1.5" />
    {:else if thunder}
      <path class="bolt-fill" d="m17 24-3.2 5.5 4.7-1.4-1 3.9 4.8-6.5-4.3 1.1 1.1-2.6Z" />
    {/if}
    {#if fog}
      <path class="fog-line" d="M6 27h20M9 30h14" />
    {/if}
  {/if}
</svg>

<style>
  .weather-icon {
    display: block;
    overflow: visible;
  }
  .sun-fill {
    fill: #f6a609;
    stroke: #d97706;
    stroke-width: 1.2;
  }
  .sun-ray {
    stroke: #d98a05;
    stroke-width: 1.8;
  }
  .cloud-fill {
    fill: #c7d5df;
    stroke: #566d7e;
    stroke-width: 1.55;
  }
  .cloud-fill.is-light {
    fill: #dde7ed;
    stroke: #667b89;
    stroke-width: 1.35;
  }
  .cloud-back {
    fill: #e1e8ed;
    stroke: #7b8e9b;
    stroke-width: 1.25;
  }
  .rain-line {
    stroke: #2684b8;
    stroke-width: 1.8;
  }
  .snow-line {
    stroke: #5b90b2;
    stroke-width: 1.25;
  }
  .bolt-fill {
    fill: #e79a05;
    stroke: #c27300;
    stroke-width: .7;
  }
  .fog-line {
    stroke: #84919b;
    stroke-width: 1.25;
  }
</style>
