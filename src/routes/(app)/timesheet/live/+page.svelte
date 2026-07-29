<script lang="ts">
  import { goto } from '$app/navigation';
  import {
    addDays,
    formatHours,
    localInputToInstant,
    mondayFor,
    todayInTimezone,
    weekdayDateLabel
  } from '$lib/calendar/date';
  import LiveDuration from '$lib/components/LiveDuration.svelte';
  import { i18n, t } from '$lib/i18n/i18n.svelte';
  import { workspace } from '$lib/workspace/workspace.svelte';
  import { actualSlotsForDate } from '$lib/timesheet/timesheet-model';
  import { buildEmployeeColorMap } from '$lib/ui/position-color';
  import { personInitials } from '$lib/ui/person';
  import ClassicPage from '$lib/classic/ClassicPage.svelte';
  import ClassicService from '$lib/classic/ClassicService.svelte';
  import ClassicStat from '$lib/classic/ClassicStat.svelte';
  import ClassicStatus from '$lib/classic/ClassicStatus.svelte';
  import ClassicRowMenu from '$lib/classic/ClassicRowMenu.svelte';
  import { isTimesheetRow, slotLabel, slotTone } from '$lib/classic/classic-time';

  const employeeColor = $derived(
    workspace.operations
      ? buildEmployeeColorMap(
          workspace.operations.job_functions,
          workspace.operations.employee_job_functions,
          workspace.operations.work_areas,
          workspace.operations.job_function_areas
        )
      : new Map<string, string>()
  );

  const snapshot = $derived(workspace.operations);
  const role = $derived(workspace.effectiveRole);
  const timezone = $derived(
    snapshot?.restaurant_settings.timezone ||
      workspace.bootstrap?.restaurant_settings.timezone ||
      'Europe/Brussels'
  );

  // The live monitor is the one screen that must stay current on its own.
  let currentInstant = $state(new Date());
  let queueFilter = $state<'all' | 'late' | 'missing' | 'live'>('all');
  $effect(() => {
    const timer = setInterval(() => (currentInstant = new Date()), 30_000);
    return () => clearInterval(timer);
  });

  const today = $derived(todayInTimezone(timezone, currentInstant));
  const activeWeek = $derived(mondayFor(today));
  $effect(() => {
    if (workspace.activeId && role && role !== 'employee') {
      void workspace.loadOperations(activeWeek, addDays(activeWeek, 6)).catch(() => undefined);
    }
  });

  const rows = $derived(
    snapshot
      ? actualSlotsForDate(snapshot, today, today, currentInstant)
          .filter(isTimesheetRow)
          .sort(
            (left, right) =>
              (left.plannedRange || 'zz').localeCompare(right.plannedRange || 'zz') ||
              left.employeeName.localeCompare(right.employeeName)
          )
      : []
  );
  const workingNow = $derived(rows.filter((slot) => slot.status === 'live').length);
  const scheduledToday = $derived(rows.filter((slot) => slot.planned).length);
  const missingBadges = $derived(rows.filter((slot) => slot.status === 'missing').length);
  const lateClockInKeys = $derived.by(() => {
    const keys = new Set<string>();
    for (const slot of rows) {
      const plannedStart = slot.plannedRange.slice(0, 5);
      if (!slot.clockInAt || !plannedStart) continue;
      const plannedInstant = localInputToInstant(`${today}T${plannedStart}`, timezone);
      if (
        plannedInstant &&
        new Date(slot.clockInAt).getTime() - new Date(plannedInstant).getTime() > 5 * 60_000
      ) {
        keys.add(slot.key);
      }
    }
    return keys;
  });
  const lateClockIns = $derived(lateClockInKeys.size);
  const filteredRows = $derived(
    rows.filter((slot) =>
      queueFilter === 'all'
        ? true
        : queueFilter === 'late'
          ? lateClockInKeys.has(slot.key)
          : queueFilter === 'missing'
            ? slot.status === 'missing'
            : slot.status === 'live'
    )
  );
  const updatedAt = $derived(
    new Intl.DateTimeFormat(i18n.intlLocale, {
      hour: '2-digit',
      minute: '2-digit',
      timeZone: timezone
    }).format(currentInstant)
  );
</script>

<svelte:head><title>{t('Live monitor')} &middot; restogogo</title></svelte:head>

<ClassicPage>
  <p class="daynote">{weekdayDateLabel(today, i18n.intlLocale)}</p>

  <div class="cl-stats">
    <ClassicStat label="People on shift now" value={workingNow} tone={workingNow ? 'ok' : undefined} mutedZero={false} />
    <ClassicStat label="Scheduled services today" value={scheduledToday} accent="var(--cl-info)" mutedZero={false} />
    <ClassicStat label="Late clock-ins today" value={lateClockIns} tone={lateClockIns ? 'problem' : undefined} />
    <ClassicStat label="Services missing a badge" value={missingBadges} tone={missingBadges ? 'problem' : undefined} />
  </div>

  <section class="cl-section" aria-label={t('Today')}>
    <div class="queue-head">
      <div>
        <h2 class="cl-section__title">{t('Operational queue')}</h2>
        <span>{t('Updated {time}', { time: updatedAt })}</span>
      </div>
      <div class="queue-filters" aria-label={t('Filter')}>
        {#each [
          { key: 'all', label: 'All', count: rows.length },
          { key: 'late', label: 'Late', count: lateClockIns },
          { key: 'missing', label: 'Missing', count: missingBadges },
          { key: 'live', label: 'Working', count: workingNow }
        ] as option (option.key)}
          <button class:is-active={queueFilter === option.key} type="button" onclick={() => (queueFilter = option.key as typeof queueFilter)}>
            {t(option.label)} <span>{option.count}</span>
          </button>
        {/each}
      </div>
    </div>
    <div class="cl-tablewrap">
      <table class="cl-table cl-mobile-rows">
        <thead>
          <tr>
            <th>{t('Employee')}</th>
            <th>{t('Service')}</th>
            <th>{t('Planned')}</th>
            <th>{t('Recorded')}</th>
            <th class="is-num">{t('Worked')}</th>
            <th>{t('Status')}</th>
            <th class="menu-cell" aria-label={t('Actions')}></th>
          </tr>
        </thead>
        <tbody>
          {#if !filteredRows.length}
            <tr class="cl-mobile-empty">
              <td colspan="7">
                <div class="cl-empty">
                  <strong>{t(queueFilter === 'all' ? 'Nobody is scheduled today' : 'Nothing in this queue')}</strong>
                  <span>{t(queueFilter === 'all' ? 'Badge entries and planned shifts appear here as the week runs.' : 'Choose another filter to review the rest of today.')}</span>
                </div>
              </td>
            </tr>
          {:else}
            {#each filteredRows as slot (slot.key)}
              {@const tone = slotTone(slot.status)}
              <tr class:is-attention={tone === 'attention'} class:is-problem={tone === 'problem'}>
                <td class="cl-mobile-primary">
                  <span class="cl-table__name">
                    <span class="cl-avatar" style="--avatar-color:{employeeColor.get(slot.employeeId) ?? 'var(--cl-muted)'}">{personInitials(slot.employeeName)}</span>
                    {slot.employeeName}
                  </span>
                  <span class="cl-mobile-summary">
                    <span>{t(slot.serviceKey === 'evening' ? 'Evening' : 'Lunch')}</span>
                    <span>{slot.plannedRange || t('Not planned')}</span>
                    <span>{t(slotLabel(slot.status))}</span>
                  </span>
                </td>
                <td><ClassicService service={slot.serviceKey} /></td>
                <td class="is-quiet">{slot.plannedRange || '—'}</td>
                <td>
                  {slot.actualRange || '—'}
                  {#if slot.status === 'live'}
                    <span class="live-tag"><span class="live-dot" aria-hidden="true"></span><LiveDuration since={slot.clockInAt} /></span>
                  {/if}
                </td>
                <td class="is-num">{slot.actualHours ? formatHours(slot.actualHours) : '—'}</td>
                <td><ClassicStatus label={slotLabel(slot.status)} {tone} /></td>
                <td class="menu-cell">
                  <ClassicRowMenu
                    items={[
                      {
                        label: t('Details'),
                        onselect: () =>
                          void goto(
                            `/timesheet?date=${today}&entry=${encodeURIComponent(slot.key)}`
                          )
                      }
                    ]}
                  />
                </td>
              </tr>
            {/each}
          {/if}
        </tbody>
      </table>
    </div>
  </section>
</ClassicPage>

<style>
  .daynote {
    margin: -8px 0 0;
    color: var(--cl-muted);
    font-size: 14px;
  }
  .queue-head {
    display: flex;
    align-items: flex-end;
    justify-content: space-between;
    gap: 16px;
  }
  .queue-head > div:first-child { display: grid; gap: 3px; }
  .queue-head > div:first-child > span { color: var(--cl-muted); font-size: 10px; }
  .queue-filters {
    display: flex;
    padding: 3px;
    border: 1px solid var(--cl-line);
    border-radius: 7px;
    background: var(--cl-surface);
  }
  .queue-filters button {
    min-height: 30px;
    display: flex;
    align-items: center;
    gap: 5px;
    padding: 4px 9px;
    border: 0;
    border-radius: 5px;
    background: transparent;
    color: var(--cl-muted);
    font: inherit;
    font-size: 10px;
    cursor: pointer;
  }
  .queue-filters button.is-active { background: var(--cl-accent-wash); color: var(--cl-accent); font-weight: var(--rst-fw-bold); }
  .queue-filters button span {
    min-width: 17px;
    height: 17px;
    display: grid;
    place-items: center;
    border-radius: 9px;
    background: var(--cl-surface-muted);
    font-size: 9px;
  }
  /* A live shift gets a soft green pulse next to its running duration. */
  .live-tag {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    margin-left: 8px;
    color: var(--cl-ok);
    font-weight: var(--rst-fw-bold);
  }
  .live-dot {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: var(--cl-ok);
    animation: live-pulse 1.8s var(--cl-ease) infinite;
  }
  @keyframes live-pulse {
    0%, 100% { opacity: 1; box-shadow: 0 0 0 0 rgba(var(--cl-ok-rgb), 0.4); }
    50% { opacity: 0.7; box-shadow: 0 0 0 4px rgba(var(--cl-ok-rgb), 0); }
  }
  @media (max-width: 760px) {
    .queue-head { align-items: stretch; flex-direction: column; }
    .queue-filters { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); }
    .queue-filters button { min-width: 0; justify-content: center; padding-inline: 3px; }
  }
</style>
