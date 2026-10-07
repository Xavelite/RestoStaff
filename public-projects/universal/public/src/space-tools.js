import { personalCollections } from './collection-experience.js';
import { escapeHTML as esc, uid } from './model.js';
import { icon } from './icons.js';
import { smartRules, collectionEntries, createSmartCollection, keepDiscovery } from './smart-collections.js';
import { ROOT_TOPICS, CONTENT_KINDS, resolveTopic } from './topics.js';
import { SORTS } from './ranking.js';
import { prepareLinks, importLinks } from './link-import.js';

export function createSpaceTools(ctx) {
  const space=()=>ctx.state(), data=()=>ctx.data(), me=()=>data().activeUser;
  const btn=(action,label,extra='',cls='secondary')=>`<button type="button" class="${cls}" data-action="${action}" ${extra}>${label}</button>`;
  const options=(values,value)=>Object.entries(values).map(([id,label])=>`<option value="${esc(id)}" ${id===String(value)?'selected':''}>${esc(label)}</option>`).join('');
  const footer=id=>`<button class="secondary" data-action="close-dialog">Cancel</button><button class="primary" type="submit" form="${id}">Save changes</button>`;
  let importPreview=[];
  function smart(id='',preset=null) {
    const collection=space().collections.find(c=>c.id===id), rules=smartRules(preset||collection?.smart?.rules||{});
    ctx.modal(collection?`Updates for ${collection.name}`:'A collection that grows with you.', 'Matching cards belong to this live collection and are ready to use. Favorites keep a personal bookmark.', `<form id="smart-rules-form" data-id="${esc(id)}">
      ${!collection?`<label class="field">Collection name<input name="name" maxlength="80" required placeholder="New music, Useful tools, Inspiration…"></label>`:''}
      <label class="setting-check"><input name="enabled" type="checkbox" ${collection?.smart?.paused||collection?.smart?.enabled===false?'':'checked'}>Automatic updates</label>
      <div class="field-row"><label class="field">Find cards about<input name="query" value="${esc(rules.query)}" placeholder="e.g. social media or relaxing music"></label><label class="field">Look in<select name="scope">${options({everyone:'Everyone · public cards',friends:'Friends',mine:'My own cards'},rules.scope)}</select></label></div>
      <div class="field-row"><label class="field">Topic<select name="topic"><option value="all">All topics</option>${ROOT_TOPICS.map(t=>`<optgroup label="${esc(t.label)}">${options(Object.fromEntries([[t.id,'All '+t.label.toLowerCase()],...t.children.map(c=>[c.id,c.label])]),resolveTopic(rules.topic)?.id||rules.topic)}</optgroup>`).join('')}${rules.topic!=='all'&&!resolveTopic(rules.topic)?`<option selected value="${esc(rules.topic)}">${esc(rules.topic)}</option>`:''}</select></label><label class="field">Looking for<select name="kind">${options({all:'Anything',...CONTENT_KINDS},rules.kind)}</select></label></div>
      <div class="field-row"><label class="field">Format<select name="type">${options({all:'All content',link:'Websites',video:'Videos',audio:'Music & audio',file:'Files & pictures'},rules.type)}</select></label><label class="field">Order cards by<select name="sort">${options(SORTS,rules.sort)}</select></label></div>
      <details class="smart-advanced" ${rules.artist||rules.genre||rules.decade||rules.decades.length?'open':''}><summary>Genre, decade & more</summary><div class="field-row"><label class="field">Artist or group<input name="artist" value="${esc(rules.artist)}" placeholder="Any artist"></label><label class="field">Genre<input name="genre" value="${esc(rules.genre)}" placeholder="Rock, Horror, Tower defense"></label></div><label class="field">Decade<select name="decade">${options({'':'Any decade','1980s,1990s':'80s & 90s',...Object.fromEntries(['1950s','1960s','1970s','1980s','1990s','2000s','2010s','2020s'].map(v=>[v,v]))},rules.decades.length?rules.decades.join(','):rules.decade)}</select></label><div class="field-row"><label class="field">Maximum live cards<select name="limit">${options({6:'6 cards',8:'8 cards',12:'12 cards',24:'24 cards',48:'48 cards'},rules.limit)}</select></label></div><label class="setting-check"><input name="followingOnly" type="checkbox" ${rules.followingOnly?'checked':''}>Only people or collections I follow</label></details>
      <p class="form-hint">Turn updates off to hold the current selection. Dynamic content respects its original audience; your own private cards stay private.</p>${collection?.smart?.hidden?.length?btn('smart-reset-hidden',`Restore ${collection.smart.hidden.length} hidden cards`,`data-id="${esc(id)}"`):''}<p id="form-error" role="alert"></p></form>`,footer('smart-rules-form'));
  }
  function organize() {
    ctx.modal('A little order. Your way.', 'Keep a simple list, or use folders where they help. A folder only organizes your sidebar.', `<div class="collection-organizer"><label class="setting-check"><input type="checkbox" id="organizer-folders" ${space().settings.groupCollections?'checked':''}>Show folders in my sidebar</label><div class="organizer-rows">${personalCollections(space()).map((c,i)=>`<div class="organizer-row"><span class="tint-${c.color} organizer-symbol">${icon(c.smart?.enabled?'spark':c.icon)}</span><strong>${esc(c.name)}</strong><select data-organizer-folder="${esc(c.id)}" aria-label="Folder for ${esc(c.name)}">${options({'':'No folder',...Object.fromEntries((space().folders||[]).map(f=>[f.id,f.name]))},c.folderId||'')}</select>${btn('organizer-order',icon('chevron'),`data-id="${esc(c.id)}" data-direction="-1" aria-label="Move ${esc(c.name)} up" ${i===0?'disabled':''}`,'icon-btn move-up')}${btn('organizer-order',icon('chevron'),`data-id="${esc(c.id)}" data-direction="1" aria-label="Move ${esc(c.name)} down" ${i===personalCollections(space()).length-1?'disabled':''}`,'icon-btn move-down')}</div>`).join('')}</div><form id="organizer-folder-form" class="inline-folder-form"><input name="name" required maxlength="60" aria-label="New folder name" placeholder="New folder name…"><button type="submit" class="secondary">${icon('plus')}Create folder</button><p id="form-error" role="alert"></p></form><div class="organizer-folders">${(space().folders||[]).map(f=>`<span>${esc(f.name)}${btn('organizer-remove-folder',icon('close'),`data-id="${esc(f.id)}" aria-label="Remove folder ${esc(f.name)}, keep collections"`,'icon-btn')}</span>`).join('')}</div></div>`,btn('close-dialog','Done','','primary'));
  }
  function connections() {
    ctx.modal('Bring your internet together.', 'Start with what you already love. Keep ownership of how it is organized.', `<div class="connection-intro">${icon('link')}<div><h3>Your links, in one place</h3><p>Paste a list of links or import a browser bookmarks file. Preview first; new cards start private.</p>${btn('import-links','Import links & bookmarks','','primary')}</div></div><div class="connection-roadmap"><h3>Account connections · future setup</h3><p>This demo is local. It does not connect to your accounts or sync in the background.</p><article><strong>YouTube playlists</strong><p>Selected playlists can be brought in through Google’s API. Private lists require sign-in, consent, and an API project; quotas apply.</p><a href="https://developers.google.com/youtube/v3/docs/playlists" target="_blank" rel="noopener noreferrer">How YouTube access works ↗</a></article><article><strong>Google Drive & Gmail</strong><p>Start with selected file links. Reading private files or email needs explicit account access; some Gmail scopes require verification. An email inbox should remain a separate, private connection.</p><a href="https://developers.google.com/workspace/gmail/api/auth/scopes" target="_blank" rel="noopener noreferrer">Google’s permission requirements ↗</a></article></div>`);
  }
  function importDialog() {
    importPreview=[];
    ctx.modal('Bring your favorites along.', 'Links become cards with their own logos. Existing links are skipped.', `<form id="links-preview-form"><label class="field">One link per line<textarea name="links" rows="5" placeholder="https://…"></textarea></label><label class="field">Or choose a browser bookmarks export<input type="file" name="bookmarks" accept=".html,.htm" aria-label="Browser bookmarks HTML file"><small>HTML bookmarks export, up to 2 MB. No account access needed.</small></label><button class="secondary" type="submit">Preview import</button><p id="form-error" role="alert"></p></form><div id="links-preview"></div>`,btn('close-dialog','Close'));
  }
  async function click(action,el) {
    const id=el.dataset.id, collection=space().collections.find(c=>c.id===id);
    if(action==='organize-collections'){organize();return true;}
    if(action==='connections'){connections();return true;}
    if(action==='import-links'){importDialog();return true;}
    if(action==='smart-settings'||action==='new-smart'){smart(id);return true;}
    if(action==='smart-keep'){keepDiscovery(data(),me(),id,el.dataset.key);await ctx.persist();ctx.render();ctx.toast('Saved permanently in this collection.');return true;}
    if(action==='smart-hide'){collection.smart.hidden=[...new Set([...(collection.smart.hidden||[]),el.dataset.key])];await ctx.persist();ctx.render();ctx.toast('Hidden from this collection.');return true;}
    if(action==='smart-reset-hidden'){collection.smart.hidden=[];await ctx.persist();ctx.render();smart(id);ctx.toast('Hidden cards restored.');return true;}
    if(action==='smart-pause'){
      if(!collection.smart.paused)collection.smart.snapshot=collectionEntries(data(),me(),collection).filter(e=>e.dynamic).map(e=>e.key);
      collection.smart.paused=!collection.smart.paused;await ctx.persist();ctx.render();return true;
    }
    if(action==='organizer-order'){
      const visible=personalCollections(space()),from=visible.findIndex(c=>c.id===id),to=from+Number(el.dataset.direction);
      if(from>=0&&to>=0&&to<visible.length){const a=space().collections.indexOf(visible[from]),b=space().collections.indexOf(visible[to]);[space().collections[a],space().collections[b]]=[space().collections[b],space().collections[a]];await ctx.persist();ctx.render();organize();}return true;
    }
    if(action==='organizer-remove-folder'){space().folders=space().folders.filter(f=>f.id!==id);space().collections.forEach(c=>{if(c.folderId===id)delete c.folderId;});await ctx.persist();ctx.render();organize();return true;}
    return false;
  }
  async function change(el) {
    if(el.id==='organizer-folders')space().settings.groupCollections=el.checked;
    else if(el.dataset.organizerFolder)space().collections.find(c=>c.id===el.dataset.organizerFolder).folderId=el.value;
    else return;
    await ctx.persist();ctx.render();
  }
  async function submit(form) {
    if(form.id==='smart-rules-form'){
      const f=form.elements,selected=f.decade.value;
      const rules=smartRules(Object.fromEntries(['query','scope','type','sort','artist','genre','topic','kind','limit'].map(k=>[k,f[k].value])));
      rules.followingOnly=f.followingOnly.checked;rules.decade=selected.includes(',')?'':selected;rules.decades=selected.includes(',')?selected.split(','):[];
      let c=space().collections.find(c=>c.id===form.dataset.id);
      const creating=!c,wasPaused=c?.smart?.paused,previousSnapshot=c?.smart?.snapshot;
      if(!c)c=createSmartCollection(space(),f.name.value,rules);
      const changed=JSON.stringify(c.smart?.rules)!==JSON.stringify(rules),fresh=creating||!c.smart?.enabled;
      c.smart={...c.smart,enabled:true,rules,paused:false,seen:c.smart?.seen||[],newTracking:true,hidden:c.smart?.hidden||[]};
      const entries=collectionEntries(data(),me(),c).filter(e=>e.dynamic);
      if(changed||fresh)c.smart.seen=entries.map(e=>e.key);
      if(!f.enabled.checked){c.smart.snapshot=wasPaused&&!changed&&!fresh?previousSnapshot:entries.map(e=>e.key);c.smart.paused=true;}
      await ctx.persist();ctx.closeModal();ctx.ui().page='space';ctx.ui().collection=c.id;ctx.ui().query='';ctx.ui().filter='all';ctx.render();ctx.toast('Your collection is ready.');return true;
    }
    if(form.id==='organizer-folder-form'){
      const name=form.elements.name.value.trim();if(!name)throw Error('Give the folder a name.');
      space().folders||=[];space().folders.push({id:uid(),name,collapsed:false});space().settings.groupCollections=true;await ctx.persist();ctx.render();organize();return true;
    }
    if(form.id==='links-preview-form'){
      const file=form.elements.bookmarks.files[0];let items=[];
      if(file){if(file.size>2*1024*1024)throw Error('Choose a bookmarks file smaller than 2 MB.');const doc=new DOMParser().parseFromString(await file.text(),'text/html');items=[...doc.querySelectorAll('a[href]')].map(a=>({url:a.getAttribute('href'),title:a.textContent}));}
      items.push(...form.elements.links.value.split(/\r?\n/).map(url=>url.trim()).filter(Boolean).map(url=>({url})));
      const result=prepareLinks(items,space(),me());importPreview=result.links;
      document.querySelector('#links-preview').innerHTML=`<div class="import-result"><strong>${result.links.length} new links</strong><p>${result.skipped} duplicates or invalid links skipped.${result.truncated?' Showing the first 500 entries.':''}</p><div class="import-preview-list">${result.links.map((r,i)=>`<label><input type="checkbox" checked data-import-index="${i}"><span><strong>${esc(r.title)}</strong><small>${esc(r.url)}</small></span></label>`).join('')}</div>${result.links.length?`<form id="links-import-form"><label class="field">Save in<select name="collection">${options(Object.fromEntries(personalCollections(space()).map(c=>[c.id,c.name])),space().collections[0]?.id)}</select></label><button type="submit" class="primary">Import selected links</button><p id="form-error" role="alert"></p></form>`:''}</div>`;return true;
    }
    if(form.id==='links-import-form'){
      const chosen=[...document.querySelectorAll('[data-import-index]:checked')].map(el=>importPreview[Number(el.dataset.importIndex)]);
      if(!chosen.length)throw Error('Select at least one link.');
      const fresh=prepareLinks(chosen,space(),me()).links, collection=form.elements.collection.value;
      const count=importLinks(space(),collection,fresh);await ctx.persist();ctx.closeModal();ctx.ui().page='space';ctx.ui().collection=collection;ctx.ui().query='';ctx.ui().filter='all';ctx.render();ctx.toast(`${count} links added privately.`);return true;
    }
    return false;
  }
  return {click,submit,change,smart,organize};
}
