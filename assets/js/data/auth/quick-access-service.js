/* restogogo quick access service.
 * Owns quick login and own-PIN lifecycle orchestration. RPC primitives are injected.
 */
(function(){
  function createQuickAccessService({anonRpc, saveQuickSession, saveAuthSession, saveMemberships, getQuickSession, withQuickSession, defaultWorkspace}){
    const required = {anonRpc, saveQuickSession, saveAuthSession, saveMemberships, getQuickSession, withQuickSession};
    Object.entries(required).forEach(([name, value])=>{if(!value)throw new Error(`Quick access service missing ${name}.`);});

    async function quickLogin(workspaceId, loginName, pin){
      const payload = await anonRpc('quick_login', {
        p_workspace:String(workspaceId || defaultWorkspace || '').trim(),
        p_login_name:String(loginName || '').trim(),
        p_pin:String(pin || '').trim()
      });
      if(!payload?.restaurant?.id)throw new Error('Quick login did not return a workspace.');
      saveQuickSession(payload);
      saveAuthSession(null);
      saveMemberships([payload.membership].filter(Boolean));
      return payload;
    }

    async function changeOwnPin(currentPin, newPin){
      const quick = getQuickSession() || {};
      const body = withQuickSession({
        p_restaurant_id:quick.restaurant?.id || quick.membership?.restaurant_id || null,
        p_employee_id:quick.employee?.id || quick.membership?.employee_id || null,
        p_current_pin:String(currentPin || '').trim(),
        p_new_pin:String(newPin || '').trim()
      });
      if(!body.p_restaurant_id || !body.p_employee_id)throw new Error('Quick session is missing employee context.');
      const result = await anonRpc('change_own_pin', body);
      const current = getQuickSession();
      if(current){
        saveQuickSession(Object.assign({}, current, {
          employee:Object.assign({}, current.employee || {}, {must_change_pin:false}),
          runtime_snapshot:result?.runtime_snapshot || current.runtime_snapshot
        }));
      }
      return result;
    }

    return Object.freeze({quickLogin, changeOwnPin});
  }

  window.RestogogoQuickAccessService = Object.freeze({create:createQuickAccessService});
})();
