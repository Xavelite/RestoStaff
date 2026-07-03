<script lang="ts">
  import LiveDuration from './LiveDuration.svelte';
  import type { BoardTone } from './OperationsBoard.svelte';
  import { portal } from '$lib/actions/portal';

  let {
    initials,
    tone = 'neutral',
    name,
    detail,
    area = '',
    selected = false,
    compact = false,
    liveSince = null,
    onclick,
    ariaLabel
  }: {
    initials: string;
    tone?: BoardTone;
    name: string;
    detail: string;
    area?: string;
    selected?: boolean;
    compact?: boolean;
    liveSince?: string | null;
    onclick: () => void;
    ariaLabel: string;
  } = $props();

  // The tooltip is portalled to <body> so it can never be clipped by the
  // board's overflow:auto scroll container — one hover language, always fully
  // visible, on Schedule and Timesheet alike.
  let chipEl = $state<HTMLButtonElement>();
  let open = $state(false);
  let x = $state(0);
  let y = $state(0);
  let placement = $state<'top' | 'bottom'>('top');

  function show() {
    if (!chipEl) return;
    const rect = chipEl.getBoundingClientRect();
    x = rect.left + rect.width / 2;
    placement = rect.top < 132 ? 'bottom' : 'top';
    y = placement === 'top' ? rect.top - 8 : rect.bottom + 8;
    open = true;
  }

  function hide() {
    open = false;
  }
</script>

<button
  bind:this={chipEl}
  type="button"
  class={`staff-chip is-${tone}`}
  class:is-compact={compact}
  class:is-selected={selected}
  {onclick}
  onmouseenter={show}
  onmouseleave={hide}
  onfocus={show}
  onblur={hide}
  aria-label={ariaLabel}
>
  <span>{initials}</span>
</button>

{#if open}
  <span
    use:portal
    class={`chip-tooltip is-${placement}`}
    role="tooltip"
    style={`left:${x}px; top:${y}px;`}
  >
    <b>{name}</b>
    {#if liveSince}
      <small><LiveDuration since={liveSince} /></small>
    {:else}
      <small>{detail}</small>
    {/if}
    {#if area}<small>{area}</small>{/if}
  </span>
{/if}

<style>
  .staff-chip {
    position: relative;
    width: 31px;
    height: 31px;
    display: grid;
    place-items: center;
    border: 0;
    border-radius: 999px;
    color: #fff;
    background: #1f4a7a;
    box-shadow: 0 0 0 2px rgba(255, 255, 255, 0.5);
    font-size: 10px;
    font-weight: var(--rst-fw-display);
    cursor: pointer;
    transition:
      transform 0.15s cubic-bezier(0.16, 1, 0.3, 1),
      box-shadow 0.15s var(--rst-ease-out),
      filter 0.15s ease;
    animation: rst-pop-in 0.3s var(--rst-ease-spring) backwards;
  }

  .staff-chip:hover,
  .staff-chip:focus-visible {
    transform: translateY(-2px) scale(1.08);
    filter: saturate(1.08);
    box-shadow: 0 0 0 3px rgba(255, 255, 255, 0.72), 0 12px 24px rgba(4, 11, 20, 0.22);
    z-index: 5;
  }

  .staff-chip.is-compact {
    width: 23px;
    height: 23px;
    box-shadow: none;
  }

  .staff-chip.is-live {
    background: #58df92;
    color: #12301f;
  }

  .staff-chip.is-available {
    background: rgba(66, 216, 132, 0.55);
    color: #12301f;
  }

  .staff-chip.is-missing,
  .staff-chip.is-conflict,
  .staff-chip.is-blocked,
  .staff-chip.is-unavailable {
    background: #8d2b1c;
  }

  .staff-chip.is-adjusted,
  .staff-chip.is-pending,
  .staff-chip.is-partial {
    background: #f7d36d;
    color: #3d2904;
  }

  .staff-chip.is-selected {
    outline: 2px solid var(--rst-ui-action);
    outline-offset: 2px;
    box-shadow: 0 0 0 3px rgba(var(--rst-ui-action-rgb), 0.24), 0 12px 24px rgba(4, 11, 20, 0.18);
  }

  /* Portalled to <body>: position:fixed, viewport coordinates. */
  .chip-tooltip {
    position: fixed;
    z-index: var(--rst-z-overlay);
    display: grid;
    place-items: start;
    gap: 2px;
    width: max-content;
    max-width: 200px;
    padding: 8px 10px;
    border-radius: 10px;
    background: #0b1420;
    box-shadow: 0 14px 32px rgba(0, 0, 0, 0.5), 0 0 0 1px rgba(255, 255, 255, 0.1);
    color: #f8fbff;
    text-align: left;
    pointer-events: none;
    animation: rst-tooltip-in 0.14s cubic-bezier(0.16, 1, 0.3, 1) backwards;
  }

  .chip-tooltip.is-top {
    transform: translate(-50%, -100%);
  }

  .chip-tooltip.is-bottom {
    transform: translate(-50%, 0);
  }

  @keyframes rst-tooltip-in {
    from { opacity: 0; }
    to { opacity: 1; }
  }

  .chip-tooltip::after {
    content: '';
    position: absolute;
    left: 50%;
    width: 8px;
    height: 8px;
    background: #0b1420;
  }

  .chip-tooltip.is-top::after {
    top: 100%;
    transform: translate(-50%, -50%) rotate(45deg);
  }

  .chip-tooltip.is-bottom::after {
    bottom: 100%;
    transform: translate(-50%, 50%) rotate(45deg);
  }

  .chip-tooltip b {
    font-size: 11px;
    font-weight: var(--rst-fw-display);
  }

  .chip-tooltip small {
    color: rgba(248, 251, 255, 0.72);
    font-size: 10px;
    font-weight: var(--rst-fw-regular);
    text-transform: none;
    letter-spacing: normal;
    white-space: normal;
  }

  @media (hover: none) {
    .chip-tooltip {
      display: none;
    }
  }
</style>
