<script lang="ts">
  import { page } from '$app/state';
  import type { WorkspaceRole } from '$lib/api/workspace';
  import { i18n, t } from '$lib/i18n/i18n.svelte';
  import { personInitials } from '$lib/ui/person';
  import { sound } from '$lib/sound/sound.svelte';
  import { toasts } from '$lib/ui/toast.svelte';
  import { workspaceRealtime } from '$lib/realtime/workspace-realtime.svelte';
  import {
    getCommunications,
    markOperationalMessage,
    sendOperationalMessage
  } from './communications-api';
  import type { CommunicationsReadModel, OperationalMessage } from './communications-model';

  let {
    restaurantId,
    role,
    employeeId = null
  }: {
    restaurantId: string | null;
    role: WorkspaceRole | null;
    employeeId?: string | null;
  } = $props();

  let open = $state(false);
  let model = $state<CommunicationsReadModel | null>(null);
  let loading = $state(false);
  let busy = $state(false);
  let loadedKey = '';
  let observedRealtimeSequence = 0;

  let messageBody = $state('');
  let messagePriority = $state<'normal' | 'urgent'>('normal');
  let acknowledgementRequired = $state(false);
  let selectedRecipients = $state<string[]>([]);
  let recipientsOpen = $state(false);
  let handledDeepLink = $state('');

  let scrollEl = $state<HTMLDivElement | null>(null);
  let inputEl = $state<HTMLTextAreaElement | null>(null);

  const isManager = $derived(role === 'owner' || role === 'manager');
  const myRecipients = $derived(model?.messageRecipients.filter((row) => row.employee_id === employeeId) ?? []);
  const unreadMessages = $derived(myRecipients.filter((row) => !row.read_at).length);
  const badgeCount = $derived(unreadMessages);
  // A chat reads oldest first, so the newest update always sits nearest the composer.
  const messages = $derived(
    [...(model?.messages ?? [])].sort((a, b) => a.created_at.localeCompare(b.created_at))
  );

  function contextKey() {
    return `${restaurantId ?? ''}|${role ?? ''}|${employeeId ?? ''}`;
  }

  function formatMoment(value: string) {
    return new Intl.DateTimeFormat(i18n.locale, {
      hour: '2-digit', minute: '2-digit'
    }).format(new Date(value));
  }

  // Chat transcripts need a date spine, not a timestamp on every line.
  function dayKey(value: string) {
    return new Date(value).toDateString();
  }

  function dayLabel(value: string) {
    const day = new Date(value);
    const today = new Date();
    const yesterday = new Date();
    yesterday.setDate(today.getDate() - 1);
    if (day.toDateString() === today.toDateString()) return t('Today');
    if (day.toDateString() === yesterday.toDateString()) return t('Yesterday');
    return new Intl.DateTimeFormat(i18n.locale, {
      weekday: 'short', day: 'numeric', month: 'short'
    }).format(day);
  }

  function recipientFor(messageId: string) {
    return myRecipients.find((row) => row.message_id === messageId);
  }

  function messageRecipientSummary(messageId: string) {
    const recipients = model?.messageRecipients.filter((row) => row.message_id === messageId) ?? [];
    const read = recipients.filter((row) => row.read_at).length;
    const acknowledged = recipients.filter((row) => row.acknowledged_at).length;
    return { total: recipients.length, read, acknowledged };
  }

  function countIncoming(snapshot: CommunicationsReadModel) {
    return snapshot.messages.length;
  }

  // Set while the user's own action (or opening the panel) is refreshing, so we
  // never chime at someone for something they just did themselves.
  let suppressChime = false;

  async function refresh(force = false) {
    if (!restaurantId || !role) return;
    const key = contextKey();
    if (!force && model && loadedKey === key) return;
    loading = true;
    try {
      const result = await getCommunications(restaurantId);
      if (key !== contextKey()) return;
      const previous = model;
      model = result;
      if (
        previous &&
        !suppressChime &&
        loadedKey === key &&
        countIncoming(result) > countIncoming(previous)
      ) {
        sound.play('notification');
      }
      loadedKey = key;
    } catch (error) {
      if (force || open) toasts.show(error instanceof Error ? error.message : String(error), 'danger');
    } finally {
      loading = false;
    }
  }

  async function publishAndRefresh() {
    if (!restaurantId) return;
    suppressChime = true;
    try {
      await workspaceRealtime.publish('communications-updated', {
        restaurantId,
        source: 'communications'
      });
      await refresh(true);
    } finally {
      suppressChime = false;
    }
  }

  function scrollToLatest(smooth = false) {
    const el = scrollEl;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: smooth ? 'smooth' : 'auto' });
  }

  async function openCenter() {
    open = true;
    suppressChime = true;
    try {
      await refresh(true);
    } finally {
      suppressChime = false;
    }
    if (!isManager && restaurantId) {
      const unread = model?.messages.filter((message) => !recipientFor(message.id)?.read_at) ?? [];
      await Promise.all(unread.map((message) => markOperationalMessage(restaurantId, message.id).catch(() => undefined)));
      if (unread.length) await refresh(true);
    }
  }

  function closeCenter() {
    open = false;
    recipientsOpen = false;
  }

  function growInput() {
    const el = inputEl;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
  }

  function onInputKeydown(event: KeyboardEvent) {
    // Enter sends, Shift+Enter keeps the newline — the convention every chat uses.
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      void sendMessage();
    }
  }

  async function sendMessage() {
    if (!restaurantId || !messageBody.trim() || busy) return;
    busy = true;
    try {
      await sendOperationalMessage({
        restaurantId,
        body: messageBody.trim(),
        employeeIds: selectedRecipients,
        priority: messagePriority,
        acknowledgementRequired
      });
      messageBody = '';
      selectedRecipients = [];
      messagePriority = 'normal';
      acknowledgementRequired = false;
      recipientsOpen = false;
      if (inputEl) inputEl.style.height = 'auto';
      await publishAndRefresh();
      scrollToLatest(true);
      toasts.show(t('Message sent.'), 'success');
    } catch (error) {
      toasts.show(error instanceof Error ? error.message : String(error), 'danger');
    } finally {
      busy = false;
    }
  }

  async function acknowledge(message: OperationalMessage) {
    if (!restaurantId) return;
    busy = true;
    try {
      await markOperationalMessage(restaurantId, message.id, true);
      await publishAndRefresh();
    } catch (error) {
      toasts.show(error instanceof Error ? error.message : String(error), 'danger');
    } finally {
      busy = false;
    }
  }

  $effect(() => {
    const key = contextKey();
    if (!key || key === '||') return;
    loadedKey = '';
    model = null;
    void refresh(true);
  });

  $effect(() => {
    const requested = page.url.searchParams.get('communications');
    const key = `${page.url.pathname}|${requested ?? ''}|${restaurantId ?? ''}`;
    if (requested !== 'messages' || key === handledDeepLink || !restaurantId) return;
    handledDeepLink = key;
    void openCenter();
  });

  $effect(() => {
    const sequence = workspaceRealtime.eventSequence;
    if (!sequence || sequence === observedRealtimeSequence) return;
    observedRealtimeSequence = sequence;
    if (workspaceRealtime.lastEvent === 'communications-updated') void refresh(true);
  });

  // Keep the newest update in view whenever the transcript changes while open.
  $effect(() => {
    if (!open) return;
    void messages.length;
    void scrollEl;
    requestAnimationFrame(() => scrollToLatest());
  });
</script>

<svelte:window
  onkeydown={(event) => {
    if (event.key === 'Escape' && open) closeCenter();
  }}
/>

<button
  class="communications-button"
  class:has-unread={badgeCount > 0}
  class:is-open={open}
  data-floating-action="communications"
  type="button"
  aria-label={t('Team messages')}
  title={t('Team messages')}
  aria-expanded={open}
  onclick={() => (open ? closeCenter() : openCenter())}
>
  {#if open}
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path d="M6 6l12 12M18 6 6 18" />
    </svg>
  {:else}
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path d="M5 17.5 3.8 21l4-2.1A9.5 9.5 0 1 0 5 17.5Z" />
      <path d="M8 10h8M8 14h5" />
    </svg>
  {/if}
  {#if badgeCount > 0 && !open}<b>{badgeCount > 9 ? '9+' : badgeCount}</b>{/if}
</button>

{#if open}
  <!-- A docked panel, not a modal: the workspace behind it stays readable and
       usable while a manager keeps an eye on the conversation. -->
  <div class="chat" role="dialog" aria-modal="false" aria-label={t('Team messages')}>
    <header class="chat__head">
      <span class="chat__mark" aria-hidden="true">
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
          <path d="M5 17.5 3.8 21l4-2.1A9.5 9.5 0 1 0 5 17.5Z" />
          <path d="M8 10h8M8 14h5" />
        </svg>
      </span>
      <span class="chat__title">
        <strong>{t('Team messages')}</strong>
        <small>{isManager ? t('Reach the whole team, or just the people who need it.') : t('Updates from your restaurant.')}</small>
      </span>
      <button class="chat__close" type="button" aria-label={t('Close')} onclick={closeCenter}>
        <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true">
          <path d="M6 6l12 12M18 6 6 18" />
        </svg>
      </button>
    </header>

    <div class="chat__scroll" bind:this={scrollEl}>
      {#if loading && !model}
        <p class="chat__hint">{t('Loading team updates…')}</p>
      {:else if !messages.length}
        <div class="chat__empty">
          <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M5 17.5 3.8 21l4-2.1A9.5 9.5 0 1 0 5 17.5Z" />
            <path d="M8 10h8M8 14h5" />
          </svg>
          <strong>{t('No messages yet')}</strong>
          <span>{isManager ? t('Send an update when the team needs shared context.') : t('Restaurant updates will appear here.')}</span>
        </div>
      {:else}
        {#each messages as message, index (message.id)}
          {@const receipt = recipientFor(message.id)}
          {@const summary = messageRecipientSummary(message.id)}
          {@const sender = message.sender_name ?? t('Management')}
          {#if index === 0 || dayKey(message.created_at) !== dayKey(messages[index - 1].created_at)}
            <p class="chat__day"><span>{dayLabel(message.created_at)}</span></p>
          {/if}
          <article class="bubble" class:is-mine={isManager} class:is-urgent={message.priority === 'urgent'}>
            {#if !isManager}
              <span class="bubble__avatar" aria-hidden="true">{personInitials(sender)}</span>
            {/if}
            <div class="bubble__body">
              {#if !isManager}
                <span class="bubble__sender">{sender}</span>
              {/if}
              {#if message.priority === 'urgent'}
                <span class="bubble__flag">{t('Urgent')}</span>
              {/if}
              <p class="bubble__text">{message.body}</p>
              <span class="bubble__meta">
                <time>{formatMoment(message.created_at)}</time>
                {#if isManager}
                  <span>{t('{read} of {total} read', { read: summary.read, total: summary.total })}{#if message.acknowledgement_required}{' · '}{t('{count} confirmed', { count: summary.acknowledged })}{/if}</span>
                {/if}
              </span>
              {#if !isManager && message.acknowledgement_required}
                <button
                  class="bubble__confirm"
                  type="button"
                  disabled={busy || Boolean(receipt?.acknowledged_at)}
                  onclick={() => acknowledge(message)}
                >
                  {receipt?.acknowledged_at ? t('Confirmed') : t('Confirm I’ve read this')}
                </button>
              {/if}
            </div>
          </article>
        {/each}
      {/if}
    </div>

    {#if isManager}
      <div class="composer">
        {#if recipientsOpen}
          <div class="composer__people">
            <button
              class="composer__everyone"
              class:is-active={!selectedRecipients.length}
              type="button"
              onclick={() => (selectedRecipients = [])}
            >
              <strong>{t('Everyone active')}</strong>
              <small>{t('Send to the whole restaurant team.')}</small>
            </button>
            <p>{t('Or choose employees')}</p>
            <div class="composer__list">
              {#each model?.employees ?? [] as employee (employee.id)}
                <label>
                  <input
                    type="checkbox"
                    checked={selectedRecipients.includes(employee.id)}
                    onchange={() => selectedRecipients = selectedRecipients.includes(employee.id)
                      ? selectedRecipients.filter((id) => id !== employee.id)
                      : [...selectedRecipients, employee.id]}
                  />
                  <span>{employee.display_name}</span>
                </label>
              {/each}
            </div>
          </div>
        {/if}

        <div class="composer__chips">
          <button
            class="chip"
            class:is-set={selectedRecipients.length > 0}
            type="button"
            aria-expanded={recipientsOpen}
            onclick={() => (recipientsOpen = !recipientsOpen)}
          >
            <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path d="M16 19v-1.5a3.5 3.5 0 0 0-3.5-3.5h-5A3.5 3.5 0 0 0 4 17.5V19" />
              <circle cx="10" cy="8" r="3" />
              <path d="M20 19v-1.5a3.5 3.5 0 0 0-2.5-3.35M15.5 5.2a3 3 0 0 1 0 5.6" />
            </svg>
            {selectedRecipients.length ? t('{count} selected', { count: selectedRecipients.length }) : t('Everyone active')}
          </button>
          <button
            class="chip"
            class:is-urgent={messagePriority === 'urgent'}
            type="button"
            aria-pressed={messagePriority === 'urgent'}
            onclick={() => (messagePriority = messagePriority === 'urgent' ? 'normal' : 'urgent')}
          >
            <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path d="M12 8v5M12 16.5v.01" />
              <path d="M10.3 3.9 2.4 17.4A1.9 1.9 0 0 0 4 20.3h16a1.9 1.9 0 0 0 1.6-2.9L13.7 3.9a1.9 1.9 0 0 0-3.4 0Z" />
            </svg>
            {t('Urgent')}
          </button>
          <button
            class="chip"
            class:is-set={acknowledgementRequired}
            type="button"
            aria-pressed={acknowledgementRequired}
            onclick={() => (acknowledgementRequired = !acknowledgementRequired)}
          >
            <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path d="m4 12.5 5 5L20 6.5" />
            </svg>
            {t('Ask for confirmation')}
          </button>
        </div>

        <div class="composer__row">
          <textarea
            bind:this={inputEl}
            bind:value={messageBody}
            rows="1"
            maxlength="1000"
            placeholder={t('What does the team need to know?')}
            oninput={growInput}
            onkeydown={onInputKeydown}
          ></textarea>
          <button
            class="composer__send"
            type="button"
            aria-label={t('Send')}
            title={t('Send')}
            disabled={busy || !messageBody.trim()}
            onclick={sendMessage}
          >
            <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path d="M4.5 12h13M12 5.5 18.5 12 12 18.5" />
            </svg>
          </button>
        </div>
        <p class="composer__hint">{t('Selected employees receive a phone notification.')}</p>
      </div>
    {/if}
  </div>
{/if}

<style>
  .communications-button { position: fixed; z-index: var(--rst-z-panel); right: 22px; bottom: max(22px, env(safe-area-inset-bottom, 0px)); width: 52px; min-height: 52px; display: inline-flex; align-items: center; justify-content: center; padding: 0; border: 1px solid color-mix(in srgb, var(--cl-accent) 72%, white); border-radius: 50%; color: white; background: var(--cl-accent); box-shadow: 0 13px 30px rgba(var(--cl-accent-rgb), .28), 0 3px 10px rgba(15, 23, 42, .18); font: inherit; line-height: 1; cursor: pointer; transition: transform .18s var(--cl-ease), background .18s ease, border-color .18s ease, box-shadow .18s ease; }
  .communications-button:hover { border-color: color-mix(in srgb, var(--cl-accent-hover) 72%, white); color: white; background: var(--cl-accent-hover); box-shadow: 0 16px 34px rgba(var(--cl-accent-rgb), .32), 0 4px 12px rgba(15, 23, 42, .2); transform: translateY(-2px); }
  .communications-button:focus-visible { outline: 3px solid rgba(var(--cl-accent-rgb), .24); outline-offset: 3px; }
  .communications-button:active { transform: translateY(0); }
  .communications-button > svg { display: block; }
  .communications-button b { position: absolute; top: -3px; right: -3px; min-width: 19px; height: 19px; display: grid; place-items: center; padding: 0 4px; border: 2px solid var(--cl-bg); border-radius: var(--rst-ui-radius-pill); color: white; background: var(--rst-state-danger); font-size: var(--rst-fs-micro); font-weight: 800; animation: rst-pop-in .32s var(--rst-ease-spring) backwards; }

  /* The panel is docked above its own launcher so the eye never loses the
     thread between the button pressed and the conversation that opened. */
  .chat {
    position: fixed;
    z-index: var(--rst-z-panel);
    right: 22px;
    bottom: calc(max(22px, env(safe-area-inset-bottom, 0px)) + 64px);
    width: 384px;
    max-width: calc(100vw - 32px);
    height: min(560px, calc(100dvh - 150px));
    display: grid;
    grid-template-rows: auto minmax(0, 1fr) auto;
    overflow: hidden;
    border: 1px solid var(--rst-ui-line);
    border-radius: 16px;
    color: var(--rst-ui-text);
    background: var(--rst-ui-surface-panel);
    box-shadow: 0 24px 60px rgba(15, 23, 42, .22), 0 4px 14px rgba(15, 23, 42, .12);
    animation: rst-chat-in .18s var(--rst-ease-spring, ease) backwards;
  }

  @keyframes rst-chat-in {
    from { opacity: 0; transform: translateY(10px) scale(.98); }
  }

  .chat__head {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 12px 12px 12px 14px;
    border-bottom: 1px solid var(--rst-ui-divider-soft);
    background: var(--rst-ui-surface-field);
  }
  .chat__mark {
    display: grid;
    place-items: center;
    width: 30px;
    height: 30px;
    border-radius: 9px;
    color: var(--rst-on-accent-text);
    background: var(--cl-accent);
  }
  .chat__title { min-width: 0; display: grid; gap: 1px; }
  .chat__title strong { font-size: var(--rst-fs-body); font-weight: var(--rst-fw-bold); }
  .chat__title small {
    overflow: hidden;
    color: var(--rst-ui-muted);
    font-size: var(--rst-fs-caption);
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .chat__close {
    flex: none;
    margin-left: auto;
    width: 28px;
    height: 28px;
    display: grid;
    place-items: center;
    border: 0;
    border-radius: 8px;
    color: var(--rst-ui-muted);
    background: transparent;
    cursor: pointer;
  }
  .chat__close:hover { color: var(--rst-ui-text); background: var(--rst-ui-hover-bg); }

  .chat__scroll {
    display: grid;
    align-content: start;
    gap: 8px;
    overflow-y: auto;
    padding: 14px 12px;
    background: var(--rst-ui-surface-field);
  }

  .chat__day {
    display: grid;
    grid-template-columns: 1fr auto 1fr;
    align-items: center;
    gap: 8px;
    margin: 6px 0 2px;
  }
  .chat__day::before, .chat__day::after {
    content: '';
    height: 1px;
    background: var(--rst-ui-divider-soft);
  }
  .chat__day span { color: var(--rst-ui-muted); font-size: var(--rst-fs-micro); font-weight: var(--rst-fw-bold); text-transform: uppercase; }

  .bubble { display: flex; gap: 8px; max-width: 100%; }
  .bubble.is-mine { justify-content: flex-end; }
  .bubble__avatar {
    flex: none;
    align-self: flex-end;
    width: 26px;
    height: 26px;
    display: grid;
    place-items: center;
    border-radius: 50%;
    color: var(--rst-ui-text);
    background: var(--rst-ui-surface-field-strong);
    font-size: var(--rst-fs-micro);
    font-weight: var(--rst-fw-bold);
  }
  .bubble__body {
    min-width: 0;
    max-width: 84%;
    display: grid;
    gap: 4px;
    padding: 9px 11px;
    border: 1px solid var(--rst-ui-line);
    border-radius: 14px 14px 14px 4px;
    background: var(--rst-ui-surface-panel);
  }
  .bubble.is-mine .bubble__body {
    border-color: transparent;
    border-radius: 14px 14px 4px 14px;
    color: var(--rst-on-accent-text);
    background: var(--cl-accent);
  }
  .bubble.is-urgent .bubble__body { border-color: var(--rst-state-danger); }
  .bubble.is-mine.is-urgent .bubble__body {
    border-color: transparent;
    background: var(--rst-state-danger);
  }
  .bubble__sender { color: var(--rst-ui-muted); font-size: var(--rst-fs-caption); font-weight: var(--rst-fw-bold); }
  .bubble__flag {
    justify-self: start;
    padding: 1px 6px;
    border-radius: var(--rst-ui-radius-pill);
    color: var(--rst-state-danger);
    background: var(--rst-ui-surface-panel);
    font-size: var(--rst-fs-micro);
    font-weight: var(--rst-fw-bold);
    text-transform: uppercase;
  }
  .bubble__text { margin: 0; font-size: var(--rst-fs-body); line-height: 1.45; white-space: pre-wrap; overflow-wrap: anywhere; }
  .bubble__meta {
    display: flex;
    flex-wrap: wrap;
    gap: 3px 8px;
    color: var(--rst-ui-muted);
    font-size: var(--rst-fs-micro);
  }
  .bubble.is-mine .bubble__meta { color: color-mix(in srgb, var(--rst-on-accent-text) 78%, transparent); }
  .bubble__confirm {
    justify-self: start;
    margin-top: 2px;
    min-height: 26px;
    padding: 3px 9px;
    border: 1px solid var(--rst-ui-line);
    border-radius: var(--rst-ui-radius-pill);
    color: var(--rst-ui-action);
    background: var(--rst-ui-surface-field);
    font: inherit;
    font-size: var(--rst-fs-caption);
    font-weight: var(--rst-fw-bold);
    cursor: pointer;
  }
  .bubble__confirm:disabled { color: var(--rst-ui-muted); cursor: default; }

  .chat__hint, .chat__empty { color: var(--rst-ui-muted); font-size: var(--rst-fs-label); text-align: center; }
  .chat__hint { margin: 0; padding: 24px 8px; }
  .chat__empty { display: grid; justify-items: center; gap: 5px; padding: 34px 14px; }
  .chat__empty svg { margin-bottom: 3px; color: var(--cl-accent); }
  .chat__empty strong { color: var(--rst-ui-text); font-size: var(--rst-fs-body); }
  .chat__empty span { max-width: 240px; font-size: var(--rst-fs-label); line-height: 1.45; }

  .composer {
    position: relative;
    display: grid;
    gap: 7px;
    padding: 10px 12px 11px;
    border-top: 1px solid var(--rst-ui-divider-soft);
    background: var(--rst-ui-surface-panel);
  }
  .composer__chips { display: flex; flex-wrap: wrap; gap: 5px; }
  .chip {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    min-height: 25px;
    padding: 3px 8px;
    border: 1px solid var(--rst-ui-line);
    border-radius: var(--rst-ui-radius-pill);
    color: var(--rst-ui-muted);
    background: var(--rst-ui-surface-field);
    font: inherit;
    font-size: var(--rst-fs-caption);
    font-weight: var(--rst-fw-medium);
    cursor: pointer;
  }
  .chip:hover { color: var(--rst-ui-text); }
  .chip.is-set { border-color: var(--rst-ui-action); color: var(--rst-ui-action); background: var(--rst-ui-action-soft); }
  .chip.is-urgent { border-color: var(--rst-state-danger); color: var(--rst-state-danger); background: color-mix(in srgb, var(--rst-state-danger) 10%, transparent); }

  .composer__row { display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: end; gap: 7px; }
  .composer__row textarea {
    min-height: 38px;
    max-height: 120px;
    padding: 9px 11px;
    border: 1px solid var(--rst-ui-line);
    border-radius: 18px;
    color: var(--rst-ui-text);
    background: var(--rst-ui-surface-field);
    font: inherit;
    font-size: var(--rst-fs-body);
    line-height: 1.4;
    resize: none;
  }
  .composer__row textarea:focus { border-color: var(--rst-ui-action); outline: none; }
  .composer__send {
    flex: none;
    width: 38px;
    height: 38px;
    display: grid;
    place-items: center;
    border: 0;
    border-radius: 50%;
    color: var(--rst-on-accent-text);
    background: var(--cl-accent);
    cursor: pointer;
    transition: background .16s ease, opacity .16s ease;
  }
  .composer__send:hover:not(:disabled) { background: var(--cl-accent-hover); }
  .composer__send:disabled { opacity: .4; cursor: default; }
  .composer__hint { margin: 0; color: var(--rst-ui-muted); font-size: var(--rst-fs-micro); }

  .composer__people {
    max-height: 214px;
    display: grid;
    align-content: start;
    gap: 6px;
    overflow-y: auto;
    padding: 10px;
    border: 1px solid var(--rst-ui-line);
    border-radius: 12px;
    background: var(--rst-ui-surface-field);
  }
  .composer__everyone {
    display: grid;
    gap: 1px;
    padding: 7px 9px;
    border: 1px solid var(--rst-ui-line);
    border-radius: 8px;
    color: var(--rst-ui-text);
    background: var(--rst-ui-surface-panel);
    font: inherit;
    text-align: left;
    cursor: pointer;
  }
  .composer__everyone.is-active { border-color: var(--rst-ui-action); background: var(--rst-ui-action-soft); }
  .composer__everyone strong { font-size: var(--rst-fs-label); }
  .composer__everyone small { color: var(--rst-ui-muted); font-size: var(--rst-fs-micro); }
  .composer__people > p {
    margin: 2px 0 0;
    color: var(--rst-ui-muted);
    font-size: var(--rst-fs-micro);
    font-weight: var(--rst-fw-bold);
    text-transform: uppercase;
  }
  .composer__list { display: grid; gap: 4px; }
  .composer__list label { display: flex; align-items: center; gap: 7px; font-size: var(--rst-fs-label); cursor: pointer; }
  .composer__list input { accent-color: var(--rst-ui-action); }

  /* On a phone the conversation earns the whole screen. */
  @media (max-width: 520px) {
    .communications-button {
      right: max(14px, env(safe-area-inset-right, 0px));
      bottom: max(14px, env(safe-area-inset-bottom, 0px));
      width: 48px;
      min-height: 48px;
    }
    .chat {
      right: 0;
      left: 0;
      bottom: 0;
      width: auto;
      max-width: none;
      height: min(84dvh, calc(100dvh - 56px));
      border-right: 0;
      border-bottom: 0;
      border-left: 0;
      border-radius: 18px 18px 0 0;
    }
    .bubble__body { max-width: 88%; }
  }
</style>
