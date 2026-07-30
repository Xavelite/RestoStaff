<script lang="ts">
  import { History } from '@lucide/svelte';
  import { addDays, todayInTimezone, weekLabel } from '$lib/calendar/date';
  import { workWeekEventLabel } from '$lib/calendar/work-week-events';
  import { i18n, t } from '$lib/i18n/i18n.svelte';
  import { workspace } from '$lib/workspace/workspace.svelte';
  import WorkspaceColMenu from '$lib/workspace-ui/WorkspaceColMenu.svelte';
  import WorkspacePage from '$lib/workspace-ui/WorkspacePage.svelte';

  const snapshot = $derived(workspace.operations);
  const timezone = $derived(
    snapshot?.restaurant_settings.timezone ||
      workspace.bootstrap?.restaurant_settings.timezone ||
      'Europe/Brussels'
  );
  const today = $derived(todayInTimezone(timezone, new Date()));
  let eventSearch = $state('');
  let weekSearch = $state('');
  let actorFilters = $state<Set<string>>(new Set());
  let sortDir = $state<'asc' | 'desc'>('desc');

  $effect(() => {
    if (workspace.activeId && workspace.effectiveRole !== 'employee') {
      void workspace.loadOperations(addDays(today, -183), addDays(today, 14)).catch(() => undefined);
    }
  });

  const events = $derived(
    (snapshot?.work_week_events ?? [])
      .filter((event) => event.event_type.startsWith('planning_'))
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
    {#if events.length}
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
          </tbody>
        </table>
      </div>
    {:else}
      <div class="cl-empty">
        <span class="cl-empty__icon" aria-hidden="true"><History size={18} /></span>
        <strong>{t('No schedule history matches these filters')}</strong>
        <span>{t('Saving and publishing a week records an audited event here.')}</span>
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
    font-size: 9px;
    font-weight: var(--rst-fw-bold);
  }
  time {
    color: var(--cl-muted);
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }
</style>
