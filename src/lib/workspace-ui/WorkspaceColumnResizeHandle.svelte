<script lang="ts">
  import { onMount } from 'svelte';
  import { t } from '$lib/i18n/i18n.svelte';

  let {
    columnKey,
    minWidth = 92,
    maxWidth = 520
  }: {
    columnKey: string;
    minWidth?: number;
    maxWidth?: number;
  } = $props();

  let handle = $state<HTMLButtonElement | null>(null);
  let dragging = $state(false);
  let startX = 0;
  let startWidth = 0;

  function cell(): HTMLTableCellElement | null {
    return handle?.closest('th') ?? null;
  }

  function storageKey(): string {
    const route = typeof location === 'undefined' ? 'workspace' : location.pathname;
    return `rst-column-width:${route}:${columnKey}`;
  }

  function setWidth(width: number | null, persist = true): void {
    const target = cell();
    if (!target) return;
    if (width === null) {
      target.style.removeProperty('width');
      target.style.removeProperty('min-width');
      target.style.removeProperty('max-width');
      if (persist) {
        try {
          localStorage.removeItem(storageKey());
        } catch {
          // Resetting visually is still useful when storage is unavailable.
        }
      }
      return;
    }
    const next = Math.round(Math.min(maxWidth, Math.max(minWidth, width)));
    target.style.width = `${next}px`;
    target.style.minWidth = `${next}px`;
    target.style.maxWidth = `${next}px`;
    if (persist) {
      try {
        localStorage.setItem(storageKey(), String(next));
      } catch {
        // Keep the resized column for this session.
      }
    }
  }

  function move(event: PointerEvent): void {
    if (!dragging) return;
    setWidth(startWidth + event.clientX - startX, false);
  }

  function stopDragging(): void {
    if (!dragging) return;
    dragging = false;
    document.documentElement.classList.remove('is-resizing-column');
    const target = cell();
    if (target) setWidth(target.getBoundingClientRect().width);
    window.removeEventListener('pointermove', move);
    window.removeEventListener('pointerup', stopDragging);
    window.removeEventListener('pointercancel', stopDragging);
  }

  function start(event: PointerEvent): void {
    const target = cell();
    if (!target) return;
    event.preventDefault();
    event.stopPropagation();
    dragging = true;
    startX = event.clientX;
    startWidth = target.getBoundingClientRect().width;
    document.documentElement.classList.add('is-resizing-column');
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', stopDragging);
    window.addEventListener('pointercancel', stopDragging);
  }

  function nudge(event: KeyboardEvent): void {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    event.preventDefault();
    const target = cell();
    if (!target) return;
    const amount = event.shiftKey ? 24 : 8;
    setWidth(target.getBoundingClientRect().width + (event.key === 'ArrowRight' ? amount : -amount));
  }

  onMount(() => {
    try {
      const stored = Number(localStorage.getItem(storageKey()));
      if (Number.isFinite(stored) && stored > 0) setWidth(stored, false);
    } catch {
      // The column keeps its natural width.
    }
    return () => stopDragging();
  });
</script>

<button
  bind:this={handle}
  class="column-resize"
  class:is-dragging={dragging}
  type="button"
  aria-label={t('Resize column')}
  title={t('Drag to resize. Double-click to reset.')}
  onpointerdown={start}
  onkeydown={nudge}
  ondblclick={(event) => {
    event.preventDefault();
    event.stopPropagation();
    setWidth(null);
  }}
></button>

<style>
  .column-resize {
    position: absolute;
    z-index: 3;
    top: 5px;
    right: -4px;
    bottom: 5px;
    width: 9px;
    padding: 0;
    border: 0;
    background: transparent;
    cursor: col-resize;
    touch-action: none;
  }

  .column-resize::after {
    content: '';
    position: absolute;
    top: 5px;
    right: 4px;
    bottom: 5px;
    width: 1px;
    border-radius: 1px;
    background: transparent;
    transition: background var(--cl-dur) var(--cl-ease);
  }

  .column-resize:hover::after,
  .column-resize:focus-visible::after,
  .column-resize.is-dragging::after {
    background: var(--cl-accent);
  }

  .column-resize:focus-visible {
    outline: 0;
  }
</style>
