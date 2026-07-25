<script lang="ts">
  import { saveAbsence } from '$lib/api/mutations';
  import { friendlyError } from '$lib/api/error-messages';
  import { type ServiceKey } from '$lib/calendar/date';
  import { t } from '$lib/i18n/i18n.svelte';
  import { personInitials } from '$lib/ui/person';
  import { buildEmployeeColorMap } from '$lib/ui/position-color';
  import { toasts } from '$lib/ui/toast.svelte';
  import { workspace } from '$lib/workspace/workspace.svelte';
  import ClassicService from '$lib/classic/ClassicService.svelte';
  import ClassicStatus from '$lib/classic/ClassicStatus.svelte';
  import ClassicColMenu from '$lib/classic/ClassicColMenu.svelte';
  import ClassicTeamPage from '$lib/classic/ClassicTeamPage.svelte';
  import ClassicTablePanel from '$lib/classic/ClassicTablePanel.svelte';
  import type { ManagerOperationsReadModel } from '$lib/api/workspace-snapshot';

  const employeeColor = $derived(
    workspace.team
      ? buildEmployeeColorMap(workspace.team.job_functions, workspace.team.employee_job_functions)
      : new Map<string, string>()
  );

  function asService(value: string | null): ServiceKey | null {
    return value === 'lunch' || value === 'evening' ? value : null;
  }

  let scope = $state<'pending' | 'upcoming' | 'all'>('pending');
  let busy = $state('');
  let search = $state('');
  let sort = $state<{ key: 'employee' | 'type' | 'from' | 'to' | 'service' | 'status'; dir: 'asc' | 'desc' } | null>(null);
  let groupBy = $state<'status' | 'employee' | 'none'>('status');
  const team = $derived(workspace.team);


  type AbsenceRow = ManagerOperationsReadModel['absences'][number];
  type AbsenceGroup = { key: string; label: string; rows: AbsenceRow[] };

  function groupedRows(rows: AbsenceRow[], employeeName: Map<string, string>): AbsenceGroup[] {
    if (groupBy === 'none') return [{ key: 'all', label: '', rows }];
    const map = new Map<string, AbsenceGroup>();
    for (const absence of rows) {
      const key = groupBy === 'status' ? absence.status : absence.employee_id;
      const label = groupBy === 'status' ? t(absence.status) : employeeName.get(absence.employee_id) ?? t('Unknown');
      const group = map.get(key) ?? { key, label, rows: [] };
      group.rows.push(absence);
      map.set(key, group);
    }
    return [...map.values()].sort((a, b) => a.label.localeCompare(b.label));
  }

  function toneFor(status: string): 'ok' | 'attention' | 'problem' {
    if (status === 'approved') return 'ok';
    if (status === 'pending') return 'attention';
    return 'problem';
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
</script>

<svelte:head><title>{t('Absences')} &middot; restogogo</title></svelte:head>

<ClassicTeamPage>
  {#snippet children(teamContext)}
    {@const today = new Date().toISOString().slice(0, 10)}
    {@const employeeName = new Map(teamContext.employees.map((employee) => [employee.id, employee.displayName]))}
    {@const typeName = new Map((team?.absence_types ?? []).map((type) => [type.id, type.name]))}
    {@const rows = (team?.absences ?? [])
      .filter((absence) =>
        scope === 'pending'
          ? absence.status === 'pending'
          : scope === 'upcoming'
            ? absence.end_date >= today && absence.status !== 'cancelled'
            : true
      )
      .filter((absence) => `${employeeName.get(absence.employee_id) ?? ''} ${typeName.get(absence.absence_type_id ?? '') ?? ''} ${absence.status}`.toLowerCase().includes(search.trim().toLowerCase()))
      .sort((left, right) => {
        if (!sort) return right.start_date.localeCompare(left.start_date);
        const factor = sort.dir === 'desc' ? -1 : 1;
        const serviceLeft = asService(left.service_key) ?? '';
        const serviceRight = asService(right.service_key) ?? '';
        const valueLeft = sort.key === 'employee' ? (employeeName.get(left.employee_id) ?? '') : sort.key === 'type' ? (typeName.get(left.absence_type_id ?? '') ?? '') : sort.key === 'from' ? left.start_date : sort.key === 'to' ? left.end_date : sort.key === 'service' ? serviceLeft : left.status;
        const valueRight = sort.key === 'employee' ? (employeeName.get(right.employee_id) ?? '') : sort.key === 'type' ? (typeName.get(right.absence_type_id ?? '') ?? '') : sort.key === 'from' ? right.start_date : sort.key === 'to' ? right.end_date : sort.key === 'service' ? serviceRight : right.status;
        return factor * valueLeft.localeCompare(valueRight);
      })}
    {@const groups = groupedRows(rows, employeeName)}

    <ClassicTablePanel>
      {#snippet meta()}
        <span><i class="dot"></i>{t('{count} requests', { count: rows.length })}</span>
        <span><i class="dot is-orange"></i>{t('{count} pending', { count: rows.filter((absence) => absence.status === 'pending').length })}</span>
      {/snippet}
      {#snippet actions()}
        <select class="cl-field filter" aria-label={t('Employee status')} bind:value={scope}>
          <option value="pending">{t('Awaiting decision')}</option>
          <option value="upcoming">{t('Upcoming')}</option>
          <option value="all">{t('All')}</option>
        </select>
      {/snippet}
      {#snippet children()}
      <div class="cl-tablewrap">
        <table class="cl-table">
          <thead>
            <tr>
              <th class="has-menu"><ClassicColMenu label={t('Employee')} sortable sortDir={sort?.key === 'employee' ? sort.dir : null} onsort={(dir) => (sort = { key: 'employee', dir })} groupable grouped={groupBy === 'employee'} ongroup={(on) => (groupBy = on ? 'employee' : 'none')} filterKind="text" searchValue={search} onsearch={(value) => (search = value)} /></th>
              <th class="has-menu"><ClassicColMenu label={t('Type')} sortable sortDir={sort?.key === 'type' ? sort.dir : null} onsort={(dir) => (sort = { key: 'type', dir })} /></th>
              <th class="has-menu"><ClassicColMenu label={t('From')} sortable sortDir={sort?.key === 'from' ? sort.dir : null} onsort={(dir) => (sort = { key: 'from', dir })} /></th>
              <th class="has-menu"><ClassicColMenu label={t('To')} sortable sortDir={sort?.key === 'to' ? sort.dir : null} onsort={(dir) => (sort = { key: 'to', dir })} /></th>
              <th class="has-menu"><ClassicColMenu label={t('Service')} sortable sortDir={sort?.key === 'service' ? sort.dir : null} onsort={(dir) => (sort = { key: 'service', dir })} /></th>
              <th class="has-menu"><ClassicColMenu label={t('Status')} sortable sortDir={sort?.key === 'status' ? sort.dir : null} onsort={(dir) => (sort = { key: 'status', dir })} groupable grouped={groupBy === 'status'} ongroup={(on) => (groupBy = on ? 'status' : 'none')} /></th>
              <th></th>
            </tr>
          </thead>
          {#if !rows.length}
            <tbody><tr><td colspan="7"><div class="cl-empty"><strong>{t('Nothing to review')}</strong><span>{t('Time-off requests appear here as employees send them.')}</span></div></td></tr></tbody>
          {:else}
            {#each groups as group (group.key)}
              <tbody>
                {#if groupBy !== 'none'}<tr class="cl-group-row"><td colspan="7">{group.label}<span class="cl-group-row__count">{t('{count} requests', { count: group.rows.length })}</span></td></tr>{/if}
                {#each group.rows as absence (absence.id)}
                  {@const service = asService(absence.service_key)}
                  <tr class:is-attention={absence.status === 'pending'}>
                    <td><span class="cl-table__name is-employee"><span class="cl-avatar" style="--avatar-color:{employeeColor.get(absence.employee_id) ?? 'var(--cl-muted)'}">{personInitials(employeeName.get(absence.employee_id) ?? '?')}</span>{employeeName.get(absence.employee_id) ?? '—'}</span></td>
                    <td class="is-quiet">{typeName.get(absence.absence_type_id ?? '') ?? '—'}</td>
                    <td class="is-quiet">{absence.start_date}</td>
                    <td class="is-quiet">{absence.end_date}</td>
                    <td>{#if service}<ClassicService {service} />{:else}<span class="is-quiet">{t('Full day')}</span>{/if}</td>
                    <td><ClassicStatus label={t(absence.status)} tone={toneFor(absence.status)} /></td>
                    <td class="is-num">{#if absence.status === 'pending'}<span class="actions"><button class="cl-btn" type="button" disabled={!teamContext.editable || busy === absence.id} onclick={() => resolve(absence.id, absence.employee_id, 'reject')}>{t('Reject')}</button><button class="cl-btn is-primary" type="button" disabled={!teamContext.editable || busy === absence.id} onclick={() => resolve(absence.id, absence.employee_id, 'approve')}>{t('Approve')}</button></span>{/if}</td>
                  </tr>
                {/each}
              </tbody>
            {/each}
          {/if}
        </table>
      </div>
      {/snippet}
    </ClassicTablePanel>
  {/snippet}
</ClassicTeamPage>

<style>
  .actions { display: inline-flex; gap: 8px; }
  .filter { min-width: 170px; }
  .dot { width: 7px; height: 7px; border-radius: 50%; background: var(--cl-line-strong); display: inline-block; }
  .dot.is-orange { background: var(--cl-attention); }
</style>
