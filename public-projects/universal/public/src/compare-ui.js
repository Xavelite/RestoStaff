import { searchCards, getCard, resourceKey, engagement } from './social.js';
import { contentFields } from './classification.js';
import { CONTENT_KINDS, topicTrail } from './topics.js';
import { escapeHTML as esc, domain } from './model.js';
import { icon } from './icons.js';

export function createCompareUI(ctx){
  const data=ctx.data,me=()=>data().activeUser,space=()=>data().spaces[me()];
  let query='',previous=null;
  const refs=()=>space().comparison||[];
  function entries(){return refs().flatMap(ref=>{try{return [{ref,card:getCard(data(),ref.owner,ref.id,me())}];}catch{return [];}});}
  function picker(){
    const keys=new Set(entries().map(e=>resourceKey(e.card,e.ref.owner)));
    const results=searchCards(data(),me(),{query,scope:'everyone',sort:'relevant'}).filter(r=>r.card.type!=='widget'&&!keys.has(r.key)).slice(0,6);
    return results.map(r=>`<button type="button" class="compare-choice" data-action="compare-add" data-owner="${esc(r.ownerId)}" data-id="${esc(r.card.id)}"><span>${icon('plus')}<strong>${esc(r.card.title)}</strong><small>${esc(domain(r.card.url)||r.card.type)}</small></span></button>`).join('')||'<p class="form-hint">No matching cards. Try a different word.</p>';
  }
  function render(){
    const items=entries(),fields=items.map(({card})=>contentFields(card));
    const rows=[['Kind',(e,i)=>CONTENT_KINDS[fields[i].kind]||e.card.type],['Topic',(e,i)=>{const t=fields[i].subjects?.[0]||e.card.subjects?.[0];return t?topicTrail(t).map(t=>t.label).join(' › '):'—';}],['Creator / artist',(e,i)=>fields[i].artist||fields[i].creator||'—'],['Genre',(e,i)=>fields[i].genre||'—'],['Released',(e,i)=>fields[i].year||fields[i].decade||'—'],['Community likes',e=>engagement(data(),e.ref.owner,e.card,me()).likes],['Source',e=>domain(e.card.url)||e.card.fileName||'Uploaded file']];
    return ctx.top()+`<section class="compare-heading"><button class="text-btn" data-action="compare-back">← Back to your space</button><div><span class="eyebrow">A CLOSER LOOK</span><h1>Find your fit.</h1><p>Up to three cards, side by side. Your notes stay yours.</p></div>${items.length?'<button class="text-btn" data-action="compare-clear">Clear comparison</button>':''}</section>${items.length?`<div class="comparison-scroll"><table class="comparison-table"><thead><tr><th scope="col">Compare</th>${items.map(({card,ref})=>`<th scope="col"><button class="icon-btn comparison-remove" data-action="compare-remove" data-owner="${esc(ref.owner)}" data-id="${esc(ref.id)}" aria-label="Remove ${esc(card.title)} from comparison">${icon('close')}</button><div class="comparison-art tint-${esc(card.color||'sage')}">${ctx.visual(card)}</div><h2>${esc(card.title)}</h2><p>${esc(card.description||'')}</p><button class="secondary" data-social="open" data-owner="${esc(ref.owner)}" data-card-id="${esc(ref.id)}">Open ${icon('arrow')}</button></th>`).join('')}</tr></thead><tbody>${rows.map(([label,fn])=>`<tr><th scope="row">${label}</th>${items.map((e,i)=>`<td>${esc(fn(e,i))}</td>`).join('')}</tr>`).join('')}<tr><th scope="row">My notes</th>${items.map(({ref})=>`<td><textarea data-compare-note="${esc(ref.owner+'|'+ref.id)}" aria-label="Private comparison notes" placeholder="What matters to you?" maxlength="1500">${esc(space().comparisonNotes?.[ref.owner+'|'+ref.id]||'')}</textarea></td>`).join('')}</tr></tbody></table></div>`:'<p class="compare-empty">Compare tools, books, places, or anything you’re deciding between.</p>'}${items.length<3?`<section class="compare-picker"><label for="compare-search">${icon('plus')}Add ${items.length?'another':'your first'} card</label><input id="compare-search" type="search" value="${esc(query)}" placeholder="Search your space and the community…"><div id="compare-choices">${picker()}</div></section>`:'<p class="form-hint">Remove a card above to compare another.</p>'}`;
  }
  async function click(action,el){
    if(!action.startsWith('compare-'))return false;
    if(action==='compare-back'){Object.assign(ctx.ui(),previous||{page:'space'});previous=null;ctx.render();return true;}
    if(action==='compare-add'){
      const owner=el.dataset.owner||me(),card=getCard(data(),owner,el.dataset.id,me());
      if(card.type==='widget')return true;
      if(!entries().some(e=>resourceKey(e.card,e.ref.owner)===resourceKey(card,owner))){
        if(entries().length===3){if(ctx.ui().page!=='compare')previous={...ctx.ui()};ctx.ui().page='compare';ctx.closeModal();ctx.render();ctx.toast('Remove a card to make room for this one.');return true;}
        space().comparison=[...entries().map(e=>e.ref),{owner,id:card.id}];
      }
    }
    if(action==='compare-remove')space().comparison=refs().filter(r=>r.owner!==el.dataset.owner||r.id!==el.dataset.id);
    if(action==='compare-clear')space().comparison=[];
    if(ctx.ui().page!=='compare')previous={...ctx.ui()};
    ctx.ui().page='compare';query='';ctx.closeModal();await ctx.persist();ctx.render();window.scrollTo(0,0);return true;
  }
  function input(el){if(el.id==='compare-search'){query=el.value;document.querySelector('#compare-choices').innerHTML=picker();}}
  async function change(el){if(el.matches('[data-compare-note]')){space().comparisonNotes||={};space().comparisonNotes[el.dataset.compareNote]=el.value;await ctx.persist();}}
  return{render,click,input,change};
}
