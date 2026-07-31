<script lang="ts">
  import { onMount, tick } from 'svelte';
  import { GripVertical, Map as MapIcon } from '@lucide/svelte';
  import { t } from '$lib/i18n/i18n.svelte';
  import { confirmAction } from '$lib/ui/confirm.svelte';
  import { buildPositionColorMap, defaultAreaColor } from '$lib/ui/position-color';
  import { workspace } from '$lib/workspace/workspace.svelte';
  import { useWorkspaceRestaurantContext } from '$lib/workspace-ui/workspace-context';
  import { restaurantConfig } from '$lib/workspace-ui/workspace-restaurant.svelte';
  import { createTableView } from '$lib/workspace-ui/table-view.svelte';
  import WorkspaceColChooser from '$lib/workspace-ui/WorkspaceColChooser.svelte';
  import WorkspaceColMenu from '$lib/workspace-ui/WorkspaceColMenu.svelte';
  import WorkspaceGroupRow from '$lib/workspace-ui/WorkspaceGroupRow.svelte';
  import WorkspacePrimaryColMenu from '$lib/workspace-ui/WorkspacePrimaryColMenu.svelte';
  import WorkspaceRowMenu from '$lib/workspace-ui/WorkspaceRowMenu.svelte';
  import WorkspaceServiceIcon from '$lib/workspace-ui/WorkspaceServiceIcon.svelte';
  import WorkspaceTablePanel from '$lib/workspace-ui/WorkspaceTablePanel.svelte';
  import WorkspaceTimeRange from '$lib/workspace-ui/WorkspaceTimeRange.svelte';
  import WorkspaceToggle from '$lib/workspace-ui/WorkspaceToggle.svelte';
  import { workspaceLayout } from '$lib/workspace-ui/workspace-layout.svelte';
  import {
    duplicateAreaTypeCount,
    nextAreaInstanceNumber,
    type AreaInstanceIdentity
  } from './area-instance';
  import WorkspaceAreaIcon from './WorkspaceAreaIcon.svelte';
  import WorkspaceCataloguePicker, {
    type WorkspaceCataloguePickerItem
  } from './WorkspaceCataloguePicker.svelte';
  import {
    WORKSPACE_AREA_CATALOGUE,
    workspaceAreaByKey
  } from './workspace-catalogue';
  import type { AreaDraft } from './restaurant-model';

  type SortKey = 'name' | 'positions' | 'floor' | 'active';
  type GroupBy = 'floor' | 'status' | 'none';
  type AreaGroup = {
    key: string;
    label: string;
    color: string;
    rows: AreaDraft[];
  };

  const OPTIONAL_COLUMNS = [
    { key: 'hours', label: 'Default hours' },
    { key: 'positions', label: 'Linked positions' },
    { key: 'floor', label: 'Floor' },
    { key: 'notes', label: 'Notes' },
    { key: 'active', label: 'Status' }
  ] as const;

  const view = createTableView<SortKey, GroupBy>({
    storageKey: 'rst-restaurant-areas-cols-v2',
    columns: OPTIONAL_COLUMNS,
    defaultHidden: ['notes'],
    defaultGroupBy: 'floor',
    defaultExcluded: { active: ['archived'] }
  });

  onMount(view.restore);

  const readRestaurantContext = useWorkspaceRestaurantContext();
  const context = $derived(readRestaurantContext());
  const persistedAreaIds = $derived(
    new Set((workspace.restaurant?.work_areas ?? []).map((area) => area.id))
  );
  const activeServices = $derived(
    context?.draft.services.filter((service) => service.active) ?? []
  );
  const positionColor = $derived(
    buildPositionColorMap(
      context?.draft.jobFunctions ?? [],
      context?.draft.areas ?? []
    )
  );
  const shown = (key: string) => view.shown(key);
  const colCount = $derived(
    3 + OPTIONAL_COLUMNS.filter((column) => shown(column.key)).length
  );
  let dragId = $state('');

  function areaIdentities(): AreaInstanceIdentity[] {
    return (context?.draft.areas ?? []).map((area) => ({
      id: area.id,
      name: area.name,
      active: area.active,
      catalogueKey: area.catalogueKey,
      instanceNumber: area.instanceNumber,
      floorLevel: area.floorLevel ?? 0
    }));
  }

  function catalogueItems(): WorkspaceCataloguePickerItem[] {
    return WORKSPACE_AREA_CATALOGUE.map((area) => ({
      key: area.key,
      label: t(area.label),
      category: t(area.category),
      icon: area.icon,
      color: area.color,
      recommended: area.starter
    }));
  }

  function positionsForArea(areaId: string) {
    return context?.draft.jobFunctions.filter(
      (position) => position.active && position.areaIds.includes(areaId)
    ) ?? [];
  }

  function positionCount(areaId: string): number {
    return positionsForArea(areaId).length;
  }

  function positionSummary(areaId: string): string {
    const names = positionsForArea(areaId).map((position) => position.name).filter(Boolean);
    if (!names.length) return t('No linked positions');
    if (names.length <= 2) return names.join(', ');
    return `${names.slice(0, 2).join(', ')} +${names.length - 2}`;
  }

  function placement(area: AreaDraft): AreaDraft {
    return restaurantConfig.placementArea(area);
  }

  function floorLabel(level: number | null): string {
    if (level === null) return t('Not set');
    if (level === -1) return t('Basement');
    if (level === 0) return t('Ground floor');
    if (level === 1) return t('First floor');
    if (level === 2) return t('Second floor');
    return t('Floor {level}', { level: level > 0 ? `+${level}` : level });
  }

  function instanceHint(area: AreaDraft): string {
    const identities = areaIdentities();
    const identity = identities.find((candidate) => candidate.id === area.id);
    if (!identity || duplicateAreaTypeCount(identity, identities) <= 1) return '';
    return `${floorLabel(area.floorLevel)} · ${t('instance')} ${area.instanceNumber}`;
  }

  async function addArea(): Promise<void> {
    if (!context || workspace.isPreview) return;
    const id = crypto.randomUUID();
    const area: AreaDraft = {
      id,
      name: '',
      code: '',
      notes: '',
      active: true,
      serviceHours: Object.fromEntries(
        context.draft.services.map((service) => [
          service.serviceKey,
          { start: '', end: '' }
        ])
      ),
      color: defaultAreaColor(context.draft.areas.length),
      catalogueKey: '',
      iconKey: '',
      instanceNumber: 1,
      floorLevel: 0
    };
    context.draft.areas = [area, ...context.draft.areas];
    restaurantConfig.placementArea(area);
    restaurantConfig.touch();
    workspaceLayout.set('rows');
    view.resetFilters();
    await tick();
    document.getElementById(`area-catalogue-${id}`)?.focus();
  }

  function selectCatalogue(area: AreaDraft, item: WorkspaceCataloguePickerItem): void {
    const changingType = area.catalogueKey !== item.key;
    area.name = item.label;
    area.catalogueKey = item.key;
    area.color = item.color ?? area.color;
    area.iconKey = item.icon ?? '';
    if (changingType) {
      area.instanceNumber = nextAreaInstanceNumber(
        item.key,
        areaIdentities(),
        area.id
      );
    }
    restaurantConfig.touch();
  }

  function typeName(area: AreaDraft, value: string): void {
    const catalogueLabel = workspaceAreaByKey.get(area.catalogueKey)?.label ?? '';
    if (
      area.catalogueKey &&
      value.trim().toLocaleLowerCase() !==
        t(catalogueLabel).trim().toLocaleLowerCase()
    ) {
      area.catalogueKey = '';
      area.iconKey = '';
    }
    if (!area.catalogueKey) {
      area.instanceNumber = nextAreaInstanceNumber(
        '',
        areaIdentities(),
        area.id,
        value
      );
    }
    restaurantConfig.touch();
  }

  function makeCustom(area: AreaDraft, value: string): void {
    if (value.trim()) area.name = value.trim();
    area.catalogueKey = '';
    area.iconKey = '';
    area.instanceNumber = nextAreaInstanceNumber(
      '',
      areaIdentities(),
      area.id,
      area.name
    );
    restaurantConfig.touch();
  }

  function setFloor(area: AreaDraft, value: string): void {
    area.floorLevel = value === '' ? null : Math.trunc(Number(value));
    restaurantConfig.touch();
  }

  function removeUnsaved(areaId: string): void {
    if (!context) return;
    context.draft.areas = context.draft.areas.filter((area) => area.id !== areaId);
    context.draft.coverage = context.draft.coverage.filter(
      (rule) => rule.areaId !== areaId
    );
    for (const position of context.draft.jobFunctions) {
      position.areaIds = position.areaIds.filter((id) => id !== areaId);
    }
    restaurantConfig.removeAreaPlacement(areaId);
    restaurantConfig.touch();
  }

  async function setAreaActive(area: AreaDraft, active: boolean): Promise<void> {
    if (!context || workspace.isPreview) return;
    if (!persistedAreaIds.has(area.id)) {
      area.active = active;
      restaurantConfig.touch();
      return;
    }
    if (active) {
      area.active = true;
      restaurantConfig.touch();
      return;
    }
    const linkedPositions = positionCount(area.id);
    const confirmed = await confirmAction({
      title: t('Archive {name}?', { name: area.name }),
      body: t(
        'This removes the area from Schedule and Staffing and unlinks {positions} positions.',
        { positions: linkedPositions }
      ),
      confirmLabel: t('Archive area'),
      tone: 'danger'
    });
    if (!confirmed) return;
    area.active = false;
    context.draft.coverage = context.draft.coverage.filter(
      (rule) => rule.areaId !== area.id
    );
    for (const position of context.draft.jobFunctions) {
      position.areaIds = position.areaIds.filter((id) => id !== area.id);
    }
    restaurantConfig.touch();
  }

  function moveArea(targetId: string): void {
    if (!context || !dragId || dragId === targetId || view.sort || view.grouping) return;
    const from = context.draft.areas.findIndex((area) => area.id === dragId);
    const to = context.draft.areas.findIndex((area) => area.id === targetId);
    if (from < 0 || to < 0) return;
    const next = [...context.draft.areas];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    context.draft.areas = next;
    dragId = '';
    restaurantConfig.touch();
  }

  function matches(area: AreaDraft): boolean {
    if (!persistedAreaIds.has(area.id)) return true;
    const stable = placement(area);
    if (view.isExcluded('active', stable.active ? 'active' : 'archived')) return false;
    if (!view.matchesSearch('positions', `${positionCount(stable.id)}`)) return false;
    if (!view.matchesSearch('floor', floorLabel(stable.floorLevel))) return false;
    if (!view.matchesSearch('hours', hoursSummary(stable))) return false;
    if (!view.matchesSearch('notes', stable.notes)) return false;
    return view.matchesSearch('name', stable.name);
  }

  function sortValue(area: AreaDraft, key: SortKey): string | number {
    const stable = placement(area);
    if (key === 'positions') return positionCount(stable.id);
    if (key === 'floor') return stable.floorLevel ?? -99;
    if (key === 'active') return stable.active ? 0 : 1;
    return stable.name.toLocaleLowerCase();
  }

  function hoursSummary(area: AreaDraft): string {
    const configured = activeServices.filter((service) => {
      const hours = area.serviceHours[service.serviceKey];
      return Boolean(hours?.start || hours?.end);
    });
    if (!configured.length) return t('Uses restaurant hours');
    return configured
      .map((service) => {
        const hours = area.serviceHours[service.serviceKey];
        return `${service.name} ${hours?.start || '—'}–${hours?.end || '—'}`;
      })
      .join(' · ');
  }

  function groupedAreas(rows: AreaDraft[]): AreaGroup[] {
    if (!view.grouping) return [{ key: 'all', label: '', color: '', rows }];
    const groups = new Map<string, AreaGroup>();
    for (const area of rows) {
      const stable = placement(area);
      const key =
        view.groupBy === 'floor'
          ? `floor:${stable.floorLevel ?? 'unset'}`
          : stable.active
            ? 'active'
            : 'archived';
      const label =
        view.groupBy === 'floor'
          ? floorLabel(stable.floorLevel)
          : t(stable.active ? 'Active' : 'Archived');
      const color =
        view.groupBy === 'status'
          ? stable.active
            ? 'var(--cl-ok)'
            : 'var(--cl-muted)'
          : '';
      const group = groups.get(key) ?? { key, label, color, rows: [] };
      group.rows.push(area);
      groups.set(key, group);
    }
    return [...groups.values()].sort((left, right) => left.label.localeCompare(right.label));
  }

  function floorPlanGroups(rows: AreaDraft[]): AreaGroup[] {
    const groups = new Map<string, AreaGroup>();
    for (const area of rows) {
      const stable = placement(area);
      const key = `floor:${stable.floorLevel ?? 'unset'}`;
      const group = groups.get(key) ?? {
        key,
        label: floorLabel(stable.floorLevel),
        color: '',
        rows: []
      };
      group.rows.push(area);
      groups.set(key, group);
    }
    return [...groups.values()]
      .map((group) => ({
        ...group,
        rows: group.rows.toSorted((left, right) =>
          placement(left).name.localeCompare(placement(right).name)
        )
      }))
      .toSorted((left, right) => {
        const leftFloor = placement(left.rows[0])?.floorLevel ?? Number.MAX_SAFE_INTEGER;
        const rightFloor = placement(right.rows[0])?.floorLevel ?? Number.MAX_SAFE_INTEGER;
        return leftFloor - rightFloor;
      });
  }

  async function editAreaFromCard(areaId: string): Promise<void> {
    workspaceLayout.set('rows');
    view.resetFilters();
    await tick();
    document.getElementById(`area-catalogue-${areaId}`)?.focus();
  }
</script>

{#if context}
  {@const rows = view.ordered(context.draft.areas.filter(matches), sortValue)}
  {@const groups = groupedAreas(rows)}
  {@const planGroups = floorPlanGroups(rows)}
  {@const statusValues = [
    { value: 'active', label: t('Active') },
    { value: 'archived', label: t('Archived') }
  ]}

  <WorkspaceTablePanel
    dirty={context.dirty}
    saving={context.saving}
    canSave={context.canSave}
    onsave={() => void context.save().catch(() => undefined)}
    ondiscard={context.discard}
  >
    {#snippet meta()}
      <span><i class="dot"></i>{t('{count} areas', { count: rows.length })}</span>
      <span><i class="dot is-green"></i>{t('{count} active', { count: rows.filter((area) => placement(area).active).length })}</span>
    {/snippet}
    {#snippet actions()}
      <a class="cl-btn" href="/restaurant/floor-plan">
        <MapIcon size={15} aria-hidden="true" />
        {t('Floor plan')}
      </a>
      <button
        class="cl-btn is-primary"
        type="button"
        disabled={workspace.isPreview}
        onclick={() => void addArea()}
      >
        <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>
        {t('Add area')}
      </button>
    {/snippet}
    {#snippet children()}
      {#if !workspaceLayout.cards}
      <div class="cl-tablewrap areas-table">
        <table class="cl-table cl-mobile-rows">
          <thead>
            <tr>
              <th class="cl-grip"><span class="sr-only">{t('Reorder')}</span></th>
              <th class="has-menu">
                <WorkspacePrimaryColMenu
                  label={t('Area')}
                  sortable
                  sortDir={view.sortDir('name')}
                  onsort={(dir) => view.setSort('name', dir)}
                  filterKind="text"
                  searchValue={view.search('name')}
                  onsearch={(value) => view.setSearch('name', value)}
                  groupValue={view.groupBy}
                  groupOptions={[
                    { value: 'none', label: t('No grouping') },
                    { value: 'floor', label: t('Floor') },
                    { value: 'status', label: t('Status') }
                  ]}
                  ongroupchange={(value) => view.setGroupBy(value as GroupBy)}
                />
              </th>
              {#if shown('hours')}
                <th class="has-menu">
                  <WorkspaceColMenu
                    label={t('Default hours')}
                    filterKind="text"
                    searchValue={view.search('hours')}
                    onsearch={(value) => view.setSearch('hours', value)}
                  />
                </th>
              {/if}
              {#if shown('positions')}
                <th class="has-menu">
                  <WorkspaceColMenu
                    label={t('Linked positions')}
                    sortable
                    sortDir={view.sortDir('positions')}
                    onsort={(dir) => view.setSort('positions', dir)}
                    filterKind="text"
                    searchValue={view.search('positions')}
                    onsearch={(value) => view.setSearch('positions', value)}
                  />
                </th>
              {/if}
              {#if shown('floor')}
                <th class="has-menu">
                  <WorkspaceColMenu
                    label={t('Floor')}
                    sortable
                    sortDir={view.sortDir('floor')}
                    onsort={(dir) => view.setSort('floor', dir)}
                    filterKind="text"
                    searchValue={view.search('floor')}
                    onsearch={(value) => view.setSearch('floor', value)}
                  />
                </th>
              {/if}
              {#if shown('notes')}
                <th class="has-menu">
                  <WorkspaceColMenu
                    label={t('Notes')}
                    filterKind="text"
                    searchValue={view.search('notes')}
                    onsearch={(value) => view.setSearch('notes', value)}
                  />
                </th>
              {/if}
              {#if shown('active')}
                <th class="has-menu">
                  <WorkspaceColMenu
                    label={t('Status')}
                    sortable
                    sortDir={view.sortDir('active')}
                    onsort={(dir) => view.setSort('active', dir)}
                    filterKind="values"
                    filterValues={statusValues}
                    selected={view.excluded('active')}
                    ontoggle={(value) => view.toggleValue('active', value)}
                    onselectall={(on) => view.selectAll('active', on, statusValues)}
                  />
                </th>
              {/if}
              <th class="chooser-col">
                <WorkspaceColChooser
                  columns={view.columns}
                  hidden={view.hidden}
                  ontoggle={view.toggleColumn}
                />
              </th>
            </tr>
          </thead>
          <tbody>
            {#if !rows.length}
              <tr class="cl-mobile-empty">
                <td colspan={colCount}>
                  <div class="cl-empty">
                    <strong>{t('No areas yet')}</strong>
                    <span>{t('Add the parts of the restaurant you plan and staff, such as Dining room, Bar or Kitchen.')}</span>
                  </div>
                </td>
              </tr>
            {:else}
              {#each groups as group (group.key)}
                {#if view.grouping}
                  <WorkspaceGroupRow
                    colspan={colCount}
                    label={group.label}
                    meta={t('{count} areas', { count: group.rows.length })}
                    color={group.color}
                    collapsed={view.isCollapsed(group.key)}
                    ontoggle={() => view.toggleGroup(group.key)}
                  />
                {/if}
                {#if !view.isCollapsed(group.key)}
                {#each group.rows as area (area.id)}
                {@const reorderable = !view.sort && !view.grouping}
                {@const linkedPositionRows = positionsForArea(area.id)}
                {@const linkedPositions = linkedPositionRows.length}
                <tr
                  class:is-new={!persistedAreaIds.has(area.id)}
                  draggable={reorderable && !workspace.isPreview}
                  ondragstart={() => (dragId = area.id)}
                  ondragend={() => (dragId = '')}
                  ondragover={(event) => {
                    if (reorderable) event.preventDefault();
                  }}
                  ondrop={() => moveArea(area.id)}
                >
                  <td class="cl-grip">
                    <button
                      type="button"
                      disabled={!reorderable || workspace.isPreview}
                      title={reorderable ? t('Drag to reorder') : t('Clear grouping and sorting to reorder')}
                      aria-label={t('Drag to reorder')}
                    >
                      <GripVertical size={16} />
                    </button>
                  </td>
                  <td class="cl-mobile-primary">
                    <div class="area-identity">
                      <WorkspaceAreaIcon
                        icon={area.iconKey}
                        color={area.color}
                        size={16}
                      />
                      <div class="area-identity__field">
                        <WorkspaceCataloguePicker
                          inputId={`area-catalogue-${area.id}`}
                          bind:value={area.name}
                          selectedKey={area.catalogueKey}
                          items={catalogueItems()}
                          placeholder={t('Select or type an area')}
                          label={t('Select or type an area')}
                          disabled={workspace.isPreview}
                          allLabel={t('All areas')}
                          customLabel={t('Custom area')}
                          browseLabel={t('Browse system areas')}
                          noMatchesLabel={t('No matching system areas')}
                          customDescription={t('Keep this area specific to your restaurant')}
                          formatCustomLabel={(name) =>
                            t('Use “{name}” as a custom area', { name })}
                          onvaluechange={(value) => typeName(area, value)}
                          onselect={(item) => selectCatalogue(area, item)}
                          oncustom={(value) => makeCustom(area, value)}
                        />
                        {#if instanceHint(area)}
                          <small>{instanceHint(area)}</small>
                        {/if}
                      </div>
                    </div>
                    <span class="cl-mobile-summary">
                      <span>{floorLabel(area.floorLevel)}</span>
                      <span>{t('{count} positions', { count: linkedPositions })}</span>
                      <span>{hoursSummary(area)}</span>
                      {#if !area.active}<span>{t('Archived')}</span>{/if}
                    </span>
                    <details class="area-mobile-details">
                      <summary>{t('Area details')}</summary>
                      <div class="area-mobile-details__body">
                        <label>
                          <span>{t('Floor')}</span>
                          <select class="cl-field" disabled={workspace.isPreview} value={String(area.floorLevel ?? '')} onchange={(event) => setFloor(area, event.currentTarget.value)}>
                            <option value="">{t('Not set')}</option>
                            <option value="-2">{t('Floor {level}', { level: -2 })}</option>
                            <option value="-1">{t('Basement')}</option>
                            <option value="0">{t('Ground floor')}</option>
                            <option value="1">{t('First floor')}</option>
                            <option value="2">{t('Second floor')}</option>
                            <option value="3">{t('Floor {level}', { level: '+3' })}</option>
                          </select>
                        </label>
                        <label>
                          <span>{t('Notes')}</span>
                          <input class="cl-field" disabled={workspace.isPreview} bind:value={area.notes} oninput={() => restaurantConfig.touch()} />
                        </label>
                        <div class="mobile-hours">
                          <span>{t('Default hours')}</span>
                          {#each activeServices as service (service.serviceKey)}
                            {@const hours = area.serviceHours[service.serviceKey]}
                            <div class="mobile-hours__row">
                              <span>{service.name}</span>
                              <WorkspaceTimeRange
                                bind:start={hours.start}
                                bind:end={hours.end}
                                startAriaLabel={`${service.name} ${t('Start')}`}
                                endAriaLabel={`${service.name} ${t('End')}`}
                                disabled={workspace.isPreview}
                                onchange={() => restaurantConfig.touch()}
                              />
                            </div>
                          {/each}
                        </div>
                      </div>
                    </details>
                  </td>
                  {#if shown('hours')}
                    <td>
                      <div class="area-hours">
                        {#each activeServices as service (service.serviceKey)}
                          {@const hours = area.serviceHours[service.serviceKey]}
                          <div class="area-hours__row" title={service.name}>
                            <span><WorkspaceServiceIcon service={service.serviceKey} size={12} />{service.name}</span>
                            <WorkspaceTimeRange
                              bind:start={hours.start}
                              bind:end={hours.end}
                              startAriaLabel={`${service.name} ${t('Start')}`}
                              endAriaLabel={`${service.name} ${t('End')}`}
                              disabled={workspace.isPreview}
                              onchange={() => restaurantConfig.touch()}
                            />
                          </div>
                        {/each}
                      </div>
                    </td>
                  {/if}
                  {#if shown('positions')}
                    <td>
                      <span class="position-stack" class:is-empty={!linkedPositions} title={positionSummary(area.id)}>
                        {#each linkedPositionRows.slice(0, 3) as position (position.id)}
                          <WorkspaceAreaIcon
                            icon={position.iconKey || 'support'}
                            color={positionColor.get(position.id) ?? area.color}
                            size={13}
                            compact
                          />
                        {/each}
                        <span>{positionSummary(area.id)}</span>
                      </span>
                    </td>
                  {/if}
                  {#if shown('floor')}
                    <td>
                      <select class="cl-field floor-select" disabled={workspace.isPreview} value={String(area.floorLevel ?? '')} onchange={(event) => setFloor(area, event.currentTarget.value)}>
                        <option value="">{t('Not set')}</option>
                        <option value="-2">{t('Floor {level}', { level: -2 })}</option>
                        <option value="-1">{t('Basement')}</option>
                        <option value="0">{t('Ground floor')}</option>
                        <option value="1">{t('First floor')}</option>
                        <option value="2">{t('Second floor')}</option>
                        <option value="3">{t('Floor {level}', { level: '+3' })}</option>
                      </select>
                    </td>
                  {/if}
                  {#if shown('notes')}
                    <td><input class="cl-field notes-field" disabled={workspace.isPreview} bind:value={area.notes} oninput={() => restaurantConfig.touch()} /></td>
                  {/if}
                  {#if shown('active')}
                    <td>
                      <WorkspaceToggle
                        checked={area.active}
                        label={area.active ? 'Active' : 'Archived'}
                        disabled={workspace.isPreview}
                        onchange={(active) => void setAreaActive(area, active)}
                      />
                    </td>
                  {/if}
                  <td class="menu-cell">
                    {#if !persistedAreaIds.has(area.id)}
                      <WorkspaceRowMenu
                        disabled={workspace.isPreview}
                        items={[{ label: t('Remove'), tone: 'danger', onselect: () => removeUnsaved(area.id) }]}
                      />
                    {/if}
                  </td>
                </tr>
              {/each}
                {/if}
              {/each}
            {/if}
          </tbody>
        </table>
      </div>
      {:else if planGroups.length}
        <div class="area-cards">
          {#each planGroups as group (group.key)}
            <section class="area-cards__floor" aria-label={group.label}>
              <header>
                <span>
                  <strong>{group.label}</strong>
                  <small>{group.rows.length === 1 ? t('1 area') : t('{count} areas', { count: group.rows.length })}</small>
                </span>
                <span class="area-cards__floor-line" aria-hidden="true"></span>
              </header>
              <div class="area-cards__grid">
                {#each group.rows as area (area.id)}
                  {@const stable = placement(area)}
                  {@const linkedPositionRows = positionsForArea(area.id)}
                  <button
                    class="area-tile"
                    class:is-archived={!stable.active}
                    style={`--area-tone:${stable.color || 'var(--cl-info)'}`}
                    type="button"
                    aria-label={`${stable.name}, ${positionSummary(area.id)}, ${hoursSummary(stable)}`}
                    onclick={() => void editAreaFromCard(area.id)}
                  >
                    <span class="area-tile__identity">
                      <WorkspaceAreaIcon
                        icon={stable.iconKey}
                        color={stable.color}
                        size={18}
                      />
                      <span>
                        <strong>{stable.name || t('New area')}</strong>
                        {#if instanceHint(stable)}<small>{instanceHint(stable)}</small>{/if}
                      </span>
                    </span>
                    <span class="area-tile__positions">
                      <span class="area-tile__state" class:is-archived={!stable.active}>
                        <i aria-hidden="true"></i>{t(stable.active ? 'Active' : 'Archived')}
                      </span>
                      <span class="area-tile__icons" aria-hidden="true">
                        {#each linkedPositionRows.slice(0, 4) as position (position.id)}
                          <WorkspaceAreaIcon
                            icon={position.iconKey || 'support'}
                            color={positionColor.get(position.id) ?? stable.color}
                            size={13}
                            compact
                          />
                        {/each}
                      </span>
                      <span>
                        <strong>{linkedPositionRows.length}</strong>
                        <small>{t(linkedPositionRows.length === 1 ? 'position' : 'positions')}</small>
                      </span>
                    </span>
                    <span class="area-tile__position-names" class:is-empty={!linkedPositionRows.length}>
                      {positionSummary(area.id)}
                    </span>
                    <span class="area-tile__hours">
                      {#each activeServices as service (service.serviceKey)}
                        {@const hours = stable.serviceHours[service.serviceKey]}
                        <span>
                          <WorkspaceServiceIcon service={service.serviceKey} size={12} />
                          <strong>{service.name}</strong>
                          <small>{hours?.start || '—'}–{hours?.end || '—'}</small>
                        </span>
                      {/each}
                    </span>
                  </button>
                {/each}
              </div>
            </section>
          {/each}
        </div>
      {:else}
        <div class="cl-empty">
          <strong>{t('No areas yet')}</strong>
          <span>{t('Add the parts of the restaurant you plan and staff, such as Dining room, Bar or Kitchen.')}</span>
        </div>
      {/if}
    {/snippet}
  </WorkspaceTablePanel>
{/if}

<style>
  .areas-table :global(.cl-table) {
    min-width: 980px;
  }

  .area-identity {
    min-width: 210px;
    display: grid;
    grid-template-columns: 34px minmax(0, 1fr);
    align-items: center;
    gap: 9px;
  }

  .area-identity__field {
    min-width: 0;
    display: grid;
    gap: 2px;
  }

  .area-identity__field small {
    overflow: hidden;
    color: var(--cl-muted);
    font-size: var(--rst-fs-caption);
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .area-hours {
    min-width: 286px;
    display: grid;
    gap: 4px;
  }

  .area-hours__row {
    display: grid;
    grid-template-columns: minmax(72px, 1fr) auto;
    align-items: center;
    gap: 5px;
  }

  .area-hours__row > span {
    min-width: 0;
    display: flex;
    align-items: center;
    gap: 5px;
    overflow: hidden;
    color: var(--cl-muted);
    font-size: var(--rst-fs-label);
    font-weight: var(--rst-fw-bold);
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .floor-select {
    width: 132px;
  }

  .notes-field {
    min-width: 180px;
  }

  .position-stack {
    min-width: 150px;
    display: flex;
    align-items: center;
    gap: 0;
  }

  .position-stack :global(.area-icon) {
    width: 25px;
    height: 25px;
    margin-right: -5px;
    border: 2px solid var(--cl-surface);
    border-radius: 6px;
  }

  .position-stack > span {
    min-width: 0;
    margin-left: 10px;
    overflow: hidden;
    color: var(--cl-data-text);
    font-size: var(--rst-fs-control);
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .position-stack.is-empty > span {
    margin-left: 0;
    color: var(--cl-muted);
  }

  .cl-grip {
    width: 34px;
    text-align: center;
  }

  .cl-grip button {
    width: 28px;
    height: 28px;
    display: inline-grid;
    place-items: center;
    border: 0;
    border-radius: 5px;
    color: var(--cl-muted);
    background: transparent;
    cursor: grab;
  }

  .cl-grip button:hover:not(:disabled) {
    color: var(--cl-ink);
    background: var(--cl-surface-muted);
  }

  .cl-grip button:disabled {
    cursor: default;
    opacity: 0.35;
  }

  .area-cards {
    display: grid;
    gap: 18px;
    padding: 18px;
  }

  .area-cards__floor {
    min-width: 0;
    display: grid;
    gap: 9px;
  }

  .area-cards__floor > header {
    min-height: 28px;
    display: grid;
    grid-template-columns: auto minmax(48px, 1fr);
    align-items: center;
    gap: 12px;
  }

  .area-cards__floor > header > span:first-child {
    display: flex;
    align-items: baseline;
    gap: 8px;
  }

  .area-cards__floor > header strong {
    color: var(--cl-ink);
    font-size: var(--rst-fs-control);
  }

  .area-cards__floor > header small {
    color: var(--cl-muted);
    font-size: var(--rst-fs-caption);
  }

  .area-cards__floor-line {
    height: 1px;
    background: linear-gradient(90deg, var(--cl-line-strong), transparent);
  }

  .area-cards__grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(245px, 1fr));
    gap: 10px;
  }

  .area-tile {
    --area-tone: var(--cl-info);
    position: relative;
    min-width: 0;
    min-height: 154px;
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    grid-template-rows: auto auto 1fr;
    gap: 10px 12px;
    overflow: hidden;
    padding: 14px;
    border: 1px solid color-mix(in srgb, var(--area-tone) 28%, var(--cl-line));
    border-radius: var(--cl-radius);
    color: var(--cl-ink);
    background:
      linear-gradient(135deg, color-mix(in srgb, var(--area-tone) 7%, var(--cl-surface)) 0 58%, var(--cl-surface) 58% 100%);
    box-shadow: inset 0 3px 0 var(--area-tone), 0 1px 2px rgba(15, 23, 42, 0.04);
    font: inherit;
    text-align: left;
    cursor: pointer;
    transition:
      border-color var(--cl-dur) var(--cl-ease),
      box-shadow var(--cl-dur) var(--cl-ease),
      transform var(--cl-dur) var(--cl-ease);
  }

  .area-tile:hover {
    border-color: color-mix(in srgb, var(--area-tone) 52%, var(--cl-line));
    box-shadow: inset 0 3px 0 var(--area-tone), 0 5px 14px rgba(15, 23, 42, 0.08);
    transform: translateY(-1px);
  }

  .area-tile:focus-visible {
    outline: 2px solid color-mix(in srgb, var(--area-tone) 52%, transparent);
    outline-offset: 2px;
  }

  .area-tile.is-archived {
    opacity: 0.62;
    filter: saturate(0.55);
  }

  .area-tile__identity {
    min-width: 0;
    display: grid;
    grid-template-columns: auto minmax(0, 1fr);
    align-items: center;
    gap: 9px;
  }

  .area-tile__identity > span:last-child {
    min-width: 0;
    display: grid;
    gap: 2px;
  }

  .area-tile__identity strong,
  .area-tile__identity small {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .area-tile__state {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    padding: 3px 7px;
    border: 1px solid color-mix(in srgb, var(--cl-ok) 24%, var(--cl-line));
    border-radius: var(--rst-ui-radius-pill);
    color: var(--cl-ok);
    background: color-mix(in srgb, var(--cl-ok) 8%, var(--cl-surface));
    font-size: var(--rst-fs-micro);
    font-weight: var(--rst-fw-bold);
    white-space: nowrap;
  }

  .area-tile__positions > .area-tile__state {
    grid-column: 1 / -1;
    justify-self: end;
  }

  .area-tile__state i {
    width: 5px;
    height: 5px;
    border-radius: 50%;
    background: currentColor;
  }

  .area-tile__state.is-archived {
    border-color: var(--cl-line);
    color: var(--cl-muted);
    background: var(--cl-surface-muted);
  }

  .area-tile__identity strong {
    font-size: var(--rst-fs-body);
  }

  .area-tile__identity small {
    color: var(--cl-muted);
    font-size: var(--rst-fs-micro);
  }

  .area-tile__positions {
    display: grid;
    grid-template-columns: auto auto;
    align-items: center;
    justify-content: flex-end;
    gap: 5px 8px;
  }

  .area-tile__position-names {
    min-width: 0;
    align-self: center;
    overflow: hidden;
    color: var(--cl-data-text);
    font-size: var(--rst-fs-label);
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .area-tile__position-names.is-empty { color: var(--cl-muted); }

  .area-tile__positions > span:last-child {
    display: grid;
    gap: 1px;
    text-align: right;
  }

  .area-tile__positions strong {
    font-size: var(--rst-fs-body);
    font-variant-numeric: tabular-nums;
  }

  .area-tile__positions small {
    color: var(--cl-muted);
    font-size: var(--rst-fs-micro);
  }

  .area-tile__icons {
    display: flex;
    align-items: center;
  }

  .area-tile__icons :global(.area-icon) {
    width: 24px;
    height: 24px;
    margin-right: -6px;
    border: 2px solid var(--cl-surface);
    border-radius: 6px;
  }

  .area-tile__hours {
    grid-column: 1 / -1;
    align-self: end;
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(112px, 1fr));
    gap: 6px;
  }

  .area-tile__hours > span {
    min-width: 0;
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto;
    align-items: center;
    gap: 5px;
    padding: 6px 7px;
    border: 1px solid color-mix(in srgb, var(--area-tone) 16%, var(--cl-line));
    border-radius: 5px;
    background: color-mix(in srgb, var(--cl-surface) 78%, transparent);
  }

  .area-tile__hours strong,
  .area-tile__hours small {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .area-tile__hours strong {
    font-size: var(--rst-fs-caption);
  }

  .area-tile__hours small {
    color: var(--cl-muted);
    font-size: var(--rst-fs-micro);
    font-variant-numeric: tabular-nums;
  }

  .area-mobile-details {
    display: none;
  }

  @media (max-width: 760px) {
    .area-cards {
      gap: 14px;
      padding: 12px;
    }

    .area-cards__grid {
      grid-template-columns: 1fr;
    }

    .areas-table :global(.cl-table) {
      min-width: 0;
    }

    .area-identity {
      min-width: 0;
    }

    .area-mobile-details {
      display: block;
      margin-top: 3px;
      border-top: 1px solid var(--cl-line);
    }

    .area-mobile-details summary {
      padding-top: 8px;
      color: var(--cl-accent);
      font-size: var(--rst-fs-label);
      font-weight: var(--rst-fw-bold);
      cursor: pointer;
    }

    .area-mobile-details__body {
      display: grid;
      gap: 10px;
      padding: 10px 0 3px;
    }

    .area-mobile-details__body > label {
      display: grid;
      gap: 4px;
      color: var(--cl-muted);
      font-size: var(--rst-fs-label);
      font-weight: var(--rst-fw-bold);
    }

    .mobile-hours {
      display: grid;
      gap: 5px;
    }

    .mobile-hours > span {
      color: var(--cl-muted);
      font-size: var(--rst-fs-label);
      font-weight: var(--rst-fw-bold);
    }

    .mobile-hours__row {
      display: grid;
      grid-template-columns: minmax(62px, 1fr) auto;
      align-items: center;
      gap: 5px;
      color: var(--cl-muted);
      font-size: var(--rst-fs-label);
    }
  }
</style>
