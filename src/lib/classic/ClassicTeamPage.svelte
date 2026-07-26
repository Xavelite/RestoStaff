<script lang="ts">
  import { onMount, setContext, untrack, type Snippet } from 'svelte';
  import { friendlyError } from '$lib/api/error-messages';
  import { t } from '$lib/i18n/i18n.svelte';
  import { unsavedChanges } from '$lib/navigation/unsaved-changes.svelte';
  import { teamDraftValidationError, type EmployeeDraft } from '$lib/team/team-model';
  import { toasts } from '$lib/ui/toast.svelte';
  import { workspace } from '$lib/workspace/workspace.svelte';
  import ClassicPage from './ClassicPage.svelte';
  import { teamDraft } from './classic-team.svelte';
  import { CLASSIC_TEAM_CONTEXT, type ClassicTeamContext } from './classic-workspace-context';

  /**
   * Shared Team workspace: one roster draft, one save path and one route-leave
   * guard across People, Contracts, Access and Absences. Each page owns its own
   * table controls and contextual save actions through the shared panel.
   */
  let {
    children
  }: {
    children: Snippet<[ClassicTeamContext]>;
  } = $props();

  let saving = $state(false);
  const team = $derived(workspace.team);

  $effect(() => {
    if (workspace.activeId && workspace.effectiveRole !== 'employee') {
      void Promise.all([workspace.loadTeam(), workspace.loadRestaurant()]).catch(() => undefined);
    }
  });

  // React only to the inputs — the workspace, the loaded team snapshot and the
  // role. prepare() reads and writes the draft's own state (employees,
  // employmentTerms), so it MUST run untracked: letting the effect see those
  // reads and writes is a read-and-write-the-same-state loop and blows the
  // effect update depth. The draft's async loads update the UI through the
  // `context` derived, not through this effect.
  $effect(() => {
    const snapshot = team;
    const activeId = workspace.activeId;
    const role = workspace.effectiveRole;
    if (snapshot && activeId && role && role !== 'employee') {
      untrack(() => void teamDraft.prepare(snapshot, activeId, role).catch(() => undefined));
    }
  });

  function discard(): void {
    if (team) teamDraft.reload(team);
  }

  async function save(): Promise<void> {
    const restaurantId = workspace.activeId;
    const role = workspace.effectiveRole;
    if (!restaurantId || !role || saving) return;
    const validationError = teamDraftValidationError(teamDraft.employees);
    if (validationError) {
      const error = new Error(t(validationError));
      toasts.show(error.message, 'warning');
      throw error;
    }

    saving = true;
    try {
      await teamDraft.save(restaurantId, role);
      toasts.show(t('Team saved.'), 'success');
    } catch (error) {
      toasts.show(friendlyError(error), 'danger');
      throw error;
    } finally {
      saving = false;
    }
  }

  async function saveEmployee(employee: EmployeeDraft): Promise<void> {
    const previous = teamDraft.clone(employee.id);
    teamDraft.update(employee.id, employee);
    try {
      await save();
    } catch (error) {
      // A failed base save leaves the draft dirty and can be rolled back. A
      // partial server save deliberately reloads server truth and is already
      // clean, so restoring the old local row would create a false mismatch.
      if (teamDraft.dirty) {
        if (previous) teamDraft.update(previous.id, previous);
        else teamDraft.remove(employee.id);
      }
      throw error;
    }
  }

  onMount(() =>
    unsavedChanges.register({
      id: 'team-workspace',
      label: 'Team',
      navigationScopes: ['/team', '/payroll/employees'],
      isDirty: () => teamDraft.dirty,
      save,
      discard
    })
  );

  const context = $derived<ClassicTeamContext>({
    employees: teamDraft.employees,
    jobName: new Map((team?.job_functions ?? []).map((job) => [job.id, job.name])),
    contractName: new Map((team?.contract_types ?? []).map((type) => [type.id, type.name])),
    editable: !workspace.isPreview,
    owner: workspace.effectiveRole === 'owner',
    saving,
    dirty: teamDraft.dirty,
    canSave: !workspace.isPreview,
    save,
    discard,
    saveEmployee
  });

  setContext(CLASSIC_TEAM_CONTEXT, () => context);
</script>

<ClassicPage>
  {#if team}
    {@render children(context)}
  {:else}
    <div class="cl-card">
      <div class="cl-empty"><strong>{t('Loading your workspace')}</strong></div>
    </div>
  {/if}
</ClassicPage>
