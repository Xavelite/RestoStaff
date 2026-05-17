/* Planner state validation. This file validates contract integrity only. */
function validateOperationalIntegrity(state){
  const errors = [];
  const warnings = [];
  const source = isPlainObject(state) ? state : {};
  const setup = isPlainObject(source.restaurantSetup) ? source.restaurantSetup : {};
  const positionList = Array.isArray(setup.positions) ? setup.positions : [];
  const zoneList = Array.isArray(setup.zones) ? setup.zones : [];
  const positionsById = new Map();
  positionList.forEach(position=>{
    const idValue = String(position?.id || '').trim();
    if(idValue)positionsById.set(idValue, position);
  });




  const zoneIds = new Set(zoneList.map(zone=>String(zone?.id || '').trim()).filter(Boolean));
  const coverage = normalizeCoverageRequirements(setup.coverageRequirements || [], setup);
  const coverageByZone = new Map();
  coverage.forEach(requirement=>{
    coverageByZone.set(requirement.zoneId, (coverageByZone.get(requirement.zoneId) || 0) + requirement.requiredCount);
    if(!zoneIds.has(requirement.zoneId))warnings.push(`Coverage requirement references unknown zone id: ${requirement.zoneId}.`);
    if(!positionsById.has(requirement.positionId))warnings.push(`Coverage requirement references unknown position id: ${requirement.positionId}.`);
    if(!shifts.includes(requirement.serviceKey))warnings.push(`Coverage requirement references unknown service: ${requirement.serviceKey}.`);
  });
  zoneList.forEach(zone=>{
    if(zone?.active !== false && !coverageByZone.get(String(zone?.id || '').trim())){
      warnings.push(`Zone ${zone?.name || zone?.id || '?'} has no coverage requirement.`);
    }
  });



  const employees = Array.isArray(source.employees) ? source.employees : [];
  const employeeIds = new Set();
  employees.forEach(employee=>{
    const idValue = String(employee?.id || '').trim();
    if(idValue)employeeIds.add(idValue);
    if(employee?.active === false)return;
    const positionId = String(employee?.positionId || '').trim();
    if(!positionId){
      errors.push(`Active employee ${employee?.name || idValue || '?'} has no Restaurant position.`);
      return;
    }
    const position = positionsById.get(positionId);
    if(!position){
      errors.push(`Active employee ${employee?.name || idValue || '?'} uses an unknown Restaurant position.`);
      return;
    }
    if(!Number(employee?.hourlyCost || position.hourlyCost || 0)){
      warnings.push(`Employee ${employee?.name || idValue || '?'} has no hourly cost.`);
    }
  });

  Object.entries(isPlainObject(source.planning) ? source.planning : {}).forEach(([employeeId, employeePlan])=>{
    if(!employeeIds.has(employeeId))warnings.push(`Planning exists for unknown employee id: ${employeeId}.`);
    Object.entries(isPlainObject(employeePlan) ? employeePlan : {}).forEach(([day, shiftsByName])=>{
      if(!days.includes(day))warnings.push(`Planning contains unknown day: ${day}.`);
      Object.entries(isPlainObject(shiftsByName) ? shiftsByName : {}).forEach(([shift, planned])=>{
        if(!planned)return;
        if(!shifts.includes(shift))warnings.push(`Planning contains unknown shift: ${shift}.`);
        const zoneId = canonicalZoneId(source.assignments?.[employeeId]?.[day]?.[shift], setup);
        const zone = zoneList.find(item=>String(item?.id || '').trim()===String(zoneId || '').trim());
        if(zoneId && (!zone || zone.active === false)){
          warnings.push(`Planning assignment uses inactive or unknown zone for ${employeeId} ${day} ${shift}.`);
        }
        const plannedPositionId = canonicalPositionId(source.assignmentPositions?.[employeeId]?.[day]?.[shift] || employees.find(employee=>employee.id===employeeId)?.positionId, setup.positions || []);
        if(plannedPositionId && !positionsById.has(plannedPositionId)){
          warnings.push(`Planning assignment for ${employeeId} ${day} ${shift} references an unknown position.`);
        }
      });
    });
  });

  Object.entries(isPlainObject(source.actualEntries) ? source.actualEntries : {}).forEach(([employeeId])=>{
    if(!employeeIds.has(employeeId))warnings.push(`Actuals exist for unknown employee id: ${employeeId}.`);
  });

  return {ok:errors.length === 0, errors, warnings};
}

function validatePlannerState(source){
  const errors = [];
  const warnings = [];
  const state = isPlainObject(source) ? source : {};

  if(!isPlainObject(source)) errors.push('Planner state is not an object.');
  if(!isPlainObject(state.restaurant)) warnings.push('Restaurant profile is missing.');
  if(!Array.isArray(state.employees)) errors.push('Employees must be an array.');

  const employeeIds = new Set();
  (Array.isArray(state.employees) ? state.employees : []).forEach((employee,index)=>{
    const idValue = String(employee?.id || '').trim();
    if(!idValue) errors.push(`Employee at index ${index} has no id.`);
    if(idValue && employeeIds.has(idValue)) errors.push(`Duplicate employee id: ${idValue}.`);
    if(idValue) employeeIds.add(idValue);
    if(!String(employee?.name || '').trim()) warnings.push(`Employee ${idValue || index} has no name.`);
  });

  const operational = validateOperationalIntegrity(state);
  errors.push(...operational.errors);
  warnings.push(...operational.warnings);

  const weeklyObjects = ['availability','planning','assignments','assignmentPositions','assignmentTimes','submitted','notes','actualEntries'];
  weeklyObjects.forEach(key=>{
    if(state[key] !== undefined && !isPlainObject(state[key])) errors.push(`${key} must be an object.`);
  });
  if(state.history !== undefined && !isPlainObject(state.history)) errors.push('history must be an object.');

  Object.entries(isPlainObject(state.actualEntries) ? state.actualEntries : {}).forEach(([employeeId, employeeEntries])=>{
    if(!employeeIds.has(employeeId)) warnings.push(`Actual entries exist for unknown employee id: ${employeeId}.`);
    Object.entries(isPlainObject(employeeEntries) ? employeeEntries : {}).forEach(([day, dayEntries])=>{
      if(!days.includes(day)) warnings.push(`Actual entries contain unknown day: ${day}.`);
      Object.entries(isPlainObject(dayEntries) ? dayEntries : {}).forEach(([shift, entry])=>{
        if(!shifts.includes(shift)) warnings.push(`Actual entries contain unknown shift: ${shift}.`);
        const normalized = normalizeActualEntry(entry);
        if(normalized.clockOut && !normalized.clockIn) errors.push(`Clock-out without clock-in for ${employeeId} ${day} ${shift}.`);
      });
    });
  });

  Object.keys(isPlainObject(state.history) ? state.history : {}).forEach(weekKey=>{
    if(!normalizeWeekStartKey(weekKey)) warnings.push(`History contains invalid week key: ${weekKey}.`);
  });

  return {ok:errors.length === 0, errors, warnings};
}
