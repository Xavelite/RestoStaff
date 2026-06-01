/* restogogo metric detail service.
 * Top metrics are operational gateways: click a metric, inspect details, act if needed.
 * Modules only declare a metric key; all dialog behavior lives here.
 */
(function(){
  const R = window.Restogogo = window.Restogogo || {};
  R.services = R.services || {};
  const UI = R.services.metricDetailUi;
  const {badge,employeeName,roleName,dateLabel,tone,empty,pill,row,section,modal} = UI;

  let dialog = null;
  let currentKey = '';
  let bound = false;

  function activeList(){return activeEmployees(data);}
  function homeModel(){return R.services.home?.build?.(data) || null;}
  function planningRows(){return R.logic?.planning?.weekRows?.(data) || [];}
  function planningSummary(){return R.logic?.planning?.summarizeRows?.(planningRows()) || {hours:0,cost:0};}
  function coverageSummary(){return R.logic?.coverage?.weekSummary?.(data) || {requirementCount:0,issueCount:0,issues:[],status:'missing',missingPeople:0,extraPeople:0};}
  function availabilityConflicts(){return R.planning?.conflicts?.() || [];}
  function actualTotals(){return R.logic?.actuals?.weekTotals?.() || {actual:0,planned:0,variance:0,open:0,badged:0};}
  function actualRows(){return R.logic?.actuals?.exportRows?.(data) || [];}
  function pendingAbsences(){return (homeModel()?.actions?.pendingAbsences || []);}
  function missingPayrollRows(){return activeList().map(employee=>({employee,missing:employeePayrollMissingFields(employee)})).filter(row=>row.missing.length);}

  function absenceActions(employeeId,absenceId){
    return `<button type="button" class="rs-detail-mini-btn is-success" data-rs-detail-absence-status="Approved" data-employee-id="${esc(employeeId)}" data-absence-id="${esc(absenceId)}">Approve</button><button type="button" class="rs-detail-mini-btn" data-rs-detail-absence-status="Rejected" data-employee-id="${esc(employeeId)}" data-absence-id="${esc(absenceId)}">Reject</button>`;
  }

  function pendingAbsenceSection(){
    const rows = pendingAbsences().map(({employee,absence})=>row({
      icon:'palm',
      tone:'pending',
      title:employeeName(employee),
      meta:`${dateLabel(absence.start)}${absence.end && absence.end !== absence.start ? ` – ${dateLabel(absence.end)}` : ''} · ${absence.shift || 'Full day'} · ${absence.reason || 'Leave'}`,
      actions:absenceActions(employee.id,absence.id)
    })).join('');
    return section('Leave approvals',`${pendingAbsences().length} pending`,rows || empty('No pending leave approvals.'));
  }

  function payrollSection(){
    const rows = missingPayrollRows().map(({employee,missing})=>row({
      icon:'payroll',
      tone:'warning',
      title:employeeName(employee),
      meta:roleName(employee),
      value:`${missing.length} missing`
    })).join('');
    return section('Missing payroll info',`${missingPayrollRows().length} employees`,rows || empty('Payroll information looks complete.'));
  }

  function coverageRows(limit=12){
    const summary = coverageSummary();
    if(!summary.requirementCount)return empty('Coverage setup is missing. Define expected staffing in Restaurant setup.');
    if(!summary.issues.length)return empty('Coverage requirements match the current planning.');
    return summary.issues.slice(0,limit).map(issue=>row({
      icon:issue.status === 'under' ? 'alert' : 'info',
      tone:issue.status === 'under' ? 'danger' : 'warning',
      title:`${issue.day} · ${issue.serviceKey}`,
      meta:`${issue.zoneName || 'Zone'} · ${issue.positionName || 'Role'}`,
      value:issue.delta < 0 ? `${Math.abs(issue.delta)} missing` : `${issue.delta} extra`
    })).join('') + (summary.issues.length > limit ? `<p class="rs-detail-more">+${summary.issues.length - limit} more coverage issues</p>` : '');
  }

  function conflictRows(limit=12){
    const conflicts = availabilityConflicts();
    if(!conflicts.length)return empty('No availability conflicts in this planning week.');
    return conflicts.slice(0,limit).map(item=>row({
      icon:'alert',
      tone:'danger',
      title:employeeName(item.employee),
      meta:`${item.day} · ${item.shift} · ${item.range || 'Planned shift'}`,
      value:item.zone || 'Zone'
    })).join('') + (conflicts.length > limit ? `<p class="rs-detail-more">+${conflicts.length - limit} more conflicts</p>` : '');
  }

  function unsubmittedSection(){
    const rows = activeList().map(employee=>({employee,status:R.services.employeeWorkflow?.availabilitySubmission?.(employee,data) || {state:data?.submitted?.[employee.id]?'submitted':'missing',tone:'warning',label:data?.submitted?.[employee.id]?'Submitted':'Not submitted',detail:''}}))
      .filter(item=>item.status.state !== 'submitted')
      .map(item=>row({
        icon:'calendar',
        tone:item.status.tone || 'warning',
        title:employeeName(item.employee),
        meta:item.status.detail || roleName(item.employee),
        value:item.status.label || 'Not submitted'
      })).join('');
    return section('Unsubmitted availability','Current week',rows || empty('All active employees submitted availability.'));
  }

  function missingBadgesSection(){
    const missing = homeModel()?.week?.missingBadges || [];
    const rows = missing.slice(0,12).map(slot=>row({
      icon:'badge',
      tone:'warning',
      title:slot.name,
      meta:`${slot.day} · ${slot.shift} · ${slot.range || 'Planned shift'}`,
      value:slot.zone || ''
    })).join('') + (missing.length > 12 ? `<p class="rs-detail-more">+${missing.length - 12} more missing badges</p>` : '');
    return section('Missing badges',`${missing.length} shifts`,rows || empty('No missing badges to review.'));
  }

  function homeLive(){
    const model = homeModel();
    const liveRows = [
      ...(model.today.late || []).map(slot=>({slot,status:slot.status || 'Late',tone:'danger'})),
      ...(model.today.working || []).map(slot=>({slot,status:slot.unplanned?'Unplanned live':'Working now',tone:'success'})),
      ...(model.today.upcoming || []).map(slot=>({slot,status:'Upcoming',tone:'neutral'}))
    ];
    const content = liveRows.length ? liveRows.map(({slot,status,tone:t})=>row({icon:t==='success'?'timer':'alert',tone:t,title:slot.name,meta:`${slot.shift} · ${slot.range || ''} · ${slot.zone || slot.role || 'Team'}`,value:status})).join('') : empty('No live alerts yet.');
    return modal('Today live','Working now, late/no-show and upcoming today','timer','success',section('Live monitor',model.day,content),[
      {label:'Go to Actuals',page:'actuals',primary:true},{label:'Close',action:'close'}
    ]);
  }

  function homeUpcoming(){
    const model = homeModel();
    const rows = model.today.upcoming.map(slot=>row({icon:'calendar',tone:'neutral',title:slot.name,meta:`${slot.shift} · ${slot.zone || slot.role || 'Team'}`,value:slot.range || ''})).join('');
    return modal('Upcoming today',model.day,'calendar','neutral',section('Upcoming shifts',`${model.today.upcoming.length} shifts`,rows || empty('No upcoming shifts today.')),[
      {label:'Go to Planning',page:'planning',primary:true},{label:'Close',action:'close'}
    ]);
  }

  function homeActions(){
    const model = homeModel();
    const body = [pendingAbsenceSection(),payrollSection(),section('Planning conflicts','Coverage overview',coverageRows(8)),unsubmittedSection(),missingBadgesSection()].join('');
    return modal('Action required',`${model.day} · operational review`,'alert','warning',body,[
      {label:'Go to Team',page:'team',primary:true},{label:'Go to Planning',page:'planning'},{label:'Close',action:'close'}
    ]);
  }

  function homeWeekPulse(){
    const model = homeModel();
    const body = section('Week pulse',model.weekLabel,[
      row({icon:'clock',tone:'neutral',title:'Planned hours',value:fmtHours(model.week.plannedHours),meta:model.week.status}),
      row({icon:'badge',tone:'neutral',title:'Actual hours',value:fmtHours(model.week.actualHours),meta:'Badged so far'}),
      row({icon:'zone',tone:model.week.coverage.tone,title:'Coverage status',value:model.week.coverage.label,meta:model.week.coverage.detail}),
      row({icon:'alert',tone:model.week.missingBadges.length?'warning':'success',title:'Missing badges',value:String(model.week.missingBadges.length),meta:'Started planned shifts'})
    ].join(''));
    return modal('Week pulse',model.weekLabel,'variance',model.week.coverage.tone,body,[
      {label:'Go to Planning',page:'planning',primary:true},{label:'Go to Actuals',page:'actuals'},{label:'Close',action:'close'}
    ]);
  }

  function planningStatus(){
    const isPublished = data?.status === 'Published';
    return modal('Schedule status',weekDisplayRange(),isPublished?'check':'document',isPublished?'success':'warning',section('Current status','Planning workflow',row({icon:isPublished?'check':'edit',tone:isPublished?'success':'warning',title:isPublished?'Published':'Draft',meta:isPublished?'Visible to team':'Editable by manager',value:data?.status || 'Draft'})),[
      {label:'Go to Planning',page:'planning',primary:true},{label:'Close',action:'close'}
    ]);
  }

  function planningHours(){
    const rows = planningRows();
    const summary = planningSummary();
    const top = activeList().map(employee=>({employee,hours:R.logic?.planning?.employeeWeekTotal?.(employee,data) || 0})).filter(item=>item.hours>0).sort((a,b)=>b.hours-a.hours).slice(0,10);
    const body = section('Planned hours',`${rows.length} shifts`,top.map(item=>row({icon:'user',tone:'neutral',title:employeeName(item.employee),meta:roleName(item.employee),value:fmtHours(item.hours)})).join('') || empty('No planned hours yet.'));
    return modal('Planned hours',`${fmtHours(summary.hours)} this week`,'clock','neutral',body,[{label:'Go to Planning',page:'planning',primary:true},{label:'Close',action:'close'}]);
  }

  function planningCoverage(){
    const summary = coverageSummary();
    const label = !summary.requirementCount ? 'Setup missing' : (summary.issueCount ? `${summary.issueCount} issue${summary.issueCount===1?'':'s'}` : 'Coverage OK');
    const body = section('Coverage overview',`${summary.missingPeople || 0} missing · ${summary.extraPeople || 0} extra`,coverageRows(18));
    return modal('Coverage',label,'zone',summary.status==='ok'?'success':'warning',body,[{label:'Go to Restaurant setup',page:'restaurant',primary:!summary.requirementCount},{label:'Go to Planning',page:'planning',primary:!!summary.requirementCount},{label:'Close',action:'close'}]);
  }

  function planningConflictsDetail(){
    const conflicts = availabilityConflicts();
    const body = section('Availability conflicts',`${conflicts.length} conflict${conflicts.length===1?'':'s'}`,conflictRows(18));
    return modal('Availability conflicts','Planned shifts outside availability / leave','alert',conflicts.length?'danger':'success',body,[{label:'Go to Planning',page:'planning',primary:true},{label:'Close',action:'close'}]);
  }

  function actualsEmployees(){
    const relevant = R.logic?.actuals?.relevantEmployees?.() || [];
    const rows = relevant.map(employee=>{
      const stats = R.logic?.actuals?.employeeStats?.(employee,data) || {};
      return row({icon:'user',tone:(stats.openClockouts || stats.missingBadges)?'warning':'neutral',title:employeeName(employee),meta:roleName(employee),value:`${stats.openClockouts || 0} open · ${stats.missingBadges || 0} missing`});
    }).join('');
    return modal('Employees',`${relevant.length} relevant · ${activeList().length} active`,'users','neutral',section('Actuals scope','Employees shown in Actuals',rows || empty('No actuals to review yet.')),[{label:'Go to Actuals',page:'actuals',primary:true},{label:'Close',action:'close'}]);
  }

  function actualsHours(){
    const totals = actualTotals();
    return modal('Actual hours',weekDisplayRange(),'clock','neutral',section('Worked time','Badged so far',[
      row({icon:'clock',title:'Actual hours',value:fmtHours(totals.actual),meta:`${totals.badged} badged shifts`}),
      row({icon:'calendar',title:'Planned hours',value:fmtHours(totals.planned),meta:'Current planning'}),
      row({icon:'variance',tone:Math.abs(totals.variance)>0.25?'warning':'success',title:'Variance',value:fmtHours(totals.variance),meta:'Actual vs planned'})
    ].join('')),[{label:'Go to Actuals',page:'actuals',primary:true},{label:'Close',action:'close'}]);
  }

  function actualsOpenClockouts(){
    const rows = actualRows().filter(item=>item.entry?.clockIn && !item.entry?.clockOut).map(item=>row({icon:'timer',tone:'warning',title:employeeName(item.employee),meta:`${item.day} · ${item.shift} · in ${item.entry.clockIn}`,value:item.zone || ''})).join('');
    return modal('Missing clock-outs','Open live entries','timer','warning',section('Open clock-outs',`${actualTotals().open} employees to review`,rows || empty('No missing clock-outs.')),[{label:'Go to Actuals',page:'actuals',primary:true},{label:'Close',action:'close'}]);
  }

  function actualsVariance(){
    const rows = actualRows().filter(item=>Math.abs(item.variance || 0) > 0.25).map(item=>row({icon:'variance',tone:'warning',title:employeeName(item.employee),meta:`${item.day} · ${item.shift} · planned ${displayTimeRange(item.planned || '')}`,value:fmtHours(item.variance)})).join('');
    return modal('Variance','Actual vs planned','variance','neutral',section('Variance over 15 min','Payroll review helper',rows || empty('No meaningful variance detected.')),[{label:'Go to Actuals',page:'actuals',primary:true},{label:'Close',action:'close'}]);
  }

  function teamEmployees(){
    const employees = data?.employees || [];
    const rows = employees.map(employee=>row({icon:'user',tone:employee.active !== false?'success':'neutral',title:employeeName(employee),meta:roleName(employee),value:employee.active !== false?'Active':'Inactive'})).join('');
    return modal('Total employees',`${activeList().length} active · ${employees.length-activeList().length} inactive`,'users','neutral',section('Team directory','Employees in this restaurant',rows || empty('No employees yet.')),[{label:'Go to Team',page:'team',primary:true},{label:'Close',action:'close'}]);
  }

  function teamContracts(){
    const TeamModel = R.modules.TeamModel;
    const expiring = activeList().filter(TeamModel.expiringSoon).sort((a,b)=>(TeamModel.daysUntil(a.contractEnd)||999)-(TeamModel.daysUntil(b.contractEnd)||999));
    const rows = expiring.map(employee=>row({icon:'document',tone:'warning',title:employeeName(employee),meta:`Contract end ${dateLabel(employee.contractEnd)}`,value:`${TeamModel.daysUntil(employee.contractEnd)} days`})).join('');
    return modal('Contracts expiring','Next 45 days','calendar','warning',section('Renewals to review',`${expiring.length} contracts`,rows || empty('No urgent renewals.')),[{label:'Go to Team',page:'team',primary:true},{label:'Close',action:'close'}]);
  }

  function teamAbsences(){
    const TeamModel = R.modules.TeamModel;
    const monthCount = TeamModel.countAbsencesThisMonth(activeList());
    return modal('Absences this month',`${monthCount} approved/current month`,'palm','neutral',pendingAbsenceSection(),[{label:'Go to Team',page:'team',primary:true},{label:'Close',action:'close'}]);
  }

  function teamPayroll(){
    const ready = activeList().filter(employee=>!employeePayrollMissingFields(employee).length).length;
    return modal('Payroll ready',`${ready} of ${activeList().length} employees ready`,'payroll','neutral',payrollSection(),[{label:'Go to Team',page:'team',primary:true},{label:'Close',action:'close'}]);
  }

  function restaurantZones(){
    const zones = (data?.restaurantSetup?.zones || []).filter(zone=>zone.active !== false);
    const rows = zones.map(zone=>row({icon:'zone',tone:'neutral',title:zone.name,meta:(zone.services || []).join(', ') || 'Lunch & evening',value:zone.active === false ? 'Inactive' : 'Active'})).join('');
    return modal('Active zones','Restaurant setup','zone','neutral',section('Operational zones',`${zones.length} active`,rows || empty('No active zones configured.')),[{label:'Go to Restaurant',page:'restaurant',primary:true},{label:'Close',action:'close'}]);
  }

  function restaurantPositions(){
    const positions = (data?.restaurantSetup?.positions || []).filter(position=>position.active !== false);
    const rows = positions.map(position=>row({icon:'id',tone:'neutral',title:position.name,meta:'Linked to team & planning',value:money(position.hourlyCost || 0)})).join('');
    return modal('Positions','Restaurant setup','id','neutral',section('Active positions',`${positions.length} positions`,rows || empty('No active positions configured.')),[{label:'Go to Restaurant',page:'restaurant',primary:true},{label:'Close',action:'close'}]);
  }

  function restaurantOpening(){
    const hours = data?.restaurantSetup?.openingHours || {};
    const rows = days.map(day=>{
      const info = hours[day] || {};
      const open = info.open !== false;
      const ranges = shifts.map(shift=>info[shift] || '').filter(Boolean).join(' · ');
      return row({icon:'clock',tone:open?'success':'neutral',title:day,meta:ranges || 'No service hours',value:open?'Open':'Closed'});
    }).join('');
    return modal('Opening days','Lunch & evening setup','clock','neutral',section('Opening hours','Weekly services',rows),[{label:'Go to Restaurant',page:'restaurant',primary:true},{label:'Close',action:'close'}]);
  }


  function setupReadinessRows(){
    const summary = R.services.setupReadiness?.build?.(data) || {steps:[],issues:[],percent:0,detail:'Setup guide unavailable',tone:'warning'};
    const rows = summary.steps.map(step=>row({
      icon:step.done ? 'check' : 'alert',
      tone:step.tone,
      title:step.title,
      meta:(step.issues && step.issues[0]) || step.description,
      value:step.done ? 'Ready' : 'Review'
    })).join('');
    return {summary,rows};
  }

  function restaurantSetupReadiness(){
    const result = setupReadinessRows();
    return modal('Setup readiness',`${result.summary.percent || 0}% · ${result.summary.detail || ''}`,'list',result.summary.tone,section('Restaurant setup guide','Foundation for Planning, Home, Actuals and payroll',result.rows || empty('Setup guide unavailable.')),[{label:'Go to Restaurant setup',page:'restaurant',primary:true},{label:'Close',action:'close'}]);
  }

  function restaurantReadiness(){
    return restaurantSetupReadiness();
  }

  function employeeMetricTitle(key){
    if(String(key).includes('availability'))return 'Availability';
    if(String(key).includes('leave'))return 'Leave requests';
    if(String(key).includes('worked'))return 'Worked time';
    if(String(key).includes('holiday'))return 'Holiday balance';
    if(String(key).includes('next'))return 'Next shift';
    if(String(key).includes('hours'))return 'Planned hours';
    if(String(key).includes('status'))return 'Schedule status';
    return 'Employee self-service';
  }

  function employeeGeneric(key){
    const employee = emp(session.employeeId) || activeList()[0];
    const dates = (()=>{
      const base=new Date(validDate(data?.weekStart) || new Date());
      const first=new Date(base.getFullYear(),base.getMonth(),1);
      const firstGrid=new Date(first);
      firstGrid.setDate(first.getDate()-((first.getDay()+6)%7));
      const last=new Date(base.getFullYear(),base.getMonth()+1,0);
      const lastGrid=new Date(last);
      lastGrid.setDate(last.getDate()+(6-((last.getDay()+6)%7)));
      const count=Math.max(35,Math.round((lastGrid-firstGrid)/86400000)+1);
      return Array.from({length:count},(_,i)=>{const d=new Date(firstGrid);d.setDate(firstGrid.getDate()+i);return d;});
    })();
    const wf = R.services.employeeWorkflow?.workflow?.(employee,{source:data,monthDates:dates}) || {};
    const submission = wf.availabilitySubmission || {tone:'warning',label:'Not submitted',detail:'No availability status available',value:'Missing'};
    const leave = wf.leaveSummary || {pending:0,approved:0,drafts:0,totalPending:0};
    const week = wf.weekStats || {plannedHours:0,plannedSlots:0,availableSlots:0};
    const month = wf.monthStats || {workedHours:0,workedDays:0,openBadges:0};
    const balance = wf.balance || {remaining:0,pending:0,entitlement:0};
    const body = section('Employee workflow',employeeName(employee),[
      row({icon:'calendar',tone:submission.tone,title:'Availability',meta:submission.detail,value:submission.value}),
      row({icon:'palm',tone:leave.totalPending?'warning':'success',title:'Leave requests',meta:`${leave.pending} pending / ${leave.approved} approved`,value:String(leave.totalPending)}),
      row({icon:'clock',tone:'neutral',title:'Worked time',meta:`${month.workedDays} worked days / ${month.openBadges} live`,value:fmtHours(month.workedHours || 0)}),
      row({icon:'document',tone:data?.status==='Published'?'success':'warning',title:'Schedule',meta:wf.nextShift || 'No shift planned',value:data?.status || 'Draft'}),
      row({icon:'check',tone:'neutral',title:'Planned this week',meta:`${week.plannedSlots} slots / ${week.availableSlots} available`,value:fmtHours(week.plannedHours || 0)}),
      row({icon:'palm',tone:balance.entitlement?'success':'warning',title:'Holiday balance',meta:`${balance.pending || 0} pending days`,value:balance.entitlement?`${balance.remaining || 0}d`:'—'})
    ].join(''));
    return modal(employeeMetricTitle(key),'Employee self-service','user',submission.tone || 'neutral',body,[{label:'Go to My Time',page:'employee-time',primary:true},{label:'Close',action:'close'}]);
  }

  function generic(){return modal('Metric details','More details are not configured yet.','info','neutral',empty(),[{label:'Close',action:'close'}]);}

  const renderers = {
    'home.todayLive':homeLive,
    'home.upcoming':homeUpcoming,
    'home.actions':homeActions,
    'home.weekPulse':homeWeekPulse,
    'planning.status':planningStatus,
    'planning.hours':planningHours,
    'planning.coverage':planningCoverage,
    'planning.conflicts':planningConflictsDetail,
    'actuals.employees':actualsEmployees,
    'actuals.hours':actualsHours,
    'actuals.open':actualsOpenClockouts,
    'actuals.variance':actualsVariance,
    'team.employees':teamEmployees,
    'team.contracts':teamContracts,
    'team.absences':teamAbsences,
    'team.payroll':teamPayroll,
    'restaurant.zones':restaurantZones,
    'restaurant.positions':restaurantPositions,
    'restaurant.opening':restaurantOpening,
    'restaurant.setup':restaurantSetupReadiness,
    'restaurant.readiness':restaurantReadiness
  };

  function ensureDialog(){
    if(dialog)return dialog;
    dialog = document.createElement('dialog');
    dialog.className = 'rs-detail-dialog';
    document.body.appendChild(dialog);
    dialog.addEventListener('click',handleDialogClick);
    dialog.addEventListener('cancel',event=>{event.preventDefault();close();});
    dialog.addEventListener('close',()=>{dialog.replaceChildren();});
    return dialog;
  }

  function renderDialog(){
    const fn = renderers[currentKey] || (()=>employeeGeneric(currentKey));
    ensureDialog().innerHTML = fn() || generic();
  }

  function open(key){
    currentKey = String(key || '').trim();
    if(!currentKey)return;
    ensureDialog();
    if(dialog.open)dialog.close();
    renderDialog();
    dialog.showModal();
  }

  function close(){if(dialog?.open)dialog.close();}

  async function updateAbsenceStatus(employeeId,absenceId,status){
    const employee = (data?.employees || []).find(item=>String(item.id)===String(employeeId));
    const absence = (employee?.absences || []).find(item=>String(item.id)===String(absenceId));
    if(!employee || !absence)return;
    const cleanStatus = ['Approved','Rejected','Cancelled'].includes(status) ? status : 'Pending';
    const now = new Date().toISOString();
    await R.stateService.commitStateMutation({
      saveAction:window.RestogogoSaveContract.actions.absence(
        cleanStatus === 'Approved' ? window.RestogogoSaveContract.ACTION.ABSENCE.APPROVE : (cleanStatus === 'Rejected' ? window.RestogogoSaveContract.ACTION.ABSENCE.REJECT : window.RestogogoSaveContract.ACTION.ABSENCE.CANCEL_BY_MANAGER),
        {
          employeeId:employee.id,
          absenceId,
          payload:{
            manager_comment:cleanStatus === 'Rejected' ? 'Rejected from Home.' : null,
            cancellation_reason:cleanStatus === 'Cancelled' ? 'Cancelled from Home.' : null,
            metadata:{source:'home_metric_detail'}
          }
        }
      ),
      mutate:()=>{
        absence.status = cleanStatus;
        if(cleanStatus === 'Approved'){
          absence.approvedBy = 'manager';
          absence.approvedAt = now;
          absence.rejectedBy = '';
          absence.rejectedAt = '';
          absence.cancelledAt = '';
        }
        if(cleanStatus === 'Rejected'){
          absence.rejectedBy = 'manager';
          absence.rejectedAt = now;
          absence.approvedBy = '';
          absence.approvedAt = '';
          absence.cancelledAt = '';
        }
        if(cleanStatus === 'Cancelled')absence.cancelledAt = now;
      },
      render:()=>R.shell?.render?.(),
      successMessage:cleanStatus === 'Approved' ? 'Absence approved.' : 'Absence rejected.',
      successTone:cleanStatus === 'Approved' ? 'success' : 'warning',
      successIcon:cleanStatus === 'Approved' ? 'check' : 'alert',
      errorMessage:'Absence status was not saved. The change was rolled back.'
    });
    if(dialog?.open)renderDialog();
  }

  function handleDialogClick(event){
    if(event.target === dialog || event.target.closest('[data-rs-detail-close]')){event.preventDefault();close();return;}
    const nav = event.target.closest('[data-rs-detail-go]');
    if(nav){event.preventDefault();const page=nav.dataset.rsDetailGo;close();if(page)R.shell?.showPage?.(page);return;}
    const absenceButton = event.target.closest('[data-rs-detail-absence-status][data-employee-id][data-absence-id]');
    if(absenceButton){
      event.preventDefault();
      void updateAbsenceStatus(absenceButton.dataset.employeeId,absenceButton.dataset.absenceId,absenceButton.dataset.rsDetailAbsenceStatus);
    }
  }

  function bind(){
    if(bound)return;
    bound = true;
    document.addEventListener('click',event=>{
      const metric = event.target.closest('[data-rs-metric-detail]');
      if(!metric || metric.closest('dialog'))return;
      event.preventDefault();
      open(metric.dataset.rsMetricDetail);
    });
    document.addEventListener('keydown',event=>{
      const metric = event.target.closest?.('[data-rs-metric-detail]');
      if(!metric || event.key !== 'Enter' && event.key !== ' ')return;
      event.preventDefault();
      open(metric.dataset.rsMetricDetail);
    });
  }

  R.services.metricDetails = {bind,open,close};
})();
