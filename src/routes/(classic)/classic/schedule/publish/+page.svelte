<script lang="ts">
  import { dateForWeekday, serviceLabel, WEEKDAYS } from '$lib/calendar/date';
  import { friendlyError } from '$lib/api/error-messages';
  import { t } from '$lib/i18n/i18n.svelte';
  import { toasts } from '$lib/ui/toast.svelte';
  import { workspace } from '$lib/workspace/workspace.svelte';
  import { invalidPlanningShift, saveSchedule } from '$lib/schedule/schedule-actions';
  import {
    coverageIssues,
    planningConflicts,
    slotContext
  } from '$lib/schedule/schedule-model';
  import ClassicPage from '$lib/classic/ClassicPage.svelte';
  import ClassicScheduleWeek from '$lib/classic/ClassicScheduleWeek.svelte';
  import ClassicStatus from '$lib/classic/ClassicStatus.svelte';
  import { scheduleDraft } from '$lib/classic/classic-schedule.svelte';

  const snapshot = $derived(workspace.operations);
  let saving = $state(false);

  const employeeName = $derived(
    new Map((snapshot?.employees ?? []).map((employee) => [employee.id, employee.display_name]))
  );

  async function publish(weekStart: string, revision: number, published: boolean, conflicts: number) {
    if (!workspace.activeId || saving) return;
    if (invalidPlanningShift(scheduleDraft.shifts)) {
      toasts.show(t('Every planned shift needs a valid start and end time.'), 'danger');
      return;
    }
    saving = true;
    try {
      // Coverage gaps and conflicts never block: they are listed above and the
      // manager publishes with them in view.
      await saveSchedule({
        restaurantId: workspace.activeId,
        weekStart,
        status: 'published',
        shifts: scheduleDraft.shifts,
        notes: scheduleDraft.notes,
        expectedRevision: revision,
        wasPublished: published,
        allowCoverageGaps: true,
        allowConflicts: conflicts > 0
      });
      scheduleDraft.settle();
      toasts.show(t('Schedule published. Employees can now see their shifts.'), 'success');
    } catch (error) {
      toasts.show(friendlyError(error), 'danger');
    } finally {
      saving = false;
    }
  }
</script>

<svelte:head><title>{t('Publish')} &middot; restogogo</title></svelte:head>

<ClassicPage title="Schedule" subtitle="Publish">
  <ClassicScheduleWeek>
    {#snippet children(week)}
      {@const gaps = snapshot ? coverageIssues(snapshot, scheduleDraft.shifts, week.weekStart) : []}
      {@const conflicts = snapshot
        ? planningConflicts(snapshot, scheduleDraft.shifts, week.weekStart)
        : []}
      {@const pending = snapshot
        ? scheduleDraft.shifts.filter((shift) => {
            const context = slotContext(
              snapshot,
              shift.employeeId,
              dateForWeekday(week.weekStart, shift.weekday),
              shift.serviceKey
            );
            return context.absence === 'pending' || context.workPatternException === 'pending';
          })
        : []}
      {@const ready = !gaps.length && !conflicts.length && !pending.length}

      <div class="cl-stats">
        <div class="cl-stat">
          <span class="cl-stat__label">{t('Planned shifts')}</span>
          <span class="cl-stat__value">{scheduleDraft.shifts.length}</span>
        </div>
        <div class="cl-stat">
          <span class="cl-stat__label">{t('Coverage gaps')}</span>
          <span class="cl-stat__value">{gaps.length}</span>
        </div>
        <div class="cl-stat">
          <span class="cl-stat__label">{t('Conflicts')}</span>
          <span class="cl-stat__value">{conflicts.length}</span>
        </div>
        <div class="cl-stat">
          <span class="cl-stat__label">{t('Pending requests')}</span>
          <span class="cl-stat__value">{pending.length}</span>
        </div>
      </div>

      <section class="cl-card">
        <div class="cl-card__head">
          <h2>{t('Before you publish')}</h2>
          <ClassicStatus
            label={ready ? 'Ready to publish' : 'Publishing with open points'}
            tone={ready ? 'ok' : 'attention'}
          />
        </div>
        <div class="cl-card__body">
          <p class="lead">
            {t(ready
              ? 'Nothing is outstanding. Publishing makes this week visible to every employee.'
              : 'None of the points below stops you. Publish when you have seen them.')}
          </p>
        </div>
        <div class="cl-card__foot">
          <button
            class="cl-btn is-primary"
            type="button"
            disabled={saving || !week.editable}
            onclick={() => publish(week.weekStart, week.revision, week.published, conflicts.length)}
          >{t(saving ? 'Publishing…' : week.published ? 'Publish changes' : 'Publish week')}</button>
        </div>
      </section>

      {#if conflicts.length}
        <section class="cl-section">
          <h2 class="cl-section__title">{t('Availability and leave conflicts')}</h2>
          <p class="cl-section__note">{t('These people are planned against their own stated availability or approved leave.')}</p>
          <div class="cl-tablewrap">
            <table class="cl-table">
              <thead>
                <tr><th>{t('Employee')}</th><th>{t('Day')}</th><th>{t('Service')}</th><th>{t('Planned')}</th></tr>
              </thead>
              <tbody>
                {#each conflicts as shift (`${shift.employeeId}|${shift.weekday}|${shift.serviceKey}`)}
                  <tr>
                    <td>{employeeName.get(shift.employeeId) ?? '—'}</td>
                    <td class="is-quiet">{t(WEEKDAYS[shift.weekday - 1])}</td>
                    <td class="is-quiet">{t(serviceLabel(shift.serviceKey))}</td>
                    <td class="is-quiet">{shift.startsAt}–{shift.endsAt}</td>
                  </tr>
                {/each}
              </tbody>
            </table>
          </div>
        </section>
      {/if}

      {#if pending.length}
        <section class="cl-section">
          <h2 class="cl-section__title">{t('Pending requests')}</h2>
          <p class="cl-section__note">{t('Approve or reject these from Planning to remove the doubt.')}</p>
          <div class="cl-tablewrap">
            <table class="cl-table">
              <thead>
                <tr><th>{t('Employee')}</th><th>{t('Day')}</th><th>{t('Service')}</th></tr>
              </thead>
              <tbody>
                {#each pending as shift (`${shift.employeeId}|${shift.weekday}|${shift.serviceKey}`)}
                  <tr>
                    <td>{employeeName.get(shift.employeeId) ?? '—'}</td>
                    <td class="is-quiet">{t(WEEKDAYS[shift.weekday - 1])}</td>
                    <td class="is-quiet">{t(serviceLabel(shift.serviceKey))}</td>
                  </tr>
                {/each}
              </tbody>
            </table>
          </div>
        </section>
      {/if}

      {#if gaps.length}
        <section class="cl-section">
          <h2 class="cl-section__title">{t('Coverage gaps')}</h2>
          <p class="cl-section__note">{t('Fill these on the Coverage page, or publish and cover them later.')}</p>
          <div class="cl-tablewrap">
            <table class="cl-table">
              <thead>
                <tr><th>{t('Day')}</th><th>{t('Service')}</th><th class="is-num">{t('Required')}</th><th class="is-num">{t('Planned')}</th></tr>
              </thead>
              <tbody>
                {#each gaps as gap (`${gap.date}|${gap.serviceKey}|${gap.areaId}|${gap.jobFunctionId}`)}
                  <tr>
                    <td class="is-quiet">{t(WEEKDAYS[(new Date(`${gap.date}T00:00:00Z`).getUTCDay() + 6) % 7])} {Number(gap.date.slice(-2))}</td>
                    <td class="is-quiet">{t(serviceLabel(gap.serviceKey))}</td>
                    <td class="is-num">{gap.required}</td>
                    <td class="is-num">{gap.planned}</td>
                  </tr>
                {/each}
              </tbody>
            </table>
          </div>
        </section>
      {/if}
    {/snippet}
  </ClassicScheduleWeek>
</ClassicPage>

<style>
  .lead {
    margin: 0;
    max-width: 62ch;
    font-size: 14px;
    line-height: 1.6;
  }
</style>

