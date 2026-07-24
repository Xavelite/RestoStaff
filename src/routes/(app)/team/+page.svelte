<script lang="ts">
  import { friendlyError } from '$lib/api/error-messages';
  import { t } from '$lib/i18n/i18n.svelte';
  import { buildEmployeeColorMap } from '$lib/ui/position-color';
  import { personInitials } from '$lib/ui/person';
  import { toasts } from '$lib/ui/toast.svelte';
  import { workspace } from '$lib/workspace/workspace.svelte';
  import type { EmployeeDraft } from '$lib/team/team-model';
  import { newEmployeeDraft } from '$lib/team/team-model';
  import ClassicStatus from '$lib/classic/ClassicStatus.svelte';
  import ClassicTeamPage from '$lib/classic/ClassicTeamPage.svelte';
  import EmployeeEditDialog from '$lib/classic/EmployeeEditDialog.svelte';
  import { teamDraft } from '$lib/classic/classic-team.svelte';
  import { dragReorder, moved } from '$lib/classic/dragReorder';

  type Scope = 'active' | 'archived' | 'all';
  type GroupBy = 'position' | 'contract' | 'none';
  type EmployeeGroup = { key: string; label: string; employees: EmployeeDraft[] };

  let search = $state('');
  let scope = $state<Scope>('active');
  let groupBy = $state<GroupBy>('position');
  let saving = $state(false);
  let freshId = $state('');
  let detailId = $state('');

  const employeeColor = $derived(
    workspace.team
      ? buildEmployeeColorMap(workspace.team.job_functions, workspace.team.employee_job_functions)
      : new Map<string, string>()
  );

  function addEmployee() {
    const draft = newEmployeeDraft(crypto.randomUUID());
    draft.displayName = '';
    teamDraft.employees = [draft, ...teamDraft.employees];
    freshId = draft.id;
    scope = 'active';
    search = '';
  }

  function setName(employee: EmployeeDraft, value: string) {
    teamDraft.update(employee.id, {
      displayName: value,
      firstName: value.split(' ')[0] ?? '',
      lastName: value.split(' ').slice(1).join(' ')
    });
  }

  function togglePosition(employee: EmployeeDraft, id: string, on: boolean) {
    teamDraft.update(employee.id, {
      jobFunctionIds: on
        ? [...employee.jobFunctionIds, id]
        : employee.jobFunctionIds.filter((item) => item !== id)
    });
  }

  async function persist(closeDialog = false) {
    if (!workspace.activeId || saving) return;
    const role = workspace.effectiveRole;
    if (!role) return;
    const blank = teamDraft.employees.find((employee) => !employee.displayName.trim());
    if (blank) {
      toasts.show(t('Give every new employee a name before saving.'), 'warning');
      return;
    }
    saving = true;
    try {
      await teamDraft.save(workspace.activeId, role);
      freshId = '';
      if (closeDialog) detailId = '';
      toasts.show(t('Team saved.'), 'success');
    } catch (error) {
      toasts.show(friendlyError(error), 'danger');
    } finally {
      saving = false;
    }
  }

  async function commitDetail(employee: EmployeeDraft) {
    teamDraft.update(employee.id, employee);
    await persist(true);
  }

  const canReorder = $derived(
    !search.trim() && scope === 'all' && groupBy === 'none' && !workspace.isPreview
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

{#snippet pageActions()}
  <input class="cl-field topbar-search" type="search" placeholder={t('Search employees')} bind:value={search} />
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
  <button class="cl-btn" type="button" disabled={workspace.isPreview} title={t('Add employee')} onclick={addEmployee}>
    <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>
    <span class="cl-action-label">{t('Add employee')}</span>
  </button>
  <button class="cl-btn is-icon" type="button" disabled={saving || !teamDraft.dirty || !workspace.team} title={t('Discard')} aria-label={t('Discard')} onclick={() => workspace.team && teamDraft.reload(workspace.team)}>
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 12a8 8 0 1 0 2.3-5.7L4 8.6"/><path d="M4 4v4.6h4.6"/></svg>
  </button>
  <button class="cl-btn is-primary is-icon" type="button" disabled={saving || workspace.isPreview || !teamDraft.dirty} title={t(saving ? 'Saving…' : 'Save')} aria-label={t(saving ? 'Saving…' : 'Save')} onclick={() => persist()}>
    {#if saving}
      <span aria-hidden="true">…</span>
    {:else}
      <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" aria-hidden="true"><path d="M5 4h12l2 2v14H5z"/><path d="M8 4v6h8V4M8 20v-6h8v6"/></svg>
    {/if}
  </button>
{/snippet}

<ClassicTeamPage actions={pageActions}>
  {#snippet children(team)}
    {@const rows = team.employees.filter((employee) => matches(employee, team.jobName, team.contractName))}
    {@const groups = grouped(rows, team.jobName, team.contractName)}

    {#if teamDraft.supplementaryError && team.owner}
      <div class="cl-notice" role="alert">{teamDraft.supplementaryError}</div>
    {/if}

    <div class="table-meta">
      <span>{t('{count} people', { count: rows.length })}</span>
      {#if groupBy !== 'none'}<span>{t('Undefined employees are shown first.')}</span>{/if}
    </div>

    <div class="cl-tablewrap">
      <table class="cl-table">
        <thead>
          <tr>
            <th class="cl-grip"></th>
            <th>{t('Name')}</th>
            <th>{t('Position')}</th>
            <th>{t('Contract')}</th>
            <th class="is-num">{t('Weekly hours')}</th>
            <th>{t('Access')}</th>
            <th>{t('Active')}</th>
            <th></th>
          </tr>
        </thead>
        {#if !rows.length}
          <tbody><tr><td colspan="8"><div class="cl-empty"><strong>{t('No employees match')}</strong><span>{t('Change the filter, or add someone to the team.')}</span></div></td></tr></tbody>
        {:else}
          {#each groups as group (group.key)}
            <tbody use:dragReorder={{ onmove: moveEmployee, enabled: canReorder }}>
              {#if groupBy !== 'none'}
                <tr class="cl-group-row"><td colspan="8">{group.label}<span class="cl-group-row__count">{t('{count} people', { count: group.employees.length })}</span></td></tr>
              {/if}
              {#each group.employees as employee, index (employee.id)}
                {@const isNew = !employee.displayName.trim() || employee.id === freshId}
                <tr class:is-attention={isNew} draggable={canReorder} data-drag={index}>
                  <td class="cl-grip" aria-hidden="true">{canReorder ? '⠿' : ''}</td>
                  <td>
                    <span class="cl-table__name">
                      <span class="cl-avatar" style="--avatar-color:{employeeColor.get(employee.id) ?? 'var(--cl-muted)'}">{personInitials(employee.displayName || '?')}</span>
                      <input class="cl-field namefield" placeholder={t('Full name')} value={employee.displayName} oninput={(event) => setName(employee, event.currentTarget.value)} />
                    </span>
                  </td>
                  <td>
                    <details class="posmenu">
                      <summary>{employee.jobFunctionIds.map((id) => team.jobName.get(id)).filter(Boolean).join(', ') || t('No position yet')}</summary>
                      <div class="posmenu__list">
                        {#each [...team.jobName] as [id, name] (id)}
                          <label><input type="checkbox" checked={employee.jobFunctionIds.includes(id)} onchange={(event) => togglePosition(employee, id, event.currentTarget.checked)} />{name}</label>
                        {/each}
                      </div>
                    </details>
                  </td>
                  <td class="is-quiet">{team.contractName.get(employee.contractTypeId) ?? '—'}</td>
                  <td class="is-num is-quiet">{employee.weeklyContractHours || '—'}</td>
                  <td><ClassicStatus label={employee.accessState.replace('_', ' ')} tone={accessTone[employee.accessState] ?? 'attention'} /></td>
                  <td>
                    <label class="switch"><input type="checkbox" checked={employee.active} onchange={(event) => teamDraft.update(employee.id, { active: event.currentTarget.checked })} /><span>{t(employee.active ? 'Active' : 'Archived')}</span></label>
                  </td>
                  <td class="is-num"><button class="cl-btn detail" type="button" onclick={() => (detailId = employee.id)}>{t('Details')}</button></td>
                </tr>
              {/each}
            </tbody>
          {/each}
        {/if}
      </table>
    </div>

    <EmployeeEditDialog open={Boolean(detailId)} employeeId={detailId} mode="people" {saving} onclose={() => (detailId = '')} onsave={commitDetail} />
  {/snippet}
</ClassicTeamPage>

<style>
  .table-meta { display: flex; justify-content: space-between; gap: 16px; color: var(--cl-muted); font-size: 13px; }
  .namefield { min-width: 140px; height: 34px; }
  .switch { display: inline-flex; align-items: center; gap: 8px; font-size: 14px; }
  .switch input { width: 16px; height: 16px; accent-color: var(--cl-accent); }
  .detail { min-height: 30px; padding: 4px 10px; font-size: 13px; }
  .posmenu { position: relative; }
  .posmenu summary { list-style: none; padding: 6px 10px; border: 1px solid var(--cl-line-strong); border-radius: var(--cl-radius); color: var(--cl-ink); font-size: 14px; cursor: pointer; white-space: nowrap; }
  .posmenu summary::-webkit-details-marker { display: none; }
  .posmenu[open] summary { border-color: var(--cl-accent); }
  .posmenu__list { position: absolute; z-index: var(--rst-z-popover, 120); top: calc(100% + 4px); left: 0; display: grid; gap: 6px; min-width: 180px; padding: 10px 12px; border: 1px solid var(--cl-line-strong); border-radius: var(--cl-radius); background: var(--cl-surface); box-shadow: 0 8px 24px rgba(0,0,0,.12); }
  .posmenu__list label { display: flex; align-items: center; gap: 8px; font-size: 14px; }
  .posmenu__list input { width: 15px; height: 15px; accent-color: var(--cl-accent); }
</style>
