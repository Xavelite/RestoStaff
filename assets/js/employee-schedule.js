/*
 * restogogo employee schedule
 * Employee-facing page: Schedule + Worked time.
 */

(function(){
  let bound = false;
  let activeTab = 'schedule';
  const Metrics = Restogogo.services.metrics;
  const A = () => Restogogo.logic?.actuals;

  const lunchIcon = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4.2"></circle><path d="M12 2.8v2.4"></path><path d="M12 18.8v2.4"></path><path d="M2.8 12h2.4"></path><path d="M18.8 12h2.4"></path><path d="M5.5 5.5l1.7 1.7"></path><path d="M16.8 16.8l1.7 1.7"></path><path d="M18.5 5.5l-1.7 1.7"></path><path d="M7.2 16.8l-1.7 1.7"></path></svg>';
  const eveningIcon = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M14.7 3.2a8.9 8.9 0 1 0 6.1 15.3 7.1 7.1 0 1 1-6.1-15.3Z"></path><path d="M17.4 6.1h.01"></path></svg>';

  function currentEmployee(){
    return emp(session.employeeId) || activeEmployees()[0] || null;
  }

  function flashSlot(day,shift){
    requestAnimationFrame(()=>{
      const el=document.querySelector(`.employee-schedule-shift[data-day="${day}"][data-shift="${shift}"]`);
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

  function plannedZone(employee, day, shift){
    return data?.assignments?.[employee.id]?.[day]?.[shift] || suggestZone(employee,shift) || 'Unassigned';
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

  function renderMetrics(employee){
    const stats=employeeWeekStats(employee);
    const status=data.status==='Published'?'Published':'Draft';
    return [
      Metrics.card({tone:'status',icon:'document',label:activeTab==='worked'?'My time':'My schedule',value:status,meta:activeTab==='schedule'?'Tap empty slots to set availability':'Monthly recap'}),
      Metrics.week({
        tag:'div',
        id:'employeeScheduleWeekMetric',
        ariaLabel:'Change week',
        prevId:'employeeSchedulePrevWeek',
        nextId:'employeeScheduleNextWeek',
        inputId:'employeeScheduleWeekStart',
        inputAriaLabel:'Select week start date',
        valueId:'employeeScheduleWeekLabel',
        value:activeTab==='worked'?monthLabel():weekDisplayRange(),
        inputValue:data.weekStart
      }),
      Metrics.card({tone:'hours',icon:'clock',label:activeTab==='worked'?'Worked time':'Planned hours',value:activeTab==='worked'?fmtHours(stats.workedHours):fmtHours(stats.plannedHours),meta:activeTab==='worked'?`${stats.workedDays} worked days · ${stats.openBadges} live`:`${stats.plannedSlots} planned · ${stats.availableSlots} available`}),
      Metrics.card({tone:'cost',icon:'check',label:'Next shift',value:stats.plannedSlots?String(stats.plannedSlots):'0',meta:nextPlannedShift(employee)})
    ].join('');
  }

  function setView(view){
    activeTab = view === 'worked' ? 'worked' : 'schedule';
    if(typeof session === 'object' && session) session.employeeView = activeTab;
  }

  function activeView(){
    return activeTab;
  }

  function renderScheduleSlot(employee, day, shift){
    const planned=isSlotPlanned(employee,day,shift);
    const available=isSlotAvailable(employee,day,shift);
    const zone=plannedZone(employee,day,shift);
    const range=slotRange(employee,day,shift);
    const timeText=displayTimeRange(range);
    let title='Not available';
    let detail='—';
    let stateClass='is-off';

    if(planned){
      title=timeText || 'Planned';
      detail=`${zone} · ${fmtHours(hoursFromRange(range))}`;
      stateClass='is-planned is-published';
    }else if(available){
      title='Available';
      detail=timeText || 'Waiting for planning';
      stateClass='is-available';
    }

    const className=['employee-schedule-shift',shift==='Lunch'?'is-lunch':'is-evening',stateClass].join(' ');
    return `<article role="button" tabindex="0" data-day="${esc(day)}" data-shift="${esc(shift)}" class="${className}"><span class="employee-schedule-shift__dot" aria-hidden="true"></span><div class="employee-schedule-shift__body"><strong>${esc(title)}</strong><small>${esc(detail)}</small></div></article>`;
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
    return isoDate(base);
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
    const week=monday(isoDate(date));
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

  function dayActualSummary(employee, day){
    const entries=shifts.map(shift=>({shift,entry:A()?.entry?.(employee.id,day,shift,data) || getActualEntry(employee.id,day,shift,data)})).filter(item=>item.entry?.clockIn || item.entry?.clockOut);
    let total=0;
    let live=false;
    entries.forEach(item=>{
      if(item.entry.clockIn && !item.entry.clockOut)live=true;
      total += A()?.actualHoursFor?.(employee,day,item.shift,data) || hoursFromRange(item.entry.clockIn && item.entry.clockOut ? `${item.entry.clockIn}-${item.entry.clockOut}` : '');
    });
    return {entries,total,live};
  }

  function renderWorkedDate(employee, date){
    const base=new Date(validDate(data?.weekStart) || new Date());
    const inMonth=date.getMonth()===base.getMonth();
    let total=0;
    let live=false;
    const rows=shifts.map(shift=>{
      const entry=actualEntryForDate(employee,date,shift);
      const planned=plannedForDate(employee,date,shift);
      const plannedText=planned ? displayTimeRange(rangeForDate(employee,date,shift)) : '';
      const actualText=entry.clockIn ? `${entry.clockIn}–${entry.clockOut || 'live'}` : '—';
      if(entry.clockIn && !entry.clockOut)live=true;
      total += A()?.actualHoursFor?.(employee,days[(date.getDay()+6)%7],shift,weekPayloadForDate(date)||data) || hoursFromRange(entry.clockIn && entry.clockOut ? `${entry.clockIn}-${entry.clockOut}` : '');
      const tone=entry.clockIn && !entry.clockOut ? 'is-live' : entry.clockIn ? 'is-done' : planned ? 'is-pending' : 'is-empty';
      return `<div class="employee-worked-slot ${tone}"><span>${esc(shift)}</span><strong>${esc(actualText)}</strong><small>${esc(plannedText ? `Planned ${plannedText}` : 'No planned shift')}</small></div>`;
    }).join('');
    return `<article class="employee-worked-day rs-card ${inMonth?'':'is-outside'} ${live?'is-live':''}"><header><div><strong>${date.getDate()}</strong><span>${esc(date.toLocaleDateString(undefined,{weekday:'short'}))}</span></div><b>${esc(fmtHours(total))}</b></header><div class="employee-worked-slots">${rows}</div></article>`;
  }

  function renderWorked(employee){
    const rows=monthDates().map(date=>renderWorkedDate(employee,date)).join('');
    return `<section class="employee-schedule-tab-panel ops-tab-panel is-worked"><div class="employee-worked-month-head"><strong>${esc(monthLabel())}</strong><span>Calendar view of your badge time</span></div><div class="employee-worked-weekdays"><span>Mon</span><span>Tue</span><span>Wed</span><span>Thu</span><span>Fri</span><span>Sat</span><span>Sun</span></div><div class="employee-worked-calendar">${rows}</div></section>`;
  }

  function render(){
    const root=$("employeeScheduleRoot");
    if(!root||!data)return;
    activeTab = session.employeeView === 'worked' ? 'worked' : 'schedule';

    const employee=currentEmployee();
    if(!employee){
      root.innerHTML='<div class="employee-schedule-shell"><section class="employee-schedule-panel rs-v2-frame"><p class="employee-schedule-empty">No employee selected.</p></section></div>';
      return;
    }

    root.innerHTML=`<div class="employee-schedule-shell"><section aria-label="Employee weekly schedule" class="employee-schedule-panel rs-v2-frame">
      <div aria-label="Schedule summary and controls" class="employee-schedule-metrics rs-weekly-metrics">${renderMetrics(employee)}</div>
      ${activeTab==='worked'?renderWorked(employee):renderSchedule(employee)}
    </section></div>`;
  }

  function handleSlotClick(day,shift){
    if(activeTab!=='schedule')return;
    if(!session.employeeId)return;
    const employee=currentEmployee();
    if(!employee)return;
    if(isSlotPlanned(employee,day,shift)){
      Restogogo.ui?.toast?.('This shift is already planned.',{tone:'success',icon:'✓',centered:false,timeout:1500});
      return;
    }
    if(data.status==='Published'){
      Restogogo.ui?.toast?.('Published schedule is read-only.',{tone:'warning',icon:'!',centered:false,timeout:1600});
      return;
    }

    const employeeId=session.employeeId;
    const next=!data.availability?.[employeeId]?.[day]?.[shift];
    setAvailabilitySlot(employeeId,day,shift,next);
    setSubmitted(employeeId,true);
    void save({reason:'employee-schedule'});
    render();
    flashSlot(day,shift);
  }

  function handleSlotKey(event,day,shift){
    if(event.key==='Enter'||event.key===' '){
      event.preventDefault();
      handleSlotClick(day,shift);
    }
  }

  async function editAvailabilityTime(day,shift,event){
    event?.stopPropagation?.();
    if(data.status==='Published')return;
    const employeeId=session.employeeId;
    const employee=currentEmployee();
    if(!employeeId||!employee)return;
    if(isSlotPlanned(employee,day,shift))return;
    const current=timeRangeFor(employee,day,shift);
    const value=await Restogogo.ui?.prompt?.({
      title:`${day} ${shift}`,
      message:'Set your available time. Leave empty to use the restaurant opening-hours setup for this slot.',
      label:'Available time',
      defaultValue:displayTimeRange(current),
      placeholder:'11:00-15:00',
      confirmText:'Save time',
      cancelText:'Cancel',
      icon:'⏱'
    });
    if(value===null||typeof value==='undefined')return;
    const raw=String(value||'').trim();
    let range='';
    if(raw){
      range=normalizeTimeRangeInput(raw);
      if(!range){
        await Restogogo.ui?.alert?.({title:'Invalid time',message:'Use time format HH:MM-HH:MM, for example 11:00-15:00.',confirmText:'OK',icon:'!',tone:'danger'});
        return;
      }
    }
    setAvailabilitySlot(employeeId,day,shift,true);
    if(!data.assignments?.[employeeId]?.[day]?.[shift])setAssignmentSlot(employeeId,day,shift,suggestZone(employee,shift));
    setAssignmentTimeSlot(employeeId,day,shift,range);
    setSubmitted(employeeId,true);
    void save({reason:'employee-schedule'});
    render();
    flashSlot(day,shift);
    Restogogo.ui?.toast?.('Availability time updated.',{tone:'success',icon:'✓',centered:false,timeout:1600});
  }

  function openPicker(){
    const input=$("employeeScheduleWeekStart");
    if(!input)return;
    if(typeof input.showPicker==='function')input.showPicker();
    else {input.focus();input.click();}
  }

  function changeWeek(delta){
    if(activeTab==='worked'){
      setWeekStartAndLoad(addMonths(data?.weekStart || new Date(), delta > 0 ? 1 : -1));
      renderApp();
      return;
    }
    Restogogo.router?.changeWeek?.(delta);
  }
  function setWeek(value){if(!data||!value)return; setWeekStartAndLoad(value); renderApp();}
  function renderApp(){Restogogo.router?.render?.();}

  function bind(){
    if(bound)return;
    bound=true;
    const page=$('page-employee-schedule');

    page?.addEventListener('click',event=>{
      if(event.target.closest('#employeeSchedulePrevWeek')){event.stopPropagation();changeWeek(-7);return;}
      if(event.target.closest('#employeeScheduleNextWeek')){event.stopPropagation();changeWeek(7);return;}
      if(event.target.closest('#employeeScheduleWeekMetric')){
        if(!event.target.closest('button,input'))openPicker();
        return;
      }
      const timeButton=event.target.closest('.employee-schedule-time-button');
      if(timeButton&&page.contains(timeButton)){
        editAvailabilityTime(timeButton.dataset.day,timeButton.dataset.shift,event);
        return;
      }
      const card=event.target.closest('.employee-schedule-shift');
      if(card&&page.contains(card))handleSlotClick(card.dataset.day,card.dataset.shift);
    });

    page?.addEventListener('change',event=>{if(event.target?.id==='employeeScheduleWeekStart')setWeek(event.target.value);});

    page?.addEventListener('keydown',event=>{
      if(event.target.closest?.('#employeeScheduleWeekMetric')){
        if(event.target.closest('button,input'))return;
        if(event.key==='Enter'||event.key===' '){event.preventDefault();openPicker();return;}
      }
      const card=event.target.closest?.('.employee-schedule-shift');
      if(card&&page.contains(card))handleSlotKey(event,card.dataset.day,card.dataset.shift);
    });
  }

  const employeeScheduleApi={render,bind,openPicker,changeWeek,setWeek,editAvailabilityTime,setView,activeView};
  Restogogo.employeeSchedule=employeeScheduleApi;
})();
