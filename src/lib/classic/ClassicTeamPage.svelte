<script lang="ts">
  import { onMount, type Snippet } from 'svelte';
  import { friendlyError } from '$lib/api/error-messages';
  import { t } from '$lib/i18n/i18n.svelte';
  import { unsavedChanges } from '$lib/navigation/unsaved-changes.svelte';
  import { teamDraftValidationError, type EmployeeDraft } from '$lib/team/team-model';
  import { toasts } from '$lib/ui/toast.svelte';
  import { workspace } from '$lib/workspace/workspace.svelte';
  import ClassicPage from './ClassicPage.svelte';
  import { teamDraft } from './classic-team.svelte';

  /**
   * Shared Team workspace: one roster draft, one save path and one route-leave
   * guard across People, Contracts, Access and Absences.
   */
  let {
    actions,
    children
  }: {
    actions?: Snippet;
    children: Snippet<[ClassicTeamContext]>;
  } = $props();

  export type ClassicTeamContext = {
    employees: EmployeeDraft[];
    jobName: Map<string, string>;
    contractName: Map<string, string>;
    editable: boolean;
    owner: boolean;
    saving: boolean;
    save: () => Promise<void>;
    discard: () => void;
    saveEmployee: (employee: EmployeeDraft) => Promise<void>;
  };

  let saving = $state(false);
  const team = $derived(workspace.team);

  $effect(() => {
    if (workspace.activeId && workspace.effectiveRole !== 'employee') {
      void workspace.loadTeam().catch(() => undefined);
    }
  });

  $effect(() => {
    const role = workspace.effectiveRole;
    if (team && workspace.activeId && role && role !== 'employee') {
      void teamDraft.prepare(team, workspace.activeId, role).catch(() => undefined);
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
    save,
    discard,
    saveEmployee
  });
</script>

{#snippet pageActions()}
  {#if actions}{@render actions()}{/if}
  <span class="toolbar-grow"></span>
  <button
    class="cl-btn is-icon"
    type="button"
    disabled={saving || !teamDraft.dirty || !team}
    title={t('Discard')}
    aria-label={t('Discard')}
    onclick={discard}
  >
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 12a8 8 0 1 0 2.3-5.7L4 8.6"/><path d="M4 4v4.6h4.6"/></svg>
  </button>
  <button
    class="cl-btn is-primary is-icon"
    type="button"
    disabled={saving || workspace.isPreview || !teamDraft.dirty || teamDraft.supplementaryLoading || Boolean(teamDraft.supplementaryError)}
    title={t(saving ? 'Saving…' : 'Save')}
    aria-label={t(saving ? 'Saving…' : 'Save')}
    onclick={() => void save().catch(() => undefined)}
  >
    {#if saving}<span aria-hidden="true">…</span>{:else}<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" aria-hidden="true"><path d="M5 4h12l2 2v14H5z"/><path d="M8 4v6h8V4M8 20v-6h8v6"/></svg>{/if}
  </button>
{/snippet}

<ClassicPage actions={pageActions}>
  {#if team}
    {@render children(context)}
  {:else}
    <div class="cl-card">
      <div class="cl-empty"><strong>{t('Loading your workspace')}</strong></div>
    </div>
  {/if}
</ClassicPage>
