import { liveCardActions } from './collection-experience-ui.js';
import { dashboardPreferences, newArrivals, markArrivalSeen } from './dashboard-highlights.js';
import { escapeHTML as esc, domain } from './model.js';
import { icon } from './icons.js';
import { openPopover } from './surfaces.js';

export function createHighlightsUI(ctx) {
  const data=ctx.data,user=()=>data().activeUser,space=()=>data().spaces[user()],prefs=()=>dashboardPreferences(space());
  const button=(act,label,extra='',cls='text-btn')=>`<button type="button" class="${cls}" data-action="${act}" ${extra}>${label}</button>`;
  const keyAttrs=key=>`data-key="${esc(key)}"`;
  let limit=12,profile=null;
  function arrivalCard(e) {
    const c=e.card,extra=keyAttrs(e.key),source=e.origins[0];
    return `<article class="card smart-discovery is-new arrival-feed-card tint-${esc(c.color||'sage')}"><button class="arrival-feed-open" data-action="arrival-open" ${extra} aria-label="Open ${esc(c.title)}"><span class="arrival-feed-art">${ctx.cardVisual(c)}</span><span class="arrival-feed-copy"><span class="arrival-feed-label">${icon('spark')}New in your collections</span><strong>${esc(c.title)}</strong><span class="arrival-feed-description">${esc(c.description||domain(c.url))}</span><small>${esc(domain(c.url)||c.fileName||c.type)}</small></span></button>${button('arrival-menu',icon('more'),`${extra} aria-label="Options for new ${esc(c.title)}"`,'icon-btn smart-hide')}<div class="arrival-feed-footer"><div class="arrival-origin"><span>From</span><button ${source.kind!=='follow'?`data-action="navigate" data-id="${esc(source.id)}"`:`data-social="collection" data-owner="${esc(source.owner)}" data-id="${esc(source.id)}"`}>${esc(source.name)}</button>${e.origins.length>1?`<span title="${esc(e.origins.map(o=>o.name).join(' · '))}">+${e.origins.length-1}</span>`:''}</div><div class="live-member-actions">${liveCardActions(data(),user(),e.owner,c)}</div></div></article>`;
  }
  function renderFeed() {
    if(profile!==user()){profile=user();limit=12;}
    const items=newArrivals(data(),user()),p=prefs();
    return `<section class="community-arrivals" aria-label="New for you"><header class="community-arrivals-heading"><div><h2>New for you${items.length?` <span>${items.length}</span>`:''}</h2><p>New cards from your collections and the collections you follow.</p></div>${items.length?button('arrival-mark-all',icon('check')+'Mark all seen'):''}</header>${items.length?`<div class="new-arrival-feed">${items.slice(0,limit).map(arrivalCard).join('')}</div>${items.length>limit?`<div class="feed-end">${button('arrival-more','Show more '+icon('down'),'','secondary')}</div>`:''}`:`<div class="arrivals-caught-up"><span>${icon('check')}</span><h3>You’re all caught up.</h3><p>New additions will appear here when your collections update.</p><button class="secondary" data-social="page" data-page="discover">Explore collections ${icon('arrow')}</button></div>`}${p.dismissed.length?`<div class="arrivals-restore">${button('arrival-restore','Show hidden updates')}</div>`:''}</section>`;
  }
  async function click(act,el) {
    if(!act.startsWith('arrival-'))return false;
    const p=prefs(),key=el.dataset.key;
    if(act==='arrival-more'){limit+=12;ctx.render();return true;}
    if(act==='arrival-motion'){p.pauseMotion=!p.pauseMotion;if(el.closest('dialog'))ctx.closeModal();}
    if(act==='arrival-restore')p.dismissed=[];
    if(act==='arrival-hide')p.dismissed=[...new Set([...p.dismissed,key])];
    if(act==='arrival-seen')markArrivalSeen(data(),user(),key);
    if(act==='arrival-mark-all')newArrivals(data(),user()).forEach(e=>markArrivalSeen(data(),user(),e.key));
    if(act==='arrival-open'){
      const entry=newArrivals(data(),user()).find(e=>e.key===key);if(!entry)throw Error('This discovery is no longer available.');
      await ctx.openShared(entry.owner,entry.card);markArrivalSeen(data(),user(),key);
    }
    if(act==='arrival-menu'){const e=newArrivals(data(),user()).find(item=>item.key===key);if(!e)return true;openPopover(el,'New arrival','<div class="menu-list"><button data-social="detail" data-owner="'+esc(e.owner)+'" data-card-id="'+esc(e.card.id)+'">'+icon('expand')+'Open full card</button>'+button('arrival-seen',icon('check')+'Mark seen',keyAttrs(key))+button('arrival-hide',icon('close')+'Hide from New for you',keyAttrs(key))+'</div>');return true;}
    await ctx.persist();ctx.render();return true;
  }
  return {renderFeed,click};
}