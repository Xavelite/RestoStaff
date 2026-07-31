<script lang="ts">
  import { addDays, greetingForMinutes, mondayFor, todayInTimezone } from '$lib/calendar/date';
  import { t } from '$lib/i18n/i18n.svelte';
  import { workspace } from '$lib/workspace/workspace.svelte';
  import WorkspaceIcon from '$lib/workspace-ui/WorkspaceIcon.svelte';
  import WorkspacePage from '$lib/workspace-ui/WorkspacePage.svelte';
  import { modulesForRole, type WorkspaceModule } from '$lib/workspace-ui/workspace-nav';
  import { buildHomeModel } from '$lib/home/home-model';
  import { getReservationDemand } from '$lib/reservations/reservation-api';

  type ModuleSignal = {
    value: string | number;
    label: string;
    tone?: 'ok' | 'attention' | 'problem';
  };

  const MODULE_GROUPS = [
    { label: 'Run today', keys: ['schedule', 'time', 'badge-terminal', 'reservations'] },
    { label: 'People & setup', keys: ['restaurant', 'team'] },
    { label: 'Records & handoff', keys: ['payroll', 'documents', 'exports', 'reports'] }
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

  const role = $derived(workspace.effectiveRole);
  const snapshot = $derived(workspace.operations);
  const timezone = $derived(
    snapshot?.restaurant_settings.timezone ||
      workspace.bootstrap?.restaurant_settings.timezone ||
      'Europe/Brussels'
  );

  let currentInstant = $state(new Date());
  let reservationSignal = $state<ModuleSignal | null>(null);
  let reservationLoadKey = '';
  $effect(() => {
    const timer = setInterval(() => (currentInstant = new Date()), 60_000);
    return () => clearInterval(timer);
  });

  const activeWeek = $derived(mondayFor(todayInTimezone(timezone, currentInstant)));
  const todayDate = $derived(todayInTimezone(timezone, currentInstant));
  $effect(() => {
    if (workspace.activeId && role && role !== 'employee') {
      void workspace.loadOperations(activeWeek, addDays(activeWeek, 6)).catch(() => undefined);
    }
  });

  $effect(() => {
    const restaurantId = workspace.activeId;
    const entitlement = workspace.moduleEntitlements.reservations;
    const date = todayDate;
    if (!restaurantId || (entitlement !== 'enabled' && entitlement !== 'preview')) {
      reservationSignal = null;
      return;
    }
    const key = `${restaurantId}:${date}`;
    if (reservationLoadKey === key) return;
    reservationLoadKey = key;
    void getReservationDemand(restaurantId, date, date)
      .then((rows) => {
        if (reservationLoadKey !== key) return;
        const reservations = rows.reduce((sum, row) => sum + row.reservation_count, 0);
        const covers = rows.reduce((sum, row) => sum + row.expected_covers, 0);
        reservationSignal = {
          value: reservations,
          label: t('bookings · {count} covers', { count: covers }),
          tone: reservations ? 'ok' : undefined
        };
      })
      .catch(() => {
        if (reservationLoadKey === key) reservationSignal = null;
      });
  });

  const model = $derived(snapshot && role ? buildHomeModel(snapshot, role, currentInstant) : null);
  const modules = $derived(
    modulesForRole(role, workspace.moduleEntitlements)
      .filter((module) => module.key !== 'home' && !module.placeholder && !module.utility)
  );
  const upcoming = $derived(
    modulesForRole(role, workspace.moduleEntitlements)
      .filter((module) => module.placeholder)
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
      value: activeAreas,
      label: t('active areas')
    };
    signals.team = {
      value: activePeople,
      label: t('active employees')
    };
    signals.schedule = scheduleIssues
      ? { value: scheduleIssues, label: t('staffing gaps'), tone: 'problem' }
      : { value: snapshot.planned_shifts.length, label: t('shifts this week'), tone: 'ok' };
    signals.time = model.live.late
      ? { value: model.live.late, label: t('waiting for a badge'), tone: 'problem' }
      : { value: model.live.working, label: t('working now'), tone: model.live.working ? 'ok' : undefined };
    signals['badge-terminal'] = {
      value: model.live.working,
      label: t('open clock-ins'),
      tone: model.live.working ? 'ok' : undefined
    };
    if (reservationSignal) signals.reservations = reservationSignal;
    if (role === 'owner') {
      signals.payroll = payrollIssues
        ? { value: payrollIssues, label: t('people need details'), tone: 'attention' }
        : { value: '✓', label: t('details ready'), tone: 'ok' };
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

  <section class="workspace" aria-label={t('Restaurant modules')}>
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
                data-module-key={module.key}
                style={`--tile-color:${MODULE_COLOR[module.key] ?? 'var(--cl-muted)'}`}
              >
                <span class="module-tile__watermark" aria-hidden="true">
                  <WorkspaceIcon name={module.icon} size={76} />
                </span>
                <span class="module-tile__top">
                  <span class="module-tile__copy">
                    <strong>{t(module.label)}</strong>
                    <span>{t(module.summary)}</span>
                  </span>
                </span>
                <span class="module-tile__foot">
                  {#if signal}
                    <span class="module-tile__signal is-{signal.tone ?? 'neutral'}">
                      <i aria-hidden="true"></i><strong>{signal.value}</strong><span>{signal.label}</span>
                    </span>
                  {:else}
                    <span class="module-tile__open">{t('Open workspace')}</span>
                  {/if}
                  <span class="module-tile__arrow" aria-hidden="true">&rarr;</span>
                </span>
              </a>
            {/each}
          </div>
        </section>
      {/if}
    {/each}
  </section>

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
    font-size: var(--rst-fs-heading);
    font-weight: var(--rst-fw-display);
  }

  .home-intro p {
    margin: 3px 0 0;
    color: var(--cl-muted);
    font-size: var(--rst-fs-body);
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
    font-size: var(--rst-fs-label);
    font-weight: var(--rst-fw-bold);
    letter-spacing: .06em;
    text-transform: uppercase;
  }

  .section-heading h2 {
    margin: 0;
    color: var(--cl-ink);
    font-size: var(--rst-fs-title-sm);
    font-weight: var(--rst-fw-display);
  }

  .section-heading.is-compact {
    align-items: center;
  }

  .section-heading.is-compact h2 {
    font-size: var(--rst-fs-title-sm);
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
    min-height: 142px;
    display: grid;
    grid-template-rows: 1fr auto;
    gap: 14px;
    padding: 15px 16px 13px;
    isolation: isolate;
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

  .module-tile::before {
    content: '';
    position: absolute;
    z-index: 0;
    top: 0;
    right: 0;
    bottom: 0;
    width: 38%;
    clip-path: polygon(34% 0, 100% 0, 100% 100%, 0 100%);
    background: color-mix(in srgb, var(--tile-color) 7%, var(--cl-surface));
    transition: background var(--cl-dur) var(--cl-ease);
  }

  .module-tile:hover::before {
    background: color-mix(in srgb, var(--tile-color) 11%, var(--cl-surface));
  }

  .module-tile__top,
  .module-tile__foot {
    position: relative;
    z-index: 1;
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
    min-width: 0;
    display: block;
    padding-right: 31%;
  }

  .module-tile__watermark {
    position: absolute;
    z-index: 1;
    top: 18px;
    right: 15px;
    width: 82px;
    height: 82px;
    display: grid;
    place-items: center;
    color: color-mix(in srgb, var(--tile-color) 80%, var(--cl-ink));
    opacity: .28;
    transform: rotate(-4deg);
    transition:
      opacity var(--cl-dur) var(--cl-ease),
      transform var(--cl-dur-slow) var(--cl-ease);
  }

  .module-tile:hover .module-tile__watermark {
    opacity: .42;
    transform: translateY(-2px) rotate(0);
  }

  .module-tile__copy {
    min-width: 0;
    display: grid;
    align-content: start;
    gap: 3px;
  }

  .module-tile__copy strong {
    font-size: var(--rst-fs-title-sm);
    font-weight: var(--rst-fw-bold);
  }

  .module-tile__copy > span {
    color: var(--cl-muted);
    font-size: var(--rst-fs-control);
    line-height: 1.42;
  }

  .module-tile__foot {
    min-width: 0;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    padding-top: 10px;
    border-top: 1px solid color-mix(in srgb, var(--tile-color) 13%, var(--cl-line));
  }

  .module-tile__signal {
    min-width: 0;
    display: flex;
    align-items: center;
    gap: 6px;
    color: var(--cl-muted);
    font-size: var(--rst-fs-control);
    font-weight: var(--rst-fw-medium);
  }

  .module-tile__signal strong {
    color: var(--cl-ink);
    font-size: var(--rst-fs-body);
    font-variant-numeric: tabular-nums;
  }

  .module-tile__signal span {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
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

  .module-tile__open {
    color: var(--cl-muted);
    font-size: var(--rst-fs-label);
    font-weight: var(--rst-fw-medium);
  }

  .module-tile__arrow {
    flex: 0 0 auto;
    color: color-mix(in srgb, var(--tile-color) 48%, var(--cl-line-strong));
    font-size: var(--rst-fs-title);
    transition:
      color var(--cl-dur) var(--cl-ease),
      transform var(--cl-dur) var(--cl-ease);
  }

  .module-tile:hover .module-tile__arrow {
    transform: translateX(3px);
    color: var(--tile-color);
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
    font-size: var(--rst-fs-control);
    font-weight: var(--rst-fw-medium);
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  @media (max-width: 980px) {
    .module-grid {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }

  }

  @media (max-width: 520px) {
    .module-grid {
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 8px;
    }

    .module-tile {
      min-height: 112px;
      grid-template-rows: 1fr auto;
      gap: 8px;
      padding: 10px 11px;
    }

    .module-tile__top {
      padding-right: 34%;
    }

    .module-tile__watermark {
      top: 13px;
      right: 8px;
      width: 58px;
      height: 58px;
    }

    .module-tile__copy strong {
      font-size: var(--rst-fs-body);
    }

    .module-tile__copy > span {
      display: none;
    }

    .module-tile__signal {
      align-self: end;
      font-size: var(--rst-fs-caption);
      line-height: 1.25;
    }

    .module-tile__arrow {
      font-size: var(--rst-fs-title-sm);
    }

    .upcoming-grid {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }
</style>
