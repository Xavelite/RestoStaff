import { ownAdditionIsNew, markOwnAdditionsSeen } from './collection-experience.js';
import { searchCards,resourceKey,canViewCard,saveSharedCard } from './social.js';
import { inCollection } from './classification.js';
import { uid } from './model.js';

import { smartRules } from './smart-rules.js';
export { smartRules } from './smart-rules.js';
export function collectionEntries(data,user,collection) {
  const owned=data.spaces[user].cards.filter(c=>inCollection(c,collection.id)&&canViewCard(data,user,c,user));
  const entries=owned.map(card=>({card,owner:user,key:resourceKey(card,user),dynamic:false,isNew:ownAdditionIsNew(data,user,collection,card)}));
  const keys=new Set(entries.map(e=>e.key));
  if(!collection.smart?.enabled)return entries;
  const savedKeys=new Set(data.spaces[user].cards.map(card=>resourceKey(card,user)));
  const config=collection.smart;
  let discoveries=searchCards(data,user,config.paused?{scope:smartRules(config.rules).scope}:smartRules(config.rules));
  if(!config.paused&&config.rules?.decades?.length)discoveries=discoveries.filter(r=>config.rules.decades.includes(r.fields.decade));
  if(config.paused)discoveries=discoveries.filter(r=>(config.snapshot||[]).includes(r.key));
  discoveries=discoveries.filter(r=>r.card.type!=='widget'&&!keys.has(r.key)&&!(config.hidden||[]).includes(r.key)).slice(0,config.paused?1000:smartRules(config.rules).limit);
  const dynamic=discoveries.map(r=>({card:r.card,owner:r.ownerId,key:r.key,dynamic:true,saved:savedKeys.has(r.key),isNew:!!config.newTracking&&!(config.seen||[]).includes(r.key)}));
  dynamic.sort(config.paused?(a,b)=>(config.snapshot||[]).indexOf(a.key)-(config.snapshot||[]).indexOf(b.key):(a,b)=>Number(b.isNew)-Number(a.isNew));
  return [...entries,...dynamic];
}
export function markDiscoveriesSeen(data,user,collectionId,keys) {
  const c=data.spaces[user]?.collections.find(c=>c.id===collectionId);
  if(!c?.smart?.enabled)return false;
  const visible=new Set(collectionEntries(data,user,c).filter(e=>e.dynamic).map(e=>e.key));
  const accepted=keys.filter(key=>visible.has(key));
  const before=new Set(c.smart.seen||[]);for(const key of accepted)before.add(key);
  c.smart.seen=[...before];c.smart.newTracking=true;return accepted.length>0;
}
export function markResourceSeen(data,user,owner,card){
  const key=resourceKey(card,owner);let changed=markOwnAdditionsSeen(data,user,key);
  for(const c of data.spaces[user].collections){
    if(c.smart?.enabled&&collectionEntries(data,user,c).some(e=>e.key===key&&e.isNew)){
      markDiscoveriesSeen(data,user,c.id,[key]);changed=true;
    }
  }
  return changed;
}
export function keepDiscovery(data,user,collectionId,key) {
  const collection=data.spaces[user].collections.find(c=>c.id===collectionId);
  const entry=collection && collectionEntries(data,user,collection).find(e=>e.key===key);
  if(!entry)throw Error('That discovery is no longer available.');
  const {card}=saveSharedCard(data,user,entry.owner,entry.card.id,collectionId,entry.card.title);
  if(!inCollection(card,collectionId))card.collectionIds=[...(card.collectionIds||[]),collectionId];
  return card;
}
export function createSmartCollection(space,name,rules,id=uid()) {
  const collection={id,name:String(name).trim().slice(0,80)||'New discoveries',description:'A live collection, shaped by your interests.',icon:'spark',color:'sage',visibility:'private',smart:{enabled:true,rules:smartRules(rules),hidden:[],seen:[],paused:false,newTracking:true}};
  space.collections.push(collection);return collection;
}
export function upgradeConnectedSpace(data) {
  if(data.connectedSpaceVersion>=1)return false;
  for(const space of Object.values(data.spaces)) {
    space.settings.groupCollections=false;
    for(const saved of space.savedSearches||[])if(!space.collections.some(c=>c.id===`smart-${saved.id}`))createSmartCollection(space,saved.name,{...saved.options,followingOnly:saved.following},`smart-${saved.id}`);
    space.savedSearches=[];
  }
  // Only seeded activity receives a demo timestamp; undated real actions stay undated.
  for(const [i,like]of data.likes.entries())if(like.demo&&!like.createdAt)like.createdAt=Date.now()-(i%60+1)*3600000;
  data.connectedSpaceVersion=1;return true;
}
