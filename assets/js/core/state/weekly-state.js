/* Weekly state normalization and sparse slot helpers. */
function normalizeHistory(history){
  const normalized = {};
  if(!isPlainObject(history)) return normalized;
  Object.keys(history).forEach(key=>{
    const weekKey = normalizeWeekStartKey(key);
    if(!weekKey)return;
    const value = isPlainObject(history[key]) ? history[key] : {};
    normalized[weekKey] = normalizeWeeklyPayload(value);
  });
  return normalized;
}

function setSparseSlot(root, employeeId, day, shift, value){
  if(value === undefined || value === null || value === '' || value === false){
    deleteSparseSlot(root, employeeId, day, shift);
    return;
  }
  root[employeeId] = isPlainObject(root[employeeId]) ? root[employeeId] : {};
  root[employeeId][day] = isPlainObject(root[employeeId][day]) ? root[employeeId][day] : {};
  root[employeeId][day][shift] = value;
}

function deleteSparseSlot(root, employeeId, day, shift){
  if(!isPlainObject(root?.[employeeId]?.[day])) return;
  delete root[employeeId][day][shift];
  if(!Object.keys(root[employeeId][day]).length) delete root[employeeId][day];
  if(!Object.keys(root[employeeId]).length) delete root[employeeId];
}


function compactEmployeeSlotMap(source, normalizeValue){
  const compact = {};
  if(!isPlainObject(source)) return compact;
  Object.entries(source).forEach(([employeeId, employeeMap])=>{
    if(!isPlainObject(employeeMap)) return;
    Object.entries(employeeMap).forEach(([day, dayMap])=>{
      if(!isPlainObject(dayMap)) return;
      Object.entries(dayMap).forEach(([shift, rawValue])=>{
        if(!isValidDayShift(day, shift)) return;
        const value = normalizeValue(rawValue, employeeId, day, shift);
        if(value !== undefined && value !== null && value !== '' && value !== false){
          setSparseSlot(compact, employeeId, day, shift, value);
        }
      });
    });
  });
  return compact;
}

function compactSubmittedMap(source){
  const compact = {};
  if(!isPlainObject(source)) return compact;
  Object.entries(source).forEach(([employeeId, value])=>{ if(value) compact[employeeId] = true; });
  return compact;
}

function compactNotesMap(source){
  const compact = {};
  if(!isPlainObject(source)) return compact;
  Object.entries(source).forEach(([day, dayMap])=>{
    if(!days.includes(day) || !isPlainObject(dayMap)) return;
    Object.entries(dayMap).forEach(([shift, value])=>{
      const note = normalizeSparseString(value);
      if(note && shifts.includes(shift)){
        compact[day] = compact[day] || {};
        compact[day][shift] = note;
      }
    });
  });
  return compact;
}

function compactActualEntryMap(source){
  return compactEmployeeSlotMap(source, rawValue => compactActualEntry(rawValue));
}

function compactWeeklyPayload(payload){
  const source = isPlainObject(payload) ? payload : {};
  return {
    availability:compactEmployeeSlotMap(source.availability, value => normalizeAvailabilityValue(value)),
    planning:compactEmployeeSlotMap(source.planning, value => value ? true : undefined),
    assignments:compactEmployeeSlotMap(source.assignments, value => normalizeSparseString(value)),
    assignmentPositions:compactEmployeeSlotMap(source.assignmentPositions, value => normalizeSparseString(value)),
    assignmentTimes:compactEmployeeSlotMap(source.assignmentTimes, value => normalizeTimeRangeInput(value) || undefined),
    submitted:compactSubmittedMap(source.submitted),
    notes:compactNotesMap(source.notes),
    actualEntries:compactActualEntryMap(source.actualEntries),
    status:normalizeStatus(source.status)
  };
}

function normalizeWeeklyPayload(payload){
  return compactWeeklyPayload(payload);
}

function weeklyPayloadFromState(source=data){
  return compactWeeklyPayload({
    availability:source?.availability,
    planning:source?.planning,
    assignments:source?.assignments,
    assignmentPositions:source?.assignmentPositions,
    assignmentTimes:source?.assignmentTimes,
    submitted:source?.submitted,
    notes:source?.notes,
    actualEntries:source?.actualEntries,
    status:source?.status
  });
}

function applyWeeklyPayloadToState(target=data, payload={}){
  const weekly = normalizeWeeklyPayload(payload);
  target.availability = weekly.availability;
  target.planning = weekly.planning;
  target.assignments = weekly.assignments;
  target.assignmentPositions = weekly.assignmentPositions;
  target.assignmentTimes = weekly.assignmentTimes;
  target.submitted = weekly.submitted;
  target.notes = weekly.notes;
  target.actualEntries = weekly.actualEntries;
  target.status = weekly.status;
  ensureWeeklyShape(target);
  return target;
}

function ensureWeeklyShape(target=data){
  if(!target) return target;
  const weekly = compactWeeklyPayload(target);
  target.availability = weekly.availability;
  target.planning = weekly.planning;
  target.assignments = weekly.assignments;
  target.assignmentPositions = weekly.assignmentPositions;
  target.assignmentTimes = weekly.assignmentTimes;
  target.submitted = weekly.submitted;
  target.notes = weekly.notes;
  target.actualEntries = weekly.actualEntries;
  target.status = weekly.status;
  return target;
}

function setAvailabilitySlot(employeeId, day, shift, value, source=data){
  source.availability = isPlainObject(source.availability) ? source.availability : {};
  const normalized = normalizeAvailabilityValue(value);
  setSparseSlot(source.availability, employeeId, day, shift, normalized);
}

function setPlanningSlot(employeeId, day, shift, value, source=data){
  source.planning = isPlainObject(source.planning) ? source.planning : {};
  setSparseSlot(source.planning, employeeId, day, shift, value ? true : undefined);
}

function setAssignmentSlot(employeeId, day, shift, value, source=data){
  source.assignments = isPlainObject(source.assignments) ? source.assignments : {};
  const zoneId = canonicalZoneId(value, source?.restaurantSetup || data?.restaurantSetup);
  setSparseSlot(source.assignments, employeeId, day, shift, zoneId);
}

function setAssignmentTimeSlot(employeeId, day, shift, value, source=data){
  source.assignmentTimes = isPlainObject(source.assignmentTimes) ? source.assignmentTimes : {};
  setSparseSlot(source.assignmentTimes, employeeId, day, shift, normalizeTimeRangeInput(value) || undefined);
}

function setAssignmentPositionSlot(employeeId, day, shift, value, source=data){
  source.assignmentPositions = isPlainObject(source.assignmentPositions) ? source.assignmentPositions : {};
  const positionId = canonicalPositionId(value, source?.restaurantSetup?.positions || data?.restaurantSetup?.positions || []);
  setSparseSlot(source.assignmentPositions, employeeId, day, shift, positionId);
}

function setSubmitted(employeeId, value=true, source=data){
  source.submitted = isPlainObject(source.submitted) ? source.submitted : {};
  if(value) source.submitted[employeeId] = true;
  else delete source.submitted[employeeId];
}


function saveWeekSnapshot(){
  if(!data) return;
  data.history = isPlainObject(data.history) ? data.history : {};
  data.history[monday(data.weekStart)] = weeklyPayloadFromState(data);
}

function loadWeekSnapshot(){
  if(!data) return;
  data.history = isPlainObject(data.history) ? data.history : {};
  const snapshot = data.history[monday(data.weekStart)] || emptyWeeklyPayload();
  applyWeeklyPayloadToState(data, snapshot);
}

function setWeekStartAndLoad(weekStart){
  if(!data || !weekStart) return;
  saveWeekSnapshot();
  data.weekStart = monday(weekStart);
  loadWeekSnapshot();
}

function ensureActualEntry(employeeId, day, shift, source=data){
  if(!source) return {};
  source.actualEntries = isPlainObject(source.actualEntries) ? source.actualEntries : {};
  source.actualEntries[employeeId] = isPlainObject(source.actualEntries[employeeId]) ? source.actualEntries[employeeId] : {};
  source.actualEntries[employeeId][day] = isPlainObject(source.actualEntries[employeeId][day]) ? source.actualEntries[employeeId][day] : {};
  source.actualEntries[employeeId][day][shift] = normalizeActualEntry(source.actualEntries[employeeId][day][shift]);
  return source.actualEntries[employeeId][day][shift];
}

function getActualEntry(employeeId, day, shift, source=data){
  return normalizeActualEntry(source?.actualEntries?.[employeeId]?.[day]?.[shift]);
}

