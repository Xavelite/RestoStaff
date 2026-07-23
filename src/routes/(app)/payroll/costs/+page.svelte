<script lang="ts">
  import { formatHours } from '$lib/calendar/date';
  import { i18n, t } from '$lib/i18n/i18n.svelte';
  import { workspace } from '$lib/workspace/workspace.svelte';
  import { getInsightsCostRates, type InsightsCostRates } from '$lib/payroll/payroll-api';
  import ClassicPage from '$lib/classic/ClassicPage.svelte';
  import ClassicReportsPage from '$lib/classic/ClassicReportsPage.svelte';

  // Labour cost is worked hours priced with each person's estimated rate. It is
  // an estimate by construction, and the page says so rather than implying a
  // payroll figure.
  let rates = $state<InsightsCostRates | null>(null);

  $effect(() => {
    const restaurantId = workspace.activeId;
    if (!restaurantId || workspace.effectiveRole !== 'owner') return;
    let cancelled = false;
    void getInsightsCostRates(restaurantId)
      .then((result) => {
        if (!cancelled) rates = result;
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  });

  const rateByEmployee = $derived(
    new Map((rates?.rates ?? []).map((rate) => [rate.employee_id, rate]))
  );

  function money(cents: number): string {
    return new Intl.NumberFormat(i18n.intlLocale, {
      style: 'currency',
      currency: 'EUR',
      maximumFractionDigits: 0
    }).format(cents / 100);
  }
</script>

<svelte:head><title>{t('Costs')} &middot; restogogo</title></svelte:head>

{#if workspace.effectiveRole !== 'owner'}
  <ClassicPage title="Payroll" subtitle="Costs">
    <div class="cl-card">
      <div class="cl-empty">
        <strong>{t('Owner access required')}</strong>
        <span>{t('Labour cost is visible to the restaurant owner only.')}</span>
      </div>
    </div>
  </ClassicPage>
{:else}
  <ClassicReportsPage subtitle="Costs">
    {#snippet children(view)}
      {@const rows = view.employees
        .map((employee) => {
          const rate = rateByEmployee.get(employee.id);
          const hourly = rate?.estimated_hourly_cost_cents ?? null;
          return {
            ...employee,
            hourly,
            cost: hourly === null ? null : Math.round(employee.worked * hourly)
          };
        })
        .sort((left, right) => (right.cost ?? -1) - (left.cost ?? -1))}
      {@const total = rows.reduce((sum, row) => sum + (row.cost ?? 0), 0)}
      {@const priced = rows.filter((row) => row.cost !== null).length}

      <div class="cl-stats">
        <div class="cl-stat">
          <span class="cl-stat__label">{t('Estimated labour cost')}</span>
          <span class="cl-stat__value">{money(total)}</span>
        </div>
        <div class="cl-stat">
          <span class="cl-stat__label">{t('Worked hours')}</span>
          <span class="cl-stat__value">{formatHours(view.current.worked)}</span>
        </div>
        <div class="cl-stat">
          <span class="cl-stat__label">{t('People with a rate')}</span>
          <span class="cl-stat__value">{priced} / {rows.length}</span>
        </div>
      </div>

      {#if rates?.missing_active_employee_count}
        <p class="cl-section__note">
          {t('{count} active employees have no estimated hourly cost, so they are not in this total.', {
            count: rates.missing_active_employee_count
          })}
        </p>
      {/if}

      <div class="cl-tablewrap">
        <table class="cl-table">
          <thead>
            <tr>
              <th>{t('Name')}</th>
              <th>{t('Position')}</th>
              <th class="is-num">{t('Worked')}</th>
              <th class="is-num">{t('Hourly cost')}</th>
              <th class="is-num">{t('Estimated cost')}</th>
            </tr>
          </thead>
          <tbody>
            {#each rows as row (row.id)}
              <tr>
                <td>{row.name}</td>
                <td class="is-quiet">{row.role}</td>
                <td class="is-num">{formatHours(row.worked)}</td>
                <td class="is-num is-quiet">{row.hourly === null ? '—' : money(row.hourly)}</td>
                <td class="is-num">{row.cost === null ? '—' : money(row.cost)}</td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>

      <p class="cl-section__note">
        {t('Estimates use the hourly cost recorded per employee. They are not a payroll calculation.')}
      </p>
    {/snippet}
  </ClassicReportsPage>
{/if}

