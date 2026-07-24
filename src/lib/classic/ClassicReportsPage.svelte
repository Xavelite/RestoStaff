<script lang="ts">
  import type { Snippet } from 'svelte';
  import { getManagerOperationsReadModel } from '$lib/api/workspace';
  import type { ManagerOperationsReadModel } from '$lib/api/workspace-snapshot';
  import { todayInTimezone } from '$lib/calendar/date';
  import { i18n, t } from '$lib/i18n/i18n.svelte';
  import { workspace } from '$lib/workspace/workspace.svelte';
  import {
    buildInsights,
    insightReadRanges,
    mergeDashboardReadModels,
    type InsightPeriod,
    type InsightView
  } from '$lib/dashboard/dashboard-model';
  import ClassicPage from './ClassicPage.svelte';

  /**
   * The shell every Reports sub-page shares: it owns the period selector and
   * loads exactly the ranges the insight model needs, so each page only has to
   * render its own table of the resulting view.
   */
  let {
    children
  }: {
    children: Snippet<[InsightView]>;
  } = $props();

  let period = $state<InsightPeriod>('month');
  let model = $state<ManagerOperationsReadModel | null>(null);
  let loading = $state(false);
  let errorMessage = $state('');

  const timezone = $derived(workspace.bootstrap?.restaurant_settings.timezone || 'Europe/Brussels');
  const today = $derived(todayInTimezone(timezone, new Date()));

  $effect(() => {
    const restaurantId = workspace.activeId;
    const selectedPeriod = period;
    const anchor = today;
    if (!restaurantId) return;
    let cancelled = false;
    loading = true;
    errorMessage = '';
    Promise.all(
      insightReadRanges(anchor, selectedPeriod, 'previous').map((range) =>
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

  const view = $derived(
    model
      ? buildInsights(
          model,
          today,
          period,
          'previous',
          { workforce: 'all', employeeId: '', areaId: '', serviceKey: '' },
          today,
          i18n.intlLocale
        )
      : null
  );

  const PERIODS: Array<{ value: InsightPeriod; label: string }> = [
    { value: 'week', label: 'This week' },
    { value: 'month', label: 'This month' },
    { value: 'year', label: 'This year' }
  ];
</script>

{#snippet pageActions()}
  <select class="cl-field" aria-label={t('Period')} bind:value={period}>
    {#each PERIODS as option (option.value)}
      <option value={option.value}>{t(option.label)}</option>
    {/each}
  </select>
{/snippet}

<ClassicPage actions={pageActions}>

  {#if errorMessage}
    <div class="cl-card"><div class="cl-empty"><strong>{errorMessage}</strong></div></div>
  {:else if !view}
    <div class="cl-card"><div class="cl-empty"><strong>{t('Loading your workspace')}</strong></div></div>
  {:else if !view.hasData}
    <div class="cl-card">
      <div class="cl-empty">
        <strong>{t('Nothing recorded in this period')}</strong>
        <span>{t('Reports fill in from planned shifts and badge entries.')}</span>
      </div>
    </div>
  {:else}
    {@render children(view)}
  {/if}

  {#if loading && view}
    <p class="cl-section__note">{t('Refreshing…')}</p>
  {/if}
</ClassicPage>
