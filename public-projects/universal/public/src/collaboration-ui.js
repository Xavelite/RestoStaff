import { collectionRole, setContributors, contributionChoices, contributeCard, removeContribution } from './collaborative-collections.js';
import { inCollection } from './classification.js';
import { canViewCard } from './social.js';
import { escapeHTML as esc, uid } from './model.js';
import { icon } from './icons.js';

export function createCollaborationUI(ctx) {
  const data=ctx.data,me=()=>data().activeUser,name=id=>data().profiles[id]?.name||'Member';
  function checklist(owner,c,role){
    const tasks=c.checklist||[],editable=role!=='follower';
    const attrs=`data-owner="${esc(owner)}" data-id="${esc(c.id)}"`;
    return `<details class="shared-checklist" ${tasks.length?'open':''}><summary>${icon('check')}Shared checklist <small>${tasks.filter(t=>t.done).length}/${tasks.length}</small></summary><div class="shared-checklist-items">${tasks.map(task=>`<div><button type="button" role="checkbox" aria-checked="${!!task.done}" data-social="checklist-toggle" ${attrs} data-task-id="${esc(task.id)}" ${editable?'':'disabled'}>${icon(task.done?'check':'circle')}<span>${esc(task.text)}</span></button>${editable?`<button class="icon-btn" data-social="checklist-remove" ${attrs} data-task-id="${esc(task.id)}" aria-label="Remove ${esc(task.text)}">${icon('close')}</button>`:''}</div>`).join('')||'<p class="form-hint">A plan you can work on together.</p>'}</div>${editable?`<form id="social-collection-checklist" ${attrs}><input name="task" maxlength="160" placeholder="Add a next step…" aria-label="New shared task" required><button class="secondary" type="submit">${icon('plus')}Add</button><p class="social-form-error" role="alert"></p></form>`:''}</details>`;
  }
  function render(owner,c,readOnly=false) {
    if(c.communityManaged||readOnly||(!c.collaborative&&owner!==me()))return '';
    const role=collectionRole(data(),me(),owner,c.id),attrs=`data-owner="${esc(owner)}" data-id="${esc(c.id)}"`,choices=role!=='follower'?contributionChoices(data(),me(),owner,c.id):[];
    const ownAdditions=data().spaces[owner].cards.filter(card=>inCollection(card,c.id)&&card.contributedBy&&(role==='owner'||card.contributedBy===me())&&canViewCard(data(),owner,card,me()));
    const activity=(c.activity||[]).slice(-6).reverse();
    return `<section class="collect-together"><div class="together-heading"><span>${icon('users')}<strong>Collect together</strong></span><span class="role-chip">${role==='owner'?'You own this collection':role==='contributor'?'You can contribute':'Follow and discuss'}</span></div><div class="contributor-chips"><span>${esc(name(owner))}<small>Owner</small></span>${(c.contributors||[]).map(id=>`<span>${esc(name(id))}<small>Contributor</small></span>`).join('')}</div><div class="together-tools">${checklist(owner,c,role)}${role!=='follower'&&c.visibility!=='private'?`<details><summary>${icon('plus')}Add a card</summary><form id="social-contribution-form" ${attrs}><label class="field">Choose a public card<select name="source" required><option value="">Find a card…</option>${choices.map(r=>`<option value="${esc(r.ownerId+'|'+r.card.id)}">${esc(r.card.title)} · ${esc(name(r.ownerId))}</option>`).join('')}</select></label><p class="form-hint">Added for everyone who can see this collection. Personal notes and private tags stay yours.</p><button class="primary" ${!choices.length?'disabled':''}>Add to collection</button><p class="social-form-error" role="alert"></p></form></details>`:''}${role==='owner'?`<details><summary>${icon('users')}Contributors</summary><form id="social-contributors-form" ${attrs}><p class="form-hint">Contributors can add public cards and remove their own additions. You control sharing and membership.</p><div class="contributor-picker">${Object.keys(data().profiles).filter(id=>id!==owner&&data().profiles[id].role!=='curator').map(id=>`<label><input type="checkbox" name="member" value="${esc(id)}" ${(c.contributors||[]).includes(id)?'checked':''}>${esc(name(id))}</label>`).join('')}</div>${c.visibility==='private'?'<p class="form-hint">This collection is private. Share it from your dashboard to start collecting together.</p>':''}<button class="primary">Save contributors</button><p class="social-form-error" role="alert"></p></form></details>`:''}${ownAdditions.length?`<details><summary>${icon('collection')}Manage additions</summary><div class="contribution-management">${ownAdditions.map(card=>`<div><span>${esc(card.title)}<small>Added by ${esc(name(card.contributedBy))}</small></span><button class="text-btn" data-social="contribution-remove" ${attrs} data-card-id="${esc(card.id)}">Remove</button></div>`).join('')}</div></details>`:''}${activity.length?`<details><summary>${icon('clock')}Recent activity</summary><ol class="collection-activity">${activity.map(a=>`<li><strong>${esc(name(a.userId))}</strong> ${a.action==='added'?'added':'removed'} ${esc(a.title)}<time>${new Date(a.createdAt).toLocaleDateString('en-GB',{day:'numeric',month:'short'})}</time></li>`).join('')}</ol></details>`:''}</div></section>`;
  }
  async function click(el) {
    if(el.dataset.social?.startsWith('checklist-')){
      const {owner,id,taskId}=el.dataset;if(collectionRole(data(),me(),owner,id)==='follower')throw Error('Only contributors can change this checklist.');
      const c=data().spaces[owner].collections.find(c=>c.id===id),task=c.checklist?.find(t=>t.id===taskId);if(!task)return true;
      if(el.dataset.social==='checklist-toggle'){task.done=!task.done;task.updatedBy=me();}else c.checklist=c.checklist.filter(t=>t.id!==taskId);
      await ctx.persist();ctx.render();return true;
    }
    if(el.dataset.social!=='contribution-remove')return false;
    removeContribution(data(),me(),el.dataset.owner,el.dataset.id,el.dataset.cardId);await ctx.persist();ctx.render();ctx.toast('Removed from this collection.');return true;
  }
  async function submit(form) {
    if(form.id==='social-collection-checklist'){
      const {owner,id}=form.dataset;if(collectionRole(data(),me(),owner,id)==='follower')throw Error('Only contributors can add tasks.');
      const c=data().spaces[owner].collections.find(c=>c.id===id),text=form.elements.task.value.trim();if(!text)throw Error('Write a next step.');
      (c.checklist||=[]).push({id:uid(),text,done:false,addedBy:me()});await ctx.persist();ctx.render();document.querySelector('#social-collection-checklist input')?.focus();return true;
    }
    if(!['social-contributors-form','social-contribution-form'].includes(form.id))return false;
    if(form.id==='social-contributors-form')setContributors(data(),me(),form.dataset.owner,form.dataset.id,[...new FormData(form).getAll('member')]);
    else {const [owner,id]=form.elements.source.value.split('|');contributeCard(data(),me(),form.dataset.owner,form.dataset.id,{owner,id});}
    await ctx.persist();ctx.render();ctx.toast(form.id==='social-contribution-form'?'Added. Followers will see it as new.':'Contributors updated.');return true;
  }
  return {render,click,submit};
}
