<script lang="ts">
  import { onMount } from 'svelte';
  import { t } from '$lib/i18n/i18n.svelte';
  import { buildPositionColorMap } from '$lib/ui/position-color';
  import { workspace } from '$lib/workspace/workspace.svelte';
  import { useClassicRestaurantContext } from '$lib/classic/classic-workspace-context';
  import ClassicTablePanel from '$lib/classic/ClassicTablePanel.svelte';
  import ClassicColMenu from '$lib/classic/ClassicColMenu.svelte';
  import ClassicPrimaryColMenu from '$lib/classic/ClassicPrimaryColMenu.svelte';
  import ClassicGroupRow from '$lib/classic/ClassicGroupRow.svelte';
  import ClassicColChooser from '$lib/classic/ClassicColChooser.svelte';
  import { restaurantConfig } from '$lib/classic/classic-restaurant.svelte';

  type SortKey = 'name' | 'cost' | 'employees' | 'active';
  type GroupBy = 'status' | 'staffing' | 'none';
  type PositionRow = {
    id: string;
    name: string;
    estimatedHourlyCost: number;
    active: boolean;
    primaryAreaId: string;
  };
  type PositionGroup = { key: string; label: string; rows: PositionRow[] };

  $effect(() => {
    if (workspace.activeId && workspace.effectiveRole === 'owner') {
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

  let search = $state('');
  let costSearch = $state('');
  let employeeSearch = $state('');
  let sort = $state<{ key: SortKey; dir: 'asc' | 'desc' } | null>(null);
  let excludedStatus = $state(new Set<string>());
  let groupBy = $state<GroupBy>('none');
  let collapsedGroups = $state<string[]>([]);
  let dragId = $state('');

  const OPTIONAL_COLUMNS = [
    { key: 'cost', label: 'Estimated hourly cost' },
    { key: 'employees', label: 'Employees' },
    { key: 'active', label: 'Status' }
  ] as const;
  const COLS_KEY = 'rst-restaurant-positions-cols-v2';
  let hidden = $state(new Set<string>());

  onMount(() => {
    try {
      const raw = localStorage.getItem(COLS_KEY);
      if (raw) hidden = new Set(JSON.parse(raw) as string[]);
    } catch {
      hidden = new Set();
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

  const shown = (key: string) => !hidden.has(key);
  const colCount = $derived(6 + OPTIONAL_COLUMNS.filter((column) => shown(column.key)).length);
  const persistedPositionIds = $derived(new Set((workspace.restaurant?.job_functions ?? []).map((position) => position.id)));

  function addPosition() {
    const draft = restaurantConfig.draft;
    if (!draft) return;
    draft.jobFunctions = [{
      id: crypto.randomUUID(),
      name: '',
      code: '',
      active: true,
      estimatedHourlyCost: 0,
      primaryAreaId: draft.areas.find((area) => area.active)?.id ?? ''
    }, ...draft.jobFunctions];
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
      const key = groupBy === 'status'
        ? (position.active ? 'active' : 'archived')
        : (headcount ? 'staffed' : 'unstaffed');
      const label = groupBy === 'status'
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
      <button class="cl-btn is-primary" type="button" disabled={workspace.isPreview || !restaurantConfig.draft} onclick={addPosition}><svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>{t('Add position')}</button>
    {/snippet}
    {#snippet children()}
      <div class="cl-tablewrap">
        <table class="cl-table">
          <thead>
            <tr>
              <th class="cl-grip"><span class="sr-only">{t('Reorder')}</span></th>
              <th class="swatch-col"><span class="sr-only">{t('Colour')}</span></th>
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
              <th class="actions-col">{t('Actions')}</th>
              <th class="chooser-col"><ClassicColChooser columns={OPTIONAL_COLUMNS.map((column) => ({ key: column.key, label: t(column.label) }))} {hidden} ontoggle={toggleColumn} /></th>
            </tr>
          </thead>
          {#if !ordered.length}
            <tbody><tr><td colspan={colCount}><div class="cl-empty"><strong>{t('No positions yet')}</strong><span>{t('Add the jobs people do on a shift, such as Server, Cook or Bartender.')}</span></div></td></tr></tbody>
          {:else}
            {#each groups as group (group.key)}
              <tbody>
                {#if groupBy !== 'none'}<ClassicGroupRow colspan={colCount} label={group.label} meta={t('{count} positions', { count: group.rows.length })} collapsed={collapsedGroups.includes(group.key)} ontoggle={() => toggleGroup(group.key)} />{/if}
                {#if !collapsedGroups.includes(group.key)}
                  {#each group.rows as position (position.id)}
                    {@const headcount = employeesByPosition.get(position.id)?.size ?? 0}
                    <tr draggable={!sort && groupBy === 'none' && !workspace.isPreview} ondragstart={() => (dragId = position.id)} ondragend={() => (dragId = '')} ondragover={(event) => { if (!sort && groupBy === 'none') event.preventDefault(); }} ondrop={() => movePosition(position.id)}>
                      <td class="cl-grip"><button type="button" disabled={Boolean(sort) || groupBy !== 'none' || workspace.isPreview} title={sort || groupBy !== 'none' ? t('Clear grouping and sorting to reorder') : t('Drag to reorder')} aria-label={t('Drag to reorder')}>⋮⋮</button></td>
                      <td class="swatch-col">
                        <span class="derived-swatch" style={`--position-color:${positionColor.get(position.id) ?? 'var(--cl-line-strong)'}`} title={t('Colour inherited from primary area')}></span>
                      </td>
                      <td><input class="cl-field" placeholder={t('Position name')} disabled={workspace.isPreview} bind:value={position.name} oninput={() => restaurantConfig.touch()} /></td>
                      <td>
                        <select class="cl-field area-select" disabled={workspace.isPreview} bind:value={position.primaryAreaId} onchange={() => restaurantConfig.touch()}>
                          <option value="">{t('Across areas')}</option>
                          {#each draft.areas.filter((area) => area.active) as area (area.id)}
                            <option value={area.id}>{area.name}</option>
                          {/each}
                        </select>
                      </td>
                      {#if shown('cost')}<td class="is-num"><input class="cl-field cost" type="number" disabled={workspace.isPreview} min="0" step="0.5" bind:value={position.estimatedHourlyCost} oninput={() => restaurantConfig.touch()} /></td>{/if}
                      {#if shown('employees')}<td><span class="cl-linkcount" class:is-zero={!headcount} title={t('{count} people', { count: headcount })}><span class="cl-linkcount__n">{headcount}</span></span></td>{/if}
                      {#if shown('active')}<td><label class="switch"><input type="checkbox" disabled={workspace.isPreview} bind:checked={position.active} onchange={() => restaurantConfig.touch()} /><span>{t(position.active ? 'Active' : 'Archived')}</span></label></td>{/if}
                      <td class="row-actions"><button class="cl-text-action" type="button" disabled={workspace.isPreview} onclick={() => removeOrTogglePosition(position.id)}>{t(persistedPositionIds.has(position.id) ? (position.active ? 'Archive' : 'Restore') : 'Remove')}</button></td>
                      <td></td>
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
  .switch { display: inline-flex; align-items: center; gap: 8px; font-size: 14px; }
  .switch input { width: 16px; height: 16px; accent-color: var(--cl-accent); }
  .swatch-col { width: 34px; padding-right: 0 !important; }
  .derived-swatch { width: 14px; height: 28px; display: block; border: 1px solid color-mix(in srgb, var(--position-color) 72%, #111827); border-radius: 3px; background: color-mix(in srgb, var(--position-color) 88%, white); }
  .area-select { min-width: 150px; }
  .sr-only { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }
  .chooser-col { width: 44px; }
  .actions-col { width: 86px; }
  .row-actions { text-align: right; }
  .cl-text-action { border: 0; background: transparent; color: var(--cl-muted); font: inherit; font-size: 13px; cursor: pointer; }
  .cl-text-action:hover { color: var(--cl-ink); text-decoration: underline; }
  .cl-text-action:disabled { cursor: default; opacity: .45; text-decoration: none; }
  .cl-grip { width: 34px; text-align: center; }
  .cl-grip button { border: 0; background: transparent; color: var(--cl-muted); cursor: grab; letter-spacing: -3px; }
  .cl-grip button:disabled { cursor: default; opacity: .35; }
  .dot { width: 7px; height: 7px; border-radius: 50%; background: var(--cl-line-strong); display: inline-block; }
  .dot.is-green { background: var(--cl-ok); }
</style>
