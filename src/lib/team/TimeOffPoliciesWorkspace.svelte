<script lang="ts">
  import { onMount } from 'svelte';
  import { t } from '$lib/i18n/i18n.svelte';
  import { workspace } from '$lib/workspace/workspace.svelte';
  import ClassicStatus from '$lib/classic/ClassicStatus.svelte';
  import ClassicTablePanel from '$lib/classic/ClassicTablePanel.svelte';
  import ClassicColMenu from '$lib/classic/ClassicColMenu.svelte';
  import ClassicPrimaryColMenu from '$lib/classic/ClassicPrimaryColMenu.svelte';
  import ClassicGroupRow from '$lib/classic/ClassicGroupRow.svelte';
  import ClassicColChooser from '$lib/classic/ClassicColChooser.svelte';
  import { createTableView } from '$lib/classic/table-view.svelte';

  type SortKey = 'name' | 'payment' | 'approval' | 'status';
  type GroupBy = 'payment' | 'approval' | 'status' | 'none';
  type AbsenceType = NonNullable<typeof workspace.restaurant>['absence_types'][number];
  type TypeGroup = { key: string; label: string; rows: AbsenceType[] };

  const snapshot = $derived(workspace.restaurant);

  const OPTIONAL_COLUMNS = [
    { key: 'payment', label: 'Payment' },
    { key: 'approval', label: 'Needs approval' },
    { key: 'status', label: 'Status' }
  ] as const;
  const view = createTableView<SortKey, GroupBy>({
    storageKey: 'rst-time-off-policies-cols-v1',
    legacyStorageKey: 'rst-restaurant-absence-types-cols-v2',
    columns: OPTIONAL_COLUMNS
  });
  const shown = view.shown;
  const colCount = $derived(view.colCount + 1);

  const PAID_LABEL: Record<string, string> = { paid: 'Paid', unpaid: 'Unpaid', neutral: 'Neutral' };

  onMount(view.restore);

  function matches(type: AbsenceType): boolean {
    if (view.isExcluded('payment', type.paid_policy ?? 'neutral')) return false;
    if (view.isExcluded('approval', type.requires_approval ? 'approval' : 'automatic')) return false;
    if (view.isExcluded('status', type.active ? 'active' : 'archived')) return false;
    return view.matchesSearch('name', `${type.name} ${type.paid_policy ?? ''}`);
  }

  function sortValue(type: AbsenceType, key: SortKey): string {
    switch (key) {
      case 'payment': return type.paid_policy ?? '';
      case 'approval': return type.requires_approval ? '1' : '0';
      case 'status': return type.active ? '0' : '1';
      default: return type.name.toLowerCase();
    }
  }

  function orderedTypes(rows: AbsenceType[]): AbsenceType[] {
    // Unsorted still means alphabetical here — a policy list has no natural order.
    if (!view.sort) return [...rows].sort((left, right) => left.name.localeCompare(right.name));
    return view.ordered(rows, sortValue);
  }

  function groupedTypes(rows: AbsenceType[]): TypeGroup[] {
    if (!view.grouping) return [{ key: 'all', label: '', rows }];
    const groups = new Map<string, TypeGroup>();
    for (const type of rows) {
      const key = view.groupBy === 'payment'
        ? (type.paid_policy ?? 'neutral')
        : view.groupBy === 'approval'
          ? (type.requires_approval ? 'approval' : 'automatic')
          : (type.active ? 'active' : 'archived');
      const label = view.groupBy === 'payment'
        ? t(PAID_LABEL[key] ?? key)
        : view.groupBy === 'approval'
          ? t(key === 'approval' ? 'Approval required' : 'No approval required')
          : t(key === 'active' ? 'Active' : 'Archived');
      const group = groups.get(key) ?? { key, label, rows: [] };
      group.rows.push(type);
      groups.set(key, group);
    }
    return [...groups.values()].sort((left, right) => left.label.localeCompare(right.label));
  }
</script>

<svelte:head><title>{t('Time-off types')} &middot; restogogo</title></svelte:head>

{#if snapshot}
  {@const types = orderedTypes((snapshot.absence_types ?? []).filter(matches))}
  {@const groups = groupedTypes(types)}
  {@const paymentValues = [
    { value: 'paid', label: t('Paid') },
    { value: 'unpaid', label: t('Unpaid') },
    { value: 'neutral', label: t('Neutral') }
  ]}
  {@const approvalValues = [
    { value: 'approval', label: t('Approval required') },
    { value: 'automatic', label: t('No approval required') }
  ]}
  {@const statusValues = [{ value: 'active', label: t('Active') }, { value: 'archived', label: t('Archived') }]}

  <ClassicTablePanel>
    {#snippet meta()}<span><i class="dot"></i>{t('{count} types', { count: types.length })}</span>{/snippet}
    {#snippet children()}
      <div class="cl-tablewrap">
        <table class="cl-table cl-mobile-rows">
          <thead><tr>
            <th class="has-menu">
              <ClassicPrimaryColMenu
                label={t('Name')}
                sortable
                sortDir={view.sortDir('name')}
                onsort={(dir) => view.setSort('name', dir)}
                filterKind="text"
                searchValue={view.search('name')}
                onsearch={(value) => view.setSearch('name', value)}
                groupValue={view.groupBy}
                groupOptions={[
                  { value: 'none', label: t('No grouping') },
                  { value: 'payment', label: t('Payment') },
                  { value: 'approval', label: t('Needs approval') },
                  { value: 'status', label: t('Status') }
                ]}
                ongroupchange={(value) => view.setGroupBy(value as GroupBy)}
              />
            </th>
            {#if shown('payment')}<th class="has-menu"><ClassicColMenu label={t('Payment')} sortable sortDir={view.sortDir('payment')} onsort={(dir) => view.setSort('payment', dir)} filterKind="values" filterValues={paymentValues} selected={view.excluded('payment')} ontoggle={(value) => view.toggleValue('payment', value)} onselectall={(on) => view.selectAll('payment', on, paymentValues)} /></th>{/if}
            {#if shown('approval')}<th class="has-menu"><ClassicColMenu label={t('Needs approval')} sortable sortDir={view.sortDir('approval')} onsort={(dir) => view.setSort('approval', dir)} filterKind="values" filterValues={approvalValues} selected={view.excluded('approval')} ontoggle={(value) => view.toggleValue('approval', value)} onselectall={(on) => view.selectAll('approval', on, approvalValues)} /></th>{/if}
            {#if shown('status')}<th class="has-menu"><ClassicColMenu label={t('Status')} sortable sortDir={view.sortDir('status')} onsort={(dir) => view.setSort('status', dir)} filterKind="values" filterValues={statusValues} selected={view.excluded('status')} ontoggle={(value) => view.toggleValue('status', value)} onselectall={(on) => view.selectAll('status', on, statusValues)} /></th>{/if}
            <th class="chooser-col"><ClassicColChooser columns={view.columns} hidden={view.hidden} ontoggle={view.toggleColumn} /></th>
          </tr></thead>
          {#if !types.length}
            <tbody><tr class="cl-mobile-empty"><td colspan={colCount}><div class="cl-empty"><strong>{t('No absence types yet')}</strong><span>{t('Without a leave type, employees cannot request time off.')}</span></div></td></tr></tbody>
          {:else}
            {#each groups as group (group.key)}
              <tbody>
                {#if view.grouping}<ClassicGroupRow colspan={colCount} label={group.label} meta={t('{count} types', { count: group.rows.length })} collapsed={view.isCollapsed(group.key)} ontoggle={() => view.toggleGroup(group.key)} />{/if}
                {#if !view.isCollapsed(group.key)}
                  {#each group.rows as type (type.id)}
                    <tr>
                      <td class="cl-mobile-primary">
                        <strong>{type.name}</strong>
                        <span class="cl-mobile-summary">
                          <span>{t(PAID_LABEL[type.paid_policy ?? 'neutral'] ?? type.paid_policy ?? '—')}</span>
                          <span>{t(type.requires_approval ? 'Approval required' : 'No approval required')}</span>
                          {#if !type.active}<span>{t('Archived')}</span>{/if}
                        </span>
                      </td>
                      {#if shown('payment')}<td class="is-quiet">{t(PAID_LABEL[type.paid_policy ?? 'neutral'] ?? type.paid_policy ?? '—')}</td>{/if}
                      {#if shown('approval')}<td class="is-quiet">{t(type.requires_approval ? 'Yes' : 'No')}</td>{/if}
                      {#if shown('status')}<td><ClassicStatus label={type.active ? 'Active' : 'Archived'} tone={type.active ? 'ok' : 'attention'} /></td>{/if}
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
