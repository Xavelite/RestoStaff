import { flowEntries, flowPreferences, FLOW_FORMATS, FLOW_ORDERS } from './flow.js';
import { ROOT_TOPICS, CONTENT_KINDS } from './topics.js';
import { getCard, resourceKey, engagement, toggleLike, addComment, saveSharedCard, visibleCollections } from './social.js';
import { followCollection, subscription } from './live-collections.js';
import { personalCollections } from './collection-experience.js';
import { playFlowMedia, stopFlowMedia, flowMediaState, resumeFlowMedia, pauseFlowMedia } from './flow-media.js';
import { createFlowDwell } from './flow-dwell.js';
import { escapeHTML as esc, domain, uid } from './model.js';
import { icon } from './icons.js';
import { relativeTime } from './social-content.js';

export function createFlowUI(ctx,helpers){
  const {avatar,name,profileChip}=helpers,data=ctx.data,me=()=>data().activeUser;
  let renderedUser='',items=[],signature='',shown=12,index=0,observer=null,resizeObserver=null,viewport=null,extra=null;
  const drafts=new Map(),positions=new Map();
  const dwell=createFlowDwell(key=>activateDiscovery(key));
  const prefs=()=>flowPreferences(data(),me());
  const current=()=>items[index];
  const attr=e=>`data-flow-key="${esc(e.key)}"`;
  const act=(e,action,label,cls='secondary',extra='')=>`<button type="button" class="${cls}" data-social="flow-${action}" ${attr(e)} ${extra}>${label}</button>`;
  function updatePreferences(patch){data().spaces[me()].flowPreferences={...prefs(),...patch};}
  function rebuild(){
    const p=prefs(),nextSig=JSON.stringify([me(),p.topic,p.format,p.order,p.audience]);
    const fresh=flowEntries(data(),me(),p),key=current()?.key;
    if(signature!==nextSig){signature=nextSig;shown=12;index=0;extra=null;items=fresh;}
    else {const byKey=new Map(fresh.map(e=>[e.key,e]));items=[...items.map(e=>byKey.get(e.key)).filter(Boolean),...fresh.filter(e=>!items.some(old=>old.key===e.key))];index=Math.max(0,Math.min(items.length-1,items.findIndex(e=>e.key===key)>=0?items.findIndex(e=>e.key===key):index));}
  }
  function savedCard(e){return e.kind==='card'?data().spaces[me()].cards.find(c=>resourceKey(c,me())===e.key):null;}
  function comments(e){return e.kind==='collection'?data().comments.filter(c=>c.target==='collection:'+e.owner+':'+e.collection.id):engagement(data(),e.owner,e.card,me()).comments;}
  function preview(e){
    if(e.kind==='collection')return `<button class="flow-art-button flow-collection-art" data-social="collection" data-owner="${esc(e.owner)}" data-id="${esc(e.collection.id)}"><span class="flow-mosaic">${e.cards.slice(0,3).map(c=>`<span class="tint-${esc(c.color||'sage')}">${ctx.cardVisual(c)}</span>`).join('')}</span><span class="flow-collection-caption">${icon('collection')}${e.cards.length} cards. One point of view.</span></button>`;
    const playable=['video','audio'].includes(e.card.type),kind=CONTENT_KINDS[e.card.contentKind]||({video:'Video',audio:'Listen',picture:'Picture',document:'Document',link:'Website'})[e.format];
    return `<button class="flow-art-button flow-${e.format}-art" data-social="flow-open" ${attr(e)} aria-label="${playable?'Play':e.format==='picture'?'View':'Open'} ${esc(e.card.title)}">${ctx.cardVisual(e.card)}<span class="flow-art-type">${icon(playable?'play':e.format==='picture'?'image':'arrow')}${playable?'Play here':esc(kind)}</span>${e.format==='link'?`<span class="flow-site-domain">${esc(domain(e.card.url))}</span>`:''}</button>`;
  }
  function actions(e){
    const saved=savedCard(e),stats=e.kind==='card'?engagement(data(),e.owner,e.card,me()):null;
    const followed=e.kind==='collection'&&subscription(data(),me(),e.owner,e.collection.id);
    return `<div class="flow-primary-actions">${e.kind==='card'?
      act(e,'open',icon(['video','audio'].includes(e.card.type)?'play':'arrow')+(['video','audio'].includes(e.card.type)?'Play here':e.format==='picture'?'View picture':'Open '+(e.format==='document'?'document':'website')),'primary')+act(e,'save',icon(saved?'check':'bookmark')+(saved?'Saved':'Save'),'secondary'+(saved?' is-saved':'')):
      `<button class="primary" data-social="collection" data-owner="${esc(e.owner)}" data-id="${esc(e.collection.id)}">${icon('collection')}Explore collection</button>`+(e.owner!==me()?act(e,'follow',icon(followed?'check':'plus')+(followed?'Following':'Follow collection'),'secondary',`aria-pressed="${!!followed}"`):'')}
    </div><div class="flow-social-actions">${stats?act(e,'like',icon('heart')+`<span>${stats.likes||'Like'}</span>`,'flow-reaction'+(stats.liked?' liked':''),`aria-label="${stats.liked?'Unlike':'Like'} ${esc(e.card.title)}" aria-pressed="${stats.liked}"`):`<span class="flow-followers">${icon('users')}${data().collectionFollows.filter(f=>f.owner===e.owner&&f.collectionId===e.collection.id).length} followers</span>`}${act(e,'comments',icon('comment')+`<span>${comments(e).length||'Discuss'}</span>`,'flow-reaction',`aria-expanded="${extra?.key===e.key&&extra.kind==='comments'}" aria-label="Discuss ${esc(e.kind==='card'?e.card.title:e.collection.name)}"`)}<button class="flow-reaction" data-social="message-share" data-attachment="${esc((e.kind==='card'?'card':'collection')+'|'+e.owner+'|'+(e.card?.id||e.collection.id))}" title="Send in a message" aria-label="Send in a message">${icon('share')}</button>${act(e,'hide',icon('next')+'Skip','flow-skip','title="Hide this discovery from Flow"')}</div>`;
  }
  function extraHTML(e){
    if(extra?.key!==e.key)return '';
    const close=act(e,'extra-close',icon('close'),'icon-btn','aria-label="Close this panel"');
    if(extra.kind==='save'){
      const saved=savedCard(e),collections=personalCollections(data().spaces[me()]);
      if(saved)return `<header><strong>Already in your space</strong>${close}</header><p>${esc(data().spaces[me()].collections.find(c=>c.id===saved.collectionId)?.name||'Favorites')}</p><button class="text-btn" data-action="navigate" data-id="${esc(saved.collectionId)}">Open collection ${icon('arrow')}</button>`;
      return `<header><strong>A home for this discovery</strong>${close}</header><form id="social-flow-save" ${attr(e)}><label class="sr-only" for="flow-save-collection">Save in collection</label><select id="flow-save-collection" name="collection">${collections.map(c=>`<option value="${esc(c.id)}">${esc(c.name)}</option>`).join('')}<option value="__new">+ New collection</option></select><input name="newCollection" placeholder="Collection name" aria-label="New collection name" maxlength="80" ${collections.length?'hidden':''}><button class="primary" type="submit">${icon('bookmark')}Save card</button><p class="social-form-error" role="alert"></p></form>`;
    }
    const rows=comments(e);
    return `<header><strong>Conversation · ${rows.length}</strong>${close}</header><div class="flow-comment-list">${rows.map(c=>`<article class="flow-comment">${avatar(c.userId)}<div><strong>${esc(name(c.userId))}</strong><time>${relativeTime(c.createdAt)}</time><p>${esc(c.text)}</p></div></article>`).join('')||'<p class="form-hint">What makes this worth keeping?</p>'}</div><form id="social-flow-comment" ${attr(e)}><textarea name="comment" aria-label="Your comment" placeholder="Add your perspective…" rows="2" maxlength="1500" required>${esc(drafts.get(e.key)||'')}</textarea><button class="primary" type="submit">${icon('send')}Send</button><p class="social-form-error" role="alert"></p></form>`;
  }
  function insight(e){
    if(e.format==='video')return '';
    const note=comments(e).filter(c=>c.text?.trim()).at(-1);
    if(note)return '<button hidden class="flow-insight" data-social="flow-comments" '+attr(e)+'><small>'+icon('comment')+'From the conversation · '+esc(name(note.userId))+'</small><span>“'+esc(note.text.slice(0,170))+(note.text.length>170?'…':'')+'”</span><b>Join the conversation '+icon('arrow')+'</b></button>';
    if(e.kind==='collection')return '<button hidden class="flow-insight" data-social="collection" data-owner="'+esc(e.owner)+'" data-id="'+esc(e.collection.id)+'"><small>'+icon('collection')+'A peek inside</small><span>'+esc(e.cards.slice(0,3).map(c=>c.title).join(' · '))+'</span><b>Explore '+e.cards.length+' cards '+icon('arrow')+'</b></button>';
    const collection=visibleCollections(data(),e.owner,me()).find(c=>c.id===e.card.collectionId);
    if(collection)return '<button hidden class="flow-insight" data-social="collection" data-owner="'+esc(e.owner)+'" data-id="'+esc(collection.id)+'"><small>'+icon('collection')+'Keep exploring</small><span>'+esc(collection.name)+'</span><b>More from '+esc(name(e.owner).split(' ')[0])+'’s collection '+icon('arrow')+'</b></button>';
    return '<div hidden class="flow-insight"><small>'+icon('spark')+'Shared discovery</small><span>'+esc(e.topic.label)+'</span><b>Save it for later, or add your perspective.</b></div>';
  }
  function itemHTML(e,i){
    const title=e.card?.title||e.collection.name,description=e.card?.description||e.collection.description;
    const topicIndex=ROOT_TOPICS.findIndex(t=>t.id===e.topic.id),fields=e.fields||{};
    const chips=[e.kind==='collection'?'Collection':CONTENT_KINDS[fields.kind]||({video:'Video',audio:'Music',picture:'Picture',document:'File',link:'Website'})[e.format],fields.artist||fields.creator,fields.genre,fields.decade].filter(Boolean);
    const reason=prefs().order==='mix'?'A mix of formats and topics':prefs().order==='popular'?'Community saves, likes & recommendations':prefs().order==='trending'?'Activity from distinct people this week':'Most recently shared';
    return `<section class="flow-stop" data-flow-index="${i}" ${attr(e)} aria-label="Discovery ${i+1}: ${esc(title)}"><article class="flow-card tint-${esc(e.topic.color)}" data-format="${esc(e.format)}"><div class="flow-preview" style="--art-x:${(topicIndex%6)*20}%;--art-y:${Math.floor(topicIndex/6)*50}%"><span class="flow-topic-art" aria-hidden="true"></span><div class="flow-media">${preview(e)}</div>${act(e,'stop-media',icon('close'),'icon-btn flow-stop-media','aria-label="Close inline player"')}<span class="flow-preview-topic">${icon(e.topic.icon)}${esc(e.topic.label)}</span>${insight(e)}</div><div class="flow-copy"><div class="flow-curator"><span>${avatar(e.owner)}<span><small>Collected by</small>${profileChip(e.owner)}</span></span><span class="flow-sequence">${String(i+1).padStart(2,'0')}</span></div><div class="flow-description"><div class="flow-tags">${chips.slice(0,3).map(t=>`<span>${esc(t)}</span>`).join('')}</div><h2>${esc(title)}</h2><p>${esc(description||'A discovery from someone’s corner of the internet.')}</p>${e.card?.url&&['video','audio'].includes(e.card.type)?`<a class="flow-original" href="${esc(e.card.url)}" target="_blank" rel="noopener">Open original ${icon('arrow')}</a>`:''}</div><div data-flow-actions>${actions(e)}</div><div class="flow-extra" ${attr(e)} ${extra?.key===e.key?'':'hidden'}>${extraHTML(e)}</div><div class="flow-context"><span>${icon('spark')}${esc(reason)}</span>${e.kind==='card'?`<button class="text-btn" data-social="collection" data-owner="${esc(e.owner)}" data-id="${esc(e.card.collectionId)}">From ${esc(e.collection?.name||'a shared collection')} ${icon('arrow')}</button>`:''}</div></div></article><button class="flow-next-hint" data-social="flow-next">${i+1<Math.min(shown,items.length)?'Keep your curiosity moving':'A little pause. More below.'}${icon('down')}</button></section>`;
  }
  function render(){
    rebuild();renderedUser=me();const p=prefs();
    return `<section class="flow-heading"><div><span class="eyebrow">FOLLOW YOUR CURIOSITY</span><h1>One good thing leads to another.</h1></div><div class="flow-heading-tools"><button class="flow-live-toggle" data-social="flow-live" aria-pressed="${p.livePreviews}" title="After two seconds: muted video or a gentle card preview">${icon('spark')}Live previews <span>${p.livePreviews?'On':'Off'}</span></button><span class="flow-position" aria-live="polite">${items.length?index+1:0} / ${Math.min(shown,items.length)}</span></div></section><div class="flow-controls"><div class="flow-formats" role="group" aria-label="Flow content">${Object.entries(FLOW_FORMATS).map(([v,label])=>`<button data-social="flow-format" data-value="${v}" aria-pressed="${p.format===v}">${label}</button>`).join('')}</div><div class="flow-selects"><label><span class="sr-only">Flow topic</span><select id="flow-topic"><option value="all">All topics</option>${ROOT_TOPICS.map(t=>`<option value="${t.id}" ${p.topic===t.id?'selected':''}>${esc(t.label)}</option>`).join('')}</select></label><label><span class="sr-only">Flow audience</span><select id="flow-audience">${Object.entries({everyone:'Everyone',following:'Following',friends:'Friends'}).map(([v,label])=>`<option value="${v}" ${p.audience===v?'selected':''}>${label}</option>`).join('')}</select></label><label><span class="sr-only">Flow order</span><select id="flow-order">${Object.entries(FLOW_ORDERS).map(([v,label])=>`<option value="${v}" ${p.order===v?'selected':''}>${label}</option>`).join('')}</select></label></div></div><div class="flow-layout"><div id="flow-scroll" class="flow-viewport" tabindex="0" role="region" aria-label="Discovery flow. Scroll or use up and down arrows.">${items.slice(0,shown).map(itemHTML).join('')}<section class="flow-end flow-stop" data-flow-index="${Math.min(shown,items.length)}"><span class="flow-end-icon">${icon(items.length?'spark':'compass')}</span><h2>${items.length?'A little room to breathe.':'Let’s find your next good thing.'}</h2><p>${items.length?`You’ve reached ${Math.min(shown,items.length)} discoveries. Keep exploring whenever you feel like it.`:'No discoveries match these choices yet. Try another topic or audience.'}</p>${items.length>shown?'<button class="primary" data-social="flow-more">Another 12 discoveries '+icon('arrow')+'</button>':'<button class="primary" data-social="flow-reset">Explore everything '+icon('compass')+'</button>'}${p.hidden.length?'<button class="text-btn" data-social="flow-restore">Bring back skipped discoveries</button>':''}</section></div><div class="flow-scroll-controls"><button class="icon-btn" data-social="flow-previous" aria-label="Previous discovery">${icon('up')}</button><span class="flow-track"><span></span></span><button class="icon-btn" data-social="flow-next" aria-label="Next discovery">${icon('down')}</button></div></div><footer class="flow-footnote"><span>${icon('mouse')}Scroll to explore · ↑ ↓ also work</span><span>Your topics. Your order. <button class="text-btn" data-social="flow-explain">How this works</button></span></footer>`;
  }
  function nodeFor(e){return [...document.querySelectorAll('.flow-stop[data-flow-key]')].find(n=>n.dataset.flowKey===e.key);}
  function patch(e){const node=nodeFor(e);if(!node)return;node.querySelector('[data-flow-actions]').innerHTML=actions(e);const panel=node.querySelector('.flow-extra');panel.hidden=extra?.key!==e.key;panel.innerHTML=extraHTML(e);syncMediaAction(e);}
  function syncMediaAction(e){
    const node=nodeFor(e),button=node?.querySelector('[data-flow-actions] [data-social="flow-open"]');if(!button)return;
    const media=flowMediaState(node.querySelector('.flow-media'));
    let label='Play here',symbol='play';
    if(media?.embed){label='Close player';symbol='close';}
    else if(media?.state==='error'){label='Try again';symbol='reset';}
    else if(media?.state==='blocked'){label='Play here';}
    else if(media?.state==='ended'){label='Replay';symbol='reset';}
    else if(media?.state==='paused'){label='Resume';}
    else if(media?.muted){label='Sound on';symbol='sound';}
    else if(media?.state==='playing'){label='Pause';symbol='pause';}
    else if(media){label='Loading…';symbol='play';}
    if(['video','audio'].includes(e.card?.type)&&button.dataset.mediaLabel!==label){button.innerHTML=icon(symbol)+label;button.dataset.mediaLabel=label;}
  }
  async function startMedia(e,autoplay=false){
    getCard(data(),e.owner,e.card.id,me());
    if(!autoplay)ctx.stopPlayback();
    const media=nodeFor(e)?.querySelector('.flow-media');if(!media)return;
    await playFlowMedia(e.card,media,()=>{media.classList.remove('is-playing');if(media.isConnected){media.innerHTML=preview(e);ctx.hydrate();}},{autoplay,onChange:()=>syncMediaAction(e)});
  }
  function settled(e){
    const node=e&&nodeFor(e);if(!node||!viewport?.isConnected)return false;
    const r=node.getBoundingClientRect(),v=viewport.getBoundingClientRect();
    return Math.max(0,Math.min(r.bottom,v.bottom,innerHeight)-Math.max(r.top,v.top,0))/r.height>=.92;
  }
  function scheduleDwell(restart=false){
    const e=current();
    dwell.update(e?.key||null,{restart,eligible:!!e&&prefs().livePreviews&&!document.hidden&&settled(e)&&extra?.key!==e.key});
  }
  function activateDiscovery(key){
    const e=current();if(!e||e.key!==key||!settled(e)||document.hidden||!prefs().livePreviews)return;
    const node=nodeFor(e);node.classList.add('is-awake');const hint=node.querySelector('.flow-insight');if(hint)hint.hidden=false;
    if(e.format==='video')startMedia(e,true).catch(()=>{});
  }
  function clearPreviewReveal(){
    viewport?.querySelectorAll('.is-awake').forEach(node=>{node.classList.remove('is-awake');const hint=node.querySelector('.flow-insight');if(hint)hint.hidden=true;});
  }
  function flowScroll(){
    const e=current();if(e&&!settled(e)){const node=nodeFor(e),media=flowMediaState(node?.querySelector('.flow-media'));if(node?.classList.contains('is-awake')||media)dwell.reset();clearPreviewReveal();if(media)stopFlowMedia();}
    scheduleDwell(true);
  }
  function visibilityChanged(){
    dwell.reset();if(document.hidden){clearPreviewReveal();stopFlowMedia();}else scheduleDwell();
  }
  function go(step){
    dwell.update(current()?.key||null,{eligible:false});
    const stops=[...viewport?.querySelectorAll('.flow-stop')||[]];const target=stops[Math.max(0,Math.min(stops.length-1,index+step))];
    if(target)viewport.scrollTo({top:target.offsetTop-stops[0].offsetTop,behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'});
  }
  function beforeRender(){
    dwell.reset();document.removeEventListener('visibilitychange',visibilityChanged);window.removeEventListener('scroll',flowScroll);
    if(viewport?.isConnected){positions.set(renderedUser,{key:current()?.key,index,shown,signature});const field=viewport.querySelector('#social-flow-comment textarea');if(field)drafts.set(field.form.dataset.flowKey,field.value);}
    observer?.disconnect();observer=null;resizeObserver?.disconnect();resizeObserver=null;window.removeEventListener('resize',fitViewport);stopFlowMedia();viewport=null;
  }
  function fitViewport(){
    if(!viewport?.isConnected)return;
    viewport.style.setProperty('--flow-top',(viewport.getBoundingClientRect().top+window.scrollY)+'px');
  }
  function hydrate(){
    const next=document.querySelector('#flow-scroll');document.body.classList.toggle('flow-active',!!next);if(!next||viewport===next)return;
    viewport=next;fitViewport();resizeObserver=new ResizeObserver(fitViewport);document.querySelectorAll('.flow-controls,.topbar,.community-view-tabs').forEach(el=>resizeObserver.observe(el));window.addEventListener('resize',fitViewport);const remembered=positions.get(me());if(remembered?.signature===signature&&remembered.key){const at=items.findIndex(e=>e.key===remembered.key);if(at>=0)index=at;}
    viewport.addEventListener('scroll',flowScroll,{passive:true});window.addEventListener('scroll',flowScroll,{passive:true});document.addEventListener('visibilitychange',visibilityChanged);
    const stops=[...viewport.querySelectorAll('.flow-stop')];
    const start=stops[Math.min(index,stops.length-1)];if(start)viewport.scrollTop=start.offsetTop-stops[0].offsetTop;
    observer=new IntersectionObserver(entries=>{
      const best=entries.filter(e=>e.isIntersecting&&e.intersectionRatio>=.55).sort((a,b)=>b.intersectionRatio-a.intersectionRatio)[0];if(!best)return;
      const nextIndex=Number(best.target.dataset.flowIndex);if(nextIndex!==index){clearPreviewReveal();dwell.reset();stopFlowMedia();index=nextIndex;}
      scheduleDwell();
      const count=document.querySelector('.flow-position');if(count)count.textContent=index<Math.min(shown,items.length)?`${index+1} / ${Math.min(shown,items.length)}`:'Take your time';
      const progress=document.querySelector('.flow-track>span');if(progress)progress.style.height=(100*Math.min(index+1,shown,items.length)/Math.max(1,Math.min(shown,items.length)))+'%';
      const prev=document.querySelector('[aria-label="Previous discovery"]'),nextButton=document.querySelector('[aria-label="Next discovery"]');if(prev)prev.disabled=index===0;if(nextButton)nextButton.disabled=index>=stops.length-1;
    },{root:viewport,threshold:[.55,.8,.92,.99]});stops.forEach(node=>observer.observe(node));
    viewport.addEventListener('keydown',event=>{if(event.target.closest('input,textarea,select,button,a,iframe')||!['ArrowDown','ArrowUp','PageDown','PageUp'].includes(event.key))return;event.preventDefault();event.stopPropagation();go(['ArrowDown','PageDown'].includes(event.key)?1:-1);});
  }
  async function click(el){
    const action=el.dataset.social;if(!action?.startsWith('flow-'))return false;
    if(action==='flow-next'||action==='flow-previous'){go(action==='flow-next'?1:-1);return true;}
    if(action==='flow-live'){
      updatePreferences({livePreviews:!prefs().livePreviews});dwell.reset();
      if(!prefs().livePreviews){clearPreviewReveal();stopFlowMedia();}else scheduleDwell();
      el.setAttribute('aria-pressed',String(prefs().livePreviews));el.querySelector('span').textContent=prefs().livePreviews?'On':'Off';await ctx.persist();return true;
    }
    if(action==='flow-format'){updatePreferences({format:el.dataset.value});await ctx.persist();ctx.render();return true;}
    if(action==='flow-reset'){updatePreferences({format:'all',topic:'all',audience:'everyone',order:'mix'});signature='';await ctx.persist();ctx.render();return true;}
    if(action==='flow-restore'){updatePreferences({hidden:[]});await ctx.persist();ctx.render();return true;}
    if(action==='flow-more'){index=shown;shown+=12;positions.delete(me());ctx.render();return true;}
    if(action==='flow-explain'){ctx.toast('Flow uses shared cards and collections. Mixed view rotates formats and topics; other orders use visible community activity. No paid placements.');return true;}
    if(action==='flow-stop-media'){dwell.dismiss(current()?.key);stopFlowMedia();return true;}
    const e=items.find(e=>e.key===el.dataset.flowKey);if(!e)return true;
    if(e.kind==='card')getCard(data(),e.owner,e.card.id,me());else if(!visibleCollections(data(),e.owner,me()).some(c=>c.id===e.collection.id))throw Error('This collection is no longer shared.');
    if(action==='flow-open'){
      if(['video','audio'].includes(e.card.type)){
        dwell.dismiss(e.key);const media=nodeFor(e)?.querySelector('.flow-media'),playing=flowMediaState(media);
        if(playing?.embed||(playing?.state==='playing'&&!playing.muted))pauseFlowMedia(media);
        else if(playing&&playing.state!=='error'){ctx.stopPlayback({keepFlow:true});resumeFlowMedia(media);}
        else await startMedia(e);
      }else await ctx.openShared(e.owner,e.card);return true;
    }
    if(action==='flow-like'){toggleLike(data(),me(),e.owner,e.card.id);await ctx.persist();patch(e);return true;}
    if(action==='flow-save'||action==='flow-comments'){
      const previous=items.find(item=>item.key===extra?.key),kind=action==='flow-save'?'save':'comments';
      extra=extra?.key===e.key&&extra.kind===kind?null:{key:e.key,kind};if(previous)patch(previous);patch(e);scheduleDwell();nodeFor(e)?.querySelector('.flow-extra textarea,.flow-extra select')?.focus({preventScroll:true});return true;
    }
    if(action==='flow-extra-close'){extra=null;patch(e);scheduleDwell();return true;}
    if(action==='flow-follow'){const existing=subscription(data(),me(),e.owner,e.collection.id);if(existing){ctx.toast('Already following. Manage updates from this collection’s page.');return true;}followCollection(data(),me(),e.owner,e.collection.id);await ctx.persist();patch(e);ctx.toast('Following. New cards will reach your dashboard.');return true;}
    if(action==='flow-hide'){const old=prefs().hidden;updatePreferences({hidden:[...old,e.key]});await ctx.persist();ctx.render();ctx.toast('Skipped in Flow.',async()=>{updatePreferences({hidden:prefs().hidden.filter(k=>k!==e.key)});await ctx.persist();ctx.render();});return true;}
    return true;
  }
  async function submit(form){
    if(!['social-flow-comment','social-flow-save'].includes(form.id))return false;
    const e=items.find(e=>e.key===form.dataset.flowKey);if(!e)throw Error('This discovery is no longer here.');
    if(form.id==='social-flow-save'){
      let collectionId=form.elements.collection.value;
      if(collectionId==='__new'){
        const name=form.elements.newCollection.value.trim();if(!name)throw Error('Give the collection a name.');
        const space=data().spaces[me()],existing=personalCollections(space).find(c=>c.name.toLowerCase()===name.toLowerCase());
        if(existing)collectionId=existing.id;else {collectionId=uid();space.collections.push({id:collectionId,name,visibility:'private',color:'sage',icon:'collection',collapsed:false});}
      }
      saveSharedCard(data(),me(),e.owner,e.card.id,collectionId,e.card.title);await ctx.persist();extra=null;patch(e);ctx.toast('Saved to your space.');return true;
    }
    const text=form.elements.comment.value.trim();if(!text)throw Error('Write a comment first.');
    if(e.kind==='card'){const stats=engagement(data(),e.owner,e.card,me());addComment(data(),me(),e.owner,e.card.id,stats.target.startsWith('resource:')?'community':'circle',text);}
    else{
      if(!visibleCollections(data(),e.owner,me()).some(c=>c.id===e.collection.id))throw Error('This collection is no longer shared.');
      data().comments.push({id:uid(),target:'collection:'+e.owner+':'+e.collection.id,userId:me(),text,createdAt:Date.now()});
      if(e.owner!==me())data().notifications.push({id:uid(),to:e.owner,from:me(),owner:e.owner,collectionId:e.collection.id,title:e.collection.name,text:'commented on',createdAt:Date.now(),read:false});
    }
    drafts.delete(e.key);await ctx.persist();patch(e);const list=nodeFor(e)?.querySelector('.flow-comment-list');if(list)list.scrollTop=list.scrollHeight;nodeFor(e)?.querySelector('textarea')?.focus({preventScroll:true});return true;
  }
  function input(el){if(el.form?.id==='social-flow-comment')drafts.set(el.form.dataset.flowKey,el.value);}
  async function change(el){
    if(['flow-topic','flow-audience','flow-order'].includes(el.id)){updatePreferences({[el.id.slice(5)]:el.value});await ctx.persist();ctx.render();return;}
    if(el.id==='flow-save-collection'){const field=el.form.elements.newCollection;field.hidden=el.value!=='__new';field.required=!field.hidden;if(!field.hidden)field.focus();}
  }
  return{render,hydrate,beforeRender,click,submit,input,change};
}
