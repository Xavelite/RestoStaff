import { escapeHTML as esc, uid, safeURL } from './model.js';
import { icon } from './icons.js';

export const EXTRA_WIDGETS = {
  currency: {name:'Currency converter',description:'Daily reference rates, with the date clearly shown',color:'sage',icon:'repeat'},
  crypto: {name:'Bitcoin price',description:'A simple BTC spot price in your currency',color:'amber',icon:'chart'},
  news: {name:'Headlines',description:'A small reading list from a source you choose',color:'blue',icon:'news'},
  countdown: {name:'Countdown',description:'Keep a day you’re looking forward to close',color:'violet',icon:'calendar'},
  rediscover: {name:'Rediscover',description:'Give something you saved another moment',color:'rose',icon:'spark'},
};
export const CURRENCIES=['EUR','USD','GBP','CHF','JPY','CAD','AUD','SEK','NOK','DKK','PLN','INR'];
export const NEWS_SOURCES={world:'BBC · World',technology:'BBC · Technology',science:'BBC · Science & nature'};
const cache=new Map(), pending=new Map();
let notify=()=>{};
export function setUsefulWidgetNotifier(fn){notify=fn;}
const money=(amount,currency)=>new Intl.NumberFormat('en-GB',{style:'currency',currency,maximumFractionDigits:2}).format(amount);
const options=(items,value)=>items.map(item=>`<option value="${item}" ${item===value?'selected':''}>${item}</option>`).join('');
const keyFor=c=>c.widget==='currency'?`fx:${c.baseCurrency||'EUR'}:${c.quoteCurrency||'USD'}`:c.widget==='crypto'?`btc:${c.quoteCurrency||'EUR'}`:`news:${c.newsSource||'technology'}`;

export async function loadUsefulData(card,force=false){
  const key=keyFor(card), old=cache.get(key), ttl=card.widget==='crypto'?60000:600000;
  if(pending.has(key))return pending.get(key);
  if(!force&&old&&Date.now()-old.fetched<ttl)return old;
  const request=(async()=>{
    try{
      const params=new URLSearchParams({kind:card.widget,base:card.baseCurrency||'EUR',quote:card.quoteCurrency||'EUR',source:card.newsSource||'technology'});
      if(card.widget==='currency'&&!card.quoteCurrency)params.set('quote','USD');
      const response=await fetch('/universal/api/widgets?'+params,{signal:AbortSignal.timeout(16000)});
      if(!response.ok)throw Error('Source unavailable');
      const value=await response.json();
      if(card.widget==='news'){
        const xml=new DOMParser().parseFromString(value.xml,'text/xml');
        value.articles=[...xml.querySelectorAll('item')].slice(0,6).map(item=>({title:item.querySelector('title')?.textContent||'',url:safeURL(item.querySelector('link')?.textContent||''),date:item.querySelector('pubDate')?.textContent||'',image:safeURL(item.getElementsByTagName('media:thumbnail')[0]?.getAttribute('url')||item.querySelector('enclosure[type^="image/"]')?.getAttribute('url')||'')})).filter(item=>item.title&&item.url);
        if(!value.articles.length)throw Error('No headlines available');
        delete value.xml;
      }
      cache.set(key,{...value,fetched:Date.now()});
    }catch{cache.set(key,{...old,error:true,fetched:Date.now()});}
    pending.delete(key);notify(card.widget);return cache.get(key);
  })();
  pending.set(key,request);return request;
}
export function refreshUsefulWidgets(cards){
  cards.filter(c=>['currency','crypto','news'].includes(c.widget)&&document.querySelector(`[data-widget="${CSS.escape(c.id)}"]`)).forEach(c=>loadUsefulData(c));
}
export function usefulWidgetFields(c){
  if(c.widget==='currency')return `<div class="field-row"><label class="field">From<select name="baseCurrency">${options(CURRENCIES,c.baseCurrency||'EUR')}</select></label><label class="field">To<select name="quoteCurrency">${options(CURRENCIES,c.quoteCurrency||'USD')}</select></label><label class="field">Amount<input type="number" name="amount" min="0" max="1000000000" step="any" value="${esc(c.amount??100)}"></label></div><p class="form-hint">Daily reference rates from Frankfurter. The source date is shown on your card.</p>`;
  if(c.widget==='crypto')return `<label class="field">Display currency<select name="quoteCurrency">${options(CURRENCIES,c.quoteCurrency||'EUR')}</select></label><p class="form-hint">Coinbase spot price. Refresh when you want a new quote.</p>`;
  if(c.widget==='news')return `<label class="field">Headlines from<select name="newsSource">${Object.entries(NEWS_SOURCES).map(([v,n])=>`<option value="${v}" ${v===(c.newsSource||'technology')?'selected':''}>${n}</option>`).join('')}</select></label><p class="form-hint">Six recent headlines, linking to the original articles. Save one to read later.</p>`;
  if(c.widget==='countdown')return `<label class="field">The day<input type="date" name="targetDate" value="${esc(c.targetDate||'')}" required></label>`;
  return '';
}
export function usefulWidgetBody(c,state){
  const meta=EXTRA_WIDGETS[c.widget];if(!meta)return null;
  const value=cache.get(keyFor(c)), attrs=`data-id="${esc(c.id)}"`;
  const top=`<div class="widget-eyebrow">${icon(meta.icon)}<span>${esc(c.title)}</span></div>`;
  const refresh=`<button class="icon-btn" data-action="refresh-useful-widget" ${attrs} aria-label="Refresh ${esc(c.title)}" title="Refresh">${icon('reset')}</button>`;
  const stateText=value?.error?'Source unavailable · try refresh':'Connecting to source…';
  if(c.widget==='currency'){
    const base=c.baseCurrency||'EUR',quote=c.quoteCurrency||'USD',amount=Number(c.amount??100);
    return top+'<span class="currency-watermark" aria-hidden="true">'+icon('repeat')+'</span>'+
      `<form class="currency-inline" data-card-id="${esc(c.id)}"><label><span class="sr-only">Amount in ${base}</span><input aria-label="Amount in ${base}" type="number" min="0" max="1000000000" step="any" name="amount" value="${amount}" required></label><span class="currency-code">${base}</span><button type="submit" class="icon-btn" aria-label="Convert amount" title="Convert">${icon('arrow')}</button></form><div class="currency-result"><small>You get · ${quote}</small><strong class="utility-value" title="${Number.isFinite(value?.rate)?esc(money(amount*value.rate,quote)):''}">${Number.isFinite(value?.rate)?money(amount*value.rate,quote):'—'}</strong></div><div class="widget-foot"><a class="utility-source" href="https://frankfurter.dev/" target="_blank" rel="noopener">${value?.date?`${esc(value.date)} · ${value.error?'last available':'daily rate'}` :stateText}<span>Frankfurter ${icon('arrow')}</span></a>${refresh}</div>`;
  }
  if(c.widget==='crypto'){
    const available=Number.isFinite(value?.amount),quote=c.quoteCurrency||'EUR';
    return `<div class="btc-header"><span class="btc-mark" aria-hidden="true">₿</span><div><span class="widget-eyebrow">${esc(c.title)}</span><small>BITCOIN <span>BTC</span></small></div></div><span class="btc-orbit" aria-hidden="true">₿</span><div class="btc-quote"><span class="btc-caption">1 bitcoin <span>${quote}</span></span><strong class="utility-value" title="${available?esc(money(value.amount,quote)):''}">${available?money(value.amount,quote):'—'}</strong><span class="btc-quote-label">${available?'Spot price':value?.error?'Quote unavailable':'Getting the latest quote…'}</span></div><div class="widget-foot"><a class="utility-source" href="https://www.coinbase.com/price/bitcoin" target="_blank" rel="noopener">Coinbase ${icon('arrow')}</a><span class="quote-timestamp">${value?.asOf?`${value.error?'Last quote':'Updated'} ${new Date(value.asOf).toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit'})}`:'—'}</span>${refresh}</div>`;
  }
  if(c.widget==='news'){
    const articles=value?.articles||[],section=(NEWS_SOURCES[c.newsSource||'technology']||NEWS_SOURCES.technology).split(' · ')[1];
    return `<div class="news-masthead"><span class="news-brand" aria-label="BBC"><b>B</b><b>B</b><b>C</b></span><span class="news-widget-title">${esc(c.title)}</span><span class="news-edition">${esc(section)}</span></div><div class="headline-list">${articles.map((a,i)=>`<article class="${i===0?'headline-lead':''}"><a href="${esc(a.url)}" target="_blank" rel="noopener">${i===0?`<span class="headline-art">${a.image?`<img src="${esc(a.image)}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.hidden=true">` : icon('news')}</span>` : `<span class="headline-number">${String(i+1).padStart(2,'0')}</span>`}<span class="headline-copy">${i===0?'<small class="headline-overline">LATEST FROM THE FEED</small>':''}<strong>${esc(a.title)}</strong><small>${Number.isFinite(Date.parse(a.date))?new Date(a.date).toLocaleDateString('en-GB',{day:'numeric',month:'short'}):'Recent article'}</small></span></a><button class="icon-btn" data-action="save-headline" ${attrs} data-index="${i}" title="Save for later" aria-label="Save ${esc(a.title)}">${icon(state.cards.some(card=>card.url===a.url)?'check':'bookmark')}</button></article>`).join('')||`<div class="headline-empty">${icon('news')}<div><strong>${value?.error?'The feed is unavailable':'Gathering the headlines'}</strong><p>${value?.error?'Try refreshing in a moment.':'A few stories, a wider perspective.'}</p></div></div>`}</div><div class="widget-foot"><span>${articles.length?`${articles.length} stories · scroll to read`:'BBC News'}${value?.error&&articles.length?' · last available':''}</span>${refresh}</div>`;
  }
  if(c.widget==='countdown'){
    const today=new Date(),target=new Date((c.targetDate||'')+'T00:00:00');
    today.setHours(0,0,0,0);const days=Math.round((target-today)/86400000),valid=Number.isFinite(days);
    return top+`<div class="countdown-display"><div class="countdown-value"><strong class="utility-value">${valid?Math.abs(days):'—'}</strong><span>${days===0?'Today’s the day':Math.abs(days)===1?'day '+(days<0?'since':'to go'):'days '+(days<0?'since':'to go')}</span></div><div class="countdown-calendar" aria-hidden="true"><small>${valid?target.toLocaleDateString('en-GB',{month:'short'}):'DATE'}</small><strong>${valid?target.getDate():'?'}</strong><span>${valid?target.toLocaleDateString('en-GB',{weekday:'short'}):'Choose'}</span></div></div><div class="widget-foot"><span>${valid?target.toLocaleDateString('en-GB',{day:'numeric',month:'long',year:'numeric'}):'Choose a date in Edit card'}</span>${icon('spark')}</div>`;
  }
  const recent=new Set((state.recentCards||[]).slice(0,8).map(r=>r.id));
  const candidates=state.cards.filter(card=>card.type!=='widget'&&!recent.has(card.id)&&card.progress!=='done').sort((a,b)=>(a.createdAt||0)-(b.createdAt||0));
  const offset=(c.rediscoverOffset||0)%Math.max(1,candidates.length), chosen=candidates.slice(offset,offset+2);
  return top+`<div class="discovery-widget-items">${chosen.map(card=>`<button data-action="open-card" data-id="${esc(card.id)}">${icon(card.type==='video'?'video':card.type==='audio'?'music':'bookmark')}<span><strong>${esc(card.title)}</strong><small>From your own collection</small></span>${icon('arrow')}</button>`).join('')||'<p>Your recent cards are still fresh. Save a few more things to revisit.</p>'}</div><div class="widget-foot"><span>A second look, on your terms.</span><button class="text-btn" data-action="rediscover-next" ${attrs}>Another two ${icon('arrow')}</button></div>`;
}
export function headlineFor(card,index){return cache.get(keyFor(card))?.articles?.[index];}
export function upgradeUsefulWidgets(data){
  if(data.usefulWidgetsVersion)return false;
  const space=data.spaces.xavier;
  if(space){
    const add=(widget,match,fields={})=>{const c=space.collections.find(c=>match.test(c.name)&&!c.system);if(!c||space.cards.some(card=>card.widget===widget))return;const meta=EXTRA_WIDGETS[widget];space.cards.push({id:uid(),type:'widget',widget,title:meta.name,description:meta.description,color:meta.color,collectionId:c.id,visibility:'private',favorite:false,createdAt:Date.now(),...fields});};
    add('currency',/money|market|finance/i,{baseCurrency:'EUR',quoteCurrency:'USD',amount:100});
    add('crypto',/money|market|finance/i,{quoteCurrency:'EUR'});
    add('news',/news|perspective/i,{newsSource:'technology',size:'wide'});
    add('rediscover',/everyday|essential/i);
  }
  data.usefulWidgetsVersion=1;return true;
}
