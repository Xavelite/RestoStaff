<script lang="ts">
  import { onMount } from 'svelte';
  import { t } from '$lib/i18n/i18n.svelte';
  import ClassicRestaurantPage from '$lib/classic/ClassicRestaurantPage.svelte';
  import ClassicTablePanel from '$lib/classic/ClassicTablePanel.svelte';
  import ClassicColMenu from '$lib/classic/ClassicColMenu.svelte';
  import ClassicColChooser from '$lib/classic/ClassicColChooser.svelte';
  import { restaurantConfig } from '$lib/classic/classic-restaurant.svelte';
  import { workspace } from '$lib/workspace/workspace.svelte';
  import { buildAreaColorMap, buildPositionColorMap } from '$lib/ui/position-color';

  type SortKey = 'name' | 'lunch' | 'evening' | 'positions' | 'notes' | 'active';
  const areaColor = $derived(buildAreaColorMap(workspace.restaurant?.work_areas ?? []));
  const positionColor = $derived(buildPositionColorMap(workspace.restaurant?.job_functions ?? []));

  let search = $state('');
  let sort = $state<{ key: SortKey; dir: 'asc' | 'desc' } | null>(null);
  let excludedStatus = $state(new Set<string>());
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
    if (key === 'active' && hiding) excludedStatus = new Set();
    hidden = next;
    try { localStorage.setItem(COLS_KEY, JSON.stringify([...next])); } catch {}
  }
  const shown = (key: string) => !hidden.has(key);
  const colCount = $derived(4 + OPTIONAL_COLUMNS.filter((column) => shown(column.key)).length);

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
        eveningEnd: ''
      },
      ...draft.areas
    ];
    restaurantConfig.touch();
  }

  function moveArea(targetId: string) {
    const draft = restaurantConfig.draft;
    if (!draft || !dragId || dragId === targetId || sort) return;
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

  function matches(area: { name: string; notes: string; active: boolean }) {
    const term = search.trim().toLowerCase();
    if (excludedStatus.has(area.active ? 'active' : 'archived')) return false;
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

</script>

<svelte:head><title>{t('Areas')} &middot; restogogo</title></svelte:head>

<ClassicRestaurantPage>
  {#snippet children(context)}
    {@const draft = context.draft}
    {@const rows = [...draft.areas].filter(matches)}
    {@const ordered = orderedAreas(rows)}
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
              <th class="has-menu"><ClassicColMenu label={t('Name')} sortable sortDir={sort?.key === 'name' ? sort.dir : null} onsort={(dir) => (sort = { key: 'name', dir })} filterKind="text" searchValue={search} onsearch={(value) => (search = value)} /></th>
              {#if shown('lunch')}<th class="has-menu"><ClassicColMenu label={t('Lunch')} sortable sortDir={sort?.key === 'lunch' ? sort.dir : null} onsort={(dir) => (sort = { key: 'lunch', dir })} /></th>{/if}
              {#if shown('evening')}<th class="has-menu"><ClassicColMenu label={t('Evening')} sortable sortDir={sort?.key === 'evening' ? sort.dir : null} onsort={(dir) => (sort = { key: 'evening', dir })} /></th>{/if}
              {#if shown('positions')}<th class="has-menu"><ClassicColMenu label={t('Positions')} sortable sortDir={sort?.key === 'positions' ? sort.dir : null} onsort={(dir) => (sort = { key: 'positions', dir })} /></th>{/if}
              {#if shown('notes')}<th class="has-menu"><ClassicColMenu label={t('Notes')} sortable sortDir={sort?.key === 'notes' ? sort.dir : null} onsort={(dir) => (sort = { key: 'notes', dir })} /></th>{/if}
              {#if shown('active')}<th class="has-menu"><ClassicColMenu label={t('Status')} sortable sortDir={sort?.key === 'active' ? sort.dir : null} onsort={(dir) => (sort = { key: 'active', dir })} filterKind="values" filterValues={[{ value: 'active', label: t('Active') }, { value: 'archived', label: t('Archived') }]} selected={excludedStatus} ontoggle={(value) => (excludedStatus = (() => { const next = new Set(excludedStatus); next.has(value) ? next.delete(value) : next.add(value); return next; })())} onselectall={(on) => (excludedStatus = on ? new Set() : new Set(['active', 'archived']))} /></th>{/if}
              <th class="chooser-col"><ClassicColChooser columns={OPTIONAL_COLUMNS.map((column) => ({ key: column.key, label: t(column.label) }))} {hidden} ontoggle={toggleColumn} /></th>
            </tr>
          </thead>
          <tbody>
            {#if !ordered.length}
              <tr><td colspan={colCount}><div class="cl-empty"><strong>{t('No areas yet')}</strong><span>{t('Add the parts of the house you plan for, such as Hall, Bar or Kitchen.')}</span></div></td></tr>
            {:else}
              {#each ordered as area (area.id)}
                {@const positions = positionsByArea.get(area.id) ?? []}
                <tr draggable={!sort && !workspace.isPreview} ondragstart={() => (dragId = area.id)} ondragend={() => (dragId = '')} ondragover={(event) => { if (!sort) event.preventDefault(); }} ondrop={() => moveArea(area.id)}>
                  <td class="cl-grip"><button type="button" disabled={Boolean(sort) || workspace.isPreview} title={sort ? t('Clear sorting to reorder') : t('Drag to reorder')} aria-label={t('Drag to reorder')}>⋮⋮</button></td>
                  <td class="swatch-col"><span class="cl-swatch" style="background:{areaColor.get(area.id) ?? 'var(--cl-line-strong)'}"></span></td>
                  <td><input class="cl-field" placeholder={t('Area name')} disabled={workspace.isPreview} bind:value={area.name} oninput={() => restaurantConfig.touch()} /></td>
                  {#if shown('lunch')}<td><span class="range"><input class="cl-field time" type="time" disabled={workspace.isPreview} bind:value={area.lunchStart} oninput={() => restaurantConfig.touch()} /><i>–</i><input class="cl-field time" type="time" disabled={workspace.isPreview} bind:value={area.lunchEnd} oninput={() => restaurantConfig.touch()} /></span></td>{/if}
                  {#if shown('evening')}<td><span class="range"><input class="cl-field time" type="time" disabled={workspace.isPreview} bind:value={area.eveningStart} oninput={() => restaurantConfig.touch()} /><i>–</i><input class="cl-field time" type="time" disabled={workspace.isPreview} bind:value={area.eveningEnd} oninput={() => restaurantConfig.touch()} /></span></td>{/if}
                  {#if shown('positions')}<td>{#if positions.length}<span class="cl-chips">{#each positions as position (position.id)}<span class="cl-chip" style="--chip:{positionColor.get(position.id) ?? 'var(--cl-line-strong)'}"><span>{position.name}</span></span>{/each}</span>{:else}<span class="cl-chips__empty">{t('No coverage yet')}</span>{/if}</td>{/if}
                  {#if shown('notes')}<td><input class="cl-field" disabled={workspace.isPreview} bind:value={area.notes} oninput={() => restaurantConfig.touch()} /></td>{/if}
                  {#if shown('active')}<td><label class="switch"><input type="checkbox" disabled={workspace.isPreview} bind:checked={area.active} onchange={() => restaurantConfig.touch()} /><span>{t(area.active ? 'Active' : 'Archived')}</span></label></td>{/if}
                  <td></td>
                </tr>
              {/each}
            {/if}
          </tbody>
        </table>
      </div>
      {/snippet}
    </ClassicTablePanel>
  {/snippet}
</ClassicRestaurantPage>

<style>
  .range { display: inline-flex; align-items: center; gap: 8px; }
  .range i { color: var(--cl-muted); font-style: normal; }
  .time { width: 116px; }
  .switch { display: inline-flex; align-items: center; gap: 8px; font-size: 14px; }
  .switch input { width: 16px; height: 16px; accent-color: var(--cl-accent); }
  .swatch-col { width: 34px; padding-right: 0 !important; }
  .sr-only { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }
  .chooser-col { width: 44px; }
  .cl-grip { width: 34px; text-align: center; }
  .cl-grip button { border: 0; background: transparent; color: var(--cl-muted); cursor: grab; letter-spacing: -3px; }
  .cl-grip button:disabled { cursor: default; opacity: .35; }
  .dot { width: 7px; height: 7px; border-radius: 50%; background: var(--cl-line-strong); display: inline-block; }
  .dot.is-green { background: var(--cl-ok); }
</style>
