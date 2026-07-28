<script lang="ts">
  import { onMount, tick } from 'svelte';
  import { t } from '$lib/i18n/i18n.svelte';
  import { buildAreaColorMap, buildPositionColorMap } from '$lib/ui/position-color';
  import { workspace } from '$lib/workspace/workspace.svelte';
  import { useClassicRestaurantContext } from '$lib/classic/classic-workspace-context';
  import ClassicTablePanel from '$lib/classic/ClassicTablePanel.svelte';
  import ClassicColMenu from '$lib/classic/ClassicColMenu.svelte';
  import ClassicPrimaryColMenu from '$lib/classic/ClassicPrimaryColMenu.svelte';
  import ClassicGroupRow from '$lib/classic/ClassicGroupRow.svelte';
  import ClassicColChooser from '$lib/classic/ClassicColChooser.svelte';
  import ClassicRowMenu from '$lib/classic/ClassicRowMenu.svelte';
  import ClassicCellBadge from '$lib/classic/ClassicCellBadge.svelte';
  import WorkspaceAreaIcon from '$lib/restaurant/WorkspaceAreaIcon.svelte';
  import PositionLinkedAreasField, {
    type PositionLinkedAreaOption
  } from '$lib/restaurant/PositionLinkedAreasField.svelte';
  import WorkspaceCataloguePicker, {
    type WorkspaceCataloguePickerItem
  } from '$lib/restaurant/WorkspaceCataloguePicker.svelte';
  import {
    WORKSPACE_POSITION_CATALOGUE,
    workspacePositionByKey
  } from '$lib/restaurant/workspace-catalogue';
  import { areaInstanceLabelMap } from '$lib/restaurant/area-instance';
  import { restaurantConfig } from '$lib/classic/classic-restaurant.svelte';
  import { createTableView } from '$lib/classic/table-view.svelte';

  type SortKey = 'name' | 'areas' | 'cost' | 'employees' | 'active';
  type GroupBy = 'area' | 'status' | 'staffing' | 'none';
  type PositionRow = {
    id: string;
    name: string;
    code: string;
    estimatedHourlyCost: number;
    active: boolean;
    areaIds: string[];
    catalogueKey: string;
    iconKey: string;
  };
  type PositionGroup = {
    key: string;
    label: string;
    placementLabel: string;
    color: string;
    rows: PositionRow[];
  };

  $effect(() => {
    if (workspace.activeId && ['owner', 'manager'].includes(workspace.effectiveRole ?? '')) {
      void workspace.loadTeam().catch(() => undefined);
    }
  });

  const employeesByPosition = $derived.by(() => {
    const map = new Map<string, Set<string>>();
    for (const link of workspace.team?.employee_job_functions ?? []) {
      if (link.active === false) continue;
      const employees = map.get(link.job_function_id) ?? new Set<string>();
      employees.add(link.employee_id);
      map.set(link.job_function_id, employees);
    }
    return map;
  });
  const positionColor = $derived(
    buildPositionColorMap(
      restaurantConfig.draft?.jobFunctions ?? [],
      restaurantConfig.draft?.areas ?? []
    )
  );
  const areaColor = $derived(buildAreaColorMap(restaurantConfig.draft?.areas ?? []));
  const areaName = $derived(
    areaInstanceLabelMap(restaurantConfig.draft?.areas ?? [])
  );

  let dragId = $state('');

  const OPTIONAL_COLUMNS = [
    { key: 'cost', label: 'Estimated hourly cost' },
    { key: 'employees', label: 'Employees' },
    { key: 'active', label: 'Status' }
  ] as const;
  const view = createTableView<SortKey, GroupBy>({
    storageKey: 'rst-restaurant-positions-cols-v3',
    columns: OPTIONAL_COLUMNS,
    defaultHidden: ['cost']
  });

  onMount(view.restore);

  /** Cost is a financial detail, so the column exists only for those who may see it. */
  const shown = (key: string) =>
    (key !== 'cost' || workspace.canViewFinancials) && view.shown(key);
  const chooserColumns = $derived(
    view.columns.filter((column) => column.key !== 'cost' || workspace.canViewFinancials)
  );
  const colCount = $derived(4 + OPTIONAL_COLUMNS.filter((column) => shown(column.key)).length);
  const persistedPositionIds = $derived(new Set((workspace.restaurant?.job_functions ?? []).map((position) => position.id)));
  const linkedAreaOptions = $derived(
    (restaurantConfig.draft?.areas ?? [])
      .filter((area) => area.active)
      .map(
        (area): PositionLinkedAreaOption => ({
          id: area.id,
          name: areaName.get(area.id) ?? area.name,
          color: area.color,
          iconKey: area.iconKey
        })
      )
  );

  async function addPosition() {
    const draft = restaurantConfig.draft;
    if (!draft) return;
    const id = crypto.randomUUID();
    const position: PositionRow = {
      id,
      name: '',
      code: '',
      active: true,
      estimatedHourlyCost: 0,
      areaIds: [],
      catalogueKey: '',
      iconKey: ''
    };
    draft.jobFunctions = [position, ...draft.jobFunctions];
    restaurantConfig.placementPosition(position);
    restaurantConfig.touch();
    view.expandAll();
    await tick();
    // Put the cursor in the new row without opening the catalogue over it —
    // the same welcome every grid gives a freshly added row.
    document.getElementById(`position-catalogue-${id}`)?.focus();
  }

  function positionCategoryIcon(category: string): string {
    if (category === 'bar') return 'bar';
    if (category === 'kitchen') return 'kitchen';
    if (category === 'takeaway') return 'takeaway';
    if (category === 'management') return 'office';
    if (category === 'service') return 'dining';
    return 'support';
  }

  function positionCategoryColor(category: string): string {
    if (category === 'bar') return '#2563eb';
    if (category === 'kitchen') return '#ef4444';
    if (category === 'takeaway') return '#f59e0b';
    if (category === 'management') return '#6366f1';
    if (category === 'service') return '#f97316';
    return '#64748b';
  }

  function positionCategoryLabel(category: string): string {
    if (category === 'management') return t('Management');
    if (category === 'service') return t('Service');
    if (category === 'bar') return t('Bar');
    if (category === 'kitchen') return t('Kitchen');
    if (category === 'takeaway') return t('Takeaway');
    return t('Support');
  }

  function positionCatalogueItems(position: PositionRow): WorkspaceCataloguePickerItem[] {
    const draft = restaurantConfig.draft;
    const areaKeys = new Set(
      (draft?.areas ?? [])
        .filter((area) => area.active)
        .map((area) => area.catalogueKey)
        .filter(Boolean)
    );
    const existingByKey = new Map(
      (draft?.jobFunctions ?? [])
        .filter((candidate) => candidate.id !== position.id && candidate.catalogueKey)
        .map((candidate) => [candidate.catalogueKey, candidate])
    );
    return WORKSPACE_POSITION_CATALOGUE.map((item) => {
      const existing = existingByKey.get(item.key);
      const areaMatch =
        item.areaKeys.length === 0 ||
        item.areaKeys.some((areaKey) => areaKeys.has(areaKey));
      return {
        key: item.key,
        label: t(item.label),
        category: positionCategoryLabel(item.category),
        icon: positionCategoryIcon(item.category),
        color: positionCategoryColor(item.category),
        recommended: item.starter && areaMatch,
        disabled: Boolean(existing),
        disabledReason: existing
          ? existing.active
            ? t('Already added')
            : t('Already added · archived')
          : undefined
      };
    });
  }

  function selectPositionCatalogue(
    position: PositionRow,
    item: WorkspaceCataloguePickerItem
  ): void {
    const match = WORKSPACE_POSITION_CATALOGUE.find((candidate) => candidate.key === item.key);
    if (!match || !restaurantConfig.draft) return;
    const areaIds = match.areaKeys.length
      ? restaurantConfig.draft.areas
          .filter((area) => {
            if (!area.active) return false;
            return (
              Boolean(area.catalogueKey) &&
              match.areaKeys.some((areaKey) => areaKey === area.catalogueKey)
            );
          })
          .map((area) => area.id)
      : [];
    position.name = t(match.label);
    position.catalogueKey = match.key;
    position.iconKey = positionCategoryIcon(match.category);
    position.areaIds = areaIds;
    restaurantConfig.touch();
  }

  function makePositionCustom(position: PositionRow, value: string): void {
    position.name = value;
    position.catalogueKey = '';
    position.iconKey = '';
    restaurantConfig.touch();
  }

  function typePositionName(position: PositionRow, value: string): void {
    const catalogueLabel = workspacePositionByKey.get(position.catalogueKey)?.label ?? '';
    if (
      position.catalogueKey &&
      value.trim().toLocaleLowerCase() !==
        t(catalogueLabel).trim().toLocaleLowerCase()
    ) {
      position.catalogueKey = '';
      position.iconKey = '';
    }
    restaurantConfig.touch();
  }

  function positionAreaIcon(position: PositionRow): string {
    const areaId = position.areaIds[0] || '';
    return (
      restaurantConfig.draft?.areas.find((area) => area.id === areaId)?.iconKey ||
      position.iconKey ||
      'support'
    );
  }

  function systemPosition(position: PositionRow) {
    return workspacePositionByKey.get(position.catalogueKey) ?? null;
  }

  function recommendedPositionAreaIds(position: PositionRow): string[] {
    const areas = restaurantConfig.draft?.areas.filter((area) => area.active) ?? [];
    const system = systemPosition(position);
    if (!system) return [];
    if (!system.areaKeys.length) return areas.map((area) => area.id);
    return areas.filter(
      (area) =>
        Boolean(area.catalogueKey) &&
        system.areaKeys.includes(area.catalogueKey)
    ).map((area) => area.id);
  }

  function setPositionAreas(position: PositionRow, areaIds: string[]) {
    if (workspace.isPreview) return;
    const selected = new Set(areaIds);
    position.areaIds = linkedAreaOptions
      .filter((area) => selected.has(area.id))
      .map((area) => area.id);
    restaurantConfig.touch();
  }

  function linkedPositionAreaIds(position: PositionRow): string[] {
    const selected = new Set(position.areaIds);
    return linkedAreaOptions
      .filter((area) => selected.has(area.id))
      .map((area) => area.id);
  }

  function linkedAreaSetLabel(areaIds: string[]): string {
    if (!areaIds.length) return t('All areas');
    const labels = areaIds.map((areaId) => areaName.get(areaId) ?? t('Unknown'));
    if (labels.length <= 2) return labels.join(', ');
    return `${labels.slice(0, 2).join(', ')} +${labels.length - 2}`;
  }

  function removeOrTogglePosition(positionId: string) {
    const draft = restaurantConfig.draft;
    if (!draft || workspace.isPreview) return;
    const position = draft.jobFunctions.find((item) => item.id === positionId);
    if (!position) return;
    if (persistedPositionIds.has(positionId)) {
      position.active = !position.active;
    } else {
      draft.jobFunctions = draft.jobFunctions.filter((item) => item.id !== positionId);
      draft.coverage = draft.coverage.filter((item) => item.jobFunctionId !== positionId);
      restaurantConfig.removePositionPlacement(positionId);
    }
    restaurantConfig.touch();
  }

  function movePosition(targetId: string) {
    const draft = restaurantConfig.draft;
    if (!draft || !dragId || dragId === targetId || view.sort || view.grouping) return;
    const from = draft.jobFunctions.findIndex((item) => item.id === dragId);
    const to = draft.jobFunctions.findIndex((item) => item.id === targetId);
    if (from < 0 || to < 0) return;
    const next = [...draft.jobFunctions];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    draft.jobFunctions = next;
    dragId = '';
    restaurantConfig.touch();
  }

  function matches(position: PositionRow) {
    if (!persistedPositionIds.has(position.id)) return true;
    const stable = placementForPosition(position);
    const headcount = employeesByPosition.get(position.id)?.size ?? 0;
    if (view.isExcluded('active', stable.active ? 'active' : 'archived')) return false;
    if (!view.matchesSearch('areas', linkedAreaSetLabel(linkedPositionAreaIds(stable)))) return false;
    if (!view.matchesSearch('cost', `${stable.estimatedHourlyCost}`)) return false;
    if (!view.matchesSearch('employees', `${headcount}`)) return false;
    return view.matchesSearch('name', stable.name);
  }

  function placementForPosition(position: PositionRow): PositionRow {
    return restaurantConfig.placementPosition(position);
  }

  function sortValue(position: PositionRow, key: SortKey): string | number {
    const stable = placementForPosition(position);
    switch (key) {
      case 'areas': return linkedAreaSetLabel(linkedPositionAreaIds(stable)).toLowerCase();
      case 'cost': return stable.estimatedHourlyCost;
      case 'employees': return employeesByPosition.get(position.id)?.size ?? 0;
      case 'active': return stable.active ? '0' : '1';
      default: return stable.name.toLowerCase();
    }
  }

  function orderedPositions(rows: PositionRow[]): PositionRow[] {
    return view.ordered(rows, sortValue);
  }

  async function savePositions(save: () => Promise<void>): Promise<void> {
    await save();
  }

  function discardPositions(discard: () => void): void {
    discard();
  }

  function groupedPositions(rows: PositionRow[]): PositionGroup[] {
    if (!view.grouping) {
      return [{ key: 'all', label: '', placementLabel: '', color: '', rows }];
    }
    const groups = new Map<string, PositionGroup>();
    for (const position of rows) {
      const stable = placementForPosition(position);
      const headcount = employeesByPosition.get(position.id)?.size ?? 0;
      const linkedAreaIds = linkedPositionAreaIds(stable);
      const linkedAreaLabel = linkedAreaSetLabel(linkedAreaIds);
      const key = view.groupBy === 'area'
        ? linkedAreaIds.length
          ? `areas:${linkedAreaIds.join(':')}`
          : 'all-areas'
        : view.groupBy === 'status'
          ? (stable.active ? 'active' : 'archived')
          : (headcount ? 'staffed' : 'unstaffed');
      const label = view.groupBy === 'area'
        ? linkedAreaLabel
        : view.groupBy === 'status'
          ? t(stable.active ? 'Active' : 'Archived')
          : t(headcount ? 'Staffed' : 'No staff assigned');
      const placementLabel =
        view.groupBy === 'area'
          ? linkedAreaIds
              .map((areaId) => {
                const area = context.draft.areas.find((candidate) => candidate.id === areaId);
                return area
                  ? areaName.get(area.id) ?? restaurantConfig.placementArea(area).name
                  : t('Unknown');
              })
              .join('|')
          : label;
      const color =
        view.groupBy === 'area' && linkedAreaIds.length === 1
          ? areaColor.get(linkedAreaIds[0]) ?? ''
          : '';
      const group = groups.get(key) ?? { key, label, placementLabel, color, rows: [] };
      group.rows.push(position);
      groups.set(key, group);
    }
    return [...groups.values()].sort((left, right) =>
      left.placementLabel.localeCompare(right.placementLabel)
    );
  }

  const readRestaurantContext = useClassicRestaurantContext();
  const context = $derived(readRestaurantContext());
</script>

<svelte:head><title>{t('Positions')} &middot; restogogo</title></svelte:head>

{#if context}
  {@const draft = context.draft}
  {@const rows = [...draft.jobFunctions].filter(matches)}
  {@const ordered = orderedPositions(rows)}
  {@const groups = groupedPositions(ordered)}
  {@const statusValues = [{ value: 'active', label: t('Active') }, { value: 'archived', label: t('Archived') }]}

  <ClassicTablePanel
    dirty={context.dirty}
    saving={context.saving}
    canSave={context.canSave && rows.every((position) => position.name.trim())}
    onsave={() => void savePositions(context.save).catch(() => undefined)}
    ondiscard={() => discardPositions(context.discard)}
  >
    {#snippet meta()}
      <span><i class="dot"></i>{t('{count} positions', { count: rows.length })}</span>
      <span><i class="dot is-green"></i>{t('{count} active', { count: rows.filter((position) => placementForPosition(position).active).length })}</span>
    {/snippet}
    {#snippet actions()}
      <button class="cl-btn is-primary" type="button" disabled={workspace.isPreview || !restaurantConfig.draft} onclick={() => void addPosition()}><svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>{t('Add position')}</button>
    {/snippet}
    {#snippet children()}
      <div class="cl-tablewrap">
        <table class="cl-table">
          <thead>
            <tr>
              <th class="cl-grip"><span class="sr-only">{t('Reorder')}</span></th>
              <th class="has-menu">
                <ClassicPrimaryColMenu
                  label={t('Name')}
                  sortable
                  sortDir={view.sortDir('name')}
                  onsort={(dir) => view.setSort('name', dir)}
                  filterKind="text"
                  searchValue={view.search('name')}
                  onsearch={(value) => view.setSearch('name', value)}
                  groupValue={view.groupBy}
                  groupOptions={[
                    { value: 'none', label: t('No grouping') },
                    { value: 'area', label: t('Linked areas') },
                    { value: 'status', label: t('Status') },
                    { value: 'staffing', label: t('Staffing') }
                  ]}
                  ongroupchange={(value) => view.setGroupBy(value as GroupBy)}
                />
              </th>
              <th class="has-menu">
                <ClassicColMenu
                  label={t('Linked areas')}
                  sortable
                  sortDir={view.sortDir('areas')}
                  onsort={(dir) => view.setSort('areas', dir)}
                  filterKind="text"
                  searchValue={view.search('areas')}
                  onsearch={(value) => view.setSearch('areas', value)}
                />
              </th>
              {#if shown('cost')}<th class="has-menu"><ClassicColMenu label={t('Estimated hourly cost')} sortable sortDir={view.sortDir('cost')} onsort={(dir) => view.setSort('cost', dir)} filterKind="text" searchValue={view.search('cost')} onsearch={(value) => view.setSearch('cost', value)} /></th>{/if}
              {#if shown('employees')}<th class="has-menu"><ClassicColMenu label={t('Employees')} sortable sortDir={view.sortDir('employees')} onsort={(dir) => view.setSort('employees', dir)} filterKind="text" searchValue={view.search('employees')} onsearch={(value) => view.setSearch('employees', value)} /></th>{/if}
              {#if shown('active')}<th class="has-menu"><ClassicColMenu label={t('Status')} sortable sortDir={view.sortDir('active')} onsort={(dir) => view.setSort('active', dir)} filterKind="values" filterValues={statusValues} selected={view.excluded('active')} ontoggle={(value) => view.toggleValue('active', value)} onselectall={(on) => view.selectAll('active', on, statusValues)} /></th>{/if}
              <th class="chooser-col"><ClassicColChooser columns={chooserColumns} hidden={view.hidden} ontoggle={view.toggleColumn} /></th>
            </tr>
          </thead>
          {#if !ordered.length}
            <tbody><tr><td colspan={colCount}><div class="cl-empty"><strong>{t('No positions yet')}</strong><span>{t('Add the jobs people do on a shift, such as Server, Cook or Bartender.')}</span></div></td></tr></tbody>
          {:else}
            {#each groups as group (group.key)}
              <tbody>
                {#if view.grouping}<ClassicGroupRow colspan={colCount} label={group.label} meta={t('{count} positions', { count: group.rows.length })} color={group.color} collapsed={view.isCollapsed(group.key)} ontoggle={() => view.toggleGroup(group.key)} />{/if}
                {#if !view.isCollapsed(group.key)}
                  {#each group.rows as position (position.id)}
                    {@const headcount = employeesByPosition.get(position.id)?.size ?? 0}
                    {@const reorderable = !view.sort && !view.grouping}
                    <tr class:is-new={!persistedPositionIds.has(position.id)} draggable={reorderable && !workspace.isPreview} ondragstart={() => (dragId = position.id)} ondragend={() => (dragId = '')} ondragover={(event) => { if (reorderable) event.preventDefault(); }} ondrop={() => movePosition(position.id)}>
                      <td class="cl-grip"><button type="button" disabled={!reorderable || workspace.isPreview} title={reorderable ? t('Drag to reorder') : t('Clear grouping and sorting to reorder')} aria-label={t('Drag to reorder')}>⋮⋮</button></td>
                      <td>
                        <div class="position-identity" data-position-name={position.id}>
                          <WorkspaceAreaIcon
                            icon={positionAreaIcon(position)}
                            color={positionColor.get(position.id) ?? 'var(--cl-line-strong)'}
                            size={15}
                          />
                          <WorkspaceCataloguePicker
                            inputId={`position-catalogue-${position.id}`}
                            bind:value={position.name}
                            selectedKey={position.catalogueKey}
                            items={positionCatalogueItems(position)}
                            placeholder={t('Select or type a position')}
                            label={t('Select or type a position')}
                            disabled={workspace.isPreview}
                            recommendedLabel={t('Recommended')}
                            allLabel={t('All positions')}
                            customLabel={t('Custom position')}
                            browseLabel={t('Browse system positions')}
                            noMatchesLabel={t('No matching system positions')}
                            customDescription={t('Keep this position specific to your restaurant')}
                            formatCustomLabel={(name) =>
                              t('Use “{name}” as a custom position', { name })}
                            onvaluechange={(value) => typePositionName(position, value)}
                            onselect={(item) => selectPositionCatalogue(position, item)}
                            oncustom={(value) => makePositionCustom(position, value)}
                          />
                        </div>
                      </td>
                      <td>
                        <PositionLinkedAreasField
                          areas={linkedAreaOptions}
                          selectedIds={position.areaIds}
                          recommendedIds={recommendedPositionAreaIds(position)}
                          disabled={workspace.isPreview}
                          label={`${t('Linked areas')} · ${position.name || t('Position')}`}
                          onchange={(areaIds) => setPositionAreas(position, areaIds)}
                        />
                      </td>
                      {#if shown('cost')}<td class="is-num"><input class="cl-field cost" type="number" disabled={workspace.isPreview} min="0" step="0.5" bind:value={position.estimatedHourlyCost} oninput={() => restaurantConfig.touch()} /></td>{/if}
                      {#if shown('employees')}<td><span class="cl-linkcount" class:is-zero={!headcount} title={t('{count} people', { count: headcount })}><span class="cl-linkcount__n">{headcount}</span></span></td>{/if}
                      {#if shown('active')}<td><ClassicCellBadge label={position.active ? 'Active' : 'Archived'} tone={position.active ? 'success' : 'neutral'} icon={position.active ? 'check' : 'minus'} /></td>{/if}
                      <td class="menu-cell">
                        <ClassicRowMenu
                          disabled={workspace.isPreview}
                          items={[
                            ...(persistedPositionIds.has(position.id)
                              ? position.active
                                ? [{ label: t('Archive'), tone: 'danger' as const, onselect: () => removeOrTogglePosition(position.id) }]
                                : [{ label: t('Restore'), onselect: () => removeOrTogglePosition(position.id) }]
                              : [{ label: t('Remove'), tone: 'danger' as const, onselect: () => removeOrTogglePosition(position.id) }])
                          ]}
                        />
                      </td>
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
  .cost { width: 120px; text-align: right; }
  .position-identity { min-width: 200px; display: grid; grid-template-columns: 34px minmax(0, 1fr); align-items: center; gap: 9px; }
  .position-identity :global(.area-icon) { width: 30px; height: 30px; border-radius: 6px; }
  .sr-only { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }
  .cl-grip { width: 34px; text-align: center; }
  .cl-grip button { border: 0; background: transparent; color: var(--cl-muted); cursor: grab; letter-spacing: -3px; }
  .cl-grip button:disabled { cursor: default; opacity: .35; }
</style>
