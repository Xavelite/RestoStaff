<script lang="ts">
  import { onMount } from 'svelte';
  import { t } from '$lib/i18n/i18n.svelte';
  import { POSITION_PALETTE, defaultPositionColor } from '$lib/ui/position-color';
  import { workspace } from '$lib/workspace/workspace.svelte';
  import { useClassicRestaurantContext } from '$lib/classic/classic-workspace-context';
  import ClassicTablePanel from '$lib/classic/ClassicTablePanel.svelte';
  import ClassicColMenu from '$lib/classic/ClassicColMenu.svelte';
  import ClassicColChooser from '$lib/classic/ClassicColChooser.svelte';
import ClassicPalettePicker from '$lib/classic/ClassicPalettePicker.svelte';
  import { restaurantConfig } from '$lib/classic/classic-restaurant.svelte';

  type SortKey = 'name' | 'cost' | 'employees' | 'active';


  $effect(() => {
    if (workspace.activeId && workspace.effectiveRole === 'owner') {
      void workspace.loadTeam().catch(() => undefined);
    }
  });
  const employeesByPosition = $derived.by(() => {
    const map = new Map<string, Set<string>>();
    for (const link of workspace.team?.employee_job_functions ?? []) {
      if (link.active === false) continue;
      (map.get(link.job_function_id) ?? map.set(link.job_function_id, new Set()).get(link.job_function_id)!).add(link.employee_id);
    }
    return map;
  });

  let search = $state('');
  let sort = $state<{ key: SortKey; dir: 'asc' | 'desc' } | null>(null);
  let excludedStatus = $state(new Set<string>());
  let dragId = $state('');
  const OPTIONAL_COLUMNS = [
    { key: 'cost', label: 'Estimated hourly cost' },
    { key: 'employees', label: 'Employees' },
    { key: 'active', label: 'Status' }
  ] as const;
  const COLS_KEY = 'rst-restaurant-positions-cols-v2';
  let hidden = $state(new Set<string>());
  onMount(() => {
    try { const raw = localStorage.getItem(COLS_KEY); if (raw) hidden = new Set(JSON.parse(raw) as string[]); } catch { hidden = new Set(); }
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

  function addPosition() {
    const draft = restaurantConfig.draft;
    if (!draft) return;
    draft.jobFunctions = [{ id: crypto.randomUUID(), name: '', code: '', active: true, estimatedHourlyCost: 0, color: defaultPositionColor(draft.jobFunctions.length) }, ...draft.jobFunctions];
    restaurantConfig.touch();
  }
  function movePosition(targetId: string) {
    const draft = restaurantConfig.draft;
    if (!draft || !dragId || dragId === targetId || sort) return;
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

  function matches(position: { name: string; active: boolean }) {
    const term = search.trim().toLowerCase();
    if (excludedStatus.has(position.active ? 'active' : 'archived')) return false;
    return !term || position.name.toLowerCase().includes(term);
  }
  function sortValue(position: { name: string; estimatedHourlyCost: number; active: boolean; id: string }) {
    switch (sort?.key) {
      case 'name': return position.name.toLowerCase();
      case 'cost': return `${position.estimatedHourlyCost}`.padStart(8, '0');
      case 'employees': return `${employeesByPosition.get(position.id)?.size ?? 0}`.padStart(4, '0');
      case 'active': return position.active ? '0' : '1';
      default: return position.name.toLowerCase();
    }
  }
  function orderedPositions<T extends { name: string; estimatedHourlyCost: number; active: boolean; id: string }>(rows: T[]): T[] {
    const activeSort = sort;
    if (!activeSort) return rows;
    const factor = activeSort.dir === 'desc' ? -1 : 1;
    return [...rows].sort((a, b) => factor * sortValue(a).localeCompare(sortValue(b)));
  }


  const readRestaurantContext = useClassicRestaurantContext();
  const context = $derived(readRestaurantContext());
</script>

<svelte:head><title>{t('Positions')} &middot; restogogo</title></svelte:head>

{#if context}
{@const draft = context.draft}
    {@const rows = [...draft.jobFunctions].filter(matches)}
    {@const ordered = orderedPositions(rows)}
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
              <th class="has-menu"><ClassicColMenu label={t('Name')} sortable sortDir={sort?.key === 'name' ? sort.dir : null} onsort={(dir) => (sort = { key: 'name', dir })} filterKind="text" searchValue={search} onsearch={(value) => (search = value)} /></th>
              {#if shown('cost')}<th class="has-menu"><ClassicColMenu label={t('Estimated hourly cost')} sortable sortDir={sort?.key === 'cost' ? sort.dir : null} onsort={(dir) => (sort = { key: 'cost', dir })} /></th>{/if}
              {#if shown('employees')}<th class="has-menu"><ClassicColMenu label={t('Employees')} sortable sortDir={sort?.key === 'employees' ? sort.dir : null} onsort={(dir) => (sort = { key: 'employees', dir })} /></th>{/if}
              {#if shown('active')}<th class="has-menu"><ClassicColMenu label={t('Status')} sortable sortDir={sort?.key === 'active' ? sort.dir : null} onsort={(dir) => (sort = { key: 'active', dir })} filterKind="values" filterValues={[{ value: 'active', label: t('Active') }, { value: 'archived', label: t('Archived') }]} selected={excludedStatus} ontoggle={(value) => (excludedStatus = (() => { const next = new Set(excludedStatus); next.has(value) ? next.delete(value) : next.add(value); return next; })())} onselectall={(on) => (excludedStatus = on ? new Set() : new Set(['active', 'archived']))} /></th>{/if}
              <th class="chooser-col"><ClassicColChooser columns={OPTIONAL_COLUMNS.map((column) => ({ key: column.key, label: t(column.label) }))} {hidden} ontoggle={toggleColumn} /></th>
            </tr>
          </thead>
          <tbody>
            {#if !ordered.length}
              <tr><td colspan={colCount}><div class="cl-empty"><strong>{t('No positions yet')}</strong><span>{t('Add the jobs people do on a shift, such as Server, Cook or Bartender.')}</span></div></td></tr>
            {:else}
              {#each ordered as position (position.id)}
                {@const headcount = employeesByPosition.get(position.id)?.size ?? 0}
                <tr draggable={!sort && !workspace.isPreview} ondragstart={() => (dragId = position.id)} ondragend={() => (dragId = '')} ondragover={(event) => { if (!sort) event.preventDefault(); }} ondrop={() => movePosition(position.id)}>
                  <td class="cl-grip"><button type="button" disabled={Boolean(sort) || workspace.isPreview} title={sort ? t('Clear sorting to reorder') : t('Drag to reorder')} aria-label={t('Drag to reorder')}>⋮⋮</button></td>
                  <td class="swatch-col"><ClassicPalettePicker value={position.color} palette={POSITION_PALETTE} label={t('Choose position colour')} disabled={workspace.isPreview} onselect={(color) => { position.color = color; restaurantConfig.touch(); }} /></td>
                  <td><input class="cl-field" placeholder={t('Position name')} disabled={workspace.isPreview} bind:value={position.name} oninput={() => restaurantConfig.touch()} /></td>
                  {#if shown('cost')}<td class="is-num"><input class="cl-field cost" type="number" disabled={workspace.isPreview} min="0" step="0.5" bind:value={position.estimatedHourlyCost} oninput={() => restaurantConfig.touch()} /></td>{/if}
                  {#if shown('employees')}<td><span class="cl-linkcount" class:is-zero={!headcount} title={t('{count} people', { count: headcount })}><span class="cl-linkcount__n">{headcount}</span></span></td>{/if}
                  {#if shown('active')}<td><label class="switch"><input type="checkbox" disabled={workspace.isPreview} bind:checked={position.active} onchange={() => restaurantConfig.touch()} /><span>{t(position.active ? 'Active' : 'Archived')}</span></label></td>{/if}
                  <td></td>
                </tr>
              {/each}
            {/if}
          </tbody>
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
  .sr-only { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }
  .chooser-col { width: 44px; }
  .cl-grip { width: 34px; text-align: center; }
  .cl-grip button { border: 0; background: transparent; color: var(--cl-muted); cursor: grab; letter-spacing: -3px; }
  .cl-grip button:disabled { cursor: default; opacity: .35; }
  .dot { width: 7px; height: 7px; border-radius: 50%; background: var(--cl-line-strong); display: inline-block; }
  .dot.is-green { background: var(--cl-ok); }
</style>
