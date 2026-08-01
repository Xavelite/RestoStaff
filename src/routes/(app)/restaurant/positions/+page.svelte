<script lang="ts">
  import { onMount, tick } from 'svelte';
  import { GripVertical } from '@lucide/svelte';
  import { t } from '$lib/i18n/i18n.svelte';
  import { buildAreaColorMap, buildPositionColorMap } from '$lib/ui/position-color';
  import { workspace } from '$lib/workspace/workspace.svelte';
  import { useWorkspaceRestaurantContext } from '$lib/workspace-ui/workspace-context';
  import WorkspaceTablePanel from '$lib/workspace-ui/WorkspaceTablePanel.svelte';
  import WorkspaceColMenu from '$lib/workspace-ui/WorkspaceColMenu.svelte';
  import WorkspacePrimaryColMenu from '$lib/workspace-ui/WorkspacePrimaryColMenu.svelte';
  import WorkspaceGroupRow from '$lib/workspace-ui/WorkspaceGroupRow.svelte';
  import WorkspaceCard from '$lib/workspace-ui/WorkspaceCard.svelte';
  import WorkspaceCardGrid from '$lib/workspace-ui/WorkspaceCardGrid.svelte';
  import { workspaceLayout } from '$lib/workspace-ui/workspace-layout.svelte';
  import WorkspaceColChooser from '$lib/workspace-ui/WorkspaceColChooser.svelte';
  import WorkspaceRowMenu from '$lib/workspace-ui/WorkspaceRowMenu.svelte';
  import WorkspacePeopleStack, {
    type WorkspacePerson
  } from '$lib/workspace-ui/WorkspacePeopleStack.svelte';
  import WorkspaceToggle from '$lib/workspace-ui/WorkspaceToggle.svelte';
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
  import { restaurantConfig } from '$lib/workspace-ui/workspace-restaurant.svelte';
  import { createTableView } from '$lib/workspace-ui/table-view.svelte';

  type SortKey = 'name' | 'category' | 'areas' | 'cost' | 'employees' | 'active';
  type GroupBy = 'category' | 'area' | 'status' | 'staffing' | 'none';
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
  const employeeName = $derived(
    new Map(
      (workspace.team?.employees ?? []).map((employee) => [
        employee.id,
        employee.display_name
      ])
    )
  );
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
    storageKey: 'rst-restaurant-positions-cols-v4',
    columns: OPTIONAL_COLUMNS,
    defaultHidden: [],
    defaultGroupBy: 'category',
    defaultExcluded: { active: ['archived'] }
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

  function positionCategory(position: PositionRow): string {
    return systemPosition(position)?.category ?? 'support';
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

  function removeUnsavedPosition(positionId: string) {
    const draft = restaurantConfig.draft;
    if (!draft || workspace.isPreview) return;
    draft.jobFunctions = draft.jobFunctions.filter((item) => item.id !== positionId);
    draft.coverage = draft.coverage.filter((item) => item.jobFunctionId !== positionId);
    restaurantConfig.removePositionPlacement(positionId);
    restaurantConfig.touch();
  }

  function setPositionActive(positionId: string, active: boolean) {
    const draft = restaurantConfig.draft;
    if (!draft || workspace.isPreview) return;
    const position = draft.jobFunctions.find((item) => item.id === positionId);
    if (!position) return;
    position.active = active;
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

  function peopleForPosition(positionId: string): WorkspacePerson[] {
    return [...(employeesByPosition.get(positionId) ?? [])]
      .map((employeeId) => ({
        id: employeeId,
        name: employeeName.get(employeeId) ?? t('Employee')
      }))
      .sort((left, right) => left.name.localeCompare(right.name));
  }

  function sortValue(position: PositionRow, key: SortKey): string | number {
    const stable = placementForPosition(position);
    switch (key) {
      case 'category': return positionCategoryLabel(positionCategory(stable));
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

  async function editPositionFromCard(positionId: string): Promise<void> {
    workspaceLayout.set('grid');
    view.resetFilters();
    await tick();
    document.getElementById(`position-catalogue-${positionId}`)?.focus();
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
      const category = positionCategory(stable);
      const key = view.groupBy === 'category'
        ? `category:${category}`
        : view.groupBy === 'area'
        ? linkedAreaIds.length
          ? `areas:${linkedAreaIds.join(':')}`
          : 'all-areas'
        : view.groupBy === 'status'
          ? (stable.active ? 'active' : 'archived')
          : (headcount ? 'staffed' : 'unstaffed');
      const label = view.groupBy === 'category'
        ? positionCategoryLabel(category)
        : view.groupBy === 'area'
        ? linkedAreaLabel
        : view.groupBy === 'status'
          ? t(stable.active ? 'Active' : 'Archived')
          : t(headcount ? 'Staffed' : 'No staff assigned');
      const placementLabel =
        view.groupBy === 'category'
          ? `${['management', 'service', 'bar', 'kitchen', 'takeaway', 'support'].indexOf(category)}`.padStart(2, '0')
          : view.groupBy === 'area'
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
        view.groupBy === 'category'
          ? positionCategoryColor(category)
          : view.groupBy === 'area' && linkedAreaIds.length === 1
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

  const readRestaurantContext = useWorkspaceRestaurantContext();
  const context = $derived(readRestaurantContext());
</script>

<svelte:head><title>{t('Positions')} &middot; restogogo</title></svelte:head>

{#if context}
  {@const draft = context.draft}
  {@const rows = [...draft.jobFunctions].filter(matches)}
  {@const ordered = orderedPositions(rows)}
  {@const groups = groupedPositions(ordered)}
  {@const statusValues = [{ value: 'active', label: t('Active') }, { value: 'archived', label: t('Archived') }]}

  <WorkspaceTablePanel
    dirty={context.dirty}
    saving={context.saving}
    canSave={context.canSave}
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
      {#if workspaceLayout.visual}
        <div class="position-visual">
          {#each groups as group (group.key)}
            <section class="position-visual__group" style={`--group-tone:${group.color || 'var(--cl-line-strong)'}`}>
              {#if group.label}
                <header>
                  <span class="position-visual__group-icon">
                    <WorkspaceAreaIcon
                      icon={view.groupBy === 'category' ? positionCategoryIcon(group.key.replace('category:', '')) : 'support'}
                      color={group.color || 'var(--cl-muted)'}
                      size={15}
                      compact
                    />
                  </span>
                  <strong>{group.label}</strong>
                  <small>{group.rows.length === 1 ? t('1 position') : t('{count} positions', { count: group.rows.length })}</small>
                  <i aria-hidden="true"></i>
                </header>
              {/if}
              <WorkspaceCardGrid>
                {#each group.rows as position (position.id)}
                  {@const headcount = employeesByPosition.get(position.id)?.size ?? 0}
                  <WorkspaceCard
                    accent={positionColor.get(position.id) ?? null}
                    title={position.name || t('Position')}
                    subtitle={linkedAreaSetLabel(linkedPositionAreaIds(position))}
                    badges={[
                      position.active
                        ? { label: t('Active'), tone: 'ok' as const }
                        : { label: t('Archived'), tone: 'neutral' as const },
                      { label: t('{count} people', { count: headcount }), tone: headcount ? 'accent' as const : 'neutral' as const }
                    ]}
                    meta={workspace.canViewFinancials
                      ? [{ label: t('Estimated hourly cost'), value: `€ ${position.estimatedHourlyCost}` }]
                      : []}
                    onactivate={() => void editPositionFromCard(position.id)}
                  >
                    {#snippet media()}
                      <WorkspaceAreaIcon
                        icon={positionAreaIcon(position)}
                        color={positionColor.get(position.id) ?? 'var(--cl-line-strong)'}
                        size={17}
                      />
                    {/snippet}
                    {#snippet children()}
                      {#if headcount}
                        <WorkspacePeopleStack people={peopleForPosition(position.id)} />
                      {:else}
                        <span class="position-visual__empty">{t('No staff assigned')}</span>
                      {/if}
                    {/snippet}
                  </WorkspaceCard>
                {/each}
              </WorkspaceCardGrid>
            </section>
          {/each}
        </div>
      {:else}
      <div class="cl-tablewrap">
        <table class="cl-table cl-mobile-rows">
          <thead>
            <tr>
              <th class="cl-grip"><span class="sr-only">{t('Reorder')}</span></th>
              <th class="has-menu">
                <WorkspacePrimaryColMenu
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
                    { value: 'category', label: t('Category') },
                    { value: 'area', label: t('Linked areas') },
                    { value: 'status', label: t('Status') },
                    { value: 'staffing', label: t('Staffing') }
                  ]}
                  ongroupchange={(value) => view.setGroupBy(value as GroupBy)}
                />
              </th>
              <th class="has-menu">
                <WorkspaceColMenu
                  label={t('Linked areas')}
                  sortable
                  sortDir={view.sortDir('areas')}
                  onsort={(dir) => view.setSort('areas', dir)}
                  filterKind="text"
                  searchValue={view.search('areas')}
                  onsearch={(value) => view.setSearch('areas', value)}
                />
              </th>
              {#if shown('cost')}<th class="has-menu"><WorkspaceColMenu label={t('Estimated hourly cost')} sortable sortDir={view.sortDir('cost')} onsort={(dir) => view.setSort('cost', dir)} filterKind="text" searchValue={view.search('cost')} onsearch={(value) => view.setSearch('cost', value)} /></th>{/if}
              {#if shown('employees')}<th class="has-menu"><WorkspaceColMenu label={t('Employees')} sortable sortDir={view.sortDir('employees')} onsort={(dir) => view.setSort('employees', dir)} filterKind="text" searchValue={view.search('employees')} onsearch={(value) => view.setSearch('employees', value)} /></th>{/if}
              {#if shown('active')}<th class="has-menu"><WorkspaceColMenu label={t('Status')} sortable sortDir={view.sortDir('active')} onsort={(dir) => view.setSort('active', dir)} filterKind="values" filterValues={statusValues} selected={view.excluded('active')} ontoggle={(value) => view.toggleValue('active', value)} onselectall={(on) => view.selectAll('active', on, statusValues)} /></th>{/if}
              <th class="chooser-col"><WorkspaceColChooser columns={chooserColumns} hidden={view.hidden} ontoggle={view.toggleColumn} /></th>
            </tr>
          </thead>
          {#if !ordered.length}
            <tbody><tr class="cl-mobile-empty"><td colspan={colCount}><div class="cl-empty"><strong>{t('No positions yet')}</strong><span>{t('Add the jobs people do on a shift, such as Server, Cook or Bartender.')}</span></div></td></tr></tbody>
          {:else}
            {#each groups as group (group.key)}
              <tbody>
                {#if view.grouping}<WorkspaceGroupRow colspan={colCount} label={group.label} meta={t('{count} positions', { count: group.rows.length })} color={group.color} collapsed={view.isCollapsed(group.key)} ontoggle={() => view.toggleGroup(group.key)} />{/if}
                {#if !view.isCollapsed(group.key)}
                  {#each group.rows as position (position.id)}
                    {@const headcount = employeesByPosition.get(position.id)?.size ?? 0}
                    {@const reorderable = !view.sort && !view.grouping}
                    <tr class:is-new={!persistedPositionIds.has(position.id)} draggable={reorderable && !workspace.isPreview} ondragstart={() => (dragId = position.id)} ondragend={() => (dragId = '')} ondragover={(event) => { if (reorderable) event.preventDefault(); }} ondrop={() => movePosition(position.id)}>
                      <td class="cl-grip"><button type="button" disabled={!reorderable || workspace.isPreview} title={reorderable ? t('Drag to reorder') : t('Clear grouping and sorting to reorder')} aria-label={t('Drag to reorder')}><GripVertical size={16} /></button></td>
                      <td class="cl-mobile-primary">
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
                        <span class="cl-mobile-summary">
                          <span>{linkedAreaSetLabel(linkedPositionAreaIds(position))}</span>
                          <span>{t('{count} people', { count: headcount })}</span>
                          {#if !position.active}<span>{t('Archived')}</span>{/if}
                        </span>
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
                      {#if shown('cost')}
                        <td class="is-num">
                          <label class="money-field">
                            <span>€</span>
                            <input class="cl-field cost" type="number" inputmode="decimal" disabled={workspace.isPreview} min="0" step="0.01" bind:value={position.estimatedHourlyCost} oninput={() => restaurantConfig.touch()} />
                            <small>/h</small>
                          </label>
                        </td>
                      {/if}
                      {#if shown('employees')}
                        <td>
                          <WorkspacePeopleStack people={peopleForPosition(position.id)} />
                        </td>
                      {/if}
                      {#if shown('active')}
                        <td>
                          <WorkspaceToggle
                            checked={position.active}
                            label={position.active ? 'Active' : 'Archived'}
                            disabled={workspace.isPreview}
                            onchange={(active) => setPositionActive(position.id, active)}
                          />
                        </td>
                      {/if}
                      <td class="menu-cell">
                        {#if !persistedPositionIds.has(position.id)}
                          <WorkspaceRowMenu
                            disabled={workspace.isPreview}
                            items={[{ label: t('Remove'), tone: 'danger', onselect: () => removeUnsavedPosition(position.id) }]}
                          />
                        {/if}
                      </td>
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
  .position-visual {
    display: grid;
    gap: 18px;
    padding: 18px;
  }
  .position-visual__group { min-width: 0; display: grid; gap: 9px; }
  .position-visual__group > header {
    min-height: 28px;
    display: grid;
    grid-template-columns: auto auto auto minmax(40px, 1fr);
    align-items: center;
    gap: 7px;
  }
  .position-visual__group > header strong { font-size: var(--rst-fs-control); }
  .position-visual__group > header small { color: var(--cl-muted); font-size: var(--rst-fs-caption); }
  .position-visual__group > header i {
    height: 1px;
    margin-left: 5px;
    background: linear-gradient(90deg, color-mix(in srgb, var(--group-tone) 54%, var(--cl-line)), transparent);
  }
  .position-visual__group-icon { display: inline-flex; }
  .position-visual__group :global(.card-grid) { padding: 0; }
  .position-visual__empty { color: var(--cl-muted); font-size: var(--rst-fs-label); }

  .money-field {
    min-width: 112px;
    display: inline-grid;
    grid-template-columns: auto minmax(54px, 1fr) auto;
    align-items: center;
    gap: 4px;
    color: var(--cl-ok);
    font-weight: var(--rst-fw-bold);
  }
  .money-field small { color: var(--cl-muted); font-size: var(--rst-fs-caption); font-weight: var(--rst-fw-medium); }
  .cost { width: 72px; text-align: right; font-variant-numeric: tabular-nums; }
  .cost::-webkit-inner-spin-button,
  .cost::-webkit-outer-spin-button { margin: 0; appearance: none; }
  .cost { appearance: textfield; }
  .position-identity { min-width: 200px; display: grid; grid-template-columns: 34px minmax(0, 1fr); align-items: center; gap: 9px; }
  .position-identity :global(.area-icon) { width: 30px; height: 30px; border-radius: 6px; }
  .cl-grip { width: 34px; text-align: center; }
  .cl-grip button { display: inline-grid; place-items: center; width: 28px; height: 28px; border: 0; border-radius: 5px; background: transparent; color: var(--cl-muted); cursor: grab; }
  .cl-grip button:hover:not(:disabled) { color: var(--cl-ink); background: var(--cl-surface-muted); }
  .cl-grip button:disabled { cursor: default; opacity: .35; }
</style>
