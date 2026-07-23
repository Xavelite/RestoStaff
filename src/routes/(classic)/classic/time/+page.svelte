<script lang="ts">
  import {
    addDays,
    dateForWeekday,
    formatHours,
    mondayFor,
    serviceLabel,
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
  import { friendlyError } from '$lib/api/error-messages';
  import { i18n, t } from '$lib/i18n/i18n.svelte';
  import { getBadgeProofUrl } from '$lib/api/mutations';
  import { toasts } from '$lib/ui/toast.svelte';
  import { workspace } from '$lib/workspace/workspace.svelte';
  import TimesheetEntryEditor from '$lib/timesheet/TimesheetEntryEditor.svelte';
  import {
    cancelTimesheetEntry,
    resolveTimesheetLeave,
    saveTimesheetEntry,
    setTimesheetWeekStatus,
    type TimesheetEntryValues
  } from '$lib/timesheet/timesheet-actions';
  import {
    actualSlotsForDate,
    actualsStatusForWeek,
    actualsWeekTotals,
    type ActualSlot
  } from '$lib/timesheet/timesheet-model';
  import ClassicPage from '$lib/classic/ClassicPage.svelte';
  import ClassicPeriodNav from '$lib/classic/ClassicPeriodNav.svelte';
  import ClassicStat from '$lib/classic/ClassicStat.svelte';
  import { isTimesheetRow, needsAttention, slotLabel } from '$lib/classic/classic-time';

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

  $effect(() => {
    if (workspace.activeId && role && role !== 'employee') {
      void workspace.loadOperations(activeWeek, addDays(activeWeek, 6)).catch(() => undefined);
    }
  });

  let onlyIssues = $state(false);
  let selectedKey = $state('');
  let saving = $state(false);
  let weekDialogOpen = $state(false);
  let weekAction = $state<'approve_week' | 'reopen_week'>('approve_week');
  let weekReason = $state('');

  const weekDates = $derived(
    Array.from({ length: 7 }, (_, index) => dateForWeekday(activeWeek, index + 1))
  );
  const slots = $derived(
    snapshot
      ? weekDates.flatMap((date) => actualSlotsForDate(snapshot, date, today, currentInstant))
      : []
  );
  // One row per planned or recorded service. A flat, sortable list reads more
  // plainly than a grid, and every row is the thing you would open anyway.
  const rows = $derived(
    slots
      .filter(isTimesheetRow)
      .filter((slot) => !onlyIssues || needsAttention(slot))
      .sort(
        (left, right) =>
          left.date.localeCompare(right.date) ||
          left.employeeName.localeCompare(right.employeeName) ||
          left.serviceKey.localeCompare(right.serviceKey)
      )
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
      ? buildEmployeeColorMap(snapshot.job_functions, snapshot.employee_job_functions)
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
  // The employees to show: everyone with any planned or recorded time this week,
  // narrowed to those with an issue when the filter is on.
  const gridRows = $derived.by(() => {
    const byId = new Map<string, { id: string; name: string; worked: number; attention: boolean }>();
    for (const slot of slots) {
      if (!isTimesheetRow(slot)) continue;
      const row = byId.get(slot.employeeId) ?? {
        id: slot.employeeId,
        name: slot.employeeName,
        worked: 0,
        attention: false
      };
      row.worked += slot.actualHours;
      if (needsAttention(slot)) row.attention = true;
      byId.set(slot.employeeId, row);
    }
    return [...byId.values()]
      .filter((row) => !onlyIssues || row.attention)
      .sort((left, right) => left.name.localeCompare(right.name));
  });

  const SERVICES: ServiceKey[] = ['lunch', 'evening'];

  type CellChip = { key: string; kind: string; text: string; sub: string; live: boolean };

  // What a timesheet cell shows: worked time in green, an issue in red/amber, a
  // day off in violet, an as-yet-unworked planned shift in neutral. Colour here
  // is the badge status, not the service.
  function cellChips(employeeId: string, date: string): CellChip[] {
    return SERVICES.flatMap((service) => {
      const slot = slotByKey.get(`${employeeId}|${date}|${service}`);
      if (!slot || !isTimesheetRow(slot)) return [];
      const kind =
        slot.status === 'recorded' || slot.status === 'adjusted' || slot.status === 'live'
          ? 'worked'
          : slot.status === 'missing' || slot.status === 'conflict'
            ? 'issue'
            : slot.status === 'pending'
              ? 'pending'
              : slot.status === 'absence'
                ? 'off'
                : slot.status === 'unavailable'
                  ? 'muted'
                  : 'planned';
      const worked = slot.actualRange || '';
      const text =
        kind === 'worked' && worked
          ? worked
          : kind === 'issue' && slot.status === 'missing'
            ? t('Missing badge')
            : kind === 'off'
              ? t('Off')
              : kind === 'pending'
                ? t('Pending request')
                : slot.plannedRange || t(slotLabel(slot.status));
      const sub =
        kind === 'worked' && slot.actualHours
          ? formatHours(slot.actualHours)
          : kind === 'issue' && slot.plannedRange
            ? slot.plannedRange
            : '';
      return [{ key: slot.key, kind, text, sub, live: slot.status === 'live' }];
    });
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

  function serviceName(slot: ActualSlot): string {
    return t(serviceLabel(slot.serviceKey));
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

  async function saveEntry(values: TimesheetEntryValues): Promise<boolean> {
    if (!workspace.activeId || !selectedSlot || saving) return false;
    saving = true;
    try {
      await saveTimesheetEntry({ restaurantId: workspace.activeId, slot: selectedSlot, values });
      toasts.show(
        values.isCorrection ? t('Timesheet entry corrected.') : t('Manual timesheet entry added.'),
        'success'
      );
      selectedKey = '';
      return true;
    } catch (error) {
      toasts.show(friendlyError(error), 'danger');
      return false;
    } finally {
      saving = false;
    }
  }

  async function cancelEntry(values: { reason: string }): Promise<boolean> {
    if (!workspace.activeId || !selectedSlot?.entryId || saving) return false;
    saving = true;
    try {
      await cancelTimesheetEntry({
        restaurantId: workspace.activeId,
        slot: selectedSlot,
        reason: values.reason
      });
      toasts.show(t('Timesheet entry cancelled and retained in the audit trail.'), 'success');
      selectedKey = '';
      return true;
    } catch (error) {
      toasts.show(friendlyError(error), 'danger');
      return false;
    } finally {
      saving = false;
    }
  }

  async function resolveLeave(action: 'approve' | 'reject'): Promise<boolean> {
    if (!workspace.activeId || !selectedSlot || saving) return false;
    saving = true;
    try {
      await resolveTimesheetLeave({ restaurantId: workspace.activeId, slot: selectedSlot, action });
      toasts.show(action === 'approve' ? t('Leave approved.') : t('Leave rejected.'), 'success');
      selectedKey = '';
      return true;
    } catch (error) {
      toasts.show(friendlyError(error), 'danger');
      return false;
    } finally {
      saving = false;
    }
  }

  async function loadProof(): Promise<string> {
    if (!workspace.activeId || !selectedSlot?.entryId || !selectedSlot.proofEdge) return '';
    return await getBadgeProofUrl({
      restaurantId: workspace.activeId,
      timeEntryId: selectedSlot.entryId,
      edge: selectedSlot.proofEdge
    });
  }
</script>

<svelte:head><title>{t('Timesheet')} &middot; restogogo</title></svelte:head>

{#snippet pageActions()}
  {#if weekStatus === 'open'}
    <button class="cl-btn is-primary" type="button" disabled={!editable} onclick={() => openWeekAction('approve_week')}>
      {t('Approve week')}
    </button>
  {:else}
    <button class="cl-btn" type="button" disabled={workspace.isPreview} onclick={() => openWeekAction('reopen_week')}>
      {t('Reopen week')}
    </button>
  {/if}
{/snippet}

<ClassicPage title="Time & attendance" subtitle="Timesheet" actions={pageActions}>
  <div class="weekbar">
    <ClassicPeriodNav
      label={weekLabel(activeWeek, i18n.intlLocale)}
      onprevious={() => (weekOffset -= 1)}
      onnext={() => (weekOffset += 1)}
      ontoday={() => (weekOffset = 0)}
      todayLabel="This week"
    />
    <span class="weekpill is-{weekStatus}">
      <span class="weekpill__dot"></span>
      {t(weekStatus === 'open' ? 'Open' : weekStatus === 'approved' ? 'Approved' : 'Locked')}
    </span>
    <span class="cl-toolbar__grow"></span>
    <label class="toggle">
      <input type="checkbox" bind:checked={onlyIssues} />
      {t('Only rows needing attention')}
    </label>
  </div>

  <div class="cl-stats">
    <ClassicStat label="Planned hours" value={totals.plannedHours} format={formatHours} accent="var(--cl-info)" mutedZero={false} />
    <ClassicStat label="Worked hours" value={totals.actualHours} format={formatHours} accent="var(--cl-ok)" mutedZero={false} />
    <ClassicStat label="Missing badge" value={totals.missing} tone={totals.missing ? 'problem' : undefined} />
    <ClassicStat label="Conflict" value={totals.conflicts} tone={totals.conflicts ? 'problem' : undefined} />
  </div>

  <div class="cl-tablewrap">
    <table class="cl-table board">
      <thead>
        <tr>
          <th class="board__staff">{t('Employee')}</th>
          {#each days as day (day.date)}
            <th class="board__day" class:is-today={day.today}>
              <span class="board__dow">{t(day.label)}</span>
              <span class="board__num">{Number(day.date.slice(-2))}</span>
            </th>
          {/each}
        </tr>
        <tr class="board__summary">
          <th>{t('Worked')}</th>
          {#each days as day, index (day.date)}
            <th class:is-empty={!dayWorked[index]}>{dayWorked[index] ? formatHours(dayWorked[index]) : '—'}</th>
          {/each}
        </tr>
      </thead>
      <tbody>
        {#if !gridRows.length}
          <tr>
            <td colspan={days.length + 1}>
              <div class="cl-empty">
                <strong>{t(onlyIssues ? 'Nothing to review' : 'No recorded time this week')}</strong>
                <span>{t('Badge entries and planned shifts appear here as the week runs.')}</span>
              </div>
            </td>
          </tr>
        {:else}
          {#each gridRows as row (row.id)}
            {@const target = contractHours.get(row.id) ?? 0}
            <tr>
              <td class="board__staff">
                <span class="staff">
                  <span class="cl-avatar" style="--avatar-color:{employeeColor.get(row.id) ?? 'var(--cl-muted)'}">{personInitials(row.name)}</span>
                  <span class="staff__id">
                    <strong>{row.name}</strong>
                    <span class="staff__hours"><b>{formatHours(row.worked)}</b>{#if target}<span class="staff__target"> / {formatHours(target)}</span>{/if}</span>
                  </span>
                </span>
              </td>
              {#each days as day (day.date)}
                <td class="board__cell" class:is-past={day.past}>
                  {#each cellChips(row.id, day.date) as chip (chip.key)}
                    <button class="chip is-{chip.kind}" type="button" onclick={() => (selectedKey = chip.key)}>
                      <span class="chip__time">
                        {#if chip.live}<span class="chip__live" aria-hidden="true"></span>{/if}{chip.text}
                      </span>
                      {#if chip.sub}<span class="chip__hours">{chip.sub}</span>{/if}
                    </button>
                  {/each}
                </td>
              {/each}
            </tr>
          {/each}
        {/if}
      </tbody>
    </table>
  </div>
</ClassicPage>

<Dialog
  open={Boolean(selectedSlot)}
  title={selectedSlot ? selectedSlot.employeeName : t('Timesheet')}
  description={selectedSlot
    ? `${weekdayDateLabel(selectedSlot.date, i18n.intlLocale)} · ${serviceName(selectedSlot)}`
    : ''}
  onclose={() => !saving && (selectedKey = '')}
>
  {#if selectedSlot && snapshot && workspace.activeId}
    <TimesheetEntryEditor
      slot={selectedSlot}
      restaurantId={workspace.activeId}
      {timezone}
      {editable}
      jobFunctions={snapshot.job_functions}
      workAreas={snapshot.work_areas ?? []}
      adjustments={snapshot.time_entry_adjustments}
      onsave={saveEntry}
      oncancel={cancelEntry}
      onproof={loadProof}
      onresolveleave={resolveLeave}
      onfeedback={(message, tone) => toasts.show(message, tone)}
    />
  {/if}
</Dialog>

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
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 10px;
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
  .toggle {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    color: var(--cl-muted);
    font-size: 14px;
  }
  .toggle input {
    width: 16px;
    height: 16px;
    accent-color: var(--cl-accent);
  }

  /* --- week grid (shared shape with the Schedule board) ------------------ */
  .board { min-width: 940px; table-layout: fixed; }
  .board__staff {
    width: 210px;
    position: sticky;
    left: 0;
    z-index: 1;
    background: var(--cl-surface);
  }
  th.board__staff { background: var(--cl-surface-muted); }
  .staff { display: flex; align-items: center; gap: 10px; }
  .staff__id { display: grid; gap: 1px; min-width: 0; }
  .staff__id strong { font-weight: var(--rst-fw-medium); }
  .staff__hours { font-size: 12px; color: var(--cl-muted); font-variant-numeric: tabular-nums; }
  .staff__hours b { color: var(--cl-ink); font-weight: var(--rst-fw-bold); }
  .board__day { text-align: center; border-left: 1px solid var(--cl-line); }
  .board__dow { font-weight: var(--rst-fw-bold); }
  .board__num { margin-left: 5px; color: var(--cl-muted); font-variant-numeric: tabular-nums; }
  .board__day.is-today { color: var(--cl-accent); }
  .board__summary th {
    padding-top: 5px;
    padding-bottom: 8px;
    border-left: 1px solid var(--cl-line);
    color: var(--cl-muted);
    font-size: 12px;
    font-weight: var(--rst-fw-bold);
    text-align: center;
    font-variant-numeric: tabular-nums;
  }
  .board__summary th:first-child { border-left: 0; text-align: left; text-transform: uppercase; letter-spacing: 0.02em; }
  .board__summary th.is-empty { color: var(--cl-line-strong); }
  .board__cell {
    padding: 6px;
    border-left: 1px solid var(--cl-line);
    vertical-align: top;
  }
  .board__cell.is-past { background: color-mix(in srgb, var(--cl-surface-muted) 60%, transparent); }
  /* Chips coloured by badge status: worked green, an issue red, a request
     amber, a day off violet, an unworked planned shift neutral. */
  .chip {
    width: 100%;
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 6px;
    margin-bottom: 4px;
    padding: 6px 9px;
    border: 1px solid transparent;
    border-radius: var(--cl-radius);
    font: inherit;
    font-variant-numeric: tabular-nums;
    text-align: left;
    cursor: pointer;
    transition: border-color var(--cl-dur) var(--cl-ease);
  }
  .chip:hover { border-color: currentColor; }
  .chip__time { display: inline-flex; align-items: center; gap: 6px; font-size: 13px; font-weight: var(--rst-fw-bold); }
  .chip__hours { font-size: 12px; opacity: 0.75; }
  .chip.is-worked { color: var(--cl-ok); background: var(--cl-ok-wash); border-color: var(--cl-ok-line); }
  .chip.is-issue { color: var(--cl-problem); background: var(--cl-problem-wash); border-color: var(--cl-problem-line); }
  .chip.is-pending { color: var(--cl-attention); background: var(--cl-attention-wash); border-color: var(--cl-attention-line); }
  .chip.is-off { color: var(--cl-evening); background: var(--cl-evening-wash); border-color: color-mix(in srgb, var(--cl-evening) 24%, var(--cl-line)); }
  .chip.is-muted, .chip.is-planned { color: var(--cl-muted); background: var(--cl-surface-muted); border-color: var(--cl-line); }
  .chip__live {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: var(--cl-ok);
    animation: chip-pulse 1.8s var(--cl-ease) infinite;
  }
  @keyframes chip-pulse {
    0%, 100% { opacity: 1; box-shadow: 0 0 0 0 rgba(var(--cl-ok-rgb), 0.4); }
    50% { opacity: 0.65; box-shadow: 0 0 0 4px rgba(var(--cl-ok-rgb), 0); }
  }
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
</style>
