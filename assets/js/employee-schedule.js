/*
 * RestoStaff employee schedule — v202
 * -----------------------------------
 * Clean v2.3 renderer for the employee weekly schedule.
 * Loaded before app.js so the main render loop can call renderMySchedule().
 */

function renderMySchedule(){
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
      const timeButton=(!published&&available)?`<button type="button" class="employee-schedule-time-button" title="Set available time" onclick="myScheduleEditAvailabilityTime('${day}','${shift}',event)">Time</button>`:'';
      const shiftTone=shift==='Lunch'?'is-lunch':'is-evening';
      const shiftIcon=shift==='Lunch'
        ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4.2"></circle><path d="M12 2.8v2.4"></path><path d="M12 18.8v2.4"></path><path d="M2.8 12h2.4"></path><path d="M18.8 12h2.4"></path><path d="M5.5 5.5l1.7 1.7"></path><path d="M16.8 16.8l1.7 1.7"></path><path d="M18.5 5.5l-1.7 1.7"></path><path d="M7.2 16.8l-1.7 1.7"></path></svg>'
        : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M14.7 3.2a8.9 8.9 0 1 0 6.1 15.3 7.1 7.1 0 1 1-6.1-15.3Z"></path><path d="M17.4 6.1h.01"></path></svg>';
      const className=['employee-schedule-shift',shiftTone,available?'is-planned':'is-off',published?'is-published':'is-draft',zoneClass(zone)].join(' ');

      if(available){
        totalHours+=hours;
        totalAvailable+=1;
        if(shift==='Lunch') lunchCount+=1;
        if(shift==='Evening') eveningCount+=1;
      }

      return `<article role="button" tabindex="0" data-day="${day}" data-shift="${shift}" class="${className}" ${styleAttr(style)} onclick="myScheduleCellClick('${day}','${shift}')" onkeydown="myScheduleCellKey(event,'${day}','${shift}')"><span class="employee-schedule-shift__icon" aria-hidden="true">${shiftIcon}</span><div class="employee-schedule-shift__body"><span class="employee-schedule-shift__label">${esc(shift)}</span><strong>${esc(title)}</strong><small>${esc(detail)}</small></div>${check}${timeButton}${swapTag}</article>`;
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

window.myScheduleCellClick=(day,shift)=>{
  if(!session.employeeId)return;
  slotClick(session.employeeId,day,shift,'employee');
  requestAnimationFrame(()=>{
    const btn=document.querySelector(`.employee-schedule-shift[data-day="${day}"][data-shift="${shift}"]`);
    if(btn){btn.classList.add('just-tapped');setTimeout(()=>btn.classList.remove('just-tapped'),700);}
  });
};

window.myScheduleCellKey=(event,day,shift)=>{
  if(event.key==='Enter'||event.key===' '){event.preventDefault();myScheduleCellClick(day,shift);}
};

window.myScheduleEditAvailabilityTime=(day,shift,event)=>{
  if(event)event.stopPropagation();
  if(data.status==='Published')return;
  const employeeId=session.employeeId;
  const employee=emp(employeeId);
  if(!employeeId||!employee)return;
  const current=timeRangeFor(employee,day,shift);
  const value=prompt(`Availability time for ${day} ${shift}\nUse HH:MM-HH:MM. Leave empty to use the default.`, current);
  if(value===null)return;
  const raw=String(value||'').trim();
  let range='';
  if(raw){
    range=normalizeTimeRangeInput(raw);
    if(!range){alert('Use time format HH:MM-HH:MM, for example 11:00-15:00.');return;}
  }
  if(!data.availability[employeeId])data.availability[employeeId]={};
  if(!data.availability[employeeId][day])data.availability[employeeId][day]={};
  if(!data.assignments[employeeId])data.assignments[employeeId]={};
  if(!data.assignments[employeeId][day])data.assignments[employeeId][day]={};
  if(!data.assignmentTimes)data.assignmentTimes={};
  if(!data.assignmentTimes[employeeId])data.assignmentTimes[employeeId]={};
  if(!data.assignmentTimes[employeeId][day])data.assignmentTimes[employeeId][day]={};
  data.availability[employeeId][day][shift]=true;
  data.assignments[employeeId][day][shift]=data.assignments[employeeId][day][shift]||suggestZone(employee,shift);
  data.assignmentTimes[employeeId][day][shift]=range;
  data.submitted[employeeId]=true;
  save();
  render();
  requestAnimationFrame(()=>{
    const btn=document.querySelector(`.employee-schedule-shift[data-day="${day}"][data-shift="${shift}"]`);
    if(btn){btn.classList.add('just-tapped');setTimeout(()=>btn.classList.remove('just-tapped'),700);}
  });
};


window.employeeScheduleOpenPicker=()=>{
  const input=$("employeeScheduleWeekStart");
  if(!input)return;
  if(typeof input.showPicker==='function'){input.showPicker();}
  else {input.focus();input.click();}
};

window.employeeScheduleOpenPickerFromKey=(event)=>{
  if(event.key==='Enter'||event.key===' '){
    event.preventDefault();
    employeeScheduleOpenPicker();
  }
};

window.employeeScheduleChangeWeek=(delta)=>{
  if(typeof changeWeek==='function'){changeWeek(delta);}
};

window.employeeScheduleSetWeek=(value)=>{
  if(!data||!value)return;
  if(typeof saveWeekSnapshot==='function')saveWeekSnapshot();
  data.weekStart=typeof monday==='function'?monday(value):value;
  if(typeof loadWeekSnapshot==='function')loadWeekSnapshot();
  if($('weekStart'))$('weekStart').value=data.weekStart;
  save();
  render();
};
