<script lang="ts">
  import { formatHours } from '$lib/calendar/date';
  import { formatCents } from '$lib/payroll-engine/money';
  import { t } from '$lib/i18n/i18n.svelte';
  import type { CostInsights, CostRow } from './cost-model';

  let { view, labels, locale = 'en-GB' }: {
    view: CostInsights;
    labels: string[];
    locale?: string;
  } = $props();

  type Breakdown = 'employees' | 'areas' | 'services' | 'employmentTypes';
  let breakdown = $state<Breakdown>('employees');
  const rows = $derived(view[breakdown]);
  const chartMax = $derived(
    view.buckets.reduce(
      (maximum, bucket) => Math.max(
        maximum,
        Number(bucket.plannedCostCents),
        Number(bucket.workedCostCents),
        Number(bucket.comparisonWorkedCostCents)
      ),
      1
    )
  );

  function height(value: bigint): number {
    return Math.max(value > 0n ? 3 : 0, Number(value) / chartMax * 100);
  }

  function hours(minutes: number): string {
    return formatHours(minutes / 60);
  }

  function rate(row: CostRow): string {
    return row.hourlyCostCents == null ? '—' : `${formatCents(row.hourlyCostCents, locale)}/h`;
  }
</script>

<div class="cost-view">
  <section class="cost-intro">
    <div>
      <span>{t('Pre-payroll estimate')}</span>
      <h2>{t('Estimated labour cost')}</h2>
      <p>{t('Cost estimates use the hourly employer-cost value recorded in Team. They do not yet include all calculated payroll components. Reconciled payroll costs will replace these estimates when available.')}</p>
    </div>
    <em>{t('Source')} · {view.source.replaceAll('_', ' ')}</em>
  </section>

  <section class="cost-metrics">
    <article><span>{t('Planned scheduled cost')}</span><strong>{formatCents(view.plannedCostCents, locale)}</strong><small>{t('Scheduled duration; planned breaks are not available')}</small></article>
    <article><span>{t('Worked estimated cost')}</span><strong>{formatCents(view.workedCostCents, locale)}</strong><small>{hours(view.coveredWorkedMinutes)} {t('with a cost rate')}</small></article>
    <article class:negative={view.varianceCents > 0n}><span>{t('Variance')}</span><strong>{view.varianceCents > 0n ? '+' : ''}{formatCents(view.varianceCents, locale)}</strong><small>{t('Worked minus planned')}</small></article>
    <article><span>{t('Average estimated cost')}</span><strong>{view.averageWorkedHourlyCostCents == null ? '—' : `${formatCents(view.averageWorkedHourlyCostCents, locale)}/h`}</strong><small>{t('Covered worked hours')}</small></article>
  </section>

  <section class="cost-chart">
    <header>
      <div><span>{t('Cost rhythm')}</span><strong>{t('Plan, floor and comparison')}</strong></div>
      <div class="legend"><i class="planned"></i>{t('Planned')}<i class="worked"></i>{t('Worked')}<i class="comparison"></i>{t('Comparison')}</div>
    </header>
    <div class="bars">
      {#each view.buckets as bucket, index (bucket.key)}
        <div class="bucket" title={`${labels[index] ?? bucket.key} · ${formatCents(bucket.workedCostCents, locale)}`}>
          <div class="columns"><i class="planned" style={`height:${height(bucket.plannedCostCents)}%`}></i><i class="worked" style={`height:${height(bucket.workedCostCents)}%`}></i><i class="comparison" style={`height:${height(bucket.comparisonWorkedCostCents)}%`}></i></div>
          <small>{labels[index] ?? bucket.key}</small>
        </div>
      {/each}
    </div>
  </section>

  <div class="cost-lower">
    <section class="coverage">
      <header><span>{t('Cost-data coverage')}</span><strong>{view.coverage == null ? '—' : `${Math.round(view.coverage * 100)}%`}</strong></header>
      <div class="coverage-track"><i style={`width:${Math.round((view.coverage ?? 0) * 100)}%`}></i></div>
      <p>{view.missingActiveEmployeeCount === 1 ? t('1 active employee needs an estimated hourly cost') : t('{count} active employees need an estimated hourly cost', { count: view.missingActiveEmployeeCount })}</p>
      <small>{t('{count} invalid, open or overlapping entries excluded', { count: view.excludedEntryCount })}</small>
    </section>

    <section class="breakdown">
      <header>
        <div><span>{t('Cost breakdown')}</span><strong>{t('Where estimated cost sits')}</strong></div>
        <select bind:value={breakdown} aria-label={t('Cost breakdown')}><option value="employees">{t('Employee')}</option><option value="areas">{t('Work area')}</option><option value="services">{t('Service')}</option><option value="employmentTypes">{t('Employment type')}</option></select>
      </header>
      <div class="cost-table">
        <div class="table-head"><span>{t('Name')}</span><span>{t('Worked')}</span><span>{t('Rate')}</span><span>{t('Worked cost')}</span><span>{t('Planned cost')}</span><span>{t('Variance')}</span></div>
        {#each rows as row (row.id)}
          <div class="table-row"><strong>{row.label}</strong><span>{hours(row.workedMinutes)}</span><span>{rate(row)}</span><span>{formatCents(row.workedCostCents, locale)}</span><span>{formatCents(row.plannedCostCents, locale)}</span><em class:negative={row.varianceCents > 0n}>{row.varianceCents > 0n ? '+' : ''}{formatCents(row.varianceCents, locale)}</em></div>
        {:else}<p>{t('No cost evidence in this lens.')}</p>{/each}
      </div>
    </section>
  </div>
</div>

<style>
  .cost-view { display: grid; gap: 16px; }
  .cost-intro { display: flex; justify-content: space-between; gap: 24px; align-items: flex-start; padding: 22px 24px; color: #fffaf2; background: #101a23; border-radius: var(--rst-ui-radius-md); }
  .cost-intro div { max-width: 760px; }
  .cost-intro span, .cost-chart header span, .breakdown header span, .coverage header span { color: var(--rst-ui-action); font-size: 10px; font-weight: var(--rst-fw-bold); text-transform: uppercase; }
  .cost-intro h2 { margin: 4px 0 7px; font-size: 23px; }
  .cost-intro p { margin: 0; color: rgba(255,250,242,.68); font-size: 12px; line-height: 1.5; }
  .cost-intro em { flex: 0 0 auto; padding: 6px 8px; border: 1px solid rgba(255,255,255,.15); border-radius: var(--rst-ui-radius-sm); color: rgba(255,250,242,.72); font-size: 10px; font-style: normal; text-transform: capitalize; }
  .cost-metrics { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); border: 1px solid var(--rst-ui-line); background: var(--rst-ui-surface-panel); }
  .cost-metrics article { min-width: 0; display: grid; gap: 4px; padding: 16px; border-right: 1px solid var(--rst-ui-line); }
  .cost-metrics article:last-child { border-right: 0; }
  .cost-metrics span { color: var(--rst-ui-muted); font-size: 10px; font-weight: var(--rst-fw-bold); text-transform: uppercase; }
  .cost-metrics strong { font-size: 22px; font-variant-numeric: tabular-nums; }
  .cost-metrics small { color: var(--rst-ui-muted); font-size: 10px; }
  .negative { color: var(--rst-state-warning-text); }
  .cost-chart, .breakdown, .coverage { min-width: 0; padding: 20px 22px; border: 1px solid var(--rst-ui-line); background: var(--rst-ui-surface-panel); }
  .cost-chart header, .breakdown header, .coverage header { display: flex; justify-content: space-between; align-items: center; gap: 16px; }
  .cost-chart header > div:first-child, .breakdown header > div { display: grid; gap: 3px; }
  .legend { display: flex; align-items: center; gap: 6px; color: var(--rst-ui-muted); font-size: 10px; }
  .legend i { width: 8px; height: 8px; margin-left: 6px; border-radius: 2px; }
  .planned { background: #dd8c38; }.worked { background: #278b72; }.comparison { background: #96a1aa; }
  .bars { height: 240px; display: flex; align-items: stretch; gap: 5px; margin-top: 20px; border-bottom: 1px solid var(--rst-ui-line); }
  .bucket { min-width: 0; flex: 1; display: grid; grid-template-rows: 1fr 26px; align-items: end; gap: 6px; }
  .columns { height: 100%; display: flex; align-items: end; justify-content: center; gap: 2px; }
  .columns i { width: min(9px, 28%); min-height: 0; border-radius: 2px 2px 0 0; }
  .bucket small { overflow: hidden; color: var(--rst-ui-muted); font-size: 9px; text-align: center; text-overflow: ellipsis; white-space: nowrap; }
  .cost-lower { display: grid; grid-template-columns: minmax(230px,.55fr) minmax(0,1.8fr); gap: 16px; align-items: start; }
  .coverage { display: grid; gap: 14px; }
  .coverage header strong { font-size: 27px; }
  .coverage-track { height: 8px; overflow: hidden; background: var(--rst-ui-line); }
  .coverage-track i { display: block; height: 100%; background: #278b72; }
  .coverage p { margin: 0; font-size: 13px; line-height: 1.45; }
  .coverage small { color: var(--rst-ui-muted); font-size: 10px; }
  select { min-height: 36px; padding: 6px 9px; border: 1px solid var(--rst-ui-line); border-radius: var(--rst-ui-radius-sm); color: var(--rst-ui-text); background: var(--rst-ui-surface-field-strong); font: inherit; }
  .cost-table { margin-top: 14px; overflow-x: auto; }
  .table-head, .table-row { min-width: 730px; display: grid; grid-template-columns: minmax(150px,1.3fr) repeat(5,minmax(88px,.75fr)); gap: 10px; align-items: center; padding: 10px 6px; border-bottom: 1px solid var(--rst-ui-line); }
  .table-head { color: var(--rst-ui-muted); font-size: 9px; font-weight: var(--rst-fw-bold); text-transform: uppercase; }
  .table-row { font-size: 11px; font-variant-numeric: tabular-nums; }
  .table-row em { font-style: normal; }
  @media (max-width: 980px) { .cost-metrics { grid-template-columns: repeat(2,minmax(0,1fr)); }.cost-metrics article:nth-child(2) { border-right: 0; }.cost-metrics article:nth-child(-n+2) { border-bottom: 1px solid var(--rst-ui-line); }.cost-lower { grid-template-columns: 1fr; } }
  @media (max-width: 520px) { .cost-intro { display: grid; padding: 18px 16px; }.cost-intro em { justify-self: start; }.cost-metrics { grid-template-columns: 1fr; }.cost-metrics article { border-right: 0; border-bottom: 1px solid var(--rst-ui-line); }.cost-metrics article:last-child { border-bottom: 0; }.cost-chart, .breakdown, .coverage { padding: 16px 14px; }.bars { height: 190px; gap: 2px; }.cost-chart .legend { display: none; } }
</style>
