<script lang="ts">
  import { WEEKDAYS, type ServiceKey } from '$lib/calendar/date';
  import { t } from '$lib/i18n/i18n.svelte';
  import { useClassicRestaurantContext } from '$lib/classic/classic-workspace-context';
  import ClassicTablePanel from '$lib/classic/ClassicTablePanel.svelte';
  import ClassicService from '$lib/classic/ClassicService.svelte';
  import ClassicColMenu from '$lib/classic/ClassicColMenu.svelte';
  import ClassicPrimaryColMenu from '$lib/classic/ClassicPrimaryColMenu.svelte';
  import ClassicGroupRow from '$lib/classic/ClassicGroupRow.svelte';
  import { restaurantConfig } from '$lib/classic/classic-restaurant.svelte';
  import type {
    CoverageDraft,
    JobFunctionDraft
  } from '$lib/restaurant/restaurant-model';
  import { workspace } from '$lib/workspace/workspace.svelte';
  import { buildAreaColorMap, buildPositionColorMap } from '$lib/ui/position-color';
  import { areaInstanceLabelMap } from '$lib/restaurant/area-instance';

  type Row = { areaId: string; jobFunctionId: string; serviceKey: ServiceKey };
  type PendingService = ServiceKey | '';
  type NewRow = { tempId: string; areaId: string; jobFunctionId: string; serviceKey: PendingService; counts: Array<number | null> };
  type CoverageGroup = {
    key: string;
    label: string;
    placementLabel: string;
    rows: Row[];
  };

  let newRows = $state<NewRow[]>([]);
  let search = $state('');
  let sort = $state<{ key: 'area' | 'position' | 'service'; dir: 'asc' | 'desc' } | null>(null);
  let groupBy = $state<'area' | 'position' | 'service' | 'none'>('area');
  let excludedArea = $state(new Set<string>());
  let excludedPosition = $state(new Set<string>());
  let excludedService = $state(new Set<string>());
  let collapsedGroups = $state<string[]>([]);

  const areaColor = $derived(buildAreaColorMap(restaurantConfig.draft?.areas ?? []));
  const areaName = $derived(
    areaInstanceLabelMap(restaurantConfig.draft?.areas ?? [])
  );
  const positionColor = $derived(
    buildPositionColorMap(
      restaurantConfig.draft?.jobFunctions ?? [],
      restaurantConfig.draft?.areas ?? []
    )
  );

  function effectivePositionAreaIds(
    position: Pick<JobFunctionDraft, 'areaIds'>,
    activeAreaIds: ReadonlySet<string>
  ): string[] {
    const linkedAreaIds = position.areaIds.filter((areaId) =>
      activeAreaIds.has(areaId)
    );
    return linkedAreaIds.length ? linkedAreaIds : [...activeAreaIds];
  }

  function positionSupportsArea(
    position: Pick<JobFunctionDraft, 'areaIds'>,
    areaId: string
  ): boolean {
    if (!areaId) return true;
    const activeAreaIds = new Set(
      (restaurantConfig.draft?.areas ?? [])
        .filter((area) => area.active)
        .map((area) => area.id)
    );
    return effectivePositionAreaIds(position, activeAreaIds).includes(areaId);
  }

  const suggestedRows = $derived.by(() => {
    const draft = restaurantConfig.draft;
    if (!draft) return [] as Row[];
    const activeAreaIds = new Set(
      draft.areas.filter((area) => area.active).map((area) => area.id)
    );
    const suggestions: Row[] = [];
    for (const position of draft.jobFunctions.filter((job) => job.active)) {
      for (const areaId of effectivePositionAreaIds(position, activeAreaIds)) {
        for (const serviceKey of ['lunch', 'evening'] as ServiceKey[]) {
          if (!exists(areaId, position.id, serviceKey)) {
            suggestions.push({ areaId, jobFunctionId: position.id, serviceKey });
          }
        }
      }
    }
    return suggestions;
  });

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
    if (!raw.trim()) {
      if (existing) {
        draft.coverage = draft.coverage.filter((item) => item.id !== existing.id);
        restaurantConfig.touch();
      }
      return;
    }
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
    newRows = [{ tempId: crypto.randomUUID(), areaId: '', jobFunctionId: '', serviceKey: '', counts: WEEKDAYS.map(() => null) }, ...newRows];
  }

  function stageSuggestions() {
    if (workspace.isPreview) return;
    const staged = new Set(
      newRows.map((row) => `${row.areaId}|${row.jobFunctionId}|${row.serviceKey}`)
    );
    const rows = suggestedRows
      .filter((row) => !staged.has(rowKey(row)))
      .map((row) => ({
        tempId: crypto.randomUUID(),
        ...row,
        counts: WEEKDAYS.map(() => null) as Array<number | null>
    }));
    newRows = [...rows, ...newRows];
  }

  function removeNewRow(tempId: string) {
    newRows = newRows.filter((row) => row.tempId !== tempId);
  }

  function patchNewRow(tempId: string, patch: Partial<NewRow>) {
    newRows = newRows.map((row) => (row.tempId === tempId ? { ...row, ...patch } : row));
    materialize(tempId);
  }

  function setNewCount(tempId: string, index: number, raw: string) {
    newRows = newRows.map((row) => row.tempId === tempId ? {
      ...row,
      counts: row.counts.map((value, itemIndex) =>
        itemIndex === index ? (raw.trim() ? normalizedCount(raw) : null) : value
      )
    } : row);
    materialize(tempId);
  }

  function materialize(tempId: string) {
    const draft = restaurantConfig.draft;
    if (!draft) return;
    const row = newRows.find((item) => item.tempId === tempId);
    if (!row || !row.areaId || !row.jobFunctionId || !row.serviceKey) return;
    if (exists(row.areaId, row.jobFunctionId, row.serviceKey)) return;
    const entries: CoverageDraft[] = row.counts.flatMap((count, index) =>
      count == null
        ? []
        : [{
            id: crypto.randomUUID(),
            areaId: row.areaId,
            jobFunctionId: row.jobFunctionId,
            serviceKey: row.serviceKey as ServiceKey,
            coverageScope: 'weekday' as const,
            weekday: index + 1,
            requiredCount: normalizedCount(count)
          }]
    );
    if (!entries.length) return;
    draft.coverage = [...entries, ...draft.coverage];
    newRows = newRows.filter((item) => item.tempId !== tempId);
    restaurantConfig.touch();
  }

  function placementAreaName(areaId: string): string {
    const area = restaurantConfig.draft?.areas.find((item) => item.id === areaId);
    return area ? areaName.get(area.id) ?? restaurantConfig.placementArea(area).name : '';
  }

  function placementPositionName(positionId: string): string {
    const position = restaurantConfig.draft?.jobFunctions.find(
      (item) => item.id === positionId
    );
    return position ? restaurantConfig.placementPosition(position).name : '';
  }

  function groupRows(rows: Row[], areaName: Map<string, string>, jobName: Map<string, string>): CoverageGroup[] {
    if (groupBy === 'none') {
      return [{ key: 'all', label: '', placementLabel: '', rows }];
    }
    const map = new Map<string, CoverageGroup>();
    for (const row of rows) {
      const key = groupBy === 'area' ? row.areaId : groupBy === 'position' ? row.jobFunctionId : row.serviceKey;
      const label = groupBy === 'area' ? areaName.get(key) ?? t('Unknown') : groupBy === 'position' ? jobName.get(key) ?? t('Unknown') : t(row.serviceKey === 'evening' ? 'Evening' : 'Lunch');
      const placementLabel =
        groupBy === 'area'
          ? placementAreaName(key) || label
          : groupBy === 'position'
            ? placementPositionName(key) || label
            : label;
      const group = map.get(key) ?? { key, label, placementLabel, rows: [] };
      group.rows.push(row);
      map.set(key, group);
    }
    return [...map.values()].sort((a, b) =>
      a.placementLabel.localeCompare(b.placementLabel)
    );
  }
  function setGroupBy(next: 'area' | 'position' | 'service' | 'none'): void {
    groupBy = next;
    collapsedGroups = [];
  }

  function toggleGroup(key: string): void {
    collapsedGroups = collapsedGroups.includes(key)
      ? collapsedGroups.filter((item) => item !== key)
      : [...collapsedGroups, key];
  }

  function toggleExcluded(set: Set<string>, value: string): Set<string> {
    const next = new Set(set);
    next.has(value) ? next.delete(value) : next.add(value);
    return next;
  }

  function orderedCoverageRows(rows: Row[]): Row[] {
    const activeSort = sort;
    if (!activeSort) return rows;
    const factor = activeSort.dir === 'desc' ? -1 : 1;
    return [...rows].sort((a, b) => {
      const left = activeSort.key === 'area'
        ? placementAreaName(a.areaId)
        : activeSort.key === 'position'
          ? placementPositionName(a.jobFunctionId)
          : a.serviceKey;
      const right = activeSort.key === 'area'
        ? placementAreaName(b.areaId)
        : activeSort.key === 'position'
          ? placementPositionName(b.jobFunctionId)
          : b.serviceKey;
      return factor * left.localeCompare(right);
    });
  }

  const readRestaurantContext = useClassicRestaurantContext();
  const context = $derived(readRestaurantContext());
</script>

<svelte:head><title>{t('Coverage')} &middot; restogogo</title></svelte:head>

{#if context}
{@const draft = context.draft}
    {@const jobName = new Map(draft.jobFunctions.map((job) => [job.id, job.name]))}
    {@const activeAreas = draft.areas.filter((area) => area.active && area.name.trim())}
    {@const activePositions = draft.jobFunctions.filter((job) => job.active && job.name.trim())}
    {@const rows = [...new Map(draft.coverage.map((item) => [`${item.areaId}|${item.jobFunctionId}|${item.serviceKey}`, { areaId: item.areaId, jobFunctionId: item.jobFunctionId, serviceKey: item.serviceKey }])).values()]
      .filter((row) => !excludedArea.has(row.areaId))
      .filter((row) => !excludedPosition.has(row.jobFunctionId))
      .filter((row) => !excludedService.has(row.serviceKey))
      .filter((row) => `${placementAreaName(row.areaId)} ${placementPositionName(row.jobFunctionId)} ${row.serviceKey}`.toLowerCase().includes(search.trim().toLowerCase()))}
    {@const ordered = orderedCoverageRows(rows)}
    {@const groups = groupRows(ordered, areaName, jobName)}
    {@const areaValues = activeAreas.map((area) => ({ value: area.id, label: areaName.get(area.id) ?? area.name }))}
    {@const positionValues = activePositions.map((job) => ({ value: job.id, label: job.name }))}
    {@const serviceValues = [{ value: 'lunch', label: t('Lunch') }, { value: 'evening', label: t('Evening') }]}

    <ClassicTablePanel dirty={context.dirty} saving={context.saving} canSave={context.canSave} onsave={() => void context.save().catch(() => undefined)} ondiscard={context.discard}>
      {#snippet meta()}<span><i class="dot"></i>{t('{count} staffing rules', { count: rows.length })}</span>{/snippet}
      {#snippet actions()}
        {#if suggestedRows.length}
          <button class="cl-btn suggestion-action" type="button" disabled={workspace.isPreview} onclick={stageSuggestions}>
            {t('Use linked positions')} <span>{suggestedRows.length}</span>
          </button>
        {/if}
        <button class="cl-btn is-primary" type="button" disabled={workspace.isPreview || !restaurantConfig.draft} onclick={addRow}><svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>{t('Add rule')}</button>
      {/snippet}
      {#snippet children()}
        <div class="cl-tablewrap">
          <table class="cl-table cov">
            <thead>
              <tr>
                <th class="has-menu"><ClassicPrimaryColMenu label={t('Area')} sortable sortDir={sort?.key === 'area' ? sort.dir : null} onsort={(dir) => (sort = { key: 'area', dir })} filterKind="values" filterValues={areaValues} selected={excludedArea} ontoggle={(value) => (excludedArea = toggleExcluded(excludedArea, value))} onselectall={(on) => (excludedArea = on ? new Set() : new Set(areaValues.map((item) => item.value)))} groupValue={groupBy} groupOptions={[{ value: 'none', label: t('No grouping') }, { value: 'area', label: t('Area') }, { value: 'position', label: t('Position') }, { value: 'service', label: t('Service') }]} ongroupchange={(value) => setGroupBy(value as 'area' | 'position' | 'service' | 'none')} /></th>
                <th class="has-menu"><ClassicColMenu label={t('Position')} sortable sortDir={sort?.key === 'position' ? sort.dir : null} onsort={(dir) => (sort = { key: 'position', dir })} filterKind="values" filterValues={positionValues} selected={excludedPosition} ontoggle={(value) => (excludedPosition = toggleExcluded(excludedPosition, value))} onselectall={(on) => (excludedPosition = on ? new Set() : new Set(positionValues.map((item) => item.value)))} /></th>
                <th class="has-menu"><ClassicColMenu label={t('Service')} sortable sortDir={sort?.key === 'service' ? sort.dir : null} onsort={(dir) => (sort = { key: 'service', dir })} filterKind="values" filterValues={serviceValues} selected={excludedService} ontoggle={(value) => (excludedService = toggleExcluded(excludedService, value))} onselectall={(on) => (excludedService = on ? new Set() : new Set(serviceValues.map((item) => item.value)))} /></th>
                {#each WEEKDAYS as day (day)}<th class="cov__day">{t(day)}</th>{/each}
                <th></th>
              </tr>
            </thead>
            <tbody>
              {#each newRows as row (row.tempId)}
                {@const duplicate = Boolean(row.areaId && row.jobFunctionId && row.serviceKey && exists(row.areaId, row.jobFunctionId, row.serviceKey as ServiceKey))}
                <tr class="is-attention">
                  <td><select class="cl-field" aria-label={t('Area')} value={row.areaId} onchange={(event) => patchNewRow(row.tempId, { areaId: event.currentTarget.value })}><option value="">{t('Choose area')}</option>{#each activeAreas as area (area.id)}<option value={area.id}>{areaName.get(area.id) ?? area.name}</option>{/each}</select></td>
                  <td><select class="cl-field" aria-label={t('Position')} value={row.jobFunctionId} onchange={(event) => patchNewRow(row.tempId, { jobFunctionId: event.currentTarget.value })}><option value="">{t('Choose position')}</option>{#each activePositions.filter((job) => positionSupportsArea(job, row.areaId)) as job (job.id)}<option value={job.id}>{job.name}</option>{/each}</select></td>
                  <td><select class="cl-field" aria-label={t('Service')} value={row.serviceKey} onchange={(event) => patchNewRow(row.tempId, { serviceKey: event.currentTarget.value as PendingService })}><option value="">{t('Choose service')}</option><option value="lunch">{t('Lunch')}</option><option value="evening">{t('Evening')}</option></select></td>
                  {#each WEEKDAYS as day, index (day)}<td class="cov__day"><input class="cl-field num" class:is-set={row.counts[index] != null} type="number" min="0" step="1" placeholder="—" aria-label={`${t(day)} ${t('required people')}`} value={row.counts[index] ?? ''} oninput={(event) => setNewCount(row.tempId, index, event.currentTarget.value)} /></td>{/each}
                  <td class="is-num"><button class="cl-btn is-icon remove" type="button" title={t('Remove')} aria-label={t('Remove')} onclick={() => removeNewRow(row.tempId)}>×</button></td>
                </tr>
                {#if duplicate}<tr class="inline-warning"><td colspan={WEEKDAYS.length + 4}>{t('This area, position and service already has a coverage row.')}</td></tr>{/if}
              {/each}
            </tbody>

            {#if !ordered.length && !newRows.length}
              <tbody><tr><td colspan={WEEKDAYS.length + 4}><div class="cl-empty"><strong>{t('No staffing rules yet')}</strong><span>{t('Start from linked areas and positions, then enter only the days that need a target.')}</span>{#if suggestedRows.length}<button class="cl-btn" type="button" onclick={stageSuggestions}>{t('Use linked positions')}</button>{/if}</div></td></tr></tbody>
            {:else}
              {#each groups as group (group.key)}
                <tbody>
                  {#if groupBy !== 'none'}<ClassicGroupRow colspan={WEEKDAYS.length + 4} label={group.label} meta={t('{count} staffing rules', { count: group.rows.length })} color={groupBy === 'area' ? areaColor.get(group.key) : groupBy === 'position' ? positionColor.get(group.key) : ''} collapsed={collapsedGroups.includes(group.key)} ontoggle={() => toggleGroup(group.key)} />{/if}
                  {#if !collapsedGroups.includes(group.key)}
                  {#each group.rows as row (rowKey(row))}
                    <tr>
                      <td><span class="cl-chip" style="--chip:{areaColor.get(row.areaId) ?? 'var(--cl-line-strong)'}"><span>{areaName.get(row.areaId) ?? '—'}</span></span></td>
                      <td><span class="cl-chip" style="--chip:{positionColor.get(row.jobFunctionId) ?? 'var(--cl-line-strong)'}"><span>{jobName.get(row.jobFunctionId) ?? '—'}</span></span></td>
                      <td><ClassicService service={row.serviceKey} /></td>
                      {#each WEEKDAYS as _day, index (index)}
                        {@const value = entry(draft, row, index + 1)}
                        <td class="cov__day"><input class="cl-field num" class:is-set={Boolean(value)} type="number" min="0" step="1" placeholder="—" value={value?.requiredCount ?? ''} disabled={workspace.isPreview} oninput={(event) => setCount(row, index + 1, event.currentTarget.value)} /></td>
                      {/each}
                      <td class="is-num"><button class="cl-btn is-icon remove" type="button" disabled={workspace.isPreview} title={t('Remove requirement')} aria-label={t('Remove requirement')} onclick={() => removeRow(row)}>×</button></td>
                    </tr>
                  {/each}
                  {/if}
                </tbody>
              {/each}
            {/if}
          </table>
        </div>
      {/snippet}
    </ClassicTablePanel>

{/if}

<style>
  .cov { min-width: 980px; }
  .cov__day { text-align: center; }
  .num { width: 62px; height: 34px; text-align: center; font-variant-numeric: tabular-nums; color: var(--cl-muted); }
  .num.is-set { color: var(--cl-ink); font-weight: var(--rst-fw-bold); }
  .num::placeholder { color: var(--cl-line-strong); }
  .remove { min-height: 30px; height: 30px; width: 30px; color: var(--cl-problem); font-size: 18px; }
  .inline-warning td { padding-block: 7px !important; color: var(--cl-attention); background: var(--cl-attention-wash); font-size: 12px; }
  .suggestion-action span { min-width: 20px; height: 20px; display: grid; place-items: center; border-radius: 999px; background: var(--cl-accent-wash); color: var(--cl-accent); font-size: 10px; font-weight: var(--rst-fw-bold); }
</style>
