/* Supabase read mapper: converts relational rows into hydrated runtime state. */
(function(){
  function create(deps){
    const {text, numberValue, boolValue, cleanPositionName, sanitizePin, validDate, validIso, validClock, validRange, normalizeDay, normalizeShift, isPlainObject, cloneData, monday, emptyWeekly, ensureWeek, setSparseSlot} = deps;

function mapEmployee(row, absencesByEmployee){
  return {
    id:text(row.id),
    name:text(row.name),
    positionId:text(row.position_id),
    active:boolValue(row.active),
    managerAccess:boolValue(row.manager_access),
    pin:sanitizePin(row.pin_code || row.pin),
    firstName:text(row.first_name),
    lastName:text(row.last_name),
    payrollId:text(row.payroll_id || row.payroll_employee_id),
    employeeNumber:text(row.employee_number),
    email:text(row.email),
    phone:text(row.phone),
    address:text(row.address),
    postalCode:text(row.postal_code),
    city:text(row.city),
    nationality:text(row.nationality),
    contractType:text(row.contract_type),
    contractStart:validDate(row.contract_start),
    contractEnd:validDate(row.contract_end),
    workRegime:text(row.work_regime),
    socialSecurityNo:text(row.social_security_no || row.national_registry_no),
    iban:text(row.iban),
    bic:text(row.bic),
    payrollProvider:text(row.payroll_provider),
    payrollNotes:text(row.payroll_notes),
    emergencyName:text(row.emergency_name),
    emergencyRelation:text(row.emergency_relation),
    emergencyPhone:text(row.emergency_phone),
    notes:text(row.notes),
    contractHours:numberValue(row.contract_hours),
    annualLeaveEntitlementDays:numberValue(row.annual_leave_entitlement_days),
    hourlyCost:numberValue(row.hourly_cost),
    payrollReady:boolValue(row.payroll_ready),
    metadata:isPlainObject(row.metadata) ? row.metadata : {},
    absences:absencesByEmployee[row.id] || []
  };
}
function mapAbsence(row){return {
  id:text(row.id),
  absenceTypeId:text(row.absence_type_id),
  start:validDate(row.start_date),
  end:validDate(row.end_date || row.start_date),
  shift:text(row.shift_name || row.shift || 'Full day'),
  reason:text(row.reason),
  status:text(row.status || 'Pending'),
  requestedBy:text(row.requested_by),
  approvedBy:text(row.approved_by),
  approvedAt:validIso(row.approved_at),
  rejectedBy:text(row.rejected_by),
  rejectedAt:validIso(row.rejected_at),
  cancelledAt:validIso(row.cancelled_at),
  employeeComment:text(row.employee_comment),
  managerComment:text(row.manager_comment),
  durationDays:numberValue(row.duration_days),
  durationHours:numberValue(row.duration_hours),
  payrollExportStatus:text(row.payroll_export_status || 'Not exported'),
  payrollExportId:text(row.payroll_export_id),
  metadata:isPlainObject(row.metadata)?row.metadata:{}
};}
function mapAbsenceType(row){return {
  id:text(row.id),
  name:text(row.name),
  code:text(row.code),
  category:text(row.category),
  paidPolicy:text(row.paid_policy),
  requiresApproval:boolValue(row.requires_approval),
  affectsPlanning:boolValue(row.affects_planning),
  affectsPayroll:boolValue(row.affects_payroll),
  payrollCode:text(row.payroll_code),
  color:text(row.color),
  active:boolValue(row.active),
  sortOrder:numberValue(row.sort_order),
  metadata:isPlainObject(row.metadata)?row.metadata:{}
};}
function mapPosition(row){return {id:text(row.id), name:cleanPositionName(row.name), active:boolValue(row.active), hourlyCost:numberValue(row.hourly_cost), metadata:isPlainObject(row.metadata)?row.metadata:{}};}
function mapZone(row){
  const metadata = isPlainObject(row.metadata) ? Object.assign({}, row.metadata) : {};
  delete metadata.defaultTimes;
  delete metadata.default_times;
  const defaultTimes = isPlainObject(row.default_times) ? row.default_times : {};
  return {
    id:text(row.id),
    name:text(row.name),
    active:boolValue(row.active),
    defaultTimes:{Lunch:validRange(defaultTimes.Lunch), Evening:validRange(defaultTimes.Evening)},
    metadata,
    notes:text(row.notes)
  };
}


function mapCoverageRequirement(row){
  return {
    zoneId:text(row.zone_id),
    serviceKey:normalizeShift(row.service_key),
    positionId:text(row.position_id),
    requiredCount:Math.max(0,Math.round(numberValue(row.required_count))),
    sortOrder:numberValue(row.sort_order),
    metadata:isPlainObject(row.metadata)?row.metadata:{}
  };
}

function buildOpeningHours(rows){
  const byDay = {};
  (rows || []).forEach(row=>{
    const day = normalizeDay(row.day_name);
    if(!day)return;
    byDay[day] = {
      open:boolValue(row.is_open),
      Lunch:validRange(row.lunch_range),
      Evening:validRange(row.evening_range)
    };
  });
  return byDay;
}

function hydrateWeeks(rows, state){
  const history = {};
  (rows.weeklyStatus || []).forEach(row=>{ensureWeek(history, row.week_start).status = row.status === 'Published' ? 'Published' : 'Draft';});
  (rows.availabilitySlots || []).forEach(row=>{
    const week = ensureWeek(history, row.week_start);
    const day = normalizeDay(row.day_name); const shift = normalizeShift(row.shift_name);
    const value = row.availability_state === 'partial' ? 'partial' : (row.availability_state === 'available' ? true : undefined);
    if(day && shift)setSparseSlot(week.availability, row.employee_id, day, shift, value);
  });
  (rows.plannedShifts || []).forEach(row=>{
    const week = ensureWeek(history, row.week_start);
    const day = normalizeDay(row.day_name); const shift = normalizeShift(row.shift_name);
    if(!day || !shift)return;
    if(row.planned !== false)setSparseSlot(week.planning, row.employee_id, day, shift, true);
    if(row.zone_id)setSparseSlot(week.assignments, row.employee_id, day, shift, text(row.zone_id));
    if(row.position_id)setSparseSlot(week.assignmentPositions, row.employee_id, day, shift, text(row.position_id));
    if(validRange(row.time_range))setSparseSlot(week.assignmentTimes, row.employee_id, day, shift, validRange(row.time_range));
  });
  (rows.employeeWeekSubmissions || []).forEach(row=>{
    if(row.submitted === false)return;
    const week = ensureWeek(history, row.week_start);
    week.submitted[row.employee_id] = true;
  });
  (rows.weeklyNotes || []).forEach(row=>{
    const week = ensureWeek(history, row.week_start);
    const day = normalizeDay(row.day_name); const shift = normalizeShift(row.shift_name);
    if(!day || !shift || !row.note)return;
    week.notes[day] = isPlainObject(week.notes[day]) ? week.notes[day] : {};
    week.notes[day][shift] = text(row.note);
  });
  (rows.actualShiftEntries || []).forEach(row=>{
    const week = ensureWeek(history, row.week_start);
    const day = normalizeDay(row.day_name); const shift = normalizeShift(row.shift_name);
    if(!day || !shift)return;
    const entry = {
      clockIn:validClock(row.clock_in),
      clockOut:validClock(row.clock_out),
      clockInAt:validIso(row.clock_in_at),
      clockOutAt:validIso(row.clock_out_at),
      createdAt:validIso(row.created_at),
      updatedAt:validIso(row.updated_at),
      clockInPhoto:text(row.clock_in_photo),
      clockOutPhoto:text(row.clock_out_photo),
      clockInPhotoStatus:text(row.clock_in_photo_status),
      clockOutPhotoStatus:text(row.clock_out_photo_status),
      clockInPhotoCapturedAt:validIso(row.clock_in_photo_captured_at),
      clockOutPhotoCapturedAt:validIso(row.clock_out_photo_captured_at),
      source:text(row.source)
    };
    Object.keys(entry).forEach(key=>{if(entry[key] === '')delete entry[key];});
    setSparseSlot(week.actualEntries, row.employee_id, day, shift, entry);
  });

  state.history = history;
  const activeWeek = validDate(state.weekStart) ? monday(state.weekStart) : monday();
  const activePayload = history[activeWeek] || emptyWeekly();
  Object.assign(state, cloneData(activePayload));
  state.weekStart = activeWeek;
  state.status = activePayload.status || 'Draft';
}

    return {mapEmployee, mapAbsence, mapAbsenceType, mapPosition, mapZone, mapCoverageRequirement, buildOpeningHours, hydrateWeeks};
  }
  window.RestogogoSupabaseReadMapper = {create};
})();
