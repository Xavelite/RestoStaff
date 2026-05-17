/* Weekly repository: owns scoped weekly persistence orchestration. */
(function(){
  function create(deps){
    const {TABLES, validDate, monday, deleteWeekRows, upsertRows} = deps;

function saveReasonScope(reason){
  const clean = String(reason || '').toLowerCase();
  if(clean.startsWith('team-'))return 'team';
  if(clean.startsWith('restaurant-'))return 'restaurant';
  if(clean.startsWith('badge-') || clean.startsWith('actuals-'))return 'actuals';
  if(clean.startsWith('employee-schedule'))return 'availability';
  if(clean.startsWith('employee-leave'))return 'employeeAbsences';
  if(clean.startsWith('planning-') || clean === 'week-navigation')return 'planning';
  return 'unknown';
}
function rowsForWeek(rows, key, weekStart){
  const week = validDate(weekStart) ? monday(weekStart) : monday();
  return (rows[key] || []).filter(row=>validDate(row.week_start) === week);
}
async function saveWeeklyScoped(rows, weekStart, options={}){
  const week = validDate(weekStart) ? monday(weekStart) : monday();
  const include = Object.assign({availability:true, planning:true, submissions:true, notes:true, actuals:true}, options || {});
  const childTables = [];
  if(include.availability)childTables.push(TABLES.availabilitySlots);
  if(include.planning)childTables.push(TABLES.plannedShifts);
  if(include.submissions)childTables.push(TABLES.employeeWeekSubmissions);
  if(include.notes)childTables.push(TABLES.weeklyNotes);
  if(include.actuals)childTables.push(TABLES.actualShiftEntries);
  for(const table of childTables){if(!await deleteWeekRows(table, week))return false;}
  if(!await upsertRows(TABLES.weeklyStatus, rowsForWeek(rows,'weeklyStatus',week), ['restaurant_id','week_start']))return false;
  if(include.availability && !await upsertRows(TABLES.availabilitySlots, rowsForWeek(rows,'availabilitySlots',week), ['restaurant_id','week_start','employee_id','day_name','shift_name']))return false;
  if(include.planning && !await upsertRows(TABLES.plannedShifts, rowsForWeek(rows,'plannedShifts',week), ['restaurant_id','week_start','employee_id','day_name','shift_name']))return false;
  if(include.submissions && !await upsertRows(TABLES.employeeWeekSubmissions, rowsForWeek(rows,'employeeWeekSubmissions',week), ['restaurant_id','week_start','employee_id']))return false;
  if(include.notes && !await upsertRows(TABLES.weeklyNotes, rowsForWeek(rows,'weeklyNotes',week), ['restaurant_id','week_start','day_name','shift_name']))return false;
  if(include.actuals && !await upsertRows(TABLES.actualShiftEntries, rowsForWeek(rows,'actualShiftEntries',week), ['restaurant_id','week_start','employee_id','day_name','shift_name']))return false;
  return true;
}

    return {saveReasonScope, rowsForWeek, saveWeeklyScoped};
  }
  window.RestogogoWeeklyRepository = {create};
})();
