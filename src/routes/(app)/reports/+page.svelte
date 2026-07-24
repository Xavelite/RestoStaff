<script lang="ts">
  import { formatHours } from '$lib/calendar/date';
  import { t } from '$lib/i18n/i18n.svelte';
  import ClassicMeter from '$lib/classic/ClassicMeter.svelte';
  import ClassicReportsPage from '$lib/classic/ClassicReportsPage.svelte';
  import ClassicStat from '$lib/classic/ClassicStat.svelte';

  function percent(value: number | null): string {
    return value === null ? '—' : `${Math.round(value * 100)}%`;
  }

  function delta(current: number, previous: number, unit: 'hours' | 'count'): string {
    const difference = current - previous;
    if (unit === 'hours' && Math.abs(difference) < 0.05) return '—';
    if (unit === 'count' && difference === 0) return '—';
    const magnitude = unit === 'hours' ? formatHours(Math.abs(difference)) : Math.abs(difference);
    return `${difference > 0 ? '+' : '−'}${magnitude}`;
  }

  // A worked-hours rise is good, but a rise in late starts or missing badges is
  // not — so the caller says which direction is the healthy one.
  function deltaTone(current: number, previous: number, goodWhen: 'up' | 'down'): 'ok' | 'problem' | '' {
    const difference = current - previous;
    if (difference === 0) return '';
    const up = difference > 0;
    return (goodWhen === 'up') === up ? 'ok' : 'problem';
  }
</script>

<svelte:head><title>{t('Reports')} &middot; restogogo</title></svelte:head>

<ClassicReportsPage>
  {#snippet children(view)}
    <div class="cl-stats">
      <ClassicStat label="Planned hours" value={view.current.planned} format={formatHours} accent="var(--cl-info)" mutedZero={false} />
      <ClassicStat label="Worked hours" value={view.current.worked} format={formatHours} accent="var(--cl-ok)" mutedZero={false} />
      <ClassicStat
        label="Adherence"
        text={percent(view.current.adherence)}
        tone={view.current.adherence === null ? undefined : view.current.adherence >= 0.9 ? 'ok' : view.current.adherence >= 0.7 ? 'attention' : 'problem'}
      />
      <ClassicStat label="People" value={view.current.headcount} accent="var(--cl-mod-team)" mutedZero={false} />
    </div>

    <section class="cl-section">
      <h2 class="cl-section__title">{t('Compared with the previous period')}</h2>
      <div class="cl-tablewrap">
        <table class="cl-table">
          <thead>
            <tr>
              <th>{t('Measure')}</th>
              <th class="is-num">{t('This period')}</th>
              <th class="is-num">{t('Previous')}</th>
              <th class="is-num">{t('Change')}</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>{t('Planned hours')}</td>
              <td class="is-num">{formatHours(view.current.planned)}</td>
              <td class="is-num is-quiet">{formatHours(view.comparison.planned)}</td>
              <td class="is-num delta">{delta(view.current.planned, view.comparison.planned, 'hours')}</td>
            </tr>
            <tr>
              <td>{t('Worked hours')}</td>
              <td class="is-num">{formatHours(view.current.worked)}</td>
              <td class="is-num is-quiet">{formatHours(view.comparison.worked)}</td>
              <td class="is-num delta is-{deltaTone(view.current.worked, view.comparison.worked, 'up')}">{delta(view.current.worked, view.comparison.worked, 'hours')}</td>
            </tr>
            <tr>
              <td>{t('Late starts')}</td>
              <td class="is-num">{view.current.lateCount}</td>
              <td class="is-num is-quiet">{view.comparison.lateCount}</td>
              <td class="is-num delta is-{deltaTone(view.current.lateCount, view.comparison.lateCount, 'down')}">{delta(view.current.lateCount, view.comparison.lateCount, 'count')}</td>
            </tr>
            <tr>
              <td>{t('Missing badge')}</td>
              <td class="is-num">{view.current.missingBadges}</td>
              <td class="is-num is-quiet">{view.comparison.missingBadges}</td>
              <td class="is-num delta is-{deltaTone(view.current.missingBadges, view.comparison.missingBadges, 'down')}">{delta(view.current.missingBadges, view.comparison.missingBadges, 'count')}</td>
            </tr>
            <tr>
              <td>{t('Corrections')}</td>
              <td class="is-num">{view.current.corrections}</td>
              <td class="is-num is-quiet">{view.comparison.corrections}</td>
              <td class="is-num delta is-{deltaTone(view.current.corrections, view.comparison.corrections, 'down')}">{delta(view.current.corrections, view.comparison.corrections, 'count')}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>

    <section class="cl-section">
      <h2 class="cl-section__title">{t('By service')}</h2>
      <div class="cl-tablewrap">
        <table class="cl-table">
          <thead>
            <tr>
              <th>{t('Service')}</th>
              <th class="is-num">{t('Planned')}</th>
              <th class="is-num">{t('Worked')}</th>
              <th class="is-num">{t('Adherence')}</th>
              <th class="is-num">{t('Late today')}</th>
              <th class="is-num">{t('Missing badge')}</th>
            </tr>
          </thead>
          <tbody>
            {#each view.services as service (service.key)}
              <tr>
                <td>{t(service.label)}</td>
                <td class="is-num">{formatHours(service.planned)}</td>
                <td class="is-num">{formatHours(service.worked)}</td>
                <td class="meter-cell"><ClassicMeter value={service.adherence} label={percent(service.adherence)} /></td>
                <td class="is-num">{service.lateCount}</td>
                <td class="is-num">{service.missingCount}</td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    </section>
  {/snippet}
</ClassicReportsPage>

<style>
  .delta.is-ok { color: var(--cl-ok); font-weight: var(--rst-fw-bold); }
  .delta.is-problem { color: var(--cl-problem); font-weight: var(--rst-fw-bold); }
  .meter-cell {
    min-width: 140px;
  }
</style>

