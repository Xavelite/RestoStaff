<script lang="ts">
  import type { Snippet } from 'svelte';
  import Drawer from '$lib/components/Drawer.svelte';
  import { t } from '$lib/i18n/i18n.svelte';

  let {
    open,
    description,
    days,
    activeDate,
    onselect,
    onclose,
    children
  }: {
    open: boolean;
    description: string;
    days: Array<{ date: string; label: string; today: boolean }>;
    activeDate: string;
    onselect: (date: string) => void;
    onclose: () => void;
    children: Snippet;
  } = $props();
</script>

<Drawer {open} title="Coverage lens" {description} {onclose}>
  {#snippet tabs()}
    <div class="lens-days rst-scroll-strip">
      {#each days as day (day.date)}
        <button
          type="button"
          class="lens-day"
          class:is-active={activeDate === day.date}
          class:is-today={day.today}
          onclick={() => onselect(day.date)}
        >
          <span>{t(day.label)}</span>
          <strong>{Number(day.date.slice(8, 10))}</strong>
        </button>
      {/each}
    </div>
  {/snippet}

  <div class="coverage-lens">
    {@render children()}
  </div>
</Drawer>

<style>
  .lens-days {
    display: flex;
    gap: 6px;
    padding: 12px 0;
    overflow-x: auto;
  }

  .lens-day {
    flex: 0 0 auto;
    display: grid;
    justify-items: center;
    gap: 2px;
    min-width: 52px;
    padding: 7px 10px;
    border: 1px solid var(--rst-ui-line);
    border-radius: var(--rst-ui-radius-md);
    color: var(--rst-ui-muted);
    background: transparent;
    font: inherit;
    cursor: pointer;
    transition: background-color 0.16s ease, border-color 0.16s ease, color 0.16s ease;
  }

  .lens-day span {
    font-size: 10px;
    font-weight: var(--rst-fw-bold);
    letter-spacing: 0;
    text-transform: uppercase;
  }

  .lens-day strong {
    font-size: 16px;
    font-weight: var(--rst-fw-display);
  }

  .lens-day:hover {
    border-color: var(--rst-ui-line-strong, rgba(76, 48, 26, 0.28));
  }

  .lens-day.is-today {
    color: var(--rst-ui-action);
  }

  .lens-day.is-active {
    color: var(--rst-ui-text);
    border-color: var(--rst-ui-action);
    background: var(--rst-ui-action-soft, rgba(240, 100, 35, 0.12));
  }

  .coverage-lens :global(.lens-rooms) {
    display: grid;
    gap: 12px;
  }

  .coverage-lens :global(.lens-room) {
    display: grid;
    gap: 8px;
    padding: 14px 16px;
    border: 1px solid var(--rst-ui-line);
    border-radius: var(--rst-ui-radius-md);
    background: var(--rst-ui-bg-2);
  }

  .coverage-lens :global(.lens-room__head) {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
  }

  .coverage-lens :global(.lens-room__head strong) {
    font-size: 15px;
    font-weight: var(--rst-fw-display);
  }

  .coverage-lens :global(.lens-flag) {
    flex: 0 0 auto;
    padding: 2px 9px;
    border-radius: 999px;
    font-size: 10px;
    font-weight: var(--rst-fw-display);
    letter-spacing: 0;
    text-transform: uppercase;
  }

  .coverage-lens :global(.lens-flag.is-under) {
    color: #9a3d1a;
    background: rgba(240, 100, 35, 0.16);
  }

  .coverage-lens :global(.lens-flag.is-ok) {
    color: #1f7a4d;
    background: rgba(64, 200, 120, 0.18);
  }

  .coverage-lens :global(.lens-srow) {
    position: relative;
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 5px 0 5px 10px;
    border-left: 3px solid var(--rst-ui-line);
  }

  .coverage-lens :global(.lens-srow.is-under) { border-left-color: var(--rst-ui-action); }
  .coverage-lens :global(.lens-srow.is-covered) { border-left-color: var(--rst-green); }
  .coverage-lens :global(.lens-srow.is-over) { border-left-color: var(--rst-state-info); }

  .coverage-lens :global(.lens-srow__lead) {
    width: 52px;
    flex: 0 0 auto;
    display: inline-flex;
    align-items: center;
    gap: 6px;
    color: var(--rst-ui-text);
    font-size: 12px;
    font-weight: var(--rst-fw-display);
  }

  .coverage-lens :global(.lens-srow__icon) { font-size: 14px; line-height: 1; }
  .coverage-lens :global(.lens-srow__icon.is-lunch) { color: var(--rst-service-lunch); }
  .coverage-lens :global(.lens-srow__icon.is-evening) { color: var(--rst-service-evening); }
  .coverage-lens :global(.lens-srow__count) { color: var(--rst-ui-muted); }

  .coverage-lens :global(.lens-srow__slots) {
    min-width: 0;
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 5px;
  }

  .coverage-lens :global(.lens-slot) {
    width: 28px;
    height: 28px;
    display: grid;
    place-items: center;
    border-radius: var(--rst-ui-radius-round);
    font-size: 10px;
    font-weight: var(--rst-fw-display);
  }

  .coverage-lens :global(.lens-slot.is-filled) {
    border: 0;
    color: #fffaf2;
    background: var(--avatar-color, #35507a);
    box-shadow: 0 2px 6px rgba(4, 11, 20, 0.22);
  }

  .coverage-lens :global(.lens-slot.is-empty) {
    border: 1.5px dashed var(--rst-ui-line-strong, rgba(76, 48, 26, 0.32));
  }
</style>
