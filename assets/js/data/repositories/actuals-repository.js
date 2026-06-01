/* restogogo Actuals repository — actuals lifecycle payloads only. */
(function(){
  function create(context){
    const U = window.RestogogoRepositoryUtils.create(context);
    const {getWorkspaceId,auth,okSnapshot,fail} = U;
    async function saveActuals(source, options={}){
      const actuals = options?.actuals || {};
      const action = String(actuals.action || '').trim().toLowerCase();
      if(!action)return fail('Actuals action is required.', {code:'missing_actuals_action'});
      try{
        const result = await auth()?.saveActualsLifecycle?.({
          p_restaurant_id:getWorkspaceId(),
          p_action:action,
          p_payload:actuals.payload || {}
        });
        return okSnapshot(result?.runtime_snapshot || null, {source:'actuals', action});
      }catch(error){
        return fail(error?.message || String(error || 'Actuals save failed.'), {code:'actuals_save_failed'});
      }
    }
    return Object.freeze({saveActuals});
  }
  window.RestogogoActualsRepository = Object.freeze({create});
})();
