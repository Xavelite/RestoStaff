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
  import ClassicTeamPage from '$lib/classic/ClassicTeamPage.svelte';

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

  const team = $derived(workspace.team);

  function toneFor(status: string): 'ok' | 'attention' | 'problem' {
    if (status === 'approved') return 'ok';
    if (status === 'pending') return 'attention';
    return 'problem';
  }

  async function resolve(
    absenceId: string,
    employeeId: string,
    action: 'approve' | 'reject'
  ) {
    if (!workspace.activeId || busy) return;
    busy = absenceId;
    try {
      await saveAbsence({
        restaurantId: workspace.activeId,
        employeeId,
        absenceId,
        action,
        payload: {
          reason: action === 'approve' ? 'Approved from Team.' : 'Rejected from Team.'
        }
      });
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

<ClassicTeamPage subtitle="Absences">
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
      .sort((left, right) => right.start_date.localeCompare(left.start_date))}

    <div class="cl-toolbar">
      <select class="cl-field" bind:value={scope}>
        <option value="pending">{t('Awaiting decision')}</option>
        <option value="upcoming">{t('Upcoming')}</option>
        <option value="all">{t('All')}</option>
      </select>
      <span class="cl-toolbar__grow"></span>
      <span class="count">{t('{count} requests', { count: rows.length })}</span>
    </div>

    <div class="cl-tablewrap">
      <table class="cl-table">
        <thead>
          <tr>
            <th>{t('Name')}</th>
            <th>{t('Type')}</th>
            <th>{t('From')}</th>
            <th>{t('To')}</th>
            <th>{t('Service')}</th>
            <th>{t('Status')}</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {#if !rows.length}
            <tr>
              <td colspan="7">
                <div class="cl-empty">
                  <strong>{t('Nothing to review')}</strong>
                  <span>{t('Time-off requests appear here as employees send them.')}</span>
                </div>
              </td>
            </tr>
          {:else}
            {#each rows as absence (absence.id)}
              {@const service = asService(absence.service_key)}
              <tr class:is-attention={absence.status === 'pending'}>
                <td>
                  <span class="cl-table__name">
                    <span class="cl-avatar" style="--avatar-color:{employeeColor.get(absence.employee_id) ?? 'var(--cl-muted)'}">{personInitials(employeeName.get(absence.employee_id) ?? '?')}</span>
                    {employeeName.get(absence.employee_id) ?? '—'}
                  </span>
                </td>
                <td class="is-quiet">{typeName.get(absence.absence_type_id ?? '') ?? '—'}</td>
                <td class="is-quiet">{absence.start_date}</td>
                <td class="is-quiet">{absence.end_date}</td>
                <td>
                  {#if service}<ClassicService {service} />{:else}<span class="is-quiet">{t('Full day')}</span>{/if}
                </td>
                <td><ClassicStatus label={t(absence.status)} tone={toneFor(absence.status)} /></td>
                <td class="is-num">
                  {#if absence.status === 'pending'}
                    <span class="actions">
                      <button
                        class="cl-btn"
                        type="button"
                        disabled={!teamContext.editable || busy === absence.id}
                        onclick={() => resolve(absence.id, absence.employee_id, 'reject')}
                      >{t('Reject')}</button>
                      <button
                        class="cl-btn is-primary"
                        type="button"
                        disabled={!teamContext.editable || busy === absence.id}
                        onclick={() => resolve(absence.id, absence.employee_id, 'approve')}
                      >{t('Approve')}</button>
                    </span>
                  {/if}
                </td>
              </tr>
            {/each}
          {/if}
        </tbody>
      </table>
    </div>
  {/snippet}
</ClassicTeamPage>

<style>
  .count {
    color: var(--cl-muted);
    font-size: 14px;
  }
  .actions {
    display: inline-flex;
    gap: 8px;
  }
</style>

