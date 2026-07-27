<script lang="ts">
  import { onMount } from 'svelte';
  import { PUBLIC_SUPABASE_ANON_KEY, PUBLIC_SUPABASE_URL } from '$env/static/public';
  import ClassicPage from '$lib/classic/ClassicPage.svelte';
  import ClassicTablePanel from '$lib/classic/ClassicTablePanel.svelte';
  import { friendlyError } from '$lib/api/error-messages';
  import { t } from '$lib/i18n/i18n.svelte';
  import {
    ensureReservationPublicChannel,
    getReservationPublicChannel,
    rotateReservationPublicChannel,
    saveReservationPublicChannel
  } from '$lib/reservations/reservation-api';
  import type { ReservationPublicChannel } from '$lib/reservations/reservation-types';
  import { unsavedChanges } from '$lib/navigation/unsaved-changes.svelte';
  import { toasts } from '$lib/ui/toast.svelte';
  import { workspace } from '$lib/workspace/workspace.svelte';

  let channel = $state<ReservationPublicChannel | null>(null);
  let enabled = $state(false);
  let originsText = $state('');
  let loading = $state(false);
  let saving = $state(false);
  let activating = $state(false);
  let rotating = $state(false);
  let confirmRotation = $state(false);
  let copied = $state(false);
  let error = $state('');
  let appOrigin = $state(typeof window === 'undefined' ? '' : window.location.origin);
  let websiteOriginDraft = $state('');

  const originRows = $derived(
    originsText
      .split(/\r?\n/)
      .map((origin) => origin.trim())
      .filter(Boolean)
  );
  const dirty = $derived(
    Boolean(
      channel?.configured &&
        (enabled !== channel.enabled ||
          originRows.join('\n') !== editableOrigins(channel).join('\n'))
    )
  );
  const publicKey = $derived(channel?.publicKey ?? '');
  const widgetUrl = $derived(
    publicKey && appOrigin
      ? `${appOrigin}/book?key=${encodeURIComponent(publicKey)}`
      : ''
  );
  const embedCode = $derived(buildEmbedCode());

  function buildEmbedCode(): string {
    if (!widgetUrl || !publicKey) return '';
    const frameId = `restogogo-booking-${publicKey.slice(-8)}`;
    const endpoint = `${PUBLIC_SUPABASE_URL}/functions/v1/reservation-public/context`;
    return `<iframe
  id="${frameId}"
  title="Book a table"
  width="100%"
  height="720"
  loading="lazy"
  referrerpolicy="strict-origin"
  style="border:0;border-radius:16px;max-width:720px"
></iframe>
<script>
(() => {
  const frame = document.getElementById(${JSON.stringify(frameId)});
  fetch(${JSON.stringify(endpoint)}, {
    method: 'POST',
    headers: {
      apikey: ${JSON.stringify(PUBLIC_SUPABASE_ANON_KEY)},
      'content-type': 'application/json',
      'x-restogogo-key': ${JSON.stringify(publicKey)},
      'x-restogogo-origin': window.location.origin
    },
    body: JSON.stringify({ bootstrap: true })
  })
    .then((response) => {
      if (!response.ok) throw new Error('Booking widget unavailable');
      return response.json();
    })
    .then((data) => {
      const url = new URL(${JSON.stringify(widgetUrl)});
      url.hash = new URLSearchParams({
        session: data.embed_session,
        origin: window.location.origin
      }).toString();
      frame.src = url.toString();
    })
    .catch(() => {
      frame.replaceWith(document.createTextNode('Online booking is temporarily unavailable.'));
    });
})();
<\/script>`;
  }

  $effect(() => {
    const restaurantId = workspace.activeId;
    if (!restaurantId || channel?.restaurantId === restaurantId) return;
    void load(restaurantId);
  });

  function apply(next: ReservationPublicChannel) {
    channel = next;
    enabled = next.enabled;
    originsText = editableOrigins(next).join('\n');
    confirmRotation = false;
  }

  function editableOrigins(value: ReservationPublicChannel): string[] {
    return value.allowedOrigins.filter((origin) => origin !== appOrigin);
  }

  function normalizedWebsiteOrigin(): string {
    try {
      const url = new URL(websiteOriginDraft.trim());
      if (url.protocol !== 'http:' && url.protocol !== 'https:') return '';
      const origin = url.origin;
      return origin === 'null' ? '' : origin;
    } catch {
      return '';
    }
  }

  function savedOrigins(): string[] {
    return [...new Set([...originRows, appOrigin].filter(Boolean))];
  }

  async function load(restaurantId: string) {
    loading = true;
    error = '';
    try {
      apply(await getReservationPublicChannel(restaurantId));
    } catch (cause) {
      error = friendlyError(cause);
    } finally {
      loading = false;
    }
  }

  async function activate() {
    const websiteOrigin = normalizedWebsiteOrigin();
    if (!workspace.activeId || !appOrigin || !websiteOrigin || activating) return;
    activating = true;
    error = '';
    try {
      await ensureReservationPublicChannel(workspace.activeId, websiteOrigin);
      apply(
        await saveReservationPublicChannel(
          workspace.activeId,
          true,
          [...new Set([websiteOrigin, appOrigin])]
        )
      );
      toasts.show(t('Website bookings are ready.'), 'success');
    } catch (cause) {
      error = friendlyError(cause);
      toasts.show(error, 'danger');
    } finally {
      activating = false;
    }
  }

  async function save() {
    if (!workspace.activeId || !channel?.configured || !dirty || saving) return;
    saving = true;
    error = '';
    try {
      apply(
        await saveReservationPublicChannel(
          workspace.activeId,
          enabled,
          savedOrigins()
        )
      );
      toasts.show(t('Website booking settings saved.'), 'success');
    } catch (cause) {
      error = friendlyError(cause);
      toasts.show(error, 'danger');
    } finally {
      saving = false;
    }
  }

  function discard() {
    if (!channel) return;
    enabled = channel.enabled;
    originsText = editableOrigins(channel).join('\n');
  }

  async function rotate() {
    if (!workspace.activeId || !channel?.configured || rotating) return;
    if (!confirmRotation) {
      confirmRotation = true;
      return;
    }
    rotating = true;
    error = '';
    try {
      apply(await rotateReservationPublicChannel(workspace.activeId));
      toasts.show(t('Website booking key replaced.'), 'success');
    } catch (cause) {
      error = friendlyError(cause);
      toasts.show(error, 'danger');
    } finally {
      rotating = false;
    }
  }

  async function copyEmbed() {
    if (!embedCode) return;
    try {
      await navigator.clipboard.writeText(embedCode);
      copied = true;
      window.setTimeout(() => (copied = false), 1800);
    } catch {
      toasts.show(t('Copy the code from the field below.'), 'danger');
    }
  }

  onMount(() => {
    return unsavedChanges.register({
      id: 'reservation-public-channel',
      label: 'Website booking settings',
      isDirty: () => dirty,
      save,
      discard
    });
  });
</script>

<svelte:head><title>{t('Reservation API')} &middot; restogogo</title></svelte:head>

<ClassicPage>
  {#if error}
    <div class="api-alert" role="alert">{error}</div>
  {/if}

  <ClassicTablePanel
    {dirty}
    {saving}
    canSave={originRows.length > 0}
    onsave={() => void save()}
    ondiscard={discard}
  >
    {#snippet meta()}
      <span><i class:active={channel?.enabled} class="status-dot"></i>{channel?.enabled ? t('Website channel active') : t('Website channel off')}</span>
      <span>{t('No guest receives database access')}</span>
    {/snippet}

    {#snippet children()}
      {#if loading && !channel}
        <div class="api-loading" aria-label={t('Loading')}>
          <span class="cl-skel"></span><span class="cl-skel"></span><span class="cl-skel"></span>
        </div>
      {:else if channel && !channel.configured}
        <section class="activation">
          <div class="activation-mark" aria-hidden="true">
            <svg viewBox="0 0 24 24"><path d="M8 7.5h8M8 12h8M8 16.5h5M5 3.5h14a2 2 0 0 1 2 2v13a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-13a2 2 0 0 1 2-2Z"/></svg>
          </div>
          <div>
            <span class="eyebrow">{t('Website widget')}</span>
            <h1>{t('Accept bookings on your own website')}</h1>
            <p>{t('Create a secure booking channel, copy one embed code, and let RestoGogo allocate only tables that are truly available.')}</p>
          </div>
          <label class="activation-origin">
            <span>{t('Restaurant website')}</span>
            <input class="cl-field" type="url" bind:value={websiteOriginDraft} placeholder="https://restaurant.be" />
            <small>{t('Only this website will be able to start the embedded booking widget.')}</small>
          </label>
          <button class="cl-btn is-primary" type="button" disabled={activating || !normalizedWebsiteOrigin()} onclick={() => void activate()}>
            {activating ? t('Creating…') : t('Create website widget')}
          </button>
        </section>
      {:else if channel?.configured}
        <div class="api-grid">
          <section class="channel-card">
            <div class="section-title">
              <div class="section-icon is-live" aria-hidden="true">
                <svg viewBox="0 0 24 24"><path d="M10 13a5 5 0 0 0 7.5.5l2-2a5 5 0 0 0-7-7.5l-1.1 1.1M14 11a5 5 0 0 0-7.5-.5l-2 2a5 5 0 0 0 7 7.5l1.1-1.1"/></svg>
              </div>
              <div>
                <span class="eyebrow">{t('Available now')}</span>
                <h2>{t('Website widget')}</h2>
                <p>{t('The widget searches live capacity, holds exact tables for five minutes, then confirms the guest.')}</p>
              </div>
              <label class="cl-switch channel-switch">
                <input type="checkbox" bind:checked={enabled} />
                <span aria-hidden="true"></span>
                <em>{enabled ? t('Active') : t('Off')}</em>
              </label>
            </div>

            <div class="field-grid">
              <label>
                <span>{t('Allowed website origins')}</span>
                <small>{t('One complete origin per line — for example https://restaurant.be')}</small>
                <textarea class="cl-field" rows="3" bind:value={originsText} spellcheck="false"></textarea>
              </label>
              <label>
                <span>{t('Public channel key')}</span>
                <small>{t('Revocable channel identifier — never a database credential')}</small>
                <div class="key-row">
                  <input class="cl-field mono" readonly value={publicKey} aria-label={t('Public channel key')} />
                  <button class:confirming={confirmRotation} class="cl-btn is-ghost" type="button" disabled={rotating} onclick={() => void rotate()}>
                    {rotating ? t('Replacing…') : confirmRotation ? t('Replace key now') : t('Replace key')}
                  </button>
                </div>
                {#if confirmRotation}
                  <small class="rotation-warning">{t('This immediately disables the old embed code and releases unfinished holds. Click again to confirm.')}</small>
                {/if}
              </label>
            </div>

            <div class="embed-block">
              <div>
                <span>{t('Embed code')}</span>
                <small>{t('Paste this once in the page where guests should book.')}</small>
              </div>
              <button class="cl-btn is-primary" type="button" onclick={() => void copyEmbed()}>
                {copied ? t('Copied') : t('Copy embed code')}
              </button>
              <textarea class="embed-code" readonly rows="8" value={embedCode} aria-label={t('Website embed code')}></textarea>
            </div>

            {#if widgetUrl}
              <a class="preview-link" href={widgetUrl} target="_blank" rel="noreferrer">
                {t('Open widget preview')} <span aria-hidden="true">↗</span>
              </a>
            {/if}
          </section>

          <aside class="security-card">
            <span class="eyebrow">{t('Booking safeguards')}</span>
            <h3>{t('Capacity stays server-owned')}</h3>
            <ul>
              <li><i>1</i><span><strong>{t('Live availability')}</strong>{t('Service limits and table inventory are checked on every search.')}</span></li>
              <li><i>2</i><span><strong>{t('Five-minute hold')}</strong>{t('Exact tables are locked while the guest enters details.')}</span></li>
              <li><i>3</i><span><strong>{t('Atomic confirmation')}</strong>{t('Duplicate requests and overlapping parties are rejected in the database.')}</span></li>
            </ul>
          </aside>
        </div>

        <div class="upcoming-grid">
          <section>
            <span class="upcoming-badge">{t('Upcoming')}</span>
            <h3>{t('Server API')}</h3>
            <p>{t('Create bookings from trusted partner systems with private credentials, scoped permissions and full audit history.')}</p>
          </section>
          <section>
            <span class="upcoming-badge">{t('Upcoming')}</span>
            <h3>{t('Webhooks')}</h3>
            <p>{t('Notify approved integrations when a booking is created, changed, seated or cancelled.')}</p>
          </section>
        </div>
      {/if}
    {/snippet}
  </ClassicTablePanel>
</ClassicPage>

<style>
  .api-alert {
    padding: 10px 12px;
    border: 1px solid var(--cl-problem-line);
    border-left: 3px solid var(--cl-problem);
    border-radius: var(--cl-radius);
    background: var(--cl-problem-wash);
    color: var(--cl-problem);
    font-size: 12px;
  }
  .api-loading { display: grid; gap: 14px; padding: 28px; }
  .api-loading span:nth-child(1) { width: 38%; }
  .api-loading span:nth-child(2) { height: 120px; }
  .api-loading span:nth-child(3) { width: 72%; }
  .status-dot {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: var(--cl-muted);
  }
  .status-dot.active {
    background: var(--cl-positive);
    box-shadow: 0 0 0 3px var(--cl-positive-wash);
  }
  .activation {
    min-height: 360px;
    display: grid;
    place-items: center;
    align-content: center;
    gap: 18px;
    padding: 48px 24px;
    text-align: center;
  }
  .activation > div:nth-child(2) { max-width: 580px; }
  .activation-origin { width: min(100%, 390px); display: grid; gap: 5px; text-align: left; }
  .activation-origin > span { font-size: 11px; font-weight: 750; }
  .activation-origin small { color: var(--cl-muted); font-size: 9.5px; line-height: 1.4; }
  .activation-mark {
    display: grid;
    place-items: center;
    width: 58px;
    height: 58px;
    border: 1px solid color-mix(in srgb, var(--cl-accent) 34%, var(--cl-line));
    border-radius: 16px;
    color: var(--cl-accent);
    background: var(--cl-accent-wash);
  }
  .activation-mark svg,
  .section-icon svg {
    width: 25px;
    fill: none;
    stroke: currentColor;
    stroke-width: 1.7;
    stroke-linecap: round;
    stroke-linejoin: round;
  }
  h1, h2, h3, p { margin: 0; }
  .activation h1 { margin-top: 6px; font-size: clamp(22px, 3vw, 30px); letter-spacing: -.04em; }
  .activation p { margin-top: 9px; color: var(--cl-muted); font-size: 13px; line-height: 1.6; }
  .eyebrow {
    color: var(--cl-accent);
    font-size: 10px;
    font-weight: 800;
    letter-spacing: .09em;
    text-transform: uppercase;
  }
  .api-grid {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 290px;
    min-height: 470px;
  }
  .channel-card { padding: 24px; border-right: 1px solid var(--cl-line); }
  .section-title {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto;
    align-items: start;
    gap: 12px;
  }
  .section-icon {
    display: grid;
    place-items: center;
    width: 36px;
    height: 36px;
    border-radius: 10px;
    color: var(--cl-positive);
    background: var(--cl-positive-wash);
    border: 1px solid color-mix(in srgb, var(--cl-positive) 22%, var(--cl-line));
  }
  .section-icon svg { width: 18px; }
  .section-title h2 { margin-top: 2px; font-size: 18px; letter-spacing: -.02em; }
  .section-title p { margin-top: 3px; max-width: 620px; color: var(--cl-muted); font-size: 11.5px; line-height: 1.45; }
  .channel-switch { margin-top: 5px; white-space: nowrap; }
  .field-grid {
    display: grid;
    gap: 17px;
    margin-top: 24px;
    padding-top: 20px;
    border-top: 1px solid var(--cl-line);
  }
  .field-grid label, .embed-block > div { display: grid; gap: 3px; }
  .field-grid label > span, .embed-block span { font-size: 11px; font-weight: 750; color: var(--cl-ink); }
  .field-grid small, .embed-block small { color: var(--cl-muted); font-size: 10px; line-height: 1.4; }
  .field-grid textarea { min-height: 74px; margin-top: 5px; resize: vertical; line-height: 1.55; }
  .key-row {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: 8px;
    margin-top: 5px;
  }
  .mono, .embed-code { font-family: ui-monospace, SFMono-Regular, Consolas, monospace; font-size: 10.5px; }
  .confirming { color: var(--cl-problem) !important; border-color: var(--cl-problem-line) !important; }
  .rotation-warning { color: var(--cl-problem) !important; margin-top: 2px; }
  .embed-block {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: end;
    gap: 8px;
    margin-top: 22px;
    padding: 16px;
    border: 1px solid var(--cl-line-strong);
    border-radius: var(--cl-radius-lg);
    background: var(--cl-soft);
  }
  .embed-code {
    grid-column: 1 / -1;
    width: 100%;
    margin-top: 4px;
    padding: 11px;
    resize: none;
    border: 1px solid var(--cl-line);
    border-radius: var(--cl-radius);
    color: var(--cl-ink-soft);
    background: var(--cl-surface);
    line-height: 1.45;
  }
  .preview-link {
    display: inline-flex;
    gap: 5px;
    margin-top: 12px;
    color: var(--cl-accent);
    font-size: 11px;
    font-weight: 750;
    text-decoration: none;
  }
  .security-card {
    padding: 24px 20px;
    background:
      linear-gradient(180deg, color-mix(in srgb, var(--cl-accent) 5%, var(--cl-surface)), var(--cl-surface));
  }
  .security-card h3 { margin-top: 5px; font-size: 16px; letter-spacing: -.02em; }
  .security-card ul { display: grid; gap: 20px; margin: 24px 0 0; padding: 0; list-style: none; }
  .security-card li { display: grid; grid-template-columns: 26px 1fr; gap: 9px; align-items: start; }
  .security-card li > i {
    display: grid;
    place-items: center;
    width: 24px;
    height: 24px;
    border: 1px solid var(--cl-line-strong);
    border-radius: 50%;
    color: var(--cl-accent);
    background: var(--cl-surface);
    font-size: 10px;
    font-style: normal;
    font-weight: 800;
  }
  .security-card li span { display: grid; gap: 3px; color: var(--cl-muted); font-size: 10.5px; line-height: 1.45; }
  .security-card li strong { color: var(--cl-ink); font-size: 11px; }
  .upcoming-grid { display: grid; grid-template-columns: 1fr 1fr; border-top: 1px solid var(--cl-line); }
  .upcoming-grid section { min-height: 116px; padding: 19px 24px; }
  .upcoming-grid section + section { border-left: 1px solid var(--cl-line); }
  .upcoming-grid h3 { margin-top: 7px; font-size: 14px; }
  .upcoming-grid p { margin-top: 5px; max-width: 580px; color: var(--cl-muted); font-size: 10.5px; line-height: 1.5; }
  .upcoming-badge {
    display: inline-flex;
    padding: 2px 6px;
    border: 1px solid var(--cl-line-strong);
    border-radius: 999px;
    color: var(--cl-muted);
    background: var(--cl-soft);
    font-size: 8.5px;
    font-weight: 800;
    letter-spacing: .06em;
    text-transform: uppercase;
  }
  @media (max-width: 980px) {
    .api-grid { grid-template-columns: 1fr; }
    .channel-card { border-right: 0; }
    .security-card { border-top: 1px solid var(--cl-line); }
  }
  @media (max-width: 520px) {
    .channel-card, .security-card { padding: 18px 14px; }
    .section-title { grid-template-columns: auto 1fr; }
    .channel-switch { grid-column: 2; }
    .key-row { grid-template-columns: 1fr; }
    .embed-block { grid-template-columns: 1fr; }
    .embed-code { grid-column: 1; }
    .upcoming-grid { grid-template-columns: 1fr; }
    .upcoming-grid section + section { border-left: 0; border-top: 1px solid var(--cl-line); }
  }
</style>
