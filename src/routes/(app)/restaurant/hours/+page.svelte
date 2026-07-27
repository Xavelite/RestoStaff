<script lang="ts">
  import { WEEKDAYS } from '$lib/calendar/date';
  import { t } from '$lib/i18n/i18n.svelte';
  import { useClassicRestaurantContext } from '$lib/classic/classic-workspace-context';
  import ClassicTablePanel from '$lib/classic/ClassicTablePanel.svelte';
  import { restaurantConfig } from '$lib/classic/classic-restaurant.svelte';
  import type { OpeningDraft } from '$lib/restaurant/restaurant-model';

  const readRestaurantContext = useClassicRestaurantContext();
  const context = $derived(readRestaurantContext());

  function copyService(source: OpeningDraft, service: 'lunch' | 'evening') {
    if (!context?.canSave) return;
    const open = service === 'lunch' ? source.lunchOpen : source.eveningOpen;
    const start = service === 'lunch' ? source.lunchStart : source.eveningStart;
    const end = service === 'lunch' ? source.lunchEnd : source.eveningEnd;
    for (const day of context.draft.opening) {
      if (service === 'lunch') {
        day.lunchOpen = open;
        day.lunchStart = start;
        day.lunchEnd = end;
      } else {
        day.eveningOpen = open;
        day.eveningStart = start;
        day.eveningEnd = end;
      }
    }
    restaurantConfig.touch();
  }
</script>

<svelte:head><title>{t('Hours')} &middot; restogogo</title></svelte:head>

{#if context}
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
                        <input type="checkbox" disabled={!context.canSave} bind:checked={day.lunchOpen} onchange={() => restaurantConfig.touch()} />
                        <span>{t(day.lunchOpen ? 'Open' : 'Closed')}</span>
                      </label>
                      <span class="range">
                        <input class="cl-field time" type="time" disabled={!context.canSave || !day.lunchOpen} bind:value={day.lunchStart} oninput={() => restaurantConfig.touch()} />
                        <i>–</i>
                        <input class="cl-field time" type="time" disabled={!context.canSave || !day.lunchOpen} bind:value={day.lunchEnd} oninput={() => restaurantConfig.touch()} />
                      </span>
                      <button class="copy-hours" type="button" disabled={!context.canSave} title={t('Copy lunch hours to every day')} aria-label={t('Copy lunch hours to every day')} onclick={() => copyService(day, 'lunch')}>
                        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"><rect x="8" y="8" width="10" height="10" rx="2" /><path d="M15 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h2" /></svg>
                      </button>
                    </span>
                  </td>
                  <td>
                    <span class="service-hours">
                      <label class="switch compact">
                        <input type="checkbox" disabled={!context.canSave} bind:checked={day.eveningOpen} onchange={() => restaurantConfig.touch()} />
                        <span>{t(day.eveningOpen ? 'Open' : 'Closed')}</span>
                      </label>
                      <span class="range">
                        <input class="cl-field time" type="time" disabled={!context.canSave || !day.eveningOpen} bind:value={day.eveningStart} oninput={() => restaurantConfig.touch()} />
                        <i>–</i>
                        <input class="cl-field time" type="time" disabled={!context.canSave || !day.eveningOpen} bind:value={day.eveningEnd} oninput={() => restaurantConfig.touch()} />
                      </span>
                      <button class="copy-hours" type="button" disabled={!context.canSave} title={t('Copy evening hours to every day')} aria-label={t('Copy evening hours to every day')} onclick={() => copyService(day, 'evening')}>
                        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"><rect x="8" y="8" width="10" height="10" rx="2" /><path d="M15 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h2" /></svg>
                      </button>
                    </span>
                  </td>
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
      {/snippet}
    </ClassicTablePanel>

{/if}

<style>
  .hours-table { min-width: 760px; }
  .day { font-weight: var(--rst-fw-medium); }
  .service-hours { display: flex; align-items: center; gap: 16px; }
  .switch { display: inline-flex; align-items: center; gap: 7px; min-width: 82px; font-size: 13px; }
  .switch input { width: 16px; height: 16px; accent-color: var(--cl-accent); }
  .range { display: inline-flex; align-items: center; gap: 8px; }
  .range i { color: var(--cl-muted); font-style: normal; }
  .time { width: 110px; }
  .copy-hours { width: 28px; height: 28px; display: grid; place-items: center; margin-left: auto; border: 1px solid transparent; border-radius: 5px; background: transparent; color: var(--cl-muted); cursor: pointer; }
  .copy-hours:hover:not(:disabled) { border-color: var(--cl-line); background: var(--cl-surface-muted); color: var(--cl-ink); }
  .copy-hours:disabled { opacity: .3; cursor: default; }
  .dot { width: 7px; height: 7px; border-radius: 50%; display: inline-block; }
  .dot.is-lunch { background: var(--cl-lunch); }
  .dot.is-evening { background: var(--cl-evening); }
</style>
