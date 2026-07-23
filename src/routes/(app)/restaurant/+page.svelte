<script lang="ts">
  import {
    saveRestaurant,
    createRestaurantStation,
    revokeRestaurantStation,
    listRestaurantStations,
    type RestaurantStation
  } from '$lib/api/mutations';
  import { friendlyError } from '$lib/api/error-messages';
  import { WEEKDAYS, serviceLabel, todayInTimezone, type ServiceKey } from '$lib/calendar/date';
  import Drawer from '$lib/components/Drawer.svelte';
  import HeroReadiness from '$lib/components/HeroReadiness.svelte';
  import PageHero from '$lib/components/PageHero.svelte';
  import FeedbackBanner from '$lib/components/FeedbackBanner.svelte';
  import SaveActions from '$lib/components/SaveActions.svelte';
  import { i18n, t } from '$lib/i18n/i18n.svelte';
  import {
    restaurantDraft,
    restaurantSavePayload,
    setupItemCode,
    type AreaDraft,
    type CoverageDraft,
    type JobFunctionDraft,
    type RestaurantDraft
  } from '$lib/restaurant/restaurant-model';
  import { workspaceRealtime } from '$lib/realtime/workspace-realtime.svelte';
  import { buildPositionColorMap } from '$lib/ui/position-color';
  import {
    LOGO_ACCEPT,
    removeRestaurantLogo,
    restaurantLogoUrl,
    uploadRestaurantLogo
  } from '$lib/restaurant/logo-api';
  import { confirmAction } from '$lib/ui/confirm.svelte';
  import { workspace } from '$lib/workspace/workspace.svelte';
  import RestaurantPayrollSetup from '$lib/payroll/RestaurantPayrollSetup.svelte';

  const snapshot = $derived(workspace.restaurant);
  const positionColorMap = $derived(
    snapshot ? buildPositionColorMap(snapshot.job_functions) : new Map<string, string>()
  );
  let draft = $state<RestaurantDraft | null>(null);
  let baseline = $state('');
  let loadedKey = $state('');
  let saving = $state(false);
  let feedback = $state('');
  let feedbackTone = $state<'info' | 'success' | 'warning' | 'danger'>('info');
  let drawerKind = $state<'area' | 'position' | 'identity' | 'hours' | 'absences' | null>(null);
  let drawerId = $state('');

  // Paired badge devices (station credentials).
  let stations = $state<RestaurantStation[]>([]);
  let stationBusy = $state(false);
  let stationError = $state('');
  let newStation = $state<{ token: string; url: string } | null>(null);
  let copied = $state(false);

  $effect(() => {
    if (workspace.activeId && workspace.active?.role === 'owner') {
      void workspace.loadRestaurant(true).catch(() => undefined);
    }
  });

  $effect(() => {
    if (!workspace.activeId) return;
    void reloadStations();
  });

  async function reloadStations() {
    if (!workspace.activeId) return;
    try {
      stations = await listRestaurantStations(workspace.activeId);
    } catch (error) {
      stationError = friendlyError(error);
    }
  }

  async function pairDevice() {
    if (!workspace.activeId || stationBusy) return;
    stationBusy = true;
    stationError = '';
    newStation = null;
    try {
      const { token } = await createRestaurantStation(workspace.activeId, 'Badge tablet');
      newStation = { token, url: `${location.origin}/station` };
      await reloadStations();
    } catch (error) {
      stationError = friendlyError(error);
    } finally {
      stationBusy = false;
    }
  }

  // The logo is uploaded immediately rather than held in the draft: it is a
  // file, not a field, and saving the blueprint should not depend on it.
  let logoBusy = $state(false);
  let logoError = $state('');
  let logoVersion = $state(0);
  const logoUrl = $derived.by(() => {
    const url = restaurantLogoUrl(snapshot?.restaurant.logo_path);
    return url && logoVersion ? `${url}?v=${logoVersion}` : url;
  });

  async function handleLogoChange(event: Event & { currentTarget: HTMLInputElement }) {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = '';
    if (!file || !workspace.activeId || logoBusy) return;
    logoBusy = true;
    logoError = '';
    try {
      await uploadRestaurantLogo(
        workspace.activeId,
        file,
        snapshot?.restaurant.logo_path ?? null
      );
      await workspace.loadRestaurant(true);
      logoVersion = Date.now();
    } catch (error) {
      logoError = friendlyError(error);
    } finally {
      logoBusy = false;
    }
  }

  async function removeLogo() {
    if (!workspace.activeId || logoBusy) return;
    const confirmed = await confirmAction({
      title: 'Remove the restaurant logo?',
      body: 'Your badge terminal and paired devices go back to showing the restaurant name.',
      confirmLabel: 'Remove logo'
    });
    if (!confirmed) return;
    logoBusy = true;
    logoError = '';
    try {
      await removeRestaurantLogo(workspace.activeId, snapshot?.restaurant.logo_path ?? null);
      await workspace.loadRestaurant(true);
      logoVersion = Date.now();
    } catch (error) {
      logoError = friendlyError(error);
    } finally {
      logoBusy = false;
    }
  }

  async function revokeStation(id: string) {
    if (!workspace.activeId || stationBusy) return;
    const confirmed = await confirmAction({
      title: 'Revoke this badge device?',
      body: 'The tablet stops working immediately and staff can no longer clock in on it. You can pair it again with a new code.',
      confirmLabel: 'Revoke device'
    });
    if (!confirmed) return;
    stationBusy = true;
    stationError = '';
    try {
      await revokeRestaurantStation(workspace.activeId, id);
      newStation = null;
      await reloadStations();
    } catch (error) {
      stationError = friendlyError(error);
    } finally {
      stationBusy = false;
    }
  }

  function formatStationTime(value: string) {
    return new Intl.DateTimeFormat(i18n.intlLocale, {
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit'
    }).format(new Date(value));
  }

  async function copyStationCode() {
    if (!newStation) return;
    try {
      await navigator.clipboard.writeText(newStation.token);
      copied = true;
      setTimeout(() => (copied = false), 1600);
    } catch {
      copied = false;
    }
  }

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
            detail: identityComplete ? draft.city : t('Legal name and city'),
            complete: identityComplete,
            onSelect: openIdentity
          },
          {
            label: 'Hours',
            detail: t('{count} weekly periods', { count: openServices }),
            complete: openServices > 0,
            onSelect: openHours
          },
          {
            label: 'Areas',
            detail: t('{count} active', { count: activeAreas }),
            complete: activeAreas > 0,
            onSelect: () => scrollToSection('section-areas')
          },
          {
            label: 'Positions',
            detail: t('{count} active', { count: activePositions }),
            complete: activePositions > 0,
            onSelect: () => scrollToSection('section-positions')
          },
          {
            label: 'Absences',
            detail: t('{count} types', { count: snapshot?.absence_types.filter((item) => item.active).length ?? 0 }),
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

  // Coverage is edited where managers think about it: inside each area's
  // staffing rules, saved through the restaurant model RPC.
  const activePositionList = $derived(draft?.jobFunctions.filter((item) => item.active) ?? []);

  function areaCoverage(areaId: string): CoverageDraft[] {
    return draft?.coverage.filter((rule) => rule.areaId === areaId) ?? [];
  }

  function areaCoverageSummary(areaId: string) {
    const rules = areaCoverage(areaId);
    const sum = (service: ServiceKey) =>
      rules
        .filter((rule) => rule.serviceKey === service)
        .reduce((total, rule) => total + Math.max(0, Math.round(rule.requiredCount) || 0), 0);
    return { count: rules.length, lunch: sum('lunch'), evening: sum('evening') };
  }

  function positionRuleCount(positionId: string): number {
    return draft?.coverage.filter((rule) => rule.jobFunctionId === positionId).length ?? 0;
  }

  function addCoverageRule(areaId: string) {
    if (!draft) return;
    const rule: CoverageDraft = {
      id: id(),
      areaId,
      jobFunctionId: activePositionList[0]?.id ?? '',
      serviceKey: 'lunch',
      coverageScope: 'default',
      weekday: 1,
      requiredCount: 1
    };
    draft = { ...draft, coverage: [...draft.coverage, rule] };
  }

  function mutateCoverage(ruleId: string, changes: Partial<CoverageDraft>) {
    if (!draft) return;
    draft = {
      ...draft,
      coverage: draft.coverage.map((rule) => (rule.id === ruleId ? { ...rule, ...changes } : rule))
    };
  }

  function removeCoverageRule(ruleId: string) {
    if (!draft) return;
    draft = { ...draft, coverage: draft.coverage.filter((rule) => rule.id !== ruleId) };
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
      feedback = t('Restaurant legal name is required.');
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
      feedback = t('Restaurant setup saved.');
      feedbackTone = 'success';
    } catch (error) {
      feedback = error instanceof Error ? error.message : String(error);
      feedbackTone = 'danger';
    } finally {
      saving = false;
    }
  }
</script>

<svelte:head><title>{t('Restaurant')} · restogogo</title></svelte:head>

{#snippet drawerActions()}
  <SaveActions {dirty} busy={saving} saveLabel="Save restaurant" busyLabel="Saving…" oncancel={cancelChanges} onsave={persist} embedded showCleanActions={false} />
{/snippet}

{#if draft && snapshot}
  <section class="page-shell">
    <PageHero
      eyebrow="Restaurant blueprint"
      titleId="restaurant-title"
      title={readiness.percent === 100
        ? t('The operating model is ready.')
        : t('{count} foundations need attention.', { count: readiness.total - readiness.complete })}
      subtitle="Identity, areas, positions and opening hours are the source of truth behind Schedule and Timesheet. Set each area's staffing rules right inside its card."
    >
      {#snippet command()}
        <HeroReadiness
          percent={readiness.percent}
          label="Restaurant readiness signal"
          cards={[
            { label: 'Areas', value: activeAreas, complete: activeAreas > 0 },
            { label: 'Positions', value: activePositions, complete: activePositions > 0 },
            { label: 'Services', value: openServices, complete: openServices > 0 }
          ]}
        />
      {/snippet}
    </PageHero>

    <div class="page-body">
      <FeedbackBanner message={feedback} tone={feedbackTone} />

      <section class="command-grid" aria-label={t('Restaurant command summary')} data-tour="rest-blueprint">
        <article class="command-lead">
          <span class="page-kicker">{t(readiness.percent === 100 ? 'Blueprint ready' : 'Blueprint foundation')}</span>
          <strong>{t(readiness.percent === 100 ? 'Configuration can support Schedule and Timesheet.' : 'Finish the blueprint before relying on Coverage.')}</strong>
          <p>
            {readiness.total - readiness.complete
              ? t('{count} sections still need setup.', { count: readiness.total - readiness.complete })
              : t('Every section is ready.')}
          </p>
        </article>
        <nav class="foundation-strip" aria-label={t('Jump to restaurant section')} data-tour="rest-nav">
          {#each setupSteps as step}
            <button type="button" class:is-complete={step.complete} onclick={() => step.onSelect()}>
              <span>{step.complete ? '✓' : '!'}</span>
              <strong>{t(step.label)}</strong>
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

      <section id="section-identity" class="blueprint-row" data-tour="rest-identity">
        <button type="button" class="glow-card glow-card--sky" onclick={openIdentity}>
          <span class="glow-card__kicker">{t('Restaurant profile')}</span>
          <strong>{draft.legalName || t('Legal name not set')}</strong>
          <p>
            {[draft.address, draft.postalCode, draft.city].filter(Boolean).join(', ') || t('No address on file')}
          </p>
          <div class="glow-card__stats">
            <div><span>{t('Company number')}</span><strong>{draft.companyNumber || '—'}</strong></div>
            <div><span>{t('Email')}</span><strong>{draft.email || '—'}</strong></div>
            <div><span>{t('Phone')}</span><strong>{draft.phone || '—'}</strong></div>
          </div>
        </button>

        <button type="button" class="glow-card glow-card--forest" onclick={openHours}>
          <span class="glow-card__kicker">{t('Weekly rhythm')}</span>
          <strong>{t('{count} services / week', { count: openServices })}</strong>
          <div class="rhythm-dots">
            {#each draft.opening as day (day.weekday)}
              <span class:is-open={day.open} title={t(WEEKDAYS[day.weekday - 1])}>{t(WEEKDAYS[day.weekday - 1]).slice(0, 2).toUpperCase()}</span>
            {/each}
          </div>
          <p>{t('{count}/7 days open', { count: openDays })}</p>
        </button>
      </section>

      <div class="blueprint-columns">
      <section id="section-areas" class="section-shelf" data-tour="rest-areas">
        <div class="section-head">
          <strong>{t('Areas')}</strong>
          <span>{t('{count} active', { count: activeAreas })}</span>
        </div>
        <p class="section-copy">{t('Physical work areas and their lunch/evening staffing minimums for the schedule board.')}</p>
        <div class="entity-grid entity-grid--column">
          {#each draft.areas as area, index (area.id)}
            {@const cov = areaCoverageSummary(area.id)}
            <button
              type="button"
              class="entity-card rst-stagger-in"
              class:is-inactive={!area.active}
              style={`--rst-i:${index}`}
              onclick={() => openArea(area.id)}
            >
              <strong>{area.name || t('Unnamed area')}</strong>
              <small>{area.notes || t('No notes')}</small>
              <div class="area-coverage" aria-label={t('Staffing minimums')}>
                <span class:is-set={cov.lunch > 0}><i aria-hidden="true">☀</i><b>{t('Lunch')}</b><strong>{cov.lunch || '—'}</strong></span>
                <span class:is-set={cov.evening > 0}><i aria-hidden="true">☾</i><b>{t('Evening')}</b><strong>{cov.evening || '—'}</strong></span>
              </div>
              <div class="entity-card__status">
                <i class:is-active={area.active}></i>
                <span>{t(area.active ? 'Active' : 'Inactive')}</span>
                <span class="cov-note">{cov.count ? t('{count} staffing rules', { count: cov.count }) : t('No rules yet')}</span>
              </div>
              <div class="entity-card__hover" aria-hidden="true">
                <span>{t('Lunch {range}', { range: area.lunchStart && area.lunchEnd ? `${area.lunchStart}–${area.lunchEnd}` : t('not set') })}</span>
                <span>{t('Evening {range}', { range: area.eveningStart && area.eveningEnd ? `${area.eveningStart}–${area.eveningEnd}` : t('not set') })}</span>
                <span>{t('{count} staffing rules · tap to edit', { count: cov.count })}</span>
              </div>
            </button>
          {/each}
          <button type="button" class="ghost-card" onclick={addArea}>
            <span class="ghost-icon">+</span>
            <strong>{t(draft.areas.length ? 'Add area' : 'Add your first area')}</strong>
          </button>
        </div>
      </section>

      <section id="section-positions" class="section-shelf" data-tour="rest-positions">
        <div class="section-head">
          <strong>{t('Positions')}</strong>
          <span>{t('{count} active', { count: activePositions })}</span>
        </div>
        <p class="section-copy">{t('The role catalog employees are assigned to from Team.')}</p>
        <div class="entity-grid entity-grid--column">
          {#each draft.jobFunctions as position, index (position.id)}
            {@const ruleCount = positionRuleCount(position.id)}
            {@const badgeColor = positionColorMap.get(position.id) ?? '#1f4a7a'}
            <button
              type="button"
              class="entity-card position-card rst-stagger-in"
              class:is-inactive={!position.active}
              style={`--rst-i:${index}; --position-color:${badgeColor};`}
              onclick={() => openPosition(position.id)}
            >
              <span class="position-swatch" aria-hidden="true"></span>
              <strong>{position.name || t('Unnamed position')}</strong>
              <small>{position.estimatedHourlyCost ? t('€{cost}/h estimate', { cost: position.estimatedHourlyCost }) : t('No cost estimate')}</small>
              <div class="entity-card__status">
                <i class:is-active={position.active}></i>
                <span>{t(position.active ? 'Active' : 'Inactive')}</span>
                <span class="position-usage">{t(ruleCount === 1 ? '{count} coverage link' : '{count} coverage links', { count: ruleCount })}</span>
              </div>
              <div class="entity-card__hover" aria-hidden="true">
                <span>{t('Badge colour on Schedule & Timesheet')}</span>
                <span>{t('Estimated cost {cost}', { cost: position.estimatedHourlyCost ? t('€{cost} per hour', { cost: position.estimatedHourlyCost.toFixed(2) }) : t('not set') })}</span>
                <span>{t('Used in {count} staffing rules', { count: ruleCount })}</span>
              </div>
            </button>
          {/each}
          <button type="button" class="ghost-card" onclick={addPosition}>
            <span class="ghost-icon">+</span>
            <strong>{t(draft.jobFunctions.length ? 'Add position' : 'Add your first position')}</strong>
          </button>
        </div>
      </section>
      </div>

      <section class="section-shelf badge-devices" data-tour="rest-devices">
        <div class="section-head">
          <strong>{t('Badge devices')}</strong>
          <span>{t(stations.length === 1 ? '{count} device paired' : '{count} devices paired', { count: stations.length })}</span>
        </div>
        <p class="section-copy">{t('Pair a tablet as a dedicated badge terminal. A paired device stays signed out of the app — it can only clock staff in and out, never reach manager screens.')}</p>

        {#if stationError}<FeedbackBanner message={stationError} tone="danger" />{/if}

        {#if newStation}
          <div class="station-code">
            <span class="eyebrow">{t('Pairing code — shown once')}</span>
            <code>{newStation.token}</code>
            <p>{t('On the tablet, open {url} and enter this code.', { url: newStation.url })}</p>
            <div class="station-code__actions">
              <button type="button" onclick={copyStationCode}>{copied ? t('Copied') : t('Copy code')}</button>
              <a href="/station" target="_blank" rel="noopener">{t('Open station')}</a>
            </div>
          </div>
        {/if}

        <div class="station-list">
          {#each stations as station (station.id)}
            <div class="station-row">
              <div>
                <strong>{station.label}</strong>
                <small>{station.lastUsedAt ? t('Last used {when}', { when: formatStationTime(station.lastUsedAt) }) : t('Never used')}</small>
              </div>
              <button type="button" class="station-revoke" disabled={stationBusy} onclick={() => revokeStation(station.id)}>{t('Revoke')}</button>
            </div>
          {:else}
            <p class="station-empty">{t('No devices paired yet.')}</p>
          {/each}
        </div>

        <button type="button" class="station-pair" disabled={stationBusy} onclick={pairDevice}>
          {stationBusy ? t('Working…') : t('Pair a device')}
        </button>
      </section>

      <RestaurantPayrollSetup
        restaurantId={workspace.activeId ?? ''}
        effectiveDate={todayInTimezone(snapshot.restaurant_settings.timezone || 'Europe/Brussels')}
      />
    </div>
  </section>

  <Drawer
    open={drawerKind === 'absences'}
    title="Absence policy"
    description="Leave types used across requests and approvals"
    onclose={closeDrawer}
  >
    <div class="absence-types">
      {#each snapshot.absence_types.filter((item) => item.active) as item (item.id)}
        <article>
          <span style:background={item.color}></span>
          <strong>{t(item.name)}</strong>
          <small>{t(item.paid_policy)}</small>
        </article>
      {/each}
    </div>
    <p class="internal-defaults">{t('Holiday, Sick leave, Unpaid leave, Public holiday and Other are available across Team, My time and payroll evidence. Special cases use the request note.')}</p>
  </Drawer>

  <Drawer
    open={drawerKind === 'identity'}
    title="Restaurant identity"
    description="Legal profile and contact"
    onclose={closeDrawer}
    actions={drawerActions}
  >
    <section class="logo-field">
      <div class="logo-field__preview" class:is-empty={!logoUrl}>
        {#if logoUrl}
          <img src={logoUrl} alt={t('Restaurant logo')} />
        {:else}
          <span aria-hidden="true">{(draft.legalName || 'R').charAt(0).toUpperCase()}</span>
        {/if}
      </div>
      <div class="logo-field__copy">
        <strong>{t('Restaurant logo')}</strong>
        <small>{t('Shown on your badge terminal and paired devices. PNG, JPEG or WebP, up to 1 MB.')}</small>
        {#if logoError}<em class="logo-field__error">{logoError}</em>{/if}
      </div>
      <div class="logo-field__actions">
        <input
          id="restaurant-logo-input"
          type="file"
          accept={LOGO_ACCEPT}
          disabled={logoBusy}
          onchange={handleLogoChange}
        />
        <label class="logo-field__button" for="restaurant-logo-input">
          {t(logoBusy ? 'Uploading…' : logoUrl ? 'Replace' : 'Upload logo')}
        </label>
        {#if logoUrl}
          <button type="button" class="logo-field__remove" disabled={logoBusy} onclick={removeLogo}>
            {t('Remove')}
          </button>
        {/if}
      </div>
    </section>

    <div class="fields">
      <label>{t('Legal name')}<input bind:value={draft.legalName} /></label>
      <label>{t('Company number')}<input bind:value={draft.companyNumber} /></label>
      <label>{t('Email')}<input type="email" bind:value={draft.email} /></label>
      <label>{t('Phone')}<input bind:value={draft.phone} /></label>
      <label class="wide">{t('Address')}<input bind:value={draft.address} /></label>
      <label>{t('Postal code')}<input bind:value={draft.postalCode} /></label>
      <label>{t('City')}<input bind:value={draft.city} /></label>
    </div>
    <p class="internal-defaults">{t('Regional settings: {country} · {timezone} · {locale} · {currency}.', { country: t('Belgium'), timezone: 'Europe/Brussels', locale: 'fr-BE', currency: 'EUR' })}</p>
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
            <strong>{t(WEEKDAYS[day.weekday - 1])}</strong>
            <label class="day-toggle">
              <input type="checkbox" bind:checked={day.open} aria-label={t('{day} open', { day: t(WEEKDAYS[day.weekday - 1]) })} />
              <span></span>
            </label>
          </header>
          <div class="day-service">
            <span class="day-service__icon" aria-hidden="true">☀</span>
            <input type="time" disabled={!day.open} bind:value={day.lunchStart} aria-label={t('Lunch start')} />
            <span aria-hidden="true">–</span>
            <input type="time" disabled={!day.open} bind:value={day.lunchEnd} aria-label={t('Lunch end')} />
          </div>
          <div class="day-service">
            <span class="day-service__icon is-evening" aria-hidden="true">☾</span>
            <input type="time" disabled={!day.open} bind:value={day.eveningStart} aria-label={t('Evening start')} />
            <span aria-hidden="true">–</span>
            <input type="time" disabled={!day.open} bind:value={day.eveningEnd} aria-label={t('Evening end')} />
          </div>
        </div>
      {/each}
    </div>
  </Drawer>

  <Drawer
    open={drawerKind === 'area' && Boolean(areaDrawerItem)}
    title={areaDrawerItem?.name || t('New area')}
    description="Work area"
    onclose={closeDrawer}
    actions={drawerActions}
  >
    {#if areaDrawerItem}
      <div class="fields">
        <label class="wide">
          {t('Area name')}
          <input
            value={areaDrawerItem.name}
            oninput={(event) => {
              const name = event.currentTarget.value;
              mutateArea({ name, code: setupItemCode(name, areaDrawerItem.id, 'area') });
            }}
            placeholder={t('Dining room, Kitchen, Bar…')}
          />
        </label>
        <label class="wide">{t('Notes')}<input value={areaDrawerItem.notes} oninput={(event) => mutateArea({ notes: event.currentTarget.value })} placeholder={t('Optional notes')} /></label>
        <label>{t('Lunch start')}<input type="time" value={areaDrawerItem.lunchStart} oninput={(event) => mutateArea({ lunchStart: event.currentTarget.value })} /></label>
        <label>{t('Lunch end')}<input type="time" value={areaDrawerItem.lunchEnd} oninput={(event) => mutateArea({ lunchEnd: event.currentTarget.value })} /></label>
        <label>{t('Evening start')}<input type="time" value={areaDrawerItem.eveningStart} oninput={(event) => mutateArea({ eveningStart: event.currentTarget.value })} /></label>
        <label>{t('Evening end')}<input type="time" value={areaDrawerItem.eveningEnd} oninput={(event) => mutateArea({ eveningEnd: event.currentTarget.value })} /></label>
        <label class="check"><input type="checkbox" checked={areaDrawerItem.active} onchange={(event) => mutateArea({ active: event.currentTarget.checked })} /> {t('Active area')}</label>
      </div>

      <div class="drawer-coverage">
        <div class="drawer-coverage__head">
          <strong>{t('Staffing rules')}</strong>
          <span>{t(areaCoverage(areaDrawerItem.id).length === 1 ? '{count} rule' : '{count} rules', { count: areaCoverage(areaDrawerItem.id).length })}</span>
        </div>
        <p class="drawer-coverage__hint">{t('Minimum staff this area needs per service. Schedule flags gaps against these.')}</p>
        <div class="cov-rules">
          {#each areaCoverage(areaDrawerItem.id) as rule (rule.id)}
            <div class="cov-rule">
              <span class="cov-rule__icon" class:is-evening={rule.serviceKey === 'evening'} aria-hidden="true">{rule.serviceKey === 'lunch' ? '☀' : '☾'}</span>
              <select aria-label={t('Position')} value={rule.jobFunctionId} onchange={(event) => mutateCoverage(rule.id, { jobFunctionId: event.currentTarget.value })}>
                <option value="">{t('Position')}</option>
                {#each activePositionList as position (position.id)}<option value={position.id}>{position.name}</option>{/each}
              </select>
              <select aria-label={t('Service')} value={rule.serviceKey} onchange={(event) => mutateCoverage(rule.id, { serviceKey: event.currentTarget.value === 'evening' ? 'evening' : 'lunch' })}>
                <option value="lunch">{t('Lunch')}</option>
                <option value="evening">{t('Evening')}</option>
              </select>
              <select
                aria-label={t('Day')}
                value={rule.coverageScope === 'weekday' ? String(rule.weekday) : 'default'}
                onchange={(event) => {
                  const choice = event.currentTarget.value;
                  mutateCoverage(rule.id, choice === 'default'
                    ? { coverageScope: 'default' }
                    : { coverageScope: 'weekday', weekday: Number(choice) });
                }}
              >
                <option value="default">{t('Every day')}</option>
                {#each WEEKDAYS as day, index (day)}<option value={String(index + 1)}>{t(day)}</option>{/each}
              </select>
              <label class="cov-rule__count">
                <input type="number" min="0" value={rule.requiredCount} oninput={(event) => mutateCoverage(rule.id, { requiredCount: event.currentTarget.valueAsNumber || 0 })} aria-label={t('Required count')} />
                <span>{t('need')}</span>
              </label>
              <button type="button" class="cov-rule__x" aria-label={t('Remove rule')} onclick={() => removeCoverageRule(rule.id)}>×</button>
            </div>
          {/each}
          <button type="button" class="cov-add" disabled={!activePositionList.length} onclick={() => addCoverageRule(areaDrawerItem.id)}>
            <span class="cov-add__icon">+</span> {t('Add staffing rule')}
          </button>
          {#if !activePositionList.length}
            <p class="drawer-coverage__hint">{t('Add an active position first, then set its minimum here.')}</p>
          {/if}
        </div>
      </div>
    {/if}
  </Drawer>

  <Drawer
    open={drawerKind === 'position' && Boolean(positionDrawerItem)}
    title={positionDrawerItem?.name || t('New position')}
    description="Position / job function"
    onclose={closeDrawer}
    actions={drawerActions}
  >
    {#if positionDrawerItem}
      <div class="fields">
        <label class="wide">
          {t('Position name')}
          <input
            value={positionDrawerItem.name}
            oninput={(event) => {
              const name = event.currentTarget.value;
              mutatePosition({ name, code: setupItemCode(name, positionDrawerItem.id, 'position') });
            }}
            placeholder={t('Head waiter, Dishwasher…')}
          />
        </label>
        <label>{t('Estimated hourly cost')}<input type="number" min="0" step="0.01" value={positionDrawerItem.estimatedHourlyCost} oninput={(event) => mutatePosition({ estimatedHourlyCost: event.currentTarget.valueAsNumber || 0 })} /></label>
        <label class="check"><input type="checkbox" checked={positionDrawerItem.active} onchange={(event) => mutatePosition({ active: event.currentTarget.checked })} /> {t('Active position')}</label>
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

  .badge-devices {
    margin-top: 16px;
  }

  .station-code {
    display: grid;
    gap: 8px;
    margin: 4px 0 14px;
    padding: 16px;
    border: 1px solid rgba(66, 216, 132, 0.34);
    border-radius: var(--rst-ui-radius-md);
    background:
      linear-gradient(135deg, rgba(66, 216, 132, 0.1), transparent 70%),
      var(--rst-ui-surface-field);
  }

  .station-code code {
    padding: 10px 12px;
    border: 1px dashed var(--rst-ui-line-strong);
    border-radius: var(--rst-ui-radius-md);
    background: var(--rst-ui-surface-field-strong);
    font-family: var(--rst-font-mono, ui-monospace, monospace);
    font-size: 15px;
    letter-spacing: 0;
    word-break: break-all;
  }

  .station-code p {
    margin: 0;
    color: var(--rst-ui-muted);
    font-size: 12px;
  }

  .station-code__actions {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }

  .station-code__actions button,
  .station-code__actions a,
  .station-pair {
    min-height: 38px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding: 8px 16px;
    border: 1px solid var(--rst-ui-line);
    border-radius: var(--rst-ui-radius-md);
    color: var(--rst-ui-text);
    background: var(--rst-ui-surface-field-strong);
    font: inherit;
    font-size: 13px;
    font-weight: var(--rst-fw-bold);
    text-decoration: none;
    cursor: pointer;
  }

  .station-list {
    display: grid;
    gap: 6px;
    margin-bottom: 12px;
  }

  .station-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 10px 12px;
    border: 1px solid var(--rst-ui-line);
    border-radius: var(--rst-ui-radius-md);
    background: var(--rst-ui-surface-field);
  }

  .station-row strong {
    font-size: 13px;
  }

  .station-row small {
    display: block;
    margin-top: 2px;
    color: var(--rst-ui-muted);
    font-size: 11px;
  }

  .station-revoke {
    padding: 6px 12px;
    border: 1px solid var(--rst-ui-line);
    border-radius: var(--rst-ui-radius-md);
    color: var(--rst-state-danger-text);
    background: transparent;
    font: inherit;
    font-size: 12px;
    font-weight: var(--rst-fw-bold);
    cursor: pointer;
  }

  .station-empty {
    margin: 0 0 12px;
    color: var(--rst-ui-muted);
    font-size: 12px;
  }

  .station-pair {
    color: var(--rst-on-accent-text);
    border-color: var(--rst-ui-action);
    background: var(--rst-ui-action);
  }

  .station-pair:disabled {
    opacity: 0.6;
    cursor: default;
  }

  .blueprint-columns .section-shelf {
    margin: 0;
  }

  .entity-grid--column {
    grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
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

  /* Clean staffing-minimum row on area cards (full editing is in the drawer). */
  .area-coverage {
    display: flex;
    gap: 8px;
    margin-top: 4px;
  }

  .area-coverage > span {
    flex: 1;
    min-width: 0;
    display: flex;
    align-items: center;
    gap: 7px;
    padding: 8px 11px;
    border: 1px solid var(--rst-ui-line);
    border-radius: var(--rst-ui-radius-md);
    background: var(--rst-ui-surface-field);
  }

  .area-coverage > span.is-set {
    border-color: rgba(66, 216, 132, 0.32);
    background:
      linear-gradient(135deg, rgba(66, 216, 132, 0.1), transparent 70%),
      var(--rst-ui-surface-field);
  }

  .area-coverage i {
    font-size: 13px;
    font-style: normal;
  }

  /* Same service-time language as the coverage lenses and Home floor:
     gold sun for lunch, indigo moon for evening. */
  .area-coverage > span:first-child i { color: var(--rst-service-lunch); }
  .area-coverage > span:last-child i { color: var(--rst-service-evening); }

  .area-coverage b {
    color: var(--rst-ui-muted);
    font-size: 11px;
    font-weight: var(--rst-fw-display);
  }

  .area-coverage strong {
    margin-left: auto;
    color: var(--rst-ui-text);
    font-size: 16px;
    line-height: 1;
  }

  .cov-note {
    margin-left: auto;
    color: var(--rst-ui-muted);
    font-size: 11px;
  }

  .entity-card__status .position-usage {
    margin-left: auto;
    padding: 2px 8px;
    border-radius: var(--rst-ui-radius-pill);
    color: var(--rst-ui-text);
    background: var(--rst-state-neutral-bg);
    white-space: nowrap;
  }

  /* Each position shows the colour its staff badges use on Schedule/Timesheet. */
  .position-card {
    position: relative;
    border-left: 3px solid var(--position-color, transparent);
  }

  .position-swatch {
    position: absolute;
    top: 14px;
    right: 14px;
    width: 14px;
    height: 14px;
    border-radius: var(--rst-ui-radius-round);
    background: var(--position-color, #1f4a7a);
    box-shadow: 0 0 0 3px color-mix(in srgb, var(--position-color, #1f4a7a) 22%, transparent);
  }

  .position-card.is-inactive .position-swatch {
    filter: grayscale(1);
    opacity: 0.5;
  }

  /* Staffing rules inside the area drawer */
  .drawer-coverage {
    margin-top: 18px;
    padding-top: 16px;
    border-top: 1px solid var(--rst-ui-divider-soft);
  }
  .drawer-coverage__head {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 10px;
  }
  .drawer-coverage__head strong { font-size: 15px; }
  .drawer-coverage__head span {
    color: var(--rst-ui-muted);
    font-size: 11px;
    font-weight: var(--rst-fw-bold);
    text-transform: uppercase;
  }
  .drawer-coverage__hint {
    margin: 4px 0 12px;
    color: var(--rst-ui-muted);
    font-size: 12px;
  }
  .cov-rules { display: grid; gap: 8px; }
  .cov-rule {
    display: grid;
    grid-template-columns: 34px minmax(0, 1fr) minmax(0, 0.9fr) auto auto;
    align-items: center;
    gap: 8px;
    padding: 8px 10px;
    border: 1px solid var(--rst-ui-line);
    border-radius: var(--rst-ui-radius-lg);
    background: var(--rst-ui-surface-field);
  }
  .cov-rule__icon {
    width: 34px;
    height: 34px;
    display: grid;
    place-items: center;
    border-radius: var(--rst-ui-radius-md);
    color: #3c2a06;
    background: #ffe4a3;
    font-size: 15px;
  }
  .cov-rule__icon.is-evening { color: #17304f; background: #cfe0ff; }
  .cov-rule select {
    min-height: 34px;
    padding: 4px 2px;
    border: 0;
    border-bottom: 1.5px solid var(--rst-ui-line);
    background: transparent;
    color: var(--rst-ui-text);
    font: inherit;
  }
  .cov-rule select:focus-visible {
    outline: none;
    border-bottom-color: var(--rst-ui-action);
  }
  .cov-rule__count { display: grid; justify-items: center; gap: 1px; }
  .cov-rule__count input {
    width: 46px;
    height: 34px;
    padding: 0;
    border: 1px solid var(--rst-ui-line);
    border-radius: var(--rst-ui-radius-md);
    background: var(--rst-ui-surface-field-strong);
    text-align: center;
    font-size: 15px;
    font-weight: var(--rst-fw-display);
    color: var(--rst-ui-text);
  }
  .cov-rule__count span {
    color: var(--rst-ui-muted);
    font-size: 8px;
    font-weight: var(--rst-fw-bold);
    text-transform: uppercase;
  }
  .logo-field {
    display: grid;
    grid-template-columns: 64px minmax(0, 1fr) auto;
    align-items: center;
    gap: 14px;
    margin-bottom: 18px;
    padding: 14px;
    border: 1px solid var(--rst-ui-line);
    border-radius: var(--rst-ui-radius-lg);
    background: var(--rst-ui-surface-field);
  }
  .logo-field__preview {
    width: 64px;
    height: 64px;
    display: grid;
    place-items: center;
    overflow: hidden;
    border-radius: var(--rst-ui-radius-md);
    background: var(--rst-ui-surface-panel);
  }
  .logo-field__preview img {
    width: 100%;
    height: 100%;
    object-fit: contain;
  }
  .logo-field__preview.is-empty {
    color: var(--rst-ui-muted);
    font-size: 24px;
    font-weight: var(--rst-fw-display);
  }
  .logo-field__copy { display: grid; gap: 3px; min-width: 0; }
  .logo-field__copy small { color: var(--rst-ui-muted); font-size: 11px; line-height: 1.45; }
  .logo-field__error { color: var(--rst-state-danger-text); font-size: 11px; font-style: normal; }
  .logo-field__actions { display: flex; align-items: center; gap: 8px; }
  .logo-field__actions input[type='file'] {
    position: absolute;
    width: 1px;
    height: 1px;
    opacity: 0;
    pointer-events: none;
  }
  .logo-field__button,
  .logo-field__remove {
    min-height: 36px;
    display: inline-flex;
    align-items: center;
    padding: 7px 14px;
    border: 1px solid var(--rst-ui-line);
    border-radius: var(--rst-ui-radius-md);
    color: var(--rst-ui-text);
    background: var(--rst-ui-surface-panel);
    font: inherit;
    font-size: 12px;
    font-weight: var(--rst-fw-bold);
    cursor: pointer;
    white-space: nowrap;
  }
  .logo-field__button:hover,
  .logo-field__remove:hover { background: var(--rst-ui-hover-bg); }
  .logo-field__remove { color: var(--rst-state-danger-text); }
  .logo-field__actions input[type='file']:focus-visible + .logo-field__button {
    outline: 2px solid var(--rst-ui-action);
    outline-offset: 2px;
  }
  @media (max-width: 520px) {
    .logo-field { grid-template-columns: 56px minmax(0, 1fr); }
    .logo-field__actions { grid-column: 1 / -1; }
  }
  .cov-rule__x {
    width: 28px;
    height: 28px;
    display: grid;
    place-items: center;
    border: 0;
    border-radius: var(--rst-ui-radius-round);
    color: var(--rst-ui-muted);
    background: transparent;
    font-size: 16px;
    line-height: 1;
    cursor: pointer;
  }
  .cov-rule__x:hover { color: var(--rst-state-danger-text); background: var(--rst-state-danger-bg); }
  .cov-add {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    justify-self: start;
    padding: 8px 14px 8px 8px;
    border: 1.5px dashed rgba(var(--rst-ui-action-rgb), 0.45);
    border-radius: var(--rst-ui-radius-pill);
    color: var(--rst-ui-action);
    background: rgba(var(--rst-ui-action-rgb), 0.06);
    font: inherit;
    font-size: 13px;
    font-weight: var(--rst-fw-bold);
    cursor: pointer;
  }
  .cov-add:hover:not(:disabled) { background: rgba(var(--rst-ui-action-rgb), 0.12); }
  .cov-add:disabled { opacity: 0.5; cursor: default; }
  .cov-add__icon {
    width: 26px;
    height: 26px;
    display: grid;
    place-items: center;
    border-radius: 999px;
    color: #fff;
    background: var(--rst-ui-action);
    font-size: 16px;
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
    letter-spacing: 0;
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
    color: var(--rst-service-lunch);
  }

  .day-service__icon.is-evening {
    color: var(--rst-service-evening);
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
