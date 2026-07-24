<script lang="ts">
  import { onMount, type Snippet } from 'svelte';
  import { addDays, mondayFor, todayInTimezone, weekLabel } from '$lib/calendar/date';
  import { friendlyError } from '$lib/api/error-messages';
  import { i18n, t } from '$lib/i18n/i18n.svelte';
  import { workspace } from '$lib/workspace/workspace.svelte';
  import { invalidPlanningShift, saveSchedule } from '$lib/schedule/schedule-actions';
  import { planningStatusForWeek } from '$lib/schedule/schedule-model';
  import { unsavedChanges } from '$lib/navigation/unsaved-changes.svelte';
  import { toasts } from '$lib/ui/toast.svelte';
  import ClassicPeriodNav from './ClassicPeriodNav.svelte';
  import { scheduleDraft, type ScheduleWeekContext } from './classic-schedule.svelte';

  /**
   * The week context every Schedule page shares: which week, its saved status,
   * and the draft kept across Planning, Coverage and Publish. Each page renders
   * its own body through the children snippet and reads these values back.
   *
   * `actions` lets a page put its Save/Discard on the same single toolbar row
   * as the week navigator, instead of stacking a second toolbar under it.
   */
  let {
    actions,
    children
  }: {
    actions?: Snippet<[ScheduleWeekContext]>;
    children: Snippet<[ScheduleWeekContext]>;
  } = $props();

  const snapshot = $derived(workspace.operations);
  const role = $derived(workspace.effectiveRole);
  const timezone = $derived(
    snapshot?.restaurant_settings.timezone ||
      workspace.bootstrap?.restaurant_settings.timezone ||
      'Europe/Brussels'
  );
  const today = $derived(todayInTimezone(timezone, new Date()));
  const weekStart = $derived(addDays(mondayFor(today), scheduleDraft.weekOffset * 7));

  $effect(() => {
    if (workspace.activeId && role && role !== 'employee') {
      // Include the prior week so Copy previous week is based on server truth, not
      // on an empty current-week-only snapshot.
      void workspace.loadOperations(addDays(weekStart, -7), addDays(weekStart, 6)).catch(() => undefined);
    }
  });

  $effect(() => {
    if (snapshot) scheduleDraft.sync(snapshot, weekStart);
  });

  const status = $derived(
    snapshot
      ? planningStatusForWeek(snapshot, weekStart)
      : { planning: 'draft' as const, actuals: 'open', revision: 0 }
  );
  const context = $derived<ScheduleWeekContext>({
    weekStart,
    today,
    published: status.planning === 'published',
    revision: status.revision,
    editable: !workspace.isPreview
  });

  async function saveBeforeLeaving(): Promise<void> {
    if (!workspace.activeId || !snapshot) throw new Error(t('Schedule data is not loaded.'));
    if (scheduleDraft.saving) throw new Error(t('A schedule save is already in progress.'));
    if (invalidPlanningShift(scheduleDraft.shifts)) {
      throw new Error(t('Every planned shift needs a valid start and end time.'));
    }
    scheduleDraft.saving = true;
    try {
      await saveSchedule({
        restaurantId: workspace.activeId,
        weekStart,
        status: 'draft',
        shifts: scheduleDraft.shifts,
        notes: scheduleDraft.notes,
        expectedRevision: status.revision,
        wasPublished: status.planning === 'published'
      });
      scheduleDraft.settle();
      toasts.show(t('Schedule saved.'), 'success');
    } catch (error) {
      throw new Error(friendlyError(error));
    } finally {
      scheduleDraft.saving = false;
    }
  }

  function discardBeforeLeaving(): void {
    if (!snapshot) throw new Error(t('Schedule data is not loaded.'));
    scheduleDraft.reset(snapshot, weekStart);
  }

  function changeWeek(action: () => void): void {
    void unsavedChanges.runOrRequest(action);
  }

  onMount(() =>
    unsavedChanges.register({
      id: 'schedule-week',
      label: 'Schedule',
      isDirty: () => scheduleDraft.dirty,
      save: saveBeforeLeaving,
      discard: discardBeforeLeaving
    })
  );
</script>

<div class="weekbar">
  <ClassicPeriodNav
    label={weekLabel(weekStart, i18n.intlLocale)}
    onprevious={() => changeWeek(() => (scheduleDraft.weekOffset -= 1))}
    onnext={() => changeWeek(() => (scheduleDraft.weekOffset += 1))}
    ontoday={() => changeWeek(() => (scheduleDraft.weekOffset = 0))}
    todayLabel="This week"
  />
  <span class="weekpill" class:is-published={context.published}>
    <span class="weekpill__dot"></span>
    {t(context.published ? 'Published' : 'Draft')}
  </span>
  {#if scheduleDraft.dirty}
    <span class="weekbar__unsaved">{t('Unsaved changes')}</span>
  {/if}
  <span class="cl-toolbar__grow"></span>
  {#if actions}{@render actions(context)}{/if}
</div>

{#if snapshot}
  {@render children(context)}
{/if}

<style>
  .weekbar {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 10px;
  }
  /* A small status pill, dot + word, so "Draft/Published" reads at a glance
     without a whole line of prose. */
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
  .weekpill.is-published {
    color: var(--cl-ok);
    border-color: var(--cl-ok-line);
    background: var(--cl-ok-wash);
  }
  .weekpill.is-published .weekpill__dot {
    background: var(--cl-ok);
  }
  .weekbar__unsaved {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    color: var(--cl-attention);
    font-size: 13px;
    font-weight: var(--rst-fw-bold);
  }
  .weekbar__unsaved::before {
    content: '';
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: var(--cl-attention);
  }
</style>
