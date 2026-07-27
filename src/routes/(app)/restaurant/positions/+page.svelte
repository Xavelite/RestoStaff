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
  import Dialog from '$lib/components/Dialog.svelte';
  import WorkspaceAreaIcon from '$lib/restaurant/WorkspaceAreaIcon.svelte';
  import {
    WORKSPACE_POSITION_CATALOGUE,
    workspacePositionByKey
  } from '$lib/restaurant/workspace-catalogue';
  import { restaurantConfig } from '$lib/classic/classic-restaurant.svelte';

  type SortKey = 'name' | 'cost' | 'employees' | 'active';
  type GroupBy = 'area' | 'status' | 'staffing' | 'none';
  type PositionRow = {
    id: string;
    name: string;
    estimatedHourlyCost: number;
    active: boolean;
    primaryAreaId: string;
    areaIds: string[];
    catalogueKey: string;
  };
  type PositionGroup = { key: string; label: string; rows: PositionRow[] };

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

  let search = $state('');
  let costSearch = $state('');
  let employeeSearch = $state('');
  let sort = $state<{ key: SortKey; dir: 'asc' | 'desc' } | null>(null);
  let excludedStatus = $state(new Set<string>());
  let groupBy = $state<GroupBy>('none');
  let collapsedGroups = $state<string[]>([]);
  let dragId = $state('');
  let positionAreaEditorId = $state('');
  let newPositionId = $state('');

  const OPTIONAL_COLUMNS = [
    { key: 'cost', label: 'Estimated hourly cost' },
    { key: 'employees', label: 'Employees' },
    { key: 'active', label: 'Status' }
  ] as const;
  const COLS_KEY = 'rst-restaurant-positions-cols-v3';
  const DEFAULT_HIDDEN_COLUMNS = ['cost'];
  let hidden = $state(new Set<string>(DEFAULT_HIDDEN_COLUMNS));

  onMount(() => {
    try {
      const raw = localStorage.getItem(COLS_KEY);
      if (raw) hidden = new Set(JSON.parse(raw) as string[]);
    } catch {
      hidden = new Set(DEFAULT_HIDDEN_COLUMNS);
    }
  });

  function setGroupBy(next: GroupBy): void {
    groupBy = next;
    collapsedGroups = [];
  }

  function toggleGroup(key: string): void {
    collapsedGroups = collapsedGroups.includes(key)
      ? collapsedGroups.filter((item) => item !== key)
      : [...collapsedGroups, key];
  }

  function toggleColumn(key: string) {
    const next = new Set(hidden);
    next.has(key) ? next.delete(key) : next.add(key);
    const hiding = next.has(key);
    if (hiding && sort?.key === key) sort = null;
    if (key === 'cost' && hiding) costSearch = '';
    if (key === 'employees' && hiding) employeeSearch = '';
    if (key === 'active' && hiding) excludedStatus = new Set();
    hidden = next;
    try { localStorage.setItem(COLS_KEY, JSON.stringify([...next])); } catch {}
  }

  const shown = (key: string) =>
    (key !== 'cost' || workspace.canViewFinancials) && !hidden.has(key);
  const colCount = $derived(4 + OPTIONAL_COLUMNS.filter((column) => shown(column.key)).length);
  const persistedPositionIds = $derived(new Set((workspace.restaurant?.job_functions ?? []).map((position) => position.id)));
  const availableCataloguePositions = $derived.by(() => {
    const areas = restaurantConfig.draft?.areas.filter((area) => area.active) ?? [];
    const areaKeys = new Set(areas.map((area) => area.catalogueKey).filter(Boolean));
    const usedKeys = new Set(
      (restaurantConfig.draft?.jobFunctions ?? [])
        .filter((position) => position.active)
        .map((position) => position.catalogueKey)
        .filter(Boolean)
    );
    return WORKSPACE_POSITION_CATALOGUE.filter(
      (position) =>
        !usedKeys.has(position.key) &&
        (position.areaKeys.length === 0 ||
          position.areaKeys.some((areaKey) => areaKeys.has(areaKey)))
    );
  });
  const positionAreaEditor = $derived(
    restaurantConfig.draft?.jobFunctions.find(
      (position) => position.id === positionAreaEditorId
    ) ?? null
  );

  async function addPosition() {
    const draft = restaurantConfig.draft;
    if (!draft) return;
    const id = crypto.randomUUID();
    draft.jobFunctions = [{
      id,
      name: '',
      code: '',
      active: true,
      estimatedHourlyCost: 0,
      primaryAreaId: '',
      areaIds: [],
      catalogueKey: '',
      iconKey: ''
    }, ...draft.jobFunctions];
    restaurantConfig.touch();
    newPositionId = id;
    await tick();
    document.querySelector<HTMLInputElement>(`[data-position-name="${id}"]`)?.focus();
  }

  function applyPositionCatalogue(position: PositionRow) {
    if (position.catalogueKey) return;
    const match = availableCataloguePositions.find(
      (item) => item.label.toLowerCase() === position.name.trim().toLowerCase()
    );
    if (!match || !restaurantConfig.draft) return;
    const areaIds = restaurantConfig.draft.areas
      .filter(
        (area) =>
          area.active &&
          Boolean(area.catalogueKey) &&
          match.areaKeys.some((areaKey) => areaKey === area.catalogueKey)
      )
      .map((area) => area.id);
    position.catalogueKey = match.key;
    position.areaIds = areaIds;
    position.primaryAreaId = areaIds[0] ?? '';
    restaurantConfig.touch();
  }

  function positionAreaIcon(position: PositionRow): string {
    const areaId = position.primaryAreaId || position.areaIds[0] || '';
    return (
      restaurantConfig.draft?.areas.find((area) => area.id === areaId)?.iconKey ??
      'support'
    );
  }

  function primaryAreaLabel(position: PositionRow): string {
    return workspacePositionByKey.get(position.catalogueKey)?.areaKeys.length === 0
      ? t('All areas')
      : t('No primary area');
  }

  function primaryAreaColor(position: PositionRow): string {
    return areaColor.get(position.primaryAreaId) ?? '#64748b';
  }

  function togglePositionArea(position: PositionRow, areaId: string) {
    if (workspace.isPreview) return;
    if (position.areaIds.includes(areaId)) {
      position.areaIds = position.areaIds.filter((id) => id !== areaId);
      if (position.primaryAreaId === areaId) {
        position.primaryAreaId = position.areaIds[0] ?? '';
      }
    } else {
      position.areaIds = [...position.areaIds, areaId];
      position.primaryAreaId ||= areaId;
    }
    restaurantConfig.touch();
  }

  function setPrimaryPositionArea(position: PositionRow, areaId: string) {
    if (workspace.isPreview) return;
    if (!areaId) {
      position.primaryAreaId = '';
      restaurantConfig.touch();
      return;
    }
    if (!position.areaIds.includes(areaId)) {
      position.areaIds = [...position.areaIds, areaId];
    }
    position.primaryAreaId = areaId;
    restaurantConfig.touch();
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
    }
    restaurantConfig.touch();
  }

  function movePosition(targetId: string) {
    const draft = restaurantConfig.draft;
    if (!draft || !dragId || dragId === targetId || sort || groupBy !== 'none') return;
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
    const term = search.trim().toLowerCase();
    const headcount = employeesByPosition.get(position.id)?.size ?? 0;
    if (excludedStatus.has(position.active ? 'active' : 'archived')) return false;
    if (costSearch.trim() && !`${position.estimatedHourlyCost}`.includes(costSearch.trim())) return false;
    if (employeeSearch.trim() && !`${headcount}`.includes(employeeSearch.trim())) return false;
    return !term || position.name.toLowerCase().includes(term);
  }

  function sortValue(position: PositionRow) {
    switch (sort?.key) {
      case 'name': return position.name.toLowerCase();
      case 'cost': return `${position.estimatedHourlyCost}`.padStart(8, '0');
      case 'employees': return `${employeesByPosition.get(position.id)?.size ?? 0}`.padStart(4, '0');
      case 'active': return position.active ? '0' : '1';
      default: return position.name.toLowerCase();
    }
  }

  function orderedPositions(rows: PositionRow[]): PositionRow[] {
    if (!sort) return rows;
    const factor = sort.dir === 'desc' ? -1 : 1;
    return [...rows].sort((a, b) => factor * sortValue(a).localeCompare(sortValue(b)));
  }

  function groupedPositions(rows: PositionRow[]): PositionGroup[] {
    if (groupBy === 'none') return [{ key: 'all', label: '', rows }];
    const groups = new Map<string, PositionGroup>();
    for (const position of rows) {
      const headcount = employeesByPosition.get(position.id)?.size ?? 0;
      const allAreas = workspacePositionByKey.get(position.catalogueKey)?.areaKeys.length === 0;
      const key = groupBy === 'area'
        ? position.primaryAreaId || (allAreas ? 'all-areas' : 'unlinked')
        : groupBy === 'status'
          ? (position.active ? 'active' : 'archived')
          : (headcount ? 'staffed' : 'unstaffed');
      const label = groupBy === 'area'
        ? position.primaryAreaId
          ? restaurantConfig.draft?.areas.find((area) => area.id === position.primaryAreaId)?.name ?? t('No area linked')
          : t(allAreas ? 'All areas' : 'No area linked')
        : groupBy === 'status'
          ? t(position.active ? 'Active' : 'Archived')
          : t(headcount ? 'Staffed' : 'No staff assigned');
      const group = groups.get(key) ?? { key, label, rows: [] };
      group.rows.push(position);
      groups.set(key, group);
    }
    return [...groups.values()].sort((left, right) => left.label.localeCompare(right.label));
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

  <ClassicTablePanel dirty={context.dirty} saving={context.saving} canSave={context.canSave} onsave={() => void context.save().catch(() => undefined)} ondiscard={context.discard}>
    {#snippet meta()}
      <span><i class="dot"></i>{t('{count} positions', { count: rows.length })}</span>
      <span><i class="dot is-green"></i>{t('{count} active', { count: rows.filter((position) => position.active).length })}</span>
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
                  sortDir={sort?.key === 'name' ? sort.dir : null}
                  onsort={(dir) => (sort = { key: 'name', dir })}
                  filterKind="text"
                  searchValue={search}
                  onsearch={(value) => (search = value)}
                  groupValue={groupBy}
                  groupOptions={[
                    { value: 'none', label: t('No grouping') },
                    { value: 'area', label: t('Primary area') },
                    { value: 'status', label: t('Status') },
                    { value: 'staffing', label: t('Staffing') }
                  ]}
                  ongroupchange={(value) => setGroupBy(value as GroupBy)}
                />
              </th>
              <th>{t('Primary area')}</th>
              {#if shown('cost')}<th class="has-menu"><ClassicColMenu label={t('Estimated hourly cost')} sortable sortDir={sort?.key === 'cost' ? sort.dir : null} onsort={(dir) => (sort = { key: 'cost', dir })} filterKind="text" searchValue={costSearch} onsearch={(value) => (costSearch = value)} /></th>{/if}
              {#if shown('employees')}<th class="has-menu"><ClassicColMenu label={t('Employees')} sortable sortDir={sort?.key === 'employees' ? sort.dir : null} onsort={(dir) => (sort = { key: 'employees', dir })} filterKind="text" searchValue={employeeSearch} onsearch={(value) => (employeeSearch = value)} /></th>{/if}
              {#if shown('active')}<th class="has-menu"><ClassicColMenu label={t('Status')} sortable sortDir={sort?.key === 'active' ? sort.dir : null} onsort={(dir) => (sort = { key: 'active', dir })} filterKind="values" filterValues={[{ value: 'active', label: t('Active') }, { value: 'archived', label: t('Archived') }]} selected={excludedStatus} ontoggle={(value) => { const next = new Set(excludedStatus); next.has(value) ? next.delete(value) : next.add(value); excludedStatus = next; }} onselectall={(on) => (excludedStatus = on ? new Set() : new Set(['active', 'archived']))} /></th>{/if}
              <th class="chooser-col"><ClassicColChooser columns={OPTIONAL_COLUMNS.filter((column) => column.key !== 'cost' || workspace.canViewFinancials).map((column) => ({ key: column.key, label: t(column.label) }))} {hidden} ontoggle={toggleColumn} /></th>
            </tr>
          </thead>
          {#if !ordered.length}
            <tbody><tr><td colspan={colCount}><div class="cl-empty"><strong>{t('No positions yet')}</strong><span>{t('Add the jobs people do on a shift, such as Server, Cook or Bartender.')}</span></div></td></tr></tbody>
          {:else}
            {#each groups as group (group.key)}
              <tbody>
                {#if groupBy !== 'none'}<ClassicGroupRow colspan={colCount} label={group.label} meta={t('{count} positions', { count: group.rows.length })} color={groupBy === 'area' ? areaColor.get(group.key) : ''} collapsed={collapsedGroups.includes(group.key)} ontoggle={() => toggleGroup(group.key)} />{/if}
                {#if !collapsedGroups.includes(group.key)}
                  {#each group.rows as position (position.id)}
                    {@const headcount = employeesByPosition.get(position.id)?.size ?? 0}
                    <tr draggable={!sort && groupBy === 'none' && !workspace.isPreview} ondragstart={() => (dragId = position.id)} ondragend={() => (dragId = '')} ondragover={(event) => { if (!sort && groupBy === 'none') event.preventDefault(); }} ondrop={() => movePosition(position.id)}>
                      <td class="cl-grip"><button type="button" disabled={Boolean(sort) || groupBy !== 'none' || workspace.isPreview} title={sort || groupBy !== 'none' ? t('Clear grouping and sorting to reorder') : t('Drag to reorder')} aria-label={t('Drag to reorder')}>⋮⋮</button></td>
                      <td>
                        <div class="position-identity">
                          <WorkspaceAreaIcon
                            icon={positionAreaIcon(position)}
                            color={positionColor.get(position.id) ?? 'var(--cl-line-strong)'}
                            size={15}
                          />
                          <input
                            class="cl-field"
                            data-position-name={position.id}
                            list="restaurant-position-catalogue"
                            placeholder={t('Select or type a position')}
                            disabled={workspace.isPreview}
                            bind:value={position.name}
                            oninput={() => restaurantConfig.touch()}
                            onchange={() => applyPositionCatalogue(position)}
                            onblur={() => {
                              applyPositionCatalogue(position);
                              if (newPositionId === position.id) newPositionId = '';
                            }}
                          />
                        </div>
                      </td>
                      <td>
                        <div class="primary-area-field" style={`--area-color:${primaryAreaColor(position)}`}>
                          <span aria-hidden="true"></span>
                          <select
                            class="cl-field"
                            aria-label={t('Primary area')}
                          disabled={workspace.isPreview}
                            value={position.primaryAreaId}
                            onchange={(event) =>
                              setPrimaryPositionArea(
                                position,
                                (event.currentTarget as HTMLSelectElement).value
                              )}
                          >
                            <option value="">{primaryAreaLabel(position)}</option>
                            {#each draft.areas.filter((area) => area.active) as area (area.id)}
                              <option value={area.id}>{area.name}</option>
                            {/each}
                          </select>
                        </div>
                      </td>
                      {#if shown('cost')}<td class="is-num"><input class="cl-field cost" type="number" disabled={workspace.isPreview} min="0" step="0.5" bind:value={position.estimatedHourlyCost} oninput={() => restaurantConfig.touch()} /></td>{/if}
                      {#if shown('employees')}<td><span class="cl-linkcount" class:is-zero={!headcount} title={t('{count} people', { count: headcount })}><span class="cl-linkcount__n">{headcount}</span></span></td>{/if}
                      {#if shown('active')}<td><ClassicCellBadge label={position.active ? 'Active' : 'Archived'} tone={position.active ? 'success' : 'neutral'} icon={position.active ? 'check' : 'minus'} /></td>{/if}
                      <td class="menu-cell">
                        <ClassicRowMenu
                          disabled={workspace.isPreview}
                          items={[
                            {
                              label: t('Edit linked areas'),
                              onselect: () => (positionAreaEditorId = position.id)
                            },
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

<datalist id="restaurant-position-catalogue">
  {#each availableCataloguePositions as item (item.key)}
    <option value={item.label}>{item.category}</option>
  {/each}
</datalist>

<Dialog
  open={Boolean(positionAreaEditor)}
  title={positionAreaEditor ? `Areas for ${positionAreaEditor.name}` : 'Position areas'}
  description="Choose every area this position can work in. The primary area supplies its colour across the workspace."
  size="medium"
  onclose={() => (positionAreaEditorId = '')}
>
  {#snippet children()}
    {#if positionAreaEditor && restaurantConfig.draft}
      <div class="position-area-list">
        {#each restaurantConfig.draft.areas.filter((area) => area.active) as area (area.id)}
          {@const linked = positionAreaEditor.areaIds.includes(area.id)}
          <div class:is-linked={linked}>
            <label>
              <input
                type="checkbox"
                checked={linked}
                onchange={() => togglePositionArea(positionAreaEditor, area.id)}
              />
              <i style={`--area-color:${area.color}`}></i>
              <span><strong>{area.name}</strong><small>{linked ? t('Can work here') : t('Not linked')}</small></span>
            </label>
            <label class="primary-area">
              <input
                type="radio"
                name="primary-position-area"
                checked={positionAreaEditor.primaryAreaId === area.id}
                disabled={!linked}
                onchange={() => setPrimaryPositionArea(positionAreaEditor, area.id)}
              />
              <span>{t('Primary colour')}</span>
            </label>
          </div>
        {/each}
      </div>
    {/if}
  {/snippet}
  {#snippet footer()}
    <button class="cl-btn is-primary" type="button" onclick={() => (positionAreaEditorId = '')}>
      {t('Done')}
    </button>
  {/snippet}
</Dialog>

<style>
  .cost { width: 120px; text-align: right; }
  .position-identity { min-width: 200px; display: grid; grid-template-columns: 34px minmax(0, 1fr); align-items: center; gap: 9px; }
  .position-identity :global(.area-icon) { width: 30px; height: 30px; border-radius: 6px; }
  .primary-area-field { min-width: 165px; display: grid; grid-template-columns: 7px minmax(0, 1fr); align-items: center; gap: 8px; }
  .primary-area-field > span { width: 7px; height: 24px; border-radius: 2px; background: var(--area-color); }
  .primary-area-field select { min-width: 145px; }
  .sr-only { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }
  .chooser-col,
  .menu-cell { width: 44px; }
  .cl-grip { width: 34px; text-align: center; }
  .cl-grip button { border: 0; background: transparent; color: var(--cl-muted); cursor: grab; letter-spacing: -3px; }
  .cl-grip button:disabled { cursor: default; opacity: .35; }
  .dot { width: 7px; height: 7px; border-radius: 50%; background: var(--cl-line-strong); display: inline-block; }
  .dot.is-green { background: var(--cl-ok); }
  .position-area-list { display: grid; gap: 7px; }
  .position-area-list > div { display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: center; gap: 12px; min-height: 52px; padding: 8px 10px; border: 1px solid var(--cl-line); border-radius: 5px; background: var(--cl-surface); }
  .position-area-list > div.is-linked { border-color: color-mix(in srgb, var(--cl-accent) 32%, var(--cl-line)); background: color-mix(in srgb, var(--cl-accent) 4%, var(--cl-surface)); }
  .position-area-list label { display: flex; align-items: center; gap: 9px; cursor: pointer; }
  .position-area-list input { width: 15px; height: 15px; accent-color: var(--cl-accent); }
  .position-area-list i { width: 7px; height: 28px; border-radius: 2px; background: var(--area-color); }
  .position-area-list strong, .position-area-list small { display: block; }
  .position-area-list strong { font-size: 12px; }
  .position-area-list small { margin-top: 1px; color: var(--cl-muted); font-size: 10px; }
  .primary-area { color: var(--cl-muted); font-size: 10.5px; white-space: nowrap; }
  .primary-area:has(input:checked) { color: var(--cl-ink); font-weight: 700; }
  .primary-area:has(input:disabled) { cursor: default; opacity: .4; }
</style>
