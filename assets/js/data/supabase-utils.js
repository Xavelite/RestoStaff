(function(){
  const DAYS = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'];
  const SHIFTS = ['Lunch','Evening'];
  function isPlainObject(value){return !!value && typeof value === 'object' && !Array.isArray(value);}
  function cloneData(value){return value == null ? value : (typeof structuredClone === 'function' ? structuredClone(value) : JSON.parse(JSON.stringify(value)));}
  function text(value){return String(value ?? '').trim();}
  function numberValue(value){const n = Number(value); return Number.isFinite(n) ? n : 0;}
  function boolValue(value){return value === true;}
  function cleanPositionName(value){return String(value || '').replace(/^\s*[A-Z]\.\s*/, '').trim();}
  function sanitizePin(value=''){return String(value || '').replace(/\D/g,'').slice(0,4);}
  function sanitizeWorkspaceId(value){const raw = String(value || '').trim().toLowerCase(); return (raw.replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'').slice(0,64) || 'restaurant');}
  function sanitizeId(value, prefix='item'){
    const raw = String(value || '').trim();
    if(raw)return raw.replace(/[^a-zA-Z0-9_-]+/g,'-').replace(/^-+|-+$/g,'').slice(0,96) || `${prefix}-${Date.now()}`;
    return `${prefix}-${Date.now()}-${Math.round(Math.random()*10000)}`;
  }
  function localISO(d){const x=new Date(d); x.setHours(12,0,0,0); return `${x.getFullYear()}-${String(x.getMonth()+1).padStart(2,'0')}-${String(x.getDate()).padStart(2,'0')}`;}
  function parseISO(iso){const [y,m,d]=String(iso||localISO(new Date())).split('-').map(Number); const x=new Date(y,(m||1)-1,d||1); x.setHours(12,0,0,0); return x;}
  function monday(d=new Date()){const x=(d instanceof Date)?new Date(d):parseISO(d); x.setHours(12,0,0,0); const day=(x.getDay()+6)%7; x.setDate(x.getDate()-day); return localISO(x);}
  function validDate(value){const raw=String(value||'').trim(); if(!raw)return ''; if(/^\d{4}-\d{2}-\d{2}$/.test(raw))return raw; const t=Date.parse(raw); return Number.isFinite(t)?new Date(t).toISOString().slice(0,10):'';}
  function validIso(value){const raw=String(value||'').trim(); if(!raw)return ''; const t=Date.parse(raw); return Number.isFinite(t)?new Date(t).toISOString():'';}
  function validClock(value){const raw=String(value||'').trim(); const m=raw.match(/^(\d{1,2}):(\d{2})$/); if(!m)return ''; const h=Number(m[1]); const mm=Number(m[2]); return h>=0&&h<=23&&mm>=0&&mm<=59?`${String(h).padStart(2,'0')}:${String(mm).padStart(2,'0')}`:'';}
  function validRange(value){const raw=String(value||'').trim().replace(/[–—−]/g,'-').replace(/\s*-\s*/g,'-'); return /^(?:[01]?\d|2[0-3]):[0-5]\d-(?:[01]?\d|2[0-3]):[0-5]\d$/.test(raw)?raw:'';}
  function normalizeDay(value){const raw=String(value||'').trim(); return DAYS.includes(raw) ? raw : '';}
  function normalizeShift(value){const raw=String(value||'').trim(); return SHIFTS.includes(raw) ? raw : '';}
  window.RestogogoSupabaseUtils={DAYS,SHIFTS,isPlainObject,cloneData,text,numberValue,boolValue,cleanPositionName,sanitizePin,sanitizeWorkspaceId,sanitizeId,localISO,parseISO,monday,validDate,validIso,validClock,validRange,normalizeDay,normalizeShift};
})();
