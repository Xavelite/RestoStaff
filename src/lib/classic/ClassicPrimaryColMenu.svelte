<script lang="ts">
  import type { Snippet } from 'svelte';
  import ClassicColMenu from './ClassicColMenu.svelte';
  import ClassicGroupMenu from './ClassicGroupMenu.svelte';

  type FilterValue = { value: string; label: string };
  type GroupOption = { value: string; label: string };

  let {
    label,
    meta = '',
    metaParts = [],
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
    groupValue = 'none',
    groupOptions = [],
    ongroupchange,
    groupLabel = 'Group rows'
  }: {
    label: string;
    meta?: string;
    metaParts?: string[];
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
    groupValue?: string;
    groupOptions?: GroupOption[];
    ongroupchange?: (value: string) => void;
    groupLabel?: string;
  } = $props();
</script>

<div class="cl-primary-head">
  {#if extra}
    <ClassicColMenu
      {label}
      {meta}
      {metaParts}
      {align}
      {sortable}
      {sortDir}
      {onsort}
      {filterKind}
      {searchValue}
      {onsearch}
      {filterValues}
      {selected}
      {ontoggle}
      {onselectall}
      {extra}
      {extraActive}
    />
  {:else}
    <ClassicColMenu
      {label}
      {meta}
      {metaParts}
      {align}
      {sortable}
      {sortDir}
      {onsort}
      {filterKind}
      {searchValue}
      {onsearch}
      {filterValues}
      {selected}
      {ontoggle}
      {onselectall}
      {extraActive}
    />
  {/if}

  {#if groupOptions.length && ongroupchange}
    <ClassicGroupMenu
      value={groupValue}
      options={groupOptions}
      onchange={ongroupchange}
      label={groupLabel}
    />
  {/if}
</div>
