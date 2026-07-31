<script lang="ts">
  import { page } from '$app/state';
  import { LayoutGrid, Map } from '@lucide/svelte';
  import ReservationFloorPlansWorkspace from '$lib/reservations/ReservationFloorPlansWorkspace.svelte';
  import { t } from '$lib/i18n/i18n.svelte';
  import { useWorkspaceRestaurantContext } from '$lib/workspace-ui/workspace-context';
  import WorkspacePage from '$lib/workspace-ui/WorkspacePage.svelte';

  const readRestaurantContext = useWorkspaceRestaurantContext();
  const context = $derived(readRestaurantContext());
  const layer = $derived(page.url.searchParams.get('layer') === 'tables' ? 'tables' : 'areas');
</script>

<WorkspacePage actionsAlign="center">
  {#snippet actions()}
    <nav class="layer-switch" aria-label={t('Floor plan layer')}>
      <a
        class:is-active={layer === 'areas'}
        aria-current={layer === 'areas' ? 'page' : undefined}
        href="/restaurant/floor-plan?layer=areas"
      >
        <Map size={15} strokeWidth={1.8} aria-hidden="true" />
        <span>{t('Areas')}</span>
      </a>
      <a
        class:is-active={layer === 'tables'}
        aria-current={layer === 'tables' ? 'page' : undefined}
        href="/restaurant/floor-plan?layer=tables"
      >
        <LayoutGrid size={15} strokeWidth={1.8} aria-hidden="true" />
        <span>{t('Tables')}</span>
      </a>
    </nav>
  {/snippet}

  {#key layer}
    <ReservationFloorPlansWorkspace mode={layer} restaurantContext={context} />
  {/key}
</WorkspacePage>

<style>
  .layer-switch {
    display: inline-grid;
    grid-template-columns: repeat(2, minmax(112px, 1fr));
    gap: 3px;
    padding: 3px;
    border: 1px solid var(--rst-ui-line);
    border-radius: var(--rst-ui-radius-sm);
    background: var(--rst-ui-surface-field-strong);
  }

  .layer-switch a {
    min-height: 32px;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 7px;
    padding: 5px 12px;
    border: 1px solid transparent;
    border-radius: 4px;
    color: var(--rst-ui-muted);
    font-size: var(--rst-fs-label);
    font-weight: var(--rst-fw-semibold);
    text-decoration: none;
  }

  .layer-switch a:hover {
    color: var(--rst-ui-text);
    background: var(--rst-ui-surface-panel);
  }

  .layer-switch a.is-active {
    border-color: var(--rst-ui-line);
    color: var(--rst-ui-action);
    background: var(--rst-ui-surface-panel);
    box-shadow: 0 1px 2px rgb(15 23 42 / 0.06);
  }

  .layer-switch a:focus-visible {
    outline: 2px solid color-mix(in srgb, var(--rst-ui-action) 45%, transparent);
    outline-offset: 1px;
  }
</style>
