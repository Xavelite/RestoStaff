/* restogogo app utilities. */
const APP_PRIMITIVES = window.RestogogoPrimitives;
function id(){return APP_PRIMITIVES.id();}
function esc(value=''){return APP_PRIMITIVES.esc(value);}
function clone(value){return APP_PRIMITIVES.clone(value);}
function cleanJobFunctionName(p=''){return APP_PRIMITIVES.cleanJobFunctionName(p);}
function employeeInitials(name=''){return APP_PRIMITIVES.employeeInitials(name);}
function sanitizePin(value=''){return APP_PRIMITIVES.sanitizePin(value);}
function money(n){return APP_PRIMITIVES.money(n);}
function fmtPeople(n){return APP_PRIMITIVES.fmtPeople(n);}
function fmtHours(n){return APP_PRIMITIVES.fmtHours(n);}
function localISO(d){return APP_PRIMITIVES.localISO(d);}
function parseISO(iso){return APP_PRIMITIVES.parseISO(iso);}
function validDate(value){return APP_PRIMITIVES.validDateLocal(value);}
function monday(d=new Date()){return APP_PRIMITIVES.monday(d);}
function addDays(iso,n){return APP_PRIMITIVES.addDays(iso,n);}
function todayISO(){return APP_PRIMITIVES.todayISO();}
function shortDisplayDate(iso){return APP_PRIMITIVES.shortDisplayDate(iso);}
function shortDateLabel(iso){return shortDisplayDate(iso);}
function dateForDay(dayName){return addDays(data.weekStart, days.indexOf(dayName));}
function weekDisplayRange(){return `${shortDisplayDate(data.weekStart)} – ${shortDisplayDate(addDays(data.weekStart,6))}`;}
function weekRangeLabel(){return `${shortDateLabel(data.weekStart)} – ${shortDateLabel(addDays(data.weekStart,6))}`;}
function currentWeekStart(){return monday(todayISO());}
const SHARED_WEEK_CONTEXT_PAGES = new Set(['planning','actuals','employee-schedule','employee-time']);
function defaultWeekForPage(pageName){
  if(pageName === 'home' || pageName === 'badge-terminal')return currentWeekStart();
  if(SHARED_WEEK_CONTEXT_PAGES.has(pageName))return data?.weekStart ? '' : currentWeekStart();
  const registryPages = Restogogo.registry?.defaultWeekPages?.();
  if(registryPages?.has?.(pageName))return data?.weekStart ? '' : currentWeekStart();
  return '';
}
function applyDefaultWeekForPage(pageName){
  const preferred=defaultWeekForPage(pageName);
  if(!preferred||!data||data.weekStart===preferred)return;
  setWeekStartAndLoad(preferred);
}
function displayTimeRange(range=''){return String(range||'').replace(/\s*-\s*/,'–');}
function normalizeTimeRangeInput(value){return APP_PRIMITIVES.validRange(value);}
function timeToMinutes(value=''){return APP_PRIMITIVES.timeToMinutes(value);}
function timeRangeBounds(range=''){return APP_PRIMITIVES.timeRangeBounds(range);}
function workspaceId(){return window.DataAdapter.getWorkspaceId ? window.DataAdapter.getWorkspaceId() : ''; }
function slugifyWorkspace(value){return APP_PRIMITIVES.sanitizeWorkspaceId(value);}
function restaurantName(){return (data?.restaurant?.name||'').trim();}



