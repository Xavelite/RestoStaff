import { searchCards, visibleCollections, canViewCard, effectiveAudience, areFriends, cardTopics } from './social.js';
import { ROOT_TOPICS, resolveTopic, matchesTopic } from './topics.js';
import { cardKind } from './layout.js';
import { inCollection } from './classification.js';
import { recentSupport } from './ranking.js';

export const FLOW_FORMATS={all:'Everything',video:'Watch',audio:'Listen',link:'Read & use',picture:'Pictures',collection:'Collections'};
export const FLOW_ORDERS={mix:'A little of everything',popular:'Most popular',trending:'Trending this week',recent:'Newest first'};
export function flowPreferences(data,user){return {topic:'all',format:'all',audience:'everyone',order:'mix',livePreviews:true,hidden:[],...data.spaces[user].flowPreferences};}
export function flowTopic(data,owner,card){
  const topic=resolveTopic(card.subjects?.[0])||cardTopics(data.spaces[owner],card).map(resolveTopic).find(Boolean);
  return ROOT_TOPICS.find(t=>t.id===(topic?.parent||topic?.id))||ROOT_TOPICS.find(t=>t.id==='tools');
}
export function flowEntries(data,user,prefs=flowPreferences(data,user)){
  const hidden=new Set(prefs.hidden),muted=new Set(data.feedPreferences?.[user]?.muted||[]);
  const sort=prefs.order==='mix'?'popular':prefs.order;
  const cards=searchCards(data,user,{topic:prefs.topic,scope:prefs.audience==='friends'?'friends':'everyone',followingOnly:prefs.audience==='following',sort})
    .filter(r=>r.card.type!=='widget'&&effectiveAudience(data.spaces[r.ownerId],r.card)!=='private'&&!muted.has(r.ownerId))
    .map(r=>({...r,owner:r.ownerId,kind:'card',format:cardKind(r.card),topic:flowTopic(data,r.ownerId,r.card),date:r.card.sharedAt||r.card.createdAt||0}));
  const collections=Object.entries(data.spaces).flatMap(([owner,space])=>{
    if(data.profiles[owner]?.role==='curator'||muted.has(owner)||data.feedPreferences?.[user]?.blocked?.includes(owner)||data.feedPreferences?.[owner]?.blocked?.includes(user))return [];
    if(prefs.audience==='friends'&&!areFriends(data,user,owner))return [];
    return visibleCollections(data,owner,user).filter(c=>c.visibility!=='private'&&!c.communityManaged&&(prefs.audience!=='everyone'||c.visibility==='public')&&(prefs.audience!=='following'||data.follows.some(f=>f.from===user&&f.to===owner)||data.collectionFollows.some(f=>f.userId===user&&f.owner===owner&&f.collectionId===c.id))).flatMap(c=>{
      const members=space.cards.filter(card=>card.type!=='widget'&&inCollection(card,c.id)&&canViewCard(data,owner,card,prefs.audience==='everyone'?null:user));
      if(!members.length||(prefs.topic!=='all'&&!members.some(card=>matchesTopic(card,prefs.topic,cardTopics(space,card)))))return [];
      const support=data.collectionFollows.filter(f=>f.owner===owner&&f.collectionId===c.id);
      const trending=recentSupport([...support.map(f=>({userId:f.userId,createdAt:f.followedAt})),...data.comments.filter(note=>note.target==='collection:'+owner+':'+c.id)]).score;
      return [{trending,key:'collection:'+owner+':'+c.id,owner,kind:'collection',format:'collection',collection:c,cards:members,topic:flowTopic(data,owner,members[0]),popularity:data.collectionFollows.filter(f=>f.owner===owner&&f.collectionId===c.id).length,date:Math.max(...members.map(card=>card.sharedAt||card.createdAt||0))}];
    });
  }).sort((a,b)=>prefs.order==='recent'?b.date-a.date:prefs.order==='trending'?b.trending-a.trending||b.popularity-a.popularity:b.popularity-a.popularity);
  let entries=[...cards,...collections].filter(e=>!hidden.has(e.key)&&(prefs.format==='all'||e.format===prefs.format||(prefs.format==='link'&&e.format==='document')));
  if(prefs.order==='mix'){
    // Round-robin formats and topics. There is no personal engagement prediction.
    const buckets=['video','link','picture','collection','audio','document'].map(format=>entries.filter(e=>e.format===format));
    const mixed=[];let lastTopic='';
    while(buckets.some(b=>b.length))for(const bucket of buckets){
      if(!bucket.length)continue;
      const alternative=bucket.findIndex(e=>e.topic.id!==lastTopic),at=alternative<0?0:alternative;
      const [next]=bucket.splice(at,1);mixed.push(next);lastTopic=next.topic.id;
    }
    return mixed;
  }
  if(prefs.format==='collection')return entries;
  // Cards keep their exact ranking; collections get an occasional separate stop.
  const ranked=entries.filter(e=>e.kind==='card'),shelves=entries.filter(e=>e.kind==='collection'),result=[];
  ranked.forEach((entry,i)=>{result.push(entry);if((i+1)%5===0&&shelves.length)result.push(shelves.shift());});
  return [...result,...shelves];
}
