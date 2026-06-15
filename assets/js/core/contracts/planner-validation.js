/* Planner state validation. This file validates contract integrity only. */
function validateOperationalIntegrity(state){
  const errors = [];
  const warnings = [];
  const source = isPlainObject(state) ? state : {};
  const setup = isPlainObject(source.restaurantSetup) ? source.restaurantSetup : {};
  const jobFunctionList = Array.isArray(setup.jobFunctions) ? setup.jobFunctions : [];
  const zoneList = Array.isArray(setup.zones) ? setup.zones : [];
  const jobFunctionsById = new Map();
  jobFunctionList.forEach(jobFunction=>{
    const idValue = String(jobFunction?.id || '').trim();
    if(idValue)jobFunctionsById.set(idValue, jobFunction);
  });




  const zoneIds = new Set(zoneList.map(zone=>String(zone?.id || '').trim()).filter(Boolean));
  const coverage = normalizeCoverageRequirements(setup.coverageRequirements || [], setup);
  const coverageByZone = new Map();
  coverage.forEach(requirement=>{
    coverageByZone.set(requirement.zoneId, (coverageByZone.get(requirement.zoneId) || 0) + requirement.requiredCount);
    if(!zoneIds.has(requirement.zoneId))warnings.push(`Coverage requirement references unknown zone id: ${requirement.zoneId}.`);
    if(!jobFunctionsById.has(requirement.jobFunctionId))warnings.push(`Coverage requirement references unknown jobFunction id: ${requirement.jobFunctionId}.`);
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
    const jobFunctionId = String(employee?.jobFunctionId || '').trim();
    if(!jobFunctionId){
      errors.push(`Active employee ${employee?.name || idValue || '?'} has no Restaurant jobFunction.`);
      return;
    }
    const jobFunction = jobFunctionsById.get(jobFunctionId);
    if(!jobFunction){
      errors.push(`Active employee ${employee?.name || idValue || '?'} uses an unknown Restaurant jobFunction.`);
      return;
    }
    if(!Number(employee?.estimatedHourlyCost || jobFunction.estimatedHourlyCost || 0)){
      warnings.push(`Employee ${employee?.name || idValue || '?'} has no hourly cost.`);
    }
  });

  Object.entries(isPlainObject(source.planningSlots) ? source.planningSlots : {}).forEach(([employeeId, employeePlan])=>{
    if(!employeeIds.has(employeeId))warnings.push(`Planning exists for unknown employee id: ${employeeId}.`);
    Object.entries(isPlainObject(employeePlan) ? employeePlan : {}).forEach(([day, shiftsByName])=>{
      if(!days.includes(day))warnings.push(`Planning contains unknown day: ${day}.`);
      Object.entries(isPlainObject(shiftsByName) ? shiftsByName : {}).forEach(([shift, slot])=>{
        if(!slot?.planned)return;
        if(!shifts.includes(shift))warnings.push(`Planning contains unknown shift: ${shift}.`);
        const zoneId = canonicalZoneId(slot.zoneId, setup);
        const zone = zoneList.find(item=>String(item?.id || '').trim()===String(zoneId || '').trim());
        if(zoneId && (!zone || zone.active === false)){
          warnings.push(`Planning assignment uses inactive or unknown zone for ${employeeId} ${day} ${shift}.`);
        }
        const plannedJobFunctionId = canonicalJobFunctionId(slot.jobFunctionId || employees.find(employee=>employee.id===employeeId)?.jobFunctionId, setup.jobFunctions || []);
        if(plannedJobFunctionId && !jobFunctionsById.has(plannedJobFunctionId)){
          warnings.push(`Planning assignment for ${employeeId} ${day} ${shift} references an unknown jobFunction.`);
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

  const weeklyObjects = ['availability','planningSlots','submitted','notes','actualEntries'];
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
