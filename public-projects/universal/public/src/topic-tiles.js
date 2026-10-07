import { ROOT_TOPICS } from './topics.js';
import { escapeHTML as esc } from './model.js';
import { icon } from './icons.js';

export function topicTile(topic,count,{owner,collectionId}={}) {
  const index=ROOT_TOPICS.findIndex(t=>t.id===topic.id);
  const attrs=collectionId?`data-social="collection" data-owner="${esc(owner)}" data-id="${esc(collectionId)}"`:`data-social="topic" data-value="${esc(topic.id)}"`;
  return `<button type="button" class="topic-tile illustrated-topic tint-${esc(topic.color)}" ${attrs} title="${esc(topic.description)}" aria-label="${esc(topic.label)} · ${count} resources"><span class="topic-art" aria-hidden="true" style="--art-x:${(index%6)*20}%;--art-y:${Math.floor(index/6)*50}%"></span><span class="topic-shade" aria-hidden="true"></span><span class="topic-tile-content"><span class="topic-symbol" aria-hidden="true">${icon(topic.icon)}</span><strong>${esc(topic.label)}</strong><small>${count} ${count===1?'resource':'resources'}</small></span><span class="topic-arrow" aria-hidden="true">${icon('chevron')}</span></button>`;
}
