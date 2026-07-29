<script lang="ts">
  import { page } from '$app/state';
  import { onMount } from 'svelte';
  import { t } from '$lib/i18n/i18n.svelte';
  import { personInitials } from '$lib/ui/person';
  import { buildEmployeeColorMap } from '$lib/ui/position-color';
  import { workspace } from '$lib/workspace/workspace.svelte';
  import type { EmployeeDraft } from '$lib/team/team-model';
  import ClassicStatus from '$lib/classic/ClassicStatus.svelte';
  import ClassicColMenu from '$lib/classic/ClassicColMenu.svelte';
  import ClassicPrimaryColMenu from '$lib/classic/ClassicPrimaryColMenu.svelte';
  import ClassicGroupRow from '$lib/classic/ClassicGroupRow.svelte';
  import ClassicColChooser from '$lib/classic/ClassicColChooser.svelte';
  import ClassicRowMenu from '$lib/classic/ClassicRowMenu.svelte';
  import ClassicPicker from '$lib/classic/ClassicPicker.svelte';
  import ClassicTeamPage from '$lib/classic/ClassicTeamPage.svelte';
  import ClassicTablePanel from '$lib/classic/ClassicTablePanel.svelte';
  import EmployeeInlineEditor from '$lib/classic/EmployeeInlineEditor.svelte';
  import { teamDraft } from '$lib/classic/classic-team.svelte';
  import { createTableView, peopleCountLabel } from '$lib/classic/table-view.svelte';

  type GroupBy = 'contract' | 'position' | 'worker' | 'status' | 'none';
  type Group = { key: string; label: string; employees: EmployeeDraft[] };
  type SortKey = 'employee' | 'contract' | 'position' | 'payrollId' | 'function' | 'worker' | 'basis' | 'rate' | 'status';

  let detailId = $state('');
  let lastEmployeeParam = $state<string | null>(null);

  const OPTIONAL_COLUMNS = [
    { key: 'contract', label: 'Contract' },
    { key: 'position', label: 'Position' },
    { key: 'payrollId', label: 'Payroll ID' },
    { key: 'function', label: 'CP 302 function' },
    { key: 'worker', label: 'Worker status' },
    { key: 'basis', label: 'Salary basis' },
    { key: 'rate', label: 'Rate' },
    { key: 'status', label: 'Status' }
  ] as const;
  const view = createTableView<SortKey, GroupBy>({
    storageKey: 'rst-payroll-employee-cols-v2',
    columns: OPTIONAL_COLUMNS,
    defaultGroupBy: 'contract'
  });
  const shown = view.shown;
  const colCount = $derived(view.colCount + 1);

  onMount(view.restore);

  const employeeColor = $derived(
    workspace.team
      ? buildEmployeeColorMap(
          workspace.team.job_functions,
          workspace.team.employee_job_functions,
          workspace.operations?.work_areas ?? [],
          workspace.operations?.job_function_areas ?? []
        )
      : new Map<string, string>()
  );

  $effect(() => {
    const requested = page.url.searchParams.get('employee');
    if (!requested || requested === lastEmployeeParam) return;
    if (!teamDraft.employees.some((employee) => employee.id === requested)) return;
    lastEmployeeParam = requested;
    detailId = requested;
  });

  const referenceFunctions = $derived(
    teamDraft.payrollCatalogue?.referenceFunctions.filter((item) => item.status === 'effective' || item.status === 'verified') ?? []
  );
  const functionOptions = $derived([
    { value: '', label: t('Not set') },
    ...referenceFunctions.map((item) => ({
      value: item.code,
      label: `${item.code} · ${item.name_en || item.name_fr || item.name_nl}`
    }))
  ]);
  const basisOptions = $derived([
    { value: '', label: t('Not set') },
    { value: 'hourly', label: t('Hourly') },
    { value: 'monthly', label: t('Monthly') }
  ]);

  const TERMS_STATUS: Record<string, { label: string; tone: 'ok' | 'attention' | 'problem' }> = {
    verified: { label: 'Verified', tone: 'ok' },
    complete: { label: 'Recorded', tone: 'ok' },
    recorded: { label: 'Needs review', tone: 'attention' },
    migrated_unverified: { label: 'Needs owner review', tone: 'problem' }
  };

  function payrollGaps(employee: EmployeeDraft): string[] {
    const missing: string[] = [];
    if (!employee.payrollEmployeeId) missing.push('Payroll ID');
    if (!employee.nationalRegistryNumber) missing.push('National registry number');
    if (!employee.iban) missing.push('IBAN');
    if (!employee.cp302ReferenceFunctionCode) missing.push('CP 302 function');
    if (!employee.workerStatus) missing.push('Worker status');
    if (!employee.salaryBasis) missing.push('Salary basis');
    return missing;
  }

  function matches(employee: EmployeeDraft, contractName: Map<string, string>, jobName: Map<string, string>): boolean {
    const placement = teamDraft.placement(employee);
    const rate = placement.salaryBasis === 'monthly'
      ? placement.contractualMonthlySalary
      : placement.contractualHourlyRate;
    if (!placement.active) return false;
    if (view.isExcluded('contract', placement.contractTypeId || '__none__')) return false;
    if (view.isExcluded('position', placement.jobFunctionIds[0] || '__none__')) return false;
    if (view.isExcluded('worker', placement.workerStatus || '__none__')) return false;
    if (view.isExcluded('basis', placement.salaryBasis || '__none__')) return false;
    if (view.isExcluded('status', payrollGaps(placement).length ? 'not_ready' : 'ready')) return false;
    if (!view.matchesSearch('payrollId', placement.payrollEmployeeId)) return false;
    if (!view.matchesSearch('function', placement.cp302ReferenceFunctionCode)) return false;
    if (!view.matchesSearch('rate', rate)) return false;
    return view.matchesSearch(
      'employee',
      `${placement.displayName} ${placement.payrollEmployeeId} ${contractName.get(placement.contractTypeId) ?? ''} ${placement.jobFunctionIds.map((id) => jobName.get(id) ?? '').join(' ')}`
    );
  }

  function grouped(rows: EmployeeDraft[], contractName: Map<string, string>, jobName: Map<string, string>): Group[] {
    if (!view.grouping) return [{ key: 'all', label: '', employees: rows }];
    const map = new Map<string, Group>();
    for (const employee of rows) {
      const placement = teamDraft.placement(employee);
      let key = '';
      let label = '';
      if (view.groupBy === 'contract') {
        key = placement.contractTypeId || '__none__';
        label = placement.contractTypeId ? contractName.get(placement.contractTypeId) ?? t('Unknown') : t('No contract yet');
      } else if (view.groupBy === 'position') {
        key = placement.jobFunctionIds[0] || '__none__';
        label = placement.jobFunctionIds[0] ? jobName.get(placement.jobFunctionIds[0]) ?? t('Unknown') : t('No position yet');
      } else if (view.groupBy === 'worker') {
        key = placement.workerStatus || '__none__';
        label = placement.workerStatus
          ? t(placement.workerStatus === 'blue_collar' ? 'Blue-collar worker' : 'White-collar employee')
          : t('Not set');
      } else {
        key = payrollGaps(placement).length ? 'not_ready' : 'ready';
        label = t(key === 'ready' ? 'Ready for payroll' : 'Not ready for payroll');
      }
      const group = map.get(key) ?? { key, label, employees: [] };
      group.employees.push(employee);
      map.set(key, group);
    }
    return [...map.values()].sort((left, right) => {
      if (left.key === '__none__') return -1;
      if (right.key === '__none__') return 1;
      return left.label.localeCompare(right.label);
    });
  }

  function setReferenceFunction(employee: EmployeeDraft, code: string) {
    const reference = referenceFunctions.find((item) => item.code === code);
    teamDraft.update(employee.id, {
      cp302ReferenceFunctionCode: code,
      cp302Category: reference?.category ?? '',
      workerStatus: reference?.default_worker_status ?? ''
    });
  }

  function sortValue(employee: EmployeeDraft, key: SortKey): string {
    const placement = teamDraft.placement(employee);
    switch (key) {
      case 'employee': return placement.displayName.toLowerCase();
      case 'contract': return placement.contractTypeId.toLowerCase();
      case 'position': return (placement.jobFunctionIds[0] ?? '').toLowerCase();
      case 'payrollId': return placement.payrollEmployeeId.toLowerCase();
      case 'function': return placement.cp302ReferenceFunctionCode.toLowerCase();
      case 'worker': return placement.workerStatus.toLowerCase();
      case 'basis': return placement.salaryBasis.toLowerCase();
      case 'rate': return placement.salaryBasis === 'monthly' ? placement.contractualMonthlySalary.toLowerCase() : placement.contractualHourlyRate.toLowerCase();
      case 'status': return payrollGaps(placement).length ? '1' : '0';
      default: return '';
    }
  }
  function ordered(rows: EmployeeDraft[]) {
    return view.ordered(rows, sortValue);
  }
</script>

<svelte:head><title>{t('Payroll')} &middot; restogogo</title></svelte:head>

<ClassicTeamPage>
  {#snippet children(team)}
    {@const rows = team.employees.filter((employee) => matches(employee, team.contractName, team.jobName))}
    {@const blocked = rows.filter((employee) => payrollGaps(employee).length).length}
    {@const groups = grouped(ordered(rows), team.contractName, team.jobName)}
    {@const contractValues = [{ value: '__none__', label: t('No contract') }, ...[...team.contractName].map(([id, name]) => ({ value: id, label: name }))]}
    {@const positionValues = [{ value: '__none__', label: t('No position') }, ...[...team.jobName].map(([id, name]) => ({ value: id, label: name }))]}
    {@const workerValues = [{ value: '__none__', label: t('Not set') }, { value: 'blue_collar', label: t('Blue-collar worker') }, { value: 'white_collar', label: t('White-collar employee') }]}
    {@const basisValues = [{ value: '__none__', label: t('Not set') }, { value: 'hourly', label: t('Hourly') }, { value: 'monthly', label: t('Monthly') }]}
    {@const statusValues = [{ value: 'ready', label: t('Ready for payroll') }, { value: 'not_ready', label: t('Not ready for payroll') }]}

    {#if teamDraft.supplementaryLoading}
      <div class="cl-notice" role="status">{t('Loading payroll configuration…')}</div>
    {:else if teamDraft.supplementaryError}
      <div class="cl-notice" role="alert">{teamDraft.supplementaryError}</div>
    {/if}


    <ClassicTablePanel dirty={team.dirty} saving={team.saving} canSave={team.canSave} onsave={() => void team.save().catch(() => undefined)} ondiscard={team.discard}>
      {#snippet meta()}
        <span><i class="dot"></i>{t('{count} employees', { count: rows.length })}</span>
        <span><i class="dot is-green"></i>{t('{count} ready', { count: rows.length - blocked })}</span>
        <span><i class="dot is-red"></i>{t('{count} blocked', { count: blocked })}</span>
      {/snippet}
      {#snippet children()}
      <div class="cl-tablewrap">
        <table class="cl-table payroll-table">
          <colgroup>
            <col class="col-employee" />
            {#if shown('status')}<col class="col-status" />{/if}
            {#if shown('contract')}<col class="col-contract" />{/if}
            {#if shown('position')}<col class="col-position" />{/if}
            {#if shown('payrollId')}<col class="col-payroll-id" />{/if}
            {#if shown('function')}<col class="col-function" />{/if}
            {#if shown('worker')}<col class="col-worker" />{/if}
            {#if shown('basis')}<col class="col-basis" />{/if}
            {#if shown('rate')}<col class="col-rate" />{/if}
            <col class="col-actions" />
          </colgroup>
          <thead>
            <tr>
              <th class="has-menu"><ClassicPrimaryColMenu label={t('Employee')} sortable sortDir={view.sortDir('employee')} onsort={(dir) => view.setSort('employee', dir)} filterKind="text" searchValue={view.search('employee')} onsearch={(value) => view.setSearch('employee', value)} groupValue={view.groupBy} groupOptions={[{ value: 'none', label: t('No grouping') }, { value: 'contract', label: t('Contract type') }, { value: 'position', label: t('Position') }, { value: 'worker', label: t('Worker status') }, { value: 'status', label: t('Status') }]} ongroupchange={(value) => view.setGroupBy(value as GroupBy)} /></th>
              {#if shown('status')}<th class="has-menu"><ClassicColMenu label={t('Status')} sortable sortDir={view.sortDir('status')} onsort={(dir) => view.setSort('status', dir)} filterKind="values" filterValues={statusValues} selected={view.excluded('status')} ontoggle={(value) => view.toggleValue('status', value)} onselectall={(on) => view.selectAll('status', on, statusValues)} /></th>{/if}
              {#if shown('contract')}<th class="has-menu"><ClassicColMenu label={t('Contract')} sortable sortDir={view.sortDir('contract')} onsort={(dir) => view.setSort('contract', dir)} filterKind="values" filterValues={contractValues} selected={view.excluded('contract')} ontoggle={(value) => view.toggleValue('contract', value)} onselectall={(on) => view.selectAll('contract', on, contractValues)} /></th>{/if}
              {#if shown('position')}<th class="has-menu"><ClassicColMenu label={t('Position')} sortable sortDir={view.sortDir('position')} onsort={(dir) => view.setSort('position', dir)} filterKind="values" filterValues={positionValues} selected={view.excluded('position')} ontoggle={(value) => view.toggleValue('position', value)} onselectall={(on) => view.selectAll('position', on, positionValues)} /></th>{/if}
              {#if shown('payrollId')}<th class="has-menu"><ClassicColMenu label={t('Payroll ID')} sortable sortDir={view.sortDir('payrollId')} onsort={(dir) => view.setSort('payrollId', dir)} filterKind="text" searchValue={view.search('payrollId')} onsearch={(value) => view.setSearch('payrollId', value)} /></th>{/if}
              {#if shown('function')}<th class="has-menu"><ClassicColMenu label={t('CP 302 function')} sortable sortDir={view.sortDir('function')} onsort={(dir) => view.setSort('function', dir)} filterKind="text" searchValue={view.search('function')} onsearch={(value) => view.setSearch('function', value)} /></th>{/if}
              {#if shown('worker')}<th class="has-menu"><ClassicColMenu label={t('Worker status')} sortable sortDir={view.sortDir('worker')} onsort={(dir) => view.setSort('worker', dir)} filterKind="values" filterValues={workerValues} selected={view.excluded('worker')} ontoggle={(value) => view.toggleValue('worker', value)} onselectall={(on) => view.selectAll('worker', on, workerValues)} /></th>{/if}
              {#if shown('basis')}<th class="has-menu"><ClassicColMenu label={t('Salary basis')} sortable sortDir={view.sortDir('basis')} onsort={(dir) => view.setSort('basis', dir)} filterKind="values" filterValues={basisValues} selected={view.excluded('basis')} ontoggle={(value) => view.toggleValue('basis', value)} onselectall={(on) => view.selectAll('basis', on, basisValues)} /></th>{/if}
              {#if shown('rate')}<th class="has-menu"><ClassicColMenu label={t('Rate')} sortable sortDir={view.sortDir('rate')} onsort={(dir) => view.setSort('rate', dir)} filterKind="text" searchValue={view.search('rate')} onsearch={(value) => view.setSearch('rate', value)} /></th>{/if}
              <th class="chooser-col"><ClassicColChooser columns={view.columns} hidden={view.hidden} ontoggle={view.toggleColumn} /></th>
            </tr>
          </thead>
          {#if !rows.length}
            <tbody><tr><td colspan={colCount}><div class="cl-empty"><strong>{t('No active employees')}</strong></div></td></tr></tbody>
          {:else}
            {#each groups as group (group.key)}
              <tbody>
                {#if view.grouping}<ClassicGroupRow colspan={colCount} label={group.label} meta={peopleCountLabel(group.employees.length)} collapsed={view.isCollapsed(group.key)} ontoggle={() => view.toggleGroup(group.key)} />{/if}
                {#if !view.isCollapsed(group.key)}
                {#each group.employees as employee (employee.id)}
                  {@const missing = payrollGaps(employee)}
                  {@const terms = TERMS_STATUS[employee.employmentSourceStatus]}
                  <tr class:is-problem={missing.length > 0}>
                    <td><span class="cl-table__name is-employee"><span class="cl-avatar" style="--avatar-color:{employeeColor.get(employee.id) ?? 'var(--cl-muted)'}">{personInitials(employee.displayName)}</span><span class="employee-name">{employee.displayName}</span></span></td>
                    <!-- The count is the signal; the row's own columns already
                         say which fields are empty, so the list is not repeated
                         on every line. The full list stays on hover. -->
                    {#if shown('status')}<td title={missing.length ? missing.map((item) => t(item)).join(', ') : undefined}>{#if missing.length}<ClassicStatus label={missing.length === 1 ? '1 detail missing' : '{count} details missing'} params={{ count: missing.length }} tone="problem" />{:else}<ClassicStatus label={terms?.label ?? 'Ready for payroll'} tone={terms?.tone ?? 'ok'} />{/if}</td>{/if}
                    {#if shown('contract')}<td>{team.contractName.get(employee.contractTypeId) ?? t('No contract yet')}</td>{/if}
                    {#if shown('position')}<td>{team.jobName.get(employee.jobFunctionIds[0] ?? '') ?? t('No position yet')}</td>{/if}
                    {#if shown('payrollId')}<td><input class="cl-field payrollid" value={employee.payrollEmployeeId} disabled={!team.canViewFinancials || !team.editable} oninput={(event) => teamDraft.update(employee.id, { payrollEmployeeId: event.currentTarget.value })} /></td>{/if}
                    {#if shown('function')}<td><ClassicPicker value={employee.cp302ReferenceFunctionCode} options={functionOptions} disabled={!team.canViewFinancials || !team.editable || teamDraft.supplementaryLoading} ariaLabel={`${t('CP 302 function')} · ${employee.displayName}`} onchange={(next) => setReferenceFunction(employee, next)} /></td>{/if}
                    {#if shown('worker')}<td class="is-quiet">{employee.workerStatus ? t(employee.workerStatus === 'blue_collar' ? 'Blue-collar worker' : 'White-collar employee') : '—'}</td>{/if}
                    {#if shown('basis')}<td><ClassicPicker value={employee.salaryBasis} options={basisOptions} disabled={!team.canViewFinancials || !team.editable} ariaLabel={`${t('Salary basis')} · ${employee.displayName}`} onchange={(next) => teamDraft.update(employee.id, { salaryBasis: next as EmployeeDraft['salaryBasis'] })} /></td>{/if}
                    {#if shown('rate')}<td>{#if employee.salaryBasis === 'monthly'}<input class="cl-field ratefield" inputmode="decimal" value={employee.contractualMonthlySalary} disabled={!team.canViewFinancials || !team.editable} oninput={(event) => teamDraft.update(employee.id, { contractualMonthlySalary: event.currentTarget.value })} />{:else}<input class="cl-field ratefield" inputmode="decimal" value={employee.contractualHourlyRate} disabled={!team.canViewFinancials || !team.editable} oninput={(event) => teamDraft.update(employee.id, { contractualHourlyRate: event.currentTarget.value })} />{/if}</td>{/if}
                    <td class="menu-cell">
                      <ClassicRowMenu
                        disabled={!team.canViewFinancials || !team.editable || teamDraft.supplementaryLoading}
                        items={[{ label: t('Open employee'), onselect: () => (detailId = employee.id) }]}
                      />
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

    {#if detailId}
      <EmployeeInlineEditor employeeId={detailId} mode="payroll" saving={team.saving} onclose={() => (detailId = '')} onsave={team.saveEmployee} />
    {/if}
  {/snippet}
</ClassicTeamPage>

<style>
  .payroll-table { min-width: 1480px; }
  .col-employee { width: 155px; }
  .col-contract { width: 120px; }
  .col-position { width: 130px; }
  .col-payroll-id { width: 145px; }
  .col-function { width: 220px; }
  .col-worker { width: 160px; }
  .col-basis { width: 150px; }
  .col-rate { width: 110px; }
  .col-status { width: 260px; }
  .col-actions { width: 44px; }
  .employee-name { font-weight: var(--rst-fw-medium); }
  .payrollid { min-width: 120px; height: 34px; }
  .ratefield { width: 105px; height: 34px; }
</style>
