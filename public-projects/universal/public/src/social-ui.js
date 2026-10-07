import { friendControl } from './relationship-controls.js';
import { topicTile } from './topic-tiles.js';
import { personalCollections, toggleResourceFavorite, ownAdditionIsNew } from './collection-experience.js';
import { liveCardActions } from './collection-experience-ui.js';
import { markArrivalSeen } from './dashboard-highlights.js';
import { createCollaborationUI } from './collaboration-ui.js';
import { createResourceConnectionsUI } from './resource-connections-ui.js';
import { categoryPanel } from './category-ui.js';
import { castCategoryVote } from './community-brain.js';
import { communityCard } from './consensus.js';
import { ROOT_TOPICS, CONTENT_KINDS, resolveTopic, topicTrail, matchesTopic } from './topics.js';
import { CURATOR_ID } from './starter-library.js';
import { SORTS, SORT_HELP } from './ranking.js';
import { createSmartCollection, collectionEntries } from './smart-collections.js';
import { contentFields, normalize, inCollection, genreChoices } from "./classification.js";
import { openPopover, closePopover } from "./surfaces.js";
import { createCardComments } from './card-comments.js';
import { createLiveUI } from "./live-ui.js";
import { followCollection, subscription, liveCards, pauseCollection } from "./live-collections.js";
import { cardKind, cardSize, overviewCards } from "./layout.js";
import { icon } from "./icons.js";
import { createCommunityUI } from "./community-ui.js";
import { createMessagesUI } from "./messages-ui.js";
import { canViewPost, allPosts, wallPosts } from "./network.js";
import { escapeHTML as esc, domain } from "./model.js";
import { AUDIENCES, effectiveAudience, canViewCard, canSeeAudience, getCard, publicEntries, resourceKey,
  engagement, toggleLike, addComment, setVisibility, sendFriendRequest, respondToRequest,
  saveSharedCard, searchCards, visibleCollections, visibleRecommendations, areFriends } from "./social.js";

const audienceIcon = { private: "lock", friends: "users", public: "globe", inherit: "collection" };
export function createSocialUI(ctx) {
  const options = { kind:'all', query: "", scope: "everyone", topic: "all", sort: "relevant", tab: "cards", type: "all", artist:"", genre:"", decade:"", layout:"list", filtersOpen:false, profile: "alex", preview: "self", focusCollection: null };
  let resultLimit=24, resultSignature='';
  let hubTab='cards',hubSort='curated',hubType='all',hubTopic='all';
  const collectionDrafts=new Map();
  const collapsed = new Set();
  const drafts = new Map();
  let detail = null, replyingTo = null, profileTab = "collections";
  const data = () => ctx.data();
  const me = () => data().activeUser;
  const ui = () => ctx.ui();
  const person = (id) => data().profiles[id];
  const name = (id) => person(id)?.name || "Visitor";
  const action = (act, text, extra = "", cls = "secondary") => `<button type="button" class="${cls}" data-social="${act}" ${extra}>${text}</button>`;
  const attrs = (owner, id) => `data-owner="${esc(owner)}" data-card-id="${esc(id)}"`;
  const avatar = (id, cls = "") => `<span class="social-avatar tint-${person(id)?.color || "sage"} ${cls}" aria-hidden="true">${esc(name(id).slice(0, 1))}</span>`;
  const audience = (value) => `<span class="audience-label">${icon(audienceIcon[value] || "lock")}${AUDIENCES[value] || "Only me"}</span>`;
  const time = (value) => new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short" }).format(value);
  const collaboration = createCollaborationUI(ctx);
  const connections = createResourceConnectionsUI(ctx,{top,sharedCard});
  const community = createCommunityUI({...ctx,browsePeople:()=>{options.tab="people";options.query="";options.scope="everyone";ctx.render();}}, { action, attrs, avatar, name, profileChip, audience, top, empty });
  const messages = createMessagesUI(ctx, { action, avatar, name, profileChip, top });
  const cardComments = createCardComments(ctx, { viewer, avatar, name, drafts, showDetail });
  const live = createLiveUI(ctx, { action, name, profileChip, top, sharedCard, collectionTile });
  function viewer() {
    if (ui().page === "profile" && options.profile === me() && options.preview !== "self") return options.preview === "public" ? null : (me() === "xavier" ? "alex" : "xavier");
    return me();
  }
  const canSeeNotice = (n) => n.postId ? canViewPost(data(), allPosts(data()).find(p => p.id === n.postId), me()) : n.collectionId ? visibleCollections(data(), n.owner, me()).some((c) => c.id === n.collectionId) : canViewCard(data(), n.owner, data().spaces[n.owner]?.cards.find((c) => c.id === n.cardId), me());
  function unread() { return data().notifications.filter((n) => n.to === me() && !n.read && canSeeNotice(n)).length + data().requests.filter((r) => r.to === me() && r.status === "pending").length; }
  function switchButton() {
    return `<button class="workspace" data-social="switcher" aria-label="Switch demo profile">${avatar(me())}<div class="workspace-copy"><strong>${esc(ctx.state().settings.name)}’s space</strong><p>Community demo ${icon("down")}</p></div><span class="demo-dot" title="Local demo"></span></button>`;
  }
  function navigation() {
    return `<nav class="social-navigation" aria-label="Community navigation">${[
      ["discover", "compass", "Discover"], ["community", "users", "Community"],
    ].map(([page, ico, label]) => action("page", `${icon(ico)}<span>${label}</span>`, `data-page="${page}" title="${label}"`, `nav-item ${ui().page === page ? "active" : ""}`)).join("")}</nav>`;
  }
  function bell() { return action("notifications", `${icon("bell")}${unread() ? `<span class="notification-dot">${unread()}</span>` : ""}`, 'aria-label="Notifications" title="Notifications" aria-haspopup="dialog" aria-expanded="false"', "icon-btn notification-button"); }
  function ownCardTools(card) {
    if(card.launcher)return "";
    const value = effectiveAudience(ctx.state(), card);
    return action("share", icon(audienceIcon[value]), `data-kind="card" data-id="${esc(card.id)}" aria-label="Share ${esc(card.title)}: ${AUDIENCES[value]}" title="Who can see this? ${AUDIENCES[value]}" aria-haspopup="dialog" aria-expanded="false"`, `icon-btn card-audience ${value === (ctx.state().collections.find(c => c.id === card.collectionId)?.visibility || "private") ? "inherited-audience" : ""}`);
  }
  function collectionTools(collection) {
    const value = collection.visibility || "private";
    return action("share", `${icon(audienceIcon[value])}<span>${AUDIENCES[value]}</span>`, `data-kind="collection" data-id="${esc(collection.id)}" aria-label="Share collection ${esc(collection.name)}" title="${AUDIENCES[value]} · Change audience"`, "collection-audience");
  }
  function sharedCard(card, owner, visibleTo = viewer(), context = {}) {
    const preview = visibleTo !== me();
    const visibility = effectiveAudience(data().spaces[owner], card);
    if(context.live&&!preview)return `<article class="card social-card live-member ${context.isNew?'smart-discovery is-new':''} tint-${esc(card.color||'sage')}" data-card="${esc(card.id)}" data-kind="${cardKind(card)}" data-size="${cardSize(card,data().spaces[owner].collections.find(c=>c.id===card.collectionId))}">${context.isNew?'<span class="smart-card-label">'+icon('spark')+'New</span>':''}${action('collection-card-menu',icon('more'),attrs(owner,card.id)+' data-id="'+esc(context.collectionId)+'" aria-label="Options for '+esc(card.title)+'"','icon-btn smart-hide')}<button class="card-main" data-social="open" ${attrs(owner,card.id)} aria-label="Open ${esc(card.title)}">${ctx.cardVisual(card)}${ctx.cardInfo(card)}</button><div class="social-card-footer live-member-actions card-action-bar">${liveCardActions(data(),me(),owner,card)}</div></article>`;
    return `<article class="card social-card tint-${card.color || "sage"}" data-card="${esc(card.id)}" data-kind="${cardKind(card)}" data-size="${cardSize(card, data().spaces[owner].collections.find(c => c.id === card.collectionId))}">
      ${!preview?action("resource-card-menu",icon("more"),attrs(owner,card.id)+` aria-label="Options for ${esc(card.title)}"`,"icon-btn smart-hide"):""}
      ${visibility !== "public" ? `<span class="shared-card-audience" title="${AUDIENCES[visibility]}">${icon(audienceIcon[visibility])}<span>${AUDIENCES[visibility]}</span></span>` : ""}
      <button class="card-main" data-social="open" ${attrs(owner, card.id)} aria-label="Open ${esc(card.title)}">${ctx.cardVisual(card)}${ctx.cardInfo(card)}</button>
      <div class="social-card-footer live-member-actions card-action-bar">${liveCardActions(data(),me(),owner,card,{preview,viewer:visibleTo})}</div>
    </article>`;
  }
  function profileChip(owner) {
    return action("profile", `${avatar(owner)}<span>${esc(name(owner))}</span>${icon("arrow")}`, `data-owner="${esc(owner)}"`, "profile-chip");
  }
  function collectionTile(owner, collection) {
    const cards = data().spaces[owner].cards.filter((c) => inCollection(c, collection.id) && canViewCard(data(), owner, c, me()));
    return `<button class="discovery-collection tint-${collection.color}" data-social="collection" data-owner="${esc(owner)}" data-id="${esc(collection.id)}"><div class="collection-collage">${cards.slice(0, 3).map((c) => `<span>${ctx.cardVisual(c)}</span>`).join("")}</div><div class="discovery-collection-copy"><span class="eyebrow">${esc(name(owner))}’s collection</span><strong>${esc(collection.name)}</strong><p>${esc(collection.description)}</p><span class="collection-tile-meta">${cards.length} cards ${icon("arrow")}</span></div></button>`;
  }
  function hasSearchFilters() {
    return !!options.query || options.topic !== "all" || options.type !== "all" || !!options.artist || !!options.genre || !!options.decade || options.kind!=='all';
  }
  function searchSummary() {
    if (!hasSearchFilters()) return "";
    const parts = [options.query ? `“${options.query}”` : "", options.tab === "cards" && options.topic !== "all" ? (resolveTopic(options.topic)?.label||options.topic) : "", options.tab === "cards" && options.type !== "all" ? ({ link:"Websites", video:"Videos", audio:"Audio", file:"Files & pictures" })[options.type] : "", options.artist, options.genre, options.decade,CONTENT_KINDS[options.kind]].filter(Boolean);
    return `<div class="filter-summary"><span>${parts.map(esc).join(" · ")}</span>${action("clear-search-filters", icon("close") + "Clear filters", "", "text-btn")}</div>`;
  }
  function searchRow(result, index) {
    const {card,ownerId,fields}=result, stats=engagement(data(),ownerId,card,me());
    const saved=ctx.state().cards.some(c=>resourceKey(c,me())===result.key);
    const labels=[fields.artist,fields.genre,fields.decade].filter(Boolean);
    const subject=topicTrail(card.subjects?.[0]).at(-1);
    return `<article class="search-result tint-${card.color}"><span class="result-rank">${index+1}</span><button class="result-art" data-social="open" ${attrs(ownerId,card.id)} aria-label="Open ${esc(card.title)}">${ctx.cardVisual(card)}</button><div class="result-body"><div class="result-source">${esc(domain(card.url)||card.fileName||card.type)}<span>· ${esc(card.type==='video'?'Video':card.type==='audio'?'Audio':CONTENT_KINDS[card.contentKind]||'Resource')}</span></div><button class="result-title" data-social="open" ${attrs(ownerId,card.id)}>${esc(card.title)}</button><p>${esc(card.description||'A discovery shared with the community.')}</p>${fields.creator?`<small class="resource-creator">${esc(fields.creator)}</small>`:''}${subject?`<div class="resource-topic">${action('topic',esc(topicTrail(subject.id).map(t=>t.label).join(' › ')),`data-value="${subject.id}"`,'text-btn')}</div>`:''}${labels.length?`<div class="result-labels">${labels.map(label=>action('facet',esc(label),`data-topic="${esc(card.subjects?.[0]?.split('.')[0]||options.topic)}" data-field="${label===fields.artist?'artist':label===fields.genre?'genre':'decade'}" data-value="${esc(label)}"`,'')).join('')}</div>`:''}<div class="result-signals">${action('like',icon('heart')+stats.likes,attrs(ownerId,card.id)+` aria-label="${stats.liked?'Unlike':'Like'} ${esc(card.title)}" aria-pressed="${stats.liked}"`,`quiet-action ${stats.liked?'liked':''}`)}<span>${icon('bookmark')}${result.owners.size} ${options.scope==='everyone'&&ui().page!=='following'?(result.owners.size===1?'public save':'public saves'):(result.owners.size===1?'save here':'saves here')}</span>${action('comments',icon('comment')+(stats.comments.length||'Discuss'),attrs(ownerId,card.id)+` aria-label="Discuss ${esc(card.title)}"`,'quiet-action')}<details class="rank-explanation"><summary>Why here?</summary><p>${esc(result.reasons.join(' · '))}. ${esc(SORT_HELP[options.sort])} ${options.sort==='trending'?result.recentPeople+' people active this week.':'Repeated collection placements count once.'}</p></details></div></div>${action('save',icon(saved?'check':'plus')+(saved?'Saved':'Save'),attrs(ownerId,card.id)+` aria-label="${saved?'Saved':'Save'} ${esc(card.title)}"`,'secondary result-save')}</article>`;
  }
  function topicNavigation(results) {
    if(!['cards','collections'].includes(options.tab))return '';
    const selected=resolveTopic(options.topic),root=selected?.parent?resolveTopic(selected.parent):selected;
    if(root)return `<section class="topic-browser"><nav class="topic-breadcrumb" aria-label="Topic path">${action('topic','All topics','data-value="all"','text-btn')}${icon('chevron')}${selected.parent?action('topic',esc(root.label),`data-value="${root.id}"`,'text-btn'):`<strong>${esc(root.label)}</strong>`}${selected.parent?icon('chevron')+`<strong>${esc(selected.label)}</strong>`:''}</nav><div class="topic-chips subtopic-chips" aria-label="Subtopics">${action('topic','All '+esc(root.label.toLowerCase()),`data-value="${root.id}" aria-pressed="${selected.id===root.id}"`,selected.id===root.id?'selected':'')}${root.children.map(t=>action('topic',esc(t.label),`data-value="${t.id}" aria-pressed="${selected.id===t.id}"`,selected.id===t.id?'selected':'')).join('')}</div></section>`;
    if(options.query)return '';
    return `<section class="topic-browser"><div class="topic-browser-heading"><div><span class="eyebrow">FOLLOW A CURIOSITY</span><h2>Where shall we start?</h2></div>${action('profile',icon('book')+'Community library',`data-owner="${CURATOR_ID}"`,'text-btn')}</div><div class="topic-browser-grid">${ROOT_TOPICS.map(t=>{const count=results.filter(r=>matchesTopic(r.card,t.id,r.fields.topics)).length;return topicTile(t,count);}).join('')}</div><p class="topic-browser-note">Collected by people. Connected by topic. New public cards join the matching topics automatically.</p></section>`;
  }
  function moreResults(total) { return total>resultLimit?`<div class="discovery-more">${action('more-results',`Show more · ${total-resultLimit} remaining`)}<small>Showing ${Math.min(resultLimit,total)} of ${total}</small></div>`:''; }
  function discoverResults() {
    const signature=JSON.stringify([options.query,options.topic,options.kind,options.type,options.tab,options.scope,options.sort,options.artist,options.genre,options.decade,ui().page,me()]);
    if(signature!==resultSignature){resultLimit=24;resultSignature=signature;}
    const results = searchCards(data(), me(), { ...options, followingOnly: ui().page === "following" });
    const navigation=topicNavigation(results);
    if (options.tab === "artists") {
      const artists=new Map();
      for(const r of results) if(r.fields.artist) { if(!artists.has(r.fields.artist)) artists.set(r.fields.artist,[]); artists.get(r.fields.artist).push(r); }
      return artists.size ? '<div class="artist-grid">'+[...artists].map(([artist,items])=>`<button class="artist-tile tint-${items[0].card.color}" data-social="artist-open" data-value="${esc(artist)}"><span class="artist-symbol">${icon('music')}</span><strong>${esc(artist)}</strong><small>${items.length} shared ${items.length===1?'recording':'recordings'} · ${esc([...new Set(items.map(r=>r.fields.genre).filter(Boolean))].join(', ')||'Music')}</small><span>Explore recordings ${icon('arrow')}</span></button>`).join('')+'</div>' : empty('No artists found','Try a name, a genre, or a different decade.');
    }
    if (options.tab === "people") {
      const people = Object.keys(data().profiles).filter((id) => id !== me() && (options.scope !== "friends" || areFriends(data(), me(), id)) && `${name(id)} ${person(id).bio}`.toLowerCase().includes(options.query.toLowerCase()) && (ui().page !== "following" || data().follows.some((f) => f.from === me() && f.to === id)));
      return people.length ? `<div class="people-grid">${people.map((id) => `<article class="person-card">${avatar(id, "large")}<h2>${esc(name(id))}</h2><p>${esc(person(id).bio)}</p><span>${visibleCollections(data(), id, me()).length} shared collections</span><div class="person-connection-actions">${friendControl(data(),me(),id)}${action("follow",data().follows.some(f=>f.from===me()&&f.to===id)?"Following":"Follow",`data-owner="${id}"`)}</div>${action("profile", "Visit space " + icon("arrow"), `data-owner="${id}"`)}</article>`).join("")}</div>` : empty("No people found", options.query ? "Try a different name or clear your search above." : "No people match this audience yet.");
    }
    if (options.tab === "collections") {
      const items = Object.keys(data().profiles).flatMap((owner) => visibleCollections(data(), owner, me()).map((collection) => ({ owner, collection }))).filter(({ owner, collection }) =>
        (options.scope === "mine" ? owner === me() : options.scope === "friends" ? areFriends(data(), me(), owner) : ui().page === "following" || collection.visibility === "public") &&
        `${collection.name} ${collection.description} ${name(owner)}`.toLowerCase().includes(options.query.toLowerCase()) &&
        (options.topic==='all'||matchesTopic(collection,options.topic)||data().spaces[owner].cards.some(c=>inCollection(c,collection.id)&&canViewCard(data(),owner,c,me())&&matchesTopic(c,options.topic,contentFields(c).topics))) &&
        (ui().page !== "following" || data().follows.some((f) => f.from === me() && f.to === owner) || data().collectionFollows.some((f) => f.userId === me() && f.owner === owner && f.collectionId === collection.id)));
      return navigation+(items.length ? `<div class="discovery-collections">${items.slice(0,resultLimit).map(({ owner, collection }) => collectionTile(owner, collection)).join("")}</div>${moreResults(items.length)}` : empty("No collections found", "Try another search or audience."));
    }
    if (!results.length) return navigation+(hasSearchFilters()
      ? empty("No cards match just yet.", "Try another word, format, or topic. You can clear your filters above.")
      : empty(ui().page === "following" ? "Your people. Your next discoveries." : "Nothing shared here yet.", ui().page === "following" ? "Follow people or a living collection to bring their shared cards here." : "Try Everyone to explore more shared cards, or visit someone’s space.", action("page", "Explore everyone " + icon("arrow"), 'data-page="discover" data-reset-search="true"', "primary")));
    return `${navigation}<div class="results-heading"><span role="status">${results.length} ${results.length===1?'resource':'resources'}${options.query?` for “${esc(options.query)}”`:''}</span><span>One resource. Shared perspectives.</span></div>${options.layout==='grid'?`<div class="cards-grid discovery-grid">${results.slice(0,resultLimit).map(r=>`<div class="discovery-result">${sharedCard(r.card,r.ownerId)}<div class="result-credit">${profileChip(r.ownerId)}<span>${r.owners.size} savers</span></div></div>`).join('')}</div>`:`<div class="search-result-list">${results.slice(0,resultLimit).map(searchRow).join('')}</div>`}${moreResults(results.length)}`;

  }
  function featuredCollections() {
    if (ui().page !== "discover" || options.query || options.tab !== "cards" || options.topic !== "all" || options.scope !== "everyone" || options.type !== "all") return "";
    const items = Object.entries(data().spaces).flatMap(([owner, space]) => space.collections.filter((c) => c.visibility === "public").map((collection) => ({ owner, collection }))).slice(0, 2);
    return items.length ? '<section class="featured-collections"><div class="featured-heading"><span class="eyebrow">CURATED SPACES</span><h2>Follow a curiosity.</h2></div><div class="discovery-collections">' + items.map(({ owner, collection }) => collectionTile(owner, collection)).join("") + '</div></section>' : "";
  }
  function empty(title, text, buttons = "") {
    return `<div class="social-empty">${icon("compass")}<h2>${esc(title)}</h2><p>${esc(text)}</p>${buttons}</div>`;
  }
  function top() {
    const searching = ["discover", "following"].includes(ui().page);
    return ctx.topbar({ scope: searching ? options.scope : "everyone", query: searching ? options.query : "", searchId: searching ? "social-search" : "global-query" });
  }
  function followingLabel() { return ui().page === "following" ? "People I follow" : ""; }
  function search(scope, query) {
    if (!["discover", "following"].includes(ui().page)) Object.assign(options, { topic:"all", kind:"all", type:"all", tab:"cards", artist:"",genre:"",decade:"" });
    Object.assign(options, { scope, query });
    if (ui().page !== "following") ui().page = "discover";
    ctx.render(); window.scrollTo(0,0);
    document.querySelector("#social-search")?.focus();
  }
  function discoveryPage() {
    const following=ui().page==='following', music=resolveTopic(options.topic)?.id.startsWith('music')||options.tab==='artists'||!!options.artist;
    const allMusic=searchCards(data(),me(),{scope:options.scope,followingOnly:following,topic:options.topic,kind:options.kind});
    const artists=[...new Set(allMusic.map(r=>r.fields.artist).filter(Boolean))].sort();
    const select=(id,label,values,current)=>`<label>${label}<select id="${id}" aria-label="${label}"><option value="">Any ${label.toLowerCase()}</option>${values.map(value=>`<option value="${esc(value)}" ${current===value?'selected':''}>${esc(value)}</option>`).join('')}</select></label>`;
    return `${top()}<section class="search-hero"><div><span class="eyebrow">${following?'YOUR PEOPLE, YOUR DISCOVERIES':'THE WEB, THROUGH PEOPLE'}</span><h1>${options.artist?esc(options.artist):following?'Follow your curiosity.':'Find something worth keeping.'}</h1><p>${options.artist?'Recordings, performances, and the people who collect them.':'Good links. Great sounds. Useful things. Collected by people.'}</p></div><span class="community-demo-badge">${icon('users')}${Object.values(data().profiles).filter(p=>p.role!=='curator').length} demo people · 1 library</span></section>
    <section class="discovery-search-area"><div class="discover-paths"><div class="search-suggestions">${['Tower defense','90s horror','80s rock','Jane Austen'].map(q=>action('suggested-query',q,`data-value="${q}"`,'search-suggestion')).join('')}</div>${action('page',icon(following?'compass':'users')+(following?'Explore everyone':'People I follow'),`data-page="${following?'discover':'following'}"`,'text-btn')}</div>
    <div class="discovery-controls"><div class="social-tabs" role="group" aria-label="Search results">${[['cards','Resources'],['collections','Collections'],['artists','Artists & groups'],['people','People']].map(([tab,label])=>action('tab',label,`data-value="${tab}" aria-pressed="${options.tab===tab}"`,options.tab===tab?'selected':'')).join('')}</div><div class="search-selects">${options.tab==='cards'?`<select id="social-sort" aria-label="Sort results">${Object.entries(SORTS).map(([v,l])=>`<option value="${v}" ${options.sort===v?'selected':''}>${l}</option>`).join('')}</select>${action('search-layout',icon(options.layout==='list'?'grid':'list'),`aria-label="Show results as ${options.layout==='list'?'grid':'list'}"`,'icon-btn')}`:''}${action('save-search',icon('bookmark')+'Save search','','secondary save-search-button')}</div></div>
    ${['cards','collections','artists'].includes(options.tab)?`<div class="topic-select-row"><label>Topic<select id="search-topic" aria-label="Topic"><option value="all">All topics</option>${ROOT_TOPICS.map(root=>`<optgroup label="${esc(root.label)}"><option value="${root.id}" ${resolveTopic(options.topic)?.id===root.id?'selected':''}>All ${esc(root.label.toLowerCase())}</option>${root.children.map(t=>`<option value="${t.id}" ${options.topic===t.id?'selected':''}>${esc(t.label)}</option>`).join('')}</optgroup>`).join('')}</select></label>${options.tab==='cards'?`<label>Looking for<select id="search-kind" aria-label="Resource kind"><option value="all">Anything</option>${Object.entries(CONTENT_KINDS).map(([id,label])=>`<option value="${id}" ${options.kind===id?'selected':''}>${label}</option>`).join('')}</select></label>`:''}</div><details class="search-refine" ${music||options.filtersOpen?'open':''}><summary>${icon('settings')}Refine your search</summary><div class="search-facets"><label>Format<select id="social-type" aria-label="Card type"><option value="all">All formats</option>${[['link','Links'],['video','Videos'],['audio','Audio'],['file','Files & pictures']].map(([v,l])=>`<option value="${v}" ${options.type===v?'selected':''}>${l}</option>`).join('')}</select></label>${(music?select('search-artist','Artist or group',artists,options.artist):'')+select('search-genre','Genre',genreChoices(allMusic.map(r=>r.fields.genre)),options.genre)+select('search-decade','Decade',[...new Set(allMusic.map(r=>r.fields.decade).filter(Boolean))].sort(),options.decade)}</div></details>`:''}</section>
    <div id="social-results">${searchSummary()}${discoverResults()}</div><p class="discovery-note">${icon('leaf')}Demo activity from fictional profiles. Your private saves stay private.</p>`;
  }
  function relationship(owner) {
    const following = data().follows.some((f) => f.from === me() && f.to === owner);
    if(person(owner)?.role==='curator')return action("follow",icon(following?"check":"plus")+(following?"Following library":"Follow library"),`data-owner="${owner}" aria-pressed="${following}"`,following?"secondary connected":"primary");
    const incoming=data().follows.some(f=>f.from===owner&&f.to===me());
    return friendControl(data(),me(),owner)+action('follow',icon(following?'check':'plus')+(following?'Following':'Follow'),`data-owner="${esc(owner)}" aria-pressed="${following}"`,'secondary')+action('message-open',icon('comment')+'Message',`data-owner="${esc(owner)}"`,'secondary')+(incoming?'<span class="follows-you">Follows you</span>':'');

  }
  function collectionHub() {
    const owner=options.profile,as=viewer(),collection=visibleCollections(data(),owner,as).find(c=>c.id===options.focusCollection);
    if(!collection)return top()+empty('This collection is no longer shared.','Return to Discover to find something new.',action('page','Discover','data-page="discover"','primary'));
    const follow=as===me()?subscription(data(),me(),owner,collection.id):null;
    const all=follow?liveCards(data(),me(),owner,collection.id):data().spaces[owner].cards.filter(c=>inCollection(c,collection.id)&&canViewCard(data(),owner,c,as));
    const isNew=c=>as===me()&&(follow?!(follow.seen||[]).includes(resourceKey(c,owner)):owner===me()&&ownAdditionIsNew(data(),me(),collection,c));
    const newCount=all.filter(isNew).length;
    const cards=all.map(c=>communityCard(data(),resourceKey(c,owner),c)).filter(c=>(hubType==='all'||c.type===hubType)&&matchesTopic(c,hubTopic));
    if(hubSort==='liked')cards.sort((a,b)=>engagement(data(),owner,b,as).likes-engagement(data(),owner,a,as).likes);
    if(hubSort==='recent')cards.sort((a,b)=>(b.sharedAt||b.createdAt)-(a.sharedAt||a.createdAt));
    const followers=data().collectionFollows.filter(f=>f.owner===owner&&f.collectionId===collection.id),following=followers.some(f=>f.userId===me());
    const comments=data().comments.filter(c=>c.target==='collection:'+owner+':'+collection.id),readOnly=as!==me()||collection.visibility==='private';
    const attrs='data-owner="'+esc(owner)+'" data-id="'+esc(collection.id)+'"';
    const media=cards.filter(c=>c.type==='video'||c.type==='audio');
    if(hubTab==='discussion')detail={owner,collectionId:collection.id};
    return top()+'<section class="collection-hub-hero tint-'+collection.color+'"><div class="hub-breadcrumb">'+action('profile','← '+esc(name(owner))+'’s space','data-owner="'+esc(owner)+'"','text-btn')+audience(collection.visibility||'private')+'</div><div class="collection-hub-identity"><span class="hub-symbol">'+icon(collection.icon)+'</span><div><span class="eyebrow">A COLLECTION BY '+esc(name(owner)).toUpperCase()+'</span><h1>'+esc(collection.name)+'</h1><p>'+esc(collection.description)+'</p><div class="hub-facts"><span>'+all.length+' cards</span><span>'+followers.length+' followers</span><span>'+comments.length+' comments</span></div></div></div><div class="hub-actions">'+(owner!==me()?action('hub-follow',icon(following?'check':'plus')+(following?'Following':'Follow collection'),attrs+' aria-pressed="'+following+'"','primary'):action('go-saved','Open on my dashboard '+icon('arrow'),'data-id="'+esc(collection.id)+'"','primary'))+(following?action('hub-pause',icon(follow.paused?'pause':'repeat')+'Updates '+(follow.paused?'off':'on'),attrs+' role="switch" aria-label="Automatic updates" aria-checked="'+!follow.paused+'"','secondary automatic-updates')+action('live-open',icon('settings'),attrs+' aria-label="Collection options"','icon-btn'):'')+(newCount?action('collection-mark-seen',newCount+' new · Mark seen',attrs,'text-btn'):'')+(media.length?action('hub-play',icon('play')+'Play collection',attrs,'secondary'):'')+action('message-share',icon('share')+'Send collection','data-attachment="'+esc('collection|'+owner+'|'+collection.id)+'"','secondary')+'</div>'+(collection.smart?.enabled?'<p class="hub-smart-note">Only cards you deliberately add are shared here. Your automatic matches stay personal.</p>':'')+'</section>'+collaboration.render(owner,collection,as!==me())+'<div class="hub-controls"><div class="social-tabs">'+action('hub-tab','Cards · '+all.length,'data-value="cards" aria-pressed="'+(hubTab==='cards')+'"',hubTab==='cards'?'selected':'')+action('hub-tab','Conversation · '+comments.length,'data-value="discussion" aria-pressed="'+(hubTab==='discussion')+'"',hubTab==='discussion'?'selected':'')+'</div>'+(hubTab==='cards'?'<div class="search-selects">'+(collection.communityManaged?'<select id="hub-topic" aria-label="Collection topic"><option value="all">All subtopics</option>'+(ROOT_TOPICS.find(t=>collection.subjects?.includes(t.id))?.children||[]).map(t=>'<option value="'+t.id+'" '+(hubTopic===t.id?'selected':'')+'>'+esc(t.label)+'</option>').join('')+'</select>':'')+'<select id="hub-type" aria-label="Collection content type">'+Object.entries({all:'All content',link:'Websites',video:'Videos',audio:'Music',file:'Files & pictures'}).map(([v,l])=>'<option value="'+v+'" '+(hubType===v?'selected':'')+'>'+l+'</option>').join('')+'</select><select id="hub-sort" aria-label="Collection card order">'+Object.entries({curated:'Collection order',liked:'Most liked',recent:'Recently added'}).map(([v,l])=>'<option value="'+v+'" '+(hubSort===v?'selected':'')+'>'+l+'</option>').join('')+'</select></div>':'')+'</div>'+(hubTab==='cards'?'<div class="cards-grid profile-cards collection-hub-grid">'+(cards.map(c=>sharedCard(c,owner,as,{live:true,collectionId:collection.id,isNew:isNew(c)})).join('')||empty('A little room for discovery.','No visible cards match this filter.'))+'</div>':'<section class="hub-discussion">'+commentsHTML(comments,readOnly)+(!readOnly?'<form id="social-collection-comment-form" data-owner="'+esc(owner)+'" data-id="'+esc(collection.id)+'" class="comment-form"><label for="collection-comment">Add to the conversation</label><textarea id="collection-comment" name="comment" maxlength="1500" required rows="2" placeholder="A recommendation, an idea, a question…">'+esc(collectionDrafts.get(owner+':'+collection.id)||'')+'</textarea><button type="submit" class="primary">Post comment</button><p class="social-form-error" role="alert"></p></form>':'<p class="form-hint">This collection’s conversation follows its audience.</p>')+'</section>');
  }
  function quickSave(owner,id,trigger) {
    if(trigger.closest("dialog")){showSave(owner,id);return;}
    const card=getCard(data(),owner,id,me()),existing=ctx.state().cards.find(c=>resourceKey(c,me())===resourceKey(card,owner));
    openPopover(trigger,existing?'Already in your space':'Save to a collection',existing?'<p class="form-hint">'+esc(existing.title)+'</p><div class="menu-list">'+action('go-saved','Open in my space '+icon('arrow'),'data-id="'+esc(ctx.state().collections.find(c=>c.id===existing.collectionId)?.system==='favorites'?'favorites':existing.collectionId)+'"','')+'<button data-action="organize-card" data-id="'+esc(existing.id)+'">'+icon('collection')+'Add to more collections</button></div>':'<div class="menu-list quick-save-list">'+personalCollections(ctx.state()).map(c=>action('save-into',icon(c.icon)+esc(c.name),attrs(owner,id)+' data-id="'+esc(c.id)+'"','')).join('')+'</div><p class="form-hint">'+icon('lock')+'Your copy starts private.</p>'+action('save-more','New collection or rename…',attrs(owner,id),'text-btn'),'save-popover');
  }
  function profilePage() {
    if(options.focusCollection)return collectionHub();
    const owner = options.profile;
    const own = owner === me();
    const as = viewer();
    const space = data().spaces[owner];
    const collections = visibleCollections(data(), owner, as).filter((c) => !options.focusCollection || c.id === options.focusCollection);
    if(person(owner)?.role==='curator'){
      const resources=new Set(space.cards.filter(c=>canViewCard(data(),owner,c,as)).map(c=>resourceKey(c,owner)));
      return top()+'<section class="library-hero"><div><span class="eyebrow">COLLECTED BY PEOPLE</span><h1>The community library.</h1><p>Explore by topic. Find great resources, collections, and people around what you love.</p><small>'+resources.size+' resources · '+collections.length+' topics · shaped by the community</small></div>'+relationship(owner)+'</section><div class="topic-browser-grid library-topic-grid">'+ROOT_TOPICS.map(t=>{const c=collections.find(c=>c.subjects?.includes(t.id));if(!c)return '';const count=new Set(space.cards.filter(card=>inCollection(card,c.id)&&canViewCard(data(),owner,card,as)).map(card=>resourceKey(card,owner))).size;return topicTile(t,count,{owner,collectionId:c.id});}).join('')+'</div><p class="topic-browser-note">Public contributions keep this library growing. Your personal collections and private notes stay yours.</p>';
    }
    const count = collections.reduce((n, c) => n + space.cards.filter((x) => inCollection(x, c.id) && canViewCard(data(), owner, x, as)).length, 0);
    return `${top(own ? "My profile" : `${name(owner)}’s space`)}<section class="profile-hero tint-${person(owner).color}"><div class="profile-cover"><span></span><span></span><span></span>${audience("public")}</div><div class="profile-main">${avatar(owner, "profile-avatar")}<div class="profile-identity"><span class="eyebrow">@${esc(person(owner).handle)}</span><h1>${esc(name(owner))}${person(owner).role==='curator'?'<span class="curator-label">Community library</span>':''}</h1><p>${esc(person(owner).bio)}</p><div class="profile-facts"><span>${collections.length} ${collections.length === 1 ? "collection" : "collections"}</span><span>${count} visible cards</span><span>${wallPosts(data(), as, { owner }).length} posts</span><span>${data().follows.filter((f) => f.to === owner).length} followers</span></div></div><div class="profile-actions">${own ? action("edit-profile", icon("edit") + "Edit profile") : relationship(owner)}</div></div></section>
      ${own ? `<div class="profile-preview-bar">${icon("globe")}<strong>See your space as</strong><select id="profile-preview" aria-label="Preview profile as"><option value="self" ${options.preview === "self" ? "selected" : ""}>Yourself</option><option value="public" ${options.preview === "public" ? "selected" : ""}>A public visitor</option><option value="other" ${options.preview === "other" ? "selected" : ""}>${esc(name(me() === "xavier" ? "alex" : "xavier"))}</option></select><span>${options.preview === "self" ? "Only you can see your private cards." : "Showing only what this person can see."}</span></div>` : `<div class="profile-preview-bar">${icon(areFriends(data(), me(), owner) ? "users" : "globe")}<span>${areFriends(data(), me(), owner) ? "You’re friends. Public and friends-only collections are visible." : "You’re seeing public collections. Friends can see a little more."}</span></div>`}
      ${!options.focusCollection ? `<div class="profile-content-tabs feed-tabs" role="group" aria-label="Profile content">${["collections", "posts"].map((value) => action("profile-tab", value[0].toUpperCase() + value.slice(1), `data-value="${value}" aria-pressed="${profileTab === value}"`, profileTab === value ? "selected" : "")).join("")}</div>` : ""}
      ${profileTab === "posts" ? `<div class="profile-recommendations">${community.renderPosts(owner, as)}</div>` : ""}
      ${options.focusCollection ? action("all-collections", "← All collections", "", "text-btn profile-back") : ""}
      ${profileTab === "posts" ? "" : person(owner).role==='curator'?`<div class="discovery-collections">${collections.map(collection=>collectionTile(owner,collection)).join('')}</div>`: collections.length ? collections.map((collection) => {
        const cards = space.cards.filter((c) => inCollection(c, collection.id) && canViewCard(data(), owner, c, as));
        const shown = options.focusCollection ? cards : overviewCards(cards, collection);
        const key = `${owner}:${collection.id}`;
        const follows = data().collectionFollows.some((f) => f.userId === me() && f.owner === owner && f.collectionId === collection.id);
        return `<section class="collection-section tint-${collection.color} ${collapsed.has(key) ? "is-collapsed" : ""}" id="shared-${esc(collection.id)}"><div class="section-heading"><h2 class="section-title"><button class="collection-heading-button" data-social="fold" data-id="${esc(key)}" aria-expanded="${!collapsed.has(key)}" title="${collapsed.has(key) ? "Expand" : "Collapse"} ${esc(collection.name)}"><span class="section-icon">${icon(collection.icon)}</span><span>${esc(collection.name)}</span></button></h2><span class="section-count">${cards.length}</span><div class="section-actions">${audience(collection.visibility || "private")}${!own ? action("follow-collection", icon(follows ? "check" : "plus") + `<span>${follows ? "Following" : "Follow collection"}</span>`, `data-owner="${owner}" data-id="${esc(collection.id)}" aria-pressed="${follows}"`, "collection-play") : ""}${action("collection-discussion", icon("comment"), `data-owner="${owner}" data-id="${esc(collection.id)}" aria-label="Discuss collection ${esc(collection.name)}"`, "icon-btn")}${!options.focusCollection ? action("collection", "See all " + icon("arrow"), `data-owner="${owner}" data-id="${esc(collection.id)}"`, "see-all") : ""}${action("fold", icon("down"), `data-id="${esc(key)}" aria-label="${collapsed.has(key) ? "Expand" : "Collapse"} ${esc(collection.name)}" aria-expanded="${!collapsed.has(key)}"`, "icon-btn")}</div></div>${collapsed.has(key) ? "" : `<p class="shared-collection-description">${esc(collection.description)}</p><div class="cards-grid profile-cards">${shown.map((c) => sharedCard(c,owner,as,{live:true,collectionId:collection.id,isNew:as===me()&&(owner===me()?ownAdditionIsNew(data(),me(),collection,c):!!subscription(data(),me(),owner,collection.id)&&!(subscription(data(),me(),owner,collection.id).seen||[]).includes(resourceKey(c,owner)))})).join("")}</div>`}</section>`;
      }).join("") : empty("A space taking shape.", own ? "Share a collection from your dashboard to let others discover it." : "Nothing is shared with this audience yet.", own ? action("own-space", "Go to my dashboard", "", "primary") : "")}`;
  }
  function render() { return ui().page === "entity" ? connections.render() : ui().page === "live" ? live.render() : ui().page === "profile" ? profilePage() : ui().page === "community" ? community.render() : ui().page === "messages" ? messages.render() : discoveryPage(); }
  function showSwitcher() {
    ctx.modal("Try another point of view.", `${Object.values(data().profiles).filter(p=>p.role!=='curator').length} demo perspectives. One shared universe.`, `<div class="demo-profiles">${Object.keys(data().profiles).filter(id=>person(id).role!=='curator').map((id) => action("switch", `${avatar(id, "large")}<span><strong>${esc(name(id))}${person(id).role==='curator'?'<span class="curator-label">Library</span>':''}</strong><small>@${esc(person(id).handle)} · ${id === me() ? "You’re here" : "Switch to this space"}</small></span>${icon(id === me() ? "check" : "arrow")}`, `data-user="${id}"`, `demo-profile ${id === me() ? "selected" : ""}`)).join("")}</div><p class="demo-explanation">This is a local demo: all profiles live in this browser. Nothing is published online. Switch profiles to try friend requests, comments, and sharing from both sides.</p>`);
  }
  function commentsHTML(comments, readOnly = false) {
    const row = (c, reply = false) => `<article class="comment-row ${reply ? "comment-reply" : ""}">${avatar(c.userId)}<div><div class="comment-byline"><strong>${esc(name(c.userId))}</strong><time>${time(c.createdAt)}</time>${c.userId === me() && !readOnly ? action("delete-comment", icon("trash"), `data-id="${esc(c.id)}" aria-label="Delete your comment"`, "icon-btn") : ""}</div><p>${esc(c.text)}</p>${!readOnly && detail?.id ? action("reply", "Reply", `data-id="${c.id}"`, "comment-reply-button") : ""}</div></article>`;
    return comments.length ? `<div class="comment-list">${comments.filter((c) => !c.replyTo || !comments.some((p) => p.id === c.replyTo)).map((c) => row(c) + comments.filter((r) => r.replyTo === c.id).map((r) => row(r, true)).join("")).join("")}</div>` : `<div class="comments-empty">${icon("comment")}<p>Be the first to add something useful.</p></div>`;
  }
  function showDetail(owner, id, scope) {
    const moreOpen = detail?.owner === owner && detail?.id === id && document.querySelector('#dialog.social-detail .card-detail-more')?.open;
    cardComments.close();
    const card = getCard(data(), owner, id, viewer());
    const key = resourceKey(card, owner);
    const publicResource = publicEntries(data()).has(key);
    const savedCard=ctx.state().cards.find(c=>resourceKey(c,me())===key);
    const value = effectiveAudience(data().spaces[owner], card);
    scope ||= publicResource ? "community" : "card";
    if (detail?.owner !== owner || detail?.id !== id || detail?.scope !== scope) replyingTo = null;
    const readOnly = viewer() !== me();
    const stats = engagement(data(), owner, card, viewer(), scope);
    const globalStats = engagement(data(), owner, card, viewer());
    const canComment = !readOnly && (scope === "community" ? publicResource : value !== "private");
    detail = { owner, id, scope };
    const shared = publicResource && scope === "community";
    const commentAudience = shared ? "Public discussion" : value === "friends" ? `Friends of ${name(owner)}` : "On this shared card";
    const foundIn = Object.entries(data().spaces).flatMap(([personId,space]) => visibleCollections(data(),personId,viewer()).filter(collection => space.cards.some(c => inCollection(c, collection.id) && canViewCard(data(),personId,c,viewer()) && resourceKey(c,personId) === key)).map(collection => ({ personId,collection })));
    const places = foundIn.length ? '<section class="resource-places"><h3>Collected in</h3>' + foundIn.slice(0,6).map(({personId,collection}) => action("collection", '<span class="place-icon tint-'+collection.color+'">'+icon(collection.icon)+'</span><span><strong>'+esc(collection.name)+'</strong><small>'+esc(name(personId))+'</small></span>'+audience(collection.visibility || 'private')+icon("arrow"), 'data-owner="'+personId+'" data-id="'+esc(collection.id)+'"', "resource-place")).join("") + '</section>' : '';
    ctx.modal(card.title, domain(card.url) || card.fileName || "A card in your space", `<div class="card-detail-layout"><section class="card-detail-overview" aria-label="Card information"><button type="button" class="detail-preview tint-${card.color || "sage"}" data-social="open" ${attrs(owner,id)} aria-label="Open ${esc(card.title)}">${ctx.cardVisual(card)}</button><p class="detail-description">${esc(card.description || "A little discovery, worth keeping.")}</p><div class="detail-owner">${profileChip(owner)}${audience(value)}</div><div class="detail-actions">${!readOnly&&card.type!=="widget"?`<button class="secondary" data-action="compare-add" data-owner="${esc(owner)}" data-id="${esc(id)}">${icon("compare")}Compare</button>`:""}${action("open", `${icon(card.type === "link" ? "arrow" : "play")}${card.type === "link" ? "Open website" : "Open card"}`, attrs(owner, id), "primary")}${!readOnly && (publicResource || value !== "private") ? action("like", `${icon("heart")}${globalStats.likes} ${globalStats.likes === 1 ? "like" : "likes"}`, `${attrs(owner, id)} aria-pressed="${globalStats.liked}" aria-label="${globalStats.liked ? "Unlike" : "Like"} ${esc(card.title)}"`, `secondary ${globalStats.liked ? "liked" : ""}`) : ""}${!readOnly && card.type !== "widget" ? (savedCard?`<button class="secondary is-saved" data-action="organize-card" data-id="${esc(savedCard.id)}" title="Organize your saved card">${icon("check")}Saved</button>`:action("save", `${icon("plus")}Save to my space`, attrs(owner, id))) : ""}${!readOnly && publicResource && card.type !== "widget" ? action("recommend", icon("share") + "Post to community", attrs(owner, id)) : ""}${!readOnly && value !== "private" ? action("message-share", icon("comment") + "Send in message", attrs(owner, id)) : ""}</div>
      ${publicResource ? `<div class="shared-resource-note">${icon("globe")}The same resource connects everyone’s cards. Your title, notes, and collections stay yours.</div>` : ""}
      <details class="card-detail-more"><summary>Details, collections & connections</summary>${categoryPanel(data(),me(),owner,card,readOnly)}${places}${connections.panel(owner,card,viewer())}</details></section><section class="card-detail-conversation" aria-label="Card conversation"><h3>Conversation</h3><div class="discussion-tabs" role="group" aria-label="Discussion audience">${publicResource ? action("discussion-scope", `Community <span>${engagement(data(), owner, card, viewer(), "community").comments.length}</span>`, `data-value="community" aria-pressed="${scope === "community"}"`, scope === "community" ? "selected" : "") : ""}${action("discussion-scope", `${owner === me() ? "On my card" : `On ${esc(name(owner).split(" ")[0])}’s card`} ${icon(audienceIcon[value])}`, `data-value="card" aria-pressed="${scope === "card"}"`, scope === "card" ? "selected" : "")}</div><div class="discussion-audience">${icon(shared ? "globe" : audienceIcon[value])}<strong>${esc(commentAudience)}</strong>${shared ? " · visible to everyone" : value === "private" ? " · this card is private" : " · follows this card’s audience"}</div>${commentsHTML(stats.comments, readOnly)}
      ${canComment ? `<form id="social-comment-form" class="comment-form" data-owner="${owner}" data-card-id="${esc(id)}" data-scope="${scope}"><label for="social-comment">${avatar(me())}<span>Add your perspective</span></label>${replyingTo ? `<div class="replying-to">Replying to ${esc(name(replyingTo.userId))}${action("cancel-reply", icon("close"), 'aria-label="Cancel reply"', "icon-btn")}</div>` : ""}<textarea id="social-comment" name="comment" rows="3" maxlength="1500" placeholder="An experience, a tip, or a question…" required>${esc(drafts.get(me() + ':' + stats.target) || "")}</textarea><div><small>${shared ? "This comment will be public, even if your saved copy is private." : "Only people who can see this card can read this conversation."}</small><button class="primary" type="submit">Post comment ${icon("arrow")}</button></div><p class="social-form-error" role="alert"></p></form>` : `<p class="discussion-private">${readOnly ? "You are previewing another person’s view." : "Your private notes stay yours. Share this card to invite a conversation."}</p>${owner === me() && !readOnly ? action("share", icon("share") + "Sharing settings", `data-kind="card" data-id="${esc(id)}"`) : ""}`}</section></div>`);
    document.querySelector("#dialog").classList.add("social-detail");
    if (moreOpen) document.querySelector('.card-detail-more').open = true;
    ctx.hydrate();
  }
  function quickShare(kind,id,trigger) {
    const space=ctx.state(),item=(kind==='card'?space.cards:space.collections).find(c=>c.id===id);if(!item)return;
    const parent=kind==='card'?space.collections.find(c=>c.id===item.collectionId):null,current=item.visibility||(parent?'inherit':'private'),level={private:0,friends:1,public:2};
    const inherited=parent?.visibility||'private';
    if(document.querySelector('#dialog').open) { const rect=trigger.getBoundingClientRect();ctx.closeModal();trigger={getBoundingClientRect:()=>rect,setAttribute:()=>{}}; }
    const options = (parent ? ['inherit','private','friends','public'] : ['private','friends','public']).map(value => {
      const disabled = parent && value in level && level[value] > level[inherited];
      const label = value === 'inherit' ? 'Same as collection' : AUDIENCES[value];
      const hint = disabled ? 'Change the collection audience to use this option' : value === 'inherit' ? 'Follows changes to this collection' : value === 'private' ? 'Visible only to you' : value === 'friends' ? 'Visible to accepted friends' : 'Visible in public discovery';
      return action('set-audience', icon(audienceIcon[value]) + '<span><strong>' + esc(label) + '</strong>' + (value === 'inherit' ? '<small>' + AUDIENCES[inherited] + '</small>' : '') + '</span>' + (current === value ? icon('check') : ''), 'data-kind="' + kind + '" data-id="' + esc(id) + '" data-value="' + value + '" aria-pressed="' + (current === value) + '" title="' + hint + '" ' + (disabled ? 'disabled' : ''), 'audience-choice');
    }).join('');
    const caption = parent ? '<p class="audience-limit">' + icon(audienceIcon[inherited]) + '<span><strong>' + esc(parent.name) + '</strong> · ' + AUDIENCES[inherited] + (inherited !== 'public' ? '<small>Your collection limits the available choices.</small>' : '') + '</span></p>' : '<p class="popover-caption">Cards marked Only me stay private.</p>';
    const footer = '<div class="audience-menu-footer">' + (parent ? action('share','Collection settings','data-kind="collection" data-id="' + esc(parent.id) + '"','text-btn') : '') + action('share-more','More options ' + icon('arrow'),'data-kind="' + kind + '" data-id="' + esc(id) + '"','text-btn') + '</div>';
    openPopover(trigger, 'Who can see this?', '<div class="quick-audiences">' + options + '</div>' + caption + footer, 'sharing-popover');
  }
  function showShare(kind, id) {
    const space = ctx.state();
    const item = (kind === "card" ? space.cards : space.collections).find((c) => c.id === id);
    if (!item) return;
    const parent = kind === "card" ? space.collections.find((c) => c.id === item.collectionId) : null;
    const current = item.visibility || (parent ? "inherit" : "private");
    const levels = { private: 0, friends: 1, public: 2 };
    ctx.modal(`Share ${kind === "card" ? "this card" : "this collection"}.`, item.title || item.name, `<form id="social-share-form" data-kind="${kind}" data-id="${esc(id)}"><div class="audience-options">${(parent ? ["inherit", "private", "friends", "public"] : ["private", "friends", "public"]).map((value) => {
      const disabled = parent && value in levels && levels[value] > levels[parent.visibility || "private"];
      return `<label class="audience-option ${disabled ? "unavailable" : ""}"><input type="radio" name="audience" value="${value}" ${current === value ? "checked" : ""} ${disabled ? "disabled" : ""}>${icon(audienceIcon[value])}<span><strong>${value === "inherit" ? "Same as collection" : AUDIENCES[value]}</strong><small>${value === "inherit" ? `${esc(parent.name)} · ${AUDIENCES[parent.visibility || "private"]}` : { private: "Keep this just for yourself.", friends: "Visible to accepted friends.", public: "Visible on your profile and in Discover." }[value]}</small></span></label>`;
    }).join("")}</div>${parent ? `<div class="sharing-explanation">${icon("collection")}Your collection sets the widest audience. ${action("share", "Change collection sharing", `data-kind="collection" data-id="${esc(parent.id)}"`, "text-btn")}</div>` : `<div class="sharing-preview"><strong>What will be shared</strong><p>Cards set to “Same as collection” follow this choice. Cards marked “Only me” stay private.</p><ul>${space.cards.filter((c) => c.collectionId === id).map((c) => `<li>${icon(c.visibility === "private" ? "lock" : "check")}<span>${esc(c.title)}</span><small>${c.visibility === "private" ? "Stays private" : c.visibility === "friends" ? "Friends at most" : "Follows collection"}</small></li>`).join("") || "<li>No cards yet.</li>"}</ul></div>`}<p class="form-hint sharing-comment-note">Comments on a card are visible to the people who can see it. Community comments stay public.</p><p class="social-form-error" role="alert"></p></form>`, `<button class="secondary" data-action="close-dialog">Cancel</button><button class="primary" type="submit" form="social-share-form">Save audience</button>`);
  }
  function showSave(owner, id) {
    const card = getCard(data(), owner, id, me());
    const existing = ctx.state().cards.find((c) => resourceKey(c, me()) === resourceKey(card, owner));
    if (existing) {
      const collection = ctx.state().collections.find((c) => c.id === existing.collectionId);
      ctx.modal("Already part of your space.", "One resource. Your own way of organizing it.", `<div class="saved-confirmation">${icon("check")}<h3>${esc(existing.title)}</h3><p>Saved in <strong>${esc(collection?.name || "your dashboard")}</strong>. Your personal title and notes are unchanged.</p></div>`, action("go-saved", "Go to my card " + icon("arrow"), `data-id="${esc(existing.collectionId)}"`, "primary")+`<button class="secondary" data-action="organize-card" data-id="${esc(existing.id)}">Collections, tags & progress</button>`);
      return;
    }
    ctx.modal("Give it a home.", "Save this resource into your own space.", `<form id="social-save-form" data-owner="${owner}" data-card-id="${esc(id)}"><label class="field">Card name<input name="title" maxlength="160" required value="${esc(card.title)}"></label><label class="field">Collection<select name="collection" required>${personalCollections(ctx.state()).map((c) => `<option value="${esc(c.id)}">${esc(c.name)}</option>`).join("")}<option value="__new">＋ New collection</option></select></label><label class="field social-new-collection" hidden>New collection name<input name="newCollection" maxlength="80" placeholder="A name that feels right"></label><div class="shared-resource-note">${icon("lock")}Your saved copy starts private. Public likes and discussion stay connected to the resource.</div><p class="social-form-error" role="alert"></p></form>`, `<button class="secondary" data-action="close-dialog">Cancel</button><button class="primary" type="submit" form="social-save-form">${icon("plus")}Save card</button>`);
  }
  function showNotifications(trigger) {
    const incoming = data().requests.filter((r) => r.to === me() && r.status === "pending");
    const notices = data().notifications.filter((n) => n.to === me() && canSeeNotice(n)).reverse();
    openPopover(trigger, "Notifications", `<div class="notification-list">${incoming.map((r) => `<article>${avatar(r.from)}<div><strong>${esc(name(r.from))}</strong><p>would like to be your friend.</p><div class="notification-actions">${action("request", "Accept", `data-id="${r.id}" data-value="accept"`, "primary")}${action("request", "Decline", `data-id="${r.id}" data-value="decline"`)}</div></div></article>`).join("")}${notices.map((n) => `<article class="${n.read ? "" : "unread"}">${avatar(n.from)}<div><strong>${esc(name(n.from))}</strong><p>${esc(n.text)} ${esc(n.title)}</p>${n.postId ? action("wall-notice", "View conversation", `data-id="${n.postId}"`, "text-btn") : n.collectionId ? action(n.live ? "live-open" : "collection-discussion", n.live ? "View collection" : "View conversation", `data-owner="${n.owner}" data-id="${n.collectionId}"`, "text-btn") : action("comments", "View conversation", attrs(n.owner, n.cardId), "text-btn")}</div></article>`).join("")}${!incoming.length && !notices.length ? empty("All caught up.", "Friend requests and new comments will find you here.") : ""}</div>`);
    notices.forEach((n) => n.read = true);
    const dot = document.querySelector(".notification-button[data-social=notifications] .notification-dot");
    if (dot) { if (unread()) dot.textContent = unread(); else dot.remove(); }
  }
  function showCollectionDiscussion(owner,id) {
    if(!visibleCollections(data(),owner,me()).some(c=>c.id===id))throw Error('This collection is no longer shared.');
    ctx.closeModal();ui().page='profile';options.profile=owner;options.focusCollection=id;options.preview='self';hubTab='discussion';ctx.render();
  }
  async function click(el) {
    if (await cardComments.click(el)) return;
    if(connections.click(el)||await collaboration.click(el))return;
    if (await live.click(el)) return;
    if (await messages.click(el)) return;
    if (await community.click(el)) return;
    const act = el.dataset.social, owner = el.dataset.owner, id = el.dataset.id, cardId = el.dataset.cardId;
    if(act==='more-results'){resultLimit+=24;const box=document.querySelector('#social-results');box.innerHTML=searchSummary()+discoverResults();ctx.hydrate();box.querySelectorAll('.search-result,.discovery-result,.discovery-collection')[resultLimit-24]?.querySelector('button')?.focus({preventScroll:true});return;}
    if(act==='search-layout') { options.layout=options.layout==='list'?'grid':'list';ctx.render();return; }
    if(act==='suggested-query') { Object.assign(options,{query:el.dataset.value,kind:'all',topic:'all',type:'all',tab:'cards',artist:'',genre:'',decade:''});ctx.render();return; }
    if(act==='artist-open') { Object.assign(options,{artist:el.dataset.value,query:'',tab:'cards',topic:'Music'});ctx.render();window.scrollTo(0,0);return; }
    if(act==='facet') { options[el.dataset.field]=el.dataset.value;options.topic=el.dataset.topic||options.topic;ctx.render();return; }
    if(act==='save-search') {
      ctx.modal('Keep this discovery open.', 'Matching cards join this collection automatically. Favorite any card for a lasting personal bookmark.', `<form id="social-save-search"><label class="field">Name<input name="name" maxlength="80" required value="${esc(options.artist||options.query||(options.topic!=='all'?(resolveTopic(options.topic)?.label||options.topic):'My discoveries'))}"></label><p class="form-hint">${esc([options.scope,followingLabel(),options.genre,options.decade].filter(Boolean).join(' · '))}</p><p class="social-form-error" role="alert"></p></form>`, '<button class="secondary" data-action="close-dialog">Cancel</button><button class="primary" type="submit" form="social-save-search">Save smart collection</button>');return;
    }
    if(act==='saved-search') { const saved=ctx.state().savedSearches?.find(s=>s.id===id);if(saved){Object.assign(options,saved.options);ui().page=saved.following?'following':'discover';ctx.render();window.scrollTo(0,0);}return; }
    if(act==='remove-saved-search') { ctx.state().savedSearches=ctx.state().savedSearches.filter(s=>s.id!==id);await ctx.persist();ctx.render();return; }
    if (act === "switcher") { showSwitcher(); return; }
    if (act === "switch") {
      community.reset(); messages.reset(); live.reset();
      detail = null; replyingTo = null; drafts.clear(); profileTab = "collections";
      Object.assign(options, { preview: "self", kind:"all", query: "", scope: "everyone", topic: "all", type: "all", tab: "cards", sort: "relevant", artist:"",genre:"",decade:"" });
      await ctx.switchUser(el.dataset.user); return;
    }
    if (act === "profile-tab") { profileTab = el.dataset.value; ctx.render(); return; }
    if (act === "edit-profile") {
      const profile = person(me());
      ctx.modal("A little introduction.", "Let your collections do the talking. Add a few words about you.", `<form id="social-profile-form"><label class="field">Display name<input name="name" maxlength="40" required value="${esc(profile.name)}"></label><label class="field">About you<textarea name="bio" maxlength="180" rows="3" placeholder="What do you love collecting?">${esc(profile.bio)}</textarea></label><label class="field">Profile color<select name="color" aria-label="Profile color">${["sage", "rose", "blue", "violet", "amber"].map((color) => `<option value="${color}" ${profile.color === color ? "selected" : ""}>${color[0].toUpperCase() + color.slice(1)}</option>`).join("")}</select></label><p class="form-hint">Your name and introduction are public. Your cards keep their own sharing settings.</p><p class="social-form-error" role="alert"></p></form>`, '<button class="secondary" data-action="close-dialog">Cancel</button><button class="primary" type="submit" form="social-profile-form">Save profile</button>'); return;
    }
    if (act === "reply" || act === "cancel-reply") {
      replyingTo = act === "reply" ? data().comments.find((c) => c.id === id) : null;
      showDetail(detail.owner, detail.id, detail.scope);
      document.querySelector("#social-comment")?.focus(); return;
    }
    if (act === "page" || act === "own-space" || act === "profile" || act === "collection") {
      detail = null; ctx.closeModal(); options.focusCollection = null; options.preview = "self"; profileTab = "collections";
      ui().page = act === "own-space" ? "space" : act === "page" ? el.dataset.page : "profile";
      if (ui().page === "profile") options.profile = owner || me();
      if (act === "collection") {options.focusCollection=id;hubTab="cards";hubType="all";hubTopic="all";hubSort="curated";}
      if (el.dataset.resetSearch) Object.assign(options, { scope: "everyone", query: "", topic: "all", kind:"all", type: "all", tab: "cards", artist:"",genre:"",decade:"" });
      if (ui().page === "following") Object.assign(options, { scope: "everyone", query: "", topic: "all", type: "all", artist:"",genre:"",decade:"" });
      ui().mobile = false; ctx.render(); window.scrollTo({ top: 0, behavior: "smooth" }); return;
    }
    if (act === "go-saved") { ctx.closeModal(); ui().page = "space"; ui().collection = id; ui().query = ""; ui().filter = "all"; ctx.render(); return; }
    if (act === "clear-search-filters") {
      Object.assign(options, { query:"", topic:"all", kind:"all", type:"all", artist:"", genre:"", decade:"" }); ctx.render();
      document.querySelector("#social-search")?.focus({ preventScroll: true }); return;
    }
    if (act === "tab" || act === "topic") {
      options[act] = el.dataset.value; if(act==="topic" && !resolveTopic(el.dataset.value)?.id.startsWith("music")) Object.assign(options,{artist:"",genre:"",decade:""}); ctx.render();
      document.querySelector(`[data-social="${act}"][data-value="${CSS.escape(el.dataset.value)}"]`)?.focus({ preventScroll: true }); return;
    }
    if (act === "all-collections") { options.focusCollection = null; ctx.render(); return; }
    if (act === "fold") { collapsed.has(id) ? collapsed.delete(id) : collapsed.add(id); ctx.render(); document.querySelector(`.collection-heading-button[data-id="${CSS.escape(id)}"]`)?.focus({ preventScroll: true }); return; }
    if(act==='category-withdraw'){castCategoryVote(data(),me(),owner,cardId,'');await ctx.persist();ctx.render();showDetail(owner,cardId);return;}
    if (act === "detail") { showDetail(owner, cardId); return; }
    if (act === "discussion-scope") { showDetail(detail.owner, detail.id, el.dataset.value); return; }
    if (act === "share") { detail = null; quickShare(el.dataset.kind, id, el); return; }
    if (act === "share-more") { showShare(el.dataset.kind,id);return; }
    if (act === "set-audience") { setVisibility(data(),me(),el.dataset.kind,id,el.dataset.value);await ctx.persist();ctx.stopPlayback();ctx.closeModal();ctx.render();ctx.toast("Audience updated.");return; }
    if(act==='favorite-resource'){const result=toggleResourceFavorite(data(),me(),owner,cardId);await ctx.persist();ctx.render();ctx.toast(result.favorite?'Added to Favorites. Your bookmark stays when collections update.':'Removed from Favorites.');return;}
    if(act==='hub-pause'){pauseCollection(data(),me(),owner,id);await ctx.persist();ctx.render();return;}
    if(act==='resource-card-menu'){openPopover(el,'Card options','<div class="menu-list">'+action('detail',icon('expand')+'Open full card',attrs(owner,cardId),'')+action('save',icon('collection')+'Save to a collection',attrs(owner,cardId),'')+'</div>');return;}
    if(act==='collection-card-menu'){
      const card=getCard(data(),owner,cardId,me()),f=subscription(data(),me(),owner,id);
      openPopover(el,'Card options','<div class="menu-list">'+action('detail',icon('expand')+'Open full card',attrs(owner,cardId),'')+action('collection-card-seen',icon('check')+'Mark seen',attrs(owner,cardId)+' data-id="'+esc(id)+'"','')+action('save',icon('collection')+'Add to another collection',attrs(owner,cardId),'')+(f?action('collection-card-hide',icon('close')+'Hide from this collection',attrs(owner,cardId)+' data-id="'+esc(id)+'"',''):'')+'</div>');return;
    }
    if(act==='collection-card-seen'||act==='collection-card-hide'||act==='collection-mark-seen'){
      const f=subscription(data(),me(),owner,id);
      if(act==='collection-card-hide'){getCard(data(),owner,cardId,me());if(f)f.hidden=[...new Set([...(f.hidden||[]),cardId])];ctx.stopPlayback();}
      else if(act==='collection-card-seen')markArrivalSeen(data(),me(),resourceKey(getCard(data(),owner,cardId,me()),owner));
      else {const cards=f?liveCards(data(),me(),owner,id):data().spaces[owner].cards.filter(c=>inCollection(c,id)&&canViewCard(data(),owner,c,me()));cards.forEach(c=>markArrivalSeen(data(),me(),resourceKey(c,owner)));}
      await ctx.persist();closePopover();ctx.render();return;
    }
    if(act==='hub-tab'){hubTab=el.dataset.value;ctx.render();return;}
    if(act==='hub-follow'){const current=data().collectionFollows.some(f=>f.userId===me()&&f.owner===owner&&f.collectionId===id);if(current)data().collectionFollows=data().collectionFollows.filter(f=>!(f.userId===me()&&f.owner===owner&&f.collectionId===id));else followCollection(data(),me(),owner,id);await ctx.persist();ctx.render();return;}
    if(act==='hub-play'){const cards=liveCards(data(),me(),owner,id).filter(c=>(hubType==='all'||c.type===hubType)&&matchesTopic(c,hubTopic));if(hubSort==='liked')cards.sort((a,b)=>engagement(data(),owner,b,me()).likes-engagement(data(),owner,a,me()).likes);if(hubSort==='recent')cards.sort((a,b)=>(b.sharedAt||b.createdAt)-(a.sharedAt||a.createdAt));const card=cards.find(c=>c.type==='video'||c.type==='audio');if(card)await ctx.openShared(owner,{...card,collectionId:id},cards.map(c=>({...c,collectionId:id})));return;}
    if(act==='save-more'){showSave(owner,cardId);return;}
    if(act==='save-into'){const c=getCard(data(),owner,cardId,me());saveSharedCard(data(),me(),owner,cardId,id,c.title);await ctx.persist();closePopover();ctx.render();ctx.toast('Saved privately in '+ctx.state().collections.find(c=>c.id===id).name+'.');return;}
    if (act === "save") { quickSave(owner,cardId,el); return; }
    if (act === "open") { const card = getCard(data(), owner, cardId, viewer()); ctx.closeModal(); if(options.focusCollection&&ui().page==='profile'&&owner===options.profile){const cards=liveCards(data(),me(),owner,options.focusCollection).filter(c=>(hubType==='all'||c.type===hubType)&&matchesTopic(c,hubTopic));await ctx.openShared(owner,{...card,collectionId:options.focusCollection},cards.map(c=>({...c,collectionId:options.focusCollection})));}else await ctx.openShared(owner, card); return; }
    if (act === "collection-discussion") { showCollectionDiscussion(owner, id); return; }
    if (act === "like") { toggleLike(data(), me(), owner, cardId); await ctx.persist(); ctx.render(); if (document.querySelector("#dialog").open && detail?.id) showDetail(detail.owner, detail.id, detail.scope); return; }
    if (act === "delete-comment") {
      const at = data().comments.findIndex((c) => c.id === id && c.userId === me());
      if (at >= 0) { data().comments.splice(at, 1); data().comments.forEach((c) => { if (c.replyTo === id) delete c.replyTo; }); }
      await ctx.persist(); ctx.render();
      if (detail?.collectionId) showCollectionDiscussion(detail.owner, detail.collectionId);
      else if (detail?.id) showDetail(detail.owner, detail.id, detail.scope);
      return;
    }
    if (act === "follow") {
      const at = data().follows.findIndex((f) => f.from === me() && f.to === owner);
      if (at >= 0) data().follows.splice(at, 1); else data().follows.push({ from: me(), to: owner });
      await ctx.persist(); ctx.render(); ctx.toast(at < 0 ? `You’re following ${name(owner)}.` : `Unfollowed ${name(owner)}.`); return;
    }
    if (act === "follow-collection") {
      followCollection(data(), me(), owner, id); await ctx.persist();
      await live.click({ dataset: { social: 'live-open', owner, id } }); ctx.toast('Following. Updates appear in your sidebar.'); return;
    }
    if(act==='relationship-more'){
      const request=data().requests.find(r=>[r.from,r.to].includes(me())&&[r.from,r.to].includes(owner)&&['accepted','pending'].includes(r.status));
      let choice=action('friend',icon('users')+'Send friend request',`data-owner="${esc(owner)}"`,'');
      if(request?.status==='accepted')choice='<p class="form-hint">'+icon('check')+' You’re friends.</p>'+action('request','Remove friendship',`data-id="${esc(request.id)}" data-value="remove"`,'');
      else if(request?.status==='pending')choice=request.from===me()?action('request','Cancel friend request',`data-id="${esc(request.id)}" data-value="cancel"`,''):action('request',icon('check')+'Accept friend request',`data-id="${esc(request.id)}" data-value="accept"`,'')+action('request','Decline request',`data-id="${esc(request.id)}" data-value="decline"`,'');
      openPopover(el,'Connection options','<p class="form-hint">Follow to see public updates. An accepted friend request also allows friends-only sharing.</p><div class="menu-list">'+choice+'</div>');return;
    }
    if (act === "friend") { sendFriendRequest(data(), me(), owner); await ctx.persist(); ctx.render(); ctx.toast("Friend request sent. Switch profiles to respond."); return; }
    if (act === "friend-remove") { ctx.modal("Your friendship.", "Friends can see what you share with your circle.", `<p class="form-hint">Removing this friendship hides friends-only cards and conversations from each other.</p>`, action("request", "Remove friendship", `data-id="${id}" data-value="remove"`, "secondary")); return; }
    if (act === "request") { respondToRequest(data(), me(), id, el.dataset.value); ctx.stopPlayback(); await ctx.persist(); ctx.closeModal(); ctx.render(); ctx.toast(el.dataset.value === "accept" ? "You’re friends now." : "Your connection was updated."); return; }
    if (act === "notifications") { detail = null; showNotifications(el); await ctx.persist(); }
  }
  async function submit(form) {
    if (await cardComments.submit(form)) return;
    if(await collaboration.submit(form))return;
    if(form.id==='social-category-form'){const result=castCategoryVote(data(),me(),form.dataset.owner,form.dataset.cardId,form.elements.topic.value);await ctx.persist();ctx.render();showDetail(form.dataset.owner,form.dataset.cardId);document.querySelector('.category-consensus details')?.setAttribute('open','');ctx.toast(result.winner?'Community placement is up to date.':'Your choice is counted. More agreement is needed to move this resource.');return;}
    if(form.id==="social-save-search") { const name=form.elements.name.value.trim();if(!name) throw Error("Give this search a name.");const collection=createSmartCollection(ctx.state(),name,{...options,followingOnly:ui().page==="following"});collection.smart.seen=collectionEntries(data(),me(),collection).map(e=>e.key);await ctx.persist();ctx.closeModal();ui().page="space";ui().collection=collection.id;ui().query="";ui().filter="all";ctx.render();ctx.toast("Smart collection added to your dashboard.");return; }
    if (await live.submit(form)) return;
    if (await messages.submit(form)) return;
    if (await community.submit(form)) return;
    const owner = form.dataset.owner, id = form.dataset.id, cardId = form.dataset.cardId;
    if (form.id === "social-profile-form") {
      const value = form.elements.name.value.trim();
      if (!value) throw Error("Add a display name.");
      Object.assign(person(me()), { name: value, bio: form.elements.bio.value.trim(), color: form.elements.color.value });
      ctx.state().settings.name = value;
      await ctx.persist(); ctx.closeModal(); ctx.render(); ctx.toast("Your profile is a little more you.");
    }
    if (form.id === "social-share-form") {
      setVisibility(data(), me(), form.dataset.kind, id, form.elements.audience.value);
      await ctx.persist(); ctx.closeModal(); ctx.render(); ctx.toast("Audience updated. Preview your profile to see the result.");
    }
    if (form.id === "social-save-form") {
      getCard(data(), owner, cardId, me());
      let collectionId = form.elements.collection.value;
      if (collectionId === "__new") {
        const name = form.elements.newCollection.value.trim();
        if (!name) throw Error("Give your new collection a name.");
        if (ctx.state().collections.some((c) => c.name.toLowerCase() === name.toLowerCase())) throw Error("A collection with that name already exists. Choose it in the list.");
        collectionId = crypto.randomUUID();
        ctx.state().collections.push({ id: collectionId, name, description: "", color: "sage", icon: "collection", collapsed: false, visibility: "private" });
      }
      const result = saveSharedCard(data(), me(), owner, cardId, collectionId, form.elements.title.value);
      await ctx.persist(); ctx.closeModal(); ctx.render(); ctx.toast(result.existing ? "Already saved in your space." : "Saved to your space. Your copy is private.");
    }
    if (form.id === "social-comment-form") {
      const comment = addComment(data(), me(), owner, cardId, form.dataset.scope, form.elements.comment.value, replyingTo?.id);
      replyingTo = null;
      drafts.delete(me() + ':' + comment.target);
      await ctx.persist(); ctx.render(); showDetail(owner, cardId, form.dataset.scope);
    }
    if (form.id === "social-collection-comment-form") {
      const collection = visibleCollections(data(), owner, me()).find((c) => c.id === id);
      if (!collection || (collection.visibility || "private") === "private") throw Error("This collection is not shared.");
      const text = form.elements.comment.value.trim();
      if (!text || text.length > 1500) throw Error("Write a comment of up to 1,500 characters.");
      data().comments.push({ id: crypto.randomUUID(), target: `collection:${owner}:${id}`, userId: me(), text, createdAt: Date.now() });
      if (owner !== me()) data().notifications.push({ id: crypto.randomUUID(), to: owner, from: me(), owner, collectionId: id, title: collection.name, text: "commented on", createdAt: Date.now(), read: false });
      collectionDrafts.delete(owner+':'+id);await ctx.persist(); ctx.render(); showCollectionDiscussion(owner, id);
    }
  }
  function input(el) {
    cardComments.input(el);
    if(el.id==='collection-comment')collectionDrafts.set(options.profile+':'+options.focusCollection,el.value);
    community.input(el); messages.input(el);
    if (el.id === "social-search") { options.query = el.value; document.querySelector("#social-results").innerHTML = searchSummary() + discoverResults(); ctx.hydrate(); }
    if (el.id === "social-comment" && detail?.id) {
      const card = getCard(data(), detail.owner, detail.id, me());
      drafts.set(me() + ':' + engagement(data(), detail.owner, card, me(), detail.scope).target, el.value);
    }
  }
  function change(el) {
    cardComments.change(el);
    if(['hub-sort','hub-type','hub-topic'].includes(el.id)){if(el.id==='hub-sort')hubSort=el.value;else if(el.id==='hub-topic')hubTopic=el.value;else hubType=el.value;ctx.render();return;}
    community.change(el);
    if(el.id==="universal-scope" && ["discover","following"].includes(ui().page)) { options.scope=el.value;document.querySelector("#social-results").innerHTML=searchSummary()+discoverResults();ctx.hydrate(); }
    const key = { "social-scope": "scope", "social-sort": "sort", "social-type": "type", "search-topic":"topic", "search-kind":"kind", "search-artist":"artist", "search-genre":"genre", "search-decade":"decade", "profile-preview": "preview" }[el.id];
    if (key) { if(key==="topic")Object.assign(options,{artist:"",genre:""}); if(el.closest(".search-refine")) options.filtersOpen=true; options[key] = el.value; ctx.render(); document.getElementById(el.id)?.focus({ preventScroll: true }); }
    if (el.closest("#social-save-form") && el.name === "collection") {
      const field = document.querySelector(".social-new-collection"); field.hidden = el.value !== "__new"; field.querySelector("input").required = !field.hidden;
    }
  }
  return { render, dock: messages.dock, beforeRender: () => { cardComments.capture();messages.beforeRender();community.beforeRender(); }, liveNavigation: live.navigation, switchButton, navigation, bell, ownCardTools, collectionTools, click, submit, input, change, showDetail, search, hydrate: () => {messages.hydrate();community.hydrate();cardComments.hydrate();} };
}
