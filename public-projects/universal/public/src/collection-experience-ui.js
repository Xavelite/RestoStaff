import { recommendationsForCollection, addRecommendation, favoriteFor } from './collection-experience.js';
import { engagement, effectiveAudience, publicEntries, resourceKey } from './social.js';
import { escapeHTML as esc } from './model.js';
import { icon } from './icons.js';

export function liveCardActions(data,user,owner,card,{personal=false,preview=false,viewer=user}={}) {
  const stats=engagement(data,owner,card,viewer),favorite=personal?!!card.favorite:!!favoriteFor(data,user,owner,card);
  const attrs=`data-owner="${esc(owner)}" data-card-id="${esc(card.id)}"`;
  const canLike=effectiveAudience(data.spaces[owner],card)!=='private'||publicEntries(data).has(resourceKey(card,owner));
  const favoriteAction=personal?`data-action="favorite" data-id="${esc(card.id)}"`:`data-social="favorite-resource" ${attrs}`;
  return `<button data-social="comments" ${attrs} aria-label="Comments for ${esc(card.title)}" aria-expanded="false" title="Comments">${icon('comment')}<span>${stats.comments.length}</span></button>${canLike?(preview?`<span class="card-action-stat" title="Likes">${icon('heart')}${stats.likes}</span>`:`<button data-social="like" ${attrs} aria-label="${stats.liked?'Unlike':'Like'} ${esc(card.title)}" aria-pressed="${stats.liked}" title="${stats.liked?'Unlike':'Like'}" class="${stats.liked?'liked':''}">${icon('heart')}<span>${stats.likes}</span></button>`):''}${!preview?`<button ${favoriteAction} class="live-favorite ${favorite?'is-favorite':''}" aria-label="${favorite?'Unfavorite':'Favorite'} ${esc(card.title)}" aria-pressed="${favorite}" title="${favorite?'Remove from favorites':'Favorite · keep a personal bookmark'}">${icon('star')}<span class="sr-only">Favorite</span></button>`:''}`;
}
export function createCollectionExperienceUI(ctx) {
  const data=ctx.data,user=()=>data().activeUser,space=()=>data().spaces[user()];
  function render(collection) {
    const results=recommendationsForCollection(data(),user(),collection);if(!results.length)return '';
    return `<aside class="collection-recommendations" aria-label="Suggestions for ${esc(collection.name)}"><div class="recommendations-heading"><div><h3>You might also like</h3><p>Suggestions for ${esc(collection.name)} · added only if you choose</p></div><button class="icon-btn" data-action="recommendations-disable" data-id="${esc(collection.id)}" aria-label="Hide suggestions for ${esc(collection.name)}" title="Hide suggestions">${icon('close')}</button></div><div class="recommendation-strip">${results.map(r=>`<article class="recommendation-card tint-${esc(r.card.color||'sage')}"><button class="recommendation-open" data-social="open" data-owner="${esc(r.ownerId)}" data-card-id="${esc(r.card.id)}" aria-label="Preview suggested ${esc(r.card.title)}"><span class="recommendation-art">${ctx.cardVisual(r.card)}</span><span><strong>${esc(r.card.title)}</strong><small>${esc(r.reason)}</small></span></button><div class="recommendation-actions"><button class="text-btn" data-action="recommendation-add" data-id="${esc(collection.id)}" data-key="${esc(r.key)}" aria-label="Add ${esc(r.card.title)} to ${esc(collection.name)}">${icon('plus')}Add</button><button class="icon-btn" data-action="recommendation-dismiss" data-id="${esc(collection.id)}" data-key="${esc(r.key)}" aria-label="Dismiss suggestion ${esc(r.card.title)}">${icon('close')}</button></div></article>`).join('')}</div></aside>`;
  }
  async function click(act,el) {
    if(!act.startsWith('recommendation'))return false;
    const c=space().collections.find(c=>c.id===el.dataset.id);if(!c)return true;
    if(act==='recommendation-add'){addRecommendation(data(),user(),c.id,el.dataset.key);ctx.toast('Added to your collection.');}
    else {
      c.recommendations||={hidden:[],disabled:false};
      if(act==='recommendations-disable')c.recommendations.disabled=true;
      if(act==='recommendations-restore'){c.recommendations.hidden=[];c.recommendations.disabled=false;}
      if(act==='recommendation-dismiss')c.recommendations.hidden=[...new Set([...(c.recommendations.hidden||[]),el.dataset.key])];
    }
    await ctx.persist();ctx.render();return true;
  }
  return {render,click};
}
