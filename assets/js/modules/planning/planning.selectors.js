/* restogogo planning module — selectors, slot builders and conflict detection. */
(function(){
  const P = Restogogo.planningModule;

  /* --- IIFE-local helpers --- */

  function planningSlotKey(employeeId,day,shift){
    return `${String(employeeId||'').trim()}|${String(day||'').trim()}|${String(shift||'').trim()}`;
  }


  function planningAvailabilityMarker(state,shift){
    const labels={
      available:`${shift} available`,
      partial:`${shift} partially available`,
      unavailable:`${shift} unavailable`
    };
    if(state==='unavailable')return `<span class="planning-availability-line is-unavailable" aria-label="${esc(labels.unavailable)}"></span>`;
    return '';
  }

  function planningEmployeeHasAvailable(e){
    return days.some(d=>shifts.some(s=>availabilityOverlayState(e.id,d,s)==='available'));
  }

  function planningEmployeeHasConflict(e){
    return days.some(d=>shifts.some(s=>P.slotConflict(e,d,s)));
  }

  function planningEmployeeHasAbsence(e){
    return days.some(d=>shifts.some(s=>!!P.slotAbsence(e,d,s)));
  }

  /* --- Public API on P --- */

  /* Employee identity rendering is shared by weekly-grid-renderer. */

  P.slotAbsence = function slotAbsence(e,d,s){
    return absenceForDayShift(e.id,d,s,['Approved','Pending']);
  };

  P.slotConflict = function slotConflict(e,d,s){
    const state=availabilityOverlayState(e.id,d,s);
    const absence=P.slotAbsence(e,d,s);
    return isPlanned(e.id,d,s) && (absence?.status==='Approved'||state==='unavailable'||state==='unknown');
  };

  P.slotCard = function slotCard(e,d,s){
    const editability=P.editability();
    const editable=editability.ok;
    const planned=isPlanned(e.id,d,s);
    const zoneId=assignmentZoneId(e.id,d,s);
    const suggestedZoneId=suggestZoneId(e,s);
    const displayZoneId=zoneId||suggestedZoneId;
    const displayZone=zoneDisplayName(displayZoneId)||'Unassigned';
    const assignmentPosition=assignmentPositionId(e.id,d,s)||e.positionId||'';
    const coverageStatus=Restogogo.logic?.coverage?.slotRequirementStatus?.(d,s,displayZoneId,assignmentPosition,data);
    const coverageClass=coverageStatus?.status==='over'?'has-coverage-over':coverageStatus?.status==='under'?'has-coverage-under':'';
    const overlayState=availabilityOverlayState(e.id,d,s);
    const absence=P.slotAbsence(e,d,s);
    const approvedAbsence=absence?.status==='Approved';
    const pendingAbsence=absence?.status==='Pending';
    const conflict=P.slotConflict(e,d,s);
    const zoneKey=planningSlotKey(e.id,d,s);
    const zoneOpen=P.state.openZoneKey===zoneKey;
    const editOpen=P.state.openEditKey===zoneKey;
    const absenceClass=approvedAbsence?'has-absence-approved':pendingAbsence?'has-absence-pending':'';
    const slotClasses=[
      'planning-slot','planning-slot-zone','rs-calendar-slot',
      s==='Lunch'?'is-lunch':'is-evening',
      s==='Lunch'?'rs-calendar-slot--lunch':'rs-calendar-slot--evening',
      planned?'is-planned':'empty',
      planned?'rs-calendar-slot--planned':'rs-calendar-slot--empty',
      conflict?'has-conflict':'',
      conflict?'rs-calendar-slot--conflict':'',
      coverageClass,absenceClass,
      zoneOpen&&editable?'is-zone-open':'',
      editable?'':'is-readonly',
      data.status==='Published'?'is-published':'',
      `rs-calendar-slot--availability-${overlayState}`
    ].filter(Boolean).join(' ');
    const cardClasses=['planning-slot-card','rs-calendar-card','rs-calendar-card--planned','rs-calendar-card--density-weekly','rs-weekly-slot',conflict?'has-conflict':'',coverageClass,absenceClass].filter(Boolean).join(' ');
    const slotTitleMap={available:'Available',partial:'Partially available',unavailable:'Unavailable',unknown:'No response'};
    const marker=planningAvailabilityMarker(overlayState,s);
    const titleParts=[slotTitleMap[overlayState]||'Availability'];
    if(!editable&&editability.message)titleParts.unshift(editability.message);
    if(coverageStatus?.status==='over')titleParts.unshift(`Over-covered by ${coverageStatus.delta}`);
    if(coverageStatus?.status==='under')titleParts.unshift(`Under-covered by ${Math.abs(coverageStatus.delta)}`);
    if(absence)titleParts.unshift(`${absence.status} ${absenceDisplayLabel(absence,'Leave')}`);
    const slotActionAttrs=editable
      ?`data-planning-action="toggle-slot" data-employee-id="${esc(e.id)}" data-day="${esc(d)}" data-shift="${esc(s)}"`
      :`aria-disabled="true"`;
    if(!planned){
      if(absence){
        const absenceAttrs = ` data-calendar-absence="1" data-employee-id="${esc(e.id)}" data-day="${esc(d)}" data-shift="${esc(s)}" data-absence-id="${esc(absence.id||'')}"`;
        const absenceSlot = Restogogo.services.calendarActions.absenceSlotHtml(absence, absenceAttrs);
        return `<div class="${slotClasses}" ${slotActionAttrs} data-planning-slot-key="${esc(zoneKey)}" aria-label="${esc(titleParts.join(' · '))}">${absenceSlot}</div>`;
      }
      return `<div class="${slotClasses}" ${slotActionAttrs} data-planning-slot-key="${esc(zoneKey)}" aria-label="${esc(titleParts.join(' · '))}"><span class="planning-slot-empty rs-slot-add rs-calendar-slot-add" aria-hidden="true"><span aria-hidden="true">+</span></span>${marker}</div>`;
    }
    const absenceConflictLabel=absence?`${absenceDisplayLabel(absence,'Leave')} ${String(absence.status||'Pending').toLowerCase()}`:'';
    const conflictNote=absence?`<span class="planning-slot-conflict-note">! ${esc(absenceConflictLabel)}</span>`:'';
    const zoneOptions=editable?activeRestaurantZones(s).map(z=>{const positionLabel=zoneDefaultPositionNames(z).join(', ')||'Any position';return `<button type="button" class="planning-zone-option rs-picklist-option ${displayZoneId===z.id?'is-selected':''}" data-employee-id="${esc(e.id)}" data-day="${esc(d)}" data-shift="${esc(s)}" data-zone-id="${esc(z.id)}" title="${esc(z.name)} · ${esc(positionLabel)}"><span class="rs-picklist-option-label">${esc(z.name)}</span>${displayZoneId===z.id?Restogogo.icons.checkmark():''}</button>`;}).join(''):'';
    const editMenu=editOpen&&editable?`<div class="planning-slot-edit-menu rs-picklist-menu rs-picklist-menu--choice rs-picklist-menu--inline" role="menu" aria-label="Edit shift"><button type="button" class="rs-picklist-option" data-planning-slot-edit-action="time" data-employee-id="${esc(e.id)}" data-day="${esc(d)}" data-shift="${esc(s)}" role="menuitem"><span class="rs-picklist-option-label">Modify time</span></button><button type="button" class="rs-picklist-option" data-planning-slot-edit-action="zone" data-employee-id="${esc(e.id)}" data-day="${esc(d)}" data-shift="${esc(s)}" role="menuitem"><span class="rs-picklist-option-label">Modify zone</span></button></div>`:'';
    const zoneMenu=zoneOpen&&editable?`<div class="planning-zone-menu rs-picklist-menu rs-picklist-menu--choice rs-picklist-menu--inline" role="menu">${zoneOptions}</div>`:'';
    const zoneControl=`<div class="planning-slot-assignment ${zoneOpen&&editable?'is-open':''}"><span class="planning-slot-position">${esc(displayZone)}</span>${zoneMenu}</div>`;
    const timeControl=`<span class="planning-slot-card-head"><span class="planning-slot-time" title="${esc(`${s} time for this employee/day`)}">${esc(displayTimeRange(timeRangeFor(e,d,s)))}</span></span>`;
    return `<div class="${slotClasses}" ${slotActionAttrs} data-planning-slot-key="${esc(zoneKey)}" aria-label="${esc(titleParts.join(' · '))}"><div class="${cardClasses}" data-planning-slot-edit="true" data-planning-slot-key="${esc(zoneKey)}" data-employee-id="${esc(e.id)}" data-day="${esc(d)}" data-shift="${esc(s)}" aria-label="${esc(`Right-click to edit ${e.name} ${d} ${s}`)}">${timeControl}${zoneControl}${conflictNote}${editMenu}</div></div>`;
  };

  P.sortedEmployees = function sortedEmployees(){
    return [...activeEmployees()];
  };

  P.conflicts = function conflicts(list){
    if(!list) list = P.sortedEmployees();
    const conflictsArr=[];
    list.forEach(e=>days.forEach(d=>shifts.forEach(s=>{
      if(P.slotConflict(e,d,s)) conflictsArr.push({employee:e,day:d,shift:s,range:displayTimeRange(timeRangeFor(e,d,s)),zone:assignmentZoneName(e.id,d,s)||suggestZone(e,s)});
    })));
    return conflictsArr;
  };

  P.visibleEmployeeInfo = function visibleEmployeeInfo(){
    const all=P.sortedEmployees();
    const planned=all.filter(e=>employeePlannedWeekTotal(e)>0).length;
    const conflicts=P.conflicts(all);
    let list=[...all];
    if(P.state.view==='relevant') list=list.filter(e=>employeePlannedWeekTotal(e)>0||planningEmployeeHasAvailable(e)||planningEmployeeHasConflict(e)||planningEmployeeHasAbsence(e));
    if(P.state.view==='planned') list=list.filter(e=>employeePlannedWeekTotal(e)>0);
    if(P.state.view==='available') list=list.filter(e=>planningEmployeeHasAvailable(e));
    if(P.state.view==='conflicts') list=list.filter(e=>planningEmployeeHasConflict(e));
    const role=cleanPositionName(P.state.positionFilter||'all');
    if(role&&role!=='all') list=list.filter(e=>cleanPositionName(employeePositionName(e))===role);
    const q=String(P.state.search||'').trim().toLowerCase();
    if(q) list=list.filter(e=>`${e.name||''} ${employeePositionName(e)}`.toLowerCase().includes(q));
    return {all,list,planned,total:all.length,conflicts,conflictCount:conflicts.length};
  };

  P.positionsForFilter = function positionsForFilter(all){
    return all.map(e=>cleanPositionName(employeePositionName(e))).filter((p,i,a)=>p&&a.indexOf(p)===i).sort((a,b)=>positionIndex(a)-positionIndex(b)||a.localeCompare(b));
  };
})();
