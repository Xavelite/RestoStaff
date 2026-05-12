/*
 * restogogo employee schedule
 */

(function(){
  let bound = false;
  const Metrics = Restogogo.services.metrics;

  const lunchIcon = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4.2"></circle><path d="M12 2.8v2.4"></path><path d="M12 18.8v2.4"></path><path d="M2.8 12h2.4"></path><path d="M18.8 12h2.4"></path><path d="M5.5 5.5l1.7 1.7"></path><path d="M16.8 16.8l1.7 1.7"></path><path d="M18.5 5.5l-1.7 1.7"></path><path d="M7.2 16.8l-1.7 1.7"></path></svg>';
  const eveningIcon = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M14.7 3.2a8.9 8.9 0 1 0 6.1 15.3 7.1 7.1 0 1 1-6.1-15.3Z"></path><path d="M17.4 6.1h.01"></path></svg>';

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

  function render(){
    const root=$("employeeScheduleRoot");
    if(!root||!data)return;

    const employee=emp(session.employeeId)||activeEmployees()[0];
    if(!employee){
      root.innerHTML='<div class="employee-schedule-shell"><section class="employee-schedule-panel rs-v2-frame"><p class="employee-schedule-empty">No employee selected.</p></section></div>';
      return;
    }

    const published=data.status==='Published';
    let totalHours=0;
    let totalAvailable=0;
    let lunchCount=0;
    let eveningCount=0;

    const rows=days.map(day=>{
      const date=dateForDay(day);
      const cells=shifts.map(shift=>{
        const available=!!data.availability?.[employee.id]?.[day]?.[shift];
        const zone=data.assignments?.[employee.id]?.[day]?.[shift]||suggestZone(employee,shift)||'Unassigned';
        const range=timeRangeFor(employee,day,shift);
        const hours=available?slotHours(employee,day,shift):0;
        const timeText=displayTimeRange(range);
        const title=available?(published?timeText:'Available'):'Off';
        const detail=available?(published?`${zone} · ${fmtHours(hours)}`:`${timeText} · ${zone}`):'No shift';
        const style=available?(positionStyle(employee.position)+';'+zoneStyle(zone)):'';
        const check=(!published&&available)?'<span class="employee-schedule-shift__check" aria-hidden="true">✓</span>':'';
        const timeButton=(!published&&available)?`<button type="button" class="employee-schedule-time-button" title="Set available time" data-action="edit-time" data-day="${esc(day)}" data-shift="${esc(shift)}">Time</button>`:'';
        const shiftTone=shift==='Lunch'?'is-lunch':'is-evening';
        const shiftIcon=shift==='Lunch'?lunchIcon:eveningIcon;
        const className=['employee-schedule-shift','rs-shift-card',shiftTone,available?'is-planned':'is-off',published?'is-published':'is-draft'].join(' ');

        if(available){
          totalHours+=hours;
          totalAvailable+=1;
          if(shift==='Lunch') lunchCount+=1;
          if(shift==='Evening') eveningCount+=1;
        }

        return `<article role="button" tabindex="0" data-day="${esc(day)}" data-shift="${esc(shift)}" class="${className}" ${styleAttr(style)}><span class="employee-schedule-shift__icon" aria-hidden="true">${shiftIcon}</span><div class="employee-schedule-shift__body"><span class="employee-schedule-shift__label">${esc(shift)}</span><strong>${esc(title)}</strong><small>${esc(detail)}</small></div>${check}${timeButton}</article>`;
      }).join('');
      return `<article class="employee-schedule-row"><div class="employee-schedule-day"><strong>${esc(day.slice(0,3))}</strong><span>${esc(shortDisplayDate(date))}</span></div>${cells}</article>`;
    }).join('');

    const metrics=[
      Metrics.card({tone:'status',icon:'document',label:'Status',value:published?'Published':'Draft',meta:published?'Confirmed shifts':'Planning not final'}),
      Metrics.week({
        tag:'div',
        id:'employeeScheduleWeekMetric',
        ariaLabel:'Change week',
        prevId:'employeeSchedulePrevWeek',
        nextId:'employeeScheduleNextWeek',
        inputId:'employeeScheduleWeekStart',
        inputAriaLabel:'Select week start date',
        valueId:'employeeScheduleWeekLabel',
        value:weekDisplayRange(),
        inputValue:data.weekStart
      }),
      Metrics.card({tone:'hours',icon:'clock',label:'Hours',value:fmtHours(totalHours),meta:`${totalAvailable} shifts · Lunch ${lunchCount} · Evening ${eveningCount}`})
    ].join('');

    root.innerHTML=`<div class="employee-schedule-shell"><section aria-label="Employee weekly schedule" class="employee-schedule-panel rs-v2-frame">
      <div aria-label="Schedule summary and controls" class="employee-schedule-metrics rs-metric-grid">${metrics}</div>
      <div class="employee-schedule-board-head"><span>Day</span><strong>Lunch</strong><strong>Evening</strong></div>
      <div class="employee-schedule-grid" id="employeeScheduleGrid">${rows}</div>
    </section></div>`;
  }

  function handleSlotClick(day,shift){
    if(!session.employeeId)return;
    const employeeId=session.employeeId;

    if(data.status!=='Published'){
      const next=!data.availability?.[employeeId]?.[day]?.[shift];
      setAvailabilitySlot(employeeId,day,shift,next);
      setSubmitted(employeeId,true);
      void save({reason:'employee-schedule'});
      render();
      flashSlot(day,shift);
      return;
    }

    Restogogo.ui?.toast?.('Published schedule is read-only.',{tone:'warning',icon:'!',centered:false,timeout:1600});
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
    const employee=emp(employeeId);
    if(!employeeId||!employee)return;
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
    Restogogo.router?.changeWeek?.(delta);
  }

  function setWeek(value){
    if(!data||!value)return;
    setWeekStartAndLoad(value);
    void save({reason:'employee-schedule-week-change'});
    renderApp();
  }

  function renderApp(){
    Restogogo.router?.render?.();
  }

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

    page?.addEventListener('change',event=>{
      if(event.target?.id==='employeeScheduleWeekStart')setWeek(event.target.value);
    });

    page?.addEventListener('keydown',event=>{
      if(event.target.closest?.('#employeeScheduleWeekMetric')){
        if(event.target.closest('button,input'))return;
        if(event.key==='Enter'||event.key===' '){event.preventDefault();openPicker();return;}
      }
      const card=event.target.closest?.('.employee-schedule-shift');
      if(card&&page.contains(card))handleSlotKey(event,card.dataset.day,card.dataset.shift);
    });

  }

  const employeeScheduleApi={render,bind,openPicker,changeWeek,setWeek,editAvailabilityTime};
  Restogogo.employeeSchedule=employeeScheduleApi;
})();
