<script lang="ts">
  import { t } from '$lib/i18n/i18n.svelte';

  /**
   * A spreadsheet-style column header: click the label to sort, or open the
   * menu (the caret) to sort, group or filter that column. One reusable control
   * so a table needs no separate filter toolbar — the header is the toolbar.
   */
  type FilterValue = { value: string; label: string };

  let {
    label,
    align = 'left',
    sortable = false,
    sortDir = null,
    onsort,
    groupable = false,
    grouped = false,
    ongroup,
    filterKind = null,
    searchValue = '',
    onsearch,
    filterValues = [],
    selected = null,
    ontoggle,
    onselectall
  }: {
    label: string;
    align?: 'left' | 'right';
    sortable?: boolean;
    sortDir?: 'asc' | 'desc' | null;
    onsort?: (dir: 'asc' | 'desc') => void;
    groupable?: boolean;
    grouped?: boolean;
    ongroup?: (on: boolean) => void;
    filterKind?: 'text' | 'values' | null;
    searchValue?: string;
    onsearch?: (value: string) => void;
    filterValues?: FilterValue[];
    selected?: Set<string> | null;
    ontoggle?: (value: string) => void;
    onselectall?: (on: boolean) => void;
  } = $props();

  let open = $state(false);
  let root = $state<HTMLElement | null>(null);

  // A column is "touched" (accent icon) when it drives the sort, the grouping or
  // an active filter, so the header shows at a glance what is shaping the table.
  const filtered = $derived(Boolean(selected && selected.size > 0) || Boolean(filterKind === 'text' && searchValue));
  const active = $derived(Boolean(sortDir) || grouped || filtered);
  const allSelected = $derived(!selected || selected.size === 0);

  function sort(dir: 'asc' | 'desc') {
    onsort?.(dir);
    open = false;
  }

  function toggleSort() {
    if (!sortable) return;
    onsort?.(sortDir === 'asc' ? 'desc' : 'asc');
  }

  $effect(() => {
    if (!open) return;
    const onDocClick = (event: MouseEvent) => {
      if (root && !root.contains(event.target as Node)) open = false;
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') open = false;
    };
    window.addEventListener('click', onDocClick, true);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('click', onDocClick, true);
      window.removeEventListener('keydown', onKey);
    };
  });
</script>

<div class="colhead" class:is-right={align === 'right'} bind:this={root}>
  <button
    class="colhead__label"
    class:is-sortable={sortable}
    type="button"
    onclick={toggleSort}
    title={sortable ? t('Sort') : undefined}
  >
    <span>{label}</span>
    {#if sortDir}
      <svg class="colhead__sort" class:is-desc={sortDir === 'desc'} viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 5v14M6 11l6-6 6 6" /></svg>
    {/if}
  </button>

  {#if sortable || groupable || filterKind}
    <button
      class="colhead__trigger"
      class:is-active={active}
      type="button"
      aria-haspopup="menu"
      aria-expanded={open}
      aria-label={t('Column options')}
      onclick={() => (open = !open)}
    >
      <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M4 6h16M7 12h10M10 18h4" /></svg>
    </button>
  {/if}

  {#if open}
    <div class="colmenu" role="menu">
      {#if sortable}
        <button class="colmenu__item" class:is-on={sortDir === 'asc'} type="button" role="menuitem" onclick={() => sort('asc')}>
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 5v14M6 11l6-6 6 6" /></svg>{t('Sort ascending')}
        </button>
        <button class="colmenu__item" class:is-on={sortDir === 'desc'} type="button" role="menuitem" onclick={() => sort('desc')}>
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 19V5M6 13l6 6 6-6" /></svg>{t('Sort descending')}
        </button>
      {/if}

      {#if groupable}
        {#if sortable}<div class="colmenu__sep"></div>{/if}
        <button class="colmenu__item" class:is-on={grouped} type="button" role="menuitem" onclick={() => { ongroup?.(!grouped); open = false; }}>
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M4 6h16M4 12h16M4 18h10" /></svg>{grouped ? t('Ungroup') : t('Group by this')}
        </button>
      {/if}

      {#if filterKind === 'text'}
        <div class="colmenu__sep"></div>
        <div class="colmenu__search">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.2-3.2" /></svg>
          <input class="cl-field" type="search" placeholder={t('Search')} value={searchValue} oninput={(event) => onsearch?.(event.currentTarget.value)} />
        </div>
      {:else if filterKind === 'values'}
        <div class="colmenu__sep"></div>
        <div class="colmenu__filter">
          <label class="colmenu__check colmenu__check--all">
            <input type="checkbox" checked={allSelected} onchange={(event) => onselectall?.(event.currentTarget.checked)} />
            <span>{t('Select all')}</span>
          </label>
          <div class="colmenu__values">
            {#each filterValues as item (item.value)}
              <label class="colmenu__check">
                <input type="checkbox" checked={!selected?.has(item.value)} onchange={() => ontoggle?.(item.value)} />
                <span>{item.label}</span>
              </label>
            {/each}
          </div>
        </div>
      {/if}
    </div>
  {/if}
</div>
