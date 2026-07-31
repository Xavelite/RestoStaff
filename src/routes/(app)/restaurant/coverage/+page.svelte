<script lang="ts">
  import { serviceLabel, WEEKDAYS, type ServiceKey } from '$lib/calendar/date';
  import { t } from '$lib/i18n/i18n.svelte';
  import { useWorkspaceRestaurantContext } from '$lib/workspace-ui/workspace-context';
  import WorkspaceTablePanel from '$lib/workspace-ui/WorkspaceTablePanel.svelte';
  import WorkspaceService from '$lib/workspace-ui/WorkspaceService.svelte';
  import WorkspaceColMenu from '$lib/workspace-ui/WorkspaceColMenu.svelte';
  import WorkspacePrimaryColMenu from '$lib/workspace-ui/WorkspacePrimaryColMenu.svelte';
  import WorkspaceGroupRow from '$lib/workspace-ui/WorkspaceGroupRow.svelte';
  import WorkspacePicker from '$lib/workspace-ui/WorkspacePicker.svelte';
  import WorkspaceAreaIcon from '$lib/restaurant/WorkspaceAreaIcon.svelte';
  import WorkspaceServiceIcon from '$lib/workspace-ui/WorkspaceServiceIcon.svelte';
  import WorkspaceCard from '$lib/workspace-ui/WorkspaceCard.svelte';
  import WorkspaceCardGrid from '$lib/workspace-ui/WorkspaceCardGrid.svelte';
  import { workspaceLayout } from '$lib/workspace-ui/workspace-layout.svelte';
  import { restaurantConfig } from '$lib/workspace-ui/workspace-restaurant.svelte';
  import type {
    CoverageDraft,
    JobFunctionDraft
  } from '$lib/restaurant/restaurant-model';
  import { workspace } from '$lib/workspace/workspace.svelte';
  import { buildAreaColorMap, buildPositionColorMap } from '$lib/ui/position-color';
  import { createTableView } from '$lib/workspace-ui/table-view.svelte';
  import { areaInstanceLabelMap } from '$lib/restaurant/area-instance';

  type Row = { areaId: string; jobFunctionId: string; serviceKey: ServiceKey };
  type PendingService = ServiceKey | '';
  type NewRow = {
    tempId: string;
    areaId: string;
    jobFunctionId: string;
    serviceKey: PendingService;
    counts: Array<number | null>;
    /** Row key this pending row currently owns in the draft, '' while it owns none. */
    stagedKey: string;
  };
  type CoverageGroup = {
    key: string;
    label: string;
    placementLabel: string;
    rows: Row[];
  };

  let newRows = $state<NewRow[]>([]);
  let mobileWeekday = $state(1);
  let mobileService = $state<ServiceKey>('lunch');
  type SortKey = 'area' | 'position' | 'service';
  type GroupBy = 'area' | 'position' | 'service' | 'none';

  const view = createTableView<SortKey, GroupBy>({ defaultGroupBy: 'area' });

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
  const activeServices = $derived(
    (restaurantConfig.draft?.services ?? []).filter((service) => service.active)
  );

  function serviceName(serviceKey: ServiceKey): string {
    return (
      restaurantConfig.draft?.services.find(
        (service) => service.serviceKey === serviceKey
      )?.name ?? serviceLabel(serviceKey)
    );
  }

  $effect(() => {
    if (activeServices.length && !activeServices.some((service) => service.serviceKey === mobileService)) {
      mobileService = activeServices[0].serviceKey;
    }
  });

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
        for (const { serviceKey } of draft.services.filter((service) => service.active)) {
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

  /** An area and a position wear the same glyph here as on their own pages. */
  function areaIcon(areaId: string): string {
    return restaurantConfig.draft?.areas.find((area) => area.id === areaId)?.iconKey || '';
  }

  function positionIcon(positionId: string): string {
    const position = restaurantConfig.draft?.jobFunctions.find((job) => job.id === positionId);
    if (!position) return '';
    return areaIcon(position.areaIds[0] ?? '') || position.iconKey || '';
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
    newRows = [{ tempId: crypto.randomUUID(), areaId: '', jobFunctionId: '', serviceKey: '', counts: WEEKDAYS.map(() => null), stagedKey: '' }, ...newRows];
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
        counts: WEEKDAYS.map(() => null) as Array<number | null>,
        stagedKey: ''
    }));
    newRows = [...rows, ...newRows];
  }

  function removeNewRow(tempId: string) {
    const row = newRows.find((item) => item.tempId === tempId);
    if (row?.stagedKey) unstage(row.stagedKey);
    newRows = newRows.filter((item) => item.tempId !== tempId);
  }

  function patchNewRow(tempId: string, patch: Partial<NewRow>) {
    newRows = newRows.map((row) => (row.tempId === tempId ? { ...row, ...patch } : row));
    stagePendingRow(tempId);
  }

  function setNewCount(tempId: string, index: number, raw: string) {
    newRows = newRows.map((row) => row.tempId === tempId ? {
      ...row,
      counts: row.counts.map((value, itemIndex) =>
        itemIndex === index ? (raw.trim() ? normalizedCount(raw) : null) : value
      )
    } : row);
    stagePendingRow(tempId);
  }

  function unstage(key: string): void {
    const draft = restaurantConfig.draft;
    if (!draft) return;
    draft.coverage = draft.coverage.filter((item) => rowKey(item) !== key);
  }

  /**
   * Write a pending row into the draft while leaving it where it was added.
   * Staging in place is what keeps a half-filled row from teleporting into its
   * group mid-edit; it joins the grouped rows once the draft is saved.
   */
  function stagePendingRow(tempId: string): void {
    const draft = restaurantConfig.draft;
    const row = newRows.find((item) => item.tempId === tempId);
    if (!draft || !row) return;
    // Clear what this row staged before, so re-picking an area leaves no orphan.
    const hadStaged = Boolean(row.stagedKey);
    if (row.stagedKey) unstage(row.stagedKey);
    const complete = Boolean(row.areaId && row.jobFunctionId && row.serviceKey);
    const taken = complete && exists(row.areaId, row.jobFunctionId, row.serviceKey as ServiceKey);
    const entries: CoverageDraft[] = complete && !taken
      ? row.counts.flatMap((count, index) =>
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
        )
      : [];
    if (entries.length) draft.coverage = [...entries, ...draft.coverage];
    const stagedKey = entries.length ? `${row.areaId}|${row.jobFunctionId}|${row.serviceKey}` : '';
    newRows = newRows.map((item) => (item.tempId === tempId ? { ...item, stagedKey } : item));
    // Picking values for a row that stages nothing yet is not a change to save.
    if (hadStaged || entries.length) restaurantConfig.touch();
  }

  // A save or a discard ends the add: the rows are real now, or they are gone.
  let wasDirty = false;
  $effect(() => {
    const dirty = restaurantConfig.dirty;
    if (wasDirty && !dirty && newRows.length) newRows = [];
    wasDirty = dirty;
  });

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
    if (!view.grouping) {
      return [{ key: 'all', label: '', placementLabel: '', rows }];
    }
    const map = new Map<string, CoverageGroup>();
    for (const row of rows) {
      const key = view.groupBy === 'area' ? row.areaId : view.groupBy === 'position' ? row.jobFunctionId : row.serviceKey;
      const label = view.groupBy === 'area' ? areaName.get(key) ?? t('Unknown') : view.groupBy === 'position' ? jobName.get(key) ?? t('Unknown') : t(serviceName(row.serviceKey));
      const placementLabel =
        view.groupBy === 'area'
          ? placementAreaName(key) || label
          : view.groupBy === 'position'
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
  function orderedCoverageRows(rows: Row[]): Row[] {
    const activeSort = view.sort;
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

  const readRestaurantContext = useWorkspaceRestaurantContext();
  const context = $derived(readRestaurantContext());
</script>

<svelte:head><title>{t('Coverage')} &middot; restogogo</title></svelte:head>

{#if context}
{@const draft = context.draft}
    {@const jobName = new Map(draft.jobFunctions.map((job) => [job.id, job.name]))}
    {@const activeAreas = draft.areas.filter((area) => area.active && area.name.trim())}
    {@const activePositions = draft.jobFunctions.filter((job) => job.active && job.name.trim())}
    {@const pendingKeys = new Set(newRows.map((row) => row.stagedKey).filter(Boolean))}
    {@const rows = [...new Map(draft.coverage.map((item) => [`${item.areaId}|${item.jobFunctionId}|${item.serviceKey}`, { areaId: item.areaId, jobFunctionId: item.jobFunctionId, serviceKey: item.serviceKey }])).values()]
      .filter((row) => !pendingKeys.has(rowKey(row)))
      .filter((row) => !view.isExcluded('area', row.areaId))
      .filter((row) => !view.isExcluded('position', row.jobFunctionId))
      .filter((row) => !view.isExcluded('service', row.serviceKey))
      .filter((row) => view.matchesSearch('area', `${placementAreaName(row.areaId)} ${placementPositionName(row.jobFunctionId)} ${row.serviceKey}`))}
    {@const ordered = orderedCoverageRows(rows)}
    {@const groups = groupRows(ordered, areaName, jobName)}
    {@const areaValues = activeAreas.map((area) => ({ value: area.id, label: areaName.get(area.id) ?? area.name }))}
    {@const positionValues = activePositions.map((job) => ({ value: job.id, label: job.name }))}
    {@const serviceValues = activeServices.map((service) => ({
      value: service.serviceKey,
      label: t(service.name),
      service: service.serviceKey
    }))}

    <WorkspaceTablePanel dirty={context.dirty} saving={context.saving} canSave={context.canSave} onsave={() => void context.save().catch(() => undefined)} ondiscard={context.discard}>
      {#snippet meta()}<span><i class="dot"></i>{t('{count} staffing rules', { count: rows.length + pendingKeys.size })}</span>{/snippet}
      {#snippet actions()}
        {#if suggestedRows.length}
          <button
            class="cl-btn suggestion-action"
            type="button"
            title={t('Create service rules for linked areas and positions.')}
            disabled={workspace.isPreview}
            onclick={stageSuggestions}
          >
            {t('Add recommendations')} <span>{suggestedRows.length}</span>
          </button>
        {/if}
        <button class="cl-btn is-primary" type="button" disabled={workspace.isPreview || !restaurantConfig.draft} onclick={addRow}><svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>{t('Add rule')}</button>
      {/snippet}
      {#snippet children()}
        <div class="coverage-mobile">
          <div class="coverage-mobile__controls">
            <div class="coverage-mobile__services" aria-label={t('Service')}>
              {#each activeServices as service (service.serviceKey)}
                <button
                  class:is-active={mobileService === service.serviceKey}
                  type="button"
                  onclick={() => (mobileService = service.serviceKey)}
                >
                  <WorkspaceServiceIcon service={service.serviceKey} size={15} />
                  {t(service.name)}
                </button>
              {/each}
            </div>
            <div class="coverage-mobile__days" aria-label={t('Day')}>
              {#each WEEKDAYS as day, index (day)}
                <button
                  class:is-active={mobileWeekday === index + 1}
                  type="button"
                  aria-label={t(day)}
                  title={t(day)}
                  onclick={() => (mobileWeekday = index + 1)}
                >{t(day).slice(0, 2)}</button>
              {/each}
            </div>
          </div>

          {#each newRows as row (row.tempId)}
            {@const pendingKey = row.areaId && row.jobFunctionId && row.serviceKey ? `${row.areaId}|${row.jobFunctionId}|${row.serviceKey}` : ''}
            {@const duplicate = Boolean(pendingKey) && pendingKey !== row.stagedKey && exists(row.areaId, row.jobFunctionId, row.serviceKey as ServiceKey)}
            <article class="coverage-mobile__rule is-new">
              <div class="coverage-mobile__new-fields">
                <WorkspacePicker value={row.areaId} placeholder="Choose area" ariaLabel={t('Area')} options={activeAreas.map((area) => ({ value: area.id, label: areaName.get(area.id) ?? area.name, color: areaColor.get(area.id), icon: areaIcon(area.id) }))} onchange={(next) => patchNewRow(row.tempId, { areaId: next })} />
                <WorkspacePicker value={row.jobFunctionId} placeholder="Choose position" ariaLabel={t('Position')} options={activePositions.filter((job) => positionSupportsArea(job, row.areaId)).map((job) => ({ value: job.id, label: job.name, color: positionColor.get(job.id), icon: positionIcon(job.id) }))} onchange={(next) => patchNewRow(row.tempId, { jobFunctionId: next })} />
                <WorkspacePicker value={row.serviceKey} placeholder="Choose service" ariaLabel={t('Service')} options={serviceValues} onchange={(next) => patchNewRow(row.tempId, { serviceKey: next as PendingService })} />
              </div>
              <label class="coverage-mobile__target">
                <span>{t(WEEKDAYS[mobileWeekday - 1])}</span>
                <input class="cl-field num" class:is-set={row.counts[mobileWeekday - 1] != null} type="number" min="0" step="1" placeholder="—" aria-label={`${t(WEEKDAYS[mobileWeekday - 1])} ${t('required people')}`} value={row.counts[mobileWeekday - 1] ?? ''} oninput={(event) => setNewCount(row.tempId, mobileWeekday - 1, event.currentTarget.value)} />
              </label>
              <button class="cl-btn is-icon remove" type="button" title={t('Remove')} aria-label={t('Remove')} onclick={() => removeNewRow(row.tempId)}>×</button>
              {#if duplicate}<p class="coverage-mobile__warning">{t('This area, position and service already has a coverage row.')}</p>{/if}
            </article>
          {/each}

          {#each ordered.filter((row) => row.serviceKey === mobileService) as row (rowKey(row))}
            {@const value = entry(draft, row, mobileWeekday)}
            <article class="coverage-mobile__rule">
              <div class="coverage-mobile__identity">
                <span class="cl-chip has-glyph" style="--chip:{areaColor.get(row.areaId) ?? 'var(--cl-line-strong)'}"><span class="cl-chip__glyph"><WorkspaceAreaIcon icon={areaIcon(row.areaId)} color="currentColor" size={13} compact /></span><span>{areaName.get(row.areaId) ?? '—'}</span></span>
                <span class="cl-chip has-glyph" style="--chip:{positionColor.get(row.jobFunctionId) ?? 'var(--cl-line-strong)'}"><span class="cl-chip__glyph"><WorkspaceAreaIcon icon={positionIcon(row.jobFunctionId)} color="currentColor" size={13} compact /></span><span>{jobName.get(row.jobFunctionId) ?? '—'}</span></span>
              </div>
              <label class="coverage-mobile__target">
                <span>{t(WEEKDAYS[mobileWeekday - 1])}</span>
                <input class="cl-field num" class:is-set={Boolean(value)} type="number" min="0" step="1" placeholder="—" value={value?.requiredCount ?? ''} disabled={workspace.isPreview} aria-label={`${t(WEEKDAYS[mobileWeekday - 1])} ${t('required people')}`} oninput={(event) => setCount(row, mobileWeekday, event.currentTarget.value)} />
              </label>
              <button class="cl-btn is-icon remove" type="button" disabled={workspace.isPreview} title={t('Remove requirement')} aria-label={t('Remove requirement')} onclick={() => removeRow(row)}>×</button>
            </article>
          {:else}
            {#if !newRows.length}
              <div class="cl-empty coverage-mobile__empty">
                <strong>{t('No staffing rules for this service')}</strong>
                <span>{t('Add a rule or create the recommended set from your linked areas and positions.')}</span>
              </div>
            {/if}
          {/each}
        </div>

        {#if workspaceLayout.cards}
          <!-- One rule per card with its whole week on show. The matrix compares
               weekdays down a column; this compares them across a single rule,
               which is the unit a manager actually edits. -->
          <div class="coverage-desktop">
            <WorkspaceCardGrid>
              {#each groups as group (group.key)}
                {#each group.rows as row (rowKey(row))}
                  <WorkspaceCard
                    accent={areaColor.get(row.areaId) ?? null}
                    title={areaName.get(row.areaId) ?? '—'}
                    subtitle={`${jobName.get(row.jobFunctionId) ?? '—'} · ${serviceName(row.serviceKey)}`}
                  >
                    {#snippet media()}
                      <WorkspaceAreaIcon icon={areaIcon(row.areaId)} color={areaColor.get(row.areaId)} size={17} compact />
                    {/snippet}
                    {#snippet children()}
                      <div class="cov-strip">
                        {#each WEEKDAYS as day, index (index)}
                          {@const value = entry(draft, row, index + 1)}
                          <label class="cov-strip__day" class:is-set={Boolean(value)}>
                            <span>{t(day).slice(0, 3)}</span>
                            <input
                              type="number"
                              min="0"
                              step="1"
                              placeholder="—"
                              value={value?.requiredCount ?? ''}
                              disabled={workspace.isPreview}
                              aria-label={`${t(day)} ${t('required people')}`}
                              oninput={(event) => setCount(row, index + 1, event.currentTarget.value)}
                            />
                          </label>
                        {/each}
                      </div>
                    {/snippet}
                  </WorkspaceCard>
                {/each}
              {/each}
            </WorkspaceCardGrid>
          </div>
        {:else}
        <div class="cl-tablewrap coverage-desktop">
          <table class="cl-table cov">
            <thead>
              <tr>
                <th class="has-menu"><WorkspacePrimaryColMenu label={t('Area')} sortable sortDir={view.sortDir('area')} onsort={(dir) => view.setSort('area', dir)} filterKind="values" filterValues={areaValues} selected={view.excluded('area')} ontoggle={(value) => view.toggleValue('area', value)} onselectall={(on) => view.selectAll('area', on, areaValues)} groupValue={view.groupBy} groupOptions={[{ value: 'none', label: t('No grouping') }, { value: 'area', label: t('Area') }, { value: 'position', label: t('Position') }, { value: 'service', label: t('Service') }]} ongroupchange={(value) => view.setGroupBy(value as GroupBy)} /></th>
                <th class="has-menu"><WorkspaceColMenu label={t('Position')} sortable sortDir={view.sortDir('position')} onsort={(dir) => view.setSort('position', dir)} filterKind="values" filterValues={positionValues} selected={view.excluded('position')} ontoggle={(value) => view.toggleValue('position', value)} onselectall={(on) => view.selectAll('position', on, positionValues)} /></th>
                <th class="has-menu"><WorkspaceColMenu label={t('Service')} sortable sortDir={view.sortDir('service')} onsort={(dir) => view.setSort('service', dir)} filterKind="values" filterValues={serviceValues} selected={view.excluded('service')} ontoggle={(value) => view.toggleValue('service', value)} onselectall={(on) => view.selectAll('service', on, serviceValues)} /></th>
                {#each WEEKDAYS as day (day)}<th class="cov__day">{t(day)}</th>{/each}
                <th></th>
              </tr>
            </thead>
            <tbody>
              {#each newRows as row (row.tempId)}
                {@const pendingKey = row.areaId && row.jobFunctionId && row.serviceKey ? `${row.areaId}|${row.jobFunctionId}|${row.serviceKey}` : ''}
                {@const duplicate = Boolean(pendingKey) && pendingKey !== row.stagedKey && exists(row.areaId, row.jobFunctionId, row.serviceKey as ServiceKey)}
                <tr class="is-new">
                  <td><WorkspacePicker value={row.areaId} placeholder="Choose area" ariaLabel={t('Area')} options={activeAreas.map((area) => ({ value: area.id, label: areaName.get(area.id) ?? area.name, color: areaColor.get(area.id), icon: areaIcon(area.id) }))} onchange={(next) => patchNewRow(row.tempId, { areaId: next })} /></td>
                  <td><WorkspacePicker value={row.jobFunctionId} placeholder="Choose position" ariaLabel={t('Position')} options={activePositions.filter((job) => positionSupportsArea(job, row.areaId)).map((job) => ({ value: job.id, label: job.name, color: positionColor.get(job.id), icon: positionIcon(job.id) }))} onchange={(next) => patchNewRow(row.tempId, { jobFunctionId: next })} /></td>
                  <td><WorkspacePicker value={row.serviceKey} placeholder="Choose service" ariaLabel={t('Service')} options={serviceValues} onchange={(next) => patchNewRow(row.tempId, { serviceKey: next as PendingService })} /></td>
                  {#each WEEKDAYS as day, index (day)}<td class="cov__day"><input class="cl-field num" class:is-set={row.counts[index] != null} type="number" min="0" step="1" placeholder="—" aria-label={`${t(day)} ${t('required people')}`} value={row.counts[index] ?? ''} oninput={(event) => setNewCount(row.tempId, index, event.currentTarget.value)} /></td>{/each}
                  <td class="is-num"><button class="cl-btn is-icon remove" type="button" title={t('Remove')} aria-label={t('Remove')} onclick={() => removeNewRow(row.tempId)}>×</button></td>
                </tr>
                {#if duplicate}<tr class="inline-warning"><td colspan={WEEKDAYS.length + 4}>{t('This area, position and service already has a coverage row.')}</td></tr>{/if}
              {/each}
            </tbody>

            {#if !ordered.length && !newRows.length}
              <tbody><tr><td colspan={WEEKDAYS.length + 4}><div class="cl-empty"><strong>{t('No staffing rules yet')}</strong><span>{t('Start from linked areas and positions, then enter only the days that need a target.')}</span>{#if suggestedRows.length}<button class="cl-btn suggestion-action" type="button" onclick={stageSuggestions}>{t('Add recommendations')} <span>{suggestedRows.length}</span></button>{/if}</div></td></tr></tbody>
            {:else}
              {#each groups as group (group.key)}
                <tbody>
                  {#if view.grouping}
                    {@const groupColor = view.groupBy === 'area' ? areaColor.get(group.key) : view.groupBy === 'position' ? positionColor.get(group.key) : ''}
                    {#snippet groupGlyph()}
                      {#if view.groupBy === 'service'}
                        <span class="group-service is-{group.key}"><WorkspaceServiceIcon service={group.key} size={14} /></span>
                      {:else}
                        <WorkspaceAreaIcon icon={view.groupBy === 'area' ? areaIcon(group.key) : positionIcon(group.key)} color={groupColor} size={14} compact />
                      {/if}
                    {/snippet}
                    <WorkspaceGroupRow colspan={WEEKDAYS.length + 4} label={group.label} meta={t('{count} staffing rules', { count: group.rows.length })} color={groupColor} icon={groupGlyph} collapsed={view.isCollapsed(group.key)} ontoggle={() => view.toggleGroup(group.key)} />
                  {/if}
                  {#if !view.isCollapsed(group.key)}
                  {#each group.rows as row (rowKey(row))}
                    <tr>
                      <td><span class="cl-chip has-glyph" style="--chip:{areaColor.get(row.areaId) ?? 'var(--cl-line-strong)'}"><span class="cl-chip__glyph"><WorkspaceAreaIcon icon={areaIcon(row.areaId)} color="currentColor" size={13} compact /></span><span>{areaName.get(row.areaId) ?? '—'}</span></span></td>
                      <td><span class="cl-chip has-glyph" style="--chip:{positionColor.get(row.jobFunctionId) ?? 'var(--cl-line-strong)'}"><span class="cl-chip__glyph"><WorkspaceAreaIcon icon={positionIcon(row.jobFunctionId)} color="currentColor" size={13} compact /></span><span>{jobName.get(row.jobFunctionId) ?? '—'}</span></span></td>
                      <td><WorkspaceService service={row.serviceKey} label={serviceName(row.serviceKey)} /></td>
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
        {/if}
      {/snippet}
    </WorkspaceTablePanel>

{/if}

<style>
  /* The week as one strip: seven equal days, so an uneven rule shows its shape
     at a glance and a set day reads as filled rather than merely typed in. */
  .cov-strip {
    display: grid;
    grid-template-columns: repeat(7, minmax(0, 1fr));
    gap: 4px;
    width: 100%;
  }

  .cov-strip__day { display: grid; gap: 3px; justify-items: center; min-width: 0; }

  .cov-strip__day > span {
    color: var(--rst-ui-muted);
    font-size: var(--rst-fs-micro);
    font-weight: var(--rst-fw-bold);
    letter-spacing: .03em;
    text-transform: uppercase;
  }

  .cov-strip__day input {
    width: 100%;
    min-width: 0;
    height: 30px;
    padding: 2px;
    border: 1px solid var(--rst-ui-line);
    border-radius: 7px;
    color: var(--rst-ui-muted);
    background: var(--rst-ui-surface-field);
    font: inherit;
    font-size: var(--rst-fs-control);
    font-variant-numeric: tabular-nums;
    text-align: center;
    -moz-appearance: textfield;
    appearance: textfield;
  }

  .cov-strip__day input::-webkit-outer-spin-button,
  .cov-strip__day input::-webkit-inner-spin-button { margin: 0; -webkit-appearance: none; }

  .cov-strip__day.is-set input {
    border-color: color-mix(in srgb, var(--cl-accent) 42%, var(--rst-ui-line));
    color: var(--rst-ui-text);
    background: var(--rst-ui-action-soft);
    font-weight: var(--rst-fw-bold);
  }

  .cov-strip__day input:focus {
    border-color: var(--cl-accent);
    outline: none;
  }

  .cov { min-width: 980px; }
  .cov__day { text-align: center; }
  .num { width: 62px; height: 34px; text-align: center; font-variant-numeric: tabular-nums; color: var(--cl-muted); }
  .num.is-set { color: var(--cl-ink); font-weight: var(--rst-fw-bold); }
  .num::placeholder { color: var(--cl-line-strong); }
  .remove { min-height: 30px; height: 30px; width: 30px; color: var(--cl-problem); font-size: var(--rst-fs-title); }
  .inline-warning td { padding-block: 7px !important; color: var(--cl-attention); background: var(--cl-attention-wash); font-size: var(--rst-fs-control); }
  .group-service { display: inline-flex; }
  .group-service.is-lunch { color: var(--cl-lunch); }
  .group-service.is-evening { color: var(--cl-evening); }
  .suggestion-action span { min-width: 21px; height: 21px; display: grid; place-items: center; padding-inline: 4px; border: 1px solid color-mix(in srgb, var(--cl-accent) 25%, var(--cl-line)); border-radius: 5px; background: var(--cl-accent-wash); color: var(--cl-accent); font-size: var(--rst-fs-caption); font-weight: var(--rst-fw-bold); }
  .coverage-mobile { display: none; }
  @media (max-width: 760px) {
    .coverage-desktop { display: none; }
    .coverage-mobile { display: grid; gap: 9px; }
    .coverage-mobile__controls {
      position: sticky;
      top: 0;
      z-index: 8;
      display: grid;
      gap: 8px;
      padding: 8px 0 10px;
      background: var(--cl-canvas);
    }
    .coverage-mobile__services,
    .coverage-mobile__days {
      display: grid;
      padding: 3px;
      border: 1px solid var(--cl-line);
      border-radius: 7px;
      background: var(--cl-surface);
    }
    .coverage-mobile__services { grid-template-columns: repeat(auto-fit, minmax(96px, 1fr)); }
    .coverage-mobile__days { grid-template-columns: repeat(7, minmax(0, 1fr)); }
    .coverage-mobile__services button,
    .coverage-mobile__days button {
      min-width: 0;
      min-height: 34px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
      padding: 4px;
      border: 0;
      border-radius: 5px;
      background: transparent;
      color: var(--cl-muted);
      font: inherit;
      font-size: var(--rst-fs-label);
      font-weight: var(--rst-fw-medium);
      cursor: pointer;
    }
    .coverage-mobile__services button.is-active,
    .coverage-mobile__days button.is-active {
      background: var(--cl-accent-wash);
      color: var(--cl-accent);
      font-weight: var(--rst-fw-bold);
    }
    .coverage-mobile__rule {
      min-width: 0;
      display: grid;
      grid-template-columns: minmax(0, 1fr) 74px 32px;
      align-items: center;
      gap: 9px;
      padding: 10px;
      border: 1px solid var(--cl-line);
      border-radius: var(--cl-radius-surface);
      background: var(--cl-surface);
    }
    .coverage-mobile__rule.is-new {
      border-color: var(--cl-accent-line);
      box-shadow: inset 3px 0 0 var(--cl-accent);
    }
    .coverage-mobile__identity { min-width: 0; display: flex; flex-wrap: wrap; gap: 5px; }
    .coverage-mobile__new-fields { min-width: 0; display: grid; gap: 6px; }
    .coverage-mobile__target { display: grid; justify-items: center; gap: 3px; }
    .coverage-mobile__target > span {
      color: var(--cl-muted);
      font-size: var(--rst-fs-micro);
      font-weight: var(--rst-fw-bold);
      text-transform: uppercase;
    }
    .coverage-mobile__target .num { width: 62px; }
    .coverage-mobile__warning {
      grid-column: 1 / -1;
      margin: 0;
      color: var(--cl-attention);
      font-size: var(--rst-fs-label);
    }
    .coverage-mobile__empty { border: 1px solid var(--cl-line); border-radius: var(--cl-radius-surface); }
  }
</style>
