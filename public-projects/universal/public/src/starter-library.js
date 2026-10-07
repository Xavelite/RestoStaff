import { STARTER_CONTENT } from './starter-content.js';
import { ROOT_TOPICS, topicById, subjectLabels } from './topics.js';
import { FEED_TOPICS } from './network.js';
import { resolveTopic } from './topics.js';
import { seedState } from './model.js';
import { resourceKey, syncResources } from './social.js';
import { createSmartCollection } from './smart-collections.js';

export const CURATOR_ID = 'universal-library';
export function upgradeStarterLibrary(data) {
  if(data.starterLibraryVersion>=1)return false;
  const now=Date.now(), hour=3600000;
  data.profiles[CURATOR_ID]={name:'Universal Library',handle:'library',color:'sage',bio:'A demo curator for our starter library. Explore topics, follow a collection, or keep your own picks.',demo:true,role:'curator'};
  const library=seedState();
  library.settings={...library.settings,name:'Library',title:'A starting point for every curiosity.',subtitle:'Curated source links. Your own choices.',groupCollections:false};
  library.folders=[];library.savedSearches=[];
  library.collections=ROOT_TOPICS.map(topic=>({id:`library-${topic.id}`,name:topic.label,description:topic.description,subjects:[topic.id],icon:topic.icon,color:topic.color,visibility:'public'}));
  library.cards=STARTER_CONTENT.map((entry,i)=>{
    const root=topicById(entry.subjects[0].split('.')[0]);
    return {...structuredClone(entry),collectionId:`library-${root.id}`,collectionIds:[...new Set(entry.subjects.map(id=>`library-${id.split('.')[0]}`))].filter(id=>id!==`library-${root.id}`),topics:subjectLabels(entry),color:root.color,visibility:'inherit',createdAt:now-(48+i)*hour,sharedAt:now-(48+i)*hour,favorite:false};
  });
  data.spaces[CURATOR_ID]=library;
  const entries=new Map(library.cards.map(c=>[c.id,c]));
  // Enrich known matching URLs without renaming, moving, or changing anyone's privacy.
  const metadata=new Map(library.cards.map(card=>[resourceKey(card,CURATOR_ID),card]));
  for(const space of Object.values(data.spaces))for(const card of space.cards){
    const source=metadata.get(resourceKey(card,''));
    if(source)for(const key of ['subjects','contentKind','creator'])if(!card[key])card[key]=structuredClone(source[key]);
  }
  const cases=[
    ['leo','games','One more round','Co-op evenings, clever systems, and small adventures.','gaming','stardew,terraria,deep-rock,portal-two,factorio,openttd,celeste,hollow-knight'],
    ['leo','workshop','Build a little game','Tools and building blocks for a first playable idea.','gaming','godot,gdevelop,twine,kenney,itch-jams,mindustry'],
    ['ines','books','A chapter before bed','Mysteries, familiar classics, and a little science fiction.','reading','pride,frankenstein,sherlock,time-machine,alice,jane-eyre,little-women,librivox'],
    ['ines','study','Learn by doing','Lessons that give me something to try, not just something to watch.','learning','cs50,khan,mathigon,openlearn,tv5,duolingo,zotero'],
    ['nora','studio','A small creative studio','The tools I reach for when an idea needs a shape.','creativity','blender,krita,inkscape,penpot,google-fonts,darktable,rawtherapee,excalidraw'],
    ['nora','museum','An afternoon at the museum','Digital collections for an unhurried wander.','creativity','smithsonian,europeana,rijksmuseum,gallica,openverse'],
    ['jules','sound','Make some noise','A listening room that sometimes becomes a recording room.','music','audacity,lmms,bandlab,ableton-learning,musictheory,justinguitar,musicbrainz,bandcamp'],
    ['omar','open-tools','Tools with open doors','Useful projects made to be explored and contributed to.','technology','godot,blender,github,joplin,linux-mint,libreoffice,obs,shotcut,eff'],
    ['omar','repair','Fix it together','Keep a thing working, then share what you learned.','making','ifixit,repair-cafe,arduino,raspberry-pi,instructables'],
    ['zoe','routes','Take the slow route','Trains, maps, and a reason to stop along the way.','travel','seat61,sncb,interrail,openstreetmap,organic-maps,wikivoyage,visit-brussels,eurovelo'],
    ['zoe','outside','An hour outside','Short walks, wildlife, and places to return to.','outdoors','komoot,waymarked,alltrails,inaturalist,ebird,parkrun'],
    ['maya','kitchen','At the kitchen table','A good loaf, a quick meal, and fewer forgotten leftovers.','food','budgetbytes,bbc-food,king-arthur,the-perfect-loaf,pick-up-limes,minimalist-baker,food-waste'],
    ['maya','hobbies','Make room for hobbies','Small projects without a deadline.','play','origami,ravelry,drawabox,rhs,gardeners-world,boardgamearena'],
    ['sam','screen','A different movie night','Short films, thoughtful documentaries, and stories to talk about.','film','arte,nfb,short-week,blender-films,bfi,letterboxd'],
    ['sam','work','A calmer workday','Fewer loose ends, more room to think.','work','obsidian,todoist,trello,excalidraw,cryptpad,europass'],
    ['alex','curiosity','Questions worth following','From the night sky to the world outside the window.','science','nasa,esa,stellarium,zooniverse,foldit,gbif,ourworld,mit-ocw'],
    ['alex','perspectives','Check the wider picture','Several reporting sources, plus the data behind the discussion.','news','reuters,ap,rtbf,euronews,fullfact,ourworld,eurostat,wikifin'],
  ];
  const people=Object.keys(data.profiles).filter(id=>!['xavier',CURATOR_ID].includes(id));
  for(const [index,[owner,slug,name,description,topic,refs]]of cases.entries()){
    const space=data.spaces[owner];if(!space)continue;
    const id=`starter-${owner}-${slug}`,root=topicById(topic);
    space.collections.push({id,name,description,subjects:[topic],visibility:'public',color:root.color,icon:root.icon});
    for(const [i,ref]of refs.split(',').entries()){
      const source=entries.get(`library-${ref}`);if(!source)throw Error(`Missing starter resource: ${ref}`);
      const key=resourceKey(source,CURATOR_ID),existing=space.cards.find(c=>resourceKey(c,owner)===key);
      if(existing) { existing.collectionIds=[...new Set([...(existing.collectionIds||[]),id])];continue; }
      space.cards.push({...structuredClone(source),id:`starter-${owner}-${ref}`,collectionId:id,collectionIds:[],savedFrom:CURATOR_ID,createdAt:now-(index*3+i+2)*hour,sharedAt:now-(index*3+i+2)*hour});
    }
  }
  // Overlapping interests: one URL, several personal collections, one shared discussion.
  for(const [ref,owners]of [['stardew',['sam','maya','alex','zoe']],['pride',['maya','zoe','nora']],['blender',['leo','sam']],['zooniverse',['ines','zoe']],['lichess',['leo','alex','omar']]]){
    const source=entries.get(`library-${ref}`);
    for(const owner of owners){
      const space=data.spaces[owner];
      const specific={blender:{leo:'workshop',sam:'screen'},zooniverse:{ines:'study',zoe:'outside'},lichess:{leo:'games',omar:'open-tools'}}[ref]?.[owner];
      let collection=specific?space.collections.find(c=>c.id===`starter-${owner}-${specific}`):space.collections.find(c=>c.id===`starter-${owner}-downtime`);
      if(!collection){
        collection={id:`starter-${owner}-downtime`,name:ref==='pride'?'Stories for a quiet evening':'Time to switch off',description:ref==='pride'?'A few books to come back to.':'Games and small pleasures for a little downtime.',subjects:ref==='pride'?['reading']:['gaming','play'],icon:ref==='pride'?'book':'game',color:'violet',visibility:'public'};
        space.collections.push(collection);
      }
      if(!collection||space.cards.some(c=>resourceKey(c,owner)===resourceKey(source,CURATOR_ID)))continue;
      space.cards.push({...structuredClone(source),id:`starter-${owner}-${ref}`,collectionId:collection.id,collectionIds:[],savedFrom:CURATOR_ID,createdAt:now-12*hour,sharedAt:now-12*hour});
    }
  }
  for(const [index,card]of library.cards.entries()){
    const count=['library-stardew','library-pride','library-blender','library-zooniverse'].includes(card.id)?5:index%5===0?3:index%3===0?1:0;
    for(let i=0;i<count;i++)data.likes.push({target:`resource:${resourceKey(card,CURATOR_ID)}`,userId:people[(index+i)%people.length],createdAt:now-(i*10+index%35+1)*hour,demo:true});
  }
  for(const [ref,owner,text]of [
    ['stardew','leo','I keep this in my co-op picks. What is everyone growing first?'],
    ['stardew','maya','The same game is in my slow-weekend collection. I like that our conversation stays together.'],
    ['pride','ines','Starting with the ebook edition. You can choose a reading format on the source page.'],
    ['pride','nora','A good example of one book appearing on very different reading lists.'],
    ['godot','omar','A tool can belong in both game making and open-source software. No duplicate card needed.'],
    ['zooniverse','alex','I would start with one small research task and see what catches my curiosity.'],
  ])data.comments.push({id:`starter-comment-${ref}-${owner}`,target:`resource:${resourceKey(entries.get(`library-${ref}`),CURATOR_ID)}`,userId:owner,text,createdAt:now-5*hour,demo:true});
  const postTexts={leo:'What should we play together next? I’ve put a few co-op options beside the solo adventures.',ines:'Building a reading shelf: a familiar classic, a mystery, and something speculative. What would you keep?',nora:'A creative toolkit does not have to be huge. These are a few places I would start.',jules:'A little music-making shelf to sit next to the listening queue. Has anyone tried making their own loop?',omar:'Good tools get better when people share what works. What is missing from this collection?',zoe:'A train trip, a map, and time for a walk. Collecting ideas for a slower weekend.',maya:'What is your dependable weeknight recipe? I’ve started a small kitchen shelf.',sam:'Would you pick a short film or a documentary for our next movie night?',alex:'A collection of questions to follow: the sky, wildlife, and research we can take part in.'};
  const posted=new Set();
  for(const [i,[owner,slug,, ,topic]]of cases.entries())if(!posted.has(owner)){
    posted.add(owner);
    data.wallPosts.push({id:`starter-post-${owner}`,userId:owner,text:postTexts[owner],audience:'public',topic:topicById(topic).label,attachment:{kind:'collection',owner,id:`starter-${owner}-${slug}`},createdAt:now-(i+1)*hour,demo:true});
  }
  // A personal reading status demonstrates that annotations do not become public metadata.
  const reading=data.spaces.ines?.cards.find(c=>c.id==='starter-ines-pride');
  if(reading){reading.tags=['evening reading'];reading.progress='active';reading.note='Private demo note: come back to this chapter.';}
  const xavier=data.spaces.xavier;
  if(xavier){
    const games=createSmartCollection(xavier,'Gaming discoveries',{scope:'everyone',topic:'gaming',kind:'game',sort:'saved',limit:8},'starter-smart-gaming');
    games.color='violet';games.icon='game';games.description='Co-op favorites, small adventures, and clever worlds.';
    const books=createSmartCollection(xavier,'The reading shelf',{scope:'everyone',topic:'reading',kind:'book',sort:'saved',limit:8},'starter-smart-reading');
    books.color='amber';books.icon='book';books.description='A new chapter, chosen by you. Keep a book to make it yours.';
    const social=createSmartCollection(xavier,'Social discoveries',{scope:'everyone',topic:'social',sort:'saved',limit:8},'starter-smart-social');
    social.color='rose';social.icon='users';social.description='Public discoveries, ordered by distinct savers. Your kept cards stay put.';
  }
  for(const post of data.wallPosts)if(post.demo&&!FEED_TOPICS.includes(post.topic)){const match=FEED_TOPICS.find(t=>resolveTopic(t)?.id===resolveTopic(post.topic)?.id);if(match)post.topic=match;}
  syncResources(data);data.starterLibraryVersion=1;return true;
}
