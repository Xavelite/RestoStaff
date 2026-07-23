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

  function addPosition() {
    const draft = restaurantConfig.draft;
    if (!draft) return;
    draft.jobFunctions = [
      ...draft.jobFunctions,
      { id: crypto.randomUUID(), name: '', code: '', active: true, estimatedHourlyCost: 0 }
    ];
    restaurantConfig.touch();
  }
</script>

<svelte:head><title>{t('Positions')} &middot; restogogo</title></svelte:head>

<ClassicRestaurantPage subtitle="Positions">
  {#snippet children(draft)}
    <div class="cl-toolbar">
      <p class="cl-section__note">
        {t('A position is the job someone does on a shift. Coverage requirements are set per position.')}
      </p>
      <span class="cl-toolbar__grow"></span>
      <button class="cl-btn" type="button" onclick={addPosition}>{t('Add position')}</button>
    </div>

    <div class="cl-tablewrap">
      <table class="cl-table">
        <thead>
          <tr>
            <th class="swatch-col"><span class="sr-only">{t('Colour')}</span></th>
            <th>{t('Name')}</th>
            <th class="is-num">{t('Estimated hourly cost')}</th>
            <th>{t('Active')}</th>
          </tr>
        </thead>
        <tbody>
          {#if !draft.jobFunctions.length}
            <tr>
              <td colspan="4">
                <div class="cl-empty">
                  <strong>{t('No positions yet')}</strong>
                  <span>{t('Add the jobs people do on a shift, such as Server, Cook or Bartender.')}</span>
                </div>
              </td>
            </tr>
          {:else}
            {#each draft.jobFunctions as position (position.id)}
              <tr>
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

    <section class="cl-section">
      <h2 class="cl-section__title">{t('Coverage requirements')}</h2>
      <p class="cl-section__note">
        {t('How many people each area needs per service. Gaps against these show on Schedule → Coverage.')}
      </p>
      <div class="cl-tablewrap">
        <table class="cl-table">
          <thead>
            <tr>
              <th>{t('Area')}</th>
              <th>{t('Position')}</th>
              <th>{t('Service')}</th>
              <th class="is-num">{t('Required')}</th>
            </tr>
          </thead>
          <tbody>
            {#if !draft.coverage.length}
              <tr>
                <td colspan="4">
                  <div class="cl-empty">
                    <strong>{t('No coverage requirements set')}</strong>
                    <span>{t('Without requirements, coverage is never reported as short.')}</span>
                  </div>
                </td>
              </tr>
            {:else}
              {#each draft.coverage as requirement (requirement.id)}
                <tr>
                  <td class="is-quiet">
                    {draft.areas.find((area) => area.id === requirement.areaId)?.name ?? '—'}
                  </td>
                  <td class="is-quiet">
                    {draft.jobFunctions.find((job) => job.id === requirement.jobFunctionId)?.name ?? '—'}
                  </td>
                  <td class="is-quiet">{t(requirement.serviceKey === 'evening' ? 'Evening' : 'Lunch')}</td>
                  <td class="is-num">
                    <input
                      class="cl-field count"
                      type="number"
                      min="0"
                      step="1"
                      bind:value={requirement.requiredCount}
                      oninput={() => restaurantConfig.touch()}
                    />
                  </td>
                </tr>
              {/each}
            {/if}
          </tbody>
        </table>
      </div>
    </section>
  {/snippet}
</ClassicRestaurantPage>

<style>
  .cost,
  .count {
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

