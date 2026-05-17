/** Planning module slice. Loaded in order by index.html. */
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
