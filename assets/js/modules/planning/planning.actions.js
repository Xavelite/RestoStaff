/* restogogo planning module — actions (mutations, user interactions). */
(function(){
  const P = Restogogo.planningModule;
  const Export = Restogogo.export;

  /* --- IIFE-local helpers --- */

  function planningAbsenceDecision(employee,day,shift,absence){
    return Restogogo.services.calendarActions.absenceDecision({mode:'planning',employee,day,shift,absence});
  }

  function cancelAbsenceForPlanning(employeeId,absence){
    return Restogogo.services.calendarActions.persistAbsenceAction({
      employeeId,
      absence,
      action:'cancel_for_planning',
      source:'planning',
      render(){ Restogogo.shell.render(); }
    });
  }


  function clearPlanningSelection(){
    if(!P.state.selectedDay&&!P.state.selectedRow)return;
    P.state.selectedDay='';
    P.state.selectedRow='';
    if($('planningBoard'))P.refreshCalendar();
  }

  function closePlanningMenus(options){
    const shouldRefresh=!!(options&&options.refresh);
    document.querySelectorAll('.planning-board .rs-toolbar-picklist[open], .planning-board .rs-actions-menu[open]')
      .forEach(menu=>{ menu.open=false; });
    const hadSlotMenu=!!(P.state.openZoneKey || P.state.openEditKey);
    if(P.state.openZoneKey)P.state.openZoneKey='';
    if(P.state.openEditKey)P.state.openEditKey='';
    if(shouldRefresh&&hadSlotMenu&&$('planningBoard'))P.refreshCalendar();
  }

  function slotEditKey(employeeId,day,shift){
    return `${String(employeeId||'').trim()}|${String(day||'').trim()}|${String(shift||'').trim()}`;
  }

  function slotEditContextFromElement(node){
    const employeeId=String(node?.dataset?.employeeId||'').trim();
    const day=String(node?.dataset?.day||'').trim();
    const shift=String(node?.dataset?.shift||'').trim();
    return {employeeId,day,shift,key:String(node?.dataset?.planningSlotKey||slotEditKey(employeeId,day,shift))};
  }

  /* --- Public API on P --- */

  P.refreshCalendar = function refreshCalendar(){
    const el=$('planningBoard');
    if(el) el.innerHTML=P.calendar();
    P.renderMetrics();
  };

  P.setSearch = function setSearch(value,caret){
    P.state.search=String(value||'');
    P.refreshCalendar();
    requestAnimationFrame(()=>{
      const input=document.querySelector('.planning-board .rs-search-control input');
      if(!input)return;
      input.focus({preventScroll:true});
      const pos=Number.isFinite(caret)?caret:input.value.length;
      try{input.setSelectionRange(pos,pos);}catch{}
    });
  };

  P.setFilter = function setFilter(kind,value){
    const safeValue=String(value||'all');
    if(kind==='employees') P.state.view=safeValue;
    if(kind==='role') P.state.positionFilter=safeValue;
    P.refreshCalendar();
  };

  P.clearFilters = function clearFilters(){
    P.state.search='';
    P.state.view='all';
    P.state.positionFilter='all';
    P.state.selectedDay='';
    P.state.selectedRow='';
    P.refreshCalendar();
  };

  P.selectDay = function selectDay(day){
    P.state.selectedDay=P.state.selectedDay===day?'':day;
    P.refreshCalendar();
  };

  P.selectRow = function selectRow(key){
    P.state.selectedRow=P.state.selectedRow===key?'':key;
    P.refreshCalendar();
  };

  P.openSlotEditMenu = function openSlotEditMenu(context){
    const editability=P.editability();
    if(P.blocked(editability))return;
    const key=context?.key || slotEditKey(context?.employeeId,context?.day,context?.shift);
    if(!key)return;
    P.state.openZoneKey='';
    P.state.openEditKey=P.state.openEditKey===key?'':key;
    P.refreshCalendar();
  };

  P.openSlotZoneMenu = function openSlotZoneMenu(context){
    const editability=P.editability();
    if(P.blocked(editability))return;
    const key=context?.key || slotEditKey(context?.employeeId,context?.day,context?.shift);
    if(!key)return;
    P.state.openEditKey='';
    P.state.openZoneKey=key;
    P.refreshCalendar();
  };

  P.promptSlotTime = async function promptSlotTime(context){
    const editability=P.editability();
    if(P.blocked(editability))return;
    const e=emp(context.employeeId);
    if(!e)return;
    P.state.openEditKey='';
    P.state.openZoneKey='';
    P.refreshCalendar();
    const current=displayTimeRange(timeRangeFor(e,context.day,context.shift));
    const value=await Restogogo.ui?.prompt?.({
      title:'Modify shift time',
      message:`${e.name} · ${context.day} ${context.shift}`,
      label:'Time range',
      defaultValue:current,
      placeholder:'11:00-15:00',
      confirmText:'Save time',
      icon:'clock',
      tone:'neutral'
    });
    if(value===null||value===undefined)return;
    const next=String(value||'').trim();
    if(next&&next!==current)await P.updateSlotTime(context.employeeId,context.day,context.shift,next);
  };

  P.openWeekPicker = function openWeekPicker(event){
    if(event){
      const interactive=event.target.closest('button, input');
      if(interactive&&!event.target.closest('.rs-period-field'))return;
    }
    const input=$('weekStart');
    if(!input)return;
    if(typeof input.showPicker==='function'){input.showPicker();}
    else{input.focus();input.click();}
  };

  P.changeWeek = function changePlanningWeek(delta){
    if(!data)return;
    const n = Number(delta);
    if(!Number.isFinite(n)) return;
    setWeekStartAndLoad(addDays(data.weekStart, n));
    Restogogo.services?.realtime?.trackPage?.('planning', data?.weekStart);
    Restogogo.shell.render();
  };

  P.setWeek = function setWeek(value){
    if(!data||!value)return;
    setWeekStartAndLoad(value);
    Restogogo.services?.realtime?.trackPage?.('planning', data?.weekStart);
    Restogogo.shell.render();
  };

  P.togglePublish = async function togglePublish(){
    const statusCheck=P.statusEditability();
    if(P.blocked(statusCheck))return;
    const next=data.status==='Published'?'Draft':'Published';
    await P.commitMutation(window.RestogogoSaveContract.actions.planningStatus(),()=>{
      data.status=next;
      addNotification('status-'+data.weekStart+'-'+next,'warning',next==='Published'?'Schedule published':'Schedule unpublished',next==='Published'?'The schedule is now published.':'The schedule is back in draft.',{kind:'status'});
    },{
      successMessage:next==='Published'?`Planning week ${weekRangeLabel()} published`:`Planning week ${weekRangeLabel()} moved back to draft`,
      successTone:next==='Published'?'success':'warning',
      successIcon:next==='Published'?'check':'alert'
    });
  };

  P.toggleSlot = async function toggleSlot(employeeId,d,s){
    const editability=P.editability();
    if(P.blocked(editability))return;
    const e=emp(employeeId);
    if(!e)return;
    const next=!isPlanned(employeeId,d,s);
    let cancelledAbsenceLabel='';
    if(next){
      const absence=absenceForDayShift(employeeId,d,s,['Approved','Pending']);
      if(absence){
        const choice=await planningAbsenceDecision(e,d,s,absence);
        if(choice==='keep-leave')return;
        if(choice==='cancel-leave'){
          cancelledAbsenceLabel=absenceDisplayLabel(absence,'leave');
          const savedAbsence=await cancelAbsenceForPlanning(employeeId,absence);
          if(!savedAbsence)return;
        }
      }
    }
    await P.commitMutation(window.RestogogoSaveContract.actions.planningUpdate(),()=>{
      setPlanningSlot(employeeId,d,s,next);
      if(next){
        if(!assignmentZoneId(employeeId,d,s))setAssignmentSlot(employeeId,d,s,suggestZoneId(e,s));
        setAssignmentPositionSlot(employeeId,d,s,e.positionId);
        addNotification('shift-'+employeeId+d+s,'warning','Shift added',`${e.name} was planned on ${d} ${s}.`,{kind:'employee',id:employeeId});
        /* Notify the employee whose leave was cancelled so they can see it in their schedule notification bell */
        if(cancelledAbsenceLabel){
          addNotification(
            'absence-cancelled-planning-'+employeeId+'-'+d+'-'+s,
            'warning',
            'Leave cancelled — shift scheduled',
            `Your ${cancelledAbsenceLabel} on ${d} ${s} was cancelled by your manager to plan a shift.`,
            {kind:'employee',id:employeeId}
          );
        }
      }else{
        setAssignmentSlot(employeeId,d,s,'');
        setAssignmentPositionSlot(employeeId,d,s,'');
        setAssignmentTimeSlot(employeeId,d,s,'');
        addNotification('shift-remove-'+employeeId+d+s,'warning','Shift removed',`${e.name} was removed from ${d} ${s}.`,{kind:'employee',id:employeeId});
      }
    },{
      successMessage:cancelledAbsenceLabel?`${cancelledAbsenceLabel} cancelled and shift planned.`:''
    });
  };

  P.updateSlotZone = async function updateSlotZone(employeeId,d,s,value){
    const editability=P.editability();
    if(P.blocked(editability))return;
    await P.commitMutation(window.RestogogoSaveContract.actions.planningUpdate(),()=>{
      setAssignmentSlot(employeeId,d,s,value);
    });
  };

  P.updateSlotTime = async function updateSlotTime(employeeId,d,s,value){
    const editability=P.editability();
    if(P.blocked(editability))return;
    const range=normalizeTimeRangeInput(value);
    if(!range){
      Restogogo.ui?.toast?.('Use time format HH:MM-HH:MM, for example 11:00-15:00.',{tone:'warning',icon:'alert',centered:true,timeout:2600});
      Restogogo.shell.render();
      return;
    }
    await P.commitMutation(window.RestogogoSaveContract.actions.planningUpdate(),()=>{
      setAssignmentTimeSlot(employeeId,d,s,range);
    });
  };


  function filterCopiedPlanningSlots(planningSlots, activeIds, zoneIds, positionIds){
    const result={};
    if(!planningSlots || typeof planningSlots !== 'object')return result;
    Object.entries(planningSlots).forEach(([employeeId, employeeMap])=>{
      if(!activeIds.has(employeeId) || !employeeMap || typeof employeeMap !== 'object')return;
      Object.entries(employeeMap).forEach(([day, dayMap])=>{
        if(!dayMap || typeof dayMap !== 'object')return;
        Object.entries(dayMap).forEach(([shift, slot])=>{
          if(!slot?.planned)return;
          const slotCopy={planned:true};
          if(slot.zoneId && zoneIds.has(String(slot.zoneId)))slotCopy.zoneId=slot.zoneId;
          if(slot.positionId && positionIds.has(String(slot.positionId)))slotCopy.positionId=slot.positionId;
          if(slot.timeRange)slotCopy.timeRange=slot.timeRange;
          result[employeeId]=result[employeeId] || {};
          result[employeeId][day]=result[employeeId][day] || {};
          result[employeeId][day][shift]=slotCopy;
        });
      });
    });
    return result;
  }

  function filterCopiedNotes(notes){
    const result={};
    if(!notes || typeof notes !== 'object')return result;
    Object.entries(notes).forEach(([day, dayMap])=>{
      if(!dayMap || typeof dayMap !== 'object')return;
      Object.entries(dayMap).forEach(([shift, value])=>{
        const note=String(value || '').trim();
        if(!note)return;
        result[day]=result[day] || {};
        result[day][shift]=note;
      });
    });
    return result;
  }

  function sanitizedPreviousWeekPayload(previous){
    const activeIds=new Set(activeEmployees().map(employee=>String(employee.id)));
    const zoneIds=new Set((data.restaurantSetup?.zones || []).filter(zone=>zone.active !== false).map(zone=>String(zone.id)));
    const positionIds=new Set((data.restaurantSetup?.positions || []).filter(position=>position.active !== false).map(position=>String(position.id)));
    return {
      planningSlots:filterCopiedPlanningSlots(previous?.planningSlots || {}, activeIds, zoneIds, positionIds),
      notes:filterCopiedNotes(previous?.notes || {})
    };
  }

  P.copyPreviousWeek = async function copyPreviousWeek(){
    const editability=P.editability();
    if(P.blocked(editability))return;
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
    await P.commitMutation(window.RestogogoSaveContract.actions.planningUpdate(),()=>{
      const copied=sanitizedPreviousWeekPayload(h);
      const compact=compactWeeklyPayload(copied);
      data.planningSlots=compact.planningSlots;
      data.notes=compact.notes;
      data.status='Draft';
    },{
      successMessage:'Previous week copied into this draft.'
    });
  };

  P.exportCsv = function exportCsv(){
    const rows=[];
    activeEmployees().forEach(e=>days.forEach(d=>shifts.forEach(s=>{
      if(data.planningSlots?.[e.id]?.[d]?.[s]?.planned)rows.push([dateForDay(d),d,s,e.name,employeePositionName(e),assignmentZoneName(e.id,d,s)||suggestZone(e,s),displayTimeRange(timeRangeFor(e,d,s)),fmtHours(plannedSlotHours(e,d,s)),money(plannedSlotHours(e,d,s)*Number(e.hourlyCost||0))]);
    })));
    Export.downloadCsv(Export.fileName('planning','csv',data.weekStart),['Date','Day','Shift','Employee','Position','Zone','Time','Hours','Cost'],rows);
  };

  P.handleDocumentClick = function handleDocumentClick(e){
    if(!document.body.classList.contains('planning-mode'))return;

    const zoneOption=e.target.closest('.planning-board .planning-zone-option[data-zone-id]');
    if(zoneOption){
      e.preventDefault();
      e.stopPropagation();
      P.state.openZoneKey='';
      P.updateSlotZone(zoneOption.dataset.employeeId,zoneOption.dataset.day,zoneOption.dataset.shift,zoneOption.dataset.zoneId);
      return;
    }

    const editChoice=e.target.closest('.planning-board [data-planning-slot-edit-action]');
    if(editChoice){
      e.preventDefault();
      e.stopPropagation();
      const context=slotEditContextFromElement(editChoice);
      if(editChoice.dataset.planningSlotEditAction==='time')P.promptSlotTime(context);
      if(editChoice.dataset.planningSlotEditAction==='zone')P.openSlotZoneMenu(context);
      return;
    }

    const filterOption=e.target.closest('.planning-board .rs-picklist-option[data-filter-kind][data-filter-value]');
    if(filterOption){
      e.preventDefault();
      e.stopPropagation();
      closePlanningMenus();
      P.setFilter(filterOption.dataset.filterKind,filterOption.dataset.filterValue||'all');
      return;
    }

    if(!e.target.closest('.planning-board .rs-toolbar-picklist, .planning-board .rs-actions-menu')){
      const clickedSlotMenu=e.target.closest('.planning-board .planning-slot-assignment, .planning-board .planning-slot-edit-menu');
      closePlanningMenus({refresh:(P.state.openZoneKey||P.state.openEditKey)&&!clickedSlotMenu});
    }
    if(e.target.closest('.planning-board'))return;
    clearPlanningSelection();
  };

  P.handleDocumentKeydown = function handleDocumentKeydown(e){
    if(!document.body.classList.contains('planning-mode'))return;
    if(e.key==='Escape')closePlanningMenus({refresh:true});
  };
})();
