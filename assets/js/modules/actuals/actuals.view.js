(function(){
  const A = Restogogo.logic.actuals;
  const Grid = Restogogo.services.weeklyGrid;
  const Metrics = Restogogo.services.metrics;
  const Icons = Restogogo.icons;

  function photoIconSvg(){
    return Icons.svg('camera');
  }

  function filterOption(group,label,value,current){
    const selected=value===current;
    return `<button type="button" class="rs-picklist-option${selected?' is-selected':''}" data-actuals-filter="${esc(group)}" data-actuals-value="${esc(value)}"><span class="rs-picklist-option-label">${esc(label)}</span>${selected?Icons.checkmark():''}</button>`;
  }

  function terminalButton(){
    return `<button type="button" class="rs-control-button rs-icon-button rs-terminal-launch" data-launch-badge-terminal aria-label="Open badge terminal" title="Open badge terminal in a new window">${Icons.svg('badge')}</button>`;
  }

  function renderMetrics(){
    const root=$('actualsMetrics');
    if(!root)return;
    const totals=A.weekTotals();
    root.innerHTML=[
      Metrics.week({id:'actualsWeekMetric',ariaLabel:'Change actuals week',prevId:'actualPrevWeek',nextId:'actualNextWeek',inputId:'actualsWeekStart',inputAriaLabel:'Select actuals week',value:weekDisplayRange(),inputValue:data.weekStart}),
      Metrics.card({tone:'hours',icon:'clock',label:'Actual hours',value:fmtHours(totals.actual),meta:`${totals.badged} badged shifts`}),
      Metrics.card({tone:'status',icon:'open',label:'Missing clock-outs',value:String(totals.open),meta:totals.open===1?'employee to review':'employees to review'}),
      Metrics.card({tone:'cost',icon:'variance',label:'Variance',value:fmtHours(totals.variance),meta:`vs ${fmtHours(totals.planned)}`})
    ].join('');
  }

  function renderToolbar(employees){
    const s=Restogogo.actuals.state;
    const scopeOptions=[filterOption('scope','Relevant only','relevant',s.employeeScope),filterOption('scope','All employees','all',s.employeeScope)].join('');
    const roleOptions=[filterOption('role','All roles','all',s.roleFilter)].concat(positions.map(role=>filterOption('role',role,role,s.roleFilter))).join('');
    const statusOptions=[['All statuses','all'],['On time','on-time'],['Variance','variance'],['Live / open','issue'],['Planned only','planned-empty']].map(([label,value])=>filterOption('status',label,value,s.statusFilter)).join('');
    const totals=A.weekTotals(employees);
    const relevantCount=A.relevantEmployees().length;
    const totalCount=activeEmployees().length;
    const countLabel=s.employeeScope==='relevant' ? `${employees.length} shown / ${relevantCount} relevant / ${totalCount} total` : `${employees.length} shown / ${totalCount} total`;
    return `<div class="rs-grid-toolbar actuals-grid-toolbar">
      <div class="rs-grid-toolbar__title"><strong>Employees</strong><span>${esc(countLabel)} · ${totals.badged} badged</span></div>
      <div class="rs-grid-toolbar__controls">
        <label class="rs-control rs-search-control" aria-label="Search employees">${Icons.svg('search')}<input id="actualSearch" value="${esc(s.search)}" placeholder="Search" /></label>
        <details class="rs-toolbar-picklist actuals-filter-menu"><summary class="rs-control-button" aria-label="Actuals filters" title="Filters">${Icons.svg('filter')}<span>Filters</span>${Icons.svg('chevronDown')}</summary><div class="rs-picklist-menu rs-picklist-menu--toolbar rs-picklist-menu--anchored"><div class="rs-picklist-group"><span class="rs-picklist-label">Employees</span><div class="rs-picklist-options">${scopeOptions}</div></div><div class="rs-picklist-group"><span class="rs-picklist-label">Status</span><div class="rs-picklist-options">${statusOptions}</div></div><div class="rs-picklist-group"><span class="rs-picklist-label">Role</span><div class="rs-picklist-options">${roleOptions}</div></div></div></details>
        ${terminalButton()}
        <details class="rs-actions-menu actuals-actions"><summary class="rs-control-button rs-icon-button" aria-label="Actuals actions">${Icons.svg('more')}</summary><div class="rs-actions-menu__panel"><button type="button" data-actuals-action="export-payroll">Export payroll prep</button><button type="button" data-actuals-action="export-summary">Export weekly summary</button><button type="button" data-actuals-action="export-details">Export details</button><button type="button" data-actuals-action="export-anomalies">Export anomalies</button><button type="button" data-actuals-action="print">Print view</button></div></details>
      </div>
    </div>`;
  }

  function absenceBadge(absence){
    if(!absence)return '';
    const clean=String(absence.status || 'Pending');
    const state=clean==='Approved'?'approved':clean==='Rejected'?'rejected':clean==='Cancelled'?'cancelled':'pending';
    return `<span class="actuals-absence-badge is-${esc(clean.toLowerCase())}">${Icons.status(state,{label:clean,className:'is-inline'})}<span>${esc(absenceDisplayLabel(absence,'Leave'))}</span></span>`;
  }
  function absenceLayer(absence){
    if(!absence)return '';
    const status=String(absence.status || '').toLowerCase();
    const clean=String(absence.status || 'Pending');
    const state=clean==='Approved'?'approved':clean==='Rejected'?'rejected':clean==='Cancelled'?'cancelled':'pending';
    return `<span class="actuals-absence-layer is-${esc(status)}">${Icons.status(state,{label:clean,className:'is-inline'})}<em aria-hidden="true">${absenceIconMarkup(absence,'rs-inline-icon')}</em><b>${esc(absenceDisplayLabel(absence,'Leave'))}</b></span>`;
  }

  function actualCard(employee,day,shift){
    const planned=isPlanned(employee.id,day,shift);
    const actual=A.entry(employee.id,day,shift);
    const absence=employeePrimaryAbsenceForSlot(employee.id,day,shift,['Approved','Pending']);
    const state=A.slotState(employee,day,shift);
    const hasActual=!!(actual.clockIn || actual.clockOut);
    const tone=absence && !hasActual ? `absence-${String(absence.status || '').toLowerCase()}` : A.slotTone(state);
    const zone=planned ? (assignmentZoneName(employee.id,day,shift) || suggestZone(employee,shift)) : '';
    if(state==='empty' && !absence)return '<div class="actuals-slot-empty rs-weekly-slot" aria-hidden="true"></div>';
    const plannedLine=planned ? displayTimeRange(A.plannedRangeFor(employee,day,shift)) : '';
    const status=absence && !hasActual ? (absence.status==='Approved'?'Approved leave':'Leave pending') : A.slotStatus(employee,day,shift);
    const main=absence && !hasActual ? absenceDisplayLabel(absence,'Leave') : A.slotMainTime(employee,day,shift);
    const detail=absence && !hasActual ? `${absence.shift || 'Full day'} · ${absence.status==='Approved'?'no badge expected':'request awaiting review'}${plannedLine ? ` · planned ${plannedLine}` : ''}` : plannedLine;
    const proof=A.hasProof(actual);
    const proofAttrs=proof?` data-actuals-proof="1" data-employee-id="${esc(employee.id)}" data-day="${esc(day)}" data-shift="${esc(shift)}"`:'';
    return `<article class="actuals-slot-card rs-shift-card rs-weekly-slot is-${tone}${proof?' has-proof':''}${absence?' has-absence':''}"${proofAttrs} title="${esc(`${employee.name} · ${day} ${shift}${absence?` · ${absence.status} ${absenceDisplayLabel(absence,'Leave')}`:''}${proof?' · photo proof':''}`)}">
      ${absence && !hasActual ? absenceLayer(absence) : ''}
      <strong>${esc(main)}</strong>
      ${detail?`<small>${esc(detail)}</small>`:'<small></small>'}
      <em>${esc(absence && !hasActual ? 'Absence' : (zone||'—'))}</em>
      ${status?`<b>${esc(status)}</b>`:'<b></b>'}
      ${hasActual&&absence?absenceBadge(absence):''}
      ${proof?`<span class="actuals-proof-dot" aria-label="Photo proof available">${photoIconSvg()}</span>`:''}
    </article>`;
  }

  function renderEmployeeRow(employee){
    const totals=A.totalsForEmployee(employee);
    const diff=totals.variance ? fmtHours(totals.variance) : '';
    return Grid.row({
      moduleName:'actuals',
      employee,
      personCellHtml:Grid.personCell({moduleName:'actuals',employee,tag:'th',avatarStyle:positionStyle(employeePositionName(employee))}),
      dayCellRenderer:(day,index)=>Grid.dayCell({moduleName:'actuals',day,index,content:shifts.map(shift=>actualCard(employee,day,shift)).join('')}),
      totalCellHtml:Grid.totalCell({moduleName:'actuals',content:`<strong>${esc(fmtHours(totals.actual))}</strong><small>${esc(fmtHours(totals.planned))}</small>${diff?`<b>${esc(diff)}</b>`:'<b></b>'}`})
    });
  }

  function renderBoard(){
    const root=$('actualsRoot');
    if(!root)return;
    const s=Restogogo.actuals.state;
    const employees=A.visibleEmployees(Restogogo.actuals.filters());
    const totals=A.dayTotals(employees);
    const isCleanEmpty=s.employeeScope==='relevant'&&s.statusFilter==='all'&&!s.search&&s.roleFilter==='all';
    const emptyTitle=isCleanEmpty?'No actuals to review yet.':'No employees match this view.';
    const emptyText=isCleanEmpty?'Planned employees and employees who badge will appear here automatically.':'Clear search or filters to return to the weekly actuals view.';
    const emptyAction=isCleanEmpty?'':`<span class="rs-empty-state__actions"><button type="button" class="rs-empty-state__action" data-actuals-clear-filters>Clear filters</button></span>`;
    const emptyRow=Grid.emptyRow({className:'actuals-empty-row',content:`<div class="rs-empty-state"><span class="rs-empty-state__icon">${Icons.svg('check')}</span><strong>${esc(emptyTitle)}</strong><span>${esc(emptyText)}</span>${emptyAction}</div>`});
    const rows=employees.map(renderEmployeeRow).join('')||emptyRow;
    root.innerHTML=`${renderToolbar(employees)}<div class="rs-weekly-scroll"><table class="rs-weekly-table">${Grid.colgroup('actuals')}${Grid.tableHead({moduleName:'actuals',totals,totalHeadHtml:`<div class="rs-weekly-total-head-copy"><span>WEEK</span><strong>${esc(fmtHours(totals.grand))}</strong></div>`})}<tbody>${rows}</tbody></table></div>`;
  }

  function render(){if(!data)return;renderMetrics();renderBoard();}
  function proofTile(label,time,photo,status){
    const hasPhoto=!!photo;
    const statusText=status==='ok'?'Photo proof captured':status==='blocked'?'Camera permission blocked':status==='unsupported'?'Camera not available':'No photo saved';
    return `<article class="actuals-proof-tile"><div class="actuals-proof-tile__media">${hasPhoto?`<img src="${esc(photo)}" alt="${esc(label)} photo proof" />`:'<span>—</span>'}</div><div><strong>${esc(label)}${time?` · ${esc(time)}`:''}</strong><small>${esc(statusText)}</small></div></article>`;
  }
  function showProof(employeeId,day,shift){
    const employee=emp(employeeId);
    const entry=A.entry(employeeId,day,shift);
    const dialog=document.createElement('dialog');
    dialog.className='actuals-proof-dialog';
    dialog.innerHTML=`<div class="actuals-proof-card"><div class="actuals-proof-head"><span class="rs-icon-badge">${photoIconSvg()}</span><div><h2>Badge photo proof</h2><p>${esc(employee?.name||'Employee')} · ${esc(day)} ${esc(shift)}</p></div></div><div class="actuals-proof-grid">${proofTile('Clock in',entry.clockIn,entry.clockInPhoto,entry.clockInPhotoStatus)}${entry.clockOut||entry.clockOutPhotoStatus?proofTile('Clock out',entry.clockOut,entry.clockOutPhoto,entry.clockOutPhotoStatus):''}</div><div class="actuals-proof-actions"><button type="button" class="rs-modal-btn primary" data-proof-close>Close</button></div></div>`;
    document.body.appendChild(dialog);
    dialog.addEventListener('click',event=>{if(event.target===dialog || event.target.closest('[data-proof-close]'))dialog.close();});
    dialog.addEventListener('close',()=>dialog.remove());
    dialog.showModal();
  }

  Restogogo.actuals=Object.assign(Restogogo.actuals||{},{render,showProof});
})();
