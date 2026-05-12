(function(){
  const PlanningLogic = Restogogo.logic.planning;
  const Grid = Restogogo.services.weeklyGrid;
  const Export = Restogogo.export;
  const Metrics = Restogogo.services.metrics;

let selectedPlanningDay = '';
let selectedPlanningRow = '';
let planningOpenZoneKey = '';
let planningSearch = '';
let planningPositionFilter = 'all';
let planningView = 'all';
let planningLastConflictCount = null;
let planningPendingConflictFlash = false;
let planningPendingSlotKey = '';

function planningSlotKey(id,d,s){return `${id}|${d}|${s}`;}
function markPlanningMutation(id,d,s){
  planningPendingConflictFlash = true;
  planningPendingSlotKey = planningSlotKey(id,d,s);
}


function planningShowToast(message,type='success'){
  Restogogo.ui?.toast?.(message,{tone:type==='danger'?'danger':'success',icon:type==='danger'?'↺':'✓',centered:true,timeout:2600});
}

function planningRefreshAll(){
  void save({reason:'planning-refresh'});
  render();
}

function planningSnapshotRows(weekStart){
  const h=data.history?.[weekStart];
  if(!h)return [];
  return PlanningLogic.weekRows({
    planning:h.planning||{},
    assignments:h.assignments||{},
    assignmentTimes:h.assignmentTimes||{}
  });
}

function planningRestartClass(el,className,duration=900){
  if(!el)return;
  el.classList.remove(className);
  void el.offsetWidth;
  el.classList.add(className);
  setTimeout(()=>el.classList.remove(className),duration);
}

function planningApplyMicroFeedback(conflictCount){
  requestAnimationFrame(()=>{
    const countChanged = planningLastConflictCount !== null && planningLastConflictCount !== conflictCount;
    if(planningPendingConflictFlash && countChanged){
      planningRestartClass(document.querySelector('.planning-board .planning-conflict-banner'),'is-flashing',950);
    }
    planningLastConflictCount = conflictCount;
    if(planningPendingSlotKey){
      const slot=[...document.querySelectorAll('.planning-board .planning-slot[data-planning-slot-key]')].find(el=>el.dataset.planningSlotKey===planningPendingSlotKey);
      planningRestartClass(slot,'is-updated',760);
    }
    planningPendingConflictFlash = false;
    planningPendingSlotKey = '';
  });
}


function renderPlanningMetrics(){
  const root=$('planningMetrics');
  if(!root)return;
  const rows=PlanningLogic.weekRows(data);
  const summary=PlanningLogic.summarizeRows(rows);
  const plannedShiftCount=rows.length;
  const coveredPeople=new Set(rows.map(r=>r.e.id)).size;
  const previousWeek=addDays(data.weekStart,-7);
  const previousRows=planningSnapshotRows(previousWeek);
  const previousCost=previousRows.reduce((sum,r)=>sum+(r.cost||0),0);
  const diff=summary.cost-previousCost;
  const diffLabel=previousRows.length?`${diff>=0?'+':''}${money(diff)} vs last week`:'Projected weekly cost';
  const isPublished=data.status==='Published';
  const publishLabel=isPublished?'Unpublish schedule':'Publish schedule';

  root.innerHTML=[
    Metrics.card({
      tag:'button',
      id:'planningPublishMetricBtn',
      className:`planning-publish-metric ${isPublished?'is-published':'is-draft'}`,
      tone:'status',
      icon:isPublished?'check':'document',
      label:'Schedule status',
      value:isPublished?'Published':'Draft',
      meta:isPublished?'Click to unpublish':'Click to publish',
      ariaLabel:publishLabel,
      attrs:{type:'button',title:publishLabel}
    }),
    Metrics.week({
      id:'planningWeekMetric',
      ariaLabel:'Change planning week',
      prevId:'prevWeek',
      nextId:'nextWeek',
      inputId:'weekStart',
      inputAriaLabel:'Select planning week',
      valueId:'planningWeekLabel',
      metaId:'planningWeekMeta',
      value:weekDisplayRange(),
      meta:'Click to change',
      inputValue:data.weekStart
    }),
    Metrics.card({tone:'hours',icon:'clock',label:'Planned hours',value:fmtHours(summary.hours),meta:`${plannedShiftCount} shifts · ${fmtPeople(coveredPeople)}`}),
    Metrics.card({tone:'cost',icon:'euro',label:'Cost impact',value:money(summary.cost),meta:diffLabel})
  ].join('');
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





function planningRoleTheme(position){
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
function planningAvatarStyle(position){
  const t=planningRoleTheme(position);
  return `--avatar-a:${t.avatarA};--avatar-b:${t.avatarB};`;
}
function planningSlotStyle(position){
  const t=planningRoleTheme(position);
  return `--shift-accent:${t.accent};--shift-bg:${t.bg};--shift-border:${t.border};`;
}

function planningSlotConflict(e,d,s){
  const state=availabilityOverlayState(e.id,d,s);
  return isPlanned(e.id,d,s) && (state==='unavailable'||state==='unknown');
}
function planningEmployeeHasAvailable(e){
  return days.some(d=>shifts.some(s=>availabilityOverlayState(e.id,d,s)==='available'));
}
function planningEmployeeHasConflict(e){
  return days.some(d=>shifts.some(s=>planningSlotConflict(e,d,s)));
}
function planningConflicts(list=planningSortedEmployees()){
  const conflicts=[];
  list.forEach(e=>days.forEach(d=>shifts.forEach(s=>{
    if(planningSlotConflict(e,d,s)) conflicts.push({employee:e,day:d,shift:s,range:displayTimeRange(timeRangeFor(e,d,s)),zone:data.assignments[e.id]?.[d]?.[s]||suggestZone(e,s)});
  })));
  return conflicts;
}

function planningSlotCard(e,d,s){
  const planned=isPlanned(e.id,d,s);
  const zone=data.assignments[e.id]?.[d]?.[s]||'';
  const displayZone=zone||suggestZone(e,s);
  const overlayState=availabilityOverlayState(e.id,d,s);
  const conflict=planningSlotConflict(e,d,s);
  const zoneKey=planningSlotKey(e.id,d,s);
  const zoneOpen=planningOpenZoneKey===zoneKey;
  const slotClasses=[
    'planning-slot',
    'planning-slot-zone',
    s==='Lunch'?'is-lunch':'is-evening',
    planned?'is-planned':'empty',
    conflict?'has-conflict':'',
    zoneOpen?'is-zone-open':'',
    data.status==='Published'?'is-published':'',
    'overlay-on',
    `overlay-${overlayState}`,
  ].filter(Boolean).join(' ');
  const cardClasses=['planning-slot-card','rs-shift-card','rs-weekly-slot',conflict?'has-conflict':''].filter(Boolean).join(' ');
  const cardStyle=planningSlotStyle(e.position);
  const slotTitleMap={available:'Available',partial:'Partially available',unavailable:'Unavailable',unknown:'No response'};
  if(!planned){
    return `<div class="${slotClasses}" data-planning-action="toggle-slot" data-planning-slot-key="${esc(zoneKey)}" data-employee-id="${esc(e.id)}" data-day="${esc(d)}" data-shift="${esc(s)}" title="${esc(slotTitleMap[overlayState]||'Add shift')}"><span class="planning-slot-empty">+</span></div>`;
  }
  const zoneOptions=activeRestaurantZones(s).map(z=>`<button type="button" class="planning-zone-option rs-choice-option ${displayZone===z.name?'is-selected':''}" data-employee-id="${esc(e.id)}" data-day="${esc(d)}" data-shift="${esc(s)}" data-zone-value="${esc(z.name)}" title="${esc(z.name)} · ${esc((z.defaultPositions||[]).join(', ') || 'Any position')}"><span>${esc(z.name)}</span>${displayZone===z.name?'<span class="planning-zone-check rs-choice-check">✓</span>':''}</button>`).join('');
  const zoneControl=`<div class="planning-slot-assignment ${zoneOpen?'is-open':''}" title="Change assignment"><button type="button" class="planning-zone-trigger" data-zone-key="${esc(zoneKey)}" data-employee-id="${esc(e.id)}" data-day="${esc(d)}" data-shift="${esc(s)}" aria-label="Change assignment" aria-expanded="${zoneOpen?'true':'false'}"><span class="planning-slot-position">${esc(displayZone)}</span></button><div class="planning-zone-menu rs-choice-menu" role="menu">${zoneOptions}</div></div>`;
  const timeControl=`<input class="planning-slot-time" value="${esc(displayTimeRange(timeRangeFor(e,d,s)))}" data-employee-id="${esc(e.id)}" data-day="${esc(d)}" data-shift="${esc(s)}" title="Custom time for this employee/day/shift">`;
  return `<div class="${slotClasses}" data-planning-action="toggle-slot" data-planning-slot-key="${esc(zoneKey)}" data-employee-id="${esc(e.id)}" data-day="${esc(d)}" data-shift="${esc(s)}" title="${esc(slotTitleMap[overlayState]||'Availability')}"><div class="${cardClasses}"${styleAttr(cardStyle)}>${timeControl}${zoneControl}</div></div>`;
}


function planningSortedEmployees(){
  return [...activeEmployees()];
}

function planningVisibleEmployeeInfo(){
  const all=planningSortedEmployees();
  const planned=all.filter(e=>employeePlannedWeekTotal(e)>0).length;
  const conflicts=planningConflicts(all);
  let list=[...all];
  if(planningView==='relevant') list=list.filter(e=>employeePlannedWeekTotal(e)>0||planningEmployeeHasAvailable(e)||planningEmployeeHasConflict(e));
  if(planningView==='planned') list=list.filter(e=>employeePlannedWeekTotal(e)>0);
  if(planningView==='available') list=list.filter(e=>planningEmployeeHasAvailable(e));
  if(planningView==='conflicts') list=list.filter(e=>planningEmployeeHasConflict(e));
  const role=cleanPositionName(planningPositionFilter||'all');
  if(role && role!=='all') list=list.filter(e=>cleanPositionName(e.position)===role);
  const q=String(planningSearch||'').trim().toLowerCase();
  if(q) list=list.filter(e=>`${e.name||''} ${e.position||''}`.toLowerCase().includes(q));
  return {all,list,planned,total:all.length,conflicts,conflictCount:conflicts.length};
}

function planningPositionsForFilter(all){
  return all.map(e=>cleanPositionName(e.position)).filter((p,i,a)=>p&&a.indexOf(p)===i).sort((a,b)=>positionIndex(a)-positionIndex(b)||a.localeCompare(b));
}

function planningRefreshCalendar(){
  const el=$('planningBoard');
  if(el) el.innerHTML=planningCalendar();
  renderPlanningMetrics();
}

function planningSetSearch(value, caret){
  planningSearch=String(value||'');
  planningRefreshCalendar();
  // The calendar re-renders while filtering. Restore focus/caret so typing feels native.
  requestAnimationFrame(()=>{
    const input=document.querySelector('.planning-board .rs-search-control input');
    if(!input)return;
    input.focus({preventScroll:true});
    const pos=Number.isFinite(caret)?caret:input.value.length;
    try{input.setSelectionRange(pos,pos);}catch{}
  });
}

function planningSetFilter(kind,value){
  const safeValue=String(value||'all');
  if(kind==='employees') planningView=safeValue;
  if(kind==='role') planningPositionFilter=safeValue;
  planningRefreshCalendar();
}

function planningSelectDay(day){
  selectedPlanningDay = selectedPlanningDay===day ? '' : day;
  planningRefreshCalendar();
}

function planningOpenWeekPicker(event){
  if(event){
    const interactive=event.target.closest('button, input');
    if(interactive && !event.target.closest('.rs-week-field'))return;
  }
  const input=$('weekStart');
  if(!input)return;
  if(typeof input.showPicker==='function'){input.showPicker();}
  else {input.focus();input.click();}
}


function planningTogglePublish(){
  const next=data.status==='Published'?'Draft':'Published';
  data.status=next;
  addNotification('status-'+data.weekStart+'-'+next,'yellow',next==='Published'?'Schedule published':'Schedule unpublished',next==='Published'?'The schedule is now published.':'The schedule is back in draft.',{kind:'status'});
  void save({reason:'planning-status'});
  render();
  planningShowToast(next==='Published'?`Planning week ${weekRangeLabel()} published`:`Planning week ${weekRangeLabel()} moved back to draft`,next==='Published'?'success':'danger');
}

function planningToggleSlot(employeeId,d,s){
  if(data.status==='Published'){
    Restogogo.ui?.toast?.('Move the planning back to draft before editing.',{tone:'warning',icon:'!',centered:true,timeout:2200});
    return;
  }
  const e=emp(employeeId);
  if(!e)return;
  markPlanningMutation(employeeId,d,s);
  const next=!isPlanned(employeeId,d,s);
  setPlanningSlot(employeeId,d,s,next);
  if(next){
    if(!data.assignments?.[employeeId]?.[d]?.[s])setAssignmentSlot(employeeId,d,s,suggestZone(e,s));
    addNotification('shift-'+employeeId+d+s,'yellow','Shift added',`${e.name} was planned on ${d} ${s}.`,{kind:'employee',id:employeeId});
  }else{
    setAssignmentSlot(employeeId,d,s,'');
    setAssignmentTimeSlot(employeeId,d,s,'');
    addNotification('shift-remove-'+employeeId+d+s,'yellow','Shift removed',`${e.name} was removed from ${d} ${s}.`,{kind:'employee',id:employeeId});
  }
  planningRefreshAll();
}

function planningUpdateSlotZone(employeeId,d,s,value){
  setAssignmentSlot(employeeId,d,s,value);
  markPlanningMutation(employeeId,d,s);
  planningRefreshAll();
}

function planningUpdateSlotTime(employeeId,d,s,value){
  const range=normalizeTimeRangeInput(value);
  if(!range){
    Restogogo.ui?.toast?.('Use time format HH:MM-HH:MM, for example 11:00-15:00.',{tone:'warning',icon:'!',centered:true,timeout:2600});
    render();
    return;
  }
  setAssignmentTimeSlot(employeeId,d,s,range);
  markPlanningMutation(employeeId,d,s);
  planningRefreshAll();
}

function planningSelectRow(key){
  selectedPlanningRow=selectedPlanningRow===key?'':key;
  planningRefreshCalendar();
}

async function planningCopyPreviousWeek(){
  const ok=await Restogogo.ui?.confirm?.({
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
    await Restogogo.ui?.alert?.({title:'No previous week saved',message:'Go to that week first or create a schedule before copying it.',confirmText:'OK',icon:'!',tone:'warning'});
    return;
  }
  data.planning=compactWeeklyPayload({planning:h.planning||{}}).planning;
  data.assignments=compactWeeklyPayload({assignments:h.assignments||{}}).assignments;
  data.assignmentTimes=compactWeeklyPayload({assignmentTimes:h.assignmentTimes||{}}).assignmentTimes;
  data.notes=compactWeeklyPayload({notes:h.notes||{}}).notes;
  data.status='Draft';
  ensure(data);
  planningRefreshAll();
  Restogogo.ui?.toast?.('Previous week copied into this draft.',{tone:'success',icon:'✓',centered:true,timeout:2200});
}

function planningExportCsv(){
  const rows=[];
  activeEmployees().forEach(e=>days.forEach(d=>shifts.forEach(s=>{
    if(data.planning?.[e.id]?.[d]?.[s])rows.push([dateForDay(d),d,s,e.name,e.position,data.assignments?.[e.id]?.[d]?.[s]||suggestZone(e,s),displayTimeRange(timeRangeFor(e,d,s)),fmtHours(plannedSlotHours(e,d,s)),money(plannedSlotHours(e,d,s)*Number(e.rate||0))]);
  })));
  Export.downloadCsv(Export.fileName('planning','csv',data.weekStart),['Date','Day','Shift','Employee','Position','Zone','Time','Hours','Cost'],rows);
}

function planningChangeWeek(delta){changeWeek(delta);}
function planningSetWeek(value){
  if(!data||!value)return;
  setWeekStartAndLoad(value);
  void save({reason:'planning-week-change'});
  render();
}

function clearPlanningSelection(){
  const hasRow = typeof selectedPlanningRow!=='undefined' && !!selectedPlanningRow;
  if(!selectedPlanningDay && !hasRow)return;
  selectedPlanningDay='';
  if(typeof selectedPlanningRow!=='undefined') selectedPlanningRow='';
  if($('planningBoard')) planningRefreshCalendar();
}

function closePlanningMenus(options={}){
  const shouldRefresh=!!options.refresh;
  document.querySelectorAll('.planning-board .rs-filter-menu[open], .planning-board .rs-actions-menu[open]')
    .forEach(menu=>{ menu.open=false; });
  if(planningOpenZoneKey){
    planningOpenZoneKey='';
    if(shouldRefresh && $('planningBoard')) planningRefreshCalendar();
  }
}

function planningHandleDocumentClick(e){
  if(!document.body.classList.contains('planning-mode'))return;

  const zoneOption=e.target.closest('.planning-board .planning-zone-option[data-zone-value]');
  if(zoneOption){
    e.preventDefault();
    e.stopPropagation();
    const employeeId=zoneOption.dataset.employeeId;
    const day=zoneOption.dataset.day;
    const shift=zoneOption.dataset.shift;
    const value=zoneOption.dataset.zoneValue;
    planningOpenZoneKey='';
    planningUpdateSlotZone(employeeId,day,shift,value);
    return;
  }

  const zoneTrigger=e.target.closest('.planning-board .planning-zone-trigger[data-zone-key]');
  if(zoneTrigger){
    e.preventDefault();
    e.stopPropagation();
    const key=zoneTrigger.dataset.zoneKey;
    planningOpenZoneKey=planningOpenZoneKey===key?'':key;
    planningRefreshCalendar();
    return;
  }

  const filterOption=e.target.closest('.planning-board .rs-filter-option[data-filter-kind][data-filter-value]');
  if(filterOption){
    e.preventDefault();
    e.stopPropagation();
    closePlanningMenus();
    planningSetFilter(filterOption.dataset.filterKind, filterOption.dataset.filterValue || 'all');
    return;
  }

  if(!e.target.closest('.planning-board .rs-filter-menu, .planning-board .rs-actions-menu')){
    const clickedZoneControl=e.target.closest('.planning-board .planning-slot-assignment');
    closePlanningMenus({refresh:planningOpenZoneKey && !clickedZoneControl});
  }
  if(e.target.closest('.planning-board'))return;
  clearPlanningSelection();
}

function planningHandleDocumentKeydown(e){
  if(!document.body.classList.contains('planning-mode'))return;
  if(e.key==='Escape') closePlanningMenus({refresh:true});
}

function planningFilterButton(label,value,current,kind){
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

function planningSearchControl(){
  return [
    `<label class="rs-control rs-search-control" aria-label="Search employees">`,
    `<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="11" cy="11" r="6"></circle><path d="m16 16 4 4"></path></svg>`,
    `<input value="${esc(planningSearch||'')}" placeholder="Search" data-planning-search="true">`,
    `</label>`
  ].join('');
}

function planningFilterMenu(info){
  const positions=planningPositionsForFilter(info.all);
  const currentRole=cleanPositionName(planningPositionFilter||'all');
  const employeeViews=[
    ['All employees','all'],
    ['Relevant employees','relevant'],
    ['Planned only','planned'],
    ['Available only','available'],
    ['Conflicts only','conflicts']
  ];
  const employeeOptions=employeeViews.map(([label,value])=>planningFilterButton(label,value,planningView||'all','employees')).join('');
  const roleOptions=[planningFilterButton('All roles','all',currentRole,'role')]
    .concat(positions.map(p=>planningFilterButton(p,p,currentRole,'role')))
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


function planningActionsMenu(){
  const actions=[
    ['copy-previous-week','Copy previous week'],
    ['print','Print view'],
    ['export-csv','Export CSV']
  ].map(([action,label])=>`<button type="button" data-planning-action="${action}">${label}</button>`).join('');

  return [
    `<details class="rs-actions-menu">`,
    `<summary class="rs-control-button rs-icon-button" aria-label="Planning actions" title="Planning actions"><svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="12" cy="12" r="1.8"></circle><circle cx="19" cy="12" r="1.8"></circle><circle cx="5" cy="12" r="1.8"></circle></svg></summary>`,
    `<div class="rs-actions-menu__panel">${actions}</div>`,
    `</details>`
  ].join('');
}

function planningGridToolbar(info){
  return [
    `<section class="planning-grid-toolbar rs-grid-toolbar" aria-label="Planning calendar controls">`,
    `<div class="rs-grid-toolbar__title"><strong>Employees</strong><span>${info.planned} planned / ${info.total} total</span></div>`,
    `<div class="rs-grid-toolbar__controls">`,
    planningSearchControl(),
    planningFilterMenu(info),
    planningActionsMenu(),
    `</div>`,
    `</section>`
  ].join('');
}

function planningConflictBanner(info){
  if(!info.conflictCount)return '';
  return `<section class="planning-conflict-banner" role="status"><strong>${info.conflictCount} conflict${info.conflictCount===1?'':'s'} found</strong><span>Some shifts are outside availability.</span></section>`;
}


function planningDayHeader(d,di,totals){
  const selected=selectedPlanningDay===d?'col-selected':'';
  return Grid.dayHeader({
    moduleName:'planning',
    day:d,
    index:di,
    totals,
    headClass:'day-group',
    extraClass:selected,
    attributes:{
      'data-planning-action':'select-day',
      'data-day':d,
      title:`Select ${d}`,
      tabindex:'0',
      role:'button'
    }
  });
}

function planningTableHead(totals){
  return Grid.tableHead({
    moduleName:'planning',
    totals,
    dayHeaderRenderer:planningDayHeader,
    totalHeadHtml:`<div class="rs-weekly-total-head-copy"><span>WEEK</span><strong>${esc(fmtHours(totals.grand))}</strong></div>`
  });
}

function planningPersonCell(e,rowKey){
  return Grid.personCell({
    moduleName:'planning',
    employee:e,
    tag:'td',
    avatarStyle:planningAvatarStyle(e.position),
    leadingHtml:submissionIcon(e.id),
    attributes:{
      'data-planning-action':'select-row',
      'data-rowkey':rowKey,
      title:`Select ${e.name}`,
      tabindex:'0',
      role:'button'
    }
  });
}

function planningEmployeeDayCell(e,d,di){
  const selected=selectedPlanningDay===d?'col-selected':'';
  return Grid.dayCell({
    moduleName:'planning',
    day:d,
    index:di,
    extraClass:selected,
    content:shifts.map(sh=>planningSlotCard(e,d,sh)).join('')
  });
}

function planningEmployeeRow(e){
  const rowKey='emp:'+e.id;
  const selected=selectedPlanningRow===rowKey?'row-selected':'';
  return Grid.row({
    moduleName:'planning',
    employee:e,
    rowClass:selected,
    rowAttributes:{'data-rowkey':rowKey},
    personCellHtml:planningPersonCell(e,rowKey),
    dayCellRenderer:(d,di)=>planningEmployeeDayCell(e,d,di),
    totalCellHtml:Grid.totalCell({
      moduleName:'planning',
      content:`<strong>${esc(fmtHours(PlanningLogic.employeeWeekTotal(e)))}</strong>`
    })
  });
}

function planningEmptyRow(){
  return Grid.emptyRow({
    className:'planning-empty-row',
    content:'<div class="planning-empty-state rs-empty-state"><span class="rs-empty-state__icon">•</span><strong>No employees match this view.</strong><span>Switch to Relevant or All employees, or clear filters.</span><span class="rs-empty-state__actions"><button type="button" class="rs-empty-state__action" data-planning-action="clear-filters">Clear filters</button></span></div>'
  });
}

function planningCalendar(){
  const info=planningVisibleEmployeeInfo();
  planningApplyMicroFeedback(info.conflictCount);
  const list=info.list;
  const totals=PlanningLogic.dayTotals(list);
  const rows=list.map(planningEmployeeRow).join('') || planningEmptyRow();
  return `${planningGridToolbar(info)}${planningConflictBanner(info)}<div class="rs-weekly-scroll"><table class="rs-weekly-table">${Grid.colgroup('planning')}${planningTableHead(totals)}<tbody>${rows}</tbody></table></div>`;
}

function planningHandleCalendarAction(target,event){
  event?.preventDefault?.();
  event?.stopPropagation?.();
  const setupNav=target.dataset.setupNav;
  if(setupNav){Restogogo.router?.showPage?.(setupNav); return;}
  const action=target.dataset.planningAction;
  if(action==='clear-filters'){
    planningSearch='';
    planningView='all';
    planningPositionFilter='all';
    selectedPlanningDay='';
    selectedPlanningRow='';
    planningRefreshCalendar();
    return;
  }
  if(action==='toggle-slot')return planningToggleSlot(target.dataset.employeeId,target.dataset.day,target.dataset.shift);
  if(action==='select-day')return planningSelectDay(target.dataset.day);
  if(action==='select-row')return planningSelectRow(target.dataset.rowkey);
  if(action==='copy-previous-week')return planningCopyPreviousWeek();
  if(action==='print')return window.print();
  if(action==='export-csv')return planningExportCsv();
}

function planningRender(){
  renderPlanningMetrics();
  const el=$('planningBoard');
  if(el)el.innerHTML=planningCalendar();
}

let planningBound = false;
function planningBind(){
  if(planningBound)return;
  planningBound = true;

  const page=$('page-planning');
  page?.addEventListener('click',event=>{
    if(event.target.closest('#prevWeek')){event.preventDefault();event.stopPropagation();planningChangeWeek(-7);return;}
    if(event.target.closest('#nextWeek')){event.preventDefault();event.stopPropagation();planningChangeWeek(7);return;}
    if(event.target.closest('#planningPublishMetricBtn')){event.preventDefault();planningTogglePublish();return;}
    if(event.target.closest('#planningWeekMetric'))planningOpenWeekPicker(event);
  });
  page?.addEventListener('change',event=>{
    if(event.target?.id==='weekStart')planningSetWeek(event.target.value);
  });
  page?.addEventListener('keydown',event=>{
    if(event.target.closest?.('#planningWeekMetric') && (event.key==='Enter'||event.key===' ')){
      event.preventDefault();
      planningOpenWeekPicker(event);
    }
  });

  const calendar=$('planningBoard');
  calendar?.addEventListener('input',event=>{
    const input=event.target.closest('[data-planning-search]');
    if(input&&calendar.contains(input))planningSetSearch(input.value,input.selectionStart);
  });
  calendar?.addEventListener('keydown',event=>{
    if(event.target.closest('[data-planning-search]') && event.key==='Enter'){event.preventDefault();event.target.blur();return;}
    const setupTarget=event.target.closest('[data-setup-nav]');
    const actionTarget=event.target.closest('[data-planning-action]');
    const target=setupTarget || actionTarget;
    if(target&&calendar.contains(target)&&(event.key==='Enter'||event.key===' ')){
      event.preventDefault();
      planningHandleCalendarAction(target,event);
    }
  });
  calendar?.addEventListener('change',event=>{
    const input=event.target.closest('.planning-slot-time[data-employee-id]');
    if(!input||!calendar.contains(input))return;
    planningUpdateSlotTime(input.dataset.employeeId,input.dataset.day,input.dataset.shift,input.value);
  });
  calendar?.addEventListener('click',event=>{
    if(event.target.closest('.planning-slot-time,.planning-slot-assignment'))return;
    const setupTarget=event.target.closest('[data-setup-nav]');
    if(setupTarget&&calendar.contains(setupTarget))return planningHandleCalendarAction(setupTarget,event);
    const actionTarget=event.target.closest('[data-planning-action]');
    if(actionTarget&&calendar.contains(actionTarget))planningHandleCalendarAction(actionTarget,event);
  });
  document.addEventListener('click', planningHandleDocumentClick, true);
  document.addEventListener('keydown', planningHandleDocumentKeydown);
}

const planningApi={
  bind: planningBind,
  render: planningRender,
  conflicts: planningConflicts,
  toggleSlot: planningToggleSlot
};
Restogogo.planning=planningApi;


})();
