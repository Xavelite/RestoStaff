// Public subjects use stable IDs. Personal tags and collection names stay separate.
const definitions = [
  ['gaming','Gaming','game','violet','Games to play, worlds to build.', 'games videogames video games', [['indie','Indie & adventures','independent platformer'],['strategy','Strategy & simulation','sim management tactics'],['together','Play together','co-op coop cooperative multiplayer'],['making','Game development','gamedev game development game engines game jams make games']]],
  ['reading','Books & reading','book','amber','Stories, ideas, and a little escape.', 'books ebooks e-books reading literature', [['classics','Classics','novels fiction'],['speculative','Sci-fi & fantasy','science fiction speculative'],['mystery','Mystery & gothic','detective horror'],['libraries','Libraries & audio','audiobooks ebook libraries'],['writing','Writing & publishing','authors writing publishing']]],
  ['music','Music','music','violet','Listen, discover, and make a sound.', 'songs albums artists bands listening', [['listen','Listening & discovery','streaming radio'],['rock','Rock','guitars rock'],['making','Music making','production recording audio'],['learning','Learn an instrument','theory practice lessons']]],
  ['film','Film & video','video','rose','Cinema, animation, and moving stories.', 'movies films videos cinema', [['watch','Watch & discover','streaming movies'],['shorts','Shorts & animation','animated short films'],['documentary','Documentaries','documentary factual'],['making','Filmmaking','editing video production']]],
  ['learning','Learning','book','sage','Build a skill, one small step at a time.', 'education courses study learning', [['courses','Courses & skills','online courses'],['languages','Languages','language translation french english'],['math','Math & computing','mathematics programming'],['reference','Reference & research','encyclopedia papers research']]],
  ['science','Science & nature','spark','blue','From your garden to distant galaxies.', 'science nature research', [['space','Space & astronomy','cosmos astronomy planets'],['nature','Nature & wildlife','biodiversity biology animals'],['earth','Earth & climate','climate geology environment'],['participate','Citizen science','citizen science volunteer research']]],
  ['creativity','Art & design','image','rose','Make, photograph, and find inspiration.', 'design art creativity photography', [['design','Graphic design','graphics typography fonts'],['art','Drawing & 3D','illustration painting modelling'],['photo','Photography','photos images photo editing'],['culture','Museums & collections','art museums cultural heritage']]],
  ['technology','Technology','code','blue','Tools and knowledge for building things.', 'technology tech computers', [['code','Code & development','coding programming web developer'],['ai','AI & machine learning','artificial intelligence machine learning'],['open','Open source','opensource software linux'],['privacy','Privacy & security','privacy cybersecurity encryption']]],
  ['work','Work & productivity','briefcase','sage','A calmer place to plan and make progress.', 'work productivity projects', [['notes','Notes & knowledge','notetaking notes wiki'],['planning','Tasks & planning','tasks calendar project management'],['collaborate','Collaboration','teams meetings work together'],['career','Careers & portfolios','jobs career portfolio professional']]],
  ['news','News & society','news','blue','Understand the world from several angles.', 'news society journalism', [['world','World news','international reporting'],['local','Belgium & Europe','belgian brussels european'],['explain','Explainers & evidence','fact checking data journalism'],['civic','Civic life','civics democracy public information']]],
  ['money','Money & business','chart','amber','Learn the basics and organize your finances.', 'finance money business', [['literacy','Financial learning','financial literacy economics'],['budget','Budgeting','personal budget expenses'],['data','Economic data','economy statistics markets'],['business','Starting a business','entrepreneurship startups business']]],
  ['travel','Travel & places','globe','blue','Find a route, a city, or a quiet corner.', 'travel trips holidays places', [['maps','Maps & routes','navigation maps'],['rail','Trains & transit','rail train bus public transport'],['explore','Places & culture','destinations sightseeing tourism'],['plan','Trip planning','itinerary accommodation travel planning']]],
  ['food','Food & cooking','coffee','amber','Good recipes and skills worth keeping.', 'food cooking recipes cuisine', [['recipes','Everyday recipes','meals dinner recipes'],['baking','Baking','bread pastry cakes'],['plants','Plant-based cooking','vegetarian vegan vegetables'],['skills','Kitchen skills','techniques food science']]],
  ['making','Home & making','tools','sage','Repair, grow, and make something useful.', 'home diy making', [['repair','Repair & reuse','fix repair reuse'],['electronics','Electronics & DIY','makers electronics robotics'],['garden','Gardening','plants garden growing'],['home','Home projects','woodworking sewing crafts']]],
  ['outdoors','Sports & outdoors','compass','sage','Move, explore, and spend time outside.', 'sport sports outdoors', [['walk','Walking & hiking','walks hiking trails'],['cycle','Cycling','bikes cycling bicycle'],['sport','Sports & events','athletics football sport'],['move','Movement & practice','fitness exercise running']]],
  ['social','Social & communities','users','rose','Find your people and your conversations.', 'social media communities networks', [['networks','Social networks','social media platforms'],['forums','Forums & discussion','forums discussions questions'],['groups','Groups & interests','communities groups meetups'],['open','Independent social','fediverse decentralized social']]],
  ['tools','Everyday tools','tools','blue','Small helpers for everyday problems.', 'useful tools utilities', [['search','Search & discovery','search engines'],['files','Files & conversion','file document pdf conversion'],['language','Words & translation','dictionary spelling translation'],['everyday','Calculators & utilities','calculators time weather utilities']]],
  ['play','Hobbies & play','smile','amber','Curiosities away from the everyday.', 'hobbies recreation play', [['tabletop','Board games & puzzles','tabletop chess puzzle'],['craft','Creative hobbies','origami knitting craft'],['history','History & curiosity','history archives genealogy'],['collect','Collecting & discovery','collections collecting hobbies']]],
];
export const ROOT_TOPICS = definitions.map(([id,label,icon,color,description,aliases,children])=>({id,label,icon,color,description,aliases,children:children.map(([key,label,aliases])=>({id:`${id}.${key}`,parent:id,label,aliases}))}));
export const TOPICS = ROOT_TOPICS.flatMap(root=>[root,...root.children]);
const byId = new Map(TOPICS.map(topic=>[topic.id,topic]));
const norm = text=>String(text||'').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
const legacy = {design:'creativity',travel:'travel',learning:'learning','useful tools':'tools','social media':'social',music:'music'};
export function topicById(id) { return byId.get(id); }
export function resolveTopic(value) { return byId.get(value) || byId.get(legacy[norm(value)]) || TOPICS.find(t=>norm(t.label)===norm(value)); }
export function topicTrail(id) { const topic=resolveTopic(id);return topic?(topic.parent?[byId.get(topic.parent),topic]:[topic]):[]; }
export function subjectIds(card) { return [...new Set((Array.isArray(card.subjects)?card.subjects:[]).filter(id=>byId.has(id)))]; }
export function subjectLabels(card) { return [...new Set(subjectIds(card).flatMap(id=>topicTrail(id).map(t=>t.label)))]; }
export function subjectText(card) { return subjectIds(card).flatMap(id=>topicTrail(id).map(t=>`${t.label} ${t.aliases}`)).join(' '); }
export function matchesTopic(card,value,legacyTopics=[]) {
  if(!value||value==='all')return true;
  const topic=resolveTopic(value);
  if(!topic)return legacyTopics.includes(value);
  return subjectIds(card).some(id=>id===topic.id||id.startsWith(topic.id+'.')) || legacyTopics.some(label=>resolveTopic(label)?.id===topic.id);
}
export const CONTENT_KINDS = {book:'Book',game:'Game',film:'Film',song:'Song',album:'Album',tool:'Tool',course:'Course',library:'Library',community:'Community',publication:'Publication',guide:'Guide',website:'Website'};

export const GENRES={
  music:['Rock','Alternative rock','Pop','Hip-hop','Jazz','Classical','Electronic','Ambient','Soul','Folk','Metal'],
  film:['Horror','Comedy','Drama','Science fiction','Fantasy','Thriller','Action','Animation','Documentary'],
  gaming:['Tower defense','Strategy','Simulation','Role-playing','Adventure','Platformer','Puzzle','Racing','Survival','Shooter'],
  reading:['Literary fiction','Mystery','Horror','Science fiction','Fantasy','Biography','History','Nonfiction'],
};
