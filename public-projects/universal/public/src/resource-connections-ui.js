import { resourceEntities, entityCards, relatedCards } from './resource-connections.js';
import { escapeHTML as esc } from './model.js';
import { icon } from './icons.js';

export function createResourceConnectionsUI(ctx,{top,sharedCard}) {
  let current=null;
  const data=ctx.data,user=()=>data().activeUser;
  const attrs=e=>`data-social="entity-open" data-entity="${esc(e.kind)}" data-label="${esc(e.label)}" data-context="${esc(e.context)}"`;
  function panel(owner,card,viewer=user()) {
    const entities=resourceEntities(card);if(!entities.length)return '';
    const related=relatedCards(data(),viewer,owner,card).slice(0,4);
    return `<section class="resource-connections"><h3>Keep exploring</h3><div class="entity-chips">${entities.map(e=>`<button ${attrs(e)}><small>${esc(e.caption)}</small><strong>${esc(e.label)}</strong>${icon('arrow')}</button>`).join('')}</div>${related.length?`<div class="related-cards">${related.map(r=>`<button data-social="detail" data-owner="${esc(r.ownerId)}" data-card-id="${esc(r.card.id)}"><span>${icon(r.card.type==='video'?'video':r.card.contentKind==='book'?'book':'link')}</span><span><strong>${esc(r.card.title)}</strong><small>More from ${esc(r.via.label)}</small></span>${icon('arrow')}</button>`).join('')}</div>`:''}</section>`;
  }
  function render() {
    if(!current)return '';
    const results=entityCards(data(),user(),current);
    return `${top()}<section class="entity-hero"><button class="text-btn" data-social="page" data-page="discover">← Discover</button><span class="eyebrow">${esc({artist:'ARTIST / GROUP',creator:'CREATOR',album:'ALBUM',series:'SERIES'}[current.kind])}</span><h1>${esc(current.label)}</h1><p>${current.context?esc(current.context)+' · ':''}${results.length} ${results.length===1?'resource':'resources'} collected across your community.</p><small>Connected by card details. Your private cards are visible only to you.</small></section><div class="cards-grid profile-cards entity-grid">${results.map(r=>sharedCard(r.card,r.ownerId,user())).join('')||'<p class="form-hint">No shared cards are available here yet.</p>'}</div>`;
  }
  function click(el) {
    if(el.dataset.social!=='entity-open')return false;
    current={kind:el.dataset.entity,label:el.dataset.label,context:el.dataset.context};
    ctx.closeModal();ctx.ui().page='entity';ctx.render();window.scrollTo(0,0);return true;
  }
  return {panel,render,click};
}
