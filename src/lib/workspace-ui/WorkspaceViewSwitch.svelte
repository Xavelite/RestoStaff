<script lang="ts">
  import { LayoutGrid, List } from '@lucide/svelte';
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
</script>

<div class="view-switch" role="group" aria-label={t('View')}>
  <button
    type="button"
    class:is-active={value === 'list'}
    title={t('List')}
    aria-label={t('List')}
    aria-pressed={value === 'list'}
    onclick={() => onchange('list')}
  >
    <List size={15} aria-hidden="true" />
  </button>
  <button
    type="button"
    class:is-active={value === secondary}
    title={t(secondaryLabel)}
    aria-label={t(secondaryLabel)}
    aria-pressed={value === secondary}
    onclick={() => onchange(secondary)}
  >
    <LayoutGrid size={15} aria-hidden="true" />
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
    width: 30px;
    height: 30px;
    display: grid;
    place-items: center;
    padding: 0;
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
</style>
