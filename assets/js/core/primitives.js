/* restogogo shared primitives.
 * Generic helpers live here. App/domain/data files may expose convenience
 * wrappers, but should not reimplement the primitive logic locally.
 */
(function(){
  const Restogogo = window.Restogogo = window.Restogogo || {};
  const DAYS = Object.freeze(['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday']);
  const SHIFTS = Object.freeze(['Lunch','Evening']);

  function isPlainObject(value){return !!value && typeof value === 'object' && !Array.isArray(value);}
  function clone(value){return value == null ? value : (typeof structuredClone === 'function' ? structuredClone(value) : JSON.parse(JSON.stringify(value)));}
  function id(){return (crypto.randomUUID ? crypto.randomUUID() : String(Date.now()+Math.random())).replaceAll('-','').slice(0,12);}
  function text(value){return String(value ?? '').trim();}
  function numberValue(value){const n = Number(value); return Number.isFinite(n) ? n : 0;}
  function boolValue(value){return value === true;}
  function esc(value=''){return String(value).replace(/[&<>\"]/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;'}[ch]));}

  function cleanPositionName(value=''){return String(value || '').replace(/^\s*[A-Z]\.\s*/, '').trim();}
  function employeeInitials(name=''){
    return String(name||'').trim().split(/\s+/).filter(Boolean).slice(0,2).map(part=>part.charAt(0).toUpperCase()).join('') || '?';
  }
  function sanitizePin(value=''){return String(value || '').replace(/\D/g,'').slice(0,4);}
  function sanitizeWorkspaceId(value){
    const raw = String(value || '').trim().toLowerCase();
    return raw.replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'').slice(0,64) || 'restaurant';
  }
  function sanitizeId(value, prefix='item'){
    const raw = String(value || '').trim();
    if(raw)return raw.replace(/[^a-zA-Z0-9_-]+/g,'-').replace(/^-+|-+$/g,'').slice(0,96) || `${prefix}-${Date.now()}`;
    return `${prefix}-${Date.now()}-${Math.round(Math.random()*10000)}`;
  }
  function normalizeSlug(value,prefix='item'){
    const raw = String(value || '').trim().toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g,'')
      .replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'');
    return raw || `${prefix}-${id()}`;
  }

  function money(n){return '€'+Number(n||0).toFixed(2);}
  function fmtPeople(n){return String(Number(n)||0)+'p';}
  function fmtHours(n){
    const value=Number(n)||0;
    const sign=value<0?'-':'';
    const totalMinutes=Math.round(Math.abs(value)*60);
    const h=Math.floor(totalMinutes/60);
    const m=totalMinutes%60;
    return m?`${sign}${h}h${String(m).padStart(2,'0')}`:`${sign}${h}h`;
  }

  function localISO(d){
    const x=new Date(d);
    x.setHours(12,0,0,0);
    return `${x.getFullYear()}-${String(x.getMonth()+1).padStart(2,'0')}-${String(x.getDate()).padStart(2,'0')}`;
  }
  function parseISO(iso){
    const [y,m,d]=String(iso||localISO(new Date())).split('-').map(Number);
    const x=new Date(y,(m||1)-1,d||1);
    x.setHours(12,0,0,0);
    return x;
  }
  function validDateLocal(value){
    const raw=String(value||'').trim();
    if(!raw)return '';
    if(/^\d{4}-\d{2}-\d{2}$/.test(raw))return raw;
    const t=Date.parse(raw);
    return Number.isFinite(t)?localISO(new Date(t)):'';
  }
  function validDateUtc(value){
    const raw=String(value||'').trim();
    if(!raw)return '';
    if(/^\d{4}-\d{2}-\d{2}$/.test(raw))return raw;
    const t=Date.parse(raw);
    return Number.isFinite(t)?new Date(t).toISOString().slice(0,10):'';
  }
  function validIso(value){
    const raw=String(value||'').trim();
    if(!raw)return '';
    const t=Date.parse(raw);
    return Number.isFinite(t)?new Date(t).toISOString():'';
  }
  function monday(d=new Date()){
    const x=(d instanceof Date)?new Date(d):parseISO(d);
    x.setHours(12,0,0,0);
    const day=(x.getDay()+6)%7;
    x.setDate(x.getDate()-day);
    return localISO(x);
  }
  function addDays(iso,n){const d=parseISO(iso); d.setDate(d.getDate()+n); return localISO(d);}
  function todayISO(){return localISO(new Date());}
  function shortDisplayDate(iso){const d=parseISO(iso); return d.toLocaleDateString('en-GB',{day:'2-digit',month:'2-digit'});}
  function validClock(value){
    const raw=String(value||'').trim();
    // Accept HH:MM or HH:MM:SS (PostgreSQL TIME columns return seconds suffix)
    const m=raw.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
    if(!m)return '';
    const h=Number(m[1]);
    const mm=Number(m[2]);
    return h>=0&&h<=23&&mm>=0&&mm<=59?`${String(h).padStart(2,'0')}:${String(mm).padStart(2,'0')}`:'';
  }
  function validRange(value){
    const raw=String(value||'').trim().replace(/[–—−]/g,'-').replace(/\s*-\s*/g,'-');
    return /^(?:[01]?\d|2[0-3]):[0-5]\d-(?:[01]?\d|2[0-3]):[0-5]\d$/.test(raw)?raw:'';
  }
  function timeToMinutes(value=''){
    const match=String(value||'').trim().match(/^(\d{1,2}):(\d{2})$/);
    return match ? (+match[1])*60+(+match[2]) : null;
  }
  function timeRangeBounds(range=''){
    const [startRaw,endRaw]=String(range||'').split('-').map(part=>part.trim());
    let start=timeToMinutes(startRaw);
    let end=timeToMinutes(endRaw);
    if(start===null||end===null)return null;
    if(end<start)end+=1440;
    return {start,end};
  }
  function normalizeDay(value){const raw=String(value||'').trim(); return DAYS.includes(raw) ? raw : '';}
  function normalizeShift(value){const raw=String(value||'').trim(); return SHIFTS.includes(raw) ? raw : '';}
  function normalizeSparseString(value){const raw = String(value || '').trim(); return raw || undefined;}

  const primitives = Object.freeze({
    DAYS,
    SHIFTS,
    isPlainObject,
    clone,
    id,
    text,
    numberValue,
    boolValue,
    esc,
    cleanPositionName,
    employeeInitials,
    sanitizePin,
    sanitizeWorkspaceId,
    sanitizeId,
    normalizeSlug,
    money,
    fmtPeople,
    fmtHours,
    localISO,
    parseISO,
    validDateLocal,
    validDateUtc,
    validIso,
    monday,
    addDays,
    todayISO,
    shortDisplayDate,
    validClock,
    validRange,
    timeToMinutes,
    timeRangeBounds,
    normalizeDay,
    normalizeShift,
    normalizeSparseString
  });

  window.RestogogoPrimitives = primitives;
  Restogogo.primitives = primitives;
})();
