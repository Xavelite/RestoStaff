const $=id=>document.getElementById(id);
const days=['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'];
const shifts=['Lunch','Evening'];
const defaultPositions=["Maitre d'hotel","Chef de Rang","Barman","Extra (flexi / student)"];
const defaultPositionPalette=['#f2cfd8','#d9efff','#dff2d8','#fff0c2','#eee5ff','#dff4f5','#f3e3d6'];
const defaultZonePalette=['#b0183b','#2f80ed','#8b5cf6','#f59e0b','#0891b2','#64748b','#db2777','#8a7b82'];
let positions=[];
let zoneRules=[];
const defaultZoneRules=[
  ['OFF','Off','Off','Off'],['AC','Accueil','11:00-15:00','17:00-00:00'],['DOM 1','Chef de Rang','11:00-15:00','17:50-23:00'],['DOM 2','Chef de Rang','12:00-16:00','18:50-00:00'],['ILOT 1','Chef de Rang','11:00-15:00','17:50-23:00'],['ILOT 2','Chef de Rang','12:00-16:00','18:50-00:00'],['BOUIL 1','Chef de Rang','11:00-15:00','17:50-23:00'],['SCH 1','Chef de Rang','11:00-15:00','17:50-23:00'],['SCH 2','Chef de Rang','12:00-16:00','18:50-00:00'],['PASS 1','Runner','12:00-16:00','17:50-23:00'],['PASS B 1','Runner','12:00-16:00','17:50-23:00'],['BAR 1','Barman','11:00-15:00','17:00-00:00'],['BAR ET','Barman','12:00-16:00','18:00-00:00']
].map(([zone,role,lunch,evening])=>({zone,role,lunch,evening}));
const defaults=['Dimitri|Maitre d\'hotel|18','Iymane|Barman|15','Anxhelo|Barman|15','Arben|Chef de Rang|16','Metin|Chef de Rang|16','Khadija|Chef de Rang|16','Laundry|Chef de Rang|16','Joel|Chef de Rang|16','Pedro|Chef de Rang|16','Radhi|Chef de Rang|16','Hakim|Chef de Rang|16','Carl|Chef de Rang|16','Candy|Chef de Rang|16','Eva|Chef de Rang|16','Lea|Extra (flexi / student)|13.5','Anais|Extra (flexi / student)|13.5','Chloe|Extra (flexi / student)|13.5','Yassin|Extra (flexi / student)|13.5','Sam|Extra (flexi / student)|13.5','Loic|Extra (flexi / student)|13.5','Frantzchini|Extra (flexi / student)|13.5','Sophie|Extra (flexi / student)|13.5','Laura|Extra (flexi / student)|13.5','Jetmir|Extra (flexi / student)|13.5'];
/* v20: restores missing swapFor helper so calendars render */
let data,session={role:'employee',employeeId:null},loginRole='employee',pendingSwap=null,pendingZone=null,selectedCalendarRow='',metricFilter='week',showZeroRows=true,metricFocus=null,notifOpen=false,notifRead={},storageReadOnly=false,setupWizardStep=0,setupWizardDraft=null,setupWizardMode='edit',workspaceCatalog=[],dailyCloseSelectedDate='',teamSelectedEmployeeId='',forecastSelectedDate='',timeClockView='hub',timeClockEmployeeId='',timeClockPin='',timeClockAuthorizedEmployeeId='',timeClockMessageText='',timeClockFeedbackState='',timeClockSuccessDateText='',timeClockResetTimer=null,timeClockBusy=false;
function id(){return (crypto.randomUUID?crypto.randomUUID():String(Date.now()+Math.random())).replaceAll('-','').slice(0,12)}
function esc(s=''){return String(s).replace(/[&<>"]/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[m]))}
function cleanPositionName(p='') { return String(p).replace(/^\s*[A-Z]\.\s*/, '').trim(); }
function sanitizePin(value=''){return String(value||'').replace(/\D/g,'').slice(0,4)}
const PROTOTYPE_PIN='0000';
const DEV_GATE_USER='admin';
const DEV_GATE_PASSWORD='0000';
const DEV_GATE_KEY='restostaff_dev_gate_unlocked';
const WORKSPACE_ROUTE_ALIASES={bouillon:'bouillon-bruxelles',demo:'demo-restaurant'};
function defaultPinForIndex(i){return PROTOTYPE_PIN}
function positionIndex(p){let clean=cleanPositionName(p);let i=positions.findIndex(x=>cleanPositionName(x)===clean);return i<0?999:i}
function sortEmployees(list){return [...list].sort((a,b)=>positionIndex(a.position)-positionIndex(b.position)||String(a.name).localeCompare(String(b.name)))}
function money(n){return '€'+Number(n||0).toFixed(2)}
function restaurantName(){return (data?.restaurant?.name||'Bouillon Bruxelles').trim()||'Bouillon Bruxelles'}
function restaurantOwnerName(){return (data?.restaurant?.ownerName||'Manager').trim()||'Manager'}
function restaurantCity(){return (data?.restaurant?.city||'').trim()}
function restaurantAccent(){return normalizeHexColor(data?.restaurant?.accentColor)||'#9b1734'}
function appThemeFromValue(value){
  const t=String(value||'modern-light').trim().toLowerCase();
  if(t==='modern-dark')return 'modern-dark';
  return 'modern-light';
}
function appTheme(){return appThemeFromValue(data?.restaurant?.theme)}
function appThemeLabel(t=appTheme()){return t==='modern-dark'?'Modern Dark':'Modern Light'}
function nextAppTheme(t=appTheme()){return t==='modern-dark'?'modern-light':'modern-dark'}
function applyAppTheme(){
  const t=appTheme();
  if(document.body){
    document.body.classList.toggle('theme-modern',t==='modern-dark');
    document.body.classList.toggle('theme-light',t==='modern-light');
  }
  const btn=$('themeToggleBtn');
  if(btn){
    const icon=t==='modern-dark'?'🌙':'☀️';
    const next=t==='modern-dark'?'Modern Light':'Modern Dark';
    btn.innerHTML=`<span class="theme-toggle-icon" aria-hidden="true">${icon}</span><span class="visually-hidden">${appThemeLabel(t)}</span>`;
    btn.title=`Switch to ${next}`;
    btn.setAttribute('aria-label',`Switch to ${next}`);
  }
}
function uiIconSvg(name){
  const icons={
    check:`<svg class="btn-svg" viewBox="0 0 24 24" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg>`,
    undo:`<svg class="btn-svg" viewBox="0 0 24 24" aria-hidden="true"><path d="M3 7v6h6"/><path d="M21 17a9 9 0 0 0-15-6.7L3 13"/></svg>`,
    eye:`<svg class="btn-svg" viewBox="0 0 24 24" aria-hidden="true"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/></svg>`,
    eyeOff:`<svg class="btn-svg" viewBox="0 0 24 24" aria-hidden="true"><path d="M3 3l18 18"/><path d="M10.6 10.6A3 3 0 0 0 13.4 13.4"/><path d="M9.9 4.2A10.7 10.7 0 0 1 12 4c6.5 0 10 8 10 8a17.8 17.8 0 0 1-3.1 4.3"/><path d="M6.1 6.1C3.5 7.8 2 12 2 12s3.5 8 10 8a10.7 10.7 0 0 0 5.2-1.4"/></svg>`
  };
  return icons[name]||'';
}
function normalizeHexColor(value){let v=String(value||'').trim();if(/^#[0-9a-f]{6}$/i.test(v))return v;if(/^#[0-9a-f]{3}$/i.test(v))return '#'+v.slice(1).split('').map(ch=>ch+ch).join('');return ''}
function darkenHex(hex,amount=.18){hex=normalizeHexColor(hex)||'#9b1734';let n=parseInt(hex.slice(1),16),r=(n>>16)&255,g=(n>>8)&255,b=n&255;let f=x=>Math.max(0,Math.min(255,Math.round(x*(1-amount))));return '#'+[f(r),f(g),f(b)].map(x=>x.toString(16).padStart(2,'0')).join('')}
function workspaceId(){return window.DataAdapter.getWorkspaceId?window.DataAdapter.getWorkspaceId():'local-restaurant'}
function slugifyWorkspace(value){if(window.DataAdapter.sanitizeWorkspaceId)return window.DataAdapter.sanitizeWorkspaceId(value);return String(value||'restaurant').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'').slice(0,64)||'restaurant'}
function workspaceCatalogKey(){return 'restostaff_workspace_catalog'}
function readLocalWorkspaceCatalog(){return window.DataAdapter.getJSON?window.DataAdapter.getJSON(workspaceCatalogKey(),[]):[]}
function saveLocalWorkspaceCatalog(list){if(window.DataAdapter.setJSON)window.DataAdapter.setJSON(workspaceCatalogKey(),list||[])}
function registerWorkspace(meta){
  const id=slugifyWorkspace(meta?.id||meta?.restaurant?.name||meta?.name||'restaurant');
  const existing=readLocalWorkspaceCatalog().filter(w=>w.id!==id);
  existing.unshift({id,name:meta.name||meta?.restaurant?.name||id,restaurant:meta.restaurant||{},status:meta.status||'Pilot',updated_at:new Date().toISOString()});
  saveLocalWorkspaceCatalog(existing.slice(0,24));
}
function localISO(d){let x=new Date(d);x.setHours(12,0,0,0);let y=x.getFullYear(),m=String(x.getMonth()+1).padStart(2,'0'),day=String(x.getDate()).padStart(2,'0');return `${y}-${m}-${day}`}
function parseISO(iso){let [y,m,d]=String(iso||localISO(new Date())).split('-').map(Number);let x=new Date(y,(m||1)-1,d||1);x.setHours(12,0,0,0);return x}
function monday(d=new Date()){let x=(d instanceof Date)?new Date(d):parseISO(d);x.setHours(12,0,0,0);let day=(x.getDay()+6)%7;x.setDate(x.getDate()-day);return localISO(x)}
function addDays(iso,n){let d=parseISO(iso);d.setDate(d.getDate()+n);return localISO(d)}
function dateForDay(dayName){let idx=days.indexOf(dayName);return addDays(data.weekStart,idx)}
function newData(){let employees=defaults.map((r,i)=>{let [name,position,rate]=r.split('|');return{id:'e'+i,name,position,rate:+rate,active:true,pin:defaultPinForIndex(i)}});let o={version:15,restaurant:{name:'Bouillon Bruxelles',ownerName:'Xavier',city:'Brussels',logoUrl:'',accentColor:'#9b1734',theme:'modern-light'},weekStart:monday(),status:'Draft',employees,positions:[...defaultPositions],zoneRules:structuredClone(defaultZoneRules),positionColors:{},zoneColors:{},availability:{},assignments:{},submitted:{},notes:{},swaps:[],history:{},timeEntries:[],forecast:{days:{}}};ensure(o);return o}
function defaultEmployees(){return defaults.map((r,i)=>{let [name,position,rate]=r.split('|');return{id:'e'+i,name,position,rate:+rate,active:true,pin:defaultPinForIndex(i)}})}
function ensure(o=data){
  // Migration/safety: older local versions could leave the app with no employees or inactive/partial employee objects.
  o.restaurant=(o.restaurant&&typeof o.restaurant==='object')?o.restaurant:{};
  o.restaurant.name=String(o.restaurant.name||'Bouillon Bruxelles').trim()||'Bouillon Bruxelles';
  o.restaurant.ownerName=String(o.restaurant.ownerName||'Manager').trim()||'Manager';
  o.restaurant.city=String(o.restaurant.city||'').trim();
  o.restaurant.logoUrl=String(o.restaurant.logoUrl||'').trim();
  o.restaurant.accentColor=normalizeHexColor(o.restaurant.accentColor)||'#9b1734';
  o.restaurant.theme=appThemeFromValue(o.restaurant.theme||'modern-light');
  if(!Array.isArray(o.employees)||!o.employees.length)o.employees=defaultEmployees();
  o.positions=(o.positions&&o.positions.length?o.positions:[...defaultPositions]).map(cleanPositionName);
  // de-duplicate clean position names while preserving owner order
  o.positions=o.positions.filter((p,i,a)=>p&&a.indexOf(p)===i);
  positions=o.positions;
  o.employees=o.employees.map((e,i)=>({
    ...e,
    id:e.id||('e'+i),
    name:e.name||('Employee '+(i+1)),
    position:cleanPositionName(e.position||defaultPositions[0]),
    rate:Number(e.rate??13.5),
    active:e.active===undefined?true:!!e.active,
    managerAccess:!!(e.managerAccess||e.isManager||e.manager),
    contractType:String(e.contractType||'').trim(),
    payrollId:String(e.payrollId||'').trim(),
    email:String(e.email||'').trim(),
    phone:String(e.phone||'').trim(),
    address:String(e.address||'').trim(),
    startDate:String(e.startDate||'').trim(),
    emergencyContact:String(e.emergencyContact||'').trim(),
    hrNotes:String(e.hrNotes||e.notes||'').trim(),
    documents:Array.isArray(e.documents)?e.documents:[],
    pin:PROTOTYPE_PIN
  }));
  if(!o.employees.some(e=>e.active))o.employees.forEach(e=>e.active=true);
  o.zoneRules=o.zoneRules&&o.zoneRules.length?o.zoneRules:structuredClone(defaultZoneRules);
  o.zoneRules=o.zoneRules.map(z=>({...z, role: cleanPositionName(z.role||'')}));
  zoneRules=o.zoneRules;
  o.positionColors=o.positionColors||{};
  o.zoneColors=o.zoneColors||{};
  positions.forEach((p,i)=>{ if(!o.positionColors[p]) o.positionColors[p]=defaultPositionPalette[i%defaultPositionPalette.length]; });
  [...new Set(zoneRules.map(z=>z.zone).filter(Boolean))].forEach((z,i)=>{ if(!o.zoneColors[z]) o.zoneColors[z]=defaultZonePalette[i%defaultZonePalette.length]; });
  o.availability=o.availability||{};o.assignments=o.assignments||{};o.assignmentTimes=o.assignmentTimes||{};o.submitted=o.submitted||{};o.notes=o.notes||{};o.swaps=Array.isArray(o.swaps)?o.swaps:[];o.history=o.history||{};o.timeEntries=Array.isArray(o.timeEntries)?o.timeEntries:[];
  o.timeEntries=o.timeEntries.map(entry=>{
    const out=!!entry.clockOut;
    const open=entry.status==='open'&&!out;
    return {
      ...entry,
      status:open?'open':(out?'closed':(entry.status||'open')),
      approvalStatus:entry.approvalStatus || entry.approval || (out?'approved':'pending'),
      managerNote:String(entry.managerNote||entry.note||'')
    };
  });
  o.hr=o.hr&&typeof o.hr==='object'?o.hr:{};
  o.hr.absences=Array.isArray(o.hr.absences)?o.hr.absences:[];
  o.hr.absences=o.hr.absences.map(a=>({id:a.id||id(),employeeId:a.employeeId||'',type:String(a.type||'Vacation'),startDate:String(a.startDate||a.date||todayISO()),endDate:String(a.endDate||a.startDate||a.date||todayISO()),status:String(a.status||'pending'),note:String(a.note||''),createdAt:a.createdAt||nowISO(),updatedAt:a.updatedAt||nowISO()}));
  ensureInventoryState(o);ensureDailyCloseState(o);ensureForecastState(o);
  days.forEach(d=>{o.notes[d]=o.notes[d]||{};shifts.forEach(s=>o.notes[d][s]=o.notes[d][s]||'')});
  o.employees.forEach(e=>{o.availability[e.id]=o.availability[e.id]||{};o.assignments[e.id]=o.assignments[e.id]||{};o.assignmentTimes[e.id]=o.assignmentTimes[e.id]||{};days.forEach(d=>{o.availability[e.id][d]=o.availability[e.id][d]||{};o.assignments[e.id][d]=o.assignments[e.id][d]||{};o.assignmentTimes[e.id][d]=o.assignmentTimes[e.id][d]||{};shifts.forEach(s=>{if(o.availability[e.id][d][s]===undefined)o.availability[e.id][d][s]=false;o.assignments[e.id][d][s]=o.assignments[e.id][d][s]||'';o.assignmentTimes[e.id][d][s]=String(o.assignmentTimes[e.id][d][s]||'').trim()})})});
  return o
}
function safeJSON(key,fallback){return window.DataAdapter.getJSON(key,fallback)}
function setCloudStatus(state,message){
  const el=$('cloudStatus'); if(!el)return;
  el.classList.remove('saving','saved','error');
  el.classList.add(state||'saved');
  el.textContent=message || (state==='error'?'Cloud error':state==='saving'?'Saving…':'Saved to cloud ✓');
  el.title=el.textContent;
}

function neutralZoneRules(){
  return [
    {zone:'Accueil',role:'Manager',lunch:'11:00-15:00',evening:'17:00-23:00'},
    {zone:'Salle',role:'Chef de Rang',lunch:'11:30-15:30',evening:'18:00-23:00'},
    {zone:'Bar',role:'Barman',lunch:'11:00-15:00',evening:'17:30-00:00'},
    {zone:'Runner',role:'Runner',lunch:'12:00-16:00',evening:'18:30-23:30'}
  ];
}
function starterRestaurantData(kind='blank'){
  const isDemo=kind==='demo';
  const employees=isDemo?[
    {id:'demo1',name:'Alex',position:'Manager',rate:19,active:true,pin:PROTOTYPE_PIN},
    {id:'demo2',name:'Lina',position:'Chef de Rang',rate:16,active:true,pin:PROTOTYPE_PIN},
    {id:'demo3',name:'Noah',position:'Barman',rate:15,active:true,pin:PROTOTYPE_PIN},
    {id:'demo4',name:'Sam',position:'Extra (flexi / student)',rate:13.5,active:true,pin:PROTOTYPE_PIN}
  ]:[];
  return {
    version:15,
    restaurant:{
      name:isDemo?'Demo Restaurant':'',
      ownerName:isDemo?'Demo Manager':'',
      city:isDemo?'Brussels':'',
      logoUrl:'',
      accentColor:isDemo?'#7c3aed':'#9b1734',
      theme:'modern-light'
    },
    weekStart:monday(),status:'Draft',employees,
    positions:['Manager','Chef de Rang','Barman','Runner','Extra (flexi / student)'],
    zoneRules:neutralZoneRules(),positionColors:{},zoneColors:{},availability:{},assignments:{},submitted:{},notes:{},swaps:[],history:{}
  };
}
function defaultDataForWorkspace(idValue){
  const id=slugifyWorkspace(idValue||workspaceId());
  if(id==='demo-restaurant'){let o=starterRestaurantData('demo');ensure(o);return o;}
  if(id==='bouillon-bruxelles'||id==='main'){return newData();}
  const o=starterRestaurantData('blank');
  o.restaurant.name=id.split('-').map(w=>w.charAt(0).toUpperCase()+w.slice(1)).join(' ');
  o.employees=[{id:'starter1',name:'Manager',position:'Manager',rate:18,active:true,pin:PROTOTYPE_PIN}];
  ensure(o);
  return o;
}
function applyRestaurantBrand(){
  if(!data)return;
  const accent=restaurantAccent();
  document.documentElement.style.setProperty('--red',accent);
  document.documentElement.style.setProperty('--red2',darkenHex(accent,.22));
  document.documentElement.style.setProperty('--restaurant-accent',accent);
  applyAppTheme();
  const explicitLogo=String(data.restaurant?.logoUrl||'').trim();
  const useLegacyLogo=!explicitLogo && workspaceId()==='bouillon-bruxelles';
  const logo=explicitLogo || (useLegacyLogo?'logo.png':'');
  const initial=(restaurantName().charAt(0)||'R').toUpperCase();
  if($('brandLogo')){
    brandLogo.style.display=logo?'block':'none';
    if(logo){brandLogo.src=logo;brandLogo.alt=restaurantName();}
    const mark=brandLogo.closest('.restaurant-brand-mark');
    if(mark) mark.classList.toggle('has-logo', !!logo);
  }
  if($('brandRestaurantInitial')){
    brandRestaurantInitial.style.display=logo?'none':'grid';
    brandRestaurantInitial.textContent=initial;
    brandRestaurantInitial.style.background=accent;
  }
  if($('loginLogo')){
    loginLogo.style.display=logo?'block':'none';
    if(logo){loginLogo.src=logo;loginLogo.alt=restaurantName();}
    const mark=loginLogo.closest('.login-restaurant-mark');
    if(mark) mark.classList.toggle('has-logo', !!logo);
  }
  if($('loginRestaurantInitial')){
    loginRestaurantInitial.style.display=logo?'none':'grid';
    loginRestaurantInitial.textContent=initial;
    loginRestaurantInitial.style.background=accent;
  }
  if($('terminalLogo')){
    terminalLogo.style.display=logo?'block':'none';
    if(logo){terminalLogo.src=logo;terminalLogo.alt=restaurantName();}
    const mark=terminalLogo.closest('.terminal-restaurant-mark');
    if(mark) mark.classList.toggle('has-logo', !!logo);
  }
  if($('terminalRestaurantInitial')){
    terminalRestaurantInitial.style.display=logo?'none':'grid';
    terminalRestaurantInitial.textContent=initial;
    terminalRestaurantInitial.style.background=accent;
  }
  if($('terminalRestaurantName'))terminalRestaurantName.textContent=restaurantName();
  if($('brandEyebrow'))brandEyebrow.textContent='RestoStaff';
  if($('appTitle'))appTitle.textContent='Planning';
  if($('brandWorkspaceChip')){
    const city=restaurantCity();
    brandWorkspaceChip.textContent=city?`${restaurantName()} · ${city}`:restaurantName();
  }
  if($('loginRestaurantName'))loginRestaurantName.textContent=restaurantName();
  if($('loginWorkspaceBadge')){
    const city=restaurantCity();
    const manager=restaurantOwnerName();
    loginWorkspaceBadge.textContent=[city, manager&&manager!=='Manager'?`Managed by ${manager}`:''].filter(Boolean).join(' · ');
  }
}
function load(){
  storageReadOnly=false;
  const loaded=window.DataAdapter.readPlanner();
  const err=window.DataAdapter.getLastError&&window.DataAdapter.getLastError();
  const readStatus=window.DataAdapter.getLastReadStatus?window.DataAdapter.getLastReadStatus():(err?'error':'ok');

  if(!loaded && err && window.DataAdapter.supabaseOnly){
    // v127 safety: never seed/save default data over the shared row after a failed cloud read.
    storageReadOnly=true;
    data=defaultDataForWorkspace(workspaceId());
  }else{
    data=loaded||defaultDataForWorkspace(workspaceId());
  }

  data.weekStart=monday(data.weekStart||new Date());
  ensure();
  applyRestaurantBrand();
  session=window.DataAdapter.readSession(session)||session;
  if(!session.employeeId||!emp(session.employeeId)){session.employeeId=activeEmployees()[0]?.id||data.employees[0]?.id||null}

  if(storageReadOnly){
    setCloudStatus('error','Cloud read failed — protected mode');
    return;
  }

  if(readStatus==='seed-needed'||readStatus==='empty'){
    setCloudStatus('saving','Creating cloud setup…');
    save();
    return;
  }

  setCloudStatus(err?'error':'saved',err?'Cloud connection issue':(readStatus==='legacy-ok'?'Loaded legacy workspace ✓':'Loaded from cloud ✓'));
  save();
}
function save(){
  window.DataAdapter.saveSession(session);
  if(storageReadOnly){
    setCloudStatus('error','Cloud read failed — changes disabled');
    return false;
  }
  setCloudStatus('saving','Saving…');
  const ok=window.DataAdapter.savePlanner(data);
  const err=window.DataAdapter.getLastError&&window.DataAdapter.getLastError();
  if(ok===false||err)setCloudStatus('error','Cloud save failed');else{registerWorkspace({id:workspaceId(),restaurant:data.restaurant,name:restaurantName(),status:workspaceId()==='bouillon-bruxelles'?'Pilot':'Active'});setCloudStatus('saved','Saved to cloud ✓');}
  return ok!==false&&!err
}
function emp(id){return data.employees.find(e=>e.id===id)}
function activeEmployees(){return sortEmployees(data.employees.filter(e=>e.active))}
function selectedId(){return session.role==='owner'?employeeSelect.value:session.employeeId}
function suggestZone(e,s){if(!e)return'';if(e.position.includes('Maitre'))return 'AC';if(e.position.includes('Barman'))return s==='Lunch'?'BAR 1':'BAR ET';if(e.position.includes('Extra'))return s==='Lunch'?'PASS 1':'PASS B 1';return s==='Lunch'?'DOM 1':'ILOT 1'}
function defaultHours(s){return s==='Lunch'?4:6}
function timeRangeFor(e,d,s){let custom=data.assignmentTimes?.[e.id]?.[d]?.[s];if(custom)return custom;let zone=data.assignments[e.id]?.[d]?.[s]||suggestZone(e,s);let rule=zoneRules.find(r=>r.zone===zone);return rule?(s==='Lunch'?rule.lunch:rule.evening):(s==='Lunch'?'11:00-15:00':'17:50-23:00')}
function hoursFromRange(r){if(!r||r==='-'||!r.includes('-'))return 0;let [a,b]=r.split('-').map(x=>x.trim());let toMin=t=>{let m=t.match(/(\d{1,2}):(\d{2})/);return m?(+m[1])*60+(+m[2]):0};let start=toMin(a),end=toMin(b);if(!start&&!end)return 0;if(end<start)end+=1440;return Math.max(0,(end-start)/60)}
function slotHours(e,d,s){return data.availability[e.id]?.[d]?.[s]?hoursFromRange(timeRangeFor(e,d,s)):0}
function fmtHours(n){
  const v = Number(n)||0;
  const sign = v < 0 ? '-' : '';
  const totalMinutes = Math.round(Math.abs(v) * 60);
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  if(m===0) return sign + String(h) + 'h';
  return sign + h + 'h' + String(m).padStart(2,'0');
}
function fmtPeople(n){return String(Number(n)||0)+'p'}
function colorForPosition(p){return (data.positionColors&&data.positionColors[cleanPositionName(p)])||defaultPositionPalette[Math.max(0,positionIndex(p))%defaultPositionPalette.length]}
function colorForZone(z){return (data.zoneColors&&data.zoneColors[z])||defaultZonePalette[Math.abs(String(z||'').split('').reduce((a,c)=>a+c.charCodeAt(0),0))%defaultZonePalette.length]}
function hexToRgb(hex){let h=String(hex||'#999999').replace('#','');if(h.length===3)h=h.split('').map(x=>x+x).join('');let n=parseInt(h,16);return {r:(n>>16)&255,g:(n>>8)&255,b:n&255}}
function rgba(hex,a){let c=hexToRgb(hex);return `rgba(${c.r},${c.g},${c.b},${a})`}
function positionStyle(p){let c=colorForPosition(p);return `--pos-color:${c};--pos-bg:${c};--pos-border:${rgba(c,.72)};`}
function zoneStyle(z){let c=colorForZone(z);return `--zone-accent:${c};`}
function styleAttr(css){return css?` style="${css}"`:''}
function rowClickAttr(key){return `data-rowkey="${esc(key)}" onclick="selectCalRow(this.dataset.rowkey)"`}

function metricKey(kind,value){return kind+':'+String(value)}
function scrollRowInsideCalendar(row){
  if(!row)return;
  const isPhone=document.body.classList.contains('phone') || window.matchMedia('(max-width: 980px)').matches;
  const sticky=isPhone?16:(parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--sticky-shell-h'))||140);
  const target=window.scrollY + row.getBoundingClientRect().top - sticky - 18;
  window.scrollTo({top:Math.max(0,target), behavior:'smooth'});
}

function activeCalendarScope(){
  return document.querySelector('.page.active .tab.active .calendar') || document.querySelector('.page.active > .calendar') || document;
}
function metricClick(kind,value,event){
  if(event)event.stopPropagation();
  metricFocus={kind,value};
  selectedCalendarRow=metricKey(kind,value);
  render();
  setTimeout(()=>{
    const scope=activeCalendarScope();
    let row=null;
    if(kind==='position'){
      const first=activeEmployees().find(e=>cleanPositionName(e.position)===cleanPositionName(value));
      if(first) row=scope.querySelector(`[data-rowkey="emp:${CSS.escape(first.id)}"]`);
      if(!row) row=scope.querySelector(`[data-rowkey="${CSS.escape(metricKey(kind,value))}"]`);
      scrollRowInsideCalendar(row);
    }
    showMetricPanel(kind,value,event);
  },30);
}
function clearMetricPanel(){let el=document.getElementById('metricDetailPanel'); if(el)el.remove();}
function shortDayName(d){return String(d||'').slice(0,3)}
function metricDetailRecords(kind,value){
  let records=[];
  activeEmployees().forEach(e=>{
    if(kind==='position' && cleanPositionName(e.position)!==cleanPositionName(value))return;
    let dayRows=[];let total=0;let lunchTotal=0;let eveningTotal=0;
    metricDays().forEach(d=>{
      let parts={Lunch:null,Evening:null};let dayTotal=0;
      shifts.forEach(sh=>{
        let h=slotHours(e,d,sh); if(!h)return;
        let z=data.assignments[e.id]?.[d]?.[sh]||suggestZone(e,sh)||'Unassigned';
        if(kind==='zone' && z!==value)return;
        let range=timeRangeFor(e,d,sh);
        parts[sh]={range,h,zone:z}; dayTotal+=h; total+=h;
        if(sh==='Lunch')lunchTotal+=h; else eveningTotal+=h;
      });
      if(dayTotal>0)dayRows.push({day:d,lunch:parts.Lunch,evening:parts.Evening,total:dayTotal});
    });
    if(total>0)records.push({employee:e.name,position:e.position,total,lunchTotal,eveningTotal,days:dayRows});
  });
  return records.sort((a,b)=>b.total-a.total||a.employee.localeCompare(b.employee));
}
function formatSlotPart(part){return part ? `${esc(part.range)} <span class="mini-hours">(${fmtHours(part.h)})</span>` : '<span class="muted tiny">—</span>'}
function metricDetails(kind,value){
  return metricDetailRecords(kind,value).map(r=>[r.employee,r.total]);
}
function showMetricPanel(kind,value,event){
  clearMetricPanel();
  let records=metricDetailRecords(kind,value);
  let panel=document.createElement('div'); panel.id='metricDetailPanel'; panel.className='metric-detail-panel';
  let total=records.reduce((sum,r)=>sum+r.total,0);
  let lunchTotal=records.reduce((sum,r)=>sum+r.lunchTotal,0);
  let eveningTotal=records.reduce((sum,r)=>sum+r.eveningTotal,0);
  let lunchPeople=records.filter(r=>r.lunchTotal>0).length;
  let eveningPeople=records.filter(r=>r.eveningTotal>0).length;
  let summary=`<div class="metric-total-line"><span><b>Total</b> ${fmtHours(total)} · ${fmtPeople(records.length)}</span><span><b>Lunch</b> ${fmtHours(lunchTotal)} · ${fmtPeople(lunchPeople)}</span><span><b>Evening</b> ${fmtHours(eveningTotal)} · ${fmtPeople(eveningPeople)}</span></div>`;

  let grouped=metricDays().map(d=>{
    let items=[]; let dayTotal=0; let lunch=0; let evening=0;
    records.forEach(r=>{
      let dr=r.days.find(x=>x.day===d);
      if(!dr)return;
      dayTotal+=dr.total;
      if(dr.lunch)lunch+=dr.lunch.h;
      if(dr.evening)evening+=dr.evening.h;
      items.push({employee:r.employee, total:dr.total, lunch:dr.lunch, evening:dr.evening});
    });
    return {day:d,total:dayTotal,lunchTotal:lunch,eveningTotal:evening,people:items.length,items:items.sort((a,b)=>b.total-a.total||a.employee.localeCompare(b.employee))};
  }).filter(g=>g.total>0);

  let rows = grouped.length ? '<div class="metric-detail-list rich by-day">'+grouped.map(g=>{
    let itemLines=g.items.map(it=>`<div class="metric-employee-line"><span class="metric-employee-name">${esc(it.employee)}</span><span class="metric-day-slot"><b>Lunch</b> ${formatSlotPart(it.lunch)}</span><span class="metric-day-slot"><b>Evening</b> ${formatSlotPart(it.evening)}</span><span class="metric-day-total">${fmtHours(it.total)}</span></div>`).join('');
    return `<section class="metric-day-group"><div class="metric-day-group-head"><strong>${esc(g.day)}</strong><span><b>Total</b> ${fmtHours(g.total)} · ${fmtPeople(g.people)}</span><span><b>Lunch</b> ${fmtHours(g.lunchTotal)}</span><span><b>Evening</b> ${fmtHours(g.eveningTotal)}</span></div>${itemLines}</section>`;
  }).join('')+'</div>' : '<p class="muted">No planned hours for this selection.</p>';

  panel.innerHTML=`<button class="metric-close" onclick="clearMetricPanel()">×</button><span class="eyebrow">${kind==='position'?'WHO':'WHERE'}</span><h4>${esc(value)} <small>${fmtHours(total)}</small></h4>${summary}${rows}`;
  document.body.appendChild(panel);
  let x=event?.clientX||window.innerWidth-420, y=event?.clientY||180;
  panel.style.left=Math.min(window.innerWidth-560,Math.max(16,x-240))+'px'; panel.style.top=Math.min(window.innerHeight-520,Math.max(88,y+16))+'px';
}


function notificationKey(n){return n.key||n.id}
function addNotification(key,severity,title,text,target={}){
  data.notifications=data.notifications||[];
  data.notifications.unshift({id:id(),key,severity,title,text,target,created:Date.now()});
  data.notifications=data.notifications.slice(0,80);
}
function addSwapNotification(sw){
  if(!sw)return;
  const from=emp(sw.from)?.name||'Someone', to=sw.to?(emp(sw.to)?.name||'someone'):'anyone';
  let title='Swap update', severity='yellow';
  if(sw.status==='Employee approval'){title=`${to} must accept a swap`; severity='red'}
  if(sw.status==='Pending'){title='Swap waiting for owner approval'; severity='red'}
  if(sw.status==='Waiting'){title=`${from} offered a shift`; severity='yellow'}
  if(sw.status==='Approved'){title='Swap approved'; severity='yellow'}
  if(sw.status==='Rejected'){title='Swap rejected'; severity='yellow'}
  addNotification('swap-'+sw.id+'-'+sw.status,severity,title,`${from} → ${to} · ${sw.day} ${sw.shift}`,{kind:'swap',id:sw.id,from:sw.from,to:sw.to,day:sw.day,shift:sw.shift});
}
function notificationAudience(n){
  const t=n?.target||{};
  if(session.role==='owner'){
    // Owner sees only external/relevant information, never their own planning edits.
    if(t.kind==='submission') return true;
    return false;
  }
  if(!session.employeeId) return false;
  if(t.kind==='employee') return t.id===session.employeeId;
  if(t.kind==='status') return n.title==='Schedule published' || String(n.text||'').toLowerCase().includes('published');
  if(t.from===session.employeeId||t.to===session.employeeId) return true;
  return false;
}
function derivedNotifications(){
  const out=[];
  (data.swaps||[]).forEach(sw=>{
    const from=emp(sw.from)?.name||'Someone', to=sw.to?(emp(sw.to)?.name||'someone'):'anyone';
    if(session.role==='owner'){
      if(sw.status==='Pending')out.push({id:'act-owner-'+sw.id,severity:'red',action:true,title:'Approve swap',text:`${from} → ${to} · ${sw.day} ${sw.shift}`,target:{kind:'swap',id:sw.id,day:sw.day,from:sw.from},buttons:'owner'});
      else if(sw.status==='Waiting')out.push({id:'info-open-'+sw.id,severity:'yellow',action:false,title:'Shift offered',text:`${from} offered ${sw.day} ${sw.shift} to anyone`,target:{kind:'swap',id:sw.id,day:sw.day,from:sw.from}});
      else if(sw.status==='Employee approval')out.push({id:'info-emp-'+sw.id,severity:'yellow',action:false,title:'Waiting employee approval',text:`${from} → ${to} · ${sw.day} ${sw.shift}`,target:{kind:'swap',id:sw.id,day:sw.day,from:sw.from}});
    }else{
      const me=session.employeeId;
      if(sw.from===me && sw.status==='Employee approval')out.push({id:'act-me-'+sw.id,severity:'red',action:true,title:'Swap request needs your approval',text:`${to} wants your ${sw.day} ${sw.shift} shift`,target:{kind:'swap',id:sw.id,day:sw.day,from:sw.from},buttons:'employee'});
      else if(sw.from===me && sw.status==='Waiting')out.push({id:'info-own-wait-'+sw.id,severity:'yellow',action:false,title:'Your shift is offered',text:`Waiting for someone to take ${sw.day} ${sw.shift}`,target:{kind:'swap',id:sw.id,day:sw.day,from:sw.from}});
      else if(sw.from===me && sw.status==='Pending')out.push({id:'info-own-pending-'+sw.id,severity:'yellow',action:false,title:'Swap waiting for owner',text:`${to} accepted ${sw.day} ${sw.shift}`,target:{kind:'swap',id:sw.id,day:sw.day,from:sw.from}});
      else if(sw.to===me && sw.status==='Pending')out.push({id:'info-taker-pending-'+sw.id,severity:'yellow',action:false,title:'Swap waiting for owner',text:`You volunteered for ${from}'s ${sw.day} ${sw.shift}`,target:{kind:'swap',id:sw.id,day:sw.day,from:sw.from}});
      else if((sw.from===me||sw.to===me) && sw.status==='Approved')out.push({id:'info-approved-'+sw.id,severity:'yellow',action:false,title:'Swap approved',text:`${from} → ${to} · ${sw.day} ${sw.shift}`,target:{kind:'swap',id:sw.id,day:sw.day,from:sw.from}});
      else if((sw.from===me||sw.to===me) && sw.status==='Rejected')out.push({id:'info-rejected-'+sw.id,severity:'yellow',action:false,title:'Swap rejected',text:`${from} → ${to} · ${sw.day} ${sw.shift}`,target:{kind:'swap',id:sw.id,day:sw.day,from:sw.from}});
      else if(sw.status==='Waiting' && sw.from!==me)out.push({id:'info-open-emp-'+sw.id,severity:'yellow',action:false,title:'Open shift available',text:`${from} offered ${sw.day} ${sw.shift}`,target:{kind:'swap',id:sw.id,day:sw.day,from:sw.from}});
    }
  });
  (data.notifications||[]).forEach(n=>{
    if(!n||!notificationAudience(n)) return;
    out.push({...n, action:false});
  });
  const seen=new Set();
  return out.filter(n=>{const k=notificationKey(n);if(seen.has(k))return false;seen.add(k);return true})
    .sort((a,b)=>(b.action===true)-(a.action===true)||(a.severity==='red'?-1:1)-(b.severity==='red'?-1:1)||(b.created||0)-(a.created||0))
    .slice(0,14);
}
function renderNotifications(){
  const btn=$('notifBtn'),badge=$('notifBadge'),redBadge=$('notifBadgeRed'),yellowBadge=$('notifBadgeYellow'),panel=$('notifPanel'); if(!btn||!panel)return;
  const list=derivedNotifications();
  const redCount=list.filter(n=>n.action&&n.severity==='red').length;
  const yellowCount=list.filter(n=>!(n.action&&n.severity==='red')&&!notifRead[notificationKey(n)]).length;
  if(badge){badge.textContent='';badge.className='notif-badge legacy-count';}
  if(redBadge){redBadge.textContent=redCount?String(redCount):'';redBadge.classList.toggle('show',!!redCount)}
  if(yellowBadge){yellowBadge.textContent=yellowCount?String(yellowCount):'';yellowBadge.classList.toggle('show',!!yellowCount)}
  btn.classList.toggle('has-items',!!(redCount+yellowCount));
  if(!notifOpen){panel.classList.remove('open');panel.innerHTML='';return;}
  panel.classList.add('open');
  panel.innerHTML=`<div class="notif-head"><strong>Notifications</strong><button onclick="markAllNotificationsRead(event)">Mark info read</button></div>`+(list.length?list.map(n=>notifItemHtml(n)).join(''):'<p class="muted notif-empty">No notifications.</p>');
}
function notifItemHtml(n){
  const key=notificationKey(n), unread=!n.action&&!notifRead[key];
  const cls=`notif-item ${n.severity||'yellow'} ${n.action?'action-needed':''} ${unread?'unread':'read'}`;
  let buttons='';
  if(n.buttons==='owner')buttons=`<div class="notif-actions"><button onclick="event.stopPropagation();approveSwap('${n.target.id}')">Approve</button><button class="danger" onclick="event.stopPropagation();rejectSwap('${n.target.id}')">Reject</button></div>`;
  if(n.buttons==='employee')buttons=`<div class="notif-actions"><button onclick="event.stopPropagation();employeeApproveSwap('${n.target.id}')">Accept</button><button class="danger" onclick="event.stopPropagation();employeeRejectSwap('${n.target.id}')">Decline</button></div>`;
  return `<div class="${cls}" onclick="openNotification('${esc(key)}')"><span class="notif-dot"></span><div><strong>${esc(n.title||'Notification')}</strong><small>${esc(n.text||'')}</small>${buttons}</div></div>`;
}
window.openNotification=(key)=>{
  notifRead[key]=true;window.DataAdapter.saveNotificationsRead(notifRead);
  const n=derivedNotifications().find(x=>notificationKey(x)===key);
  if(n?.target){
    if(n.target.from){selectedCalendarRow='emp:'+n.target.from;render();setTimeout(()=>scrollRowInsideCalendar(document.querySelector(`[data-rowkey="emp:${CSS.escape(n.target.from)}"]`)),20)}
    if(n.target.day){setMetricFilter(n.target.day)}
  }
  renderNotifications();
}
window.markAllNotificationsRead=(ev)=>{ev.stopPropagation();derivedNotifications().forEach(n=>{if(!n.action)notifRead[notificationKey(n)]=true});window.DataAdapter.saveNotificationsRead(notifRead);renderNotifications()}

function zoneDot(z){return `<span class="zone-dot" ${styleAttr(zoneStyle(z))}></span>`}

function rowsForWeeks(weeks){
  const rows=[];
  (weeks||[]).forEach(w=>rows.push(...snapshotRows(w)));
  return rows;
}
function setAnalyticsRange(r){
  // Legacy compatibility: old analytics buttons were removed, but some cleaned handlers still reference this.
  analyticsRange=r||analyticsRange||'week';
  if(typeof renderDashboard==='function')renderDashboard();
}


function getUrlWorkspaceId(){
  try{
    const params=new URLSearchParams(window.location.search||'');
    return params.get('workspace')||params.get('restaurant')||'';
  }catch{return '';}
}
function directWorkspaceFromHost(){
  const host=String(window.location.hostname||'').toLowerCase();
  if(!host || host==='localhost' || /^\d+\.\d+\.\d+\.\d+$/.test(host))return '';
  const parts=host.split('.').filter(Boolean);
  if(parts.length<3)return '';
  const sub=parts[0];
  if(['www','app','admin','portal','restostaff','preview'].includes(sub))return '';
  // Avoid treating Vercel preview deployment hostnames as restaurant slugs.
  if(host.endsWith('.vercel.app'))return '';
  return sub;
}
function requestedWorkspaceId(){
  const explicit=getUrlWorkspaceId();
  const hostSub=directWorkspaceFromHost();
  if(!explicit&&!hostSub)return '';
  const slug=slugifyWorkspace(explicit||hostSub);
  return WORKSPACE_ROUTE_ALIASES[slug]||slug;
}
function hasDirectWorkspaceRoute(){return !!requestedWorkspaceId();}
function isDevAccessUnlocked(){return window.DataAdapter.readPreference(DEV_GATE_KEY,'0')==='1'}
function setDevAccessUnlocked(value){return value?window.DataAdapter.savePreference(DEV_GATE_KEY,'1'):window.DataAdapter.remove(DEV_GATE_KEY)}
function showDevGate(){
  window.DataAdapter.setLoggedIn(false);
  document.body.classList.remove('logged-in','workspace-selecting','portal-selecting','terminal-mode','owner','employee');
  document.body.classList.add('logged-out','dev-gated');
  applyResponsiveMode();
  if($('workspace'))$('workspace').style.display='none';
  if($('login'))$('login').style.display='none';
  if($('devGate'))$('devGate').style.display='grid';
  const msg=$('devGateMessage'); if(msg)msg.textContent='';
  setTimeout(()=>($('devPassword')||$('devUsername'))?.focus?.(),0);
}
function loginDevGate(){
  const user=String($('devUsername')?.value||'').trim().toLowerCase();
  const pass=String($('devPassword')?.value||'').trim();
  const msg=$('devGateMessage');
  if(user!==DEV_GATE_USER || pass!==DEV_GATE_PASSWORD){
    if(msg)msg.textContent='Access denied.';
    window.RestoStaffBrandEntry?.signalDevGateError?.();
    return false;
  }
  setDevAccessUnlocked(true);
  if(msg)msg.textContent='';
  const requested=requestedWorkspaceId();
  if(requested&&window.DataAdapter.setWorkspaceId)window.DataAdapter.setWorkspaceId(requested);
  showRestaurantLogin();
  return true;
}
function logoutDevGate(){
  setDevAccessUnlocked(false);
  window.DataAdapter.setLoggedIn(false);
  showDevGate();
}
function showRestaurantLogin(){
  if(!isDevAccessUnlocked())return showDevGate();
  document.body.classList.remove('workspace-selecting','portal-selecting','dev-gated','logged-in','owner','employee','terminal-mode');
  document.body.classList.add('logged-out');
  if($('devGate'))$('devGate').style.display='none';
  if($('workspace'))$('workspace').style.display='none';
  load();
  populateRestaurantLoginSelect();
  fillSelectors();
  setLoginRole(loginRole||'employee');
  applyRestaurantBrand();
  updateRestaurantLoginCopy();
  window.RestoStaffBrandEntry?.renderEntryModules?.();
  if($('login'))$('login').style.display='grid';
  if($('accessPin'))$('accessPin').value='';
  if($('identityLoginName'))$('identityLoginName').value='';
  if($('loginPinHelp')){loginPinHelp.textContent='';loginPinHelp.classList.remove('error');}
  window.RestoStaffBrandEntry?.resetLoginState?.();
  setTimeout(()=>($('identityLoginName')||$('accessPin'))?.focus?.(),0);
}
function updateRestaurantLoginCopy(){
  if($('loginRestaurantName'))loginRestaurantName.textContent='Welcome back';
  if($('loginWorkspaceBadge'))loginWorkspaceBadge.textContent='Sign in to continue to your workspace.';
}
function populateRestaurantLoginSelect(){
  const select=$('restaurantLoginSelect');
  if(!select)return;
  workspaceCatalog=mergedWorkspaceList();
  const current=workspaceId();
  if(!workspaceCatalog.some(w=>w.id===current)){
    workspaceCatalog.unshift({id:current,status:'Workspace',restaurant:{name:data?.restaurant?.name||current,city:data?.restaurant?.city||'',ownerName:data?.restaurant?.ownerName||''}});
  }
  select.innerHTML=workspaceCatalog.map(w=>`<option value="${esc(w.id)}">${esc(workspaceNameFromMeta(w))}</option>`).join('');
  select.value=current;
}
function changeLoginWorkspace(idValue){
  const next=slugifyWorkspace(idValue||workspaceId());
  if(!next)return;
  if(window.DataAdapter.setWorkspaceId)window.DataAdapter.setWorkspaceId(next);
  window.DataAdapter.setLoggedIn(false);
  load();
  populateRestaurantLoginSelect();
  fillSelectors();
  setLoginRole(loginRole||'employee');
  applyRestaurantBrand();
  updateRestaurantLoginCopy();
  if($('identityLoginName'))identityLoginName.value='';
  if($('accessPin'))accessPin.value='';
  if($('loginPinHelp')){loginPinHelp.textContent='';loginPinHelp.classList.remove('error');}
  window.RestoStaffBrandEntry?.resetLoginState?.();
  setTimeout(()=>($('identityLoginName')||$('accessPin'))?.focus?.(),0);
}
function normalizeLoginIdentity(value){return String(value||'').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/\s+/g,' ')}
function resolveLoginIdentity(){
  const raw=String($('identityLoginName')?.value||$('ownerLoginName')?.value||'').trim();
  const pin=sanitizePin($('accessPin')?.value||'');
  const help=$('loginPinHelp');
  const fail=message=>{if(help){help.textContent=message;help.classList.add('error');}window.RestoStaffBrandEntry?.signalLoginError?.(message);return null;};
  if(help){help.textContent='';help.classList.remove('error');}
  if(!raw)return fail('Enter your name.');
  if(!pin)return fail('Enter your password or PIN.');
  const key=normalizeLoginIdentity(raw);
  const ownerKey=normalizeLoginIdentity(restaurantOwnerName());
  const ownerAliases=new Set([ownerKey,'owner','manager','admin','administrator'].filter(Boolean));
  const employees=activeEmployees();
  const employee=employees.find(e=>{
    const full=normalizeLoginIdentity(e.name);
    const first=normalizeLoginIdentity(String(e.name||'').split(/\s+/)[0]);
    return key===full || (first && key===first) || key===normalizeLoginIdentity(e.id);
  });
  if(employee){
    const needed=sanitizePin(employee.pin||PROTOTYPE_PIN);
    if(pin!==needed)return fail('Wrong password or PIN.');
    return {role:'employee',employeeId:employee.id};
  }
  if(ownerAliases.has(key)){
    if(pin!==PROTOTYPE_PIN)return fail('Wrong password or PIN.');
    return {role:'owner',employeeId:employees[0]?.id||data.employees?.[0]?.id||null};
  }
  return fail('Name not found for this workspace.');
}
function validateRestaurantPin(){return !!resolveLoginIdentity()}
function enterSelectedWorkspace(){
  const identity=resolveLoginIdentity();
  if(!identity)return;
  loginRole=identity.role;
  session.role=identity.role;
  session.employeeId=identity.employeeId;
  if($('employeeLogin'))employeeLogin.value=session.employeeId||'';
  window.RestoStaffBrandEntry?.signalLoginSuccess?.();
  window.DataAdapter.setLoggedIn(true);
  const finish=()=>{save();enterApp(true);};
  if(window.RestoStaffBrandEntry?.shouldDelayEntry?.())setTimeout(finish,180);
  else finish();
}
function defaultWorkspaceCards(){
  return [
    {id:'bouillon-bruxelles',status:'Pilot',restaurant:{name:'Bouillon Bruxelles',ownerName:'Xavier',city:'Brussels',accentColor:'#9b1734'}},
    {id:'demo-restaurant',status:'Demo',restaurant:{name:'Demo Restaurant',ownerName:'Demo Manager',city:'Brussels',accentColor:'#7c3aed'}}
  ];
}
function workspaceNameFromMeta(w){return (w?.restaurant?.name||w?.name||w?.id||'Restaurant').trim()||'Restaurant'}
function workspaceOwnerFromMeta(w){return (w?.restaurant?.ownerName||w?.ownerName||'Manager').trim()||'Manager'}
function workspaceCityFromMeta(w){return (w?.restaurant?.city||w?.city||'').trim()}
function workspaceAccentFromMeta(w){return normalizeHexColor(w?.restaurant?.accentColor||w?.accentColor)||'#9b1734'}
function mergedWorkspaceList(){
  const byId={};
  defaultWorkspaceCards().forEach(w=>byId[w.id]=clone(w));
  readLocalWorkspaceCatalog().forEach(w=>{if(w?.id)byId[w.id]=Object.assign({},byId[w.id]||{},w,{restaurant:Object.assign({},byId[w.id]?.restaurant||{},w.restaurant||{})})});
  if(window.DataAdapter.listWorkspaces){
    try{
      window.DataAdapter.listWorkspaces().forEach(w=>{
        if(!w?.id)return;
        if(w.id==='main'){
          byId['bouillon-bruxelles']=Object.assign({},byId['bouillon-bruxelles']||{},w,{id:'bouillon-bruxelles',status:'Pilot',legacyId:'main',restaurant:Object.assign({},byId['bouillon-bruxelles']?.restaurant||{},w.restaurant||{})});
          return;
        }
        byId[w.id]=Object.assign({},byId[w.id]||{},w,{restaurant:Object.assign({},byId[w.id]?.restaurant||{},w.restaurant||{})});
      });
    }catch{}
  }
  return Object.values(byId).sort((a,b)=>{
    const weight=id=>id==='bouillon-bruxelles'?0:id==='demo-restaurant'?1:2;
    return weight(a.id)-weight(b.id)||workspaceNameFromMeta(a).localeCompare(workspaceNameFromMeta(b));
  });
}
function renderWorkspaceSelector(){
  const el=$('workspaceCards'); if(!el)return;
  workspaceCatalog=mergedWorkspaceList();
  const current=workspaceId();
  el.innerHTML=workspaceCatalog.map(w=>{
    const accent=workspaceAccentFromMeta(w), city=workspaceCityFromMeta(w), owner=workspaceOwnerFromMeta(w), name=workspaceNameFromMeta(w);
    const counts=w.counts||{};
    const meta=[city, owner&&owner!=='Manager'?`Managed by ${owner}`:''].filter(Boolean).join(' · ');
    return `<button type="button" class="workspace-card ${w.id===current?'active':''}" onclick="selectWorkspace('${esc(w.id)}')" style="--workspace-accent:${esc(accent)}"><span class="workspace-card-mark">${esc(name.charAt(0).toUpperCase())}</span><span class="workspace-card-main"><strong>${esc(name)}</strong><small>${esc(meta||w.id)}</small><span class="workspace-card-stats"><em>${esc(w.status||'Workspace')}</em><em>${Number(counts.employees||0)} employees</em><em>${Number(counts.zones||0)} zones</em></span></span></button>`;
  }).join('');
}
function showWorkspaceSelector(){
  // v181: the old card selector stays removed; access now uses a compact restaurant dropdown.
  if(!isDevAccessUnlocked())return showDevGate();
  const requested=requestedWorkspaceId();
  if(requested&&window.DataAdapter.setWorkspaceId)window.DataAdapter.setWorkspaceId(requested);
  showRestaurantLogin();
}
window.selectWorkspace=(idValue)=>{
  if(window.DataAdapter.setWorkspaceId)window.DataAdapter.setWorkspaceId(idValue);
  showRestaurantLogin();
};


function isTimeClockTerminalMode(){
  try{return new URLSearchParams(window.location.search).get('terminal')==='1' || window.location.hash==='#terminal'}catch{return window.location.hash==='#terminal'}
}
function terminalPlannerUrl(){
  const url=new URL(window.location.href);
  url.searchParams.delete('terminal');
  if(url.hash==='#terminal')url.hash='';
  return url.toString();
}
function terminalUrl(){
  const url=new URL(window.location.href);
  url.searchParams.set('terminal','1');
  url.hash='';
  return url.toString();
}
function enterTerminalMode(){
  document.body.classList.remove('logged-in','logged-out','workspace-selecting','portal-selecting','dev-gated','owner','employee');
  document.body.classList.add('terminal-mode');
  if($('devGate'))$('devGate').style.display='none';
  if($('workspace'))$('workspace').style.display='none';
  if($('login'))$('login').style.display='none';
  applyResponsiveMode();
  applyRestaurantBrand();
  renderTimeClock();
}
window.openTimeClockTerminal=()=>{
  const href=terminalUrl();
  const win=window.open(href,'_blank');
  if(win){
    try{win.opener=null}catch{}
    win.focus&&win.focus();
  }else{
    alert('Popup blocked. Please allow popups for this site to open the Time Clock terminal.');
  }
};
window.exitTimeClockTerminal=()=>{window.location.href=terminalPlannerUrl();};

function init(){applyResponsiveMode();showZeroRows=window.DataAdapter.readPreference(window.DataAdapter.KEYS.showZeroRows,'1')!=='0';notifRead=window.DataAdapter.readNotificationsRead();bind();if(!isDevAccessUnlocked()){showDevGate();updateStickyVars();return;}const requested=requestedWorkspaceId();if(requested&&window.DataAdapter.setWorkspaceId)window.DataAdapter.setWorkspaceId(requested);if(isTimeClockTerminalMode()){load();fillSelectors();enterTerminalMode();render();}else if(window.DataAdapter.isLoggedIn()){load();fillSelectors();enterApp(false);render();}else if(requested){showRestaurantLogin();}else{showWorkspaceSelector();}updateStickyVars()}
function bind(){roleEmployee.onclick=()=>setLoginRole('employee');roleOwner.onclick=()=>setLoginRole('owner');if($('notifBtn'))notifBtn.onclick=(e)=>{e.stopPropagation();notifOpen=!notifOpen;renderNotifications()};document.addEventListener('click',e=>{if(!e.target.closest('.notif-wrap')){notifOpen=false;renderNotifications()}if(!e.target.closest('.metric-detail-panel')&&!e.target.closest('.metric-card')&&!e.target.closest('.position-metric-card')&&!e.target.closest('.zone-metric-card')&&!e.target.closest('.metric-chip')&&!e.target.closest('.position-total')&&!e.target.closest('.zone-total'))clearMetricPanel();});enterBtn.onclick=enterSelectedWorkspace;if($('accessPin'))accessPin.addEventListener('keydown',e=>{if(e.key==='Enter')enterSelectedWorkspace()});if($('identityLoginName'))identityLoginName.addEventListener('keydown',e=>{if(e.key==='Enter')enterSelectedWorkspace()});if($('devLoginBtn'))devLoginBtn.onclick=loginDevGate;if($('devPassword'))devPassword.addEventListener('keydown',e=>{if(e.key==='Enter')loginDevGate()});if($('devUsername'))devUsername.addEventListener('keydown',e=>{if(e.key==='Enter')loginDevGate()});if($('devLogoutBtn'))devLogoutBtn.onclick=logoutDevGate;if($('restaurantLoginSelect'))restaurantLoginSelect.onchange=e=>changeLoginWorkspace(e.target.value);switchBtn.onclick=()=>{window.DataAdapter.setLoggedIn(false);showRestaurantLogin()};document.querySelectorAll('.nav').forEach(b=>b.onclick=()=>showPage(b.dataset.page));document.querySelectorAll('[data-employee-page]').forEach(b=>b.onclick=()=>showPage(b.dataset.employeePage));document.querySelectorAll('.tabs button').forEach(b=>b.onclick=()=>showTab(b.dataset.tab));prevWeek.onclick=()=>changeWeek(-7);nextWeek.onclick=()=>changeWeek(7);weekStart.onchange=()=>{saveWeekSnapshot();data.weekStart=monday(weekStart.value);loadWeekSnapshot();save();render()};employeeSelect.onchange=()=>{session.employeeId=employeeSelect.value;save();render()};submitAvailability.onclick=()=>{data.submitted[selectedId()]=true;let e=emp(selectedId());addNotification('availability-'+data.weekStart+'-'+selectedId(),'yellow','Availability submitted',`${e?.name||'Employee'} submitted availability for this week.`,{kind:'submission',id:selectedId()});save();render();alert('Availability submitted.')};clearMine.onclick=clearMyDraft;publishToggleBtn.onclick=togglePublish;copyLastWeek.onclick=copyPreviousWeek;messageBtn.onclick=openMessage;copySchedule.onclick=openMessage;if($('ownerCopySchedule'))ownerCopySchedule.onclick=openMessage;copyMessage.onclick=()=>navigator.clipboard.writeText(messageText.value).then(()=>alert('Copied.'));closeMessage.onclick=()=>messageDialog.close();printBtn.onclick=()=>print();if($('ownerPrintBtn'))ownerPrintBtn.onclick=()=>print();if($('toggleZeroRows'))toggleZeroRows.onclick=toggleZeroRowsFn;if($('ownerToggleZeroRows'))ownerToggleZeroRows.onclick=toggleZeroRowsFn;exportBtn.onclick=exportBackup;importInput.onchange=importBackup;addEmployee.onclick=addEmployeeFn;if($('addPositionBtn'))addPositionBtn.onclick=addPositionFn;if($('addZoneBtn'))addZoneBtn.onclick=addZoneFn;if($('openSetupWizard'))$('openSetupWizard').onclick=()=>openSetupWizard('edit');if($('backToWorkspaces'))backToWorkspaces.onclick=showWorkspaceSelector;if($('switchWorkspaceBtn'))switchWorkspaceBtn.onclick=()=>{window.DataAdapter.setLoggedIn(false);showRestaurantLogin()};if($('themeToggleBtn'))themeToggleBtn.onclick=toggleAppTheme;document.querySelectorAll('.analytics-controls .segmented button[data-range]').forEach(b=>b.onclick=()=>setAnalyticsRange(b.dataset.range));document.querySelectorAll('.metric-filter').forEach(sel=>sel.onchange=e=>setMetricFilter(e.target.value));document.querySelectorAll('.metric-day-btn').forEach(btn=>btn.onclick=()=>setMetricFilter(btn.dataset.metric));confirmSwap.onclick=confirmSwapFn;cancelSwap.onclick=()=>swapDialog.close();if($('saveZoneDialog'))saveZoneDialog.onclick=saveZoneDialogFn;if($('cancelZoneDialog'))cancelZoneDialog.onclick=()=>{pendingZone=null;zoneDialog.close()};if($('closeDayNote'))closeDayNote.onclick=()=>dayNoteDialog.close()}
function applyResponsiveMode(){const isPhone=window.matchMedia('(max-width: 980px)').matches;document.body.classList.toggle('phone',isPhone);document.body.classList.toggle('desktop',!isPhone);updateStickyVars()}
window.addEventListener('resize',()=>{applyResponsiveMode();requestAnimationFrame(updateStickyVars)});
function setLoginRole(role){loginRole=role;roleEmployee.classList.toggle('active',role==='employee');roleOwner.classList.toggle('active',role==='owner');if($('employeeLoginWrap'))employeeLoginWrap.style.display=role==='employee'?'grid':'none';if($('ownerLoginWrap'))ownerLoginWrap.style.display=role==='owner'?'grid':'none';if($('ownerLoginName') && !ownerLoginName.value){ownerLoginName.value=restaurantOwnerName();ownerLoginName.dataset.autofill='1';}if($('loginPinHelp')){loginPinHelp.textContent='';loginPinHelp.classList.remove('error');}if($('accessPin'))accessPin.value=''}
function enterApp(goHome){document.body.classList.remove('logged-out','workspace-selecting','portal-selecting','dev-gated','terminal-mode');document.body.classList.add('logged-in');if($('devGate'))$('devGate').style.display='none';if($('workspace'))$('workspace').style.display='none';$('login').style.display='none';applyRestaurantBrand();document.body.classList.toggle('owner',session.role==='owner');document.body.classList.toggle('employee',session.role==='employee');fillSelectors();const defaultPage=session.role==='owner'?'owner':'my-schedule';const activePage=document.querySelector('.page.active');if(goHome||!activePage||(session.role==='owner'&&activePage.id!=='page-owner')||(session.role==='employee'&&activePage.id!=='page-my-schedule'))showPage(defaultPage);if(session.role==='owner'&&!document.querySelector('.tab.active'))showTab('planning');render();updateStickyVars()}
function fillSelectors(){
  const employees=activeEmployees();
  const opts=employees.map(e=>`<option value="${e.id}">${esc(e.name)}</option>`).join('');
  const loginSel=$('employeeLogin'), ownerLogin=$('ownerLoginName'), employeeSel=$('employeeSelect'), positionSel=$('newPosition'), timeClockSel=$('timeClockEmployee');
  if(!employees.some(e=>e.id===session.employeeId)) session.employeeId=employees[0]?.id||'';
  if(!employees.some(e=>e.id===timeClockEmployeeId)) timeClockEmployeeId='';
  if(loginSel){loginSel.innerHTML=opts;loginSel.value=session.employeeId||'';}
  if(ownerLogin && (!ownerLogin.value || ownerLogin.dataset.autofill==='1')){ownerLogin.value=restaurantOwnerName();ownerLogin.dataset.autofill='1';}
  if(employeeSel){employeeSel.innerHTML=opts;employeeSel.value=session.employeeId||'';}
  if(timeClockSel){timeClockSel.innerHTML=opts;timeClockSel.value=timeClockEmployeeId||'';}
  if(positionSel){positionSel.innerHTML=positions.map(p=>`<option>${esc(p)}</option>`).join('');}
}
function employeeHasFullPlannerAccess(employeeId=session.employeeId){const e=emp(employeeId);return !!(e&&e.managerAccess)}
function updateEmployeePageTabs(){
  const can=session.role==='employee'&&employeeHasFullPlannerAccess();
  document.body.classList.toggle('employee-manager-access',!!can);
  const active=document.querySelector('.page.active')?.id?.replace('page-','')||'';
  document.querySelectorAll('[data-employee-page]').forEach(b=>b.classList.toggle('active',b.dataset.employeePage===active));
}
function showPage(p){if(session.role==='employee'&&p==='published'&&!employeeHasFullPlannerAccess())p='my-schedule';const page=$('page-'+p);if(!page)return;document.querySelectorAll('.page').forEach(x=>x.classList.remove('active'));page.classList.add('active');document.querySelectorAll('.nav').forEach(b=>b.classList.toggle('active',b.dataset.page===p));updateEmployeePageTabs();updateAppTitle();updatePlanningMode();requestAnimationFrame(updateStickyVars)}
function renderTimeClockView(){const tab=$('tab-timeclock');if(!tab)return;tab.querySelectorAll('[data-timeclock-view]').forEach(el=>el.classList.toggle('active',el.dataset.timeclockView===timeClockView));tab.classList.toggle('timeclock-hub-mode',timeClockView==='hub');requestAnimationFrame(updateStickyVars)}
window.setTimeClockView=view=>{timeClockView=view||'hub';renderTimeClockView()};
function showTab(t){document.querySelectorAll('.tab').forEach(x=>x.classList.remove('active'));$('tab-'+t).classList.add('active');document.querySelectorAll('.tabs button').forEach(b=>b.classList.toggle('active',b.dataset.tab===t));if(t==='timeclock'){timeClockView='hub';renderTimeClockView()}updateAppTitle();updatePlanningMode();requestAnimationFrame(updateStickyVars)}
function updateAppTitle(){if(!$('appTitle'))return; if(session.role==='employee'){const active=document.querySelector('.page.active')?.id;appTitle.textContent=active==='page-published'?'Full Planner':'My Schedule'; return;} const active=document.querySelector('.tabs button.active'); appTitle.textContent=active?active.textContent:'Planning'}
function toggleAppTheme(){if(!data)return;data.restaurant=data.restaurant||{};data.restaurant.theme=nextAppTheme();applyAppTheme();save();render();}
function updatePlanningMode(){
  const myScheduleActive=document.getElementById('page-my-schedule')?.classList.contains('active');
  const publishedActive=document.getElementById('page-published')?.classList.contains('active');
  const ownerPlanning=document.getElementById('page-owner')?.classList.contains('active') && document.getElementById('tab-planning')?.classList.contains('active');
  document.body.classList.toggle('planning-mode', !!(publishedActive || ownerPlanning));
  document.body.classList.toggle('my-schedule-mode', !!(session.role==='employee'&&myScheduleActive));
  updateEmployeePageTabs();
}

function setStickyCssVar(name,value){
  document.documentElement.style.setProperty(name,value);
  if(document.body) document.body.style.setProperty(name,value);
}
function updateStickyVars(){
  if(!document.body.classList.contains('logged-in'))return;
  const top=document.querySelector('.topbar');
  const toolbar=document.querySelector('.planner-toolbar');
  const th=top?Math.ceil(top.getBoundingClientRect().height):96;
  const bh=toolbar?Math.ceil(toolbar.getBoundingClientRect().height):58;
  const isPhone=document.body.classList.contains('phone') || window.matchMedia('(max-width: 980px)').matches;
  const shell=isPhone?0:(th+bh);
  setStickyCssVar('--topbar-h', th+'px');
  setStickyCssVar('--toolbar-h', bh+'px');
  setStickyCssVar('--metrics-h', '0px');
  setStickyCssVar('--metrics-top', shell+'px');
  setStickyCssVar('--sticky-shell-h', shell+'px');
  setStickyCssVar('--calendar-sticky-top', shell+'px');
}
window.addEventListener('resize',()=>requestAnimationFrame(updateStickyVars));
window.addEventListener('orientationchange',()=>requestAnimationFrame(updateStickyVars));
window.addEventListener('load',()=>requestAnimationFrame(updateStickyVars));
if('ResizeObserver' in window){
  const stickyObserver=new ResizeObserver(()=>requestAnimationFrame(updateStickyVars));
  window.addEventListener('load',()=>{
    ['.topbar','.planner-toolbar','.page.active .calendar-top-metrics'].forEach(sel=>{const el=document.querySelector(sel); if(el) stickyObserver.observe(el);});
  });
}


function shortDisplayDate(iso){const d=parseISO(iso);return d.toLocaleDateString('en-GB',{day:'2-digit',month:'2-digit'});}
function displayTimeRange(range=''){return String(range||'').replace(/\s*-\s*/,'–')}
function weekDisplayRange(){return `${shortDisplayDate(data.weekStart)} – ${shortDisplayDate(addDays(data.weekStart,6))}`}
// Employee My Schedule renderer lives in assets/js/employee-schedule.js.

function render(){if(!data)return;applyRestaurantBrand();fillSelectors();weekStart.value=data.weekStart;let who=session.role==='owner'?restaurantOwnerName():(emp(session.employeeId)?.name||'Employee');userPill.textContent=who;updateAppTitle();updatePlanningMode();
  if($('statusBadge')){statusBadge.textContent=data.status;statusBadge.className='badge '+data.status.toLowerCase();}
  if($('statusText'))statusText.textContent=data.status==='Published'?'Published – changes via owner-approved swaps only.':'Unpublished draft – owner can edit the week.';
  if($('publishedBanner')){publishedBanner.className='banner';publishedBanner.textContent='';}
  if($('publishedStatusIcon')){publishedStatusIcon.textContent=data.status==='Published'?'Published':'Draft';publishedStatusIcon.title=data.status==='Published'?'Published: employees can request swaps; owner approval required.':'Draft: employees can mark availability; owner can edit planning.';publishedStatusIcon.className='status-chip '+(data.status==='Published'?'published':'draft');} if($('ownerStatusChip')){ownerStatusChip.textContent=data.status==='Published'?'Published':'Draft';ownerStatusChip.title=data.status==='Published'?'Published: swaps need owner approval.':'Draft: employees can still fill availability.';ownerStatusChip.className='status-chip '+(data.status==='Published'?'published':'draft');}
  document.querySelectorAll('.metric-filter').forEach(sel=>sel.value=metricFilter);document.querySelectorAll('.metric-day-btn').forEach(btn=>btn.classList.toggle('active',btn.dataset.metric===metricFilter));document.querySelectorAll('.toggle-zero').forEach(b=>{b.classList.toggle('active',!showZeroRows);b.innerHTML=showZeroRows?uiIconSvg('eyeOff'):uiIconSvg('eye');b.title=showZeroRows?'Hide employees with 0 hours':'Show all employees';b.setAttribute('aria-label', b.title);});
  if($('publishToggleBtn')){publishToggleBtn.innerHTML=data.status==='Published'?uiIconSvg('undo'):uiIconSvg('check');publishToggleBtn.className=data.status==='Published'?'secondary icon-action publish-control':'primary icon-action publish-control';publishToggleBtn.title=data.status==='Published'?'Unpublish schedule':'Publish schedule';publishToggleBtn.setAttribute('aria-label', publishToggleBtn.title)};renderMySchedule();publishedCalendar.innerHTML=calendar(session.role==='employee'?'employee':'published');employeeCalendar.innerHTML=calendar('employee');ownerCalendar.innerHTML=calendar('owner');[publishedCalendar,employeeCalendar,ownerCalendar].forEach(el=>{if(el)el.classList.toggle('published-calendar',data.status==='Published')});renderNotes('publishedNotes',false);renderNotes('employeeNotes',false);renderNotes('ownerNotes',true);renderZones('publishedZones');renderZones('employeeZones');renderSwaps();if($('publishedEmployeeSwaps')) $('publishedEmployeeSwaps').innerHTML=swapCards('employee');renderSubmissions();renderEmployeeManager();renderZoneManager();renderSetupSummary();renderWorkspaceInfo();renderTimeClock();renderInventory();renderDailyClose();renderForecast();renderTeamHR();renderCosts();renderPositionHours('ownerPositionHours');renderPositionHours('publishedPositionHours');renderPositionHours('employeePositionHours');renderZoneHours('ownerZoneHours');renderZoneHours('publishedZoneHours');renderZoneHours('employeeZoneHours');renderNotifications();requestAnimationFrame(updateStickyVars)}
function hasAnyAvailability(employeeId){return days.some(d=>shifts.some(s=>!!data.availability?.[employeeId]?.[d]?.[s]))}
function submissionIcon(employeeId){
  const submitted=!!data.submitted?.[employeeId];
  const partial=!submitted && hasAnyAvailability(employeeId);
  const cls=submitted?'submitted':partial?'partial':'missing';
  const label=submitted?'Submitted availability':partial?'Availability started, not submitted':'No availability submitted';
  const symbol=submitted?'✓':partial?'•':'○';
  return ` <span class="submit-dot ${cls}" title="${label}">${symbol}</span>`;
}


function toggleZeroRowsFn(){
  showZeroRows=!showZeroRows;
  window.DataAdapter.savePreference(window.DataAdapter.KEYS.showZeroRows, showZeroRows?'1':'0');
  render();
}
function employeeWeekTotal(e){return days.reduce((sum,d)=>sum+shifts.reduce((s,sh)=>s+slotHours(e,d,sh),0),0)}
function hasDayNote(d){return shifts.some(s=>String(data.notes?.[d]?.[s]||'').trim().length>0)}

function calendar(mode){
  let list=activeEmployees();
  // Employees with planned hours appear first. 0h rows can be hidden for cleaner export/printing.
  list=[...list].sort((a,b)=>{
    let tb=employeeWeekTotal(b), ta=employeeWeekTotal(a);
    if((tb>0)!==(ta>0)) return (tb>0)-(ta>0);
    return positionIndex(a.position)-positionIndex(b.position)||String(a.name).localeCompare(String(b.name));
  });
  if(!showZeroRows) list=list.filter(e=>employeeWeekTotal(e)>0 || (mode==='employee'&&e.id===session.employeeId));
  if(mode==='employee'&&session.employeeId){let mine=list.find(e=>e.id===session.employeeId);list=mine?[mine,...list.filter(e=>e.id!==session.employeeId)]:list}
  let colTotals={}; let posTotals={}; let zoneTotals={};
  let colPeople={}, dayPeople={}, weekPeople=new Set();
  days.forEach(d=>{dayPeople[d]=new Set(); shifts.forEach(s=>{colTotals[`${d}-${s}`]=0; colPeople[`${d}-${s}`]=new Set();});});
  let rows=list.map(e=>{
    let isYou=mode==='employee'&&session.role==='employee'&&e.id===session.employeeId;
    let rowTotal=0;
    let cells=days.map(d=>shifts.map(sh=>{
      let h=slotHours(e,d,sh); rowTotal+=h; colTotals[`${d}-${sh}`]+=h;
      if(h){colPeople[`${d}-${sh}`].add(e.id); dayPeople[d].add(e.id); weekPeople.add(e.id);}
      let p=cleanPositionName(e.position); posTotals[p]=posTotals[p]||{}; posTotals[p][`${d}-${sh}`]=(posTotals[p][`${d}-${sh}`]||0)+h;
      if(h){let z=data.assignments[e.id]?.[d]?.[sh]||suggestZone(e,sh)||'Unassigned'; zoneTotals[z]=zoneTotals[z]||{}; zoneTotals[z][`${d}-${sh}`]=(zoneTotals[z][`${d}-${sh}`]||0)+h;}
      return slot(e,d,sh,mode)
    }).join('')).join('');
    let rk='emp:'+e.id;
    let ownerStatus=mode==='owner'?submissionIcon(e.id):'';
    return `<tr class="calendar-row ${selectedCalendarRow===rk?'row-selected':''} ${metricFocus&&metricFocus.kind==='position'&&cleanPositionName(e.position)===cleanPositionName(metricFocus.value)?'metric-row-focus':''}" ${rowClickAttr(rk)}><td class="person ${isYou?'current-user':''}"><div class="person-name">${ownerStatus}${esc(e.name)}${isYou?' <span class="you">You</span>':''}</div><div class="person-position">${esc(e.position)}</div></td>${cells}<td class="total total-cell"><strong>${fmtHours(rowTotal)}</strong></td></tr>`
  }).join('');
  let grand=Object.values(colTotals).reduce((a,b)=>a+b,0);
  let header='<table class="cal-table"><thead><tr><th class="person">Employee</th>'+days.map((d,di)=>{
    let dayTotal=shifts.reduce((sum,sh)=>sum+(colTotals[`${d}-${sh}`]||0),0);
    return `<th class="day-group ${di%2?'day-alt':'day-base'} day-start" colspan="2"><div class="day-title"><span class="day-left"><strong>${d.slice(0,3)}</strong><small>${dateForDay(d)}</small></span><span class="day-total-inline">${fmtHours(dayTotal)} <em>${fmtPeople(dayPeople[d].size)}</em></span><button class="note-icon ${hasDayNote(d)?'has-note':''}" title="Shift notes" onclick="event.stopPropagation();openDayNote('${d}')">i</button></div></th>`
  }).join('')+'<th class="total total-head">Week</th></tr><tr><th class="person">Position</th>'+days.map((d,di)=>shifts.map(s=>`<th class="day-group ${di%2?'day-alt':'day-base'} ${s==='Lunch'?'day-start':''}"><span class="shift-head-label">${s}</span><span class="shift-head-hours">${fmtHours(colTotals[`${d}-${s}`])} <em>${fmtPeople(colPeople[`${d}-${s}`].size)}</em></span></th>`).join('')).join('')+`<th class="total total-head week-total-head">${fmtHours(grand)}</th></tr></thead><tbody>`;
  let orderedPositions=[...positions,...Object.keys(posTotals).filter(p=>!positions.includes(p))];
  let positionRows=orderedPositions.map(p=>{let total=0;let ps=positionStyle(p);let rk='pos:'+p;let cells=days.map((d,di)=>shifts.map(sh=>{let h=(posTotals[p]||{})[`${d}-${sh}`]||0;total+=h;return `<td class="total-cell position-subtotal ${positionClass(p)} ${di%2?'day-alt':'day-base'} ${sh==='Lunch'?'day-start':''}" ${styleAttr(ps)}><strong>${fmtHours(h)}</strong></td>`}).join('')).join('');return `<tr class="position-total-row calendar-row ${(selectedCalendarRow===rk||(metricFocus&&metricFocus.kind==='position'&&cleanPositionName(metricFocus.value)===cleanPositionName(p)))?'row-selected':''}" ${rowClickAttr(rk)}><td class="person" ${styleAttr(ps)}><span class="row-kind position-kind">WHO</span><strong>${esc(p)}</strong></td>${cells}<td class="total total-cell" ${styleAttr(ps)}><strong>${fmtHours(total)}</strong></td></tr>`}).join('');
  let orderedZones=zoneRules.map(z=>z.zone).filter((z,i,a)=>z&&a.indexOf(z)===i).concat(Object.keys(zoneTotals).filter(z=>!zoneRules.some(r=>r.zone===z)));
  let zoneRows=orderedZones.map(z=>{let total=0;let zs=zoneStyle(z);let cells=days.map((d,di)=>shifts.map(sh=>{let h=(zoneTotals[z]||{})[`${d}-${sh}`]||0;total+=h;return `<td class="total-cell zone-subtotal ${di%2?'day-alt':'day-base'} ${sh==='Lunch'?'day-start':''}" ${styleAttr(zs)}><strong>${fmtHours(h)}</strong></td>`}).join('')).join('');return `<tr class="zone-total-row calendar-row ${zoneClass(z)} ${(selectedCalendarRow==='zone:'+z||(metricFocus&&metricFocus.kind==='zone'&&metricFocus.value===z))?'row-selected':''}" ${rowClickAttr('zone:'+z)}><td class="person" ${styleAttr(zs)}><span class="row-kind zone-kind">WHERE</span><strong>${zoneDot(z)}${esc(z)}</strong></td>${cells}<td class="total total-cell" ${styleAttr(zs)}><strong>${fmtHours(total)}</strong></td></tr>`}).join('');
  return header+rows+positionRows+zoneRows+'</tbody></table>'
}

function swapFor(employeeId, day, shift){
  return (data.swaps||[]).find(sw => sw.from===employeeId && sw.day===day && sw.shift===shift && sw.status!=='Rejected') || null;
}

function positionClass(position=''){
  let p=String(position).toLowerCase();
  if(p.includes('maitre'))return 'pos-maitre';
  if(p.includes('chef'))return 'pos-chef';
  if(p.includes('barman'))return 'pos-barman';
  if(p.includes('extra')||p.includes('student')||p.includes('flexi'))return 'pos-extra';
  return 'pos-other';
}
function zoneClass(zone=''){
  let z=String(zone).toLowerCase();
  if(z.includes('ac')||z.includes('accueil'))return 'zone-accent-ac';
  if(z.includes('dom'))return 'zone-accent-dom';
  if(z.includes('ilot'))return 'zone-accent-ilot';
  if(z.includes('bar'))return 'zone-accent-bar';
  if(z.includes('pass'))return 'zone-accent-pass';
  if(z.includes('sch'))return 'zone-accent-sch';
  if(z.includes('bouil'))return 'zone-accent-bouil';
  return 'zone-accent-other';
}
function slot(e,d,s,mode){
  let avail=data.availability[e.id]?.[d]?.[s],zone=data.assignments[e.id]?.[d]?.[s]||'';
  let displayZone=zone||suggestZone(e,s);
  let assigned=avail&&data.status==='Published';
  let own=e.id===session.employeeId;
  let sw=swapFor(e.id,d,s);
  let ownerDraft=mode==='owner'&&data.status!=='Published';
  let cls=['slot',avail?'available':'empty',assigned?'assigned':'',ownerDraft?'owner-editable':'',data.status==='Published'?'is-published':'',avail?positionClass(e.position):'',avail?zoneClass(displayZone):'',metricFocus&&metricFocus.kind==='zone'&&displayZone===metricFocus.value&&avail?'metric-slot-focus':''].join(' ');
  let slotStyle=avail?positionStyle(e.position)+';'+zoneStyle(displayZone):'';
  let status=sw?`<span class="tag ${sw.status.toLowerCase()}">${sw.status}${sw.to?': '+esc(emp(sw.to)?.name||''):' → Anyone'}</span>`:'';
  let click=`onclick="slotClick('${e.id}','${d}','${s}','${mode}')"`;
  let zoneOptions=zoneRules.map(z=>`<option value="${esc(z.zone)}" ${displayZone===z.zone?'selected':''} title="${esc(z.zone)} · ${esc(z.role)}">${esc(z.zone)}</option>`).join('');
  let zoneControl=mode==='owner'&&avail?`<div class="zone native-zone-wrap ${zoneClass(displayZone)}" title="Change zone" onclick="event.stopPropagation()"><span class="zone-display">${zoneDot(displayZone)}${esc(displayZone)}</span><select class="zone-inline-native" aria-label="Change zone" onchange="updateSlotZone('${e.id}','${d}','${s}',this.value)" onclick="event.stopPropagation()">${zoneOptions}</select></div>`:'';
  let timeControl=mode==='owner'&&avail?`<input class="time-inline" value="${esc(timeRangeFor(e,d,s))}" title="Custom time for this employee/day/shift" onchange="updateSlotTime('${e.id}','${d}','${s}',this.value)" onclick="event.stopPropagation()">`:'';
  let emptyLabel='Unavailable';
  let content=avail?`<div class="name">${esc(e.name)}</div>${mode==='owner'?zoneControl:`<div class="zone">${zoneDot(displayZone)}${esc(displayZone)}</div>`}${mode==='owner'?timeControl:`<div class="meta">${esc(timeRangeFor(e,d,s))}</div>`}`:`<div class="empty-label">${emptyLabel}</div>`;
  let di=days.indexOf(d);
  return `<td class="${di%2?'day-alt':'day-base'} ${s==='Lunch'?'day-start':''}"><div class="${cls}" ${styleAttr(slotStyle)} ${click}>${content}${status}</div></td>`
}


function refreshAfterPlanningChange(){
  save();
  render();
  if(metricFocus && (metricFocus.kind==='zone' || metricFocus.kind==='position')){
    setTimeout(()=>showMetricPanel(metricFocus.kind, metricFocus.value), 30);
  }
}
window.updateSlotZone=(id,d,s,value)=>{
  if(!data.assignments[id])data.assignments[id]={};
  if(!data.assignments[id][d])data.assignments[id][d]={};
  data.assignments[id][d][s]=value;
  refreshAfterPlanningChange();
};
function normalizeTimeRangeInput(value){
  const raw=String(value||'').trim().replace(/\s*-\s*/,'-');
  return /^(?:[01]?\d|2[0-3]):[0-5]\d-(?:[01]?\d|2[0-3]):[0-5]\d$/.test(raw)?raw:'';
}
window.updateSlotTime=(id,d,s,value)=>{
  const range=normalizeTimeRangeInput(value);
  if(!range){alert('Use time format HH:MM-HH:MM, for example 11:00-15:00.');render();return;}
  if(!data.assignmentTimes)data.assignmentTimes={};
  if(!data.assignmentTimes[id])data.assignmentTimes[id]={};
  if(!data.assignmentTimes[id][d])data.assignmentTimes[id][d]={};
  data.assignmentTimes[id][d][s]=range;
  refreshAfterPlanningChange();
};

window.selectCalRow=(key)=>{selectedCalendarRow=key;metricFocus=null;clearMetricPanel();document.querySelectorAll('.calendar-row').forEach(r=>r.classList.toggle('row-selected',r.dataset.rowkey===key))}

window.slotClick=(id,d,s,mode)=>{
  if(mode==='owner'){ownerToggleSlot(id,d,s);return}
  if(mode==='published'&&session.role!=='employee')return;
  if(data.status!=='Published'){
    if(id!==session.employeeId)return;
    data.availability[id][d][s]=!data.availability[id][d][s];
    if(data.availability[id][d][s]&&!data.assignments[id][d][s])data.assignments[id][d][s]=suggestZone(emp(id),s);
    if(!data.availability[id][d][s]){data.assignments[id][d][s]='';if(data.assignmentTimes?.[id]?.[d])data.assignmentTimes[id][d][s]='';}
    data.submitted[id]=true;save();render();return
  }
  let avail=data.availability[id][d][s];if(!avail)return;
  let existing=swapFor(id,d,s);
  if(existing && existing.status!=='Approved'){
    // If someone asked to take my shift, I should accept/decline directly from the slot.
    if(existing.from===session.employeeId && existing.to && existing.status==='Employee approval'){
      if(confirm(`${emp(existing.to)?.name||'Employee'} wants to take this shift. Accept this request?`)){
        existing.status='Pending';
        save();render();
        alert('Accepted. Owner must approve before the schedule changes.');
      }else if(confirm('Decline this swap request instead?')){
        existing.status='Rejected';
        save();render();
      }
      return;
    }
    const involved = existing.from===session.employeeId || existing.to===session.employeeId;
    if(involved){
      if(confirm('Cancel this swap request?')){
        data.swaps=data.swaps.filter(sw=>sw.id!==existing.id);
        save();render();
      }
      return;
    }
  }
  if(existing&&existing.status==='Waiting'&&id!==session.employeeId){
    pendingSwap={type:'take',swapId:existing.id,id,d,s};
    openSwapDialog('Take open swap',`You are offering to take ${emp(id)?.name}'s ${d} ${s} shift. Owner approval required.`,'I can take it');return
  }
  if(id===session.employeeId){
    pendingSwap={type:'offer',id,d,s};
    openSwapDialog('Offer shift',`You are offering your ${d} ${s} shift. Choose anyone or a specific employee. Owner approval is required before the schedule changes.`,'Offer swap')
  }else{
    pendingSwap={type:'request',id,d,s};
    openSwapDialog('Request this shift',`You are asking to take ${emp(id)?.name}'s ${d} ${s} shift. They must accept first, then owner approves.`,'Request shift')
  }
}
function ownerToggleSlot(id,d,s){if(data.status==='Published')return alert('Unpublish the schedule before changing planning. Swaps can still be approved while published.');let e=emp(id);if(!e)return;data.availability[id][d][s]=!data.availability[id][d][s];if(data.availability[id][d][s]){data.assignments[id][d][s]=data.assignments[id][d][s]||suggestZone(e,s);data.submitted[id]=true;addNotification('shift-'+id+d+s,'yellow','Shift added',`${e.name} was planned on ${d} ${s}.`,{kind:'employee',id})}else{data.assignments[id][d][s]='';if(data.assignmentTimes?.[id]?.[d])data.assignmentTimes[id][d][s]='';addNotification('shift-remove-'+id+d+s,'yellow','Shift removed',`${e.name} was removed from ${d} ${s}.`,{kind:'employee',id})}save();render()}
function togglePublish(){data.status=data.status==='Published'?'Draft':'Published';addNotification('status-'+data.weekStart+'-'+data.status,'yellow',data.status==='Published'?'Schedule published':'Schedule unpublished',data.status==='Published'?'The schedule is now published. Changes go through swaps.':'The schedule is back in draft.',{kind:'status'});save();render()}
function openSwapDialog(title,body,btn){
  swapTitle.textContent=title;swapBody.textContent=body;confirmSwap.textContent=btn;swapNote.value='';
  if($('swapTargetWrap')&&$('swapTarget')){
    const show=pendingSwap&&pendingSwap.type==='offer';
    $('swapTargetWrap').style.display=show?'flex':'none';
    if(show){
      swapTarget.innerHTML='<option value="">Anyone can take this shift</option>'+activeEmployees().filter(e=>e.id!==session.employeeId).map(e=>`<option value="${e.id}">${esc(e.name)}</option>`).join('');
      swapTarget.value='';
    }
  }
  swapDialog.showModal()
}
function confirmSwapFn(){
  if(!pendingSwap)return;
  let note=swapNote.value.trim();let p=pendingSwap;
  if(p.type==='offer'){
    let target=$('swapTarget')?swapTarget.value:'';
    data.swaps.push({id:id(),from:p.id,to:target||'',day:p.d,shift:p.s,note,status:target?'Employee approval':'Waiting'});
  }
  if(p.type==='take'){
    let sw=data.swaps.find(x=>x.id===p.swapId);
    if(sw){sw.to=session.employeeId;sw.status='Pending';if(note)sw.note=(sw.note?sw.note+' | ':'')+note;addSwapNotification(sw)}
  }
  if(p.type==='request')data.swaps.push({id:id(),from:p.id,to:session.employeeId,day:p.d,shift:p.s,note,status:'Employee approval'});
  addSwapNotification(data.swaps[data.swaps.length-1]||null);
  pendingSwap=null;
  swapDialog.close();
  save();render();
  alert(p.type==='request' ? 'Request sent. The employee must accept first, then owner approves.' : 'Swap saved. Owner approval is required before schedule changes.');
}


window.openInlineZonePicker=(ev,id,d,s)=>{
  if(ev)ev.stopPropagation();
  const btn=ev?.currentTarget;
  const slot=btn?.closest('.slot');
  if(!slot)return;
  const existing=slot.querySelector('.inline-zone-select-wrap');
  if(existing){ existing.remove(); return; }
  document.querySelectorAll('.inline-zone-select-wrap').forEach(x=>x.remove());
  const e=emp(id); if(!e)return;
  const current=data.assignments[id]?.[d]?.[s]||suggestZone(e,s)||'';
  const wrap=document.createElement('div');
  wrap.className='inline-zone-select-wrap';
  const sel=document.createElement('select');
  sel.className='inline-zone-select';
  sel.innerHTML=zoneRules.map(z=>`<option value="${esc(z.zone)}" ${current===z.zone?'selected':''} title="${esc(z.zone)} · ${esc(z.role)}">${esc(z.zone)}</option>`).join('');
  sel.value=current;
  sel.addEventListener('click',e=>e.stopPropagation());
  sel.addEventListener('change',()=>{ data.assignments[id][d][s]=sel.value; refreshAfterPlanningChange(); });
  sel.addEventListener('blur',()=>setTimeout(()=>{ const w=document.querySelector('.inline-zone-select-wrap'); if(w)w.remove(); },120));
  wrap.appendChild(sel);
  btn.insertAdjacentElement('afterend',wrap);
  sel.focus();
};

window.openZonePicker=(ev,id,d,s)=>{
  if(ev)ev.stopPropagation();
  const e=emp(id); if(!e)return;
  pendingZone={id,d,s};
  const current=data.assignments[id]?.[d]?.[s]||suggestZone(e,s)||'';
  if($('zoneDialogText')) zoneDialogText.textContent=`${e.name} · ${d} ${s}`;
  if($('zoneDialogSelect')){
    zoneDialogSelect.innerHTML=zoneRules.map(z=>`<option value="${esc(z.zone)}" ${current===z.zone?'selected':''} title="${esc(z.zone)} · ${esc(z.role)}">${esc(z.zone)}</option>`).join('');
    zoneDialogSelect.value=current;
  }
  zoneDialog.showModal();
};
function saveZoneDialogFn(){
  if(!pendingZone)return;
  const {id,d,s}=pendingZone;
  data.assignments[id][d][s]=zoneDialogSelect.value;
  pendingZone=null;
  zoneDialog.close();
  save();render();
}

window.setZone=(id,d,s,val)=>{data.assignments[id][d][s]=val;refreshAfterPlanningChange()}
function renderSwaps(){employeeSwaps.innerHTML=swapCards('employee');ownerSwaps.innerHTML=swapCards('owner')}
function swapCards(mode){let list=data.swaps.filter(s=>mode==='owner'||s.from===session.employeeId||s.to===session.employeeId||(!s.to&&s.from!==session.employeeId)).slice().reverse();if(!list.length)return '<p class="muted">No swap requests yet.</p>';return list.map(s=>{let from=emp(s.from),to=emp(s.to);let take=mode==='employee'&&!s.to&&s.from!==session.employeeId&&s.status==='Waiting'?`<button class="secondary" onclick="volunteer('${s.id}')">I can take this shift</button>`:'';let employeeApproval=mode==='employee'&&s.from===session.employeeId&&s.to&&s.status==='Employee approval'?`<div class="swap-actions"><button class="primary" onclick="employeeApproveSwap('${s.id}')">Accept request</button><button class="danger" onclick="employeeRejectSwap('${s.id}')">Decline</button></div>`:'';let ownerWaiting=s.status==='Employee approval'?'<small class="muted">Waiting for employee acceptance before owner approval.</small>':'';let owner=mode==='owner'?`<div class="swap-actions"><select class="swap-taker-select" onchange="ownerSelectTaker('${s.id}',this.value)"><option value="">${s.to?'Clear taker':'Select taker'}</option>${activeEmployees().filter(e=>e.id!==s.from).map(e=>`<option value="${e.id}" ${s.to===e.id?'selected':''}>${esc(e.name)}</option>`).join('')}</select><button class="primary" onclick="approveSwap('${s.id}')">Approve</button><button class="danger" onclick="rejectSwap('${s.id}')">Reject</button></div>`:'';let cls=String(s.status).toLowerCase().replace(/\s+/g,'-');return `<div class="swap-card"><strong>${esc(from?.name||'?')} → ${esc(to?.name||'Anyone')}</strong><span>${s.day} ${s.shift}</span><span class="tag ${cls}">${s.status}</span><small>${esc(s.note||'')}</small>${take}${employeeApproval}${ownerWaiting}${owner}</div>`}).join('')}
window.volunteer=sid=>{let s=data.swaps.find(x=>x.id===sid);if(s&&!s.to){s.to=session.employeeId;s.status='Pending';addSwapNotification(s);save();render();alert('Owner must approve before the schedule changes.')}};
window.employeeApproveSwap=sid=>{let s=data.swaps.find(x=>x.id===sid);if(s&&s.from===session.employeeId&&s.status==='Employee approval'){s.status='Pending';addSwapNotification(s);save();render();alert('Accepted. Owner must approve before the schedule changes.')}};
window.employeeRejectSwap=sid=>{let s=data.swaps.find(x=>x.id===sid);if(s&&s.from===session.employeeId&&s.status==='Employee approval'){s.status='Rejected';addSwapNotification(s);save();render();alert('Request declined.')}};
window.ownerSelectTaker=(sid,eid)=>{let s=data.swaps.find(x=>x.id===sid);if(!s)return;if(!eid){s.to='';s.status='Waiting';save();render();return;}s.to=eid;if(s.status==='Waiting')s.status='Employee approval';save();render()};
window.approveSwap=sid=>{let s=data.swaps.find(x=>x.id===sid);if(!s||!s.to)return alert('Choose a taker first.');if(s.status==='Employee approval')return alert('The employee must accept this request before owner approval.');data.availability[s.from][s.day][s.shift]=false;data.assignments[s.to][s.day][s.shift]=data.assignments[s.from][s.day][s.shift]||suggestZone(emp(s.to),s.shift);data.assignments[s.from][s.day][s.shift]='';data.availability[s.to][s.day][s.shift]=true;s.status='Approved';addSwapNotification(s);save();render()};
window.rejectSwap=sid=>{let s=data.swaps.find(x=>x.id===sid);if(s){s.status='Rejected';addSwapNotification(s);save();render()}};
function clearMyDraft(){if(data.status==='Published')return alert('Published schedule is locked. Use swaps.');days.forEach(d=>shifts.forEach(s=>{data.availability[session.employeeId][d][s]=false;data.assignments[session.employeeId][d][s]='';if(data.assignmentTimes?.[session.employeeId]?.[d])data.assignmentTimes[session.employeeId][d][s]=''}));data.submitted[session.employeeId]=false;save();render()}

function openDayNote(d){
  if(!$('dayNoteDialog'))return;
  dayNoteTitle.textContent=`Shift notes · ${d} ${dateForDay(d)}`;
  const owner=session.role==='owner';
  const parts=shifts.map(s=>{
    const note=(data.notes?.[d]?.[s]||'').trim();
    if(owner){
      return `<div class="day-note-card editable"><strong>${s}</strong><textarea rows="4" placeholder="Add a ${s.toLowerCase()} note…" onchange="setNote('${d}','${s}',this.value)">${esc(note)}</textarea></div>`;
    }
    return `<div class="day-note-card"><strong>${s}</strong><p>${esc(note||'No note for this shift.')}</p></div>`;
  }).join('');
  dayNoteBody.innerHTML=parts;
  dayNoteDialog.showModal();
}

function renderNotes(id,edit){let el=$(id); if(!el)return; el.innerHTML=days.map(d=>shifts.map(s=>edit?`<div class="note-card"><strong>${d} ${s}</strong><textarea onchange="setNote('${d}','${s}',this.value)">${esc(data.notes[d][s])}</textarea></div>`:`<div class="note-card"><strong>${d} ${s}</strong><p>${esc(data.notes[d][s]||'No note')}</p></div>`).join('')).join('')}
window.setNote=(d,s,v)=>{data.notes[d][s]=v;addNotification('note-'+d+'-'+s+'-'+Date.now(),'yellow','Shift note updated',`${d} ${s}: ${String(v||'').slice(0,80)}`,{kind:'day',day:d});save();render()}
function renderZones(id){let el=$(id); if(!el)return; el.innerHTML=zoneRules.map(z=>`<div class="zone-card"><strong>${esc(z.zone)}</strong><span>${esc(z.role)}</span><p>Lunch: ${esc(z.lunch)}<br>Evening: ${esc(z.evening)}</p></div>`).join('')}
function renderSubmissions(){let el=$('submissionStatus'); if(!el)return; el.innerHTML=activeEmployees().map(e=>`<div class="status-row"><strong>${esc(e.name)}</strong><br><span>${data.submitted[e.id]?'✅ Submitted availability':'⏳ Waiting availability'}</span></div>`).join('')}
function renderEmployeeManager(){employeeManager.innerHTML='<table class="data"><thead><tr><th>Name</th><th>Position</th><th>€/hour</th><th>PIN</th><th>Active</th><th>Employee full planner</th></tr></thead><tbody>'+data.employees.map(e=>`<tr><td><input value="${esc(e.name)}" onchange="editEmp('${e.id}','name',this.value)"></td><td><select onchange="editEmp('${e.id}','position',this.value)">${positions.map(p=>`<option ${p===e.position?'selected':''}>${esc(p)}</option>`).join('')}</select></td><td><input type="number" step="0.25" value="${e.rate}" onchange="editEmp('${e.id}','rate',this.value)"></td><td><input class="pin-input" inputmode="numeric" maxlength="6" value="${PROTOTYPE_PIN}" readonly title="PIN 0000"></td><td><select onchange="editEmp('${e.id}','active',this.value)"><option value="true" ${e.active?'selected':''}>Active</option><option value="false" ${!e.active?'selected':''}>Inactive</option></select></td><td><select onchange="editEmp('${e.id}','managerAccess',this.value)"><option value="false" ${!e.managerAccess?'selected':''}>No</option><option value="true" ${e.managerAccess?'selected':''}>Yes</option></select></td></tr>`).join('')+'</tbody></table>'}
window.editEmp=(id,field,val)=>{let e=emp(id);if(!e)return;e[field]=field==='rate'?+val:(field==='active'||field==='managerAccess')?val==='true':field==='pin'?sanitizePin(val):val;ensure();save();render()}
function addEmployeeFn(){let name=newName.value.trim();if(!name)return alert('Name required');let pin=sanitizePin($('newPin')?.value)||defaultPinForIndex(data.employees.length);data.employees.push({id:id(),name,position:newPosition.value,rate:+newRate.value||13.5,active:true,managerAccess:false,pin});newName.value='';newRate.value='';if($('newPin'))newPin.value='';ensure();save();render()}
function weekRows(src=data){
  let rows=[];
  let av=src.availability||{}, as=src.assignments||{};
  activeEmployees().forEach(e=>days.forEach(d=>shifts.forEach(sh=>{
    if(!av[e.id]?.[d]?.[sh])return;
    let zone=as[e.id]?.[d]?.[sh]||suggestZone(e,sh)||'Unassigned';
    let rule=zoneRules.find(r=>r.zone===zone);
    let range=rule?(sh==='Lunch'?rule.lunch:rule.evening):(sh==='Lunch'?'11:00-15:00':'17:50-23:00');
    let h=hoursFromRange(range)||defaultHours(sh);
    let cost=h*(+e.rate||0);
    rows.push({e,d,shift:sh,zone,h,cost,position:e.position});
  })));
  return rows;
}
function summarizeRows(rows){
  let cost=rows.reduce((a,r)=>a+r.cost,0),hours=rows.reduce((a,r)=>a+r.h,0);
  let byDay=Object.fromEntries(days.map(d=>[d,0]));
  let hoursByDay=Object.fromEntries(days.map(d=>[d,0]));
  let byPos={}, byZone={}, byEmp={};
  rows.forEach(r=>{
    byDay[r.d]+=r.cost; hoursByDay[r.d]+=r.h;
    byPos[r.position]=(byPos[r.position]||0)+r.cost;
    byZone[r.zone]=(byZone[r.zone]||0)+r.cost;
    if(!byEmp[r.e.id])byEmp[r.e.id]={name:r.e.name,position:r.e.position,hours:0,cost:0,rate:r.e.rate};
    byEmp[r.e.id].hours+=r.h; byEmp[r.e.id].cost+=r.cost;
  });
  return {cost,hours,byDay,hoursByDay,byPos,byZone,byEmp};
}
function snapshotRows(week){
  if(week===data.weekStart)return weekRows(data);
  let h=data.history?.[week];
  if(!h)return [];
  return weekRows({availability:h.availability||{},assignments:h.assignments||{}});
}
function combineDayStats(rows){
  let out={};days.forEach(d=>out[d]={hours:0,cost:0,people:new Set(),assignments:0});
  rows.forEach(r=>{let item=out[r.d]||(out[r.d]={hours:0,cost:0,people:new Set(),assignments:0});item.hours+=r.h;item.cost+=r.cost;item.people.add(r.e.id);item.assignments++;});
  return out
}
function combinePositionStats(rows){let out={};rows.forEach(r=>{let k=cleanPositionName(r.position);out[k]=out[k]||{hours:0,cost:0,people:new Set(),assignments:0};out[k].hours+=r.h;out[k].cost+=r.cost;out[k].people.add(r.e.id);out[k].assignments++;});return orderedCombined(out,positions)}
function combineZoneStats(rows){let out={};rows.forEach(r=>{let k=r.zone||'Unassigned';out[k]=out[k]||{hours:0,cost:0,people:new Set(),assignments:0};out[k].hours+=r.h;out[k].cost+=r.cost;out[k].people.add(r.e.id);out[k].assignments++;});return orderedCombined(out,zoneRules.map(z=>z.zone))}
function orderedCombined(obj,order){let out={};order.filter(k=>obj[k]).forEach(k=>out[k]=obj[k]);Object.keys(obj).filter(k=>!(k in out)).sort().forEach(k=>out[k]=obj[k]);return out}
function percent(n,d){return d?Math.round(n/d*100):0}
function buildStackedBarsHTML(rows,groups,categories,metric='cost',stackMode='position',opts={}){
  const maxHeight=opts.maxHeight||190;
  const labelMode=opts.labelMode||'auto';
  const showLegend=opts.showLegend!==false;
  const vals={};groups.forEach(g=>vals[g]={total:0,parts:{},hours:0,cost:0,people:new Set(),assignments:0});
  rows.forEach(r=>{
    let g=(r._group||groupForRow(r)), k=(stackMode==='zone'?(r.zone||'Unassigned'):cleanPositionName(r.position));
    if(!vals[g])vals[g]={total:0,parts:{},hours:0,cost:0,people:new Set(),assignments:0};
    let v=metric==='hours'?r.h:r.cost;
    vals[g].total+=v; vals[g].parts[k]=(vals[g].parts[k]||0)+v; vals[g].hours+=r.h; vals[g].cost+=r.cost; vals[g].people.add(r.e?.id||r.employeeId||g+':x'); vals[g].assignments++;
  });
  const max=Math.max(1,...groups.map(g=>vals[g]?.total||0));
  const cls=k=>stackMode==='zone'?zoneClass(k):positionClass(k); const sty=k=>stackMode==='zone'?zoneStyle(k):positionStyle(k);
  return `<div class="stacked-bars wide-bars operational-bars">${groups.map(g=>{let item=vals[g]||{total:0,parts:{},hours:0,cost:0,people:new Set(),assignments:0};let cats=categories.concat(Object.keys(item.parts).filter(k=>!categories.includes(k))).filter(k=>item.parts[k]);let total=item.total||0;let peopleCount=item.people instanceof Set?item.people.size:(item.people||0);let main=metric==='hours'?fmtHours(total):money(total);let secondary=metric==='hours'?`${money(item.cost)} · ${fmtPeople(peopleCount)}`:`${fmtHours(item.hours)} · ${fmtPeople(peopleCount)}`;if(labelMode==='brief'){secondary=metric==='hours'?money(item.cost):fmtHours(item.hours);}return `<div class="stacked-col"><div class="chart-value"><strong>${main}</strong><small>${secondary}</small></div><div class="stacked-track" style="height:${Math.max(20,Math.round(total/max*maxHeight))}px">${cats.map(k=>`<span class="${cls(k)}" style="${sty(k)}height:${(item.parts[k]/Math.max(1,total))*100}%" title="${esc(k)} · ${metric==='hours'?fmtHours(item.parts[k]):money(item.parts[k])}"></span>`).join('')}</div><small>${esc(String(g).slice(0,3))}</small></div>`}).join('')}</div>${showLegend?`<div class="legend">${categories.slice(0,12).map(k=>`<span><i class="${cls(k)}" ${styleAttr(sty(k))}></i>${esc(k)}</span>`).join('')}</div>`:''}`
}
function renderCombinedBreakdown(id,obj,kind=''){
  let el=$(id);if(!el)return;
  let entries=Object.entries(obj).filter(([_,v])=>v.hours>0||v.cost>0);
  if(!entries.length){el.innerHTML='<p class="muted">No data yet.</p>';return;}
  let max=Math.max(1,...entries.map(([_,v])=>v.cost));
  let totalCost=entries.reduce((a,[_,v])=>a+v.cost,0);
  el.innerHTML=entries.map(([k,v])=>{let peopleCount=v.people instanceof Set?v.people.size:(v.people||0);let share=percent(v.cost,totalCost);let klass=kind==='zone'?'zone-combo '+zoneClass(k):kind==='position'?positionClass(k):'';let style=kind==='zone'?zoneStyle(k):(kind==='position'?positionStyle(k):'');return `<div class="combo-row ${klass}" ${styleAttr(style)}><div class="combo-info"><strong>${kind==='zone'?zoneDot(k):''}${esc(k)}</strong><small>${fmtHours(v.hours)} · ${money(v.cost)} · ${fmtPeople(peopleCount)}</small></div><div class="combo-bar"><span class="${kind==='position'?positionClass(k):(kind==='zone'?zoneClass(k):'')}" style="width:${Math.max(4,v.cost/max*100)}%"></span></div><div class="combo-meta">${share}%</div></div>`}).join('')
}
function positionColorClass(p){return positionClass(p)}
function renderEmployeeInsightsForRows(id,rows){
  let el=$(id);if(!el)return;let by={};rows.forEach(r=>{let k=r.e.id;by[k]=by[k]||{name:r.e.name,position:r.e.position,hours:0,cost:0,people:1};by[k].hours+=r.h;by[k].cost+=r.cost});
  let list=Object.values(by).sort((a,b)=>b.hours-a.hours||b.cost-a.cost);if(!list.length){el.innerHTML='<p class="muted">No data yet.</p>';return;}
  el.innerHTML='<table class="data insight-table"><thead><tr><th>Employee</th><th>Position</th><th>Hours</th><th>Cost</th></tr></thead><tbody>'+list.map((r,i)=>`<tr class="${i<3?'top-worker':''}"><td><strong>${i<3?'★ ':''}${esc(r.name)}</strong></td><td>${esc(r.position)}</td><td>${fmtHours(r.hours)}</td><td>${money(r.cost)}</td></tr>`).join('')+'</tbody></table>'
}

function orderedObject(obj,order){let out={};order.filter(k=>obj[k]).forEach(k=>out[k]=obj[k]);Object.keys(obj).filter(k=>!(k in out)).sort().forEach(k=>out[k]=obj[k]);return out}
function orderedZonesObject(obj){let order=zoneRules.map(z=>z.zone).filter((z,i,a)=>z&&a.indexOf(z)===i);return orderedObject(obj,order)}
function formatMetric(v,type){return type==='hours'?fmtHours(v):money(v)}
function renderTrend(id,weeks,type){
  let el=$(id); if(!el)return;
  const cats=dashboardMix==='zone'?zoneRules.map(z=>z.zone).filter((z,i,a)=>z&&a.indexOf(z)===i):positions;
  const rows=[]; weeks.forEach(w=>w.rows.forEach(r=>rows.push({...r,_group:w.label})));
  el.innerHTML=buildStackedBarsHTML(rows,weeks.map(w=>w.label),cats,type,dashboardMix,{maxHeight:170,labelMode:'auto',showLegend:false});
}
function setMetricFilter(v){metricFilter=v||'week';document.querySelectorAll('.metric-filter').forEach(sel=>sel.value=metricFilter);document.querySelectorAll('.metric-day-btn').forEach(btn=>btn.classList.toggle('active',btn.dataset.metric===metricFilter));document.querySelectorAll('.toggle-zero').forEach(b=>{b.classList.toggle('active',!showZeroRows);b.innerHTML=showZeroRows?uiIconSvg('eyeOff'):uiIconSvg('eye');b.title=showZeroRows?'Hide employees with 0 hours':'Show all employees';b.setAttribute('aria-label', b.title);});renderPositionHours('ownerPositionHours');renderPositionHours('publishedPositionHours');renderPositionHours('employeePositionHours');renderZoneHours('ownerZoneHours');renderZoneHours('publishedZoneHours');renderZoneHours('employeeZoneHours')}
function metricDays(){return metricFilter==='week'?days:days.filter(d=>d.slice(0,3)===metricFilter)}
function renderPositionHours(targetId){
  let el=$(targetId); if(!el)return;
  let totals={}, people={};
  positions.forEach(p=>{totals[p]=0;people[p]=new Set();});
  activeEmployees().forEach(e=>metricDays().forEach(d=>shifts.forEach(s=>{
    let h=slotHours(e,d,s);
    let p=cleanPositionName(e.position);
    totals[p]=(totals[p]||0)+h;
    people[p]=people[p]||new Set();
    if(h>0)people[p].add(e.id);
  })));
  let ordered=[...positions,...Object.keys(totals).filter(p=>!positions.includes(p))];
  el.innerHTML=ordered.map(p=>`<button type="button" class="position-total metric-chip ${positionClass(p)} ${metricFocus&&metricFocus.kind==='position'&&cleanPositionName(metricFocus.value)===cleanPositionName(p)?'active':''}" ${styleAttr(positionStyle(p))} data-value="${esc(p)}" onclick="metricClick('position',this.dataset.value,event)" title="Focus ${esc(p)} in calendar"><span>${esc(p)}</span><strong>${fmtHours(totals[p]||0)} <em>${fmtPeople((people[p]&&people[p].size)||0)}</em></strong></button>`).join('');
}

function renderZoneHours(targetId){
  let el=$(targetId); if(!el)return;
  let totals={}, people={};
  zoneRules.map(z=>z.zone).filter(Boolean).forEach(z=>{totals[z]=0;people[z]=new Set();});
  activeEmployees().forEach(e=>metricDays().forEach(d=>shifts.forEach(s=>{
    let h=slotHours(e,d,s); if(!h)return;
    let z=data.assignments[e.id]?.[d]?.[s]||suggestZone(e,s)||'Unassigned';
    totals[z]=(totals[z]||0)+h;
    people[z]=people[z]||new Set();
    people[z].add(e.id);
  })));
  let ordered=zoneRules.map(z=>z.zone).filter((z,i,a)=>z&&a.indexOf(z)===i).concat(Object.keys(totals).filter(z=>!zoneRules.some(r=>r.zone===z)));
  el.innerHTML=ordered.map(z=>`<button type="button" class="zone-total metric-chip ${zoneClass(z)} ${metricFocus&&metricFocus.kind==='zone'&&metricFocus.value===z?'active':''}" ${styleAttr(zoneStyle(z))} data-value="${esc(z)}" onclick="metricClick('zone',this.dataset.value,event)" title="Focus ${esc(z)} in calendar"><span>${zoneDot(z)}${esc(z)}</span><strong>${fmtHours(totals[z]||0)} <em>${fmtPeople((people[z]&&people[z].size)||0)}</em></strong></button>`).join('');
}

function saveWeekSnapshot(){data.history[data.weekStart]={availability:structuredClone(data.availability),assignments:structuredClone(data.assignments),assignmentTimes:structuredClone(data.assignmentTimes||{}),submitted:structuredClone(data.submitted),notes:structuredClone(data.notes),swaps:structuredClone(data.swaps),status:data.status}}
function loadWeekSnapshot(){let h=data.history[data.weekStart];if(h){data.availability=h.availability;data.assignments=h.assignments;data.assignmentTimes=h.assignmentTimes||{};data.submitted=h.submitted;data.notes=h.notes;data.swaps=h.swaps;data.status=h.status==='Reviewed'?'Draft':h.status}else{let employees=data.employees;data.availability={};data.assignments={};data.assignmentTimes={};data.submitted={};data.notes={};data.swaps=[];data.status='Draft';ensure({employees,availability:data.availability,assignments:data.assignments,assignmentTimes:data.assignmentTimes,submitted:data.submitted,notes:data.notes,swaps:data.swaps,history:data.history,weekStart:data.weekStart,status:data.status})}ensure()}
function changeWeek(n){saveWeekSnapshot();data.weekStart=monday(addDays(data.weekStart,n));loadWeekSnapshot();save();render()}
function copyPreviousWeek(){if(!confirm('Copy previous week into this week? Current week draft will be replaced.'))return;let prev=addDays(data.weekStart,-7);let h=data.history[prev];if(!h)return alert('No previous week saved yet. Go to that week first or create a schedule.');data.availability=structuredClone(h.availability);data.assignments=structuredClone(h.assignments);data.assignmentTimes=structuredClone(h.assignmentTimes||{});data.notes=structuredClone(h.notes);data.submitted={};data.swaps=[];data.status='Draft';ensure();save();render()}
function openMessage(){let lines=[`${restaurantName()} schedule`, `Week starting: ${data.weekStart}`, `Status: ${data.status}`, ''];days.forEach(d=>{lines.push(`${d} ${dateForDay(d)}`);shifts.forEach(s=>{let people=activeEmployees().filter(e=>data.availability[e.id][d][s]);if(people.length){lines.push(` ${s}:`);people.forEach(e=>lines.push(` - ${e.name}: ${data.assignments[e.id][d][s]||suggestZone(e,s)}`));if(data.notes[d][s])lines.push(` Note: ${data.notes[d][s]}`)}});lines.push('')});messageText.value=lines.join('\n');messageDialog.showModal()}
function exportBackup(){let blob=new Blob([JSON.stringify(data,null,2)],{type:'application/json'}),a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=slugifyWorkspace(restaurantName())+'-planner-backup.json';a.click();URL.revokeObjectURL(a.href)}

/* v174 Export Center */
function exportFileName(part,ext='csv'){
  const week=(data?.weekStart||todayISO()).replaceAll('-','');
  return `${slugifyWorkspace(restaurantName())}-${part}-${week}.${ext}`;
}
function csvCell(value){return `"${String(value??'').replaceAll('"','""')}"`}
function downloadCsv(filename,headers,rows){
  const lines=[headers.map(csvCell).join(','),...rows.map(row=>row.map(csvCell).join(','))];
  const blob=new Blob(['\ufeff'+lines.join('\n')],{type:'text/csv;charset=utf-8'});
  const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=filename;a.click();URL.revokeObjectURL(a.href);
}
function weekDates(){return days.map((d,i)=>({day:d,date:addDays(data.weekStart,i)}))}
function entrySlot(entry){return typeof normalizeTimesheetSlot==='function'?normalizeTimesheetSlot(entry.shift,entry):(String(entry.shift||'').toLowerCase().includes('evening')?'Evening':'Lunch')}
function entryStatusForExport(entry){if(entry.rejectedAt)return 'rejected';if(!entry.clockOut)return 'open';if(entry.updatedByManager||String(entry.managerNote||'').trim())return 'edited';return 'approved'}
function entriesForExport(employeeId,date,slot=''){
  return entriesForEmployeeDate(employeeId,date).filter(e=>!e.rejectedAt&&(!slot||entrySlot(e)===slot));
}
function joinEntryField(entries,field){
  return entries.map(e=>field(e)).filter(Boolean).join(' / ');
}
function dailyActualHours(employeeId,date){return entriesForExport(employeeId,date).reduce((sum,e)=>sum+timeEntryHours(e,true),0)}
function timesheetExportRows(){
  const rows=[];
  activeEmployees().forEach(employee=>{
    weekDates().forEach(({day,date})=>{
      const lunch=entriesForExport(employee.id,date,'Lunch');
      const evening=entriesForExport(employee.id,date,'Evening');
      const all=[...lunch,...evening];
      const hasPlanned=plannedHoursForDate(employee,date)>0;
      if(!all.length&&!hasPlanned)return;
      rows.push([
        employee.name,employee.position,date,day,
        joinEntryField(lunch,e=>formatClockTime(e.clockIn)),
        joinEntryField(lunch,e=>e.clockOut?formatClockTime(e.clockOut):'LIVE'),
        fmtHours(lunch.reduce((s,e)=>s+timeEntryHours(e,true),0)),
        joinEntryField(lunch,entryStatusForExport),
        joinEntryField(evening,e=>formatClockTime(e.clockIn)),
        joinEntryField(evening,e=>e.clockOut?formatClockTime(e.clockOut):'LIVE'),
        fmtHours(evening.reduce((s,e)=>s+timeEntryHours(e,true),0)),
        joinEntryField(evening,entryStatusForExport),
        fmtHours(dailyActualHours(employee.id,date)),
        joinEntryField(all,e=>e.managerNote||'')
      ]);
    });
  });
  return rows;
}
function exportTimesheetCsv(){
  downloadCsv(exportFileName('timesheet'),['Employee','Position','Date','Day','Lunch in','Lunch out','Lunch hours','Lunch status','Evening in','Evening out','Evening hours','Evening status','Daily total','Notes'],timesheetExportRows());
}
function payrollExportRows(){
  const rows=[];
  activeEmployees().forEach(employee=>{
    weekDates().forEach(({day,date})=>{
      entriesForExport(employee.id,date).forEach(entry=>{
        rows.push([employee.name,employee.id,date,day,entrySlot(entry),formatClockTime(entry.clockIn),entry.clockOut?formatClockTime(entry.clockOut):'',fmtHours(timeEntryHours(entry,true)),employee.position,entry.zone||'',entryStatusForExport(entry),entry.managerNote||'']);
      });
    });
  });
  return rows;
}
function exportPayrollCsv(){
  downloadCsv(exportFileName('payroll'),['Employee','Employee ID','Date','Day','Shift','Clock in','Clock out','Hours','Position','Zone','Status','Manager note'],payrollExportRows());
}
function planningExportRows(){
  const rows=[];
  activeEmployees().forEach(employee=>{
    weekDates().forEach(({day,date})=>{
      plannedShiftSummary(employee,date).forEach(p=>{
        if(!p.h)return;
        rows.push([employee.name,employee.position,date,day,p.shift,displayTimeRange(p.range),p.zone||'',fmtHours(p.h),data.status||'Draft']);
      });
    });
  });
  return rows;
}
function exportPlanningCsv(){
  downloadCsv(exportFileName('planning'),['Employee','Position','Date','Day','Shift','Time','Zone','Planned hours','Schedule status'],planningExportRows());
}
function exportInventoryMovementsCsv(){
  const inv=inventory();
  const rows=(inv.movements||[]).map(m=>{
    const item=inv.items.find(x=>x.id===m.itemId)||{};
    return [m.date||'',m.type||'',invMovementLabel(m.type),m.itemName||item.name||'',item.category||'',m.qty??'',m.unit||item.unit||'',m.previousStock??'',m.newStock??'',m.unitCost??item.cost??'',m.note||'',m.createdAt||''];
  });
  downloadCsv(exportFileName('inventory-movements'),['Date','Type','Label','Item','Category','Quantity','Unit','Previous stock','New stock','Unit cost','Note','Created at'],rows);
}
function printReport(title,subtitle,headers,rows){
  const w=window.open('','_blank');
  if(!w){alert('Popup blocked. Please allow popups to print reports.');return;}
  const table=`<table><thead><tr>${headers.map(h=>`<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${rows.map(r=>`<tr>${r.map(c=>`<td>${esc(c)}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
  w.document.write(`<!doctype html><html><head><title>${esc(title)}</title><style>body{font-family:Inter,Segoe UI,Arial,sans-serif;margin:28px;color:#111827}h1{margin:0 0 4px;font-size:28px;letter-spacing:-.04em}p{margin:0 0 18px;color:#6b7280;font-weight:700}table{width:100%;border-collapse:collapse;font-size:11px}th,td{border:1px solid #e5e7eb;padding:7px 8px;text-align:left;vertical-align:top}th{background:#f8fafc;font-size:10px;text-transform:uppercase;letter-spacing:.06em}tr:nth-child(even)td{background:#fcfcfd}@media print{body{margin:14mm}}</style></head><body><h1>${esc(title)}</h1><p>${esc(subtitle)}</p>${table}<script>window.print()<\/script></body></html>`);
  w.document.close();
}
function printTimesheet(){
  printReport('Weekly actual hours',`${restaurantName()} · ${weekDisplayRange()}`,['Employee','Position','Date','Day','Lunch in','Lunch out','Lunch hours','Lunch status','Evening in','Evening out','Evening hours','Evening status','Daily total','Notes'],timesheetExportRows());
}
function printPayrollReport(){
  printReport('Payroll export preview',`${restaurantName()} · ${weekDisplayRange()}`,['Employee','Employee ID','Date','Day','Shift','Clock in','Clock out','Hours','Position','Zone','Status','Manager note'],payrollExportRows());
}
function printPlanningReport(){
  printReport('Planned schedule',`${restaurantName()} · ${weekDisplayRange()} · ${data.status||'Draft'}`,['Employee','Position','Date','Day','Shift','Time','Zone','Planned hours','Schedule status'],planningExportRows());
}
function printInventory(){
  const rows=invItems().map(item=>[item.name,item.category,item.unit,item.stock,item.minStock,money(item.cost),money(invValue(item)),item.supplier||'',item.location||'',invStatusLabel(item)]);
  printReport('Inventory stock report',`${restaurantName()} · ${formatClockDate(nowLocal())}`,['Item','Category','Unit','Stock','Minimum','Cost/unit','Value','Supplier','Storage','Status'],rows);
}
function printInventoryMovements(){
  const inv=inventory();
  const rows=(inv.movements||[]).slice(0,200).map(m=>{const item=inv.items.find(x=>x.id===m.itemId)||{};return [m.date||'',invMovementLabel(m.type),m.itemName||item.name||'',m.qty??'',m.unit||item.unit||'',m.previousStock??'',m.newStock??'',m.note||''];});
  printReport('Inventory movement history',`${restaurantName()} · latest movements`,['Date','Movement','Item','Quantity','Unit','Previous','New','Note'],rows);
}

function importBackup(e){let f=e.target.files[0];if(!f)return;let r=new FileReader();r.onload=()=>{try{data=JSON.parse(r.result);data.weekStart=monday(data.weekStart||new Date());ensure();save();render()}catch{alert('Could not import backup.')}};r.readAsText(f)}
function renderZoneManager(){
  if($('positionManager')){
    positionManager.innerHTML='<table class="data"><thead><tr><th>Order</th><th>Color</th><th>Position</th><th></th></tr></thead><tbody>'+positions.map((p,i)=>`<tr><td class="order-actions"><button class="mini" onclick="movePosition(${i},-1)" ${i===0?'disabled':''}>↑</button><button class="mini" onclick="movePosition(${i},1)" ${i===positions.length-1?'disabled':''}>↓</button></td><td class="color-cell"><input type="color" value="${colorForPosition(p)}" onchange="editPositionColor('${esc(p)}',this.value)"></td><td><input value="${esc(p)}" onchange="editPosition(${i},this.value)"></td><td><button class="danger" onclick="deletePosition(${i})">Delete</button></td></tr>`).join('')+'</tbody></table>';
  }
  if($('zoneManager')){
    zoneManager.innerHTML='<table class="data zone-table"><thead><tr><th>Color</th><th>Role / position</th><th>Zone</th><th>Lunch</th><th>Evening</th><th></th></tr></thead><tbody>'+zoneRules.map((z,i)=>`<tr><td class="color-cell"><input type="color" value="${colorForZone(z.zone)}" onchange="editZoneColor('${esc(z.zone)}',this.value)"></td><td><input value="${esc(z.role)}" onchange="editZoneRule(${i},'role',this.value)"></td><td><input value="${esc(z.zone)}" onchange="editZoneRule(${i},'zone',this.value)"></td><td><input value="${esc(z.lunch)}" onchange="editZoneRule(${i},'lunch',this.value)"></td><td><input value="${esc(z.evening)}" onchange="editZoneRule(${i},'evening',this.value)"></td><td><button class="danger" onclick="deleteZoneRule(${i})">Delete</button></td></tr>`).join('')+'</tbody></table>';
  }
}
window.editPosition=(i,v)=>{let old=positions[i];let clean=cleanPositionName(v);let oldColor=colorForPosition(old);positions[i]=clean;data.positions=positions;if(!data.positionColors)data.positionColors={};data.positionColors[clean]=oldColor;if(old!==clean)delete data.positionColors[old];data.employees.forEach(e=>{if(cleanPositionName(e.position)===cleanPositionName(old))e.position=clean});data.zoneRules.forEach(z=>{if(cleanPositionName(z.role)===cleanPositionName(old))z.role=clean});save();fillSelectors();render()}
window.editPositionColor=(p,c)=>{data.positionColors=data.positionColors||{};data.positionColors[cleanPositionName(p)]=c;save();render()}
window.editZoneColor=(z,c)=>{data.zoneColors=data.zoneColors||{};data.zoneColors[z]=c;save();render()}
window.movePosition=(i,dir)=>{let j=i+dir;if(j<0||j>=positions.length)return;[positions[i],positions[j]]=[positions[j],positions[i]];data.positions=positions;save();render()}
window.deletePosition=i=>{if(!confirm('Delete this position? Existing employees keep their text value.'))return;positions.splice(i,1);data.positions=positions;save();render()}
function addPositionFn(){let v=cleanPositionName(newPositionName.value.trim());if(!v)return;positions.push(v);data.positions=positions;data.positionColors=data.positionColors||{};data.positionColors[v]=defaultPositionPalette[(positions.length-1)%defaultPositionPalette.length];newPositionName.value='';save();render()}
window.editZoneRule=(i,k,v)=>{let old=zoneRules[i].zone;let oldColor=colorForZone(old);zoneRules[i][k]=v;if(k==='zone'){data.zoneColors=data.zoneColors||{};data.zoneColors[v]=oldColor;if(old!==v)delete data.zoneColors[old];}data.zoneRules=zoneRules;save();renderZones('publishedZones');renderZones('employeeZones');render()}
window.deleteZoneRule=i=>{if(!confirm('Delete this zone rule?'))return;zoneRules.splice(i,1);data.zoneRules=zoneRules;save();render()}
function addZoneFn(){let role=newZoneRole.value.trim(),zone=newZoneName.value.trim(),lunch=newZoneLunch.value.trim(),evening=newZoneEvening.value.trim();if(!zone)return alert('Zone name required');zoneRules.push({role:role||'Chef de Rang',zone,lunch:lunch||'-',evening:evening||'-'});data.zoneRules=zoneRules;data.zoneColors=data.zoneColors||{};data.zoneColors[zone]=defaultZonePalette[(Object.keys(data.zoneColors).length)%defaultZonePalette.length];newZoneRole.value=newZoneName.value=newZoneLunch.value=newZoneEvening.value='';save();render()}


/* v132 Time Clock / badging terminal foundation */
function nowLocal(){return new Date()}
function nowISO(){return new Date().toISOString()}
function todayISO(){return localISO(new Date())}
function formatClockTime(value=new Date()){
  const d=value instanceof Date?value:new Date(value);
  if(Number.isNaN(d.getTime()))return '—';
  return d.toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'});
}
function formatClockDate(value=new Date()){
  const d=value instanceof Date?value:new Date(value);
  if(Number.isNaN(d.getTime()))return '—';
  return d.toLocaleDateString([], {weekday:'long',day:'2-digit',month:'short',year:'numeric'});
}
function formatClockSuccessDate(value=new Date()){
  const d=value instanceof Date?value:new Date(value);
  if(Number.isNaN(d.getTime()))return '—';
  const day=String(d.getDate()).padStart(2,'0');
  const month=String(d.getMonth()+1).padStart(2,'0');
  const year=d.getFullYear();
  const weekday=d.toLocaleDateString([], {weekday:'long'});
  return `${day}/${month}/${year} - ${weekday}`;
}
function timeEntryHours(entry,live=false){
  if(!entry?.clockIn)return 0;
  const start=new Date(entry.clockIn).getTime();
  const end=entry.clockOut?new Date(entry.clockOut).getTime():(live?Date.now():NaN);
  if(!Number.isFinite(start)||!Number.isFinite(end)||end<start)return 0;
  return (end-start)/36e5;
}
function openTimeEntry(employeeId){return (data.timeEntries||[]).find(e=>e.employeeId===employeeId&&!e.clockOut&&e.status==='open')||null}
function entriesForDate(date=todayISO()){return (data.timeEntries||[]).filter(e=>e.date===date).sort((a,b)=>String(b.clockIn||'').localeCompare(String(a.clockIn||'')))}
function selectedClockEmployee(){return emp(timeClockEmployeeId)||null}
function plannedDayNameForDate(date=todayISO()){
  const d=parseISO(date);
  return days[(d.getDay()+6)%7]||'';
}
function planningSnapshotForDate(date=todayISO()){
  const week=monday(date);
  const h=week===data.weekStart?data:(data.history&&data.history[week]);
  return {weekStart:week,availability:h?.availability||{},assignments:h?.assignments||{},assignmentTimes:h?.assignmentTimes||{}};
}
function timeRangeForDate(employee,date,shift){
  const d=plannedDayNameForDate(date); if(!employee||!d)return '';
  const snapshot=planningSnapshotForDate(date);
  const custom=snapshot.assignmentTimes?.[employee.id]?.[d]?.[shift];
  if(custom)return custom;
  const zone=snapshot.assignments?.[employee.id]?.[d]?.[shift]||suggestZone(employee,shift);
  const rule=zoneRules.find(r=>r.zone===zone);
  return rule?(shift==='Lunch'?rule.lunch:rule.evening):(shift==='Lunch'?'11:00-15:00':'17:50-23:00');
}
function slotHoursForDate(employee,date,shift){
  const d=plannedDayNameForDate(date); if(!employee||!d)return 0;
  const snapshot=planningSnapshotForDate(date);
  return snapshot.availability?.[employee.id]?.[d]?.[shift]?hoursFromRange(timeRangeForDate(employee,date,shift)):0;
}
function plannedHoursForDate(employee,date=todayISO()){
  if(!employee)return 0;
  return shifts.reduce((sum,sh)=>sum+slotHoursForDate(employee,date,sh),0);
}
function plannedShiftSummary(employee,date=todayISO()){
  const d=plannedDayNameForDate(date); if(!employee||!d)return [];
  const snapshot=planningSnapshotForDate(date);
  return shifts.filter(sh=>slotHoursForDate(employee,date,sh)>0).map(sh=>({shift:sh,h:slotHoursForDate(employee,date,sh),zone:snapshot.assignments?.[employee.id]?.[d]?.[sh]||suggestZone(employee,sh),range:timeRangeForDate(employee,date,sh)}));
}
function minutesFromText(value){let m=String(value||'').match(/(\d{1,2}):(\d{2})/);return m?Number(m[1])*60+Number(m[2]):NaN}
function rangeWindow(range){
  if(!range||range==='-'||!range.includes('-'))return null;
  let [a,b]=range.split('-').map(x=>x.trim()),start=minutesFromText(a),end=minutesFromText(b);
  if(!Number.isFinite(start)||!Number.isFinite(end))return null;
  if(end<start)end+=1440;
  return {start,end};
}
function distanceToWindow(nowMin,win){
  if(!win)return 99999;
  const candidates=[nowMin,nowMin+1440,nowMin-1440];
  return Math.min(...candidates.map(n=>n>=win.start&&n<=win.end?0:Math.min(Math.abs(n-win.start),Math.abs(n-win.end))));
}
function inferShiftForEmployee(employee,date=todayISO(),now=nowLocal()){
  const planned=plannedShiftSummary(employee,date);
  if(!planned.length)return {shift:'Unplanned',zone:'',range:'',planned:false,label:'Unplanned entry'};
  const nowMin=now.getHours()*60+now.getMinutes();
  const scored=planned.map(p=>({p,score:distanceToWindow(nowMin,rangeWindow(p.range))})).sort((a,b)=>a.score-b.score);
  const best=scored[0]?.p||planned[0];
  return {shift:best.shift,zone:best.zone,range:best.range,planned:true,label:`${best.shift} · ${best.zone} · ${best.range}`};
}
function actualHoursForDate(employeeId,date=todayISO(),live=false){return entriesForDate(date).filter(e=>e.employeeId===employeeId).reduce((sum,e)=>sum+timeEntryHours(e,live),0)}

function entriesForEmployeeDate(employeeId,date=todayISO()){
  return entriesForDate(date).filter(e=>e.employeeId===employeeId).sort((a,b)=>String(a.clockIn||'').localeCompare(String(b.clockIn||'')));
}
function isoFromDateAndTime(date,time){
  const m=String(time||'').trim().match(/^(\d{1,2}):(\d{2})$/);
  if(!m)return '';
  const [y,mo,d]=String(date).split('-').map(Number);
  const h=Number(m[1]), mi=Number(m[2]);
  if(!y||!mo||!d||h>23||mi>59)return '';
  return new Date(y,mo-1,d,h,mi,0,0).toISOString();
}
function inputTimeFromISO(value){
  if(!value)return '';
  const d=new Date(value);
  if(Number.isNaN(d.getTime()))return '';
  return String(d.getHours()).padStart(2,'0')+':'+String(d.getMinutes()).padStart(2,'0');
}
function entryActualRange(entry){
  const out=entry.clockOut?formatClockTime(entry.clockOut):'Live';
  return `${formatClockTime(entry.clockIn)}–${out}`;
}
function entryStatusLabel(entry,date=todayISO()){
  if(!entry.clockOut)return date<todayISO()?'Missing out':'Clocked in';
  if(entry.rejectedAt)return 'Rejected';
  if(entry.updatedByManager||String(entry.managerNote||'').trim())return 'Edited';
  return 'Approved';
}
function entryStatusClass(entry,date=todayISO()){
  if(entry.rejectedAt)return 'rejected';
  if(!entry.clockOut)return date<todayISO()?'missing':'open';
  if(entry.updatedByManager||String(entry.managerNote||'').trim())return 'edited';
  return 'approved';
}
function dayTimesheetStatus(planned,entries,date){
  const activeEntries=(entries||[]).filter(e=>!e.rejectedAt);
  if(activeEntries.some(e=>!e.clockOut))return date<todayISO()?'missing':'open';
  if(activeEntries.length)return activeEntries.some(e=>entryStatusClass(e,date)==='edited')?'edited':'approved';
  if(planned>0 && date<todayISO())return 'missing';
  if(planned>0)return 'planned';
  return 'empty';
}
function timesheetPlanItems(employee,date){
  return plannedShiftSummary(employee,date).map(p=>`<span class="timesheet-plan-pill">${esc(p.shift)} · ${esc(displayTimeRange(p.range))}${p.zone?` · ${esc(p.zone)}`:''}</span>`).join('');
}
function normalizeTimesheetSlot(shift='',entry=null){
  const key=String(shift||'').trim().toLowerCase();
  if(key.includes('lunch'))return 'Lunch';
  if(key.includes('evening'))return 'Evening';
  const src=entry&&entry.clockIn?new Date(entry.clockIn):null;
  const hour=src && !Number.isNaN(src.getTime()) ? src.getHours() : null;
  if(hour!==null)return hour<16?'Lunch':'Evening';
  return 'Evening';
}
function timesheetEntryCard(entry,date,compact=false){
  const status=entryStatusLabel(entry,date);
  const statusClass=entryStatusClass(entry,date);
  const actualHours=fmtHours(timeEntryHours(entry,true));
  const note=String(entry.managerNote||'').trim();
  const subline=[entry.zone||'', actualHours].filter(Boolean).join(' · ');
  const liveBadge=statusClass==='open'?'<span class="timesheet-live-pill"><i></i>LIVE</span>':(statusClass==='approved'?'':`<span class="timesheet-status ${statusClass}">${esc(status)}</span>`);
  return `<div class="timesheet-entry-card ${compact?'compact ':''}${statusClass}"><div class="timesheet-entry-top"><strong>${esc(entryActualRange(entry))}</strong></div><small>${subline?esc(subline):esc(actualHours)}</small>${note?`<em>${esc(note)}</em>`:''}${liveBadge}</div>`;
}
function openTimesheetSlot(employeeId,date,slot){
  const entries=entriesForEmployeeDate(employeeId,date).filter(e=>!e.rejectedAt && normalizeTimesheetSlot(e.shift)===slot);
  if(entries.length){ editTimesheetEntry(entries[0].id); return; }
  addTimesheetEntry(employeeId,date,slot);
}
function timesheetShiftBlock(label,entries,date,employeeId){
  const stateClass=entries.length?entryStatusClass(entries[0],date):'empty';
  if(!entries.length){
    return `<button type="button" class="timesheet-shift-block empty clickable ${stateClass}" onclick="openTimesheetSlot('${employeeId}','${date}','${label}')"><div class="timesheet-shift-head"><span>${esc(label)}</span></div><strong>—</strong></button>`;
  }
  return `<button type="button" class="timesheet-shift-block clickable ${stateClass}" onclick="openTimesheetSlot('${employeeId}','${date}','${label}')"><div class="timesheet-shift-head"><span>${esc(label)}</span></div><div class="timesheet-shift-list">${entries.map(entry=>timesheetEntryCard(entry,date,true)).join('')}</div></button>`;
}
function timesheetDayCard(employee,date,label){
  const planned=plannedHoursForDate(employee,date);
  const entries=entriesForEmployeeDate(employee.id,date).filter(e=>!e.rejectedAt);
  const actual=entries.reduce((sum,e)=>sum+timeEntryHours(e,true),0);
  const state=dayTimesheetStatus(planned,entries,date);
  const grouped={Lunch:[],Evening:[]};
  entries.forEach(entry=>grouped[normalizeTimesheetSlot(entry.shift,entry)].push(entry));
  const totalHtml=actual>0?`<b class="timesheet-day-total">${fmtHours(actual)}</b>`:'';
  return `<article class="timesheet-day-card compact ${state}"><div class="timesheet-day-head"><span>${esc(label.slice(0,3))}</span><small>${esc(shortDisplayDate(date))}</small>${totalHtml}</div><div class="timesheet-day-slots horizontal">${timesheetShiftBlock('Lunch',grouped.Lunch,date,employee.id)}${timesheetShiftBlock('Evening',grouped.Evening,date,employee.id)}</div></article>`;
}
function renderWeeklyTimesheet(){
  const el=$('weeklyTimesheet'); if(!el||!data)return;
  const start=data.weekStart;
  if($('weeklyTimesheetWeek'))weeklyTimesheetWeek.textContent=weekDisplayRange();
  const dates=days.map((d,i)=>addDays(start,i));
  const rows=activeEmployees().map(employee=>{
    const plannedTotal=dates.reduce((sum,date)=>sum+plannedHoursForDate(employee,date),0);
    const actualEntries=dates.flatMap(date=>entriesForEmployeeDate(employee.id,date).filter(e=>!e.rejectedAt));
    const actualTotal=actualEntries.reduce((s,e)=>s+timeEntryHours(e,true),0);
    return {employee,plannedTotal,actualTotal,entryCount:actualEntries.length,hasEntries:!!actualEntries.length};
  }).filter(r=>r.plannedTotal||r.actualTotal||r.hasEntries);
  if(!rows.length){el.innerHTML='<p class="muted">No time entries for this week yet.</p>';return;}
  el.innerHTML=`<div class="weekly-timesheet-cards compact">${rows.map(r=>`<section class="timesheet-employee-card compact"><div class="timesheet-employee-head compact"><div><strong>${esc(r.employee.name)}</strong><small>${esc(r.employee.position)}</small></div><div class="timesheet-employee-summary single compact"><div><span>Actual</span><strong>${fmtHours(r.actualTotal)}</strong></div></div></div><div class="weekly-timesheet-scroll"><div class="timesheet-days-grid compact">${dates.map((date,i)=>timesheetDayCard(r.employee,date,days[i])).join('')}</div></div></section>`).join('')}</div>`;
}
window.editTimesheetEntry=entryId=>{
  const entry=(data.timeEntries||[]).find(e=>e.id===entryId); if(!entry)return;
  const rejectFirst=confirm('Edit this entry? Click OK to edit, or Cancel to keep it as-is.');
  if(!rejectFirst){
    if(confirm('Reject this entry? It will be hidden from totals and exports.')){
      entry.rejectedAt=nowISO();entry.rejectedBy='manager';entry.updatedAt=nowISO();save();render();
    }
    return;
  }
  const date=entry.date||todayISO();
  const inValue=prompt('Clock-in time (HH:MM)', inputTimeFromISO(entry.clockIn)||'');
  if(inValue===null)return;
  const inISO=isoFromDateAndTime(date,inValue);
  if(!inISO){alert('Use clock-in format HH:MM, for example 11:07.');return;}
  const outValue=prompt('Clock-out time (HH:MM). Leave empty if still open.', inputTimeFromISO(entry.clockOut)||'');
  let outISO='';
  if(outValue!==null && String(outValue||'').trim()){
    outISO=isoFromDateAndTime(date,outValue);
    if(!outISO){alert('Use clock-out format HH:MM, for example 15:02.');return;}
    if(new Date(outISO).getTime()<=new Date(inISO).getTime()){
      const d=new Date(outISO); d.setDate(d.getDate()+1); outISO=d.toISOString();
    }
  }else if(outValue===null){return;}
  const note=prompt('Manager note (optional)', entry.managerNote||'');
  if(note===null)return;
  entry.rejectedAt='';
  entry.clockIn=inISO;
  entry.clockOut=outISO;
  entry.date=date;
  entry.status=outISO?'closed':'open';
  entry.approvalStatus=outISO?'approved':'pending';
  entry.managerNote=String(note||'').trim();
  entry.updatedByManager=true;
  if(outISO)entry.approvedAt=nowISO();
  entry.updatedAt=nowISO();
  save();render();
};
window.addTimesheetEntry=(employeeId,date,forcedShift='')=>{
  const employee=emp(employeeId); if(!employee)return;
  const planned=plannedShiftSummary(employee,date);
  const defaultShift=forcedShift||planned[0]?.shift||'Lunch';
  const shift=prompt('Shift name', defaultShift);
  if(shift===null)return;
  const match=planned.find(p=>p.shift.toLowerCase()===String(shift||'').trim().toLowerCase())||planned[0]||{};
  const range=match.range||timeRangeForDate(employee,date,defaultShift)||'11:00-15:00';
  const [startDefault,endDefault]=String(range).split('-').map(x=>x.trim());
  const inValue=prompt('Clock-in time (HH:MM)', startDefault||'');
  if(inValue===null)return;
  const inISO=isoFromDateAndTime(date,inValue);
  if(!inISO){alert('Use clock-in format HH:MM.');return;}
  const outValue=prompt('Clock-out time (HH:MM)', endDefault||'');
  if(outValue===null)return;
  const outISOBase=isoFromDateAndTime(date,outValue);
  if(!outISOBase){alert('Use clock-out format HH:MM.');return;}
  let outDate=new Date(outISOBase);
  if(outDate.getTime()<=new Date(inISO).getTime())outDate.setDate(outDate.getDate()+1);
  const note=prompt('Manager note (optional)', 'Added by manager');
  if(note===null)return;
  data.timeEntries=data.timeEntries||[];
  data.timeEntries.push({id:id(),employeeId,date,clockIn:inISO,clockOut:outDate.toISOString(),shift:String(shift||match.shift||defaultShift).trim()||'Shift',zone:match.zone||'',range:match.range||range,planned:!!match.shift,source:'manager',status:'closed',approvalStatus:'approved',createdAt:nowISO(),updatedAt:nowISO(),approvedAt:nowISO(),managerNote:String(note||'').trim(),updatedByManager:true,photos:{}});
  save();render();
};
window.approveTimesheetEntry=entryId=>{
  const entry=(data.timeEntries||[]).find(e=>e.id===entryId); if(!entry)return;
  entry.approvalStatus='approved';entry.approvedAt=nowISO();entry.updatedAt=nowISO();save();render();
};
function cameraAvailable(){return !!(navigator.mediaDevices&&navigator.mediaDevices.getUserMedia)}
async function captureTimeClockPhoto(kind='proof'){
  const at=nowISO();
  if(!cameraAvailable())return {status:'missing',capturedAt:at,error:'Camera unavailable',dataUrl:''};
  let stream=null;
  try{
    stream=await navigator.mediaDevices.getUserMedia({audio:false,video:{facingMode:'user',width:{ideal:360},height:{ideal:270}}});
    const video=document.createElement('video');
    video.muted=true;video.playsInline=true;video.srcObject=stream;
    await new Promise((resolve,reject)=>{video.onloadedmetadata=resolve;video.onerror=reject;setTimeout(resolve,900)});
    await video.play().catch(()=>{});
    const sourceW=video.videoWidth||360,sourceH=video.videoHeight||270;
    const maxW=240,maxH=180,ratio=Math.min(maxW/sourceW,maxH/sourceH,1);
    const w=Math.max(120,Math.round(sourceW*ratio)),h=Math.max(90,Math.round(sourceH*ratio));
    const canvas=document.createElement('canvas');canvas.width=w;canvas.height=h;
    const ctx=canvas.getContext('2d');ctx.drawImage(video,0,0,w,h);
    const dataUrl=canvas.toDataURL('image/jpeg',.58);
    return {status:'captured',capturedAt:at,kind,dataUrl};
  }catch(err){
    return {status:'missing',capturedAt:at,error:(err&&err.name)||'Camera error',dataUrl:''};
  }finally{
    if(stream)stream.getTracks().forEach(t=>t.stop());
  }
}
function timeClockEntryPhoto(entry,kind='clockIn'){
  const photos=entry?.photos||{};
  return photos[kind]||null;
}
function timeClockPhotoThumb(entry,kind='clockIn'){
  const photo=timeClockEntryPhoto(entry,kind);
  const label=kind==='clockOut'?'Out photo':'In photo';
  if(photo?.dataUrl)return `<button type="button" class="photo-proof-thumb" title="${label}" onclick="openTimeClockPhoto('${entry.id}','${kind}')"><img src="${photo.dataUrl}" alt="${label}"><span>${kind==='clockOut'?'Out':'In'}</span></button>`;
  return `<span class="photo-proof-missing" title="${esc(photo?.error||'Photo missing')}">${kind==='clockOut'?'Out':'In'} —</span>`;
}
function timeClockPhotoCell(entry){
  return `<div class="photo-proof-list">${timeClockPhotoThumb(entry,'clockIn')}${entry.clockOut?timeClockPhotoThumb(entry,'clockOut'):''}</div>`;
}
window.openTimeClockPhoto=(entryId,kind='clockIn')=>{
  const entry=(data.timeEntries||[]).find(e=>e.id===entryId);
  const photo=timeClockEntryPhoto(entry,kind);
  if(!photo?.dataUrl)return alert('No photo available for this entry.');
  const w=window.open('','_blank','noopener,noreferrer,width=520,height=620');
  if(!w){alert('Popup blocked.');return;}
  w.document.write(`<title>Time Clock photo</title><body style="margin:0;background:#090d14;color:white;font-family:Inter,Segoe UI,Arial,sans-serif;display:grid;place-items:center;min-height:100vh"><main style="padding:24px;text-align:center"><img src="${photo.dataUrl}" style="max-width:92vw;max-height:78vh;border-radius:24px;box-shadow:0 30px 90px rgba(0,0,0,.45)"><p style="opacity:.75;font-weight:800">${esc(kind==='clockOut'?'Clock-out photo':'Clock-in photo')} · ${esc(formatClockTime(photo.capturedAt))}</p></main></body>`);
  w.document.close();
};
function isTimeClockAuthorized(employee){return !!employee && timeClockAuthorizedEmployeeId===employee.id}
function renderTerminalEmployeeList(){
  const el=$('terminalEmployeeList'); if(!el||!data)return;
  const employees=activeEmployees();
  if(!employees.some(e=>e.id===timeClockEmployeeId))timeClockEmployeeId='';
  el.innerHTML=employees.map(e=>`<button type="button" class="terminal-employee-btn ${e.id===timeClockEmployeeId?'active':''}" onclick="setTimeClockEmployee('${e.id}')"><span>${esc(e.name.charAt(0).toUpperCase())}</span><strong>${esc(e.name)}</strong></button>`).join('')||'<p class="muted">No active employees yet.</p>';
}
function renderTerminalPinDots(){
  const el=$('terminalPinDots'); if(!el)return;
  const n=Math.max(4,Math.min(6,String(timeClockPin||'').length||4));
  el.innerHTML=Array.from({length:n}).map((_,i)=>`<span class="${i<timeClockPin.length?'filled':''}"></span>`).join('');
}
function renderTerminalPanel(){
  if(!$('terminalSelectedCard')||!data)return;
  const employee=selectedClockEmployee();
  const actionPanel=document.querySelector('.terminal-action-panel');
  actionPanel?.classList.toggle('no-employee',!employee && timeClockFeedbackState!=='success');
  actionPanel?.classList.toggle('pin-error',timeClockFeedbackState==='error');
  actionPanel?.classList.toggle('pin-success',timeClockFeedbackState==='success');
  actionPanel?.classList.toggle('pin-busy',timeClockBusy);
  const pinArea=document.querySelector('.terminal-pin-area');
  if(pinArea)pinArea.hidden=(!employee || timeClockFeedbackState==='success');

  if(!employee){
    terminalSelectedCard.innerHTML='<div class="terminal-empty-state"><div class="terminal-empty-glyph" aria-hidden="true">👆</div><strong class="terminal-empty-copy">Tap your name</strong></div>';
    renderTerminalPinDots();
    if($('terminalAction')){terminalAction.textContent='';terminalAction.disabled=true;terminalAction.classList.remove('clockout');}
    if($('terminalMessage')){terminalMessage.textContent=timeClockMessageText||'';terminalMessage.className='terminal-message';}
    return;
  }
  const open=openTimeEntry(employee.id);
  const isClockOut=!!open;
  if(timeClockFeedbackState==='success'){
    terminalSelectedCard.innerHTML=`<div class="terminal-success-card"><div class="terminal-success-icon">✓</div><span>Validated</span><strong>${esc(timeClockMessageText||'Done')}</strong><small>${esc(timeClockSuccessDateText||formatClockSuccessDate(nowLocal()))}</small></div>`;
  }else{
    terminalSelectedCard.innerHTML=`<div class="terminal-selected-avatar">${esc(employee.name.charAt(0).toUpperCase())}</div><div><span>${timeClockBusy?'Capturing photo…':(isClockOut?'Check-out PIN':'Check-in PIN')}</span><strong>${esc(employee.name)}</strong></div>`;
  }
  renderTerminalPinDots();
  if($('terminalAction')){
    terminalAction.textContent=isClockOut?'Check out':'Check in';
    terminalAction.disabled=true;
    terminalAction.classList.toggle('clockout',isClockOut);
  }
  if($('terminalMessage')){
    terminalMessage.textContent=timeClockFeedbackState==='error'?(timeClockMessageText||'Wrong PIN. Please try again.'):(timeClockBusy?'Capturing photo…':'');
    terminalMessage.className='terminal-message '+(timeClockFeedbackState==='error'?'error':timeClockFeedbackState==='success'?'success':'');
  }
}
function renderTimeClock(){
  if(!data)return;
  const now=nowLocal();
  const date=todayISO();
  if($('timeClockLiveTime'))timeClockLiveTime.textContent=formatClockTime(now);
  if($('timeClockLiveDate'))timeClockLiveDate.textContent=formatClockDate(now);
  if($('timeClockTodayLabel'))timeClockTodayLabel.textContent=date;
  if($('terminalLiveTime'))terminalLiveTime.textContent=formatClockTime(now);
  if($('terminalLiveDate'))terminalLiveDate.textContent=formatClockDate(now);
  fillSelectors();
  const employee=selectedClockEmployee();
  if(employee&&$('timeClockEmployee'))timeClockEmployee.value=employee.id;
  if($('timeClockPin'))$('timeClockPin').value=timeClockPin;

  renderTerminalEmployeeList();
  renderTerminalPanel();

  const entries=entriesForDate(date);
  const openEntries=entries.filter(e=>!e.clockOut);
  const completed=entries.filter(e=>e.clockOut);
  const totalActual=entries.reduce((sum,e)=>sum+timeEntryHours(e,true),0);
  if($('timeClockStats'))timeClockStats.innerHTML=`<div><span>Clocked in now</span><strong>${openEntries.length}</strong></div><div><span>Actual hours today</span><strong>${fmtHours(totalActual)}</strong></div><div><span>Entries</span><strong>${entries.length}</strong></div><div><span>Completed</span><strong>${completed.length}</strong></div>`;
  if($('timeClockNow')){
    timeClockNow.innerHTML=openEntries.length?openEntries.map(entry=>{let e=emp(entry.employeeId);return `<div class="clocked-in-card"><strong>${esc(e?.name||'Employee')}</strong><span>${esc(entry.shift||'Shift')} · since ${formatClockTime(entry.clockIn)} · ${fmtHours(timeEntryHours(entry,true))}</span><button type="button" class="secondary" onclick="managerClockOutNow('${entry.id}')">Clock out now</button></div>`}).join(''):'<p class="muted">Nobody is clocked in right now.</p>';
  }
  if($('timeClockEntries')){
    timeClockEntries.innerHTML=entries.length?`<table class="data timeclock-table"><thead><tr><th>Employee</th><th>Matched shift</th><th>In</th><th>Out</th><th>Hours</th><th>Photo</th><th></th></tr></thead><tbody>${entries.map(entry=>{let e=emp(entry.employeeId);let open=!entry.clockOut;let shift=entry.planned===false?'Unplanned':(entry.shift||'Shift');return `<tr class="${open?'open-entry':''}"><td><strong>${esc(e?.name||'Employee')}</strong><br><small>${esc(e?.position||'')}</small></td><td><strong>${esc(shift)}</strong><br><small>${esc(entry.zone||entry.range||'')}</small></td><td>${formatClockTime(entry.clockIn)}</td><td>${open?'<span class="live-dot">Live</span>':formatClockTime(entry.clockOut)}</td><td><strong>${fmtHours(timeEntryHours(entry,true))}</strong></td><td>${timeClockPhotoCell(entry)}</td><td class="entry-actions"><button type="button" class="secondary mini" onclick="managerClockOutNow('${entry.id}')" ${open?'':'disabled'}>Close</button><button type="button" class="danger mini" onclick="deleteTimeEntry('${entry.id}')">Delete</button></td></tr>`}).join('')}</tbody></table>`:'<p class="muted">No time entries today yet.</p>';
  }
  if($('timeClockCompare')){
    const rows=activeEmployees().map(e=>{const planned=plannedHoursForDate(e,date);const actual=actualHoursForDate(e.id,date,true);const delta=actual-planned;return {e,planned,actual,delta};}).filter(r=>r.planned||r.actual);
    timeClockCompare.innerHTML=rows.length?`<table class="data timeclock-table"><thead><tr><th>Employee</th><th>Planned</th><th>Actual</th><th>Delta</th></tr></thead><tbody>${rows.map(r=>`<tr><td><strong>${esc(r.e.name)}</strong><br><small>${esc(r.e.position)}</small></td><td>${fmtHours(r.planned)}</td><td>${fmtHours(r.actual)}</td><td><strong class="${r.delta>0.25?'delta-plus':r.delta<-0.25?'delta-minus':'delta-ok'}">${r.delta>0?'+':''}${fmtHours(r.delta)}</strong></td></tr>`).join('')}</tbody></table>`:'<p class="muted">No planned or actual hours today.</p>';
  }
  renderWeeklyTimesheet();
  renderTimeClockView();
}
window.setTimeClockEmployee=value=>{timeClockEmployeeId=value;timeClockPin='';timeClockAuthorizedEmployeeId='';timeClockMessageText='';timeClockFeedbackState='';timeClockSuccessDateText='';if(timeClockResetTimer)clearTimeout(timeClockResetTimer);renderTimeClock();};
window.setTimeClockPin=value=>{timeClockPin=sanitizePin(value);timeClockAuthorizedEmployeeId='';timeClockFeedbackState='';timeClockSuccessDateText='';const el=$('timeClockPin');if(el&&el.value!==timeClockPin)el.value=timeClockPin;renderTimeClock();};
window.pressTimeClockPin=digit=>{if(timeClockBusy||timeClockFeedbackState==='success'||!selectedClockEmployee()||timeClockPin.length>=4)return;timeClockPin=sanitizePin(timeClockPin+digit);timeClockAuthorizedEmployeeId='';timeClockMessageText='';timeClockFeedbackState='';timeClockSuccessDateText='';renderTimeClock();if(timeClockPin.length===4){setTimeout(()=>submitTimeClock(),90);}};
window.backspaceTimeClockPin=()=>{if(timeClockBusy||timeClockFeedbackState==='success'||!selectedClockEmployee())return;timeClockPin=timeClockPin.slice(0,-1);timeClockAuthorizedEmployeeId='';timeClockMessageText='';timeClockFeedbackState='';timeClockSuccessDateText='';renderTimeClock();};
window.clearTimeClockPin=()=>{if(timeClockBusy||!selectedClockEmployee())return;timeClockPin='';timeClockAuthorizedEmployeeId='';timeClockMessageText='';timeClockFeedbackState='';timeClockSuccessDateText='';renderTimeClock();};
window.resetTimeClockTerminal=()=>{timeClockEmployeeId='';timeClockPin='';timeClockAuthorizedEmployeeId='';timeClockMessageText='';timeClockFeedbackState='';timeClockSuccessDateText='';timeClockBusy=false;if(timeClockResetTimer)clearTimeout(timeClockResetTimer);renderTimeClock();};
window.submitTimeClock=async()=>{
  if(timeClockBusy)return;
  const employee=selectedClockEmployee();
  if(!employee){timeClockMessageText='Select your name first.';timeClockFeedbackState='error';renderTimeClock();return;}
  const expected=sanitizePin(employee.pin)||PROTOTYPE_PIN;
  if(!expected){timeClockMessageText='This employee has no PIN yet. Ask the manager.';timeClockFeedbackState='error';renderTimeClock();return;}
  if(sanitizePin(timeClockPin)!==expected){
    timeClockPin='';
    timeClockMessageText='Wrong PIN. Please try again.';
    timeClockFeedbackState='error';
    renderTimeClock();
    return;
  }
  timeClockBusy=true;
  timeClockMessageText='';
  timeClockFeedbackState='';
  renderTimeClock();
  const open=openTimeEntry(employee.id);
  const kind=open?'clockOut':'clockIn';
  const proof=await captureTimeClockPhoto(kind);
  const actionTime=nowISO();
  if(open){
    open.clockOut=actionTime;open.status='closed';open.approvalStatus='approved';open.approvedAt=actionTime;open.updatedAt=actionTime;
    open.photos=open.photos||{};open.photos.clockOut=proof;
    timeClockMessageText=`Checked out at ${formatClockTime(actionTime)}`;
  }else{
    const inferred=inferShiftForEmployee(employee,todayISO(),nowLocal());
    const entry={id:id(),employeeId:employee.id,date:todayISO(),clockIn:actionTime,clockOut:'',shift:inferred.shift,zone:inferred.zone||'',range:inferred.range||'',planned:!!inferred.planned,source:'terminal',status:'open',createdAt:actionTime,updatedAt:actionTime,managerNote:'',photos:{clockIn:proof}};
    data.timeEntries.push(entry);
    timeClockMessageText=`Checked in at ${formatClockTime(actionTime)}`;
  }
  timeClockPin='';
  timeClockAuthorizedEmployeeId='';
  timeClockSuccessDateText=formatClockSuccessDate(actionTime);
  timeClockFeedbackState='success';
  timeClockBusy=false;
  save();
  render();
  if(document.body.classList.contains('terminal-mode')){
    if(timeClockResetTimer)clearTimeout(timeClockResetTimer);
    timeClockResetTimer=setTimeout(()=>resetTimeClockTerminal(),2600);
  }
};
window.managerClockOutNow=entryId=>{const entry=(data.timeEntries||[]).find(e=>e.id===entryId);if(!entry||entry.clockOut)return;entry.clockOut=nowISO();entry.status='closed';entry.approvalStatus='approved';entry.approvedAt=nowISO();entry.updatedAt=nowISO();save();render();};
window.deleteTimeEntry=entryId=>{if(!confirm('Delete this time entry?'))return;data.timeEntries=(data.timeEntries||[]).filter(e=>e.id!==entryId);save();render();};


/* v173 Inventory MVP (reviewed) */
const inventoryDefaultCategories=['Food','Drinks','Alcohol','Wine','Beer','Soft drinks','Cleaning','Packaging','Other'];
const inventoryDefaultSuppliers=['Metro','Sligro','Local supplier','Wine supplier'];
const inventoryDefaultItems=[
  {name:'Tomatoes',category:'Food',unit:'kg',stock:12,minStock:5,cost:2.8,supplier:'Metro',location:'Fridge'},
  {name:'Burger buns',category:'Food',unit:'pcs',stock:64,minStock:24,cost:.42,supplier:'Local supplier',location:'Dry storage'},
  {name:'House red wine',category:'Wine',unit:'bottle',stock:18,minStock:12,cost:6.5,supplier:'Wine supplier',location:'Bar'},
  {name:'Sparkling water',category:'Soft drinks',unit:'bottle',stock:36,minStock:24,cost:.75,supplier:'Sligro',location:'Bar'},
  {name:'Takeaway boxes',category:'Packaging',unit:'pcs',stock:120,minStock:80,cost:.18,supplier:'Metro',location:'Storage'}
];
function ensureInventoryState(o=data){
  o.inventory=o.inventory&&typeof o.inventory==='object'?o.inventory:{};
  o.inventory.categories=Array.isArray(o.inventory.categories)&&o.inventory.categories.length?o.inventory.categories:[...inventoryDefaultCategories];
  o.inventory.suppliers=Array.isArray(o.inventory.suppliers)&&o.inventory.suppliers.length?o.inventory.suppliers:[...inventoryDefaultSuppliers];
  o.inventory.items=Array.isArray(o.inventory.items)?o.inventory.items:[];
  if(!o.inventory.items.length){
    o.inventory.items=inventoryDefaultItems.map((item,i)=>({id:'inv'+i,active:true,createdAt:nowISO(),updatedAt:nowISO(),...item}));
  }
  o.inventory.movements=Array.isArray(o.inventory.movements)?o.inventory.movements:[];
  o.inventory.counts=Array.isArray(o.inventory.counts)?o.inventory.counts:[];
  o.inventory.items=o.inventory.items.map((item,i)=>({
    id:item.id||('inv'+i+id()),
    name:String(item.name||'Item').trim()||'Item',
    category:String(item.category||'Other').trim()||'Other',
    unit:String(item.unit||'unit').trim()||'unit',
    stock:Number(item.stock||0),
    minStock:Number(item.minStock??item.par??0),
    cost:Number(item.cost??item.unitCost??0),
    supplier:String(item.supplier||'').trim(),
    location:String(item.location||item.storage||'').trim(),
    active:item.active!==false,
    createdAt:item.createdAt||nowISO(),
    updatedAt:item.updatedAt||nowISO()
  }));
  o.inventory.items.forEach(item=>{
    if(item.category&&!o.inventory.categories.includes(item.category))o.inventory.categories.push(item.category);
    if(item.supplier&&!o.inventory.suppliers.includes(item.supplier))o.inventory.suppliers.push(item.supplier);
  });
  return o.inventory;
}
function inventory(){return ensureInventoryState(data)}
function invItems(){return inventory().items.filter(item=>item.active!==false).sort((a,b)=>String(a.category).localeCompare(String(b.category))||String(a.name).localeCompare(String(b.name)))}
function invItem(id){return inventory().items.find(item=>item.id===id)}
function invQty(n,unit=''){const value=Number(n||0);const str=(Math.round(value*100)/100).toLocaleString(undefined,{maximumFractionDigits:2});return `${str}${unit?' '+unit:''}`}
function invValue(item){return Number(item.stock||0)*Number(item.cost||0)}
function invStatus(item){if(Number(item.stock||0)<=0)return 'out';if(Number(item.minStock||0)>0&&Number(item.stock||0)<=Number(item.minStock||0))return 'low';return 'ok'}
function invStatusLabel(item){const s=invStatus(item);return s==='out'?'Out':s==='low'?'Low':'OK'}
function invMovementLabel(type){return {in:'Stock in',out:'Stock out',waste:'Waste',count:'Count',edit:'Edit'}[type]||'Movement'}
function invMovementClass(type){return type==='in'?'in':type==='waste'?'waste':type==='count'?'count':'out'}
function invToday(){return localISO(new Date())}
function renderInventory(){
  if(!data||!$('inventoryKpis'))return;
  const inv=inventory(),items=invItems();
  const low=items.filter(item=>invStatus(item)==='low'),out=items.filter(item=>invStatus(item)==='out');
  const value=items.reduce((sum,item)=>sum+invValue(item),0);
  const movements=[...inv.movements].sort((a,b)=>String(b.createdAt||'').localeCompare(String(a.createdAt||''))).slice(0,12);
  inventoryKpis.innerHTML=`<div><span>Total value</span><strong>${money(value)}</strong><small>Estimated stock value</small></div><div><span>Items</span><strong>${items.length}</strong><small>Active inventory items</small></div><div><span>Low stock</span><strong>${low.length}</strong><small>At or below minimum</small></div><div><span>Out of stock</span><strong>${out.length}</strong><small>Needs urgent reorder</small></div>`;
  inventoryLowList.innerHTML=(low.length||out.length)?[...out,...low].slice(0,8).map(item=>`<article class="inventory-alert ${invStatus(item)}"><span>${esc(invStatusLabel(item))}</span><strong>${esc(item.name)}</strong><small>${esc(invQty(item.stock,item.unit))} · min ${esc(invQty(item.minStock,item.unit))}</small></article>`).join(''):'<article class="inventory-alert ok"><span>OK</span><strong>Stock looks healthy</strong><small>No low-stock alerts right now.</small></article>';
  inventoryItems.innerHTML=items.length?`<table class="data inventory-table"><thead><tr><th>Item</th><th>Stock</th><th>Min</th><th>Value</th><th>Supplier</th><th>Storage</th><th></th></tr></thead><tbody>${items.map(item=>`<tr class="inventory-row ${invStatus(item)}"><td><strong>${esc(item.name)}</strong><small>${esc(item.category)} · ${esc(item.unit)}</small></td><td><strong>${esc(invQty(item.stock,item.unit))}</strong><span class="inventory-stock-status ${invStatus(item)}">${esc(invStatusLabel(item))}</span></td><td>${esc(invQty(item.minStock,item.unit))}</td><td>${money(invValue(item))}<small>${money(item.cost)} / ${esc(item.unit)}</small></td><td>${esc(item.supplier||'—')}</td><td>${esc(item.location||'—')}</td><td class="inventory-row-actions"><button class="mini primary" onclick="inventoryMovement('${item.id}','in')">In</button><button class="mini secondary" onclick="inventoryMovement('${item.id}','out')">Out</button><button class="mini secondary" onclick="inventoryMovement('${item.id}','count')">Count</button><button class="mini danger" onclick="inventoryMovement('${item.id}','waste')">Waste</button><button class="mini secondary" onclick="editInventoryItem('${item.id}')">Edit</button></td></tr>`).join('')}</tbody></table>`:'<p class="muted">No items yet.</p>';
  inventoryMovements.innerHTML=movements.length?`<div class="inventory-movement-list">${movements.map(m=>{const item=inv.items.find(x=>x.id===m.itemId);return `<article class="inventory-movement ${invMovementClass(m.type)}"><div><span>${esc(invMovementLabel(m.type))}</span><strong>${esc(item?.name||m.itemName||'Item')}</strong><small>${esc(m.date||'')} · ${esc(m.note||'No note')}</small></div><b>${m.type==='count'?'→ ':m.type==='in'?'+':'-'}${esc(invQty(Math.abs(Number(m.qty||0)),item?.unit||m.unit||''))}</b></article>`}).join('')}</div>`:'<p class="muted">No stock movements yet.</p>';
  inventorySuppliers.innerHTML=`<div class="inventory-supplier-grid">${inv.suppliers.map(s=>`<span>${esc(s)}</span>`).join('')}</div><p class="muted">Use Count on an item when the real stock differs from expected stock.</p>`;
}
function inventoryPromptNumber(label,current=0){const value=prompt(label,String(current??0));if(value===null)return null;const n=Number(String(value).replace(',','.'));if(!Number.isFinite(n)){alert('Please enter a number.');return null;}return n}
window.addInventorySupplier=()=>{const name=prompt('Supplier name');if(!name)return;const inv=inventory();const clean=String(name).trim();if(clean&&!inv.suppliers.includes(clean))inv.suppliers.push(clean);save();render()};
window.addInventoryItem=()=>{
  const inv=inventory();
  const name=prompt('Item name, for example Tomatoes'); if(!name)return;
  const category=prompt('Category',inv.categories[0]||'Food'); if(category===null)return;
  const unit=prompt('Unit, for example kg, L, bottle, pcs, case','kg'); if(unit===null)return;
  const stock=inventoryPromptNumber('Current stock quantity',0); if(stock===null)return;
  const minStock=inventoryPromptNumber('Minimum / par stock quantity',0); if(minStock===null)return;
  const cost=inventoryPromptNumber('Cost per unit (€)',0); if(cost===null)return;
  const supplier=prompt('Supplier',inv.suppliers[0]||''); if(supplier===null)return;
  const location=prompt('Storage location, for example Fridge, Freezer, Bar, Dry storage','Dry storage'); if(location===null)return;
  const item={id:id(),name:String(name).trim(),category:String(category||'Other').trim()||'Other',unit:String(unit||'unit').trim()||'unit',stock,minStock,cost,supplier:String(supplier||'').trim(),location:String(location||'').trim(),active:true,createdAt:nowISO(),updatedAt:nowISO()};
  inv.items.push(item);
  if(item.category&&!inv.categories.includes(item.category))inv.categories.push(item.category);
  if(item.supplier&&!inv.suppliers.includes(item.supplier))inv.suppliers.push(item.supplier);
  inv.movements.unshift({id:id(),itemId:item.id,itemName:item.name,type:'count',qty:stock,previousStock:0,newStock:stock,unit:item.unit,unitCost:cost,date:invToday(),note:'Initial stock',createdAt:nowISO()});
  save();render();
};
window.editInventoryItem=itemId=>{
  const item=invItem(itemId); if(!item)return;
  const name=prompt('Item name',item.name); if(name===null)return;
  const category=prompt('Category',item.category); if(category===null)return;
  const unit=prompt('Unit',item.unit); if(unit===null)return;
  const minStock=inventoryPromptNumber('Minimum / par stock quantity',item.minStock); if(minStock===null)return;
  const cost=inventoryPromptNumber('Cost per unit (€)',item.cost); if(cost===null)return;
  const supplier=prompt('Supplier',item.supplier||''); if(supplier===null)return;
  const location=prompt('Storage location',item.location||''); if(location===null)return;
  Object.assign(item,{name:String(name).trim()||item.name,category:String(category||'Other').trim()||'Other',unit:String(unit||'unit').trim()||'unit',minStock,cost,supplier:String(supplier||'').trim(),location:String(location||'').trim(),updatedAt:nowISO()});
  const inv=inventory(); if(item.category&&!inv.categories.includes(item.category))inv.categories.push(item.category); if(item.supplier&&!inv.suppliers.includes(item.supplier))inv.suppliers.push(item.supplier);
  save();render();
};
window.inventoryMovement=(itemId,type)=>{
  const item=invItem(itemId); if(!item)return;
  let qty=null,note='',newStock=Number(item.stock||0),previousStock=Number(item.stock||0),unitCost=Number(item.cost||0);
  if(type==='count'){
    qty=inventoryPromptNumber(`Actual counted quantity for ${item.name} (${item.unit})`,item.stock); if(qty===null)return;
    newStock=qty; note=prompt('Count note','Stock count')||'Stock count';
  }else{
    qty=inventoryPromptNumber(`${invMovementLabel(type)} quantity for ${item.name} (${item.unit})`,0); if(qty===null||qty<=0)return;
    if(type==='in'){
      newStock=previousStock+qty;
      const cost=inventoryPromptNumber('Unit cost for this delivery (€). Leave current if unchanged.',item.cost); if(cost===null)return; unitCost=cost; item.cost=cost;
      note=prompt('Delivery / stock-in note',item.supplier||'Delivery')||'Stock in';
    }else if(type==='out'){
      newStock=Math.max(0,previousStock-qty); note=prompt('Stock-out reason','Used by kitchen/bar')||'Stock out';
    }else if(type==='waste'){
      newStock=Math.max(0,previousStock-qty); note=prompt('Waste reason','Expired / spoiled / broken')||'Waste';
    }
  }
  item.stock=Number(newStock); item.updatedAt=nowISO();
  inventory().movements.unshift({id:id(),itemId:item.id,itemName:item.name,type,qty:type==='count'?newStock-previousStock:qty,previousStock,newStock,unit:item.unit,unitCost,date:invToday(),note:String(note||'').trim(),createdAt:nowISO()});
  if(type==='count')inventory().counts.unshift({id:id(),itemId:item.id,itemName:item.name,previousStock,newStock,unit:item.unit,date:invToday(),note:String(note||'').trim(),createdAt:nowISO()});
  save();render();
};
window.exportInventoryCsv=()=>{
  const inv=inventory();
  const lines=[['Item','Category','Unit','Stock','Minimum','Cost per unit','Stock value','Supplier','Storage'].join(',')];
  invItems().forEach(item=>lines.push([item.name,item.category,item.unit,item.stock,item.minStock,item.cost,invValue(item).toFixed(2),item.supplier,item.location].map(v=>`"${String(v??'').replaceAll('"','""')}"`).join(',')));
  const blob=new Blob([lines.join('\n')],{type:'text/csv;charset=utf-8'}); const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download=slugifyWorkspace(restaurantName())+'-inventory.csv'; a.click(); URL.revokeObjectURL(a.href);
};


/* v175 Daily Close / Payments module */
const dailyClosePaymentMethods=[
  ['cash','Cash'],['bancontact','Bancontact'],['visaMastercard','Visa / Mastercard'],['amex','Amex'],['mealVouchers','Meal vouchers'],['giftCards','Gift cards'],['deliveryPlatforms','Delivery platforms'],['bankTransfer','Bank transfer / invoice'],['other','Other']
];
function ensureDailyCloseState(o=data){
  o.dailyClose=o.dailyClose&&typeof o.dailyClose==='object'?o.dailyClose:{};
  o.dailyClose.closings=o.dailyClose.closings&&typeof o.dailyClose.closings==='object'?o.dailyClose.closings:{};
  o.dailyClose.paymentMethods=Array.isArray(o.dailyClose.paymentMethods)&&o.dailyClose.paymentMethods.length?o.dailyClose.paymentMethods:dailyClosePaymentMethods.map(([id,label])=>({id,label}));
  Object.keys(o.dailyClose.closings).forEach(date=>normalizeDailyClose(o.dailyClose.closings[date],date));
  return o.dailyClose;
}
function dailyCloseState(){return ensureDailyCloseState(data)}
function selectedDailyCloseDate(){if(!dailyCloseSelectedDate)dailyCloseSelectedDate=todayISO();return dailyCloseSelectedDate}
function normalizeDailyClose(close,date=selectedDailyCloseDate()){
  close=close&&typeof close==='object'?close:{};
  close.date=close.date||date;
  close.status=close.status||'draft';
  close.openingFloat=Number(close.openingFloat||0);
  close.actualCash=Number(close.actualCash||0);
  close.tips=Number(close.tips||0);
  close.notes=String(close.notes||'');
  close.payments=close.payments&&typeof close.payments==='object'?close.payments:{};
  dailyClosePaymentMethods.forEach(([id])=>{close.payments[id]=Number(close.payments[id]||0)});
  close.movements=Array.isArray(close.movements)?close.movements:[];
  close.movements=close.movements.map(m=>({id:m.id||id(),type:m.type||'out',amount:Number(m.amount||0),note:String(m.note||''),createdAt:m.createdAt||nowISO()}));
  close.updatedAt=close.updatedAt||nowISO();
  return close;
}
function currentDailyClose(){const dc=dailyCloseState(),date=selectedDailyCloseDate();dc.closings[date]=normalizeDailyClose(dc.closings[date],date);return dc.closings[date]}
function dailyClosePaymentTotal(close=currentDailyClose()){return dailyClosePaymentMethods.reduce((sum,[id])=>sum+Number(close.payments?.[id]||0),0)}
function cashMovementSign(type){return type==='in'||type==='correction'?1:-1}
function dailyCloseCashMovementTotal(close=currentDailyClose()){return (close.movements||[]).reduce((sum,m)=>sum+(cashMovementSign(m.type)*Number(m.amount||0)),0)}
function dailyCloseExpectedCash(close=currentDailyClose()){return Number(close.openingFloat||0)+Number(close.payments?.cash||0)+dailyCloseCashMovementTotal(close)}
function dailyCloseDifference(close=currentDailyClose()){return Number(close.actualCash||0)-dailyCloseExpectedCash(close)}
function dailyCloseMovementLabel(type){return {in:'Cash in',out:'Cash out',deposit:'Safe / bank deposit',expense:'Cash expense',tipsOut:'Tips removed',correction:'Correction'}[type]||'Movement'}
function renderDailyClose(){
  if(!data||!$('dailyCloseKpis'))return;
  const close=currentDailyClose(),expected=dailyCloseExpectedCash(close),diff=dailyCloseDifference(close),sales=dailyClosePaymentTotal(close);
  if($('dailyCloseDate'))$('dailyCloseDate').value=selectedDailyCloseDate();
  if($('dailyCloseStatusBtn'))dailyCloseStatusBtn.textContent=close.status==='closed'?'Reopen day':'Close day';
  dailyCloseKpis.innerHTML=`<div><span>Total revenue</span><strong>${money(sales)}</strong><small>All payment methods</small></div><div><span>Expected cash</span><strong>${money(expected)}</strong><small>Float + cash sales + movements</small></div><div><span>Actual cash</span><strong>${money(close.actualCash)}</strong><small>Counted at closing</small></div><div><span>Difference</span><strong class="${diff<0?'delta-minus':diff>0?'delta-plus':'delta-ok'}">${diff>0?'+':''}${money(diff)}</strong><small>${close.status==='closed'?'Closed':'Draft'}</small></div>`;
  dailyClosePaymentGrid.innerHTML=dailyClosePaymentMethods.map(([key,label])=>`<label class="dailyclose-payment-card"><span>${esc(label)}</span><input type="number" step="0.01" value="${Number(close.payments[key]||0)}" onchange="updateDailyClosePayment('${key}',this.value)"><strong>${money(close.payments[key]||0)}</strong></label>`).join('');
  dailyCloseCashForm.innerHTML=`<label><span>Opening float</span><input type="number" step="0.01" value="${Number(close.openingFloat||0)}" onchange="updateDailyCloseField('openingFloat',this.value)"></label><label><span>Tips total</span><input type="number" step="0.01" value="${Number(close.tips||0)}" onchange="updateDailyCloseField('tips',this.value)"></label><label><span>Actual cash counted</span><input type="number" step="0.01" value="${Number(close.actualCash||0)}" onchange="updateDailyCloseField('actualCash',this.value)"></label><label class="wide"><span>Manager note</span><textarea onchange="updateDailyCloseField('notes',this.value)" placeholder="Optional note for this close">${esc(close.notes||'')}</textarea></label>`;
  dailyCloseMovements.innerHTML=close.movements.length?`<div class="dailyclose-movement-list">${close.movements.map(m=>`<article class="dailyclose-movement ${esc(m.type)}"><div><span>${esc(dailyCloseMovementLabel(m.type))}</span><strong>${cashMovementSign(m.type)>0?'+':'-'}${money(Math.abs(Number(m.amount||0)))}</strong><small>${esc(m.note||'No note')} · ${esc(formatClockTime(m.createdAt))}</small></div><button class="danger mini" type="button" onclick="deleteCashMovement('${m.id}')">Delete</button></article>`).join('')}</div>`:'<p class="muted">No cash movements yet.</p>';
  const closings=Object.values(dailyCloseState().closings||{}).sort((a,b)=>String(b.date).localeCompare(String(a.date))).slice(0,10);
  dailyCloseHistory.innerHTML=closings.length?`<div class="dailyclose-history-list">${closings.map(c=>{const d=dailyCloseDifference(c);return `<button type="button" class="dailyclose-history-card ${esc(c.status)}" onclick="setDailyCloseDate('${esc(c.date)}')"><span>${esc(c.date)}</span><strong>${money(dailyClosePaymentTotal(c))}</strong><small>Cash diff <b class="${d<0?'delta-minus':d>0?'delta-plus':'delta-ok'}">${d>0?'+':''}${money(d)}</b> · ${esc(c.status)}</small></button>`}).join('')}</div>`:'<p class="muted">No daily closes yet.</p>';
}
window.setDailyCloseDate=value=>{dailyCloseSelectedDate=value||todayISO();currentDailyClose();renderDailyClose()}
window.updateDailyClosePayment=(key,value)=>{const close=currentDailyClose();close.payments[key]=Number(String(value||0).replace(',','.'))||0;close.status='draft';close.updatedAt=nowISO();save();renderDailyClose()}
window.updateDailyCloseField=(key,value)=>{const close=currentDailyClose();if(['openingFloat','actualCash','tips'].includes(key))close[key]=Number(String(value||0).replace(',','.'))||0;else close[key]=String(value||'');close.status='draft';close.updatedAt=nowISO();save();renderDailyClose()}
window.addCashMovement=type=>{const close=currentDailyClose();const label=dailyCloseMovementLabel(type);const amount=inventoryPromptNumber(`${label} amount (€)`,0);if(amount===null||amount===0)return;const note=prompt(`${label} note`,label)||label;close.movements.unshift({id:id(),type,amount:Math.abs(Number(amount)),note:String(note||'').trim(),createdAt:nowISO()});close.status='draft';close.updatedAt=nowISO();save();renderDailyClose()}
window.deleteCashMovement=movementId=>{const close=currentDailyClose();close.movements=(close.movements||[]).filter(m=>m.id!==movementId);close.updatedAt=nowISO();save();renderDailyClose()}
window.closeDailyClose=()=>{const close=currentDailyClose();if(close.status==='closed'){close.status='draft';close.updatedAt=nowISO();save();renderDailyClose();return;}close.status='closed';close.closedAt=nowISO();close.updatedAt=nowISO();save();renderDailyClose()}
function dailyCloseExportRows(){return Object.values(dailyCloseState().closings||{}).sort((a,b)=>String(b.date).localeCompare(String(a.date))).map(c=>[c.date,c.status,dailyClosePaymentTotal(c),c.payments.cash,c.payments.bancontact,c.payments.visaMastercard,c.payments.amex,c.payments.mealVouchers,c.payments.giftCards,c.payments.deliveryPlatforms,c.payments.bankTransfer,c.payments.other,c.openingFloat,dailyCloseCashMovementTotal(c),dailyCloseExpectedCash(c),c.actualCash,dailyCloseDifference(c),c.tips,c.notes||'',c.updatedAt||''])}
function exportDailyCloseCsv(){downloadCsv(exportFileName('daily-close'),['Date','Status','Total revenue','Cash','Bancontact','Visa/Mastercard','Amex','Meal vouchers','Gift cards','Delivery platforms','Bank transfer/invoice','Other','Opening float','Cash movements total','Expected cash','Actual cash','Difference','Tips','Notes','Updated at'],dailyCloseExportRows())}
function printDailyCloseReport(){const c=currentDailyClose();const rows=[...dailyClosePaymentMethods.map(([id,label])=>['Payment',label,money(c.payments[id]||0)]),['Cash','Opening float',money(c.openingFloat)],['Cash','Cash movements total',money(dailyCloseCashMovementTotal(c))],['Cash','Expected cash',money(dailyCloseExpectedCash(c))],['Cash','Actual cash',money(c.actualCash)],['Cash','Difference',money(dailyCloseDifference(c))],['Tips','Tips total',money(c.tips)],['Status','Status',c.status],['Notes','Manager note',c.notes||'']];(c.movements||[]).forEach(m=>rows.push(['Movement',dailyCloseMovementLabel(m.type),`${cashMovementSign(m.type)>0?'+':'-'}${money(Math.abs(Number(m.amount||0)))} · ${m.note||''}`]));printReport('Daily close report',`${restaurantName()} · ${c.date}`,['Section','Field','Value'],rows)}


/* v177 Reservations / Covers Forecast */
function ensureForecastState(o=data){
  o.forecast=o.forecast&&typeof o.forecast==='object'?o.forecast:{};
  o.forecast.days=o.forecast.days&&typeof o.forecast.days==='object'?o.forecast.days:{};
  Object.keys(o.forecast.days).forEach(date=>normalizeForecastDay(o.forecast.days[date],date));
  return o.forecast;
}
function forecastState(){return ensureForecastState(data)}
function emptyForecastService(){return {covers:0,event:'',privateBooking:false,notes:''}}
function normalizeForecastDay(day,date){
  day=day&&typeof day==='object'?day:{};
  day.date=day.date||date;
  day.weather=String(day.weather||'');
  day.notes=String(day.notes||'');
  shifts.forEach(shift=>{
    day[shift]=day[shift]&&typeof day[shift]==='object'?day[shift]:emptyForecastService();
    day[shift].covers=Number(day[shift].covers||0);
    day[shift].event=String(day[shift].event||'');
    day[shift].privateBooking=!!day[shift].privateBooking;
    day[shift].notes=String(day[shift].notes||'');
  });
  day.updatedAt=day.updatedAt||nowISO();
  return day;
}
function forecastDay(date){const f=forecastState();f.days[date]=normalizeForecastDay(f.days[date],date);return f.days[date]}
function forecastWeekDates(){return weekDates()}
function forecastServiceCovers(date,shift){return Number(forecastDay(date)[shift]?.covers||0)}
function forecastWeekTotal(){return forecastWeekDates().reduce((sum,{date})=>sum+shifts.reduce((s,shift)=>s+forecastServiceCovers(date,shift),0),0)}
function forecastEventCount(){return forecastWeekDates().reduce((n,{date})=>{const d=forecastDay(date);return n+shifts.filter(shift=>d[shift].event||d[shift].privateBooking).length},0)}
function forecastStaffForService(date,shift){return activeEmployees().filter(e=>slotHoursForDate(e,date,shift)>0).length}
function forecastHoursForService(date,shift){return activeEmployees().reduce((sum,e)=>sum+slotHoursForDate(e,date,shift),0)}
function forecastPressure(covers,staff){
  if(!covers)return {label:'Quiet',cls:'quiet'};
  if(!staff)return {label:'Unstaffed',cls:'danger'};
  const ratio=covers/staff;
  if(ratio>=38)return {label:'High',cls:'danger'};
  if(ratio>=26)return {label:'Busy',cls:'busy'};
  return {label:'Good',cls:'good'};
}
function renderForecast(){
  if(!data||!$('forecastGrid'))return;
  const dates=forecastWeekDates();
  const total=forecastWeekTotal();
  const events=forecastEventCount();
  const busiest=dates.map(({day,date})=>({day,date,covers:shifts.reduce((s,shift)=>s+forecastServiceCovers(date,shift),0)})).sort((a,b)=>b.covers-a.covers)[0]||{};
  forecastKpis.innerHTML=`<div><span>Expected covers</span><strong>${total}</strong><small>${weekDisplayRange()}</small></div><div><span>Busiest day</span><strong>${busiest.covers?busiest.day.slice(0,3):'—'}</strong><small>${busiest.covers?busiest.covers+' covers':'No forecast yet'}</small></div><div><span>Events / bookings</span><strong>${events}</strong><small>Lunch + evening notes</small></div><div><span>Avg covers / day</span><strong>${Math.round(total/7)}</strong><small>Simple weekly average</small></div>`;
  forecastGrid.innerHTML=dates.map(({day,date})=>forecastDayCard(day,date)).join('');
  renderForecastHelper();
  renderForecastEvents();
}
function forecastDayCard(dayName,date){
  const day=forecastDay(date);
  const serviceHtml=shifts.map(shift=>{
    const svc=day[shift],staff=forecastStaffForService(date,shift),pressure=forecastPressure(Number(svc.covers||0),staff);
    return `<article class="forecast-service ${pressure.cls}"><div class="forecast-service-head"><strong>${esc(shift)}</strong><span>${esc(pressure.label)}</span></div><label><span>Covers</span><input type="number" min="0" step="1" value="${Number(svc.covers||0)}" onchange="updateForecastService('${date}','${shift}','covers',this.value)"></label><label><span>Event / group</span><input value="${esc(svc.event||'')}" placeholder="Group, terrace, private…" onchange="updateForecastService('${date}','${shift}','event',this.value)"></label><label class="forecast-check"><input type="checkbox" ${svc.privateBooking?'checked':''} onchange="updateForecastService('${date}','${shift}','privateBooking',this.checked)"><span>Private booking</span></label><label><span>Service note</span><textarea placeholder="Optional note" onchange="updateForecastService('${date}','${shift}','notes',this.value)">${esc(svc.notes||'')}</textarea></label><small>${staff} planned staff · ${fmtHours(forecastHoursForService(date,shift))}</small></article>`;
  }).join('');
  return `<section class="forecast-day-card"><div class="forecast-day-head"><div><strong>${esc(dayName.slice(0,3))}</strong><small>${esc(shortDisplayDate(date))}</small></div><span>${shifts.reduce((s,sh)=>s+forecastServiceCovers(date,sh),0)} covers</span></div><div class="forecast-services">${serviceHtml}</div><label class="forecast-day-note"><span>Day note / weather</span><input value="${esc(day.notes||day.weather||'')}" placeholder="Weather, holiday, event…" onchange="updateForecastDay('${date}','notes',this.value)"></label></section>`;
}
function renderForecastHelper(){
  const el=$('forecastHelper'); if(!el)return;
  const rows=[];
  forecastWeekDates().forEach(({day,date})=>shifts.forEach(shift=>{
    const covers=forecastServiceCovers(date,shift),staff=forecastStaffForService(date,shift),hours=forecastHoursForService(date,shift),pressure=forecastPressure(covers,staff);
    if(covers||staff)rows.push({day,date,shift,covers,staff,hours,pressure});
  }));
  el.innerHTML=rows.length?`<div class="forecast-helper-list">${rows.map(r=>`<article class="forecast-helper-row ${r.pressure.cls}"><div><strong>${esc(r.day.slice(0,3))} ${esc(r.shift)}</strong><small>${esc(shortDisplayDate(r.date))}</small></div><span>${r.covers} covers</span><span>${r.staff} staff</span><span>${fmtHours(r.hours)}</span><b>${esc(r.pressure.label)}</b></article>`).join('')}</div>`:'<p class="muted">Add expected covers to see pressure indicators.</p>';
}
function renderForecastEvents(){
  const el=$('forecastEvents'); if(!el)return;
  const rows=[];
  forecastWeekDates().forEach(({day,date})=>{const d=forecastDay(date);shifts.forEach(shift=>{const svc=d[shift];if(svc.event||svc.privateBooking||svc.notes)rows.push({day,date,shift,...svc})});if(d.notes)rows.push({day,date,shift:'Day',covers:'',event:d.notes,privateBooking:false,notes:''})});
  el.innerHTML=rows.length?`<div class="forecast-event-list">${rows.map(r=>`<article class="forecast-event-card"><span>${esc(r.day.slice(0,3))} · ${esc(r.shift)}</span><strong>${esc(r.event||r.notes||'Service note')}</strong><small>${esc(shortDisplayDate(r.date))}${r.privateBooking?' · Private booking':''}${r.covers?` · ${r.covers} covers`:''}</small></article>`).join('')}</div>`:'<p class="muted">No events or service notes for this week yet.</p>';
}
window.updateForecastService=(date,shift,key,value)=>{const day=forecastDay(date),svc=day[shift];if(key==='covers')svc.covers=Number(String(value||0).replace(',','.'))||0;else if(key==='privateBooking')svc.privateBooking=!!value;else svc[key]=String(value||'');day.updatedAt=nowISO();save();renderForecast()}
window.updateForecastDay=(date,key,value)=>{const day=forecastDay(date);day[key]=String(value||'');day.updatedAt=nowISO();save();renderForecast()}
function forecastExportRows(){
  const rows=[];
  forecastWeekDates().forEach(({day,date})=>{const d=forecastDay(date);shifts.forEach(shift=>{const svc=d[shift],staff=forecastStaffForService(date,shift),hours=forecastHoursForService(date,shift),pressure=forecastPressure(Number(svc.covers||0),staff);rows.push([date,day,shift,svc.covers||0,staff,fmtHours(hours),pressure.label,svc.privateBooking?'Yes':'No',svc.event||'',svc.notes||'',d.notes||''])})});
  return rows;
}
window.exportForecastCsv=()=>downloadCsv(exportFileName('covers-forecast'),['Date','Day','Service','Expected covers','Planned staff','Planned hours','Pressure','Private booking','Event / group','Service note','Day note'],forecastExportRows())
window.printForecastReport=()=>printReport('Reservations / covers forecast',`${restaurantName()} · ${weekDisplayRange()}`,['Date','Day','Service','Expected covers','Planned staff','Planned hours','Pressure','Private booking','Event / group','Service note','Day note'],forecastExportRows())

/* v176 Team / HR profiles + absences */
const absenceTypes=['Vacation','Sick leave','No-show','Late','Unavailable','Other'];
const contractTypes=['','Full-time','Part-time','Student','Flexi','Extra','Freelance','Other'];
function hrState(){data.hr=data.hr&&typeof data.hr==='object'?data.hr:{};data.hr.absences=Array.isArray(data.hr.absences)?data.hr.absences:[];return data.hr}
function selectedTeamEmployee(){
  const employees=activeEmployees();
  if(!employees.length)return null;
  if(!teamSelectedEmployeeId||!employees.some(e=>e.id===teamSelectedEmployeeId))teamSelectedEmployeeId=employees[0].id;
  return emp(teamSelectedEmployeeId)||employees[0];
}
function employeeAbsences(employeeId=''){
  return [...(hrState().absences||[])].filter(a=>!employeeId||a.employeeId===employeeId).sort((a,b)=>String(b.startDate||'').localeCompare(String(a.startDate||''))||String(b.createdAt||'').localeCompare(String(a.createdAt||'')));
}
function absenceStatusClass(status='pending'){const s=String(status||'pending').toLowerCase();return s==='approved'?'approved':s==='rejected'?'rejected':'pending'}
function absenceDateLabel(a){return a.startDate===a.endDate?a.startDate:`${a.startDate} → ${a.endDate}`}
function renderTeamHR(){
  if(!data||!$('teamKpis'))return;
  const employees=activeEmployees();
  const absences=employeeAbsences();
  const pending=absences.filter(a=>absenceStatusClass(a.status)==='pending');
  const approved=absences.filter(a=>absenceStatusClass(a.status)==='approved');
  const documents=data.employees.reduce((sum,e)=>sum+(Array.isArray(e.documents)?e.documents.length:0),0);
  teamKpis.innerHTML=`<div><span>Active employees</span><strong>${employees.length}</strong><small>Visible in planning</small></div><div><span>Documents</span><strong>${documents}</strong><small>Contracts / files stored</small></div><div><span>Pending absences</span><strong>${pending.length}</strong><small>Need manager review</small></div><div><span>Approved absences</span><strong>${approved.length}</strong><small>Recorded leave/events</small></div>`;
  const selected=selectedTeamEmployee();
  if($('teamEmployeeList'))teamEmployeeList.innerHTML=employees.map(e=>`<button type="button" class="team-employee-btn ${selected&&selected.id===e.id?'active':''}" onclick="selectTeamEmployee('${e.id}')"><strong>${esc(e.name)}</strong><small>${esc(e.position||'')}</small><span>${esc(e.contractType||'Profile')}</span></button>`).join('')||'<p class="muted">No active employees.</p>';
  renderTeamProfile(selected);
  renderTeamDocuments();
  renderTeamAbsences();
}
function renderTeamProfile(e){
  const el=$('teamProfileCard'); if(!el)return;
  if(!e){el.innerHTML='<p class="muted">No employee selected.</p>';return;}
  el.innerHTML=`<div class="team-profile-head"><div><p class="eyebrow">Employee profile</p><h3>${esc(e.name)}</h3><p class="muted">${esc(e.position||'')} · ${money(e.rate||0)}/h</p></div><span class="team-status-pill ${e.active!==false?'active':'inactive'}">${e.active!==false?'Active':'Inactive'}</span></div><div class="team-profile-form"><label><span>Phone</span><input value="${esc(e.phone||'')}" onchange="updateTeamEmployeeField('${e.id}','phone',this.value)"></label><label><span>Email</span><input type="email" value="${esc(e.email||'')}" onchange="updateTeamEmployeeField('${e.id}','email',this.value)"></label><label><span>Contract type</span><select onchange="updateTeamEmployeeField('${e.id}','contractType',this.value)">${contractTypes.map(t=>`<option value="${esc(t)}" ${String(e.contractType||'')===t?'selected':''}>${esc(t||'—')}</option>`).join('')}</select></label><label><span>Payroll ID</span><input value="${esc(e.payrollId||'')}" onchange="updateTeamEmployeeField('${e.id}','payrollId',this.value)"></label><label><span>Start date</span><input type="date" value="${esc(e.startDate||'')}" onchange="updateTeamEmployeeField('${e.id}','startDate',this.value)"></label><label><span>Emergency contact</span><input value="${esc(e.emergencyContact||'')}" onchange="updateTeamEmployeeField('${e.id}','emergencyContact',this.value)"></label><label class="wide"><span>Address</span><input value="${esc(e.address||'')}" onchange="updateTeamEmployeeField('${e.id}','address',this.value)"></label><label class="wide"><span>HR notes</span><textarea onchange="updateTeamEmployeeField('${e.id}','hrNotes',this.value)" placeholder="Contract notes, availability notes, payroll reminders…">${esc(e.hrNotes||'')}</textarea></label></div><div class="team-doc-upload"><label class="secondary file-button">Upload contract / file<input type="file" onchange="uploadTeamDocument('${e.id}',this)"></label><small>Prototype: keep files small. Later this moves to Supabase Storage.</small></div>`;
}
function renderTeamDocuments(){
  const el=$('teamDocuments'); if(!el)return;
  const rows=data.employees.flatMap(e=>(e.documents||[]).map(d=>({employee:e,doc:d})));
  el.innerHTML=rows.length?`<div class="team-document-grid">${rows.map(({employee:e,doc:d})=>`<article class="team-document-card"><div><span>${esc(e.name)}</span><strong>${esc(d.name||'Document')}</strong><small>${esc(d.type||'file')} · ${esc(d.uploadedAt?formatClockDate(d.uploadedAt):'')}</small></div><div class="team-doc-actions"><button class="secondary mini" type="button" onclick="downloadTeamDocument('${e.id}','${d.id}')">Open</button><button class="danger mini" type="button" onclick="deleteTeamDocument('${e.id}','${d.id}')">Delete</button></div></article>`).join('')}</div>`:'<p class="muted">No employee documents uploaded yet.</p>';
}
function renderTeamAbsences(){
  const el=$('teamAbsences'); if(!el)return;
  const rows=employeeAbsences();
  el.innerHTML=rows.length?`<div class="team-absence-list">${rows.map(a=>{const e=emp(a.employeeId)||{};const cls=absenceStatusClass(a.status);return `<article class="team-absence-card ${cls}"><div><span>${esc(a.type)}</span><strong>${esc(e.name||'Employee')}</strong><small>${esc(absenceDateLabel(a))}${a.note?' · '+esc(a.note):''}</small></div><div class="team-absence-actions"><b class="team-status-pill ${cls}">${esc(a.status||'pending')}</b><button class="secondary mini" type="button" onclick="setAbsenceStatus('${a.id}','approved')">Approve</button><button class="secondary mini" type="button" onclick="setAbsenceStatus('${a.id}','rejected')">Reject</button><button class="danger mini" type="button" onclick="deleteAbsenceRecord('${a.id}')">Delete</button></div></article>`}).join('')}</div>`:'<p class="muted">No absences recorded yet.</p>';
}
window.selectTeamEmployee=id=>{teamSelectedEmployeeId=id;renderTeamHR()}
window.updateTeamEmployeeField=(employeeId,key,value)=>{const e=emp(employeeId);if(!e)return;e[key]=String(value||'').trim();save();renderTeamHR()}
window.uploadTeamDocument=(employeeId,input)=>{const e=emp(employeeId);const file=input?.files?.[0];if(!e||!file)return;if(file.size>850000&& !confirm('This file is quite large for prototype JSON storage. Continue anyway?')){input.value='';return;}const reader=new FileReader();reader.onload=()=>{e.documents=e.documents||[];e.documents.unshift({id:id(),name:file.name,type:file.type||'file',size:file.size,uploadedAt:nowISO(),dataUrl:String(reader.result||'')});save();renderTeamHR();input.value=''};reader.readAsDataURL(file)}
window.downloadTeamDocument=(employeeId,docId)=>{const e=emp(employeeId);const d=(e?.documents||[]).find(x=>x.id===docId);if(!d?.dataUrl)return;const a=document.createElement('a');a.href=d.dataUrl;a.download=d.name||'employee-document';a.target='_blank';a.click()}
window.deleteTeamDocument=(employeeId,docId)=>{const e=emp(employeeId);if(!e||!confirm('Delete this document?'))return;e.documents=(e.documents||[]).filter(d=>d.id!==docId);save();renderTeamHR()}
window.addAbsenceRecord=()=>{const employees=activeEmployees();if(!employees.length)return alert('Add an employee first.');const selected=selectedTeamEmployee()||employees[0];const employeeName=prompt('Employee name', selected.name);if(employeeName===null)return;const employee=employees.find(e=>e.name.toLowerCase()===String(employeeName).trim().toLowerCase())||selected;const type=prompt('Absence type: Vacation, Sick leave, No-show, Late, Unavailable, Other','Vacation');if(type===null)return;const start=prompt('Start date (YYYY-MM-DD)', todayISO());if(start===null)return;const end=prompt('End date (YYYY-MM-DD)', start||todayISO());if(end===null)return;const note=prompt('Note (optional)','');if(note===null)return;hrState().absences.unshift({id:id(),employeeId:employee.id,type:String(type||'Vacation').trim()||'Vacation',startDate:String(start||todayISO()).trim(),endDate:String(end||start||todayISO()).trim(),status:'pending',note:String(note||'').trim(),createdAt:nowISO(),updatedAt:nowISO()});save();renderTeamHR()}
window.setAbsenceStatus=(absenceId,status)=>{const a=hrState().absences.find(x=>x.id===absenceId);if(!a)return;a.status=status;a.updatedAt=nowISO();save();renderTeamHR()}
window.deleteAbsenceRecord=absenceId=>{if(!confirm('Delete this absence record?'))return;hrState().absences=hrState().absences.filter(a=>a.id!==absenceId);save();renderTeamHR()}
function teamExportRows(){return data.employees.map(e=>[e.name,e.position,e.rate,e.active!==false?'active':'inactive',e.managerAccess?'yes':'no',e.contractType||'',e.payrollId||'',e.phone||'',e.email||'',e.startDate||'',e.emergencyContact||'',(e.documents||[]).length,e.hrNotes||''])}
function absenceExportRows(){return employeeAbsences().map(a=>{const e=emp(a.employeeId)||{};return [e.name||'',e.position||'',a.type,a.startDate,a.endDate,a.status,a.note||'',a.createdAt||'',a.updatedAt||'']})}
window.exportTeamCsv=()=>downloadCsv(exportFileName('team-profiles'),['Employee','Position','Rate','Active','Employee full planner','Contract type','Payroll ID','Phone','Email','Start date','Emergency contact','Documents','HR notes'],teamExportRows())
window.exportAbsencesCsv=()=>downloadCsv(exportFileName('absences'),['Employee','Position','Type','Start date','End date','Status','Note','Created at','Updated at'],absenceExportRows())
window.printAbsencesReport=()=>printReport('Absences report',`${restaurantName()} · ${weekDisplayRange()}`,['Employee','Position','Type','Start','End','Status','Note'],absenceExportRows().map(r=>r.slice(0,7)))


/* v128 workspace + setup wizard foundation */
const setupWizardSteps=['Identity','Brand','Positions','Zones','Team','Review'];
function clone(value){return value==null?value:(typeof structuredClone==='function'?structuredClone(value):JSON.parse(JSON.stringify(value)))}
function setupCounts(source=data){
  return {
    employees:(source.employees||[]).length,
    active:(source.employees||[]).filter(e=>e.active!==false).length,
    positions:(source.positions||[]).length,
    zones:(source.zoneRules||[]).filter(z=>z.zone).length
  };
}
function renderSetupSummary(){
  const el=$('setupWizardSummary'); if(!el||!data)return;
  const c=setupCounts(data);
  el.innerHTML=`<div><strong>${esc(data.restaurant?.name||'Restaurant')}</strong><span>workspace</span></div><div><strong>${c.active}/${c.employees}</strong><span>active employees</span></div><div><strong>${c.positions}</strong><span>positions</span></div><div><strong>${c.zones}</strong><span>zones</span></div>`;
}
function renderWorkspaceInfo(){
  const el=$('workspaceInfoPanel'); if(!el||!data)return;
  const r=data.restaurant||{};
  el.innerHTML=`<div><span>Workspace ID</span><strong>${esc(workspaceId())}</strong></div><div><span>Restaurant</span><strong>${esc(restaurantName())}</strong></div><div><span>Manager</span><strong>${esc(restaurantOwnerName())}</strong></div><div><span>City</span><strong>${esc(restaurantCity()||'—')}</strong></div><div><span>Accent</span><strong><i class="workspace-color-dot" style="background:${esc(restaurantAccent())}"></i>${esc(restaurantAccent())}</strong></div><div><span>Logo</span><strong>${r.logoUrl?'Custom URL':'Default logo'}</strong></div>`;
}
function wizardDraftFromData(source=data){
  const draft={
    restaurant:clone(source?.restaurant||{}),
    employees:clone(source?.employees||[]),
    positions:clone(source?.positions||positions||[]),
    zoneRules:clone(source?.zoneRules||zoneRules||[]),
    positionColors:clone(source?.positionColors||{}),
    zoneColors:clone(source?.zoneColors||{})
  };
  draft.restaurant.name=String(draft.restaurant.name||'').trim();
  draft.restaurant.ownerName=String(draft.restaurant.ownerName||'').trim();
  draft.restaurant.city=String(draft.restaurant.city||'').trim();
  draft.restaurant.logoUrl=String(draft.restaurant.logoUrl||'').trim();
  draft.restaurant.accentColor=normalizeHexColor(draft.restaurant.accentColor)||'#9b1734';
  draft.restaurant.theme=appThemeFromValue(draft.restaurant.theme||'modern-light');
  draft.positions=(draft.positions||[]).map(cleanPositionName).filter((p,i,a)=>p&&a.indexOf(p)===i);
  if(!draft.positions.length)draft.positions=['Manager','Chef de Rang','Barman','Runner','Extra (flexi / student)'];
  draft.employees=(draft.employees||[]).map((e,i)=>({id:e.id||id(),name:e.name||'',position:cleanPositionName(e.position||draft.positions[0]),rate:Number(e.rate??13.5),active:e.active!==false,pin:PROTOTYPE_PIN}));
  draft.zoneRules=(draft.zoneRules||[]).map(z=>({zone:String(z.zone||'').trim(),role:cleanPositionName(z.role||draft.positions[0]),lunch:String(z.lunch||'').trim(),evening:String(z.evening||'').trim()})).filter(z=>z.zone);
  draft.positions.forEach((p,i)=>{if(!draft.positionColors[p])draft.positionColors[p]=defaultPositionPalette[i%defaultPositionPalette.length]});
  draft.zoneRules.forEach((z,i)=>{if(!draft.zoneColors[z.zone])draft.zoneColors[z.zone]=defaultZonePalette[i%defaultZonePalette.length]});
  return draft;
}
function openSetupWizard(mode='edit'){
  setupWizardMode=mode;
  setupWizardStep=0;
  setupWizardDraft=mode==='create'?wizardDraftFromData(starterRestaurantData('blank')):wizardDraftFromData(data);
  renderSetupWizard();
  setupWizardDialog.showModal();
}
function wizardStepHeader(){
  return `<div class="wizard-stepper">${setupWizardSteps.map((s,i)=>`<span class="${i===setupWizardStep?'active':i<setupWizardStep?'done':''}"><b>${i+1}</b>${esc(s)}</span>`).join('')}</div>`;
}
function wizardFooter(){
  const last=setupWizardStep===setupWizardSteps.length-1;
  const action=setupWizardMode==='create'?'Create workspace':'Apply setup';
  return `<div class="wizard-footer"><button type="button" class="secondary" onclick="closeSetupWizard()">Cancel</button><div class="wizard-footer-right"><button type="button" class="secondary" ${setupWizardStep===0?'disabled':''} onclick="wizardPrev()">Back</button>${last?`<button type="button" class="primary" onclick="applySetupWizard()">${action}</button>`:`<button type="button" class="primary" onclick="wizardNext()">Next</button>`}</div></div>`;
}
function renderSetupWizard(){
  if(!setupWizardDraft||!$('setupWizardRoot'))return;
  const title=setupWizardSteps[setupWizardStep];
  const eyebrow=setupWizardMode==='create'?'New restaurant workspace':'Restaurant setup';
  setupWizardRoot.innerHTML=`<div class="wizard-head"><div><p class="eyebrow">${eyebrow}</p><h2>${esc(title)}</h2></div><button type="button" class="secondary wizard-x" onclick="closeSetupWizard()">×</button></div>${wizardStepHeader()}<div class="wizard-body">${wizardBody()}</div>${wizardFooter()}`;
}
function wizardBody(){
  if(setupWizardStep===0)return wizardIdentityHTML();
  if(setupWizardStep===1)return wizardBrandHTML();
  if(setupWizardStep===2)return wizardPositionsHTML();
  if(setupWizardStep===3)return wizardZonesHTML();
  if(setupWizardStep===4)return wizardEmployeesHTML();
  return wizardReviewHTML();
}
function wizardIdentityHTML(){
  const c=setupCounts(setupWizardDraft);
  return `<div class="wizard-grid"><section class="wizard-card big"><label>Restaurant name<input value="${esc(setupWizardDraft.restaurant.name)}" onchange="wizardSetRestaurantField('name',this.value)" placeholder="Restaurant name"></label><label>Owner / manager name<input value="${esc(setupWizardDraft.restaurant.ownerName)}" onchange="wizardSetRestaurantField('ownerName',this.value)" placeholder="e.g. Xavier, Sarah, Restaurant Manager"></label><label>City<input value="${esc(setupWizardDraft.restaurant.city)}" onchange="wizardSetRestaurantField('city',this.value)" placeholder="Brussels"></label></section><section class="wizard-card premium-note"><strong>${setupWizardMode==='create'?'Create restaurant':'Update restaurant'}</strong></section></div><div class="wizard-metrics"><div><strong>${c.active}</strong><span>active employees</span></div><div><strong>${c.positions}</strong><span>positions</span></div><div><strong>${c.zones}</strong><span>zones</span></div></div>`;
}
function wizardBrandHTML(){
  const r=setupWizardDraft.restaurant;
  const accent=normalizeHexColor(r.accentColor)||'#9b1734';
  return `<div class="wizard-grid"><section class="wizard-card big"><label>Accent color<input type="color" value="${esc(accent)}" onchange="wizardSetRestaurantField('accentColor',this.value)"></label><label>Logo URL<input value="${esc(r.logoUrl)}" onchange="wizardSetRestaurantField('logoUrl',this.value)" placeholder="https://..."></label><label>Theme<select onchange="wizardSetRestaurantField('theme',this.value)"><option value="modern-light" ${appThemeFromValue(r.theme)==='modern-light'?'selected':''}>Modern Light</option><option value="modern-dark" ${appThemeFromValue(r.theme)==='modern-dark'?'selected':''}>Modern Dark</option></select></label></section><section class="wizard-card brand-preview" style="--preview-accent:${esc(accent)}"><span class="brand-preview-mark">${esc((r.name||'R').charAt(0).toUpperCase())}</span><h3>${esc(r.name||'Restaurant')}</h3><p>${esc(r.city||'City')} · Managed by ${esc(r.ownerName||'Manager')}</p><div class="brand-preview-bar"></div></section></div>`;
}
function wizardPositionsHTML(){
  return `<p class="muted wizard-intro">Define the roles used in setup, cost analysis and WHO metrics.</p><div class="wizard-table-wrap"><table class="data wizard-table"><thead><tr><th>Color</th><th>Position</th><th></th></tr></thead><tbody>${setupWizardDraft.positions.map((p,i)=>`<tr><td class="color-cell"><input type="color" value="${esc(setupWizardDraft.positionColors[p]||defaultPositionPalette[i%defaultPositionPalette.length])}" onchange="wizardSetPositionColor(${i},this.value)"></td><td><input value="${esc(p)}" onchange="wizardSetPositionName(${i},this.value)"></td><td><button type="button" class="danger" onclick="wizardDeletePosition(${i})">Delete</button></td></tr>`).join('')}</tbody></table></div><div class="add-row wizard-add-row"><input id="wizardNewPosition" placeholder="New position, e.g. Runner"><button type="button" class="primary" onclick="wizardAddPosition()">Add position</button></div>`;
}
function wizardZoneRoleOptions(selected){
  const clean=cleanPositionName(selected||'');
  const extras=clean&&!setupWizardDraft.positions.some(p=>cleanPositionName(p)===clean)?[clean]:[];
  return [...setupWizardDraft.positions,...extras].map(p=>`<option value="${esc(p)}" ${cleanPositionName(p)===clean?'selected':''}>${esc(p)}</option>`).join('');
}
function wizardZonesHTML(){
  return `<p class="muted wizard-intro">Map zones to positions and default lunch/evening time ranges. These drive planned hours and labor cost estimation.</p><div class="wizard-table-wrap"><table class="data wizard-table zone-table"><thead><tr><th>Color</th><th>Role / position</th><th>Zone</th><th>Lunch</th><th>Evening</th><th></th></tr></thead><tbody>${setupWizardDraft.zoneRules.map((z,i)=>`<tr><td class="color-cell"><input type="color" value="${esc(setupWizardDraft.zoneColors[z.zone]||defaultZonePalette[i%defaultZonePalette.length])}" onchange="wizardSetZoneColor(${i},this.value)"></td><td><select onchange="wizardSetZone(${i},'role',this.value)">${wizardZoneRoleOptions(z.role)}</select></td><td><input value="${esc(z.zone)}" onchange="wizardSetZone(${i},'zone',this.value)"></td><td><input value="${esc(z.lunch)}" onchange="wizardSetZone(${i},'lunch',this.value)" placeholder="11:00-15:00"></td><td><input value="${esc(z.evening)}" onchange="wizardSetZone(${i},'evening',this.value)" placeholder="17:50-23:00"></td><td><button type="button" class="danger" onclick="wizardDeleteZone(${i})">Delete</button></td></tr>`).join('')}</tbody></table></div><div class="add-row wizard-add-row zone-add"><select id="wizardNewZoneRole">${wizardZoneRoleOptions(setupWizardDraft.positions[0])}</select><input id="wizardNewZoneName" placeholder="Zone"><input id="wizardNewZoneLunch" placeholder="Lunch"><input id="wizardNewZoneEvening" placeholder="Evening"><button type="button" class="primary" onclick="wizardAddZone()">Add zone</button></div>`;
}
function wizardEmployeePositionOptions(selected){
  const clean=cleanPositionName(selected||'');
  const extras=clean&&!setupWizardDraft.positions.some(p=>cleanPositionName(p)===clean)?[clean]:[];
  return [...setupWizardDraft.positions,...extras].map(p=>`<option value="${esc(p)}" ${cleanPositionName(p)===clean?'selected':''}>${esc(p)}</option>`).join('');
}
function wizardEmployeesHTML(){
  return `<div class="wizard-table-wrap"><table class="data wizard-table"><thead><tr><th>Name</th><th>Position</th><th>€/hour</th><th>PIN</th><th>Active</th><th></th></tr></thead><tbody>${setupWizardDraft.employees.map((e,i)=>`<tr><td><input value="${esc(e.name)}" onchange="wizardSetEmployee(${i},'name',this.value)" placeholder="Employee name"></td><td><select onchange="wizardSetEmployee(${i},'position',this.value)">${wizardEmployeePositionOptions(e.position)}</select></td><td><input type="number" step="0.25" value="${esc(e.rate)}" onchange="wizardSetEmployee(${i},'rate',this.value)"></td><td><input class="pin-input" inputmode="numeric" maxlength="6" value="${PROTOTYPE_PIN}" readonly title="PIN 0000"></td><td><select onchange="wizardSetEmployee(${i},'active',this.value)"><option value="true" ${e.active?'selected':''}>Active</option><option value="false" ${!e.active?'selected':''}>Inactive</option></select></td><td><button type="button" class="danger" onclick="wizardDeleteEmployee(${i})">Delete</button></td></tr>`).join('')||'<tr><td colspan="6"><p class="muted">No employees yet. Add the first team member below.</p></td></tr>'}</tbody></table></div><div class="add-row wizard-add-row"><input id="wizardNewEmployeeName" placeholder="Name"><select id="wizardNewEmployeePosition">${wizardEmployeePositionOptions(setupWizardDraft.positions[0])}</select><input id="wizardNewEmployeeRate" type="number" step="0.25" placeholder="€/hour"><input id="wizardNewEmployeePin" class="pin-input" value="0000" readonly title="PIN 0000"><button type="button" class="primary" onclick="wizardAddEmployee()">Add employee</button></div>`;
}
function wizardReviewHTML(){
  const c=setupCounts(setupWizardDraft);
  const topPositions=setupWizardDraft.positions.slice(0,8).map(p=>`<span>${esc(p)}</span>`).join('');
  const activeNames=setupWizardDraft.employees.filter(e=>e.active).slice(0,12).map(e=>`<span>${esc(e.name||'Unnamed')}</span>`).join('');
  const workspace=slugifyWorkspace(setupWizardDraft.restaurant.name||'restaurant');
  const verb=setupWizardMode==='create'?'Create this workspace':'Apply this setup';
  return `<div class="wizard-review"><section class="wizard-card big"><p class="eyebrow">${esc(workspace)}</p><h3>${esc(setupWizardDraft.restaurant.name||'Restaurant')}</h3><p class="muted">${esc(setupWizardDraft.restaurant.city||'City')} · Managed by ${esc(setupWizardDraft.restaurant.ownerName||'Manager')}</p><div class="wizard-metrics inline"><div><strong>${c.active}/${c.employees}</strong><span>active employees</span></div><div><strong>${c.positions}</strong><span>positions</span></div><div><strong>${c.zones}</strong><span>zones</span></div></div></section><section class="wizard-card"><strong>Positions</strong><div class="wizard-chip-list">${topPositions||'<span>None</span>'}</div></section><section class="wizard-card"><strong>Active team preview</strong><div class="wizard-chip-list">${activeNames||'<span>No active employees</span>'}</div></section><section class="wizard-card premium-note"><strong>${verb}</strong></section></div>`;
}
function normalizeWizardDraft(){
  if(!setupWizardDraft)return null;
  const draft=clone(setupWizardDraft);
  draft.restaurant=draft.restaurant||{};
  draft.restaurant.name=String(draft.restaurant.name||'').trim();
  if(!draft.restaurant.name)return alert('Restaurant name required.'),null;
  draft.restaurant.ownerName=String(draft.restaurant.ownerName||'Manager').trim()||'Manager';
  draft.restaurant.city=String(draft.restaurant.city||'').trim();
  draft.restaurant.logoUrl=String(draft.restaurant.logoUrl||'').trim();
  draft.restaurant.accentColor=normalizeHexColor(draft.restaurant.accentColor)||'#9b1734';
  draft.restaurant.theme=appThemeFromValue(draft.restaurant.theme||'modern-light');
  draft.positions=(draft.positions||[]).map(cleanPositionName).filter((p,i,a)=>p&&a.indexOf(p)===i);
  if(!draft.positions.length)return alert('Add at least one position.'),null;
  draft.employees=(draft.employees||[]).map((e,i)=>({id:e.id||id(),name:String(e.name||'').trim(),position:cleanPositionName(e.position||draft.positions[0]),rate:Number(e.rate||0)||13.5,active:e.active!==false,pin:PROTOTYPE_PIN})).filter(e=>e.name);
  if(!draft.employees.length)return alert('Add at least one employee.'),null;
  draft.zoneRules=(draft.zoneRules||[]).map(z=>({zone:String(z.zone||'').trim(),role:cleanPositionName(z.role||draft.positions[0]),lunch:String(z.lunch||'-').trim()||'-',evening:String(z.evening||'-').trim()||'-'})).filter(z=>z.zone);
  draft.positionColors=draft.positionColors||{};draft.zoneColors=draft.zoneColors||{};
  draft.positions.forEach((p,i)=>{if(!draft.positionColors[p])draft.positionColors[p]=defaultPositionPalette[i%defaultPositionPalette.length]});
  draft.zoneRules.forEach((z,i)=>{if(!draft.zoneColors[z.zone])draft.zoneColors[z.zone]=defaultZonePalette[i%defaultZonePalette.length]});
  return draft;
}
window.closeSetupWizard=()=>{setupWizardDialog.close();setupWizardDraft=null;setupWizardMode='edit';};
window.wizardPrev=()=>{setupWizardStep=Math.max(0,setupWizardStep-1);renderSetupWizard();};
window.wizardNext=()=>{setupWizardStep=Math.min(setupWizardSteps.length-1,setupWizardStep+1);renderSetupWizard();};
window.wizardSetRestaurantField=(field,value)=>{if(!setupWizardDraft)return;setupWizardDraft.restaurant=setupWizardDraft.restaurant||{};setupWizardDraft.restaurant[field]=field==='accentColor'?(normalizeHexColor(value)||'#9b1734'):String(value||'').trim();renderSetupWizard();};
window.wizardSetRestaurantName=v=>window.wizardSetRestaurantField('name',v);
window.wizardSetPositionName=(i,v)=>{if(!setupWizardDraft)return;let old=setupWizardDraft.positions[i], clean=cleanPositionName(v);if(!clean)return renderSetupWizard();setupWizardDraft.positions[i]=clean;setupWizardDraft.positions=setupWizardDraft.positions.filter((p,idx,a)=>p&&a.indexOf(p)===idx);if(!setupWizardDraft.positionColors[clean])setupWizardDraft.positionColors[clean]=setupWizardDraft.positionColors[old]||defaultPositionPalette[i%defaultPositionPalette.length];if(old!==clean)delete setupWizardDraft.positionColors[old];setupWizardDraft.employees.forEach(e=>{if(cleanPositionName(e.position)===cleanPositionName(old))e.position=clean});setupWizardDraft.zoneRules.forEach(z=>{if(cleanPositionName(z.role)===cleanPositionName(old))z.role=clean});renderSetupWizard();};
window.wizardSetPositionColor=(i,c)=>{let p=setupWizardDraft?.positions[i];if(p)setupWizardDraft.positionColors[p]=c;};
window.wizardAddPosition=()=>{let input=$('wizardNewPosition'), v=cleanPositionName(input?.value||'');if(!v)return alert('Position name required');if(setupWizardDraft.positions.some(p=>cleanPositionName(p)===v))return alert('This position already exists.');setupWizardDraft.positions.push(v);setupWizardDraft.positionColors[v]=defaultPositionPalette[(setupWizardDraft.positions.length-1)%defaultPositionPalette.length];renderSetupWizard();};
window.wizardDeletePosition=i=>{if(!setupWizardDraft||setupWizardDraft.positions.length<=1)return alert('Keep at least one position.');let old=setupWizardDraft.positions[i], fallback=setupWizardDraft.positions.find((_,idx)=>idx!==i)||'Manager';if(!confirm(`Delete ${old}? Employees and zones using it will move to ${fallback}.`))return;setupWizardDraft.positions.splice(i,1);delete setupWizardDraft.positionColors[old];setupWizardDraft.employees.forEach(e=>{if(cleanPositionName(e.position)===cleanPositionName(old))e.position=fallback});setupWizardDraft.zoneRules.forEach(z=>{if(cleanPositionName(z.role)===cleanPositionName(old))z.role=fallback});renderSetupWizard();};
window.wizardSetZone=(i,k,v)=>{if(!setupWizardDraft?.zoneRules[i])return;let z=setupWizardDraft.zoneRules[i], old=z.zone;z[k]=k==='role'?cleanPositionName(v):String(v||'').trim();if(k==='zone'){if(z.zone&&!setupWizardDraft.zoneColors[z.zone])setupWizardDraft.zoneColors[z.zone]=setupWizardDraft.zoneColors[old]||defaultZonePalette[i%defaultZonePalette.length];if(old!==z.zone)delete setupWizardDraft.zoneColors[old];renderSetupWizard();}};
window.wizardSetZoneColor=(i,c)=>{let z=setupWizardDraft?.zoneRules[i];if(z?.zone)setupWizardDraft.zoneColors[z.zone]=c;};
window.wizardAddZone=()=>{let role=$('wizardNewZoneRole')?.value||setupWizardDraft.positions[0], zone=String($('wizardNewZoneName')?.value||'').trim(), lunch=String($('wizardNewZoneLunch')?.value||'').trim(), evening=String($('wizardNewZoneEvening')?.value||'').trim();if(!zone)return alert('Zone name required');setupWizardDraft.zoneRules.push({role:cleanPositionName(role),zone,lunch:lunch||'-',evening:evening||'-'});setupWizardDraft.zoneColors[zone]=defaultZonePalette[(Object.keys(setupWizardDraft.zoneColors).length)%defaultZonePalette.length];renderSetupWizard();};
window.wizardDeleteZone=i=>{if(!setupWizardDraft)return;if(!confirm('Delete this zone rule? Existing assignments keep their text value until changed.'))return;let z=setupWizardDraft.zoneRules[i];setupWizardDraft.zoneRules.splice(i,1);if(z?.zone)delete setupWizardDraft.zoneColors[z.zone];renderSetupWizard();};
window.wizardSetEmployee=(i,k,v)=>{let e=setupWizardDraft?.employees[i];if(!e)return;e[k]=k==='rate'?Number(v||0):k==='active'?v==='true':k==='position'?cleanPositionName(v):k==='pin'?sanitizePin(v):String(v||'').trim();};
window.wizardAddEmployee=()=>{let name=String($('wizardNewEmployeeName')?.value||'').trim();if(!name)return alert('Name required');let position=cleanPositionName($('wizardNewEmployeePosition')?.value||setupWizardDraft.positions[0]), rate=Number($('wizardNewEmployeeRate')?.value||13.5), pin=sanitizePin($('wizardNewEmployeePin')?.value)||defaultPinForIndex(setupWizardDraft.employees.length);setupWizardDraft.employees.push({id:id(),name,position,rate,active:true,pin});renderSetupWizard();};
window.wizardDeleteEmployee=i=>{if(!setupWizardDraft)return;let e=setupWizardDraft.employees[i];if(!confirm(`Delete ${e?.name||'this employee'} from setup?`))return;setupWizardDraft.employees.splice(i,1);renderSetupWizard();};
window.applySetupWizard=()=>{
  const draft=normalizeWizardDraft();
  if(!draft)return;
  if(setupWizardMode==='create'){
    const newId=slugifyWorkspace(draft.restaurant.name);
    const exists=mergedWorkspaceList().some(w=>w.id===newId);
    if(exists&&!confirm(`Workspace ${newId} already exists. Replace its setup data?`))return;
    if(window.DataAdapter.setWorkspaceId)window.DataAdapter.setWorkspaceId(newId);
    data={version:15,restaurant:draft.restaurant,weekStart:monday(),status:'Draft',employees:draft.employees,positions:draft.positions,zoneRules:draft.zoneRules,positionColors:draft.positionColors,zoneColors:draft.zoneColors,availability:{},assignments:{},submitted:{},notes:{},swaps:[],history:{},timeEntries:[]};
    storageReadOnly=false;
    ensure();
    session={role:'employee',employeeId:activeEmployees()[0]?.id||data.employees[0]?.id||null};
    window.DataAdapter.setLoggedIn(false);
    registerWorkspace({id:newId,restaurant:data.restaurant,name:restaurantName(),status:'Active'});
    save();
    setupWizardDialog.close();setupWizardDraft=null;setupWizardMode='edit';
    fillSelectors();applyRestaurantBrand();renderWorkspaceSelector();
    document.body.classList.remove('workspace-selecting','portal-selecting','dev-gated','logged-in','owner','employee');document.body.classList.add('logged-out');
    if($('devGate'))devGate.style.display='none';if($('workspace'))workspace.style.display='none';if($('login'))login.style.display='grid';
    alert('Restaurant workspace created. Choose access to enter.');
    return;
  }
  data.restaurant=draft.restaurant;
  data.positions=draft.positions;
  data.positionColors=draft.positionColors||{};
  data.zoneRules=draft.zoneRules;
  data.zoneColors=draft.zoneColors||{};
  data.employees=draft.employees;
  ensure();
  if(!session.employeeId||!emp(session.employeeId)){session.employeeId=activeEmployees()[0]?.id||data.employees[0]?.id||null}
  save();
  render();
  setupWizardDialog.close();
  setupWizardDraft=null;
  alert('Setup applied.');
};


/* v97 redesigned Costs + Dashboard tabs */
let costMetric='cost';
let costStack='zone';
let dashboardRange=12;
let dashboardMix='position';
function activeMetricLabel(){return metricFilter==='week'?'Selected week':metricFilter;}
function selectedPlannerRows(){
  const rows=weekRows(data);
  if(metricFilter==='week')return rows;
  return rows.filter(r=>r.d.slice(0,3)===metricFilter);
}
function rowsPeopleCount(rows){return new Set(rows.map(r=>r.e.id)).size}
function rowsAssignments(rows){return rows.length}
function summarizeRowsDeep(rows){
  const sum=summarizeRows(rows);
  sum.byShift={Lunch:{hours:0,cost:0,people:new Set(),assignments:0},Evening:{hours:0,cost:0,people:new Set(),assignments:0}};
  sum.zoneHours={};sum.positionHours={};sum.people=new Set();sum.assignments=rows.length;
  rows.forEach(r=>{
    sum.people.add(r.e.id);
    if(sum.byShift[r.shift]){sum.byShift[r.shift].hours+=r.h;sum.byShift[r.shift].cost+=r.cost;sum.byShift[r.shift].people.add(r.e.id);sum.byShift[r.shift].assignments++;}
    let p=cleanPositionName(r.position), z=r.zone||'Unassigned';
    sum.positionHours[p]=(sum.positionHours[p]||0)+r.h;
    sum.zoneHours[z]=(sum.zoneHours[z]||0)+r.h;
  });
  return sum;
}
function topEntry(obj){return Object.entries(obj||{}).sort((a,b)=>b[1]-a[1])[0]||['—',0]}
function renderCosts(){renderCurrentPlanCosts();renderDashboard();}
function renderAnalytics(){renderDashboard();}
function setCostMetric(v){costMetric=v||'cost';document.querySelectorAll('[data-cost-metric]').forEach(b=>b.classList.toggle('active',b.dataset.costMetric===costMetric));renderCurrentPlanCosts();}
function setCostStack(v){
  costStack = v==='position' ? 'position' : 'zone';
  document.querySelectorAll('[data-cost-stack]').forEach(b=>b.classList.toggle('active',b.dataset.costStack===costStack));
  renderCurrentPlanCosts();
}
function setDashboardRange(v){dashboardRange=+v||12;document.querySelectorAll('[data-dashboard-range]').forEach(b=>b.classList.toggle('active',+b.dataset.dashboardRange===dashboardRange));renderDashboard();}
function setDashboardMix(v){dashboardMix=v||'position';document.querySelectorAll('[data-dashboard-mix]').forEach(b=>b.classList.toggle('active',b.dataset.dashboardMix===dashboardMix));renderDashboard();}
function currentGroups(){return metricFilter==='week'?days:shifts}
function groupForRow(r){return metricFilter==='week'?r.d:r.shift}
function stackForRow(r){return costStack==='zone'?(r.zone||'Unassigned'):cleanPositionName(r.position)}
function stackOrder(){return costStack==='zone'?zoneRules.map(z=>z.zone).filter((z,i,a)=>z&&a.indexOf(z)===i):positions}
function stackClass(k){return costStack==='zone'?zoneClass(k):positionClass(k)}
function stackStyle(k){return costStack==='zone'?zoneStyle(k):positionStyle(k)}
function renderStackedBars(elId,rows,groups,categories,metric='cost',stackMode='position'){
  const el=$(elId);if(!el)return;
  el.innerHTML=buildStackedBarsHTML(rows,groups,categories,metric,stackMode,{maxHeight:190,labelMode:'auto',showLegend:true});
}
function renderCurrentPlanCosts(){
  const rows=selectedPlannerRows(); const sum=summarizeRowsDeep(rows); const isWeek=metricFilter==='week';
  const label=isWeek?'selected week':days.find(d=>d.slice(0,3)===metricFilter)||metricFilter;
  if($('costSelectionBadge'))costSelectionBadge.textContent=isWeek?'Week':metricFilter;
  if($('costHeroTitle'))costHeroTitle.textContent=`Planned cost by ${isWeek?'day':'shift'}`;
  if($('costHeroSubtitle'))costHeroSubtitle.textContent='';
  renderStackedBars('costHeroChart',rows,currentGroups(),stackOrder(),'cost',costStack);
  if($('analyticsCost'))analyticsCost.textContent=money(sum.cost);
  if($('analyticsHours'))analyticsHours.textContent=fmtHours(sum.hours);
  if($('analyticsCostCompare'))analyticsCostCompare.textContent=label;
  if($('analyticsHoursCompare'))analyticsHoursCompare.textContent=`${rowsAssignments(rows)} assignments`;
  if($('teamCount'))teamCount.textContent=rowsPeopleCount(rows);
  if($('analyticsAvgCost'))analyticsAvgCost.textContent=sum.hours?money(sum.cost/sum.hours):'€0';
  const byGroupCost={}; rows.forEach(r=>{let g=isWeek?r.d:r.shift;byGroupCost[g]=(byGroupCost[g]||0)+r.cost});
  let top=topEntry(byGroupCost); if($('topDay'))topDay.textContent=top[0]==='—'?'—':(isWeek?top[0].slice(0,3):top[0]); if($('topDayDetail'))topDayDetail.textContent=top[1]?`${money(top[1])} · ${fmtHours((rows.filter(r=>(isWeek?r.d:r.shift)===top[0]).reduce((a,r)=>a+r.h,0)))}`:'No cost yet';
  let pos=topEntry(sum.byPos); if($('topPosition'))topPosition.textContent=pos[0]; if($('topPositionDetail'))topPositionDetail.textContent=sum.cost&&pos[1]?`${Math.round(pos[1]/sum.cost*100)}% of cost`:'No cost yet';
  let zone=topEntry(sum.byZone); if($('topZone'))topZone.textContent=zone[0]; if($('topZoneDetail'))topZoneDetail.textContent=sum.cost&&zone[1]?`${Math.round(zone[1]/sum.cost*100)}% of cost`:'No cost yet';
  if($('assignmentCount'))assignmentCount.textContent=rows.length;
  renderCurrentInsights(rows,sum,isWeek,label);
  const dayOverviewEl=$('dayOverview');
  if(dayOverviewEl){
    const stackMode=costStack==='position'?'position':'zone';
    const stackCategories=stackMode==='zone'
      ? zoneRules.map(z=>z.zone).filter((z,i,a)=>z&&a.indexOf(z)===i)
      : positions;
    const stackLabel=stackMode==='zone'?'zone':'position';
    const legendHTML=stackCategories.slice(0,12).map(k=>{
      const cls=stackMode==='zone'?zoneClass(k):positionClass(k);
      const sty=stackMode==='zone'?zoneStyle(k):positionStyle(k);
      return `<span><i class="${cls}" ${styleAttr(sty)}></i>${esc(k)}</span>`;
    }).join('');
    dayOverviewEl.innerHTML=`<div class="grid two dashboard-grid cost-dual-breakdown"><section class="panel mini-breakdown-panel"><h4>Hours by ${isWeek?'day':'shift'}</h4>${buildStackedBarsHTML(rows,currentGroups(),stackCategories,'hours',stackMode,{maxHeight:150,labelMode:'auto',showLegend:false})}</section><section class="panel mini-breakdown-panel"><h4>Cost by ${isWeek?'day':'shift'}</h4>${buildStackedBarsHTML(rows,currentGroups(),stackCategories,'cost',stackMode,{maxHeight:150,labelMode:'auto',showLegend:false})}</section></div><div class="legend">${legendHTML}</div>`;
  }
  renderCombinedBreakdown('positionBreakdown', combinePositionStats(rows), 'position');
  renderCombinedBreakdown('zoneBreakdown', combineZoneStats(rows), 'zone');
  renderEmployeeInsightsForRows('employeeInsights', rows);
}
function renderCurrentInsights(rows,sum,isWeek,label){
  const el=$('insightAlerts');if(!el)return; const cards=[];
  if(!rows.length){cards.push(['neutral','No planned shifts','Add assignments in Planning to see cost insights.']);}
  else{
    const avgDay=sum.hours/Math.max(1,days.filter(d=>sum.hoursByDay[d]>0).length||1);
    const topDay=topEntry(sum.hoursByDay); if(isWeek&&topDay[1])cards.push(['ok','Busiest day',`${topDay[0].slice(0,3)} has ${fmtHours(topDay[1])} planned hours.`]);
    const pos=topEntry(sum.byPos); if(pos[1])cards.push(['warn','Top position driver',`${pos[0]} represents ${Math.round(pos[1]/Math.max(1,sum.cost)*100)}% of planned cost.`]);
    const zone=topEntry(sum.byZone); if(zone[1])cards.push(['warn','Top zone driver',`${zone[0]} represents ${Math.round(zone[1]/Math.max(1,sum.cost)*100)}% of planned cost.`]);
    const empList=Object.values(sum.byEmp).sort((a,b)=>b.hours-a.hours); if(empList[0])cards.push([empList[0].hours>45?'bad':'ok','Highest workload',`${empList[0].name} has ${fmtHours(empList[0].hours)} planned hours.`]);
    if(isWeek){let low=Object.entries(sum.hoursByDay).filter(x=>x[1]>0).sort((a,b)=>a[1]-b[1])[0]; if(low)cards.push(['neutral','Lightest staffed day',`${low[0].slice(0,3)} has ${fmtHours(low[1])} planned hours.`]);}
    const zeroZones=zoneRules.map(z=>z.zone).filter((z,i,a)=>z&&a.indexOf(z)===i&&!(sum.byZone[z]>0)); if(zeroZones.length)cards.push(['neutral','Unused zones',zeroZones.slice(0,3).join(', ')+(zeroZones.length>3?'…':'')+' have no planned cost.']);
  }
  el.innerHTML=cards.slice(0,6).map(([kind,title,body])=>`<div class="alert-card ${kind}"><strong>${esc(title)}</strong><span>${esc(body)}</span></div>`).join('');
}
function dashboardWeeks(){let n=dashboardRange;let weeks=[];for(let i=n-1;i>=0;i--){let w=addDays(data.weekStart,-7*i);let rows=snapshotRows(w);let sum=summarizeRows(rows);weeks.push({week:w,label:w.slice(5),rows,sum,cost:sum.cost,hours:sum.hours});}return weeks;}
function renderDashboard(){
  const weeks=dashboardWeeks(); const rows=rowsForWeeks(weeks.map(w=>w.week)); const sum=summarizeRows(rows);
  const prevWeeks=weeks.map(w=>addDays(w.week,-7*weeks.length)); const prev=summarizeRows(rowsForWeeks(prevWeeks));
  if($('trendCost'))trendCost.textContent=money(sum.cost); if($('trendHours'))trendHours.textContent=fmtHours(sum.hours);
  if($('trendCostDelta'))trendCostDelta.textContent=prev.cost?`${sum.cost>=prev.cost?'+':''}${money(sum.cost-prev.cost)} vs previous ${weeks.length}w`:'No previous data';
  if($('trendHoursDelta'))trendHoursDelta.textContent=prev.hours?`${sum.hours>=prev.hours?'+':''}${fmtHours(sum.hours-prev.hours)}h vs previous ${weeks.length}w`:'No previous data';
  if($('trendAvgCost'))trendAvgCost.textContent=money(sum.cost/Math.max(1,weeks.length)); if($('trendAvgHours'))trendAvgHours.textContent=fmtHours(sum.hours/Math.max(1,weeks.length));
  let peak=weeks.slice().sort((a,b)=>b.cost-a.cost)[0]; if($('trendPeakWeek'))trendPeakWeek.textContent=peak?peak.label:'—'; if($('trendPeakDetail'))trendPeakDetail.textContent=peak?money(peak.cost):'No data';
  let driver=dashboardMix==='zone'?topEntry(sum.byZone):topEntry(sum.byPos); if($('trendDriver'))trendDriver.textContent=driver[0]; if($('trendDriverDetail'))trendDriverDetail.textContent=sum.cost&&driver[1]?Math.round(driver[1]/sum.cost*100)+'% of cost':'No cost yet';
  renderTrend('dashboardCostTrend',weeks,'cost'); renderTrend('dashboardHoursTrend',weeks,'hours');
  renderDashboardMix(weeks); renderCombinedBreakdown('dashboardPositionBreakdown',combinePositionStats(rows),'position'); renderCombinedBreakdown('dashboardZoneBreakdown',combineZoneStats(rows),'zone');
}
function renderDashboardMix(weeks){
  const el=$('dashboardStackedMix');if(!el)return; if($('dashboardMixTitle'))dashboardMixTitle.textContent=`Cost mix over time by ${dashboardMix}`;
  const cats=dashboardMix==='zone'?zoneRules.map(z=>z.zone).filter((z,i,a)=>z&&a.indexOf(z)===i):positions;
  const rows=[]; weeks.forEach(w=>w.rows.forEach(r=>rows.push({...r,_group:w.label})));
  const oldMetric=costMetric, oldStack=costStack; costStack=dashboardMix; renderStackedBars('dashboardStackedMix',rows,weeks.map(w=>w.label),cats,'cost',dashboardMix); costMetric=oldMetric; costStack=oldStack;
}
const __oldSetMetricFilter=setMetricFilter;
setMetricFilter=function(v){__oldSetMetricFilter(v);renderCurrentPlanCosts();};

init();
setInterval(()=>{if(data&&($('timeClockLiveTime')||$('terminalLiveTime')))renderTimeClock();},15000);

// v67: close metric insight panel when clicking outside it or its metric chip.
document.addEventListener('click', function(e){
  const panel=document.getElementById('metricDetailPanel');
  if(!panel)return;
  if(e.target.closest('.metric-detail-panel') || e.target.closest('.metric-chip'))return;
  clearMetricPanel();
});

// v97 dashboard button handlers
if(typeof document!=='undefined'){
  document.addEventListener('click',function(e){
    const cm=e.target.closest('[data-cost-metric]'); if(cm){setCostMetric(cm.dataset.costMetric);return;}
    const cs=e.target.closest('[data-cost-stack]'); if(cs){e.preventDefault();setCostStack(cs.dataset.costStack);return;}
    const dr=e.target.closest('[data-dashboard-range]'); if(dr){setDashboardRange(dr.dataset.dashboardRange);return;}
    const dm=e.target.closest('[data-dashboard-mix]'); if(dm){setDashboardMix(dm.dataset.dashboardMix);return;}
  });
}

window.openTimesheetSlot=openTimesheetSlot;
