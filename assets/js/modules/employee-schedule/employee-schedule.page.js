/*
 * restogogo employee schedule
 * Employee-facing page: Schedule + Worked time.
 */

(function(){
  let bound = false;
  let timeMode = 'availability';
  let leaveDraft = null;
  const Metrics = Restogogo.services.metrics;
  const Icons = Restogogo.icons;
  const A = () => Restogogo.logic?.actuals;


  function absenceStatusIcon(status){
    const clean = String(status || 'Pending');
    const state = clean === 'Approved' ? 'approved' : clean === 'Cancelled' ? 'cancelled' : clean === 'Rejected' ? 'rejected' : 'pending';
    return Icons.status(state,{label:clean,className:'is-inline'});
  }


  function currentEmployee(){
    return emp(session.employeeId) || activeEmployees()[0] || null;
  }

  function flashTimeSlot(dateValue,shift){
    requestAnimationFrame(()=>{
      const el=document.querySelector(`.employee-worked-slot[data-date="${dateValue}"][data-shift="${shift}"]`);
      if(!el)return;
      el.classList.remove('just-tapped');
      void el.offsetWidth;
      el.classList.add('just-tapped');
      setTimeout(()=>el.classList.remove('just-tapped'),700);
    });
  }

  function isSlotPlanned(employee, day, shift){
    return !!data?.planning?.[employee.id]?.[day]?.[shift];
  }

  function isSlotAvailable(employee, day, shift){
    return !!data?.availability?.[employee.id]?.[day]?.[shift];
  }

  function absenceTypes(){
    return normalizeAbsenceTypeList(data?.restaurantSetup?.absenceTypes).filter(type=>type.active !== false);
  }

  function defaultAbsenceTypeId(){
    return absenceTypes()[0]?.id || 'holiday';
  }

  function absenceCoversSlot(absence, date, shift){
    const start=normalizeDateString(absence?.start);
    const end=normalizeDateString(absence?.end || absence?.start) || start;
    if(!start || date < start || date > end)return false;
    return !absence.shift || absence.shift === 'Full day' || absence.shift === shift;
  }

  function absencePriority(status){
    return {Approved:0, Pending:1, Rejected:2, Cancelled:3}[status] ?? 9;
  }

  function absencesForSlot(employee, day, shift){
    const date=dateForDay(day);
    return (employee?.absences || [])
      .filter(absence=>absenceCoversSlot(absence,date,shift))
      .sort((a,b)=>absencePriority(a.status)-absencePriority(b.status)||String(b.start).localeCompare(String(a.start)));
  }

  function visibleAbsenceForSlot(employee, day, shift){
    return absencesForSlot(employee,day,shift).find(absence=>['Approved','Pending'].includes(absence.status)) || null;
  }

  function dayNameForDate(date){
    return days[(date.getDay()+6)%7];
  }

  function isAvailableForDate(employee, date, shift){
    const payload=weekPayloadForDate(date);
    const day=dayNameForDate(date);
    return !!payload?.availability?.[employee.id]?.[day]?.[shift];
  }

  function draftAbsences(employee){
    if(!leaveDraft)return [];
    return employeeAbsencesForDateShift(employee, leaveDraft.start, leaveDraft.shift, ['Approved','Pending']);
  }

  function durationDays(start,end){
    const a=validDate(start), b=validDate(end || start);
    if(!a || !b)return 0;
    return Math.max(1, Math.round((parseISO(b)-parseISO(a))/86400000)+1);
  }

  function durationHours(shift,start,end){
    const daysCount=durationDays(start,end);
    if(!daysCount)return 0;
    if(shift==='Full day')return daysCount * 8;
    return daysCount * 4;
  }

  function leaveDraftTitle(){
    if(!leaveDraft)return '';
    const range = leaveDraft.end && leaveDraft.end !== leaveDraft.start ? `${shortDisplayDate(leaveDraft.start)} → ${shortDisplayDate(leaveDraft.end)}` : shortDisplayDate(leaveDraft.start);
    return `${leaveDraft.shift} · ${range}`;
  }

  function plannedZone(employee, day, shift){
    return assignmentZoneName(employee.id,day,shift) || suggestZone(employee,shift) || 'Unassigned';
  }

  function slotRange(employee, day, shift){
    if(isSlotPlanned(employee, day, shift)) return Restogogo.logic?.planning?.rangeFor?.(employee, day, shift, data) || timeRangeFor(employee,day,shift);
    return timeRangeFor(employee,day,shift);
  }

  function employeeWeekStats(employee){
    let plannedHours=0;
    let plannedSlots=0;
    let availableSlots=0;
    let workedHours=0;
    let openBadges=0;
    let workedDays=0;
    days.forEach(day=>{
      let hasWork=false;
      shifts.forEach(shift=>{
        if(isSlotPlanned(employee,day,shift)){
          plannedSlots++;
          plannedHours += hoursFromRange(slotRange(employee,day,shift));
        }
        if(isSlotAvailable(employee,day,shift))availableSlots++;
        const entry=A()?.entry?.(employee.id,day,shift,data) || getActualEntry(employee.id,day,shift,data);
        if(entry.clockIn){
          hasWork=true;
          if(!entry.clockOut)openBadges++;
          workedHours += A()?.actualHoursFor?.(employee,day,shift,data) || hoursFromRange(entry.clockIn && entry.clockOut ? `${entry.clockIn}-${entry.clockOut}` : '');
        }
      });
      if(hasWork)workedDays++;
    });
    return {plannedHours, plannedSlots, availableSlots, workedHours, openBadges, workedDays};
  }

  function nextPlannedShift(employee){
    const todayIndex=(new Date().getDay()+6)%7;
    const ordered=days.map((day,index)=>({day,index})).sort((a,b)=>((a.index-todayIndex+7)%7)-((b.index-todayIndex+7)%7));
    for(const item of ordered){
      for(const shift of shifts){
        if(isSlotPlanned(employee,item.day,shift)){
          return `${item.day.slice(0,3)} ${shift} · ${displayTimeRange(slotRange(employee,item.day,shift))}`;
        }
      }
    }
    return 'No shift planned';
  }

  function renderMetrics(employee, view='schedule'){
    const stats=employeeWeekStats(employee);
    const status=data.status==='Published'?'Published':'Draft';
    return [
      Metrics.card({tone:'status',icon:'document',label:view==='worked'?'My time':'My schedule',value:status,meta:view==='schedule'?'Weekly rota':`${timeMode==='leave'?'Leave requests':'Availability'} - Monthly recap`}),
      Metrics.week({
        tag:'div',
        id:view==='worked'?'employeeTimeWeekMetric':'employeeScheduleWeekMetric',
        ariaLabel:view==='worked'?'Change month':'Change week',
        prevId:view==='worked'?'employeeTimePrevMonth':'employeeSchedulePrevWeek',
        nextId:view==='worked'?'employeeTimeNextMonth':'employeeScheduleNextWeek',
        inputId:view==='worked'?'employeeTimeMonthStart':'employeeScheduleWeekStart',
        inputAriaLabel:view==='worked'?'Select month reference date':'Select week start date',
        prevAriaLabel:view==='worked'?'Previous month':'Previous week',
        nextAriaLabel:view==='worked'?'Next month':'Next week',
        valueId:view==='worked'?'employeeTimeMonthLabel':'employeeScheduleWeekLabel',
        value:view==='worked'?monthLabel():weekDisplayRange(),
        inputValue:data.weekStart
      }),
      Metrics.card({tone:'hours',icon:'clock',label:view==='worked'?'Worked time':'Planned hours',value:view==='worked'?fmtHours(stats.workedHours):fmtHours(stats.plannedHours),meta:view==='worked'?`${stats.workedDays} worked days · ${stats.openBadges} live`:`${stats.plannedSlots} planned · ${stats.availableSlots} available`}),
      Metrics.card({tone:'cost',icon:'check',label:'Next shift',value:stats.plannedSlots?String(stats.plannedSlots):'0',meta:nextPlannedShift(employee)})
    ].join('');
  }


  function renderScheduleSlot(employee, day, shift){
    const absence=visibleAbsenceForSlot(employee,day,shift);
    const planned=isSlotPlanned(employee,day,shift);
    const available=isSlotAvailable(employee,day,shift);
    const zone=plannedZone(employee,day,shift);
    const range=slotRange(employee,day,shift);
    const timeText=displayTimeRange(range);
    let title='Off';
    let detail='No planned shift';
    let stateClass='is-off';

    if(absence){
      title=absenceDisplayLabel(absence,'Leave');
      detail=`${absence.shift || 'Full day'}`;
      stateClass=absence.status==='Approved'?'is-leave-approved':'is-leave-pending';
    }else if(planned){
      title=timeText || 'Planned';
      detail=`${zone} · ${fmtHours(hoursFromRange(range))}`;
      stateClass='is-planned is-published';
    }else if(available){
      title='Available';
      detail=timeText || 'Open slot';
      stateClass='is-available';
    }

    const className=['employee-schedule-shift',shift==='Lunch'?'is-lunch':'is-evening',stateClass].join(' ');
    const iconMarkup = absence ? absenceIconMarkup(absence,'rs-inline-icon') : '';
    return `<article data-day="${esc(day)}" data-shift="${esc(shift)}" class="${className}"><span class="employee-schedule-shift__dot" aria-hidden="true">${iconMarkup}</span><div class="employee-schedule-shift__body"><strong>${esc(title)}</strong><small>${esc(detail)}</small></div></article>`;
  }

  function renderTimeModeBar(){
    const copy = timeMode === 'leave'
      ? 'Leave mode: click a day or shift to request time off.'
      : 'Availability mode: click empty cells to mark when you can work.';
    return `<div class="employee-schedule-actionbar" role="toolbar" aria-label="Employee time mode">
      <div class="employee-schedule-mode-toggle">
        <button type="button" data-employee-time-mode="availability" class="${timeMode==='availability'?'is-active':''}">Availability</button>
        <button type="button" data-employee-time-mode="leave" class="${timeMode==='leave'?'is-active':''}">Leave</button>
      </div>
      <span>${esc(copy)}</span>
    </div>`;
  }

  function renderLeavePanel(employee){
    if(timeMode !== 'leave' || !leaveDraft)return '';
    const types = absenceTypes();
    const typeOptions = types.map(type=>`<option value="${esc(type.id)}" ${type.id===leaveDraft.absenceTypeId?'selected':''}>${esc(type.name)}</option>`).join('');
    const slotAbsences = draftAbsences(employee);
    const pending = slotAbsences.find(absence=>absence.status==='Pending');
    const approved = slotAbsences.find(absence=>absence.status==='Approved');
    const existing = pending || approved;
    return `<form class="employee-leave-panel" data-employee-leave-form>
      <header><div><strong>${esc(existing ? (existing.status === 'Approved' ? 'Approved leave' : 'Pending leave request') : 'Request leave')}</strong><span>${esc(existing ? absenceDisplayLabel(existing,'Leave') : leaveDraftTitle())}</span></div>${existing?absenceStatusIcon(existing.status):''}</header>
      <div class="employee-leave-fields">
        <label class="rs-field employee-leave-field"><span>Type</span><select name="absenceTypeId" ${existing?'disabled':''}>${typeOptions}</select></label>
        <label class="rs-field employee-leave-field"><span>Shift</span><select name="shift" ${existing?'disabled':''}><option ${leaveDraft.shift==='Full day'?'selected':''}>Full day</option><option ${leaveDraft.shift==='Lunch'?'selected':''}>Lunch</option><option ${leaveDraft.shift==='Evening'?'selected':''}>Evening</option></select></label>
        <label class="rs-field employee-leave-field"><span>Start</span><input name="start" type="date" value="${esc(leaveDraft.start)}" ${existing?'disabled':''}></label>
        <label class="rs-field employee-leave-field"><span>End</span><input name="end" type="date" value="${esc(leaveDraft.end || leaveDraft.start)}" ${existing?'disabled':''}></label>
        <label class="rs-field employee-leave-field wide"><span>Comment</span><input name="employeeComment" type="text" value="${esc(leaveDraft.employeeComment || existing?.employeeComment || '')}" placeholder="Optional note" ${existing?'disabled':''}></label>
      </div>
      <div class="employee-leave-actions">
        <button type="button" class="rs-modal-btn secondary" data-employee-leave-cancel>Close</button>
        ${pending?`<button type="button" class="rs-modal-btn secondary" data-employee-leave-cancel-request="${esc(pending.id)}">Cancel request</button>`:''}
        ${existing?'':`<button type="submit" class="rs-modal-btn primary">Submit request</button>`}
      </div>
    </form>`;
  }

  function renderSchedule(employee){
    const rows=days.map(day=>{
      const date=dateForDay(day);
      const cells=shifts.map(shift=>renderScheduleSlot(employee,day,shift)).join('');
      return `<article class="employee-schedule-row"><div class="employee-schedule-day"><strong>${esc(day.slice(0,3))}</strong><span>${esc(shortDisplayDate(date))}</span></div>${cells}</article>`;
    }).join('');
    return `<section class="employee-schedule-tab-panel ops-tab-panel is-schedule"><div class="employee-schedule-board-head"><span>Day</span><strong>Lunch</strong><strong>Evening</strong></div><div class="employee-schedule-grid" id="employeeScheduleGrid">${rows}</div></section>`;
  }

  function addMonths(dateLike, delta){
    const base=new Date(validDate(dateLike) || data?.weekStart || new Date());
    const day=base.getDate();
    base.setDate(1);
    base.setMonth(base.getMonth()+delta);
    const last=new Date(base.getFullYear(),base.getMonth()+1,0).getDate();
    base.setDate(Math.min(day,last));
    return localISO(base);
  }

  function monthLabel(){
    const base=new Date(validDate(data?.weekStart) || new Date());
    return base.toLocaleDateString(undefined,{month:'long',year:'numeric'});
  }

  function monthDates(){
    const base=new Date(validDate(data?.weekStart) || new Date());
    const first=new Date(base.getFullYear(),base.getMonth(),1);
    const firstGrid=new Date(first);
    firstGrid.setDate(first.getDate()-((first.getDay()+6)%7));
    return Array.from({length:42},(_,i)=>{const d=new Date(firstGrid);d.setDate(firstGrid.getDate()+i);return d;});
  }

  function weekPayloadForDate(date){
    const week=monday(localISO(date));
    const active=monday(data?.weekStart || new Date());
    if(week===active)return data;
    return data?.history?.[week] || null;
  }

  function plannedForDate(employee, date, shift){
    const payload=weekPayloadForDate(date);
    const day=days[(date.getDay()+6)%7];
    return !!payload?.planning?.[employee.id]?.[day]?.[shift];
  }

  function actualEntryForDate(employee, date, shift){
    const payload=weekPayloadForDate(date);
    const day=days[(date.getDay()+6)%7];
    return payload ? (A()?.entry?.(employee.id,day,shift,payload) || getActualEntry(employee.id,day,shift,payload)) : normalizeActualEntry();
  }

  function rangeForDate(employee,date,shift){
    const payload=weekPayloadForDate(date);
    const day=days[(date.getDay()+6)%7];
    return payload ? (Restogogo.logic?.planning?.rangeFor?.(employee, day, shift, payload) || timeRangeFor(employee,day,shift)) : '';
  }

  function renderWorkedDate(employee, date){
    const base=new Date(validDate(data?.weekStart) || new Date());
    const inMonth=date.getMonth()===base.getMonth();
    const dateValue=localISO(date);
    let total=0;
    let live=false;
    const rows=shifts.map(shift=>{
      const entry=actualEntryForDate(employee,date,shift);
      const planned=plannedForDate(employee,date,shift);
      const available=isAvailableForDate(employee,date,shift);
      const absence=employeePrimaryAbsenceForDateShift(employee,dateValue,shift,['Approved','Pending']);
      const plannedText=planned ? displayTimeRange(rangeForDate(employee,date,shift)) : '';
      const hasActual=!!entry.clockIn;
      const actualText=hasActual ? `${entry.clockIn}-${entry.clockOut || 'live'}` : (absence ? absenceDisplayLabel(absence,'Leave') : (available ? 'Available' : '-'));
      if(entry.clockIn && !entry.clockOut)live=true;
      total += A()?.actualHoursFor?.(employee,days[(date.getDay()+6)%7],shift,weekPayloadForDate(date)||data) || hoursFromRange(entry.clockIn && entry.clockOut ? `${entry.clockIn}-${entry.clockOut}` : '');
      const tone=entry.clockIn && !entry.clockOut ? 'is-live' : entry.clockIn ? 'is-done' : absence?.status==='Approved' ? 'is-leave-approved' : absence?.status==='Pending' ? 'is-leave-pending' : available ? 'is-available' : planned ? 'is-pending' : 'is-empty';
      const sub=absence && !hasActual ? `${absence.status} - ${absence.shift || shift}` : (available ? 'Open availability' : (plannedText ? `Planned ${plannedText}` : 'No planned shift'));
      const selected=leaveDraft?.start===dateValue && leaveDraft?.shift===shift ? 'is-selected' : '';
      return `<div role="button" tabindex="0" data-employee-time-slot data-date="${esc(dateValue)}" data-shift="${esc(shift)}" class="employee-worked-slot ${tone} ${selected}"><span>${esc(shift)}</span><strong>${esc(actualText)}</strong><small>${esc(sub)}</small></div>`;
    }).join('');
    return `<article class="employee-worked-day rs-card ${inMonth?'':'is-outside'} ${live?'is-live':''}"><header><div><strong>${date.getDate()}</strong><span>${esc(date.toLocaleDateString(undefined,{weekday:'short'}))}</span></div><b>${esc(fmtHours(total))}</b></header><div class="employee-worked-slots">${rows}</div></article>`;
  }

  function renderWorked(employee){
    const rows=monthDates().map(date=>renderWorkedDate(employee,date)).join('');
    const hasLeavePanel=timeMode==='leave' && !!leaveDraft;
    return `<section class="employee-schedule-tab-panel ops-tab-panel is-worked ${hasLeavePanel?'has-leave-panel':''}">${renderTimeModeBar()}${renderLeavePanel(employee)}<div class="employee-time-calendar-panel"><div class="employee-worked-month-head"><strong>${esc(monthLabel())}</strong><span>Calendar view of badge time, availability and leave</span></div><div class="employee-worked-weekdays"><span>Mon</span><span>Tue</span><span>Wed</span><span>Thu</span><span>Fri</span><span>Sat</span><span>Sun</span></div><div class="employee-worked-calendar">${rows}</div></div></section>`;
  }

  function renderEmployeePage(rootId, view){
    const root=$(rootId);
    if(!root||!data)return;

    const employee=currentEmployee();
    if(!employee){
      root.innerHTML='<div class="employee-schedule-shell"><section class="employee-schedule-panel rs-frame"><p class="employee-schedule-empty">No employee selected.</p></section></div>';
      return;
    }

    const aria = view==='worked' ? 'Employee worked time' : 'Employee weekly schedule';
    const content = view==='worked' ? renderWorked(employee) : renderSchedule(employee);
    root.innerHTML=`<div class="employee-schedule-shell"><section aria-label="${aria}" class="employee-schedule-panel rs-frame">
      <div aria-label="${view==='worked'?'Worked time summary and controls':'Schedule summary and controls'}" class="employee-schedule-metrics rs-weekly-metrics">${renderMetrics(employee, view)}</div>
      ${content}
    </section></div>`;
  }

  function render(){
    const active=Restogogo.router?.activePageName?.();
    if(active==='employee-time'){
      renderEmployeePage('employeeTimeRoot','worked');
      return;
    }
    if(active==='employee-schedule'){
      renderEmployeePage('employeeScheduleRoot','schedule');
    }
  }

  function openLeaveDraftForDate(dateValue,shift){
    const date=normalizeDateString(dateValue);
    if(!date)return;
    const day=dayNameForDate(parseISO(date));
    const employee=currentEmployee();
    const existing=employee ? employeeAbsencesForDateShift(employee,date,shift,['Approved','Pending'])[0] : null;
    leaveDraft={
      day,
      shift,
      start:existing?.start || date,
      end:existing?.end || date,
      absenceTypeId:existing?.absenceTypeId || defaultAbsenceTypeId(),
      employeeComment:existing?.employeeComment || ''
    };
    render();
    requestAnimationFrame(()=>document.querySelector('[data-employee-leave-form] select,input')?.focus?.({preventScroll:true}));
  }

  async function toggleAvailabilityForDate(dateValue,shift){
    if(!session.employeeId)return;
    const employee=currentEmployee();
    if(!employee)return;
    const date=validDate(dateValue);
    if(!date)return;
    const day=dayNameForDate(date);
    const targetWeek=monday(dateValue);
    const targetPayload=weekPayloadForDate(date) || data;
    if(employeePrimaryAbsenceForDateShift(employee,dateValue,shift,['Approved','Pending'])){
      Restogogo.ui?.toast?.('This slot already has a leave request.',{tone:'warning',icon:'alert',centered:false,timeout:1600});
      return;
    }
    if(plannedForDate(employee,date,shift)){
      Restogogo.ui?.toast?.('This shift is already planned.',{tone:'success',icon:'check',centered:false,timeout:1500});
      return;
    }
    if(targetPayload.status==='Published'){
      Restogogo.ui?.toast?.('Published schedule is read-only for availability.',{tone:'warning',icon:'alert',centered:false,timeout:1600});
      return;
    }

    const employeeId=session.employeeId;
    const next=!isAvailableForDate(employee,date,shift);
    await Restogogo.stateService.commitStateMutation({
      reason:'employee-time-availability',
      mutate:()=>{
        if(targetWeek !== monday(data.weekStart))setWeekStartAndLoad(targetWeek);
        setAvailabilitySlot(employeeId,day,shift,next);
        setSubmitted(employeeId,true);
      },
      render,
      errorMessage:'Availability was not saved. The change was rolled back.',
      onSuccess:()=>flashTimeSlot(dateValue,shift)
    });
  }

  async function handleTimeSlotClick(dateValue,shift){
    if(timeMode==='leave'){
      openLeaveDraftForDate(dateValue,shift);
      return;
    }
    await toggleAvailabilityForDate(dateValue,shift);
  }

  async function submitLeaveRequest(form){
    const employee=currentEmployee();
    if(!employee || !leaveDraft)return;
    const values=Object.fromEntries(new FormData(form).entries());
    const start=normalizeDateString(values.start || leaveDraft.start);
    const end=normalizeDateString(values.end || start) || start;
    if(!start){Restogogo.ui?.toast?.('Start date is required.',{tone:'warning',icon:'alert',centered:true});return;}
    if(end < start){Restogogo.ui?.toast?.('End date cannot be before start date.',{tone:'warning',icon:'alert',centered:true});return;}
    const type=absenceTypeById(data?.restaurantSetup?.absenceTypes, values.absenceTypeId) || absenceTypes()[0] || null;
    const shift=['Full day','Lunch','Evening'].includes(values.shift) ? values.shift : leaveDraft.shift;
    employee.absences=Array.isArray(employee.absences)?employee.absences:[];
    const duplicate=employee.absences.find(absence=>['Pending','Approved'].includes(absence.status) && absenceCoversSlot(absence,start,shift));
    if(duplicate){Restogogo.ui?.toast?.('This slot already has a leave request.',{tone:'warning',icon:'alert',centered:true});return;}
    const record={
      id:`absence-${id()}`,
      absenceTypeId:type?.id || '',
      start,
      end,
      shift,
      reason:type?.name || 'Leave',
      status:'Pending',
      requestedBy:'employee',
      employeeComment:String(values.employeeComment || '').trim(),
      durationDays:durationDays(start,end),
      durationHours:durationHours(shift,start,end),
      payrollExportStatus:'Not exported'
    };
    await Restogogo.stateService.commitStateMutation({
      reason:'employee-leave-request',
      mutate:()=>{
        employee.absences.push(record);
        addNotification(`absence-request-${employee.id}-${Date.now()}`,'yellow','Leave request',`${employee.name} · ${record.reason} · ${shortDisplayDate(start)}`,{kind:'employee',id:employee.id});
      },
      render,
      renderBeforeSave:false,
      renderOnSuccess:true,
      successMessage:'Leave request submitted.',
      centered:false,
      errorMessage:'Leave request was not saved. Please try again.',
      onSuccess:()=>{ leaveDraft=null; }
    });
  }

  async function cancelLeaveRequest(absenceId){
    const employee=currentEmployee();
    if(!employee || !absenceId)return;
    const absence=(employee.absences||[]).find(item=>item.id===absenceId);
    if(!absence || absence.status!=='Pending')return;
    await Restogogo.stateService.commitStateMutation({
      reason:'employee-leave-cancel',
      mutate:()=>{
        absence.status='Cancelled';
        absence.cancelledAt=new Date().toISOString();
        absence.managerComment=absence.managerComment || '';
      },
      render,
      successMessage:'Leave request cancelled.',
      centered:false,
      errorMessage:'Leave cancellation was not saved. The change was rolled back.',
      onSuccess:()=>{ leaveDraft=null; }
    });
  }

  function handleTimeSlotKey(event,dateValue,shift){
    if(event.key==='Enter'||event.key===' '){
      event.preventDefault();
      handleTimeSlotClick(dateValue,shift);
    }
  }

  function openPicker(inputId){
    const input=$(inputId);
    if(!input)return;
    if(typeof input.showPicker==='function')input.showPicker();
    else {input.focus();input.click();}
  }

  function changeScheduleWeek(delta){
    Restogogo.router?.changeWeek?.(delta);
  }

  function changeWorkedMonth(delta){
    setWeekStartAndLoad(addMonths(data?.weekStart || new Date(), delta > 0 ? 1 : -1));
    renderApp();
  }

  function setWeek(value){if(!data||!value)return; setWeekStartAndLoad(value); renderApp();}
  function renderApp(){Restogogo.router?.render?.();}

  function bindSchedulePage(){
    const page=$('page-employee-schedule');
    page?.addEventListener('click',event=>{
      if(event.target.closest('#employeeSchedulePrevWeek')){
        event.stopPropagation();
        changeScheduleWeek(-7);
        return;
      }
      if(event.target.closest('#employeeScheduleNextWeek')){
        event.stopPropagation();
        changeScheduleWeek(7);
        return;
      }
      if(event.target.closest('#employeeScheduleWeekMetric')){
        if(!event.target.closest('button,input'))openPicker('employeeScheduleWeekStart');
        return;
      }
    });

    page?.addEventListener('change',event=>{
      if(event.target?.id==='employeeScheduleWeekStart')setWeek(event.target.value);
    });

    page?.addEventListener('keydown',event=>{
      if(event.target.closest?.('#employeeScheduleWeekMetric')){
        if(event.target.closest('button,input'))return;
        if(event.key==='Enter'||event.key===' '){event.preventDefault();openPicker('employeeScheduleWeekStart');return;}
      }
    });
  }

  function bindTimePage(){
    const page=$('page-employee-time');
    page?.addEventListener('click',event=>{
      if(event.target.closest('#employeeTimePrevMonth')){event.stopPropagation();changeWorkedMonth(-1);return;}
      if(event.target.closest('#employeeTimeNextMonth')){event.stopPropagation();changeWorkedMonth(1);return;}
      if(event.target.closest('#employeeTimeWeekMetric')){
        if(!event.target.closest('button,input'))openPicker('employeeTimeMonthStart');
        return;
      }
      const mode=event.target.closest('[data-employee-time-mode]');
      if(mode&&page.contains(mode)){
        timeMode=mode.dataset.employeeTimeMode === 'leave' ? 'leave' : 'availability';
        leaveDraft=null;
        render();
        return;
      }
      const close=event.target.closest('[data-employee-leave-cancel]');
      if(close&&page.contains(close)){leaveDraft=null;render();return;}
      const cancelRequest=event.target.closest('[data-employee-leave-cancel-request]');
      if(cancelRequest&&page.contains(cancelRequest)){cancelLeaveRequest(cancelRequest.dataset.employeeLeaveCancelRequest);return;}
      const slot=event.target.closest('[data-employee-time-slot]');
      if(slot&&page.contains(slot))handleTimeSlotClick(slot.dataset.date,slot.dataset.shift);
    });
    page?.addEventListener('submit',event=>{
      const form=event.target.closest?.('[data-employee-leave-form]');
      if(form&&page.contains(form)){event.preventDefault();submitLeaveRequest(form);}
    });
    page?.addEventListener('change',event=>{if(event.target?.id==='employeeTimeMonthStart')setWeek(event.target.value);});
    page?.addEventListener('keydown',event=>{
      if(event.target.closest?.('#employeeTimeWeekMetric')){
        if(event.target.closest('button,input'))return;
        if(event.key==='Enter'||event.key===' '){event.preventDefault();openPicker('employeeTimeMonthStart');return;}
      }
      const slot=event.target.closest?.('[data-employee-time-slot]');
      if(slot&&page.contains(slot))handleTimeSlotKey(event,slot.dataset.date,slot.dataset.shift);
    });
  }

  function bind(){
    if(bound)return;
    bound=true;
    bindSchedulePage();
    bindTimePage();
  }

  const employeeScheduleApi={render,bind,openPicker,changeScheduleWeek,changeWorkedMonth,setWeek};
  Restogogo.employeeSchedule=employeeScheduleApi;
})();
