<script lang="ts">
  import { saveAbsence } from '$lib/api/mutations';
  import { auth } from '$lib/auth/session.svelte';
  import {
    addDays,
    greetingForMinutes,
    localDateTimeParts,
    mondayFor,
    serviceLabel
  } from '$lib/calendar/date';
  import LiveDuration from '$lib/components/LiveDuration.svelte';
  import PageScaffold from '$lib/components/PageScaffold.svelte';
  import PageHero from '$lib/components/PageHero.svelte';
  import SetupGuide, { type SetupStep } from '$lib/components/SetupGuide.svelte';
  import type { ManagerOperationsReadModel } from '$lib/api/workspace-snapshot';
  import { buildHomeModel, type HomeActionRow, type HomeLiveRow, type Tone } from '$lib/home/home-model';
  import { countUp } from '$lib/motion/countUp';
  import { portal } from '$lib/actions/portal';
  import { buildEmployeeColorMap } from '$lib/ui/position-color';
  import { workspaceRealtime } from '$lib/realtime/workspace-realtime.svelte';
  import { toasts } from '$lib/ui/toast.svelte';
  import { workspace } from '$lib/workspace/workspace.svelte';
  import { i18n, t } from '$lib/i18n/i18n.svelte';
  import { restaurantWeather } from '$lib/weather/restaurant-weather.svelte';
  import { weatherCondition, weatherImpact as buildWeatherImpact, weatherSymbol } from '$lib/weather/weather';

  const MIN_TIMELINE_SPAN = 8 * 60;

  const membership = $derived(workspace.active);
  const snapshot = $derived(workspace.operations);
  const weatherLocation = $derived(
    snapshot
      ? {
          city: snapshot.restaurant.city ?? '',
          postalCode: snapshot.restaurant.postal_code ?? '',
          countryCode: snapshot.restaurant.country_code,
          timezone: snapshot.restaurant_settings.timezone ?? undefined
        }
      : null
  );
  const employeeColor = $derived(
    snapshot
      ? buildEmployeeColorMap(snapshot.job_functions, snapshot.employee_job_functions)
      : new Map<string, string>()
  );
  const timezone = $derived(
    snapshot?.restaurant_settings.timezone ||
      workspace.bootstrap?.restaurant_settings.timezone ||
      'Europe/Brussels'
  );
  let currentInstant = $state(new Date());
  const localNow = $derived(localDateTimeParts(currentInstant, timezone));
  const today = $derived(localNow.date);
  const activeWeek = $derived(mondayFor(today));
  $effect(() => {
    const timer = setInterval(() => (currentInstant = new Date()), 60_000);
    return () => clearInterval(timer);
  });
  $effect(() => {
    if (workspace.activeId && membership && membership.role !== 'employee') {
      void workspace.loadOperations(activeWeek, addDays(activeWeek, 6), true).catch(() => undefined);
    }
  });
  $effect(() => {
    if (weatherLocation?.city) void restaurantWeather.load(weatherLocation);
  });
  const model = $derived(
    snapshot && membership
      ? buildHomeModel(snapshot, membership.role)
      : null
  );
  const weather = $derived(restaurantWeather.snapshot);
  const weatherImpact = $derived(weather ? buildWeatherImpact(weather) : null);
  const todayWeather = $derived(weather?.daily.find((day) => day.date === today) ?? null);
  const weatherUpdatedLabel = $derived(
    weather ? weather.observedAt.slice(11, 16) || weather.observedAt : ''
  );
  const firstName = $derived(
    String(
      workspace.bootstrap?.current_employee?.first_name ||
        auth.user?.user_metadata?.first_name ||
        auth.user?.user_metadata?.name ||
        auth.user?.email ||
        'Manager'
    )
      .split(/[ .@]/)
      .filter(Boolean)[0]
  );
  const setupSteps = $derived<SetupStep[]>(
    snapshot
      ? [
          {
            label: 'Restaurant operations',
            detail: 'Areas, positions and opening services',
            complete:
              snapshot.work_areas.some((item) => item.active) &&
              snapshot.job_functions.some((item) => item.active) &&
              snapshot.opening_hours.some((item) => item.is_open),
            href: '/restaurant'
          },
          {
            label: 'Active team',
            detail: 'Employees available for scheduling',
            complete: snapshot.employees.some((item) => item.active),
            href: '/team'
          },
          {
            label: 'Coverage rules',
            detail: 'Minimum staffing requirements',
            complete: snapshot.coverage_requirements.some((item) => item.active),
            href: '/restaurant'
          },
          {
            label: 'Absence policy',
            detail: 'At least one active leave type',
            complete: snapshot.absence_types.some((item) => item.active),
            href: '/restaurant'
          }
        ]
      : []
  );
  const pendingAbsences = $derived(
    snapshot?.absences
      .filter((absence) => absence.status === 'pending')
      .sort((left, right) => left.start_date.localeCompare(right.start_date)) ?? []
  );
  const payrollAction = $derived(model?.actions.rows.find((row) => row.key === 'payroll') ?? null);
  const decisionRows = $derived(model?.actions.rows.filter((row) => row.key !== 'payroll') ?? []);
  const decisionTotal = $derived(decisionRows.reduce((total, row) => total + row.count, 0));
  let liveFilter = $state<Tone | null>(null);
  let liveExpanded = $state(false);
  let expandedLiveKey = $state('');
  const allLiveRows = $derived(model?.live.rows.slice(0, 7) ?? []);
  const liveRows = $derived(
    liveFilter ? allLiveRows.filter((row) => row.tone === liveFilter) : allLiveRows
  );
  // The fullscreen monitor shows the whole floor for today, not just exceptions.
  const todayRosterRows = $derived(model?.live.todayRoster ?? []);
  const serviceDateLabel = $derived(
    new Intl.DateTimeFormat(i18n.intlLocale, {
      weekday: 'short',
      day: '2-digit',
      month: 'short',
      timeZone: timezone
    }).format(new Date(`${today}T12:00:00`))
  );
  const nowMinutes = $derived(localNow.minutes);
  const greeting = $derived(greetingForMinutes(nowMinutes));
  const todayWeekday = $derived(
    Math.round(
      (Date.parse(`${today}T00:00:00Z`) - Date.parse(`${mondayFor(today)}T00:00:00Z`)) /
        86_400_000
    ) + 1
  );
  const openingTimelineWindow = $derived(
    snapshot ? openingWindowForToday(snapshot.opening_hours, todayWeekday) : null
  );
  // Window spans the whole floor for today so inline + fullscreen bars align.
  const timelineWindow = $derived(
    buildTimelineWindow(
      todayRosterRows.length ? todayRosterRows : liveRows,
      nowMinutes,
      openingTimelineWindow
    )
  );
  const timelineTicks = $derived(buildTimelineTicks(timelineWindow));
  const nowMarkerLeft = $derived(`${timelinePercent(nowMinutes, timelineWindow)}%`);
  const coverageRooms = $derived(
    snapshot
      ? snapshot.work_areas
          .filter((area) => area.active)
          .sort((left, right) => left.sort_order - right.sort_order || left.name.localeCompare(right.name))
          .slice(0, 4)
          .map((area) => {
            // Coverage is read per service so a shortfall is attributed to
            // lunch (☀) or evening (☾), not blended into one ambiguous ratio.
            const services = (['lunch', 'evening'] as const).map((serviceKey) => {
              const requiredCount = snapshot.coverage_requirements
                .filter(
                  (requirement) =>
                    requirement.active &&
                    requirement.area_id === area.id &&
                    requirement.service_key === serviceKey &&
                    Number(requirement.required_count) > 0 &&
                    (requirement.weekday === todayWeekday ||
                      requirement.weekday === null ||
                      requirement.coverage_scope === 'default')
                )
                .reduce((total, requirement) => total + Number(requirement.required_count ?? 0), 0);
              const plannedCount = snapshot.planned_shifts.filter(
                (shift) =>
                  shift.week_start === activeWeek &&
                  shift.weekday === todayWeekday &&
                  shift.area_id === area.id &&
                  shift.service_key === serviceKey
              ).length;
              const status = (requiredCount === 0
                ? plannedCount > 0
                  ? 'covered'
                  : 'none'
                : plannedCount < requiredCount
                  ? 'under'
                  : plannedCount > requiredCount
                    ? 'over'
                    : 'covered') as 'under' | 'covered' | 'over' | 'none';
              return {
                serviceKey,
                icon: serviceKey === 'evening' ? '☾' : '☀',
                required: requiredCount,
                planned: plannedCount,
                status,
                people: [] as { id: string; name: string }[]
              };
            });
            // One row per person, tagged with the services they cover, so
            // someone on both lunch and evening reads as a single entry (☀☾)
            // instead of appearing twice.
            const assignmentMap = new Map<
              string,
              { id: string; name: string; lunch: boolean; evening: boolean }
            >();
            for (const shift of snapshot.planned_shifts) {
              if (
                shift.week_start !== activeWeek ||
                shift.weekday !== todayWeekday ||
                shift.area_id !== area.id
              )
                continue;
              const name = snapshot.employees.find((employee) => employee.id === shift.employee_id)?.display_name;
              if (!name) continue;
              const existing =
                assignmentMap.get(shift.employee_id) ??
                { id: shift.employee_id, name, lunch: false, evening: false };
              if (shift.service_key === 'evening') existing.evening = true;
              else existing.lunch = true;
              assignmentMap.set(shift.employee_id, existing);
            }
            const assignments = [...assignmentMap.values()];
            // Attach the actual people covering each service so the floor card
            // shows who works lunch vs evening, not one blended crew.
            for (const service of services) {
              service.people = assignments
                .filter((entry) => (service.serviceKey === 'evening' ? entry.evening : entry.lunch))
                .map((entry) => ({ id: entry.id, name: entry.name }));
            }
            return {
              id: area.id,
              label: area.name,
              services,
              // Room tone is the worst of its two services.
              tone: services.some((service) => service.status === 'under')
                ? 'danger'
                : services.some((service) => service.status === 'covered' || service.status === 'over')
                  ? 'success'
                  : 'warning'
            };
          })
      : []
  );
  let expandedDecisionKey = $state('');
  let resolvingAbsenceId = $state('');

  const decisionDestinations: Record<string, string> = {
    '/schedule': 'Open Schedule',
    '/timesheet': 'Open Timesheet',
    '/team': 'Open Team',
    '/restaurant': 'Open Restaurant'
  };

  function decisionLinkLabel(href: string) {
    return decisionDestinations[href] ?? 'Open';
  }

  function clamp(value: number, min: number, max: number) {
    return Math.max(min, Math.min(max, value));
  }

  function timelinePercent(minutes: number, window: { start: number; end: number }) {
    let value = minutes;
    if (value < window.start && window.end > 1440) value += 1440;
    return clamp(((value - window.start) / Math.max(1, window.end - window.start)) * 100, 0, 100);
  }

  function liveRowTimes(row: HomeLiveRow) {
    const times = Array.from(row.range.matchAll(/(\d{1,2}):(\d{2})/g)).map((match) =>
      Number(match[1]) * 60 + Number(match[2])
    );
    const start = times[0] ?? row.startMinutes;
    // An ongoing shift ("HH:MM–live") only parses one clock time. Its bar must
    // run to *now*, not to start+24h — otherwise a single live row balloons the
    // whole timeline window and paints a full-day bar.
    if (times.length < 2 && /live/i.test(row.range)) {
      const end = nowMinutes >= start ? nowMinutes : nowMinutes + 1440;
      return { start, end: Math.max(end, start + 30) };
    }
    let end = times.at(-1) ?? start + 180;
    if (end <= start) end += 1440;
    return { start, end };
  }

  function liveRowSegments(row: HomeLiveRow) {
    const ranges = Array.from(row.range.matchAll(/(\d{1,2}):(\d{2})\s*[-–]\s*(\d{1,2}):(\d{2})/g)).map(
      (match) => {
        const start = Number(match[1]) * 60 + Number(match[2]);
        let end = Number(match[3]) * 60 + Number(match[4]);
        if (end <= start) end += 1440;
        return {
          start,
          end,
          label: `${formatClock(start)}-${formatClock(end)}`
        };
      }
    );

    if (ranges.length) return ranges;
    const { start, end } = liveRowTimes(row);
    return [{ start, end, label: row.range }];
  }

  function openingWindowForToday(
    openingHours: ManagerOperationsReadModel['opening_hours'],
    weekday: number
  ) {
    const ranges = openingHours
      .filter((row) => row.weekday === weekday && row.is_open)
      .map((row) => ({
        start: clockMinutes(row.opens_at),
        end: clockMinutes(row.closes_at)
      }))
      .filter((range): range is { start: number; end: number } => range.start !== null && range.end !== null)
      .map((range) => ({
        start: range.start,
        end: range.end <= range.start ? range.end + 1440 : range.end
      }));
    if (!ranges.length) return null;
    return {
      start: Math.max(0, Math.floor((Math.min(...ranges.map((range) => range.start)) - 60) / 60) * 60),
      end: Math.ceil((Math.max(...ranges.map((range) => range.end)) + 60) / 60) * 60
    };
  }

  function clockMinutes(value: string | null): number | null {
    const match = String(value ?? '').match(/^(\d{1,2}):(\d{2})/);
    if (!match) return null;
    const hours = Number(match[1]);
    const minutes = Number(match[2]);
    return Number.isFinite(hours) && Number.isFinite(minutes) ? hours * 60 + minutes : null;
  }

  function buildTimelineWindow(
    rows: HomeLiveRow[],
    currentMinutes: number,
    openingWindow: { start: number; end: number } | null
  ) {
    const ranges = rows.map(liveRowTimes);
    const starts = ranges.map((range) => range.start);
    const ends = ranges.map((range) => range.end);
    // Window = the union of the opening hours AND every shift on the board,
    // padded one hour and snapped to the hour. Anchoring only to opening hours
    // let an early clock-in (or a late shift) fall off the axis; taking the
    // union guarantees every bar lands under a real tick.
    const earliest = Math.min(currentMinutes, openingWindow?.start ?? 12 * 60, ...starts);
    const latest = Math.max(currentMinutes, openingWindow?.end ?? 20 * 60, ...ends);
    const start = Math.max(0, Math.floor((earliest - 60) / 60) * 60);
    let end = Math.ceil((latest + 60) / 60) * 60;
    if (end - start < MIN_TIMELINE_SPAN) end = start + MIN_TIMELINE_SPAN;
    return { start, end };
  }

  function buildTimelineTicks(window: { start: number; end: number }) {
    const span = window.end - window.start;
    const step = span > 14 * 60 ? 4 * 60 : span > 9 * 60 ? 3 * 60 : 2 * 60;
    const first = Math.ceil(window.start / step) * step;
    const ticks: number[] = [];
    for (let tick = first; tick <= window.end; tick += step) ticks.push(tick);
    return ticks.length ? ticks : [window.start, window.end];
  }

  function formatTimelineTick(minutes: number) {
    const normalized = ((minutes % 1440) + 1440) % 1440;
    return String(Math.floor(normalized / 60)).padStart(2, '0');
  }

  function liveRowTimelineStyle(row: HomeLiveRow) {
    const { start, end } = liveRowTimes(row);
    const left = timelinePercent(start, timelineWindow);
    const right = timelinePercent(end, timelineWindow);
    const width = clamp(right - left, 8, 100 - left);
    const current = nowMinutes < start && end > 1440 ? nowMinutes + 1440 : nowMinutes;
    const progress =
      row.tone === 'success' || row.tone === 'danger'
        ? clamp(((current - start) / Math.max(1, end - start)) * 100, 8, 100)
        : 0;
    return `--slot-left:${left}%; --slot-width:${width}%; --slot-progress:${progress}%;`;
  }

  function liveRowSegmentStyle(row: HomeLiveRow, segment: { start: number; end: number }) {
    const left = timelinePercent(segment.start, timelineWindow);
    const right = timelinePercent(segment.end, timelineWindow);
    const width = clamp(right - left, 6, 100 - left);
    const current = nowMinutes < segment.start && segment.end > 1440 ? nowMinutes + 1440 : nowMinutes;
    const progress =
      row.tone === 'success' || row.tone === 'danger'
        ? clamp(((current - segment.start) / Math.max(1, segment.end - segment.start)) * 100, 8, 100)
        : 0;
    return `--slot-left:${left}%; --slot-width:${width}%; --slot-progress:${progress}%;`;
  }

  function liveStateLabel(row: HomeLiveRow) {
    const status = row.status.toLowerCase();
    if (row.tone === 'danger') return status.includes('no-show') ? 'No-show' : 'Late';
    if (row.tone === 'warning') return 'Unplanned';
    if (row.tone === 'success') return 'Working';
    return 'Upcoming';
  }

  function openAction(row: HomeActionRow) {
    // Every decision expands in place — leave included, which surfaces inline
    // approve/reject so the whole wall behaves the same way.
    expandedDecisionKey = expandedDecisionKey === row.key ? '' : row.key;
  }

  function liveRowKey(row: HomeLiveRow) {
    return `${row.employeeId}-${row.startMinutes}-${row.status}`;
  }

  function formatClock(minutes: number) {
    const normalized = ((Math.round(minutes) % 1440) + 1440) % 1440;
    return `${String(Math.floor(normalized / 60)).padStart(2, '0')}:${String(normalized % 60).padStart(2, '0')}`;
  }

  function liveRowDetail(row: HomeLiveRow) {
    if (row.tone === 'danger') {
      const lateBy = Math.max(0, nowMinutes - row.startMinutes);
      return `Was due at ${formatClock(row.startMinutes)} — ${lateBy} min ago. Nobody has badged in yet.`;
    }
    if (row.tone === 'success') {
      const worked = Math.max(0, nowMinutes - row.startMinutes);
      const hours = Math.floor(worked / 60);
      const mins = worked % 60;
      return `On the floor for ${hours ? `${hours}h ` : ''}${mins}m so far, since ${formatClock(row.startMinutes)}.`;
    }
    if (row.tone === 'warning') {
      return 'Clocked in without a matching published shift. Worth a quick check.';
    }
    const until = Math.max(0, row.startMinutes - nowMinutes);
    const hours = Math.floor(until / 60);
    const mins = until % 60;
    return `Starts in ${hours ? `${hours}h ` : ''}${mins}m, at ${formatClock(row.startMinutes)}.`;
  }

  function toggleLiveFilter(tone: Tone) {
    liveFilter = liveFilter === tone ? null : tone;
    expandedLiveKey = '';
  }

  function toggleLiveExpand(key: string) {
    expandedLiveKey = expandedLiveKey === key ? '' : key;
  }

  async function resolveAbsence(
    absenceId: string,
    employeeId: string,
    action: 'approve' | 'reject'
  ) {
    if (!workspace.activeId || resolvingAbsenceId) return;
    resolvingAbsenceId = absenceId;
    try {
      await saveAbsence({
        restaurantId: workspace.activeId,
        employeeId,
        absenceId,
        action,
        payload: { manager_comment: `Resolved from Home: ${action}` }
      });
      await workspace.reloadOperations();
      await workspaceRealtime.publish('team-updated', {
        restaurantId: workspace.activeId,
        source: 'team'
      });
      toasts.show(action === 'approve' ? 'Leave approved.' : 'Leave rejected.', 'success');
      if (!workspace.operations?.absences.some((absence) => absence.status === 'pending')) {
        expandedDecisionKey = '';
      }
    } catch (error) {
      toasts.show(error instanceof Error ? error.message : String(error), 'danger');
    } finally {
      resolvingAbsenceId = '';
    }
  }
</script>

<svelte:head>
  <title>Home · restogogo</title>
</svelte:head>

<section class="home">
  {#if workspace.moduleLoading && !snapshot}
    <div class="state" aria-live="polite">
      <span class="spinner" aria-hidden="true"></span>
      <p>{t('Loading your restaurant cockpit…')}</p>
    </div>
  {:else if workspace.error && !snapshot}
    <div class="state is-error" role="alert">
      <strong>{t('We could not load the workspace.')}</strong>
      <p>{workspace.error}</p>
      <button type="button" onclick={() => workspace.load()}>{t('Try again')}</button>
    </div>
  {:else if model && membership}
    {#snippet pageHeader()}
      <PageHero
        eyebrow={`${serviceDateLabel} · ${t('Service command')}`}
        titleId="home-title"
        title={`${t(greeting)}, ${firstName}.`}
        subtitle={t('Start with the one thing that can block service, keep the floor moving, then close payroll with proof.')}
      >
        {#snippet command()}
          <div class="home-hero__command" aria-label={t('Today command signal')}>
            <div class:has-pressure={decisionTotal > 0 || model.live.late > 0} class="signal-orb">
              <strong use:countUp={decisionTotal}>{decisionTotal}</strong>
              <span>{t(decisionTotal === 1 ? 'decision' : 'decisions')}</span>
            </div>
            <dl>
              <button type="button" class="stat-filter" class:is-active={liveFilter === 'success'} onclick={() => toggleLiveFilter('success')}>
                <dt>{t('Working')}</dt>
                <dd use:countUp={model.live.working}>{model.live.working}</dd>
              </button>
              <button type="button" class="stat-filter" class:is-active={liveFilter === 'danger'} onclick={() => toggleLiveFilter('danger')}>
                <dt>{t('Late')}</dt>
                <dd use:countUp={model.live.late}>{model.live.late}</dd>
              </button>
              <button type="button" class="stat-filter" class:is-active={liveFilter === 'neutral'} onclick={() => toggleLiveFilter('neutral')}>
                <dt>{t('Upcoming')}</dt>
                <dd use:countUp={model.live.upcoming}>{model.live.upcoming}</dd>
              </button>
            </dl>
          </div>
        {/snippet}
      </PageHero>
      {#if workspace.error}
        <p class="inline-error" role="alert">{workspace.error}</p>
      {/if}
    {/snippet}

    <PageScaffold header={pageHeader} label={t('Home command center')}>
      <div class="command-center">
        <div class="command-grid">
          <aside class="decision-stack" aria-label={t('Decision wall')}>
            <section class="decision-wall" aria-label={t('Open decisions')}>
              <header>
                <span class="section-kicker">{t('Decision wall')}</span>
                <strong>{decisionTotal} {t('open')}</strong>
              </header>
              <div>
                {#each decisionRows as action, index}
                  {@const isOpen = expandedDecisionKey === action.key}
                  <div
                    class={`decision-row is-${action.tone} rst-stagger-in`}
                    class:is-open={isOpen}
                    class:is-zero={action.count === 0}
                    style={`--rst-i:${index}`}
                  >
                    <button
                      type="button"
                      class="decision-row__toggle"
                      aria-expanded={isOpen}
                      onclick={() => openAction(action)}
                    >
                      <span aria-hidden="true">{action.symbol}</span>
                      <strong>{t(action.label)}</strong>
                      <small>{t(action.meta)}</small>
                      <b>{action.count}</b>
                      <i class="decision-row__go" aria-hidden="true">{action.count === 0 ? '' : isOpen ? '−' : '+'}</i>
                    </button>
                    {#if isOpen}
                      <div class="decision-detail">
                        {#if action.key === 'leave' && pendingAbsences.length}
                          <ul>
                            {#each pendingAbsences.slice(0, 6) as absence (absence.id)}
                              <li class="decision-approve">
                                <div>
                                  <b>{snapshot?.employees.find((employee) => employee.id === absence.employee_id)?.display_name ?? 'Employee'}</b>
                                  <span>{absence.start_date === absence.end_date ? absence.start_date : `${absence.start_date} → ${absence.end_date}`}</span>
                                </div>
                                <span class="decision-approve__actions">
                                  <button type="button" disabled={Boolean(resolvingAbsenceId)} onclick={() => resolveAbsence(absence.id, absence.employee_id, 'approve')}>{t('Approve')}</button>
                                  <button type="button" class="is-reject" disabled={Boolean(resolvingAbsenceId)} onclick={() => resolveAbsence(absence.id, absence.employee_id, 'reject')}>{t('Reject')}</button>
                                </span>
                              </li>
                            {/each}
                          </ul>
                        {:else if action.items.length}
                          <ul>
                            {#each action.items as item (item.id)}
                              <li><b>{item.label}</b><span>{item.meta}</span></li>
                            {/each}
                          </ul>
                        {:else}
                          <p>{t('No specific items to review right now.')}</p>
                        {/if}
                        <a href={action.href}>{decisionLinkLabel(action.href)} →</a>
                      </div>
                    {/if}
                  </div>
                {/each}
              </div>
            </section>

            {#if payrollAction}
              <article class="payroll-setup">
                <span class="section-kicker">{t('Payroll setup')}</span>
                <h2>{payrollAction.count ? t('Missing payroll info') : t('Payroll setup complete')}</h2>
                <p>{t(payrollAction.meta)}</p>
                <div class="payroll-setup__count">
                  <strong use:countUp={payrollAction.count}>{payrollAction.count}</strong>
                  <span>{payrollAction.count ? payrollAction.count === 1 ? 'employee needs setup' : 'employees need setup' : 'no records missing'}</span>
                </div>
                <a class="primary-link" href={payrollAction.href}>{t('Open Team')}</a>
              </article>
            {/if}
          </aside>

          <section class="operations-stack" aria-label="Live monitor and coverage">
            {#if weatherLocation?.city}
              <section class={`weather-brief is-${weatherImpact?.tone ?? 'loading'}`} aria-label={t('Restaurant weather')}>
                {#if weather}
                  <header class="weather-current">
                    <span class="weather-symbol" aria-hidden="true">{weatherSymbol(weather.code, weather.isDay)}</span>
                    <div>
                      <span class="section-kicker">{t('Weather')} · {weather.location.name}</span>
                      <h2>{Math.round(weather.temperatureC)}° <small>{t(weatherCondition(weather.code))}</small></h2>
                    </div>
                  </header>
                  <div class="weather-impact">
                    <span>{t('Service outlook')}</span>
                    <strong>{t(weatherImpact?.label ?? '')}</strong>
                    <p>{t(weatherImpact?.detail ?? '')}</p>
                  </div>
                  <dl class="weather-stats">
                    <div><dt>{t('Rain · next 12h')}</dt><dd>{weather.nextRainChance}%</dd></div>
                    <div><dt>{t('Wind')}</dt><dd>{Math.round(weather.windKph)} <small>km/h</small></dd></div>
                    <div><dt>{t('Today')}</dt><dd>{todayWeather ? `${Math.round(todayWeather.lowC)}–${Math.round(todayWeather.highC)}°` : '—'}</dd></div>
                  </dl>
                  <footer>
                    <span>{t('Updated {time}', { time: weatherUpdatedLabel })}</span>
                    <a href="https://open-meteo.com/" target="_blank" rel="noreferrer">{t('Weather data by Open-Meteo')}</a>
                    <button type="button" aria-label={t('Refresh weather')} title={t('Refresh weather')} onclick={() => restaurantWeather.load(weatherLocation, true)}>↻</button>
                  </footer>
                {:else if restaurantWeather.loading}
                  <div class="weather-state" aria-live="polite">
                    <span class="weather-symbol" aria-hidden="true">◌</span>
                    <div><strong>{t('Reading the local forecast')}</strong><small>{weatherLocation.city}</small></div>
                  </div>
                {:else}
                  <div class="weather-state is-error">
                    <span class="weather-symbol" aria-hidden="true">◌</span>
                    <div><strong>{t('Weather is temporarily unavailable')}</strong><small>{t('Restaurant operations remain unchanged.')}</small></div>
                    <button type="button" onclick={() => restaurantWeather.load(weatherLocation, true)}>{t('Retry')}</button>
                  </div>
                {/if}
              </section>
            {/if}

            {#snippet liveTimeline(rows: HomeLiveRow[], detailed = false)}
              <div class="time-axis" style={`--now-left:${nowMarkerLeft}`} aria-hidden="true">
                <span class="axis-cell"></span>
                <span class="axis-track">
                    <span class="now-pill">{t('Now')}</span>
                  {#each timelineTicks as tick}
                    <span class="axis-tick" style={`--tick-left:${timelinePercent(tick, timelineWindow)}%`}>{formatTimelineTick(tick)}</span>
                  {/each}
                </span>
                <span class="axis-cell"></span>
              </div>
              <div class="live-rows" style={`--now-left:${nowMarkerLeft}`}>
                {#each rows as row, index}
                  {@const key = liveRowKey(row)}
                  <button
                    type="button"
                    class={`live-row is-${row.tone} rst-stagger-in`}
                    class:is-open={expandedLiveKey === key}
                    style={`${liveRowTimelineStyle(row)} --rst-i:${index}`}
                    onclick={() => toggleLiveExpand(key)}
                  >
                    <span class="live-row__person">
                      <span class="avatar" style={employeeColor.get(row.employeeId) ? `--avatar-color:${employeeColor.get(row.employeeId)};` : undefined}>{row.name.slice(0, 2).toUpperCase()}</span>
                      <span>
                        <strong>{row.name}</strong>
                        <small>{row.role}</small>
                      </span>
                    </span>
                    <span class="live-row__bar" aria-label={row.range}>
                      {#each liveRowSegments(row) as segment, segmentIndex (`${key}-${segmentIndex}`)}
                        <span class="live-row__segment" style={liveRowSegmentStyle(row, segment)}>
                          <b>{segment.label}</b>
                        </span>
                      {/each}
                    </span>
                    <em>{liveStateLabel(row)}</em>
                    {#if detailed}
                      <span class="live-row__stat">
                        <span>{row.detail}</span>
                        {#if row.liveSince}<LiveDuration since={row.liveSince} />{/if}
                      </span>
                    {/if}
                    {#if expandedLiveKey === key}
                      <span class="live-row__detail">
                        <span>{liveRowDetail(row)}</span>
                        <a href="/timesheet">{t('Open in Timesheet →')}</a>
                      </span>
                    {/if}
                  </button>
                {:else}
                  <div class="live-empty">
                    <strong>{liveFilter ? t('Nothing in this filter right now.') : t('No live service pressure.')}</strong>
                    <span>{liveFilter ? t('Clear the filter above to see everyone.') : t('Today is quiet, or no shift is close enough to monitor.')}</span>
                  </div>
                {/each}
              </div>
            {/snippet}

            <div class="live-command">
              <div class="live-command__timeline">
                <header>
                  <div>
                    <span class="section-kicker">{t('Live monitor')}</span>
                    <h2>{model.live.late ? t('Service pressure') : t('Floor movement')}</h2>
                  </div>
                  <div class="live-command__tools">
                    <strong class="live-summary">
                      {model.live.working} working &middot; {model.live.late} late &middot; {model.live.upcoming} upcoming
                    </strong>
                    <button type="button" class="live-expand" onclick={() => (liveExpanded = true)} aria-label="Expand live monitor" title="Expand to full screen">⤢</button>
                  </div>
                </header>
                {@render liveTimeline(liveRows)}
              </div>
            </div>

            <div class="coverage-map" aria-label="Coverage by work area">
              <header>
                <div>
                  <span class="section-kicker">{t('Coverage floor')}</span>
                  <h3>{t('Rooms to watch today')}</h3>
                </div>
                <a href="/schedule">{t('Open Schedule')}</a>
              </header>
              <div class="coverage-rooms">
                {#each coverageRooms as room, roomIndex}
                  <a href="/schedule" class={`coverage-room is-${room.tone} rst-stagger-in`} style={`--rst-i:${roomIndex}`}>
                    <span class="coverage-room__head">
                      <strong>{room.label}</strong>
                      {#if room.services.some((service) => service.status === 'under')}
                        <span class="coverage-room__flag is-under">{t('Short')}</span>
                      {:else}
                        <span class="coverage-room__flag is-ok">{t('Covered')}</span>
                      {/if}
                    </span>
                    {#each room.services as service}
                      <div class={`room-service is-${service.status}`}>
                        <span class="room-service__lead">
                          <b class="room-service__icon">{service.icon}</b>
                          <span class="room-service__count">{service.planned}/{service.required || service.planned}</span>
                        </span>
                        <span class="room-service__slots">
                          {#each service.people.slice(0, 5) as person (person.id)}
                            <span
                              class="room-slot is-filled"
                              style={employeeColor.get(person.id) ? `--avatar-color:${employeeColor.get(person.id)};` : undefined}
                              title={person.name}
                            >{person.name.slice(0, 2).toUpperCase()}</span>
                          {/each}
                          {#if service.people.length > 5}
                            <span class="room-slot__more">+{service.people.length - 5}</span>
                          {/if}
                          {#each Array(Math.max(0, service.required - service.people.length)) as _, slotIndex (slotIndex)}
                            <span class="room-slot is-empty" aria-hidden="true"></span>
                          {/each}
                          {#if service.required === 0 && service.people.length === 0}
                            <em class="room-service__empty">{t('No cover set')}</em>
                          {/if}
                        </span>
                      </div>
                    {/each}
                  </a>
                {:else}
                  <div class="coverage-room is-warning">
                    <span class="coverage-room__head"><strong>{t('Coverage floor')}</strong></span>
                    <em class="room-service__empty">{t('No active work areas yet')}</em>
                  </div>
                {/each}
              </div>
            </div>
            {#if liveExpanded}
              <div class="live-fullscreen" use:portal role="dialog" aria-modal="true" aria-label="Live floor monitor">
                <button type="button" class="live-fullscreen__scrim" aria-label="Close live monitor" onclick={() => (liveExpanded = false)}></button>
                <div class="live-fullscreen__panel">
                  <header>
                    <div>
                      <span class="section-kicker">Live monitor · {serviceDateLabel}</span>
                      <h2>{model.live.late ? 'Service pressure' : 'Floor movement'}</h2>
                    </div>
                    <div class="live-command__tools">
                      <strong class="live-summary">
                        {model.live.working} working &middot; {model.live.late} late &middot; {model.live.upcoming} upcoming
                      </strong>
                      <button type="button" class="live-expand" onclick={() => (liveExpanded = false)} aria-label="Close" title="Close">✕</button>
                    </div>
                  </header>
                  {@render liveTimeline(todayRosterRows, true)}
                </div>
              </div>
            {/if}
          </section>

        </div>

        {#if membership.role === 'owner' && setupSteps.some((step) => !step.complete)}
          <div class="setup"><SetupGuide title="Finish workspace setup" steps={setupSteps} /></div>
        {/if}
      </div>
    </PageScaffold>
  {:else}
    <div class="state">
      <strong>No active workspace</strong>
      <p>Your account is not linked to an active restaurant.</p>
    </div>
  {/if}
</section>

<style>
  .home {
    width: 100%;
    margin: 0;
  }

  .home :global(.page-scaffold) {
    gap: 0;
  }

  .home-hero__command {
    animation: rst-fade-up .5s var(--rst-ease-out) .08s backwards;
    position: relative;
    z-index: 1;
  }

  .section-kicker {
    color: var(--rst-ui-action);
    font-size: 11px;
    font-weight: var(--rst-fw-display);
    letter-spacing: 0.1em;
    text-transform: uppercase;
  }

  .home-hero__command {
    align-self: center;
    justify-self: end;
    width: min(100%, 430px);
    display: flex;
    align-items: end;
    justify-content: end;
    gap: 14px;
  }

  .signal-orb {
    width: clamp(138px, 14vw, 184px);
    aspect-ratio: 1;
    display: grid;
    place-content: center;
    justify-items: center;
    border: 1px solid rgba(255, 255, 255, 0.18);
    border-radius: var(--rst-ui-radius-pill);
    background:
      radial-gradient(circle at center, rgba(10, 16, 24, 0.92) 0 43%, transparent 44%),
      conic-gradient(var(--rst-green) 0 58%, var(--rst-gold) 58% 78%, var(--rst-ui-action) 78% 100%);
    box-shadow: 0 18px 50px rgba(0, 0, 0, 0.32);
    animation: rst-scale-in .6s var(--rst-ease-spring) .1s backwards;
    transition: transform .2s var(--rst-ease-out);
  }

  .signal-orb:hover {
    transform: scale(1.035);
  }

  .signal-orb.has-pressure {
    background:
      radial-gradient(circle at center, rgba(10, 16, 24, 0.92) 0 43%, transparent 44%),
      conic-gradient(var(--rst-ui-action) 0 34%, var(--rst-gold) 34% 67%, var(--rst-green) 67% 100%);
    animation: rst-scale-in .6s var(--rst-ease-spring) .1s backwards, rst-pulse-ring 2.4s ease-out 1s infinite;
  }

  .signal-orb strong {
    font-size: clamp(44px, 6vw, 70px);
    line-height: 0.9;
    letter-spacing: -0.08em;
  }

  .signal-orb span {
    color: #ffd9c8;
    font-size: 10px;
    font-weight: var(--rst-fw-display);
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }

  .home-hero__command dl {
    width: min(100%, 230px);
    display: grid;
    grid-template-columns: 1fr;
    gap: 8px;
    margin: 0;
  }

  .stat-filter {
    min-width: 0;
    width: 100%;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 6px 4px;
    border: 0;
    border-bottom: 1px solid rgba(255, 255, 255, 0.16);
    border-radius: var(--rst-ui-radius-sm);
    background: transparent;
    font: inherit;
    text-align: left;
    cursor: pointer;
  }

  .stat-filter:hover {
    background: rgba(255, 255, 255, 0.08);
  }

  .stat-filter.is-active {
    background: rgba(var(--rst-ui-action-rgb), 0.22);
    border-bottom-color: rgba(var(--rst-ui-action-rgb), 0.4);
  }

  .stat-filter.is-active dt {
    color: #ffd9c8;
  }

  .home-hero__command dt {
    color: rgba(255, 250, 242, 0.64);
    font-size: 10px;
    font-weight: var(--rst-fw-display);
    text-transform: uppercase;
  }

  .home-hero__command dd {
    margin: 0;
    color: #fff;
    font-size: 22px;
    font-weight: var(--rst-fw-display);
  }

  .state button {
    padding: 9px 14px;
    border: 1px solid var(--rst-ui-line);
    border-radius: var(--rst-ui-radius-md);
    color: var(--rst-ui-text);
    background: var(--rst-ui-surface-field-strong);
    font: inherit;
    font-size: 13px;
    font-weight: var(--rst-fw-bold);
    cursor: pointer;
  }

  .command-center {
    width: 100%;
    min-height: 0;
    display: grid;
    gap: 14px;
    /* Full-bleed like the hero: same inset, no page-background frame around the body. */
    padding: clamp(22px, 4vw, 38px);
  }

  .command-grid {
    min-width: 0;
    display: grid;
    grid-template-columns: minmax(280px, 0.72fr) minmax(560px, 1.58fr);
    gap: 14px;
    align-items: start;
  }

  .decision-stack,
  .operations-stack {
    min-width: 0;
    display: grid;
    gap: 14px;
    align-content: start;
  }

  .payroll-setup,
  .decision-wall,
  .weather-brief,
  .live-command,
  .coverage-map {
    min-width: 0;
    border: 1px solid var(--rst-ui-surface-panel-border);
    border-radius: var(--rst-ui-radius-2xl);
    background: var(--rst-ui-surface-panel);
    box-shadow: var(--rst-ui-shadow-card);
    animation: rst-fade-up .5s var(--rst-ease-out) backwards;
    transition: transform .22s var(--rst-ease-out), box-shadow .22s var(--rst-ease-out);
  }

  .decision-wall { animation-delay: .05s; }
  .weather-brief { animation-delay: .08s; }
  .live-command { animation-delay: .1s; }
  .coverage-map { animation-delay: .16s; }
  .payroll-setup { animation-delay: .2s; }

  .payroll-setup:hover,
  .decision-wall:hover,
  .weather-brief:hover,
  .live-command:hover,
  .coverage-map:hover {
    transform: translateY(-3px);
    box-shadow: 0 22px 48px rgba(0, 0, 0, 0.22);
  }

  .payroll-setup {
    display: grid;
    gap: 10px;
    padding: 18px;
  }

  .payroll-setup h2,
  .live-command h2,
  .coverage-map h3 {
    margin: 0;
    font-size: clamp(22px, 2.4vw, 34px);
    line-height: 0.98;
    letter-spacing: -0.055em;
  }

  .payroll-setup p {
    margin: 0;
    color: var(--rst-ui-muted);
    font-size: 13px;
    line-height: 1.4;
  }

  .payroll-setup__count {
    display: flex;
    align-items: end;
    gap: 8px;
  }

  .payroll-setup__count strong {
    color: var(--rst-ui-action);
    font-size: 44px;
    line-height: 0.9;
    letter-spacing: -0.06em;
  }

  .primary-link {
    width: max-content;
    min-height: 40px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding: 0 14px;
    border: 0;
    border-radius: var(--rst-ui-radius-xl);
    color: #fff;
    background: var(--rst-ui-action);
    font: inherit;
    font-size: 13px;
    font-weight: var(--rst-fw-display);
    text-decoration: none;
    cursor: pointer;
  }

  .weather-brief {
    min-height: 150px;
    display: grid;
    grid-template-columns: minmax(210px, .8fr) minmax(220px, 1fr) minmax(210px, .8fr);
    align-items: center;
    gap: 16px 24px;
    padding: 18px 20px 12px;
    overflow: hidden;
    color: #eaf5ff;
    border-color: rgba(116, 188, 220, .24);
    background: #102635;
  }

  .weather-brief.is-watch { border-color: rgba(247, 183, 51, .42); background: #272719; }
  .weather-brief.is-risk { border-color: rgba(240, 100, 35, .48); background: #302018; }

  .weather-current {
    min-width: 0;
    display: flex;
    align-items: center;
    gap: 14px;
  }

  .weather-symbol {
    width: 64px;
    height: 64px;
    flex: 0 0 auto;
    display: grid;
    place-items: center;
    color: #ffd766;
    font-size: 38px;
    line-height: 1;
  }

  .weather-current > div { min-width: 0; display: grid; gap: 5px; }
  .weather-current h2 { margin: 0; color: #fff; font-size: 34px; line-height: 1; letter-spacing: 0; }
  .weather-current h2 small { color: #a9c2d2; font-size: 13px; font-weight: var(--rst-fw-bold); letter-spacing: 0; }

  .weather-impact { min-width: 0; display: grid; gap: 4px; }
  .weather-impact > span { color: #7fb5d0; font-size: 10px; font-weight: var(--rst-fw-display); text-transform: uppercase; }
  .weather-impact strong { color: #fff; font-size: 17px; }
  .weather-impact p { margin: 0; color: #a9c2d2; font-size: 12px; line-height: 1.45; }

  .weather-stats { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; margin: 0; }
  .weather-stats div { min-width: 0; display: grid; gap: 5px; }
  .weather-stats dt { color: #7fb5d0; font-size: 9px; font-weight: var(--rst-fw-display); text-transform: uppercase; }
  .weather-stats dd { margin: 0; color: #fff; font-size: 18px; font-weight: var(--rst-fw-display); white-space: nowrap; }
  .weather-stats dd small { color: #a9c2d2; font-size: 9px; }

  .weather-brief footer {
    grid-column: 1 / -1;
    min-width: 0;
    display: flex;
    align-items: center;
    gap: 10px;
    padding-top: 10px;
    border-top: 1px solid rgba(255, 255, 255, .08);
    color: #789bad;
    font-size: 9px;
  }

  .weather-brief footer a { color: #9bc8df; text-decoration: none; }
  .weather-brief footer button {
    width: 28px;
    height: 28px;
    margin-left: auto;
    border: 0;
    border-radius: var(--rst-ui-radius-round);
    color: #eaf5ff;
    background: rgba(255, 255, 255, .07);
    font: inherit;
    font-size: 17px;
    cursor: pointer;
  }

  .weather-state {
    grid-column: 1 / -1;
    min-height: 112px;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 14px;
  }
  .weather-state > div { display: grid; gap: 4px; }
  .weather-state strong { color: #fff; }
  .weather-state small { color: #a9c2d2; }
  .weather-state button { margin-left: auto; padding: 8px 12px; border: 1px solid rgba(255,255,255,.14); border-radius: var(--rst-ui-radius-md); color: #fff; background: rgba(255,255,255,.07); font: inherit; cursor: pointer; }

  .decision-wall {
    position: relative;
    overflow: visible;
    border-color: var(--rst-command-border);
    border-radius: var(--rst-command-radius);
    color: var(--rst-command-text);
    background:
      radial-gradient(circle at 85% 10%, rgba(240, 100, 35, 0.45), transparent 36%),
      var(--rst-command-bg-warm);
    box-shadow: var(--rst-command-shadow);
  }

  .decision-wall header {
    border-color: rgba(255, 255, 255, 0.1);
  }

  .decision-wall header strong {
    color: #fffaf2;
    border-color: rgba(255, 255, 255, 0.14);
    background: rgba(255, 255, 255, 0.08);
  }

  .decision-wall header,
  .live-command header,
  .coverage-map header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 14px 16px;
    border-bottom: 1px solid var(--rst-ui-divider-soft);
  }

  .decision-wall header strong,
  .live-summary,
  .coverage-map header a {
    padding: 6px 9px;
    border: 1px solid var(--rst-ui-line);
    border-radius: var(--rst-ui-radius-pill);
    color: var(--rst-ui-text);
    background: var(--rst-ui-surface-field-strong);
    font-size: 11px;
  }

  .live-command__tools .live-summary {
    color: #fffaf2;
    border-color: rgba(255, 255, 255, 0.14);
    background: rgba(255, 255, 255, 0.08);
  }

  .decision-wall > div {
    display: grid;
  }

  .decision-row {
    position: relative;
    min-width: 0;
    border-bottom: 1px solid rgba(255, 255, 255, 0.1);
    color: #fffaf2;
    transition: background-color .16s ease, transform .16s var(--rst-ease-out);
  }

  .decision-row__toggle {
    width: 100%;
    min-width: 0;
    display: grid;
    grid-template-columns: 34px minmax(0, 1fr) auto 16px;
    gap: 0 10px;
    align-items: center;
    padding: 12px 14px;
    border: 0;
    color: inherit;
    background: transparent;
    font: inherit;
    text-align: left;
    cursor: pointer;
  }

  .decision-row:hover {
    background: rgba(255, 255, 255, 0.06);
    transform: translateX(3px);
  }

  .decision-row.is-zero:hover {
    background: rgba(255, 255, 255, 0.025);
    transform: none;
  }

  .decision-row__go {
    grid-row: span 2;
    color: var(--rst-ui-action);
    font-style: normal;
    opacity: 0;
    transform: translateX(-6px);
    transition: opacity .18s ease, transform .18s var(--rst-ease-out);
  }

  .decision-row:hover .decision-row__go {
    opacity: 1;
    transform: translateX(0);
  }

  .decision-row__toggle > span {
    grid-row: span 2;
    width: 30px;
    height: 30px;
    display: grid;
    place-items: center;
    border-radius: var(--rst-ui-radius-lg);
    color: #fff;
    background: var(--rst-ui-action);
    font-weight: var(--rst-fw-display);
  }

  .decision-row__toggle strong,
  .decision-row__toggle small {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .decision-row__toggle strong {
    white-space: normal;
    line-height: 1.15;
  }

  .decision-row__toggle small {
    white-space: nowrap;
    color: rgba(255, 250, 242, 0.6);
    font-size: 11px;
  }

  .decision-row__toggle b {
    grid-row: span 2;
    color: var(--rst-ui-action);
    font-size: 20px;
  }

  .decision-row.is-open {
    background: rgba(255, 255, 255, 0.05);
    transform: none;
  }

  .decision-detail {
    display: grid;
    gap: 10px;
    margin: 0 12px 12px;
    padding: 10px 12px;
    border: 1px solid rgba(255, 255, 255, 0.12);
    border-radius: var(--rst-ui-radius-md);
    background: rgba(0, 0, 0, 0.28);
    animation: rst-fade-up .28s var(--rst-ease-out) backwards;
  }

  .decision-detail li.decision-approve {
    align-items: center;
  }

  .decision-detail li.decision-approve > div {
    min-width: 0;
    display: grid;
    gap: 2px;
  }

  .decision-approve__actions {
    flex: 0 0 auto;
    display: inline-flex;
    gap: 6px;
  }

  .decision-approve__actions button {
    padding: 5px 10px;
    border: 1px solid rgba(66, 216, 132, 0.5);
    border-radius: var(--rst-ui-radius-pill);
    color: #d6ffe6;
    background: rgba(66, 216, 132, 0.16);
    font: inherit;
    font-size: 11px;
    font-weight: var(--rst-fw-display);
    cursor: pointer;
    transition: background-color .15s ease, transform .15s var(--rst-ease-out);
  }

  .decision-approve__actions button:hover:not(:disabled) {
    transform: translateY(-1px);
    background: rgba(66, 216, 132, 0.28);
  }

  .decision-approve__actions button.is-reject {
    border-color: rgba(240, 100, 35, 0.5);
    color: #ffd9c8;
    background: rgba(240, 100, 35, 0.16);
  }

  .decision-approve__actions button.is-reject:hover:not(:disabled) {
    background: rgba(240, 100, 35, 0.28);
  }

  .decision-approve__actions button:disabled {
    opacity: 0.6;
    cursor: default;
  }

  .decision-detail ul {
    display: grid;
    gap: 6px;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .decision-detail li {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    padding: 7px 9px;
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: var(--rst-ui-radius-md);
    background: rgba(255, 255, 255, 0.06);
  }

  .decision-detail li b {
    color: #fffaf2;
    font-size: 12px;
    font-weight: var(--rst-fw-bold);
  }

  .decision-detail li span {
    color: rgba(255, 250, 242, 0.58);
    font-size: 10px;
    text-align: right;
  }

  .decision-detail p {
    margin: 0;
    color: rgba(255, 250, 242, 0.7);
    font-size: 12px;
  }

  .decision-detail > a {
    justify-self: start;
    color: var(--rst-ui-action);
    font-size: 12px;
    font-weight: var(--rst-fw-bold);
    text-decoration: none;
  }

  .decision-detail > a:hover {
    text-decoration: underline;
  }

  .live-command {
    overflow: hidden;
    background:
      linear-gradient(180deg, rgba(255, 255, 255, 0.025), transparent 35%),
      linear-gradient(145deg, #0f1722, #111b27);
    color: #fffaf2;
  }

  .live-command__timeline {
    min-width: 0;
    --live-label: 200px;
    --live-state: 96px;
  }

  .live-command__tools {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .live-expand {
    width: 34px;
    height: 34px;
    display: grid;
    place-items: center;
    border: 1px solid rgba(255, 255, 255, 0.16);
    border-radius: var(--rst-ui-radius-md);
    color: #fffaf2;
    background: rgba(255, 255, 255, 0.06);
    font-size: 15px;
    line-height: 1;
    cursor: pointer;
    transition: transform .16s var(--rst-ease-out), background-color .16s ease, border-color .16s ease;
  }

  .live-expand:hover {
    transform: translateY(-1px);
    border-color: rgba(255, 255, 255, 0.32);
    background: rgba(255, 255, 255, 0.12);
  }

  .live-fullscreen {
    position: fixed;
    inset: 0;
    z-index: var(--rst-z-overlay);
    display: grid;
    place-items: center;
    padding: clamp(16px, 3vw, 40px);
  }

  .live-fullscreen__scrim {
    position: absolute;
    inset: 0;
    border: 0;
    background: rgba(4, 8, 14, 0.72);
    backdrop-filter: blur(4px);
    cursor: pointer;
    animation: rst-fade-up .2s var(--rst-ease-out) backwards;
  }

  .live-fullscreen__panel {
    position: relative;
    z-index: 1;
    width: min(1280px, 100%);
    max-height: 100%;
    overflow: auto;
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: var(--rst-ui-radius-2xl);
    background:
      linear-gradient(180deg, rgba(255, 255, 255, 0.025), transparent 22%),
      linear-gradient(145deg, #0f1722, #111b27);
    box-shadow: 0 40px 120px rgba(0, 0, 0, 0.55);
    color: #fffaf2;
    animation: rst-scale-in .32s var(--rst-ease-spring) backwards;
  }

  .live-fullscreen__panel > header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 18px 22px;
    border-bottom: 1px solid var(--rst-ui-divider-soft);
  }

  /* Roomier rows + label column in the fullscreen view so bars read clearly. */
  .live-fullscreen__panel {
    --live-label: 240px;
    --live-state: 110px;
  }

  .live-fullscreen__panel .live-row {
    min-height: 88px;
  }

  .live-fullscreen__panel .live-row__bar {
    min-height: 52px;
  }

  /* The axis and every row share ONE grid so ticks land exactly over bars:
     fixed label + state columns, identical middle column. */
  .time-axis {
    display: grid;
    grid-template-columns: var(--live-label, 200px) minmax(0, 1fr) var(--live-state, 96px);
    gap: 14px;
    padding-inline: 16px;
    height: 38px;
    color: rgba(255, 250, 242, 0.46);
    font-size: 11px;
    font-weight: var(--rst-fw-display);
    letter-spacing: 0.06em;
  }

  .axis-track {
    position: relative;
    height: 100%;
    border-left: 1px solid rgba(255, 255, 255, 0.08);
    border-bottom: 1px solid rgba(255, 255, 255, 0.09);
  }

  .axis-tick {
    position: absolute;
    left: var(--tick-left);
    bottom: 8px;
    transform: translateX(-50%);
  }

  .now-pill {
    position: absolute;
    z-index: 2;
    top: -10px;
    left: var(--now-left);
    transform: translateX(-50%);
    padding: 3px 8px;
    border-radius: var(--rst-ui-radius-pill);
    color: #101827;
    background: #a3ff3f;
    font-size: 10px;
    box-shadow: 0 0 22px rgba(163, 255, 63, 0.45);
    animation: rst-now-pulse 2s ease-in-out infinite;
  }

  @keyframes rst-now-pulse {
    0%, 100% { box-shadow: 0 0 22px rgba(163, 255, 63, 0.45); }
    50% { box-shadow: 0 0 30px rgba(163, 255, 63, 0.85); }
  }

  .live-rows {
    position: relative;
    display: grid;
  }

  .live-row {
    position: relative;
    width: 100%;
    min-width: 0;
    display: grid;
    grid-template-columns: var(--live-label, 200px) minmax(0, 1fr) var(--live-state, 96px);
    gap: 14px;
    align-items: center;
    min-height: 74px;
    padding: 12px 16px;
    border: 0;
    border-bottom: 1px solid rgba(255, 255, 255, 0.08);
    color: #fffaf2;
    background: transparent;
    font: inherit;
    text-align: left;
    text-decoration: none;
    cursor: pointer;
  }

  .live-row:hover {
    background: rgba(255, 255, 255, 0.04);
  }

  .live-row.is-open {
    background: rgba(255, 255, 255, 0.055);
  }

  .live-row__detail {
    grid-column: 1 / -1;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 14px;
    margin-top: 4px;
    padding: 10px 12px;
    border: 1px solid rgba(255, 255, 255, 0.12);
    border-radius: var(--rst-ui-radius-md);
    background: rgba(0, 0, 0, 0.28);
    animation: rst-fade-up .28s var(--rst-ease-out) backwards;
  }

  .live-row__detail > span {
    color: rgba(255, 250, 242, 0.82);
    font-size: 12px;
    font-weight: var(--rst-fw-regular);
  }

  .live-row__detail > a {
    flex: 0 0 auto;
    color: var(--rst-ui-action);
    font-size: 12px;
    font-weight: var(--rst-fw-bold);
    text-decoration: none;
    white-space: nowrap;
  }

  .live-row__detail > a:hover {
    text-decoration: underline;
  }

  .live-row__stat {
    grid-column: 1 / -1;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    margin-top: 2px;
    color: rgba(255, 250, 242, 0.7);
    font-size: 11.5px;
    font-weight: var(--rst-fw-regular);
    letter-spacing: 0.01em;
  }

  .live-row__stat :global(.live-duration) {
    flex: 0 0 auto;
    color: rgba(163, 255, 63, 0.92);
    font-size: 11.5px;
    font-weight: var(--rst-fw-bold);
  }

  .avatar {
    width: 34px;
    height: 34px;
    display: grid;
    place-items: center;
    border-radius: var(--rst-ui-radius-pill);
    color: #fff;
    /* Fill = the person's position colour; ring = live state. */
    background: var(--avatar-color, #203659);
    box-shadow: 0 0 0 2px var(--avatar-ring, transparent);
    font-size: 11px;
    font-weight: var(--rst-fw-display);
  }

  .live-row__person {
    min-width: 0;
    display: grid;
    grid-template-columns: 38px minmax(0, 1fr);
    gap: 11px;
    align-items: center;
  }

  .live-row__person span:last-child,
  .live-row__person strong,
  .live-row__person small {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .live-row__person small,
  .live-row em {
    color: rgba(255, 250, 242, 0.58);
    font-size: 11px;
    font-style: normal;
  }

  .live-row__bar {
    position: relative;
    min-height: 42px;
    border-radius: var(--rst-ui-radius-lg);
    background:
      repeating-linear-gradient(90deg, rgba(255,255,255,0.06) 0 1px, transparent 1px 20%),
      rgba(255, 255, 255, 0.035);
  }

  .live-row__bar::after {
    content: '';
    position: absolute;
    inset-block: -12px;
    left: var(--now-left);
    width: 2px;
    border-radius: var(--rst-ui-radius-pill);
    background: #a3ff3f;
    box-shadow: 0 0 20px rgba(163, 255, 63, 0.55);
  }

  .live-row__segment {
    position: absolute;
    top: 5px;
    left: var(--slot-left);
    width: var(--slot-width);
    min-width: 96px;
    min-height: 32px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    padding: 0 10px;
    overflow: hidden;
    border: 1px solid rgba(96, 165, 250, 0.55);
    border-radius: var(--rst-ui-radius-md);
    color: #bfdbfe;
    background: rgba(37, 99, 235, 0.14);
    font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    font-size: 12px;
    font-weight: var(--rst-fw-display);
    transform-origin: left center;
    animation: rst-bar-grow .5s var(--rst-ease-out) .3s backwards;
  }

  @keyframes rst-bar-grow {
    from { transform: scaleX(0); }
    to { transform: scaleX(1); }
  }

  .live-row__segment::before {
    content: '';
    position: absolute;
    inset: 0 auto 0 0;
    width: var(--slot-progress);
    background: linear-gradient(90deg, rgba(163, 255, 63, 0.9), rgba(163, 255, 63, 0.42));
    box-shadow: 0 0 24px rgba(163, 255, 63, 0.45);
  }

  .live-row__bar b,
  .live-row__bar small {
    position: relative;
    z-index: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .live-row__bar small {
    font-size: 10px;
    text-transform: uppercase;
  }

  .live-row.is-danger .avatar {
    --avatar-ring: #ff6b4a;
  }

  .live-row.is-success .avatar {
    --avatar-ring: #42d884;
  }

  .live-row.is-danger .live-row__segment {
    color: #fecaca;
    border-color: rgba(248, 113, 113, 0.9);
    border-style: dashed;
    background: rgba(127, 29, 29, 0.28);
    box-shadow: inset 6px 0 0 #f87171;
  }

  .live-row.is-danger .live-row__segment::before {
    background: linear-gradient(90deg, rgba(248, 113, 113, 0.95), rgba(248, 113, 113, 0.26));
    box-shadow: 0 0 22px rgba(248, 113, 113, 0.42);
  }

  .live-row.is-danger em {
    color: #fecaca;
  }

  .live-row.is-warning .live-row__segment {
    color: #fde68a;
    border-color: rgba(247, 183, 51, 0.7);
    background: rgba(120, 53, 15, 0.28);
  }

  .live-row.is-neutral .live-row__segment {
    color: #93c5fd;
    border-style: dashed;
  }

  .live-row em {
    justify-self: end;
    padding: 5px 8px;
    border: 1px solid rgba(255, 255, 255, 0.12);
    border-radius: var(--rst-ui-radius-pill);
    background: rgba(255, 255, 255, 0.05);
    font-weight: var(--rst-fw-display);
  }

  .live-empty {
    display: grid;
    gap: 4px;
    padding: 28px 18px;
    color: rgba(255, 250, 242, 0.62);
  }

  .live-empty strong {
    color: #fffaf2;
  }

  .coverage-map {
    overflow: hidden;
    border: 1px solid rgba(var(--rst-ui-action-rgb), 0.18);
    background:
      radial-gradient(circle at 50% 35%, rgba(240, 100, 35, 0.18), transparent 22%),
      linear-gradient(135deg, rgba(12, 21, 29, 0.96), rgba(23, 36, 31, 0.94)),
      var(--rst-ui-surface-panel);
    box-shadow: 0 16px 48px rgba(48, 35, 18, 0.08);
  }

  .coverage-map header {
    border-color: rgba(255, 255, 255, 0.1);
  }

  .coverage-map h3 {
    color: #fffaf2;
    font-size: clamp(20px, 2vw, 28px);
  }

  .coverage-map header a {
    color: #fffaf2;
    border-color: rgba(255, 255, 255, 0.14);
    background: rgba(255, 255, 255, 0.08);
    text-decoration: none;
  }

  .coverage-rooms {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 1px;
    padding: 1px;
    background:
      linear-gradient(90deg, transparent 49.8%, rgba(255, 255, 255, 0.08) 50%, transparent 50.2%),
      linear-gradient(0deg, transparent 49.8%, rgba(255, 255, 255, 0.08) 50%, transparent 50.2%);
  }

  .coverage-room {
    position: relative;
    width: 100%;
    min-width: 0;
    min-height: 112px;
    display: grid;
    align-content: center;
    gap: 9px;
    padding: 16px 18px;
    color: #fffaf2;
    background: rgba(255, 255, 255, 0.04);
    text-decoration: none;
    transition: background-color 0.18s ease;
  }

  a.coverage-room:hover {
    background: rgba(255, 255, 255, 0.07);
  }

  .coverage-room__head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
  }

  .coverage-room strong {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 13px;
    font-weight: var(--rst-fw-display);
    letter-spacing: 0.04em;
    text-transform: uppercase;
  }

  .coverage-room__flag {
    flex: 0 0 auto;
    padding: 2px 9px;
    border-radius: 999px;
    font-size: 10px;
    font-weight: var(--rst-fw-display);
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }

  .coverage-room__flag.is-under {
    color: #ffd7c6;
    background: rgba(240, 100, 35, 0.24);
  }

  .coverage-room__flag.is-ok {
    color: #c9f6de;
    background: rgba(64, 200, 120, 0.22);
  }

  /* Each service is a coverage strip: filled slots carry the person's badge,
     empty dashed slots are the shortfall, and the left rule signals the state. */
  .room-service {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 4px 0 4px 10px;
    border-left: 3px solid rgba(255, 255, 255, 0.14);
  }

  .room-service.is-under { border-left-color: var(--rst-ui-action); }
  .room-service.is-covered { border-left-color: var(--rst-green); }
  .room-service.is-over { border-left-color: var(--rst-state-info); }

  .room-service__lead {
    flex: 0 0 auto;
    display: inline-flex;
    align-items: center;
    gap: 6px;
    width: 50px;
    color: rgba(255, 250, 242, 0.86);
    font-size: 12px;
    font-weight: var(--rst-fw-display);
    white-space: nowrap;
  }

  .room-service__icon {
    font-size: 14px;
    line-height: 1;
  }

  .room-service__slots {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 5px;
    min-width: 0;
  }

  .room-slot {
    width: 26px;
    height: 26px;
    display: grid;
    place-items: center;
    border-radius: var(--rst-ui-radius-round);
    font-size: 9px;
    font-weight: var(--rst-fw-display);
  }

  .room-slot.is-filled {
    color: #fffaf2;
    background: var(--avatar-color, #35507a);
    box-shadow: 0 2px 6px rgba(4, 11, 20, 0.28);
    animation: rst-pop-in 0.35s var(--rst-ease-spring) backwards;
  }

  .room-slot.is-empty {
    border: 1.5px dashed rgba(255, 255, 255, 0.3);
  }

  .room-slot__more {
    color: rgba(255, 250, 242, 0.7);
    font-size: 11px;
    font-weight: var(--rst-fw-display);
  }

  .room-service__empty {
    color: rgba(255, 250, 242, 0.4);
    font-size: 11px;
    font-style: normal;
  }

  .setup { width: min(100%, 760px); margin: 0 0 0 auto; }

  .state {
    min-height: 55vh;
    display: grid;
    place-content: center;
    justify-items: center;
    gap: 8px;
    color: var(--rst-ui-muted);
    text-align: center;
  }

  .state p {
    max-width: 520px;
    margin: 0;
  }

  .state.is-error strong,
  .inline-error {
    color: var(--rst-state-danger-text);
  }
  .inline-error {
    margin: -10px 0 12px;
    padding: 10px 12px;
    border: 1px solid var(--rst-state-danger-border);
    border-radius: var(--rst-ui-radius-md);
    background: var(--rst-state-danger-bg);
    font-size: 12px;
  }



  @media (max-width: 1180px) {
    .command-grid {
      grid-template-columns: 1fr;
    }

    .home-hero__command {
      justify-self: stretch;
      width: 100%;
      justify-content: start;
    }
  }

  @media (max-width: 760px) {
    .home-hero__command {
      align-items: start;
      flex-direction: column;
    }

    .home-hero__command dl,
    .coverage-rooms {
      grid-template-columns: 1fr;
    }

    .weather-brief {
      grid-template-columns: 1fr;
      gap: 14px;
      padding: 16px;
    }

    .weather-brief footer {
      grid-column: 1;
    }

    .time-axis {
      display: none;
    }

    .live-row {
      grid-template-columns: 38px minmax(0, 1fr);
    }

    .live-row__bar,
    .live-row em {
      grid-column: 2;
    }

    .decision-row__toggle {
      grid-template-columns: 34px minmax(0, 1fr) auto;
    }
  }
</style>
