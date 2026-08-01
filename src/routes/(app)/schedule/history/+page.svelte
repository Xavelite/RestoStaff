<script lang="ts">
  import { History, RefreshCw } from '@lucide/svelte';
  import { getScheduleHistoryReadModel } from '$lib/api/workspace';
  import type { ScheduleHistoryReadModel } from '$lib/api/workspace-snapshot';
  import { weekLabel } from '$lib/calendar/date';
  import { workWeekEventLabel } from '$lib/calendar/work-week-events';
  import { i18n, t } from '$lib/i18n/i18n.svelte';
  import { workspace } from '$lib/workspace/workspace.svelte';
  import WorkspaceColMenu from '$lib/workspace-ui/WorkspaceColMenu.svelte';
  import WorkspacePage from '$lib/workspace-ui/WorkspacePage.svelte';
  import WorkspaceTimeline, { type TimelineEntry } from '$lib/workspace-ui/WorkspaceTimeline.svelte';
  import { workspaceLayout } from '$lib/workspace-ui/workspace-layout.svelte';

  let history = $state<ScheduleHistoryReadModel | null>(null);
  let loading = $state(false);
  let errorMessage = $state('');
  let reloadToken = $state(0);
  let eventSearch = $state('');
  let weekSearch = $state('');
  let actorFilters = $state<Set<string>>(new Set());
  let sortDir = $state<'asc' | 'desc'>('desc');

  $effect(() => {
    const restaurantId = workspace.activeId;
    const requestVersion = reloadToken;
    if (!restaurantId || workspace.effectiveRole === 'employee') {
      history = null;
      loading = false;
      errorMessage = '';
      return;
    }

    let cancelled = false;
    loading = true;
    errorMessage = '';
    void getScheduleHistoryReadModel(restaurantId)
      .then((result) => {
        if (!cancelled && requestVersion === reloadToken && workspace.activeId === restaurantId) {
          history = result;
        }
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          history = null;
          errorMessage = error instanceof Error ? error.message : String(error);
        }
      })
      .finally(() => {
        if (!cancelled) loading = false;
      });

    return () => {
      cancelled = true;
    };
  });

  const allEvents = $derived(history?.events ?? []);
  const events = $derived(
    allEvents
      .filter((event) => {
        const needle = eventSearch.trim().toLocaleLowerCase(i18n.intlLocale);
        if (!needle) return true;
        return [
          t(workWeekEventLabel(event.event_type)),
          event.reason,
          event.event_type
        ].some((value) => value.toLocaleLowerCase(i18n.intlLocale).includes(needle));
      })
      .filter((event) => {
        const needle = weekSearch.trim().toLocaleLowerCase(i18n.intlLocale);
        return !needle || weekLabel(event.week_start, i18n.intlLocale).toLocaleLowerCase(i18n.intlLocale).includes(needle);
      })
      .filter((event) => !actorFilters.size || actorFilters.has(event.actor_role))
      .toSorted((left, right) => {
        const compared = left.created_at.localeCompare(right.created_at);
        return sortDir === 'asc' ? compared : -compared;
      })
  );
  const filtersActive = $derived(
    Boolean(eventSearch.trim() || weekSearch.trim() || actorFilters.size)
  );
  const filteredEmpty = $derived(allEvents.length > 0 && filtersActive);

  function dayHeading(value: string): string {
    const date = new Date(value);
    if (!Number.isFinite(date.getTime())) return '';
    return new Intl.DateTimeFormat(i18n.intlLocale, { dateStyle: 'full' }).format(date);
  }

  function clockStamp(value: string): string {
    const date = new Date(value);
    if (!Number.isFinite(date.getTime())) return '';
    return new Intl.DateTimeFormat(i18n.intlLocale, { timeStyle: 'short' }).format(date);
  }

  // Publishing is the event that changes what the team sees, so it carries the
  // strongest tone; reverting reads as a warning; everything else stays quiet.
  function eventTone(eventType: string): TimelineEntry['tone'] {
    if (eventType.includes('publish')) return 'ok';
    if (eventType.includes('revert') || eventType.includes('unpublish')) return 'warn';
    return 'neutral';
  }

  const timelineEntries = $derived<TimelineEntry[]>(
    events.map((event) => ({
      id: event.id,
      day: dayHeading(event.created_at),
      title: t(workWeekEventLabel(event.event_type)),
      description: event.reason || null,
      facts: [weekLabel(event.week_start, i18n.intlLocale), t(event.actor_role || 'System')],
      time: clockStamp(event.created_at),
      isoTime: event.created_at,
      tone: eventTone(event.event_type)
    }))
  );

  function stamp(value: string): string {
    const date = new Date(value);
    if (!Number.isFinite(date.getTime())) return '';
    return new Intl.DateTimeFormat(i18n.intlLocale, {
      dateStyle: 'medium',
      timeStyle: 'short'
    }).format(date);
  }
</script>

<svelte:head><title>{t('Schedule history')} &middot; restogogo</title></svelte:head>

<WorkspacePage>
  <section class="history-surface" aria-label={t('Schedule history')}>
    {#if errorMessage}
      <div class="cl-empty history-state is-error">
        <span class="cl-empty__icon" aria-hidden="true"><History size={18} /></span>
        <strong>{t('Schedule history could not be loaded')}</strong>
        <span>{errorMessage}</span>
        <button class="cl-btn" type="button" onclick={() => (reloadToken += 1)}>
          <RefreshCw size={14} aria-hidden="true" />{t('Try again')}
        </button>
      </div>
    {:else if loading && !history}
      <div class="cl-empty history-state" aria-live="polite">
        <span class="cl-empty__icon spin" aria-hidden="true"><RefreshCw size={18} /></span>
        <strong>{t('Loading schedule history...')}</strong>
      </div>
    {:else if workspaceLayout.visual && events.length}
      <WorkspaceTimeline entries={timelineEntries} />
    {:else}
    <div class="cl-tablewrap">
      <table class="cl-table">
        <thead>
          <tr>
            <th>
              <WorkspaceColMenu
                label="Event"
                columnKey="schedule-history-event"
                filterKind="text"
                searchValue={eventSearch}
                onsearch={(value) => (eventSearch = value)}
              />
            </th>
            <th>
              <WorkspaceColMenu
                label="Week"
                columnKey="schedule-history-week"
                filterKind="text"
                searchValue={weekSearch}
                onsearch={(value) => (weekSearch = value)}
              />
            </th>
            <th>
              <WorkspaceColMenu
                label="Actor"
                columnKey="schedule-history-actor"
                filterKind="values"
                filterValues={[
                  { value: 'owner', label: t('Owner') },
                  { value: 'manager', label: t('Manager') },
                  { value: 'employee', label: t('Employee') },
                  { value: 'system', label: t('System') }
                ]}
                selected={actorFilters}
                ontoggle={(value) => {
                  const next = new Set(actorFilters);
                  if (next.has(value)) next.delete(value);
                  else next.add(value);
                  actorFilters = next;
                }}
                onselectall={() => (actorFilters = new Set())}
              />
            </th>
            <th>
              <WorkspaceColMenu
                label="When"
                columnKey="schedule-history-when"
                sortable
                {sortDir}
                onsort={(value) => (sortDir = value)}
              />
            </th>
          </tr>
        </thead>
        <tbody>
          {#if events.length}
            {#each events as event (event.id)}
              <tr>
                <td class="event-cell">
                  <span><History size={15} strokeWidth={1.7} aria-hidden="true" /></span>
                  <span>
                    <strong>{t(workWeekEventLabel(event.event_type))}</strong>
                    <small>{event.reason || t('No reason recorded')}</small>
                  </span>
                </td>
                <td><strong>{weekLabel(event.week_start, i18n.intlLocale)}</strong></td>
                <td><span class="role-badge">{t(event.actor_role || 'System')}</span></td>
                <td><time datetime={event.created_at}>{stamp(event.created_at)}</time></td>
              </tr>
            {/each}
          {:else}
            <tr>
              <td colspan="4">
                <div class="cl-empty">
                  <span class="cl-empty__icon" aria-hidden="true"><History size={18} /></span>
                  <strong>{t(filteredEmpty ? 'No schedule history matches these filters' : 'No schedule history yet')}</strong>
                  <span>{t(filteredEmpty
                    ? 'Clear a column filter to review other schedule events.'
                    : 'Publishing, reverting and finalizing a week records an audited event here.')}</span>
                </div>
              </td>
            </tr>
          {/if}
        </tbody>
      </table>
    </div>
    {/if}
  </section>
</WorkspacePage>

<style>
  .history-surface {
    overflow: hidden;
    border: 1px solid var(--cl-line);
    border-radius: var(--cl-radius-surface);
    background: var(--cl-surface);
  }
  .history-state { min-height: 220px; }
  .history-state.is-error .cl-empty__icon {
    color: var(--cl-danger);
    background: var(--cl-danger-wash);
  }
  .history-state .cl-btn { margin-top: 4px; }
  .spin { animation: spin 0.9s linear infinite; }
  @keyframes spin { to { transform: rotate(360deg); } }
  .event-cell {
    min-width: 280px;
    display: grid;
    grid-template-columns: auto minmax(0, 1fr);
    align-items: center;
    gap: 9px;
  }
  .event-cell > span:first-child {
    width: 30px;
    height: 30px;
    display: grid;
    place-items: center;
    border-radius: 6px;
    color: var(--cl-info);
    background: var(--cl-info-wash);
  }
  .event-cell > span:last-child {
    min-width: 0;
    display: grid;
    gap: 2px;
  }
  .event-cell strong,
  .event-cell small {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .event-cell small { color: var(--cl-muted); }
  .role-badge {
    display: inline-flex;
    padding: 3px 7px;
    border-radius: 999px;
    color: var(--cl-info);
    background: var(--cl-info-wash);
    font-size: var(--rst-fs-micro);
    font-weight: var(--rst-fw-bold);
  }
  time {
    color: var(--cl-muted);
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }
</style>
