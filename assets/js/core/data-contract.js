/* restogogo data contract constants and shared primitives.
   Wrapped in an IIFE to contain private internals.
   Public API is re-exposed on window below for backward compatibility. */
(function(){
  const DATA_PRIMITIVES = window.RestogogoPrimitives;
  if(!window.APP_CONFIG?.dataContractVersion){
    throw new Error('[data-contract] APP_CONFIG.dataContractVersion is missing. Check config.js is loaded before data-contract.js.');
  }
  const DATA_CONTRACT_VERSION = Number(window.APP_CONFIG.dataContractVersion);
  const ACTUAL_PHOTO_STATUSES = Object.freeze(['captured','denied','unavailable','failed','waived','not_required','missing']);

  function isPlainObject(value){
    return DATA_PRIMITIVES.isPlainObject(value);
  }

  function emptyWeeklyPayload(){
    return {
      availability:{},
      planningSlots:{},
      submitted:{},
      notes:{},
      actualEntries:{},
      status:'Draft',
      actualsStatus:'open',
      updatedAt:null
    };
  }

  function normalizeStatus(value){
    if(value === 'Published')return 'Published';
    if(value === 'Locked' || value === 'locked')return 'Locked';
    if(value !== 'Draft' && value !== undefined && value !== null && value !== ''){
      Restogogo?.warn?.(`[data-contract] unknown status "${value}" — normalising to "Draft"`);
    }
    return 'Draft';
  }

  function normalizeWeekStartKey(value){
    const raw = String(value || '').trim();
    if(!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return '';
    return DATA_PRIMITIVES.monday(raw);
  }

  function normalizeDateString(value){
    return DATA_PRIMITIVES.validDateUtc(value);
  }

  function normalizeIsoStamp(value){
    return DATA_PRIMITIVES.validIso(value);
  }

  function normalizeSlug(value,prefix='item'){
    return DATA_PRIMITIVES.normalizeSlug(value,prefix);
  }

  function normalizeSparseString(value){
    return DATA_PRIMITIVES.normalizeSparseString(value);
  }

  function isValidDayShift(day, shift){
    return days.includes(day) && shifts.includes(shift);
  }

  /* Public API — re-exposed on window so existing callers need no changes */
  window.DATA_CONTRACT_VERSION  = DATA_CONTRACT_VERSION;
  window.ACTUAL_PHOTO_STATUSES  = ACTUAL_PHOTO_STATUSES;
  window.isPlainObject          = isPlainObject;
  window.emptyWeeklyPayload     = emptyWeeklyPayload;
  window.normalizeStatus        = normalizeStatus;
  window.normalizeWeekStartKey  = normalizeWeekStartKey;
  window.normalizeDateString    = normalizeDateString;
  window.normalizeIsoStamp      = normalizeIsoStamp;
  window.normalizeSlug          = normalizeSlug;
  window.normalizeSparseString  = normalizeSparseString;
  window.isValidDayShift        = isValidDayShift;
})();
