/* restogogo owner onboarding state.
 * Persists non-sensitive pending setup intent for email-confirmation/retry flows.
 * Never stores passwords.
 */
(function(){
  function createOwnerOnboardingState({store, key, normalizeOwnerSetupDetails, normalizeEmail}){
    if(!store || !key || typeof normalizeOwnerSetupDetails !== 'function' || typeof normalizeEmail !== 'function'){
      throw new Error('Owner onboarding state requires store, key and normalization helpers.');
    }

    function save(details){
      const normalized = normalizeOwnerSetupDetails(details || {});
      if(!normalized.email || !normalized.restaurantName)return null;
      store.setJSON?.(key, Object.assign({}, normalized, {created_at:new Date().toISOString()}));
      return normalized;
    }

    function read(){return store.getJSON?.(key, null) || null;}
    function clear(){store.remove?.(key);}
    function forEmail(email){
      const pending = read();
      return pending && normalizeEmail(pending.email) === normalizeEmail(email) ? pending : null;
    }

    return Object.freeze({save, read, clear, forEmail});
  }

  window.RestogogoOwnerOnboardingState = Object.freeze({create:createOwnerOnboardingState});
})();
