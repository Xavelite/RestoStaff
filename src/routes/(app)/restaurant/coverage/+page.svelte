<script lang="ts">
  import { WEEKDAYS, type ServiceKey } from '$lib/calendar/date';
  import { t } from '$lib/i18n/i18n.svelte';
  import ClassicRestaurantPage from '$lib/classic/ClassicRestaurantPage.svelte';
  import ClassicService from '$lib/classic/ClassicService.svelte';
  import { restaurantConfig } from '$lib/classic/classic-restaurant.svelte';
  import type { CoverageDraft } from '$lib/restaurant/restaurant-model';

  type Row = { areaId: string; jobFunctionId: string; serviceKey: ServiceKey };

  let adding = $state(false);
  let newArea = $state('');
  let newPosition = $state('');
  let newService = $state<ServiceKey>('lunch');

  function rowKey(row: Row): string {
    return `${row.areaId}|${row.jobFunctionId}|${row.serviceKey}`;
  }

  function entry(draft: { coverage: CoverageDraft[] }, row: Row, weekday: number): CoverageDraft | undefined {
    return draft.coverage.find(
      (item) =>
        item.areaId === row.areaId &&
        item.jobFunctionId === row.jobFunctionId &&
        item.serviceKey === row.serviceKey &&
        item.weekday === weekday
    );
  }

  function setCount(row: Row, weekday: number, raw: string) {
    const draft = restaurantConfig.draft;
    if (!draft) return;
    const existing = entry(draft, row, weekday);
    const requiredCount = Math.max(0, Math.round(Number(raw) || 0));
    if (existing) existing.requiredCount = requiredCount;
    else {
      draft.coverage = [
        ...draft.coverage,
        {
          id: crypto.randomUUID(),
          areaId: row.areaId,
          jobFunctionId: row.jobFunctionId,
          serviceKey: row.serviceKey,
          coverageScope: 'weekday',
          weekday,
          requiredCount
        }
      ];
    }
    restaurantConfig.touch();
  }

  function confirmAdd() {
    const draft = restaurantConfig.draft;
    if (!draft || !newArea || !newPosition) return;
    const row = { areaId: newArea, jobFunctionId: newPosition, serviceKey: newService };
    const alreadyExists = draft.coverage.some(
      (item) => item.areaId === row.areaId && item.jobFunctionId === row.jobFunctionId && item.serviceKey === row.serviceKey
    );
    if (!alreadyExists) {
      const entries: CoverageDraft[] = WEEKDAYS.map((_, index) => ({
        id: crypto.randomUUID(),
        areaId: row.areaId,
        jobFunctionId: row.jobFunctionId,
        serviceKey: row.serviceKey,
        coverageScope: 'weekday',
        weekday: index + 1,
        requiredCount: 0
      }));
      draft.coverage = [...entries, ...draft.coverage];
      restaurantConfig.touch();
    }
    adding = false;
    newArea = '';
    newPosition = '';
  }

  function removeRow(row: Row) {
    const draft = restaurantConfig.draft;
    if (!draft) return;
    draft.coverage = draft.coverage.filter(
      (item) => !(item.areaId === row.areaId && item.jobFunctionId === row.jobFunctionId && item.serviceKey === row.serviceKey)
    );
    restaurantConfig.touch();
  }
</script>

<svelte:head><title>{t('Coverage')} &middot; restogogo</title></svelte:head>

{#snippet pageActions()}
  <button class="cl-btn" type="button" onclick={() => (adding = true)}>
    <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>
    <span class="cl-action-label">{t('Add requirement')}</span>
  </button>
{/snippet}

<ClassicRestaurantPage actions={pageActions}>
  {#snippet children(draft)}
    {@const areaName = new Map(draft.areas.map((area) => [area.id, area.name]))}
    {@const jobName = new Map(draft.jobFunctions.map((job) => [job.id, job.name]))}
    {@const rows = [...new Map(draft.coverage.map((item) => [
      `${item.areaId}|${item.jobFunctionId}|${item.serviceKey}`,
      { areaId: item.areaId, jobFunctionId: item.jobFunctionId, serviceKey: item.serviceKey }
    ])).values()]}

    <p class="cl-section__note">{t('Set the required people for every weekday. There is no inherited default: each day is explicit.')}</p>

    <div class="cl-tablewrap">
      <table class="cl-table cov">
        <thead><tr><th>{t('Area')}</th><th>{t('Position')}</th><th>{t('Service')}</th>{#each WEEKDAYS as day (day)}<th class="cov__day">{t(day)}</th>{/each}<th></th></tr></thead>
        <tbody>
          {#if adding}
            <tr class="is-attention">
              <td><select class="cl-field" bind:value={newArea}><option value="">{t('Area')}</option>{#each draft.areas.filter((area) => area.active) as area (area.id)}<option value={area.id}>{area.name}</option>{/each}</select></td>
              <td><select class="cl-field" bind:value={newPosition}><option value="">{t('Position')}</option>{#each draft.jobFunctions.filter((job) => job.active) as job (job.id)}<option value={job.id}>{job.name}</option>{/each}</select></td>
              <td><select class="cl-field" bind:value={newService}><option value="lunch">{t('Lunch')}</option><option value="evening">{t('Evening')}</option></select></td>
              <td colspan={WEEKDAYS.length + 1}><span class="addrow"><button class="cl-btn is-primary" type="button" disabled={!newArea || !newPosition} onclick={confirmAdd}>{t('Add')}</button><button class="cl-btn" type="button" onclick={() => (adding = false)}>{t('Cancel')}</button></span></td>
            </tr>
          {/if}
          {#if !rows.length && !adding}
            <tr><td colspan={WEEKDAYS.length + 4}><div class="cl-empty"><strong>{t('No coverage requirements set')}</strong><span>{t('Without requirements, coverage is never reported as short.')}</span></div></td></tr>
          {:else}
            {#each rows as row (rowKey(row))}
              <tr>
                <td>{areaName.get(row.areaId) ?? '—'}</td>
                <td>{jobName.get(row.jobFunctionId) ?? '—'}</td>
                <td><ClassicService service={row.serviceKey} /></td>
                {#each WEEKDAYS as _day, index (index)}
                  {@const value = entry(draft, row, index + 1)}
                  <td class="cov__day"><input class="cl-field num" type="number" min="0" step="1" value={value?.requiredCount ?? 0} oninput={(event) => setCount(row, index + 1, event.currentTarget.value)} /></td>
                {/each}
                <td class="is-num"><button class="cl-btn is-icon remove" type="button" title={t('Remove requirement')} aria-label={t('Remove requirement')} onclick={() => removeRow(row)}>×</button></td>
              </tr>
            {/each}
          {/if}
        </tbody>
      </table>
    </div>
  {/snippet}
</ClassicRestaurantPage>

<style>
  .cov { min-width: 900px; }
  .cov__day { text-align: center; border-left: 1px solid var(--cl-line); }
  .num { width: 62px; height: 34px; text-align: center; font-variant-numeric: tabular-nums; }
  .addrow { display: inline-flex; gap: 8px; }
  .remove { min-height: 30px; height: 30px; width: 30px; color: var(--cl-problem); font-size: 18px; }
</style>
