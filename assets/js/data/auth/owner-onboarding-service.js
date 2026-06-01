/* restogogo owner onboarding service.
 * Owns owner signup/setup orchestration. Auth-session and RPC primitives are injected.
 */
(function(){
  function createOwnerOnboardingService({
    normalizeOwnerSetupDetails,
    normalizeEmail,
    emailConfirmedSessionMissing,
    signUp,
    setupOwnerWorkspace,
    isAuthenticated,
    currentUser,
    accessToken,
    pendingState
  }){
    const required = {normalizeOwnerSetupDetails, normalizeEmail, emailConfirmedSessionMissing, signUp, setupOwnerWorkspace, isAuthenticated, currentUser, accessToken, pendingState};
    Object.entries(required).forEach(([name, value])=>{if(!value)throw new Error(`Owner onboarding service missing ${name}.`);});

    async function signUpOwnerAndSetup(details){
      const normalized = normalizeOwnerSetupDetails(details || {});
      const email = normalized.email;
      const password = String(details?.password || '');
      if(isAuthenticated() && normalizeEmail(currentUser()?.email) === email){
        const result = await setupOwnerWorkspace(normalized);
        pendingState.clear();
        return result;
      }
      let payload;
      try{
        payload = await signUp(email, password, {
          first_name:normalized.firstName,
          last_name:normalized.lastName,
          restaurant_name:normalized.restaurantName
        });
      }catch(error){
        if(pendingState.forEmail(email)){
          throw new Error('This setup is waiting for email confirmation. Sign in with the same email to finish restaurant setup.');
        }
        throw error;
      }
      if(emailConfirmedSessionMissing(payload) || !accessToken()){
        pendingState.save(normalized);
        const error = new Error('Account created. Confirm your email, then sign in with the same email to finish restaurant setup.');
        error.code = 'email_confirmation_required';
        throw error;
      }
      try{
        const result = await setupOwnerWorkspace(normalized);
        pendingState.clear();
        return result;
      }catch(error){
        pendingState.save(normalized);
        throw error;
      }
    }

    return Object.freeze({signUpOwnerAndSetup});
  }

  window.RestogogoOwnerOnboardingService = Object.freeze({create:createOwnerOnboardingService});
})();
