<script lang="ts">
  import { onMount } from 'svelte';
  import { WEEKDAYS, type ServiceKey } from '$lib/calendar/date';
  import { t } from '$lib/i18n/i18n.svelte';
  import { unsavedChanges } from '$lib/navigation/unsaved-changes.svelte';
  import ClassicRestaurantPage from '$lib/classic/ClassicRestaurantPage.svelte';
  import ClassicService from '$lib/classic/ClassicService.svelte';
  import { restaurantConfig } from '$lib/classic/classic-restaurant.svelte';
  import type { CoverageDraft } from '$lib/restaurant/restaurant-model';
  import { workspace } from '$lib/workspace/workspace.svelte';

  type Row = { areaId: string; jobFunctionId: string; serviceKey: ServiceKey };

  let adding = $state(false);
  let newArea = $state('');
  let newPosition = $state('');
  let newService = $state<ServiceKey>('lunch');
  let newCounts = $state<number[]>(WEEKDAYS.map(() => 0));

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

  function normalizedCount(raw: string | number): number {
    return Math.max(0, Math.round(Number(raw) || 0));
  }

  function setNewCount(index: number, raw: string) {
    newCounts = newCounts.map((value, itemIndex) => itemIndex === index ? normalizedCount(raw) : value);
  }

  function setCount(row: Row, weekday: number, raw: string) {
    const draft = restaurantConfig.draft;
    if (!draft || workspace.isPreview) return;
    const existing = entry(draft, row, weekday);
    const requiredCount = normalizedCount(raw);
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

  function resetAddRow() {
    adding = false;
    newArea = '';
    newPosition = '';
    newService = 'lunch';
    newCounts = WEEKDAYS.map(() => 0);
  }

  function startAdd() {
    if (!restaurantConfig.draft || workspace.isPreview) return;
    newArea ||= restaurantConfig.draft.areas.find((area) => area.active)?.id ?? '';
    newPosition ||= restaurantConfig.draft.jobFunctions.find((job) => job.active)?.id ?? '';
    adding = true;
  }

  function commitAddRow(): void {
    const draft = restaurantConfig.draft;
    if (!draft || workspace.isPreview) throw new Error(t('Coverage setup is not editable.'));
    if (!newArea || !newPosition) throw new Error(t('Choose an area and position before adding coverage.'));
    const row = { areaId: newArea, jobFunctionId: newPosition, serviceKey: newService };
    const alreadyExists = draft.coverage.some(
      (item) => item.areaId === row.areaId && item.jobFunctionId === row.jobFunctionId && item.serviceKey === row.serviceKey
    );
    if (alreadyExists) throw new Error(t('This area, position and service already has a coverage row.'));

    const entries: CoverageDraft[] = WEEKDAYS.map((_, index) => ({
      id: crypto.randomUUID(),
      areaId: row.areaId,
      jobFunctionId: row.jobFunctionId,
      serviceKey: row.serviceKey,
      coverageScope: 'weekday',
      weekday: index + 1,
      requiredCount: normalizedCount(newCounts[index])
    }));
    draft.coverage = [...entries, ...draft.coverage];
    restaurantConfig.touch();
    resetAddRow();
  }

  onMount(() =>
    unsavedChanges.register({
      id: 'restaurant-coverage-new-row',
      label: 'Coverage requirement',
      priority: 10,
      isDirty: () => adding,
      save: commitAddRow,
      discard: resetAddRow
    })
  );

  function removeRow(row: Row) {
    const draft = restaurantConfig.draft;
    if (!draft || workspace.isPreview) return;
    draft.coverage = draft.coverage.filter(
      (item) => !(item.areaId === row.areaId && item.jobFunctionId === row.jobFunctionId && item.serviceKey === row.serviceKey)
    );
    restaurantConfig.touch();
  }
</script>

<svelte:head><title>{t('Coverage')} &middot; restogogo</title></svelte:head>

{#snippet pageActions()}
  <button class="cl-btn" type="button" disabled={workspace.isPreview || !restaurantConfig.draft || adding} onclick={startAdd}>
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
    {@const duplicateNewRow = Boolean(newArea && newPosition && rows.some((row) => row.areaId === newArea && row.jobFunctionId === newPosition && row.serviceKey === newService))}

    <p class="cl-section__note">{t('Set the required people for every weekday. There is no inherited default: each day is explicit.')}</p>

    <div class="cl-tablewrap">
      <table class="cl-table cov">
        <thead><tr><th>{t('Area')}</th><th>{t('Position')}</th><th>{t('Service')}</th>{#each WEEKDAYS as day (day)}<th class="cov__day">{t(day)}</th>{/each}<th></th></tr></thead>
        <tbody>
          {#if adding}
            <tr class="is-attention add-requirement-row">
              <td><select class="cl-field" aria-label={t('Area')} bind:value={newArea}><option value="">{t('Area')}</option>{#each draft.areas.filter((area) => area.active) as area (area.id)}<option value={area.id}>{area.name || t('Unnamed area')}</option>{/each}</select></td>
              <td><select class="cl-field" aria-label={t('Position')} bind:value={newPosition}><option value="">{t('Position')}</option>{#each draft.jobFunctions.filter((job) => job.active) as job (job.id)}<option value={job.id}>{job.name || t('Unnamed position')}</option>{/each}</select></td>
              <td><select class="cl-field" aria-label={t('Service')} bind:value={newService}><option value="lunch">{t('Lunch')}</option><option value="evening">{t('Evening')}</option></select></td>
              {#each WEEKDAYS as day, index (day)}
                <td class="cov__day"><input class="cl-field num" type="number" min="0" step="1" aria-label={`${t(day)} ${t('required people')}`} value={newCounts[index]} oninput={(event) => setNewCount(index, event.currentTarget.value)} /></td>
              {/each}
              <td class="row-actions">
                <button class="cl-btn is-primary is-icon" type="button" title={t('Add')} aria-label={t('Add')} disabled={!newArea || !newPosition || duplicateNewRow} onclick={commitAddRow}>✓</button>
                <button class="cl-btn is-icon" type="button" title={t('Cancel')} aria-label={t('Cancel')} onclick={resetAddRow}>×</button>
              </td>
            </tr>
            {#if duplicateNewRow}<tr class="inline-warning"><td colspan={WEEKDAYS.length + 4}>{t('This area, position and service already has a coverage row.')}</td></tr>{/if}
            {#if !draft.areas.some((area) => area.active) || !draft.jobFunctions.some((job) => job.active)}
              <tr class="inline-warning"><td colspan={WEEKDAYS.length + 4}>{t('Create an active area and position before adding coverage.')}</td></tr>
            {/if}
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
                  <td class="cov__day"><input class="cl-field num" type="number" min="0" step="1" value={value?.requiredCount ?? 0} disabled={workspace.isPreview} oninput={(event) => setCount(row, index + 1, event.currentTarget.value)} /></td>
                {/each}
                <td class="is-num"><button class="cl-btn is-icon remove" type="button" disabled={workspace.isPreview} title={t('Remove requirement')} aria-label={t('Remove requirement')} onclick={() => removeRow(row)}>×</button></td>
              </tr>
            {/each}
          {/if}
        </tbody>
      </table>
    </div>
  {/snippet}
</ClassicRestaurantPage>

<style>
  .cov { min-width: 980px; }
  .cov__day { text-align: center; border-left: 1px solid var(--cl-line); }
  .num { width: 62px; height: 34px; text-align: center; font-variant-numeric: tabular-nums; }
  .row-actions { display: flex; gap: 5px; white-space: nowrap; }
  .row-actions .cl-btn { min-height: 30px; width: 30px; }
  .remove { min-height: 30px; height: 30px; width: 30px; color: var(--cl-problem); font-size: 18px; }
  .inline-warning td { padding-block: 7px !important; color: var(--cl-attention); background: var(--cl-attention-wash); font-size: 12px; }
</style>
