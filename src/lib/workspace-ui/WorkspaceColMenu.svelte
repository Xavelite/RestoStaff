<script lang="ts">
  import { tick, type Snippet } from 'svelte';
  import { t } from '$lib/i18n/i18n.svelte';
  import { portal } from '$lib/ui/portal';
  import WorkspaceColumnResizeHandle from './WorkspaceColumnResizeHandle.svelte';

  type FilterValue = { value: string; label: string };

  let {
    label,
    labelIcon,
    meta = '',
    metaParts = [],
    metaSeparator = 'dot',
    align = 'left',
    sortable = false,
    sortDir = null,
    onsort,
    filterKind = null,
    searchValue = '',
    onsearch,
    filterValues = [],
    selected = null,
    ontoggle,
    onselectall,
    extra,
    extraActive = false,
    resizable = true,
    columnKey = label
  }: {
    label: string;
    labelIcon?: 'people';
    meta?: string;
    metaParts?: string[];
    metaSeparator?: 'dot' | 'arrow';
    align?: 'left' | 'center' | 'right';
    sortable?: boolean;
    sortDir?: 'asc' | 'desc' | null;
    onsort?: (dir: 'asc' | 'desc') => void;
    filterKind?: 'text' | 'values' | null;
    searchValue?: string;
    onsearch?: (value: string) => void;
    filterValues?: FilterValue[];
    selected?: Set<string> | null;
    ontoggle?: (value: string) => void;
    onselectall?: (on: boolean) => void;
    extra?: Snippet;
    extraActive?: boolean;
    resizable?: boolean;
    columnKey?: string;
  } = $props();

  let open = $state(false);
  let root = $state<HTMLElement | null>(null);
  let trigger = $state<HTMLButtonElement | null>(null);
  let menu = $state<HTMLElement | null>(null);
  let menuLeft = $state(0);
  let menuTop = $state(0);
  let menuRight = $state(false);
  let filterSearch = $state('');

  const filtered = $derived(Boolean(selected && selected.size > 0) || Boolean(filterKind === 'text' && searchValue));
  const active = $derived(Boolean(sortDir) || filtered || extraActive);
  const allSelected = $derived(!selected || selected.size === 0);
  const visibleFilterValues = $derived(
    filterValues.filter((item) => item.label.toLowerCase().includes(filterSearch.trim().toLowerCase()))
  );

  function toggleSort() {
    if (!sortable) return;
    onsort?.(sortDir === 'asc' ? 'desc' : 'asc');
  }

  function positionMenu() {
    if (!trigger) return;
    const rect = trigger.getBoundingClientRect();
    const menuWidth = 260;
    menuRight = rect.left + menuWidth > window.innerWidth - 12;
    menuLeft = menuRight ? Math.max(12, rect.right - menuWidth) : Math.max(12, rect.left - 8);
    const menuHeight = menu?.getBoundingClientRect().height ?? 320;
    const spaceBelow = window.innerHeight - rect.bottom - 12;
    const spaceAbove = rect.top - 12;
    menuTop =
      spaceBelow >= Math.min(menuHeight, 320) || spaceBelow >= spaceAbove
        ? Math.min(window.innerHeight - Math.min(menuHeight, window.innerHeight - 24) - 12, rect.bottom + 4)
        : Math.max(12, rect.top - menuHeight - 4);
  }

  function toggleMenu() {
    open = !open;
    if (open) {
      filterSearch = '';
      void tick().then(positionMenu);
    }
  }

  $effect(() => {
    if (!open) return;
    const onDocClick = (event: MouseEvent) => {
      if (root && !root.contains(event.target as Node) && !menu?.contains(event.target as Node)) open = false;
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') open = false;
    };
    const onReposition = () => positionMenu();
    window.addEventListener('click', onDocClick, true);
    window.addEventListener('keydown', onKey);
    window.addEventListener('resize', onReposition);
    window.addEventListener('scroll', onReposition, true);
    return () => {
      window.removeEventListener('click', onDocClick, true);
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('resize', onReposition);
      window.removeEventListener('scroll', onReposition, true);
    };
  });
</script>

<div class="colhead" class:is-center={align === 'center'} class:is-right={align === 'right'} data-column-key={columnKey} bind:this={root}>
  <button class="colhead__label" class:is-sortable={sortable} type="button" onclick={toggleSort} title={sortable ? t('Sort') : undefined}>
    <span class="colhead__copy">
      <span>
        {#if labelIcon === 'people'}
          <svg class="colhead__leading" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><circle cx="9" cy="8" r="3"/><path d="M3.5 19a5.5 5.5 0 0 1 11 0M16.5 7a2.5 2.5 0 0 1 0 5M18 14a4.5 4.5 0 0 1 3 4.2"/></svg>
        {/if}
        {label}
      </span>
      {#if metaParts.length}
        <small class="colhead__meta" class:is-comparison={metaSeparator === 'arrow'}>
          {#each metaParts as part}
            <span>{part}</span>
          {/each}
        </small>
      {:else if meta}<small>{meta}</small>{/if}
    </span>
    {#if sortDir}
      <svg class="colhead__sort" class:is-desc={sortDir === 'desc'} viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 5v14M6 11l6-6 6 6" /></svg>
    {/if}
  </button>

  <!-- Sorting is the header label itself, so the menu holds only what the label
       cannot express: searching and picking values. -->
  {#if filterKind || extra}
    <button bind:this={trigger} class="colhead__trigger" class:is-active={active} type="button" aria-haspopup="menu" aria-expanded={open} aria-label={t('Filter column')} title={t('Filter column')} onclick={toggleMenu}>
      <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M4 6h16M7 12h10M10 18h4" /></svg>
    </button>
  {/if}

  {#if resizable}
    <WorkspaceColumnResizeHandle {columnKey} />
  {/if}

  {#if open}
    <div use:portal bind:this={menu} class="colmenu is-floating" class:is-right={menuRight} style={`left:${menuLeft}px;top:${menuTop}px`} role="menu">
      {#if filterKind === 'text'}
        <div class="colmenu__search">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.2-3.2" /></svg>
          <input class="cl-field" type="search" placeholder={t('Search')} value={searchValue} oninput={(event) => onsearch?.(event.currentTarget.value)} />
        </div>
      {:else if filterKind === 'values'}
        <div class="colmenu__search">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.2-3.2" /></svg>
          <input class="cl-field" type="search" placeholder={t('Search')} bind:value={filterSearch} />
        </div>
        <div class="colmenu__filter">
          <label class="colmenu__check colmenu__check--all">
            <input type="checkbox" checked={allSelected} onchange={(event) => onselectall?.(event.currentTarget.checked)} />
            <span>{t('Select all')}</span>
          </label>
          <div class="colmenu__values">
            {#each visibleFilterValues as item (item.value)}
              <label class="colmenu__check">
                <input type="checkbox" checked={!selected?.has(item.value)} onchange={() => ontoggle?.(item.value)} />
                <span>{item.label}</span>
              </label>
            {/each}
            {#if !visibleFilterValues.length}<div class="colmenu__empty">{t('No matches')}</div>{/if}
          </div>
        </div>
      {/if}

      {#if extra}
        <div class="colmenu__sep"></div>
        <div class="colmenu__extra">{@render extra()}</div>
      {/if}
    </div>
  {/if}
</div>
