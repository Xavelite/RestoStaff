<script lang="ts">
  import { onMount } from 'svelte';
  import { t } from '$lib/i18n/i18n.svelte';
  import { workspace } from '$lib/workspace/workspace.svelte';
  import ClassicPage from '$lib/classic/ClassicPage.svelte';
  import ClassicStatus from '$lib/classic/ClassicStatus.svelte';
  import ClassicTablePanel from '$lib/classic/ClassicTablePanel.svelte';
  import ClassicColMenu from '$lib/classic/ClassicColMenu.svelte';
  import ClassicColChooser from '$lib/classic/ClassicColChooser.svelte';

  const snapshot = $derived(workspace.restaurant);
  let search = $state('');
  let sort = $state<{ key: 'name' | 'payment' | 'approval' | 'status'; dir: 'asc' | 'desc' } | null>(null);
  let excludedStatus = $state(new Set<string>());

  const OPTIONAL_COLUMNS = [
    { key: 'payment', label: 'Payment' },
    { key: 'approval', label: 'Needs approval' },
    { key: 'status', label: 'Status' }
  ] as const;
  const COLS_KEY = 'rst-restaurant-absence-types-cols-v2';
  let hidden = $state(new Set<string>());

  $effect(() => {
    if (workspace.activeId && workspace.effectiveRole === 'owner') void workspace.loadRestaurant().catch(() => undefined);
  });

  onMount(() => {
    try { const raw = localStorage.getItem(COLS_KEY); if (raw) hidden = new Set(JSON.parse(raw) as string[]); } catch { hidden = new Set(); }
  });

  function toggleColumn(key: string) {
    const next = new Set(hidden);
    next.has(key) ? next.delete(key) : next.add(key);
    const hiding = next.has(key);
    if (hiding && sort?.key === key) sort = null;
    if (key === 'status' && hiding) excludedStatus = new Set();
    hidden = next;
    try { localStorage.setItem(COLS_KEY, JSON.stringify([...next])); } catch {}
  }
  const shown = (key: string) => !hidden.has(key);
  const colCount = $derived(2 + OPTIONAL_COLUMNS.filter((column) => shown(column.key)).length);

  const PAID_LABEL: Record<string, string> = { paid: 'Paid', unpaid: 'Unpaid', neutral: 'Neutral' };
</script>

<svelte:head><title>{t('Absence types')} &middot; restogogo</title></svelte:head>

<ClassicPage>
  {@const types = [...(snapshot?.absence_types ?? [])]
    .filter((type) => !excludedStatus.has(type.active ? 'active' : 'archived'))
    .filter((type) => `${type.name} ${type.paid_policy ?? ''}`.toLowerCase().includes(search.trim().toLowerCase()))
    .sort((left, right) => {
      const factor = sort?.dir === 'desc' ? -1 : 1;
      if (!sort) return left.name.localeCompare(right.name);
      const a = sort.key === 'name' ? left.name : sort.key === 'payment' ? left.paid_policy ?? '' : sort.key === 'approval' ? `${left.requires_approval}` : left.active ? '0' : '1';
      const b = sort.key === 'name' ? right.name : sort.key === 'payment' ? right.paid_policy ?? '' : sort.key === 'approval' ? `${right.requires_approval}` : right.active ? '0' : '1';
      return factor * a.localeCompare(b);
    })}

  <ClassicTablePanel>
    {#snippet meta()}<span><i class="dot"></i>{t('{count} types', { count: types.length })}</span>{/snippet}
    {#snippet children()}
      <div class="cl-tablewrap">
        <table class="cl-table">
          <thead><tr>
            <th class="has-menu"><ClassicColMenu label={t('Name')} sortable sortDir={sort?.key === 'name' ? sort.dir : null} onsort={(dir) => (sort = { key: 'name', dir })} filterKind="text" searchValue={search} onsearch={(value) => (search = value)} /></th>
            {#if shown('payment')}<th class="has-menu"><ClassicColMenu label={t('Payment')} sortable sortDir={sort?.key === 'payment' ? sort.dir : null} onsort={(dir) => (sort = { key: 'payment', dir })} /></th>{/if}
            {#if shown('approval')}<th class="has-menu"><ClassicColMenu label={t('Needs approval')} sortable sortDir={sort?.key === 'approval' ? sort.dir : null} onsort={(dir) => (sort = { key: 'approval', dir })} /></th>{/if}
            {#if shown('status')}<th class="has-menu"><ClassicColMenu label={t('Status')} sortable sortDir={sort?.key === 'status' ? sort.dir : null} onsort={(dir) => (sort = { key: 'status', dir })} filterKind="values" filterValues={[{ value: 'active', label: t('Active') }, { value: 'archived', label: t('Archived') }]} selected={excludedStatus} ontoggle={(value) => { const next = new Set(excludedStatus); next.has(value) ? next.delete(value) : next.add(value); excludedStatus = next; }} onselectall={(on) => (excludedStatus = on ? new Set() : new Set(['active', 'archived']))} /></th>{/if}
            <th class="chooser-col"><ClassicColChooser columns={OPTIONAL_COLUMNS.map((column) => ({ key: column.key, label: t(column.label) }))} {hidden} ontoggle={toggleColumn} /></th>
          </tr></thead>
          <tbody>
            {#if !types.length}<tr><td colspan={colCount}><div class="cl-empty"><strong>{t('No absence types yet')}</strong><span>{t('Without a leave type, employees cannot request time off.')}</span></div></td></tr>{:else}
              {#each types as type (type.id)}<tr><td>{type.name}</td>{#if shown('payment')}<td class="is-quiet">{t(PAID_LABEL[type.paid_policy ?? ''] ?? type.paid_policy ?? '—')}</td>{/if}{#if shown('approval')}<td class="is-quiet">{t(type.requires_approval ? 'Yes' : 'No')}</td>{/if}{#if shown('status')}<td><ClassicStatus label={type.active ? 'Active' : 'Archived'} tone={type.active ? 'ok' : 'attention'} /></td>{/if}<td></td></tr>{/each}
            {/if}
          </tbody>
        </table>
      </div>
    {/snippet}
  </ClassicTablePanel>
</ClassicPage>

<style>
  .dot { width: 7px; height: 7px; border-radius: 50%; background: var(--cl-line-strong); display: inline-block; }
  .chooser-col { width: 44px; }
</style>
