<script lang="ts">
  import { saveRestaurant } from '$lib/api/mutations';
  import { WEEKDAYS } from '$lib/calendar/date';
  import Drawer from '$lib/components/Drawer.svelte';
  import FeedbackBanner from '$lib/components/FeedbackBanner.svelte';
  import SaveActions from '$lib/components/SaveActions.svelte';
  import {
    restaurantDraft,
    restaurantSavePayload,
    slug,
    type AreaDraft,
    type JobFunctionDraft,
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
  let drawerKind = $state<'area' | 'position' | 'identity' | 'hours' | 'absences' | null>(null);
  let drawerId = $state('');

  $effect(() => {
    if (workspace.activeId && workspace.active?.role === 'owner') {
      void workspace.loadRestaurant(true).catch(() => undefined);
    }
  });

  $effect(() => {
    if (!snapshot) return;
    const key = `${snapshot.restaurant.updated_at}|${snapshot.job_functions.length}|${snapshot.work_areas.length}|${snapshot.opening_hours.length}`;
    if (key === loadedKey) return;
    draft = restaurantDraft(snapshot);
    baseline = JSON.stringify(draft);
    loadedKey = key;
  });

  const dirty = $derived(draft ? JSON.stringify(draft) !== baseline : false);
  const activeAreas = $derived(draft?.areas.filter((item) => item.active).length ?? 0);
  const activePositions = $derived(draft?.jobFunctions.filter((item) => item.active).length ?? 0);
  const openServices = $derived(
    draft?.opening.reduce(
      (sum, day) =>
        sum +
        (day.open && day.lunchStart && day.lunchEnd ? 1 : 0) +
        (day.open && day.eveningStart && day.eveningEnd ? 1 : 0),
      0
    ) ?? 0
  );
  const openDays = $derived(draft?.opening.filter((day) => day.open).length ?? 0);
  const identityComplete = $derived(Boolean(draft?.legalName && draft?.city));
  const readiness = $derived.by(() => {
    const checks = [identityComplete, activeAreas > 0, activePositions > 0, openServices > 0];
    const complete = checks.filter(Boolean).length;
    return { complete, total: checks.length, percent: Math.round((complete / checks.length) * 100) };
  });

  function scrollToSection(id: string) {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function openIdentity() {
    drawerKind = 'identity';
    drawerId = '';
  }

  function openHours() {
    drawerKind = 'hours';
    drawerId = '';
  }

  function openAbsences() {
    drawerKind = 'absences';
    drawerId = '';
  }

  const setupSteps = $derived(
    draft
      ? [
          {
            label: 'Identity',
            detail: identityComplete ? draft.city : 'Legal name and city',
            complete: identityComplete,
            onSelect: openIdentity
          },
          {
            label: 'Hours',
            detail: `${openServices} weekly periods`,
            complete: openServices > 0,
            onSelect: openHours
          },
          {
            label: 'Areas',
            detail: `${activeAreas} active`,
            complete: activeAreas > 0,
            onSelect: () => scrollToSection('section-areas')
          },
          {
            label: 'Positions',
            detail: `${activePositions} active`,
            complete: activePositions > 0,
            onSelect: () => scrollToSection('section-positions')
          },
          {
            label: 'Absences',
            detail: `${snapshot?.absence_types.filter((item) => item.active).length ?? 0} types`,
            complete: true,
            onSelect: openAbsences
          }
        ]
      : []
  );

  const areaDrawerItem = $derived(draft?.areas.find((item) => item.id === drawerId) ?? null);
  const positionDrawerItem = $derived(draft?.jobFunctions.find((item) => item.id === drawerId) ?? null);

  function id() {
    return crypto.randomUUID();
  }

  function openArea(areaId: string) {
    drawerKind = 'area';
    drawerId = areaId;
  }

  function openPosition(positionId: string) {
    drawerKind = 'position';
    drawerId = positionId;
  }

  function closeDrawer() {
    drawerKind = null;
    drawerId = '';
  }

  function addArea() {
    if (!draft) return;
    const item: AreaDraft = {
      id: id(),
      name: '',
      code: '',
      notes: '',
      active: true,
      lunchStart: '',
      lunchEnd: '',
      eveningStart: '',
      eveningEnd: ''
    };
    draft = { ...draft, areas: [...draft.areas, item] };
    openArea(item.id);
  }

  function addPosition() {
    if (!draft) return;
    const item: JobFunctionDraft = { id: id(), name: '', code: '', active: true, estimatedHourlyCost: 0 };
    draft = { ...draft, jobFunctions: [...draft.jobFunctions, item] };
    openPosition(item.id);
  }

  function mutateArea(changes: Partial<AreaDraft>) {
    if (!draft || drawerKind !== 'area') return;
    draft = {
      ...draft,
      areas: draft.areas.map((area) => (area.id === drawerId ? { ...area, ...changes } : area))
    };
  }

  function mutatePosition(changes: Partial<JobFunctionDraft>) {
    if (!draft || drawerKind !== 'position') return;
    draft = {
      ...draft,
      jobFunctions: draft.jobFunctions.map((position) =>
        position.id === drawerId ? { ...position, ...changes } : position
      )
    };
  }

  function cancelChanges() {
    if (!snapshot) return;
    draft = restaurantDraft(snapshot);
    baseline = JSON.stringify(draft);
    feedback = '';
  }

  async function persist() {
    if (!snapshot || !draft || !workspace.activeId || saving) return;
    if (!draft.legalName.trim()) {
      feedback = 'Restaurant legal name is required.';
      feedbackTone = 'danger';
      return;
    }
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
      feedback = 'Restaurant setup saved.';
      feedbackTone = 'success';
    } catch (error) {
      feedback = error instanceof Error ? error.message : String(error);
      feedbackTone = 'danger';
    } finally {
      saving = false;
    }
  }
</script>

<svelte:head><title>Restaurant · restogogo</title></svelte:head>

{#snippet drawerActions()}
  <SaveActions {dirty} busy={saving} saveLabel="Save restaurant" busyLabel="Saving…" oncancel={cancelChanges} onsave={persist} embedded />
{/snippet}

{#if draft && snapshot}
  <section class="page-shell">
    <header class="page-hero" aria-labelledby="restaurant-title">
      <div class="page-hero__copy">
        <span class="page-kicker">Restaurant blueprint</span>
        <h1 id="restaurant-title">
          {readiness.percent === 100
            ? 'The operating model is ready.'
            : `${readiness.total - readiness.complete} foundation${readiness.total - readiness.complete === 1 ? '' : 's'} need attention.`}
        </h1>
        <p>Identity, areas, positions and opening hours are the source of truth behind Schedule and Timesheet. Staffing rules live on the Coverage page.</p>
      </div>
      <div class="page-hero__command" aria-label="Restaurant readiness signal">
        <div class:has-issues={readiness.percent < 100} class="readiness-dial" style={`--ready:${readiness.percent}%`}>
          <strong>{readiness.percent}%</strong>
          <span>ready</span>
        </div>
        <dl class="hero-stats">
          <div class:is-complete={activeAreas > 0}>
            <dt>Areas</dt>
            <dd>{activeAreas}</dd>
          </div>
          <div class:is-complete={activePositions > 0}>
            <dt>Positions</dt>
            <dd>{activePositions}</dd>
          </div>
          <div class:is-complete={openServices > 0}>
            <dt>Services</dt>
            <dd>{openServices}</dd>
          </div>
        </dl>
      </div>
    </header>

    <div class="page-body">
      <FeedbackBanner message={feedback} tone={feedbackTone} />

      <section class="command-grid" aria-label="Restaurant command summary">
        <article class="command-lead">
          <span class="page-kicker">{readiness.percent === 100 ? 'Blueprint ready' : 'Blueprint foundation'}</span>
          <strong>{readiness.percent === 100 ? 'Configuration can support Schedule and Timesheet.' : 'Finish the blueprint before relying on Coverage.'}</strong>
          <p>
            {readiness.total - readiness.complete
              ? `${readiness.total - readiness.complete} section${readiness.total - readiness.complete === 1 ? '' : 's'} still need setup.`
              : 'Every section is ready.'}
          </p>
        </article>
        <nav class="foundation-strip" aria-label="Jump to restaurant section">
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
          <SaveActions {dirty} busy={saving} saveLabel="Save restaurant" busyLabel="Saving…" oncancel={cancelChanges} onsave={persist} embedded />
        </div>
      {/if}

      <section id="section-identity" class="blueprint-row">
        <button type="button" class="glow-card glow-card--sky" onclick={openIdentity}>
          <span class="glow-card__kicker">Restaurant profile</span>
          <strong>{draft.legalName || 'Legal name not set'}</strong>
          <p>
            {[draft.address, draft.postalCode, draft.city].filter(Boolean).join(', ') || 'No address on file'}
          </p>
          <div class="glow-card__stats">
            <div><span>Company number</span><strong>{draft.companyNumber || '—'}</strong></div>
            <div><span>Email</span><strong>{draft.email || '—'}</strong></div>
            <div><span>Phone</span><strong>{draft.phone || '—'}</strong></div>
          </div>
        </button>

        <button type="button" class="glow-card glow-card--forest" onclick={openHours}>
          <span class="glow-card__kicker">Weekly rhythm</span>
          <strong>{openServices} service{openServices === 1 ? '' : 's'} / week</strong>
          <div class="rhythm-dots">
            {#each draft.opening as day (day.weekday)}
              <span class:is-open={day.open} title={WEEKDAYS[day.weekday - 1]}>{WEEKDAYS[day.weekday - 1].slice(0, 2).toUpperCase()}</span>
            {/each}
          </div>
          <p>{openDays}/7 days open</p>
        </button>
      </section>

      <div class="blueprint-columns">
      <section id="section-areas" class="section-shelf">
        <div class="section-head">
          <strong>Areas</strong>
          <span>{activeAreas} active</span>
        </div>
        <p class="section-copy">Physical work areas used by Coverage rules and the schedule board.</p>
        <div class="entity-grid entity-grid--column">
          {#each draft.areas as area, index (area.id)}
            <button
              type="button"
              class="entity-card rst-stagger-in"
              class:is-inactive={!area.active}
              style={`--rst-i:${index}`}
              onclick={() => openArea(area.id)}
            >
              <strong>{area.name || 'Unnamed area'}</strong>
              <small>{area.notes || 'No notes'}</small>
              <div class="entity-card__status">
                <i class:is-active={area.active}></i>
                <span>{area.active ? 'Active' : 'Inactive'}</span>
              </div>
              <div class="entity-card__hover" aria-hidden="true">
                <span>Lunch {area.lunchStart && area.lunchEnd ? `${area.lunchStart}–${area.lunchEnd}` : 'not set'}</span>
                <span>Evening {area.eveningStart && area.eveningEnd ? `${area.eveningStart}–${area.eveningEnd}` : 'not set'}</span>
              </div>
            </button>
          {/each}
          <button type="button" class="ghost-card" onclick={addArea}>
            <span class="ghost-icon">+</span>
            <strong>{draft.areas.length ? 'Add area' : 'Add your first area'}</strong>
          </button>
        </div>
      </section>

      <section id="section-positions" class="section-shelf">
        <div class="section-head">
          <strong>Positions</strong>
          <span>{activePositions} active</span>
        </div>
        <p class="section-copy">The role catalog employees are assigned to from Team.</p>
        <div class="entity-grid entity-grid--column">
          {#each draft.jobFunctions as position, index (position.id)}
            <button
              type="button"
              class="entity-card rst-stagger-in"
              class:is-inactive={!position.active}
              style={`--rst-i:${index}`}
              onclick={() => openPosition(position.id)}
            >
              <strong>{position.name || 'Unnamed position'}</strong>
              <small>{position.estimatedHourlyCost ? `€${position.estimatedHourlyCost}/h estimate` : 'No cost estimate'}</small>
              <div class="entity-card__status">
                <i class:is-active={position.active}></i>
                <span>{position.active ? 'Active' : 'Inactive'}</span>
              </div>
              <div class="entity-card__hover" aria-hidden="true">
                <span>Estimated cost {position.estimatedHourlyCost ? `€${position.estimatedHourlyCost.toFixed(2)} per hour` : 'not set'}</span>
                <span>Reference code {position.code || 'auto-generated on save'}</span>
              </div>
            </button>
          {/each}
          <button type="button" class="ghost-card" onclick={addPosition}>
            <span class="ghost-icon">+</span>
            <strong>{draft.jobFunctions.length ? 'Add position' : 'Add your first position'}</strong>
          </button>
        </div>
      </section>
      </div>
    </div>
  </section>

  <Drawer
    open={drawerKind === 'absences'}
    title="Absence policy"
    description="Fixed, database-seeded leave lifecycle"
    onclose={closeDrawer}
  >
    <div class="absence-types">
      {#each snapshot.absence_types.filter((item) => item.active) as item (item.id)}
        <article>
          <span style:background={item.color}></span>
          <strong>{item.name}</strong>
          <small>{item.paid_policy}</small>
        </article>
      {/each}
    </div>
    <p class="internal-defaults">Holiday, Sick leave, Unpaid leave, Public holiday and Other are seeded by the database. Special cases use the request note.</p>
  </Drawer>

  <Drawer
    open={drawerKind === 'identity'}
    title="Restaurant identity"
    description="Legal profile and contact"
    onclose={closeDrawer}
    actions={drawerActions}
  >
    <div class="fields">
      <label>Legal name<input bind:value={draft.legalName} /></label>
      <label>Company number<input bind:value={draft.companyNumber} /></label>
      <label>Email<input type="email" bind:value={draft.email} /></label>
      <label>Phone<input bind:value={draft.phone} /></label>
      <label class="wide">Address<input bind:value={draft.address} /></label>
      <label>Postal code<input bind:value={draft.postalCode} /></label>
      <label>City<input bind:value={draft.city} /></label>
    </div>
    <p class="internal-defaults">Internal defaults: Belgium · Europe/Brussels · fr-BE · EUR.</p>
  </Drawer>

  <Drawer
    open={drawerKind === 'hours'}
    title="Weekly service periods"
    description="Lunch and evening"
    onclose={closeDrawer}
    actions={drawerActions}
  >
    <div class="hours-grid">
      {#each draft.opening as day (day.weekday)}
        <div class="day-card" class:is-closed={!day.open}>
          <header>
            <strong>{WEEKDAYS[day.weekday - 1]}</strong>
            <label class="day-toggle">
              <input type="checkbox" bind:checked={day.open} aria-label={`${WEEKDAYS[day.weekday - 1]} open`} />
              <span></span>
            </label>
          </header>
          <div class="day-service">
            <span class="day-service__icon" aria-hidden="true">☀</span>
            <input type="time" disabled={!day.open} bind:value={day.lunchStart} aria-label="Lunch start" />
            <span aria-hidden="true">–</span>
            <input type="time" disabled={!day.open} bind:value={day.lunchEnd} aria-label="Lunch end" />
          </div>
          <div class="day-service">
            <span class="day-service__icon" aria-hidden="true">☾</span>
            <input type="time" disabled={!day.open} bind:value={day.eveningStart} aria-label="Evening start" />
            <span aria-hidden="true">–</span>
            <input type="time" disabled={!day.open} bind:value={day.eveningEnd} aria-label="Evening end" />
          </div>
        </div>
      {/each}
    </div>
  </Drawer>

  <Drawer
    open={drawerKind === 'area' && Boolean(areaDrawerItem)}
    title={areaDrawerItem?.name || 'New area'}
    description="Work area"
    onclose={closeDrawer}
    actions={drawerActions}
  >
    {#if areaDrawerItem}
      <div class="fields">
        <label class="wide">
          Area name
          <input
            value={areaDrawerItem.name}
            oninput={(event) => {
              const name = event.currentTarget.value;
              mutateArea({ name, code: areaDrawerItem?.code || slug(name, areaDrawerItem?.id.slice(0, 8) ?? 'area') });
            }}
            placeholder="Salle, Cuisine, Bar…"
          />
        </label>
        <label class="wide">Notes<input value={areaDrawerItem.notes} oninput={(event) => mutateArea({ notes: event.currentTarget.value })} placeholder="Optional notes" /></label>
        <label>Lunch start<input type="time" value={areaDrawerItem.lunchStart} oninput={(event) => mutateArea({ lunchStart: event.currentTarget.value })} /></label>
        <label>Lunch end<input type="time" value={areaDrawerItem.lunchEnd} oninput={(event) => mutateArea({ lunchEnd: event.currentTarget.value })} /></label>
        <label>Evening start<input type="time" value={areaDrawerItem.eveningStart} oninput={(event) => mutateArea({ eveningStart: event.currentTarget.value })} /></label>
        <label>Evening end<input type="time" value={areaDrawerItem.eveningEnd} oninput={(event) => mutateArea({ eveningEnd: event.currentTarget.value })} /></label>
        <label class="check"><input type="checkbox" checked={areaDrawerItem.active} onchange={(event) => mutateArea({ active: event.currentTarget.checked })} /> Active area</label>
      </div>
    {/if}
  </Drawer>

  <Drawer
    open={drawerKind === 'position' && Boolean(positionDrawerItem)}
    title={positionDrawerItem?.name || 'New position'}
    description="Position / job function"
    onclose={closeDrawer}
    actions={drawerActions}
  >
    {#if positionDrawerItem}
      <div class="fields">
        <label class="wide">
          Position name
          <input
            value={positionDrawerItem.name}
            oninput={(event) => {
              const name = event.currentTarget.value;
              mutatePosition({ name, code: positionDrawerItem?.code || slug(name, positionDrawerItem?.id.slice(0, 8) ?? 'position') });
            }}
            placeholder="Chef de rang, Plongeur…"
          />
        </label>
        <label>Estimated hourly cost<input type="number" min="0" step="0.01" value={positionDrawerItem.estimatedHourlyCost} oninput={(event) => mutatePosition({ estimatedHourlyCost: event.currentTarget.valueAsNumber || 0 })} /></label>
        <label class="check"><input type="checkbox" checked={positionDrawerItem.active} onchange={(event) => mutatePosition({ active: event.currentTarget.checked })} /> Active position</label>
      </div>
    {/if}
  </Drawer>
{/if}

<style>
  :global(html),
  :global(.app__content) {
    scroll-behavior: smooth;
  }

  .blueprint-row {
    display: grid;
    grid-template-columns: minmax(0, 1.4fr) minmax(0, 1fr);
    gap: 12px;
    scroll-margin-top: 90px;
  }

  .blueprint-columns {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 16px;
    align-items: start;
  }

  .blueprint-columns .section-shelf {
    margin: 0;
  }

  .entity-grid--column {
    grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
  }

  .rhythm-dots { display: flex; flex-wrap: wrap; gap: 6px; }
  .rhythm-dots span {
    width: 26px;
    height: 26px;
    display: grid;
    place-items: center;
    border-radius: 999px;
    color: rgba(255, 250, 242, .5);
    background: rgba(255, 255, 255, .12);
    font-size: 9px;
    font-weight: var(--rst-fw-display);
  }
  .rhythm-dots span.is-open {
    color: #fff;
    background: var(--rst-state-success);
  }

  .internal-defaults {
    margin: 0;
    padding: 12px 0 0;
    color: var(--rst-ui-muted);
    font-size: 11px;
  }

  .absence-types {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
    gap: 8px;
  }

  .absence-types article {
    display: grid;
    gap: 5px;
    padding: 12px;
    border: 1px solid var(--rst-ui-line);
    border-radius: var(--rst-ui-radius-md);
    background: #fff;
    box-shadow: 0 2px 4px rgba(31, 22, 15, 0.05), 0 10px 22px rgba(31, 22, 15, 0.07);
  }

  .absence-types article > span {
    width: 12px;
    height: 12px;
    border-radius: 50%;
  }

  .absence-types small {
    color: var(--rst-ui-muted);
    text-transform: capitalize;
  }

  .hours-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
    gap: 10px;
    padding: 14px;
  }

  .day-card {
    display: grid;
    gap: 8px;
    padding: 12px;
    border: 1px solid var(--rst-ui-line);
    border-radius: var(--rst-ui-radius-lg);
    background: linear-gradient(135deg, rgba(66, 216, 132, 0.09), transparent 60%), var(--rst-ui-surface-field);
    transition: opacity .15s ease;
  }

  .day-card.is-closed {
    opacity: .55;
    background: var(--rst-ui-surface-field);
  }

  .day-card header {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .day-card header strong {
    color: var(--rst-ui-text);
    font-size: 13px;
    letter-spacing: .04em;
    text-transform: uppercase;
  }

  .day-toggle {
    position: relative;
    width: 30px;
    height: 18px;
    display: inline-block;
    flex: 0 0 auto;
  }

  .day-toggle input {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    margin: 0;
    opacity: 0;
    cursor: pointer;
  }

  .day-toggle span {
    position: absolute;
    inset: 0;
    border-radius: 999px;
    background: var(--rst-ui-quiet);
    transition: background-color .15s ease;
  }

  .day-toggle span::before {
    content: '';
    position: absolute;
    top: 2px;
    left: 2px;
    width: 14px;
    height: 14px;
    border-radius: 50%;
    background: #fff;
    transition: transform .15s var(--rst-ease-out);
  }

  .day-toggle input:checked + span {
    background: var(--rst-state-success);
  }

  .day-toggle input:checked + span::before {
    transform: translateX(12px);
  }

  .day-service {
    display: grid;
    grid-template-columns: 16px 1fr auto 1fr;
    align-items: center;
    gap: 4px;
    color: var(--rst-ui-muted);
    font-size: 11px;
  }

  .day-service__icon {
    font-size: 12px;
  }

  .day-service input[type='time'] {
    min-width: 0;
    padding: 4px 5px;
    border: 1px solid var(--rst-ui-line);
    border-radius: var(--rst-ui-radius-sm);
    color: var(--rst-ui-text);
    background: var(--rst-ui-surface-field-strong);
    font-size: 11px;
  }

  @media (max-width: 1180px) {
    .blueprint-row,
    .blueprint-columns {
      grid-template-columns: 1fr;
    }
  }

</style>
