<script lang="ts">
  import { t } from '$lib/i18n/i18n.svelte';
  import { buildPositionColorMap } from '$lib/ui/position-color';
  import { workspace } from '$lib/workspace/workspace.svelte';
  import ClassicRestaurantPage from '$lib/classic/ClassicRestaurantPage.svelte';
  import { restaurantConfig } from '$lib/classic/classic-restaurant.svelte';
  import { dragReorder, moved } from '$lib/classic/dragReorder';

  // Row order is the saved order, so dragging a position is a real edit.
  function movePosition(from: number, to: number) {
    const draft = restaurantConfig.draft;
    if (!draft) return;
    draft.jobFunctions = moved(draft.jobFunctions, from, to);
    restaurantConfig.touch();
  }

  // The colour each saved position wears on the schedule board, shown here so
  // its identity is set where the position is defined.
  const positionColor = $derived(
    workspace.restaurant
      ? buildPositionColorMap(workspace.restaurant.job_functions)
      : new Map<string, string>()
  );

  function addPosition() {
    const draft = restaurantConfig.draft;
    if (!draft) return;
    // New rows land on top, so what you just added is the first thing you see.
    draft.jobFunctions = [
      { id: crypto.randomUUID(), name: '', code: '', active: true, estimatedHourlyCost: 0 },
      ...draft.jobFunctions
    ];
    restaurantConfig.touch();
  }
</script>

<svelte:head><title>{t('Positions')} &middot; restogogo</title></svelte:head>

{#snippet pageActions()}
  <button class="cl-btn" type="button" onclick={addPosition}>
    <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>
    {t('Add position')}
  </button>
{/snippet}

<ClassicRestaurantPage actions={pageActions}>
  {#snippet children(draft)}
    <p class="cl-section__note">
      {t('A position is the job someone does on a shift. Coverage requirements are set per position.')}
    </p>

    <div class="cl-tablewrap">
      <table class="cl-table">
        <thead>
          <tr>
            <th class="cl-grip"></th>
            <th class="swatch-col"><span class="sr-only">{t('Colour')}</span></th>
            <th>{t('Name')}</th>
            <th class="is-num">{t('Estimated hourly cost')}</th>
            <th>{t('Active')}</th>
          </tr>
        </thead>
        <tbody use:dragReorder={{ onmove: movePosition }}>
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
            {#each draft.jobFunctions as position, index (position.id)}
              <tr draggable="true" data-drag={index}>
                <td class="cl-grip" aria-hidden="true">⠿</td>
                <td class="swatch-col">
                  <span class="swatch" style="background:{positionColor.get(position.id) ?? 'var(--cl-line-strong)'}"></span>
                </td>
                <td><input class="cl-field" bind:value={position.name} oninput={() => restaurantConfig.touch()} /></td>
                <td class="is-num">
                  <input
                    class="cl-field cost"
                    type="number"
                    min="0"
                    step="0.5"
                    bind:value={position.estimatedHourlyCost}
                    oninput={() => restaurantConfig.touch()}
                  />
                </td>
                <td>
                  <label class="switch">
                    <input type="checkbox" bind:checked={position.active} onchange={() => restaurantConfig.touch()} />
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
  .swatch {
    display: block;
    width: 14px;
    height: 14px;
    border-radius: 4px;
    box-shadow: inset 0 0 0 1px rgba(0, 0, 0, 0.12);
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

