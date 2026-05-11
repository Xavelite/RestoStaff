/*
 * restogogo actual timesheet v2
 * Manager-facing weekly actuals grid. The grid/metric shell is shared with Planning;
 * this file only owns actual-specific data, slot states and interactions.
 */
(function(){
  let bound=false;
  let search='';
  let roleFilter='all';
  let employeeScope='relevant';
  let statusFilter='all';

  function actualEntry(employeeId,day,shift){
    return data.actualEntries?.[employeeId]?.[day]?.[shift]||{};
  }

  function actualRange(actual){
    return actual.clockIn && actual.clockOut ? `${actual.clockIn}-${actual.clockOut}` : '';
  }

  function plannedRangeFor(employee,day,shift){
    return isPlanned(employee.id,day,shift) ? timeRangeFor(employee,day,shift) : '';
  }

  function varianceMinutes(actual,plannedRange){
    if(!actualRange(actual)||!plannedRange)return 0;
    return Math.round((hoursFromRange(actualRange(actual))-hoursFromRange(plannedRange))*60);
  }

  function compactVariance(minutes){
    if(!minutes)return 'On time';
    const sign=minutes>0?'+':'-';
    const abs=Math.abs(minutes);
    const h=Math.floor(abs/60);
    const m=abs%60;
    return h ? `${sign}${h}h${String(m).padStart(2,'0')}` : `${sign}${m} min`;
  }

  function slotState(employee,day,shift){
    const planned=isPlanned(employee.id,day,shift);
    const actual=actualEntry(employee.id,day,shift);
    const plannedRange=plannedRangeFor(employee,day,shift);
    if(actual.clockIn && !actual.clockOut)return 'live';
    if(actual.clockIn && actual.clockOut){
      if(!planned)return 'unplanned';
      const variance=varianceMinutes(actual,plannedRange);
      if(Math.abs(variance)<=15)return 'on-time';
      return 'variance';
    }
    if(planned)return 'planned-empty';
    return 'empty';
  }

  function slotTone(state){
    if(state==='on-time'||state==='live')return 'good';
    if(state==='variance'||state==='unplanned')return 'warn';
    if(state==='planned-empty')return 'pending';
    return 'empty';
  }

  function slotStatus(employee,day,shift){
    const actual=actualEntry(employee.id,day,shift);
    const state=slotState(employee,day,shift);
    const plannedRange=plannedRangeFor(employee,day,shift);
    if(state==='live')return 'LIVE';
    if(state==='on-time'||state==='variance')return compactVariance(varianceMinutes(actual,plannedRange));
    if(state==='unplanned')return 'Unplanned';
    return '';
  }

  function slotMainTime(employee,day,shift){
    const actual=actualEntry(employee.id,day,shift);
    if(actual.clockIn && actual.clockOut)return displayTimeRange(actualRange(actual));
    if(actual.clockIn)return `${actual.clockIn}–…`;
    return '—';
  }

  function actualHoursFor(employee,day,shift){
    return hoursFromRange(actualRange(actualEntry(employee.id,day,shift)));
  }

  function plannedHoursFor(employee,day,shift){
    const range=plannedRangeFor(employee,day,shift);
    return range ? hoursFromRange(range) : 0;
  }

  function employeeHasActual(employee){
    return days.some(day=>shifts.some(shift=>{
      const entry=actualEntry(employee.id,day,shift);
      return !!(entry.clockIn||entry.clockOut||entry.clockInPhoto||entry.clockOutPhoto);
    }));
  }

  function employeeHasPlanning(employee){
    return days.some(day=>shifts.some(shift=>isPlanned(employee.id,day,shift)));
  }

  function isRelevantEmployee(employee){
    return employeeHasPlanning(employee)||employeeHasActual(employee);
  }

  function relevantEmployees(){
    return activeEmployees().filter(isRelevantEmployee);
  }

  function visibleEmployees(){
    const q=search.trim().toLowerCase();
    return activeEmployees().filter(employee=>{
      if(employeeScope==='relevant' && !isRelevantEmployee(employee))return false;
      if(roleFilter!=='all' && employee.position!==roleFilter)return false;
      if(q && !`${employee.name} ${employee.position}`.toLowerCase().includes(q))return false;
      if(statusFilter==='all')return true;
      return days.some(day=>shifts.some(shift=>{
        const state=slotState(employee,day,shift);
        if(statusFilter==='issue')return state==='live';
        return state===statusFilter;
      }));
    });
  }

  function totalsForEmployee(employee){
    let actual=0;
    let planned=0;
    let badged=0;
    days.forEach(day=>shifts.forEach(shift=>{
      const entry=actualEntry(employee.id,day,shift);
      actual+=actualHoursFor(employee,day,shift);
      planned+=plannedHoursFor(employee,day,shift);
      if(entry.clockIn)badged++;
    }));
    return {actual,planned,badged,variance:actual-planned};
  }

  function weekTotals(employees=activeEmployees()){
    let actual=0;
    let planned=0;
    let open=0;
    let badged=0;
    employees.forEach(employee=>days.forEach(day=>shifts.forEach(shift=>{
      const entry=actualEntry(employee.id,day,shift);
      actual+=actualHoursFor(employee,day,shift);
      planned+=plannedHoursFor(employee,day,shift);
      if(entry.clockIn)badged++;
      if(entry.clockIn && !entry.clockOut)open++;
    })));
    return {actual,planned,variance:actual-planned,open,badged};
  }

  function actualDayTotals(employees){
    const dayTotals={};
    const dayPeople={};
    days.forEach(day=>{dayTotals[day]=0; dayPeople[day]=new Set();});
    employees.forEach(employee=>days.forEach(day=>shifts.forEach(shift=>{
      const entry=actualEntry(employee.id,day,shift);
      const hours=actualHoursFor(employee,day,shift);
      dayTotals[day]+=hours;
      if(entry.clockIn)dayPeople[day].add(employee.id);
    })));
    return {dayTotals,dayPeople,grand:days.reduce((sum,day)=>sum+dayTotals[day],0)};
  }

  function photoIconSvg(){
    return '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M8.5 7.5 10 5h4l1.5 2.5H18a2 2 0 0 1 2 2V17a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V9.5a2 2 0 0 1 2-2h2.5Z"></path><circle cx="12" cy="13" r="3"></circle></svg>';
  }

  function metricIcon(name){
    const paths={
      calendar:'<rect height="14" rx="2.5" width="16" x="4" y="5.5"></rect><path d="M8 3.5v4M16 3.5v4M4 9.5h16"></path>',
      clock:'<circle cx="12" cy="12" r="8.5"></circle><path d="M12 7v5l3 2"></path>',
      open:'<circle cx="12" cy="12" r="8"></circle><path d="M12 8v5"></path><path d="M12 16h.01"></path>',
      variance:'<path d="M4 14l4-4 4 4 7-7"></path><path d="M4 20h16"></path>'
    };
    return `<svg fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8" viewBox="0 0 24 24">${paths[name]||''}</svg>`;
  }

  function renderMetrics(){
    const root=$('actualTimesheetMetrics');
    if(!root)return;
    const totals=weekTotals();
    root.innerHTML=`
      <article aria-label="Change actuals week" class="actual-timesheet-metric-card rs-metric-card is-week rs-week-metric" id="actualWeekMetric" role="button" tabindex="0">
        <button aria-label="Previous week" class="actual-week-btn rs-week-btn" id="actualPrevWeek" type="button">←</button>
        <span aria-hidden="true" class="actual-timesheet-metric-icon rs-icon-badge">${metricIcon('calendar')}</span>
        <label aria-label="Select actuals week" class="actual-week-field rs-week-field">
          <span>Week range</span>
          <strong id="actualWeekLabel">${esc(weekDisplayRange())}</strong>
          <small>Click to change</small>
          <input id="actualWeekStart" type="date" value="${esc(data.weekStart)}" />
        </label>
        <button aria-label="Next week" class="actual-week-btn rs-week-btn" id="actualNextWeek" type="button">→</button>
      </article>
      <article class="actual-timesheet-metric-card rs-metric-card is-hours">
        <span class="actual-timesheet-metric-icon rs-icon-badge">${metricIcon('clock')}</span>
        <div class="rs-metric-copy"><span>Actual hours</span><strong>${esc(fmtHours(totals.actual))}</strong><small>${totals.badged} badged shifts</small></div>
      </article>
      <article class="actual-timesheet-metric-card rs-metric-card is-status">
        <span class="actual-timesheet-metric-icon rs-icon-badge">${metricIcon('open')}</span>
        <div class="rs-metric-copy"><span>Missing clock-outs</span><strong>${totals.open}</strong><small>${totals.open===1?'employee to review':'employees to review'}</small></div>
      </article>
      <article class="actual-timesheet-metric-card rs-metric-card is-cost">
        <span class="actual-timesheet-metric-icon rs-icon-badge">${metricIcon('variance')}</span>
        <div class="rs-metric-copy"><span>Variance</span><strong>${esc(fmtHours(totals.variance))}</strong><small>vs ${esc(fmtHours(totals.planned))}</small></div>
      </article>`;
  }

  function filterOption(group,label,value,current){
    const selected=value===current;
    return `<button type="button" class="rs-filter-option${selected?' is-selected':''}" data-actual-filter="${esc(group)}" data-actual-value="${esc(value)}"><span>${esc(label)}</span>${selected?'<span class="rs-filter-check">✓</span>':''}</button>`;
  }

  function terminalButton(){
    return `<button type="button" class="rs-control-button rs-terminal-launch" data-launch-time-clock aria-label="Open badge terminal" title="Open badge terminal in a new window"><svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect x="5" y="4" width="14" height="16" rx="3"></rect><path d="M9 8h6M9 12h6M10 16h4"></path></svg><span>Badge terminal</span></button>`;
  }

  function renderToolbar(employees){
    const scopeOptions=[filterOption('scope','Relevant only','relevant',employeeScope),filterOption('scope','All employees','all',employeeScope)].join('');
    const roleOptions=[filterOption('role','All roles','all',roleFilter)].concat(positions.map(role=>filterOption('role',role,role,roleFilter))).join('');
    const statusOptions=[['All statuses','all'],['On time','on-time'],['Variance','variance'],['Live / open','issue'],['Planned only','planned-empty']].map(([label,value])=>filterOption('status',label,value,statusFilter)).join('');
    const totals=weekTotals(employees);
    const relevantCount=relevantEmployees().length;
    const totalCount=activeEmployees().length;
    const countLabel=employeeScope==='relevant' ? `${employees.length} shown / ${relevantCount} relevant / ${totalCount} total` : `${employees.length} shown / ${totalCount} total`;
    return `<div class="rs-grid-toolbar actual-grid-toolbar">
      <div class="rs-grid-toolbar__title"><strong>Employees</strong><span>${esc(countLabel)} · ${totals.badged} badged</span></div>
      <div class="rs-grid-toolbar__controls">
        <label class="rs-control rs-search-control" aria-label="Search employees"><svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="11" cy="11" r="6"></circle><path d="m16 16 4 4"></path></svg><input id="actualSearch" value="${esc(search)}" placeholder="Search" /></label>
        <details class="rs-filter-menu actual-filter-menu"><summary class="rs-control-button"><span>Filters</span><svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="m6 9 6 6 6-6"></path></svg></summary><div class="rs-filter-menu__panel"><div class="rs-filter-group"><span class="rs-filter-label">Employees</span><div class="rs-filter-options">${scopeOptions}</div></div><div class="rs-filter-group"><span class="rs-filter-label">Status</span><div class="rs-filter-options">${statusOptions}</div></div><div class="rs-filter-group"><span class="rs-filter-label">Role</span><div class="rs-filter-options">${roleOptions}</div></div></div></details>
        ${terminalButton()}
        <details class="rs-actions-menu actual-actions"><summary class="rs-control-button rs-icon-button" aria-label="Actuals actions"><svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="12" cy="12" r="1.8"></circle><circle cx="19" cy="12" r="1.8"></circle><circle cx="5" cy="12" r="1.8"></circle></svg></summary><div class="rs-actions-menu__panel"><button type="button" data-actual-action="demo">Generate demo actuals</button><button type="button" data-actual-action="clear">Clear actuals</button></div></details>
      </div>
    </div>`;
  }

  function proofAvailable(actual){
    return !!(actual?.clockInPhoto || actual?.clockOutPhoto || actual?.clockInPhotoStatus || actual?.clockOutPhotoStatus);
  }

  function actualCard(employee,day,shift){
    const planned=isPlanned(employee.id,day,shift);
    const actual=actualEntry(employee.id,day,shift);
    const state=slotState(employee,day,shift);
    const tone=slotTone(state);
    const zone=data.assignments?.[employee.id]?.[day]?.[shift] || (planned?suggestZone(employee,shift):'');
    if(state==='empty')return '<div class="actual-slot-empty rs-weekly-slot" aria-hidden="true"></div>';
    const plannedLine=planned ? displayTimeRange(plannedRangeFor(employee,day,shift)) : '';
    const status=slotStatus(employee,day,shift);
    const proof=proofAvailable(actual);
    const proofAttrs=proof?` data-actual-proof="1" data-employee-id="${esc(employee.id)}" data-day="${esc(day)}" data-shift="${esc(shift)}"`:'';
    return `<article class="actual-slot-card rs-shift-card rs-weekly-slot is-${tone}${proof?' has-proof':''}"${proofAttrs} title="${esc(`${employee.name} · ${day} ${shift}${proof?' · photo proof':''}`)}">
      <strong>${esc(slotMainTime(employee,day,shift))}</strong>
      ${plannedLine?`<small>${esc(plannedLine)}</small>`:'<small></small>'}
      <em>${esc(zone||'—')}</em>
      ${status?`<b>${esc(status)}</b>`:'<b></b>'}
      ${proof?`<span class="actual-proof-dot" aria-label="Photo proof available">${photoIconSvg()}</span>`:''}
    </article>`;
  }

  function renderEmployeeRow(employee){
    const totals=totalsForEmployee(employee);
    const diff=totals.variance ? fmtHours(totals.variance) : '';
    return `<tr class="actual-row calendar-row">
      <th class="actual-employee rs-weekly-person-cell"><div class="actual-person-card rs-weekly-person-card"><span class="actual-avatar rs-weekly-avatar" style="${positionStyle(employee.position)}">${esc(employeeInitials(employee.name))}</span><span class="actual-person-copy rs-weekly-person-copy"><strong>${esc(employee.name)}</strong><small>${esc(employee.position)}</small></span></div></th>
      ${days.map((day,di)=>`<td class="actual-day-cell rs-weekly-day-cell ${di%2?'day-alt':'day-base'}"><div class="actual-day-slots rs-weekly-day-slots">${shifts.map(shift=>actualCard(employee,day,shift)).join('')}</div></td>`).join('')}
      <td class="actual-total rs-weekly-total-cell"><div class="actual-total-value rs-weekly-total-value"><strong>${esc(fmtHours(totals.actual))}</strong><small>${esc(fmtHours(totals.planned))}</small>${diff?`<b>${esc(diff)}</b>`:'<b></b>'}</div></td>
    </tr>`;
  }

  function renderDayHeader(day,di,totals){
    return `<th class="actual-day-head rs-weekly-day-head ${di%2?'day-alt':'day-base'}"><div class="actual-day-head-copy rs-weekly-day-head-copy"><strong>${esc(day.slice(0,3))}</strong><span>${esc(dateForDay(day))}</span><small>${esc(fmtHours(totals.dayTotals[day]))} · ${esc(fmtPeople(totals.dayPeople[day].size))}</small></div></th>`;
  }

  function renderBoard(){
    const root=$('actualTimesheetRoot');
    if(!root)return;
    const employees=visibleEmployees();
    const totals=actualDayTotals(employees);
    const headers=days.map((day,di)=>renderDayHeader(day,di,totals)).join('');
    const colgroup=`<colgroup><col class="actual-person-col rs-weekly-person-col">${days.map(()=>'<col class="actual-day-col rs-weekly-day-col">').join('')}<col class="actual-total-col rs-weekly-total-col"></colgroup>`;
    const emptyText=employeeScope==='relevant'&&statusFilter==='all'&&!search&&roleFilter==='all'?'No planned or badged employees for this week.':'No employees match your filters.';
    const rows=employees.map(renderEmployeeRow).join('')||`<tr><td colspan="9" class="actual-empty">${esc(emptyText)}</td></tr>`;
    root.innerHTML=`${renderToolbar(employees)}<div class="actual-table-wrap rs-weekly-scroll"><table class="actual-table rs-weekly-table">${colgroup}<thead><tr><th class="actual-person-head rs-weekly-person-head">Employee</th>${headers}<th class="actual-total-head rs-weekly-total-head"><div class="actual-total-head-copy rs-weekly-total-head-copy"><span>WEEK</span><strong>${esc(fmtHours(totals.grand))}</strong></div></th></tr></thead><tbody>${rows}</tbody></table></div>`;
  }

  function render(){
    if(!data)return;
    renderMetrics();
    renderBoard();
  }

  function actualChangeWeek(delta){
    if(typeof changeWeek==='function')changeWeek(delta);
    else window.RestogogoApp?.changeWeek?.(delta);
  }

  function actualSetWeek(value){
    if(!data||!value)return;
    saveWeekSnapshot();
    data.weekStart=monday(value);
    loadWeekSnapshot();
    save();
    window.RestogogoApp?.render?.();
  }

  function actualOpenWeekPicker(event){
    if(event){
      const interactive=event.target.closest('button, input');
      if(interactive && !event.target.closest('.actual-week-field'))return;
    }
    const input=$('actualWeekStart');
    if(!input)return;
    if(typeof input.showPicker==='function')input.showPicker();
    else {input.focus();input.click();}
  }

  function ensureActualEntry(employeeId,day,shift){
    data.actualEntries=data.actualEntries||{};
    data.actualEntries[employeeId]=data.actualEntries[employeeId]||{};
    data.actualEntries[employeeId][day]=data.actualEntries[employeeId][day]||{};
    data.actualEntries[employeeId][day][shift]=data.actualEntries[employeeId][day][shift]||{};
    return data.actualEntries[employeeId][day][shift];
  }

  function generateDemoActuals(){
    data.actualEntries=data.actualEntries||{};
    activeEmployees().slice(0,6).forEach((employee,ei)=>days.forEach((day,di)=>shifts.forEach((shift,si)=>{
      if(!isPlanned(employee.id,day,shift))return;
      if((ei+di+si)%7===0)return;
      const planned=timeRangeFor(employee,day,shift);
      const [start,end]=planned.split('-');
      const late=((ei+di+si)%5===0)?12:((ei+di+si)%6===0?22:0);
      const toMin=t=>{const [h,m]=t.split(':').map(Number);return h*60+m;};
      const fromMin=m=>`${String(Math.floor((m+1440)%1440/60)).padStart(2,'0')}:${String((m+1440)%60).padStart(2,'0')}`;
      const slot=ensureActualEntry(employee.id,day,shift);
      slot.clockIn=fromMin(toMin(start)+late);
      slot.clockOut=((ei+di+si)%9===0)?'':fromMin(toMin(end)+late+((ei+si)%3)*3);
    })));
    save();
    window.RestogogoApp?.render?.();
    window.RestogogoUI?.toast?.('Demo actuals generated.',{tone:'success',icon:'✓',centered:true,timeout:1600});
  }

  async function clearActuals(){
    const ok=await window.RestogogoUI?.confirm?.({title:'Clear actuals?',message:'This removes all actual time entries for this week.',confirmText:'Clear actuals',cancelText:'Cancel',tone:'danger',icon:'↺'});
    if(!ok)return;
    data.actualEntries={};
    save();
    window.RestogogoApp?.render?.();
  }

  function proofTile(label,time,photo,status){
    const hasPhoto=!!photo;
    const statusText=status==='ok'?'Photo proof captured':status==='blocked'?'Camera permission blocked':status==='unsupported'?'Camera not available':'No photo saved';
    return `<article class="actual-proof-tile">
      <div class="actual-proof-tile__media">${hasPhoto?`<img src="${esc(photo)}" alt="${esc(label)} photo proof" />`:'<span>—</span>'}</div>
      <div><strong>${esc(label)}${time?` · ${esc(time)}`:''}</strong><small>${esc(statusText)}</small></div>
    </article>`;
  }

  function showProof(employeeId,day,shift){
    const employee=emp(employeeId);
    const entry=actualEntry(employeeId,day,shift);
    const dialog=document.createElement('dialog');
    dialog.className='actual-proof-dialog';
    dialog.innerHTML=`<div class="actual-proof-card">
      <div class="actual-proof-head"><span class="rs-icon-badge">${photoIconSvg()}</span><div><h2>Badge photo proof</h2><p>${esc(employee?.name||'Employee')} · ${esc(day)} ${esc(shift)}</p></div></div>
      <div class="actual-proof-grid">
        ${proofTile('Clock in',entry.clockIn,entry.clockInPhoto,entry.clockInPhotoStatus)}
        ${entry.clockOut||entry.clockOutPhotoStatus?proofTile('Clock out',entry.clockOut,entry.clockOutPhoto,entry.clockOutPhotoStatus):''}
      </div>
      <div class="actual-proof-actions"><button type="button" class="rs-modal-btn primary" data-proof-close>Close</button></div>
    </div>`;
    document.body.appendChild(dialog);
    dialog.addEventListener('click',event=>{
      if(event.target===dialog || event.target.closest('[data-proof-close]'))dialog.close();
    });
    dialog.addEventListener('close',()=>dialog.remove());
    dialog.showModal();
  }

  function bind(){
    if(bound)return;
    bound=true;
    document.addEventListener('input',event=>{
      if(event.target?.id==='actualSearch'){
        search=event.target.value||'';
        const pos=event.target.selectionStart||search.length;
        render();
        const input=$('actualSearch');
        input?.focus?.();
        input?.setSelectionRange?.(pos,pos);
      }
    });
    document.addEventListener('change',event=>{
      if(event.target?.id==='actualWeekStart')actualSetWeek(event.target.value);
    });
    document.addEventListener('keydown',event=>{
      if(event.target?.id==='actualSearch' && event.key==='Enter'){
        event.preventDefault();
        event.target.blur();
        return;
      }
      const weekMetric=event.target.closest?.('#actualWeekMetric');
      if(weekMetric && (event.key==='Enter'||event.key===' ')){
        event.preventDefault();
        actualOpenWeekPicker(event);
      }
    });
    document.addEventListener('click',event=>{
      if(event.target.closest('#actualPrevWeek')){
        event.preventDefault();
        event.stopPropagation();
        actualChangeWeek(-7);
        return;
      }
      if(event.target.closest('#actualNextWeek')){
        event.preventDefault();
        event.stopPropagation();
        actualChangeWeek(7);
        return;
      }
      if(event.target.closest('#actualWeekMetric')){
        actualOpenWeekPicker(event);
        return;
      }
      const filter=event.target.closest('[data-actual-filter]');
      if(filter){
        const group=filter.dataset.actualFilter;
        if(group==='scope')employeeScope=filter.dataset.actualValue||'relevant';
        if(group==='role')roleFilter=filter.dataset.actualValue||'all';
        if(group==='status')statusFilter=filter.dataset.actualValue||'all';
        document.querySelectorAll('.actual-filter-menu[open]').forEach(el=>el.removeAttribute('open'));
        render();
        return;
      }
      const action=event.target.closest('[data-actual-action]')?.dataset.actualAction;
      const proofCard=event.target.closest('[data-actual-proof]');
      if(proofCard){
        showProof(proofCard.dataset.employeeId,proofCard.dataset.day,proofCard.dataset.shift);
        return;
      }
      if(action==='demo'){
        document.querySelectorAll('.actual-actions[open]').forEach(el=>el.removeAttribute('open'));
        generateDemoActuals();
        return;
      }
      if(action==='clear'){
        document.querySelectorAll('.actual-actions[open]').forEach(el=>el.removeAttribute('open'));
        clearActuals();
        return;
      }
      if(!event.target.closest('.actual-filter-menu, .actual-actions')){
        document.querySelectorAll('.actual-filter-menu[open], .actual-actions[open]').forEach(el=>el.removeAttribute('open'));
      }
    });
  }

  window.ActualTimesheet={render,bind};
})();
