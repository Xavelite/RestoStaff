<script lang="ts">
  import { onMount } from 'svelte';
  import { t } from '$lib/i18n/i18n.svelte';
  import { useClassicRestaurantContext } from '$lib/classic/classic-workspace-context';
  import ClassicTablePanel from '$lib/classic/ClassicTablePanel.svelte';
  import ClassicColMenu from '$lib/classic/ClassicColMenu.svelte';
  import ClassicPrimaryColMenu from '$lib/classic/ClassicPrimaryColMenu.svelte';
  import ClassicGroupRow from '$lib/classic/ClassicGroupRow.svelte';
  import ClassicColChooser from '$lib/classic/ClassicColChooser.svelte';
  import ClassicPalettePicker from '$lib/classic/ClassicPalettePicker.svelte';
  import { restaurantConfig } from '$lib/classic/classic-restaurant.svelte';
  import ReservationFloorPlansWorkspace from '$lib/reservations/ReservationFloorPlansWorkspace.svelte';
  import { workspace } from '$lib/workspace/workspace.svelte';
  import { AREA_PALETTE, buildPositionColorMap, defaultAreaColor } from '$lib/ui/position-color';

  type SortKey = 'name' | 'lunch' | 'evening' | 'positions' | 'notes' | 'active';
  type GroupBy = 'status' | 'service' | 'none';
  const positionColor = $derived(
    buildPositionColorMap(
      restaurantConfig.draft?.jobFunctions ?? [],
      restaurantConfig.draft?.areas ?? []
    )
  );

  let search = $state('');
  let sort = $state<{ key: SortKey; dir: 'asc' | 'desc' } | null>(null);
  let excludedStatus = $state(new Set<string>());
  let excludedLunch = $state(new Set<string>());
  let excludedEvening = $state(new Set<string>());
  let positionsSearch = $state('');
  let notesSearch = $state('');
  let groupBy = $state<GroupBy>('none');
  let collapsedGroups = $state<string[]>([]);
  let dragId = $state('');

  const OPTIONAL_COLUMNS = [
    { key: 'lunch', label: 'Lunch' },
    { key: 'evening', label: 'Evening' },
    { key: 'positions', label: 'Positions' },
    { key: 'notes', label: 'Notes' },
    { key: 'active', label: 'Status' }
  ] as const;
  const COLS_KEY = 'rst-restaurant-areas-cols-v2';
  let hidden = $state(new Set<string>());

  onMount(() => {
    try {
      const raw = localStorage.getItem(COLS_KEY);
      if (raw) hidden = new Set(JSON.parse(raw) as string[]);
    } catch {
      hidden = new Set();
    }
  });
  function toggleColumn(key: string) {
    const next = new Set(hidden);
    next.has(key) ? next.delete(key) : next.add(key);
    const hiding = next.has(key);
    if (hiding && sort?.key === key) sort = null;
    if (key === 'lunch' && hiding) excludedLunch = new Set();
    if (key === 'evening' && hiding) excludedEvening = new Set();
    if (key === 'positions' && hiding) positionsSearch = '';
    if (key === 'notes' && hiding) notesSearch = '';
    if (key === 'active' && hiding) excludedStatus = new Set();
    hidden = next;
    try { localStorage.setItem(COLS_KEY, JSON.stringify([...next])); } catch {}
  }
  const shown = (key: string) => !hidden.has(key);
  const colCount = $derived(5 + OPTIONAL_COLUMNS.filter((column) => shown(column.key)).length);
  const persistedAreaIds = $derived(new Set((workspace.restaurant?.work_areas ?? []).map((area) => area.id)));

  const positionsByArea = $derived.by(() => {
    const draft = restaurantConfig.draft;
    const jobName = new Map((draft?.jobFunctions ?? []).map((job) => [job.id, job.name]));
    const map = new Map<string, { id: string; name: string }[]>();
    for (const item of draft?.coverage ?? []) {
      if (!item.requiredCount) continue;
      const list = map.get(item.areaId) ?? [];
      if (!list.some((entry) => entry.id === item.jobFunctionId)) {
        list.push({ id: item.jobFunctionId, name: jobName.get(item.jobFunctionId) || t('Unnamed position') });
      }
      map.set(item.areaId, list);
    }
    return map;
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

  function serviceState(area: { lunchStart: string; lunchEnd: string; eveningStart: string; eveningEnd: string }): string {
    const lunch = Boolean(area.lunchStart && area.lunchEnd);
    const evening = Boolean(area.eveningStart && area.eveningEnd);
    if (lunch && evening) return 'both';
    if (lunch) return 'lunch';
    if (evening) return 'evening';
    return 'none';
  }

  function serviceStateLabel(value: string): string {
    if (value === 'both') return t('Lunch and evening');
    if (value === 'lunch') return t('Lunch only');
    if (value === 'evening') return t('Evening only');
    return t('No service hours');
  }

  function addArea() {
    const draft = restaurantConfig.draft;
    if (!draft) return;
    draft.areas = [
      {
        id: crypto.randomUUID(),
        name: '',
        code: '',
        notes: '',
        active: true,
        lunchStart: '',
        lunchEnd: '',
        eveningStart: '',
        eveningEnd: '',
        color: defaultAreaColor(draft.areas.length)
      },
      ...draft.areas
    ];
    restaurantConfig.touch();
  }

  function removeOrToggleArea(areaId: string) {
    const draft = restaurantConfig.draft;
    if (!draft || workspace.isPreview) return;
    const area = draft.areas.find((item) => item.id === areaId);
    if (!area) return;
    if (persistedAreaIds.has(areaId)) {
      area.active = !area.active;
    } else {
      draft.areas = draft.areas.filter((item) => item.id !== areaId);
      draft.coverage = draft.coverage.filter((item) => item.areaId !== areaId);
    }
    restaurantConfig.touch();
  }

  function moveArea(targetId: string) {
    const draft = restaurantConfig.draft;
    if (!draft || !dragId || dragId === targetId || sort || groupBy !== 'none') return;
    const from = draft.areas.findIndex((item) => item.id === dragId);
    const to = draft.areas.findIndex((item) => item.id === targetId);
    if (from < 0 || to < 0) return;
    const next = [...draft.areas];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    draft.areas = next;
    dragId = '';
    restaurantConfig.touch();
  }

  function matches(area: { id: string; name: string; notes: string; active: boolean; lunchStart: string; lunchEnd: string; eveningStart: string; eveningEnd: string }) {
    const term = search.trim().toLowerCase();
    if (excludedStatus.has(area.active ? 'active' : 'archived')) return false;
    if (excludedLunch.has(area.lunchStart && area.lunchEnd ? 'configured' : 'not_configured')) return false;
    if (excludedEvening.has(area.eveningStart && area.eveningEnd ? 'configured' : 'not_configured')) return false;
    if (positionsSearch.trim() && !String(positionsByArea.get(area.id)?.length ?? 0).includes(positionsSearch.trim())) return false;
    if (notesSearch.trim() && !area.notes.toLowerCase().includes(notesSearch.trim().toLowerCase())) return false;
    return !term || `${area.name} ${area.notes}`.toLowerCase().includes(term);
  }
  function sortValue(area: { name: string; lunchStart: string; lunchEnd: string; eveningStart: string; eveningEnd: string; notes: string; active: boolean; id: string }) {
    switch (sort?.key) {
      case 'name': return area.name.toLowerCase();
      case 'lunch': return `${area.lunchStart}-${area.lunchEnd}`;
      case 'evening': return `${area.eveningStart}-${area.eveningEnd}`;
      case 'positions': return `${positionsByArea.get(area.id)?.length ?? 0}`.padStart(4, '0');
      case 'notes': return area.notes.toLowerCase();
      case 'active': return area.active ? '0' : '1';
      default: return area.name.toLowerCase();
    }
  }
  function orderedAreas<T extends { name: string; lunchStart: string; lunchEnd: string; eveningStart: string; eveningEnd: string; notes: string; active: boolean; id: string }>(rows: T[]): T[] {
    const activeSort = sort;
    if (!activeSort) return rows;
    const factor = activeSort.dir === 'desc' ? -1 : 1;
    return [...rows].sort((a, b) => factor * sortValue(a).localeCompare(sortValue(b)));
  }

  function groupedAreas<T extends { id: string; active: boolean; lunchStart: string; lunchEnd: string; eveningStart: string; eveningEnd: string }>(rows: T[]): { key: string; label: string; rows: T[] }[] {
    if (groupBy === 'none') return [{ key: 'all', label: '', rows }];
    const groups = new Map<string, { key: string; label: string; rows: T[] }>();
    for (const area of rows) {
      const key = groupBy === 'status' ? (area.active ? 'active' : 'archived') : serviceState(area);
      const label = groupBy === 'status' ? t(area.active ? 'Active' : 'Archived') : serviceStateLabel(key);
      const group = groups.get(key) ?? { key, label, rows: [] };
      group.rows.push(area);
      groups.set(key, group);
    }
    return [...groups.values()].sort((left, right) => left.label.localeCompare(right.label));
  }


  const readRestaurantContext = useClassicRestaurantContext();
  const context = $derived(readRestaurantContext());
</script>

<svelte:head><title>{t('Areas')} &middot; restogogo</title></svelte:head>

{#if context}
  {@const draft = context.draft}
    {@const rows = [...draft.areas].filter(matches)}
    {@const ordered = orderedAreas(rows)}
    {@const groups = groupedAreas(ordered)}
    {@const configuredValues = [{ value: 'configured', label: t('Configured') }, { value: 'not_configured', label: t('Not configured') }]}
  <ReservationFloorPlansWorkspace mode="venue" />

  <ClassicTablePanel dirty={context.dirty} saving={context.saving} canSave={context.canSave} onsave={() => void context.save().catch(() => undefined)} ondiscard={context.discard}>
      {#snippet meta()}
        <span><i class="dot"></i>{t('{count} areas', { count: rows.length })}</span>
        <span><i class="dot is-green"></i>{t('{count} active', { count: rows.filter((area) => area.active).length })}</span>
      {/snippet}
      {#snippet actions()}
        <button class="cl-btn is-primary" type="button" disabled={workspace.isPreview || !restaurantConfig.draft} onclick={addArea}><svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>{t('Add area')}</button>
      {/snippet}
      {#snippet children()}
      <div class="cl-tablewrap">
        <table class="cl-table">
          <thead>
            <tr>
              <th class="cl-grip"><span class="sr-only">{t('Reorder')}</span></th>
              <th class="swatch-col"><span class="sr-only">{t('Colour')}</span></th>
              <th class="has-menu"><ClassicPrimaryColMenu label={t('Name')} sortable sortDir={sort?.key === 'name' ? sort.dir : null} onsort={(dir) => (sort = { key: 'name', dir })} filterKind="text" searchValue={search} onsearch={(value) => (search = value)} groupValue={groupBy} groupOptions={[{ value: 'none', label: t('No grouping') }, { value: 'status', label: t('Status') }, { value: 'service', label: t('Service hours') }]} ongroupchange={(value) => setGroupBy(value as GroupBy)} /></th>
              {#if shown('lunch')}<th class="has-menu"><ClassicColMenu label={t('Lunch')} sortable sortDir={sort?.key === 'lunch' ? sort.dir : null} onsort={(dir) => (sort = { key: 'lunch', dir })} filterKind="values" filterValues={configuredValues} selected={excludedLunch} ontoggle={(value) => { const next = new Set(excludedLunch); next.has(value) ? next.delete(value) : next.add(value); excludedLunch = next; }} onselectall={(on) => (excludedLunch = on ? new Set() : new Set(configuredValues.map((item) => item.value)))} /></th>{/if}
              {#if shown('evening')}<th class="has-menu"><ClassicColMenu label={t('Evening')} sortable sortDir={sort?.key === 'evening' ? sort.dir : null} onsort={(dir) => (sort = { key: 'evening', dir })} filterKind="values" filterValues={configuredValues} selected={excludedEvening} ontoggle={(value) => { const next = new Set(excludedEvening); next.has(value) ? next.delete(value) : next.add(value); excludedEvening = next; }} onselectall={(on) => (excludedEvening = on ? new Set() : new Set(configuredValues.map((item) => item.value)))} /></th>{/if}
              {#if shown('positions')}<th class="has-menu"><ClassicColMenu label={t('Positions')} sortable sortDir={sort?.key === 'positions' ? sort.dir : null} onsort={(dir) => (sort = { key: 'positions', dir })} filterKind="text" searchValue={positionsSearch} onsearch={(value) => (positionsSearch = value)} /></th>{/if}
              {#if shown('notes')}<th class="has-menu"><ClassicColMenu label={t('Notes')} sortable sortDir={sort?.key === 'notes' ? sort.dir : null} onsort={(dir) => (sort = { key: 'notes', dir })} filterKind="text" searchValue={notesSearch} onsearch={(value) => (notesSearch = value)} /></th>{/if}
              {#if shown('active')}<th class="has-menu"><ClassicColMenu label={t('Status')} sortable sortDir={sort?.key === 'active' ? sort.dir : null} onsort={(dir) => (sort = { key: 'active', dir })} filterKind="values" filterValues={[{ value: 'active', label: t('Active') }, { value: 'archived', label: t('Archived') }]} selected={excludedStatus} ontoggle={(value) => (excludedStatus = (() => { const next = new Set(excludedStatus); next.has(value) ? next.delete(value) : next.add(value); return next; })())} onselectall={(on) => (excludedStatus = on ? new Set() : new Set(['active', 'archived']))} /></th>{/if}
              <th class="actions-col">{t('Actions')}</th>
              <th class="chooser-col"><ClassicColChooser columns={OPTIONAL_COLUMNS.map((column) => ({ key: column.key, label: t(column.label) }))} {hidden} ontoggle={toggleColumn} /></th>
            </tr>
          </thead>
          {#if !ordered.length}
            <tbody><tr><td colspan={colCount}><div class="cl-empty"><strong>{t('No areas yet')}</strong><span>{t('Add the parts of the house you plan for, such as Hall, Bar or Kitchen.')}</span></div></td></tr></tbody>
          {:else}
            {#each groups as group (group.key)}
              <tbody>
                {#if groupBy !== 'none'}<ClassicGroupRow colspan={colCount} label={group.label} meta={t('{count} areas', { count: group.rows.length })} collapsed={collapsedGroups.includes(group.key)} ontoggle={() => toggleGroup(group.key)} />{/if}
                {#if !collapsedGroups.includes(group.key)}
              {#each group.rows as area (area.id)}
                {@const positions = positionsByArea.get(area.id) ?? []}
                <tr draggable={!sort && groupBy === 'none' && !workspace.isPreview} ondragstart={() => (dragId = area.id)} ondragend={() => (dragId = '')} ondragover={(event) => { if (!sort && groupBy === 'none') event.preventDefault(); }} ondrop={() => moveArea(area.id)}>
                  <td class="cl-grip"><button type="button" disabled={Boolean(sort) || groupBy !== 'none' || workspace.isPreview} title={sort ? t('Clear sorting to reorder') : groupBy !== 'none' ? t('Clear grouping to reorder') : t('Drag to reorder')} aria-label={t('Drag to reorder')}>⋮⋮</button></td>
                  <td class="swatch-col"><ClassicPalettePicker value={area.color} palette={AREA_PALETTE} label={t('Choose area colour')} disabled={workspace.isPreview} onselect={(color) => { area.color = color; restaurantConfig.touch(); }} /></td>
                  <td><input class="cl-field" placeholder={t('Area name')} disabled={workspace.isPreview} bind:value={area.name} oninput={() => restaurantConfig.touch()} /></td>
                  {#if shown('lunch')}<td><span class="range"><input class="cl-field time" type="time" disabled={workspace.isPreview} bind:value={area.lunchStart} oninput={() => restaurantConfig.touch()} /><i>–</i><input class="cl-field time" type="time" disabled={workspace.isPreview} bind:value={area.lunchEnd} oninput={() => restaurantConfig.touch()} /></span></td>{/if}
                  {#if shown('evening')}<td><span class="range"><input class="cl-field time" type="time" disabled={workspace.isPreview} bind:value={area.eveningStart} oninput={() => restaurantConfig.touch()} /><i>–</i><input class="cl-field time" type="time" disabled={workspace.isPreview} bind:value={area.eveningEnd} oninput={() => restaurantConfig.touch()} /></span></td>{/if}
                  {#if shown('positions')}<td>{#if positions.length}<span class="cl-chips">{#each positions as position (position.id)}<span class="cl-chip" style="--chip:{positionColor.get(position.id) ?? 'var(--cl-line-strong)'}"><span>{position.name}</span></span>{/each}</span>{:else}<span class="cl-chips__empty">{t('No coverage yet')}</span>{/if}</td>{/if}
                  {#if shown('notes')}<td><input class="cl-field" disabled={workspace.isPreview} bind:value={area.notes} oninput={() => restaurantConfig.touch()} /></td>{/if}
                  {#if shown('active')}<td><label class="switch"><input type="checkbox" disabled={workspace.isPreview} bind:checked={area.active} onchange={() => restaurantConfig.touch()} /><span>{t(area.active ? 'Active' : 'Archived')}</span></label></td>{/if}
                  <td class="row-actions"><button class="cl-text-action" type="button" disabled={workspace.isPreview} onclick={() => removeOrToggleArea(area.id)}>{t(persistedAreaIds.has(area.id) ? (area.active ? 'Archive' : 'Restore') : 'Remove')}</button></td>
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
  .range { display: inline-flex; align-items: center; gap: 8px; }
  .range i { color: var(--cl-muted); font-style: normal; }
  .time { width: 116px; }
  .switch { display: inline-flex; align-items: center; gap: 8px; font-size: 14px; }
  .switch input { width: 16px; height: 16px; accent-color: var(--cl-accent); }
  .swatch-col { width: 34px; padding-right: 0 !important; }
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
