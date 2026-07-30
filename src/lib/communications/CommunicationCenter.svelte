<script lang="ts">
  import { page } from '$app/state';
  import Dialog from '$lib/components/Dialog.svelte';
  import type { WorkspaceRole } from '$lib/api/workspace';
  import { i18n, t } from '$lib/i18n/i18n.svelte';
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
  let handledDeepLink = $state('');

  const isManager = $derived(role === 'owner' || role === 'manager');
  const myRecipients = $derived(model?.messageRecipients.filter((row) => row.employee_id === employeeId) ?? []);
  const unreadMessages = $derived(myRecipients.filter((row) => !row.read_at).length);
  const badgeCount = $derived(unreadMessages);
  const messages = $derived(model?.messages ?? []);

  function contextKey() {
    return `${restaurantId ?? ''}|${role ?? ''}|${employeeId ?? ''}`;
  }

  function employeeName(id: string) {
    return model?.employees.find((employee) => employee.id === id)?.display_name ?? t('Employee');
  }

  function formatDate(value: string) {
    return new Intl.DateTimeFormat(i18n.locale, {
      weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC'
    }).format(new Date(`${value}T00:00:00Z`));
  }

  function formatMoment(value: string) {
    return new Intl.DateTimeFormat(i18n.locale, {
      day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit'
    }).format(new Date(value));
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

  // A new message is the only thing that arrives here, so it is the cue.
  function countIncoming(snapshot: CommunicationsReadModel) {
    return snapshot.messages.length;
  }

  // Set while the user's own action (or opening the dialog) is refreshing, so we
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
      // Only chime for something that genuinely just arrived — never on the
      // first load, a workspace switch, or a refresh that changed nothing.
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

  async function sendMessage() {
    if (!restaurantId || !messageBody.trim()) return;
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
      await publishAndRefresh();
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

</script>

<button
  class="communications-button"
  class:has-unread={badgeCount > 0}
  type="button"
  aria-label={t('Team messages')}
  title={t('Team messages')}
  onclick={() => openCenter()}
>
  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <path d="M5 17.5 3.8 21l4-2.1A9.5 9.5 0 1 0 5 17.5Z" />
    <path d="M8 10h8M8 14h5" />
  </svg>
  {#if badgeCount > 0}<b>{badgeCount > 9 ? '9+' : badgeCount}</b>{/if}
</button>

<Dialog
  {open}
  title="Messages"
  description={isManager ? 'Reach the whole team, or just the people who need it.' : 'Updates from your restaurant.'}
  size="large"
  onclose={() => (open = false)}
>
  {#if loading && !model}
    <div class="empty-state">{t('Loading team updates…')}</div>
  {:else}
    <div class="center-stack">
      {#if isManager}
        <section class="composer">
          <header><span>{t('New message')}</span><small>{t('Selected employees receive a phone notification.')}</small></header>
          <textarea rows="3" maxlength="1000" bind:value={messageBody} placeholder={t('What does the team need to know?')}></textarea>
          <div class="composer-options">
            <div class="segmented" aria-label={t('Priority')}>
              <button type="button" class:is-active={messagePriority === 'normal'} onclick={() => (messagePriority = 'normal')}>{t('Normal')}</button>
              <button type="button" class:is-active={messagePriority === 'urgent'} onclick={() => (messagePriority = 'urgent')}>{t('Urgent')}</button>
            </div>
            <label class="check"><input type="checkbox" bind:checked={acknowledgementRequired} /> {t('Ask for confirmation')}</label>
          </div>
          <details class="recipients">
            <summary>
              <span>
                <strong>{t('Recipients')}</strong>
                <small>{selectedRecipients.length ? t('{count} selected', { count: selectedRecipients.length }) : t('Everyone active')}</small>
              </span>
              <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="m9 18 6-6-6-6" /></svg>
            </summary>
            <div>
              <button class="everyone-recipient" class:is-active={!selectedRecipients.length} type="button" onclick={() => (selectedRecipients = [])}>
                <span>{t('Everyone active')}</span>
                <small>{t('Send to the whole restaurant team.')}</small>
              </button>
              <p>{t('Or choose employees')}</p>
              {#each model?.employees ?? [] as employee (employee.id)}
                <label><input type="checkbox" checked={selectedRecipients.includes(employee.id)} onchange={() => selectedRecipients = selectedRecipients.includes(employee.id) ? selectedRecipients.filter((id) => id !== employee.id) : [...selectedRecipients, employee.id]} /> {employee.display_name}</label>
              {/each}
            </div>
          </details>
          <button class="primary" type="button" disabled={busy || !messageBody.trim()} onclick={sendMessage}>{t(busy ? 'Sending…' : 'Send message')}</button>
        </section>
      {/if}

      <section class="feed">
        <header class="feed-head"><strong>{t('Message history')}</strong><span>{messages.length}</span></header>
        {#each messages as message (message.id)}
          {@const receipt = recipientFor(message.id)}
          {@const summary = messageRecipientSummary(message.id)}
          <article class:urgent={message.priority === 'urgent'} class:unread={!isManager && !receipt?.read_at}>
            <div class="message-mark" aria-hidden="true"></div>
            <div class="message-copy">
              <header>
                <strong>{message.priority === 'urgent' ? t('Urgent') : (message.sender_name ?? t('Management'))}</strong>
                <time>{formatMoment(message.created_at)}</time>
              </header>
              <p>{message.body}</p>
              {#if isManager}
                <small>{t('{read} of {total} read', { read: summary.read, total: summary.total })}{#if message.acknowledgement_required}{' · '}{t('{count} confirmed', { count: summary.acknowledged })}{/if}</small>
              {:else if message.acknowledgement_required}
                <button class="confirm-read" type="button" disabled={busy || Boolean(receipt?.acknowledged_at)} onclick={() => acknowledge(message)}>
                  {receipt?.acknowledged_at ? t('Confirmed') : t('Confirm I’ve read this')}
                </button>
              {/if}
            </div>
          </article>
        {:else}
          <div class="empty-state">
            <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><path d="M5 17.5 3.8 21l4-2.1A9.5 9.5 0 1 0 5 17.5Z" /><path d="M8 10h8M8 14h5" /></svg>
            <strong>{t('No messages yet')}</strong>
            <span>{t(isManager ? 'Send an update when the team needs shared context.' : 'Restaurant updates will appear here.')}</span>
          </div>
        {/each}
      </section>
    </div>
  {/if}
</Dialog>

<style>
  /* Operational messages are a persistent workspace tool, not topbar chrome.
     The floating action stays reachable while a manager works through a long
     grid and gives the message centre one predictable home on every module. */
  .communications-button { position: fixed; z-index: var(--rst-z-panel, 200); right: 22px; bottom: max(22px, env(safe-area-inset-bottom, 0px)); width: 52px; min-height: 52px; display: inline-flex; align-items: center; justify-content: center; padding: 0; border: 1px solid color-mix(in srgb, var(--cl-accent) 72%, white); border-radius: 50%; color: white; background: var(--cl-accent); box-shadow: 0 13px 30px rgba(var(--cl-accent-rgb), .28), 0 3px 10px rgba(15, 23, 42, .18); font: inherit; line-height: 1; cursor: pointer; transition: transform .18s var(--cl-ease), background .18s ease, border-color .18s ease, box-shadow .18s ease; }
  .communications-button:hover { border-color: color-mix(in srgb, var(--cl-accent-hover) 72%, white); color: white; background: var(--cl-accent-hover); box-shadow: 0 16px 34px rgba(var(--cl-accent-rgb), .32), 0 4px 12px rgba(15, 23, 42, .2); transform: translateY(-2px); }
  .communications-button:focus-visible { outline: 3px solid rgba(var(--cl-accent-rgb), .24); outline-offset: 3px; }
  .communications-button:active { transform: translateY(0); }
  .communications-button > svg { display: block; }
  .communications-button.has-unread > svg { color: white; }
  .communications-button b { position: absolute; top: -3px; right: -3px; min-width: 19px; height: 19px; display: grid; place-items: center; padding: 0 4px; border: 2px solid var(--cl-bg); border-radius: var(--rst-ui-radius-pill); color: white; background: var(--rst-state-danger); font-size: 9px; font-weight: 800; animation: rst-pop-in .32s var(--rst-ease-spring) backwards; }
  .center-stack { display: grid; gap: 16px; }
  .composer { display: grid; gap: 11px; padding: 14px; border: 1px solid var(--rst-ui-line); border-radius: var(--rst-ui-radius-lg); background: var(--rst-ui-surface-field); }
  .composer header { display: grid; gap: 2px; }
  .composer header span { font-size: 14px; font-weight: 800; }
  .composer header small, .feed small { color: var(--rst-ui-muted); font-size: 10px; }
  textarea, input { min-height: 38px; padding: 9px 10px; border: 1px solid var(--rst-ui-line); border-radius: var(--rst-ui-radius-md); color: var(--rst-ui-text); background: var(--rst-ui-surface-panel); font: inherit; }
  textarea { resize: vertical; }
  .composer-options { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
  .segmented { display: inline-flex; padding: 3px; border: 1px solid var(--rst-ui-line); border-radius: var(--rst-ui-radius-md); background: var(--rst-ui-surface-panel); }
  .segmented button { min-height: 29px; padding: 4px 9px; border: 0; border-radius: 5px; color: var(--rst-ui-muted); background: transparent; font: inherit; font-size: 11px; font-weight: 700; cursor: pointer; }
  .segmented button.is-active { color: var(--rst-ui-text); background: var(--rst-ui-hover-bg); }
  .check, .recipients label { display: flex; align-items: center; gap: 6px; font-size: 11px; }
  .check input, .recipients input { min-height: auto; accent-color: var(--rst-ui-action); }
  .recipients {
    overflow: hidden;
    border: 1px solid var(--rst-ui-line);
    border-radius: var(--rst-ui-radius-md);
    background: var(--rst-ui-surface-panel);
  }
  .recipients summary {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    padding: 9px 10px;
    color: var(--rst-ui-muted);
    font-size: 11px;
    cursor: pointer;
    list-style: none;
  }
  .recipients summary::-webkit-details-marker { display: none; }
  .recipients summary > span { display: grid; gap: 1px; }
  .recipients summary strong { color: var(--rst-ui-text); font-size: 11px; }
  .recipients summary svg { transition: transform .16s ease; }
  .recipients[open] summary svg { transform: rotate(90deg); }
  .recipients > div { max-height: 190px; display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 7px; overflow: auto; padding: 9px 10px 10px; border-top: 1px solid var(--rst-ui-divider-soft); }
  .recipients > div > p { grid-column: 1 / -1; margin: 3px 0 0; color: var(--rst-ui-muted); font-size: 9px; font-weight: var(--rst-fw-bold); text-transform: uppercase; }
  .everyone-recipient {
    grid-column: 1 / -1;
    display: grid;
    gap: 1px;
    padding: 8px 9px;
    border: 1px solid var(--rst-ui-line);
    border-radius: 6px;
    color: var(--rst-ui-text);
    background: transparent;
    font: inherit;
    text-align: left;
    cursor: pointer;
  }
  .everyone-recipient.is-active { border-color: var(--rst-ui-action); background: var(--rst-ui-action-soft); }
  .everyone-recipient span { font-size: 11px; font-weight: var(--rst-fw-bold); }
  .everyone-recipient small { color: var(--rst-ui-muted); font-size: 9px; }
  button.primary { border-color: var(--rst-ui-action); color: var(--rst-on-accent-text); background: var(--rst-ui-action); }
  .composer > .primary { min-height: 38px; justify-self: end; padding: 7px 14px; border-radius: var(--rst-ui-radius-md); font: inherit; font-size: 12px; font-weight: 750; cursor: pointer; }
  button:disabled { opacity: .5; cursor: default; }
  .feed { display: grid; border-top: 1px solid var(--rst-ui-divider-soft); }
  .feed-head { min-height: 40px; display: flex; align-items: center; justify-content: space-between; gap: 10px; padding: 0 4px; border-bottom: 1px solid var(--rst-ui-divider-soft); }
  .feed-head strong { font-size: 11px; text-transform: uppercase; }
  .feed-head span { min-width: 20px; height: 20px; display: grid; place-items: center; border-radius: 10px; color: var(--rst-ui-muted); background: var(--rst-ui-surface-field-strong); font-size: 9px; }
  .feed article { position: relative; display: grid; grid-template-columns: 4px minmax(0, 1fr); gap: 11px; padding: 14px 4px; border-bottom: 1px solid var(--rst-ui-divider-soft); }
  .message-mark { width: 3px; border-radius: 2px; background: var(--rst-ui-line); }
  .feed article.unread .message-mark { background: var(--rst-ui-action); }
  .feed article.urgent .message-mark { background: var(--rst-state-danger); }
  .message-copy { min-width: 0; display: grid; gap: 6px; }
  .message-copy header { display: flex; justify-content: space-between; gap: 10px; }
  .message-copy strong { font-size: 12px; }
  .message-copy time { color: var(--rst-ui-muted); font-size: 10px; }
  .message-copy p { margin: 0; font-size: 13px; line-height: 1.45; white-space: pre-wrap; }
  .confirm-read { justify-self: start; min-height: 30px; padding: 4px 9px; border: 1px solid var(--rst-ui-line); border-radius: var(--rst-ui-radius-md); color: var(--rst-ui-action); background: transparent; font: inherit; font-size: 10px; font-weight: 750; cursor: pointer; }
  .empty-state { display: grid; justify-items: center; gap: 5px; padding: 30px 16px; color: var(--rst-ui-muted); text-align: center; font-size: 12px; }
  .empty-state svg { margin-bottom: 3px; color: var(--rst-ui-action); }
  .empty-state strong { color: var(--rst-ui-text); font-size: 13px; }
  .empty-state span { max-width: 270px; font-size: 11px; line-height: 1.45; }
  @media (max-width: 520px) {
    .communications-button {
      right: max(14px, env(safe-area-inset-right, 0px));
      bottom: max(14px, env(safe-area-inset-bottom, 0px));
      width: 48px;
      min-height: 48px;
    }
    .composer-options { align-items: stretch; flex-direction: column; }
    .recipients > div { grid-template-columns: 1fr; }
  }
</style>
