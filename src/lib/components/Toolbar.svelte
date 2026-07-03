<script lang="ts">
  import type { Snippet } from 'svelte';
  let {
    search,
    filters,
    navigation,
    tools,
    actions,
    workspace
  }: {
    search?: Snippet;
    filters?: Snippet;
    navigation?: Snippet;
    tools?: Snippet;
    actions?: Snippet;
    workspace?: Snippet;
  } = $props();
</script>

<div class="toolbar" aria-label="Workspace tools">
  {#if search || filters || navigation || tools || actions}
    <div class="toolbar__row">
      {#if search || filters}
        <div class="toolbar__group toolbar__query">
          {#if search}{@render search()}{/if}
          {#if filters}{@render filters()}{/if}
        </div>
      {/if}
      {#if navigation}
        <div class="toolbar__group toolbar__navigation">{@render navigation()}</div>
      {/if}
      {#if tools}
        <div class="toolbar__group toolbar__tools">{@render tools()}</div>
      {/if}
      {#if actions}
        <div class="toolbar__group toolbar__actions">{@render actions()}</div>
      {/if}
    </div>
  {/if}
  {#if workspace}
    <div class="toolbar__workspace">{@render workspace()}</div>
  {/if}
</div>

<style>
  .toolbar {
    border: 1px solid var(--rst-ui-line);
    border-radius: var(--rst-ui-radius-lg);
    background: var(--rst-ui-surface-panel);
  }

  .toolbar__row {
    min-width: 0;
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr) auto;
    align-items: center;
    gap: 10px;
    padding: 10px;
  }

  .toolbar__group {
    min-width: 0;
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 6px;
  }

  .toolbar__navigation {
    justify-content: center;
  }

  .toolbar__tools {
    justify-content: flex-end;
  }

  .toolbar__actions {
    justify-content: flex-end;
    padding-left: 8px;
    border-left: 1px solid var(--rst-ui-divider-soft);
  }

  .toolbar__workspace {
    padding: 0 10px 10px;
    border-top: 1px solid var(--rst-ui-divider-soft);
  }

  @media (max-width: 1180px) {
    .toolbar__row {
      grid-template-columns: minmax(0, 1fr) auto;
    }

    .toolbar__navigation {
      grid-column: 1 / -1;
      grid-row: 1;
    }

    .toolbar__query {
      grid-column: 1;
    }

    .toolbar__tools,
    .toolbar__actions {
      grid-column: 2;
    }

    .toolbar__actions {
      grid-column: 1 / -1;
      justify-content: flex-end;
    }
  }

  @media (max-width: 760px) {
    .toolbar__row {
      grid-template-columns: 1fr;
      align-items: stretch;
    }

    .toolbar__navigation,
    .toolbar__query,
    .toolbar__tools,
    .toolbar__actions {
      width: 100%;
      grid-column: 1;
      justify-content: flex-start;
    }

    .toolbar__actions {
      padding: 8px 0 0;
      border-top: 1px solid var(--rst-ui-divider-soft);
      border-left: 0;
    }
  }
</style>
