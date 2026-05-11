/*
 * restogogo v2 app shell
 * Shared state, login/session, routing, persistence, notifications and helpers.
 * Page-specific rendering and behavior live in the v2 page modules.
 */

const $ = id => document.getElementById(id);
const days = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'];
const shifts = ['Lunch','Evening'];
const defaultPositions = ["Maitre d'hotel",'Chef de Rang','Barman','Extra (flexi / student)'];
const defaultPositionPalette = ['#14b8a6','#f0b84a','#8b5cf6','#60a5fa','#64748b','#22c7d7','#c084fc'];
const defaultZonePalette = ['#b0183b','#2f80ed','#8b5cf6','#f59e0b','#0891b2','#64748b','#db2777','#8a7b82'];
const defaultZoneRules = [
  ['OFF','Off','Off','Off'],
  ['AC','Accueil','11:00-15:00','17:00-00:00'],
  ['DOM 1','Chef de Rang','11:00-15:00','17:50-23:00'],
  ['DOM 2','Chef de Rang','12:00-16:00','18:50-00:00'],
  ['ILOT 1','Chef de Rang','11:00-15:00','17:50-23:00'],
  ['ILOT 2','Chef de Rang','12:00-16:00','18:50-00:00'],
  ['BOUIL 1','Chef de Rang','11:00-15:00','17:50-23:00'],
  ['SCH 1','Chef de Rang','11:00-15:00','17:50-23:00'],
  ['SCH 2','Chef de Rang','12:00-16:00','18:50-00:00'],
  ['PASS 1','Runner','12:00-16:00','17:50-23:00'],
  ['PASS B 1','Runner','12:00-16:00','17:50-23:00'],
  ['BAR 1','Barman','11:00-15:00','17:00-00:00'],
  ['BAR ET','Barman','12:00-16:00','18:00-00:00']
].map(([zone,role,lunch,evening]) => ({zone,role,lunch,evening}));
const defaultEmployeeRows = [
  "Dimitri|Maitre d'hotel|18",'Iymane|Barman|15','Anxhelo|Barman|15','Arben|Chef de Rang|16',
  'Metin|Chef de Rang|16','Khadija|Chef de Rang|16','Laundry|Chef de Rang|16','Joel|Chef de Rang|16',
  'Pedro|Chef de Rang|16','Radhi|Chef de Rang|16','Hakim|Chef de Rang|16','Carl|Chef de Rang|16',
  'Candy|Chef de Rang|16','Eva|Chef de Rang|16','Lea|Extra (flexi / student)|13.5','Anais|Extra (flexi / student)|13.5',
  'Chloe|Extra (flexi / student)|13.5','Yassin|Extra (flexi / student)|13.5','Sam|Extra (flexi / student)|13.5',
  'Loic|Extra (flexi / student)|13.5','Frantzchini|Extra (flexi / student)|13.5','Sophie|Extra (flexi / student)|13.5',
  'Laura|Extra (flexi / student)|13.5','Jetmir|Extra (flexi / student)|13.5'
];

let data;
let session = {role:'employee', employeeId:null};
let positions = [];
let zoneRules = [];
let notifOpen = false;
let notifRead = {};
let storageReadOnly = false;
let workspaceCatalog = [];

const PROTOTYPE_PIN = '0000';
const WORKSPACE_ROUTE_ALIASES = {bouillon:'bouillon-bruxelles', demo:'demo-restaurant'};

function id(){return (crypto.randomUUID ? crypto.randomUUID() : String(Date.now()+Math.random())).replaceAll('-','').slice(0,12);}
function esc(value=''){return String(value).replace(/[&<>"]/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[ch]));}
function clone(value){return typeof structuredClone==='function' ? structuredClone(value) : JSON.parse(JSON.stringify(value));}
function cleanPositionName(p=''){return String(p).replace(/^\s*[A-Z]\.\s*/, '').trim();}
function employeeInitials(name=''){return String(name||'').trim().split(/\s+/).filter(Boolean).slice(0,2).map(part=>part.charAt(0).toUpperCase()).join('') || '?';}
function sanitizePin(value=''){return String(value||'').replace(/\D/g,'').slice(0,4);}
function normalizeHexColor(value){const v=String(value||'').trim(); if(/^#[0-9a-f]{6}$/i.test(v))return v; if(/^#[0-9a-f]{3}$/i.test(v))return '#'+v.slice(1).split('').map(ch=>ch+ch).join(''); return '';}
function darkenHex(hex,amount=.18){hex=normalizeHexColor(hex)||'#9b1734'; const n=parseInt(hex.slice(1),16); const rgb=[(n>>16)&255,(n>>8)&255,n&255].map(x=>Math.max(0,Math.min(255,Math.round(x*(1-amount))))); return '#'+rgb.map(x=>x.toString(16).padStart(2,'0')).join('');}
function money(n){return '€'+Number(n||0).toFixed(2);}
function fmtPeople(n){return String(Number(n)||0)+'p';}
function fmtHours(n){const value=Number(n)||0; const sign=value<0?'-':''; const totalMinutes=Math.round(Math.abs(value)*60); const h=Math.floor(totalMinutes/60); const m=totalMinutes%60; return m?`${sign}${h}h${String(m).padStart(2,'0')}`:`${sign}${h}h`;}
function localISO(d){const x=new Date(d); x.setHours(12,0,0,0); return `${x.getFullYear()}-${String(x.getMonth()+1).padStart(2,'0')}-${String(x.getDate()).padStart(2,'0')}`;}
function parseISO(iso){const [y,m,d]=String(iso||localISO(new Date())).split('-').map(Number); const x=new Date(y,(m||1)-1,d||1); x.setHours(12,0,0,0); return x;}
function monday(d=new Date()){const x=(d instanceof Date)?new Date(d):parseISO(d); x.setHours(12,0,0,0); const day=(x.getDay()+6)%7; x.setDate(x.getDate()-day); return localISO(x);}
function addDays(iso,n){const d=parseISO(iso); d.setDate(d.getDate()+n); return localISO(d);}
function todayISO(){return localISO(new Date());}
function shortDisplayDate(iso){const d=parseISO(iso); return d.toLocaleDateString('en-GB',{day:'2-digit',month:'2-digit'});}
function shortDateLabel(iso){return shortDisplayDate(iso);}
function dateForDay(dayName){return addDays(data.weekStart, days.indexOf(dayName));}
function weekDisplayRange(){return `${shortDisplayDate(data.weekStart)} – ${shortDisplayDate(addDays(data.weekStart,6))}`;}
function weekRangeLabel(){return `${shortDateLabel(data.weekStart)} – ${shortDateLabel(addDays(data.weekStart,6))}`;}
function displayTimeRange(range=''){return String(range||'').replace(/\s*-\s*/,'–');}
function normalizeTimeRangeInput(value){const raw=String(value||'').trim().replace(/[–—−]/g,'-').replace(/\s*-\s*/g,'-'); return /^(?:[01]?\d|2[0-3]):[0-5]\d-(?:[01]?\d|2[0-3]):[0-5]\d$/.test(raw)?raw:'';}
function workspaceId(){return window.DataAdapter.getWorkspaceId ? window.DataAdapter.getWorkspaceId() : 'local-restaurant';}
function slugifyWorkspace(value){if(window.DataAdapter.sanitizeWorkspaceId)return window.DataAdapter.sanitizeWorkspaceId(value); return String(value||'restaurant').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'').slice(0,64)||'restaurant';}
function workspaceCatalogKey(){return 'restogogo_workspace_catalog';}
function readLocalWorkspaceCatalog(){return window.DataAdapter.getJSON ? window.DataAdapter.getJSON(workspaceCatalogKey(),[]) : [];}
function saveLocalWorkspaceCatalog(list){if(window.DataAdapter.setJSON)window.DataAdapter.setJSON(workspaceCatalogKey(), list||[]);}
function registerWorkspace(meta){const workspace=slugifyWorkspace(meta?.id||meta?.restaurant?.name||meta?.name||'restaurant'); const list=readLocalWorkspaceCatalog().filter(w=>w.id!==workspace); list.unshift({id:workspace,name:meta.name||meta?.restaurant?.name||workspace,restaurant:meta.restaurant||{},status:meta.status||'Active',updated_at:new Date().toISOString()}); saveLocalWorkspaceCatalog(list.slice(0,24));}
function restaurantName(){return (data?.restaurant?.name||'Bouillon Bruxelles').trim() || 'Bouillon Bruxelles';}
function restaurantOwnerName(){return (data?.restaurant?.ownerName||'Manager').trim() || 'Manager';}
function restaurantAccent(){return normalizeHexColor(data?.restaurant?.accentColor)||'#9b1734';}
function defaultPinForIndex(){return PROTOTYPE_PIN;}


function defaultEmployees(){return defaultEmployeeRows.map((row,i)=>{const [name,position,rate]=row.split('|'); return {id:'e'+i,name,position,rate:+rate,active:true,pin:defaultPinForIndex(i)};});}
function neutralZoneRules(){return [
  {zone:'Accueil',role:'Manager',lunch:'11:00-15:00',evening:'17:00-23:00'},
  {zone:'Salle',role:'Chef de Rang',lunch:'11:30-15:30',evening:'18:00-23:00'},
  {zone:'Bar',role:'Barman',lunch:'11:00-15:00',evening:'17:30-00:00'},
  {zone:'Runner',role:'Runner',lunch:'12:00-16:00',evening:'18:30-23:30'}
];}
function starterRestaurantData(kind='blank'){
  const isDemo=kind==='demo';
  return {version:16,restaurant:{name:isDemo?'Demo Restaurant':'',ownerName:isDemo?'Demo Manager':'',city:isDemo?'Brussels':'',logoUrl:'',accentColor:isDemo?'#7c3aed':'#9b1734',theme:'modern-dark'},weekStart:monday(),status:'Draft',employees:isDemo?[{id:'demo1',name:'Alex',position:'Manager',rate:19,active:true,pin:PROTOTYPE_PIN},{id:'demo2',name:'Lina',position:'Chef de Rang',rate:16,active:true,pin:PROTOTYPE_PIN},{id:'demo3',name:'Noah',position:'Barman',rate:15,active:true,pin:PROTOTYPE_PIN},{id:'demo4',name:'Sam',position:'Extra (flexi / student)',rate:13.5,active:true,pin:PROTOTYPE_PIN}]:[],positions:['Manager','Chef de Rang','Barman','Runner','Extra (flexi / student)'],zoneRules:neutralZoneRules(),positionColors:{},zoneColors:{},availability:{},planning:{},assignments:{},assignmentTimes:{},submitted:{},notes:{},swaps:[],history:{},actualEntries:{},notifications:[]};
}
function newData(){const base=starterRestaurantData('bouillon'); base.restaurant={name:'Bouillon Bruxelles',ownerName:'Xavier',city:'Brussels',logoUrl:'',accentColor:'#9b1734',theme:'modern-dark'}; base.employees=defaultEmployees(); base.positions=[...defaultPositions]; base.zoneRules=clone(defaultZoneRules); ensure(base); return base;}
function defaultDataForWorkspace(idValue){const wid=slugifyWorkspace(idValue||workspaceId()); if(wid==='demo-restaurant'){const demo=starterRestaurantData('demo'); ensure(demo); return demo;} if(wid==='bouillon-bruxelles'||wid==='main')return newData(); const dataObj=starterRestaurantData('blank'); dataObj.restaurant.name=wid.split('-').map(w=>w.charAt(0).toUpperCase()+w.slice(1)).join(' '); dataObj.employees=[{id:'starter1',name:'Manager',position:'Manager',rate:18,active:true,pin:PROTOTYPE_PIN}]; ensure(dataObj); return dataObj;}

function ensure(target=data){
  const o=target;
  o.restaurant=(o.restaurant&&typeof o.restaurant==='object')?o.restaurant:{};
  o.restaurant.name=String(o.restaurant.name||'Bouillon Bruxelles').trim()||'Bouillon Bruxelles';
  o.restaurant.ownerName=String(o.restaurant.ownerName||'Manager').trim()||'Manager';
  o.restaurant.city=String(o.restaurant.city||'').trim();
  o.restaurant.logoUrl=String(o.restaurant.logoUrl||'').trim();
  o.restaurant.accentColor=normalizeHexColor(o.restaurant.accentColor)||'#9b1734';
  o.restaurant.theme='modern-dark';
  if(!Array.isArray(o.employees)||!o.employees.length)o.employees=defaultEmployees();
  o.positions=(Array.isArray(o.positions)&&o.positions.length?o.positions:[...defaultPositions]).map(cleanPositionName).filter(Boolean);
  o.positions=o.positions.filter((p,i,a)=>a.indexOf(p)===i);
  positions=o.positions;
  o.employees=o.employees.map((e,i)=>({...e,id:e.id||('e'+i),name:e.name||('Employee '+(i+1)),position:cleanPositionName(e.position||positions[0]||defaultPositions[0]),rate:Number(e.rate??13.5),active:e.active===undefined?true:!!e.active,managerAccess:!!(e.managerAccess||e.isManager||e.manager),pin:PROTOTYPE_PIN}));
  if(!o.employees.some(e=>e.active))o.employees.forEach(e=>e.active=true);
  o.zoneRules=Array.isArray(o.zoneRules)&&o.zoneRules.length?o.zoneRules:clone(defaultZoneRules);
  o.zoneRules=o.zoneRules.map(z=>({...z,zone:String(z.zone||''),role:cleanPositionName(z.role||''),lunch:String(z.lunch||''),evening:String(z.evening||'')}));
  zoneRules=o.zoneRules;
  o.positionColors=o.positionColors||{};
  o.zoneColors=o.zoneColors||{};
  positions.forEach((p,i)=>{if(!normalizeHexColor(o.positionColors[p]))o.positionColors[p]=defaultPositionPalette[i%defaultPositionPalette.length];});
  [...new Set(zoneRules.map(z=>z.zone).filter(Boolean))].forEach((z,i)=>{if(!normalizeHexColor(o.zoneColors[z]))o.zoneColors[z]=defaultZonePalette[i%defaultZonePalette.length];});
  o.weekStart=monday(o.weekStart||new Date());
  o.status=o.status==='Published'?'Published':'Draft';
  o.availability=o.availability||{}; o.planning=o.planning||{}; o.assignments=o.assignments||{}; o.assignmentTimes=o.assignmentTimes||{}; o.submitted=o.submitted||{}; o.notes=o.notes||{}; o.history=o.history||{}; o.actualEntries=o.actualEntries||{}; o.swaps=Array.isArray(o.swaps)?o.swaps:[]; o.notifications=Array.isArray(o.notifications)?o.notifications:[];
  days.forEach(d=>{o.notes[d]=o.notes[d]||{}; shifts.forEach(s=>{o.notes[d][s]=o.notes[d][s]||'';});});
  o.employees.forEach(e=>{
    o.availability[e.id]=o.availability[e.id]||{}; o.planning[e.id]=o.planning[e.id]||{}; o.assignments[e.id]=o.assignments[e.id]||{}; o.assignmentTimes[e.id]=o.assignmentTimes[e.id]||{}; o.actualEntries[e.id]=o.actualEntries[e.id]||{};
    days.forEach(d=>{o.availability[e.id][d]=o.availability[e.id][d]||{}; o.planning[e.id][d]=o.planning[e.id][d]||{}; o.assignments[e.id][d]=o.assignments[e.id][d]||{}; o.assignmentTimes[e.id][d]=o.assignmentTimes[e.id][d]||{}; o.actualEntries[e.id][d]=o.actualEntries[e.id][d]||{}; shifts.forEach(s=>{o.actualEntries[e.id][d][s]=o.actualEntries[e.id][d][s]||{}; if(o.availability[e.id][d][s]===undefined)o.availability[e.id][d][s]=false; if(o.planning[e.id][d][s]===undefined)o.planning[e.id][d][s]=false; o.planning[e.id][d][s]=!!o.planning[e.id][d][s]; o.assignments[e.id][d][s]=String(o.assignments[e.id][d][s]||''); o.assignmentTimes[e.id][d][s]=String(o.assignmentTimes[e.id][d][s]||'').trim();});});
  });
  return o;
}

function load(){
  storageReadOnly=false;
  const loaded=window.DataAdapter.readPlanner();
  const err=window.DataAdapter.getLastError&&window.DataAdapter.getLastError();
  const readStatus=window.DataAdapter.getLastReadStatus?window.DataAdapter.getLastReadStatus():(err?'error':'ok');
  data=(!loaded && err && window.DataAdapter.supabaseOnly) ? defaultDataForWorkspace(workspaceId()) : (loaded||defaultDataForWorkspace(workspaceId()));
  if(!loaded && err && window.DataAdapter.supabaseOnly) storageReadOnly=true;
  ensure(data);
  session=window.DataAdapter.readSession(session)||session;
  if(!session.employeeId||!emp(session.employeeId))session.employeeId=activeEmployees()[0]?.id||data.employees[0]?.id||null;
  applyRestaurantBrand();
  if((readStatus==='seed-needed'||readStatus==='empty')&&!storageReadOnly)save();
}
function save(){window.DataAdapter.saveSession(session); if(storageReadOnly)return false; const ok=window.DataAdapter.savePlanner(data); registerWorkspace({id:workspaceId(),restaurant:data.restaurant,name:restaurantName(),status:workspaceId()==='bouillon-bruxelles'?'Pilot':'Active'}); return ok!==false;}

function emp(employeeId){return data?.employees?.find(e=>e.id===employeeId);}
function activeEmployees(){return sortEmployees((data?.employees||[]).filter(e=>e.active));}
function positionIndex(position){const clean=cleanPositionName(position); const index=positions.findIndex(p=>cleanPositionName(p)===clean); return index<0?999:index;}
function sortEmployees(list){return [...list].sort((a,b)=>positionIndex(a.position)-positionIndex(b.position)||String(a.name).localeCompare(String(b.name)));}
function suggestZone(e,shift){if(!e)return ''; const p=String(e.position||''); if(p.includes('Maitre')||p.includes('Manager'))return 'AC'; if(p.includes('Barman'))return shift==='Lunch'?'BAR 1':'BAR ET'; if(p.includes('Extra'))return shift==='Lunch'?'PASS 1':'PASS B 1'; return shift==='Lunch'?'DOM 1':'ILOT 1';}
function timeRangeFor(e,d,s){const custom=data.assignmentTimes?.[e.id]?.[d]?.[s]; if(custom)return custom; const zone=data.assignments?.[e.id]?.[d]?.[s]||suggestZone(e,s); const rule=zoneRules.find(r=>r.zone===zone); return rule?(s==='Lunch'?rule.lunch:rule.evening):(s==='Lunch'?'11:00-15:00':'17:50-23:00');}
function hoursFromRange(range){if(!range||range==='-'||!String(range).includes('-'))return 0; const [a,b]=String(range).split('-').map(x=>x.trim()); const toMin=t=>{const m=t.match(/(\d{1,2}):(\d{2})/); return m?(+m[1])*60+(+m[2]):0;}; let start=toMin(a), end=toMin(b); if(!start&&!end)return 0; if(end<start)end+=1440; return Math.max(0,(end-start)/60);}
function slotHours(e,d,s){return data.availability?.[e.id]?.[d]?.[s]?hoursFromRange(timeRangeFor(e,d,s)):0;}
function plannedSlotHours(e,d,s){return data.planning?.[e.id]?.[d]?.[s]?hoursFromRange(timeRangeFor(e,d,s)):0;}
function isPlanned(employeeId,day,shift){return !!data.planning?.[employeeId]?.[day]?.[shift];}
function employeePlannedWeekTotal(e){return days.reduce((sum,d)=>sum+shifts.reduce((slotSum,s)=>slotSum+plannedSlotHours(e,d,s),0),0);}
function availabilityOverlayState(employeeId,day,shift){const raw=data.availability?.[employeeId]?.[day]?.[shift]; if(raw===true||raw==='available'||raw?.state==='available')return 'available'; if(raw==='partial'||raw?.state==='partial')return 'partial'; if(raw===false||raw==='unavailable'||raw?.state==='unavailable')return data.submitted?.[employeeId]?'unavailable':'unknown'; return data.submitted?.[employeeId]?'unavailable':'unknown';}
function swapFor(employeeId,day,shift){return (data.swaps||[]).find(sw=>sw.from===employeeId&&sw.day===day&&sw.shift===shift&&sw.status!=='Rejected')||null;}

function colorForPosition(p){return data.positionColors?.[cleanPositionName(p)]||defaultPositionPalette[Math.max(0,positionIndex(p))%defaultPositionPalette.length];}
function colorForZone(z){return data.zoneColors?.[z]||defaultZonePalette[Math.abs(String(z||'').split('').reduce((a,c)=>a+c.charCodeAt(0),0))%defaultZonePalette.length];}
function hexToRgb(hex){let h=String(hex||'#999').replace('#',''); if(h.length===3)h=h.split('').map(x=>x+x).join(''); const n=parseInt(h,16); return {r:(n>>16)&255,g:(n>>8)&255,b:n&255};}
function rgba(hex,a){const c=hexToRgb(hex); return `rgba(${c.r},${c.g},${c.b},${a})`;}
function positionStyle(p){const c=colorForPosition(p); return `--pos-color:${c};--pos-bg:${c};--pos-border:${rgba(c,.72)};`;}
function zoneStyle(z){return `--zone-accent:${colorForZone(z)};`;}
function styleAttr(css){return css?` style="${css}"`:'';}
function positionClass(position=''){const p=String(position).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,''); if(p.includes('maitre')||p.includes('manager'))return 'pos-maitre'; if(p.includes('chef'))return 'pos-chef'; if(p.includes('barman')||p.includes('barmaid'))return 'pos-barman'; if(p.includes('extra')||p.includes('student')||p.includes('flexi'))return 'pos-extra'; return 'pos-other';}
function zoneClass(zone=''){const z=String(zone).toLowerCase(); if(z.includes('ac')||z.includes('accueil'))return 'zone-accent-ac'; if(z.includes('dom'))return 'zone-accent-dom'; if(z.includes('ilot'))return 'zone-accent-ilot'; if(z.includes('bar'))return 'zone-accent-bar'; if(z.includes('pass'))return 'zone-accent-pass'; if(z.includes('sch'))return 'zone-accent-sch'; if(z.includes('bouil'))return 'zone-accent-bouil'; return 'zone-accent-other';}

function applyAppTheme(){document.body?.classList.add('theme-modern');}
function applyRestaurantBrand(){
  if(!data)return;
  const accent=restaurantAccent();
  document.documentElement.style.setProperty('--rst-ui-accent',accent);
  document.documentElement.style.setProperty('--rst-ui-accent-dark',darkenHex(accent,.22));
  applyAppTheme();
  const explicitLogo=String(data.restaurant?.logoUrl||'').trim();
  const useDefaultRestaurantLogo=!explicitLogo && workspaceId()==='bouillon-bruxelles';
  const logo=explicitLogo || (useDefaultRestaurantLogo?'logo.png':'');
  const initial=(restaurantName().charAt(0)||'R').toUpperCase();
  if($('brandLogo')){brandLogo.style.display=logo?'block':'none'; if(logo){brandLogo.src=logo;brandLogo.alt=restaurantName();} brandLogo.closest('.restaurant-brand-mark')?.classList.toggle('has-logo',!!logo);}
  if($('brandRestaurantInitial')){brandRestaurantInitial.style.display=logo?'none':'grid'; brandRestaurantInitial.textContent=initial; brandRestaurantInitial.style.background=accent;}
  if($('brandEyebrow'))brandEyebrow.textContent='restogogo';
  if($('loginRestaurantName'))loginRestaurantName.textContent='Welcome back';
  if($('loginWorkspaceBadge'))loginWorkspaceBadge.textContent='Sign in to continue to your workspace.';
}

function notificationKey(n){return `${n.id||''}-${n.title||''}`;}
function addNotification(idValue,tone,title,body,meta={}){data.notifications=data.notifications||[]; const existing=data.notifications.find(n=>n.id===idValue); const next={id:idValue,tone:tone||'yellow',title,body,meta,createdAt:new Date().toISOString()}; if(existing)Object.assign(existing,next); else data.notifications.unshift(next); data.notifications=data.notifications.slice(0,50);}
function notificationAudience(n){if(session.role==='owner')return true; if(!n.meta)return true; if(n.meta.kind==='employee')return n.meta.id===session.employeeId; if(n.meta.kind==='submission'||n.meta.kind==='status')return true; return true;}
function derivedNotifications(){const base=(data.notifications||[]).filter(notificationAudience); const conflicts=(window.OwnerPlanning?.conflicts&&session.role==='owner')?window.OwnerPlanning.conflicts():[]; if(conflicts.length)base.unshift({id:'derived-conflicts-'+data.weekStart,tone:'red',title:`${conflicts.length} conflict${conflicts.length===1?'':'s'} found`,body:'Some shifts are outside availability.',meta:{kind:'conflict'}}); return base.slice(0,20);}
function renderNotifications(){
  const list=derivedNotifications();
  const unread=list.filter(n=>!notifRead[notificationKey(n)]);
  const red=unread.filter(n=>n.tone==='red').length;
  const yellow=unread.length-red;
  if($('notifBadgeRed')){notifBadgeRed.textContent=red||''; notifBadgeRed.classList.toggle('show',red>0);}
  if($('notifBadgeYellow')){notifBadgeYellow.textContent=yellow||''; notifBadgeYellow.classList.toggle('show',yellow>0);}
  const panel=$('notifPanel'); if(!panel)return;
  panel.classList.toggle('open',notifOpen);
  if(!notifOpen){panel.innerHTML=''; return;}
  panel.innerHTML=`<div class="notif-head"><strong>Notifications</strong><button type="button" data-notification-action="mark-all-read">Mark read</button></div>${list.length?list.map(notifItemHtml).join(''):'<div class="notif-empty">No notifications yet.</div>'}`;
}
function notifItemHtml(n){const key=notificationKey(n); const isUnread=!notifRead[key]; return `<button type="button" class="notif-item ${n.tone==='red'?'red':'yellow'} ${isUnread?'unread':''}" data-notification-key="${esc(key)}"><span class="notif-dot"></span><span><strong>${esc(n.title)}</strong><small>${esc(n.body||'')}</small></span></button>`;}
function markNotificationRead(key){notifRead[key]=true; window.DataAdapter.saveNotificationsRead(notifRead); renderNotifications();}
function markAllNotificationsRead(){derivedNotifications().forEach(n=>{notifRead[notificationKey(n)]=true;}); window.DataAdapter.saveNotificationsRead(notifRead); renderNotifications();}

function getUrlWorkspaceId(){try{const p=new URLSearchParams(location.search||''); return p.get('workspace')||p.get('restaurant')||'';}catch{return '';}}
function directWorkspaceFromHost(){const host=String(location.hostname||'').toLowerCase(); if(!host||host==='localhost'||/^\d+\.\d+\.\d+\.\d+$/.test(host)||host.endsWith('.vercel.app'))return ''; const parts=host.split('.').filter(Boolean); if(parts.length<3)return ''; const sub=parts[0]; return ['www','app','admin','portal','restogogo','preview'].includes(sub)?'':sub;}
function requestedWorkspaceId(){const raw=getUrlWorkspaceId()||directWorkspaceFromHost(); if(!raw)return ''; const slug=slugifyWorkspace(raw); return WORKSPACE_ROUTE_ALIASES[slug]||slug;}
function isTimeClockLaunchRoute(){try{const p=new URLSearchParams(location.search||''); const value=String(p.get('terminal')||p.get('kiosk')||'').toLowerCase(); return ['time-clock','timeclock','badge','badge-terminal'].includes(value);}catch{return false;}}
function timeClockTerminalUrl(){const url=new URL(location.href); url.searchParams.set('terminal','time-clock'); url.searchParams.set('workspace',workspaceId()); return url.href;}
function openTimeClockTerminal(){save?.(); const win=window.open(timeClockTerminalUrl(),'_blank','noopener'); if(!win)window.RestogogoUI?.toast?.('Allow pop-ups to open the badge terminal.',{tone:'warning',icon:'!',centered:true,timeout:2200}); else win.focus?.();}
function workspaceNameFromMeta(w){return (w?.restaurant?.name||w?.name||w?.id||'Restaurant').trim()||'Restaurant';}
function defaultWorkspaceCards(){return [{id:'bouillon-bruxelles',status:'Pilot',restaurant:{name:'Bouillon Bruxelles',ownerName:'Xavier',city:'Brussels',accentColor:'#9b1734'}},{id:'demo-restaurant',status:'Demo',restaurant:{name:'Demo Restaurant',ownerName:'Demo Manager',city:'Brussels',accentColor:'#7c3aed'}}];}
function mergedWorkspaceList(){const byId={}; defaultWorkspaceCards().forEach(w=>byId[w.id]=clone(w)); readLocalWorkspaceCatalog().forEach(w=>{if(w?.id)byId[w.id]=Object.assign({},byId[w.id]||{},w,{restaurant:Object.assign({},byId[w.id]?.restaurant||{},w.restaurant||{})});}); if(window.DataAdapter.listWorkspaces){try{window.DataAdapter.listWorkspaces().forEach(w=>{if(!w?.id)return; const id=w.id==='main'?'bouillon-bruxelles':w.id; byId[id]=Object.assign({},byId[id]||{},w,{id,restaurant:Object.assign({},byId[id]?.restaurant||{},w.restaurant||{})});});}catch{}} return Object.values(byId).sort((a,b)=>(a.id==='bouillon-bruxelles'?0:a.id==='demo-restaurant'?1:2)-(b.id==='bouillon-bruxelles'?0:b.id==='demo-restaurant'?1:2)||workspaceNameFromMeta(a).localeCompare(workspaceNameFromMeta(b)));}
function populateRestaurantLoginSelect(){const select=$('restaurantLoginSelect'); if(!select)return; workspaceCatalog=mergedWorkspaceList(); const current=workspaceId(); if(!workspaceCatalog.some(w=>w.id===current))workspaceCatalog.unshift({id:current,status:'Workspace',restaurant:{name:data?.restaurant?.name||current,city:data?.restaurant?.city||'',ownerName:data?.restaurant?.ownerName||''}}); select.innerHTML=workspaceCatalog.map(w=>`<option value="${esc(w.id)}">${esc(workspaceNameFromMeta(w))}</option>`).join(''); select.value=current;}
function changeLoginWorkspace(idValue){const next=slugifyWorkspace(idValue||workspaceId()); if(window.DataAdapter.setWorkspaceId)window.DataAdapter.setWorkspaceId(next); window.DataAdapter.setLoggedIn(false); load(); populateRestaurantLoginSelect(); fillSelectors(); applyRestaurantBrand(); if($('identityLoginName'))identityLoginName.value=''; if($('accessPin'))accessPin.value=''; window.RestogogoBrandEntry?.resetLoginState?.();}
function normalizeLoginIdentity(value){return String(value||'').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/\s+/g,' ');}
function resolveLoginIdentity(){
  const raw=String($('identityLoginName')?.value||'').trim();
  const pin=sanitizePin($('accessPin')?.value||'');
  const help=$('loginPinHelp');
  const fail=message=>{if(help){help.textContent=message; help.classList.add('error');} window.RestogogoBrandEntry?.signalLoginError?.(message); return null;};
  if(help){help.textContent=''; help.classList.remove('error');}
  if(!raw)return fail('Enter your name.');
  if(!pin)return fail('Enter your password or PIN.');
  const key=normalizeLoginIdentity(raw);
  const employee=activeEmployees().find(e=>{const full=normalizeLoginIdentity(e.name); const first=normalizeLoginIdentity(String(e.name||'').split(/\s+/)[0]); return key===full || key===first || key===normalizeLoginIdentity(e.id);});
  if(employee){if(pin!==sanitizePin(employee.pin||PROTOTYPE_PIN))return fail('Wrong password or PIN.'); return {role:'employee',employeeId:employee.id};}
  const ownerAliases=new Set([normalizeLoginIdentity(restaurantOwnerName()),'owner','manager','admin','administrator'].filter(Boolean));
  if(ownerAliases.has(key)){if(pin!==PROTOTYPE_PIN)return fail('Wrong password or PIN.'); return {role:'owner',employeeId:activeEmployees()[0]?.id||data.employees?.[0]?.id||null};}
  return fail('Name not found for this workspace.');
}
function enterSelectedWorkspace(){const identity=resolveLoginIdentity(); if(!identity)return; session.role=identity.role; session.employeeId=identity.employeeId; window.RestogogoBrandEntry?.signalLoginSuccess?.(); window.DataAdapter.setLoggedIn(true); const finish=()=>{save(); enterApp(true);}; window.RestogogoBrandEntry?.shouldDelayEntry?.()?setTimeout(finish,180):finish();}
function showRestaurantLogin(){document.documentElement.classList.remove('time-clock-mode'); document.body.classList.remove('logged-in','owner','employee','owner-planning-mode','my-schedule-mode','time-clock-mode','actual-timesheet-mode'); document.body.classList.add('logged-out'); load(); populateRestaurantLoginSelect(); fillSelectors(); applyRestaurantBrand(); window.RestogogoBrandEntry?.renderEntryModules?.(); if($('login'))login.style.display='grid'; if($('accessPin'))accessPin.value=''; if($('identityLoginName'))identityLoginName.value=''; if($('loginPinHelp')){loginPinHelp.textContent=''; loginPinHelp.classList.remove('error');} window.RestogogoBrandEntry?.resetLoginState?.(); setTimeout(()=>($('identityLoginName')||$('accessPin'))?.focus?.(),0);}

function fillSelectors(){const employees=activeEmployees(); if(!employees.some(e=>e.id===session.employeeId))session.employeeId=employees[0]?.id||'';}
function enterApp(goHome=false){document.body.classList.remove('logged-out'); document.body.classList.add('logged-in'); if($('login'))login.style.display='none'; document.body.classList.toggle('owner',session.role==='owner'); document.body.classList.toggle('employee',session.role==='employee'); fillSelectors(); applyRestaurantBrand(); const target=isTimeClockLaunchRoute()?'time-clock':(session.role==='owner'?'owner':'my-schedule'); if(goHome||!document.querySelector('.page.active'))showPage(target); render(); updateStickyVars();}
function showPage(pageName){if(pageName==='actuals'&&session.role!=='owner')pageName='my-schedule'; const page=$('page-'+pageName); if(!page)return; document.querySelectorAll('.page').forEach(p=>p.classList.remove('active')); page.classList.add('active'); if(pageName==='owner')showTab('planning'); updateAppTitle(); updatePlanningMode(); renderAppNav(); if(data)render(); requestAnimationFrame(updateStickyVars);}
function showTab(tabName){document.querySelectorAll('.tab').forEach(t=>t.classList.remove('active')); $('tab-'+tabName)?.classList.add('active'); updateAppTitle(); updatePlanningMode(); requestAnimationFrame(updateStickyVars);}
function updateAppTitle(){if(!$('appTitle'))return; const active=activePageName(); const labels={owner:'Planning',actuals:'Actuals','time-clock':'Time Clock','my-schedule':'My Schedule'}; appTitle.textContent=labels[active]||(session.role==='owner'?'Planning':'My Schedule');}
function updatePlanningMode(){const my=$('page-my-schedule')?.classList.contains('active'); const owner=$('page-owner')?.classList.contains('active')&&$('tab-planning')?.classList.contains('active'); const clock=$('page-time-clock')?.classList.contains('active'); const actuals=$('page-actuals')?.classList.contains('active'); document.body.classList.toggle('planning-mode',!!owner); document.body.classList.toggle('owner-planning-mode',!!(session.role==='owner'&&owner)); document.body.classList.toggle('my-schedule-mode',!!(session.role==='employee'&&my)); document.body.classList.toggle('time-clock-mode',!!clock); document.documentElement.classList.toggle('time-clock-mode',!!clock); document.body.classList.toggle('actual-timesheet-mode',!!actuals);}
function applyResponsiveMode(){const isPhone=matchMedia('(max-width: 980px)').matches; document.body.classList.toggle('phone',isPhone); document.body.classList.toggle('desktop',!isPhone); updateStickyVars();}
function setStickyCssVar(name,value){document.documentElement.style.setProperty(name,value); document.body?.style.setProperty(name,value);}
function updateStickyVars(){if(!document.body.classList.contains('logged-in'))return; const top=document.querySelector('.topbar'); const th=top?Math.ceil(top.getBoundingClientRect().height):64; setStickyCssVar('--topbar-h',th+'px'); setStickyCssVar('--toolbar-h','0px'); setStickyCssVar('--metrics-h','0px'); setStickyCssVar('--metrics-top',th+'px'); setStickyCssVar('--sticky-shell-h',th+'px'); setStickyCssVar('--calendar-sticky-top',th+'px');}


function activePageName(){
  const active=document.querySelector('.page.active');
  return active ? active.id.replace(/^page-/,'') : '';
}
function navItemsForSession(){
  return session.role==='owner'
    ? [{page:'owner',label:'Planning'},{page:'actuals',label:'Actuals'}]
    : [{page:'my-schedule',label:'My Schedule'}];
}
function renderAppNav(){
  const nav=$('appTopNav');
  if(!nav)return;
  const active=activePageName();
  nav.innerHTML=navItemsForSession().map(item=>`<button type="button" class="app-nav-link${item.page===active?' is-active':''}" data-app-page="${esc(item.page)}">${esc(item.label)}</button>`).join('');
}

function render(){
  if(!data)return;
  applyRestaurantBrand();
  fillSelectors();
  if($('weekStart'))weekStart.value=data.weekStart;
  const who=session.role==='owner'?restaurantOwnerName():(emp(session.employeeId)?.name||'Employee');
  if($('userPill')){userPill.textContent=who; userPill.setAttribute('aria-label',`Log out ${who} and return to login`);}
  updateAppTitle();
  updatePlanningMode();
  renderAppNav();
  if(document.body.classList.contains('my-schedule-mode'))window.EmployeeSchedule?.render?.();
  if(document.body.classList.contains('owner-planning-mode'))window.OwnerPlanning?.render?.();
  if(document.body.classList.contains('time-clock-mode'))window.TimeClock?.render?.();
  if(document.body.classList.contains('actual-timesheet-mode'))window.ActualTimesheet?.render?.();
  renderNotifications();
  requestAnimationFrame(updateStickyVars);
}
function saveWeekSnapshot(){data.history=data.history||{}; data.history[data.weekStart]={availability:clone(data.availability),planning:clone(data.planning),assignments:clone(data.assignments),assignmentTimes:clone(data.assignmentTimes),submitted:clone(data.submitted),notes:clone(data.notes),actualEntries:clone(data.actualEntries||{}),swaps:clone(data.swaps),status:data.status};}
function loadWeekSnapshot(){const h=data.history?.[data.weekStart]; if(h){data.availability=h.availability||{}; data.planning=h.planning||{}; data.assignments=h.assignments||{}; data.assignmentTimes=h.assignmentTimes||{}; data.submitted=h.submitted||{}; data.notes=h.notes||{}; data.actualEntries=h.actualEntries||{}; data.swaps=h.swaps||[]; data.status=h.status==='Published'?'Published':'Draft';}else{data.availability={}; data.planning={}; data.assignments={}; data.assignmentTimes={}; data.submitted={}; data.notes={}; data.actualEntries={}; data.swaps=[]; data.status='Draft';} ensure(data);}
function changeWeek(delta){saveWeekSnapshot(); data.weekStart=monday(addDays(data.weekStart,delta)); loadWeekSnapshot(); save(); render();}
function bind(){
  const on=(idValue,event,handler)=>{$(idValue)?.addEventListener(event,handler);};
  on('enterBtn','click',enterSelectedWorkspace);
  on('accessPin','keydown',e=>{if(e.key==='Enter')enterSelectedWorkspace();});
  on('identityLoginName','keydown',e=>{if(e.key==='Enter')enterSelectedWorkspace();});
  on('restaurantLoginSelect','change',e=>changeLoginWorkspace(e.target.value));
  on('userPill','click',()=>{window.DataAdapter.setLoggedIn(false); showRestaurantLogin();});
  on('notifBtn','click',e=>{e.stopPropagation(); notifOpen=!notifOpen; renderNotifications();});
  document.addEventListener('click',event=>{const launch=event.target.closest('[data-launch-time-clock]'); if(!launch)return; event.preventDefault(); openTimeClockTerminal();});
  $('appTopNav')?.addEventListener('click',event=>{const button=event.target.closest('[data-app-page]'); if(button)showPage(button.dataset.appPage);});
  $('notifPanel')?.addEventListener('click',event=>{
    const markAll=event.target.closest('[data-notification-action="mark-all-read"]');
    if(markAll){event.preventDefault();markAllNotificationsRead();return;}
    const item=event.target.closest('[data-notification-key]');
    if(item){event.preventDefault();markNotificationRead(item.dataset.notificationKey);}
  });
  window.EmployeeSchedule?.bind?.();
  window.OwnerPlanning?.bind?.();
  window.TimeClock?.bind?.();
  window.ActualTimesheet?.bind?.();
  document.addEventListener('click',e=>{if(!e.target.closest('.notif-wrap')){notifOpen=false; renderNotifications();}});
  window.addEventListener('resize',()=>{applyResponsiveMode(); requestAnimationFrame(updateStickyVars);});
  window.addEventListener('orientationchange',()=>requestAnimationFrame(updateStickyVars));
}

window.RestogogoApp={render,changeWeek,saveWeekSnapshot,loadWeekSnapshot,openTimeClockTerminal};

function init(){applyResponsiveMode(); window.OwnerPlanning?.init?.(); notifRead=window.DataAdapter.readNotificationsRead(); bind(); const requested=requestedWorkspaceId(); if(requested&&window.DataAdapter.setWorkspaceId)window.DataAdapter.setWorkspaceId(requested); if(window.DataAdapter.isLoggedIn()){load(); enterApp(true);} else {showRestaurantLogin();} updateStickyVars();}

init();
