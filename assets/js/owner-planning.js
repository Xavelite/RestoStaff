/*
 * restogogo owner planning
 * Owns the manager planning page: metrics, calendar rendering, filters,
 * selection, slot mutations, publish/draft actions and exports.
 * app.js remains the thin shell/state/persistence layer.
 */
let selectedOwnerPlanningDay = '';
let selectedOwnerPlanningRow = '';
let ownerOpenZoneKey = '';
let ownerPlanningSearch = '';
let ownerPlanningPositionFilter = 'all';
let ownerPlanningView = 'all';
let ownerPlanningLastConflictCount = null;
let ownerPlanningPendingConflictFlash = false;
let ownerPlanningPendingSlotKey = '';

function ownerPlanningWeekLabelText(){return weekDisplayRange();}
function ownerPlanningSlotKey(id,d,s){return `${id}|${d}|${s}`;}
function markOwnerPlanningMutation(id,d,s){
  ownerPlanningPendingConflictFlash = true;
  ownerPlanningPendingSlotKey = ownerPlanningSlotKey(id,d,s);
}

function ownerPlanningIconSvg(name){
  const svg=body=>`<svg class="btn-svg" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;
  const icons={
    check:svg('<path d="M20 6 9 17l-5-5"></path>'),
    document:svg('<path d="M8 4h7l4 4v12H8a3 3 0 0 1-3-3V7a3 3 0 0 1 3-3Z"></path><path d="M15 4v5h4"></path><path d="M9 13h6"></path><path d="M9 16h4"></path>')
  };
  return icons[name]||'';
}

function ownerPlanningShowToast(message,type='success'){
  window.RestogogoUI?.toast?.(message,{tone:type==='danger'?'danger':'success',icon:type==='danger'?'↺':'✓',centered:true,timeout:2600});
}

function ownerPlanningRefreshAll(){
  save();
  render();
}

function ownerPlanningTimeRangeForSource(source,e,d,s){
  const custom=source.assignmentTimes?.[e.id]?.[d]?.[s];
  if(custom)return custom;
  const zone=source.assignments?.[e.id]?.[d]?.[s]||suggestZone(e,s);
  const rule=zoneRules.find(r=>r.zone===zone);
  return rule?(s==='Lunch'?rule.lunch:rule.evening):(s==='Lunch'?'11:00-15:00':'17:50-23:00');
}

function ownerPlanningWeekRows(source=data, employees=activeEmployees()){
  const rows=[];
  employees.forEach(e=>days.forEach(d=>shifts.forEach(s=>{
    if(source.planning?.[e.id]?.[d]?.[s]){
      const range=ownerPlanningTimeRangeForSource(source,e,d,s);
      const h=hoursFromRange(range);
      rows.push({e,d,shift:s,h,cost:h*Number(e.rate||0),position:e.position,zone:source.assignments?.[e.id]?.[d]?.[s]||suggestZone(e,s)});
    }
  })));
  return rows;
}

function ownerPlanningSummarizeRows(rows){
  return rows.reduce((acc,r)=>{acc.hours+=r.h; acc.cost+=r.cost; return acc;},{hours:0,cost:0});
}

function ownerPlanningSnapshotRows(weekStart){
  const h=data.history?.[weekStart];
  if(!h)return [];
  return ownerPlanningWeekRows({
    planning:h.planning||{},
    assignments:h.assignments||{},
    assignmentTimes:h.assignmentTimes||{}
  });
}

function ownerPlanningCsvCell(value){return `"${String(value??'').replaceAll('"','""')}"`;}
function ownerPlanningExportFileName(part,ext='csv'){return `${slugifyWorkspace(restaurantName())}-${part}-${String(data.weekStart||todayISO()).replaceAll('-','')}.${ext}`;}
function ownerPlanningDownloadCsv(filename,headers,rows){
  const lines=[headers.map(ownerPlanningCsvCell).join(','),...rows.map(row=>row.map(ownerPlanningCsvCell).join(','))];
  const blob=new Blob(['\ufeff'+lines.join('\n')],{type:'text/csv;charset=utf-8'});
  const a=document.createElement('a');
  a.href=URL.createObjectURL(blob);
  a.download=filename;
  a.click();
  URL.revokeObjectURL(a.href);
}

function ownerPlanningRestartClass(el,className,duration=900){
  if(!el)return;
  el.classList.remove(className);
  void el.offsetWidth;
  el.classList.add(className);
  setTimeout(()=>el.classList.remove(className),duration);
}

function ownerPlanningApplyMicroFeedback(conflictCount){
  requestAnimationFrame(()=>{
    const countChanged = ownerPlanningLastConflictCount !== null && ownerPlanningLastConflictCount !== conflictCount;
    if(ownerPlanningPendingConflictFlash && countChanged){
      ownerPlanningRestartClass(document.querySelector('#ownerCalendar .owner-conflict-banner'),'is-flashing',950);
    }
    ownerPlanningLastConflictCount = conflictCount;
    if(ownerPlanningPendingSlotKey){
      const slot=[...document.querySelectorAll('#ownerCalendar .owner-slot[data-owner-slot-key]')].find(el=>el.dataset.ownerSlotKey===ownerPlanningPendingSlotKey);
      ownerPlanningRestartClass(slot,'is-updated',760);
    }
    ownerPlanningPendingConflictFlash = false;
    ownerPlanningPendingSlotKey = '';
  });
}


function renderOwnerPlanningV2Metrics(){
  if(!$('ownerPlanningV2Hours'))return;
  const rows=ownerPlanningWeekRows(data);
  const summary=ownerPlanningSummarizeRows(rows);
  const plannedShiftCount=rows.length;
  const coveredPeople=new Set(rows.map(r=>r.e.id)).size;
  const previousWeek=addDays(data.weekStart,-7);
  const previousRows=ownerPlanningSnapshotRows(previousWeek);
  const previousCost=previousRows.reduce((sum,r)=>sum+(r.cost||0),0);
  const diff=summary.cost-previousCost;
  const diffLabel=previousRows.length?`${diff>=0?'+':''}${money(diff)} vs last week`:'Projected weekly cost';
  if($('ownerPlanningV2WeekMeta'))$('ownerPlanningV2WeekMeta').textContent='Click to change';
  $('ownerPlanningV2Hours').textContent=fmtHours(summary.hours);
  $('ownerPlanningV2HoursMeta').textContent=`${plannedShiftCount} shifts · ${fmtPeople(coveredPeople)}`;
  $('ownerPlanningV2Cost').textContent=money(summary.cost);
  $('ownerPlanningV2CostMeta').textContent=diffLabel;
}

function hasAnyAvailability(employeeId){return days.some(d=>shifts.some(s=>!!data.availability?.[employeeId]?.[d]?.[s]))}
function submissionIcon(employeeId){
  const submitted=!!data.submitted?.[employeeId];
  const partial=!submitted && hasAnyAvailability(employeeId);
  const cls=submitted?'submitted':partial?'partial':'missing';
  const label=submitted?'Submitted availability':partial?'Availability started, not submitted':'No availability submitted';
  const symbol=submitted?'✓':partial?'•':'○';
  return ` <span class="submit-dot ${cls}" title="${label}">${symbol}</span>`;
}





function ownerPlanningRoleTheme(position){
  const cls=positionClass(position);
  const themes={
    'pos-maitre':{avatarA:'#14b8a6',avatarB:'#2563eb',accent:'#63e0db',bg:'rgba(18,70,76,.88)',border:'rgba(99,224,219,.30)'},
    'pos-chef':{avatarA:'#f59e0b',avatarB:'#d97706',accent:'#f2c768',bg:'rgba(84,62,26,.88)',border:'rgba(242,199,104,.30)'},
    'pos-barman':{avatarA:'#8b5cf6',avatarB:'#d62a57',accent:'#d7b7ff',bg:'rgba(65,39,82,.88)',border:'rgba(215,183,255,.30)'},
    'pos-extra':{avatarA:'#60a5fa',avatarB:'#3347ff',accent:'#96c8ff',bg:'rgba(31,55,96,.88)',border:'rgba(147,197,253,.28)'},
    'pos-other':{avatarA:'#64748b',avatarB:'#334155',accent:'#cbd5e1',bg:'rgba(39,51,68,.88)',border:'rgba(203,213,225,.22)'}
  };
  return themes[cls]||themes['pos-other'];
}
function ownerPlanningAvatarStyle(position){
  const t=ownerPlanningRoleTheme(position);
  return `--avatar-a:${t.avatarA};--avatar-b:${t.avatarB};`;
}
function ownerPlanningSlotStyle(position){
  const t=ownerPlanningRoleTheme(position);
  return `--shift-accent:${t.accent};--shift-bg:${t.bg};--shift-border:${t.border};`;
}

function ownerPlanningSlotConflict(e,d,s){
  const state=availabilityOverlayState(e.id,d,s);
  return isPlanned(e.id,d,s) && (state==='unavailable'||state==='unknown');
}
function ownerPlanningEmployeeHasAvailable(e){
  return days.some(d=>shifts.some(s=>availabilityOverlayState(e.id,d,s)==='available'));
}
function ownerPlanningEmployeeHasConflict(e){
  return days.some(d=>shifts.some(s=>ownerPlanningSlotConflict(e,d,s)));
}
function ownerPlanningConflicts(list=ownerPlanningSortedEmployees()){
  const conflicts=[];
  list.forEach(e=>days.forEach(d=>shifts.forEach(s=>{
    if(ownerPlanningSlotConflict(e,d,s)) conflicts.push({employee:e,day:d,shift:s,range:displayTimeRange(timeRangeFor(e,d,s)),zone:data.assignments[e.id]?.[d]?.[s]||suggestZone(e,s)});
  })));
  return conflicts;
}

function ownerPlanningSlotCard(e,d,s){
  const planned=isPlanned(e.id,d,s);
  const zone=data.assignments[e.id]?.[d]?.[s]||'';
  const displayZone=zone||suggestZone(e,s);
  const sw=swapFor(e.id,d,s);
  const overlayState=availabilityOverlayState(e.id,d,s);
  const conflict=ownerPlanningSlotConflict(e,d,s);
  const zoneKey=ownerPlanningSlotKey(e.id,d,s);
  const zoneOpen=ownerOpenZoneKey===zoneKey;
  const slotClasses=[
    'owner-slot',
    'owner-slot-zone',
    s==='Lunch'?'is-lunch':'is-evening',
    planned?'is-planned':'empty',
    conflict?'has-conflict':'',
    zoneOpen?'is-zone-open':'',
    data.status==='Published'?'is-published':'',
    'overlay-on',
    `overlay-${overlayState}`,
  ].filter(Boolean).join(' ');
  const cardClasses=['owner-slot-card','rs-shift-card','rs-weekly-slot',conflict?'has-conflict':''].filter(Boolean).join(' ');
  const cardStyle=ownerPlanningSlotStyle(e.position);
  const slotTitleMap={available:'Available',partial:'Partially available',unavailable:'Unavailable',unknown:'No response'};
  if(!planned){
    return `<div class="${slotClasses}" data-owner-action="toggle-slot" data-owner-slot-key="${esc(zoneKey)}" data-employee-id="${esc(e.id)}" data-day="${esc(d)}" data-shift="${esc(s)}" title="${esc(slotTitleMap[overlayState]||'Add shift')}"><span class="owner-slot-empty">+</span></div>`;
  }
  const status=sw?`<span class="owner-slot-tag ${sw.status.toLowerCase()}">${sw.status}${sw.to?': '+esc(emp(sw.to)?.name||''):' → Anyone'}</span>`:'';
  const zoneOptions=zoneRules.map(z=>`<button type="button" class="owner-zone-option rs-choice-option ${displayZone===z.zone?'is-selected':''}" data-employee-id="${esc(e.id)}" data-day="${esc(d)}" data-shift="${esc(s)}" data-zone-value="${esc(z.zone)}" title="${esc(z.zone)} · ${esc(z.role)}"><span>${esc(z.zone)}</span>${displayZone===z.zone?'<span class="owner-zone-check rs-choice-check">✓</span>':''}</button>`).join('');
  const zoneControl=`<div class="owner-slot-assignment ${zoneOpen?'is-open':''}" title="Change assignment"><button type="button" class="owner-zone-trigger" data-zone-key="${esc(zoneKey)}" data-employee-id="${esc(e.id)}" data-day="${esc(d)}" data-shift="${esc(s)}" aria-label="Change assignment" aria-expanded="${zoneOpen?'true':'false'}"><span class="owner-slot-position">${esc(displayZone)}</span></button><div class="owner-zone-menu rs-choice-menu" role="menu">${zoneOptions}</div></div>`;
  const timeControl=`<input class="owner-slot-time" value="${esc(displayTimeRange(timeRangeFor(e,d,s)))}" data-employee-id="${esc(e.id)}" data-day="${esc(d)}" data-shift="${esc(s)}" title="Custom time for this employee/day/shift">`;
  return `<div class="${slotClasses}" data-owner-action="toggle-slot" data-owner-slot-key="${esc(zoneKey)}" data-employee-id="${esc(e.id)}" data-day="${esc(d)}" data-shift="${esc(s)}" title="${esc(slotTitleMap[overlayState]||'Availability')}"><div class="${cardClasses}"${styleAttr(cardStyle)}>${timeControl}${zoneControl}${status}</div></div>`;
}


function ownerPlanningSortedEmployees(){
  return [...activeEmployees()];
}

function ownerPlanningVisibleEmployeeInfo(){
  const all=ownerPlanningSortedEmployees();
  const planned=all.filter(e=>employeePlannedWeekTotal(e)>0).length;
  const conflicts=ownerPlanningConflicts(all);
  let list=[...all];
  if(ownerPlanningView==='relevant') list=list.filter(e=>employeePlannedWeekTotal(e)>0||ownerPlanningEmployeeHasAvailable(e)||ownerPlanningEmployeeHasConflict(e));
  if(ownerPlanningView==='planned') list=list.filter(e=>employeePlannedWeekTotal(e)>0);
  if(ownerPlanningView==='available') list=list.filter(e=>ownerPlanningEmployeeHasAvailable(e));
  if(ownerPlanningView==='conflicts') list=list.filter(e=>ownerPlanningEmployeeHasConflict(e));
  const role=cleanPositionName(ownerPlanningPositionFilter||'all');
  if(role && role!=='all') list=list.filter(e=>cleanPositionName(e.position)===role);
  const q=String(ownerPlanningSearch||'').trim().toLowerCase();
  if(q) list=list.filter(e=>`${e.name||''} ${e.position||''}`.toLowerCase().includes(q));
  return {all,list,planned,total:all.length,conflicts,conflictCount:conflicts.length};
}

function ownerPlanningPositionsForFilter(all){
  return all.map(e=>cleanPositionName(e.position)).filter((p,i,a)=>p&&a.indexOf(p)===i).sort((a,b)=>positionIndex(a)-positionIndex(b)||a.localeCompare(b));
}

function ownerPlanningRefreshCalendar(){
  const el=$('ownerCalendar');
  if(el) el.innerHTML=ownerPlanningCalendar();
  renderOwnerPlanningV2Metrics();
}

function ownerPlanningSetSearch(value, caret){
  ownerPlanningSearch=String(value||'');
  ownerPlanningRefreshCalendar();
  // The calendar re-renders while filtering. Restore focus/caret so typing feels native.
  requestAnimationFrame(()=>{
    const input=document.querySelector('#ownerCalendar .rs-search-control input');
    if(!input)return;
    input.focus({preventScroll:true});
    const pos=Number.isFinite(caret)?caret:input.value.length;
    try{input.setSelectionRange(pos,pos);}catch{}
  });
}

function ownerPlanningSetFilter(kind,value){
  const safeValue=String(value||'all');
  if(kind==='employees') ownerPlanningView=safeValue;
  if(kind==='role') ownerPlanningPositionFilter=safeValue;
  ownerPlanningRefreshCalendar();
}

function ownerPlanningSelectDay(day){
  selectedOwnerPlanningDay = selectedOwnerPlanningDay===day ? '' : day;
  ownerPlanningRefreshCalendar();
}

function ownerPlanningOpenWeekPicker(event){
  if(event){
    const interactive=event.target.closest('button, input');
    if(interactive && !event.target.closest('.owner-week-field'))return;
  }
  const input=$('weekStart');
  if(!input)return;
  if(typeof input.showPicker==='function'){input.showPicker();}
  else {input.focus();input.click();}
}

function ownerPlanningRenderPublishMetric(){
  const btn=$('ownerPublishMetricBtn');
  if(!btn)return;
  const isPublished=data.status==='Published';
  const title=isPublished?'Unpublish schedule':'Publish schedule';
  btn.innerHTML=`<span class="owner-planning-metric-icon rs-icon-badge" aria-hidden="true">${isPublished?ownerPlanningIconSvg('check'):ownerPlanningIconSvg('document')}</span><span class="rs-metric-copy owner-status-copy"><span>Schedule status</span><strong>${isPublished?'Published':'Draft'}</strong><small>${isPublished?'Click to unpublish':'Click to publish'}</small></span>`;
  btn.className=`owner-planning-metric-card rs-metric-card is-status owner-publish-metric ${isPublished?'is-published':'is-draft'}`;
  btn.title=title;
  btn.setAttribute('aria-label',title);
}

function ownerPlanningTogglePublish(){
  const next=data.status==='Published'?'Draft':'Published';
  data.status=next;
  addNotification('status-'+data.weekStart+'-'+next,'yellow',next==='Published'?'Schedule published':'Schedule unpublished',next==='Published'?'The schedule is now published.':'The schedule is back in draft.',{kind:'status'});
  save();
  render();
  ownerPlanningShowToast(next==='Published'?`Planning week ${weekRangeLabel()} published`:`Planning week ${weekRangeLabel()} moved back to draft`,next==='Published'?'success':'danger');
}

function ownerPlanningToggleSlot(employeeId,d,s){
  if(data.status==='Published'){
    window.RestogogoUI?.toast?.('Move the planning back to draft before editing.',{tone:'warning',icon:'!',centered:true,timeout:2200});
    return;
  }
  const e=emp(employeeId);
  if(!e)return;
  markOwnerPlanningMutation(employeeId,d,s);
  data.planning[employeeId][d][s]=!data.planning[employeeId][d][s];
  if(data.planning[employeeId][d][s]){
    data.assignments[employeeId][d][s]=data.assignments[employeeId][d][s]||suggestZone(e,s);
    addNotification('shift-'+employeeId+d+s,'yellow','Shift added',`${e.name} was planned on ${d} ${s}.`,{kind:'employee',id:employeeId});
  }else{
    data.assignments[employeeId][d][s]='';
    data.assignmentTimes[employeeId][d][s]='';
    addNotification('shift-remove-'+employeeId+d+s,'yellow','Shift removed',`${e.name} was removed from ${d} ${s}.`,{kind:'employee',id:employeeId});
  }
  ownerPlanningRefreshAll();
}

function ownerPlanningUpdateSlotZone(employeeId,d,s,value){
  data.assignments[employeeId][d][s]=value;
  markOwnerPlanningMutation(employeeId,d,s);
  ownerPlanningRefreshAll();
}

function ownerPlanningUpdateSlotTime(employeeId,d,s,value){
  const range=normalizeTimeRangeInput(value);
  if(!range){
    window.RestogogoUI?.toast?.('Use time format HH:MM-HH:MM, for example 11:00-15:00.',{tone:'warning',icon:'!',centered:true,timeout:2600});
    render();
    return;
  }
  data.assignmentTimes[employeeId][d][s]=range;
  markOwnerPlanningMutation(employeeId,d,s);
  ownerPlanningRefreshAll();
}

function ownerPlanningSelectRow(key){
  selectedOwnerPlanningRow=selectedOwnerPlanningRow===key?'':key;
  ownerPlanningRefreshCalendar();
}

async function ownerPlanningCopyPreviousWeek(){
  const ok=await window.RestogogoUI?.confirm?.({
    title:'Copy previous week?',
    message:'Current week draft will be replaced with the previous week planning.',
    confirmText:'Copy week',
    cancelText:'Cancel',
    icon:'↺',
    tone:'neutral'
  });
  if(!ok)return;
  const h=data.history?.[addDays(data.weekStart,-7)];
  if(!h){
    await window.RestogogoUI?.alert?.({title:'No previous week saved',message:'Go to that week first or create a schedule before copying it.',confirmText:'OK',icon:'!',tone:'warning'});
    return;
  }
  data.planning=clone(h.planning||{});
  data.assignments=clone(h.assignments||{});
  data.assignmentTimes=clone(h.assignmentTimes||{});
  data.notes=clone(h.notes||{});
  data.swaps=[];
  data.status='Draft';
  ensure(data);
  ownerPlanningRefreshAll();
  window.RestogogoUI?.toast?.('Previous week copied into this draft.',{tone:'success',icon:'✓',centered:true,timeout:2200});
}

function ownerPlanningOpenMessage(){
  const lines=[`${restaurantName()} schedule`,`Week starting: ${data.weekStart}`,`Status: ${data.status}`,''];
  days.forEach(d=>{
    lines.push(`${d} ${dateForDay(d)}`);
    shifts.forEach(s=>{
      const people=activeEmployees().filter(e=>data.planning?.[e.id]?.[d]?.[s]);
      if(people.length){
        lines.push(` ${s}:`);
        people.forEach(e=>lines.push(` - ${e.name}: ${data.assignments[e.id][d][s]||suggestZone(e,s)} (${displayTimeRange(timeRangeFor(e,d,s))})`));
      }
    });
    lines.push('');
  });
  if($('messageText'))messageText.value=lines.join('\n');
  $('messageDialog')?.showModal?.();
}

function ownerPlanningExportCsv(){
  const rows=[];
  activeEmployees().forEach(e=>days.forEach(d=>shifts.forEach(s=>{
    if(data.planning?.[e.id]?.[d]?.[s])rows.push([dateForDay(d),d,s,e.name,e.position,data.assignments[e.id][d][s]||suggestZone(e,s),displayTimeRange(timeRangeFor(e,d,s)),fmtHours(plannedSlotHours(e,d,s)),money(plannedSlotHours(e,d,s)*Number(e.rate||0))]);
  })));
  ownerPlanningDownloadCsv(ownerPlanningExportFileName('planning'),['Date','Day','Shift','Employee','Position','Zone','Time','Hours','Cost'],rows);
}

function ownerPlanningChangeWeek(delta){changeWeek(delta);}
function ownerPlanningSetWeek(value){
  if(!data||!value)return;
  saveWeekSnapshot();
  data.weekStart=monday(value);
  loadWeekSnapshot();
  save();
  render();
}

function clearOwnerPlanningSelection(){
  const hasRow = typeof selectedOwnerPlanningRow!=='undefined' && !!selectedOwnerPlanningRow;
  if(!selectedOwnerPlanningDay && !hasRow)return;
  selectedOwnerPlanningDay='';
  if(typeof selectedOwnerPlanningRow!=='undefined') selectedOwnerPlanningRow='';
  if($('ownerCalendar')) ownerPlanningRefreshCalendar();
}

function closeOwnerPlanningMenus(options={}){
  const shouldRefresh=!!options.refresh;
  document.querySelectorAll('#ownerCalendar .rs-filter-menu[open], #ownerCalendar .rs-actions-menu[open]')
    .forEach(menu=>{ menu.open=false; });
  if(ownerOpenZoneKey){
    ownerOpenZoneKey='';
    if(shouldRefresh && $('ownerCalendar')) ownerPlanningRefreshCalendar();
  }
}

function ownerPlanningHandleDocumentClick(e){
  if(!document.body.classList.contains('owner-planning-mode'))return;

  const zoneOption=e.target.closest('#ownerCalendar .owner-zone-option[data-zone-value]');
  if(zoneOption){
    e.preventDefault();
    e.stopPropagation();
    const employeeId=zoneOption.dataset.employeeId;
    const day=zoneOption.dataset.day;
    const shift=zoneOption.dataset.shift;
    const value=zoneOption.dataset.zoneValue;
    ownerOpenZoneKey='';
    ownerPlanningUpdateSlotZone(employeeId,day,shift,value);
    return;
  }

  const zoneTrigger=e.target.closest('#ownerCalendar .owner-zone-trigger[data-zone-key]');
  if(zoneTrigger){
    e.preventDefault();
    e.stopPropagation();
    const key=zoneTrigger.dataset.zoneKey;
    ownerOpenZoneKey=ownerOpenZoneKey===key?'':key;
    ownerPlanningRefreshCalendar();
    return;
  }

  const filterOption=e.target.closest('#ownerCalendar .rs-filter-option[data-filter-kind][data-filter-value]');
  if(filterOption){
    e.preventDefault();
    e.stopPropagation();
    closeOwnerPlanningMenus();
    ownerPlanningSetFilter(filterOption.dataset.filterKind, filterOption.dataset.filterValue || 'all');
    return;
  }

  if(!e.target.closest('#ownerCalendar .rs-filter-menu, #ownerCalendar .rs-actions-menu')){
    const clickedZoneControl=e.target.closest('#ownerCalendar .owner-slot-assignment');
    closeOwnerPlanningMenus({refresh:ownerOpenZoneKey && !clickedZoneControl});
  }
  if(e.target.closest('#ownerCalendar'))return;
  clearOwnerPlanningSelection();
}

function ownerPlanningHandleDocumentKeydown(e){
  if(!document.body.classList.contains('owner-planning-mode'))return;
  if(e.key==='Escape') closeOwnerPlanningMenus({refresh:true});
}

function ownerPlanningFilterButton(label,value,current,kind){
  const selected=String(value)===String(current);
  return [
    `<button type="button" class="rs-filter-option ${selected?'is-selected':''}"`,
    ` data-filter-kind="${esc(kind)}" data-filter-value="${esc(value)}"`,
    ` aria-pressed="${selected?'true':'false'}">`,
    `<span>${esc(label)}</span>`,
    selected?'<span class="rs-filter-check">✓</span>':'',
    `</button>`
  ].join('');
}

function ownerPlanningSearchControl(){
  return [
    `<label class="rs-control rs-search-control" aria-label="Search employees">`,
    `<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="11" cy="11" r="6"></circle><path d="m16 16 4 4"></path></svg>`,
    `<input value="${esc(ownerPlanningSearch||'')}" placeholder="Search" data-owner-search="true">`,
    `</label>`
  ].join('');
}

function ownerPlanningFilterMenu(info){
  const positions=ownerPlanningPositionsForFilter(info.all);
  const currentRole=cleanPositionName(ownerPlanningPositionFilter||'all');
  const employeeViews=[
    ['All employees','all'],
    ['Relevant employees','relevant'],
    ['Planned only','planned'],
    ['Available only','available'],
    ['Conflicts only','conflicts']
  ];
  const employeeOptions=employeeViews.map(([label,value])=>ownerPlanningFilterButton(label,value,ownerPlanningView||'all','employees')).join('');
  const roleOptions=[ownerPlanningFilterButton('All roles','all',currentRole,'role')]
    .concat(positions.map(p=>ownerPlanningFilterButton(p,p,currentRole,'role')))
    .join('');

  return [
    `<details class="rs-filter-menu">`,
    `<summary class="rs-control-button" aria-label="Planning filters"><span>Filters</span><svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="m6 9 6 6 6-6"></path></svg></summary>`,
    `<div class="rs-filter-menu__panel">`,
    `<div class="rs-filter-group"><span class="rs-filter-label">Employees</span><div class="rs-filter-options">${employeeOptions}</div></div>`,
    `<div class="rs-filter-group"><span class="rs-filter-label">Role</span><div class="rs-filter-options">${roleOptions}</div></div>`,
    `</div>`,
    `</details>`
  ].join('');
}


function ownerPlanningActionsMenu(){
  const actions=[
    ['copy-previous-week','Copy previous week'],
    ['export-pdf','Export PDF'],
    ['export-csv','Export CSV'],
    ['open-message','Send via WhatsApp']
  ].map(([action,label])=>`<button type="button" data-owner-action="${action}">${label}</button>`).join('');

  return [
    `<details class="rs-actions-menu">`,
    `<summary class="rs-control-button rs-icon-button" aria-label="Planning actions" title="Planning actions"><svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="12" cy="12" r="1.8"></circle><circle cx="19" cy="12" r="1.8"></circle><circle cx="5" cy="12" r="1.8"></circle></svg></summary>`,
    `<div class="rs-actions-menu__panel">${actions}</div>`,
    `</details>`
  ].join('');
}

function ownerPlanningGridToolbar(info){
  return [
    `<section class="owner-grid-toolbar rs-grid-toolbar" aria-label="Planning calendar controls">`,
    `<div class="rs-grid-toolbar__title"><strong>Employees</strong><span>${info.planned} planned / ${info.total} total</span></div>`,
    `<div class="rs-grid-toolbar__controls">`,
    ownerPlanningSearchControl(),
    ownerPlanningFilterMenu(info),
    ownerPlanningActionsMenu(),
    `</div>`,
    `</section>`
  ].join('');
}

function ownerPlanningConflictBanner(info){
  if(!info.conflictCount)return '';
  return `<section class="owner-conflict-banner" role="status"><strong>${info.conflictCount} conflict${info.conflictCount===1?'':'s'} found</strong><span>Some shifts are outside availability.</span></section>`;
}


function ownerPlanningDayCellClass(e,d,di){
  return ['owner-day-cell','rs-weekly-day-cell',di%2?'day-alt':'day-base'].join(' ');
}

function ownerPlanningDayTotals(list){
  const dayTotals={};
  const dayPeople={};
  days.forEach(d=>{dayTotals[d]=0; dayPeople[d]=new Set();});
  list.forEach(e=>days.forEach(d=>shifts.forEach(sh=>{
    const h=plannedSlotHours(e,d,sh);
    dayTotals[d]+=h;
    if(h)dayPeople[d].add(e.id);
  })));
  return {dayTotals,dayPeople,grand:days.reduce((sum,d)=>sum+dayTotals[d],0)};
}

function ownerPlanningColgroup(){
  return `<colgroup><col class="owner-person-col rs-weekly-person-col">${days.map(()=>'<col class="owner-day-col rs-weekly-day-col">').join('')}<col class="owner-total-col rs-weekly-total-col"></colgroup>`;
}

function ownerPlanningDayHeader(d,di,totals){
  const selected=selectedOwnerPlanningDay===d?'col-selected':'';
  return [
    `<th class="day-group rs-weekly-day-head ${di%2?'day-alt':'day-base'} ${selected}" data-owner-action="select-day" data-day="${esc(d)}" title="Select ${d}" tabindex="0" role="button">`,
    `<div class="owner-day-head rs-weekly-day-head-copy"><strong>${d.slice(0,3)}</strong><span>${dateForDay(d)}</span><small>${fmtHours(totals.dayTotals[d])} · ${fmtPeople(totals.dayPeople[d].size)}</small></div>`,
    `</th>`
  ].join('');
}

function ownerPlanningTableHead(totals){
  return [
    `<thead><tr><th class="person rs-weekly-person-head">Employee</th>`,
    days.map((d,di)=>ownerPlanningDayHeader(d,di,totals)).join(''),
    `<th class="total rs-weekly-total-head"><div class="owner-total-head rs-weekly-total-head-copy"><span>Week</span><strong>${fmtHours(totals.grand)}</strong></div></th>`,
    `</tr></thead>`
  ].join('');
}

function ownerPlanningPersonCell(e,rowKey){
  return [
    `<td class="person owner-person rs-weekly-person-cell" data-owner-action="select-row" data-rowkey="${esc(rowKey)}" title="Select ${esc(e.name)}" tabindex="0" role="button">`,
    `<div class="owner-person-card rs-weekly-person-card">`,
    `<span class="owner-person-avatar rs-weekly-avatar"${styleAttr(ownerPlanningAvatarStyle(e.position))}>${esc(employeeInitials(e.name))}</span>`,
    `<span class="owner-person-copy rs-weekly-person-copy"><strong>${submissionIcon(e.id)}${esc(e.name)}</strong><small>${esc(e.position)}</small></span>`,
    `</div>`,
    `</td>`
  ].join('');
}

function ownerPlanningEmployeeDayCell(e,d,di){
  const selected=selectedOwnerPlanningDay===d?'col-selected':'';
  return `<td class="${ownerPlanningDayCellClass(e,d,di)} ${selected}"><div class="owner-day-slots rs-weekly-day-slots">${shifts.map(sh=>ownerPlanningSlotCard(e,d,sh)).join('')}</div></td>`;
}

function ownerPlanningEmployeeRow(e){
  const rowKey='emp:'+e.id;
  const selected=selectedOwnerPlanningRow===rowKey?'row-selected':'';
  const cells=days.map((d,di)=>ownerPlanningEmployeeDayCell(e,d,di)).join('');
  return `<tr class="calendar-row ${selected}" data-rowkey="${esc(rowKey)}">${ownerPlanningPersonCell(e,rowKey)}${cells}<td class="total total-cell rs-weekly-total-cell"><div class="owner-total-value rs-weekly-total-value"><strong>${fmtHours(employeePlannedWeekTotal(e))}</strong></div></td></tr>`;
}

function ownerPlanningEmptyRow(){
  return '<tr class="owner-empty-row"><td colspan="9"><div class="owner-empty-state"><strong>No employees match this view.</strong><span>Switch to Relevant or All employees, or clear filters.</span></div></td></tr>';
}

function ownerPlanningCalendar(){
  const info=ownerPlanningVisibleEmployeeInfo();
  ownerPlanningApplyMicroFeedback(info.conflictCount);
  const list=info.list;
  const totals=ownerPlanningDayTotals(list);
  const rows=list.map(ownerPlanningEmployeeRow).join('') || ownerPlanningEmptyRow();
  return `${ownerPlanningGridToolbar(info)}${ownerPlanningConflictBanner(info)}<div class="owner-calendar-scroll rs-weekly-scroll"><table class="cal-table owner-calendar-table rs-weekly-table">${ownerPlanningColgroup()}${ownerPlanningTableHead(totals)}<tbody>${rows}</tbody></table></div>`;
}

function ownerPlanningHandleCalendarAction(target,event){
  event?.preventDefault?.();
  event?.stopPropagation?.();
  const action=target.dataset.ownerAction;
  if(action==='toggle-slot')return ownerPlanningToggleSlot(target.dataset.employeeId,target.dataset.day,target.dataset.shift);
  if(action==='select-day')return ownerPlanningSelectDay(target.dataset.day);
  if(action==='select-row')return ownerPlanningSelectRow(target.dataset.rowkey);
  if(action==='copy-previous-week')return ownerPlanningCopyPreviousWeek();
  if(action==='export-pdf')return window.print();
  if(action==='export-csv')return ownerPlanningExportCsv();
  if(action==='open-message')return ownerPlanningOpenMessage();
}

function ownerPlanningRender(){
  ownerPlanningRenderPublishMetric();
  if($('ownerWeekLabel'))ownerWeekLabel.textContent=ownerPlanningWeekLabelText();
  if($('weekStart'))weekStart.value=data.weekStart;
  const el=$('ownerCalendar');
  if(el)el.innerHTML=ownerPlanningCalendar();
  renderOwnerPlanningV2Metrics();
}

let ownerPlanningBound = false;
function ownerPlanningBind(){
  if(ownerPlanningBound)return;
  ownerPlanningBound = true;
  const on=(idValue,event,handler)=>{$(idValue)?.addEventListener(event,handler);};
  on('prevWeek','click',event=>{event.stopPropagation();ownerPlanningChangeWeek(-7);});
  on('nextWeek','click',event=>{event.stopPropagation();ownerPlanningChangeWeek(7);});
  on('weekStart','click',event=>event.stopPropagation());
  on('weekStart','change',()=>ownerPlanningSetWeek($('weekStart')?.value));
  on('ownerWeekMetric','click',event=>ownerPlanningOpenWeekPicker(event));
  on('ownerWeekMetric','keydown',event=>{
    if(event.key==='Enter'||event.key===' '){event.preventDefault();ownerPlanningOpenWeekPicker(event);}
  });
  on('ownerPublishMetricBtn','click',ownerPlanningTogglePublish);
  on('copyMessage','click',()=>navigator.clipboard?.writeText?.($('messageText')?.value||'').then(()=>window.RestogogoUI?.toast?.('Schedule message copied.',{tone:'success',icon:'✓',centered:false,timeout:1800})));
  on('closeMessage','click',()=>$('messageDialog')?.close?.());

  const calendar=$('ownerCalendar');
  calendar?.addEventListener('input',event=>{
    const input=event.target.closest('[data-owner-search]');
    if(input&&calendar.contains(input))ownerPlanningSetSearch(input.value,input.selectionStart);
  });
  calendar?.addEventListener('keydown',event=>{
    if(event.target.closest('[data-owner-search]') && event.key==='Enter'){event.preventDefault();event.target.blur();return;}
    const actionTarget=event.target.closest('[data-owner-action]');
    if(actionTarget&&calendar.contains(actionTarget)&&(event.key==='Enter'||event.key===' ')){
      event.preventDefault();
      ownerPlanningHandleCalendarAction(actionTarget,event);
    }
  });
  calendar?.addEventListener('change',event=>{
    const input=event.target.closest('.owner-slot-time[data-employee-id]');
    if(!input||!calendar.contains(input))return;
    ownerPlanningUpdateSlotTime(input.dataset.employeeId,input.dataset.day,input.dataset.shift,input.value);
  });
  calendar?.addEventListener('click',event=>{
    if(event.target.closest('.owner-slot-time,.owner-slot-assignment'))return;
    const actionTarget=event.target.closest('[data-owner-action]');
    if(actionTarget&&calendar.contains(actionTarget))ownerPlanningHandleCalendarAction(actionTarget,event);
  });
  document.addEventListener('click', ownerPlanningHandleDocumentClick, true);
  document.addEventListener('keydown', ownerPlanningHandleDocumentKeydown);
}

function ownerPlanningInit(){}

window.OwnerPlanning={
  init: ownerPlanningInit,
  bind: ownerPlanningBind,
  render: ownerPlanningRender,
  conflicts: ownerPlanningConflicts,
  toggleSlot: ownerPlanningToggleSlot
};

