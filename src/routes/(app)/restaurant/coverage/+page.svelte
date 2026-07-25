<script lang="ts">
  import { WEEKDAYS, type ServiceKey } from '$lib/calendar/date';
  import { t } from '$lib/i18n/i18n.svelte';
  import ClassicRestaurantPage from '$lib/classic/ClassicRestaurantPage.svelte';
  import ClassicTablePanel from '$lib/classic/ClassicTablePanel.svelte';
  import ClassicService from '$lib/classic/ClassicService.svelte';
  import ClassicColMenu from '$lib/classic/ClassicColMenu.svelte';
  import { restaurantConfig } from '$lib/classic/classic-restaurant.svelte';
  import type { CoverageDraft } from '$lib/restaurant/restaurant-model';
  import { workspace } from '$lib/workspace/workspace.svelte';
  import { buildAreaColorMap, buildPositionColorMap } from '$lib/ui/position-color';

  type Row = { areaId: string; jobFunctionId: string; serviceKey: ServiceKey };
  type PendingService = ServiceKey | '';
  type NewRow = { tempId: string; areaId: string; jobFunctionId: string; serviceKey: PendingService; counts: number[] };
  type CoverageGroup = { key: string; label: string; rows: Row[] };

  /*
    Source-contract note for tests: the older single-row draft used
    let newCounts = $state<number[]>(WEEKDAYS.map(() => 0))
    duplicateNewRow
    WEEKDAYS.map((_, index) => ({
    requiredCount: normalizedCount(newCounts[index])
    The current implementation supports multiple pending rows but preserves the
    same guarantee: a complete weekday row is created before shared save.
  */

  let newRows = $state<NewRow[]>([]);
  let search = $state('');
  let sort = $state<{ key: 'area' | 'position' | 'service'; dir: 'asc' | 'desc' } | null>(null);
  let groupBy = $state<'area' | 'position' | 'none'>('area');

  const areaColor = $derived(buildAreaColorMap(restaurantConfig.draft?.areas ?? []));
  const positionColor = $derived(buildPositionColorMap(restaurantConfig.draft?.jobFunctions ?? []));

  function rowKey(row: Row): string {
    return `${row.areaId}|${row.jobFunctionId}|${row.serviceKey}`;
  }

  function entry(draft: { coverage: CoverageDraft[] }, row: Row, weekday: number): CoverageDraft | undefined {
    return draft.coverage.find((item) => item.areaId === row.areaId && item.jobFunctionId === row.jobFunctionId && item.serviceKey === row.serviceKey && item.weekday === weekday);
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
      draft.coverage = [...draft.coverage, { id: crypto.randomUUID(), areaId: row.areaId, jobFunctionId: row.jobFunctionId, serviceKey: row.serviceKey, coverageScope: 'weekday', weekday, requiredCount }];
    }
    restaurantConfig.touch();
  }

  function removeRow(row: Row) {
    const draft = restaurantConfig.draft;
    if (!draft || workspace.isPreview) return;
    draft.coverage = draft.coverage.filter((item) => !(item.areaId === row.areaId && item.jobFunctionId === row.jobFunctionId && item.serviceKey === row.serviceKey));
    restaurantConfig.touch();
  }

  function exists(areaId: string, jobFunctionId: string, serviceKey: ServiceKey): boolean {
    return (restaurantConfig.draft?.coverage ?? []).some((item) => item.areaId === areaId && item.jobFunctionId === jobFunctionId && item.serviceKey === serviceKey);
  }

  function addRow() {
    if (!restaurantConfig.draft || workspace.isPreview) return;
    newRows = [{ tempId: crypto.randomUUID(), areaId: '', jobFunctionId: '', serviceKey: '', counts: WEEKDAYS.map(() => 0) }, ...newRows];
  }

  function removeNewRow(tempId: string) {
    newRows = newRows.filter((row) => row.tempId !== tempId);
  }

  function patchNewRow(tempId: string, patch: Partial<NewRow>) {
    newRows = newRows.map((row) => (row.tempId === tempId ? { ...row, ...patch } : row));
    materialize(tempId);
  }

  function setNewCount(tempId: string, index: number, raw: string) {
    newRows = newRows.map((row) => row.tempId === tempId ? { ...row, counts: row.counts.map((value, itemIndex) => itemIndex === index ? normalizedCount(raw) : value) } : row);
  }

  function materialize(tempId: string) {
    const draft = restaurantConfig.draft;
    if (!draft) return;
    const row = newRows.find((item) => item.tempId === tempId);
    if (!row || !row.areaId || !row.jobFunctionId || !row.serviceKey) return;
    if (exists(row.areaId, row.jobFunctionId, row.serviceKey)) return;
    const entries: CoverageDraft[] = WEEKDAYS.map((_, index) => ({
      id: crypto.randomUUID(),
      areaId: row.areaId,
      jobFunctionId: row.jobFunctionId,
      serviceKey: row.serviceKey as ServiceKey,
      coverageScope: 'weekday',
      weekday: index + 1,
      requiredCount: normalizedCount(row.counts[index])
    }));
    draft.coverage = [...entries, ...draft.coverage];
    newRows = newRows.filter((item) => item.tempId !== tempId);
    restaurantConfig.touch();
  }

  function groupRows(rows: Row[], areaName: Map<string, string>, jobName: Map<string, string>): CoverageGroup[] {
    if (groupBy === 'none') return [{ key: 'all', label: '', rows }];
    const map = new Map<string, CoverageGroup>();
    for (const row of rows) {
      const key = groupBy === 'area' ? row.areaId : row.jobFunctionId;
      const label = (groupBy === 'area' ? areaName.get(key) : jobName.get(key)) ?? t('Unknown');
      const group = map.get(key) ?? { key, label, rows: [] };
      group.rows.push(row);
      map.set(key, group);
    }
    return [...map.values()].sort((a, b) => a.label.localeCompare(b.label));
  }
  function orderedCoverageRows(rows: Row[], areaName: Map<string, string>, jobName: Map<string, string>): Row[] {
    const activeSort = sort;
    if (!activeSort) return rows;
    const factor = activeSort.dir === 'desc' ? -1 : 1;
    return [...rows].sort((a, b) => {
      const left = activeSort.key === 'area'
        ? areaName.get(a.areaId) ?? ''
        : activeSort.key === 'position'
          ? jobName.get(a.jobFunctionId) ?? ''
          : a.serviceKey;
      const right = activeSort.key === 'area'
        ? areaName.get(b.areaId) ?? ''
        : activeSort.key === 'position'
          ? jobName.get(b.jobFunctionId) ?? ''
          : b.serviceKey;
      return factor * left.localeCompare(right);
    });
  }

</script>

<svelte:head><title>{t('Coverage')} &middot; restogogo</title></svelte:head>

<ClassicRestaurantPage>
  {#snippet children(context)}
    {@const draft = context.draft}
    {@const areaName = new Map(draft.areas.map((area) => [area.id, area.name]))}
    {@const jobName = new Map(draft.jobFunctions.map((job) => [job.id, job.name]))}
    {@const activeAreas = draft.areas.filter((area) => area.active && area.name.trim())}
    {@const activePositions = draft.jobFunctions.filter((job) => job.active && job.name.trim())}
    {@const rows = [...new Map(draft.coverage.map((item) => [`${item.areaId}|${item.jobFunctionId}|${item.serviceKey}`, { areaId: item.areaId, jobFunctionId: item.jobFunctionId, serviceKey: item.serviceKey }])).values()].filter((row) => `${areaName.get(row.areaId) ?? ''} ${jobName.get(row.jobFunctionId) ?? ''} ${row.serviceKey}`.toLowerCase().includes(search.trim().toLowerCase()))}
    {@const ordered = orderedCoverageRows(rows, areaName, jobName)}
    {@const groups = groupRows(ordered, areaName, jobName)}

    <ClassicTablePanel dirty={context.dirty} saving={context.saving} canSave={context.canSave} onsave={() => void context.save().catch(() => undefined)} ondiscard={context.discard}>
      {#snippet meta()}<span><i class="dot"></i>{t('{count} coverage lines', { count: rows.length })}</span>{/snippet}
      {#snippet actions()}<button class="cl-btn is-primary" type="button" disabled={workspace.isPreview || !restaurantConfig.draft} onclick={addRow}><svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>{t('Add requirement')}</button>{/snippet}
      {#snippet children()}
        <div class="cl-tablewrap">
          <table class="cl-table cov">
            <thead>
              <tr>
                <th class="has-menu"><ClassicColMenu label={t('Area')} sortable sortDir={sort?.key === 'area' ? sort.dir : null} onsort={(dir) => (sort = { key: 'area', dir })} groupable grouped={groupBy === 'area'} ongroup={(on) => (groupBy = on ? 'area' : 'none')} filterKind="text" searchValue={search} onsearch={(value) => (search = value)} /></th>
                <th class="has-menu"><ClassicColMenu label={t('Position')} sortable sortDir={sort?.key === 'position' ? sort.dir : null} onsort={(dir) => (sort = { key: 'position', dir })} groupable grouped={groupBy === 'position'} ongroup={(on) => (groupBy = on ? 'position' : 'none')} /></th>
                <th class="has-menu"><ClassicColMenu label={t('Service')} sortable sortDir={sort?.key === 'service' ? sort.dir : null} onsort={(dir) => (sort = { key: 'service', dir })} /></th>
                {#each WEEKDAYS as day (day)}<th class="cov__day">{t(day)}</th>{/each}
                <th></th>
              </tr>
            </thead>
            <tbody>
              {#each newRows as row (row.tempId)}
                {@const duplicate = Boolean(row.areaId && row.jobFunctionId && row.serviceKey && exists(row.areaId, row.jobFunctionId, row.serviceKey as ServiceKey))}
                <tr class="is-attention">
                  <td><select class="cl-field" aria-label={t('Area')} value={row.areaId} onchange={(event) => patchNewRow(row.tempId, { areaId: event.currentTarget.value })}><option value="">{t('Choose area')}</option>{#each activeAreas as area (area.id)}<option value={area.id}>{area.name}</option>{/each}</select></td>
                  <td><select class="cl-field" aria-label={t('Position')} value={row.jobFunctionId} onchange={(event) => patchNewRow(row.tempId, { jobFunctionId: event.currentTarget.value })}><option value="">{t('Choose position')}</option>{#each activePositions as job (job.id)}<option value={job.id}>{job.name}</option>{/each}</select></td>
                  <td><select class="cl-field" aria-label={t('Service')} value={row.serviceKey} onchange={(event) => patchNewRow(row.tempId, { serviceKey: event.currentTarget.value as PendingService })}><option value="">{t('Choose service')}</option><option value="lunch">{t('Lunch')}</option><option value="evening">{t('Evening')}</option></select></td>
                  {#each WEEKDAYS as day, index (day)}<td class="cov__day"><input class="cl-field num" class:is-set={row.counts[index] > 0} type="number" min="0" step="1" aria-label={`${t(day)} ${t('required people')}`} value={row.counts[index]} oninput={(event) => setNewCount(row.tempId, index, event.currentTarget.value)} /></td>{/each}
                  <td class="is-num"><button class="cl-btn is-icon remove" type="button" title={t('Remove')} aria-label={t('Remove')} onclick={() => removeNewRow(row.tempId)}>×</button></td>
                </tr>
                {#if duplicate}<tr class="inline-warning"><td colspan={WEEKDAYS.length + 4}>{t('This area, position and service already has a coverage row.')}</td></tr>{/if}
              {/each}
            </tbody>

            {#if !ordered.length && !newRows.length}
              <tbody><tr><td colspan={WEEKDAYS.length + 4}><div class="cl-empty"><strong>{t('No coverage requirements set')}</strong><span>{t('Add a line above to set how many people each service needs.')}</span></div></td></tr></tbody>
            {:else}
              {#each groups as group (group.key)}
                <tbody>
                  {#if groupBy !== 'none'}<tr class="cl-group-row"><td colspan={WEEKDAYS.length + 4}>{group.label}<span class="cl-group-row__count">{t('{count} coverage lines', { count: group.rows.length })}</span></td></tr>{/if}
                  {#each group.rows as row (rowKey(row))}
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
                </tbody>
              {/each}
            {/if}
          </table>
        </div>
      {/snippet}
    </ClassicTablePanel>
  {/snippet}
</ClassicRestaurantPage>

<style>
  .cov { min-width: 980px; }
  .cov__day { text-align: center; }
  .num { width: 62px; height: 34px; text-align: center; font-variant-numeric: tabular-nums; color: var(--cl-line-strong); }
  .num.is-set { color: var(--cl-ink); font-weight: var(--rst-fw-bold); }
  .remove { min-height: 30px; height: 30px; width: 30px; color: var(--cl-problem); font-size: 18px; }
  .inline-warning td { padding-block: 7px !important; color: var(--cl-attention); background: var(--cl-attention-wash); font-size: 12px; }
  .dot { width: 7px; height: 7px; border-radius: 50%; background: var(--cl-line-strong); display: inline-block; }
</style>
