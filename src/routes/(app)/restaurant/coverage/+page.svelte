<script lang="ts">
  import { WEEKDAYS, type ServiceKey } from '$lib/calendar/date';
  import { t } from '$lib/i18n/i18n.svelte';
  import ClassicRestaurantPage from '$lib/classic/ClassicRestaurantPage.svelte';
  import ClassicService from '$lib/classic/ClassicService.svelte';
  import { restaurantConfig } from '$lib/classic/classic-restaurant.svelte';
  import type { CoverageDraft } from '$lib/restaurant/restaurant-model';
  import { workspace } from '$lib/workspace/workspace.svelte';
  import { buildAreaColorMap, buildPositionColorMap } from '$lib/ui/position-color';

  type Row = { areaId: string; jobFunctionId: string; serviceKey: ServiceKey };
  // A pending line lives here, not in the draft, until it names both an area and
  // a position — so you can drop in several blank lines at once and fill the ones
  // you want; the empty ones are simply never saved.
  type NewRow = { tempId: string; areaId: string; jobFunctionId: string; serviceKey: ServiceKey; counts: number[] };

  let newRows = $state<NewRow[]>([]);

  const areaColor = $derived(buildAreaColorMap(workspace.restaurant?.work_areas ?? []));
  const positionColor = $derived(buildPositionColorMap(workspace.restaurant?.job_functions ?? []));

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

  function removeRow(row: Row) {
    const draft = restaurantConfig.draft;
    if (!draft || workspace.isPreview) return;
    draft.coverage = draft.coverage.filter(
      (item) => !(item.areaId === row.areaId && item.jobFunctionId === row.jobFunctionId && item.serviceKey === row.serviceKey)
    );
    restaurantConfig.touch();
  }

  function exists(areaId: string, jobFunctionId: string, serviceKey: ServiceKey): boolean {
    return (restaurantConfig.draft?.coverage ?? []).some(
      (item) => item.areaId === areaId && item.jobFunctionId === jobFunctionId && item.serviceKey === serviceKey
    );
  }

  // A fresh blank line drops in at the top; click again for another. Nothing is
  // pre-filled, so no area or position is chosen for you.
  function addRow() {
    if (!restaurantConfig.draft || workspace.isPreview) return;
    newRows = [
      { tempId: crypto.randomUUID(), areaId: '', jobFunctionId: '', serviceKey: 'lunch', counts: WEEKDAYS.map(() => 0) },
      ...newRows
    ];
  }

  function removeNewRow(tempId: string) {
    newRows = newRows.filter((row) => row.tempId !== tempId);
  }

  function patchNewRow(tempId: string, patch: Partial<NewRow>) {
    newRows = newRows.map((row) => (row.tempId === tempId ? { ...row, ...patch } : row));
    materialize(tempId);
  }

  function setNewCount(tempId: string, index: number, raw: string) {
    newRows = newRows.map((row) =>
      row.tempId === tempId
        ? { ...row, counts: row.counts.map((value, itemIndex) => (itemIndex === index ? normalizedCount(raw) : value)) }
        : row
    );
  }

  // The moment a pending line names both an area and a position (and is not a
  // duplicate), it becomes a real coverage row carrying whatever counts were
  // typed — so Save persists exactly the lines that were filled in.
  function materialize(tempId: string) {
    const draft = restaurantConfig.draft;
    if (!draft) return;
    const row = newRows.find((item) => item.tempId === tempId);
    if (!row || !row.areaId || !row.jobFunctionId) return;
    if (exists(row.areaId, row.jobFunctionId, row.serviceKey)) return;
    const entries: CoverageDraft[] = WEEKDAYS.map((_, index) => ({
      id: crypto.randomUUID(),
      areaId: row.areaId,
      jobFunctionId: row.jobFunctionId,
      serviceKey: row.serviceKey,
      coverageScope: 'weekday',
      weekday: index + 1,
      requiredCount: normalizedCount(row.counts[index])
    }));
    draft.coverage = [...entries, ...draft.coverage];
    newRows = newRows.filter((item) => item.tempId !== tempId);
    restaurantConfig.touch();
  }
</script>

<svelte:head><title>{t('Coverage')} &middot; restogogo</title></svelte:head>

<ClassicRestaurantPage>
  {#snippet children(draft)}
    {@const areaName = new Map(draft.areas.map((area) => [area.id, area.name]))}
    {@const jobName = new Map(draft.jobFunctions.map((job) => [job.id, job.name]))}
    {@const activeAreas = draft.areas.filter((area) => area.active && area.name.trim())}
    {@const activePositions = draft.jobFunctions.filter((job) => job.active && job.name.trim())}
    {@const rows = [...new Map(draft.coverage.map((item) => [
      `${item.areaId}|${item.jobFunctionId}|${item.serviceKey}`,
      { areaId: item.areaId, jobFunctionId: item.jobFunctionId, serviceKey: item.serviceKey }
    ])).values()]}

    <div class="cl-tablewrap">
      <table class="cl-table cov">
        <thead>
          <tr>
            <th>{t('Area')}</th>
            <th>{t('Position')}</th>
            <th>{t('Service')}</th>
            {#each WEEKDAYS as day (day)}<th class="cov__day">{t(day)}</th>{/each}
            <th></th>
          </tr>
        </thead>
        <tbody>
          <tr class="cl-addrow">
            <td colspan={WEEKDAYS.length + 4}>
              <button type="button" disabled={workspace.isPreview || !restaurantConfig.draft} onclick={addRow}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>
                {t('Add requirement')}
              </button>
            </td>
          </tr>
        </tbody>
        <tbody>
          {#each newRows as row (row.tempId)}
            {@const duplicate = Boolean(row.areaId && row.jobFunctionId && exists(row.areaId, row.jobFunctionId, row.serviceKey))}
            <tr class="is-attention">
              <td>
                <select class="cl-field" aria-label={t('Area')} value={row.areaId} onchange={(event) => patchNewRow(row.tempId, { areaId: event.currentTarget.value })}>
                  <option value="">{t('Choose area')}</option>
                  {#each activeAreas as area (area.id)}<option value={area.id}>{area.name}</option>{/each}
                </select>
              </td>
              <td>
                <select class="cl-field" aria-label={t('Position')} value={row.jobFunctionId} onchange={(event) => patchNewRow(row.tempId, { jobFunctionId: event.currentTarget.value })}>
                  <option value="">{t('Choose position')}</option>
                  {#each activePositions as job (job.id)}<option value={job.id}>{job.name}</option>{/each}
                </select>
              </td>
              <td>
                <select class="cl-field" aria-label={t('Service')} value={row.serviceKey} onchange={(event) => patchNewRow(row.tempId, { serviceKey: event.currentTarget.value as ServiceKey })}>
                  <option value="lunch">{t('Lunch')}</option>
                  <option value="evening">{t('Evening')}</option>
                </select>
              </td>
              {#each WEEKDAYS as day, index (day)}
                <td class="cov__day"><input class="cl-field num" class:is-set={row.counts[index] > 0} type="number" min="0" step="1" aria-label={`${t(day)} ${t('required people')}`} value={row.counts[index]} oninput={(event) => setNewCount(row.tempId, index, event.currentTarget.value)} /></td>
              {/each}
              <td class="is-num"><button class="cl-btn is-icon remove" type="button" title={t('Remove')} aria-label={t('Remove')} onclick={() => removeNewRow(row.tempId)}>×</button></td>
            </tr>
            {#if duplicate}
              <tr class="inline-warning"><td colspan={WEEKDAYS.length + 4}>{t('This area, position and service already has a coverage row.')}</td></tr>
            {/if}
          {/each}

          {#if !rows.length && !newRows.length}
            <tr><td colspan={WEEKDAYS.length + 4}><div class="cl-empty"><strong>{t('No coverage requirements set')}</strong><span>{t('Add a line above to set how many people each service needs.')}</span></div></td></tr>
          {:else}
            {#each rows as row (rowKey(row))}
              <tr>
                <td><span class="cl-chip" style="--chip:{areaColor.get(row.areaId) ?? 'var(--cl-line-strong)'}"><span>{areaName.get(row.areaId) ?? '—'}</span></span></td>
                <td><span class="cl-chip" style="--chip:{positionColor.get(row.jobFunctionId) ?? 'var(--cl-line-strong)'}"><span>{jobName.get(row.jobFunctionId) ?? '—'}</span></span></td>
                <td><ClassicService service={row.serviceKey} /></td>
                {#each WEEKDAYS as _day, index (index)}
                  {@const value = entry(draft, row, index + 1)}
                  <td class="cov__day"><input class="cl-field num" class:is-set={(value?.requiredCount ?? 0) > 0} type="number" min="0" step="1" value={value?.requiredCount ?? 0} disabled={workspace.isPreview} oninput={(event) => setCount(row, index + 1, event.currentTarget.value)} /></td>
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
  .cov__day { text-align: center; }
  .num { width: 62px; height: 34px; text-align: center; font-variant-numeric: tabular-nums; color: var(--cl-line-strong); }
  .num.is-set { color: var(--cl-ink); font-weight: var(--rst-fw-bold); }
  .remove { min-height: 30px; height: 30px; width: 30px; color: var(--cl-problem); font-size: 18px; }
  .inline-warning td { padding-block: 7px !important; color: var(--cl-attention); background: var(--cl-attention-wash); font-size: 12px; }
</style>
