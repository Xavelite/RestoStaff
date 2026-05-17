/* restogogo data contract constants and shared primitives. */
var DATA_CONTRACT_VERSION = 40;
var WEEKLY_STATE_KEYS = Object.freeze([
  'availability',
  'planning',
  'assignments',
  'assignmentPositions',
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
    assignmentPositions:{},
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

function normalizeDateString(value){
  const raw = String(value || '').trim();
  if(!raw) return '';
  if(/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const time = Date.parse(raw);
  return Number.isFinite(time) ? new Date(time).toISOString().slice(0,10) : '';
}

function normalizeIsoStamp(value){
  const raw = String(value || '').trim();
  if(!raw) return '';
  const time = Date.parse(raw);
  return Number.isFinite(time) ? new Date(time).toISOString() : '';
}

function normalizeSlug(value,prefix='item'){
  const raw = String(value || '').trim().toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g,'')
    .replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'');
  return raw || `${prefix}-${id()}`;
}

function normalizeSparseString(value){
  const raw = String(value || '').trim();
  return raw || undefined;
}

function isValidDayShift(day, shift){
  return days.includes(day) && shifts.includes(shift);
}
