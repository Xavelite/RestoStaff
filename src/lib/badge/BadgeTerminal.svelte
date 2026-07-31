<script lang="ts">
  import { onMount, type Snippet } from 'svelte';
  import type {
    BadgeRosterEmployee,
    BadgeResult,
    BadgeTerminalApi,
    BadgeVerification
  } from '$lib/badge/badge-api';
  import { friendlyError } from '$lib/api/error-messages';
  import { sound } from '$lib/sound/sound.svelte';
  import FeedbackBanner from '$lib/components/FeedbackBanner.svelte';
  import { i18n, t } from '$lib/i18n/i18n.svelte';
  import { personInitials } from '$lib/ui/person';

  // The badge clock, decoupled from how it authenticates: a manager session and
  // a paired station both hand in an api + restaurant identity.
  let {
    api,
    restaurantName,
    logoUrl = '',
    timezone,
    headerAction,
    onbadged
  }: {
    api: BadgeTerminalApi;
    restaurantName: string;
    logoUrl?: string;
    timezone: string;
    headerAction?: Snippet;
    onbadged?: (input: { employeeId: string; result: BadgeResult }) => void;
  } = $props();

  let roster = $state<BadgeRosterEmployee[]>([]);
  let selectedId = $state('');
  let pin = $state('');
  let loading = $state(false);
  let feedback = $state('');
  let feedbackTone = $state<'info' | 'success' | 'warning' | 'danger'>('info');
  let result = $state<BadgeResult | null>(null);
  let resultName = $state('');
  let verification = $state<BadgeVerification | null>(null);
  let proof = $state<File | null>(null);
  let now = $state(new Date());
  let resultTimer: number | undefined;

  const selected = $derived(roster.find((employee) => employee.employeeId === selectedId) ?? null);
  const nextAction = $derived(t(selected?.clockedIn ? 'Clock out' : 'Clock in'));

  function restaurantTime(date: Date) {
    return date.toLocaleTimeString(i18n.intlLocale, {
      timeZone: timezone || 'Europe/Brussels',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    });
  }

  function restaurantDate(date: Date) {
    return date.toLocaleDateString(i18n.intlLocale, {
      timeZone: timezone || 'Europe/Brussels',
      weekday: 'short',
      day: 'numeric',
      month: 'short'
    });
  }

  function badgeState(employee: BadgeRosterEmployee) {
    if (employee.clockedIn) {
      return employee.lastLocalTime
        ? t('In since {time}', { time: employee.lastLocalTime })
        : t('Clocked in');
    }
    if (employee.lastAction === 'out') {
      return employee.lastLocalTime
        ? t('Out at {time}', { time: employee.lastLocalTime })
        : t('Clocked out');
    }
    return t('No badge today');
  }

  onMount(() => {
    const clock = window.setInterval(() => (now = new Date()), 1000);
    const heartbeat = window.setInterval(() => {
      if (document.visibilityState === 'visible' && !loading) void loadRoster(true);
    }, 60_000);
    void loadRoster();
    return () => {
      window.clearInterval(clock);
      window.clearInterval(heartbeat);
      if (resultTimer) window.clearTimeout(resultTimer);
    };
  });

  async function loadRoster(silent = false) {
    if (!silent) {
      loading = true;
      feedback = '';
    }
    try {
      const employees = await api.listRoster();
      roster = employees;
      if (!employees.some((employee) => employee.employeeId === selectedId)) {
        selectedId = employees[0]?.employeeId ?? '';
        resetChallenge();
      }
      if (!employees.length) {
        feedback = t('No active employees are ready to badge.');
        feedbackTone = 'warning';
      }
    } catch (error) {
      feedback = friendlyError(error, 'badge');
      feedbackTone = 'danger';
    } finally {
      if (!silent) loading = false;
    }
  }

  function clearResultTimer() {
    if (!resultTimer) return;
    window.clearTimeout(resultTimer);
    resultTimer = undefined;
  }

  function resetChallenge() {
    clearResultTimer();
    pin = '';
    proof = null;
    verification = null;
    result = null;
    resultName = '';
  }

  function selectEmployee(employeeId: string) {
    if (loading || employeeId === selectedId) return;
    selectedId = employeeId;
    feedback = '';
    resetChallenge();
  }

  function digit(value: string) {
    if (!loading && !verification && !result && pin.length < 4) pin += value;
  }

  function handleKeydown(event: KeyboardEvent) {
    if (loading || verification || result) return;
    if (/^\d$/.test(event.key)) {
      event.preventDefault();
      digit(event.key);
    } else if (event.key === 'Backspace') {
      event.preventDefault();
      pin = pin.slice(0, -1);
    } else if (event.key === 'Escape' || event.key === 'Delete') {
      event.preventDefault();
      pin = '';
    } else if (event.key === 'Enter' && pin.length === 4) {
      event.preventDefault();
      void verify();
    }
  }

  async function verify() {
    if (!selected || !/^\d{4}$/.test(pin) || loading) return;
    loading = true;
    feedback = '';
    result = null;
    try {
      verification = await api.verifyPin(selected.employeeId, pin);
      pin = '';
    } catch (error) {
      resetChallenge();
      feedback = friendlyError(error, 'badge');
      feedbackTone = 'danger';
      sound.play('error');
    } finally {
      loading = false;
    }
  }

  async function completeBadge() {
    if (!selected || !verification || loading) return;
    const employeeId = selected.employeeId;
    const employeeName = selected.displayName;
    loading = true;
    feedback = '';
    try {
      const photoUrl =
        proof && api.uploadProof
          ? await api.uploadProof({ employeeId, token: verification.token, file: proof })
          : undefined;
      const recorded = await api.recordBadge({
        employeeId,
        token: verification.token,
        photoUrl,
        photoStatus: photoUrl ? 'captured' : 'not_required'
      });

      result = recorded;
      resultName = employeeName;
      verification = null;
      proof = null;
      roster = roster.map((employee) =>
        employee.employeeId === employeeId
          ? {
              ...employee,
              clockedIn: recorded.action === 'in',
              serviceKey: recorded.serviceKey,
              lastAction: recorded.action,
              lastLocalTime: recorded.localTime
            }
          : employee
      );
      resultTimer = window.setTimeout(resetChallenge, 7000);
      // A wall terminal is used at arm's length on a busy floor: the chime is
      // how someone knows the badge registered without stopping to read.
      sound.play('success');
      onbadged?.({ employeeId, result: recorded });
    } catch (error) {
      resetChallenge();
      feedback = friendlyError(error, 'badge');
      feedbackTone = 'danger';
      sound.play('error');
    } finally {
      loading = false;
    }
  }
</script>

<svelte:window onkeydown={handleKeydown} />

<section class="terminal" aria-labelledby="badge-title">
  <header class="terminal-head">
    {#if logoUrl}
      <img class="terminal-logo" src={logoUrl} alt="" />
    {/if}
    <div>
      <p>{restaurantName}</p>
      <h1 id="badge-title">{t('Badge')}</h1>
    </div>
    <div class="terminal-meta">
      <time datetime={now.toISOString()}>
        <strong>{restaurantTime(now)}</strong>
        <span>{restaurantDate(now)}</span>
      </time>
      {@render headerAction?.()}
    </div>
  </header>

  <FeedbackBanner message={feedback} tone={feedbackTone} />

  <div class="terminal-grid">
    <section class="roster" aria-labelledby="roster-title">
      <div class="section-head">
        <div>
          <span class="eyebrow">{t('Team')}</span>
          <strong id="roster-title">{t('Who are you?')}</strong>
        </div>
        <button type="button" class="refresh" aria-label={t('Refresh employee list')} title={t('Refresh')} disabled={loading} onclick={() => void loadRoster()}>
          &#8635;
        </button>
      </div>
      <div class="people">
        {#each roster as employee, index (employee.employeeId)}
          <button
            type="button"
            class:is-selected={employee.employeeId === selectedId}
            aria-pressed={employee.employeeId === selectedId}
            disabled={loading}
            style={`--person-index: ${index}`}
            onclick={() => selectEmployee(employee.employeeId)}
          >
            <span class="avatar">{personInitials(employee.displayName)}</span>
            <span class="person-copy">
              <strong>{employee.displayName}</strong>
              <small class:is-active={employee.clockedIn}>
                <i aria-hidden="true"></i>{badgeState(employee)}
              </small>
            </span>
            <span class="person-arrow" aria-hidden="true">&#8250;</span>
          </button>
        {/each}
      </div>
    </section>

    <section class="challenge" aria-labelledby="challenge-title">
      <div class="selected-person">
        <span class="selected-avatar">{selected ? personInitials(selected.displayName) : '?'}</span>
        <div>
          <span class="eyebrow">{t('Selected')}</span>
          <strong id="challenge-title">{selected?.displayName ?? t('Select an employee')}</strong>
        </div>
        {#if selected}
          <span class:clocked-in={selected.clockedIn} class="current-state">
            {t(selected.clockedIn ? 'In' : 'Out')}
          </span>
        {/if}
      </div>

      <div class="challenge-body" class:has-error={feedbackTone === 'danger' && Boolean(feedback)}>
        {#if result}
          <div class="success" aria-live="polite">
            <span class="success-mark" aria-hidden="true">&#10003;</span>
            <span class="eyebrow">{t(result.resumed ? 'Break recorded' : 'Recorded')}</span>
            <h2>{t('{name} clocked {action}', { name: resultName, action: t(result.action) })}</h2>
            <p>
              <strong>{result.localTime}</strong>
              <span>
                {t(result.serviceName)}{result.totalBreakMinutes > 0 ? t(' / {minutes} min break', { minutes: result.totalBreakMinutes }) : ''}
              </span>
            </p>
            <button type="button" class="secondary-action" onclick={resetChallenge}>{t('Done')}</button>
          </div>
        {:else if verification}
          <div class="proof-step">
            <span class="verified-mark" aria-hidden="true">&#10003;</span>
            <span class="eyebrow">{t('PIN verified')}</span>
            <h2>{nextAction}</h2>
            <p class="expires">
              {t('Ready until {time}', { time: restaurantTime(new Date(verification.expiresAt)) })}
            </p>
            {#if api.uploadProof}
              <label class="proof-upload" for="badge-proof">
                <strong>{t(proof ? 'Change photo' : 'Add photo')}</strong>
                <span>{proof ? `${proof.name} (${(proof.size / 1024 / 1024).toFixed(1)} MB)` : t('Optional proof')}</span>
              </label>
              <input
                id="badge-proof"
                class="proof-input"
                type="file"
                accept="image/jpeg,image/png,image/webp"
                capture="user"
                onchange={(event) => (proof = event.currentTarget.files?.[0] ?? null)}
              />
            {/if}
            <div class="proof-actions">
              <button type="button" class="secondary-action" disabled={loading} onclick={resetChallenge}>{t('Start over')}</button>
              <button type="button" class="primary-action" disabled={loading} onclick={completeBadge}>
                {loading ? t('Recording...') : nextAction}
              </button>
            </div>
          </div>
        {:else}
          <div class="pin-step">
            <span class="eyebrow">{t('4-digit PIN')}</span>
            <h2>{selected ? t('Ready to {action}', { action: t(selected.clockedIn ? 'clock out' : 'clock in') }) : t('Choose your name')}</h2>
            <div class="pin" aria-label={t('{count} PIN digits entered', { count: pin.length })}>
              {#each Array.from({ length: 4 }) as _, index}
                <i class:is-filled={index < pin.length}></i>
              {/each}
            </div>
            <div class="keypad">
              {#each ['1', '2', '3', '4', '5', '6', '7', '8', '9'] as value}
                <button type="button" aria-label={t('PIN digit {digit}', { digit: value })} disabled={!selected || loading} onclick={() => digit(value)}>{value}</button>
              {/each}
              <button type="button" class="keypad-tool" aria-label={t('Clear PIN')} disabled={!pin || loading} onclick={() => (pin = '')}>C</button>
              <button type="button" aria-label={t('PIN digit {digit}', { digit: 0 })} disabled={!selected || loading} onclick={() => digit('0')}>0</button>
              <button type="button" class="keypad-tool" aria-label={t('Delete last digit')} disabled={!pin || loading} onclick={() => (pin = pin.slice(0, -1))}>&larr;</button>
            </div>
            <button
              type="button"
              class="primary-action continue"
              disabled={!selected || pin.length !== 4 || loading}
              onclick={verify}
            >
              {loading ? t('Checking...') : t('Continue')}
            </button>
          </div>
        {/if}
      </div>
    </section>
  </div>
</section>

<style>
  .terminal {
    width: min(100%, 1120px);
    margin: 0 auto;
  }

  .terminal-logo {
    width: 52px;
    height: 52px;
    flex: 0 0 auto;
    object-fit: contain;
    border-radius: var(--rst-ui-radius-md);
  }
  .terminal-head {
    display: flex;
    gap: 16px;
    align-items: center;
    justify-content: space-between;
    gap: 20px;
    margin-bottom: 18px;
  }

  .terminal-head p,
  .terminal-head h1 {
    margin: 0;
  }

  .terminal-head p,
  .eyebrow {
    color: var(--rst-ui-panel-title);
    font-size: var(--rst-fs-caption);
    font-weight: var(--rst-fw-bold);
    text-transform: uppercase;
  }

  .terminal-head h1 {
    margin-top: 3px;
    font-size: var(--rst-fs-display);
  }

  .terminal-meta,
  .terminal-meta time {
    display: flex;
    align-items: center;
  }

  .terminal-meta {
    gap: 10px;
  }

  .terminal-meta time {
    gap: 9px;
    color: var(--rst-ui-muted);
  }

  .terminal-meta time strong {
    color: var(--rst-ui-text);
    font-size: var(--rst-fs-heading);
  }

  .terminal-meta time span {
    max-width: 70px;
    font-size: var(--rst-fs-label);
    line-height: 1.2;
  }

  .terminal-meta :global(a),
  .terminal-meta :global(button.terminal-head-action),
  .refresh {
    width: 40px;
    height: 40px;
    display: grid;
    place-items: center;
    border: 1px solid var(--rst-ui-line);
    border-radius: var(--rst-ui-radius-md);
    color: var(--rst-ui-text);
    background: var(--rst-ui-surface-field-strong);
    font: inherit;
    text-decoration: none;
    cursor: pointer;
  }

  .terminal-meta :global(a) {
    font-size: var(--rst-fs-heading-lg);
  }

  .terminal-grid {
    min-height: 590px;
    display: grid;
    grid-template-columns: minmax(280px, 340px) minmax(390px, 1fr);
    gap: 14px;
  }

  .roster,
  .challenge {
    overflow: hidden;
    border: 1px solid var(--rst-ui-line);
    border-radius: var(--rst-ui-radius-md);
    background: var(--rst-ui-surface-panel);
    box-shadow: 0 18px 45px rgba(38, 27, 18, 0.08);
  }

  .section-head,
  .selected-person {
    min-height: 68px;
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 12px 14px;
    border-bottom: 1px solid var(--rst-ui-divider-soft);
    background: var(--rst-ui-surface-panel-head);
  }

  .section-head {
    justify-content: space-between;
  }

  .section-head > div,
  .person-copy,
  .selected-person > div {
    min-width: 0;
    display: grid;
    gap: 3px;
  }

  .refresh {
    flex: 0 0 auto;
    border: 0;
    color: var(--rst-ui-panel-title);
    background: transparent;
    font-size: var(--rst-fs-heading);
  }

  .people {
    display: grid;
    gap: 6px;
    padding: 9px;
  }

  .people > button {
    width: 100%;
    min-height: 68px;
    display: grid;
    grid-template-columns: 42px minmax(0, 1fr) 18px;
    align-items: center;
    gap: 10px;
    padding: 9px 10px;
    border: 1px solid transparent;
    border-radius: var(--rst-ui-radius-md);
    color: var(--rst-ui-text);
    background: transparent;
    font: inherit;
    text-align: left;
    cursor: pointer;
    animation: rst-fade-up .35s var(--rst-ease-out) backwards;
    animation-delay: calc(var(--person-index) * 35ms);
  }

  .people > button:hover:not(:disabled) {
    border-color: var(--rst-ui-line);
    background: var(--rst-ui-hover-bg);
    transform: translateX(2px);
  }

  .people > button.is-selected {
    border-color: var(--rst-state-selected-border);
    background: var(--rst-state-selected-bg);
    box-shadow: inset 3px 0 0 var(--rst-ui-action);
  }

  .avatar,
  .selected-avatar {
    display: grid;
    place-items: center;
    border-radius: 50%;
    color: var(--rst-state-info-text);
    background: var(--rst-state-info-bg);
    font-weight: var(--rst-fw-display);
  }

  .avatar {
    width: 42px;
    height: 42px;
  }

  .person-copy strong {
    overflow: hidden;
    font-size: var(--rst-fs-control);
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .person-copy small {
    display: flex;
    align-items: center;
    gap: 5px;
    color: var(--rst-ui-muted);
    font-size: var(--rst-fs-caption);
  }

  .person-copy small i {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: var(--rst-ui-line-strong);
  }

  .person-copy small.is-active {
    color: var(--rst-state-success-text);
  }

  .person-copy small.is-active i {
    background: var(--rst-state-success);
    box-shadow: 0 0 0 3px rgba(var(--rst-state-success-rgb), .12);
  }

  .person-arrow {
    color: var(--rst-ui-muted);
    font-size: var(--rst-fs-heading);
  }

  .challenge {
    display: grid;
    grid-template-rows: auto 1fr;
  }

  .selected-avatar {
    width: 42px;
    height: 42px;
  }

  .selected-person > div {
    flex: 1;
  }

  .current-state {
    min-width: 38px;
    padding: 5px 8px;
    border: 1px solid var(--rst-ui-line);
    border-radius: var(--rst-ui-radius-md);
    color: var(--rst-ui-muted);
    background: var(--rst-ui-surface-field);
    font-size: var(--rst-fs-caption);
    font-weight: var(--rst-fw-bold);
    text-align: center;
  }

  .current-state.clocked-in {
    color: var(--rst-state-success-text);
    border-color: rgba(var(--rst-state-success-rgb), .28);
    background: var(--rst-state-success-bg);
  }

  .challenge-body {
    min-height: 500px;
    display: grid;
    place-items: center;
    padding: 26px 20px 30px;
  }

  .challenge-body.has-error .pin {
    animation: badge-shake .32s ease;
  }

  .pin-step,
  .proof-step,
  .success {
    width: min(100%, 420px);
    display: grid;
    justify-items: center;
    text-align: center;
    animation: rst-fade-up .35s var(--rst-ease-out) backwards;
  }

  .pin-step h2,
  .proof-step h2,
  .success h2 {
    margin: 5px 0 0;
    font-size: var(--rst-fs-title-lg);
  }

  .pin {
    min-height: 76px;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 13px;
  }

  .pin i {
    width: 13px;
    height: 13px;
    border: 2px solid var(--rst-ui-line-strong);
    border-radius: 50%;
    background: transparent;
  }

  .pin i.is-filled {
    border-color: var(--rst-ui-action);
    background: var(--rst-ui-action);
    animation: rst-pop-in .2s var(--rst-ease-spring);
  }

  .keypad {
    width: min(100%, 294px);
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 8px;
  }

  .keypad button {
    min-width: 0;
    height: 62px;
    border: 1px solid var(--rst-ui-line);
    border-radius: var(--rst-ui-radius-md);
    color: var(--rst-ui-text);
    background: var(--rst-ui-surface-field-strong);
    box-shadow: 0 3px 0 rgba(38, 27, 18, .08);
    font: inherit;
    font-size: var(--rst-fs-heading);
    font-weight: var(--rst-fw-display);
    cursor: pointer;
  }

  .keypad button:hover:not(:disabled) {
    border-color: var(--rst-state-selected-border);
    background: var(--rst-state-selected-bg);
    transform: translateY(-1px);
  }

  .keypad button:active:not(:disabled) {
    box-shadow: none;
    transform: translateY(2px);
  }

  .keypad button.keypad-tool {
    color: var(--rst-ui-muted);
    font-size: var(--rst-fs-title);
  }

  .primary-action,
  .secondary-action {
    min-height: 44px;
    padding: 10px 18px;
    border: 1px solid var(--rst-ui-line);
    border-radius: var(--rst-ui-radius-md);
    color: var(--rst-ui-text);
    background: var(--rst-ui-surface-field-strong);
    font: inherit;
    font-size: var(--rst-fs-body);
    font-weight: var(--rst-fw-bold);
    cursor: pointer;
  }

  .primary-action {
    color: var(--rst-on-accent-text);
    border-color: var(--rst-ui-action);
    background: var(--rst-ui-action);
    box-shadow: 0 7px 18px rgba(var(--rst-ui-action-rgb), .22);
  }

  .primary-action:hover:not(:disabled) {
    box-shadow: 0 10px 24px rgba(var(--rst-ui-action-rgb), .34);
    transform: translateY(-1px);
  }

  .continue {
    width: min(100%, 294px);
    margin-top: 13px;
  }

  button:disabled {
    opacity: .48;
    cursor: default;
  }

  .verified-mark,
  .success-mark {
    display: grid;
    place-items: center;
    border-radius: 50%;
    color: var(--rst-state-success-text);
    background: var(--rst-state-success-bg);
    animation: rst-check-pop .45s var(--rst-ease-spring);
  }

  .verified-mark {
    width: 44px;
    height: 44px;
    margin-bottom: 14px;
    font-size: var(--rst-fs-title-lg);
  }

  .expires {
    margin: 7px 0 20px;
    color: var(--rst-ui-muted);
    font-size: var(--rst-fs-label);
  }

  .proof-upload {
    width: min(100%, 330px);
    min-height: 68px;
    display: grid;
    place-content: center;
    gap: 3px;
    padding: 10px 14px;
    border: 1px dashed var(--rst-ui-line-strong);
    border-radius: var(--rst-ui-radius-md);
    background: var(--rst-ui-surface-field);
    cursor: pointer;
  }

  .proof-upload span {
    overflow: hidden;
    max-width: 290px;
    color: var(--rst-ui-muted);
    font-size: var(--rst-fs-caption);
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .proof-input {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
  }

  .proof-actions {
    display: flex;
    justify-content: center;
    gap: 8px;
    margin-top: 18px;
  }

  .success-mark {
    width: 68px;
    height: 68px;
    margin-bottom: 18px;
    font-size: var(--rst-fs-display);
    box-shadow: 0 0 0 12px rgba(var(--rst-state-success-rgb), .08);
  }

  .success p {
    display: grid;
    gap: 3px;
    margin: 24px 0;
  }

  .success p strong {
    font-size: var(--rst-fs-display-lg);
  }

  .success p span {
    color: var(--rst-ui-muted);
    font-size: var(--rst-fs-label);
  }

  @keyframes badge-shake {
    0%, 100% { transform: translateX(0); }
    25% { transform: translateX(-7px); }
    75% { transform: translateX(7px); }
  }

  @media (max-width: 760px) {
    .terminal-grid {
      min-height: 0;
      grid-template-columns: 1fr;
    }

    .people {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }

    .people > button {
      grid-template-columns: 38px minmax(0, 1fr);
    }

    .avatar {
      width: 38px;
      height: 38px;
    }

    .person-arrow {
      display: none;
    }

    .challenge-body {
      min-height: 510px;
    }
  }

  @media (max-width: 520px) {
    .terminal-head {
      align-items: flex-end;
    }

    .terminal-meta time span {
      display: none;
    }

    .terminal-meta time strong {
      font-size: var(--rst-fs-title);
    }

    .people > button {
      min-height: 58px;
    }

    .challenge-body {
      min-height: 480px;
      padding-inline: 12px;
    }

    .proof-actions {
      width: 100%;
      align-items: stretch;
      flex-direction: column;
    }
  }
</style>
