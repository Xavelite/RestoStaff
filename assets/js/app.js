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
let data,session={role:'employee',employeeId:null},loginRole='employee',pendingSwap=null,pendingZone=null,selectedCalendarRow='',metricFilter='week',showZeroRows=true,metricFocus=null,notifOpen=false,notifRead={},showMetrics=true;
function id(){return (crypto.randomUUID?crypto.randomUUID():String(Date.now()+Math.random())).replaceAll('-','').slice(0,12)}
function esc(s=''){return String(s).replace(/[&<>"]/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[m]))}
function cleanPositionName(p='') { return String(p).replace(/^\s*[A-Z]\.\s*/, '').trim(); }
function positionIndex(p){let clean=cleanPositionName(p);let i=positions.findIndex(x=>cleanPositionName(x)===clean);return i<0?999:i}
function sortEmployees(list){return [...list].sort((a,b)=>positionIndex(a.position)-positionIndex(b.position)||String(a.name).localeCompare(String(b.name)))}
function money(n){return '€'+Number(n||0).toFixed(2)}
function localISO(d){let x=new Date(d);x.setHours(12,0,0,0);let y=x.getFullYear(),m=String(x.getMonth()+1).padStart(2,'0'),day=String(x.getDate()).padStart(2,'0');return `${y}-${m}-${day}`}
function parseISO(iso){let [y,m,d]=String(iso||localISO(new Date())).split('-').map(Number);let x=new Date(y,(m||1)-1,d||1);x.setHours(12,0,0,0);return x}
function monday(d=new Date()){let x=(d instanceof Date)?new Date(d):parseISO(d);x.setHours(12,0,0,0);let day=(x.getDay()+6)%7;x.setDate(x.getDate()-day);return localISO(x)}
function addDays(iso,n){let d=parseISO(iso);d.setDate(d.getDate()+n);return localISO(d)}
function dateForDay(dayName){let idx=days.indexOf(dayName);return addDays(data.weekStart,idx)}
function newData(){let employees=defaults.map((r,i)=>{let [name,position,rate]=r.split('|');return{id:'e'+i,name,position,rate:+rate,active:true}});let o={version:13,weekStart:monday(),status:'Draft',employees,positions:[...defaultPositions],zoneRules:structuredClone(defaultZoneRules),positionColors:{},zoneColors:{},availability:{},assignments:{},submitted:{},notes:{},swaps:[],history:{}};ensure(o);return o}
function defaultEmployees(){return defaults.map((r,i)=>{let [name,position,rate]=r.split('|');return{id:'e'+i,name,position,rate:+rate,active:true}})}
function ensure(o=data){
  // Migration/safety: older local versions could leave the app with no employees or inactive/partial employee objects.
  if(!Array.isArray(o.employees)||!o.employees.length)o.employees=defaultEmployees();
  o.positions=(o.positions&&o.positions.length?o.positions:[...defaultPositions]).map(cleanPositionName);
  // de-duplicate clean position names while preserving owner order
  o.positions=o.positions.filter((p,i,a)=>p&&a.indexOf(p)===i);
  positions=o.positions;
  o.employees=o.employees.map((e,i)=>({
    id:e.id||('e'+i),
    name:e.name||('Employee '+(i+1)),
    position:cleanPositionName(e.position||defaultPositions[0]),
    rate:Number(e.rate??13.5),
    active:e.active===undefined?true:!!e.active
  }));
  if(!o.employees.some(e=>e.active))o.employees.forEach(e=>e.active=true);
  o.zoneRules=o.zoneRules&&o.zoneRules.length?o.zoneRules:structuredClone(defaultZoneRules);
  o.zoneRules=o.zoneRules.map(z=>({...z, role: cleanPositionName(z.role||'')}));
  zoneRules=o.zoneRules;
  o.positionColors=o.positionColors||{};
  o.zoneColors=o.zoneColors||{};
  positions.forEach((p,i)=>{ if(!o.positionColors[p]) o.positionColors[p]=defaultPositionPalette[i%defaultPositionPalette.length]; });
  [...new Set(zoneRules.map(z=>z.zone).filter(Boolean))].forEach((z,i)=>{ if(!o.zoneColors[z]) o.zoneColors[z]=defaultZonePalette[i%defaultZonePalette.length]; });
  o.availability=o.availability||{};o.assignments=o.assignments||{};o.submitted=o.submitted||{};o.notes=o.notes||{};o.swaps=Array.isArray(o.swaps)?o.swaps:[];o.history=o.history||{};
  days.forEach(d=>{o.notes[d]=o.notes[d]||{};shifts.forEach(s=>o.notes[d][s]=o.notes[d][s]||'')});
  o.employees.forEach(e=>{o.availability[e.id]=o.availability[e.id]||{};o.assignments[e.id]=o.assignments[e.id]||{};days.forEach(d=>{o.availability[e.id][d]=o.availability[e.id][d]||{};o.assignments[e.id][d]=o.assignments[e.id][d]||{};shifts.forEach(s=>{if(o.availability[e.id][d][s]===undefined)o.availability[e.id][d][s]=false;o.assignments[e.id][d][s]=o.assignments[e.id][d][s]||''})})});
  return o
}
function safeJSON(key,fallback){return window.DataAdapter.getJSON(key,fallback)}
function load(){data=window.DataAdapter.readPlanner()||newData();data.weekStart=monday(data.weekStart||new Date());ensure();session=window.DataAdapter.readSession(session)||session;if(!session.employeeId||!emp(session.employeeId)){session.employeeId=activeEmployees()[0]?.id||data.employees[0]?.id||null}save()}
function save(){window.DataAdapter.savePlanner(data);window.DataAdapter.saveSession(session)}
function emp(id){return data.employees.find(e=>e.id===id)}
function activeEmployees(){return sortEmployees(data.employees.filter(e=>e.active))}
function selectedId(){return session.role==='owner'?employeeSelect.value:session.employeeId}
function suggestZone(e,s){if(!e)return'';if(e.position.includes('Maitre'))return 'AC';if(e.position.includes('Barman'))return s==='Lunch'?'BAR 1':'BAR ET';if(e.position.includes('Extra'))return s==='Lunch'?'PASS 1':'PASS B 1';return s==='Lunch'?'DOM 1':'ILOT 1'}
function defaultHours(s){return s==='Lunch'?4:6}
function timeRangeFor(e,d,s){let zone=data.assignments[e.id]?.[d]?.[s]||suggestZone(e,s);let rule=zoneRules.find(r=>r.zone===zone);return rule?(s==='Lunch'?rule.lunch:rule.evening):(s==='Lunch'?'11:00-15:00':'17:50-23:00')}
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
  const sticky=parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--sticky-shell-h'))||300;
  const h1=parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--head1-h'))||54;
  const h2=parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--head2-h'))||46;
  const target=window.scrollY + row.getBoundingClientRect().top - sticky - h1 - h2 - 10;
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

function toggleMetricsFn(){
  showMetrics=!showMetrics;
  window.DataAdapter.savePreference(window.DataAdapter.KEYS.showMetrics, showMetrics?'1':'0');
  document.body.classList.toggle('metrics-collapsed',!showMetrics);
  render();
}
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
function init(){showZeroRows=window.DataAdapter.readPreference(window.DataAdapter.KEYS.showZeroRows,'1')!=='0';showMetrics=window.DataAdapter.readPreference(window.DataAdapter.KEYS.showMetrics,'1')!=='0';document.body.classList.toggle('metrics-collapsed',!showMetrics);notifRead=window.DataAdapter.readNotificationsRead();load();bind();fillSelectors();if(window.DataAdapter.isLoggedIn()){enterApp(false)}else{document.body.className='desktop logged-out';$('login').style.display='grid'}render();updateStickyVars()}
function bind(){roleEmployee.onclick=()=>setLoginRole('employee');roleOwner.onclick=()=>setLoginRole('owner');if($('notifBtn'))notifBtn.onclick=(e)=>{e.stopPropagation();notifOpen=!notifOpen;renderNotifications()};document.addEventListener('click',e=>{if(!e.target.closest('.notif-wrap')){notifOpen=false;renderNotifications()}if(!e.target.closest('.metric-detail-panel')&&!e.target.closest('.metric-card')&&!e.target.closest('.position-metric-card')&&!e.target.closest('.zone-metric-card'))clearMetricPanel();});enterBtn.onclick=()=>{session.role=loginRole;session.employeeId=employeeLogin.value;window.DataAdapter.setLoggedIn(true);save();enterApp(true)};switchBtn.onclick=()=>{window.DataAdapter.setLoggedIn(false);document.body.className=(document.body.classList.contains('phone')?'phone':'desktop')+' logged-out';$('login').style.display='grid'};pcBtn.onclick=()=>setPreview('desktop');phoneBtn.onclick=()=>setPreview('phone');document.querySelectorAll('.nav').forEach(b=>b.onclick=()=>showPage(b.dataset.page));document.querySelectorAll('.tabs button').forEach(b=>b.onclick=()=>showTab(b.dataset.tab));prevWeek.onclick=()=>changeWeek(-7);nextWeek.onclick=()=>changeWeek(7);weekStart.onchange=()=>{saveWeekSnapshot();data.weekStart=monday(weekStart.value);loadWeekSnapshot();save();render()};employeeSelect.onchange=()=>{session.employeeId=employeeSelect.value;save();render()};submitAvailability.onclick=()=>{data.submitted[selectedId()]=true;let e=emp(selectedId());addNotification('availability-'+data.weekStart+'-'+selectedId(),'yellow','Availability submitted',`${e?.name||'Employee'} submitted availability for this week.`,{kind:'submission',id:selectedId()});save();render();alert('Availability submitted.')};clearMine.onclick=clearMyDraft;publishToggleBtn.onclick=togglePublish;copyLastWeek.onclick=copyPreviousWeek;messageBtn.onclick=openMessage;copySchedule.onclick=openMessage;if($('ownerCopySchedule'))ownerCopySchedule.onclick=openMessage;copyMessage.onclick=()=>navigator.clipboard.writeText(messageText.value).then(()=>alert('Copied.'));closeMessage.onclick=()=>messageDialog.close();printBtn.onclick=()=>print();if($('ownerPrintBtn'))ownerPrintBtn.onclick=()=>print();if($('toggleZeroRows'))toggleZeroRows.onclick=toggleZeroRowsFn;if($('ownerToggleZeroRows'))ownerToggleZeroRows.onclick=toggleZeroRowsFn;if($('toggleMetrics'))$('toggleMetrics').onclick=toggleMetricsFn;exportBtn.onclick=exportBackup;importInput.onchange=importBackup;resetBtn.onclick=()=>{if(confirm('Reset all local data?')){window.DataAdapter.resetPlanner();data=newData();save();render()}};addEmployee.onclick=addEmployeeFn;if($('addPositionBtn'))addPositionBtn.onclick=addPositionFn;if($('addZoneBtn'))addZoneBtn.onclick=addZoneFn;document.querySelectorAll('.analytics-controls .segmented button[data-range]').forEach(b=>b.onclick=()=>setAnalyticsRange(b.dataset.range));document.querySelectorAll('.metric-filter').forEach(sel=>sel.onchange=e=>setMetricFilter(e.target.value));document.querySelectorAll('.metric-day-btn').forEach(btn=>btn.onclick=()=>setMetricFilter(btn.dataset.metric));confirmSwap.onclick=confirmSwapFn;cancelSwap.onclick=()=>swapDialog.close();if($('saveZoneDialog'))saveZoneDialog.onclick=saveZoneDialogFn;if($('cancelZoneDialog'))cancelZoneDialog.onclick=()=>{pendingZone=null;zoneDialog.close()};if($('closeDayNote'))closeDayNote.onclick=()=>dayNoteDialog.close()}
function setPreview(mode){document.body.classList.toggle('phone',mode==='phone');document.body.classList.toggle('desktop',mode==='desktop');pcBtn.classList.toggle('active',mode==='desktop');phoneBtn.classList.toggle('active',mode==='phone')}
function setLoginRole(role){loginRole=role;roleEmployee.classList.toggle('active',role==='employee');roleOwner.classList.toggle('active',role==='owner');employeeLoginWrap.style.display=role==='employee'?'grid':'none'}
function enterApp(goHome){document.body.classList.remove('logged-out');document.body.classList.add('logged-in');$('login').style.display='none';document.body.classList.toggle('owner',session.role==='owner');document.body.classList.toggle('employee',session.role==='employee');const defaultPage=session.role==='owner'?'owner':'published';const activePage=document.querySelector('.page.active');if(goHome||!activePage||(session.role==='owner'&&activePage.id!=='page-owner')||(session.role==='employee'&&activePage.id==='page-owner'))showPage(defaultPage);if(session.role==='owner'&&!document.querySelector('.tab.active'))showTab('planning');fillSelectors();render();updateStickyVars()}
function fillSelectors(){
  const employees=activeEmployees();
  const opts=employees.map(e=>`<option value="${e.id}">${esc(e.name)}</option>`).join('');
  const loginSel=$('employeeLogin'), employeeSel=$('employeeSelect'), positionSel=$('newPosition');
  if(!employees.some(e=>e.id===session.employeeId)) session.employeeId=employees[0]?.id||'';
  if(loginSel){loginSel.innerHTML=opts;loginSel.value=session.employeeId||'';}
  if(employeeSel){employeeSel.innerHTML=opts;employeeSel.value=session.employeeId||'';}
  if(positionSel){positionSel.innerHTML=positions.map(p=>`<option>${esc(p)}</option>`).join('');}
}
function showPage(p){document.querySelectorAll('.page').forEach(x=>x.classList.remove('active'));$('page-'+p).classList.add('active');document.querySelectorAll('.nav').forEach(b=>b.classList.toggle('active',b.dataset.page===p));updatePlanningMode();requestAnimationFrame(updateStickyVars)}
function showTab(t){document.querySelectorAll('.tab').forEach(x=>x.classList.remove('active'));$('tab-'+t).classList.add('active');document.querySelectorAll('.tabs button').forEach(b=>b.classList.toggle('active',b.dataset.tab===t));updateAppTitle();updatePlanningMode();requestAnimationFrame(updateStickyVars)}
function updateAppTitle(){if(!$('appTitle'))return; if(session.role==='employee'){appTitle.textContent='Calendar'; return;} const active=document.querySelector('.tabs button.active'); appTitle.textContent=active?active.textContent:'Planning'}
function updatePlanningMode(){
  const publishedActive=document.getElementById('page-published')?.classList.contains('active');
  const ownerPlanning=document.getElementById('page-owner')?.classList.contains('active') && document.getElementById('tab-planning')?.classList.contains('active');
  document.body.classList.toggle('planning-mode', !!(publishedActive || ownerPlanning));
}

function setStickyCssVar(name,value){
  document.documentElement.style.setProperty(name,value);
  if(document.body) document.body.style.setProperty(name,value);
}
function updateStickyVars(){
  if(!document.body.classList.contains('logged-in'))return;
  const top=document.querySelector('.topbar');
  const toolbar=document.querySelector('.planner-toolbar');
  const metrics=document.querySelector('.page.active .calendar-top-metrics');
  const th=top?Math.ceil(top.getBoundingClientRect().height):96;
  const bh=toolbar?Math.ceil(toolbar.getBoundingClientRect().height):58;
  const hidden=!showMetrics || document.body.classList.contains('metrics-collapsed');
  const mh=(!hidden && metrics)?Math.ceil(metrics.getBoundingClientRect().height):0;
  const shell=th+bh+mh;
  setStickyCssVar('--topbar-h', th+'px');
  setStickyCssVar('--toolbar-h', bh+'px');
  setStickyCssVar('--metrics-h', mh+'px');
  setStickyCssVar('--metrics-top', (th+bh)+'px');
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

function render(){fillSelectors();weekStart.value=data.weekStart;let who=session.role==='owner'?'Owner':(emp(session.employeeId)?.name||'Employee');userPill.textContent=who;updateAppTitle();updatePlanningMode();
  if($('statusBadge')){statusBadge.textContent=data.status;statusBadge.className='badge '+data.status.toLowerCase();}
  if($('statusText'))statusText.textContent=data.status==='Published'?'Published – changes via owner-approved swaps only.':'Unpublished draft – owner can edit the week.';
  if($('publishedBanner')){publishedBanner.className='banner';publishedBanner.textContent='';}
  if($('publishedStatusIcon')){publishedStatusIcon.textContent=data.status==='Published'?'Published':'Draft';publishedStatusIcon.title=data.status==='Published'?'Published: employees can request swaps; owner approval required.':'Draft: employees can mark availability; owner can edit planning.';publishedStatusIcon.className='status-chip '+(data.status==='Published'?'published':'draft');} if($('ownerStatusChip')){ownerStatusChip.textContent=data.status==='Published'?'Published':'Draft';ownerStatusChip.title=data.status==='Published'?'Published: swaps need owner approval.':'Draft: employees can still fill availability.';ownerStatusChip.className='status-chip '+(data.status==='Published'?'published':'draft');}
  document.querySelectorAll('.metric-filter').forEach(sel=>sel.value=metricFilter);document.querySelectorAll('.metric-day-btn').forEach(btn=>btn.classList.toggle('active',btn.dataset.metric===metricFilter));document.querySelectorAll('.toggle-zero').forEach(b=>{b.classList.toggle('active',!showZeroRows);b.textContent=showZeroRows?'Ø':'👁';b.title=showZeroRows?'Hide employees with 0 hours':'Show all employees';});if($('toggleMetrics')){$('toggleMetrics').classList.toggle('active',!showMetrics);$('toggleMetrics').textContent='';$('toggleMetrics').title=showMetrics?'Hide metrics':'Show metrics';$('toggleMetrics').setAttribute('aria-label', showMetrics?'Hide metrics':'Show metrics');}document.body.classList.toggle('metrics-collapsed',!showMetrics);
  if($('publishToggleBtn')){publishToggleBtn.textContent='';publishToggleBtn.className=data.status==='Published'?'secondary icon-action publish-control':'primary icon-action publish-control';publishToggleBtn.title=data.status==='Published'?'Unpublish schedule':'Publish schedule';publishToggleBtn.setAttribute('aria-label', publishToggleBtn.title)};publishedCalendar.innerHTML=calendar(session.role==='employee'?'employee':'published');employeeCalendar.innerHTML=calendar('employee');ownerCalendar.innerHTML=calendar('owner');[publishedCalendar,employeeCalendar,ownerCalendar].forEach(el=>{if(el)el.classList.toggle('published-calendar',data.status==='Published')});renderNotes('publishedNotes',false);renderNotes('employeeNotes',false);renderNotes('ownerNotes',true);renderZones('publishedZones');renderZones('employeeZones');renderSwaps();if($('publishedEmployeeSwaps')) $('publishedEmployeeSwaps').innerHTML=swapCards('employee');renderSubmissions();renderEmployeeManager();renderZoneManager();renderCosts();renderPositionHours('ownerPositionHours');renderPositionHours('publishedPositionHours');renderPositionHours('employeePositionHours');renderZoneHours('ownerZoneHours');renderZoneHours('publishedZoneHours');renderZoneHours('employeeZoneHours');renderNotifications();requestAnimationFrame(updateStickyVars)}
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
  let emptyLabel='Unavailable';
  let content=avail?`<div class="name">${esc(e.name)}</div>${mode==='owner'?zoneControl:`<div class="zone">${zoneDot(displayZone)}${esc(displayZone)}</div>`}<div class="meta">${esc(timeRangeFor(e,d,s))}</div>`:`<div class="empty-label">${emptyLabel}</div>`;
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

window.selectCalRow=(key)=>{selectedCalendarRow=key;metricFocus=null;clearMetricPanel();document.querySelectorAll('.calendar-row').forEach(r=>r.classList.toggle('row-selected',r.dataset.rowkey===key))}

window.slotClick=(id,d,s,mode)=>{
  if(mode==='owner'){ownerToggleSlot(id,d,s);return}
  if(mode==='published'&&session.role!=='employee')return;
  if(data.status!=='Published'){
    if(id!==session.employeeId)return;
    data.availability[id][d][s]=!data.availability[id][d][s];
    if(data.availability[id][d][s]&&!data.assignments[id][d][s])data.assignments[id][d][s]=suggestZone(emp(id),s);
    if(!data.availability[id][d][s])data.assignments[id][d][s]='';
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
function ownerToggleSlot(id,d,s){if(data.status==='Published')return alert('Unpublish the schedule before changing planning. Swaps can still be approved while published.');let e=emp(id);if(!e)return;data.availability[id][d][s]=!data.availability[id][d][s];if(data.availability[id][d][s]){data.assignments[id][d][s]=data.assignments[id][d][s]||suggestZone(e,s);data.submitted[id]=true;addNotification('shift-'+id+d+s,'yellow','Shift added',`${e.name} was planned on ${d} ${s}.`,{kind:'employee',id})}else{data.assignments[id][d][s]='';addNotification('shift-remove-'+id+d+s,'yellow','Shift removed',`${e.name} was removed from ${d} ${s}.`,{kind:'employee',id})}save();render()}
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
function clearMyDraft(){if(data.status==='Published')return alert('Published schedule is locked. Use swaps.');days.forEach(d=>shifts.forEach(s=>{data.availability[session.employeeId][d][s]=false;data.assignments[session.employeeId][d][s]=''}));data.submitted[session.employeeId]=false;save();render()}

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
function renderEmployeeManager(){employeeManager.innerHTML='<table class="data"><thead><tr><th>Name</th><th>Position</th><th>€/hour</th><th>Active</th></tr></thead><tbody>'+data.employees.map(e=>`<tr><td><input value="${esc(e.name)}" onchange="editEmp('${e.id}','name',this.value)"></td><td><select onchange="editEmp('${e.id}','position',this.value)">${positions.map(p=>`<option ${p===e.position?'selected':''}>${p}</option>`).join('')}</select></td><td><input type="number" step="0.25" value="${e.rate}" onchange="editEmp('${e.id}','rate',this.value)"></td><td><select onchange="editEmp('${e.id}','active',this.value)"><option value="true" ${e.active?'selected':''}>Active</option><option value="false" ${!e.active?'selected':''}>Inactive</option></select></td></tr>`).join('')+'</tbody></table>'}
window.editEmp=(id,field,val)=>{let e=emp(id);if(!e)return;e[field]=field==='rate'?+val:field==='active'?val==='true':val;ensure();save();render()}
function addEmployeeFn(){let name=newName.value.trim();if(!name)return alert('Name required');data.employees.push({id:id(),name,position:newPosition.value,rate:+newRate.value||13.5,active:true});newName.value='';newRate.value='';ensure();save();render()}
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
function setMetricFilter(v){metricFilter=v||'week';document.querySelectorAll('.metric-filter').forEach(sel=>sel.value=metricFilter);document.querySelectorAll('.metric-day-btn').forEach(btn=>btn.classList.toggle('active',btn.dataset.metric===metricFilter));document.querySelectorAll('.toggle-zero').forEach(b=>{b.classList.toggle('active',!showZeroRows);b.textContent=showZeroRows?'Ø':'👁';b.title=showZeroRows?'Hide employees with 0 hours':'Show all employees';});if($('toggleMetrics')){$('toggleMetrics').classList.toggle('active',!showMetrics);$('toggleMetrics').textContent='';$('toggleMetrics').title=showMetrics?'Hide metrics':'Show metrics';$('toggleMetrics').setAttribute('aria-label', showMetrics?'Hide metrics':'Show metrics');}document.body.classList.toggle('metrics-collapsed',!showMetrics);renderPositionHours('ownerPositionHours');renderPositionHours('publishedPositionHours');renderPositionHours('employeePositionHours');renderZoneHours('ownerZoneHours');renderZoneHours('publishedZoneHours');renderZoneHours('employeeZoneHours')}
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

function saveWeekSnapshot(){data.history[data.weekStart]={availability:structuredClone(data.availability),assignments:structuredClone(data.assignments),submitted:structuredClone(data.submitted),notes:structuredClone(data.notes),swaps:structuredClone(data.swaps),status:data.status}}
function loadWeekSnapshot(){let h=data.history[data.weekStart];if(h){data.availability=h.availability;data.assignments=h.assignments;data.submitted=h.submitted;data.notes=h.notes;data.swaps=h.swaps;data.status=h.status==='Reviewed'?'Draft':h.status}else{let employees=data.employees;data.availability={};data.assignments={};data.submitted={};data.notes={};data.swaps=[];data.status='Draft';ensure({employees,availability:data.availability,assignments:data.assignments,submitted:data.submitted,notes:data.notes,swaps:data.swaps,history:data.history,weekStart:data.weekStart,status:data.status})}ensure()}
function changeWeek(n){saveWeekSnapshot();data.weekStart=monday(addDays(data.weekStart,n));loadWeekSnapshot();save();render()}
function copyPreviousWeek(){if(!confirm('Copy previous week into this week? Current week draft will be replaced.'))return;let prev=addDays(data.weekStart,-7);let h=data.history[prev];if(!h)return alert('No previous week saved yet. Go to that week first or create a schedule.');data.availability=structuredClone(h.availability);data.assignments=structuredClone(h.assignments);data.notes=structuredClone(h.notes);data.submitted={};data.swaps=[];data.status='Draft';ensure();save();render()}
function openMessage(){let lines=[`Bouillon Bruxelles schedule`, `Week starting: ${data.weekStart}`, `Status: ${data.status}`, ''];days.forEach(d=>{lines.push(`${d} ${dateForDay(d)}`);shifts.forEach(s=>{let people=activeEmployees().filter(e=>data.availability[e.id][d][s]);if(people.length){lines.push(` ${s}:`);people.forEach(e=>lines.push(` - ${e.name}: ${data.assignments[e.id][d][s]||suggestZone(e,s)}`));if(data.notes[d][s])lines.push(` Note: ${data.notes[d][s]}`)}});lines.push('')});messageText.value=lines.join('\n');messageDialog.showModal()}
function exportBackup(){let blob=new Blob([JSON.stringify(data,null,2)],{type:'application/json'}),a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='bouillon-planner-backup.json';a.click();URL.revokeObjectURL(a.href)}
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
  if($('costHeroSubtitle'))costHeroSubtitle.textContent=`Stacked by ${costStack}. Labels show cost, hours and people.`;
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
    dayOverviewEl.innerHTML=`<div class="grid two dashboard-grid cost-dual-breakdown"><section class="panel mini-breakdown-panel"><h4>Hours by ${isWeek?'day':'shift'}</h4><p class="muted">Stacked by ${stackLabel} color. Labels show total hours and people.</p>${buildStackedBarsHTML(rows,currentGroups(),stackCategories,'hours',stackMode,{maxHeight:150,labelMode:'auto',showLegend:false})}</section><section class="panel mini-breakdown-panel"><h4>Cost by ${isWeek?'day':'shift'}</h4><p class="muted">Stacked by ${stackLabel} color. Labels show total cost, hours and people.</p>${buildStackedBarsHTML(rows,currentGroups(),stackCategories,'cost',stackMode,{maxHeight:150,labelMode:'auto',showLegend:false})}</section></div><div class="legend">${legendHTML}</div>`;
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
