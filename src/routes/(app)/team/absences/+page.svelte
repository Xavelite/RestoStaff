<script lang="ts">
  import { CalendarDays, Check, Inbox, X } from '@lucide/svelte';
  import { saveAbsence } from '$lib/api/mutations';
  import { friendlyError } from '$lib/api/error-messages';
  import { activeServicePeriods, serviceLabel, type ServiceKey } from '$lib/calendar/date';
  import { t } from '$lib/i18n/i18n.svelte';
  import { personInitials } from '$lib/ui/person';
  import { buildEmployeeColorMap } from '$lib/ui/position-color';
  import { toasts } from '$lib/ui/toast.svelte';
  import { workspace } from '$lib/workspace/workspace.svelte';
  import { useWorkspaceTeamContext } from '$lib/workspace-ui/workspace-context';
  import WorkspaceService from '$lib/workspace-ui/WorkspaceService.svelte';
  import WorkspaceCellBadge from '$lib/workspace-ui/WorkspaceCellBadge.svelte';
  import WorkspaceRowMenu from '$lib/workspace-ui/WorkspaceRowMenu.svelte';
  import WorkspaceColMenu from '$lib/workspace-ui/WorkspaceColMenu.svelte';
  import WorkspacePrimaryColMenu from '$lib/workspace-ui/WorkspacePrimaryColMenu.svelte';
  import WorkspaceGroupRow from '$lib/workspace-ui/WorkspaceGroupRow.svelte';
  import WorkspaceTablePanel from '$lib/workspace-ui/WorkspaceTablePanel.svelte';
  import WorkspaceRosterLegend from '$lib/workspace-ui/WorkspaceRosterLegend.svelte';

  /** Payment semantics, phrased once for the legend that replaced the types page. */
  const PAID_LABEL: Record<string, string> = {
    paid: 'Paid',
    unpaid: 'Unpaid',
    neutral: 'Neutral'
  };
  import { workspaceLayout } from '$lib/workspace-ui/workspace-layout.svelte';
  import { createTableView } from '$lib/workspace-ui/table-view.svelte';
  import type { ManagerOperationsReadModel } from '$lib/api/workspace-snapshot';

  const employeeColor = $derived(
    workspace.team
      ? buildEmployeeColorMap(
          workspace.team.job_functions,
          workspace.team.employee_job_functions,
          workspace.restaurant?.work_areas ?? [],
          workspace.restaurant?.job_function_areas ?? []
        )
      : new Map<string, string>()
  );

  function asService(value: string | null): ServiceKey | null {
    return value?.trim() || null;
  }

  let busy = $state('');
  const team = $derived(workspace.team);
  const services = $derived(activeServicePeriods(workspace.operations?.services));

  function serviceName(serviceKey: ServiceKey): string {
    return serviceLabel(serviceKey, workspace.operations?.services);
  }

  type SortKey = 'employee' | 'type' | 'period' | 'service' | 'status';
  type GroupBy = 'status' | 'employee' | 'type' | 'none';

  // "Needs review" is simply the Status column filtered to pending, so this page
  // filters the same way as every other table instead of owning a segmented
  // control of its own.
  const view = createTableView<SortKey, GroupBy>({
    defaultExcluded: { status: ['approved', 'rejected', 'cancelled'] }
  });


  type AbsenceRow = ManagerOperationsReadModel['absences'][number];
  type AbsenceGroup = { key: string; label: string; rows: AbsenceRow[] };
  type AbsenceLane = { status: string; label: string; rows: AbsenceRow[] };

  function groupedRows(rows: AbsenceRow[], employeeName: Map<string, string>, typeNameForGroup: Map<string, string>): AbsenceGroup[] {
    if (!view.grouping) return [{ key: 'all', label: '', rows }];
    const map = new Map<string, AbsenceGroup>();
    for (const absence of rows) {
      const key = view.groupBy === 'status' ? absence.status : view.groupBy === 'employee' ? absence.employee_id : absence.absence_type_id ?? '__none__';
      const label = view.groupBy === 'status' ? t(absence.status) : view.groupBy === 'employee' ? employeeName.get(absence.employee_id) ?? t('Unknown') : key === '__none__' ? t('No type') : typeNameForGroup.get(key) ?? t('Unknown');
      const group = map.get(key) ?? { key, label, rows: [] };
      group.rows.push(absence);
      map.set(key, group);
    }
    return [...map.values()].sort((a, b) => a.label.localeCompare(b.label));
  }

  function visualAbsenceLanes(rows: AbsenceRow[]): AbsenceLane[] {
    const lanes: AbsenceLane[] = [
      { status: 'pending', label: 'Needs review', rows: [] },
      { status: 'approved', label: 'Approved', rows: [] },
      { status: 'rejected', label: 'Rejected', rows: [] },
      { status: 'cancelled', label: 'Cancelled', rows: [] }
    ];
    for (const absence of rows.toSorted((left, right) => right.start_date.localeCompare(left.start_date))) {
      lanes.find((lane) => lane.status === absence.status)?.rows.push(absence);
    }
    return lanes;
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

  const readTeamContext = useWorkspaceTeamContext();
  const teamContext = $derived(readTeamContext());
</script>

<svelte:head><title>{t('Time off')} &middot; restogogo</title></svelte:head>

{#if teamContext}
{@const employeeName = new Map(teamContext.employees.map((employee) => [employee.id, employee.displayName]))}
    {@const typeName = new Map((team?.absence_types ?? []).map((type) => [type.id, type.name]))}
    {@const typeLegend = (team?.absence_types ?? [])
      .filter((type) => type.active)
      .map((type) => ({
        tone: type.paid_policy === 'paid' ? 'available' : type.paid_policy === 'unpaid' ? 'absence' : 'planned',
        label: `${type.name} · ${t(PAID_LABEL[type.paid_policy ?? 'neutral'] ?? 'Neutral')}${type.requires_approval ? ` · ${t('Needs approval')}` : ''}`
      }))}
    {@const allAbsences = team?.absences ?? []}
    {@const filteredAbsences = allAbsences
      .filter((absence) => !view.isExcluded('status', absence.status))
      .filter((absence) => !view.isExcluded('type', absence.absence_type_id ?? '__none__'))
      .filter((absence) => !view.isExcluded('service', asService(absence.service_key) ?? 'full_day'))
      .filter((absence) => view.matchesSearch('period', `${absence.start_date} ${absence.end_date}`))
      .filter((absence) => view.matchesSearch('employee', `${employeeName.get(absence.employee_id) ?? ''} ${typeName.get(absence.absence_type_id ?? '') ?? ''} ${absence.status}`))}
    {@const rows = view.sort
      ? view.ordered(filteredAbsences, (absence: AbsenceRow, key: SortKey) =>
          key === 'employee'
            ? employeeName.get(absence.employee_id) ?? ''
            : key === 'type'
              ? typeName.get(absence.absence_type_id ?? '') ?? ''
              : key === 'period'
                ? absence.start_date
                : key === 'service'
                  ? asService(absence.service_key) ?? ''
                  : absence.status
        )
      : [...filteredAbsences].sort((left, right) => right.start_date.localeCompare(left.start_date))}
    {@const groups = groupedRows(rows, employeeName, typeName)}
    {@const typeValues = [{ value: '__none__', label: t('No type') }, ...[...typeName].map(([value, label]) => ({ value, label }))]}
    {@const serviceValues = [
      ...services.map((service) => ({ value: service.service_key, label: t(service.name) })),
      { value: 'full_day', label: t('Full day') }
    ]}
    {@const statusValues = [{ value: 'pending', label: t('pending') }, { value: 'approved', label: t('approved') }, { value: 'rejected', label: t('rejected') }, { value: 'cancelled', label: t('cancelled') }]}

    <WorkspaceTablePanel>
      {#snippet meta()}
        {@const requestCount = workspaceLayout.visual ? allAbsences.length : rows.length}
        <span><i class="dot"></i>{requestCount === 1 ? t('1 request') : t('{count} requests', { count: requestCount })}</span>
        <span><i class="dot is-orange"></i>{t('{count} pending', { count: allAbsences.filter((absence) => absence.status === 'pending').length })}</span>
      {/snippet}
      {#snippet children()}
      {#if workspaceLayout.visual}
        {#if !allAbsences.length}
          <div class="cl-empty leave-empty"><span class="cl-empty__icon" aria-hidden="true"><Inbox size={18} /></span><strong>{t('Nothing to review')}</strong><span>{t('Time-off requests appear here as employees send them.')}</span></div>
        {:else}
          <div class="leave-lanes" aria-label={t('Time off lifecycle')}>
            {#each visualAbsenceLanes(allAbsences) as lane (lane.status)}
              <section class="leave-lane is-{lane.status}">
                <header>
                  <span><strong>{t(lane.label)}</strong><small>{lane.rows.length}</small></span>
                  <i aria-hidden="true"></i>
                </header>
                <div class="leave-lane__requests">
                  {#each lane.rows as absence (absence.id)}
                    {@const service = asService(absence.service_key)}
                    <article class="leave-ticket" style={`--person-tone:${employeeColor.get(absence.employee_id) ?? 'var(--cl-line-strong)'}`}>
                      <header>
                        <span class="cl-avatar">{personInitials(employeeName.get(absence.employee_id) ?? '?')}</span>
                        <span>
                          <strong>{employeeName.get(absence.employee_id) ?? '—'}</strong>
                          <small>{typeName.get(absence.absence_type_id ?? '') ?? t('No type')}</small>
                        </span>
                        <WorkspaceCellBadge label={absence.status} tone={toneFor(absence.status)} icon={iconFor(absence.status)} />
                      </header>
                      <div class="leave-ticket__period">
                        <CalendarDays size={14} aria-hidden="true" />
                        <strong>{formatDate(absence.start_date)}{#if absence.end_date !== absence.start_date} → {formatDate(absence.end_date)}{/if}</strong>
                        <span>{durationLabel(absence)}</span>
                      </div>
                      <div class="leave-ticket__meta">
                        {#if service}<WorkspaceService {service} label={serviceName(service)} />{:else}<span>{t('Full day')}</span>{/if}
                        {#if absence.employee_comment}<p>{absence.employee_comment}</p>{/if}
                      </div>
                      {#if absence.status === 'pending'}
                        <footer>
                          <button class="cl-btn" type="button" disabled={!teamContext.editable || busy === absence.id} onclick={() => void resolve(absence.id, absence.employee_id, 'reject')}><X size={14} aria-hidden="true" />{t('Reject')}</button>
                          <button class="cl-btn is-primary" type="button" disabled={!teamContext.editable || busy === absence.id} onclick={() => void resolve(absence.id, absence.employee_id, 'approve')}><Check size={14} aria-hidden="true" />{t('Approve')}</button>
                        </footer>
                      {/if}
                    </article>
                  {:else}
                    <span class="leave-lane__empty">{t('No requests')}</span>
                  {/each}
                </div>
              </section>
            {/each}
          </div>
        {/if}
      {:else}
      <div class="cl-tablewrap">
        <table class="cl-table">
          {#if allAbsences.length}
            <thead>
              <tr>
                <th class="has-menu"><WorkspacePrimaryColMenu label={t('Employee')} sortable sortDir={view.sortDir('employee')} onsort={(dir) => view.setSort('employee', dir)} filterKind="text" searchValue={view.search('employee')} onsearch={(value) => view.setSearch('employee', value)} groupValue={view.groupBy} groupOptions={[{ value: 'none', label: t('No grouping') }, { value: 'status', label: t('Status') }, { value: 'employee', label: t('Employee') }, { value: 'type', label: t('Type') }]} ongroupchange={(value) => view.setGroupBy(value as GroupBy)} /></th>
                <th class="has-menu"><WorkspaceColMenu label={t('Type')} sortable sortDir={view.sortDir('type')} onsort={(dir) => view.setSort('type', dir)} filterKind="values" filterValues={typeValues} selected={view.excluded('type')} ontoggle={(value) => view.toggleValue('type', value)} onselectall={(on) => view.selectAll('type', on, typeValues)} /></th>
                <th class="has-menu"><WorkspaceColMenu label={t('Period')} sortable sortDir={view.sortDir('period')} onsort={(dir) => view.setSort('period', dir)} filterKind="text" searchValue={view.search('period')} onsearch={(value) => view.setSearch('period', value)} /></th>
                <th class="has-menu"><WorkspaceColMenu label={t('Service')} sortable sortDir={view.sortDir('service')} onsort={(dir) => view.setSort('service', dir)} filterKind="values" filterValues={serviceValues} selected={view.excluded('service')} ontoggle={(value) => view.toggleValue('service', value)} onselectall={(on) => view.selectAll('service', on, serviceValues)} /></th>
                <th class="has-menu"><WorkspaceColMenu label={t('Status')} sortable sortDir={view.sortDir('status')} onsort={(dir) => view.setSort('status', dir)} filterKind="values" filterValues={statusValues} selected={view.excluded('status')} ontoggle={(value) => view.toggleValue('status', value)} onselectall={(on) => view.selectAll('status', on, statusValues)} /></th>
                <th></th>
              </tr>
            </thead>
          {/if}
          {#if !rows.length}
            <tbody><tr><td colspan="6"><div class="cl-empty"><span class="cl-empty__icon" aria-hidden="true"><Inbox size={18} /></span><strong>{t('Nothing to review')}</strong><span>{t('Time-off requests appear here as employees send them.')}</span></div></td></tr></tbody>
          {:else}
            {#each groups as group (group.key)}
              <tbody>
                {#if view.grouping}<WorkspaceGroupRow colspan={6} label={group.label} meta={t('{count} requests', { count: group.rows.length })} collapsed={view.isCollapsed(group.key)} ontoggle={() => view.toggleGroup(group.key)} />{/if}
                {#if !view.isCollapsed(group.key)}
                {#each group.rows as absence (absence.id)}
                  {@const service = asService(absence.service_key)}
                  <tr class:is-attention={absence.status === 'pending'}>
                    <td><span class="cl-table__name is-employee"><span class="cl-avatar" style="--avatar-color:{employeeColor.get(absence.employee_id) ?? 'var(--cl-muted)'}">{personInitials(employeeName.get(absence.employee_id) ?? '?')}</span>{employeeName.get(absence.employee_id) ?? '—'}</span></td>
                    <td><span class="cl-cellstack"><span class="is-quiet">{typeName.get(absence.absence_type_id ?? '') ?? '—'}</span>{#if absence.employee_comment}<small class="cl-cellsub">{absence.employee_comment}</small>{/if}</span></td>
                    <td><span class="cl-cellstack period"><time datetime={absence.start_date}>{formatDate(absence.start_date)}{#if absence.end_date !== absence.start_date} → {formatDate(absence.end_date)}{/if}</time><small class="cl-cellsub">{durationLabel(absence)}</small></span></td>
                    <td>{#if service}<WorkspaceService {service} label={serviceName(service)} />{:else}<span class="is-quiet">{t('Full day')}</span>{/if}</td>
                    <td><WorkspaceCellBadge label={absence.status} tone={toneFor(absence.status)} icon={iconFor(absence.status)} /></td>
                    <td class="menu-cell">
                      {#if absence.status === 'pending'}
                        <WorkspaceRowMenu
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
      {/if}

      <!-- The time-off types were a whole page of read-only reference data that
           nobody could edit. They belong here as a legend, next to the requests
           they classify, exactly as Schedule and Time explain their own colours. -->
      <WorkspaceRosterLegend items={typeLegend} hint={t('Types are set up with your restaurant policy.')} />
      {/snippet}
    </WorkspaceTablePanel>

{/if}

<style>
  .leave-empty { min-height: 190px; }
  .leave-lanes {
    display: grid;
    grid-template-columns: repeat(4, minmax(240px, 1fr));
    gap: 12px;
    padding: 14px;
    overflow-x: auto;
  }
  .leave-lane { --lane-tone: var(--cl-line-strong); min-width: 240px; align-self: start; }
  .leave-lane.is-pending { --lane-tone: var(--rst-state-warning); }
  .leave-lane.is-approved { --lane-tone: var(--cl-ok); }
  .leave-lane.is-rejected { --lane-tone: var(--rst-state-danger); }
  .leave-lane.is-cancelled { --lane-tone: var(--cl-muted); }
  .leave-lane > header { display: flex; align-items: center; gap: 9px; min-height: 36px; padding: 0 3px 8px; }
  .leave-lane > header > span { display: flex; align-items: center; gap: 7px; }
  .leave-lane > header strong { font-size: var(--rst-fs-label); }
  .leave-lane > header small { min-width: 22px; padding: 2px 6px; border-radius: var(--rst-ui-radius-pill); color: var(--lane-tone); background: color-mix(in srgb, var(--lane-tone) 12%, transparent); font-size: var(--rst-fs-micro); text-align: center; }
  .leave-lane > header i { flex: 1; height: 1px; background: linear-gradient(90deg, color-mix(in srgb, var(--lane-tone) 40%, transparent), transparent); }
  .leave-lane__requests { display: grid; gap: 8px; }
  .leave-ticket {
    display: grid;
    gap: 10px;
    padding: 12px;
    border: 1px solid var(--cl-line);
    border-top: 3px solid var(--lane-tone);
    border-radius: var(--rst-ui-radius-md);
    background: var(--rst-ui-surface-panel);
  }
  .leave-ticket > header { min-width: 0; display: grid; grid-template-columns: auto minmax(0, 1fr) auto; align-items: center; gap: 8px; }
  .leave-ticket > header .cl-avatar { --avatar-color: var(--person-tone); }
  .leave-ticket > header > span:nth-child(2) { min-width: 0; display: grid; gap: 2px; }
  .leave-ticket > header strong { overflow: hidden; font-size: var(--rst-fs-body); text-overflow: ellipsis; white-space: nowrap; }
  .leave-ticket > header small { overflow: hidden; color: var(--cl-muted); font-size: var(--rst-fs-caption); text-overflow: ellipsis; white-space: nowrap; }
  .leave-ticket__period { display: grid; grid-template-columns: auto minmax(0, 1fr) auto; align-items: center; gap: 6px; padding: 9px; border-radius: var(--rst-ui-radius-sm); background: var(--rst-ui-surface-field); font-variant-numeric: tabular-nums; }
  .leave-ticket__period :global(svg) { color: var(--lane-tone); }
  .leave-ticket__period strong { font-size: var(--rst-fs-control); }
  .leave-ticket__period span { color: var(--cl-muted); font-size: var(--rst-fs-caption); font-weight: var(--rst-fw-bold); }
  .leave-ticket__meta { min-width: 0; display: flex; align-items: center; flex-wrap: wrap; gap: 7px; color: var(--cl-muted); font-size: var(--rst-fs-caption); }
  .leave-ticket__meta p { min-width: 0; flex: 1 1 100%; overflow: hidden; margin: 0; text-overflow: ellipsis; white-space: nowrap; }
  .leave-ticket footer { display: flex; justify-content: flex-end; gap: 7px; padding-top: 9px; border-top: 1px solid var(--rst-ui-divider-soft); }
  .leave-ticket footer .cl-btn { min-height: 30px; }
  .leave-lane__empty { display: grid; place-items: center; min-height: 92px; border: 1px dashed var(--cl-line); border-radius: var(--rst-ui-radius-md); color: var(--cl-muted); font-size: var(--rst-fs-label); }
  .period time { color: var(--cl-ink); font-size: var(--rst-fs-body); font-variant-numeric: tabular-nums; white-space: nowrap; }
  @media (max-width: 760px) {
    .leave-lanes { grid-template-columns: 1fr; padding: 10px; overflow: visible; }
    .leave-lane { min-width: 0; }
  }
</style>
