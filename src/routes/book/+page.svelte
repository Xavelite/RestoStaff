<script lang="ts">
  import { onMount } from 'svelte';
  import {
    confirmPublicReservation,
    createPublicReservationHold,
    getPublicReservationContext,
    releasePublicReservationHold,
    searchPublicReservationAvailability
  } from '$lib/reservations/reservation-public-api';
  import type {
    PublicAvailabilitySlot,
    PublicReservationConfirmation,
    PublicReservationContext,
    PublicReservationHold
  } from '$lib/reservations/reservation-types';

  let publicKey = $state('');
  let websiteOrigin = $state('');
  let embedSession = $state('');
  let context = $state<PublicReservationContext | null>(null);
  let loading = $state(true);
  let searching = $state(false);
  let holding = $state(false);
  let confirming = $state(false);
  let searched = $state(false);
  let error = $state('');
  let slots = $state<PublicAvailabilitySlot[]>([]);
  let hold = $state<PublicReservationHold | null>(null);
  let confirmation = $state<PublicReservationConfirmation | null>(null);
  let now = $state(Date.now());

  let businessDate = $state('');
  let serviceKey = $state('');
  let partySize = $state(2);
  let areaId = $state('');
  let guestName = $state('');
  let guestEmail = $state('');
  let guestPhone = $state('');
  let guestComment = $state('');
  let todayDate = $state('');
  let holdAttemptFingerprint = $state('');
  let holdAttemptKey = $state('');
  let confirmationAttemptFingerprint = $state('');
  let confirmationAttemptKey = $state('');

  const selectedService = $derived(
    context?.services.find((service) => service.key === serviceKey) ?? null
  );
  const holdSeconds = $derived(
    hold ? Math.max(Math.ceil((new Date(hold.expiresAt).getTime() - now) / 1000), 0) : 0
  );
  const holdClock = $derived(
    `${Math.floor(holdSeconds / 60)}:${String(holdSeconds % 60).padStart(2, '0')}`
  );
  const maxDate = $derived(
    todayDate && selectedService
      ? addDays(todayDate, selectedService.advanceBookingDays)
      : ''
  );

  function localDate(timezone: string): string {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    }).formatToParts(new Date());
    const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
    return `${value.year}-${value.month}-${value.day}`;
  }

  function addDays(date: string, days: number): string {
    const next = new Date(`${date}T12:00:00Z`);
    next.setUTCDate(next.getUTCDate() + days);
    return next.toISOString().slice(0, 10);
  }

  function parentOrigin(): string {
    if (document.referrer) {
      try {
        return new URL(document.referrer).origin;
      } catch {
        // A direct booking link has no usable parent referrer.
      }
    }
    return window.location.origin;
  }

  async function load() {
    loading = true;
    error = '';
    try {
      const params = new URLSearchParams(window.location.search);
      const fragment = new URLSearchParams(window.location.hash.slice(1));
      publicKey = params.get('key')?.trim() ?? '';
      embedSession = fragment.get('session')?.trim() ?? '';
      websiteOrigin = fragment.get('origin')?.trim() || parentOrigin();
      if (!/^rg_pk_[a-f0-9]{32}$/.test(publicKey)) {
        throw new Error('This booking link is incomplete.');
      }
      context = await getPublicReservationContext(
        publicKey,
        websiteOrigin,
        embedSession
      );
      todayDate = localDate(context.restaurant.timezone);
      businessDate = todayDate;
      serviceKey = context.services[0]?.key ?? '';
      partySize = context.services[0]?.minimumPartySize ?? 2;
    } catch (cause) {
      error = cause instanceof Error ? cause.message : 'This booking link is unavailable.';
    } finally {
      loading = false;
    }
  }

  function resetResults() {
    slots = [];
    searched = false;
    hold = null;
    confirmation = null;
    holdAttemptFingerprint = '';
    holdAttemptKey = '';
    confirmationAttemptFingerprint = '';
    confirmationAttemptKey = '';
    error = '';
  }

  function changeService() {
    const service = context?.services.find((item) => item.key === serviceKey);
    if (service) {
      partySize = Math.min(
        Math.max(partySize, service.minimumPartySize),
        service.maximumPartySize
      );
    }
    resetResults();
  }

  async function search() {
    if (!businessDate || !serviceKey || !selectedService || searching) return;
    searching = true;
    error = '';
    hold = null;
    confirmation = null;
    try {
      slots = await searchPublicReservationAvailability(
        publicKey,
        websiteOrigin,
        {
          businessDate,
          serviceKey,
          partySize,
          areaId
        },
        embedSession
      );
      searched = true;
    } catch (cause) {
      error = cause instanceof Error ? cause.message : 'Availability could not be loaded.';
      slots = [];
      searched = true;
    } finally {
      searching = false;
    }
  }

  async function choose(slot: PublicAvailabilitySlot) {
    if (holding) return;
    holding = true;
    error = '';
    try {
      const fingerprint = JSON.stringify({
        businessDate,
        serviceKey,
        localTime: slot.localTime,
        partySize,
        areaId
      });
      if (fingerprint !== holdAttemptFingerprint) {
        holdAttemptFingerprint = fingerprint;
        holdAttemptKey = crypto.randomUUID();
      }
      hold = await createPublicReservationHold(
        publicKey,
        websiteOrigin,
        {
          businessDate,
          serviceKey,
          localTime: slot.localTime,
          partySize,
          areaId
        },
        holdAttemptKey,
        embedSession
      );
      confirmationAttemptFingerprint = '';
      confirmationAttemptKey = '';
      now = Date.now();
    } catch (cause) {
      error = cause instanceof Error ? cause.message : 'That time is no longer available.';
      await search();
    } finally {
      holding = false;
    }
  }

  async function changeTime() {
    const token = hold?.holdToken;
    hold = null;
    error = '';
    holdAttemptFingerprint = '';
    holdAttemptKey = '';
    confirmationAttemptFingerprint = '';
    confirmationAttemptKey = '';
    if (token) {
      try {
        await releasePublicReservationHold(
          publicKey,
          websiteOrigin,
          token,
          embedSession
        );
      } catch {
        // The server expires unreleased holds after five minutes.
      }
    }
  }

  async function confirm() {
    if (!hold || holdSeconds <= 0 || !guestName.trim() || confirming) return;
    confirming = true;
    error = '';
    try {
      const fingerprint = JSON.stringify({
        holdToken: hold.holdToken,
        name: guestName.trim(),
        email: guestEmail.trim(),
        phone: guestPhone.trim(),
        comment: guestComment.trim()
      });
      if (fingerprint !== confirmationAttemptFingerprint) {
        confirmationAttemptFingerprint = fingerprint;
        confirmationAttemptKey = crypto.randomUUID();
      }
      confirmation = await confirmPublicReservation(
        publicKey,
        websiteOrigin,
        hold.holdToken,
        {
          name: guestName.trim(),
          email: guestEmail.trim(),
          phone: guestPhone.trim(),
          comment: guestComment.trim(),
          languageCode: navigator.language.split('-')[0] || 'en'
        },
        confirmationAttemptKey,
        embedSession
      );
    } catch (cause) {
      error = cause instanceof Error ? cause.message : 'The reservation could not be confirmed.';
      if (holdSeconds <= 0) {
        hold = null;
        holdAttemptFingerprint = '';
        holdAttemptKey = '';
        confirmationAttemptFingerprint = '';
        confirmationAttemptKey = '';
      }
    } finally {
      confirming = false;
    }
  }

  onMount(() => {
    void load();
    const clock = window.setInterval(() => {
      now = Date.now();
      if (hold && !confirmation && new Date(hold.expiresAt).getTime() <= now) {
        error = 'Your five-minute hold expired. Choose a time again.';
        hold = null;
        holdAttemptFingerprint = '';
        holdAttemptKey = '';
        confirmationAttemptFingerprint = '';
        confirmationAttemptKey = '';
      }
    }, 1000);
    return () => window.clearInterval(clock);
  });
</script>

<svelte:head>
  <title>{context?.restaurant.name ? `Book · ${context.restaurant.name}` : 'Book a table'}</title>
  <meta name="robots" content="noindex, nofollow" />
  <meta name="referrer" content="strict-origin" />
</svelte:head>

<main class="booking-shell">
  <div class="booking-card">
    <header>
      <a class="brand" href="https://www.restogogo.com" target="_blank" rel="noreferrer" aria-label="RestoGogo">
        <i aria-hidden="true">R</i><span>restogogo</span>
      </a>
      {#if context?.restaurant.name}
        <div class="restaurant">
          <small>Reservations</small>
          <strong>{context.restaurant.name}</strong>
        </div>
      {/if}
    </header>

    {#if loading}
      <section class="loading-state" aria-live="polite">
        <span></span><span></span><span></span>
      </section>
    {:else if !context || !context.services.length}
      <section class="empty-state">
        <div class="state-icon is-error" aria-hidden="true">!</div>
        <h1>Online booking is not available</h1>
        <p>{error || 'Please contact the restaurant directly.'}</p>
      </section>
    {:else if confirmation}
      <section class="success-state">
        <div class="success-ring" aria-hidden="true">
          <svg viewBox="0 0 24 24"><path d="m7 12.5 3.2 3.2L17.5 8"/></svg>
        </div>
        <span class="kicker">{confirmation.status === 'confirmed' ? 'Booking confirmed' : 'Request received'}</span>
        <h1>We look forward to seeing you.</h1>
        <div class="confirmation-card">
          <span><small>Date</small><strong>{confirmation.businessDate}</strong></span>
          <span><small>Time</small><strong>{hold?.localTime}</strong></span>
          <span><small>Guests</small><strong>{confirmation.partySize}</strong></span>
          <span><small>Reference</small><strong>{confirmation.reservationId.slice(0, 8).toUpperCase()}</strong></span>
        </div>
        <p class="success-copy">
          {confirmation.status === 'confirmed'
            ? 'Your table is reserved.'
            : 'The restaurant will confirm your request shortly.'}
        </p>
      </section>
    {:else}
      <section class="booking-content">
        <div class="intro">
          <span class="kicker">{hold ? 'Your details' : 'Find a table'}</span>
          <h1>{hold ? `${hold.localTime} is held for you` : 'When would you like to join us?'}</h1>
          <p>{hold ? 'Complete the booking before the hold expires.' : 'Live availability from the restaurant’s own table plan.'}</p>
        </div>

        {#if error}
          <div class="booking-error" role="alert">{error}</div>
        {/if}

        {#if hold}
          <div class="hold-strip">
            <span><i aria-hidden="true"></i>Table held</span>
            <strong>{holdClock}</strong>
          </div>
          <div class="held-summary">
            <span><small>Date</small><strong>{hold.businessDate}</strong></span>
            <span><small>Time</small><strong>{hold.localTime}</strong></span>
            <span><small>Guests</small><strong>{hold.partySize}</strong></span>
            <button type="button" onclick={() => void changeTime()}>Change</button>
          </div>

          <form class="guest-form" onsubmit={(event) => { event.preventDefault(); void confirm(); }}>
            <label>
              <span>Name <b>*</b></span>
              <input required autocomplete="name" bind:value={guestName} placeholder="Your name" />
            </label>
            <div class="two-fields">
              <label>
                <span>Email</span>
                <input type="email" autocomplete="email" bind:value={guestEmail} placeholder="name@example.com" />
              </label>
              <label>
                <span>Phone</span>
                <input type="tel" autocomplete="tel" bind:value={guestPhone} placeholder="+32 …" />
              </label>
            </div>
            <label>
              <span>Message <em>optional</em></span>
              <textarea rows="3" maxlength="1000" bind:value={guestComment} placeholder="Allergies, accessibility, celebration…"></textarea>
            </label>
            <small class="contact-hint">Add an email address or phone number so the restaurant can reach you.</small>
            <button class="primary-action" type="submit" disabled={confirming || holdSeconds <= 0 || !guestName.trim() || (!guestEmail.trim() && !guestPhone.trim())}>
              {confirming ? 'Confirming…' : 'Confirm booking'}
            </button>
          </form>
        {:else}
          <form class="search-form" onsubmit={(event) => { event.preventDefault(); void search(); }}>
            <div class="search-grid">
              <label>
                <span>Date</span>
                <input type="date" min={todayDate || undefined} max={maxDate || undefined} bind:value={businessDate} onchange={resetResults} required />
              </label>
              <label>
                <span>Service</span>
                <select bind:value={serviceKey} onchange={changeService}>
                  {#each context.services as service (service.key)}
                    <option value={service.key}>{service.name}</option>
                  {/each}
                </select>
              </label>
              <label>
                <span>Guests</span>
                <input type="number" min={selectedService?.minimumPartySize ?? 1} max={selectedService?.maximumPartySize ?? 12} bind:value={partySize} oninput={resetResults} />
              </label>
              {#if context.areas.length > 1}
                <label>
                  <span>Area <em>optional</em></span>
                  <select bind:value={areaId} onchange={resetResults}>
                    <option value="">Best available</option>
                    {#each context.areas as area (area.id)}
                      <option value={area.id}>{area.name}</option>
                    {/each}
                  </select>
                </label>
              {/if}
            </div>
            <button class="primary-action" type="submit" disabled={searching}>
              {searching ? 'Checking tables…' : 'Find a table'}
            </button>
          </form>

          {#if searched}
            <div class="slot-section" aria-live="polite">
              <div class="slot-heading">
                <strong>{slots.length ? 'Available times' : 'No tables at this time'}</strong>
                <small>{slots.length ? 'Times are held only after you select one.' : 'Try another date, service, party size or area.'}</small>
              </div>
              {#if slots.length}
                <div class="slots">
                  {#each slots as slot (slot.startsAt)}
                    <button type="button" disabled={holding} onclick={() => void choose(slot)}>
                      {slot.localTime}
                    </button>
                  {/each}
                </div>
              {/if}
            </div>
          {/if}
        {/if}
      </section>
    {/if}

    <footer>
      <span><i aria-hidden="true"></i>Secure booking</span>
      <span>Powered by RestoGogo</span>
    </footer>
  </div>
</main>

<style>
  :global(html) { background: #eef2f6; }
  :global(body) { background: #eef2f6; color: #142033; }
  .booking-shell {
    --book-accent: #f15a24;
    --book-accent-deep: #d84714;
    --book-ink: #142033;
    --book-muted: #677286;
    --book-line: #dbe2eb;
    --book-soft: #f5f7fa;
    min-height: 100vh;
    display: grid;
    place-items: start center;
    padding: clamp(10px, 4vw, 36px);
    background: #eef2f6;
  }
  .booking-card {
    width: min(100%, 720px);
    display: grid;
    grid-template-rows: auto minmax(0, 1fr) auto;
    overflow: hidden;
    border: 1px solid rgba(31,48,72,.13);
    border-radius: 8px;
    background: #fff;
    box-shadow: 0 22px 70px rgba(25,42,67,.12), 0 2px 8px rgba(25,42,67,.05);
  }
  header, footer { display: flex; align-items: center; justify-content: space-between; }
  header { min-height: 70px; padding: 14px 22px; border-bottom: 1px solid var(--book-line); }
  .brand { display: inline-flex; align-items: center; gap: 7px; color: var(--book-ink); text-decoration: none; font-size: var(--rst-fs-body); font-weight: 800; letter-spacing: 0; }
  .brand i {
    display: grid;
    place-items: center;
    width: 27px;
    height: 27px;
    border-radius: 8px;
    color: #fff;
    background: var(--book-accent);
    font-size: var(--rst-fs-title-sm);
    font-style: normal;
    font-weight: 900;
  }
  .brand span::first-letter { color: var(--book-accent); }
  .restaurant { display: grid; justify-items: end; gap: 2px; }
  .restaurant small { color: var(--book-muted); font-size: var(--rst-fs-micro); font-weight: 700; letter-spacing: .08em; text-transform: uppercase; }
  .restaurant strong { max-width: 280px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: var(--rst-fs-control); }
  .booking-content, .empty-state, .success-state { padding: clamp(24px, 6vw, 44px); }
  .intro { display: grid; gap: 5px; }
  .kicker { color: var(--book-accent); font-size: var(--rst-fs-caption); font-weight: 850; letter-spacing: .1em; text-transform: uppercase; }
  h1, p { margin: 0; }
  h1 { color: var(--book-ink); font-size: var(--rst-fs-display); line-height: 1.12; letter-spacing: 0; }
  .intro p { color: var(--book-muted); font-size: var(--rst-fs-control); line-height: 1.55; }
  .booking-error { margin-top: 18px; padding: 10px 12px; border: 1px solid #efc7bb; border-left: 3px solid #d84c27; border-radius: 9px; color: #9e3519; background: #fff5f1; font-size: var(--rst-fs-label); line-height: 1.45; }
  .search-form, .guest-form { display: grid; gap: 17px; margin-top: 26px; }
  .search-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 13px; }
  label { display: grid; gap: 6px; }
  label > span { color: #344158; font-size: var(--rst-fs-caption); font-weight: 780; }
  label b { color: var(--book-accent); }
  label em { margin-left: 3px; color: #98a1af; font-size: var(--rst-fs-micro); font-style: normal; font-weight: 600; }
  input, select, textarea {
    width: 100%;
    min-height: 43px;
    padding: 10px 12px;
    border: 1px solid #cfd7e2;
    border-radius: 9px;
    color: var(--book-ink);
    background: #fff;
    font: inherit;
    font-size: var(--rst-fs-control);
    transition: border-color .15s, box-shadow .15s;
  }
  textarea { resize: vertical; line-height: 1.45; }
  input:focus, select:focus, textarea:focus { outline: 0; border-color: var(--book-accent); box-shadow: 0 0 0 3px rgba(241,90,36,.1); }
  .primary-action {
    min-height: 46px;
    border: 1px solid var(--book-accent-deep);
    border-radius: 8px;
    color: #fff;
    background: var(--book-accent);
    box-shadow: 0 7px 18px rgba(241,90,36,.2);
    font: inherit;
    font-size: var(--rst-fs-control);
    font-weight: 800;
    cursor: pointer;
  }
  .primary-action:hover:not(:disabled) { box-shadow: 0 9px 22px rgba(241,90,36,.28); transform: translateY(-1px); }
  button:disabled { cursor: not-allowed; opacity: .58; }
  .slot-section { display: grid; gap: 13px; margin-top: 26px; padding-top: 20px; border-top: 1px solid var(--book-line); }
  .slot-heading { display: grid; gap: 2px; }
  .slot-heading strong { font-size: var(--rst-fs-control); }
  .slot-heading small { color: var(--book-muted); font-size: var(--rst-fs-caption); }
  .slots { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; }
  .slots button {
    min-height: 40px;
    border: 1px solid #cfd8e4;
    border-radius: 8px;
    color: #263650;
    background: #fff;
    font: inherit;
    font-size: var(--rst-fs-control);
    font-weight: 780;
    cursor: pointer;
  }
  .slots button:hover:not(:disabled) { border-color: var(--book-accent); color: var(--book-accent-deep); background: #fff8f5; }
  .hold-strip { display: flex; align-items: center; justify-content: space-between; margin-top: 22px; padding: 9px 12px; border: 1px solid #f0c6b8; border-radius: 9px; color: #87361d; background: #fff6f2; font-size: var(--rst-fs-label); }
  .hold-strip span { display: flex; align-items: center; gap: 7px; font-weight: 750; }
  .hold-strip i { width: 7px; height: 7px; border-radius: 50%; background: var(--book-accent); box-shadow: 0 0 0 4px rgba(241,90,36,.11); }
  .hold-strip strong { font-variant-numeric: tabular-nums; font-size: var(--rst-fs-control); }
  .held-summary, .confirmation-card { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin-top: 14px; padding: 14px; border: 1px solid var(--book-line); border-radius: 11px; background: var(--book-soft); }
  .held-summary span, .confirmation-card span { display: grid; gap: 2px; }
  .held-summary small, .confirmation-card small { color: var(--book-muted); font-size: var(--rst-fs-micro); font-weight: 700; text-transform: uppercase; letter-spacing: .06em; }
  .held-summary strong, .confirmation-card strong { font-size: var(--rst-fs-control); }
  .held-summary button { border: 0; color: var(--book-accent-deep); background: transparent; font: inherit; font-size: var(--rst-fs-caption); font-weight: 800; cursor: pointer; }
  .two-fields { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
  .contact-hint { margin-top: -8px; color: var(--book-muted); font-size: var(--rst-fs-caption); }
  .empty-state, .success-state { min-height: 280px; display: grid; place-items: center; align-content: center; gap: 9px; text-align: center; }
  .empty-state p, .success-copy { color: var(--book-muted); font-size: var(--rst-fs-control); }
  .state-icon, .success-ring { display: grid; place-items: center; width: 54px; height: 54px; margin-bottom: 7px; border-radius: 50%; }
  .state-icon { color: #9f3418; background: #fff0eb; font-size: var(--rst-fs-title-lg); font-weight: 850; }
  .success-ring { color: #168754; background: #eaf8f1; box-shadow: 0 0 0 8px #f4fbf7; }
  .success-ring svg { width: 28px; fill: none; stroke: currentColor; stroke-width: 2.2; stroke-linecap: round; stroke-linejoin: round; }
  .confirmation-card { width: min(100%, 520px); margin: 14px 0 2px; text-align: left; }
  .loading-state { min-height: 430px; display: grid; align-content: center; gap: 13px; padding: 44px; }
  .loading-state span { height: 14px; border-radius: 6px; background: linear-gradient(90deg, #eef1f5, #f8f9fb, #eef1f5); background-size: 220% 100%; animation: shimmer 1.3s linear infinite; }
  .loading-state span:nth-child(1) { width: 42%; }
  .loading-state span:nth-child(2) { width: 76%; height: 28px; }
  footer { min-height: 48px; padding: 10px 22px; border-top: 1px solid var(--book-line); color: #8a94a4; background: #fafbfc; font-size: var(--rst-fs-micro); font-weight: 650; }
  footer span:first-child { display: flex; align-items: center; gap: 6px; }
  footer i { width: 6px; height: 6px; border-radius: 50%; background: #29a56b; }
  @keyframes shimmer { to { background-position: -220% 0; } }
  @media (max-width: 520px) {
    .booking-shell { padding: 0; background: #fff; }
    .booking-card { min-height: 100vh; border: 0; border-radius: 0; box-shadow: none; }
    header { padding: 13px 16px; }
    .booking-content, .empty-state, .success-state { padding: 26px 18px; }
    .restaurant strong { max-width: 170px; }
    .search-grid { grid-template-columns: 1fr; }
    .slots { grid-template-columns: repeat(3, 1fr); }
    .held-summary, .confirmation-card { grid-template-columns: repeat(2, 1fr); }
    .two-fields { grid-template-columns: 1fr; }
  }
</style>
