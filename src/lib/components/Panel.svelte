<script lang="ts">
  import type { Snippet } from 'svelte';
  import { t } from '$lib/i18n/i18n.svelte';

  let {
    title,
    eyebrow = '',
    trailing,
    children,
    footer
  }: {
    title: string;
    eyebrow?: string;
    trailing?: Snippet;
    children: Snippet;
    footer?: Snippet;
  } = $props();
</script>

<section class="panel">
  <header class="panel__head">
    <div>
      {#if eyebrow}<span>{t(eyebrow)}</span>{/if}
      <h2>{t(title)}</h2>
    </div>
    {#if trailing}{@render trailing()}{/if}
  </header>

  <div class="panel__body">
    {@render children()}
  </div>

  {#if footer}
    <footer class="panel__foot">
      {@render footer()}
    </footer>
  {/if}
</section>

<style>
  .panel {
    min-width: 0;
    overflow: hidden;
    background: var(--rst-ui-surface-panel);
    border: 1px solid var(--rst-ui-surface-panel-border);
    border-radius: var(--rst-ui-radius-xl);
  }

  .panel__head {
    min-height: var(--rst-head-min-h);
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    padding: var(--rst-head-pad);
    background: var(--rst-ui-surface-panel-head);
    border-bottom: 1px solid var(--rst-ui-divider-soft);
  }

  .panel__head span {
    display: block;
    margin-bottom: 4px;
    color: var(--rst-ui-panel-title);
    font-size: 11px;
    font-weight: var(--rst-fw-bold);
    letter-spacing: 0.07em;
    text-transform: uppercase;
  }

  .panel__head h2 {
    margin: 0;
    font-size: 16px;
    font-weight: var(--rst-fw-display);
  }

  .panel__body {
    padding: 14px;
  }

  .panel__foot {
    padding: 9px 14px;
    border-top: 1px solid var(--rst-ui-divider-soft);
    text-align: right;
  }
</style>
