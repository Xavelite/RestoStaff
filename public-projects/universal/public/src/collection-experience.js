import { getCard, canViewCard, resourceKey, saveSharedCard, searchCards, cardTopics } from './social.js';
import { subjectIds, resolveTopic } from './topics.js';
import { inCollection, contentFields } from './classification.js';

export const personalCollections = space => space.collections.filter(c=>c.system!=='favorites');
export function favoriteFor(data,user,owner,card) {
  const key=resourceKey(card,owner);
  return data.spaces[user].cards.find(c=>resourceKey(c,user)===key&&c.favorite);
}
export function toggleResourceFavorite(data,user,owner,id) {
  const source=data.spaces[owner]?.cards.find(c=>c.id===id);
  if(!source)throw Error('This card is no longer available.');
  const space=data.spaces[user],key=resourceKey(source,owner);
  let card=space.cards.find(c=>resourceKey(c,user)===key);
  if(card?.favorite){
    card.favorite=false;
    // A bookmark created only for Favorites has no other placement to retain.
    if(card.favoriteOnly&&space.collections.find(c=>c.id===card.collectionId)?.system==='favorites'&&!card.collectionIds?.length)space.cards=space.cards.filter(c=>c.id!==card.id);
    return {card,favorite:false};
  }
  getCard(data,owner,id,user);
  if(!card){
    let home=space.collections.find(c=>c.system==='favorites');
    if(!home){home={id:'personal-favorites',system:'favorites',name:'Favorites',description:'Your personal bookmarks.',icon:'star',color:'sage',visibility:'private'};while(space.collections.some(c=>c.id===home.id))home.id+='-';space.collections.push(home);}
    card=saveSharedCard(data,user,owner,id,home.id,source.title).card;
    card.favoriteOnly=true;
  }
  card.favorite=true;return {card,favorite:true};
}
export function ownAdditionIsNew(data,user,collection,card) {
  return !!collection.trackAdditions&&!!card.contributedBy&&card.contributedBy!==user&&!(collection.updateSeen||[]).includes(resourceKey(card,user));
}
export function markOwnAdditionsSeen(data,user,key) {
  let changed=false;
  for(const c of data.spaces[user].collections){
    if(c.trackAdditions&&data.spaces[user].cards.some(card=>inCollection(card,c.id)&&resourceKey(card,user)===key&&ownAdditionIsNew(data,user,c,card))){
      c.updateSeen=[...(c.updateSeen||[]),key];changed=true;
    }
  }
  return changed;
}
export function recommendationsForCollection(data,user,collection) {
  if(!collection||collection.smart?.enabled||collection.system||collection.recommendations?.disabled)return [];
  const space=data.spaces[user],owned=space.cards.filter(c=>inCollection(c,collection.id)&&c.type!=='widget'&&canViewCard(data,user,c,user));
  const topics=new Map();
  for(const c of owned){
    const ids=subjectIds(c);
    for(const id of ids.length?ids:cardTopics(space,c).map(t=>resolveTopic(t)?.id).filter(Boolean))topics.set(id,(topics.get(id)||0)+1);
  }
  for(const id of collection.subjects||[])topics.set(id,(topics.get(id)||0)+owned.length+1);
  const selected=[...topics].sort((a,b)=>b[1]-a[1])[0]?.[0];
  if(!selected)return [];
  const keys=new Set(space.cards.map(c=>resourceKey(c,user))),hidden=new Set(collection.recommendations?.hidden||[]);
  const fields=owned.map(contentFields),genres=[...new Set(fields.map(f=>f.genre).filter(Boolean))],types=[...new Set(owned.map(c=>c.type))];
  const genre=fields.length&&fields.every(f=>f.genre)&&genres.length===1?genres[0]:'';
  const decades=fields.length&&fields.every(f=>f.decade)?[...new Set(fields.map(f=>f.decade))]:[];
  const type=types.length===1?types[0]:'all';
  return searchCards(data,user,{topic:selected,sort:'popular',genre,type}).filter(r=>r.card.type!=='widget'&&!keys.has(r.key)&&!hidden.has(r.key)&&(!decades.length||decades.includes(r.fields.decade))).slice(0,4).map(r=>({...r,reason:[genre||resolveTopic(selected)?.label||selected,decades.length?r.fields.decade:''].filter(Boolean).join(' · ')}));
}
export function addRecommendation(data,user,collectionId,key) {
  const c=data.spaces[user].collections.find(c=>c.id===collectionId);
  const entry=recommendationsForCollection(data,user,c).find(r=>r.key===key);
  if(!entry)throw Error('This suggestion is no longer available.');
  return saveSharedCard(data,user,entry.ownerId,entry.card.id,collectionId,entry.card.title).card;
}
export function upgradeCollectionExperience(data) {
  if(data.collectionExperienceVersion)return false;
  for(const [user,space]of Object.entries(data.spaces))for(const c of space.collections){
    if(c.collaborative){c.trackAdditions=true;c.updateSeen=space.cards.filter(card=>inCollection(card,c.id)).map(card=>resourceKey(card,user));}
    if(c.description==='Selected by your rules. Kept by you.')c.description='A live collection, shaped by your interests.';
  }
  data.collectionExperienceVersion=1;return true;
}
