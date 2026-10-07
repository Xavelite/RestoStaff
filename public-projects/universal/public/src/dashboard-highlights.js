import { markOwnAdditionsSeen } from './collection-experience.js';
import { collectionEntries, markDiscoveriesSeen } from './smart-collections.js';
import { liveCards, subscription } from './live-collections.js';
import { canViewCard, resourceKey, saveSharedCard } from './social.js';
import { inCollection } from './classification.js';

export function dashboardPreferences(space) {
  space.dashboard ||= {};
  const p=space.dashboard;
  p.order=[...new Set([...(p.order||[]).filter(v=>['favorites','new'].includes(v)),'favorites','new'])];
  p.hidden ||= [];p.folded ||= [];p.dismissed ||= [];p.favoriteOrder ||= [];
  return p;
}
export function favoriteCards(data,user) {
  const space=data.spaces[user],order=dashboardPreferences(space).favoriteOrder;
  return space.cards.filter(c=>c.favorite).sort((a,b)=>{
    const rank=id=>order.includes(id)?order.indexOf(id):Infinity;
    return rank(a.id)-rank(b.id);
  });
}
export function newArrivals(data,user) {
  const space=data.spaces[user],p=dashboardPreferences(space),found=new Map();
  function add(card,owner,key,origin) {
    if(p.dismissed.includes(key))return;
    if(!found.has(key))found.set(key,{card,owner,key,isNew:true,origins:[]});
    found.get(key).origins.push(origin);
  }
  for(const c of space.collections.filter(c=>c.smart?.enabled||c.trackAdditions))for(const e of collectionEntries(data,user,c)) {
    if(e.isNew)add(e.card,e.owner,e.key,{kind:c.smart?.enabled?'smart':'own',owner:user,id:c.id,name:c.name});
  }
  for(const f of data.collectionFollows.filter(f=>f.userId===user)) {
    try {
      const c=data.spaces[f.owner].collections.find(c=>c.id===f.collectionId);
      for(const card of liveCards(data,user,f.owner,f.collectionId)) {
        const key=resourceKey(card,f.owner);
        if(!(f.seen||[]).includes(key))add(card,f.owner,key,{kind:'follow',owner:f.owner,id:c.id,name:c.name});
      }
    }catch{/* Revoked collections do not leak their cards or names. */}
  }
  return [...found.values()].sort((a,b)=>(b.card.sharedAt||b.card.createdAt||0)-(a.card.sharedAt||a.card.createdAt||0));
}
export function markArrivalSeen(data,user,key) {
  markOwnAdditionsSeen(data,user,key);
  for(const c of data.spaces[user].collections.filter(c=>c.smart?.enabled))markDiscoveriesSeen(data,user,c.id,[key]);
  markFollowedResourceSeen(data,user,key);
}
export function markFollowedResourceSeen(data,user,key) {
  let changed=false;
  for(const f of data.collectionFollows.filter(f=>f.userId===user)) {
    try {
      if(!(f.seen||[]).includes(key)&&liveCards(data,user,f.owner,f.collectionId).some(c=>resourceKey(c,f.owner)===key)){
        f.seen=[...(f.seen||[]),key];changed=true;
      }
    }catch{/* Access may have changed since this card was opened. */}
  }
  return changed;
}
export function keepArrival(data,user,key,collectionId) {
  const e=newArrivals(data,user).find(e=>e.key===key);
  if(!e)throw Error('This discovery is no longer available.');
  const {card}=saveSharedCard(data,user,e.owner,e.card.id,collectionId,e.card.title);
  if(!inCollection(card,collectionId))card.collectionIds=[...(card.collectionIds||[]),collectionId];
  markArrivalSeen(data,user,key);return card;
}
export function upgradeDashboardHighlights(data) {
  if(data.dashboardHighlightsVersion)return false;
  for(const space of Object.values(data.spaces))dashboardPreferences(space);
  // Following a collection starts from today; its whole archive is not an alert.
  for(const f of data.collectionFollows){
    try{f.seen=liveCards(data,f.userId,f.owner,f.collectionId).map(c=>resourceKey(c,f.owner));}catch{f.seen=[];}
  }
  data.dashboardHighlightsVersion=1;return true;
}
