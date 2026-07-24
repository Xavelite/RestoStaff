<script lang="ts">
  import { t } from '$lib/i18n/i18n.svelte';
  import { buildEmployeeColorMap } from '$lib/ui/position-color';
  import { personInitials } from '$lib/ui/person';
  import { workspace } from '$lib/workspace/workspace.svelte';
  import type { EmployeeDraft } from '$lib/team/team-model';
  import { newEmployeeDraft } from '$lib/team/team-model';
  import ClassicStatus from '$lib/classic/ClassicStatus.svelte';
  import ClassicTeamPage from '$lib/classic/ClassicTeamPage.svelte';
  import EmployeeInlineEditor from '$lib/classic/EmployeeInlineEditor.svelte';
  import { teamDraft } from '$lib/classic/classic-team.svelte';
  import { dragReorder, moved } from '$lib/classic/dragReorder';

  type Scope = 'active' | 'archived' | 'all';
  type GroupBy = 'position' | 'contract' | 'none';
  type EmployeeGroup = { key: string; label: string; employees: EmployeeDraft[] };

  let search = $state('');
  let scope = $state<Scope>('active');
  let groupBy = $state<GroupBy>('position');
  let freshId = $state('');
  let detailId = $state('');

  const employeeColor = $derived(
    workspace.team
      ? buildEmployeeColorMap(workspace.team.job_functions, workspace.team.employee_job_functions)
      : new Map<string, string>()
  );

  function addEmployee() {
    if (workspace.isPreview || !workspace.team) return;
    const draft = newEmployeeDraft(crypto.randomUUID());
    draft.displayName = '';
    teamDraft.employees = [draft, ...teamDraft.employees];
    freshId = draft.id;
    detailId = draft.id;
    scope = 'active';
    groupBy = 'position';
    search = '';
  }

  function closeDetails() {
    detailId = '';
    freshId = '';
  }

  function setName(employee: EmployeeDraft, value: string) {
    const patch: Partial<EmployeeDraft> = { displayName: value };
    if (!employee.firstName.trim() && !employee.lastName.trim()) {
      patch.firstName = value.split(' ')[0] ?? '';
      patch.lastName = value.split(' ').slice(1).join(' ');
    }
    teamDraft.update(employee.id, patch);
  }

  function togglePosition(employee: EmployeeDraft, id: string, on: boolean) {
    teamDraft.update(employee.id, {
      jobFunctionIds: on
        ? [...new Set([...employee.jobFunctionIds, id])]
        : employee.jobFunctionIds.filter((item) => item !== id)
    });
  }

  const canReorder = $derived(
    !search.trim() && scope === 'all' && groupBy === 'none' && !detailId && !workspace.isPreview
  );

  function moveEmployee(from: number, to: number) {
    teamDraft.employees = moved(teamDraft.employees, from, to);
  }

  function matches(employee: EmployeeDraft, jobName: Map<string, string>, contractName: Map<string, string>): boolean {
    if (employee.id === freshId) return true;
    const term = search.trim().toLowerCase();
    if (scope === 'active' && !employee.active) return false;
    if (scope === 'archived' && employee.active) return false;
    if (!term) return true;
    const positions = employee.jobFunctionIds.map((id) => jobName.get(id) ?? '').join(' ');
    const contract = contractName.get(employee.contractTypeId) ?? '';
    return `${employee.displayName} ${employee.email} ${employee.phone} ${positions} ${contract}`
      .toLowerCase()
      .includes(term);
  }

  function grouped(
    rows: EmployeeDraft[],
    jobName: Map<string, string>,
    contractName: Map<string, string>
  ): EmployeeGroup[] {
    if (groupBy === 'none') return [{ key: 'all', label: '', employees: rows }];
    const groups = new Map<string, EmployeeGroup>();
    for (const employee of rows) {
      const id = groupBy === 'position' ? employee.jobFunctionIds[0] ?? '' : employee.contractTypeId;
      const label = id
        ? (groupBy === 'position' ? jobName.get(id) : contractName.get(id)) ?? t('Unknown')
        : groupBy === 'position'
          ? t('No position yet')
          : t('No contract yet');
      const key = id || '__undefined__';
      const group = groups.get(key) ?? { key, label, employees: [] };
      group.employees.push(employee);
      groups.set(key, group);
    }
    return [...groups.values()].sort((left, right) => {
      if (left.key === '__undefined__') return -1;
      if (right.key === '__undefined__') return 1;
      return left.label.localeCompare(right.label);
    });
  }

  const accessTone: Record<string, 'ok' | 'attention' | 'problem'> = {
    active: 'ok',
    disabled: 'problem',
    expired: 'problem',
    invited: 'attention',
    revoked: 'attention',
    not_invited: 'attention'
  };
</script>

<svelte:head><title>{t('Team')} &middot; restogogo</title></svelte:head>

<ClassicTeamPage>
  {#snippet children(team)}
    {@const rows = team.employees.filter((employee) => matches(employee, team.jobName, team.contractName))}
    {@const groups = grouped(rows, team.jobName, team.contractName)}

    {#if teamDraft.supplementaryError && team.owner}
      <div class="cl-notice" role="alert">{teamDraft.supplementaryError}</div>
    {/if}

    <div class="cl-datatable">
      <div class="cl-datatable__tools">
        <span class="cl-datatable__search">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.2-3.2" /></svg>
          <input class="cl-field" type="search" placeholder={t('Search employees')} bind:value={search} />
        </span>
        <select class="cl-field" aria-label={t('Group employees')} bind:value={groupBy}>
          <option value="position">{t('Group by position')}</option>
          <option value="contract">{t('Group by contract')}</option>
          <option value="none">{t('No grouping')}</option>
        </select>
        <select class="cl-field" aria-label={t('Employee status')} bind:value={scope}>
          <option value="active">{t('Active')}</option>
          <option value="archived">{t('Archived')}</option>
          <option value="all">{t('All')}</option>
        </select>
        <span class="cl-grow"></span>
        <button class="cl-btn" type="button" disabled={workspace.isPreview || !workspace.team} onclick={addEmployee}>
          <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>
          <span class="cl-action-label">{t('Add employee')}</span>
        </button>
      </div>

      <div class="cl-tablewrap">
        <table class="cl-table">
          <thead>
            <tr>
              <th class="cl-grip"></th>
              <th>{t('Name')}</th>
              <th>{t('Position')}</th>
              <th>{t('Email')}</th>
              <th>{t('Phone')}</th>
              <th>{t('Contract')}</th>
              <th>{t('Access')}</th>
              <th>{t('Active')}</th>
              <th></th>
            </tr>
          </thead>
          {#if !rows.length}
            <tbody><tr><td colspan="9"><div class="cl-empty"><strong>{t('No employees match')}</strong><span>{t('Change the filter, or add someone to the team.')}</span></div></td></tr></tbody>
          {:else}
            {#each groups as group (group.key)}
              <tbody use:dragReorder={{ onmove: moveEmployee, enabled: canReorder }}>
                {#if groupBy !== 'none'}
                  <tr class="cl-group-row"><td colspan="9">{group.label}<span class="cl-group-row__count">{t('{count} people', { count: group.employees.length })}</span></td></tr>
                {/if}
                {#each group.employees as employee, index (employee.id)}
                  {@const isNew = employee.id === freshId}
                  <tr class:is-attention={isNew} draggable={canReorder} data-drag={index}>
                    <td class="cl-grip" aria-hidden="true">{canReorder ? '⠿' : ''}</td>
                    <td>
                      <span class="cl-table__name">
                        <span class="cl-avatar" style="--avatar-color:{employeeColor.get(employee.id) ?? 'var(--cl-muted)'}">{personInitials(employee.displayName || '?')}</span>
                        <input class="cl-field namefield" placeholder={t('Full name')} value={employee.displayName} disabled={!team.editable} oninput={(event) => setName(employee, event.currentTarget.value)} />
                      </span>
                    </td>
                    <td>
                      <details class="posmenu">
                        <summary>{employee.jobFunctionIds.map((id) => team.jobName.get(id)).filter(Boolean).join(', ') || t('No position yet')}</summary>
                        <div class="posmenu__list">
                          {#if team.jobName.size}
                            {#each [...team.jobName] as [id, name] (id)}
                              <label><input type="checkbox" disabled={!team.editable} checked={employee.jobFunctionIds.includes(id)} onchange={(event) => togglePosition(employee, id, event.currentTarget.checked)} />{name}</label>
                            {/each}
                          {:else}
                            <span>{t('Create positions in Restaurant first.')}</span>
                          {/if}
                        </div>
                      </details>
                    </td>
                    <td><input class="cl-field cellfield" type="email" placeholder={t('Email')} value={employee.email} disabled={!team.editable} oninput={(event) => teamDraft.update(employee.id, { email: event.currentTarget.value })} /></td>
                    <td><input class="cl-field cellfield phonefield" type="tel" placeholder={t('Phone')} value={employee.phone} disabled={!team.editable} oninput={(event) => teamDraft.update(employee.id, { phone: event.currentTarget.value })} /></td>
                    <td class="is-quiet">{team.contractName.get(employee.contractTypeId) ?? '—'}</td>
                    <td><ClassicStatus label={employee.accessState.replace('_', ' ')} tone={accessTone[employee.accessState] ?? 'attention'} /></td>
                    <td><label class="switch"><input type="checkbox" disabled={!team.editable} checked={employee.active} onchange={(event) => teamDraft.update(employee.id, { active: event.currentTarget.checked })} /><span>{t(employee.active ? 'Active' : 'Archived')}</span></label></td>
                    <td class="is-num"><button class="cl-btn detail" type="button" disabled={!team.editable} onclick={() => (detailId = employee.id)}>{t('Details')}</button></td>
                  </tr>
                {/each}
              </tbody>
            {/each}
          {/if}
        </table>
      </div>
    </div>

    {#if detailId}
      <EmployeeInlineEditor employeeId={detailId} mode="people" saving={team.saving} isNew={detailId === freshId} onclose={closeDetails} onsave={team.saveEmployee} />
    {/if}
  {/snippet}
</ClassicTeamPage>

<style>
  .namefield { min-width: 140px; height: 34px; }
  .cellfield { min-width: 150px; height: 34px; }
  .phonefield { min-width: 125px; }
  .switch { display: inline-flex; align-items: center; gap: 8px; font-size: 14px; }
  .switch input { width: 16px; height: 16px; accent-color: var(--cl-accent); }
  .detail { min-height: 30px; padding: 4px 10px; font-size: 13px; }
  .posmenu { position: relative; }
  .posmenu summary { list-style: none; padding: 6px 10px; border: 1px solid var(--cl-line-strong); border-radius: var(--cl-radius); color: var(--cl-ink); font-size: 14px; cursor: pointer; white-space: nowrap; }
  .posmenu summary::-webkit-details-marker { display: none; }
  .posmenu[open] summary { border-color: var(--cl-accent); }
  .posmenu__list { position: absolute; z-index: var(--rst-z-popover, 120); top: calc(100% + 4px); left: 0; display: grid; gap: 6px; min-width: 200px; padding: 10px 12px; border: 1px solid var(--cl-line-strong); border-radius: var(--cl-radius); background: var(--cl-surface); box-shadow: 0 8px 24px rgba(0,0,0,.12); }
  .posmenu__list label { display: flex; align-items: center; gap: 8px; font-size: 14px; }
  .posmenu__list input { width: 15px; height: 15px; accent-color: var(--cl-accent); }
  .posmenu__list span { color: var(--cl-muted); font-size: 12px; }
</style>
