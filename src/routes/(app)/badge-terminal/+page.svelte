<script lang="ts">
  import {
    listBadgeRoster,
    recordBadge,
    uploadBadgeProof,
    verifyBadgePin,
    type BadgeRosterEmployee,
    type BadgeResult,
    type BadgeVerification
  } from '$lib/badge/badge-api';
  import ActionButton from '$lib/components/ActionButton.svelte';
  import FeedbackBanner from '$lib/components/FeedbackBanner.svelte';
  import { workspaceRealtime } from '$lib/realtime/workspace-realtime.svelte';
  import { workspace } from '$lib/workspace/workspace.svelte';

  let roster = $state<BadgeRosterEmployee[]>([]);
  let selectedId = $state('');
  let pin = $state('');
  let serviceKey = $state<'lunch' | 'evening'>('lunch');
  let loading = $state(false);
  let feedback = $state('');
  let feedbackTone = $state<'info' | 'success' | 'warning' | 'danger'>('info');
  let result = $state<BadgeResult | null>(null);
  let verification = $state<BadgeVerification | null>(null);
  let proof = $state<File | null>(null);
  let loadedFor = $state('');
  const selected = $derived(
    roster.find((employee) => employee.employeeId === selectedId) ?? null
  );

  $effect(() => {
    if (!workspace.activeId || loadedFor === workspace.activeId) return;
    loadedFor = workspace.activeId;
    void loadRoster();
  });

  async function loadRoster() {
    if (!workspace.activeId) return;
    loading = true;
    feedback = '';
    try {
      roster = await listBadgeRoster(workspace.activeId);
      selectedId = roster[0]?.employeeId ?? '';
      if (!roster.length) {
        feedback = 'No active badge-enabled employees have an active PIN.';
        feedbackTone = 'warning';
      }
    } catch (error) {
      feedback = error instanceof Error ? error.message : String(error);
      feedbackTone = 'danger';
    } finally {
      loading = false;
    }
  }

  function resetChallenge() {
    pin = '';
    proof = null;
    verification = null;
    result = null;
  }

  function digit(value: string) {
    if (!loading && !verification && pin.length < 4) pin += value;
  }

  async function verify() {
    if (!workspace.activeId || !selected || !/^\d{4}$/.test(pin) || loading) return;
    loading = true;
    feedback = '';
    result = null;
    try {
      verification = await verifyBadgePin(
        workspace.activeId,
        selected.employeeId,
        pin
      );
      pin = '';
      feedback = 'PIN verified. Add optional proof, then record the badge.';
      feedbackTone = 'info';
    } catch (error) {
      resetChallenge();
      feedback = error instanceof Error ? error.message : String(error);
      feedbackTone = 'danger';
    } finally {
      loading = false;
    }
  }

  async function completeBadge() {
    if (!workspace.activeId || !selected || !verification || loading) return;
    loading = true;
    feedback = '';
    try {
      const photoUrl = proof
        ? await uploadBadgeProof({
            restaurantId: workspace.activeId,
            employeeId: selected.employeeId,
            token: verification.token,
            file: proof
          })
        : undefined;
      result = await recordBadge({
        restaurantId: workspace.activeId,
        employeeId: selected.employeeId,
        token: verification.token,
        serviceKey,
        photoUrl,
        photoStatus: photoUrl ? 'captured' : 'not_required'
      });
      verification = null;
      proof = null;
      feedback = `${selected.displayName} clocked ${result.action} at ${result.localTime}.`;
      feedbackTone = 'success';
      await workspace.reloadOperations();
      await workspaceRealtime.publish('actuals-updated', {
        restaurantId: workspace.activeId,
        source: 'badge'
      });
    } catch (error) {
      resetChallenge();
      feedback = error instanceof Error ? error.message : String(error);
      feedbackTone = 'danger';
    } finally {
      loading = false;
    }
  }
</script>

<svelte:head><title>Time clock · restogogo</title></svelte:head>

<main class="terminal">
  <header>
    <div><p>{workspace.active?.restaurant_name}</p><h1>Badge terminal</h1></div>
    <a href="/actuals">Close terminal</a>
  </header>
  <FeedbackBanner message={feedback} tone={feedbackTone} />

  <div class="terminal-grid">
    <section class="roster">
      <div class="section-head">
        <strong>Who is badging?</strong>
        <button type="button" onclick={loadRoster}>Refresh</button>
      </div>
      <div class="people">
        {#each roster as employee (employee.employeeId)}
          <button
            type="button"
            class:is-selected={employee.employeeId === selectedId}
            onclick={() => {
              selectedId = employee.employeeId;
              resetChallenge();
            }}
          >
            <span>{employee.displayName.charAt(0).toUpperCase()}</span>
            <strong>{employee.displayName}</strong>
          </button>
        {/each}
      </div>
    </section>

    <section class="challenge">
      <div class="section-head">
        <strong>{selected?.displayName ?? 'Select an employee'}</strong>
        <small>Manager-authenticated terminal</small>
      </div>

      {#if verification}
        <div class="proof-step">
          <strong>Identity verified</strong>
          <p>
            Authorization expires at
            {new Date(verification.expiresAt).toLocaleTimeString([], {
              hour: '2-digit',
              minute: '2-digit'
            })}.
          </p>
          <label>
            <span>Optional photo proof</span>
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              capture="user"
              onchange={(event) => (proof = event.currentTarget.files?.[0] ?? null)}
            />
          </label>
          {#if proof}
            <small>{proof.name} · {(proof.size / 1024 / 1024).toFixed(1)} MB</small>
          {/if}
          <div class="proof-actions">
            <ActionButton label="Start over" disabled={loading} onclick={resetChallenge} />
            <ActionButton
              label={loading ? 'Recording…' : 'Record badge'}
              tone="primary"
              disabled={loading}
              onclick={completeBadge}
            />
          </div>
        </div>
      {:else}
        <div class="service">
          <button
            type="button"
            class:is-selected={serviceKey === 'lunch'}
            onclick={() => (serviceKey = 'lunch')}>Lunch</button
          >
          <button
            type="button"
            class:is-selected={serviceKey === 'evening'}
            onclick={() => (serviceKey = 'evening')}>Evening</button
          >
        </div>
        <div class="pin" aria-label={`${pin.length} PIN digits entered`}>
          {#each Array.from({ length: 4 }) as _, index}
            <i class:is-filled={index < pin.length}></i>
          {/each}
        </div>
        <div class="keypad">
          {#each ['1', '2', '3', '4', '5', '6', '7', '8', '9'] as value}
            <button type="button" onclick={() => digit(value)}>{value}</button>
          {/each}
          <button type="button" aria-label="Clear PIN" onclick={() => (pin = '')}>C</button>
          <button type="button" onclick={() => digit('0')}>0</button>
          <button
            type="button"
            aria-label="Delete last digit"
            onclick={() => (pin = pin.slice(0, -1))}>⌫</button
          >
        </div>
        <ActionButton
          label={loading ? 'Please wait…' : 'Verify PIN'}
          tone="primary"
          disabled={!selected || pin.length !== 4 || loading}
          onclick={verify}
        />
        <p class="security">
          The PIN is verified first. Only then can optional proof be captured.
          The server owns the timestamp and business date.
        </p>
      {/if}
    </section>
  </div>
</main>

<style>
  .terminal { width: min(100%, 1080px); margin: 0 auto; }
  .terminal > header { display: flex; align-items: center; justify-content: space-between; gap: 20px; margin-bottom: 18px; }
  header p, h1 { margin: 0; }
  header p { color: var(--rst-ui-panel-title); font-size: 11px; font-weight: var(--rst-fw-bold); text-transform: uppercase; }
  h1 { margin-top: 4px; font-size: 32px; }
  header a { padding: 9px 12px; border: 1px solid var(--rst-ui-line); border-radius: var(--rst-ui-radius-md); color: var(--rst-ui-text); text-decoration: none; }
  .terminal-grid { display: grid; grid-template-columns: minmax(280px, .8fr) minmax(320px, 1.2fr); gap: 14px; }
  .roster, .challenge { overflow: hidden; border: 1px solid var(--rst-ui-line); border-radius: var(--rst-ui-radius-xl); background: var(--rst-ui-surface-panel); }
  .section-head { min-height: 54px; display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 12px 14px; border-bottom: 1px solid var(--rst-ui-divider-soft); background: var(--rst-ui-surface-panel-head); }
  .section-head small { color: var(--rst-ui-muted); }
  .section-head button { border: 0; color: var(--rst-ui-panel-title); background: transparent; font: inherit; cursor: pointer; }
  .people { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 7px; padding: 10px; }
  .people button { min-height: 76px; display: grid; place-items: center; gap: 5px; padding: 8px; border: 1px solid var(--rst-ui-line); border-radius: var(--rst-ui-radius-lg); color: var(--rst-ui-text); background: transparent; font: inherit; cursor: pointer; }
  .people button.is-selected { border-color: var(--rst-state-selected-border); background: var(--rst-state-selected-bg); }
  .people span { width: 32px; height: 32px; display: grid; place-items: center; border-radius: 50%; background: var(--rst-state-info-bg); color: var(--rst-state-info-text); font-weight: var(--rst-fw-display); }
  .people strong { font-size: 11px; }
  .challenge { padding-bottom: 18px; text-align: center; }
  .service { display: grid; grid-template-columns: repeat(2, 1fr); gap: 6px; padding: 12px 18px 0; }
  .service button { min-height: 40px; border: 1px solid var(--rst-ui-line); border-radius: var(--rst-ui-radius-md); color: var(--rst-ui-muted); background: transparent; font: inherit; font-weight: var(--rst-fw-bold); cursor: pointer; }
  .service button.is-selected { color: var(--rst-ui-text); border-color: var(--rst-state-selected-border); background: var(--rst-state-selected-bg); }
  .pin { display: flex; justify-content: center; gap: 12px; padding: 22px 0 16px; }
  .pin i { width: 14px; height: 14px; border: 2px solid var(--rst-ui-line-strong); border-radius: 50%; }
  .pin i.is-filled { border-color: var(--rst-ui-action); background: var(--rst-ui-action); }
  .keypad { width: min(100%, 320px); display: grid; grid-template-columns: repeat(3, 1fr); gap: 7px; margin: 0 auto 14px; padding: 0 16px; }
  .keypad button { aspect-ratio: 1.45; border: 1px solid var(--rst-ui-line); border-radius: var(--rst-ui-radius-lg); color: var(--rst-ui-text); background: var(--rst-ui-surface-field-strong); font: inherit; font-size: 20px; font-weight: var(--rst-fw-display); cursor: pointer; }
  .keypad button:active { background: var(--rst-state-selected-bg); }
  .security { max-width: 500px; margin: 13px auto 0; padding: 0 18px; color: var(--rst-ui-muted); font-size: 10px; line-height: 1.5; }
  .proof-step { display: grid; justify-items: stretch; gap: 10px; padding: 26px 20px 10px; text-align: left; }
  .proof-step > strong { color: var(--rst-state-success-text); text-align: center; }
  .proof-step > p, .proof-step > small { margin: 0; color: var(--rst-ui-muted); font-size: 11px; text-align: center; }
  .proof-step label { display: grid; gap: 6px; padding: 14px; border: 1px solid var(--rst-ui-line); border-radius: var(--rst-ui-radius-lg); background: var(--rst-ui-surface-field); }
  .proof-step label span { color: var(--rst-ui-muted); font-size: 10px; font-weight: var(--rst-fw-bold); text-transform: uppercase; }
  .proof-step input { max-width: 100%; color: var(--rst-ui-text); }
  .proof-actions { display: flex; justify-content: center; gap: 8px; margin-top: 4px; }
  @media (max-width: 760px) {
    .terminal-grid { grid-template-columns: 1fr; }
    .people { grid-template-columns: repeat(3, minmax(0, 1fr)); }
  }
  @media (max-width: 520px) {
    .terminal > header { align-items: flex-start; }
    .people { grid-template-columns: repeat(2, minmax(0, 1fr)); }
    .proof-actions { align-items: stretch; flex-direction: column; }
  }
</style>
