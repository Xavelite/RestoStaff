<script lang="ts">
  import { t } from '$lib/i18n/i18n.svelte';

  type DayOption = {
    date: string;
    label: string;
    today?: boolean;
  };

  let {
    days,
    selected,
    tone = 'schedule',
    onselect
  }: {
    days: DayOption[];
    selected: string;
    tone?: 'schedule' | 'time';
    onselect: (date: string) => void;
  } = $props();

  const accent = $derived(
    tone === 'time' ? 'var(--cl-mod-time)' : 'var(--cl-mod-schedule)'
  );
</script>

<nav class="day-picker" aria-label={t('Choose day')} style={`--day-accent:${accent}`}>
  {#each days as day (day.date)}
    <button
      type="button"
      class:is-active={day.date === selected}
      class:is-today={day.today}
      aria-pressed={day.date === selected}
      onclick={() => onselect(day.date)}
    >
      <span>{t(day.label).slice(0, 3)}</span>
      <b>{Number(day.date.slice(-2))}</b>
    </button>
  {/each}
</nav>

<style>
  .day-picker {
    display: grid;
    grid-template-columns: repeat(7, minmax(0, 1fr));
    overflow: hidden;
    border: 1px solid var(--cl-line-strong);
    border-radius: var(--cl-radius);
    background: var(--cl-surface);
  }

  button {
    position: relative;
    min-width: 0;
    min-height: 51px;
    display: grid;
    place-items: center;
    align-content: center;
    gap: 1px;
    padding: 5px 1px;
    border: 0;
    border-right: 1px solid var(--cl-grid-line);
    background: transparent;
    color: var(--cl-muted);
    font: inherit;
    cursor: pointer;
  }

  button:last-child { border-right: 0; }
  button span {
    font-size: 9px;
    font-weight: var(--rst-fw-bold);
    text-transform: uppercase;
  }
  button b {
    color: var(--cl-ink);
    font-size: 13px;
    font-weight: var(--rst-fw-bold);
  }
  button.is-today::after {
    content: '';
    position: absolute;
    bottom: 5px;
    width: 4px;
    height: 4px;
    border-radius: 50%;
    background: var(--cl-info);
  }
  button.is-active {
    background: color-mix(in srgb, var(--day-accent) 9%, var(--cl-surface));
    color: var(--day-accent);
    box-shadow: inset 0 -2px 0 var(--day-accent);
  }
  button.is-active b { color: var(--day-accent); }
</style>
