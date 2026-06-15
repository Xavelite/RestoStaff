(function(){
  const A = Restogogo.logic.actuals;
  const Grid = Restogogo.services.weeklyGrid;
  const Metrics = Restogogo.services.metrics;
  const Toolbar = Restogogo.services.toolbar;
  const Icons = Restogogo.icons;
  const ModuleHeader = Restogogo.services.moduleHeader;

  function photoIconSvg(){
    return Icons.svg('camera');
  }

  function filterOption(group,label,value,current){
    return Toolbar.filterOption({label,value,current,kind:group,kindAttr:'data-actuals-filter',valueAttr:'data-actuals-value'});
  }

  function terminalButton(){
    const url = Restogogo.auth?.badgeTerminalUrl?.() || '#';
    return `<a class="rs-control-button rs-terminal-launch" href="${esc(url)}" target="_blank" rel="noopener" aria-label="Open badge terminal" title="Open badge terminal in a new tab">${Icons.svg('badge')}<span>Open badges</span></a>`;
  }

  function ensureActualsShell(){
    const root=$('actualsRoot');
    if(!root)return false;
    if($('actualsHeader')&&$('actualsMetrics')&&$('actualsBoard'))return true;
    root.innerHTML=Restogogo.services.pageShell.standard({
      moduleName:'actuals',
      title:'Actuals',
      metricsClass:'rs-metrics--hero-first',
      boardClass:'rs-weekly-board',
      metricsAria:'Actuals summary',
      boardAria:'Actuals board'
    });
    return true;
  }

  function renderHeader(){
    const root=$('actualsHeader');
    if(!root)return;
    root.className='actuals-page-head rs-module-header rs-module-header--actuals';
    root.innerHTML=ModuleHeader.content({
      moduleName:'actuals',
      title:'Actuals',
      subtitle:'Live truth. Verified hours. Time discipline.',
      aside:'<span class="actuals-live-badge" aria-label="Live data"><span class="actuals-live-dot" aria-hidden="true"></span>Live data</span>'
    });
  }

  function renderMetrics(){
    const root=$('actualsMetrics');
    if(!root)return;
    const totals=A.weekTotals();
    const total=activeEmployees().length;
    const visible=A.visibleEmployees(Restogogo.actuals.filters()).length;
    root.innerHTML=[
      Metrics.card({detailKey:'actuals.hours',className:'rs-metric--hero',tone:'hours',icon:'clock',label:'Actual hours',value:fmtHours(totals.actual),meta:`${totals.badged} badged shifts`}),
      Metrics.card({detailKey:'actuals.employees',tone:'week',icon:'users',label:'Employees',value:String(visible),meta:visible===total?`${total} active total`:`${visible} shown · ${total} active total`}),
      Metrics.card({detailKey:'actuals.open',tone:totals.open?'warning':'success',icon:totals.open?'timer':'check',label:'Missing clock-outs',value:String(totals.open),meta:totals.open===1?'employee to review':'employees to review'}),
      Metrics.card({detailKey:'actuals.variance',tone:Math.abs(totals.variance)>0.25?'warning':'success',icon:'variance',label:'Variance',value:fmtHours(totals.variance),meta:`vs ${fmtHours(totals.planned)}`})
    ].join('');
    Restogogo.ui?.animateCounters?.(root, 280);
  }

  function renderToolbar(){
    const s=Restogogo.actuals.state;
    const roleOptions=[filterOption('role','All roles','all',s.roleFilter)].concat(activeJobFunctionNames().map(role=>filterOption('role',role,role,s.roleFilter))).join('');

    return Toolbar.gridToolbar({
      tag:'section',
      className:'rs-weekly-toolbar actuals-grid-toolbar',
      ariaLabel:'Actuals calendar controls',
      leading:[
        Toolbar.searchControl({id:'actualSearch',ariaLabel:'Search employees',value:s.search}),
        Toolbar.filterMenu({
          className:'actuals-filter-menu',
          ariaLabel:'Actuals filters',
          groups:[
            {label:'Employees',options:[
              {label:'Relevant only',value:'relevant',current:s.employeeScope,kind:'scope',kindAttr:'data-actuals-filter',valueAttr:'data-actuals-value'},
              {label:'All employees',value:'all',current:s.employeeScope,kind:'scope',kindAttr:'data-actuals-filter',valueAttr:'data-actuals-value'}
            ]},
            {label:'Status',options:[['All statuses','all'],['On time','on-time'],['Variance','variance'],['Live / open','issue'],['Planned only','planned-empty']].map(([label,value])=>({label,value,current:s.statusFilter,kind:'status',kindAttr:'data-actuals-filter',valueAttr:'data-actuals-value'}))},
            {label:'Role',optionsHtml:roleOptions}
          ]
        })
      ],
      center:Metrics.periodSelector({id:'actualsWeekMetric',ariaLabel:'Change actuals week',prevId:'actualPrevWeek',nextId:'actualNextWeek',inputId:'actualsWeekStart',inputAriaLabel:'Select actuals week',label:'Week',value:weekDisplayRange(),inputValue:data.weekStart}),
      actions:[
        terminalButton(),
        Toolbar.actionMenu({
          className:'actuals-actions',
          ariaLabel:'Actuals actions',
          actionAttr:'data-actuals-action',
          items:[
            {action:'approve-week',label:'Approve week actuals'},
            {action:'reopen-week',label:'Reopen week actuals'},
            {action:'export-summary',label:'Export weekly summary'},
            {action:'export-details',label:'Export details'},
            {action:'export-anomalies',label:'Export anomalies'},
            {action:'print',label:'Print view'}
          ]
        })
      ]
    });
  }

  function absenceBadge(absence){
    if(!absence)return '';
    const clean=String(absence.status || 'Pending');
    const state=Restogogo.logic?.absences?.statusState?.(clean) || 'pending';
    return `<span class="actuals-absence-badge is-${esc(clean.toLowerCase())}">${Icons.status(state,{label:clean,className:'is-inline'})}<span>${esc(absenceDisplayLabel(absence,'Leave'))}</span></span>`;
  }

  function actualCardIcon(tone,state){
    if(tone === 'live' || state === 'live')return 'timer';
    if(tone === 'warning')return 'variance';
    if(tone === 'pending')return 'calendar';
    if(tone === 'absence')return 'palm';
    return 'clock';
  }

  function actualWorkedDetail(employee,day,shift,hasActual){
    if(!hasActual)return '';
    const hours=A.actualHoursFor?.(employee,day,shift) || 0;
    return `${fmtHours(hours)} worked`;
  }

  function actualCard(employee,day,shift){
    const planned=isPlanned(employee.id,day,shift);
    const actual=A.entry(employee.id,day,shift);
    const absence=absenceForDayShift(employee.id,day,shift,['Approved','Pending']);
    const state=A.slotState(employee,day,shift);
    const hasActual=!!(actual.clockIn || actual.clockOut);
    const tone=absence && !hasActual ? 'absence' : A.slotTone(state);
    const zone=planned ? (assignmentZoneName(employee.id,day,shift) || suggestZone(employee,shift)) : '';
    if(state==='empty' && !absence)return `<button type="button" class="actuals-slot-empty rs-calendar-slot-add rs-weekly-slot rs-slot-add" data-actuals-edit="1" data-employee-id="${esc(employee.id)}" data-day="${esc(day)}" data-shift="${esc(shift)}" aria-label="Add actual entry for ${esc(employee.name)} on ${esc(day)} ${esc(shift)}"><span aria-hidden="true">+</span><em class="rs-sr-only">Add actual</em></button>`;
    const plannedLine=planned ? displayTimeRange(A.plannedRangeFor(employee,day,shift)) : '';
    const editAttrs=` data-actuals-edit="1" data-employee-id="${esc(employee.id)}" data-day="${esc(day)}" data-shift="${esc(shift)}"`;
    if(absence && !hasActual){
      const absenceAttrs=`${editAttrs} data-calendar-absence="1" data-absence-id="${esc(absence.id||'')}" aria-label="${esc(`${employee.name} · ${day} ${shift} · ${absence.status} ${absenceDisplayLabel(absence,'Leave')}`)}"`;
      return Restogogo.services.calendarActions.absenceSlotHtml(absence, absenceAttrs);
    }
    const status=A.slotStatus(employee,day,shift);
    const main=A.slotMainTime(employee,day,shift);
    const workedDetail=actualWorkedDetail(employee,day,shift,hasActual);
    const managerLine=plannedLine ? `Planned ${plannedLine}` : (zone || '—');
    const proof=A.hasProof(actual);
    const proofAttrs=proof?` data-actuals-proof="1" data-employee-id="${esc(employee.id)}" data-day="${esc(day)}" data-shift="${esc(shift)}"`:'';
    const corrected=String(actual.status || '').toLowerCase()==='adjusted' || !!actual.adjustedAt;
    const calendarTone={actual:'rs-calendar-card--actual',live:'rs-calendar-card--live',warning:'rs-calendar-card--warning',pending:'rs-calendar-card--pending',absence:'rs-calendar-card--absence'}[tone] || 'rs-calendar-card--empty';
    const iconName=actualCardIcon(tone,state);
    return `<article class="actuals-slot-card rs-calendar-card ${calendarTone} rs-calendar-card--density-icon-dense rs-weekly-slot is-${tone}${proof?' has-proof':''}${absence?' has-absence':''}${corrected?' is-corrected':''}"${editAttrs}${proofAttrs} aria-label="${esc(`${employee.name} · ${day} ${shift}${absence?` · ${absence.status} ${absenceDisplayLabel(absence,'Leave')}`:''}${proof?' · photo proof':''}`)}">
      <span class="rs-calendar-card-icon actuals-slot-icon" aria-hidden="true">${Icons.svg(iconName,'actuals-slot-icon-svg')}</span>
      <div class="rs-calendar-card-copy actuals-slot-copy">
        <strong>${esc(main)}</strong>
        ${workedDetail?`<small>${esc(workedDetail)}</small>`:(plannedLine?`<small>${esc(plannedLine)}</small>`:'<small></small>')}
        <em>${esc(absence && !hasActual ? 'Absence' : managerLine)}</em>
        ${status?`<b>${esc(status)}</b>`:'<b></b>'}
      </div>
      ${hasActual&&absence?absenceBadge(absence):''}
      ${corrected?'<span class="actuals-correction-dot" aria-label="Manager corrected">Adjusted</span>':''}
      ${proof?`<span class="actuals-proof-dot" aria-label="Photo proof available">${photoIconSvg()}</span>`:''}
    </article>`;
  }

  function renderEmployeeRow(employee){
    const totals=A.totalsForEmployee(employee);
    const diff=totals.variance ? fmtHours(totals.variance) : '';
    const rowKey=`emp:${employee.id}`;
    const selected=Restogogo.actuals.state.selectedRow===rowKey?'row-selected':'';
    return Grid.row({
      moduleName:'actuals',
      employee,
      rowClass:selected,
      rowAttributes:{'data-rowkey':rowKey},
      personCellHtml:Grid.personCell({
        moduleName:'actuals',
        employee,
        tag:'th',
        avatarStyle:jobFunctionStyle(employeeJobFunctionName(employee)),
        attributes:{
          'data-actuals-action':'select-row',
          'data-rowkey':rowKey,
          title:`Select ${employee.name}`,
          tabindex:'0',
          role:'button'
        }
      }),
      dayCellRenderer:(day,index)=>Grid.dayCell({
        moduleName:'actuals',
        day,
        index,
        extraClass:[actualsTodayIndex()===index?'is-today':'',Restogogo.actuals.state.selectedDay===day?'col-selected':''].filter(Boolean).join(' '),
        content:shifts.map(shift=>actualCard(employee,day,shift)).join('')
      }),
      totalCellHtml:Grid.totalCell({moduleName:'actuals',content:`<strong>${esc(fmtHours(totals.actual))}</strong><small>${esc(fmtHours(totals.planned))}</small>${diff?`<b>${esc(diff)}</b>`:'<b></b>'}`})
    });
  }

  function actualsTodayIndex(){
    if(!data||!data.weekStart)return -1;
    const offset=Math.round((parseISO(todayISO())-parseISO(data.weekStart))/86400000);
    return (offset>=0&&offset<=6)?offset:-1;
  }

  function actualsDayHeader(day,index,totals){
    const dayTotals=totals.dayTotals || {};
    const dayPeople=totals.dayPeople || {};
    const people=dayPeople[day] instanceof Set ? dayPeople[day].size : Number(dayPeople[day] || 0);
    const isToday=actualsTodayIndex()===index?'is-today':'';
    const selected=Restogogo.actuals.state.selectedDay===day?'col-selected':'';
    const classes=['rs-weekly-day-head',Grid.dayTone(index),isToday,selected].filter(Boolean).join(' ');
    return `<th class="${esc(classes)}" data-actuals-action="select-day" data-day="${esc(day)}" title="${esc(`Select ${day}`)}" tabindex="0" role="button"><div class="rs-weekly-day-head-copy actuals-day-head-copy"><strong>${esc(day.slice(0,3))}</strong><span>${esc(shortDisplayDate(dateForDay(day)))}</span><small>${esc(fmtHours(dayTotals[day] || 0))} · ${esc(fmtPeople(people))}</small></div></th>`;
  }

  function actualsLegend(){
    return Grid.legend({
      ariaLabel:'Actuals legend',
      items:[
        {className:'is-actual',label:'Recorded actual'},
        {className:'is-open',label:'Live / open'},
        {className:'is-missing',label:'Missing badge'},
        {className:'is-warning',label:'Unplanned / variance'},
        {className:'is-adjusted',label:'Manager adjusted'},
        {className:'is-absence',label:'Leave'}
      ]
    });
  }

  function renderBoard(){
    const root=$('actualsBoard');
    if(!root)return;
    const s=Restogogo.actuals.state;
    const employees=A.visibleEmployees(Restogogo.actuals.filters());
    const totals=A.dayTotals(employees);
    const isCleanEmpty=s.employeeScope==='all'&&s.statusFilter==='all'&&!s.search&&s.roleFilter==='all';
    const emptyTitle=isCleanEmpty?'No employees available for this week.':'No employees match this view.';
    const emptyText=isCleanEmpty?'The actuals calendar is ready; employees will appear here when the team is set up.':'Clear search or filters to return to the weekly actuals view.';
    const emptyAction=isCleanEmpty?'':`<span class="rs-empty-state__actions"><button type="button" class="rs-empty-state__action" data-actuals-clear-filters>Clear filters</button></span>`;
    const emptyRow=Grid.emptyRow({className:'actuals-empty-row',content:`<div class="rs-empty-state"><span class="rs-empty-state__icon">${Icons.svg('check')}</span><strong>${esc(emptyTitle)}</strong><span>${esc(emptyText)}</span>${emptyAction}</div>`});
    const rows=employees.map(renderEmployeeRow).join('')||emptyRow;
    root.innerHTML=`${renderToolbar()}<div class="rs-workspace-body rs-weekly-body"><div class="rs-weekly-scroll"><table class="rs-weekly-table">${Grid.colgroup('actuals')}${Grid.tableHead({moduleName:'actuals',totals,dayHeaderRenderer:actualsDayHeader,totalHeadHtml:`<div class="rs-weekly-total-head-copy"><span>WEEK</span><strong>${esc(fmtHours(totals.grand))}</strong></div>`})}<tbody>${rows}</tbody></table></div>${actualsLegend()}</div>`;
  }

  function render(){if(!data)return;ensureActualsShell();renderHeader();renderMetrics();renderBoard();}
  function proofStatusText(status, hasPhoto){
    if(hasPhoto)return 'Photo captured';
    const labels={
      captured:'Photo captured',
      denied:'Camera permission denied',
      unavailable:'Camera unavailable',
      failed:'Photo capture failed',
      waived:'Photo waived',
      not_required:'Photo not required',
      missing:'No photo recorded'
    };
    return labels[status] || 'No photo recorded';
  }

  function proofTile(label,time,photo,status){
    const hasPhoto=!!photo;
    const statusText=proofStatusText(status, hasPhoto);
    return `<article class="actuals-proof-tile"><div class="actuals-proof-tile__media">${hasPhoto?`<img src="${esc(photo)}" alt="${esc(label)} photo proof" />`:'<span>—</span>'}</div><div><strong>${esc(label)}${time?` · ${esc(time)}`:''}</strong><small>${esc(statusText)}</small></div></article>`;
  }
  function showProof(employeeId,day,shift){
    const employee=emp(employeeId);
    const entry=A.entry(employeeId,day,shift);
    const dialog=document.createElement('dialog');
    dialog.className='actuals-proof-dialog rs-dialog';
    dialog.innerHTML=`<div class="actuals-proof-card rs-dialog-card"><div class="actuals-proof-head rs-dialog-card__head"><span class="rs-icon-badge">${photoIconSvg()}</span><div><h2>Badge photo proof</h2><p>${esc(employee?.name||'Employee')} · ${esc(day)} ${esc(shift)}</p></div></div><div class="actuals-proof-grid">${proofTile('Clock in',entry.clockIn,entry.clockInPhoto,entry.clockInPhotoStatus)}${entry.clockOut||entry.clockOutPhotoStatus?proofTile('Clock out',entry.clockOut,entry.clockOutPhoto,entry.clockOutPhotoStatus):''}</div><div class="actuals-proof-actions rs-dialog-card__actions"><button type="button" class="rs-modal-btn is-primary" data-proof-close>Close</button></div></div>`;
    document.body.appendChild(dialog);
    dialog.addEventListener('click',event=>{if(event.target===dialog || event.target.closest('[data-proof-close]'))dialog.close();});
    dialog.addEventListener('close',()=>dialog.remove());
    dialog.showModal();
  }

  Restogogo.actuals=Object.assign(Restogogo.actuals||{},{render,showProof});
})();
