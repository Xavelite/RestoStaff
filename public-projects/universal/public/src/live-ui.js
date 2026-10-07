import { inCollection } from "./classification.js";
import { icon } from './icons.js';
import { escapeHTML as esc } from './model.js';
import { visibleCollections, canViewCard, resourceKey } from './social.js';
import { liveSource, liveCards, subscription, followCollection, pauseCollection, copyCollection, suggestCard, reviewSuggestion } from './live-collections.js';
import { attachmentChoices, encodeAttachment, decodeAttachment } from './social-content.js';

export function createLiveUI(ctx, { action, name, profileChip, top, sharedCard, collectionTile }) {
  const data = () => ctx.data(), me = () => data().activeUser;
  let selected = null;
  const refAttrs = () => `data-owner="${esc(selected.owner)}" data-id="${esc(selected.id)}"`;
  function navigation() {
    return data().collectionFollows.filter(f => f.userId === me()).map(f => {
      const collection = data().spaces[f.owner]?.collections.find(c => c.id === f.collectionId);
      const visible = visibleCollections(data(), f.owner, me()).some(c => c.id === f.collectionId);
      if (!collection) return '';
      let fresh=0;if(visible)try{fresh=liveCards(data(),me(),f.owner,f.collectionId).filter(c=>!(f.seen||[]).includes(resourceKey(c,f.owner))).length;}catch{}
      return action('collection', `<span class="collection-dot live-dot"></span><span class="collection-mini" aria-hidden="true">${icon(collection.icon || "collection")}</span><span class="nav-title">${esc(visible ? collection.name : 'Unavailable collection')}</span>${fresh?`<span class="nav-new-count">${fresh} new</span>`:icon(f.paused ? 'pause' : 'repeat')}`, `data-owner="${esc(f.owner)}" data-id="${esc(f.collectionId)}" title="${esc(visible ? collection.name : 'Unavailable collection')} · ${f.paused ? 'Updates paused' : 'Live collection'}"`, `nav-item collection-nav live-nav tint-${collection.color} ${ctx.ui().page === 'live' && selected?.owner === f.owner && selected?.id === f.collectionId ? 'active' : ''}`);
    }).join('');
  }
  function render() {
    if (!selected) {
      const choices = Object.entries(data().spaces).flatMap(([owner]) => visibleCollections(data(), owner, me()).filter(c => c.visibility === 'public').map(collection => ({ owner, collection })));
      return `${top()}<section class="live-heading"><span class="eyebrow">GOOD COLLECTIONS KEEP GROWING</span><h1>Follow a curiosity.</h1><p>A collection can be a living thing. Follow a person or the community library, or make a private copy.</p></section><div class="live-explainer"><span>${icon('repeat')}<strong>Follow</strong>New finds appear automatically.</span><span>${icon('collection')}<strong>Copy</strong>Your own private, editable collection.</span><span>${icon('users')}<strong>Suggest</strong>Help organize public resources.</span></div><div class="discovery-collections live-directory">${choices.sort((a,b) => Number(b.collection.id === 'alex-rock-club') - Number(a.collection.id === 'alex-rock-club')).map(({owner,collection}) => collectionTile(owner, collection)).join('')}</div>`;
    }
    const { owner, id } = selected, own = owner === me();
    let collection;
    try { collection = liveSource(data(), me(), owner, id); }
    catch {
      return `${top()}<div class="social-empty">${icon('lock')}<h2>This collection isn’t available.</h2><p>Its owner may have changed its audience or removed it.</p>${action('live-unfollow', 'Remove from my sidebar', refAttrs(), 'secondary')}${action('live-browse', 'Explore collections', '', 'text-btn')}</div>`;
    }
    const follow = subscription(data(), me(), owner, id), cards = liveCards(data(), me(), owner, id);
    const pending = data().collectionSuggestions.filter(s => s.owner === owner && inCollection(s, id) && s.status === 'pending');
    return `${top()}${action('live-browse', '← Explore collections', '', 'text-btn live-back')}<section class="live-heading tint-${collection.color}"><span class="eyebrow">${own ? 'YOUR SHARED COLLECTION' : follow?.paused ? 'UPDATES PAUSED' : 'A LIVING COLLECTION'}</span><h1>${esc(collection.name)}</h1><p>${esc(collection.description)}</p><div class="live-byline">${profileChip(owner)}<span>${cards.length} cards · ${data().collectionFollows.filter(f => f.owner === owner && f.collectionId === id).length} following</span><span class="live-state">${icon(follow?.paused ? 'pause' : 'repeat')}${follow?.paused ? 'Your saved selection' : collection.communityManaged ? 'Organized by the community' : 'Curated by a person'}</span></div><div class="live-actions">${action('collection',icon('users')+'Collection & conversation',refAttrs(),'secondary')}${!own ? follow ? action('live-pause', icon(follow.paused ? 'play' : 'pause') + (follow.paused ? 'Resume updates' : 'Pause updates'), refAttrs(), 'secondary') : action('live-follow', icon('plus') + 'Follow collection', refAttrs(), 'primary') : action('live-edit', icon('plus') + 'Add a card', refAttrs(), 'primary')}${action('live-copy', icon('collection') + 'Make my own copy', refAttrs(), 'secondary')}${!own&&!collection.communityManaged ? action('live-suggest', icon('spark') + 'Suggest a card', refAttrs(), 'secondary') : ''}${follow ? action('live-unfollow', 'Unfollow', refAttrs(), 'text-btn') : ''}${action('live-refresh', icon('repeat'), 'aria-label="Refresh collection" title="Refresh collection"', 'icon-btn')}</div></section><div class="live-explainer live-policy"><span>${icon('users')}<span>${collection.communityManaged ? 'Public cards join matching topics automatically. Community category choices can move them. Use a card’s discussion panel to take part.' : own ? 'Your additions reach followers automatically. Review suggestions below; likes never add a card on their own.' : follow?.paused ? 'New additions are paused. Existing cards and sharing changes stay current. Resume whenever you want.' : 'New finds appear when the curator adds them. Hide a card, pause updates, or copy the collection whenever you want.'}</span></span>${follow?.hidden?.length ? action('live-restore', `Restore ${follow.hidden.length} hidden ${follow.hidden.length === 1 ? "card" : "cards"}`, refAttrs(), 'text-btn') : ''}</div>${own && pending.length ? `<section class="curator-review"><div class="aside-heading"><h2>Suggested for your collection</h2><span>${pending.length} to review</span></div>${pending.map(item => { const c = data().spaces[item.sourceOwner]?.cards.find(c => c.id === item.cardId); const allowed = canViewCard(data(), item.sourceOwner, c, null); return `<article><div><span class="eyebrow">SUGGESTED BY ${esc(name(item.userId))}</span><strong>${allowed ? esc(c.title) : 'Card no longer public'}</strong><p>${esc(item.reason)}</p></div><div>${allowed ? action('detail', 'Preview', `data-owner="${esc(item.sourceOwner)}" data-card-id="${esc(item.cardId)}"`, 'text-btn') + action('live-approve', 'Add to collection', `data-suggestion="${item.id}"`, 'primary') : ''}${action('live-decline', 'Dismiss', `data-suggestion="${item.id}"`, 'secondary')}</div></article>`; }).join('')}</section>` : ''}<div class="cards-grid discovery-grid live-cards">${cards.map(c => `<div class="live-card-wrap">${sharedCard(c,owner,me(),{live:true,collectionId:id,isNew:!!follow&&!(follow.seen||[]).includes(resourceKey(c,owner))})}<div class="live-card-context"><span title="${esc(c.curatorReason || (collection.communityManaged?'Connected by community topics.':'Selected by the curator.'))}" >${icon('users')}${esc(c.curatorReason || (collection.communityManaged?'Connected by community topics.':'Selected by the curator.'))}</span>${follow ? action('live-hide', icon('close'), `data-card-id="${esc(c.id)}" aria-label="Hide ${esc(c.title)} from this collection" title="Hide for me"`, 'icon-btn') : ''}</div></div>`).join('') || '<p class="form-hint">There are no visible cards here yet.</p>'}</div>${!own&&!collection.communityManaged ? `<p class="live-footnote">Changes happen within this browser demo. Switch to ${esc(name(owner))} to add a card or review a suggestion, then switch back.</p>` : ''}`;
  }
  function open(owner, id) { selected = { owner, id }; ctx.closeModal(); ctx.ui().page = 'live'; ctx.ui().mobile = false; ctx.render(); window.scrollTo(0,0); }
  async function click(el) {
    const act = el.dataset.social;
    if (act === 'open' && ctx.ui().page === 'live' && selected?.owner === el.dataset.owner) {
      const cards = liveCards(data(), me(), selected.owner, selected.id); const card = cards.find(c => c.id === el.dataset.cardId);
      if (card) { ctx.closeModal(); await ctx.openShared(selected.owner, card, cards); return true; }
    }
    if (act === 'live-open') { open(el.dataset.owner, el.dataset.id); return true; }
    if (!act.startsWith('live-')) return false;
    if (act === 'live-browse') { selected = null; ctx.closeModal(); ctx.ui().page = 'live'; ctx.ui().mobile = false; ctx.render(); window.scrollTo(0,0); return true; }
    const { owner, id } = selected || { owner: el.dataset.owner, id: el.dataset.id };
    if (act === 'live-edit') { ctx.addCard(id); return true; }
    if (act === 'live-follow' || act === 'follow-collection') followCollection(data(), me(), owner, id);
    else if (act === 'live-pause') pauseCollection(data(), me(), owner, id);
    else if (act === 'live-unfollow') data().collectionFollows = data().collectionFollows.filter(f => !(f.userId === me() && f.owner === owner && f.collectionId === id));
    else if (act === 'live-hide' || act === 'live-restore') { const f = subscription(data(), me(), owner, id); if (act === 'live-hide') ctx.stopPlayback(); if (f) f.hidden = act === 'live-restore' ? [] : [...new Set([...(f.hidden || []), el.dataset.cardId])]; }
    else if (act === 'live-copy') {
      const copy = copyCollection(data(), me(), owner, id); await ctx.persist(); ctx.ui().page = 'space'; ctx.ui().collection = copy.id; ctx.ui().filter = 'all'; ctx.ui().query = ''; ctx.render(); window.scrollTo(0,0); ctx.toast('Your private copy is ready. Future additions stay with the original.'); return true;
    }
    else if (act === 'live-suggest') {
      const items = attachmentChoices(data(), null).filter(i => i.kind === 'card');
      ctx.modal('A good find belongs here.', 'Suggest a public card. The curator decides whether it fits.', `<form id="social-live-suggest"><label class="field">A public card<select name="attachment" required><option value="">Choose a discovery…</option>${items.map(i => `<option value="${esc(encodeAttachment(i))}">${esc(i.title)} · ${esc(name(i.owner))}</option>`).join('')}</select></label><label class="field">Why does it belong?<textarea name="reason" maxlength="300" rows="3" placeholder="What makes it a good fit for this collection?" required></textarea></label><p class="social-form-error" role="alert"></p></form>`, '<button class="secondary" data-action="close-dialog">Cancel</button><button type="submit" form="social-live-suggest" class="primary">Send suggestion</button>'); return true;
    }
    else if (act === 'live-approve' || act === 'live-decline') reviewSuggestion(data(), me(), el.dataset.suggestion, act === 'live-approve');
    else if (act !== 'live-refresh') return false;
    await ctx.persist(); ctx.render();
    if (act === 'live-follow') ctx.toast('Added to your sidebar. New discoveries will appear here.');
    return true;
  }
  async function submit(form) {
    if (form.id !== 'social-live-suggest') return false;
    suggestCard(data(), me(), selected.owner, selected.id, decodeAttachment(form.elements.attachment.value), form.elements.reason.value);
    await ctx.persist(); ctx.closeModal(); ctx.render(); ctx.toast('Sent to the curator. Nothing is added until they approve.'); return true;
  }
  return { render, navigation, click, submit, reset: () => { selected = null; } };
}
