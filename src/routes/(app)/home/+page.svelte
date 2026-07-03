<script lang="ts">
  import { saveAbsence } from '$lib/api/mutations';
  import { auth } from '$lib/auth/session.svelte';
  import { addDays, mondayFor, todayInTimezone } from '$lib/calendar/date';
  import ActionButton from '$lib/components/ActionButton.svelte';
  import Dialog from '$lib/components/Dialog.svelte';
  import PageScaffold from '$lib/components/PageScaffold.svelte';
  import SetupGuide, { type SetupStep } from '$lib/components/SetupGuide.svelte';
  import { buildHomeModel, type HomeActionRow, type HomeLiveRow, type Tone } from '$lib/home/home-model';
  import { countUp } from '$lib/motion/countUp';
  import { workspaceRealtime } from '$lib/realtime/workspace-realtime.svelte';
  import { toasts } from '$lib/ui/toast.svelte';
  import { workspace } from '$lib/workspace/workspace.svelte';

  const MIN_TIMELINE_SPAN = 8 * 60;

  const membership = $derived(workspace.active);
  const snapshot = $derived(workspace.operations);
  const timezone = $derived(
    snapshot?.restaurant_settings.timezone ||
      workspace.bootstrap?.restaurant_settings.timezone ||
      'Europe/Brussels'
  );
  const today = $derived(todayInTimezone(timezone));
  const activeWeek = $derived(mondayFor(today));
  $effect(() => {
    if (workspace.activeId && membership && membership.role !== 'employee') {
      void workspace.loadOperations(activeWeek, addDays(activeWeek, 6), true).catch(() => undefined);
    }
  });
  const model = $derived(
    snapshot && membership
      ? buildHomeModel(snapshot, membership.role)
      : null
  );
  const firstName = $derived(
    String(
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
            detail: 'Employees available for planning',
            complete: snapshot.employees.some((item) => item.active),
            href: '/team'
          },
          {
            label: 'Coverage rules',
            detail: 'Minimum staffing requirements',
            complete: snapshot.coverage_requirements.some((item) => item.active),
            href: '/coverage'
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
  let expandedLiveKey = $state('');
  const allLiveRows = $derived(model?.live.rows.slice(0, 7) ?? []);
  const liveRows = $derived(
    liveFilter ? allLiveRows.filter((row) => row.tone === liveFilter) : allLiveRows
  );
  const serviceDateLabel = $derived(
    new Intl.DateTimeFormat('en-GB', {
      weekday: 'short',
      day: '2-digit',
      month: 'short',
      timeZone: timezone
    }).format(new Date(`${today}T12:00:00`))
  );
  const nowMinutes = $derived(localMinutesForTimezone(timezone));
  const timelineWindow = $derived(buildTimelineWindow(liveRows, nowMinutes));
  const timelineTicks = $derived(buildTimelineTicks(timelineWindow));
  const nowMarkerLeft = $derived(`${timelinePercent(nowMinutes, timelineWindow)}%`);
  const todayWeekday = $derived(
    Math.round(
      (Date.parse(`${today}T00:00:00Z`) - Date.parse(`${mondayFor(today)}T00:00:00Z`)) /
        86_400_000
    ) + 1
  );
  const coverageRooms = $derived(
    snapshot
      ? snapshot.work_areas
          .filter((area) => area.active)
          .sort((left, right) => left.sort_order - right.sort_order || left.name.localeCompare(right.name))
          .slice(0, 4)
          .map((area) => {
            const requiredCount = snapshot.coverage_requirements
              .filter(
                (requirement) =>
                  requirement.active &&
                  requirement.area_id === area.id &&
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
                shift.area_id === area.id
            ).length;
            const ratio = requiredCount ? plannedCount / requiredCount : plannedCount ? 1 : 0;
            const names = snapshot.planned_shifts
              .filter(
                (shift) =>
                  shift.week_start === activeWeek &&
                  shift.weekday === todayWeekday &&
                  shift.area_id === area.id
              )
              .map((shift) => snapshot.employees.find((employee) => employee.id === shift.employee_id)?.display_name)
              .filter((name): name is string => Boolean(name));
            return {
              id: area.id,
              label: area.name,
              count: requiredCount ? `${plannedCount} / ${requiredCount}` : `${plannedCount} planned`,
              tone: requiredCount && plannedCount < requiredCount ? 'danger' : plannedCount ? 'success' : 'warning',
              dots: requiredCount ? Math.max(1, Math.min(6, Math.round(ratio * 6))) : plannedCount ? 6 : 2,
              names
            };
          })
      : []
  );
  let actionDialog = $state<HomeActionRow['key'] | null>(null);
  let expandedDecisionKey = $state('');
  let resolvingAbsenceId = $state('');

  const decisionDestinations: Record<string, string> = {
    '/planning': 'Open Schedule',
    '/actuals': 'Open Timesheet',
    '/team': 'Open Team',
    '/restaurant': 'Open Restaurant',
    '/coverage': 'Open Coverage'
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

  function localMinutesForTimezone(timeZone: string) {
    const parts = new Intl.DateTimeFormat('en-GB', {
      timeZone,
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23'
    }).formatToParts(new Date());
    const lookup = Object.fromEntries(parts.map((part) => [part.type, part.value]));
    return Number(lookup.hour ?? 0) * 60 + Number(lookup.minute ?? 0);
  }

  function liveRowTimes(row: HomeLiveRow) {
    const times = Array.from(row.range.matchAll(/(\d{1,2}):(\d{2})/g)).map((match) =>
      Number(match[1]) * 60 + Number(match[2])
    );
    let start = times[0] ?? row.startMinutes;
    let end = times[1] ?? start + 180;
    if (end <= start) end += 1440;
    return { start, end };
  }

  function buildTimelineWindow(rows: HomeLiveRow[], currentMinutes: number) {
    const ranges = rows.map(liveRowTimes);
    const starts = ranges.map((range) => range.start);
    const ends = ranges.map((range) => range.end);
    const start = Math.max(0, Math.floor((Math.min(currentMinutes, ...starts, 12 * 60) - 60) / 60) * 60);
    let end = Math.ceil((Math.max(currentMinutes, ...ends, 20 * 60) + 60) / 60) * 60;
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

  function liveStateLabel(row: HomeLiveRow) {
    const status = row.status.toLowerCase();
    if (row.tone === 'danger') return status.includes('no-show') ? 'No-show' : 'Late';
    if (row.tone === 'warning') return 'Unplanned';
    if (row.tone === 'success') return 'Working';
    return 'Upcoming';
  }

  function openAction(row: HomeActionRow) {
    if (row.key === 'leave') {
      actionDialog = 'leave';
      return;
    }
    // Never leave the page on a decision click — expand the details in place,
    // and offer an explicit link inside for when the manager wants to jump.
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
        actionDialog = null;
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
      <p>Loading your restaurant cockpit…</p>
    </div>
  {:else if workspace.error && !snapshot}
    <div class="state is-error" role="alert">
      <strong>We could not load the workspace.</strong>
      <p>{workspace.error}</p>
      <button type="button" onclick={() => workspace.load()}>Try again</button>
    </div>
  {:else if model && membership}
    {#snippet pageHeader()}
      <header class="home-hero" aria-labelledby="home-title">
        <div class="home-hero__copy">
          <span class="home-hero__eyebrow">{serviceDateLabel} · Service command</span>
          <h1 id="home-title">Good morning, {firstName}.</h1>
          <p>
            Start with the one thing that can block service, keep the floor moving,
            then close payroll with proof.
          </p>
        </div>
        <div class="home-hero__command" aria-label="Today command signal">
          <div class:has-pressure={decisionTotal > 0 || model.live.late > 0} class="signal-orb">
            <strong use:countUp={decisionTotal}>{decisionTotal}</strong>
            <span>{decisionTotal === 1 ? 'decision' : 'decisions'}</span>
          </div>
          <dl>
            <button type="button" class="stat-filter" class:is-active={liveFilter === 'success'} onclick={() => toggleLiveFilter('success')}>
              <dt>Working</dt>
              <dd use:countUp={model.live.working}>{model.live.working}</dd>
            </button>
            <button type="button" class="stat-filter" class:is-active={liveFilter === 'danger'} onclick={() => toggleLiveFilter('danger')}>
              <dt>Late</dt>
              <dd use:countUp={model.live.late}>{model.live.late}</dd>
            </button>
            <button type="button" class="stat-filter" class:is-active={liveFilter === 'neutral'} onclick={() => toggleLiveFilter('neutral')}>
              <dt>Upcoming</dt>
              <dd use:countUp={model.live.upcoming}>{model.live.upcoming}</dd>
            </button>
          </dl>
        </div>
      </header>
      {#if workspace.error}
        <p class="inline-error" role="alert">{workspace.error}</p>
      {/if}
    {/snippet}

    <PageScaffold header={pageHeader} label="Home command center">
      <div class="command-center">
        <div class="command-grid">
          <aside class="decision-stack" aria-label="Decision wall">
            <section class="decision-wall" aria-label="Open decisions">
              <header>
                <span class="section-kicker">Decision wall</span>
                <strong>{decisionTotal} open</strong>
              </header>
              <div>
                {#each decisionRows as action, index}
                  {@const isOpen = expandedDecisionKey === action.key}
                  <button
                    class={`decision-row is-${action.tone} rst-stagger-in`}
                    class:is-open={isOpen}
                    style={`--rst-i:${index}`}
                    type="button"
                    aria-expanded={action.key === 'leave' ? undefined : isOpen}
                    onclick={() => openAction(action)}
                  >
                    <span aria-hidden="true">{action.symbol}</span>
                    <strong>{action.label}</strong>
                    <small>{action.meta}</small>
                    <b>{action.count}</b>
                    <i class="decision-row__go" aria-hidden="true">{action.key === 'leave' ? '→' : isOpen ? '−' : '+'}</i>
                    {#if action.items.length && !isOpen}
                      <div class="decision-flyout" role="tooltip">
                        {#each action.items as item (item.id)}
                          <span><b>{item.label}</b><small>{item.meta}</small></span>
                        {/each}
                      </div>
                    {/if}
                    {#if isOpen && action.key !== 'leave'}
                      <div class="decision-detail">
                        {#if action.items.length}
                          <ul>
                            {#each action.items as item (item.id)}
                              <li><b>{item.label}</b><span>{item.meta}</span></li>
                            {/each}
                          </ul>
                        {:else}
                          <p>No specific items to review right now.</p>
                        {/if}
                        <a href={action.href} onclick={(event) => event.stopPropagation()}>{decisionLinkLabel(action.href)} →</a>
                      </div>
                    {/if}
                  </button>
                {/each}
              </div>
            </section>

            {#if payrollAction}
              <article class="payroll-setup">
                <span class="section-kicker">Payroll setup</span>
                <h2>{payrollAction.count ? 'Missing payroll info' : 'Payroll setup complete'}</h2>
                <p>{payrollAction.meta}</p>
                <div class="payroll-setup__count">
                  <strong use:countUp={payrollAction.count}>{payrollAction.count}</strong>
                  <span>{payrollAction.count ? payrollAction.count === 1 ? 'employee needs setup' : 'employees need setup' : 'team records complete'}</span>
                </div>
                <a class="primary-link" href={payrollAction.href}>Open Team</a>
              </article>
            {/if}
          </aside>

          <section class="operations-stack" aria-label="Live monitor and coverage">
            <div class="live-command">
              <div class="live-command__timeline">
                <header>
                  <div>
                    <span class="section-kicker">Live monitor</span>
                    <h2>{model.live.late ? 'Service pressure' : 'Floor movement'}</h2>
                  </div>
                  <strong class="live-summary">
                    {model.live.working} working &middot; {model.live.late} late &middot; {model.live.upcoming} upcoming
                  </strong>
                </header>
                <div class="time-axis" style={`--now-left:${nowMarkerLeft}`} aria-hidden="true">
                  <span class="now-pill">Now</span>
                  {#each timelineTicks as tick}
                    <span style={`--tick-left:${timelinePercent(tick, timelineWindow)}%`}>{formatTimelineTick(tick)}</span>
                  {/each}
                </div>
            <div class="live-rows" style={`--now-left:${nowMarkerLeft}`}>
              {#each liveRows as row, index}
                {@const key = liveRowKey(row)}
                <button
                  type="button"
                  class={`live-row is-${row.tone} rst-stagger-in`}
                  class:is-open={expandedLiveKey === key}
                  style={`${liveRowTimelineStyle(row)} --rst-i:${index}`}
                  onclick={() => toggleLiveExpand(key)}
                >
                  <span class="live-row__person">
                    <span class="avatar">{row.name.slice(0, 2).toUpperCase()}</span>
                    <span>
                      <strong>{row.name}</strong>
                      <small>{row.role}</small>
                    </span>
                  </span>
                  <span class="live-row__bar">
                    <span>
                      <b>{row.range}</b>
                      <small>{row.status}</small>
                    </span>
                  </span>
                  <em>{liveStateLabel(row)}</em>
                  {#if expandedLiveKey === key}
                    <span class="live-row__detail">
                      <span>{liveRowDetail(row)}</span>
                      <a href="/actuals">Open in Timesheet →</a>
                    </span>
                  {/if}
                </button>
              {:else}
                <div class="live-empty">
                  <strong>{liveFilter ? 'Nothing in this filter right now.' : 'No live service pressure.'}</strong>
                  <span>{liveFilter ? 'Clear the filter above to see everyone.' : 'Today is quiet, or no shift is close enough to monitor.'}</span>
                </div>
              {/each}
            </div>
              </div>
            </div>

            <div class="coverage-map" aria-label="Coverage by work area">
              <header>
                <div>
                  <span class="section-kicker">Coverage floor</span>
                  <h3>Rooms to watch today</h3>
                </div>
                <a href="/planning">Open Planning</a>
              </header>
              <div class="coverage-rooms">
                {#each coverageRooms as room, roomIndex}
                  <button type="button" class={`coverage-room is-${room.tone} rst-stagger-in`} style={`--rst-i:${roomIndex}`}>
                    <strong>{room.label}</strong>
                    <span>{room.count}</span>
                    <div aria-hidden="true">
                      {#each Array(6) as _, index}
                        <i class:is-on={index < room.dots} style={`animation-delay:${roomIndex * 55 + index * 40}ms`}></i>
                      {/each}
                    </div>
                    <div class="room-flyout" role="tooltip">
                      {#if room.names.length}
                        <span>On the floor today</span>
                        {#each room.names as name}
                          <b>{name}</b>
                        {/each}
                      {:else}
                        <span>Nobody scheduled here today yet.</span>
                      {/if}
                    </div>
                  </button>
                {:else}
                  <article class="coverage-room is-warning">
                    <strong>Coverage setup</strong>
                    <span>No active work areas yet</span>
                    <div aria-hidden="true">
                      {#each Array(6) as _, index}
                        <i class:is-on={index < 2}></i>
                      {/each}
                    </div>
                  </article>
                {/each}
              </div>
            </div>
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

{#snippet leaveFooter()}
  <ActionButton label="Close" onclick={() => (actionDialog = null)} />
  <a class="dialog-link" href="/team">Open Team</a>
{/snippet}

<Dialog
  open={actionDialog === 'leave'}
  title="Pending leave requests"
  description="Approve or reject requests here. Every decision uses the audited absence lifecycle."
  onclose={() => !resolvingAbsenceId && (actionDialog = null)}
  footer={leaveFooter}
>
  <div class="leave-requests">
    {#each pendingAbsences as absence (absence.id)}
      <article>
        <div>
          <strong>{snapshot?.employees.find((employee) => employee.id === absence.employee_id)?.display_name ?? 'Employee'}</strong>
          <span>{snapshot?.absence_types.find((type) => type.id === absence.absence_type_id)?.name ?? 'Leave'} · {absence.start_date} → {absence.end_date}{absence.service_key ? ` · ${absence.service_key}` : ''}</span>
        </div>
        <ActionButton label="Approve" disabled={Boolean(resolvingAbsenceId)} onclick={() => resolveAbsence(absence.id, absence.employee_id, 'approve')} />
        <ActionButton label="Reject" tone="danger" disabled={Boolean(resolvingAbsenceId)} onclick={() => resolveAbsence(absence.id, absence.employee_id, 'reject')} />
      </article>
    {:else}
      <p>No leave requests are waiting.</p>
    {/each}
  </div>
</Dialog>

<style>
  .home {
    width: 100%;
    margin: 0;
  }

  .home :global(.page-scaffold) {
    gap: 0;
  }

  .home-hero {
    position: relative;
    overflow: hidden;
    min-height: 220px;
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(260px, 390px);
    gap: 22px;
    align-items: stretch;
    padding: clamp(22px, 4vw, 38px);
    border: 0;
    border-bottom: 1px solid rgba(var(--rst-ui-action-rgb), 0.26);
    border-radius: 0;
    color: #fffaf2;
    background:
      linear-gradient(95deg, rgba(11, 18, 26, 0.98) 0%, rgba(11, 18, 26, 0.88) 47%, rgba(240, 100, 35, 0.26) 100%),
      url('/module-backgrounds/home.webp') center / cover;
    box-shadow: none;
  }

  .home-hero__copy {
    animation: rst-fade-up .5s var(--rst-ease-out) backwards;
  }

  .home-hero__command {
    animation: rst-fade-up .5s var(--rst-ease-out) .08s backwards;
  }

  .home-hero::after {
    content: '';
    position: absolute;
    inset: auto 0 0;
    height: 5px;
    background: linear-gradient(90deg, var(--rst-ui-action), var(--rst-gold), var(--rst-green), var(--rst-state-info));
    opacity: 0.92;
  }

  .home-hero__copy,
  .home-hero__command {
    position: relative;
    z-index: 1;
  }

  .home-hero__copy {
    max-width: 760px;
    align-self: center;
    display: grid;
    gap: 12px;
  }

  .home-hero__eyebrow,
  .section-kicker {
    color: var(--rst-ui-action);
    font-size: 11px;
    font-weight: var(--rst-fw-display);
    letter-spacing: 0.1em;
    text-transform: uppercase;
  }

  .home-hero h1 {
    margin: 0;
    font-size: clamp(42px, 6vw, 76px);
    line-height: 0.9;
    letter-spacing: -0.07em;
  }

  .home-hero p {
    max-width: 650px;
    margin: 0;
    color: rgba(255, 250, 242, 0.82);
    font-size: clamp(15px, 1.45vw, 19px);
    line-height: 1.45;
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
  .live-command { animation-delay: .1s; }
  .coverage-map { animation-delay: .16s; }
  .payroll-setup { animation-delay: .2s; }

  .payroll-setup:hover,
  .decision-wall:hover,
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

  .decision-wall {
    position: relative;
    overflow: visible;
    color: #fffaf2;
    background:
      radial-gradient(circle at 85% 10%, rgba(240, 100, 35, 0.45), transparent 36%),
      linear-gradient(145deg, #211913, #4b2b1e);
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
  .live-command header > strong,
  .coverage-map header a {
    padding: 6px 9px;
    border: 1px solid var(--rst-ui-line);
    border-radius: var(--rst-ui-radius-pill);
    color: var(--rst-ui-text);
    background: var(--rst-ui-surface-field-strong);
    font-size: 11px;
  }

  .live-command header > .live-summary {
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
    display: grid;
    grid-template-columns: 34px minmax(0, 1fr) auto 16px;
    gap: 0 10px;
    align-items: center;
    padding: 12px 14px;
    border: 0;
    border-bottom: 1px solid rgba(255, 255, 255, 0.1);
    color: #fffaf2;
    background: transparent;
    font: inherit;
    text-align: left;
    text-decoration: none;
    cursor: pointer;
    transition: background-color .16s ease, transform .16s var(--rst-ease-out);
  }

  .decision-row:hover {
    background: rgba(255, 255, 255, 0.06);
    transform: translateX(3px);
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

  .decision-flyout {
    position: absolute;
    z-index: 20;
    top: calc(100% + 6px);
    left: 14px;
    right: 14px;
    display: grid;
    gap: 6px;
    padding: 10px;
    border: 1px solid rgba(255, 255, 255, 0.14);
    border-radius: var(--rst-ui-radius-lg);
    background: #1a120c;
    box-shadow: 0 18px 40px rgba(0, 0, 0, 0.55);
    opacity: 0;
    pointer-events: none;
    transform: translateY(-4px);
    transition: opacity .16s ease, transform .16s var(--rst-ease-out);
  }

  .decision-row:hover .decision-flyout,
  .decision-row:focus-visible .decision-flyout {
    opacity: 1;
    transform: translateY(0);
    pointer-events: auto;
  }

  .decision-flyout > span {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    padding: 7px 9px;
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: var(--rst-ui-radius-md);
    background: rgba(255, 255, 255, 0.06);
  }

  .decision-row .decision-flyout b {
    color: #fffaf2;
    font-size: 12px;
    font-weight: var(--rst-fw-bold);
  }

  .decision-row .decision-flyout small {
    color: rgba(255, 250, 242, 0.58);
    font-size: 10px;
    text-align: right;
  }

  .decision-row > span {
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

  .decision-row strong,
  .decision-row small {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .decision-row strong {
    white-space: normal;
    line-height: 1.15;
  }

  .decision-row small {
    white-space: nowrap;
  }

  .decision-row small {
    color: rgba(255, 250, 242, 0.6);
    font-size: 11px;
  }

  .decision-row b {
    grid-row: span 2;
    color: var(--rst-ui-action);
    font-size: 20px;
  }

  .decision-row.is-open {
    background: rgba(255, 255, 255, 0.05);
    transform: none;
  }

  .decision-detail {
    grid-column: 1 / -1;
    display: grid;
    gap: 10px;
    margin-top: 6px;
    padding: 10px 12px;
    border: 1px solid rgba(255, 255, 255, 0.12);
    border-radius: var(--rst-ui-radius-md);
    background: rgba(0, 0, 0, 0.28);
    animation: rst-fade-up .28s var(--rst-ease-out) backwards;
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
  }

  .time-axis {
    position: relative;
    height: 38px;
    margin-left: min(30%, 220px);
    border-left: 1px solid rgba(255, 255, 255, 0.08);
    color: rgba(255, 250, 242, 0.46);
    font-size: 11px;
    font-weight: var(--rst-fw-display);
    letter-spacing: 0.06em;
    border-bottom: 1px solid rgba(255, 255, 255, 0.09);
  }

  .time-axis > span:not(.now-pill) {
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
    grid-template-columns: minmax(170px, 0.34fr) minmax(220px, 1fr) 92px;
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

  .avatar {
    width: 34px;
    height: 34px;
    display: grid;
    place-items: center;
    border-radius: var(--rst-ui-radius-pill);
    color: #fff;
    background: #203659;
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

  .live-row__bar > span {
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

  .live-row__bar > span::before {
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
    background: rgba(240, 100, 35, 0.28);
  }

  .live-row.is-danger .live-row__bar > span {
    color: #fecaca;
    border-color: rgba(248, 113, 113, 0.9);
    border-style: dashed;
    background: rgba(127, 29, 29, 0.28);
    box-shadow: inset 6px 0 0 #f87171;
  }

  .live-row.is-danger .live-row__bar > span::before {
    background: linear-gradient(90deg, rgba(248, 113, 113, 0.95), rgba(248, 113, 113, 0.26));
    box-shadow: 0 0 22px rgba(248, 113, 113, 0.42);
  }

  .live-row.is-danger em {
    color: #fecaca;
  }

  .live-row.is-warning .live-row__bar > span {
    color: #fde68a;
    border-color: rgba(247, 183, 51, 0.7);
    background: rgba(120, 53, 15, 0.28);
  }

  .live-row.is-neutral .live-row__bar > span {
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
    gap: 8px;
    padding: 18px;
    border: 0;
    color: #fffaf2;
    background: rgba(255, 255, 255, 0.04);
    font: inherit;
    text-align: left;
    cursor: default;
  }

  .coverage-room .room-flyout {
    position: absolute;
    inset: 0;
    z-index: 2;
    display: grid;
    align-content: center;
    gap: 4px;
    padding: 16px;
    overflow: auto;
    color: #fffaf2;
    background: rgba(8, 14, 22, 0.92);
    opacity: 0;
    pointer-events: none;
    transition: opacity .18s ease;
  }

  .coverage-room:hover .room-flyout,
  .coverage-room:focus-visible .room-flyout {
    opacity: 1;
    pointer-events: auto;
  }

  .coverage-room .room-flyout > span {
    min-width: 0;
    overflow: visible;
    color: var(--rst-ui-action);
    font-size: 10px;
    font-weight: var(--rst-fw-display);
    letter-spacing: 0.06em;
    text-transform: uppercase;
    white-space: normal;
  }

  .coverage-room .room-flyout > b {
    font-size: 13px;
    font-weight: var(--rst-fw-bold);
  }

  .coverage-room strong,
  .coverage-room span {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .coverage-room strong {
    font-size: 13px;
    font-weight: var(--rst-fw-display);
    letter-spacing: 0.04em;
    text-transform: uppercase;
  }

  .coverage-room span {
    color: rgba(255, 250, 242, 0.72);
    font-size: 12px;
    font-weight: var(--rst-fw-display);
  }

  .coverage-room div {
    display: flex;
    flex-wrap: wrap;
    gap: 7px;
  }

  .coverage-room i {
    width: 11px;
    height: 11px;
    border-radius: var(--rst-ui-radius-pill);
    background: rgba(255, 255, 255, 0.16);
    animation: rst-pop-in .35s var(--rst-ease-spring) backwards;
  }

  .coverage-room.is-success i.is-on {
    background: var(--rst-green);
    box-shadow: 0 0 16px rgba(64, 200, 120, 0.55);
  }

  .coverage-room.is-warning i.is-on {
    background: var(--rst-gold);
    box-shadow: 0 0 16px rgba(247, 183, 51, 0.5);
  }

  .coverage-room.is-danger i.is-on {
    background: var(--rst-ui-action);
    box-shadow: 0 0 16px rgba(240, 100, 35, 0.55);
    animation: rst-pop-in .35s var(--rst-ease-spring) backwards, rst-pulse-soft 2s ease-in-out 1.2s infinite;
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
  .leave-requests { display: grid; }
  .leave-requests article { display: flex; align-items: center; gap: 8px; padding: 12px 0; border-bottom: 1px solid var(--rst-ui-divider-soft); }
  .leave-requests article > div { min-width: 0; display: grid; gap: 4px; margin-right: auto; }
  .leave-requests span, .leave-requests p { color: var(--rst-ui-muted); font-size: 12px; }
  .dialog-link { align-self: center; padding: 8px 10px; color: var(--rst-ui-panel-title); font-size: 12px; font-weight: var(--rst-fw-bold); text-decoration: none; }

  .inline-error {
    margin: -10px 0 12px;
    padding: 10px 12px;
    border: 1px solid var(--rst-state-danger-border);
    border-radius: var(--rst-ui-radius-md);
    background: var(--rst-state-danger-bg);
    font-size: 12px;
  }



  @media (max-width: 1180px) {
    .home-hero,
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
    .home-hero {
      padding: 22px;
      border-radius: 22px;
    }

    .home-hero h1 {
      font-size: clamp(38px, 13vw, 56px);
    }

    .home-hero__command {
      align-items: start;
      flex-direction: column;
    }

    .home-hero__command dl,
    .coverage-rooms {
      grid-template-columns: 1fr;
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

    .decision-row {
      grid-template-columns: 34px minmax(0, 1fr) auto;
    }
  }

  @media (max-width: 520px) {
    .leave-requests article { align-items: stretch; flex-direction: column; }
  }
</style>
