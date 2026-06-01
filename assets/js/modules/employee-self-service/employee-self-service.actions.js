/** Employee self-service actions and persistence. Loaded after employee-self-service.view.js. */
(function(){
  const ESS = Restogogo.employeeSelfServiceModule = Restogogo.employeeSelfServiceModule || {};

  ESS.toggleAvailabilityForDate = async function toggleAvailabilityForDate(dateValue,shift){
    if(!session.employeeId)return;
    const employee=ESS.currentEmployee();
    if(!employee)return;
    const date=validDate(dateValue);
    if(!date)return;
    const editability=ESS.availabilityEditability(date);
    if(!editability.ok){
      Restogogo.ui?.toast?.(editability.message || 'This date is locked.',{tone:'warning',icon:'alert',centered:false,timeout:1600});
      return;
    }
    const parsedDate=parseISO(date);
    const actual=ESS.actualEntryForDate(employee,parsedDate,shift);
    if(actual.clockIn || actual.clockOut){
      Restogogo.ui?.toast?.('This slot already has badge time.',{tone:'warning',icon:'alert',centered:false,timeout:1600});
      return;
    }
    if(absenceForDate(employee,dateValue,shift,['Approved','Pending']) || ESS.isLeaveDrafted(dateValue,shift)){
      Restogogo.ui?.toast?.('This slot already has a leave request.',{tone:'warning',icon:'alert',centered:false,timeout:1600});
      return;
    }
    const key=ESS.availabilityDraftKey(date,shift);
    const original=ESS.isAvailableForDate(employee,parsedDate,shift);
    const next=!ESS.effectiveAvailabilityForDate(employee,parsedDate,shift);
    ESS.state.availabilityDraft={...ESS.state.availabilityDraft};
    if(next===original)delete ESS.state.availabilityDraft[key];
    else ESS.state.availabilityDraft[key]=next;
    ESS.render();
  };

  ESS.toggleLeaveForDate = function toggleLeaveForDate(dateValue,shift){
    if(!session.employeeId)return;
    const employee=ESS.currentEmployee();
    if(!employee)return;
    const date=validDate(dateValue);
    if(!date)return;
    const editability=ESS.leaveEditability(date);
    if(!editability.ok){
      Restogogo.ui?.toast?.(editability.message || 'This date is locked.',{tone:'warning',icon:'alert',centered:false,timeout:1600});
      return;
    }
    const actual=ESS.actualEntryForDate(employee,parseISO(date),shift);
    if(actual.clockIn || actual.clockOut){
      Restogogo.ui?.toast?.('This slot already has badge time.',{tone:'warning',icon:'alert',centered:false,timeout:1600});
      return;
    }
    if(absenceForDate(employee,date,shift,['Approved','Pending'])){
      Restogogo.ui?.toast?.('This slot already has a leave request.',{tone:'warning',icon:'alert',centered:false,timeout:1600});
      return;
    }
    const key=ESS.leaveDraftKey(date,shift);
    const availabilityKey=ESS.availabilityDraftKey(date,shift);
    ESS.state.leaveDraft={...ESS.state.leaveDraft};
    ESS.state.availabilityDraft={...ESS.state.availabilityDraft};
    if(ESS.state.leaveDraft[key]){
      delete ESS.state.leaveDraft[key];
    }else{
      ESS.state.leaveDraft[key]=true;
      delete ESS.state.availabilityDraft[availabilityKey];
    }
    ESS.render();
  };

  ESS.leaveDraftRecords = function leaveDraftRecords(employee){
    const type=ESS.defaultAbsenceType();
    return ESS.groupedLeaveDrafts().map(group=>({
      id:`absence-${id()}`,
      absenceTypeId:type.id || ESS.defaultAbsenceTypeId(),
      start:group.start,
      end:group.end,
      shift:group.shift,
      reason:type.name || 'Holiday',
      status:'Pending',
      requestedBy:'employee',
      employeeComment:'',
      durationDays:ESS.absenceDurationDays(group.shift,group.start,group.end),
      durationHours:ESS.durationHours(group.shift,group.start,group.end),
      payrollExportStatus:'Not exported'
    })).filter(record=>{
      return !(employee.absences || []).some(absence=>['Pending','Approved'].includes(absence.status) && ESS.absenceOverlapsRange(absence,record.start,record.end,record.shift));
    });
  };

  ESS.leaveAvailabilityClearEntries = function leaveAvailabilityClearEntries(records){
    const entries=[];
    records.forEach(record=>{
      let current=validDate(record.start);
      const end=validDate(record.end || record.start);
      if(!current || !end)return;
      const leaveShifts=record.shift === 'Full day' ? shifts : [record.shift].filter(value=>shifts.includes(value));
      while(current <= end){
        const day=ESS.dayNameForDate(parseISO(current));
        leaveShifts.forEach(shift=>entries.push({dateValue:current,day,shift,value:false}));
        current=addDays(current,1);
      }
    });
    return entries;
  };

  ESS.selfServiceDraftWeekStarts = function selfServiceDraftWeekStarts(extraEntries=[]){
    const dates=[
      ...Object.keys(ESS.state.availabilityDraft || {}).map(key=>key.split('|')[0]),
      ...Object.keys(ESS.state.leaveDraft || {}).map(key=>key.split('|')[0]),
      ...extraEntries.map(entry=>entry.dateValue)
    ];
    return Array.from(new Set(dates.map(dateValue=>validDate(dateValue) ? monday(dateValue) : '').filter(Boolean))).sort();
  };

  ESS.saveSelfServiceDrafts = async function saveSelfServiceDrafts(){
    const employee=ESS.currentEmployee();
    const availabilityEntries=Object.entries(ESS.state.availabilityDraft || {});
    const requestedGroups=ESS.groupedLeaveDrafts();
    if(!employee || (!availabilityEntries.length && !requestedGroups.length))return;
    const blocked=ESS.firstBlockedDraft();
    if(blocked){
      Restogogo.ui?.toast?.(blocked.message || 'Some selected dates are locked.',{tone:'warning',icon:'alert',centered:false,timeout:1800});
      return;
    }
    employee.absences=Array.isArray(employee.absences)?employee.absences:[];
    const leaveRecords=ESS.leaveDraftRecords(employee);
    if(leaveRecords.length !== requestedGroups.length){
      Restogogo.ui?.toast?.('Some selected slots already have leave requests.',{tone:'warning',icon:'alert',centered:false,timeout:1800});
      return;
    }
    const leaveAvailabilityClears=ESS.leaveAvailabilityClearEntries(leaveRecords);
    await Restogogo.stateService.commitStateMutation({
      saveAction:window.RestogogoSaveContract.actions.employeeSelfService({includeAvailability:!!(availabilityEntries.length || leaveAvailabilityClears.length), includeAbsences:!!leaveRecords.length}),
      weekStarts:ESS.selfServiceDraftWeekStarts(leaveAvailabilityClears),
      mutate:()=>{
        availabilityEntries.forEach(([key,value])=>{
          const [dateValue,shift]=key.split('|');
          const payload=ESS.writableWeekPayload(dateValue);
          setAvailabilitySlot(employee.id,ESS.dayNameForDate(parseISO(dateValue)),shift,value,payload);
          setSubmitted(employee.id,true,payload);
        });
        leaveAvailabilityClears.forEach(entry=>{
          const payload=ESS.writableWeekPayload(entry.dateValue);
          setAvailabilitySlot(employee.id,entry.day,entry.shift,false,payload);
          setSubmitted(employee.id,true,payload);
        });
        leaveRecords.forEach(record=>{
          employee.absences.push(record);
          addNotification(`absence-request-${employee.id}-${record.id}`,'warning','Leave request',`${employee.name} - ${record.reason} - ${shortDisplayDate(record.start)}`,{kind:'employee',id:employee.id});
        });
      },
      render:ESS.render,
      renderBeforeSave:false,
      renderOnSuccess:true,
      successMessage:leaveRecords.length && availabilityEntries.length ? 'Availability and leave saved.' : leaveRecords.length ? 'Leave request saved.' : 'Availability saved.',
      centered:false,
      errorMessage:'Employee self-service changes were not saved. The change was rolled back.',
      onSuccess:()=>{ESS.state.availabilityDraft={}; ESS.state.leaveDraft={};}
    });
  };

  ESS.cancelSelfServiceDrafts = function cancelSelfServiceDrafts(){
    ESS.state.availabilityDraft={};
    ESS.state.leaveDraft={};
    ESS.render();
  };

  ESS.handleSelfServiceSlotClick = async function handleSelfServiceSlotClick(dateValue,shift){
    if(ESS.state.draftMode==='leave'){
      ESS.toggleLeaveForDate(dateValue,shift);
      return;
    }
    await ESS.toggleAvailabilityForDate(dateValue,shift);
  };

  ESS.handleSelfServiceSlotKey = function handleSelfServiceSlotKey(event,dateValue,shift){
    if(event.key==='Enter'||event.key===' '){
      event.preventDefault();
      ESS.handleSelfServiceSlotClick(dateValue,shift);
    }
  };

  ESS.openPicker = function openPicker(inputId){
    const input=$(inputId);
    if(!input)return;
    if(typeof input.showPicker==='function')input.showPicker();
    else {input.focus();input.click();}
  };

  ESS.changeScheduleWeek = function changeScheduleWeek(delta){
    Restogogo.shell?.changeWeek?.(delta);
  };

  ESS.changeWorkedMonth = function changeWorkedMonth(delta){
    setWeekStartAndLoad(ESS.addMonths(data?.weekStart || new Date(), delta > 0 ? 1 : -1));
    ESS.renderApp();
  };

  ESS.setWeek = function setWeek(value){
    if(!data||!value)return;
    setWeekStartAndLoad(value);
    ESS.renderApp();
  };

  ESS.renderApp = function renderApp(){
    Restogogo.shell?.render?.();
  };
})();
