<script lang="ts">
  import { t } from '$lib/i18n/i18n.svelte';
  import ClassicRestaurantPage from '$lib/classic/ClassicRestaurantPage.svelte';
  import { restaurantConfig } from '$lib/classic/classic-restaurant.svelte';
  import { workspace } from '$lib/workspace/workspace.svelte';
  import { buildAreaColorMap, buildPositionColorMap } from '$lib/ui/position-color';

  // Each area wears a stable deep colour; positions wear the vivid one. The two
  // meet on Coverage, so they are coloured from where each is defined.
  const areaColor = $derived(buildAreaColorMap(workspace.restaurant?.work_areas ?? []));
  const positionColor = $derived(buildPositionColorMap(workspace.restaurant?.job_functions ?? []));

  // Which positions a given area actually plans for — read from the coverage
  // the owner has set, so the link is real, not a guess.
  const positionsByArea = $derived.by(() => {
    const draft = restaurantConfig.draft;
    const jobName = new Map((draft?.jobFunctions ?? []).map((job) => [job.id, job.name]));
    const map = new Map<string, { id: string; name: string }[]>();
    for (const item of draft?.coverage ?? []) {
      if (!item.requiredCount) continue;
      const list = map.get(item.areaId) ?? [];
      if (!list.some((entry) => entry.id === item.jobFunctionId)) {
        list.push({ id: item.jobFunctionId, name: jobName.get(item.jobFunctionId) || t('Unnamed position') });
      }
      map.set(item.areaId, list);
    }
    return map;
  });

  function addArea() {
    const draft = restaurantConfig.draft;
    if (!draft) return;
    // A fresh blank row drops in at the top, right under the add control; click
    // again for another. Nothing is pre-filled; blank rows are dropped on save.
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

<ClassicRestaurantPage>
  {#snippet children(draft)}
    <div class="cl-tablewrap">
      <table class="cl-table">
        <thead>
          <tr>
            <th class="swatch-col"><span class="sr-only">{t('Colour')}</span></th>
            <th>{t('Name')}</th>
            <th>{t('Lunch')}</th>
            <th>{t('Evening')}</th>
            <th>{t('Positions')}</th>
            <th>{t('Notes')}</th>
            <th>{t('Active')}</th>
          </tr>
        </thead>
        <tbody>
          <tr class="cl-addrow">
            <td colspan="7">
              <button type="button" disabled={workspace.isPreview || !restaurantConfig.draft} onclick={addArea}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>
                {t('Add area')}
              </button>
            </td>
          </tr>
        </tbody>
        <tbody>
          {#if !draft.areas.length}
            <tr>
              <td colspan="7">
                <div class="cl-empty">
                  <strong>{t('No areas yet')}</strong>
                  <span>{t('Add the parts of the house you plan for, such as Hall, Bar or Kitchen.')}</span>
                </div>
              </td>
            </tr>
          {:else}
            {#each draft.areas as area (area.id)}
              {@const positions = positionsByArea.get(area.id) ?? []}
              <tr>
                <td class="swatch-col">
                  <span class="cl-swatch" style="background:{areaColor.get(area.id) ?? 'var(--cl-line-strong)'}"></span>
                </td>
                <td><input class="cl-field" placeholder={t('Area name')} disabled={workspace.isPreview} bind:value={area.name} oninput={() => restaurantConfig.touch()} /></td>
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
                <td>
                  {#if positions.length}
                    <span class="cl-chips">
                      {#each positions as position (position.id)}
                        <span class="cl-chip" style="--chip:{positionColor.get(position.id) ?? 'var(--cl-line-strong)'}"><span>{position.name}</span></span>
                      {/each}
                    </span>
                  {:else}
                    <span class="cl-chips__empty">{t('No coverage yet')}</span>
                  {/if}
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

