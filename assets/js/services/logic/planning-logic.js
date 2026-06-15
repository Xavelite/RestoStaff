/* Planning business logic: planned shifts, zones, hours and weekly totals. */
(function(){
  const R = window.Restogogo = window.Restogogo || {};
  R.logic = R.logic || {};

  function plannedRangeFor(employee, day, shift, source = data){
    const slot = source?.planningSlots?.[employee.id]?.[day]?.[shift];
    if(!employee || !slot?.planned) return '';
    if(slot.timeRange) return slot.timeRange;
    const zoneId = assignmentZoneId(employee.id, day, shift, source) || suggestZoneId(employee, shift, source);
    const zone = zoneById(zoneId, source);
    return normalizeTimeRangeInput(zone?.defaultTimes?.[shift]) || openingRangeForDayShift(day, shift, source);
  }

  function planningZoneFor(employee, day, shift, source = data){
    const zoneId = assignmentZoneId(employee.id, day, shift, source) || suggestZoneId(employee, shift, source);
    return zoneDisplayName(zoneId, source);
  }

  function plannedHoursFor(employee, day, shift, source = data){
    const range = plannedRangeFor(employee, day, shift, source);
    return range ? hoursFromRange(range) : 0;
  }

  function planningWeekRows(source = data, employees = activeEmployees(source)){
    const rows = [];
    (employees || []).forEach(employee => days.forEach(day => shifts.forEach(shift => {
      if(source?.planningSlots?.[employee.id]?.[day]?.[shift]?.planned){
        const range = plannedRangeFor(employee, day, shift, source);
        const hours = hoursFromRange(range);
        rows.push({
          employee,
          e: employee,
          day,
          d: day,
          shift,
          range,
          h: hours,
          hours,
          cost: hours * Number(employee.estimatedHourlyCost || 0),
          JobFunction: assignmentJobFunctionName(employee.id, day, shift, source) || employeeJobFunctionName(employee, source),
          jobFunctionId: assignmentJobFunctionId(employee.id, day, shift, source),
          zone: planningZoneFor(employee, day, shift, source)
        });
      }
    })));
    return rows;
  }

  function summarizePlanningRows(rows = []){
    return rows.reduce((acc, row) => {
      acc.hours += Number(row.hours ?? row.h ?? 0);
      acc.cost += Number(row.cost || 0);
      return acc;
    }, {hours:0, cost:0});
  }

  function employeePlannedWeekTotal(employee, source = data){
    return days.reduce((sum, day) => sum + shifts.reduce((slotSum, shift) => slotSum + plannedHoursFor(employee, day, shift, source), 0), 0);
  }

  function planningDayTotals(employees, source = data){
    const list = employees || activeEmployees(source);
    const dayTotals = {};
    const dayPeople = {};
    days.forEach(day => { dayTotals[day] = 0; dayPeople[day] = new Set(); });
    (list || []).forEach(employee => days.forEach(day => shifts.forEach(shift => {
      const hours = plannedHoursFor(employee, day, shift, source);
      dayTotals[day] += hours;
      if(hours) dayPeople[day].add(employee.id);
    })));
    return {dayTotals, dayPeople, grand:days.reduce((sum, day) => sum + dayTotals[day], 0)};
  }

  R.logic.planning = {
    rangeFor: plannedRangeFor,
    zoneFor: planningZoneFor,
    plannedHoursFor,
    weekRows: planningWeekRows,
    summarizeRows: summarizePlanningRows,
    dayTotals: planningDayTotals,
    employeeWeekTotal: employeePlannedWeekTotal
  };
})();
