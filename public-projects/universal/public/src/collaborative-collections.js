import { liveSource, followCollection } from './live-collections.js';
import { getCard, canViewCard, resourceKey, effectiveAudience, searchCards } from './social.js';
import { inCollection } from './classification.js';
import { uid } from './model.js';

export function collectionRole(data,user,owner,id) {
  const c=liveSource(data,user,owner,id);
  return user===owner?'owner':c.contributors?.includes(user)?'contributor':'follower';
}
export function setContributors(data,user,owner,id,users) {
  const c=liveSource(data,user,owner,id);
  if(user!==owner)throw Error('Only the owner can change contributors.');
  if(c.communityManaged)throw Error('Community Library placement is decided through shared topics.');
  c.contributors=[...new Set(users)].filter(id=>id!==owner&&data.profiles[id]&&data.profiles[id].role!=='curator');
  c.collaborative=true;
  return c;
}
export function contributionChoices(data,user,owner,id) {
  const c=liveSource(data,user,owner,id),keys=new Set(data.spaces[owner].cards.filter(card=>inCollection(card,id)).map(card=>resourceKey(card,owner)));
  if(collectionRole(data,user,owner,id)==='follower'||c.visibility==='private')return [];
  return searchCards(data,user,{sort:'recent'}).filter(r=>r.card.type!=='widget'&&!keys.has(r.key)&&canViewCard(data,r.ownerId,r.card,null)&&effectiveAudience(data.spaces[r.ownerId],r.card)==='public').sort((a,b)=>Number(b.ownerId===user)-Number(a.ownerId===user));
}
export function contributeCard(data,user,owner,id,ref) {
  const c=liveSource(data,user,owner,id);
  if(collectionRole(data,user,owner,id)==='follower')throw Error('Only the owner and contributors can add cards directly.');
  if(c.communityManaged)throw Error('Use shared topics for the Community Library.');
  if(c.visibility==='private')throw Error('Share this collection before collecting together.');
  const source=getCard(data,ref.owner,ref.id,user);
  if(source.type==='widget'||effectiveAudience(data.spaces[ref.owner],source)!=='public'||!canViewCard(data,ref.owner,source,null))throw Error('Choose a public card. Private cards are never published by this action.');
  const key=resourceKey(source,ref.owner);
  if(data.spaces[owner].cards.some(card=>inCollection(card,id)&&resourceKey(card,owner)===key))throw Error('This resource is already in the collection.');
  const card={id:uid(),collectionId:id,title:source.title,description:source.description||'',type:source.type,url:source.url,color:source.color,visibility:'inherit',favorite:false,createdAt:Date.now(),contributedBy:user,savedFrom:ref.owner};
  for(const field of ['fileId','fileName','mime','fileSize','sourceURL','topics','artist','genre','year','decade','subjects','creator','contentKind','album','series'])if(source[field])card[field]=structuredClone(source[field]);
  if(source.fileId){card.resourceKey=key;card.sourceRef=source.sourceRef||{owner:ref.owner,id:ref.id};}
  if(!c.trackAdditions){c.trackAdditions=true;c.updateSeen=data.spaces[owner].cards.filter(card=>inCollection(card,id)).map(card=>resourceKey(card,owner));}
  data.spaces[owner].cards.push(card);
  (c.activity||=[]).push({id:uid(),userId:user,action:'added',title:card.title,cardId:card.id,createdAt:Date.now()});
  return card;
}
export function removeContribution(data,user,owner,id,cardId) {
  const c=liveSource(data,user,owner,id),role=collectionRole(data,user,owner,id),space=data.spaces[owner];
  const card=space.cards.find(card=>card.id===cardId&&inCollection(card,id));
  if(!card)throw Error('That card is no longer in this collection.');
  if(role!=='owner'&&(role!=='contributor'||card.contributedBy!==user))throw Error('Contributors can only remove their own additions.');
  const other=[card.collectionId,...(card.collectionIds||[])].filter(x=>x!==id);
  if(other.length){card.collectionId=other[0];card.collectionIds=other.slice(1);}else space.cards=space.cards.filter(x=>x.id!==cardId);
  (c.activity||=[]).push({id:uid(),userId:user,action:'removed',title:card.title,createdAt:Date.now()});
}
export function upgradeCollaborativeCollections(data) {
  if(data.collaborativeVersion)return false;
  const c=data.spaces.alex?.collections.find(c=>c.id==='alex-rock-club');
  if(c){
    c.collaborative=true;c.contributors=['xavier','jules','maya'].filter(id=>data.profiles[id]);
    c.description='A shared home for 80s–90s rock. Alex, Xavier, Jules and Maya collect together; everyone can follow or join the conversation.';
    c.activity ||= [];
    if(data.spaces.xavier)followCollection(data,'xavier','alex',c.id);
  }
  data.collaborativeVersion=1;return true;
}
