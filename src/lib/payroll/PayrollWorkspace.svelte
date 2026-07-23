<script lang="ts">
  import FeedbackBanner from '$lib/components/FeedbackBanner.svelte';
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
    locale = 'en-GB'
  }: {
    restaurantId: string;
    employees: Tables<'employees'>[];
    initialDate: string;
    locale?: string;
  } = $props();

  let month = $state('');
  let workspace = $state<PayrollWorkspaceModel | null>(null);
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
    workspace?.runs.filter((item) => item.status !== 'superseded') ?? []
  );
  const latestRun = $derived(activeRuns.sort((a, b) => b.version_number - a.version_number)[0]);
  const results = $derived(
    latestRun
      ? workspace?.employeeResults.filter((item) => item.payroll_run_id === latestRun.id) ?? []
      : []
  );
  const selectedResult = $derived(results.find((item) => item.employee_id === selectedEmployeeId));
  const selectedLines = $derived(
    latestRun && selectedEmployeeId
      ? workspace?.componentLines.filter(
          (item) => item.payroll_run_id === latestRun.id && item.employee_id === selectedEmployeeId
        ) ?? []
      : []
  );
  const canReconcile = $derived(
    Boolean(
      latestRun &&
      workspace?.reconciliations.some((item) => item.payroll_run_id === latestRun.id) &&
      !workspace?.reconciliations.some(
        (item) => item.payroll_run_id === latestRun.id && item.status !== 'resolved'
      )
    )
  );

  $effect(() => {
    if (!month && initialDate) month = initialDate.slice(0, 7);
  });

  $effect(() => {
    const key = restaurantId && periodStart && periodEnd ? `${restaurantId}:${periodStart}:${periodEnd}` : '';
    if (!key || loadedKey === key) return;
    loadedKey = key;
    void reload();
  });

  function employeeName(id: string) {
    return employees.find((item) => item.id === id)?.display_name ?? 'Unknown employee';
  }

  function lineAmount(line: Tables<'payroll_component_lines'>) {
    return line.gross_amount_cents || line.employee_contribution_cents
      || line.employer_contribution_cents || line.professional_withholding_cents
      || line.net_impact_cents || line.employer_cost_impact_cents;
  }

  function lineRule(line: Tables<'payroll_component_lines'>) {
    return workspace?.rules.find((item) => item.id === line.rule_id);
  }

  function ruleSource(line: Tables<'payroll_component_lines'>) {
    const rule = lineRule(line);
    return workspace?.legalSources.find((item) => item.id === rule?.legal_source_id);
  }

  function lineTerms(line: Tables<'payroll_component_lines'>) {
    return workspace?.employmentTerms.find((item) => item.id === line.employment_terms_id);
  }

  function lineSources(lineId: string) {
    return workspace?.componentSources.filter((item) => item.payroll_component_line_id === lineId) ?? [];
  }

  async function reload() {
    if (!restaurantId || !periodStart || !periodEnd) return;
    busy = true;
    try {
      workspace = await getPayrollWorkspace(restaurantId, periodStart, periodEnd);
      if (selectedEmployeeId && !workspace.employeeResults.some((item) => item.employee_id === selectedEmployeeId)) {
        selectedEmployeeId = '';
      }
    } catch (error) {
      feedback = error instanceof Error ? error.message : String(error);
      feedbackTone = 'danger';
    } finally {
      busy = false;
    }
  }

  async function calculate() {
    if (busy || !periodStart || !periodEnd) return;
    busy = true;
    feedback = '';
    try {
      await calculatePayrollRun(restaurantId, periodStart, periodEnd);
      await reload();
      feedback = 'A new immutable payroll calculation version was created.';
      feedbackTone = 'success';
    } catch (error) {
      feedback = error instanceof Error ? error.message : String(error);
      feedbackTone = 'danger';
    } finally {
      busy = false;
    }
  }

  async function moveStatus(status: 'reviewed' | 'locked_estimate' | 'reconciled' | 'finalized') {
    if (!latestRun || busy) return;
    busy = true;
    feedback = '';
    try {
      await setPayrollRunStatus(restaurantId, latestRun.id, status);
      await reload();
      feedback = `Payroll run marked ${status}.`;
      feedbackTone = 'success';
    } catch (error) {
      feedback = error instanceof Error ? error.message : String(error);
      feedbackTone = 'danger';
    } finally {
      busy = false;
    }
  }
</script>

<section class="payroll-workspace" aria-label="Monthly payroll workspace">
  <header class="payroll-head">
    <div>
      <span>Monthly payroll · CP 302</span>
      <h2>From approved hours to explainable cost</h2>
      <p>Every amount below is linked to worked-time revisions, effective employment terms and a legal-rule version.</p>
    </div>
    <label>Payroll month<input type="month" bind:value={month} /></label>
  </header>

  {#if feedback}<FeedbackBanner message={feedback} tone={feedbackTone} />{/if}

  {#if workspace}
    <div class="payroll-gate" class:is-ready={workspace.readiness.ready}>
      <div>
        <span>{workspace.readiness.ready ? 'Ready to calculate' : 'Payroll gate'}</span>
        <strong>{workspace.readiness.ready ? 'Evidence complete' : `${workspace.readiness.blockers.length} blockers · ${workspace.readiness.warnings.filter((item) => !item.accepted).length} warnings`}</strong>
      </div>
      <button type="button" disabled={busy || !workspace.readiness.ready} onclick={calculate}>
        {busy ? 'Working…' : latestRun ? 'Recalculate' : 'Calculate payroll'}
      </button>
    </div>

    {#if !workspace.readiness.ready}
      <div class="issue-grid">
        {#each [...workspace.readiness.blockers, ...workspace.readiness.warnings.filter((item) => !item.accepted)].slice(0, 8) as issue (`${issue.code}:${issue.evidence}`)}
          <button type="button" onclick={() => issue.employee_id && (selectedEmployeeId = issue.employee_id)}>
            <span>{issue.code.replaceAll('_', ' ')}</span>
            <strong>{issue.employee_id ? employeeName(issue.employee_id) : 'Restaurant'}</strong>
            <small>{issue.message}</small>
          </button>
        {/each}
      </div>
    {/if}

    {#if latestRun}
      <div class="run-meta">
        <div><span>Gross</span><strong>{formatCents(latestRun.total_gross_cents, locale)}</strong></div>
        <div><span>Employee deductions</span><strong>{formatCents(latestRun.total_employee_deductions_cents, locale)}</strong></div>
        <div><span>Estimated net</span><strong>{formatCents(latestRun.total_estimated_net_cents, locale)}</strong></div>
        <div><span>Employer cost</span><strong>{formatCents(latestRun.total_employer_cost_cents, locale)}</strong></div>
        <div><span>Run</span><strong>v{latestRun.version_number} · {latestRun.status}</strong></div>
      </div>

      <div class="payroll-ledger">
        <div class="ledger-head"><span>Employee</span><span>Hours</span><span>Gross</span><span>Deductions</span><span>Estimated net</span><span>Employer cost</span><span>Status</span></div>
        {#each results as result (result.id)}
          <button type="button" class:is-selected={selectedEmployeeId === result.employee_id} onclick={() => { selectedEmployeeId = selectedEmployeeId === result.employee_id ? '' : result.employee_id; selectedLineId = ''; }}>
            <strong>{employeeName(result.employee_id)}</strong>
            <span>{(result.payable_minutes / 60).toFixed(2)}h</span>
            <span>{formatCents(result.gross_cents, locale)}</span>
            <span>{formatCents(result.employee_contributions_cents + result.professional_withholding_cents + result.other_employee_deductions_cents, locale)}</span>
            <span>{formatCents(result.estimated_net_cents, locale)}</span>
            <span>{formatCents(result.employer_cost_cents, locale)}</span>
            <em>{result.calculation_quality}</em>
          </button>
        {:else}
          <p class="empty">No calculation exists for this month yet.</p>
        {/each}
      </div>

      {#if selectedResult}
        <section class="component-detail">
          <header><div><span>Calculation evidence</span><h3>{employeeName(selectedResult.employee_id)}</h3></div><button type="button" aria-label="Close employee detail" onclick={() => (selectedEmployeeId = '')}>×</button></header>
          <div class="component-list">
            {#each selectedLines as line (line.id)}
              <article>
                <button type="button" class="component-row" aria-expanded={selectedLineId === line.id} onclick={() => (selectedLineId = selectedLineId === line.id ? '' : line.id)}>
                  <div><strong>{line.component_code.replaceAll('_', ' ')}</strong><small>{line.explanation}</small></div>
                  <div class="formula"><span>{line.quantity} {line.unit}{line.rate != null ? ` × ${line.rate}` : ''}</span><strong>{formatCents(lineAmount(line), locale)}</strong></div>
                </button>
                {#if selectedLineId === line.id}
                  {@const rule = lineRule(line)}
                  {@const legalSource = ruleSource(line)}
                  {@const terms = lineTerms(line)}
                  <div class="line-evidence">
                    <div><span>Rule</span><strong>{rule?.code ?? 'Direct evidence'}</strong><small>{rule ? `${rule.status} · effective ${rule.effective_from}` : 'No legal-rule handler attached'}</small></div>
                    <div><span>Legal source</span>{#if legalSource?.url}<a href={legalSource.url} target="_blank" rel="noreferrer">{legalSource.title}</a>{:else}<strong>{legalSource?.title ?? 'Source evidence on the component'}</strong>{/if}<small>{legalSource?.authority ?? ''}</small></div>
                    <div><span>Employment terms</span><strong>{terms ? `Version ${terms.version_number}` : 'Derived employee result'}</strong><small>{terms ? `${terms.valid_from} → ${terms.valid_to ?? 'open ended'}` : 'See linked source components'}</small></div>
                    <div><span>Rounding</span><strong>Nearest euro cent</strong><small>Authoritative PostgreSQL numeric calculation</small></div>
                    <div class="source-list"><span>Frozen sources</span>{#each lineSources(line.id) as source (source.id)}<small><b>{source.source_type.replaceAll('_', ' ')}</b> · {source.source_date ?? 'dated evidence'}{source.source_revision != null ? ` · revision ${source.source_revision}` : ''}</small>{:else}<small>Derived from the employee result and attached rule.</small>{/each}</div>
                  </div>
                {/if}
              </article>
            {/each}
          </div>
        </section>
      {/if}

      <footer class="run-actions">
        <p>Reviewed calculations remain estimates. Lock an estimate for operational reference; only reconciled provider evidence can be finalized.</p>
        <div>
          {#if latestRun.status === 'calculated'}<button type="button" disabled={busy} onclick={() => moveStatus('reviewed')}>Mark reviewed</button>{/if}
          {#if latestRun.status === 'reviewed'}<button type="button" disabled={busy} onclick={() => moveStatus('locked_estimate')}>Lock estimate</button>{/if}
          {#if latestRun.status === 'reviewed' || latestRun.status === 'locked_estimate'}<button type="button" disabled={busy || !canReconcile} onclick={() => moveStatus('reconciled')}>Mark reconciled</button>{/if}
          {#if latestRun.status === 'reconciled'}<button type="button" class="finalize" disabled={busy} onclick={() => moveStatus('finalized')}>Finalize payroll</button>{/if}
        </div>
      </footer>
    {:else if workspace.readiness.ready}
      <p class="empty">Evidence is ready. Calculate this month to create the first immutable run.</p>
    {/if}
  {:else}
    <p class="empty">Loading monthly payroll…</p>
  {/if}
</section>

<style>
  .payroll-workspace { display: grid; gap: 16px; padding: 24px; border-top: 1px solid var(--rst-ui-line); background: var(--rst-ui-surface-panel); }
  .payroll-head, .payroll-gate, .run-actions, .component-detail header { display: flex; align-items: flex-start; justify-content: space-between; gap: 20px; }
  .payroll-head > div { max-width: 720px; }
  .payroll-head span, .payroll-gate span, .run-meta span, .component-detail header span { color: var(--rst-ui-muted); font-size: 10px; text-transform: uppercase; letter-spacing: 0; }
  h2, h3, p { margin: 0; }
  h2 { margin-top: 4px; font-size: 21px; }
  h3 { margin-top: 3px; font-size: 17px; }
  .payroll-head p, .run-actions p { margin-top: 6px; color: var(--rst-ui-muted); font-size: 12px; line-height: 1.5; }
  .payroll-head label { display: grid; gap: 5px; color: var(--rst-ui-muted); font-size: 10px; text-transform: uppercase; }
  input { min-height: 40px; padding: 8px 10px; border: 1px solid var(--rst-ui-line); border-radius: var(--rst-ui-radius-md); color: var(--rst-ui-text); background: var(--rst-ui-surface-field-strong); font: inherit; }
  .payroll-gate { align-items: center; padding: 14px 16px; border: 1px solid rgba(246, 181, 63, .32); background: rgba(246, 181, 63, .06); }
  .payroll-gate.is-ready { border-color: rgba(66, 216, 132, .34); background: rgba(66, 216, 132, .06); }
  .payroll-gate div { display: grid; gap: 4px; }
  button { font: inherit; }
  .payroll-gate button, .run-actions button { min-height: 39px; padding: 8px 14px; border: 1px solid var(--rst-ui-line-strong); border-radius: var(--rst-ui-radius-md); color: var(--rst-ui-text); background: var(--rst-ui-surface-field-strong); cursor: pointer; }
  .payroll-gate button:not(:disabled), .run-actions .finalize { border-color: transparent; color: white; background: var(--rst-ui-accent); }
  button:disabled { opacity: .5; cursor: default; }
  .issue-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; }
  .issue-grid button { display: grid; gap: 3px; padding: 12px; text-align: left; border: 1px solid var(--rst-ui-line); background: var(--rst-ui-surface-field); color: var(--rst-ui-text); cursor: pointer; }
  .issue-grid span { color: var(--rst-state-warning-text); font-size: 9px; text-transform: uppercase; }
  .issue-grid small { color: var(--rst-ui-muted); }
  .run-meta { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); border: 1px solid var(--rst-ui-line); }
  .run-meta div { display: grid; gap: 4px; padding: 13px; border-right: 1px solid var(--rst-ui-line); }
  .run-meta div:last-child { border-right: 0; }
  .run-meta strong { font-size: 16px; font-variant-numeric: tabular-nums; }
  .payroll-ledger { overflow-x: auto; border: 1px solid var(--rst-ui-line); }
  .ledger-head, .payroll-ledger > button { min-width: 920px; display: grid; grid-template-columns: minmax(170px, 1.4fr) repeat(5, minmax(105px, 1fr)) 90px; gap: 10px; align-items: center; padding: 10px 12px; }
  .ledger-head { color: var(--rst-ui-muted); background: var(--rst-ui-surface-field); font-size: 10px; text-transform: uppercase; }
  .payroll-ledger > button { width: 100%; border: 0; border-top: 1px solid var(--rst-ui-line); color: var(--rst-ui-text); background: transparent; text-align: right; cursor: pointer; }
  .payroll-ledger > button strong { text-align: left; }
  .payroll-ledger > button:hover, .payroll-ledger > button.is-selected { background: var(--rst-ui-surface-field); }
  .payroll-ledger em { color: var(--rst-state-warning-text); font-style: normal; font-size: 10px; text-transform: uppercase; }
  .component-detail { border: 1px solid var(--rst-ui-line); background: var(--rst-ui-surface-field); }
  .component-detail header { align-items: center; padding: 13px 15px; border-bottom: 1px solid var(--rst-ui-line); }
  .component-detail header button { width: 34px; height: 34px; border: 0; color: var(--rst-ui-muted); background: transparent; font-size: 21px; cursor: pointer; }
  .component-list { display: grid; }
  .component-list article { display: grid; border-bottom: 1px solid var(--rst-ui-line); }
  .component-list article:last-child { border-bottom: 0; }
  .component-row { display: grid; grid-template-columns: minmax(0, 1fr) minmax(180px, .45fr); gap: 16px; width: 100%; padding: 13px 15px; border: 0; color: var(--rst-ui-text); background: transparent; text-align: left; cursor: pointer; }
  .component-row:hover, .component-row[aria-expanded='true'] { background: var(--rst-ui-surface-field-strong); }
  .component-row > div { display: grid; gap: 4px; }
  .component-list small, .formula span { color: var(--rst-ui-muted); font-size: 11px; line-height: 1.4; }
  .formula { text-align: right; }
  .line-evidence { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 1px; border-top: 1px solid var(--rst-ui-line); background: var(--rst-ui-line); }
  .line-evidence > div { display: grid; align-content: start; gap: 4px; min-height: 82px; padding: 11px 13px; background: var(--rst-ui-surface-panel); }
  .line-evidence span { color: var(--rst-ui-muted); font-size: 9px; text-transform: uppercase; }
  .line-evidence strong, .line-evidence a { color: var(--rst-ui-text); font-size: 11px; }
  .line-evidence a { text-decoration-color: var(--rst-ui-action); text-underline-offset: 2px; }
  .line-evidence .source-list { grid-column: 1 / -1; min-height: auto; }
  .source-list b { color: var(--rst-ui-text); font-weight: var(--rst-fw-bold); text-transform: capitalize; }
  .run-actions { align-items: center; }
  .run-actions p { max-width: 650px; }
  .run-actions div { display: flex; gap: 8px; }
  .empty { padding: 18px; color: var(--rst-ui-muted); text-align: center; }
  @media (max-width: 760px) {
    .payroll-workspace { padding: 16px; }
    .payroll-head, .payroll-gate, .run-actions { display: grid; }
    .payroll-head label { width: 100%; }
    .issue-grid, .run-meta { grid-template-columns: 1fr; }
    .run-meta div { border-right: 0; border-bottom: 1px solid var(--rst-ui-line); }
    .run-meta div:last-child { border-bottom: 0; }
    .component-row, .line-evidence { grid-template-columns: 1fr; }
    .line-evidence .source-list { grid-column: auto; }
    .formula { text-align: left; }
    .run-actions div, .run-actions button { width: 100%; }
  }
</style>
