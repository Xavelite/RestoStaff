<script lang="ts">
  import { WEEKDAYS } from '$lib/calendar/date';
  import { t } from '$lib/i18n/i18n.svelte';
  import ClassicRestaurantPage from '$lib/classic/ClassicRestaurantPage.svelte';
  import ClassicTablePanel from '$lib/classic/ClassicTablePanel.svelte';
  import { restaurantConfig } from '$lib/classic/classic-restaurant.svelte';
</script>

<svelte:head><title>{t('Hours')} &middot; restogogo</title></svelte:head>

<ClassicRestaurantPage>
  {#snippet children(context)}
    {@const draft = context.draft}
    {@const lunchDays = draft.opening.filter((day) => day.lunchOpen).length}
    {@const eveningDays = draft.opening.filter((day) => day.eveningOpen).length}
    <ClassicTablePanel dirty={context.dirty} saving={context.saving} canSave={context.canSave} onsave={() => void context.save().catch(() => undefined)} ondiscard={context.discard}>
      {#snippet meta()}
        <span><i class="dot is-lunch"></i>{t('{count} lunch days', { count: lunchDays })}</span>
        <span><i class="dot is-evening"></i>{t('{count} evening days', { count: eveningDays })}</span>
      {/snippet}
      {#snippet children()}
        <div class="cl-tablewrap">
          <table class="cl-table hours-table">
            <thead>
              <tr>
                <th>{t('Day')}</th>
                <th>{t('Lunch')}</th>
                <th>{t('Evening')}</th>
              </tr>
            </thead>
            <tbody>
              {#each draft.opening as day (day.weekday)}
                <tr>
                  <td class="day">{t(WEEKDAYS[day.weekday - 1])}</td>
                  <td>
                    <span class="service-hours">
                      <label class="switch compact">
                        <input type="checkbox" bind:checked={day.lunchOpen} onchange={() => restaurantConfig.touch()} />
                        <span>{t(day.lunchOpen ? 'Open' : 'Closed')}</span>
                      </label>
                      <span class="range">
                        <input class="cl-field time" type="time" disabled={!day.lunchOpen} bind:value={day.lunchStart} oninput={() => restaurantConfig.touch()} />
                        <i>–</i>
                        <input class="cl-field time" type="time" disabled={!day.lunchOpen} bind:value={day.lunchEnd} oninput={() => restaurantConfig.touch()} />
                      </span>
                    </span>
                  </td>
                  <td>
                    <span class="service-hours">
                      <label class="switch compact">
                        <input type="checkbox" bind:checked={day.eveningOpen} onchange={() => restaurantConfig.touch()} />
                        <span>{t(day.eveningOpen ? 'Open' : 'Closed')}</span>
                      </label>
                      <span class="range">
                        <input class="cl-field time" type="time" disabled={!day.eveningOpen} bind:value={day.eveningStart} oninput={() => restaurantConfig.touch()} />
                        <i>–</i>
                        <input class="cl-field time" type="time" disabled={!day.eveningOpen} bind:value={day.eveningEnd} oninput={() => restaurantConfig.touch()} />
                      </span>
                    </span>
                  </td>
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
      {/snippet}
    </ClassicTablePanel>
  {/snippet}
</ClassicRestaurantPage>

<style>
  .hours-table { min-width: 760px; }
  .day { font-weight: var(--rst-fw-medium); }
  .service-hours { display: flex; align-items: center; gap: 16px; }
  .switch { display: inline-flex; align-items: center; gap: 7px; min-width: 82px; font-size: 13px; }
  .switch input { width: 16px; height: 16px; accent-color: var(--cl-accent); }
  .range { display: inline-flex; align-items: center; gap: 8px; }
  .range i { color: var(--cl-muted); font-style: normal; }
  .time { width: 110px; }
  .dot { width: 7px; height: 7px; border-radius: 50%; display: inline-block; }
  .dot.is-lunch { background: var(--cl-lunch); }
  .dot.is-evening { background: var(--cl-evening); }
</style>
