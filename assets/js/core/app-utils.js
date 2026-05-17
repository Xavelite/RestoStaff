/* restogogo app utilities. */
function id(){return (crypto.randomUUID ? crypto.randomUUID() : String(Date.now()+Math.random())).replaceAll('-','').slice(0,12);}
function esc(value=''){return String(value).replace(/[&<>"]/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[ch]));}
function clone(value){return typeof structuredClone==='function' ? structuredClone(value) : JSON.parse(JSON.stringify(value));}
function cleanPositionName(p=''){return String(p).replace(/^\s*[A-Z]\.\s*/, '').trim();}
function employeeInitials(name=''){return String(name||'').trim().split(/\s+/).filter(Boolean).slice(0,2).map(part=>part.charAt(0).toUpperCase()).join('') || '?';}
function sanitizePin(value=''){return String(value||'').replace(/\D/g,'').slice(0,4);}
function money(n){return '€'+Number(n||0).toFixed(2);}
function fmtPeople(n){return String(Number(n)||0)+'p';}
function fmtHours(n){const value=Number(n)||0; const sign=value<0?'-':''; const totalMinutes=Math.round(Math.abs(value)*60); const h=Math.floor(totalMinutes/60); const m=totalMinutes%60; return m?`${sign}${h}h${String(m).padStart(2,'0')}`:`${sign}${h}h`;}
function localISO(d){const x=new Date(d); x.setHours(12,0,0,0); return `${x.getFullYear()}-${String(x.getMonth()+1).padStart(2,'0')}-${String(x.getDate()).padStart(2,'0')}`;}
function parseISO(iso){const [y,m,d]=String(iso||localISO(new Date())).split('-').map(Number); const x=new Date(y,(m||1)-1,d||1); x.setHours(12,0,0,0); return x;}
function validDate(value){const raw=String(value||'').trim(); if(!raw)return ''; if(/^\d{4}-\d{2}-\d{2}$/.test(raw))return raw; const t=Date.parse(raw); return Number.isFinite(t)?localISO(new Date(t)):'';}
function monday(d=new Date()){const x=(d instanceof Date)?new Date(d):parseISO(d); x.setHours(12,0,0,0); const day=(x.getDay()+6)%7; x.setDate(x.getDate()-day); return localISO(x);}
function addDays(iso,n){const d=parseISO(iso); d.setDate(d.getDate()+n); return localISO(d);}
function todayISO(){return localISO(new Date());}
function shortDisplayDate(iso){const d=parseISO(iso); return d.toLocaleDateString('en-GB',{day:'2-digit',month:'2-digit'});}
function shortDateLabel(iso){return shortDisplayDate(iso);}
function dateForDay(dayName){return addDays(data.weekStart, days.indexOf(dayName));}
function weekDisplayRange(){return `${shortDisplayDate(data.weekStart)} – ${shortDisplayDate(addDays(data.weekStart,6))}`;}
function weekRangeLabel(){return `${shortDateLabel(data.weekStart)} – ${shortDateLabel(addDays(data.weekStart,6))}`;}
function currentWeekStart(){return monday(todayISO());}
function defaultWeekForPage(pageName){
  const registryPages = Restogogo.registry?.defaultWeekPages?.();
  if(registryPages?.has?.(pageName))return currentWeekStart();
  return '';
}
function applyDefaultWeekForPage(pageName){
  const preferred=defaultWeekForPage(pageName);
  if(!preferred||!data||data.weekStart===preferred)return;
  setWeekStartAndLoad(preferred);
}
function displayTimeRange(range=''){return String(range||'').replace(/\s*-\s*/,'–');}
function normalizeTimeRangeInput(value){const raw=String(value||'').trim().replace(/[–—−]/g,'-').replace(/\s*-\s*/g,'-'); return /^(?:[01]?\d|2[0-3]):[0-5]\d-(?:[01]?\d|2[0-3]):[0-5]\d$/.test(raw)?raw:'';}
function timeToMinutes(value=''){const match=String(value||'').trim().match(/^(\d{1,2}):(\d{2})$/); return match ? (+match[1])*60+(+match[2]) : null;}
function timeRangeBounds(range=''){const [startRaw,endRaw]=String(range||'').split('-').map(part=>part.trim()); let start=timeToMinutes(startRaw); let end=timeToMinutes(endRaw); if(start===null||end===null)return null; if(end<start)end+=1440; return {start,end};}
function workspaceId(){return window.DataAdapter.getWorkspaceId ? window.DataAdapter.getWorkspaceId() : ''; }
function slugifyWorkspace(value){if(window.DataAdapter.sanitizeWorkspaceId)return window.DataAdapter.sanitizeWorkspaceId(value); return String(value||'restaurant').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'').slice(0,64)||'restaurant';}
function restaurantName(){return (data?.restaurant?.name||'').trim();}
function restaurantOwnerName(){return (data?.restaurant?.ownerName||'').trim();}



Restogogo.dates = {
  todayISO,
  validDate,
  monday,
  addDays,
  dateForDay,
  weekDisplayRange,
  weekRangeLabel,
  displayTimeRange,
  timeToMinutes,
  timeRangeBounds,
  shortDisplayDate,
  shortDateLabel
};
Restogogo.format = {
  esc,
  money,
  fmtPeople,
  fmtHours,
  decimalHours: value => Restogogo.export?.decimalHours ? Restogogo.export.decimalHours(value) : (Number(value)||0).toFixed(2)
};
Restogogo.employees = Object.assign(Restogogo.employees || {}, {
  initials: employeeInitials,
  sanitizePin,
  cleanPositionName
});
