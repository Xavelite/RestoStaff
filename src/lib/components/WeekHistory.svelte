<script lang="ts">
  import ActionButton from '$lib/components/ActionButton.svelte';
  import Panel from '$lib/components/Panel.svelte';
  import type { WeekHistoryItem } from '$lib/calendar/week-history';
  import { i18n, t } from '$lib/i18n/i18n.svelte';

  let {
    title = 'Recent activity',
    eyebrow = 'Audited lifecycle',
    items,
    limit = 20,
    emptyMessage = 'No logged activity yet.',
    variant = 'panel'
  }: {
    title?: string;
    eyebrow?: string;
    items: WeekHistoryItem[];
    limit?: number;
    emptyMessage?: string;
    variant?: 'panel' | 'rail';
  } = $props();

  // One chronological timeline, most recent first, capped to the latest entries.
  const ordered = $derived(
    [...items].sort((a, b) => b.when.localeCompare(a.when)).slice(0, limit)
  );
</script>

<div class="history is-{variant}">
  <Panel {title} {eyebrow}>
    {#if ordered.length}
      <ol class="history__list">
        {#each ordered as item (item.id)}
          <li>
            <span class="history__text">
              <strong>{t(item.title)}</strong>
              {#if item.detail}<small>{t(item.detail)}</small>{/if}
            </span>
            <span class="history__meta">
              <time datetime={item.when}>{new Date(item.when).toLocaleString(i18n.intlLocale)}</time>
              {#if item.actionLabel && item.onaction}
                <ActionButton label={item.actionLabel} disabled={item.actionDisabled} onclick={item.onaction} />
              {/if}
            </span>
          </li>
        {/each}
      </ol>
    {:else}
      <p class="history__empty">{t(emptyMessage)}</p>
    {/if}
  </Panel>
</div>

<style>
  .history { margin-top: 12px; }
  .history__list { display: grid; margin: 0; padding: 0; list-style: none; }
  .history__list li { display: flex; align-items: center; justify-content: space-between; gap: 16px; padding: 10px 14px; border-bottom: 1px solid var(--rst-ui-divider-soft); }
  .history__list li:last-child { border-bottom: none; }
  .history__text { min-width: 0; display: grid; gap: 2px; }
  .history__text strong { font-size: 12px; }
  .history__text small { color: var(--rst-ui-muted); font-size: 10px; overflow-wrap: anywhere; }
  .history__meta { display: inline-flex; align-items: center; gap: 10px; flex: 0 0 auto; }
  .history__meta time { color: var(--rst-ui-muted); font-size: 10px; white-space: nowrap; }
  .history__empty { margin: 0; padding: 12px 14px; color: var(--rst-ui-muted); font-size: 12px; }
  .history.is-rail {
    margin-top: 0;
  }

  .history.is-rail :global(.panel) {
    border-radius: var(--rst-ui-radius-2xl);
    box-shadow: var(--rst-ui-shadow-card);
  }

  .history.is-rail :global(.panel__head) {
    min-height: auto;
    padding: 16px;
    background:
      radial-gradient(circle at 100% 0%, rgba(var(--rst-ui-action-rgb), 0.16), transparent 42%),
      var(--rst-ui-surface-panel-head);
  }

  .history.is-rail .history__list li {
    align-items: flex-start;
    padding: 12px 16px;
  }

  .history.is-rail .history__text strong {
    font-size: 13px;
  }

  .history.is-rail .history__meta {
    padding-top: 2px;
  }
  @media print { .history { display: none !important; } }
</style>
