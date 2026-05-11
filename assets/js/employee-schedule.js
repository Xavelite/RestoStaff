/*
 * restogogo employee schedule
 */

(function(){
  let pendingSwap = null;
  let bound = false;

  const lunchIcon = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4.2"></circle><path d="M12 2.8v2.4"></path><path d="M12 18.8v2.4"></path><path d="M2.8 12h2.4"></path><path d="M18.8 12h2.4"></path><path d="M5.5 5.5l1.7 1.7"></path><path d="M16.8 16.8l1.7 1.7"></path><path d="M18.5 5.5l-1.7 1.7"></path><path d="M7.2 16.8l-1.7 1.7"></path></svg>';
  const eveningIcon = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M14.7 3.2a8.9 8.9 0 1 0 6.1 15.3 7.1 7.1 0 1 1-6.1-15.3Z"></path><path d="M17.4 6.1h.01"></path></svg>';

  function ensureEmployeeSlot(employeeId,day,shift){
    data.availability = data.availability || {};
    data.assignments = data.assignments || {};
    data.assignmentTimes = data.assignmentTimes || {};
    data.submitted = data.submitted || {};
    data.availability[employeeId] = data.availability[employeeId] || {};
    data.availability[employeeId][day] = data.availability[employeeId][day] || {};
    data.assignments[employeeId] = data.assignments[employeeId] || {};
    data.assignments[employeeId][day] = data.assignments[employeeId][day] || {};
    data.assignmentTimes[employeeId] = data.assignmentTimes[employeeId] || {};
    data.assignmentTimes[employeeId][day] = data.assignmentTimes[employeeId][day] || {};
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

  function render(){
    const root=$("myScheduleGrid");
    if(!root||!data)return;

    const employee=emp(session.employeeId)||activeEmployees()[0];
    if(!employee){
      root.innerHTML='<p class="employee-schedule-empty">No employee selected.</p>';
      return;
    }

    if($("myScheduleWeekMeta"))myScheduleWeekMeta.textContent=weekDisplayRange();
    if($("employeeScheduleWeekStart"))employeeScheduleWeekStart.value=data.weekStart||'';

    const published=data.status==='Published';
    let totalHours=0;
    let totalAvailable=0;
    let lunchCount=0;
    let eveningCount=0;

    root.innerHTML=days.map(day=>{
      const date=dateForDay(day);
      const cells=shifts.map(shift=>{
        const available=!!data.availability?.[employee.id]?.[day]?.[shift];
        const zone=data.assignments?.[employee.id]?.[day]?.[shift]||suggestZone(employee,shift)||'Unassigned';
        const range=timeRangeFor(employee,day,shift);
        const hours=available?slotHours(employee,day,shift):0;
        const swap=swapFor(employee.id,day,shift);
        const timeText=displayTimeRange(range);
        const title=available?(published?timeText:'Available'):'Off';
        const detail=available?(published?`${zone} · ${fmtHours(hours)}`:`${timeText} · ${zone}`):'No shift';
        const swapTag=swap?`<span class="employee-schedule-shift__tag">${esc(swap.status)}</span>`:'';
        const style=available?(positionStyle(employee.position)+';'+zoneStyle(zone)):'';
        const check=(!published&&available)?'<span class="employee-schedule-shift__check" aria-hidden="true">✓</span>':'';
        const timeButton=(!published&&available)?`<button type="button" class="employee-schedule-time-button" title="Set available time" data-action="edit-time" data-day="${esc(day)}" data-shift="${esc(shift)}">Time</button>`:'';
        const shiftTone=shift==='Lunch'?'is-lunch':'is-evening';
        const shiftIcon=shift==='Lunch'?lunchIcon:eveningIcon;
        const className=['employee-schedule-shift','rs-shift-card',shiftTone,available?'is-planned':'is-off',published?'is-published':'is-draft',zoneClass(zone)].join(' ');

        if(available){
          totalHours+=hours;
          totalAvailable+=1;
          if(shift==='Lunch') lunchCount+=1;
          if(shift==='Evening') eveningCount+=1;
        }

        return `<article role="button" tabindex="0" data-day="${esc(day)}" data-shift="${esc(shift)}" class="${className}" ${styleAttr(style)}><span class="employee-schedule-shift__icon" aria-hidden="true">${shiftIcon}</span><div class="employee-schedule-shift__body"><span class="employee-schedule-shift__label">${esc(shift)}</span><strong>${esc(title)}</strong><small>${esc(detail)}</small></div>${check}${timeButton}${swapTag}</article>`;
      }).join('');
      return `<article class="employee-schedule-row"><div class="employee-schedule-day"><strong>${esc(day.slice(0,3))}</strong><span>${esc(shortDisplayDate(date))}</span></div>${cells}</article>`;
    }).join('');

    const summaryStatus=$("myScheduleSummaryStatus");
    const summaryStatusMeta=$("myScheduleSummaryStatusMeta");
    const summaryHours=$("myScheduleSummaryHours");
    const summaryHoursMeta=$("myScheduleSummaryHoursMeta");

    if(summaryStatus) summaryStatus.textContent=published?'Published':'Draft';
    if(summaryStatusMeta) summaryStatusMeta.textContent=published?'Confirmed shifts':'Planning not final';
    if(summaryHours) summaryHours.textContent=fmtHours(totalHours);
    if(summaryHoursMeta) summaryHoursMeta.textContent=`${totalAvailable} shifts · Lunch ${lunchCount} · Evening ${eveningCount}`;
  }

  function handleSlotClick(day,shift){
    if(!session.employeeId)return;
    const employeeId=session.employeeId;

    if(data.status!=='Published'){
      ensureEmployeeSlot(employeeId,day,shift);
      data.availability[employeeId][day][shift]=!data.availability[employeeId][day][shift];
      data.submitted[employeeId]=true;
      save();
      render();
      flashSlot(day,shift);
      return;
    }

    const planned=data.planning?.[employeeId]?.[day]?.[shift];
    if(planned)openSwapFlow(employeeId,day,shift);
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
    const value=await window.RestogogoUI?.prompt?.({
      title:`${day} ${shift}`,
      message:'Set your available time. Leave empty to use the default time for this slot.',
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
        await window.RestogogoUI?.alert?.({title:'Invalid time',message:'Use time format HH:MM-HH:MM, for example 11:00-15:00.',confirmText:'OK',icon:'!',tone:'danger'});
        return;
      }
    }
    ensureEmployeeSlot(employeeId,day,shift);
    data.availability[employeeId][day][shift]=true;
    data.assignments[employeeId][day][shift]=data.assignments[employeeId][day][shift]||suggestZone(employee,shift);
    data.assignmentTimes[employeeId][day][shift]=range;
    data.submitted[employeeId]=true;
    save();
    render();
    flashSlot(day,shift);
    window.RestogogoUI?.toast?.('Availability time updated.',{tone:'success',icon:'✓',centered:false,timeout:1600});
  }

  function openPicker(){
    const input=$("employeeScheduleWeekStart");
    if(!input)return;
    if(typeof input.showPicker==='function')input.showPicker();
    else {input.focus();input.click();}
  }

  function changeWeek(delta){
    window.RestogogoApp?.changeWeek?.(delta);
  }

  function setWeek(value){
    if(!data||!value)return;
    window.RestogogoApp?.saveWeekSnapshot?.();
    data.weekStart=typeof monday==='function'?monday(value):value;
    window.RestogogoApp?.loadWeekSnapshot?.();
    if($('weekStart'))$('weekStart').value=data.weekStart;
    save();
    renderApp();
  }

  function renderApp(){
    window.RestogogoApp?.render?.();
  }

  function openSwapFlow(employeeId,day,shift){
    pendingSwap={type:employeeId===session.employeeId?'offer':'request',id:employeeId,day,shift};
    const dialog=$('swapDialog');
    if(!dialog)return;
    if($('swapTitle'))swapTitle.textContent=employeeId===session.employeeId?'Offer shift':'Request shift';
    if($('swapBody'))swapBody.textContent=`${day} ${shift} · ${emp(employeeId)?.name||'Employee'}`;
    if($('confirmSwap'))confirmSwap.textContent='Send request';
    if($('swapNote'))swapNote.value='';
    dialog.showModal?.();
  }

  function confirmSwap(){
    if(!pendingSwap)return;
    const swap=pendingSwap;
    const note=String($('swapNote')?.value||'').trim();
    data.swaps=data.swaps||[];
    data.swaps.push({
      id:id(),
      from:swap.id,
      to:swap.type==='request'?session.employeeId:'',
      day:swap.day,
      shift:swap.shift,
      note,
      status:swap.type==='request'?'Employee approval':'Waiting'
    });
    addNotification('swap-'+Date.now(),'yellow','Swap request created',`${swap.day} ${swap.shift}`,{kind:'swap'});
    pendingSwap=null;
    $('swapDialog')?.close?.();
    save();
    renderApp();
  }

  function bind(){
    if(bound)return;
    bound=true;
    const on=(idValue,event,handler)=>{$(idValue)?.addEventListener(event,handler);};

    on('employeeSchedulePrevWeek','click',event=>{event.stopPropagation();changeWeek(-7);});
    on('employeeScheduleNextWeek','click',event=>{event.stopPropagation();changeWeek(7);});
    on('employeeScheduleWeekStart','change',event=>setWeek(event.target.value));
    on('employeeScheduleWeekMetric','click',event=>{
      if(event.target.closest('button,input'))return;
      openPicker();
    });
    on('employeeScheduleWeekMetric','keydown',event=>{
      if(event.target.closest('button,input'))return;
      if(event.key==='Enter'||event.key===' '){event.preventDefault();openPicker();}
    });

    const grid=$('myScheduleGrid');
    grid?.addEventListener('click',event=>{
      const timeButton=event.target.closest('.employee-schedule-time-button');
      if(timeButton&&grid.contains(timeButton)){
        editAvailabilityTime(timeButton.dataset.day,timeButton.dataset.shift,event);
        return;
      }
      const card=event.target.closest('.employee-schedule-shift');
      if(card&&grid.contains(card))handleSlotClick(card.dataset.day,card.dataset.shift);
    });
    grid?.addEventListener('keydown',event=>{
      const card=event.target.closest('.employee-schedule-shift');
      if(card&&grid.contains(card))handleSlotKey(event,card.dataset.day,card.dataset.shift);
    });

    on('confirmSwap','click',confirmSwap);
    on('cancelSwap','click',()=>{$('swapDialog')?.close?.();pendingSwap=null;});
  }

  window.EmployeeSchedule={render,bind,openPicker,changeWeek,setWeek,editAvailabilityTime};
})();
