/* restogogo repository utilities.
 * Shared pure helpers for DB repository modules. Domain repositories own payloads/saves.
 */
(function(){
  function create(context){
    const P = window.RestogogoPrimitives;
    const Result = window.RestogogoRepositoryResult;
    if(!P)throw new Error('Repository utilities require RestogogoPrimitives.');
    if(!Result)throw new Error('Repository utilities require RestogogoRepositoryResult.');
    const DAYS = P.DAYS.slice();
    const SHIFTS = P.SHIFTS.slice();
    const getWorkspaceId = () => String(context?.getWorkspaceId?.() || '').trim();
    const auth = () => context?.auth?.();
    const setError = message => context?.setError?.(message);
    function text(value){return P.text(value);}
    function num(value){return P.numberValue(value);}
    function date(value){return P.validDateUtc(value);}
    function monday(value=new Date()){return P.monday(value);}
    function weekdayFromName(name){const index = DAYS.indexOf(String(name || '').trim()); return index >= 0 ? index + 1 : null;}
    function serviceKey(label){const value = String(label || '').trim().toLowerCase(); return value === 'lunch' ? 'lunch' : (value === 'evening' ? 'evening' : '');}
    function weekPayloadForState(source, weekStart){
      const week = date(weekStart) || monday();
      if(week === monday(source?.weekStart || new Date()))return source || {};
      return source?.history?.[week] || emptyWeeklyPayload();
    }
    function splitRange(value){
      const rangeValue = String(value || '').trim();
      if(!rangeValue)return {starts_at:null, ends_at:null};
      const parts = rangeValue.split('-').map(part=>P.validClock(part));
      return {starts_at:parts[0] || null, ends_at:parts[1] || null};
    }
    function okSnapshot(snapshot, details={}){
      return Result.ok({snapshot:snapshot || null, details:details || null});
    }
    // fail() is a pure Result builder — it does not call setError().
    // Error notification is the router's responsibility (save-router.callSave).
    function fail(message, options={}){
      const clean = String(message || 'Save failed.').trim() || 'Save failed.';
      return Result.fail(clean, options || {});
    }
    return Object.freeze({P,DAYS,SHIFTS,getWorkspaceId,auth,setError,text,num,date,monday,weekdayFromName,serviceKey,weekPayloadForState,splitRange,okSnapshot,fail});
  }
  window.RestogogoRepositoryUtils = Object.freeze({create});
})();
