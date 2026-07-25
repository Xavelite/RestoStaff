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
    {@const openDays = draft.opening.filter((day) => day.open).length}
    <ClassicTablePanel dirty={context.dirty} saving={context.saving} canSave={context.canSave} onsave={() => void context.save().catch(() => undefined)} ondiscard={context.discard}>
      {#snippet meta()}
        <span><i class="dot"></i>{t('{count}/7 days open', { count: openDays })}</span>
      {/snippet}
      {#snippet children()}
    <div class="cl-tablewrap">
      <table class="cl-table">
        <thead>
          <tr>
            <th>{t('Day')}</th>
            <th>{t('Open')}</th>
            <th>{t('Lunch')}</th>
            <th>{t('Evening')}</th>
          </tr>
        </thead>
        <tbody>
          {#each draft.opening as day (day.weekday)}
            <tr>
              <td>{t(WEEKDAYS[day.weekday - 1])}</td>
              <td>
                <label class="switch">
                  <input type="checkbox" bind:checked={day.open} onchange={() => restaurantConfig.touch()} />
                  <span>{t(day.open ? 'Open' : 'Closed')}</span>
                </label>
              </td>
              <td>
                <span class="range">
                  <input class="cl-field time" type="time" disabled={!day.open} bind:value={day.lunchStart} oninput={() => restaurantConfig.touch()} />
                  <i>–</i>
                  <input class="cl-field time" type="time" disabled={!day.open} bind:value={day.lunchEnd} oninput={() => restaurantConfig.touch()} />
                </span>
              </td>
              <td>
                <span class="range">
                  <input class="cl-field time" type="time" disabled={!day.open} bind:value={day.eveningStart} oninput={() => restaurantConfig.touch()} />
                  <i>–</i>
                  <input class="cl-field time" type="time" disabled={!day.open} bind:value={day.eveningEnd} oninput={() => restaurantConfig.touch()} />
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
  .dot { width: 7px; height: 7px; border-radius: 50%; background: var(--cl-ok); display: inline-block; }
</style>

