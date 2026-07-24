<script lang="ts">
  import { WEEKDAYS, type ServiceKey } from '$lib/calendar/date';
  import { t } from '$lib/i18n/i18n.svelte';
  import ClassicRestaurantPage from '$lib/classic/ClassicRestaurantPage.svelte';
  import ClassicService from '$lib/classic/ClassicService.svelte';
  import { restaurantConfig } from '$lib/classic/classic-restaurant.svelte';
  import type { CoverageDraft } from '$lib/restaurant/restaurant-model';

  const SERVICES: ServiceKey[] = ['lunch', 'evening'];

  // A row is one area + position + service. Its cells are the default
  // requirement and an optional override per weekday, which is exactly how
  // coverage_requirements already models scope.
  type Row = { areaId: string; jobFunctionId: string; serviceKey: ServiceKey };

  function rowKey(row: Row): string {
    return `${row.areaId}|${row.jobFunctionId}|${row.serviceKey}`;
  }

  function entry(
    draft: { coverage: CoverageDraft[] },
    row: Row,
    weekday: number | null
  ): CoverageDraft | undefined {
    return draft.coverage.find(
      (item) =>
        item.areaId === row.areaId &&
        item.jobFunctionId === row.jobFunctionId &&
        item.serviceKey === row.serviceKey &&
        (weekday === null
          ? item.coverageScope === 'default'
          : item.coverageScope === 'weekday' && item.weekday === weekday)
    );
  }

  /** Blank clears an override; a number writes one, creating the row if needed. */
  function setCount(row: Row, weekday: number | null, raw: string) {
    const draft = restaurantConfig.draft;
    if (!draft) return;
    const existing = entry(draft, row, weekday);
    const value = raw.trim();

    if (value === '' && weekday !== null) {
      draft.coverage = draft.coverage.filter((item) => item !== existing);
      restaurantConfig.touch();
      return;
    }
    const count = Math.max(0, Number(value) || 0);
    if (existing) {
      existing.requiredCount = count;
    } else {
      draft.coverage = [
        ...draft.coverage,
        {
          id: crypto.randomUUID(),
          areaId: row.areaId,
          jobFunctionId: row.jobFunctionId,
          serviceKey: row.serviceKey,
          coverageScope: weekday === null ? 'default' : 'weekday',
          weekday: weekday ?? 0,
          requiredCount: count
        }
      ];
    }
    restaurantConfig.touch();
  }

  // A new requirement lands on top, the same way Add area and Add position do.
  let adding = $state(false);
  let newArea = $state('');
  let newPosition = $state('');
  let newService = $state<ServiceKey>('lunch');

  function confirmAdd() {
    const draft = restaurantConfig.draft;
    if (!draft || !newArea || !newPosition) return;
    const row = { areaId: newArea, jobFunctionId: newPosition, serviceKey: newService };
    if (!entry(draft, row, null)) setCount(row, null, '1');
    adding = false;
    newArea = '';
    newPosition = '';
  }
</script>

<svelte:head><title>{t('Coverage')} &middot; restogogo</title></svelte:head>

{#snippet pageActions()}
  <button class="cl-btn" type="button" onclick={() => (adding = true)}>
    <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>
    {t('Add requirement')}
  </button>
{/snippet}

<ClassicRestaurantPage actions={pageActions}>
  {#snippet children(draft)}
    {@const areaName = new Map(draft.areas.map((area) => [area.id, area.name]))}
    {@const jobName = new Map(draft.jobFunctions.map((job) => [job.id, job.name]))}
    {@const rows = [
      ...new Map(
        draft.coverage.map((item) => [
          `${item.areaId}|${item.jobFunctionId}|${item.serviceKey}`,
          { areaId: item.areaId, jobFunctionId: item.jobFunctionId, serviceKey: item.serviceKey }
        ])
      ).values()
    ].sort(
      (left, right) =>
        (areaName.get(left.areaId) ?? '').localeCompare(areaName.get(right.areaId) ?? '') ||
        (jobName.get(left.jobFunctionId) ?? '').localeCompare(jobName.get(right.jobFunctionId) ?? '') ||
        left.serviceKey.localeCompare(right.serviceKey)
    )}

    <p class="cl-section__note">
      {t('How many people each area needs per service. Set a default, then override only the days that differ.')}
    </p>

    <div class="cl-tablewrap">
      <table class="cl-table cov">
        <thead>
          <tr>
            <th>{t('Area')}</th>
            <th>{t('Position')}</th>
            <th>{t('Service')}</th>
            <th class="cov__default">{t('Default')}</th>
            {#each WEEKDAYS as day (day)}
              <th class="cov__day">{t(day)}</th>
            {/each}
          </tr>
        </thead>
        <tbody>
          {#if adding}
            <tr class="is-attention">
              <td>
                <select class="cl-field" bind:value={newArea}>
                  <option value="">{t('Area')}</option>
                  {#each draft.areas.filter((area) => area.active) as area (area.id)}
                    <option value={area.id}>{area.name}</option>
                  {/each}
                </select>
              </td>
              <td>
                <select class="cl-field" bind:value={newPosition}>
                  <option value="">{t('Position')}</option>
                  {#each draft.jobFunctions.filter((job) => job.active) as job (job.id)}
                    <option value={job.id}>{job.name}</option>
                  {/each}
                </select>
              </td>
              <td>
                <select class="cl-field" bind:value={newService}>
                  <option value="lunch">{t('Lunch')}</option>
                  <option value="evening">{t('Evening')}</option>
                </select>
              </td>
              <td colspan={WEEKDAYS.length + 1}>
                <span class="addrow">
                  <button class="cl-btn is-primary" type="button" disabled={!newArea || !newPosition} onclick={confirmAdd}>{t('Add')}</button>
                  <button class="cl-btn" type="button" onclick={() => (adding = false)}>{t('Cancel')}</button>
                </span>
              </td>
            </tr>
          {/if}
          {#if !rows.length && !adding}
            <tr>
              <td colspan={WEEKDAYS.length + 4}>
                <div class="cl-empty">
                  <strong>{t('No coverage requirements set')}</strong>
                  <span>{t('Without requirements, coverage is never reported as short.')}</span>
                </div>
              </td>
            </tr>
          {:else}
            {#each rows as row (rowKey(row))}
              {@const base = entry(draft, row, null)}
              <tr>
                <td>{areaName.get(row.areaId) ?? '—'}</td>
                <td>{jobName.get(row.jobFunctionId) ?? '—'}</td>
                <td><ClassicService service={row.serviceKey} /></td>
                <td class="cov__default">
                  <input
                    class="cl-field num"
                    type="number"
                    min="0"
                    step="1"
                    value={base?.requiredCount ?? 0}
                    oninput={(event) => setCount(row, null, event.currentTarget.value)}
                  />
                </td>
                {#each WEEKDAYS as _day, index (index)}
                  {@const override = entry(draft, row, index + 1)}
                  <td class="cov__day">
                    <input
                      class="cl-field num"
                      class:is-override={override !== undefined}
                      type="number"
                      min="0"
                      step="1"
                      placeholder={String(base?.requiredCount ?? 0)}
                      value={override?.requiredCount ?? ''}
                      oninput={(event) => setCount(row, index + 1, event.currentTarget.value)}
                    />
                  </td>
                {/each}
              </tr>
            {/each}
          {/if}
        </tbody>
      </table>
    </div>

    <p class="cl-section__note">
      {t('A blank day follows the default. Type a number to override just that day.')}
    </p>
  {/snippet}
</ClassicRestaurantPage>

<style>
  .cov {
    min-width: 940px;
  }
  .cov__default,
  .cov__day {
    text-align: center;
    border-left: 1px solid var(--cl-line);
  }
  .cov__default {
    background: var(--cl-surface-muted);
  }
  .num {
    width: 62px;
    height: 34px;
    text-align: center;
    font-variant-numeric: tabular-nums;
  }
  /* A day that departs from the default is marked, so the exceptions read at a
     glance against the inherited blanks. */
  .num.is-override {
    border-color: var(--cl-accent);
    color: var(--cl-accent);
    font-weight: var(--rst-fw-bold);
  }
  .addrow {
    display: inline-flex;
    gap: 8px;
  }
</style>
