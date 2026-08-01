<script lang="ts">
  import { Camera, Check, Clock3, LocateFixed, ShieldCheck } from '@lucide/svelte';
  import { onDestroy } from 'svelte';
  import { friendlyError } from '$lib/api/error-messages';
  import {
    beginOwnBadge,
    getOwnBadgeContext,
    recordOwnBadge,
    uploadOwnBadgeProof,
    type OwnBadgeContext
  } from '$lib/badge/employee-badge-api';
  import {
    badgePolicyFromSettings,
    captureBadgeLocation,
    photoRequiredForAction
  } from '$lib/badge/badge-policy';
  import FeedbackBanner from '$lib/components/FeedbackBanner.svelte';
  import { i18n, t } from '$lib/i18n/i18n.svelte';
  import { workspaceRealtime } from '$lib/realtime/workspace-realtime.svelte';
  import { restaurantLogoUrl } from '$lib/restaurant/logo-api';
  import { sound } from '$lib/sound/sound.svelte';
  import { workspace } from '$lib/workspace/workspace.svelte';

  let context = $state<OwnBadgeContext | null>(null);
  let loading = $state(true);
  let recording = $state(false);
  let proof = $state<File | null>(null);
  let proofPreview = $state('');
  let feedback = $state('');
  let feedbackTone = $state<'info' | 'success' | 'warning' | 'danger'>('info');
  let completedAction = $state<'in' | 'out' | null>(null);
  let completedTime = $state('');
  let loadedRestaurantId = '';

  const action = $derived<'in' | 'out'>(context?.clockedIn ? 'out' : 'in');
  const photoRequired = $derived(
    context ? photoRequiredForAction(context.policy, action) : false
  );
  const logoUrl = $derived(restaurantLogoUrl(context?.logoPath));

  $effect(() => {
    const restaurantId = workspace.activeId;
    const previewEmployee = workspace.bootstrap?.current_employee;
    if (workspace.isPreview && restaurantId && previewEmployee) {
      const entries = (workspace.employeeOperations?.time_entries ?? [])
        .filter((entry) => entry.employee_id === previewEmployee.id)
        .sort((left, right) => String(right.updated_at).localeCompare(String(left.updated_at)));
      const openEntry = entries.find((entry) => entry.status === 'open');
      const latest = openEntry ?? entries[0];
      context = {
        restaurantId,
        restaurantName: workspace.bootstrap?.restaurant.name ?? '',
        logoPath: workspace.bootstrap?.restaurant.logo_path ?? '',
        timezone: workspace.bootstrap?.restaurant_settings.timezone ?? 'Europe/Brussels',
        employeeId: previewEmployee.id,
        displayName: previewEmployee.display_name,
        clockedIn: Boolean(openEntry),
        serviceKey: latest?.service_key,
        lastAction: openEntry ? 'in' : latest ? 'out' : undefined,
        lastLocalTime: undefined,
        policy: badgePolicyFromSettings(workspace.bootstrap?.restaurant_settings)
      };
      loading = false;
      return;
    }
    if (!restaurantId || loadedRestaurantId === restaurantId) return;
    loadedRestaurantId = restaurantId;
    void load(restaurantId);
  });

  onDestroy(() => {
    if (proofPreview) URL.revokeObjectURL(proofPreview);
  });

  async function load(restaurantId = workspace.activeId ?? '') {
    if (!restaurantId) return;
    loading = true;
    feedback = '';
    try {
      context = await getOwnBadgeContext(restaurantId);
    } catch (error) {
      context = null;
      feedback = friendlyError(error, 'badge');
      feedbackTone = 'danger';
    } finally {
      loading = false;
    }
  }

  function chooseProof(file: File | null) {
    if (proofPreview) URL.revokeObjectURL(proofPreview);
    proof = file;
    proofPreview = file ? URL.createObjectURL(file) : '';
    feedback = '';
  }

  async function badge() {
    if (!context || recording || workspace.isPreview) return;
    if (photoRequired && !proof) {
      feedback = t('Take a photo before recording this badge.');
      feedbackTone = 'warning';
      return;
    }

    recording = true;
    feedback = '';
    completedAction = null;
    try {
      // Ask for device permission while this click is still the initiating user
      // gesture. The database checks the same policy again before it commits.
      const location = context.policy.locationCaptureEnabled
        ? await captureBadgeLocation()
        : undefined;
      const token = await beginOwnBadge(context.restaurantId);
      const photoUrl = proof
        ? await uploadOwnBadgeProof({ context, token, file: proof })
        : undefined;
      const result = await recordOwnBadge({
        restaurantId: context.restaurantId,
        token,
        photoUrl,
        location
      });

      completedAction = result.action;
      completedTime = result.localTime;
      chooseProof(null);
      sound.play('success');
      await Promise.all([
        load(context.restaurantId),
        workspace.reloadEmployeeOperations(),
        workspaceRealtime.publish('actuals-updated', {
          restaurantId: context.restaurantId,
          source: 'badge'
        })
      ]);
    } catch (error) {
      feedback = friendlyError(error, 'badge');
      feedbackTone = 'danger';
      sound.play('error');
    } finally {
      recording = false;
    }
  }

  function restaurantTime() {
    return new Intl.DateTimeFormat(i18n.intlLocale, {
      hour: '2-digit',
      minute: '2-digit',
      timeZone: context?.timezone || 'Europe/Brussels'
    }).format(new Date());
  }
</script>

<svelte:head><title>{t('Clock in or out')} · restogogo</title></svelte:head>

<div class="mobile-badge">
  <a class="back-link" href="/my-time">&larr; {t('My time')}</a>

  {#if loading}
    <section class="badge-state" aria-live="polite">
      <span class="state-icon"><Clock3 size={21} /></span>
      <strong>{t('Preparing your clock')}</strong>
      <span>{t('Checking the restaurant badging rules.')}</span>
    </section>
  {:else if !context}
    <section class="badge-state is-error" role="alert">
      <strong>{t('Mobile badging is unavailable')}</strong>
      <span>{feedback}</span>
      <button class="cl-btn" type="button" onclick={() => void load()}>{t('Try again')}</button>
    </section>
  {:else if !context.policy.employeeMobileBadgingEnabled}
    <section class="badge-state">
      <span class="state-icon"><ShieldCheck size={21} /></span>
      <strong>{t('Phone badging is off')}</strong>
      <span>{t('Use the restaurant badge station, or ask an owner to enable employee phones.')}</span>
    </section>
  {:else}
    <main class="clock-surface">
      <header>
        {#if logoUrl}<img src={logoUrl} alt="" />{/if}
        <div>
          <span>{context.restaurantName}</span>
          <strong>{context.displayName}</strong>
        </div>
        <time>{restaurantTime()}</time>
      </header>

      <section class="clock-status" class:is-working={context.clockedIn}>
        <span class="status-dot" aria-hidden="true"></span>
        <div>
          <span>{t(context.clockedIn ? 'Currently working' : 'Currently clocked out')}</span>
          <strong>
            {context.lastLocalTime
              ? t(context.clockedIn ? 'In since {time}' : 'Out at {time}', { time: context.lastLocalTime })
              : t('No badge today')}
          </strong>
        </div>
      </section>

      {#if completedAction}
        <section class="recorded" aria-live="polite">
          <span><Check size={22} strokeWidth={2.3} /></span>
          <div>
            <strong>{t(completedAction === 'in' ? 'Clock-in recorded' : 'Clock-out recorded')}</strong>
            <small>{completedTime}</small>
          </div>
        </section>
      {/if}

      <FeedbackBanner message={feedback} tone={feedbackTone} />

      <section class="evidence">
        <header>
          <strong>{t('This badge records')}</strong>
          <span>{t('Only the evidence selected by your restaurant.')}</span>
        </header>
        <div class="evidence-grid">
          <span class:is-on={photoRequired}>
            <Camera size={18} />
            <b>{t('Photo')}</b>
            <small>{t(photoRequired ? 'Required' : 'Not required')}</small>
          </span>
          <span class:is-on={context.policy.locationCaptureEnabled}>
            <LocateFixed size={18} />
            <b>{t('Location')}</b>
            <small>{t(context.policy.locationCaptureEnabled ? 'Recorded on submit' : 'Not recorded')}</small>
          </span>
        </div>

        {#if photoRequired}
          <label class="photo-control" class:has-photo={Boolean(proofPreview)}>
            {#if proofPreview}
              <img src={proofPreview} alt={t('Badge photo preview')} />
              <span>{t('Retake photo')}</span>
            {:else}
              <Camera size={22} />
              <strong>{t('Take photo')}</strong>
              <small>{t('The image is stored privately with this time entry.')}</small>
            {/if}
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              capture="user"
              onchange={(event) => chooseProof(event.currentTarget.files?.[0] ?? null)}
            />
          </label>
        {/if}
      </section>

      <button
        class="clock-button"
        class:is-out={context.clockedIn}
        type="button"
        disabled={workspace.isPreview || recording || (photoRequired && !proof)}
        onclick={() => void badge()}
      >
        <Clock3 size={21} />
        <span>{recording ? t('Recording...') : t(context.clockedIn ? 'Clock out' : 'Clock in')}</span>
      </button>
      <p class="privacy-note"><ShieldCheck size={14} />{t(workspace.isPreview ? 'Preview only. Badging is disabled.' : 'You can only record time for your own account.')}</p>
    </main>
  {/if}
</div>

<style>
  .mobile-badge {
    width: min(100%, 620px);
    display: grid;
    gap: 12px;
    margin: 0 auto;
    padding: 4px 0 28px;
  }
  .back-link {
    justify-self: start;
    color: var(--cl-muted);
    font-size: var(--rst-fs-body);
    font-weight: var(--rst-fw-semibold);
    text-decoration: none;
  }
  .back-link:hover { color: var(--cl-accent); }
  .badge-state,
  .clock-surface {
    border: 1px solid var(--cl-line);
    border-radius: var(--cl-radius);
    background: var(--cl-surface);
    box-shadow: 0 12px 28px rgb(15 23 42 / 8%);
  }
  .badge-state {
    min-height: 280px;
    display: grid;
    place-content: center;
    justify-items: center;
    gap: 8px;
    padding: 32px;
    color: var(--cl-muted);
    text-align: center;
  }
  .badge-state strong { color: var(--cl-ink); font-size: var(--rst-fs-title-lg); }
  .state-icon {
    width: 42px;
    height: 42px;
    display: grid;
    place-items: center;
    margin-bottom: 4px;
    border-radius: 50%;
    color: var(--cl-info);
    background: color-mix(in srgb, var(--cl-info) 9%, var(--cl-surface));
  }
  .clock-surface { overflow: hidden; }
  .clock-surface > header {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto;
    align-items: center;
    gap: 11px;
    padding: 14px 16px;
    border-bottom: 1px solid var(--cl-line);
    background: color-mix(in srgb, var(--cl-info) 4%, var(--cl-surface));
  }
  .clock-surface > header img { width: 38px; height: 38px; border-radius: 7px; object-fit: contain; }
  .clock-surface > header div { display: grid; gap: 1px; }
  .clock-surface > header div span { color: var(--cl-muted); font-size: var(--rst-fs-caption); }
  .clock-surface > header div strong { font-size: var(--rst-fs-body-lg); }
  .clock-surface > header time { color: var(--cl-ink); font-size: var(--rst-fs-title-lg); font-weight: var(--rst-fw-display); }
  .clock-status {
    display: flex;
    align-items: center;
    gap: 12px;
    margin: 16px;
    padding: 16px;
    border: 1px solid var(--cl-line);
    border-radius: var(--cl-radius);
    background: var(--cl-surface-muted);
  }
  .status-dot { width: 10px; height: 10px; flex: 0 0 auto; border-radius: 50%; background: var(--cl-muted); box-shadow: 0 0 0 5px color-mix(in srgb, var(--cl-muted) 10%, transparent); }
  .clock-status.is-working .status-dot { background: var(--cl-ok); box-shadow: 0 0 0 5px color-mix(in srgb, var(--cl-ok) 12%, transparent); }
  .clock-status div { display: grid; gap: 2px; }
  .clock-status span { color: var(--cl-muted); font-size: var(--rst-fs-caption); }
  .clock-status strong { color: var(--cl-ink); font-size: var(--rst-fs-body-lg); }
  .recorded {
    display: flex;
    align-items: center;
    gap: 10px;
    margin: 0 16px 16px;
    padding: 12px 14px;
    border: 1px solid color-mix(in srgb, var(--cl-ok) 30%, var(--cl-line));
    border-radius: var(--cl-radius);
    background: color-mix(in srgb, var(--cl-ok) 7%, var(--cl-surface));
  }
  .recorded > span { width: 32px; height: 32px; display: grid; place-items: center; border-radius: 50%; color: white; background: var(--cl-ok); }
  .recorded div { display: grid; gap: 1px; }
  .recorded small { color: var(--cl-muted); }
  .clock-surface :global(.feedback) { margin-inline: 16px; }
  .evidence { display: grid; gap: 12px; padding: 0 16px 16px; }
  .evidence > header { display: grid; gap: 2px; }
  .evidence > header strong { color: var(--cl-ink); font-size: var(--rst-fs-body); }
  .evidence > header span { color: var(--cl-muted); font-size: var(--rst-fs-caption); }
  .evidence-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; }
  .evidence-grid > span {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr);
    align-items: center;
    gap: 2px 8px;
    padding: 10px;
    border: 1px solid var(--cl-line);
    border-radius: var(--cl-radius);
    color: var(--cl-muted);
    background: var(--cl-surface-muted);
  }
  .evidence-grid > span.is-on { border-color: color-mix(in srgb, var(--cl-info) 26%, var(--cl-line)); color: var(--cl-info); background: color-mix(in srgb, var(--cl-info) 5%, var(--cl-surface)); }
  .evidence-grid b { color: var(--cl-ink); font-size: var(--rst-fs-body); }
  .evidence-grid small { grid-column: 2; color: var(--cl-muted); font-size: var(--rst-fs-caption); }
  .photo-control {
    min-height: 112px;
    display: grid;
    place-items: center;
    align-content: center;
    gap: 4px;
    overflow: hidden;
    border: 1px dashed var(--cl-line-strong);
    border-radius: var(--cl-radius);
    color: var(--cl-info);
    background: var(--cl-surface-muted);
    text-align: center;
    cursor: pointer;
  }
  .photo-control small { color: var(--cl-muted); font-size: var(--rst-fs-caption); }
  .photo-control input { position: absolute; width: 1px; height: 1px; opacity: 0; }
  .photo-control.has-photo { position: relative; min-height: 180px; border-style: solid; }
  .photo-control.has-photo img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; }
  .photo-control.has-photo span { position: absolute; right: 9px; bottom: 9px; padding: 6px 9px; border-radius: 5px; color: white; background: rgb(15 23 42 / 72%); font-size: var(--rst-fs-caption); font-weight: var(--rst-fw-bold); }
  .clock-button {
    width: calc(100% - 32px);
    min-height: 54px;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 9px;
    margin: 0 16px 10px;
    border: 1px solid var(--cl-ok);
    border-radius: var(--cl-radius);
    color: white;
    background: var(--cl-ok);
    font: inherit;
    font-size: var(--rst-fs-body-lg);
    font-weight: var(--rst-fw-bold);
    cursor: pointer;
  }
  .clock-button.is-out { border-color: var(--cl-attention); background: var(--cl-attention); }
  .clock-button:disabled { cursor: default; opacity: .55; }
  .privacy-note { display: flex; align-items: center; justify-content: center; gap: 5px; margin: 0 16px 15px; color: var(--cl-muted); font-size: var(--rst-fs-caption); }
  @media (max-width: 520px) {
    .mobile-badge { padding-bottom: 16px; }
    .clock-surface > header { padding-inline: 13px; }
    .clock-status { margin: 13px; }
    .evidence { padding-inline: 13px; }
    .clock-button { width: calc(100% - 26px); margin-inline: 13px; }
  }
</style>
