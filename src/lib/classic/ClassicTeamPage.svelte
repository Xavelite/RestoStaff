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
    title = 'Team',
    subtitle,
    actions,
    children
  }: {
    /** Payroll's Employment terms page reads the same roster under its own name. */
    title?: string;
    subtitle: string;
    actions?: Snippet;
    children: Snippet<[ClassicTeamContext]>;
  } = $props();

  type ClassicTeamContext = {
    employees: EmployeeDraft[];
    jobName: Map<string, string>;
    contractName: Map<string, string>;
    editable: boolean;
  };

  const team = $derived(workspace.team);

  $effect(() => {
    if (workspace.activeId && workspace.effectiveRole !== 'employee') {
      void workspace.loadTeam().catch(() => undefined);
    }
  });

  $effect(() => {
    if (team) teamDraft.sync(team);
  });

  const context = $derived<ClassicTeamContext>({
    employees: [...teamDraft.employees].sort(
      (left, right) =>
        Number(right.active) - Number(left.active) ||
        left.displayName.localeCompare(right.displayName)
    ),
    jobName: new Map((team?.job_functions ?? []).map((job) => [job.id, job.name])),
    contractName: new Map(
      (team?.contract_types ?? []).map((type) => [type.id, type.name])
    ),
    editable: !workspace.isPreview
  });
</script>

<ClassicPage {title} {subtitle} {actions}>
  {#if team}
    {@render children(context)}
  {:else}
    <div class="cl-card">
      <div class="cl-empty"><strong>{t('Loading your workspace')}</strong></div>
    </div>
  {/if}
</ClassicPage>
