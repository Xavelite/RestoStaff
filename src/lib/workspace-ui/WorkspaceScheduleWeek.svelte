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
  import WorkspacePeriodNav from './WorkspacePeriodNav.svelte';
  import { scheduleDraft, type ScheduleWeekContext } from './workspace-schedule.svelte';

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
    children,
    showHeader = true
  }: {
    actions?: Snippet<[ScheduleWeekContext]>;
    children: Snippet<[ScheduleWeekContext]>;
    showHeader?: boolean;
  } = $props();

  const snapshot = $derived(workspace.operations);
  const role = $derived(workspace.effectiveRole);
  const timezone = $derived(
    snapshot?.restaurant_settings.timezone ||
      workspace.bootstrap?.restaurant_settings.timezone ||
      'Europe/Brussels'
  );
  const today = $derived(todayInTimezone(timezone, new Date()));
  const currentWeekStart = $derived(mondayFor(today));
  const weekStart = $derived(addDays(currentWeekStart, scheduleDraft.weekOffset * 7));

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
      : {
          planning: 'draft' as const,
          actuals: 'open',
          revision: 0,
          hasUnpublishedChanges: false
        }
  );
  function changeWeek(action: () => void): void {
    void unsavedChanges.runOrRequest(action);
  }

  const context = $derived<ScheduleWeekContext>({
    weekStart,
    today,
    label: weekLabel(weekStart, i18n.intlLocale),
    published: status.planning === 'published',
    hasUnpublishedChanges: status.hasUnpublishedChanges,
    revision: status.revision,
    editable: !workspace.isPreview,
    previous: () => changeWeek(() => (scheduleDraft.weekOffset -= 1)),
    next: () => changeWeek(() => (scheduleDraft.weekOffset += 1)),
    todayAction: () => changeWeek(() => (scheduleDraft.weekOffset = 0)),
    selectDate: (date: string) =>
      changeWeek(() => {
        const selectedWeek = mondayFor(date);
        const selected = Date.parse(`${selectedWeek}T00:00:00Z`);
        const current = Date.parse(`${currentWeekStart}T00:00:00Z`);
        if (!Number.isFinite(selected) || !Number.isFinite(current)) return;
        scheduleDraft.weekOffset = Math.round((selected - current) / (7 * 86_400_000));
      })
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
      toasts.show(
        t(
          status.planning === 'published'
            ? 'Private schedule draft saved.'
            : 'Schedule saved.'
        ),
        'success'
      );
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

{#if showHeader}
  <div class="weekbar">
    <WorkspacePeriodNav
      label={context.label}
      onprevious={context.previous}
      onnext={context.next}
      ontoday={context.todayAction}
      todayLabel="This week"
    />
    <span
      class="weekpill"
      class:is-published={context.published && !context.hasUnpublishedChanges}
      class:has-private-draft={context.hasUnpublishedChanges}
    >
      <span class="weekpill__dot"></span>
      {t(context.hasUnpublishedChanges ? 'Private draft' : context.published ? 'Published' : 'Draft')}
    </span>
    {#if scheduleDraft.dirty}
      <span class="weekbar__unsaved">{t('Unsaved changes')}</span>
    {/if}
    <span class="cl-toolbar__grow"></span>
    {#if actions}{@render actions(context)}{/if}
  </div>
{/if}

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
    font-size: var(--rst-fs-body);
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
  .weekpill.has-private-draft {
    color: var(--cl-attention);
    border-color: color-mix(in srgb, var(--cl-attention) 34%, var(--cl-line));
    background: color-mix(in srgb, var(--cl-attention) 7%, var(--cl-surface));
  }
  .weekpill.has-private-draft .weekpill__dot {
    background: var(--cl-attention);
  }
  .weekbar__unsaved {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    color: var(--cl-attention);
    font-size: var(--rst-fs-body);
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
