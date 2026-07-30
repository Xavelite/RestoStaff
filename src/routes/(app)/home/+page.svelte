<script lang="ts">
  import { addDays, greetingForMinutes, mondayFor, todayInTimezone } from '$lib/calendar/date';
  import { t } from '$lib/i18n/i18n.svelte';
  import { workspace } from '$lib/workspace/workspace.svelte';
  import WorkspaceIcon from '$lib/workspace-ui/WorkspaceIcon.svelte';
  import WorkspacePage from '$lib/workspace-ui/WorkspacePage.svelte';
  import { modulesForRole, type WorkspaceIcon as WorkspaceIconName, type WorkspaceModule } from '$lib/workspace-ui/workspace-nav';
  import { buildHomeModel } from '$lib/home/home-model';

  type ModuleSignal = {
    label: string;
    tone?: 'ok' | 'attention' | 'problem';
  };

  const MODULE_GROUPS = [
    { label: 'Run today', keys: ['schedule', 'time', 'badge-terminal', 'reservations'] },
    { label: 'People & setup', keys: ['restaurant', 'team'] },
    { label: 'Review & handoff', keys: ['payroll', 'reports', 'exports', 'documents', 'settings'] }
  ] as const;

  const MODULE_COLOR: Record<string, string> = {
    restaurant: 'var(--cl-mod-restaurant)',
    team: 'var(--cl-mod-team)',
    schedule: 'var(--cl-mod-schedule)',
    time: 'var(--cl-mod-time)',
    'badge-terminal': 'var(--cl-mod-badge)',
    reservations: 'var(--cl-mod-reservations)',
    payroll: 'var(--cl-mod-payroll)',
    reports: 'var(--cl-mod-reports)',
    exports: 'var(--cl-mod-exports)',
    settings: 'var(--cl-mod-settings)',
    inventory: 'var(--cl-mod-inventory)',
    recipes: 'var(--cl-mod-restaurant)',
    purchasing: 'var(--cl-mod-inventory)',
    'menu-costing': 'var(--cl-mod-payroll)',
    tasks: 'var(--cl-mod-reports)',
    'food-safety': 'var(--cl-mod-badge)'
  };

  const ACTION_ICON: Record<string, WorkspaceIconName> = {
    leave: 'team',
    payroll: 'payroll',
    planning: 'schedule',
    availability: 'team'
  };

  const role = $derived(workspace.effectiveRole);
  const snapshot = $derived(workspace.operations);
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

  const activeWeek = $derived(mondayFor(todayInTimezone(timezone, currentInstant)));
  $effect(() => {
    if (workspace.activeId && role && role !== 'employee') {
      void workspace.loadOperations(activeWeek, addDays(activeWeek, 6)).catch(() => undefined);
    }
  });

  const model = $derived(snapshot && role ? buildHomeModel(snapshot, role, currentInstant) : null);
  const modules = $derived(
    modulesForRole(role, workspace.moduleEntitlements)
      .filter((module) => module.key !== 'home' && !module.placeholder)
  );
  const upcoming = $derived(
    modulesForRole(role, workspace.moduleEntitlements)
      .filter((module) => module.placeholder)
  );
  const openActions = $derived(
    (model?.actions.rows ?? [])
      .filter((row) => row.count > 0)
      .sort((left, right) => right.count - left.count)
  );

  const localMinutes = $derived.by(() => {
    const parts = new Intl.DateTimeFormat('en-GB', {
      timeZone: timezone,
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23'
    }).formatToParts(currentInstant);
    const hour = Number(parts.find((part) => part.type === 'hour')?.value ?? 0);
    const minute = Number(parts.find((part) => part.type === 'minute')?.value ?? 0);
    return hour * 60 + minute;
  });

  const todayLabel = $derived(
    new Intl.DateTimeFormat('en-GB', {
      timeZone: timezone,
      weekday: 'long',
      day: 'numeric',
      month: 'long'
    }).format(currentInstant)
  );

  const firstName = $derived(
    workspace.bootstrap?.current_employee?.first_name ??
      (workspace.bootstrap?.current_employee?.display_name ?? '').split(' ')[0] ??
      ''
  );

  const moduleSignals = $derived.by(() => {
    const signals: Record<string, ModuleSignal> = {};
    if (!snapshot || !model) return signals;

    const activePeople = snapshot.employees.filter((employee) => employee.active).length;
    const activeAreas = snapshot.work_areas.filter((area) => area.active).length;
    const scheduleIssues = model.actions.rows.find((row) => row.key === 'planning')?.count ?? 0;
    const payrollIssues = model.actions.rows.find((row) => row.key === 'payroll')?.count ?? 0;

    signals.restaurant = {
      label: t('{count} active areas', { count: activeAreas })
    };
    signals.team = {
      label: t('{count} active employees', { count: activePeople })
    };
    signals.schedule = scheduleIssues
      ? { label: t('{count} understaffed services', { count: scheduleIssues }), tone: 'problem' }
      : { label: t('{count} shifts this week', { count: snapshot.planned_shifts.length }), tone: 'ok' };
    signals.time = model.live.late
      ? { label: t('{count} services waiting for a badge', { count: model.live.late }), tone: 'problem' }
      : { label: t('{count} people working now', { count: model.live.working }), tone: model.live.working ? 'ok' : undefined };
    signals['badge-terminal'] = {
      label: t('{count} open clock-ins', { count: model.live.working }),
      tone: model.live.working ? 'ok' : undefined
    };
    if (role === 'owner') {
      signals.payroll = payrollIssues
        ? { label: t('{count} people need details', { count: payrollIssues }), tone: 'attention' }
        : { label: t('Payroll details ready'), tone: 'ok' };
    }

    return signals;
  });

  function modulesIn(keys: readonly string[]): WorkspaceModule[] {
    return modules.filter((module) => keys.includes(module.key));
  }
</script>

<svelte:head><title>{t('Home')} &middot; restogogo</title></svelte:head>

<WorkspacePage>
  <header class="home-intro">
    <div>
      <h1>
        {firstName
          ? t('{greeting}, {name}.', {
              greeting: t(greetingForMinutes(localMinutes)),
              name: firstName
            })
          : t(greetingForMinutes(localMinutes))}
      </h1>
      <p>{todayLabel}</p>
    </div>
  </header>

  <section class="workspace" aria-labelledby="workspace-title">
    <div class="section-heading">
      <div>
        <span class="section-heading__eyebrow">{t('Workspace')}</span>
        <h2 id="workspace-title">{t('Restaurant modules')}</h2>
      </div>
    </div>

    {#each MODULE_GROUPS as group (group.label)}
      {@const groupModules = modulesIn(group.keys)}
      {#if groupModules.length}
        <section class="module-group" aria-labelledby={`group-${group.label.replace(/\W/g, '-').toLowerCase()}`}>
          <h3 id={`group-${group.label.replace(/\W/g, '-').toLowerCase()}`}>{t(group.label)}</h3>
          <div class="module-grid">
            {#each groupModules as module (module.key)}
              {@const signal = moduleSignals[module.key]}
              <a
                class="module-tile"
                href={module.href}
                style={`--tile-color:${MODULE_COLOR[module.key] ?? 'var(--cl-muted)'}`}
              >
                <span class="module-tile__top">
                  <span class="module-tile__icon"><WorkspaceIcon name={module.icon} size={21} /></span>
                  <span class="module-tile__arrow" aria-hidden="true">&rarr;</span>
                </span>
                <span class="module-tile__copy">
                  <strong>{t(module.label)}</strong>
                  <span>{t(module.summary)}</span>
                </span>
                {#if signal}
                  <span class="module-tile__signal is-{signal.tone ?? 'neutral'}">
                    <i aria-hidden="true"></i>{signal.label}
                  </span>
                {/if}
              </a>
            {/each}
          </div>
        </section>
      {/if}
    {/each}
  </section>

  {#if model}
    <div class="home-secondary">
      <section class="today-panel" aria-labelledby="today-title">
        <div class="section-heading is-compact">
          <div>
            <span class="section-heading__eyebrow">{t('Today at a glance')}</span>
            <h2 id="today-title">{t('Floor status')}</h2>
          </div>
          <a href="/timesheet/live">{t('Open live monitor')} <span aria-hidden="true">&rarr;</span></a>
        </div>
        <dl class="today-stats">
          <div class:is-positive={model.live.working > 0}>
            <dt>{t('People working now')}</dt>
            <dd>{model.live.working}</dd>
          </div>
          <div class:is-problem={model.live.late > 0}>
            <dt>{t('Waiting for a badge')}</dt>
            <dd>{model.live.late}</dd>
          </div>
          <div>
            <dt>{t('Services starting soon')}</dt>
            <dd>{model.live.upcoming}</dd>
          </div>
        </dl>
      </section>

      <section class="attention-panel" aria-labelledby="attention-title">
        <div class="section-heading is-compact">
          <div>
            <span class="section-heading__eyebrow">{t('Needs you')}</span>
            <h2 id="attention-title">{t('Open decisions')}</h2>
          </div>
        </div>
        {#if openActions.length}
          <div class="attention-list">
            {#each openActions.slice(0, 4) as action (action.key)}
              <a href={action.href}>
                <span class="attention-list__icon"><WorkspaceIcon name={ACTION_ICON[action.key]} size={17} /></span>
                <span>
                  <strong>{t(action.label)}</strong>
                  <small>{t(action.meta)}</small>
                </span>
                <b>{action.count}</b>
                <i aria-hidden="true">&rarr;</i>
              </a>
            {/each}
          </div>
        {:else}
          <p class="attention-clear">{t('Nothing is waiting on you. The week is in good shape.')}</p>
        {/if}
      </section>
    </div>
  {/if}

  {#if upcoming.length}
    <section class="upcoming" aria-labelledby="upcoming-title">
      <div class="section-heading is-compact">
        <div>
          <span class="section-heading__eyebrow">{t('Coming next')}</span>
          <h2 id="upcoming-title">{t('Upcoming modules')}</h2>
        </div>
      </div>
      <div class="upcoming-grid">
        {#each upcoming as module (module.key)}
          <div class="upcoming-tile" style={`--tile-color:${MODULE_COLOR[module.key] ?? 'var(--cl-muted)'}`}>
            <span><WorkspaceIcon name={module.icon} size={18} /></span>
            <strong>{t(module.label)}</strong>
          </div>
        {/each}
      </div>
    </section>
  {/if}
</WorkspacePage>

<style>
  .home-intro {
    display: flex;
    align-items: flex-end;
    justify-content: space-between;
    min-height: 44px;
  }

  .home-intro h1 {
    margin: 0;
    color: var(--cl-ink);
    font-size: 22px;
    font-weight: var(--rst-fw-display);
  }

  .home-intro p {
    margin: 3px 0 0;
    color: var(--cl-muted);
    font-size: 13px;
  }

  .workspace,
  .module-group,
  .upcoming {
    display: grid;
    gap: 12px;
  }

  .workspace {
    gap: 18px;
  }

  .section-heading {
    display: flex;
    align-items: flex-end;
    justify-content: space-between;
    gap: 16px;
  }

  .section-heading__eyebrow,
  .module-group h3 {
    display: block;
    margin: 0 0 3px;
    color: var(--cl-muted);
    font-size: 10.5px;
    font-weight: var(--rst-fw-bold);
    letter-spacing: .06em;
    text-transform: uppercase;
  }

  .section-heading h2 {
    margin: 0;
    color: var(--cl-ink);
    font-size: 16px;
    font-weight: var(--rst-fw-display);
  }

  .section-heading.is-compact {
    align-items: center;
  }

  .section-heading.is-compact h2 {
    font-size: 15px;
  }

  .section-heading a {
    color: var(--cl-accent);
    font-size: 12.5px;
    font-weight: var(--rst-fw-medium);
    text-decoration: none;
    white-space: nowrap;
  }

  .module-group h3 {
    margin-bottom: 0;
  }

  .module-grid {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 10px;
  }

  .module-tile {
    position: relative;
    min-height: 132px;
    display: grid;
    grid-template-rows: auto 1fr auto;
    gap: 12px;
    padding: 15px 16px 13px;
    overflow: hidden;
    border: 1px solid var(--cl-line);
    border-top: 3px solid var(--tile-color);
    border-radius: var(--cl-radius);
    background: var(--cl-surface);
    color: var(--cl-ink);
    text-decoration: none;
    transition:
      transform var(--cl-dur) var(--cl-ease),
      border-color var(--cl-dur) var(--cl-ease),
      box-shadow var(--cl-dur) var(--cl-ease);
  }

  .module-tile:hover {
    transform: translateY(-2px);
    border-color: color-mix(in srgb, var(--tile-color) 36%, var(--cl-line));
    box-shadow: 0 8px 22px rgb(15 23 42 / 7%);
  }

  .module-tile:focus-visible {
    outline: 2px solid var(--tile-color);
    outline-offset: 2px;
  }

  .module-tile__top {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .module-tile__icon {
    width: 38px;
    height: 38px;
    display: grid;
    place-items: center;
    border: 1px solid color-mix(in srgb, var(--tile-color) 20%, var(--cl-line));
    border-radius: 6px;
    background: color-mix(in srgb, var(--tile-color) 9%, var(--cl-surface));
    color: var(--tile-color);
  }

  .module-tile__arrow {
    color: var(--cl-line-strong);
    font-size: 18px;
    transition:
      color var(--cl-dur) var(--cl-ease),
      transform var(--cl-dur) var(--cl-ease);
  }

  .module-tile:hover .module-tile__arrow {
    transform: translateX(3px);
    color: var(--tile-color);
  }

  .module-tile__copy {
    min-width: 0;
    display: grid;
    align-content: start;
    gap: 3px;
  }

  .module-tile__copy strong {
    font-size: 14px;
    font-weight: var(--rst-fw-bold);
  }

  .module-tile__copy > span {
    color: var(--cl-muted);
    font-size: 12px;
    line-height: 1.42;
  }

  .module-tile__signal {
    min-width: 0;
    display: flex;
    align-items: center;
    gap: 6px;
    color: var(--cl-muted);
    font-size: 11.5px;
    font-weight: var(--rst-fw-medium);
  }

  .module-tile__signal i {
    width: 6px;
    height: 6px;
    flex: 0 0 auto;
    border-radius: 50%;
    background: var(--cl-line-strong);
  }

  .module-tile__signal.is-ok i { background: var(--cl-ok); }
  .module-tile__signal.is-attention i { background: var(--cl-attention); }
  .module-tile__signal.is-problem i { background: var(--cl-problem); }

  .home-secondary {
    display: grid;
    grid-template-columns: minmax(0, .9fr) minmax(0, 1.1fr);
    gap: 12px;
  }

  .today-panel,
  .attention-panel {
    display: grid;
    align-content: start;
    gap: 14px;
    padding: 16px;
    border: 1px solid var(--cl-line);
    border-radius: var(--cl-radius);
    background: var(--cl-surface);
  }

  .today-stats {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    margin: 0;
    border-top: 1px solid var(--cl-line);
  }

  .today-stats > div {
    min-width: 0;
    display: grid;
    gap: 5px;
    padding: 13px 12px 2px 0;
  }

  .today-stats > div + div {
    padding-left: 12px;
    border-left: 1px solid var(--cl-line);
  }

  .today-stats dt {
    overflow: hidden;
    color: var(--cl-muted);
    font-size: 11.5px;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .today-stats dd {
    margin: 0;
    color: var(--cl-ink);
    font-size: 24px;
    font-weight: var(--rst-fw-display);
    font-variant-numeric: tabular-nums;
  }

  .today-stats .is-positive dd { color: var(--cl-ok); }
  .today-stats .is-problem dd { color: var(--cl-problem); }

  .attention-list {
    display: grid;
    border-top: 1px solid var(--cl-line);
  }

  .attention-list a {
    min-width: 0;
    display: grid;
    grid-template-columns: 30px minmax(0, 1fr) auto 16px;
    align-items: center;
    gap: 10px;
    padding: 9px 2px;
    color: var(--cl-ink);
    text-decoration: none;
  }

  .attention-list a + a {
    border-top: 1px solid var(--cl-grid-line);
  }

  .attention-list a:hover strong {
    color: var(--cl-accent);
  }

  .attention-list__icon {
    width: 30px;
    height: 30px;
    display: grid;
    place-items: center;
    border-radius: 5px;
    background: var(--cl-surface-muted);
    color: var(--cl-muted);
  }

  .attention-list a > span:nth-child(2) {
    min-width: 0;
    display: grid;
  }

  .attention-list strong {
    overflow: hidden;
    font-size: 12.5px;
    font-weight: var(--rst-fw-medium);
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .attention-list small {
    color: var(--cl-muted);
    font-size: 10.5px;
  }

  .attention-list b {
    min-width: 26px;
    padding: 3px 6px;
    border-radius: 5px;
    background: var(--cl-attention-wash);
    color: var(--cl-attention);
    font-size: 11.5px;
    font-weight: var(--rst-fw-bold);
    text-align: center;
  }

  .attention-list a > i {
    color: var(--cl-line-strong);
    font-style: normal;
  }

  .attention-clear {
    margin: 0;
    padding-top: 12px;
    border-top: 1px solid var(--cl-line);
    color: var(--cl-muted);
    font-size: 12.5px;
  }

  .upcoming-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(170px, 1fr));
    gap: 8px;
  }

  .upcoming-tile {
    min-width: 0;
    display: flex;
    align-items: center;
    gap: 9px;
    padding: 9px 11px;
    border: 1px dashed var(--cl-line-strong);
    border-radius: var(--cl-radius);
    background: color-mix(in srgb, var(--tile-color) 3%, var(--cl-surface));
    color: var(--cl-muted);
  }

  .upcoming-tile > span {
    width: 29px;
    height: 29px;
    flex: 0 0 auto;
    display: grid;
    place-items: center;
    color: var(--tile-color);
  }

  .upcoming-tile strong {
    overflow: hidden;
    font-size: 12px;
    font-weight: var(--rst-fw-medium);
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  @media (max-width: 980px) {
    .module-grid {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }

    .home-secondary {
      grid-template-columns: minmax(0, 1fr);
    }
  }

  @media (max-width: 520px) {
    .module-grid {
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 8px;
    }

    .module-tile {
      min-height: 102px;
      grid-template-rows: auto auto 1fr;
      gap: 8px;
      padding: 10px 11px;
    }

    .module-tile__icon {
      width: 32px;
      height: 32px;
    }

    .module-tile__copy strong {
      font-size: 12.5px;
    }

    .module-tile__copy > span {
      display: none;
    }

    .module-tile__signal {
      align-self: end;
      font-size: 10px;
      line-height: 1.25;
    }

    .module-tile__arrow {
      font-size: 15px;
    }

    .upcoming-grid {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }
</style>
