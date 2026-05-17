/** Planning module slice. Loaded in order by index.html. */
function hasAnyAvailability(employeeId){return days.some(d=>shifts.some(s=>!!data.availability?.[employeeId]?.[d]?.[s]))}
function submissionIcon(employeeId){
  const submitted=!!data.submitted?.[employeeId];
  const partial=!submitted && hasAnyAvailability(employeeId);
  const cls=submitted?'submitted':partial?'partial':'missing';
  const label=submitted?'Submitted availability':partial?'Availability started, not submitted':'No availability submitted';
  const state=submitted?'ready':partial?'warning':'inactive';
  return ` ${Restogogo.icons.status(state,{label,className:`submit-dot ${cls} is-inline`})}`;
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
  // Planned shifts use one generic blue foreground card; position stays as text only.
  return '--shift-accent:#60a5fa;--shift-bg:rgba(25,70,126,.88);--shift-border:rgba(96,165,250,.34);';
}

function planningSlotAbsence(e,d,s){
  return employeePrimaryAbsenceForSlot(e.id,d,s,['Approved','Pending']);
}
function planningSlotConflict(e,d,s){
  const state=availabilityOverlayState(e.id,d,s);
  const absence=planningSlotAbsence(e,d,s);
  return isPlanned(e.id,d,s) && (absence?.status==='Approved'||state==='unavailable'||state==='unknown');
}
function planningSlotAbsenceMarker(absence){
  if(!absence)return '';
  const status=String(absence.status || '').toLowerCase();
  const label=absenceDisplayLabel(absence,'Leave');
  const clean=String(absence.status || 'Pending');
  const state=clean==='Approved'?'approved':clean==='Rejected'?'rejected':clean==='Cancelled'?'cancelled':'pending';
  return `<span class="planning-absence-layer is-${esc(status)}" title="${esc(`${absence.status} ${absenceDisplayLabel(absence,'Leave')}`)}">${Restogogo.icons.status(state,{label:clean,className:'is-inline planning-absence-status'})}<em class="planning-absence-icon" aria-hidden="true">${absenceIconMarkup(absence,'rs-inline-icon')}</em><b>${esc(label)}</b></span>`;
}
function planningEmployeeHasAvailable(e){
  return days.some(d=>shifts.some(s=>availabilityOverlayState(e.id,d,s)==='available'));
}
function planningEmployeeHasConflict(e){
  return days.some(d=>shifts.some(s=>planningSlotConflict(e,d,s)));
}
function planningEmployeeHasAbsence(e){
  return days.some(d=>shifts.some(s=>!!planningSlotAbsence(e,d,s)));
}
function planningConflicts(list=planningSortedEmployees()){
  const conflicts=[];
  list.forEach(e=>days.forEach(d=>shifts.forEach(s=>{
    if(planningSlotConflict(e,d,s)) conflicts.push({employee:e,day:d,shift:s,range:displayTimeRange(timeRangeFor(e,d,s)),zone:assignmentZoneName(e.id,d,s)||suggestZone(e,s)});
  })));
  return conflicts;
}

function planningSlotCard(e,d,s){
  const planned=isPlanned(e.id,d,s);
  const zoneId=assignmentZoneId(e.id,d,s);
  const suggestedZoneId=suggestZoneId(e,s);
  const displayZoneId=zoneId||suggestedZoneId;
  const displayZone=zoneDisplayName(displayZoneId)||'Unassigned';
  const assignmentPosition=assignmentPositionId(e.id,d,s) || e.positionId || '';
  const coverageStatus=Restogogo.logic?.coverage?.slotRequirementStatus?.(d,s,displayZoneId,assignmentPosition,data);
  const coverageClass=coverageStatus?.status==='over'?'has-coverage-over':coverageStatus?.status==='under'?'has-coverage-under':'';
  const overlayState=availabilityOverlayState(e.id,d,s);
  const absence=planningSlotAbsence(e,d,s);
  const approvedAbsence=absence?.status==='Approved';
  const pendingAbsence=absence?.status==='Pending';
  const conflict=planningSlotConflict(e,d,s);
  const zoneKey=planningSlotKey(e.id,d,s);
  const zoneOpen=planningOpenZoneKey===zoneKey;
  const absenceClass=approvedAbsence?'has-absence-approved':pendingAbsence?'has-absence-pending':'';
  const slotClasses=[
    'planning-slot',
    'planning-slot-zone',
    s==='Lunch'?'is-lunch':'is-evening',
    planned?'is-planned':'empty',
    conflict?'has-conflict':'',
    coverageClass,
    absenceClass,
    zoneOpen?'is-zone-open':'',
    data.status==='Published'?'is-published':'',
    'overlay-on',
    `overlay-${overlayState}`,
  ].filter(Boolean).join(' ');
  const cardClasses=['planning-slot-card','rs-shift-card','rs-weekly-slot',conflict?'has-conflict':'',coverageClass,absenceClass].filter(Boolean).join(' ');
  const cardStyle=planningSlotStyle(employeePositionName(e));
  const slotTitleMap={available:'Available',partial:'Partially available',unavailable:'Unavailable',unknown:'No response'};
  const marker=planningSlotAbsenceMarker(absence);
  const titleParts=[slotTitleMap[overlayState]||'Availability'];
  if(coverageStatus?.status==='over')titleParts.unshift(`Over-covered by ${coverageStatus.delta}`);
  if(coverageStatus?.status==='under')titleParts.unshift(`Under-covered by ${Math.abs(coverageStatus.delta)}`);
  if(absence)titleParts.unshift(`${absence.status} ${absenceDisplayLabel(absence,'Leave')}`);
  if(!planned){
    return `<div class="${slotClasses}" data-planning-action="toggle-slot" data-planning-slot-key="${esc(zoneKey)}" data-employee-id="${esc(e.id)}" data-day="${esc(d)}" data-shift="${esc(s)}" title="${esc(titleParts.join(' · '))}"><span class="planning-slot-empty">+</span>${marker}</div>`;
  }
  const conflictNote=absence ? `<span class="planning-slot-conflict-note">${esc(absence.status==='Approved'?'Conflict':'Pending')} · ${esc(absenceDisplayLabel(absence,'Leave'))}</span>` : '';
  const zoneOptions=activeRestaurantZones(s).map(z=>{const positionLabel=zoneDefaultPositionNames(z).join(', ') || 'Any position'; return `<button type="button" class="planning-zone-option rs-picklist-option ${displayZoneId===z.id?'is-selected':''}" data-employee-id="${esc(e.id)}" data-day="${esc(d)}" data-shift="${esc(s)}" data-zone-id="${esc(z.id)}" title="${esc(z.name)} · ${esc(positionLabel)}"><span class="rs-picklist-option-label">${esc(z.name)}</span>${displayZoneId===z.id?Restogogo.icons.checkmark():''}</button>`;}).join('');
  const zoneControl=`<div class="planning-slot-assignment ${zoneOpen?'is-open':''}" title="Change assignment"><button type="button" class="planning-zone-trigger" data-zone-key="${esc(zoneKey)}" data-employee-id="${esc(e.id)}" data-day="${esc(d)}" data-shift="${esc(s)}" aria-label="Change assignment" aria-expanded="${zoneOpen?'true':'false'}"><span class="planning-slot-position">${esc(displayZone)}</span></button><div class="planning-zone-menu rs-picklist-menu rs-picklist-menu--choice rs-picklist-menu--inline" role="menu">${zoneOptions}</div></div>`;
  const timeControl=`<input class="planning-slot-time" value="${esc(displayTimeRange(timeRangeFor(e,d,s)))}" data-employee-id="${esc(e.id)}" data-day="${esc(d)}" data-shift="${esc(s)}" title="Custom time for this employee/day/shift">`;
  return `<div class="${slotClasses}" data-planning-action="toggle-slot" data-planning-slot-key="${esc(zoneKey)}" data-employee-id="${esc(e.id)}" data-day="${esc(d)}" data-shift="${esc(s)}" title="${esc(titleParts.join(' · '))}"><div class="${cardClasses}"${styleAttr(cardStyle)}>${timeControl}${zoneControl}${conflictNote}</div></div>`;
}


function planningSortedEmployees(){
  return [...activeEmployees()];
}

function planningVisibleEmployeeInfo(){
  const all=planningSortedEmployees();
  const planned=all.filter(e=>employeePlannedWeekTotal(e)>0).length;
  const conflicts=planningConflicts(all);
  let list=[...all];
  if(planningView==='relevant') list=list.filter(e=>employeePlannedWeekTotal(e)>0||planningEmployeeHasAvailable(e)||planningEmployeeHasConflict(e)||planningEmployeeHasAbsence(e));
  if(planningView==='planned') list=list.filter(e=>employeePlannedWeekTotal(e)>0);
  if(planningView==='available') list=list.filter(e=>planningEmployeeHasAvailable(e));
  if(planningView==='conflicts') list=list.filter(e=>planningEmployeeHasConflict(e));
  const role=cleanPositionName(planningPositionFilter||'all');
  if(role && role!=='all') list=list.filter(e=>cleanPositionName(employeePositionName(e))===role);
  const q=String(planningSearch||'').trim().toLowerCase();
  if(q) list=list.filter(e=>`${e.name||''} ${employeePositionName(e)}`.toLowerCase().includes(q));
  return {all,list,planned,total:all.length,conflicts,conflictCount:conflicts.length};
}

function planningPositionsForFilter(all){
  return all.map(e=>cleanPositionName(employeePositionName(e))).filter((p,i,a)=>p&&a.indexOf(p)===i).sort((a,b)=>positionIndex(a)-positionIndex(b)||a.localeCompare(b));
}
