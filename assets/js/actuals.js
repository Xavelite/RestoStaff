(function(){
  let bound=false;
  let search='';
  let roleFilter='all';
  let employeeScope='relevant';
  let statusFilter='all';

  const A = Restogogo.logic.actuals;
  const Grid = Restogogo.services.weeklyGrid;
  const Metrics = Restogogo.services.metrics;

  function photoIconSvg(){
    return '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M8.5 7.5 10 5h4l1.5 2.5H18a2 2 0 0 1 2 2V17a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V9.5a2 2 0 0 1 2-2h2.5Z"></path><circle cx="12" cy="13" r="3"></circle></svg>';
  }

  function renderMetrics(){
    const root=$('actualsMetrics');
    if(!root)return;
    const totals=A.weekTotals();
    root.innerHTML=[
      Metrics.week({
        id:'actualsWeekMetric',
        ariaLabel:'Change actuals week',
        prevId:'actualPrevWeek',
        nextId:'actualNextWeek',
        inputId:'actualsWeekStart',
        inputAriaLabel:'Select actuals week',
        value:weekDisplayRange(),
        inputValue:data.weekStart
      }),
      Metrics.card({tone:'hours',icon:'clock',label:'Actual hours',value:fmtHours(totals.actual),meta:`${totals.badged} badged shifts`}),
      Metrics.card({tone:'status',icon:'open',label:'Missing clock-outs',value:String(totals.open),meta:totals.open===1?'employee to review':'employees to review'}),
      Metrics.card({tone:'cost',icon:'variance',label:'Variance',value:fmtHours(totals.variance),meta:`vs ${fmtHours(totals.planned)}`})
    ].join('');
  }

  function filterOption(group,label,value,current){
    const selected=value===current;
    return `<button type="button" class="rs-filter-option${selected?' is-selected':''}" data-actuals-filter="${esc(group)}" data-actuals-value="${esc(value)}"><span>${esc(label)}</span>${selected?'<span class="rs-filter-check">✓</span>':''}</button>`;
  }

  function terminalButton(){
    return `<button type="button" class="rs-control-button rs-terminal-launch" data-launch-badge-terminal aria-label="Open badge terminal" title="Open badge terminal in a new window"><svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect x="5" y="4" width="14" height="16" rx="3"></rect><path d="M9 8h6M9 12h6M10 16h4"></path></svg><span>Badge terminal</span></button>`;
  }

  function actualsPrintView(){
    Restogogo.ui?.toast?.('Opening print view.',{tone:'success',icon:'✓',centered:false,timeout:1200});
    setTimeout(()=>window.print(),80);
  }

  function renderToolbar(employees){
    const scopeOptions=[filterOption('scope','Relevant only','relevant',employeeScope),filterOption('scope','All employees','all',employeeScope)].join('');
    const roleOptions=[filterOption('role','All roles','all',roleFilter)].concat(positions.map(role=>filterOption('role',role,role,roleFilter))).join('');
    const statusOptions=[['All statuses','all'],['On time','on-time'],['Variance','variance'],['Live / open','issue'],['Planned only','planned-empty']].map(([label,value])=>filterOption('status',label,value,statusFilter)).join('');
    const totals=A.weekTotals(employees);
    const relevantCount=A.relevantEmployees().length;
    const totalCount=activeEmployees().length;
    const countLabel=employeeScope==='relevant' ? `${employees.length} shown / ${relevantCount} relevant / ${totalCount} total` : `${employees.length} shown / ${totalCount} total`;
    return `<div class="rs-grid-toolbar actuals-grid-toolbar">
      <div class="rs-grid-toolbar__title"><strong>Employees</strong><span>${esc(countLabel)} · ${totals.badged} badged</span></div>
      <div class="rs-grid-toolbar__controls">
        <label class="rs-control rs-search-control" aria-label="Search employees"><svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="11" cy="11" r="6"></circle><path d="m16 16 4 4"></path></svg><input id="actualSearch" value="${esc(search)}" placeholder="Search" /></label>
        <details class="rs-filter-menu actuals-filter-menu"><summary class="rs-control-button"><span>Filters</span><svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="m6 9 6 6 6-6"></path></svg></summary><div class="rs-filter-menu__panel"><div class="rs-filter-group"><span class="rs-filter-label">Employees</span><div class="rs-filter-options">${scopeOptions}</div></div><div class="rs-filter-group"><span class="rs-filter-label">Status</span><div class="rs-filter-options">${statusOptions}</div></div><div class="rs-filter-group"><span class="rs-filter-label">Role</span><div class="rs-filter-options">${roleOptions}</div></div></div></details>
        ${terminalButton()}
        <details class="rs-actions-menu actuals-actions"><summary class="rs-control-button rs-icon-button" aria-label="Actuals actions"><svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="12" cy="12" r="1.8"></circle><circle cx="19" cy="12" r="1.8"></circle><circle cx="5" cy="12" r="1.8"></circle></svg></summary><div class="rs-actions-menu__panel"><button type="button" data-actuals-action="export-payroll">Export payroll prep</button><button type="button" data-actuals-action="export-summary">Export weekly summary</button><button type="button" data-actuals-action="export-details">Export details</button><button type="button" data-actuals-action="export-anomalies">Export anomalies</button><button type="button" data-actuals-action="print">Print view</button></div></details>
      </div>
    </div>`;
  }

  function actualCard(employee,day,shift){
    const planned=isPlanned(employee.id,day,shift);
    const actual=A.entry(employee.id,day,shift);
    const state=A.slotState(employee,day,shift);
    const tone=A.slotTone(state);
    const zone=data.assignments?.[employee.id]?.[day]?.[shift] || (planned?suggestZone(employee,shift):'');
    if(state==='empty')return '<div class="actuals-slot-empty rs-weekly-slot" aria-hidden="true"></div>';
    const plannedLine=planned ? displayTimeRange(A.plannedRangeFor(employee,day,shift)) : '';
    const status=A.slotStatus(employee,day,shift);
    const proof=A.hasProof(actual);
    const proofAttrs=proof?` data-actuals-proof="1" data-employee-id="${esc(employee.id)}" data-day="${esc(day)}" data-shift="${esc(shift)}"`:'';
    return `<article class="actuals-slot-card rs-shift-card rs-weekly-slot is-${tone}${proof?' has-proof':''}"${proofAttrs} title="${esc(`${employee.name} · ${day} ${shift}${proof?' · photo proof':''}`)}">
      <strong>${esc(A.slotMainTime(employee,day,shift))}</strong>
      ${plannedLine?`<small>${esc(plannedLine)}</small>`:'<small></small>'}
      <em>${esc(zone||'—')}</em>
      ${status?`<b>${esc(status)}</b>`:'<b></b>'}
      ${proof?`<span class="actuals-proof-dot" aria-label="Photo proof available">${photoIconSvg()}</span>`:''}
    </article>`;
  }

  function renderEmployeeRow(employee){
    const totals=A.totalsForEmployee(employee);
    const diff=totals.variance ? fmtHours(totals.variance) : '';
    return Grid.row({
      moduleName:'actuals',
      employee,
      personCellHtml:Grid.personCell({
        moduleName:'actuals',
        employee,
        tag:'th',
        avatarStyle:positionStyle(employee.position)
      }),
      dayCellRenderer:(day,index)=>Grid.dayCell({
        moduleName:'actuals',
        day,
        index,
        content:shifts.map(shift=>actualCard(employee,day,shift)).join('')
      }),
      totalCellHtml:Grid.totalCell({
        moduleName:'actuals',
        content:`<strong>${esc(fmtHours(totals.actual))}</strong><small>${esc(fmtHours(totals.planned))}</small>${diff?`<b>${esc(diff)}</b>`:'<b></b>'}`
      })
    });
  }


  function actualsEmployeeFilters(){
    return {search, roleFilter, employeeScope, statusFilter};
  }

  function renderBoard(){
    const root=$('actualsRoot');
    if(!root)return;
    const employees=A.visibleEmployees(actualsEmployeeFilters());
    const totals=A.dayTotals(employees);
    const isCleanEmpty=employeeScope==='relevant'&&statusFilter==='all'&&!search&&roleFilter==='all';
    const emptyTitle=isCleanEmpty?'No actuals to review yet.':'No employees match this view.';
    const emptyText=isCleanEmpty?'Planned employees and employees who badge will appear here automatically.':'Clear search or filters to return to the weekly actuals view.';
    const emptyAction=isCleanEmpty?'':`<span class="rs-empty-state__actions"><button type="button" class="rs-empty-state__action" data-actuals-clear-filters>Clear filters</button></span>`;
    const emptyRow=Grid.emptyRow({
      className:'actuals-empty-row',
      content:`<div class="rs-empty-state"><span class="rs-empty-state__icon">✓</span><strong>${esc(emptyTitle)}</strong><span>${esc(emptyText)}</span>${emptyAction}</div>`
    });
    const rows=employees.map(renderEmployeeRow).join('')||emptyRow;
    root.innerHTML=`${renderToolbar(employees)}<div class="rs-weekly-scroll"><table class="rs-weekly-table">${Grid.colgroup('actuals')}${Grid.tableHead({moduleName:'actuals',totals,totalHeadHtml:`<div class="rs-weekly-total-head-copy"><span>WEEK</span><strong>${esc(fmtHours(totals.grand))}</strong></div>`})}<tbody>${rows}</tbody></table></div>`;
  }


  function render(){
    if(!data)return;
    renderMetrics();
    renderBoard();
  }

  function actualsChangeWeek(delta){
    Restogogo.router.changeWeek(delta);
  }

  function actualsSetWeek(value){
    if(!data||!value)return;
    setWeekStartAndLoad(value);
    Restogogo.router?.render?.();
  }

  function actualsOpenWeekPicker(event){
    if(event){
      const interactive=event.target.closest('button, input');
      if(interactive && !event.target.closest('.rs-week-field'))return;
    }
    const input=$('actualsWeekStart');
    if(!input)return;
    if(typeof input.showPicker==='function')input.showPicker();
    else {input.focus();input.click();}
  }

  function proofTile(label,time,photo,status){
    const hasPhoto=!!photo;
    const statusText=status==='ok'?'Photo proof captured':status==='blocked'?'Camera permission blocked':status==='unsupported'?'Camera not available':'No photo saved';
    return `<article class="actuals-proof-tile">
      <div class="actuals-proof-tile__media">${hasPhoto?`<img src="${esc(photo)}" alt="${esc(label)} photo proof" />`:'<span>—</span>'}</div>
      <div><strong>${esc(label)}${time?` · ${esc(time)}`:''}</strong><small>${esc(statusText)}</small></div>
    </article>`;
  }

  function showProof(employeeId,day,shift){
    const employee=emp(employeeId);
    const entry=A.entry(employeeId,day,shift);
    const dialog=document.createElement('dialog');
    dialog.className='actuals-proof-dialog';
    dialog.innerHTML=`<div class="actuals-proof-card">
      <div class="actuals-proof-head"><span class="rs-icon-badge">${photoIconSvg()}</span><div><h2>Badge photo proof</h2><p>${esc(employee?.name||'Employee')} · ${esc(day)} ${esc(shift)}</p></div></div>
      <div class="actuals-proof-grid">
        ${proofTile('Clock in',entry.clockIn,entry.clockInPhoto,entry.clockInPhotoStatus)}
        ${entry.clockOut||entry.clockOutPhotoStatus?proofTile('Clock out',entry.clockOut,entry.clockOutPhoto,entry.clockOutPhotoStatus):''}
      </div>
      <div class="actuals-proof-actions"><button type="button" class="rs-modal-btn primary" data-proof-close>Close</button></div>
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
      if(event.target?.id==='actualsWeekStart')actualsSetWeek(event.target.value);
    });
    document.addEventListener('keydown',event=>{
      if(event.target?.id==='actualSearch' && event.key==='Enter'){
        event.preventDefault();
        event.target.blur();
        return;
      }
      if(event.key==='Escape'){
        document.querySelectorAll('.actuals-filter-menu[open], .actuals-actions[open]').forEach(el=>el.removeAttribute('open'));
        return;
      }
      const weekMetric=event.target.closest?.('#actualsWeekMetric');
      if(weekMetric && (event.key==='Enter'||event.key===' ')){
        event.preventDefault();
        actualsOpenWeekPicker(event);
      }
    });
    document.addEventListener('click',event=>{
      if(event.target.closest('#actualPrevWeek')){
        event.preventDefault();
        event.stopPropagation();
        actualsChangeWeek(-7);
        return;
      }
      if(event.target.closest('#actualNextWeek')){
        event.preventDefault();
        event.stopPropagation();
        actualsChangeWeek(7);
        return;
      }
      if(event.target.closest('#actualsWeekMetric')){
        actualsOpenWeekPicker(event);
        return;
      }
      const filter=event.target.closest('[data-actuals-filter]');
      if(filter){
        const group=filter.dataset.actualsFilter;
        if(group==='scope')employeeScope=filter.dataset.actualsValue||'relevant';
        if(group==='role')roleFilter=filter.dataset.actualsValue||'all';
        if(group==='status')statusFilter=filter.dataset.actualsValue||'all';
        document.querySelectorAll('.actuals-filter-menu[open]').forEach(el=>el.removeAttribute('open'));
        render();
        return;
      }
      const clearFilters=event.target.closest('[data-actuals-clear-filters]');
      if(clearFilters){
        search='';
        roleFilter='all';
        employeeScope='relevant';
        statusFilter='all';
        render();
        return;
      }
      const action=event.target.closest('[data-actuals-action]')?.dataset.actualsAction;
      const proofCard=event.target.closest('[data-actuals-proof]');
      if(proofCard){
        showProof(proofCard.dataset.employeeId,proofCard.dataset.day,proofCard.dataset.shift);
        return;
      }
      if(action==='export-payroll'){
        document.querySelectorAll('.actuals-actions[open]').forEach(el=>el.removeAttribute('open'));
        Restogogo.export.actuals.payroll();
        return;
      }
      if(action==='export-summary'){
        document.querySelectorAll('.actuals-actions[open]').forEach(el=>el.removeAttribute('open'));
        Restogogo.export.actuals.summary();
        return;
      }
      if(action==='export-details'){
        document.querySelectorAll('.actuals-actions[open]').forEach(el=>el.removeAttribute('open'));
        Restogogo.export.actuals.details();
        return;
      }
      if(action==='export-anomalies'){
        document.querySelectorAll('.actuals-actions[open]').forEach(el=>el.removeAttribute('open'));
        Restogogo.export.actuals.anomalies();
        return;
      }
      if(action==='print'){
        document.querySelectorAll('.actuals-actions[open]').forEach(el=>el.removeAttribute('open'));
        actualsPrintView();
        return;
      }
      if(!event.target.closest('.actuals-filter-menu, .actuals-actions')){
        document.querySelectorAll('.actuals-filter-menu[open], .actuals-actions[open]').forEach(el=>el.removeAttribute('open'));
      }
    });
  }

  const actualsApi={render,bind};
  Restogogo.actuals=Object.assign(Restogogo.actuals || {}, actualsApi);
})();
