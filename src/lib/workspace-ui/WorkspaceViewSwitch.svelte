<script lang="ts">
  import { LayoutGrid, List } from '@lucide/svelte';
  import { onMount } from 'svelte';
  import { t } from '$lib/i18n/i18n.svelte';

  type ViewMode = 'list' | 'plan' | 'floor';

  let {
    value,
    secondary = 'plan',
    onchange
  }: {
    value: ViewMode;
    secondary?: Extract<ViewMode, 'plan' | 'floor'>;
    onchange: (value: ViewMode) => void;
  } = $props();

  const secondaryLabel = $derived(secondary === 'floor' ? 'Floor' : 'Plan');

  const PREFERENCE_KEY = 'rst-workspace-view';

  function choose(next: ViewMode): void {
    try {
      localStorage.setItem(PREFERENCE_KEY, next === 'list' ? 'list' : 'visual');
    } catch {
      // The switch still works for this session when storage is unavailable.
    }
    onchange(next);
  }

  onMount(() => {
    try {
      const stored = localStorage.getItem(PREFERENCE_KEY);
      const preferred = stored === 'visual' ? secondary : stored === 'list' ? 'list' : null;
      if (preferred && preferred !== value) onchange(preferred);
    } catch {
      // Keep the page default.
    }
  });
</script>

<div class="view-switch" role="group" aria-label={t('View')}>
  <button
    type="button"
    class:is-active={value === 'list'}
    title={t('List')}
    aria-label={t('List')}
    aria-pressed={value === 'list'}
    onclick={() => choose('list')}
  >
    <List size={15} aria-hidden="true" />
    <span>{t('List')}</span>
  </button>
  <button
    type="button"
    class:is-active={value === secondary}
    title={t(secondaryLabel)}
    aria-label={t(secondaryLabel)}
    aria-pressed={value === secondary}
    onclick={() => choose(secondary)}
  >
    <LayoutGrid size={15} aria-hidden="true" />
    <span>{t(secondaryLabel)}</span>
  </button>
</div>

<style>
  .view-switch {
    display: inline-flex;
    padding: 3px;
    border: 1px solid var(--cl-line);
    border-radius: 7px;
    background: var(--cl-surface);
  }

  button {
    min-width: 64px;
    height: 30px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    padding: 0 9px;
    border: 0;
    border-radius: 5px;
    color: var(--cl-muted);
    background: transparent;
    cursor: pointer;
  }

  button:hover {
    color: var(--cl-ink);
    background: var(--cl-surface-muted);
  }

  button.is-active {
    color: var(--cl-accent);
    background: var(--cl-accent-wash);
  }

  button:focus-visible {
    outline: 2px solid color-mix(in srgb, var(--cl-accent) 48%, transparent);
    outline-offset: 1px;
  }

  button span {
    font-size: var(--rst-fs-label);
    font-weight: var(--rst-fw-bold);
  }

  @media (max-width: 760px) {
    button {
      min-width: 30px;
      width: 30px;
      padding: 0;
    }

    button span {
      display: none;
    }
  }
</style>
