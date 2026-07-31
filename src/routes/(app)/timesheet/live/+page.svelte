<script lang="ts">
  import {
    addDays,
    formatHours,
    localInputToInstant,
    mondayFor,
    serviceLabel,
    todayInTimezone,
    weekdayDateLabel
  } from '$lib/calendar/date';
  import Dialog from '$lib/components/Dialog.svelte';
  import LiveDuration from '$lib/components/LiveDuration.svelte';
  import { i18n, t } from '$lib/i18n/i18n.svelte';
  import { actualSlotsForDate } from '$lib/timesheet/timesheet-model';
  import { buildEmployeeColorMap } from '$lib/ui/position-color';
  import { personInitials } from '$lib/ui/person';
  import { workspace } from '$lib/workspace/workspace.svelte';
  import WorkspaceColMenu from '$lib/workspace-ui/WorkspaceColMenu.svelte';
  import WorkspaceGroupRow from '$lib/workspace-ui/WorkspaceGroupRow.svelte';
  import WorkspacePage from '$lib/workspace-ui/WorkspacePage.svelte';
  import WorkspacePrimaryColMenu from '$lib/workspace-ui/WorkspacePrimaryColMenu.svelte';
  import WorkspaceRowMenu from '$lib/workspace-ui/WorkspaceRowMenu.svelte';
  import WorkspaceService from '$lib/workspace-ui/WorkspaceService.svelte';
  import WorkspaceStatus from '$lib/workspace-ui/WorkspaceStatus.svelte';
  import WorkspaceCard from '$lib/workspace-ui/WorkspaceCard.svelte';
  import WorkspaceCardGrid from '$lib/workspace-ui/WorkspaceCardGrid.svelte';
  import { workspaceLayout } from '$lib/workspace-ui/workspace-layout.svelte';
  import WorkspaceViewSwitch from '$lib/workspace-ui/WorkspaceViewSwitch.svelte';
  import { isTimesheetRow, slotLabel, slotTone } from '$lib/workspace-ui/workspace-time';

  const snapshot = $derived(workspace.operations);
  const role = $derived(workspace.effectiveRole);
  const employeeColor = $derived(
    snapshot
      ? buildEmployeeColorMap(
          snapshot.job_functions,
          snapshot.employee_job_functions,
          snapshot.work_areas,
          snapshot.job_function_areas
        )
      : new Map<string, string>()
  );
  const timezone = $derived(
    snapshot?.restaurant_settings.timezone ||
      workspace.bootstrap?.restaurant_settings.timezone ||
      'Europe/Brussels'
  );

  let currentInstant = $state(new Date());
  let queueFilter = $state<'all' | 'late' | 'missing' | 'live'>('all');
  let viewMode = $state<'list' | 'floor'>('list');
  let search = $state('');
  let serviceFilters = $state<Set<string>>(new Set());
  let selectedKey = $state('');
  let groupMode = $state<'none' | 'employee' | 'service' | 'status'>('none');
  let collapsedGroups = $state<string[]>([]);

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
    rows
      .filter((slot) =>
        queueFilter === 'all'
          ? true
          : queueFilter === 'late'
            ? lateClockInKeys.has(slot.key)
            : queueFilter === 'missing'
              ? slot.status === 'missing'
              : slot.status === 'live'
      )
      .filter((slot) => {
        const needle = search.trim().toLocaleLowerCase(i18n.intlLocale);
        return !needle || slot.employeeName.toLocaleLowerCase(i18n.intlLocale).includes(needle);
      })
      .filter((slot) => !serviceFilters.size || serviceFilters.has(slot.serviceKey))
  );
  const serviceOptions = $derived(
    Array.from(new Set(rows.map((slot) => slot.serviceKey))).map((key) => ({
      value: key,
      label: t(serviceLabel(key, snapshot?.services))
    }))
  );
  const selectedSlot = $derived(rows.find((slot) => slot.key === selectedKey) ?? null);
  const groupedRows = $derived.by(() => {
    const groups = new Map<string, { key: string; label: string; slots: typeof filteredRows }>();
    for (const slot of filteredRows) {
      const label =
        groupMode === 'employee'
          ? slot.employeeName
          : groupMode === 'service'
            ? t(serviceLabel(slot.serviceKey, snapshot?.services))
            : groupMode === 'status'
              ? t(slotLabel(slot.status))
              : t('Today');
      const key = `${groupMode}:${label}`;
      const group = groups.get(key) ?? { key, label, slots: [] };
      group.slots.push(slot);
      groups.set(key, group);
    }
    return [...groups.values()].toSorted((left, right) => left.label.localeCompare(right.label));
  });
  const areaName = $derived(
    new Map(snapshot?.work_areas.map((area) => [area.id, area.name]) ?? [])
  );
  const positionName = $derived(
    new Map(snapshot?.job_functions.map((position) => [position.id, position.name]) ?? [])
  );
  const floorGroups = $derived.by(() => {
    const groups = new Map<string, typeof filteredRows>();
    for (const slot of filteredRows) {
      const area = areaName.get(slot.actualAreaId) || slot.truth.plan?.area || t('Unassigned area');
      groups.set(area, [...(groups.get(area) ?? []), slot]);
    }
    return [...groups.entries()]
      .map(([name, slots]) => ({ name, slots }))
      .toSorted((left, right) => left.name.localeCompare(right.name));
  });
  const updatedAt = $derived(
    new Intl.DateTimeFormat(i18n.intlLocale, {
      hour: '2-digit',
      minute: '2-digit',
      timeZone: timezone
    }).format(currentInstant)
  );

  function toggleService(value: string): void {
    const next = new Set(serviceFilters);
    if (next.has(value)) next.delete(value);
    else next.add(value);
    serviceFilters = next;
  }

  function setGroupMode(value: string): void {
    groupMode =
      value === 'employee' || value === 'service' || value === 'status' ? value : 'none';
    collapsedGroups = [];
  }

  function toggleGroup(key: string): void {
    collapsedGroups = collapsedGroups.includes(key)
      ? collapsedGroups.filter((item) => item !== key)
      : [...collapsedGroups, key];
  }

  function areaTone(name: string): string {
    const tones = ['#2f6fed', '#0f9f8f', '#d16b2f', '#8a5bd6', '#d2496a', '#3c8f55'];
    let value = 0;
    for (const character of name) value = (value * 31 + character.charCodeAt(0)) >>> 0;
    return tones[value % tones.length];
  }
</script>

<svelte:head><title>{t('Live monitor')} &middot; restogogo</title></svelte:head>

<WorkspacePage>
  <section class="cl-section" aria-label={t('Today')}>
    <div class="queue-head">
      <div>
        <h2 class="cl-section__title">{t('Operational queue')}</h2>
        <span>{weekdayDateLabel(today, i18n.intlLocale)} · {t('Updated {time}', { time: updatedAt })}</span>
        <div class="queue-summary" aria-label={t('Today')}>
          <span class:is-live={workingNow > 0}><b>{workingNow}</b>{t('working')}</span>
          <span><b>{scheduledToday}</b>{t('scheduled')}</span>
          <span class:is-problem={lateClockIns > 0}><b>{lateClockIns}</b>{t('late')}</span>
          <span class:is-problem={missingBadges > 0}><b>{missingBadges}</b>{t('missing')}</span>
        </div>
      </div>
      <div class="queue-controls">
        <WorkspaceViewSwitch
          value={viewMode}
          secondary="floor"
          onchange={(value) => (viewMode = value === 'floor' ? 'floor' : 'list')}
        />
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
    </div>

    {#if viewMode === 'list' && workspaceLayout.cards}
      <!-- A presence board: who is on the floor right now reads by colour and a
           live counter, not by scanning a clock column. -->
      <WorkspaceCardGrid>
        {#each groupedRows as group (group.key)}
          {#each group.slots as slot (slot.key)}
            {@const tone = slotTone(slot.status)}
            <WorkspaceCard
              accent={slot.status === 'live'
                ? 'var(--cl-ok, #157f4b)'
                : tone === 'problem'
                  ? 'var(--rst-state-danger)'
                  : tone === 'attention'
                    ? 'var(--rst-state-warning, #d99a1c)'
                    : (employeeColor.get(slot.employeeId) ?? null)}
              initials={personInitials(slot.employeeName)}
              title={slot.employeeName}
              subtitle={t(serviceLabel(slot.serviceKey, snapshot?.services))}
              badges={[
                {
                  label: t(slotLabel(slot.status)),
                  tone: slot.status === 'live'
                    ? ('ok' as const)
                    : tone === 'problem'
                      ? ('danger' as const)
                      : tone === 'attention'
                        ? ('warn' as const)
                        : ('neutral' as const)
                }
              ]}
              meta={[
                { label: t('Planned'), value: slot.plannedRange || '—', muted: !slot.plannedRange },
                { label: t('Actual'), value: slot.actualRange || '—', muted: !slot.actualRange },
                { label: t('Hours'), value: slot.actualHours ? formatHours(slot.actualHours) : '—', muted: !slot.actualHours }
              ]}
              onactivate={() => (selectedKey = slot.key)}
            >
              {#snippet children()}
                {#if slot.status === 'live'}
                  <span class="live-tag"><span class="live-dot" aria-hidden="true"></span><LiveDuration since={slot.clockInAt} /></span>
                {/if}
              {/snippet}
            </WorkspaceCard>
          {/each}
        {/each}
      </WorkspaceCardGrid>
    {:else if viewMode === 'list'}
      <div class="cl-tablewrap">
        <table class="cl-table cl-mobile-rows">
          <thead>
            <tr>
              <th>
                <WorkspacePrimaryColMenu
                  label="Employee"
                  labelIcon="people"
                  searchValue={search}
                  onsearch={(value) => (search = value)}
                  groupValue={groupMode}
                  groupOptions={[
                    { value: 'none', label: t('No grouping') },
                    { value: 'employee', label: t('Employee') },
                    { value: 'service', label: t('Service') },
                    { value: 'status', label: t('Status') }
                  ]}
                  ongroupchange={setGroupMode}
                />
              </th>
              <th>
                <WorkspaceColMenu
                  label="Service"
                  columnKey="live-service"
                  filterKind="values"
                  filterValues={serviceOptions}
                  selected={serviceFilters}
                  ontoggle={toggleService}
                  onselectall={() => (serviceFilters = new Set())}
                />
              </th>
              <th>{t('Planned')}</th>
              <th>{t('Recorded')}</th>
              <th class="is-num">{t('Worked')}</th>
              <th>{t('Status')}</th>
              <th class="menu-cell" aria-label={t('Actions')}></th>
            </tr>
          </thead>
          {#if !filteredRows.length}
            <tbody>
              <tr class="cl-mobile-empty">
                <td colspan="7">
                  <div class="cl-empty">
                    <strong>{t(queueFilter === 'all' ? 'Nobody is scheduled today' : 'Nothing in this queue')}</strong>
                    <span>{t(queueFilter === 'all' ? 'Badge entries and planned shifts appear here as the week runs.' : 'Choose another filter to review the rest of today.')}</span>
                  </div>
                </td>
              </tr>
            </tbody>
          {:else}
            {#each groupedRows as group (group.key)}
              <tbody>
                {#if groupMode !== 'none'}
                  <WorkspaceGroupRow
                    colspan={7}
                    label={group.label}
                    meta={`${group.slots.length} · ${group.slots.filter((slot) => slot.status === 'live').length} ${t('working')}`}
                    collapsed={collapsedGroups.includes(group.key)}
                    ontoggle={() => toggleGroup(group.key)}
                  />
                {/if}
                {#if !collapsedGroups.includes(group.key)}
                  {#each group.slots as slot (slot.key)}
                    {@const tone = slotTone(slot.status)}
                    <tr class:is-attention={tone === 'attention'} class:is-problem={tone === 'problem'}>
                      <td class="cl-mobile-primary">
                        <span class="cl-table__name">
                          <span class="cl-avatar" style="--avatar-color:{employeeColor.get(slot.employeeId) ?? 'var(--cl-muted)'}">{personInitials(slot.employeeName)}</span>
                          {slot.employeeName}
                        </span>
                        <span class="cl-mobile-summary">
                          <span>{t(serviceLabel(slot.serviceKey, snapshot?.services))}</span>
                          <span>{slot.plannedRange || t('Not planned')}</span>
                          <span>{t(slotLabel(slot.status))}</span>
                        </span>
                      </td>
                      <td><WorkspaceService service={slot.serviceKey} /></td>
                      <td class="is-quiet">{slot.plannedRange || '—'}</td>
                      <td>
                        {slot.actualRange || '—'}
                        {#if slot.status === 'live'}
                          <span class="live-tag"><span class="live-dot" aria-hidden="true"></span><LiveDuration since={slot.clockInAt} /></span>
                        {/if}
                      </td>
                      <td class="is-num">{slot.actualHours ? formatHours(slot.actualHours) : '—'}</td>
                      <td><WorkspaceStatus label={slotLabel(slot.status)} {tone} /></td>
                      <td class="menu-cell">
                        <WorkspaceRowMenu items={[{ label: t('Details'), onselect: () => (selectedKey = slot.key) }]} />
                      </td>
                    </tr>
                  {/each}
                {/if}
              </tbody>
            {/each}
          {/if}
        </table>
      </div>
    {:else if floorGroups.length}
      <div class="floor-monitor">
        {#each floorGroups as group (group.name)}
          <article style={`--area-tone:${areaTone(group.name)}`}>
            <header>
              <span><i></i><strong>{group.name}</strong></span>
              <em>{group.slots.filter((slot) => slot.status === 'live').length} {t('working')} · {group.slots.length} {t('scheduled')}</em>
            </header>
            <div>
              {#each group.slots as slot (slot.key)}
                {@const tone = slotTone(slot.status)}
                <button type="button" class:is-live={slot.status === 'live'} class:is-problem={tone === 'problem'} onclick={() => (selectedKey = slot.key)}>
                  <span class="cl-avatar" style="--avatar-color:{employeeColor.get(slot.employeeId) ?? 'var(--cl-muted)'}">{personInitials(slot.employeeName)}</span>
                  <span>
                    <strong>{slot.employeeName}</strong>
                    <small>{t(serviceLabel(slot.serviceKey, snapshot?.services))} · {slot.actualRange || slot.plannedRange || t('Not planned')}</small>
                  </span>
                  <WorkspaceStatus label={slotLabel(slot.status)} {tone} />
                </button>
              {/each}
            </div>
          </article>
        {/each}
      </div>
    {:else}
      <div class="cl-empty">
        <strong>{t('Nothing in this view')}</strong>
        <span>{t('Choose another filter to review the rest of today.')}</span>
      </div>
    {/if}
  </section>
</WorkspacePage>

<Dialog
  open={Boolean(selectedSlot)}
  title={selectedSlot?.employeeName ?? t('Shift details')}
  description={selectedSlot ? `${weekdayDateLabel(today, i18n.intlLocale)} · ${t(serviceLabel(selectedSlot.serviceKey, snapshot?.services))}` : ''}
  size="medium"
  onclose={() => (selectedKey = '')}
>
  {#if selectedSlot}
    <dl class="shift-details">
      <div><dt>{t('Status')}</dt><dd><WorkspaceStatus label={slotLabel(selectedSlot.status)} tone={slotTone(selectedSlot.status)} /></dd></div>
      <div><dt>{t('Planned')}</dt><dd>{selectedSlot.plannedRange || '—'}</dd></div>
      <div><dt>{t('Recorded')}</dt><dd>{selectedSlot.actualRange || '—'}</dd></div>
      <div><dt>{t('Worked')}</dt><dd>{selectedSlot.actualHours ? formatHours(selectedSlot.actualHours) : '—'}</dd></div>
      <div><dt>{t('Area')}</dt><dd>{areaName.get(selectedSlot.actualAreaId) || selectedSlot.truth.plan?.area || t('Not set')}</dd></div>
      <div><dt>{t('Position')}</dt><dd>{positionName.get(selectedSlot.actualJobFunctionId) || t('Not set')}</dd></div>
    </dl>
  {/if}
</Dialog>

<style>
  .queue-head { display: flex; align-items: flex-end; justify-content: space-between; gap: 16px; }
  .queue-head > div:first-child { display: grid; gap: 3px; }
  .queue-head > div:first-child > span { color: var(--cl-muted); font-size: var(--rst-fs-caption); }
  .queue-summary { display: flex; align-items: center; gap: 12px; margin-top: 5px; }
  .queue-summary span { display: inline-flex; align-items: baseline; gap: 4px; color: var(--cl-muted); font-size: var(--rst-fs-micro); text-transform: uppercase; }
  .queue-summary b { color: var(--cl-ink); font-size: var(--rst-fs-control); font-variant-numeric: tabular-nums; }
  .queue-summary span.is-live,
  .queue-summary span.is-live b { color: var(--cl-ok); }
  .queue-summary span.is-problem,
  .queue-summary span.is-problem b { color: var(--cl-problem); }
  .queue-controls { display: flex; align-items: center; gap: 7px; }
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
    color: var(--cl-muted);
    background: transparent;
    font: inherit;
    font-size: var(--rst-fs-caption);
    cursor: pointer;
  }
  .queue-filters button.is-active { color: var(--cl-accent); background: var(--cl-accent-wash); font-weight: var(--rst-fw-bold); }
  .queue-filters button span {
    min-width: 17px;
    height: 17px;
    display: grid;
    place-items: center;
    border-radius: 9px;
    background: var(--cl-surface-muted);
    font-size: var(--rst-fs-micro);
  }
  .live-tag { display: inline-flex; align-items: center; gap: 6px; margin-left: 8px; color: var(--cl-ok); font-weight: var(--rst-fw-bold); }
  .live-dot { width: 7px; height: 7px; border-radius: 50%; background: var(--cl-ok); animation: live-pulse 1.8s var(--cl-ease) infinite; }
  @keyframes live-pulse {
    0%, 100% { opacity: 1; box-shadow: 0 0 0 0 rgba(var(--cl-ok-rgb), .4); }
    50% { opacity: .7; box-shadow: 0 0 0 4px rgba(var(--cl-ok-rgb), 0); }
  }
  .floor-monitor {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(310px, 1fr));
    gap: 10px;
  }
  .floor-monitor article {
    min-width: 0;
    overflow: hidden;
    border: 1px solid color-mix(in srgb, var(--area-tone) 24%, var(--cl-line));
    border-radius: var(--cl-radius);
    background: var(--cl-surface);
    box-shadow: inset 0 3px 0 var(--area-tone);
  }
  .floor-monitor article > header {
    min-height: 46px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    padding: 9px 11px;
    border-bottom: 1px solid var(--cl-grid-line);
    background: color-mix(in srgb, var(--area-tone) 5%, var(--cl-surface));
  }
  .floor-monitor article > header span { min-width: 0; display: flex; align-items: center; gap: 7px; }
  .floor-monitor article > header i { width: 8px; height: 8px; flex: 0 0 auto; border-radius: 50%; background: var(--area-tone); }
  .floor-monitor article > header strong { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .floor-monitor article > header em { color: var(--cl-muted); font-size: var(--rst-fs-micro); font-style: normal; white-space: nowrap; }
  .floor-monitor article > div { display: grid; }
  .floor-monitor article button {
    min-width: 0;
    min-height: 55px;
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto;
    align-items: center;
    gap: 9px;
    padding: 8px 10px;
    border: 0;
    border-bottom: 1px solid var(--cl-grid-line);
    color: inherit;
    background: transparent;
    font: inherit;
    text-align: left;
    cursor: pointer;
  }
  .floor-monitor article button:last-child { border-bottom: 0; }
  .floor-monitor article button:hover { background: var(--cl-surface-muted); }
  .floor-monitor article button.is-live { background: color-mix(in srgb, var(--cl-ok) 5%, transparent); }
  .floor-monitor article button.is-problem { box-shadow: inset 3px 0 0 var(--cl-problem); }
  .floor-monitor article button > span:nth-child(2) { min-width: 0; display: grid; gap: 2px; }
  .floor-monitor article button strong,
  .floor-monitor article button small { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .floor-monitor article button small { color: var(--cl-muted); font-size: var(--rst-fs-micro); }
  .shift-details {
    margin: 0;
    display: grid;
    border: 1px solid var(--cl-line);
    border-radius: var(--cl-radius);
    overflow: hidden;
  }
  .shift-details div {
    min-height: 44px;
    display: grid;
    grid-template-columns: 120px minmax(0, 1fr);
    align-items: center;
    gap: 12px;
    padding: 8px 11px;
    border-bottom: 1px solid var(--cl-grid-line);
  }
  .shift-details div:last-child { border-bottom: 0; }
  .shift-details dt { color: var(--cl-muted); font-size: var(--rst-fs-caption); }
  .shift-details dd { margin: 0; font-weight: var(--rst-fw-bold); }
  @media (max-width: 760px) {
    .queue-head { align-items: stretch; flex-direction: column; }
    .queue-controls { align-items: stretch; flex-direction: column; }
    .queue-filters { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); }
    .queue-filters button { min-width: 0; justify-content: center; padding-inline: 3px; }
    .queue-controls :global(.view-switch) { align-self: flex-start; }
    .floor-monitor { grid-template-columns: 1fr; }
  }
</style>
