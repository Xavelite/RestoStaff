<script lang="ts">
  import { onMount } from 'svelte';
  import ActionButton from '$lib/components/ActionButton.svelte';
  import BadgeTerminal from '$lib/badge/BadgeTerminal.svelte';
  import Dialog from '$lib/components/Dialog.svelte';
  import { createStationBadgeApi, getStationContext } from '$lib/station/station-api';
  import { t } from '$lib/i18n/i18n.svelte';
  import { restaurantLogoUrl } from '$lib/restaurant/logo-api';

  const STORAGE_KEY = 'rst-station-token';

  let token = $state('');
  let paired = $state(false);
  let restaurantName = $state('');
  let logoUrl = $state('');
  let timezone = $state('Europe/Brussels');
  let codeInput = $state('');
  let pairing = $state(false);
  let checked = $state(false);
  let error = $state('');
  let unpairOpen = $state(false);

  onMount(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      void tryPair(saved, true);
    } else {
      checked = true;
    }
  });

  async function tryPair(candidate: string, silent = false) {
    const clean = candidate.trim();
    if (!clean || pairing) return;
    pairing = true;
    error = '';
    try {
      const ctx = await getStationContext(clean);
      token = clean;
      restaurantName = ctx.restaurantName;
      logoUrl = restaurantLogoUrl(ctx.logoPath);
      timezone = ctx.timezone;
      localStorage.setItem(STORAGE_KEY, clean);
      paired = true;
    } catch {
      if (!silent) error = t('That pairing code is not valid. Ask a manager for a new one.');
      localStorage.removeItem(STORAGE_KEY);
      paired = false;
    } finally {
      pairing = false;
      checked = true;
    }
  }

  function unpair() {
    localStorage.removeItem(STORAGE_KEY);
    token = '';
    paired = false;
    codeInput = '';
    error = '';
    unpairOpen = false;
  }

  const api = $derived(paired && token ? createStationBadgeApi(token) : null);
</script>

<svelte:head><title>{t('Badge station')} &middot; restogogo</title></svelte:head>

<div class="station">
  {#if !checked}
    <div class="station-loading"><span class="spinner" aria-hidden="true"></span></div>
  {:else if paired && api}
    <BadgeTerminal {api} {restaurantName} {logoUrl} {timezone}>
      {#snippet headerAction()}
        <button
          type="button"
          class="terminal-head-action"
          aria-label={t('Unpair this device')}
          title={t('Unpair this device')}
          onclick={() => { unpairOpen = true; }}
        >
          <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 4v7"/><path d="M7.5 6.8a7 7 0 1 0 9 0"/></svg>
        </button>
      {/snippet}
    </BadgeTerminal>
  {:else}
    <div class="pair">
      <div class="pair-card">
        <span class="pair-brand" aria-label="Restogogo">
          <i style="--brand-mark:url('/brand/restogogo-mark.png')" aria-hidden="true"></i>
          <b aria-hidden="true"><em>esto</em><em>gogo</em></b>
        </span>
        <span class="pair-eyebrow">{t('Badge station')}</span>
        <h1>{t('Pair this device')}</h1>
        <p>{t('Enter the code from a manager (Restaurant → Badge devices) to turn this screen into a badge terminal. This device stays signed out of the app.')}</p>
        <form onsubmit={(event) => { event.preventDefault(); void tryPair(codeInput); }}>
          <input
            bind:value={codeInput}
            placeholder={t('Pairing code')}
            autocomplete="off"
            autocapitalize="off"
            spellcheck="false"
            disabled={pairing}
          />
          <button type="submit" class="pair-submit" disabled={pairing || !codeInput.trim()}>
            {pairing ? t('Checking…') : t('Pair device')}
          </button>
        </form>
        {#if error}<p class="pair-error" role="alert">{error}</p>{/if}
      </div>
    </div>
  {/if}
</div>

<Dialog
  open={unpairOpen}
  title={t('Unpair badge station')}
  description={t('This will stop badging on this device until a manager pairs it again.')}
  size="small"
  onclose={() => { unpairOpen = false; }}
>
  <p class="unpair-warning">{t('Only unpair this device when a manager is ready to reconnect it.')}</p>
  {#snippet footer()}
    <ActionButton label={t('Keep paired')} onclick={() => { unpairOpen = false; }} />
    <ActionButton label={t('Unpair device')} tone="danger" onclick={unpair} />
  {/snippet}
</Dialog>

<style>
  .station {
    min-height: 100dvh;
    padding: clamp(16px, 4vw, 40px);
    color: #17212f;
    background: #f5f7fb;
  }

  .station-loading {
    min-height: 100vh;
    display: grid;
    place-content: center;
  }

  .spinner {
    width: 34px;
    height: 34px;
    border: 3px solid var(--rst-ui-line);
    border-top-color: var(--rst-ui-action);
    border-radius: 50%;
    animation: station-spin 0.8s linear infinite;
  }

  @keyframes station-spin {
    to { transform: rotate(360deg); }
  }

  .pair {
    min-height: calc(100dvh - clamp(32px, 8vw, 80px));
    display: grid;
    place-items: center;
  }

  .pair-card {
    width: min(100%, 440px);
    display: grid;
    gap: 9px;
    padding: 28px;
    border: 1px solid #dfe5ed;
    border-top: 3px solid #ff5a1f;
    border-radius: 6px;
    background: #fff;
    box-shadow: 0 14px 34px rgb(15 23 42 / 9%);
    text-align: center;
  }

  .pair-brand {
    justify-self: center;
    display: inline-flex;
    align-items: center;
    gap: 7px;
    margin-bottom: 14px;
  }
  .pair-brand > i {
    width: 27px;
    height: 27px;
    background: #ff5a1f;
    -webkit-mask: var(--brand-mark) center / contain no-repeat;
    mask: var(--brand-mark) center / contain no-repeat;
  }
  .pair-brand > b {
    display: inline-flex;
    font-size: 16px;
    font-weight: var(--rst-fw-display);
  }
  .pair-brand em {
    color: #ff5a1f;
    font-style: normal;
  }
  .pair-brand em + em { color: #17212f; }

  .pair-eyebrow {
    color: #667085;
    font-size: 10px;
    font-weight: var(--rst-fw-bold);
    letter-spacing: .06em;
    text-transform: uppercase;
  }

  .pair-card h1 {
    margin: 2px 0 0;
    color: #17212f;
    font-size: 24px;
  }

  .pair-card p {
    margin: 0 0 8px;
    color: #667085;
    font-size: 13px;
    line-height: 1.5;
  }

  .pair-card form {
    display: grid;
    gap: 10px;
  }

  .pair-card input {
    min-height: 50px;
    padding: 12px 14px;
    border: 1px solid #cdd5df;
    border-radius: 6px;
    color: #17212f;
    background: #fff;
    font: inherit;
    font-size: 16px;
    letter-spacing: 0;
    text-align: center;
  }
  .pair-card input:focus {
    border-color: #315efb;
    outline: 0;
    box-shadow: 0 0 0 3px rgb(49 94 251 / 18%);
  }

  .pair-submit {
    min-height: 50px;
    border: 1px solid #315efb;
    border-radius: 6px;
    color: #fff;
    background: #315efb;
    font: inherit;
    font-size: 15px;
    font-weight: var(--rst-fw-display);
    cursor: pointer;
  }

  .pair-submit:disabled {
    opacity: 0.55;
    cursor: default;
  }
  .pair-submit:hover:not(:disabled) { background: #2448d8; }

  .pair-error {
    margin: 4px 0 0 !important;
    color: var(--rst-state-danger-text);
    font-size: 12px;
  }

  .unpair-warning {
    margin: 0;
    color: var(--rst-ui-text);
    font-size: 14px;
    line-height: 1.55;
  }
</style>
