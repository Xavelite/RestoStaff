/** Planning module slice. Loaded in order by index.html. */
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


function planningApprovedAbsenceDecision(employee,day,shift,absence){
  return new Promise(resolve=>{
    const dialog=document.createElement('dialog');
    dialog.className='planning-absence-decision-dialog';
    const label=absenceDisplayLabel(absence,'leave');
    dialog.innerHTML=`<form method="dialog" class="planning-absence-decision-card">
      <div class="planning-absence-decision-icon" aria-hidden="true">${absenceIconMarkup(absence)}</div>
      <div class="planning-absence-decision-copy">
        <h2>Approved leave already exists</h2>
        <p>${esc(employee.name)} has approved ${esc(label)} for ${esc(day)} ${esc(shift)}. How do you want to handle this?</p>
      </div>
      <div class="planning-absence-decision-actions">
        <button type="button" class="rs-modal-btn danger" data-planning-absence-decision="cancel-leave-plan">Cancel leave & plan shift</button>
        <button type="button" class="rs-modal-btn secondary" data-planning-absence-decision="plan-anyway">Plan anyway</button>
        <button type="button" class="rs-modal-btn primary" data-planning-absence-decision="keep-leave">Keep leave</button>
      </div>
    </form>`;
    document.body.appendChild(dialog);
    const close=value=>{
      if(dialog.open)dialog.close();
      dialog.remove();
      resolve(value || 'keep-leave');
    };
    dialog.addEventListener('click',event=>{
      if(event.target===dialog)return close('keep-leave');
      const button=event.target.closest('[data-planning-absence-decision]');
      if(button)return close(button.dataset.planningAbsenceDecision);
    });
    dialog.addEventListener('cancel',event=>{event.preventDefault();close('keep-leave');});
    dialog.showModal();
    setTimeout(()=>dialog.querySelector('[data-planning-absence-decision="keep-leave"]')?.focus?.(),30);
  });
}

function planningCancelApprovedAbsenceForShift(absence){
  if(!absence)return;
  absence.status='Cancelled';
  absence.cancelledAt=new Date().toISOString();
  absence.managerComment=absence.managerComment || 'Cancelled from Planning to book a shift.';
}


async function planningTogglePublish(){
  const next=data.status==='Published'?'Draft':'Published';
  await planningCommitMutation('planning-status', ()=>{
    data.status=next;
    addNotification('status-'+data.weekStart+'-'+next,'yellow',next==='Published'?'Schedule published':'Schedule unpublished',next==='Published'?'The schedule is now published.':'The schedule is back in draft.',{kind:'status'});
  }, {
    successMessage:next==='Published'?`Planning week ${weekRangeLabel()} published`:`Planning week ${weekRangeLabel()} moved back to draft`,
    successTone:next==='Published'?'success':'warning',
    successIcon:next==='Published'?'check':'alert'
  });
}

async function planningToggleSlot(employeeId,d,s){
  if(data.status==='Published'){
    Restogogo.ui?.toast?.('Move the planning back to draft before editing.',{tone:'warning',icon:'alert',centered:true,timeout:2200});
    return;
  }
  const e=emp(employeeId);
  if(!e)return;
  const next=!isPlanned(employeeId,d,s);
  let cancelledAbsenceLabel='';
  if(next){
    const absence=employeePrimaryAbsenceForSlot(employeeId,d,s,['Approved']);
    if(absence){
      const choice=await planningApprovedAbsenceDecision(e,d,s,absence);
      if(choice==='keep-leave')return;
      if(choice==='cancel-leave-plan'){
        cancelledAbsenceLabel=absenceDisplayLabel(absence,'leave');
        const savedAbsence=await Restogogo.stateService.commitStateMutation({
          reason:'employee-leave-planning-cancel',
          mutate:()=>planningCancelApprovedAbsenceForShift(absence),
          render,
          errorMessage:'Leave cancellation was not saved. Planning was not changed.'
        });
        if(!savedAbsence)return;
      }
    }
  }
  await planningCommitMutation('planning-refresh', ()=>{
    markPlanningMutation(employeeId,d,s);
    setPlanningSlot(employeeId,d,s,next);
    if(next){
      if(!assignmentZoneId(employeeId,d,s))setAssignmentSlot(employeeId,d,s,suggestZoneId(e,s));
      setAssignmentPositionSlot(employeeId,d,s,e.positionId);
      addNotification('shift-'+employeeId+d+s,'yellow','Shift added',`${e.name} was planned on ${d} ${s}.`,{kind:'employee',id:employeeId});
    }else{
      setAssignmentSlot(employeeId,d,s,'');
      setAssignmentPositionSlot(employeeId,d,s,'');
      setAssignmentTimeSlot(employeeId,d,s,'');
      addNotification('shift-remove-'+employeeId+d+s,'yellow','Shift removed',`${e.name} was removed from ${d} ${s}.`,{kind:'employee',id:employeeId});
    }
  }, {
    successMessage:cancelledAbsenceLabel ? `${cancelledAbsenceLabel} cancelled and shift planned.` : ''
  });
}

async function planningUpdateSlotZone(employeeId,d,s,value){
  await planningCommitMutation('planning-refresh', ()=>{
    setAssignmentSlot(employeeId,d,s,value);
    markPlanningMutation(employeeId,d,s);
  });
}

async function planningUpdateSlotTime(employeeId,d,s,value){
  const range=normalizeTimeRangeInput(value);
  if(!range){
    Restogogo.ui?.toast?.('Use time format HH:MM-HH:MM, for example 11:00-15:00.',{tone:'warning',icon:'alert',centered:true,timeout:2600});
    render();
    return;
  }
  await planningCommitMutation('planning-refresh', ()=>{
    setAssignmentTimeSlot(employeeId,d,s,range);
    markPlanningMutation(employeeId,d,s);
  });
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
    icon:'alert',
    tone:'neutral'
  });
  if(!ok)return;
  const h=data.history?.[addDays(data.weekStart,-7)];
  if(!h){
    await Restogogo.ui?.alert?.({title:'No previous week saved',message:'Go to that week first or create a schedule before copying it.',confirmText:'OK',icon:'alert',tone:'warning'});
    return;
  }
  await planningCommitMutation('planning-refresh', ()=>{
    data.planning=compactWeeklyPayload({planning:h.planning||{}}).planning;
    data.assignments=compactWeeklyPayload({assignments:h.assignments||{}}).assignments;
    data.assignmentPositions=compactWeeklyPayload({assignmentPositions:h.assignmentPositions||{}}).assignmentPositions;
    data.assignmentTimes=compactWeeklyPayload({assignmentTimes:h.assignmentTimes||{}}).assignmentTimes;
    data.notes=compactWeeklyPayload({notes:h.notes||{}}).notes;
    data.status='Draft';
  }, {
    successMessage:'Previous week copied into this draft.'
  });
}

function planningExportCsv(){
  const rows=[];
  activeEmployees().forEach(e=>days.forEach(d=>shifts.forEach(s=>{
    if(data.planning?.[e.id]?.[d]?.[s])rows.push([dateForDay(d),d,s,e.name,employeePositionName(e),assignmentZoneName(e.id,d,s)||suggestZone(e,s),displayTimeRange(timeRangeFor(e,d,s)),fmtHours(plannedSlotHours(e,d,s)),money(plannedSlotHours(e,d,s)*Number(e.hourlyCost||0))]);
  })));
  Export.downloadCsv(Export.fileName('planning','csv',data.weekStart),['Date','Day','Shift','Employee','Position','Zone','Time','Hours','Cost'],rows);
}

function planningChangeWeek(delta){changeWeek(delta);}
function planningSetWeek(value){
  if(!data||!value)return;
  setWeekStartAndLoad(value);
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
  document.querySelectorAll('.planning-board .rs-toolbar-picklist[open], .planning-board .rs-actions-menu[open]')
    .forEach(menu=>{ menu.open=false; });
  if(planningOpenZoneKey){
    planningOpenZoneKey='';
    if(shouldRefresh && $('planningBoard')) planningRefreshCalendar();
  }
}

function planningHandleDocumentClick(e){
  if(!document.body.classList.contains('planning-mode'))return;

  const zoneOption=e.target.closest('.planning-board .planning-zone-option[data-zone-id]');
  if(zoneOption){
    e.preventDefault();
    e.stopPropagation();
    const employeeId=zoneOption.dataset.employeeId;
    const day=zoneOption.dataset.day;
    const shift=zoneOption.dataset.shift;
    const value=zoneOption.dataset.zoneId;
    planningOpenZoneKey='';
    planningUpdateSlotZone(employeeId,day,shift,value);
    return;
  }

  const coverageChip=e.target.closest('.planning-board .planning-coverage-chip[data-planning-coverage-day]');
  if(coverageChip){
    e.preventDefault();
    e.stopPropagation();
    selectedPlanningDay=coverageChip.dataset.planningCoverageDay || '';
    planningRefreshCalendar();
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

  const filterOption=e.target.closest('.planning-board .rs-picklist-option[data-filter-kind][data-filter-value]');
  if(filterOption){
    e.preventDefault();
    e.stopPropagation();
    closePlanningMenus();
    planningSetFilter(filterOption.dataset.filterKind, filterOption.dataset.filterValue || 'all');
    return;
  }

  if(!e.target.closest('.planning-board .rs-toolbar-picklist, .planning-board .rs-actions-menu')){
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
