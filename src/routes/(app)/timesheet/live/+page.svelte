<script lang="ts">
  import { goto } from '$app/navigation';
  import {
    addDays,
    formatHours,
    mondayFor,
    todayInTimezone,
    weekdayDateLabel
  } from '$lib/calendar/date';
  import LiveDuration from '$lib/components/LiveDuration.svelte';
  import { i18n, t } from '$lib/i18n/i18n.svelte';
  import { workspace } from '$lib/workspace/workspace.svelte';
  import { buildHomeModel } from '$lib/home/home-model';
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
      ? buildEmployeeColorMap(workspace.operations.job_functions, workspace.operations.employee_job_functions, workspace.operations.work_areas)
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
  // Lateness is a judgement about a planned start that has passed without a
  // badge; the shared home model already makes it, so it is not re-derived.
  const live = $derived(
    snapshot && role
      ? buildHomeModel(snapshot, role, currentInstant).live
      : { working: 0, late: 0, upcoming: 0, rows: [], todayRoster: [] }
  );
  const lateRows = $derived(live.rows.filter((row) => row.tone === 'danger'));
  const scheduledToday = $derived(rows.filter((slot) => slot.planned).length);
  const missingBadges = $derived(rows.filter((slot) => slot.status === 'missing').length);
</script>

<svelte:head><title>{t('Live monitor')} &middot; restogogo</title></svelte:head>

<ClassicPage>
  <p class="daynote">{weekdayDateLabel(today, i18n.intlLocale)}</p>

  <div class="cl-stats">
    <ClassicStat label="On shift now" value={live.working} tone={live.working ? 'ok' : undefined} mutedZero={false} />
    <ClassicStat label="Scheduled today" value={scheduledToday} accent="var(--cl-info)" mutedZero={false} />
    <ClassicStat label="Late today" value={live.late} tone={live.late ? 'problem' : undefined} />
    <ClassicStat label="Missing badge" value={missingBadges} tone={missingBadges ? 'problem' : undefined} />
  </div>

  {#if lateRows.length}
    <section class="cl-card is-accent is-problem" aria-label={t('Late today')}>
      <div class="cl-card__head"><h2>{t('Late today')}</h2></div>
      <div class="cl-tablewrap">
        <table class="cl-table">
          <thead>
            <tr>
              <th>{t('Employee')}</th>
              <th>{t('Planned')}</th>
              <th>{t('Status')}</th>
            </tr>
          </thead>
          <tbody>
            {#each lateRows as row (row.employeeId)}
              <tr class="is-problem">
                <td>
                  <span class="cl-table__name">
                    <span class="cl-avatar" style="--avatar-color:{employeeColor.get(row.employeeId) ?? 'var(--cl-muted)'}">{personInitials(row.name)}</span>
                    <span class="who"><strong>{row.name}</strong><span class="rowmeta">{t(row.role)}</span></span>
                  </span>
                </td>
                <td class="is-quiet">{row.range}</td>
                <td><ClassicStatus label={row.status} tone="problem" /></td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    </section>
  {/if}

  <section class="cl-section" aria-label={t('Today')}>
    <h2 class="cl-section__title">{t('Today')}</h2>
    <div class="cl-tablewrap">
      <table class="cl-table">
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
          {#if !rows.length}
            <tr>
              <td colspan="7">
                <div class="cl-empty">
                  <strong>{t('Nobody is scheduled today')}</strong>
                  <span>{t('Badge entries and planned shifts appear here as the week runs.')}</span>
                </div>
              </td>
            </tr>
          {:else}
            {#each rows as slot (slot.key)}
              {@const tone = slotTone(slot.status)}
              <tr class:is-attention={tone === 'attention'} class:is-problem={tone === 'problem'}>
                <td>
                  <span class="cl-table__name">
                    <span class="cl-avatar" style="--avatar-color:{employeeColor.get(slot.employeeId) ?? 'var(--cl-muted)'}">{personInitials(slot.employeeName)}</span>
                    {slot.employeeName}
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
  .who {
    display: grid;
    gap: 1px;
  }
  .who strong {
    font-weight: var(--rst-fw-medium);
  }
  .rowmeta {
    display: block;
    color: var(--cl-muted);
    font-size: 12px;
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
</style>
