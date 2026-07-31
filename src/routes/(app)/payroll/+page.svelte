<script lang="ts">
  import { ArrowRight, CheckCircle2, Clock3, FileOutput, UsersRound } from '@lucide/svelte';
  import { t } from '$lib/i18n/i18n.svelte';
  import PayrollSetupWorkspace from '$lib/payroll/PayrollSetupWorkspace.svelte';
  import { workspace } from '$lib/workspace/workspace.svelte';

  $effect(() => {
    if (workspace.activeId && workspace.canViewFinancials) {
      void workspace.loadTeam().catch(() => undefined);
    }
  });

  const activeEmployees = $derived(
    workspace.team?.employees.filter((employee) => employee.active) ?? []
  );
  const payrollReady = $derived(
    activeEmployees.filter((employee) => {
      const contract = workspace.team?.employee_contracts.find(
        (item) => item.employee_id === employee.id && item.active && item.is_current
      );
      const profile = workspace.team?.employee_payroll_profiles.find(
        (item) => item.employee_id === employee.id
      );
      const legal = workspace.team?.employee_legal_profiles.find(
        (item) => item.employee_id === employee.id
      );
      return Boolean(
        profile?.payroll_employee_id &&
          profile.iban &&
          legal?.national_registry_number &&
          contract?.worker_status &&
          (profile.hourly_wage_rate > 0 || profile.estimated_hourly_cost > 0)
      );
    }).length
  );
</script>

<svelte:head><title>{t('Payroll')} &middot; restogogo</title></svelte:head>

<section class="payroll-path" aria-label={t('Payroll workflow')}>
    <a href="/team/payroll">
      <span class="path-icon is-team"><UsersRound size={18} aria-hidden="true" /></span>
      <span>
        <small>{t('Step 1')}</small>
        <strong>{t('Employee details')}</strong>
        <em>{t('{ready} of {total} ready', { ready: payrollReady, total: activeEmployees.length })}</em>
      </span>
      {#if activeEmployees.length > 0 && payrollReady === activeEmployees.length}
        <CheckCircle2 class="path-state is-ready" size={17} aria-hidden="true" />
      {:else}
        <ArrowRight class="path-state" size={16} aria-hidden="true" />
      {/if}
    </a>
    <a href="/timesheet">
      <span class="path-icon is-time"><Clock3 size={18} aria-hidden="true" /></span>
      <span>
        <small>{t('Step 2')}</small>
        <strong>{t('Approve worked time')}</strong>
        <em>{t('Review corrections and close complete weeks.')}</em>
      </span>
      <ArrowRight class="path-state" size={16} aria-hidden="true" />
    </a>
    <a href="/exports">
      <span class="path-icon is-export"><FileOutput size={18} aria-hidden="true" /></span>
      <span>
        <small>{t('Step 3')}</small>
        <strong>{t('Prepare payroll handoff')}</strong>
        <em>{t('Create the file for your social secretariat.')}</em>
      </span>
      <ArrowRight class="path-state" size={16} aria-hidden="true" />
    </a>
</section>

<PayrollSetupWorkspace />

<style>
  .payroll-path {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    overflow: hidden;
    border: 1px solid var(--cl-line);
    border-radius: var(--cl-radius);
    background: var(--cl-surface);
  }
  .payroll-path > a {
    min-width: 0;
    min-height: 86px;
    display: grid;
    grid-template-columns: 36px minmax(0, 1fr) 18px;
    align-items: center;
    gap: 11px;
    padding: 14px 16px;
    color: var(--cl-ink);
    text-decoration: none;
    transition: background var(--cl-dur) var(--cl-ease);
  }
  .payroll-path > a + a { border-left: 1px solid var(--cl-line); }
  .payroll-path > a:hover { background: var(--cl-surface-muted); }
  .path-icon {
    width: 36px;
    height: 36px;
    display: grid;
    place-items: center;
    border-radius: 6px;
    color: var(--cl-mod-payroll);
    background: color-mix(in srgb, var(--cl-mod-payroll) 9%, var(--cl-surface));
  }
  .path-icon.is-team {
    color: var(--cl-mod-team);
    background: color-mix(in srgb, var(--cl-mod-team) 9%, var(--cl-surface));
  }
  .path-icon.is-time {
    color: var(--cl-mod-time);
    background: color-mix(in srgb, var(--cl-mod-time) 9%, var(--cl-surface));
  }
  .payroll-path a > span:nth-child(2) { min-width: 0; display: grid; gap: 2px; }
  .payroll-path small {
    color: var(--cl-muted);
    font-size: var(--rst-fs-micro);
    font-weight: var(--rst-fw-bold);
    text-transform: uppercase;
  }
  .payroll-path strong { font-size: var(--rst-fs-body); }
  .payroll-path em {
    overflow: hidden;
    color: var(--cl-muted);
    font-size: var(--rst-fs-label);
    font-style: normal;
    line-height: 1.35;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .payroll-path :global(.path-state) { color: var(--cl-muted); }
  .payroll-path :global(.path-state.is-ready) { color: var(--cl-ok); }
  @media (max-width: 980px) {
    .payroll-path { grid-template-columns: minmax(0, 1fr); }
    .payroll-path > a + a { border-top: 1px solid var(--cl-line); border-left: 0; }
  }
</style>
