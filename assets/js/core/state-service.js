/* restogogo state service: normalization, persistence and weekly payloads. */
function ensure(target=data){
  const o=target || {};
  o.version = Number.isFinite(Number(o.version)) ? Math.max(Number(o.version), DATA_CONTRACT_VERSION) : DATA_CONTRACT_VERSION;
  o.schemaVersion = DATA_CONTRACT_VERSION;

  o.restaurant = isPlainObject(o.restaurant) ? o.restaurant : {};
  o.restaurant.name = String(o.restaurant.name || '').trim();
  o.restaurant.ownerName = String(o.restaurant.ownerName || '').trim();
  o.restaurant.city = String(o.restaurant.city || '').trim();
  o.restaurant.logoUrl = String(o.restaurant.logoUrl || '').trim();
  o.restaurant.accentColor = normalizeHexColor(o.restaurant.accentColor);
  o.restaurant.theme = 'modern-dark';

  const legacyPositions = (Array.isArray(o.positions) ? o.positions : [])
    .map(cleanPositionName)
    .filter(Boolean)
    .filter((p,i,a)=>a.indexOf(p)===i);

  const legacyZoneRules = (Array.isArray(o.zoneRules) ? o.zoneRules : []).map(z=>({
    zone:String(z?.zone || '').trim(),
    role:cleanPositionName(z?.role || ''),
    lunch:normalizeTimeRangeInput(z?.lunch) || String(z?.lunch || '').trim(),
    evening:normalizeTimeRangeInput(z?.evening) || String(z?.evening || '').trim()
  })).filter(z=>z.zone);

  o.restaurantSetup = normalizeRestaurantSetup(o.restaurantSetup, {
    restaurant:o.restaurant,
    positions:legacyPositions,
    zoneRules:legacyZoneRules
  });

  o.positions = o.restaurantSetup.positions
    .filter(position=>position.active !== false)
    .map(position=>cleanPositionName(position.name))
    .filter(Boolean);
  o.positions = o.positions.filter((p,i,a)=>a.indexOf(p)===i);
  positions = o.positions;

  if(!Array.isArray(o.employees)) o.employees = [];
  const seenEmployeeIds = new Set();
  o.employees = o.employees.map((employee,index)=>{
    const normalized = normalizeEmployeeRecord(employee,index,positions);
    let uniqueId = normalized.id;
    let counter = 2;
    while(seenEmployeeIds.has(uniqueId)){
      uniqueId = `${normalized.id}-${counter++}`;
    }
    normalized.id = uniqueId;
    seenEmployeeIds.add(uniqueId);
    return normalized;
  });

  o.zoneRules = zoneRulesFromRestaurantSetup(o.restaurantSetup).map(z=>({
    zone:String(z?.zone || '').trim(),
    role:cleanPositionName(z?.role || positions[0] || ''),
    lunch:normalizeTimeRangeInput(z?.lunch) || String(z?.lunch || '').trim(),
    evening:normalizeTimeRangeInput(z?.evening) || String(z?.evening || '').trim()
  })).filter(z=>z.zone);
  zoneRules = o.zoneRules;

  o.positionColors = isPlainObject(o.positionColors) ? o.positionColors : {};
  o.zoneColors = isPlainObject(o.zoneColors) ? o.zoneColors : {};

  o.weekStart = monday(o.weekStart || new Date());
  o.status = normalizeStatus(o.status);
  o.history = normalizeHistory(o.history);
  o.notifications = Array.isArray(o.notifications) ? o.notifications : [];

  applyWeeklyPayloadToState(o, weeklyPayloadFromState(o));
  return o;
}

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
  setSparseSlot(source.assignments, employeeId, day, shift, normalizeSparseString(value));
}

function setAssignmentTimeSlot(employeeId, day, shift, value, source=data){
  source.assignmentTimes = isPlainObject(source.assignmentTimes) ? source.assignmentTimes : {};
  setSparseSlot(source.assignmentTimes, employeeId, day, shift, normalizeTimeRangeInput(value) || undefined);
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

const saveController = {
  status:'idle',
  inFlight:false,
  pending:false,
  pendingReason:'',
  lastError:'',
  lastSavedAt:'',
  lastReason:''
};
let activeSavePromise = null;

let lastSaveNotice = '';
function coreSetupCounts(source=data){
  const setup = isPlainObject(source?.restaurantSetup) ? source.restaurantSetup : {};
  return {
    employees:Array.isArray(source?.employees) ? source.employees.length : 0,
    zones:Array.isArray(setup.zones) ? setup.zones.length : 0,
    positions:Array.isArray(setup.positions) ? setup.positions.length : 0
  };
}
function coreSetupIsEmpty(source=data){
  const counts = coreSetupCounts(source);
  return counts.employees === 0 && counts.zones === 0 && counts.positions === 0;
}
function setupRequirements(source=data){
  const target = source || {};
  const setup = isPlainObject(target.restaurantSetup) ? target.restaurantSetup : {};
  const employees = Array.isArray(target.employees) ? target.employees : [];
  const zones = Array.isArray(setup.zones) ? setup.zones : [];
  const setupPositions = Array.isArray(setup.positions) ? setup.positions : [];
  const missing = [];
  if(!employees.some(employee=>employee?.active !== false)) missing.push({key:'employee',label:'Add at least one active employee',page:'team'});
  if(!zones.some(zone=>zone?.active !== false && String(zone?.name || '').trim())) missing.push({key:'zone',label:'Add at least one active zone',page:'restaurant'});
  if(!setupPositions.some(position=>position?.active !== false && String(position?.name || '').trim())) missing.push({key:'position',label:'Add at least one active position',page:'restaurant'});
  return {ready:missing.length === 0, missing};
}
function isSetupReady(source=data){return setupRequirements(source).ready;}
function notifySaveIssue(message,tone='danger'){
  const text=String(message||'Save failed. Please refresh and try again.');
  const key=`${tone}:${text}`;
  if(lastSaveNotice===key)return;
  lastSaveNotice=key;
  Restogogo.ui?.toast?.(text,{tone,icon:tone==='warning'?'!':'×',centered:true,timeout:3600});
}
function clearSaveIssueNotice(){
  lastSaveNotice='';
}

function updateSaveController(patch={}){
  Object.assign(saveController, patch);
  Restogogo.state.save = Object.assign({}, saveController);
}

function validateStateBeforeSave(){
  const validation = validatePlannerState(data);
  Restogogo.state.validation = validation;
  if(!validation.ok){
    updateSaveController({status:'error', lastError:validation.errors.join(' | ')});
    console.error('restogogo save blocked by invalid state', validation.errors);
  }
  return validation;
}

async function load(){
  storageReadOnly=false;
  dataLoadedFromSupabase=false;
  lastDataReadStatus='loading';
  updateSaveController({status:'idle', lastError:''});
  const loaded=await Promise.resolve(window.DataAdapter.readPlanner());
  const err=window.DataAdapter.getLastError&&window.DataAdapter.getLastError();
  const readStatus=window.DataAdapter.getLastReadStatus?window.DataAdapter.getLastReadStatus():(err?'error':'ok');
  lastDataReadStatus=readStatus;
  if(loaded){
    data=loaded;
    dataLoadedFromSupabase=readStatus==='ok';
  }else{
    data=emptySupabaseRuntimeState(workspaceId());
    storageReadOnly=true;
    dataLoadedFromSupabase=false;
    const message=readStatus==='empty'
      ? `Workspace "${workspaceId()}" does not exist in Supabase. Run the schema + seed SQL or create the restaurant row first.`
      : (err || 'Could not load workspace data from Supabase.');
    updateSaveController({status:'readonly', lastError:message});
    notifySaveIssue(message, readStatus==='empty'?'warning':'danger');
  }
  ensure(data);
  Restogogo.state.supabaseBaselineCounts = coreSetupCounts(data);
  Restogogo.state.validation = validatePlannerState(data);
  session=window.DataAdapter.readSession(session)||session;
  if(!session.employeeId||!emp(session.employeeId))session.employeeId=activeEmployees()[0]?.id||null;
  applyRestaurantBrand();
  console.info('[restogogo:supabase-load]', {
    workspace: workspaceId(),
    readStatus,
    employees: Array.isArray(data?.employees) ? data.employees.length : 0,
    zones: Array.isArray(data?.restaurantSetup?.zones) ? data.restaurantSetup.zones.length : 0,
    positions: Array.isArray(data?.restaurantSetup?.positions) ? data.restaurantSetup.positions.length : 0,
    readOnly: storageReadOnly
  });
}


async function persistCurrentState(reason='save'){
  ensure(data);
  saveWeekSnapshot();
  const validation = validateStateBeforeSave();
  window.DataAdapter.saveSession(session);
  if(!validation.ok)return false;
  if(!dataLoadedFromSupabase){
    const message='Save blocked: Supabase data was not loaded successfully. Refresh and confirm the workspace before saving.';
    updateSaveController({status:'readonly', lastError:message, lastReason:reason});
    notifySaveIssue(message, 'warning');
    return false;
  }
  const baseline = Restogogo.state.supabaseBaselineCounts || {employees:0,zones:0,positions:0};
  const currentCounts = coreSetupCounts(data);
  const destructiveMasterLoss = (baseline.employees > 0 && currentCounts.employees === 0)
    || (baseline.zones > 0 && currentCounts.zones === 0)
    || (baseline.positions > 0 && currentCounts.positions === 0);
  if(destructiveMasterLoss){
    const message='Save blocked: loaded master data would be erased. Refresh before continuing.';
    updateSaveController({status:'error', lastError:message, lastReason:reason});
    notifySaveIssue(message, 'danger');
    console.error('[restogogo:supabase-save-blocked]', {reason, baseline, current:currentCounts});
    return false;
  }
  if(storageReadOnly){
    updateSaveController({status:'readonly', lastReason:reason});
    notifySaveIssue('Workspace is read-only until Supabase data is initialized.', 'warning');
    return false;
  }
  const ok=await Promise.resolve(window.DataAdapter.savePlanner(data, {reason}));
  if(ok!==false){
    Restogogo.state.supabaseBaselineCounts = coreSetupCounts(data);
    dataLoadedFromSupabase = true;
    lastDataReadStatus = 'ok';
    updateSaveController({status:'saved', lastError:'', lastSavedAt:new Date().toISOString(), lastReason:reason});
    clearSaveIssueNotice();
    return true;
  }
  const err=window.DataAdapter.getLastError&&window.DataAdapter.getLastError();
  const message=err||'Save failed';
  updateSaveController({status:'error', lastError:message, lastReason:reason});
  notifySaveIssue(message, 'danger');
  return false;
}

async function save(options={}){
  const reason=typeof options==='string'?options:(options.reason||'save');
  if(saveController.inFlight){
    updateSaveController({pending:true, pendingReason:reason, status:'queued', lastReason:reason});
    return activeSavePromise || Promise.resolve(false);
  }

  activeSavePromise = (async()=>{
    let ok=false;
    let currentReason=reason;
    updateSaveController({inFlight:true, pending:false, pendingReason:'', status:'saving', lastReason:currentReason});
    try{
      do{
        updateSaveController({pending:false, pendingReason:'', status:'saving', lastReason:currentReason});
        ok=await persistCurrentState(currentReason);
        currentReason=saveController.pendingReason || 'queued-changes';
      }while(saveController.pending);
    }catch(error){
      const message=error?.message||String(error);
      updateSaveController({status:'error', lastError:message, lastReason:currentReason});
      notifySaveIssue(message, 'danger');
      ok=false;
    }finally{
      updateSaveController({inFlight:false, pending:false, pendingReason:''});
      activeSavePromise=null;
    }
    return ok;
  })();

  return activeSavePromise;
}

function emp(employeeId){return data?.employees?.find(e=>e.id===employeeId);}
function activeEmployees(){return sortEmployees((data?.employees||[]).filter(e=>e.active));}
function positionIndex(position){const clean=cleanPositionName(position); const index=positions.findIndex(p=>cleanPositionName(p)===clean); return index<0?999:index;}
function sortEmployees(list){return [...list].sort((a,b)=>positionIndex(a.position)-positionIndex(b.position)||String(a.name).localeCompare(String(b.name)));}
function activeRestaurantZones(shift=''){
  const setupZones = Array.isArray(data?.restaurantSetup?.zones) ? data.restaurantSetup.zones : [];
  return setupZones.filter(zone=>zone?.active !== false && zone.name && (!shift || zone.services?.[shift] !== false));
}
function restaurantPositions(includeInactive=false){
  const setupPositions = Array.isArray(data?.restaurantSetup?.positions) ? data.restaurantSetup.positions : [];
  return setupPositions.filter(position=>includeInactive || position.active !== false);
}
function openingRangeForDayShift(day,shift){
  const value=data?.restaurantSetup?.openingHours?.[day]?.[shift];
  return normalizeTimeRangeInput(value);
}
function suggestZone(employee, shift){
  if(!employee)return '';
  const zones = activeRestaurantZones(shift);
  if(!zones.length)return '';
  const position = cleanPositionName(employee.position || '').toLowerCase();
  const hasPosition = zone => (zone.defaultPositions || []).some(role => {
    const cleanRole = cleanPositionName(role || '').toLowerCase();
    return cleanRole && (cleanRole === position || position.includes(cleanRole) || cleanRole.includes(position));
  });
  const exact = zones.find(hasPosition);
  if(exact)return exact.name;
  const byRestaurantPosition = restaurantPositions(true).find(pos => cleanPositionName(pos.name).toLowerCase() === position && pos.defaultZone);
  if(byRestaurantPosition && zones.some(zone=>zone.name===byRestaurantPosition.defaultZone))return byRestaurantPosition.defaultZone;
  if(position.includes('extra') || position.includes('flexi') || position.includes('student')){
    const runner = zones.find(zone => (zone.defaultPositions || []).some(role => /runner|extra|flexi|student/i.test(role || '')));
    if(runner)return runner.name;
  }
  return '';
}
function timeRangeFor(e,d,s){
  const custom=data.assignmentTimes?.[e.id]?.[d]?.[s];
  if(custom)return custom;
  const zoneName=data.assignments?.[e.id]?.[d]?.[s]||suggestZone(e,s);
  const zone = activeRestaurantZones(s).find(z=>z.name===zoneName);
  const rule=zoneRules.find(r=>r.zone===zoneName);
  if(zone?.services?.[s] === false)return '';
  if(rule){
    const value=s==='Lunch'?rule.lunch:rule.evening;
    if(normalizeTimeRangeInput(value))return value;
  }
  return openingRangeForDayShift(d,s);
}
function hoursFromRange(range){const bounds=timeRangeBounds(range); return bounds?Math.max(0,(bounds.end-bounds.start)/60):0;}
function slotHours(e,d,s){return data.availability?.[e.id]?.[d]?.[s]?hoursFromRange(timeRangeFor(e,d,s)):0;}
function plannedSlotHours(e,d,s){return data.planning?.[e.id]?.[d]?.[s]?hoursFromRange(timeRangeFor(e,d,s)):0;}
function isPlanned(employeeId,day,shift){return !!data.planning?.[employeeId]?.[day]?.[shift];}
function employeePlannedWeekTotal(e){return days.reduce((sum,d)=>sum+shifts.reduce((slotSum,s)=>slotSum+plannedSlotHours(e,d,s),0),0);}
function employeeAbsentForSlot(employeeId,day,shift){
  const employee=emp(employeeId);
  const date=dateForDay(day);
  return (employee?.absences || []).some(absence=>{
    const start=normalizeDateString(absence.start);
    const end=normalizeDateString(absence.end || absence.start) || start;
    if(!start || date < start || date > end)return false;
    return !absence.shift || absence.shift === 'Full day' || absence.shift === shift;
  });
}
function availabilityOverlayState(employeeId,day,shift){
  if(employeeAbsentForSlot(employeeId,day,shift))return 'unavailable';
  const raw=data.availability?.[employeeId]?.[day]?.[shift];
  if(raw===true||raw==='available'||raw?.state==='available')return 'available';
  if(raw==='partial'||raw?.state==='partial')return 'partial';
  if(raw===false||raw==='unavailable'||raw?.state==='unavailable')return data.submitted?.[employeeId]?'unavailable':'unknown';
  return data.submitted?.[employeeId]?'unavailable':'unknown';
}
Restogogo.stateService = {
  ensure,
  load,
  save,
  saveController,
  validateStateBeforeSave,
  setupRequirements,
  isSetupReady,
  emp,
  activeEmployees,
  sortEmployees,
  activeRestaurantZones,
  restaurantPositions,
  openingRangeForDayShift,
  saveWeekSnapshot,
  loadWeekSnapshot,
  setWeekStartAndLoad,
  weeklyPayloadFromState,
  applyWeeklyPayloadToState,
  compactWeeklyPayload,
  getActualEntry,
  ensureActualEntry,
  setAvailabilitySlot,
  setPlanningSlot,
  setAssignmentSlot,
  setAssignmentTimeSlot,
  setSubmitted,
  isPlanned,
  employeePlannedWeekTotal,
  employeeAbsentForSlot,
  availabilityOverlayState,
  timeRangeFor,
  plannedSlotHours,
  slotHours,
  hoursFromRange
};
Object.assign(Restogogo.employees, {
  get: emp,
  active: activeEmployees,
  sort: sortEmployees,
  plannedWeekTotal: employeePlannedWeekTotal
});
Restogogo.actuals = Object.assign(Restogogo.actuals || {}, {
  getEntry: getActualEntry,
  ensureEntry: ensureActualEntry
});
