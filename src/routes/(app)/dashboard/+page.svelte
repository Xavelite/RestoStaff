<script lang="ts">
  import PageHero from '$lib/components/PageHero.svelte';
  import { getManagerOperationsReadModel } from '$lib/api/workspace';
  import type { ManagerOperationsReadModel } from '$lib/api/workspace-snapshot';
  import { addMonths, formatHours, serviceLabel, todayInTimezone } from '$lib/calendar/date';
  import { i18n, t } from '$lib/i18n/i18n.svelte';
  import { workspace } from '$lib/workspace/workspace.svelte';
  import {
    buildInsights,
    dashboardReadRanges,
    insightFilterOptions,
    insightLoadRange,
    insightPeriodRange,
    mergeDashboardReadModels,
    moveInsightAnchor,
    regimeLabel,
    type ComparisonMode,
    type EmployeeInsight,
    type InsightPeriod,
    type InsightView,
    type PulseCell,
    type Regime,
    type WorkforceFilter
  } from '$lib/dashboard/dashboard-model';

  type StudioTab = 'overview' | 'people' | 'operations';
  type PeopleMetric = 'hours' | 'adherence' | 'punctuality' | 'exceptions';

  let activeTab = $state<StudioTab>('overview');
  let period = $state<InsightPeriod>('month');
  let comparisonMode = $state<ComparisonMode>('previous');
  let anchor = $state(todayInTimezone('Europe/Brussels'));
  let workforce = $state<WorkforceFilter>('all');
  let employeeFilterId = $state('');
  let areaId = $state('');
  let serviceKey = $state('');
  let focusedEmployeeId = $state('');
  let peopleMetric = $state<PeopleMetric>('hours');
  let hoverBucket = $state<number | null>(null);
  let selectedPulseKey = $state('');
  let model = $state<ManagerOperationsReadModel | null>(null);
  let loading = $state(true);
  let errorMessage = $state('');

  const timezone = $derived(workspace.bootstrap?.restaurant_settings.timezone || 'Europe/Brussels');
  const today = $derived(todayInTimezone(timezone));
  const earliestAnchor = $derived(addMonths(today, -23));
  const currentRange = $derived(insightPeriodRange(anchor, period, i18n.intlLocale));
  const filters = $derived({ workforce, employeeId: employeeFilterId, areaId, serviceKey });
  const filterOptions = $derived(model ? insightFilterOptions(model) : null);
  const view = $derived<InsightView | null>(
    model ? buildInsights(model, anchor, period, comparisonMode, filters, today, i18n.intlLocale) : null
  );
  const focusedEmployee = $derived(
    view?.employees.find((employee) => employee.id === focusedEmployeeId) ?? null
  );
  const focusedPulse = $derived(focusedEmployee ? employeePulse(focusedEmployee) : []);
  const hasFilters = $derived(
    workforce !== 'all' || Boolean(employeeFilterId || areaId || serviceKey)
  );
  const workforceHoursTotal = $derived(
    Math.max(1, (view?.flexiHours ?? 0) + (view?.fixedHours ?? 0) + (view?.managerHours ?? 0))
  );

  const chartMax = $derived.by(() => {
    if (!view) return 1;
    return Math.max(
      1,
      ...view.buckets.flatMap((bucket) => [
        bucket.planned,
        bucket.worked,
        bucket.comparisonWorked
      ])
    );
  });

  const rankedPeople = $derived.by(() => {
    if (!view) return [];
    return [...view.employees].sort((a, b) => {
      if (peopleMetric === 'hours') return b.worked - a.worked || a.name.localeCompare(b.name);
      if (peopleMetric === 'adherence') return (b.adherence ?? -1) - (a.adherence ?? -1);
      if (peopleMetric === 'punctuality') return (a.lateRate ?? 0) - (b.lateRate ?? 0);
      return b.missingBadges + b.corrections + b.lateCount - (a.missingBadges + a.corrections + a.lateCount);
    });
  });

  const heroTitle = $derived.by(() => {
    if (activeTab === 'people') {
      return focusedEmployee
        ? t('{name}, in context.', { name: focusedEmployee.name })
        : t('Understand the people behind service.');
    }
    if (activeTab === 'operations') return t('See where the plan meets the floor.');
    if (!view?.hasData) return t('Your restaurant, in evidence.');
    if (view.current.missingBadges > 0) {
      return t(
        view.current.missingBadges === 1
          ? '{count} badge gap needs context.'
          : '{count} badge gaps need context.',
        { count: view.current.missingBadges }
      );
    }
    if (view.current.adherence !== null && view.current.adherence >= 0.95) {
      return t('Plan and floor are moving together.');
    }
    return t('{hours} worked in {period}.', {
      hours: formatHours(view.current.worked),
      period: view.currentRange.label
    });
  });

  $effect(() => {
    const restaurantId = workspace.activeId;
    const selectedPeriod = period;
    const selectedComparison = comparisonMode;
    const selectedAnchor = anchor;
    if (!restaurantId) return;
    let cancelled = false;
    loading = true;
    errorMessage = '';
    const loadRange = insightLoadRange(selectedAnchor, selectedPeriod, selectedComparison);
    const ranges = dashboardReadRanges(loadRange.from, loadRange.to);
    Promise.all(
      ranges.map((range) =>
        getManagerOperationsReadModel(restaurantId, range.from, range.to)
      )
    )
      .then((models) => {
        if (!cancelled) model = mergeDashboardReadModels(models);
      })
      .catch((error) => {
        if (!cancelled) {
          errorMessage = error instanceof Error ? error.message : t('Insights could not be loaded');
        }
      })
      .finally(() => {
        if (!cancelled) loading = false;
      });
    return () => {
      cancelled = true;
    };
  });

  function changePeriod(next: InsightPeriod): void {
    period = next;
    hoverBucket = null;
  }

  function movePeriod(direction: -1 | 1): void {
    const next = moveInsightAnchor(anchor, period, direction);
    const nextRange = insightPeriodRange(next, period);
    if (direction < 0 && nextRange.to < earliestAnchor) return;
    if (direction > 0 && nextRange.from > today) return;
    anchor = next;
    hoverBucket = null;
  }

  function setWorkforce(next: WorkforceFilter): void {
    workforce = next;
    if (
      employeeFilterId &&
      filterOptions?.employees.find((employee) => employee.id === employeeFilterId)?.regime !== next &&
      next !== 'all'
    ) {
      employeeFilterId = '';
    }
    focusedEmployeeId = '';
  }

  function setEmployeeFilter(value: string): void {
    employeeFilterId = value;
    focusedEmployeeId = value;
  }

  function clearFilters(): void {
    workforce = 'all';
    employeeFilterId = '';
    areaId = '';
    serviceKey = '';
    focusedEmployeeId = '';
  }

  function focusEmployee(employeeId: string): void {
    focusedEmployeeId = employeeId;
    activeTab = 'people';
  }

  function pct(value: number | null): string {
    return value === null ? t('No plan') : `${Math.round(value * 100)}%`;
  }

  function changeLabel(current: number, previous: number, inverse = false): { text: string; tone: string } {
    if (previous === 0) return { text: current > 0 ? t('New in this period') : t('No change'), tone: 'neutral' };
    const change = (current - previous) / Math.abs(previous);
    if (Math.abs(change) < 0.005) return { text: t('Flat vs comparison'), tone: 'neutral' };
    const good = inverse ? change < 0 : change > 0;
    return {
      text: t('{change}% vs comparison', { change: `${change > 0 ? '+' : ''}${Math.round(change * 100)}` }),
      tone: good ? 'good' : 'bad'
    };
  }

  function peopleMetricValue(employee: EmployeeInsight): string {
    if (peopleMetric === 'hours') return formatHours(employee.worked);
    if (peopleMetric === 'adherence') return pct(employee.adherence);
    if (peopleMetric === 'punctuality') {
      return employee.evaluatedStarts
        ? t('{percent}% on time', { percent: Math.round((1 - (employee.lateRate ?? 0)) * 100) })
        : t('No starts');
    }
    const issues = employee.missingBadges + employee.corrections + employee.lateCount;
    return t(issues === 1 ? '{count} signal' : '{count} signals', { count: issues });
  }

  function peopleMetricWidth(employee: EmployeeInsight): number {
    if (peopleMetric === 'hours') {
      const max = Math.max(1, ...rankedPeople.map((person) => person.worked));
      return (employee.worked / max) * 100;
    }
    if (peopleMetric === 'adherence') return Math.min(100, (employee.adherence ?? 0) * 100);
    if (peopleMetric === 'punctuality') return employee.evaluatedStarts ? (1 - (employee.lateRate ?? 0)) * 100 : 0;
    const max = Math.max(1, ...rankedPeople.map((person) => person.missingBadges + person.corrections + person.lateCount));
    return ((employee.missingBadges + employee.corrections + employee.lateCount) / max) * 100;
  }

  function employeePulse(employee: EmployeeInsight): PulseCell[] {
    return Array.from({ length: 14 }, (_, index) => {
      const weekday = Math.floor(index / 2) + 1;
      const service = index % 2 === 0 ? 'lunch' : 'evening';
      const rows = employee.shiftsEvidence.filter((shift) => {
        const day = new Date(`${shift.date}T00:00:00Z`).getUTCDay() || 7;
        return day === weekday && shift.serviceKey === service;
      });
      const issues = rows.filter((row) => ['late', 'missing', 'corrected', 'open'].includes(row.status)).length;
      return {
        weekday,
        weekdayLabel: new Intl.DateTimeFormat(i18n.intlLocale, { weekday: 'short', timeZone: 'UTC' }).format(
          new Date(Date.UTC(2026, 0, 4 + weekday))
        ),
        serviceKey: service,
        serviceLabel: serviceLabel(service),
        planned: rows.length,
        worked: rows.filter((row) => ['worked', 'late', 'corrected', 'unplanned'].includes(row.status)).length,
        issues,
        intensity: rows.length ? Math.min(1, (rows.length - issues) / rows.length) : 0
      };
    });
  }

  function pulseKey(label: string, cell: PulseCell): string {
    return `${label}:${cell.serviceKey}:${cell.weekday}`;
  }

  function employeeChartMax(employee: EmployeeInsight): number {
    return Math.max(1, ...employee.plannedByBucket, ...employee.workedByBucket);
  }

  function chartPath(values: number[], max: number): string {
    if (!values.length) return '';
    const width = 900;
    const height = 250;
    const step = values.length > 1 ? width / (values.length - 1) : width;
    return values
      .map((value, index) => {
        const x = values.length === 1 ? width / 2 : index * step;
        const y = height - 18 - (value / Math.max(1, max)) * (height - 36);
        return `${index ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(' ');
  }

  function chartArea(values: number[], max: number): string {
    const line = chartPath(values, max);
    if (!line || !values.length) return '';
    const lastX = values.length === 1 ? 450 : 900;
    const firstX = values.length === 1 ? 450 : 0;
    return `${line} L${lastX},250 L${firstX},250 Z`;
  }

  function displayDate(value: string): string {
    return new Intl.DateTimeFormat(i18n.intlLocale, {
      day: '2-digit',
      month: 'short',
      timeZone: 'UTC'
    }).format(new Date(`${value}T00:00:00Z`));
  }

  function tenureLabel(months: number | null): string {
    if (months === null) return t('Not recorded');
    if (months < 1) return t('New this month');
    if (months < 12) return t('{count} months', { count: months });
    const years = Math.floor(months / 12);
    const remainder = months % 12;
    return remainder
      ? t('{years}y {months}m', { years, months: remainder })
      : t(years === 1 ? '{count} year' : '{count} years', { count: years });
  }

  function regimeClass(regime: Regime): string {
    return `is-${regime}`;
  }
</script>

<svelte:head><title>{t('Insights')} - restogogo</title></svelte:head>

{#snippet signalCard(label: string, value: string, note: string, tone: string, progress: number)}
  <article class="signal-card is-{tone}">
    <span>{label}</span>
    <strong>{value}</strong>
    <p>{note}</p>
    <i style={`--progress:${Math.max(0, Math.min(100, progress))}%`}></i>
  </article>
{/snippet}

{#snippet pulseGrid(cells: PulseCell[], label: string)}
  <div class="pulse-grid" aria-label={label}>
    <span class="pulse-grid__corner">{t('Service')}</span>
    {#each Array.from({ length: 7 }, (_, index) => new Intl.DateTimeFormat(i18n.intlLocale, { weekday: 'short', timeZone: 'UTC' }).format(new Date(Date.UTC(2026, 0, 5 + index)))) as day}
      <strong>{day}</strong>
    {/each}
    {#each ['lunch', 'evening'] as service}
      <b>{t(serviceLabel(service))}</b>
      {#each cells.filter((cell) => cell.serviceKey === service) as cell (cell.weekday)}
        <button
          type="button"
          class:has-issues={cell.issues > 0}
          class:is-empty={cell.planned === 0 && cell.worked === 0}
          class:is-selected={selectedPulseKey === pulseKey(label, cell)}
          style={`--intensity:${cell.intensity}`}
          title={`${cell.weekdayLabel} ${cell.serviceLabel}: ${cell.worked}/${cell.planned} worked, ${cell.issues} signals`}
          aria-pressed={selectedPulseKey === pulseKey(label, cell)}
          onclick={() => (selectedPulseKey = selectedPulseKey === pulseKey(label, cell) ? '' : pulseKey(label, cell))}
        >
          <span>{cell.worked}/{cell.planned}</span>
          {#if cell.issues}<i>{cell.issues}</i>{/if}
        </button>
      {/each}
    {/each}
  </div>
  {#each cells.filter((cell) => selectedPulseKey === pulseKey(label, cell)) as selected (pulseKey(label, selected))}
    <div class="pulse-readout">
      <span>{selected.weekdayLabel} - {selected.serviceLabel}</span>
      <strong>{t(selected.worked === 1 ? '{worked} worked shift against {planned} planned' : '{worked} worked shifts against {planned} planned', { worked: selected.worked, planned: selected.planned })}</strong>
      <small>{selected.issues ? t(selected.issues === 1 ? '{count} evidence signal needs review.' : '{count} evidence signals need review.', { count: selected.issues }) : t('No evidence signals in this cell.')}</small>
    </div>
  {/each}
{/snippet}

<div class="page-shell insights-page">
  <PageHero
    eyebrow={t('Insights studio')}
    titleId="insights-title"
    title={heroTitle}
    subtitle={t('Explore the restaurant, compare periods, and open the evidence behind every signal.')}
  >
    {#snippet command()}
      <div class="hero-lens">
        <span>{t('Current lens')}</span>
        <strong>{currentRange.label}</strong>
        <small>{comparisonMode === 'year' ? t('Same period last year') : t('Previous period')}</small>
      </div>
    {/snippet}
  </PageHero>

  <div class="studio-shell">
    <nav class="studio-tabs" aria-label={t('Insights sections')}>
      <button type="button" class:is-active={activeTab === 'overview'} onclick={() => (activeTab = 'overview')}>
        <span>01</span><strong>{t('Overview')}</strong><small>{t('Restaurant pulse')}</small>
      </button>
      <button type="button" class:is-active={activeTab === 'people'} onclick={() => (activeTab = 'people')}>
        <span>02</span><strong>{t('People')}</strong><small>{t('Evidence by employee')}</small>
      </button>
      <button type="button" class:is-active={activeTab === 'operations'} onclick={() => (activeTab = 'operations')}>
        <span>03</span><strong>{t('Operations')}</strong><small>{t('Services and areas')}</small>
      </button>
    </nav>

    <section class="evidence-bar" aria-label={t('Insights controls')}>
      <div class="control-block">
        <span>{t('Period')}</span>
        <div class="segmented" role="group" aria-label={t('Period')}>
          <button type="button" class:is-active={period === 'week'} onclick={() => changePeriod('week')}>{t('Week')}</button>
          <button type="button" class:is-active={period === 'month'} onclick={() => changePeriod('month')}>{t('Month')}</button>
          <button type="button" class:is-active={period === 'year'} onclick={() => changePeriod('year')}>{t('Year')}</button>
        </div>
      </div>
      <div class="period-stepper">
        <button type="button" aria-label={t('Previous period')} onclick={() => movePeriod(-1)}>‹</button>
        <strong>{currentRange.label}</strong>
        <button
          type="button"
          aria-label={t('Next')}
          disabled={insightPeriodRange(moveInsightAnchor(anchor, period, 1), period).from > today}
          onclick={() => movePeriod(1)}
        >›</button>
      </div>
      <div class="control-block">
        <span>{t('Compare')}</span>
        <div class="segmented" role="group" aria-label={t('Compare')}>
          <button type="button" class:is-active={comparisonMode === 'previous'} onclick={() => (comparisonMode = 'previous')}>{t('Previous')}</button>
          <button type="button" class:is-active={comparisonMode === 'year'} onclick={() => (comparisonMode = 'year')}>{t('Last year')}</button>
        </div>
      </div>
      <div class="workforce-filter" role="group" aria-label={t('Workforce')}>
        {#each [['all', 'All'], ['fixed', 'Fixed'], ['flexi', 'Flexi'], ['manager', 'Management']] as option}
          <button
            type="button"
            class:is-active={workforce === option[0]}
            onclick={() => setWorkforce(option[0] as WorkforceFilter)}
          >{t(option[1])}</button>
        {/each}
      </div>
      <label>
        <span>{t('Employee')}</span>
        <select value={employeeFilterId} onchange={(event) => setEmployeeFilter(event.currentTarget.value)}>
          <option value="">{t('All employees')}</option>
          {#each filterOptions?.employees.filter((employee) => workforce === 'all' || employee.regime === workforce) ?? [] as employee}
            <option value={employee.id}>{employee.name}</option>
          {/each}
        </select>
      </label>
      <label>
        <span>{t('Area')}</span>
        <select bind:value={areaId}>
          <option value="">{t('All areas')}</option>
          {#each filterOptions?.areas ?? [] as area}
            <option value={area.id}>{area.name}</option>
          {/each}
        </select>
      </label>
      <label>
        <span>{t('Service')}</span>
        <select bind:value={serviceKey}>
          <option value="">{t('All services')}</option>
          {#each filterOptions?.services ?? [] as service}
            <option value={service.key}>{t(service.label)}</option>
          {/each}
        </select>
      </label>
      {#if hasFilters}
        <button type="button" class="clear-filters" onclick={clearFilters}>{t('Clear filters')}</button>
      {/if}
    </section>

    {#if loading && !model}
      <div class="state"><span></span><strong>{t('Building the evidence view')}</strong><small>{t('Reading schedules, badges, leave and corrections.')}</small></div>
    {:else if errorMessage}
      <div class="state is-error"><strong>{t('Insights could not be loaded')}</strong><small>{errorMessage}</small></div>
    {:else if !view || !view.hasData}
      <div class="state"><strong>{t('No evidence in this lens yet')}</strong><small>{t('Try another period or clear one of the filters.')}</small></div>
    {:else if activeTab === 'overview'}
      <div class="view-stack overview-view">
        <section class="signal-grid" aria-label={t('Period signals')}>
          {@render signalCard(
            t('Worked hours'),
            formatHours(view.current.worked),
            changeLabel(view.current.worked, view.comparison.worked).text,
            changeLabel(view.current.worked, view.comparison.worked).tone,
            view.current.planned ? (view.current.worked / view.current.planned) * 100 : 0
          )}
          {@render signalCard(
            t('Plan adherence'),
            pct(view.current.adherence),
            t('{hours} scheduled', { hours: formatHours(view.current.planned) }),
            view.current.adherence !== null && view.current.adherence >= 0.9 ? 'good' : 'warning',
            (view.current.adherence ?? 0) * 100
          )}
          {@render signalCard(
            t('On-time starts'),
            view.current.evaluatedStarts ? `${Math.round((1 - (view.current.lateRate ?? 0)) * 100)}%` : t('No sample'),
            t('{late} late across {starts} evaluated starts', { late: view.current.lateCount, starts: view.current.evaluatedStarts }),
            view.current.lateCount ? 'warning' : 'good',
            view.current.evaluatedStarts ? (1 - (view.current.lateRate ?? 0)) * 100 : 0
          )}
          {@render signalCard(
            t('Evidence gaps'),
            String(view.current.missingBadges + view.current.corrections),
            t('{missing} missing - {corrected} corrected', { missing: view.current.missingBadges, corrected: view.current.corrections }),
            view.current.missingBadges ? 'bad' : view.current.corrections ? 'warning' : 'good',
            Math.max(0, 100 - (view.current.missingBadges + view.current.corrections) * 12)
          )}
        </section>

        <div class="overview-grid">
          <section class="chart-panel" aria-label={t('Worked against plan')}>
            <header class="panel-heading on-dark">
              <div><span>{t('Performance trace')}</span><h2>{t('Worked against plan')}</h2></div>
              <div class="chart-legend">
                <i class="is-worked"></i>{t('Worked')}
                <i class="is-plan"></i>{t('Plan')}
                <i class="is-compare"></i>{view.comparisonRange.label}
              </div>
            </header>
            <div class="trend-stage" role="group" aria-label={t('Interactive hours chart')} onpointerleave={() => (hoverBucket = null)}>
              <svg viewBox="0 0 900 250" preserveAspectRatio="none" role="img" aria-label={t('Worked, planned and comparison hours')}>
                <path class="chart-area" d={chartArea(view.buckets.map((bucket) => bucket.worked), chartMax)} />
                <path class="chart-line is-compare" d={chartPath(view.buckets.map((bucket) => bucket.comparisonWorked), chartMax)} />
                <path class="chart-line is-plan" d={chartPath(view.buckets.map((bucket) => bucket.planned), chartMax)} />
                <path class="chart-line is-worked" d={chartPath(view.buckets.map((bucket) => bucket.worked), chartMax)} />
              </svg>
              <div class="chart-hits" style={`--columns:${view.buckets.length}`}>
                {#each view.buckets as bucket, index (bucket.key)}
                  <button
                    type="button"
                    aria-label={t('{label}: {worked} worked, {planned} planned', { label: bucket.label, worked: formatHours(bucket.worked), planned: formatHours(bucket.planned) })}
                    onpointerenter={() => (hoverBucket = index)}
                    onfocus={() => (hoverBucket = index)}
                    onclick={() => (hoverBucket = index)}
                  ></button>
                {/each}
              </div>
              {#if hoverBucket !== null && view.buckets[hoverBucket]}
                <div class="chart-tooltip" style={`--left:${((hoverBucket + 0.5) / view.buckets.length) * 100}%`}>
                  <strong>{view.buckets[hoverBucket].label}</strong>
                  <span><i class="is-worked"></i>{formatHours(view.buckets[hoverBucket].worked)} {t('worked')}</span>
                  <span><i class="is-plan"></i>{formatHours(view.buckets[hoverBucket].planned)} {t('planned')}</span>
                  <span><i class="is-compare"></i>{formatHours(view.buckets[hoverBucket].comparisonWorked)} {t('comparison')}</span>
                  {#if view.buckets[hoverBucket].lateCount || view.buckets[hoverBucket].missingCount}
                    <small>{view.buckets[hoverBucket].lateCount} {t('late')} - {view.buckets[hoverBucket].missingCount} {t('missing')}</small>
                  {/if}
                </div>
              {/if}
            </div>
            <div class="chart-axis">
              {#each view.buckets as bucket, index (bucket.key)}
                {#if index % Math.max(1, Math.ceil(view.buckets.length / 7)) === 0 || index === view.buckets.length - 1}
                  <span>{bucket.shortLabel}</span>
                {/if}
              {/each}
            </div>
          </section>

          <section class="mix-panel" aria-label={t('Workforce mix')}>
            <header class="panel-heading on-dark">
              <div><span>{t('Workforce mix')}</span><h2>{t('Who carries the hours')}</h2></div>
              <strong>{formatHours(view.current.worked)}</strong>
            </header>
            <div class="mix-orbit" aria-hidden="true">
              <div style={`--fixed:${(view.fixedHours / workforceHoursTotal) * 360}deg;--flexi:${((view.fixedHours + view.flexiHours) / workforceHoursTotal) * 360}deg`}></div>
              <strong>{Math.round((view.flexiHours / workforceHoursTotal) * 100)}%</strong><span>flexi</span>
            </div>
            <div class="mix-rows">
              {#each [
                { key: 'fixed', label: 'Fixed contract', value: view.fixedHours },
                { key: 'flexi', label: 'Flexi', value: view.flexiHours },
                { key: 'manager', label: 'Management', value: view.managerHours }
              ] as row}
                <div>
                  <i class="is-{row.key}"></i><span>{t(row.label)}</span><strong>{formatHours(row.value)}</strong>
                  <b><em class="is-{row.key}" style={`--width:${(row.value / workforceHoursTotal) * 100}%`}></em></b>
                </div>
              {/each}
            </div>
          </section>
        </div>

        <div class="story-grid">
          <section class="pulse-panel">
            <header class="panel-heading">
              <div><span>{t('Service rhythm')}</span><h2>{t('When service holds - and where it slips')}</h2></div>
              <small>{t('Worked shifts / planned shifts')}</small>
            </header>
            {@render pulseGrid(view.pulse, 'Restaurant service pulse')}
          </section>
          <section class="briefing-panel">
            <header class="panel-heading on-dark"><div><span>{t('Evidence briefing')}</span><h2>{t('What deserves attention')}</h2></div></header>
            <div class="briefing-list">
              <article>
                <span>01</span>
                <div><strong>{view.current.missingBadges ? t('{count} planned shifts lack badge proof', { count: view.current.missingBadges }) : t('Every past planned shift has badge evidence')}</strong><small>{t('Missing proof remains separate from approved leave.')}</small></div>
              </article>
              <article>
                <span>02</span>
                <div><strong>{view.current.evaluatedStarts ? t('{late} of {starts} evaluated starts were late', { late: view.current.lateCount, starts: view.current.evaluatedStarts }) : t('No scheduled starts can be evaluated yet')}</strong><small>{t('Only starts with a schedule and badge are evaluated.')}</small></div>
              </article>
              <article>
                <span>03</span>
                <div><strong>{view.flexiHours ? t('Flexi employees supplied {percent}% of worked hours', { percent: Math.round((view.flexiHours / Math.max(1, view.current.worked)) * 100) }) : t('No flexi hours in this lens')}</strong><small>{t('Use the workforce filter to isolate the contribution.')}</small></div>
              </article>
            </div>
          </section>
        </div>
      </div>
    {:else if activeTab === 'people'}
      <div class="view-stack people-view">
        <section class="people-map-panel">
          <header class="panel-heading on-dark">
            <div><span>{t('Workforce map')}</span><h2>{t('Reliability needs context')}</h2><p>{t('Position shows plan adherence and on-time rate. Bubble size reflects worked hours.')}</p></div>
            <small>{t('{count} people in this lens', { count: view.employees.length })}</small>
          </header>
          <div class="people-map" aria-label={t('Employee reliability map')}>
            <span class="axis-y is-top">{t('On time')}</span><span class="axis-y is-bottom">{t('Late signals')}</span>
            <span class="axis-x is-left">{t('Below plan')}</span><span class="axis-x is-right">{t('At plan')}</span>
            <i class="map-line is-horizontal"></i><i class="map-line is-vertical"></i>
            {#each view.employees.filter((employee) => employee.regime !== 'manager') as employee (employee.id)}
              {@const x = Math.min(100, ((employee.adherence ?? 0) / 1.2) * 100)}
              {@const y = employee.evaluatedStarts ? (1 - (employee.lateRate ?? 0)) * 100 : 50}
              {@const size = Math.min(58, 30 + Math.sqrt(employee.worked) * 4)}
              <button
                type="button"
                class="person-bubble {regimeClass(employee.regime)}"
                class:is-selected={focusedEmployeeId === employee.id}
                style={`--x:${x}%;--y:${y}%;--size:${size}px`}
                title={`${employee.name}: ${pct(employee.adherence)} adherence, ${employee.evaluatedStarts ? Math.round((1 - (employee.lateRate ?? 0)) * 100) : 0}% on time, ${formatHours(employee.worked)} worked`}
                onclick={() => focusEmployee(employee.id)}
              >{employee.initials}</button>
            {/each}
          </div>
          <div class="map-legend"><span><i class="is-fixed"></i>{t('Fixed')}</span><span><i class="is-flexi"></i>{t('Flexi')}</span><small>{t('Employees without evaluated starts sit on the centre line.')}</small></div>
        </section>

        <section class="people-roster">
          <header class="panel-heading">
            <div><span>{t('People evidence')}</span><h2>{t('Compare without hiding the sample')}</h2></div>
            <div class="metric-switch" role="group" aria-label={t('People evidence')}>
              {#each [['hours', 'Hours'], ['adherence', 'Adherence'], ['punctuality', 'On time'], ['exceptions', 'Signals']] as option}
                <button type="button" class:is-active={peopleMetric === option[0]} onclick={() => (peopleMetric = option[0] as PeopleMetric)}>{t(option[1])}</button>
              {/each}
            </div>
          </header>
          <div class="people-list">
            {#each rankedPeople as employee, index (employee.id)}
              <button type="button" class:is-selected={focusedEmployeeId === employee.id} onclick={() => focusEmployee(employee.id)}>
                <span class="rank">{String(index + 1).padStart(2, '0')}</span>
                <span class="avatar {regimeClass(employee.regime)}">{employee.initials}</span>
                <span class="identity"><strong>{employee.name}</strong><small>{employee.role || t(regimeLabel[employee.regime])} - {t(regimeLabel[employee.regime])}</small></span>
                <span class="sample">{t(employee.shifts === 1 ? '{count} worked shift' : '{count} worked shifts', { count: employee.shifts })}<small>{t(employee.evaluatedStarts === 1 ? '{count} start evaluated' : '{count} starts evaluated', { count: employee.evaluatedStarts })}</small></span>
                <span class="metric-bar"><i style={`--width:${peopleMetricWidth(employee)}%`}></i></span>
                <strong class="metric-value">{peopleMetricValue(employee)}</strong>
                <span class="open-person">›</span>
              </button>
            {/each}
          </div>
        </section>

        {#if focusedEmployee}
          <section class="employee-lab" aria-label={`${focusedEmployee.name} analysis`}>
            <header class="employee-lab__hero">
              <span class="employee-lab__avatar {regimeClass(focusedEmployee.regime)}">{focusedEmployee.initials}</span>
              <div><span>{t('Employee evidence')}</span><h2>{focusedEmployee.name}</h2><p>{focusedEmployee.role || t('No primary position')} - {t(regimeLabel[focusedEmployee.regime])} - {tenureLabel(focusedEmployee.tenureMonths)}</p></div>
              <button type="button" aria-label={t('Close employee analysis')} onclick={() => (focusedEmployeeId = '')}>×</button>
            </header>
            <div class="employee-signals">
              <article><span>{t('Worked')}</span><strong>{formatHours(focusedEmployee.worked)}</strong><small>{formatHours(focusedEmployee.planned)} {t('planned')}</small></article>
              <article><span>{t('Adherence')}</span><strong>{pct(focusedEmployee.adherence)}</strong><small>{t(focusedEmployee.shifts === 1 ? '{count} worked shift' : '{count} worked shifts', { count: focusedEmployee.shifts })}</small></article>
              <article><span>{t('On time')}</span><strong>{focusedEmployee.evaluatedStarts ? `${Math.round((1 - (focusedEmployee.lateRate ?? 0)) * 100)}%` : t('No sample')}</strong><small>{focusedEmployee.lateCount} {t('late')} / {focusedEmployee.evaluatedStarts} {t('evaluated')}</small></article>
              <article><span>{t('Evidence')}</span><strong>{focusedEmployee.missingBadges + focusedEmployee.corrections}</strong><small>{focusedEmployee.missingBadges} {t('missing')} - {focusedEmployee.corrections} {t('corrected')}</small></article>
              <article><span>{t('Approved leave')}</span><strong>{focusedEmployee.approvedLeaveDays}</strong><small>{t('days, shown separately')}</small></article>
            </div>
            <div class="employee-lab__grid">
              <section class="employee-trace">
                <header class="panel-heading on-dark"><div><span>{t('Personal trace')}</span><h3>{t('Planned and worked')}</h3></div><small>{view.currentRange.label}</small></header>
                <div class="personal-bars" style={`--columns:${focusedEmployee.workedByBucket.length}`}>
                  {#each focusedEmployee.workedByBucket as worked, index}
                    <div title={`${view.buckets[index]?.label}: ${formatHours(worked)} worked / ${formatHours(focusedEmployee.plannedByBucket[index] ?? 0)} planned`}>
                      <i style={`--height:${((focusedEmployee.plannedByBucket[index] ?? 0) / employeeChartMax(focusedEmployee)) * 100}%`}></i>
                      <b style={`--height:${(worked / employeeChartMax(focusedEmployee)) * 100}%`}></b>
                    </div>
                  {/each}
                </div>
                <div class="personal-legend"><span><i></i>{t('Worked')}</span><span><i></i>{t('Planned')}</span></div>
              </section>
              <section class="employee-rhythm">
                <header class="panel-heading"><div><span>{t('Personal rhythm')}</span><h3>{t('Weekday and service evidence')}</h3></div></header>
                {@render pulseGrid(focusedPulse, `${focusedEmployee.name} service pulse`)}
              </section>
            </div>
            <section class="shift-evidence">
              <header class="panel-heading"><div><span>{t('Shift evidence')}</span><h3>{t('Schedule beside badge proof')}</h3></div><small>{t('Latest {count} records', { count: Math.min(20, focusedEmployee.shiftsEvidence.length) })}</small></header>
              <div class="shift-table">
                <div class="shift-table__head"><span>{t('Date')}</span><span>{t('Service')}</span><span>{t('Area')}</span><span>{t('Scheduled')}</span><span>{t('Actual')}</span><span>{t('Outcome')}</span></div>
                {#each focusedEmployee.shiftsEvidence as shift (shift.id)}
                  <div class="shift-table__row">
                    <strong>{displayDate(shift.date)}</strong><span class="shift-service">{t(shift.serviceLabel)}</span><span class="shift-area">{shift.areaName}</span><span class="shift-value"><small>{t('Scheduled')}</small>{shift.plannedLabel}</span><span class="shift-value"><small>{t('Actual')}</small>{t(shift.actualLabel)}</span><em class="is-{shift.status}">{shift.status === 'late' && shift.lateMinutes ? t('{count} min late', { count: shift.lateMinutes }) : t(shift.status)}</em>
                  </div>
                {/each}
              </div>
            </section>
          </section>
        {:else}
          <button type="button" class="employee-prompt" onclick={() => rankedPeople[0] && focusEmployee(rankedPeople[0].id)}>
            <span>{t('Open the evidence')}</span><strong>{t('Select an employee to inspect their shifts, rhythm and attendance context.')}</strong><i>›</i>
          </button>
        {/if}
      </div>
    {:else}
      <div class="view-stack operations-view">
        <div class="operations-grid">
          <section class="operations-pulse">
            <header class="panel-heading on-dark"><div><span>{t('Service matrix')}</span><h2>{t('The week beneath the period')}</h2><p>{t('Aggregated worked shifts against planned shifts. Warm cells contain evidence signals.')}</p></div></header>
            {@render pulseGrid(view.pulse, 'Operational service matrix')}
          </section>
          <section class="service-duel">
            <header class="panel-heading"><div><span>{t('Service comparison')}</span><h2>{t('Lunch and evening')}</h2></div></header>
            {#each view.services as service (service.key)}
              <article>
                <header><span>{t(service.label)}</span><strong>{pct(service.adherence)}</strong></header>
                <div class="duel-bars"><i style={`--width:${Math.min(100, (service.worked / Math.max(1, service.planned)) * 100)}%`}></i></div>
                <dl><div><dt>{t('Worked')}</dt><dd>{formatHours(service.worked)}</dd></div><div><dt>{t('Planned')}</dt><dd>{formatHours(service.planned)}</dd></div><div><dt>{t('Signals')}</dt><dd>{service.lateCount + service.missingCount}</dd></div></dl>
              </article>
            {/each}
          </section>
        </div>

        <div class="operations-grid is-lower">
          <section class="area-load">
            <header class="panel-heading"><div><span>{t('Area load')}</span><h2>{t('Where hours land')}</h2></div><small>{t('Worked over scheduled')}</small></header>
            <div class="area-list">
              {#each view.areas as area (area.id)}
                <button type="button" onclick={() => (areaId = area.id === 'unassigned' ? '' : area.id)}>
                  <span><strong>{area.name}</strong><small>{t(area.issues === 1 ? '{count} evidence signal' : '{count} evidence signals', { count: area.issues })}</small></span>
                  <div><i style={`--width:${Math.min(100, (area.worked / Math.max(1, area.planned)) * 100)}%`}></i><b style={`--width:${Math.min(100, (area.planned / Math.max(1, ...view.areas.map((row) => row.planned))) * 100)}%`}></b></div>
                  <strong>{formatHours(area.worked)} <small>/ {formatHours(area.planned)}</small></strong>
                </button>
              {/each}
            </div>
          </section>
          <section class="event-stream">
            <header class="panel-heading on-dark"><div><span>{t('Evidence stream')}</span><h2>{t('What changed on the floor')}</h2></div><small>{t(view.events.length === 1 ? '{count} recent signal' : '{count} recent signals', { count: view.events.length })}</small></header>
            {#if view.events.length}
              <div>
                {#each view.events.slice(0, 12) as event (event.id)}
                  <button type="button" onclick={() => focusEmployee(event.employeeId)}>
                    <i class="is-{event.tone}"></i><time>{displayDate(event.date)}</time><span><strong>{t(event.title)}</strong><small>{event.employeeName} - {t(event.detail)}</small></span><b>›</b>
                  </button>
                {/each}
              </div>
            {:else}
              <p>{t('No exceptions in this lens. The schedule and badge evidence are aligned.')}</p>
            {/if}
          </section>
        </div>
      </div>
    {/if}
  </div>
</div>

<style>
  .insights-page {
    --insight-ink: #0d1722;
    --insight-ink-2: #142332;
    --insight-paper: rgba(255, 252, 247, 0.94);
    --insight-blue: #6f9fff;
    --insight-green: #42d884;
    --insight-yellow: #f7b733;
  }

  .studio-shell {
    display: grid;
    gap: 16px;
    padding: 18px var(--rst-gutter) 42px;
  }

  .studio-tabs {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    border: 1px solid var(--rst-ui-line);
    border-radius: var(--rst-ui-radius-md);
    background: var(--rst-ui-bg-2);
    overflow: hidden;
  }

  .studio-tabs button {
    min-width: 0;
    display: grid;
    grid-template-columns: auto 1fr;
    gap: 1px 12px;
    padding: 14px 18px;
    border: 0;
    border-right: 1px solid var(--rst-ui-line);
    color: var(--rst-ui-muted);
    background: transparent;
    font: inherit;
    text-align: left;
    cursor: pointer;
  }

  .studio-tabs button:last-child { border-right: 0; }
  .studio-tabs button > span { grid-row: span 2; color: var(--rst-ui-action); font-size: 11px; font-weight: var(--rst-fw-display); }
  .studio-tabs strong { color: var(--rst-ui-text); font-size: 15px; }
  .studio-tabs small { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 11px; }
  .studio-tabs button.is-active { color: #fffaf2; background: var(--insight-ink); box-shadow: inset 0 -3px 0 var(--rst-ui-action); }
  .studio-tabs button.is-active strong { color: #fffaf2; }

  .hero-lens {
    min-width: 210px;
    display: grid;
    gap: 3px;
    padding: 14px 16px;
    border: 1px solid rgba(255,255,255,.16);
    border-radius: var(--rst-ui-radius-md);
    color: #fffaf2;
    background: rgba(8,14,21,.58);
  }
  .hero-lens span { color: var(--rst-ui-action); font-size: 10px; font-weight: var(--rst-fw-display); text-transform: uppercase; }
  .hero-lens strong { font-size: 19px; }
  .hero-lens small { color: rgba(255,250,242,.6); }

  .evidence-bar {
    display: flex;
    align-items: end;
    gap: 12px;
    padding: 13px 14px;
    border: 1px solid var(--rst-ui-line);
    border-radius: var(--rst-ui-radius-md);
    background: var(--rst-ui-bg-2);
    box-shadow: var(--rst-ui-shadow-card);
  }
  .control-block, .evidence-bar label { display: grid; gap: 6px; }
  .control-block > span, .evidence-bar label > span { color: var(--rst-ui-muted); font-size: 10px; font-weight: var(--rst-fw-bold); text-transform: uppercase; }
  .segmented, .workforce-filter, .metric-switch { display: inline-flex; gap: 2px; padding: 3px; border: 1px solid var(--rst-ui-line); border-radius: var(--rst-ui-radius-md); background: var(--rst-ui-bg); }
  .segmented button, .workforce-filter button, .metric-switch button {
    min-height: 31px;
    padding: 0 11px;
    border: 0;
    border-radius: calc(var(--rst-ui-radius-md) - 3px);
    color: var(--rst-ui-muted);
    background: transparent;
    font: inherit;
    font-size: 11px;
    font-weight: var(--rst-fw-bold);
    cursor: pointer;
  }
  .segmented button.is-active, .workforce-filter button.is-active, .metric-switch button.is-active { color: #fff; background: var(--rst-ui-action); }
  .workforce-filter { margin-left: auto; }
  .evidence-bar select {
    min-height: 38px;
    max-width: 150px;
    padding: 0 30px 0 10px;
    border: 1px solid var(--rst-ui-line);
    border-radius: var(--rst-ui-radius-md);
    color: var(--rst-ui-text);
    background: var(--rst-ui-surface-field-strong);
    font: inherit;
    font-size: 12px;
  }
  .period-stepper { min-width: 180px; display: grid; grid-template-columns: 34px 1fr 34px; align-items: center; gap: 6px; }
  .period-stepper button { width: 34px; height: 34px; border: 1px solid var(--rst-ui-line); border-radius: var(--rst-ui-radius-md); color: var(--rst-ui-text); background: var(--rst-ui-bg); font: inherit; font-size: 18px; cursor: pointer; }
  .period-stepper button:disabled { opacity: .35; cursor: default; }
  .period-stepper strong { text-align: center; font-size: 12px; }
  .clear-filters { min-height: 38px; padding: 0 12px; border: 1px solid var(--rst-ui-action); border-radius: var(--rst-ui-radius-md); color: var(--rst-ui-action); background: transparent; font: inherit; font-size: 11px; font-weight: var(--rst-fw-bold); cursor: pointer; }

  .state { min-height: 300px; display: grid; place-content: center; justify-items: center; gap: 8px; border: 1px solid var(--rst-ui-line); border-radius: var(--rst-ui-radius-md); background: var(--rst-ui-bg-2); text-align: center; }
  .state > span { width: 32px; height: 32px; border: 3px solid var(--rst-ui-line); border-top-color: var(--rst-ui-action); border-radius: 50%; animation: spin .8s linear infinite; }
  .state small { color: var(--rst-ui-muted); }
  .state.is-error strong { color: var(--rst-state-danger-text); }
  @keyframes spin { to { transform: rotate(360deg); } }

  .view-stack { display: grid; gap: 16px; animation: view-in .32s var(--rst-ease-out) backwards; }
  @keyframes view-in { from { opacity: 0; transform: translateY(7px); } }

  .signal-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; }
  .signal-card { min-width: 0; display: grid; gap: 5px; padding: 17px 18px 14px; border: 1px solid var(--rst-ui-line); border-radius: var(--rst-ui-radius-md); background: var(--insight-paper); overflow: hidden; }
  .signal-card > span { color: var(--rst-ui-muted); font-size: 10px; font-weight: var(--rst-fw-display); text-transform: uppercase; }
  .signal-card strong { font-size: 30px; line-height: 1; }
  .signal-card p { margin: 0; overflow: hidden; color: var(--rst-ui-muted); font-size: 11px; text-overflow: ellipsis; white-space: nowrap; }
  .signal-card > i { position: relative; height: 3px; margin: 7px -18px -14px; background: var(--rst-ui-line); }
  .signal-card > i::after { content: ''; position: absolute; inset: 0 auto 0 0; width: var(--progress); background: var(--insight-blue); }
  .signal-card.is-good > i::after { background: var(--insight-green); }
  .signal-card.is-warning > i::after, .signal-card.is-neutral > i::after { background: var(--insight-yellow); }
  .signal-card.is-bad > i::after { background: var(--rst-ui-action); }

  .overview-grid { display: grid; grid-template-columns: minmax(0, 1.8fr) minmax(300px, .75fr); gap: 16px; }
  .chart-panel, .mix-panel, .briefing-panel, .people-map-panel, .employee-trace, .operations-pulse, .event-stream {
    min-width: 0;
    border: 1px solid rgba(255,255,255,.09);
    border-radius: var(--rst-ui-radius-md);
    color: #fffaf2;
    background: var(--insight-ink);
    box-shadow: 0 20px 44px rgba(9,16,24,.18);
  }
  .chart-panel { padding: 20px 22px 16px; overflow: hidden; }
  .panel-heading { display: flex; align-items: flex-start; justify-content: space-between; gap: 14px; margin-bottom: 14px; }
  .panel-heading > div { min-width: 0; }
  .panel-heading span { color: var(--rst-ui-action); font-size: 10px; font-weight: var(--rst-fw-display); letter-spacing: .07em; text-transform: uppercase; }
  .panel-heading h2, .panel-heading h3 { margin: 3px 0 0; font-size: 20px; line-height: 1.05; }
  .panel-heading p { max-width: 560px; margin: 6px 0 0; color: var(--rst-ui-muted); font-size: 12px; }
  .panel-heading > small { color: var(--rst-ui-muted); font-size: 11px; text-align: right; }
  .panel-heading.on-dark h2, .panel-heading.on-dark h3 { color: #fffaf2; }
  .panel-heading.on-dark p, .panel-heading.on-dark > small { color: rgba(255,250,242,.55); }

  .chart-legend { display: flex; align-items: center; flex-wrap: wrap; gap: 6px 12px; color: rgba(255,250,242,.58); font-size: 10px; }
  .chart-legend i, .chart-tooltip i { width: 8px; height: 8px; display: inline-block; border-radius: 2px; }
  i.is-worked { background: var(--rst-ui-action); }
  i.is-plan { background: var(--insight-blue); }
  i.is-compare { background: var(--insight-green); }
  .trend-stage { position: relative; min-height: 250px; }
  .trend-stage svg { width: 100%; height: 250px; display: block; overflow: visible; }
  .chart-area { fill: rgba(var(--rst-ui-action-rgb), .14); }
  .chart-line { fill: none; vector-effect: non-scaling-stroke; stroke-width: 2.4; stroke-linecap: round; stroke-linejoin: round; }
  .chart-line.is-worked { stroke: var(--rst-ui-action); stroke-width: 3; }
  .chart-line.is-plan { stroke: var(--insight-blue); stroke-dasharray: 5 6; }
  .chart-line.is-compare { stroke: var(--insight-green); stroke-dasharray: 2 7; opacity: .75; }
  .chart-hits { position: absolute; inset: 0; display: grid; grid-template-columns: repeat(var(--columns), 1fr); }
  .chart-hits button { border: 0; border-left: 1px solid transparent; background: transparent; cursor: crosshair; }
  .chart-hits button:hover, .chart-hits button:focus-visible { border-left-color: rgba(255,255,255,.18); outline: 0; background: rgba(255,255,255,.025); }
  .chart-tooltip { position: absolute; z-index: 3; top: 12px; left: clamp(100px, var(--left), calc(100% - 100px)); width: 190px; display: grid; gap: 5px; padding: 11px 12px; border: 1px solid rgba(255,255,255,.16); border-radius: var(--rst-ui-radius-md); color: #fffaf2; background: rgba(5,10,16,.94); box-shadow: 0 12px 32px rgba(0,0,0,.32); transform: translateX(-50%); pointer-events: none; }
  .chart-tooltip span { display: flex; align-items: center; gap: 7px; font-size: 11px; }
  .chart-tooltip small { color: var(--rst-ui-action); }
  .chart-axis { display: flex; justify-content: space-between; color: rgba(255,250,242,.42); font-size: 10px; }

  .mix-panel { display: grid; align-content: start; padding: 20px; background: #182333; }
  .mix-panel .panel-heading > strong { color: #fffaf2; font-size: 18px; }
  .mix-orbit { position: relative; width: 154px; height: 154px; display: grid; place-content: center; justify-self: center; margin: 8px 0 18px; text-align: center; }
  .mix-orbit > div { position: absolute; inset: 0; border-radius: 50%; background: conic-gradient(var(--insight-blue) 0 var(--fixed), var(--rst-ui-action) var(--fixed) var(--flexi), var(--insight-green) var(--flexi) 360deg); mask: radial-gradient(circle, transparent 52%, #000 53%); }
  .mix-orbit strong { font-size: 31px; line-height: 1; }
  .mix-orbit span { color: rgba(255,250,242,.56); font-size: 11px; }
  .mix-rows { display: grid; gap: 10px; }
  .mix-rows > div { display: grid; grid-template-columns: 8px 1fr auto; gap: 4px 8px; align-items: center; }
  .mix-rows > div > i, .map-legend i { width: 8px; height: 8px; border-radius: 2px; }
  .is-fixed { --regime-color: var(--insight-blue); }
  .is-flexi { --regime-color: var(--rst-ui-action); }
  .is-manager { --regime-color: var(--insight-green); }
  .mix-rows i.is-fixed, .map-legend i.is-fixed { background: var(--insight-blue); }
  .mix-rows i.is-flexi, .map-legend i.is-flexi { background: var(--rst-ui-action); }
  .mix-rows i.is-manager { background: var(--insight-green); }
  .mix-rows span { color: rgba(255,250,242,.62); font-size: 11px; }
  .mix-rows strong { font-size: 12px; }
  .mix-rows b { grid-column: 2 / -1; height: 4px; overflow: hidden; border-radius: 2px; background: rgba(255,255,255,.09); }
  .mix-rows em { width: var(--width); height: 100%; display: block; background: var(--regime-color); }

  .story-grid { display: grid; grid-template-columns: minmax(0, 1.4fr) minmax(310px, .8fr); gap: 16px; }
  .pulse-panel, .people-roster, .employee-rhythm, .shift-evidence, .service-duel, .area-load { min-width: 0; padding: 20px 22px; border: 1px solid var(--rst-ui-line); border-radius: var(--rst-ui-radius-md); background: var(--insight-paper); }
  .briefing-panel { padding: 20px; background: #261811; }
  .briefing-list { display: grid; }
  .briefing-list article { display: grid; grid-template-columns: 30px 1fr; gap: 10px; padding: 13px 0; border-top: 1px solid rgba(255,255,255,.1); }
  .briefing-list article > span { color: var(--rst-ui-action); font-size: 10px; font-weight: var(--rst-fw-display); }
  .briefing-list article div { display: grid; gap: 3px; }
  .briefing-list strong { font-size: 12px; }
  .briefing-list small { color: rgba(255,250,242,.52); font-size: 10px; }

  .pulse-grid { display: grid; grid-template-columns: 76px repeat(7, minmax(52px, 1fr)); gap: 6px; align-items: stretch; }
  .pulse-grid > strong, .pulse-grid > b, .pulse-grid__corner { display: grid; place-items: center; min-height: 24px; color: var(--rst-ui-muted); font-size: 10px; }
  .pulse-grid > b { justify-items: start; font-weight: var(--rst-fw-bold); }
  .pulse-grid button { position: relative; min-height: 58px; display: grid; place-items: center; border: 1px solid rgba(66,216,132, calc(.16 + var(--intensity) * .4)); border-radius: var(--rst-ui-radius-md); color: var(--rst-ui-text); background: rgba(66,216,132, calc(.04 + var(--intensity) * .18)); font: inherit; cursor: pointer; }
  .pulse-grid button.has-issues { border-color: rgba(var(--rst-ui-action-rgb), .5); background: rgba(var(--rst-ui-action-rgb), .12); }
  .pulse-grid button.is-empty { border-color: var(--rst-ui-line); background: transparent; opacity: .5; }
  .pulse-grid button.is-selected { outline: 2px solid var(--rst-ui-action); outline-offset: 1px; }
  .pulse-grid button span { font-size: 12px; font-weight: var(--rst-fw-display); }
  .pulse-grid button i { position: absolute; top: 4px; right: 4px; min-width: 17px; height: 17px; display: grid; place-items: center; border-radius: 50%; color: #fff; background: var(--rst-ui-action); font-size: 9px; font-style: normal; }
  .pulse-readout { display: grid; grid-template-columns: auto 1fr auto; gap: 10px; align-items: center; margin-top: 12px; padding: 10px 12px; border-left: 3px solid var(--rst-ui-action); background: var(--rst-ui-bg); }
  .pulse-readout span { color: var(--rst-ui-action); font-size: 9px; font-weight: var(--rst-fw-display); text-transform: uppercase; }.pulse-readout strong { font-size: 11px; }.pulse-readout small { color: var(--rst-ui-muted); font-size: 10px; }
  .operations-pulse .pulse-grid, .event-stream .pulse-grid, .people-map-panel .pulse-grid { color: #fffaf2; }
  .operations-pulse .pulse-grid > strong, .operations-pulse .pulse-grid > b, .operations-pulse .pulse-grid__corner { color: rgba(255,250,242,.52); }
  .operations-pulse .pulse-grid button { color: #fffaf2; }

  .people-map-panel { padding: 20px 22px; background: #0e1824; }
  .people-map { position: relative; height: 330px; margin: 22px 34px 30px 46px; border-left: 1px solid rgba(255,255,255,.16); border-bottom: 1px solid rgba(255,255,255,.16); background-image: linear-gradient(rgba(255,255,255,.035) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.035) 1px, transparent 1px); background-size: 25% 25%; }
  .map-line { position: absolute; background: rgba(255,255,255,.12); pointer-events: none; }
  .map-line.is-horizontal { left: 0; right: 0; top: 50%; height: 1px; }
  .map-line.is-vertical { top: 0; bottom: 0; left: 83.33%; width: 1px; }
  .axis-y, .axis-x { position: absolute; color: rgba(255,250,242,.45); font-size: 9px; text-transform: uppercase; }
  .axis-y { left: -44px; }
  .axis-y.is-top { top: 0; }.axis-y.is-bottom { bottom: 0; }
  .axis-x { bottom: -22px; }.axis-x.is-left { left: 0; }.axis-x.is-right { right: 0; }
  .person-bubble { position: absolute; left: var(--x); bottom: var(--y); width: var(--size); height: var(--size); display: grid; place-items: center; border: 2px solid rgba(255,255,255,.74); border-radius: 50%; color: #fff; background: var(--regime-color); box-shadow: 0 7px 20px rgba(0,0,0,.32); font: inherit; font-size: 10px; font-weight: var(--rst-fw-display); transform: translate(-50%, 50%); cursor: pointer; transition: transform .18s var(--rst-ease-out), box-shadow .18s ease; }
  .person-bubble:hover, .person-bubble.is-selected { z-index: 2; transform: translate(-50%, 50%) scale(1.15); box-shadow: 0 0 0 5px rgba(255,255,255,.1), 0 10px 24px rgba(0,0,0,.4); }
  .map-legend { display: flex; align-items: center; gap: 14px; color: rgba(255,250,242,.62); font-size: 10px; }
  .map-legend span { display: flex; align-items: center; gap: 5px; }
  .map-legend small { margin-left: auto; color: rgba(255,250,242,.42); }

  .people-list { display: grid; border-top: 1px solid var(--rst-ui-line); }
  .people-list > button { min-width: 0; display: grid; grid-template-columns: 34px 38px minmax(160px, 1.1fr) minmax(120px, .7fr) minmax(120px, 1fr) 112px 18px; gap: 10px; align-items: center; padding: 11px 6px; border: 0; border-bottom: 1px solid var(--rst-ui-line); color: var(--rst-ui-text); background: transparent; font: inherit; text-align: left; cursor: pointer; transition: background-color .15s ease, transform .15s ease; }
  .people-list > button:hover, .people-list > button.is-selected { background: var(--rst-ui-section-row-hover); transform: translateX(3px); }
  .rank { color: var(--rst-ui-muted); font-size: 10px; }
  .avatar, .employee-lab__avatar { display: grid; place-items: center; border-radius: 50%; color: #fff; background: var(--regime-color); font-size: 10px; font-weight: var(--rst-fw-display); }
  .avatar { width: 34px; height: 34px; }
  .identity, .sample { min-width: 0; display: grid; gap: 2px; }
  .identity strong, .identity small, .sample { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .identity strong { font-size: 12px; }.identity small, .sample, .sample small { color: var(--rst-ui-muted); font-size: 10px; }
  .metric-bar { height: 7px; overflow: hidden; border-radius: 4px; background: var(--rst-ui-line); }
  .metric-bar i { width: var(--width); height: 100%; display: block; background: var(--rst-ui-action); }
  .metric-value { font-size: 11px; text-align: right; }.open-person { color: var(--rst-ui-action); font-size: 18px; }

  .employee-lab { overflow: hidden; border: 1px solid var(--rst-ui-line); border-radius: var(--rst-ui-radius-md); background: var(--rst-ui-bg-2); }
  .employee-lab__hero { display: grid; grid-template-columns: 58px 1fr auto; gap: 14px; align-items: center; padding: 20px 22px; color: #fffaf2; background: #182333; }
  .employee-lab__avatar { width: 56px; height: 56px; font-size: 15px; }
  .employee-lab__hero > div > span { color: var(--rst-ui-action); font-size: 10px; font-weight: var(--rst-fw-display); text-transform: uppercase; }
  .employee-lab__hero h2 { margin: 2px 0; font-size: 24px; }.employee-lab__hero p { margin: 0; color: rgba(255,250,242,.55); font-size: 11px; }
  .employee-lab__hero > button { width: 34px; height: 34px; border: 1px solid rgba(255,255,255,.18); border-radius: var(--rst-ui-radius-md); color: #fff; background: transparent; font-size: 20px; cursor: pointer; }
  .employee-signals { display: grid; grid-template-columns: repeat(5, 1fr); border-bottom: 1px solid var(--rst-ui-line); }
  .employee-signals article { display: grid; gap: 4px; padding: 15px 18px; border-right: 1px solid var(--rst-ui-line); }
  .employee-signals article:last-child { border-right: 0; }
  .employee-signals span, .employee-signals small { color: var(--rst-ui-muted); font-size: 10px; }.employee-signals strong { font-size: 21px; }
  .employee-lab__grid { display: grid; grid-template-columns: minmax(0, 1.2fr) minmax(420px, 1fr); gap: 16px; padding: 16px; }
  .employee-trace { padding: 18px 20px; }
  .personal-bars { height: 170px; display: grid; grid-template-columns: repeat(var(--columns), minmax(3px, 1fr)); gap: 3px; align-items: end; padding-top: 10px; border-bottom: 1px solid rgba(255,255,255,.15); }
  .personal-bars > div { position: relative; height: 100%; }
  .personal-bars i, .personal-bars b { position: absolute; bottom: 0; width: 45%; height: var(--height); min-height: 1px; }
  .personal-bars i { left: 4%; background: var(--insight-blue); opacity: .68; }.personal-bars b { right: 4%; background: var(--rst-ui-action); }
  .personal-legend { display: flex; gap: 14px; margin-top: 10px; color: rgba(255,250,242,.55); font-size: 10px; }
  .personal-legend span { display: flex; align-items: center; gap: 5px; }.personal-legend i { width: 8px; height: 8px; background: var(--rst-ui-action); }.personal-legend span:last-child i { background: var(--insight-blue); }
  .employee-rhythm { padding: 18px 20px; }
  .shift-evidence { margin: 0 16px 16px; padding: 18px 20px; }
  .shift-table { min-width: 760px; }
  .shift-evidence { overflow-x: auto; }
  .shift-table__head, .shift-table > div { display: grid; grid-template-columns: 90px 90px 1fr 110px 110px 110px; gap: 10px; align-items: center; min-height: 40px; padding: 0 8px; border-bottom: 1px solid var(--rst-ui-line); font-size: 11px; }
  .shift-table__head { min-height: 30px !important; color: var(--rst-ui-muted); font-size: 9px !important; font-weight: var(--rst-fw-bold); text-transform: uppercase; }
  .shift-table > div span { color: var(--rst-ui-muted); }.shift-value small { display: none; }.shift-table em { width: max-content; padding: 4px 7px; border-radius: var(--rst-ui-radius-md); color: var(--rst-ui-muted); background: var(--rst-ui-bg); font-size: 9px; font-style: normal; text-transform: capitalize; }
  .shift-table em.is-worked { color: var(--rst-state-success-text); background: var(--rst-state-success-bg); }.shift-table em.is-late, .shift-table em.is-corrected { color: var(--rst-state-warning-text); background: var(--rst-state-warning-bg); }.shift-table em.is-missing, .shift-table em.is-open { color: var(--rst-state-danger-text); background: var(--rst-state-danger-bg); }
  .shift-table em.is-excused { color: var(--rst-state-success-text); background: var(--rst-state-success-bg); }
  .employee-prompt { min-height: 92px; display: grid; grid-template-columns: auto 1fr auto; gap: 16px; align-items: center; padding: 18px 22px; border: 1px dashed var(--rst-ui-line-strong); border-radius: var(--rst-ui-radius-md); color: var(--rst-ui-text); background: transparent; font: inherit; text-align: left; cursor: pointer; }
  .employee-prompt span { color: var(--rst-ui-action); font-size: 10px; font-weight: var(--rst-fw-display); text-transform: uppercase; }.employee-prompt strong { font-size: 15px; }.employee-prompt i { color: var(--rst-ui-action); font-size: 25px; }

  .operations-grid { display: grid; grid-template-columns: minmax(0, 1.4fr) minmax(320px, .75fr); gap: 16px; }
  .operations-grid.is-lower { grid-template-columns: minmax(0, 1fr) minmax(360px, .9fr); }
  .operations-pulse { padding: 20px 22px; }
  .service-duel article { padding: 14px 0; border-top: 1px solid var(--rst-ui-line); }
  .service-duel article header { display: flex; justify-content: space-between; align-items: center; }.service-duel article header span { font-weight: var(--rst-fw-bold); }.service-duel article header strong { font-size: 20px; }
  .duel-bars { height: 8px; margin: 10px 0; overflow: hidden; border-radius: 4px; background: var(--rst-ui-line); }.duel-bars i { width: var(--width); height: 100%; display: block; background: var(--rst-ui-action); }
  .service-duel dl { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; margin: 0; }.service-duel dl div { display: grid; gap: 2px; }.service-duel dt { color: var(--rst-ui-muted); font-size: 9px; }.service-duel dd { margin: 0; font-size: 11px; font-weight: var(--rst-fw-bold); }
  .area-list { display: grid; border-top: 1px solid var(--rst-ui-line); }
  .area-list button { display: grid; grid-template-columns: minmax(130px, .7fr) minmax(160px, 1fr) 110px; gap: 14px; align-items: center; padding: 13px 5px; border: 0; border-bottom: 1px solid var(--rst-ui-line); color: var(--rst-ui-text); background: transparent; font: inherit; text-align: left; cursor: pointer; }
  .area-list button > span { display: grid; gap: 2px; }.area-list small { color: var(--rst-ui-muted); font-size: 9px; }.area-list button > div { position: relative; height: 12px; overflow: hidden; border-radius: 3px; background: var(--rst-ui-line); }.area-list button > div b, .area-list button > div i { position: absolute; inset: 0 auto 0 0; width: var(--width); }.area-list button > div b { background: rgba(111,159,255,.5); }.area-list button > div i { z-index: 1; height: 6px; top: 3px; background: var(--rst-ui-action); }.area-list button > strong { text-align: right; font-size: 11px; }
  .event-stream { padding: 20px; background: #201b20; }
  .event-stream > div { display: grid; }
  .event-stream > div > button { display: grid; grid-template-columns: 7px 52px 1fr auto; gap: 9px; align-items: center; padding: 10px 0; border: 0; border-top: 1px solid rgba(255,255,255,.09); color: #fffaf2; background: transparent; font: inherit; text-align: left; cursor: pointer; }
  .event-stream button > i { width: 7px; height: 7px; border-radius: 50%; background: var(--insight-green); }.event-stream button > i.is-danger { background: #e2564a; }.event-stream button > i.is-warning { background: var(--insight-yellow); }
  .event-stream time { color: rgba(255,250,242,.42); font-size: 9px; }.event-stream button > span { min-width: 0; display: grid; gap: 2px; }.event-stream button strong, .event-stream button small { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }.event-stream button strong { font-size: 11px; }.event-stream button small { color: rgba(255,250,242,.5); font-size: 9px; }.event-stream button b { color: var(--rst-ui-action); }.event-stream > p { color: rgba(255,250,242,.55); font-size: 12px; }

  @media (max-width: 1180px) {
    .evidence-bar { flex-wrap: wrap; }
    .workforce-filter { margin-left: 0; }
    .evidence-bar label { flex: 1 1 130px; }
    .evidence-bar select { width: 100%; max-width: none; }
    .people-list > button { grid-template-columns: 30px 36px 1fr 100px 100px 18px; }
    .people-list .sample { display: none; }
    .employee-lab__grid { grid-template-columns: 1fr; }
  }

  @media (max-width: 980px) {
    .signal-grid { grid-template-columns: repeat(2, 1fr); }
    .overview-grid, .story-grid, .operations-grid, .operations-grid.is-lower { grid-template-columns: 1fr; }
    .mix-panel { grid-template-columns: auto 1fr; column-gap: 20px; }
    .mix-panel .panel-heading { grid-column: 1 / -1; }.mix-orbit { margin: 0; }.mix-rows { align-self: center; }
    .employee-signals { grid-template-columns: repeat(3, 1fr); }.employee-signals article { border-bottom: 1px solid var(--rst-ui-line); }
  }

  @media (max-width: 760px) {
    .studio-shell { padding: 12px 12px 92px; }
    .studio-tabs button { grid-template-columns: 1fr; justify-items: center; gap: 2px; padding: 11px 5px; text-align: center; }
    .studio-tabs button > span { grid-row: auto; }.studio-tabs small { display: none; }
    .evidence-bar { align-items: stretch; padding: 10px; }
    .control-block { flex: 1 1 150px; }.period-stepper { order: -1; flex: 1 1 100%; }
    .workforce-filter { width: 100%; overflow-x: auto; }.workforce-filter button { flex: 1 0 auto; }
    .signal-grid { grid-template-columns: 1fr 1fr; gap: 8px; }.signal-card { padding: 14px 13px 12px; }.signal-card strong { font-size: 24px; }.signal-card > i { margin: 6px -13px -12px; }
    .chart-panel { padding: 17px 14px 14px; }.panel-heading { flex-wrap: wrap; }.trend-stage, .trend-stage svg { min-height: 210px; height: 210px; }.chart-axis { display: none; }
    .mix-panel { grid-template-columns: 1fr; }.mix-orbit { justify-self: center; }.mix-rows { width: 100%; }
    .pulse-panel, .people-roster, .employee-rhythm, .shift-evidence, .service-duel, .area-load, .operations-pulse { padding: 16px 14px; }
    .pulse-grid { grid-template-columns: 58px repeat(7, minmax(37px, 1fr)); gap: 3px; overflow-x: auto; }.pulse-grid button { min-height: 48px; }.pulse-grid button span { font-size: 10px; }
    .pulse-readout { grid-template-columns: 1fr; gap: 3px; }
    .people-map-panel { padding: 17px 14px; }.people-map { height: 280px; margin-right: 15px; }
    .map-legend small { display: none; }
    .metric-switch { width: 100%; overflow-x: auto; }.metric-switch button { flex: 1 0 auto; }
    .people-list > button { grid-template-columns: 36px minmax(0, 1fr) 78px 16px; gap: 7px; }.people-list .rank, .people-list .metric-bar { display: none; }.metric-value { white-space: normal; }
    .employee-lab__hero { grid-template-columns: 48px 1fr auto; padding: 16px 14px; }.employee-lab__avatar { width: 46px; height: 46px; }
    .employee-signals { grid-template-columns: 1fr 1fr; }.employee-signals article { padding: 12px 14px; }
    .employee-lab__grid { padding: 10px; gap: 10px; }.employee-trace { padding: 15px 14px; }.personal-bars { height: 140px; }
    .shift-evidence { margin: 0 10px 10px; overflow-x: visible; }
    .shift-table { min-width: 0; display: grid; gap: 8px; }
    .shift-table__head { display: none !important; }
    .shift-table > .shift-table__row { grid-template-columns: minmax(0, 1fr) auto; gap: 5px 12px; min-height: 0; padding: 12px; border: 1px solid var(--rst-ui-line); border-radius: var(--rst-ui-radius-md); background: var(--rst-ui-bg); }
    .shift-table__row > strong { grid-column: 1; grid-row: 1; }.shift-table__row > em { grid-column: 2; grid-row: 1; justify-self: end; }
    .shift-service { grid-column: 1; grid-row: 2; }.shift-area { grid-column: 2; grid-row: 2; text-align: right; }
    .shift-table__row > .shift-value { display: grid; grid-row: 3; gap: 2px; margin-top: 5px; color: var(--rst-ui-text); }
    .shift-table__row > .shift-value:nth-of-type(3) { grid-column: 1; }.shift-table__row > .shift-value:nth-of-type(4) { grid-column: 2; text-align: right; }
    .shift-value small { display: block; color: var(--rst-ui-muted); font-size: 8px; font-weight: var(--rst-fw-bold); text-transform: uppercase; }
    .area-list button { grid-template-columns: 1fr 90px; }.area-list button > div { grid-column: 1 / -1; grid-row: 2; }.area-list button > strong { grid-column: 2; grid-row: 1; }
    .event-stream { padding: 17px 14px; }
  }
</style>
