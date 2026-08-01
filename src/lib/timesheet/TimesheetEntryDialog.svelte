<script lang="ts">
  import type { ManagerOperationsReadModel } from '$lib/api/workspace-snapshot';
  import { friendlyError } from '$lib/api/error-messages';
  import { getBadgeProofUrl } from '$lib/api/mutations';
  import { serviceLabel, weekdayDateLabel } from '$lib/calendar/date';
  import Dialog from '$lib/components/Dialog.svelte';
  import { i18n, t } from '$lib/i18n/i18n.svelte';
  import { unsavedChanges } from '$lib/navigation/unsaved-changes.svelte';
  import { toasts } from '$lib/ui/toast.svelte';
  import { workspace } from '$lib/workspace/workspace.svelte';
  import TimesheetEntryEditor from './TimesheetEntryEditor.svelte';
  import {
    cancelTimesheetEntry,
    resolveTimesheetLeave,
    saveTimesheetEntry,
    type TimesheetEntryValues
  } from './timesheet-actions';
  import type { ActualSlot } from './timesheet-model';

  let {
    slot,
    snapshot,
    timezone,
    editable,
    onclose
  }: {
    slot: ActualSlot | null;
    snapshot: ManagerOperationsReadModel | null;
    timezone: string;
    editable: boolean;
    onclose: () => void;
  } = $props();

  let busy = $state(false);

  type BadgeLocations = {
    clockIn: { latitude: number; longitude: number; accuracyMeters: number } | null;
    clockOut: { latitude: number; longitude: number; accuracyMeters: number } | null;
  };

  const badgeLocations = $derived.by<BadgeLocations>(() => {
    const entry = snapshot?.time_entries.find((item) => item.id === slot?.entryId) as
      | (Record<string, unknown> & { id: string })
      | undefined;
    const point = (edge: 'clock_in' | 'clock_out') => {
      const latitude = Number(entry?.[`${edge}_latitude`]);
      const longitude = Number(entry?.[`${edge}_longitude`]);
      const accuracyMeters = Number(entry?.[`${edge}_accuracy_meters`]);
      return Number.isFinite(latitude) && Number.isFinite(longitude)
        ? { latitude, longitude, accuracyMeters: Number.isFinite(accuracyMeters) ? accuracyMeters : 0 }
        : null;
    };
    return { clockIn: point('clock_in'), clockOut: point('clock_out') };
  });

  const adjustments = $derived(
    slot?.entryId
      ? snapshot?.time_entry_adjustments.filter(
          (adjustment) => adjustment.time_entry_id === slot?.entryId
        ) ?? []
      : []
  );

  function close(): void {
    if (busy) return;
    void unsavedChanges.runOrRequest(onclose);
  }

  async function saveEntry(values: TimesheetEntryValues): Promise<boolean> {
    const restaurantId = workspace.activeId;
    const activeSlot = slot;
    if (!restaurantId || !activeSlot || busy) return false;
    busy = true;
    try {
      await saveTimesheetEntry({ restaurantId, slot: activeSlot, values });
      toasts.show(
        values.isCorrection ? t('Timesheet entry corrected.') : t('Manual timesheet entry added.'),
        'success'
      );
      onclose();
      return true;
    } catch (error) {
      toasts.show(friendlyError(error), 'danger');
      return false;
    } finally {
      busy = false;
    }
  }

  async function cancelEntry(values: { reason: string }): Promise<boolean> {
    const restaurantId = workspace.activeId;
    const activeSlot = slot;
    if (!restaurantId || !activeSlot?.entryId || busy) return false;
    busy = true;
    try {
      await cancelTimesheetEntry({
        restaurantId,
        slot: activeSlot,
        reason: values.reason
      });
      toasts.show(t('Timesheet entry cancelled and retained in the audit trail.'), 'success');
      onclose();
      return true;
    } catch (error) {
      toasts.show(friendlyError(error), 'danger');
      return false;
    } finally {
      busy = false;
    }
  }

  async function resolveLeave(action: 'approve' | 'reject'): Promise<boolean> {
    const restaurantId = workspace.activeId;
    const activeSlot = slot;
    if (!restaurantId || !activeSlot || busy) return false;
    busy = true;
    try {
      await resolveTimesheetLeave({ restaurantId, slot: activeSlot, action });
      toasts.show(action === 'approve' ? t('Leave approved.') : t('Leave rejected.'), 'success');
      onclose();
      return true;
    } catch (error) {
      toasts.show(friendlyError(error), 'danger');
      return false;
    } finally {
      busy = false;
    }
  }

  async function loadProof(): Promise<string> {
    const restaurantId = workspace.activeId;
    if (!restaurantId || !slot?.entryId || !slot.proofEdge) return '';
    return await getBadgeProofUrl({
      restaurantId,
      timeEntryId: slot.entryId,
      edge: slot.proofEdge
    });
  }
</script>

<Dialog
  open={Boolean(slot)}
  title={slot?.employeeName ?? t('Time entry')}
  description={slot
    ? `${weekdayDateLabel(slot.date, i18n.intlLocale)} · ${t(serviceLabel(slot.serviceKey, snapshot?.services))}`
    : ''}
  onclose={close}
>
  {#if slot && snapshot && workspace.activeId}
    {#key slot.key}
      <TimesheetEntryEditor
        {slot}
        restaurantId={workspace.activeId}
        {timezone}
        {editable}
        jobFunctions={snapshot.job_functions}
        workAreas={snapshot.work_areas ?? []}
        services={snapshot.services}
        {adjustments}
        {badgeLocations}
        onsave={saveEntry}
        oncancel={cancelEntry}
        onproof={loadProof}
        onresolveleave={resolveLeave}
        onfeedback={(message, tone) => toasts.show(message, tone)}
      />
    {/key}
  {/if}
</Dialog>
