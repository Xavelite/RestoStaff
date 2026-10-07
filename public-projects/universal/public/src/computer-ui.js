import { escapeHTML as esc, uid, safeURL, metadata, logoForURL } from './model.js';
import { icon } from './icons.js';
import { putFile } from './storage.js';
import { localFileType, isPicture, isExecutable, steamLink, validLauncher, launcherLabel, shortcutURL, launcherIcon } from './local-items.js';

const companion = 'http://127.0.0.1:4174';
const connectionKey = 'universal-companion-connection';
const requiredVersion=['localhost','127.0.0.1'].includes(location.hostname)?3:4;
const readConnection = () => { try { return JSON.parse(localStorage.getItem(connectionKey) || 'null'); } catch { return null; } };
export function createComputerUI(ctx) {
  let targetCollection = '', editingId = '', owner = '', drop = null, hover = null, busy = false;
  let appList = [], panelVersion = 0, suggestedName = '', selectedAppId = '';
  const data = ctx.data, state = ctx.state, me = () => data().activeUser;
  const button = (act, label, extra = '', cls = 'secondary') => `<button type="button" class="${cls}" data-action="computer-${act}" ${extra}>${label}</button>`;
  const collection = id => state().collections.find(c => c.id === id)?.id || state().collections.find(c => c.id === ctx.ui().collection)?.id || state().collections[0]?.id;
  const options = selected => state().collections.map(c => `<option value="${esc(c.id)}" ${c.id === selected ? 'selected' : ''}>${esc(c.name)}</option>`).join('');
  async function request(route, body) {
    let response;
    try { response = await fetch(companion + route, { method: body ? 'POST' : 'GET', headers: { ...(body ? {'Content-Type':'application/json'} : {}), ...(readConnection()?.token ? {Authorization:'Bearer '+readConnection().token} : {}) }, ...(body ? {body:JSON.stringify(body)} : {}), signal: AbortSignal.timeout(body ? 185000 : 2500) }); }
    catch { throw Error('Start Universal Companion on this computer, then try again.'); }
    const result = await response.json();
    if (!response.ok) throw Error(result.error || 'The companion could not complete this action.');
    return result;
  }
  function show(collectionId, cardId = '', hint = '') {
    const existing=state().cards.find(c=>c.id===cardId);
    if(existing?.launcher&&['file','folder'].includes(existing.launcher.kind)){ctx.editLocal(existing.id,hint);return;}
    ctx.openAppForm(collectionId,cardId,hint);
  }
  function appFields(card) {
    const hint=card.localHint;
    return `<div class="app-form-fields">
      ${hint ? `<p class="computer-hint">${esc(hint)}</p>` : ''}
      <section class="computer-apps" id="computer-apps" aria-label="Installed apps">
        <div class="computer-apps-heading"><strong>Installed apps</strong>${button('refresh-apps',icon('repeat'),'aria-label="Refresh installed apps"','icon-btn')}</div>
        <label class="computer-app-search">${icon('search')}<input id="computer-app-query" type="search" placeholder="Find an app…" aria-label="Find an installed app" autocomplete="off"></label>
        <div id="computer-app-results" class="computer-app-results" aria-live="polite"></div><small id="computer-app-count"></small>
      </section>
      <div class="app-selection" id="app-selection" ${validLauncher(card.launcher)?'':'hidden'}>${selectionPreview(card.launcher,card.appLabel||card.title)}</div>
      <div class="computer-connection"><div class="computer-status" id="computer-status" role="status">Checking companion…</div><div class="computer-connect-actions">${button('connect',icon('link')+'Connect this browser')}${button('browse','Browse…','title="Choose an EXE or shortcut"','text-btn')}</div></div>
      <details class="computer-setup"><summary>Connection & settings</summary>
        <label class="computer-startup"><input type="checkbox" data-computer-startup disabled><span><strong>Start with Windows</strong><small>Ready when you need it, quietly in the background.</small></span></label>
        <div class="computer-install"><a class="secondary" href="/universal/assets/companion/Universal-Companion-Windows.zip" download>${icon('download')}Download companion</a><p>Extract the ZIP and open <strong>Set up Universal Companion.cmd</strong>. Everything goes into your local UniversalCompanion folder; no separate runtime installation needed.</p></div>
        <p>Already installed? Open <strong>Universal Companion</strong> from the Windows Start menu, then check the connection here.</p>
        ${button('status','Check connection','','text-btn')}${button('disconnect','Disconnect this browser','','text-btn')}
      </details>
      <details class="computer-steam"><summary>Steam shortcuts <small>no companion needed</small></summary><p>Opens the installed Steam app.</p><div>${button('steam','Steam library','data-uri="steam://open/library"')}${button('steam','Open Steam','data-uri="steam://open/main"')}</div><div class="computer-steam-game"><label class="field">A specific game<input id="computer-game-id" inputmode="numeric" placeholder="Steam game ID, e.g. 570"></label>${button('steam-game','Select game')}</div></details></div>`;
  }
  function selectionPreview(launcher,label) {
    if(!validLauncher(launcher))return '';
    return `${launcherIcon(launcher.icon)?`<img src="${esc(launcher.icon)}" alt="">`:icon(launcher.kind==='steam'?'play':'monitor')}<div><strong>${esc(label)}</strong><small>Selected · opens on this PC</small></div>${icon('check')}`;
  }
  function mountApps(card) {
    panelVersion++;owner=me();editingId=card.id||'';targetCollection=card.collectionId;
    selectedAppId=card.appCatalogId||'';suggestedName='';
    status();
    if(appList.length)renderApps();else loadApps(false,false).catch(()=>{});
  }
  function stageApp(launcher,label,appId='') {
    if(!validLauncher(launcher))throw Error('Choose an app to add.');
    if(!ctx.selectApp({launcher,label,appId}))return;
    selectedAppId=appId;renderApps();
    const preview=document.getElementById('app-selection');
    if(preview){preview.hidden=false;preview.innerHTML=selectionPreview(launcher,label);}
  }
  async function status() {
    const el = document.getElementById('computer-status'); if (!el) return;
    const disconnect=document.querySelector('#dialog [data-action="computer-disconnect"]');if(disconnect)disconnect.hidden=true;
    try { const result = await request('/status'); if (el.isConnected) {
      el.textContent = result.version < requiredVersion ? 'Update your companion using the download below' : result.connected ? 'Connected to this PC' : 'Connect once to see your apps';
      el.dataset.ready = String(result.connected);if(disconnect)disconnect.hidden=!result.connected;
      const connectButton=document.querySelector('#dialog [data-action="computer-connect"]');if(connectButton)connectButton.hidden=result.connected;
      const startup=document.querySelector('[data-computer-startup]');if(startup){startup.checked=!!result.startup;startup.disabled=!result.connected||!result.installed;}
    } }
    catch { if (el.isConnected) { el.textContent = 'Companion is not running yet'; el.dataset.ready = 'false';document.querySelector('#dialog .computer-setup')?.setAttribute('open',''); } }
  }
  async function connect() {
    const result = await request('/pair', {});
    localStorage.setItem(connectionKey, JSON.stringify(result));
    await status(); return result;
  }
  async function ensureConnected() {
    const health=await request('/status');
    if(health.version<requiredVersion)throw Error('Update the companion from settings below, then check the connection.');
    if(!health.connected)await connect();
  }
  function currentSelection() {
    return {selectedOwner:me(),form:document.getElementById('card-form'),version:panelVersion};
  }
  async function finishPick(picked, selection) {
    if(picked.cancelled||selection.selectedOwner!==me()||!selection.form?.isConnected||selection.version!==panelVersion)return;
    stageApp(launcherFrom(picked),picked.label,selection.appId||'');
  }
  function renderApps() {
    const results=document.getElementById('computer-app-results');if(!results)return;
    const query=(document.getElementById('computer-app-query')?.value||'').trim().toLocaleLowerCase();
    const matches=appList.filter(app=>app.label.toLocaleLowerCase().includes(query));
    results.innerHTML=matches.length ? matches.map(app=>button('select-app',`${launcherIcon(app.icon)?`<img src="${esc(app.icon)}" alt="">`:`<span class="computer-app-fallback" aria-hidden="true">${esc(app.label.slice(0,1))}</span>`}<span>${esc(app.label)}</span><small>${selectedAppId===app.id?icon('check'):'+'}</small>`,`data-app-id="${esc(app.id)}" aria-pressed="${selectedAppId===app.id}" aria-label="Select ${esc(app.label)}" title="${esc(app.label)}"`,'computer-app-row')).join('') : '<p class="computer-app-empty">No apps match. Try another name or use Browse below.</p>';
    document.getElementById('computer-app-count').textContent=`${matches.length} ${matches.length===1?'app':'apps'} · scroll or search to find yours`;
  }
  async function loadApps(refresh=false,prompt=true) {
    const version=panelVersion,section=document.getElementById('computer-apps');if(!section)return;
    section.hidden=false;document.getElementById('computer-app-results').textContent='Finding your installed apps…';
    let result;
    try {if(prompt)await ensureConnected();else {const health=await request('/status');if(!health.connected||health.version<requiredVersion)throw Error('Connect this browser to see your installed apps.');}result=await request('/apps',{refresh});}
    catch(error){if(version===panelVersion&&section.isConnected){document.getElementById('computer-app-results').innerHTML=`<p class="computer-app-empty">${esc(error.message.includes('Connect this browser')?'Connect this browser below to see your installed apps.':'Your apps will appear here when the companion is connected.')}</p>`;document.getElementById('computer-app-count').textContent='';}throw error;}
    if(version!==panelVersion||!section.isConnected)return;
    appList=result.apps;renderApps();
  }
  const filePreference=()=>localStorage.getItem('universal-file-choice-'+me())||'upload';
  const rememberFileChoice=value=>localStorage.setItem('universal-file-choice-'+me(),value);
  const launcherFrom=picked=>({kind:picked.kind,targetId:picked.targetId,deviceId:picked.deviceId,icon:launcherIcon(picked.icon),iconVersion:2,registered:!!picked.registered});
  async function chooseLocal(kind='file',name='') {
    await ensureConnected();
    const picked=await request('/pick',{kind,suggestedName:name});
    return picked.cancelled?null:{launcher:launcherFrom(picked),fileName:picked.label};
  }
  async function refreshCardIcons() {
    try{
      const health=await request('/status');if(!health.connected||health.version<requiredVersion)return;
      if(!Object.values(data().spaces).some(s=>s.cards.some(c=>c.launcher?.deviceId===health.deviceId&&c.launcher.iconVersion!==2)))return;
      const result=await request('/target-icons',{});let changed=false;
      for(const space of Object.values(data().spaces))for(const card of space.cards){
        if(card.launcher?.deviceId!==result.deviceId)continue;
        const icon=launcherIcon(result.items.find(t=>t.targetId===card.launcher.targetId)?.icon);
        if(icon&&(icon!==card.launcher.icon||card.launcher.iconVersion!==2)){card.launcher.icon=icon;card.launcher.iconVersion=2;changed=true;}
      }
      if(changed){await ctx.persist();ctx.render();}
    }catch{/* The companion is optional; app cards remain usable when it reconnects. */}
  }
  async function commit(cards, selectedOwner, selectedCollection) {
    const space = data().spaces[selectedOwner];
    if (!space?.collections.some(c => c.id === selectedCollection)) throw Error('That collection is no longer available. Choose another collection.');
    const added = cards.map(card => ({ id:uid(), createdAt:Date.now(), color:'blue', favorite:false, tags:[], description:'', ...card, collectionId:selectedCollection, visibility:'private' }));
    space.cards.push(...added);
    await ctx.persist();
    if (me() === selectedOwner) { Object.assign(ctx.ui(), {page:'space',collection:selectedCollection,filter:'all',query:''}); }
    ctx.render();
    ctx.toast(`${added.length === 1 ? 'Card added' : added.length+' cards added'} to ${space.collections.find(c=>c.id===selectedCollection).name}.`, async () => {
      data().spaces[selectedOwner].cards = data().spaces[selectedOwner].cards.filter(c => !added.some(a=>a.id===c.id));
      ctx.refreshState(); await ctx.persist(); ctx.render();
    });
  }
  async function pick(kind) {
    const selection=currentSelection();await ensureConnected();
    const picked=await request('/pick',{kind,suggestedName});
    await finishPick(picked,selection);
  }
  async function open(card) {
    if (!validLauncher(card.launcher)) { show(card.collectionId,card.id,'Choose the original item to reconnect this card.');return; }
    if (card.launcher.kind === 'steam') { window.location.href=steamLink(card.launcher.uri);return; }
    try { await request('/launch',{targetId:card.launcher.targetId,deviceId:card.launcher.deviceId});ctx.toast('Opening '+card.title+' on this computer.'); }
    catch (error) { show(card.collectionId,card.id,error.message); }
  }
  function dismissDrop() { document.getElementById('computer-drop-tray')?.remove();drop=null; }
  function dropTray(files, selectedCollection, cardId) {
    dismissDrop();
    drop={files,owner:me(),collectionId:collection(selectedCollection),cardId};
    const target=state().cards.find(c=>c.id===cardId),single=files.length===1,executable=files.some(isExecutable);
    const tray=document.createElement('section');tray.id='computer-drop-tray';tray.className='computer-drop-tray';tray.setAttribute('role','region');tray.setAttribute('aria-label','Add dropped files');
    const saveChoice=!executable?button('save-files',icon('upload')+`<span><strong>Save to Universal</strong><small>A copy · preview here · this browser for now · 10 MB each</small></span>`,'',filePreference()==='upload'?'secondary is-preferred':'secondary'):'';
    const linkChoice=(!executable||single)?button('link-file',icon('link')+`<span><strong>${executable?'Add app':single?'Link original':'Link originals'}</strong><small>Stays on this PC · choose ${single?'the original':'these files'} once in Windows</small></span>`,'',filePreference()==='url'?'secondary is-preferred':'secondary'):'';
    tray.innerHTML=`<header>${icon(single&&isPicture(files[0])?'image':'upload')}<div><strong>${single?esc(files[0].name):files.length+' files ready'}</strong><small>${executable?'Apps stay on your computer':'One choice for '+(single?'this file':'these files')}</small></div>${button('dismiss-drop',icon('close'),'aria-label="Cancel file import"','icon-btn')}</header><label class="field">Collection<select id="drop-collection">${options(drop.collectionId)}</select></label><div class="drop-choices">${filePreference()==='url'?linkChoice+saveChoice:saveChoice+linkChoice}${single&&isPicture(files[0])&&target&&target.type!=='widget'?button('cover',icon('image')+`<span><strong>Use as cover for ${esc(target.title)}</strong><small>The card will be private</small></span>`):''}</div>${executable&&!single?'<p>Drop one app or shortcut at a time to connect it.</p>':''}<p class="computer-error" role="alert"></p>`;
    document.body.append(tray);tray.querySelector('select')?.focus({preventScroll:true});
  }
  async function saveFiles() {
    const pending=drop;if(!pending)return;
    const selected=document.getElementById('drop-collection').value;
    if(pending.files.length>50)throw Error('Add up to 50 files at a time.');
    const tooLarge=pending.files.find(f=>f.size>10*1024*1024);
    if(tooLarge)throw Error(tooLarge.name+' is larger than 10 MB. Link it on this computer instead.');
    if(pending.files.some(isExecutable))throw Error('Use Link on this computer for apps and shortcuts.');
    const cards=[];
    for(const file of pending.files){const fileId=uid();await putFile(fileId,file);cards.push({type:localFileType(file),title:file.name.replace(/\.[^.]+$/,''),url:'',fileId,fileName:file.name,fileSize:file.size,mime:file.type,description:'Saved in this browser'});}
    await commit(cards,pending.owner,selected);rememberFileChoice('upload');dismissDrop();
  }
  async function linkDroppedFiles() {
    const pending=drop,selected=document.getElementById('drop-collection').value;
    if(pending.owner!==me())throw Error('Switch back to the profile where you dropped these files.');
    if(pending.files.length>50)throw Error('Add up to 50 files at a time.');
    if(pending.files.some(isExecutable)){
      dismissDrop();show(selected,'','Choose the app, or use Browse to locate '+pending.files[0].name+'.');suggestedName=pending.files[0].name;return;
    }
    await ensureConnected();
    const result=await request('/pick-files',{suggestedName:pending.files.length===1?pending.files[0].name:''});if(result.cancelled)return;
    const expected=pending.files.map(f=>f.name.toLocaleLowerCase()).sort(),actual=result.items.map(f=>f.label.toLocaleLowerCase()).sort();
    if(JSON.stringify(expected)!==JSON.stringify(actual))throw Error('Choose the same '+pending.files.length+' file(s) you dropped so the cards link to the right originals.');
    await commit(result.items.map(item=>({type:'file',title:item.label.replace(/\.[^.]+$/,''),fileName:item.label,url:'',launcher:launcherFrom(item),description:'Linked original · on this PC'})),pending.owner,selected);
    rememberFileChoice('url');dismissDrop();
  }
  async function cover() {
    const pending=drop,card=data().spaces[pending.owner]?.cards.find(c=>c.id===pending.cardId),file=pending.files[0];
    if(!card||!isPicture(file))throw Error('Choose a picture and an existing card.');
    if(file.size>10*1024*1024)throw Error('Choose a picture smaller than 10 MB.');
    const fileId=uid();await putFile(fileId,file);card.coverFileId=fileId;card.visibility='private';
    await ctx.persist();dismissDrop();ctx.render();ctx.toast('Cover updated. This card is private.');
  }
  async function click(action,el) {
    if(!action.startsWith('computer-'))return false;
    if(busy)return true;
    busy=true;el.disabled=true;
    try {
      const act=action.slice(9);
      if(act==='show')show(document.querySelector('#card-form [name=collectionId]')?.value||el.dataset.collectionId);
      if(act==='close')ctx.closeModal();
      if(act==='connect'){await connect();await loadApps();}
      if(act==='status')await status();
      if(act==='disconnect'){await request('/disconnect',{});localStorage.removeItem(connectionKey);appList=[];await status();await loadApps(false,false);}
      if(act==='pick'){if(el.dataset.kind==='app')await loadApps();else await pick(el.dataset.kind);}
      if(act==='browse')await pick('app');
      if(act==='refresh-apps')await loadApps(true);
      if(act==='select-app'){const selection={...currentSelection(),appId:el.dataset.appId};await ensureConnected();await finishPick(await request('/select-app',{appId:el.dataset.appId}),selection);}
      if(act==='steam')stageApp({kind:'steam',uri:el.dataset.uri},el.dataset.uri.includes('library')?'Steam library':'Steam');
      if(act==='steam-game'){const id=document.getElementById('computer-game-id').value.trim();if(!steamLink('steam://run/'+id))throw Error('Enter the numeric Steam game ID.');stageApp({kind:'steam',uri:'steam://run/'+id},'Steam game '+id);}
      if(act==='dismiss-drop')dismissDrop();
      if(act==='save-files')await saveFiles();
      if(act==='cover')await cover();
      if(act==='remove-cover'){const card=state().cards.find(c=>c.id===el.dataset.id);if(card){delete card.coverFileId;await ctx.persist();ctx.closePopover();ctx.render();}}
      if(act==='link-file')await linkDroppedFiles();
    } catch(error) { const out=document.querySelector('#computer-drop-tray .computer-error,#dialog #form-error');if(out)out.textContent=error.message;else ctx.toast(error.message); }
    finally{busy=false;if(el.isConnected)el.disabled=false;}
    return true;
  }
  async function submit(form) {
    return false;
  }
  const clearHover=()=>{hover?.classList.remove('external-drop-target');hover=null;document.body.classList.remove('receiving-files');};
  document.addEventListener('dragover',e=>{
    if(document.body.classList.contains('arranging-cards')||(e.target.closest('input,textarea,[contenteditable=true]')&&!e.target.closest('[data-file-link-drop],.file-drop')))return;
    if(!e.dataTransfer?.types.includes('Files')&&!e.dataTransfer?.types.includes('text/uri-list'))return;
    e.preventDefault();e.dataTransfer.dropEffect='copy';
    const target=e.target.closest('[data-card], [data-drop-collection], .file-drop, [data-file-link-drop]');
    if(hover!==target){clearHover();hover=target;hover?.classList.add('external-drop-target');}
    document.body.classList.add('receiving-files');
  });
  document.addEventListener('dragleave',e=>{if(!e.relatedTarget)clearHover();});
  window.addEventListener('blur',clearHover);
  async function addLink(url, selected, title) {
    if(steamLink(url)){await commit([{type:'file',title:title||'Steam',url:'',launcher:{kind:'steam',uri:url},description:'Opens in Steam'}],me(),collection(selected));return;}
    if(!/^https?:\/\//i.test(url)||!safeURL(url))return;
    const photo=/\.(png|jpe?g|gif|webp|avif)$/i.test(new URL(url).pathname);
    await commit([{type:photo?'file':'link',title:title||metadata(url).title,url:safeURL(url),description:photo?'Linked picture':'Website',...(photo?{mime:'image/jpeg'}:{})}],me(),collection(selected));
  }
  document.addEventListener('drop',async e=>{
    const files=[...(e.dataTransfer?.files||[])];clearHover();
    const selected=e.target.closest('[data-drop-collection]')?.dataset.dropCollection;
    try {
      const folder=[...(e.dataTransfer?.items||[])].map(item=>item.webkitGetAsEntry?.()).find(entry=>entry?.isDirectory);
      if(folder){e.preventDefault();e.stopImmediatePropagation();if(e.target.closest('#card-form')&&await ctx.acceptFormFolder())return;if(ctx.ui().page!=='space'||document.querySelector('#dialog[open]')){ctx.toast('Drop folders onto your dashboard or the File form.');return;}const picked=await chooseLocal('folder');if(picked)await commit([{type:'file',title:picked.fileName,...picked,url:'',description:'Folder on this PC'}],me(),collection(selected));return;}
      if(!files.length){
        const formLink=e.target.closest('#card-form [data-file-link-drop]');
        if(formLink){const value=(e.dataTransfer?.getData('text/uri-list')||e.dataTransfer?.getData('text/plain')||'').split(/\r?\n/).find(v=>v&&!v.startsWith('#'))||'';if(/^https?:\/\//i.test(value)){e.preventDefault();e.stopImmediatePropagation();ctx.acceptFormLink(value);return;}}
        if(document.body.classList.contains('arranging-cards')||e.target.closest('input,textarea,[contenteditable=true]')||ctx.ui().page!=='space'||document.querySelector('#dialog[open]'))return;
        const url=(e.dataTransfer?.getData('text/uri-list')||e.dataTransfer?.getData('text/plain')||'').split(/\r?\n/).find(v=>v&&!v.startsWith('#'))||'';
        if(!/^https?:\/\//i.test(url)&&!steamLink(url))return;
        e.preventDefault();e.stopImmediatePropagation();await addLink(url,selected);return;
      }
      e.preventDefault();e.stopImmediatePropagation();
      if(e.target.closest('#card-form')){
        if(files.length>1){ctx.toast('Use the dashboard drop area for a batch, or choose one file for this card.');return;}
        const source=e.target.closest('[data-file-link-drop]')?'url':document.querySelector('[name=media-source]:checked')?.value||'upload';
        if(await ctx.acceptFormFile(files[0],source))return;
      }
      if(ctx.ui().page!=='space'||document.querySelector('#dialog[open]')){ctx.toast('Drop files onto your dashboard or a collection.');return;}
      if(files.length===1&&/\.url$/i.test(files[0].name)&&files[0].size<=16384){const url=shortcutURL(await files[0].text());if(url){await addLink(url,selected,files[0].name.replace(/\.url$/i,''));return;}}
      dropTray(files,selected,e.target.closest('[data-card]')?.dataset.card);
    }catch(error){ctx.toast(error.message);}
  },true);
  document.addEventListener('keydown',e=>{if(e.key==='Escape'&&drop){dismissDrop();e.preventDefault();}});
  document.addEventListener('keydown',e=>{if(e.key==='Enter'&&e.target.id==='computer-app-query')e.preventDefault();});
  document.addEventListener('input',e=>{if(e.target.id==='computer-app-query')renderApps();});
  document.addEventListener('change',async e=>{
    if(!e.target.matches('[data-computer-startup]'))return;
    const checkbox=e.target;checkbox.disabled=true;
    try{await request('/settings',{startup:checkbox.checked});ctx.toast(checkbox.checked?'Companion will start with Windows.':'Windows startup is off.');}
    catch(error){checkbox.checked=!checkbox.checked;ctx.toast(error.message);}
    finally{if(checkbox.isConnected)checkbox.disabled=false;}
  });
  refreshCardIcons();
  return {show,open,click,submit,chooseLocal,filePreference,rememberFileChoice,appFields,mountApps};
}

export function computerVisual(card) {
  if(card.coverFileId)return `<div class="card-visual photo-art custom-card-cover"><img class="thumbnail" data-photo-id="${esc(card.coverFileId)}" alt="" loading="lazy">${card.launcher?`<span class="local-item-badge">${icon('monitor')}This computer</span>`:''}</div>`;
  if(!card.launcher)return '';
  return `<div class="card-visual computer-card-art"><span class="computer-card-symbol">${launcherIcon(card.launcher.icon)?`<img class="computer-native-icon" src="${esc(card.launcher.icon)}" alt="">`:card.launcher.kind==='steam'?`<img class="brand-logo" src="${esc(logoForURL('https://store.steampowered.com/'))}" alt="" loading="lazy"><span hidden>${icon('play')}</span>`:icon(card.launcher.kind==='folder'?'folder':card.launcher.kind==='file'?'file':'monitor')}</span><span class="local-item-badge">${icon(card.launcher.kind==='steam'?'play':'monitor')}${card.launcher.kind==='steam'?'Steam':card.launcher.kind==='app'?'App':'On this PC'}</span></div>`;
}
