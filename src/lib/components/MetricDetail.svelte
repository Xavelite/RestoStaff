<script lang="ts">
  import { goto } from '$app/navigation';
  import Dialog from './Dialog.svelte';
  import type { MetricDetail, MetricDetailAction } from '$lib/ui/metric';

  // Shared popup behind every metric. Pages provide declarative rows and either
  // navigation hrefs or stable action IDs; domain mutations remain page-owned.
  let {
    detail,
    onclose,
    onaction
  }: {
    detail: MetricDetail | null;
    onclose: () => void;
    onaction?: (actionId: string) => void;
  } = $props();

  function runAction(action: MetricDetailAction) {
    onclose();
    if (action.actionId) onaction?.(action.actionId);
    if (action.href) void goto(action.href);
  }
</script>

{#snippet actions()}
  {#each detail?.actions ?? [] as action (action.id)}
    <button
      type="button"
      class="action is-{action.tone ?? 'default'}"
      onclick={() => runAction(action)}>{action.label}</button>
  {/each}
{/snippet}

<Dialog
  open={detail !== null}
  title={detail?.title ?? ''}
  description={detail?.subtitle ?? ''}
  {onclose}
  footer={detail?.actions?.length ? actions : undefined}
>
  {#if detail}
    {#if detail.rows.length}
      <ul class="rows">
        {#each detail.rows as row (row.id)}
          <li class="row is-{row.tone ?? 'neutral'}">
            {#if row.symbol}<span class="row__symbol" aria-hidden="true">{row.symbol}</span>{/if}
            <span class="row__copy">
              <strong>{row.title}</strong>
              {#if row.meta}<small>{row.meta}</small>{/if}
            </span>
            {#if row.value}<b>{row.value}</b>{/if}
          </li>
        {/each}
      </ul>
    {:else}
      <p class="empty">{detail.empty ?? 'Nothing to show.'}</p>
    {/if}
  {/if}
</Dialog>

<style>
  .rows {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    gap: 8px;
  }
  .row {
    --tone-rgb: var(--rst-state-neutral-rgb);
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 10px 12px;
    border: 1px solid var(--rst-ui-line);
    border-radius: var(--rst-ui-radius-md);
    background: var(--rst-ui-surface-field-strong);
    box-shadow: inset 3px 0 0 rgba(var(--tone-rgb), 0.75);
  }
  .row.is-success { --tone-rgb: var(--rst-state-success-rgb); }
  .row.is-warning { --tone-rgb: var(--rst-state-warning-rgb); }
  .row.is-danger { --tone-rgb: var(--rst-state-danger-rgb); }
  .row.is-info { --tone-rgb: var(--rst-state-info-rgb); }
  .row__symbol {
    flex: 0 0 28px;
    width: 28px;
    height: 28px;
    display: grid;
    place-items: center;
    border-radius: var(--rst-ui-radius-md);
    background: rgba(var(--tone-rgb), 0.14);
    color: var(--rst-ui-text);
    font-weight: var(--rst-fw-bold);
    font-size: 12px;
  }
  .row__copy {
    flex: 1;
    min-width: 0;
    display: grid;
    gap: 2px;
  }
  .row__copy strong { font-size: 13px; }
  .row__copy small { color: var(--rst-ui-muted); font-size: 11px; }
  .row b {
    color: var(--rst-ui-text);
    font-size: 13px;
    font-weight: var(--rst-fw-display);
  }
  .empty {
    margin: 0;
    padding: 28px 8px;
    text-align: center;
    color: var(--rst-ui-muted);
    font-size: 13px;
  }
  .action {
    padding: 9px 14px;
    border: 1px solid var(--rst-ui-line);
    border-radius: var(--rst-ui-radius-md);
    background: transparent;
    color: var(--rst-ui-text);
    font: inherit;
    font-size: 13px;
    font-weight: var(--rst-fw-bold);
    cursor: pointer;
  }
  .action.is-primary {
    border: 0;
    background: var(--rst-ui-action);
    color: var(--rst-on-accent-text);
  }
</style>
