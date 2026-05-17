/* Supabase write mapper: converts runtime state into relational rows. */
(function(){
  function create(deps){
    const {getWorkspaceId, DAYS, text, numberValue, boolValue, cleanPositionName, sanitizePin, sanitizeId, validDate, validIso, validClock, validRange, normalizeDay, normalizeShift, isPlainObject, monday, emptyWeekly, currentWeeklyPayload, hasWeeklyContent, hasCoreSetup} = deps;

function restaurantRowFromState(source){
  const restaurant = isPlainObject(source.restaurant) ? source.restaurant : {};
  const setup = isPlainObject(source.restaurantSetup) ? source.restaurantSetup : {};
  const general = isPlainObject(setup.general) ? setup.general : {};
  return {
    id:getWorkspaceId(),
    name:text(restaurant.name || general.legalName),
    owner_name:text(restaurant.ownerName),
    city:text(restaurant.city || general.city),
    legal_name:text(general.legalName || restaurant.name),
    company_number:text(general.companyNumber),
    address:text(general.address),
    phone:text(general.phone),
    email:text(general.email),
    workspace_initialized:hasCoreSetup(source),
    active_week_start:validDate(source.weekStart) || monday(),
    settings:{
      schemaVersion:Number(window.DATA_CONTRACT_VERSION || source.schemaVersion || source.version || 24),
      notifications:Array.isArray(source.notifications) ? source.notifications : []
    },
    payroll_rules:isPlainObject(setup.payrollRules) ? setup.payrollRules : {}
  };
}
function rowsFromState(source){
  const setup = isPlainObject(source.restaurantSetup) ? source.restaurantSetup : {};
  const employees = Array.isArray(source.employees) ? source.employees : [];
  const positions = Array.isArray(setup.positions) ? setup.positions : [];
  const zones = Array.isArray(setup.zones) ? setup.zones : [];
  const opening = isPlainObject(setup.openingHours) ? setup.openingHours : {};
  const employeesById = new Map();
  employees.forEach(employee=>{const idValue=text(employee?.id); if(idValue)employeesById.set(idValue, employee);});
  const result = {
    positions:[], zones:[], zoneCoverageRequirements:[], openingHours:[], absenceTypes:[], employees:[], employeeAbsences:[],
    weeklyStatus:[], availabilitySlots:[], plannedShifts:[], employeeWeekSubmissions:[], weeklyNotes:[], actualShiftEntries:[]
  };

  positions.forEach((position,index)=>{
    const p = isPlainObject(position) ? position : {name:position};
    const name = cleanPositionName(p.name || p.position);
    if(!name)return;
    result.positions.push({restaurant_id:getWorkspaceId(), id:sanitizeId(p.id || name,'position'), name, active:boolValue(p.active), hourly_cost:numberValue(p.hourlyCost), sort_order:index, metadata:isPlainObject(p.metadata)?p.metadata:{}});
  });

  zones.forEach((zone,index)=>{
    const z = isPlainObject(zone) ? zone : {name:zone};
    const name = text(z.name || z.zone);
    if(!name)return;
    const zoneMetadata = isPlainObject(z.metadata) ? Object.assign({}, z.metadata) : {};
    delete zoneMetadata.defaultTimes;
    delete zoneMetadata.default_times;
    const defaultTimes = isPlainObject(z.defaultTimes)
      ? {Lunch:validRange(z.defaultTimes.Lunch), Evening:validRange(z.defaultTimes.Evening)}
      : {Lunch:'', Evening:''};
    result.zones.push({restaurant_id:getWorkspaceId(), id:sanitizeId(z.id || name,'zone'), name, active:boolValue(z.active), default_times:defaultTimes, notes:text(z.notes), sort_order:index, metadata:zoneMetadata});
  });

  buildCoverageRequirementMatrix(setup.coverageRequirements || [], setup).forEach((requirement,index)=>{
    result.zoneCoverageRequirements.push({
      restaurant_id:getWorkspaceId(),
      zone_id:text(requirement.zoneId),
      service_key:normalizeShift(requirement.serviceKey),
      position_id:text(requirement.positionId),
      required_count:Math.max(0,Math.round(numberValue(requirement.requiredCount))),
      sort_order:Number.isFinite(Number(requirement.sortOrder)) ? Number(requirement.sortOrder) : index,
      metadata:isPlainObject(requirement.metadata)?requirement.metadata:{}
    });
  });

  DAYS.forEach((day,index)=>{
    const hours = isPlainObject(opening[day]) ? opening[day] : {};
    result.openingHours.push({restaurant_id:getWorkspaceId(), day_name:day, is_open:boolValue(hours.open), lunch_range:validRange(hours.Lunch), evening_range:validRange(hours.Evening), sort_order:index});
  });

  normalizeAbsenceTypeList(setup.absenceTypes).forEach((type,index)=>{
    result.absenceTypes.push({
      restaurant_id:getWorkspaceId(),
      id:sanitizeId(type.id || type.name || `absence-type-${index+1}`,'absence-type'),
      name:text(type.name),
      code:text(type.code),
      category:text(type.category),
      paid_policy:text(type.paidPolicy),
      requires_approval:type.requiresApproval !== false,
      affects_planning:type.affectsPlanning !== false,
      affects_payroll:type.affectsPayroll !== false,
      payroll_code:text(type.payrollCode),
      color:text(type.color),
      active:type.active !== false,
      sort_order:Number.isFinite(Number(type.sortOrder)) ? Number(type.sortOrder) : index,
      metadata:isPlainObject(type.metadata)?type.metadata:{}
    });
  });


  employees.forEach((employee,index)=>{
    const e = isPlainObject(employee) ? employee : {};
    const employeeId = sanitizeId(e.id || e.name || `employee-${index+1}`,'employee');
    result.employees.push({
      restaurant_id:getWorkspaceId(),
      id:employeeId,
      name:text(e.name),
      first_name:text(e.firstName),
      last_name:text(e.lastName),
      position_id:text(e.positionId)||null,
      active:boolValue(e.active),
      manager_access:!!e.managerAccess,
      pin_code:sanitizePin(e.pin),
      payroll_id:text(e.payrollId),
      employee_number:text(e.employeeNumber),
      email:text(e.email),
      phone:text(e.phone),
      address:text(e.address),
      postal_code:text(e.postalCode),
      city:text(e.city),
      nationality:text(e.nationality),
      contract_type:text(e.contractType),
      contract_start:validDate(e.contractStart)||null,
      contract_end:validDate(e.contractEnd)||null,
      work_regime:text(e.workRegime),
      annual_leave_entitlement_days:numberValue(e.annualLeaveEntitlementDays),
      social_security_no:text(e.socialSecurityNo),
      iban:text(e.iban),
      bic:text(e.bic),
      payroll_provider:text(e.payrollProvider),
      payroll_notes:text(e.payrollNotes),
      emergency_name:text(e.emergencyName),
      emergency_relation:text(e.emergencyRelation),
      emergency_phone:text(e.emergencyPhone),
      notes:text(e.notes),
      contract_hours:numberValue(e.contractHours),
      hourly_cost:numberValue(e.hourlyCost),
      payroll_ready:!!e.payrollReady,
      sort_order:index,
      metadata:isPlainObject(e.metadata)?e.metadata:{}
    });
    (Array.isArray(e.absences)?e.absences:[]).forEach((absence,absenceIndex)=>{
      const a = isPlainObject(absence) ? absence : {};
      const start = validDate(a.start || a.date);
      if(!start)return;
      result.employeeAbsences.push({
        restaurant_id:getWorkspaceId(),
        employee_id:employeeId,
        id:sanitizeId(a.id || `${employeeId}-${start}-${absenceIndex}`,'absence'),
        absence_type_id:text(a.absenceTypeId)||null,
        start_date:start,
        end_date:validDate(a.end || a.date || start) || start,
        shift_name:text(a.shift || 'Full day'),
        reason:text(a.reason),
        status:text(a.status || 'Pending'),
        requested_by:text(a.requestedBy),
        approved_by:text(a.approvedBy),
        approved_at:validIso(a.approvedAt)||null,
        rejected_by:text(a.rejectedBy),
        rejected_at:validIso(a.rejectedAt)||null,
        cancelled_at:validIso(a.cancelledAt)||null,
        employee_comment:text(a.employeeComment),
        manager_comment:text(a.managerComment),
        duration_days:numberValue(a.durationDays),
        duration_hours:numberValue(a.durationHours),
        payroll_export_status:text(a.payrollExportStatus || 'Not exported'),
        payroll_export_id:text(a.payrollExportId),
        metadata:isPlainObject(a.metadata)?a.metadata:{}
      });
    });
  });

  const history = Object.assign({}, isPlainObject(source.history) ? source.history : {});
  const activeWeek = validDate(source.weekStart) ? monday(source.weekStart) : monday();
  history[activeWeek] = currentWeeklyPayload(source);
  Object.entries(history).forEach(([weekKey,payloadRaw])=>{
    const week = validDate(weekKey) ? monday(weekKey) : '';
    if(!week)return;
    const payload = Object.assign(emptyWeekly(), isPlainObject(payloadRaw) ? payloadRaw : {});
    if(!hasWeeklyContent(payload))return;
    result.weeklyStatus.push({restaurant_id:getWorkspaceId(), week_start:week, status:payload.status === 'Published' ? 'Published' : 'Draft'});
    Object.entries(isPlainObject(payload.availability)?payload.availability:{}).forEach(([employeeId, employeeMap])=>{
      Object.entries(isPlainObject(employeeMap)?employeeMap:{}).forEach(([day, dayMap])=>{
        const dayName = normalizeDay(day); if(!dayName)return;
        Object.entries(isPlainObject(dayMap)?dayMap:{}).forEach(([shift,value])=>{
          const shiftName = normalizeShift(shift); if(!shiftName)return;
          const state = value === 'partial' ? 'partial' : (value === true || value === 'available' ? 'available' : '');
          if(state)result.availabilitySlots.push({restaurant_id:getWorkspaceId(), week_start:week, employee_id:employeeId, day_name:dayName, shift_name:shiftName, availability_state:state});
        });
      });
    });
    const plannedKeys = new Set();
    Object.entries(isPlainObject(payload.planning)?payload.planning:{}).forEach(([employeeId, employeeMap])=>{
      Object.entries(isPlainObject(employeeMap)?employeeMap:{}).forEach(([day, dayMap])=>{
        const dayName = normalizeDay(day); if(!dayName)return;
        Object.entries(isPlainObject(dayMap)?dayMap:{}).forEach(([shift,value])=>{
          const shiftName = normalizeShift(shift); if(!shiftName || !value)return;
          plannedKeys.add(`${employeeId}|${dayName}|${shiftName}`);
        });
      });
    });
    Object.entries(isPlainObject(payload.assignments)?payload.assignments:{}).forEach(([employeeId, employeeMap])=>{
      Object.entries(isPlainObject(employeeMap)?employeeMap:{}).forEach(([day, dayMap])=>{
        const dayName = normalizeDay(day); if(!dayName)return;
        Object.keys(isPlainObject(dayMap)?dayMap:{}).forEach(shift=>{const shiftName=normalizeShift(shift); if(shiftName)plannedKeys.add(`${employeeId}|${dayName}|${shiftName}`);});
      });
    });
    Object.entries(isPlainObject(payload.assignmentPositions)?payload.assignmentPositions:{}).forEach(([employeeId, employeeMap])=>{
      Object.entries(isPlainObject(employeeMap)?employeeMap:{}).forEach(([day, dayMap])=>{
        const dayName = normalizeDay(day); if(!dayName)return;
        Object.keys(isPlainObject(dayMap)?dayMap:{}).forEach(shift=>{const shiftName=normalizeShift(shift); if(shiftName)plannedKeys.add(`${employeeId}|${dayName}|${shiftName}`);});
      });
    });
    Object.entries(isPlainObject(payload.assignmentTimes)?payload.assignmentTimes:{}).forEach(([employeeId, employeeMap])=>{
      Object.entries(isPlainObject(employeeMap)?employeeMap:{}).forEach(([day, dayMap])=>{
        const dayName = normalizeDay(day); if(!dayName)return;
        Object.keys(isPlainObject(dayMap)?dayMap:{}).forEach(shift=>{const shiftName=normalizeShift(shift); if(shiftName)plannedKeys.add(`${employeeId}|${dayName}|${shiftName}`);});
      });
    });
    plannedKeys.forEach(key=>{
      const [employeeId,dayName,shiftName] = key.split('|');
      const planned = !!payload.planning?.[employeeId]?.[dayName]?.[shiftName];
      const zone = canonicalZoneId(payload.assignments?.[employeeId]?.[dayName]?.[shiftName], setup);
      const range = validRange(payload.assignmentTimes?.[employeeId]?.[dayName]?.[shiftName]);
      const employee = employeesById.get(employeeId) || {};
      const positionId = canonicalPositionId(payload.assignmentPositions?.[employeeId]?.[dayName]?.[shiftName] || employee.positionId, positions);
      result.plannedShifts.push({restaurant_id:getWorkspaceId(), week_start:week, employee_id:employeeId, day_name:dayName, shift_name:shiftName, planned, zone_id:zone || null, position_id:positionId || null, time_range:range});
    });
    Object.entries(isPlainObject(payload.submitted)?payload.submitted:{}).forEach(([employeeId,value])=>{if(value)result.employeeWeekSubmissions.push({restaurant_id:getWorkspaceId(), week_start:week, employee_id:employeeId, submitted:true});});
    Object.entries(isPlainObject(payload.notes)?payload.notes:{}).forEach(([day, dayMap])=>{
      const dayName = normalizeDay(day); if(!dayName)return;
      Object.entries(isPlainObject(dayMap)?dayMap:{}).forEach(([shift,note])=>{const shiftName=normalizeShift(shift); const clean=text(note); if(shiftName && clean)result.weeklyNotes.push({restaurant_id:getWorkspaceId(), week_start:week, day_name:dayName, shift_name:shiftName, note:clean});});
    });
    Object.entries(isPlainObject(payload.actualEntries)?payload.actualEntries:{}).forEach(([employeeId, employeeMap])=>{
      Object.entries(isPlainObject(employeeMap)?employeeMap:{}).forEach(([day, dayMap])=>{
        const dayName = normalizeDay(day); if(!dayName)return;
        Object.entries(isPlainObject(dayMap)?dayMap:{}).forEach(([shift,entryRaw])=>{
          const shiftName = normalizeShift(shift); const entry = isPlainObject(entryRaw) ? entryRaw : {}; if(!shiftName)return;
          const row = {restaurant_id:getWorkspaceId(), week_start:week, employee_id:employeeId, day_name:dayName, shift_name:shiftName, clock_in:validClock(entry.clockIn), clock_out:validClock(entry.clockOut), clock_in_at:validIso(entry.clockInAt)||null, clock_out_at:validIso(entry.clockOutAt)||null, clock_in_photo:text(entry.clockInPhoto), clock_out_photo:text(entry.clockOutPhoto), clock_in_photo_status:text(entry.clockInPhotoStatus), clock_out_photo_status:text(entry.clockOutPhotoStatus), clock_in_photo_captured_at:validIso(entry.clockInPhotoCapturedAt)||null, clock_out_photo_captured_at:validIso(entry.clockOutPhotoCapturedAt)||null, source:text(entry.source)};
          if(row.clock_in || row.clock_out || row.clock_in_at || row.clock_out_at || row.clock_in_photo || row.clock_out_photo || row.clock_in_photo_status || row.clock_out_photo_status)result.actualShiftEntries.push(row);
        });
      });
    });
  });
  return result;
}

    return {restaurantRowFromState, rowsFromState};
  }
  window.RestogogoSupabaseWriteMapper = {create};
})();
