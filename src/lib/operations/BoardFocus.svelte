<script lang="ts">
  import type { Snippet } from 'svelte';
  import { portal } from '$lib/actions/portal';
  import { t } from '$lib/i18n/i18n.svelte';

  let {
    label,
    onclose,
    children
  }: {
    label: string;
    onclose: () => void;
    children: Snippet;
  } = $props();

  function handleKeydown(event: KeyboardEvent) {
    if (event.key !== 'Escape') return;
    event.preventDefault();
    onclose();
  }
</script>

<svelte:window onkeydown={handleKeydown} />

<div class="board-focus" use:portal role="dialog" aria-modal="true" aria-label={t(label)}>
  <button type="button" class="board-focus__scrim" aria-label={t('Close focus')} onclick={onclose}></button>
  <div class="board-focus__panel">
    {@render children()}
  </div>
</div>

<style>
  .board-focus {
    position: fixed;
    z-index: var(--rst-z-overlay);
    inset: 0;
    display: grid;
    place-items: center;
    padding: clamp(12px, 2.4vw, 32px);
  }

  .board-focus__scrim {
    position: absolute;
    inset: 0;
    border: 0;
    background: rgba(4, 8, 14, 0.72);
    backdrop-filter: blur(4px);
    cursor: pointer;
    animation: rst-fade-up 0.2s var(--rst-ease-out) backwards;
  }

  .board-focus__panel {
    position: relative;
    z-index: 1;
    width: min(1720px, 100%);
    max-height: 100%;
    overflow: auto;
    animation: rst-scale-in 0.3s var(--rst-ease-spring) backwards;
  }
</style>
