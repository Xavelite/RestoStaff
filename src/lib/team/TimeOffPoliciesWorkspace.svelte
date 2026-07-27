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

  type SortKey = 'name' | 'payment' | 'approval' | 'status';
  type GroupBy = 'payment' | 'approval' | 'status' | 'none';
  type AbsenceType = NonNullable<typeof workspace.restaurant>['absence_types'][number];
  type TypeGroup = { key: string; label: string; rows: AbsenceType[] };

  const snapshot = $derived(workspace.restaurant);
  let search = $state('');
  let sort = $state<{ key: SortKey; dir: 'asc' | 'desc' } | null>(null);
  let excludedPayment = $state(new Set<string>());
  let excludedApproval = $state(new Set<string>());
  let excludedStatus = $state(new Set<string>());
  let groupBy = $state<GroupBy>('none');
  let collapsedGroups = $state<string[]>([]);

  const OPTIONAL_COLUMNS = [
    { key: 'payment', label: 'Payment' },
    { key: 'approval', label: 'Needs approval' },
    { key: 'status', label: 'Status' }
  ] as const;
  const COLS_KEY = 'rst-time-off-policies-cols-v1';
  const LEGACY_COLS_KEY = 'rst-restaurant-absence-types-cols-v2';
  let hidden = $state(new Set<string>());

  const PAID_LABEL: Record<string, string> = { paid: 'Paid', unpaid: 'Unpaid', neutral: 'Neutral' };

  onMount(() => {
    try {
      const raw =
        localStorage.getItem(COLS_KEY) ??
        localStorage.getItem(LEGACY_COLS_KEY);
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

  function toggleExcluded(set: Set<string>, value: string): Set<string> {
    const next = new Set(set);
    next.has(value) ? next.delete(value) : next.add(value);
    return next;
  }

  function toggleColumn(key: string) {
    const next = new Set(hidden);
    next.has(key) ? next.delete(key) : next.add(key);
    const hiding = next.has(key);
    if (hiding && sort?.key === key) sort = null;
    if (key === 'payment' && hiding) excludedPayment = new Set();
    if (key === 'approval' && hiding) excludedApproval = new Set();
    if (key === 'status' && hiding) excludedStatus = new Set();
    hidden = next;
    try { localStorage.setItem(COLS_KEY, JSON.stringify([...next])); } catch {}
  }

  const shown = (key: string) => !hidden.has(key);
  const colCount = $derived(2 + OPTIONAL_COLUMNS.filter((column) => shown(column.key)).length);

  function matches(type: AbsenceType): boolean {
    if (excludedPayment.has(type.paid_policy ?? 'neutral')) return false;
    if (excludedApproval.has(type.requires_approval ? 'approval' : 'automatic')) return false;
    if (excludedStatus.has(type.active ? 'active' : 'archived')) return false;
    return !search.trim() || `${type.name} ${type.paid_policy ?? ''}`.toLowerCase().includes(search.trim().toLowerCase());
  }

  function sortValue(type: AbsenceType): string {
    switch (sort?.key) {
      case 'name': return type.name.toLowerCase();
      case 'payment': return type.paid_policy ?? '';
      case 'approval': return type.requires_approval ? '1' : '0';
      case 'status': return type.active ? '0' : '1';
      default: return type.name.toLowerCase();
    }
  }

  function orderedTypes(rows: AbsenceType[]): AbsenceType[] {
    if (!sort) return [...rows].sort((left, right) => left.name.localeCompare(right.name));
    const factor = sort.dir === 'desc' ? -1 : 1;
    return [...rows].sort((left, right) => factor * sortValue(left).localeCompare(sortValue(right)));
  }

  function groupedTypes(rows: AbsenceType[]): TypeGroup[] {
    if (groupBy === 'none') return [{ key: 'all', label: '', rows }];
    const groups = new Map<string, TypeGroup>();
    for (const type of rows) {
      const key = groupBy === 'payment'
        ? (type.paid_policy ?? 'neutral')
        : groupBy === 'approval'
          ? (type.requires_approval ? 'approval' : 'automatic')
          : (type.active ? 'active' : 'archived');
      const label = groupBy === 'payment'
        ? t(PAID_LABEL[key] ?? key)
        : groupBy === 'approval'
          ? t(key === 'approval' ? 'Approval required' : 'No approval required')
          : t(key === 'active' ? 'Active' : 'Archived');
      const group = groups.get(key) ?? { key, label, rows: [] };
      group.rows.push(type);
      groups.set(key, group);
    }
    return [...groups.values()].sort((left, right) => left.label.localeCompare(right.label));
  }
</script>

<svelte:head><title>{t('Absence types')} &middot; restogogo</title></svelte:head>

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

  <ClassicTablePanel>
    {#snippet meta()}<span><i class="dot"></i>{t('{count} types', { count: types.length })}</span>{/snippet}
    {#snippet children()}
      <div class="cl-tablewrap">
        <table class="cl-table">
          <thead><tr>
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
                  { value: 'payment', label: t('Payment') },
                  { value: 'approval', label: t('Needs approval') },
                  { value: 'status', label: t('Status') }
                ]}
                ongroupchange={(value) => setGroupBy(value as GroupBy)}
              />
            </th>
            {#if shown('payment')}<th class="has-menu"><ClassicColMenu label={t('Payment')} sortable sortDir={sort?.key === 'payment' ? sort.dir : null} onsort={(dir) => (sort = { key: 'payment', dir })} filterKind="values" filterValues={paymentValues} selected={excludedPayment} ontoggle={(value) => (excludedPayment = toggleExcluded(excludedPayment, value))} onselectall={(on) => (excludedPayment = on ? new Set() : new Set(paymentValues.map((item) => item.value)))} /></th>{/if}
            {#if shown('approval')}<th class="has-menu"><ClassicColMenu label={t('Needs approval')} sortable sortDir={sort?.key === 'approval' ? sort.dir : null} onsort={(dir) => (sort = { key: 'approval', dir })} filterKind="values" filterValues={approvalValues} selected={excludedApproval} ontoggle={(value) => (excludedApproval = toggleExcluded(excludedApproval, value))} onselectall={(on) => (excludedApproval = on ? new Set() : new Set(approvalValues.map((item) => item.value)))} /></th>{/if}
            {#if shown('status')}<th class="has-menu"><ClassicColMenu label={t('Status')} sortable sortDir={sort?.key === 'status' ? sort.dir : null} onsort={(dir) => (sort = { key: 'status', dir })} filterKind="values" filterValues={[{ value: 'active', label: t('Active') }, { value: 'archived', label: t('Archived') }]} selected={excludedStatus} ontoggle={(value) => (excludedStatus = toggleExcluded(excludedStatus, value))} onselectall={(on) => (excludedStatus = on ? new Set() : new Set(['active', 'archived']))} /></th>{/if}
            <th class="chooser-col"><ClassicColChooser columns={OPTIONAL_COLUMNS.map((column) => ({ key: column.key, label: t(column.label) }))} {hidden} ontoggle={toggleColumn} /></th>
          </tr></thead>
          {#if !types.length}
            <tbody><tr><td colspan={colCount}><div class="cl-empty"><strong>{t('No absence types yet')}</strong><span>{t('Without a leave type, employees cannot request time off.')}</span></div></td></tr></tbody>
          {:else}
            {#each groups as group (group.key)}
              <tbody>
                {#if groupBy !== 'none'}<ClassicGroupRow colspan={colCount} label={group.label} meta={t('{count} types', { count: group.rows.length })} collapsed={collapsedGroups.includes(group.key)} ontoggle={() => toggleGroup(group.key)} />{/if}
                {#if !collapsedGroups.includes(group.key)}
                  {#each group.rows as type (type.id)}
                    <tr>
                      <td>{type.name}</td>
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
