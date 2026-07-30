<script lang="ts">
  import { onMount, tick } from 'svelte';
  import { GripVertical } from '@lucide/svelte';
  import { t } from '$lib/i18n/i18n.svelte';
  import { confirmAction } from '$lib/ui/confirm.svelte';
  import { defaultAreaColor } from '$lib/ui/position-color';
  import { workspace } from '$lib/workspace/workspace.svelte';
  import { useWorkspaceRestaurantContext } from '$lib/workspace-ui/workspace-context';
  import { restaurantConfig } from '$lib/workspace-ui/workspace-restaurant.svelte';
  import { createTableView } from '$lib/workspace-ui/table-view.svelte';
  import WorkspaceCellBadge from '$lib/workspace-ui/WorkspaceCellBadge.svelte';
  import WorkspaceColChooser from '$lib/workspace-ui/WorkspaceColChooser.svelte';
  import WorkspaceColMenu from '$lib/workspace-ui/WorkspaceColMenu.svelte';
  import WorkspacePrimaryColMenu from '$lib/workspace-ui/WorkspacePrimaryColMenu.svelte';
  import WorkspaceRowMenu from '$lib/workspace-ui/WorkspaceRowMenu.svelte';
  import WorkspaceServiceIcon from '$lib/workspace-ui/WorkspaceServiceIcon.svelte';
  import WorkspaceTablePanel from '$lib/workspace-ui/WorkspaceTablePanel.svelte';
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
  type GroupBy = 'none';

  const OPTIONAL_COLUMNS = [
    { key: 'hours', label: 'Default hours' },
    { key: 'positions', label: 'Linked positions' },
    { key: 'floor', label: 'Floor' },
    { key: 'notes', label: 'Notes' },
    { key: 'active', label: 'Status' }
  ] as const;

  const view = createTableView<SortKey, GroupBy>({
    storageKey: 'rst-restaurant-areas-cols-v1',
    columns: OPTIONAL_COLUMNS,
    defaultHidden: ['notes'],
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

  function positionCount(areaId: string): number {
    return context?.draft.jobFunctions.filter(
      (position) => position.active && position.areaIds.includes(areaId)
    ).length ?? 0;
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

  async function toggleArea(area: AreaDraft): Promise<void> {
    if (!context || workspace.isPreview) return;
    if (!persistedAreaIds.has(area.id)) {
      removeUnsaved(area.id);
      return;
    }
    if (!area.active) {
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
    if (!context || !dragId || dragId === targetId || view.sort) return;
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
</script>

{#if context}
  {@const rows = view.ordered(context.draft.areas.filter(matches), sortValue)}
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
                />
              </th>
              {#if shown('hours')}<th>{t('Default hours')}</th>{/if}
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
              {#if shown('notes')}<th>{t('Notes')}</th>{/if}
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
              {#each rows as area (area.id)}
                {@const reorderable = !view.sort}
                {@const linkedPositions = positionCount(area.id)}
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
                      title={reorderable ? t('Drag to reorder') : t('Clear sorting to reorder')}
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
                            <label>
                              <span>{service.name}</span>
                              <input class="cl-field" type="time" disabled={workspace.isPreview} bind:value={hours.start} oninput={() => restaurantConfig.touch()} />
                              <i>–</i>
                              <input class="cl-field" type="time" disabled={workspace.isPreview} bind:value={hours.end} oninput={() => restaurantConfig.touch()} />
                            </label>
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
                          <label title={service.name}>
                            <span><WorkspaceServiceIcon service={service.serviceKey} size={12} />{service.name}</span>
                            <input class="cl-field" type="time" disabled={workspace.isPreview} bind:value={hours.start} oninput={() => restaurantConfig.touch()} />
                            <i>–</i>
                            <input class="cl-field" type="time" disabled={workspace.isPreview} bind:value={hours.end} oninput={() => restaurantConfig.touch()} />
                          </label>
                        {/each}
                      </div>
                    </td>
                  {/if}
                  {#if shown('positions')}
                    <td>
                      <span class="cl-linkcount" class:is-zero={!linkedPositions} title={t('{count} positions', { count: linkedPositions })}>
                        <span class="cl-linkcount__n">{linkedPositions}</span>
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
                    <td><WorkspaceCellBadge label={area.active ? 'Active' : 'Archived'} tone={area.active ? 'success' : 'neutral'} icon={area.active ? 'check' : 'minus'} /></td>
                  {/if}
                  <td class="menu-cell">
                    <WorkspaceRowMenu
                      disabled={workspace.isPreview}
                      items={[
                        ...(persistedAreaIds.has(area.id)
                          ? area.active
                            ? [{ label: t('Archive'), tone: 'danger' as const, onselect: () => void toggleArea(area) }]
                            : [{ label: t('Restore'), onselect: () => void toggleArea(area) }]
                          : [{ label: t('Remove'), tone: 'danger' as const, onselect: () => void toggleArea(area) }])
                      ]}
                    />
                  </td>
                </tr>
              {/each}
            {/if}
          </tbody>
        </table>
      </div>
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
    font-size: 10px;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .area-hours {
    min-width: 286px;
    display: grid;
    gap: 4px;
  }

  .area-hours label {
    display: grid;
    grid-template-columns: minmax(72px, 1fr) 78px 8px 78px;
    align-items: center;
    gap: 5px;
  }

  .area-hours label > span {
    min-width: 0;
    display: flex;
    align-items: center;
    gap: 5px;
    overflow: hidden;
    color: var(--cl-muted);
    font-size: 11px;
    font-weight: var(--rst-fw-bold);
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .area-hours .cl-field {
    min-width: 0;
    height: 29px;
    padding: 3px 5px;
    font-size: 11px;
  }

  .area-hours i {
    color: var(--cl-muted);
    font-style: normal;
    text-align: center;
  }

  .floor-select {
    width: 132px;
  }

  .notes-field {
    min-width: 180px;
  }

  .sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
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

  .area-mobile-details {
    display: none;
  }

  @media (max-width: 760px) {
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
      font-size: 11px;
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
      font-size: 11px;
      font-weight: var(--rst-fw-bold);
    }

    .mobile-hours {
      display: grid;
      gap: 5px;
    }

    .mobile-hours > span {
      color: var(--cl-muted);
      font-size: 11px;
      font-weight: var(--rst-fw-bold);
    }

    .mobile-hours label {
      display: grid;
      grid-template-columns: minmax(62px, 1fr) 86px 8px 86px;
      align-items: center;
      gap: 5px;
      color: var(--cl-muted);
      font-size: 11px;
    }

    .mobile-hours i {
      font-style: normal;
      text-align: center;
    }
  }
</style>
