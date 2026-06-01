/** Employee self-service rendering. Loaded after employee-self-service.state.js. */
(function(){
  const ESS = Restogogo.employeeSelfServiceModule = Restogogo.employeeSelfServiceModule || {};
  const Metrics = Restogogo.services.metrics;
  const Toolbar = Restogogo.services.toolbar;
  const Grid = Restogogo.services.weeklyGrid;
  const ModuleHeader = Restogogo.services.moduleHeader;
  const Icons = Restogogo.icons;

  ESS.serviceIcon = function serviceIcon(shift,className='employee-slot-svg'){
    return Icons.svg(shift === 'Lunch' ? 'sun' : 'moon', className);
  };

  function calendarCardToneClass(stateClass=''){
    if(/is-live/.test(stateClass))return 'rs-calendar-card--live';
    if(/is-done/.test(stateClass))return 'rs-calendar-card--actual';
    if(/is-leave-/.test(stateClass))return 'rs-calendar-card--absence';
    if(/is-available/.test(stateClass))return 'rs-calendar-card--available';
    if(/is-planned/.test(stateClass))return 'rs-calendar-card--planned';
    return 'rs-calendar-card--empty';
  }

  ESS.renderMetrics = function renderMetrics(employee, view='schedule'){
    if(!employee){
      const title = view === 'worked' ? 'My time' : 'My schedule';
      const helper = 'Select an employee to continue';
      return [
        Metrics.card({className:'rs-metric--hero',tone:'warning',icon:'users',label:title,value:'No employee',meta:helper}),
        Metrics.card({tone:'week',icon:'calendar',label:'Availability',value:'—',meta:helper}),
        Metrics.card({tone:'hours',icon:'clock',label:view === 'worked' ? 'Worked time' : 'Planned hours',value:'—',meta:'No employee selected'}),
        Metrics.card({tone:'neutral',icon:'check',label:view === 'worked' ? 'Leave balance' : 'Next shift',value:'—',meta:'No employee selected'})
      ].join('');
    }
    const workflow=ESS.employeeWorkflow(employee);
    const stats=workflow.weekStats;
    const status=data.status==='Published'?'Published':'Not published';
    const submission=workflow.availabilitySubmission;
    const leave=workflow.leaveSummary;
    if(view==='worked'){
      const monthStats=workflow.monthStats;
      const balance=workflow.balance;
      const pendingLabel=balance.pending ? `${ESS.formatDayCount(balance.pending)} pending` : `${ESS.formatDayCount(balance.entitlement)} entitlement`;
      return [
        Metrics.card({detailKey:'employee.time.availability',className:'rs-metric--hero',tone:submission.tone,icon:'calendar',label:'Availability',value:submission.value,meta:submission.detail}),
        Metrics.card({detailKey:'employee.time.leave',tone:leave.totalPending?'warning':'success',icon:'palm',label:'Leave requests',value:String(leave.totalPending),meta:leave.drafts?`${leave.drafts} unsaved leave slots`:`${leave.pending} pending / ${leave.approved} approved`}),
        Metrics.card({detailKey:'employee.time.worked',tone:'hours',icon:'clock',label:'Worked time',value:fmtHours(monthStats.workedHours),meta:`${monthStats.workedDays} worked days / ${monthStats.openBadges} live`}),
        Metrics.card({detailKey:'employee.time.holiday',tone:balance.entitlement?'success':'warning',icon:'palm',label:'Holiday left',value:balance.entitlement?`${ESS.formatDayCount(balance.remaining)}d`:'-',meta:pendingLabel})
      ].join('');
    }
    return [
      Metrics.card({detailKey:'employee.schedule.status',className:'rs-metric--hero',tone:status==='Published'?'success':'warning',icon:'document',label:'My schedule',value:status,meta:status==='Published'?'Official weekly rota':'Draft planning is manager-only'}),
      Metrics.card({detailKey:'employee.schedule.availability',tone:submission.tone,icon:'calendar',label:'Availability',value:submission.value,meta:submission.detail}),
      Metrics.card({detailKey:'employee.schedule.hours',tone:'hours',icon:'clock',label:'Planned hours',value:fmtHours(stats.plannedHours),meta:`${stats.plannedSlots} planned slots`}),
      Metrics.card({detailKey:'employee.schedule.next',tone:'cost',icon:'check',label:'Next shift',value:stats.plannedSlots?'Next':'0',meta:workflow.nextShift})
    ].join('');
  };

  ESS.absenceStatusIcon = function absenceStatusIcon(absence, leaveDrafted=false, className=''){
    if(!absence && !leaveDrafted)return '';
    const status=absence?.status || 'Pending';
    const state=Restogogo.logic?.absences?.statusState?.(status) || 'pending';
    const label=leaveDrafted ? 'Pending leave request' : status;
    return Icons.status(state,{label,className:`employee-slot-status ${className}`.trim()});
  };

  ESS.renderTimeModeBar = function renderTimeModeBar(){
    return `<div class="employee-schedule-mode-toggle rs-mode-toggle" role="toolbar" aria-label="Employee time mode">
        <button type="button" data-employee-self-service-mode="availability" class="${ESS.state.draftMode==='availability'?'is-active':''}">Availability</button>
        <button type="button" data-employee-self-service-mode="leave" class="${ESS.state.draftMode==='leave'?'is-active':''}">Leave</button>
      </div>`;
  };

  ESS.renderTimeActions = function renderTimeActions(){
    return Toolbar.saveActions({
      dirty:ESS.hasSelfServiceDrafts(),
      actionAttr:'data-employee-self-service-action',
      cancelAction:'cancel',
      clickAction:'save',
      cancelData:{'data-employee-self-service-cancel':true},
      saveData:{'data-employee-self-service-save':true},
      ariaLabel:'Employee schedule actions'
    });
  };

  ESS.renderEmployeeCalendarToolbar = function renderEmployeeCalendarToolbar(view){
    return Toolbar.gridToolbar({
      tag:'section',
      className:'employee-calendar-toolbar',
      ariaLabel:view === 'worked' ? 'My Time calendar controls' : 'My Schedule calendar controls',
      leading:[ESS.renderTimeModeBar()],
      center:ESS.renderEmployeeCalendarSelector(view),
      actions:[ESS.renderTimeActions()]
    });
  };

  ESS.renderEmployeeSlot = function renderEmployeeSlot(model){
    const variant=model.variant === 'month' ? 'month' : 'week';
    const host=variant === 'month' ? 'employee-worked-slot' : 'employee-schedule-shift';
    const tag=variant === 'month' ? 'div' : 'article';
    const interactive=model.editable !== false;
    const dataAttrs=[
      interactive ? 'data-employee-self-service-slot' : '',
      `data-date="${esc(model.dateValue)}"`,
      variant === 'month' ? '' : `data-day="${esc(model.day || '')}"`,
      `data-shift="${esc(model.shift)}"`,
      interactive ? '' : 'aria-disabled="true"'
    ].filter(Boolean).join(' ');
    const interactiveAttrs=interactive ? ' role="button" tabindex="0"' : '';
    const densityClass=variant === 'month' ? 'rs-calendar-card--density-icon-dense' : 'rs-calendar-card--density-icon-weekly';
    const classes=['employee-slot',host,'rs-calendar-card',calendarCardToneClass(model.stateClass),densityClass,variant==='month'?'is-compact':'is-weekly',interactive?'':'is-readonly',model.shift==='Lunch'?'is-lunch':'is-evening',model.stateClass,model.drafted?'is-draft':'',model.conflict?'has-conflict':''].filter(Boolean).join(' ');
    return `<${tag}${interactiveAttrs} ${dataAttrs} class="${classes}" aria-label="${esc(`${model.shift} ${model.title}`)}">${model.statusIcon || ''}<span class="rs-calendar-card-icon employee-slot-icon" aria-hidden="true">${model.iconMarkup || ''}</span><div class="rs-calendar-card-copy employee-slot-copy"><strong>${esc(model.title)}</strong><small>${esc(model.detail || '')}</small></div></${tag}>`;
  };

  ESS.scheduleSlotModel = function scheduleSlotModel(employee, day, shift){
    const date=dateForDay(day);
    const dateValue=localISO(date);
    const absence=ESS.visibleAbsenceForSlot(employee,day,shift);
    const leaveDrafted=ESS.isLeaveDrafted(dateValue,shift);
    const planned=ESS.isSlotPlanned(employee,day,shift);
    const available=ESS.effectiveAvailabilityForDate(employee,date,shift);
    const range=ESS.slotRange(employee,day,shift);
    const zone=ESS.plannedZone(employee,day,shift);
    const drafted=Object.prototype.hasOwnProperty.call(ESS.state.availabilityDraft,ESS.availabilityDraftKey(dateValue,shift)) || leaveDrafted;
    const actual=ESS.actualEntryForDate(employee,date,shift);
    const editable=ESS.canEditSelfServiceDate(dateValue) && !(actual.clockIn || actual.clockOut);

    if(absence || leaveDrafted){
      return {variant:'week',dateValue,day,shift,editable,drafted,stateClass:absence?.status==='Approved'?'is-leave-approved':'is-leave-pending',title:absence?absenceDisplayLabel(absence,'Leave'):ESS.defaultAbsenceLabel(),detail:leaveDrafted?'Pending request':`${absence.shift || 'Full day'}`,iconMarkup:absence?absenceIconMarkup(absence,'employee-slot-absence-icon'):ESS.defaultAbsenceIconMarkup('employee-slot-absence-icon'),statusIcon:ESS.absenceStatusIcon(absence,leaveDrafted)};
    }
    if(planned){
      const hours = hoursFromRange(range);
      return {variant:'week',dateValue,day,shift,editable,drafted,stateClass:'is-planned is-published',conflict:!available,title:shift,detail:`${zone}${hours ? ` · ${fmtHours(hours)}` : ''}`,iconMarkup:ESS.serviceIcon(shift)};
    }
    if(available){
      return {variant:'week',dateValue,day,shift,editable,drafted,stateClass:'is-available',title:'Available',detail:displayTimeRange(range) || 'Open slot',iconMarkup:ESS.serviceIcon(shift)};
    }
    return {variant:'week',dateValue,day,shift,editable,drafted,stateClass:'is-off',title:'Off',detail:'No planned shift',iconMarkup:ESS.serviceIcon(shift)};
  };

  ESS.renderScheduleSlot = function renderScheduleSlot(employee, day, shift){
    return ESS.renderEmployeeSlot(ESS.scheduleSlotModel(employee,day,shift));
  };

  ESS.renderEmployeeLegend = function renderEmployeeLegend(view){
    const items = view === 'worked'
      ? [
        {className:'is-available',label:'Available'},
        {className:'is-actual',label:'Worked'},
        {className:'is-open',label:'Live badge'},
        {className:'is-absence',label:'Leave'},
        {className:'is-draft',label:'Unsaved change'}
      ]
      : [
        {className:'is-planned',label:'Published shift'},
        {className:'is-available',label:'Available'},
        {className:'is-unavailable',label:'Off'},
        {className:'is-absence',label:'Leave'},
        {className:'is-conflict',label:'Conflict'}
      ];
    return Grid.legend({ariaLabel:view === 'worked' ? 'My Time legend' : 'My Schedule legend', items});
  };

  ESS.renderSchedule = function renderSchedule(employee){
    const rows=days.map(day=>{
      const date=dateForDay(day);
      const cells=shifts.map(shift=>ESS.renderScheduleSlot(employee,day,shift)).join('');
      return `<article class="employee-schedule-row"><div class="employee-schedule-day"><strong>${esc(day.slice(0,3))}</strong><span>${esc(shortDisplayDate(date))}</span></div>${cells}</article>`;
    }).join('');
    return `<section class="employee-schedule-tab-panel rs-tab-panel is-schedule">${ESS.renderEmployeeCalendarToolbar('schedule')}<div class="employee-schedule-board-head"><span>Day</span><strong>Lunch</strong><strong>Evening</strong></div><div class="employee-schedule-grid" id="employeeScheduleGrid">${rows}</div>${ESS.renderEmployeeLegend('schedule')}</section>`;
  };

  ESS.renderEmployeeCalendarSelector = function renderEmployeeCalendarSelector(view){
    const worked=view==='worked';
    return Metrics.periodSelector({
      id:worked?'employeeTimeWeekMetric':'employeeScheduleWeekMetric',
      ariaLabel:worked?'Change month':'Change week',
      prevId:worked?'employeeTimePrevMonth':'employeeSchedulePrevWeek',
      nextId:worked?'employeeTimeNextMonth':'employeeScheduleNextWeek',
      inputId:worked?'employeeTimeMonthStart':'employeeScheduleWeekStart',
      inputAriaLabel:worked?'Select month reference date':'Select week start date',
      prevAriaLabel:worked?'Previous month':'Previous week',
      nextAriaLabel:worked?'Next month':'Next week',
      valueId:worked?'employeeTimeMonthLabel':'employeeScheduleWeekLabel',
      label:worked?'Month':'Week',
      value:worked?ESS.monthLabel():weekDisplayRange(),
      inputValue:data.weekStart
    });
  };

  ESS.workedSlotModel = function workedSlotModel(employee, date, shift){
    const dateValue=localISO(date);
    const editable=ESS.canEditSelfServiceDate(dateValue);
    const entry=ESS.actualEntryForDate(employee,date,shift);
    const planned=ESS.plannedForDate(employee,date,shift);
    const available=ESS.effectiveAvailabilityForDate(employee,date,shift);
    const absence=absenceForDate(employee,dateValue,shift,['Approved','Pending']);
    const leaveDrafted=ESS.isLeaveDrafted(dateValue,shift);
    const plannedRange=ESS.rangeForDate(employee,date,shift);
    const plannedText=planned ? displayTimeRange(plannedRange) : '';
    const plannedHours=planned && plannedRange ? fmtHours(hoursFromRange(plannedRange)) : '';
    const hasActual=!!entry.clockIn;
    const actualHours=ESS.A()?.actualHoursFor?.(employee,days[(date.getDay()+6)%7],shift,ESS.weekPayloadForDate(date)||data) || hoursFromRange(entry.clockIn && entry.clockOut ? `${entry.clockIn}-${entry.clockOut}` : '');
    const drafted=Object.prototype.hasOwnProperty.call(ESS.state.availabilityDraft,ESS.availabilityDraftKey(dateValue,shift)) || leaveDrafted;

    if(hasActual){
      return {variant:'month',dateValue,shift,editable:false,drafted,stateClass:entry.clockOut?'is-done':'is-live',title:`${entry.clockIn}-${entry.clockOut || 'live'}`,detail:`${fmtHours(actualHours)} worked`,iconMarkup:Icons.svg(entry.clockOut ? 'clock' : 'timer','employee-slot-svg')};
    }
    if(absence || leaveDrafted){
      return {variant:'month',dateValue,shift,editable,drafted,stateClass:absence?.status==='Approved'?'is-leave-approved':'is-leave-pending',title:absence?absenceDisplayLabel(absence,'Leave'):ESS.defaultAbsenceLabel(),detail:absence?`${absence.status} · ${absence.shift || shift}`:'Pending request',iconMarkup:absence?absenceIconMarkup(absence,'employee-slot-absence-icon'):ESS.defaultAbsenceIconMarkup('employee-slot-absence-icon'),statusIcon:ESS.absenceStatusIcon(absence,leaveDrafted,'employee-worked-status')};
    }
    if(planned){
      return {variant:'month',dateValue,shift,editable,drafted,stateClass:'is-planned',conflict:!available,title:shift,detail:plannedText || plannedHours || 'Planned shift',iconMarkup:ESS.serviceIcon(shift)};
    }
    if(available){
      return {variant:'month',dateValue,shift,editable,drafted,stateClass:'is-available',title:'Available',detail:'Open availability',iconMarkup:ESS.serviceIcon(shift)};
    }
    return {variant:'month',dateValue,shift,editable,drafted,stateClass:'is-empty',title:'-',detail:'No planned shift',iconMarkup:ESS.serviceIcon(shift)};
  };

  ESS.renderWorkedDate = function renderWorkedDate(employee, date){
    const base=new Date(validDate(data?.weekStart) || new Date());
    const inMonth=date.getMonth()===base.getMonth();
    const column=(date.getDay()+6)%7; // Mon=0 … Sun=6 — drives Actuals-style per-column zebra.
    let total=0;
    let live=false;
    const rows=shifts.map(shift=>{
      const model=ESS.workedSlotModel(employee,date,shift);
      const entry=ESS.actualEntryForDate(employee,date,shift);
      if(entry.clockIn && !entry.clockOut)live=true;
      total += entry.clockIn ? (ESS.A()?.actualHoursFor?.(employee,days[column],shift,ESS.weekPayloadForDate(date)||data) || hoursFromRange(entry.clockIn && entry.clockOut ? `${entry.clockIn}-${entry.clockOut}` : '')) : 0;
      return ESS.renderEmployeeSlot(model);
    }).join('');
    const html=`<article class="rs-calendar-day employee-worked-day ${inMonth?'':'is-outside'} ${live?'is-live':''} ${column%2?'day-alt':''}"><header class="rs-calendar-day__head"><strong>${date.getDate()}</strong><b class="rs-calendar-day__total">${esc(fmtHours(total))}</b></header><div class="rs-calendar-day__slots rs-calendar-day__slots--services employee-worked-slots">${rows}</div></article>`;
    return {html,total};
  };

  ESS.renderWorked = function renderWorked(employee){
    const dates=ESS.monthDates();
    const weekCount=Math.max(5,Math.ceil(dates.length/7));
    let grid='';
    for(let i=0;i<dates.length;i+=7){
      let weekTotal=0;
      dates.slice(i,i+7).forEach(date=>{
        const cell=ESS.renderWorkedDate(employee,date);
        weekTotal += cell.total;
        grid += cell.html;
      });
      grid += `<div class="employee-week-total"><span>Week</span><b>${esc(fmtHours(weekTotal))}</b></div>`;
    }
    return `<section class="employee-schedule-tab-panel rs-tab-panel is-worked rs-calendar-simple">${ESS.renderEmployeeCalendarToolbar('worked')}<div class="rs-calendar-simple__scroll employee-worked-calendar-scroll"><div class="rs-calendar-simple__weekdays employee-worked-weekdays"><span>Mon</span><span>Tue</span><span>Wed</span><span>Thu</span><span>Fri</span><span>Sat</span><span>Sun</span><span class="employee-week-total-head">Week</span></div><div class="rs-calendar-simple__grid employee-worked-calendar" style="--employee-time-week-count:${weekCount}">${grid}</div></div>${ESS.renderEmployeeLegend('worked')}</section>`;
  };

  ESS.renderEmployeePage = function renderEmployeePage(rootId, view){
    const root=$(rootId);
    if(!root||!data)return;
    const employee=ESS.currentEmployee();
    const moduleName = view === 'worked' ? 'employee-time' : 'employee-schedule';
    const title = view === 'worked' ? 'My Time' : 'My Schedule';
    const summaryLabel = view === 'worked' ? 'Worked time summary' : 'Schedule summary';
    const boardLabel = view === 'worked' ? 'Employee worked time' : 'Employee weekly schedule';
    const subtitle = employee
      ? (view === 'worked'
        ? `${employee.name || `${employee.firstName || ''} ${employee.lastName || ''}`.trim() || 'Employee'}. Worked time, leave and availability. ${ESS.monthLabel()}.`
        : `${employee.name || `${employee.firstName || ''} ${employee.lastName || ''}`.trim() || 'Employee'}. Weekly rota and availability. ${weekDisplayRange()}.`)
      : 'Select an employee to continue.';
    const boardHtml = employee
      ? (view === 'worked' ? ESS.renderWorked(employee) : ESS.renderSchedule(employee))
      : '<section class="rs-empty-state rs-empty-state--compact"><strong>No employee selected.</strong><span>Select an employee to continue.</span></section>';

    root.innerHTML=Restogogo.services.pageShell.standard({
      moduleName,
      title,
      headerHtml:ModuleHeader.content({moduleName,title,subtitle}),
      metricsClass:'rs-metrics--hero-first',
      metricsHtml:ESS.renderMetrics(employee, view),
      metricsAria:summaryLabel,
      boardClass:'employee-calendar-card',
      boardAria:boardLabel,
      boardHtml
    });
  };

  ESS.render = function render(){
    const active=Restogogo.shell?.activePageName?.();
    if(active==='employee-time'){
      ESS.renderEmployeePage('employeeTimeRoot','worked');
      return;
    }
    if(active==='employee-schedule'){
      ESS.renderEmployeePage('employeeScheduleRoot','schedule');
    }
  };
})();
