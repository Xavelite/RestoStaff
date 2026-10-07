import { searchCards, engagement, resourceKey } from './social.js';
import { escapeHTML as esc, domain, logoForURL } from './model.js';
import { icon } from './icons.js';
import { loadUsefulData, CURRENCIES } from './useful-widgets.js';

// The page keeps filtering underneath. Outside suggestions are optional.
export function createQuickSearch(ctx) {
  const input=()=>document.querySelector('#global-search-form input[type="search"]'),panel=()=>document.querySelector('#instant-results');
  let timer, request, answer=null, generation=0;
  const webOn=()=>!!ctx.data().spaces[ctx.data().activeUser].settings.webSuggestions;
  function close(){clearTimeout(timer);generation++;request?.abort();if(panel())panel().hidden=true;input()?.setAttribute('aria-expanded','false');}
  async function enrich(query,token){
    const match=/^([\d]+(?:\.\d+)?)\s*([a-z]{3})\s+(?:in|to|en)\s+([a-z]{3})$/i.exec(query);
    if(match&&CURRENCIES.includes(match[2].toUpperCase())&&CURRENCIES.includes(match[3].toUpperCase())){
      const spec={widget:'currency',amount:Number(match[1]),baseCurrency:match[2].toUpperCase(),quoteCurrency:match[3].toUpperCase()};
      const rate=await loadUsefulData(spec);
      if(token!==generation||!panel()||panel().hidden)return;
      if(Number.isFinite(rate?.rate)){
        answer=spec;
        panel().querySelector('.instant-answer').innerHTML=`<span>${icon('repeat')}<strong>${new Intl.NumberFormat('en-GB',{style:'currency',currency:spec.quoteCurrency}).format(spec.amount*rate.rate)}</strong><small>${esc(rate.date)} · daily reference${rate.error?' · last available':''}</small></span><button type="button" class="text-btn" data-pin-answer>${icon('plus')}Add widget</button>`;
      }
    }
    if(!webOn()||token!==generation||match)return;
    const controller=new AbortController();request=controller;const timeout=setTimeout(()=>controller.abort(),7000);
    try{
      const params=new URLSearchParams({origin:'*',action:'opensearch',search:query,limit:'2',namespace:'0',format:'json'});
      const response=await fetch('https://en.wikipedia.org/w/api.php?'+params,{signal:controller.signal});
      if(!response.ok)throw Error('Unavailable');const hits=await response.json();
      if(token!==generation||panel()?.hidden)return;
      panel().querySelector('.instant-wiki').innerHTML=hits[1].map((title,i)=>/^https:\/\/en\.wikipedia\.org\//.test(hits[3][i])?`<a class="instant-open web-result" href="${esc(hits[3][i])}" target="_blank" rel="noopener">${icon('book')}<strong>${esc(title)}</strong><small>Wikipedia</small>${icon('arrow')}</a>`:'').join('')||'<small class="web-result-note">No Wikipedia suggestions for this search.</small>';
    }catch{if(token===generation&&panel()&&!panel().hidden)panel().querySelector('.instant-wiki').innerHTML='<small class="web-result-note">Suggestions unavailable. The search links still work.</small>';}
    finally{clearTimeout(timeout);}
  }
  function show(){
    clearTimeout(timer);request?.abort();const token=++generation;answer=null;
    const field=input(),target=panel(),query=field?.value.trim();if(!target||!query){close();return;}
    const scope=document.querySelector('#universal-scope').value,data=ctx.data(),me=data.activeUser;
    const results=searchCards(data,me,{query,scope,sort:'relevant'});
    target.innerHTML=`<header><span role="status">${results.length} ${results.length===1?'match':'matches'} · ${scope==='mine'?'My space':scope==='friends'?'Friends':'Everyone'}</span><button type="button" class="icon-btn" data-instant-close aria-label="Close search results">${icon('close')}</button></header><div class="instant-answer"></div><div class="instant-list">${results.slice(0,5).map(({card,ownerId,owners})=>{
      const stats=engagement(data,ownerId,card,me),saved=data.spaces[me].cards.some(c=>resourceKey(c,me)===resourceKey(card,ownerId));
      const symbol=card.type==='link'?`<img src="${esc(logoForURL(card.url))}" alt="" loading="lazy" referrerpolicy="no-referrer"><span hidden>${icon('globe')}</span>`:icon({video:'video',audio:'music',file:'file',widget:'widget'}[card.type]||'globe');
      return `<article class="instant-row"><button type="button" class="instant-open" ${card.type==='widget'&&ownerId===me?`data-action="navigate" data-id="${esc(card.collectionId)}"`:`data-social="open" data-owner="${esc(ownerId)}" data-card-id="${esc(card.id)}"`} title="${esc(card.description||card.title)}"><span class="instant-symbol">${symbol}</span><span class="instant-copy"><strong>${esc(card.title)}</strong><small>${esc(domain(card.url)||card.fileName||'Widget')}</small></span><span class="instant-signal">${stats.likes?icon('heart')+' '+stats.likes:scope!=='mine'?owners.size+' saves':''}</span></button><button type="button" class="instant-save icon-btn" data-social="${saved?'comments':'save'}" data-owner="${esc(ownerId)}" data-card-id="${esc(card.id)}" aria-label="${saved?'Comments for':'Save'} ${esc(card.title)}" title="${saved?'Comments':'Save to my space'}">${icon(saved?'comment':'plus')}</button></article>`;
    }).join('')||'<div class="instant-empty">No matches here. Try Everyone or another search.</div>'}</div><div class="instant-web"><div class="instant-web-links"><span>Search the web</span><a href="https://www.google.com/search?q=${encodeURIComponent(query)}" target="_blank" rel="noopener">Google ${icon('arrow')}</a><a href="https://en.wikipedia.org/w/index.php?search=${encodeURIComponent(query)}" target="_blank" rel="noopener">Wikipedia ${icon('arrow')}</a><button type="button" data-web-toggle class="text-btn" aria-pressed="${webOn()}" title="When on, this search is also sent to Wikipedia">Suggestions ${webOn()?'on':'off'}</button></div><div class="instant-wiki"></div></div><footer><span>Relevance · community signals</span><button type="submit" class="text-btn">${results.length>5?'View all '+results.length+' matches':'Explore results'} ${icon('arrow')}</button></footer>`;
    target.hidden=false;field.setAttribute('aria-expanded','true');
    target.querySelectorAll('.instant-symbol img').forEach(img=>img.onerror=()=>{img.hidden=true;img.nextElementSibling.hidden=false;});
    timer=setTimeout(()=>enrich(query,token),350);
  }
  document.addEventListener('focusin',event=>{if(event.target===input())show();else if(!event.target.closest('#global-search-form'))close();});
  document.addEventListener('pointerdown',event=>{if(!event.target.closest('#global-search-form'))close();});
  document.addEventListener('click',event=>{
    if(event.target.closest('[data-instant-close]')){close();return;}
    if(event.target.closest('[data-web-toggle]')){const settings=ctx.data().spaces[ctx.data().activeUser].settings;settings.webSuggestions=!webOn();ctx.persist();show();return;}
    if(event.target.closest('[data-pin-answer]')&&answer){const spec=answer;close();ctx.addWidget(spec);return;}
    if(event.target.closest('#instant-results [data-social],#instant-results [data-action]'))close();
  },true);
  document.addEventListener('keydown',event=>{
    if(!event.target.closest('#global-search-form')||panel()?.hidden)return;
    if(event.key==='Escape'){close();event.preventDefault();event.stopImmediatePropagation();return;}
    if(event.isComposing||!['ArrowDown','ArrowUp'].includes(event.key)||event.target.tagName==='SELECT')return;
    const buttons=[...panel().querySelectorAll('.instant-open')];if(!buttons.length)return;
    const at=buttons.indexOf(document.activeElement),next=at<0?(event.key==='ArrowDown'?0:buttons.length-1):(at+(event.key==='ArrowDown'?1:-1)+buttons.length)%buttons.length;
    event.preventDefault();buttons[next].focus({preventScroll:true});buttons[next].scrollIntoView({block:'nearest'});
  },true);
  return{show,close};
}
