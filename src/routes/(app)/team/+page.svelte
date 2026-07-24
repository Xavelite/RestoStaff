<script lang="ts">
  import Dialog from '$lib/components/Dialog.svelte';
  import ActionButton from '$lib/components/ActionButton.svelte';
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
  import { teamDraft } from '$lib/classic/classic-team.svelte';

  let search = $state('');
  let scope = $state<'active' | 'archived' | 'all'>('active');
  let saving = $state(false);
  // A newly added row is inline-editable straight away, like Add area.
  let freshId = $state('');
  // Deeper fields (contact, identity) still live in a dialog reachable per row.
  let detailId = $state('');
  let form = $state<EmployeeDraft | null>(null);

  const employeeColor = $derived(
    workspace.team
      ? buildEmployeeColorMap(workspace.team.job_functions, workspace.team.employee_job_functions)
      : new Map<string, string>()
  );

  // Add employee behaves exactly like Add area / Add position: one click drops a
  // blank editable row into the roster. Name and position fill in inline; Save
  // persists the whole team.
  function addEmployee() {
    const draft = newEmployeeDraft(crypto.randomUUID());
    draft.displayName = '';
    // New rows land on top, matching Add area and Add position.
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

  async function save() {
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
      toasts.show(t('Team saved.'), 'success');
    } catch (error) {
      toasts.show(friendlyError(error), 'danger');
    } finally {
      saving = false;
    }
  }

  function openDetail(employee: EmployeeDraft) {
    form = { ...employee, jobFunctionIds: [...employee.jobFunctionIds] };
    detailId = employee.id;
  }

  async function commitDetail() {
    if (!workspace.activeId || !form || saving) return;
    const role = workspace.effectiveRole;
    if (!role) return;
    saving = true;
    try {
      teamDraft.update(form.id, form);
      await teamDraft.save(workspace.activeId, role);
      toasts.show(t('Team saved.'), 'success');
      detailId = '';
      form = null;
    } catch (error) {
      toasts.show(friendlyError(error), 'danger');
    } finally {
      saving = false;
    }
  }

  function matches(employee: EmployeeDraft): boolean {
    if (employee.id === freshId) return true;
    const term = search.trim().toLowerCase();
    if (scope === 'active' && !employee.active) return false;
    if (scope === 'archived' && employee.active) return false;
    if (!term) return true;
    return `${employee.displayName} ${employee.email} ${employee.phone}`
      .toLowerCase()
      .includes(term);
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
  <button class="cl-btn" type="button" disabled={workspace.isPreview} onclick={addEmployee}>
    <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>
    {t('Add employee')}
  </button>
  <button class="cl-btn is-primary" type="button" disabled={saving || workspace.isPreview} onclick={save}>
    {saving ? t('Saving…') : t('Save')}
  </button>
{/snippet}

<ClassicTeamPage actions={pageActions}>
  {#snippet children(team)}
    {@const rows = team.employees.filter(matches)}

    <div class="cl-toolbar">
      <input class="cl-field search" type="search" placeholder={t('Search employees')} bind:value={search} />
      <select class="cl-field" bind:value={scope}>
        <option value="active">{t('Active')}</option>
        <option value="archived">{t('Archived')}</option>
        <option value="all">{t('All')}</option>
      </select>
      <span class="cl-toolbar__grow"></span>
      <span class="count">{t('{count} people', { count: rows.length })}</span>
    </div>

    <div class="cl-tablewrap">
      <table class="cl-table">
        <thead>
          <tr>
            <th>{t('Name')}</th>
            <th>{t('Position')}</th>
            <th class="is-num">{t('Weekly hours')}</th>
            <th>{t('Access')}</th>
            <th>{t('Active')}</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {#if !rows.length}
            <tr>
              <td colspan="6">
                <div class="cl-empty">
                  <strong>{t('No employees match')}</strong>
                  <span>{t('Change the filter, or add someone to the team.')}</span>
                </div>
              </td>
            </tr>
          {:else}
            {#each rows as employee (employee.id)}
              {@const isNew = !employee.displayName.trim() || employee.id === freshId}
              <tr class:is-attention={isNew}>
                <td>
                  <span class="cl-table__name">
                    <span class="cl-avatar" style="--avatar-color:{employeeColor.get(employee.id) ?? 'var(--cl-muted)'}">{personInitials(employee.displayName || '?')}</span>
                    <input
                      class="cl-field namefield"
                      placeholder={t('Full name')}
                      value={employee.displayName}
                      oninput={(event) => setName(employee, event.currentTarget.value)}
                    />
                  </span>
                </td>
                <td>
                  <details class="posmenu">
                    <summary>
                      {employee.jobFunctionIds.map((id) => team.jobName.get(id)).filter(Boolean).join(', ') || t('No position yet')}
                    </summary>
                    <div class="posmenu__list">
                      {#each [...team.jobName] as [id, name] (id)}
                        <label>
                          <input
                            type="checkbox"
                            checked={employee.jobFunctionIds.includes(id)}
                            onchange={(event) => togglePosition(employee, id, event.currentTarget.checked)}
                          />
                          {name}
                        </label>
                      {/each}
                    </div>
                  </details>
                </td>
                <td class="is-num is-quiet">{employee.weeklyContractHours || '—'}</td>
                <td>
                  <ClassicStatus
                    label={employee.accessState.replace('_', ' ')}
                    tone={accessTone[employee.accessState] ?? 'attention'}
                  />
                </td>
                <td>
                  <label class="switch">
                    <input
                      type="checkbox"
                      checked={employee.active}
                      onchange={(event) => { teamDraft.update(employee.id, { active: event.currentTarget.checked }); }}
                    />
                    <span>{t(employee.active ? 'Active' : 'Archived')}</span>
                  </label>
                </td>
                <td class="is-num">
                  <button class="cl-btn detail" type="button" onclick={() => openDetail(employee)}>{t('Details')}</button>
                </td>
              </tr>
            {/each}
          {/if}
        </tbody>
      </table>
    </div>

    {#snippet footer()}
      <ActionButton label={t('Cancel')} disabled={saving} onclick={() => { detailId = ''; form = null; }} />
      <ActionButton label={saving ? t('Saving…') : t('Save')} tone="primary" disabled={saving || !team.editable} onclick={commitDetail} />
    {/snippet}

    <Dialog
      open={Boolean(detailId && form)}
      title={form?.displayName || t('Employee details')}
      description={t('Contact details for this employee. Contract and payroll live on their own pages.')}
      onclose={() => !saving && (detailId = '', form = null)}
      {footer}
    >
      {#if form}
        <div class="detailform">
          <div class="detailform__pair">
            <label class="cl-label">
              <span>{t('First name')}</span>
              <input class="cl-field" bind:value={form.firstName} />
            </label>
            <label class="cl-label">
              <span>{t('Last name')}</span>
              <input class="cl-field" bind:value={form.lastName} />
            </label>
          </div>
          <div class="detailform__pair">
            <label class="cl-label">
              <span>{t('Email')}</span>
              <input class="cl-field" type="email" bind:value={form.email} />
            </label>
            <label class="cl-label">
              <span>{t('Phone')}</span>
              <input class="cl-field" bind:value={form.phone} />
            </label>
          </div>
        </div>
      {/if}
    </Dialog>
  {/snippet}
</ClassicTeamPage>

<style>
  .search {
    min-width: 240px;
  }
  .count {
    color: var(--cl-muted);
    font-size: 14px;
  }
  .namefield {
    min-width: 140px;
    height: 34px;
  }
  .switch {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    font-size: 14px;
  }
  .switch input {
    width: 16px;
    height: 16px;
    accent-color: var(--cl-accent);
  }
  .detail {
    min-height: 30px;
    padding: 4px 10px;
    font-size: 13px;
  }
  /* A compact position picker in the cell — a native disclosure so it needs no
     popover machinery. */
  .posmenu {
    position: relative;
  }
  .posmenu summary {
    list-style: none;
    padding: 6px 10px;
    border: 1px solid var(--cl-line-strong);
    border-radius: var(--cl-radius);
    color: var(--cl-ink);
    font-size: 14px;
    cursor: pointer;
    white-space: nowrap;
  }
  .posmenu summary::-webkit-details-marker { display: none; }
  .posmenu[open] summary {
    border-color: var(--cl-accent);
  }
  .posmenu__list {
    position: absolute;
    z-index: var(--rst-z-popover, 120);
    top: calc(100% + 4px);
    left: 0;
    display: grid;
    gap: 6px;
    min-width: 180px;
    padding: 10px 12px;
    border: 1px solid var(--cl-line-strong);
    border-radius: var(--cl-radius);
    background: var(--cl-surface);
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.12);
  }
  .posmenu__list label {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 14px;
  }
  .posmenu__list input {
    width: 15px;
    height: 15px;
    accent-color: var(--cl-accent);
  }
  .detailform {
    display: grid;
    gap: 14px;
  }
  .detailform__pair {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 14px;
  }
</style>
