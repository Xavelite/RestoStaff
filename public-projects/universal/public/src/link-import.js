import { safeURL, metadata, uid, videoSource } from './model.js';
import { resourceKey } from './social.js';

export function prepareLinks(items, space, owner) {
  const known = new Set(space.cards.map(c => resourceKey(c, owner))), seen = new Set();
  let skipped = 0;
  const links = [];
  for (const item of items.slice(0, 500)) {
    try {
      const url = safeURL(item.url);
      if (!url || !/^https?:\/\//i.test(url)) throw Error();
      const type=videoSource(url)?'video':/\.(mp3|wav|ogg|m4a|aac|flac|opus)(?:[?#]|$)/i.test(url)?'audio':'link';
      const info = metadata(url), card = { type, url };
      const key = resourceKey(card, owner);
      if (seen.has(key) || known.has(key)) { skipped++; continue; }
      seen.add(key); links.push({url,type, title:String(item.title || info.title || new URL(url).hostname).slice(0, 160)});
    } catch { skipped++; }
  }
  return { links, skipped, truncated: items.length > 500 };
}
export function importLinks(space, collectionId, items) {
  if (!space.collections.some(c => c.id === collectionId)) throw Error('Choose a collection.');
  for (const item of items) space.cards.push({id:uid(), collectionId, type:item.type||'link', url:item.url, title:item.title, description:'', color:metadata(item.url).color||'sage', visibility:'private', createdAt:Date.now(), tags:[]});
  return items.length;
}
