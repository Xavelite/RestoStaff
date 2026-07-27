<script lang="ts">
  import { saveAbsence } from '$lib/api/mutations';
  import { friendlyError } from '$lib/api/error-messages';
  import { type ServiceKey } from '$lib/calendar/date';
  import { t } from '$lib/i18n/i18n.svelte';
  import { personInitials } from '$lib/ui/person';
  import { buildEmployeeColorMap } from '$lib/ui/position-color';
  import { toasts } from '$lib/ui/toast.svelte';
  import { workspace } from '$lib/workspace/workspace.svelte';
  import { useClassicTeamContext } from '$lib/classic/classic-workspace-context';
  import ClassicService from '$lib/classic/ClassicService.svelte';
  import ClassicCellBadge from '$lib/classic/ClassicCellBadge.svelte';
  import ClassicRowMenu from '$lib/classic/ClassicRowMenu.svelte';
  import ClassicColMenu from '$lib/classic/ClassicColMenu.svelte';
  import ClassicPrimaryColMenu from '$lib/classic/ClassicPrimaryColMenu.svelte';
  import ClassicGroupRow from '$lib/classic/ClassicGroupRow.svelte';
  import ClassicTablePanel from '$lib/classic/ClassicTablePanel.svelte';
  import type { ManagerOperationsReadModel } from '$lib/api/workspace-snapshot';

  const employeeColor = $derived(
    workspace.team
      ? buildEmployeeColorMap(workspace.team.job_functions, workspace.team.employee_job_functions, workspace.restaurant?.work_areas ?? [])
      : new Map<string, string>()
  );

  function asService(value: string | null): ServiceKey | null {
    return value === 'lunch' || value === 'evening' ? value : null;
  }

  let excludedStatus = $state(new Set<string>());
  let busy = $state('');
  let search = $state('');
  let view = $state<'review' | 'all'>('review');
  let sort = $state<{ key: 'employee' | 'type' | 'period' | 'service' | 'status'; dir: 'asc' | 'desc' } | null>(null);
  let groupBy = $state<'status' | 'employee' | 'type' | 'none'>('none');
  let excludedType = $state(new Set<string>());
  let excludedService = $state(new Set<string>());
  let periodSearch = $state('');
  let collapsedGroups = $state<string[]>([]);
  const team = $derived(workspace.team);


  type AbsenceRow = ManagerOperationsReadModel['absences'][number];
  type AbsenceGroup = { key: string; label: string; rows: AbsenceRow[] };

  function groupedRows(rows: AbsenceRow[], employeeName: Map<string, string>, typeNameForGroup: Map<string, string>): AbsenceGroup[] {
    if (groupBy === 'none') return [{ key: 'all', label: '', rows }];
    const map = new Map<string, AbsenceGroup>();
    for (const absence of rows) {
      const key = groupBy === 'status' ? absence.status : groupBy === 'employee' ? absence.employee_id : absence.absence_type_id ?? '__none__';
      const label = groupBy === 'status' ? t(absence.status) : groupBy === 'employee' ? employeeName.get(absence.employee_id) ?? t('Unknown') : key === '__none__' ? t('No type') : typeNameForGroup.get(key) ?? t('Unknown');
      const group = map.get(key) ?? { key, label, rows: [] };
      group.rows.push(absence);
      map.set(key, group);
    }
    return [...map.values()].sort((a, b) => a.label.localeCompare(b.label));
  }

  function setGroupBy(next: 'status' | 'employee' | 'type' | 'none'): void {
    groupBy = next;
    collapsedGroups = [];
  }

  function toggleGroup(key: string): void {
    collapsedGroups = collapsedGroups.includes(key)
      ? collapsedGroups.filter((item) => item !== key)
      : [...collapsedGroups, key];
  }

  function toneFor(status: string): 'success' | 'warning' | 'danger' {
    if (status === 'approved') return 'success';
    if (status === 'pending') return 'warning';
    return 'danger';
  }

  function iconFor(status: string): 'check' | 'clock' | 'warning' {
    if (status === 'approved') return 'check';
    if (status === 'pending') return 'clock';
    return 'warning';
  }

  function formatDate(value: string): string {
    const [year, month, day] = value.split('-');
    return year && month && day ? `${day}/${month}/${year}` : value;
  }

  function durationLabel(absence: AbsenceRow): string {
    const start = Date.parse(`${absence.start_date}T00:00:00Z`);
    const end = Date.parse(`${absence.end_date}T00:00:00Z`);
    const days = Number.isFinite(start) && Number.isFinite(end)
      ? Math.max(1, Math.round((end - start) / 86_400_000) + 1)
      : 1;
    return days === 1 && asService(absence.service_key) ? '½d' : `${days}d`;
  }

  async function resolve(absenceId: string, employeeId: string, action: 'approve' | 'reject') {
    if (!workspace.activeId || busy) return;
    busy = absenceId;
    try {
      await saveAbsence({ restaurantId: workspace.activeId, employeeId, absenceId, action, payload: { reason: action === 'approve' ? 'Approved from Team.' : 'Rejected from Team.' } });
      await workspace.loadTeam(true);
      toasts.show(action === 'approve' ? t('Leave approved.') : t('Leave rejected.'), 'success');
    } catch (error) {
      toasts.show(friendlyError(error), 'danger');
    } finally {
      busy = '';
    }
  }

  const readTeamContext = useClassicTeamContext();
  const teamContext = $derived(readTeamContext());
</script>

<svelte:head><title>{t('Absences')} &middot; restogogo</title></svelte:head>

{#if teamContext}
{@const employeeName = new Map(teamContext.employees.map((employee) => [employee.id, employee.displayName]))}
    {@const typeName = new Map((team?.absence_types ?? []).map((type) => [type.id, type.name]))}
    {@const allAbsences = team?.absences ?? []}
    {@const rows = allAbsences
      .filter((absence) => view === 'all' || absence.status === 'pending')
      .filter((absence) => !excludedStatus.has(absence.status))
      .filter((absence) => !excludedType.has(absence.absence_type_id ?? '__none__'))
      .filter((absence) => !excludedService.has(asService(absence.service_key) ?? 'full_day'))
      .filter((absence) => !periodSearch.trim() || absence.start_date.includes(periodSearch.trim()) || absence.end_date.includes(periodSearch.trim()))
      .filter((absence) => `${employeeName.get(absence.employee_id) ?? ''} ${typeName.get(absence.absence_type_id ?? '') ?? ''} ${absence.status}`.toLowerCase().includes(search.trim().toLowerCase()))
      .sort((left, right) => {
        if (!sort) return right.start_date.localeCompare(left.start_date);
        const factor = sort.dir === 'desc' ? -1 : 1;
        const serviceLeft = asService(left.service_key) ?? '';
        const serviceRight = asService(right.service_key) ?? '';
        const valueLeft = sort.key === 'employee' ? (employeeName.get(left.employee_id) ?? '') : sort.key === 'type' ? (typeName.get(left.absence_type_id ?? '') ?? '') : sort.key === 'period' ? left.start_date : sort.key === 'service' ? serviceLeft : left.status;
        const valueRight = sort.key === 'employee' ? (employeeName.get(right.employee_id) ?? '') : sort.key === 'type' ? (typeName.get(right.absence_type_id ?? '') ?? '') : sort.key === 'period' ? right.start_date : sort.key === 'service' ? serviceRight : right.status;
        return factor * valueLeft.localeCompare(valueRight);
      })}
    {@const groups = groupedRows(rows, employeeName, typeName)}
    {@const typeValues = [{ value: '__none__', label: t('No type') }, ...[...typeName].map(([value, label]) => ({ value, label }))]}
    {@const serviceValues = [{ value: 'lunch', label: t('Lunch') }, { value: 'evening', label: t('Evening') }, { value: 'full_day', label: t('Full day') }]}

    <ClassicTablePanel>
      {#snippet meta()}
        <span><i class="dot"></i>{t('{count} requests', { count: rows.length })}</span>
        <span><i class="dot is-orange"></i>{t('{count} pending', { count: allAbsences.filter((absence) => absence.status === 'pending').length })}</span>
      {/snippet}
      {#snippet actions()}
        <div class="view-switch" aria-label={t('Absences')}>
          <button type="button" class:is-active={view === 'review'} aria-pressed={view === 'review'} onclick={() => (view = 'review')}>{t('Needs review')}</button>
          <button type="button" class:is-active={view === 'all'} aria-pressed={view === 'all'} onclick={() => (view = 'all')}>{t('All')}</button>
        </div>
        <a class="settings-link" href="/settings/absence-types">{t('Absence types')}</a>
      {/snippet}
      {#snippet children()}
      <div class="cl-tablewrap">
        <table class="cl-table">
          <thead>
            <tr>
              <th class="has-menu"><ClassicPrimaryColMenu label={t('Employee')} sortable sortDir={sort?.key === 'employee' ? sort.dir : null} onsort={(dir) => (sort = { key: 'employee', dir })} filterKind="text" searchValue={search} onsearch={(value) => (search = value)} groupValue={groupBy} groupOptions={[{ value: 'none', label: t('No grouping') }, { value: 'status', label: t('Status') }, { value: 'employee', label: t('Employee') }, { value: 'type', label: t('Type') }]} ongroupchange={(value) => setGroupBy(value as 'status' | 'employee' | 'type' | 'none')} /></th>
              <th class="has-menu"><ClassicColMenu label={t('Type')} sortable sortDir={sort?.key === 'type' ? sort.dir : null} onsort={(dir) => (sort = { key: 'type', dir })} filterKind="values" filterValues={typeValues} selected={excludedType} ontoggle={(value) => { const next = new Set(excludedType); next.has(value) ? next.delete(value) : next.add(value); excludedType = next; }} onselectall={(on) => (excludedType = on ? new Set() : new Set(typeValues.map((item) => item.value)))} /></th>
              <th class="has-menu"><ClassicColMenu label={t('Period')} sortable sortDir={sort?.key === 'period' ? sort.dir : null} onsort={(dir) => (sort = { key: 'period', dir })} filterKind="text" searchValue={periodSearch} onsearch={(value) => (periodSearch = value)} /></th>
              <th class="has-menu"><ClassicColMenu label={t('Service')} sortable sortDir={sort?.key === 'service' ? sort.dir : null} onsort={(dir) => (sort = { key: 'service', dir })} filterKind="values" filterValues={serviceValues} selected={excludedService} ontoggle={(value) => { const next = new Set(excludedService); next.has(value) ? next.delete(value) : next.add(value); excludedService = next; }} onselectall={(on) => (excludedService = on ? new Set() : new Set(serviceValues.map((item) => item.value)))} /></th>
              <th class="has-menu"><ClassicColMenu label={t('Status')} sortable sortDir={sort?.key === 'status' ? sort.dir : null} onsort={(dir) => (sort = { key: 'status', dir })} filterKind="values" filterValues={[{ value: 'pending', label: t('pending') }, { value: 'approved', label: t('approved') }, { value: 'rejected', label: t('rejected') }, { value: 'cancelled', label: t('cancelled') }]} selected={excludedStatus} ontoggle={(value) => { const next = new Set(excludedStatus); next.has(value) ? next.delete(value) : next.add(value); excludedStatus = next; }} onselectall={(on) => (excludedStatus = on ? new Set() : new Set(['pending', 'approved', 'rejected', 'cancelled']))} /></th>
              <th></th>
            </tr>
          </thead>
          {#if !rows.length}
            <tbody><tr><td colspan="6"><div class="cl-empty"><strong>{t('Nothing to review')}</strong><span>{t('Time-off requests appear here as employees send them.')}</span></div></td></tr></tbody>
          {:else}
            {#each groups as group (group.key)}
              <tbody>
                {#if groupBy !== 'none'}<ClassicGroupRow colspan={6} label={group.label} meta={t('{count} requests', { count: group.rows.length })} collapsed={collapsedGroups.includes(group.key)} ontoggle={() => toggleGroup(group.key)} />{/if}
                {#if !collapsedGroups.includes(group.key)}
                {#each group.rows as absence (absence.id)}
                  {@const service = asService(absence.service_key)}
                  <tr class:is-attention={absence.status === 'pending'}>
                    <td><span class="cl-table__name is-employee"><span class="cl-avatar" style="--avatar-color:{employeeColor.get(absence.employee_id) ?? 'var(--cl-muted)'}">{personInitials(employeeName.get(absence.employee_id) ?? '?')}</span>{employeeName.get(absence.employee_id) ?? '—'}</span></td>
                    <td><span class="cl-cellstack"><span class="is-quiet">{typeName.get(absence.absence_type_id ?? '') ?? '—'}</span>{#if absence.employee_comment}<small class="cl-cellsub">{absence.employee_comment}</small>{/if}</span></td>
                    <td><span class="cl-cellstack period"><time datetime={absence.start_date}>{formatDate(absence.start_date)}{#if absence.end_date !== absence.start_date} → {formatDate(absence.end_date)}{/if}</time><small class="cl-cellsub">{durationLabel(absence)}</small></span></td>
                    <td>{#if service}<ClassicService {service} />{:else}<span class="is-quiet">{t('Full day')}</span>{/if}</td>
                    <td><ClassicCellBadge label={absence.status} tone={toneFor(absence.status)} icon={iconFor(absence.status)} /></td>
                    <td class="menu-cell">
                      {#if absence.status === 'pending'}
                        <ClassicRowMenu
                          disabled={!teamContext.editable || busy === absence.id}
                          items={[
                            { label: t('Approve'), onselect: () => void resolve(absence.id, absence.employee_id, 'approve') },
                            { label: t('Reject'), tone: 'danger', onselect: () => void resolve(absence.id, absence.employee_id, 'reject') }
                          ]}
                        />
                      {/if}
                    </td>
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
  .menu-cell { width: 44px; }
  .view-switch { display: inline-flex; overflow: hidden; border: 1px solid var(--cl-line-strong); border-radius: var(--cl-radius); background: var(--cl-surface); }
  .view-switch button { min-height: 32px; padding: 5px 10px; border: 0; border-left: 1px solid var(--cl-line); background: transparent; color: var(--cl-muted); font: inherit; font-size: 12px; font-weight: var(--rst-fw-medium); cursor: pointer; }
  .view-switch button:first-child { border-left: 0; }
  .view-switch button:hover { color: var(--cl-ink); background: var(--cl-surface-muted); }
  .view-switch button.is-active { color: var(--cl-accent); background: var(--cl-accent-wash); font-weight: var(--rst-fw-bold); }
  .settings-link { min-height: 32px; display: inline-flex; align-items: center; padding: 5px 9px; color: var(--cl-muted); font-size: 12px; font-weight: var(--rst-fw-medium); text-decoration: none; }
  .settings-link:hover { color: var(--cl-accent); text-decoration: underline; text-underline-offset: 2px; }
  .period time { color: var(--cl-ink); font-size: 13px; font-variant-numeric: tabular-nums; white-space: nowrap; }
  .dot { width: 7px; height: 7px; border-radius: 50%; background: var(--cl-line-strong); display: inline-block; }
  .dot.is-orange { background: var(--cl-attention); }
</style>
