import { recentSupport } from './ranking.js';
import { communityCard } from './consensus.js';
import { matchesTopic, subjectIds } from './topics.js';
import { contentFields, matchResource, normalize, inCollection, genreMatches } from "./classification.js";
import { catalogCards } from "./catalog.js";
import { seedState, uid, videoSource } from "./model.js";

export const AUDIENCES = { private: "Only me", friends: "Friends", public: "Everyone" };
const level = { private: 0, friends: 1, public: 2 };
export function cardTopics(space, card) {
  const label = space.collections.find((c) => c.id === card.collectionId)?.name || "";
  const topics = new Set(contentFields(card).topics);
  if(subjectIds(card).length)return [...topics];
  for (const [topic, pattern] of [["Music", /music|listen|rock|sound/i], ["Design", /design|creat|make something/i],
    ["Travel", /travel|holiday|weekend|places/i], ["Learning", /learn|study|curious/i], ["Useful tools", /tools|utilities/i], ["Social media", /social|communities/i]]) {
    if (pattern.test(label)) topics.add(topic);
  }
  if (card.type === "audio") topics.add("Music");
  return [...topics];
}
export function resourceKey(card, ownerId) {
  if(card.launcher)return `computer:${ownerId}:${card.id}`;
  if (card.fileId) return card.resourceKey || `file:${ownerId}:${card.fileId}`;
  if (card.url?.startsWith("/universal/assets/")) return `asset:${card.url}`;
  const video = videoSource(card.url);
  if (video?.provider === "youtube") return `youtube:${video.id}`;
  if (video?.provider === "vimeo") return `vimeo:${video.id}`;
  if (card.type === "widget") return `widget:${ownerId}:${card.id}`;
  try {
    const url = new URL(card.url);
    for (const key of [...url.searchParams.keys()])
      if (/^utm_/i.test(key) || ["fbclid", "gclid"].includes(key)) url.searchParams.delete(key);
    url.searchParams.sort();
    return `url:${url.href}`;
  } catch { return `local:${ownerId}:${card.id}`; }
}
export function effectiveAudience(space, card) {
  if(card.launcher)return "private";
  const collection = space.collections.find((c) => c.id === card.collectionId);
  const parent = collection?.visibility in level ? collection.visibility : "private";
  const own = card.visibility in level ? card.visibility : parent;
  return level[own] < level[parent] ? own : parent;
}
export function areFriends(data, a, b) {
  return !!a && !!b && data.requests.some((r) => r.status === "accepted" &&
    ((r.from === a && r.to === b) || (r.from === b && r.to === a)));
}
export function canSeeAudience(data, audience, owner, viewer) {
  return owner === viewer || audience === "public" || (audience === "friends" && areFriends(data, owner, viewer));
}
export function canViewCard(data, owner, card, viewer, depth = 0) {
  const space = data.spaces[owner];
  if (!space || !card || depth > 4) return false;
  if(viewer&&owner!==viewer&&(data.feedPreferences?.[viewer]?.blocked?.includes(owner)||data.feedPreferences?.[owner]?.blocked?.includes(viewer)))return false;
  if (!canSeeAudience(data, effectiveAudience(space, card), owner, viewer)) return false;
  if (card.sourceRef) {
    const source = data.spaces[card.sourceRef.owner]?.cards.find((c) => c.id === card.sourceRef.id);
    return canViewCard(data, card.sourceRef.owner, source, viewer, depth + 1);
  }
  return true;
}
export function getCard(data, owner, id, viewer) {
  const card = data.spaces[owner]?.cards.find((c) => c.id === id);
  if (!canViewCard(data, owner, card, viewer)) throw Error("This card is not shared with you.");
  return card;
}
export function publicEntries(data) {
  const entries = new Map();
  for (const [ownerId, space] of Object.entries(data.spaces)) {
    for (const card of space.cards) {
      if (!canViewCard(data, ownerId, card, null)) continue;
      const key = resourceKey(card, ownerId);
      if (!entries.has(key)) entries.set(key, { key, card, ownerId, owners: new Set() });
      entries.get(key).owners.add(ownerId);
    }
  }
  return entries;
}
export function syncResources(data) {
  for (const [key, entry] of publicEntries(data)) {
    if (!data.resources[key]) {
      const { title, description, url, type } = entry.card;
      data.resources[key] = { title, description, url, type };
    }
  }
}
export function targetFor(data, owner, card, scope = "community") {
  const key = resourceKey(card, owner);
  if (scope === "community" && publicEntries(data).has(key)) return `resource:${key}`;
  return `card:${owner}:${card.id}`;
}
export function engagement(data, owner, card, viewer, scope = "community") {
  if (!canViewCard(data, owner, card, viewer)) return { likes: 0, comments: [], liked: false };
  const target = targetFor(data, owner, card, scope);
  return {
    likes: new Set(data.likes.filter((l) => l.target === target).map((l) => l.userId)).size,
    liked: data.likes.some((l) => l.target === target && l.userId === viewer),
    comments: data.comments.filter((c) => c.target === target), target,
  };
}
export function toggleLike(data, viewer, owner, id) {
  const card = getCard(data, owner, id, viewer);
  const target = targetFor(data, owner, card);
  if (target.startsWith("card:") && effectiveAudience(data.spaces[owner], card) === "private")
    throw Error("Share this card before starting a conversation.");
  const at = data.likes.findIndex((l) => l.target === target && l.userId === viewer);
  if (at >= 0) data.likes.splice(at, 1);
  else data.likes.push({ target, userId: viewer, createdAt:Date.now() });
  return at < 0;
}
export function addComment(data, viewer, owner, id, scope, text, replyTo = null) {
  const card = getCard(data, owner, id, viewer);
  const body = text.trim();
  if (!body || body.length > 1500) throw Error("Write a comment of up to 1,500 characters.");
  const target = targetFor(data, owner, card, scope);
  if (scope === "community" && !target.startsWith("resource:")) throw Error("This resource has no public discussion yet.");
  if (target.startsWith("card:") && effectiveAudience(data.spaces[owner], card) === "private")
    throw Error("This card is private. Share it to invite a conversation.");
  const parent = replyTo ? data.comments.find((c) => c.id === replyTo && c.target === target) : null;
  if (replyTo && !parent) throw Error("That conversation has changed. Try replying again.");
  const comment = { id: uid(), target, userId: viewer, text: body, createdAt: Date.now(), ...(parent ? { replyTo: parent.replyTo || parent.id } : {}) };
  data.comments.push(comment);
  const publicSource = target.startsWith("resource:") ? publicEntries(data).get(resourceKey(card, owner)) : null;
  for (const to of new Set([owner, parent?.userId].filter((u) => u && u !== viewer))) data.notifications.push({ id: uid(), to, from: viewer, owner: publicSource?.ownerId || owner, cardId: publicSource?.card.id || id,
    text: parent?.userId === to ? "replied to your comment on" : "commented on", title: card.title, createdAt: Date.now(), read: false });
  return comment;
}
export function setVisibility(data, viewer, kind, id, visibility) {
  if (!(visibility in level) && !(kind === "card" && visibility === "inherit")) throw Error("Choose a valid audience.");
  const space = data.spaces[viewer];
  const item = (kind === "card" ? space.cards : space.collections).find((c) => c.id === id);
  if (!item) throw Error("This item is not in your space.");
  if(kind==="card"&&item.launcher&&visibility!=="private")throw Error("Computer launch cards stay private.");
  item.visibility = visibility;
  item.sharedAt = Date.now();
  syncResources(data);
}
export function sendFriendRequest(data, from, to) {
  if (!data.profiles[to] || from === to) throw Error("Choose another person.");
  const existing = data.requests.find((r) => (r.from === from && r.to === to) || (r.from === to && r.to === from));
  if (existing) return existing;
  const request = { id: uid(), from, to, status: "pending", createdAt: Date.now() };
  data.requests.push(request);
  return request;
}
export function respondToRequest(data, viewer, id, action) {
  const at = data.requests.findIndex((r) => r.id === id);
  const request = data.requests[at];
  if (!request) throw Error("This request is no longer available.");
  if (action === "accept" && request.to === viewer && request.status === "pending") request.status = "accepted";
  else if ((action === "decline" && request.to === viewer && request.status === "pending") ||
    (action === "cancel" && request.from === viewer && request.status === "pending") ||
    (action === "remove" && request.status === "accepted" && [request.from, request.to].includes(viewer))) data.requests.splice(at, 1);
  else throw Error("You cannot change this request.");
}
export function saveSharedCard(data, viewer, owner, id, collectionId, title) {
  const original = getCard(data, owner, id, viewer);
  const card = communityCard(data,resourceKey(original,owner),original);
  const space = data.spaces[viewer];
  if (!space.collections.some((c) => c.id === collectionId)) throw Error("Choose a collection in your space.");
  const key = resourceKey(card, owner);
  const existing = space.cards.find((c) => resourceKey(c, viewer) === key);
  if (existing) return { card: existing, existing: true };
  if (card.type === "widget") throw Error("Add your own widget from the widget library.");
  const copy = { id: uid(), collectionId, title: title?.trim() || card.title,
    description: data.resources[key]?.description || card.description, type: card.type,
    url: card.url, color: card.color, favorite: false, visibility: "private", createdAt: Date.now(), savedFrom: owner };
  for (const field of ["fileId", "fileName", "mime", "fileSize", "sourceURL", "topics", "artist", "genre", "year", "decade", "subjects", "contentKind", "creator", "album", "series"])
    if (card[field]) copy[field] = structuredClone(card[field]);
  if (card.fileId) { copy.resourceKey = key; copy.sourceRef = card.sourceRef || { owner, id }; }
  space.cards.push(copy);
  return { card: copy, existing: false };
}
export function searchCards(data, viewer, { query = "", scope = "everyone", topic = "all", sort = "relevant", type = "all", followingOnly = false, artist = "", genre = "", decade = "", progress = "",kind="all" } = {}) {
  const groups = new Map();
  const followedLibraryKeys=new Set();
  if(followingOnly)for(const [owner,space]of Object.entries(data.spaces))for(const card of space.cards){
    if(card.communityMirror&&canViewCard(data,owner,card,viewer)&&(data.follows.some(f=>f.from===viewer&&f.to===owner)||data.collectionFollows.some(f=>f.userId===viewer&&f.owner===owner&&inCollection(card,f.collectionId))))followedLibraryKeys.add(resourceKey(card,owner));
  }
  // Build indexes once per search, never cache across audience or profile changes.
  const publicKeys=new Set(publicEntries(data).keys()),likes=new Map(),activity=new Map(),recommendations=new Map();
  for(const item of data.likes){if(!likes.has(item.target))likes.set(item.target,new Set());likes.get(item.target).add(item.userId);}
  for(const item of [...data.likes,...data.comments]){if(!activity.has(item.target))activity.set(item.target,[]);activity.get(item.target).push(item);}
  for(const post of data.recommendations||[]){
    const source=data.spaces[post.owner]?.cards.find(c=>c.id===post.cardId);
    if(post.audience!=='public'||!canViewCard(data,post.owner,source,null))continue;
    const key=resourceKey(source,post.owner);if(!recommendations.has(key))recommendations.set(key,new Set());recommendations.get(key).add(post.userId);
  }
  for (const [ownerId, space] of Object.entries(data.spaces)) {
    if(data.feedPreferences?.[viewer]?.blocked?.includes(ownerId)||data.feedPreferences?.[ownerId]?.blocked?.includes(viewer))continue;
    if (scope === "mine" && ownerId !== viewer) continue;
    if (scope === "friends" && (ownerId === viewer || !areFriends(data, viewer, ownerId))) continue;
    for (const original of space.cards) {
      if(original.communityMirror)continue;
      const card=scope==='mine'?original:communityCard(data,resourceKey(original,ownerId),original);
      if (!canViewCard(data, ownerId, card, viewer)) continue;
      if (followingOnly && !followedLibraryKeys.has(resourceKey(card,ownerId)) && !data.follows.some(f => f.from === viewer && f.to === ownerId) && !data.collectionFollows.some(f => f.userId === viewer && f.owner === ownerId && inCollection(card, f.collectionId))) continue;
      if (scope === "everyone" && !followingOnly && !canViewCard(data, ownerId, card, null)) continue;
      if (type !== "all" && card.type !== type) continue;
      if (kind !== "all" && card.contentKind !== kind) continue;
      const collection = space.collections.find(c => c.id === card.collectionId), fields=contentFields(card), topics=cardTopics(space,card);
      if (!matchesTopic(card,topic,topics)) continue;
      if (artist && normalize(fields.artist)!==normalize(artist)) continue;
      if (genre && !genreMatches(fields.genre,genre)) continue;
      if (decade && fields.decade!==decade) continue;
      if (progress && (ownerId!==viewer || (card.progress||'none')!==progress)) continue;
      // Private collection labels and personal annotations never enter someone else's search.
      const labels = space.collections.filter(c=>inCollection(card,c.id)&&canSeeAudience(data,c.visibility||'private',ownerId,viewer)).map(c=>c.name).join(' ');
      const match=matchResource(card,query,labels+' '+topics.join(' '),ownerId===viewer);
      const key=resourceKey(card,ownerId),target=publicKeys.has(key)?`resource:${key}`:`card:${ownerId}:${card.id}`;
      if(!groups.has(key)) groups.set(key,{key,card,ownerId,collection,score:-1,likes:likes.get(target)?.size||0,owners:new Set(),saves:[],matched:false,fields});
      const entry=groups.get(key); if(data.profiles[ownerId]?.role!=='curator'){entry.owners.add(ownerId);entry.saves.push({userId:ownerId,createdAt:card.sharedAt||card.createdAt});}
      if(match.matches && (!entry.matched || match.relevance>entry.score)) Object.assign(entry,{card,ownerId,collection,score:match.relevance,matched:true,fields});
    }
  }
  const results=[...groups.values()].filter(r=>r.matched);
  for(const entry of results) {
    const recommenders=recommendations.get(entry.key)||new Set();
    const trend=recentSupport([...entry.saves,...(activity.get('resource:'+entry.key)||[])]);
    entry.trending=trend.score;entry.recentPeople=trend.people;
    entry.recommendations=recommenders.size;
    entry.popularity=entry.owners.size*3+entry.likes+entry.recommendations*2;
    entry.reasons=[query ? 'Matches your search' : 'Shared in this space', entry.owners.size+' distinct '+(scope==='everyone'&&!followingOnly?'public ':'')+'savers', entry.likes+' likes'];
  }
  return results.sort((a,b)=> sort==='trending' ? b.trending-a.trending || b.popularity-a.popularity : sort==='liked' ? b.likes-a.likes || b.score-a.score : sort==='saved' ? b.owners.size-a.owners.size || b.score-a.score : sort==='popular' ? b.popularity-a.popularity || b.score-a.score : sort==='recent' ? (b.card.sharedAt||b.card.createdAt)-(a.card.sharedAt||a.card.createdAt) : b.score-a.score || b.popularity-a.popularity || a.card.title.localeCompare(b.card.title));
}
export function visibleCollections(data, owner, viewer) {
  return (data.spaces[owner]?.collections || []).filter((c) => c.system!=="favorites"&&canSeeAudience(data, c.visibility || "private", owner, viewer));
}
export function recommendCard(data, userId, owner, cardId, text, audience = "public") {
  const card = getCard(data, owner, cardId, userId);
  if (!["public", "friends"].includes(audience)) throw Error("Choose who can see your recommendation.");
  if (effectiveAudience(data.spaces[owner], card) === "private") throw Error("Share the card first, or choose its public version in Discover.");
  if (audience === "public" && !canViewCard(data, owner, card, null)) throw Error("This card is shared with friends. Your recommendation must be friends-only too.");
  const body = text.trim();
  if (!body || body.length > 1000) throw Error("Add a few words, up to 1,000 characters.");
  const post = { id: uid(), userId, owner, cardId, text: body, audience, createdAt: Date.now() };
  data.recommendations.push(post);
  return post;
}
export function visibleRecommendations(data, viewer, filter = "all") {
  return (data.recommendations || []).filter((p) => canSeeAudience(data, p.audience, p.userId, viewer) &&
    canViewCard(data, p.owner, data.spaces[p.owner]?.cards.find((c) => c.id === p.cardId), viewer) &&
    (filter === "friends" ? areFriends(data, viewer, p.userId) : filter === "following" ? data.follows.some((f) => f.from === viewer && f.to === p.userId) : true))
    .sort((a, b) => b.createdAt - a.createdAt);
}
export function recommendationReason(data, viewer, post) {
  if (post.userId === viewer) return { score: 0, text: "Your recommendation" };
  const card = data.spaces[post.owner]?.cards.find((c) => c.id === post.cardId);
  if (!card) return { score: 0, text: "Shared by the community" };
  const key = resourceKey(card, post.owner);
  const publicCards = publicEntries(data);
  const liked = [...publicCards.values()].filter((e) => data.likes.some((l) => l.userId === viewer && l.target === `resource:${e.key}`));
  const related = liked.find((e) => e.key !== key && (e.card.topics || []).some((t) => card.topics?.includes(t)));
  if (related) return { score: 4, text: `Because you liked ${related.card.title}` };
  if (data.collectionFollows.some((f) => f.userId === viewer && f.owner === post.owner && f.collectionId === card.collectionId)) return { score: 3, text: "From a collection you follow" };
  if (data.follows.some((f) => f.from === viewer && f.to === post.userId)) return { score: 2, text: "From someone you follow" };
  const saved = data.spaces[viewer]?.cards.find((c) => c.savedFrom && (c.topics || []).some((t) => card.topics?.includes(t)));
  if (saved) return { score: 1, text: `Related to ${saved.title}, which you saved` };
  return { score: 0, text: "A discovery from the community" };
}
export function upgradeCommunity(data) {
  if (data.recommendations) return false;
  data.recommendations = [];
  const samples = [
    ["alex-radio", "A small way to travel without leaving your desk. Pick somewhere unfamiliar, press play, and see what finds you.", "public"],
    ["alex-photopea", "Keeping this one close for quick image edits. What are the little creative tools you always come back to?", "public"],
    ["alex-music-khruangbin", "My suggestion for a slower afternoon: open this session, put your headphones on, and let it play.", "public"],
    ["alex-sncb", "A train, a walk along the coast, and nowhere to rush. Who’s up for a little weekend escape?", "friends"],
  ];
  samples.forEach(([id, text, audience], i) => {
    const card = data.spaces.alex?.cards.find((c) => c.id === id);
    if (!card || effectiveAudience(data.spaces.alex, card) === "private" || (audience === "public" && !canViewCard(data, "alex", card, null))) return;
    const post = recommendCard(data, "alex", "alex", id, text, audience);
    post.createdAt = Date.now() - (i + 1) * 3600000;
  });
  return true;
}
export function createSocial(xavier) {
  for (const c of xavier.collections) c.visibility ??= "private";
  for (const c of xavier.cards) c.visibility ??= c.fileId || c.widget === "note" ? "private" : "inherit";
  const alex = seedState();
  alex.settings = { ...alex.settings, name: "Alex", title: "A few good things, collected.", subtitle: "Sounds, small tools, and places worth a detour.", theme: xavier.settings.theme };
  alex.collections = [
    { id: "alex-music", name: "Good things to listen to", description: "For a slow morning or a long afternoon.", color: "violet", icon: "music", visibility: "public" },
    { id: "alex-create", name: "Make something", description: "Useful tools with room for a little imagination.", color: "sage", icon: "spark", visibility: "public" },
    { id: "alex-weekend", name: "Weekend plans", description: "A few ideas to share with friends.", color: "blue", icon: "sun", visibility: "friends" },
    { id: "alex-private", name: "Just for me", description: "Personal plans and little reminders.", color: "amber", icon: "lock", visibility: "private" },
  ].map((c) => ({ collapsed: false, ...c }));
  const originals = catalogCards();
  alex.cards = [
    ...["bandcamp", "nts", "fkj", "music-khruangbin"].map((id) => ({ ...originals.find((c) => c.id === id), id: `alex-${id}`, collectionId: "alex-music", topics: ["Music"] })),
    ...["figma", "arena", "mdn"].map((id) => ({ ...originals.find((c) => c.id === id), id: `alex-${id}`, collectionId: "alex-create", topics: ["Design", "Learning"] })),
    { id: "alex-photopea", collectionId: "alex-create", title: "Photopea", description: "A photo editor to keep within reach.", url: "https://www.photopea.com/", type: "link", color: "sage", topics: ["Design", "Useful tools"] },
    { id: "alex-radio", collectionId: "alex-music", title: "Radio Garden", description: "An invitation to explore radio from around the world.", url: "https://radio.garden/", type: "link", color: "sage", topics: ["Music", "Travel"] },
    ...["sncb", "holiday-beach", "maps"].map((id) => ({ ...originals.find((c) => c.id === id), id: `alex-${id}`, collectionId: "alex-weekend", topics: ["Travel"] })),
    { id: "alex-surprise", collectionId: "alex-private", title: "Birthday ideas", description: "A private list for later.", url: "https://bandcamp.com", type: "link", color: "amber" },
    { id: "alex-note", collectionId: "alex-private", title: "A note to myself", type: "widget", widget: "note", note: "Keep the weekend free for a little adventure.", url: "", color: "amber" },
  ].map((c, i) => ({ favorite: false, visibility: "inherit", createdAt: Date.now() - i * 3600000, ...c }));
  const data = { version: 1, activeUser: "xavier", spaces: { xavier, alex },
    profiles: { xavier: { name: xavier.settings.name, handle: "xavier", bio: "The useful, the inspiring, and the everyday.", color: "sage" },
      alex: { name: "Alex Morgan", handle: "alex", bio: "Collecting good sounds, useful tools, and little escapes.", color: "rose" } },
    resources: {}, likes: [], comments: [], requests: [], follows: [], collectionFollows: [], notifications: [] };
  syncResources(data);
  const bandcamp = alex.cards.find((c) => c.id === "alex-bandcamp");
  data.likes.push({ target: targetFor(data, "alex", bandcamp), userId: "alex" });
  data.comments.push({ id: "demo-bandcamp-comment", target: targetFor(data, "alex", bandcamp), userId: "alex",
    text: "My favorite starting point for independent music. I keep coming back to the artist recommendations.", createdAt: Date.now() - 7200000 });
  data.comments.push({ id: "demo-friends-comment", target: "card:alex:alex-sncb", userId: "alex",
    text: "Train to the coast this weekend? Let's pick a day together.", createdAt: Date.now() - 3600000 });
  upgradeCommunity(data);
  return data;
}
