import { escapeHTML as esc } from './model.js';
import { icon } from './icons.js';
import { getCard, resourceKey, publicEntries, effectiveAudience, engagement, addComment } from './social.js';
import { closePopover } from './surfaces.js';

// Discussions belong to the resource, but open in the place where it was found.
export function createCardComments(ctx, { viewer, avatar, name, drafts, showDetail }) {
  let current = null, returnTo = null;
  const data = () => ctx.data();
  const me = () => data().activeUser;
  const panel = () => document.getElementById('card-conversation');
  const button = (act, label, extra = '', cls = 'text-btn') => `<button type="button" class="${cls}" data-social="card-comments-${act}" ${extra}>${label}</button>`;
  const candidates = () => current ? [...document.querySelectorAll('#app [data-social="comments"]')].filter(el => el.dataset.owner === current.owner && el.dataset.cardId === current.id) : [];
  const place = el => {
    const section = el?.closest('.collection-section');
    return section?.dataset.section || section?.id || '';
  };
  function context() {
    const card = getCard(data(), current.owner, current.id, viewer());
    const isPublic = publicEntries(data()).has(resourceKey(card, current.owner));
    const audience = effectiveAudience(data().spaces[current.owner], card);
    if (!isPublic) current.scope = 'card';
    const stats = engagement(data(), current.owner, card, viewer(), current.scope);
    const canComment = viewer() === me() && (current.scope === 'community' ? isPublic : audience !== 'private');
    return { card, isPublic, audience, stats, canComment };
  }
  function capture() {
    const field = panel()?.querySelector('textarea');
    if (field) drafts.set(field.dataset.target, field.value);
    if (current && panel()) current.scroll = panel().querySelector('.inline-comment-list')?.scrollTop || 0;
  }
  function close(restore = false) {
    capture();
    candidates().forEach(el => { el.setAttribute('aria-expanded', 'false'); el.removeAttribute('aria-controls'); el.closest('.card,.search-result')?.classList.remove('conversation-selected'); });
    panel()?.remove();
    collapseCard();
    const target = returnTo?.isConnected ? returnTo : candidates().find(el => place(el) === current?.place) || candidates()[0];
    current = null; returnTo = null;
    if (restore) target?.focus({ preventScroll: true });
  }
  function collapseCard() {
    const card = document.querySelector('.card.comments-expanded');
    if (!card) return;
    const preview = card.querySelector(':scope > .card-comments-preview');
    if (preview) preview.replaceWith(...preview.childNodes);
    card.classList.remove('comments-expanded');
    card.style.removeProperty('--conversation-preview-height');
    card.style.removeProperty('--conversation-preview-padding');
  }
  function commentHTML(comment, canComment) {
    const time = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short' }).format(comment.createdAt);
    return `<article class="comment-row">${avatar(comment.userId)}<div><div class="comment-byline"><strong>${esc(name(comment.userId))}</strong><time>${time}</time>${canComment ? button('reply', 'Reply', `data-id="${esc(comment.id)}"`, 'comment-reply-button') : ''}</div><p>${esc(comment.text)}</p></div></article>`;
  }
  function markup() {
    const { card, audience, stats, canComment } = context();
    const shared = current.scope === 'community';
    const reply = stats.comments.find(c => c.id === current.reply);
    const scopeLabel = shared ? 'Public comments' : audience === 'private' ? 'Private card' : audience === 'friends' ? `Friends of ${name(current.owner)}` : 'Comments on this card';
    const latest = [...stats.comments].sort((a,b) => b.createdAt-a.createdAt)[0];
    const audienceLabel = shared ? 'Public' : audience === 'friends' ? 'Friends' : audience === 'private' ? 'Private' : 'This card';
    return `<header class="inline-discussion-header"><h3 id="card-conversation-title">${latest?'Latest comment':'Comments'} <span>${stats.comments.length}</span></h3><span class="inline-discussion-audience" title="${esc(scopeLabel)}" aria-label="${esc(scopeLabel)}">${icon(shared?'globe':audience==='friends'?'users':audience==='private'?'lock':'comment')}<span>${audienceLabel}</span></span><button type="button" class="icon-btn inline-card-details" data-social="detail" data-owner="${esc(current.owner)}" data-card-id="${esc(current.id)}" aria-label="Open full card: ${esc(card.title)}" title="View all comments and card details">${icon('expand')}</button>${button('close', icon('close'), 'aria-label="Close comments"', 'icon-btn')}</header>
      <div class="inline-comment-list">${latest ? commentHTML(latest,canComment) : `<div class="comments-empty"><p>${canComment ? 'Be the first to share a thought.' : 'No comments yet.'}</p></div>`}</div>
      ${canComment ? `<form id="social-inline-comment-form" class="inline-comment-form">${reply ? `<div class="replying-to">Replying to ${esc(name(reply.userId))}${button('cancel-reply', icon('close'), 'aria-label="Cancel reply"', 'icon-btn')}</div>` : ''}<label class="sr-only" for="inline-comment-text">Add a comment on ${esc(card.title)}</label><div class="inline-comment-compose"><textarea id="inline-comment-text" data-target="${esc(current.user + ':' + stats.target)}" name="comment" rows="1" maxlength="1500" required placeholder="${shared?'Comment publicly…':'Write a comment…'}" title="Enter to post · Shift+Enter for a new line">${esc(drafts.get(current.user + ':' + stats.target) || '')}</textarea><button type="submit" class="primary" aria-label="Post comment" title="Post comment">${icon('send')}</button></div><p class="social-form-error" role="alert"></p></form>` : `<p class="inline-discussion-private">${viewer() !== me() ? 'Previewing another person’s view.' : 'Share this card to invite comments.'}</p>`}`;
  }
  function anchorFor(trigger) {
    const matching = candidates();
    return (trigger?.isConnected && trigger.closest('.card,.search-result') ? trigger : null) || (returnTo?.isConnected ? returnTo : null) || matching.find(el => place(el) === current.place && el.getClientRects().length && !el.closest('#instant-results')) || matching.find(el => el.getClientRects().length && !el.closest('#instant-results'));
  }
  function insert(node, anchor) {
    const card = anchor.closest('.card');
    if (!card) { anchor.closest('.search-result')?.append(node); return; }
    if (!card.classList.contains('comments-expanded')) {
      const rect = card.getBoundingClientRect(), style = getComputedStyle(card);
      card.style.setProperty('--conversation-preview-height',`${rect.height-parseFloat(style.borderTopWidth)-parseFloat(style.borderBottomWidth)}px`);
      card.style.setProperty('--conversation-preview-padding',style.padding);
      const preview = document.createElement('div');
      preview.className = 'card-comments-preview';
      preview.append(...card.childNodes); card.append(preview);
      card.classList.add('comments-expanded');
    }
    card.append(node);
  }
  function mount(trigger, reveal = false) {
    if (!current) return;
    if (current.user !== me() || current.page !== ctx.ui().page || current.collection !== ctx.ui().collection) { close(); return; }
    const anchor = anchorFor(trigger);
    if (!anchor) { close(); return; }
    const wasFocused = panel()?.contains(document.activeElement);
    const selection = wasFocused && document.activeElement.matches('textarea') ? [document.activeElement.selectionStart, document.activeElement.selectionEnd] : null;
    capture();
    let body;
    try { body = markup(); } catch { close(); return; }
    panel()?.remove();
    const node = document.createElement('section');
    node.id = 'card-conversation'; node.className = 'inline-card-discussion';
    node.setAttribute('role', 'region'); node.setAttribute('aria-labelledby', 'card-conversation-title');
    node.innerHTML = body;
    insert(node, anchor);
    if (!node.isConnected) { close(); return; }
    candidates().forEach(el => { const selected=el===anchor; el.setAttribute('aria-expanded', String(selected)); if(selected){el.setAttribute('aria-controls', node.id);el.closest('.card,.search-result')?.classList.add('conversation-selected');} });
    if (anchor) returnTo = anchor;
    const list = node.querySelector('.inline-comment-list');
    list.scrollTop = current.scroll ?? list.scrollHeight;
    if (reveal || wasFocused) {
      if (reveal) node.scrollIntoView({block:'nearest',behavior:'instant'});
      (node.querySelector('textarea') || node.querySelector('[data-social="card-comments-close"]'))?.focus({ preventScroll: true });
      if (selection) node.querySelector('textarea')?.setSelectionRange(...selection);
    }
  }
  async function click(el) {
    const act = el.dataset.social;
    if (act === 'comments') {
      if (current?.owner === el.dataset.owner && current?.id === el.dataset.cardId && place(el) === current.place && panel()) { close(true); return true; }
      close(); ctx.closeModal(); closePopover();
      const card = getCard(data(), el.dataset.owner, el.dataset.cardId, viewer());
      current = { owner: el.dataset.owner, id: el.dataset.cardId, scope: publicEntries(data()).has(resourceKey(card, el.dataset.owner)) ? 'community' : 'card', place: place(el), user: me(), page: ctx.ui().page, collection: ctx.ui().collection, fallback: !el.closest('.card,.search-result') };
      if (!anchorFor(el)) { showDetail(current.owner,current.id,current.scope); return true; }
      returnTo = el; mount(el, true); return true;
    }
    if (!act?.startsWith('card-comments-') || !current) return false;
    capture();
    if (act === 'card-comments-close') { close(true); return true; }
    if (act === 'card-comments-scope') { current.scope = el.dataset.value; current.reply = null; current.scroll = 0; mount(null, true); }
    if (act === 'card-comments-reply' || act === 'card-comments-cancel-reply') { current.reply = act.endsWith('cancel-reply') ? null : el.dataset.id; mount(null, true); }
    if (act === 'card-comments-delete') {
      const { stats } = context();
      const comment = stats.comments.find(c => c.id === el.dataset.id && c.userId === me());
      if (!comment || viewer() !== me()) return true;
      data().comments = data().comments.filter(c => c.id !== comment.id);
      data().comments.forEach(c => { if (c.replyTo === comment.id) delete c.replyTo; });
      if (current.reply === comment.id) current.reply = null;
      await ctx.persist(); ctx.render();
    }
    return true;
  }
  async function submit(form) {
    if (form.id !== 'social-inline-comment-form' || !current) return false;
    const { canComment } = context();
    if (!canComment) throw Error('This conversation is not available for commenting.');
    const comment = addComment(data(), me(), current.owner, current.id, current.scope, form.elements.comment.value, current.reply);
    form.elements.comment.value = ''; drafts.delete(current.user + ':' + comment.target); current.reply = null;
    await ctx.persist(); ctx.render();
    const list = panel()?.querySelector('.inline-comment-list');
    if (list) list.scrollTop = list.scrollHeight;
    panel()?.querySelector('textarea')?.focus({ preventScroll: true });
    return true;
  }
  document.addEventListener('keydown', event => {
    if (event.target.id === 'inline-comment-text' && event.key === 'Enter' && !event.shiftKey && !event.isComposing) { event.preventDefault(); event.target.form?.requestSubmit(); }
    if (event.key === 'Escape' && panel() && !document.querySelector('#dialog')?.open) { event.preventDefault(); event.stopPropagation(); close(true); }
  });
  document.addEventListener('dragstart', () => { if (current) close(); });
  window.addEventListener('resize', () => { if (current) close(); });
  function change(el) { if(el.id==='inline-comment-scope'&&current){capture();current.scope=el.value;current.reply=null;current.scroll=0;mount(null,true);} }
  return { click, submit, close, capture, change, hydrate: () => { if (current) mount(); }, input: el => { if (el.id === 'inline-comment-text') drafts.set(el.dataset.target, el.value); } };
}
