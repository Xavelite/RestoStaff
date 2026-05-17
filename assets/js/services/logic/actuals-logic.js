/* Actuals business logic: badge entries, variances, totals, anomalies and export rows. */
(function(){
  const R = window.Restogogo = window.Restogogo || {};
  R.logic = R.logic || {};

  function planningLogic(){
    return R.logic.planning || {};
  }

  function plannedRangeFor(employee, day, shift, source = data){
    return planningLogic().rangeFor?.(employee, day, shift, source) || '';
  }

  function plannedHoursFor(employee, day, shift, source = data){
    return planningLogic().plannedHoursFor?.(employee, day, shift, source) || 0;
  }

  function actualEntry(employeeId, day, shift, source = data){
    return normalizeActualEntry(source?.actualEntries?.[employeeId]?.[day]?.[shift]);
  }

  function actualRange(entry){
    return entry?.clockIn && entry?.clockOut ? `${entry.clockIn}-${entry.clockOut}` : '';
  }

  function actualHoursFor(employee, day, shift, source = data){
    return hoursFromRange(actualRange(actualEntry(employee.id, day, shift, source)));
  }

  function varianceMinutes(entry, plannedRange){
    if(!actualRange(entry) || !plannedRange) return 0;
    return Math.round((hoursFromRange(actualRange(entry)) - hoursFromRange(plannedRange)) * 60);
  }

  function compactVariance(minutes){
    if(!minutes) return 'On time';
    const sign = minutes > 0 ? '+' : '-';
    const abs = Math.abs(minutes);
    const hours = Math.floor(abs / 60);
    const mins = abs % 60;
    return hours ? `${sign}${hours}h${String(mins).padStart(2,'0')}` : `${sign}${mins} min`;
  }

  function actualSlotState(employee, day, shift, source = data){
    const planned = !!source?.planning?.[employee.id]?.[day]?.[shift];
    const entry = actualEntry(employee.id, day, shift, source);
    const range = plannedRangeFor(employee, day, shift, source);
    if(entry.clockIn && !entry.clockOut) return 'live';
    if(entry.clockIn && entry.clockOut){
      if(!planned) return 'unplanned';
      return Math.abs(varianceMinutes(entry, range)) <= 15 ? 'on-time' : 'variance';
    }
    if(planned) return 'planned-empty';
    return 'empty';
  }

  function actualSlotTone(state){
    if(state === 'on-time' || state === 'live') return 'good';
    if(state === 'variance' || state === 'unplanned') return 'warn';
    if(state === 'planned-empty') return 'pending';
    return 'empty';
  }

  function actualSlotStatus(employee, day, shift, source = data){
    const entry = actualEntry(employee.id, day, shift, source);
    const state = actualSlotState(employee, day, shift, source);
    const range = plannedRangeFor(employee, day, shift, source);
    if(state === 'live') return 'LIVE';
    if(state === 'on-time' || state === 'variance') return compactVariance(varianceMinutes(entry, range));
    if(state === 'unplanned') return 'Unplanned';
    return '';
  }

  function actualSlotMainTime(employee, day, shift, source = data){
    const entry = actualEntry(employee.id, day, shift, source);
    if(entry.clockIn && entry.clockOut) return displayTimeRange(actualRange(entry));
    if(entry.clockIn) return `${entry.clockIn}–…`;
    return '—';
  }

  function employeeHasActual(employee, source = data){
    return days.some(day => shifts.some(shift => {
      const entry = actualEntry(employee.id, day, shift, source);
      return !!(entry.clockIn || entry.clockOut || entry.clockInPhoto || entry.clockOutPhoto);
    }));
  }

  function employeeHasPlanning(employee, source = data){
    return days.some(day => shifts.some(shift => !!source?.planning?.[employee.id]?.[day]?.[shift]));
  }

  function employeeHasVisibleAbsence(employee, source = data){
    if(source !== data)return false;
    return days.some(day => shifts.some(shift => !!employeePrimaryAbsenceForSlot(employee.id, day, shift, ['Approved','Pending'])));
  }

  function isRelevantEmployee(employee, source = data){
    return employeeHasPlanning(employee, source) || employeeHasActual(employee, source) || employeeHasVisibleAbsence(employee, source);
  }

  function relevantEmployees(source = data){
    return activeEmployees(source).filter(employee => isRelevantEmployee(employee, source));
  }

  function employeeMatchesActualStatus(employee, status = 'all', source = data){
    if(status === 'all') return true;
    return days.some(day => shifts.some(shift => {
      const state = actualSlotState(employee, day, shift, source);
      if(status === 'issue') return state === 'live';
      return state === status;
    }));
  }

  function visibleActualEmployees(options = {}, source = data){
    const scope = options.scope || options.employeeScope || 'relevant';
    const role = options.role || options.roleFilter || 'all';
    const status = options.status || options.statusFilter || 'all';
    const q = String(options.search || '').trim().toLowerCase();
    const employees = options.employees || activeEmployees(source);
    return employees.filter(employee => {
      if(scope === 'relevant' && !isRelevantEmployee(employee, source)) return false;
      if(role !== 'all' && employeePositionName(employee, source) !== role) return false;
      if(q && !`${employee.name || ''} ${employeePositionName(employee, source)}`.toLowerCase().includes(q)) return false;
      return employeeMatchesActualStatus(employee, status, source);
    });
  }

  function actualTotalsForEmployee(employee, source = data){
    let actual = 0;
    let planned = 0;
    let badged = 0;
    days.forEach(day => shifts.forEach(shift => {
      const entry = actualEntry(employee.id, day, shift, source);
      actual += actualHoursFor(employee, day, shift, source);
      planned += plannedHoursFor(employee, day, shift, source);
      if(entry.clockIn) badged++;
    }));
    return {actual, planned, badged, variance:actual - planned};
  }

  function actualWeekTotals(employees, source = data){
    const list = employees || activeEmployees(source);
    let actual = 0;
    let planned = 0;
    let open = 0;
    let badged = 0;
    (list || []).forEach(employee => days.forEach(day => shifts.forEach(shift => {
      const entry = actualEntry(employee.id, day, shift, source);
      actual += actualHoursFor(employee, day, shift, source);
      planned += plannedHoursFor(employee, day, shift, source);
      if(entry.clockIn) badged++;
      if(entry.clockIn && !entry.clockOut) open++;
    })));
    return {actual, planned, variance:actual - planned, open, badged};
  }

  function actualDayTotals(employees, source = data){
    const list = employees || activeEmployees(source);
    const dayTotals = {};
    const dayPeople = {};
    days.forEach(day => { dayTotals[day] = 0; dayPeople[day] = new Set(); });
    (list || []).forEach(employee => days.forEach(day => shifts.forEach(shift => {
      const entry = actualEntry(employee.id, day, shift, source);
      const hours = actualHoursFor(employee, day, shift, source);
      dayTotals[day] += hours;
      if(entry.clockIn) dayPeople[day].add(employee.id);
    })));
    return {dayTotals, dayPeople, grand:days.reduce((sum, day) => sum + dayTotals[day], 0)};
  }

  function actualEmployeeCode(employee){
    return employee?.payrollId || employee?.employeeNumber || employee?.id || '';
  }

  function actualProofStatus(entry, field){
    const photo = entry?.[`${field}Photo`];
    const status = entry?.[`${field}PhotoStatus`];
    if(photo) return 'captured';
    if(status === 'blocked') return 'blocked';
    if(status === 'unsupported') return 'not available';
    return status || '';
  }

  function actualHasProof(entry){
    return !!(entry?.clockInPhoto || entry?.clockOutPhoto || entry?.clockInPhotoStatus || entry?.clockOutPhotoStatus);
  }

  function actualExportRows(source = data){
    const rows = [];
    relevantEmployees(source).forEach(employee => days.forEach(day => shifts.forEach(shift => {
      const entry = actualEntry(employee.id, day, shift, source);
      const planned = plannedRangeFor(employee, day, shift, source);
      const actual = actualRange(entry);
      if(!planned && !actual && !entry.clockIn && !entry.clockOut && !actualHasProof(entry)) return;
      const plannedHours = planned ? plannedHoursFor(employee, day, shift, source) : 0;
      const actualHours = actual ? actualHoursFor(employee, day, shift, source) : 0;
      const variance = actualHours - plannedHours;
      rows.push({
        employee,
        day,
        shift,
        date: dateForDay(day),
        zone: planned ? (assignmentZoneName(employee.id, day, shift, source) || suggestZone(employee, shift, source)) : '',
        planned,
        actual,
        plannedHours,
        actualHours,
        variance,
        entry,
        state: actualSlotState(employee, day, shift, source),
        status: actualSlotStatus(employee, day, shift, source) || (planned && !entry.clockIn ? 'Missing badge' : '')
      });
    })));
    return rows;
  }

  function actualEmployeeStats(employee, source = data){
    const stats = {missingBadges:0, openClockouts:0, unplannedBadges:0, varianceIssues:0, proofCaptured:0, proofWarnings:0};
    days.forEach(day => shifts.forEach(shift => {
      const planned = !!source?.planning?.[employee.id]?.[day]?.[shift];
      const entry = actualEntry(employee.id, day, shift, source);
      const plannedRange = plannedRangeFor(employee, day, shift, source);
      if(planned && !entry.clockIn) stats.missingBadges++;
      if(entry.clockIn && !entry.clockOut) stats.openClockouts++;
      if(!planned && entry.clockIn) stats.unplannedBadges++;
      if(entry.clockInPhoto || entry.clockOutPhoto) stats.proofCaptured++;
      if((entry.clockIn && !entry.clockInPhoto && entry.clockInPhotoStatus) || (entry.clockOut && !entry.clockOutPhoto && entry.clockOutPhotoStatus)) stats.proofWarnings++;
      if(entry.clockIn && entry.clockOut && plannedRange && Math.abs(varianceMinutes(entry, plannedRange)) > 15) stats.varianceIssues++;
    }));
    return stats;
  }

  function actualAnomalies(source = data){
    const anomalies = [];
    actualExportRows(source).forEach(row => {
      const entry = row.entry;
      const issues = [];
      if(row.planned && !entry.clockIn) issues.push('Missing badge');
      if(entry.clockIn && !entry.clockOut) issues.push('Missing clock-out');
      if(!row.planned && entry.clockIn) issues.push('Unplanned badge');
      if(entry.clockIn && entry.clockOut && row.planned && Math.abs(row.variance) > 0.25) issues.push('Variance > 15 min');
      if((entry.clockIn && !entry.clockInPhoto && entry.clockInPhotoStatus === 'blocked') || (entry.clockOut && !entry.clockOutPhoto && entry.clockOutPhotoStatus === 'blocked')) issues.push('Camera blocked');
      issues.forEach(issue => anomalies.push({issue, ...row}));
    });
    return anomalies;
  }

  R.logic.actuals = {
    entry: actualEntry,
    range: actualRange,
    plannedRangeFor,
    plannedHoursFor,
    actualHoursFor,
    varianceMinutes,
    compactVariance,
    slotState: actualSlotState,
    slotTone: actualSlotTone,
    slotStatus: actualSlotStatus,
    slotMainTime: actualSlotMainTime,
    hasActual: employeeHasActual,
    hasPlanning: employeeHasPlanning,
    isRelevantEmployee,
    relevantEmployees,
    matchesStatus: employeeMatchesActualStatus,
    visibleEmployees: visibleActualEmployees,
    totalsForEmployee: actualTotalsForEmployee,
    weekTotals: actualWeekTotals,
    dayTotals: actualDayTotals,
    employeeCode: actualEmployeeCode,
    proofStatus: actualProofStatus,
    hasProof: actualHasProof,
    exportRows: actualExportRows,
    employeeStats: actualEmployeeStats,
    anomalies: actualAnomalies
  };
})();
