<script lang="ts">
  import {
    addDays,
    greetingForMinutes,
    mondayFor,
    todayInTimezone,
    WEEKDAYS
  } from '$lib/calendar/date';
  import { t } from '$lib/i18n/i18n.svelte';
  import { workspace } from '$lib/workspace/workspace.svelte';
  import ClassicIcon from '$lib/classic/ClassicIcon.svelte';
  import ClassicPage from '$lib/classic/ClassicPage.svelte';
  import ClassicService from '$lib/classic/ClassicService.svelte';
  import ClassicStat from '$lib/classic/ClassicStat.svelte';
  import { modulesForRole } from '$lib/classic/classic-nav';
  import { buildHomeModel } from '$lib/home/home-model';
  import { personInitials } from '$lib/ui/person';

  const role = $derived(workspace.effectiveRole);
  const snapshot = $derived(workspace.operations);

  const timezone = $derived(
    snapshot?.restaurant_settings.timezone ||
      workspace.bootstrap?.restaurant_settings.timezone ||
      'Europe/Brussels'
  );

  // "Working now" has to keep up with the clock without a reload.
  let currentInstant = $state(new Date());
  $effect(() => {
    const timer = setInterval(() => (currentInstant = new Date()), 60_000);
    return () => clearInterval(timer);
  });

  // Home reads this week, the same window Schedule and Timesheet load.
  const activeWeek = $derived(mondayFor(todayInTimezone(timezone, currentInstant)));
  $effect(() => {
    if (workspace.activeId && role && role !== 'employee') {
      void workspace.loadOperations(activeWeek, addDays(activeWeek, 6)).catch(() => undefined);
    }
  });

  /**
   * Home answers "what needs me today", not "where can I click". The module
   * list already lives in the sidebar, so it sits at the bottom as a launcher
   * rather than being the whole page.
   */
  const model = $derived(
    snapshot && role ? buildHomeModel(snapshot, role, currentInstant) : null
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
    }).format(new Date())
  );

  const firstName = $derived(
    workspace.bootstrap?.current_employee?.first_name ??
      (workspace.bootstrap?.current_employee?.display_name ?? '').split(' ')[0] ??
      ''
  );

  /** Anything with a count, worst first. A clean board is worth saying out loud. */
  const openActions = $derived(
    (model?.actions.rows ?? [])
      .filter((row) => row.count > 0)
      .sort((left, right) => right.count - left.count)
  );

  const modules = $derived(
    modulesForRole(role).filter((module) => module.key !== 'home' && !module.placeholder)
  );
  const upcoming = $derived(
    modulesForRole(role).filter((module) => module.placeholder)
  );

  const MODULE_COLOR: Record<string, string> = {
    schedule: 'var(--cl-mod-schedule)',
    time: 'var(--cl-mod-time)',
    team: 'var(--cl-mod-team)',
    restaurant: 'var(--cl-mod-restaurant)',
    payroll: 'var(--cl-mod-payroll)',
    'badge-terminal': 'var(--cl-mod-badge)',
    reports: 'var(--cl-mod-reports)',
    exports: 'var(--cl-mod-reports)',
    reservations: 'var(--cl-mod-schedule)'
  };

  const STAT_TONE = { danger: 'problem', warning: 'attention', success: 'ok' } as const;

  function toneFor(tone: string): 'ok' | 'attention' | 'problem' | undefined {
    return STAT_TONE[tone as keyof typeof STAT_TONE];
  }

  function itemLabel(item: { label: string; weekday?: number; serviceKey?: string }): string {
    if (item.label) return item.label;
    return item.weekday ? t(WEEKDAYS[item.weekday - 1]) : '';
  }
</script>

<svelte:head><title>{t('Home')} &middot; restogogo</title></svelte:head>

<ClassicPage>
  <header class="today">
    <div class="today__copy">
      <h1>{firstName ? t('{greeting}, {name}.', { greeting: t(greetingForMinutes(localMinutes)), name: firstName }) : t(greetingForMinutes(localMinutes))}</h1>
      <p>{todayLabel}</p>
    </div>
    {#if model}
      <div class="today__live">
        <ClassicStat label="Working now" value={model.live.working} tone={model.live.working ? 'ok' : undefined} />
        <ClassicStat label="Late" value={model.live.late} tone={model.live.late ? 'problem' : undefined} />
        <ClassicStat label="Starting soon" value={model.live.upcoming} />
        <a class="today__link" href="/timesheet/live">{t('Live monitor')}</a>
      </div>
    {/if}
  </header>

  {#if model}
    <section class="block">
      <h2 class="block__title">{t('Needs you')}</h2>
      {#if openActions.length}
        <div class="actions">
          {#each openActions as action (action.key)}
            <a class="action is-{action.tone}" href={action.href}>
              <span class="action__count">{action.count}</span>
              <span class="action__body">
                <strong>{t(action.label)}</strong>
                <span class="action__items">
                  {#each action.items.slice(0, 3) as item (item.id)}
                    <span class="action__item">
                      {#if item.serviceKey}
                        <ClassicService service={item.serviceKey === 'evening' ? 'evening' : 'lunch'} variant="text" />
                      {/if}
                      {itemLabel(item)}
                      <em>{t(item.meta, item.metaParams ?? {})}</em>
                    </span>
                  {/each}
                </span>
              </span>
            </a>
          {/each}
        </div>
      {:else}
        <p class="clear">{t('Nothing is waiting on you. The week is in good shape.')}</p>
      {/if}
    </section>

    <section class="block">
      <h2 class="block__title">{t('On today')}</h2>
      {#if model.live.todayRoster.length}
        <ul class="roster">
          {#each model.live.todayRoster as row (row.employeeId)}
            <li class="roster__row is-{row.tone}">
              <span class="roster__who">
                <span class="roster__avatar">{personInitials(row.name)}</span>
                <span class="roster__name">
                  <strong>{row.name}</strong>
                  <small>{row.role}</small>
                </span>
              </span>
              <span class="roster__range">{row.range}</span>
              <span class="roster__status">{t(row.status)}</span>
            </li>
          {/each}
        </ul>
      {:else}
        <p class="clear">{t('Nobody is scheduled today.')}</p>
      {/if}
    </section>
  {/if}

  <section class="block">
    <h2 class="block__title">{t('Modules')}</h2>
    <div class="tiles">
      {#each modules as module (module.key)}
        <a class="tile" href={module.href} style="--tile-color:{MODULE_COLOR[module.key] ?? 'var(--cl-muted)'}">
          <span class="tile__icon"><ClassicIcon name={module.icon} size={19} /></span>
          <span class="tile__label">{t(module.label)}</span>
        </a>
      {/each}
    </div>
    {#if upcoming.length}
      <p class="upcoming">
        <span>{t('Coming next')}</span>
        {upcoming.map((module) => t(module.label)).join(' · ')}
      </p>
    {/if}
  </section>
</ClassicPage>

<style>
  .today {
    display: flex;
    flex-wrap: wrap;
    align-items: flex-end;
    justify-content: space-between;
    gap: 18px;
    padding-bottom: 4px;
  }
  .today__copy h1 {
    margin: 0;
    color: var(--cl-ink);
    font-size: 21px;
    font-weight: var(--rst-fw-display);
  }
  .today__copy p {
    margin: 3px 0 0;
    color: var(--cl-muted);
    font-size: 13px;
  }
  .today__live {
    display: flex;
    align-items: center;
    gap: 10px;
  }
  .today__link {
    align-self: stretch;
    display: inline-flex;
    align-items: center;
    padding: 0 14px;
    border: 1px solid var(--cl-line);
    border-radius: var(--cl-radius-surface);
    background: var(--cl-surface);
    color: var(--cl-accent);
    font-size: 12.5px;
    font-weight: var(--rst-fw-medium);
    text-decoration: none;
    white-space: nowrap;
  }
  .today__link:hover { border-color: color-mix(in srgb, var(--cl-accent) 40%, var(--cl-line)); }

  .block { display: grid; gap: 10px; }
  .block__title {
    margin: 0;
    color: var(--cl-muted);
    font-size: 10.5px;
    font-weight: var(--rst-fw-bold);
    letter-spacing: .06em;
    text-transform: uppercase;
  }
  .clear {
    margin: 0;
    padding: 16px 18px;
    border: 1px solid var(--cl-line);
    border-radius: var(--cl-radius-surface);
    background: var(--cl-surface);
    color: var(--cl-muted);
    font-size: 13px;
  }

  /* Each card is one thing that needs a decision, with the evidence under it. */
  .actions {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
    gap: 12px;
  }
  .action {
    --tone: var(--cl-line-strong);
    display: grid;
    grid-template-columns: auto minmax(0, 1fr);
    gap: 14px;
    padding: 15px 16px;
    border: 1px solid var(--cl-line);
    border-left: 3px solid var(--tone);
    border-radius: var(--cl-radius-surface);
    background: var(--cl-surface);
    color: var(--cl-ink);
    text-decoration: none;
    transition: border-color var(--cl-dur) var(--cl-ease), box-shadow var(--cl-dur) var(--cl-ease);
  }
  .action:hover { box-shadow: 0 6px 18px rgb(15 23 42 / 7%); }
  .action.is-danger { --tone: var(--cl-problem); }
  .action.is-warning { --tone: var(--cl-attention); }
  .action__count {
    min-width: 34px;
    height: 34px;
    display: grid;
    place-items: center;
    padding-inline: 7px;
    border-radius: var(--cl-radius);
    background: color-mix(in srgb, var(--tone) 12%, var(--cl-surface));
    color: color-mix(in srgb, var(--tone) 78%, var(--cl-ink));
    font-size: 15px;
    font-weight: var(--rst-fw-bold);
    font-variant-numeric: tabular-nums;
  }
  .action__body { min-width: 0; display: grid; gap: 5px; }
  .action__body strong { font-size: 13.5px; }
  .action__items { display: grid; gap: 2px; }
  .action__item {
    display: flex;
    align-items: center;
    gap: 6px;
    overflow: hidden;
    color: var(--cl-muted);
    font-size: 12px;
    white-space: nowrap;
  }
  .action__item em { font-style: normal; opacity: .75; }

  .roster {
    display: grid;
    margin: 0;
    padding: 0;
    border: 1px solid var(--cl-line);
    border-radius: var(--cl-radius-surface);
    background: var(--cl-surface);
    list-style: none;
  }
  .roster__row {
    --tone: var(--cl-line-strong);
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto auto;
    align-items: center;
    gap: 14px;
    padding: 9px 14px;
    box-shadow: inset 3px 0 0 var(--tone);
  }
  .roster__row + .roster__row { border-top: 1px solid var(--cl-grid-line); }
  .roster__row.is-success { --tone: var(--cl-ok); }
  .roster__row.is-warning { --tone: var(--cl-attention); }
  .roster__row.is-danger { --tone: var(--cl-problem); }
  .roster__who { min-width: 0; display: flex; align-items: center; gap: 10px; }
  .roster__avatar {
    width: 27px;
    height: 27px;
    flex: 0 0 auto;
    display: grid;
    place-items: center;
    border-radius: 50%;
    background: var(--cl-surface-muted);
    color: var(--cl-muted);
    font-size: 10.5px;
    font-weight: var(--rst-fw-bold);
  }
  .roster__name { min-width: 0; display: grid; }
  .roster__name strong { overflow: hidden; font-size: 13px; text-overflow: ellipsis; white-space: nowrap; }
  .roster__name small { color: var(--cl-muted); font-size: 11px; }
  .roster__range { color: var(--cl-data-text); font-size: 12.5px; font-variant-numeric: tabular-nums; }
  .roster__status { color: var(--cl-muted); font-size: 12px; white-space: nowrap; }

  /* The sidebar already lists these, so the launcher stays small and quiet. */
  .tiles {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(158px, 1fr));
    gap: 8px;
  }
  .tile {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 10px 12px;
    border: 1px solid var(--cl-line);
    border-radius: var(--cl-radius-surface);
    background: var(--cl-surface);
    color: var(--cl-ink);
    font-size: 13px;
    text-decoration: none;
    transition: border-color var(--cl-dur) var(--cl-ease);
  }
  .tile:hover { border-color: color-mix(in srgb, var(--tile-color) 45%, var(--cl-line)); }
  .tile__icon {
    width: 30px;
    height: 30px;
    flex: 0 0 auto;
    display: grid;
    place-items: center;
    border-radius: var(--cl-radius);
    background: color-mix(in srgb, var(--tile-color) 11%, var(--cl-surface));
    color: var(--tile-color);
  }
  .tile__label { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

  .upcoming {
    margin: 2px 0 0;
    color: var(--cl-muted);
    font-size: 11.5px;
  }
  .upcoming span {
    margin-right: 7px;
    font-weight: var(--rst-fw-bold);
    letter-spacing: .04em;
    text-transform: uppercase;
  }

  @media (max-width: 760px) {
    .today { align-items: flex-start; }
    .today__live { flex-wrap: wrap; }
    .roster__row { grid-template-columns: minmax(0, 1fr) auto; }
    .roster__status { grid-column: 1 / -1; }
  }
</style>
