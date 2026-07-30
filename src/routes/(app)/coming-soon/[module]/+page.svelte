<script lang="ts">
  import { page } from '$app/state';
  import { t } from '$lib/i18n/i18n.svelte';
  import WorkspacePage from '$lib/workspace-ui/WorkspacePage.svelte';
  import WorkspaceIcon from '$lib/workspace-ui/WorkspaceIcon.svelte';
  import { moduleForPath } from '$lib/workspace-ui/workspace-nav';

  const module = $derived(moduleForPath(page.url.pathname));
</script>

<svelte:head><title>{module ? t(module.label) : t('Coming soon')} &middot; restogogo</title></svelte:head>

<WorkspacePage>
  <section class="cl-card placeholder">
    {#if module}
      <span class="icon"><WorkspaceIcon name={module.icon} size={28} /></span>
      <div><small>{t('Coming soon')}</small><h2>{t(module.label)}</h2><p>{t(module.summary)}</p></div>
    {/if}
  </section>
</WorkspacePage>

<style>
  .placeholder { min-height: 280px; display: grid; place-content: center; grid-template-columns: 52px minmax(0, 420px); align-items: center; gap: 18px; padding: 40px; }
  .icon { width: 50px; height: 50px; display: grid; place-items: center; border: 1px solid var(--cl-line); border-radius: var(--cl-radius); color: var(--cl-accent); background: var(--cl-surface-muted); }
  h2, p { margin: 0; }
  small { color: var(--cl-accent); font-weight: var(--rst-fw-bold); text-transform: uppercase; letter-spacing: .04em; }
  h2 { margin-top: 5px; font-size: 22px; }
  p { margin-top: 7px; color: var(--cl-muted); line-height: 1.5; }
</style>
