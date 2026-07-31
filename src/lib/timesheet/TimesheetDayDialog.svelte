<script lang="ts">
  import type { ManagerOperationsReadModel } from '$lib/api/workspace-snapshot';
  import { formatHours, hoursBetweenClocks, serviceLabel, weekdayDateLabel } from '$lib/calendar/date';
  import Dialog from '$lib/components/Dialog.svelte';
  import { i18n, t } from '$lib/i18n/i18n.svelte';
  import { friendlyError } from '$lib/api/error-messages';
  import { toasts } from '$lib/ui/toast.svelte';
  import { workspace } from '$lib/workspace/workspace.svelte';
  import WorkspaceServiceIcon from '$lib/workspace-ui/WorkspaceServiceIcon.svelte';
  import { slotLabel } from '$lib/workspace-ui/workspace-time';
  import { recordPlannedTimesheetDay } from './timesheet-actions';
  import type { ActualSlot } from './timesheet-model';

  let {
    slots,
    snapshot,
    timezone,
    editable,
    onclose,
    onedit
  }: {
    slots: ActualSlot[];
    snapshot: ManagerOperationsReadModel | null;
    timezone: string;
    editable: boolean;
    onclose: () => void;
    onedit: (key: string) => void;
  } = $props();

  let busy = $state(false);
  const employee = $derived(slots[0]?.employeeName ?? '');
  const date = $derived(slots[0]?.date ?? '');
  const visible = $derived(
    slots.filter((slot) => slot.planned || slot.entryId || slot.status !== 'empty')
  );
  const missingPlanned = $derived(
    visible.filter(
      (slot) =>
        slot.status === 'missing' &&
        slot.planned &&
        !slot.entryId &&
        slot.plannedRange
    )
  );
  const worked = $derived(visible.reduce((total, slot) => total + slot.actualHours, 0));
  const planned = $derived(
    visible.reduce(
      (total, slot) =>
        total +
        (slot.truth.plan
          ? hoursBetweenClocks(slot.truth.plan.startsAt, slot.truth.plan.endsAt)
          : 0),
      0
    )
  );

  async function recordDay(): Promise<void> {
    if (!workspace.activeId || busy || !missingPlanned.length) return;
    busy = true;
    try {
      const count = await recordPlannedTimesheetDay({
        restaurantId: workspace.activeId,
        slots: visible,
        timezone
      });
      toasts.show(
        t('{count} planned services recorded.', { count }),
        'success'
      );
      onclose();
    } catch (error) {
      toasts.show(friendlyError(error), 'danger');
    } finally {
      busy = false;
    }
  }
</script>

<Dialog
  open={slots.length > 0}
  title={employee || t('Time')}
  description={date ? weekdayDateLabel(date, i18n.intlLocale) : ''}
  size="large"
  onclose={onclose}
>
  <div class="day-overview">
    <div class="day-overview__summary">
      <span><b>{formatHours(planned)}</b>{t('planned')}</span>
      <span><b>{formatHours(worked)}</b>{t('worked')}</span>
      <span><b>{visible.length}</b>{t('services')}</span>
    </div>

    <div class="day-overview__services">
      {#each visible as slot (slot.key)}
        <button type="button" onclick={() => onedit(slot.key)}>
          <span class="service-icon"><WorkspaceServiceIcon service={slot.serviceKey} size={17} /></span>
          <span>
            <strong>{t(serviceLabel(slot.serviceKey, snapshot?.services))}</strong>
            <small>{slot.actualRange || slot.plannedRange || t('No time recorded')}</small>
          </span>
          <span class="service-state is-{slot.status}">{t(slotLabel(slot.status))}</span>
          <b>{slot.actualHours ? formatHours(slot.actualHours) : slot.truth.plan ? formatHours(hoursBetweenClocks(slot.truth.plan.startsAt, slot.truth.plan.endsAt)) : '-'}</b>
          <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m9 18 6-6-6-6"/></svg>
        </button>
      {/each}
    </div>

    {#if missingPlanned.length && editable}
      <div class="day-overview__action">
        <span>
          <strong>{t('Use the published schedule')}</strong>
          <small>{t('Records each planned service separately. Time between services stays outside worked time.')}</small>
        </span>
        <button class="cl-btn is-primary" type="button" disabled={busy} onclick={recordDay}>
          {t(busy ? 'Recording...' : 'Record planned day')}
        </button>
      </div>
    {/if}
  </div>
</Dialog>

<style>
  .day-overview { display: grid; gap: 12px; }
  .day-overview__summary {
    display: flex;
    gap: 22px;
    padding: 10px 12px;
    border: 1px solid var(--cl-line);
    border-radius: var(--cl-radius);
    background: var(--cl-surface-muted);
  }
  .day-overview__summary span { display: grid; gap: 1px; color: var(--cl-muted); font-size: var(--rst-fs-micro); text-transform: uppercase; }
  .day-overview__summary b { color: var(--cl-ink); font-size: var(--rst-fs-body-lg); text-transform: none; }
  .day-overview__services { overflow: hidden; border: 1px solid var(--cl-line); border-radius: var(--cl-radius); }
  .day-overview__services > button {
    width: 100%;
    min-width: 0;
    min-height: 58px;
    display: grid;
    grid-template-columns: 30px minmax(0, 1fr) auto auto 15px;
    align-items: center;
    gap: 10px;
    padding: 8px 11px;
    border: 0;
    border-bottom: 1px solid var(--cl-grid-line);
    color: inherit;
    background: var(--cl-surface);
    font: inherit;
    text-align: left;
    cursor: pointer;
  }
  .day-overview__services > button:last-child { border-bottom: 0; }
  .day-overview__services > button:hover { background: var(--cl-surface-muted); }
  .service-icon { width: 28px; height: 28px; display: grid; place-items: center; border-radius: 50%; color: var(--cl-info); background: color-mix(in srgb, var(--cl-info) 10%, var(--cl-surface)); }
  .day-overview__services > button > span:nth-child(2) { min-width: 0; display: grid; gap: 2px; }
  .day-overview__services small { overflow: hidden; color: var(--cl-muted); font-size: var(--rst-fs-caption); text-overflow: ellipsis; white-space: nowrap; }
  .day-overview__services b { font-size: var(--rst-fs-label); font-variant-numeric: tabular-nums; }
  .service-state { padding: 3px 7px; border-radius: 999px; color: var(--cl-muted); background: var(--cl-surface-muted); font-size: var(--rst-fs-micro); font-weight: var(--rst-fw-bold); }
  .service-state.is-live,
  .service-state.is-recorded { color: var(--cl-ok); background: var(--cl-ok-wash); }
  .service-state.is-adjusted,
  .service-state.is-pending { color: var(--cl-attention); background: var(--cl-attention-wash); }
  .service-state.is-missing,
  .service-state.is-conflict { color: var(--cl-problem); background: var(--cl-problem-wash); }
  .day-overview__action {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    padding: 12px;
    border: 1px solid color-mix(in srgb, var(--cl-accent) 25%, var(--cl-line));
    border-radius: var(--cl-radius);
    background: color-mix(in srgb, var(--cl-accent) 4%, var(--cl-surface));
  }
  .day-overview__action > span { min-width: 0; display: grid; gap: 3px; }
  .day-overview__action small { color: var(--cl-muted); font-size: var(--rst-fs-caption); }
  @media (max-width: 760px) {
    .day-overview__services > button { grid-template-columns: 28px minmax(0, 1fr) auto; }
    .day-overview__services .service-state,
    .day-overview__services > button > b { display: none; }
    .day-overview__action { align-items: stretch; flex-direction: column; }
  }
</style>
