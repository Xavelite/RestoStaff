<script lang="ts">
  import type { Snippet } from 'svelte';
  import { t } from '$lib/i18n/i18n.svelte';
  import { workspace } from '$lib/workspace/workspace.svelte';
  import type { EmployeeDraft } from '$lib/team/team-model';
  import ClassicPage from './ClassicPage.svelte';
  import { teamDraft } from './classic-team.svelte';

  /**
   * The shell every Team sub-page shares: it loads the team read model, keeps
   * the shared roster draft in sync, and hands the page an active-first,
   * name-sorted list plus the lookups all four tables need.
   */
  let {
    actions,
    children
  }: {
    actions?: Snippet;
    children: Snippet<[ClassicTeamContext]>;
  } = $props();

  type ClassicTeamContext = {
    employees: EmployeeDraft[];
    jobName: Map<string, string>;
    contractName: Map<string, string>;
    editable: boolean;
    owner: boolean;
  };

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

  const context = $derived<ClassicTeamContext>({
    // The roster keeps its own saved order — that order is what drag-to-reorder
    // edits, and it is written back as sort_order — so this deliberately does
    // not re-sort. A row you just added is already inserted on top.
    employees: teamDraft.employees,
    jobName: new Map((team?.job_functions ?? []).map((job) => [job.id, job.name])),
    contractName: new Map(
      (team?.contract_types ?? []).map((type) => [type.id, type.name])
    ),
    editable: !workspace.isPreview,
    owner: workspace.effectiveRole === 'owner'
  });
</script>

<ClassicPage {actions}>
  {#if team}
    {@render children(context)}
  {:else}
    <div class="cl-card">
      <div class="cl-empty"><strong>{t('Loading your workspace')}</strong></div>
    </div>
  {/if}
</ClassicPage>
