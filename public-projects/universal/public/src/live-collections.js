import { inCollection } from "./classification.js";
import { catalogCards } from './catalog.js';
import { uid } from './model.js';
import { canViewCard, visibleCollections, resourceKey, getCard, effectiveAudience } from './social.js';

export function liveSource(data, viewer, owner, id) {
  const collection = visibleCollections(data, owner, viewer).find(c => c.id === id);
  if (!collection) throw Error('This collection is no longer shared with you.');
  return collection;
}
export const subscription = (data, viewer, owner, id) => data.collectionFollows.find(f => f.userId === viewer && f.owner === owner && f.collectionId === id);
export function liveCards(data, viewer, owner, id, includeHidden = false) {
  liveSource(data, viewer, owner, id);
  const follow = subscription(data, viewer, owner, id);
  const source = data.spaces[owner].cards;
  const list = follow?.paused ? (follow.snapshot || []).map(c => source.find(s => s.id === c.id)).filter(Boolean) : source.filter(c => inCollection(c, id));
  return list.filter(c => c.type !== 'widget' && canViewCard(data, owner, source.find(s => s.id === c.id && (follow?.paused || inCollection(s, id))), viewer) && (includeHidden || !follow?.hidden?.includes(c.id)));
}
export function followCollection(data, viewer, owner, id) {
  liveSource(data, viewer, owner, id);
  if (owner === viewer) throw Error('This is already your collection.');
  let follow = subscription(data, viewer, owner, id);
  if (!follow) { follow = { userId: viewer, owner, collectionId: id, hidden: [], paused: false, followedAt: Date.now() }; data.collectionFollows.push(follow); follow.seen=liveCards(data,viewer,owner,id).map(c=>resourceKey(c,owner)); }
  return follow;
}
export function pauseCollection(data, viewer, owner, id) {
  const follow = subscription(data, viewer, owner, id);
  if (!follow) throw Error('Follow this collection first.');
  liveSource(data, viewer, owner, id);
  if (follow.paused) { follow.paused = false; delete follow.snapshot; }
  else { follow.snapshot = structuredClone(liveCards(data, viewer, owner, id, true)); follow.paused = true; }
  return follow;
}
function copyCard(data, viewer, owner, source, collectionId, visibility = 'private') {
  const card = { id: uid(), collectionId, title: source.title, description: source.description || '', type: source.type, url: source.url, color: source.color, favorite: false, visibility, createdAt: Date.now(), savedFrom: owner };
  for (const field of ['fileId','fileName','mime','fileSize','sourceURL','topics','size','artist','genre','year','decade','subjects','creator','contentKind','album','series']) if (source[field]) card[field] = structuredClone(source[field]);
  if (source.fileId) { card.resourceKey = resourceKey(source, owner); card.sourceRef = source.sourceRef || { owner, id: source.id }; }
  data.spaces[viewer].cards.push(card);
  return card;
}
export function copyCollection(data, viewer, owner, id) {
  const source = liveSource(data, viewer, owner, id);
  const cards = liveCards(data, viewer, owner, id);
  const space = data.spaces[viewer];
  let name = source.name; let suffix = 2;
  while (space.collections.some(c => c.name.toLowerCase() === name.toLowerCase())) name = `${source.name} (${suffix++})`;
  const copy = { id: uid(), name, description: source.description, icon: source.icon, color: source.color, visibility: 'private', collapsed: false };
  space.collections.push(copy);
  cards.forEach(c => copyCard(data, viewer, owner, c, copy.id));
  return copy;
}
export function suggestCard(data, viewer, owner, id, ref, reason) {
  const collection = liveSource(data, viewer, owner, id);
  if(collection.communityManaged)throw Error('Public resources join through shared topics. Help categorize the card to change its placement.');
  const card = getCard(data, ref.owner, ref.id, viewer);
  if (effectiveAudience(data.spaces[ref.owner], card) !== 'public' || !canViewCard(data, ref.owner, card, null) || card.type === 'widget') throw Error('Choose a public card for this suggestion.');
  const key = resourceKey(card, ref.owner);
  if (data.spaces[owner].cards.some(c => inCollection(c, id) && resourceKey(c, owner) === key)) throw Error('This resource is already in the collection.');
  if (data.collectionSuggestions.some(s => s.owner === owner && inCollection(s, id) && s.key === key && s.status === 'pending')) throw Error('This discovery is already awaiting review.');
  const text = reason.trim(); if (!text || text.length > 300) throw Error('Add a short reason, up to 300 characters.');
  const item = { id: uid(), userId: viewer, owner, collectionId: id, sourceOwner: ref.owner, cardId: ref.id, key, reason: text, status: 'pending', createdAt: Date.now() };
  data.collectionSuggestions.push(item);
  if (viewer !== owner) data.notifications.push({ id: uid(), to: owner, from: viewer, owner, collectionId: id, text: 'suggested a card for', title: collection.name, live: true, read: false, createdAt: Date.now() });
  return item;
}
export function reviewSuggestion(data, viewer, id, approve) {
  const item = data.collectionSuggestions.find(s => s.id === id && s.owner === viewer && s.status === 'pending');
  if (!item) throw Error('This suggestion is no longer waiting for your review.');
  const collection = liveSource(data, viewer, viewer, item.collectionId);
  if (approve) {
    const source = getCard(data, item.sourceOwner, item.cardId, null);
    if (data.spaces[viewer].cards.some(c => inCollection(c, item.collectionId) && resourceKey(c, viewer) === item.key)) throw Error('This card is already in the collection.');
    const card = copyCard(data, viewer, item.sourceOwner, source, collection.id, 'inherit');
    card.curatorReason = item.reason; card.suggestedBy = item.userId;
  }
  item.status = approve ? 'approved' : 'declined'; item.reviewedAt = Date.now();
  if (item.userId !== viewer) data.notifications.push({ id: uid(), to: item.userId, from: viewer, owner: viewer, collectionId: item.collectionId, live: true, text: approve ? 'added your suggestion to' : 'reviewed your suggestion for', title: collection.name, read: false, createdAt: Date.now() });
  return item;
}
export function upgradeLiveCollections(data) {
  data.collectionSuggestions ||= [];
  if (data.liveCollectionsVersion) return false;
  const space = data.spaces.alex;
  if (space && !space.collections.some(c => c.id === 'alex-rock-club')) {
    space.collections.push({ id:'alex-rock-club', name:'80s–90s rock club', description:'Big guitars, great choruses. Suggest a public music card; Alex reviews each addition.', color:'amber', icon:'music', visibility:'public', collapsed:false });
    for (const source of catalogCards().filter(c => c.collectionId === 'rock')) space.cards.push({ ...structuredClone(source), id:`club-${source.id}`, collectionId:'alex-rock-club', visibility:'inherit', createdAt:Date.now(), curatorReason:'Selected by Alex for the starter rock collection.' });
  }
  data.liveCollectionsVersion = 1; return true;
}
