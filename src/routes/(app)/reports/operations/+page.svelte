<script lang="ts">
  import { formatHours } from '$lib/calendar/date';
  import { i18n, t } from '$lib/i18n/i18n.svelte';
  import ClassicMeter from '$lib/classic/ClassicMeter.svelte';
  import ClassicReportsPage from '$lib/classic/ClassicReportsPage.svelte';
  import ReportHoursChart from '$lib/reports/ReportHoursChart.svelte';
  import ReportPulse from '$lib/reports/ReportPulse.svelte';

  function percent(value: number | null): string {
    return value === null ? '—' : `${Math.round(value * 100)}%`;
  }

  function day(value: string): string {
    const date = new Date(`${value}T00:00:00Z`);
    if (!Number.isFinite(date.getTime())) return value;
    return new Intl.DateTimeFormat(i18n.intlLocale, {
      day: 'numeric',
      month: 'short',
      timeZone: 'UTC'
    }).format(date);
  }
</script>

<svelte:head><title>{t('Operations')} &middot; restogogo</title></svelte:head>

<ClassicReportsPage>
  {#snippet children(view)}
    <div class="operations-visuals">
      <ReportHoursChart buckets={view.buckets} />
      <ReportPulse cells={view.pulse} />
    </div>

    <section class="cl-section">
      <h2 class="cl-section__title">{t('By area')}</h2>
      <div class="cl-tablewrap">
        <table class="cl-table cl-mobile-rows">
          <thead>
            <tr>
              <th>{t('Area')}</th>
              <th class="is-num">{t('Planned')}</th>
              <th class="is-num">{t('Worked')}</th>
              <th class="is-num">{t('Adherence')}</th>
              <th class="is-num">{t('Rows needing attention')}</th>
            </tr>
          </thead>
          <tbody>
            {#each view.areas as area (area.id)}
              <tr class:is-attention={area.issues > 0}>
                <td class="cl-mobile-primary">
                  <strong>{area.name}</strong>
                  <span class="cl-mobile-summary"><span>{formatHours(area.planned)} {t('planned')}</span><span>{formatHours(area.worked)} {t('worked')}</span><span>{percent(area.adherence)}</span>{#if area.issues}<span>{area.issues} {t('issues')}</span>{/if}</span>
                </td>
                <td class="is-num">{formatHours(area.planned)}</td>
                <td class="is-num">{formatHours(area.worked)}</td>
                <td class="meter-cell"><ClassicMeter value={area.adherence} label={percent(area.adherence)} /></td>
                <td class="is-num">{area.issues}</td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    </section>

    {#if view.events.length}
      <section class="cl-section">
        <h2 class="cl-section__title">{t('What happened')}</h2>
        <div class="cl-tablewrap">
          <table class="cl-table cl-mobile-rows">
            <thead>
              <tr>
                <th>{t('Day')}</th>
                <th>{t('Name')}</th>
                <th>{t('Event')}</th>
                <th>{t('Detail')}</th>
              </tr>
            </thead>
            <tbody>
              {#each view.events.slice(0, 40) as event (event.id)}
                <tr>
                  <td class="cl-mobile-primary">
                    <span>{day(event.date)}</span>
                    <span class="cl-mobile-summary"><span>{event.employeeName}</span><span>{event.title}</span><span>{event.detail}</span></span>
                  </td>
                  <td>{event.employeeName}</td>
                  <td>{event.title}</td>
                  <td class="is-quiet">{event.detail}</td>
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
      </section>
    {/if}
  {/snippet}
</ClassicReportsPage>

<style>
  .meter-cell {
    min-width: 140px;
  }
  .operations-visuals {
    min-width: 0;
    display: grid;
    grid-template-columns: minmax(0, 1.2fr) minmax(420px, .8fr);
    gap: 14px;
  }
  @media (max-width: 1180px) {
    .operations-visuals { grid-template-columns: minmax(0, 1fr); }
  }
</style>
