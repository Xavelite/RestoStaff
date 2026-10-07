import { escapeHTML as esc } from './model.js';
import { ROOT_TOPICS, topicTrail, CONTENT_KINDS } from './topics.js';
import { categoryBallot, communityCard } from './consensus.js';
import { resourceKey, canViewCard } from './social.js';
import { contentFields } from './classification.js';

const label=id=>topicTrail(id).map(t=>t.label).join(' › ')||'Not categorized yet';
export function categoryPanel(data,viewer,owner,card,readOnly=false) {
  const key=resourceKey(card,owner),current=data.communityCategories?.[key];
  const fields=contentFields(communityCard(data,key,card));
  const facts=[CONTENT_KINDS[fields.kind],fields.genre,fields.year||fields.decade,fields.artist||fields.creator].filter(Boolean);
  const details=facts.length?`<div class="resource-facts">${facts.map(f=>`<span>${esc(f)}</span>`).join('')}</div>`:'';
  if(card.type==='widget'||!canViewCard(data,owner,card,null))return details;
  const ballot=categoryBallot(data,key),mine=ballot.votes.find(v=>v.userId===viewer),last=current?.history?.at(-1);
  return `${details}<section class="category-consensus"><div class="category-current"><div><small>Community category</small><strong>${esc(label(current?.topicId||fields.subjects[0]))}</strong></div><span>${ballot.total?`${ballot.total} choices`:'First placement'}</span></div><details><summary>How it belongs here · help categorize</summary>
    ${last?`<p class="category-history">Moved from ${esc(label(last.from))} after ${last.support} of ${last.total} people agreed.</p>`:'<p>The contributor’s topic is a starting point. Community choices can change it.</p>'}
    <div class="category-tally">${ballot.choices.map(c=>`<div><span>${esc(label(c.topicId))}</span><strong>${c.count}</strong><meter min="0" max="${ballot.total}" value="${c.count}" aria-label="${esc(label(c.topicId))}: ${c.count} of ${ballot.total}"></meter></div>`).join('')}</div>
    ${!readOnly&&data.profiles[viewer]?.role!=='curator'?`<form id="social-category-form" data-owner="${esc(owner)}" data-card-id="${esc(card.id)}"><label class="field">Where does this fit best?<select name="topic" required><option value="">Choose a topic</option>${ROOT_TOPICS.map(r=>`<optgroup label="${esc(r.label)}">${[r,...r.children].map(t=>`<option value="${t.id}" ${mine?.topicId===t.id?'selected':''}>${esc(t.label)}</option>`).join('')}</optgroup>`).join('')}</select></label><div class="category-vote-actions"><button class="secondary" type="submit">${mine?'Update my choice':'Add my choice'}</button>${mine?`<button type="button" class="text-btn" data-social="category-withdraw" data-owner="${esc(owner)}" data-card-id="${esc(card.id)}">Remove my choice</button>`:''}</div><p class="social-form-error" role="alert"></p></form>`:''}
    <p class="form-hint">Demo rule: at least 3 people agree, with 60% of choices and a lead of 2. One choice per person; likes are separate. Your own collections and private tags stay yours.</p></details></section>`;
}
