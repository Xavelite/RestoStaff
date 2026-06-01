(function(){
  const P = window.RestogogoPrimitives;
  const DAYS = P.DAYS.slice();
  const SHIFTS = P.SHIFTS.slice();
  function isPlainObject(value){return P.isPlainObject(value);}
  function cloneData(value){return P.clone(value);}
  function text(value){return P.text(value);}
  function numberValue(value){return P.numberValue(value);}
  function boolValue(value){return P.boolValue(value);}
  function cleanPositionName(value){return P.cleanPositionName(value);}
  function sanitizePin(value=''){return P.sanitizePin(value);}
  function sanitizeWorkspaceId(value){return P.sanitizeWorkspaceId(value);}
  function sanitizeId(value, prefix='item'){return P.sanitizeId(value,prefix);}
  function localISO(d){return P.localISO(d);}
  function parseISO(iso){return P.parseISO(iso);}
  function monday(d=new Date()){return P.monday(d);}
  function validDate(value){return P.validDateUtc(value);}
  function validIso(value){return P.validIso(value);}
  function validClock(value){return P.validClock(value);}
  function validRange(value){return P.validRange(value);}
  function normalizeDay(value){return P.normalizeDay(value);}
  function normalizeShift(value){return P.normalizeShift(value);}
  window.RestogogoSupabaseUtils={DAYS,SHIFTS,isPlainObject,cloneData,text,numberValue,boolValue,cleanPositionName,sanitizePin,sanitizeWorkspaceId,sanitizeId,localISO,parseISO,monday,validDate,validIso,validClock,validRange,normalizeDay,normalizeShift};
})();
