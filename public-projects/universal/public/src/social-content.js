import { inCollection } from "./classification.js";
import { escapeHTML as esc, domain } from './model.js';
import { icon } from './icons.js';
import { canViewCard, visibleCollections } from './social.js';
import { attachmentVisible } from './network.js';
import { cardKind } from './layout.js';

export function attachmentChoices(data, viewer, format = 'card', recipient) {
  const items = Object.entries(data.spaces).flatMap(([owner, space]) => format === 'collection'
    ? visibleCollections(data, owner, viewer).map(c => ({ kind: 'collection', owner, id: c.id, title: c.name }))
    : space.cards.filter(c => c.type !== 'widget' && canViewCard(data, owner, c, viewer) && (format !== 'photo' || cardKind(c) === 'picture')).map(c => ({ kind: 'card', owner, id: c.id, title: c.title })));
  return items.filter(item => !recipient || attachmentVisible(data, item, recipient)).sort((a, b) => (b.owner === viewer) - (a.owner === viewer) || a.title.localeCompare(b.title));
}
export const encodeAttachment = item => item ? `${item.kind}|${item.owner}|${item.id}` : '';
export function decodeAttachment(value) {
  if (!value) return null;
  const [kind, owner, id] = value.split('|');
  return { kind, owner, id };
}
export function attachmentHTML(ctx, attachment, viewer, { large = false } = {}) {
  if (!attachment) return '';
  const data = ctx.data();
  if (!attachmentVisible(data, attachment, viewer)) return `<div class="attachment-unavailable">${icon('lock')}This attachment is no longer shared with you.</div>`;
  const { owner, id, kind } = attachment;
  const space = data.spaces[owner];
  if (kind === 'collection') {
    const collection = space.collections.find(c => c.id === id);
    const cards = space.cards.filter(c => inCollection(c, id) && canViewCard(data, owner, c, viewer));
    return `<button class="wall-collection tint-${collection.color}" data-social="collection" data-owner="${esc(owner)}" data-id="${esc(id)}"><span class="wall-collection-mosaic">${cards.slice(0, 3).map(c => `<span>${ctx.cardVisual(c)}</span>`).join('')}</span><span class="wall-attachment-copy"><small>A collection by ${esc(data.profiles[owner].name)}</small><strong>${esc(collection.name)}</strong><span>${cards.length} cards to explore ${icon('arrow')}</span></span></button>`;
  }
  const card = space.cards.find(c => c.id === id), photo = cardKind(card) === 'picture';
  return `<button class="wall-attachment tint-${card.color || 'sage'} ${large && photo ? 'wall-photo' : ''} ${large && card.type === 'video' ? 'wall-video' : ''}" data-social="${photo || card.type === 'video' || card.type === 'audio' ? 'open' : 'detail'}" data-owner="${esc(owner)}" data-card-id="${esc(id)}" aria-label="${photo ? 'View' : card.type === 'video' ? 'Watch' : 'Explore'} ${esc(card.title)}"><span class="wall-attachment-art">${ctx.cardVisual(card)}</span><span class="wall-attachment-copy"><small>${esc(photo ? 'Picture · ' + data.profiles[owner].name : domain(card.url) || card.fileName || 'Shared card')}</small><strong>${esc(card.title)}</strong>${!photo ? `<span>${esc(card.description || 'A discovery worth keeping.')}</span>` : ''}</span>${!photo ? icon('arrow') : ''}</button>`;
}
export function relativeTime(value) {
  const mins = Math.max(0, Math.floor((Date.now() - value) / 60000));
  return mins < 1 ? 'Just now' : mins < 60 ? `${mins}m ago` : mins < 1440 ? `${Math.floor(mins / 60)}h ago` : new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short' }).format(value);
}
