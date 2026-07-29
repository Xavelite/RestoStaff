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

      <div class="cl-tablewrap">
        <table class="cl-table">
          <thead>
            <tr>
              <th>{t('When')}</th>
              <th>{t('Event')}</th>
              <th>{t('Detail')}</th>
            </tr>
          </thead>
          <tbody>
            {#if !items.length}
              <tr>
                <td colspan="3">
                  <div class="cl-empty">
                    <span class="cl-empty__icon" aria-hidden="true"><History size={18} /></span>
                    <strong>{t('No schedule history for this week')}</strong>
                    <span>{t('Saving and publishing a week records an audited event here.')}</span>
                  </div>
                </td>
              </tr>
            {:else}
              {#each items as item (item.id)}
                <tr>
                  <td class="is-quiet">{stamp(item.when)}</td>
                  <td>{t(item.title)}</td>
                  <td class="is-quiet">{item.detail ?? ''}</td>
                </tr>
              {/each}
            {/if}
          </tbody>
        </table>
      </div>
    {/snippet}
  </ClassicScheduleWeek>
</ClassicPage>
