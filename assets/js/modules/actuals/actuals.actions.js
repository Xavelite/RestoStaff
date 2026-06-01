(function(){
  let bound=false;
  let correctionDialog=null;
  let pendingBadgeRefresh=false;

  function actualsPrintView(){Restogogo.ui?.toast?.('Opening print view.',{tone:'success',icon:'check',centered:false,timeout:1200});setTimeout(()=>window.print(),80);}
  function changeWeek(delta){Restogogo.shell.changeWeek(delta);}
  function setWeek(value){if(!data||!value)return;setWeekStartAndLoad(value);Restogogo.shell?.render?.();}
  function openWeekPicker(event){
    if(event){const interactive=event.target.closest('button, input');if(interactive && !event.target.closest('.rs-period-field'))return;}
    const input=$('actualsWeekStart');if(!input)return;if(typeof input.showPicker==='function')input.showPicker();else {input.focus();input.click();}
  }
  function closeMenus(){document.querySelectorAll('.actuals-filter-menu[open], .actuals-actions[open]').forEach(el=>el.removeAttribute('open'));}
  /* Converts display shift names (e.g. 'Lunch', 'Evening') to DB service_key values ('lunch', 'evening').
     primitives.SHIFTS uses display-cased names; the DB expects lowercase service_key values. */
  function serviceKey(shift){return String(shift||'').trim().toLowerCase();}
  function minutesToClock(minutes){
    const value=Number(minutes);
    if(!Number.isFinite(value))return '';
    const normalized=((Math.round(value)%1440)+1440)%1440;
    return `${String(Math.floor(normalized/60)).padStart(2,'0')}:${String(normalized%60).padStart(2,'0')}`;
  }
  function localIso(dateValue,timeValue){
    const date=String(dateValue||'').trim();
    const time=String(timeValue||'').trim();
    if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!/^\d{2}:\d{2}$/.test(time))return '';
    const stamp=new Date(`${date}T${time}:00`);
    return Number.isFinite(stamp.getTime())?stamp.toISOString():'';
  }
  function contextFromElement(node){
    const employeeId=String(node?.dataset?.employeeId||'').trim();
    const day=String(node?.dataset?.day||'').trim();
    const shift=String(node?.dataset?.shift||'').trim();
    return {employeeId,day,shift,date:day?dateForDay(day):'',serviceKey:serviceKey(shift)};
  }
  function contextEmployee(context){return emp(context.employeeId);}
  function contextAbsence(context){return absenceForDayShift(context.employeeId,context.day,context.shift,['Approved','Pending']);}
  function contextEntry(context){return Restogogo.logic.actuals.entry(context.employeeId,context.day,context.shift);}
  function contextHasActual(context){const entry=contextEntry(context);return !!(entry.id || entry.clockIn || entry.clockOut);}

  async function openCorrectionWithAbsenceDecision(context){
    const absence=contextAbsence(context);
    if(absence && !contextHasActual(context)){
      const employee=contextEmployee(context);
      const choice=await Restogogo.services.calendarActions.absenceDecision({mode:'actuals',employee,day:context.day,shift:context.shift,absence});
      if(choice==='keep-leave')return;
      if(choice==='cancel-leave'){
        const saved=await Restogogo.services.calendarActions.persistAbsenceAction({employeeId:context.employeeId,absence,action:'cancel',source:'actuals',render:Restogogo.actuals.render});
        if(!saved)return;
      }
    }
    openCorrectionDialog(context);
  }

  async function openActualsContextMenu(event,node){
    const context=contextFromElement(node);
    const absence=contextAbsence(context);
    if(absence && !contextHasActual(context)){
      return Restogogo.services.calendarActions.showAbsenceContextMenu(event,{employeeId:context.employeeId,absence,source:'actuals',render:Restogogo.actuals.render});
    }
    const entry=contextEntry(context);
    const hasProof=Restogogo.logic.actuals.hasProof(entry);
    const choice=await Restogogo.services.calendarActions.floatingMenu(event,{
      ariaLabel:'Actual entry actions',
      items:[
        {action:'modify-time',label:'Modify time'},
        {action:'see-picture',label:'See picture',hidden:!hasProof}
      ]
    });
    if(choice==='modify-time')openCorrectionDialog(context);
    if(choice==='see-picture')Restogogo.actuals.showProof(context.employeeId,context.day,context.shift);
  }
  function employeeOptions(selectedId){
    return activeEmployees().map(employee=>`<option value="${esc(employee.id)}"${employee.id===selectedId?' selected':''}>${esc(employee.name)}</option>`).join('');
  }
  function dayOptions(selectedDay){
    return days.map(day=>`<option value="${esc(day)}"${day===selectedDay?' selected':''}>${esc(day)} · ${esc(shortDisplayDate(dateForDay(day)))}</option>`).join('');
  }
  function shiftOptions(selectedShift){
    return shifts.map(shift=>`<option value="${esc(shift)}"${shift===selectedShift?' selected':''}>${esc(shift)}</option>`).join('');
  }
  function ensureCorrectionDialog(){
    if(correctionDialog)return correctionDialog;
    correctionDialog=document.createElement('dialog');
    correctionDialog.className='actuals-correction-dialog rs-dialog';
    document.body.appendChild(correctionDialog);
    correctionDialog.addEventListener('click',event=>{if(event.target===correctionDialog || event.target.closest('[data-actuals-correction-close]'))closeCorrectionDialog();});
    correctionDialog.addEventListener('cancel',event=>{event.preventDefault();closeCorrectionDialog();});
    correctionDialog.addEventListener('submit',event=>{event.preventDefault();submitCorrectionDialog();});
    correctionDialog.addEventListener('click',event=>{
      if(event.target.closest('[data-actuals-correction-cancel-entry]')){event.preventDefault();cancelEntryFromDialog();}
    });
    correctionDialog.addEventListener('change',event=>{
      if(event.target.matches('[name="day"]')){
        const dateInput=correctionDialog.querySelector('[name="businessDate"]');
        if(dateInput)dateInput.value=dateForDay(event.target.value);
      }
    });
    return correctionDialog;
  }
  function openCorrectionDialog(context={}){
    const employee=emp(context.employeeId);
    const day=days.includes(context.day)?context.day:days[0];
    const shift=shifts.includes(context.shift)?context.shift:shifts[0];
    const entry=Restogogo.logic.actuals.entry(context.employeeId,day,shift);
    const planned=Restogogo.logic.actuals.plannedRangeFor(employee||{},day,shift);
    const bounds=timeRangeBounds(planned || '');
    const clockIn=entry.clockIn || minutesToClock(bounds?.start) || '';
    const clockOut=entry.clockOut || minutesToClock(bounds?.end) || '';
    const hasEntry=!!(entry.id || entry.clockIn || entry.clockOut);
    const dialog=ensureCorrectionDialog();
    dialog.innerHTML=`<form method="dialog" class="actuals-correction-card rs-dialog-card">
      <header class="actuals-correction-head rs-dialog-card__head"><span class="rs-icon-badge">${Restogogo.icons.svg('clock')}</span><div><h2>Correct actuals</h2><p>Manual manager correction with audit reason. Original badge evidence stays preserved.</p></div></header>
      <div class="actuals-correction-grid">
        <label class="rs-field actuals-correction-field"><span>Employee</span><select name="employeeId" required>${employeeOptions(context.employeeId)}</select></label>
        <label class="rs-field actuals-correction-field"><span>Day</span><select name="day" required>${dayOptions(day)}</select></label>
        <label class="rs-field actuals-correction-field"><span>Service</span><select name="shift" required>${shiftOptions(shift)}</select></label>
        <label class="rs-field actuals-correction-field"><span>Date</span><input name="businessDate" type="date" value="${esc(context.date||dateForDay(day))}" required /></label>
        <label class="rs-field actuals-correction-field"><span>Clock in</span><input name="clockIn" type="time" value="${esc(clockIn)}" required /></label>
        <label class="rs-field actuals-correction-field"><span>Clock out</span><input name="clockOut" type="time" value="${esc(clockOut)}" /></label>
      </div>
      <label class="rs-field actuals-correction-reason"><span>Manager reason</span><textarea name="reason" rows="3" required placeholder="Example: employee forgot to badge out; corrected from manager review."></textarea></label>
      <input type="hidden" name="timeEntryId" value="${esc(entry.id||'')}" />
      <footer class="actuals-correction-actions rs-dialog-card__actions">
        ${hasEntry?'<button type="button" class="rs-modal-btn is-danger" data-actuals-correction-cancel-entry>Cancel entry</button>':''}
        <button type="button" class="rs-modal-btn is-secondary" data-actuals-correction-close>Close</button>
        <button type="submit" class="rs-modal-btn is-primary">Save correction</button>
      </footer>
    </form>`;
    if(dialog.open)dialog.close();
    dialog.showModal();
    setTimeout(()=>dialog.querySelector('[name="clockIn"]')?.focus?.(),40);
  }
  function isCorrectionDialogOpen(){return !!correctionDialog?.open;}
  async function refreshActualsFromRemote(){
    if(Restogogo.registry.activePage() !== 'actuals') return;
    try{
      await Restogogo.stateService?.load?.();
      Restogogo.actuals.render();
    }catch{}
  }
  function closeCorrectionDialog(){
    const shouldRefresh = pendingBadgeRefresh && isCorrectionDialogOpen();
    if(correctionDialog?.open)correctionDialog.close();
    if(shouldRefresh){
      pendingBadgeRefresh=false;
      setTimeout(refreshActualsFromRemote,0);
    }
  }
  function dialogPayload(actionOverride=''){
    const form=correctionDialog?.querySelector('form');
    if(!form)return null;
    const fd=new FormData(form);
    const day=String(fd.get('day')||'');
    const shift=String(fd.get('shift')||'');
    const date=String(fd.get('businessDate')||dateForDay(day));
    const clockIn=String(fd.get('clockIn')||'').trim();
    const clockOut=String(fd.get('clockOut')||'').trim();
    const timeEntryId=String(fd.get('timeEntryId')||'').trim();
    const payload={
      employee_id:String(fd.get('employeeId')||''),
      business_date:date,
      service_key:serviceKey(shift),
      time_entry_id:timeEntryId || null,
      clock_in_at:localIso(date,clockIn),
      clock_out_at:clockOut?localIso(date,clockOut):null,
      reason:String(fd.get('reason')||'').trim()
    };
    const action=actionOverride || (timeEntryId?'adjust_entry':'manual_entry');
    return {action,payload};
  }
  async function persistActualsChange(action,payload,successMessage){
    return Restogogo.stateService.commitStateMutation({
      saveAction:window.RestogogoSaveContract.actions.actuals(action,{actuals:{action,payload}}),
      mutate:()=>{},
      render:Restogogo.actuals.render,
      renderOnSuccess:true,
      successMessage:successMessage || 'Actuals updated.',
      errorMessage:'Actuals change was not saved.'
    });
  }
  async function submitCorrectionDialog(){
    const payload=dialogPayload();
    if(!payload)return;
    if(!payload.payload.employee_id || !payload.payload.business_date || !payload.payload.service_key || !payload.payload.clock_in_at || !payload.payload.reason){
      Restogogo.ui?.toast?.('Employee, date, service, clock-in and reason are required.',{tone:'warning',icon:'alert',centered:true,timeout:2600});
      return;
    }
    if(payload.payload.clock_out_at && new Date(payload.payload.clock_out_at) < new Date(payload.payload.clock_in_at)){
      Restogogo.ui?.toast?.('Clock-out cannot be before clock-in.',{tone:'warning',icon:'alert',centered:true,timeout:2600});
      return;
    }
    const ok=await persistActualsChange(payload.action,payload.payload,'Actuals correction saved.');
    if(ok)closeCorrectionDialog();
  }
  async function cancelEntryFromDialog(){
    const payload=dialogPayload('cancel_entry');
    if(!payload?.payload?.time_entry_id){Restogogo.ui?.toast?.('No time entry is selected to cancel.',{tone:'warning',icon:'alert',centered:true});return;}
    if(!payload.payload.reason){Restogogo.ui?.toast?.('A manager reason is required to cancel an entry.',{tone:'warning',icon:'alert',centered:true});return;}
    const confirmed=await Restogogo.ui?.confirm?.({title:'Cancel actual entry?',message:'The entry will stay in the audit trail but will no longer count as worked time.',tone:'danger',icon:'alert',confirmText:'Cancel entry'});
    if(!confirmed)return;
    const ok=await persistActualsChange('cancel_entry',payload.payload,'Actuals entry cancelled.');
    if(ok)closeCorrectionDialog();
  }
  async function closeWeek(action){
    const reason=await Restogogo.ui?.prompt?.({title:action==='approve_week'?'Approve actuals week':'Reopen actuals week',message:'Add a short manager reason for the weekly actuals record.',label:'Reason',placeholder:action==='approve_week'?'Reviewed and approved for payroll prep.':'Reopened for correction.',defaultValue:action==='approve_week'?'Reviewed and approved for payroll prep.':'Reopened for correction.',confirmText:action==='approve_week'?'Approve week':'Reopen week'});
    if(reason===null || reason===undefined)return;
    const clean=String(reason||'').trim();
    if(clean.length<3){Restogogo.ui?.toast?.('A reason is required.',{tone:'warning',icon:'alert',centered:true});return;}
    await persistActualsChange(action,{week_start:data.weekStart,reason:clean},action==='approve_week'?'Actuals week approved.':'Actuals week reopened.');
  }
  function bind(){
    if(bound)return;bound=true;
    const page=$('page-actuals');
    if(!page)return;
    page.addEventListener('input',event=>{if(event.target?.id==='actualSearch'){Restogogo.actuals.setSearch(event.target.value||'');const pos=event.target.selectionStart||Restogogo.actuals.state.search.length;Restogogo.actuals.render();const input=$('actualSearch');input?.focus?.();input?.setSelectionRange?.(pos,pos);}});
    page.addEventListener('change',event=>{if(event.target?.id==='actualsWeekStart')setWeek(event.target.value);});
    page.addEventListener('keydown',event=>{
      if(event.target?.id==='actualSearch' && event.key==='Enter'){event.preventDefault();event.target.blur();return;}
      if(event.key==='Escape'){closeMenus();return;}
      const selectionTarget=event.target.closest?.('[data-actuals-action="select-day"],[data-actuals-action="select-row"]');
      if(selectionTarget && (event.key==='Enter'||event.key===' ')){
        event.preventDefault();
        const selectionAction=selectionTarget.dataset.actualsAction;
        if(selectionAction==='select-day')Restogogo.actuals.selectDay(selectionTarget.dataset.day);
        if(selectionAction==='select-row')Restogogo.actuals.selectRow(selectionTarget.dataset.rowkey);
        Restogogo.actuals.render();
        return;
      }
      const weekMetric=event.target.closest?.('#actualsWeekMetric');
      if(weekMetric && (event.key==='Enter'||event.key===' ')){event.preventDefault();openWeekPicker(event);}
    });
    page.addEventListener('contextmenu',event=>{
      const contextTarget=event.target.closest('[data-actuals-edit]');
      if(!contextTarget || !page.contains(contextTarget))return;
      event.preventDefault();
      event.stopPropagation();
      openActualsContextMenu(event,contextTarget);
    });
    page.addEventListener('click',event=>{
      if(event.target.closest('#actualPrevWeek')){event.preventDefault();event.stopPropagation();changeWeek(-7);return;}
      if(event.target.closest('#actualNextWeek')){event.preventDefault();event.stopPropagation();changeWeek(7);return;}
      if(event.target.closest('#actualsWeekMetric')){event.stopPropagation();openWeekPicker(event);return;}
      const filter=event.target.closest('[data-actuals-filter]');
      if(filter){Restogogo.actuals.setFilter(filter.dataset.actualsFilter,filter.dataset.actualsValue);closeMenus();Restogogo.actuals.render();return;}
      if(event.target.closest('[data-actuals-clear-filters]')){Restogogo.actuals.resetFilters();Restogogo.actuals.render();return;}
      const proofCard=event.target.closest('[data-actuals-proof]');
      if(proofCard && event.target.closest('.actuals-proof-dot')){Restogogo.actuals.showProof(proofCard.dataset.employeeId,proofCard.dataset.day,proofCard.dataset.shift);return;}
      const editCard=event.target.closest('[data-actuals-edit]');
      if(editCard){openCorrectionWithAbsenceDecision(contextFromElement(editCard));return;}
      const actionTarget=event.target.closest('[data-actuals-action]');
      const action=actionTarget?.dataset.actualsAction;
      if(action==='select-day'){Restogogo.actuals.selectDay(actionTarget.dataset.day);Restogogo.actuals.render();return;}
      if(action==='select-row'){Restogogo.actuals.selectRow(actionTarget.dataset.rowkey);Restogogo.actuals.render();return;}
      if(action){closeMenus();}
      if(action==='approve-week'){closeWeek('approve_week');return;}
      if(action==='reopen-week'){closeWeek('reopen_week');return;}
      if(action==='export-payroll'){Restogogo.export.actuals.payroll();return;}
      if(action==='export-summary'){Restogogo.export.actuals.summary();return;}
      if(action==='export-details'){Restogogo.export.actuals.details();return;}
      if(action==='export-anomalies'){Restogogo.export.actuals.anomalies();return;}
      if(action==='print'){actualsPrintView();return;}
      if(!event.target.closest('.actuals-filter-menu, .actuals-actions'))closeMenus();
    });
    // Live badge-entry refresh — auto-reload Actuals data when a badge entry is
    // broadcast from the badge terminal (debounced 2 s to batch rapid clock-ins).
    let _badgeRefreshTimer = null;
    window.Restogogo?.services?.realtime?.onBadgeEntry?.(() => {
      clearTimeout(_badgeRefreshTimer);
      _badgeRefreshTimer = setTimeout(async () => {
        if(Restogogo.registry.activePage() !== 'actuals') return;
        if(isCorrectionDialogOpen()){
          pendingBadgeRefresh=true;
          Restogogo.ui?.toast?.('New badge entry received. Close the correction dialog to refresh Actuals.',{tone:'warning',icon:'info',centered:false,timeout:3200});
          return;
        }
        await refreshActualsFromRemote();
      }, 2000);
    });
  }
  Restogogo.actuals=Object.assign(Restogogo.actuals||{},{bind,openCorrectionDialog});
})();
