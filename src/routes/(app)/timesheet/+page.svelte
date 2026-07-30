<script lang="ts">
  import { page } from '$app/state';
  import { onMount } from 'svelte';
  import {
    addDays,
    dateForWeekday,
    formatHours,
    hoursBetweenClocks,
    mondayFor,
    todayInTimezone,
    weekdayDateLabel,
    weekLabel,
    WEEKDAYS,
    type ServiceKey
  } from '$lib/calendar/date';
  import { buildEmployeeColorMap } from '$lib/ui/position-color';
  import { personInitials } from '$lib/ui/person';
  import ActionButton from '$lib/components/ActionButton.svelte';
  import Dialog from '$lib/components/Dialog.svelte';
  import RosterExportDialog from '$lib/exports/RosterExportDialog.svelte';
  import type { PreparedExport } from '$lib/exports/export-download';
  import { friendlyError } from '$lib/api/error-messages';
  import { i18n, t } from '$lib/i18n/i18n.svelte';
  import { unsavedChanges } from '$lib/navigation/unsaved-changes.svelte';
  import { toasts } from '$lib/ui/toast.svelte';
  import { workspace } from '$lib/workspace/workspace.svelte';
  import TimesheetEntryDialog from '$lib/timesheet/TimesheetEntryDialog.svelte';
  import {
    setTimesheetWeekStatus
  } from '$lib/timesheet/timesheet-actions';
  import {
    actualSlotsForDate,
    actualsServiceKeysForWeek,
    actualsStatusForWeek,
    actualsWeekTotals,
    type ActualSlot
  } from '$lib/timesheet/timesheet-model';
  import WorkspacePage from '$lib/workspace-ui/WorkspacePage.svelte';
  import WorkspacePrimaryColMenu from '$lib/workspace-ui/WorkspacePrimaryColMenu.svelte';
  import WorkspaceGroupRow from '$lib/workspace-ui/WorkspaceGroupRow.svelte';
  import WorkspaceMobileDayPicker from '$lib/workspace-ui/WorkspaceMobileDayPicker.svelte';
  import TimesheetDayCard from '$lib/timesheet/TimesheetDayCard.svelte';
  import { isTimesheetRow, needsAttention } from '$lib/workspace-ui/workspace-time';
  import { areaInstanceLabelMap } from '$lib/restaurant/area-instance';

  type GroupMode = 'none' | 'contract' | 'position' | 'status';

  const snapshot = $derived(workspace.operations);
  const role = $derived(workspace.effectiveRole);
  const timezone = $derived(
    snapshot?.restaurant_settings.timezone ||
      workspace.bootstrap?.restaurant_settings.timezone ||
      'Europe/Brussels'
  );

  let currentInstant = $state(new Date());
  $effect(() => {
    const timer = setInterval(() => (currentInstant = new Date()), 60_000);
    return () => clearInterval(timer);
  });

  const today = $derived(todayInTimezone(timezone, currentInstant));
  let weekOffset = $state(0);
  const activeWeek = $derived(addDays(mondayFor(today), weekOffset * 7));
  const serviceKeys = $derived(
    snapshot ? actualsServiceKeysForWeek(snapshot, activeWeek) : []
  );

  $effect(() => {
    if (workspace.activeId && role && role !== 'employee') {
      void workspace.loadOperations(activeWeek, addDays(activeWeek, 6)).catch(() => undefined);
    }
  });

  let onlyIssues = $state(false);
  let compactCards = $state(false);
  let exportOpen = $state(false);
  let search = $state('');
  let positionId = $state('');
  let employeeSort = $state<'asc' | 'desc'>('asc');
  let groupMode = $state<GroupMode>('none');
  let collapsedGroups = $state<string[]>([]);
  let selectedKey = $state('');
  let saving = $state(false);
  let weekDialogOpen = $state(false);
  let weekAction = $state<'approve_week' | 'reopen_week'>('approve_week');
  let weekReason = $state('');
  let weekPicker = $state<HTMLInputElement>();
  let mobileDate = $state('');

  onMount(() => {
    compactCards = localStorage.getItem('rst-time-card-density') === 'compact';
  });

  function toggleCardDensity(): void {
    compactCards = !compactCards;
    localStorage.setItem('rst-time-card-density', compactCards ? 'compact' : 'detailed');
  }

  const weekDates = $derived(
    Array.from({ length: 7 }, (_, index) => dateForWeekday(activeWeek, index + 1))
  );

  $effect(() => {
    const requested = page.url.searchParams.get('date');
    const weekEnd = addDays(activeWeek, 6);
    mobileDate =
      requested && requested >= activeWeek && requested <= weekEnd
        ? requested
        : today >= activeWeek && today <= weekEnd
          ? today
          : activeWeek;
  });
  const slots = $derived(
    snapshot
      ? weekDates.flatMap((date) => actualSlotsForDate(snapshot, date, today, currentInstant))
      : []
  );
  const totals = $derived(
    snapshot
      ? actualsWeekTotals(snapshot, activeWeek, today, currentInstant)
      : { actualHours: 0, plannedHours: 0, missing: 0, live: 0, adjusted: 0, conflicts: 0 }
  );
  const weekStatus = $derived(snapshot ? actualsStatusForWeek(snapshot, activeWeek) : 'open');
  const workWeek = $derived(
    snapshot?.work_weeks.find((week) => week.week_start === activeWeek) ?? null
  );
  const editable = $derived(weekStatus === 'open' && !workspace.isPreview);
  const selectedSlot = $derived(slots.find((slot) => slot.key === selectedKey) ?? null);

  // --- week grid (employees × days), mirroring the Schedule board ----------
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
  const contractHours = $derived(
    new Map(
      (snapshot?.employee_contracts ?? [])
        .filter((contract) => contract.active && contract.is_current)
        .map((contract) => [contract.employee_id, Number(contract.weekly_contract_hours) || 0])
    )
  );
  const slotByKey = $derived(new Map(slots.map((slot) => [slot.key, slot])));
  const days = $derived(
    weekDates.map((date, index) => ({
      date,
      label: WEEKDAYS[index],
      today: date === today,
      past: date < today
    }))
  );
  const dayWorked = $derived(
    weekDates.map((date) =>
      slots.filter((slot) => slot.date === date).reduce((sum, slot) => sum + slot.actualHours, 0)
    )
  );
  const dayPlanned = $derived(
    weekDates.map((date) =>
      slots
        .filter((slot) => slot.date === date)
        .reduce(
          (sum, slot) =>
            sum +
            (slot.truth.plan
              ? hoursBetweenClocks(slot.truth.plan.startsAt, slot.truth.plan.endsAt)
              : 0),
          0
        )
    )
  );
  const dayIssues = $derived(
    weekDates.map((date) => slots.filter((slot) => slot.date === date && needsAttention(slot)).length)
  );
  const dayEmployees = $derived(
    weekDates.map(
      (date) =>
        new Set(
          slots
            .filter((slot) => slot.date === date && isTimesheetRow(slot))
            .map((slot) => slot.employeeId)
        ).size
    )
  );
  const areaName = $derived(
    areaInstanceLabelMap(snapshot?.work_areas ?? [])
  );
  const areaColor = $derived(
    new Map(
      (snapshot?.work_areas ?? []).map((area) => [
        area.id,
        area.color ?? 'var(--cl-info)'
      ])
    )
  );
  const positionName = $derived(
    new Map((snapshot?.job_functions ?? []).map((position) => [position.id, position.name]))
  );

  const employeePosition = $derived.by(() => {
    const values = new Map<string, string>();
    for (const assignment of snapshot?.employee_job_functions ?? []) {
      if (!assignment.active) continue;
      if (assignment.is_primary || !values.has(assignment.employee_id)) {
        values.set(assignment.employee_id, assignment.job_function_id);
      }
    }
    return values;
  });

  let lastDateParam = $state<string | null>(null);
  let lastEntryParam = $state<string | null>(null);
  $effect(() => {
    const requested = page.url.searchParams.get('date');
    if (requested === lastDateParam || !requested || !/^\d{4}-\d{2}-\d{2}$/.test(requested)) return;
    lastDateParam = requested;
    const requestedWeek = mondayFor(requested);
    const currentWeek = mondayFor(today);
    weekOffset = Math.round(
      (Date.parse(`${requestedWeek}T00:00:00Z`) - Date.parse(`${currentWeek}T00:00:00Z`)) /
        (7 * 86_400_000)
    );
  });

  $effect(() => {
    const requested = page.url.searchParams.get('entry');
    if (requested === lastEntryParam || !requested || !slots.some((slot) => slot.key === requested)) return;
    lastEntryParam = requested;
    selectedKey = requested;
  });

  // The employees to show: everyone with any planned or recorded time this week,
  // narrowed to those with an issue when the filter is on.
  type GridRow = {
    id: string;
    name: string;
    worked: number;
    planned: number;
    attention: boolean;
    positionId: string;
    position: string;
    contract: string;
  };

  const gridRows = $derived.by(() => {
    const byId = new Map<string, GridRow>();
    const contractTypeName = new Map(
      (snapshot?.contract_types ?? []).map((contract) => [contract.id, contract.name])
    );
    for (const slot of slots) {
      if (!isTimesheetRow(slot)) continue;
      const primaryPositionId = employeePosition.get(slot.employeeId) ?? '';
      const contract = (snapshot?.employee_contracts ?? []).find(
        (item) => item.employee_id === slot.employeeId && item.active && item.is_current
      );
      const row = byId.get(slot.employeeId) ?? {
        id: slot.employeeId,
        name: slot.employeeName,
        worked: 0,
        planned: 0,
        attention: false,
        positionId: primaryPositionId,
        position: positionName.get(primaryPositionId) ?? t('No position'),
        contract: contractTypeName.get(contract?.contract_type_id ?? '') ?? t('No contract')
      };
      row.worked += slot.actualHours;
      if (slot.truth.plan) {
        row.planned += hoursBetweenClocks(slot.truth.plan.startsAt, slot.truth.plan.endsAt);
      }
      if (needsAttention(slot)) row.attention = true;
      byId.set(slot.employeeId, row);
    }
    const needle = search.trim().toLocaleLowerCase(i18n.intlLocale);
    return [...byId.values()]
      .filter((row) => !onlyIssues || row.attention)
      .filter((row) => !needle || row.name.toLocaleLowerCase(i18n.intlLocale).includes(needle))
      .filter((row) => !positionId || row.positionId === positionId)
      .sort((left, right) => {
        const compared = left.name.localeCompare(right.name);
        return employeeSort === 'desc' ? -compared : compared;
      });
  });

  function cellSlots(employeeId: string, date: string): ActualSlot[] {
    return serviceKeys
      .map((service) => slotByKey.get(`${employeeId}|${date}|${service}`))
      .filter((slot): slot is ActualSlot => Boolean(slot && isTimesheetRow(slot)));
  }

  function timesheetRosterFile(): PreparedExport {
    const employeeIds = Array.from(
      new Set(slots.filter(isTimesheetRow).map((slot) => slot.employeeId))
    );
    const rows = employeeIds
      .map((employeeId) => {
        const employeeSlots = slots.filter(
          (slot) => slot.employeeId === employeeId && isTimesheetRow(slot)
        );
        const name = employeeSlots[0]?.employeeName ?? t('Unknown employee');
        const cells = weekDates.map((date) =>
          employeeSlots
            .filter((slot) => slot.date === date)
            .map((slot) => {
              const range = slot.actualRange || slot.plannedRange || t(slot.status);
              const planned =
                slot.actualRange && slot.plannedRange && slot.actualRange !== slot.plannedRange
                  ? `\n${t('Planned')} ${slot.plannedRange}`
                  : '';
              const assignment = [
                areaName.get(slot.actualAreaId) ?? '',
                positionName.get(slot.actualJobFunctionId) ?? ''
              ].filter(Boolean).join(' · ');
              return `${range}${planned}${assignment ? `\n${assignment}` : ''}`;
            })
            .join('\n')
        );
        const total = employeeSlots.reduce((sum, slot) => sum + slot.actualHours, 0);
        return [name, ...cells, formatHours(total)];
      })
      .toSorted((left, right) => String(left[0]).localeCompare(String(right[0])));
    return {
      filename: `time-roster-${activeWeek}.xlsx`,
      title: t('Time roster'),
      periodLabel: weekLabel(activeWeek, i18n.intlLocale),
      headers: [
        t('Employee'),
        ...weekDates.map((date) => weekdayDateLabel(date, i18n.intlLocale)),
        t('Total')
      ],
      rows
    };
  }

  const mobileDayIndex = $derived(Math.max(0, weekDates.indexOf(mobileDate)));
  const mobileRows = $derived(
    gridRows
      .map((row) => ({ row, slots: cellSlots(row.id, mobileDate) }))
      .filter((item) => item.slots.length > 0)
  );

  function groupedRows(rows: GridRow[]): { key: string; label: string; rows: GridRow[] }[] {
    if (groupMode === 'none') return [{ key: 'all', label: '', rows }];
    const grouped = new Map<string, { key: string; label: string; rows: GridRow[] }>();
    for (const row of rows) {
      const label =
        groupMode === 'contract'
          ? row.contract
          : groupMode === 'position'
            ? row.position
            : row.attention
              ? t('Needs review')
              : t('Ready');
      const key = `${groupMode}:${label}`;
      const group = grouped.get(key) ?? { key, label, rows: [] };
      group.rows.push(row);
      grouped.set(key, group);
    }
    return [...grouped.values()].sort((left, right) => left.label.localeCompare(right.label));
  }

  function setGroupMode(value: GroupMode): void {
    groupMode = value;
    collapsedGroups = [];
  }

  function toggleGroup(key: string): void {
    collapsedGroups = collapsedGroups.includes(key)
      ? collapsedGroups.filter((item) => item !== key)
      : [...collapsedGroups, key];
  }

  function openWeekPicker(): void {
    weekPicker?.showPicker?.();
  }

  // A live clock-in is the only hard server-side block; everything else is a
  // warning the manager can confirm, so it is listed rather than hidden.
  const approveWarnings = $derived(
    [
      totals.conflicts ? t('{count} worked-time conflicts', { count: totals.conflicts }) : '',
      totals.missing ? t('{count} missing badge-outs', { count: totals.missing }) : '',
      activeWeek >= mondayFor(today) ? t('The week has not finished yet') : ''
    ].filter(Boolean)
  );
  const approveBlocked = $derived(totals.live > 0);

  function selectEntry(key: string): void {
    if (key === selectedKey) return;
    void unsavedChanges.runOrRequest(() => {
      selectedKey = key;
    });
  }

  function openWeekAction(action: 'approve_week' | 'reopen_week') {
    weekAction = action;
    weekReason = '';
    weekDialogOpen = true;
  }

  async function confirmWeekAction() {
    if (!workspace.activeId || saving) return;
    if (weekReason.trim().length < 3) {
      toasts.show(t('Enter a reason for this week lifecycle change.'), 'warning');
      return;
    }
    saving = true;
    try {
      await setTimesheetWeekStatus({
        restaurantId: workspace.activeId,
        weekStart: activeWeek,
        action: weekAction,
        expectedRevision: Number(workWeek?.actuals_revision ?? 0),
        reason: weekReason.trim(),
        allowWarnings: approveWarnings.length > 0
      });
      weekDialogOpen = false;
      toasts.show(
        weekAction === 'approve_week' ? t('Timesheet week approved.') : t('Timesheet week reopened.'),
        'success'
      );
    } catch (error) {
      toasts.show(friendlyError(error), 'danger');
    } finally {
      saving = false;
    }
  }

</script>

<svelte:head><title>{t('Time')} &middot; restogogo</title></svelte:head>

<WorkspacePage>
  <section class="timesheet-panel" class:is-compact={compactCards}>
    <header class="timesheet-head">
      <div class="timesheet-head__left">
        <label class="detail-switch" title={t(compactCards ? 'Show detailed cards' : 'Show compact cards')}>
          <span>{t('Details')}</span>
          <input
            type="checkbox"
            role="switch"
            checked={!compactCards}
            aria-label={t('Show detailed time information')}
            onchange={toggleCardDensity}
          />
          <i aria-hidden="true"><b></b></i>
        </label>
      </div>

      <div class="week-nav" aria-label={t('Week')}>
        <button class="icon-btn" type="button" aria-label={t('Previous')} onclick={() => (weekOffset -= 1)}>
          <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m15 6-6 6 6 6" /></svg>
        </button>
        <button class="week-nav__date" type="button" onclick={openWeekPicker}>
          <span>{weekLabel(activeWeek, i18n.intlLocale)}</span>
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 2v3M18 2v3M3 9h18"/><rect x="3" y="4" width="18" height="17" rx="2"/></svg>
        </button>
        <input
          class="week-nav__picker"
          bind:this={weekPicker}
          type="date"
          value={activeWeek}
          aria-label={t('Choose week')}
          onchange={(event) => {
            const requestedWeek = mondayFor(event.currentTarget.value);
            const currentWeek = mondayFor(today);
            weekOffset = Math.round(
              (Date.parse(`${requestedWeek}T00:00:00Z`) - Date.parse(`${currentWeek}T00:00:00Z`)) /
                (7 * 86_400_000)
            );
          }}
        />
        <button class="icon-btn" type="button" aria-label={t('Next')} onclick={() => (weekOffset += 1)}>
          <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m9 6 6 6-6 6" /></svg>
        </button>
      </div>

      <div class="timesheet-head__right">
        <button class="icon-btn export-btn" type="button" aria-label={t('Export roster')} title={t('Export roster')} onclick={() => (exportOpen = true)}>
          <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3v12M7 10l5 5 5-5"/><path d="M5 21h14"/></svg>
        </button>
        <span class="weekpill is-{weekStatus}">
          <span class="weekpill__dot"></span>
          {t(weekStatus === 'open' ? 'Open' : weekStatus === 'approved' ? 'Approved' : 'Locked')}
        </span>
        {#if weekStatus === 'open'}
          <button class="approve-btn" type="button" disabled={!editable} onclick={() => openWeekAction('approve_week')}>
            {t('Approve week')}
          </button>
        {:else}
          <button class="approve-btn is-reopen" type="button" disabled={workspace.isPreview} onclick={() => openWeekAction('reopen_week')}>
            {t('Reopen week')}
          </button>
        {/if}
      </div>
    </header>

    <section class="mobile-timesheet" aria-label={t('Daily timesheet')}>
      <WorkspaceMobileDayPicker
        {days}
        selected={mobileDate}
        tone="time"
        onselect={(date) => (mobileDate = date)}
      />

      <div class="mobile-day-summary">
        <span><b>{dayEmployees[mobileDayIndex]}</b>{t('people')}</span>
        <span><b>{formatHours(dayPlanned[mobileDayIndex])}</b>{t('planned')}</span>
        <span><b>{formatHours(dayWorked[mobileDayIndex])}</b>{t('worked')}</span>
        <span class:is-problem={dayIssues[mobileDayIndex] > 0}>
          <b>{dayIssues[mobileDayIndex]}</b>{t('issues')}
        </span>
      </div>

      <label class="mobile-search">
        <span>{t('Find employee')}</span>
        <input class="cl-field" type="search" bind:value={search} placeholder={t('Search by name')} />
      </label>

      <div class="mobile-attendance-list">
        {#if mobileRows.length}
          {#each mobileRows as item (item.row.id)}
            {@const rowNeedsReview = item.slots.some((slot) => needsAttention(slot))}
            <article class="mobile-attendance" class:needs-review={rowNeedsReview}>
              <header>
                <span class="cl-avatar" style="--avatar-color:{employeeColor.get(item.row.id) ?? 'var(--cl-muted)'}">{personInitials(item.row.name)}</span>
                <span>
                  <strong>{item.row.name}</strong>
                  <small>{item.row.position}</small>
                </span>
                <em class:is-ready={!rowNeedsReview}>{t(rowNeedsReview ? 'Review' : 'Ready')}</em>
              </header>
              <TimesheetDayCard slots={item.slots} {areaName} {areaColor} {positionName} services={snapshot?.services ?? []} onopen={selectEntry} />
            </article>
          {/each}
        {:else}
          <div class="cl-empty">
            <strong>{t(search ? 'No employees match these filters' : onlyIssues ? 'Nothing to review' : 'No recorded time on this day')}</strong>
            <span>{t('Badge entries and planned shifts appear here as the day runs.')}</span>
          </div>
        {/if}
      </div>
    </section>

    <div class="timesheet-wrap">
      <table class="board">
        <thead>
          <tr>
            <th class="board__staff has-menu">
              <WorkspacePrimaryColMenu
                label={`${gridRows.length}`}
                labelIcon="people"
                meta={`${formatHours(totals.plannedHours)} → ${formatHours(totals.actualHours)}`}
                align="center"
                sortable
                sortDir={employeeSort}
                onsort={(dir) => (employeeSort = dir)}
                filterKind="text"
                searchValue={search}
                onsearch={(value) => (search = value)}
                extraActive={Boolean(positionId)}
                groupValue={groupMode}
                groupOptions={[
                  { value: 'none', label: t('No grouping') },
                  { value: 'contract', label: t('Contract type') },
                  { value: 'position', label: t('Position') },
                  { value: 'status', label: t('Review status') }
                ]}
                ongroupchange={(value) => setGroupMode(value as GroupMode)}
              >
                {#snippet extra()}
                  <label>
                    <span>{t('Position')}</span>
                    <select class="cl-field" bind:value={positionId}>
                      <option value="">{t('All positions')}</option>
                      {#each snapshot?.job_functions.filter((item) => item.active).toSorted((left, right) => left.name.localeCompare(right.name)) ?? [] as position (position.id)}
                        <option value={position.id}>{position.name}</option>
                      {/each}
                    </select>
                  </label>
                  <label class="check"><input type="checkbox" bind:checked={onlyIssues} />{t('Only rows needing attention')}</label>
                {/snippet}
              </WorkspacePrimaryColMenu>
            </th>
            {#each days as day, index (day.date)}
              <th class="board__day" class:is-today={day.today} class:is-past={day.past} class:is-weekend={index >= 5}>
                <div class="board__day-date"><b>{t(day.label)}</b> {Number(day.date.slice(-2))}</div>
                <div class="board__day-lower">
                  <span class="board__day-people">
                    <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><circle cx="9" cy="8" r="3"/><path d="M3.5 19c.4-3.2 2.2-5 5.5-5s5.1 1.8 5.5 5M16 5.5a3 3 0 0 1 0 5.8M16 14c2.8.2 4.2 1.8 4.5 4.5"/></svg>
                    {dayEmployees[index]}
                  </span>
                  <b class="board__day-hours">{formatHours(dayPlanned[index])} → <em>{formatHours(dayWorked[index])}</em></b>
                  <small class:is-problem={dayIssues[index] > 0}>{dayIssues[index] ? t('{count} issues', { count: dayIssues[index] }) : t('Ready')}</small>
                </div>
              </th>
            {/each}
          </tr>
        </thead>
        {#if !gridRows.length}
          <tbody><tr><td colspan={days.length + 1}><div class="cl-empty"><strong>{t(search || positionId ? 'No employees match these filters' : onlyIssues ? 'Nothing to review' : 'No recorded time this week')}</strong><span>{t('Badge entries and planned shifts appear here as the week runs.')}</span></div></td></tr></tbody>
        {:else}
          {#each groupedRows(gridRows) as group (group.key)}
            <tbody>
              {#if groupMode !== 'none'}
                <WorkspaceGroupRow
                  colspan={days.length + 1}
                  label={group.label}
                  meta={`${group.rows.length} · ${formatHours(group.rows.reduce((sum, row) => sum + row.worked, 0))}`}
                  liveColumn={days.some((day) => day.today)
                    ? days.findIndex((day) => day.today) + 1
                    : -1}
                  collapsed={collapsedGroups.includes(group.key)}
                  ontoggle={() => toggleGroup(group.key)}
                />
              {/if}
              {#if !collapsedGroups.includes(group.key)}
                {#each group.rows as row (row.id)}
                  {@const target = contractHours.get(row.id) ?? 0}
                  {@const completion = row.planned ? Math.min(100, (row.worked / row.planned) * 100) : 0}
                  <tr class:is-hours-over={row.planned > 0 && row.worked > row.planned + 0.01}>
                    <td class="board__staff">
                      <span class="staff">
                        <span class="cl-avatar" style="--avatar-color:{employeeColor.get(row.id) ?? 'var(--cl-muted)'}">{personInitials(row.name)}</span>
                        <span class="staff__id">
                          <span class="staff__name">
                            <strong>{row.name}</strong>
                            {#if row.attention}
                              <i class="staff__attention" role="img" aria-label={t('Needs review')} title={t('Needs review')}></i>
                            {/if}
                          </span>
                          <span class="staff__hours"><span>{formatHours(row.planned)}</span><i>→</i><b>{formatHours(row.worked)}</b>{#if target}<em>{formatHours(target)} {t('contract')}</em>{/if}</span>
                          {#if row.planned}<span class="staff__meter" class:is-complete={row.worked >= row.planned - 0.01} class:is-over={row.worked > row.planned + 0.01}><i style={`width:${completion}%`}></i></span>{/if}
                        </span>
                      </span>
                    </td>
                    {#each days as day (day.date)}
                      {@const daySlots = cellSlots(row.id, day.date)}
                      <td class="board__cell" class:is-today={day.today} class:is-past={day.past}>
                        {#if daySlots.length}<TimesheetDayCard slots={daySlots} {areaName} {areaColor} {positionName} services={snapshot?.services ?? []} compact={compactCards} onopen={selectEntry} />{/if}
                      </td>
                    {/each}
                  </tr>
                {/each}
              {/if}
            </tbody>
          {/each}
        {/if}
      </table>
    </div>
  </section>
</WorkspacePage>

<RosterExportDialog
  open={exportOpen}
  file={timesheetRosterFile()}
  onclose={() => (exportOpen = false)}
/>

<TimesheetEntryDialog
  slot={selectedSlot}
  {snapshot}
  {timezone}
  {editable}
  onclose={() => (selectedKey = '')}
/>

{#snippet weekFooter()}
  <ActionButton label={t('Cancel')} disabled={saving} onclick={() => (weekDialogOpen = false)} />
  <ActionButton
    label={saving
      ? t('Saving…')
      : weekAction === 'reopen_week'
        ? t('Reopen week')
        : approveWarnings.length
          ? t('Approve anyway')
          : t('Approve week')}
    tone="primary"
    disabled={saving || (weekAction === 'approve_week' && approveBlocked)}
    onclick={confirmWeekAction}
  />
{/snippet}

<Dialog
  open={weekDialogOpen}
  title={weekAction === 'approve_week' ? t('Approve payroll week') : t('Reopen payroll week')}
  description={weekAction === 'approve_week'
    ? t('Approval closes manager editing until the week is deliberately reopened.')
    : t('Reopening returns the week to manager editing and records who did it.')}
  size="small"
  onclose={() => !saving && (weekDialogOpen = false)}
  footer={weekFooter}
>
  <div class="weekform">
    {#if weekAction === 'approve_week' && approveBlocked}
      <p class="weekform__blocked">
        {t('Someone is still clocked in. Approval waits until the live badge is closed.')}
      </p>
    {:else if weekAction === 'approve_week' && approveWarnings.length}
      <div class="weekform__warnings">
        <strong>{t('You are approving with:')}</strong>
        <ul>
          {#each approveWarnings as warning (warning)}<li>{warning}</li>{/each}
        </ul>
      </div>
    {/if}
    <label class="cl-label">
      <span>{t('Reason')}</span>
      <input class="cl-field" bind:value={weekReason} />
    </label>
  </div>
</Dialog>

<style>
  .weekbar {
    min-height: 40px;
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 10px;
    padding: 5px 7px;
    border: 1px solid var(--cl-line);
    border-radius: var(--cl-radius-surface);
    background: var(--cl-surface);
  }
  .weekpill {
    display: inline-flex;
    align-items: center;
    gap: 7px;
    padding: 4px 11px;
    border: 1px solid var(--cl-line);
    border-radius: 999px;
    color: var(--cl-muted);
    font-size: 13px;
    font-weight: var(--rst-fw-bold);
  }
  .weekpill__dot {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: var(--cl-line-strong);
  }
  .weekpill.is-open { color: var(--cl-attention); border-color: var(--cl-attention-line); background: var(--cl-attention-wash); }
  .weekpill.is-open .weekpill__dot { background: var(--cl-attention); }
  .weekpill.is-approved, .weekpill.is-locked { color: var(--cl-ok); border-color: var(--cl-ok-line); background: var(--cl-ok-wash); }
  .weekpill.is-approved .weekpill__dot, .weekpill.is-locked .weekpill__dot { background: var(--cl-ok); }
  .weekform {
    display: grid;
    gap: 14px;
  }
  .weekform__blocked {
    margin: 0;
    font-size: 14px;
    font-weight: var(--rst-fw-bold);
  }
  .weekform__warnings {
    display: grid;
    gap: 6px;
    font-size: 14px;
  }
  .weekform__warnings ul {
    margin: 0;
    padding-left: 20px;
    color: var(--cl-muted);
    line-height: 1.6;
  }

  /* Shared workspace shell: the same weekly hierarchy used by Schedule. */
  .timesheet-panel { position: relative; display: grid; gap: 0; }
  .timesheet-head {
    position: relative;
    display: grid;
    grid-template-columns: minmax(180px, 1fr) auto minmax(250px, 1fr);
    align-items: center;
    gap: 18px;
    min-height: 50px;
    padding: 4px 0 6px;
  }
  .timesheet-head__left { justify-self: start; display: flex; align-items: center; }
  .timesheet-head__right { justify-self: end; display: flex; align-items: center; gap: 7px; }
  .week-nav {
    position: relative;
    display: flex;
    align-items: stretch;
    justify-content: center;
    gap: 0;
    overflow: hidden;
    border: 1px solid var(--cl-line-strong);
    border-radius: 6px;
    background: var(--cl-surface);
    box-shadow: 0 1px 2px rgb(15 23 42 / .035);
  }
  .week-nav__date {
    min-width: 176px;
    min-height: 34px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 7px;
    padding: 4px 12px;
    border: 0;
    border-right: 1px solid var(--cl-line);
    border-left: 1px solid var(--cl-line);
    background: var(--cl-surface);
    color: var(--cl-ink);
    font: inherit;
    font-size: 13px;
    font-weight: var(--rst-fw-bold);
    cursor: pointer;
  }
  .week-nav__date:hover { background: var(--cl-surface-muted); }
  .week-nav__date svg { color: var(--cl-muted); }
  .week-nav__picker { position: absolute; width: 1px; height: 1px; opacity: 0; pointer-events: none; }
  .icon-btn {
    width: 34px;
    height: 34px;
    display: grid;
    place-items: center;
    padding: 0;
    border: 0;
    background: var(--cl-surface);
    color: var(--cl-muted);
    cursor: pointer;
  }
  .icon-btn:hover { color: var(--cl-ink); background: var(--cl-surface-muted); }
  .export-btn {
    border: 1px solid var(--cl-line-strong);
    border-radius: 6px;
  }
  .detail-switch {
    min-height: 30px;
    display: inline-flex;
    align-items: center;
    gap: 8px;
    color: var(--cl-muted);
    font-size: 11.5px;
    font-weight: var(--rst-fw-bold);
    cursor: pointer;
    user-select: none;
  }
  .detail-switch input { position: absolute; width: 1px; height: 1px; opacity: 0; pointer-events: none; }
  .detail-switch > i {
    width: 32px;
    height: 18px;
    position: relative;
    flex: 0 0 auto;
    border: 1px solid var(--cl-line-strong);
    border-radius: 999px;
    background: var(--cl-surface-muted);
  }
  .detail-switch > i b {
    width: 12px;
    height: 12px;
    position: absolute;
    top: 2px;
    left: 2px;
    border-radius: 50%;
    background: var(--cl-muted);
    box-shadow: 0 1px 2px rgb(15 23 42 / .2);
    transition: transform var(--cl-dur) var(--cl-ease), background var(--cl-dur) var(--cl-ease);
  }
  .detail-switch input:checked + i { border-color: color-mix(in srgb, var(--cl-accent) 54%, var(--cl-line)); background: color-mix(in srgb, var(--cl-accent) 18%, var(--cl-surface)); }
  .detail-switch input:checked + i b { background: var(--cl-accent); transform: translateX(14px); }
  .approve-btn {
    min-height: 36px;
    padding: 7px 15px;
    border: 1px solid var(--cl-accent);
    border-radius: 6px;
    background: var(--cl-accent);
    color: white;
    font: inherit;
    font-size: 13px;
    font-weight: var(--rst-fw-bold);
    cursor: pointer;
  }
  .approve-btn.is-reopen { border-color: var(--cl-line-strong); background: var(--cl-surface); color: var(--cl-ink); }
  .approve-btn:disabled { opacity: .45; cursor: default; }
  .weekpill { min-height: 30px; padding: 4px 10px; font-size: 10.5px; }

  .timesheet-wrap {
    max-height: calc(100vh - 188px);
    overflow: auto;
    border: 1px solid color-mix(in srgb, var(--cl-ink) 12%, var(--cl-line-strong));
    border-radius: 5px;
    background: var(--cl-surface);
    box-shadow: 0 1px 2px rgb(0 0 0 / .035);
  }
  .timesheet-wrap .board {
    width: 100%;
    min-width: 860px;
    border-spacing: 0;
    table-layout: fixed;
    border-collapse: separate;
    color: var(--cl-ink);
    font-size: 13px;
  }
  .timesheet-wrap .board thead { position: sticky; top: 0; z-index: 8; }
  .timesheet-wrap .board th {
    height: 66px;
    padding: 5px 9px;
    border-bottom: 1px solid color-mix(in srgb, var(--cl-accent) 65%, var(--cl-line));
    background: var(--cl-thead);
  }
  .timesheet-wrap .board th.has-menu { padding: 0; }
  .timesheet-wrap .board td {
    height: 90px;
    padding: 0;
    border-bottom: 1px solid color-mix(in srgb, var(--cl-ink) 14%, var(--cl-grid-line));
    background: var(--cl-surface);
    vertical-align: middle;
  }
  .timesheet-wrap .board__staff {
    width: 180px;
    position: sticky;
    left: 0;
    z-index: 4;
    border-right: 1px solid var(--cl-grid-line);
    background: var(--cl-surface) !important;
  }
  .timesheet-wrap thead .board__staff { z-index: 10; background: var(--cl-thead) !important; }
  .timesheet-wrap thead .board__staff :global(.cl-primary-head) { position: relative; }
  .timesheet-wrap thead .board__staff :global(.cl-primary-head > .colhead) { width: 100%; padding-inline: 0; }
  .timesheet-wrap thead .board__staff :global(.colhead__label) { justify-content: center; padding-inline: 0; }
  .timesheet-wrap thead .board__staff :global(.colhead__copy) { width: auto; justify-items: center; }
  .timesheet-wrap thead .board__staff :global(.colhead__meta) { width: auto; justify-content: center; }
  .timesheet-wrap thead .board__staff :global(.colhead__trigger) { position: absolute; top: 50%; right: 31px; transform: translateY(-50%); }
  .timesheet-wrap thead .board__staff :global(.groupmenu) { position: absolute; top: 0; right: 0; bottom: 0; padding-right: 6px; }
  .timesheet-wrap .board__day { position: relative; border-left: 1px solid var(--cl-grid-line); text-align: center; }
  .board__day-date { color: var(--cl-ink); font-size: 12px; line-height: 1.05; white-space: nowrap; }
  .board__day-lower {
    min-height: 38px;
    display: grid;
    grid-template-columns: 1fr 1fr;
    grid-template-rows: 22px 12px;
    align-items: center;
    margin-top: 2px;
    color: var(--cl-muted);
    font-size: 8.5px;
    font-variant-numeric: tabular-nums;
  }
  .board__day-people { display: inline-flex; align-items: center; justify-content: center; gap: 3px; }
  .board__day-hours { color: color-mix(in srgb, var(--cl-ink) 74%, var(--cl-muted)); font-size: 8.5px; }
  .board__day-hours em { color: var(--cl-ok); font-style: normal; }
  .board__day-lower small { grid-column: 1 / -1; color: var(--cl-ok); font-size: 8px; }
  .board__day-lower small.is-problem { color: var(--cl-problem); }
  .timesheet-wrap .board__day.is-today { color: var(--cl-accent); background: color-mix(in srgb, var(--cl-accent) 10%, var(--cl-thead)); }
  .timesheet-wrap .board__day.is-today::before,
  .timesheet-wrap .board__cell.is-today::before {
    content: '';
    position: absolute;
    z-index: 12;
    top: 0;
    bottom: 0;
    left: 0;
    width: var(--cl-live-marker-width);
    background: var(--cl-live-marker);
    box-shadow: 0 0 3px color-mix(in srgb, var(--cl-live-marker) 34%, transparent);
    pointer-events: none;
  }
  .timesheet-wrap .board__day.is-past:not(.is-today) {
    background-color: color-mix(in srgb, var(--cl-surface-muted) 68%, var(--cl-thead));
    background-image: repeating-linear-gradient(
      135deg,
      transparent 0 8px,
      color-mix(in srgb, var(--cl-muted) 7%, transparent) 8px 9px
    );
  }
  .timesheet-wrap .board__day.is-weekend:not(.is-today) { background: color-mix(in srgb, var(--cl-surface-muted) 58%, var(--cl-thead)); }
  .timesheet-wrap .board__cell { position: relative; border-left: 1px solid var(--cl-grid-line); vertical-align: top; }
  .timesheet-wrap .board__cell.is-past {
    background-color: color-mix(in srgb, var(--cl-surface-muted) 68%, var(--cl-surface));
  }
  .timesheet-wrap .board__cell.is-past::after {
    content: '';
    position: absolute;
    z-index: 6;
    inset: 0;
    pointer-events: none;
    background-image: repeating-linear-gradient(
      135deg,
      transparent 0 8px,
      color-mix(in srgb, var(--cl-muted) 9%, transparent) 8px 9px
    );
  }
  .timesheet-panel.is-compact .timesheet-wrap .board td { height: 70px; }
  .timesheet-wrap .staff { display: flex; align-items: center; gap: 10px; padding: 10px 14px; }
  .timesheet-wrap .staff__id { min-width: 0; flex: 1; display: grid; gap: 3px; }
  .staff__name { min-width: 0; display: flex; align-items: center; gap: 7px; }
  .staff__name strong { overflow: hidden; font-size: 13px; text-overflow: ellipsis; white-space: nowrap; }
  .staff__attention { width: 7px; height: 7px; flex: 0 0 auto; border-radius: 50%; background: var(--cl-problem); box-shadow: 0 0 0 3px var(--cl-problem-wash); }
  .timesheet-wrap .staff__hours { display: flex; align-items: baseline; gap: 5px; color: var(--cl-muted); font-size: 10.5px; }
  .timesheet-wrap .staff__hours i { color: var(--cl-line-strong); font-style: normal; }
  .timesheet-wrap .staff__hours b { color: var(--cl-ok); }
  .timesheet-wrap .staff__hours em { margin-left: auto; color: var(--cl-muted); font-size: 8.5px; font-style: normal; }
  .staff__meter { width: 100%; height: 4px; overflow: hidden; border-radius: 999px; background: var(--cl-line); }
  .staff__meter > i { display: block; height: 100%; border-radius: inherit; background: var(--cl-info); }
  .staff__meter.is-complete > i { background: var(--cl-ok); }
  .staff__meter.is-over > i { background: var(--cl-problem); }
  .timesheet-wrap tr.is-hours-over > td.board__staff { background: color-mix(in srgb, var(--cl-problem) 3%, var(--cl-surface)) !important; }
  .mobile-timesheet { display: none; }

  @media (max-width: 980px) {
    .timesheet-head { grid-template-columns: 1fr auto; }
    .week-nav { grid-column: 1 / -1; grid-row: 1; }
    .timesheet-head__left, .timesheet-head__right { grid-row: 2; }
  }
  @media (max-width: 760px) {
    .timesheet-wrap { display: none; }

    .mobile-timesheet {
      display: grid;
      gap: 10px;
      min-width: 0;
    }

    .mobile-day-summary {
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      overflow: hidden;
      border: 1px solid var(--cl-line);
      border-radius: var(--cl-radius);
      background: var(--cl-surface);
    }
    .mobile-day-summary > span {
      min-width: 0;
      display: grid;
      gap: 1px;
      padding: 9px 8px;
      border-right: 1px solid var(--cl-grid-line);
      color: var(--cl-muted);
      font-size: 9px;
      white-space: nowrap;
    }
    .mobile-day-summary > span:last-child { border-right: 0; }
    .mobile-day-summary b {
      color: var(--cl-ink);
      font-size: 12px;
      font-weight: var(--rst-fw-bold);
      font-variant-numeric: tabular-nums;
    }
    .mobile-day-summary .is-problem b { color: var(--cl-problem); }

    .mobile-search {
      display: grid;
      gap: 4px;
    }
    .mobile-search > span {
      color: var(--cl-muted);
      font-size: 10px;
      font-weight: var(--rst-fw-bold);
      text-transform: uppercase;
    }

    .mobile-attendance-list {
      display: grid;
      gap: 9px;
    }
    .mobile-attendance {
      min-width: 0;
      display: grid;
      overflow: hidden;
      border-radius: var(--cl-radius);
    }
    .mobile-attendance > header {
      min-width: 0;
      display: grid;
      grid-template-columns: 30px minmax(0, 1fr) auto;
      align-items: center;
      gap: 9px;
      padding: 9px 10px 8px;
      border: 1px solid var(--cl-line);
      border-bottom: 0;
      border-radius: var(--cl-radius) var(--cl-radius) 0 0;
      background: var(--cl-surface);
    }
    .mobile-attendance.needs-review > header {
      box-shadow: inset 3px 0 0 var(--cl-problem);
    }
    .mobile-attendance > header > span:nth-child(2) {
      min-width: 0;
      display: grid;
    }
    .mobile-attendance > header strong {
      overflow: hidden;
      color: var(--cl-ink);
      font-size: 12.5px;
      font-weight: var(--rst-fw-bold);
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .mobile-attendance > header small {
      overflow: hidden;
      color: var(--cl-muted);
      font-size: 10px;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .mobile-attendance > header em {
      padding: 3px 6px;
      border: 1px solid var(--cl-problem-line);
      border-radius: 5px;
      background: var(--cl-problem-wash);
      color: var(--cl-problem);
      font-size: 9px;
      font-style: normal;
      font-weight: var(--rst-fw-bold);
      text-transform: uppercase;
    }
    .mobile-attendance > header em.is-ready {
      border-color: var(--cl-ok-line);
      background: var(--cl-ok-wash);
      color: var(--cl-ok);
    }
    .mobile-attendance :global(.attendance-card) {
      width: 100%;
      min-height: 86px;
      margin: 0;
      border-radius: 0 0 var(--cl-radius) var(--cl-radius);
    }
  }
</style>
