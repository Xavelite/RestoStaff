<script lang="ts">
  import { saveRestaurant } from '$lib/api/mutations';
  import { WEEKDAYS, type ServiceKey } from '$lib/calendar/date';
  import ActionButton from '$lib/components/ActionButton.svelte';
  import FeedbackBanner from '$lib/components/FeedbackBanner.svelte';
  import SaveActions from '$lib/components/SaveActions.svelte';
  import {
    restaurantDraft,
    restaurantSavePayload,
    type CoverageDraft,
    type RestaurantDraft
  } from '$lib/restaurant/restaurant-model';
  import { workspaceRealtime } from '$lib/realtime/workspace-realtime.svelte';
  import { workspace } from '$lib/workspace/workspace.svelte';

  const snapshot = $derived(workspace.restaurant);
  let draft = $state<RestaurantDraft | null>(null);
  let baseline = $state('');
  let loadedKey = $state('');
  let saving = $state(false);
  let feedback = $state('');
  let feedbackTone = $state<'info' | 'success' | 'warning' | 'danger'>('info');

  $effect(() => {
    if (workspace.activeId && workspace.active?.role === 'owner') {
      void workspace.loadRestaurant(true).catch(() => undefined);
    }
  });

  $effect(() => {
    if (!snapshot) return;
    const key = `${snapshot.restaurant.updated_at}|${snapshot.job_functions.length}|${snapshot.work_areas.length}|${snapshot.coverage_requirements.length}`;
    if (key === loadedKey) return;
    draft = restaurantDraft(snapshot);
    baseline = JSON.stringify(draft);
    loadedKey = key;
  });

  const dirty = $derived(draft ? JSON.stringify(draft) !== baseline : false);
  const activeAreasList = $derived(draft?.areas.filter((item) => item.active) ?? []);
  const activePositions = $derived(draft?.jobFunctions.filter((item) => item.active) ?? []);
  const openServiceKeys = $derived(
    (['lunch', 'evening'] as ServiceKey[]).filter((service) =>
      draft?.opening.some((day) =>
        day.open && (service === 'lunch' ? day.lunchStart && day.lunchEnd : day.eveningStart && day.eveningEnd)
      )
    )
  );
  const totalCombos = $derived(activeAreasList.length * openServiceKeys.length);
  const coveredCombos = $derived(
    activeAreasList.reduce(
      (count, area) =>
        count +
        openServiceKeys.filter((service) => draft?.coverage.some((rule) => rule.areaId === area.id && rule.serviceKey === service))
          .length,
      0
    )
  );
  const readiness = $derived.by(() => ({
    complete: coveredCombos,
    total: totalCombos,
    percent: totalCombos ? Math.round((coveredCombos / totalCombos) * 100) : 100
  }));
  const areasWithRules = $derived(
    activeAreasList.filter((area) => draft?.coverage.some((rule) => rule.areaId === area.id)).length
  );
  const positionsUsed = $derived(
    activePositions.filter((position) => draft?.coverage.some((rule) => rule.jobFunctionId === position.id)).length
  );
  const totalRules = $derived(draft?.coverage.length ?? 0);
  function scrollToWorkbench() {
    document.getElementById('coverage-workbench')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  const setupSteps = $derived(
    draft
      ? [
          {
            label: 'Areas with rules',
            detail: `${areasWithRules}/${activeAreasList.length}`,
            complete: activeAreasList.length > 0 && areasWithRules === activeAreasList.length,
            onSelect: scrollToWorkbench
          },
          {
            label: 'Positions used',
            detail: `${positionsUsed}/${activePositions.length}`,
            complete: activePositions.length > 0 && positionsUsed === activePositions.length,
            onSelect: scrollToWorkbench
          },
          {
            label: 'Rules configured',
            detail: `${totalRules} total`,
            complete: totalRules > 0,
            onSelect: scrollToWorkbench
          }
        ]
      : []
  );

  function id() {
    return crypto.randomUUID();
  }

  function rulesForArea(areaId: string): CoverageDraft[] {
    return draft?.coverage.filter((item) => item.areaId === areaId) ?? [];
  }

  function addRule(areaId: string) {
    if (!draft) return;
    const item: CoverageDraft = {
      id: id(),
      areaId,
      jobFunctionId: activePositions[0]?.id ?? '',
      serviceKey: 'lunch',
      coverageScope: 'default',
      weekday: 1,
      requiredCount: 1
    };
    draft = { ...draft, coverage: [...draft.coverage, item] };
  }

  function removeRule(ruleId: string) {
    if (!draft) return;
    draft = { ...draft, coverage: draft.coverage.filter((item) => item.id !== ruleId) };
  }

  function cancelChanges() {
    if (!snapshot) return;
    draft = restaurantDraft(snapshot);
    baseline = JSON.stringify(draft);
    feedback = '';
  }

  async function persist() {
    if (!snapshot || !draft || !workspace.activeId || saving) return;
    saving = true;
    try {
      await saveRestaurant(workspace.activeId, restaurantSavePayload(snapshot, draft));
      await workspace.loadRestaurant(true);
      if (workspace.restaurant) {
        baseline = JSON.stringify(restaurantDraft(workspace.restaurant));
      }
      await workspaceRealtime.publish('restaurant-updated', {
        restaurantId: workspace.activeId,
        source: 'restaurant'
      });
      feedback = 'Coverage rules saved.';
      feedbackTone = 'success';
    } catch (error) {
      feedback = error instanceof Error ? error.message : String(error);
      feedbackTone = 'danger';
    } finally {
      saving = false;
    }
  }
</script>

<svelte:head><title>Coverage · restogogo</title></svelte:head>

{#if draft && snapshot}
  <section class="page-shell coverage-page">
    <header class="page-hero coverage-hero" aria-labelledby="coverage-title">
      <div class="page-hero__copy">
        <span class="page-kicker">Staffing rules</span>
        <h1 id="coverage-title">
          {totalCombos === 0
            ? 'Add areas and opening hours first.'
            : readiness.percent === 100
              ? 'Every open service has a staffing rule.'
              : `${readiness.total - readiness.complete} area × service combo${readiness.total - readiness.complete === 1 ? '' : 's'} still need a rule.`}
        </h1>
        <p>Minimum-staffing rules by area, position and service are what Schedule checks every week to flag coverage gaps.</p>
      </div>
      <div class="page-hero__command" aria-label="Coverage readiness signal">
        <div class:has-issues={readiness.percent < 100} class="readiness-dial" style={`--ready:${readiness.percent}%`}>
          <strong>{readiness.percent}%</strong>
          <span>covered</span>
        </div>
        <dl class="hero-stats">
          <div class:is-complete={areasWithRules === activeAreasList.length && activeAreasList.length > 0}>
            <dt>Areas</dt>
            <dd>{areasWithRules}/{activeAreasList.length}</dd>
          </div>
          <div class:is-complete={positionsUsed === activePositions.length && activePositions.length > 0}>
            <dt>Positions</dt>
            <dd>{positionsUsed}/{activePositions.length}</dd>
          </div>
          <div class:is-complete={totalRules > 0}>
            <dt>Rules</dt>
            <dd>{totalRules}</dd>
          </div>
        </dl>
      </div>
    </header>

    <div class="page-body coverage-body">
      <FeedbackBanner message={feedback} tone={feedbackTone} />

      <section class="command-grid coverage-command" aria-label="Coverage command summary">
        <article class="command-lead">
          <span class="page-kicker">{readiness.percent === 100 && totalCombos > 0 ? 'Rules ready' : 'Rules foundation'}</span>
          <strong>{readiness.percent === 100 && totalCombos > 0 ? 'Schedule can check every open service.' : 'Every open area needs at least one rule.'}</strong>
          <p>Areas and positions are managed on the Restaurant page. Rules here decide the minimum headcount Schedule expects.</p>
        </article>
        <nav class="foundation-strip" aria-label="Jump to coverage workbench">
          {#each setupSteps as step}
            <button type="button" class:is-complete={step.complete} onclick={() => step.onSelect()}>
              <span>{step.complete ? '✓' : '!'}</span>
              <strong>{step.label}</strong>
              <small>{step.detail}</small>
            </button>
          {/each}
        </nav>
      </section>

      {#if dirty}
        <div class="dirty-toolbar">
          <SaveActions {dirty} busy={saving} saveLabel="Save coverage" busyLabel="Saving…" oncancel={cancelChanges} onsave={persist} embedded />
        </div>
      {/if}

      <div id="coverage-workbench" class="coverage-workbench">
        {#each activeAreasList as area, index (area.id)}
          <section class="coverage-area rst-stagger-in" style={`--rst-i:${index}`}>
            <div class="section-head">
              <strong>{area.name || 'Unnamed area'}</strong>
              <span>{rulesForArea(area.id).length} rule{rulesForArea(area.id).length === 1 ? '' : 's'}</span>
            </div>
            <div class="coverage-rules">
              {#each rulesForArea(area.id) as rule (rule.id)}
                <div class="coverage-rule">
                  <span class="coverage-rule__marker" class:is-evening={rule.serviceKey === 'evening'} aria-hidden="true">
                    {rule.serviceKey === 'lunch' ? '☀' : '☾'}
                  </span>
                  <div class="coverage-rule__fields">
                    <select aria-label="Position" bind:value={rule.jobFunctionId}>
                      <option value="">Position</option>
                      {#each activePositions as position (position.id)}<option value={position.id}>{position.name}</option>{/each}
                    </select>
                    <select aria-label="Service" bind:value={rule.serviceKey}>
                      <option value="lunch">Lunch</option>
                      <option value="evening">Evening</option>
                    </select>
                    <select aria-label="Scope" bind:value={rule.coverageScope}>
                      <option value="default">Every open day</option>
                      <option value="weekday">Specific weekday</option>
                    </select>
                    {#if rule.coverageScope === 'weekday'}
                      <select aria-label="Weekday" bind:value={rule.weekday}>
                        {#each WEEKDAYS as day, dayIndex}<option value={dayIndex + 1}>{day}</option>{/each}
                      </select>
                    {/if}
                  </div>
                  <label class="coverage-rule__count">
                    <input aria-label="Required employees" type="number" min="0" bind:value={rule.requiredCount} />
                    <span>needed</span>
                  </label>
                  <ActionButton label="Remove" tone="danger" onclick={() => removeRule(rule.id)} />
                </div>
              {/each}
              <button type="button" class="coverage-rule coverage-rule--ghost" onclick={() => addRule(area.id)}>
                <span class="ghost-icon">+</span>
                <strong>Add rule</strong>
              </button>
            </div>
          </section>
        {:else}
          <p class="empty">Add an active work area on the Restaurant page before configuring coverage rules.</p>
        {/each}
      </div>
    </div>
  </section>
{/if}

<style>
  .coverage-hero {
    --hero-tint: rgba(240, 100, 35, 0.26);
  }

  .coverage-workbench {
    display: grid;
    gap: 22px;
  }

  .coverage-area {
    display: grid;
    gap: 10px;
    animation: rst-fade-up 0.4s var(--rst-ease-out) backwards;
    animation-delay: calc(var(--rst-i, 0) * 60ms);
  }

  .coverage-rules {
    display: grid;
    gap: 8px;
  }

  .coverage-rule {
    display: grid;
    grid-template-columns: 40px minmax(0, 1fr) auto auto;
    align-items: center;
    gap: 12px;
    padding: 10px 16px;
    border: 1px solid var(--rst-ui-line);
    border-radius: var(--rst-ui-radius-xl);
    background: #fff;
    box-shadow: 0 2px 4px rgba(31, 22, 15, 0.05), 0 10px 22px rgba(31, 22, 15, 0.07);
    animation: rst-fade-up .3s var(--rst-ease-out) backwards;
  }

  .coverage-rule--ghost {
    grid-template-columns: 40px auto;
    border: 1.5px dashed rgba(var(--rst-ui-action-rgb), 0.45);
    background: rgba(var(--rst-ui-action-rgb), 0.06);
    box-shadow: none;
    color: var(--rst-ui-action);
    font: inherit;
    text-align: left;
    cursor: pointer;
    transition: border-color .15s ease, background-color .15s ease;
  }

  .coverage-rule--ghost:hover {
    border-color: var(--rst-ui-action);
    background: rgba(var(--rst-ui-action-rgb), 0.12);
  }

  .coverage-rule--ghost strong {
    color: var(--rst-ui-action);
    font-weight: var(--rst-fw-bold);
  }

  .coverage-rule--ghost .ghost-icon {
    width: 40px;
    height: 40px;
    display: grid;
    place-items: center;
    border-radius: var(--rst-ui-radius-lg);
    color: #fff;
    background: var(--rst-ui-action);
    font-size: 18px;
    font-weight: var(--rst-fw-display);
    box-shadow: 0 6px 16px rgba(var(--rst-ui-action-rgb), 0.35);
  }

  .coverage-rule__marker {
    width: 40px;
    height: 40px;
    flex: 0 0 auto;
    display: grid;
    place-items: center;
    border-radius: var(--rst-ui-radius-lg);
    color: #3c2a06;
    background: #ffe4a3;
    font-size: 16px;
  }

  .coverage-rule__marker.is-evening {
    color: #17304f;
    background: #cfe0ff;
  }

  .coverage-rule__fields {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(110px, 1fr));
    gap: 8px;
  }

  .coverage-rule__count {
    display: grid;
    justify-items: center;
    gap: 3px;
  }

  .coverage-rule__count input {
    width: 52px;
    height: 40px;
    padding: 0;
    border: 1px solid var(--rst-ui-line);
    border-radius: var(--rst-ui-radius-lg);
    background: var(--rst-ui-surface-field-strong);
    text-align: center;
    font-size: 16px;
    font-weight: var(--rst-fw-display);
  }

  .coverage-rule__count input:focus-visible {
    border-color: var(--rst-ui-action);
    box-shadow: 0 0 0 3px rgba(var(--rst-ui-action-rgb), .18);
  }

  .coverage-rule__count span {
    color: var(--rst-ui-muted);
    font-size: 9px;
    font-weight: var(--rst-fw-bold);
    letter-spacing: .04em;
    text-transform: uppercase;
  }

  .empty {
    padding: 28px;
    color: var(--rst-ui-muted);
    text-align: center;
  }

  select,
  input {
    min-width: 0;
    min-height: 36px;
    padding: 6px 2px;
    border: 0;
    border-bottom: 1.5px solid var(--rst-ui-line);
    border-radius: 0;
    color: var(--rst-ui-text);
    background: transparent;
    font: inherit;
    transition: border-color .15s ease, box-shadow .15s ease;
  }

  select:focus-visible,
  input:focus-visible {
    border-bottom-color: var(--rst-ui-action);
    outline: none;
    box-shadow: 0 1.5px 0 0 var(--rst-ui-action);
  }

  @media (max-width: 760px) {
    .coverage-rule {
      grid-template-columns: 1fr;
    }

    .coverage-rule--ghost {
      grid-template-columns: 40px auto;
    }
  }
</style>
