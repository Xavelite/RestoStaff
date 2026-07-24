<script lang="ts">
  import FeedbackBanner from '$lib/components/FeedbackBanner.svelte';
  import ClassicStat from '$lib/classic/ClassicStat.svelte';
  import ClassicStatus from '$lib/classic/ClassicStatus.svelte';
  import { t } from '$lib/i18n/i18n.svelte';
  import type { Tables } from '$lib/supabase/database.types';
  import { formatCents } from '$lib/payroll-engine/money';
  import {
    calculatePayrollRun,
    getPayrollWorkspace,
    setPayrollRunStatus
  } from './payroll-api';
  import type { PayrollWorkspace as PayrollWorkspaceModel } from './payroll-model';

  let {
    restaurantId,
    employees,
    initialDate,
    locale = 'en-GB',
    month = $bindable('')
  }: {
    restaurantId: string;
    employees: Tables<'employees'>[];
    initialDate: string;
    locale?: string;
    month?: string;
  } = $props();

  let payroll = $state<PayrollWorkspaceModel | null>(null);
  let loadedKey = $state('');
  let busy = $state(false);
  let feedback = $state('');
  let feedbackTone = $state<'info' | 'success' | 'danger'>('info');
  let selectedEmployeeId = $state('');
  let selectedLineId = $state('');

  const periodStart = $derived(month ? `${month}-01` : '');
  const periodEnd = $derived.by(() => {
    if (!month) return '';
    const [year, monthNumber] = month.split('-').map(Number);
    return new Date(Date.UTC(year, monthNumber, 0)).toISOString().slice(0, 10);
  });
  const activeRuns = $derived(
    payroll?.runs.filter((item) => item.status !== 'superseded') ?? []
  );
  const latestRun = $derived(
    activeRuns.toSorted((left, right) => right.version_number - left.version_number)[0]
  );
  const results = $derived(
    latestRun
      ? payroll?.employeeResults.filter((item) => item.payroll_run_id === latestRun.id) ?? []
      : []
  );
  const selectedResult = $derived(
    results.find((item) => item.employee_id === selectedEmployeeId)
  );
  const selectedLines = $derived(
    latestRun && selectedEmployeeId
      ? payroll?.componentLines.filter(
          (item) => item.payroll_run_id === latestRun.id && item.employee_id === selectedEmployeeId
        ) ?? []
      : []
  );
  const openWarnings = $derived(
    payroll?.readiness.warnings.filter((item) => !item.accepted) ?? []
  );
  const readinessIssues = $derived([
    ...(payroll?.readiness.blockers ?? []),
    ...openWarnings
  ]);
  const canReconcile = $derived(
    Boolean(
      latestRun &&
      payroll?.reconciliations.some((item) => item.payroll_run_id === latestRun.id) &&
      !payroll?.reconciliations.some(
        (item) => item.payroll_run_id === latestRun.id && item.status !== 'resolved'
      )
    )
  );

  $effect(() => {
    if (!month && initialDate) month = initialDate.slice(0, 7);
  });

  $effect(() => {
    const key = restaurantId && periodStart && periodEnd
      ? `${restaurantId}:${periodStart}:${periodEnd}`
      : '';
    if (!key || loadedKey === key) return;
    loadedKey = key;
    void reload();
  });

  function employeeName(id: string): string {
    return employees.find((item) => item.id === id)?.display_name ?? t('Unknown employee');
  }

  function lineAmount(line: Tables<'payroll_component_lines'>): number {
    return line.gross_amount_cents || line.employee_contribution_cents
      || line.employer_contribution_cents || line.professional_withholding_cents
      || line.net_impact_cents || line.employer_cost_impact_cents;
  }

  function lineRule(line: Tables<'payroll_component_lines'>) {
    return payroll?.rules.find((item) => item.id === line.rule_id);
  }

  function ruleSource(line: Tables<'payroll_component_lines'>) {
    const rule = lineRule(line);
    return payroll?.legalSources.find((item) => item.id === rule?.legal_source_id);
  }

  function lineTerms(line: Tables<'payroll_component_lines'>) {
    return payroll?.employmentTerms.find((item) => item.id === line.employment_terms_id);
  }

  function lineSources(lineId: string) {
    return payroll?.componentSources.filter(
      (item) => item.payroll_component_line_id === lineId
    ) ?? [];
  }

  function runTone(status: string): 'ok' | 'attention' | 'problem' {
    if (status === 'finalized' || status === 'reconciled') return 'ok';
    if (status === 'calculated' || status === 'reviewed' || status === 'locked_estimate') {
      return 'attention';
    }
    return 'problem';
  }

  function qualityTone(quality: string): 'ok' | 'attention' | 'problem' {
    if (quality === 'verified' || quality === 'reconciled') return 'ok';
    if (quality === 'blocked' || quality === 'incomplete') return 'problem';
    return 'attention';
  }

  async function reload(): Promise<void> {
    if (!restaurantId || !periodStart || !periodEnd) return;
    busy = true;
    try {
      payroll = await getPayrollWorkspace(restaurantId, periodStart, periodEnd);
      if (
        selectedEmployeeId &&
        !payroll.employeeResults.some((item) => item.employee_id === selectedEmployeeId)
      ) {
        selectedEmployeeId = '';
        selectedLineId = '';
      }
    } catch (error) {
      feedback = error instanceof Error ? error.message : String(error);
      feedbackTone = 'danger';
    } finally {
      busy = false;
    }
  }

  async function calculate(): Promise<void> {
    if (busy || !periodStart || !periodEnd) return;
    busy = true;
    feedback = '';
    try {
      await calculatePayrollRun(restaurantId, periodStart, periodEnd);
      loadedKey = '';
      await reload();
      feedback = t('A new immutable payroll calculation version was created.');
      feedbackTone = 'success';
    } catch (error) {
      feedback = error instanceof Error ? error.message : String(error);
      feedbackTone = 'danger';
    } finally {
      busy = false;
    }
  }

  async function moveStatus(
    status: 'reviewed' | 'locked_estimate' | 'reconciled' | 'finalized'
  ): Promise<void> {
    if (!latestRun || busy) return;
    busy = true;
    feedback = '';
    try {
      await setPayrollRunStatus(restaurantId, latestRun.id, status);
      loadedKey = '';
      await reload();
      feedback = t('Payroll status updated.');
      feedbackTone = 'success';
    } catch (error) {
      feedback = error instanceof Error ? error.message : String(error);
      feedbackTone = 'danger';
    } finally {
      busy = false;
    }
  }
</script>

{#if feedback}<FeedbackBanner message={feedback} tone={feedbackTone} />{/if}

{#if payroll}
  <section class="cl-card gate" class:is-ready={payroll.readiness.ready}>
    <div class="cl-card__head">
      <div>
        <h2>{t(payroll.readiness.ready ? 'Ready to calculate' : 'Payroll readiness')}</h2>
        <p>
          {t(payroll.readiness.ready
            ? 'Approved hours and required evidence are complete for this period.'
            : '{blockers} blockers and {warnings} warnings must be reviewed.', {
                blockers: payroll.readiness.blockers.length,
                warnings: openWarnings.length
              })}
        </p>
      </div>
      <ClassicStatus
        label={payroll.readiness.ready ? 'Evidence complete' : 'Needs attention'}
        tone={payroll.readiness.ready ? 'ok' : 'problem'}
      />
    </div>
    <div class="cl-card__foot">
      <span class="gate__note">{t('Calculations are immutable; recalculating creates a new version.')}</span>
      <button
        class="cl-btn is-primary"
        type="button"
        disabled={busy || !payroll.readiness.ready}
        onclick={calculate}
      >{t(busy ? 'Working…' : latestRun ? 'Recalculate' : 'Calculate payroll')}</button>
    </div>
  </section>

  {#if readinessIssues.length}
    <section class="cl-section">
      <h2 class="cl-section__title">{t('Readiness issues')}</h2>
      <p class="cl-section__note">{t('Open the employee record or restaurant configuration to complete the missing evidence.')}</p>
      <div class="cl-tablewrap">
        <table class="cl-table">
          <thead>
            <tr><th>{t('Scope')}</th><th>{t('Issue')}</th><th>{t('Detail')}</th><th></th></tr>
          </thead>
          <tbody>
            {#each readinessIssues as issue (`${issue.code}:${issue.employee_id ?? 'restaurant'}:${issue.evidence}`)}
              <tr class:is-problem={!issue.accepted}>
                <td>{issue.employee_id ? employeeName(issue.employee_id) : t('Restaurant')}</td>
                <td>{issue.code.replaceAll('_', ' ')}</td>
                <td class="is-quiet">{issue.message}</td>
                <td class="is-num">
                  {#if issue.employee_id}
                    <a class="cl-btn" href={`/payroll/employees?employee=${issue.employee_id}`}>{t('Open employee')}</a>
                  {:else}
                    <a class="cl-btn" href="/payroll/configuration">{t('Open configuration')}</a>
                  {/if}
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    </section>
  {/if}

  {#if latestRun}
    <div class="cl-stats">
      <ClassicStat label="Gross" value={latestRun.total_gross_cents} format={(value) => formatCents(value, locale)} accent="var(--cl-mod-payroll)" mutedZero={false} />
      <ClassicStat label="Employee deductions" value={latestRun.total_employee_deductions_cents} format={(value) => formatCents(value, locale)} />
      <ClassicStat label="Estimated net" value={latestRun.total_estimated_net_cents} format={(value) => formatCents(value, locale)} accent="var(--cl-ok)" mutedZero={false} />
      <ClassicStat label="Employer cost" value={latestRun.total_employer_cost_cents} format={(value) => formatCents(value, locale)} />
      <ClassicStat label="Run" text={`v${latestRun.version_number} · ${latestRun.status.replaceAll('_', ' ')}`} />
    </div>

    <section class="cl-section">
      <div class="section-heading">
        <div>
          <h2 class="cl-section__title">{t('Employee results')}</h2>
          <p class="cl-section__note">{t('Open a row to inspect the rules, employment terms and frozen source evidence behind every amount.')}</p>
        </div>
        <ClassicStatus label={latestRun.status.replaceAll('_', ' ')} tone={runTone(latestRun.status)} />
      </div>

      <div class="cl-tablewrap">
        <table class="cl-table payroll-ledger">
          <thead>
            <tr>
              <th>{t('Employee')}</th>
              <th class="is-num">{t('Hours')}</th>
              <th class="is-num">{t('Gross')}</th>
              <th class="is-num">{t('Deductions')}</th>
              <th class="is-num">{t('Estimated net')}</th>
              <th class="is-num">{t('Employer cost')}</th>
              <th>{t('Quality')}</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {#if !results.length}
              <tr><td colspan="8"><div class="cl-empty"><strong>{t('No employee results')}</strong></div></td></tr>
            {:else}
              {#each results as result (result.id)}
                <tr class:is-selected={selectedEmployeeId === result.employee_id}>
                  <td>{employeeName(result.employee_id)}</td>
                  <td class="is-num">{(result.payable_minutes / 60).toFixed(2)}h</td>
                  <td class="is-num">{formatCents(result.gross_cents, locale)}</td>
                  <td class="is-num">{formatCents(result.employee_contributions_cents + result.professional_withholding_cents + result.other_employee_deductions_cents, locale)}</td>
                  <td class="is-num">{formatCents(result.estimated_net_cents, locale)}</td>
                  <td class="is-num">{formatCents(result.employer_cost_cents, locale)}</td>
                  <td><ClassicStatus label={result.calculation_quality.replaceAll('_', ' ')} tone={qualityTone(result.calculation_quality)} /></td>
                  <td class="is-num">
                    <button
                      class="cl-btn"
                      type="button"
                      onclick={() => {
                        selectedEmployeeId = selectedEmployeeId === result.employee_id ? '' : result.employee_id;
                        selectedLineId = '';
                      }}
                    >{t(selectedEmployeeId === result.employee_id ? 'Close' : 'Details')}</button>
                  </td>
                </tr>
              {/each}
            {/if}
          </tbody>
        </table>
      </div>
    </section>

    {#if selectedResult}
      <section class="cl-card component-detail">
        <div class="cl-card__head">
          <div>
            <h2>{employeeName(selectedResult.employee_id)}</h2>
            <p>{t('Calculation evidence')}</p>
          </div>
          <button class="cl-btn" type="button" onclick={() => (selectedEmployeeId = '')}>{t('Close')}</button>
        </div>
        <div class="cl-tablewrap">
          <table class="cl-table component-table">
            <thead><tr><th>{t('Component')}</th><th>{t('Formula')}</th><th class="is-num">{t('Amount')}</th><th></th></tr></thead>
            <tbody>
              {#each selectedLines as line (line.id)}
                <tr>
                  <td><strong>{line.component_code.replaceAll('_', ' ')}</strong><small>{line.explanation}</small></td>
                  <td class="is-quiet">{line.quantity} {line.unit}{line.rate != null ? ` × ${line.rate}` : ''}</td>
                  <td class="is-num">{formatCents(lineAmount(line), locale)}</td>
                  <td class="is-num"><button class="cl-btn" type="button" onclick={() => (selectedLineId = selectedLineId === line.id ? '' : line.id)}>{t(selectedLineId === line.id ? 'Hide evidence' : 'Evidence')}</button></td>
                </tr>
                {#if selectedLineId === line.id}
                  {@const rule = lineRule(line)}
                  {@const legalSource = ruleSource(line)}
                  {@const terms = lineTerms(line)}
                  <tr class="evidence-row">
                    <td colspan="4">
                      <dl class="evidence-grid">
                        <div><dt>{t('Rule')}</dt><dd>{rule?.code ?? t('Direct evidence')}<small>{rule ? `${rule.status} · ${rule.effective_from}` : t('No legal-rule handler attached')}</small></dd></div>
                        <div><dt>{t('Legal source')}</dt><dd>{#if legalSource?.url}<a href={legalSource.url} target="_blank" rel="noreferrer">{legalSource.title}</a>{:else}{legalSource?.title ?? t('Source evidence on the component')}{/if}<small>{legalSource?.authority ?? ''}</small></dd></div>
                        <div><dt>{t('Employment terms')}</dt><dd>{terms ? `${t('Version')} ${terms.version_number}` : t('Derived employee result')}<small>{terms ? `${terms.valid_from} → ${terms.valid_to ?? t('open ended')}` : t('See linked source components')}</small></dd></div>
                        <div><dt>{t('Rounding')}</dt><dd>{t('Nearest euro cent')}<small>{t('Authoritative PostgreSQL numeric calculation')}</small></dd></div>
                        <div class="is-wide"><dt>{t('Frozen sources')}</dt><dd>{#each lineSources(line.id) as source (source.id)}<small><b>{source.source_type.replaceAll('_', ' ')}</b> · {source.source_date ?? t('dated evidence')}{source.source_revision != null ? ` · ${t('revision')} ${source.source_revision}` : ''}</small>{:else}<small>{t('Derived from the employee result and attached rule.')}</small>{/each}</dd></div>
                      </dl>
                    </td>
                  </tr>
                {/if}
              {:else}
                <tr><td colspan="4"><div class="cl-empty"><strong>{t('No component lines')}</strong></div></td></tr>
              {/each}
            </tbody>
          </table>
        </div>
      </section>
    {/if}

    <section class="cl-card run-actions">
      <div class="cl-card__head">
        <div>
          <h2>{t('Run status')}</h2>
          <p>{t('Reviewed calculations remain estimates. Only reconciled provider evidence can be finalized.')}</p>
        </div>
        <ClassicStatus label={latestRun.status.replaceAll('_', ' ')} tone={runTone(latestRun.status)} />
      </div>
      <div class="cl-card__foot action-row">
        <span class="gate__note">{t('Every status change is recorded against this immutable version.')}</span>
        {#if latestRun.status === 'calculated'}<button class="cl-btn is-primary" type="button" disabled={busy} onclick={() => moveStatus('reviewed')}>{t('Mark reviewed')}</button>{/if}
        {#if latestRun.status === 'reviewed'}<button class="cl-btn is-primary" type="button" disabled={busy} onclick={() => moveStatus('locked_estimate')}>{t('Lock estimate')}</button>{/if}
        {#if latestRun.status === 'reviewed' || latestRun.status === 'locked_estimate'}<button class="cl-btn is-primary" type="button" disabled={busy || !canReconcile} onclick={() => moveStatus('reconciled')}>{t('Mark reconciled')}</button>{/if}
        {#if latestRun.status === 'reconciled'}<button class="cl-btn is-primary" type="button" disabled={busy} onclick={() => moveStatus('finalized')}>{t('Finalize payroll')}</button>{/if}
      </div>
    </section>
  {:else if payroll.readiness.ready}
    <div class="cl-empty"><strong>{t('No payroll run for this month')}</strong><span>{t('The evidence is ready. Calculate the period to create the first immutable version.')}</span></div>
  {/if}
{:else}
  <div class="cl-empty"><strong>{t('Loading monthly payroll…')}</strong></div>
{/if}

<style>
  .gate {
    border-left: 3px solid var(--cl-problem);
  }
  .gate.is-ready {
    border-left-color: var(--cl-ok);
  }
  .gate .cl-card__head p,
  .run-actions .cl-card__head p {
    margin: 5px 0 0;
    color: var(--cl-muted);
    font-size: 13px;
    line-height: 1.5;
  }
  .gate__note {
    color: var(--cl-muted);
    font-size: 13px;
  }
  .section-heading {
    display: flex;
    align-items: flex-end;
    justify-content: space-between;
    gap: 16px;
  }
  .payroll-ledger {
    min-width: 1100px;
  }
  .payroll-ledger tr.is-selected td {
    background: var(--cl-info-wash);
  }
  .component-table {
    min-width: 820px;
  }
  .component-table td strong,
  .component-table td small {
    display: block;
  }
  .component-table td small {
    margin-top: 3px;
    color: var(--cl-muted);
    font-size: 12px;
    line-height: 1.4;
  }
  .evidence-row td {
    padding: 0;
    background: var(--cl-surface-muted);
  }
  .evidence-grid {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    margin: 0;
  }
  .evidence-grid > div {
    min-width: 0;
    padding: 14px 16px;
    border-right: 1px solid var(--cl-line);
    border-bottom: 1px solid var(--cl-line);
  }
  .evidence-grid > div:nth-child(4) {
    border-right: 0;
  }
  .evidence-grid > div.is-wide {
    grid-column: 1 / -1;
    border-right: 0;
    border-bottom: 0;
  }
  .evidence-grid dt {
    margin-bottom: 5px;
    color: var(--cl-muted);
    font-size: 11px;
    font-weight: var(--rst-fw-bold);
    text-transform: uppercase;
  }
  .evidence-grid dd {
    margin: 0;
    font-size: 13px;
    line-height: 1.45;
  }
  .evidence-grid dd small {
    display: block;
    margin-top: 4px;
    color: var(--cl-muted);
    font-size: 12px;
  }
  .evidence-grid a {
    color: var(--cl-ink);
    text-underline-offset: 2px;
  }
  .action-row {
    justify-content: flex-end;
  }
  .action-row .gate__note {
    margin-right: auto;
  }
  @media (max-width: 760px) {
    .section-heading,
    .action-row {
      align-items: stretch;
      flex-direction: column;
    }
    .action-row .gate__note {
      margin-right: 0;
    }
    .evidence-grid {
      grid-template-columns: 1fr;
    }
    .evidence-grid > div,
    .evidence-grid > div:nth-child(4) {
      border-right: 0;
    }
    .evidence-grid > div.is-wide {
      grid-column: auto;
    }
  }
</style>
