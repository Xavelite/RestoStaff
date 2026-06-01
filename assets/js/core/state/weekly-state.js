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

function compactPlanningSlots(source){
  const compact = {};
  if(!isPlainObject(source)) return compact;
  Object.entries(source).forEach(([employeeId, employeeMap])=>{
    if(!isPlainObject(employeeMap)) return;
    Object.entries(employeeMap).forEach(([day, dayMap])=>{
      if(!isPlainObject(dayMap)) return;
      Object.entries(dayMap).forEach(([shift, slot])=>{
        if(!isValidDayShift(day, shift)) return;
        if(!isPlainObject(slot) || !slot.planned) return;
        const zoneId = normalizeSparseString(slot.zoneId);
        const positionId = normalizeSparseString(slot.positionId);
        const timeRange = normalizeTimeRangeInput(slot.timeRange) || undefined;
        const compacted = {planned:true};
        if(zoneId) compacted.zoneId = zoneId;
        if(positionId) compacted.positionId = positionId;
        if(timeRange) compacted.timeRange = timeRange;
        setSparseSlot(compact, employeeId, day, shift, compacted);
      });
    });
  });
  return compact;
}

function compactWeeklyPayload(payload){
  const source = isPlainObject(payload) ? payload : {};
  return {
    availability:compactEmployeeSlotMap(source.availability, value => normalizeAvailabilityValue(value)),
    planningSlots:compactPlanningSlots(source.planningSlots),
    submitted:compactSubmittedMap(source.submitted),
    notes:compactNotesMap(source.notes),
    actualEntries:compactActualEntryMap(source.actualEntries),
    status:normalizeStatus(source.status),
    actualsStatus:['open','approved','locked'].includes(String(source.actualsStatus || '').toLowerCase()) ? String(source.actualsStatus || '').toLowerCase() : 'open',
    // Optimistic-lock version token from work_weeks.updated_at — never mutated locally,
    // passed as-is to save_manager_planning so the DB can detect concurrent writes.
    updatedAt:source.updatedAt || null
  };
}

function normalizeWeeklyPayload(payload){
  return compactWeeklyPayload(payload);
}

function weeklyPayloadFromState(source=data){
  return compactWeeklyPayload({
    availability:source?.availability,
    planningSlots:source?.planningSlots,
    submitted:source?.submitted,
    notes:source?.notes,
    actualEntries:source?.actualEntries,
    status:source?.status,
    actualsStatus:source?.actualsStatus,
    updatedAt:source?.updatedAt
  });
}

function applyWeeklyPayloadToState(target=data, payload={}){
  const weekly = normalizeWeeklyPayload(payload);
  target.availability = weekly.availability;
  target.planningSlots = weekly.planningSlots;
  target.submitted = weekly.submitted;
  target.notes = weekly.notes;
  target.actualEntries = weekly.actualEntries;
  target.status = weekly.status;
  target.actualsStatus = weekly.actualsStatus;
  target.updatedAt = weekly.updatedAt ?? null;
  ensureWeeklyShape(target);
  return target;
}

function ensureWeeklyShape(target=data){
  if(!target) return target;
  const weekly = compactWeeklyPayload(target);
  target.availability = weekly.availability;
  target.planningSlots = weekly.planningSlots;
  target.submitted = weekly.submitted;
  target.notes = weekly.notes;
  target.actualEntries = weekly.actualEntries;
  target.status = weekly.status;
  target.actualsStatus = weekly.actualsStatus;
  return target;
}

function setAvailabilitySlot(employeeId, day, shift, value, source=data){
  source.availability = isPlainObject(source.availability) ? source.availability : {};
  const normalized = normalizeAvailabilityValue(value);
  setSparseSlot(source.availability, employeeId, day, shift, normalized);
}

/* Shared helper: safely read-modify-write a planningSlots slot object.
 * If the mutator returns an object with planned:true, the slot is stored.
 * Otherwise the slot is removed from the sparse map. */
function mutatePlanningSlot(source, employeeId, day, shift, mutator){
  source.planningSlots = isPlainObject(source.planningSlots) ? source.planningSlots : {};
  const existing = isPlainObject(source.planningSlots?.[employeeId]?.[day]?.[shift])
    ? source.planningSlots[employeeId][day][shift]
    : {};
  const updated = mutator(Object.assign({}, existing));
  if(!updated || !updated.planned){
    deleteSparseSlot(source.planningSlots, employeeId, day, shift);
  } else {
    setSparseSlot(source.planningSlots, employeeId, day, shift, updated);
  }
}

function setPlanningSlot(employeeId, day, shift, value, source=data){
  if(value){
    mutatePlanningSlot(source, employeeId, day, shift, slot => Object.assign({}, slot, {planned:true}));
  } else {
    source.planningSlots = isPlainObject(source.planningSlots) ? source.planningSlots : {};
    deleteSparseSlot(source.planningSlots, employeeId, day, shift);
  }
}

function setAssignmentSlot(employeeId, day, shift, value, source=data){
  const zoneId = canonicalZoneId(value, source?.restaurantSetup || data?.restaurantSetup);
  mutatePlanningSlot(source, employeeId, day, shift, slot => {
    const s = Object.assign({}, slot);
    if(zoneId) s.zoneId = zoneId; else delete s.zoneId;
    return s;
  });
}

function setAssignmentTimeSlot(employeeId, day, shift, value, source=data){
  const timeRange = normalizeTimeRangeInput(value) || undefined;
  mutatePlanningSlot(source, employeeId, day, shift, slot => {
    const s = Object.assign({}, slot);
    if(timeRange) s.timeRange = timeRange; else delete s.timeRange;
    return s;
  });
}

function setAssignmentPositionSlot(employeeId, day, shift, value, source=data){
  const positionId = canonicalPositionId(value, source?.restaurantSetup?.positions || data?.restaurantSetup?.positions || []);
  mutatePlanningSlot(source, employeeId, day, shift, slot => {
    const s = Object.assign({}, slot);
    if(positionId) s.positionId = positionId; else delete s.positionId;
    return s;
  });
}

function setSubmitted(employeeId, value=true, source=data){
  source.submitted = isPlainObject(source.submitted) ? source.submitted : {};
  if(value) source.submitted[employeeId] = true;
  else delete source.submitted[employeeId];
}


function archiveActiveWeek(){
  if(!data) return;
  data.history = isPlainObject(data.history) ? data.history : {};
  data.history[monday(data.weekStart)] = weeklyPayloadFromState(data);
}

function restoreActiveWeek(){
  if(!data) return;
  data.history = isPlainObject(data.history) ? data.history : {};
  const snapshot = data.history[monday(data.weekStart)] || emptyWeeklyPayload();
  applyWeeklyPayloadToState(data, snapshot);
}

function setWeekStartAndLoad(weekStart){
  if(!data || !weekStart) return;
  const resolved = monday(weekStart);
  if(!validDate(resolved)) return;
  archiveActiveWeek();
  data.weekStart = resolved;
  restoreActiveWeek();
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
