/* restogogo data contract for shared Planning, Actuals and Badge Terminal state. */
var DATA_CONTRACT_VERSION = 25;
var WEEKLY_STATE_KEYS = Object.freeze([
  'availability',
  'planning',
  'assignments',
  'assignmentTimes',
  'submitted',
  'notes',
  'actualEntries',
  'status'
]);
var ACTUAL_PHOTO_STATUSES = Object.freeze(['ok','blocked','unsupported','error','skipped']);

function isPlainObject(value){
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function emptyWeeklyPayload(){
  return {
    availability:{},
    planning:{},
    assignments:{},
    assignmentTimes:{},
    submitted:{},
    notes:{},
    actualEntries:{},
    status:'Draft'
  };
}

function normalizeStatus(value){
  return value === 'Published' ? 'Published' : 'Draft';
}

function normalizeWeekStartKey(value){
  const raw = String(value || '').trim();
  if(!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return '';
  return monday(raw);
}

function normalizeClockValue(value){
  const raw = String(value || '').trim();
  const match = raw.match(/^(\d{1,2}):(\d{2})$/);
  if(!match)return '';
  const h = Number(match[1]);
  const m = Number(match[2]);
  if(h < 0 || h > 23 || m < 0 || m > 59)return '';
  return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`;
}

function normalizeIsoStamp(value){
  const raw = String(value || '').trim();
  if(!raw)return '';
  const time = Date.parse(raw);
  return Number.isFinite(time) ? new Date(time).toISOString() : '';
}

function normalizePhotoStatus(value){
  const raw = String(value || '').trim();
  return ACTUAL_PHOTO_STATUSES.includes(raw) ? raw : '';
}

function normalizePhotoDataUrl(value){
  const raw = String(value || '').trim();
  return /^data:image\/(jpeg|jpg|png|webp);base64,/i.test(raw) ? raw : '';
}

function normalizeActualEntry(entry){
  const source = isPlainObject(entry) ? entry : {};
  const normalized = Object.assign({}, source, {
    clockIn: normalizeClockValue(source.clockIn),
    clockOut: normalizeClockValue(source.clockOut),
    clockInAt: normalizeIsoStamp(source.clockInAt),
    clockOutAt: normalizeIsoStamp(source.clockOutAt),
    createdAt: normalizeIsoStamp(source.createdAt),
    updatedAt: normalizeIsoStamp(source.updatedAt),
    clockInPhoto: normalizePhotoDataUrl(source.clockInPhoto),
    clockOutPhoto: normalizePhotoDataUrl(source.clockOutPhoto),
    clockInPhotoStatus: normalizePhotoStatus(source.clockInPhotoStatus),
    clockOutPhotoStatus: normalizePhotoStatus(source.clockOutPhotoStatus),
    clockInPhotoCapturedAt: normalizeIsoStamp(source.clockInPhotoCapturedAt),
    clockOutPhotoCapturedAt: normalizeIsoStamp(source.clockOutPhotoCapturedAt)
  });

  if(normalized.clockOut && !normalized.clockIn){
    normalized.clockOut = '';
    normalized.clockOutAt = '';
  }

  return normalized;
}


function hasActualEntryValue(entry){
  const normalized = normalizeActualEntry(entry);
  return !!(
    normalized.clockIn || normalized.clockOut ||
    normalized.clockInAt || normalized.clockOutAt ||
    normalized.clockInPhoto || normalized.clockOutPhoto ||
    normalized.clockInPhotoStatus || normalized.clockOutPhotoStatus ||
    normalized.clockInPhotoCapturedAt || normalized.clockOutPhotoCapturedAt
  );
}


function compactActualEntry(entry){
  const normalized = normalizeActualEntry(entry);
  if(!hasActualEntryValue(normalized)) return undefined;
  const compact = {};
  [
    'clockIn','clockOut','clockInAt','clockOutAt','createdAt','updatedAt',
    'clockInPhoto','clockOutPhoto','clockInPhotoStatus','clockOutPhotoStatus',
    'clockInPhotoCapturedAt','clockOutPhotoCapturedAt','source'
  ].forEach(key=>{
    const value = normalized[key];
    if(value !== undefined && value !== null && String(value).trim() !== '') compact[key] = value;
  });
  return compact;
}

function normalizeAvailabilityValue(value){
  if(value === true || value === 'available') return true;
  if(value === 'partial') return 'partial';
  if(isPlainObject(value)){
    if(value.state === 'available') return true;
    if(value.state === 'partial') return 'partial';
  }
  // In the sparse model, absence means unavailable once the employee submitted.
  // False/unavailable values from older full-shape states are therefore omitted.
  return undefined;
}

function normalizeSparseString(value){
  const raw = String(value || '').trim();
  return raw || undefined;
}

function isValidDayShift(day, shift){
  return days.includes(day) && shifts.includes(shift);
}

function normalizeEmployeeRecord(employee, index, positionList){
  const source = isPlainObject(employee) ? employee : {};
  const normalized = Object.assign({}, source);
  const generatedId = `e${index}`;

  normalized.id = String(source.id || generatedId).trim() || generatedId;
  normalized.name = String(source.name || '').trim();
  normalized.position = cleanPositionName(source.position || '');
  normalized.rate = Number.isFinite(Number(source.rate)) ? Number(source.rate) : 0;
  normalized.active = source.active === undefined ? false : !!source.active;
  normalized.managerAccess = !!(source.managerAccess || source.isManager || source.manager);

  // Strict Supabase mode: do not invent a PIN. Missing PIN is a real setup issue.
  normalized.pin = sanitizePin(source.pin);

  // Team module master data. These fields are intentionally lightweight: enough
  // to drive Planning, Badge Terminal and export readiness without overbuilding HR.
  [
    'payrollId','externalId','employeeNumber','email','phone','address','nationality','language',
    'contractType','contractStart','contractEnd','documentFolder','photoUrl','dateOfBirth',
    'taxStatus','socialSecurityNo','iban','emergencyName','emergencyRelation','emergencyPhone','notes'
  ].forEach(field=>{
    normalized[field] = String(source[field] || '').trim();
  });
  normalized.contractStart = normalizeDateString(normalized.contractStart);
  normalized.contractEnd = normalizeDateString(normalized.contractEnd);
  normalized.dateOfBirth = normalizeDateString(normalized.dateOfBirth);
  normalized.contractHours = Number.isFinite(Number(source.contractHours)) ? Math.max(0,Number(source.contractHours)) : 0;
  normalized.hourlyCost = Number.isFinite(Number(source.hourlyCost)) ? Math.max(0,Number(source.hourlyCost)) : 0;
  normalized.payrollReady = source.payrollReady === undefined ? employeePayrollMissingFields(normalized).length === 0 : !!source.payrollReady;
  normalized.absences = normalizeAbsenceList(source.absences);
  normalized.documents = normalizeDocumentList(source.documents);

  delete normalized.isManager;
  delete normalized.manager;
  return normalized;
}

function normalizeDateString(value){
  const raw = String(value || '').trim();
  if(!raw) return '';
  if(/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const time = Date.parse(raw);
  return Number.isFinite(time) ? new Date(time).toISOString().slice(0,10) : '';
}

function normalizeSlug(value,prefix='item'){
  const raw = String(value || '').trim().toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g,'')
    .replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'');
  return raw || `${prefix}-${id()}`;
}

function normalizeDocumentList(value){
  return (Array.isArray(value) ? value : []).map((doc,index)=>{
    const source = isPlainObject(doc) ? doc : {name:doc};
    const name = String(source.name || source.fileName || `Document ${index + 1}`).trim();
    if(!name) return null;
    return {
      id:String(source.id || normalizeSlug(name,'doc')).trim(),
      name,
      type:String(source.type || source.mime || documentTypeFromName(name)).trim(),
      uploadedAt:normalizeIsoStamp(source.uploadedAt || source.createdAt) || new Date().toISOString(),
      status:String(source.status || 'Uploaded').trim(),
      size:String(source.size || '').trim(),
      storagePath:String(source.storagePath || '').trim(),
      metadata:isPlainObject(source.metadata) ? source.metadata : {}
    };
  }).filter(Boolean);
}

function documentTypeFromName(name){
  const lower = String(name || '').toLowerCase();
  if(lower.endsWith('.pdf')) return 'PDF';
  if(lower.endsWith('.xlsx') || lower.endsWith('.xls')) return 'Excel';
  if(lower.endsWith('.docx') || lower.endsWith('.doc')) return 'Word';
  return 'File';
}

function normalizeAbsenceList(value){
  return (Array.isArray(value) ? value : []).map((absence,index)=>{
    const source = isPlainObject(absence) ? absence : {};
    const start = normalizeDateString(source.start || source.date);
    const end = normalizeDateString(source.end || source.date || start);
    if(!start) return null;
    const shift = shifts.includes(source.shift) ? source.shift : 'Full day';
    return {
      id:String(source.id || `absence-${start}-${index}`).trim(),
      start,
      end:end || start,
      shift,
      reason:String(source.reason || 'Absence').trim(),
      status:String(source.status || 'Approved').trim(),
      metadata:isPlainObject(source.metadata) ? source.metadata : {}
    };
  }).filter(Boolean);
}

function employeePayrollMissingFields(employee){
  const missing=[];
  if(!String(employee?.payrollId || employee?.employeeNumber || '').trim()) missing.push('Payroll ID');
  if(!String(employee?.contractType || '').trim()) missing.push('Contract type');
  if(!Number(employee?.contractHours)) missing.push('Weekly hours');
  if(!String(employee?.pin || '').trim()) missing.push('PIN');
  return missing;
}

function zoneDefaultServices(source={}){
  const services = isPlainObject(source.services) ? source.services : {};
  return {
    Lunch: services.Lunch === undefined ? !!normalizeTimeRangeInput(source.lunch) : !!services.Lunch,
    Evening: services.Evening === undefined ? !!normalizeTimeRangeInput(source.evening) : !!services.Evening
  };
}

function restaurantSetupFromLegacy(source={}){
  const legacyRules = Array.isArray(source.zoneRules) ? source.zoneRules : [];
  const sourcePositions = Array.isArray(source.positions) ? source.positions : [];
  const zoneMap = new Map();
  legacyRules.forEach((rule,index)=>{
    const name = String(rule?.zone || '').trim();
    if(!name) return;
    const existing = zoneMap.get(name) || {
      id:normalizeSlug(name,'zone'),
      name,
      capacity:0,
      active:rule.active === undefined ? true : !!rule.active,
      services:zoneDefaultServices(rule),
      defaultPositions:[],
      notes:''
    };
    const role = cleanPositionName(rule?.role || '');
    if(role && !existing.defaultPositions.includes(role)) existing.defaultPositions.push(role);
    existing.services.Lunch = existing.services.Lunch || !!rule?.lunch;
    existing.services.Evening = existing.services.Evening || !!rule?.evening;
    zoneMap.set(name, existing);
  });
  return {
    general:{},
    zones:[...zoneMap.values()],
    positions:sourcePositions.map((name,index)=>({
      id:normalizeSlug(name,`position-${index+1}`),
      name:cleanPositionName(name),
      active:true,
      department:'',
      defaultZone:''
    })).filter(position=>position.name),
    openingHours:{},
    payrollRules:{},
    documents:[]
  };
}

function normalizeRestaurantSetup(setup, source={}){
  const base = restaurantSetupFromLegacy(source);
  const raw = isPlainObject(setup) ? setup : {};
  const general = isPlainObject(raw.general) ? raw.general : {};
  const normalized = {
    general:{
      legalName:String(general.legalName || source?.restaurant?.name || '').trim(),
      companyNumber:String(general.companyNumber || '').trim(),
      address:String(general.address || '').trim(),
      city:String(general.city || source?.restaurant?.city || '').trim(),
      phone:String(general.phone || '').trim(),
      email:String(general.email || '').trim()
    },
    zones:[],
    positions:[],
    openingHours:{},
    payrollRules:{},
    documents:normalizeDocumentList(raw.documents || base.documents)
  };

  const rawZones = Array.isArray(raw.zones) ? raw.zones : [];
  normalized.zones = rawZones.map((zone,index)=>{
    const z = isPlainObject(zone) ? zone : {name:zone};
    const name = String(z.name || z.zone || '').trim();
    const metadata = isPlainObject(z.metadata) ? z.metadata : {};
    const rawDefaultTimes = isPlainObject(z.defaultTimes) ? z.defaultTimes : (isPlainObject(metadata.defaultTimes) ? metadata.defaultTimes : {});
    return {
      id:String(z.id || normalizeSlug(name,`zone-${index+1}`)).trim(),
      name,
      capacity:Number.isFinite(Number(z.capacity)) ? Math.max(0,Number(z.capacity)) : 0,
      active:z.active === undefined ? true : !!z.active,
      services:zoneDefaultServices(z),
      defaultPositions:(Array.isArray(z.defaultPositions) ? z.defaultPositions : (z.role ? [z.role] : []))
        .map(cleanPositionName).filter(Boolean).filter((v,i,a)=>a.indexOf(v)===i),
      defaultTimes:{
        Lunch:normalizeTimeRangeInput(rawDefaultTimes.Lunch),
        Evening:normalizeTimeRangeInput(rawDefaultTimes.Evening)
      },
      metadata,
      notes:String(z.notes || '').trim()
    };
  }).filter(z=>z.name);

  const rawPositions = Array.isArray(raw.positions) ? raw.positions : [];
  normalized.positions = rawPositions.map((position,index)=>{
    const p = isPlainObject(position) ? position : {name:position};
    const name = cleanPositionName(p.name || p.position || '');
    return {
      id:String(p.id || normalizeSlug(name,`position-${index+1}`)).trim(),
      name,
      active:p.active === undefined ? true : !!p.active,
      department:String(p.department || '').trim(),
      defaultZone:String(p.defaultZone || '').trim(),
      hourlyCost:Number.isFinite(Number(p.hourlyCost)) ? Math.max(0,Number(p.hourlyCost)) : 0,
      metadata:isPlainObject(p.metadata) ? p.metadata : {}
    };
  }).filter(p=>p.name).filter((p,index,array)=>array.findIndex(other=>other.name===p.name)===index);

  const rawHours = isPlainObject(raw.openingHours) ? raw.openingHours : {};
  days.forEach(day=>{
    const daySource = isPlainObject(rawHours?.[day]) ? rawHours[day] : {};
    normalized.openingHours[day] = {
      open:daySource.open === undefined ? false : !!daySource.open,
      Lunch:normalizeTimeRangeInput(daySource.Lunch),
      Evening:normalizeTimeRangeInput(daySource.Evening)
    };
  });

  const rawPayroll = isPlainObject(raw.payrollRules) ? raw.payrollRules : {};
  normalized.payrollRules = Object.assign({}, rawPayroll, {
    provider:String(rawPayroll.provider || '').trim(),
    exportFormat:String(rawPayroll.exportFormat || '').trim(),
    costCenter:String(rawPayroll.costCenter || '').trim(),
    missingSettings:Array.isArray(rawPayroll.missingSettings) ? rawPayroll.missingSettings.map(v=>String(v||'').trim()).filter(Boolean) : []
  });
  return normalized;
}

function zoneRulesFromRestaurantSetup(setup){
  const source = isPlainObject(setup) ? setup : {};
  const opening = isPlainObject(source.openingHours) ? source.openingHours : {};
  const mondayHours = opening.Monday || {};
  const zones = Array.isArray(source.zones) ? source.zones : [];
  return zones.filter(zone=>zone.active !== false).map(zone=>{
    const defaultTimes = isPlainObject(zone.defaultTimes) ? zone.defaultTimes : (isPlainObject(zone.metadata?.defaultTimes) ? zone.metadata.defaultTimes : {});
    return {
      zone:String(zone.name || '').trim(),
      role:cleanPositionName(zone.defaultPositions?.[0] || ''),
      lunch:zone.services?.Lunch ? (normalizeTimeRangeInput(defaultTimes.Lunch) || normalizeTimeRangeInput(mondayHours.Lunch)) : '',
      evening:zone.services?.Evening ? (normalizeTimeRangeInput(defaultTimes.Evening) || normalizeTimeRangeInput(mondayHours.Evening)) : ''
    };
  }).filter(rule=>rule.zone);
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

  const weeklyObjects = ['availability','planning','assignments','assignmentTimes','submitted','notes','actualEntries'];
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
