/* restogogo repository result contract.
 * Domain repositories may keep internal helpers, but every repository boundary
 * result must normalize to this shape before DataAdapter/state-service sees it.
 */
(function(){
  function cleanText(value, fallback=''){
    const text = String(value || '').trim();
    return text || fallback;
  }
  function ok(options={}){
    return Object.freeze({
      ok:true,
      code:cleanText(options.code,'ok'),
      message:cleanText(options.message,''),
      snapshot:options.snapshot || null,
      warnings:Array.isArray(options.warnings) ? options.warnings.slice() : [],
      details:options.details || null
    });
  }
  function fail(message, options={}){
    return Object.freeze({
      ok:false,
      code:cleanText(options.code,'repository_error'),
      message:cleanText(message, 'Save failed.'),
      snapshot:null,
      warnings:Array.isArray(options.warnings) ? options.warnings.slice() : [],
      details:options.details || null
    });
  }
  function fromSaveOutcome(value, fallbackMessage='Save failed.'){
    if(value && typeof value === 'object' && Object.prototype.hasOwnProperty.call(value,'ok')){
      return value.ok ? ok(value) : fail(value.message || fallbackMessage, value);
    }
    if(value === false)return fail(fallbackMessage);
    return ok({details:{rawValue:value}});
  }
  function isOk(value){return fromSaveOutcome(value).ok === true;}
  function message(value, fallback='Save failed.'){
    return cleanText(fromSaveOutcome(value, fallback).message, fallback);
  }
  window.RestogogoRepositoryResult = Object.freeze({ok,fail,fromSaveOutcome,isOk,message});
})();
