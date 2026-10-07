import { ROOT_TOPICS, subjectIds, subjectLabels, resolveTopic } from './topics.js';
import { canViewCard, resourceKey, getCard, cardTopics, syncResources } from './social.js';
import { categoryBallot, communityCard, resolveCategoryDecisions } from './consensus.js';
import { collectionEntries, createSmartCollection } from './smart-collections.js';

const LIBRARY='universal-library';
export const NEW_TRACK_ID='community-dreams-1992';
function seedContentDetails(data){
  const examples=[
    {owner:'leo',id:'community-bloons',title:'Bloons TD 6',url:'https://store.steampowered.com/app/960090/Bloons_TD_6/',description:'Build a defense with monkey towers. Official game page; a paid game.',subjects:['gaming.strategy'],contentKind:'game',genre:'Tower defense',year:2018,creator:'Ninja Kiwi'},
    {owner:'nora',id:'community-scream',title:'Scream',url:'https://www.paramountpictures.com/movies/scream-1996',description:'A 1996 slasher classic. Official film information, not a full-movie stream.',subjects:['film.watch'],contentKind:'film',genre:'Horror',year:1996,creator:'Paramount Pictures'},
    {owner:'nora',id:'community-tremors',title:'Tremors',url:'https://www.universalpicturesathome.com/movies/tremors',description:'A small desert town meets underground monsters. Official film information.',subjects:['film.watch'],contentKind:'film',genre:'Horror',year:1990,creator:'Universal Pictures'},
  ];
  for(const {owner,...example}of examples){
    const space=data.spaces[owner];if(!space||space.cards.some(c=>c.id===example.id))continue;
    const root=example.subjects[0].split('.')[0];
    let collection=space.collections.find(c=>c.visibility==='public'&&c.subjects?.some(s=>s.split('.')[0]===root));
    if(!collection){collection={id:'community-'+owner+'-'+root,name:root==='gaming'?'Game night':'At the movies',color:root==='gaming'?'violet':'rose',icon:root==='gaming'?'game':'video',visibility:'public',subjects:[root]};space.collections.push(collection);}
    space.cards.push({...example,collectionId:collection.id,type:'link',color:collection.color,visibility:'public',createdAt:Date.now()-86400000,decade:Math.floor(example.year/10)*10+'s'});
  }
}
export function communitySources(data) {
  const entries=new Map();
  for(const [owner,space]of Object.entries(data.spaces))for(const original of space.cards){
    if(original.communityMirror||original.type==='widget'||!canViewCard(data,owner,original,null))continue;
    const key=resourceKey(original,owner),card=subjectIds(original).length?original:{...original,topics:cardTopics(space,original)};
    // The starter library supplies a fallback; an actual contributor supplies its own public card.
    if(!entries.has(key)||entries.get(key).owner===LIBRARY)entries.set(key,{owner,card});
  }
  return entries;
}
export function reconcileCommunityLibrary(data) {
  if(!data.communityBrainVersion)return;
  const library=data.spaces[LIBRARY];if(!library)return;
  const entries=communitySources(data);
  resolveCategoryDecisions(data,entries);
  const roots=new Set(library.collections.filter(c=>c.communityManaged).map(c=>c.id));
  const previous=new Map(library.cards.filter(c=>c.communityMirror).map(c=>[resourceKey(c,LIBRARY),c]));
  const base=library.cards.filter(c=>!c.communityMirror),baseKeys=new Set(base.map(c=>resourceKey(c,LIBRARY)));
  const place=card=>{
    const subjects=subjectIds(card),homes=[...new Set(subjects.map(id=>'library-'+id.split('.')[0]))].filter(id=>roots.has(id));
    if(homes.length){card.collectionId=homes[0];card.collectionIds=homes.slice(1);card.subjects=subjects;card.topics=subjectLabels(card);}
    return card;
  };
  library.cards=base.map(card=>place(communityCard(data,resourceKey(card,LIBRARY),card)));
  for(const [key,entry]of entries){
    if(baseKeys.has(key))continue;
    const source=communityCard(data,key,entry.card);
    if(!subjectIds(source).some(id=>roots.has('library-'+id.split('.')[0])))continue;
    const card={id:previous.get(key)?.id||'community-'+encodeURIComponent(key),communityMirror:true,sourceRef:{owner:entry.owner,id:entry.card.id},visibility:'inherit',favorite:false,createdAt:previous.get(key)?.createdAt||source.sharedAt||source.createdAt||Date.now()};
    for(const field of ['title','description','type','url','color','subjects','contentKind','creator','artist','genre','year','decade','fileId','fileName','mime','fileSize','sourceURL','album','series'])if(source[field]!=null)card[field]=structuredClone(source[field]);
    if(card.fileId)card.resourceKey=key;
    library.cards.push(place(card));
  }
}
export function castCategoryVote(data,user,owner,id,topicId) {
  if(!data.profiles[user]||data.profiles[user].role==='curator')throw Error('Choose a community profile to take part.');
  const card=getCard(data,owner,id,user);
  if(card.type==='widget'||!canViewCard(data,owner,card,null))throw Error('Category choices are for public resources.');
  const topic=topicId?resolveTopic(topicId):null;
  if(topicId&&!topic)throw Error('Choose an existing topic.');
  const key=resourceKey(card,owner),voteId=`category:${user}:${key}`;
  const vote={id:voteId,key,userId:user,topicId:topic?.id||'',withdrawn:!topic,updatedAt:Date.now()};
  data.categoryVotes||=[];
  const at=data.categoryVotes.findIndex(v=>v.id===voteId);
  if(at<0)data.categoryVotes.push(vote);else data.categoryVotes[at]=vote;
  reconcileCommunityLibrary(data);
  return {key,...categoryBallot(data,key)};
}
export function upgradeCommunityBrain(data) {
  if(data.communityBrainVersion>=1)return false;
  data.categoryVotes||=[];data.communityCategories||={};
  const library=data.spaces[LIBRARY];if(!library)return false;
  data.profiles[LIBRARY].name='Community Library';
  data.profiles[LIBRARY].bio='Built from public contributions. Organized by community choices. Everyone can help it grow.';
  for(const root of ROOT_TOPICS){const collection=library.collections.find(c=>c.id==='library-'+root.id);if(collection){collection.communityManaged=true;collection.subjects=[root.id];}}
  data.communityBrainVersion=1;
  seedContentDetails(data);
  reconcileCommunityLibrary(data);
  // Initial cards are familiar. Only arrivals after this baseline receive a New marker.
  for(const [user,space]of Object.entries(data.spaces))for(const c of space.collections)if(c.smart?.enabled){c.smart.seen=[...new Set([...(c.smart.seen||[]),...collectionEntries(data,user,c).map(e=>e.key)])];c.smart.newTracking=true;}
  const godot=library.cards.find(c=>c.id==='library-godot');
  if(godot){
    const key=resourceKey(godot,LIBRARY);
    data.communityCategories[key]={topicId:'gaming',originalSubjects:['gaming','technology.open'],history:[]};
    for(const [i,userId]of ['leo','omar','sam','nora','alex','ines'].entries())data.categoryVotes.push({id:`category:${userId}:${key}`,key,userId,topicId:i===5?'technology.code':'gaming.making',updatedAt:Date.now()-60000+i,demo:true});
  }
  const jules=data.spaces.jules;
  if(jules){
    let collection=jules.collections.find(c=>c.id==='jules-picks'&&c.visibility==='public');
    if(!collection){collection={id:'jules-community-music',name:'The listening room',color:'violet',icon:'music',visibility:'public'};jules.collections.push(collection);}
    const track={id:NEW_TRACK_ID,collectionId:collection.id,title:'The Cranberries · Dreams',description:'A bright 1992 alternative-rock favorite. A new find from Jules for the shared listening shelf.',type:'video',url:'https://www.youtube.com/watch?v=Yam5uK6e-bQ',artist:'The Cranberries',genre:'Rock',year:1992,decade:'1990s',subjects:['music.rock'],topics:['Music'],color:'violet',visibility:'public',createdAt:Date.now(),sharedAt:Date.now()};
    jules.cards.push(track);
    const key=resourceKey(track,'jules');
    for(const userId of ['alex','sam','maya','nora','leo','omar','zoe'])data.likes.push({target:'resource:'+key,userId,demo:true,createdAt:Date.now()});
    data.wallPosts.push({id:'community-dreams-post',userId:'jules',text:'One more for the 90s shelf: Dreams by The Cranberries. What should play next?',audience:'public',topic:'Music',attachment:{kind:'card',owner:'jules',id:track.id},createdAt:Date.now(),demo:true});
    const own=data.spaces.xavier;
    if(own){
      let rock=own.collections.find(c=>c.smart?.enabled&&/rock/i.test(c.name)&&/1980|1990|80s|90s/.test(c.name));
      if(!rock){rock=createSmartCollection(own,'80s & 90s discoveries',{scope:'everyone',topic:'music.rock',type:'video',genre:'Rock',decades:['1980s','1990s'],limit:12},'community-rock-discoveries');rock.smart.seen=collectionEntries(data,'xavier',rock).filter(e=>e.key!==key).map(e=>e.key);rock.smart.newTracking=true;}
      // Make the requested example eligible without replacing the person's saved cards.
      rock.smart.seen=(rock.smart.seen||[]).filter(k=>k!==key);
    }
  }
  reconcileCommunityLibrary(data);syncResources(data);return true;
}
