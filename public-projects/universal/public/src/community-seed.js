import { catalogCards } from './catalog.js';
import { seedState } from './model.js';
import { syncResources, targetFor, resourceKey } from './social.js';
import { contentFields } from './classification.js';

export function upgradeDiscoveryCommunity(data) {
  if (data.discoveryVersion >= 1) return false;
  const originals = catalogCards();
  const people = [
    ['jules','Jules Moreau','amber','Guitars, live sessions, and songs that stay with you.','Music','The listening room',originals.filter(c=>c.collectionId==='rock').map(c=>c.id).concat(['fkj','music-khruangbin','bandcamp'])],
    ['nora','Nora Chen','rose','Photography, visual stories, and a little creative experimentation.','Design','A visual notebook',['pinterest','canva','figma','arena','holiday-venice','holiday-lake']],
    ['leo','Leo Martin','blue','Games, code, and communities that make the internet interesting.','Useful tools','Build and play',['github','mdn','freecodecamp','archive','speedtest','youtube']],
    ['ines','Inès Dubois','violet','Learning a little every day. Good explanations deserve a place.','Learning','Start with a question',['wikipedia','khan','coursera','ted','deepl','freecodecamp']],
    ['omar','Omar Hassan','sage','Open tools, independent music, and people sharing what works.','Useful tools','An open web',['github','archive','mdn','bandcamp','soundcloud','nts']],
    ['zoe','Zoé Laurent','blue','Small trips, good maps, and discovering what is close to home.','Travel','Take the scenic route',['maps','sncb','holiday-beach','holiday-canal','wikipedia','deepl']],
  ];
  const now=Date.now(), socialIds=['reddit','instagram','discord','bluesky','linkedin','x'];
  const extraSocial=[{id:'mastodon',title:'Mastodon',description:'Explore independently operated social communities.',url:'https://joinmastodon.org/',type:'link',color:'violet'},originals.find(c=>c.id==='youtube')].filter(Boolean);
  for (const [index,[id,name,color,bio,topic,collectionName,ids]] of people.entries()) {
    if (data.profiles[id]) continue;
    data.profiles[id]={name,handle:id,color,bio,demo:true};
    const space=seedState();
    space.settings={...space.settings,name:name.split(' ')[0],theme:'dark',view:'adaptive',title:collectionName,subtitle:bio};
    space.folders=[{id:`${id}-interests`,name:'My interests',collapsed:false}];
    space.collections=[
      {id:`${id}-picks`,name:collectionName,description:bio,color,icon:topic==='Music'?'music':topic==='Travel'?'globe':'spark',visibility:'public',folderId:`${id}-interests`},
      {id:`${id}-social`,name:'Social media & communities',description:'Different places for different conversations.',color:'rose',icon:'users',visibility:'public'},
      {id:`${id}-private`,name:'Just for me',description:'A quiet place for personal plans.',color:'neutral',icon:'lock',visibility:'private'}
    ];
    const interests=ids.map(ref=>originals.find(c=>c.id===ref)).filter(c=>c&&!c.fileId);
    const sites=socialIds.filter((ref,i)=>i<3||(index+i)%3!==0).map(ref=>originals.find(c=>c.id===ref)).concat(extraSocial.filter((_,i)=>(index+i)%2===0)).filter(Boolean);
    space.cards=[...interests.map(c=>({...c,collectionId:`${id}-picks`,topics:[...new Set([...(c.topics||[]),topic])]})),...sites.map(c=>({...c,collectionId:`${id}-social`,topics:['Social media','Communities']}))].map((c,i)=>({...c,id:`${id}-${c.id}`,visibility:'inherit',favorite:false,createdAt:now-(index*18+i)*3600000,...contentFields(c)}));
    // Shared music classification is explicit and editable; unknown release years stay empty.
    for(const c of space.cards) {
      if(/rock-(queen|europe|survivor|badname)$/.test(c.id)) c.decade='1980s';
      if(/rock-(nirvana|rem|oasis|metallica)$/.test(c.id)) c.decade='1990s';
      if(c.collectionId===`${id}-social`) c.topics=['Social media','Communities'];
    }
    space.cards.push({id:`${id}-private-note`,collectionId:`${id}-private`,type:'widget',widget:'note',title:'A thought for later',note:'A private demo note. This is not part of public search.',color:'amber',url:'',visibility:'private',createdAt:now});
    data.spaces[id]=space;
    data.follows.push({from:id,to:index%2?'sam':'alex'});
    const card=space.cards.find(c=>c.collectionId===`${id}-picks`);
    data.wallPosts.push({id:`discovery-post-${id}`,userId:id,text:`I’m building ${collectionName.toLowerCase()}. ${bio} What would you add?`,audience:'public',topic,attachment:{kind:'collection',owner:id,id:`${id}-picks`},createdAt:now-(index*41+20)*60000,demo:true});
  }
  syncResources(data);
  const community=people.map(p=>p[0]);
  const sources=new Map();
  for(const owner of community) for(const card of data.spaces[owner].cards.filter(c=>c.visibility!=='private')) if(!sources.has(resourceKey(card,owner))) sources.set(resourceKey(card,owner),{owner,card});
  for(const [index,{owner,card}] of [...sources.values()].entries()) {
    const count=/reddit|instagram|discord/i.test(card.title)?5:2+index%4;
    for(const userId of community.slice(0,count)) {
      const target=targetFor(data,owner,card);
      if(!data.likes.some(l=>l.target===target&&l.userId===userId)) data.likes.push({target,userId,demo:true});
    }
  }
  for(const [ref,userId,text] of [['reddit','omar','The smaller topic communities are what make this useful to me.'],['instagram','nora','I keep this in my visual references collection.'],['rock-acdc','jules','One for the driving playlist. What would you put next?']]) {
    const source=[...sources.values()].find(s=>s.card.id.endsWith(ref));
    if(source) data.comments.push({id:`discovery-comment-${ref}`,target:targetFor(data,source.owner,source.card),userId,text,createdAt:now-3600000,demo:true});
  }
  for(const space of Object.values(data.spaces)) { space.folders ||= []; space.savedSearches ||= []; }
  data.discoveryVersion=1;
  return true;
}

export function upgradePersonalOrganization(data) {
  const space=data.spaces.xavier;
  if(!space || space.organizationVersion>=1) return false;
  space.folders ||= [];
  for(const [id,name,collections] of [
    ['listening-watching','Music & watching',['music','rock','slow']],
    ['ideas-learning','Ideas & learning',['create','learn','tools']],
    ['world-life','Life & the world',['social','news','finance','travel','holidays']],
  ]) {
    const candidates=space.collections.filter(c=>collections.includes(c.id)&&!c.folderId);
    if(!candidates.length)continue;
    if(!space.folders.some(f=>f.id===id))space.folders.push({id,name,collapsed:false});
    for(const c of candidates)c.folderId=id;
  }
  space.savedSearches ||= [];
  if(!space.savedSearches.some(s=>s.id==='rock-discoveries'))space.savedSearches.push({id:'rock-discoveries',name:'80s & 90s rock discoveries',following:false,options:{scope:'everyone',query:'80s 90s rock',topic:'Music',type:'video',tab:'cards',sort:'relevant',artist:'',genre:'',decade:'',layout:'list',filtersOpen:false}});
  const collection=space.collections.find(c=>c.id==='create');
  if(collection)for(const [widget,title,color] of [['tasks','Small steps','sage'],['continue','Continue exploring','violet'],['updates','From your people','blue']]) {
    const id=`discovery-widget-${widget}`;
    if(space.cards.some(c=>c.id===id))continue;
    space.cards.push({id,collectionId:collection.id,type:'widget',widget,title,color,url:'',visibility:'private',createdAt:Date.now(),tasks:widget==='tasks'?[{id:'try-search',text:'Find a new favorite with live search',done:false},{id:'try-collection',text:'Give a card a second collection',done:false}]:[]});
  }
  space.organizationVersion=1;
  return true;
}
