<script lang="ts">
  import { t } from '$lib/i18n/i18n.svelte';
  import WorkspacePage from '$lib/workspace-ui/WorkspacePage.svelte';
  import WorkspacePreferencesControls from '$lib/workspace-ui/WorkspacePreferencesControls.svelte';
</script>

<svelte:head><title>{t('Settings')} &middot; restogogo</title></svelte:head>

<WorkspacePage>
  <section class="settings-panel">
    <header>
      <strong>{t('Workspace')}</strong>
      <span>{t('Appearance and behaviour')}</span>
    </header>
    <WorkspacePreferencesControls />
  </section>
</WorkspacePage>

<style>
  .settings-panel {
    width: min(100%, 560px);
    overflow: hidden;
    border: 1px solid var(--rst-ui-line);
    border-radius: var(--rst-ui-radius-md);
    background: var(--rst-ui-surface-panel);
    box-shadow: 0 1px 2px rgb(15 23 42 / 0.05);
  }

  .settings-panel > header {
    display: grid;
    gap: 2px;
    padding: 15px 16px 13px;
    border-bottom: 1px solid var(--rst-ui-line);
    box-shadow: inset 3px 0 0 var(--rst-ui-action);
  }

  .settings-panel > header strong {
    color: var(--rst-ui-text);
    font-size: var(--rst-fs-body);
  }

  .settings-panel > header span {
    color: var(--rst-ui-muted);
    font-size: var(--rst-fs-label);
  }
</style>
