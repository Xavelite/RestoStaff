import { contentFields, normalize } from './classification.js';
import { searchCards, resourceKey } from './social.js';

export function resourceEntities(card) {
  const f=contentFields(card),entities=[];
  if(f.artist)entities.push({kind:'artist',label:f.artist,caption:'Artist / group',context:''});
  if(card.album)entities.push({kind:'album',label:card.album,caption:'Album',context:f.artist||card.creator||''});
  if(card.creator&&normalize(card.creator)!==normalize(f.artist))entities.push({kind:'creator',label:card.creator,caption:card.contentKind==='book'?'Author':'Creator',context:''});
  if(card.series)entities.push({kind:'series',label:card.series,caption:'Series',context:card.creator||f.artist||''});
  return entities;
}
export function entityCards(data,user,entity) {
  if(!['artist','album','creator','series'].includes(entity.kind)||!entity.label)return [];
  return searchCards(data,user,{sort:'popular'}).filter(r=>resourceEntities(r.card).some(e=>e.kind===entity.kind&&normalize(e.label)===normalize(entity.label)&&(!['album','series'].includes(e.kind)||normalize(e.context)===normalize(entity.context))));
}
export function relatedCards(data,user,owner,card) {
  const key=resourceKey(card,owner),found=new Map();
  for(const entity of resourceEntities(card))for(const r of entityCards(data,user,entity))if(r.key!==key&&!found.has(r.key))found.set(r.key,{...r,via:entity});
  return [...found.values()];
}
export function upgradeResourceConnections(data) {
  if(data.resourceConnectionsVersion)return false;
  for(const space of Object.values(data.spaces))for(const c of space.cards){
    // Existing starter descriptions supply these album names; do not guess metadata for user cards.
    if(/(?:^|-)rock-(?:acdc|cranberries)$/.test(c.id)&&/^\d{4} · /.test(c.description||''))c.album=c.description.split(' · ').slice(1).join(' · ');
  }
  data.resourceConnectionsVersion=1;return true;
}
