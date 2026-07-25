<script lang="ts">
  import { t } from '$lib/i18n/i18n.svelte';
  import ClassicPage from '$lib/classic/ClassicPage.svelte';
  import ClassicStatus from '$lib/classic/ClassicStatus.svelte';
  import { workspace } from '$lib/workspace/workspace.svelte';
  import { isValidBelgianNiss } from '$lib/team/belgian-identifiers';

  $effect(() => {
    if (!workspace.activeId || workspace.effectiveRole !== 'owner') return;
    void Promise.all([
      workspace.loadTeam().catch(() => undefined),
      workspace.loadRestaurant().catch(() => undefined)
    ]);
  });

  const team = $derived(workspace.team);
  const restaurant = $derived(workspace.restaurant);
  const activeEmployees = $derived(team?.employees.filter((employee) => employee.active) ?? []);
  const currentContracts = $derived(
    new Set(
      (team?.employee_contracts ?? [])
        .filter((contract) => contract.active && contract.is_current)
        .map((contract) => contract.employee_id)
    )
  );
  const legalProfiles = $derived(
    new Map((team?.employee_legal_profiles ?? []).map((profile) => [profile.employee_id, profile]))
  );
  const payrollProfiles = $derived(
    new Map((team?.employee_payroll_profiles ?? []).map((profile) => [profile.employee_id, profile]))
  );
  const missingContracts = $derived(activeEmployees.filter((employee) => !currentContracts.has(employee.id)).length);
  const missingNiss = $derived(
    activeEmployees.filter((employee) => !isValidBelgianNiss(legalProfiles.get(employee.id)?.national_registry_number)).length
  );
  const missingPayrollMapping = $derived(
    activeEmployees.filter((employee) => !payrollProfiles.get(employee.id)?.payroll_employee_id).length
  );

  const employer = $derived(restaurant?.restaurant_employment_settings);
  const employerGaps = $derived([
    !restaurant?.restaurant.company_number,
    !employer?.onss_employer_number,
    !employer?.establishment_unit_number
  ].filter(Boolean).length);
  const dimonaMode = $derived(employer?.dimona_submission_mode ?? 'not_configured');
</script>

<svelte:head><title>{t('Payroll preparation')} &middot; restogogo</title></svelte:head>

<ClassicPage>
  <section class="scope-banner">
    <div>
      <span class="eyebrow">{t('Product scope')}</span>
      <h2>{t('Prepare reliable payroll inputs, not official payroll')}</h2>
      <p>{t('Restogogo centralizes contracts, planned and approved hours, useful cost estimates and export mappings. Your social secretariat remains responsible for official salary calculation, declarations and payslips.')}</p>
    </div>
    <span class="scope-pill">{t('Preparation & estimates')}</span>
  </section>

  <div class="overview-grid">
    <a class="overview-card" href="/restaurant">
      <div class="overview-card__head">
        <span>{t('Employer setup')}</span>
        <ClassicStatus
          label={employerGaps ? '{count} missing' : 'Ready'}
          params={employerGaps ? { count: employerGaps } : undefined}
          tone={employerGaps ? 'attention' : 'ok'}
        />
      </div>
      <strong>{t('Restaurant identifiers')}</strong>
      <p>{t('Company, ONSS and establishment identifiers, joint committee and the intended Dimona workflow.')}</p>
      <small>{t(dimonaMode === 'social_secretariat' ? 'Through social secretariat' : dimonaMode === 'direct' ? 'Direct integration later' : 'Dimona workflow not configured')}</small>
    </a>

    <a class="overview-card" href="/payroll/employees">
      <div class="overview-card__head">
        <span>{t('Employee preparation')}</span>
        <ClassicStatus
          label={missingContracts + missingNiss ? '{count} gaps' : 'Ready'}
          params={missingContracts + missingNiss ? { count: missingContracts + missingNiss } : undefined}
          tone={missingContracts + missingNiss ? 'attention' : 'ok'}
        />
      </div>
      <strong>{activeEmployees.length} {t('active employees')}</strong>
      <p>{t('Current contract, national registry data, CP 302 function, salary basis and optional provider mapping.')}</p>
      <small>{missingContracts} {t('without current contract')} · {missingNiss} {t('without NISS')} · {missingPayrollMapping} {t('without payroll ID')}</small>
    </a>

    <a class="overview-card" href="/payroll/exports">
      <div class="overview-card__head">
        <span>{t('Secretariat export')}</span>
        <ClassicStatus label="Approved hours only" tone="ok" />
      </div>
      <strong>{t('Timesheet-based payroll file')}</strong>
      <p>{t('Prepare a configurable CSV from approved time records, with reproducible source lineage and a draft preview before approval.')}</p>
      <small>{t('Official calculation remains outside Restogogo')}</small>
    </a>

    <a class="overview-card" href="/payroll/configuration">
      <div class="overview-card__head">
        <span>{t('Scope & settings')}</span>
        <ClassicStatus label="Basic by design" tone="ok" />
      </div>
      <strong>{t('Estimates and ownership')}</strong>
      <p>{t('See which data belongs to Restaurant, Team, Timesheet, Restogogo estimates and the social secretariat.')}</p>
      <small>{t('No tax settlement or definitive payslips')}</small>
    </a>
  </div>
</ClassicPage>

<style>
  .scope-banner { display: flex; align-items: flex-start; justify-content: space-between; gap: 20px; padding: 20px 22px; border: 1px solid var(--cl-line); border-left: 4px solid var(--cl-accent); border-radius: var(--cl-radius); background: var(--cl-surface); }
  .scope-banner > div { display: grid; gap: 6px; max-width: 860px; }
  .eyebrow { color: var(--cl-accent); font-size: 11px; font-weight: var(--rst-fw-bold); letter-spacing: .06em; text-transform: uppercase; }
  .scope-banner h2 { margin: 0; font-size: 18px; }
  .scope-banner p { margin: 0; color: var(--cl-muted); font-size: 13px; line-height: 1.55; }
  .scope-pill { flex: 0 0 auto; padding: 5px 10px; border: 1px solid var(--cl-line); border-radius: 999px; background: var(--cl-surface-muted); color: var(--cl-muted); font-size: 11px; font-weight: var(--rst-fw-bold); }
  .overview-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 16px; margin-top: 18px; }
  .overview-card { display: grid; gap: 8px; min-height: 190px; padding: 18px; border: 1px solid var(--cl-line); border-radius: var(--cl-radius); background: var(--cl-surface); color: var(--cl-ink); text-decoration: none; transition: border-color var(--cl-dur) var(--cl-ease), transform var(--cl-dur) var(--cl-ease); }
  .overview-card:hover { border-color: var(--cl-line-strong); transform: translateY(-1px); }
  .overview-card__head { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
  .overview-card__head > span { color: var(--cl-muted); font-size: 12px; font-weight: var(--rst-fw-bold); text-transform: uppercase; letter-spacing: .04em; }
  .overview-card > strong { align-self: end; font-size: 16px; }
  .overview-card p { margin: 0; color: var(--cl-muted); font-size: 13px; line-height: 1.5; }
  .overview-card small { align-self: end; color: var(--cl-muted); font-size: 11px; }
  @media (max-width: 760px) { .scope-banner { display: grid; } .scope-pill { justify-self: start; } .overview-grid { grid-template-columns: minmax(0, 1fr); } }
</style>
