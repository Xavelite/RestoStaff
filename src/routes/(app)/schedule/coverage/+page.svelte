<script lang="ts">
  import { dateForWeekday, serviceLabel, WEEKDAYS, type ServiceKey } from '$lib/calendar/date';
  import { friendlyError } from '$lib/api/error-messages';
  import { t } from '$lib/i18n/i18n.svelte';
  import { toasts } from '$lib/ui/toast.svelte';
  import { workspace } from '$lib/workspace/workspace.svelte';
  import {
    invalidPlanningShift,
    saveSchedule
  } from '$lib/schedule/schedule-actions';
  import {
    blocksPlanningAssignment,
    coverageIssues,
    defaultPlanningShift,
    slotContext
  } from '$lib/schedule/schedule-model';
  import ClassicPage from '$lib/classic/ClassicPage.svelte';
  import ClassicScheduleWeek from '$lib/classic/ClassicScheduleWeek.svelte';
  import ClassicStatus from '$lib/classic/ClassicStatus.svelte';
  import { scheduleDraft } from '$lib/classic/classic-schedule.svelte';

  const snapshot = $derived(workspace.operations);
  let saving = $state(false);
  let filling = $state<{ weekday: number; serviceKey: ServiceKey; areaId: string; jobFunctionId: string } | null>(null);

  const areaName = $derived(
    new Map((snapshot?.work_areas ?? []).map((area) => [area.id, area.name]))
  );
  const jobName = $derived(
    new Map((snapshot?.job_functions ?? []).map((job) => [job.id, job.name]))
  );

  /**
   * Who can still be added to this gap, ranked by what we actually know about
   * their day: available first, then no stated preference, then anyone with a
   * blocking request last and disabled.
   */
  function candidates(weekStart: string, gap: NonNullable<typeof filling>) {
    if (!snapshot) return [];
    const date = dateForWeekday(weekStart, gap.weekday);
    const placed = new Set(
      scheduleDraft.shifts
        .filter((shift) => shift.weekday === gap.weekday && shift.serviceKey === gap.serviceKey)
        .map((shift) => shift.employeeId)
    );
    return snapshot.employees
      .filter((employee) => employee.active && !placed.has(employee.id))
      .map((employee) => {
        const context = slotContext(snapshot, employee.id, date, gap.serviceKey);
        const blocked = blocksPlanningAssignment(context) || context.availability === 'unavailable';
        const label = blocked
          ? context.absence
            ? 'Time off'
            : context.workPatternException
              ? 'Schedule change'
              : 'Unavailable'
          : context.availability === 'available'
            ? 'Available'
            : 'No preference';
        return {
          id: employee.id,
          name: employee.display_name,
          label,
          blocked,
          rank: blocked ? 2 : context.availability === 'available' ? 0 : 1
        };
      })
      .sort((left, right) => left.rank - right.rank || left.name.localeCompare(right.name));
  }

  function fill(weekStart: string, employeeId: string) {
    if (!snapshot || !filling) return;
    const gap = filling;
    const shift = defaultPlanningShift(snapshot, {
      employeeId,
      weekday: gap.weekday,
      date: dateForWeekday(weekStart, gap.weekday),
      serviceKey: gap.serviceKey
    });
    if (!shift) return;
    // Fill the gap that was actually asked for, not the employee's default.
    scheduleDraft.add({ ...shift, areaId: gap.areaId, jobFunctionId: gap.jobFunctionId });
    filling = null;
  }

  async function persist(weekStart: string, revision: number, published: boolean) {
    if (!workspace.activeId || saving) return;
    if (invalidPlanningShift(scheduleDraft.shifts)) {
      toasts.show(t('Every planned shift needs a valid start and end time.'), 'danger');
      return;
    }
    saving = true;
    try {
      await saveSchedule({
        restaurantId: workspace.activeId,
        weekStart,
        status: 'draft',
        shifts: scheduleDraft.shifts,
        notes: scheduleDraft.notes,
        expectedRevision: revision,
        wasPublished: published
      });
      scheduleDraft.settle();
      toasts.show(t('Schedule saved.'), 'success');
    } catch (error) {
      toasts.show(friendlyError(error), 'danger');
    } finally {
      saving = false;
    }
  }
</script>

<svelte:head><title>{t('Coverage')} &middot; restogogo</title></svelte:head>

<ClassicPage>
  <ClassicScheduleWeek>
    {#snippet actions(week)}
      <button
        class="cl-btn is-primary"
        type="button"
        disabled={saving || !week.editable || !scheduleDraft.dirty}
        onclick={() => persist(week.weekStart, week.revision, week.published)}
      >{t(saving ? 'Saving…' : 'Save draft')}</button>
    {/snippet}

    {#snippet children(week)}
      {@const gaps = snapshot
        ? coverageIssues(snapshot, scheduleDraft.shifts, week.weekStart)
        : []}

      <div class="cl-stats">
        <div class="cl-stat">
          <span class="cl-stat__label">{t('Coverage gaps')}</span>
          <span class="cl-stat__value">{gaps.length}</span>
        </div>
        <div class="cl-stat">
          <span class="cl-stat__label">{t('Positions short')}</span>
          <span class="cl-stat__value">{gaps.reduce((total, gap) => total + gap.missing, 0)}</span>
        </div>
        <div class="cl-stat">
          <span class="cl-stat__label">{t('Planned shifts')}</span>
          <span class="cl-stat__value">{scheduleDraft.shifts.length}</span>
        </div>
      </div>

      <div class="cl-tablewrap">
        <table class="cl-table">
          <thead>
            <tr>
              <th>{t('Day')}</th>
              <th>{t('Service')}</th>
              <th>{t('Area')}</th>
              <th>{t('Position')}</th>
              <th class="is-num">{t('Required')}</th>
              <th class="is-num">{t('Planned')}</th>
              <th>{t('Status')}</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {#if !gaps.length}
              <tr>
                <td colspan="8">
                  <div class="cl-empty">
                    <strong>{t('Every service is covered')}</strong>
                    <span>{t('Coverage is measured against the requirements set in Restaurant.')}</span>
                  </div>
                </td>
              </tr>
            {:else}
              {#each gaps as gap (`${gap.date}|${gap.serviceKey}|${gap.areaId}|${gap.jobFunctionId}`)}
                {@const weekday = WEEKDAYS[(new Date(`${gap.date}T00:00:00Z`).getUTCDay() + 6) % 7]}
                <tr>
                  <td class="is-quiet">{t(weekday)} {Number(gap.date.slice(-2))}</td>
                  <td class="is-quiet">{t(serviceLabel(gap.serviceKey))}</td>
                  <td>{areaName.get(gap.areaId) ?? t('Any area')}</td>
                  <td>{jobName.get(gap.jobFunctionId) ?? '—'}</td>
                  <td class="is-num">{gap.required}</td>
                  <td class="is-num">{gap.planned}</td>
                  <td>
                    <ClassicStatus
                      label={gap.missing === 1 ? '1 position short' : '{count} positions short'}
                      params={{ count: gap.missing }}
                      tone="problem"
                    />
                  </td>
                  <td class="is-num">
                    <button
                      class="cl-btn"
                      type="button"
                      disabled={!week.editable}
                      onclick={() =>
                        (filling = {
                          weekday: (new Date(`${gap.date}T00:00:00Z`).getUTCDay() + 6) % 7 + 1,
                          serviceKey: gap.serviceKey,
                          areaId: gap.areaId,
                          jobFunctionId: gap.jobFunctionId
                        })}
                    >{t('Fill')}</button>
                  </td>
                </tr>
                {#if filling && filling.weekday === (new Date(`${gap.date}T00:00:00Z`).getUTCDay() + 6) % 7 + 1 && filling.serviceKey === gap.serviceKey && filling.areaId === gap.areaId && filling.jobFunctionId === gap.jobFunctionId}
                  <tr class="picker">
                    <td colspan="8">
                      <div class="picker__head">
                        <strong>{t('Who takes this service?')}</strong>
                        <button class="cl-btn" type="button" onclick={() => (filling = null)}>{t('Close')}</button>
                      </div>
                      <div class="picker__list">
                        {#each candidates(week.weekStart, filling) as candidate (candidate.id)}
                          <button
                            class="picker__person"
                            type="button"
                            disabled={candidate.blocked}
                            onclick={() => fill(week.weekStart, candidate.id)}
                          >
                            <strong>{candidate.name}</strong>
                            <span>{t(candidate.label)}</span>
                          </button>
                        {/each}
                      </div>
                    </td>
                  </tr>
                {/if}
              {/each}
            {/if}
          </tbody>
        </table>
      </div>
    {/snippet}
  </ClassicScheduleWeek>
</ClassicPage>

<style>
  .picker td {
    background: var(--cl-surface-muted);
  }
  .picker__head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    margin-bottom: 10px;
  }
  .picker__list {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(190px, 1fr));
    gap: 8px;
  }
  .picker__person {
    display: grid;
    gap: 2px;
    min-height: 44px;
    padding: 8px 12px;
    border: 1px solid var(--cl-line);
    border-radius: var(--cl-radius);
    background: var(--cl-surface);
    font: inherit;
    text-align: left;
    cursor: pointer;
  }
  .picker__person:hover:not(:disabled) {
    border-color: var(--cl-line-strong);
  }
  .picker__person:disabled {
    color: var(--cl-muted);
    background: transparent;
    cursor: default;
  }
  .picker__person strong {
    font-size: 14px;
    font-weight: var(--rst-fw-medium);
  }
  .picker__person span {
    color: var(--cl-muted);
    font-size: 13px;
  }
</style>

