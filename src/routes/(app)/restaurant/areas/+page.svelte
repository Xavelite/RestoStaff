<script lang="ts">
  import { t } from '$lib/i18n/i18n.svelte';
  import ClassicRestaurantPage from '$lib/classic/ClassicRestaurantPage.svelte';
  import { restaurantConfig } from '$lib/classic/classic-restaurant.svelte';
  import { workspace } from '$lib/workspace/workspace.svelte';
  import { dragReorder, moved } from '$lib/classic/dragReorder';

  // Row order is the saved order, so dragging an area is a real edit.
  function moveArea(from: number, to: number) {
    const draft = restaurantConfig.draft;
    if (!draft) return;
    draft.areas = moved(draft.areas, from, to);
    restaurantConfig.touch();
  }

  function addArea() {
    const draft = restaurantConfig.draft;
    if (!draft) return;
    // New rows land on top, so what you just added is the first thing you see.
    draft.areas = [
      {
        id: crypto.randomUUID(),
        name: '',
        code: '',
        notes: '',
        active: true,
        lunchStart: '',
        lunchEnd: '',
        eveningStart: '',
        eveningEnd: ''
      },
      ...draft.areas
    ];
    restaurantConfig.touch();
  }
</script>

<svelte:head><title>{t('Areas')} &middot; restogogo</title></svelte:head>

{#snippet pageActions()}
  <button class="cl-btn" type="button" disabled={workspace.isPreview || !restaurantConfig.draft} onclick={addArea}>
    <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>
    {t('Add area')}
  </button>
{/snippet}

<ClassicRestaurantPage actions={pageActions}>
  {#snippet children(draft)}
    <p class="cl-section__note">
      {t('Areas are the parts of the house a shift belongs to. Coverage is counted per area.')}
    </p>

    <div class="cl-tablewrap">
      <table class="cl-table">
        <thead>
          <tr>
            <th class="cl-grip"></th>
            <th>{t('Name')}</th>
            <th>{t('Lunch')}</th>
            <th>{t('Evening')}</th>
            <th>{t('Notes')}</th>
            <th>{t('Active')}</th>
          </tr>
        </thead>
        <tbody use:dragReorder={{ onmove: moveArea, enabled: !workspace.isPreview }}>
          {#if !draft.areas.length}
            <tr>
              <td colspan="6">
                <div class="cl-empty">
                  <strong>{t('No areas yet')}</strong>
                  <span>{t('Add the parts of the house you plan for, such as Hall, Bar or Kitchen.')}</span>
                </div>
              </td>
            </tr>
          {:else}
            {#each draft.areas as area, index (area.id)}
              <tr draggable={!workspace.isPreview} data-drag={index}>
                <td class="cl-grip" aria-hidden="true">⠿</td>
                <td><input class="cl-field" disabled={workspace.isPreview} bind:value={area.name} oninput={() => restaurantConfig.touch()} /></td>
                <td>
                  <span class="range">
                    <input class="cl-field time" type="time" disabled={workspace.isPreview} bind:value={area.lunchStart} oninput={() => restaurantConfig.touch()} />
                    <i>–</i>
                    <input class="cl-field time" type="time" disabled={workspace.isPreview} bind:value={area.lunchEnd} oninput={() => restaurantConfig.touch()} />
                  </span>
                </td>
                <td>
                  <span class="range">
                    <input class="cl-field time" type="time" disabled={workspace.isPreview} bind:value={area.eveningStart} oninput={() => restaurantConfig.touch()} />
                    <i>–</i>
                    <input class="cl-field time" type="time" disabled={workspace.isPreview} bind:value={area.eveningEnd} oninput={() => restaurantConfig.touch()} />
                  </span>
                </td>
                <td><input class="cl-field" disabled={workspace.isPreview} bind:value={area.notes} oninput={() => restaurantConfig.touch()} /></td>
                <td>
                  <label class="switch">
                    <input type="checkbox" disabled={workspace.isPreview} bind:checked={area.active} onchange={() => restaurantConfig.touch()} />
                    <span>{t(area.active ? 'Active' : 'Archived')}</span>
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
  .range {
    display: inline-flex;
    align-items: center;
    gap: 8px;
  }
  .range i {
    color: var(--cl-muted);
    font-style: normal;
  }
  .time {
    width: 116px;
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
</style>

