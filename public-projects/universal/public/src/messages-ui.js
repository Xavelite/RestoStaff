import { openPopover, closePopover } from './surfaces.js';
import { icon } from './icons.js';
import { escapeHTML as esc } from './model.js';
import { feedPreferences, setFeedPreferences, messagesBetween, unreadMessages, markConversationRead, sendMessage, attachmentVisible } from './network.js';
import { attachmentChoices, attachmentHTML, encodeAttachment, decodeAttachment, relativeTime } from './social-content.js';

export function createMessagesUI(ctx, { action, avatar, name, profileChip, top }) {
  const data = () => ctx.data(), me = () => data().activeUser;
  let selected = null, query = '', pickerQuery = '', draft = '', attachment = null, scrollToEnd = true;
  const drafts = new Map();
  const emojis=[['😊','Smile'],['❤️','Heart'],['😂','Laugh'],['🙌','Celebrate'],['👍','Thumbs up'],['🎵','Music'],['✨','Sparkles'],['🔥','Fire'],['😍','Love it'],['🤔','Thinking'],['👋','Wave'],['🎉','Party'],['🙏','Thanks'],['😎','Cool'],['🌍','World'],['☕','Coffee']];
  let dockOpen = false, minimized = false, returnPage = 'space', timelineTop = 0, sending = false;
  const key = () => `${me()}:${selected}`;
  const blocked = id => feedPreferences(data(), me()).blocked.includes(id) || feedPreferences(data(), id).blocked.includes(me());
  function remember() { if (selected) drafts.set(key(), { text: draft, attachment }); }
  async function open(id, share = null) {
    if (!data().profiles[id] || id === me()) return;
    remember(); selected = id; query = '';
    draft = drafts.get(key())?.text || ''; attachment = share || drafts.get(key())?.attachment || null;
    dockOpen = true; minimized = false; ctx.ui().mobile = false; scrollToEnd = true;
    markConversationRead(data(), me(), id); await ctx.persist(); ctx.closeModal(); closePopover(); ctx.render();
    document.querySelector('#message-text')?.focus();
  }
  function contactsHTML({compact=false,term=query}={}) {
    let people = Object.keys(data().profiles).filter(id => id !== me() && name(id).toLowerCase().includes(term.toLowerCase()));
    people.sort((a,b) => (messagesBetween(data(), me(), b).at(-1)?.createdAt || 0) - (messagesBetween(data(), me(), a).at(-1)?.createdAt || 0));
    if(compact && !term.trim()) { const recent=people.filter(id=>messagesBetween(data(),me(),id).length||id===selected);people=(recent.length?recent:people).slice(0,recent.length?5:3); }
    return people.map(id => {
      const last = messagesBetween(data(), me(), id).at(-1), count = unreadMessages(data(), me(), id);
      return `<button class="message-contact ${selected === id ? 'selected' : ''}" data-social="message-open" data-owner="${id}" aria-label="Chat with ${esc(name(id))}${count ? `, ${count} unread` : ''}" ${selected === id ? 'aria-current="true"' : ''}>${avatar(id)}<span><strong>${esc(name(id))}</strong><small>${blocked(id) ? 'Messaging blocked' : last ? `${last.from === me() ? 'You: ' : ''}${esc(last.text || 'Shared an attachment')}` : 'Start a conversation'}</small></span><span class="contact-meta">${last ? `<time>${relativeTime(last.createdAt)}</time>` : ''}${count ? `<b>${count}</b>` : ''}</span></button>`;
    }).join('') || '<p class="form-hint">No people by that name.</p>';
  }
  function bubblesHTML() {
    const list = selected ? messagesBetween(data(), me(), selected) : [];
    let day = '';
    const bubbles = list.map(m => {
      const nextDay = new Intl.DateTimeFormat('en-GB', { day:'numeric', month:'long' }).format(m.createdAt);
      const divider = day !== nextDay ? `<div class="message-day">${nextDay}</div>` : ''; day = nextDay;
      return `${divider}<div class="message-row ${m.from===me()?'mine':''}">${m.from!==me()?avatar(m.from):''}<article class="message-bubble ${m.from === me() ? 'mine' : ''}">${m.text ? `<p>${esc(m.text)}</p>` : ''}${attachmentHTML(ctx, m.attachment, me())}<div><time>${new Intl.DateTimeFormat('en-GB', { hour:'2-digit', minute:'2-digit' }).format(m.createdAt)}</time>${m.from === me() ? `<span>${m.read ? 'Read' : 'Sent'}</span>` : ''}${m.demo ? '<span>Demo message</span>' : ''}</div></article></div>`;
    }).join('');
    return bubbles;
  }
  function threadHTML() {
    const bubbles = bubblesHTML();
    return `<section class="message-thread" aria-label="${selected ? 'Conversation with ' + esc(name(selected)) : 'Choose a conversation'}">${selected ? `<header class="thread-header">${action('message-back', icon('chevron'), 'aria-label="Back to conversations"', 'icon-btn message-back')}${profileChip(selected)}<span>Demo profile</span>${action('message-menu', icon('more'), 'aria-label="Conversation options"', 'icon-btn')}${ctx.ui().page === 'messages' ? action('message-popout', icon('minimize'), 'aria-label="Pop out conversation" title="Keep chatting while browsing"', 'icon-btn') : `${action('message-expand', icon('expand'), 'aria-label="Open full inbox" title="Open full inbox"', 'icon-btn')}${action('message-minimize', icon('down'), 'aria-label="Minimize conversation"', 'icon-btn')}${action('message-close', icon('close'), 'aria-label="Close conversation"', 'icon-btn')}`}</header><div class="message-timeline" id="message-timeline" role="log" aria-label="Messages" aria-live="polite">${bubbles || `<div class="thread-start">${avatar(selected, 'large')}<h2>Say hello to ${esc(name(selected).split(' ')[0])}.</h2><p>A thought, a song, a small discovery.<br>It starts with a message.</p></div>`}</div><div class="chat-demo-hint">Switch demo profiles to reply. Conversations stay in this browser.</div>${blocked(selected) ? `<div class="message-blocked">${icon('lock')}Messaging is blocked.${feedPreferences(data(), me()).blocked.includes(selected) ? action('message-unblock','Unblock', '', 'text-btn') : ''}</div>` : `<form id="social-message-form"><div id="message-draft-attachment">${attachment ? `<div class="message-attachment-preview">${attachmentHTML(ctx, attachment, me())}${action('message-remove-attachment', icon('close'), 'aria-label="Remove attachment"', 'icon-btn')}</div>` : ''}</div><div class="message-compose">${action('message-attach', icon('plus'), 'aria-label="Attach a shared card or collection" title="Attach a card or collection"', 'icon-btn')}<label class="sr-only" for="message-text">Your message</label><textarea id="message-text" name="message" rows="1" maxlength="3000" placeholder="Write a message…">${esc(draft)}</textarea>${action("message-emoji",icon("smile"),'aria-label="Add an emoji" title="Add an emoji"',"icon-btn emoji-trigger")}<button type="submit" class="primary message-send" aria-label="Send message" title="Send message · Enter" ${!draft.trim() && !attachment || sending ? "disabled" : ""}>${icon('send')}</button></div><p class="social-form-error" role="alert"></p></form>`}` : `<div class="thread-empty"><span>${icon('comment')}</span><h2>A place for your people.</h2><p>Choose someone on the left, or start a conversation.<br>A useful find is a lovely way to say hello.</p>${action('message-new','Start a conversation ' + icon('plus'), '', 'primary')}</div>`}</section>`;
  }
  function render() {
    return `${top()}<section class="messages-heading"><div><span class="eyebrow">A LITTLE CLOSER</span><h1>Conversations.</h1><p>Good discoveries are even better together.</p></div><span class="local-demo-label">${icon('users')}Local demo</span></section><div class="messages-shell ${selected ? 'has-conversation' : ''}"><aside class="messages-inbox"><div class="inbox-heading"><h2>Messages <span>${unreadMessages(data(), me()) || ''}</span></h2>${action('message-new', icon('edit'), 'aria-label="New conversation"', 'icon-btn')}</div><label class="inbox-search">${icon('search')}<input id="message-search" aria-label="Search conversations" placeholder="Find someone…" value="${esc(query)}"></label><div id="message-contacts">${contactsHTML()}</div><div class="inbox-note">${icon('lock')}Messages are visible to the two participants in this demo.</div></aside>${threadHTML()}</div>`;
  }
  function launcher() {
    const unread = unreadMessages(data(), me());
    return action('message-inbox', icon('chat') + (unread ? `<b>${unread}</b>` : ''), `aria-label="Messages${unread ? ', ' + unread + ' unread' : ''}" aria-haspopup="dialog" aria-expanded="false" title="Messages"`, 'chat-launcher');
  }
  function dock() {
    if (!selected || !dockOpen || ctx.ui().page === 'messages') return launcher();
    if (minimized) return launcher() + `<aside class="chat-dock minimized" aria-label="Minimized chat">${action('message-restore', avatar(selected) + '<span>' + esc(name(selected)) + '</span>' + icon('chevron'), 'aria-label="Restore conversation with '+esc(name(selected))+'"', 'chat-restore')}${action('message-close', icon('close'), 'aria-label="Close conversation"', 'icon-btn')}</aside>`;
    return launcher() + `<aside class="chat-dock" aria-label="Chat with ${esc(name(selected))}">${threadHTML()}</aside>`;
  }
  function inbox(trigger) {
    pickerQuery='';
    openPopover(trigger, 'Messages', `<div class="message-picker-search"><label>${icon('search')}<input id="quick-message-search" aria-label="Find a person to message" placeholder="Find a person…" autocomplete="off"></label>${action('message-find-person',icon('edit'),'aria-label="New message" title="New message"','icon-btn')}</div><p class="message-picker-label" id="message-picker-label">${data().messages.some(m=>m.from===me()||m.to===me())?'Recent conversations':'Say hello'}</p><div class="inbox-popover-contacts" id="message-picker-contacts">${contactsHTML({compact:true,term:pickerQuery})}</div>${action('message-expand', 'Open full inbox ' + icon('expand'), '', 'popover-footer')}`, 'messages-popover');
  }
  function choosePerson(share = null) {
    ctx.modal(share ? 'Send a discovery.' : 'Start a conversation.', 'Choose a demo person. They can reply when you switch profiles.', `<div class="message-person-picker">${Object.keys(data().profiles).filter(id => id !== me() && !blocked(id)).map(id => {
      const allowed = !share || attachmentVisible(data(), share, id);
      return action('message-recipient', `${avatar(id)}<span><strong>${esc(name(id))}</strong><small>${allowed ? 'Open conversation' : 'Cannot access this attachment'}</small></span>${icon('arrow')}`, `data-owner="${id}" data-attachment="${esc(encodeAttachment(share))}" ${!allowed ? 'disabled' : ''}`, 'message-person');
    }).join('')}</div>${share ? '<p class="form-hint">Only people who can already access this attachment can receive it.</p>' : ''}`);
  }
  function chooseAttachment() {
    const items = [...attachmentChoices(data(), me(), 'card', selected), ...attachmentChoices(data(), me(), 'collection', selected)];
    ctx.modal('Send something worth keeping.', `Only cards and collections ${name(selected)} can access are listed.`, `<form id="social-message-attachment"><label class="field">Shared card or collection<select name="attachment" required aria-label="Chat attachment"><option value="">Choose an attachment…</option>${items.map(item => `<option value="${esc(encodeAttachment(item))}">${item.kind === 'collection' ? 'Collection · ' : ''}${esc(item.title)} · ${esc(name(item.owner))}</option>`).join('')}</select></label><p class="social-form-error" role="alert"></p></form>`, '<button class="secondary" data-action="close-dialog">Cancel</button><button class="primary" type="submit" form="social-message-attachment">Attach</button>');
  }
  async function click(el) {
    const act = el.dataset.social;
    if (!act.startsWith('message-')) return false;
    if(act==='message-emoji') {openPopover(el,'A little expression', '<div class="emoji-grid">'+emojis.map(([emoji,label])=>action('message-insert-emoji',emoji,'data-emoji="'+emoji+'" aria-label="'+label+'" title="'+label+'"','emoji-choice')).join('')+'</div>','emoji-popover');return true;}
    if(act==='message-insert-emoji') {const field=document.querySelector('#message-text');if(field){const start=field.selectionStart,end=field.selectionEnd;const value=field.value.slice(0,start)+el.dataset.emoji+field.value.slice(end);if(value.length<=3000){field.value=value;input(field);closePopover();field.focus();field.setSelectionRange(start+el.dataset.emoji.length,start+el.dataset.emoji.length);}}return true;}
    if (act === 'message-find-person') { document.querySelector('#quick-message-search')?.focus();return true; }
    if (act === 'message-inbox') { inbox(el); return true; }
    if (act === 'message-minimize' || act === 'message-restore') { minimized = act === 'message-minimize'; scrollToEnd = true; ctx.render(); return true; }
    if (act === 'message-close') { remember(); dockOpen = false; ctx.render(); return true; }
    if (act === 'message-expand') { remember(); if (ctx.ui().page !== 'messages') returnPage = ctx.ui().page; ctx.ui().page = 'messages'; scrollToEnd = true; closePopover(); ctx.render(); window.scrollTo(0,0); return true; }
    if (act === 'message-popout') { ctx.ui().page = returnPage; dockOpen = true; minimized = false; scrollToEnd = true; ctx.render(); return true; }
    if (act === 'message-open') { await open(el.dataset.owner); return true; }
    if (act === 'message-recipient') { await open(el.dataset.owner, decodeAttachment(el.dataset.attachment)); return true; }
    if (act === 'message-new') { choosePerson(); return true; }
    if (act === 'message-share') { choosePerson(decodeAttachment(el.dataset.attachment) || { kind:'card', owner:el.dataset.owner, id:el.dataset.cardId }); return true; }
    if (act === 'message-back') { remember(); selected = null; ctx.render(); return true; }
    if (act === 'message-attach') { chooseAttachment(); return true; }
    if (act === 'message-remove-attachment') { attachment = null; remember(); ctx.render(); return true; }
    if (act === 'message-menu') { openPopover(el, name(selected), `<div class="menu-list">${action('profile', icon('users') + 'Visit profile', `data-owner="${selected}"`, '')}${action(blocked(selected) ? 'message-unblock' : 'message-block', icon('lock') + (blocked(selected) ? 'Unblock messages' : 'Block this person'), '', '')}</div><p class="form-hint">Blocking stops messages in both directions and hides each other’s posts. You can unblock here.</p>`); return true; }
    if (act === 'message-block' || act === 'message-unblock') {
      const prefs = feedPreferences(data(), me());
      setFeedPreferences(data(), me(), { blocked: act === 'message-block' ? [...prefs.blocked, selected] : prefs.blocked.filter(id => id !== selected) });
      await ctx.persist(); ctx.closeModal(); ctx.render(); return true;
    }
    return false;
  }
  async function submit(form) {
    if (form.id === 'social-message-form') {
      if (sending || (!form.elements.message.value.trim() && !attachment)) return true;
      sending = true;
      try {
      sendMessage(data(), me(), selected, form.elements.message.value, attachment);
      draft = ''; attachment = null; remember(); scrollToEnd = true;
      await ctx.persist(); ctx.render(); document.querySelector('#message-text')?.focus(); return true;
      } finally { sending = false; }
    }
    if (form.id === 'social-message-attachment') { attachment = decodeAttachment(form.elements.attachment.value); remember(); ctx.closeModal(); ctx.render(); document.querySelector('#message-text')?.focus(); return true; }
    return false;
  }
  function input(el) {
    if(el.id==='quick-message-search') { pickerQuery=el.value;document.querySelector('#message-picker-contacts').innerHTML=contactsHTML({compact:true,term:pickerQuery});document.querySelector('#message-picker-label').textContent=pickerQuery.trim()?'People':'Recent conversations'; }
    if (el.id === 'message-search') { query = el.value; document.querySelector('#message-contacts').innerHTML = contactsHTML(); }
    if (el.id === 'message-text') { draft = el.value; remember(); const send = el.form?.querySelector('.message-send'); if (send) send.disabled = sending || (!draft.trim() && !attachment); }
  }
  function beforeRender() { const timeline = document.querySelector('#message-timeline'); if (timeline) timelineTop = timeline.scrollTop; }
  function hydrate() { const timeline = document.querySelector('#message-timeline'); if (timeline) { timeline.scrollTop = scrollToEnd ? timeline.scrollHeight : timelineTop; scrollToEnd = false; } }
  function reset() { dockOpen = false; minimized = false; returnPage = 'space'; remember(); selected = null; query = ''; draft = ''; attachment = null; scrollToEnd = true; }
  return { render, dock, beforeRender, click, submit, input, hydrate, reset };
}
