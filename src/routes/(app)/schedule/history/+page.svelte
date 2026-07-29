<script lang="ts">
  import { History } from '@lucide/svelte';
  import { workWeekHistoryItems } from '$lib/calendar/week-history';
  import { i18n, t } from '$lib/i18n/i18n.svelte';
  import { workspace } from '$lib/workspace/workspace.svelte';
  import ClassicPage from '$lib/classic/ClassicPage.svelte';
  import ClassicScheduleWeek from '$lib/classic/ClassicScheduleWeek.svelte';

  const snapshot = $derived(workspace.operations);

  function stamp(value: string): string {
    const date = new Date(value);
    if (!Number.isFinite(date.getTime())) return '';
    return new Intl.DateTimeFormat(i18n.intlLocale, {
      dateStyle: 'medium',
      timeStyle: 'short'
    }).format(date);
  }
</script>

<svelte:head><title>{t('History')} &middot; restogogo</title></svelte:head>

<ClassicPage>
  <ClassicScheduleWeek>
    {#snippet children(week)}
      {@const items = workWeekHistoryItems(
        (snapshot?.work_week_events ?? []).filter(
          (event) => event.week_start === week.weekStart
        ),
        'planning_'
      )}

      <section class="history-surface" aria-label={t('History')}>
        {#if !items.length}
          <div class="cl-empty">
            <span class="cl-empty__icon" aria-hidden="true"><History size={18} /></span>
            <strong>{t('No schedule history for this week')}</strong>
            <span>{t('Saving and publishing a week records an audited event here.')}</span>
          </div>
        {:else}
          <ol class="history-list">
            {#each items as item (item.id)}
              <li>
                <span class="history-marker" aria-hidden="true"><History size={15} /></span>
                <div class="history-event">
                  <div class="history-event__head">
                    <strong>{t(item.title)}</strong>
                    <time datetime={item.when}>{stamp(item.when)}</time>
                  </div>
                  {#if item.detail}<p>{item.detail}</p>{/if}
                </div>
              </li>
            {/each}
          </ol>
        {/if}
      </section>
    {/snippet}
  </ClassicScheduleWeek>
</ClassicPage>

<style>
  .history-surface {
    border: 1px solid var(--cl-line);
    border-radius: var(--cl-radius-surface);
    background: var(--cl-surface);
  }
  .history-list {
    margin: 0;
    padding: 8px 22px;
    list-style: none;
  }
  .history-list li {
    position: relative;
    display: grid;
    grid-template-columns: 30px minmax(0, 1fr);
    gap: 11px;
    padding: 15px 0;
  }
  .history-list li + li {
    border-top: 1px solid var(--cl-line);
  }
  .history-marker {
    width: 30px;
    height: 30px;
    display: grid;
    place-items: center;
    border: 1px solid var(--cl-info-line);
    border-radius: 6px;
    color: var(--cl-info);
    background: var(--cl-info-wash);
  }
  .history-event {
    min-width: 0;
    display: grid;
    align-content: center;
    gap: 4px;
  }
  .history-event__head {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 16px;
  }
  .history-event strong {
    color: var(--cl-ink);
    font-size: 13px;
  }
  .history-event time,
  .history-event p {
    color: var(--cl-muted);
    font-size: 12px;
  }
  .history-event time {
    flex: 0 0 auto;
    font-variant-numeric: tabular-nums;
  }
  .history-event p {
    margin: 0;
    line-height: 1.45;
  }
  @media (max-width: 520px) {
    .history-list { padding-inline: 14px; }
    .history-event__head { display: grid; gap: 3px; }
  }
</style>
