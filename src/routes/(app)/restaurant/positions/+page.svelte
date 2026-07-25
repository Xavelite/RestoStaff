<script lang="ts">
  import { t } from '$lib/i18n/i18n.svelte';
  import { buildPositionColorMap } from '$lib/ui/position-color';
  import { workspace } from '$lib/workspace/workspace.svelte';
  import ClassicRestaurantPage from '$lib/classic/ClassicRestaurantPage.svelte';
  import { restaurantConfig } from '$lib/classic/classic-restaurant.svelte';

  // The colour each saved position wears on the schedule board, shown here so
  // its identity is set where the position is defined.
  const positionColor = $derived(
    workspace.restaurant
      ? buildPositionColorMap(workspace.restaurant.job_functions)
      : new Map<string, string>()
  );

  // Who holds each role. Loaded lazily — the roster is a separate read model, so
  // the count enriches the table once team data is in without blocking it.
  $effect(() => {
    if (workspace.activeId && workspace.effectiveRole === 'owner') {
      void workspace.loadTeam().catch(() => undefined);
    }
  });
  const employeesByPosition = $derived.by(() => {
    const map = new Map<string, Set<string>>();
    for (const link of workspace.team?.employee_job_functions ?? []) {
      if (link.active === false) continue;
      (map.get(link.job_function_id) ?? map.set(link.job_function_id, new Set()).get(link.job_function_id)!).add(
        link.employee_id
      );
    }
    return map;
  });

  function addPosition() {
    const draft = restaurantConfig.draft;
    if (!draft) return;
    // A fresh blank row drops in at the top, right under the add control; click
    // again for another. Nothing is pre-filled; blank rows are dropped on save.
    draft.jobFunctions = [
      { id: crypto.randomUUID(), name: '', code: '', active: true, estimatedHourlyCost: 0 },
      ...draft.jobFunctions
    ];
    restaurantConfig.touch();
  }
</script>

<svelte:head><title>{t('Positions')} &middot; restogogo</title></svelte:head>

<ClassicRestaurantPage>
  {#snippet children(draft)}
    <div class="cl-tablewrap">
      <table class="cl-table">
        <thead>
          <tr>
            <th class="swatch-col"><span class="sr-only">{t('Colour')}</span></th>
            <th>{t('Name')}</th>
            <th class="is-num">{t('Estimated hourly cost')}</th>
            <th>{t('Employees')}</th>
            <th>{t('Active')}</th>
          </tr>
        </thead>
        <tbody>
          <tr class="cl-addrow">
            <td colspan="5">
              <button type="button" disabled={workspace.isPreview || !restaurantConfig.draft} onclick={addPosition}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>
                {t('Add position')}
              </button>
            </td>
          </tr>
        </tbody>
        <tbody>
          {#if !draft.jobFunctions.length}
            <tr>
              <td colspan="5">
                <div class="cl-empty">
                  <strong>{t('No positions yet')}</strong>
                  <span>{t('Add the jobs people do on a shift, such as Server, Cook or Bartender.')}</span>
                </div>
              </td>
            </tr>
          {:else}
            {#each draft.jobFunctions as position (position.id)}
              {@const headcount = employeesByPosition.get(position.id)?.size ?? 0}
              <tr>
                <td class="swatch-col">
                  <span class="cl-swatch" style="background:{positionColor.get(position.id) ?? 'var(--cl-line-strong)'}"></span>
                </td>
                <td><input class="cl-field" placeholder={t('Position name')} disabled={workspace.isPreview} bind:value={position.name} oninput={() => restaurantConfig.touch()} /></td>
                <td class="is-num">
                  <input
                    class="cl-field cost"
                    type="number"
                    disabled={workspace.isPreview}
                    min="0"
                    step="0.5"
                    bind:value={position.estimatedHourlyCost}
                    oninput={() => restaurantConfig.touch()}
                  />
                </td>
                <td>
                  <span class="cl-linkcount" class:is-zero={!headcount} title={t('{count} people', { count: headcount })}>
                    <span class="cl-linkcount__n">{headcount}</span>
                  </span>
                </td>
                <td>
                  <label class="switch">
                    <input type="checkbox" disabled={workspace.isPreview} bind:checked={position.active} onchange={() => restaurantConfig.touch()} />
                    <span>{t(position.active ? 'Active' : 'Archived')}</span>
                  </label>
                </td>
              </tr>
            {/each}
          {/if}
        </tbody>
      </table>
    </div>
  {/snippet}
</ClassicRestaurantPage>

<style>
  .cost {
    width: 120px;
    text-align: right;
  }
  .switch {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    font-size: 14px;
  }
  .switch input {
    width: 16px;
    height: 16px;
    accent-color: var(--cl-accent);
  }
  .swatch-col {
    width: 34px;
    padding-right: 0 !important;
  }
  .sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
  }
</style>

