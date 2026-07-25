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
  import ClassicColChooser from '$lib/classic/ClassicColChooser.svelte';
  import ClassicTeamPage from '$lib/classic/ClassicTeamPage.svelte';
  import ClassicTablePanel from '$lib/classic/ClassicTablePanel.svelte';
  import EmployeeInlineEditor from '$lib/classic/EmployeeInlineEditor.svelte';
  import { teamDraft } from '$lib/classic/classic-team.svelte';

  type GroupBy = 'contract' | 'position' | 'none';
  type Group = { key: string; label: string; employees: EmployeeDraft[] };
  type SortKey = 'employee' | 'contract' | 'position' | 'payrollId' | 'function' | 'worker' | 'basis' | 'rate' | 'status';

  let search = $state('');
  let groupBy = $state<GroupBy>('contract');
  let detailId = $state('');
  let lastEmployeeParam = $state<string | null>(null);
  let sort = $state<{ key: SortKey; dir: 'asc' | 'desc' } | null>(null);
  let excludedStatus = $state(new Set<string>());
  let excludedContract = $state(new Set<string>());
  let excludedPosition = $state(new Set<string>());

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
  const COLS_KEY = 'rst-payroll-employee-cols-v2';
  let hidden = $state(new Set<string>());

  const employeeColor = $derived(
    workspace.team
      ? buildEmployeeColorMap(workspace.team.job_functions, workspace.team.employee_job_functions)
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
    const term = search.trim().toLowerCase();
    if (!employee.active) return false;
    if (excludedContract.has(employee.contractTypeId || '__none__')) return false;
    if (excludedPosition.has(employee.jobFunctionIds[0] || '__none__')) return false;
    if (excludedStatus.has(payrollGaps(employee).length ? 'not_ready' : 'ready')) return false;
    return !term || `${employee.displayName} ${employee.payrollEmployeeId} ${contractName.get(employee.contractTypeId) ?? ''} ${employee.jobFunctionIds.map((id) => jobName.get(id) ?? '').join(' ')}`.toLowerCase().includes(term);
  }

  function grouped(rows: EmployeeDraft[], contractName: Map<string, string>, jobName: Map<string, string>): Group[] {
    if (groupBy === 'none') return [{ key: 'all', label: '', employees: rows }];
    const map = new Map<string, Group>();
    for (const employee of rows) {
      const id = groupBy === 'contract' ? employee.contractTypeId : employee.jobFunctionIds[0] ?? '';
      const label = id
        ? (groupBy === 'contract' ? contractName.get(id) : jobName.get(id)) ?? t('Unknown')
        : groupBy === 'contract' ? t('No contract yet') : t('No position yet');
      const key = id || '__undefined__';
      const group = map.get(key) ?? { key, label, employees: [] };
      group.employees.push(employee);
      map.set(key, group);
    }
    return [...map.values()].sort((left, right) => left.key === '__undefined__' ? -1 : right.key === '__undefined__' ? 1 : left.label.localeCompare(right.label));
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
    switch (key) {
      case 'employee': return employee.displayName.toLowerCase();
      case 'contract': return employee.contractTypeId.toLowerCase();
      case 'position': return (employee.jobFunctionIds[0] ?? '').toLowerCase();
      case 'payrollId': return employee.payrollEmployeeId.toLowerCase();
      case 'function': return employee.cp302ReferenceFunctionCode.toLowerCase();
      case 'worker': return employee.workerStatus.toLowerCase();
      case 'basis': return employee.salaryBasis.toLowerCase();
      case 'rate': return employee.salaryBasis === 'monthly' ? employee.contractualMonthlySalary.toLowerCase() : employee.contractualHourlyRate.toLowerCase();
      case 'status': return payrollGaps(employee).length ? '1' : '0';
      default: return '';
    }
  }
  function ordered(rows: EmployeeDraft[]) {
    if (!sort) return rows;
    const factor = sort.dir === 'desc' ? -1 : 1;
    return [...rows].sort((a, b) => factor * sortValue(a, sort!.key).localeCompare(sortValue(b, sort!.key)));
  }

  function toggleExcluded(set: Set<string>, value: string): Set<string> {
    const next = new Set(set);
    next.has(value) ? next.delete(value) : next.add(value);
    return next;
  }

  function persistHidden(next: Set<string>) {
    hidden = next;
    try { localStorage.setItem(COLS_KEY, JSON.stringify([...next])); } catch {}
  }
  function toggleColumn(key: string) {
    const next = new Set(hidden);
    next.has(key) ? next.delete(key) : next.add(key);
    const hiding = next.has(key);
    if (hiding && sort?.key === key) sort = null;
    if (key === 'contract' && hiding) {
      if (groupBy === 'contract') groupBy = 'none';
      excludedContract = new Set();
    }
    if (key === 'position' && hiding) {
      if (groupBy === 'position') groupBy = 'none';
      excludedPosition = new Set();
    }
    if (key === 'status' && hiding) excludedStatus = new Set();
    persistHidden(next);
  }
  const shown = (key: string) => !hidden.has(key);
  const colCount = $derived(2 + OPTIONAL_COLUMNS.filter((column) => shown(column.key)).length);

  onMount(() => {
    try {
      const raw = localStorage.getItem(COLS_KEY);
      if (raw) hidden = new Set(JSON.parse(raw) as string[]);
    } catch {
      hidden = new Set();
    }
  });
</script>

<svelte:head><title>{t('Payroll')} &middot; restogogo</title></svelte:head>

<ClassicTeamPage>
  {#snippet children(team)}
    {@const rows = team.employees.filter((employee) => matches(employee, team.contractName, team.jobName))}
    {@const blocked = rows.filter((employee) => payrollGaps(employee).length).length}
    {@const groups = grouped(ordered(rows), team.contractName, team.jobName)}
    {@const contractValues = [{ value: '__none__', label: t('No contract') }, ...[...team.contractName].map(([id, name]) => ({ value: id, label: name }))]}
    {@const positionValues = [{ value: '__none__', label: t('No position') }, ...[...team.jobName].map(([id, name]) => ({ value: id, label: name }))]}

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
          <thead>
            <tr>
              <th class="has-menu"><ClassicColMenu label={t('Employee')} sortable sortDir={sort?.key === 'employee' ? sort.dir : null} onsort={(dir) => (sort = { key: 'employee', dir })} filterKind="text" searchValue={search} onsearch={(value) => (search = value)} /></th>
              {#if shown('contract')}<th class="has-menu"><ClassicColMenu label={t('Contract')} sortable sortDir={sort?.key === 'contract' ? sort.dir : null} onsort={(dir) => (sort = { key: 'contract', dir })} groupable grouped={groupBy === 'contract'} ongroup={(on) => (groupBy = on ? 'contract' : 'none')} filterKind="values" filterValues={contractValues} selected={excludedContract} ontoggle={(value) => (excludedContract = toggleExcluded(excludedContract, value))} onselectall={(on) => (excludedContract = on ? new Set() : new Set(contractValues.map((item) => item.value)))} /></th>{/if}
              {#if shown('position')}<th class="has-menu"><ClassicColMenu label={t('Position')} sortable sortDir={sort?.key === 'position' ? sort.dir : null} onsort={(dir) => (sort = { key: 'position', dir })} groupable grouped={groupBy === 'position'} ongroup={(on) => (groupBy = on ? 'position' : 'none')} filterKind="values" filterValues={positionValues} selected={excludedPosition} ontoggle={(value) => (excludedPosition = toggleExcluded(excludedPosition, value))} onselectall={(on) => (excludedPosition = on ? new Set() : new Set(positionValues.map((item) => item.value)))} /></th>{/if}
              {#if shown('payrollId')}<th class="has-menu"><ClassicColMenu label={t('Payroll ID')} sortable sortDir={sort?.key === 'payrollId' ? sort.dir : null} onsort={(dir) => (sort = { key: 'payrollId', dir })} /></th>{/if}
              {#if shown('function')}<th class="has-menu"><ClassicColMenu label={t('CP 302 function')} sortable sortDir={sort?.key === 'function' ? sort.dir : null} onsort={(dir) => (sort = { key: 'function', dir })} /></th>{/if}
              {#if shown('worker')}<th class="has-menu"><ClassicColMenu label={t('Worker status')} sortable sortDir={sort?.key === 'worker' ? sort.dir : null} onsort={(dir) => (sort = { key: 'worker', dir })} /></th>{/if}
              {#if shown('basis')}<th class="has-menu"><ClassicColMenu label={t('Salary basis')} sortable sortDir={sort?.key === 'basis' ? sort.dir : null} onsort={(dir) => (sort = { key: 'basis', dir })} /></th>{/if}
              {#if shown('rate')}<th class="has-menu"><ClassicColMenu label={t('Rate')} sortable sortDir={sort?.key === 'rate' ? sort.dir : null} onsort={(dir) => (sort = { key: 'rate', dir })} /></th>{/if}
              {#if shown('status')}<th class="has-menu"><ClassicColMenu label={t('Status')} sortable sortDir={sort?.key === 'status' ? sort.dir : null} onsort={(dir) => (sort = { key: 'status', dir })} filterKind="values" filterValues={[{ value: 'ready', label: t('Ready for payroll') }, { value: 'not_ready', label: t('Not ready for payroll') }]} selected={excludedStatus} ontoggle={(value) => (excludedStatus = toggleExcluded(excludedStatus, value))} onselectall={(on) => (excludedStatus = on ? new Set() : new Set(['ready', 'not_ready']))} /></th>{/if}
              <th class="actions-col">{t('Actions')}</th>
              <th class="chooser-col"><ClassicColChooser columns={OPTIONAL_COLUMNS.map((column) => ({ key: column.key, label: t(column.label) }))} {hidden} ontoggle={toggleColumn} /></th>
            </tr>
          </thead>
          {#if !rows.length}
            <tbody><tr><td colspan={colCount + 1}><div class="cl-empty"><strong>{t('No active employees')}</strong></div></td></tr></tbody>
          {:else}
            {#each groups as group (group.key)}
              <tbody>
                {#if groupBy !== 'none'}<tr class="cl-group-row"><td colspan={colCount + 1}>{group.label}<span class="cl-group-row__count">{t('{count} people', { count: group.employees.length })}</span></td></tr>{/if}
                {#each group.employees as employee (employee.id)}
                  {@const missing = payrollGaps(employee)}
                  {@const terms = TERMS_STATUS[employee.employmentSourceStatus]}
                  <tr class:is-problem={missing.length > 0}>
                    <td><span class="cl-table__name is-employee"><span class="cl-avatar" style="--avatar-color:{employeeColor.get(employee.id) ?? 'var(--cl-muted)'}">{personInitials(employee.displayName)}</span><span class="employee-name">{employee.displayName}</span></span></td>
                    {#if shown('contract')}<td>{team.contractName.get(employee.contractTypeId) ?? t('No contract yet')}</td>{/if}
                    {#if shown('position')}<td>{team.jobName.get(employee.jobFunctionIds[0] ?? '') ?? t('No position yet')}</td>{/if}
                    {#if shown('payrollId')}<td><input class="cl-field payrollid" value={employee.payrollEmployeeId} disabled={!team.owner || !team.editable} oninput={(event) => teamDraft.update(employee.id, { payrollEmployeeId: event.currentTarget.value })} /></td>{/if}
                    {#if shown('function')}<td><select class="cl-field functionfield" value={employee.cp302ReferenceFunctionCode} disabled={!team.owner || !team.editable || teamDraft.supplementaryLoading} onchange={(event) => setReferenceFunction(employee, event.currentTarget.value)}><option value="">{t('Not set')}</option>{#each referenceFunctions as item (item.id)}<option value={item.code}>{item.code} · {item.name_en || item.name_fr || item.name_nl}</option>{/each}</select></td>{/if}
                    {#if shown('worker')}<td class="is-quiet">{employee.workerStatus ? t(employee.workerStatus === 'blue_collar' ? 'Blue-collar worker' : 'White-collar employee') : '—'}</td>{/if}
                    {#if shown('basis')}<td><select class="cl-field basisfield" value={employee.salaryBasis} disabled={!team.owner || !team.editable} onchange={(event) => teamDraft.update(employee.id, { salaryBasis: event.currentTarget.value as EmployeeDraft['salaryBasis'] })}><option value="">{t('Not set')}</option><option value="hourly">{t('Hourly')}</option><option value="monthly">{t('Monthly')}</option></select></td>{/if}
                    {#if shown('rate')}<td>{#if employee.salaryBasis === 'monthly'}<input class="cl-field ratefield" inputmode="decimal" value={employee.contractualMonthlySalary} disabled={!team.owner || !team.editable} oninput={(event) => teamDraft.update(employee.id, { contractualMonthlySalary: event.currentTarget.value })} />{:else}<input class="cl-field ratefield" inputmode="decimal" value={employee.contractualHourlyRate} disabled={!team.owner || !team.editable} oninput={(event) => teamDraft.update(employee.id, { contractualHourlyRate: event.currentTarget.value })} />{/if}</td>{/if}
                    {#if shown('status')}<td>{#if missing.length}<ClassicStatus label={missing.length === 1 ? '1 detail missing' : '{count} details missing'} params={{ count: missing.length }} tone="problem" /><span class="missing">{missing.map((item) => t(item)).join(', ')}</span>{:else}<ClassicStatus label={terms?.label ?? 'Ready for payroll'} tone={terms?.tone ?? 'ok'} />{/if}</td>{/if}
                    <td class="is-num"><button class="cl-btn edit" type="button" disabled={!team.owner || !team.editable || teamDraft.supplementaryLoading} onclick={() => (detailId = employee.id)}>{t('Details')}</button></td>
                    <td class="menu-cell"></td>
                  </tr>
                {/each}
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
  .employee-name { font-weight: var(--rst-fw-medium); }
  .missing { display: block; color: var(--cl-muted); font-size: 12px; }
  .edit { min-height: 32px; padding: 4px 10px; font-size: 13px; }
  .payrollid { min-width: 120px; height: 34px; }
  .functionfield { min-width: 210px; max-width: 280px; height: 34px; }
  .basisfield { min-width: 108px; height: 34px; }
  .ratefield { width: 105px; height: 34px; }
  .dot { width: 7px; height: 7px; border-radius: 50%; background: var(--cl-line-strong); display: inline-block; }
  .dot.is-green { background: var(--cl-ok); }
  .dot.is-red { background: var(--cl-problem); }
  .actions-col, .chooser-col, .menu-cell { width: 44px; }
</style>
