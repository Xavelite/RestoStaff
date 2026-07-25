<script lang="ts">
  import { t } from '$lib/i18n/i18n.svelte';
  import ClassicPage from '$lib/classic/ClassicPage.svelte';
</script>

<svelte:head><title>{t('Payroll scope & settings')} &middot; restogogo</title></svelte:head>

<ClassicPage>
  <div class="ownership-grid">
    <section class="cl-card">
      <div class="cl-card__head"><h2>{t('Data ownership')}</h2></div>
      <div class="cl-card__body ownership-list">
        <article><span>{t('Restaurant')}</span><strong>{t('Employer and establishment identifiers')}</strong><p>{t('Company number, ONSS employer number, establishment unit, joint committee and Dimona workflow.')}</p><a href="/restaurant">{t('Open Restaurant')}</a></article>
        <article><span>{t('Team')}</span><strong>{t('Employment and payroll preparation')}</strong><p>{t('Contract type and dates, weekly hours, work regime, CP 302 function, salary basis and provider mapping.')}</p><a href="/payroll/employees">{t('Open Employees')}</a></article>
        <article><span>{t('Time & attendance')}</span><strong>{t('Actual approved work')}</strong><p>{t('Badge events, corrections, breaks, worked minutes, anomalies and week approval.')}</p><a href="/timesheet">{t('Open Timesheet')}</a></article>
        <article><span>{t('Payroll export')}</span><strong>{t('Prepared input file')}</strong><p>{t('Configurable columns and approved time data for the social secretariat, with lineage and re-download history.')}</p><a href="/payroll/exports">{t('Open Exports')}</a></article>
      </div>
    </section>

    <section class="cl-card boundary-card">
      <div class="cl-card__head"><h2>{t('Restogogo boundary')}</h2></div>
      <div class="cl-card__body boundary-list">
        <div class="is-in"><strong>{t('Keep in Restogogo')}</strong><span>{t('Operational hours, anomalies, contract facts, payroll mappings, basic cost estimates, simulations and exports.')}</span></div>
        <div class="is-out"><strong>{t('Owned by the social secretariat')}</strong><span>{t('Official gross-to-net calculation, taxes, social-security settlement, definitive payslips and legal corrections.')}</span></div>
        <p>{t('Advanced payroll-engine structures remain parked in the code and database while the final estimation scope is being designed. They are no longer presented as the core product workflow.')}</p>
      </div>
    </section>
  </div>
</ClassicPage>

<style>
  .ownership-grid { display: grid; grid-template-columns: minmax(0, 1.65fr) minmax(280px, .85fr); gap: 18px; align-items: start; }
  .ownership-list { display: grid; padding: 0; }
  .ownership-list article { display: grid; grid-template-columns: 130px minmax(0, 1fr) auto; grid-template-areas: 'owner title action' 'owner copy action'; gap: 3px 14px; align-items: center; padding: 14px 16px; border-top: 1px solid var(--cl-line); }
  .ownership-list article:first-child { border-top: 0; }
  .ownership-list article > span { grid-area: owner; align-self: start; color: var(--cl-muted); font-size: 12px; font-weight: var(--rst-fw-bold); }
  .ownership-list strong { grid-area: title; font-size: 13px; }
  .ownership-list p { grid-area: copy; margin: 0; color: var(--cl-muted); font-size: 12px; line-height: 1.45; }
  .ownership-list a { grid-area: action; color: var(--cl-accent); font-size: 12px; font-weight: var(--rst-fw-bold); text-decoration: none; white-space: nowrap; }
  .boundary-list { display: grid; gap: 12px; }
  .boundary-list > div { display: grid; gap: 4px; padding: 12px 14px; border: 1px solid var(--cl-line); border-radius: var(--cl-radius); }
  .boundary-list .is-in { border-left: 3px solid var(--cl-ok); }
  .boundary-list .is-out { border-left: 3px solid var(--cl-attention); }
  .boundary-list strong { font-size: 13px; }
  .boundary-list span, .boundary-list p { color: var(--cl-muted); font-size: 12px; line-height: 1.5; }
  .boundary-list p { margin: 2px 0 0; }
  @media (max-width: 980px) { .ownership-grid { grid-template-columns: minmax(0, 1fr); } }
  @media (max-width: 760px) { .ownership-list article { grid-template-columns: minmax(0, 1fr) auto; grid-template-areas: 'owner action' 'title title' 'copy copy'; } }
</style>
