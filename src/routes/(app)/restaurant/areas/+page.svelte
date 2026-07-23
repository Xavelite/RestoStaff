<script lang="ts">
  import { t } from '$lib/i18n/i18n.svelte';
  import ClassicRestaurantPage from '$lib/classic/ClassicRestaurantPage.svelte';
  import { restaurantConfig } from '$lib/classic/classic-restaurant.svelte';

  function addArea() {
    const draft = restaurantConfig.draft;
    if (!draft) return;
    draft.areas = [
      ...draft.areas,
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
      }
    ];
    restaurantConfig.touch();
  }
</script>

<svelte:head><title>{t('Areas')} &middot; restogogo</title></svelte:head>

<ClassicRestaurantPage subtitle="Areas">
  {#snippet children(draft)}
    <div class="cl-toolbar">
      <p class="cl-section__note">
        {t('Areas are the parts of the house a shift belongs to. Coverage is counted per area.')}
      </p>
      <span class="cl-toolbar__grow"></span>
      <button class="cl-btn" type="button" onclick={addArea}>{t('Add area')}</button>
    </div>

    <div class="cl-tablewrap">
      <table class="cl-table">
        <thead>
          <tr>
            <th>{t('Name')}</th>
            <th>{t('Lunch')}</th>
            <th>{t('Evening')}</th>
            <th>{t('Notes')}</th>
            <th>{t('Active')}</th>
          </tr>
        </thead>
        <tbody>
          {#if !draft.areas.length}
            <tr>
              <td colspan="5">
                <div class="cl-empty">
                  <strong>{t('No areas yet')}</strong>
                  <span>{t('Add the parts of the house you plan for, such as Hall, Bar or Kitchen.')}</span>
                </div>
              </td>
            </tr>
          {:else}
            {#each draft.areas as area (area.id)}
              <tr>
                <td><input class="cl-field" bind:value={area.name} oninput={() => restaurantConfig.touch()} /></td>
                <td>
                  <span class="range">
                    <input class="cl-field time" type="time" bind:value={area.lunchStart} oninput={() => restaurantConfig.touch()} />
                    <i>–</i>
                    <input class="cl-field time" type="time" bind:value={area.lunchEnd} oninput={() => restaurantConfig.touch()} />
                  </span>
                </td>
                <td>
                  <span class="range">
                    <input class="cl-field time" type="time" bind:value={area.eveningStart} oninput={() => restaurantConfig.touch()} />
                    <i>–</i>
                    <input class="cl-field time" type="time" bind:value={area.eveningEnd} oninput={() => restaurantConfig.touch()} />
                  </span>
                </td>
                <td><input class="cl-field" bind:value={area.notes} oninput={() => restaurantConfig.touch()} /></td>
                <td>
                  <label class="switch">
                    <input type="checkbox" bind:checked={area.active} onchange={() => restaurantConfig.touch()} />
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

