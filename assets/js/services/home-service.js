/* Manager Home service: one operational aggregator for the manager cockpit. */
(function(){
  // How many minutes after a shift starts before a no-show is declared.
  // Override per-deployment via APP_CONFIG.lateThresholdMinutes (no DB change needed).
  const LATE_THRESHOLD_MINUTES = Restogogo.config?.lateThresholdMinutes || 45;
  const R = window.Restogogo = window.Restogogo || {};
  R.services = R.services || {};

  function nowMinutes(){
    const now = new Date();
    return now.getHours() * 60 + now.getMinutes();
  }

  function currentDayName(source = data){
    const today = todayISO();
    const weekStart = source?.weekStart || monday(today);
    const offset = Math.round((parseISO(today) - parseISO(weekStart)) / 86400000);
    return days[offset] || days[new Date().getDay() === 0 ? 6 : new Date().getDay() - 1] || 'Monday';
  }

  function currentDayOffset(source = data){
    const today = todayISO();
    const weekStart = source?.weekStart || monday(today);
    return Math.round((parseISO(today) - parseISO(weekStart)) / 86400000);
  }

  function rangeBoundsFor(employee, day, shift, source = data){
    const range = R.logic?.planning?.rangeFor?.(employee, day, shift, source) || timeRangeFor(employee, day, shift, source);
    const bounds = timeRangeBounds(range);
    return bounds ? Object.assign({range}, bounds) : null;
  }

  function plannedSlotsForDay(day, source = data){
    const slots = [];
    activeEmployees(source).forEach(employee => {
      shifts.forEach(shift => {
        if(!source?.planningSlots?.[employee.id]?.[day]?.[shift]?.planned)return;
        const bounds = rangeBoundsFor(employee, day, shift, source);
        if(!bounds)return;
        slots.push({
          employee,
          employeeId:employee.id,
          name:employee.name || 'Employee',
          role:employeePositionName(employee, source),
          day,
          shift,
          range:bounds.range,
          start:bounds.start,
          end:bounds.end,
          zone:assignmentZoneName(employee.id, day, shift, source) || suggestZone(employee, shift, source)
        });
      });
    });
    return slots.sort((a,b)=>a.start-b.start || a.name.localeCompare(b.name));
  }

  function actualEntryForSlot(slot, source = data){
    return R.logic?.actuals?.entry?.(slot.employeeId, slot.day, slot.shift, source) || getActualEntry(slot.employeeId, slot.day, slot.shift, source);
  }

  function isApprovedAbsence(slot, source = data){
    return !!absenceForDayShift(slot.employeeId, slot.day, slot.shift, ['Approved'], source);
  }

  function liveWorking(source = data){
    const day = currentDayName(source);
    const slotsByEmployeeShift = new Map(plannedSlotsForDay(day, source).map(slot => [`${slot.employeeId}|${slot.shift}`, slot]));
    const rows = [];
    activeEmployees(source).forEach(employee => shifts.forEach(shift => {
      const entry = R.logic?.actuals?.entry?.(employee.id, day, shift, source) || getActualEntry(employee.id, day, shift, source);
      if(!entry.clockIn || entry.clockOut)return;
      const plannedSlot = slotsByEmployeeShift.get(`${employee.id}|${shift}`);
      rows.push(Object.assign({
        employee,
        employeeId:employee.id,
        name:employee.name || 'Employee',
        role:employeePositionName(employee, source),
        day,
        shift,
        range:plannedSlot?.range || `${entry.clockIn}–…`,
        start:plannedSlot?.start || timeToMinutes(entry.clockIn),
        end:plannedSlot?.end || 1440,
        zone:plannedSlot?.zone || '',
        unplanned:!plannedSlot
      }, {clockIn:entry.clockIn, status:plannedSlot?'Live':'Unplanned live'}));
    }));
    return rows.sort((a,b)=>a.start-b.start || a.name.localeCompare(b.name));
  }

  function lateOrNoShow(source = data){
    const day = currentDayName(source);
    const now = nowMinutes();
    return plannedSlotsForDay(day, source)
      .filter(slot => slot.start <= now && !actualEntryForSlot(slot, source).clockIn && !isApprovedAbsence(slot, source))
      .map(slot => Object.assign({}, slot, {status:now - slot.start > LATE_THRESHOLD_MINUTES ? 'No-show' : 'Late'}));
  }

  function upcomingToday(source = data){
    const day = currentDayName(source);
    const now = nowMinutes();
    return plannedSlotsForDay(day, source)
      .filter(slot => slot.start > now)
      .slice(0, 6);
  }

  function pendingAbsences(source = data){
    const today = todayISO();
    return activeEmployees(source).flatMap(employee => (employee.absences || [])
      .filter(absence => String(absence.status || 'Pending') === 'Pending')
      .filter(absence => (normalizeDateString(absence.end || absence.start) || today) >= today)
      .map(absence => ({employee, absence})))
      .sort((a,b)=>String(a.absence.start).localeCompare(String(b.absence.start)) || a.employee.name.localeCompare(b.employee.name));
  }

  function employeesMissingPayroll(source = data){
    return activeEmployees(source)
      .map(employee => ({employee, missing:employeePayrollMissingFields(employee)}))
      .filter(row => row.missing.length)
      .sort((a,b)=>b.missing.length-a.missing.length || a.employee.name.localeCompare(b.employee.name));
  }

  function unsubmittedAvailability(source = data){
    return activeEmployees(source)
      .map(employee => ({employee, status:R.services.employeeWorkflow?.availabilitySubmission?.(employee,source) || {state:source?.submitted?.[employee.id]?'submitted':'missing',label:source?.submitted?.[employee.id]?'Submitted':'Not submitted'}}))
      .filter(row => row.status.state !== 'submitted')
      .map(row => ({employee:row.employee, role:employeePositionName(row.employee, source), status:row.status}));
  }

  function planningConflicts(source = data){
    return R.logic?.coverage?.weekIssues?.(source) || [];
  }

  function plannedHours(source = data){
    const rows = R.logic?.planning?.weekRows?.(source) || [];
    return R.logic?.planning?.summarizeRows?.(rows)?.hours || 0;
  }

  function actualHours(source = data){
    return R.logic?.actuals?.weekTotals?.(activeEmployees(source), source)?.actual || 0;
  }

  function missingBadges(source = data){
    const today = todayISO();
    const todayOffset = currentDayOffset(source);
    const now = nowMinutes();
    const rows = [];
    days.forEach((day, dayIndex) => {
      plannedSlotsForDay(day, source).forEach(slot => {
        const date = dateForDay(day);
        if(date > today)return;
        if(dayIndex === todayOffset && slot.start > now)return;
        const entry = actualEntryForSlot(slot, source);
        if(entry.clockIn || isApprovedAbsence(slot, source))return;
        rows.push(slot);
      });
    });
    return rows.sort((a,b)=>days.indexOf(a.day)-days.indexOf(b.day) || a.start-b.start || a.name.localeCompare(b.name));
  }

  function affectedCoverageServices(source = data){
    const issues = planningConflicts(source).filter(issue => issue.status === 'under');
    return new Set(issues.map(issue => `${issue.day || ''}|${issue.serviceKey || ''}`)).size || issues.length;
  }

  function coveragePulse(source = data){
    const summary = R.logic?.coverage?.weekSummary?.(source) || {status:'missing', issueCount:0, missingPeople:0};
    const affected = affectedCoverageServices(source);
    if(summary.status === 'ok')return {tone:'success', label:'Good', detail:'Coverage requirements matched', affected, summary};
    if(summary.status === 'missing')return {tone:'warning', label:'Setup needed', detail:'No coverage requirements configured', affected, summary};
    return {tone:'danger', label:'At risk', detail:`${affected} service${affected === 1 ? '' : 's'} affected`, affected, summary};
  }

  function priorityItems(source = data){
    const late = lateOrNoShow(source).length;
    const pending = pendingAbsences(source).length;
    const conflicts = planningConflicts(source).filter(issue => issue.status === 'under').length;
    const badges = missingBadges(source).length;
    return [
      {key:'late', label:late ? `${late} late / no-show` : 'No late staff', tone:late?'danger':'success', route:'actuals'},
      {key:'leave', label:pending ? `${pending} leave approval${pending === 1 ? '' : 's'}` : 'No leave approvals', tone:pending?'warning':'success', route:'team'},
      {key:'coverage', label:conflicts ? `${conflicts} coverage gap${conflicts === 1 ? '' : 's'}` : 'Coverage OK', tone:conflicts?'warning':'success', route:'planning'},
      {key:'badges', label:badges ? `${badges} missing badge${badges === 1 ? '' : 's'}` : 'Badges OK', tone:badges?'warning':'success', route:'actuals'}
    ];
  }

  function build(source = data){
    if(!source || typeof activeEmployees !== 'function') return {date:'',day:'',weekLabel:'',employees:[],today:{working:[],late:[],upcoming:[]},actions:{pendingAbsences:[],missingPayroll:[],planningConflicts:[],unsubmittedAvailability:[]},week:{plannedHours:0,actualHours:0,coverage:{tone:'neutral',label:'–',detail:''},missingBadges:[],status:'–'},priority:[]};
    const employees = activeEmployees(source);
    const pending = pendingAbsences(source);
    const missingPayroll = employeesMissingPayroll(source);
    const conflicts = planningConflicts(source);
    const unsubmitted = unsubmittedAvailability(source);
    const missing = missingBadges(source);
    const planned = plannedHours(source);
    const actual = actualHours(source);
    const coverage = coveragePulse(source);
    return {
      date:todayISO(),
      day:currentDayName(source),
      weekLabel:weekDisplayRange(),
      employees,
      today:{working:liveWorking(source), late:lateOrNoShow(source), upcoming:upcomingToday(source)},
      actions:{pendingAbsences:pending, missingPayroll, planningConflicts:conflicts, unsubmittedAvailability:unsubmitted},
      week:{plannedHours:planned, actualHours:actual, coverage, missingBadges:missing, status:source?.status || 'Draft'},
      priority:priorityItems(source)
    };
  }

  R.services.home = {build};
})();
